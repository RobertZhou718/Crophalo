# ecopass.py LAT LON: every clear ECOSTRESS pass over the field in the last 365 days, the ground temperature of the field's own 70 m pixel in each, and how many clear daytime passes were 45 C or more (written 2026-11-14, widened to a year 2026-11-15).
# Reads:   NASA's catalogue (CMR) for the tiled ECOSTRESS land-surface-temperature granules over the point; then ONE pixel (the pixel that holds the field) of five small layers of each
#          granule (temperature, its error, the quality code, the cloud mask, the water mask) as range reads of the GeoTIFF files, never a whole file. The catalogue is open; the files need the NASA Earthdata login.
# From:    NASA ECOSTRESS ECO_L2T_LSTE (tiled land surface temperature and emissivity, 70 m), version 003 and, for a pass version 003 lacks, version 002, from NASA's Land Processes DAAC (LP DAAC).
# Returns: {"ok": true, "source", "data_date", "units", "pixel_m", "window", "passes": [{"date", "utc", "solar_time", "day_night", "lst_c", "lst_k", "error_k", "orbit", "version", "granule"}],
#          "clear_passes", "summary": {"day_clear", "night_clear", "hot_days", "hot_c", "hot_source", "max_day_c", "max_day_date"}, "passes_found", "passes_checked", "not_usable": {"cloud", "quality", "water", "no_data"}, "read_errors", "newest_clear", "note", "incomplete"?} or {"ok": false, "reason"}. A pixel that is cloudy, of lower quality, water or not seen is NEVER a reading.
#          The contract: README.md, section "ecopass".
# Keeps:   what each pass held at the field's pixel (a pass never changes), a few bytes a pass under FW_CACHE/ecopass, so the next run reads only the passes that are new. The server keeps the answers.
# Checked by: scripts/test_live_ecopass.mjs (offline: the catalogue, the token and small GeoTIFFs built the real way) and scripts/live_check_ecopass.mjs (by hand, live).
import common   # first, always
import datetime
import json
import os
import re
import math
import urllib.error
import urllib.parse
import urllib.request
from common import Fail, SourceDown

LIMIT_S = 150
DAYS = 365                     # one year of passes: the pass list is a year long so a farmer sees the whole growing season, not the last two months
WANT = 250                     # clear passes to give at most: a year holds about a hundred, this only bounds the size of the answer
MOST_CHECKED = 400             # passes looked at at most (newest first); the time left, not this number, is what stops a cold first run (see SPARE_S), and every pass read is kept for the next run
HOT_C = 45.0                   # degrees C: the ground temperature counted as "hot enough to hurt seedlings". Source: Peacock, Wilson, Stewart and others, Crop Science 30(1):138-143 (1990), where soil above 45 C stopped sorghum seedlings establishing in the field. It is a sorghum finding, so the card says so; other crops differ.
HOT_SOURCE = "Peacock et al., Crop Science 30(1):138-143 (1990): soil above 45 C inhibited field establishment of sorghum seedlings"
BATCH = 6
NEW_PER_ASK = max(1, min(400, int(os.environ.get("FW_ECO_NEW_PER_ASK", "60") or 60)))   # passes read for the first time in one ask at most: a year is read over a few asks, newest first, each pass kept for good (a test sets a small number to see two asks in a row)
SPARE_S = 25                   # stop looking at new passes when fewer seconds than this are left
SHORT = "ECO_L2T_LSTE"
VERSIONS = ("003", "002")      # the newest version first; a pass is taken from the first version that has it
LAYERS = ("LST", "LST_err", "QC", "cloud", "water")
LST_LOW, LST_HIGH = 200.0, 360.0   # kelvin: a land-surface temperature outside this is a broken value, not weather
SOURCE = "NASA ECOSTRESS tiled land surface temperature, 70 m (ECO_L2T_LSTE), from NASA's Land Processes DAAC"
UNITS = "Ground (surface skin) temperature seen from space for one 70 m pixel, in degrees Celsius (and kelvin), at the time of each pass; not the air temperature"
NO_RIGHTS = "NASA did not let this computer's Earthdata login read the ECOSTRESS files: the login may still need to be approved for NASA LP DAAC"
KEY = re.compile(r"_(\d{5})_(\d{3})_([0-9A-Z]{5})_")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_resolver = urllib.request.build_opener(_NoRedirect)


def signed(url, headers):
    """The address NASA's archive sends a file to: the archive answers a request for a file with a short-lived address on its content network, and asking for that address
    first lets the archive's slow step (about a second a file) and the content network's quick reads run at the same time instead of one after the other. The login goes to the
    archive only, never to the content network. Returns the file's own address when it is not sent on, or when the answer cannot be read; a refused login raises."""
    if common.REPLAY:
        return url
    host = urllib.parse.urlsplit(url).netloc.lower()
    req = urllib.request.Request(url, headers={**headers, "Range": "bytes=0-0", "User-Agent": common.USER_AGENT})
    try:
        with common._Gate(host):
            common._count()
            try:
                with _resolver.open(req, timeout=30):
                    return url
            except urllib.error.HTTPError as e:
                if e.code in (301, 302, 303, 307, 308):
                    where = e.headers.get("Location", "")
                    return where if where.startswith("https://") and urllib.parse.urlsplit(where).netloc.lower() != host else url
                if e.code in (401, 403):
                    raise common.SourceDown("HTTP %d from %s" % (e.code, host), "http", e.code) from None
                return url
    except (urllib.error.URLError, OSError, TimeoutError):
        return url


def passes_over(first, last, lat, lon):
    """[(orbit key, version, granule)] newest first: version 003's passes, then version 002's passes that 003 lacks."""
    taken, out = set(), []
    for version in VERSIONS:
        params = [("short_name", SHORT), ("version", version), ("point", "%s,%s" % (lon, lat)), ("sort_key", "-start_date"),
                  ("temporal", "%sT00:00:00Z,%sT23:59:59Z" % (first.isoformat(), last.isoformat()))]
        for g in common.cmr_granules(params, limit=400, page_size=100):
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


def one(headers, lat, lon, url, options):
    """The single pixel's value at the point, or None when the point is outside the file or the file has no value there."""
    where = signed(url, headers)
    if where != url:   # a signed address carries its own permission: no login, and no list of file kinds (its query is part of the address)
        options = {k: v for k, v in common.gdal_options().items() if k != "CPL_VSIL_CURL_ALLOWED_EXTENSIONS"}
    got = common.read_window(where, lat, lon, half=0, options=options)
    if got is None:
        return None
    v = float(got["values"].ravel()[0])
    return None if v != v else v


def kept_file(granule, lat, lon):
    return common.cache_dir("ecopass") / ("%s_%.4f_%.4f.json" % (re.sub(r"[^A-Za-z0-9_.-]", "_", granule), lat, lon))


def read_pass(job):
    """One pass: {"status": "clear" | "cloud" | "quality" | "water" | "no_data", ...}. Raises SourceDown when NASA did not answer.
    A pass is read at the field's pixel only once: what it held is kept (a pass never changes), and the cloud mask is read first (it also says when the pixel was not seen)."""
    lat, lon, key, version, granule, files, options, headers = job
    name = str(granule.get("title", ""))
    file = kept_file(name, lat, lon)
    try:
        kept = json.loads(file.read_text(encoding="utf-8"))
        if kept.get("status") in ("clear", "cloud", "quality", "water", "no_data"):
            return {**kept, "_kept": True}   # read in an earlier ask: nothing is asked of NASA again
    except (OSError, ValueError):
        pass
    result = read_fresh(lat, lon, files, options, headers)
    try:
        common.atomic_write(file, json.dumps(result).encode("utf-8"))
    except (OSError, ValueError):
        pass   # a full or locked folder costs only the saving
    return result


def read_fresh(lat, lon, files, options, headers):
    cloud = one(headers, lat, lon, files["cloud"], options)
    if cloud is None or cloud not in (0.0, 1.0):
        return {"status": "no_data"}   # 255 is the file's own "not known": nobody saw this pixel clear
    if cloud == 1.0:
        return {"status": "cloud"}
    qc = one(headers, lat, lon, files["QC"], options)
    if qc is None or int(qc) & 3 != 0:   # only the best quality counts: "nominal" includes possible cloud contamination
        return {"status": "quality"}
    lst = one(headers, lat, lon, files["LST"], options)
    if lst is None:
        return {"status": "no_data"}
    water = one(headers, lat, lon, files["water"], options)
    if water is None or water != 0.0:
        return {"status": "water"}
    if not LST_LOW <= lst <= LST_HIGH:
        return {"status": "quality"}
    err = one(headers, lat, lon, files["LST_err"], options)
    return {"status": "clear", "lst": lst, "err": err if err is not None and 0 <= err < 50 else None}


def main(args):
    lat, lon = common.latlon(args, max_lat=52)
    today = common.now().date()
    first, last = today - datetime.timedelta(days=DAYS), today
    found = passes_over(first, last, lat, lon)
    if not found:
        raise Fail("NASA's catalogue lists no ECOSTRESS pass over this place in the last %d days (ECOSTRESS flies between 52 N and 52 S and does not see every place every week)" % DAYS)
    options = common.earthdata_gdal()
    headers = common.bearer()
    found = found[:MOST_CHECKED]
    n_found = len(found)
    results, clear, orbits, counts, errors, done_n, rushed = [], [], set(), {"cloud": 0, "quality": 0, "water": 0, "no_data": 0}, [], 0, False
    new_n, kept_n, end = 0, 0, 0   # passes read for the first time, passes taken from what earlier asks kept, and how far down the list (newest first) this ask got
    for at in range(0, len(found), BATCH):
        if len(clear) >= WANT:
            break
        if (common.left() is not None and common.left() < SPARE_S and done_n) or (new_n >= NEW_PER_ASK and done_n):
            rushed = True   # the time, or this ask's allowance of new reads, is used: the next ask goes on from here (what was read is kept)
            break
        batch = found[at:at + BATCH]
        jobs = [(lat, lon, key, version, g, files, options, headers) for key, version, g, files in batch]
        end = at + len(batch)
        for (job, result, error) in common.each(jobs, read_pass, 4):
            done_n += 1
            if error is not None:
                errors.append(error)
                continue
            if result.get("_kept"):
                kept_n += 1
            else:
                new_n += 1
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
    day_clear = [p for p in clear if p["day_night"] == "day"]
    hot_days = len({p["solar_date"] for p in day_clear if p["lst_c"] >= HOT_C})   # days, not passes: two hot passes on one day count once
    hottest = max(day_clear, key=lambda p: p["lst_c"]) if day_clear else None
    summary = {"day_clear": len({p["solar_date"] for p in day_clear}), "night_clear": len([p for p in clear if p["day_night"] == "night"]), "hot_days": hot_days, "hot_c": HOT_C, "hot_source": HOT_SOURCE,
               "max_day_c": hottest["lst_c"] if hottest else None, "max_day_date": hottest["solar_date"] if hottest else None}
    back = found[end - 1][2].get("time_start", "")[:10] if end else ""
    complete = bool(end >= n_found and not errors and not rushed)
    coverage = {"found": n_found, "examined": end, "back_to": back or None, "kept": kept_n, "newly_read": new_n, "complete": complete}
    out = {
        "source": SOURCE, "data_date": clear[0]["date"] if clear else "%s/%s" % (first.isoformat(), last.isoformat()), "units": UNITS,
        "pixel_m": 70, "window": {"first": first.isoformat(), "last": last.isoformat()}, "passes": clear, "clear_passes": len(clear), "summary": summary, "passes_found": n_found,
        "passes_checked": done_n - len(errors), "coverage": coverage, "not_usable": counts, "read_errors": len(errors), "newest_clear": clear[0]["date"] if clear else None,
        "note": ("The ground temperature of the 70 m pixel that holds your field, seen from space by the ECOSTRESS instrument on the International Space Station: the temperature of the surface (soil, leaves, snow), "
                 "not the air temperature. It passes at different times of day, so only compare passes made at about the same hour. A pixel with cloud, lower quality or water is never used."),
    }
    notes = []
    if errors:
        notes.append("%d pass%s could not be read just now" % (len(errors), "" if len(errors) == 1 else "es"))
    if rushed or (not complete and end < n_found):
        notes.append("so far the newest %d of %d passes were read, back to %s; the rest are read on the next ask" % (end, n_found, back or "the newest day"))
    if not clear:
        out["why_none"] = "None of the %d passes checked in the last %d days gave a clear, best-quality reading of the field's pixel" % (done_n - len(errors), DAYS)
    if notes:
        out["incomplete"] = "; ".join(notes)
    return out


common.run(main, LIMIT_S, slow="NASA's ECOSTRESS files took too long to answer; try again in a minute")
