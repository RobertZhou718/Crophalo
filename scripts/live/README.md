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

## ecopass

**What it is.** The ground temperature, seen from space at about 70 m, of the pixel that holds the field, for the newest clear passes of NASA's ECOSTRESS instrument (on the International Space Station) in the last 60 days. It is the temperature of the surface (soil, leaves, snow), not the air temperature. ECOSTRESS passes at different hours (the station's orbit drifts through the day), so each pass says its own date and local solar time, and passes made at different hours must never be compared as if they were the same time of day. Only the field's own pixel is read; a pixel with cloud, lower quality, water or no view is never a reading. Needs the NASA login.

**Request.** `GET /api/ecopass?lat=43.13&lon=-80.75`; latitude -52..52 (ECOSTRESS does not see further). The server snaps the place to 0.0005 degrees (about 50 m, finer than the 70 m pixel, so the pin keeps its own pixel) and runs `ecopass.py LAT LON`.

**Good answer** (real numbers, Oxford County, 2026-11-14; the days are written as they come):

    {"ok":true,"source":"NASA ECOSTRESS tiled land surface temperature, 70 m (ECO_L2T_LSTE), from NASA's Land Processes DAAC",
     "data_date":"YYYY-MM-DD","units":"Ground (surface skin) temperature seen from space for one 70 m pixel, in degrees Celsius (and kelvin), at the time of each pass; not the air temperature",
     "pixel_m":70,"window":{"first":"YYYY-MM-DD","last":"YYYY-MM-DD"},
     "passes":[{"date":"YYYY-MM-DD","utc":"07:02","solar_time":"01:39","solar_date":"YYYY-MM-DD","day_night":"night","lst_c":-2.3,"lst_k":270.82,"error_k":1.0,"orbit":47324,"version":"002","granule":"ECOv002_L2T_LSTE_47324_006_17TNH_..."}, "..."],
     "clear_passes":4,"passes_checked":24,"not_usable":{"cloud":2,"quality":2,"water":0,"no_data":16},"read_errors":0,"newest_clear":"YYYY-MM-DD","note":"..."}

| Field | Meaning |
|---|---|
| `passes` | up to 4 clear passes, newest first, one per orbit (the next scene of the same overpass is not a second pass). `lst_c` / `lst_k` the ground temperature, `error_k` the file's own estimate of its error (kelvin) |
| `utc`, `solar_time`, `day_night` | when the pass was made: UTC, the field's mean local solar time (UTC plus longitude / 15 hours; not the clock on the wall, which depends on the time zone and the season), and NASA's own day or night flag |
| `version` | the product version the pass came from: 003 where it has the pass, else 002 (the passes of both versions are the same overpasses) |
| `passes_checked`, `not_usable` | how many passes were looked at (newest first, at most 36) and why the others gave no reading: `cloud` (the final cloud mask), `quality` (the quality code is not the best quality, or the value is outside 200 to 360 K), `water`, `no_data` (the pass did not see the field's pixel, or its cloud mask is "not known") |
| `incomplete` | present when some pass could not be read just now, or the time ran out before the newest 36 were looked at |
| `why_none` | present when no pass was clear: the answer is still a good one (`passes` empty), never a made-up temperature |

**Failure answers.** The common two for bad arguments (`lat must be -52..52`); `NASA's catalogue lists no ECOSTRESS pass over this place in the last 60 days...` (not final); `NASA did not accept this computer's login`; the files refused for the login (it may need approving for NASA LP DAAC); `NASA's ECOSTRESS files could not be read just now` (every pass failed, not final).

**Partial answers.** Yes: `incomplete` and `read_errors` say which passes were not read.

**Time limit.** 150 s on the server. Live, Oxford: 48 to 65 s (about 50 small reads; the service allows two at a time). The lookup stops looking at older passes 25 s before its limit and says so.

**Memory.** Limit 300 MB. Measured live: peak 104 MB (rasterio and numpy loaded; one pixel per read).

**Kept.** Suggested: 6 hours for a whole answer (a new pass lands every day or two); a final failure an hour.

**Source and manners.** NASA CMR (open) for the granules over the point; NASA's token service; then range reads of ONE pixel of the `LST`, `cloud`, `QC`, `water` and `LST_err` layers of each pass (cheap exits first: a pass the field is not in costs one read). Rules: cloud mask 0 only; the quality code's two lowest bits `00` (best quality; "nominal" can mean possible cloud contamination, so it is not used); water mask 0; value 200 to 360 K. Cite ECO_L2T_LSTE, NASA LP DAAC.

**Checked by.** `scripts/test_live_ecopass.mjs` (offline: small GeoTIFFs built the real way by rasterio, whose neighbours of the field's pixel are deliberately wrong), `scripts/live_check_ecopass.mjs` (by hand, live).

**Checked against the live service.** Oxford, 2026-11-14: 24 passes looked at, 4 clear (the newest night passes and one morning pass), 2 cloud, 2 lower quality, 16 not covering the field's pixel; one pass's five layers compared with a direct sample of the same files, same values (282.26 K, error 1.36 K, quality code 35520 whose lowest two bits are 00, cloud 0, water 0).

## faostat

*To be written.*

## gedi

*To be written.*

## grace

*To be written.*

## gracegrid

*To be written.*

## gracecell

**What it is.** The water stored in the ground and soil (groundwater, soil water, snow and surface water together) over a region about 300 km wide round the field, month by month since the first month of the record, from NASA's GRACE and GRACE-FO satellites (JPL mascon solution RL06.3Mv04, coastal-filtered). It is the change in centimetres of water from the 2004 to 2009 average, not a well and not a reading in the field. Needs the NASA login. The values are read from the 0.5 degree cell that holds the field; the satellites cannot see finer than about 300 km (the mascons are 3 degree caps), so the answer's `area_km` is 300 and a screen should draw the region as about 300 km, never as the 0.5 degree cell.

**Request.** `GET /api/gracecell?lat=43.13&lon=-80.75`; the server snaps the place to the CENTRE of its 0.5 degree cell (`lat = floor(lat*2)/2 + 0.25`, same for lon; never round-to-0.5) and runs `gracecell.py LAT LON`.

**Good answer** (real numbers, Oxford County, 2026-11-14; `months` is shortened here):

    {"ok":true,"source":"NASA GRACE and GRACE-FO, JPL mascon solution RL06.3Mv04 (Coastal Resolution Improvement filter), from NASA's Physical Oceanography DAAC",
     "data_date":"2002-04/2026-09","units":"Centimetres of water, as the change from the 2004 to 2009 average, for the whole of the ground, soil, snow and surface water over a region about 300 km wide",
     "cell":{"lat":43.25,"lon":-80.75,"width_km":40.5,"height_km":55.6,"edges":{"n":43.5,"s":43.0,"e":-80.5,"w":-81.0}},"area_km":300,
     "months":[["2002-04",1.18,13.01],["2002-05",3.8,6.9],["2002-06",null,null],"...",["2026-09",-4.12,7.54]],
     "months_read":259,"gaps":["2002-06","2002-07","..."],"gap_spans":[["2002-06","2002-07"],"..."],"merged_months":["2012-01","2015-04"],
     "newest_month":"YYYY-MM","newest_date":"YYYY-MM-DD","value_cm":-4.12,"uncertainty_cm":7.54,
     "trend_cm_per_year":0.17,"trend_from":"2002-04","trend_to":"2026-09","trend_years":24.4,"note":"..."}

| Field | Meaning |
|---|---|
| `months` | one entry per calendar month from the first to the newest month: `[month, cm, uncertainty_cm]`. A month with no solution is `[month, null, null]`: the satellites did not measure it (the 2017 to 2018 gap between GRACE and GRACE-FO, and single months before and after). Never 0, never interpolated |
| `merged_months` | months the file has two part-month solutions for; the entry is their mean |
| `gaps` / `gap_spans` | the empty months, and the runs of them as `[first, last]` |
| `value_cm`, `uncertainty_cm` | the newest month's value and the file's own one-sigma uncertainty for it (several centimetres: most single months are within the noise, so show the trend and the series, not one month as a fact) |
| `trend_cm_per_year` | the least-squares straight line through all months read, in cm of water a year; `null` unless at least 5 years are spanned and at least 60 months were read (then `trend_note` says so). A long-term slope of a regional signal, not a forecast |
| `cell`, `area_km` | the 0.5 degree cell read, with its size on the ground and edges; and the region the value stands for |

**Failure answers.** The common two for bad arguments; `NASA's catalogue lists no GRACE-FO groundwater file just now; try again later`; `NASA did not accept this computer's login`; the file refused for the login (it may need approving for PO.DAAC); `This place is open water for the GRACE-FO data...` and `NASA has no GRACE-FO value for this place` (both final); `NASA's GRACE-FO file is no longer laid out the way Crophalo was checked against` (shape, units, axes or the cell's own coordinates differ: no value is better than one from the wrong place).

**Partial answers.** None for the lookup as a whole: gaps are part of the answer, not a failure, and are named.

**Time limit.** 150 s on the server. Live, Oxford: about 27 s (the file's index is read first, then the cell's chunks in parallel).

**Memory.** Limit 300 MB. Measured live: peak 110 MB (h5py and numpy loaded; the cell's chunks are decompressed one at a time). The file is never loaded: 21 requests of 256 KB, 5.4 MB of a 44 MB file. The old design that needed 2 GB read the whole file.

**Kept.** Suggested: a whole answer for 7 days (a new month arrives about once a month); a failure for an hour.

**Source and manners.** NASA CMR (open) names the one file; NASA's token service; then Range requests to NASA PO.DAAC's archive for ONLY the pieces that hold the cell (h5py opens a block-reading stand-in for the file), never more than 80 requests or 24 MB. NASA's OPeNDAP service does not serve this collection, so the range read is the one-cell method. Cite the DOI 10.5067/TEMSC-3JC634.

**Checked by.** `scripts/test_live_gracecell.mjs` (offline: a small file built the real way by h5py and served in the same pieces), `scripts/live_check_gracecell.mjs` (by hand, live).

**Checked against the live service.** Oxford, 2026-11-14: 294 months from 2002-04 to 2026-09, 259 with a value and 35 empty; every month compared with a full read of the file (netCDF4) with no difference; trend 0.17 cm a year over 24.4 years.

## hls

*To be written.*

## hlsndvi

**What it is.** How green the field looked from space, about 30 m per dot, for the last 12 months: NDVI (greenness) from NASA's Harmonized Landsat and Sentinel-2 surface reflectance (HLS v2.0: Sentinel-2 bands B04 and B8A, Landsat 8 and 9 bands B04 and B05), averaged over the clear dots of a 3 by 3 box (90 m) round the pin. One value for each 15-day period, from the pass of that period with the lowest cloud cover over its tile that is also clear at the field; a period with no clear pass is left empty and named in `gaps`. Needs the NASA login. A cloud, a cloud shadow, a dot next to either, snow, ice or water is never "low greenness": it is left out, and a pass counts only when at least 5 of the 9 dots are clear.

**Request.** `GET /api/hlsndvi?lat=43.13&lon=-80.75`, optionally `&first=YYYYMMDD&last=YYYYMMDD` for another window (at most 800 days; this is how to ask for the same days of earlier years: HLS holds Landsat since 2013 and Sentinel-2 since late 2015, so the record allows it, one call per year); the server snaps the place to 0.0001 degrees (about 10 m, so the pin keeps its own box) and runs `hlsndvi.py LAT LON [FIRST LAST]`.

**Good answer** (real numbers, Oxford County, 2026-11-14; the days are written as they come, `passes` is shortened):

    {"ok":true,"source":"NASA / USGS Harmonized Landsat and Sentinel-2 (HLS) surface reflectance, 30 m, version 2.0, from NASA's Land Processes DAAC",
     "data_date":"YYYY-MM-DD/YYYY-MM-DD","units":"NDVI (greenness) from the red and near-infrared surface reflectance of the 30 m dots round the field, 0 is bare ground or dead plants and about 0.8 is thick healthy green",
     "pixel_m":30,"box":{"pixels":"3x3","size_m":90,"lat":43.13,"lon":-80.75},"window":{"first":"YYYY-MM-DD","last":"YYYY-MM-DD"},
     "passes":[{"date":"YYYY-MM-DD","sensor":"Sentinel-2","ndvi":0.528,"clear_pixels":9,"of_pixels":9,"tile_cloud_pct":19.0,"tile":"T17TNH","granule":"HLS.S30.T17TNH.YYYYDDDThhmmss.v2.0"}, "..."],
     "periods":24,"periods_read":17,"gaps":[["YYYY-MM-DD","YYYY-MM-DD"], "..."],"skipped_periods":[],"not_usable":{"cloud":8,"snow":13,"water":0,"outside":0},"read_errors":0,
     "newest_date":"YYYY-MM-DD","newest_ndvi":0.436,"note":"..."}

| Field | Meaning |
|---|---|
| `passes` | the readings, oldest first: date, satellite (`Sentinel-2` or `Landsat 8 and 9`), the box's mean NDVI (3 decimals), how many of the 9 dots were clear and used, the tile's own cloud percentage (the whole 110 km tile, not the field), the tile and the granule. A pass seen from two neighbouring tiles is one pass, taken from the first tile listed |
| `gaps` | the 15-day periods with no clear reading (cloud, snow in winter, shadow): draw them empty, never as zero |
| `periods`, `periods_read` | how many periods the window has passes in, and how many gave a reading |
| `not_usable` | the candidate passes rejected, by the main reason: `cloud` (cloud, shadow, next to either, or the file's "not known"), `snow`, `water`, `outside` |
| `skipped_periods` | the older periods not looked at before the time ran out (the newest are read first); `incomplete` says so |
| `ndvi` | (near-infrared - red) / (near-infrared + red) of each clear dot, then the mean of the dots; reflectance is the stored value times the file's own scale (0.0001); a dot with no value, or a reflectance or NDVI that cannot be real, is dropped |

**Failure answers.** The common two for bad arguments, and `the first day must be... written YYYYMMDD`; `NASA's catalogue lists no Landsat or Sentinel-2 surface-reflectance pass over this place between ... and ...` (not final); `NASA did not accept this computer's login`; the files refused for the login (it may need approving for NASA LP DAAC); `NASA's satellite greenness files could not be read just now` (every pass failed, not final).

**Partial answers.** Yes: `incomplete` with `read_errors` and `skipped_periods`. No clear pass at all in the window is a good answer with `passes` empty and `why_none`.

**Time limit.** 150 s on the server. Live, Oxford: 83 to 91 s (about 75 small reads at about 2 s each: every file costs a signed redirect, and the service allows two at a time, so one period takes 3 to 9 s). The lookup stops starting new periods 22 s before its limit and says which older ones it left.

**Memory.** Limit 300 MB. Measured live: peak 80 MB.

**Kept.** Suggested: 24 hours for a whole answer; a final failure an hour. A same-days call for an earlier year never changes: it can be kept a week.

**Source and manners.** NASA CMR (open) for the HLSS30 and HLSL30 granules over the point; NASA's token service; then range reads of the 3 by 3 box of three layers (`Fmask`, `B04`, `B8A` or `B05`), never a whole file, cheap exits first (a cloudy pass costs one read). Fmask bits used: 1 cloud, 2 adjacent to cloud or shadow, 3 cloud shadow, 4 snow or ice, 5 water; bit 0 (cirrus) is unused and the aerosol level (bits 6 and 7) is ignored: in this region "high aerosol" is on most clear scenes and says the air was hazy, not that the dot is unusable.

**Checked by.** `scripts/test_live_hlsndvi.mjs` (offline: small GeoTIFFs built the real way by rasterio, whose dots round the box are deliberately wrong), `scripts/live_check_hlsndvi.mjs` (by hand, live).

**Checked against the live service.** Oxford, 2026-11-14: 24 periods, 17 with a reading, 7 empty (the winter), NDVI between 0.29 and 0.53, 8 cloudy and 13 snowy candidates passed over, no read errors; one pass recomputed from a direct read of its three files, same value (0.528, nine dots).

## horizon

*To be written.*

## imerg

*To be written.*

## imergrain

**What it is.** The last 30 days of satellite rain for the one 0.1 degree square (about 8 by 11 km in Ontario) of NASA's GPM IMERG grid that holds the field: one value in millimetres for each day. Day values come from the Late Run (the final-quality run, published about a day behind) and, for the newest days it does not have yet, from the Early Run, named as first estimates. Needs the NASA login. One value is for the whole square, not a gauge in the field.

**Request.** `GET /api/imergrain?lat=43.13&lon=-80.75`; the server snaps the place to the CENTRE of its 0.1 degree square (`floor(v*10)/10 + 0.05`, for lat and lon; never round-to-0.1, which can move the pin into the next square) and runs `imergrain.py LAT LON`.

**Good answer** (real numbers, Oxford County, 2026-11-14):

    {"ok":true,"source":"NASA GPM IMERG daily precipitation, version 07 (Late Run; Early Run for the newest days), from NASA's Goddard Earth Sciences DAAC (GES DISC)",
     "data_date":"YYYY-MM-DD/YYYY-MM-DD","units":"Millimetres of rain over the whole day (UTC day), for the whole 0.1 degree square",
     "cell":{"lat":43.15,"lon":-80.75,"width_km":8.1,"height_km":11.1,"edges":{"n":43.2,"s":43.1,"e":-80.7,"w":-80.8}},
     "days":[["YYYY-MM-DD",0.17,"late"],["YYYY-MM-DD",5.28,"late"],"...",["YYYY-MM-DD",0.0,"late"]],
     "days_read":30,"total_mm":31.3,"late":30,"early":0,"not_published":[],"read_errors":0,"first_estimate":[],"newest_day":"YYYY-MM-DD","note":"..."}

| Field | Meaning |
|---|---|
| `days` | 30 entries, oldest first: `[day, mm, run]`. `mm` is a number (a true 0 is 0, a day that was read) or `null`: a day NASA has not published, a day the file has no value for, or a day that could not be read. Never 0 for a day nobody read. `run` is `"late"`, `"early"` or `null` |
| `total_mm` | the sum of the days that have a value, 1 decimal; with missing days it is a total of fewer days, and `incomplete` says so |
| `first_estimate` | the days read from the Early Run: a first estimate that may change |
| `not_published` / `read_errors` | the days NASA lists no file for / the days that failed just now |
| `incomplete` | present only when some day is null: plain words saying how many and why |
| `cell` | the square's centre, size on the ground and four edges; the field lies inside it |

**Failure answers.** The common two for bad arguments; `NASA has not published its satellite rain for this period yet`; `NASA did not accept this computer's login`; the files refused for the login (it may need approving for GES DISC); `...could not be read just now` (every day failed, not final); a file whose cell is not the one asked for.

**Partial answers.** Yes: some days null, with `incomplete`, `not_published` and `read_errors`. Never zeros in their place.

**Time limit.** 150 s on the server. Live, Oxford: about 19 s for 32 requests.

**Memory.** Limit 300 MB. Measured live: peak 28 MB.

**Kept.** Suggested: 6 hours for a whole answer; a partial one is kept short or not at all.

**Source and manners.** NASA CMR (open) for the day files (Late first, Early only for days the Late Run lacks); NASA's token service; NASA's OPeNDAP service for ONE cell per day: `/precipitation[0][i][j]` with the cell's own `lon` and `lat` read back and checked within 0.011 degrees.

**Checked by.** `scripts/test_live_imergrain.mjs` (offline, NASA's answers hand-made in the real format), `scripts/live_check_imergrain.mjs` (by hand, live).

**Checked against the live service.** Oxford, 2026-11-14: 30 of 30 days from the Late Run, 31.3 mm in total, 32 requests, 19 s.

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
