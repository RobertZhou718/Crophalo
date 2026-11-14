# The live lookups: the contract

Written 2026-11-14. This file is the contract between the Crophalo server (`scripts/serve.mjs`), the Python lookups in this
folder and the screens that show their answers. **The contract is written first, then its test, then the lookup.** When a
service turns out to answer differently from what is written here, this file is changed first, then the code, and the
change is noted in the lookup's section under "Checked against the live service".

A lookup is one small Python script, `scripts/live/<id>.py`. The server runs it as

    .venv/bin/python -u <id>.py <arguments…>        (working folder: scripts/live; on Windows .venv\Scripts\python.exe)

with the arguments already checked, snapped and written with 4 decimals, and with `FW_CACHE`, `PYTHONWARNINGS=ignore` and,
for that process only, the NASA Earthdata login (`NETRC`, `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD`) in its environment.
Nothing comes in on stdin. The script answers and ends. It keeps no state between runs.

## 1. The rules every lookup keeps

### One JSON object, exit code 0, whatever happens

- stdout carries **exactly one JSON object** and nothing else: compact, UTF-8 ("Türkiye", not escapes), no line break.
- The exit code is **0** even when the lookup fails: a failure is an answer too.
- Everything else (progress, a library's chatter, a traceback) goes to stderr. A traceback never reaches stdout.
- `common.py` makes this so: `import common` is the **first import** of every lookup (it takes stdout away from every
  library, Python or C, before one can print), and the lookup ends with `common.run(main, LIMIT_S)`.
- A lookup has no `print()` of its own and never writes to stdout itself.

### A good answer

    {"ok": true, "source": "…", "data_date": "…", "units": "…", "checked": "2026-11-14T18:49:21Z", …the lookup's own keys…}

| Field | Meaning |
|---|---|
| `ok` | `true` |
| `source` | the dataset and who publishes it, in words. No figure without it. |
| `data_date` | the date the **data** is from: a day, a period (`2026-11-14/2027-11-13`), or for a fixed map its year. Never the time of the lookup. A lookup may add a `data_date_note` in plain words. |
| `units` | the unit of every figure in the answer, as a sentence or as an object keyed like the figures. |
| `checked` | when this lookup asked the source (UTC, to the second). `common.run` adds it. |

`common.run` refuses to send a good answer that lacks `source`, `data_date` or `units`. The server adds `cached` and
`fetched` to what it sends on; a lookup never does. Every figure is read from the named source: never estimated, never
filled in. A cloud is never "dry"; a pixel or a day nobody read is `null`, never `0`.

### A failure

    {"ok": false, "reason": "ISRIC's map service did not answer; try again in a minute"}
    {"ok": false, "reason": "SoilGrids has no map for this place (too far north or south, or on the map's edge)", "final": true}

- `reason` is one plain sentence a farmer can read: the screen shows it as it is. No address, no code word, no login.
- A failure holds `ok`, `reason` and, sometimes, `final`. Nothing else, and never a guess beside it.
- `"final": true` **only when asking again cannot help**: the place is outside what the source covers. A service that is
  down, slow or busy is never final. When in doubt, leave it out.
- In the lookup: `raise common.Fail("…")` or `raise common.Fail("…", final=True)`.

Reasons every lookup can give (from `common.py`), word for word:

| Reason | When |
|---|---|
| `lat and lon are required as decimal degrees` | an argument is missing, blank or not a plain number (a blank is missing, never 0) |
| `lat must be -90..90 and lon -180..180` | out of range (boxes: `-84..84`) |
| `The data source took too long to answer; try again in a minute` | the lookup reached its time limit (a lookup may give its own sentence) |
| `The data source did not answer just now; try again in a minute` | a dead service the lookup did not put into its own words |
| `The source sent a value that could not be read` | the answer held something that is not a number (a stray NaN) |
| `Unexpected error while reading the source: …` | a fault in the lookup; the traceback is in the server's log |
| `No NASA Earthdata login is set up on this computer (it is free: urs.earthdata.nasa.gov)` | a lookup that needs the login found none |
| `NASA Earthdata did not accept this computer's login: check the username and password` | NASA answered 401 or 403 |
| `NASA Earthdata login failed: …` | NASA's login service did not answer |

The server adds its own (`Timed out after N s`, `The <id> script gave no valid answer (exit N)`, `The data server is busy.
Try again in a minute.` and the rest); they are the server's contract, not a lookup's.

### A partial answer says it is partial

A good answer that is not whole carries one of these, and the server then keeps it for one hour only:

- `incomplete`: a plain sentence saying what is missing ("3 scenes not read within the time limit");
- `read_errors`: how many files or days could not be read (a number above 0);
- `stale`: `true` when the lookup returns its last good copy because the source could not be refreshed, with a `note`.

A value the source itself does not have (no data at that pixel) is `null` and is named in the answer; that is whole, not
partial. A lookup never fills a gap, and never takes a mean over the parts that did arrive when the missing part would
change it: then the lookup fails.

### Time

- Each lookup has the server's time limit of its row (the table in section 2) and names it: `LIMIT_S = 120`.
- `common.run(main, LIMIT_S)` answers by itself a little before the limit (5 s before, or a quarter of the limit when that
  is less), so the server never has to stop a lookup: the farmer gets a sentence, not silence.
- Inside, `common.left()` is the seconds still left: a lookup that reads many files stops reading in time and returns what
  it has as a partial answer. `common.http()` never waits longer than what is left.
- When the server does stop a lookup, it stops the lookup's whole process group. A lookup that starts worker processes
  shuts them down itself as well.

### Memory

- The public host has 512 MB in all. **A lookup stays under 300 MB at its peak**, measured, with the number written in its
  section. A lookup that cannot is reported with its number, not hidden.
- Files are read piece by piece: a window of a raster (`common.read_window`), a stream to disk (`common.download`, 1 MB
  pieces), one block of a big array at a time. Never a whole world file in memory.
- `common.workers(wanted)` says how many things one lookup may do at once: **1** on a host under 7.5 GB (or of unknown
  size), else what the lookup wants. `FW_WORKERS` overrides it.
- Every lookup's last line on stderr is its own measure, counted by the system:
  `[soilgrids  11.1s] peak_mb=57.6 child_peak_mb=0.0 seconds=11.07 asked=22` (`asked` = requests sent out).

### What is kept, and by whom

- **The server keeps answers; a lookup never does.** A whole answer for the time in the lookup's row; a partial answer for
  1 hour; a failure never, except a `final` one, for 24 hours. Up to `LIVE_MAX` lookups run at once and up to 24 wait.
- A lookup may keep **downloaded source files** (never answers) under `common.cache_dir(…)`, which is inside `FW_CACHE`:
  never the home folder, never anywhere else. Files are written whole or not at all (`common.atomic_write`,
  `common.download`). The lookup that keeps files also removes its old ones.
- Run by hand without `FW_CACHE`, a lookup gets a throwaway folder that is removed when it ends.

### Good manners to the services (they are free and shared)

- One User-Agent, honest and without personal data: `Crophalo/1.0 (crop-rotation comparison for farmers; live data lookup)`.
- At most **2 requests at a time to one host**, 0.25 s between two starts. `common.http`, `common.download` and
  `common.read_window` hold to this by themselves.
- Two tries for a time-out, a broken connection or a 5xx, 1.5 s apart. A 4xx is the service's answer and is not asked again.
- A **429** stops every further request to that host for the rest of the lookup. Never a loop.

### The NASA login

- It reaches a lookup only through its own environment (the two variables, the file named by `NETRC`, or the home netrc).
  `common.earthdata_token()` turns it into a bearer token, once per lookup, held in memory only.
- It is never printed, never logged, never in a reason, never in a file name or a kept file, never in an address.
  `common.py` also stars out the login and the token in anything Python writes to the log or the answer, as a second line
  of defence; the first is not to write them.
- A request that is sent on to another host loses its login header.
- NASA's catalogue (CMR) is open: `common.cmr_granules` and `common.cmr_collections` send no login.

### How a test replaces the network

There is **one** mechanism, in `common.py`, and every lookup honours it because every lookup goes out only through
`common.http`, `common.download`, `common.raster_path` / `common.read_window`:

- `FW_NET_REPLAY=<folder>`: every request is answered from the folder; an address that is not in it is **refused**
  (stderr gets a line `NET-REPLAY-MISS …`, the answer is a failure). Plain sockets are shut and C libraries are pointed
  at a dead proxy, so an offline suite can never reach the internet. A good answer made this way carries
  `"replayed": true`, so it can never pass for a live one. `FW_NOW=2026-11-14T12:00:00Z` pins `common.now()` (only together
  with `FW_NET_REPLAY`): a lookup takes "today" from `common.now()`, never from the system clock.
- One recorded answer is two files named by `common.net_key()`: a hash of the method, the address, the body if there is
  one, and the paging header `CMR-Search-After`. `<key>.json` holds the method, the address and the `replies`;
  `<key>.body` holds the bytes. The replies are served in turn and the last one repeats, so a test can say "fails once,
  then answers" (`{"fail": "connection reset"}`, `{"status": 503}`, `{"fail": "hang"}`).
- `FW_NET_RECORD=<folder>` (by hand, live): every answer `common.http` gets is also written into the folder. A request
  that carries the login is never recorded.
- **The server never sets `FW_NET_REPLAY`, `FW_NET_RECORD` or `FW_NOW`.**

Test inputs live in `scripts/fixtures/live/<name>/`: recorded from the live service with `node scripts/live_record.mjs`
(services that need no login), or hand-made in the real file format with the project's own libraries and marked
`"hand_made": true` (services behind the NASA login). Suites are `scripts/test_live_<family>.mjs`, built on
`scripts/live_testlib.mjs`, and need no internet. A check against the real service is a separate by-hand script
(`scripts/live_check_<id>.mjs`) that is never part of the automatic run.

## 2. The lookups at a glance

Time limit = the server's; kept = how long the server keeps a whole answer; snapped = the grid the server moves the point to
before it runs the lookup (so every pin inside one coarse pixel shares one answer).

| id | Arguments | NASA login | Time limit | Kept | Snapped |
|---|---|---|---|---|---|
| `canopy` | LAT LON W D NX NY | no | 120 s | 90 days | no |
| `cdl` | LAT,LON … (1 to 5 spots) | no | 120 s | 30 days | no |
| `dem` | LAT LON W D NX NY [SOURCE] | no | 120 s | 30 days | no |
| `ecostress` | LAT LON | yes | 150 s | 24 h | no |
| `faostat` | none | no | 420 s | 24 h | shared by all |
| `gedi` | LAT LON | yes | 150 s | 90 days | 0.005° |
| `grace` | LAT LON | for a newer file only | 300 s | 24 h | 0.05° |
| `gracegrid` | none | for a newer file only | 300 s | 24 h | shared by all |
| `hls` | LAT LON | yes | 150 s | 24 h | no |
| `horizon` | LAT LON [W D] | no | 120 s | 90 days | no |
| `imerg` | LAT LON FROM TO | yes | 120 s | 6 h | centre of the 0.1° square |
| `isda` | LAT LON | no | 30 s | 30 days | no |
| `landcover` | LAT LON W D NX NY | no | 120 s | 30 days | no |
| `ndvi` | LAT LON | no | 240 s | 7 days | 0.002° |
| `ndvihist` | LAT LON | no | 300 s | 30 days | 0.002° |
| `osm` | LAT LON W D | no | 150 s | 30 days | no |
| `prices` | none | no | 300 s | 12 h | shared by all |
| `smap` | LAT LON | yes | 420 s | 7 days | 0.01° |
| `soilgrids` | LAT LON | no | 120 s | 90 days | 0.002° |
| `soilsurvey` | LAT LON | no | 150 s | 30 days | no |
| `water` | LAT LON W D | for the passes since 2023 only | 300 s | 24 h | no |

## 3. The layout of a lookup's section

Every lookup has one section below, with these parts in this order. `soilgrids` is the worked example.

1. **What it is**: one or two lines: what the farmer gets, from which source, whether it needs the NASA login.
2. **Request**: the path and its query fields with units and limits; the arguments the script receives.
3. **Example request**.
4. **Good answer**: one real example, then every field with its type, unit and plain meaning.
5. **Failure answers**: one example of EACH, with the plain-words reason the screen will show; which are final.
6. **Partial answers**: what marks one, or "none".
7. **Time limit**: the server's, the lookup's own stop, the limit of one request.
8. **Memory**: the limit and the **measured** peak, and how it was measured.
9. **Kept**: how long the server keeps the answer; any files the lookup itself keeps under `FW_CACHE`.
10. **Snapped**: which pixels are snapped, and what the answer says about the spot it really read.
11. **Source and manners**: the service, the address pattern, how many requests one lookup sends.
12. **Checked by**: the suite, its test inputs, the by-hand live check; and "Checked against the live service" with the date
    and what was found.

---

## soilgrids

**What it is.** The soil of the top 30 cm at one spot (clay, sand, silt, organic carbon, pH, nitrogen, nutrient-holding
capacity) from ISRIC's world soil map SoilGrids, 250 m pixels. It is the **back-up route**: the browser asks ISRIC's REST
service (`rest.isric.org`) itself first; when that has not answered within 2.5 s or fails, the browser asks this lookup
too and takes the first good answer. No NASA login.

**Request.** `GET /api/soilgrids?lat=&lon=`

| Field | Unit | Limits |
|---|---|---|
| `lat` | decimal degrees | -90..90; blank is missing, never 0 |
| `lon` | decimal degrees | -180..180; blank is missing, never 0 |

The script receives `LAT LON`, snapped to 0.002° and written with 4 decimals: `soilgrids.py 44.4000 -79.7800`.

**Example request.** `GET /api/soilgrids?lat=44.4&lon=-79.78` (Barrie, Ontario)

**Good answer** (the live answer of 2026-11-14):

    {"ok":true,"source":"ISRIC SoilGrids 2.0 (map-download service)","data_date":"2020",
     "data_date_note":"A fixed world soil map, version 2.0, published by ISRIC in 2020: it does not change from day to day",
     "properties":{"clay":17.067,"sand":50.783,"silt":32.2,"soc":26.2,"phh2o":6.75,"nitrogen":2.117,"cec":16.083},
     "units":"clay, sand, silt %; soc and nitrogen g/kg; cec cmol(c)/kg; phh2o pH",
     "depth":"0-30 cm, weighted by layer thickness","lat":44.4,"lon":-79.78,"pixel_m":250,"licence":"CC BY 4.0",
     "checked":"2026-11-14T18:49:21Z"}

| Field | Type, unit | Meaning |
|---|---|---|
| `source` | text | the map and the door it was read through; the version in it is read from the service at each lookup |
| `data_date` | text, a year | the year ISRIC published this version of the map (2.0: 2020). The map is fixed: it is not a measurement of a day. |
| `data_date_note` | text | the same in a sentence, for the "i" card |
| `properties.clay`, `.sand`, `.silt` | number, % of the fine earth, 3 decimals, or `null` | the texture parts |
| `properties.soc` | number, g/kg, or `null` | organic carbon |
| `properties.phh2o` | number, pH units, or `null` | pH in water |
| `properties.nitrogen` | number, g/kg, or `null` | total nitrogen |
| `properties.cec` | number, cmol(c)/kg, or `null` | nutrient-holding capacity (cation exchange capacity) |
| `units` | text | the units above in one sentence |
| `depth` | text | each figure is the mean of the layers 0-5, 5-15 and 15-30 cm, weighted 5, 10 and 15 |
| `lat`, `lon` | decimal degrees | the spot that was read (the snapped point) |
| `pixel_m` | number, metres | the size of the map's pixels: 250 |
| `licence` | text | CC BY 4.0: the source must be named wherever the figures are shown |
| `no_value`, `note` | list of names, text; only when present | properties the map has no value for at this spot (they are `null`) |
| `checked` | UTC time | when the service was asked |

A property is `null` when the map has no value at this spot in **any** of its three depths: a mean over the depths that do
have one would not be the top 30 cm. `null` is never shown as 0.

**Failure answers.** The soil card shows the reason; when no route gives usable numbers it says "The soil map sent
incomplete numbers. The soil survey or your own pick is used instead."

| Answer | When | Final |
|---|---|---|
| `{"ok":false,"reason":"lat and lon are required as decimal degrees"}` | an argument missing, blank or not a number | no |
| `{"ok":false,"reason":"lat must be -90..90 and lon -180..180"}` | out of range | no |
| `{"ok":false,"reason":"ISRIC's map service did not answer; try again in a minute"}` | the version question or the first layer got no answer in two tries; nothing more is asked | no |
| `{"ok":false,"reason":"ISRIC's map service did not send 1 of 21 soil layers; try again in a minute"}` | one or more layers did not arrive, or arrived broken (not a map piece, not the pixel asked for, a value that cannot be right). All or nothing: a layer left out would change the mean. | no |
| `{"ok":false,"reason":"ISRIC's map service asked us to slow down; try again in a few minutes"}` | the service answered 429; the lookup stops at once | no |
| `{"ok":false,"reason":"ISRIC's map service took too long to answer; try again in a minute"}` | the lookup reached its own stop at 115 s | no |
| `{"ok":false,"reason":"ISRIC's map service did not say which soil map it is serving; try again in a minute"}` | the service's description has no map title | no |
| `{"ok":false,"reason":"ISRIC now serves version 3.0 of its soil map, and Crophalo has not been checked against it yet"}` | a version whose units and year nobody has checked: no number is better than a wrong one | no |
| `{"ok":false,"reason":"SoilGrids has no soil value for this spot (built-up land, water or ice)"}` | every layer arrived and clay, sand and silt are all without a value. Not final on purpose: the lookup cannot tell a true "no value" from an empty piece sent by an unwell service, so another try is allowed. | no |
| `{"ok":false,"reason":"SoilGrids has no map for this place (too far north or south, or on the map's edge)","final":true}` | the service says the spot is outside its map (HTTP 400, `ExtentError`) | **yes** |

**Partial answers.** None: all 21 layers or a failure.

**Time limit.** Server: 120 s. The lookup stops itself at 115 s. One request: 20 s, two tries. Measured live on 2026-11-14:
11.1 s, 11.8 s and, with the service slower, 33.7 s.

**Memory.** Limit 300 MB. Measured peak: **60 MB** live on 2026-11-14 (three runs: 57.6, 59.4 and 60.0 MB; 53 to 58 MB
replayed), read from the lookup's last log line; `/usr/bin/time -l` gave the same figure (54.7 MB for a
replayed run that reported 54.7 MB). Nearly all of it is the raster library.

**Kept.** The server keeps a whole answer 90 days, the final failure 24 hours, any other failure not at all. The lookup
keeps no file.

**Snapped.** The server snaps the point to 0.002° (about 220 m north-south), so pins inside one map pixel mostly share one
answer. The lookup reads the **one 250 m pixel that holds the snapped point** and says which point that was (`lat`, `lon`).
The snapped point can lie up to 0.001° from the pin, so near a pixel's edge the neighbouring pixel is read.

**Source and manners.** ISRIC World Soil Information, map-download service (WCS 2.0.1), no key, no login.
22 requests per lookup, at most 2 at a time (1 on a small host), 0.25 s apart:

    https://maps.isric.org/mapserv?map=/map/clay.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCapabilities&SECTIONS=ServiceIdentification
    https://maps.isric.org/mapserv?map=/map/{prop}.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID={prop}_{depth}_mean
        &FORMAT=GEOTIFF_INT16&SUBSET=long({lon-0.001},{lon+0.001})&SUBSET=lat({lat-0.001},{lat+0.001})
        &SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326&SCALESIZE=long(1),lat(1)

`prop`: clay, sand, silt, soc, phh2o, nitrogen, cec. `depth`: 0-5cm, 5-15cm, 15-30cm. Each piece is one 16-bit pixel; the
stored whole number divided by 10 (nitrogen: 100) is the unit above; 0 or below is "no value". The first request reads the
map's title ("SoilGrids250m 2.0 - …") for the version. The first layer is asked alone, so a place outside the map or a
service that is down costs 2 or 3 requests, not 22.

**Checked by.** `node scripts/test_live_common.mjs` (offline) on `scripts/fixtures/live/soilgrids-barrie`, `-ocean` and
`-outside`, recorded from the live service on 2026-11-14 with `node scripts/live_record.mjs`; the failure cases are those
recordings with one thing changed by hand. By hand, live: `node scripts/live_check_soilgrids.mjs`.

*Checked against the live service on 2026-11-14:*

- **One pixel, 0.001° each side, `SCALESIZE=long(1),lat(1)`.** A window of 0.002° each side comes back as 2 x 2 pixels with
  the spot on their shared corner, and the four are not the same soil: at Barrie the stored clay of the top layer was 175
  in the upper row and 183 in the lower. Asked as one pixel centred on the spot, the service sends 183, which is what
  ISRIC's REST service gives for the same spot. A window of 0.0005° each side is refused by the service ("Raster size out
  of range").
- **The seven figures equal the REST service's** for Barrie (44.4, -79.78), to the third decimal, with the divisors the
  REST service itself states (`d_factor` 10; nitrogen 100).
- **Outside the map** (80° S; 86° N; a window across longitude 180) the service answers HTTP 400 with `ExtentError`:
  that is the final failure. **The open sea** (30° N, 40° W) answers a map piece holding 0: no value, not final.
- **2 requests at a time, not 8**, and 20 s per request with two tries, to stay polite and inside the time limit.

---

<!-- The sections below are written for each lookup, in the layout of section 3, BEFORE the lookup itself.
     Replace only your own block (the heading stays), and read the file again just before you change it: others are writing too. -->

## canopy

*To be written.*

## cdl

*To be written.*

## cropsnear

**What it is.** Which field crops farmers grow around the field, as shares of the farmland in a box 0.25 degrees across
centred on it (about 28 km north to south; east to west 20 km at 43 to 44 N), from the newest year of the national 30 m
crop map: in Canada Agriculture and Agri-Food Canada's Annual Crop Inventory, in the 48 lower US states USDA NASS's
Cropland Data Layer. It is the "grown nearby" gate of the report: `js/nearby.js` turns the answer into `spot.absent` and
`spot.common` for `js/engine.js`. No NASA login.

**Request.** `GET /api/cropsnear?lat=&lon=&country=`

| Field | Unit | Limits |
|---|---|---|
| `lat` | decimal degrees | -84..84; blank is missing, never 0 |
| `lon` | decimal degrees | -180..180; blank is missing, never 0 |
| `country` | ISO 3166 code | `CA` or `US` (the reverse-geocoded country of the pin) |

The script receives `LAT LON COUNTRY`: `cropsnear.py 43.1300 -80.7500 CA`.

**Example request.** `GET /api/cropsnear?lat=43.13&lon=-80.75&country=CA` (Oxford County near Woodstock, Ontario)

**Good answer** (the live answer of 2026-11-14, `classes` left out here):

    {"ok":true,"source":"Agriculture and Agri-Food Canada (AAFC), Annual Crop Inventory 2025, 30 m","data_date":"2025",
     "data_date_note":"One map a year, made after each harvest from satellite images; 2025 is the newest year it has published",
     "units":"share: part of the farmland in the box (0 to 1), from the map's own pixel counts; ha: hectares on the ground (one 30 m pixel of the map's Web Mercator grid is 0.0479 ha here)",
     "year":2025,"country":"CA","box":{"south":43.005,"west":-80.875,"north":43.255,"east":-80.625},"half_deg":0.125,
     "pixel_ha":0.0479,"box_ha":56539.1,"cropland_ha":42781.2,"cropland_share_of_box":0.7567,"not_read_share":0.0,
     "crops":[{"crop":"corn","share":0.4982,"ha":21312.3},{"crop":"soy","share":0.263,"ha":11249.7},{"crop":"wheat","share":0.0972,"ha":4159.6},
              {"crop":"bean","share":0.005,"ha":212.9},{"crop":"rye","share":0.0009,"ha":37.2},{"crop":"potato","share":0.0007,"ha":29.0},
              {"crop":"tobacco","share":0.0004,"ha":15.4},{"crop":"pea","share":0.0002,"ha":9.7}],
     "wider":[{"code":122,"name":"Pasture/forages","crops":["alfalfa","ley"],"share":0.1322,"ha":5655.9},
              {"code":153,"name":"Canola/rapeseed","crops":["canola","scanola"],"share":0.0002,"ha":10.4}],
     "licence":"Open Government Licence - Canada","checked":"2026-11-14T22:36:17Z"}

| Field | Type, unit | Meaning |
|---|---|---|
| `source`, `data_date`, `data_date_note` | text | the map, its year (the newest it has published) and the same in words |
| `year`, `country` | number, text | the map year read; `CA` or `US` |
| `box`, `half_deg` | degrees | the box counted: the field ± `half_deg` (0.125) |
| `pixel_ha` | hectares | the ground area of one 30 m pixel of the maps' Web Mercator grid at this latitude, (30 × cos lat)² |
| `box_ha`, `cropland_ha`, `cropland_share_of_box` | hectares, 0..1 | every pixel with a reading; the farmland among them (`cropsnear_map.json` "cropland": AAFC classes 120 to 199, pasture and forages included; the USDA crop classes, its grassland and pasture class 176 not included) |
| `not_read_share` | 0..1 | pixels nobody read (cloud; USDA "No Data") |
| `crops[]` | crops.js id, 0..1, hectares | each crop whose OWN class has pixels in the box; a double-crop class counts for both crops |
| `wider[]` | code, name, ids, 0..1, hectares | classes that hold several crops without saying which; `"*"` = any crop not classed on its own |
| `classes[]` | code, name, kind, ids, 0..1, hectares | every farmland class in the box, largest first, kind `own`, `wider` or `other` |

**Failure answers.**

| Answer | When | Final |
|---|---|---|
| `{"ok":false,"reason":"lat and lon are required as decimal degrees"}` | an argument missing, blank or not a number | no |
| `{"ok":false,"reason":"The crop maps read here cover Canada (CA) and the 48 lower US states (US) only","final":true}` | no country, or another country | **yes** |
| `{"ok":false,"reason":"The Canadian crop map (AAFC Annual Crop Inventory) did not answer just now; try again in a minute"}` | the list of years or the count got no answer in two tries (US: "The US crop map (USDA Cropland Data Layer) …") | no |
| `{"ok":false,"reason":"The Canadian crop map (AAFC Annual Crop Inventory) asked us to slow down; try again in a few minutes"}` | HTTP 429; nothing more is asked | no |
| `{"ok":false,"reason":"The Canadian crop map (AAFC Annual Crop Inventory) did not list any year of its map; try again later"}` | the list of services holds no `annual_crop_inventory/YYYY` (US: no newest `YYYY_NNm_cdls` raster) | no |
| `{"ok":false,"reason":"The Canadian crop map (AAFC Annual Crop Inventory) sent counts Crophalo could not read; try again in a minute"}` | the histogram is not one bin per class value from 0 | no |
| `{"ok":false,"reason":"The Canadian crop map (AAFC Annual Crop Inventory) used a class Crophalo does not know (…); its class list must be checked first"}` | a class value missing from `aci_classes.json` / `cdl_codes.json`: no share is sent while the class list is not checked | no |
| `{"ok":false,"reason":"The Canadian crop map (AAFC Annual Crop Inventory) has no reading for this place","final":true}` | the box lies outside the map | **yes** |
| `{"ok":false,"reason":"The crop map took too long to answer; try again in a minute"}` | the lookup reached its own stop at 115 s | no |

**Partial answers.** None: one count over the whole box, or a failure.

**Time limit.** Server: 120 s. The lookup stops itself at 115 s. One request: 45 s, two tries. Measured live on 2026-11-14:
0.65 s (Oxford), 0.52 s (Barrie), 0.49 s (Iowa).

**Memory.** Limit 300 MB. Measured peak: **26.5 MB** live on 2026-11-14 (25.9, 25.8 and 26.5 MB), read from the lookup's
last log line.

**Kept.** The server keeps a whole answer 30 days (the maps are yearly), the final failure 24 hours. The lookup keeps no file.

**Snapped.** Not snapped: the box is centred on the pin as sent (4 decimals).

**Source and manners.** Two requests per lookup, one at a time:

    CA  https://agriculture.canada.ca/imagery-images/rest/services/annual_crop_inventory?f=json                (the years)
        https://agriculture.canada.ca/imagery-images/rest/services/annual_crop_inventory/{year}/ImageServer/computeHistograms
            ?geometry={"xmin":W,"ymin":S,"xmax":E,"ymax":N,"spatialReference":{"wkid":4326}}&geometryType=esriGeometryEnvelope
            &pixelSize={"x":30,"y":30,"spatialReference":{"wkid":102100}}&f=json
    US  https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer/query?where=Category=1&outFields=OBJECTID,Name,Year
            &orderByFields=Year DESC&resultRecordCount=1&returnGeometry=false&f=json                        (the newest raster)
        https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer/computeHistograms?… (as above)
            &mosaicRule={"mosaicMethod":"esriMosaicLockRaster","lockRasterIds":[id]}

The histogram has one bin per class value (min -0.5, bin width 1). The class names come from the maps' own lists, shipped
as `aci_classes.json` (AAFC's crop classification CSV, read on 2026-11-14) and `cdl_codes.json` (USDA's list). The map
from class to crop is `cropsnear_map.json`, written by hand.

**Checked by.** `node scripts/test_cropsnear.mjs` (offline) on `scripts/fixtures/live/cropsnear-oxford`, `-barrie` and
`-ames`, recorded from the live services on 2026-11-14 with `FW_NET_RECORD`; the failure cases are those recordings with
one thing changed by hand, in a temp folder.

*Checked against the live service on 2026-11-14:*

- **The AAFC address of the open.canada.ca record works** without a key; the service list names every year from 2009 to
  2025. `computeHistograms` over the Oxford box at 30 m counted 1,179,488 pixels, which is the box at the map's own 30 m
  Web Mercator pixels (928 × 1,270): the count is not resampled.
- **Values 20 to 230** at Oxford, every one in AAFC's class list; Oxford's largest farmland classes in 2025 were corn for
  grain, soybeans, pasture/forages and winter wheat; at Barrie soybeans, pasture/forages, corn and winter wheat.
- **USDA's CroplandCROS service** answers `query` for the newest raster (2025, `2025_10m_cdls`) and `computeHistograms`
  with that raster locked; asked at 30 m it counts the 10 m map at 30 m.

## dem

*To be written.*

## ecostress

*To be written.*

## faostat

*To be written.*

## gedi

*To be written.*

## grace

*To be written.*

## gracegrid

*To be written.*

## hls

*To be written.*

## horizon

*To be written.*

## imerg

*To be written.*

## isda

*To be written.*

## landcover

*To be written.*

## ndvi

*To be written.*

## ndvihist

*To be written.*

## osm

*To be written.*

## prices

*To be written.*

## smap

*To be written.*

## smaproot

**What it is.** How wet the soil is around the roots (the top metre), for the one cell of NASA's 9 km SMAP grid that holds the field, from the newest SMAP Level-4 file (SPL4SMGP, version 8). Needs the NASA login. The cell is a box of latitudes and longitudes, not a square: the grid keeps every cell the same area, so at Barrie it is about 7.4 km wide and 10.9 km tall. (The older `smap` lookup is a different series: the top 5 cm, one reading a month.)

**Request.** `GET /api/smaproot?lat=44.4037&lon=-79.7791`; the server snaps the place to 0.01 degrees (so every pin inside one square of about 1 km shares one answer) and runs `smaproot.py LAT LON` with `44.40 -79.78`. `lat` is -85..85 (the grid ends at 85.044), `lon` -180..180.

**Good answer** (real numbers, Barrie; the days are written as they come, YYYY-MM-DD):

    {"ok":true,"source":"NASA SMAP Level-4 root-zone soil moisture (SPL4SMGP, version 8), from NASA's National Snow and Ice Data Center DAAC",
     "data_date":"YYYY-MM-DD","units":"Volume of water per volume of soil, 0 to 1 (0.25 is a quarter of the soil's volume being water), for the whole root zone (0 to 100 cm)",
     "value":0.1013,"date":"YYYY-MM-DD","km":9,
     "cell":{"lat":44.3537,"lon":-79.777,"row":243,"col":1073,"width_km":7.4,"height_km":10.9,"edges":{"n":44.40273,"s":44.30463,"e":-79.73029,"w":-79.82366}},
     "window":{"start":"YYYY-MM-DDT21:00:00.000Z","end":"YYYY-MM-DDT00:00:00.000Z"},"granule":"SMAP_L4_SM_gph_YYYYMMDDT223000_Vv8013_001.h5","age_days":3,
     "note":"One value for the whole cell. ...","checked":"YYYY-MM-DDTHH:MM:SSZ","spot":{"lat":44.4,"lon":-79.78},"cached":false,"fetched":"YYYY-MM-DDTHH:MM:SS.sssZ"}

| Field | Meaning |
|---|---|
| `value` | share of the soil's volume that is water, 0 to 1, 4 decimals; the file's own valid range is 0 to 0.9 |
| `date` / `data_date` | the UTC day of the file's own time (a 3-hour average); never the day of the lookup |
| `km` | 9: the nominal width of the grid, for the words on screen |
| `cell` | the file's own cell centre (`lat`, `lon`), its grid `row` and `col`, its size on the ground and its four `edges` in degrees; the field lies inside (a place exactly on an edge counts as inside) |
| `window` | the 3-hour period the file averages, from the catalogue |
| `age_days` | whole days between the file's time and today |
| `spot` | added by the server: the place really read, snapped to 0.01 degrees |

**Failure answers.** `lat and lon are required as decimal degrees` / `lat must be -85..85 and lon -180..180` (the common ones); `NASA's catalogue lists no recent SMAP soil-moisture file just now; try again later`; `SMAP has no soil-moisture value for the square that holds this place (open water or ice)` (**final**); `NASA Earthdata did not accept this computer's login for the soil-moisture data: ...`; `The SMAP files are no longer on the 9 km grid Crophalo was checked against: no value is better than one from the wrong place`; `NASA's soil-moisture service took too long to answer; try again in a minute`; `The data source did not answer just now; try again in a minute`.

**Partial answers.** None: the answer is one value or a failure.

**Time limit.** 150 s on the server; the lookup answers by itself 5 s before. One request waits at most 60 s. Live, Barrie: 4 to 7 s.

**Memory.** Limit 300 MB. Measured live (Barrie, the folder's Python): peak 53.5 to 55.2 MB, three requests.

**Kept.** The server keeps a whole answer 6 hours, a final failure 24 hours; the lookup keeps no file.

**Snapped.** To 0.01 degrees by the server. The answer's `cell` and `spot` say what was really read.

**Source and manners.** NASA CMR (open) for the newest file; NASA's token service; NASA's OPeNDAP service for ONE cell: `.dap?dap4.ce=` with `/Geophysical_Data/sm_rootzone[row][col]` and the cell's own `cell_lat`, `cell_lon`, `x`, `y` and `time` (the constraint is written out with percent-escapes: the service refuses raw brackets). Three requests in all. The cell the grid's published definition names is checked against the file's own `x` and `y`; if the place is not inside it, the neighbouring cell is asked for (at most three tries), else the lookup fails rather than read a wrong cell. If the newest file does not answer, the one before it is read.

**Checked by.** `scripts/test_live_smaproot.mjs` (offline; NASA's answers hand-made in the real format from real numbers), `scripts/test_smap_route.mjs` (the server's runner with a stand-in Python), `scripts/live_check_smaproot.mjs` (by hand, live).

**Checked against the live service.** The catalogue answers `SPL4SMGP` newest first and gives the OPeNDAP address in the `service#` link. The variable `sm_rootzone` has the shape `[y][x]` (1624 by 3856) with no time axis: the first try with a `[0]` in front was refused. Cells over open water hold -9999. Barrie 0.1013, Iowa 0.35, Kenya 0.27, Konya 0.21, Sydney 0.10, a desert cell 0.14, an Atlantic cell no value.

## soilsurvey

*To be written.*

## water

*To be written.*
