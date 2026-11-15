# Crophalo

Crophalo helps a farmer compare crop rotations for one field. You find the field on a map and answer four short questions,
and Crophalo reads the field's own weather record from NASA and other open data, then shows which rotation suits the field,
why, and how the ground would be covered through the year. You can keep the field in My Farm, with its plans on a map board
and in a 3D view.

It is for farmers who want to weigh a change of rotation against the field's own past
weather. It has no account and no sign-in. Your fields and plans are kept only in this browser: clearing the browser's site data
deletes them, and the backup file in Settings is the one way to keep or move them.

Crophalo is a guide to think with, not advice. Anything it has not read says "Not read yet", never a made-up number.

We built it for the NASA Space Apps Challenge 2026, "Field Shift".

## Try the demo

The folder holds one demo region: Oxford County, Ontario, Canada (`data/regions.json`).

1. Start Crophalo (see "Start it" below).
2. On the home screen, open the demo card "Oxford County, Ontario", or type "Oxford" in the place search.
3. Go through the four setup steps. Three answers are already chosen: corn then soybeans, rain-fed, soil assumed. What matters
   most starts at "Balanced". Change any of them if you like.
4. Open the report and look through its tabs. Press the "i" beside a figure to see where it comes from.
5. Press "Add to My Farm". The same field opens on the map board, where you can switch between the current and the proposed plan,
   open Compare plans, the 3D view and History.

The NASA satellite cards on the report need the free NASA Earthdata login on the computer. Without it they say "Not read yet"
and why; the rest of the report still works.

## What you can do today

| Screen | What it does |
|---|---|
| Welcome | A sheet on the first visit: what Crophalo can and cannot do, and what happens to your data. You accept it once (and again if its words change), and can read it again from Privacy, Your choices. |
| Home | "I am at my field" (the device's location), "Find it on the map", place search (OpenStreetMap Nominatim, asked only when you press Search or Return), typed coordinates, voice typing where the browser offers it (in Chrome your speech is sent to Google to be turned into text), the demo card and your saved fields. The Saved sheet opens, deletes and undoes. |
| Setup | Four steps: Your field, Your crops (a crop chooser with search), Water and soil, What matters most (six choices). |
| Setup map | Pin, Rectangle and Polygon tools and a keyboard mode. Satellite or Light base map. A Places panel. A Layers panel with four NASA GIBS layers (plant greenness, soil moisture, rain rate, land temperature), each with a legend, a date row and an opacity control, and NASA FIRMS fires and hot spots from the last 24 hours within about 250 km of the map centre. A spot card with the weather for today and the next three days, the area and the sun. |
| Report | Seven tabs. Overview and Options: one recommendation, the plans side by side with scores on five parts, priority sliders and a what-if for rain and temperature. Weather: the record since 2001, this year so far, the next 7 days and the regional SMAP soil-moisture card. Calendar: the normal year, the ground month by month and the sowing window. Field: soil, slope and height, size and outline. Satellites & prices: NASA GPM IMERG rain, SMAP, GRACE-FO, ECOSTRESS and HLS. Notes & to-do: not built yet. |
| My Farm | Several farms. A farm can start from a report ("Add to My Farm") or on its own: its place (my place, a tap on the map, a search or coordinates), then its first field. The board on a map (Board or Photo style), current or proposed plan, a season and month strip, chips for weather, plan score, bare-soil months and past years. HLS greenness "Observed" beside "Planned". A Fields table with filters, search, sorting and totals, and a drawer for each field. Edit corners, split, rename, bring in `.geojson` or `.kml`, save GeoJSON or CSV. Compare plans. A deleted farm waits 30 days. |
| History | The land's history counted from the field's weather record (NASA POWER since 2001, or the ERA5 back-up when POWER does not answer), as "N of M years". Print or save as PDF, copy as text. The greenness history, pests and crop replay cards say "Not read yet". |
| 3D view | One field, one plan, one date: what covers the ground, lit by one sun, with words beside the picture. The land is drawn flat and says "Heights not read". |
| Data | Every source Crophalo names, NASA first, with the link to `docs/nasa-data-used.md`. Some of them (SoilGrids, FAOSTAT, MapSPAM, ERA5-Land, World Bank, GBIF) belong to parts that are not read yet. |
| Privacy | What stays on this device, who receives what, and deletes that each ask twice. |
| Limitations | What the figures can and cannot say. A score is not a yield and not a chance. |
| Settings | Units, Accessibility, Saved on this device (backup file, restore, install, reset), Reminders (lists and deletes only), Admin. |
| Admin | Read-only, no password: the state of each data service, from `/api/sources`. Also at `#admin`. |
| Offline | After one online visit the app opens with no internet. A bar says when you are offline. An Install button shows when the browser offers it. Only fields and reports already opened work offline: a new report needs the internet, because every number is read live. |
| Read aloud | Listen buttons on the home, the welcome sheet, the setup steps and the spot card, and a sample in Settings. |

## Where the data comes from

| Source | What Crophalo reads from it | Where it shows |
|---|---|---|
| NASA POWER | daily temperature, rain and ground wetness for the field since 2001 | Report (all scores, Weather, Calendar), My Farm chips, History |
| NASA SMAP L4 (login) | root-zone soil moisture for the 9 km cell that holds the field | Report: Weather and Satellites & prices |
| NASA GPM IMERG (login) | daily rain for the last 30 days | Report: Satellites & prices |
| NASA GRACE / GRACE-FO (login) | change in water stored in the land, for a 0.5 degree cell | Report: Satellites & prices |
| NASA ECOSTRESS (login) | ground temperature passes, 70 m, last 60 days | Report: Satellites & prices |
| NASA / USGS HLS (login) | greenness, one clear pass per 15 days, last 12 months | Report: Satellites & prices; My Farm "Observed" |
| NASA GIBS | map pictures: MODIS greenness, SMAP soil moisture, IMERG rain rate, MODIS land temperature | Setup map: Layers |
| NASA FIRMS | VIIRS fires of the last 24 hours, within about 250 km of the map centre | Setup map: Layers |
| Height maps: NRCan, USGS 3DEP, PDOK, Environment Agency, IGN Spain, IGN France, Copernicus GLO-30 (from Amazon's open data), NASADEM (through Microsoft's Planetary Computer, with a short-lived public token) | the finest free height map at the place; no login, but the service receives the field's position | Report: Field (slope, height) |
| Agriculture and Agri-Food Canada Annual Crop Inventory; USDA Cropland Data Layer | crops grown around the field (Canada and the US only) | Report: steers which plans are offered |
| Open-Meteo | the forecast; the ERA5 record (Copernicus Climate Change Service, ECMWF) only when NASA POWER does not answer | Spot card, Weather tab, My Farm, the sky in the 3D view |
| Esri World Imagery, OpenFreeMap, OpenStreetMap Nominatim | map photos, the light map and place names, place search | Home and maps |
| Frankfurter | currency rates (central-bank reference rates) | Settings |
| Crop references: FAO-56, FAO ECOCROP, FAO Training Manual 3, FAO Papers 33 and 66, Purdue National Corn Handbook NCH-40, Luo 2011, the Ontario field-crop guide and soil-erosion page | crop stage lengths, warmth and water needs, crop ranges | Report: the evidence lines behind the scores; each one on the Data page |

Each figure read from an outside source has an "i" button: it names the source and, where the figure has one, its date or the
size of its square (solid for NASA, outlined for others). Crophalo uses NASA data but is not made, reviewed or endorsed by NASA.

The satellite figures are one value for a square, never a pattern inside the field: SMAP 9 km, GPM IMERG 0.1 degree,
GRACE-FO 0.5 degree, ECOSTRESS 70 m, HLS 30 m. The weather record is one square about 50 km wide.

## Start it

**Mac.** Double-click `Start Crophalo.command`. A Terminal window opens: keep it open, closing it stops Crophalo. The first
start sets up Python inside the folder, and Node too unless the Mac already has Node 20 or newer (once, with the internet), then opens `http://localhost:5480/`
(or the next free port) in your browser. It listens on this computer only. Needs macOS 11 or newer; the satellite lookups need
macOS 14 on an Apple chip or macOS 12 on Intel.

**Windows.** Double-click `Start Crophalo.bat` and keep its window open. Windows 10 or newer, 64-bit. The Windows starter has
not been run on a Windows PC yet; `scripts/WINDOWS-CHECKLIST.md` lists what to check.

**The NASA login.** The free NASA Earthdata login (urs.earthdata.nasa.gov) is needed for SMAP, GPM IMERG, GRACE-FO, ECOSTRESS
and HLS. The first start asks for it once (Return skips). To add or change it later, double-click
`Start Crophalo (Add NASA login).command` or `.bat`. It is kept on the computer, never in the app. Weather, heights, crop maps,
GIBS and FIRMS need no login.

**Moving the folder.** A new computer needs about 2 GB free and the internet for the first start (about 160 MB).
For a move with no internet, run `sh scripts/pack-runtimes.sh` first. Remove `.secrets/` before giving the folder to someone else.
Your saved fields stay in the browser, not in the folder. To take them along, use Settings, Saved on this device, Download a
backup file, and Restore it on the other computer.

## Run the checks

    sh scripts/check.sh              every suite, in one order, stopping at the first failure
    E2E=0 sh scripts/check.sh        the 53 offline suites only (no browser)
    NET=1 sh scripts/check.sh        also test_fallback, which asks the internet once and keeps the answers
    node scripts/test_engine.mjs     one suite alone

Each suite prints "N passed, M failed" as its last line. `scripts/test.mjs` alone prints 156 passed, 0 failed.

Start Crophalo once first: some offline suites run the folder's own Python (`.venv`), and `check.sh` uses the folder's Node,
or Node 22 or newer on the computer.

The 12 browser suites (`scripts/e2e*.mjs`) drive headless Chrome, Chromium or Edge (`CHROME=` picks one), one at a time, on a
throwaway copy of the app with every outside service cut off, on a port of their own (`E2E_PORT=`). They never touch the copy
you are using: `check.sh` refuses `E2E_URL` and `E2E_TARGET`, and any test port that is the port Crophalo last ran on or 5173.
Other options: `E2E_ONLY=`, `E2E_KEEP=1`, `TEST_PORT=`.

The nine `scripts/live_check_*.mjs` scripts and `scripts/check_live_money.mjs` ask the real services; they need the internet and are
run by hand, never by `check.sh`.

## What is in the folder

| Where | What |
|---|---|
| `index.html` | the one page of the app; links the app's 17 stylesheets and Leaflet's, and loads `js/app.js` |
| `design.html`, `design/` | the page of looks (colours, type, controls); the design tokens and four test pages used by the browser suites; `design/engine/` holds the recorded Oxford answers for `design/engine-demo.html` |
| `sw.js`, `manifest.json`, `icons/`, `robots.txt` | the offline copy, the install manifest and icons |
| `css/` | `app.css` and one sheet per screen: setup, map, report, weather, calendar, satellites, field, pages, sources, region, farm, farm3d, soiltest, remind, fieldcard, statement (linked by `index.html`); `history.css` (loaded by code); `fx.css`, `fx-halo.css` (test pages only) |
| `js/app.js`, `words.js`, `words.m3.js`, `toast.js`, `motion.js`, `listen.js`, `settings.js`, `offline.js` | the page start, views, top bar and Back; one vocabulary; notices; motion; read aloud; settings; the offline bar and Install |
| `js/home.js`, `welcome.js`, `places.js`, `saved.js` | the home, the welcome sheet, place search, coordinates and demo regions, saved fields |
| `js/wizard.js`, `steps.js`, `state.js`, `croppicker.js` | the four setup steps, their rules, the answers, the crop chooser |
| `js/mapx.js`, `geo.js`, `spotcard.js`, `cardplace.js`, `weather.js`, `sun.js`, `mapbase.js`, `lightstyle.js`, `mappanels.js`, `mapplaces.js`, `maplayers.js`, `gibs.js` | the setup map and its tools, outline maths, the spot card, the base maps, the Places and Layers panels, the NASA GIBS and FIRMS layers |
| `js/data.js`, `climate.js`, `power-climate.js`, `sure.js` | the NASA POWER record (with the ERA5 back-up), the climate worked out from it, how sure a 50 km square can be |
| `js/crops.js`, `pics.js`, `season.js`, `fit.js`, `engine.js`, `engine-client.js`, `engine-worker.js`, `series-pack.js`, `nearby.js`, `near-load.js` | the crop table and pictures, sowing windows, fit checks, the report engine (run on a worker), the "grown nearby" check |
| `js/report.js`, `report-view.js`, `report-load.js`, `memo.js`, `joins.js`, `weather-data.js`, `weather-view.js`, `calendar-data.js`, `calendar-view.js`, `field-data.js`, `field-view.js`, `outline.js`, `soiltest.js`, `satellites-data.js`, `satellites-view.js`, `satellites2-data.js`, `satellites2-view.js`, `region.js` | the report and its tabs, the lookups shared between them, the soil rules, the regional reading card |
| `js/sources.js`, `sources.more.js`, `srci.js` | the source cards and the "i" button |
| `js/pages.js`, `pages-info.js`, `pages-view.js`, `privacy.js`, `backup.js`, `units.js`, `currency.js`, `admin-view.js`, `remind.js`, `remind-plan.js` | the Data, Privacy, Limitations and Settings pages, backup and restore, units, currency, Admin, the reminder list and its rules |
| `js/farm.js`, `simulate.js`, `farmstart.js`, `farmlist.js`, `farmchips.js`, `farmobserved.js`, `fielddrawer.js`, `fieldedit.js`, `fieldstable.js`, `farmio.js`, `farmhistory.js`, `history.js`, `history-view.js` | My Farm: the board, the farm store, starting a farm, the farms list, chips, HLS "Observed", the field drawer, editing, the Fields table, map files and spreadsheets, land history |
| `js/heights3d.js`, `slope3d-data.js`, `land3d-data.js` | the height map, slope and ground shape for the report's Field tab |
| `js/farm3d.js`, `farm3d-data.js`, `moon.js` | the 3D view (one field, one plan, one date, drawn flat), the sun's and moon's place |
| `js/discuss.js`, `fieldcard.js`, `sharetext.js`, `notice.js`, `exports.js`, `statement.js`, `soiltestui.js`, `remind-sw.js`, `sales.js`, `shade.js`, `shade-worker.js`, `objects3d-data.js`, `objects3d-shapes.js`, `fx.js`, `fx-halo.js` | written and tested, but no screen shows them yet (see "What is not built yet") |
| `data/regions.json` | the demo region |
| `scripts/serve.mjs`, `push.mjs`, `drought.mjs`, `earthdata.mjs` | the server (no packages): the app's files, `/api/health`, `/api/ready`, `/api/sources`, the 11 lookups, `/api/push/*`, `/api/drought`; finding the NASA login |
| `scripts/live/` | the Python lookups: `smaproot.py`, `imergrain.py`, `gracecell.py`, `ecopass.py`, `hlsndvi.py`, `dem.py`, `cropsnear.py`, `firms.py`, `prices.py`, `faostat.py`, `ndvihist.py`; helpers `common.py`, `dap4.py`, `heights.py`, `flock_compat.py`, `faostat_items.py`; code lists; `README.md` |
| `scripts/run.sh`, `start-windows.ps1`, `preflight.mjs`, `portable.sh`, `pack-runtimes.sh`, `vendor.mjs`, `requirements.txt`, `WINDOWS-CHECKLIST.md` | the starters, the start check-up, the pinned Node and Python, the bundled libraries |
| `scripts/check.sh`, `test*.mjs`, `e2e*.mjs`, `live_check_*.mjs`, `check_live_money.mjs`, `record_*.mjs`, shared test code (`e2e_lib.mjs`, `live_testlib.mjs` and others), `wordguard.mjs` | the suites, the one check, the recorders; `scripts/fixtures/` holds recorded answers of the outside services |
| `vendor/`, `scripts/vendor-test/` | Leaflet, MapLibre and three.js, kept in the folder; axe-core for the suites only |
| `docs/nasa-data-used.md`, `docs/data-sources/` | the NASA data and its credit; one file per data source on the challenge's list, with what we found when we tried it; most of these are not read by the app yet |
| `Start Crophalo.command`, `.bat`, and the "(Add NASA login)" pair | the starters for Mac and Windows |
| `MOVING.md`, `PRESENTATION.md`, `LICENSE` | moving to another computer; the project summary; the Apache License 2.0 |

The first start makes `runtime/`, `.venv/`, `.cache/` and, if you choose, `.secrets/`. The suites make `scripts/_cache/`.
Git leaves these out, and `.userdata/` too.

## What is not built yet

- The report's Notes & to-do tab says "Not built yet".
- On the Satellites & prices tab, the Crop prices and Pests reported nearby cards always say "Not read yet". The SMAP card has no 12-month view yet.
- In My Farm, the Sales chip always says "Not worked out", and the field drawer's reminders say "not read yet".
- No screen can set a reminder. Settings lists reminders and deletes them, but the list stays empty. Push notices are not wired (`js/remind-sw.js` is not loaded).
- Units and currency are kept and shown in the Settings sample lines only; the report and My Farm do not convert their figures yet.
- The 3D view draws the land flat. Shade, the built farm objects and the other land switches are written but not shown.
- Written and tested, but no screen shows them: the soil-test form, share links, the printed field card, "Discuss this field", share texts, CSV and JSON downloads of the report, the season weather record, "What did you notice?" and the money figure.
- The History page's greenness history, pests and crop replay cards always say "Not read yet".
- The server's `prices` lookup (World Bank Pink Sheet), `faostat` (FAO's FAOSTAT files), `ndvihist` (NASA MODIS greenness
  through GIBS) and `/api/drought` (the US Drought Monitor, with the FCC area lookup) answer, but no screen asks them yet.
- There is no soil lookup: soil is your answer, or "Average soil (assumed)". ISRIC SoilGrids (a world soil map) has a source
  card, but no screen reads it yet.
- Source cards are written for GBIF pest sightings, MapSPAM and FAOSTAT, but no screen reads them yet.
- Crops grown nearby are read for Canada and the US only.
- The browser suites run in Chrome, Chromium and Edge only. Safari, Firefox and real phones and tablets have not been tried; phone widths are emulated in Chrome.
- The Windows starter has not been run on a Windows PC.
- The land history and the light map style have no offline suite of their own; History is checked by the browser suite
  `e2e_farm.mjs`.

## NASA data used

| NASA dataset | Figure it feeds |
|---|---|
| NASA POWER daily data (temperature, rain, root-zone wetness), since 2001 | frost dates, heat, rain timing, stress years, every score, the Weather and Calendar tabs, My Farm chips, History |
| GPM IMERG and MERRA-2, inside POWER | the rain of the record: for each place, the satellite rain when it has enough days, otherwise the weather model's rain for the whole record, never a mix of the two; the report says which |
| SMAP Level-4 root-zone soil moisture | the regional soil-moisture card for the 9 km cell, with its footprint and date, never a pattern inside the field |
| GPM IMERG daily (v07) | rain of the last 30 days for the field's cell |
| GRACE / GRACE-FO mascon (JPL) | change in water stored in the land for the field's region |
| ECOSTRESS land surface temperature | ground temperature at 70 m, last 60 days |
| HLS v2.0 (NASA / USGS) | greenness over the last 12 months; "Observed" beside "Planned" in My Farm |
| GIBS: MODIS Terra NDVI and land temperature, SMAP, IMERG | the four map layers on the setup map |
| FIRMS (VIIRS) | fires of the last 24 hours on the setup map |
| NASADEM | the last height map tried for slope and height, where no finer one exists |

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

- **2026-11-15.** My Farm reads a plan as the crop cycle the report planned (corn, soybeans), not as its repeated seasons. The
  light map no longer fails when the setup map closes during a zoom. The offline copy waits 30 seconds after the page loads
  before it checks for a new version. This README now describes what the folder holds today.
- **2026-11-14.** Added: the home and setup with its map (Places and Layers panels, NASA GIBS
  layers and FIRMS fires), the weather record, the crop table and report engine on a worker, the report with its seven tabs,
  the source cards, the Data, Privacy, Limitations, Settings and Admin pages, My Farm with several farms, Compare plans and land
  history, the 3D view, the offline copy, and the server with its 11 lookups. The demo region is Oxford County, Ontario. The
  Apache License 2.0 and one file per data source were added.
