// The speed suite: what the Start page loads (scripts, blocking, the map library, which modules are preloaded), that every screen still opens when its files come on first use, and the map and the outline on a slow line.
// A real browser, the processor slowed 4x and a Fast 3G line (150 ms round trip, 1.6 Mbit/s down, 0.75 up), cold cache; the harness copies this folder into a throwaway site. The byte, request and order checks always run; the time limits are shown, not judged, on a busy computer.
// RULE: never loosen a budget without a written farming reason beside it. Run: node scripts/e2e_start_speed.mjs (the numbers as JSON: E2E_JSON=<file>)
import fs from 'node:fs';
import os from 'node:os';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('start_speed');
const { js, until, size, send, go, check, same, group, finish, sleep } = run;
const THROTTLE = { cpu: 4, latency: 150, down: 1.6 * 1024 * 1024 / 8, up: 0.75 * 1024 * 1024 / 8 };
// Why these numbers: the Start page's own scripts are about 25 KB as sent (compressed; 69 KB unpacked); 100 KB leaves room for growth and is far under the 204 KB (473 KB unpacked, map library included) it had to load. The long-task budget is what a phone can take
// before a farmer's first tap is felt (a task over 50 ms is felt; four of them is the most this page may cause while it loads).
const BUDGET = { startScriptKB: 100, startLong: 4, startLongMs: 500, outlineLongMs: 50, outlineFirstFigureMs: 800 };
const FORECAST = { elevation: 291, utc_offset_seconds: -18000, timezone_abbreviation: 'GMT-5', current: { time: '2026-11-14T14:05', temperature_2m: 12.4, apparent_temperature: 10.6, weather_code: 3, wind_speed_10m: 15.2 },
  daily: { time: ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'], weather_code: [61, 3, 0, 95], temperature_2m_max: [18, 14, 9, 11], temperature_2m_min: [7, 5, 2, 3], precipitation_probability_max: [20, 60, 10, 80], precipitation_sum: [3, 0, 0, 12] } };   // a made-up forecast, a test input only: the harness cuts every outside address
const numbers = {};
// The absolute time limits judge the page's own thread, which a computer running many times more work than it has threads stretches by itself (load 190 to 350 on 16 threads has been seen to double a task).
// On such a computer they are printed, not judged; the byte, request and order checks, which load cannot change, are always judged. Written 2026-11-14.
const busy = os.loadavg()[0] > 3 * os.cpus().length;
if (busy) console.log(`note: this computer is busy (load ${os.loadavg()[0].toFixed(0)} on ${os.cpus().length} threads): the time limits are shown but not judged`);
const limit = (name, ok, detail) => busy ? console.log(`not judged (busy)  ${name}  (${JSON.stringify(detail)})`) : check(name, ok, detail);
const sum = a => a.reduce((s, x) => s + x, 0);
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);

// installed before any page script runs (the first figure on the spot card is the field's area, worked out on the device): every long task, the paints, a clock for "when did the figure appear", and the forecast stand-in
const EARLY = `(() => {
  const P = window.__perf = { long: [], paint: {}, figureAt: null };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.long.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) }); }).observe({ type: 'longtask' }); } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.paint[e.name] = Math.round(e.startTime); }).observe({ type: 'paint', buffered: true }); } catch (e) {}
  const real = window.fetch;
  window.fetch = function (u) { if (/api\\.open-meteo\\.com/.test(String(u))) return Promise.resolve(new Response(JSON.stringify(${JSON.stringify(FORECAST)}), { status: 200 })); return real.apply(this, arguments); };
  new MutationObserver(() => { const s = document.querySelector('.spot-big'); if (s && P.figureAt === null && /\\d/.test(s.textContent)) P.figureAt = performance.now();  }).observe(document, { childList: true, subtree: true, characterData: true });
})()`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: EARLY });
async function throttle(on) {
  await send('Emulation.setCPUThrottlingRate', { rate: on ? THROTTLE.cpu : 1 });
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Network.emulateNetworkConditions', on ? { offline: false, latency: THROTTLE.latency, downloadThroughput: THROTTLE.down, uploadThroughput: THROTTLE.up } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}
const findButton = text => `[...document.querySelectorAll('button')].find(b => /${text}/.test(b.textContent))`;

await group('start: what the Start page loads', async () => {
  await size(1280); await throttle(false);
  await send('Page.navigate', { url: 'about:blank' });
  await throttle(true);
  const t0 = Date.now();
  await send('Page.navigate', { url: run.BASE + '/' });
  await until(`${findButton('Find it on the map')} && document.readyState === 'complete'`, 120000);
  const usable = Date.now() - t0;
  await sleep(1000);   // a moment for everything the page asks for while it loads; what it fetches in advance once it has loaded (the setup's files) starts after the load event and is not counted
  const m = await js(`(() => { const r = performance.getEntriesByType('resource'), nav = performance.getEntriesByType('navigation')[0], files = [];
    const kind = e => /\\.js(\\?|$)/.test(e.name) ? 'js' : /\\.css(\\?|$)/.test(e.name) ? 'css' : /\\.(png|svg|jpg|webp|ico|woff2?)(\\?|$)/.test(e.name) ? 'media' : 'other';
    const by = { js: 0, css: 0, media: 0, other: 0 };
    for (const e of r.filter(e => e.startTime <= nav.loadEventEnd)) { const b = e.transferSize || e.encodedBodySize || 0; by[kind(e)] += b; files.push([e.name.replace(location.origin + '/', ''), b, kind(e)]); }
    const blocking = [...document.querySelectorAll('script[src]')].filter(s => !s.type && !s.async && !s.defer).map(s => s.getAttribute('src'));
    const preload = [...document.querySelectorAll('link[rel=modulepreload]')].map(l => l.getAttribute('href'));
    return { by, files, count: r.filter(e => e.startTime <= nav.loadEventEnd).length, dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), paint: window.__perf.paint, long: window.__perf.long, blocking, preload, L: typeof window.L }; })()`);
  const js2 = m.files.filter(([, , k]) => k === 'js'), has = re => m.files.filter(([n]) => re.test(n)).map(([n, b]) => `${n} ${Math.round(b / 1024)} KB`);
  const blockingBytes = m.files.filter(([n]) => m.blocking.some(src => n.endsWith(src))).reduce((s, [, b]) => s + b, 0);
  numbers.start = { usableMs: usable, domContentLoadedMs: m.dcl, loadMs: m.load, firstContentfulPaintMs: m.paint['first-contentful-paint'] ?? null, requests: m.count, scriptKB: Math.round(m.by.js / 1024), scriptFiles: js2.length,
    blockingScriptKB: Math.round(blockingBytes / 1024), styleKB: Math.round(m.by.css / 1024), mediaKB: Math.round(m.by.media / 1024), longTasks: m.long.length, longTaskMs: sum(m.long.map(x => x.ms)), longestTaskMs: Math.max(0, ...m.long.map(x => x.ms)) };
  console.log('start:', JSON.stringify(numbers.start));
  check(`the Start page's scripts are at most ${BUDGET.startScriptKB} KB (they were 620 KB: the whole app and the map library)`, numbers.start.scriptKB <= BUDGET.startScriptKB, numbers.start.scriptKB);
  check('no script blocks the page: every <script src> is a module, async or deferred (the map library used to block)', m.blocking.length === 0, m.blocking);
  check('the map library (script and styles) is not fetched for the Start page, and is not on the page', has(/vendor\/leaflet/).length === 0 && m.L === 'undefined', [has(/vendor\/leaflet/), m.L]);
  check('three.js and MapLibre are not fetched for the Start page', has(/three|maplibre/).length === 0, has(/three|maplibre/));
  check('the setup, the report, My farm and the engine are not fetched for the Start page', !m.files.some(([n]) => /js\/(wizard|mapx|report|farm|farm3d|engine|simulate|season|climate|data|pages|fielddrawer|fieldedit)\.js/.test(n)), m.files.filter(([n]) => /js\/(wizard|mapx|report|farm|engine|simulate|pages)/.test(n)).map(([n]) => n));
  const fetchedJs = new Set(js2.map(([n]) => n));
  check('modulepreload names exactly the Start page\'s own modules: each one is used, and none of the later screens\' is there', m.preload.length > 0 && m.preload.every(h => fetchedJs.has(h.replace(/^\//, ''))) && !m.preload.some(h => /wizard|mapx|report|farm|engine|pages/.test(h)), m.preload);
  limit(`the main thread has at most ${BUDGET.startLong} tasks over 50 ms while the Start page loads, and ${BUDGET.startLongMs} ms of them in all`, numbers.start.longTasks <= BUDGET.startLong && numbers.start.longTaskMs <= BUDGET.startLongMs, [numbers.start.longTasks, numbers.start.longTaskMs]);
});

await group('views: every screen opens, and the libraries come with the screens that use them', async () => {
  await size(1280); await throttle(false);
  await send('Page.navigate', { url: 'about:blank' });
  await acceptWelcome().catch(() => {});
  await go('/'); await acceptWelcome(); await go('/');
  await until(`${findButton('Find it on the map')}`, 30000);
  check('Start: the map library is not there yet', await js('typeof window.L') === 'undefined');
  // the setup and its map
  await js(`${findButton('Find it on the map')}.click()`);
  await until(`!document.querySelector('#view-setup').hidden`, 5000);
  await until(`document.querySelector('#mapx') && document.querySelector('#mapxCanvas') && document.querySelector('[data-tool=rect]')`, 30000);
  check('Setup: the map mounts, with its library', await js('typeof window.L === "object" && typeof window.L.map === "function"'));
  check('Setup: the map library\'s styles come before the app\'s, so the app\'s rules still win', await js(`(() => { const s = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href')); return s.findIndex(h => /leaflet\\.css$/.test(h)) >= 0 && s.findIndex(h => /leaflet\\.css$/.test(h)) < s.findIndex(h => /css\\/app\\.css$/.test(h)); })()`));
  check('Setup: the wizard drew its heading and the map has its tools and a size', await js(`!!document.querySelector('#wHeading') && document.querySelector('#mapxCanvas').getBoundingClientRect().height > 100`));
  check('Setup: the library was fetched once', await js(`performance.getEntriesByType('resource').filter(e => /leaflet\\.js/.test(e.name)).length`) === 1);
  // a place chosen on the map reaches the wizard (the map joined after the wizard drew)
  const c = await js(`(() => { const r = document.querySelector('#mapxCanvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: c.x, y: c.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  await until(`document.querySelector('.mapx-pin')`, 10000);
  check('Setup: a tap on the map puts the pin down', await js(`!!document.querySelector('.mapx-pin')`));
  // an info page, straight from its address
  await go('/#privacy'); await until(`!document.querySelector('#view-info').hidden && document.querySelector('#infoBody').textContent.trim().length > 40`, 15000);
  check('Info: the page opens from its address with its text', await js(`document.querySelector('#infoTitle').textContent`) === 'Privacy');
  // the report, with no field chosen: it offers the way back instead of a made-up report
  await go('/'); await until(`${findButton('Find it on the map')}`, 30000);
  await js(`history.pushState({ v: 'report' }, ''); dispatchEvent(new PopStateEvent('popstate', { state: { v: 'report' } }))`);
  await until(`!document.querySelector('#view-report').hidden && document.querySelector('#reportRoot').textContent.trim().length > 20`, 20000);
  check('Report: opens with something to read (the report, or the way back to set up one)', await js(`document.querySelector('#reportRoot').textContent.trim().length`) > 20);
  check('Report: asking for it did not bring the map library', await js('typeof window.L') === 'undefined');
  // My farm
  await js(`document.querySelector('#navFarm').click()`);
  await until(`!document.querySelector('#view-farm').hidden && document.querySelector('#view-farm').textContent.trim().length > 40`, 30000);
  check('My farm: opens with its board', await js(`document.querySelector('#view-farm').textContent.trim().length`) > 40);
  check('My farm: its library arrived with it', await js('typeof window.L') === 'object');
  check('three.js was never fetched by any of these screens (it comes only with the 3D look)', await js(`performance.getEntriesByType('resource').filter(e => /three/.test(e.name)).length`) === 0);
});

// A farmer's first visit on a slow line, both ways: reading the Start page for three seconds before the tap (what the page fetched in advance is there), and tapping the moment the page is usable (nothing is there yet).
async function toTheMap(wait) {
  await size(1280); await throttle(false);
  await send('Page.navigate', { url: 'about:blank' });
  await go('/'); await acceptWelcome(); await send('Page.navigate', { url: 'about:blank' });
  await throttle(true);
  await send('Page.navigate', { url: run.BASE + '/' });
  await until(`${findButton('Find it on the map')} && document.readyState === 'complete'`, 120000);
  await sleep(wait);
  const tTap = Date.now();
  await js(`${findButton('Find it on the map')}.click()`);
  await until(`document.querySelector('#mapx') && document.querySelector('#mapxCanvas') && !document.querySelector('#view-setup').hidden && document.querySelector('[data-tool=rect]')`, 120000);
  return Date.now() - tTap;
}
await group('the map: from the tap on "Find it on the map" to a map you can draw on', async () => {
  const atOnce = await toTheMap(0), afterReading = await toTheMap(3000);
  numbers.map = { tapAtOnceMs: atOnce, tapAfterThreeSecondsMs: afterReading };
  console.log('map:', JSON.stringify(numbers.map));
  limit('after three seconds on the Start page the map opens within 3 s of the tap (its files were fetched in advance)', afterReading <= 3000, afterReading);
});

await group('outline: from the finished rectangle to the first figure', async () => {
  const mapMs = await toTheMap(3000);
  await sleep(400);
  const c = await js(`(() => { const r = document.querySelector('#mapxCanvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await js(`document.querySelector('[data-tool=rect]').click()`);
  const a = { x: c.x - 80, y: c.y - 60 }, b = { x: c.x + 90, y: c.y + 50 };
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, buttons: 1 });
  await js(`window.__perf.long = []; window.__perf.figureAt = null; window.addEventListener('pointerup', e => { window.__perf.up = e.timeStamp; }, { once: true, capture: true }); 0`);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
  await until(`window.__perf.figureAt !== null`, 60000);
  await sleep(300);
  const r = await js(`({ up: window.__perf.up, figureAt: window.__perf.figureAt, long: window.__perf.long.filter(x => x.at >= window.__perf.up - 50) })`);
  const ms = Math.round(r.figureAt - r.up), longs = r.long.map(x => x.ms);
  numbers.outline = { mapOpenMs: mapMs, firstFigureMs: ms, longTasks: longs.length, longTaskMs: sum(longs), longestTaskMs: Math.max(0, ...longs) };
  console.log('outline:', JSON.stringify(numbers.outline));
  limit(`the first figure is on the spot card within ${BUDGET.outlineFirstFigureMs} ms of the finished outline (slowed processor, the forecast answering at once)`, ms <= BUDGET.outlineFirstFigureMs, ms);
  limit(`no task over ${BUDGET.outlineLongMs} ms runs on the main thread between the finished outline and the first figure`, numbers.outline.longestTaskMs <= BUDGET.outlineLongMs, longs);
});
if (process.env.E2E_JSON) fs.writeFileSync(process.env.E2E_JSON, JSON.stringify({ throttle: THROTTLE, budgets: BUDGET, ...numbers }, null, 1));
await finish();
