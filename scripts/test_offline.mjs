// Crophalo's offline suite for the service worker (sw.js): the worker file is run in a Node sandbox with a pretend network, a pretend cache and a pretend clock, and every rule of
// "one visit, one source" and "one whole copy" is checked: reading the app for its files, all or nothing, the kept copy when the network is gone or slow, no mixed versions after a release,
// never /api or another website, pictures kept, old copies tidied. No browser and no internet.
// RULE: never loosen a check here without a written farming reason beside it. A farmer who opens a half-old, half-new app sees it dead in the field. Run: node scripts/test_offline.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const BASE = 'http://site.test/', flush = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };

// ---- the pretend world: a network, a cache store, a clock, and the worker run inside them
function world(files, { now = 1e12 } = {}) {
  const net = { files: { ...files }, offline: false, hang: new Set(), fail: new Set(), asked: [], status: {} };
  const clock = { now, timers: [] };
  const store = new Map();   // cache name → Map(url → { status, headers, body })
  const keyOf = r => new URL(typeof r === 'string' ? r : r.url, BASE).href;
  const cacheOf = name => {
    const map = store.get(name);
    return {
      async put(req, res) { map.set(keyOf(req), { status: res.status, headers: [...res.headers], body: Buffer.from(await res.arrayBuffer()) }); },
      async match(req) { const e = map.get(keyOf(req)); return e ? new Response(e.body, { status: e.status, headers: e.headers }) : undefined; },
      async keys() { return [...map.keys()].map(url => ({ url })); },
      async delete(req) { return map.delete(keyOf(req)); },
    };
  };
  const caches = {
    async open(name) { if (!store.has(name)) store.set(name, new Map()); return cacheOf(name); },
    async keys() { return [...store.keys()]; },
    async delete(name) { return store.delete(name); },
    async has(name) { return store.has(name); },
  };
  const fetchFake = async input => {
    const url = new URL(typeof input === 'string' ? input : input.url, BASE), where = url.pathname.replace(/^\//, '');
    net.asked.push({ where, cache: input.cache });
    if (net.offline || net.fail.has(where)) throw new TypeError('network down');
    if (net.hang.has(where)) return new Promise(() => {});
    const f = net.files[where === '' ? 'index.html' : where];
    if (!f) return new Response('not found', { status: 404 });
    return new Response(f.body, { status: net.status[where] || 200, headers: { 'content-type': f.type || 'text/plain', ...(f.etag ? { etag: f.etag } : {}) } });
  };
  const listeners = {}, state = { skipped: false, claimed: false };
  const self = { location: { href: BASE + 'sw.js' }, addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting: async () => { state.skipped = true; }, clients: { claim: async () => { state.claimed = true; } } };
  const sandbox = { self, caches, fetch: fetchFake, Request, Response, URL, Promise, setTimeout: (fn, ms) => { const t = { at: clock.now + ms, fn }; clock.timers.push(t); return t; }, clearTimeout: t => { clock.timers = clock.timers.filter(x => x !== t); }, Date: { now: () => clock.now }, console };
  vm.createContext(sandbox); vm.runInContext(SW, sandbox, { filename: 'sw.js' });
  const advance = async ms => {   // the pretend clock moves; timers that fall due run, in order
    const end = clock.now + ms;
    for (;;) { await flush(); const due = clock.timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0]; if (!due) break; clock.timers = clock.timers.filter(t => t !== due); clock.now = due.at; due.fn(); }
    clock.now = end; await flush();
  };
  const run = async (type, init = {}) => {   // an event with waitUntil and respondWith; returns what was waited for and the response given
    const waits = []; let responded = null;
    const event = { ...init, waitUntil: p => waits.push(p), respondWith: p => { responded = Promise.resolve(p); } };
    listeners[type]?.(event);
    return { event, responded, done: () => Promise.all(waits) };
  };
  const ask = async (url, { mode = 'no-cors', destination = '', clientId = 'page1', resultingClientId = '', method = 'GET' } = {}, wait = 0) => {
    const request = { url: new URL(url, BASE).href, method, mode, destination, headers: new Headers() };
    const r = await run('fetch', { request, clientId, resultingClientId });
    if (!r.responded) return { handled: false };
    let result = null, settled = false; r.responded.then(v => { result = v; settled = true; }, e => { result = e; settled = true; });
    if (wait) await advance(wait); else await flush();
    return { handled: true, settled, response: settled ? result : null, promise: r.responded };
  };
  const install = async () => { const r = await run('install'); await r.done(); await flush(); };
  const activate = async () => { const r = await run('activate'); await r.done(); await flush(); };
  const copies = () => [...store.keys()].filter(n => n.startsWith('crophalo-app'));
  return { net, store, caches, ask, install, activate, advance, clock, copies, state, run, listeners, text: async res => (await res.text()) };
}

// ---- a small pretend app that has every way a file can be named
const APP = {
  'index.html': { type: 'text/html', etag: '"h1"', body: '<!doctype html><link rel="stylesheet" href="css/app.css"><link rel="icon" href="data:image/svg+xml,x"><link rel="manifest" href="manifest.json"><script src="vendor/lib/lib.js"></script><script type="module" src="js/app.js"></script><img src="https://other.example/a.js"><a href="/api/health.json">x</a>' },
  'manifest.json': { type: 'application/json', etag: '"m1"', body: '{"name":"x"}' },
  'data/regions.json': { type: 'application/json', etag: '"r1"', body: '[]' },
  'css/app.css': { type: 'text/css', etag: '"c1"', body: 'body{color:#000}' },
  'vendor/lib/lib.js': { type: 'text/javascript', etag: '"l1"', body: 'window.lib=1;' },
  'js/app.js': { type: 'text/javascript', etag: '"a1"', body: "import { one } from './one.js';\nimport './side.js';\nconst two = () => import('./two.js');\nnew Worker(new URL('./work.js', import.meta.url));\nfetch('/api/health');\nimport('https://cdn.example/x.js');\n" },
  'js/one.js': { type: 'text/javascript', etag: '"o1"', body: "export * from './deep/three.js';\nexport const one = 1;" },
  'js/side.js': { type: 'text/javascript', etag: '"s1"', body: 'console.log("side");' },
  'js/two.js': { type: 'text/javascript', etag: '"t1"', body: 'export const two = 2;' },
  'js/work.js': { type: 'text/javascript', etag: '"w1"', body: 'self.onmessage=()=>{};' },
  'js/deep/three.js': { type: 'text/javascript', etag: '"d1"', body: 'export const three = 3;' },
  'icons/logo.png': { type: 'image/png', body: 'PNG1' },
  'api/health': { type: 'application/json', body: '{"live":true}' },
};
const ALL = Object.keys(APP).filter(k => !k.startsWith('api/') && !k.startsWith('icons/'));
const names = w => [...w.store.get(w.copies().sort().pop()).keys()].map(u => u.replace(BASE, ''));

// ---- install: reading the app for its files
{
  const w = world(APP); await w.install();
  const got = names(w);
  same('install keeps every file the page and the modules name, each once, and nothing else', [...got.filter(n => n !== '' && n !== 'sw-complete')].sort(), [...ALL].sort());
  same('the entry page is kept under "./" as well, and the completeness mark is the LAST entry', [got.includes(''), got[got.length - 1], got[got.length - 2]], [true, 'sw-complete', '']);
  check('the mark holds the copy\'s own name', (await w.text(await (await w.caches.open(w.copies()[0])).match(BASE + 'sw-complete'))) === w.copies()[0]);
  check('each file was asked for once, with a fresh read (cache: reload)', ALL.every(f => w.net.asked.filter(a => a.where === f).length === 1) && w.net.asked.every(a => a.cache === 'reload'), w.net.asked.slice(0, 4));
  check('nothing under /api and nothing of another website was asked for', !w.net.asked.some(a => /^api\//.test(a.where) || /other\.example|cdn\.example/.test(a.where)));
  check('a worker named with new URL(..., import.meta.url) and a dynamic import() are found', got.includes('js/work.js') && got.includes('js/two.js') && got.includes('js/deep/three.js'));
  check('the worker takes over at once (skipWaiting, then claim on activate)', w.state.skipped === true && (await w.activate(), w.state.claimed === true));
}
// ---- all or nothing
for (const [name, how] of [['a file that is not found (404)', w => { w.net.status['js/two.js'] = 404; }], ['a file that cannot be reached', w => { w.net.fail.add('js/deep/three.js'); }]]) {
  const w = world(APP); how(w);
  const r = await w.run('install'); let failedInstall = false; try { await r.done(); } catch { failedInstall = true; }
  check(`${name}: the install fails and no copy is kept: "ready offline" is never claimed for half an app`, failedInstall && w.copies().length === 0, [failedInstall, w.copies()]);
  w.net.fail.clear(); w.net.status = {}; await w.install();
  check(`${name}: the next try, with everything there, makes the whole copy`, w.copies().length === 1, w.copies());
}
// ---- the kept copy when the network is gone
{
  const w = world(APP); await w.install(); await w.activate();
  w.net.offline = true;
  const page = await w.ask('/', { mode: 'navigate', resultingClientId: 'c1' });
  check('offline, a visit is answered with the kept page', page.settled && (await w.text(page.response)).includes('css/app.css'));
  const app = await w.ask('/js/app.js', { destination: 'script', clientId: 'c1' }), css = await w.ask('/css/app.css', { destination: 'style', clientId: 'c1' }), two = await w.ask('/js/two.js', { destination: 'script', clientId: 'c1' });
  check('and every file of that page from the same copy', [app, css, two].every(a => a.settled && a.response.ok) && (await w.text(app.response)).includes('import { one }'));
  const api = await w.ask('/api/health'), cdn = await w.ask('https://other.example/a.js', { destination: 'script' }), post = await w.ask('/js/app.js', { method: 'POST' });
  same('/api, another website and a POST are never handled: the worker leaves them to the browser', [api.handled, cdn.handled, post.handled], [false, false, false]);
  const pageDeep = await w.ask('/js/deep/three.js', { destination: 'script', clientId: 'c1' });
  check('a module deep in the tree is there offline too', pageDeep.settled && pageDeep.response.ok);
  const missing = await w.ask('/js/never-existed.js', { destination: 'script', clientId: 'c1' });
  check('a file the copy does not hold fails plainly offline, never an invented answer', missing.settled && (missing.response.type === 'error' || !missing.response.ok));
}
// ---- the network is slow: 4 seconds for the page
{
  const w = world(APP); await w.install(); await w.activate();
  w.net.hang.add('');   // the page itself never answers
  const page = await w.ask('/', { mode: 'navigate', resultingClientId: 'c2' });
  check('a page that does not answer is not waited for for ever: nothing yet before 4 s', !page.settled);
  await w.advance(4100);
  check('after 4 s the kept page is shown', page.settled === false && (await page.promise).ok === true);
  w.net.hang.clear();
  const f = await w.ask('/js/app.js', { destination: 'script', clientId: 'c2' });
  check('and the files of that page come from the kept copy, even though the network is back (one visit, one source)', f.settled && w.net.asked.filter(a => a.where === 'js/app.js').length === 1, w.net.asked.filter(a => a.where === 'js/app.js').length);
}
// ---- a release: one byte of a module changes
{
  const w = world(APP); await w.install(); await w.activate();
  const first = w.copies()[0];
  w.net.files['js/two.js'] = { ...APP['js/two.js'], etag: '"t2"', body: 'export const two = 22;' };
  const page = await w.ask('/', { mode: 'navigate', resultingClientId: 'c3' });
  check('online, the visit takes the page from the network', page.settled && w.net.asked.some(a => a.where === '' || a.where === 'index.html' || a.where === ''));
  const two = await w.ask('/js/two.js', { destination: 'script', clientId: 'c3' });
  check('and the changed file from the network: the new version at once', two.settled && (await w.text(two.response)).includes('22'));
  const app = await w.ask('/js/app.js', { destination: 'script', clientId: 'c3' });
  check('and a file that did not change is also the network\'s (all new, never mixed with the old copy)', app.settled && w.net.asked.filter(a => a.where === 'js/app.js').length === 2);
  // a file fails AFTER a difference was seen: it stays failed, never the old copy's file
  w.net.hang.add('js/one.js'); w.net.fail.add('js/side.js');
  const side = await w.ask('/js/side.js', { destination: 'script', clientId: 'c3' });
  check('after a release was seen, a file that fails stays failed: the old copy\'s file is never mixed in', side.settled && (side.response.type === 'error' || !side.response.ok), side.response && side.response.type);
  const slow = await w.ask('/js/one.js', { destination: 'script', clientId: 'c3' });
  await w.advance(10100);
  check('and a file that never arrives after a release also stays failed', (await slow.promise).type === 'error');
  w.net.hang.clear(); w.net.fail.clear();
  // the quiet check: the page says it has loaded; a new whole copy replaces the old
  const msg = await w.run('message', { data: 'loaded', source: { id: 'c3' } }); await msg.done(); await flush();
  const now = w.copies();
  check('the quiet check made ONE new complete copy and tidied the old one away', now.length === 1 && now[0] !== first, now);
  check('the new copy holds the changed file', (await w.text(await (await w.caches.open(now[0])).match(BASE + 'js/two.js'))).includes('22'));
  const msg2 = await w.run('message', { data: 'loaded', source: { id: 'c3' } }); await msg2.done(); await flush();
  same('with nothing changed the check keeps the copy there is', w.copies(), now);
}
// ---- a page served from the kept copy never starts the release check; a stalled file on an unchanged page falls back to the copy
{
  const w = world(APP); await w.install(); await w.activate();
  const page = await w.ask('/', { mode: 'navigate', resultingClientId: 'c4' });
  check('online and unchanged: the page is the network\'s', page.settled);
  w.net.hang.add('js/side.js');
  const side = await w.ask('/js/side.js', { destination: 'script', clientId: 'c4' });
  await w.advance(10100);
  check('a file that never arrives while nothing has changed is taken from the kept copy after 10 s (a dropped connection, not a release)', (await side.promise).ok === true);
  const after = await w.ask('/js/two.js', { destination: 'script', clientId: 'c4' });
  check('and the rest of that page\'s files then come from the kept copy as well', after.settled && w.net.asked.filter(a => a.where === 'js/two.js').length === 1, w.net.asked.filter(a => a.where === 'js/two.js').length);
  w.net.offline = true;
  const off = await w.run('message', { data: 'loaded', source: { id: 'c4' } });
  check('a "loaded" from a page that now runs from the kept copy starts no release check', (await off.done(), w.copies().length === 1));
}
// ---- the copies: only complete ones count; names are always newer; other caches are never touched
{
  const w = world(APP); await w.install(); await w.activate();
  const good = w.copies()[0];
  w.store.set('crophalo-app-v1-' + (Number(good.slice('crophalo-app-v1-'.length)) + 5), new Map([[BASE + 'index.html', { status: 200, headers: [], body: Buffer.from('half') }]]));   // a newer, half-written copy: no mark
  await w.activate();
  check('a copy newer than the current one is left alone (another release may be writing it)', w.copies().length === 2);
  w.net.offline = true;
  const page = await w.ask('/', { mode: 'navigate', resultingClientId: 'c5' });
  check('a half-written copy is never used: the complete one answers', page.settled && (await w.text(page.response)) !== 'half');
  w.store.set('crophalo-data-v1', new Map([[BASE + 'api/x', { status: 200, headers: [], body: Buffer.from('kept') }]]));
  w.store.set('crophalo-app-v0-old', new Map());
  const before = w.store.get('crophalo-data-v1');
  await w.activate();
  check('the data cache of the app\'s own code is never touched; an old-style app copy is tidied away', w.store.get('crophalo-data-v1') === before && !w.store.has('crophalo-app-v0-old'));
}
{
  const w = world(APP, { now: 5e11 }); await w.install();
  const old = w.copies()[0];
  w.clock.now = 1e11;   // the clock went back a long way
  w.net.files['js/two.js'] = { ...APP['js/two.js'], etag: '"t3"', body: 'export const two = 3;' };
  const m = await w.run('message', { data: 'loaded', source: { id: 'x' } }); await m.done(); await flush();
  const now = w.copies();
  check('after the clock went back the new copy is still named newer than every old one, so it is the current one', now.length === 1 && now[0] !== old, now);
  w.net.offline = true;
  const two = await w.ask('/js/two.js', { destination: 'script', clientId: 'z' });
  check('and it is the one served', two.settled && (await w.text(two.response)).includes('= 3'));
}
// ---- pictures
{
  const w = world(APP); await w.install(); await w.activate();
  const p1 = await w.ask('/icons/logo.png', { destination: 'image' });
  check('a picture is taken from the network the first time', p1.settled && (await w.text(p1.response)) === 'PNG1');
  w.net.offline = true;
  const p2 = await w.ask('/icons/logo.png', { destination: 'image' });
  check('and from the saved copy when the network is gone', p2.settled && (await w.text(p2.response)) === 'PNG1');
  const p3 = await w.ask('/icons/never.png', { destination: 'image' });
  check('a picture never seen, offline, fails plainly', p3.settled && p3.response.type === 'error');
  w.net.offline = false;
  for (let i = 0; i < 90; i++) { w.net.files[`icons/p${i}.png`] = { type: 'image/png', body: 'x' + i }; await w.ask(`/icons/p${i}.png`, { destination: 'image' }); }
  check('only the newest 80 pictures are kept', (await (await w.caches.open('crophalo-files-v1')).keys()).length <= 80);
  w.net.files['icons/logo.png'] = { type: 'image/png', body: 'PNG2' }; w.net.hang.add('icons/logo.png');
}

// ---- the real app of this folder: the worker reads the real page and finds what the page really loads
{
  const disk = {};
  const walk = (dir = '') => { for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) { const rel = dir ? `${dir}/${e.name}` : e.name; if (e.isDirectory()) { if (!['runtime', '.venv', '.cache', 'node_modules', '.git', 'scripts', 'docs', 'design'].includes(rel) && !e.name.startsWith('.')) walk(rel); } else if (/\.(html|js|css|json|png|svg)$/.test(e.name)) disk[rel] = { type: 'text/plain', etag: `"${fs.statSync(path.join(ROOT, rel)).size}"`, body: fs.readFileSync(path.join(ROOT, rel)) }; } };
  walk();
  const w = world(disk); await w.install();
  const got = new Set(names(w).filter(n => n && n !== 'sw-complete'));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const local = [...html.matchAll(/\b(?:src|href)="([^":#?]+\.(?:js|css|json))"/g)].map(m => m[1]);
  check('every script, style and data file the real page names is in the copy', local.every(f => got.has(f)), local.filter(f => !got.has(f)));
  check('the real app\'s own modules are all there, including the ones reached only by import()', ['js/app.js', 'js/mapx.js', 'js/spotcard.js', 'js/weather.js', 'js/srci.js', 'js/sources.js'].every(f => !fs.existsSync(path.join(ROOT, f)) || got.has(f)), ['js/app.js', 'js/mapx.js', 'js/spotcard.js'].filter(f => !got.has(f)));
  check('the copy holds the real stylesheets and the map library', [...got].some(f => /^css\/.*\.css$/.test(f)) && got.has('vendor/leaflet/leaflet.js') && got.has('vendor/leaflet/leaflet.css'));
  check('the copy holds the motion stylesheets, so the page turn never scrolls the report sideways offline either', got.has('css/fx.css') && got.has('css/fx-halo.css'), [...got].filter(f => /^css\/fx/.test(f)));
  const byName = JSON.parse(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/const BY_NAME = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  check('every file the worker lists by name is a real file of the folder, and in the copy', byName.length > 0 && byName.every(f => fs.existsSync(path.join(ROOT, f)) && got.has(f)), byName.filter(f => !got.has(f)));
  const { LANDED } = await import(new URL('../js/macro.js', import.meta.url).href);
  check('every big animation that has landed is in the copy', LANDED.every(n => got.has(`js/macro-${n}.js`)), LANDED.filter(n => !got.has(`js/macro-${n}.js`)));
  const sheets = fs.readdirSync(path.join(ROOT, 'css')).filter(f => f.endsWith('.css')).map(f => `css/${f}`);
  // My farm now turns its two 3D scenes on (farm.setScenes in js/app.js): their modules, asked by a built name, and css/macro-3d.css come into the copy too, so no stylesheet is left out any more
  check('every stylesheet of the folder is in the copy', sheets.every(f => got.has(f)), sheets.filter(f => !got.has(f)));
  check('My farm\'s two 3D scenes are in the copy', ['js/macro-skeleton.js', 'js/macro-sun.js'].every(f => got.has(f)), ['js/macro-skeleton.js', 'js/macro-sun.js'].filter(f => !got.has(f)));
  check('the copy holds nothing under /api, and no test or script file', ![...got].some(f => /^(api|scripts)\//.test(f)));
  check('every file in the copy is a real file of the folder', [...got].every(f => fs.existsSync(path.join(ROOT, f))), [...got].filter(f => !fs.existsSync(path.join(ROOT, f))));
  w.net.offline = true;
  const page = await w.ask('/', { mode: 'navigate', resultingClientId: 'real' });
  check('offline, the real page is served from the copy', page.settled && (await w.text(page.response)).includes('<title>'));
}

// ---- the page side: when a worker may be registered, the words, the install card
{
  const { canRegister, installCardHtml, OFFLINE_WORDS, BACK_ONLINE } = await import(new URL('../js/offline.js', import.meta.url).href);
  const loc = (protocol, hostname) => ({ protocol, hostname }), nav = { serviceWorker: {} };
  same('a worker is registered on https and on this computer only', [canRegister(loc('https:', 'site.example.test'), nav), canRegister(loc('http:', 'localhost'), nav), canRegister(loc('http:', '127.0.0.1'), nav), canRegister(loc('http:', '[::1]'), nav), canRegister(loc('http:', 'site.example.test'), nav), canRegister(loc('http:', '192.168.1.5'), nav)], [true, true, true, true, false, false]);
  same('and only where the browser has workers', [canRegister(loc('https:', 'x.example'), {}), canRegister(loc('https:', 'x.example'), undefined)], [false, false]);
  same('the offline line has both halves: what still works and what does not', OFFLINE_WORDS, 'You are offline. Saved fields open, but a new report needs an internet connection.');
  same('the way back', BACK_ONLINE, 'You are back online.');
  const card = installCardHtml();
  check('the install card says what it does, and its button is hidden until the browser offers to install', /Install on this device/.test(card) && /even with no signal\. New reports still need an internet connection/.test(card) && /<button[^>]*installbtn[^>]*hidden/.test(card), card);
  check('there is exactly one install button in the card', (card.match(/installbtn/g) || []).length === 1);
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
