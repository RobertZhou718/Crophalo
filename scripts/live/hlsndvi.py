# hlsndvi.py LAT LON [FIRST LAST] (the days written YYYYMMDD): how green the field looked from space, about 30 m per dot, one value for the clearest pass in each 15-day period of the last 12 months (written 2026-11-14).
# Reads:   NASA's catalogue (CMR) for the Harmonized Landsat and Sentinel-2 granules (HLSS30 and HLSL30, version 2.0) over the point; then, for the candidates, a 3 by 3 pixel box round the point (90 m) of
#          three small layers (the Fmask flags, the red band, the near-infrared band) as range reads of the GeoTIFF files, never a whole file. The catalogue is open; the files need the NASA Earthdata login.
# From:    NASA / USGS HLS v2.0 surface reflectance, 30 m, from NASA's Land Processes DAAC: Sentinel-2 (MSI) bands B04 and B8A, Landsat 8 and 9 (OLI) bands B04 and B05.
# Returns: {"ok": true, "source", "data_date", "units", "pixel_m", "box", "window", "passes": [{"date", "sensor", "ndvi", "clear_pixels", "of_pixels", "tile_cloud_pct", "tile", "granule"}] oldest first,
#          "periods", "periods_read", "gaps", "skipped_periods", "not_usable", "read_errors", "newest_date", "newest_ndvi", "note", "incomplete"?} or {"ok": false, "reason"}. A cloud, a cloud shadow, snow or water pixel is NEVER low greenness: it is left out.
#          The contract: README.md, section "hlsndvi".
# Keeps:   nothing. The server keeps answers; this lookup keeps no file.
# Checked by: scripts/test_live_hlsndvi.mjs (offline: the catalogue, the token and small GeoTIFFs built the real way) and scripts/live_check_hlsndvi.mjs (by hand, live).
import common   # first, always
import datetime
import math
import re
from common import Fail, SourceDown

LIMIT_S = 150
DAYS = 365
PERIOD_DAYS = 15              # one value for each period: the clearest pass that has clear pixels at the field
TRIES = 3                     # candidates looked at in a period before giving up on it (each costs one small read)
SPARE_S = 22                  # stop starting new periods when fewer seconds than this are left
HALF = 1                      # a 3 by 3 pixel box round the point
NEED = 5                      # at least this many of the 9 pixels must be clear for the pass to count
PRODUCTS = (("HLSS30", "Sentinel-2", "B8A"), ("HLSL30", "Landsat 8 and 9", "B05"))
SOURCE = "NASA / USGS Harmonized Landsat and Sentinel-2 (HLS) surface reflectance, 30 m, version 2.0, from NASA's Land Processes DAAC"
UNITS = "NDVI (greenness) from the red and near-infrared surface reflectance of the 30 m dots round the field, 0 is bare ground or dead plants and about 0.8 is thick healthy green"
NO_RIGHTS = "NASA did not let this computer's Earthdata login read the HLS files: the login may still need to be approved for NASA LP DAAC"
FMASK_FILL = 255
SCALE_FALLBACK = 0.0001
# Fmask bits (HLS v2.0): 1 cloud, 2 adjacent to cloud or shadow, 3 cloud shadow, 4 snow or ice, 5 water. Bit 0 (cirrus) is unused; bits 6-7 are the aerosol level, which says how hazy the air was, not whether the pixel is usable.
CLOUD_BITS, SNOW_BIT, WATER_BIT = 0b00001110, 0b00010000, 0b00100000


def window_of(args):
    """(first, last) dates: the two optional arguments, else the last 12 months. Refused when they are not dates, not in order, or longer than two years."""
    if len(args) not in (2, 4):
        raise Fail("lat and lon are required as decimal degrees (and, if given, a first and last day written YYYYMMDD)")
    if len(args) == 2:
        today = common.now().date()
        return today - datetime.timedelta(days=DAYS), today
    first, last = common.day(args[2], "The first day"), common.day(args[3], "The last day")
    if first > last or (last - first).days > 800:
        raise Fail("The first day must not be after the last, and the two must be less than 800 days apart")
    return first, last


def candidates(first, last, lat, lon):
    """[(period index, tile cloud %, date, sensor, tile, granule, {layer: address})] for every pass over the point, a pass seen from two tiles kept once."""
    seen, out = set(), []
    for short, sensor, nir in PRODUCTS:
        params = [("short_name", short), ("version", "2.0"), ("point", "%s,%s" % (lon, lat)), ("sort_key", "-start_date"),
                  ("temporal", "%sT00:00:00Z,%sT23:59:59Z" % (first.isoformat(), last.isoformat()))]
        for g in common.cmr_granules(params, limit=600, page_size=200):
            title = str(g.get("title", ""))
            m = re.fullmatch(r"HLS\.[SL]30\.(T[0-9A-Z]{5})\.\d{7}T\d{6}\.v2\.0", title)
            when = str(g.get("time_start", ""))[:10]
            files = {}
            for l in g.get("links", []):
                href = str(l.get("href", ""))
                layer = re.search(r"\.(Fmask|B04|%s)\.tif$" % nir, href)
                if str(l.get("rel", "")).endswith("/data#") and href.startswith("https://") and layer and not l.get("inherited"):
                    files[layer.group(1) if layer.group(1) != nir else "NIR"] = href
            if not (m and re.fullmatch(r"\d{4}-\d{2}-\d{2}", when) and all(k in files for k in ("Fmask", "B04", "NIR"))) or (short, when) in seen:
                continue
            seen.add((short, when))   # the same pass seen from the next tile over is the same pass
            try:
                cloud = float(g.get("cloud_cover"))
            except (TypeError, ValueError):
                cloud = 50.0
            day = datetime.date.fromisoformat(when)
            out.append(((day - first).days // PERIOD_DAYS, cloud, when, sensor, m.group(1), title, files))
    return out


def clear_box(values):
    """Which of the box's pixels are clear land, and why the others are not: (mask list, counts of cloud / snow / water). 255 is the file's own "no value"."""
    clear, why = [], {"cloud": 0, "snow": 0, "water": 0}
    for v in values:
        if v != v or int(v) == FMASK_FILL:
            clear.append(False)
            why["cloud"] += 1   # a pixel nobody classified is not known to be clear
            continue
        bits = int(v)
        if bits & CLOUD_BITS:
            clear.append(False)
            why["cloud"] += 1
        elif bits & SNOW_BIT:
            clear.append(False)
            why["snow"] += 1
        elif bits & WATER_BIT:
            clear.append(False)
            why["water"] += 1
        else:
            clear.append(True)
    return clear, why


def box(url, lat, lon, options):
    """(values of the 3 by 3 box row by row, scale) or None when the point is outside the file."""
    got = common.read_window(url, lat, lon, half=HALF, options=options)
    if got is None:
        return None
    return [float(v) for v in got["values"].ravel()], (got["scale"] or SCALE_FALLBACK)


def read_candidate(lat, lon, c, options):
    """One pass: {"status": "reading", ...} or {"status": "not_usable", "why": ...}. Raises SourceDown when NASA did not answer."""
    _, cloud, when, sensor, tile, title, files = c
    flags = box(files["Fmask"], lat, lon, options)
    if flags is None:
        return {"status": "not_usable", "why": "outside"}
    clear, why = clear_box(flags[0])
    if sum(clear) < NEED:
        return {"status": "not_usable", "why": max(why, key=why.get) if any(why.values()) else "cloud"}
    red, nir = box(files["B04"], lat, lon, options), box(files["NIR"], lat, lon, options)
    if red is None or nir is None:
        return {"status": "not_usable", "why": "outside"}
    values = []
    for ok, r, n in zip(clear, red[0], nir[0]):
        if not ok or r != r or n != n or r <= -9000 or n <= -9000:   # -9999 is the file's own "no value"
            continue
        r, n = r * red[1], n * nir[1]
        if r < 0 or n < 0 or r > 1.6 or n > 1.6 or r + n <= 0:
            continue
        v = (n - r) / (n + r)
        if -0.2 <= v <= 1.0:
            values.append(v)
    if len(values) < NEED:
        return {"status": "not_usable", "why": "cloud"}
    return {"status": "reading", "ndvi": round(sum(values) / len(values), 3), "clear": len(values), "date": when, "sensor": sensor, "cloud": cloud, "tile": tile, "granule": title}


def read_period(job):
    """The clearest pass of one period: its reading, or what stopped each candidate. Raises nothing for a pass that is simply not clear."""
    lat, lon, index, cands, options = job
    seen = {"cloud": 0, "snow": 0, "water": 0, "outside": 0}
    errors = looked = 0
    for c in sorted(cands, key=lambda c: (c[1], c[2]))[:TRIES]:
        if common.left() is not None and common.left() < SPARE_S:
            return {"index": index, "skipped": True}
        try:
            got = read_candidate(lat, lon, c, options)
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
    lat, lon = common.latlon(args)
    first, last = window_of(list(args))
    found = candidates(first, last, lat, lon)
    if not found:
        raise Fail("NASA's catalogue lists no Landsat or Sentinel-2 surface-reflectance pass over this place between %s and %s" % (first.isoformat(), last.isoformat()))
    options = common.earthdata_gdal()
    periods = {}
    for c in found:
        periods.setdefault(c[0], []).append(c)
    jobs = [(lat, lon, i, periods[i], options) for i in sorted(periods, reverse=True)]   # the newest period first
    done = common.each(jobs, read_period, 2)
    hard = [e for _, _, e in done if isinstance(e, (SourceDown, Fail))]
    if hard and len(hard) == len(done):
        if all(getattr(e, "status", 0) in (401, 403) for e in hard):
            raise Fail(NO_RIGHTS)
        raise Fail("NASA's satellite greenness files could not be read just now; try again in a minute")
    if not any(r.get("looked") for _, r, e in done if e is None and r) and any(r.get("errors") for _, r, e in done if e is None and r):
        raise Fail("NASA's satellite greenness files could not be read just now; try again in a minute")
    readings, gaps, skipped, errors, why = [], [], [], 0, {"cloud": 0, "snow": 0, "water": 0, "outside": 0}
    for job, result, e in done:
        index = job[2]
        span = [(first + datetime.timedelta(days=index * PERIOD_DAYS)).isoformat(), min(last, first + datetime.timedelta(days=index * PERIOD_DAYS + PERIOD_DAYS - 1)).isoformat()]
        if e is not None:
            errors += 1
            gaps.append(span)
        elif result.get("skipped"):
            skipped.append(span)
        else:
            errors += result["errors"]
            for k, n in result["seen"].items():
                why[k] += n
            if result["reading"]:
                readings.append(result["reading"])
            else:
                gaps.append(span)
    readings.sort(key=lambda r: r["date"])
    passes = [{"date": r["date"], "sensor": r["sensor"], "ndvi": r["ndvi"], "clear_pixels": r["clear"], "of_pixels": (2 * HALF + 1) ** 2, "tile_cloud_pct": r["cloud"], "tile": r["tile"], "granule": r["granule"]} for r in readings]
    out = {
        "source": SOURCE, "data_date": "%s/%s" % (first.isoformat(), last.isoformat()), "units": UNITS, "pixel_m": 30,
        "box": {"pixels": "%dx%d" % (2 * HALF + 1, 2 * HALF + 1), "size_m": 30 * (2 * HALF + 1), "lat": lat, "lon": lon}, "window": {"first": first.isoformat(), "last": last.isoformat()},
        "passes": passes, "periods": len(done), "periods_read": len(passes), "gaps": sorted(gaps), "skipped_periods": sorted(skipped), "not_usable": why, "read_errors": errors,
        "newest_date": passes[-1]["date"] if passes else None, "newest_ndvi": passes[-1]["ndvi"] if passes else None,
        "note": ("How green the field looked from space, about 30 m per dot: the average of the clear dots in a 90 m box round your pin, from the clearest pass of each 15-day period. 0 is bare ground or dead plants, "
                 "about 0.8 is thick healthy green. A dot with cloud, cloud shadow, snow or water is left out, never counted as low greenness, and a period with no clear pass is left empty."),
    }
    notes = []
    if skipped:
        notes.append("%d older period%s not looked at before the time ran out (the newest %d were)" % (len(skipped), "" if len(skipped) == 1 else "s", len(done) - len(skipped)))
    if errors:
        notes.append("%d pass%s could not be read just now" % (errors, "" if errors == 1 else "es"))
    if notes:
        out["incomplete"] = "; ".join(notes)
    if not passes:
        out["why_none"] = "None of the passes looked at gave a clear, snow-free, cloud-free view of the field in the window"
    return out


common.run(main, LIMIT_S, slow="NASA's satellite greenness files took too long to answer; try again in a minute")
