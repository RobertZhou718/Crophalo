# PRISM Climate Data (Oregon State University)

First check on 2026-11-14; second check about 18:55-19:10 UTC (about 2 s between calls, 60 s limit, one allowed repeat called "try 2"). No key, no login. Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read in documentation on 2026-11-14; **I think** = not confirmed.

Back to the [overview](README.md).

## What it is

PRISM is the Oregon State "PRISM Group" set of gridded weather maps for the United States: daily, monthly and yearly rain, minimum/maximum/mean temperature, dew point and vapour pressure deficit at 4 km and 800 m, plus 30-year normals (1991-2020).
It is built from weather stations corrected for terrain; it is the grid the USDA Risk Management Agency (crop insurance) pays for. It covers the 48 conterminous states only.

## Routes

Test places: Ames, Iowa (42.03, -93.62) and Barrie, Ontario (44.40, -79.78).

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| PRISM grid web service `https://services.nacse.org/prism/data/get/<region>/<res>/<element>/<date>[?format=nc\|asc\|bil]` | One whole-US grid per call as a .zip holding a Cloud Optimized GeoTIFF (ppt, tmin, tmax, tmean, tdmean, vpdmin, vpdmax; daily from 1981, monthly/yearly from 1895; 4 km and 800 m) | none | `HEAD https://services.nacse.org/prism/data/get/us/4km/ppt/202607` (header only, grid not downloaded) | 200, `Content-Disposition: prism_ppt_us_25m_202607.zip`, application/zip — checked. Not a point API: the server must download a whole US grid (about 3 MB at 4 km — read from the directory listing) | works. 200, 1.8 s, `Content-Type: application/zip`, `Content-Disposition: filename="prism_ppt_us_25m_202607.zip"`. Header only | no (CONUS only; AK/HI/PR "not yet implemented" — read) | Nothing directly; a server could cut a field's rain and temperature out of the grid |
| Release-date service `.../prism/data/get/releaseDate/<region>/<res>/<element>/<date>[?json=true]` | When a grid was last re-issued (grids are revised up to 8 times over 6 months) | none | `GET https://services.nacse.org/prism/data/get/releaseDate/us/4km/ppt/20260701?json=true` | 200, 0.5 s, 105 b: `["2026-07-01","2026-10-22","ppt","5",...]` — checked | works. 200, 0.5 s, 105 b: `["2026-07-01", "2026-10-22", "ppt", "5", "https://services.nacse.org/prism/data/get/us/4km/ppt/20260701"]` | n/a | Telling the farmer whether a figure is still provisional |
| Grid-count service `.../prism/data/get/gridCount/<region>/<element>/<date>` | The revision number (1-8) of a grid | none | `GET https://services.nacse.org/prism/data/get/gridCount/us/ppt/202607` | 200, 0.8 s, body `4` — checked | works. 200, 0.4 s, body `4` | n/a | Same: "provisional" flag |
| Old web service v1 `https://services.nacse.org/prism/data/public/4km/<element>/<date>` | (retired) | none | `GET https://services.nacse.org/prism/data/public/4km/ppt/202001` | 200 but only a 430-byte notice saying the services were centralised and to use the new one — checked. RETIRED (the documentation said it would be disabled 30 Sep 2025) | broken. 200, 0.3 s, 430 b of text only: "PRISM web services have been centralized ..." pointing at the new service and `PRISM_downloads_web_service.pdf`. No data. The text's own example, `HEAD https://services.nacse.org/prism/data/get/us/800m/ppt/20250624`: 200, 3.4 s, application/zip, `prism_ppt_us_30s_20250624.zip`, so the service is up and only the old path is retired | no | — |
| Data directory (HTTPS view of the FTP) `https://data.prism.oregonstate.edu/` | Folders `time_series/`, `normals/` (us, ak), `prior_versions/`, `map_graphics/`; zips of COGs. Normals: `normals/us/4km/ppt/monthly/prism_ppt_us_25m_2020MM_avg_30y.zip` | none | `GET https://data.prism.oregonstate.edu/normals/us/4km/ppt/monthly/` | 200, 0.3 s, 4 kB listing; 13 files of 2.6-3.0 MB each — checked (files not downloaded) | works. 200, 1.9 s, 4,025 b listing; 13 zips `prism_ppt_us_25m_2020[MM]_avg_30y.zip`, 2.6-3.0 MB, dated 2025-02-12. Nothing downloaded | no | The 30-year normal for a field (needs server-side cutting) |
| Anonymous FTP `ftp://prism.oregonstate.edu` | Same tree as above | none (anonymous) | `curl -l ftp://prism.oregonstate.edu/` | 226, 1.7 s: time_series, normals, prior_versions, map_graphics, readme.txt — checked | works. 226, 2.8 s: time_series, readme.txt, prior_versions, PRISM_datasets.pdf, map_graphics, normals | no | Bulk use only |
| PRISM Explorer page `https://prism.oregonstate.edu/explorer/` and its internal call `POST https://prism.oregonstate.edu/explorer/dataexplorer/rpc.php` | Point time series (the only point route PRISM itself has). `proc=location_data` returns state, county, grid elevation; `proc=gridserv&call=pp/monthly_timeseries` returns values and a CSV link | none | `POST rpc.php` with `proc=location_data&lon=-93.6200&lat=42.0300`; then with `spares=4km&interp=0&stats=ppt tmean&units=si&range=monthly&start=202604&end=202607&lon=-93.6200&lat=42.0300&elev=285&call=pp/monthly_timeseries&proc=gridserv` (`spares=4km` is the page's real parameter name, not a slip) | 200, 0.3-0.4 s. Ames: `{"state":"Iowa","county":"Story","elev":{"4km":{"raw":286}}}`; series ppt 172.6, 71.77, 186.43, 306.31 mm and tmean 11.9, 17.0, 22.1, 25.3 C for Apr-Jul 2026 — checked. Barrie: `"error":"LonLatWithoutDataError"` — checked. UNDOCUMENTED internal route of a web page: no promise it stays; not for production | works (one timeout). Ames location 200, 1.8 s: Iowa, Story, elev 4km raw 286 / interp 285. Ames series 200, 0.5 s: ppt 172.6, 71.77, 186.43, 306.31; tmean 11.9, 17.0, 22.1, 25.3; CSV name contains "provisional". Barrie: try 1 connection timed out (60 s, right after two quick POSTs to the same page); try 2 200, 1.3 s, `"error":"LonLatWithoutDataError"` | no (checked) | Rain and temperature by month for one field |
| RCC-ACIS GridData `https://data.rcc-acis.org/GridData` with `"grid":"21"` (PRISM) | JSON daily (or monthly/yearly summarised) PRISM values at a point or box: pcpn, maxt, mint, avgt, GDD | none | `GET https://data.rcc-acis.org/GridData?params={"loc":"-93.62,42.03","sdate":"2026-07-01","edate":"2026-07-05","grid":"21","elems":[{"name":"pcpn"},{"name":"maxt"},{"name":"mint"}]}` | 200, 0.5 s, 145 b: five daily rows (inches, deg F), e.g. `["2026-07-04",4.74,85,65]` — checked. Barrie: 200 with all values `-999` (missing) — checked | works. Ames 200, 0.7 s, 145 b, rows 07-01 0.00/91/78 ... 07-04 4.74/85/65, 07-05 0.00/86/67. Barrie 200, 0.4 s, 165 b, all -999. CORS `*` | no (checked: -999) | Daily rain, heat and growing degree days for a US field, straight JSON, no key |
| USGS Geo Data Portal THREDDS/OPeNDAP `https://cida.usgs.gov/thredds/dodsC/prism_v2` | (was monthly PRISM over OPeNDAP) | — | `GET https://cida.usgs.gov/thredds/dodsC/prism_v2.dds` | 301 to `https://waterdata.usgs.gov/blog/gdp-moving/` — checked. MOVED/GONE at this address; new address not confirmed | broken. 301, 0.7 s, to the same blog page. The THREDDS root `https://cida.usgs.gov/thredds/catalog.html` gives the same 301, so the whole server is retired, not just this dataset. The blog page itself answered 403 "Request blocked" (CloudFront) to curl and to a second fetch, so the new address is not confirmed | no | — |
| Microsoft Planetary Computer STAC | — | — | `GET https://planetarycomputer.microsoft.com/api/stac/v1/collections` | 200; 139 collections, none named prism (it has daymet and gridmet instead) — checked | not repeated | — | — |
| Google Earth Engine (`OREGONSTATE/PRISM/...` daily, monthly, normals) | Image collections | Google account + Earth Engine project (free for non-commercial; commercial use is paid) — I think | not tried (needs a login) | not tried | not tried | no | — |
| NASA CMR / AppEEARS / GIBS / Giovanni / Data Rods | PRISM is not a NASA product | — | not tried for PRISM | not confirmed that any exists; I think none | not tried | — | — |

## Where the second check differed

- PRISM Explorer at Barrie: try 1 connection timed out at 60 s (right after two quick POSTs to the same page); try 2 answered 200 in 1.3 s with the same `LonLatWithoutDataError`.
- The USGS THREDDS root gives the same 301, so the whole server is retired.
- Small addition: the FTP root also lists `PRISM_datasets.pdf`.
- Everything else matched (same statuses, same values). No key, login or sign-up was asked for.

## Terms

- Terms page: `https://prism.oregonstate.edu/terms/` — read. Data "may be freely reproduced and distributed"; the PRISM Group keeps copyright and ownership. No ban on commercial use is written there, so a free public site and a business may both use it (my reading of the page, not legal advice).
- Credit asked for (read): name, URL and date of access, e.g. "PRISM Group, Oregon State University, https://prism.oregonstate.edu, accessed 14 Nov 2026". Map pictures need "Copyright (c) <year>, PRISM Group, Oregon State University, https://prism.oregonstate.edu, map created <date>".
- Warning on the page (read): PRISM is not recommended for very long-term trends.
- Rate limits (read in the web-service PDF, dated 26 Mar 2025): a file downloaded twice in 24 hours is then blocked for that period; repeated heavy use may get the IP blocked; their sample script sleeps 2 s between calls.
- ACIS terms and limits: not read.

## Problems

- No coverage of Canada: Barrie returns `LonLatWithoutDataError` (Explorer) and `-999` (ACIS).
- The old web service (`/prism/data/public/...`) answers 200 but with a "moved" text instead of data: a script that only checks the status code would be fooled.
- The official web service is whole-grid only (no point, no box), and 30-year normals are NOT in the web service (FTP/data directory only) — read.
- Alaska, Hawaii, Puerto Rico and 400 m: "not yet implemented" — read (an `ak/` normals folder does exist in the data directory — checked).
- Recent grids are provisional and change for 6 months.
- The USGS Geo Data Portal PRISM OPeNDAP address is gone (301 to a "moving" blog post); the whole THREDDS server is retired.
- The PRISM Explorer route timed out once in the second check.

## Recommendation

For US fields only: read PRISM through RCC-ACIS GridData (grid 21) for daily rain, max/min temperature and growing degree days in one keyless JSON call, and credit "PRISM Group, Oregon State University"; keep PRISM's own grid service for a later server-side cache of normals.
Show the farmer "rain and heat so far this season against the 1991-2020 normal, on a 4 km grid tuned to hills"; for Ontario keep the sources Crophalo already plans (NASA POWER, ERA5-Land), because PRISM has nothing there.

## How Crophalo uses it

Crophalo does not use it yet. Crophalo's weather comes from NASA POWER, GPM/IMERG, ERA5-Land and forecast models; PRISM would add a finer, station-anchored US grid and official-style normals.
