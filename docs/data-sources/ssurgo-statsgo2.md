# USDA NRCS SSURGO and STATSGO2 (and the gridded gSSURGO / gNATSGO)

First check on 2026-11-14, about 18:37 to 19:00 UTC; second check about 19:09-19:20 UTC. No key, no login.
Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read in documentation on 2026-11-14; **I think** = not verified on 2026-11-14.

Back to the [overview](README.md).

## What it is

SSURGO is the detailed US soil survey (field-scale polygons with tables of soil properties and ratings); STATSGO2 is the coarse general soil map (about 1:250,000) of the whole US.
gSSURGO and gNATSGO are the same data as national 30 m (and 10 m) grids of map-unit keys plus ready-made summary layers (crop productivity index, water storage, organic carbon).

## Routes

Test places: Ames, Iowa (42.03, -93.62) and Barrie, Ontario (44.40, -79.78).

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| Soil Data Access SQL, SSURGO: `POST https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest` | Any SSURGO table by SQL (mapunit, component, chorizon, muaggatt, cointerp...) | none | `SELECT TOP 2 ... FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('point(-93.62 42.03)') k JOIN mapunit ... JOIN chorizon h ON ... h.hzdept_r=0` (the full SQL text was not kept; the second check rebuilt the joins) | Hung three times first (0 bytes after 60, 60, 45 s), then 200, 0.44 s, 495 B (Clarion loam, OM 3.5 %, pH 6.2, 45/34/21 sand/silt/clay). **checked** | 200 on the first try, 7.4 s, 455 B. Same answer (Clarion 85 %, OM 3.5, pH 6.2, 45/34/21; Storden 10 %) | **no**: `{}` at 44.40, -79.78 (checked) | soil texture, organic matter, pH, drainage at the pin |
| Soil Data Access SQL, STATSGO2: same address, table `gsmmupolygon` | The general soil map unit at a point (legend `areasymbol = 'US'`) | none | `SELECT TOP 3 g.mukey, mu.musym, mu.muname, l.areasymbol, l.areaname FROM gsmmupolygon g JOIN mapunit mu ON mu.mukey=g.mukey JOIN legend l ON l.lkey=mu.lkey WHERE g.mupolygongeo.STIntersects(geometry::STGeomFromText('POINT(-93.62 42.03)',4326))=1` | 200, **3.6 s**, 230 B: mukey 667247 "Webster-Nicollet-Clarion-Canisteo (s1750)", areasymbol US. **checked** | 200, 4.3 s, 230 B (mukey 667247; the row comes back twice) | no (US only; not tried at Barrie) | a back-up soil where SSURGO has a gap (water, unsurveyed land) |
| SDA WMS `https://sdmdataaccess.sc.egov.usda.gov/Spatial/SDM.wms` and WFS `.../Spatial/SDMWGS84Geographic.wfs` | SSURGO polygons as pictures (WMS) or GML (WFS); GetFeatureInfo gives the mukey as text | none | see [web-soil-survey.md](web-soil-survey.md) for the exact requests | WMS GetMap 200, 1.4 s; GetFeatureInfo 200, 0.41 s; WFS GetFeature 200 but 49 s. **checked**. No STATSGO2 layer is listed in either capabilities document (checked) | GetMap 200, 1.7 s; GetFeatureInfo 200, 0.65 s; WFS GetFeature 200 in 1.1 s; WMS capabilities 11.9 s | no | soil boundaries on the map |
| STATSGO2 download files `https://websoilsurvey.sc.egov.usda.gov/DSD/Download/Cache/STATSGO2/wss_gsmsoil_{ST or US}_[2016-10-13].zip` | STATSGO2 shapefile and tables for a state or the US | none | `GET .../wss_gsmsoil_IA_%5B2016-10-13%5D.zip` and `.../wss_gsmsoil_US_%5B2016-10-13%5D.zip` | Iowa: 200, 19.6 s, **10.7 MB**, zip. US: 200, zip header seen, transfer cut by the 60 s limit (size **not confirmed**). **checked**. Range ignored: the whole file is sent; copies deleted | headers only: Iowa 10,664,493 bytes; US **445,366,221 bytes** (the size the first check could not confirm) | no | offline back-up soil map (server-side only) |
| SSURGO download files `.../DSD/Download/Cache/SSA/wss_SSA_{AREA}_[{date}].zip` | One survey area, shapefiles and tables | none | `GET .../wss_SSA_IA169_%5B2026-09-08%5D.zip` | 200, 45.5 s, 41.6 MB. **checked** | headers only: 200, Content-Length 41,558,863 | no | offline county copy |
| Microsoft Planetary Computer STAC, collection `gnatsgo-rasters` (and `gnatsgo-tables`) `https://planetarycomputer.microsoft.com/api/stac/v1` | 30 m tiles of map-unit key plus about 58 ready layers (`nccpi3corn`, `nccpi3soy`, `nccpi3all`, `rootznaws`, `droughty`, `soc0_30`, `aws0_100`...); tables as Parquet | none for the catalogue | `GET .../collections/gnatsgo-rasters`; `POST .../search` body `{"collections":["gnatsgo-rasters"],"intersects":{"type":"Point","coordinates":[-93.62,42.03]},"limit":1}` | 200, 0.9 s and 0.5 s; one tile `conus_101445_2236065_265285_2072225`. **checked**. Date in the catalogue: **2020-07-01** (a July 2020 snapshot, older than SDA). Licence field: CC0-1.0 | gnatsgo-rasters 200 (CC0-1.0), gnatsgo-tables 200, search 200 (same tile). Same | **no** (boxes are US states and territories; CONUS box ends at 51.6 N but holds US data only, I think) | - |
| Planetary Computer point reader `https://planetarycomputer.microsoft.com/api/data/v1/item/point/{lon},{lat}` | Pixel values of chosen layers at a point, as JSON, with no raster library | none | `GET .../item/point/-93.62,42.03?collection=gnatsgo-rasters&item=conus_101445_2236065_265285_2072225&assets=mukey&assets=nccpi3corn&assets=nccpi3soy&assets=rootznaws&assets=droughty&assets=soc0_30` | 200, **2.1 s**, 205 B: mukey 2765537 (same unit as SDA), corn index 0.787, soybean index 0.813, root-zone water 277 mm, droughty 0, organic carbon 6,983 (g/m2, I think). **checked** | 200, 2.8 s, 205 B, identical values | no | per-crop soil productivity (corn, soybean, small grains, cotton) in one fast call |
| Planetary Computer raw tile on Azure `https://soils.blob.core.windows.net/gnatsgo/july2020/tiles/.../*.tif` | The GeoTIFF itself | needs a signed address (free signing endpoint, no account for light use: read; not tried) | `GET` of the mukey tile with `Range: bytes=0-255`, unsigned | **409**, 0.5 s. checked | not repeated | no | - |
| UC Davis SoilWeb grids (the service behind the R package soilDB) `https://casoilresource.lawr.ucdavis.edu/cgi-bin/mapserv?map=mukey-wcs` (WCS 2.0.1) | 30 m map-unit key grids `gnatsgo`, `gssurgo`, `fssurgo` (SSURGO with STATSGO2 filling gaps), vintage "FY2027" per its own list, EPSG:5070, small GeoTIFF | none | `...&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=gssurgo&FORMAT=image/tiff&SUBSETTINGCRS=EPSG:5070&FORMAT=GEOTIFF_FLOAT&SUBSET=x(195660,195720)&SUBSET=y(2116690,2116750)&RESOLUTION=x(30)&RESOLUTION=y(30)` | 200, **0.49 s**, 438 B TIFF, values 2765537 and 2800480 (same keys as SDA). **checked**. List of grids: `https://casoilresource.lawr.ucdavis.edu/wcs/mukey-grids.json` 200, 3.6 kB | WCS 200, 0.8 s, 438 B TIFF; mukey-grids.json 200, 3,625 B (vintage FY2027). Same | no | which soil units lie inside the field, fast |
| UC Davis ISSR-800 property grids `...mapserv?map=issr800-wcs` (WCS 2.0.1) | 46 ready soil layers on an 800 m grid from SSURGO + STATSGO2: pH, clay/sand/silt at several depths, organic matter, EC, CEC, plant-available water, drainage class, hydrologic group, land capability class (irrigated and not), wind erodibility | none | `...&REQUEST=GetCoverage&COVERAGEID=ph_025cm&FORMAT=image/tiff&SUBSETTINGCRS=EPSG:5070&FORMAT=GEOTIFF_FLOAT&SUBSET=x(194800,196400)&SUBSET=y(2116000,2117600)&RESOLUTION=x(800)&RESOLUTION=y(800)` | 200, **0.35 s**, 444 B TIFF, pH about 6.4 (top 25 cm). **checked**. List: `https://casoilresource.lawr.ucdavis.edu/wcs/issr800.json` 200, 10.9 kB | WCS 200, 1.3 s, 444 B; issr800.json 200, 10,882 B. Same | no | quick regional soil pH, texture, salt and water figures without SQL |
| UC Davis "reflector" page `https://casoilresource.lawr.ucdavis.edu/soil_web/reflector_api/soils.php?what=mapunit&lon=&lat=` | The map unit at a point, as an HTML table | none | `?what=mapunit&lon=-93.62&lat=42.03` | 200, 0.46 s, 590 B HTML: ia169, L138B, mukey 2765537. **checked** | 200, 590 B HTML table. Same | no | nothing the others do not give (HTML, not JSON) |
| UC Davis addresses that were guesses and do **not** work | - | - | `mapserv?map=/soilmap2/website/wcs/mukey.map&...GetCapabilities`; `api/soil-series.php?q=site&s=clarion` | 200 with "CGI variable map fails to validate"; 200 "invalid query". checked. These were guesses, not documented routes | not repeated | - | - |
| Esri Living Atlas `https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Soils_Map_Units/FeatureServer/0/query` | SSURGO map units with summary fields | **needs an ArcGIS token** | `?geometry=-93.62,42.03&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json` | 200 with `{"error":{"code":499,"message":"Token Required"}}`, 0.3 s. **checked**. Token comes from an ArcGIS account (`https://www.arcgis.com/`; free public account exists, terms and limits not read) | not repeated | no (I think) | - |
| gSSURGO / gNATSGO national file geodatabases (NRCS download, by state and CONUS) | Full grids and tables | not known | `GET https://www.nrcs.usda.gov/resources/data-and-reports/gridded-soil-survey-geographic-gssurgo-database` | **failed twice** (HTTP/2 INTERNAL_ERROR in 0.09 s, then timeout at 18 s); a second fetch also timed out. Download links (I think on Box) **not confirmed** | www.nrcs.usda.gov: HTTP/2 INTERNAL_ERROR in 0.24 s; with HTTP/1.1 a 60 s timeout, 0 bytes | no | bulk only |
| NASA Common Metadata Repository `https://cmr.earthdata.nasa.gov/search/collections.json` | Catalogue search | none | `?keyword=SSURGO&page_size=10`, `?keyword=STATSGO&page_size=10` | 200, 0.8 s and 2.2 s. **checked**. No NASA-held SSURGO/STATSGO2. Only pointers: `USGS_muid` "STATSGO soil characteristics for the conterminous United States" (CEOS_EXTRA record), `wygisc_ssurgo` (Wyoming), and ORNL products built on them (for example `West_Soil_Carbon_1238`) | SSURGO 200, 0.3 s, 14 kB (wygisc_ssurgo ...); STATSGO 200, 7.9 s, 110 kB (USGS_muid ...). Same | no | - |
| NASA GIBS / Worldview layer list `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml` | Map tile layers | none | `GET` of the capabilities (5.3 MB, 14.8 s) and a search of the 3,950 layer names for SSURGO, STATSGO, soil | **No soil-survey layer** (only soil-moisture layers from SMAP, AMSR, GLDAS, NLDAS). checked | not repeated | - | - |
| AppEEARS, Giovanni, Data Rods | - | - | not tried | SSURGO/STATSGO2 are not NASA products; none expected (I think) | not tried | - | - |
| Google Earth Engine (community copies of gSSURGO/gNATSGO) | - | Google account | not tried (needs an account) | **not confirmed** | not tried | - | - |

## Where the second check differed

- SDA SQL point query: 200 on the first try, 7.4 s, 455 B (no hang).
- STATSGO2 US zip: 445,366,221 bytes (the size the first check could not confirm). Iowa: 10,664,493.
- SDA WFS GetFeature 1.1 s (first check 49 s); WMS capabilities 11.9 s (first check 0.3 s).
- Everything else matched.

## Terms

- NRCS terms and citation: **not read** (nrcs.usda.gov unreachable from the test machine in both checks). **I think**: public domain US Government data; credit "Soil Survey Staff, Natural Resources Conservation Service, United States Department of Agriculture. Soil Survey Geographic (SSURGO) Database / U.S. General Soil Map (STATSGO2). Available online. Accessed [date]." Free public site: yes (I think). Business: yes (I think). To be confirmed on the NRCS page.
- Planetary Computer catalogue entry for gNATSGO states licence **CC0-1.0** (**read** in the STAC JSON). Planetary Computer's own terms of use and rate limits: not read.
- UC Davis SoilWeb services: terms and limits **not read** (no terms page found). They are a university server used by the soilDB package; treat as best-effort, cache hard, and ask before heavy use (I think).
- SDA limits (**read**): 100,000 rows per query; nightly outage about 12:00 AM to 2:00 AM Mountain time; no per-minute figure published.

## Problems

- The SDA SQL service hung three times (zero bytes after 60 s) before recovering in the first check; the STATSGO2 spatial query is slow even when healthy (3.6 s; 4.3 s in the second check).
- No STATSGO2 layer in the SDA WMS/WFS; STATSGO2 is reachable only through SQL (`gsmmupolygon`) or the zip files (dated 2016-10-13).
- The crop-yield table (`cocropyld`) was empty for the Iowa test unit: do not build on it.
- Planetary Computer's gNATSGO is a July 2020 snapshot; SDA and the UC Davis grids are current ("FY2027").
- Raw Planetary Computer tiles answer 409 without a signed address.
- The NRCS gSSURGO page and the NRCS ArcGIS host could not be reached; Esri's copy needs a token.
- Nothing here covers Ontario: every route returned empty or US-only at Barrie.

## Recommendation

Stay on Soil Data Access SQL for the soil itself, and add two fall-backs for when it hangs: the UC Davis grids (map-unit key at 30 m in 0.5 s, pH/texture at 800 m in 0.35 s) and STATSGO2 through `gsmmupolygon` where SSURGO has no data. Add the crop productivity index per crop (NCCPI corn, soybean, small grains: from SDA `cointerp`, or one Planetary Computer point call) so the farmer sees "this soil rates 0.79 out of 1 for corn" beside each rotation. Ontario keeps using Soil Landscapes of Canada.

## How Crophalo uses it

- Crophalo already uses SSURGO through one SDA SQL call: the dominant component and its top layer, cached 30 days. It is tried first for every point; an empty answer means the point is not in the US.
- Not used yet: STATSGO2, gSSURGO/gNATSGO, NCCPI, `muaggatt`, Planetary Computer, UC Davis grids, WMS/WFS.
