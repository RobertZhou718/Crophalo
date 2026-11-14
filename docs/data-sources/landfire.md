# USFS / DOI LANDFIRE

First check on 2026-11-14; second check about 18:55-19:10 UTC (about 2 s between calls, 60 s limit, one allowed repeat called "try 2"). No key, no login. Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read on 2026-11-14; **I think** = not confirmed.

Back to the [overview](README.md).

## What it is

LANDFIRE is the US Forest Service and Interior Department's 30 m map set for wildfire planning: existing vegetation type, cover and height, fuel models, canopy, disturbance (fire, harvest, insects) by year, fire regime, plus elevation, slope and aspect.
It covers all US states and territories; the newest version is LF 2025. It is made for fire and wildland managers, not for cropland.

## Routes

Test places: a field corner near Ames, Iowa (-93.64, 42.005) and Barrie, Ontario (44.40, -79.78).

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| LFPS API health `https://lfps.usgs.gov/api/healthCheck` | Up/down | none | `GET https://lfps.usgs.gov/api/healthCheck` | 200, 0.3 s: `{"message":"The service is up","success":true}` — checked | 200, 0.4 s, "The service is up" | n/a | — |
| LFPS API products `https://lfps.usgs.gov/api/products` | The list of all layers (name, theme, version, regions) | none | `GET https://lfps.usgs.gov/api/products` | 200, 0.35 s, 26 kB: 139 products; versions LF2001, 2008, 2010, 2012, 2014, 2016, 2020, 2022, 2023, 2024, LF2025, daily_fuels; themes Vegetation, Fuels, Disturbance, Fire Regime, Topographic, Seasonal Fuels, Daily Fuels, Transportation, Map Zones — checked | 200, 1.0 s, 26,299 b: 139 products; same 12 versions; 9 themes | n/a | — |
| LFPS API job `https://lfps.usgs.gov/api/job/submit` (+ `/api/job/status?JobId=`, `/api/job/cancel`, `/api/upload/shapefile`); docs at `https://lfps.usgs.gov/docs/api` (OpenAPI 3, "LFPS API 1.0") | Queued clip job: a multi-band GeoTIFF of chosen layers for a box, link returned by status | No key, but an email address is REQUIRED on every job (`Email` parameter); optional 6-digit `Priority_Code` | `GET https://lfps.usgs.gov/api/job/submit?Layer_List=LF2025_EVT&Area_of_Interest=-93.642 42.004 -93.638 42.006` (deliberately without Email) | 400, 0.5 s: `{"message":[{"parameter":"Email","message":"Required"}],"success":false}` — checked. No job was submitted | not repeated | no | Not suited to a live page (queued, tied to an email address) |
| Old LFPS geoprocessing service `https://lfps.usgs.gov/arcgis/rest/services/LandfireProductService/GPServer` (and `LandfireProductServiceBeta`) | Same job as an ArcGIS asynchronous task | none seen | `GET ...GPServer?f=json` | 200, 0.2 s: task LandfireProductService, asynchronous — checked (info only; no job submitted) | 200, 5.2 s, 495 b: task LandfireProductService, esriExecutionTypeAsynchronous. No job submitted | no | — |
| LANDFIRE image services `https://lfps.usgs.gov/arcgis/rest/services` (ArcGIS 11.1; folders Landfire_LF2016, LF2020, LF2022, LF2023, LF2024, LF2025, LF2025_Seasonal_Fuels_2026, Landfire_Disturbance, Landfire_Topo, RCMAP, Landsat; map services Landfire_map_zones, Landfire_geo_areas, Landfire_outline) | Service list | none | `GET https://lfps.usgs.gov/arcgis/rest/services?f=json` and `.../Landfire_LF2025?f=json` | 200, 0.2 s — checked | not repeated | — | — |
| ...ImageServer `/identify` on a layer, e.g. `Landfire_LF2025/LF2025_EVT_CONUS` | The class number at a point | none | `GET .../Landfire_LF2025/LF2025_EVT_CONUS/ImageServer/identify?geometry={"x":-93.64,"y":42.005,"spatialReference":{"wkid":4326}}&geometryType=esriGeometryPoint&returnGeometry=false&f=json` | 200, 0.3 s: `"value":"7299"` — checked. No raster attribute table (`hasRasterAttributeTable: false`), so the name of class 7299 must come from LANDFIRE's own tables | 200, 0.4 s, value "7299" | no | Vegetation type code at the field corner |
| ...ImageServer `/identify` on `Landfire_Topo/LF2020_SlpD_CONUS` (also Asp, Elev, SlpP; CONUS, AK, HI, PRVI) | Slope in degrees (and aspect, elevation) at 30 m | none | same call on `.../Landfire_Topo/LF2020_SlpD_CONUS/ImageServer/identify` | 200, 0.2 s: `"value":"3"` — checked | 200, 0.3 s, value "3" | no | Slope and facing of the field |
| LANDFIRE WMS `https://edcintl.cr.usgs.gov/geoserver/landfire/conus_2025/ows` (also conus_2024, 2023, 2022, 2020, 2016, conus_topo; Alaska, Hawaii, PR sets listed on the page — read) | Map pictures and point lookups for 14 layers: EVT, EVC, EVH, FBFM13, FBFM40, CBD, CBH, CC, CH, FCCS, FDist, FVT, FVC, FVH | none ("Fees NONE, AccessConstraints NONE") | `GET ...conus_2025/ows?service=WMS&request=GetCapabilities` | 200, 1.7 s, 247 kB, 14 layers — checked | works-slow. 200, **13.0 s**, 246,887 b, 14 layers, Fees NONE | no | — |
| ...WMS GetFeatureInfo | Class numbers for several layers at a point | none | `GET ...conus_2025/ows?service=WMS&version=1.1.1&request=GetFeatureInfo&layers=LF2025_EVT_CONUS,LF2025_EVH_CONUS,LF2025_EVC_CONUS&query_layers=(same)&srs=EPSG:4326&bbox=-93.6405,42.0045,-93.6395,42.0055&width=3&height=3&x=1&y=1&info_format=application/json&feature_count=5` | 200 but 17.1 s (three layers at once): GRAY_INDEX 7296, 22, 22 — checked (works-slow). Barrie single layer: 200, 0.8 s, `-9999` (no data) — checked | 3-layer lookup 200, 17.6 s: 7296, 22, 22. Barrie 200, 0.6 s, -9999 | no (checked) | Vegetation type, cover and height around the field |
| ...WMS GetMap | Coloured map picture | none | `GET ...request=GetMap&layers=LF2025_EVT_CONUS&srs=EPSG:4326&bbox=-93.66,42.00,-93.58,42.06&width=400&height=300&format=image/png&transparent=true` | 200, 1.8 s, 49 kB PNG — checked | 200, 2.5 s, 48,863 b PNG | no | Map layer |
| LANDFIRE WCS `https://edcintl.cr.usgs.gov/geoserver/landfire_wcs/conus_2025/wcs` (also 2024, 2023, 2022, 2016, conus_topo) | Raw class numbers for a box as GeoTIFF | none | `GET ...wcs?service=WCS&version=1.0.0&request=GetCoverage&coverage=LF2025_EVT_CONUS&crs=EPSG:4326&bbox=-93.642,42.004,-93.638,42.006&width=11&height=7&format=GeoTIFF` | 200, 0.3 s, 916 b TIFF; values 7296, 7297, 7299, 7905, 7908, 7974, 7977, 9817 (I think: developed and agricultural classes; names not looked up) — checked. GetCapabilities: 200, 10 s, 647 kB | 200, 0.4 s, 916 b GeoTIFF 16-bit: values 7296, 7297, 7299, 7905, 7908, 7974, 7977, 9817. GetCapabilities not called again | no | Mix of vegetation types on and around the field |
| Topographic WMS `https://edcintl.cr.usgs.gov/geoserver/landfire/conus_topo/ows` | Layers LF2020_Asp_CONUS, LF2020_Elev_CONUS, LF2020_SlpD_CONUS, LF2020_SlpP_CONUS | none | `GET ...conus_topo/ows?service=WMS&request=GetCapabilities` | 200, 0.7 s, 231 kB — checked | 200, 1.3 s, 230,888 b: LF2020 Asp, Elev, SlpD, SlpP | no | Slope/aspect map |
| Older WMS naming `https://edcintl.cr.usgs.gov/geoserver/landfire/us_230/ows` | — | — | `GET ...us_230/ows?service=WMS&request=GetCapabilities` | 404 `"No endpoint GET /geoserver/landfire/us_230/ows."` — checked. RETIRED naming (now conus_<year>) | broken. 404 "No endpoint GET /geoserver/landfire/us_230/ows." on both tries (0.2 s). The current documented name (conus_2025) answers, so the service is up and only the old name is gone | — | — |
| Full-extent downloads `https://landfire.gov/data/FullExtentDownloads` → `https://landfire.gov/data-downloads/<folder>/<layer>.zip` | Whole-region zips | none | `GET https://landfire.gov/data/FullExtentDownloads` | 200, 0.5 s, 73 kB; zip links such as `/data-downloads/AK_Disturbance/LF2025_Dist25_AK.zip` — checked (page only, nothing downloaded) | 200, 1.0 s, 73,239 b page. Zip links not re-read (sample trimmed to the page head) | no | Offline only |
| Map zones lookup `https://lfps.usgs.gov/arcgis/rest/services/Landfire_map_zones/MapServer/0/query` | Which LANDFIRE zone a point is in | none | not tried | read (used by the LFPS page) | not tried | no | — |
| Microsoft Planetary Computer | — | — | collections list | 200; no landfire collection — checked | not repeated | — | — |
| Google Earth Engine (`LANDFIRE/...`) | Image collections | Google account + project | not tried | not tried | not tried | no | — |
| NASA CMR / AppEEARS / GIBS / Giovanni; AWS open data | — | — | not tried | not confirmed; I think none | not tried | — | — |

## Where the second check differed

- WMS GetCapabilities took 13.0 s (first check 1.7 s); the old GPServer info took 5.2 s (first check 0.2 s). Results equal.
- Small addition: LFPS themes also include Transportation and Map Zones (9 themes, 12 versions).
- Everything else matched. No key, login or sign-up was asked for. Barrie: LANDFIRE -9999.

## Terms

- Produced by USDA Forest Service and US Department of the Interior (USGS hosts the services). USGS policy page (`https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits`, read): US Public Domain, credit asked. A LANDFIRE-specific licence page was not found (not confirmed); GeoServer capabilities say Fees NONE / AccessConstraints NONE (checked).
- A free public site may use it: yes. A business may: yes (public domain) — I think; no LANDFIRE page read says otherwise.
- Credit (LANDFIRE FAQ `https://landfire.gov/faqs`, read): cite as "LANDFIRE. (<last update>). <Data product>. U.S. Department of Agriculture, Forest Service; U.S. Department of the Interior. Available: https://www.landfire.gov [<access date>]" (their model form).
- FAQ caution (read): LANDFIRE is not meant to replace local data.
- Rate limits: none published. LFPS says it is down for patching the last Wednesday of every month, 8 am-12 pm Central (read). Jobs are queued.

## Problems

- No Canada: Barrie returns -9999.
- LFPS (the "API" named on the challenge list) needs an email address for every job and is queued: it cannot feed a live page and would mean sending a person's email address. Refusal without an email address recorded (400).
- WMS GetFeatureInfo on three layers took 17 s (17.6 s in the second check); WCS capabilities took 10 s and is 647 kB; WMS capabilities took 13.0 s in the second check. The image-service identify (0.2-0.4 s) and single-layer WCS (0.3-0.4 s) were fast.
- Answers are bare class numbers (7299, 22...): Crophalo must ship LANDFIRE's class tables to name them.
- Old service names (`us_230` etc.) are gone (404); current names are `conus_<year>`.
- The newest topographic layers are still LF2020.
- For cropland the vegetation classes are coarse (row crop / close-grown crop / pasture / developed); it adds little over CDL or NLCD on a farm field.

## Recommendation

If used at all, use the keyless image services on lfps.usgs.gov (`identify`, or a one-layer WCS box) for LF2025 vegetation height/cover and the yearly disturbance layers; skip the LFPS job API.
Show the US farmer the height and cover of woods and shelterbelts beside the field and any mapped fire or clearing year nearby — a low-priority extra; nothing for Ontario.

## How Crophalo uses it

Crophalo does not use it yet. Tree heights come from the Meta/WRI 1 m canopy map and terrain from 3DEP and other height sources; land cover from ESA WorldCover. LANDFIRE would add US fuel, vegetation-height and disturbance-year layers.
