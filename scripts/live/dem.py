# dem.py LAT LON W D NX NY [SOURCE]: ground heights on a farm-sized grid, from the finest free height map at the place
# (written 2026-11-14).
# Reads:   one window of a height map per source tried, in this order, each only where it maps:
#          Canada's lidar (1 m, then 2 m), the US lidar and the US 10 m map, Canada's 30 m map, the Netherlands' lidar,
#          England's lidar, Spain's 5 m map, France's 1 m map, then the two world maps (Copernicus GLO-30, NASADEM).
# From:    Natural Resources Canada, the US Geological Survey, PDOK (NL), the Environment Agency (England), IGN Spain,
#          IGN France, Copernicus (ESA, on Amazon's open data), NASA JPL (on Microsoft's Planetary Computer). No login.
# Returns: {"ok": true, "source", "source_id", "name", "native_m", "res_m", "kind", "credit", "licence", "data_date",
#           "units", "grid", "cover", "filled", "tried", "h": base64 float32 [ny][nx], ...}  or  {"ok": false, "reason"}.
#          The contract: README.md, section "dem".
# Checked by: scripts/test_live_dem.mjs (offline). Recorded by hand, live: scripts/record_live_heights.mjs.
import common   # first, always: it takes stdout away from every library
import base64
import json
import math
import re
import urllib.parse
from common import Fail, SourceDown

LIMIT_S = 120   # the server's time limit; common.run answers by itself a little before it
SOFT_S = 75     # once some heights are in hand, no further map is started after this many seconds
ENOUGH = 0.95   # the first map that has a height at this share of the grid points is the answer; the next only fills its gaps
REQUIRED = "lat, lon, width, depth and the grid size are required"
BOX = "The box must be 20 m to 8 km a side, with 2 to 257 points"
NOBODY = "No height map answered for this place right now"
OUTSIDE = "This place is outside what the height maps cover"
SLOW = "The height maps took too long to answer; try again in a minute"

# where each national map is asked at all: (south, north, west, east) in degrees; the farm's middle decides
REGIONS = {
    "CA": [(41.6, 83.2, -141.1, -52.5)],
    "US": [(24.4, 49.4, -125.0, -66.9), (51.0, 71.5, -180.0, -129.9), (18.8, 22.3, -160.3, -154.7), (17.6, 18.6, -67.4, -64.5)],
    "NL": [(50.7, 53.6, 3.3, 7.3)],
    "EN": [(49.8, 55.9, -6.5, 1.8)],
    "ES": [(35.9, 43.9, -9.4, 4.4), (27.6, 29.5, -18.2, -13.3)],
    "FR": [(41.3, 51.2, -5.3, 9.7)],
}
# Canada's lidar before the US one where both map: its search answers in under a second, the US service can take far longer
CHAIN = [("hrdem", "CA"), ("hrdem2", "CA"), ("usgs3dep", "US"), ("usgs13", "US"), ("mrdem", "CA"), ("ahn", "NL"), ("ea", "EN"),
         ("ign-es", "ES"), ("ign-fr", "FR"), ("glo30", None), ("nasadem", None)]
OGL_CA = "Contains information licensed under the Open Government Licence - Canada (Natural Resources Canada)"
SOURCES = {   # kind: DTM = the bare ground; DSM = the top of whatever covers it (trees, roofs). wait: this map's own time limit, seconds
    "hrdem": dict(name="NRCan HRDEM lidar", by="Natural Resources Canada", native_m=1, kind="DTM", wait=40, credit=OGL_CA,
                  licence="Open Government Licence - Canada", datum="CGVD2013"),
    "hrdem2": dict(name="NRCan HRDEM lidar", by="Natural Resources Canada", native_m=2, kind="DTM", wait=40, credit=OGL_CA,
                   licence="Open Government Licence - Canada", datum="CGVD2013"),
    "usgs3dep": dict(name="USGS 3DEP lidar", by="US Geological Survey", native_m=1, kind="DTM", wait=60,
                     credit="U.S. Geological Survey, 3D Elevation Program (3DEP)", licence="Public domain", datum="NAVD 88"),
    "usgs13": dict(name="USGS 3DEP 1/3 arc-second", by="US Geological Survey", native_m=10, kind="DTM", wait=40,
                   credit="U.S. Geological Survey, 3D Elevation Program (3DEP)", licence="Public domain", datum="NAVD 88"),
    "mrdem": dict(name="NRCan MRDEM", by="Natural Resources Canada", native_m=30, kind="DTM", wait=40, credit=OGL_CA,
                  licence="Open Government Licence - Canada", datum="CGVD2013"),
    "ahn": dict(name="AHN4 (Netherlands)", by="Rijkswaterstaat, through PDOK", native_m=0.5, kind="DTM", wait=40,
                credit="Actueel Hoogtebestand Nederland (AHN4), through PDOK", licence="CC0 1.0", datum="NAP"),
    "ea": dict(name="Environment Agency lidar (England)", by="Environment Agency", native_m=1, kind="DTM", wait=25,
               credit="(c) Environment Agency copyright and/or database right. All rights reserved.", licence="Open Government Licence v3.0",
               datum="Ordnance Datum Newlyn"),
    "ign-es": dict(name="IGN MDT05 (Spain)", by="Instituto Geografico Nacional, Spain", native_m=5, kind="DTM", wait=30,
                   credit="MDT05 (c) Instituto Geografico Nacional de Espana (CNIG), scne.es", licence="CC BY 4.0", datum="Spain's national height system"),
    "ign-fr": dict(name="IGN RGE ALTI (France)", by="IGN France", native_m=1, kind="DTM", wait=30,
                   credit="RGE ALTI (c) IGN France", licence="Licence Ouverte 2.0 (Etalab)", datum="NGF-IGN69"),
    "glo30": dict(name="Copernicus DEM GLO-30", by="ESA and the European Union", native_m=30, kind="DSM", wait=50,
                  credit="Copernicus DEM GLO-30 (c) DLR e.V. 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA",
                  licence="Copernicus DEM licence (free, including commercial use)", datum="EGM2008"),
    "nasadem": dict(name="NASADEM", by="NASA JPL, through Microsoft Planetary Computer", native_m=30, kind="DSM", wait=45,
                    credit="NASADEM, NASA JPL (2020), through Microsoft Planetary Computer", licence="Public domain", datum="EGM96"),
}
# The period each fixed map was surveyed in, where the service itself gives no date. As each publisher states it for its
# whole map: the year at one field is not given.
SURVEYED = {
    "ahn": ("2020/2022", "Laser flights of 2020 to 2022 (AHN4), as the publisher states for the whole map"),
    "ea": ("2000-06/2022-04", "Laser flights from 2000 to 2022, put together by the Environment Agency: the year at one field is not given"),
    "ign-es": ("2008/2015", "Laser flights of 2008 to 2015 (Spain's first national coverage), as the publisher states for the whole map"),
    "ign-fr": ("2009 onwards", "IGN France keeps this map up to date from surveys flown since 2009: the year at one field is not given"),
    "glo30": ("2010-12/2015-01", "Radar flights from 2010 to 2015 (TanDEM-X)"),
    "nasadem": ("2000-02", "Radar flight of the Space Shuttle Endeavour, eleven days in the February of 2000"),
}


class Got:
    """What one map gave: h (heights at the grid points, NaN where it has none), its real cell, the date of its data."""

    def __init__(self, h, native_m, data_date, note):
        self.h, self.native_m, self.data_date, self.note = h, native_m, data_date, note


class Farm:
    def __init__(self, lat, lon, w, d, nx, ny):
        import heights
        self.lat, self.lon, self.w, self.d, self.nx, self.ny = lat, lon, w, d, nx, ny
        self.x, self.y, self.lons, self.lats = heights.grid(lat, lon, w, d, nx, ny)
        self.step = min(w / (nx - 1), d / (ny - 1))

    def cell(self, native_m):
        """The cell a map is read at: its own, or the grid's step when that is coarser (a finer read would be thrown away)."""
        return max(float(native_m), self.step)

    def box_in(self, epsg, margin):
        """The grid's box in another map's metres, widened by `margin`: (x0, y0, x1, y1)."""
        import heights
        from rasterio.crs import CRS
        xs, ys = heights.to_crs(heights.WGS84, CRS.from_epsg(epsg), self.lons, self.lats)
        return xs.min() - margin, ys.min() - margin, xs.max() + margin, ys.max() + margin


def in_region(name, lat, lon):
    return any(s <= lat <= n and w <= lon <= e for s, n, w, e in REGIONS[name])


# ---- the maps, one reader each. A reader returns Got, or None when the map has nothing here; a service that does not
#      answer raises SourceDown. No reader ever makes up a height or a date.
def read_hrdem(farm, key):
    import heights
    box = "%.5f,%.5f,%.5f,%.5f" % (farm.lons.min(), farm.lats.min(), farm.lons.max(), farm.lats.max())
    found = common.http("https://datacube.services.geo.ca/stac/api/search?collections=hrdem-mosaic-%dm&bbox=%s&limit=5"
                        % (SOURCES[key]["native_m"], box), timeout=15, tries=1).json()
    items = [f for f in found.get("features", []) if str(f.get("assets", {}).get("dtm", {}).get("href", "")).startswith("https://")]
    patches, h, day = [], None, None
    for item in items[:3]:
        patch = heights.read_cog(item["assets"]["dtm"]["href"], farm.lons, farm.lats, farm.cell(SOURCES[key]["native_m"]))
        if patch is None:
            continue
        patches.append(patch)
        day = day or str(item.get("properties", {}).get("datetime") or "")[:10] or heights.tag_day(patch.tags)
        h = heights.real_heights(heights.sample_all(patches, farm.lons, farm.lats))
        if cover(h) >= ENOUGH:
            break
    if h is None:
        return None
    if not re.fullmatch(r"\d{4}-\d\d-\d\d", day or ""):
        raise SourceDown("Canada's lidar gave no date for its map", "http")
    return Got(h, SOURCES[key]["native_m"], day, "The day Natural Resources Canada put this lidar mosaic together: the laser flights are older, and the service does not give their year")


def usgs_day(value):
    """20270404, "20271205" or milliseconds since 1970 -> "2027-04-04"; None for anything else."""
    import datetime
    text = str(value if value is not None else "").strip()
    try:
        if re.fullmatch(r"(19|20)\d{6}", text):
            return datetime.datetime.strptime(text, "%Y%m%d").strftime("%Y-%m-%d")
        if re.fullmatch(r"\d{11,14}", text):
            return datetime.datetime.fromtimestamp(int(text) / 1000, datetime.timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, OverflowError, OSError):
        pass
    return None


def read_usgs3dep(farm, key):
    import heights
    from rasterio.crs import CRS
    service = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/"
    spot = urllib.parse.quote(json.dumps({"x": round(farm.lon, 6), "y": round(farm.lat, 6), "spatialReference": {"wkid": 4326}}, separators=(",", ":")))
    reply = common.http(service + "getSamples?geometry=%s&geometryType=esriGeometryPoint&returnFirstValueOnly=true&outFields=*&f=json" % spot, timeout=15, tries=1).json()
    one = (reply.get("samples") or [{}])[0] if isinstance(reply, dict) else {}
    try:
        native, value = float(one.get("resolution")), float(one.get("value"))
    except (TypeError, ValueError):
        return None   # "NoData": no height at all at the farm's middle
    if not (0 < native <= 5 and math.isfinite(value)):
        return None   # only laser scans (5 m or finer) count as this map; coarser is the 10 m map's job
    facts = one.get("attributes") or {}
    first, last = usgs_day(facts.get("StartDate")), usgs_day(facts.get("EndDate"))
    flown = usgs_day(facts.get("AcquisitionDate"))
    if not ((first and last) or flown):
        raise SourceDown("the US lidar service gave no flight date", "http")
    project = re.sub(r"[^A-Za-z0-9_ .-]", "", str(facts.get("Name") or ""))[:60]
    cell = farm.cell(native)
    zone = int((farm.lon + 180) // 6) % 60 + 1
    epsg = 32600 + zone   # the UTM zone of the farm's middle
    x0, y0, x1, y1 = farm.box_in(epsg, 3 * cell + 1)
    cell = max(cell, (x1 - x0) / 4000, (y1 - y0) / 4000)   # the service draws at most 4,000 cells a side
    wide, high = int(math.ceil((x1 - x0) / cell)), int(math.ceil((y1 - y0) / cell))
    x1, y1 = x0 + wide * cell, y0 + high * cell
    got = common.http(service + "exportImage?bbox=%.1f,%.1f,%.1f,%.1f&bboxSR=%d&imageSR=%d&size=%d,%d&format=tiff&compression=LZ77&pixelType=F32"
                      "&noData=-9999&interpolation=RSP_BilinearInterpolation&f=image" % (x0, y0, x1, y1, epsg, epsg, wide, high), timeout=40, tries=1)
    if not got.headers.get("content-type", "").startswith("image/tiff"):
        raise SourceDown("the US lidar service sent no map piece", "http", got.status)
    h = heights.real_heights(heights.sample(heights.from_bytes(got.body, CRS.from_epsg(epsg), "the US lidar service"), farm.lons, farm.lats))
    note = "Laser flights%s, as the US Geological Survey gives them for the farm's middle" % (" of the project " + project if project else "")
    return Got(h, native, "%s/%s" % (first, last) if first and last and first != last else (first or flown), note)


def read_tiles(farm, key, address, wait=30):
    """A map cut in one-degree tiles: ask which tiles exist, then read the window of each. Returns (heights, newest
    publishing day) or (None, None) when the host has no tile here."""
    import heights
    patches, days = [], []
    for south, west in heights.tile_names(farm.lons, farm.lats):
        url = address(south, west)
        if url is None:
            continue
        there, day = heights.exists(url)
        if not there:
            continue
        patch = heights.read_cog(url, farm.lons, farm.lats, farm.cell(SOURCES[key]["native_m"]), timeout=wait)
        if patch is not None:
            patches.append(patch)
            days.append(day)
    if not patches:
        return None, None
    return heights.real_heights(heights.sample_all(patches, farm.lons, farm.lats)), max((d for d in days if d), default=None)


def read_usgs13(farm, key):
    def address(south, west):
        if south < 0 or west >= 0:
            return None   # this map names its tiles by a north and a west edge only
        name = "n%02dw%03d" % (south + 1, -west)
        return "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/%s/USGS_13_%s.tif" % (name, name)

    h, day = read_tiles(farm, key, address)
    if h is None:
        return None
    if not day:
        raise SourceDown("the US 10 m map gave no date for its tile", "http")
    return Got(h, 10, day, "The day the US Geological Survey last published this map tile: it is put together from surveys of many years, and the year at one field is not given")


def read_mrdem(farm, key):
    import heights
    patch = heights.read_cog("https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30/mrdem-30-dtm.tif", farm.lons, farm.lats, farm.cell(30))
    if patch is None:
        return None
    day = heights.tag_day(patch.tags)
    if not day:
        raise SourceDown("Canada's 30 m map gave no date", "http")
    return Got(heights.real_heights(heights.sample(patch, farm.lons, farm.lats)), 30, day,
               "The day Natural Resources Canada built this map file: the surveys in it are older, and the file does not give their year")


def service_piece(farm, key, url, epsg, what):
    """One small GeoTIFF from a map service (WCS or WMS), read at the grid points. A service that says the box is outside
    its map (HTTP 400 with its "extent" words) has nothing here: None."""
    import heights
    from rasterio.crs import CRS
    try:
        got = common.http(url, timeout=SOURCES[key]["wait"], tries=1)
    except SourceDown as e:
        if e.status in (400, 404) and re.search(rb"ExtentError|does not intersect|outside", e.body or b"", re.IGNORECASE):
            return None
        raise
    if "tiff" not in got.headers.get("content-type", ""):
        raise SourceDown("%s sent no map piece" % what, "http", got.status)
    h = heights.real_heights(heights.sample(heights.from_bytes(got.body, CRS.from_epsg(epsg), what), farm.lons, farm.lats))
    return Got(h, SOURCES[key]["native_m"], *SURVEYED[key])


def whole_box(farm, epsg, margin):
    x0, y0, x1, y1 = farm.box_in(epsg, margin)
    return math.floor(x0), math.floor(y0), math.ceil(x1), math.ceil(y1)


def read_ahn(farm, key):
    cell = farm.cell(0.5)
    thin = max(0.0625, min(1.0, 0.5 / cell))   # never finer than the working cell: a 2 km box at 0.5 m would take a minute
    box = whole_box(farm, 28992, 3 * 0.5 / thin + 1)
    return service_piece(farm, key, "https://service.pdok.nl/rws/ahn/wcs/v1_0?service=WCS&request=GetCoverage&version=2.0.1&coverageid=dtm_05m"
                         "&format=image/tiff&subset=x(%d,%d)&subset=y(%d,%d)&scalefactor=%.4f" % (box[0], box[2], box[1], box[3], thin), 28992, "the Dutch height service")


def read_ea(farm, key):
    cell = farm.cell(1)
    thin = max(0.05, min(1.0, 1.0 / cell))
    box = whole_box(farm, 27700, 3 / thin + 1)
    return service_piece(farm, key, "https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs?service=WCS&version=2.0.1"
                         "&request=GetCoverage&CoverageId=13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m&format=image/tiff"
                         "&subset=E(%d,%d)&subset=N(%d,%d)%s" % (box[0], box[2], box[1], box[3], "&SCALEFACTOR=%.4f" % thin if thin < 1 else ""), 27700, "England's height service")


def read_ign_es(farm, key):
    box = whole_box(farm, 25830, 3 * 5 + 1)
    return service_piece(farm, key, "https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=Elevacion25830_5"
                         "&SUBSET=x(%d,%d)&SUBSET=y(%d,%d)&FORMAT=image/tiff" % (box[0], box[2], box[1], box[3]), 25830, "Spain's height service")


def read_ign_fr(farm, key):
    cell = farm.cell(1)
    x0, y0, x1, y1 = farm.box_in(2154, 3 * cell + 1)
    cell = max(cell, (x1 - x0) / 4000, (y1 - y0) / 4000)
    wide, high = int(math.ceil((x1 - x0) / cell)), int(math.ceil((y1 - y0) / cell))
    return service_piece(farm, key, "https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES&STYLES="
                         "&CRS=EPSG:2154&BBOX=%.1f,%.1f,%.1f,%.1f&WIDTH=%d&HEIGHT=%d&FORMAT=image/geotiff" % (x0, y0, x0 + wide * cell, y0 + high * cell, wide, high), 2154, "France's height service")


def glo30_url(south, west):
    name = "Copernicus_DSM_COG_10_%s%02d_00_%s%03d_00_DEM" % ("N" if south >= 0 else "S", abs(south), "E" if west >= 0 else "W", abs(west))
    return "https://copernicus-dem-30m.s3.amazonaws.com/%s/%s.tif" % (name, name)


def read_glo30(farm, key):
    h, day = read_tiles(farm, key, glo30_url)
    if h is None:
        return None
    period, note = SURVEYED[key]
    return Got(h, 30, period, note + ("; this tile was published on " + day if day else ""))


def read_nasadem(farm, key):
    import heights
    if not -56 <= farm.lat <= 60:
        return None   # the shuttle's radar saw the land between 56 S and 60 N only
    word = common.http("https://planetarycomputer.microsoft.com/api/sas/v1/token/nasademeuwest/nasadem-cog", timeout=15, tries=1).json()
    word = word.get("token") if isinstance(word, dict) else None   # a short-lived access word anyone may ask for: used, never logged
    if not word or not isinstance(word, str):
        raise SourceDown("no access word came back for NASADEM", "http")
    patches = []
    for south, west in heights.tile_names(farm.lons, farm.lats):
        url = "https://nasademeuwest.blob.core.windows.net/nasadem-cog/v001/NASADEM_HGT_%s%02d%s%03d.tif" % ("n" if south >= 0 else "s", abs(south), "e" if west >= 0 else "w", abs(west))
        if not heights.exists(url, query=word)[0]:
            continue
        patch = heights.read_cog(url, farm.lons, farm.lats, farm.cell(30), query=word)
        if patch is not None:
            patches.append(patch)
    if not patches:
        return None
    return Got(heights.real_heights(heights.sample_all(patches, farm.lons, farm.lats)), 30, *SURVEYED[key])


READERS = {"hrdem": read_hrdem, "hrdem2": read_hrdem, "usgs3dep": read_usgs3dep, "usgs13": read_usgs13, "mrdem": read_mrdem, "ahn": read_ahn,
           "ea": read_ea, "ign-es": read_ign_es, "ign-fr": read_ign_fr, "glo30": read_glo30, "nasadem": read_nasadem}


# ---- putting the answer together
def cover(h):
    import numpy as np
    return float(np.isfinite(h).mean())


def near_gaps(gaps, reach=3):
    """The grid points within `reach` points of a gap (the gaps themselves included)."""
    import numpy as np
    out = np.zeros_like(gaps)
    rows, cols = gaps.shape
    for di in range(-reach, reach + 1):
        for dj in range(-reach, reach + 1):
            out[max(0, di):rows + min(0, di), max(0, dj):cols + min(0, dj)] |= gaps[max(0, -di):rows + min(0, -di), max(0, -dj):cols + min(0, -dj)]
    return out


def fill_gaps(h, other):
    """Fill h's gaps from another map, set level with h first: two maps rarely share one sea level, and a pasted piece
    would stand as a pit or a pillar. The step between them is the median of (h - other) over the points both have within
    3 points of a gap; with fewer than 8 such points the gaps stay unknown. Returns (heights, share filled, step) or None."""
    import numpy as np
    gaps = ~np.isfinite(h)
    both = np.isfinite(h) & np.isfinite(other) & near_gaps(gaps)
    can = gaps & np.isfinite(other)
    if both.sum() < 8 or not can.any():
        return None
    step = float(np.median(h[both] - other[both]))
    out = h.copy()
    out[can] = other[can] + step
    return out, float(can.mean()), step


def words(key, native_m):
    s = SOURCES[key]
    return "%s, %s m (%s)" % (s["name"], ("%g" % native_m), s["by"])


def arguments(args):
    args = [str(a).strip() for a in args]
    plain = re.compile(r"[+-]?(\d+\.?\d*|\.\d+)")
    if len(args) < 6 or not all(plain.fullmatch(a) for a in args[:6]):
        raise Fail(REQUIRED)
    lat, lon = common.latlon(args, max_lat=84)
    w, d, nx, ny = float(args[2]), float(args[3]), float(args[4]), float(args[5])
    if not (20 <= w <= 8000 and 20 <= d <= 8000 and nx == int(nx) and ny == int(ny) and 2 <= nx <= 257 and 2 <= ny <= 257):
        raise Fail(BOX)
    only = args[6] if len(args) > 6 and args[6] else None
    if only is not None and only not in SOURCES:
        raise Fail("Unknown source")
    return lat, lon, w, d, int(nx), int(ny), only


def main(args):
    lat, lon, w, d, nx, ny, only = arguments(args)
    import numpy as np
    import heights
    farm = Farm(lat, lon, w, d, nx, ny)
    chain = [only] if only else [key for key, region in CHAIN if region is None or in_region(region, lat, lon)]
    got, tried, down, stopped = {}, [], [], False
    base = None
    for key in chain:
        if got and common.elapsed() > SOFT_S:
            stopped = True
            break
        wait = min(SOURCES[key]["wait"], common.left() - 8)
        if wait < 5:
            stopped = True
            break
        try:
            one = heights.timed(lambda: READERS[key](farm, key), wait, SOURCES[key]["name"])
        except SourceDown as e:
            common.log("%s did not answer: %s" % (key, e))
            down.append(key)
            continue
        if one is None or cover(one.h) == 0:
            tried.append(key)
            continue
        got[key] = one
        if base is not None:
            break   # this one only fills the first one's gaps
        if cover(one.h) >= ENOUGH:
            base = key
            if cover(one.h) == 1:
                break
    if not got:
        if down or stopped:
            raise Fail(NOBODY)
        raise Fail(OUTSIDE, final=True)
    if base is None:   # no map reached 95 %: the one that covers most is the answer, the next best fills
        base = max(got, key=lambda k: cover(got[k].h))
    others = sorted((k for k in got if k != base), key=lambda k: -cover(got[k].h))
    h, filled = got[base].h, None
    if others and cover(h) < 1:
        done = fill_gaps(h, got[others[0]].h)
        if done:
            k = others[0]
            h = done[0]
            filled = {"source_id": k, "name": SOURCES[k]["name"], "res_m": round(farm.cell(got[k].native_m), 2), "kind": SOURCES[k]["kind"],
                      "share": round(done[1], 4), "offset_m": round(done[2], 2), "data_date": got[k].data_date}
    tried += [k for k in others if not (filled and filled["source_id"] == k)]
    one, s = got[base], SOURCES[base]
    answer = {
        "source": words(base, one.native_m), "source_id": base, "name": s["name"], "native_m": one.native_m,
        "res_m": round(farm.cell(one.native_m), 2), "kind": s["kind"], "credit": s["credit"], "licence": s["licence"],
        "data_date": one.data_date, "data_date_note": one.note,
        "units": "h: metres above sea level in this map's own height system (%s); native_m, res_m, w and d: metres; cover and share: 0 to 1; NaN in h: no height there" % s["datum"],
        "grid": {"lat": lat, "lon": lon, "w": w, "d": d, "nx": nx, "ny": ny},
        "cover": round(cover(h), 4), "filled": filled,
        "tried": [k for k in chain if k in tried or k in down],
        "h": base64.b64encode(np.ascontiguousarray(h, "<f4").tobytes()).decode("ascii"),
    }
    finer = [SOURCES[k]["name"] for k in down if chain.index(k) < chain.index(base)]
    later = [k for k in down if chain.index(k) > chain.index(base)]
    partial = []
    if finer:
        partial.append("A finer height map for this place (%s) did not answer: these heights are from %s" % (", ".join(dict.fromkeys(finer)), s["name"]))
    if cover(h) < 1 and filled is None and (later or stopped):
        partial.append("Gaps in the heights were not filled: the next height map did not answer in time")
    if partial:
        answer["not_answered"] = down
        answer["incomplete"] = ". ".join(partial)
    return answer


if __name__ == "__main__":
    common.run(main, LIMIT_S, slow=SLOW)
