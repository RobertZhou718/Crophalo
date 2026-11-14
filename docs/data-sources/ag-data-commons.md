# USDA Ag Data Commons

First check on 2026-11-14, about 18:34 to 19:00 UTC; second check about 19:09-19:20 UTC. No key, no login.
Words used: **checked** = called on 2026-11-14 and the answer was seen; **read** = read in documentation on 2026-11-14; **I think** = not verified on 2026-11-14.

Back to the [overview](README.md).

## What it is

The USDA National Agricultural Library's catalogue and repository of USDA-funded research data (dataset records, files, DOIs). Since 2024 it runs on Figshare, so its API is the Figshare API.
It is a library of research datasets (mostly plot trials and studies), not a per-field data service: nothing in it answers "what is at this latitude and longitude".

## Routes

| Route | What it returns | Key or login | Exact request | First check (2026-11-14) | Second check (2026-11-14) | Covers Ontario | Useful to a farmer for |
|---|---|---|---|---|---|---|---|
| Figshare API, search inside Ag Data Commons: `POST https://api.figshare.com/v2/articles/search` | JSON list of records (id, title, DOI, group_id, public page address) | none for public reads | body `{"search_for":"crop rotation","group":51648,"page_size":5,"item_type":3}` | 200, 0.6 s, 5.2 kB, **checked**. `group` 51648 is the Ag Data Commons group (checked on a record). Search is loose: `":title: Crop Sequence"` returned unrelated records | 200, 1.7 s, 5,187 B (first hit is an unrelated psyllid dataset: search is loose). Same | not location-based (US research) | finding published rotation trials (yield, profit, soil health under rotations) |
| Figshare API, one record: `GET https://api.figshare.com/v2/articles/{id}` | Full metadata: description, licence, files with download addresses, custom fields (data contact, use limitations, dates) | none | `GET https://api.figshare.com/v2/articles/28677236` | 200, 1.8 s, 23.8 kB, **checked**. Licence field said CC0 | 200, 1.6 s, 23,780 B. Same | no | reading one study's tables behind a "why rotate" explanation |
| Figshare file download: `https://ndownloader.figshare.com/files/{fileId}` | The data file (CSV, XLSX...). Redirects to a short-lived signed Amazon S3 address | none | `GET https://ndownloader.figshare.com/files/60581195` with `Range: bytes=0-1023` | 206, 0.7 s, 1,024 B, **checked** (range requests honoured; the signed address expires after 10 s) | 206, 2.1 s, 1,024 of 4,522 B via a signed S3 address that expires after 10 s. Same | no | the numbers themselves |
| Figshare API, wrong filter tried first: `institution=1072` | nothing | none | `POST .../articles/search` body `{"search_for":"crop rotation","institution":1072,"page_size":3}` | 200 but `[]`, **checked**. 1072 was a guess and is wrong; the Ag Data Commons institution id is **not confirmed**. Use `group: 51648` | 200, `[]`. Same | - | - |
| Figshare OAI-PMH: `https://api.figshare.com/v2/oai` | Harvestable metadata (Dublin Core and others) | none | `?verb=Identify` and `?verb=ListSets` | 200, 0.6 s / 1.2 s, **checked**. First page of sets lists `item_type_*` and `portal_895`, `portal_904`; which set is Ag Data Commons is **not confirmed** | Identify 200, 859 B; ListSets 200, 3,976 B. Same | no | bulk copy of the catalogue (not needed by Crophalo) |
| Website `https://agdatacommons.nal.usda.gov/` | Human pages | none, but a JavaScript bot challenge | `GET https://agdatacommons.nal.usda.gov/` | **202, 0 bytes, header `x-amzn-waf-action: challenge`**, 0.6 s, **checked**: scripts cannot read the site pages; links to it still work in a browser (I think) | 202, 0 bytes, `x-amzn-waf-action: challenge`. Same | - | linking the farmer to a study |
| Old site and API `https://data.nal.usda.gov/` (CKAN/DKAN `api/3/action/...`, `data.json`) | was the old catalogue API | - | `GET https://data.nal.usda.gov/api/3/action/package_search?q=crop+rotation&rows=2`, `GET https://data.nal.usda.gov/data.json` | both redirect to the HTML page `https://www.nal.usda.gov/services/agdatacommons` (200, 44 kB of HTML, no JSON), **checked**: **retired** | redirect to `https://www.nal.usda.gov/services/agdatacommons`, 200, 44 kB HTML. Same | - | - |
| data.gov catalogue API `https://catalog.data.gov/api/3/action/package_search` | was a federal-wide CKAN search that also listed these records | none | `?q=%22Ag+Data+Commons%22+crop+rotation&rows=2`, then `?q=agdatacommons&rows=1`, then `/api/3` | **404 `{"detail":{},"message":"Not Found"}`** three times, **checked**. What replaced it is **not confirmed** | The plain documentation example (`package_search?q=soil&rows=1`) also answers 404 `{"detail":{},"message":"Not Found"}`: the CKAN action API at catalog.data.gov is gone, not just the query wrong | - | - |
| NASA routes (CMR, GIBS, AppEEARS, Giovanni, Data Rods) | - | - | not tried | Ag Data Commons is not a NASA holding; none expected (**I think**) | not tried | - | - |

Datasets seen that speak to crop rotations (all **checked** as search results, titles only; their contents not read):
- 27207915 "Data from: Yield and profit comparison of diversified versus conventional crop rotation systems in South Dakota"
- 25383307 "Data from: Diversified grain rotations can be highly and reliably productive in unstable climates"
- 24665628 "Data from: Measured and simulated carbon dynamics in Midwestern US corn-soybean rotations"
- 33973981 "Soil health indicators during a 3-year transition from a conventional to a regenerative corn-soybean system"
- 24856911 "Data from: Carbon Fluxes from a Spring Wheat-Corn-Soybean Crop Rotation Under No-Tillage Management"
- 33329976 "Data from: Managing Cover Crop Mixtures over a Decade Via Species Replacement and Seeding Rate Adjustment"
- 28677236 "Data from: Soil strength after 21 years of conventional and organic cropping practices in the Mid-Atlantic region, USA" (CC0; 13 files; the record fetched in full)

No national, map-like rotation product was found here (the NASS Crop Sequence Boundaries and the Cropland Data Layer live at NASS, see [cropland-data-layer-cropscape.md](cropland-data-layer-cropscape.md)).

## Where the second check differed

- data.gov: the plain documentation example also answers 404, so the CKAN action API at catalog.data.gov is gone, not just the query wrong.
- Everything else matched.

## Terms

- Policy page `https://www.nal.usda.gov/services/agdatacommons/policies` (**read**): the repository "encourages the Creative Commons CCZero public domain dedication", accepts data that complies with US Federal Open Data policies, and "excludes data with burdensome restrictions". The licence is **per dataset**: read the `license` field of each record (the sample was CC0).
- Free public site: yes for CC0 / US public domain records (check each record's licence). Business: same, per record.
- Credit line: each record carries a DOI and a `citation` field; cite that (read in the record JSON).
- Rate limits, Figshare API docs `https://docs.figshare.com/` (**read**): no automatic rate limiting; they "recommend that clients ... do not make more than one request per second" and reserve the right to throttle or block.

## Problems

- `agdatacommons.nal.usda.gov` answers scripts with an AWS bot challenge (202, empty body).
- The old `data.nal.usda.gov` API and `data.json` are gone (redirect to an information page).
- `catalog.data.gov/api/3/action/package_search` answered 404 on three tries, and its own documentation example also gave 404.
- Figshare search does not filter strictly on `:title:`; expect unrelated hits and filter in code.
- The Ag Data Commons institution id for the `institution` filter is not confirmed; the `group` filter works.

## Recommendation

Do not wire this in as live field data: it has no location query and nothing for Ontario. If used at all, use `POST https://api.figshare.com/v2/articles/search` with `group: 51648` (at most one request a second, cached) to show a short "studies behind this advice" list with DOI links on the rotation pages.

## How Crophalo uses it

Crophalo does not use it yet.
