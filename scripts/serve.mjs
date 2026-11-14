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

// ---- settings (the environment is read once, here)
const ENV = process.env, H = 3600e3;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');   // the folder is the product: its root is the folder above scripts/
const portFrom = (...values) => { for (const v of values) if (/^\d{1,5}$/.test(String(v ?? '').trim()) && +v <= 65535) return +v; return 5173; };
const PORT = portFrom(ENV.PORT, process.argv[2]);
const HOST = ENV.HOST || '127.0.0.1';
const PUBLIC = !['127.0.0.1', 'localhost', '::1'].includes(HOST);   // any other address can be reached from outside this computer
const CACHE = path.resolve(ENV.FW_CACHE || path.join(ROOT, '.cache'));
const PY = path.resolve(ROOT, ENV.FW_PYTHON || path.join('.venv', 'bin', 'python'));
const RATE = Number(ENV.RATE_PER_MIN) || 180;
const HOPS = (ENV.TRUST_PROXY_HOPS ?? '') !== '' ? Math.max(0, parseInt(ENV.TRUST_PROXY_HOPS, 10) || 0) : PUBLIC && ENV.RENDER ? 1 : 0;
const ALLOWED_HOSTS = [ENV.RENDER_EXTERNAL_HOSTNAME, ...(ENV.ALLOWED_HOSTS || '').split(',')].map(h => (h || '').trim().toLowerCase()).filter(Boolean);
const USERDATA = false;   // the saved-fields copy has no route yet, so health must not promise it
process.env.FW_CACHE = CACHE;   // the Python lookups read it, so their caches land in the same folder

// ---- answers (every answer starts in open(), so none can miss the security headers)
const SECURE = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
  'content-security-policy': "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",   // only the safe parts: the app loads maps and data from several hosts
  vary: 'accept-encoding',
  ...(PUBLIC ? { 'strict-transport-security': 'max-age=31536000' } : {}),   // the public site is reached over https only; on this computer (plain http) the line would mean nothing
};
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
function originOK(req) {   // no Origin is a same-origin GET or a health checker
  const origin = req.headers.origin, host = hostOf(req);
  return !origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === 'https://' + host || origin === 'http://' + host;
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
const LIVE = { smaproot: { name: 'NASA SMAP root-zone soil moisture', ttl: 6 * H, point: true, snap: 0.01, timeout: 150e3, script: 'smaproot.py' }, dem: { name: 'Land heights (the finest free height map)', ttl: 30 * 24 * H, timeout: 120e3, args: boxArgs, script: 'dem.py' } };   // id → { name, ttl, point?, snap?, timeout?, args?, script }. Keep this on one line: test_server.mjs puts test rows into a copy of it.
const liveStats = {}, inFlight = new Map(), liveQueue = [];
let liveRunning = 0;
const statOf = id => (liveStats[id] ||= { last_ms: null, last_time: null, last_ok_time: null, last_error: null });   // times in ms; ISO only on the way out
const iso = ms => (ms ? new Date(ms).toISOString() : null);

function pointArgs(q) {   // decimal degrees; a blank is missing, never 0
  const read = v => (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(String(v ?? '').trim()) ? Number(v) : NaN);
  const lat = read(q.get('lat')), lon = read(q.get('lon'));
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat.toFixed(4), lon.toFixed(4)] : { reason: 'lat and lon are required (decimal degrees)' };   // 4 decimals is about 11 m
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

// The runner: one Python process per question, one run for one question however many ask, a few at once in all (LIVE_MAX; one on a small host),
// at most LIVE_WAIT_MAX waiting, each with its time limit, in its own process group, with a clean environment, its answer kept on disk for its row's time.
const LIVE_MAX = Math.max(1, Number(ENV.LIVE_MAX) || (os.totalmem() < 2 * 1024 ** 3 ? 1 : 2)), LIVE_WAIT_MAX = 24, LIVE_DIR = path.join(ROOT, 'scripts', 'live'), OUT_MAX = 8e6;
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
function childEnv(row) {   // a clean environment: the NASA login and the time limit, nothing else of the server's
  const keep = name => (ENV[name] ? { [name]: ENV[name] } : {});
  return { PATH: ENV.PATH, ...keep('HOME'), ...keep('USERPROFILE'), ...keep('SystemRoot'), ...keep('TEMP'), ...keep('TMP'), ...keep('TMPDIR'),
    ...keep('EARTHDATA_USERNAME'), ...keep('EARTHDATA_PASSWORD'), FW_CACHE: CACHE, FW_LIMIT_S: String((row.timeout || 120e3) / 1e3), PYTHONWARNINGS: 'ignore', PYTHONDONTWRITEBYTECODE: '1',
    ...(process.platform === 'win32' ? { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } : {}), ...findLogin(ROOT).env };
}
function stopTree(child, signal) { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) : process.kill(-child.pid, signal); } catch { /* already gone */ } }
function runScript(id, row, args) {   // always resolves with an answer object
  return new Promise(done => {
    const started = Date.now(), out = [], err = [], limitMs = row.timeout || 120e3;
    let size = 0, over = false, timedOut = false, hard = 0, child;
    const finish = answer => {
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
  if (!fs.existsSync(PY)) throw new Fail(500, 'Python environment not found (.venv)');
  if (row.snap) args = args.map(v => snap(v, row.snap));
  const spot = row.point && row.snap ? { lat: Number(args[0]), lon: Number(args[1]) } : null;   // the place really read: the answer says it
  const send = (answer, cached, at) => json(req, res, 200, { ...answer, ...(spot && answer.ok ? { spot } : {}), cached, fetched: new Date(at).toISOString() });
  const file = cacheFile(id, args), finalFile = cacheFile(id, args, true), now = Date.now(), hit = readKept(file, now) || readKept(finalFile, now);
  if (hit) return send(hit.answer, true, hit.stored);
  let job = inFlight.get(file);
  if (!job) {   // visitors asking the same thing share one run
    if (liveRunning >= LIVE_MAX && liveQueue.length >= LIVE_WAIT_MAX) return json(req, res, 200, { ok: false, reason: 'The data server is busy. Try again in a minute.' });
    job = { id, promise: (async () => {
      while (liveRunning >= LIVE_MAX) await new Promise(wake => liveQueue.push(wake));
      liveRunning++;
      try { return await runScript(id, row, args); } finally { liveRunning--; liveQueue.shift()?.(); }
    })().then(answer => { const keep = keepFor(answer, row); return { answer, at: keep ? writeKept(answer.ok ? file : finalFile, answer, keep) : Date.now() }; }) };
    inFlight.set(file, job);
    job.promise.finally(() => inFlight.delete(file));
  }
  const { answer, at } = await job.promise;
  return send(answer, false, at);
}

// ---- status
function health() {   // a host calls this every few seconds: memory and two small files only, never a folder scan
  const login = findLogin(ROOT).where, live = {};
  for (const [id, row] of Object.entries(LIVE)) live[id] = { last_ok: iso(statOf(id).last_ok_time), error: statOf(id).last_error, ttl_hours: row.ttl / H };
  return {
    ok: true, python: fs.existsSync(PY),
    ...(PUBLIC ? {} : { root: ROOT, cache: path.join(CACHE, 'api') }),   // a public server never says where its folders are; root tells two folders that share one cache apart
    netrc: !!login, ...(PUBLIC ? {} : { login }),
    userdata: USERDATA, uptime_s: Math.round(process.uptime()), busy: liveRunning, queued: liveQueue.length, live,
  };
}
function ready() {   // a missing NASA login only dims the satellite data, so it does not count
  const now = health();
  return now.python ? [200, now] : [503, { ...now, ok: false, reason: 'The Python environment for the live lookups is missing' }];
}
function cacheFiles() {   // name and file time only: the folder can hold thousands, so no file is opened
  const dir = path.join(CACHE, 'api'), out = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return out; }
  for (const name of names) if (name.endsWith('.json')) try { out.push([name, fs.statSync(path.join(dir, name)).mtimeMs]); } catch { /* removed meanwhile */ }
  return out;
}
function sources() {
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

// ---- routes: the one place an /api path is registered.
//      open = answers before the who-may-ask checks (a host's checker uses whatever name it likes); rate = counts against the visitor's limit.
const ROUTES = {
  '/api/health': { methods: ['GET', 'HEAD'], open: true, run: (req, res) => json(req, res, 200, health()) },
  '/api/ready': { methods: ['GET', 'HEAD'], open: true, run: (req, res) => json(req, res, ...ready()) },
  '/api/sources': { methods: ['GET'], run: (req, res) => json(req, res, 200, sources()) },
};
function routeFor(pathname) {
  const id = pathname.slice(5);
  if (Object.hasOwn(ROUTES, pathname)) return ROUTES[pathname];
  return Object.hasOwn(LIVE, id) ? { methods: ['GET'], rate: true, run: (req, res, url) => lookup(req, res, id, LIVE[id], url) } : null;   // own keys only: "toString" is not a lookup
}
async function api(req, res, url) {
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
const SERVED = /^(index\.html|design\.html|manifest\.json|robots\.txt|favicon\.ico|docs\/[a-z0-9-]+\.md|(js|css|data|design|icons|vendor)\/.+)$/;
const KEPT_A_DAY = /^(data\/spam|icons|design|vendor)\//;   // these change only with a release; code is asked about on every visit
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
  const full = path.join(ROOT, asked.endsWith('/') ? asked + 'index.html' : asked), rel = path.relative(ROOT, full).split(path.sep).join('/');
  const outside = rel.startsWith('..') || path.isAbsolute(rel), hidden = /(^|\/)\./.test(rel), packed = /^runtime(\/|$)/i.test(rel);   // "RUNTIME" too: this Mac's disk does not tell capitals apart
  if (outside || hidden || packed || !SERVED.test(rel)) return send(req, res, 403);
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
const push = await import('./push.mjs').then(m => m.createPush({ dir: CACHE, env: ENV, publicMode: PUBLIC, siteHosts: SITE_HOSTS })).catch(e => (e?.code === 'ERR_MODULE_NOT_FOUND' ? null : (console.error('push: not started:', e?.message || e), null)));
const drought = await import('./drought.mjs').then(m => m.createDrought({ dir: CACHE, env: ENV })).catch(e => (e?.code === 'ERR_MODULE_NOT_FOUND' ? null : (console.error('drought: not started:', e?.message || e), null)));

// ---- the request boundary: one bad request must never stop the server
async function handle(req, res) {
  let url;
  try { url = new URL(req.url.startsWith('/') ? 'http://localhost' + req.url : req.url); } catch { return text(req, res, 400, 'bad request'); }
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

// ---- start and stop
server.keepAliveTimeout = 65e3; server.headersTimeout = 70e3; server.requestTimeout = 60e3;   // longer than a host's proxy keeps a connection, so it never sends a request down a closed one
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE'
    ? `Port ${PORT} is already in use. Close the other program that uses it, or start on another port (sh scripts/run.sh --port 8080, or PORT=8080).`
    : `Crophalo could not start on ${HOST}, port ${PORT}: ${e.message}`);
  process.exit(1);
});
server.listen(PORT, HOST, () => { push?.start(); console.log(`Crophalo on http://${HOST.includes(':') ? `[${HOST}]` : HOST}:${server.address().port}${PUBLIC ? ' (public)' : ''}`); });

let stopping = false;
function stop(signal) {   // a new release, Ctrl-C or a closed Terminal window
  if (stopping) return;
  stopping = true;
  push?.stop();
  console.log(`${signal}: shutting down`);
  server.close(() => process.exit(0));   // requests in progress finish first
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 8000).unref();   // at the latest after 8 s
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => stop(signal));
process.on('uncaughtException', e => console.error('uncaughtException:', e?.stack || e));   // logged, never fatal
process.on('unhandledRejection', e => console.error('unhandledRejection:', e?.stack || e));
