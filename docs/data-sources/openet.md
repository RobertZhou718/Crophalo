# OpenET

Checked on 2026-11-14. Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read in documentation on 2026-11-14; **I think** = not confirmed on 2026-11-14.

There was no second check for this resource: no second-check results exist, so that column says "no second check".

Back to the [overview](README.md).

## What it is

OpenET gives satellite estimates of how much water a field actually used (evapotranspiration, ET) at 30 m, monthly and daily, as the middle of six published models (ALEXI/DisALEXI, eeMETRIC, geeSEBAL, PT-JPL, SSEBop, SIMS) built on Landsat and gridMET weather; NASA, USGS, Google and others back it.
It covers the United States only: the FAQ still says 23 western states plus the Mississippi Alluvial Plain, while the Google Earth Engine collection is named and boxed for the whole lower 48 (CONUS). **Ontario is not covered.**

## Routes

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| OpenET API v3.2 `https://openet-api.org/` (FastAPI; spec at `/openapi.json`, console at `/`) | 20 routes (checked in the spec): `POST /raster/timeseries/point`, `/polygon`, `/multipolygon`; `/raster/geotiff/composite`, `/stack`; `/raster/export/…` (to Google Drive, tracked with `GET /raster/export/track`); `/raster/metadata`; `/raster/visual/tile_cache`, `/animate`; `/geodatabase/metadata/ids`, `/properties`, `/boundaries`, `/geodatabase/timeseries` (ready-made field outlines and their ET); `GET /account/status` (quota), `/account/storage`, `POST /account/upload`, `/account/decrypt` | **Key needed** in the header `Authorization: <key>` (no "Bearer"). Free account at `https://account.etdata.org/register` (it redirects to `auth.etdata.org/register`); keys are made in the Account Dashboard, several keys share one quota (read) | `GET https://openet-api.org/openapi.json`; `POST https://openet-api.org/raster/timeseries/point` with `{"date_range":["2024-06-01","2024-07-31"],"interval":"monthly","geometry":[-93.62,42.03],"model":"Ensemble","variable":"ET","reference_et":"gridMET","units":"mm","file_format":"JSON"}` and no key; `GET /account/status` no key | spec **200**, 0.44 s, 35.6 kB (checked). Point call **403**, 4.8 s, `{"detail":"Not authenticated"}`; account status **403**, 0.2 s, same body (checked) | no second check | no | "your field used about 620 mm of water last season; the crop needed 700": actual water use per month, by field, for irrigation planning and for comparing a rotation's thirst |
| Data Explorer `https://explore.etdata.org/` | The map viewer | **Login**: answers with a redirect to `https://auth.etdata.org/login?redirect=…` | `GET https://explore.etdata.org/` | redirect to the login page, final **200**, 0.28 s (checked). The FAQ says viewing is free (read) | no second check | no | looking by hand |
| Google Earth Engine: `OpenET/ENSEMBLE/CONUS/GRIDMET/MONTHLY/v2_0` (catalogue page marks it **deprecated**, superseded by `projects/openet/assets/ensemble/conus/gridmet/monthly/v2_0`); per-model collections too | Monthly ET images, 30 m, 1999-10 to 2024-12 on the catalogue page; box 25 to 50 N, 126 to 66 W | Google account with an Earth Engine project (free for non-commercial use; paid for commercial, I think) | catalogue page read only: `https://developers.google.com/earth-engine/datasets/catalog/OpenET_ENSEMBLE_CONUS_GRIDMET_MONTHLY_v2_0` | page read (read); no data call tried: needs a Google login | no second check | no (box stops at 50 N but the data are US only, I think) | the same figures through Google, licence stated as CC-BY-4.0 on that page |
| NASA catalogue CMR | nothing | none | `GET https://cmr.earthdata.nasa.gov/search/collections.json?keyword=OpenET&page_size=5` | **200**, 0.26 s, **0 entries** (checked): OpenET is not in NASA's catalogue | no second check | | |
| AppEEARS, GIBS/Worldview, Giovanni, Data Rods, OPeNDAP, STAC, Planetary Computer, AWS | none found for OpenET itself | | not tried | I think none exist | no second check | | |
| What covers Ontario instead (NASA, not OpenET): ECOSTRESS ET and MODIS MOD16 ET through AppEEARS (NASA Earthdata login); Crophalo already plans ECOSTRESS ground heat (see [ecostress.md](ecostress.md)) | 70 m and 500 m ET | NASA Earthdata login | not tried here | not confirmed | no second check | yes | actual water use outside the US |

## Terms

- Terms of Service `https://etdata.org/terms-of-service/`, "Last Updated: May 16, 2024" (read, quoted from the page): the licence granted is "limited, nonexclusive, non-transferable, non-sublicensable, revocable … for your own personal, noncommercial use"; users may not "Sell, resell or commercially use our Services"; may not copy, distribute or publicly display OpenET Data "without visibly attributing us as the Source URL in all instances"; and may not "Develop or use any applications that interact with our Services without our prior written consent".
- So, as written: **a free public site needs OpenET's written consent before an app calls the API; a business may not use it** without a separate agreement. Write to OpenET's support address (on etdata.org) before building.
- This clashes with the Earth Engine catalogue page, which lists the dataset licence as **CC-BY-4.0** (read). The data licence and the service terms are two different things; ask OpenET which applies to figures shown in an app.
- Credit: OpenET as the source with its address, visible wherever the data are shown (read). Citation of Melton et al. 2021 is customary (I think).
- Limits (read on `https://etdata.org/api/`): "Access to our API continues to be free", subject to quotas; up to 50,000 acres per request; up to 50 polygons per raster query; up to 100 field IDs per geodatabase query; monthly request limits apply (no number published); heavy users link their own Google Cloud project. "High load on the API can lead to access timeouts … try again in a few minutes."
- Data span (read, the pages disagree): documentation says monthly from 2000 and daily from 2016; the FAQ says API data from 2013, daily before 2024 "limited"; recent months may change for up to 6 months; goal of six weeks' latency.

## Problems

- Nothing works without an account: API 403, explorer behind a login.
- The terms forbid apps without written consent and forbid commercial use: a legal stop, not a technical one.
- Coverage statements disagree (23 western states in the FAQ; "across the United States" in the API docs; CONUS in Earth Engine). Whether Ames, Iowa is inside was not confirmed (I think it is: Iowa is one of the 23).
- No Canada: the demo field in Barrie gets nothing.
- The Earth Engine public collection is marked deprecated and ends 2024-12.
- The unauthenticated point call took 4.8 s just to refuse.

## Recommendation

Do not build on OpenET now: it does not cover the Ontario demo field and its terms need written consent for any app and bar business use. If Crophalo gets that consent and a free key, call `POST /raster/timeseries/point` (or `/polygon` with the field outline) from the server for US fields and show "Water your field actually used each month, from satellites (OpenET)" beside the crop's water need; for everywhere else use NASA's ECOSTRESS or MOD16 ET.

## How Crophalo uses it

Crophalo does not use it yet. Crophalo's water figures come from NASA POWER, GPM and Open-Meteo ET0, and ECOSTRESS ground heat (planned).
