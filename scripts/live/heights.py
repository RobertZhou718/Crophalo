# heights.py: what the three height lookups (dem.py, horizon.py, canopy.py) share (written 2026-11-14). Not a lookup itself.
# Reads:   pieces of height maps: a window of a remote GeoTIFF (range reads, never a whole file) or a small GeoTIFF a map
#          service sent, and reads heights off them at the farm's own grid points.
# From:    whichever open height map the lookup names; every request goes out through common.py's doors.
# Returns: to its lookups only: Patch (a piece of a map with its place), the farm grid, heights at grid points.
# Checked by: scripts/test_live_heights.mjs (node scripts/test_live_heights.mjs).
import common   # first, always: it takes stdout away from every library
import json
import threading
import time
import urllib.parse
from pathlib import Path

import numpy as np
import rasterio
from affine import Affine
from rasterio._err import CPLE_BaseError
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.errors import RasterioError
from rasterio.io import MemoryFile
from rasterio.warp import transform
from rasterio.windows import Window
from common import SourceDown

LOWEST, HIGHEST = -450.0, 9000.0   # metres: below the Dead Sea shore or above Everest is a broken value, never a height
MOST_CELLS = 12_000_000            # one piece in memory is at most this many cells (48 MB as float32)
WGS84 = CRS.from_epsg(4326)
_last_open = {}


class Patch:
    """A piece of a height map: a (float32 [rows][cols], NaN where the map has no value), t (cell -> map position),
    crs (the map's own), tags (the file's own notes, e.g. its date)."""

    def __init__(self, a, t, crs, tags=None):
        self.a, self.t, self.crs, self.tags = a, t, crs, dict(tags or {})


def timed(work, seconds, what):
    """work() with its own short time limit: a service that hangs costs `seconds`, not the whole lookup. The slow call is
    left behind on its thread (the lookup's end stops it). A refused test address is passed on, never swallowed."""
    box = {}

    def run():
        try:
            box["value"] = work()
        except BaseException as e:   # NotRecorded included: the caller must see it
            box["error"] = e

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    thread.join(max(0.1, seconds))
    if thread.is_alive():
        common.log("%s gave no answer within %.0f s: left behind" % (what, seconds))
        raise SourceDown("no answer from %s within %.0f s" % (what, seconds), "timeout")
    if "error" in box:
        raise box["error"]
    return box["value"]


# ---- the farm's own grid
def farm_crs(lat, lon):
    """A flat map in metres laid on the farm's middle (transverse Mercator): east is x, north is y."""
    return CRS.from_proj4("+proj=tmerc +lat_0=%.7f +lon_0=%.7f +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs" % (lat, lon))


def to_crs(src, dst, xs, ys):
    """Positions from one map's coordinates to another's, as arrays of the same shape."""
    xs, ys = np.asarray(xs, "float64"), np.asarray(ys, "float64")
    if src == dst:
        return xs, ys
    ox, oy = transform(src, dst, xs.ravel(), ys.ravel())
    return np.asarray(ox, "float64").reshape(xs.shape), np.asarray(oy, "float64").reshape(xs.shape)


def grid(lat, lon, w, d, nx, ny):
    """The grid points of a box w metres wide (east-west) and d deep (north-south) round (lat, lon): row 0 is the north
    edge, column 0 the west edge, the points reach from edge to edge. Returns x, y (metres from the middle) and lons, lats."""
    xs = np.linspace(-w / 2.0, w / 2.0, nx) if nx > 1 else np.zeros(1)
    ys = np.linspace(d / 2.0, -d / 2.0, ny) if ny > 1 else np.zeros(1)
    x, y = np.meshgrid(xs, ys)
    lons, lats = to_crs(farm_crs(lat, lon), WGS84, x, y)
    return x, y, lons, lats


# ---- reading a piece of a remote GeoTIFF
def place(url):
    """Host and path only, for the log: a query can hold a field's position or an access word."""
    parts = urllib.parse.urlsplit(url)
    return parts.netloc + parts.path


def ground_m(ds, lat):
    """The size of one cell of an open map on the ground, in metres (north-south for a map in degrees)."""
    if ds.crs is not None and ds.crs.is_geographic:
        return abs(ds.res[1]) * 111320.0
    if ds.crs is not None and ds.crs.to_epsg() == 3857:   # web-map metres are stretched away from the equator
        return abs(ds.res[1]) * np.cos(np.radians(lat))
    return abs(ds.res[1])


def open_remote(url, part="", query=""):
    """Open a remote GeoTIFF for range reads. part: in a test run only, the name of a second recorded piece of the same
    file ("#far"). query: a short-lived access word some hosts want after the address; it is never logged or recorded."""
    host = urllib.parse.urlsplit(url).netloc.lower()
    wait = _last_open.get(host, 0) + common.PAUSE_S - time.monotonic()
    if wait > 0 and not common.REPLAY:   # the same manners as common.http: a pause between two starts to one host
        time.sleep(wait)
    _last_open[host] = time.monotonic()
    path = common.raster_path(url + part if common.REPLAY else url)
    return rasterio.open(path + ("?" + query if query and not common.REPLAY else ""))


def gdal_env(timeout=30):
    return rasterio.Env(**dict(common.gdal_options(), GDAL_HTTP_TIMEOUT=str(int(timeout))))


def read_cog(url, lons, lats, cell_m, part="", query="", factor=None, pad=3, timeout=30):
    """The window of band 1 that holds the points (plus `pad` cells all round), as a Patch; None when the points lie
    outside the file. cell_m: the cell the lookup works at; a finer file is read thinned to it (the mean of the cells
    under each working cell), so a large box never pulls a large window. factor: a fixed thinning instead."""
    where = place(url)
    try:
        with gdal_env(timeout), open_remote(url, part, query) as ds:
            crs = ds.crs or WGS84
            xs, ys = to_crs(WGS84, crs, lons, lats)
            cols, rows = ~ds.transform * (xs, ys)
            lat_mid = float(np.mean(lats))
            f = int(factor(ground_m(ds, lat_mid))) if factor else max(1, int(cell_m / ground_m(ds, lat_mid) + 1e-6))
            c0, c1 = int(np.floor(cols.min())) - pad * f - 2, int(np.ceil(cols.max())) + pad * f + 2
            r0, r1 = int(np.floor(rows.min())) - pad * f - 2, int(np.ceil(rows.max())) + pad * f + 2
            c0, r0, c1, r1 = c0 // f * f, r0 // f * f, -(-c1 // f) * f, -(-r1 // f) * f   # on the thinned picture's own cell lines,
            c0, r0, c1, r1 = max(0, c0), max(0, r0), min(ds.width, c1), min(ds.height, r1)   # so the file's ready-made thinned copy is what is sent
            if c1 <= c0 or r1 <= r0:
                return None
            out_w, out_h = max(1, (c1 - c0) // f), max(1, (r1 - r0) // f)
            if out_w * out_h > MOST_CELLS:
                raise SourceDown("the piece asked of %s is too large to hold" % where, "http")
            window = Window(c0, r0, c1 - c0, r1 - r0)
            got = ds.read(1, window=window, out_shape=(out_h, out_w), masked=True,
                          resampling=Resampling.average if f > 1 else Resampling.nearest)
            t = ds.window_transform(window) * Affine.scale((c1 - c0) / out_w, (r1 - r0) / out_h)
            tags = ds.tags()
            if common.RECORD:
                keep_cut(url + part, got, ds.dtypes[0], ds.nodata, t, crs, tags)
            return Patch(np.ma.filled(got.astype("float32"), np.nan), t, crs, tags)
    except (RasterioError, CPLE_BaseError) as e:   # the raster library's own words can hold the whole address: only its kind goes on
        common.log("raster read failed:", type(e).__name__, "at", where)
        raise SourceDown("%s could not be read (%s)" % (where, type(e).__name__)) from None


def keep_cut(name, got, dtype, nodata, t, crs, tags):
    """BY HAND, LIVE ONLY (FW_NET_RECORD): keep the piece that was just read as a small GeoTIFF with the same place, cell
    values and notes, under the name a test run will ask for. A test then replays the real values without the internet."""
    key = common.net_key("GET", name)
    folder = Path(common.RECORD)
    folder.mkdir(parents=True, exist_ok=True)
    values = np.ma.filled(got, nodata) if nodata is not None else np.ma.getdata(got)
    with rasterio.open(folder / (key + ".tif"), "w", driver="GTiff", width=values.shape[1], height=values.shape[0], count=1,
                       dtype=dtype, nodata=nodata, crs=crs, transform=t, compress="deflate", predictor=2 if "int" in dtype else 3) as out:
        out.write(values.astype(dtype), 1)
        out.update_tags(**{k: v for k, v in tags.items() if k in ("TIFFTAG_DATETIME", "AREA_OR_POINT")})
    (folder / (key + ".tif")).replace(folder / (key + ".body"))
    meta = {"method": "GET", "url": name, "recorded": common.iso_now(), "hand_made": False, "cut_out": True,
            "note": "the window this lookup read from the live file (range reads), kept as a small GeoTIFF with the same place and values",
            "replies": [{"status": 200, "headers": {"content-type": "image/tiff"}}]}
    (folder / (key + ".json")).write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")


def from_bytes(body, crs, what):
    """A Patch from a small GeoTIFF a map service sent. crs: the coordinates the piece was ASKED in (some services
    write them into the file in a form no library can name)."""
    try:
        with MemoryFile(body) as mem, mem.open() as ds:
            if ds.width < 2 or ds.height < 2 or ds.width * ds.height > MOST_CELLS:
                raise SourceDown("the map piece from %s has an impossible size" % what, "http")
            got = ds.read(1, masked=True)
            return Patch(np.ma.filled(got.astype("float32"), np.nan), ds.transform, crs, ds.tags())
    except SourceDown:
        raise
    except Exception as e:
        raise SourceDown("the map piece from %s could not be read (%s)" % (what, type(e).__name__), "http") from None


def exists(url, query="", timeout=10):
    """Does the host have this file? (True, the day it was last published or None) or (False, None) for a plain "no such
    file" (404: for a world map cut in tiles that means open sea or a place the map leaves out). Anything else raises."""
    try:
        reply = common.http(url + ("?" + query if query else ""), method="HEAD", timeout=timeout, tries=2)
    except SourceDown as e:
        if e.status == 404:
            return False, None
        raise
    return True, http_day(reply.headers.get("last-modified"))


def http_day(text):
    """'Sun, 09 May 2027 14:24:43 GMT' -> '2027-05-09'; None when there is no such line."""
    from email.utils import parsedate_to_datetime
    try:
        return parsedate_to_datetime(text).strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        return None


def tag_day(tags):
    """A GeoTIFF's own date note '2027:11:14 12:00:00' -> '2027-11-14'; None when the file has none."""
    text = str(tags.get("TIFFTAG_DATETIME", ""))[:10].replace(":", "-")
    try:
        time.strptime(text, "%Y-%m-%d")
        return text
    except ValueError:
        return None


# ---- heights at the grid points
def _weights(t):   # Catmull-Rom: a smooth curve through four neighbours that passes through every one of them
    return np.stack([-0.5 * t**3 + t**2 - 0.5 * t, 1.5 * t**3 - 2.5 * t**2 + 1.0, -1.5 * t**3 + 2.0 * t**2 + 0.5 * t, 0.5 * t**3 - 0.5 * t**2])


def sample(patch, lons, lats):
    """The patch's height at each point: a smooth curve through the 4 x 4 cells round it; where one of those is missing,
    the straight blend of the 2 x 2 cells; where one of those is missing, the value of the one cell that holds the
    point; else NaN. A point is never given a height the map does not have there."""
    shape = np.shape(lons)
    xs, ys = to_crs(WGS84, patch.crs, np.ravel(lons), np.ravel(lats))
    inv = ~patch.t
    u, v = inv.a * xs + inv.b * ys + inv.c - 0.5, inv.d * xs + inv.e * ys + inv.f - 0.5   # in cells, counted from the first cell's middle
    a = patch.a
    rows, cols = a.shape
    out = np.full(u.shape, np.nan)
    jn, in_ = np.floor(u + 0.5).astype(int), np.floor(v + 0.5).astype(int)
    ok = (jn >= 0) & (jn < cols) & (in_ >= 0) & (in_ < rows)
    out[ok] = a[in_[ok], jn[ok]]
    j0, i0 = np.floor(u).astype(int), np.floor(v).astype(int)
    fx, fy = u - j0, v - i0
    ok = np.nonzero((j0 >= 0) & (j0 < cols - 1) & (i0 >= 0) & (i0 < rows - 1))[0]
    if ok.size:
        i, j, x, y = i0[ok], j0[ok], fx[ok], fy[ok]
        four = np.stack([a[i, j], a[i, j + 1], a[i + 1, j], a[i + 1, j + 1]]).astype("float64")
        value = four[0] * (1 - x) * (1 - y) + four[1] * x * (1 - y) + four[2] * (1 - x) * y + four[3] * x * y
        whole = np.isfinite(four).all(axis=0)
        out[ok[whole]] = value[whole]
    ok = np.nonzero((j0 >= 1) & (j0 < cols - 2) & (i0 >= 1) & (i0 < rows - 2))[0]
    if ok.size:
        i, j = i0[ok], j0[ok]
        wx, wy = _weights(fx[ok]), _weights(fy[ok])
        value, whole = np.zeros(ok.size), np.ones(ok.size, bool)
        for di in range(4):
            for dj in range(4):
                cell = a[i + di - 1, j + dj - 1].astype("float64")
                whole &= np.isfinite(cell)
                value += wy[di] * wx[dj] * np.where(np.isfinite(cell), cell, 0.0)
        out[ok[whole]] = value[whole]
    return out.reshape(shape)


def merged(patches):
    """Tiles of one map that share one cell grid become one patch, so a point on the seam between two tiles is read
    like any other point. Tiles that do not line up are left as they are."""
    if len(patches) < 2:
        return patches
    first = patches[0]
    inv, spots = ~first.t, []
    for p in patches:
        same = p.crs == first.crs and abs(p.t.a - first.t.a) <= 1e-9 * abs(first.t.a) and abs(p.t.e - first.t.e) <= 1e-9 * abs(first.t.e)
        col, row = inv * (p.t.c, p.t.f)
        if not same or abs(col - round(col)) > 0.02 or abs(row - round(row)) > 0.02:
            return patches
        spots.append((int(round(row)), int(round(col))))
    r0, c0 = min(r for r, _ in spots), min(c for _, c in spots)
    r1 = max(r + p.a.shape[0] for (r, _), p in zip(spots, patches))
    c1 = max(c + p.a.shape[1] for (_, c), p in zip(spots, patches))
    if (r1 - r0) * (c1 - c0) > MOST_CELLS:
        return patches
    whole = np.full((r1 - r0, c1 - c0), np.nan, "float32")
    for (r, c), p in zip(spots, patches):
        part = whole[r - r0:r - r0 + p.a.shape[0], c - c0:c - c0 + p.a.shape[1]]
        np.copyto(part, p.a, where=np.isnan(part))
    return [Patch(whole, first.t * Affine.translation(c0, r0), first.crs, first.tags)]


def sample_all(patches, lons, lats):
    """Heights at the points from several pieces of one map: the first piece that has a value at a point gives it."""
    out = np.full(np.shape(lons), np.nan)
    for p in merged([p for p in patches if p is not None]):
        got = sample(p, lons, lats)
        out = np.where(np.isnan(out), got, out)
    return out


def real_heights(h):
    """Heights with every impossible value made unknown (NaN): a fill value is never passed on as a height."""
    h = np.asarray(h, "float64").copy()
    h[~((h >= LOWEST) & (h <= HIGHEST))] = np.nan
    return h


def tile_names(lons, lats):
    """The one-degree squares the points fall in, as (south edge, west edge) pairs of whole degrees."""
    pairs = np.unique(np.stack([np.floor(np.ravel(lats)), np.floor(np.ravel(lons))]).astype(int), axis=1)
    return [(int(la), int(lo)) for la, lo in pairs.T]
