# USDA AMS Market News (MARS / My Market News API)

First check on 2026-11-14. Second check on 14 November 2026, about 18:54 to 19:10 UTC, one call per request, 60 s limit, no keys, no logins. Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read in documentation on 2026-11-14; **I think** = from memory, not confirmed on 2026-11-14.

Back to the [overview](README.md).

## What it is

USDA's Agricultural Marketing Service publishes what US buyers paid or bid that day or week: cash grain bids by state, livestock auctions, hay, fruit and vegetable terminal markets, organic, dairy, cotton. MARS is the database behind it and My Market News is its public face.
It is a US price service: no Ontario or Canadian market in it could be confirmed.

## Routes

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| MARS API v1.2 `https://marsapi.ams.usda.gov/services/v1.2/reports` (+ `/reports/{slug_id}`, `/commodities`, `/offices`, `/marketTypes`: these four read in a search result quoting the official page, not opened) | JSON rows of a report: commodity, location, bid, basis, date | **Key needed.** Free. Made inside a My Market News account (`https://mymarketnews.ams.usda.gov/`, "My Profile"); sent as the HTTP basic-auth user name with an empty password (read via a search result of `mymarketnews.ams.usda.gov/mymarketnews-api/authentication`) | `GET https://marsapi.ams.usda.gov/services/v1.2/reports` (no key) | **403** in 0.3 s, 252 bytes: `{"errorCode":403,"message":"Access is denied","detail":"Attempt to access the protected resource. Please use HELP LINK ... https://marsapi.ams.usda.gov/services/help"}` (checked) | not repeated | no | the local cash price and basis for corn, soybeans, wheat, hay in a US state |
| MARS API v1.1 `…/services/v1.1/reports` | same, older version | key | `GET …/services/v1.1/reports` | **403**, same body (checked) | not repeated | no | same |
| MARS **public** routes v3.1 (no key): `/services/v3.1/public/listPublishedReports?format=json`, `/listPublishedReports/{nbrOfDays}`, `/listPublishedReport/{slug_id}`, `/listCorrectedReports`, `/listCorrectedReports/{nbrOfDays}` | Only the list of reports: id, file name (`ams_2850`), title, published time, begin/end date, correction flag. **No prices.** | none | `GET https://marsapi.ams.usda.gov/services/v3.1/public/listPublishedReport/2850?format=json` and `…/listPublishedReports/1?format=json` | **200**, 0.17 s, 348 bytes: "Iowa Daily Cash Grain Bids", published 2026-11-13; the 1-day list **200**, 0.13 s, 105 kB, 351 reports (checked) | 2850: 200, 0.34 s, 348 B: Iowa Daily Cash Grain Bids, published 2026-11-13 13:36 MST, file ams_2850.pdf. 1-day list: 200, 1.02 s, 105.3 kB, numberOfReports 352 (one more was published). Titles and dates only, no prices | no | knowing that a new report is out and its date, then linking to the PDF |
| Help index `https://marsapi.ams.usda.gov/services/help` and `/help/more` | JSON list of the public routes above | none | `GET …/services/help/more` | **200**, 0.08 s, 1.5 kB (checked) | 200, 0.08 s, 1483 B, 7 routes, all marked "Public" | n/a | nothing; for the developer |
| Published report files `https://www.ams.usda.gov/mnreports/ams_{slug}.pdf` | The report as a PDF (the page a farmer already knows) | none | `GET https://www.ams.usda.gov/mnreports/ams_2850.pdf` (first 2 kB) | **206**, 0.34 s, valid PDF (checked). `ams_2850.txt` is **404** (checked): the new reports have no text twin | 206, 0.17 s, starts %PDF-1.7. ams_2850.txt: 404, 0.47 s | no | a link "open today's Iowa cash grain bids" |
| Legacy text reports `https://www.ams.usda.gov/mnreports/gx_gr113.txt` style | Old fixed-width text | none | `GET https://www.ams.usda.gov/mnreports/gx_gr113.txt` | **200**, 1.1 kB, but the content is **frozen at 24 July 2020** with a text saying that grain reports moved to MARS (checked) | 200, 0.28 s, 2629 B, dated Fri Jul 24, 2020, with the same text. Stale | no | nothing: stale |
| MPR Datamart API `https://mpr.datamart.ams.usda.gov/services/v1.1/reports` (+ `/reports/{slug}?q=report_date=MM/DD/YYYY`) | JSON of the Livestock Mandatory Reporting reports (cattle, hogs, boxed beef, lamb) | **none** | `GET …/services/v1.1/reports` and `…/reports/2451?q=report_date=11/13/2026` | **200**, 4.6 s, 68.6 kB list; report **200**, 1.3 s, 1.1 kB with the row for 2026-11-13 (checked) | list 200, 2.56 s, 68.6 kB; report 2451 200, 0.16 s, 1097 B, one row for 11/13/2026 (boneless beef). Livestock only | no | livestock prices only; nothing for a crop rotation |
| AgTransport open data (AMS Transportation, Socrata) `https://agtransport.usda.gov/resource/{id}.json`: Grain Prices `g92w-8cn7`, Grain Basis `v85y-3hep`, Grain Price Spreads `an4w-mnp7`, Commodity Price Spreads `ecws-wvgk`, barge rates `7spn-fbua`, cost indicators `8uye-ieij` (41 items in its catalogue) | Weekly JSON/CSV rows: date, region ("Washington", "Southeast"…), commodity, elevator bid in US$/bushel, lat/lon of the region, futures price, basis | **none** (Socrata app token optional) | `GET https://agtransport.usda.gov/resource/g92w-8cn7.json?$limit=3&$order=:id DESC` and the same for `v85y-3hep`; catalogue `GET https://agtransport.usda.gov/api/catalog/v1?domains=agtransport.usda.gov&search_context=agtransport.usda.gov&q=grain price` | **200**, 0.43 s, 1.0 kB; newest rows dated 2026-11-06, updated 2026-11-12; basis **200**, 1.1 s (checked). Each row says `"source":"GeoGrain Subscription"` | g92w-8cn7: 200, 0.57 s, 1017 B; elevator bids, newest 2026-11-06, source "GeoGrain Subscription". v85y-3hep: 200, 0.67 s, 1208 B; bid, contract_month, futures_price, basis | no | **the only keyless machine-readable US grain bid and basis found**: weekly, about a dozen regions, corn, soybeans and wheat classes |
| My Market News website `https://mymarketnews.ams.usda.gov/` (`/public_data` search, `/filerepo/reports`, `/viewReport/{slug}`, API documentation pages) | Web pages, report search, documentation | none to read; account for the key | `GET https://mymarketnews.ams.usda.gov/mymarketnews-api` (curl twice, a second fetcher twice) | **Did not answer**: HTTP/2 INTERNAL_ERROR at once, then 60 s and 30 s time-outs with 0 bytes; the second fetcher also timed out at 60 s (checked). So the documentation, the terms and the sign-up page were **not read** | `/mymarketnews-api`: curl error 92, HTTP/2 INTERNAL_ERROR after 0.06 s, 0 bytes. `https://mymarketnews.ams.usda.gov/` over HTTP/1.1 (second and last try): time-out at 60 s, 0 bytes. Site down; documentation, terms and key page not read | no | n/a |
| Old portal `https://marketnews.usda.gov/mnp/…` (custom reports, the fruit and vegetable portal) | used to give CSV/XML custom reports | n/a | `GET https://marketnews.usda.gov/mnp/fv-home` | **Dead**: the host name no longer resolves (checked) | host name does not resolve. www.marketnews.usda.gov: TLS "unrecognized name" after 5.2 s. Retired | no | nothing: retired |
| ESMIS (USDA library archive of reports) `https://esmis.nal.usda.gov/publication/...` | Archive pages with TXT/PDF downloads of each release | none | `GET https://esmis.nal.usda.gov/publication/grain-prices-illinois-river-barge-points` | **200**, 0.8 s, 44 kB HTML (checked). No JSON API confirmed | not repeated | no | history of one report, by hand |
| NASA catalogue CMR, AppEEARS, GIBS, Giovanni, Planetary Computer, AWS, Google | none: this is not a satellite product | | not tried | no route exists (I think) | not tried | | |

## Where the second check differed

- MARS one-day list now has 352 reports (first check 351; one more was published).
- `gx_gr113.txt` is 2.6 kB (2629 B), not 1.1 kB.
- Everything else matched.

## Terms

- Licence: US Government work, in the public domain (I think; the My Market News terms page could **not be read** because the site did not answer in either check).
- Free public site: yes (I think). Business: yes (I think). Neither confirmed in writing.
- Credit line: "USDA Agricultural Marketing Service, Market News" is the usual credit (not read).
- AgTransport rows are credited by USDA to "GeoGrain Subscription", a commercial feed that USDA republishes as regional averages (checked in the data). The AgTransport terms were not read; check before reselling these rows.
- Rate limits: none published that could be read. A third-party directory says 180 days per request and 100,000 rows per call for MARS (not confirmed). The MPR Datamart answer carries `"userAllowedRows": 99999` (checked).
- One key per account, not to be shared (read via a search result).

## Problems

- `mymarketnews.ams.usda.gov` (the site with the documentation, the terms and the key sign-up) hung or broke the connection on every try, from two different clients, in both checks.
- `marketnews.usda.gov` (the old portal that many older guides link to) no longer exists in DNS.
- The legacy `.txt` reports are frozen at 2020; the new `ams_NNNN` reports exist only as PDF without a key.
- The keyless v3.1 "public" routes list reports but carry no prices: the prices need the key.
- Not global and not Canadian: a farmer in Barrie gets nothing from it. Ontario cash prices would have to come from elsewhere (Statistics Canada, Grain Farmers of Ontario, Agricorp: none checked here).

## Recommendation

For US fields only, and only once a free My Market News key exists: read the state's daily cash grain bid report from MARS v1.2 through the server and show "Local cash price today: corn US$X.XX a bushel, basis −0.35 (USDA Market News, Iowa, 13 Nov)". Until a key exists, the keyless AgTransport weekly regional bid and basis (`g92w-8cn7`, `v85y-3hep`) is the honest stop-gap, with a link to the AMS PDF; outside the US keep the World Bank and FAOSTAT cards.

## How Crophalo uses it

Crophalo does not use it yet. Crophalo uses the World Bank Pink Sheet (world prices) and FAOSTAT (country farm-gate prices); no local market price source is used (the WFP market-price idea was dropped).
