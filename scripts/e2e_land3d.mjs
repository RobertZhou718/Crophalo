// The browser suite for the land details of the 3D view on My farm: the Mead (Nebraska), Beltsville (Maryland) and Oxford County (Ontario) fields with OpenStreetMap's own recorded shapes, each switch drawn or
// said plainly when nothing is mapped or the map did not answer, the credit linked only while its shapes are drawn, and no long task, no second WebGL context and no new shader program while switches change.
// The lookups are answered on the page by the recorded answers of 2026-11-15 (the box rewritten to the block asked). Run: node scripts/e2e_land3d.mjs   (E2E_ONLY=mead,beltsville,oxford,failure picks groups)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';
import { realReport } from './fixtures/engine-plans.mjs';

const run = await openRun('e2e_land3d');
const { ROOT, js, page, until, tap, size, go, check, same, group: groupRaw, finish, sleep, send, shot } = run;
const CORES = os.cpus().length, CALM = 3 * CORES, load = () => Math.round(os.loadavg()[0] * 10) / 10;
const LONG_MS = 50, limitNow = () => load() < CALM ? LONG_MS : 200, at = () => `load ${load()} on ${CORES} cores${load() < CALM ? '' : `, over ${CALM}: judged at 200 ms, not ${LONG_MS}`}`;
const FIX = p => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'land', `${p}.json`), 'utf8'));
const FIELDS = {
  mead: { lat: 41.179469, lon: -96.439756, side: 800, ha: 64, name: 'Mead research field', osm: FIX('osm-mead'), osmx: FIX('osmextra-mead') },
  beltsville: { lat: 39.031031, lon: -76.844119, side: 251, ha: 6.3, name: 'Beltsville field', osm: FIX('osm-beltsville'), osmx: FIX('osmextra-beltsville') },
  oxford: { lat: 43.13, lon: -80.75, side: 300, ha: 9, name: 'Oxford County field', osm: FIX('osm-oxford'), osmx: null },
};
const BUSY = 'OpenStreetMap could not be read right now (its map service is busy); try again in a few minutes';

// the lookups' answers in the worker: the recorded answer with the shapes inside the asked block only and its box rewritten to it, or a refusal (this function's source is put into the worker's small stand-in module)
function restrict(rec, kind, block, down) {
  if (down) return { ok: false, reason: down };
  const empty = kind === 'osm' ? { buildings: [], roads: [], water: [], trees: [] } : { fences: [], gates: [], power: [], poles: [], things: [] };
  if (!rec) return { ok: true, box: block, ...empty, data_date: '2026-11-15T05:00:00Z', credit: '(c) OpenStreetMap contributors', licence: 'ODbL 1.0', source: 'OpenStreetMap' };
  const mLat = 111320, mLon = 111320 * Math.cos(block.lat * Math.PI / 180), within = p => Math.abs((p[0] - block.lat) * mLat) <= block.d / 2 && Math.abs((p[1] - block.lon) * mLon) <= block.w / 2;
  const out = { ...rec, box: block };
  for (const k of Object.keys(rec)) if (Array.isArray(rec[k])) out[k] = rec[k].filter(it => (Array.isArray(it.p[0]) ? it.p : [it.p]).some(within));
  return out;
}
// what the page measures from its first line (as scripts/e2e_3d_open.mjs): long tasks and frames, a heartbeat, the page's own WebGL contexts, the 3D workers; and the lookups answered from the recordings
const PRELUDE = `const restrict = ${restrict.toString()};
const A = __ANSWERS__;
const realFetch = self.fetch.bind(self);
self.addEventListener('unhandledrejection', e => self.postMessage({ type: 'asked', url: 'ERR ' + (e.reason && e.reason.stack || e.reason) }));
self.addEventListener('error', e => self.postMessage({ type: 'asked', url: 'ERR ' + e.message }));
self.fetch = (u, o) => {
  const s = String(u), m = /\\/api\\/(osm|osmextra)\\?(.*)$/.exec(s);
  if (!m) return realFetch(u, o);
  self.postMessage({ type: 'asked', url: s });
  const q = new URLSearchParams(m[2]), block = { lat: +q.get('lat'), lon: +q.get('lon'), w: +q.get('w'), d: +q.get('d') };
  return Promise.resolve(new Response(JSON.stringify(restrict(A[m[1] === 'osm' ? 'osm' : 'osmx'], m[1], block, A.down)), { status: 200, headers: { 'content-type': 'application/json' } }));
};
`;
const KIT = `(() => {
  const PRELUDE = ${JSON.stringify(PRELUDE)};
  const P = window.__3d = { long: [], loaf: [], gaps: [], pageGl: 0, workers: 0, alive: 0, asked: [] };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.long.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.loaf.push({ s: e.startTime, d: e.duration, b: e.blockingDuration }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
  let last = performance.now(); setInterval(() => { const now = performance.now(); if (now - last > 40) P.gaps.push({ s: last, d: now - last }); last = now; }, 16);
  const realFetch = window.fetch.bind(window);
  window.fetch = (u, o) => String(u && u.url || u).match(/api[\\/](dem|hlsndvi)[?]/) ? Promise.resolve(new Response(JSON.stringify({ ok: false, reason: 'stand-in: no service in the test copy' }), { status: 200, headers: { 'content-type': 'application/json' } })) : realFetch(u, o);
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { const c = get.call(this, kind, ...rest); if (c && /webgl/.test(String(kind)) && !this.__counted) { this.__counted = true; P.pageGl++; } return c; };
  const W = window.Worker;
  if (W) window.Worker = class extends W {
    constructor(url, opts) {
      const is3d = /farm3d/.test(String(url));
      let u = url;
      if (is3d) {   // the worker's own fetch is answered from the recordings: it is started through a small module that answers /api/osm and /api/osmextra itself, then loads the real one
        const real = new URL(String(url), location.href).href, A = window.__answers || {};
        u = URL.createObjectURL(new Blob([PRELUDE.replace('__ANSWERS__', () => JSON.stringify(A)), 'import ' + JSON.stringify(real) + ';'], { type: 'text/javascript' }));
      }
      super(u, opts);
      if (is3d) { P.workers++; P.alive++; this.addEventListener('message', e => { if (e.data?.type === 'asked') P.asked.push(e.data.url); if (e.data?.type === 'fail') (P.fails = P.fails || []).push(e.data); }); const stop = this.terminate.bind(this); let gone = false; this.terminate = () => { if (!gone) { gone = true; P.alive--; } stop(); }; }
    }
  };
})();`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: KIT });

const WELCOME = JSON.stringify({ v: '2026-11-14', at: 'test' });
const group = (label, body) => groupRaw(label, async () => { await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)}); localStorage.removeItem('crophalo.farm3d.land')`); await go('/'); await body(); });
const { report: REAL } = await realReport();
const setAnswers = (f, down = null) => js(`window.__answers = ${JSON.stringify({ osm: f.osm, osmx: f.osmx, down })}; 0`);

const payload = f => {
  const mLat = 111132.92, mLon = 111320 * Math.cos(f.lat * Math.PI / 180), a = f.side / 2 / mLat, b = f.side / 2 / mLon;
  return { ...REAL, place: { ...REAL.place, lat: f.lat, lon: f.lon, name: f.name }, area: f.ha, areaEstimated: false, outline: [[f.lat - a, f.lon - b], [f.lat - a, f.lon + b], [f.lat + a, f.lon + b], [f.lat + a, f.lon - b]] };
};
const open3d = async f => {
  await js(`import('/js/farm.js').then(m => { window.__farm = m; window.__res = m.addFromReport(${JSON.stringify(payload(f))}); })`);
  await until(`document.querySelector('#fwFinding')?.textContent.length > 5 && !document.querySelector('#view-farm').hidden`, 15e3);
  await until(`/^(Planned|Observed)$/.test(document.querySelector('#fwLabel')?.textContent || '')`, 15e3);
  await sleep(300);
  await tap('#fwThreeBtn');
  await until(`document.querySelector('#fw3d .f3d')?.dataset.state === 'ready'`, 40e3);
  await sleep(300);
};
const view = () => `window.__farm._view3d()`;
const land = () => js(`${view()}.land`);
const stats = () => js(`(async () => { const s = await ${view()}.stats(); return s; })()`);
const flip = async (id, on = true) => { await js(`(() => { const c = document.querySelector('#fw3d [data-land="${id}"]'); if (c.checked !== ${on}) c.click(); })()`); };
const settled = async (ids, ms = 20e3) => until(`(() => { const l = ${view()}.land; return ${JSON.stringify(ids)}.every(id => { const x = l.layers.find(y => y.id === id); return x && x.state !== 'waiting'; }); })()`, ms);
const now = () => js('performance.now()');
const busy = (from, to) => js(`(() => { const P = window.__3d, inside = e => e.s + e.d > ${from} && e.s < ${to};
  return { task: Math.round(Math.max(0, ...P.long.filter(inside).map(e => e.d))), frame: Math.round(Math.max(0, ...P.loaf.filter(inside).map(e => e.d))), gap: Math.round(Math.max(0, ...P.gaps.filter(inside).map(e => e.d))), tasks: P.long.filter(inside).filter(e => e.d > 50).length }; })()`);
const drawnOf = (st, id) => st.details?.find(d => d.id === id) || null;

for (const [name, f] of Object.entries(FIELDS)) {
  await group(`${name}: the details of the land from OpenStreetMap's own shapes`, async () => {
    await size(1280);
    await go('/');
    await setAnswers(f);
    await open3d(f);
    const gl0 = await js('window.__3d.pageGl'), limit = limitNow();
    const t0 = await now();
    const ids = ['buildings', 'roads', 'water', 'hedges', 'fences', 'power', 'things'];
    for (const id of ids) await flip(id);
    await settled(ids).catch(async () => console.log('e2e_land3d: not settled, the layers say:', JSON.stringify((await land()).layers.map(x => [x.id, x.state, x.words[0]]))), console.log('e2e_land3d: the worker failed:', JSON.stringify(await js('window.__3d.fails || null'))), console.log('e2e_land3d: the worker asked:', JSON.stringify(await js('window.__3d.asked')), 'workers', await js('window.__3d.workers'), 'choice', await js("localStorage.getItem('crophalo.farm3d.land')"), 'answers', await js('Object.keys(window.__answers || {})')));
    await sleep(1200);
    const t1 = await now(), l = await land(), st = await stats();
    const rec = f.osm, recx = f.osmx;
    const by = id => l.layers.find(x => x.id === id);
    const ready = ids.filter(id => by(id)?.state === 'ready');
    check(`${name}: the seven switches that come from OpenStreetMap are read and answer (${ready.length} of 7 ready)`, ready.length === 7, l.layers.map(x => [x.id, x.state]));
    check(`${name}: the lookups were asked once each for this block, and not again (${JSON.stringify((await js('window.__3d.asked')).map(u => u.split('/api/')[1].split('?')[0]))})`, (await js('window.__3d.asked')).length === 2, await js('window.__3d.asked'));
    // what the recorded answer holds, inside this block, against what was drawn
    const inside = (list, n) => list.length;
    if (name === 'mead') {
      same('mead: two buildings and the six roads inside the block (13 are mapped in the recorded 1400 m box) are drawn', [drawnOf(st, 'buildings')?.drawn, drawnOf(st, 'roads')?.drawn], [2, 6]);
      check('mead: nothing is mapped for water, hedges, power lines and silos, and the words say exactly that, never an invented object', /No streams, ditches or ponds are mapped/.test(by('water').words.join(' ')) && /No hedges, tree rows or woods are mapped/.test(by('hedges').words.join(' ')) && /No power lines or poles are mapped/.test(by('power').words.join(' ')) && /No silos, tanks, towers, windmills or wells are mapped/.test(by('things').words.join(' ')), l.layers.map(x => x.words[0]));
      check('mead: the one mapped fence lies 650 m or more north of the block (computed from the recording), so none is drawn and the words say so', (drawnOf(st, 'fences')?.drawn || 0) === 0 && /No fences, walls or gates are mapped/.test(by('fences').words.join(' ')), [drawnOf(st, 'fences'), by('fences').words]);
    }
    if (name === 'beltsville') {
      same('beltsville: its buildings, fences and gates, power lines and poles are drawn as mapped', [drawnOf(st, 'buildings')?.drawn, drawnOf(st, 'fences')?.drawn, drawnOf(st, 'power')?.drawn], [by('buildings').state === 'ready' ? drawnOf(st, 'buildings')?.of : -1, 2 + 7, 3 + 9]);
      check('beltsville: hedges and woods and water are drawn from what is mapped', (drawnOf(st, 'hedges')?.drawn || 0) > 0 && (drawnOf(st, 'water')?.drawn || 0) > 0, st.details);
    }
    if (name === 'oxford') {
      check('oxford: a town: the buildings and roads are capped for the picture (1,500 each on a computer) and the words say what was drawn', (drawnOf(st, 'buildings')?.drawn || 0) > 100 && (drawnOf(st, 'buildings')?.drawn || 0) <= 1500 && (drawnOf(st, 'roads')?.drawn || 0) > 50, st.details);
      check('oxford: the second lookup has nothing for this land and says so (nothing is invented)', /No fences, walls or gates are mapped/.test(by('fences').words.join(' ')), by('fences').words);
    }
    check(`${name}: within the triangle budget of the device and still the one shader program`, st.triangles <= st.budget.triangles && st.programs <= 1, [st.triangles, st.budget.triangles, st.programs]);
    same(`${name}: the page made no WebGL context of its own, and one worker draws`, [await js('window.__3d.pageGl') - gl0, await js('window.__3d.alive')], [0, 1]);
    const b = await busy(t0, t1);
    console.log(`e2e_land3d: ${name}: switching seven details on: longest task ${b.task} ms, longest frame ${b.frame} ms, longest heartbeat gap ${b.gap} ms, ${b.tasks} task(s) over 50 ms; triangles ${st.triangles} of ${st.budget.triangles} (${at()})`);
    check(`${name}: no main-thread task over ${limit} ms while the details came in (longest ${b.task} ms, ${at()})`, b.task <= limit, b);
    check(`${name}: the page never stops for ${limit * 2} ms or more (heartbeat gap ${b.gap} ms)`, b.gap < limit * 2, b);
    check(`${name}: OpenStreetMap's credit is on the page, linked, because its shapes are drawn`, await js(`(() => { const a = document.querySelector('#fw3d .f3d-land-credit:not([hidden]) a'); return !!a && a.textContent === '\\u00A9 OpenStreetMap contributors' && a.href === 'https://www.openstreetmap.org/copyright' && a.rel.includes('noopener'); })()`) === (st.details.some(d => d.drawn > 0)), [st.details.map(d => [d.id, d.drawn]), l.credit]);
    check(`${name}: the camera still works with the details on`, await js(`(async () => { const v = ${view()}, a = v.camera(); document.querySelector('#fw3d [data-act="left"]').click(); await new Promise(r => setTimeout(r, 300)); const c = v.camera(); return JSON.stringify(a.position) !== JSON.stringify(c.position); })()`));
    await shot(`3d-land-${name}-1280.png`);
    // switching off takes the shapes and the credit away
    const t2 = await now();
    for (const id of ids) await flip(id, false);
    await sleep(900);
    const st2 = await stats(), b2 = await busy(t2, await now());
    check(`${name}: with every detail switched off nothing of it is drawn and the credit is gone`, (st2.details || []).length === 0 && await js(`!!document.querySelector('#fw3d .f3d-land-credit')?.hidden`), st2.details);
    check(`${name}: switching off is quick too (longest task ${b2.task} ms, ${at()})`, b2.task <= limit, b2);
    same(`${name}: the shaders were not compiled again`, st2.programs, st.programs);
  });
}

await group('failure: no map service answers', async () => {
  await size(1280);
  await setAnswers(FIELDS.mead, BUSY);
  await open3d(FIELDS.mead);
  const limit = limitNow(), t0 = await now();
  for (const id of ['buildings', 'roads', 'fences']) await flip(id);
  await settled(['buildings', 'roads', 'fences']);
  await sleep(800);
  const l = await land(), st = await stats(), b = await busy(t0, await now());
  check('failure: each switch says plainly that OpenStreetMap could not be read right now, and draws nothing', ['buildings', 'roads', 'fences'].every(id => { const x = l.layers.find(y => y.id === id); return x.state === 'cannot' && /could not be read right now/.test(x.words.join(' ')) && /Nothing is drawn/.test(x.words.join(' ')); }), l.layers.map(x => [x.id, x.state, x.words[0]]));
  check('failure: the words are on the page beside each switch', await js(`['buildings', 'roads', 'fences'].every(id => /could not be read right now/.test(document.querySelector('[data-land-words="' + id + '"]').textContent))`));
  check('failure: no credit is shown, because nothing of OpenStreetMap is drawn', await js(`!!document.querySelector('#fw3d .f3d-land-credit')?.hidden`) && (st.details || []).length === 0);
  check('failure: the view stays usable (the camera answers, the picture is still there)', st.drawn > 0.05 && await js(`(async () => { const v = ${view()}, a = v.camera(); document.querySelector('#fw3d [data-act="in"]').click(); await new Promise(r => setTimeout(r, 300)); return JSON.stringify(a.position) !== JSON.stringify(v.camera().position); })()`));
  check(`failure: no long task (longest ${b.task} ms, ${at()})`, b.task <= limit, b);
});
await finish();
