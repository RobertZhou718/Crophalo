# hlsbox.py LAT LON RING (RING: the field's outline as lon,lat pairs joined by ";"): how green each 30 m square inside the field looked, pass after pass, May to September of the last two full years (written 2026-11-15).
# Reads:   NASA's catalogue (CMR) for the HLS v2.0 granules over the field (through hlsndvi.candidates); then, for the candidates, the window of 30 m squares over the outline of three small layers
#          (the Fmask flags, the red band, the near-infrared band) as range reads of the GeoTIFF files, never a whole file. The catalogue is open; the files need the NASA Earthdata login.
# From:    NASA / USGS HLS v2.0 surface reflectance, 30 m, from NASA's Land Processes DAAC (the same files and the same cloud, snow and water rules as hlsndvi.py, whose helpers this imports).
# Returns: {"ok": true, "source", "data_date", "units", "pixel_m", "window", "cells": [{"id", "corners", "lat", "lon", "inside"}], "cells_inside", "passes": [{"date", "sensor", "ndvi": [...], "clear_share", "tile", "granule"}] oldest first,
#          "periods", "periods_read", "left_out": [{"period", "why"}], "not_usable", "read_errors", "incomplete", "note", "why_none"?} or {"ok": false, "reason"}.
#          ndvi[k] belongs to cells[k]; null is cloud, cloud shadow, snow, water or no value, NEVER 0. "inside" is true only when all four corners of the square lie inside the outline.
#          The contract: the spec "Weak spots in this field" (package 2A) and its report.
# Keeps:   nothing. The server keeps answers; this lookup keeps no file.
# Checked by: scripts/test_live_hlsbox.mjs (offline: the catalogue, the token and small GeoTIFFs built the real way) and scripts/live_check_hlsbox.mjs (by hand, live).
import common   # first, always
import datetime
import math
import re
from collections import Counter
from common import Fail, SourceDown

_run, common.run = common.run, (lambda *a, **k: None)   # hlsndvi.py answers as soon as it is run; imported here it must only lend its helpers
try:
    import hlsndvi
finally:
    common.run = _run

LIMIT_S = 150
SPARE_S = hlsndvi.SPARE_S     # stop starting new periods when fewer seconds than this are left
TRIES = hlsndvi.TRIES         # candidates looked at in a period before giving up on it
PERIOD_DAYS = hlsndvi.PERIOD_DAYS
PER_SEASON = 10               # May 1 to September 30 in 15-day periods; the last one takes the 18 days to the end of September
SEASONS = 2                   # the last two full years
PIXEL_M = 30
MAX_CORNERS = 200
MAX_SIDE_M = 2000             # the outline's box, each side
MIN_INSIDE = 30               # fewer whole squares inside than this cannot show a part of the field
MIN_CLEAR = 0.6               # a pass is kept only when this share of the inside squares is clear: the page drops any other (rule R2)
TOO_BIG = "This field is too big for one look (over 2 km across). Split it to look for weak spots."
TOO_SMALL = "This field is too small for 30 m squares (under 30 squares)."
UNITS = ("NDVI (greenness) of each 30 m square from its red and near-infrared surface reflectance, 0 is bare ground or dead plants and about 0.8 is thick healthy green; "
         "corners, lat and lon in decimal degrees; clear_share is the share of the inside squares that were clear on that pass")


def ring_of(text):
    """[(lon, lat), ...] from "lon,lat;lon,lat;...": 3 to 200 corners, closed or not. Refused in plain words otherwise."""
    words = "The field's outline must be 3 to %d corners written lon,lat and joined by ;" % MAX_CORNERS
    pairs = [p for p in str(text or "").split(";") if p.strip()]
    ring = []
    for p in pairs:
        xy = p.split(",")
        if len(xy) != 2:
            raise Fail(words)
        ring.append((common.number(xy[0], "Each corner's lon", -180, 180), common.number(xy[1], "Each corner's lat", -84, 84)))
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring.pop()   # a closed outline repeats its first corner
    if not 3 <= len(set(ring)) or len(ring) > MAX_CORNERS:
        raise Fail(words)
    return ring


def side_m(ring):
    """(east-west, north-south) size of the outline's box in metres, on the sphere's local scale: enough to refuse a box over 2 km."""
    lons, lats = [p[0] for p in ring], [p[1] for p in ring]
    mid = math.radians((min(lats) + max(lats)) / 2)
    return (max(lons) - min(lons)) * 111320 * math.cos(mid), (max(lats) - min(lats)) * 110574


def seasons_of(today):
    """[(May 1, September 30)] of the last two full years, the older first. Pure."""
    return [(datetime.date(y, 5, 1), datetime.date(y, 9, 30)) for y in range(today.year - SEASONS, today.year)]


def span_of(seasons, index):
    """The first and last day of period `index` (0 .. 19) as ISO days."""
    first, last = seasons[index // PER_SEASON]
    k = index % PER_SEASON
    start = first + datetime.timedelta(days=k * PERIOD_DAYS)
    end = last if k == PER_SEASON - 1 else start + datetime.timedelta(days=PERIOD_DAYS - 1)
    return [start.isoformat(), end.isoformat()]


def utm_of_tile(tile):
    """EPSG code of an HLS tile's own map (its UTM zone, north or south of the equator by the latitude band), e.g. T14TPL -> 32614."""
    m = re.fullmatch(r"T(\d{2})([C-X])[A-Z]{2}", tile)
    return (32600 if m.group(2) >= "N" else 32700) + int(m.group(1)) if m else None


def utm_at(lat, lon):
    return (32600 if lat >= 0 else 32700) + min(60, int((lon + 180) // 6) + 1)


def inside_ring(x, y, poly):
    """Is (x, y) inside the polygon (even-odd rule)? Pure."""
    hit, j = False, len(poly) - 1
    for i in range(len(poly)):
        (xi, yi), (xj, yj) = poly[i], poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def grid_of(ring, epsg):
    """The 30 m squares over the outline in the HLS tile's own map (the files' squares start at whole multiples of 30 m): every square that has a corner or its centre
    inside the outline, with "inside" true only when all four corners are. Worked out here, so the page never changes map projections."""
    from rasterio.warp import transform
    crs = "EPSG:%d" % epsg
    xs, ys = transform("EPSG:4326", crs, [p[0] for p in ring], [p[1] for p in ring])
    poly = list(zip(xs, ys))
    x0, x1 = math.floor(min(xs) / PIXEL_M) * PIXEL_M, math.ceil(max(xs) / PIXEL_M) * PIXEL_M
    y0, y1 = math.floor(min(ys) / PIXEL_M) * PIXEL_M, math.ceil(max(ys) / PIXEL_M) * PIXEL_M
    cols, rows = int(round((x1 - x0) / PIXEL_M)), int(round((y1 - y0) / PIXEL_M))
    at = [[inside_ring(x0 + PIXEL_M * i, y1 - PIXEL_M * j, poly) for i in range(cols + 1)] for j in range(rows + 1)]
    keep = []
    for r in range(rows):
        for c in range(cols):
            corners = (at[r][c], at[r][c + 1], at[r + 1][c + 1], at[r + 1][c])
            if any(corners) or inside_ring(x0 + PIXEL_M * c + PIXEL_M / 2, y1 - PIXEL_M * r - PIXEL_M / 2, poly):
                keep.append((r, c, all(corners)))
    px = [x0 + PIXEL_M * i for j in range(rows + 1) for i in range(cols + 1)]
    py = [y1 - PIXEL_M * j for j in range(rows + 1) for i in range(cols + 1)]
    cx = [x0 + PIXEL_M * c + PIXEL_M / 2 for r, c, _ in keep]
    cy = [y1 - PIXEL_M * r - PIXEL_M / 2 for r, c, _ in keep]
    lon, lat = transform(crs, "EPSG:4326", px + cx, py + cy)
    point = lambda j, i: [round(lat[j * (cols + 1) + i], 6), round(lon[j * (cols + 1) + i], 6)]
    n = (rows + 1) * (cols + 1)
    cells = [{"id": k, "corners": [point(r, c), point(r, c + 1), point(r + 1, c + 1), point(r + 1, c)], "lat": round(lat[n + k], 6), "lon": round(lon[n + k], 6), "inside": inside}
             for k, (r, c, inside) in enumerate(keep)]
    return {"epsg": epsg, "x0": x0, "y1": y1, "cols": cols, "rows": rows, "index": [r * cols + c for r, c, _ in keep],
            "inside": [k for k, (_, _, inside) in enumerate(keep) if inside], "cells": cells}


def read_box(url, grid, options):
    """The grid's window of one remote HLS GeoTIFF, as stored: (values in the grid's order, NaN where the file says no value or the window leaves it, scale),
    "grid" when the file is not on the grid's 30 m squares (another UTM zone), None when the window lies wholly outside it. A file that cannot be read raises
    SourceDown, with NASA's HTTP status when the raster library names one (401 or 403: the login is not allowed to read the files)."""
    import numpy as np
    import rasterio
    from rasterio._err import CPLE_BaseError
    from rasterio.errors import RasterioError
    from rasterio.windows import Window
    import urllib.parse
    try:
        with common._Gate(urllib.parse.urlsplit(url).netloc.lower()), rasterio.Env(**options), rasterio.open(common.raster_path(url)) as ds:
            common._count()
            t = ds.transform
            if ds.crs is None or ds.crs.to_epsg() != grid["epsg"] or (t.a, t.b, t.d, t.e) != (30.0, 0.0, 0.0, -30.0) or t.c % PIXEL_M or t.f % PIXEL_M:
                return "grid"
            col0, row0 = int(round((grid["x0"] - t.c) / PIXEL_M)), int(round((t.f - grid["y1"]) / PIXEL_M))
            if col0 + grid["cols"] <= 0 or row0 + grid["rows"] <= 0 or col0 >= ds.width or row0 >= ds.height:
                return None
            got = ds.read(1, window=Window(col0, row0, grid["cols"], grid["rows"]), boundless=True, masked=True)
            flat = np.ma.filled(got.astype("float64"), np.nan).ravel()
            return [float(flat[i]) for i in grid["index"]], (ds.scales[0] or hlsndvi.SCALE_FALLBACK)
    except (RasterioError, CPLE_BaseError) as e:   # the raster library's own words can hold the whole address: only its kind and status go on
        code = re.search(r"HTTP response code: (\d{3})", str(e))
        status = int(code.group(1)) if code else None
        common.log("raster read failed:", type(e).__name__, status or "", "at", common._where(url))
        raise SourceDown("%s could not be read (%s)" % (common._where(url), type(e).__name__), "http" if status else "network", status) from None


def greenness(red, nir, rs, ns):
    """NDVI of one square, or None: the same limits as hlsndvi.py (no value, a reflectance or a greenness that cannot be real)."""
    if red != red or nir != nir or red <= -9000 or nir <= -9000:   # -9999 is the file's own "no value"
        return None
    r, n = red * rs, nir * ns
    if r < 0 or n < 0 or r > 1.6 or n > 1.6 or r + n <= 0:
        return None
    v = (n - r) / (n + r)
    return round(v, 3) if -0.2 <= v <= 1.0 else None


def read_candidate(c, grid, options):
    """One pass: {"status": "reading", ...} or {"status": "not_usable", "why": ...}. Raises SourceDown when NASA did not answer."""
    _, cloud, when, sensor, tile, title, files = c
    need = math.ceil(MIN_CLEAR * len(grid["inside"]))
    flags = read_box(files["Fmask"], grid, options)
    if flags is None or flags == "grid":
        return {"status": "not_usable", "why": "outside" if flags is None else "other_grid"}
    clear, _ = hlsndvi.clear_box(flags[0])
    inside_clear, why = hlsndvi.clear_box([flags[0][k] for k in grid["inside"]])
    if sum(inside_clear) < need:
        return {"status": "not_usable", "why": max(why, key=why.get) if any(why.values()) else "cloud"}
    red, nir = read_box(files["B04"], grid, options), read_box(files["NIR"], grid, options)
    if red is None or nir is None or red == "grid" or nir == "grid":
        return {"status": "not_usable", "why": "outside" if red is None or nir is None else "other_grid"}
    ndvi = [greenness(red[0][k], nir[0][k], red[1], nir[1]) if ok else None for k, ok in enumerate(clear)]
    seen = sum(1 for k in grid["inside"] if ndvi[k] is not None)
    if seen < need:
        return {"status": "not_usable", "why": "cloud"}
    return {"status": "reading", "date": when, "sensor": sensor, "ndvi": ndvi, "clear_share": round(seen / len(grid["inside"]), 2), "tile": tile, "granule": title, "cloud": cloud}


def read_period(job):
    """The clearest pass of one period: the first candidate, by the tile's cloud cover, that is clear over 60 % of the inside squares."""
    index, cands, grid, options = job
    seen = {"cloud": 0, "snow": 0, "water": 0, "outside": 0, "other_grid": 0}
    errors = looked = 0
    for c in sorted(cands, key=lambda c: (c[1], c[2]))[:TRIES]:
        if common.left() is not None and common.left() < SPARE_S:
            return {"index": index, "skipped": True, "errors": errors}
        try:
            got = read_candidate(c, grid, options)
        except SourceDown as e:
            if getattr(e, "status", 0) in (401, 403):
                raise
            errors += 1
            continue
        looked += 1
        if got["status"] == "reading":
            return {"index": index, "reading": got, "seen": seen, "errors": errors, "looked": looked}
        seen[got["why"]] += 1
    return {"index": index, "reading": None, "seen": seen, "errors": errors, "looked": looked}


def main(args):
    lat, lon = common.latlon(args, max_lat=84)
    if len(args) != 3:
        raise Fail("lat, lon and the field's outline are required (the outline as lon,lat pairs joined by ;)")
    ring = ring_of(args[2])
    lons, lats = [p[0] for p in ring], [p[1] for p in ring]
    if not (min(lats) - 0.001 <= lat <= max(lats) + 0.001 and min(lons) - 0.001 <= lon <= max(lons) + 0.001):
        raise Fail("lat and lon must lie inside the box of the field's outline")
    if max(side_m(ring)) > MAX_SIDE_M:
        raise Fail(TOO_BIG, final=True)
    grid = grid_of(ring, utm_at(lat, lon))
    if len(grid["inside"]) < MIN_INSIDE:
        raise Fail(TOO_SMALL, final=True)
    seasons = seasons_of(common.now().date())
    found = []
    for s, (first, last) in enumerate(seasons):
        found += [(s * PER_SEASON + min(c[0], PER_SEASON - 1),) + tuple(c[1:]) for c in hlsndvi.candidates(first, last, lat, lon)]
    if not found:
        raise Fail("NASA's catalogue lists no Landsat or Sentinel-2 surface-reflectance pass over this field from May to September of %d and %d" % (seasons[0][0].year, seasons[-1][0].year))
    zones = Counter(utm_of_tile(c[4]) for c in found if utm_of_tile(c[4]))
    epsg = sorted(zones.items(), key=lambda z: (-z[1], z[0] != grid["epsg"], z[0]))[0][0] if zones else grid["epsg"]   # the map most passes are on
    if epsg != grid["epsg"]:
        grid = grid_of(ring, epsg)
        if len(grid["inside"]) < MIN_INSIDE:
            raise Fail(TOO_SMALL, final=True)
    options = common.earthdata_gdal()
    periods = {}
    for c in found:
        periods.setdefault(c[0], []).append(c)
    jobs = [(i, periods[i], grid, options) for i in sorted(periods, reverse=True)]   # the newest period first
    done = common.each(jobs, read_period, 2)
    hard = [e for _, _, e in done if isinstance(e, (SourceDown, Fail)) and getattr(e, "kind", "") != "timeout"]
    if hard and len(hard) == len(done):
        if all(getattr(e, "status", 0) in (401, 403) for e in hard):
            raise Fail(hlsndvi.NO_RIGHTS)
        raise Fail("NASA's satellite greenness files could not be read just now; try again in a minute")
    readings, left_out, errors = [], [], 0
    why = {"cloud": 0, "snow": 0, "water": 0, "outside": 0, "other_grid": 0}
    by_index = {job[0]: (result, e) for job, result, e in done}
    for index in range(len(seasons) * PER_SEASON):
        span = span_of(seasons, index)
        if index not in by_index:
            left_out.append({"period": span, "why": "no_pass"})
            continue
        result, e = by_index[index]
        if e is not None:
            timeout = getattr(e, "kind", "") == "timeout"
            errors += 0 if timeout else 1
            left_out.append({"period": span, "why": "no_time" if timeout else "not_read"})
            continue
        errors += result.get("errors", 0)
        if result.get("skipped"):
            left_out.append({"period": span, "why": "no_time"})
            continue
        for k, n in result["seen"].items():
            why[k] += n
        if result["reading"]:
            readings.append(result["reading"])
        elif not result["looked"]:
            left_out.append({"period": span, "why": "not_read"})
        else:
            left_out.append({"period": span, "why": max(result["seen"], key=result["seen"].get)})
    if not readings and errors and not any(r and r.get("looked") for r, e in by_index.values()):
        raise Fail("NASA's satellite greenness files could not be read just now; try again in a minute")
    readings.sort(key=lambda r: r["date"])
    passes = [{"date": r["date"], "sensor": r["sensor"], "ndvi": r["ndvi"], "clear_share": r["clear_share"], "tile": r["tile"], "granule": r["granule"]} for r in readings]
    total = len(seasons) * PER_SEASON
    unread = sum(1 for x in left_out if x["why"] in ("no_time", "not_read"))
    window = {"first": seasons[0][0].isoformat(), "last": seasons[-1][1].isoformat(), "seasons": ["%s/%s" % (a.isoformat(), b.isoformat()) for a, b in seasons]}
    out = {
        "source": hlsndvi.SOURCE, "data_date": passes[-1]["date"] if passes else "%s/%s" % (window["first"], window["last"]), "units": UNITS, "pixel_m": PIXEL_M, "window": window,
        "cells": grid["cells"], "cells_inside": len(grid["inside"]), "passes": passes,
        "periods": total, "periods_read": total - unread, "left_out": left_out, "not_usable": why, "read_errors": errors, "incomplete": bool(unread or errors),
        "note": ("How green each 30 m square of the field looked from space, from the clearest pass of each 15-day period, May to September of %d and %d. A pass is kept only when at least 60 %% of the "
                 "squares wholly inside the field were clear. A square with cloud, cloud shadow, snow or water is null, never counted as low greenness." % (seasons[0][0].year, seasons[-1][0].year)),
    }
    if not passes:   # never blame the clouds for passes nobody looked at
        looked = any(r and r.get("looked") for r, e in by_index.values())
        out["why_none"] = ("None of the passes looked at gave a clear view of at least 60 % of the field" if looked else
                           "No pass was looked at before the time ran out; try again in a minute")
    return out


if __name__ == "__main__":
    common.run(main, LIMIT_S, slow="NASA's satellite greenness files took too long to answer; try again in a minute")
