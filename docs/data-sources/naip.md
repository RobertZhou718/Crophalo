# National Agriculture Imagery Program (NAIP)

First check on 2026-11-14; second check about 18:55-19:10 UTC (about 2 s between calls, 60 s limit, one allowed repeat called "try 2"). No key, no login. Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read on 2026-11-14; **I think** = not confirmed.

Back to the [overview](README.md).

## What it is

NAIP is the USDA's summer ("leaf-on") aerial photography of US farmland: 4 bands (red, green, blue, near-infrared) at 30-60 cm, re-flown for each state every 2-3 years.
It shows a field far sharper than any free satellite, and its near-infrared band allows a greenness (NDVI) picture of the crop on the flight day. United States only.

## Routes

Test places: Ames, Iowa (42.03, -93.62) and Barrie, Ontario (44.40, -79.78).

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| USGS National Map image service `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer` (ArcGIS 11.3; functions NaturalColor, FalseColorComposite, NDVI_Color; max 4000x4000 px) | Service info JSON | none | `GET .../USGSNAIPImagery/ImageServer?f=json` | 200, 0.8 s, 7 kB; 4 bands, 0.3 m pixel, credit "USGS, USDA, The National Map: Orthoimagery. January 09, 2025." — checked | works-slow. 200, 9.2 s, 7,184 b: 4 bands, pixel 0.3 m, same credit | no | — |
| ...`/exportImage` | A picture of any box (jpg/png/tiff), true colour, false colour or NDVI | none | `GET .../exportImage?bbox=-93.624,42.028,-93.616,42.032&bboxSR=4326&imageSR=3857&size=400,280&format=jpg&f=image` | 200, 11.8 s, 40 kB, a sharp aerial of Ames — checked (works-slow). Same box at Barrie: 200, 12.9 s, 2.5 kB, all black — checked | Ames picture 200, 0.06 s, 39,870 b, 400x280 jpeg (same byte size as the first check; not opened). Barrie 200, 0.08 s, 2,467 b: opened, all black. The fast times are, I think, a cache hit of the first check's identical request, so they do not measure rendering | no (checked: black) | A sharp picture of the field and its hedges, lanes, wet spots |
| ...`/identify` | Pixel values plus the photo's catalogue record (flight date, year, resolution) | none | `GET .../identify?geometry={"x":-93.62,"y":42.03,"spatialReference":{"wkid":4326}}&geometryType=esriGeometryPoint&returnCatalogItems=true&f=json` | 200, value "79, 98, 77, 97"; item `m_4209360_sw_15_030_20230902`, State IA, Year 2023, resolution 0.3 m, `download_url` on EarthExplorer — checked. (A first try with `sr=4326` was read as metres and gave NoData: the point must carry its spatialReference.) | works-slow. 200, 18.2 s, 21 kB: pixel "79, 98, 77, 97", m_4209360_sw_15_030_20230902, IA, 2023, 0.3 m, download_url on EarthExplorer | no | "This photo was flown on 2 Sep 2023" |
| ...`/query` (catalogue) | Footprints and dates of tiles | none | `GET .../query?geometry=-93.62,42.03&geometryType=esriGeometryPoint&inSR=4326&...&outFields=*&f=json`; count at Barrie with returnCountOnly | 200 — checked. A count at Barrie took 27 s and returned 9 (overview tiles, not real photos): the count is NOT a coverage test | Count: try 1 (point sent as JSON) 200, 4.1 s, `{"count":223709}` (looks like the whole catalogue: the point was not applied); try 2 (`geometry=-79.78,44.40&inSR=4326`) timed out at 60 s. Same conclusion, different numbers | no | — |
| USGS NAIP WMS `https://imagery.nationalmap.gov/arcgis/services/USGSNAIPImagery/ImageServer/WMSServer` | OGC WMS (layers NaturalColor, FalseColorComposite, NDVI_Color, None) | none | `GET ...WMSServer?request=GetCapabilities&service=WMS` | 200, 13.7 s, 9.6 kB — checked (slow) | works-slow. 200, 33.4 s, 9,605 b, WMS 1.3.0. First 4 kB identical to the first check's copy | no | Map layer |
| USGS NAIP Plus `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer` | NAIP plus other high-resolution orthoimagery | none | `GET ...USGSNAIPPlus/ImageServer?f=json` | 200, 8.8 s, 7.6 kB; credit dated March 12, 2025 — checked (info only; no image asked) | works. 200, 0.4 s, 7,632 b, credit dated March 12, 2025. Info only | not confirmed (extent is world-wide on paper; I think US only) | Same as above |
| Old host `https://services.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/MapServer` | — | — | `GET ...?f=json` | Could not resolve host — checked. GONE | broken. Could not resolve host | — | — |
| USDA APFO server `https://gis.apfo.usda.gov/arcgis/rest/services/NAIP` | (state NAIP image services) | none (in the past) | `GET https://gis.apfo.usda.gov/arcgis/rest/services?f=json` and `.../NAIP?f=json` | Connection reset by peer on 3 tries — checked. BROKEN from the test machine (dead, moved or blocked: not confirmed which) | broken. Connection reset by peer on both, and on one more call to `.../NAIP/USDA_CONUS_PRIME/ImageServer?f=json` (a service name I think the USDA documented; not confirmed). Verbose: the name resolves to 165.221.60.126, TCP connects, reset straight after the TLS client hello. So it is the host refusing the connection, not a wrong path. Whether it refuses everyone is not confirmed | no | — |
| Microsoft Planetary Computer STAC, collection `naip` (`https://planetarycomputer.microsoft.com/api/stac/v1`) | Search by point/box/date: every flight since 2010 with date, resolution, COG link | none | `POST .../search` `{"collections":["naip"],"intersects":{"type":"Point","coordinates":[-93.62,42.03]},"limit":3,"sortby":[{"field":"datetime","direction":"desc"}]}` | 200, 0.4 s, 8.9 kB: flights of 2025-08-13 (0.6 m), 2023-09-02 (0.3 m), 2021-08-18 (0.6 m) — checked. Barrie: 200, 0 features — checked | works. Ames 200, 0.6 s, 8,869 b: first item ia_m_4209360_sw_15_060_20250813 (2025-08-13, 0.6 m), second ia_m_4209360_sw_15_030_20230902_20240104; third not read (sample trimmed). Barrie 200, 0.5 s, `"features":[]` | no (checked) | The list of past summers: "see your field in 2021, 2023, 2025" |
| Planetary Computer data API `https://planetarycomputer.microsoft.com/api/data/v1/item/...` (bbox crop, preview, tilejson, XYZ tiles) | A picture of a box or map tiles from one flight; band maths (NDVI) is offered — read, not tried | none | `GET .../item/bbox/-93.624,42.028,-93.616,42.032/400x280.png?collection=naip&item=ia_m_4209360_sw_15_060_20250813&assets=image&asset_bidx=image\|1,2,3` | 200, 1.0 s, 284 kB PNG — checked. Fastest route seen | works. 200, 3.3 s, 283,858 b PNG 400x280 RGBA | no | Past-years photo slider and an NDVI picture per flight |
| Planetary Computer COG files `https://naipeuwest.blob.core.windows.net/naip/v002/<state>/<year>/...tif` (+ `.200.jpg` thumbnails) | Cloud Optimized GeoTIFF, 4 bands, range-readable | none seen (a short-lived read signature is offered at `https://planetarycomputer.microsoft.com/api/sas/v1/token/naip`, also keyless — answered 200; not used) | `GET -r 0-1023 .../ia/2025/ia_060cm_2025/42093/m_4209360_sw_15_060_20250813.tif`; thumbnail `...20250813.200.jpg` | 206, 0.5 s (unsigned range read worked) and 200, 15 kB jpg — checked | works. 206, 0.6 s, `Content-Range: bytes 0-1023/363831732` (file is 364 MB), BigTIFF header. Thumbnail 200, 0.5 s, 15,253 b, 200x267. The signing address was not called again | no | Server-side NDVI of the field from the raw bands |
| Esri tile cache `https://naip.maptiles.arcgis.com/arcgis/rest/services/NAIP/MapServer/tile/{z}/{y}/{x}` | Ready-made true-colour map tiles (24 zoom levels) | none asked; Esri terms apply | `GET .../MapServer/tile/15/12160/7862` | 200, 0.5 s, 26 kB jpg — checked. Credit "Source: Esri, USDA FSA" | works. 200, 1.5 s, 25,738 b jpeg 256x256, CORS `*` | not confirmed (description says continental US) | A drop-in sharper US basemap |
| Esri image service `https://naip.imagery1.arcgis.com/arcgis/rest/services/NAIP/ImageServer` | — | — | `GET ...?f=json` | Could not resolve host — checked. GONE at this name | broken. Could not resolve host | — | — |
| AWS open data `s3://naip-visualization` (RGB COG), `naip-analytic` (4-band MRF/COG), `naip-source` (raw GeoTIFF) | Files | AWS account; Requester Pays (the reader pays transfer) | `GET https://naip-visualization.s3.amazonaws.com/?list-type=2&max-keys=2` (and the two others) | 403 AccessDenied "Anonymous users cannot invoke requests against Requester Pays buckets" — checked on all three. Registry page says 2010 through 2023 — read | not repeated | no | — |
| USGS TNM Access API `https://tnmaccess.nationalmap.gov/api/v1/products` | Download catalogue | none | `GET .../products?datasets=USDA National Agriculture Imagery Program (NAIP)&bbox=-93.63,42.02,-93.61,42.04&max=2` (second check added `&outputFormat=JSON`) | 200, 0.4 s but `"total": 0` — checked. NAIP is listed as a dataset yet returns nothing | broken. 200, 0.7 s, 692 b: `"total": 0`, message "The offset is greater than the total number of results for this query." Control: the same call with `datasets=US Topo` gave 200, total 10 (Ames East, IA): the service is up, the NAIP dataset is empty. `GET /api/v1/datasets?` lists NAIP as "Imagery - NAIP (1 meter to .5 foot)", id imagery-naip-plus, lastUpdatedDate "Sep 7, 2019". The documentation page is a script app; its own example could not be read (not confirmed) | no | — |
| USGS EarthExplorer / M2M API `https://m2m.cr.usgs.gov/api/api/json/stable/` | Full-tile downloads (JPEG2000) | USGS EROS (ERS) login + M2M access request, free: `https://ers.cr.usgs.gov/register` | `POST .../dataset-search {"datasetName":"naip"}` without a token | 403 Forbidden — checked | not repeated | no | — |
| Google Earth Engine `USDA/NAIP/DOQQ` | Image collection | Google account + Earth Engine project | not tried | not tried | not tried | no | — |
| USDA landing page | Coverage shapefiles, ordering by email (address on the page), no API | — | `GET https://www.fsa.usda.gov/programs-and-services/aerial-photography/imagery-programs/naip-imagery/` | 200 after redirect to `https://www.fpacbc.usda.gov/geospatial-services/customer-services/naip-coverage-map` — checked. The old FSA address MOVED | not repeated | no | — |
| NAIP hub `https://naip-usdaonline.hub.arcgis.com/` | Coverage viewer | none | `GET .../api/search/v1/collections/all/items?limit=20` | 200 but 0 items — checked | not repeated | no | — |
| NASA CMR / AppEEARS / GIBS / Giovanni | NAIP is not a NASA product | — | not tried | I think none | not tried | — | — |

## Where the second check differed

- USGS NAIP catalogue count at Barrie: first check 9 tiles in 27 s. Second check: `{"count":223709}` in 4.1 s with the point sent as JSON (looks like the whole catalogue: the point was not applied), and a 60 s timeout with the `geometry=-79.78,44.40&inSR=4326` form. Same conclusion (a count is not a coverage test), different numbers.
- imagery.nationalmap.gov speed is erratic, not uniformly slow: service info 9.2 s (first check 0.8 s), WMS capabilities 33.4 s (13.7 s), identify 18.2 s, NAIP Plus info 0.4 s (8.8 s), the two exportImage pictures 0.06-0.08 s with byte-identical sizes (almost certainly a cached copy of the first check's identical request).
- Planetary Computer bbox crop took 3.3 s (first check 1.0 s). Result equal (283,858 bytes).
- USDA APFO: the host resets the connection right after the TLS client hello; it is the host refusing, not a wrong path.
- TNM Access: the service is up (US Topo control answered), but the NAIP dataset is empty.
- Everything else matched. No key, login or sign-up was asked for. Barrie: NAIP black and 0 items.

## Terms

- NAIP itself: US Government work. AWS registry page says "Public Domain with Attribution" — read. USGS service text says "public domain" NAIP downloads — read. USGS policy page (`https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits`): USGS data are US Public Domain, credit is asked — read.
- A free public site may use it: yes. A business may: yes (public domain) — but each HOST has its own terms: Planetary Computer STAC marks the collection `proprietary` with USDA FSA as licensor and Microsoft as host (read; Planetary Computer's own terms of use not read); Esri tile cache falls under Esri's terms (not read); AWS is pay-per-read.
- Credit line: "USDA Farm Production and Conservation Business Center (NAIP)" plus the host, e.g. "USGS, USDA, The National Map: Orthoimagery" (service text, read) or "Source: Esri, USDA FSA" (tile service text, read).
- Rate limits: none published on the pages read; USGS export took 12-27 s per call in the first check, so it must be cached. Planetary Computer limits: not read.

## Problems

- No Canada: Barrie is black on USGS and has zero items on Planetary Computer.
- `gis.apfo.usda.gov` (the USDA's own NAIP services): connection reset three times in the first check and on every call in the second.
- `services.nationalmap.gov` and `naip.imagery1.arcgis.com`: names no longer resolve.
- The FSA NAIP page that Planetary Computer still links to has moved to fpacbc.usda.gov.
- The USGS image service is slow and erratic (12 s for a 400x280 picture and 27 s for a count in the first check; 9.2 s for service info, 18.2 s for identify and 33.4 s for WMS capabilities in the second), and `identify` silently returns NoData if the point has no spatialReference.
- The newest Planetary Computer item (2025) carried only `image` and `thumbnail` assets (no tilejson/rendered_preview links) though the data API still rendered it.
- TNM Access lists NAIP but returns 0 products; AWS buckets are requester-pays; the AWS copy stops at 2023 (read).

## Recommendation

Use Planetary Computer: STAC search for the field's flights, then the data API bbox crop for a true-colour picture and an NDVI picture of each flight (keyless, about 1 s in the first check; 3.3 s in the second), cached on the server; fall back to the USGS exportImage.
Show the farmer "your field from the air, summer by summer" with the flight date, and a greenness picture that reveals drowned spots, thin stands and tile lines — for US fields only; Ontario keeps Esri World Imagery.

## How Crophalo uses it

Crophalo does not use it yet. Crophalo's air photo is Esri World Imagery (tiles and export), which has no date and no near-infrared; NAIP would add dated, repeat, 4-band photos in the US.
