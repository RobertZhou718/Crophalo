# ndvihist.py LAT LON: how green the land looked at its greenest in every season since 2001: MODIS Terra 16-day greenness (250 m), the median of a patch of about 2 km round the point (written 2026-11-15).
# Reads:   NASA GIBS (open, no login): the list of days it has a 16-day MODIS greenness image for (DescribeDomains), then, for every composite of every season's window, the ONE 256 px map tile that holds the point
#          (a small palette picture whose colours are NASA's own greenness scale), decoded into greenness values. Never a whole file. The seasons are April to September in the north, October to March in the south
#          (named by the year they end) and, in the tropics, 64 days either side of the peak of the last full year.
# From:    NASA MODIS Terra Vegetation Indices, 16-day, 250 m (the MOD13Q1 product), shown through NASA's Global Imagery Browse Services (GIBS), layer MODIS_Terra_L3_NDVI_16Day.
# Returns: {"ok": true, "source", "data_date": "first/last season", "units", "pixel_m", "patch_km", "window", "seasons": [{"year", "peak", "peak_date", "n", "of", "partial", "valid_pixels"}] oldest first, "seasons_read", "years_without",
#          "partial_years", "early", "recent", "change", "browner_years", "sentence", "advice", "note", "incomplete"?} or {"ok": false, "reason"}. A season with too few readings is named, never a 0 and never a made-up peak.
#          The contract: README.md, section "ndvihist".
# Keeps:   nothing. The server keeps answers (30 days is right: a season's peak does not change).
# Checked by: scripts/test_live_ndvihist.mjs (offline: the dates list and the map tiles hand-made in the real formats) and scripts/live_check_ndvihist.mjs (by hand, live).
import common   # first, always
import datetime
import math
import re
import statistics
import warnings
from common import Fail, SourceDown

LIMIT_S = 150
LAYER, TMS, ZOOM, TILE = "MODIS_Terra_L3_NDVI_16Day", "GoogleMapsCompatible_Level9", 9, 256
GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best"
FIRST_SEASON = 2001
HALF = 4                       # a patch of 9 by 9 dots, about 2 km across (a dot is about 250 m)
MIN_PIXELS = 20                # a composite counts when at least this many dots of the patch have a greenness
MIN_READINGS = 3               # a season counts when at least this many of its composites have one
MIN_SEASONS = 10               # and the answer when at least this many seasons do
PARTIAL_BELOW = 0.7            # a season with fewer than this share of its composites read is called partial
SPARE_S = 12                   # stop reading older seasons when fewer seconds than this are left
SOURCE = "NASA MODIS Terra Vegetation Indices, 16-day, 250 m (MOD13Q1), shown through NASA's Global Imagery Browse Services"
UNITS = "NDVI (greenness) of the land round the field, the median of a patch about 2 km across: 0 is bare ground or dead plants and about 0.8 is thick healthy green; one value a season, its greenest 16-day reading"
# NASA's own greenness scale for this layer (colormaps/v1.3, MODIS_L3_NDVI): the picture's palette entry k (1 to 142) stands for the greenness bounded by these; entry 0 is "no data".
STEP_MIDS = [
    -0.1499, -0.0499, 0.0026, 0.0076, 0.0126, 0.0176, 0.0226, 0.0276, 0.0326, 0.0376, 0.0426, 0.0476, 0.0526, 0.0576, 0.0626, 0.0676, 0.0726, 0.0776, 0.0826, 0.0876, 0.0926, 0.0976, 0.1026,
    0.1076, 0.1126, 0.1176, 0.1226, 0.1276, 0.1326, 0.1376, 0.1426, 0.1476, 0.1526, 0.1576, 0.1626, 0.1676, 0.1726, 0.1776, 0.1826, 0.1876, 0.1926, 0.1976, 0.2026, 0.2076, 0.2126, 0.2176,
    0.2226, 0.2276, 0.2326, 0.2376, 0.2426, 0.2476, 0.2526, 0.2576, 0.2626, 0.2676, 0.2726, 0.2776, 0.2826, 0.2876, 0.2926, 0.2976, 0.3038, 0.3114, 0.3188, 0.3264, 0.3338, 0.3414, 0.3488,
    0.3564, 0.3639, 0.3713, 0.3789, 0.3863, 0.3939, 0.4013, 0.4089, 0.4163, 0.4238, 0.4314, 0.4388, 0.4464, 0.4538, 0.4614, 0.4688, 0.4764, 0.4839, 0.4913, 0.4989, 0.5064, 0.5138, 0.5213,
    0.5289, 0.5363, 0.5438, 0.5514, 0.5589, 0.5664, 0.5738, 0.5814, 0.5888, 0.5963, 0.6051, 0.6151, 0.6251, 0.6351, 0.6451, 0.6551, 0.6651, 0.6751, 0.6851, 0.6951, 0.7051, 0.7151, 0.7251,
    0.7351, 0.7451, 0.7551, 0.7651, 0.7751, 0.7851, 0.7951, 0.8051, 0.8151, 0.8251, 0.8351, 0.8451, 0.8551, 0.8651, 0.8751, 0.8851, 0.8951, 0.9051, 0.9151, 0.9251, 0.9351, 0.9451, 0.9551,
    0.9651, 0.9751, 0.9851, 0.9951
]
assert len(STEP_MIDS) == 142


def domains_url():
    return "%s/wmts.cgi?SERVICE=WMTS&REQUEST=DescribeDomains&VERSION=1.0.0&LAYER=%s&TILEMATRIXSET=%s" % (GIBS, LAYER, TMS)


def tile_url(day, x, y):
    return "%s/%s/default/%s/%s/%d/%d/%d.png" % (GIBS, LAYER, day, TMS, ZOOM, y, x)


def tile_of(lat, lon):
    """(tile x, tile y, dot column, dot row inside the tile) of the point on the world map at the layer's zoom."""
    n = 2 ** ZOOM
    lat = max(-85.05112878, min(85.05112878, lat))
    fx = (lon + 180.0) / 360.0 * n
    fy = (1.0 - math.log(math.tan(math.radians(lat)) + 1.0 / math.cos(math.radians(lat))) / math.pi) / 2.0 * n
    x, y = min(n - 1, int(fx)), min(n - 1, int(fy))
    return x, y, min(TILE - 1, int((fx - x) * TILE)), min(TILE - 1, int((fy - y) * TILE))


def parse_domains(text):
    """The days NASA has an image for, from a DescribeDomains answer: "start/end/P16D,start/end/P16D,…" as [(first, last, every)] in days."""
    m = re.search(r"<Domain>([^<]*)</Domain>", text or "")
    out = []
    for part in (m.group(1).split(",") if m else []):
        bits = part.strip().split("/")
        try:
            a, b = datetime.date.fromisoformat(bits[0]), datetime.date.fromisoformat(bits[1])
            every = re.fullmatch(r"P(\d{1,3})D", bits[2])
        except (ValueError, IndexError):
            continue
        if every and a <= b:
            out.append((a, b, int(every.group(1))))
    return sorted(out)


def days_of(ranges, first, last):
    """Every day NASA has an image for between two dates (inclusive)."""
    out = []
    for a, b, every in ranges:
        d = a
        while d <= b:
            if first <= d <= last:
                out.append(d)
            d += datetime.timedelta(days=every)
    return sorted(set(out))


def window_of(lat, ranges, last_year):
    """(label, test) for the season window: April to September in the north, October to March in the south, else 64 days round the last full year's peak (the caller finds it)."""
    if lat >= 23.5:
        return "April to September", lambda d: (d.year, 4 <= d.month <= 9)
    if lat <= -23.5:
        return "October to March", lambda d: (d.year + 1 if d.month >= 10 else d.year, d.month >= 10 or d.month <= 3)
    return "64 days either side of the last full year's peak", None


def decode(body, row, col):
    """The patch's greenness values from one map tile (a palette picture): a list of floats; dots with no data are left out."""
    from rasterio.io import MemoryFile
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            with MemoryFile(body) as mem, mem.open() as src:
                if src.count != 1:
                    raise SourceDown("NASA's map tile was not a palette picture", "http", 0)
                idx = src.read(1)
    except SourceDown:
        raise
    except Exception:   # the raster library's own words can hold an address: only the fact goes on
        raise SourceDown("NASA's map tile could not be read as a picture", "http", 0) from None
    r0, r1, c0, c1 = max(0, row - HALF), min(TILE, row + HALF + 1), max(0, col - HALF), min(TILE, col + HALF + 1)
    patch = idx[r0:r1, c0:c1].ravel()
    return [STEP_MIDS[int(k) - 1] for k in patch if 1 <= int(k) <= len(STEP_MIDS)]


def read_composite(job):
    """(day, median greenness or None, valid dots) of one composite. Raises SourceDown when NASA did not answer."""
    day, x, y, row, col = job
    if common.left() is not None and common.left() < SPARE_S:
        return day, "skipped", 0
    got = decode(common.http(tile_url(day.isoformat(), x, y), timeout=40).body, row, col)
    if len(got) < MIN_PIXELS:
        return day, None, len(got)
    return day, round(statistics.median(got), 3), len(got)


def season_table(readings, windows):
    """{year: {"read": [(day, value, dots)], "of": n}} from the composites that were read, in each season's own year."""
    table = {}
    for year, days in windows.items():
        table[year] = {"of": len(days), "read": sorted([r for r in readings if r[0] in days and isinstance(r[1], float)], key=lambda r: r[0])}
    return table


def main(args):
    lat, lon = common.latlon(args, max_lat=85)
    today = common.now().date()
    last_year = today.year - 1   # the last full year: a season not over is never counted
    try:
        ranges = parse_domains(common.http(domains_url(), timeout=30).body.decode("utf-8", "replace"))
    except SourceDown:
        ranges = []
    if not ranges:
        raise Fail("NASA's image server did not list the days of its greenness record just now; try again later")
    label, which = window_of(lat, ranges, last_year)
    x, y, col, row = tile_of(lat, lon)
    first_day, last_day = datetime.date(FIRST_SEASON - 1, 1, 1), datetime.date(last_year, 12, 31)
    if which is None:   # the tropics: find the peak composite of the last full year first, then 64 days round it
        year_days = days_of(ranges, datetime.date(last_year, 1, 1), datetime.date(last_year, 12, 31))
        done = common.each([(d, x, y, row, col) for d in year_days], read_composite, 2)
        known = [r for _, r, e in done if e is None and isinstance(r, tuple) and isinstance(r[1], float)]
        if len(known) < 12:
            raise Fail("NASA's greenness record had too few readings for the last full year here to find its season")
        peak = max(known, key=lambda r: r[1])[0].timetuple().tm_yday
        lo, hi = peak - 64, peak + 64
        which = lambda d: (d.year, lo <= d.timetuple().tm_yday <= hi)
        label = "64 days either side of the greenest time of last year (day %d)" % peak
    windows = {}
    for d in days_of(ranges, first_day, last_day):
        year, inside = which(d)
        if inside and FIRST_SEASON <= year <= last_year:
            windows.setdefault(year, []).append(d)
    if not windows:
        raise Fail("NASA's record has no greenness images for this place in the seasons asked for")
    jobs = [(d, x, y, row, col) for year in sorted(windows, reverse=True) for d in windows[year]]   # the newest season first, so a short time costs the oldest
    done = common.each(jobs, read_composite, 2)
    errors = [e for _, _, e in done if e is not None]
    if errors and len(errors) == len(done):
        raise Fail("NASA's greenness record could not be read just now; try again in a minute")
    readings = [r for _, r, e in done if e is None and r[1] != "skipped"]
    skipped = sum(1 for _, r, e in done if e is None and r[1] == "skipped")
    table = season_table(readings, {y: set(v) for y, v in windows.items()})
    seasons, without, partial = [], [], []
    for year in sorted(table):
        rows = table[year]["read"]
        if len(rows) < MIN_READINGS:
            without.append(year)
            continue
        best = max(rows, key=lambda r: r[1])
        part = len(rows) < PARTIAL_BELOW * table[year]["of"]
        if part:
            partial.append(year)
        seasons.append({"year": year, "peak": best[1], "peak_date": best[0].isoformat(), "n": len(rows), "of": table[year]["of"], "partial": part, "valid_pixels": best[2]})
    if len(seasons) < MIN_SEASONS:
        raise Fail("NASA's greenness record had greenness for only %d season%s here (it takes %d to say anything)" % (len(seasons), "" if len(seasons) == 1 else "s", MIN_SEASONS))
    summary = compare(seasons)
    out = {"source": SOURCE, "data_date": "%d/%d" % (seasons[0]["year"], seasons[-1]["year"]), "units": UNITS, "pixel_m": 250, "patch_km": 2,
           "window": label, "seasons": seasons, "seasons_read": len(seasons), "years_without": without, "partial_years": partial, **summary,
           "note": "How green the land round the field looked at its greenest each season, from NASA's satellite record since 2001: the median of a patch about 2 km across, not the field alone. A season with too few clear readings is left out and named, never counted as brown."}
    bits = []
    if skipped or errors:
        bits.append("%d reading%s of the older seasons could not be made in time or just now" % (skipped + len(errors), "" if skipped + len(errors) == 1 else "s"))
    if without:
        bits.append("no greenness for %s" % ", ".join(str(y) for y in without))
    if bits:
        out["incomplete"] = "; ".join(bits)
    return out


def compare(seasons):
    """The early and the recent seasons' mean peak and what changed, from the numbers only; the sentence is written only when there is something real to say."""
    by = {s["year"]: s["peak"] for s in seasons}
    early = [by[y] for y in range(2001, 2011) if y in by]
    last = seasons[-1]["year"]
    recent_years = [y for y in range(last - 7, last + 1) if y in by]
    recent = [by[y] for y in recent_years]
    out = {"early": None, "recent": None, "change": None, "browner_years": [], "sentence": None, "advice": None}
    allp = [s["peak"] for s in seasons]
    mean, sd = statistics.mean(allp), (statistics.pstdev(allp) if len(allp) > 1 else 0.0)
    out["browner_years"] = [s["year"] for s in seasons if not s["partial"] and s["peak"] <= mean - max(0.08, 1.5 * sd)]
    if len(early) >= 5 and len(recent) >= 5 and recent_years[0] > 2010:
        e_mean, r_mean = statistics.mean(early), statistics.mean(recent)
        se = math.sqrt(statistics.pvariance(early) / len(early) + statistics.pvariance(recent) / len(recent))
        diff, need = r_mean - e_mean, max(0.04, 2 * se)
        kind = "greener" if diff >= need else "browner" if diff <= -need else "steady"
        out["early"] = {"from": 2001, "to": max(y for y in range(2001, 2011) if y in by), "mean": round(e_mean, 2), "n": len(early)}
        out["recent"] = {"from": recent_years[0], "to": last, "mean": round(r_mean, 2), "n": len(recent)}
        out["change"] = {"kind": kind, "difference": round(diff, 3), "needed": round(need, 3)}
        if kind == "steady":
            out["sentence"] = "Peak greenness has been steady since 2001" + ("; browner seasons: %s." % ", ".join(str(y) for y in out["browner_years"]) if out["browner_years"] else ".")
        else:
            out["sentence"] = "The land here is %s at its peak since %d than in %d–%d (about %.2f now, %.2f then)." % (kind, recent_years[0], 2001, out["early"]["to"], r_mean, e_mean)
            if kind == "greener":
                out["advice"] = "This often means fields nearby started to be watered or changed crop: ask the seller."
    return out


common.run(main, LIMIT_S, slow="NASA's greenness record took too long to answer; try again in a minute")
