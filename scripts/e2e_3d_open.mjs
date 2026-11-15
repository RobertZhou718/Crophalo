// Crophalo's browser suite for opening 3D on My farm: a tap on 3D shows a skeleton of the scene at once, the page never freezes while the scene is built,
// the scene appears, Back works in the middle of a build, ten opens and closes leave nothing behind, a device without WebGL keeps the Map and says why,
// and the skeleton follows Settings > Motion. Times are judged at a calm load (under three times the processor cores); the load is printed beside each number.
// Run: node scripts/e2e_3d_open.mjs   (E2E_ONLY=open,back,cycles,webgl,motion,look,fit,changes picks groups; E2E_CPU=4 slows the processor four times)
import os from 'node:os';
import { openRun } from './e2e_lib.mjs';
import { realReport } from './fixtures/engine-plans.mjs';

const run = await openRun('e2e_3d_open');
const { js, page, until, seen, tap, size, go, flat, check, same, group: groupRaw, finish, sleep, send, shot } = run;
const CORES = os.cpus().length, CALM = 3 * CORES;
const load = () => Math.round(os.loadavg()[0] * 10) / 10;
const LONG_MS = 50;   // the longest main-thread task allowed while 3D opens or changes, on a calm computer
const limitNow = () => load() < CALM ? LONG_MS : 200;   // on a computer far busier than calm a task can stretch for reasons outside the page: a freeze is still caught at 200 ms
const at = () => `load ${load()} on ${CORES} cores${load() < CALM ? '' : `, over ${CALM}: judged at 200 ms, not ${LONG_MS}`}`;
const soon = ms => load() < CALM ? ms : Math.round(ms * 2.5);   // how soon the page must answer a tap: as asked on a calm computer, two and a half times that on one far busier

// What the page measures from its first line: long tasks and long frames, a heartbeat, the clicks with the state of the 3D view at that moment,
// when the skeleton and the map first show after a click, the WebGL contexts the page itself makes, and the 3D workers started and stopped.
// With window.__noWebglInWorker set, a 3D worker starts with no WebGL, as on a device that has none; with window.__holdWorkerMs, it starts that much later, as on a slow one.
const KIT = `(() => {
  const P = window.__3d = { long: [], loaf: [], gaps: [], clicks: [], pageGl: 0, lost: 0, workers: 0, alive: 0, marks: {} };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.long.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) { P.noLong = String(e); }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.loaf.push({ s: e.startTime, d: e.duration, b: e.blockingDuration, style: Math.round(e.duration - (e.styleAndLayoutStart ? e.styleAndLayoutStart - e.startTime : e.duration)),
    scripts: (e.scripts || []).filter(x => x.duration >= 10).map(x => ({ d: Math.round(x.duration), by: x.invoker, src: String(x.sourceURL || '').split('/').pop(), fn: x.sourceFunctionName, layout: Math.round(x.forcedStyleAndLayoutDuration || 0) })) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) { P.noLoaf = String(e); }
  let last = performance.now(); setInterval(() => { const now = performance.now(); if (now - last > 40) P.gaps.push({ s: last, d: now - last }); last = now; }, 16);
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { const c = get.call(this, kind, ...rest); if (c && /webgl/.test(String(kind)) && !this.__counted) { this.__counted = true; P.pageGl++; } return c; };
  addEventListener('webglcontextlost', () => { P.lost++; }, true);
  const W = window.Worker;
  if (W) window.Worker = class extends W {
    constructor(url, opts) {
      const is3d = /farm3d/.test(String(url));
      let u = url;
      if (is3d && window.__noWebglInWorker) u = URL.createObjectURL(new Blob(['import ' + JSON.stringify(new URL(String(url), location.href).href) + '; OffscreenCanvas.prototype.getContext = function () { return null; };'], { type: 'text/javascript' }));
      else if (is3d && window.__holdWorkerMs) u = URL.createObjectURL(new Blob(['const kept = []; self.onmessage = e => kept.push(e); await new Promise(r => setTimeout(r, ' + (+window.__holdWorkerMs) + ')); await import(' + JSON.stringify(new URL(String(url), location.href).href) + '); for (const e of kept) self.onmessage(e);'], { type: 'text/javascript' }));   // a slow device: the 3D worker starts late, so the skeleton stays
      super(u, opts);
      if (is3d) { P.workers++; P.alive++; const stop = this.terminate.bind(this); let gone = false; this.terminate = () => { if (!gone) { gone = true; P.alive--; } stop(); }; }
    }
  };
  const state3d = () => document.querySelector('#fw3d .f3d')?.dataset.state || (document.querySelector('#fw3d canvas') ? 'canvas' : 'none');
  document.addEventListener('click', e => { const el = e.target.closest?.('button'); P.clicks.push({ t: e.timeStamp, id: el?.id || el?.dataset?.act || '', state: state3d() }); }, true);
  // read from the page's own words and attributes only: a measure that asked for the layout would itself hold the page
  const seenNow = () => {
    const sk = document.querySelector('#fw3d .f3d-sk'), three = document.querySelector('#fw3d'), map = document.querySelector('#fwMap');
    if (!P.marks.skel && sk && !sk.hidden && three && !three.hidden && !three.closest('[hidden]')) { P.marks.skel = performance.now(); requestAnimationFrame(t => { P.marks.skelFrame = t; }); }
    if (!P.marks.pressed && document.querySelector('#fwThreeBtn')?.getAttribute('aria-pressed') === 'true') P.marks.pressed = performance.now();
    if (!P.marks.map && P.marks.watchMap && map && !map.hidden && document.querySelector('#fwMapBtn')?.getAttribute('aria-pressed') === 'true') { P.marks.map = performance.now(); requestAnimationFrame(t => { P.marks.mapFrame = t; }); }
    if (!P.marks.ready && document.querySelector('#fw3d .f3d')?.dataset.state === 'ready') P.marks.ready = performance.now();
  };
  new MutationObserver(seenNow).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-pressed', 'data-state', 'class'] });
})();`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: KIT });
// the picture lookup has no route on this copy's server: it fails at once, as when it cannot be reached
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, o) => /^[/]api[/]hlsndvi/.test(String(u)) ? Promise.reject(new Error('down')) : first(u, o); })();" });

const WELCOME = JSON.stringify({ v: '2026-11-14', at: 'test' });
const group = (label, body) => groupRaw(label, async () => { await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await go('/'); await body(); });
const { report: REAL } = await realReport();
const open = async () => {
  await js(`localStorage.setItem('crophalo.farm3d.v1', 'board')`);   // an earlier press of 3D in this run is remembered (the first-open rule): the farmer starts from the board again, so the 3D is built only when the tap asks for it
  await js(`import('/js/farm.js').then(m => { window.__farm = m; window.__res = m.addFromReport(${JSON.stringify(REAL)}); })`);
  await until(`document.querySelector('#fwFinding')?.textContent.length > 5 && !document.querySelector('#view-farm').hidden`, 15e3);
  await until(`/^(Planned|Observed)$/.test(document.querySelector('#fwLabel')?.textContent || '')`, 15e3);   // the crop engine has said what covers the ground: 3D has a state to draw
  await sleep(400);
};
const marks = () => js(`JSON.parse(JSON.stringify(window.__3d.marks))`);
const clearMarks = (extra = {}) => js(`(window.__3d.marks = ${JSON.stringify(extra)}, window.__3d.clicks = [], 0)`);
const lastClick = id => js(`(window.__3d.clicks.filter(c => c.id === ${JSON.stringify(id)}).at(-1) || null)`);
// the picture is up: the view says so (a view that has no such word, as before this check, answers false as soon as its own picture is there)
const ready = (ms = 30e3) => until(`(() => { const r = document.querySelector('#fw3d .f3d'); if (r?.dataset.state === 'ready') return 'ready'; if (r?.dataset.state === 'failed' || (!r && document.querySelector('#fw3d .f3d-stage canvas'))) return 'other'; return false; })()`, ms).then(v => v === 'ready', () => false);
// The longest main-thread task, frame and heartbeat gap between two moments of the page's clock.
const busy = (from, to) => js(`(() => { const P = window.__3d, inside = e => e.s + e.d > ${from} && e.s < ${to};
  return { task: Math.round(Math.max(0, ...P.long.filter(inside).map(e => e.d))), frame: Math.round(Math.max(0, ...P.loaf.filter(inside).map(e => e.d))), blocking: Math.round(Math.max(0, ...P.loaf.filter(inside).map(e => e.b || 0))), gap: Math.round(Math.max(0, ...P.gaps.filter(inside).map(e => e.d))), tasks: P.long.filter(inside).length }; })()`);
const now = () => js('performance.now()');
const stats = () => js(`(async () => { const v = window.__farm?._view3d?.(); return v && typeof v.stats === 'function' ? await v.stats() : null; })()`);

const SLOW_CPU = Math.max(1, +(process.env.E2E_CPU || 1));   // E2E_CPU=4 runs the opening on a processor four times slower, as a cheap laptop or a busy one
await group('open: a skeleton at once, no frozen page, then the scene', async () => {
  await size(1280); await open();
  if (SLOW_CPU > 1) { await send('Emulation.setCPUThrottlingRate', { rate: SLOW_CPU }); console.log(`e2e_3d_open: the opening below runs on a processor ${SLOW_CPU} times slower`); }
  const loadAt = load(), limit = limitNow();
  await clearMarks();
  const before = await now(), gl0 = await js('window.__3d.pageGl');
  await tap('#fwThreeBtn');
  const click = await lastClick('fwThreeBtn');
  check('open: the tap on 3D reached the page', !!click, click);
  const ok = await ready();
  await until(`window.__3d.marks.skelFrame != null`, 3000).catch(() => {});
  const m = await marks(), after = (m.ready ?? await now()) + 300;
  await sleep(400);
  const skel = m.skelFrame != null && click ? Math.round(m.skelFrame - click.t) : null, quick = loadAt < CALM ? 100 : 250;
  check(`open: a skeleton of the 3D scene shows within ${quick} ms of the tap (${skel ?? 'never'} ms, load ${loadAt})`, skel != null && skel <= quick, m);
  const pressed = m.pressed != null && click ? Math.round(m.pressed - click.t) : null;
  check(`open: the toolbar answers at once: 3D is pressed within ${quick} ms (${pressed ?? 'never'} ms, load ${loadAt})`, pressed != null && pressed <= quick, m);
  check('open: the skeleton says what is happening, in words', await js(`/Building your field in 3D/.test(document.querySelector('#fw3d')?.textContent || '') || document.querySelector('#fw3d .f3d')?.dataset.state === 'ready'`));
  check('open: the scene appears', ok, await js(`document.querySelector('#fw3d')?.innerText.slice(0, 200)`));
  const scene = m.ready != null && click ? Math.round(m.ready - click.t) : null;
  console.log(`e2e_3d_open: picture shown ${scene ?? '?'} ms after the tap (${at()})`);
  const b = await busy(click?.t ?? before, after);
  console.log(`e2e_3d_open: while 3D opened: longest task ${b.task} ms, longest frame ${b.frame} ms (blocking ${b.blocking} ms), longest heartbeat gap ${b.gap} ms, ${b.tasks} task(s) over 50 ms (${at()})`);
  console.log(`e2e_3d_open: the steps heard (ms after the view started): ${JSON.stringify(await js('window.__farm._view3d?.()?.timeline || null'))}`);
  const long = await js(`window.__3d.loaf.filter(e => e.s + e.d > ${click?.t ?? before} && e.s < ${after} && e.d > 50).map(e => ({ d: Math.round(e.d), blocking: Math.round(e.b), styleAndLayout: e.style, scripts: e.scripts }))`);
  if (long.length) console.log(`e2e_3d_open: frames over 50 ms while 3D opened: ${JSON.stringify(long)}`);
  check(`open: no main-thread task over ${limit} ms from the tap to the picture (longest ${b.task} ms, ${at()})`, b.task <= limit, b);
  check(`open: the page never stops for ${limit * 2} ms or more (heartbeat gap ${b.gap} ms, ${at()})`, b.gap < limit * 2, b);
  const st = await stats();
  check('open: the scene really drew: something is on the picture', st && st.drawn > 0.05, st);
  same('open: the page itself made no WebGL context (the picture is drawn off the page)', await js('window.__3d.pageGl') - gl0, 0);
  check('open: one 3D worker draws it', await js('window.__3d.alive') === 1, await js('window.__3d.alive'));
  check('open: the stage is no longer busy and its skeleton is gone', await js(`document.querySelector('#fw3d .f3d-stage')?.getAttribute('aria-busy') !== 'true' && !document.querySelector('#fw3d .f3d-sk:not([hidden])')`));
  check('open: the camera buttons work once the picture is up', await js(`(async () => { const v = window.__farm._view3d(), a = v.camera(); document.querySelector('#fw3d [data-act="left"]').click(); await new Promise(r => setTimeout(r, 250)); const b = v.camera(); return b.moved && JSON.stringify(a.position) !== JSON.stringify(b.position); })()`));
  check('open: within the budget of this device', st && st.triangles <= st.budget.triangles && st.plants <= st.budget.plants, st);
  await shot('3d-open-1280.png');
  if (SLOW_CPU > 1) await send('Emulation.setCPUThrottlingRate', { rate: 1 });
});

await group('back: Back in the middle of a build brings the Map back at once', async () => {
  await size(1280); await open();
  await js('window.__holdWorkerMs = 1500');   // a slow device, so the tap surely lands in the middle of the build
  for (const [how, sel] of [['the skeleton\'s Back to the Map', '#fw3d .f3d-back'], ['the toolbar\'s Map', '#fwMapBtn']]) {
    await clearMarks({ watchMap: false });
    await tap('#fwThreeBtn');
    await until(`!!document.querySelector('#fw3d .f3d-sk')`, 3000).catch(() => {});
    await js(`(window.__3d.marks.watchMap = true, window.__3d.marks.map = null, 0)`);
    const loadAt = load();
    await tap(sel).catch(e => check(`back: ${how} can be tapped while 3D is built`, false, e.message));
    const click = await lastClick(sel === '#fwMapBtn' ? 'fwMapBtn' : 'back');
    check(`back: ${how} was tapped while the scene was still being built`, click?.state === 'building', click);
    await until(`!document.querySelector('#fwMap').hidden && window.__3d.marks.mapFrame != null`, 5000).catch(() => {});
    const m = await marks(), ms = m.mapFrame != null && click ? Math.round(m.mapFrame - click.t) : null, limit = loadAt < CALM ? 200 : soon(200);
    check(`back: ${how} shows the Map within ${limit} ms (${ms ?? 'never'} ms, load ${loadAt})`, ms != null && ms <= limit, m);
    await sleep(1500);
    same(`back: after ${how} no 3D worker is left running`, await js('window.__3d.alive'), 0);
    check(`back: after ${how} the 3D area is closed and empty`, await js(`document.querySelector('#fw3d').hidden && !document.querySelector('#fw3d canvas')`));
    same(`back: after ${how} the Map is pressed`, await js(`document.querySelector('#fwMapBtn').getAttribute('aria-pressed')`), 'true');
  }
  await js('window.__holdWorkerMs = 0');
  await tap('#fwThreeBtn');
  check('back: 3D opens normally after a cancelled build', await ready());
});

await group('cycles: ten opens and closes leave nothing behind', async () => {
  await size(1280); await open();
  const counters = async () => { await send('HeapProfiler.collectGarbage').catch(() => {}); await sleep(200); await send('HeapProfiler.collectGarbage').catch(() => {}); const h = await send('Runtime.getHeapUsage'), d = await send('Memory.getDOMCounters').catch(() => ({})); return { heapMB: Math.round(h.usedSize / 1048576 * 100) / 100, nodes: d.nodes, listeners: d.jsEventListeners }; };
  const cycle = async () => { await tap('#fwThreeBtn'); const ok = await ready(); await tap('#fwMapBtn'); await until(`!document.querySelector('#fwMap').hidden`, 5000); return ok; };
  await cycle(); await sleep(800);
  const a = await counters(), gl0 = await js('window.__3d.pageGl');
  let drawn = 0;
  for (let i = 0; i < 10; i++) drawn += await cycle() ? 1 : 0;
  await sleep(1500);
  const b = await counters();
  console.log(`e2e_3d_open: ten cycles: heap ${a.heapMB} -> ${b.heapMB} MB, nodes ${a.nodes} -> ${b.nodes}, listeners ${a.listeners} -> ${b.listeners} (${at()})`);
  same('cycles: every one of the ten opens drew the scene', drawn, 10);
  same('cycles: no 3D worker is left running', await js('window.__3d.alive'), 0);
  same('cycles: the page made no WebGL context of its own in ten opens', await js('window.__3d.pageGl') - gl0, 0);
  check('cycles: the page\'s memory did not grow (within 1 MB)', b.heapMB - a.heapMB <= 1, [a, b]);
  check('cycles: no page parts were left behind (within 40 nodes)', b.nodes - a.nodes <= 40, [a, b]);
  check('cycles: no listeners were left behind', b.listeners - a.listeners <= 2, [a, b]);
});

await group('webgl: a device without WebGL keeps the Map and says why', async () => {
  await size(1280); await open();
  await js(`window.__noWebglInWorker = true; { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return /webgl/.test(String(kind)) ? null : get.call(this, kind, ...rest); }; } 0`);
  await tap('#fwThreeBtn');
  const back = await seen(`!document.querySelector('#fwMap').hidden && document.querySelector('#fwMapBtn').getAttribute('aria-pressed') === 'true'`, 8000);
  check('webgl: the Map comes back', back);
  const msg = await js(`document.querySelector('#fwStatus')?.hidden ? '' : document.querySelector('#fwStatus')?.textContent`);
  check('webgl: it says in words that this device cannot draw 3D', /cannot draw 3D/.test(msg || ''), msg);
  check('webgl: the 3D area is not left blank on the screen', await js(`document.querySelector('#fw3d').hidden`));
  same('webgl: the Map still has its field', await js(`document.querySelectorAll('#fwMap path.fw-field').length`), 1);
  await sleep(500);
  same('webgl: no 3D worker is left running', await js('window.__3d.alive'), 0);
});

await group('motion: the skeleton shimmers only under Full, and is still under Less and Still', async () => {
  for (const [name, level] of [['Full', ''], ['Less', 'less'], ['Still', 'reduce']]) {
    await size(1280); await go('/');
    await js(level ? `document.documentElement.dataset.motion = '${level}'` : `delete document.documentElement.dataset.motion`);
    await open();
    await tap('#fwThreeBtn');
    const sk = await js(`(() => { const el = document.querySelector('#fw3d .f3d-sk .sk'); if (!el) return null; const c = getComputedStyle(el); return { name: c.animationName, dur: parseFloat(c.animationDuration) || 0, image: c.backgroundImage, state: document.querySelector('#fw3d .f3d')?.dataset.state }; })()`);
    check(`motion: ${name}: the skeleton is there while the scene is built`, !!sk, sk);
    if (sk && level === '') check('motion: Full: the skeleton shimmers', sk.name !== 'none' && sk.dur >= 0.5, sk);
    if (sk && level) check(`motion: ${name}: the skeleton is a still shape, no shimmer and no frozen streak`, (sk.name === 'none' || sk.dur <= 0.001) && sk.image === 'none', sk);
    const bar = await js(`(() => { const el = document.querySelector('#fw3d .f3d-sk-bar i'); if (!el) return null; const c = getComputedStyle(el); return { t: c.transitionDuration, name: c.animationName }; })()`);
    if (level) check(`motion: ${name}: the progress line jumps, it does not glide`, bar && bar.name === 'none' && bar.t.split(',').every(d => parseFloat(d) <= 0.001), bar);
    check(`motion: ${name}: the scene still appears`, await ready());
  }
});

await group('look: the skeleton while a slow device builds the scene', async () => {
  for (const w of [1280, 375]) {
    await size(w); await go('/'); await open();
    await js('window.__holdWorkerMs = 4000');
    await tap('#fwThreeBtn'); await sleep(700);
    same(`look ${w}: still building`, await js(`document.querySelector('#fw3d .f3d')?.dataset.state`), 'building');
    const sk = await page(T => { const s = document.querySelector('#fw3d .f3d-sk'), card = s?.querySelector('.f3d-sk-card'), stage = document.querySelector('#fw3d .f3d-stage'), back = s?.querySelector('.f3d-back'), bar = s?.querySelector('[role=progressbar]');
      return { shown: !!s && T.shown(s), status: s?.getAttribute('role'), busy: stage?.getAttribute('aria-busy'), words: s?.textContent.replace(/\s+/g, ' ').trim(), cardInside: !!card && (b => b.x >= T.box(stage).x - 0.5 && b.r <= T.box(stage).r + 0.5)(T.box(card)), back: back ? Math.min(T.box(back).w, T.box(back).h) : 0, bar: bar ? [bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuetext')] : null,
        contrast: card ? T.ratio(T.rgba(getComputedStyle(card.querySelector('.f3d-sk-step')).color), T.ground(card.querySelector('.f3d-sk-step'))) : 0 }; });
    check(`look ${w}: the skeleton is on screen, a status, with the stage marked busy`, sk.shown && sk.status === 'status' && sk.busy === 'true', sk);
    check(`look ${w}: it says what is happening and offers the way back`, /Building your field in 3D/.test(sk.words) && /Back to the Map/.test(sk.words) && sk.back >= 44, sk);
    check(`look ${w}: its progress line has a real step`, !!sk.bar && +sk.bar[0] > 0 && +sk.bar[0] < 100 && sk.bar[1].length > 5, sk.bar);
    check(`look ${w}: its words read at 4.5:1 or more`, sk.contrast >= 4.5, sk.contrast);
    check(`look ${w}: the card sits inside the picture's place`, sk.cardInside, sk);
    await flat(`skeleton ${w}`);
    await shot(`3d-skeleton-${w}.png`);
    check(`look ${w}: the scene still comes`, await ready());
    await js('window.__holdWorkerMs = 0');
  }
  // a device that takes very long: after 8 s the skeleton says so in words, and Back to the Map still works at once
  await size(1280); await go('/'); await open();
  await js('window.__holdWorkerMs = 15000');
  await tap('#fwThreeBtn'); await sleep(8600);
  const slow = await js(`(() => { const s = document.querySelector('#fw3d .f3d-sk-step'); return { text: s?.textContent || '', heard: s?.getAttribute('aria-hidden') !== 'true', state: document.querySelector('#fw3d .f3d')?.dataset.state }; })()`);
  check('look: after 8 s on a slow device the skeleton says it is taking long, aloud, and points to the Map', /taking long/.test(slow.text) && /Map shows the same field/.test(slow.text) && slow.heard && slow.state === 'building', slow);
  await shot('3d-skeleton-slow-1280.png');
  await tap('#fw3d .f3d-back');
  check('look: Back to the Map works on a build that is taking long', await seen(`!document.querySelector('#fwMap').hidden && document.querySelector('#fwMapBtn').getAttribute('aria-pressed') === 'true'`, 2000));
  same('look: the keyboard lands on the Map button', await js('document.activeElement?.id'), 'fwMapBtn');
  await js('window.__holdWorkerMs = 0');
});

await group('fit: the picture, its buttons, the legend and the words fit above the time bar', async () => {
  for (const w of [1280, 375]) {
    await size(w); await go('/'); await open();
    await tap('#fwThreeBtn'); check(`fit ${w}: the scene appears`, await ready());
    await sleep(300); await shot(`3d-fit-${w}.png`);
    const covered = await page(T => [...document.querySelectorAll('#fw3d .f3d-btn')].map(el => { el.scrollIntoView({ block: 'nearest' }); const b = T.box(el), hit = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2); return hit && (hit === el || el.contains(hit)) ? '' : `${T.name(el)} is under ${T.name(hit)}`; }).filter(Boolean));
    same(`fit ${w}: no camera button is covered by the time bar`, covered, []);
    const small = await page(T => [...document.querySelectorAll('#fw3d button')].filter(el => T.shown(el)).map(el => { const b = T.box(el); return b.w < 43.5 || b.h < 43.5 ? `${T.name(el)} ${Math.round(b.w)}x${Math.round(b.h)}` : ''; }).filter(Boolean));
    same(`fit ${w}: every 3D button is 44 px or more`, small, []);
    const reach = await page(T => { const strip = document.querySelector('#fwStrip'), top = strip && !strip.hidden ? T.box(strip).y : innerHeight, out = []; for (const sel of ['.f3d-legend', '.f3d-words']) { const el = document.querySelector('#fw3d ' + sel); if (!el) { out.push(sel + ' missing'); continue; } el.scrollIntoView({ block: 'end' }); const b = T.box(el); if (b.b > top + 1) out.push(`${sel} ends at ${Math.round(b.b)} under the time bar at ${Math.round(top)}`); } return out; });
    same(`fit ${w}: the legend and the words can be read above the time bar`, reach, []);
    check(`fit ${w}: the date and "Planned" are not drawn a second time in 3D (the board's top row says them; a screen reader hears them once with the picture)`, await page(T => { const l = document.querySelector('#fw3d .f3d-label'); return (!l || T.tiny(T.box(l))) && ![...document.querySelectorAll('#fw3d *')].some(el => el !== l && !l?.contains(el) && T.shown(el) && !T.tiny(T.box(el)) && /\b(Planned|Observed) ·/.test(el.textContent) && el.children.length === 0); }), await js(`document.querySelector('#fw3d').innerText.slice(0, 160)`));
    await flat(`3d ${w}`);
  }
});

await group('changes: a new date or plan in 3D is light', async () => {
  await size(1280); await open();
  await tap('#fwThreeBtn'); check('changes: the scene appears', await ready());
  await tap('#fwCompare'); await sleep(600);   // the time bar is part of Compare plans; opening it is not the change being measured
  await sleep(500);
  const a = await stats(), from = await now(), limit = limitNow();
  // the plan shown is chosen in Compare plans on the simplified board; the same call it makes
  await js(`import('/js/farm.js').then(m => m.setPlanKind('current'))`); await sleep(250);
  await js(`import('/js/farm.js').then(m => m.setPlanKind('proposed'))`); await sleep(250);
  for (let i = 0; i < 3; i++) { await tap('#fwMonthNext'); await sleep(150); }
  await sleep(800);
  const mid = await stats();
  await js(`(() => { const s = document.querySelector('#fwMonthSlider'); for (let v = 0; v < 12; v++) { s.value = String(v); s.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await sleep(1500);
  const b = await stats(), m = await busy(from, await now());
  console.log(`e2e_3d_open: changes in 3D: longest task ${m.task} ms, longest frame ${m.frame} ms, scenes drawn ${a?.scenes} -> ${mid?.scenes} -> ${b?.scenes}, programs ${a?.programs} -> ${b?.programs} (${at()})`);
  check('changes: the view kept up: what it draws is the date the board shows', await js(`document.querySelector('#fw3d .f3d-stage')?.dataset.date === document.querySelector('#fwTime').getAttribute('datetime')`), await js(`[document.querySelector('#fw3d .f3d-stage')?.dataset.date, document.querySelector('#fwTime').getAttribute('datetime')]`));
  check('changes: no shader program was made again', a && b && b.programs === a.programs, [a?.programs, b?.programs]);
  check('changes: twelve slider steps in one go are drawn as at most two scenes', mid && b && b.scenes - mid.scenes <= 2, [mid?.scenes, b?.scenes]);
  check(`changes: no main-thread task over ${limit} ms (longest ${m.task} ms, ${at()})`, m.task <= limit, m);
});

await finish();
