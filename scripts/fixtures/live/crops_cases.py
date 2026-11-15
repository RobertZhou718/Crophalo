# crops_cases.py CASE [ARGUMENTS]: a HAND-MADE TEST AND RECORDING HELPER for the crops-prices lookups, never run by the
# server (written 2026-11-14).
# Reads:   "tables": the UN's country-code table and USDA's crop-map class list, LIVE (run by hand through
#          scripts/record_live_crops-prices.mjs only); "excerpt": the two FAOSTAT bulk files already downloaded by
#          faostat.py; "workbook": nothing (it writes small hand-made Excel files).
# From:    unstats.un.org (UN Statistics Division, M49), www.nass.usda.gov (USDA NASS), FAO's files on disk.
# Returns: one JSON object through common.run(), like every lookup; the files it writes are named in it.
# Checked by: scripts/test_live_crops.mjs (the hand-made workbooks, the tables it wrote).
import common   # first, always
import csv
import html
import io
import json
import re
import sys
import zipfile
from pathlib import Path
from common import Fail

CASE, ARGS = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
M49_PAGE = "https://unstats.un.org/unsd/methodology/m49/overview/"
CDL_LIST = "https://www.nass.usda.gov/sites/default/files/Research_and_Science/Cropland/docs/cdl_codes_names.xlsx"


def tables(args):
    """The two small tables the lookups ship with, read from their publishers today: m49_iso2.json and cdl_codes.json."""
    out = Path(args[0])
    page = common.http(M49_PAGE, timeout=60).text()
    first = page[:page.index("</table>")]   # the page repeats the table in six languages: the first is English
    m49 = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", first, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) >= 12 and re.fullmatch(r"\d{3}", cells[9]) and re.fullmatch(r"[A-Z]{2}", cells[10]):
            m49[str(int(cells[9]))] = cells[10]
    if len(m49) < 240 or m49.get("792") != "TR" or m49.get("124") != "CA":
        raise Fail("The UN country-code table could not be read as expected (%d rows)" % len(m49))
    m49["158"] = "TW"   # the UN table has no row for 158; FAO lists it as "China, Taiwan Province of", and ISO 3166 gives it TW
    doc = {"_source": "UN Statistics Division, Standard country or area codes for statistical use (M49), read on %s; 158 added by hand (see README, faostat)" % common.iso_now()[:10]}
    doc.update(sorted(m49.items(), key=lambda kv: int(kv[0])))
    (out / "m49_iso2.json").write_text(json.dumps(doc, indent=0, ensure_ascii=False) + "\n", encoding="utf-8")

    from openpyxl import load_workbook
    book = load_workbook(io.BytesIO(common.http(CDL_LIST, timeout=60).body), read_only=True, data_only=True)
    codes = {}
    for code, name in book[book.sheetnames[0]].iter_rows(min_row=2, max_col=2, values_only=True):
        if isinstance(code, int) and isinstance(name, str) and name.strip():
            codes[str(code)] = name.strip().replace("_", " ").strip()
    if len(codes) < 100 or codes.get("1") != "Corn" or codes.get("5") != "Soybeans":
        raise Fail("USDA's class list could not be read as expected (%d rows)" % len(codes))
    doc = {"_source": "USDA NASS, Cropland Data Layer class list (cdl_codes_names.xlsx), read on %s; underscores written as spaces" % common.iso_now()[:10]}
    doc.update(codes)
    (out / "cdl_codes.json").write_text(json.dumps(doc, indent=0, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"source": "UN Statistics Division (M49); USDA NASS (class list)", "data_date": common.iso_now()[:10], "units": "none",
            "countries": len(m49), "classes": len(codes)}


def excerpt(args):
    """A small, REAL piece of one FAOSTAT bulk file: FAO's own rows for a few areas, cut out unchanged, in FAO's own
    file layout (the same member names, the same header line). args: the bulk zip, the zip to write, M49 codes."""
    source, dest, wanted = Path(args[0]), Path(args[1]), {"'" + c.zfill(3) for c in args[2:]}
    kept = 0
    with zipfile.ZipFile(source) as big, zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as small:
        for name in big.namelist():
            if name.endswith("_NOFLAG.csv"):
                continue   # the lookup never reads it
            with big.open(name) as raw:
                if not name.endswith("_All_Data.csv"):
                    small.writestr(name, raw.read())   # the small tables (flags, elements, codes) as they are
                    continue
                out = io.StringIO()
                lines = io.TextIOWrapper(raw, encoding="utf-8", newline="")
                out.write(lines.readline())
                for line in lines:   # one line at a time: the whole file is never in memory
                    if next(csv.reader([line]))[1] in wanted:
                        out.write(line)
                        kept += 1
                small.writestr(name, out.getvalue().encode("utf-8"))
    return {"source": "FAOSTAT bulk file, cut down for a test", "data_date": "see the file", "units": "none",
            "rows": kept, "bytes": dest.stat().st_size}


def workbook(args):
    """Hand-made Excel files in the Pink Sheet's layout, with made-up prices that are easy to check by hand.
    args: the folder to write into. The figures are test values, not data."""
    from openpyxl import Workbook
    out = Path(args[0])
    names = ["Maize", "Wheat, US HRW", "Barley", "Cocoa", "Rapeseed oil", "Sugar, world", "Tobacco, US import u.v.", "Soybeans", "Sorghum"]
    units = ["($/mt)", "($/mt)", "($/mt)", "($/kg)", "($/mt)", "($/kg)", "($/mt)", None, "($/bushel)"]
    months = ["%dM%02d" % (2024 + (m - 1) // 12, (m - 1) % 12 + 1) for m in range(1, 35)]   # 2024M01 .. 2026M10

    def make(file, sheet="Monthly Prices", header=True, rows=True, only=None):
        book = Workbook()
        ws = book.active
        ws.title = sheet
        ws.append(["World Bank Commodity Price Data (The Pink Sheet)"])
        ws.append(["monthly prices in nominal US dollars, 1960 to present"])
        ws.append([None])
        ws.append(["Updated on November 03, 2026"])
        cols = [n for n in names if only is None or n in only]
        if header:
            ws.append([None] + cols)
            ws.append([None] + [units[names.index(n)] for n in cols])
        for i, month in enumerate(months if rows else []):
            line = {
                "Maize": 100 + i,                                   # 100 .. 133: latest 133, a year ago 121
                "Wheat, US HRW": "…" if month == "2025M10" else 200 + 2 * i,   # no figure a year ago
                "Barley": 80.4 if i < 20 else "…",                  # ended 2025M08
                "Cocoa": 2.5 if i < 33 else "#VALUE!",              # the newest month is not a number
                "Rapeseed oil": 1000.126 + i,
                "Sugar, world": 0.4,
                "Tobacco, US import u.v.": "...",                    # never a figure
                "Soybeans": 500, "Sorghum": 5,
            }
            ws.append([month] + [line[n] for n in cols])
        book.save(out / file)

    make("good.xlsx")
    make("other-sheet.xlsx", sheet="Monthly Indices")
    make("no-header.xlsx", header=False)
    make("no-months.xlsx", rows=False)
    make("no-crops.xlsx", only=["Soybeans", "Sorghum", "Tobacco, US import u.v."])
    return {"source": "hand-made test workbooks", "data_date": "2026-11-14", "units": "made-up test values",
            "files": sorted(p.name for p in out.glob("*.xlsx")), "months": [months[0], months[-1]]}


CASES = {"tables": tables, "excerpt": excerpt, "workbook": workbook}

if __name__ == "__main__":
    common.run(lambda _: CASES[CASE](ARGS) if CASE in CASES else (_ for _ in ()).throw(Fail("Unknown case")), 300)
