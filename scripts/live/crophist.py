# crophist.py LAT LON COUNTRY NEAR [RING]: what this field grew, year by year, read from the national 30 m crop maps at up to
#          nine points inside the field; with NEAR 1 also, as counts only, what the farm fields around it grew after each crop.
# Reads:   COUNTRY US: USDA NASS Cropland Data Layer on USDA's CroplandCROS image service (pdi.scinet.usda.gov, no login):
#          one identify per point with returnCatalogItems=true, which gives every year's class at that point in one answer
#          (2008 to the newest year are used: the map covers all 48 lower states from 2008).
#          COUNTRY CA: Agriculture and Agri-Food Canada's Annual Crop Inventory (agriculture.canada.ca, no login): the list of
#          years, then one getSamples per year (2011 to the newest) with one multipoint of the field's points.
#          NEAR 1: one getSamples per year for the newest 9 years with a multipoint grid of points 170 m apart within 3 km of
#          LAT LON, the field's own points and everything inside the field left out (US: each year's raster locked, by the
#          raster id identify's catalogue items name).
# Edges:   field points closer than one map square (30 m) to a point already kept are left out, so a tiny field is "too small"
#          rather than one square counted nine times; a year with no value at any point is left out and named in not_read.
# RING:    the field's outline, corners written lon,lat;lon,lat;... (3 to 200 corners). Without it the field is the pin.
# Returns: {"ok": true, "source", "data_date", "units", "country", "where": "outline"|"pin", "points", "points_read",
#           "spots": [[lat, lon]], "field": [{"year", "crop", "agree", "code", "name", "mixed", "unread", "classes"}] newest
#           first, "years": {"first", "last"}, "not_read": [years], "near"?: {...}, "near_reason"?, "incomplete"?, "licence"}
#          or {"ok": false, "reason", ("final")}. crop is a crops.js id, or null when no crop has more than half the points
#          (mixed) or when the class most points show is not one crop (code and name then say which class it is).
#          Nothing is decided here: js/fieldyears.js finds the turn and the "after corn" shares from these counts.
# Map:     cropsnear_map.json (class -> crops.js id), read through cropsnear.table(): the same table as the crop-map lookup.
# Keeps:   nothing. The server keeps answers; this lookup keeps no file.
# Checked by: node scripts/test_crophist.mjs (offline, on answers recorded from the live services on 2026-11-15).
import common   # first, always: it takes stdout away from every library
import json
import math
import re
import urllib.parse
from common import Fail, SourceDown
from cropsnear import ACI, CDL, WHO, table   # the same services, words and class table as the crop-map lookup

LIMIT_S = 120     # the server's time limit for this lookup
ONE_S = 30        # one request; measured on 2026-11-15: identify about 0.5 s, getSamples of 973 points about 0.6 s
US_FIRST, CA_FIRST = 2008, 2011   # the first year each map covers the whole farmed country (USDA all 48 lower states; AAFC all provinces)
PIN_STEP_M = 60   # with a pin only: the pin and 8 points 60 m around it
SQUARE_M = 30     # the map's square: two field points closer than this may read one square twice, so the later one is left out
NEAR_KM, NEAR_STEP_M, NEAR_YEARS = 3, 170, 9   # neighbours: a 170 m grid within 3 km, the newest 9 years (8 pairs)
NEAR_SPARE_S = 5   # seconds kept back at the end for the answer itself
NEAR_PIN_M = 90   # with a pin only, grid points this close to the pin are the field's own (its 9 points lie within 85 m)
MAX_SAMPLES = 1000   # the image services' own limit of samples per request
MAX_CORNERS = 200
M_LAT = 110574.0  # metres in one degree of latitude; one degree of longitude is 111320 cos(lat)
LICENCE = {"US": "public domain (USDA NASS)", "CA": "Open Government Licence - Canada"}


# ---- the arguments
def ring_of(text):
    """The outline as [(lon, lat)], or None. Refused when it is not 3 to 200 plain corners."""
    s = (text or "").strip()
    if not s:
        return None
    corners = []
    for part in s.split(";"):
        xy = part.split(",")
        if len(xy) != 2 or not all(re.fullmatch(r"[+-]?(\d+\.?\d*|\.\d+)", v.strip()) for v in xy):
            raise Fail("The field's outline must be 3 to 200 corners written lon,lat;lon,lat")
        lon, lat = float(xy[0]), float(xy[1])
        if abs(lon) > 180 or abs(lat) > 84:
            raise Fail("The field's outline must be 3 to 200 corners written lon,lat;lon,lat")
        corners.append((lon, lat))
    if len(corners) > 1 and corners[0] == corners[-1]:
        corners = corners[:-1]   # a closed ring repeats its first corner
    if not 3 <= len(corners) <= MAX_CORNERS:
        raise Fail("The field's outline must be 3 to 200 corners written lon,lat;lon,lat")
    return corners


def inside(lon, lat, ring):
    """Is the point inside the outline (even-odd rule)."""
    hit = False
    j = len(ring) - 1
    for i in range(len(ring)):
        (xi, yi), (xj, yj) = ring[i], ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def apart_m(p, q):
    """Metres between two (lat, lon) points close to each other."""
    return math.hypot((p[0] - q[0]) * M_LAT, (p[1] - q[1]) * 111320.0 * math.cos(math.radians(p[0])))


def field_points(lat, lon, ring):
    """R1. The points read for the field, as [(lat, lon)] rounded to 6 decimals.
    Outline: a 3 x 3 grid over the outline's box at 1/6, 1/2 and 5/6 of each side, kept when inside the outline and at least
    one map square (30 m) from every point kept before it.
    Pin: the pin and 8 points 60 m around it."""
    if ring:
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        w, e, s, n = min(xs), max(xs), min(ys), max(ys)
        grid = [(s + (n - s) * fy, w + (e - w) * fx) for fy in (5 / 6, 1 / 2, 1 / 6) for fx in (1 / 6, 1 / 2, 5 / 6)]   # north row first, west to east
        kept = []
        for y, x in grid:   # a field smaller than a few squares: one square is never counted as several points
            if inside(x, y, ring) and all(apart_m((y, x), q) >= SQUARE_M for q in kept):
                kept.append((y, x))
        return [(round(y, 6), round(x, 6)) for y, x in kept]
    dlat, dlon = PIN_STEP_M / M_LAT, PIN_STEP_M / (111320.0 * math.cos(math.radians(lat)))
    return [(round(lat + dy * dlat, 6), round(lon + dx * dlon, 6)) for dy in (1, 0, -1) for dx in (-1, 0, 1)]


def near_points(lat, lon, ring):
    """The neighbours' grid: points 170 m apart within 3 km of the field centre, never one inside the field
    (with a pin only: never one within 90 m of the pin). As [(lat, lon)] rounded to 5 decimals."""
    m_lon = 111320.0 * math.cos(math.radians(lat))
    k = int(NEAR_KM * 1000 // NEAR_STEP_M)
    out = []
    for i in range(k, -k - 1, -1):
        for j in range(-k, k + 1):
            dy, dx = i * NEAR_STEP_M, j * NEAR_STEP_M
            if dy * dy + dx * dx > (NEAR_KM * 1000) ** 2:
                continue
            y, x = lat + dy / M_LAT, lon + dx / m_lon
            if ring and inside(x, y, ring):
                continue
            if not ring and dy * dy + dx * dx <= NEAR_PIN_M ** 2:
                continue
            out.append((round(y, 5), round(x, 5)))
    return out


# ---- the services
def asked(who, call):
    """One request through common.http in the crop-map lookup's own words for a service that is down or busy."""
    try:
        return call()
    except SourceDown as e:
        if e.kind == "busy":
            raise Fail("%s asked us to slow down; try again in a few minutes" % who) from None
        raise Fail("%s did not answer just now; try again in a minute" % who) from None


def value_of(v):
    """A class value as the map sent it: a whole number, or None when the pixel has no value."""
    s = str(v).strip() if v is not None else ""
    return int(s) if re.fullmatch(r"\d{1,4}", s) else None


def identify(lat, lon):
    """US: every year's class at one point: {year: (value, raster id, raster name)}, one call."""
    q = {
        "geometry": json.dumps({"x": lon, "y": lat, "spatialReference": {"wkid": 4326}}, separators=(",", ":")),
        "geometryType": "esriGeometryPoint", "returnCatalogItems": "true", "returnGeometry": "false", "f": "json",
    }
    got = common.http(CDL + "/identify?" + urllib.parse.urlencode(q), timeout=ONE_S).json()
    values = ((got.get("properties") or {}).get("Values") if isinstance(got, dict) else None)
    items = ((got.get("catalogItems") or {}).get("features") if isinstance(got, dict) else None)
    if isinstance(got, dict) and isinstance(items, list) and not items and not values and got.get("value") == "NoData" and "error" not in got:
        return {}   # no year of the map covers this point (Hawaii, Alaska, outside the US): a reading of nothing, not a service down
    if not isinstance(values, list) or not isinstance(items, list) or len(values) != len(items) or not items:
        raise SourceDown("identify sent no year list", "http", 200)
    years = {}
    for value, item in zip(values, items):
        a = (item or {}).get("attributes") or {}
        year, raster, name = a.get("Year"), a.get("OBJECTID"), str(a.get("Name", ""))
        if isinstance(year, int) and isinstance(raster, int) and re.fullmatch(r"%d_\d+m_cdls" % year, name) and year not in years:
            years[year] = (value_of(value), raster, name)   # the first raster of a year, as the service lists them, newest first
    return years


def samples(url, pts, mosaic=None, timeout=ONE_S):
    """getSamples with one multipoint: the class value at each point, in the points' order (None: no value)."""
    if len(pts) > MAX_SAMPLES:
        raise Fail("Too many points for one request to the crop map")
    form = {
        "geometry": json.dumps({"points": [[x, y] for y, x in pts], "spatialReference": {"wkid": 4326}}, separators=(",", ":")),
        "geometryType": "esriGeometryMultipoint", "returnFirstValueOnly": "true", "f": "json",
    }
    if mosaic is not None:
        form["mosaicRule"] = json.dumps(mosaic, separators=(",", ":"))
    got = common.http(url + "/getSamples", data=urllib.parse.urlencode(form).encode("ascii"),
                      headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=timeout).json()
    rows = got.get("samples") if isinstance(got, dict) else None
    if not isinstance(rows, list):
        raise SourceDown("getSamples sent no samples", "http", 200)
    out = [None] * len(pts)
    for r in rows:
        i = r.get("locationId") if isinstance(r, dict) else None
        if isinstance(i, int) and 0 <= i < len(pts):
            out[i] = value_of(r.get("value"))
    return out


def aci_years():
    """Every year the inventory publishes from CA_FIRST on, from its own list of services."""
    listing = asked(WHO["CA"], lambda: common.http(ACI + "?f=json", timeout=ONE_S).json())
    years = sorted({int(m.group(1)) for s in (listing.get("services") or []) if isinstance(s, dict) and s.get("type") == "ImageServer"
                    for m in [re.fullmatch(r"annual_crop_inventory/(\d{4})", str(s.get("name", "")))] if m and int(m.group(1)) >= CA_FIRST})
    if not years:
        raise Fail("%s did not list any year of its map; try again later" % WHO["CA"])
    return years


# ---- reading the field
def read_us(pts):
    """{year: [value per point]}, the rasters {year: id}, and how many points did not answer."""
    done = common.each(pts, lambda p: identify(p[0], p[1]))
    busy = [e for _, _, e in done if isinstance(e, SourceDown) and e.kind == "busy"]
    good = [r for _, r, e in done if e is None]
    if not good:
        raise Fail(("%s asked us to slow down; try again in a few minutes" if busy else "%s did not answer just now; try again in a minute") % WHO["US"])
    years = sorted({y for r in good for y in r if y >= US_FIRST}, reverse=True)
    rasters = {}
    for r in good:
        for y, (_, raster, name) in r.items():
            rasters.setdefault(y, (raster, name))
    by_year = {y: [(r.get(y) or (None,))[0] if e is None else None for _, r, e in done] for y in years}
    return by_year, rasters, len(pts) - len(good), {}


def read_ca(pts, years):
    """{year: [value per point]} for the years that answered, and {year: why} for those that did not."""
    done = common.each(years, lambda y: samples("%s/%d/ImageServer" % (ACI, y), pts))
    by_year = {y: r for y, r, e in done if e is None}
    missed = {y: e for y, _, e in done if e is not None}
    if not by_year:
        busy = any(isinstance(e, SourceDown) and e.kind == "busy" for e in missed.values())
        raise Fail(("%s asked us to slow down; try again in a few minutes" if busy else "%s did not answer just now; try again in a minute") % WHO["CA"])
    return by_year, missed


def key_of(v, the_map):
    """What one point shows in one year: a crops.js id when its class is one crop alone, else 'class:<code>', None unread."""
    if v is None or v in the_map["noread_set"]:
        return None
    ids = (the_map["own"].get(str(v)) or [None, []])[1]
    return ids[0] if len(ids) == 1 else "class:%d" % v


def year_of(year, values, the_map, names):
    """R2. The year's crop: the one that more than half of the points show; otherwise null (mixed)."""
    keys = [key_of(v, the_map) for v in values]
    counts = {}
    for k in keys:
        if k is not None:
            counts[k] = counts.get(k, 0) + 1
    top, agree = None, 0
    for k, c in counts.items():   # the most points; a tie has no majority anyway
        if c > agree:
            top, agree = k, c
    major = agree * 2 > len(values)
    code = next((v for v, k in zip(values, keys) if k == top), None) if top else None
    return {
        "year": year,
        "crop": top if major and not top.startswith("class:") else None,
        "agree": agree,
        "code": code if major else None,
        "name": names.get(str(code)) if major and code is not None else None,
        "mixed": not major,
        "unread": sum(1 for k in keys if k is None),
        "classes": values,
    }


# ---- the neighbours
def read_near(lat, lon, ring, field_pts, country, years, rasters, the_map):
    """R4's counts: over every pair of years (Y, Y+1) both read, at every grid point: farm class in Y+1 after each crop in Y."""
    grid = near_points(lat, lon, ring)
    own = set((round(y, 5), round(x, 5)) for y, x in field_pts)
    grid = [p for p in grid if p not in own]
    newest = sorted(years, reverse=True)[:NEAR_YEARS]

    def work(y):   # the field is read already: a slow neighbour read may cost the counts, never the field's own answer
        t = ONE_S if common.left() is None else min(ONE_S, (common.left() - NEAR_SPARE_S) / 2.2)   # two tries and the pause between them
        if t < 3:
            raise SourceDown("no time left for the fields around", "timeout")
        if country == "US":
            return samples(CDL, grid, {"mosaicMethod": "esriMosaicLockRaster", "lockRasterIds": [rasters[y][0]]}, timeout=t)
        return samples("%s/%d/ImageServer" % (ACI, y), grid, timeout=t)
    done = common.each(newest, work)
    got = {y: r for y, r, e in done if e is None}
    missed = sorted(y for y, _, e in done if e is not None)
    farm = set(the_map["cropland"])
    after, pairs = {}, 0
    for y in sorted(got):
        if y + 1 not in got:
            continue
        pairs += 1
        for a, b in zip(got[y], got[y + 1]):
            ka, kb = key_of(a, the_map), key_of(b, the_map)
            if ka is None or ka.startswith("class:") or b not in farm or kb is None:
                continue   # the pair counts only when year Y is one crop and year Y+1 is farmland that was read
            row = after.setdefault(ka, {"n": 0})
            nxt = kb if not kb.startswith("class:") else "other"
            row[nxt] = row.get(nxt, 0) + 1
            row["n"] += 1
    if not pairs:
        return None, "The fields around this one could not be read on the crop map just now", missed
    near = {"radius_km": NEAR_KM, "step_m": NEAR_STEP_M, "grid_points": len(grid), "years": {"first": min(got), "last": max(got)},
            "pairs": pairs, "after": {k: dict(sorted(v.items(), key=lambda kv: (kv[0] == "n", kv[0] == "other", -kv[1], kv[0]))) for k, v in sorted(after.items())}}
    if missed:
        near["not_read"] = missed
    return near, None, missed


def main(args):
    lat, lon = common.latlon(args, max_lat=84)
    country = (args[2] if len(args) > 2 else "").strip().upper()
    if country not in WHO:
        raise Fail("Crop maps by year are read for Canada and the United States only", final=True)
    near_on = (args[3] if len(args) > 3 else "0").strip()
    if near_on not in ("0", "1"):
        raise Fail("near must be 0 or 1")
    ring = ring_of(args[4] if len(args) > 4 else "")
    pts = field_points(lat, lon, ring)
    if len(pts) < 3:
        raise Fail("This field is too small to read by year on the 30 m crop map (fewer than 3 points 30 m apart fit inside it)", final=True)
    the_map = dict(table("cropsnear_map.json")["aci" if country == "CA" else "cdl"])
    the_map["noread_set"] = set(the_map["noread"])
    names = table("aci_classes.json" if country == "CA" else "cdl_codes.json")

    if country == "US":
        by_year, rasters, lost_points, missed = read_us(pts)
        listed = sorted(by_year)
    else:
        listed = aci_years()
        by_year, missed = read_ca(pts, listed)
        rasters = {}
        lost_points = 0
    if not any(v is not None and v not in the_map["noread_set"] for vals in by_year.values() for v in vals):
        raise Fail("%s has no reading for this place" % WHO[country], final=True)
    empty = [y for y, vals in by_year.items() if all(v is None or v in the_map["noread_set"] for v in vals)]
    by_year = {y: vals for y, vals in by_year.items() if y not in empty}   # a year with no value at any point was not read: named, never shown as "mixed"
    field = [year_of(y, by_year[y], the_map, names) for y in sorted(by_year, reverse=True)]
    first, last = min(by_year), max(by_year)
    not_read = sorted(set(missed) | set(empty))
    notes = []
    if missed:   # only a year the service did not answer makes the answer partial: a year with no value anywhere stays so
        notes.append(", ".join("%d not read" % y for y in sorted(missed)))
    if lost_points:
        notes.append("%d of %d points not read" % (lost_points, len(pts)))
    if country == "US":
        source = "USDA NASS Cropland Data Layer %d to %d, through USDA's CroplandCROS image service" % (first, last)
        note = "One map a year, made after each harvest from satellite images; %d is the newest year it has published; read from %d on, the first year it covers all 48 lower states" % (last, US_FIRST)
    else:
        source = "Agriculture and Agri-Food Canada (AAFC), Annual Crop Inventory %d to %d, 30 m" % (first, last)
        note = "One map a year, made after each harvest from satellite images; %d is the newest year it has published; read from %d on, the first year it covers every province" % (last, CA_FIRST)
    out = {
        "source": source, "data_date": "%d/%d" % (first, last), "data_date_note": note,
        "units": "crop: a crops.js id; agree and unread: how many of the field's points; classes: the map's class value at each point, in the order of spots (null: no value)",
        "country": country, "where": "outline" if ring else "pin", "points": len(pts), "points_read": len(pts) - lost_points,
        "spots": [[y, x] for y, x in pts], "field": field, "years": {"first": first, "last": last}, "not_read": not_read,
        "licence": LICENCE[country],
    }
    if near_on == "1":
        near, why, near_missed = read_near(lat, lon, ring, pts, country, list(by_year), rasters, the_map)
        if near:
            out["near"] = near
            if near_missed:
                notes.append("around the field %s" % ", ".join("%d not read" % y for y in near_missed))
        else:
            out["near_reason"] = why
            notes.append("the fields around this one not read")
    if notes:
        out["incomplete"] = "; ".join(notes)
    return out


if __name__ == "__main__":
    common.run(main, LIMIT_S, slow="The crop map took too long to answer; try again in a minute")
