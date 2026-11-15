# imergrain.py LAT LON: the satellite rain of the last 30 days, one value for each day, for the 0.1 degree square that holds the field (written 2026-11-14).
# Reads:   NASA's catalogue (CMR) for the daily GPM IMERG files, the Late Run first and the Early Run only for the days the Late Run does not have yet; then ONE cell
#          (the day's rain, the cell's own longitude and latitude and its time) of each day's file through NASA's OPeNDAP service, never a file. The catalogue is open; the files need the NASA Earthdata login.
# From:    NASA GPM IMERG daily, version 07, from NASA's Goddard Earth Sciences Data and Information Services Center (GES DISC): GPM_3IMERGDL (Late) and GPM_3IMERGDE (Early).
# Returns: {"ok": true, "source", "data_date", "units", "cell", "days": [[YYYY-MM-DD, mm | null, "late" | "early" | null]], "days_read", "total_mm", "late", "early", "not_published", "read_errors", "first_estimate", "newest_day", "note"}
#          or {"ok": false, "reason"}. A day nobody read is null, NEVER 0. The contract: README.md, section "imergrain".
# Keeps:   nothing. The server keeps answers; this lookup keeps no file.
# Checked by: scripts/test_live_imergrain.mjs (offline: the catalogue, the token and NASA's answers hand-made in the real format) and scripts/live_check_imergrain.mjs (by hand, live).
import common   # first, always
import datetime
import math
import urllib.parse
import dap4
from common import Fail, SourceDown

LIMIT_S = 150
DAYS = 30
RUNS = (("late", "GPM_3IMERGDL"), ("early", "GPM_3IMERGDE"))
NEAR = 0.011                   # degrees: the cell that comes back must be the one that was asked for
FILL_BELOW = -9000.0           # the file's own "no value" is -9999.9
MOST_MM = 2000.0               # a day's rain beyond this is not rain, it is a broken value
KM_PER_DEG = 111.195
SOURCE = "NASA GPM IMERG daily rain, version 07 (Late Run, and Early Run for the newest days), from NASA's Goddard Earth Sciences Data and Information Services Center"
UNITS = "Millimetres of rain over the whole day, as one value for the 0.1 degree square that holds the field"
OFF_GRID = "NASA's rain files are no longer on the 0.1 degree grid Crophalo was checked against: no value is better than one from the wrong place"
NO_LOGIN_RIGHTS = "NASA did not let this computer's Earthdata login read the rain files: the login may still need to be approved for NASA GES DISC"


def cell_of(lat, lon):
    """(i, j, centre lat, centre lon) of the 0.1 degree square: i counts from 180 W (0..3599), j from 90 S (0..1799)."""
    i, j = min(3599, int(math.floor((lon + 180.0) * 10 + 1e-9))), min(1799, int(math.floor((lat + 90.0) * 10 + 1e-9)))
    return i, j, round(-89.95 + j * 0.1, 2), round(-179.95 + i * 0.1, 2)


def search(first, last):
    """{day: (run, OPeNDAP address)} for the days first..last: the Late Run, then the Early Run for the days it lacks."""
    wanted = {(first + datetime.timedelta(days=n)).isoformat() for n in range((last - first).days + 1)}
    found = {}
    for run, short in RUNS:
        if not wanted - set(found):
            break
        params = [("short_name", short), ("version", "07"), ("temporal", "%sT00:00:00Z,%sT23:59:59Z" % (first.isoformat(), last.isoformat())), ("sort_key", "start_date")]
        for g in common.cmr_granules(params, limit=100, page_size=100):
            day = str(g.get("time_start", ""))[:10]
            link = next((l["href"] for l in g.get("links", []) if str(l.get("rel", "")).endswith("service#") and str(l.get("href", "")).startswith("https://opendap.earthdata.nasa.gov/")), None)
            if day in wanted and day not in found and link:
                found[day] = (run, link)
    return found


def read_day(job):
    """The day's rain in mm for the cell, or None when the file itself has no value there. Raises SourceDown when NASA did not answer."""
    day, run, link, i, j, cell_lat, cell_lon, headers = job
    ce = "/precipitation[0][%d][%d];/lon[%d];/lat[%d];/time" % (i, j, i, j)
    got = dap4.read_values(common.http(link + ".dap?dap4.ce=" + urllib.parse.quote(ce), headers=headers, timeout=60).body)
    if abs(got["lat"] - cell_lat) > NEAR or abs(got["lon"] - cell_lon) > NEAR:
        raise Fail(OFF_GRID)
    value = got["precipitation"]
    if value != value or value < FILL_BELOW:   # a gap the file itself shows (not a number, or its fill value): nobody read this day
        return None
    if value < 0 or value > MOST_MM:
        raise SourceDown("NASA sent a rain value that cannot be right", "http", 0)
    return round(value, 2)


def main(args):
    lat, lon = common.latlon(args)
    today = common.now().date()
    last, first = today - datetime.timedelta(days=1), today - datetime.timedelta(days=DAYS)   # the satellite has not seen today yet
    i, j, cell_lat, cell_lon = cell_of(lat, lon)
    found = search(first, last)
    if not found:
        raise Fail("NASA has not published its satellite rain for these days yet; try again later")
    headers = common.bearer()
    jobs = [(day, run, link, i, j, cell_lat, cell_lon, headers) for day, (run, link) in sorted(found.items())]
    done = common.each(jobs, read_day)
    errors = [e for _, _, e in done if e is not None]
    if any(isinstance(e, Fail) for e in errors):
        raise next(e for e in errors if isinstance(e, Fail))
    if errors and len(errors) == len(done):
        if all(getattr(e, "status", 0) in (401, 403) for e in errors):
            raise Fail(NO_LOGIN_RIGHTS)
        if any(getattr(e, "kind", "") == "busy" for e in errors):
            raise Fail("NASA's rain service asked us to slow down; try again in a few minutes")
        raise Fail("NASA's satellite rain could not be read just now; try again in a minute")
    values = {job[0]: (result, job[1]) for job, result, e in done if e is None}
    days, late, early, missing = [], 0, 0, []
    for n in range((last - first).days + 1):
        day = (first + datetime.timedelta(days=n)).isoformat()
        mm, run = values.get(day, (None, None))
        if day not in found:
            missing.append(day)
        if mm is None:
            days.append([day, None, None])
            continue
        days.append([day, mm, run])
        late += run == "late"
        early += run == "early"
    read = [d for d in days if d[1] is not None]
    unread = len(errors)
    newest = read[-1][0] if read else None
    width = 0.1 * KM_PER_DEG * math.cos(math.radians(cell_lat))
    out = {
        "source": SOURCE, "data_date": "%s/%s" % (first.isoformat(), last.isoformat()), "units": UNITS,
        "cell": {"lat": cell_lat, "lon": cell_lon, "width_km": round(width, 1), "height_km": round(0.1 * KM_PER_DEG, 1),
                 "edges": {"n": round(cell_lat + 0.05, 2), "s": round(cell_lat - 0.05, 2), "e": round(cell_lon + 0.05, 2), "w": round(cell_lon - 0.05, 2)}},
        "days": days, "days_read": len(read), "total_mm": round(sum(d[1] for d in read), 1) if read else None,
        "late": late, "early": early, "not_published": missing, "read_errors": unread,
        "first_estimate": [d[0] for d in days if d[2] == "early"], "newest_day": newest,
        "note": "One value a day for the whole 0.1 degree square (about %.0f km by %.0f km here), not a gauge in the field. The Early Run days are NASA's first estimate and may change." % (width, 0.1 * KM_PER_DEG),
    }
    if unread or missing:
        out["incomplete"] = ("%d day%s could not be read just now" % (unread, "" if unread == 1 else "s") if unread else "") + ("; " if unread and missing else "") + ("%d day%s not published by NASA yet" % (len(missing), "" if len(missing) == 1 else "s") if missing else "")
    return out


common.run(main, LIMIT_S, slow="NASA's rain service took too long to answer; try again in a minute")
