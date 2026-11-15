# prices.py (no arguments): world crop prices by month, in US dollars (written 2026-11-14).
# Reads:   the World Bank's commodity-markets page (to find today's link to the monthly "Pink Sheet" Excel file), then
#          that file's sheet "Monthly Prices" (about 0.6 MB, opened read-only, row by row).
# From:    The World Bank, www.worldbank.org and thedocs.worldbank.org. No login.
# Returns: {"ok": true, "source", "data_date", "units", "url", "updated", "published", "series": {crop: {"name", "unit",
#           "latest": {"month", "value"}, "year_ago", "change_pct", "last24", ("proxy", "stale")}}, "no_series", ...}
#          or  {"ok": false, "reason"}. The contract: README.md, section "prices".
# Checked by: scripts/test_live_crops.mjs (offline, on the page and the file recorded from the World Bank on 2026-11-14,
#             and on small hand-made workbooks for the cases the real file does not show).
# Keeps nothing on disk.
import common   # first, always: it takes stdout away from every library
import datetime
import io
import re
import urllib.parse
import zipfile
from common import Fail, SourceDown

LIMIT_S = 300   # the server's time limit for this lookup
PAGE = "https://www.worldbank.org/en/research/commodity-markets"
SHEET = "Monthly Prices"
# crop id -> (the Pink Sheet's column, None or what the column really is when it is not the crop itself)
SERIES = {
    "corn": ("Maize", None), "wheat": ("Wheat, US HRW", None), "soy": ("Soybeans", None), "barley": ("Barley", None),
    "sorghum": ("Sorghum", None), "cotton": ("Cotton, A Index", None), "canola": ("Rapeseed oil", "rapeseed oil"),
    "sunflower": ("Sunflower oil", "sunflower oil"), "tea": ("Tea, avg 3 auctions", None), "rice": ("Rice, Thai 5%", None),
    "groundnut": ("Groundnuts", None), "tobacco": ("Tobacco, US import u.v.", None), "coffee": ("Coffee, Arabica", None),
    "robusta": ("Coffee, Robusta", None), "cocoa": ("Cocoa", None), "rubber": ("Rubber, TSR20", None),
    "banana": ("Banana, US", None), "citrus": ("Orange", None), "oilpalm": ("Palm oil", "palm oil"),
    "coconut": ("Coconut oil", "coconut oil"), "sugarcane": ("Sugar, world", "raw sugar"), "sugarbeet": ("Sugar, world", "raw sugar"),
}
NO_SERIES = ["chickpea", "lentil", "pea", "alfalfa", "bean", "potato", "hazelnut"]   # the Pink Sheet has no price for these: never estimated
UNITS = {"$/mt": "US$ per tonne", "$/kg": "US$ per kg"}   # the only units this lookup was checked against
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
BUSY = "The World Bank asked us to slow down; try again in a few minutes"


def plain(name):
    """A column title as the sheet means it: 'Rubber, TSR20 **' and 'Rice, Thai 5% ' are 'Rubber, TSR20' and 'Rice, Thai 5%'."""
    return " ".join(str(name).replace("*", " ").split())


def month_of(cell):
    """'2026M10' -> '2026-10'; anything else -> None."""
    found = re.fullmatch(r"(\d{4})M(\d{2})", str(cell).strip()) if cell is not None else None
    return "%s-%s" % found.groups() if found and 1 <= int(found.group(2)) <= 12 else None


def price(cell):
    """A cell as a price, or None. The sheet writes a month without a price as '…' (or '...', '#VALUE!'): that is not 0."""
    if isinstance(cell, bool) or not isinstance(cell, (int, float)):
        return None
    return round(float(cell), 2) if cell == cell and 0 < cell < 1e9 else None


def months_back(month, n):
    y, m = int(month[:4]), int(month[5:])
    back = y * 12 + (m - 1) - n
    return "%04d-%02d" % (back // 12, back % 12 + 1)


def trust_certifi():
    """The World Bank's file host (thedocs.worldbank.org) shows a certificate that this Mac's own, older list of
    certificate authorities cannot follow to its root: Python then refuses the download. The project's pinned `certifi`
    list knows the root, so it is ADDED to what common.py's requests trust. Nothing is switched off: a wrong
    certificate still fails. (This reaches into common.py's opener; it belongs there, see README "prices".)"""
    try:
        import certifi
        for handler in getattr(common, "_opener").handlers:
            context = getattr(handler, "_context", None)
            if context is not None:
                context.load_verify_locations(cafile=certifi.where())
    except Exception as e:   # without it the request is still made, and fails closed
        common.log("certifi's list could not be added:", type(e).__name__)


def get(url, what, timeout):
    try:
        return common.http(url, timeout=timeout)
    except SourceDown as e:
        raise Fail(BUSY if e.kind == "busy" else what) from None


def main(args):
    if args:
        raise Fail("This lookup takes no arguments")
    trust_certifi()
    page = get(PAGE, "The World Bank's commodity-markets page did not answer; try again in a minute", 40).text()
    link = re.search(r'href="([^"]*CMO-Historical-Data-Monthly\.xlsx)"', page)
    if not link:
        raise Fail("The monthly price file (Pink Sheet) was not found on the World Bank's commodity-markets page")
    url = urllib.parse.urljoin(PAGE, link.group(1).replace("&amp;", "&"))
    if urllib.parse.urlsplit(url).netloc.lower().rsplit(".", 2)[-2:] != ["worldbank", "org"]:   # never follow the page to somebody else's file
        raise Fail("The monthly price file (Pink Sheet) was not found on the World Bank's commodity-markets page")
    body = get(url, "The World Bank's monthly price file (Pink Sheet) could not be downloaded; try again in a minute", 90).body
    if body[:2] != b"PK":
        raise Fail("The World Bank's monthly price file (Pink Sheet) did not arrive as an Excel file; try again in a minute")

    from openpyxl import load_workbook   # here, not at the top: a refused request never pays for the library
    try:
        book = load_workbook(io.BytesIO(body), read_only=True, data_only=True)
    except (zipfile.BadZipFile, KeyError, ValueError, OSError, EOFError) as e:
        common.log("the workbook could not be opened:", type(e).__name__)
        raise Fail("The World Bank's monthly price file (Pink Sheet) did not arrive as an Excel file; try again in a minute") from None
    if SHEET not in book.sheetnames:
        raise Fail("The Pink Sheet has no 'Monthly Prices' sheet any more, and Crophalo has not been checked against the new layout")
    published, columns, units, rows = None, None, None, []
    for row in book[SHEET].iter_rows(values_only=True):   # read-only mode: one row in memory at a time
        if columns is None:
            first = str(row[0] or "") if row else ""
            said = re.search(r"Updated on\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})", first)
            if said and said.group(1).capitalize() in MONTHS:
                try:
                    published = datetime.date(int(said.group(3)), MONTHS.index(said.group(1).capitalize()) + 1, int(said.group(2))).isoformat()
                except ValueError:
                    pass
            if any(plain(c) == "Maize" for c in row if c is not None):
                columns = {plain(c): i for i, c in enumerate(row) if c is not None}
        elif units is None:
            units = row   # the line under the titles: "($/mt)", "($/kg)", ...
        elif month_of(row[0] if row else None):
            rows.append(row)
    book.close()
    if columns is None:
        raise Fail("The Pink Sheet's layout changed (no row of titles with 'Maize'), and Crophalo has not been checked against it")
    if not rows:
        raise Fail("The Pink Sheet has no monthly rows; try again in a minute")
    months = [month_of(r[0]) for r in rows]
    if months != sorted(set(months)):
        raise Fail("The Pink Sheet's months are out of order, so its newest prices cannot be told apart")
    newest = months[-1]

    series, unit_not_read = {}, []
    for crop, (name, stands_for) in SERIES.items():
        i = columns.get(name)
        if i is None:
            continue
        unit = str(units[i] if units and i < len(units) and units[i] is not None else "").strip().strip("()").strip()
        if unit not in UNITS:   # a price without a unit that was checked is not shown
            unit_not_read.append(crop)
            continue
        values = {m: price(r[i] if i < len(r) else None) for m, r in zip(months, rows)}
        last = next((m for m in reversed(months) if values[m] is not None), None)
        if last is None:
            continue
        ago = months_back(last, 12)
        one = {"name": name, "unit": unit, "unit_words": UNITS[unit], "latest": {"month": last, "value": values[last]},
               "year_ago": {"month": ago, "value": values[ago]} if values.get(ago) is not None else None}
        one["change_pct"] = round((values[last] / values[ago] - 1) * 100, 1) if one["year_ago"] else None
        one["last24"] = [{"month": m, "value": values.get(m)} for m in (months_back(last, n) for n in range(23, -1, -1))]   # a month without a price stays null
        if stands_for:
            one["proxy"] = True
            one["proxy_note"] = "This is the price of %s, shown as a guide: the Pink Sheet has no price for the crop itself" % stands_for
        if last < months_back(newest, 3):   # more than three months behind the sheet: an old price must not look current
            one["stale"] = True
            one["stale_note"] = "The World Bank stopped updating this series after %s" % last
        series[crop] = one
    if not series:
        raise Fail("None of the crop prices were found in the Pink Sheet, and Crophalo has not been checked against its new layout")
    out = {
        "source": "World Bank Commodity Price Data (The Pink Sheet), monthly prices in nominal US dollars" + (", updated %s" % published if published else ""),
        "data_date": newest,
        "data_date_note": "The newest month in the sheet is %s. Each series says its own newest month; a series marked stale ended earlier" % newest,
        "units": "US dollars of the month (not corrected for inflation); each series names its unit: $/mt is per tonne, $/kg is per kg",
        "url": url, "updated": newest, "published": published,
        "series": series,
        "no_series": NO_SERIES + sorted(c for c in SERIES if c not in series and c not in unit_not_read),
    }
    if unit_not_read:
        out["unit_not_read"] = sorted(unit_not_read)
    return out


if __name__ == "__main__":
    common.run(main, LIMIT_S, slow="The World Bank took too long to answer; try again in a minute")
