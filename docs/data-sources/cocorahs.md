# CoCoRaHS community rain, hail and snow network

First check on 14 November 2026, read-only, no login. Second check on 2026-11-14, about 18:58 to 19:08 UTC, with curl, no keys, no logins, 60-second limit, one call per request, 2 to 3 s pause between calls. Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read in documentation on 2026-11-14; **I think** = from memory.

Back to the [overview](README.md).

## What it is

CoCoRaHS is a volunteer network: people read a standard 4-inch rain gauge in their yard every morning and report rain, new snow, snow depth and hail. It is a real measurement near the field, not a model or a satellite estimate.
It covers the USA, Canada and the Bahamas. **Ontario is covered**: 158 Ontario stations reported on 11 November 2026 and 1,244 Ontario stations exist in the list (open and closed) (checked). Nearest to the demo field at Barrie: CAN-ON-666 "Anten Mills 0.1 N", about 10 km north, reporting every day including 2026-11-14 (checked). Near Ames: IA-SR-2 "Ames 1.5 NNE", about 1.7 km (checked).

## Routes

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| **CoCoRaHS data export, daily reports** `https://data.cocorahs.org/export/exportreports.aspx` | CSV or XML (also "XML Compact", SHEF, SHEF Snow: read on the form): ObservationDate, ObservationTime, EntryDateTime, StationNumber, StationName, Latitude, Longitude, TotalPrecipAmt, NewSnowDepth, NewSnowSWE, TotalSnowDepth, TotalSnowSWE, DateTimeStamp. **Values are in inches**, "T" = trace, "NA" = not reported | none | (a) `...exportreports.aspx?ReportType=Daily&dtf=1&Format=CSV&State=IA&County=ST&ReportDateType=reportdate&StartDate=11/10/2026&EndDate=11/11/2026&TimesInGMT=False`; (b) `...&State=IA&...StartDate=11/11/2026&EndDate=11/11/2026`; (c) `...&Country=can&State=ON&...11/11/2026`; (d) `...&Country=can&Station=CAN-ON-666&...StartDate=10/1/2026&EndDate=10/31/2026`; (e) the same station 11/12-11/14/2026; (f) `Format=XML` | all 200 (checked): (a) 0.56 s, 1.7 kB (county code ST is Scott County, not Story; Story is SR); (b) 0.69 s, 27 kB, 195 reports for Iowa; (c) 0.86 s, 65 kB, 457 reports for **all of Canada** (State is ignored when Country=can), 158 of them CAN-ON; (d) 0.37 s, 4.4 kB, 30 daily reports, October total 2.01 in, 13 wet days; (e) 0.42 s, the 8 am reading of 2026-11-14 is already there; (f) 0.39 s, 779 bytes | (d) station CAN-ON-666, October 2026: 200 in 0.75 s, 4,390 B, 30 reports, sum 2.01 in. (b) State=IA, Date=11/13/2026 (a day chosen by the second check): 200 in 1.0 s, 22 kB, 161 reports; IA-SR-2 "Ames 1.5 NNE" and IA-SR-29 "Ames 2.5 W" present. (a) State=IA&County=ST: 200 in 0.52 s, 852 B, 5 reports, all Scott County (Davenport). (c) Country=can&State=ON, 11/13/2026: 200 in 0.47 s, 60 kB, 422 reports from all provinces, 146 CAN-ON. (f) Format=XML, station, 11/12 to 11/14: 200 in 0.39 s, 2.1 kB. (e) CSV, station, 11/12 to 11/14: 200 in 0.81 s, 596 B, the 08:00 reading of 2026-11-14 present (0.00 in). No Access-Control header (same as the first check) | **yes** | the true rain and snow that fell near the field each morning, same day; snow depth and snow water in winter |
| Same export, other report types | `ReportType` = MultiDay, Hail, SigWx (significant weather) (read on the export form) | none | not tried | not tried | not tried | yes (I think) | hail reports near the field |
| **CoCoRaHS station list export** `https://data.cocorahs.org/export/exportstations.aspx` | CSV: StationNumber, StationName, StationType, State, County, City, Latitude, Longitude, Elevation, StationStatus (Reporting / Closed), CreationDate, DateTimeStamp | none | `https://data.cocorahs.org/export/exportstations.aspx?Format=CSV&Country=can` | 200 in 0.87 s, 497 kB, 3,326 Canadian stations, 1,244 with CAN-ON (checked). For Canada the State column holds "CAN" and the County column holds the province name | 200 in 3.4 s, 497 kB, 3,326 stations, 1,244 CAN-ON | yes | finding the nearest gauge to a field (cache this list, refresh weekly) |
| **CoCoRaHS export manager form** `https://data.cocorahs.org/cocorahs/export/exportmanager.aspx` | the web form that builds those addresses | none | read with a fetch | page read: lists report types, formats, date formats; its State dropdown has **no Canadian provinces**; no written API documentation, no stated limits (read) | not repeated | - | - |
| **CoCoRaHS Data Explorer** `https://dex.cocorahs.org/` | newer station dashboard | none | `https://dex.cocorahs.org/` | 200 in 0.51 s, 25 kB (checked). No public API address found in the page; a documented API: not confirmed | not repeated | - | link-out only |
| **CoCoRaHS maps** `https://maps.cocorahs.org/` | map viewer | none | `https://maps.cocorahs.org/` | 200 in 0.14 s, 5 kB shell (checked). No API address found in the page | not repeated | - | link-out only |
| **NOAA ACIS web services** `https://data.rcc-acis.org/MultiStnData` (also StnData, StnMeta) | JSON: every gauge in a box (CoCoRaHS, NWS co-op, airports) with daily values; inches by default; "M" missing, "T" trace | none | `https://data.rcc-acis.org/MultiStnData?bbox=-93.75,41.95,-93.50,42.12&sdate=2026-11-09&edate=2026-11-11&elems=pcpn&meta=name,sids,ll` (Ames) and `...bbox=-80.0,44.3,-79.6,44.6...` (Barrie) | 200 in 0.52 s (1.2 kB, 8 stations at Ames, 6 of them CoCoRaHS ids like `US1IASR0002`) and 200 in 0.65 s (402 bytes, 3 Ontario CoCoRaHS gauges `CA1ON000153`, `CA1ON000245`, `CA1ON000666` with 0.13-0.17 in on 9 Nov) (checked). Sends `access-control-allow-origin: *` | Barrie 200 in 2.3 s, 402 B, 3 gauges (0.13, 0.14, 0.17 in on 9 Nov), Access-Control-Allow-Origin: *. Ames 200 in 1.8 s, 1,186 B, 8 stations, 6 CoCoRaHS | **yes** | one call = all gauges around the field for a date range; the simplest route for "rain measured near you" |
| **NOAA NCEI Access Data Service (GHCN-Daily)** `https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries` | JSON or CSV daily PRCP, SNOW, SNWD per station; CoCoRaHS gauges appear as `US1...` and `CA1...` ids; `units=metric` gives mm | none | (a) `...&bbox=44.60,-80.00,44.30,-79.60&startDate=2026-10-01&endDate=2026-10-03&dataTypes=PRCP,SNOW,SNWD&format=json&includeStationName=true&units=metric`; (b) `...&stations=CA1ON000666&startDate=2026-10-25&endDate=2026-11-12&dataTypes=PRCP,SNOW,SNWD&format=json&includeStationName=true&units=metric` | (a) 400 `"A station is required."` (a box alone is refused); (b) 200 in 0.25 s, 1.6 kB, newest day 2026-11-10 = **4 days behind**; 30 Oct = 2.3 mm, which equals CoCoRaHS's own 0.09 in (checked). Sends `Access-Control-Allow-Origin: *` | (b) station CA1ON000666: 200 in 1.0 s, 1,598 B, mm, newest 2026-11-10, 30 Oct = 2.3, CORS open. (a) box only: 400 in 0.62 s "A station is required." | **yes** | long history of one gauge in mm, quality-checked by NOAA |
| NOAA NCEI Climate Data Online API v2 `https://www.ncei.noaa.gov/cdo-web/api/v2/` | station search by box, GHCND data | **needs a key** (free token) | `https://www.ncei.noaa.gov/cdo-web/api/v2/stations?datasetid=GHCND&extent=44.3,-80.0,44.6,-79.6&limit=5` | 400 `"Token parameter is required."` in 0.14 s (checked). Token: https://www.ncdc.noaa.gov/cdo-web/token (free, by email; limits 5 requests per second and 10,000 per day: I think, not read) | not repeated | yes | not needed: ACIS does the box search without a key |
| **Iowa Environmental Mesonet** `https://mesonet.agron.iastate.edu/api/1/` | station lists per state network `{ST}_COCORAHS`; a `/daily.{fmt}` route exists in its API list | none | `https://mesonet.agron.iastate.edu/api/1/network/IACOCORAHS.json` then `.../network/IA_COCORAHS.json`; `.../api/1/openapi.json` | first id 404 `"No stations found for provided network."` (a wrong guess); `IA_COCORAHS` 200 in 4.1 s, 1.16 MB station list (checked). Daily values through `/daily.json` for a CoCoRaHS station: not tried; Canadian networks: not confirmed | IA_COCORAHS.json 200 in 10.2 s, 1.16 MB; IACOCORAHS.json 404 "No stations found for provided network." | not confirmed | a USA back-up mirror |
| Synoptic Data (MesoWest) API `https://api.synopticdata.com/v2/` | station data, includes a CoCoRaHS network (I think) | **needs a key** | `https://api.synopticdata.com/v2/stations/metadata?network=cocorahs&radius=42.03,-93.62,10` | 401 `"Missing token"` (checked). Token: https://synopticdata.com/ (free tier for non-commercial use, paid for business: I think, not read) | not repeated | not confirmed | not needed |

## Where the second check differed

- CoCoRaHS `State=IA&County=ST` returns Scott County (Davenport), not Story County where Ames is; Story is `SR`. With `Country=can`, `State=ON` is ignored: the answer holds every province. (Both match the first check's finding.)
- Report counts differ: the second check asked for 11/13/2026, the first for 11/11/2026 (second check: Iowa 161 reports; Canada 422, of which 146 CAN-ON).
- Everything else matched the first check's status.

## Terms

- Licence (read on cocorahs.org): content and data are "released under a Creative Commons Attribution 4.0 License"; the data is "freely available to governments, academic institutions and the private sector".
- A free public site may use it: yes. A business may use it: yes (CC BY 4.0, and the private sector is named) (read). The network asks users to "give back" (support it).
- Credit line asked for (read): "we ask that everyone who uses CoCoRaHS data to please acknowledge its source when displaying it". Suggested wording (mine): "Rain and snow measured by CoCoRaHS volunteers (cocorahs.org), CC BY 4.0".
- Disclaimer (read): data is provided "as is", no liability for "missing data or misinterpretation of its content".
- Rate limits: none stated for the export (not found on the form or the home page). The full Data Usage Policy page (`https://www.cocorahs.org/Content.aspx?page=datausagepolicy`) returned the home page text to a plain fetch: full policy not read.
- ACIS and NCEI: US government services, no key, no stated licence restriction (not read); NOAA GHCN-Daily is public domain for the US part (I think); CoCoRaHS rows inside them keep the CoCoRaHS credit.

## Problems

1. **An unknown State code silently returns the whole network.** `State=ON` without `Country=can` returned 2.06 MB: every report in North America for that day. Canadian provinces are not valid State values; use `Country=can` and filter by the `CAN-ON-` prefix, or ask by `Station=`.
2. With `Country=can` the State value is ignored: all provinces come back (65 kB per day for Canada), so filter on the server side.
3. Units: the direct export is in **inches** even for Canadian stations (October 2026 at CAN-ON-666 sums to 2.01; NOAA's copy of the same day is 2.3 mm for 0.09). Convert before showing.
4. No written API documentation for the export, no JSON format (CSV, XML, SHEF only), no CORS header seen on data.cocorahs.org (in either check): it must be called from Crophalo's server, not the browser.
5. NOAA's copy (GHCN-Daily through NCEI) is 4 days behind; the direct export and ACIS have recent days (the direct export had the 8 am reading of 2026-11-14).
6. NCEI Access Data Service refuses a box without station ids (400).
7. County codes are CoCoRaHS's own two letters (IA "ST" is Scott, Story is "SR"): do not guess them; take them from the station list.
8. Volunteer data has gaps: a gauge can miss days or close (the list marks "Closed"); multi-day totals are a separate report type. Never treat a missing day as zero.
9. The Data Explorer and the maps site expose no documented API.

## Recommendation

Use NOAA ACIS `MultiStnData` with a small box around the field (no key, JSON, works in Ontario and the USA) to list the gauges and their daily rain; fall back to the CoCoRaHS export by `Station=` for the newest reading and snow fields.
Show the farmer "rain measured by volunteers near you": the 2-3 nearest gauges with distance, the last 7 and 30 days in mm, beside the satellite and model rain Crophalo already has, with the CoCoRaHS credit.

## How Crophalo uses it

Crophalo does not use it yet. Crophalo takes rain from NASA POWER, Open-Meteo (ERA5, forecast) and NASA IMERG satellite rain; no ground gauge network is used.
