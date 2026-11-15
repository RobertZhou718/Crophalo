# cropsnear.py LAT LON COUNTRY: which crops farmers grow in a box around the field, as shares of the farmland in it.
# Reads:   the newest year of a national 30 m crop map, counted pixel by pixel over a box 0.25 degrees across centred on the
#          field (about 28 km north to south, and 20 km east to west at 44 N), in ONE request: the map service's own
#          computeHistograms over the box at the map's 30 m pixels.
#          COUNTRY CA: Agriculture and Agri-Food Canada's Annual Crop Inventory (agriculture.canada.ca ImageServer, no login).
#          COUNTRY US: USDA NASS Cropland Data Layer on USDA's CroplandCROS image service (pdi.scinet.usda.gov, no login).
# Returns: {"ok": true, "source", "data_date", "units", "year", "box", "pixel_ha", "cropland_ha", "box_ha", "not_read_share",
#           "crops": [{"crop": <crops.js id>, "share", "ha"}], "wider": [{"code", "name", "crops", "share", "ha"}],
#           "classes": [{"code", "name", "kind": own|wider|other, "crops", "share", "ha"}] (every farmland class in the box),
#           "pin": {"code", "name"} (the map's class at the field's own point, from a second request, identify; null when it could
#           not be read; a USDA class of the map's "garden" part, a crop that stays for years, adds "kind": "garden" and "crops",
#           the GARDENS ids of js/crops.js that hold it), "licence"}  or  {"ok": false, "reason", ("final")}.
#          share = that crop's (or class's) part of the farmland in the box, 0 to 1, from the map's own pixel counts.
#          crops lists the crops whose own class is on the map with at least one pixel; wider lists the classes that hold
#          several crops without saying which (their "crops" are the ids they may hold, "*" = any crop not classed alone).
#          Nothing is decided here: js/nearby.js turns the answer into what the report leaves out or ranks first.
# Map:     cropsnear_map.json (class -> crops.js id, by hand); the class names are checked against aci_classes.json and
#          cdl_codes.json, the maps' own class lists. The contract: README.md, section "cropsnear".
# Checked by: node scripts/test_cropsnear.mjs (offline, on answers recorded from the live services on 2026-11-14).
import common   # first, always: it takes stdout away from every library
import json
import math
import re
import urllib.parse
from pathlib import Path
from common import Fail, SourceDown

LIMIT_S = 120     # the server's time limit for this lookup
ONE_S = 45        # one request; measured on 2026-11-14: the inventory's histogram over the box answered in under 1 s
HALF = 0.125      # degrees each side of the field: a box 0.25 degrees across
ACI = "https://agriculture.canada.ca/imagery-images/rest/services/annual_crop_inventory"
CDL = "https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer"
PIXEL_M = 30      # both maps' pixel, asked in their own Web Mercator grid (EPSG:3857), where a pixel is 30 m times cos(latitude) on the ground
HERE = Path(__file__).parent
WHO = {"CA": "The Canadian crop map (AAFC Annual Crop Inventory)", "US": "The US crop map (USDA Cropland Data Layer)"}


def table(name):
    with open(HERE / name, encoding="utf-8") as f:
        return json.load(f)


def box_of(lat, lon):
    return {"south": round(lat - HALF, 4), "west": round(lon - HALF, 4), "north": round(lat + HALF, 4), "east": round(lon + HALF, 4)}


def histogram(base, box, who, mosaic=None):
    """Pixel counts per class value over the box, from the service's own computeHistograms at 30 m."""
    q = {
        "geometry": json.dumps({"xmin": box["west"], "ymin": box["south"], "xmax": box["east"], "ymax": box["north"], "spatialReference": {"wkid": 4326}}, separators=(",", ":")),
        "geometryType": "esriGeometryEnvelope",
        "pixelSize": json.dumps({"x": PIXEL_M, "y": PIXEL_M, "spatialReference": {"wkid": 102100}}, separators=(",", ":")),
        "f": "json",
    }
    if mosaic is not None:
        q["mosaicRule"] = json.dumps(mosaic, separators=(",", ":"))
    try:
        got = common.http(base + "/computeHistograms?" + urllib.parse.urlencode(q), timeout=ONE_S).json()
    except SourceDown as e:
        if e.kind == "busy":
            raise Fail("%s asked us to slow down; try again in a few minutes" % who) from None
        raise Fail("%s did not answer just now; try again in a minute" % who) from None
    h = (got.get("histograms") or [None])[0] if isinstance(got, dict) else None
    counts = h.get("counts") if isinstance(h, dict) else None
    if not isinstance(counts, list) or not counts or h.get("size") != len(counts) \
            or not abs(h.get("min", 0) + 0.5) < 1e-9 or not abs((h.get("max", 0) - h.get("min", 0)) / len(counts) - 1) < 1e-9 \
            or not all(isinstance(c, int) and c >= 0 for c in counts):   # one bin per class value, from 0: anything else is not a class count
        raise Fail("%s sent counts Crophalo could not read; try again in a minute" % who)
    return {v: c for v, c in enumerate(counts) if c}


def pin_class(base, lat, lon, mosaic=None):
    """The map's class value at the field's own point, from the service's identify. None when it cannot be read: the box answer
    stands without it, and js/nearby.js then judges by the box alone."""
    q = {
        "geometry": json.dumps({"x": lon, "y": lat, "spatialReference": {"wkid": 4326}}, separators=(",", ":")),
        "geometryType": "esriGeometryPoint",
        "returnGeometry": "false",
        "returnCatalogItems": "false",
        "f": "json",
    }
    if mosaic is not None:
        q["mosaicRule"] = json.dumps(mosaic, separators=(",", ":"))
    try:
        got = common.http(base + "/identify?" + urllib.parse.urlencode(q), timeout=ONE_S).json()
    except (SourceDown, ValueError):
        return None
    value = str(got.get("value", "")) if isinstance(got, dict) else ""
    return int(value) if re.fullmatch(r"\d{1,3}", value) else None   # "NoData" or anything else is no class


def newest_aci():
    """The newest year the inventory publishes, from its own list of services."""
    try:
        listing = common.http(ACI + "?f=json", timeout=ONE_S).json()
    except SourceDown as e:
        raise Fail(("%s asked us to slow down; try again in a few minutes" if e.kind == "busy" else "%s did not answer just now; try again in a minute") % WHO["CA"]) from None
    years = [int(m.group(1)) for s in (listing.get("services") or []) if isinstance(s, dict) and s.get("type") == "ImageServer"
             for m in [re.fullmatch(r"annual_crop_inventory/(\d{4})", str(s.get("name", "")))] if m]
    if not years:
        raise Fail("%s did not list any year of its map; try again later" % WHO["CA"])
    return max(years)


def newest_cdl():
    """The newest year on USDA's image service and the id of its raster."""
    q = {"where": "Category=1", "outFields": "OBJECTID,Name,Year", "orderByFields": "Year DESC", "resultRecordCount": "1", "returnGeometry": "false", "f": "json"}
    try:
        got = common.http(CDL + "/query?" + urllib.parse.urlencode(q), timeout=ONE_S).json()
    except SourceDown as e:
        raise Fail(("%s asked us to slow down; try again in a few minutes" if e.kind == "busy" else "%s did not answer just now; try again in a minute") % WHO["US"]) from None
    rows = [f.get("attributes") or {} for f in (got.get("features") or []) if isinstance(f, dict)]
    row = rows[0] if rows else {}
    if not isinstance(row.get("Year"), int) or not isinstance(row.get("OBJECTID"), int) or not re.fullmatch(r"%d_\d+m_cdls" % row["Year"], str(row.get("Name", ""))):
        raise Fail("%s did not name its newest year; try again later" % WHO["US"])
    return row["Year"], row["OBJECTID"], row["Name"]


def main(args):
    lat, lon = common.latlon(args, max_lat=84)
    country = (args[2] if len(args) > 2 else "").strip().upper()
    if country not in WHO:
        raise Fail("The crop maps read here cover Canada (CA) and the 48 lower US states (US) only", final=True)
    box = box_of(lat, lon)
    the_map, names = table("cropsnear_map.json")["aci" if country == "CA" else "cdl"], table("aci_classes.json" if country == "CA" else "cdl_codes.json")
    if country == "CA":
        year = newest_aci()
        counts = histogram("%s/%d/ImageServer" % (ACI, year), box, WHO["CA"])
        pin = pin_class("%s/%d/ImageServer" % (ACI, year), lat, lon)
        source = "Agriculture and Agri-Food Canada (AAFC), Annual Crop Inventory %d, 30 m" % year
        licence = "Open Government Licence - Canada"
    else:
        year, raster, raster_name = newest_cdl()
        lock = {"mosaicMethod": "esriMosaicLockRaster", "lockRasterIds": [raster]}
        counts = histogram(CDL, box, WHO["US"], lock)
        pin = pin_class(CDL, lat, lon, lock)
        source = "USDA NASS Cropland Data Layer %d (%s), through USDA's CroplandCROS image service" % (year, raster_name)
        licence = "public domain (USDA NASS)"
    cropland, noread = set(the_map["cropland"]), set(the_map["noread"])
    pixel_ha = (PIXEL_M * math.cos(math.radians(lat))) ** 2 / 1e4
    unknown = sorted(v for v in counts if str(v) not in names)
    if unknown:   # a class value the map's own list does not have: the list has changed, and no share can be trusted
        raise Fail("%s used a class Crophalo does not know (%s); its class list must be checked first" % (WHO[country], ", ".join(map(str, unknown[:5]))))
    farm = sum(c for v, c in counts.items() if v in cropland)
    every = sum(counts.values())
    if not every:
        raise Fail("%s has no reading for this place" % WHO[country], final=True)
    read = every - sum(c for v, c in counts.items() if v in noread)
    share = lambda c: round(c / farm, 4) if farm else 0.0
    ha = lambda c: round(c * pixel_ha, 1)
    crops = {}
    for code, (name, ids) in the_map["own"].items():
        c = counts.get(int(code), 0)
        if c:
            for crop in ids:
                crops[crop] = crops.get(crop, 0) + c   # a double-crop class counts for both crops of the year
    wider = [{"code": int(code), "name": names[code], "crops": ids, "share": share(counts[int(code)]), "ha": ha(counts[int(code)])}
             for code, (name, ids) in the_map["wider"].items() if counts.get(int(code))]
    kind_of = lambda v: "own" if str(v) in the_map["own"] else "wider" if str(v) in the_map["wider"] else "other"
    crops_of = lambda v: (the_map["own"].get(str(v)) or the_map["wider"].get(str(v)) or [None, []])[1]
    garden = the_map.get("garden", {})   # a crop that stays for years (orchards, vineyards, cane): read only at the pin, never a share
    def pin_of(v):
        if v is None or str(v) not in names:
            return None
        out = {"code": v, "name": names[str(v)]}
        if str(v) in garden:
            out.update(kind="garden", crops=garden[str(v)][1])   # the standing-crop entries of js/crops.js GARDENS that hold it
        return out
    out = {
        "source": source, "data_date": str(year),
        "data_date_note": "One map a year, made after each harvest from satellite images; %d is the newest year it has published" % year,
        "units": "share: part of the farmland in the box (0 to 1), from the map's own pixel counts; ha: hectares on the ground (one 30 m pixel of the map's Web Mercator grid is %.4f ha here)" % pixel_ha,
        "year": year, "country": country, "box": box, "half_deg": HALF, "pixel_ha": round(pixel_ha, 4),
        "box_ha": ha(every), "cropland_ha": ha(farm), "cropland_share_of_box": round(farm / every, 4),
        "not_read_share": round(1 - read / every, 4),
        "crops": sorted(({"crop": k, "share": share(c), "ha": ha(c)} for k, c in crops.items()), key=lambda x: (-x["share"], x["crop"])),
        "wider": sorted(wider, key=lambda x: -x["share"]),
        "classes": sorted(({"code": v, "name": names[str(v)], "kind": kind_of(v), "crops": crops_of(v), "share": share(c), "ha": ha(c)} for v, c in counts.items() if v in cropland), key=lambda x: (-x["share"], x["code"])),
        "pin": pin_of(pin),
        "licence": licence,
    }
    return out


if __name__ == "__main__":
    common.run(main, LIMIT_S, slow="The crop map took too long to answer; try again in a minute")
