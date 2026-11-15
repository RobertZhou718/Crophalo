# gracecell.py LAT LON: the water stored in the ground and soil (groundwater, soil water, snow and surface water together) round the field, month by month since 2002 (written 2026-11-14).
# Reads:   NASA's catalogue (CMR) for the one JPL GRACE / GRACE-FO mascon file; then, from that 46 MB file, only the pieces that hold ONE 0.5 degree cell (its monthly series, its
#          uncertainty, its land mask, the axes): 256 KB range reads through NASA's archive, opened by h5py. The whole file is never loaded or kept. The catalogue is open; the file needs the NASA Earthdata login.
# From:    NASA JPL GRACE and GRACE-FO Mascon, RL06.3Mv04 with the Coastal Resolution Improvement filter, from NASA's Physical Oceanography DAAC (PO.DAAC), DOI 10.5067/TEMSC-3JC634.
# Returns: {"ok": true, "source", "data_date", "units", "cell", "area_km", "months": [[YYYY-MM, cm | null, uncertainty_cm | null]], "months_read", "gaps", "gap_spans", "newest_month", "newest_date", "value_cm", "uncertainty_cm",
#          "trend_cm_per_year" | null, "trend_from", "trend_to", "trend_years", "merged_months", "note"} or {"ok": false, "reason"}. A month with no solution is null, NEVER filled and never 0. The contract: README.md, section "gracecell".
# Keeps:   nothing. The server keeps answers; this lookup keeps no file.
# Checked by: scripts/test_live_gracecell.mjs (offline: the catalogue, the token and a small file built the real way, served in pieces) and scripts/live_check_gracecell.mjs (by hand, live).
import common   # first, always
import datetime
import io
import math
import h5py
import numpy as np
from common import Fail, SourceDown

LIMIT_S = 150
SHORT = "TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4"
BLOCK = 1 << 18               # 256 KB per request
MOST_REQUESTS = 80            # the cell is about 25 blocks; far more means the file is not laid out as it was checked
MOST_BYTES = 24 << 20         # never anywhere near the whole 46 MB file
CELL_DEG = 0.5
MIN_TREND_YEARS = 5.0         # a trend is only given when the months read span at least five years
MIN_TREND_MONTHS = 60         # and there are at least five years' worth of months to fit
EPOCH = datetime.date(2002, 1, 1)
AREA_KM = 300                 # a JPL mascon is a 3 degree equal-area cap; the 0.5 degree grid only samples it
SOURCE = "NASA GRACE and GRACE-FO, JPL mascon solution RL06.3Mv04 (Coastal Resolution Improvement filter), from NASA's Physical Oceanography DAAC"
UNITS = "Centimetres of water, as the change from the 2004 to 2009 average, for the whole of the ground, soil, snow and surface water over a region about 300 km wide"
NO_RIGHTS = "NASA did not let this computer's Earthdata login read the GRACE-FO file: the login may still need to be approved for NASA PO.DAAC"
ODD_FILE = "NASA's GRACE-FO file is no longer laid out the way Crophalo was checked against: no value is better than one from the wrong place"
KM_PER_DEG = 111.195


def cell_of(lat, lon):
    """(row, column, centre lat, centre lon) of the 0.5 degree cell: rows from 90 S, columns from 0 E eastwards (the file's own axes)."""
    east = lon % 360.0
    row, col = min(359, int(math.floor((lat + 90.0) / CELL_DEG + 1e-9))), min(719, int(math.floor(east / CELL_DEG + 1e-9)))
    return row, col, round(-89.75 + row * CELL_DEG, 2), round(col * CELL_DEG + 0.25, 2)


class Pieces(io.RawIOBase):
    """The remote file as a file: every read is served from 256 KB blocks asked for with a Range header, each kept in memory once. h5py opens this
    instead of a path, so only the blocks that hold the asked cell are ever fetched."""

    def __init__(self, url, headers):
        self.url, self.headers, self.pos, self.size, self.blocks, self.bytes = url, headers, 0, None, {}, 0

    def readable(self):
        return True

    def seekable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        if self.size is None:
            self.block(0)
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos

    def block(self, n):
        if n in self.blocks:
            return self.blocks[n]
        if len(self.blocks) >= MOST_REQUESTS or self.bytes >= MOST_BYTES:
            raise Fail(ODD_FILE)
        first = n * BLOCK
        last = first + BLOCK - 1 if self.size is None else min(self.size, first + BLOCK) - 1
        head = dict(self.headers)
        head["Range"] = "bytes=%d-%d" % (first, last)
        # the "#" part is never sent (the web library drops it); it only makes each block a different request for a test's recorded answers
        got = common.http("%s#%d-%d" % (self.url, first, last), headers=head, timeout=60)
        if got.status != 206:
            raise SourceDown("NASA's archive did not honour a range read (HTTP %d)" % got.status, "http", got.status)
        if self.size is None:
            total = str(got.headers.get("content-range", "")).rpartition("/")[2]
            if not total.isdigit():
                raise SourceDown("NASA's archive did not say how big the file is", "http", 0)
            self.size = int(total)
        self.blocks[n] = got.body
        self.bytes += len(got.body)
        return got.body

    def readinto(self, buf):
        want, done = len(buf), 0
        while done < want:
            if self.size is not None and self.pos >= self.size:
                break
            n = self.pos // BLOCK
            data = self.block(n)
            off = self.pos - n * BLOCK
            take = data[off:off + want - done]
            if not take:
                break
            buf[done:done + len(take)] = take
            done += len(take)
            self.pos += len(take)
        return done


def newest_file():
    """(address, name) of the one mascon file in the catalogue (the newest if there were ever two)."""
    found = []
    for g in common.cmr_granules([("short_name", SHORT), ("sort_key", "-start_date")], limit=5, page_size=5):
        link = next((l["href"] for l in g.get("links", []) if str(l.get("rel", "")).endswith("data#") and str(l.get("href", "")).startswith("https://archive.podaac.earthdata.nasa.gov/") and str(l["href"]).endswith(".nc")), None)
        if link:
            found.append((str(g.get("time_end", "")), link, str(g.get("title", ""))))
    if not found:
        raise Fail("NASA's catalogue lists no GRACE-FO groundwater file just now; try again later")
    found.sort()
    return found[-1][1], found[-1][2]


def day_of(days):
    return EPOCH + datetime.timedelta(days=float(days))


def trend_of(points):
    """Centimetres per year of a straight line through [(year as a decimal, cm)], or None when fewer than five years or 60 months were read."""
    if len(points) < MIN_TREND_MONTHS or points[-1][0] - points[0][0] < MIN_TREND_YEARS:
        return None
    x = np.array([p[0] for p in points], dtype="float64")
    y = np.array([p[1] for p in points], dtype="float64")
    x = x - x.mean()
    return float((x * (y - y.mean())).sum() / (x * x).sum())


def prefetch(pieces, datasets, row, col):
    """Ask for every block that holds the cell's chunks at once (a few at a time), so the read below finds them in memory instead of waiting for each in turn.
    The chunks' places are asked of the file's index (small); a file without that index is simply read one block after another."""
    wanted = set()
    try:
        for ds in datasets:
            if not ds.chunks:
                return
            ct, cr, cc = ds.chunks
            for t in range(0, ds.shape[0], ct):
                info = ds.id.get_chunk_info_by_coord((t, row // cr * cr, col // cc * cc))
                if info.byte_offset is None or not info.size:
                    continue
                wanted.update(range(info.byte_offset // BLOCK, (info.byte_offset + info.size - 1) // BLOCK + 1))
    except (OSError, ValueError, TypeError, AttributeError):
        return
    if len(wanted) > MOST_REQUESTS - len(pieces.blocks):
        raise Fail(ODD_FILE)
    for _, _, e in common.each(sorted(wanted - set(pieces.blocks)), pieces.block, 6):
        if isinstance(e, Fail):
            raise e


def read_cell(url, headers, row, col, cell_lat, cell_lon):
    """The cell's times (days since the start of 2002), its values and uncertainties (cm), and its land flag, from the remote file."""
    pieces = Pieces(url, headers)
    try:
        with h5py.File(io.BufferedReader(pieces, buffer_size=1 << 16), "r") as f:
            lwe, unc, time, lat, lon = (f[k] for k in ("lwe_thickness", "uncertainty", "time", "lat", "lon"))
            if len(lwe.shape) != 3 or lwe.shape[1:] != (360, 720) or unc.shape != lwe.shape or time.shape != (lwe.shape[0],):
                raise Fail(ODD_FILE)
            la, lo = float(lat[row]), float(lon[col])
            if abs(la - cell_lat) > 0.01 or abs(lo - cell_lon) > 0.01:
                raise Fail(ODD_FILE)
            units = lwe.attrs.get("units")
            if (units.decode() if isinstance(units, bytes) else str(units)) != "cm":
                raise Fail(ODD_FILE)
            low, high, fill = (float(np.ravel(lwe.attrs.get(k))[0]) for k in ("valid_min", "valid_max", "_FillValue"))
            mask = f["land_mask"]
            land = float(mask[row, col] if mask.ndim == 2 else mask[0, row, col])
            prefetch(pieces, [lwe, unc], row, col)
            days = np.array(time[:], dtype="float64")
            values = np.array(lwe[:, row, col], dtype="float64")
            errors = np.array(unc[:, row, col], dtype="float64")
    except (OSError, KeyError, ValueError, IndexError, TypeError) as e:
        if isinstance(e, SourceDown):
            raise
        common.log("the GRACE-FO file could not be read:", type(e).__name__, e)
        raise Fail(ODD_FILE) from None
    values[~np.isfinite(values) | (values == fill) | (values < low) | (values > high)] = np.nan
    errors[~np.isfinite(errors) | (errors < 0) | (errors > 1000)] = np.nan
    return days, values, errors, land, pieces


def main(args):
    lat, lon = common.latlon(args)
    row, col, cell_lat, cell_lon = cell_of(lat, lon)
    url, name = newest_file()
    headers = common.bearer()
    try:
        days, values, errors, land, pieces = read_cell(url, headers, row, col, cell_lat, cell_lon)
    except SourceDown as e:
        if e.status in (401, 403):
            raise Fail(NO_RIGHTS) from None
        if e.kind == "busy":
            raise Fail("NASA's archive asked us to slow down; try again in a few minutes") from None
        raise
    if land < 0.5:
        raise Fail("This place is open water for the GRACE-FO data, which measures stored water on land", final=True)
    if not np.isfinite(values).any():
        raise Fail("NASA has no GRACE-FO value for this place", final=True)
    # one entry per calendar month; a month the file has two part-month solutions for is their mean, and is named
    by_month, order = {}, []
    for d, v, u in zip(days, values, errors):
        when = day_of(d)
        key = (when.year, when.month)
        if key not in by_month:
            by_month[key] = []
            order.append(key)
        if np.isfinite(v):
            by_month[key].append((v, u, when))
    first, last = order[0], max(k for k in order if by_month[k])
    months, gaps, merged, newest = [], [], [], None
    y, m = first
    while (y, m) <= last:
        got = by_month.get((y, m), [])
        label = "%04d-%02d" % (y, m)
        if got:
            cm = round(sum(g[0] for g in got) / len(got), 2)
            un = [g[1] for g in got if np.isfinite(g[1])]
            months.append([label, cm, round(sum(un) / len(un), 2) if un else None])
            if len(got) > 1:
                merged.append(label)
            newest = (label, got[-1][2].isoformat(), cm, months[-1][2])
        else:
            months.append([label, None, None])
            gaps.append(label)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    spans, run = [], []
    for g in gaps + [None]:
        if g is not None and run and (int(g[:4]) * 12 + int(g[5:]) - (int(run[-1][:4]) * 12 + int(run[-1][5:]))) == 1:
            run.append(g)
        else:
            if run:
                spans.append([run[0], run[-1]])
            run = [g] if g else []
    points = [(int(mo[0][:4]) + (int(mo[0][5:]) - 0.5) / 12.0, mo[1]) for mo in months if mo[1] is not None]
    slope = trend_of(points)
    width = CELL_DEG * KM_PER_DEG * math.cos(math.radians(cell_lat))
    out = {
        "source": SOURCE, "data_date": "%s/%s" % (months[0][0], newest[0]), "units": UNITS,
        "cell": {"lat": cell_lat, "lon": round(((cell_lon + 180.0) % 360.0) - 180.0, 2), "width_km": round(width, 1), "height_km": round(CELL_DEG * KM_PER_DEG, 1),
                 "edges": {"n": round(cell_lat + 0.25, 2), "s": round(cell_lat - 0.25, 2), "e": round(((cell_lon + 0.25 + 180.0) % 360.0) - 180.0, 2), "w": round(((cell_lon - 0.25 + 180.0) % 360.0) - 180.0, 2)}},
        "area_km": AREA_KM, "months": months, "months_read": len(points), "gaps": gaps, "gap_spans": spans, "merged_months": merged,
        "newest_month": newest[0], "newest_date": newest[1], "value_cm": newest[2], "uncertainty_cm": newest[3],
        "trend_cm_per_year": round(slope, 2) if slope is not None else None,
        "trend_from": next(mo[0] for mo in months if mo[1] is not None), "trend_to": newest[0],
        "trend_years": round(points[-1][0] - points[0][0], 1),
        "note": ("Stored water over a region about 300 km wide, the sum of groundwater, soil water, snow and surface water: not a well or a reading in your field. Each value is the change, in centimetres of "
                 "water, from the 2004 to 2009 average. Months with no satellite solution (including the gap between the GRACE and GRACE-FO satellites) are left empty, never filled."),
    }
    if slope is None:
        out["trend_note"] = "Fewer than five years of months were read, so no trend is given"
    common.log("read %d blocks, %d KB of a %d MB file" % (len(pieces.blocks), pieces.bytes >> 10, (pieces.size or 0) >> 20))
    return out


common.run(main, LIMIT_S, slow="NASA's GRACE-FO file took too long to answer; try again in a minute")
