# Crophalo

Crophalo helps a farmer compare crop rotations for one field. You pick the field on a map, answer four short questions
(what you grow, water and soil, what matters to you), and Crophalo reads the field's own weather record from NASA and
shows which rotation suits the field, why, and how the ground would be covered through the year. You can keep the field
in My Farm and look at it on a map board or in 3D. Everything works without signing in, and your fields are kept on your own computer.

Crophalo is a guide to think with, not advice. It shows "not read yet" for anything it has not read, and never a made-up number.

We built it for the NASA Space Apps Challenge 2026, "Field Shift", in Toronto.

## Try the demo

Start Crophalo, then open the demo field in Oxford County, Ontario, from the home screen. You go through the same four steps a
farmer would, with the answers already chosen (corn then soybeans, rain-fed, loam). Change any of them if you like, then
open the field report. From there, "Add to My Farm" opens the same field on the map board, where you can compare plans and
see it in 3D.

## Where the data comes from

- **NASA POWER:** daily weather for the field since 2001 (frost dates, heat, rain).
- **NASA SMAP:** root-zone soil moisture.
- **NASA GPM IMERG:** recent rain.
- **NASA GRACE-FO:** groundwater change.
- **NASA ECOSTRESS and HLS:** crop stress and greenness.
- **Other open sources:** Open-Meteo forecasts, SoilGrids soil, the Agriculture and Agri-Food Canada crop inventory, FAOSTAT yields and World Bank prices.

Every figure in the app has an "i" button that names its source and date. The full list, with citations, is in
`docs/nasa-data-used.md` and `docs/data-sources/`. Crophalo uses NASA data but is not made, reviewed or endorsed by NASA.

## Start it

**Mac.** Double-click `Start Crophalo.command`. A Terminal window opens: keep it open, closing it stops Crophalo. The first
start sets up its own Node and Python inside the folder (a few minutes, once), then opens `http://localhost:5480/` in your
browser. To add or change your free NASA Earthdata login, double-click `Start Crophalo (Add NASA login).command`.

**Windows.** Double-click `Start Crophalo.bat`. Keep its window open. To add the NASA login, use
`Start Crophalo (Add NASA login).bat`. `scripts/WINDOWS-CHECKLIST.md` lists what to check on a new PC.

The NASA login is only needed for the SMAP soil-moisture reading and some height maps; the rest works without it.
To move Crophalo to another computer, read `MOVING.md`.

## Run the checks

    sh scripts/check.sh              every suite, in one order, stopping at the first failure
    E2E=0 sh scripts/check.sh        the offline suites only (no browser)
    NET=1 sh scripts/check.sh        also the back-up weather suite, which asks the internet once and keeps the answers

Each suite prints "N passed, M failed" as its last line. One suite alone: `node scripts/test_engine.mjs`. The browser suites
(`e2e.mjs`, `e2e_flow.mjs`, `e2e_map.mjs`, `e2e_farm.mjs`, `e2e_farm3d.mjs`) drive Chrome or Edge on a throwaway copy of the
app on a port of their own (set it with `E2E_PORT=5701`); they never touch the copy you are using. Run them one at a time.
The lookups and their suites use the folder's own Python: `FW_PYTHON=.venv/bin/python`.

## What is in the folder

| Where | What |
|---|---|
| `index.html`, `design.html` | the one page of the app; the page of looks (colours, type, controls) |
| `css/` | `app.css` (the looks every screen shares) and one sheet per screen: setup, map, report, weather, calendar, satellites, field, pages, sources, region, farm, farm3d, soiltest, remind, fieldcard, statement |
| `js/app.js` | the page start: views, the top bar, Back, and the joins between the parts |
| `js/home.js`, `welcome.js`, `places.js`, `saved.js`, `listen.js`, `toast.js` | the home screen, the welcome sheet, place search and coordinates, saved fields, read aloud, the one-line notices |
| `js/wizard.js`, `steps.js`, `state.js`, `croppicker.js` | the four setup steps, their rules, the answers and share links, the crop chooser |
| `js/mapx.js`, `geo.js`, `spotcard.js`, `cardplace.js`, `weather.js`, `sun.js` | the setup map (pin, rectangle, outline), outline maths, the spot card (weather, area, sun) |
| `js/data.js`, `climate.js` | NASA POWER daily weather since 2001 (with the ERA5 back-up record) and the climate worked out from it |
| `js/crops.js`, `pics.js`, `season.js`, `fit.js`, `sure.js`, `engine.js`, `nearby.js` | the crop table, crop pictures, sowing windows, fit checks, the stress test over past years, the report engine, the "grown nearby" gate |
| `js/report.js`, `report-view.js`, `report-load.js`, `joins.js`, `weather-data.js`, `weather-view.js`, `calendar-data.js`, `calendar-view.js` | the field report and its Overview, Options, Weather and Calendar tabs |
| `js/sources.js`, `sources.more.js`, `srci.js`, `region.js`, `pages.js` | the source cards behind every "i", the regional-reading card, the Data page |
| `js/satellites-data.js`, `satellites-view.js`, `satellites2-data.js`, `satellites2-view.js`, `field-data.js`, `field-view.js`, `near-load.js`, `memo.js`, `outline.js` | the report's Satellites & prices tab (NASA GPM IMERG rain, GRACE-FO water storage, ECOSTRESS ground temperature, HLS greenness), its Field tab (slope, height, soil, outline), the crop map of farms nearby, and the lookups shared between the tabs |
| `js/pages-info.js`, `pages-view.js`, `privacy.js`, `backup.js`, `units.js`, `currency.js`, `admin-view.js` | the Privacy, Limitations and Settings pages: what stays on the device and what is sent, deleting, backup and restore, units, currency, and the read-only Admin panel (no password) |
| `js/farm.js`, `simulate.js`, `farmio.js`, `fielddrawer.js`, `fieldedit.js` | My Farm: the farm store, the map board, Compare plans, editing a field, map files and spreadsheets |
| `js/farm3d.js`, `farm3d-data.js`, `heights3d.js`, `shade.js`, `shade-worker.js`, `moon.js` | the 3D field look, land heights, shade and the sun's and moon's place |
| `js/soiltest.js`, `soiltestui.js`, `remind.js`, `remind-plan.js`, `remind-sw.js`, `sharetext.js`, `statement.js`, `fieldcard.js`, `discuss.js`, `notice.js`, `exports.js` | soil-test rules and form, reminders, share texts, the season weather record, the printed field card, spreadsheets |
| `data/regions.json` | the demo region: Oxford County, Ontario, with its answers already chosen |
| `scripts/serve.mjs` | the server: the app's files, `/api/health`, `/api/sources`, the live lookups, reminders (`/api/push/*`) and US drought weeks (`/api/drought`) |
| `scripts/live/` | the Python lookups: `smaproot.py` (NASA SMAP), `imergrain.py` (NASA GPM IMERG rain), `gracecell.py` (NASA GRACE-FO), `ecopass.py` (NASA ECOSTRESS), `hlsndvi.py` (NASA HLS greenness), `dem.py` and `heights.py` (land heights), `cropsnear.py` (crop maps), with `common.py`, `dap4.py` and `README.md` |
| `scripts/test*.mjs`, `scripts/e2e*.mjs`, `scripts/check.sh` | the suites and the one check; `scripts/fixtures/` holds recorded answers of the outside services |
| `scripts/run.sh`, `start-windows.ps1`, `earthdata.mjs`, `preflight.mjs`, `vendor.mjs`, `portable.sh`, `pack-runtimes.sh` | the starters, the NASA login, the start checks, the bundled libraries, the portable copy |
| `vendor/` | Leaflet, MapLibre and three.js, kept in the folder (no build step, no packages) |
| `docs/nasa-data-used.md` | the NASA data Crophalo uses, with credit and links |
| `LICENSE` | the Apache License 2.0, the licence of Crophalo's own code (see "Licence" below) |

## What works today

- The home: search a place or type coordinates, use the demo card "Oxford County, Ontario", open a saved field.
- Setup in four steps, with the map to pin the field or draw it. The demo region has its answers already chosen (corn then soybeans,
  rain-fed, loam assumed); you click through the same steps a farmer does.
- The field report: Overview (one recommendation, why it suits the field, and the comparison with the current rotation),
  Options (the plans side by side), Weather (the field's record, this year so far, the next 7 days, the regional SMAP
  soil-moisture card), Calendar (the farming year and the ground month by month), Field (outline, slope, height and soil)
  and Satellites & prices (NASA GPM IMERG rain, GRACE-FO water storage, ECOSTRESS ground temperature, HLS greenness, and
  the crop map of farms nearby). Every figure has an "i" with its source, NASA first. History is written as counts over the
  tested years, never as a chance.
- A kept copy of the app for working offline, with a bar that says when you are offline.
- "Add to My Farm" opens the same field in My Farm: the map board, one date, one finding, Compare plans (current and proposed,
  each marked Planned), the 3D look of the same field and date, and editing the field.
- The Data page lists every source, with the NASA line and the link to `docs/nasa-data-used.md`.
- The server runs the live lookups (SMAP root-zone moisture, land heights) one question at a time, keeps each answer for its
  time, and says plainly when it is busy or a lookup failed.

## What is not built yet

- The report's Notes & to-do tab says "Not built yet".
- The soil-test form, the screens that set a reminder and the Share or print menu: their rules and texts are written and
  tested, and the server routes for reminders and drought weeks answer, but no screen shows them yet.
- Safari and Firefox have not been run through the browser suites; Chrome has.

## NASA data used

- **NASA POWER** daily weather since 2001 for the field's point: frost dates, heat units, rain timing, the climate record and
  the weather of this year so far.
- **NASA SMAP Level-4** root-zone soil moisture: one regional value for the 9 km cell that holds the field, shown with its
  footprint and date, never as a pattern inside the field.
- **NASA GPM IMERG** rain and the **MERRA-2** model: POWER takes its daily rain from IMERG where it has enough days and
  from MERRA-2 where it has not, and the report says which one it used.

Credit, links and what each one feeds: [docs/nasa-data-used.md](docs/nasa-data-used.md). Crophalo is not made, reviewed or
endorsed by NASA.

## Licence

Crophalo's own code, tests and documents are open source under the Apache License, Version 2.0. The full text is in
`LICENSE`. Copyright 2026 the Crophalo team.

The libraries kept in the folder stay under their own licences. Each licence text sits beside its library:

| Library | Licence | Where its licence text is |
|---|---|---|
| Leaflet 1.9.4 | BSD 2-Clause | `vendor/leaflet/LICENSE` |
| MapLibre GL JS 4.7.1 | BSD 3-Clause | `vendor/maplibre/LICENSE.txt` |
| MapLibre GL Leaflet 0.0.22 | ISC | `vendor/maplibre/LICENSE-leaflet-plugin.txt` |
| three.js r160 | MIT | `vendor/three/LICENSE` |
| axe-core 4.14.0 (used by the test suites only, not part of the app) | MPL 2.0 | `scripts/vendor-test/LICENSE-axe-core.txt` |

The data is not ours. Every source keeps its own terms, and each one is named, with its credit and link, on the app's
Data page and in `docs/`.

## Use of Super Intelligence (SI) tools

We used Super Intelligence (SI) coding tools to help write Crophalo's code (including the icons and drawings that are made
in code), its tests and its documents. Our team chose what to build, directed the work, and reviewed and tested the result.

Crophalo itself does not use SI or machine learning to work out its answers: it uses fixed rules and counts over the public
data named above. Some of that data (for example the crop maps and the SoilGrids soil map) is made by its publishers with
machine-learning methods, as their own documents describe.

## Changes

- **2026-11-14.** The parts of Crophalo brought together in one folder: the home and setup with its map, the weather record,
  the crop table and report engine, the field report with Overview, Options, Weather and Calendar, the source cards and Data
  page, My Farm with Compare plans, the 3D field look, and the server's live lookups for SMAP soil moisture and land heights in
  one runner. The demo region is Oxford County, Ontario.
