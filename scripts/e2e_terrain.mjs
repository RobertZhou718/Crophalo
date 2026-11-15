// Crophalo's real-browser suite for the Terrain analysis group of the setup map (js/terrain-layers.js): the panel group, each layer on and off with its legend words, the module worker used and each height tile fetched once, no long task on the page,
// the page working in small steps when no worker starts, Sun and shade's date, hour and "Play the day", the honest "no heights here", the fit at 320 and 1280 px and axe. The height tiles come from a stand-in for the Terrain Tiles bucket on this
// computer that serves the tiles recorded in scripts/fixtures/terrain with their real source header; SoilGrids is the answer recorded for the demo pin. RULE: never loosen a check here without a written farming reason beside it. Run: node scripts/e2e_terrain.mjs
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { recorded, BARRIE, soilAnswer } from './terrain_fixtures.mjs';

// ---- the stand-in bucket: the recorded tiles, the headers the bucket sends, and a count of every request
const hits = new Map(), failing = { on: false };
const bucket = http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET', 'access-control-expose-headers': 'x-amz-meta-x-imagery-sources' };
  const m = /^\/terrarium\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(req.url ?? '');
  if (!m) { res.writeHead(404, cors); return res.end(); }
  const key = `${m[1]}/${m[2]}/${m[3]}`, t = recorded(+m[1], +m[2], +m[3]);
  hits.set(key, (hits.get(key) ?? 0) + 1);
  if (failing.on) { res.writeHead(500, cors); return res.end(); }
  if (!t) { res.writeHead(404, cors); return res.end(); }
  res.writeHead(200, { ...cors, 'content-type': 'image/png', 'content-length': t.bytes.length, 'x-amz-meta-x-imagery-sources': t.sources });
  res.end(t.bytes);
});
await new Promise(done => bucket.listen(+(process.env.TERRAIN_BUCKET_PORT || 0), '127.0.0.1', done));
const BUCKET = `127.0.0.1:${bucket.address().port}`;
process.env.E2E_LIVE_HOSTS = [process.env.E2E_LIVE_HOSTS, BUCKET].filter(Boolean).join(',');   // the one outside host the harness lets through: this stand-in on this computer, never the real bucket
process.on('exit', () => bucket.close());
const { openRun } = await import('./e2e_lib.mjs');

const run = await openRun('e2e_terrain');
const { ROOT, js, until, seen, size, go, flat, check, same, group, finish, sleep, shot, send } = run;   // shot(): pictures only when E2E_SHOTS names a folder outside the project
// The copy under test has no Python, so the server's own lookups cannot answer there: the early lookups a chosen place starts are answered "not read" at the page, so the copy's refusals are not logged as errors of the page.
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, ...rest) => /[/]api[/](smaproot|cropsnear|imergrain|gracecell|ecopass|hlsndvi|dem|ndvihist)[?]/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify({ ok: false, reason: 'not in this copy' }), { headers: { 'content-type': 'application/json' } })) : first(u, ...rest); })();" });
const IDS = ['slope', 'erosion', 'frost', 'sunshade', 'relief'];
const NOW = Date.UTC(2026, 10, 14, 15, 0);   // 10:00 at the field (Toronto time): the sun is up in the south-east
const RAIN = { mfi: 52.5, yearly: 623, years: 25, first: 2001, last: 2025, source: 'merra2' };   // NASA POWER's own rain climatology at the demo pin (MERRA-2 model rain, 2001 to 2025), as read for the map's research
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
const mapReady = async () => { await acceptWelcome(); await go('/'); await until(`document.querySelector('#view-home') && !document.querySelector('#view-home').hidden`); await until(`[...document.querySelectorAll('button')].some(b => /Find it on the map/.test(b.textContent))`);
  await js(`[...document.querySelectorAll('button')].find(b => /Find it on the map/.test(b.textContent)).click()`); await until(`document.querySelector('#mapx') && !document.querySelector('#view-setup').hidden`); await sleep(300); };
const standIns = ({ worker = true, fresh = false, soil = 'answer' } = {}) => js(`import('/js/terrain-layers.js').then(async m => {
  const t = await import('/js/terrain-math.js'), answer = ${JSON.stringify(soilAnswer())};
  m.terrainNet.template = 'http://${BUCKET}/terrarium/{z}/{x}/{y}.png';
  m.terrainNet.soil = async () => { if (${JSON.stringify(soil)} === 'none') throw Object.assign(new Error('no soil'), { why: 'nosoil' }); return t.soilFromSoilGrids(answer); };
  m.terrainNet.rain = async () => (${JSON.stringify(RAIN)});
  m.terrainNet.clock = async () => ({ zone: 'America/Toronto' });
  m.terrainNet.now = () => ${NOW};
  m.terrainNet.worker = ${worker};
  m.PLAY_DAY.holdMs = 150; m.PLAY_DAY.holdLessMs = 120;
  if (${fresh}) m.resetTerrainEngine();
  return 1; })`);
const view = (lat, lon, z) => js(`import('/js/mapbase.js').then(m => { m.baseNow().leaflet().setView([${lat}, ${lon}], ${z}, { animate: false }); return 1; })`);
async function demo(zoom = 14, opts = {}) {
  await mapReady(); await standIns(opts);
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: ${BARRIE.lat}, lon: ${BARRIE.lon}, name: 'Demo field', country: 'CA' } }))`); await sleep(400);
  await view(BARRIE.lat, BARRIE.lon, zoom); await sleep(300);
}
const fullMap = () => js(`(() => { if (!document.querySelector('#mapx').classList.contains('full')) document.querySelector('[data-view=full]').click(); return 1; })()`);   // a phone shows the map as a strip in the setup; the full-screen map is where its layers are read
const onScreen = sel => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || e.offsetParent === null) return false; const r = e.getBoundingClientRect(), m = document.querySelector('#mapx').getBoundingClientRect(); return r.width > 100 && r.height > 40 && r.left >= m.left - 1 && r.right <= m.right + 1; })()`);
const openLayers = async () => { if (!(await js(`!!document.querySelector('.mapx-panel')`))) { await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('#mapxTerrainRows .mapx-lrow')`); } };
const closePanel = () => js(`document.querySelector('.mapx-panel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`);
async function turn(id) { await openLayers(); await js(`document.querySelector('[data-layer=${id}]').click()`); await until(`document.querySelector('[data-legend=${id}]')`); }
const settled = id => `import('/js/terrain-layers.js').then(m => { const e = m.terrainCtl()?.entry('${id}'); if (!e) return false; const t = [...e.live.values()]; return t.length > 0 && t.every(x => x.state !== 'busy') && t.some(x => x.state === 'ok'); })`;
const drawnPixels = id => js(`import('/js/terrain-layers.js').then(m => { const e = m.terrainCtl()?.entry('${id}'); if (!e) return -1; let n = 0; for (const t of e.live.values()) { if (t.state !== 'ok') continue; const d = t.canvas.getContext('2d').getImageData(0, 0, 256, 256).data; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; } return n; })`);
const legend = id => js(`document.querySelector('[data-legend=${id}]')?.innerText.replace(/\\n+/g, ' | ') ?? ''`);
const line = (id, attr) => js(`document.querySelector('[data-legend=${id}] [${attr}]')?.textContent ?? ''`);
const engineNow = () => js(`import('/js/terrain-layers.js').then(m => m.terrainEngine())`);

await group('panel', async () => {
  await demo();
  await openLayers();
  same('the Layers panel holds two groups: NASA data, then Terrain analysis', await js(`[...document.querySelectorAll('.mapx-panel .mapx-lset legend')].map(l => l.textContent)`), ['NASA data', 'Terrain analysis']);
  same('Terrain analysis lists the five layers in the owner\'s order, each with its sub-line', await js(`[...document.querySelectorAll('#mapxTerrainRows .mapx-lrow')].map(r => r.querySelector('b').textContent + ': ' + r.querySelector('.cap').textContent)`),
    ['Slope: How steep the ground is.', 'Erosion exposure: Where rain could wash soil away.', 'Frost pockets: Low spots where frost comes first.', 'Sun and shade: Where hills cast shadows.', 'Relief shading: The shape of the land.']);
  check('the group says where its heights come from, and that Crophalo computes the layers', /^From the land.s height: SRTM or a finer national map\.$/.test(await js(`document.querySelector('.tl-setnote').textContent`)));
  check('every terrain row is at least 44 px each way and none is greyed (nothing is fetched just to open the panel)', await js(`[...document.querySelectorAll('#mapxTerrainRows .mapx-lrow')].every(r => { const b = r.getBoundingClientRect(); return b.width >= 43.5 && b.height >= 43.5 && !r.querySelector('input').disabled; })`));
  same('opening the panel asked the bucket for nothing', hits.size, 0);
  check('the six NASA rows are still there, first', await js(`document.querySelectorAll('#mapxLayerRows .mapx-lrow').length === 6`));
});

const EXPECT = {
  slope: { here: /^Slope here: (under 2 % \(flat to very gently sloping\)|\d+ % \(about \d+°\), [a-z ]+)$/, keys: 6, words: [/under 2 % \(0 to 1\.1°\): flat to very gently sloping, not coloured/, /2 to 5 % \(1\.1 to 2\.9°\): gently sloping/, /over 30 % \(over 16\.7°\): steep/] },
  erosion: { here: /^Erosion exposure here: (low|moderate|high|very high) \((under 0\.1|\d\.\d); slope (under 2|\d+) %\)$/, keys: 4, words: [/low: under 0\.25, not coloured/, /very high: over 1/, /1 is a 9 % slope of loam under moderate rain/] },
  frost: { here: /^This spot is /, keys: 2, words: [/cold air may settle: 2 m or more below the ground within 300 m/, /cold air settles more: 5 m or more below/, /Not a temperature measurement or a forecast/] },
  sunshade: { here: /^Sun here: (in the shade of higher ground|in the sun|on ground turned away from the sun) at 10:00\.$/, keys: 2, words: [/In the shade of the hills/, /trees, buildings and clouds are not included/] },
  relief: { here: /^Height here: \d+ m · CDEM, whole metres$/, keys: 0, words: [/Darker: ground turned away from the north-west light/] },
};
await group('layers', async () => {
  await demo(14);
  for (const id of IDS) {
    hits.clear();
    await turn(id);
    const ok = await seen(settled(id), 45e3);
    check(`${id}: its tiles are worked out and drawn`, ok && (await drawnPixels(id)) > 0, [ok, await drawnPixels(id)]);
    await until(`!/reading/.test(document.querySelector('[data-there=${id}]').textContent)`, 20e3).catch(() => {});
    await sleep(400);   // the legend's lines follow the tiles a moment later
    await closePanel(); await sleep(200); await shot(`terrain-${id}-1280.png`);
    const text = await legend(id), x = EXPECT[id];
    check(`${id}: the legend names the real source: computed by Crophalo from CDEM heights`, (await line(id, 'data-tfrom')) === 'computed by Crophalo from CDEM heights', await line(id, 'data-tfrom'));
    check(`${id}: the grid is the demo field's own (27 m), and the whole metres are said`, (await line(id, 'data-tgrid')) === '27 m grid · heights in whole metres, smoothed over about 80 m', await line(id, 'data-tgrid'));
    const credit = await line(id, 'data-tcredit');
    check(`${id}: the credit carries the source, its span, its licence words and the tiles`, /Canadian Digital Elevation Model \(Natural Resources Canada\)/.test(credit) && /maps and surveys from 1945 to 2011/.test(credit) && /Contains information licensed under the Open Government Licence – Canada/.test(credit) && /Terrain Tiles \(Tilezen, AWS Open Data\), built in 2017/.test(credit), credit);
    check(`${id}: there is an "i" for the source, and its note says what was computed from what`, await js(`(() => { const b = document.querySelector('[data-legend=${id}] .srci'); return !!b && /Tilezen|Terrain Tiles/.test(b.getAttribute('aria-label')) && /computed by Crophalo from CDEM heights on a 27 m grid/.test(b.dataset.note); })()`));
    const here = await line(id, 'data-there');
    check(`${id}: the value at the pin is read from the heights and said plainly`, x.here.test(here), here);
    same(`${id}: the legend lists its classes in words`, await js(`document.querySelectorAll('[data-legend=${id}] .tl-keys li').length`), x.keys);
    for (const w of x.words) check(`${id}: the legend says "${w.source.slice(0, 50)}"`, w.test(text), text);
    check(`${id}: nothing is said to be missing`, (await line(id, 'data-tnote')) === '', await line(id, 'data-tnote'));
    same(`${id}: the Layers button names it`, await js(`document.querySelector('[data-panel=layers] .mapx-w').textContent`), ({ slope: 'Slope', erosion: 'Erosion exposure', frost: 'Frost pockets', sunshade: 'Sun and shade', relief: 'Relief shading' })[id]);
    check(`${id}: drawn under the place names (z-index 4 or less over the satellite picture)`, await js(`import('/js/terrain-layers.js').then(m => +m.terrainCtl().layerOf('${id}').getContainer().style.zIndex <= 4)`));
    await js(`document.querySelector('[data-legend=${id}] [data-off]').click()`);
    check(`${id}: the × turns it off: its legend and its tiles go`, await js(`!document.querySelector('[data-legend=${id}]') && !document.querySelector('.tl-layer') && document.querySelector('[data-panel=layers] .mapx-w').textContent === 'Layers'`));
  }
  const erosionText = await (async () => { await turn('erosion'); await until(`/Soil at your pin/.test(document.querySelector('[data-tinputs]').textContent)`, 20e3); return line('erosion', 'data-tinputs'); })();
  check('Erosion exposure names the soil and the rain it read at the pin, with their sources and licence', /^Soil at your pin: loam \(sand 52 %, silt 35 %, clay 13 %, organic carbon 4\.3 %\), erodibility 0\.9 × loam · ISRIC SoilGrids, 250 m, CC BY 4\.0\. Rain: Modified Fournier Index 53 mm \(623 mm a year\) from NASA’s MERRA-2 weather model, whole years 2001 to 2025 · NASA POWER\.$/.test(erosionText), erosionText);
  check('its "i" card holds Terrain Tiles, SoilGrids and the rain record', await js(`(() => { const k = document.querySelector('[data-legend=erosion] .srci').dataset.src; return k.includes('terrain') && k.includes('soilgrids') && k.includes('merra2'); })()`));
  await turn('slope'); await until(settled('slope'), 45e3);
  same('two terrain layers on: the button says so, and the one turned on last is on top', await js(`import('/js/terrain-layers.js').then(m => [document.querySelector('[data-panel=layers] .mapx-w').textContent, +m.terrainCtl().layerOf('slope').getContainer().style.zIndex >= +m.terrainCtl().layerOf('erosion').getContainer().style.zIndex])`), ['2 layers', true]);
  await js(`document.querySelector('[data-alloff]').click()`);
  check('"Turn all overlays off" takes the terrain layers off too', await js(`!document.querySelector('.tl-legend') && !document.querySelector('.tl-layer')`));
  // the "i" card opens with the full credits of the height maps
  await turn('relief'); await until(settled('relief'), 45e3); await closePanel(); await sleep(200);
  await js(`document.querySelector('[data-legend=relief] .srci').click()`); await until(`document.querySelector('#srcPop') && !document.querySelector('#srcPop').hidden`);
  const cardText = await js(`document.querySelector('#srcPop').innerText`);
  check('the "i" card: Terrain Tiles, run by Tilezen, with the credits the height maps ask for', /Terrain Tiles land heights/.test(cardText) && /Tilezen/.test(cardText) && /Canada terrain data contains information licensed under the Open Government Licence – Canada/.test(await js(`document.querySelector('#srcPop').textContent`)) && /United States 3DEP \(formerly NED\) and global GMTED2010 and SRTM terrain data courtesy of the U\.S\. Geological Survey/.test(await js(`document.querySelector('#srcPop').textContent`)), cardText.slice(0, 300));
  // the card names the formula, not a company: Esri left the credits when no screen asked it any more
  check('and "For this figure" says how the shading was computed', /Relief shading computed by Crophalo from CDEM heights on a 27 m grid\. Relief shading by the standard hillshade formula/.test(cardText), cardText.slice(0, 400));
});

await group('worker', async () => {
  await demo(14);
  hits.clear();
  for (const id of IDS) await turn(id);
  for (const id of IDS) await until(settled(id), 60e3).catch(() => {});
  const e = await engineNow();
  same('the work is done by the module worker', e.kind, 'worker');
  check('the page asked for the worker script', run.asked.some(u => /\/js\/terrain-worker\.js$/.test(u)), run.asked.filter(u => /terrain/.test(u)));
  check('five layers over one view: every height tile was fetched once, and only once', hits.size > 0 && [...hits.values()].every(n => n === 1), Object.fromEntries(hits));
  check('only the tiles under the view and one ring round it were asked for (at most a 5 × 5 block at zoom 12)', [...hits.keys()].every(k => /^12\//.test(k)) && hits.size <= 25, [...hits.keys()]);
  check('the worker itself worked out the tiles and keeps what it decoded (its own count, sent from the worker)', e.counts.kept === hits.size && e.counts.computed >= 5, e.counts);
});

// the long tasks: watched with the Long Tasks and Long Animation Frames timings while the layers are worked out and the hour changes; the view does not move meanwhile
const watchTasks = () => js(`(() => { window.__long = []; window.__loaf = []; new PerformanceObserver(l => window.__long.push(...l.getEntries().map(e => Math.round(e.duration)))).observe({ type: 'longtask' });
  try { new PerformanceObserver(l => window.__loaf.push(...l.getEntries().map(e => ({ d: Math.round(e.duration), s: (e.scripts || []).map(s => ({ u: String(s.sourceURL || ''), f: String(s.sourceFunctionName || ''), d: Math.round(s.duration) })) })))).observe({ type: 'long-animation-frame' }); } catch { /* an older engine */ } return 1; })()`);
const tasksNow = () => js(`({ long: window.__long, loaf: window.__loaf })`);
const terrainScriptLong = loaf => loaf.filter(f => f.s.some(s => /terrain-(layers|jobs|math|worker)\.js/.test(s.u) && s.d > 50));
// One window of work, watched with the Long Tasks and Long Animation Frames timings: the five layers turned on and worked out over one view, then the hour of Sun and shade changed twice; the view does not move meanwhile.
async function workWindow() {
  await watchTasks();
  for (const id of IDS) await turn(id);
  for (const id of IDS) await until(settled(id), 90e3).catch(() => {});
  await closePanel();
  for (const h of [9, 14]) { await js(`{ const r = document.querySelector('[data-thour]'); r.value = '${h}'; r.dispatchEvent(new Event('input', { bubbles: true })); }`); await sleep(400); await until(settled('sunshade'), 60e3).catch(() => {}); }
  await sleep(300);
  const t = await tasksNow();
  return { long: t.long, terrain: terrainScriptLong(t.loaf), engine: await engineNow() };
}
// This computer is shared with other programs, which can stop the page for tens of milliseconds at any moment (seen here with nothing at all to do). A window with a long task is therefore tried again on a fresh page,
// up to three times: a real long task of the terrain code comes back every time, a pause of the computer does not. Every try is printed; the processor time of each step is also judged in scripts/test_terrain.mjs.
async function tries(label, opts) {
  const seenTries = [];
  for (let n = 0; n < 3; n++) {
    await demo(14, opts);
    const w = await workWindow(); seenTries.push(w);
    if (!w.long.some(d => d > 60) && !w.terrain.length) break;
  }
  console.log(`NOTE  ${label}: long tasks in each try (ms): ${seenTries.map(w => JSON.stringify(w.long)).join(' then ')}`);
  return seenTries;
}
await group('longTasks', async () => {
  const all = await tries('worker', {}), last = all.at(-1);
  check('worker: no task on the page ran terrain code for more than 50 ms', last.terrain.length === 0, last.terrain.slice(0, 3));
  check('worker: no task on the page was longer than about 50 ms while the five layers were worked out and the hour changed twice', last.long.every(d => d <= 60), all.map(w => w.long));
  same('worker: the work was done by the module worker', last.engine.kind, 'worker');
});
// Without a worker the page itself computes, and every stretch of it can be stretched by a crowded computer: a wall-clock limit that is missed while the computer is crowded (its own load, as the system reports it) is reported, not judged; one that is met counts.
const crowded = () => os.loadavg()[0] / os.cpus().length > 1.5;
await group('pageSteps', async () => {
  const busyBefore = crowded(), all = await tries('no worker', { worker: false, fresh: true }), last = all.at(-1), e = last.engine, busy = busyBefore || crowded();
  same('without a worker the page does the work itself', e.kind, 'page');
  check('in small steps: the work was cut into thousands of short pieces with a pause for the page between stretches', e.counts.steps > 2000, e.counts.steps);
  const timed = (name, ok, detail) => (ok || !busy ? check(name, ok, detail) : console.log(`NOTE  no worker: the computer was crowded (load ${os.loadavg().map(v => v.toFixed(0)).join(', ')} on ${os.cpus().length} cores), so this was reported, not judged: ${name}  ${JSON.stringify(detail).slice(0, 240)}`));
  timed('no task on the page ran terrain code for more than 50 ms', last.terrain.length === 0, last.terrain.slice(0, 3));
  timed('no task on the page was longer than about 50 ms while the page itself worked the five layers out', last.long.every(d => d <= 60), all.map(w => w.long));
  timed('no single step of the page\'s own computing ran 50 ms', e.counts.longestStepMs < 50, { longest: e.counts.longestStepMs, slowest: e.counts.slowest });
  check('and the layers are still drawn', (await drawnPixels('slope')) > 0 && (await drawnPixels('sunshade')) > 0);
  check('the page\'s own engine worked out the tiles', e.counts.computed >= 5, e.counts);
});

await group('sun', async () => {
  await demo(14);
  await turn('sunshade'); await until(settled('sunshade'), 60e3); await closePanel();
  same('the clock is the field\'s own and said', await line('sunshade', 'data-tclock'), 'Times are local time at the field.');
  same('the date starts at today on the field\'s clock, the hour at the hour now', await js(`[document.querySelector('[data-tdate]').value, document.querySelector('[data-thour]').value]`), ['2026-11-14', '10']);
  same('the sun is worked out for the hour itself on the field\'s clock (10:00 Toronto time is 15:00 UTC), not seconds before it', await js(`import('/js/terrain-layers.js').then(m => m.terrainCtl().sunNow().ms)`), Date.UTC(2026, 10, 14, 15, 0));
  check('the hour runs from the first to the last whole hour of daylight', await js(`(() => { const r = document.querySelector('[data-thour]'); return +r.min >= 7 && +r.min <= 8 && +r.max >= 16 && +r.max <= 17; })()`), await js(`[document.querySelector('[data-thour]').min, document.querySelector('[data-thour]').max]`));
  check('the sun\'s place is said: up in the south-east at 10:00', /^14 Nov, 10:00: the sun is \d+° up in the south-east\.$/.test(await line('sunshade', 'data-tsunpos')), await line('sunshade', 'data-tsunpos'));
  await until(`/^Direct sun here/.test(document.querySelector('[data-tday]').textContent)`, 30e3).catch(() => {});
  check('the day at the pin: hours of direct sun of the daylight, hills only', /^Direct sun here: about (\d+ h( \d+ min)?|\d+ min) of the 9 h( \d+ min)? of daylight \(hills only\)$/.test(await line('sunshade', 'data-tday')), await line('sunshade', 'data-tday'));
  const pixels = () => js(`import('/js/terrain-layers.js').then(m => { const e = m.terrainCtl().entry('sunshade'); let s = 0; for (const t of e.live.values()) { const d = t.canvas.getContext('2d').getImageData(0, 0, 256, 256).data; for (let i = 3; i < d.length; i += 4) s += d[i]; } return s; })`);
  const at10 = await pixels();
  await js(`{ const r = document.querySelector('[data-thour]'); r.value = '16'; r.dispatchEvent(new Event('input', { bubbles: true })); }`); await sleep(500); await until(settled('sunshade'), 60e3);
  const at16 = await pixels();
  check('a later hour works the shadows out again: the low afternoon sun in the south-west shades more ground', at16 !== at10 && at16 > at10, [at10, at16]);
  check('the words follow: 16:00, the sun in the south-west', /^14 Nov, 16:00: the sun is \d+° up in the south-west\.$/.test(await line('sunshade', 'data-tsunpos')), await line('sunshade', 'data-tsunpos'));
  await js(`{ const d = document.querySelector('[data-tdate]'); d.value = '2026-12-21'; d.dispatchEvent(new Event('change', { bubbles: true })); }`); await sleep(500);
  check('a winter date gives a shorter day on the hour slider', await js(`+document.querySelector('[data-thour]').max <= 16`), await js(`document.querySelector('[data-thour]').max`));
  // Play the day: Full plays by itself and stops on the last hour; Pause stops it; Still never plays by itself
  await js(`document.documentElement.dataset.motion = ''`);
  await js(`document.querySelector('[data-tplay]').click()`);
  check('Play the day starts and the button offers Pause', await seen(`document.querySelector('[data-tplay]').textContent === 'Pause'`, 3000));
  const hours = new Set(); const end = Date.now() + 120e3;
  while (Date.now() < end && await js(`import('/js/terrain-layers.js').then(m => m.terrainCtl().playing())`)) { hours.add(await js(`document.querySelector('[data-thour]').value`)); await sleep(150); }
  check('it steps through the day hour by hour and stops by itself on the last hour', hours.size >= 4 && (await js(`document.querySelector('[data-tplay]').textContent`)) === 'Play the day' && (await js(`document.querySelector('[data-thour]').value === document.querySelector('[data-thour]').max`)), [...hours]);
  await js(`document.querySelector('[data-tplay]').click()`); await sleep(300); await js(`document.querySelector('[data-tplay]').click()`); await sleep(100);
  check('Pause stops it where it is', !(await js(`import('/js/terrain-layers.js').then(m => m.terrainCtl().playing())`)) && (await js(`document.querySelector('[data-tplay]').textContent`)) === 'Play the day');
  await js(`document.documentElement.dataset.motion = 'reduce'; import('/js/terrain-layers.js').then(m => m.terrainCtl().stopPlay())`); await sleep(200);
  await js(`{ const r = document.querySelector('[data-thour]'); r.value = '12'; r.dispatchEvent(new Event('input', { bubbles: true })); }`); await sleep(400);
  check('under Still nothing plays by itself: the button is off and says why', await js(`(() => { const b = document.querySelector('[data-tplay]'); return b.disabled && /Still/.test(b.title); })()`));
  await js(`document.documentElement.dataset.motion = ''`);
  // zoomed out: sun and shade waits for a closer view, and says so
  await view(BARRIE.lat, BARRIE.lon, 10); await sleep(800);
  same('at zoom 10 sun and shade is not drawn and says to zoom in', [await line('sunshade', 'data-tnote'), await js(`!document.querySelector('.tl-layer')`)], ['Zoom in to see sun and shade: from this far out the shadows of the hills are too small to draw.', true]);
  await view(BARRIE.lat, BARRIE.lon, 14); await sleep(800); await until(settled('sunshade'), 60e3);
  check('zoomed back in, it is drawn again', (await drawnPixels('sunshade')) > 0);
});

await group('zoomAndNoData', async () => {
  await demo(14);
  await turn('slope'); await turn('frost'); await until(settled('slope'), 45e3); await until(settled('frost'), 45e3); await closePanel();
  await view(BARRIE.lat, BARRIE.lon, 8); await sleep(900);
  same('zoomed far out: slope says "Zoom in to see slope" and draws nothing', [await line('slope', 'data-tnote'), await js(`!document.querySelector('.tl-layer')`)], ['Zoom in to see slope.', true]);
  same('frost pockets too, with the reason', await line('frost', 'data-tnote'), 'Zoom in to see frost pockets: they are smaller than this map’s squares.');
  same('the value at the pin waits as well', await line('slope', 'data-there'), 'Slope here: zoom in to read it');
  await view(BARRIE.lat, BARRIE.lon, 10); await sleep(400);
  await until(`import('/js/terrain-layers.js').then(m => { const e = m.terrainCtl().entry('slope'); return e.live.size > 0 && [...e.live.values()].every(t => t.state !== 'busy'); })`, 45e3).catch(() => {});
  await until(`!/Working it out/.test(document.querySelector('[data-legend=slope] [data-tnote]').textContent)`, 10e3).catch(() => {});
  check('at zoom 10 slope is worked out on the coarser zoom-10 grid, and where the bucket has no tile it says so honestly', /^No heights here: Terrain Tiles has no tile for this place\.$|^No heights for part of the map/.test(await line('slope', 'data-tnote')) && /^110 m grid · .*; zoom in for the 27 m grid$/.test(await line('slope', 'data-tgrid')), [await line('slope', 'data-tnote'), await line('slope', 'data-tgrid')]);
  // the bucket stops answering: said in words, and "Try again" brings the heights back
  await mapReady(); await standIns({ fresh: true });
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: ${BARRIE.lat}, lon: ${BARRIE.lon}, name: 'Demo field', country: 'CA' } }))`); await sleep(400); await view(BARRIE.lat, BARRIE.lon, 14);
  failing.on = true;
  await turn('relief');
  await until(`/did not load/.test(document.querySelector('[data-legend=relief] [data-tnote]').textContent)`, 60e3).catch(() => {});
  same('with the height tiles not loading, the legend says so and offers Try again', [await line('relief', 'data-tnote'), await js(`!document.querySelector('[data-tretry=relief]').hidden`)], ['No heights here: the height tiles did not load. Try again.', true]);
  same('and the value at the pin says why there is none', await line('relief', 'data-there'), 'No value for your pin: the height tiles did not load.');
  failing.on = false;
  await js(`document.querySelector('[data-tretry=relief]').click()`);
  const back = await seen(settled('relief'), 60e3); await sleep(400);
  check('"Try again" asks for the tiles once more, and the shading is drawn', back && (await drawnPixels('relief')) > 0 && (await line('relief', 'data-tnote')) === '', [back, await drawnPixels('relief'), await line('relief', 'data-tnote'), await js(`import('/js/terrain-layers.js').then(m => [...m.terrainCtl().entry('relief').live.values()].map(t => t.state).join())`)]);
});

await group('erosionInputs', async () => {
  await mapReady(); await standIns();
  await view(BARRIE.lat, BARRIE.lon, 14); await sleep(300);
  await turn('erosion'); await sleep(600);
  same('without a pin, erosion exposure asks for one and draws nothing', [await line('erosion', 'data-tinputs'), await js(`!document.querySelector('.tl-layer')`)], ['Drop a pin to read your field’s soil and rain.', true]);
  await standIns({ soil: 'none' });
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: ${BARRIE.lat}, lon: ${BARRIE.lon}, name: 'Demo field', country: 'CA' } }))`); await sleep(400); await view(BARRIE.lat, BARRIE.lon, 14);
  await until(`/SoilGrids/.test(document.querySelector('[data-tinputs]').textContent)`, 20e3).catch(() => {});
  same('where SoilGrids has no soil, it says so and draws nothing (never slope alone under this name)', [await line('erosion', 'data-tinputs'), await js(`!document.querySelector('.tl-layer')`)], ['SoilGrids has no soil at your pin (water, a town or rock), so erosion exposure is not drawn.', true]);
});

await group('reliefAndMotion', async () => {
  await demo(14);
  const watchReveal = () => js(`(() => { window.__revealed = false; window.__ro?.disconnect(); window.__ro = new MutationObserver(() => { if (document.querySelector('.tl-layer.mapx-reveal')) window.__revealed = true; }); window.__ro.observe(document.querySelector('#mapx'), { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] }); return 1; })()`);
  await js(`document.documentElement.dataset.motion = ''`);
  await watchReveal(); await turn('relief');
  check('Full motion: the layer fades in softly as it comes on', await js(`window.__revealed`));
  await until(settled('relief'), 45e3);
  const faint = await js(`import('/js/terrain-layers.js').then(m => { let s = 0; for (const t of m.terrainCtl().entry('relief').live.values()) { const d = t.canvas.getContext('2d').getImageData(0, 0, 256, 256).data; for (let i = 3; i < d.length; i += 4) s += d[i]; } return s; })`);
  await js(`{ const c = document.querySelector('[data-tstrong]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }`); await sleep(500); await until(settled('relief'), 45e3);
  await until(`!/Working it out/.test(document.querySelector('[data-legend=relief] [data-tnote]').textContent)`, 10e3).catch(() => {});
  const strong = await js(`import('/js/terrain-layers.js').then(m => { let s = 0; for (const t of m.terrainCtl().entry('relief').live.values()) { const d = t.canvas.getContext('2d').getImageData(0, 0, 256, 256).data; for (let i = 3; i < d.length; i += 4) s += d[i]; } return s; })`);
  check('"Stronger shading" darkens the gentle ground and says the heights are ×3 for the picture only', strong > faint && (await line('relief', 'data-tnote')) === 'Stronger shading: heights × 3 to show gentle ground; the figures use the true heights.', [faint, strong, await line('relief', 'data-tnote')]);
  await js(`document.querySelector('[data-legend=relief] [data-off]').click()`);
  for (const mode of ['less', 'reduce']) {
    await js(`document.documentElement.dataset.motion = '${mode}'`);
    await watchReveal(); await turn('frost'); await sleep(300);
    check(`${mode === 'less' ? 'Less' : 'Still'}: no fade, the layer is simply there`, await js(`!window.__revealed && !!document.querySelector('.tl-layer')`));
    await js(`document.querySelector('[data-legend=frost] [data-off]').click()`);
  }
  await js(`document.documentElement.dataset.motion = ''`);
  // the opacity slider of one layer
  await turn('slope'); await until(settled('slope'), 45e3);
  await js(`{ const r = document.querySelector('[data-top=slope]'); r.value = '40'; r.dispatchEvent(new Event('input', { bubbles: true })); }`);
  same('the opacity slider changes that layer', await js(`import('/js/terrain-layers.js').then(m => m.terrainCtl().layerOf('slope').getContainer().style.opacity)`), '0.4');
  // the Light map: the terrain layers stay over its ground
  await js(`(() => { window.__bases = []; document.addEventListener('crophalo:base', e => import('/js/terrain-layers.js').then(m => window.__bases.push([e.detail.ground, +m.terrainCtl().layerOf('slope')?.getContainer().style.zIndex]))); return 1; })()`);   // read when the map says its base changed, after the layers re-stacked
  await js(`document.querySelector('[data-base=light]').click()`);
  const gl = await seen(`window.__bases.some(b => b[0] === 'gl')`, 20e3), bases = await js(`window.__bases`);
  if (!gl) console.log(`NOTE  the Light map did not come up here (its tiles are cut off in this test, so it falls back to the satellite picture), so the layer order over it was not judged: ${JSON.stringify(bases)}`);
  else check('on the Light map the layer is drawn over the map\'s own ground (above its canvas, z-index 6 or more)', bases.filter(b => b[0] === 'gl').every(b => b[1] >= 6), bases);
});

await group('fit', async () => {
  for (const [w, text] of [[320, 'xlarge'], [1280, 'default']]) {
    await size(w); await demo(14);
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: '${text}' }))`); await sleep(250);
    if (w < 600) { await fullMap(); await sleep(400); }
    await openLayers(); await sleep(300); await shot(`terrain-panel-${w}.png`);
    check(`${w} px: the Layers panel with its Terrain analysis group is on the screen, inside the map`, await onScreen('.mapx-panel') && await onScreen('#mapxTerrainRows'));
    await flat(`the Layers panel with the Terrain analysis group at ${w} px${text === 'xlarge' ? ' with the largest text' : ''}`);
    for (const id of IDS) await turn(id);
    await closePanel(); for (const id of IDS) await until(settled(id), 60e3).catch(() => {}); await sleep(600);
    await shot(`terrain-five-legends-${w}.png`);
    check(`${w} px: the terrain legends are on the screen, inside the map`, await onScreen('.mapx-legends') && await onScreen('[data-legend=slope]'));
    await flat(`all five terrain legends at ${w} px${text === 'xlarge' ? ' with the largest text' : ''}`);
    check(`${w} px: the legend stack stays inside the map`, await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(), l = document.querySelector('.mapx-legends').getBoundingClientRect(); return l.left >= m.left - 1 && l.right <= m.right + 1; })()`));
    // the "i" is the app's 24 px mark with a 44 px place to tap round it; a checkbox is tapped through its whole row
    const small = await js(`[...document.querySelectorAll('.tl-legend button:not(.srci), .tl-legend input[type=range], .tl-legend input[type=date], .tl-legend .tl-check')].filter(e => e.offsetParent !== null).filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(e => (e.getAttribute('aria-label') || e.dataset.off || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))`);
    same(`${w} px: every control of the terrain legends is at least 44 px each way`, small, []);
  }
  await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'default' }))`); await size(1280);
});

await group('axe', async () => {
  const axe = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8');
  for (const w of [320, 1280]) {
    await size(w); await demo(14); await js(axe); if (w < 600) { await fullMap(); await sleep(400); }
    await openLayers();
    check(`axe at ${w} px: the panel being checked is on the screen`, await onScreen('#mapxTerrainRows'));
    // heading-order (a best practice, not a WCAG rule) is left out here only: the panel's own heading is an h3 written by js/mappanels.js, outside the terrain files, and comes before the setup's h2 at this width; it is listed for the merge
    const panel = await js(`axe.run(document.querySelector('#view-setup'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, rules: { 'heading-order': { enabled: false } } }).then(r => r.violations.map(v => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target.join(' ').slice(0, 70)))`);
    check(`axe: the Layers panel with the Terrain analysis group at ${w} px has no problem`, panel.length === 0, panel.join(' | '));
    for (const id of IDS) await turn(id);
    await closePanel(); await sleep(800);
    check(`axe at ${w} px: the legends being checked are on the screen`, await onScreen('[data-legend=sunshade]') || await onScreen('[data-legend=slope]'));
    const legends = await js(`axe.run(document.querySelector('#view-setup'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }).then(r => r.violations.map(v => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target.join(' ').slice(0, 70)))`);
    check(`axe: the five terrain legends at ${w} px have no problem`, legends.length === 0, legends.join(' | '));
  }
  await size(1280);
});

check('the real bucket was never asked: every height tile came from the stand-in', !run.cutOff.some(c => /elevation-tiles-prod/.test(c.where)), run.cutOff.filter(c => /elevation/.test(c.where)));
await finish();
