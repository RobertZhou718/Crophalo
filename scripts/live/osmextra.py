# osmextra.py LAT LON W D: the fences, walls, gates, power lines, poles and towers, tanks, silos and water towers that OpenStreetMap's volunteers have drawn in one box of land.
# Reads:   one question for the box (the same servers, the same checks and the same words as osm.py, which has the buildings, roads, water, woods and hedges).
# Returns: {"ok": true, "source", "server", "data_date", "units", "credit", "licence", "box", "counts", "cut", "fences", "gates", "power", "poles", "things", ...}  or  {"ok": false, "reason"}.
# Checked by: scripts/test_live_osmextra.mjs (offline: answers recorded from the live service on 2026-11-15 and hand-made ones).
import common   # first, always: it takes stdout away from every library
import datetime
import math
import time
import urllib.parse
from common import Fail, SourceDown

import osm   # the shared parts: the servers, the box, the checks of an answer, the words for a failure

LIMIT_S = osm.LIMIT_S
MOST = 12000
CAPS = {"fences": 1500, "gates": 150, "power": 400, "poles": 800, "things": 300}
THINGS = {"silo": "silo", "storage_tank": "tank", "water_tower": "water tower", "windmill": "windmill", "water_well": "well", "tower": "tower"}
UNITS = "p: [latitude, longitude] in decimal degrees (WGS84), 6 decimals; h: metres as mapped; r: metres, the radius of the round shape drawn; counts and cut: number of shapes"


def question(boxes):
    """The one Overpass question. Its text is part of the contract: the suite builds it a second time and compares."""
    parts = []
    for box in boxes:
        b = "(%.6f,%.6f,%.6f,%.6f)" % box
        parts += ['way["barrier"~"^(fence|wall|retaining_wall)$"]' + b, 'node["barrier"~"^(gate|lift_gate|cattle_grid)$"]' + b,
                  'way["power"~"^(line|minor_line)$"]' + b, 'node["power"~"^(pole|tower)$"]' + b,
                  'node["man_made"~"^(silo|storage_tank|water_tower|windmill|water_well|tower)$"]' + b, 'way["man_made"~"^(silo|storage_tank|water_tower)$"]' + b]
    return "[out:json][timeout:%d];(%s;);out geom tags %d;" % (osm.QUERY_S, ";".join(parts), MOST)


def centre(pts):
    return (round(sum(p[0] for p in pts) / len(pts), 6), round(sum(p[1] for p in pts) / len(pts), 6))


def radius(pts, lat):
    """The radius in metres of the round footprint of a closed way, from its own corners: the mean distance to its middle."""
    c = centre(pts)
    m_lat, m_lon = osm.m_per_deg(lat)
    return round(sum(math.hypot((p[0] - c[0]) * m_lat, (p[1] - c[1]) * m_lon) for p in pts) / len(pts), 1)


def sort_out(elements, lat):
    lists = {name: [] for name in CAPS}
    left_out = 0
    for e in osm.scrub(elements):
        tags = e.get("tags") if isinstance(e.get("tags"), dict) else {}
        barrier, power, made = tags.get("barrier"), tags.get("power"), tags.get("man_made")
        if e.get("type") == "node":
            try:
                at = [round(float(e["lat"]), 6), round(float(e["lon"]), 6)]
            except (KeyError, TypeError, ValueError):
                left_out += 1
                continue
            if not (abs(at[0]) <= 90 and abs(at[1]) <= 180):
                left_out += 1
                continue
            if barrier in ("gate", "lift_gate", "cattle_grid"):
                lists["gates"].append({"p": at, "k": "grid" if barrier == "cattle_grid" else "gate"})
            elif power in ("pole", "tower"):
                lists["poles"].append({"p": at, "k": power})
            elif made in THINGS:
                lists["things"].append({"p": at, "k": THINGS[made]})
            continue
        if e.get("type") != "way":
            continue
        pts = osm.points(e.get("geometry"))
        if pts is None:
            left_out += 1
            continue
        if barrier in ("fence", "wall", "retaining_wall"):
            item = {"p": [list(p) for p in pts], "k": "fence" if barrier == "fence" else "wall"}
            h = osm.metres(tags.get("height"), 0.2, 20)
            if h is not None:
                item["h"] = h
            lists["fences"].append(item)
        elif power in ("line", "minor_line"):
            lists["power"].append({"p": [list(p) for p in pts], "k": "line" if power == "line" else "minor"})
        elif made in ("silo", "storage_tank", "water_tower") and pts[0] == pts[-1] and len(pts) >= 4:
            body = pts[:-1]
            lists["things"].append({"p": list(centre(body)), "k": THINGS[made], "r": radius(body, lat)})
    return lists, left_out


def capped(lists, lat, lon):
    """A list over its cap keeps what lies nearest the middle of the box."""
    cut, squeeze = {}, math.cos(math.radians(lat))

    def far(item):
        pts = item["p"] if isinstance(item["p"][0], list) else [item["p"]]
        return (sum(p[0] for p in pts) / len(pts) - lat) ** 2 + (((sum(p[1] for p in pts) / len(pts) - lon + 180) % 360 - 180) * squeeze) ** 2

    for name, cap in CAPS.items():
        if len(lists[name]) > cap:
            cut[name] = len(lists[name])
            lists[name].sort(key=far)
            del lists[name][cap:]
    return cut


def main(args):
    lat, lon = common.latlon(args, max_lat=84)
    w, d = osm.side(args, 2), osm.side(args, 3)
    boxes = osm.boxes_of(lat, lon, w, d)
    body = ("data=" + urllib.parse.quote(question(boxes), safe="")).encode("ascii")
    why, found = [], None
    for n, (host, url) in enumerate(osm.servers()):
        if n:
            if common.left() is not None and common.left() < 15:
                break
            time.sleep(0.05 if common.REPLAY else osm.PAUSE_S)
        try:
            found = osm.usable(common.http(url, data=body, headers=osm.HEADERS, timeout=osm.ASK_S, tries=1), boxes, backup=n > 0)
            break
        except SourceDown as e:
            why.append("heavy" if e.kind == "heavy" else "busy" if e.kind == "busy" or e.status in (502, 503, 504) else "down")
            common.log("%s gave nothing usable (%s): %s" % (host, why[-1], e))
    if found is None:   # a failure is never dressed as "nothing is mapped here"
        raise Fail(osm.HEAVY if "heavy" in why else osm.BUSY if "busy" in why else osm.DOWN)
    elements, stamp = found
    lists, left_out = sort_out(elements, lat)
    cut = capped(lists, lat, lon)
    answer = {
        "source": "OpenStreetMap, read through the Overpass API (%s)" % host, "source_key": "osm", "name": "OpenStreetMap", "server": host,
        "data_date": stamp, "units": UNITS, "credit": "(c) OpenStreetMap contributors", "licence": "ODbL 1.0",
        "box": {"lat": lat, "lon": lon, "w": w, "d": d}, "counts": {name: len(lists[name]) for name in CAPS}, "cut": cut,
    }
    age = (common.now() - datetime.datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)).days
    if age > 7:
        answer["data_date_note"] = "This server's copy of OpenStreetMap is %d days behind the map" % age
    notes = ["%s: the %s nearest the middle are given, of %s mapped" % (name, format(CAPS[name], ","), format(n, ",")) for name, n in cut.items()]
    if len(elements) >= MOST:
        answer["truncated"] = True
        notes.insert(0, "OpenStreetMap holds more than %s of these in this box; only the first %s were read, so some are missing" % (format(MOST, ","), format(MOST, ",")))
    if left_out:
        answer["left_out"] = left_out
        notes.append("%d shape%s could not be read and %s not drawn" % (left_out, "" if left_out == 1 else "s", "is" if left_out == 1 else "are"))
    if notes:
        answer["note"] = ". ".join(notes)
    answer.update(lists)
    return answer


if __name__ == "__main__":
    common.run(main, LIMIT_S, slow=osm.DOWN)
