// The browser suite for the spot card's opening: when a field has just been outlined, the card must not ask the page for a size inside the tap itself (that makes the browser lay the whole page out on the spot).
// It counts every size the card or its map box is asked for between the release of the mouse and the next frame (load cannot change that count), checks the figure is in the page at once and the card ends up shown, placed inside the map and focused,
// and shows the longest main-thread task in that stretch (judged only when the computer is not busy). Run: node scripts/e2e_spot_layout.mjs
import os from 'node:os';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('spot_layout');
const { js, until, size, send, go, check, group, finish, sleep } = run;
// The copy under test has no Python, so the server's own lookups cannot answer there. The early lookups a chosen place starts (js/report-load.js prefetchPlace)
// are answered "not read" at the page, as scripts/e2e_flow.mjs does, so the copy's refusals are not logged as errors of the page. /api/health still goes to the server.
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, ...rest) => /[/]api[/](smaproot|cropsnear|imergrain|gracecell|ecopass|hlsndvi|dem|ndvihist)[?]/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify({ ok: false, reason: 'not in this copy' }), { headers: { 'content-type': 'application/json' } })) : first(u, ...rest); })();" });
const busy = os.loadavg()[0] > 3 * os.cpus().length;
const LONG_MS = 120;   // a task this long is felt on a phone's slowed processor (4x); 50 ms on a fast one. Written 2026-11-14; to be set from a measurement taken with the load under 30.
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
const HOOK = `(() => {
  const P = window.__lay = { on: false, reads: [], long: [], figureInTask: null, done: false };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) P.long.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); } catch (e) {}
  const mine = el => el && el.classList && (el.classList.contains('spot') || el.classList.contains('mapx'));
  const watch = (proto, prop) => { const d = Object.getOwnPropertyDescriptor(proto, prop); Object.defineProperty(proto, prop, { ...d, get() { if (P.on && mine(this)) P.reads.push(prop); return d.get.call(this); } }); };
  for (const k of ['clientWidth', 'clientHeight']) watch(Element.prototype, k);
  for (const k of ['offsetWidth', 'offsetHeight', 'offsetLeft', 'offsetTop']) watch(HTMLElement.prototype, k);
  const g = Element.prototype.getBoundingClientRect; Element.prototype.getBoundingClientRect = function () { if (P.on && mine(this)) P.reads.push('getBoundingClientRect'); return g.call(this); };
  addEventListener('pointerup', () => { P.on = true; P.long = []; requestAnimationFrame(() => { P.on = false; P.figureInTask = !!document.querySelector('.spot-big'); P.done = true; });
    let frames = 0; const look = () => { const s = document.querySelector('.spot');
      if (s && s.style.opacity === '') { const m = document.querySelector('#mapx').getBoundingClientRect(), q = s.getBoundingClientRect(); P.shown = { frames, inside: q.left >= m.left - 1 && q.right <= m.right + 1 && q.top >= m.top - 1 && q.bottom <= m.bottom + 1, focused: s.contains(document.activeElement) }; return; }
      if (++frames < 60) requestAnimationFrame(look); }; requestAnimationFrame(look); }, true);
})()`;

await group('spot card: opening after a finished rectangle', async () => {
  await size(1280); await go('/'); await acceptWelcome(); await go('/');
  await until(`[...document.querySelectorAll('button')].some(b => /Find it on the map/.test(b.textContent))`, 60000);
  await js(`[...document.querySelectorAll('button')].find(b => /Find it on the map/.test(b.textContent)).click()`);
  await until(`document.querySelector('#mapx') && document.querySelector('#mapxCanvas') && document.querySelector('[data-tool=rect]')`, 60000);
  await sleep(800);
  await js(HOOK);
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const c = await js(`(() => { const r = document.querySelector('#mapxCanvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await js(`document.querySelector('[data-tool=rect]').click()`);
  const a = { x: c.x - 80, y: c.y - 60 }, b = { x: c.x + 90, y: c.y + 50 };
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
  await until(`window.__lay.done`, 30000);
  await until(`!!window.__lay.shown`, 30000);
  await sleep(300);
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const r = await js(`({ reads: window.__lay.reads, long: window.__lay.long, figureInTask: window.__lay.figureInTask, shown: window.__lay.shown })`);
  console.log('spot card:', JSON.stringify({ sizeReadsInTheTap: r.reads.length, which: [...new Set(r.reads)], longTasksMs: r.long, load: Math.round(os.loadavg()[0]) }));
  check('the card asks the page for no size inside the tap that finished the outline (each ask lays the page out on the spot)', r.reads.length === 0, r.reads);
  check('the figure is in the page in the same tap', r.figureInTask === true, r.figureInTask);
  check('then the card is shown within a few frames, inside the map, and has the focus', !!r.shown && r.shown.frames < 20 && r.shown.inside && r.shown.focused, r.shown);
  const longest = Math.max(0, ...r.long);
  if (busy) console.log(`not judged (busy, load ${os.loadavg()[0].toFixed(0)})  no task over ${LONG_MS} ms between the release and the next frame  (${longest} ms)`);
  else check(`no task over ${LONG_MS} ms between the release and the next frame, on a 4x slowed processor`, longest <= LONG_MS, r.long);
});
await finish();
