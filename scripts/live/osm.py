# osm.py LAT LON W D: what OpenStreetMap's volunteers have drawn in one box of land (written 2026-11-14).
# Reads:   one question for the box: buildings, roads and tracks, streams, ditches and ponds, woods, scrub, tree rows, hedges.
# From:    OpenStreetMap through the Overpass API: overpass.private.coffee (a non-profit's free instance: commercial use allowed, no rate limits, credit OpenStreetMap,
#          a meaningful User-Agent) and once, only when that gives nothing usable, overpass.kumi.systems. The main public server (overpass-api.de) is not asked: it is not meant to carry an app.
#          No login. Credit "(c) OpenStreetMap contributors", licence ODbL 1.0, carried in the answer.
# Returns: {"ok": true, "source", "data_date" (how fresh the server's copy of the map is, in its own words), "units", "credit",
#           "licence", "box", "counts", "cut", "buildings", "roads", "water", "trees", ...}  or  {"ok": false, "reason"}.
#          The contract: README.md, section "osm".
# Checked by: scripts/test_live_land.mjs (offline, on answers recorded from the live service on 2026-11-14 and on hand-made ones).
import common   # first, always: it takes stdout away from every library
import datetime
import math
import os
import re
import time
import urllib.parse
from common import Fail, SourceDown

LIMIT_S = 150   # the server's time limit for this lookup; common.run answers by itself a little before it
DEFAULT_SERVERS = (("overpass.private.coffee", "https://overpass.private.coffee/api/interpreter"),   # the first server (terms read 2026-11-14: free, any project, business included, no rate limits)
                   ("overpass.kumi.systems", "https://overpass.kumi.systems/api/interpreter"))         # the back-up: one try, never trusted when empty


def servers():
    """The servers to ask, in order. FW_OVERPASS="host|url;host|url" replaces them (a server of our own later; the suite's recordings)."""
    raw = os.environ.get("FW_OVERPASS", "").strip()
    if not raw:
        return DEFAULT_SERVERS
    pairs = tuple(tuple(part.strip() for part in item.split("|", 1)) for item in raw.split(";") if "|" in item)
    return tuple(p for p in pairs if len(p) == 2 and p[1].startswith("https://")) or DEFAULT_SERVERS
ASK_S = 60       # one question, one try: a busy free service is left alone, not asked again
QUERY_S = 40     # the service's own limit for the question
PAUSE_S = 1.0    # between the two servers
MOST = 12000     # the service stops at this many things: reaching it means some are missing
CAPS = {"buildings": 2500, "roads": 2500, "water": 800, "trees": 2000}
ROADS = ("motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link",
         "unclassified", "residential", "living_street", "road", "service", "pedestrian", "track", "cycleway", "bridleway", "footway", "path")   # busiest first
ROADS_ASKED = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track|path|footway|cycleway|bridleway|living_street|road|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link"
WATERWAYS = {"river": "river", "stream": "stream", "brook": "stream", "canal": "canal", "ditch": "ditch", "drain": "drain"}
UNITS = "p: [latitude, longitude] in decimal degrees (WGS84), 6 decimals; h and w: metres as mapped; lv: building levels as mapped; counts and cut: number of shapes"
DOWN = "OpenStreetMap could not be read right now (its map service did not answer); try again in a few minutes"
BUSY = "OpenStreetMap could not be read right now (its map service is busy); try again in a few minutes"
HEAVY = "OpenStreetMap could not be read right now (its map service did not finish this box in time); try again in a few minutes"
HEADERS = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}


def m_per_deg(lat):
    """Metres in one degree of latitude and of longitude at this latitude (WGS84 series)."""
    p = math.radians(lat)
    return (111132.92 - 559.82 * math.cos(2 * p) + 1.175 * math.cos(4 * p) - 0.0023 * math.cos(6 * p),
            111412.84 * math.cos(p) - 93.5 * math.cos(3 * p) + 0.118 * math.cos(5 * p))


def side(args, n):
    """One side of the box in metres."""
    try:
        v = common.number(args[n] if len(args) > n else None, "side", 20, 3600)
        return int(v) if v == int(v) else v   # 800, not 800.0, in the answer's box
    except Fail as e:
        raise Fail("The box must be 20 m to 3.6 km a side" if "must be" in e.reason else "The box needs a width and a depth (w and d, in metres)") from None


def boxes_of(lat, lon, w, d):
    """The box as (south, west, north, east) in degrees; two of them when it lies across the 180 degree line."""
    m_lat, m_lon = m_per_deg(lat)
    south, north, west, east = lat - d / 2 / m_lat, lat + d / 2 / m_lat, lon - w / 2 / m_lon, lon + w / 2 / m_lon
    if west < -180:
        return [(south, west + 360, north, 180.0), (south, -180.0, north, east)]
    if east > 180:
        return [(south, west, north, 180.0), (south, -180.0, north, east - 360)]
    return [(south, west, north, east)]


def question(boxes):
    """The one Overpass question. Its text is part of the contract: the suite builds it a second time and compares."""
    parts = []
    for box in boxes:
        b = "(%.6f,%.6f,%.6f,%.6f)" % box
        parts += ['way["building"]' + b, 'way["highway"~"^(%s)$"]' % ROADS_ASKED + b, 'way["waterway"~"^(river|stream|canal|ditch|drain|brook)$"]' + b,
                  'way["natural"~"^(water|wood|scrub|tree_row)$"]' + b, 'way["landuse"~"^(forest|reservoir|basin)$"]' + b, 'way["barrier"="hedge"]' + b,
                  'rel["natural"~"^(water|wood)$"]' + b, 'rel["landuse"~"^(forest|reservoir)$"]' + b]
    return "[out:json][timeout:%d];(%s;);out geom tags %d;" % (QUERY_S, ";".join(parts), MOST)


# ---- is this answer the map's own, whole, and about this box?
def points(geometry):
    """[(lat, lon)] with 6 decimals, or None when a point is missing or not on the globe: a shape is read whole or not at all."""
    out = []
    for g in geometry if isinstance(geometry, list) else []:
        try:
            lat, lon = float(g["lat"]), float(g["lon"])
        except (TypeError, KeyError, ValueError):
            return None
        if not (abs(lat) <= 90 and abs(lon) <= 180):   # a NaN fails this too
            return None
        out.append((round(lat, 6), round(lon, 6)))
    return out if len(out) >= 2 else None


def touches(element, boxes):
    """Does the shape's own bounding box touch the box that was asked? An answer about another place is not an answer."""
    b = element.get("bounds")
    if not isinstance(b, dict):
        pts = points(element.get("geometry"))
        if not pts:
            return True   # no shape at all: it is left out later, it proves nothing about the place
        b = {"minlat": min(p[0] for p in pts), "maxlat": max(p[0] for p in pts), "minlon": min(p[1] for p in pts), "maxlon": max(p[1] for p in pts)}
    try:
        return any(b["minlat"] <= n + 1e-6 and b["maxlat"] >= s - 1e-6 and b["minlon"] <= e + 1e-6 and b["maxlon"] >= w - 1e-6 for s, w, n, e in boxes)
    except (KeyError, TypeError):
        return False


def usable(reply, boxes, backup):
    """(elements, the time the server's copy of the map is from) of an answer that can be trusted; anything else raises SourceDown."""
    found = reply.json()
    if not isinstance(found, dict) or not isinstance(found.get("elements"), list):
        raise SourceDown("the answer is not a list of map shapes", "http", reply.status)
    if found.get("remark"):   # the service gave up part-way (out of time or memory): what it did send is not the whole box
        raise SourceDown("the service did not finish the question", "heavy", reply.status)
    stamp = (found.get("osm3s") or {}).get("timestamp_osm_base") if isinstance(found.get("osm3s"), dict) else None
    if not isinstance(stamp, str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", stamp):
        raise SourceDown("the answer does not say how fresh its copy of the map is", "http", reply.status)
    elements = [e for e in found["elements"] if isinstance(e, dict)]
    if len(elements) != len(found["elements"]) or not all(touches(e, boxes) for e in elements):
        raise SourceDown("the answer is not about the box that was asked", "http", reply.status)
    if backup and not elements:   # an empty back-up is what a server being rebuilt sends too: "nothing is mapped" is never said on its word alone
        raise SourceDown("the back-up server sent an empty answer, which cannot be told from a server that is not well", "http", reply.status)
    return elements, stamp


# ---- sorting the shapes
def word(value, otherwise):
    """A mapper's tag value when it is a plain kind word; mappers can type anything, and anything is not passed on."""
    return value if isinstance(value, str) and re.fullmatch(r"[a-z0-9_]{1,20}", value) else otherwise


def metres(value, lo, hi):
    """A mapped size when it is a plain number of metres inside lo..hi, else None: feet, ranges and words are never guessed at."""
    found = re.fullmatch(r"(\d{1,4}(?:\.\d{1,3})?)\s*(?:m|metres?|meters?)?", value.strip()) if isinstance(value, str) else None
    return round(float(found.group(1)), 1) if found and lo <= float(found.group(1)) <= hi else None


def levels(value):
    found = re.fullmatch(r"\d{1,3}(?:\.\d)?", value.strip()) if isinstance(value, str) else None
    if not found or not 1 <= float(value) <= 120:
        return None
    return int(float(value)) if float(value) == int(float(value)) else float(value)


def kind_of(tags):
    """(list, kind, is it an area) for one shape's tags, or None when it is none of ours."""
    building, natural, landuse = tags.get("building"), tags.get("natural"), tags.get("landuse")
    if building and building != "no":
        return "buildings", word(building, "yes"), True
    if tags.get("highway") in ROADS and tags.get("area") != "yes":   # a square mapped as an area is not a road line
        return "roads", tags["highway"], False
    if tags.get("waterway") in WATERWAYS:
        return "water", WATERWAYS[tags["waterway"]], False
    if natural == "water":
        return "water", word(tags.get("water"), "water"), True
    if landuse in ("reservoir", "basin"):
        return "water", "reservoir", True
    if natural == "wood" or landuse == "forest":
        return "trees", "wood", True
    if natural == "scrub":
        return "trees", "scrub", True
    if natural == "tree_row":
        return "trees", "row", False
    if tags.get("barrier") == "hedge":
        return "trees", "hedge", False
    return None


def sort_out(elements):
    """The four lists in the service's order, how many shapes could not be read, and the many-part outlines that are named but not drawn."""
    lists, left_out, not_drawn = {name: [] for name in CAPS}, 0, {}
    for e in elements:
        tags = e.get("tags") if isinstance(e.get("tags"), dict) else {}
        kind = kind_of(tags)
        if not kind:
            continue
        name, k, area = kind
        if e.get("type") == "relation":   # the service sends a relation's name and tags but not its outline (seen live 2026-11-14)
            if area and name in ("water", "trees"):
                not_drawn[name] = not_drawn.get(name, 0) + 1   # said, never drawn from a guess
            continue
        if e.get("type") != "way":
            continue
        p = points(e.get("geometry"))
        if p is None:
            left_out += 1
            continue
        if area:
            if not (p[0] == p[-1] and len(p) >= 4):
                continue   # an open piece of an outline is not an area by itself
            p = p[:-1]     # the closing point is not repeated
        item = {"p": [list(pt) for pt in p], "k": k}
        if name == "buildings":
            h, lv = metres(tags.get("height"), 0.5, 400), levels(tags.get("building:levels"))
            item.update({key: v for key, v in (("h", h), ("lv", lv)) if v is not None})   # only what a mapper wrote: no height is worked out here
        elif name == "roads":
            width = metres(tags.get("width"), 0.5, 60)
            if width is not None:
                item["w"] = width
        else:
            item["area"] = area
        lists[name].append(item)
    return lists, left_out, not_drawn


def capped(lists, lat, lon):
    """Roads busiest first; a list over its cap keeps the busiest roads, or what lies nearest the middle of the box."""
    cut, squeeze = {}, math.cos(math.radians(lat))

    def far(item):
        return (sum(p[0] for p in item["p"]) / len(item["p"]) - lat) ** 2 + (((sum(p[1] for p in item["p"]) / len(item["p"]) - lon + 180) % 360 - 180) * squeeze) ** 2

    lists["roads"].sort(key=lambda item: ROADS.index(item["k"]))   # a stable sort: the service's order inside one kind
    for name, cap in CAPS.items():
        if len(lists[name]) > cap:
            cut[name] = len(lists[name])
            if name != "roads":
                lists[name].sort(key=far)
            del lists[name][cap:]
    return cut


def main(args):
    lat, lon = common.latlon(args, max_lat=84)
    w, d = side(args, 2), side(args, 3)
    boxes = boxes_of(lat, lon, w, d)
    body = ("data=" + urllib.parse.quote(question(boxes), safe="")).encode("ascii")
    why, found = [], None
    for n, (host, url) in enumerate(servers()):
        if n:
            if common.left() is not None and common.left() < 15:
                break   # not enough time left for a fair try at the back-up
            time.sleep(0.05 if common.REPLAY else PAUSE_S)
        try:
            found = usable(common.http(url, data=body, headers=HEADERS, timeout=ASK_S, tries=1), boxes, backup=n > 0)   # one try: never a loop
            break
        except SourceDown as e:
            why.append("heavy" if e.kind == "heavy" else "busy" if e.kind == "busy" or e.status in (502, 503, 504) else "down")
            common.log("%s gave nothing usable (%s): %s" % (host, why[-1], e))
    if found is None:   # a failure is never dressed as "nothing is mapped here"
        raise Fail(HEAVY if "heavy" in why else BUSY if "busy" in why else DOWN)
    elements, stamp = found

    lists, left_out, not_drawn = sort_out(elements)
    cut = capped(lists, lat, lon)
    answer = {
        "source": "OpenStreetMap, read through the Overpass API (%s)" % host, "source_key": "osm", "name": "OpenStreetMap", "server": host,
        "data_date": stamp, "units": UNITS, "credit": "(c) OpenStreetMap contributors", "licence": "ODbL 1.0",
        "box": {"lat": lat, "lon": lon, "w": w, "d": d},
        "counts": {name: len(lists[name]) for name in CAPS}, "cut": cut,
    }
    age = (common.now() - datetime.datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)).days
    if age > 7:
        answer["data_date_note"] = "This server's copy of OpenStreetMap is %d days behind the map" % age
    notes = ["%s: the %s %s are given, of %s mapped" % (name, format(CAPS[name], ","), "busiest" if name == "roads" else "nearest the middle", format(n, ",")) for name, n in cut.items()]
    if len(elements) >= MOST:
        answer["truncated"] = True
        notes.insert(0, "OpenStreetMap holds more than %s shapes in this box; only the first %s were read, so some buildings, roads, water or trees are missing" % (format(MOST, ","), format(MOST, ",")))
    if left_out:
        answer["left_out"] = left_out
        notes.append("%d shape%s could not be read and %s not drawn" % (left_out, "" if left_out == 1 else "s", "is" if left_out == 1 else "are"))
    if not_drawn:
        answer["not_drawn"] = not_drawn
        words = {"water": "large water (a lake, a wide river, a reservoir)", "trees": "large woods"}
        notes += ["%d outline%s of %s mapped in many parts reach%s into this box and cannot be read by this lookup: not drawn" % (n, "" if n == 1 else "s", words[name], "es" if n == 1 else "") for name, n in not_drawn.items()]
    if notes:
        answer["note"] = ". ".join(notes)
    answer.update(lists)
    return answer


if __name__ == "__main__":
    common.run(main, LIMIT_S, slow=DOWN)
