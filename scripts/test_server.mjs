// The suite for scripts/serve.mjs and scripts/earthdata.mjs. Every server check is a real request to a server this
// suite starts itself on a free port, from a throwaway copy in a temp folder. It writes nothing into the project or the home folder.
// RULE: never loosen a check here to make it pass without a written farming reason beside the check itself.
// A failure means a farmer or the owner would get a wrong answer or an unsafe server: fix the server, not the test.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findLogin, parseNetrc, netrcWords, LOGIN_PLACES } from './earthdata.mjs';

// ---- the counting
let passed = 0, failed = 0;
const show = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 160 ? s.slice(0, 160) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${show(got)}, wanted ${show(want)}`);
async function group(name, run) {   // a check that throws fails its group, never the whole run: the servers must still be stopped
  try { await run(); } catch (e) { check(`${name}: ran to its end`, false, e?.message || String(e)); }
}

// ---- the throwaway folders (all under the system temp folder, removed at the end)
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-test-server-')));
const SITE = path.join(TMP, 'site'), SITE2 = path.join(TMP, 'site2'), CACHE = path.join(TMP, 'cache');
const HOME_EMPTY = path.join(TMP, 'home-empty'), HOME_LOGIN = path.join(TMP, 'home-login');
const USER = 'user1-test-name', WORD = 'pw1-test-word';   // made-up test words, never a real login
const lines = (line, n) => Array.from({ length: n }, (_, i) => `${line} ${i + 1}`).join('\n') + '\n';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');   // one blank pixel
const put = (root, rel, content) => { const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; };
const FILES = {
  'index.html': '<!doctype html>\n<meta charset="utf-8">\n<title>Test page</title>\n<p>Türkiye</p>\n' + lines('<!-- test page for the server suite, line', 40),
  'data/sub/index.html': '<!doctype html>\n<title>Test page in a folder</title>\n',
  'js/app.js': lines('// test script for the server suite, line', 80),
  'js/tiny.js': '// a test script under 1 KB\n',
  'css/app.css': lines('/* test styles for the server suite, line', 40).replace(/(\d+)\n/g, '$1 */\n'),
  'data/regions.json': JSON.stringify({ test: true, lines: lines('test data line', 60) }),
  'data/spam/index.json': JSON.stringify({ test: true }),
  'design/tokens.json': JSON.stringify({ test: true }),
  'icons/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">' + lines('<!-- test icon, line', 40).replace(/(\d+)\n/g, '$1 -->\n') + '</svg>\n',
  'icons/dot.png': PNG, 'data/dot.png': PNG,
  'design.html': '<!doctype html>\n<title>Test design page</title>\n', 'manifest.json': '{"test":true}', 'robots.txt': 'test robots file\n',
  'data/kinds/a.ico': PNG, 'data/kinds/a.webp': PNG, 'data/kinds/a.jpg': PNG, 'data/kinds/a.jpeg': PNG, 'data/kinds/a.gif': PNG, 'data/kinds/a.woff2': PNG,
  'data/kinds/a.glb': PNG, 'data/kinds/a.xml': '<test/>\n', 'data/kinds/a.webmanifest': '{"test":true}', 'data/kinds/a.wasm': PNG,
  'Start Crophalo.command': '#!/bin/sh\n# test starter\n', 'Start Crophalo (Add NASA login).bat': 'rem test starter\n', 'Start Crophalo.bat': 'rem test starter\n',
  'MOVING.md': '# test page about moving the folder\n', 'README.md': '# test readme\n', 'stray.html': '<!doctype html>\n<title>A page the app never asks for</title>\n',
  'sub/index.html': '<!doctype html>\n<title>A folder the app never asks for</title>\n',
  'vendor/lib/lib.js': lines('// test library file for the server suite, line', 60),
  'data/about.md': '# Test words\n',
  'data/plain.txt': 'a test text file\n',
  '.hidden': 'hidden test file\n', 'js/.DS_Store': 'hidden test file\n',
  '.venv/pyvenv.cfg': 'hidden test file\n', '.cache/api/x.json': '{"test":true}', '.userdata/backup.json': '{"test":true}',
  '.secrets/earthdata.netrc': `machine urs.earthdata.nasa.gov login ${USER} password ${WORD}\n`,
  'runtime/last-port': '5400\n',
};
for (const [rel, content] of Object.entries(FILES)) put(SITE, rel, content);
put(TMP, 'outside.txt', 'OUTSIDE-THE-FOLDER\n');   // a file next to the site: no request may ever reach it
put(SITE2, 'index.html', FILES['index.html']);
put(HOME_LOGIN, '.netrc', `machine urs.earthdata.nasa.gov login ${USER} password ${WORD}\n`);
fs.mkdirSync(HOME_EMPTY);
const PYTHON = put(TMP, 'stand-in/python', '');   // only has to exist: nothing runs it in this suite

// The server finds its root from its own file, so each site gets its own copy of the two scripts.
function SERVE_LIVE() { const line = fs.readFileSync(path.join(HERE, 'serve.mjs'), 'utf8').split('\n').find(l => l.startsWith('const LIVE = {')); return line.slice(0, line.indexOf('};') + 2); }   // the table as written in the server: the suite swaps it for test rows in its own copy
const SOURCE = fs.readFileSync(path.join(HERE, 'serve.mjs'), 'utf8'), LIVE_LINE = SERVE_LIVE();
const TEST_ROWS = `const LIVE = {
  probe: { name: 'Test row: a point lookup', ttl: 3600e3, point: true },
  shared: { name: 'Test row: shared data', ttl: 7200e3 },
  boom: { name: 'Test row: its check throws', ttl: 3600e3, args: () => { throw new Error('test fault'); } },
  late: { name: 'Test row: faults after the answer', ttl: 3600e3, args: () => { setTimeout(() => { throw new Error('late test fault'); }, 0); Promise.reject(new Error('lost test fault')); return { reason: 'late faults sent' }; } },
${Array.from({ length: 8 }, (_, i) => `  fill${i}: { name: 'Test row: filler ${i}, here so the sources answer is over 1 KB', ttl: 3600e3 },`).join('\n')}
};`;
put(SITE, 'scripts/serve.mjs', SOURCE);
put(SITE2, 'scripts/serve.mjs', SOURCE.replace(LIVE_LINE, TEST_ROWS));   // the server as written, plus test rows in its empty table
for (const root of [SITE, SITE2]) fs.copyFileSync(path.join(HERE, 'earthdata.mjs'), path.join(root, 'scripts', 'earthdata.mjs'));

// ---- servers and requests
const children = [];
const wait = ms => new Promise(done => setTimeout(done, ms));
const within = (promise, ms) => Promise.race([promise, wait(ms).then(() => null)]);
function start(root, env = {}, args = []) {
  const child = spawn(process.execPath, [path.join(root, 'scripts', 'serve.mjs'), ...args], {
    env: { PATH: process.env.PATH, HOME: HOME_EMPTY, FW_CACHE: CACHE, FW_PYTHON: path.join(TMP, 'no-python'), PORT: '0', ...env },   // a clean environment: nothing of the owner's reaches a test server
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const s = { child, out: '', err: '', port: 0 };
  children.push(child);
  s.exit = new Promise(done => child.on('exit', (code, signal) => done({ code, signal })));
  child.stderr.on('data', d => { s.err += d; });
  s.up = new Promise((done, fail) => {
    child.stdout.on('data', d => { s.out += d; const m = /Crophalo on http:\/\/\S+:(\d+)/.exec(s.out); if (m && !s.port) { s.port = +m[1]; done(s); } });
    s.exit.then(() => fail(new Error('a test server stopped before it started: ' + s.err.trim())));
    setTimeout(() => fail(new Error('a test server did not start in 10 s')), 10000).unref();
  });
  s.up.catch(() => {});
  return s;
}
function ask(port, pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((done, fail) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers: { connection: 'close', ...headers } }, res => {   // one connection per request, so a stopped server never leaves a dead one behind
      const parts = [];
      res.on('data', d => parts.push(d));
      res.on('end', () => { const bytes = Buffer.concat(parts); done({ status: res.statusCode, headers: res.headers, bytes, text: bytes.toString('utf8') }); });
    });
    req.on('error', fail);
    req.setTimeout(10000, () => req.destroy(new Error(`no answer in 10 s for ${method} ${pathname}`)));
    req.end(body);
  });
}
const askJson = async (port, pathname, options) => { const r = await ask(port, pathname, options); try { r.json = JSON.parse(r.text); } catch { r.json = undefined; } return r; };
const SECURE = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN',
  'permissions-policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
  'content-security-policy': "frame-ancestors 'self'; object-src 'none'; base-uri 'self'", vary: 'accept-encoding',
};
const secure = (name, r) => { const missing = Object.keys(SECURE).filter(k => r.headers[k] !== SECURE[k]); check(`${name} carries every security header`, !missing.length, 'wrong or missing: ' + missing.join(', ')); };
const OTHER_SITE = 'Requests from other websites are not allowed';
const refused = (name, r) => { same(`${name}: 403`, r.status, 403); same(`${name}: the exact reason`, r.text, JSON.stringify({ ok: false, reason: OTHER_SITE })); };

function stopAll() { for (const child of children) if (child.exitCode === null && child.signalCode === null) { try { process.kill(child.pid, 'SIGKILL'); } catch { /* already gone */ } } }
process.on('exit', stopAll);   // only this suite's own servers, by PID, even when a check throws
const watchdog = setTimeout(() => { console.log('FAIL  the suite did not finish in 120 s'); stopAll(); process.exit(1); }, 120000);

// ---- the checks
async function filesOfTheApp(A) {
  const p = A.port, get = (pathname, headers) => ask(p, pathname, { headers });
  const index = await get('/');
  same('/ answers 200', index.status, 200);
  same('/ gives index.html, plain when no compression is asked for', index.text, FILES['index.html']);
  check('/ keeps "Türkiye" readable (utf-8)', index.text.includes('Türkiye') && index.headers['content-type'] === 'text/html; charset=utf-8');
  secure('a file answer', index);
  same('a folder path gives that folder\'s index.html', (await get('/data/sub/')).text, FILES['data/sub/index.html']);
  same('a folder path without its slash is not a file: 404', (await get('/data/sub')).status, 404);
  same('the design page, the install file and the robots file are served', await Promise.all(['/design.html', '/manifest.json', '/robots.txt'].map(async u => (await get(u)).status)), [200, 200, 200]);
  same('a missing /favicon.ico is a plain 404', (await get('/favicon.ico')).status, 404);
  // The page never asks for these: the server's own code, its tests, the starters and the folder's own pages stay on this computer, never on the public site.
  const NOT_APP = ['/scripts/serve.mjs', '/scripts/earthdata.mjs', '/scripts/', '/scripts', '/Start%20Crophalo.command', '/Start%20Crophalo%20(Add%20NASA%20login).bat', '/Start%20Crophalo.bat',
    '/MOVING.md', '/README.md', '/stray.html', '/sub/', '/SCRIPTS/serve.mjs', '/Scripts/earthdata.mjs', '/js/../scripts/serve.mjs', '/js/..%2fscripts%2fserve.mjs'];
  for (const pathname of NOT_APP) { const r = await get(pathname); same(`${pathname}: a file the page never asks for is refused: 403, empty`, [r.status, r.bytes.length], [403, 0]); }
  secure('a refused file', await get('/MOVING.md'));
  same('a query does not change which file is sent', (await get('/index.html?x=1')).text, FILES['index.html']);

  const missing = await get('/js/nothing.js');
  same('a missing file: 404', missing.status, 404); same('a missing file: "not found"', missing.text, 'not found'); secure('a 404', missing);

  const nul = await get('/%00');
  same('/%00 answers 400', nul.status, 400); same('/%00 says "bad request"', nul.text, 'bad request'); secure('a 400', nul);
  same('a NUL byte inside a longer path answers 400', (await get('/js/app.js%00.png')).status, 400);
  same('the server still answers after /%00', (await get('/')).status, 200);
  const undecodable = await get('/%E0%A4%A');
  same('a path that cannot be decoded answers 400', undecodable.status, 400); same('...and says "bad request"', undecodable.text, 'bad request');
  same('the server still answers after an undecodable path', (await get('/')).status, 200);
  const garbled = await ask(p, '/', { method: 'NOTAMETHOD' });   // Node itself refuses this one before the server's own code sees it
  same('a request Node cannot read gets 400 "bad request"', [garbled.status, garbled.text], [400, 'bad request']); secure('a 400 for a request Node cannot read', garbled);
  const huge = await ask(p, '/', { headers: { 'x-test-filler': 'x'.repeat(20000) } });
  same('a request with headers too big to read gets 431', huge.status, 431); secure('a 431', huge);
  same('the server still answers after requests it could not read', (await get('/')).status, 200);

  for (const method of ['POST', 'PUT', 'DELETE']) {
    const r = await ask(p, '/index.html', { method, headers: { 'content-type': 'application/json' }, body: '' });
    same(`${method} to a file: 405`, r.status, 405); same(`${method} to a file: allow GET, HEAD`, r.headers.allow, 'GET, HEAD');
    same(`${method} to a file: empty body`, r.bytes.length, 0);
    if (method === 'POST') secure('a 405', r);
  }
  const head = await ask(p, '/', { method: 'HEAD' });
  same('HEAD of a file: 200', head.status, 200); same('HEAD of a file: no body', head.bytes.length, 0);
  same('HEAD of a file: the length a GET would send', head.headers['content-length'], String(Buffer.byteLength(FILES['index.html'])));

  const hidden = ['/.hidden', '/js/.DS_Store', '/.venv/pyvenv.cfg', '/.cache/api/x.json', '/.secrets/earthdata.netrc', '/.userdata/backup.json',
    '/runtime/last-port', '/runtime', '/RUNTIME/last-port', '/.git/config', '/%2esecrets/earthdata.netrc', '/js/%2eDS_Store'];
  for (const pathname of hidden) {
    const r = await get(pathname);
    same(`${pathname}: 403`, r.status, 403); same(`${pathname}: empty body`, r.bytes.length, 0);
  }
  secure('a 403', await get('/.secrets/earthdata.netrc'));

  const climbs = ['/../outside.txt', '/../../etc/passwd', '/..%2foutside.txt', '/..%2Foutside.txt', '/%2e%2e/outside.txt', '/%2e%2e%2foutside.txt',
    '/js/..%2f..%2foutside.txt', '/..%2fsite2/index.html', '/..%2f..%2f..%2f..%2f..%2f..%2f..%2f..%2fetc%2fpasswd', '/sub/..%5c..%5c..%5coutside.txt'];
  for (const pathname of climbs) {
    const r = await get(pathname);
    check(`${pathname} never serves a file from outside the folder`, [403, 404].includes(r.status) && !r.text.includes('OUTSIDE') && !r.text.includes('root:') && r.bytes.length <= 9, `status ${r.status}, ${r.bytes.length} bytes`);
  }
  same('an encoded climb out of the folder: 403', (await get('/..%2foutside.txt')).status, 403);

  const st = fs.statSync(path.join(SITE, 'index.html')), etag = index.headers.etag;
  same('the ETag is weak, from size and modified time in base 36', etag, `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`);
  const again = await get('/', { 'if-none-match': etag });
  same('If-None-Match with the ETag: 304', again.status, 304); same('a 304 has no body', again.bytes.length, 0);
  same('a 304 repeats the ETag', again.headers.etag, etag); same('a 304 keeps cache-control', again.headers['cache-control'], 'no-cache'); secure('a 304', again);
  same('If-None-Match with a list that holds the ETag: 304', (await get('/', { 'if-none-match': `"other", ${etag}` })).status, 304);
  same('If-None-Match with another tag: 200', (await get('/', { 'if-none-match': 'W/"1-1"' })).status, 200);

  const TIERS = { '/index.html': 'no-cache', '/js/app.js': 'no-cache', '/css/app.css': 'no-cache', '/data/regions.json': 'no-cache', '/data/about.md': 'no-cache', '/data/plain.txt': 'no-cache',
    '/icons/mark.svg': 'public, max-age=86400', '/icons/dot.png': 'public, max-age=86400', '/data/dot.png': 'public, max-age=86400', '/vendor/lib/lib.js': 'public, max-age=86400',
    '/design/tokens.json': 'public, max-age=86400', '/data/spam/index.json': 'public, max-age=86400' };
  for (const [pathname, tier] of Object.entries(TIERS)) same(`${pathname} is sent with cache-control ${tier}`, (await get(pathname)).headers['cache-control'], tier);
  const KINDS = { '/index.html': 'text/html; charset=utf-8', '/js/app.js': 'text/javascript', '/css/app.css': 'text/css', '/data/regions.json': 'application/json',
    '/icons/mark.svg': 'image/svg+xml', '/icons/dot.png': 'image/png', '/data/about.md': 'text/markdown', '/data/plain.txt': 'text/plain; charset=utf-8',
    '/data/kinds/a.ico': 'image/x-icon', '/data/kinds/a.webp': 'image/webp', '/data/kinds/a.jpg': 'image/jpeg', '/data/kinds/a.jpeg': 'image/jpeg', '/data/kinds/a.gif': 'image/gif',
    '/data/kinds/a.woff2': 'font/woff2', '/data/kinds/a.glb': 'model/gltf-binary', '/data/kinds/a.xml': 'application/xml', '/data/kinds/a.webmanifest': 'application/manifest+json', '/data/kinds/a.wasm': 'application/wasm' };
  for (const [pathname, kind] of Object.entries(KINDS)) same(`${pathname} is sent as ${kind}`, (await get(pathname)).headers['content-type'], kind);
  check('a picture arrives byte for byte', (await get('/icons/dot.png')).bytes.equals(PNG));

  const app = FILES['js/app.js'], js = accepts => get('/js/app.js', accepts == null ? {} : { 'accept-encoding': accepts });
  const br = await js('br');
  same('br when asked: content-encoding br', br.headers['content-encoding'], 'br');
  same('br when asked: the file comes back whole', zlib.brotliDecompressSync(br.bytes).toString(), app);
  same('a compressed answer states its own length', br.headers['content-length'], String(br.bytes.length));
  check('a compressed answer is smaller than the file', br.bytes.length < Buffer.byteLength(app));
  same('a compressed answer keeps its ETag and cache-control', [typeof br.headers.etag, br.headers['cache-control']], ['string', 'no-cache']);
  const gz = await js('gzip');
  same('gzip when only gzip: content-encoding gzip', gz.headers['content-encoding'], 'gzip');
  same('gzip when only gzip: the file comes back whole', zlib.gunzipSync(gz.bytes).toString(), app);
  const ACCEPTS = { 'gzip, deflate, br': 'br', 'br;q=0, gzip;q=0': undefined, 'br;q=0, gzip': 'gzip', 'br;q=0': undefined, '*': 'br', '*;q=0': undefined, 'br;q=0, *': 'gzip',
    'identity': undefined, 'deflate': undefined, 'gzip;q=1, br;q=0.5': 'gzip', 'gzip;q=0.5, br;q=0.5': 'br', 'BR': 'br', 'gzip ; q=0 , br ; q=0.8': 'br', 'br;q=abc': undefined, '': undefined };
  for (const [asked, want] of Object.entries(ACCEPTS)) same(`Accept-Encoding "${asked}" is answered ${want || 'plain'}`, (await js(asked)).headers['content-encoding'], want);
  const plain = await js(null);
  same('no Accept-Encoding: no content-encoding', plain.headers['content-encoding'], undefined); same('no Accept-Encoding: the file plain', plain.text, app);
  same('"br;q=0, gzip;q=0": the file plain', (await js('br;q=0, gzip;q=0')).text, app);
  same('a file under 1 KB is not compressed', (await get('/js/tiny.js', { 'accept-encoding': 'br, gzip' })).headers['content-encoding'], undefined);
  same('a picture is not compressed', (await get('/icons/dot.png', { 'accept-encoding': 'br, gzip' })).headers['content-encoding'], undefined);
  const headBr = await ask(p, '/js/app.js', { method: 'HEAD', headers: { 'accept-encoding': 'br' } });
  same('HEAD with br: the headers of the compressed answer, no body', [headBr.headers['content-encoding'], headBr.headers['content-length'], headBr.bytes.length], ['br', String(br.bytes.length), 0]);
  const crowd = await Promise.all(Array.from({ length: 25 }, () => js('br')));
  check('25 visitors at once get the same compressed bytes', crowd.every(r => r.status === 200 && r.bytes.equals(br.bytes)));
  const newer = app + '// a new release\n';
  fs.writeFileSync(path.join(SITE, 'js', 'app.js'), newer);
  const after = await js('br');
  check('a changed file gets a new ETag', after.headers.etag !== br.headers.etag, after.headers.etag);
  same('a changed file is never answered from the old compressed copy', zlib.brotliDecompressSync(after.bytes).toString(), newer);
  same('the old ETag no longer answers 304', (await get('/js/app.js', { 'if-none-match': br.headers.etag })).status, 200);

  const kept = await get('/', { connection: 'keep-alive' });
  same('a kept connection is told 65 s (longer than a host\'s proxy keeps one)', kept.headers['keep-alive'], 'timeout=65');
  check('written in serve.mjs: headers 70 s, a whole request 60 s, at most 400 compressed copies', /headersTimeout = 70e3/.test(SOURCE) && /requestTimeout = 60e3/.test(SOURCE) && /ZIPPED_MAX = 400/.test(SOURCE));
}

async function statusRoutes(A) {
  const p = A.port;
  const health = await askJson(p, '/api/health');
  same('/api/health: 200', health.status, 200); secure('an API answer', health);
  same('/api/health: JSON, never stored', [health.headers['content-type'], health.headers['cache-control']], ['application/json', 'no-store']);
  same('health fields, in the recorded order', Object.keys(health.json), ['ok', 'python', 'root', 'cache', 'netrc', 'login', 'userdata', 'uptime_s', 'busy', 'queued', 'live']);
  const h = health.json;
  same('health: ok, no Python here, nothing running or waiting', [h.ok, h.python, h.busy, h.queued], [true, false, 0, 0]);
  same('health: where the cache is (this computer only)', h.cache, path.join(CACHE, 'api'));
  same('health: which Crophalo folder answers (this computer only), so a start never takes another folder\'s server for its own', h.root, SITE);
  same('health: a login was found, in the folder', [h.netrc, h.login], [true, 'folder']);
  same('health: the saved-fields copy is off until its route exists', h.userdata, false);
  check('health: uptime in whole seconds', Number.isInteger(h.uptime_s) && h.uptime_s >= 0, show(h.uptime_s));
  const ROWS = [['smaproot', 'NASA SMAP root-zone soil moisture', 6], ['dem', 'Land heights (the finest free height map)', 720], ['imergrain', 'NASA GPM IMERG satellite rain, last 30 days', 6], ['gracecell', 'NASA GRACE-FO regional water storage', 168],
    ['ecopass', 'NASA ECOSTRESS ground temperature passes', 6], ['hlsndvi', 'NASA HLS greenness (Landsat and Sentinel-2)', 24], ['cropsnear', 'Crops grown nearby (AAFC and USDA crop maps)', 720],
    ['prices', 'World crop prices (World Bank Pink Sheet)', 24], ['faostat', 'National crop yields and farm-gate prices (FAOSTAT)', 24],
    ['ndvihist', 'NASA MODIS greenness since 2001, each season at its greenest', 720], ['firms', 'NASA FIRMS fires and hot spots, last 24 hours', 3]];   // id, name, hours a whole answer is kept
  same('health: the eleven lookups the server has, each with how long a whole answer is kept, never run yet', h.live, Object.fromEntries(ROWS.map(([id, , hours]) => [id, { last_ok: null, error: null, ttl_hours: hours }])));
  check('health never holds the login itself', !health.text.includes(USER) && !health.text.includes(WORD));
  const named = await askJson(p, '/api/health', { headers: { host: 'uptime-checker.example', origin: 'https://uptime-checker.example' } });
  same('health answers for any Host name', [named.status, named.json?.ok], [200, true]);
  const head = await ask(p, '/api/health', { method: 'HEAD', headers: { host: 'uptime-checker.example' } });
  same('health answers HEAD: 200, no body', [head.status, head.bytes.length, head.headers['content-type']], [200, 0, 'application/json']);

  const ready = await askJson(p, '/api/ready', { headers: { host: 'uptime-checker.example' } });
  same('ready without Python: 503, for any Host name', ready.status, 503);
  same('ready without Python: the plain reason', [ready.json?.ok, ready.json?.reason], [false, 'The Python environment for the live lookups is missing']);
  same('ready is the health answer plus the reason', Object.keys(ready.json || {}), [...Object.keys(h), 'reason']);
  same('ready answers HEAD', (await ask(p, '/api/ready', { method: 'HEAD', headers: { host: 'uptime-checker.example' } })).status, 503);
  same('POST to health is not the open door: 405', (await ask(p, '/api/health', { method: 'POST' })).status, 405);
  same('POST to health from another name: refused', (await ask(p, '/api/health', { method: 'POST', headers: { host: 'evil.example' } })).status, 403);

  const sources = await askJson(p, '/api/sources');
  same('/api/sources: 200, a list: one row per lookup, in order, nothing run, nothing kept', [sources.status, sources.json.map(r => [r.id, r.name, r.last_ok_time, r.cache_items, r.ttl_hours])], [200, ROWS.map(([id, name, hours]) => [id, name, null, 0, hours])]);
  // The new lookups check what they are asked before any Python runs: a plain 400 with the reason.
  const asked = async q => { const r = await askJson(p, q); return [r.status, r.json?.reason]; };
  same('crop map with no country: 400, the country is asked for', await asked('/api/cropsnear?lat=43.13&lon=-80.75'), [400, 'The country of the field is needed to read the crop map (country=CA or US)']);
  same('crop map beyond 84 degrees: 400', await asked('/api/cropsnear?lat=85&lon=-80.75&country=CA'), [400, 'lat must be -84..84 and lon -180..180']);
  same('greenness with half a window: 400', await asked('/api/hlsndvi?lat=43.13&lon=-80.75&first=20261101'), [400, 'first and last must both be given as YYYYMMDD']);
  same('satellite rain with no place: 400', (await asked('/api/imergrain?lat=&lon=-80.75'))[0], 400);
  same('water storage with no place: 400', (await asked('/api/gracecell?lat=43.13'))[0], 400);
  same('/api/sources: never stored', sources.headers['cache-control'], 'no-store');
  const wrong = await askJson(p, '/api/sources', { method: 'POST' });
  same('POST to sources: 405 as JSON with allow', [wrong.status, wrong.headers.allow, wrong.json], [405, 'GET', { ok: false, reason: 'Use GET' }]);

  const evil = await ask(p, '/api/sources', { headers: { origin: 'https://evil.example' } });
  refused('another website\'s Origin', evil); secure('a 403 from the API', evil);
  same('...as JSON, never stored', [evil.headers['content-type'], evil.headers['cache-control']], ['application/json', 'no-store']);
  refused('an unknown Host', await ask(p, '/api/sources', { headers: { host: 'evil.example' } }));
  refused('an unknown Host that starts like ours', await ask(p, '/api/sources', { headers: { host: 'localhost.evil.example' } }));
  refused('Origin "null"', await ask(p, '/api/sources', { headers: { origin: 'null' } }));
  refused('an https page on this computer\'s name', await ask(p, '/api/sources', { headers: { origin: 'https://localhost.evil.example' } }));
  refused('an unknown endpoint asked by another website', await ask(p, '/api/nothing', { headers: { origin: 'https://evil.example' } }));
  const OK = [{ origin: 'http://localhost:3000' }, { origin: 'http://127.0.0.1' }, { origin: `http://127.0.0.1:${p}` }, { host: 'LOCALHOST:99' }, { host: '[::1]:5400' }, { host: '127.0.0.1' },
    { host: `localhost:${p}`, origin: `http://localhost:${p}` }, { host: '[::1]:5400', origin: 'http://[::1]:5400' }];
  for (const headers of OK) same(`sources answers for ${show(headers)}`, (await ask(p, '/api/sources', { headers })).status, 200);

  const unknown = await ask(p, '/api/nothing');
  same('an unknown endpoint: 404', unknown.status, 404);
  same('an unknown endpoint: { ok: false, reason } as JSON', [unknown.headers['content-type'], unknown.text], ['application/json', '{"ok":false,"reason":"Unknown endpoint"}']);
  secure('a 404 from the API', unknown);
  for (const [method, pathname] of [['POST', '/api/nothing'], ['GET', '/api/toString'], ['GET', '/api/__proto__'], ['GET', '/api/'], ['GET', '/api/health/x']]) {
    same(`${method} ${pathname}: 404 Unknown endpoint`, (await askJson(p, pathname, { method })).json, { ok: false, reason: 'Unknown endpoint' });
  }
  same('a small API answer is not compressed', unknown.headers['content-encoding'], undefined);
}

async function publicServer(A, B, D) {
  check('a public server says so when it starts', /^Crophalo on http:\/\/0\.0\.0\.0:\d+ \(public\)$/m.test(B.out), show(B.out));
  for (const pathname of ['/api/health', '/api/ready']) {
    const r = await askJson(B.port, pathname);
    same(`public ${pathname}: no root or cache folder, no login place`, Object.keys(r.json || {}).filter(k => k !== 'reason'), ['ok', 'python', 'netrc', 'userdata', 'uptime_s', 'busy', 'queued', 'live']);
    check(`public ${pathname}: nothing about its folders or the login in the whole answer`, ![TMP, 'site', '.cache', 'folder', '.secrets', USER, WORD].some(word => r.text.includes(word)), r.text);
    same(`public ${pathname}: still says a login exists, and no saved-fields copy`, [r.json?.netrc, r.json?.userdata], [true, false]);
  }
  same('a public server with no list answers any Host', (await ask(B.port, '/api/sources', { headers: { host: 'any.example' } })).status, 200);
  same('...and that site\'s own pages', (await ask(B.port, '/api/sources', { headers: { host: 'any.example', origin: 'https://any.example' } })).status, 200);
  refused('...but not another website\'s', await ask(B.port, '/api/sources', { headers: { host: 'any.example', origin: 'https://evil.example' } }));
  same('a public server serves the app the same way', (await ask(B.port, '/')).status, 200);
  same('a public server keeps its hidden folders shut', (await ask(B.port, '/.secrets/earthdata.netrc')).status, 403);
  same('a public server keeps its own code shut', (await ask(B.port, '/scripts/serve.mjs')).status, 403);
  // On the public site the browser is told to come back over https only; on this computer (plain http) the line would mean nothing.
  const HSTS = 'max-age=31536000';
  same('a public server asks for https from now on (strict-transport-security), on files, the API and refusals', [(await ask(B.port, '/')).headers['strict-transport-security'], (await ask(B.port, '/api/health')).headers['strict-transport-security'], (await ask(B.port, '/MOVING.md')).headers['strict-transport-security']], [HSTS, HSTS, HSTS]);
  same('a server on this computer does not', (await ask(A.port, '/')).headers['strict-transport-security'], undefined);
  // A fault on the public site: the visitor reads one plain sentence; what went wrong stays in the server's log for the owner.
  const boom = await askJson(D.port, '/api/boom', { headers: { host: 'farm.example' } });
  same('a public server answers a fault with one plain sentence', [boom.status, boom.json], [500, { ok: false, reason: 'Something went wrong on the server. Please try again in a moment.' }]);
  check('...and the detail is in its log, not in the answer', D.err.includes('test fault') && !boom.text.includes('test fault'), show(D.err));
  same('a public server without the Python setup says the same plain sentence', (await askJson(D.port, '/api/probe?lat=42.03&lon=-93.62', { headers: { host: 'farm.example' } })).json, { ok: false, reason: 'Something went wrong on the server. Please try again in a moment.' });

  for (const host of ['farm.example', 'other.example:443', 'crophalo.example', 'FARM.example', 'localhost']) same(`a public server with a list answers ${host}`, (await ask(D.port, '/api/sources', { headers: { host } })).status, 200);
  refused('a public server with a list turns away a name not on it', await ask(D.port, '/api/sources', { headers: { host: 'evil.example' } }));
  const h = await askJson(D.port, '/api/health', { headers: { host: 'evil.example' } });
  same('...yet its health still answers any name, and says no login was found', [h.status, h.json?.netrc, 'login' in (h.json || {})], [200, false, false]);
}

// The one answer the two starters ask before they offer to type a login: "yes <where>" or "no", never a value.
function theLoginAnswer() {
  const ask = (root, env = {}) => spawnSync(process.execPath, [path.join(root, 'scripts', 'earthdata.mjs')], { cwd: TMP, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: HOME_EMPTY, ...env } });
  const all = [];
  const said = (root, env) => { const r = ask(root, env); all.push(r.stdout + r.stderr); return [r.status, r.stdout]; };
  same('login answer: a login kept in the folder', said(SITE), [0, 'yes folder\n']);
  same('login answer: none anywhere', said(SITE2), [0, 'no\n']);
  same('login answer: in the server settings', said(SITE2, { EARTHDATA_USERNAME: USER, EARTHDATA_PASSWORD: WORD }), [0, 'yes env\n']);
  same('login answer: in the home folder', said(SITE2, { HOME: HOME_LOGIN }), [0, 'yes home\n']);
  const commented = path.join(TMP, 'home-commented');
  put(commented, '.netrc', '# Set up urs.earthdata.nasa.gov later\nmachine urs.earthdata.nasa.gov login user1\n');
  same('login answer: a comment naming NASA, or an entry with no password, is no login', said(SITE2, { HOME: commented }), [0, 'no\n']);
  check('login answer: it never prints the username or the password', !all.some(t => t.includes(USER) || t.includes(WORD) || t.includes('user1')), all.join('|'));
}

async function liveFrontDoor(C, A) {
  const p = C.port;
  check('serve.mjs has the one LIVE line this suite fills with test rows', SOURCE.split(LIVE_LINE).length === 2);
  const h = (await askJson(p, '/api/health')).json || {};
  same('health lists each row of the LIVE table', [Object.keys(h.live || {}).slice(0, 4), h.live?.probe, h.live?.shared?.ttl_hours], [['probe', 'shared', 'boom', 'late'], { last_ok: null, error: null, ttl_hours: 1 }, 2]);
  same('health finds a login kept in the home folder', [h.netrc, h.login], [true, 'home']);
  const a = (await askJson(A.port, '/api/health')).json || {};
  same('two folders sharing one cache: the same cache, yet each server names its own folder', [a.cache === h.cache, a.root, h.root], [true, SITE, SITE2]);

  const now = Date.now(), old = new Date(now - 2 * 3600e3);
  const fresh = put(CACHE, 'api/probe_1.0000_2.0000.json', '{"test":true}');
  fs.utimesSync(put(CACHE, 'api/probe_3.0000_4.0000.json', '{"test":true}'), old, old);   // past its hour
  put(CACHE, 'api/final-probe_5.0000_6.0000.json', '{"test":true}'); put(CACHE, 'api/probe_7.tmp', ''); put(CACHE, 'api/shared.json', '{"test":true}'); put(CACHE, 'api/sharedmore_1.json', '{"test":true}');
  const sources = await askJson(p, '/api/sources', { headers: { 'accept-encoding': 'br' } });
  const list = sources.headers['content-encoding'] === 'br' ? JSON.parse(zlib.brotliDecompressSync(sources.bytes).toString()) : [];
  same('an API answer over 1 KB is sent br when asked', sources.headers['content-encoding'], 'br');
  same('sources: one row per LIVE row, in order', list.map(row => row.id).slice(0, 4), ['probe', 'shared', 'boom', 'late']);
  same('sources: the recorded fields, in order', Object.keys(list[0] || {}), ['id', 'name', 'last_ok_time', 'last_ms', 'last_error', 'cache_items', 'last_time', 'ttl_hours', 'in_flight']);
  same('sources: kept answers counted by file time (old, final- and .tmp files left out)', [list[0]?.cache_items, list[0]?.last_ok_time], [1, new Date(fs.statSync(fresh).mtimeMs).toISOString()]);
  same('sources: shared data is one file under its bare name', [list[1]?.cache_items, list[1]?.ttl_hours], [1, 2]);
  same('sources: nothing has run, so nothing is claimed', [list[2]?.last_ok_time, list[2]?.last_ms, list[2]?.last_error, list[2]?.last_time, list[2]?.in_flight, list[2]?.name], [null, null, null, null, 0, 'Test row: its check throws']);
  const gz = await ask(p, '/api/sources', { headers: { 'accept-encoding': 'gzip' } });
  same('...gzip when only gzip', [gz.headers['content-encoding'], JSON.parse(zlib.gunzipSync(gz.bytes).toString()).length], ['gzip', list.length]);
  const plain = await askJson(p, '/api/sources', { headers: { 'accept-encoding': 'br;q=0, gzip;q=0' } });
  same('...plain when both are refused', [plain.headers['content-encoding'], plain.json?.length, plain.bytes.length > 1024], [undefined, list.length, true]);

  const NEED = { ok: false, reason: 'lat and lon are required (decimal degrees)' };
  for (const query of ['', '?lat=&lon=', '?lat=42.03', '?lat=%20&lon=%20', '?lat=91&lon=0', '?lat=0&lon=181', '?lat=abc&lon=1', '?lat=0x10&lon=1', '?lat=Infinity&lon=1']) {
    const r = await askJson(p, '/api/probe' + query);
    same(`/api/probe${query}: 400, lat and lon required (blank is never 0)`, [r.status, r.json], [400, NEED]);
  }
  const noPython = await askJson(p, '/api/probe?lat=42.03&lon=-93.62');
  same('a lookup without the Python setup: 500 in plain words', [noPython.status, noPython.json], [500, { ok: false, reason: 'Python environment not found (.venv)' }]);
  refused('a lookup asked by another website', await ask(p, '/api/probe?lat=42.03&lon=-93.62', { headers: { origin: 'https://evil.example' } }));
  same('POST to a lookup: 405', (await ask(p, '/api/probe', { method: 'POST' })).status, 405);

  const boom = await askJson(p, '/api/boom');
  same('an error inside a route ends as 500 "Server error: …"', [boom.status, boom.json], [500, { ok: false, reason: 'Server error: test fault' }]);
  secure('a 500', boom);
  same('the server still answers after that error', (await ask(p, '/api/health')).status, 200);
  same('a route\'s own refusal is a 400 with its reason', (await askJson(p, '/api/late')).json, { ok: false, reason: 'late faults sent' });
  await wait(200);
  check('an error thrown after the answer is logged, not fatal', C.err.includes('uncaughtException') && C.err.includes('late test fault') && C.child.exitCode === null, show(C.err));
  check('a lost promise is logged, not fatal', C.err.includes('unhandledRejection') && C.err.includes('lost test fault') && C.child.exitCode === null);
  same('the server still answers after both', [(await ask(p, '/api/health')).status, (await ask(p, '/')).status], [200, 200]);
}

async function rateLimit(R, R0, R2, R3) {
  const TOO_MANY = '{"ok":false,"reason":"Too many requests. Wait a moment and try again."}';
  const probe = (server, forwarded) => ask(server.port, '/api/probe', { headers: forwarded ? { 'x-forwarded-for': forwarded } : {} });
  const first = []; for (let i = 0; i < 5; i++) first.push((await probe(R, '9.9.9.9, 1.1.1.1')).status);
  same('up to the limit every lookup is answered', first, [400, 400, 400, 400, 400]);
  const over = await probe(R, '9.9.9.9, 1.1.1.1');
  same('one over the limit: 429', over.status, 429); same('429: retry-after 30', over.headers['retry-after'], '30');
  same('429: the exact sentence, as JSON', [over.headers['content-type'], over.text], ['application/json', TOO_MANY]); secure('a 429', over);
  same('a made-up address at the start of x-forwarded-for does not help', (await probe(R, '8.8.8.8, 1.1.1.1')).status, 429);
  same('another visitor (another address at the END) is still answered', (await probe(R, '9.9.9.9, 2.2.2.2')).status, 400);
  same('without the header the connection\'s own address counts', (await probe(R, null)).status, 400);
  const free = []; for (const pathname of ['/api/health', '/api/ready', '/api/sources', '/api/nothing', '/']) for (let i = 0; i < 4; i++) free.push((await ask(R.port, pathname, { headers: { 'x-forwarded-for': '9.9.9.9, 1.1.1.1' } })).status);
  same('health, ready, sources, unknown paths and files never count against the limit', free, [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 404, 404, 404, 404, 200, 200, 200, 200]);
  same('ready with Python and a login in the server settings: 200, no reason', [(await askJson(R.port, '/api/ready')).json?.ok, (await askJson(R.port, '/api/ready')).json?.reason, (await askJson(R.port, '/api/health')).json?.login], [true, undefined, 'env']);
  same('a test row whose Python cannot start says so plainly (the runner itself is tested in test_smap_route.mjs and test_server_dem.mjs)', (await askJson(R.port, '/api/probe?lat=1&lon=2', { headers: { 'x-forwarded-for': '3.3.3.3' } })).json.reason.startsWith('Could not start Python'), true);

  const alone = []; for (const forwarded of ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4']) alone.push((await probe(R0, forwarded)).status);
  same('with no trusted proxy x-forwarded-for is ignored: the 4th of 3 is refused whatever it claims', alone, [400, 400, 400, 429]);
  const two = []; for (const forwarded of ['a, 7.7.7.7, 10.0.0.1', 'b, 7.7.7.7, 10.0.0.2', 'c, 7.7.7.7, 10.0.0.3', 'c, 6.6.6.6, 10.0.0.3']) two.push((await probe(R2, forwarded)).status);
  same('TRUST_PROXY_HOPS=2 reads the second entry from the end', two, [400, 400, 429, 400]);
  const hosted = []; for (const forwarded of ['a, 5.5.5.5', 'b, 5.5.5.5', 'c, 5.5.5.5', 'c, 5.5.5.6']) hosted.push((await probe(R3, forwarded)).status);
  same('a public server on Render trusts one proxy without being told', hosted, [400, 400, 429, 400]);
}

async function startAndStop(A) {
  const IN_USE = `Port ${A.port} is already in use. Close the other program that uses it, or start on another port (sh scripts/run.sh --port 8080, or PORT=8080).`;
  const second = start(SITE, { PORT: undefined }, [String(A.port)]), ended = await within(second.exit, 8000);
  same('a second server on a port in use exits with code 1', ended?.code, 1);
  same('...and prints the plain message (the port came from the argument)', second.err.trim(), IN_USE);
  const byEnv = await start(SITE, { PORT: '0', FW_CACHE: undefined }, [String(A.port)]).up;
  check('PORT wins over the argument', byEnv.port > 0 && byEnv.port !== A.port, String(byEnv.port));
  check('this computer\'s server says where it listens', /^Crophalo on http:\/\/127\.0\.0\.1:\d+$/m.test(byEnv.out), show(byEnv.out));
  same('with FW_CACHE unset the cache is the folder\'s own .cache', (await askJson(byEnv.port, '/api/health')).json?.cache, path.join(SITE, '.cache', 'api'));
  const servers = { SIGTERM: byEnv, SIGHUP: await start(SITE).up, SIGINT: await start(SITE).up };
  for (const [signal, server] of Object.entries(servers)) {
    process.kill(server.child.pid, signal);
    const end = await within(server.exit, 8000);
    check(`${signal} prints "${signal}: shutting down"`, server.out.includes(`${signal}: shutting down`), show(server.out));
    same(`${signal}: the process exits by itself`, end, { code: 0, signal: null });
  }
  same('the first server is still running after everything thrown at it', [A.child.exitCode, (await ask(A.port, '/api/health')).status], [null, 200]);
}

function theLogin() {
  const HOSTLINE = 'machine urs.earthdata.nasa.gov';
  same('netrc: one line', parseNetrc(`${HOSTLINE} login user1 password pw1`), { login: 'user1', password: 'pw1' });
  same('netrc: one word a line, tabs and blank lines', parseNetrc(`machine\turs.earthdata.nasa.gov\n\n  login user1\r\n\tpassword pw1\n`), { login: 'user1', password: 'pw1' });
  same('netrc: password before login', parseNetrc(`${HOSTLINE} password pw1 login user1`), { login: 'user1', password: 'pw1' });
  same('netrc: a quoted word keeps its spaces', parseNetrc(`${HOSTLINE} login "user 1" password "pw 1 # x"`), { login: 'user 1', password: 'pw 1 # x' });
  same('netrc: \\" and \\\\ inside quotes', parseNetrc(`${HOSTLINE} login user1 password "p\\"w\\\\1"`), { login: 'user1', password: 'p"w\\1' });
  same('netrc: the words, split as the note says', netrcWords('a "b c"\n# note "d\n\t"e\\"f" g#h'), ['a', 'b c', 'e"f', 'g#h']);
  same('netrc: # lines are skipped', parseNetrc(`# machine urs.earthdata.nasa.gov login no password no\n${HOSTLINE}\n  # login no\nlogin user1\npassword pw1`), { login: 'user1', password: 'pw1' });
  const several = `machine one.example login a password b\n${HOSTLINE} login user1 password pw1\nmachine two.example login c password d`;
  same('netrc: several machines, ours picked', parseNetrc(several), { login: 'user1', password: 'pw1' });
  same('netrc: several machines, another one picked by name', parseNetrc(several, 'two.example'), { login: 'c', password: 'd' });
  same('netrc: the next machine ends the entry', parseNetrc(`${HOSTLINE} login user1\nmachine two.example password d`), null);
  same('netrc: a default entry ends the entry', parseNetrc(`${HOSTLINE} login user1\ndefault login c password d`), null);
  same('netrc: a default entry alone is not ours', parseNetrc('default login c password d'), null);
  same('netrc: a default entry first, ours after', parseNetrc(`default login c password d\n${HOSTLINE} login user1 password pw1`), { login: 'user1', password: 'pw1' });
  same('netrc: a name that only starts like ours is not ours', parseNetrc('machine urs.earthdata.nasa.gov.example login c password d'), null);
  same('netrc: no password, no login', parseNetrc(`${HOSTLINE} login user1`), null);
  same('netrc: a password that reads "machine" is still a password', parseNetrc(`${HOSTLINE} login user1 password machine`), { login: 'user1', password: 'machine' });
  same('netrc: an account word is passed over', parseNetrc(`${HOSTLINE} login user1 account x password pw1`), { login: 'user1', password: 'pw1' });
  same('netrc: empty or missing text', [parseNetrc(''), parseNetrc(null), parseNetrc(undefined)], [null, null, null]);
  // A commented-out login is never used: what follows a # that starts a word is a comment to the end of its line, as for Python's own netrc reader.
  same('netrc: a login commented out after another service\'s line is never used',
    parseNetrc('machine other.example login user password pass # machine urs.earthdata.nasa.gov login commented password commented'), null);
  same('netrc: a comment after our whole entry leaves the entry as it is', parseNetrc(`${HOSTLINE} login user1 password pw1 # machine two.example`), { login: 'user1', password: 'pw1' });
  same('netrc: a comment in the middle hides the rest of its line only', parseNetrc(`${HOSTLINE} login user1 # password no\npassword pw1`), { login: 'user1', password: 'pw1' });
  same('netrc: a password commented out leaves no login', parseNetrc(`${HOSTLINE} login user1 # password pw1`), null);
  same('netrc: the words, a comment to the end of its line only', netrcWords('a b # c "d\ne #f\n#g\nh'), ['a', 'b', 'e', 'h']);
  same('netrc: a quoted # is part of the word, even at its start', parseNetrc(`${HOSTLINE} login user1 password "#pw1"`), { login: 'user1', password: '#pw1' });

  const entry = (user, word) => `machine urs.earthdata.nasa.gov login ${user} password ${word}\n`;
  const withFolder = path.join(TMP, 'login-folder'), bare = path.join(TMP, 'login-bare'), broken = path.join(TMP, 'login-broken'), home = path.join(TMP, 'login-home'), otherHome = path.join(TMP, 'login-home-other');
  const folderFile = put(withFolder, '.secrets/earthdata.netrc', entry('folder-user', 'folder-word'));
  fs.mkdirSync(bare); put(broken, '.secrets/earthdata.netrc', 'machine urs.earthdata.nasa.gov login only\n');
  put(home, '.netrc', entry('home-user', 'home-word')); put(otherHome, '.netrc', 'machine one.example login a password b\n');
  const env = { EARTHDATA_USERNAME: 'env-user', EARTHDATA_PASSWORD: 'env-word' };
  same('login: folder, settings and home all there → the folder wins', findLogin(withFolder, { env, home }).where, 'folder');
  same('login: settings and home → the settings win', findLogin(bare, { env, home }).where, 'env');
  same('login: home only → home', findLogin(bare, { env: {}, home }).where, 'home');
  same('login: nowhere → null', findLogin(bare, { env: {}, home: HOME_EMPTY }).where, null);
  same('login: a folder file without a whole entry is passed over', findLogin(broken, { env, home }).where, 'env');
  same('login: a username alone in the settings is not a login', findLogin(bare, { env: { EARTHDATA_USERNAME: 'env-user' }, home: HOME_EMPTY }).where, null);
  same('login: a home file without the NASA entry is not a login', findLogin(bare, { env: {}, home: otherHome }).where, null);
  const commentedFolder = path.join(TMP, 'login-commented'), commentedHome = path.join(TMP, 'login-home-commented');
  put(commentedFolder, '.secrets/earthdata.netrc', `machine one.example login a password b # ${entry('folder-user', 'folder-word')}`);
  put(commentedHome, '.netrc', `# Set up urs.earthdata.nasa.gov later\nmachine one.example login a password b # ${entry('home-user', 'home-word')}`);
  same('login: a folder login commented out never wins over the settings', findLogin(commentedFolder, { env, home }).where, 'env');
  same('login: a folder login commented out never wins over the home folder', findLogin(commentedFolder, { env: {}, home }).where, 'home');
  same('login: a home login commented out is not a login', findLogin(bare, { env: {}, home: commentedHome }).where, null);
  same('login: the plain words for each place', [findLogin(withFolder, { env, home }).words, findLogin(bare, { env, home }).words, findLogin(bare, { env: {}, home }).words, findLogin(bare, { env: {}, home: HOME_EMPTY }).words],
    ['inside the Crophalo folder (.secrets), so it moves with the folder', 'in the server settings (EARTHDATA_USERNAME and EARTHDATA_PASSWORD)', 'in your home folder (~/.netrc), so it stays on this computer', 'not set up']);
  same('login: the four places are the only words there are', Object.keys(LOGIN_PLACES), ['folder', 'env', 'home', 'none']);
  const found = findLogin(withFolder, { env, home });
  same('login: a folder login is handed to a lookup as its own environment', found.env, { NETRC: folderFile, EARTHDATA_USERNAME: 'folder-user', EARTHDATA_PASSWORD: 'folder-word' });
  same('login: the settings and the home folder need nothing handed over', [findLogin(bare, { env, home }).env, findLogin(bare, { env: {}, home }).env], [{}, {}]);
  const printed = [found, findLogin(bare, { env, home }), findLogin(bare, { env: {}, home })].map(f => JSON.stringify(f) + Object.keys(f).join() + Object.values(f).join()).join();
  check('login: an answer that is printed or sent shows no username and no password', !/folder-user|folder-word|env-user|env-word|home-user|home-word/.test(printed), printed);
  check('login: looking never puts the login into this process\'s own environment', !('NETRC' in process.env) && process.env.EARTHDATA_USERNAME !== 'folder-user' && process.env.EARTHDATA_PASSWORD !== 'folder-word');
}

// ---- the run
try {
  const A = start(SITE), B = start(SITE, { HOST: '0.0.0.0' });
  const C = start(SITE2, { HOME: HOME_LOGIN }), D = start(SITE2, { HOST: '0.0.0.0', ALLOWED_HOSTS: 'farm.example, other.example', RENDER_EXTERNAL_HOSTNAME: 'crophalo.example' });
  const R = start(SITE2, { RATE_PER_MIN: '5', TRUST_PROXY_HOPS: '1', FW_PYTHON: PYTHON, EARTHDATA_USERNAME: USER, EARTHDATA_PASSWORD: WORD });
  const R0 = start(SITE2, { RATE_PER_MIN: '3' }), R2 = start(SITE2, { RATE_PER_MIN: '2', TRUST_PROXY_HOPS: '2' }), R3 = start(SITE2, { RATE_PER_MIN: '2', HOST: '0.0.0.0', RENDER: 'true' });
  await group('starting the test servers', () => Promise.all([A, B, C, D, R, R0, R2, R3].map(s => s.up)));
  await group('files of the app', () => filesOfTheApp(A));
  await group('health, ready, sources and who may ask', () => statusRoutes(A));
  await group('a public server', () => publicServer(A, B, D));
  await group('the front door of the live lookups', () => liveFrontDoor(C, A));
  await group('the rate limit', () => rateLimit(R, R0, R2, R3));
  await group('starting and stopping', () => startAndStop(A));
  await group('the NASA login', async () => theLogin());
  await group('the login answer for the starters', async () => theLoginAnswer());
} finally {
  clearTimeout(watchdog);
  stopAll();
  fs.rmSync(TMP, { recursive: true, force: true });   // this suite's own temp folder, nothing else
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
