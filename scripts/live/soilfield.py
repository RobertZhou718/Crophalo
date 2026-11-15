# soilfield.py LAT LON: the soil at the field from the US soil survey: the map unit under the pin, its main soils and the top layer of each (written 2026-11-14).
# Reads:   USDA NRCS Soil Data Access, one SQL request: the detailed survey (SSURGO) first; only where SSURGO has nothing at the point (water, land not yet surveyed),
#          a second SQL request to the general soil map (STATSGO2, table gsmmupolygon). No key, no login. The service is a POST that hangs at times and is closed
#          every night from about midnight to 2 am Mountain time, so it is asked by our server, which keeps each answer 30 days.
# From:    Soil Survey Staff, Natural Resources Conservation Service, United States Department of Agriculture: Soil Survey Geographic (SSURGO) Database and
#          U.S. General Soil Map (STATSGO2), https://sdmdataaccess.sc.egov.usda.gov . US Government work.
# Returns: {"ok": true, "source", "data_date", "units", "survey": "SSURGO" | "STATSGO2", "mapunit": {key, symbol, name, area, farmland}, "soils": [{name, percent,
#          drainage, hydrologic_group, slope_pct, capability_class, top: {from_cm, to_cm, organic_matter_pct, ph, sand_pct, silt_pct, clay_pct, water_cm_per_cm}}],
#          "citation", "note"} or {"ok": false, "reason"}. A figure the survey leaves blank stays null, NEVER 0.
# Keeps:   nothing. The server keeps answers.
# Checked by: scripts/test_soilfield.mjs (offline: answers recorded from Soil Data Access on 2026-11-14, and hand-made ones in its documented shape).
import common   # first, always
import json
from common import Fail

LIMIT_S = 60
SDA = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest"
HEADERS = {"Content-Type": "application/json", "Accept": "application/json"}
SURVEYS = {
    "SSURGO": "Soil Survey Geographic (SSURGO) Database",
    "STATSGO2": "U.S. General Soil Map (STATSGO2)",
}
FIELDS = ("mukey", "musym", "muname", "areasymbol", "areaname", "farmlndcl", "saverest", "compname", "comppct_r", "drainagecl", "hydgrp", "slope_r", "nirrcapcl",
          "hzdept_r", "hzdepb_r", "om_r", "ph1to1h2o_r", "sandtotal_r", "silttotal_r", "claytotal_r", "awc_r")
SELECT = ("mu.mukey, mu.musym, mu.muname, l.areasymbol, l.areaname, mu.farmlndcl, sc.saverest, c.compname, c.comppct_r, c.drainagecl, c.hydgrp, c.slope_r, c.nirrcapcl, "
          "h.hzdept_r, h.hzdepb_r, h.om_r, h.ph1to1h2o_r, h.sandtotal_r, h.silttotal_r, h.claytotal_r, h.awc_r")
JOINS = ("INNER JOIN mapunit mu ON mu.mukey = k.mukey INNER JOIN legend l ON l.lkey = mu.lkey LEFT OUTER JOIN sacatalog sc ON sc.areasymbol = l.areasymbol "
         "INNER JOIN component c ON c.mukey = mu.mukey%s LEFT OUTER JOIN chorizon h ON h.cokey = c.cokey AND h.hzdept_r = 0")
MAJOR = " AND c.majcompflag = 'Yes'"   # SSURGO marks its main soils; STATSGO2 marks none (checked 2026-11-14: 9 soils, 0 marked, at the demo field), so there the largest shares are taken
UNITS = ("The top layer of each soil: organic matter in percent of the soil's weight, pH measured in water (1:1), sand, silt and clay in percent, "
         "water the soil holds for plants in centimetres per centimetre of soil; depths in centimetres; slope in percent; each soil's share of the map unit in percent")
OUTSIDE = "The USDA soil survey covers only the United States: there is no SSURGO or STATSGO2 soil at this place"


def sql_ssurgo(lat, lon):
    return "SELECT TOP 6 %s FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(%.5f %.5f)') k %s ORDER BY c.comppct_r DESC" % (SELECT, lon, lat, JOINS % MAJOR)


def sql_statsgo2(lat, lon):
    return ("SELECT DISTINCT TOP 6 %s FROM (SELECT DISTINCT g.mukey FROM gsmmupolygon g WHERE g.mupolygongeo.STIntersects(geometry::STGeomFromText('POINT(%.5f %.5f)', 4326)) = 1) k %s "
            "ORDER BY c.comppct_r DESC" % (SELECT, lon, lat, JOINS % ""))


def body_for(sql):
    """The request body, byte for byte the same for the same point (the server's cache and the tests' recorded answers rely on it)."""
    return json.dumps({"query": sql, "format": "JSON+COLUMNNAME"}, separators=(",", ":")).encode("utf-8")


def rows_of(answer):
    """[{column: value}] from Soil Data Access's JSON+COLUMNNAME answer: {"Table": [[names...], [values...], ...]}; {} when nothing matched."""
    if not isinstance(answer, dict):
        raise Fail("The soil survey sent an answer Crophalo cannot read")
    table = answer.get("Table")
    if table is None:
        return []
    if not isinstance(table, list) or not table or not isinstance(table[0], list) or "mukey" not in table[0]:
        raise Fail("The soil survey sent an answer Crophalo cannot read")
    names = table[0]
    return [dict(zip(names, row)) for row in table[1:] if isinstance(row, list) and len(row) == len(names)]


def num(v, lo, hi):
    """A figure or None: a blank stays blank, never 0; a value outside lo..hi is a broken value and is dropped."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return round(x, 2) if lo <= x <= hi else None


def words(v):
    s = "" if v is None else " ".join(str(v).split())
    return s or None


def shape(rows, survey, checked_day):
    first = rows[0]
    soils, seen = [], set()
    for r in rows:
        name = words(r.get("compname"))
        if not name or (name, r.get("comppct_r")) in seen:
            continue
        seen.add((name, r.get("comppct_r")))
        soils.append({
            "name": name, "percent": num(r.get("comppct_r"), 0, 100), "drainage": words(r.get("drainagecl")), "hydrologic_group": words(r.get("hydgrp")),
            "slope_pct": num(r.get("slope_r"), 0, 300), "capability_class": words(r.get("nirrcapcl")),
            "top": {"from_cm": num(r.get("hzdept_r"), 0, 500), "to_cm": num(r.get("hzdepb_r"), 0, 500), "organic_matter_pct": num(r.get("om_r"), 0, 100),
                    "ph": num(r.get("ph1to1h2o_r"), 1.5, 11.5), "sand_pct": num(r.get("sandtotal_r"), 0, 100), "silt_pct": num(r.get("silttotal_r"), 0, 100),
                    "clay_pct": num(r.get("claytotal_r"), 0, 100), "water_cm_per_cm": num(r.get("awc_r"), 0, 1)},
        })
    version = words(first.get("saverest"))
    day = None
    if version:   # month/day/year with a time, or year-month-day, in the survey catalogue: the day the survey area was last published
        parts = version.split()[0].replace("-", "/").split("/")
        try:
            y, m, d = (int(parts[0]), int(parts[1]), int(parts[2])) if len(parts[0]) == 4 else (int(parts[2]), int(parts[0]), int(parts[1]))
            day = "%04d-%02d-%02d" % (y, m, d)
        except (ValueError, IndexError):
            day = None
    return {
        "source": "Soil Survey Staff, Natural Resources Conservation Service, United States Department of Agriculture: %s, through Soil Data Access" % SURVEYS[survey],
        "data_date": day or "the survey as published when it was read",
        "data_date_note": "The day this soil survey area was last published by NRCS" if day else "The survey catalogue gave no publication day",
        "units": UNITS,
        "survey": survey,
        "mapunit": {"key": words(first.get("mukey")), "symbol": words(first.get("musym")), "name": words(first.get("muname")), "area": words(first.get("areasymbol")),
                    "area_name": words(first.get("areaname")), "farmland": words(first.get("farmlndcl"))},
        "soils": soils,
        "citation": "Soil Survey Staff, Natural Resources Conservation Service, United States Department of Agriculture. %s. Available online at https://sdmdataaccess.sc.egov.usda.gov . Accessed %s."
                    % (SURVEYS[survey], checked_day),
        "note": ("The detailed county soil survey, mapped at field scale. A map unit holds several soils; the shares are the survey's estimate, not a test of your field."
                 if survey == "SSURGO" else
                 "The detailed survey has no soil at this point (water, or land not yet surveyed), so this is the general soil map: about 1:250,000, a guide for the area, not the field."),
    }


def ask(sql):
    return rows_of(common.http(SDA, data=body_for(sql), headers=HEADERS, timeout=45, method="POST").json())


def main(args):
    lat, lon = common.latlon(args)
    checked_day = common.now().strftime("%m/%d/%Y")   # the citation page asks for "Accessed [month/day/year]"
    rows = ask(sql_ssurgo(lat, lon))
    if rows:
        return shape(rows, "SSURGO", checked_day)
    rows = ask(sql_statsgo2(lat, lon))
    if rows:
        return shape(rows, "STATSGO2", checked_day)
    raise Fail(OUTSIDE, final=True)


if __name__ == "__main__":
    common.run(main, LIMIT_S, slow="The US soil survey took too long to answer; try again in a minute (it is closed every night from about midnight to 2 am Mountain time)")
