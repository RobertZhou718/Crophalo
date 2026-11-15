# firms.py LAT LON [HALF_DEG]: the fires and hot spots the VIIRS satellites saw in the last 24 hours within about 250 km of the field (written 2026-11-15).
# Reads:   NASA FIRMS's open 24-hour files of detections for VIIRS on NOAA-20 and NOAA-21 (each about 7 MB, new every few hours; Suomi NPP no longer sends data), read line by line, never held whole. The files are kept 90 minutes
#          under FW_CACHE, so the next field asks nobody. No login and no key.
# From:    NASA Fire Information for Resource Management System (FIRMS): VIIRS 375 m active fire detections (VNP14IMG / VJ114IMG / VJ214IMG, NRT), Land, Atmosphere Near real-time Capability for EOS (LANCE).
# Returns: {"ok": true, "source", "data_date", "units", "window_hours": 24, "box": {n,s,e,w}, "count", "shown", "by_confidence", "points": [{"lat","lon","time","frp","confidence","satellite","night"}], "satellites", "newest",
#          "coverage", "note", "incomplete"?} or {"ok": false, "reason"}. No detection is a good answer with 0 points: it never says there was no fire, only that the satellites saw none.
#          The contract: README.md, section "firms".
# Keeps:   the two 24-hour files, 90 minutes, under FW_CACHE/firms (source files, not answers). The server keeps the answers.
# Checked by: scripts/test_live_firms.mjs (offline: the files hand-made in the real format) and scripts/live_check_firms.mjs (by hand, live).
import common   # first, always
import csv
import datetime
import math
import os
import time
from common import Fail, SourceDown

LIMIT_S = 150
BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire"
FILES = (("NOAA-20", BASE + "/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv"), ("NOAA-21", BASE + "/noaa-21-viirs-c2/csv/J2_VIIRS_C2_Global_24h.csv"))
KEEP_FILE_S = 90 * 60
DEFAULT_HALF, MAX_HALF = 2.5, 5.0   # degrees of latitude each side of the field (about 280 km); longitude is widened by the cosine
MAX_POINTS = 600
CONFIDENCE = {"l": "low", "low": "low", "n": "nominal", "nominal": "nominal", "h": "high", "high": "high"}
SOURCE = "NASA FIRMS (Fire Information for Resource Management System): VIIRS 375 m active fire detections from NOAA-20 and NOAA-21, near-real-time"
UNITS = "Each point is one 375 m spot a satellite saw hotter than its surroundings (a fire or a hot spot); time in UTC; FRP is the fire's radiative power in megawatts; confidence is low, nominal or high"
COVERAGE = ("The satellites pass each place about twice a day each (day and night). A fire under cloud, smaller than a few metres across, or between passes is not seen, a hot factory, flare or sunlit bare rock can show as a spot, and "
            "'low' confidence spots are often not fires. Only the last 24 hours are shown. No spot does not mean there is no fire.")


def box_of(lat, lon, half):
    dlon = min(60.0, half / max(0.05, math.cos(math.radians(lat))))
    return {"n": round(lat + half, 3), "s": round(lat - half, 3), "e": round(lon + dlon, 3), "w": round(lon - dlon, 3)}


def fresh(url, name):
    """The kept copy of a file when it is under 90 minutes old, else a new download."""
    dest = common.cache_dir("firms") / (name + ".csv")
    try:
        if time.time() - dest.stat().st_mtime < KEEP_FILE_S and dest.stat().st_size > 100:
            return dest
    except OSError:
        pass
    return common.download(url, dest, timeout=60)


def read(path, name, lat, lon, box):
    """Every detection of the file inside the box as points, and the newest detection of the whole file: one line at a time."""
    points, newest, rows = [], "", 0
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.reader(f)
        head = next(reader, None)
        if not head or "latitude" not in head or "acq_date" not in head:
            raise SourceDown("the FIRMS file for %s was not in the expected form" % name, "http", 0)
        col = {k: head.index(k) for k in ("latitude", "longitude", "acq_date", "acq_time", "confidence", "frp", "daynight") if k in head}
        for row in reader:
            rows += 1
            try:
                la, lo = float(row[col["latitude"]]), float(row[col["longitude"]])
                when = row[col["acq_date"]] + row[col["acq_time"]].zfill(4)
            except (ValueError, IndexError, KeyError):
                continue
            if when > newest:
                newest = when
            if not (box["s"] <= la <= box["n"]):
                continue
            if abs(((lo - lon + 180.0) % 360.0) - 180.0) > (box["e"] - box["w"]) / 2.0 + 1e-9:   # the longitude difference, across the date line too
                continue
            try:
                frp = float(row[col["frp"]])
                frp = round(frp, 1) if frp >= 0 else None
            except (ValueError, IndexError, KeyError):
                frp = None
            points.append({"lat": round(la, 4), "lon": round(lo, 4), "time": "%sT%s:%sZ" % (when[:10], when[10:12], when[12:14]), "frp": frp,
                           "confidence": CONFIDENCE.get(str(row[col["confidence"]]).strip().lower(), "nominal"), "satellite": name, "night": str(row[col["daynight"]]).strip().upper() == "N"})
    return points, newest, rows


def main(args):
    lat, lon = common.latlon(args)
    half = DEFAULT_HALF
    if len(args) > 2:
        half = common.number(args[2], "The half width", 0.1, MAX_HALF, "degrees")
    box = box_of(lat, lon, half)
    points, newest, seen, missing = [], "", [], []
    for name, url in FILES:
        try:
            path = fresh(url, name)
            got, last, rows = read(path, name, lat, lon, box)
        except SourceDown as e:
            missing.append(name)
            common.log("the %s file did not come:" % name, e)
            continue
        points += got
        seen.append(name)
        newest = max(newest, last)
    if not seen:
        raise Fail("NASA FIRMS's files of fires seen in the last 24 hours could not be read just now; try again in a few minutes")
    points.sort(key=lambda p: (p["lat"] - lat) ** 2 + ((p["lon"] - lon) * math.cos(math.radians(lat))) ** 2)
    shown = points[:MAX_POINTS]
    by = {k: sum(1 for p in points if p["confidence"] == k) for k in ("high", "nominal", "low")}
    newest_iso = "%sT%s:%sZ" % (newest[:10], newest[10:12], newest[12:14]) if len(newest) >= 12 else None
    out = {"source": SOURCE, "data_date": newest[:10] if newest else datetime.date.today().isoformat(), "units": UNITS, "window_hours": 24, "box": box, "count": len(points), "shown": len(shown), "by_confidence": by,
           "points": shown, "satellites": seen, "newest": newest_iso, "coverage": COVERAGE,
           "note": "Spots the VIIRS satellites NOAA-20 and NOAA-21 saw in the last 24 hours within about 250 km of the field. " + COVERAGE}
    if missing:
        out["incomplete"] = "The %s file did not come just now, so its spots are missing" % " and ".join(missing)
    return out


common.run(main, LIMIT_S, slow="NASA FIRMS took too long to answer; try again in a few minutes")
