# USGS National Water Information System (NWIS) and the newer USGS Water Data APIs

First check on 14 November 2026, read-only, no key. Second check on 2026-11-14, about 18:58 to 19:08 UTC, with curl, no keys, no logins, 60-second limit, one call per request, 2 to 3 s pause between calls. Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read in documentation on 2026-11-14; **I think** = from memory.

Back to the [overview](README.md).

## What it is

The US Geological Survey's record of water in the USA: river flow and river height every 15 minutes, daily means back many decades, groundwater levels in wells, water-quality samples, and the normal flow for each day of the year.
The old "waterservices" addresses are being retired piece by piece and replaced by the new Water Data APIs at `api.waterdata.usgs.gov`.

Coverage: USA only (plus a few rivers on the Canada border, mostly British Columbia/Alaska). **Ontario is not covered**: a box around Barrie returns nothing from both the old and the new service (checked). Canada's own equivalent answers for Barrie (see the last row).

## Routes

Test site near Ames: USGS-05470500 "Ioway Creek at Ames, IA" (42.0226, -93.6305).

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| **Legacy site service** `https://waterservices.usgs.gov/nwis/site/` | tab-separated list of stations in a box, county or state | none | `https://waterservices.usgs.gov/nwis/site/?format=rdb&bBox=-93.80,41.90,-93.45,42.15&siteType=ST&siteStatus=active&hasDataTypeCd=iv`; Barrie: `...?format=rdb&bBox=-80.10,44.20,-79.50,44.60&siteStatus=all`; wells: `...?format=rdb&countyCd=19169&siteType=GW&hasDataTypeCd=gw&siteOutput=basic` | Ames 200 in 0.61 s, 1.6 kB, 3 stream gauges (05470000, 05470500, 05471000); Barrie **404, empty** in 1.2 s; wells 200 in 0.30 s, 21 kB (checked). CORS open | Ames 200 in 1.0 s, 1,594 B, 3 gauges (05470000, 05470500, 05471000); Barrie 404, empty body, 0.35 s | no | finding the nearest river gauge |
| **Legacy instantaneous values (iv)** `https://waterservices.usgs.gov/nwis/iv/` | JSON (WaterML-style) of 15-minute flow and gauge height | none | `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=05470500&parameterCd=00060,00065&period=PT2H` | 200 in 0.44 s, 4.5 kB: 393-396 ft3/s at 11:00-11:30 local, flagged "P" provisional (checked) | 200 in 0.26 s, 4.3 kB: 393 to 396 ft3/s, 2.52 to 2.53 ft, provisional | no | "the creek next to you right now" |
| **Legacy daily values (dv)** `https://waterservices.usgs.gov/nwis/dv/` | JSON daily means | none | `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=05470500&parameterCd=00060&startDT=2026-11-08&endDT=2026-11-12` | 200 in 0.52 s, 2.9 kB: 594, 535, 492, 465, 433 ft3/s (checked) | 200 in 0.23 s, 2.9 kB: 594, 535, 492, 465, 433 | no | river trend over days and years |
| **Legacy groundwater levels (gwlevels)** `https://waterservices.usgs.gov/nwis/gwlevels/` | (used to give) well water levels | none | `https://waterservices.usgs.gov/nwis/gwlevels/?format=json&countyCd=19169&startDT=2025-01-01&endDT=2026-11-14` | **RETIRED**: 301 in 0.21 s to `https://waterdata.usgs.gov/blog/api-decom-fall-2025/#gwlevels` (checked) | RETIRED. 301 in 0.29 s to the same blog address. A one-site example (`sites=375907091432201`; the site number I think the old USGS help page used, page not re-read): same 301 in 0.44 s. The blog page itself: 403 in 0.19 s (CloudFront "The request could not be satisfied") | no | nothing any more: use field-measurements below |
| **Legacy statistics (stat)** `https://waterservices.usgs.gov/nwis/stat/` | tab-separated daily, monthly or annual statistics | none | `https://waterservices.usgs.gov/nwis/stat/?format=rdb&sites=05470500&statReportType=daily&statTypeCd=median,p10,p90&parameterCd=00060` | 200 in 1.4 s, 22 kB (checked) | 200 in 0.18 s, 21.6 kB, 366 day rows | no | "normal for this date" |
| **New OGC API, list of collections** `https://api.waterdata.usgs.gov/ogcapi/v0/collections` (also `/ogcapi/v1/`) | 39 collections: latest-continuous, continuous, latest-daily, daily, edr/daily, latest-field-measurements, field-measurements, channel-measurements, combined-metadata, field-measurements-metadata, time-series-metadata, monitoring-locations, peaks, time-series-revisions, time-series-methods, plus code lists (parameter-codes, statistic-codes, site-types, states, counties, aquifer-codes ...) | none needed (optional free key) | `https://api.waterdata.usgs.gov/ogcapi/v0/collections?f=json` | 200 in 3.1 s, 210 kB (checked). The answers' own links and the documentation now use `/ogcapi/v1/`; both v0 and v1 answered | 200 in 1.6 s, 210 kB, 39 collections, CORS open | - | - |
| **New: monitoring-locations** `.../collections/monitoring-locations/items` | GeoJSON stations with name, type, county, altitude, basin | none | `...monitoring-locations/items?f=json&bbox=-93.80,41.90,-93.45,42.15&site_type_code=ST&limit=5`; Barrie `...?f=json&bbox=-80.10,44.20,-79.50,44.60&limit=5`; `...?f=json&country_code=CA&limit=3&properties=id,monitoring_location_name,state_name,site_type` | Ames 200 in 0.66 s, 12 kB; Barrie 200 in 0.39 s with **0 features**; country CA returns border sites such as "UNUK R NR STEWART BC" (checked). CORS open | Ames 200 in 0.53 s, 12.2 kB, 5 features; Barrie 200 in 0.53 s, 0 features; country_code=CA 200 in 0.45 s, 5 British Columbia border sites (ids CAX01-...) | no | nearest gauge search, straight from the browser |
| **New: latest-continuous** `.../collections/latest-continuous/items` | the newest 15-minute value per series | none | `https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items?f=json&monitoring_location_id=USGS-05470500&limit=5` | 200 in 0.79 s, 2.8 kB: 393 ft^3/s and 2.52 ft at 2026-11-14T18:00Z, "Provisional" (checked) | 200 in 0.51 s, 2.8 kB: 393 ft^3/s and 2.52 ft at 2026-11-14T18:00Z, Provisional | no | live river level and flow |
| **New: continuous** `.../collections/continuous/items` | the 15-minute history | none | not tried (same shape as latest-continuous, read in the migration guide) | not tried | not tried | no | flood rise and fall |
| **New: daily / latest-daily** `.../collections/daily/items` | daily mean, max, min | none | `https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items?f=json&monitoring_location_id=USGS-05470500&parameter_code=00060&statistic_id=00003&time=2026-11-08/2026-11-12&limit=10`; `https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-daily/items?f=json&monitoring_location_id=USGS-05470500&limit=2` | 200 in 0.36 s, 4.9 kB, same five values as the legacy dv (rows not in date order); v1 latest-daily 200 in 0.67 s: 410 ft^3/s for 2026-11-13 (checked) | daily (v0) 200 in 0.42 s, 4.9 kB, 5 rows, order 11-09, 11-08, 11-10, 11-11, 11-12; latest-daily (v1) 200 in 0.48 s, 2.0 kB: 410 ft^3/s for 2026-11-13 | no | daily river history |
| **New: field-measurements / latest-field-measurements** (replaces gwlevels) | hand-measured values: depth to groundwater (parameter 72019), discharge measurements | none | `https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-field-measurements/items?f=json&bbox=-93.80,41.90,-93.45,42.15&parameter_code=72019&limit=3` | 200 in 2.5 s, 5.1 kB: three wells, but their last readings are from 1993, 1993 and 1945 (checked): there is no live well near Ames in this answer | 200 in 1.85 s, 5.1 kB: wells last read 1993-09-21, 1993-04-12, 1945-01-01 | no | groundwater depth where a monitored well is near; often old or absent |
| **New: time-series-metadata, peaks, channel-measurements** | what each station measures and since when; annual flood peaks | none | not tried (listed in the collections answer) | listed (checked), not called | not called | no | flood history |
| **New: Statistics API** `https://api.waterdata.usgs.gov/statistics/v0/` | day-of-year normals and percentiles per station | none | `https://api.waterdata.usgs.gov/statistics/v0/observationNormals?monitoring_location_id=USGS-05470500&parameter_code=00060&start_date=11-10&end_date=11-12` | 200 in 0.74 s, 3.9 kB: mean flow for 10 November is 93.6 ft^3/s from 69 years (checked); the 393-465 ft^3/s seen in these answers on 2026-11-14 is about four times normal | 200 in 0.75 s, 3.9 kB: mean 93.557 ft^3/s for 11-10, sample_count 69 | no | "the creek is running far above / below normal for the date" |
| **New: Samples-data API (water quality)** `https://api.waterdata.usgs.gov/samples-data/` | lab sample results; summary per station | none | `https://api.waterdata.usgs.gov/samples-data/summary/USGS-05470500?mimeType=text%2Fcsv` | 200 in 1.3 s, 3.9 kB CSV (checked) | 200 in 0.87 s, 3.9 kB CSV, 32 rows | no | nitrate and other water-quality history where sampled |
| **API catalogue** `https://api.waterdata.usgs.gov/apis.json` | list of 9 services | none | that URL | 200 in 0.48 s, 6.9 kB (checked). A STAC API and a `/squid/` API are named in the documentation (read), not called | not repeated | - | - |
| **NLDI (river network)** `https://api.water.usgs.gov/nldi/linked-data/` | which stream reach a point drains to; upstream/downstream gauges and basin | none | `https://api.water.usgs.gov/nldi/linked-data/comid/position?coords=POINT(-93.62%2042.03)` | 200 in 0.47 s, 1.2 kB GeoJSON line; headers `x-ratelimit-limit: 3600`, `x-ratelimit-remaining: 3599` (checked) | 200 in 0.54 s, 1,195 B; x-ratelimit-limit 3600, remaining 3599 | no (US network) | picking the gauge that is actually downstream of the field |
| **Water Quality Portal** `https://www.waterqualitydata.us/data/` | USGS + EPA + state water-quality stations and results | none | `https://www.waterqualitydata.us/data/Station/search?bBox=-93.70,41.98,-93.55,42.08&siteType=Stream&mimeType=csv` | 200 in 4.4 s, 57 kB CSV (checked) | 200 in 0.46 s, 57 kB CSV, 228 stations | no (I think) | water quality near the field |
| NWIS web pages, National Water Dashboard, NGWMN groundwater portal | viewers | none | not tried | not tried | not tried | no | link-outs |
| AWS / Google / Planetary Computer mirrors | - | - | Planetary Computer collection list | no NWIS collection among 139 (checked); Google BigQuery / AWS copies: not confirmed | not repeated | - | - |
| **Canadian equivalent (outside this resource): ECCC hydrometric stations** `https://api.weather.gc.ca/collections/hydrometric-stations/items` | Water Survey of Canada stations (also `hydrometric-daily-mean`, `hydrometric-realtime`: I think, not called) | none | `https://api.weather.gc.ca/collections/hydrometric-stations/items?f=json&bbox=-80.10,44.20,-79.50,44.60&limit=5` | 200 in 0.18 s, 11 kB: "NOTTAWASAGA RIVER NEAR BAXTER" (02ED003), Active, real-time (checked). CORS open | 200 in 4.05 s, 11.5 kB, numberMatched 11; first is NOTTAWASAGA RIVER NEAR BAXTER (02ED003), Active, REAL_TIME 1; CORS open | **yes** | the same river card for Ontario fields |

## Where the second check differed

- Water Quality Portal: 0.46 s (first check 4.4 s).
- ECCC hydrometric stations: 4.05 s (first check 0.18 s). Same content.
- Legacy gwlevels: a one-site example got the same 301, so the request was not at fault; the blog page it points to answered 403.
- Everything else matched the first check's status.

## Terms

- Licence: USGS data is a US Government work; the API documentation says the information "for the most part, is in the public domain" and "Permission to reproduce copyrighted items must be secured from the copyright owner" (read). A free public site may use it: yes. A business may use it: yes (public domain; I think no extra condition, the USGS policy page itself was not read for this resource).
- Credit line asked for: none found in the pages read. Usual wording (I think): "U.S. Geological Survey, National Water Information System (waterdata.usgs.gov)", with the access date.
- Provisional data: recent values are marked "P" / "Provisional" and can be revised (checked in the answers); say so on screen.
- API key: optional and free, issued through api.data.gov at https://api.waterdata.usgs.gov/signup (emailed); sent as the `api_key` query value or the `X-Api-Key` header (read).
- Rate limits: fewer requests per hour without a key, more with one; exact numbers are not published; responses carry `X-RateLimit-Limit` / `X-RateLimit-Remaining`; over the limit gives HTTP 429; USGS gives a contact address for custom limits on its documentation page (read). No rate-limit header was seen on the keyless OGC answers (checked); NLDI showed a limit of 3600 (checked).
- Legacy waterservices limits: not read.

## Problems

1. **Legacy groundwater levels (gwlevels) is retired**: 301 to a USGS blog post "api-decom-fall-2025". The challenge page lists groundwater levels as a waterservices route; it no longer is.
2. The blog post it redirects to answered **403** to a plain fetch (in both checks), so the retirement dates of the other legacy services (iv, dv, site, stat) were not read. A secondary source says the remaining legacy services go in early 2027: not confirmed. They all still answered on 2026-11-14.
3. The legacy site service answers **404 with an empty body** when nothing matches (Barrie), not an empty list.
4. New API versions: documentation and the answers' own links use `/ogcapi/v1/`, older examples use `/ogcapi/v0/`; both work. Build on v1.
5. New `daily` rows came back out of date order (in both checks): sort them.
6. Groundwater near Ames: the "latest" field measurements are decades old (1993, 1945). Groundwater coverage is patchy; do not promise it.
7. Keyless rate limits are unpublished and "per IP per hour": a public site must cache and should get the free key.
8. Not in Ontario. For the demo field the river and groundwater cards need Canadian sources (ECCC hydrometric answered; Ontario's groundwater network PGMN: not tried).
9. Units are US customary (ft3/s, ft): convert for display.

## Recommendation

Use the new Water Data APIs (v1): `monitoring-locations` by box to find the nearest stream gauge, `latest-continuous` for the live reading, and the Statistics API `observationNormals` for the normal on this date; skip the legacy services, which are being switched off.
Show US farmers "nearest river: level and flow now, and how far above or below normal for today"; for Ontario show the same card from Environment Canada's hydrometric service instead, and hide the card where no gauge is near.

## How Crophalo uses it

Crophalo does not use it yet. The only USGS services Crophalo uses are for terrain height (3DEP getSamples, exportImage and the 1/3 arc-second tiles). River flow, groundwater wells and water quality are not used; Crophalo's water information comes from GRACE-FO, SMAP and OPERA DSWx.
