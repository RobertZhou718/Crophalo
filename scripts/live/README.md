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
- The server may instead hand in a bearer token it asked NASA for once an hour, as `EARTHDATA_TOKEN` in the lookup's environment: `common.earthdata_token()` uses it (20 or more plain token characters; anything else is ignored) and asks NASA for none. It is starred out like the login.
- A lookup that follows NASA's archive to its short-lived file address (ecopass) sends the login to the archive only, never to the address it is sent on.
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
| `crophist` | LAT LON COUNTRY NEAR [RING] | no | 120 s | 30 days | no |
| `dem` | LAT LON W D NX NY [SOURCE] | no | 120 s | 30 days | no |
| `ecostress` | LAT LON | yes | 150 s | 24 h | no |
| `faostat` | none | no | 420 s | 24 h | shared by all |
| `gedi` | LAT LON | yes | 150 s | 90 days | 0.005° |
| `grace` | LAT LON | for a newer file only | 300 s | 24 h | 0.05° |
| `gracegrid` | none | for a newer file only | 300 s | 24 h | shared by all |
| `hls` | LAT LON | yes | 150 s | 24 h | no |
| `hlsbox` | LAT LON RING | yes | 150 s | 7 days | no |
| `horizon` | LAT LON [W D] | no | 120 s | 90 days | no |
| `imerg` | LAT LON FROM TO | yes | 120 s | 6 h | centre of the 0.1° square |
| `isda` | LAT LON | no | 30 s | 30 days | no |
| `landcover` | LAT LON W D NX NY | no | 120 s | 30 days | no |
| `mnfield` | LAT LON MODE CROPS | no (the owner's free USDA Market News key) | 100 s | 6 h | 0.05° |
| `ndvi` | LAT LON | no | 240 s | 7 days | 0.002° |
| `ndvihist` | LAT LON | no | 300 s | 30 days | 0.002° |
| `orbits` | none | no | 90 s | 12 h | shared by all |
| `osm` | LAT LON W D | no | 150 s | 30 days | no |
| `prices` | none | no | 300 s | 12 h | shared by all |
| `smap` | LAT LON | yes | 420 s | 7 days | 0.01° |
| `soilfield` | LAT LON | no | 60 s | 30 days | 0.001° |
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
| `pin` | code, name (kind, ids) | the map's class at the field's own point, or null when it could not be read; a USDA class of the "garden" part of `cropsnear_map.json` (orchards, vineyards, cane, hops, asparagus: crops that stay for years) adds `"kind":"garden"` and `crops`, the standing-crop ids of `js/crops.js` GARDENS that hold it |

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

## crophist

**What it is.** What this field grew, year by year, read from the national 30 m crop maps at up to nine points inside the
field; with `near=1` also, as counts only, what the farm fields around it grew in the year after each crop. In the 48 lower
US states USDA NASS's Cropland Data Layer (2008 to the newest year, through USDA's CroplandCROS image service), in Canada
Agriculture and Agri-Food Canada's Annual Crop Inventory (2011 to the newest year). No NASA login. Nothing is decided here:
the page finds the turn and the "after corn" shares from these counts.

**Request.** `GET /api/crophist?lat=&lon=&country=US|CA&near=0|1&ring=lon,lat;lon,lat;…`

| Field | Unit | Limits |
|---|---|---|
| `lat`, `lon` | decimal degrees | -84..84 and -180..180; blank is missing, never 0 |
| `country` | ISO 3166 code | `CA` or `US`, as for `cropsnear` |
| `near` | 0 or 1 | blank is 0 |
| `ring` | lon,lat pairs joined by `;` | optional; 3 to 200 corners (a closed outline may repeat its first one); written with 4 decimals |

The script receives `LAT LON COUNTRY NEAR [RING]`, for example `crophist.py 41.1795 -96.4398 US 1 -96.4446,41.1830;…`.
Without `ring` the field is the pin.

**Good answer** (Mead, outline, near=1, shortened):

    {"ok":true,"source":"USDA NASS Cropland Data Layer 2008 to 2025, through USDA's CroplandCROS image service","data_date":"2008/2025",
     "data_date_note":"…","units":"…","country":"US","where":"outline","points":9,"points_read":9,"spots":[[41.181817,-96.443067],…],
     "field":[{"year":2025,"crop":"corn","agree":9,"code":1,"name":"Corn","mixed":false,"unread":0,"classes":[1,1,1,1,1,1,1,1,1]},…],
     "years":{"first":2008,"last":2025},"not_read":[],
     "near":{"radius_km":3,"step_m":170,"grid_points":948,"years":{"first":2017,"last":2025},"pairs":8,
             "after":{"corn":{"soy":1659,"corn":292,"pea":42,"alfalfa":14,"oats":6,"wheat":5,"rye":2,"triticale":1,"other":14,"n":2035},…}},
     "licence":"public domain (USDA NASS)","checked":"…"}

| Field | Type, unit | Meaning |
|---|---|---|
| `source`, `data_date`, `data_date_note`, `units` | text | the map, its years (`first/last`) and the same in words, with why the first year is 2008 (US) or 2011 (Canada) |
| `country`, `where` | text | `US` or `CA`; `outline` when a ring was sent, `pin` when not |
| `points`, `points_read` | count | the field points asked (3 to 9) and those that answered (US only; it can be below `points`) |
| `spots` | [lat, lon] | each point, north row first, west to east; `classes` uses this order |
| `field[]` | per year, newest first | `year`; `crop` (a crops.js id, or null when no crop has more than half the points, or when the class most points show is not one crop alone); `agree` (points that show the most common crop or class); `code`, `name` (the majority class, null when mixed); `mixed`; `unread` (points with no value); `classes` (the class at each point, null = no value) |
| `years` | {first, last} | the years read |
| `not_read` | years | years the service did not answer, and years with no value at any point; left out of `field` |
| `near` | object | only with near=1 and at least one pair of years read: `radius_km` 3, `step_m` 170, `grid_points` (the field's own left out), `years` (the newest 9), `pairs` (Y, Y+1 read, 8 when all are), `after[crop]` (for each crop in year Y, how many grid points showed each crop in Y+1; `other` is a farm class that is not one crop; `n` the sum of the row, in point-pairs), `not_read` |
| `near_reason` | text | in place of `near` when no neighbour pair could be read |
| `incomplete` | text | only on a partial answer, for example `"2016 not read"`, `"1 of 9 points not read"` |
| `licence` | text | `public domain (USDA NASS)` or `Open Government Licence - Canada` |

**Failure answers.**

| Reason | Final |
|---|---|
| `Crop maps by year are read for Canada and the United States only` | **yes** |
| `This field is too small to read by year on the 30 m crop map (fewer than 3 points 30 m apart fit inside it)` (nothing is asked) | **yes** |
| `The US crop map (USDA Cropland Data Layer) has no reading for this place` (Canada: the same words for its map) | **yes** |
| `The Canadian crop map (AAFC Annual Crop Inventory) did not answer just now; try again in a minute` (the US map: the same words) | no |
| `… asked us to slow down; try again in a few minutes` (HTTP 429; nothing more is asked) | no |
| `… did not list any year of its map; try again later` | no |
| `The crop map took too long to answer; try again in a minute` | no |
| `near must be 0 or 1`, `The field's outline must be 3 to 200 corners written lon,lat;lon,lat`, `lat and lon are required as decimal degrees` | no |

**Partial answers.** `incomplete` marks one: a year or a field point not read, or a neighbour year not read. The server
keeps it 1 hour.

**Time limit.** Server: 120 s. The lookup stops itself at 115 s. One request: 30 s. A neighbour request gets only the time
left (two tries, 5 s kept back) and is skipped under 3 s; the field is then answered with `near_reason`. Measured live on
2026-11-15: 5.1 s at Mead with near=1 (18 requests), 6.6 s at Oxford (25 requests).

**Memory.** Limit 300 MB. Measured about 32 MB live on 2026-11-15.

**Kept.** The server keeps a whole answer 30 days (the maps change once a year), a partial one 1 hour, a final failure 24
hours. The lookup keeps no file.

**Snapped.** Not snapped: the field is read at its own points.

**Source and manners.** US: one `identify` per field point with `returnCatalogItems=true` on
`https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer`, and with near=1 one `getSamples` per year (each
year's raster locked). Canada: the list of years, then one `getSamples` per year on
`https://agriculture.canada.ca/imagery-images/rest/services/annual_crop_inventory/{year}/ImageServer`. At most 1,000 points
per request. The services, the failure words and the class table (`cropsnear_map.json`) are the crop-map lookup's own,
imported from `cropsnear.py`.

**Checked by.** `node scripts/test_crophist.mjs` (offline) on `scripts/fixtures/live/crophist/mead` and `oxford`, recorded
from the live public services on 2026-11-15; the failures are copies of these changed in a temp folder.

## dem

*To be written.*

## ecostress

*To be written.*

## ecopass

**What it is.** The ground temperature, seen from space at about 70 m, of the pixel that holds the field, for every clear pass of NASA's ECOSTRESS instrument (on the International Space Station) in the last 365 days, with the number of clear daytime days at 45 C or more. It is the temperature of the surface (soil, leaves, snow), not the air temperature. ECOSTRESS passes at different hours (the station's orbit drifts through the day), so each pass says its own date and local solar time, and passes made at different hours must never be compared as if they were the same time of day. Only the field's own pixel is read; a pixel with cloud, lower quality, water or no view is never a reading. Needs the NASA login.

**Request.** `GET /api/ecopass?lat=43.13&lon=-80.75`; latitude -52..52 (ECOSTRESS does not see further). The server snaps the place to 0.0005 degrees (about 50 m, finer than the 70 m pixel, so the pin keeps its own pixel) and runs `ecopass.py LAT LON`.

**Good answer** (real numbers, Oxford County, 2026-11-14; the days are written as they come):

    {"ok":true,"source":"NASA ECOSTRESS tiled land surface temperature, 70 m (ECO_L2T_LSTE), from NASA's Land Processes DAAC",
     "data_date":"YYYY-MM-DD","units":"Ground (surface skin) temperature seen from space for one 70 m pixel, in degrees Celsius (and kelvin), at the time of each pass; not the air temperature",
     "pixel_m":70,"window":{"first":"YYYY-MM-DD","last":"YYYY-MM-DD"},
     "passes":[{"date":"YYYY-MM-DD","utc":"07:02","solar_time":"01:39","solar_date":"YYYY-MM-DD","day_night":"night","lst_c":-2.3,"lst_k":270.82,"error_k":1.0,"orbit":47324,"version":"002","granule":"ECOv002_L2T_LSTE_47324_006_17TNH_..."}, "..."],
     "clear_passes":4,"summary":{"day_clear":2,"night_clear":2,"hot_days":0,"hot_c":45,"hot_source":"Peacock et al., Crop Science 30(1):138-143 (1990): ...","max_day_c":24,"max_day_date":"YYYY-MM-DD"},"passes_found":24,"passes_checked":24,"coverage":{"found":24,"examined":24,"back_to":"YYYY-MM-DD","kept":0,"newly_read":24,"complete":true},"not_usable":{"cloud":2,"quality":2,"water":0,"no_data":16},"read_errors":0,"newest_clear":"YYYY-MM-DD","note":"..."}

| Field | Meaning |
|---|---|
| `passes` | every clear pass of the year (up to 250), newest first, one per orbit (the next scene of the same overpass is not a second pass). `lst_c` / `lst_k` the ground temperature, `error_k` the file's own estimate of its error (kelvin) |
| `utc`, `solar_time`, `day_night` | when the pass was made: UTC, the field's mean local solar time (UTC plus longitude / 15 hours; not the clock on the wall, which depends on the time zone and the season), and NASA's own day or night flag |
| `version` | the product version the pass came from: 003 where it has the pass, else 002 (the passes of both versions are the same overpasses) |
| `summary` | `day_clear` days with a clear daytime pass; `hot_days` how many of those days had a day pass of `hot_c` (45 C) or more (two hot passes on one day are one day; night passes are never counted); `max_day_c` and `max_day_date` the hottest clear day. The 45 C line is a sorghum finding (`hot_source`: soil above 45 C stopped sorghum seedlings establishing in the field), so the card says so; other crops differ |
| `passes_found`, `passes_checked`, `not_usable` | how many passes the catalogue lists over the place and how many were looked at (newest first, at most 400, until the time left runs short) and why the others gave no reading: `cloud` (the final cloud mask), `quality` (the quality code is not the best quality, or the value is outside 200 to 360 K), `water`, `no_data` (the pass did not see the field's pixel, or its cloud mask is "not known") |
| `coverage` | how far down the year this ask got: `found` passes in the catalogue, `examined` of them (newest first), `back_to` the day of the oldest one examined, `kept` taken from what earlier asks kept, `newly_read` read for the first time in this ask, `complete` true only when every pass was examined and none failed. An ask reads at most 60 passes for the first time (`FW_ECO_NEW_PER_ASK` changes it, for a test), so a year is read over a few asks, each going on where the last stopped |
| `incomplete` | present when some pass could not be read just now, or the ask stopped before the end: "so far the newest N of M passes were read, back to D; the rest are read on the next ask" |
| `why_none` | present when no pass was clear: the answer is still a good one (`passes` empty), never a made-up temperature |

**Failure answers.** The common two for bad arguments (`lat must be -52..52`); `NASA's catalogue lists no ECOSTRESS pass over this place in the last 365 days...` (not final); `NASA did not accept this computer's login`; the files refused for the login (it may need approving for NASA LP DAAC); `NASA's ECOSTRESS files could not be read just now` (every pass failed, not final).

**Partial answers.** Yes: `incomplete` and `read_errors` say which passes were not read.

**Time limit.** 150 s on the server. Cold, a year of passes (about ninety over a mid-latitude place) is read newest first until the time left runs short; every pass read is kept, so the second run reads only the new ones (about 3 s). The first live run of the year-long version has not been made yet: it needs the owner's NASA login (`node scripts/live_check_ecopass.mjs`). Before the year-long version, Oxford took 50 to 55 s cold for the newest 24 passes. The cloud mask is read first (it also says when the pixel was not seen), and the archive's short-lived file address is asked for ahead of the read, so the archive's slow step and the content network's quick reads overlap (12 files in 9.7 s against 13.5 s). The lookup stops looking at older passes 25 s before its limit and says so.

**Memory.** Limit 300 MB. Measured live: peak 104 MB (rasterio and numpy loaded; one pixel per read).

**Kept.** Suggested: 6 hours for a whole answer (a new pass lands every day or two); a final failure an hour. The lookup itself keeps what each pass held at the field's pixel (a pass never changes): a few bytes a pass under `FW_CACHE/ecopass`, so a later run reads only the passes that are new (live, Oxford: 3 requests, 2.7 s).

**Source and manners.** NASA CMR (open) for the granules over the point; NASA's token service (or the token the server hands in as `EARTHDATA_TOKEN`: see section 1); then range reads of ONE pixel of the `LST`, `cloud`, `QC`, `water` and `LST_err` layers of each pass (cheap exits first: a pass the field is not in costs one read). Rules: cloud mask 0 only; the quality code's two lowest bits `00` (best quality; "nominal" can mean possible cloud contamination, so it is not used); water mask 0; value 200 to 360 K. Cite ECO_L2T_LSTE, NASA LP DAAC.

**Checked by.** `scripts/test_live_ecopass.mjs` (offline: small GeoTIFFs built the real way by rasterio, whose neighbours of the field's pixel are deliberately wrong), `scripts/live_check_ecopass.mjs` (by hand, live).

**Checked against the live service.** Oxford, 2026-11-14: 24 passes looked at, 4 clear (the newest night passes and one morning pass), 2 cloud, 2 lower quality, 16 not covering the field's pixel; one pass's five layers compared with a direct sample of the same files, same values (282.26 K, error 1.36 K, quality code 35520 whose lowest two bits are 00, cloud 0, water 0).

## faostat

**What it is.** What each country grows, its national yield of each crop (tonnes from a hectare) and the price farmers there are paid (US$ a tonne), from FAOSTAT, the statistics of the Food and Agriculture Organization of the United Nations. It reads FAO's two bulk files, "Production: Crops and livestock products" and "Producer Prices". The answer is the same for everybody (all countries at once). No NASA login.

**Request.** `GET /api/faostat` (no query fields). The script receives no arguments: `faostat.py`.

**Example request.** `GET /api/faostat`

**Good answer** (the live answer of 2026-11-14, shortened to one country):

    {"ok":true,"source":"FAOSTAT (Production: Crops and livestock products; Producer Prices), FAO of the United Nations",
     "data_date":"2022/2024","data_date_note":"Areas and yields are for the years 2022 to 2024. Each price is for the year written beside it (2020 to 2024). FAO published the production file on 2025-12-31 and the price file on 2026-10-09",
     "units":{"area":"ha, mean of the years 2022 to 2024 that FAO reports","yield":"tonnes per hectare, with the years it is from","price":"US$ per tonne at the farm gate, with its year"},
     "latestYear":2024,"years":[2022,2023,2024],"updated":"2025-12-31T11:33:25Z","rebuilt":true,
     "countries":{"CA":{"name":"Canada","area":{"wheat":10490700,"canola":8766267,"corn":1470700},
       "yield":{"corn":[10.27,"2022-2024"],"soy":[3.16,"2022-2024"],"wheat":[3.31,"2022-2024"]},"price":{"corn":[212,2024]}}},"checked":"2026-11-14T23:26:40Z"}

| Field | Type, unit | Meaning |
|---|---|---|
| `source`, `url`, `updated` | text, text, UTC time | the production file, and when FAO last changed it (its `Last-Modified`) |
| `data_date` | text, "first/last" year | the years the areas and yields are for: the three newest years FAO has filled |
| `data_date_note` | text | the same in a sentence, with the days FAO published each file |
| `units` | object of text | the unit of `area`, `yield` and `price` |
| `latestYear`, `years` | number, list | the newest year with area figures, and the three years counted |
| `prices` | object | the price file's own `source`, `url`, `updated`, `unit` and `years` (the last five years) |
| `yields` | object | what a yield is: production divided by area harvested, same crop item, same years |
| `flags_note` | text | every figure is FAO's own; a value FAO marks missing is left out; what `not_official` means |
| `countries.<ISO2>.name` | text | the country as Crophalo writes it (Türkiye, never the other spelling) |
| `countries.<ISO2>.area.<crop>` | number, ha | the mean harvested area of the crop over the three years (a crop under 1 ha is left out) |
| `countries.<ISO2>.yield.<crop>` | `[t/ha, "years"]` | the national yield, and the years it is from; only where the crop has at least 1,000 ha a year; a year in which one crop item has only the tonnes or only the area is not used |
| `countries.<ISO2>.price.<crop>` | `[US$ a tonne, year]` | the newest annual farm-gate price of the last five years; items of one crop are weighted by their tonnes |
| `countries.<ISO2>.not_official` | list of crop names, only when present | crops whose figures rest on a value FAO marks as estimated, imputed, from another organisation or a break in the series |
| `items_not_found` | list, only when present | crops whose FAO item was renamed or dropped: they have no figure |
| `rebuilt` | true or false | whether FAO had changed a file since the last run (the figures were read again) or not |
| `stale`, `note` | true, text; only when present | the kept files are answered from because FAO could not be asked, or its newer files could not be read |
| `checked` | UTC time | when FAO was asked |

A crop FAO has no figure for is **absent**, never 0. Regional totals ("World", "Northern America") and countries that no longer exist have no two-letter code and are not in the answer.

**Failure answers.**

| Answer | When | Final |
|---|---|---|
| `{"ok":false,"reason":"FAOSTAT did not answer; try again in a minute"}` | FAO could not be asked and no earlier files are kept | no |
| `{"ok":false,"reason":"FAOSTAT asked us to slow down; try again in a few minutes"}` | FAO answered 429 or "busy" | no |
| `{"ok":false,"reason":"FAOSTAT's files could not be read just now; try again in a minute"}` | a file arrived cut short or broken, and nothing earlier is kept | no |
| `{"ok":false,"reason":"FAOSTAT changed the layout of its files, and Crophalo has not been checked against it yet"}` | a column or the data file is not where it was | no |
| `{"ok":false,"reason":"FAOSTAT is already being read for another visitor; try again in a minute"}` | another run holds the lock on the kept files | no |
| `{"ok":false,"reason":"This lookup takes no arguments"}` | an argument was given | no |

**Partial answers.** `stale: true` with a `note` ("FAOSTAT could not be asked whether anything is newer just now", or "FAOSTAT has newer files, but they could not be read just now") when the answer is made from the files kept from an earlier run. The server keeps such an answer for one hour only.

**Time limit.** The server's 420 s. The lookup stops asking the network in time to read the kept files and answer; one HEAD request may take 40 s; a download is given what is left.

**Memory.** The limit is 300 MB. Measured on the live run of 2026-11-14 (Mac, Python 3.12, counted by the system): peak **151 MB** with both files downloaded and read (4 requests), **137 MB** reading the kept files (2 requests). The production file is 25 MB packed and 93 MB unpacked: it is **never held in memory**. The zip is read one megabyte at a time and one line at a time; only the wanted rows are parsed and only the three newest years of each are kept.

**Kept.** The server keeps a whole answer for 24 hours. The lookup itself keeps FAO's **two zip files as FAO sent them**, about 33 MB, under `FW_CACHE/faostat/` (with `meta.json`: the `Last-Modified` of each), written whole or not at all, and a lock file. It asks FAO with `HEAD` for each file's `Last-Modified` and downloads a file again **only when FAO changed it**; it replaces the kept file only after the new one was read to the end. On a host with no lasting disk the first call after each start downloads the files again (about 5 s on a fast line).

**Snapped.** Nothing: the answer is for all countries.

**Source and manners.** `https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data.zip` and `…/Prices_E_All_Data.zip`. Two HEAD requests when nothing changed; two more downloads when something did. FAO's files change about once or twice a year.

**Checked by.** `scripts/test_live_crops.mjs` (offline), on FAO's own rows for Canada, Türkiye, Ethiopia and Taiwan cut unchanged from the files of 2026-11-14 (`scripts/fixtures/live/faostat-excerpt/`, 1 MB): the first run, a second run that sends only the two HEAD questions, a changed date that downloads one file, FAO unreachable with and without kept files, and a broken zip. The live answer is in `scripts/fixtures/live/faostat-live/recording.json`. By hand: `node scripts/check_live_money.mjs faostat`.
**Checked against the live service**, 2026-11-14: both files answered HEAD with `Last-Modified` (production 31 Dec 2025, 25.1 MB; prices 9 Oct 2026, 8.4 MB); Canada corn 10.27 t/ha, soybeans 3.16, wheat 3.31 (2022-2024); 198 countries read; first run 4.5 s and 151 MB, a run on the kept files 11.9 s and 137 MB.

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

**Kept.** Suggested: a whole answer for 7 days (a new month arrives about once a month); a failure for an hour. The lookup keeps the file's name a day under `FW_CACHE/gracecell` (the catalogue is then not asked; if the kept file is gone it is asked again).

**Source and manners.** NASA CMR (open) names the one file; NASA's token service; then Range requests to NASA PO.DAAC's archive for ONLY the pieces that hold the cell (h5py opens a block-reading stand-in for the file), never more than 80 requests or 24 MB. NASA's OPeNDAP service does not serve this collection, so the range read is the one-cell method. Cite the DOI 10.5067/TEMSC-3JC634.

**Checked by.** `scripts/test_live_gracecell.mjs` (offline: a small file built the real way by h5py and served in the same pieces), `scripts/live_check_gracecell.mjs` (by hand, live).

**Checked against the live service.** Oxford, 2026-11-14: 294 months from 2002-04 to 2026-09, 259 with a value and 35 empty; every month compared with a full read of the file (netCDF4) with no difference; trend 0.17 cm a year over 24.4 years.

## firms

**What it is.** The fires and hot spots NASA's VIIRS satellites (NOAA-20 and NOAA-21; Suomi NPP no longer sends data) saw in the last 24 hours within about 250 km of the field, for the Layers panel's "Fires and hot spots". Each point is one 375 m spot hotter than its surroundings. No login and no key: NASA FIRMS publishes its 24-hour files openly. It is NOT a fire forecast, and no point does not mean no fire: the satellites pass about twice a day each, cannot see under cloud or very small fires, and a factory, flare or sunlit rock can show as a spot.

**Request.** `GET /api/firms?lat=43.13&lon=-80.75` (optional third value: the half width in degrees, 0.1 to 5, default 2.5); the server may snap the place to 0.1 degrees (a box of 5 degrees does not need more) and runs `firms.py LAT LON [HALF]`.

**Good answer** (real numbers, Oxford County, 2026-11-15; `points` is shortened):

    {"ok":true,"source":"NASA FIRMS (Fire Information for Resource Management System): VIIRS 375 m active fire detections from NOAA-20 and NOAA-21, near-real-time",
     "data_date":"YYYY-MM-DD","units":"Each point is one 375 m spot ...","window_hours":24,"box":{"n":45.63,"s":40.63,"e":-77.324,"w":-84.176},"count":30,"shown":30,"by_confidence":{"high":0,"nominal":30,"low":0},
     "points":[{"lat":43.2905,"lon":-79.9857,"time":"YYYY-MM-DDTHH:MMZ","frp":1.7,"confidence":"nominal","satellite":"NOAA-21","night":true}, "..."],
     "satellites":["NOAA-20","NOAA-21"],"newest":"YYYY-MM-DDTHH:MMZ","coverage":"...","note":"..."}

| Field | Meaning |
|---|---|
| `points` | the nearest 600 spots inside the box, nearest first: place, time in UTC, `frp` (fire radiative power in megawatts, null when the file gave none), `confidence` (low, nominal, high), the satellite and whether the pass was at night |
| `count`, `shown`, `by_confidence` | all the spots in the box, how many are given, and the counts by confidence |
| `newest` | the newest detection in the files (the answer's own age) |
| `coverage` | the plain words about what the satellites cannot see; always present, and the screen shows it |
| `incomplete` | present when one satellite's file did not come: it names it, and its spots are missing |

**Failure answers.** The common two for bad arguments (the half width must be 0.1..5); `NASA FIRMS's files of fires seen in the last 24 hours could not be read just now; try again in a few minutes` (both files failed, not final).

**Partial answers.** One file missing: `incomplete` names the satellite. No spot at all is a good answer with `count` 0 and the same `coverage` words.

**Time limit.** 150 s on the server. Live, Oxford: 4 s with two downloads of about 7 MB (no keeping), under 1 s from the kept files.

**Memory.** Limit 300 MB. Measured live: peak 35 MB (the files are read a line at a time).

**Kept.** Suggested: 3 hours for a whole answer (the files are renewed every few hours). The lookup keeps the two files 90 minutes under `FW_CACHE/firms`: they are the source files, not answers, and a second field costs no request.

**Source and manners.** `https://firms.modaps.eosdis.nasa.gov/data/active_fire/{noaa-20,noaa-21}-viirs-c2/csv/J{1,2}_VIIRS_C2_Global_24h.csv`, one request each at most every 90 minutes. NASA GIBS's own fire tiles for the web map grid answered 404 for every tile on the day it was checked, so the layer is drawn from these files instead. Credit: NASA FIRMS, LANCE; "We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS), part of NASA's Earth Science Data and Information System (ESDIS)."

**Checked by.** `scripts/test_live_firms.mjs` (offline: the two files made by hand in their real format; inside and outside the box, the date line, both files down, one down, odd files and lines, 700 spots, kept files, arguments), `scripts/live_check_firms.mjs` (by hand, live).

**Checked against the live service.** Oxford, 2026-11-15: both files read, 30 spots within 250 km, all of nominal confidence (the nearest cluster is industrial, at Hamilton and Cleveland, which is why the coverage words say a factory can show as a spot), newest detection under 24 hours old.

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

## hlsbox

**What it is.** How green each 30 m square inside the field looked, pass after pass, from May 1 to September 30 of the last
two full calendar years, for "Weak spots in this field". NASA / USGS HLS v2.0 surface reflectance, 30 m, from NASA's Land
Processes DAAC, with the same files and the same cloud, snow and water rules as `hlsndvi`, whose helpers it imports. The
catalogue is open; the files need the free NASA Earthdata login.

**Request.** `GET /api/hlsbox?lat=&lon=&ring=lon,lat;lon,lat;…`

| Field | Unit | Limits |
|---|---|---|
| `lat`, `lon` | decimal degrees | as for every point; they must lie in the outline's box |
| `ring` | lon,lat pairs joined by `;` | 3 to 200 corners, closed or not, written with 6 decimals; the outline's box at most 2 km a side |

The script receives `LAT LON RING`.

**Example request.** `GET /api/hlsbox?lat=41.1651&lon=-96.4766&ring=-96.480200,41.162400;-96.473000,41.162400;-96.473000,41.167800;-96.480200,41.167800`

**Good answer** (`ok: true`):

| Field | Type, unit | Meaning |
|---|---|---|
| `source`, `data_date`, `units` | text | hlsndvi's HLS v2.0 sentence; the date of the newest kept pass (with no pass, the window); what NDVI, corners and clear_share mean |
| `pixel_m` | metres | 30 |
| `window` | object | `first`, `last` and the two `seasons` read |
| `cells[]` | per 30 m square | every square with a corner or its centre inside the outline, numbered north to south, then west to east: `id`, `corners` (NW, NE, SE, SW as [lat, lon]), `lat`, `lon` (its centre), `inside` (true only when all four corners are inside) |
| `cells_inside` | count | how many cells are inside |
| `passes[]` | oldest first, at most one per 15-day period | `date`, `sensor` (`Sentinel-2` or `Landsat 8 and 9`), `ndvi[]` (`ndvi[k]` belongs to `cells[k]`, 3 decimals; null is cloud, shadow, next to cloud, snow, water or no value, never 0), `clear_share`, `tile`, `granule` |
| `periods`, `periods_read` | count | always 20; 20 minus the periods not looked at or not readable |
| `left_out[]` | `{period, why}` | one for each period with no pass; `why` is `no_pass`, `cloud`, `snow`, `water`, `outside`, `other_grid`, `not_read` or `no_time` |
| `not_usable`, `read_errors` | counts | the rejected candidates by reason; the files that could not be read |
| `incomplete` | true or false | true when a period was not read or a file failed |
| `note`, `why_none` | text | the rules in plain words; `why_none` only when there are no passes |

A pass is kept only when at least 60 % of the inside squares are clear. At most 3 candidates are tried per period, by the
tile's cloud cover.

**Failure answers.**

| Reason | Final |
|---|---|
| `This field is too big for one look (over 2 km across). Split it to look for weak spots.` (nothing is asked) | **yes** |
| `This field is too small for 30 m squares (under 30 squares).` (nothing is asked) | **yes** |
| the outline sentence (3 to 200 corners), the lat and lon sentences, `lat and lon must lie inside the box of the field's outline` | no |
| NASA's catalogue lists no pass over this field from May to September of the two years | no |
| common's no-login sentence; the login refused; the files refused (hlsndvi's words) | no |
| every file failed: `could not be read just now; try again in a minute`; out of time: the slow sentence | no |

**Partial answers.** `incomplete: true` or `read_errors > 0`. The server keeps it 1 hour. An `ok: true` answer with no
passes and `incomplete: true` is a time-out, not "too cloudy".

**Time limit.** Server: 150 s. The lookup stops starting new periods when fewer than 22 s are left (hlsndvi's spare time).

**Memory.** Limit 300 MB. Measured offline on the largest field allowed (1.9 km): 4,096 cells, a 0.76 MB answer, peak 70 MB.
Not yet measured live.

**Kept.** The server keeps a whole answer 7 days. The lookup keeps no file.

**Snapped.** Not snapped.

**Source and manners.** NASA's catalogue (CMR) gets the field's centre; then range reads of three small layers (the Fmask
flags, the red band, the near-infrared band) over the outline's window, never a whole file.

**Checked by.** `node scripts/test_live_hlsbox.mjs` (offline: the catalogue, the token and small GeoTIFFs built the real way;
about 40 s). The page's test answers `scripts/fixtures/live/hlsbox/mead.json` and `mead-cloudy.json` are hand-made and say
so. By hand, live: `node scripts/live_check_hlsbox.mjs` (a field about 600 m a side near Mead, Nebraska). Not yet checked
against the live service.

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

## mnfield

**What it is.** For a field in the United States, what buyers bid for each crop in the newest USDA AMS Market News grain report of the field's state (or of the nearest state with a live report, or a national report for a few crops). It needs the owner's free USDA Market News key on the server and no NASA login. A bid is a price on one day at a place: it is never income and never enters a score.

**Request.** `GET /api/mnfield?lat=41.18&lon=-96.44&mode=now&crops=corn,soy`. `mode` is `now` (the server also accepts `hay` and `cost`, which the lookup answers with "This Market News reading is not on this server yet"); `crops` is up to 16 Crophalo crop ids, and may be empty. The server checks the arguments (`scripts/mnargs.mjs`), snaps the place to 0.05 degrees, sorts the crops, and runs `mnfield.py LAT LON MODE CROPS`.

**The key.** Read by `groundlib.py` only: first the host's setting `CROPHALO_AMS_KEY`, then the file `.secrets/ams-marketnews.key` in the folder (or in the folder `CROPHALO_SECRETS_DIR` names). The server hands the setting to this lookup alone. The key goes only into the request's Authorization header; it is never in an address, an answer, the log or a kept file, and a keyed answer is never recorded. Without the key the server answers at once, starting nothing: `{"ok": false, "not_set": true, "reason": "Local market prices (USDA Market News) are not set up on this server (the owner's free key is not set)"}` with status 200.

**Good answer.** `{"ok": true, "source", "mode": "now", "today", "window": {"from", "to"}, "place": {"state", "state_name"}, "own", "reports": [...], "crops": [{"crop", "status": "own" | "neighbour" | "far" | "none_found" | "not_read", "report", "report_date", "low", "high", "unit", "regions": [...]}], "data_date"}`. The page's reader is `js/market-data.js`.

**Failure answers.** `USDA Market News covers only the United States` (final); `USDA Market News did not accept the key set on this server`; `USDA Market News did not answer just now; try again in a minute`; `USDA Market News took too long to answer; try again in a minute` (the time limit); `USDA Market News sent more bids than this page can show`; the argument refusals of `scripts/mnargs.mjs`.

**Kept.** The server keeps a whole answer 6 hours. The lookup keeps only the National Weather Service's points answer (the state of a place, no key) 30 days under `FW_CACHE/nws`.

**Source and manners.** `https://marsapi.ams.usda.gov/services/v1.2` (the report list once, then one request per report read) and `https://api.weather.gov/points/LAT,LON` for the state. USDA Market News data is a work of the United States Government, in the public domain in the United States; some reports are issued with a state department of agriculture, named in the answer. Not made, reviewed or endorsed by USDA.

**Checked by.** `scripts/test_mnfield.mjs` (offline: hand-made stand-ins in the shape of real answers, each marked as not real, and a made-up key), `scripts/test_field_routes.mjs` (the route, how the key reaches the lookup, the "not set up" answer), `scripts/test_market.mjs` (the page's sentences).

## ndvihist

**What it is.** How green the land round the field looked at its greenest in every season since 2001, for the "What satellites saw" part of the Land history page: NASA's MODIS Terra 16-day greenness (NDVI, 250 m; the MOD13Q1 product), the median of a patch of 9 by 9 dots (about 2 km) round the point, one value for each season (its greenest composite). It is the greenness of the land round the field, not of the field. No login: NASA GIBS serves the record openly.

**Request.** `GET /api/ndvihist?lat=43.13&lon=-80.75`; the server may snap the place to 0.002 degrees (a patch of 2 km does not need more) and runs `ndvihist.py LAT LON`.

**Method.** One request lists the days NASA has an image for (DescribeDomains). For every composite of every season's window, ONE request fetches the 256 px map tile that holds the point: a palette picture whose entries are NASA's own greenness scale (colormap `MODIS_L3_NDVI`, entry k = the step k of 142; entry 0 = no data), decoded locally. The patch's dots that have a value are taken (at least 20 of 81, else the composite has no reading); their median is the composite's greenness. A season counts with at least 3 composites; the answer with at least 10 seasons. Seasons are April to September in the north, October to March in the south (named by the year they end), and in the tropics 64 days either side of the greenest composite of the last full year. The season not over is never counted: the last is the last full year. Newest seasons are read first, so a short time costs the oldest.

**Good answer** (real numbers, Oxford County, 2026-11-15; `seasons` is shortened):

    {"ok":true,"source":"NASA MODIS Terra Vegetation Indices, 16-day, 250 m (MOD13Q1), shown through NASA's Global Imagery Browse Services","data_date":"2001/2025",
     "units":"NDVI (greenness) of the land round the field, ...","pixel_m":250,"patch_km":2,"window":"April to September",
     "seasons":[{"year":2001,"peak":0.566,"peak_date":"YYYY-MM-DD","n":12,"of":12,"partial":false,"valid_pixels":81}, "..."],"seasons_read":25,"years_without":[],"partial_years":[],
     "early":{"from":2001,"to":2010,"mean":0.6,"n":10},"recent":{"from":2018,"to":2025,"mean":0.59,"n":8},"change":{"kind":"steady","difference":-0.005,"needed":0.04},
     "browner_years":[],"sentence":"Peak greenness has been steady since 2001.","advice":null,"note":"..."}

| Field | Meaning |
|---|---|
| `seasons` | oldest first. `peak` is the greenest composite's median (to 3 decimals; a step of NASA's scale is 0.005 to 0.01 wide), `peak_date` its day, `n` composites read of `of` in the window, `partial` true when fewer than 7 in 10 were read, `valid_pixels` the dots of the patch that had a value in the peak composite |
| `years_without` | seasons with fewer than 3 readings (cloud, snow, no data): named, never a 0, never a made-up peak |
| `early`, `recent`, `change` | the mean peak of 2001 to 2010 and of the last 8 seasons (each needs 5 seasons), and the change: `greener` or `browner` only when the difference is at least 0.04 and at least twice the seasons' own spread, else `steady` |
| `browner_years` | seasons whose peak is at least 0.08 and 1.5 spreads below the mean of all seasons (partial ones are not named) |
| `sentence`, `advice` | the note's sentences, made only from these numbers: "The land here is greener at its peak since 2018 than in 2001\u20132010 (about 0.78 now, 0.71 then)." with the advice "This often means fields nearby started to be watered or changed crop: ask the seller." (greener only); "browner" without advice; or "Peak greenness has been steady since 2001" with "; browner seasons: 2012." when there are some. `sentence` is null when fewer than 5 early or 5 recent seasons exist |
| `incomplete` | readings that could not be made in time or just now, and the seasons without greenness |

**Failure answers.** The common two for bad arguments (`lat must be -85..85`); `NASA's image server did not list the days of its greenness record just now; try again later` (not final); `NASA's greenness record could not be read just now; try again in a minute` (every tile failed); `NASA's greenness record had greenness for only N seasons here (it takes 10 to say anything)`; `NASA's record has no greenness images for this place in the seasons asked for`.

**Partial answers.** Yes: `incomplete`, `years_without`, `partial_years`.

**Time limit.** 150 s on the server. Live, Oxford: 79 s for 301 requests (the service gets one request every quarter of a second, two at a time); a shorter time costs the oldest seasons, said in `incomplete`.

**Memory.** Limit 300 MB. Measured live: peak 52 MB.

**Kept.** Suggested: 30 days for a whole answer (a season's peak does not change; the newest season is added each year); an answer with `incomplete` an hour.

**Source and manners.** NASA GIBS (open): DescribeDomains once, then the tiles of one layer, `MODIS_Terra_L3_NDVI_16Day`, one request per composite, never more than two at a time. The old plan read NASA's ORNL DAAC subset service (50 s a request, 503 when checked); the same product through GIBS answers in a quarter of a second a tile. A tile's colours are NASA's scale, so the value has the scale's own step: the median of nine rounded steps.

**Checked by.** `scripts/test_live_ndvihist.mjs` (offline: the list of days and palette tiles made by hand in the real formats; a greener, a steady, a browner land; gaps, partial seasons, empty patches, too few seasons; the service failing; the south and the tropics; arguments), `scripts/live_check_ndvihist.mjs` (by hand, live).

**Checked against the live service.** Oxford, 2026-11-15: 25 seasons from 2001 to 2025, peaks between 0.56 and 0.64 (the patch holds the edge of Woodstock; the farmland of the tile has a median of 0.83), steady since 2001; one composite compared with the 8-day layer of the same day: 0.57 and 0.55.

## orbits

**What it is.** The orbital elements of the thirteen satellites whose data Crophalo reads (Terra, NOAA-20, NOAA-21, SMAP, the GPM Core Observatory, GRACE-FO 1 and 2, Landsat 8 and 9, Sentinel-2A, 2B and 2C, and the International Space Station, which carries ECOSTRESS), for the turning Earth on the home. The browser works each satellite's place out from them with SGP4 (`js/home-sats.js`, the folder's own satellite.js). The elements are the U.S. Space Force's (Space-Track.org) as CelesTrak republishes them. No login and no key.

**Request.** `GET /api/orbits`, no arguments; one answer for every visitor (`orbits.py`).

**Good answer** (real numbers, recorded 15 November 2026 UTC; one of the thirteen shown):

    {"ok":true,"source":"CelesTrak GP data: the U.S. Space Force's newest orbital element set for each satellite (Space-Track.org), for SGP4",
     "credit":"Orbits: U.S. Space Force (Space-Track.org), via CelesTrak.","data_date":"YYYY-MM-DD","units":"Orbital elements as CCSDS OMM fields: ...",
     "satellites":[{"norad":25994,"name":"TERRA","epoch":"YYYY-MM-DDTHH:MM:SS.sssZ","asked":"YYYY-MM-DDTHH:MM:SSZ",
       "omm":{"NORAD_CAT_ID":25994,"OBJECT_NAME":"TERRA","OBJECT_ID":"…","EPOCH":"…","MEAN_MOTION":14.6119781,"ECCENTRICITY":0.0003557,"INCLINATION":97.9264, "…"}}, "…"],
     "missing":[],"requests":13,"checked":"YYYY-MM-DDTHH:MM:SSZ"}

| Field | Meaning |
|---|---|
| `satellites` | one entry per satellite that has a usable set, in the list's order: CelesTrak's name, the epoch cut to the millisecond with a `Z` (as every browser reads it), when CelesTrak was asked for it, and the seventeen OMM fields exactly as checked |
| `missing` | the satellites with no set in this answer, each with a plain reason (CelesTrak could not be asked; its set could not be used, and why; its newest set is more than 14 days old) |
| `requests` | how many requests this run sent to CelesTrak (0 when every kept set is younger than 2 hours, or during a quiet time) |
| `stale`, `note` | present when some sets are older ones kept from before, because CelesTrak could not be asked for them now; each still carries its own epoch |
| `next_ask` | present during a quiet time: when CelesTrak will be asked again |

**Failure answers.** `The satellites' orbits could not be read just now; try again in a while` (no usable set at all, not final); `This lookup takes no arguments`; `CelesTrak took too long to answer; the satellites' orbits will be asked for again later` (the time limit).

**Partial answers.** `incomplete` ("3 of 13 satellites have no element set in this answer") or `stale` with its `note`: the server keeps them one hour.

**Time limit.** 90 s on the server; the lookup stops asking when less than 12 s are left and answers with what it has. Each request may take 20 s. Normally 13 small requests, a second apart: about 15 s.

**Memory.** Limit 300 MB. Measured on the recorded answers: peak 22 MB.

**Kept.** The server keeps a whole answer 12 hours, so CelesTrak is asked at most twice a day for every visitor together. The lookup keeps each satellite's last good set under `FW_CACHE/orbits/<number>.json` (source files, written whole): a set read less than 2 hours ago is never asked for again (CelesTrak has nothing newer before then), and when CelesTrak cannot be asked the kept set is handed out with its own epoch and `stale`. After an answer that is not 200 the lookup writes `FW_CACHE/orbits/quiet.json` and asks CelesTrak nothing for 2 hours. The browser keeps the answer for the visit only (`sessionStorage`, `crophalo.orbits.v1`).

**Snapped.** Not a place: one answer for everyone.

**Source and manners.** `https://celestrak.org/NORAD/elements/gp.php?CATNR={number}&FORMAT=JSON` (FORMAT is always given: without it CelesTrak answers in CSV). One try per request, a second or more apart, and the round stops at the first answer that is not 200, as CelesTrak's usage policy asks; CelesTrak checks for new sets every 2 hours, asks clients not to download the same data again before then (it may answer 403), and firewalls addresses with more than 50 errors in 2 hours. CelesTrak states no licence or fee. Space-Track's user agreement gives blanket approval to pass on these basic element sets with a citation, so the home and the Data page say "Orbits: U.S. Space Force (Space-Track.org), via CelesTrak". This is a reading of the terms, not legal advice.

**Checked by.** `scripts/test_live_orbits.mjs` (offline, on the 13 answers recorded from CelesTrak in `scripts/fixtures/live/orbits/`, with `recording.json` saying how they were asked: a good answer, the kept sets and the 2-hour rules, a 403 in the middle of a round, CelesTrak down at once, an answer with no set, a set with a broken number or another catalogue number, a set more than 14 days old; and the positions against the orbit library) and `scripts/e2e_home.mjs` (the home in a real browser on the same recorded sets).

**Checked against the live service.** 15 November 2026, 03:04 UTC: 13 requests 3 s apart, all 200, epochs 6.8 to 18.3 hours old, every set `EPHEMERIS_TYPE` 0 and `CLASSIFICATION_TYPE` U (the recording in the fixture folder).

## osm

*To be written.*

## prices

**What it is.** The world market price of crops, month by month, in US dollars, from the World Bank's "Pink Sheet" (the monthly commodity price file): maize, wheat, soybeans, barley, sorghum, cotton, rice, oils and the other crops the sheet lists. It is a **world** price, not what a farmer is paid at home. No NASA login.

**Request.** `GET /api/prices` (no query fields). The script receives no arguments: `prices.py`.

**Example request.** `GET /api/prices`

**Good answer** (the live answer of 2026-11-14; one series shown in full, 24 months shortened):

    {"ok":true,"source":"World Bank Commodity Price Data (The Pink Sheet), monthly prices in nominal US dollars, updated 2026-11-03",
     "data_date":"2026-10","data_date_note":"The newest month in the sheet is 2026-10. Each series says its own newest month; a series marked stale ended earlier",
     "units":"US dollars of the month (not corrected for inflation); each series names its unit: $/mt is per tonne, $/kg is per kg",
     "url":"https://thedocs.worldbank.org/en/doc/…/related/CMO-Historical-Data-Monthly.xlsx","updated":"2026-10","published":"2026-11-03",
     "series":{"corn":{"name":"Maize","unit":"$/mt","unit_words":"US$ per tonne","latest":{"month":"2026-10","value":226.5},
       "year_ago":{"month":"2025-10","value":198.1},"change_pct":14.3,"last24":[{"month":"2024-11","value":201.3},…]}},
     "no_series":["chickpea","lentil","pea","alfalfa","bean","potato","hazelnut"],"checked":"2026-11-14T19:41:47Z"}

| Field | Type, unit | Meaning |
|---|---|---|
| `source` | text | the file's name and the day the World Bank says it was updated |
| `data_date` | text, "YYYY-MM" | the newest month in the sheet. Each series says its own newest month. |
| `url`, `published` | text, date | the file that was read (found on the World Bank's commodity-markets page each time) and the day the sheet says it was updated |
| `units` | text | prices are nominal US dollars of the month, not corrected for inflation |
| `series.<crop>.name` | text | the sheet's own column title ("Maize", "Wheat, US HRW", "Soybeans") |
| `series.<crop>.unit`, `.unit_words` | text | `$/mt` (US$ a tonne) or `$/kg`: the only units checked; a column in another unit or with none is not shown |
| `series.<crop>.latest` | `{month, value}` | the newest month **with a price** and its price, 2 decimals |
| `series.<crop>.year_ago`, `.change_pct` | `{month, value}` or null; % | the same month a year earlier and the change, only when that month has a price |
| `series.<crop>.last24` | list of 24 `{month, value}` | two years, oldest first; a month without a price is `null` and is never 0 |
| `series.<crop>.proxy`, `.proxy_note` | true, text; only when present | the sheet has no price for the crop itself: this is a product made from it (canola: rapeseed oil; sugar cane and beet: raw sugar). It is a guide and **must not be shown as the crop's price**. |
| `series.<crop>.stale`, `.stale_note` | true, text; only when present | the series ended more than three months before the sheet's newest month: an old price must not look current |
| `no_series` | list of crop names | crops the sheet has no price for, or whose column has no figure: never estimated |
| `unit_not_read` | list, only when present | columns whose unit was not one of the two checked |
| `checked` | UTC time | when the World Bank was asked |

**Failure answers.**

| Answer | When | Final |
|---|---|---|
| `{"ok":false,"reason":"The World Bank's commodity-markets page did not answer; try again in a minute"}` | the page could not be read | no |
| `{"ok":false,"reason":"The World Bank asked us to slow down; try again in a few minutes"}` | the page or the file answered 429 or "busy" | no |
| `{"ok":false,"reason":"The monthly price file (Pink Sheet) was not found on the World Bank's commodity-markets page"}` | the page has no link to the file, or the link leads to another host (it is never followed) | no |
| `{"ok":false,"reason":"The World Bank's monthly price file (Pink Sheet) could not be downloaded; try again in a minute"}` | the file did not arrive | no |
| `{"ok":false,"reason":"The World Bank's monthly price file (Pink Sheet) did not arrive as an Excel file; try again in a minute"}` | what arrived is not a workbook | no |
| `{"ok":false,"reason":"The Pink Sheet has no 'Monthly Prices' sheet any more, and Crophalo has not been checked against the new layout"}` | the sheet was renamed or removed | no |
| `{"ok":false,"reason":"The Pink Sheet's layout changed (no row of titles with 'Maize'), and Crophalo has not been checked against it"}` | the titles are not where they were | no |
| `{"ok":false,"reason":"The Pink Sheet has no monthly rows; try again in a minute"}` and `…months are out of order…` | the rows are missing or not in date order | no |
| `{"ok":false,"reason":"None of the crop prices were found in the Pink Sheet, and Crophalo has not been checked against its new layout"}` | no crop column had a price in a checked unit | no |

**Partial answers.** None: a series that is stale, a proxy or missing says so inside the answer and is never filled.

**Time limit.** The server's 300 s. One request is given 40 s (the page) or 90 s (the file).

**Memory.** The limit is 300 MB. Measured on the live runs of 2026-11-14 (Mac, Python 3.12, counted by the system): peak **49 MB** (recorded 48.9 MB; replayed tests 46 to 47 MB). The 0.6 MB workbook is opened **read-only** with openpyxl, one row at a time.

**Kept.** The server keeps a whole answer for 24 hours (the sheet is updated once a month). The lookup keeps nothing on disk.

**Snapped.** Nothing: one answer for everybody.

**Source and manners.** `https://www.worldbank.org/en/research/commodity-markets` (to find today's link to the Excel file), then `thedocs.worldbank.org/…/CMO-Historical-Data-Monthly.xlsx`: 2 requests. The file's host is verified against the project's own list of certificate authorities (`certifi`) on top of the computer's: nothing is switched off, and a wrong certificate still fails.

**Checked by.** `scripts/test_live_crops.mjs` (offline), on the page and file recorded on 2026-11-14 (`scripts/fixtures/live/prices-live/`) and on five small hand-made workbooks for what the real file does not show (a stale series, a missing price shown as `null`, a price in `$/kg`, a column with no unit or in bushels, proxies, the wrong sheet, no titles, no months). By hand: `node scripts/check_live_money.mjs prices`.
**Checked against the live service**, 2026-11-14: the page linked the sheet updated 2026-11-03; maize 2026-10 US$226.5 a tonne (+14.3% on a year), soybeans US$515, US hard red winter wheat US$317; 4.3 s and 49 MB.

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

## soilfield

**What it is.** The soil at a field in the United States from the US soil survey: the map unit under the pin, its main soils and the top layer of each (texture, organic matter, pH). No key, no login.

**Request.** `GET /api/soilfield?lat=41.18&lon=-96.44`; the server snaps the place to 0.001 degrees (about 100 m) and runs `soilfield.py LAT LON`.

**Good answer.** `{"ok": true, "source", "data_date", "units", "survey": "SSURGO" | "STATSGO2", "mapunit": {"key", "symbol", "name", "area", "farmland"}, "soils": [{"name", "percent", "drainage", "hydrologic_group", "slope_pct", "capability_class", "top": {"from_cm", "to_cm", "organic_matter_pct", "ph", "sand_pct", "silt_pct", "clay_pct", "water_cm_per_cm"}}], "citation", "note"}`. A figure the survey leaves blank stays null, never 0. The detailed survey (SSURGO) is asked first; only where it has nothing at the point, the general soil map (STATSGO2), and the note then says it is a guide for the area, not the field. The page's reader is `js/soil-load.js`.

**Failure answers.** `The USDA soil survey covers only the United States: there is no SSURGO or STATSGO2 soil at this place` (final); `The data source did not answer just now; try again in a minute`; `The soil survey sent an answer Crophalo cannot read`; `The US soil survey took too long to answer; try again in a minute (it is closed every night from about midnight to 2 am Mountain time)` (the time limit).

**Kept.** The server keeps a whole answer 30 days. The lookup keeps nothing.

**Source and manners.** USDA NRCS Soil Data Access, `https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest`, one SQL request (two where the detailed survey has nothing). Soil Survey Staff, Natural Resources Conservation Service, United States Department of Agriculture: Soil Survey Geographic (SSURGO) Database and U.S. General Soil Map (STATSGO2). US Government work.

**Checked by.** `scripts/test_soilfield.mjs` (offline: the answers Soil Data Access gave for the Mead field on 2026-11-14, and hand-made ones in its documented shape; then the page's own reader on the lookup's answer), `scripts/test_field_routes.mjs` (the route).

## soilsurvey

*To be written.*

## water

*To be written.*
