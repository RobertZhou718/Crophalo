# GPM and IMERG (satellite precipitation; also the Worldview / GIBS IMERG layers)

Checked on 2026-11-14 (UTC evening). No login, no key. Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read in documentation on 2026-11-14; **I think** = from memory, not confirmed on 2026-11-14.

Back to the [overview](README.md).

## What it is

GPM (Global Precipitation Measurement) is a NASA/JAXA satellite mission; IMERG is its merged product that estimates rain and snow for the whole globe every half hour on a 0.1 degree (about 10 km) grid, back to 1998.
It comes in three runs: Early (about 4 h after the rain), Late (about 14 h) and Final (gauge-corrected, months later). The data are held by NASA GES DISC in the Earthdata Cloud.

Products (all version 07, checked in CMR, provider GES_DISC):

| Short name | Run / step | Newest file on 2026-11-14 |
|---|---|---|
| GPM_3IMERGHHE | Early, half-hourly | 2026-11-14 13:30 UTC (published 18:22 UTC: about 5 h behind) |
| GPM_3IMERGHHL | Late, half-hourly | listed, newest not checked |
| GPM_3IMERGDE | Early, daily | 2026-11-13 (V07C) |
| GPM_3IMERGDL | Late, daily | 2026-11-13 (V07C) |
| GPM_3IMERGHH / GPM_3IMERGDF / GPM_3IMERGM | Final, half-hourly / daily / monthly | 2025-09-30 (file published 2026-02-02): Final Run is 13.5 months behind |

## Routes

Test places: Barrie, Ontario (44.40, -79.78) and Ames, Iowa (42.03, -93.62).

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| NASA POWER daily API `https://power.larc.nasa.gov/api/temporal/daily/point` (parameter `IMERG_PRECTOT`) | Daily IMERG rain (mm) for a point as JSON | none | `?parameters=IMERG_PRECTOT&community=AG&longitude=-79.78&latitude=44.40&start=20250801&end=20261113&format=JSON&time-standard=UTC` | 200, 0.94 s, 8.0 kB, source "IMERG"; 410 of 470 days valid; last valid day 2026-09-14; checked. The same call WITHOUT `time-standard=UTC` gives 200 but every day -999 with the message "The IMERG Source Data is not available at the Local Solar Time (LST) standard." (checked for Barrie and Ames) | works. 200, 0.59 s, 7,980 B, source IMERG, 470 days, 410 valid, last valid 2026-09-14 (2.58 mm), everything after is -999. The call without time-standard was not repeated | yes | The long daily rain record with no login (already Crophalo's main rain source) |
| NASA CMR granule search `https://cmr.earthdata.nasa.gov/search/granules.json` | The file list with download, S3 and OPeNDAP links | none | `?short_name=GPM_3IMERGDL&page_size=1&sort_key=-start_date` (same for GPM_3IMERGDE, GPM_3IMERGDF, GPM_3IMERGHHE) | 200, 0.24 to 0.39 s, 4.6 to 4.8 kB, checked | works. 200, 0.21-0.40 s (HHE took 7.0 s). Late and Early daily newest 2026-11-13 (V07C); Early half-hourly 2026-11-14 13:30; Final daily ends 2025-09-30 (V07B). Besides data.gesdisc / s3 / opendap.earthdata.nasa.gov links, the granule records also hold gpm1.gesdisc.eosdis.nasa.gov links (not called) | yes | Finding which days exist |
| NASA CMR collection search | Which IMERG products exist | none | `https://cmr.earthdata.nasa.gov/search/collections.json?keyword=IMERG&provider=GES_DISC&page_size=60` | 200, 0.59 s, 560 kB, checked. Only version 07 is listed; no version 08 | works. 21 collections; IMERG only in version 07; Final half-hourly and monthly also end 2025-09-30 | yes | - |
| GES DISC OPeNDAP (on-premises Hyrax) `https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/...` | One grid cell as text, no file download | NASA Earthdata login | `.../GPM_3IMERGDL.07/2026/11/3B-DAY-L.MS.MRG.3IMERG.20261113-S000000-E235959.V07C.nc4.ascii?precipitation%5B0%3A0%5D%5B1002%3A1002%5D%5B1344%3A1344%5D` | 302 to `urs.earthdata.nasa.gov/oauth/authorize`, 0.25 s, checked: host is alive, needs the NASA Earthdata login | not repeated | yes | The newest days of rain for the field's 10 km square (Crophalo's planned route) |
| Earthdata Cloud OPeNDAP `https://opendap.earthdata.nasa.gov/collections/C2723754859-GES_DISC/granules/<granule>` | Same, from the cloud copy (in the first check, the only OPeNDAP link CMR returned) | NASA Earthdata login | `.../GPM_3IMERGDL.07%3A3B-DAY-L.MS.MRG.3IMERG.20261113-S000000-E235959.V07C.nc4.dap.csv?dap4.ce=/precipitation%5B0%5D%5B1002%5D%5B1344%5D` | 302 to `/login/urs`, 0.28 s, checked: needs the NASA Earthdata login. Whether this `dap4.ce` form is the right one once logged in: not confirmed | not repeated | yes | Same |
| GES DISC data files `https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/...` | The netCDF4 / HDF5 file (daily file about 26 to 31 MB) | NASA Earthdata login | `.../GPM_3IMERGDL.07/2026/11/3B-DAY-L.MS.MRG.3IMERG.20261113-S000000-E235959.V07C.nc4` with `Range: 0-1023` | 302 to urs.earthdata.nasa.gov, 0.39 s, checked | not repeated | yes | Whole-world file; too big for a point lookup |
| S3 direct `s3://gesdisc-cumulus-prod-protected/GPM_L3/...` + `https://data.gesdisc.earthdata.nasa.gov/s3credentials` | Temporary AWS credentials (us-west-2 only) | NASA Earthdata login | `/s3credentials` | 307 to urs.earthdata.nasa.gov, 0.42 s, checked | not repeated | yes | Only if the server runs in AWS us-west-2 |
| Giovanni API `https://api.giovanni.earthdata.nasa.gov/timeseries` | Point time series (single points only, read on the Earthdata forum) | NASA Earthdata token (Bearer) | `?data=GPM_3IMERGDF_07_precipitation&location=%5B44.40,-79.78%5D&time=2025-06-01T00:00:00/2025-06-05T00:00:00` | 403, 0.54 s, `{"code":"401","message":"Bad or missing token"}`, checked. The variable name used is a guess: not confirmed | not repeated | yes (I think) | A point rain series without handling files, with the login |
| Giovanni web tool `https://giovanni.gsfc.nasa.gov/giovanni/` | Interactive maps and series | login for plots (I think) | the page | 200, 0.16 s, 20 kB HTML, checked | not repeated | yes | Not an API |
| GES DISC Hydrology Data Rods `https://hydro1.gesdisc.eosdis.nasa.gov/daac-bin/access/timeseries.cgi` | (was) point time series as text, no login | - | `?variable=GPM:GPM_3IMERGHH_06:precipitationCal&location=GEOM:POINT(-79.78,%2044.40)&startDate=2020-01-01T00&endDate=2020-01-02T00&type=asc2` | 301 to a GES DISC alert titled "The Hydrology Data Rods service will be discontinued no earlier than October 31, 2025 and transitioned to a new data access method", checked: retired. The replacement's address: not confirmed (the alert page is script-only) | broken. 301 in 0.16 s to the same alert. Documentation example (NLDAS_FORA0125_H.002 APCPsfc at Ames): same 301. Retired for every variable | - | Nothing: do not build on it |
| GIBS WMTS tiles `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png` | Coloured rain-rate tiles (pictures) | none | `IMERG_Precipitation_Rate/default/2026-11-12/.../6/23/17.png`; `IMERG_Precipitation_Rate_30min/default/2026-11-14T12:00:00Z/.../6/23/17.png` | 200, 0.41 s, 3.2 kB PNG; 200, 0.39 s, 1.5 kB PNG; checked | works. 200, 0.39 s, 3,212 B; 200, 0.36 s, 1,497 B | yes | The rain map layer; the 30-minute layer is a "rain right now" picture |
| GIBS capabilities | Layer list and dates | none | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml` | 200, 3.5 s, 5.8 MB, checked. `IMERG_Precipitation_Rate` 2000-06-01 to 2026-11-13; `IMERG_Precipitation_Rate_30min` only 2026-01-19 to 2026-11-14 12:30 (a rolling window); `GMI_Precipitation_Rate_Asc` / `_Dsc` 2014-03-04 to 2026-11-14; `TRMM_Precipitation_Rate_*` ended 2015-04-07 | works. Daily 2000-06-01 to 2026-11-13; 30-minute 2026-01-19T20:30 to 2026-11-14T12:30; GMI Asc/Dsc to 2026-11-14 | yes | - |
| GIBS WMS and Worldview Snapshots `https://wvs.earthdata.nasa.gov/api/v1/snapshot` | One picture of a box | none | tried with SMAP and MODIS layers (see [smap.md](smap.md), [modis-viirs.md](modis-viirs.md)); not tried with the IMERG layer | 200 for those layers, checked; IMERG layer itself not tried | not tried | yes | A share or print image of a storm |
| PPS (Precipitation Processing System) NRT and production servers `https://jsimpsonhttps.pps.eosdis.nasa.gov/imerg/gis/` , `https://arthurhouhttps.pps.eosdis.nasa.gov/gpmdata/` | GeoTIFF / HDF5 files, 30-min to 7-day accumulations | PPS registration (its own account, by email; not the Earthdata login) | both addresses | 401 `WWW-Authenticate: Basic realm="PPS NRT Private"` and `"PPS Prod Private"`, 0.29 s and 0.14 s, checked | not repeated | yes | Ready-made GeoTIFF rain accumulations |
| GPM "Precipitation and Applications Viewer" API `https://pmmpublisher.pps.eosdis.nasa.gov/opensearch` | (was) JSON search for GeoTIFF / GeoJSON rain products | - | `?q=precip_1d&lat=44.4&lon=-79.78&limit=1&startTime=2026-11-10&endTime=2026-11-12` | 200 but it is the HTML of the viewer page (34.5 kB), not JSON, checked: the old API no longer answers at this address | broken. 200, 0.21 s, 34,525 B of HTML ("GPM Precipitation and Applications Viewer - Global"). Documentation-style example (`q=precip_30mn&lat=38&lon=-76&limit=1`): the same 34,525 B page. The API is gone; the address serves the viewer | - | Nothing |
| NASA Earthdata GIS image services `https://gis.earthdata.nasa.gov/image/rest/services/GESDISC/GPM_3IMERGHHE/ImageServer` | (would be) ArcGIS image service: identify at a point | - | `?f=json`, `/identify?...`, and the folder `.../GESDISC?f=json` | 404 from nginx for all three (also 404 through a second fetch), checked: listed by search engines but not answering | broken. 404 nginx for all three (0.23-1.35 s). `/image/rest/services?f=json`: 404. The host is alive: `https://gis.earthdata.nasa.gov/portal/sharing/rest?f=json` answers 200 (ArcGIS Enterprise 12.0.0). The image-service path has moved or been removed; new path not confirmed | - | Nothing |
| NASA Disasters GPM NRT services `https://maps.disasters.nasa.gov/ags03/rest/services/GPM_NRT` | (would be) ArcGIS services of NRT IMERG | - | `?f=json` | 404, 0.64 s, checked | broken. 404, 0.42 s, HTML page. `/ags03/rest/services?f=json`: 404; `/arcgis/rest/services?f=json`: 404 | - | Nothing |
| Microsoft Planetary Computer `gpm-imerg-hhr` | Half-hourly IMERG as Zarr | none (I think) | `https://planetarycomputer.microsoft.com/api/stac/v1/collections` | 200; the collection's time range is 2000-06-01 to 2021-05-31, checked: a stale copy | broken (stale). 200, 3.3 s, 1.75 MB, 139 collections; gpm-imerg-hhr extent 2000-06-01 to 2021-05-31; a STAC item search for its newest item returned 0 features (200, 318 B) | yes | Nothing current |
| SERVIR ClimateSERV `https://climateserv.servirglobal.net/api/` | Point / polygon statistics of IMERG and other rain datasets (asynchronous job) | none (read) | `/getParameterTypes/` | 200, 1.1 s, 203 B (list of operations: max, min, median, range, sum, avg, download, netcdf, csv), checked. A data request itself: not tried | works. 200, 1.66 s, 203 B (operations as a quoted string, content type text/html). No data request tried | not confirmed | A login-free IMERG series, if the job API is acceptable |
| Google Earth Engine `NASA/GPM_L3/IMERG_V07` | Server-side series | Google account + Cloud project | not tried | not tried (dataset id I think) | not tried | yes | - |

## Where the second check differed

- Planetary Computer `gpm-imerg-hhr`: worse than stale. Besides the 2000-06-01 to 2021-05-31 extent, a STAC search for its newest item returned zero features.
- NASA Earthdata GIS: the three addresses are 404 as in the first check, but the host is alive (portal REST answers 200, ArcGIS Enterprise 12.0.0). The image-service path has moved or been removed.
- CMR IMERG granule records also carry gpm1.gesdisc.eosdis.nasa.gov links (not called). Minor.
- Everything else matched the first check.

## Terms

- NASA data-use guidance (https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance), read: free and open, CC0 for NASA-led missions unless marked, cite the dataset, no implied NASA endorsement. Free public site: yes. Business: yes (read).
- Credit: cite the IMERG dataset (Huffman et al., GES DISC, with the product DOI). The exact citation text and DOI for V07: not read.
- GIBS acknowledgement line: read (see [smap.md](smap.md)). No key; no rate limit stated.
- POWER terms and citation: not read for this resource (see [nasa-power.md](nasa-power.md)).
- PPS registration (https://registration.pps.eosdis.nasa.gov/registration/), read: an online form confirmed by email; the page does not say it is free (I think it is); NRT access must be ticked.
- Rate limits: CMR, GES DISC, OPeNDAP, Giovanni API: not read.

## Problems

1. IMERG Final Run stops at 2025-09-30 in CMR (daily, half-hourly and monthly; the last file was published 2026-02-02). Anything that wants gauge-corrected rain after September 2025 gets nothing; only Early and Late runs are current.
2. NASA POWER's `IMERG_PRECTOT` ends 2026-09-14 for Barrie: 60 days before yesterday. Crophalo's planned fill uses "at most the last 60 days" from the Late/Early runs, so the gap is exactly at that limit; one more day of POWER delay leaves a hole.
3. POWER returns only -999 for IMERG unless `time-standard=UTC` is in the request (Crophalo's planned call has it; anything that drops it will silently lose satellite rain).
4. In the first check, CMR no longer returned the `gpm1.gesdisc.eosdis.nasa.gov/opendap` link for the daily files; the only OPeNDAP link was the Earthdata Cloud one (`opendap.earthdata.nasa.gov`). Crophalo's example request is on gpm1, which still answers (302 to login), but Crophalo should not assume the link it finds in CMR has the gpm1 form. (The second check did see gpm1.gesdisc.eosdis.nasa.gov links in the granule records, without calling them.)
5. Retired or dead: Hydrology Data Rods (301 to a discontinuation alert), the pmmpublisher JSON API (HTML only), the Earthdata GIS IMERG image services (404), the NASA Disasters GPM_NRT services (404). The Planetary Computer copy stops in May 2021.
6. The GIBS half-hourly layer only reaches back to 2026-01-19.

## Recommendation

Keep POWER `IMERG_PRECTOT` (with `time-standard=UTC`) for the long record and the CMR + OPeNDAP read of the Late then Early daily files for the newest weeks, but widen the fill window beyond 60 days and read the OPeNDAP address exactly as CMR gives it (cloud Hyrax) with the NASA Earthdata login.
Show the farmer "rain so far this season against past years", and add the GIBS 30-minute layer as "rain falling now" on the map.

## How Crophalo uses it

- Crophalo already uses POWER `IMERG_PRECTOT` since 2001 as its main rain record.
- Crophalo plans to fill the newest weeks itself: it finds GPM_3IMERGDL (then GPM_3IMERGDE) version 07 files in CMR and reads one OPeNDAP cell per day with the Earthdata login, at most 60 days back, and keeps the answer for 6 hours. Its map uses the GIBS layer `IMERG_Precipitation_Rate` (level 6, daily from 2000-06-01).
- Not used yet: the half-hourly Early run (about 5 h old) for "rain today"; the GIBS 30-minute layer; the Giovanni point API (token); PPS GeoTIFF accumulations (own registration); ClimateSERV.
