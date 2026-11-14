# smaproot.py LAT LON: how wet the soil is around the roots (the top metre) in the 9 km square that holds the field, from the newest SMAP file (written 2026-11-14).
# Reads:   NASA's catalogue (CMR) for the newest SPL4SMGP file; then ONE cell of that file (the root-zone moisture, the cell's own latitude, longitude,
#          x, y and the time) through NASA's OPeNDAP service, never the file (about 140 MB). The catalogue is open; the data needs the NASA Earthdata login.
# From:    NASA SMAP Level-4 soil moisture, version 8, distributed by the NASA National Snow and Ice Data Center DAAC (the same series the "i" card names).
# Returns: {"ok": true, "source", "data_date", "units", "value", "date", "km", "cell": {lat, lon, row, col, width_km, height_km, edges: {n, s, e, w}}, "window",
#           "granule", "age_days", "note"}  or  {"ok": false, "reason", "final"?}. The contract: README.md, section "smaproot".
# Keeps:   nothing. The server keeps answers; this lookup keeps no file.
# Checked by: scripts/test_live_smaproot.mjs (offline: the catalogue, the token and NASA's answers hand-made in the real format) and scripts/live_check_smaproot.mjs (by hand, live).
import common   # first, always
import datetime
import math
import re
import struct
import urllib.parse
from common import Fail, SourceDown

LIMIT_S = 150
SHORT = "SPL4SMGP"
CELL_M, X0, Y0 = 9008.055210146, -17367530.445161525, 7314540.830638561   # the 9 km world grid, EASE-Grid 2.0 (cylindrical equal-area, EPSG:6933)
ROWS, COLS = 1624, 3856
MAX_LAT = 85.044                       # the grid's upper and lower edge
FILL = -9999.0                         # the file's own "no value here" (open water, ice)
VALID = (0.0, 0.9)                     # m3/m3: the file's own valid range
KM_PER_DEG = 111.195
SOURCE = "NASA SMAP Level-4 root-zone soil moisture (SPL4SMGP, version 8), from NASA's National Snow and Ice Data Center DAAC"
UNITS = "Volume of water per volume of soil, 0 to 1 (0.25 is a quarter of the soil's volume being water), for the whole root zone (0 to 100 cm)"
NO_FILE = "NASA's catalogue lists no recent SMAP soil-moisture file just now; try again later"
OFF_GRID = "The SMAP files are no longer on the 9 km grid Crophalo was checked against: no value is better than one from the wrong place"
SIZES = {"Float32": 4, "Float64": 8, "UInt32": 4, "Int32": 4, "Int16": 2, "UInt16": 2}
FORMATS = {"Float32": "f", "Float64": "d", "UInt32": "I", "Int32": "i", "Int16": "h", "UInt16": "H"}


# ---- the grid
def project(lon, lat):
    from rasterio.warp import transform
    xs, ys = transform("EPSG:4326", "EPSG:6933", [lon], [lat])
    return xs[0], ys[0]


def unproject(x, y):
    from rasterio.warp import transform
    lons, lats = transform("EPSG:6933", "EPSG:4326", [x], [y])
    return lons[0], lats[0]


def cell_of(lat, lon):
    """The row and column of the grid cell that holds the place, worked out from the grid's published definition."""
    x, y = project(lon, lat)
    return int(math.floor((Y0 - y) / CELL_M)), int(math.floor((x - X0) / CELL_M)), x, y


def edges_of(x, y):
    """The cell's four edges in degrees. In this projection the edges are straight lines of latitude and longitude, so the cell is a box on the map."""
    half = CELL_M / 2
    west, _ = unproject(x - half, y)
    east, _ = unproject(x + half, y)
    _, south = unproject(x, y - half)
    _, north = unproject(x, y + half)
    return {"n": round(north, 5), "s": round(south, 5), "e": round(east, 5), "w": round(west, 5)}


# ---- NASA's answer: a DAP4 data response is a few chunks: the description of what follows, then the values
def chunks_of(body):
    out, i = [], 0
    while i < len(body):
        if i + 4 > len(body):
            raise SourceDown("NASA's answer was cut short", "http", 0)
        flags, size = body[i], int.from_bytes(body[i + 1:i + 4], "big")
        if flags & 2:   # the service's own error chunk
            raise SourceDown("NASA's data service reported an error", "http", 0, body[i + 4:i + 4 + size])
        out.append((flags, body[i + 4:i + 4 + size]))
        i += 4 + size
    return out


def read_values(body):
    """{name: value} for the single values a one-cell request returns, in the order the answer describes them. Refuses anything that does not add up."""
    chunks = chunks_of(body)
    if len(chunks) < 2:
        raise SourceDown("NASA's answer held no values", "http", 0)
    dmr = chunks[0][1].decode("utf-8", "replace")
    names = re.findall(r"<(Float32|Float64|UInt32|Int32|Int16|UInt16)\s+name=\"([^\"]+)\"", dmr)
    data = b"".join(d for _, d in chunks[1:])
    need = sum(SIZES[t] for t, _ in names)
    if len(data) not in (need, need + 4 * len(names)):   # each variable may be followed by its 4-byte check number
        raise SourceDown("NASA's answer did not have the size it described", "http", 0)
    step = 4 if len(data) == need + 4 * len(names) else 0
    order = "<" if chunks[0][0] & 4 else ">"
    out, pos = {}, 0
    for t, n in names:
        out[n] = struct.unpack(order + FORMATS[t], data[pos:pos + SIZES[t]])[0]
        pos += SIZES[t] + step
    out["_epoch"] = re.search(r"seconds since ([0-9T: .\-]+)", dmr.split('name="time"', 1)[-1]) if 'name="time"' in dmr else None
    out["_epoch"] = out["_epoch"].group(1).strip() if out["_epoch"] else None
    return out


def moment(seconds, epoch):
    """The moment (UTC) that many seconds after the epoch the file names."""
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
        try:
            start = datetime.datetime.strptime(epoch, fmt).replace(tzinfo=datetime.timezone.utc)
            return start + datetime.timedelta(seconds=seconds)
        except ValueError:
            continue
    raise SourceDown("NASA's file gave a time that could not be read", "http", 0)


def ask_cell(opendap, row, col, headers):
    ce = "/Geophysical_Data/sm_rootzone[%d][%d];/cell_lat[%d][%d];/cell_lon[%d][%d];/x[%d];/y[%d];/time" % (row, col, row, col, row, col, col, row)
    r = common.http(opendap + ".dap?dap4.ce=" + urllib.parse.quote(ce), headers=headers, timeout=60)   # the constraint is written out in full: the service refuses brackets as they are
    return read_values(r.body)


# ---- the lookup
def newest_files(now):
    """The newest SPL4SMGP files first, none from the future."""
    found = common.cmr_granules([("short_name", SHORT), ("sort_key", "-start_date")], limit=4, page_size=4)
    out = []
    for g in found:
        try:
            start = datetime.datetime.strptime(g["time_start"][:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=datetime.timezone.utc)
        except (KeyError, ValueError):
            continue
        link = next((l["href"] for l in g.get("links", []) if str(l.get("rel", "")).endswith("service#") and l.get("href", "").startswith("https://opendap.earthdata.nasa.gov/")), None)
        if start <= now and link:
            out.append((g, link))
    return out


def main(args):
    lat, lon = common.latlon(args, max_lat=MAX_LAT)
    now = common.now()
    files = newest_files(now)
    if not files:
        raise Fail(NO_FILE)
    headers = common.bearer()
    last = None
    for g, link in files[:2]:                       # the newest file, then the one before it if NASA has not finished the newest
        try:
            row, col, px, py = cell_of(lat, lon)
            for _ in range(3):                      # the first try is the cell the grid's definition names; the file's own coordinates settle it
                got = ask_cell(link, row, col, headers)
                cx, cy = got["x"], got["y"]
                if abs(px - cx) <= CELL_M / 2 + 1 and abs(py - cy) <= CELL_M / 2 + 1:   # the place is inside this cell (on its edge counts as inside)
                    break
                row, col = row + math.floor((cy - py) / CELL_M + 0.5), col + math.floor((px - cx) / CELL_M + 0.5)
            else:
                raise Fail(OFF_GRID)
            value = got["sm_rootzone"]
            if value == FILL or not (VALID[0] <= value <= VALID[1]):
                raise Fail("SMAP has no soil-moisture value for the square that holds this place (open water or ice)", final=True)
            when = moment(got["time"], got["_epoch"])
            if when.date() > now.date() or (now - when).days > 60:
                raise SourceDown("NASA's file carried a date that does not fit", "http", 0)
            edges = edges_of(cx, cy)
            clat = got["cell_lat"]
            width = (edges["e"] - edges["w"]) * KM_PER_DEG * math.cos(math.radians(clat))
            height = (edges["n"] - edges["s"]) * KM_PER_DEG
            return {
                "source": SOURCE, "data_date": when.date().isoformat(), "units": UNITS,
                "value": round(value, 4), "date": when.date().isoformat(), "km": 9,
                "cell": {"lat": round(clat, 4), "lon": round(got["cell_lon"], 4), "row": row, "col": col,
                         "width_km": round(width, 1), "height_km": round(height, 1), "edges": edges},
                "window": {"start": g.get("time_start"), "end": g.get("time_end")}, "granule": g.get("title", "").rsplit("_", 1)[0] if g.get("title") else None,
                "age_days": (now - when).days,
                "note": "One value for the whole cell. At this latitude the cell is about %.0f km wide and %.0f km tall (an equal-area grid): about 9 km on average, not a square." % (width, height),
            }
        except SourceDown as e:
            if e.status in (401, 403):
                raise Fail("NASA Earthdata did not accept this computer's login for the soil-moisture data: check the username and password, and that the SMAP data is allowed on the account") from None
            last = e
            common.log("this file did not answer, trying the one before it:", e)
    raise last or Fail(NO_FILE)


common.run(main, LIMIT_S, slow="NASA's soil-moisture service took too long to answer; try again in a minute")
