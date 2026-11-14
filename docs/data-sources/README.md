# Data sources: what was checked on 14 November 2026

Crophalo depends on public data services. This page and the files next to it record what each one did when it was called on 2026-11-14: what answered, what was slow, what needed a key or login, and what was broken, retired or moved. It covers every resource on the challenge's list (24 resources, 359 routes found behind them).

It is one day's picture. Services change. Every figure here is a result seen on 2026-11-14, not a promise.

## How the check was done

- **First check.** Each route was tried once from a Mac, for two test places: Barrie, Ontario (44.40, -79.78) and Ames, Iowa (42.03, -93.62). Some resources used a nearby test spot as well; each file says which.
- **Second check.** Every route reported as working or broken was then tried again by a second, independent check later the same day (about 18:54 to 19:20 UTC). It used no keys and no logins, a 60-second limit and one call per request. Where its result differs from the first check, both are shown, and each file has a short "Where the second check differed" list. Where a row says "not repeated" or "not tried", the second check did not call that route. OpenET had no second check; its file says so.
- Both checks sent the HTTP header `User-Agent: Crophalo (research)`.
- Each result is marked with how it is known:
  - **checked** = the request was sent on 2026-11-14 and the answer was seen;
  - **read** = read in the service's documentation on 2026-11-14;
  - **I think** = from memory, not confirmed on 2026-11-14.
- No key, token or password appears anywhere in these files.

## Totals (359 routes found behind the 24 resources; status from the first check)

| State | Routes |
|---|---|
| Works | 164 |
| Works but slow (over about 10 s) | 23 |
| Needs the NASA Earthdata login (added to Crophalo on 2026-11-14, so these can now be used) | 32 |
| Needs a free key or account that Crophalo has not created yet | 32 |
| Broken, retired or moved on 2026-11-14 | 49 |
| No API at all (website or download only) | 31 |
| Not tried | 28 |

The second check repeated the working and broken routes; where it saw something different, the resource file says so.

## Problems that matter for Crophalo

- **NASA POWER:** its soil-moisture and groundwater fields return "no value" (-999) for every day at Barrie and Ames. Use SMAP and GRACE for those, not POWER. POWER's temperature, rain and sunshine work. ([nasa-power.md](nasa-power.md))
- **NASA fire hot spots (FIRMS):** the Suomi NPP satellite stopped sending on 2 November 2026; its file is empty. Use the NOAA-20 and NOAA-21 files instead. ([modis-viirs.md](modis-viirs.md))
- **NASA GES DISC (rain and land water):** the Data Rods service, the old OPeNDAP server and the GrADS server are retired. The new route is Earthdata Cloud OPeNDAP, with the NASA Earthdata login. ([nldas-gldas.md](nldas-gldas.md), [gpm-imerg.md](gpm-imerg.md))
- **SMAP soil moisture through ORNL:** no data for Barrie on 2026-11-14 (the second check could not reach the service at all). Crophalo plans to read the NASA files directly with its NASA Earthdata login. ([smap.md](smap.md))
- **SMAP at 1 to 3 km:** nothing current is finer than 9 km (the finer products ended in 2024 and July 2026). ([smap.md](smap.md))
- **ECOSTRESS water use (ALEXI):** United States only, and nine months old at Ames. ([ecostress.md](ecostress.md))
- **PRISM (USA climate):** the old service is retired; the new one works. ([prism.md](prism.md))
- **USGS groundwater levels (NWIS):** the old route is retired; the new Water Data API works. ([nwis.md](nwis.md))
- **CropScape viewers:** now behind a sign-in; the crop-map data service itself was checked separately. ([cropland-data-layer-cropscape.md](cropland-data-layer-cropscape.md))
- **NAIP aerial photos (USA):** three of the old hosts are gone; four routes work but slowly. ([naip.md](naip.md))
- **USDA Market News:** its website did not answer on 2026-11-14; the old text reports stopped in 2020. ([usda-ams-market-news.md](usda-ams-market-news.md))
- **USDA Ag Data Commons:** blocks scripts with a robot check; only a browser can read it. ([ag-data-commons.md](ag-data-commons.md))
- **FAO crop suitability (GAEZ):** its map server answered "server error" twice; the data files work. ([gaez.md](gaez.md))
- **Ontario:** many US sources (PRISM, NLCD, NAIP, LANDFIRE, NWIS, NASS, Market News, OpenET) do not cover Canada; for Ontario fields Crophalo plans to say so plainly.

Three findings from the second check are worth knowing too:

- **Canada's crop map works.** The AAFC Annual Crop Inventory answered without a key at the address in its open.canada.ca record (Barrie: value 122, "Pasture/forages"). It is the Ontario twin of the US Cropland Data Layer. ([usda-nass-quickstats.md](usda-nass-quickstats.md))
- **CropScape's point service is unstable.** It answered in about 2 s in one second-check run and timed out on every call in the other. USDA's CroplandCROS service gives a field's whole crop history in one call of about 0.3 s. ([cropland-data-layer-cropscape.md](cropland-data-layer-cropscape.md))
- **FAO's crop-suitability map tiles work** with the address template from the service's own capabilities file; only the template printed in FAO's catalogue is wrong. ([gaez.md](gaez.md))

## Free keys or accounts Crophalo could add

| For | Where | What it takes |
|---|---|---|
| USDA NASS QuickStats (county yields) | https://quickstats.nass.usda.gov/api | an email address; the key arrives by email |
| USDA Market News (prices) | https://mymarketnews.ams.usda.gov/ | free account; key on the profile page |
| OpenET (field water use, western USA) | https://account.etdata.org/register | free account; key in the dashboard |
| NASA FIRMS (fire map service) | https://firms.modaps.eosdis.nasa.gov/api/map_key/ | free; the public fire files need no key |
| NOAA weather records (CoCoRaHS gauges) | https://www.ncdc.noaa.gov/cdo-web/token | free token by email |
| Copernicus (Sentinel-2 directly, ERA5) | https://dataspace.copernicus.eu/ and https://cds.climate.copernicus.eu | free; optional (NASA's HLS already brings Sentinel-2 with the NASA Earthdata login) |
| USGS (Landsat and NAIP downloads) | https://ers.cr.usgs.gov/register | free; optional |

Avoid: OpenTopography's key may not be used inside a public or commercial app without a paid plan; AWS "requester pays" buckets bill whoever reads them.

## Terms in short

NASA data is free and open (cite the dataset; no NASA endorsement implied). USDA and USGS data is public domain.
Copernicus data is free with a credit line. Open-Meteo's free plan is non-commercial only (fine for the free launch; a paid plan is needed before any money or adverts). The per-resource files list each credit line, and the exceptions (for example GAEZ v4 and EOX tiles are non-commercial, and OpenET's terms need written consent for any app).

## How to repeat a request

Every resource file has a table of routes. For each route, the **Exact request** column holds the request that was sent.

1. **Build the address.** If the request starts with `?`, `/` or `...`, join it to the address in the **Route** column of the same row. Words in braces, such as `{lon},{lat}` or `<granule>`, are placeholders shown in the route; the request column gives the real values used.
2. **GET requests.** Paste the address into a browser, or run:
   `curl -sS -A "Crophalo (research)" -o answer.out -w "%{http_code} %{time_total}s %{size_download}B\n" "<address>"`
3. **HEAD and range requests.** Where the request says `HEAD`, add `-I`. Where it says `Range: 0-1023` or "first 1 kB", add `-r 0-1023`.
4. **POST requests.** The body is given in the row. Run:
   `curl -sS -A "Crophalo (research)" -X POST -H "Content-Type: application/json" -d '<body>' "<address>"`
5. **Routes that need a login or key.** Without one, you should see the same refusal that is recorded (for example a 302 to `urs.earthdata.nasa.gov`, or a 401/403). To get the data itself, use your own free account; never paste a key into these files.
6. **Compare.** Status codes, sizes and newest dates are the things to compare. Times will differ from run to run; the two checks themselves often differ.

A few requests were not kept in full on 2026-11-14 (for example the Soil Data Access SQL text, which shows `...`); the file says so where this is the case.

## Resources and their files

| Resource | File | Covers Ontario |
|---|---|---|
| SMAP soil moisture and freeze/thaw | [smap.md](smap.md) | yes |
| NASA POWER agroclimatology | [nasa-power.md](nasa-power.md) | yes |
| GPM / IMERG satellite rain | [gpm-imerg.md](gpm-imerg.md) | yes |
| Landsat and HLS | [landsat.md](landsat.md) | yes |
| MODIS and VIIRS (greenness, fires) | [modis-viirs.md](modis-viirs.md) | yes |
| ECOSTRESS (ground heat, water use) | [ecostress.md](ecostress.md) | yes (not the ALEXI products) |
| GEDI (tree height, biomass) | [gedi.md](gedi.md) | yes, south of 51.6 N |
| SRTM, NASADEM and ASTER elevation | [srtm-nasa-elevation.md](srtm-nasa-elevation.md) | yes |
| NLDAS and GLDAS land models | [nldas-gldas.md](nldas-gldas.md) | yes |
| Copernicus Sentinel-2 and ERA5 | [copernicus-sentinel-2-and-era5.md](copernicus-sentinel-2-and-era5.md) | yes |
| FAO GAEZ crop suitability | [gaez.md](gaez.md) | yes |
| CoCoRaHS rain gauges | [cocorahs.md](cocorahs.md) | yes |
| Cropland Data Layer, CropScape, CroplandCROS | [cropland-data-layer-cropscape.md](cropland-data-layer-cropscape.md) | no (Canada's AAFC inventory: yes) |
| USDA NASS QuickStats | [usda-nass-quickstats.md](usda-nass-quickstats.md) | no |
| USDA AMS Market News | [usda-ams-market-news.md](usda-ams-market-news.md) | no |
| USDA Ag Data Commons | [ag-data-commons.md](ag-data-commons.md) | no (not location-based) |
| Web Soil Survey and Soil Data Access | [web-soil-survey.md](web-soil-survey.md) | no |
| SSURGO and STATSGO2 soils | [ssurgo-statsgo2.md](ssurgo-statsgo2.md) | no |
| PRISM climate grids | [prism.md](prism.md) | no |
| NAIP aerial photos | [naip.md](naip.md) | no |
| NLCD land cover | [nlcd.md](nlcd.md) | no |
| LANDFIRE vegetation and fuels | [landfire.md](landfire.md) | no |
| USGS water data (NWIS) | [nwis.md](nwis.md) | no (Canada's ECCC hydrometric service: yes) |
| OpenET field water use | [openet.md](openet.md) | no |
