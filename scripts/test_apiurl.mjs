// Crophalo's suite for js/api.js (the one way to write the data server's address) and scripts/apiurl-rewrite.mjs (the rewrite of every call to it). No network, no server.
// Part 1, the addresses: one address for both, the server on a name of its own, the refused settings, the wake on a first touch. Part 2, the rewrite on hand-made sources. Part 3, this folder's js/: nothing left to change, and each loader asks the server set up.
// RULE: never loosen a check here without a written reason beside it. A call that skips apiUrl() works on this computer and fails on the public site, where every
// satellite card would say "did not answer" for no reason a farmer can see. Run: node scripts/test_apiurl.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { apiUrl, cleanOrigin, API_BASE } from '../js/api.js';
import { rewriteSource, rewriteFolder, tokens } from './apiurl-rewrite.mjs';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 400 ? s.slice(0, 400) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } return !!ok; }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-test-apiurl-')));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* the system clears its temp folder */ } });
const SERVER = 'https://api.example.test';   // a made-up name: nothing is ever asked of it
// A copy of api.js beside a site-config.js that says `origin`, imported fresh (its own module instance, so its wake state is its own).
let copies = 0;
async function apiWith(originSource) {
  const dir = path.join(TMP, `api-${++copies}`, 'js'); fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'js', 'api.js'), path.join(dir, 'api.js'));
  fs.writeFileSync(path.join(dir, 'site-config.js'), originSource);
  return import(pathToFileURL(path.join(dir, 'api.js')).href);
}
const config = origin => `export const API_ORIGIN = ${JSON.stringify(origin)};\n`;

// ---- part 1: the addresses
same('this folder: the server is on the same address as the pages', API_BASE, '');
same('one address: every /api address stays as it is', ['/api/smaproot?lat=43.1300&lon=-80.7500', '/api/health', '/api', '/api?x=1', '/api/push/key'].map(p => apiUrl(p)), ['/api/smaproot?lat=43.1300&lon=-80.7500', '/api/health', '/api', '/api?x=1', '/api/push/key']);
same('not an /api address: given back untouched', ['https://power.larc.nasa.gov/api/temporal/daily/point', 'js/app.js', '/apix', 'api/x', '', '/data/regions.json'].map(p => apiUrl(p)), ['https://power.larc.nasa.gov/api/temporal/daily/point', 'js/app.js', '/apix', 'api/x', '', '/data/regions.json']);
same('a base for one call wins; one that is not a safe address counts as none', [apiUrl('/api/x', SERVER), apiUrl('/api/x', 'http://127.0.0.1:5932'), apiUrl('/api/x', 'http://evil.example'), apiUrl('/api/x', '')], [`${SERVER}/api/x`, 'http://127.0.0.1:5932/api/x', '/api/x', '/api/x']);
same('a clean address: lower case, no slash at the end, the usual port left out, another port kept', ['  HTTPS://API.Example.TEST/ ', 'https://api.example.test:443', 'https://api.example.test:8443', 'http://localhost', 'http://127.0.0.1:5932/', 'http://[::1]:5932', 'http://localhost:80'].map(cleanOrigin),
  [SERVER, SERVER, 'https://api.example.test:8443', 'http://localhost', 'http://127.0.0.1:5932', 'http://[::1]:5932', 'http://localhost']);
same('refused: plain http to another computer, a path, a login, a query, a star, a space, quotes, other schemes, a bad name or port', ['http://api.example.test', 'https://api.example.test/api', 'https://user@api.example.test', 'https://api.example.test?x=1', 'https://*.example.test', 'https://api example.test', "https://a.test'+alert(1)+'", 'javascript:alert(1)', 'ftp://api.example.test', 'https://-bad.test', 'https://api.example.test:0', 'https://api.example.test:70000', '//api.example.test', 'api.example.test', null, undefined, 42].map(cleanOrigin), Array(17).fill(''));
{
  const on = await apiWith(config(SERVER));
  same('a site-config naming the server: every /api address goes there, nothing else does', [on.API_BASE, on.apiUrl('/api/smaproot?lat=1&lon=2'), on.apiUrl('/api'), on.apiUrl('https://api.open-meteo.com/v1/forecast'), on.apiUrl('/api/x', 'http://127.0.0.1:5932')],
    [SERVER, `${SERVER}/api/smaproot?lat=1&lon=2`, `${SERVER}/api`, 'https://api.open-meteo.com/v1/forecast', 'http://127.0.0.1:5932/api/x']);
  const bad = await apiWith(config('http://evil.example'));
  same('a site-config with an address that is not safe: never used, the pages keep their own address', [bad.API_BASE, bad.apiUrl('/api/x')], ['', '/api/x']);
  const odd = await apiWith(config('https://api.example.test/api/'));
  same('a site-config with a path after the name: refused as a whole', odd.API_BASE, '');
  const deploy = path.join(ROOT, 'deploy', 'stage-site.mjs');   // the website's deploy writes the file; the page must read what it writes
  if (fs.existsSync(deploy)) {
    const { siteConfigSource } = await import(pathToFileURL(deploy).href);
    const written = await apiWith(siteConfigSource(SERVER)), empty = await apiWith(siteConfigSource(''));
    same('the file the deploy writes (deploy/stage-site.mjs) is the one the page reads', [written.API_BASE, written.apiUrl('/api/x'), empty.API_BASE], [SERVER, `${SERVER}/api/x`, '']);
  } else console.log('note  deploy/stage-site.mjs is not in this folder yet: the check that the page reads what the deploy writes waits for it');
}
{
  const calls = [], fake = (url, init) => { calls.push([url, init]); return Promise.resolve({ ok: true }); };
  const before = globalThis.fetch; globalThis.fetch = fake;
  const on = await apiWith(config(SERVER));
  same('loading the module in Node asks nothing (the first-touch wake is for pages only)', calls.length, 0);
  globalThis.fetch = before;
  same('no server on another name: nothing to wake', [on.wakeApi(fake, ''), calls.length], [false, 0]);
  same('the wake: one small question to the server\'s health, never stored, no cookie', [on.wakeApi(fake, SERVER), calls], [true, [[`${SERVER}/api/health`, { cache: 'no-store', credentials: 'omit' }]]]);
  same('once a page: a second wake asks nothing', [on.wakeApi(fake, SERVER), calls.length], [false, 1]);
  const failing = await apiWith(config(SERVER));
  check('a wake that fails says nothing and stops nothing', failing.wakeApi(() => Promise.reject(new Error('down')), SERVER) === true && failing.wakeApi(() => { throw new Error('down'); }, SERVER) === false);
  const listeners = new Map(), target = { addEventListener: (k, f, o) => listeners.set(k, { f, o }), removeEventListener: (k, f) => { if (listeners.get(k)?.f === f) listeners.delete(k); } };
  const touch = await apiWith(config(SERVER)), asked = [];
  same('first touch, not a page load: a tap or a key, caught before the page handles it, never holding the page up', [touch.wakeOnFirstTouch(target, u => { asked.push(u); return Promise.resolve(); }, SERVER), [...listeners.keys()].sort(), listeners.get('keydown')?.o], [true, ['keydown', 'pointerdown'], { capture: true, passive: true }]);
  listeners.get('pointerdown').f();
  same('the first touch wakes the server once and takes both listeners away', [asked, listeners.size], [[`${SERVER}/api/health`], 0]);
  same('one address: no listener at all', touch.wakeOnFirstTouch(target, () => {}, ''), false);
}

// ---- part 2: the rewrite on hand-made sources
const R = (src, opts) => rewriteSource(src, opts);
{
  const r = R("import { a } from './a.js';\nexport const f = () => fetch('/api/x');\n");
  same('a text in a call: wrapped, the import added after the last import', r.out, "import { a } from './a.js';\nimport { apiUrl } from './api.js';\nexport const f = () => fetch(apiUrl('/api/x'));\n");
  same('…and reported with its place', r.changed.map(c => [c.line, c.col, c.call]), [[2, 30, 'fetch']]);
}
same('a template in a call', R('const g = q => get(`/api/gracecell?${q}`);').out, "import { apiUrl } from './api.js';\nconst g = q => get(apiUrl(`/api/gracecell?${q}`));");
same('a template with a template inside it, as the crop-map call has', R('get(`/api/cropsnear?lat=${a}${c ? `&country=${encodeURIComponent(c)}` : \'\'}`).then(r => r.json());').out,
  "import { apiUrl } from './api.js';\nget(apiUrl(`/api/cropsnear?lat=${a}${c ? `&country=${encodeURIComponent(c)}` : ''}`)).then(r => r.json());");
same('a server name in front (${base}/api…): it becomes the second argument', R('const res = await fetchImpl(`${base}/api/dem?${q}`);').out, "import { apiUrl } from './api.js';\nconst res = await fetchImpl(apiUrl(`/api/dem?${q}`, base));");
same('a longer expression that starts with the address: wrapped whole, the second argument left alone', R("get('/api/y?q=' + q, { a: 1 });").out, "import { apiUrl } from './api.js';\nget(apiUrl('/api/y?q=' + q), { a: 1 });");
same('a method call (env.fetch) and an optional call (fetch?.())', R("env.fetch('/api/push/key'); fetch?.('/api/z');").out, "import { apiUrl } from './api.js';\nenv.fetch(apiUrl('/api/push/key')); fetch?.(apiUrl('/api/z'));");
same('an address builder: what an arrow function or a return gives back', R('export const U = (a) => `/api/firms?lat=${a}`\nfunction u() { return \'/api/r?x=1\'; }\n').out, "import { apiUrl } from './api.js';\nexport const U = (a) => apiUrl(`/api/firms?lat=${a}`)\nfunction u() { return apiUrl('/api/r?x=1'); }\n");
{
  const src = "// fetch('/api/in-a-comment')\n/* get('/api/in-a-block') */\nconst re = /\\/api\\/(smaproot|dem)/;\nif (url.startsWith('/api/')) x();\nconst k = '/api/x';\nconst p = () => '/api/';\nconst ext = fetch('https://power.larc.nasa.gov/api/temporal/daily/point');\nlocal.includes('/api/push');\n";
  const r = R(src);
  same('never touched: comments, a regular expression, path tests, a bare prefix, a name, another host', r.out, src);
  same('…and the ones that could be ours are listed with the reason', r.left.map(l => [l.line, l.why.split(' (')[0].split(':')[0]]), [[4, 'a path test'], [5, 'not an argument of a call'], [6, 'a bare /api prefix given back, not a whole address'], [8, 'a path test']]);
}
same('a link inside a longer text is listed, never changed', [R('const h = `<a href="/api/health">x</a>`;').left.length, R('const h = `<a href="/api/health">x</a>`;').changed.length], [1, 0]);
same('a later argument is listed, never guessed', R("request('GET', '/api/x');").left.map(l => l.why), ['not the first argument of request(): check it by hand']);
same('already through apiUrl: nothing to do, counted', [R("get(apiUrl('/api/done'));").out, R("get(apiUrl('/api/done'));").done], ["get(apiUrl('/api/done'));", 1]);
same('an import from api.js already there: apiUrl joins it', R("import { API_BASE } from './api.js';\nget('/api/a');").out, "import { API_BASE, apiUrl } from './api.js';\nget(apiUrl('/api/a'));");
same('a file in a folder below js/ imports ../api.js', R("fetch('/api/a');", { importPath: '../api.js' }).out, "import { apiUrl } from '../api.js';\nfetch(apiUrl('/api/a'));");
same('the import goes after the header comments when a file has no import, and after a trailing note on the last import line', [R("// a header\n// more\nfetch('/api/a');\n").out, R("import x from './x.js';   // a note\nfetch('/api/b');\n").out],
  ["// a header\n// more\nimport { apiUrl } from './api.js';\nfetch(apiUrl('/api/a'));\n", "import x from './x.js';   // a note\nimport { apiUrl } from './api.js';\nfetch(apiUrl('/api/b'));\n"]);
same('a file with an apiUrl of its own is left whole, for a person', [R("function apiUrl() {}\nget('/api/mine');").out, R("function apiUrl() {}\nget('/api/mine');").changed.length, R("import { apiUrl } from './other.js';\nget('/api/m');").conflict !== ''], ["function apiUrl() {}\nget('/api/mine');", 0, true]);
same('a division is not a regular expression: the call after it is still found', R("x = a / 2; y = b / c / d; fetch('/api/after');").changed.length, 1);
same('a regular expression after a word that ends a statement', R("if (ok) return /\\/api\\//.test(u); fetch('/api/q');").changed.length, 1);
same('the rewritten text, read again, has nothing more to change', (() => { const once = R("fetch('/api/a'); get(`${base}/api/b`); const U = () => '/api/c?x';").out; const twice = R(once); return [twice.changed.length, twice.importAdded, twice.done]; })(), [0, false, 3]);
check('the reader keeps a template\'s inside as code: a call in a ${ } is found too', R('const t = `${get(\'/api/inner\')}`;').changed.length === 1);
check('an unclosed text or template never stops the reader', Array.isArray(tokens("const a = 'open\nfetch('/api/x');\nconst b = `x")));

// ---- part 3: this folder's own js/
{
  check('js/api.js and js/site-config.js are in this folder', fs.existsSync(path.join(ROOT, 'js', 'api.js')) && fs.existsSync(path.join(ROOT, 'js', 'site-config.js')));
  const here = rewriteFolder(ROOT);   // read only: nothing is written into the folder by this suite
  same('this folder: no call to the server skips apiUrl (run: node scripts/apiurl-rewrite.mjs . to fix)', here.changed.map(c => `${c.file}:${c.line} ${c.before}`), []);
  same('this folder: nothing the rewrite must leave to a person (an apiUrl of its own, or a link to a file elsewhere that holds a call)', here.conflicts, []);
  check('this folder: the calls found are all through apiUrl', here.done >= 1, `${here.done} found`);
  if (here.left.length || here.outside.length) console.log(`note  ${here.left.length + here.outside.length} /api text(s) left as they are, for a person to look at:\n${[...here.left, ...here.outside].map(l => `      ${l.file}:${l.line}  ${l.before}  (${l.why})`).join('\n')}`);

  // a copy with the server set up on another name: each loader asks there
  const site = path.join(TMP, 'site'); fs.cpSync(path.join(ROOT, 'js'), path.join(site, 'js'), { recursive: true });
  fs.writeFileSync(path.join(site, 'js', 'site-config.js'), config(SERVER));
  const copy = rewriteFolder(site, { write: true });
  same('the copy: the rewrite has nothing left to do there either', copy.changed.length, 0);
  for (const file of here.done ? fs.readdirSync(path.join(site, 'js')).filter(f => f.endsWith('.js')) : []) {
    const r = spawnSync(process.execPath, ['--check', path.join(site, 'js', file)], { encoding: 'utf8' });
    if (r.status !== 0) check(`js/${file} is still a module Node can read`, false, r.stderr.split('\n').slice(0, 3).join(' '));
  }
  const asked = [], get = url => { asked.push(String(url)); return Promise.resolve({ ok: true, json: async () => ({ ok: false, reason: 'test answer' }) }); };
  const LOC = { lat: 43.13, lon: -80.75, cc: 'CA', label: 'Oxford County, Ontario, Canada' };
  const LOADERS = [   // [file, export, how to call it]: each one that exists in this folder must ask the server set up, through apiUrl
    ['report-load.js', 'loadSmap', f => f(LOC, get)], ['satellites-data.js', 'loadImerg', f => f(LOC, get)], ['satellites2-data.js', 'loadGrace', f => f(LOC, get)], ['satellites2-data.js', 'loadEco', f => f(LOC, get)],
    ['satellites2-data.js', 'loadHls', f => f(LOC, get)], ['near-load.js', 'loadNearby', f => f(LOC, get, 1000)], ['admin-view.js', 'loadSources', f => f(get)], ['money-data.js', 'loadMoney', f => f(get)],
    ['greenness.js', 'loadGreenness', f => f(LOC, get)], ['farmobserved.js', 'loadObserved', f => new Promise(done => f(LOC.lat, LOC.lon, { fetchFn: get, onDone: done }))],
    ['heights3d.js', 'loadHeights', f => f({ lat: LOC.lat, lon: LOC.lon, width: 200, depth: 200, n: 3 }, { fetchImpl: get })], ['gibs.js', 'FIRES_URL', f => { asked.push(f(LOC.lat, LOC.lon)); }],
  ];
  let tried = 0;
  for (const [file, name, call] of LOADERS) {
    const full = path.join(site, 'js', file); if (!fs.existsSync(full)) continue;
    let mod; try { mod = await import(pathToFileURL(full).href); } catch (e) { check(`js/${file} loads in Node`, false, e.message); continue; }
    if (typeof mod[name] !== 'function') { check(`js/${file} still offers ${name}()`, false); continue; }
    const from = asked.length;
    try { await call(mod[name]); } catch (e) { check(`${name}() runs with a stand-in fetch`, false, e.message); continue; }
    tried++;
    const mine = asked.slice(from);
    check(`${name}() (js/${file}) asks the server set up, and only there`, mine.length >= 1 && mine.every(u => u.startsWith(`${SERVER}/api/`)), mine);
  }
  check('at least the satellite and crop-map loaders were tried', tried >= 5, `${tried} tried`);
  const remind = path.join(site, 'js', 'remind.js');
  if (fs.existsSync(remind)) check('js/remind.js: the three push routes go through apiUrl', ['/api/push/key', '/api/push/subscribe', '/api/push/unsubscribe'].every(p => fs.readFileSync(remind, 'utf8').includes(`apiUrl('${p}')`)));
}

console.log(`test_apiurl: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
