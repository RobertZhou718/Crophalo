// The 3D look of one field: the same field, plan and date as the Map, as a slab of land with what covers the ground (standing plants, young plants, low residue,
// bare soil). The words and a skeleton of the scene show at once; the picture is built in a worker where the browser can (else on the page, in small steps), so
// the page never freezes, and anything that goes wrong is said in words. Checked by scripts/e2e_3d_open.mjs (My farm) and scripts/e2e_farm3d.mjs (the test page).
/*
 * const view = await view3d(input, node, options)   resolves once the first picture is drawn, or with view.ok false and the reason in view.status
 *   options: { offPage (draw in a worker where the browser can), compact (no label line: the page already shows date, plan and Planned), motion ('' | 'less' | 'reduce'),
 *              signal (an AbortSignal: stop and free everything), onCancel() (adds Back to the Map), onFallback(why), refuseSoftware (on the page only) }
 * view.update(nextInput)   view.dispose()   view.ok   view.status   view.camera()   view.stats() (a promise)   view.drawn(), view.lightCount() (a number on the page, a promise off it)
 */
import { groundScene, budgetFor } from './farm3d-data.js';
import { createDrawer, makeContext, STEPS } from './farm3d-draw.js';
import { firstView, firstViewFacts, createOrbit } from './farm3d-orbit.js';
import { shellHTML, legendFor } from './farm3d-shell.js';
import { createLand, attachLand, landMessage } from './land3d-load.js';
import { cleanChoice, STORAGE_KEY as LAND_KEY, toggleWords, sourcesNeeded } from './land3d-data.js';
import { sunEvents, clock } from './sun.js';
import { shadeFor } from './shade3d.js';
import { lossStep, WORDS as RULE_WORDS } from './farm3d-rule.js';
import { yieldToBrowser } from './engine-client.js';
import { esc } from './words.js';

const THREE_URL = new URL('../vendor/three/three.module.js', import.meta.url).href;
const UTILS_URL = new URL('../vendor/three/addons/utils/BufferGeometryUtils.js', import.meta.url).href;
const WORKER_URL = new URL('./farm3d-worker.js', import.meta.url);
const SLOW_MS = 8000;
const WORDS = {
  'no-webgl': 'This device cannot draw 3D. The Map shows the same field, plan and date.',
  'load-failed': 'The 3D view could not load. The Map shows the same field, plan and date.',
  slow: 'This is taking long on this device. The Map shows the same field, plan and date.',
  lost: '3D paused. The device needed its graphics memory. The Map shows the same field.',
};
const reducedDevice = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const narrow = () => { try { return matchMedia('(max-width: 599px)').matches; } catch { return false; } };
// a canvas that can be handed to a worker; a browser whose workers cannot load a module, or cannot draw, says so with an error and the page draws instead
const canOffPage = () => typeof HTMLCanvasElement === 'function' && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function' && typeof OffscreenCanvas === 'function' && typeof Worker === 'function';
// the softer software check of an old browser is kept for the test page: a canvas with no drawing context at all
export function softwareRenderer(gl) {
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; return /swiftshader|llvmpipe|software|basic render/i.test(name); } catch { return false; }
}

// ---- the words beside the picture, from the scene (they never wait for the picture)
const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const showNote = sc => { const n = norm(sc.words.note), c = norm(sc.words.cover); if (!n) return false; const head = c.split(' ').slice(0, 3).join(' '); return !(n === c || n.startsWith(head) || c.startsWith(n)); };
const stampOf = sc => { const e = sc.echo || {}, g = e.ground; return { field: e.fieldId ?? '', plan: e.planKind ?? '', date: e.date ?? '', ground: g?.state ?? 'none', crop: g?.crop ?? '', stage: g?.stage ?? '', label: g?.label ?? '' }; };
const stampHTML = sc => Object.entries(stampOf(sc)).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
const labelHTML = sc => `<strong>${esc(sc.label.state === 'not read yet' ? 'Not read yet' : sc.label.state)}</strong> · ${esc(sc.label.plan)} · ${esc(sc.label.dateWords)}`;
// What the side panel says, in two parts. First what the farmer sees on this day, and only what matters for THIS field today (an outline that is only estimated, heights that were not read, the year replay's legend): at most four short sentences.
// Everything else (the date it was sown, the outline as drawn, the heights as read with the height map's credit, the sun, that plants are symbols, the keys) is under one "Show more". Each line is [class, text, more].
const linesOf = sc => [['f3d-cover', sc.words.cover, false], ['f3d-past', sc.words.past || '', false], ['f3d-outline', sc.words.outline, !sc.field.estimated], ['f3d-heights', sc.words.heights, sc.heights.status === 'read'],
  ['f3d-credit', sc.words.credit || '', sc.heights.status === 'read'],   // the height map's credit and licence, only while heights are drawn
  ['f3d-sown', showNote(sc) ? sc.words.note : '', true], ['f3d-sun', sc.words.sun, true], ['f3d-note', sc.words.illustrative, true]].filter(([, text]) => text);
const wordsOf = sc => ({ label: labelHTML(sc), legend: legendFor(sc.cover), lines: linesOf(sc).map(([cls, text, more]) => ({ cls, text, more })), aria: sc.aria, stamp: stampHTML(sc) });
const sky = sc => `linear-gradient(180deg, ${sc.sky.top} 0%, ${sc.sky.bottom} 100%)`;
const fieldKey = sc => JSON.stringify([sc.field.polygon.length, sc.slab.width, sc.slab.depth, sc.field.estimated]);
const cloneable = input => { const out = { ...input }; delete out.loadHeights; return out; };   // a worker takes data only

// ---- two ways to draw, one shape: start, scene, pose, size, ask, dispose. say(message) hears step, ready, shown, fail, lost, restored.
function workerDrawer(canvas, say) {
  let offscreen, worker;
  try { offscreen = canvas.transferControlToOffscreen(); worker = new Worker(WORKER_URL, { type: 'module', name: 'crophalo-3d' }); } catch { return null; }
  const asks = new Map(); let n = 0, gone = false;
  worker.onmessage = e => { const m = e.data || {}; if (m.type === 'answer') { asks.get(m.id)?.(m.value); asks.delete(m.id); } else say(m); };
  worker.onerror = e => { e.preventDefault?.(); say({ type: 'fail', why: 'worker' }); };
  worker.onmessageerror = () => say({ type: 'fail', why: 'worker' });
  return {
    kind: 'worker',
    start(input, size, pose, budget) { worker.postMessage({ type: 'start', canvas: offscreen, input, size, pose, budget }, [offscreen]); },
    scene: input => worker.postMessage({ type: 'scene', input }),
    pose: pose => worker.postMessage({ type: 'pose', pose }),
    sun: ms => worker.postMessage({ type: 'sun', ms }),
    size: (width, height, dpr) => worker.postMessage({ type: 'size', width, height, dpr }),
    ask: what => gone ? Promise.resolve(null) : new Promise(done => { const id = ++n; asks.set(id, done); worker.postMessage({ type: 'ask', id, what }); setTimeout(() => { if (asks.has(id)) { asks.delete(id); done(null); } }, 8000); }),
    dispose() { if (gone) return; gone = true; for (const done of asks.values()) done(null); asks.clear(); try { worker.postMessage({ type: 'dispose' }); } catch { /* it had ended */ } setTimeout(() => worker.terminate(), 50); },
  };
}
function pageDrawer(canvas, say, refuseSoftware) {
  const shadeView = shadeFor({ say: () => { if (last && !gone) { sunDirty = true; if (!showing) relight(); } } });
  const land = createLand({ fetchImpl: (u, o) => fetch(u, o), base: new URL('../', import.meta.url).href, say: () => { if (last && !gone) display(last); } });
  let last = null, drawer = null, gone = false, shownAt = 0, ready = false, scenes = 0, pending = null, size = null, pose = null, sunMs = null, showing = 0, relighting = false, sunDirty = false;
  const withSun = input => (sunMs == null ? input : { ...input, hourMs: sunMs });
  const display = input => {
    if (!drawer) { pending = input; return; }
    last = input;
    const use = withSun(input), mine = ++shownAt, sc = attachLand(land, shadeView.attach(groundScene({ ...use, plantLimit: drawer.budget.plants }), use), use);
    showing++;
    drawer.show(sc).then(done => { showing--; if (!done || gone || mine !== shownAt) return; scenes++; say(shadeView.message(sc)); say(landMessage(sc, drawer.stats().details, land)); if (!ready) { ready = true; say({ type: 'ready' }); } else say({ type: 'shown', scenes }); if (sunDirty) relight(); },
      e => { showing--; say({ type: 'fail', why: 'error', message: String(e?.message || e).slice(0, 200) }); });
  };
  async function relight() {   // only the sun moved: the ground and the light again, nothing rebuilt; asks that come meanwhile fold into the newest
    if (relighting) return;
    relighting = true;
    try {
      while (sunDirty && drawer && last && !gone && !showing) {
        sunDirty = false;
        const use = withSun(last), sc = attachLand(land, shadeView.attach(groundScene({ ...use, plantLimit: drawer.budget.plants }), use), use);
        if (await drawer.relight(sc) && !gone) { say(shadeView.message(sc)); say({ type: 'sunshown', ms: sc.momentMs }); }
      }
    } catch (e) { say({ type: 'fail', why: 'error', message: String(e?.message || e).slice(0, 200) }); } finally { relighting = false; }
  }
  return {
    kind: 'page',
    async start(input, s, p, budget) {
      pending = input; size = s; pose = p;
      await null;   // every answer comes after start() has returned
      const gl = makeContext(canvas, { antialias: !!budget.antialias, refuseSoftware });
      if (!gl) { say({ type: 'fail', why: 'no-webgl' }); return; }
      say({ type: 'step', step: 'tools' });
      let THREE, Utils;
      try { [THREE, Utils] = await Promise.all([import(THREE_URL), import(UTILS_URL)]); } catch { say({ type: 'fail', why: 'load-failed' }); return; }
      await yieldToBrowser();
      if (gone) return;
      const made = createDrawer({ THREE, Utils, canvas, gl, makeCanvas: (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h }), budget, pause: yieldToBrowser,
        onProgress: step => say({ type: 'step', step }), onLost: () => say({ type: 'lost' }), onRestored: () => say({ type: 'restored' }) });
      if (made.failed) { say({ type: 'fail', why: made.failed }); return; }
      drawer = made;
      if (size) drawer.size(size.width, size.height, size.dpr);
      if (pose) drawer.pose(pose);
      await yieldToBrowser();
      if (!gone) display(pending);
    },
    scene: display,
    sun: ms => { sunMs = Number.isFinite(ms) ? ms : null; sunDirty = true; if (!showing) relight(); },
    pose: p => { pose = p; drawer?.pose(p); },
    size: (width, height, dpr) => { size = { width, height, dpr }; drawer?.size(width, height, dpr); },
    ask: async what => !drawer ? null : what === 'stats' ? { ...drawer.stats(), drawn: drawer.drawn(), lights: drawer.lightCount() } : what === 'drawn' ? drawer.drawn() : drawer.lightCount(),
    sync: what => !drawer ? 0 : what === 'drawn' ? drawer.drawn() : drawer.lightCount(),
    dispose() { gone = true; shadeView.dispose(); land.dispose(); drawer?.dispose(); drawer = null; },
  };
}

const views = new WeakMap();
let counter = 0;
export async function view3d(input, node, options = {}) {
  if (options.signal?.aborted) return { ok: false, status: 'closed', node, update() {}, dispose() {} };   // stopped before it began: nothing is drawn or started
  views.get(node)?.dispose();   // one view per place: an older one there is freed first
  const ids = 'f3d' + (++counter), compact = !!options.compact, motion = options.motion ?? (reducedDevice() ? 'reduce' : '');
  let choice = cleanChoice(options.landChoice ?? readChoice());
  let phone = narrow(), current = { ...input, land: { choice } }, sc = groundScene({ ...cloneable(current), phone, plants: false });
  node.innerHTML = shellHTML({ ids, compact, words: wordsOf(sc), back: typeof options.onCancel === 'function', shade: options.shade === false ? null : choice.shade === true, land: options.land === false ? null : choice });
  const root = node.firstElementChild, stage = root.querySelector('.f3d-stage'), sk = root.querySelector('.f3d-sk'), bar = root.querySelector('.f3d-sk-bar'), stepEl = root.querySelector('.f3d-sk-step'), waitEl = root.querySelector('.f3d-wait');
  let canvas = root.querySelector('.f3d-canvas');
  stage.style.background = sky(sc);

  const view = { ok: false, status: 'building', node, scenes: 0, update() {}, dispose() {}, scene: () => sc, weak: false };
  views.set(node, view);
  let sunMs = null, startDrawing = () => {}, finish = () => {}, disposed = false, drawer = null, triedPage = false, area = null, orbit = null, frame = 0, updateFrame = 0, lastField = fieldKey(sc);
  const done = new Promise(resolve => { finish = () => { resolve(view); finish = () => {}; }; });

  // ---- the camera: it exists from the first moment the picture has a size; the buttons wake up with the picture
  const aspect = () => area ? area.width / Math.max(1, area.height) : 16 / 9;
  const sendPose = () => { if (orbit) drawer?.pose(orbit.pose()); };
  const tick = () => { frame = 0; if (disposed || !orbit) return; const moving = orbit.step(); sendPose(); if (moving) kick(); };
  const kick = () => { if (!frame && !disposed) frame = requestAnimationFrame(tick); };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    if (disposed) return;
    const r = entries[entries.length - 1].contentRect; if (!(r.width > 0 && r.height > 0)) return;
    area = { width: r.width, height: r.height, dpr: globalThis.devicePixelRatio || 1 };
    if (!orbit) orbit = createOrbit(firstView(sc, aspect()), { damping: motion === '' }); else orbit.refit(firstView(sc, aspect()));
    drawer?.size(area.width, area.height, area.dpr); sendPose(); startDrawing();
  }) : null;
  ro?.observe(stage);
  if (!ro) { area = { width: 960, height: 540, dpr: 1 }; orbit = createOrbit(firstView(sc, aspect()), { damping: motion === '' }); }

  // ---- what the drawing side says
  const progress = step => {
    const s = STEPS[step]; if (!s || view.status !== 'building') return;
    const now = Math.round(s.share * 100); if (now <= +bar.getAttribute('aria-valuenow')) return;
    bar.firstElementChild.style.transform = `scaleX(${s.share})`; bar.setAttribute('aria-valuenow', String(now)); bar.setAttribute('aria-valuetext', s.words);
    if (!root.classList.contains('is-slow')) stepEl.textContent = s.words;
  };
  const becomeReady = () => {
    if (view.status !== 'building') return;
    clearTimeout(watchdog);
    view.ok = true; view.status = 'ready'; root.dataset.state = 'ready'; stage.setAttribute('aria-busy', 'false');
    bar.firstElementChild.style.transform = 'scaleX(1)'; bar.setAttribute('aria-valuenow', '100');
    for (const b of root.querySelectorAll('.f3d-btn')) b.disabled = false;
    if (motion === '') { sk.classList.add('is-done'); setTimeout(() => { sk.hidden = true; }, 180); } else sk.hidden = true;
    finish();
  };
  const fail = why => {
    if (disposed) return;
    if (!triedPage && drawer?.kind === 'worker' && (why === 'no-webgl' || why === 'worker')) {   // a browser whose workers cannot draw: once more, on the page, on a new canvas
      triedPage = true; drawer.dispose();
      const fresh = document.createElement('canvas'); fresh.className = 'f3d-canvas'; fresh.setAttribute('aria-hidden', 'true'); canvas.replaceWith(fresh); canvas = fresh;
      drawer = pageDrawer(canvas, hear, !!options.refuseSoftware); drawer.start(cloneable({ ...current, phone }), area, orbit?.pose(), budget);
      return;
    }
    const status = why === 'no-webgl' ? 'no-webgl' : why === 'load-failed' ? 'load-failed' : 'failed';
    if (view.status === 'ready' && status === 'failed') return;   // a picture is up: a later failure of one change keeps it
    clearTimeout(watchdog); stopAll();
    node.innerHTML = `<p class="f3d-plain" role="status">${WORDS[status === 'no-webgl' ? 'no-webgl' : 'load-failed']}</p>`;
    view.ok = false; view.status = status;
    options.onFallback?.(status);
    finish();
  };
  let losses = 0;
  function retry() {   // "Try 3D again": a new canvas and a new drawer for the same scene, behind the same skeleton
    if (disposed) return;
    waitEl.hidden = true; view.status = 'building'; root.dataset.state = 'building'; stage.setAttribute('aria-busy', 'true'); sk.hidden = false; sk.classList.remove('is-done');
    drawer?.dispose();
    const fresh = document.createElement('canvas'); fresh.className = 'f3d-canvas'; fresh.setAttribute('aria-hidden', 'true'); canvas.replaceWith(fresh); canvas = fresh;
    drawer = options.offPage && canOffPage() ? workerDrawer(canvas, hear) : pageDrawer(canvas, hear, !!options.refuseSoftware);
    drawer.start(cloneable({ ...current, phone }), area, orbit?.pose(), budget);
  }
  const began = performance.now();
  view.timeline = [];   // when each step was heard, in ms from the start: for the checks and for anyone asking why a device is slow
  function hear(m) {
    if (disposed) return;
    if (m.type !== 'answer' && (view.status === 'building' || m.type !== 'step') && view.timeline.length < 200) view.timeline.push([m.type === 'step' ? m.step : m.type, Math.round(performance.now() - began)]);   // the build's steps, then only what happens after it
    if (m.type === 'step') { progress(m.step); tell('f3d-step', { step: m.step, share: STEPS[m.step]?.share ?? null }); }
    else if (m.type === 'ready') { becomeReady(); tell('f3d-ready', {}); }
    else if (m.type === 'sunshown') view.sunShown = m.ms;
    else if (m.type === 'shown') view.scenes = m.scenes;
    else if (m.type === 'shade') showShade(m);
    else if (m.type === 'land') showLand(m);
    else if (m.type === 'fail') fail(m.why);
    else if (m.type === 'lost') {   // the graphics memory was taken back: the first time 3D is paused and can be tried again, the second time the board is shown (js/farm3d-rule.js)
      losses++;
      const step = lossStep(losses);
      if (step.action === 'board') { view.status = 'context-lost'; options.onFallback?.('lost-twice'); return; }
      view.status = 'context-lost'; waitEl.hidden = false; waitEl.textContent = step.say + ' ';
      const again = Object.assign(document.createElement('button'), { type: 'button', className: 'btn lg f3d-again', textContent: step.again });
      again.addEventListener('click', retry); waitEl.append(again);
    }
    else if (m.type === 'restored') { waitEl.hidden = true; view.status = 'ready'; }
  }
  // the steps are on the progress line for whoever asks; only a slow build is said aloud (the status region would otherwise speak every step)
  const watchdog = setTimeout(() => { if (view.status === 'building' && !disposed) { root.classList.add('is-slow'); stepEl.textContent = WORDS.slow; stepEl.removeAttribute('aria-hidden'); } }, SLOW_MS);

  const budget = budgetFor({ phone, dpr: globalThis.devicePixelRatio || 1, cores: globalThis.navigator?.hardwareConcurrency || 0, memoryGB: globalThis.navigator?.deviceMemory || 0 });

  // ---- the words follow every change at once; the picture follows at most once a frame, and only when it would look different
  function refreshWords() {
    const label = root.querySelector('.f3d-label'); if (label) label.innerHTML = labelHTML(sc);
    const act = legendFor(sc.cover);
    root.querySelectorAll('.f3d-legend li').forEach((li, i) => { const on = ['standing', 'residue', 'bare'][i] === act; li.classList.toggle('is-on', on); if (on) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current'); });
    const lines = linesOf(sc), main = root.querySelector('.f3d-words'), more = root.querySelector('.f3d-more-lines');
    for (const [node, part] of [[main, lines.filter(l => !l[2])], [more, lines.filter(l => l[2])]]) { if (!node) continue; const html = part.map(([cls, text]) => `<p${cls ? ` class="${cls}"` : ''}>${esc(text)}</p>`).join(''); if (node.dataset.html !== html) { node.innerHTML = html; node.dataset.html = html; } }
    if (stage.getAttribute('aria-label') !== sc.aria) stage.setAttribute('aria-label', sc.aria);
    for (const [k, v] of Object.entries(stampOf(sc))) if (stage.dataset[k] !== String(v)) stage.dataset[k] = String(v);
    stage.style.background = sky(sc);
  }
  function apply() {
    updateFrame = 0; if (disposed) return;
    sc = groundScene({ ...cloneable({ ...current, hourMs: sunMs ?? current.hourMs }), phone, plants: false });
    refreshWords();
    if (choice.shade === true) fillHour();
    const key = fieldKey(sc);
    if (key !== lastField) { lastField = key; orbit?.refit(firstView(sc, aspect())); sendPose(); }
    drawer?.scene(cloneable({ ...current, phone }));
    wantHeights(current);
  }
  view.update = next => { if (disposed || !next) return; current = { ...next, land: { choice }, hourMs: current.hourMs }; if (!updateFrame) updateFrame = requestAnimationFrame(apply); };

  // ---- heights: the caller may hand them over, or a loader to ask for them once
  let heightsToken = 0;
  async function wantHeights(inp) {
    const loader = typeof inp.loadHeights === 'function' ? inp.loadHeights : sourcesNeeded({ ...choice, scale: false }).includes('heights') ? async req => (await import('./heights3d.js')).loadHeights(req) : null;   // the shade needs the heights: asked once, only when it is switched on
    if (inp.heights !== undefined || !loader) return;
    const token = ++heightsToken;
    waitEl.hidden = false; waitEl.textContent = "Reading the land's heights…";
    let grid = null; try { grid = await loader(sc.heightRequest); } catch { grid = null; }
    if (disposed || token !== heightsToken) return;
    waitEl.hidden = true;
    current = { ...inp, heights: grid || { failed: 'The land heights could not be read right now.' } };
    if (!updateFrame) updateFrame = requestAnimationFrame(apply);
  }
  wantHeights(current);

  // ---- the shade: the switch (kept on this device), the hour shown, and the shade job's words
  function readChoice() { try { return JSON.parse(localStorage.getItem(LAND_KEY)); } catch { return null; } }
  const shadeBox = root.querySelector('.f3d-shade'), hourBox = root.querySelector('.f3d-hour'), hourEl = root.querySelector('[data-hour]'), hourOut = root.querySelector('.f3d-hour-out'), shadeWords = root.querySelector('[data-shade-words]');
  const zone = () => ({ zone: current.zone, offsetMin: current.offsetMin, lon: sc.slab.lon });
  function fillHour() {   // the range runs from sunrise to sunset of the date shown, in steps of 10 minutes
    if (!hourEl) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(current.date || ''), ev = m ? sunEvents({ y: +m[1], m: +m[2], d: +m[3] }, sc.slab.lat, sc.slab.lon) : null;
    if (!ev || ev.state === 'night') { hourEl.disabled = true; hourOut.textContent = 'The sun does not rise on this day here.'; return; }
    const from = ev.state === 'day' ? ev.noon - 12 * 36e5 : ev.rise, to = ev.state === 'day' ? ev.noon + 12 * 36e5 : ev.set, floor10 = t => Math.floor(t / 6e5) * 6e5, ceil10 = t => Math.ceil(t / 6e5) * 6e5;
    hourEl.disabled = false; hourEl.min = String(floor10(from)); hourEl.max = String(ceil10(to)); hourEl.step = '600000';
    const at = Number.isFinite(current.hourMs) ? current.hourMs : sc.momentMs;
    hourEl.value = String(Math.min(+hourEl.max, Math.max(+hourEl.min, Math.round(at / 6e5) * 6e5)));
    hourOut.textContent = clock(+hourEl.value, zone());
  }
  function showShade(m) {
    if (!shadeWords) return;
    const lines = m.state === 'off' ? [] : m.words;
    if (m.state === 'off') return;
    shadeWords.replaceChildren(...lines.map(t => Object.assign(document.createElement('p'), { className: 'f3d-sw-words', textContent: t })));
    shadeWords.dataset.state = m.state;
    view.shade = m;
  }
  view.shade = { state: choice.shade === true ? 'waiting' : 'off', words: [] };
  const onShade = e => {
    if (e.target.matches?.('[data-shade]')) {
      const on = e.target.checked;
      choice = cleanChoice({ ...choice, shade: on }); if (!on) delete choice.shade;
      try { localStorage.setItem(LAND_KEY, JSON.stringify(choice)); } catch { /* a device that keeps nothing */ }
      hourBox.hidden = !on;
      if (on) { fillHour(); shadeWords.replaceChildren(Object.assign(document.createElement('p'), { className: 'f3d-sw-words', textContent: 'Working out the shade…' })); }
      else shadeWords.replaceChildren(Object.assign(document.createElement('p'), { className: 'f3d-sw-words', textContent: 'Shade off.' }));
      current = { ...current, land: { choice } };
      if (!updateFrame) updateFrame = requestAnimationFrame(apply);
    } else if (e.target.matches?.('[data-hour]')) {
      hourOut.textContent = clock(+e.target.value, zone());
      current = { ...current, hourMs: +e.target.value };
      if (!updateFrame) updateFrame = requestAnimationFrame(apply);
    }
  };
  root.addEventListener('input', onShade); root.addEventListener('change', onShade);
  if (choice.shade === true) fillHour();
  // ---- the details on the land: the switches, their words as the maps answer, the credit; the choice is kept on this device
  const landSay = root.querySelector('.f3d-land-say'), creditEl = root.querySelector('.f3d-land-credit');
  view.land = { layers: [], report: [], credit: null };
  function showLand(m) {
    view.land = m;
    for (const l of m.layers) { const el = root.querySelector(`[data-land-words="${l.id}"]`); if (el) { const note = m.report.find(r => r.id === l.id)?.note; el.textContent = [...l.words, note].filter(Boolean).join(' '); el.dataset.state = l.state; } }
    for (const sw of root.querySelectorAll('[data-land]')) if (choice[sw.dataset.land] !== true) { const el = root.querySelector(`[data-land-words="${sw.dataset.land}"]`); if (el && el.dataset.state) { el.textContent = el.dataset.line || el.textContent; delete el.dataset.state; } }
    if (creditEl) creditEl.hidden = !m.credit;
  }
  for (const el of root.querySelectorAll('[data-land-words]')) el.dataset.line = el.textContent;
  const onLand = e => {
    const sw = e.target.closest?.('[data-land]'); if (!sw || !root.contains(sw)) return;
    choice = cleanChoice({ ...choice, [sw.dataset.land]: sw.checked });
    if (!sw.checked) delete choice[sw.dataset.land];
    try { localStorage.setItem(LAND_KEY, JSON.stringify(choice)); } catch { /* a device that keeps nothing */ }
    if (landSay) landSay.textContent = toggleWords(sw.dataset.land, sw.checked);
    current = { ...current, land: { choice } };
    if (!updateFrame) updateFrame = requestAnimationFrame(apply);
  };
  root.addEventListener('change', onLand);

  // ---- the camera by hand: drag to turn, right-drag or two fingers to slide, wheel or pinch to come closer; the buttons and keys always have a way back
  const pointers = new Map();
  const onDown = e => {
    if (!orbit || e.target.closest('.f3d-tools, .f3d-sk-card')) return;
    try { stage.setPointerCapture(e.pointerId); } catch { /* a pointer that has already gone */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, slide: e.button === 2 || e.ctrlKey || e.metaKey || e.shiftKey });
  };
  const onMove = e => {
    const p = pointers.get(e.pointerId); if (!p || !orbit) return;
    const h = area?.height || 400;
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()], before = Math.hypot(a.x - b.x, a.y - b.y), mid0 = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      p.x = e.clientX; p.y = e.clientY;
      const after = Math.hypot(a.x - b.x, a.y - b.y), mid1 = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (before > 0 && after > 0) orbit.dolly(before / after);
      orbit.slide(mid1[0] - mid0[0], mid1[1] - mid0[1], h);
    } else {
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (p.slide) orbit.slide(dx, dy, h); else orbit.rotate(dx, dy, h);
    }
    kick();
  };
  const onUp = e => { pointers.delete(e.pointerId); try { stage.releasePointerCapture(e.pointerId); } catch { /* not held */ } };
  const onWheel = e => { if (!orbit) return; e.preventDefault(); orbit.wheel(e.deltaY); kick(); };
  const onMenu = e => e.preventDefault();
  const turn = deg => { orbit?.turn(deg); sendPose(); };
  const zoom = k => { if (orbit?.zoom(k)) sendPose(); };
  const act = { left: () => turn(-15), right: () => turn(15), in: () => zoom(0.8), out: () => zoom(1.25), reset: () => { orbit?.reset(firstView(sc, aspect())); sendPose(); }, back: () => options.onCancel?.() };
  const onClick = e => { const b = e.target.closest('[data-act]'); if (b && root.contains(b)) act[b.dataset.act]?.(); };
  const onKey = e => {
    if (e.target !== stage || !orbit) return;
    const h = area?.height || 400;
    if (e.key === '+' || e.key === '=') zoom(0.8); else if (e.key === '-') zoom(1.25); else if (e.key === '0') act.reset();
    else if (e.shiftKey && e.key === 'ArrowLeft') turn(-15); else if (e.shiftKey && e.key === 'ArrowRight') turn(15);
    else if (e.key === 'ArrowLeft') { orbit.keyPan(7, 0, h); sendPose(); } else if (e.key === 'ArrowRight') { orbit.keyPan(-7, 0, h); sendPose(); }
    else if (e.key === 'ArrowUp') { orbit.keyPan(0, 7, h); sendPose(); } else if (e.key === 'ArrowDown') { orbit.keyPan(0, -7, h); sendPose(); }
    else return;
    e.preventDefault();
  };
  stage.addEventListener('pointerdown', onDown); stage.addEventListener('pointermove', onMove); stage.addEventListener('pointerup', onUp); stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('wheel', onWheel, { passive: false }); stage.addEventListener('contextmenu', onMenu); stage.addEventListener('keydown', onKey);
  node.addEventListener('click', onClick);

  function stopAll() {
    disposed = true;
    cancelAnimationFrame(frame); cancelAnimationFrame(updateFrame); ro?.disconnect(); clearTimeout(watchdog); clearTimeout(startTimer);
    stage.removeEventListener('pointerdown', onDown); stage.removeEventListener('pointermove', onMove); stage.removeEventListener('pointerup', onUp); stage.removeEventListener('pointercancel', onUp);
    stage.removeEventListener('wheel', onWheel); stage.removeEventListener('contextmenu', onMenu); stage.removeEventListener('keydown', onKey);
    node.removeEventListener('click', onClick); root.removeEventListener('input', onShade); root.removeEventListener('change', onShade); root.removeEventListener('change', onLand);
    drawer?.dispose(); drawer = null;
    if (views.get(node) === view) views.delete(node);
  }
  view.dispose = () => {
    if (disposed) return;
    stopAll();
    node.replaceChildren(); view.ok = false; view.status = 'closed';
    finish();
  };
  options.signal?.addEventListener('abort', () => view.dispose(), { once: true });

  // ---- and only now, with every listener in place, the drawing starts: at the first moment the page has laid itself out (handing the canvas to a worker
  // while the layout is still to be done would make the page do it there and then), or after a short wait if that moment does not come
  let started = false;
  startDrawing = () => {
    if (started || disposed) return; started = true; clearTimeout(startTimer);
    drawer = options.offPage && canOffPage() ? workerDrawer(canvas, hear) : null;
    if (!drawer) { triedPage = true; drawer = pageDrawer(canvas, hear, !!options.refuseSoftware); }
    drawer.start(cloneable({ ...current, phone }), area, orbit?.pose(), budget);
  };
  const startTimer = setTimeout(startDrawing, 120);

  // ---- for the page's own motion (js/macro-*.js): the first view's facts, and a time of day for the sun. Nothing here changes what 3D shows unless it is called.
  const tell = (name, detail) => { try { root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true })); } catch { /* an old browser */ } };
  view.firstView = () => (area && sc ? firstViewFacts(sc, aspect(), { width: area.width, height: area.height }) : null);
  view.sunShown = null;
  view.sunDay = () => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(current.date || ''), ev = m ? sunEvents({ y: +m[1], m: +m[2], d: +m[3] }, sc.slab.lat, sc.slab.lon) : null; return ev ? { rise: ev.rise ?? null, noon: ev.noon ?? null, set: ev.set ?? null, state: ev.state } : null; };
  view.sun = ms => {   // a time of day for the shown date (ms), or null for the date's own time; the words follow, so they never state another time
    if (disposed) return null;
    sunMs = Number.isFinite(ms) ? ms : null;
    sc = groundScene({ ...cloneable({ ...current, hourMs: sunMs ?? current.hourMs }), phone, plants: false });
    refreshWords();
    drawer?.sun(sunMs);
    const s = sc.suns?.[0] || sc.sun;
    return { ms: sc.momentMs, azimuth: s?.azimuth ?? null, height: s?.height ?? null, up: !!s?.up, words: sc.words.sun };
  };
  view.camera = () => { const p = orbit?.pose(); return p ? { position: p.position, target: p.target, moved: orbit.moved } : null; };
  view.stats = () => drawer ? drawer.ask('stats').then(s => s && { ...s, scenes: Math.max(s.scenes ?? 0, view.scenes), kind: drawer?.kind }) : Promise.resolve(null);
  view.drawn = () => drawer?.kind === 'page' ? drawer.sync('drawn') : drawer?.ask('drawn') ?? 0;
  view.lightCount = () => drawer?.kind === 'page' ? drawer.sync('lights') : drawer?.ask('lights') ?? 0;
  return done;
}
