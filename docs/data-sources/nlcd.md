# USGS National Land Cover Database (NLCD / Annual NLCD)

First check on 2026-11-14; second check about 18:55-19:10 UTC (about 2 s between calls, 60 s limit, one allowed repeat called "try 2"). No key, no login. Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read on 2026-11-14; **I think** = not confirmed.

Back to the [overview](README.md).

## What it is

NLCD is the USGS 30 m land-cover map of the United States (16 classes such as cultivated crops, pasture/hay, forest, wetland, developed). Since 2024 it is "Annual NLCD": one map per year from 1985, with companion maps of change, confidence, impervious surface and tree canopy.
Served by the MRLC consortium. Conterminous US only for the annual product (older Alaska, Hawaii, Puerto Rico maps exist).

## Routes

Test places: Ames, Iowa (42.03, -93.62) and Barrie, Ontario (44.40, -79.78).

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| Annual NLCD Land Cover WMS `https://dmsdata.cr.usgs.gov/geoserver/mrlc_Land-Cover-Native_conus_year_data/wms` (GeoServer; layer `Land-Cover-Native_conus_year_data`; TIME dimension) | Capabilities | none ("Fees NONE, AccessConstraints NONE") | `GET ...wms?service=WMS&version=1.3.0&request=GetCapabilities` | 200, 1.2 s, 226 kB; 41 yearly time steps 1985-01-01 to 2025-01-01 — checked | 200, 0.6 s, 225,984 b, 41 time steps 1985-01-01 to 2025-01-01, Fees NONE, AccessConstraints NONE | no | — |
| ...WMS GetFeatureInfo | The class code at a point for a chosen year | none | `GET ...wms?service=WMS&version=1.1.1&request=GetFeatureInfo&layers=Land-Cover-Native_conus_year_data&query_layers=(same)&srs=EPSG:4326&bbox=-93.6205,42.0295,-93.6195,42.0305&width=3&height=3&x=1&y=1&info_format=application/json&time=2024-01-01T00:00:00.000Z` | 200, 0.5 s, 213 b: `"PALETTE_INDEX":23` (class 23 = developed, medium intensity, at the Ames test point) — checked. Barrie: 200, `PALETTE_INDEX 250` (no data) — checked | works (flaky). Ames: try 1 **404 "No endpoint GET /geoserver/mrlc_Land-Cover-Native_conus_year_data/wms."** (0.26 s); try 2 200, 0.4 s, PALETTE_INDEX 23. Barrie 200, 0.6 s, PALETTE_INDEX 250 | no (checked) | "What was this land every year since 1985" in 41 tiny calls or one WCS call |
| ...WMS GetMap | Coloured map picture | none | `GET ...request=GetMap&layers=Land-Cover-Native_conus_year_data&srs=EPSG:4326&bbox=-93.66,42.00,-93.58,42.06&width=400&height=300&format=image/png&transparent=true&time=2024-01-01T00:00:00.000Z` | 200, 0.7 s, 43 kB PNG (Ames in NLCD colours) — checked | works (flaky). Try 1 **404** (same body); try 2 200, 0.5 s, 42,671 b PNG 400x300 | no | Map layer of surroundings |
| Annual NLCD Land Cover WCS `https://dmsdata.cr.usgs.gov/geoserver/mrlc_Land-Cover-Native_conus_year_data/wcs` | The raw class numbers for a box as GeoTIFF | none | `GET ...wcs?service=WCS&version=1.0.0&request=GetCoverage&coverage=Land-Cover-Native_conus_year_data&crs=EPSG:4326&bbox=-93.622,42.029,-93.618,42.031&width=11&height=7&format=GeoTIFF&time=2024-01-01T00:00:00.000Z` | 200, 0.2 s, 2.2 kB TIFF, values 22 and 23 — checked. (GetCapabilities 2.0.1: 200, 0.8 s, 638 kB.) | works (flaky). Try 1 **404** "No endpoint GET .../wcs." after 15.3 s; try 2 200, 0.2 s, 2,194 b GeoTIFF 11x7, 8-bit palette: 51 pixels of class 22, 26 of class 23. GetCapabilities 2.0.1 not called again | no | Share of the field and its edges in crop, pasture, woods, wetland, per year |
| Sister Annual NLCD services on the same host (each has /wms and /wcs): `mrlc_Land-Cover-Change-Native_conus_year_data`, `mrlc_Land-Cover-Confidence-Native_conus_year_data`, `mrlc_Fractional-Impervious-Surface-Native_conus_year_data`, `mrlc_Impervious-Descriptor-Native_conus_year_data`, `mrlc_Spectral-Change-Day-of-Year-Native_conus_year_data` | Change, confidence, paved share, day of year of a spectral change | none | listed on `https://www.mrlc.gov/data-services-page` (read); only Land Cover was called | read (not called) | not called | no | Year the land was cleared or built on; day a field was disturbed |
| NLCD Tree Canopy (USFS) WMS `https://dmsdata.cr.usgs.gov/geoserver/mrlc_NLCD-Tree-Canopy-Native_conus_year_data/wms` (also alaska, hawaii, prusvi) | Percent tree cover per year | none | `GET ...wms?service=WMS&version=1.3.0&request=GetCapabilities` | 200, 1.8 s, 226 kB; 41 time steps 1985-2025 — checked | works. 200, 2.0 s, 226,022 b, 41 time steps 1985-2025, layer NLCD-Tree-Canopy-Native_conus_year_data | no | Shade and windbreak cover around the field |
| Summary products on the old host `https://www.mrlc.gov/geoserver/mrlc_download/Annual_NLCD_Smy_LndCov_ChgCnt_1985_2023_CU_C1V0/wms` (and `..._ChgIdx_...`) | How many times a pixel changed 1985-2023 | none | `GET ...wms?service=WMS&version=1.3.0&request=GetCapabilities` | 200, 1.3 s, 225 kB — checked | works. 200, 0.9 s, 225,041 b, layer Annual_NLCD_Smy_LndCov_ChgCnt_1985_2023_CU_C1V0, Fees NONE | no | "This land has changed use N times" |
| Legacy NLCD 2021 on the old host `https://www.mrlc.gov/geoserver/mrlc_display/NLCD_2021_Land_Cover_L48/wms` | The older 2021 map | none | `GET ...request=GetFeatureInfo&layers=NLCD_2021_Land_Cover_L48&...bbox=-93.6205,42.0295,-93.6195,42.0305...` | 200, 0.6 s: `PALETTE_INDEX 23` — checked. Still answers although the services page no longer lists it (only Alaska/Hawaii/Puerto Rico legacy layers are listed) | works. 200, 1.4 s, 213 b, PALETTE_INDEX 23 | no | — |
| Bulk mosaics `https://www.mrlc.gov/downloads/sciweb1/shared/mrlc/data-bundles/Annual_NLCD_LndCov_<year>_CU_C1V1.zip` | One whole-US GeoTIFF per year | none | `HEAD .../Annual_NLCD_LndCov_2024_CU_C1V1.zip` (not downloaded) | 200, content-length 1,442,142,769 (1.44 GB), CORS `*` — checked | works. 200, 0.4 s, content-length 1,442,142,769, last-modified 11 Jun 2025, accept-ranges bytes, CORS `*`. Header only | no | Offline pack only |
| AWS `s3://usgs-landcover` (us-west-2) | Annual NLCD tiles | AWS account; Requester Pays | `GET https://usgs-landcover.s3.us-west-2.amazonaws.com/?list-type=2&delimiter=/&max-keys=20` | 403 AccessDenied "Anonymous users cannot invoke requests against Requester Pays buckets" — checked | not repeated | no | — |
| ScienceBase record `https://www.sciencebase.gov/catalog/item/655ceb8ad34ee4b6e05cc51a?format=json` | Citation and links | none | `GET ...?format=json&fields=title,citation,webLinks` | 200: "Annual NLCD Collection 1 Products (ver. 1.2, June 2026)", DOI 10.5066/P94UXNTS — checked | works. 200, 0.4 s, 3,238 b: "Annual National Land Cover Database (NLCD) Collection 1 Products (ver. 1.2, June 2026)", DOI 10.5066/P94UXNTS | — | The credit line |
| USGS EarthExplorer / M2M API | Tile downloads | USGS EROS login, free (`https://ers.cr.usgs.gov/register`) | M2M without a token (tried for NAIP) | 403 — checked | not repeated | no | — |
| Esri Living Atlas `https://landscape10.arcgis.com/arcgis/rest/services/USA_NLCD_Land_Cover/ImageServer` | Image service | ArcGIS account token | `GET ...?f=json` | 200 with body `{"error":{"code":499,"message":"Token Required"}}` — checked | not repeated | no | — |
| Microsoft Planetary Computer | — | — | `GET https://planetarycomputer.microsoft.com/api/stac/v1/collections` | 200; 139 collections, NO nlcd collection (nearest: `usgs-lcmap-conus-v13`, `io-lulc-annual-v02`, `usda-cdl`) — checked | not repeated | — | — |
| NASA CMR | Old catalogue records only | none | `GET https://cmr.earthdata.nasa.gov/search/collections.json?keyword=NLCD&page_size=8` | 200, 0.1 s: nlcd_1992, nlcd_2001_ver_2, nlcd_2006 (USGS_LTA records) — checked. No Annual NLCD there | works. 200, 0.4 s, 23.8 kB; first records nlcd_1992 and nlcd_2001_ver_2 (USGS_LTA). The rest of the 8 not read (sample trimmed); no Annual NLCD seen | no | — |
| MRLC Viewer `https://www.mrlc.gov/viewer/` and EVA tool `https://www.mrlc.gov/eva/` | Web apps (clip-and-download by email; county statistics) | none to view | `GET https://www.mrlc.gov/eva/` | 200 — checked (page only; its internal calls not explored) | not repeated | no | — |
| Google Earth Engine (`USGS/NLCD_RELEASES/...`) | Image collections | Google account + project | not tried | not tried | not tried | no | — |
| AppEEARS / GIBS / Giovanni / Data Rods | — | — | not tried for NLCD | not confirmed; I think none | not tried | — | — |

## Where the second check differed

- **Annual NLCD on dmsdata.cr.usgs.gov was flaky in the second check.** Three of the first five calls answered `404 {"detail":"No endpoint GET /geoserver/mrlc_Land-Cover-Native_conus_year_data/wms."}` (GetFeatureInfo at Ames, GetMap, and WCS GetCoverage, the last after 15.3 s). The same three requests, unchanged, answered 200 on try 2 a few seconds later. GetCapabilities and the Barrie lookup answered 200 first time. The first check saw no 404. An app must retry and cache.
- The 404 body on dmsdata.cr.usgs.gov for a valid NLCD path has the same wording as the 404 for the retired LANDFIRE name on edcintl.cr.usgs.gov. I think both sit behind the same USGS gateway and some of its nodes do not know the NLCD workspace; not confirmed.
- Everything else matched. No key, login or sign-up was asked for. Barrie: NLCD 250 (no data).

## Terms

- USGS policy page `https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits` — read: USGS-produced data are in the US Public Domain; credit is asked.
- GeoServer capabilities say Fees NONE and AccessConstraints NONE — checked.
- A free public site may use it: yes. A business may: yes (public domain).
- Credit line (ScienceBase, read): "U.S. Geological Survey, 2024, Annual NLCD Collection 1 Science Products (ver. 1.2, June 2026): U.S. Geological Survey data release, https://doi.org/10.5066/P94UXNTS."
- Rate limits: none published on the pages read (not confirmed).

## Problems

- No Canada: Barrie returns the no-data code 250.
- The services have MOVED host: Annual NLCD is on `dmsdata.cr.usgs.gov`, while summary and legacy layers stay on `www.mrlc.gov/geoserver`; old tutorials point at mrlc.gov only.
- The Annual NLCD services on dmsdata.cr.usgs.gov answered 404 "No endpoint" to three of five valid calls in the second check, then 200 on retry: retry and cache.
- GetFeatureInfo returns a bare `PALETTE_INDEX` number: Crophalo must carry the class table (11 water ... 82 cultivated crops ... 95 wetlands) itself.
- Capabilities files are large (226-638 kB) — do not fetch them per user.
- The MRLC "data" page builds its download list with scripts; bulk file names could only be confirmed for the 2024 land cover bundle.
- S3 copy is requester-pays; Esri copy needs a token; not on Planetary Computer.
- The 2025 time step is offered in the time list; whether it is final was not confirmed.

## Recommendation

Use the Annual NLCD WCS on dmsdata.cr.usgs.gov: one tiny GetCoverage per year (or a handful of years) over the field box, counted on the server, keyless and fast (0.2 s), with one retry because of the gateway 404s.
Show the US farmer "what this land has been since 1985" (crop, pasture, woods, wetland, built) and what surrounds it; for Ontario keep ESA WorldCover and add Canada's own crop inventory (see [cropland-data-layer-cropscape.md](cropland-data-layer-cropscape.md)), since NLCD stops at the border.

## How Crophalo uses it

Crophalo does not use it yet. Crophalo's land cover is ESA WorldCover 10 m 2021, and its crop history is USDA CDL from 2008 (48 states). NLCD would add 40 years of yearly land use, change year, tree canopy and paved share for US fields.
