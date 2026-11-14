# SMAP (Soil Moisture Active Passive): soil moisture and freeze/thaw

Checked on 2026-11-14 (UTC evening). No login, no key. Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read in documentation on 2026-11-14; **I think** = from memory, not confirmed on 2026-11-14.

Back to the [overview](README.md).

## What it is

A NASA satellite (launched 2015) whose radiometer senses how wet the top 5 cm of soil is, and whether the ground is frozen or thawed, everywhere on Earth every 2 to 3 days on a 9 km or 36 km grid.
NASA also runs a model on top of it (Level 4) that gives root-zone moisture (0 to 100 cm), soil temperature and snow every 3 hours on the same 9 km grid. The data are held by the NSIDC DAAC in the NASA Earthdata Cloud.

Products that matter to a farmer (all checked in the NASA catalogue CMR, provider NSIDC_CPRD):

| Short name | Version | What | Grid | Newest file on 2026-11-14 |
|---|---|---|---|---|
| SPL3SMP_E | 006 | Daily top-5 cm soil moisture, AM and PM passes | 9 km | 2026-11-12 (published 2026-11-13) |
| SPL3SMP | 009 | Same, native resolution | 36 km | listed, newest not checked |
| SPL4SMGP | 008 | Model: surface + root-zone moisture, soil temperature, snow, every 3 h | 9 km | 2026-11-10 21:00 (published 2026-11-12) |
| SPL4SMAU | 008 | Model analysis update | 9 km | listed |
| SPL3FTP_E | 004 | Daily frozen / thawed ground | 9 km | 2026-11-12 (published 2026-11-13) |
| SPL3FTP | 004 | Same | 36 km | listed |
| SPL2SMP_NRT | 107 | Near-real-time half-orbit soil moisture | 36 km | 2026-11-14 17:27 (about 1 h old) |
| SPL2SMAP_S | 003 | SMAP + Sentinel-1 soil moisture | 3 km | GIBS layer stops 2026-07-21 |
| NSIDC-0779 | 1 | SMAP-derived downscaled soil moisture | 1 km | ended 2024-06-29 |
| SPL4CMDL | 008 | Carbon / net ecosystem exchange | 9 km | listed |

## Routes

Test places: Barrie, Ontario (44.40, -79.78) and Ames, Iowa (42.03, -93.62).

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| NASA CMR granule search `https://cmr.earthdata.nasa.gov/search/granules.json` | List of files with download, S3 and OPeNDAP links | none | `?short_name=SPL3SMP_E&version=006&page_size=1&sort_key=-start_date` (same for SPL4SMGP, SPL3FTP_E, SPL2SMP_NRT) | 200, 0.15 to 0.37 s, 4.6 to 4.8 kB, checked | works. 200, 0.15-0.43 s (version left out for SPL4SMGP, SPL3FTP_E, SPL2SMP_NRT). Newest: SPL3SMP_E V006 2026-11-12; SPL4SMGP V008 2026-11-10 21:00; SPL3FTP_E V004 2026-11-12; SPL2SMP_NRT V107 2026-11-14 17:27. Links: data.nsidc.earthdatacloud.nasa.gov, s3://nsidc-cumulus-prod-protected, opendap.earthdata.nasa.gov (not for the NRT product) | yes | Finding the newest day; says how fresh SMAP is |
| NASA CMR collection search | Which SMAP products and versions exist | none | `https://cmr.earthdata.nasa.gov/search/collections.json?keyword=SMAP%20soil%20moisture&provider=NSIDC_CPRD&page_size=100` | 200, 0.99 s, 468 kB, checked | works. 100 collections returned, 468 kB | yes | Picking the right product version |
| CMR STAC `https://cmr.earthdata.nasa.gov/stac/NSIDC_CPRD` | STAC items for the same files | none | `/collections/SPL3SMP_E_006/items?limit=1` | 200, 0.91 s, 2.9 kB, 4,167 items, licence field "CC0-1.0", checked | works. 200, 0.72 s, 2.9 kB, numberMatched 4167, licence CC0-1.0. The one item returned is the OLDEST (2015-03-31), not the newest | yes | Same as CMR, in STAC form |
| NSIDC Earthdata Cloud files `https://data.nsidc.earthdatacloud.nasa.gov/nsidc-cumulus-prod-protected/SMAP/...` | The HDF5 file (range reads work with a login) | NASA Earthdata login | `.../SPL3SMP_E/006/2026/11/12/SMAP_L3_SM_P_E_20261112_R19240_001.h5` with `Range: 0-1023` | 302 to `urs.earthdata.nasa.gov/oauth/authorize`, 0.64 s, checked: needs the NASA Earthdata login | not repeated | yes | The real numbers at the field's 9 km pixel (the route Crophalo plans) |
| S3 direct `s3://nsidc-cumulus-prod-protected/SMAP/...` + `https://data.nsidc.earthdatacloud.nasa.gov/s3credentials` | Temporary AWS credentials for in-region (us-west-2) reads | NASA Earthdata login | `/s3credentials` | 307 to urs.earthdata.nasa.gov, 0.58 s, checked: needs the NASA Earthdata login | not repeated | yes | Only useful if the server runs in AWS us-west-2 |
| Earthdata Cloud OPeNDAP (Hyrax) `https://opendap.earthdata.nasa.gov/collections/C2938664763-NSIDC_CPRD/granules/<granule>` | One variable at one grid cell without downloading the file | NASA Earthdata login | `.../SMAP_L3_SM_P_E_20261112_R19240_001.h5_1MMe51bJ.dmr` | 302 to `/login/urs`, 0.40 s, checked: needs the NASA Earthdata login | not repeated | yes | A much lighter read than opening the 620 MB daily file (CMR gives the link for SPL3SMP_E, SPL4SMGP and SPL3FTP_E; not for the NRT product) |
| Harmony `https://harmony.earthdata.nasa.gov` | Server-side subset (box, variable, time) to GeoTIFF / netCDF | capabilities: none; data request: NASA Earthdata login | `/capabilities?collectionId=C2938664763-NSIDC_CPRD`; then `/C2938664763-NSIDC_CPRD/ogc-api-coverages/1.0.0/collections/all/coverage/rangeset?subset=lat(44.3:44.5)&subset=lon(-79.9:-79.7)&subset=time(...)&maxResults=1` | capabilities 200, 1.4 s, 59 kB (bbox, variable, temporal subsetting, reprojection to EPSG:4326, GeoTIFF output), checked; data request 303 to urs.earthdata.nasa.gov, checked | not repeated | yes | A small box around the field as a ready GeoTIFF |
| AppEEARS `https://appeears.earthdatacloud.nasa.gov/api` | Point or area time series as CSV / GeoTIFF (asynchronous task) | product list: none; tasks: NASA Earthdata login (bearer token, 48 h, read) | `/product` ; `/product/SPL3SMP_E.006` ; `/task` | product list 200, 5.2 s, 112 kB (193 products; SMAP: SPL3SMP_E.006, SPL3SMP.009, SPL4SMGP.008, SPL4CMDL.008, SPL3FTP.004); layers 200, 0.2 s, 70 kB; `/task` 403 without a token; all checked | not repeated | yes | A years-long soil-moisture series for one point in one request (minutes to hours, not live) |
| ORNL DAAC subset service `https://modis.ornl.gov/rst/api/v1/SPL3SMP_E/...` | JSON point / small-box subset, no file handling | none | `/products`; `/SPL3SMP_E/dates?latitude=44.40&longitude=-79.78`; `/SPL3SMP_E/bands`; same dates call for Ames | products list names SPL3SMP_E and SPL4CMDL (200 after 36 s; first try timed out at 60 s); Barrie dates: first try 503, second try 400 after 58.5 s with "No SPL3SMP_E data available for 44.4 -79.78 location."; bands: 503 then 60 s timeout; Ames dates: 60 s timeout. Broken, checked | broken. products: 60 s timeout; Barrie dates: 503 after 15.5 s; bands: 60 s timeout; Ames dates: 503 after 16.7 s. Documentation example `/MOD13Q1/dates?latitude=35.958767&longitude=-84.287433`: 60 s timeout. The whole service was down or overloaded, not just SMAP. The 400 "No SPL3SMP_E data available" answer was not reproduced, so "no SMAP data at Barrie" is not confirmed by the second check | not at the demo field (400 in the first check); Ames not confirmed | Would be the only login-free route to SMAP numbers, but it did not deliver |
| GIBS WMTS tiles `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png` | Coloured map tiles (pictures, not numbers) | none | `SMAP_L4_Analyzed_Root_Zone_Soil_Moisture/default/default/.../6/23/17.png`; `SMAP_L3_Passive_Enhanced_Day_Freeze_Thaw/default/2026-11-10/.../6/23/17.png` | 200, 0.26 s, 5.5 kB PNG; 200, 0.41 s, 1.7 kB PNG; checked | works. 200, 0.48 s, 5,519 B PNG; 200, 0.38 s, 1,672 B PNG | yes | The soil-moisture and frozen-ground map layers |
| GIBS WMTS capabilities | The list of layers and their dates | none | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml` | 200, 3.5 s, 5.8 MB, 1,330 layers, checked | works. 200, 1.6 s, 5.84 MB, 1,330 layers | yes | Knowing which dates exist |
| GIBS WMS `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi` | One picture of any box and size | none | `?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=SMAP_L3_Passive_Enhanced_Day_Soil_Moisture&CRS=EPSG:4326&BBOX=43.4,-80.8,45.4,-78.8&WIDTH=200&HEIGHT=200&FORMAT=image/png&TIME=2026-11-09` | 200, 1.3 s, 395 B PNG (almost empty: the swath did not cover the box that day), checked | works. 200, 4.2 s, 395 B PNG (nearly empty) | yes | A thumbnail of the region for the report |
| Worldview Snapshots `https://wvs.earthdata.nasa.gov/api/v1/snapshot` | One picture of a box for a date | none | `?REQUEST=GetSnapshot&TIME=2026-11-09&BBOX=43.4,-80.8,45.4,-78.8&CRS=EPSG:4326&LAYERS=SMAP_L4_Analyzed_Root_Zone_Soil_Moisture&FORMAT=image/png&WIDTH=200&HEIGHT=200` | 200, 1.4 s, 2.0 kB PNG, checked | works. 200, 0.57 s, 1,977 B PNG 200x200 | yes | A share or print image |
| NSIDC old HTTPS archive `https://n5eil01u.ecs.nsidc.org/SMAP/` | (was) file listing | - | `https://n5eil01u.ecs.nsidc.org/SMAP/SPL3SMP_E.006/` | connection refused, checked: retired | broken. Connection refused in 0.16 s (curl exit 7). Host root also refused. Retired | - | Nothing: do not use |
| Crop-CASMA (USDA NASS + George Mason University; SMAP-based 1 km soil moisture, USA only) `https://nassgeo.csiss.gmu.edu/CropCASMA/` | (was) map + WMS/WCS | now a sign-in page | `https://nassgeo.csiss.gmu.edu/CropCASMA/` | 302 to `https://cat.csiss.gmu.edu/CropSmart/signin?...`, 0.12 s, checked: now behind a login | 302 in 0.14 s to `cat.csiss.gmu.edu/CropSmart/signin?redirecturl=...` | no (USA only, I think) | US-only crop-land soil moisture; not usable without an account |
| Giovanni API `https://api.giovanni.earthdata.nasa.gov/timeseries` | Point time series | NASA Earthdata token | called once for IMERG (see [gpm-imerg.md](gpm-imerg.md)) | 403 "Bad or missing token"; whether SMAP variables are offered: not confirmed | not repeated | not confirmed | not confirmed |
| Google Earth Engine (`NASA/SMAP/SPL4SMGP/...`, `NASA/SMAP/SPL3SMP_E/...`) | Server-side point series | Google account + Cloud project | not tried | not tried (needs an account; dataset ids I think) | not tried | yes | - |
| Microsoft Planetary Computer | - | - | `https://planetarycomputer.microsoft.com/api/stac/v1/collections` | 200; 139 collections, none is SMAP, checked | the collection list again answered 200 with 139 collections (checked for IMERG) | - | no SMAP there |
| NASA POWER `GWETROOT` / `GWETTOP` | Root-zone and surface wetness 0 to 1 | none | not re-tried here (Crophalo already uses it) | this is the MERRA-2 model, not SMAP | not repeated | yes | Crophalo's existing 25-year wetness record |

SMAP layers in GIBS (checked in the capabilities file; all zoom level 6, PNG, daily): `SMAP_L4_Analyzed_Root_Zone_Soil_Moisture`, `SMAP_L4_Analyzed_Surface_Soil_Moisture`, their `_Uncertainty_` twins, `SMAP_L4_Soil_Temperature_Layer_1`, `SMAP_L4_Snow_Mass`, `SMAP_L4_Frozen_Area` (these seven: newest 2026-11-10 or 2026-10-31); `SMAP_L3_Passive_Enhanced_Day_Soil_Moisture`, `..._Night_...`, `SMAP_L3_Passive_Day_Soil_Moisture`, `..._Night_...` (newest 2026-11-11); `SMAP_L3_Passive_Enhanced_Day_Freeze_Thaw`, `..._Night_Freeze_Thaw`, `SMAP_L3_Passive_Day_Freeze_Thaw`, `..._Night_...` (newest 2026-11-11); `SMAP_L2_Passive_Enhanced_Day/Night_Soil_Moisture_Option1/2/3`; `SMAP_Sentinel-1_L2_Active_Passive_Soil_Moisture` (newest 2026-07-21); `SMAP_L4_Mean_Gross_Primary_Productivity` and other carbon layers (newest 2026-10-31).

## Where the second check differed

- ORNL subset service: nothing answered in the second check (four 503 "Service Unavailable" after 15-18 s and four 60 s timeouts in 8 calls, one at a time, across SMAP and MODIS). The first check's 400 "No SPL3SMP_E data available" was not reproduced.
- CMR STAC: the one item returned is the oldest (2015-03-31), not the newest.
- GIBS: `SMAP_L4_Frozen_Area` ends 2026-10-31 in the capabilities file. Root zone, surface, soil temperature and snow mass end 2026-11-10.

## Terms

- NASA data-use guidance (https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance), read: NASA Earth science data are free and open; data from NASA-led missions are CC0 unless marked otherwise; users are strongly urged to cite the dataset; NASA material must not imply NASA endorsement of a product or service. The CMR STAC answer for SPL3SMP_E also says licence "CC0-1.0" (checked).
- Free public site: yes (read). Business: yes, no commercial restriction stated, but no implied NASA endorsement (read).
- NSIDC (https://nsidc.org/about/data-use-and-copyright), read: "As a condition of use" NSIDC asks for a data citation (authors, year, title, version, "[Data set]", NSIDC DAAC, DOI, date accessed). The exact DOI for SPL3SMP_E v006: not confirmed (CMR gave 10.5067/NQLCDOZJYAKX for SPL3FTP_E v004 and 10.5067/NCTT8THPWRTL for SPL2SMP_NRT, checked).
- GIBS (https://nasa-gibs.github.io/gibs-api-docs/), read: asks for the line "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)"; no key; no rate limit stated on that page.
- Rate limits: CMR, NSIDC cloud, Harmony, OPeNDAP: not read. AppEEARS: answers 429 when asked too fast (read), no number given.

## Problems

1. ORNL subset service: slow and failing all session in the first check (five 60 s timeouts and two 503 "Service Unavailable" in twelve calls, 36 to 58 s when it did answer), and for the demo field it answered 400 "No SPL3SMP_E data available for 44.4 -79.78 location." The second check got only 503s and timeouts. So there was no working login-free route to SMAP numbers for Barrie on 2026-11-14.
2. Crop-CASMA now redirects to a sign-in page (it used to be open, I think); US only anyway.
3. The old NSIDC archive host `n5eil01u.ecs.nsidc.org` refuses connections: everything moved to `data.nsidc.earthdatacloud.nasa.gov`.
4. The SMAP/Sentinel-1 3 km layer in GIBS has no image after 2026-07-21; the 1 km downscaled product (NSIDC-0779) ended 2024-06-29. No current product finer than 9 km was found.
5. The daily SPL3SMP_E file is about 620 MB (CMR `granule_size`, checked): reading 12 of them is why Crophalo's first visit to a field takes minutes.
6. A GIBS WMS picture of the L3 day pass over the Barrie box on 2026-11-09 was almost empty (395 B): L3 passes leave gaps between swaths on any single day; the L4 layers have no gaps.

## Recommendation

Keep the planned route (CMR to find the day, then a range read of SPL3SMP_E with the NASA Earthdata login), but try the Earthdata Cloud OPeNDAP link CMR already gives for each file to read the one 9 km cell instead of large pieces of a 620 MB file; add SPL4SMGP (root-zone moisture, soil temperature, no swath gaps, 3-hourly) and SPL3FTP_E (frozen / thawed) the same way.
Show the farmer "top 5 cm soil moisture, 12 months", "root-zone moisture now versus this time in past years" and "ground frozen or thawed, first thaw and last frost-in-soil dates"; keep the GIBS layers for the map and add the freeze/thaw layer.

## How Crophalo uses it

- Crophalo plans to read SPL3SMP_E (9 km, AM pass then PM pass, mid-month, 12 months) by finding the files in CMR and reading them with the NASA Earthdata login. Its admin panel asks CMR for the newest SPL3SMP_E file. Its map uses the GIBS layer `SMAP_L4_Analyzed_Root_Zone_Soil_Moisture` (level 6, daily from 2015-03-31, no tiles south of 55.7 S).
- Not used yet: freeze/thaw (SPL3FTP_E and four GIBS layers); the L4 model numbers (root zone, soil temperature, snow mass) as data rather than only as a map; the near-real-time product (about 1 h old); Earthdata Cloud OPeNDAP and Harmony for one-cell reads; AppEEARS for a full-record point series; the Worldview snapshot picture.
