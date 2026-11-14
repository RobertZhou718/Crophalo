# Web Soil Survey (WSS) and its Soil Data Access web services

First check on 2026-11-14, about 18:37 to 19:00 UTC; second check about 19:09-19:20 UTC. No key, no login.
Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read in documentation on 2026-11-14; **I think** = not verified on 2026-11-14.

Back to the [overview](README.md).

## What it is

Web Soil Survey is USDA NRCS's interactive website for the official US soil survey: draw an area, see the soil map and its tables and ratings. It has no API of its own.
Its machine-readable side is **Soil Data Access (SDA)**: an SQL query service, OGC map and feature services, and per-survey-area download files, all open with no key.

## Routes

Hosts: `sdmdataaccess.sc.egov.usda.gov` and `sdmdataaccess.nrcs.usda.gov` (same service, both checked). Test places: Ames, Iowa (42.03, -93.62) and Barrie, Ontario (44.40, -79.78).

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| SDA query service `POST https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest` (JSON body `{"query": SQL, "format": "JSON+COLUMNNAME"}`) | Any read-only SQL over the soil database, as JSON, XML or text; at most 100,000 rows (read) | none | SQL with `SDA_Get_Mukey_from_intersection_with_WktWgs84('point(-93.62 42.03)')` joined to mapunit, legend, sacatalog, component, chorizon (the full SQL text was not kept; the second check rebuilt the same joins) | **First three calls hung: 0 bytes after 60 s, 60 s and 45 s (about 18:38 to 18:42 UTC, both host names).** About a quarter of an hour later the same route answered: 200, 0.44 s, 495 B: Clarion loam, IA169 version 38 (2026-09-08), top layer OM 3.5 %, pH 6.2, sand 45 / silt 34 / clay 21. **checked** | 200 on the first try, 7.4 s, 455 B (no hang). Same answer (Clarion 85 %, OM 3.5, pH 6.2, 45/34/21; Storden 10 %) | **no**: `point(-79.78 44.40)` gave `{}` in 0.23 s, checked | soil name, texture, organic matter, pH, drainage under the pin |
| Same service, map-unit summary table `muaggatt` | Drainage class, hydrologic group, land capability class, water storage to 1 m, slope, flooding, water table | none | `SELECT ... FROM muaggatt WHERE mukey='2765537'` | 200, 0.22 s, 251 B: well drained, group B, capability class 2, 18.64 cm water in the top metre, slope 3.5 %, no flooding. **checked** | 200, 0.5 s, 251 B. Same | no | "how well does this soil hold water and drain" in one row |
| Same service, ratings table `cointerp` | Soil ratings, including the National Commodity Crop Productivity Index (NCCPI) | none | `SELECT ... FROM component c JOIN cointerp i ... WHERE c.mukey='2765537' AND (i.mrulename LIKE 'NCCPI%' ...)` | 200, 0.35 s, 287 B: NCCPI 0.795 "Moderately high inherent productivity". **checked** | 200, 0.2 s, 0.795 (199 B with a shorter LIKE). Same | no | a 0 to 1 "how productive is this soil for row crops" figure |
| Same service, crop yield table `cocropyld` | Survey crop yields per soil component, where the survey has them | none | `SELECT ... FROM component c JOIN cocropyld y ... WHERE c.mukey='2765537'` | 200, 0.30 s, `{}`: **empty for this Iowa map unit**. checked. Not a reliable field | 200, `{}`. Same | no | not dependable |
| Same address, other post.rest services: persistent Area of Interest (`SERVICE=aoi`), Interpretation and Report services | Create an area from GeoJSON or a shapefile, then run WSS ratings and reports on it; the area is kept at least 24 hours (read) | none | not tried (they create a stored object on the server; the check was read-only) | **read** in `WebServiceHelp.aspx` | not tried | no | WSS-style suitability ratings for the drawn field |
| SOAP service `https://sdmdataaccess.sc.egov.usda.gov/Tabular/SDMTabularService.asmx` | Same queries through SOAP (`RunQuery`) | none | `GET` of the service page | 200, 0.27 s, 3.4 kB HTML page, **checked** (no query run) | 200, 3,446 B. Same | no | nothing extra over post.rest |
| WMS `https://sdmdataaccess.sc.egov.usda.gov/Spatial/SDM.wms` (WMS 1.1.1) | Soil map pictures; layers `mapunitpoly`, `mapunitline`, `mapunitpoint`, `...extended`, `...thematic`, `surveyareapoly`, `surveyareapolytransparent`, `surveyareapolyoutline`, `featline`, `featpoint`, `aoi...`; EPSG:4326 and EPSG:3857 | none | `?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities`; `GetMap` `LAYERS=mapunitpoly&SRS=EPSG:4326&BBOX=-93.63,42.025,-93.61,42.035&WIDTH=400&HEIGHT=200&FORMAT=image/png` | Capabilities 200, 0.30 s, 21 kB; GetMap 200, 1.4 s, 36 kB PNG. **checked** | Capabilities 200 but **11.9 s**; GetMap 200, 1.7 s, 36,272 B | no | the soil boundaries drawn over the field |
| WMS GetFeatureInfo on the same address | The map unit under a pixel as text: areasymbol, musym, mukey, acres | none | `REQUEST=GetFeatureInfo&LAYERS=mapunitpoly&QUERY_LAYERS=mapunitpoly&SRS=EPSG:4326&BBOX=-93.621,42.029,-93.619,42.031&WIDTH=101&HEIGHT=101&X=50&Y=50&INFO_FORMAT=text/plain` | 200, **0.41 s**, 271 B: IA169, L138B, mukey 2765537. **checked**. It answered within minutes of the SQL service hanging, and is the fastest way to get the mukey | 200, 0.65 s, 271 B, mukey 2765537. Same | no | a quick "which soil unit is this" lookup |
| WFS `https://sdmdataaccess.sc.egov.usda.gov/Spatial/SDMWGS84Geographic.wfs` (WFS 1.1.0, GML; also `SDMNAD83Geographic.wfs`, `SDMWM.wfs`) | Soil polygons as GML with areasymbol, musym, mukey, acres | none | `?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=mapunitpoly&BBOX=-93.621,42.029,-93.619,42.031&MAXFEATURES=2` | 200 but **49.3 s**, 6 kB, two polygons (L55 mukey 2800480, L138B mukey 2765537). **checked**. Barrie box: 200, 0.75 s, empty collection | 200 in **1.1 s**, 6,041 B | **no** (checked) | soil outlines inside the field (too slow in the first check to rely on) |
| Survey-area download files `https://websoilsurvey.sc.egov.usda.gov/DSD/Download/Cache/SSA/wss_SSA_{AREA}_[{YYYY-MM-DD}].zip` | The whole survey area: shapefiles plus all tables as text | none | `GET .../wss_SSA_IA169_%5B2026-09-08%5D.zip` (the date is the survey's `saverest` date) | 200, 45.5 s, **41.6 MB**, starts with `PK` (zip). **checked**. HEAD answers 405; **the server ignores Range headers and sends the whole file** (a 512-byte range request received all 41.6 MB; the file was deleted at once) | headers only (the transfer was stopped before the body): 200, Content-Length 41,558,863 | no | offline copy of one county's soils (server-side only) |
| WSS website `https://websoilsurvey.nrcs.usda.gov/app/` | The interactive site | none | `GET https://websoilsurvey.nrcs.usda.gov/app/` | 200, 0.3 s, 58 kB. **checked**. No API. The home page links a "WSS URL query parameters" help page on nrcs.usda.gov (deep links); nrcs.usda.gov could not be opened, so the parameters are **not confirmed** | not repeated | no | "open your field in Web Soil Survey" link |
| Official Soil Series Descriptions `https://soilseries.sc.egov.usda.gov/OSD_Docs/{first letter}/{SERIES}.html` | The plain-text description of a named soil series | none | `HEAD https://soilseries.sc.egov.usda.gov/OSD_Docs/C/CLARION.html` | 200, 0.42 s, 11 kB. **checked** (headers only) | HEAD 200, 11,172 B. Same | no | "read about your soil" link from the soil name |
| NRCS ArcGIS server `https://nrcsgeoservices.sc.egov.usda.gov/arcgis/rest/services` | not known | - | `HEAD ...?f=json` | **connection refused** (curl error 7, 0.14 s). checked. Whether this host still exists is **not confirmed** | connection refused (curl 7). Same | - | - |
| NRCS main site `https://www.nrcs.usda.gov/` (help, citation, gSSURGO pages) | Documentation | none | `GET` of the citation and help pages | HTTP/2 error, then a timeout; a second fetch also timed out | same failure: HTTP/2 INTERNAL_ERROR in 0.24 s; with HTTP/1.1 a 60 s timeout, 0 bytes. `nrcs.usda.gov` gives 302 to www, then the same error | - | - |
| Geospatial Data Gateway `https://datagateway.nrcs.usda.gov/` | Order-based bulk downloads (web forms, no API found) | none to browse | `GET https://datagateway.nrcs.usda.gov/` | 200, 1.6 s, redirects to `https://gdg.sc.egov.usda.gov/index.html`. **checked** | not repeated | no | none for a live app |
| NASA routes (CMR, GIBS, AppEEARS, Giovanni, Data Rods) | - | - | see [ssurgo-statsgo2.md](ssurgo-statsgo2.md) | no NASA copy of the soil survey found | - | - | - |

## Where the second check differed

- SDA SQL point query: 200 on the first try, 7.4 s, 455 B (no hang). The middle parts of the first check's query were not kept, so the second check rebuilt the joins (mapunit, legend, sacatalog, component, chorizon); same answer (Clarion 85 %, OM 3.5, pH 6.2, 45/34/21; Storden 10 %).
- SDA WFS GetFeature: 200 in 1.1 s, 6,041 B (first check: 49 s).
- SDA WMS capabilities: 200 but 11.9 s (first check 0.3 s).
- Zip file: headers only; SSA IA169 Content-Length 41,558,863.
- www.nrcs.usda.gov: same failure (HTTP/2 INTERNAL_ERROR in 0.24 s; with HTTP/1.1 a 60 s timeout, 0 bytes).

## Terms

- **Not read**: the citation and terms pages live on `www.nrcs.usda.gov`, which refused the test machine (HTTP/2 error, then a timeout; a second fetch also timed out). The old `/app/Help/Citation.htm` is commented out on the WSS home page and answers 404.
- **I think** (standard NRCS wording, not read): US Government work, free to use and redistribute; credit "Soil Survey Staff, Natural Resources Conservation Service, United States Department of Agriculture. Web Soil Survey / Soil Survey Geographic (SSURGO) Database. Available online. Accessed [date]." To be confirmed on `https://www.nrcs.usda.gov/resources/data-and-reports/web-soil-survey#citation`.
- Free public site: yes (I think). Business: yes (I think).
- Limits (**read** in `https://sdmdataaccess.sc.egov.usda.gov/WebServiceHelp.aspx` and `Help.aspx`): at most 100,000 rows per query; the service can answer "Your immediate query timed out" or "Memory limit"; WMS/WFS volume is limited by the size of the box; **the site and services are unavailable each night from about 12:00 AM to 2:00 AM Mountain time** while data are refreshed. No requests-per-minute figure is published.
- The SDA pages carry a standard USDA "government computer system" text in their script (read); no key or account is asked for.

## Problems

- **The SQL service hung three times in a row** in the first check (60 s, 60 s, 45 s, zero bytes) on both host names, then worked normally (0.2 to 3.6 s) about a quarter of an hour later. The WMS and its GetFeatureInfo answered normally a few minutes after the last hang, before the SQL service was seen working again. In the second check it answered first time (7.4 s).
- The WFS GetFeature for a 200 m box took **49 s** in the first check (1.1 s in the second).
- The WMS capabilities took 11.9 s in the second check (0.30 s in the first).
- The zip download server ignores Range requests (whole file is sent).
- `www.nrcs.usda.gov` (help, citation, gSSURGO pages) could not be read, in both checks.
- `nrcsgeoservices.sc.egov.usda.gov` refused the connection, in both checks.
- Old WSS help pages (`/app/Help/Citation.htm`, `KnownProblems.htm`, `FrequentlyAskedQuestions.htm`, `MaintenanceSchedule.htm`) answer 404; the home page now points to nrcs.usda.gov instead.

## Recommendation

Keep `POST .../Tabular/post.rest` as the main route (it is what Crophalo already uses), keep the cache, and add the WMS GetFeatureInfo call (0.4 s) as a fallback that at least names the soil map unit when the SQL service hangs. Show the farmer: soil name, texture, organic matter, pH, drainage, plus two new plain figures from the same service: the crop productivity index (NCCPI) and water held in the top metre.

## How Crophalo uses it

- Crophalo already uses it: one SQL query to `Tabular/post.rest` (45 s limit, 2 tries, cached 30 days) gets the dominant soil component and its top layer. "USDA Web Soil Survey" is also a plain link in Crophalo's parcel look-up list.
- Not used yet: `muaggatt`, NCCPI, the WMS/WFS, GetFeatureInfo, the download files, the nightly maintenance window.
