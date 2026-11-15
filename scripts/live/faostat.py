# faostat.py (no arguments): what each country harvests, its national yields and its farm-gate prices (written 2026-11-14).
# Reads:   FAOSTAT's two bulk files, "Production: Crops and livestock products" and "Producer Prices" (zip files with one
#          big CSV each). It first asks only for their Last-Modified date; a file is downloaded again only when FAO changed it.
# From:    FAO of the United Nations, bulks-faostat.fao.org. No login.
# Returns: {"ok": true, "source", "data_date", "units", "latestYear", "years", "prices": {...}, "yields": {...},
#           "countries": {ISO2: {"name", "area": {crop: ha}, "yield": {crop: [t/ha, years]}, "price": {crop: [US$/t, year]}}},
#           "rebuilt", ("stale", "note")}  or  {"ok": false, "reason"}. The contract: README.md, section "faostat".
# Checked by: scripts/test_live_crops.mjs (offline: FAO's own rows for a few countries cut from the files of 2026-11-14,
#             and hand-made small files for the cases FAO's files do not show).
# Kept:    the two zip files as FAO sent them, under FW_CACHE/faostat/. Never an answer: every run reads the figures
#          again from the files, one line at a time (the production CSV is 93 MB unpacked: it is never held in memory).
import common   # first, always: it takes stdout away from every library
import csv
import email.utils
import json
import os
import re
import threading
import time
import zipfile
import zlib
from pathlib import Path
from common import Fail, SourceDown
from faostat_items import ITEMS, NO_YIELD
from flock_compat import fcntl

LIMIT_S = 420   # the server's time limit for this lookup
BASE = "https://bulks-faostat.fao.org/production/"
FILES = {"production": "Production_Crops_Livestock_E_All_Data.zip", "prices": "Prices_E_All_Data.zip"}
AREA, PRODUCTION, PRICE, ANNUAL = "5312", "5510", "5532", "7021"   # FAO's element codes; 7021 = the annual value, not a month
UNIT = {AREA: "ha", PRODUCTION: "t", PRICE: "USD"}   # a row in another unit is not read: no figure is better than a wrong one
RECENT = 8          # year columns kept while reading: enough to find the three newest years that hold figures
MIN_YIELD_HA = 1000  # a national yield from less land than this says more about a few farms than about the country
DOWN = "FAOSTAT did not answer; try again in a minute"
BUSY = "FAOSTAT asked us to slow down; try again in a few minutes"
UNREADABLE = "FAOSTAT's files could not be read just now; try again in a minute"
LAYOUT = "FAOSTAT changed the layout of its files, and Crophalo has not been checked against it yet"
FLAGS_NOTE = ("Every figure is FAO's own. A value FAO marks as missing is left out. Crops under not_official rest on a "
              "figure FAO marks as estimated, imputed, from another organisation or a break in its series")


class Layout(Exception):
    """The file is not laid out the way this lookup was checked against."""


BROKEN = (Layout, zipfile.BadZipFile, zlib.error, EOFError, OSError, UnicodeDecodeError, csv.Error)   # what a cut-off or changed file raises


def iso(http_date):
    """'Wed, 31 Dec 2025 11:33:25 GMT' -> '2025-12-31T11:33:25Z'; None when it is not a date."""
    try:
        return email.utils.parsedate_to_datetime(http_date).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError):
        return None


def figure(text, flag):
    """One cell as a number, or None: blank, flagged M ("missing value; data cannot exist"), not a number, or negative."""
    if not text or flag.strip() == "M":
        return None
    try:
        v = float(text)
    except ValueError:
        return None
    return v if v >= 0 and v != float("inf") else None


def lines_of(raw, piece=1 << 20):
    """The lines of a packed file, 1 MB at a time: the whole file is never in memory."""
    tail = b""
    while True:
        block = raw.read(piece)
        if not block:
            break
        parts = (tail + block).split(b"\n")
        tail = parts.pop()
        yield from parts
    if tail:
        yield tail


def read_rows(zip_path, elements, annual_only=False):
    """Yields (m49, area name, item, element, {year: (value, flag)}) for the wanted rows of one bulk file, line by line."""
    with zipfile.ZipFile(zip_path) as z:
        members = [n for n in z.namelist() if n.endswith("_All_Data.csv")]   # not the _NOFLAG copy, not the small code tables
        if len(members) != 1:
            raise Layout("no single data file inside")
        with z.open(members[0]) as raw:
            lines = lines_of(raw)
            head = next(csv.reader([next(lines, b"").decode("utf-8-sig")]), [])
            at = {name: i for i, name in enumerate(head)}
            need = ["Area Code (M49)", "Area", "Item", "Element Code", "Unit"] + (["Months Code"] if annual_only else [])
            years = sorted(int(name[1:]) for name in head if re.fullmatch(r"Y\d{4}", name) and name + "F" in at)
            if any(n not in at for n in need) or not years:
                raise Layout("a column is missing")
            cols = [(y, at["Y%d" % y], at["Y%dF" % y]) for y in years[-RECENT:]]
            m49_at, area_at, item_at, element_at, unit_at = (at[n] for n in need[:5])
            month_at, width = at.get("Months Code"), len(head)
            marks = [('","%s","' % e).encode() for e in elements]   # a cheap first look: most lines are livestock or other elements
            wanted = (line.decode("utf-8") for line in lines if any(mark in line for mark in marks))
            for row in csv.reader(wanted):
                if len(row) != width or row[element_at] not in elements or row[item_at] not in ITEMS:
                    continue
                if row[unit_at] != UNIT[row[element_at]] or (annual_only and row[month_at] != ANNUAL):
                    continue
                values = {y: (v, row[f].strip()) for y, i, f in cols for v in [figure(row[i], row[f])] if v is not None}
                if values:
                    yield row[m49_at].strip("'").lstrip("0"), row[area_at], row[item_at], row[element_at], values


def span(years):
    """[2022, 2023, 2024] -> '2022-2024'; [2022, 2024] -> '2022, 2024'; one year -> '2023'."""
    years = sorted(years)
    if len(years) > 1 and years[-1] - years[0] == len(years) - 1:
        return "%d-%d" % (years[0], years[-1])
    return ", ".join(str(y) for y in years)


def build(production_zip, prices_zip):
    """The figures of every country, from the two files. Nothing is filled in: a part FAO does not have stays out."""
    with open(Path(__file__).with_name("m49_iso2.json"), encoding="utf-8") as f:
        iso2 = {m49: code.upper() for m49, code in json.load(f).items()}   # the table may write a code in small letters (Anguilla's); the answer always uses capitals
    names, area, made, price = {}, {}, {}, {}   # area/made/price: {iso: {item: {year: (value, flag)}}}
    for m49, name, item, element, values in read_rows(production_zip, (AREA, PRODUCTION)):
        code = iso2.get(m49)   # regional totals and countries that no longer exist have no code: they fall out
        if code:
            names[code] = name
            (area if element == AREA else made).setdefault(code, {})[item] = values
    for m49, name, item, element, values in read_rows(prices_zip, (PRICE,), annual_only=True):
        code = iso2.get(m49)
        if code in names:
            price.setdefault(code, {})[item] = values
    area_years = {y for items in area.values() for values in items.values() for y in values}
    if not area_years:
        raise Layout("no area figures")
    latest = max(area_years)
    window = [latest - 2, latest - 1, latest]   # FAO may add an empty column for a year it has not filled yet: it is not counted
    price_years = {y for items in price.values() for values in items.values() for y in values}
    price_window = list(range(max(price_years) - 4, max(price_years) + 1)) if price_years else []
    crops = {}
    for item, crop in ITEMS.items():
        crops.setdefault(crop, []).append(item)

    countries = {}
    for code in sorted(names):
        a, p, usd = area.get(code, {}), made.get(code, {}), price.get(code, {})
        areas, yields, prices, soft = {}, {}, {}, set()
        for crop, items in crops.items():
            # area: per item the mean of the window's years that have a figure, then added up over the crop's items
            total = 0.0
            for item in items:
                got = [a[item][y] for y in window if y in a.get(item, {})]
                if got:
                    total += sum(v for v, _ in got) / len(got)
                    if any(flag != "A" for _, flag in got):
                        soft.add(crop)
            if round(total) >= 1:
                areas[crop] = round(total)
            if crop in NO_YIELD:
                continue
            # yield: tonnes and hectares are paired per item and per year BEFORE anything is added up; a year in which
            # one item of the crop has only one of the two is not used at all, so a yield never divides unlike figures
            tonnes = hectares = 0.0
            whole_years = []
            for y in window:
                pairs = [(a.get(item, {}).get(y), p.get(item, {}).get(y)) for item in items]
                pairs = [(ha, t) for ha, t in pairs if (ha and ha[0] > 0) or (t and t[0] > 0)]
                if pairs and all(ha and t and ha[0] > 0 for ha, t in pairs):
                    whole_years.append(y)
                    hectares += sum(ha[0] for ha, _ in pairs)
                    tonnes += sum(t[0] for _, t in pairs)
                    if any(ha[1] != "A" or t[1] != "A" for ha, t in pairs):
                        soft.add(crop)
            if whole_years and hectares / len(whole_years) >= MIN_YIELD_HA and tonnes > 0:
                yields[crop] = [round(tonnes / hectares, 2), span(whole_years)]
            # price: the newest of the last five years in which FAO has one; several items of one crop are weighted by
            # the tonnes each made in that same year (a year without those tonnes is passed over, not guessed)
            for y in reversed(price_window):
                priced = [(usd[item][y], p.get(item, {}).get(y)) for item in items if y in usd.get(item, {})]
                if len(priced) == 1:
                    value = priced[0][0][0]
                elif priced and all(t and t[0] > 0 for _, t in priced):
                    value = sum(d[0] * t[0] for d, t in priced) / sum(t[0] for _, t in priced)
                else:
                    continue
                if round(value) > 0:
                    prices[crop] = [round(value), y]
                    if any(d[1] != "A" for d, _ in priced):
                        soft.add(crop)
                break
        if not areas:
            continue
        country = {"name": common.country_name(names[code], code), "area": dict(sorted(areas.items(), key=lambda kv: -kv[1]))}
        if yields:
            country["yield"] = yields
        if prices:
            country["price"] = prices
        if soft & (set(areas) | set(yields) | set(prices)):
            country["not_official"] = sorted(soft & (set(areas) | set(yields) | set(prices)))
        countries[code] = country
    if not countries:
        raise Layout("no country could be read")
    seen = {item for group in (area, made) for items in group.values() for item in items}
    return {"countries": countries, "latest": latest, "window": window, "price_window": price_window,
            "not_found": sorted(item for item in ITEMS if item not in seen)}


def answer(built, meta, rebuilt, stale_note=None):
    w, pw = built["window"], built["price_window"]
    day = {name: (iso(meta[name]["last_modified"]) or "")[:10] for name in FILES}
    out = {
        "source": "FAOSTAT (Production: Crops and livestock products; Producer Prices), FAO of the United Nations",
        "data_date": "%d/%d" % (w[0], w[-1]),
        "data_date_note": ("Areas and yields are for the years %d to %d. Each price is for the year written beside it%s. "
                           "FAO published the production file on %s and the price file on %s"
                           % (w[0], w[-1], " (%d to %d)" % (pw[0], pw[-1]) if pw else "", day["production"], day["prices"])),
        "units": {"area": "ha, mean of the years %d to %d that FAO reports" % (w[0], w[-1]),
                  "yield": "tonnes per hectare, with the years it is from",
                  "price": "US$ per tonne at the farm gate, with its year"},
        "url": BASE + FILES["production"],
        "updated": iso(meta["production"]["last_modified"]),
        "latestYear": built["latest"],
        "years": w,
        "prices": {"source": "FAOSTAT Producer Prices (US$ per tonne, annual), FAO of the United Nations",
                   "url": BASE + FILES["prices"], "updated": iso(meta["prices"]["last_modified"]),
                   "unit": "US$ per tonne, the latest annual value of the last five years", "years": pw},
        "yields": {"source": "FAOSTAT Production (production divided by area harvested, same crop item, same years)",
                   "unit": "tonnes per hectare, over the years written beside each yield; only where at least 1,000 ha a year"},
        "flags_note": FLAGS_NOTE,
        "countries": built["countries"],
        "rebuilt": rebuilt,
    }
    if built["not_found"]:   # FAO renamed or dropped an item: its crop has no figure, and the answer says which
        out["items_not_found"] = built["not_found"]
    if stale_note:
        out["stale"] = True
        out["note"] = "%s; these figures are from the files FAO published on %s and %s" % (stale_note, day["production"], day["prices"])
    return out


def fetch(url, dest, seconds):
    """common.download, but given up after `seconds` so that there is still time to answer from the kept files."""
    box = {}

    def work():
        try:
            box["file"] = common.download(url, dest, timeout=min(60, max(1, seconds)))
        except BaseException as e:   # handed to the main thread below
            box["error"] = e

    worker = threading.Thread(target=work, daemon=True)
    worker.start()
    worker.join(max(0.0, seconds))
    if worker.is_alive():
        raise SourceDown("the download did not finish in time", "timeout")
    if "error" in box:
        raise box["error"]
    return box["file"]


def main(args):
    if args:
        raise Fail("This lookup takes no arguments")
    folder = common.cache_dir("faostat")
    lock = open(folder / "lock", "a+")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)   # two runs at once would write the same files
    except OSError:
        raise Fail("FAOSTAT is already being read for another visitor; try again in a minute") from None
    for old in folder.glob("*.part"):   # a download that was cut off an hour ago or more
        if time.time() - old.stat().st_mtime > 3600:
            old.unlink(missing_ok=True)
    kept_files = {name: folder / (name + ".zip") for name in FILES}
    try:
        meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
        have = {n: bool(kept_files[n].exists() and meta[n]["last_modified"]) for n in FILES}
    except (OSError, ValueError, KeyError, TypeError):
        meta, have = {}, {n: False for n in FILES}
    kept = all(have.values())   # an answer needs both files
    # the network gets the time that is left MINUS what reading the files needs, so the kept files can still answer
    stop_asking = time.monotonic() + common.left() - min(40.0, common.left() * 0.5)

    def from_kept(why):
        try:
            return answer(build(kept_files["production"], kept_files["prices"]), meta, False, why)
        except BROKEN as e:
            common.log("the kept files could not be read:", type(e).__name__, e)
            raise Fail(UNREADABLE) from None

    heads = {}
    try:
        for name, file in FILES.items():
            for attempt in (1, 2):   # two tries, inside the time the network may use
                try:
                    wait = min(40.0, stop_asking - time.monotonic())
                    if wait < 0.5:
                        raise SourceDown("no time left to ask FAOSTAT", "timeout")
                    reply = common.http(BASE + file, method="HEAD", timeout=wait, tries=1)
                    break
                except SourceDown as e:
                    if attempt == 2 or e.kind == "busy" or (e.kind == "http" and e.status < 500):
                        raise
                    time.sleep(0.05 if common.REPLAY else common.RETRY_PAUSE_S)
            if not iso(reply.headers.get("last-modified")):
                raise SourceDown("FAOSTAT did not say when %s was last changed" % name, "http", reply.status)
            heads[name] = {"last_modified": reply.headers["last-modified"], "bytes": reply.headers.get("content-length")}
    except SourceDown as e:
        if kept:
            return from_kept("FAOSTAT could not be asked whether anything is newer just now")
        raise Fail(BUSY if e.kind == "busy" else DOWN) from None

    changed = [n for n in FILES if not have[n] or meta[n]["last_modified"] != heads[n]["last_modified"]]
    if not changed:
        return from_kept(None)
    fresh = {name: folder / (name + ".new.zip") for name in changed}
    try:
        for name in changed:
            common.log("downloading the %s file: FAO changed it on %s" % (name, heads[name]["last_modified"]))
            fetch(BASE + FILES[name], fresh[name], stop_asking - time.monotonic())
            size = heads[name]["bytes"]
            if size and size.isdigit() and int(size) != fresh[name].stat().st_size:
                raise SourceDown("the %s file arrived cut short" % name, "http")
        built = build(fresh.get("production", kept_files["production"]), fresh.get("prices", kept_files["prices"]))
    except (SourceDown,) + BROKEN as e:
        common.log("the new files could not be used:", type(e).__name__, e)
        for file in fresh.values():
            file.unlink(missing_ok=True)
        if kept:
            return from_kept("FAOSTAT has newer files, but they could not be read just now")
        if isinstance(e, SourceDown):
            raise Fail(BUSY if e.kind == "busy" else UNREADABLE) from None
        raise Fail(LAYOUT if isinstance(e, Layout) else UNREADABLE) from None
    for name in changed:   # only now, after the new files were read to the end, do they replace the kept ones
        os.replace(fresh[name], kept_files[name])
        meta[name] = dict(heads[name], downloaded=common.iso_now())
    common.atomic_write(folder / "meta.json", json.dumps(meta, indent=1).encode("utf-8"))
    return answer(built, meta, True)


if __name__ == "__main__":
    common.run(main, LIMIT_S, slow="FAOSTAT took too long to answer; try again in a few minutes")
