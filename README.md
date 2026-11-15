# Crophalo

Crophalo helps a farmer compare crop rotations for one field. You find the field on a map and answer four short questions,
and Crophalo reads the field's own weather record from NASA and other open data, then shows which rotation suits the field,
why, and how the ground would be covered through the year. You can keep the field in My Farm, with its plans on a map board
and in a 3D view.

It is for farmers who want to weigh a change of rotation against the field's own past
weather. It has no account and no sign-in. Your fields and plans are kept only in this browser: clearing the browser's site data
deletes them, and the backup file on the Privacy page is the one way to keep or move them.

Crophalo is a guide to think with, not advice. Anything it could not read says so plainly, never with a made-up number.

We built it for the NASA Space Apps Challenge 2026, "Field Shift".

## Try the demo

The folder holds three demo fields (`data/regions.json`): a research field near Mead, Nebraska, rain-fed and grown in corn and
soybeans in turn; a research farm field a few miles from NASA's Goddard centre, near Beltsville, Maryland; and a field near
Barrie, Ontario. The setup map opens on the United States.

1. Start Crophalo (see "Start it" below).
2. On the home screen, press "near Mead, Nebraska" in the line "Try a demo field: near Mead, Nebraska · Beltsville, Maryland ·
   Barrie, Ontario".
3. Go through the four setup steps. The field's answers are already chosen (Mead: corn then soybeans, rain-fed, a silt soil from a
   soil map), and its outline is drawn on the map. What matters
   most starts at "Balanced". Change any of them if you like.
4. Open the report and read it from the top: it is one page. Press the "i" beside a figure to see where it comes from.
5. Press "Add to My Farm". The same field opens in My farm, where you can open Compare plans, This field (with its land
   history), the map or the 3D view, and More.

The NASA satellite cards on the report need the free NASA Earthdata login on the computer. Without it they say in one plain
sentence why they could not be read; the rest of the report still works.

## What you can do today

| Screen | What it does |
|---|---|
| Welcome | A sheet on the first visit: what Crophalo can and cannot do, and what happens to your data. One press accepts it (and again if its words change); you can read it again from Privacy. |
| Home | The turning Earth (its pictures ship with the app) with the 13 real satellites whose data Crophalo reads, on their real orbits, with a clock line and a Now button; a press on a satellite opens its card. "I am at my field" (the device's location), "Find it on the map", place search (OpenStreetMap Nominatim, asked only when you press Search or Return), voice typing where the browser offers it (in Chrome your speech is sent to Google to be turned into text), and one line for the demo. Choosing a place starts a short fall from the Earth to the field. |
| Setup | Four steps: Your field, Your crops (a crop chooser with search; for a field in the United States or Canada, what the national crop map shows this field grew year by year, with one button to use that rotation), Water and soil, What matters most (six choices). |
| Setup map | Opens on the United States when no place is chosen yet. Pin, Rectangle and Corners tools and a keyboard mode; a closed outline is used for the report at once, with an Undo. Satellite or Light base map; Satellite is NASA's own picture (HLS 30 m near the ground, MODIS 250 m under it), with its date and Earlier and Newest buttons. A loading sign shows while the map fetches or redraws. A Places panel. A Layers panel with eleven layers, each with a short line, an opacity control and a loading sign: four NASA GIBS layers (plant greenness, soil moisture, rain rate, land temperature) with a legend, a date row and a gentle motion that stops under Less and Still; NASA FIRMS fires and hot spots from the last 24 hours within about 250 km of the map centre; regional water storage (NASA GRACE-FO); and five land layers worked out from height tiles (slope, erosion exposure, frost pockets, sun and shade, relief shading). A spot card with the weather for today and the next six days, the area and the sun. |
| Report | One page in the farmer's questions, no tabs. What should I plant next?: one suggestion with its score, one reason, how sure it is, and Add to My farm. Compare strategies: three strategy rows, each with why, evidence, benefits, what is missing and the risks under one Show more, a rough money line, Your hardest year (the three strategies played on a hard year of this land's weather), and the three side by side. What could go wrong?, with what Crophalo assumed about the field (and the soil test form). When do I do what?: the next job and the year month by month. More about your field: three folds, the weather here since 2001, what NASA satellites see (SMAP soil water, GPM IMERG rain, HLS greenness, GRACE-FO, ECOSTRESS) and the crop prices, each in plain lines with the figure on its closed line. Share or print, where the numbers come from, and My notes and reminders. If the report cannot be worked out, one sentence says why, with Try again. |
| My Farm | Several farms. A farm can start from a report ("Add to My Farm") or on its own: its place (my place, a tap on the map, a search or coordinates), then its first field. A head with the field's name, size, place, the plan to try with the report's score and the next job. One bar of four: Compare plans (in the report's names), This field (one page), Map or 3D (the last choice is remembered), and More (with the farm tools: the Fields table, editing, map files and spreadsheets). The map's Satellite style is NASA's picture. Reminders. A deleted farm waits 30 days. |
| History | The land's history counted from the field's weather record (NASA POWER since 2001, or the ERA5 back-up when POWER does not answer), as "N of M years", in folded cards. What this field grew (from the national crop maps), Weak spots in this field (asked only when pressed) and "Risks to check locally". Print or save as PDF, copy as text. |
| 3D view | One field, one plan, one date: what covers the ground, lit by one sun, with words beside the picture. The scene is built away from the page, so it never freezes; a sketch shows at once. Shade at a low sun. The land's details from OpenStreetMap (buildings, roads, water, woods, hedges, fences and more) only when a switch is turned on. |
| Data | Every source Crophalo names, NASA first, in three tabs with a filter, the whole width. Each source: at most four sentences, one Visit link and Show more. "How Crophalo uses NASA data" and "How to read Crophalo" are folds on the page. Some sources (FAOSTAT, MapSPAM, World Bank, GBIF) belong to parts that are not read yet. |
| Privacy | Two tabs: what stays on this device, with Delete beside each kept line and the backup; and who receives what. |
| Limitations | Short cards on what the figures can and cannot say, with the longer words under Show more. A score is not a yield and not a chance. |
| Settings | One page of four cards: Units (and which unit of area comes first), Money, Reading and motion (with Motion as Full, Less or Still), Reminders. A Service status link at its foot. The backup file is on Privacy. |
| Service status | Read-only, no password: one card for each data service, its state, when it last answered, a plain problem line, and Check again. No key and no folder path shows. At `#admin`. |
| Offline | After one online visit the app opens with no internet. A bar says when you are offline. An Install button shows when the browser offers it. Only fields and reports already opened work offline: a new report needs the internet, because every number is read live. |
| Read aloud | Listen buttons on the home, the welcome sheet, the setup steps and the spot card, and a sample in Settings. |

## Where the data comes from

| Source | What Crophalo reads from it | Where it shows |
|---|---|---|
| NASA POWER | daily temperature, rain and ground wetness for the field since 2001 | Report (all scores, the weather here since 2001, the year month by month), My Farm chips, History |
| NASA SMAP L4 (login) | root-zone soil moisture for the 9 km cell that holds the field | Report: what NASA satellites see |
| NASA GPM IMERG (login) | daily rain for the last 30 days | Report: what NASA satellites see |
| NASA GRACE / GRACE-FO (login) | change in water stored in the land, over a region about 300 km wide | Report: what NASA satellites see; Setup map: Layers (regional water storage) |
| NASA ECOSTRESS (login) | ground temperature passes, 70 m, last 365 days, and the clear days with the ground at 45 °C or more | Report: what NASA satellites see |
| NASA / USGS HLS (login) | greenness, one clear pass per 15 days, last 12 months | Report: what NASA satellites see; My Farm "Observed" |
| NASA GIBS | map pictures: HLS and MODIS true colour, MODIS greenness, SMAP soil moisture, IMERG rain rate, MODIS land temperature | Setup map: Satellite base and Layers; the My Farm map's Satellite style; the regional card's picture |
| NASA FIRMS | VIIRS fires of the last 24 hours, within about 250 km of the map centre | Setup map: Layers |
| Terrain Tiles (Tilezen, on Amazon's open data), ISRIC SoilGrids | land heights as map tiles, built in 2017 from SRTM, CDEM, USGS 3DEP and other height maps; sand, silt and clay at the pin | Setup map: Layers (slope, erosion exposure, frost pockets, sun and shade, relief shading) |
| Height maps: NRCan, USGS 3DEP, PDOK, Environment Agency, IGN Spain, IGN France, Copernicus GLO-30 (from Amazon's open data), NASADEM (through Microsoft's Planetary Computer, with a short-lived public token) | the finest free height map at the place; no login, but the service receives the field's position | Report: Field (slope, height) |
| Agriculture and Agri-Food Canada Annual Crop Inventory; USDA Cropland Data Layer | crops grown around the field (Canada and the US only) | Report: steers which plans are offered |
| Open-Meteo | the forecast; the ERA5 record (Copernicus Climate Change Service, ECMWF) only when NASA POWER does not answer | Spot card, My Farm, the sky in the 3D view |
| OpenFreeMap, OpenStreetMap Nominatim | the light map and place names, place search | Setup map (OpenFreeMap); place search on the home and the setup (Nominatim) |
| Frankfurter | currency rates (central-bank reference rates) | Settings |
| Environment and Climate Change Canada weather stations; OMAFRA Field Crop News: Winter Survival | the station records NASA's first autumn frost date was checked against (35 Ontario stations); how cold hardened winter wheat survives and how much snow shelters it | Report: the autumn frost date and the winter wheat check; each one on the Data page |
| Crop references: FAO-56, FAO ECOCROP, FAO Training Manual 3, FAO Papers 33 and 66, Purdue National Corn Handbook NCH-40, Luo 2011, the Ontario field-crop guide and soil-erosion page | crop stage lengths, warmth and water needs, crop ranges | Report: the evidence lines behind the scores; each one on the Data page |

Each figure read from an outside source has an "i" button: it names the source and, where the figure has one, its date or the
size of its square (solid for NASA, outlined for others). Crophalo uses NASA data but is not made, reviewed or endorsed by NASA.

The satellite figures are one value for a square, never a pattern inside the field: SMAP 9 km, GPM IMERG 0.1 degree,
GRACE-FO about 300 km, ECOSTRESS 70 m, HLS 30 m. The weather record is one square about 50 km wide.

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
Your saved fields stay in the browser, not in the folder. To take them along, use Privacy, Keep a copy, Download a
backup file, and Restore it on the other computer.

## Run the checks

    sh scripts/check.sh              every suite, in one order, stopping at the first failure
    E2E=0 sh scripts/check.sh        the 102 offline suites only (no browser)
    NET=1 sh scripts/check.sh        also test_fallback, which asks the internet once and keeps the answers
    node scripts/test_engine.mjs     one suite alone

Each suite prints "N passed, M failed" as its last line. `scripts/test.mjs` alone prints 196 passed, 0 failed.

Start Crophalo once first: some offline suites run the folder's own Python (`.venv`), and `check.sh` uses the folder's Node,
or Node 22 or newer on the computer.

The 43 browser suites (`scripts/e2e*.mjs`) drive headless Chrome, Chromium or Edge (`CHROME=` picks one), one at a time, on a
throwaway copy of the app with every outside service cut off, on a port of their own (`E2E_PORT=`). They never touch the copy
you are using: `check.sh` refuses `E2E_URL` and `E2E_TARGET`, and any test port that is the port Crophalo last ran on or 5173.
Other options: `E2E_ONLY=`, `E2E_KEEP=1`, `TEST_PORT=`.

The eleven `scripts/live_check_*.mjs` scripts and `scripts/check_live_money.mjs` ask the real services; they need the internet and are
run by hand, never by `check.sh`.

## What is in the folder

| Where | What |
|---|---|
| `index.html` | the one page of the app; links 18 of the app's stylesheets, and loads `js/app.js` (the map library comes the first time a map shows) |
| `design.html`, `design/` | the page of looks (colours, type, controls); the design tokens and four test pages used by the browser suites; `design/engine/` holds the recorded answers of an earlier Ontario demo region for `design/engine-demo.html` |
| `sw.js`, `manifest.json`, `icons/`, `robots.txt` | the offline copy, the install manifest and icons |
| `css/` | `app.css` and one sheet per screen: home, setup, map, report, weather, calendar, satellites, field, pages, sources, region, farm, farm3d, soiltest, remind, fieldcard, statement (linked by `index.html`); `history.css`, `ahead.css`, `fx.css`, `fx-halo.css`, `explain.css`, `notes.css`, `share.css`, `terrain.css` and the big animations' `macro*.css` (loaded by code when their screen or motion first shows) |
| `js/app.js`, `words.js`, `words.m3.js`, `toast.js`, `motion.js`, `motion-wire.js`, `fx.js`, `fx-halo.js`, `added-fx.js`, `listen.js`, `settings.js`, `offline.js`, `leaflet-load.js` | the page start, views, top bar and Back; one vocabulary; notices; motion and the small motions (Added, Copied, the page turn); read aloud; settings; the offline bar and Install; the map library, fetched the first time a map shows |
| `js/home.js`, `home-sats.js`, `home-sats-data.js`, `home-orbit.js`, `home-orbits-ask.js`, `home-time.js`, `home-craft.js`, `home-picture.js`, `welcome.js`, `places.js`, `saved.js` | the home, the Earth and its satellites (their orbits, the clock line, the spacecraft pictures, the Earth picture), the welcome sheet, place search, coordinates and demo fields, saved fields |
| `js/hooks.js`, `macro.js`, `macro-core.js`, `macro-view.js`, `macro-turn.js`, `turn-plan.js`, `macro-setup.js`, `macro-descent.js`, `descent-plan.js`, `macro-light.js`, `macro-report.js`, `macro-record.js`, `macro-sun.js`, `macro-sun-data.js`, `macro-skeleton.js`, `macro-probe.js` | the big animations: their hooks in the page, the page turns, the fall to the field, First Light, the report's scenes; the 3D scenes of My farm's 3D view (`macro-sun.js`, `macro-skeleton.js`); `macro-probe.js` is for the browser suites |
| `js/notes-view.js`, `notice.js`, `todo.js`, `remind-wire.js`, `remind-sw.js`, `sharemenu.js`, `sharemodel.js`, `sharetext.js`, `fieldcard.js`, `statement.js`, `exports.js`, `discuss.js`, `soiltestui.js`, `prices-cards.js`, `sales.js`, `weather-week.js`, `explain.js`, `explain-page.js`, `words.explain.js` | the report's notes ("What did you notice?") and to-do, reminders from the report and My farm (and their notices, loaded by the offline worker), Share or print (the texts, the field card, the season record, the files, the page for a farm adviser), the soil test form, the price cards, the week ahead, "How to read Crophalo" |
| `js/wizard.js`, `steps.js`, `state.js`, `croppicker.js`, `cropstep.js`, `fieldyears.js`, `placename.js`, `soil-load.js` | the four setup steps, their rules, the answers, the crop chooser, the suggested crop step, what the crop map shows this field grew, the place name on top of the setup, the US soil survey |
| `js/mapx.js`, `mapdraw.js`, `mapwords.js`, `mapbusy.js`, `geo.js`, `spotcard.js`, `cardplace.js`, `weather.js`, `sun.js`, `mapbase.js`, `lightstyle.js`, `mappanels.js`, `mapplaces.js`, `maplayers.js`, `gibs.js`, `nasabase.js`, `layeranim.js`, `grace.js`, `gracelayer.js`, `terrain-layers.js`, `terrain-jobs.js`, `terrain-math.js`, `terrain-worker.js` | the setup map and its drawing tools, its words and its loading sign, outline maths, the spot card, the base maps, NASA's picture under the map, the Places and Layers panels, the NASA GIBS, FIRMS and GRACE-FO layers and their motion, the land layers worked out from the height tiles |
| `js/data.js`, `climate.js`, `power-climate.js`, `sure.js` | the NASA POWER record (with the ERA5 back-up), the climate worked out from it, how sure a 50 km square can be |
| `js/crops.js`, `pics.js`, `season.js`, `fit.js`, `engine.js`, `engine-client.js`, `engine-worker.js`, `series-pack.js`, `nearby.js`, `near-load.js` | the crop table and pictures, sowing windows, fit checks, the report engine (run on a worker), the "grown nearby" check |
| `js/report.js`, `letter-view.js`, `letter-facts.js`, `hardyear.js`, `hardyear-model.js`, `hardyear-view.js`, `market-data.js`, `market-view.js`, `report-view.js`, `report-load.js`, `memo.js`, `joins.js`, `weather-data.js`, `weather-view.js`, `calendar-data.js`, `calendar-view.js`, `field-data.js`, `field-view.js`, `outline.js`, `soiltest.js`, `satellites-data.js`, `satellites-view.js`, `satellites2-data.js`, `satellites2-view.js`, `region.js`, `money-data.js`, `money-view.js` | the report's one page and its parts (Your hardest year, USDA cash bids), the older tab views it no longer draws, the lookups shared between them, the soil rules, the regional reading card, the rough money figure |
| `js/sources.js`, `sources.more.js`, `srci.js` | the source cards and the "i" button |
| `js/pages.js`, `pages-info.js`, `pages-view.js`, `privacy.js`, `backup.js`, `units.js`, `currency.js`, `admin-view.js`, `remind.js`, `remind-plan.js` | the Data, Privacy, Limitations and Settings pages, backup and restore, units, currency, the Service status page, the reminder list and its rules |
| `js/farm.js`, `farmhas.js`, `farmunits.js`, `farmyears.js`, `simulate.js`, `farmstart.js`, `farmlist.js`, `farmchips.js`, `farmobserved.js`, `fielddrawer.js`, `fieldedit.js`, `fieldstable.js`, `farmio.js`, `farmhistory.js`, `history.js`, `history-view.js`, `greenness.js`, `grew.js`, `weakspots.js`, `weakspots-view.js` | My Farm: the board, whether a field is in My farm, the farm store, starting a farm, the farms list, chips, HLS "Observed", the field drawer, editing, the Fields table, map files and spreadsheets, land history and its greenness record (not shown yet), what this field grew, weak spots |
| `js/ahead.js`, `ahead-view.js`, `ahead-words.js`, `ahead-charts.js`, `ahead-load.js`, `ahead-run.js`, `ahead-job.js`, `ahead-client.js`, `future.js`, `future-worker.js` | Look ahead: possible futures from forecast runs put on NASA's footing, judged by the same scoring path as the land history (written and tested; no screen opens it yet) |
| `js/heights3d.js`, `slope3d-data.js`, `land3d-data.js` | the height map, slope and ground shape for the report (what Crophalo assumed about the field) |
| `js/farm3d.js`, `farm3d-data.js`, `farm3d-draw.js`, `farm3d-orbit.js`, `farm3d-rule.js`, `farm3d-shell.js`, `farm3d-worker.js`, `land3d-load.js`, `land3d-mesh.js`, `shade3d.js`, `shade.js`, `shade-worker.js`, `moon.js` | the 3D view (one field, one plan, one date, built on a worker), the camera, when it opens by itself, the land's details, the shade, the sun's and moon's place |
| `js/objects3d-data.js`, `objects3d-shapes.js` | written and tested, but no screen shows them yet (only a suite reads them) |
| `data/regions.json` | the three demo fields (Mead, Beltsville, Barrie), each with its outline and its answers already chosen |
| `scripts/serve.mjs`, `push.mjs`, `drought.mjs`, `earthdata.mjs` | the server (no packages): the app's files, `/api/health`, `/api/ready`, `/api/sources` and `POST /api/sources/check` (the Service status page), the 16 lookups (among them the satellites' orbits for the home, OpenStreetMap's land details for the 3D view, what a field grew year by year and the greenness inside a field), `/api/push/*`, `/api/drought`; finding the NASA login |
| `scripts/live/` | the Python lookups: `smaproot.py`, `imergrain.py`, `gracecell.py`, `ecopass.py`, `hlsndvi.py`, `hlsbox.py`, `dem.py`, `cropsnear.py`, `crophist.py`, `firms.py`, `prices.py`, `faostat.py`, `ndvihist.py`, `orbits.py`, `osm.py`, `osmextra.py`; helpers `common.py`, `dap4.py`, `heights.py`, `flock_compat.py`, `faostat_items.py`; code lists; `README.md` |
| `scripts/run.sh`, `start-windows.ps1`, `preflight.mjs`, `portable.sh`, `pack-runtimes.sh`, `vendor.mjs`, `requirements.txt`, `WINDOWS-CHECKLIST.md` | the starters, the start check-up, the pinned Node and Python, the bundled libraries |
| `scripts/check.sh`, `test*.mjs`, `e2e*.mjs`, `live_check_*.mjs`, `check_live_money.mjs`, `record_*.mjs`, shared test code (`e2e_lib.mjs`, `live_testlib.mjs` and others), `wordguard.mjs` | the suites, the one check, the recorders; `scripts/fixtures/` holds recorded answers of the outside services and four hand-made test helpers |
| `vendor/`, `scripts/vendor-test/` | Leaflet, MapLibre, three.js and satellite.js, kept in the folder; axe-core for the suites only |
| `img/craft/`, `img/earth/` | the spacecraft pictures and the Earth pictures of the home, each with its credit in the folder's `README.md` |
| `docs/nasa-data-used.md`, `docs/data-sources/` | the NASA data and its credit; one file per data source on the challenge's list, with what we found when we tried it; most of these are not read by the app yet |
| `Start Crophalo.command`, `.bat`, and the "(Add NASA login)" pair | the starters for Mac and Windows |
| `MOVING.md`, `PRESENTATION.md`, `LICENSE` | moving to another computer; the project summary; the Apache License 2.0 |

The first start makes `runtime/`, `.venv/`, `.cache/` and, if you choose, `.secrets/`. The suites make `scripts/_cache/`.
Git leaves these out, and `.userdata/` too.

## What is not built yet

- The SMAP soil water reading has no 12-month view yet.
- The report's USDA cash bids line needs the server's USDA Market News lookup and its key; this server has no such lookup yet, so the
  line does not show.
- Units and currency are not yet used for every figure of the report and My Farm.
- Look ahead is written and tested, but no screen opens it. The land history's greenness record is written and tested in `js/greenness.js`, but My farm does not hand the page the field's position yet.
- The server's `prices` lookup (World Bank Pink Sheet), `faostat` (FAO's FAOSTAT files), `ndvihist` (NASA MODIS greenness
  through GIBS) and `/api/drought` (the US Drought Monitor, with the FCC area lookup) answer, but no screen asks them yet.
- The US soil survey lookup is asked by the report for a US field, but the server has no route for it yet, so the report goes on
  with an assumed loam. Elsewhere soil is your answer, a demo field's soil map, or "Average soil (assumed)".
- Source cards are written for GBIF pest sightings, MapSPAM and FAOSTAT, but no screen reads them yet.
- Crops grown nearby are read for Canada and the US only.
- The browser suites run in Chrome, Chromium and Edge only. Safari, Firefox and real phones and tablets have not been tried; phone widths are emulated in Chrome.
- The Windows starter has not been run on a Windows PC.
- The light map style has no offline suite of its own.

## NASA data used

| NASA dataset | Figure it feeds |
|---|---|
| NASA POWER daily data (temperature, rain, root-zone wetness), since 2001 | frost dates, heat, rain timing, stress years, every score, the report's weather fold and its year month by month, My Farm chips, History |
| GPM IMERG and MERRA-2, inside POWER | the rain of the record: for each place, the satellite rain when it has enough days, otherwise the weather model's rain for the whole record, never a mix of the two; the report says which |
| SMAP Level-4 root-zone soil moisture | the regional soil-moisture card for the 9 km cell, with its footprint and date, never a pattern inside the field |
| GPM IMERG daily (v07) | rain of the last 30 days for the field's cell |
| GRACE / GRACE-FO mascon (JPL) | change in water stored in the land for the field's region |
| ECOSTRESS land surface temperature | ground temperature at 70 m, last 365 days, and the clear days at 45 °C or more |
| HLS v2.0 (NASA / USGS) | greenness over the last 12 months; "Observed" beside "Planned" in My Farm |
| GIBS: MODIS Terra NDVI and land temperature, SMAP, IMERG | the four map layers on the setup map |
| GIBS: HLS (Landsat and Sentinel-2) and MODIS Terra true colour | the satellite picture under the setup map and on the regional card |
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
| satellite.js 7.1.0 (the satellites' orbits on the home), with python-sgp4's notice | MIT | `vendor/satellite/LICENSE.md`, `vendor/satellite/ORIGINAL-PKG-INFO.txt` |
| axe-core 4.14.0 (used by the test suites only, not part of the app) | MPL 2.0 | `scripts/vendor-test/LICENSE-axe-core.txt` |

The pictures on the home are not ours either, and the Apache licence does not cover them. The spacecraft pictures in `img/craft/` are NASA's
(NASA 3D Resources) and NASA/JPL-Caltech's (artist's concepts, under JPL's image use policy). The Earth pictures in `img/earth/` are NASA's
Blue Marble. Each file's owner, credit, source page and terms are in `img/craft/README.md` and `img/earth/README.md`.

The satellite pictures under the map are not ours either. Far from the ground the map shows NASA Blue Marble (NASA GIBS). Closer it shows
Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), under the Creative Commons Attribution 4.0
licence; only the 2016 layer is used. Near the ground in the United States it shows USDA, USGS The National Map: Orthoimagery, a work of the
US government. The map's own credit line names the one in view.

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
  before it checks for a new version. The demo is now three fields (Mead, Beltsville, Barrie) and the setup map opens on the
  United States. The home shows the Earth with the real satellites; the setup map has all eleven layers and the drawing tools;
  the report gains Share or print, notes and reminders; Settings is one page and the Service status page is new; My farm is
  simpler, and its 3D view never freezes. The engine compares three strategies for the field and times each crop by the
  place's own seasons; the server gains its security rules, the Service status check and two lookups (what a field grew,
  greenness inside a field). The report is now one page in the farmer's questions, with Your hardest year; the setup shows
  what the crop map says a field grew; the home's demo line names all three demo fields; My farm's 3D view plays its two
  scenes. This README now describes what the folder holds today.
- **2026-11-14.** Added: the home and setup with its map (Places and Layers panels, NASA GIBS
  layers and FIRMS fires), the weather record, the crop table and report engine on a worker, the report with its seven tabs,
  the source cards, the Data, Privacy, Limitations, Settings and Admin pages, My Farm with several farms, Compare plans and land
  history, the 3D view, the offline copy, and the server with its 11 lookups. The demo then was one county in Ontario. The
  Apache License 2.0 and one file per data source were added.
