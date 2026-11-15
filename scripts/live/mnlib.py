# mnlib.py: the pure helpers of the Market News lookup mnfield.py (written 2026-11-15). No network, no key, no file: tables and row rules only.
# The state table holds report ids and their order only (which report serves a field in each state); every title, date and status is read from the live report list at run time.
# Rules: a report is live when published within 30 days; a grain row is kept only when current, conventional, in its unit, with both prices as numbers, within 14 days, and (state reports) bid by country elevators.
# Regions are never averaged together; each kept row of the newest day is returned as it is. Checked by: scripts/test_mnfield.mjs (hand-made stand-ins, labelled as not real).
import datetime
import re

LIVE_DAYS = 30      # a report published within this many days is live
ROW_DAYS = 14       # a bid row older than this is not used
WINDOW = {"now": 14, "now_2914": 21}   # the days asked for: state and 2887 reports, and the weekly 2914 report

STATES = {"AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
          "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
          "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
          "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania",
          "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
          "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming"}

# state -> (own report ids, neighbour report ids in the order they are tried). Transcribed from the report catalogue (ids and order only).
# Maryland's own grain report 2714 and cost report 3776 are listed although they stopped, so the page can say since when.
GRAIN = {"AL": ((), (3088, 2928)), "AK": ((), ()), "AZ": ((), (3146,)), "AR": ((2960,), ()), "CA": ((3146,), ()), "CO": ((2912,), ()), "CT": ((), ()), "DE": ((), (3091,)), "FL": ((), ()),
         "GA": ((), (2787, 3088, 3156)), "HI": ((), ()), "ID": ((), (2771, 3239, 3148)), "IL": ((3192,), ()), "IN": ((3463,), ()), "IA": ((2850,), ()), "KS": ((2886,), ()), "KY": ((2892,), ()),
         "LA": ((), (2928, 2960, 2711)), "ME": ((), ()), "MD": ((2714,), (3091, 3167)), "MA": ((), ()), "MI": ((), (2851, 3463)), "MN": ((3049, 3046), ()), "MS": ((2928,), ()), "MO": ((2932,), ()),
         "MT": ((2771,), ()), "NE": ((3225,), ()), "NV": ((), (3146,)), "NH": ((), ()), "NJ": ((), (3091,)), "NM": ((), (2711, 2912, 3100)), "NY": ((), (3091,)), "NC": ((3156,), ()),
         "ND": ((3878,), ()), "OH": ((2851,), ()), "OK": ((3100,), ()), "OR": ((3148,), ()), "PA": ((3091,), ()), "RI": ((), ()), "SC": ((2787,), ()), "SD": ((3186,), ()), "TN": ((3088,), ()),
         "TX": ((2711,), ()), "UT": ((), (2912, 3239)), "VT": ((), ()), "VA": ((3167,), ()), "WA": ((), (3148,)), "WV": ((), (3167, 3091, 2851, 2892)), "WI": ((), (3192, 2850, 3049)), "WY": ((3239,), ())}
HAY = {"AL": ((3050,), ()), "AK": ((), ()), "AZ": ((3784,), ()), "AR": ((), (2929, 3095, 3793)), "CA": ((2904,), ()), "CO": ((2905,), ()), "CT": ((), ()), "DE": ((), (1716, 1725)), "FL": ((), (3050,)),
       "GA": ((), (3050, 3793)), "HI": ((), ()), "ID": ((3056,), ()), "IL": ((3652, 3872), ()), "IN": ((3364, 1650), ()), "IA": ((2807, 2244), ()), "KS": ((2885,), ()), "KY": ((3905, 3793), ()),
       "LA": ((), (2707,)), "ME": ((), ()), "MD": ((), (1716, 1725, 3489)), "MA": ((), ()), "MI": ((), (3364, 1650)), "MN": ((2246,), ()), "MS": ((), (3050, 3793)), "MO": ((2929, 3723), ()),
       "MT": ((2769,), ()), "NE": ((2935,), ()), "NV": ((3926,), ()), "NH": ((), ()), "NJ": ((), (1716, 1725)), "NM": ((2939,), ()), "NY": ((), (1716, 1725)), "NC": ((), (3489, 3793)),
       "ND": ((), (3183, 2769)), "OH": ((), (3364, 1650, 1716)), "OK": ((3095,), ()), "OR": ((3057,), ()), "PA": ((1716, 1725), ()), "RI": ((), ()), "SC": ((), ()), "SD": ((3183, 2245), ()),
       "TN": ((3793,), ()), "TX": ((2707,), ()), "UT": ((3731,), ()), "VT": ((), ()), "VA": ((3489,), ()), "WA": ((3058,), ()), "WV": ((), (3489, 1716)), "WI": ((), (2807, 2246, 3652)), "WY": ((3236,), ())}
COST = {"AL": ((), ()), "AK": ((), ()), "AZ": ((), ()), "AR": ((), (3621,)), "CA": ((), ()), "CO": ((), ()), "CT": ((), ()), "DE": ((), ()), "FL": ((), ()), "GA": ((), (3159,)), "HI": ((), ()),
        "ID": ((), ()), "IL": ((3195,), ()), "IN": ((), (3195,)), "IA": ((2863,), ()), "KS": ((), (3621,)), "KY": ((), (3195,)), "LA": ((), ()), "ME": ((), ()), "MD": ((3776,), ()), "MA": ((), ()),
        "MI": ((), ()), "MN": ((), (2863,)), "MS": ((), ()), "MO": ((), (2863, 3195, 3621)), "MT": ((), ()), "NE": ((), (2863,)), "NV": ((), ()), "NH": ((), ()), "NJ": ((), ()), "NM": ((), (3621,)),
        "NY": ((), ()), "NC": ((3159,), ()), "ND": ((), ()), "OH": ((), ()), "OK": ((3621,), ()), "OR": ((), ()), "PA": ((), ()), "RI": ((), ()), "SC": ((), (3159,)), "SD": ((), (2863,)),
        "TN": ((), (3159,)), "TX": ((), (3621,)), "UT": ((), ()), "VT": ((), ()), "VA": ((), (3159,)), "WA": ((), ()), "WV": ((), ()), "WI": ((), (2863, 3195)), "WY": ((), ())}

# The state department each public report text names as co-publisher. All others: none.
CO_PUBLISHER = {3225: "NE Dept. of Ag Market News", 2935: "NE Dept. of Ag Market News", 2714: "MD Dept. of Ag Market News"}

# The two national reports, asked only for the crops that need one.
NATIONAL = {2887: "oil", 2914: "pulse"}

# Crophalo crop id -> (where it is bid: "state", 2887 or 2914; the Market News commodity; the class asked, or None for any; a class never taken).
# Only pairs seen in real answers. The report's "Millet" is proso millet: only proso is matched to it (never pearl or finger millet). Flax is not matched: no real answer shows a flaxseed row yet.
# RICE IS NOT MATCHED, on purpose. Report 1655 ("National Weekly Rice Summary", Little Rock, AR) lists prices of MILLED rice and rice by-products sold by mills (commodity "Milled Rice" or "Rice By-Products"), not what a farmer is paid for rough (paddy) rice. Showing them as what buyers paid for a rice crop would be untrue, so rice stays "none found" with its plain sentence. (Its section is "Report Details"; fields low_price, high_price, price_Unit, trade_location.)
CROP_NAMES = {
    "corn": ("state", "Corn", None, None),
    "soy": ("state", "Soybeans", None, None),
    "wheat": ("state", "Wheat", None, None),
    "swheat": ("state", "Wheat", None, None),
    "durum": ("state", "Wheat", None, None),
    "sorghum": ("state", "Sorghum", None, None),
    "barley": ("state", "Barley", None, None),
    "canola": (2887, "Canola", None, None),
    "scanola": (2887, "Canola", None, None),
    "sunflower": (2887, "Sunflower Seeds", None, None),
    "proso": (2887, "Millet", None, None),
    "bean": (2914, "Beans", None, "Garbanzo"),
    "pea": (2914, "Peas", None, None),
    "lentil": (2914, "Lentils", None, None),
    "chickpea": (2914, "Beans", "Garbanzo", None),
}
# A state report's commodity -> the crop id it is shown as when the page did not ask for it.
FOUND_AS = {"Corn": "corn", "Soybeans": "soy", "Wheat": "wheat", "Sorghum": "sorghum", "Barley": "barley"}
# Never checked: cover crops are grown to protect the soil, not to sell; forage is not a grain bid; fallow grows nothing.
NOT_CHECKED = frozenset(("ryecover", "vetchmix", "radish", "sunnhemp", "clover", "mustard", "alfalfa", "ley", "fallow"))

CROP_ID = re.compile(r"^[a-z]{2,12}$")
UNIT_WORDS = {"$ Per Bushel": "$ per bushel", "$ Per CWT": "$ per hundred pounds"}


def name_of(crop):
    """(where, commodity, class wanted, class refused) for a crop, or None when Crophalo has no Market News name for it."""
    return CROP_NAMES.get(crop)


def parse_crops(text):
    """The crop ids, sorted and de-duplicated, or None when any is not a Crophalo crop id (at most 16)."""
    parts = [p.strip() for p in str(text or "").split(",") if p.strip()]
    if len(parts) > 16 or not all(CROP_ID.match(p) for p in parts):
        return None
    return sorted(set(parts))


def day(text):
    """A date from Market News' MM/DD/YYYY (a time after it is dropped), or None."""
    m = re.match(r"^\s*(\d{1,2})/(\d{1,2})/(\d{4})\b", str(text or ""))
    if not m:
        return None
    try:
        return datetime.date(int(m.group(3)), int(m.group(1)), int(m.group(2)))
    except ValueError:
        return None


def mmddyyyy(d):
    return "%02d/%02d/%04d" % (d.month, d.day, d.year)


def live(published, today):
    """True when the report was published within LIVE_DAYS of today (a date in the future is not trusted)."""
    return published is not None and 0 <= (today - published).days <= LIVE_DAYS


def is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float("inf")


def drop_reason(row, today, national):
    """Why a bid row is not used, or None when it is kept. One reason per row, in this order."""
    d = day(row.get("report_date"))
    if d is None or not 0 <= (today - d).days <= ROW_DAYS:
        return "old"
    if "price Min" not in row and "price Max" not in row:   # a Report Header row: it holds no price at all
        return "no_price"
    if row.get("current") != "Yes":
        return "forward"
    if row.get("conventional") != "Conventional":
        return "organic"
    units = ("$ Per Bushel", "$ Per CWT") if national else ("$ Per Bushel",)
    if row.get("price_unit") not in units:
        return "other_unit"
    if not (is_number(row.get("price Min")) and is_number(row.get("price Max"))):
        return "no_price"
    if not national and row.get("delivery_point") != "Country Elevators":
        return "other_buyer"
    return None


def no_drops():
    return {"organic": 0, "forward": 0, "no_price": 0, "other_unit": 0, "old": 0, "other_buyer": 0}


def keep_rows(rows, today, national, dropped):
    """The kept rows of one report answer; every other row is counted in `dropped` by its reason."""
    kept = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        why = drop_reason(r, today, national)
        if why:
            dropped[why] += 1
        else:
            kept.append(r)
    return kept


def rows_for(kept, commodity, want_class, refuse_class):
    return [r for r in kept if r.get("commodity") == commodity and (want_class is None or r.get("class") == want_class) and (refuse_class is None or r.get("class") != refuse_class)]


def _span(values):
    nums = [v for v in values if is_number(v)]
    return (min(nums), max(nums)) if nums else (None, None)


def trim(rows, today, national):
    """The newest day's rows of one crop, region by region, never averaged. rows: kept rows of one commodity (not empty)."""
    newest = max(day(r.get("report_date")) for r in rows)
    on_day = [r for r in rows if day(r.get("report_date")) == newest]
    unit = on_day[0].get("price_unit")
    on_day = [r for r in on_day if r.get("price_unit") == unit]   # one unit per crop line: a second unit is never mixed in
    regions = []
    for r in on_day:   # each kept row as it is: two rows of one region on one day stay two lines
        ya = r.get("avg_price_year_ago")
        regions.append({"region": r.get("trade_loc") or r.get("location_State") or None, "class": r.get("class"),
                        "low": r["price Min"], "high": r["price Max"],
                        "year_ago_low": ya if is_number(ya) else None, "year_ago_high": ya if is_number(ya) else None, "rows": 1})
    low = min(r["price Min"] for r in on_day)
    high = max(r["price Max"] for r in on_day)
    ya_low, ya_high = _span([r.get("avg_price_year_ago") for r in on_day])
    classes = sorted({r.get("class") for r in on_day if r.get("class")})
    buyers = sorted({str(r.get("delivery_point")) for r in on_day if r.get("delivery_point")})
    states = sorted({str(r.get("location_State")) for r in on_day if r.get("location_State")})
    places = states or list(dict.fromkeys(str(r.get("trade_loc")) for r in on_day if r.get("trade_loc")))
    return {"class": classes[0] if len(classes) == 1 else None, "classes": classes,
            "report_date": newest.isoformat(), "age_days": (today - newest).days,
            "unit": UNIT_WORDS.get(unit, unit), "buyer": buyers[0] if len(buyers) == 1 else None, "buyers": buyers,
            "low": low, "high": high, "year_ago_low": ya_low, "year_ago_high": ya_high,
            "delivered_by_truck": all(r.get("freight") == "Delivered" and r.get("trans_mode") == "Truck" for r in on_day),
            "regions": regions, "places": places}


def empty_entry(crop, status, report):
    n = name_of(crop)
    return {"crop": crop, "name": n[1] if n else None, "class": n[2] if n else None, "classes": [], "status": status, "report": report,
            "report_date": None, "age_days": None, "unit": None, "buyer": None, "buyers": [], "low": None, "high": None,
            "year_ago_low": None, "year_ago_high": None, "delivered_by_truck": None, "regions": [], "places": []}
