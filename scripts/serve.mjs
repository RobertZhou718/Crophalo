// Crophalo's server: one Node script, no packages. It serves the files of the app and the /api/* endpoints.
// Pure parts: pickEncoding(), tagMatches(), pointArgs(), hostOK(), originOK(). The rest reads the request, the folder or the clock.
// Checked by scripts/test_server.mjs: run it after every change here.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findLogin } from './earthdata.mjs';
import { isPublic, pagePolicy, scrubReason, allowedHosts, trustHops, rateLimit, memoryBudget, memoryPlan, securityHeaders, hostGate, startRenewal, pruneCache, memoryLine, MB } from './hostmode.mjs';   // everything that differs on a host: scripts/hostmode.mjs
import { siteOrigins, originAllowed, corsHeaders, preflight } from './hostmode.mjs';
import { createStatus } from './status.mjs';   // which data services answer: the answer of /api/sources and its "Check again"   // the website's own pages on another name (ALLOWED_ORIGINS): who may read the answers

// ---- settings (the environment is read once, here)
const ENV = process.env, H = 3600e3;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // the folder is the product: its root is the folder above scripts/
const portFrom = (...values) => { for (const v of values) if (/^\d{1,5}$/.test(String(v ?? '').trim()) && +v <= 65535) return +v; return 5173; };
const PORT = portFrom(ENV.PORT, process.argv[2]);
const HOST = ENV.HOST || '127.0.0.1';
const PUBLIC = isPublic(HOST, ENV);   // any other address can be reached from outside this computer
const CACHE = path.resolve(ENV.FW_CACHE || path.join(ROOT, '.cache'));
const PY = path.resolve(ROOT, ENV.FW_PYTHON || path.join('.venv', 'bin', 'python'));
const RATE = rateLimit(ENV), HOPS = trustHops(ENV, PUBLIC), ALLOWED_HOSTS = allowedHosts(ENV);
const BUDGET = memoryBudget({ totalmem: os.totalmem(), constrained: process.constrainedMemory?.() ?? 0, env: ENV }), PLAN = memoryPlan(BUDGET, ENV);   // a container's own memory limit, not the machine's
const USERDATA = false;   // the saved-fields copy has no route yet, so health must not promise it
process.env.FW_CACHE = CACHE;   // the Python lookups read it, so their caches land in the same folder

// The website's own addresses when its pages come from another name (a static host) and only /api comes here: those pages, and no other site, may read the answers.
// Unset (one address for both, as on this computer): nothing changes. A wildcard or an address that is not one is left out and said once at the start.
const ORIGINS = siteOrigins(ENV), SITE_ORIGINS = ORIGINS.list;
if (ORIGINS.refused.length) console.error(`ALLOWED_ORIGINS: left out ${ORIGINS.refused.map(o => JSON.stringify(o)).join(', ')}: write each as https://name (http:// only for this computer), with nothing after the name, and never *`);

// ---- answers (every answer starts in open(), so none can miss the security headers)
const SECURE = securityHeaders(PUBLIC, { cors: SITE_ORIGINS.length > 0, csp: PUBLIC && SITE_ORIGINS.length === 0 ? pagePolicy(ROOT) : null });   // the full policy when this server serves the pages itself (no other site's pages ask it)
const FAULT = 'Something went wrong on the server. Please try again in a moment.';   // what a visitor of the public site reads; the detail stays in the log
const open = (res, status, headers) => res.writeHead(status, { ...SECURE, ...headers });
function send(req, res, status, headers = {}, body = '') {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  open(res, status, status === 304 ? headers : { ...headers, 'content-length': bytes.length });   // a 304 has no body to measure
  res.end(req.method === 'HEAD' || status === 304 ? undefined : bytes);
}
const text = (req, res, status, words) => send(req, res, status, { 'content-type': 'text/plain; charset=utf-8' }, words);
async function json(req, res, status, data, extra = {}) {
  let body = Buffer.from(JSON.stringify(data));
  const enc = body.length > 1024 ? pickEncoding(req.headers['accept-encoding']) : null;
  if (enc) body = await squeeze(body, enc, 5);
  send(req, res, status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(enc ? { 'content-encoding': enc } : {}), ...extra }, body);
}
class Fail extends Error {   // a refusal in plain words: the browser shows the reason to the farmer
  constructor(status, reason, headers = {}) { super(reason); this.status = status; this.headers = headers; }
}

// How to compress an answer: 'br', 'gzip' or null. Quality values count: "br;q=0" means not br, "*" stands for every kind not named.
function pickEncoding(header) {
  const q = new Map();
  for (const part of String(header || '').toLowerCase().split(',')) {
    const [name, ...params] = part.split(';').map(s => s.trim());
    if (!name) continue;
    const given = params.find(p => p.startsWith('q='));
    const value = given ? Number(given.slice(2)) : 1;
    q.set(name, Number.isFinite(value) ? value : 0);   // a quality that cannot be read is taken as "no"
  }
  const of = name => q.get(name) ?? q.get('*') ?? 0, br = of('br'), gzip = of('gzip');
  return br > 0 && br >= gzip ? 'br' : gzip > 0 ? 'gzip' : null;
}
const squeeze = (bytes, enc, quality) => new Promise((done, fail) => {
  const back = (e, out) => (e ? fail(e) : done(out));
  if (enc === 'br') zlib.brotliCompress(bytes, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: bytes.length } }, back);
  else zlib.gzip(bytes, { level: 6 }, back);
});

// ---- who may ask (the one place these checks and the rate limit live; api() below calls them for every route)
const hostOf = req => String(req.headers.host || '').toLowerCase();
function hostOK(req) {   // turns away DNS rebinding: a page on another name that points at this address
  const name = hostOf(req).replace(/:\d+$/, '');
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(name) || ALLOWED_HOSTS.includes(name) || (PUBLIC && !ALLOWED_HOSTS.length);
}
function originOK(req) {   // no Origin is a same-origin GET or a health checker; the website's own pages on another name (ALLOWED_ORIGINS) count as this site
  const origin = req.headers.origin, host = hostOf(req);
  return !origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === 'https://' + host || origin === 'http://' + host || originAllowed(origin, SITE_ORIGINS);
}
function visitor(req) {   // behind the host's proxy the address is counted from the END of x-forwarded-for: the proxy appends what it saw, so a made-up first entry cannot fool it
  const seen = HOPS > 0 ? String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  return seen[seen.length - HOPS] || req.socket.remoteAddress || '';
}
const HITS = new Map();   // visitor → the times of their lookups in the last minute
function rateOK(req) {
  const who = visitor(req), now = Date.now(), recent = (HITS.get(who) || []).filter(t => now - t < 60e3);
  const ok = recent.length < RATE;
  if (ok) recent.push(now);
  HITS.set(who, recent);
  if (HITS.size > 5000) for (const [key, times] of HITS) if (!times.length || now - times[times.length - 1] >= 60e3) HITS.delete(key);   // idle visitors leave, so the map stays small
  return ok;
}

// ---- live lookups: one Python script per row in scripts/live/, run by the runner below. Health, ready and sources read everything from here.
const LIVE = { smaproot: { name: 'NASA SMAP root-zone soil moisture', ttl: 6 * H, point: true, snap: 0.01, timeout: 150e3, script: 'smaproot.py' }, dem: { name: 'Land heights (the finest free height map)', ttl: 30 * 24 * H, timeout: 120e3, args: boxArgs, script: 'dem.py' }, imergrain: { name: 'NASA GPM IMERG satellite rain, last 30 days', ttl: 6 * H, point: true, centre: 0.1, timeout: 150e3, script: 'imergrain.py' }, gracecell: { name: 'NASA GRACE-FO regional water storage', ttl: 7 * 24 * H, point: true, centre: 0.5, timeout: 150e3, script: 'gracecell.py' }, ecopass: { name: 'NASA ECOSTRESS ground temperature passes', ttl: 6 * H, point: true, snap: 0.0005, timeout: 150e3, script: 'ecopass.py' }, hlsndvi: { name: 'NASA HLS greenness (Landsat and Sentinel-2)', ttl: 24 * H, timeout: 150e3, args: windowArgs, script: 'hlsndvi.py' }, hlsbox: { name: 'NASA HLS greenness inside the field', ttl: 7 * 24 * H, timeout: 150e3, args: ringArgs, script: 'hlsbox.py' }, cropsnear: { name: 'Crops grown nearby (AAFC and USDA crop maps)', ttl: 30 * 24 * H, timeout: 120e3, args: countryArgs, script: 'cropsnear.py' }, crophist: { name: 'Crops on this field by year (AAFC and USDA crop maps)', ttl: 30 * 24 * H, timeout: 120e3, args: cropHistArgs, script: 'crophist.py' }, prices: { name: 'World crop prices (World Bank Pink Sheet)', ttl: 24 * H, timeout: 300e3, args: () => [], script: 'prices.py' }, faostat: { name: 'National crop yields and farm-gate prices (FAOSTAT)', ttl: 24 * H, timeout: 420e3, args: () => [], script: 'faostat.py' }, ndvihist: { name: 'NASA MODIS greenness since 2001, each season at its greenest', ttl: 30 * 24 * H, point: true, snap: 0.002, timeout: 150e3, script: 'ndvihist.py' }, firms: { name: 'NASA FIRMS fires and hot spots, last 24 hours', ttl: 3 * H, point: true, snap: 0.1, timeout: 150e3, script: 'firms.py' }, osm: { name: 'OpenStreetMap buildings, roads, water, woods and hedges', ttl: 24 * H, timeout: 150e3, args: osmArgs, script: 'osm.py' }, osmextra: { name: 'OpenStreetMap fences, gates, power lines and tanks', ttl: 24 * H, timeout: 150e3, args: osmArgs, script: 'osmextra.py' }, orbits: { name: 'Satellite orbits for the home (U.S. Space Force elements, via CelesTrak)', ttl: 12 * H, timeout: 90e3, args: () => [], quiet: true, script: 'orbits.py' } };   // id → { name, ttl, point?, snap?, timeout?, args?, quiet?, script }. Keep this on one line: test_server.mjs puts test rows into a copy of it.
const liveStats = {}, inFlight = new Map();
// Two lanes, so one slow lookup cannot hold up the others: the quick lookups (crop map, prices, national yields, fires, the home's satellite orbits) have a place reserved, the satellite and height lookups, which can run for minutes, share the rest.
// The total never goes above LIVE_MAX (memory is the limit on a small host); with one place only, the quick lookups go first when it is free.
const QUICK = new Set(['cropsnear', 'prices', 'faostat', 'firms', 'orbits']), laneOf = id => (QUICK.has(id) ? 'quick' : 'slow');
const lane = { quick: { n: 0, q: [] }, slow: { n: 0, q: [] } };
const laneMax = l => (LIVE_MAX >= 2 ? (l === 'quick' ? 1 : LIVE_MAX - 1) : 1);
const mayStart = l => lane[l].n < laneMax(l) && (LIVE_MAX >= 2 || lane.quick.n + lane.slow.n < 1);
const liveRunning = () => lane.quick.n + lane.slow.n, liveWaiting = () => lane.quick.q.length + lane.slow.q.length;
async function takeSlot(id) {
  const l = laneOf(id);
  while (!mayStart(l)) await new Promise(wake => lane[l].q.push(wake));
  lane[l].n++;
  return () => { lane[l].n--; for (const k of ['quick', 'slow']) while (lane[k].q.length && mayStart(k)) lane[k].q.shift()(); };
}
const statOf = id => (liveStats[id] ||= { last_ms: null, last_time: null, last_ok_time: null, last_error: null });   // times in ms; ISO only on the way out
const iso = ms => (ms ? new Date(ms).toISOString() : null);

function pointArgs(q) {   // decimal degrees; a blank is missing, never 0
  const read = v => (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(String(v ?? '').trim()) ? Number(v) : NaN);
  const lat = read(q.get('lat')), lon = read(q.get('lon'));
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat.toFixed(4), lon.toFixed(4)] : { reason: 'lat and lon are required (decimal degrees)' };   // 4 decimals is about 11 m
}
// A coarse grid read at the centre of its square (satellite rain 0.1 degree, water storage 0.5 degree): floor(v / step) * step + step / 2, never rounded, which could move the pin into the next square.
// A pin on the last line of the grid (latitude 90, longitude 180) belongs to the last square, not to one beyond it.
const centre = (value, step, max) => (Math.floor(Math.min(Number(value), max - 1e-9) / step + 1e-9) * step + step / 2).toFixed(4);
// The greenness lookup: LAT LON [FIRST LAST], the window as YYYYMMDD; the lookup itself checks the window (in order, at most 800 days).
function windowArgs(q) {
  const at = pointArgs(q); if (!Array.isArray(at)) return at;
  const first = String(q.get('first') ?? '').trim(), last = String(q.get('last') ?? '').trim();
  if (!first && !last) return at;
  return /^\d{8}$/.test(first) && /^\d{8}$/.test(last) ? [...at, first, last] : { reason: 'first and last must both be given as YYYYMMDD' };
}
// The weak-spots lookup: LAT LON RING, the field's outline as lon,lat pairs joined by ";" (3 to 200 corners, closed or not, written with 6 decimals), its box at most 2 km a side. The lookup checks the same again.
const RING_WORDS = 'The field\'s outline must be 3 to 200 corners written lon,lat and joined by ;', RING_BIG = 'This field is too big for one look (over 2 km across). Split it to look for weak spots.';
function ringArgs(q) {
  const at = pointArgs(q); if (!Array.isArray(at)) return at;
  const num = v => (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(String(v ?? '').trim()) ? Number(v) : NaN);
  const pts = String(q.get('ring') ?? '').split(';').filter(s => s.trim()).map(s => s.split(',').map(num));
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();   // a closed outline repeats its first corner
  if (pts.length < 3 || pts.length > 200 || !pts.every(p => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 84)) return { reason: RING_WORDS };
  const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]), mid = (Math.min(...lats) + Math.max(...lats)) / 2 * Math.PI / 180;
  if ((Math.max(...lons) - Math.min(...lons)) * 111320 * Math.cos(mid) > 2000 || (Math.max(...lats) - Math.min(...lats)) * 110574 > 2000) return { reason: RING_BIG };
  return [...at, pts.map(p => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';')];
}
// The crop-map lookup: LAT LON COUNTRY. Only Canada and the 48 lower US states have a crop map here; the country comes from the page (a code or the name it shows).
const COUNTRY = { ca: 'CA', canada: 'CA', us: 'US', usa: 'US', 'united states': 'US', 'united states of america': 'US' };
function countryArgs(q) {
  const at = pointArgs(q); if (!Array.isArray(at)) return at;
  if (Math.abs(Number(at[0])) > 84) return { reason: 'lat must be -84..84 and lon -180..180' };
  const said = String(q.get('country') ?? '').trim().toLowerCase(), code = Object.hasOwn(COUNTRY, said) ? COUNTRY[said] : said.toUpperCase();
  if (!said) return { reason: 'The country of the field is needed to read the crop map (country=CA or US)' };
  return [...at, /^[A-Z]{2}$/.test(code) ? code : 'ZZ'];   // another country (ZZ: a code no country has): the lookup says plainly that its maps cover Canada and the US only
}
// The field's crop map by year: LAT LON COUNTRY NEAR [RING]. near is 0 or 1 (blank: 0); ring, when given, is 3 to 200 corners lon,lat;lon,lat;… written with 4 decimals (about 11 m), as the cache key wants them.
function cropHistArgs(q) {
  const at = countryArgs(q); if (!Array.isArray(at)) return at;
  const near = String(q.get('near') ?? '').trim() || '0', ring = String(q.get('ring') ?? '').trim();
  if (near !== '0' && near !== '1') return { reason: 'near must be 0 or 1' };
  if (!ring) return [...at, near];
  const num = v => (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(String(v).trim()) ? Number(v) : NaN), corners = ring.split(';').map(p => p.split(',').map(num));
  if (corners.length < 3 || corners.length > 201 || !corners.every(c => c.length === 2 && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 84)) return { reason: 'The field\'s outline must be 3 to 200 corners written lon,lat;lon,lat' };
  return [...at, near, corners.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(';')];
}
// The height lookup: LAT LON W D NX NY [SOURCE]. A box of 20 m to 8 km a side with 2 to 257 points a side.
const DEM_SOURCES = ['hrdem', 'hrdem2', 'usgs3dep', 'usgs13', 'mrdem', 'ahn', 'ea', 'ign-es', 'ign-fr', 'glo30', 'nasadem'];
const BOX_WORDS = 'The box must be 20 m to 8 km a side, with 2 to 257 points a side';
function boxArgs(q) {   // the arguments written the way the script and the cache key want them: 4 decimals (about 11 m), whole metres, whole points
  const num = v => (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(String(v ?? '').trim()) ? Number(v) : NaN);
  const lat = num(q.get('lat')), lon = num(q.get('lon')), w = num(q.get('w')), d = num(q.get('d')), nx = num(q.get('nx')), ny = num(q.get('ny'));
  if (![lat, lon, w, d, nx, ny].every(Number.isFinite)) return { reason: 'lat, lon, w, d, nx and ny are required as plain numbers' };
  if (Math.abs(lat) > 84 || Math.abs(lon) > 180) return { reason: 'lat must be -84..84 and lon -180..180' };
  const side = v => Math.round(v);
  if (side(w) < 20 || side(w) > 8000 || side(d) < 20 || side(d) > 8000 || !Number.isInteger(nx) || !Number.isInteger(ny) || nx < 2 || nx > 257 || ny < 2 || ny > 257) return { reason: BOX_WORDS };
  const source = String(q.get('source') ?? '').trim();
  if (source && !DEM_SOURCES.includes(source)) return { reason: 'That height map is not one of the known sources' };
  return [lat.toFixed(4), lon.toFixed(4), String(side(w)), String(side(d)), String(nx), String(ny), ...(source ? [source] : [])];
}

// The OpenStreetMap lookups: LAT LON W D, a box of 20 m to 3.6 km a side; the place to 4 decimals (about 11 m) and the sides in whole metres, so one field is asked once a day however often it is opened.
function osmArgs(q) {
  const num = v => (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(String(v ?? '').trim()) ? Number(v) : NaN);
  const lat = num(q.get('lat')), lon = num(q.get('lon')), w = num(q.get('w')), d = num(q.get('d'));
  if (![lat, lon, w, d].every(Number.isFinite)) return { reason: 'lat, lon, w and d are required as plain numbers' };
  if (Math.abs(lat) > 84 || Math.abs(lon) > 180) return { reason: 'lat must be -84..84 and lon -180..180' };
  if (Math.round(w) < 20 || Math.round(w) > 3600 || Math.round(d) < 20 || Math.round(d) > 3600) return { reason: 'The box must be 20 m to 3.6 km a side' };
  return [lat.toFixed(4), lon.toFixed(4), String(Math.round(w)), String(Math.round(d))];
}

// The runner: one Python process per question, one run for one question however many ask, a few at once in all (LIVE_MAX; one on a small host),
// at most LIVE_WAIT_MAX waiting, each with its time limit, in its own process group, with a clean environment, its answer kept on disk for its row's time.
const LIVE_MAX = PLAN.liveMax, LIVE_WAIT_MAX = PLAN.liveWaitMax, LIVE_DIR = path.join(ROOT, 'scripts', 'live'), OUT_MAX = 8e6;
const snap = (value, step) => (Math.round(Number(value) / step) * step).toFixed(Math.max(0, Math.ceil(-Math.log10(step))));   // 44.4037 on a 0.01 grid is "44.40": every pin inside one square shares one answer
const hashOf = args => crypto.createHash('sha1').update(args.join('\u0001')).digest('hex').slice(0, 20);
const cacheFile = (id, args, final = false) => path.join(CACHE, 'api', `${final ? 'final-' : ''}${id}_${hashOf(args)}.json`);   // a final failure has its own name, so the sources count leaves it out
function keepFor(answer, row) {   // a whole answer for the row's time; a partial one for an hour; a failure asking again cannot change for a day; any other failure not at all
  if (answer.ok !== true) return answer.final === true ? 24 * H : 0;
  return answer.incomplete || answer.stale || answer.read_errors > 0 ? H : row.ttl;
}
function readKept(file, now) { try { const kept = JSON.parse(fs.readFileSync(file, 'utf8')); return now >= kept.stored && now < kept.until ? kept : null; } catch { return null; } }
function writeKept(file, answer, keep) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`, now = Date.now(); fs.writeFileSync(tmp, JSON.stringify({ stored: now, until: now + keep, answer })); fs.renameSync(tmp, file); return now; }
  catch { return Date.now(); }   // a full disk only means no keeping
}
const keep = name => (ENV[name] ? { [name]: ENV[name] } : {});
function baseEnv(limitMs) {   // a clean environment for any Python of the server: the trust roots and the time limit, nothing else of the server's
  return { PATH: ENV.PATH, ...keep('HOME'), ...keep('USERPROFILE'), ...keep('SystemRoot'), ...keep('TEMP'), ...keep('TMP'), ...keep('TMPDIR'),
    FW_CACHE: CACHE, FW_LIMIT_S: String(limitMs / 1e3), PYTHONWARNINGS: 'ignore', PYTHONDONTWRITEBYTECODE: '1',
    ...(process.platform === 'win32' ? { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } : {}), ...(trustRoots() ? { SSL_CERT_FILE: trustRoots() } : {}) };
}
function childEnv(row) {   // a lookup's environment: the clean one plus the NASA login, looked for again for every lookup
  const found = findLogin(ROOT);
  keepLogin(found);
  return { ...baseEnv(row.timeout || 120e3), ...keep('EARTHDATA_USERNAME'), ...keep('EARTHDATA_PASSWORD'), ...found.env };
}
function stopTree(child, signal) { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) : process.kill(-child.pid, signal); } catch { /* already gone */ } }

// ---- readiness: worked out once at the start and kept. Health and ready only read these; neither ever starts a program.
//      PYTHON: does the folder's Python run, and do the NASA data libraries load (one run at the start).
//      LOGIN: is a NASA login set up (looked for at the start, again by every lookup and by the login check).
//      LOGIN_WORKS: does NASA accept it: null until someone asks (POST /api/login-check), then what NASA said.
const NOT_YET = 'The Python check of the live lookups has not finished yet';
const PYTHON = { ok: false, reason: NOT_YET, certifi: '' };
let LOGIN = findLogin(ROOT), LOGIN_WORKS = null, LOGIN_CHECKED = null, loginCheck = null;
function keepLogin(found) { if (found.where !== LOGIN.where) { LOGIN_WORKS = null; LOGIN_CHECKED = null; } LOGIN = found; }   // another place is another login: not tried yet
// HTTPS trust roots for every Python: the owner's SSL_CERT_FILE when set, else the certifi bundle installed with the libraries. Checks are never switched off.
const trustRoots = () => ENV.SSL_CERT_FILE || PYTHON.certifi;
const caKind = () => (ENV.SSL_CERT_FILE ? (ENV.SSL_CERT_FILE === PYTHON.certifi ? 'certifi' : 'owner') : PYTHON.certifi ? 'certifi' : 'system');
function libraryNames() {   // the six library names live in portable.sh; they are read, never copied
  try { return fs.readFileSync(path.join(ROOT, 'scripts', 'portable.sh'), 'utf8').match(/^PY_IMPORTS='([A-Za-z0-9_, ]+)'/m)?.[1] || null; } catch { return null; }
}
function runPython(args, env, limitMs) {   // what one short Python run printed, its exit code, and whether it could start at all
  return new Promise(done => {
    const out = [];
    let child, ended = false, size = 0;
    const end = answer => { if (!ended) { ended = true; clearTimeout(limit); done({ ...answer, out: Buffer.concat(out).toString('utf8') }); } };
    try { child = spawn(PY, args, { cwd: ROOT, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { return done({ started: false, code: null, out: '' }); }
    const limit = setTimeout(() => { stopTree(child, 'SIGKILL'); end({ started: true, code: null, timedOut: true }); }, limitMs);
    child.stdout.on('data', d => { size += d.length; if (size < 1e6) out.push(d); });
    child.on('error', () => end({ started: false, code: null }));
    child.on('close', code => end({ started: code !== 126 && code !== 127, code }));   // 126 and 127: the shell's "cannot run this"
  });
}
async function checkPython() {
  const libs = libraryNames();
  if (!fs.existsSync(PY)) return Object.assign(PYTHON, { ok: false, reason: 'The Python environment for the live lookups is missing' });
  if (!libs) return Object.assign(PYTHON, { ok: false, reason: 'The list of the NASA data libraries could not be read (scripts/portable.sh)' });
  const code = `import json, sys\nprint("CROPHALO_PY", flush=True)\nimport ${libs}\nimport certifi\nprint(json.dumps({"crophalo_python": sys.version.split()[0], "certifi": certifi.where()}))`;
  const r = await runPython(['-c', code], baseEnv(90e3), 90e3);
  let said = null;
  for (const l of r.out.split('\n').reverse()) { try { const v = JSON.parse(l); if (v && typeof v.crophalo_python === 'string') { said = v; break; } } catch { /* a library's own line */ } }
  if (r.code === 0 && said) {
    const certifi = typeof said.certifi === 'string' && said.certifi && fs.existsSync(said.certifi) ? said.certifi : '';
    return Object.assign(PYTHON, { ok: true, reason: '', certifi });
  }
  const ran = r.started && /^CROPHALO_PY\s*$/m.test(r.out);
  console.error(`python check: ${ran ? 'the NASA data libraries do not load' : 'Python does not run'}${r.timedOut ? ' (no answer in 90 s)' : ''}`);   // no path: the log may be read on the host
  return Object.assign(PYTHON, { ok: false, reason: ran ? 'Python runs, but the NASA data libraries do not load' : 'Python for the live lookups does not run' });
}
const pythonChecked = checkPython().catch(() => Object.assign(PYTHON, { ok: false, reason: 'Python for the live lookups does not run' }));
// Asks NASA once whether the login works. Its one line: LOGIN yes, LOGIN no, or LOGIN unasked (NASA could not be asked).
const LOGIN_CHECK = `import sys, earthaccess
try:
    a = earthaccess.login(strategy=sys.argv[1])
    print("LOGIN", "yes" if getattr(a, "authenticated", False) else "no")
except Exception:
    print("LOGIN", "unasked")`;
const LOGIN_FRESH_MS = 30e3;
async function checkLogin() {
  await pythonChecked;
  if (!PYTHON.ok) throw new Fail(503, PYTHON.reason);
  keepLogin(findLogin(ROOT));
  const fresh = LOGIN_CHECKED && Date.now() - LOGIN_CHECKED < LOGIN_FRESH_MS;   // asked again within 30 s: the answer NASA just gave, so no one can make the server ask NASA without end
  if (LOGIN.where && !fresh) {
    loginCheck ||= (async () => {
      const env = { ...baseEnv(60e3), ...keep('EARTHDATA_USERNAME'), ...keep('EARTHDATA_PASSWORD'), ...LOGIN.env };
      const said = (await runPython(['-c', LOGIN_CHECK, LOGIN.where === 'home' ? 'netrc' : 'environment'], env, 60e3)).out.match(/^LOGIN (yes|no|unasked)\s*$/m)?.[1];
      LOGIN_WORKS = said === 'yes' ? true : said === 'no' ? false : null; LOGIN_CHECKED = Date.now();
    })().finally(() => { loginCheck = null; });
    await loginCheck;
  }
  return { ok: true, netrc: !!LOGIN.where, login_works: LOGIN.where ? LOGIN_WORKS : null, ...(LOGIN.where ? { checked: iso(LOGIN_CHECKED) } : {}) };
}
function runScript(id, row, args) {   // always resolves with an answer object
  return new Promise(done => {
    const started = Date.now(), out = [], err = [], limitMs = row.timeout || 120e3;
    let size = 0, over = false, timedOut = false, hard = 0, child;
    const finish = answer => {
      if (answer && answer.ok !== true && typeof answer.reason === 'string') answer.reason = scrubReason(answer.reason);   // a failed lookup's words reach the page: no address, path, key or stack in them
      const stat = statOf(id); stat.last_ms = Date.now() - started; stat.last_time = Date.now();
      if (answer.ok) { stat.last_ok_time = Date.now(); stat.last_error = null; } else stat.last_error = String(answer.reason || '');
      done(answer);
    };
    try { child = spawn(PY, ['-u', row.script || id + '.py', ...args], { cwd: LIVE_DIR, env: childEnv(row), detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return finish({ ok: false, reason: 'Could not start Python: ' + e.message }); }
    child.stdout.on('data', d => { size += d.length; if (size > OUT_MAX) over = true; else out.push(d); });
    child.stderr.on('data', d => { err.push(d); if (err.length > 50) err.shift(); });
    const limit = setTimeout(() => { timedOut = true; stopTree(child, 'SIGTERM'); hard = setTimeout(() => stopTree(child, 'SIGKILL'), 3000); }, limitMs);
    let ended = false;
    child.on('error', e => { if (ended) return; ended = true; clearTimeout(limit); clearTimeout(hard); finish({ ok: false, reason: 'Could not start Python: ' + e.message }); });
    child.on('close', code => {
      if (ended) return; ended = true; clearTimeout(limit); clearTimeout(hard);
      let answer = null;
      if (!timedOut && !over) { try { answer = JSON.parse(Buffer.concat(out).toString('utf8')); } catch { /* said below */ } }
      if (timedOut) answer = { ok: false, reason: `Timed out after ${Math.round(limitMs / 1000)} s` };
      else if (!answer || typeof answer !== 'object' || Array.isArray(answer) || typeof answer.ok !== 'boolean') {
        console.error(`${id}: no valid answer (exit ${code})${over ? ', the output was too long' : ''}:`, Buffer.concat(err).toString('utf8').slice(-600));   // the lookup's own log: it holds no address and no secret
        answer = { ok: false, reason: `The ${id} script gave no valid answer (exit ${code})` };
      }
      finish(answer);
    });
  });
}
async function lookup(req, res, id, row, url) {
  let args = row.args ? row.args(url.searchParams) : row.point ? pointArgs(url.searchParams) : [];
  if (!Array.isArray(args)) throw new Fail(400, args.reason);
  if (!fs.existsSync(PY)) {   // quiet: a lookup every visit asks for (the home's orbits) gets a plain "no", not a server fault, on a copy with no Python
    if (row.quiet) return json(req, res, 200, { ok: false, reason: `${row.name}: this copy of Crophalo has no Python for its live lookups` });
    throw new Fail(500, 'Python environment not found (.venv)');
  }
  if (row.snap) args = args.map(v => snap(v, row.snap));
  if (row.centre) args = args.map((v, i) => centre(v, row.centre, i === 0 ? 90 : 180));
  const spot = row.point && (row.snap || row.centre) ? { lat: Number(args[0]), lon: Number(args[1]) } : null;   // the place really read: the answer says it
  const send = (answer, cached, at) => json(req, res, 200, { ...answer, ...(spot && answer.ok ? { spot } : {}), cached, fetched: new Date(at).toISOString() });
  const file = cacheFile(id, args), finalFile = cacheFile(id, args, true), now = Date.now(), hit = readKept(file, now) || readKept(finalFile, now);
  if (hit) return send(hit.answer, true, hit.stored);
  let job = inFlight.get(file);
  if (!job) {   // visitors asking the same thing share one run
    if (!mayStart(laneOf(id)) && lane[laneOf(id)].q.length >= LIVE_WAIT_MAX) return json(req, res, 200, { ok: false, reason: 'The data server is busy. Try again in a minute.' });
    job = { id, promise: (async () => {
      const release = await takeSlot(id);
      try { return await runScript(id, row, args); } finally { release(); }
    })().then(answer => { const keep = keepFor(answer, row); return { answer, at: keep ? writeKept(answer.ok ? file : finalFile, answer, keep) : Date.now() }; }) };
    inFlight.set(file, job);
    job.promise.finally(() => inFlight.delete(file));
  }
  const { answer, at } = await job.promise;
  return send(answer, false, at);
}

// ---- status
function health() {   // a host calls this every few seconds: memory only, never a file, a folder scan or a program
  const login = LOGIN.where, live = {};
  for (const [id, row] of Object.entries(LIVE)) live[id] = { last_ok: iso(statOf(id).last_ok_time), error: statOf(id).last_error, ttl_hours: row.ttl / H };
  return {
    ok: true, python: PYTHON.ok,
    ...(PUBLIC ? {} : { root: ROOT, cache: path.join(CACHE, 'api') }),   // a public server never says where its folders are; root tells two folders that share one cache apart
    netrc: !!login, ...(PUBLIC ? {} : { login }), login_works: login ? LOGIN_WORKS : null, ca: caKind(),
    userdata: USERDATA, uptime_s: Math.round(process.uptime()), busy: liveRunning(), queued: liveWaiting(), live_max: LIVE_MAX, memory_mb: Math.round(process.memoryUsage().rss / MB), memory_limit_mb: PLAN.mb, live,
  };
}
function ready() {   // Python must really run with its libraries; a missing or refused NASA login only dims the satellite data, so it does not count
  const now = health();
  return now.python ? [200, now] : [503, { ...now, ok: false, reason: PYTHON.reason }];
}
function cacheFiles() {   // name and file time only: the folder can hold thousands, so no file is opened
  const dir = path.join(CACHE, 'api'), out = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return out; }
  for (const name of names) if (name.endsWith('.json')) try { out.push([name, fs.statSync(path.join(dir, name)).mtimeMs]); } catch { /* removed meanwhile */ }
  return out;
}
let sourcesAt = 0, sourcesKept = null;   // the answer is worked out at most once in five seconds, however many ask: with thousands of kept answers one pass over the folder takes tens of milliseconds
function sources() {
  const now = Date.now(); if (sourcesKept && now - sourcesAt < 5000) return sourcesKept;
  sourcesKept = sourcesNow(); sourcesAt = now; return sourcesKept;
}
function sourcesNow() {
  const files = cacheFiles(), now = Date.now();
  return Object.entries(LIVE).map(([id, row]) => {
    const stat = statOf(id), kept = files.filter(([name, t]) => (name === id + '.json' || name.startsWith(id + '_')) && now - t < row.ttl);
    const newest = kept.reduce((best, [, t]) => Math.max(best, t), stat.last_ok_time || 0);
    return {
      id, name: row.name, last_ok_time: iso(newest), last_ms: stat.last_ms, last_error: stat.last_error, cache_items: kept.length,
      last_time: iso(stat.last_time), ttl_hours: row.ttl / H, in_flight: [...inFlight.values()].filter(job => job.id === id).length,
    };
  });
}

// The status of every data service (scripts/status.mjs): the run counters, the kept answers per service, whether a login is set, true or false only.
// kept and the newest kept answer's time read the five-second memo of sources(), so asking /api/sources often never scans the folder of kept answers more than once in five seconds:
// an answer kept before a restart still gives its service a last answer time. The login is the one the server already holds (LOGIN), so a visitor's ask opens no file.
// A key list (keys:) is not handed in yet: every lookup that needs a key reads "not set" until scripts/keys.mjs is in the folder.
const status = createStatus({
  live: LIVE, env: ENV, fetch: globalThis.fetch,
  stats: () => { const out = { ...liveStats }; for (const row of sources()) { const t = Date.parse(row.last_ok_time) || 0; if (t) out[row.id] = { ...(liveStats[row.id] || {}), last_ok_time: Math.max(liveStats[row.id]?.last_ok_time || 0, t) }; } return out; },
  kept: id => sources().find(row => row.id === id)?.cache_items ?? 0,
  loginSet: () => !!LOGIN.where,
});

// ---- routes: the one place an /api path is registered.
//      open = answers before the who-may-ask checks (a host's checker uses whatever name it likes); rate = counts against the visitor's limit.
const ROUTES = {
  '/api/health': { methods: ['GET', 'HEAD'], open: true, run: (req, res) => json(req, res, 200, health()) },
  '/api/ready': { methods: ['GET', 'HEAD'], open: true, run: (req, res) => json(req, res, ...ready()) },
  '/api/sources': { methods: ['GET'], run: (req, res) => json(req, res, 200, status.list()) },
  '/api/sources/check': { methods: ['POST'], rate: true, run: async (req, res, url) => json(req, res, 200, await status.check((url.searchParams.get('id') || '').split(',').filter(Boolean))) },   // a POST, so a link or a prefetch never starts it; each service is asked at most once in ten minutes
  '/api/login-check': { methods: ['POST'], rate: true, run: async (req, res) => json(req, res, 200, await checkLogin()) },   // asks NASA, so only when someone asks for it
};
function routeFor(pathname) {
  const id = pathname.slice(5);
  if (Object.hasOwn(ROUTES, pathname)) return ROUTES[pathname];
  return Object.hasOwn(LIVE, id) ? { methods: ['GET'], rate: true, run: (req, res, url) => lookup(req, res, id, LIVE[id], url) } : null;   // own keys only: "toString" is not a lookup
}
async function api(req, res, url) {
  const gated = hostGate(url.pathname, PUBLIC); if (gated) throw new Fail(gated.status, gated.reason);   // routes for this computer only are not there on a public server
  const route = routeFor(url.pathname), fits = !!route && route.methods.includes(req.method);
  if (!(fits && route.open) && !(hostOK(req) && originOK(req))) throw new Fail(403, 'Requests from other websites are not allowed');
  if (!route) throw new Fail(404, 'Unknown endpoint');
  if (!fits) throw new Fail(405, 'Use ' + route.methods.join(' or '), { allow: route.methods.join(', ') });
  if (route.rate && !rateOK(req)) throw new Fail(429, 'Too many requests. Wait a moment and try again.', { 'retry-after': '30' });
  return route.run(req, res, url);
}

// ---- files of the app
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm',
};
const TEXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.md', '.txt', '.xml', '.webmanifest', '.wasm']);   // the types worth compressing
// What the page asks for: its own pages and files at the top, and the six folders of the app, and the citation pages in docs/. Everything else (the server's code, the tests,
// the starters, the folder's own pages) stays on this computer, so the public site never hands it out.
const SERVED = /^(index\.html|design\.html|manifest\.json|sw\.js|robots\.txt|favicon\.ico|docs\/[a-z0-9-]+\.md|(js|css|data|design|icons|vendor)\/.+|img\/(craft|earth)\/[a-z0-9-]+\.webp)$/;   // sw.js: the worker that keeps the copy for offline use, served from the top so it can look after the whole app
const REAL_ROOT = fs.realpathSync.native(ROOT);   // the folder as the disk names it, to judge where a link really leads (native: the same spelling realpath gives each file, whatever capitals or letter forms the start was typed with)
function refused(rel) {   // a path relative to the folder: outside it, hidden, runtime/ or anything the page never asks for (scripts/ among them)
  const outside = rel.startsWith('..') || path.isAbsolute(rel), hidden = /(^|\/)\./.test(rel), packed = /^runtime(\/|$)/i.test(rel);   // "RUNTIME" too: this Mac's disk does not tell capitals apart
  return outside || hidden || packed || !SERVED.test(rel);
}
const KEPT_A_DAY = /^(data\/spam|icons|design|vendor|img\/craft|img\/earth)\//;   // these change only with a release; code is asked about on every visit
const ZIPPED = new Map(), ZIPPED_MAX = 400;   // compressed copies by kind and file, reused while the ETag matches

const tagMatches = (header, etag) => String(header || '').split(',').some(tag => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''));
function zipped(file, etag, enc) {
  const key = enc + ' ' + file, hit = ZIPPED.get(key);
  if (hit && hit.etag === etag) return hit.bytes;
  const bytes = fs.promises.readFile(file).then(raw => squeeze(raw, enc, 6));   // the promise is kept, so two visitors at once share one compression
  ZIPPED.delete(key); ZIPPED.set(key, { etag, bytes });
  bytes.catch(() => { if (ZIPPED.get(key)?.bytes === bytes) ZIPPED.delete(key); });
  while (ZIPPED.size > ZIPPED_MAX) ZIPPED.delete(ZIPPED.keys().next().value);   // oldest out first
  return bytes;
}
async function file(req, res, url) {
  let asked;
  try { asked = decodeURIComponent(url.pathname); } catch { return text(req, res, 400, 'bad request'); }
  if (asked.includes('\0')) return text(req, res, 400, 'bad request');   // a NUL in a path once stopped the whole server
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, { allow: 'GET, HEAD' });
  const named = path.join(ROOT, asked.endsWith('/') ? asked + 'index.html' : asked), rel = path.relative(ROOT, named).split(path.sep).join('/');
  if (refused(rel)) return send(req, res, 403);
  // A link is judged by where it really leads: the same refusals for that real file, and the real file is what is sent.
  const full = await fs.promises.realpath(named).catch(() => null);
  if (!full) return text(req, res, 404, 'not found');
  if (refused(path.relative(REAL_ROOT, full).split(path.sep).join('/'))) return send(req, res, 403);
  const st = await fs.promises.stat(full).catch(() => null);
  if (!st || !st.isFile()) return text(req, res, 404, 'not found');
  const ext = path.extname(full).toLowerCase();
  const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const head = {
    'content-type': Object.hasOwn(TYPES, ext) ? TYPES[ext] : 'application/octet-stream',
    'cache-control': KEPT_A_DAY.test(rel) || ext === '.png' ? 'public, max-age=86400' : 'no-cache', etag,
  };
  if (tagMatches(req.headers['if-none-match'], etag)) return send(req, res, 304, head);
  const enc = TEXT.has(ext) && st.size > 1024 ? pickEncoding(req.headers['accept-encoding']) : null;
  if (enc) return send(req, res, 200, { ...head, 'content-encoding': enc }, await zipped(full, etag, enc));
  open(res, 200, { ...head, 'content-length': st.size });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(full).on('error', () => res.destroy());
  res.on('close', () => stream.destroy());   // a visitor who leaves mid-file must not keep the file open
  stream.pipe(res);
}

// ---- the reminder pushes (scripts/push.mjs) and the US drought weeks (scripts/drought.mjs): each answers its own /api paths and reads its own request body.
//      A copy of the server without those files (a test site) simply has no such routes.
const SITE_HOSTS = ALLOWED_HOSTS;
const push = await import('./push.mjs').then(m => m.createPush({ dir: CACHE, env: ENV, publicMode: PUBLIC, siteHosts: SITE_HOSTS, siteOrigins: SITE_ORIGINS })).catch(e => (e?.code === 'ERR_MODULE_NOT_FOUND' ? null : (console.error('push: not started:', e?.message || e), null)));
const drought = await import('./drought.mjs').then(m => m.createDrought({ dir: CACHE, env: ENV })).catch(e => (e?.code === 'ERR_MODULE_NOT_FOUND' ? null : (console.error('drought: not started:', e?.message || e), null)));

// ---- the request boundary: one bad request must never stop the server
async function handle(req, res) {
  let url;
  try { url = new URL(req.url.startsWith('/') ? 'http://localhost' + req.url : req.url); } catch { return text(req, res, 400, 'bad request'); }
  if (SITE_ORIGINS.length && url.pathname.startsWith('/api/')) {   // the website's own pages on another name: they may read these answers (a plain GET needs nothing more)
    const origin = req.headers.origin;
    if (req.method === 'OPTIONS' && origin && req.headers['access-control-request-method']) {   // the browser asks first before a POST of JSON (the reminder pushes): yes for the site's pages only
      const yes = preflight(url.pathname, origin, req.headers['access-control-request-method'], req.headers['access-control-request-headers'], SITE_ORIGINS);
      if (yes.status === 204) { open(res, 204, yes.headers); return res.end(); }
      return json(req, res, yes.status, { ok: false, reason: yes.reason }, yes.headers);
    }
    for (const [name, value] of Object.entries(corsHeaders(origin, SITE_ORIGINS))) res.setHeader(name, value);   // every answer below, refusals included, can then be read by those pages
  }
  if (url.pathname.startsWith('/api/push') || url.pathname === '/api/drought') {
    for (const [name, value] of Object.entries(SECURE)) res.setHeader(name, value);   // these two write their own answers: the security headers go on first
    if (push && await push.handle(req, res, url.pathname)) return;
    if (drought && await drought.handle(req, res, url)) return;
  }
  return url.pathname.startsWith('/api/') ? api(req, res, url) : file(req, res, url);
}
function fault(req, res, e) {
  if (res.headersSent) return res.destroy();
  if (e instanceof Fail && !(PUBLIC && e.status >= 500)) return json(req, res, e.status, { ok: false, reason: e.message }, e.headers);
  console.error('request failed:', e?.stack || e);   // the error only: never the address asked for, it can hold a field's position
  if (e instanceof Fail) return json(req, res, e.status, { ok: false, reason: FAULT }, e.headers);   // a public site never tells a visitor about its own insides
  return String(req.url).startsWith('/api/') ? json(req, res, 500, { ok: false, reason: PUBLIC ? FAULT : 'Server error: ' + (e?.message || e) }) : text(req, res, 500, 'server error');
}
const server = http.createServer((req, res) => {
  handle(req, res).catch(e => fault(req, res, e)).catch(() => res.destroy());
});
server.on('clientError', (e, socket) => {   // a request Node itself could not read still gets a plain answer with the security headers
  if (e.code === 'ECONNRESET' || !socket.writable) return socket.destroy();
  const status = e.code === 'ERR_HTTP_REQUEST_TIMEOUT' ? '408 Request Timeout' : e.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large' : '400 Bad Request';
  const headers = { ...SECURE, 'content-type': 'text/plain; charset=utf-8', 'content-length': 11, connection: 'close' };
  socket.end(`HTTP/1.1 ${status}\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')}\r\nbad request`);
});

// ---- shared data renewed on a timer (scripts/hostmode.mjs decides when): a copy about to run out is rebuilt while visitors still get the old one, so no one waits for it
async function refresh(id) {
  const row = LIVE[id]; if (!row || !fs.existsSync(PY)) return false;
  const args = row.args ? row.args(new URLSearchParams()) : row.point ? null : [];
  if (!Array.isArray(args)) return false;   // a lookup that needs a place is not a shared dataset
  const file = cacheFile(id, args), finalFile = cacheFile(id, args, true);
  if (inFlight.has(file)) return true;
  const job = { id, promise: (async () => {
    const release = await takeSlot(id);
    try { return await runScript(id, row, args); } finally { release(); }
  })().then(answer => { const keep = keepFor(answer, row); return { answer, at: keep ? writeKept(answer.ok ? file : finalFile, answer, keep) : Date.now() }; }) };
  inFlight.set(file, job); job.promise.finally(() => inFlight.delete(file));
  return (await job.promise).answer.ok === true;
}
const SHARED = (ENV.FW_RENEW_IDS ?? 'faostat,gracegrid,prices').split(',').map(x => x.trim()).filter(id => Object.hasOwn(LIVE, id));   // none until those rows exist
const renewal = PUBLIC || ENV.FW_RENEW === '1' ? startRenewal(SHARED.map(id => ({ id, ttl: LIVE[id].ttl, warm: () => refresh(id), changed: LIVE[id].changed })), { log: line => console.log('renew: ' + line) }) : null;
const upkeep = PUBLIC ? setInterval(() => {
  const gone = pruneCache(path.join(CACHE, 'api'), id => LIVE[id]?.ttl); if (gone) console.log(`prune: ${gone} old answer(s) removed`);
  if (liveRunning() || liveWaiting()) console.log(memoryLine(process.memoryUsage(), BUDGET, liveRunning(), liveWaiting()));
}, 60e3) : null;
upkeep?.unref();

// ---- start and stop
server.keepAliveTimeout = 65e3; server.headersTimeout = 70e3; server.requestTimeout = 60e3;   // longer than a host's proxy keeps a connection, so it never sends a request down a closed one
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE'
    ? `Port ${PORT} is already in use. Close the other program that uses it, or start on another port (sh scripts/run.sh --port 8080, or PORT=8080).`
    : `Crophalo could not start on ${HOST}, port ${PORT}: ${e.message}`);
  process.exit(1);
});
server.listen(PORT, HOST, () => { push?.start(); console.log(`Crophalo on http://${HOST.includes(':') ? `[${HOST}]` : HOST}:${server.address().port}${PUBLIC ? ' (public)' : ''}`); if (PUBLIC) console.log(`memory plan: ${PLAN.mb} MB, ${PLAN.liveMax} lookups at once`); if (SITE_ORIGINS.length) console.log(`answers readable by the website at ${SITE_ORIGINS.join(', ')}`); });

let stopping = false;
function stop(signal) {   // a new release, Ctrl-C or a closed Terminal window
  if (stopping) return;
  stopping = true;
  push?.stop(); renewal?.stop(); clearInterval(upkeep);
  console.log(`${signal}: shutting down`);
  server.close(() => process.exit(0));   // requests in progress finish first
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 8000).unref();   // at the latest after 8 s
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => stop(signal));
process.on('uncaughtException', e => console.error('uncaughtException:', e?.stack || e));   // logged, never fatal
process.on('unhandledRejection', e => console.error('unhandledRejection:', e?.stack || e));
