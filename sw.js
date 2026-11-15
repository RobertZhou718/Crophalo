// Crophalo's service worker: after one online visit the app opens with no internet, from ONE complete copy of itself, and never shows a half-old, half-new app.
// It finds the app's files by reading the page and the modules (so an imported module never needs a list edited by hand), keeps them as one versioned copy that counts only
// when every file arrived, and never touches /api or another website. Nothing here asks for data: live answers are never kept by the worker.
// Checked by scripts/test_offline.mjs (this file run in a Node sandbox with a pretend network and cache) and scripts/e2e_map.mjs (a real browser, network off).
const PRE = 'crophalo-app-v1-';          // one cache per app copy, named with the time it was made
const DONE = 'sw-complete';              // the last entry of a copy: its body is the cache's name. A copy without it is half-written and never used
const FILES = 'crophalo-files-v1';       // pictures and map tiles seen online (not part of a copy)
const FILES_MAX = 80;
const CRAFT = 'crophalo-craft-v1';       // the six spacecraft pictures of the home's satellite cards
const RACE_MS = 4000, STALL_MS = 10000, AT_ONCE = 4;
const SEEDS = ['index.html', 'manifest.json', 'data/regions.json'];
// Files a screen asks by a built name (css/${sheet}.css, macro-${name}.js), which reading the modules cannot find. A big animation that lands adds its module here too.
// One of them that this folder does not have (404) is left out; any other failure still drops the whole copy.
const BY_NAME = ['css/market.css', 'css/fx.css', 'css/fx-halo.css', 'css/history.css', 'css/ahead.css', 'css/explain.css', 'css/notes.css', 'css/share.css', 'css/macro-report.css', 'css/trends.css',
  'js/macro-turn.js', 'js/macro-setup.js', 'js/macro-descent.js', 'js/macro-light.js', 'js/macro-skeleton.js', 'js/macro-sun.js', 'css/macro-3d.css'];

const here = new URL('./', self.location.href);
if (typeof importScripts === 'function') importScripts('js/remind-sw.js');   // the reminders: a push shows its notice, and a press on it opens Crophalo
const abs = path => new URL(path, here).href;
const isApi = url => url.origin === here.origin && url.pathname.startsWith(here.pathname + 'api/');

// ---- the names of the copies
const timeOf = name => Number(name.slice(PRE.length)) || 0;
async function completeCopies() {
  const out = [];
  for (const name of (await caches.keys()).filter(n => n.startsWith(PRE))) {
    const cache = await caches.open(name), mark = await cache.match(abs(DONE));
    if (mark && await mark.text() === name) out.push(name);
  }
  return out.sort((a, b) => timeOf(a) - timeOf(b));
}
let remembered = null;   // the copy this worker last used; looked up again when it is gone (another release may have replaced it)
async function current() {
  if (remembered && (await caches.keys()).includes(remembered)) { const mark = await (await caches.open(remembered)).match(abs(DONE)); if (mark) return remembered; }
  const all = await completeCopies();
  return remembered = all[all.length - 1] || null;
}

// ---- reading the app: the page, then every module it names
const SRC = /\b(?:src|href)\s*=\s*"([^"#?]+\.(?:js|css|json))(?:[?#][^"]*)?"/g;
const IMPORTS = [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /\bimport\s*['"]([^'"]+)['"]/g, /new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g];
function wanted(spec, from) {   // an address on this origin that is a file of the app, else null
  if (/^(data|blob|mailto|javascript):/i.test(spec)) return null;
  let url; try { url = new URL(spec, from); } catch { return null; }
  if (url.origin !== here.origin || isApi(url) || !url.pathname.startsWith(here.pathname)) return null;
  return url.href.split('#')[0].split('?')[0];
}
function namedIn(text, from, kind) {
  const found = [];
  if (kind === 'html') for (const m of text.matchAll(SRC)) found.push(m[1]);
  if (kind === 'js') for (const re of IMPORTS) for (const m of text.matchAll(re)) if (/^\.{0,2}\//.test(m[1])) found.push(m[1]);
  return found.map(s => wanted(s, from)).filter(Boolean);
}
const kindOf = url => (/\.html?$/.test(url) || url === here.href ? 'html' : /\.m?js$/.test(url) ? 'js' : 'other');

// Every file of the app as { url, response }, read from the network with the given cache mode. One file that fails drops the whole set: "ready offline" is never claimed for half an app.
async function gather(how) {
  const seen = new Set(), got = [], todo = [];
  const mark = url => { if (!seen.has(url)) { seen.add(url); todo.push(url); } };
  const byName = new Set(BY_NAME.map(abs));
  for (const seed of SEEDS.concat(BY_NAME)) mark(abs(seed));
  async function one(url) {
    const response = await fetch(new Request(url, { cache: how }));
    if (response.status === 404 && byName.has(url)) return;
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    const kind = kindOf(url);
    if (kind !== 'other') for (const next of namedIn(await response.clone().text(), url, kind)) mark(next);
    got.push({ url, response });
  }
  const running = new Set();
  let failure = null;   // the first file that failed: remembered here, so a failure can never fall between two waits and be missed
  while ((todo.length || running.size) && !failure) {
    while (todo.length && running.size < AT_ONCE) { const job = one(todo.shift()).catch(e => { failure ||= e; }).finally(() => running.delete(job)); running.add(job); }
    await Promise.race(running);
  }
  await Promise.allSettled(running);
  if (failure) throw failure;
  return got;
}

// A complete copy: a new cache with every file, then "./" (a copy of the page), then the mark last. Its name is always newer than every copy there is, even if the clock went back.
async function commit(got) {
  const all = (await caches.keys()).filter(n => n.startsWith(PRE)), name = PRE + Math.max(Date.now(), ...all.map(n => timeOf(n) + 1));
  const cache = await caches.open(name);
  try {
    for (const { url, response } of got) await cache.put(url, response.clone());
    const page = got.find(g => g.url === abs('index.html'));
    await cache.put(abs('./'), page.response.clone());
    await cache.put(abs(DONE), new Response(name));
  } catch (e) { await caches.delete(name); throw e; }
  remembered = name;
  return name;
}

// Delete every copy but the current one, one an open page still runs from, and any copy newer than the current (another release is still writing it).
const inUse = new Map();   // page id → { copy, moved } (the newest 50 pages)
const note = (id, state) => { inUse.set(id, state); if (inUse.size > 50) inUse.delete(inUse.keys().next().value); };
async function tidy() {
  const keep = await current(), mine = new Set([...inUse.values()].map(v => v.copy).filter(Boolean));   // only a page that RUNS from a copy keeps it; a page on the network's files only compared with it
  for (const name of (await caches.keys()).filter(n => n.startsWith('crophalo-app'))) {
    if (name === keep || mine.has(name) || (keep && name.startsWith(PRE) && timeOf(name) > timeOf(keep))) continue;
    await caches.delete(name);
  }
}

self.addEventListener('install', event => event.waitUntil((async () => { await commit(await gather('reload')); await self.skipWaiting(); })()));
self.addEventListener('activate', event => event.waitUntil((async () => { await tidy(); await self.clients.claim(); })()));

// ---- one visit, one source
const timeout = (ms, value) => new Promise(done => setTimeout(() => done(value), ms));
const tagOf = r => (r && (r.headers.get('etag') || r.headers.get('last-modified'))) || '';
async function fromCopy(copy, request) {
  const cache = await caches.open(copy), found = await cache.match(request.mode === 'navigate' ? abs('./') : new Request(request.url));
  return found || null;
}
async function visit(event) {
  const id = event.resultingClientId || event.clientId, copy = await current();
  const net = fetch(event.request).then(r => (r.ok || r.status < 500 ? r : Promise.reject(new Error('bad answer'))), () => null);
  const got = copy ? await Promise.race([net, timeout(RACE_MS, null)]) : await net;
  if (got) {   // the network answered in time (or nothing is kept yet): the page and its files come from the network, and each file is compared with the kept copy
    const kept = copy && await fromCopy(copy, event.request);
    note(id, { base: copy, moved: !!kept && tagOf(kept) !== '' && tagOf(kept) !== tagOf(got) });
    return got;
  }
  const kept = copy && await fromCopy(copy, event.request);
  if (kept) { note(id, { copy }); return kept; }
  return net.then(r => r || Response.error());
}
async function part(event) {
  const request = event.request, id = event.resultingClientId && request.destination === 'worker' ? event.resultingClientId : event.clientId;
  if (id && event.clientId && id !== event.clientId && inUse.has(event.clientId)) note(id, inUse.get(event.clientId));   // a worker a page starts goes the page's way
  let state = inUse.get(id) || inUse.get(event.clientId);
  if (!state) { const copy = await current(); state = { base: copy, moved: false }; }
  if (state.copy) return (await fromCopy(state.copy, request)) || Response.error();   // a page from the kept copy gets every file from it
  const copy = state.base, kept = copy && await fromCopy(copy, request);
  const net = fetch(request).then(r => (r.ok ? r : Promise.reject(new Error('bad answer'))), () => null);
  const got = kept ? await Promise.race([net, timeout(STALL_MS, null)]) : await net;
  if (got) { if (kept && tagOf(kept) !== '' && tagOf(kept) !== tagOf(got)) state.moved = true; return got; }
  if (kept && !state.moved) { state.copy = copy; return kept; }   // a dropped connection, not a release: the rest of the page's files come from the kept copy too
  return Response.error();   // after a release a failed file stays failed (a reload mends it): never the old copy's file
}

// Pictures and map tiles: network first, saved for later, the saved one after 4 s or when the network fails.
async function picture(event) {
  const request = event.request, craft = /\/img\/(craft|earth)\//.test(new URL(request.url).pathname), cache = await caches.open(craft ? CRAFT : FILES);   // the spacecraft pictures have a store of their own, never trimmed, so map tiles cannot push them out
  const net = fetch(request).then(async r => { if (r.ok) { await cache.put(request, r.clone()); const keys = craft ? [] : await cache.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - FILES_MAX))) await cache.delete(k); } return r; }, () => null);
  const saved = await cache.match(request);
  const got = saved ? await Promise.race([net, timeout(RACE_MS, null)]) : await net;
  return got || saved || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== here.origin || isApi(url)) return;   // other websites and every live answer are not ours to keep
  const code = request.mode === 'navigate' || ['script', 'style', 'worker', 'sharedworker', 'manifest'].includes(request.destination) || /\.(?:m?js|css|json)$/.test(url.pathname);
  if (request.mode === 'navigate') event.respondWith(visit(event));
  else if (code) event.respondWith(part(event));
  else if (['image', 'font'].includes(request.destination) || /\.(?:png|jpe?g|webp|svg|gif|ico|woff2?|glb)$/.test(url.pathname)) event.respondWith(picture(event));
});

// ---- a quiet release check: after an online visit the page says it has loaded; the worker reads the app again and keeps a new copy only if something changed
let refreshing = null;
async function refresh() {
  const had = await current();
  const got = await gather('no-cache');
  if (had) {
    const cache = await caches.open(had), keys = (await cache.keys()).map(k => k.url).filter(u => u !== abs('./') && u !== abs(DONE));
    let same = keys.length === got.length;
    for (const { url, response } of got) {
      if (!same) break;
      const old = await cache.match(url);
      same = !!old && (tagOf(old) && tagOf(response) ? tagOf(old) === tagOf(response) : await old.text() === await response.clone().text());
    }
    if (same) return;
  }
  await commit(got); await tidy();
}
self.addEventListener('message', event => {
  if (event.data !== 'loaded') return;
  const id = event.source && event.source.id;
  if (id && inUse.get(id)?.copy) return;   // a page served from the kept copy has nothing to compare: it is offline or slow
  event.waitUntil((refreshing ||= refresh().catch(() => {}).finally(() => { refreshing = null; })));   // any failure keeps the copy there is
});
