# ecopass.py LAT LON: the newest clear ECOSTRESS passes over the field in the last 60 days, the ground temperature of the field's own 70 m pixel in each (written 2026-11-14).
# Reads:   NASA's catalogue (CMR) for the tiled ECOSTRESS land-surface-temperature granules over the point; then ONE pixel (the pixel that holds the field) of five small layers of each
#          granule (temperature, its error, the quality code, the cloud mask, the water mask) as range reads of the GeoTIFF files, never a whole file. The catalogue is open; the files need the NASA Earthdata login.
# From:    NASA ECOSTRESS ECO_L2T_LSTE (tiled land surface temperature and emissivity, 70 m), version 003 and, for a pass version 003 lacks, version 002, from NASA's Land Processes DAAC (LP DAAC).
# Returns: {"ok": true, "source", "data_date", "units", "pixel_m", "window", "passes": [{"date", "utc", "solar_time", "day_night", "lst_c", "lst_k", "error_k", "orbit", "version", "granule"}],
#          "clear_passes", "passes_checked", "not_usable": {"cloud", "quality", "water", "no_data"}, "read_errors", "newest_clear", "note", "incomplete"?} or {"ok": false, "reason"}. A pixel that is cloudy, of lower quality, water or not seen is NEVER a reading.
#          The contract: README.md, section "ecopass".
# Keeps:   nothing. The server keeps answers; this lookup keeps no file.
# Checked by: scripts/test_live_ecopass.mjs (offline: the catalogue, the token and small GeoTIFFs built the real way) and scripts/live_check_ecopass.mjs (by hand, live).
import common   # first, always
import datetime
import re
import math
from common import Fail, SourceDown

LIMIT_S = 150
DAYS = 60
WANT = 4                       # clear passes to give at most (each one costs five small reads, and the service allows two at a time)
MOST_CHECKED = 36              # passes looked at at most (newest first)
BATCH = 6
SPARE_S = 25                   # stop looking at new passes when fewer seconds than this are left
SHORT = "ECO_L2T_LSTE"
VERSIONS = ("003", "002")      # the newest version first; a pass is taken from the first version that has it
LAYERS = ("LST", "LST_err", "QC", "cloud", "water")
LST_LOW, LST_HIGH = 200.0, 360.0   # kelvin: a land-surface temperature outside this is a broken value, not weather
SOURCE = "NASA ECOSTRESS tiled land surface temperature, 70 m (ECO_L2T_LSTE), from NASA's Land Processes DAAC"
UNITS = "Ground (surface skin) temperature seen from space for one 70 m pixel, in degrees Celsius (and kelvin), at the time of each pass; not the air temperature"
NO_RIGHTS = "NASA did not let this computer's Earthdata login read the ECOSTRESS files: the login may still need to be approved for NASA LP DAAC"
KEY = re.compile(r"_(\d{5})_(\d{3})_([0-9A-Z]{5})_")


def passes_over(first, last, lat, lon):
    """[(orbit key, version, granule)] newest first: version 003's passes, then version 002's passes that 003 lacks."""
    taken, out = set(), []
    for version in VERSIONS:
        params = [("short_name", SHORT), ("version", version), ("point", "%s,%s" % (lon, lat)), ("sort_key", "-start_date"),
                  ("temporal", "%sT00:00:00Z,%sT23:59:59Z" % (first.isoformat(), last.isoformat()))]
        for g in common.cmr_granules(params, limit=120, page_size=100):
            m = KEY.search(str(g.get("title", "")))
            files = {}
            for l in g.get("links", []):
                href = str(l.get("href", ""))
                if str(l.get("rel", "")).endswith("/data#") and href.startswith("https://") and href.endswith(".tif") and not l.get("inherited"):
                    layer = re.search(r"_(LST_err|LST|QC|cloud|water)\.tif$", href)
                    if layer:
                        files[layer.group(1)] = href
            if m and all(k in files for k in LAYERS) and m.group(0) not in taken:
                taken.add(m.group(0))
                out.append((m.group(0), version, g, files))
    out.sort(key=lambda p: str(p[2].get("time_start", "")), reverse=True)
    return out


def one(window, lat, lon, url, options):
    """The single pixel's value at the point, or None when the point is outside the file or the file has no value there."""
    got = common.read_window(url, lat, lon, half=0, options=options)
    if got is None:
        return None
    v = float(got["values"].ravel()[0])
    return None if v != v else v


def read_pass(job):
    """One pass: {"status": "clear" | "cloud" | "quality" | "water" | "no_data", ...}. Raises SourceDown when NASA did not answer."""
    lat, lon, key, version, granule, files, options = job
    lst = one(None, lat, lon, files["LST"], options)
    if lst is None:
        return {"status": "no_data"}
    cloud = one(None, lat, lon, files["cloud"], options)
    if cloud is None or cloud not in (0.0, 1.0):
        return {"status": "no_data"}   # 255 is the file's own "not known": nobody saw this pixel clear
    if cloud == 1.0:
        return {"status": "cloud"}
    qc = one(None, lat, lon, files["QC"], options)
    if qc is None or int(qc) & 3 != 0:   # only the best quality counts: "nominal" includes possible cloud contamination
        return {"status": "quality"}
    water = one(None, lat, lon, files["water"], options)
    if water is None or water != 0.0:
        return {"status": "water"}
    if not LST_LOW <= lst <= LST_HIGH:
        return {"status": "quality"}
    err = one(None, lat, lon, files["LST_err"], options)
    return {"status": "clear", "lst": lst, "err": err if err is not None and 0 <= err < 50 else None}


def main(args):
    lat, lon = common.latlon(args, max_lat=52)
    today = common.now().date()
    first, last = today - datetime.timedelta(days=DAYS), today
    found = passes_over(first, last, lat, lon)
    if not found:
        raise Fail("NASA's catalogue lists no ECOSTRESS pass over this place in the last %d days (ECOSTRESS flies between 52 N and 52 S and does not see every place every week)" % DAYS)
    options = common.earthdata_gdal()
    found = found[:MOST_CHECKED]
    results, clear, orbits, counts, errors, done_n, rushed = [], [], set(), {"cloud": 0, "quality": 0, "water": 0, "no_data": 0}, [], 0, False
    for at in range(0, len(found), BATCH):
        if len(clear) >= WANT:
            break
        if common.left() is not None and common.left() < SPARE_S and done_n:
            rushed = True
            break
        batch = found[at:at + BATCH]
        jobs = [(lat, lon, key, version, g, files, options) for key, version, g, files in batch]
        for (job, result, error) in common.each(jobs, read_pass, 3):
            done_n += 1
            if error is not None:
                errors.append(error)
                continue
            if result["status"] != "clear":
                counts[result["status"]] += 1
                continue
            g = job[4]
            orbit = int(KEY.search(str(g["title"])).group(1))
            if orbit in orbits:   # the next scene of the same overpass: one pass, one reading
                continue
            orbits.add(orbit)
            when = datetime.datetime.fromisoformat(str(g["time_start"]).replace("Z", "+00:00"))
            solar = when + datetime.timedelta(hours=lon / 15.0)
            clear.append({"date": when.date().isoformat(), "utc": when.strftime("%H:%M"), "solar_time": solar.strftime("%H:%M"), "solar_date": solar.date().isoformat(),
                          "day_night": str(g.get("day_night_flag") or "").lower() or None, "lst_c": round(result["lst"] - 273.15, 1), "lst_k": round(result["lst"], 2),
                          "error_k": round(result["err"], 1) if result["err"] is not None else None, "orbit": orbit, "version": job[3], "granule": str(g["title"])})
    if errors and done_n == len(errors):
        if all(getattr(e, "status", 0) in (401, 403) for e in errors):
            raise Fail(NO_RIGHTS)
        raise Fail("NASA's ECOSTRESS files could not be read just now; try again in a minute")
    clear.sort(key=lambda p: (p["date"], p["utc"]), reverse=True)
    clear = clear[:WANT]
    out = {
        "source": SOURCE, "data_date": clear[0]["date"] if clear else "%s/%s" % (first.isoformat(), last.isoformat()), "units": UNITS,
        "pixel_m": 70, "window": {"first": first.isoformat(), "last": last.isoformat()}, "passes": clear, "clear_passes": len(clear),
        "passes_checked": done_n - len(errors), "not_usable": counts, "read_errors": len(errors), "newest_clear": clear[0]["date"] if clear else None,
        "note": ("The ground temperature of the 70 m pixel that holds your field, seen from space by the ECOSTRESS instrument on the International Space Station: the temperature of the surface (soil, leaves, snow), "
                 "not the air temperature. It passes at different times of day, so only compare passes made at about the same hour. A pixel with cloud, lower quality or water is never used."),
    }
    notes = []
    if errors:
        notes.append("%d pass%s could not be read just now" % (len(errors), "" if len(errors) == 1 else "es"))
    if rushed:
        notes.append("only the newest %d passes were looked at before the time ran out" % done_n)
    if not clear:
        out["why_none"] = "None of the %d passes checked in the last %d days gave a clear, best-quality reading of the field's pixel" % (done_n - len(errors), DAYS)
    if notes:
        out["incomplete"] = "; ".join(notes)
    return out


common.run(main, LIMIT_S, slow="NASA's ECOSTRESS files took too long to answer; try again in a minute")
