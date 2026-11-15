// Crophalo's small motions, in one module: the satellite-scan loader, numbers that roll into place, sections that ease in on scroll, the tab bar's glass and the page turn,
// view transitions with a plain fallback, the reading rail, "Watch the year", and the small states every control needs (saved, copied, added to your farm, the undo toast).
// The pure parts (timings, orders, counts, the watch-the-year machine) need no page; the rest reads only the page it is given. No network, no storage.
// The rules below are each pinned by scripts/test_fx.mjs and scripts/e2e_fx.mjs.
/*
 * fades, colour and smooth slides only; nothing bounces, springs, shrinks and grows back, or scales past full size; every curve is an out-curve that never passes its end;
 * one trigger plays one motion once (playOnce); text keeps its full contrast whenever it can be seen (sections ease in behind a cover, never by fading words);
 * anything that could move for more than 5 s can be stopped; everything is off under "Always still" (html[data-motion=reduce]) and under the device's reduce-motion choice;
 * no motion ever makes a tap wait: state changes first, motion follows.
 */

export const SCAN_S = 7;            // one full left-to-right pass of the satellite
export const YEAR_S = 9;            // "Watch the year": January to December
export const ROLL_MS = 1000;        // a number rolling into place
export const CURTAIN_MS = 820;      // a section's cover sliding off
export const GLASS_MS = 420;        // the tab glass moving from one tab to the next
export const PAGE_MS = 460;         // the page turn
export const FADE_MS = 160;         // the longest a word may be partly faded
export const RAIL_AT = 400;         // the reading rail shows after this much scrolling
export const PARCELS = 12;          // the fields that light up while a report is built
export const STAGGER_MS = 70;       // sections that arrive together, one step apart by position modulo four
export const VT_GUARD_MS = 80;      // a view transition that has not run the update by now is skipped: a tap never waits for a snapshot
export const TOAST_MS = 6000;       // an undo toast stays this long (and while the pointer or focus is on it)
export const EASE = 'cubic-bezier(.2,.8,.2,1)';   // the one curve: it never passes its end

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---- the still switch: the farmer's own choice and the device's. Every motion asks first.
export const still = () => {
  try { return document.documentElement.dataset.motion === 'reduce' || matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
};
// ---- the three levels: html[data-motion] is '' (Full), 'less' or 'reduce' (Still); the device's reduce-motion counts as Still.
// Full runs everything. Less runs only fades and colour changes of 200 ms or less (and the press, hover and focus states): no scans or sweeps, nothing that draws itself, rolls, slides or loops.
// Still runs nothing. Every motion asks less() first: it is true under both Less and Still, and says "show it finished".
export const level = () => (still() ? 'still' : document.documentElement.dataset.motion === 'less' ? 'less' : 'full');
export const less = () => level() !== 'full';
const stillListeners = new Set();
export const onStill = fn => { watchStill(); stillListeners.add(fn); return () => stillListeners.delete(fn); };
let watching = false;
function watchStill() {   // one watcher: when stillness comes on, every running motion is finished at once
  if (watching || typeof document === 'undefined') return; watching = true;
  const run = () => { if (less()) for (const fn of [...stillListeners]) { try { fn(); } catch { /* one motion failing never stops the rest */ } } };
  try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', run); } catch { /* an old browser: the attribute still counts */ }
  new MutationObserver(run).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
}

// ---- one trigger, one motion, once
const played = new WeakMap();
export function playOnce(el, key) {
  const keys = played.get(el) || played.set(el, new Set()).get(el);
  if (keys.has(key)) return false;
  keys.add(key); return true;
}

// ---- pure: curves, counts, orders, clocks
export const easeOut = t => { const k = clamp(t, 0, 1); return 1 - (1 - k) ** 3; };   // 0 to 1, never past 1
export const rollValue = (from, to, k) => from + (to - from) * easeOut(k);
export const stagger = i => (Math.abs(Math.trunc(i)) % 4) * STAGGER_MS;
// The same twelve parcels in the same order every time: a small seeded shuffle (no randomness anywhere).
export function parcelOrder(n = PARCELS, seed = 7) {
  const out = Array.from({ length: n }, (_, i) => i); let s = seed >>> 0;
  for (let i = n - 1; i > 0; i--) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const j = s % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export const litCount = (done, total, n = PARCELS) => (total > 0 && done > 0 ? clamp(Math.round(done / total * n), 0, n) : 0);   // round(done / total × 12) fields are green
// The delay that keeps one clock for the satellite: a redraw at any moment lands on the same place of the pass, so the pass never restarts.
export const scanDelay = (nowMs, startMs, periodS = SCAN_S) => -(((nowMs - startMs) / 1000) % periodS);
export const railFraction = (scrollY, docHeight, viewHeight) => { const room = docHeight - viewHeight; return room > 0 ? clamp(scrollY / room, 0, 1) : 0; };
export const railShown = (scrollY, on = true) => !!on && scrollY > RAIL_AT;
export const turnDirection = (from, to) => (to > from ? 'forward' : to < from ? 'back' : 'none');
export const formatRoll = (n, decimals = 0, locale = 'en-CA') => n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// "Watch the year": a state machine. Moving: a 9 s sweep, one Stop button. Still: one month a press ("Next month", at the end "Finish"). Months 0 to 11.
export function yearStart(still0) { return { phase: 'idle', month: -1, still: !!still0 }; }
export function yearLabel(st) {
  if (st.still) return st.phase === 'done' ? 'Watch the year' : st.month >= 11 ? 'Finish' : 'Next month';
  return st.phase === 'playing' ? 'Stop' : st.phase === 'stopped' || st.phase === 'done' ? 'Watch again' : 'Watch the year';
}
export function yearPress(st) {   // what a press of the button does
  if (st.still) { if (st.phase === 'done') return { phase: 'idle', month: -1, still: true }; const m = st.month + 1; return m > 11 ? { phase: 'done', month: 11, still: true } : { phase: 'stepping', month: m, still: true }; }
  if (st.phase === 'playing') return { ...st, phase: 'stopped' };
  return { phase: 'playing', month: 0, still: false };
}
export const yearMonthAt = (elapsedMs, totalS = YEAR_S) => clamp(Math.floor(elapsedMs / (totalS * 1000) * 12), 0, 11);
export const yearDone = (elapsedMs, totalS = YEAR_S) => elapsedMs >= totalS * 1000;

// ---- the satellite-scan loader: twelve fields that turn green as sources answer, a satellite crossing left to right (7 s), a progress bar and the words
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, kids = []) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); for (const c of kids) e.append(c); return e; };
let scanStart = null;
export function scanLoader(node, { total = 1, label = 'Building your report' } = {}) {
  scanStart ??= performance.now();
  node.classList.add('fx-scan');
  node.setAttribute('role', 'group'); node.setAttribute('aria-label', label);
  const order = parcelOrder(), art = el('svg', { viewBox: '0 0 300 90', class: 'fx-scan-art', 'aria-hidden': 'true', focusable: 'false' });
  art.append(el('rect', { x: 0, y: 0, width: 300, height: 90, rx: 10, class: 'fx-ground' }));
  const cells = [];
  for (let k = 0; k < PARCELS; k++) {   // 6 across, 2 down; each a little different, the same every time
    const col = k % 6, row = Math.floor(k / 6), jitter = ((k * 37) % 7) - 3;
    const r = el('rect', { x: 8 + col * 48 + jitter * 0.4, y: 8 + row * 40, width: 42 - Math.abs(jitter) * 0.6, height: 34 + (jitter > 0 ? 2 : -2), rx: 4, class: 'fx-parcel', 'data-i': String(k) });
    art.append(r); cells.push(r);
  }
  const sat = el('g', { class: 'fx-sat' }, [el('rect', { x: -9, y: -4, width: 18, height: 8, rx: 2, class: 'fx-sat-body' }), el('rect', { x: -2, y: -12, width: 4, height: 8, class: 'fx-sat-wing' }), el('line', { x1: 0, y1: 4, x2: 0, y2: 120, class: 'fx-sat-line' })]);
  art.append(sat);
  const bar = document.createElement('div'); bar.className = 'fx-progress'; bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Sources answered'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', '0');
  const fill = document.createElement('i'); bar.append(fill);
  const words = document.createElement('p'); words.className = 'fx-scan-words'; words.setAttribute('aria-live', 'polite');
  const pause = document.createElement('button'); pause.type = 'button'; pause.className = 'fx-quiet'; pause.setAttribute('aria-pressed', 'false'); pause.textContent = 'Pause the picture';
  node.replaceChildren(art, bar, words, pause);
  sat.style.setProperty('--fx-delay', scanDelay(performance.now(), scanStart) + 's');   // the shared clock
  const ctl = {
    update(done, all = total) {
      const n = litCount(done, all);
      cells.forEach((c, i) => c.classList.toggle('is-read', order.indexOf(i) < n));
      const pct = all > 0 ? Math.round(clamp(done / all, 0, 1) * 100) : 0;
      bar.setAttribute('aria-valuenow', String(pct)); const f = pct / 100; fill.style.transform = `scaleX(${f})`;   // a share of 0 to 1: pct is already held to 0..100 above
      words.textContent = `${done} of ${all} sources answered`;
      if (all > 0 && done >= all) ctl.finish();
    },
    finish() { node.classList.add('is-done'); },   // the pass ends by itself when everything has answered
    pause(on) { node.classList.toggle('is-paused', !!on); pause.setAttribute('aria-pressed', String(!!on)); pause.textContent = on ? 'Play the picture' : 'Pause the picture'; },
    lit: () => cells.filter(c => c.classList.contains('is-read')).length,
  };
  pause.addEventListener('click', () => ctl.pause(!node.classList.contains('is-paused')));
  ctl.update(0, total);
  return ctl;
}

// ---- numbers that roll into place: the words are the real number from the first moment (for a screen reader); the picture counts up once, 1 s, then is plain text again
export function rollNumbers(root = document, { selector = '[data-roll]', io = typeof IntersectionObserver === 'function' ? IntersectionObserver : null } = {}) {
  watchStill();
  const nodes = [...root.querySelectorAll(selector)].filter(n => !played.get(n)?.has('roll'));
  const run = node => {
    if (!playOnce(node, 'roll')) return;
    const final = node.textContent, match = /-?\d[\d,]*\.?\d*/.exec(final);
    if (!match || less()) return;
    const target = Number(match[0].replace(/,/g, '')), decimals = (match[0].split('.')[1] || '').length;
    if (!Number.isFinite(target)) return;
    const shown = document.createElement('span'); shown.setAttribute('aria-hidden', 'true'); const sr = document.createElement('span'); sr.className = 'fx-sr'; sr.textContent = final;
    const head = final.slice(0, match.index), tail = final.slice(match.index + match[0].length);
    node.replaceChildren(shown, sr);
    const began = performance.now(); let frame = 0;
    const done = () => { cancelAnimationFrame(frame); node.textContent = final; stillOff(); };
    const stillOff = onStill(done);
    const tick = now => { const k = (now - began) / ROLL_MS; if (k >= 1) return done(); shown.textContent = head + formatRoll(rollValue(0, target, k), decimals) + tail; frame = requestAnimationFrame(tick); };
    shown.textContent = head + formatRoll(0, decimals) + tail; frame = requestAnimationFrame(tick);
  };
  if (!io) { nodes.forEach(run); return { nodes: nodes.length }; }
  const obs = new io(entries => { for (const e of entries) if (e.isIntersecting) { obs.unobserve(e.target); run(e.target); } }, { threshold: 0.4 });
  nodes.forEach(n => obs.observe(n));
  return { nodes: nodes.length, disconnect: () => obs.disconnect() };
}

// ---- sections that ease in on scroll: a cover the colour of the page slides off downward (text is under the cover, so it never has to fade slowly). Only what is below the fold.
export function reveal(root = document, { selector = '[data-reveal]', io = typeof IntersectionObserver === 'function' ? IntersectionObserver : null } = {}) {
  watchStill();
  if (!io || less()) return { covered: 0 };
  const items = [...root.querySelectorAll(selector)].filter(n => !played.get(n)?.has('reveal') && n.getBoundingClientRect().top > innerHeight * 0.92);
  const open = (n, delay = 0) => { if (!n.classList.contains('fx-pending')) return; n.style.setProperty('--fx-step', delay + 'ms'); n.classList.add('fx-in'); n.addEventListener('transitionend', () => n.classList.remove('fx-pending', 'fx-in'), { once: true }); setTimeout(() => n.classList.remove('fx-pending', 'fx-in'), CURTAIN_MS + 400 + delay); };
  const obs = new io(entries => { entries.filter(e => e.isIntersecting).forEach((e, i) => { obs.unobserve(e.target); open(e.target, stagger(i)); }); }, { rootMargin: '0px 0px -8% 0px' });
  for (const n of items) { if (!playOnce(n, 'reveal')) continue; n.classList.add('fx-pending'); obs.observe(n); n.addEventListener('focusin', () => open(n), { once: true }); }   // keyboard focus and find-in-page open it at once
  const all = () => items.forEach(n => n.classList.remove('fx-pending', 'fx-in'));
  onStill(all); addEventListener('beforeprint', all, { once: true });
  return { covered: items.length, disconnect: () => obs.disconnect() };
}

// ---- a view that has just been shown fades (and, under Full, rises a little) into place. Nothing when Still. Used by pages that change views themselves.
export function arrive(node) {
  if (!node || still()) return false;
  node.classList.remove('fx-arrive');
  requestAnimationFrame(() => { node.classList.add('fx-arrive'); node.addEventListener('animationend', () => node.classList.remove('fx-arrive'), { once: true }); });   // next frame: no layout is forced in the middle of the change
  return true;
}

// ---- the tab bar's glass: the chosen state changes at once; the glass slides from the old tab to the new one (a slide of place and width, 420 ms, never past the tab)
export function tabGlass(list, { onSelect } = {}) {
  watchStill();
  const tabs = [...list.querySelectorAll('[role=tab]')]; if (!tabs.length) return null;
  list.classList.add('fx-tabs');
  const glass = document.createElement('span'); glass.className = 'fx-glass'; glass.setAttribute('aria-hidden', 'true'); list.prepend(glass);
  const place = t => { const l = list.getBoundingClientRect(), r = t.getBoundingClientRect(); return { x: r.left - l.left + list.scrollLeft, w: r.width }; };
  let at = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'); if (at < 0) at = 0;
  const set = p => { glass.style.transform = `translateX(${p.x}px)`; glass.style.width = p.w + 'px'; };
  const settle = () => set(place(tabs[at]));
  settle();
  const choose = (i, { animate = true } = {}) => {
    const before = place(tabs[at]), dir = turnDirection(at, i);
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });   // the state first: a tap never waits for motion
    at = i; onSelect?.(i, dir);
    const after = place(tabs[i]);
    glass.getAnimations().forEach(a => a.cancel());
    set(after);   // the finished place is the truth; the slide below only shows the way there, so a missed finish can never leave the glass behind
    if (!animate || less() || before.x === after.x) return;
    glass.animate([{ transform: `translateX(${before.x}px)`, width: before.w + 'px' }, { transform: `translateX(${after.x}px)`, width: after.w + 'px' }], { duration: GLASS_MS, easing: EASE, id: 'fxt-glass' });
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => choose(i)));
  list.addEventListener('keydown', e => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!k) return; e.preventDefault(); const n = (at + k + tabs.length) % tabs.length; choose(n); tabs[n].focus(); });
  onStill(() => glass.getAnimations().forEach(a => a.finish()));
  addEventListener('resize', settle);
  return { choose, settle, glass };
}
// The glass for a tab bar that is drawn again at each change (the report draws its whole page anew): it is put under the chosen tab and, when the place it had before is given, slides from there.
// Answers the place it now has, to be given back the next time. Nothing slides under Less or Still.
export function glassMount(list, from = null) {
  const sel = list.querySelector('[role=tab][aria-selected=true]'); if (!sel) return null;
  list.classList.add('fx-tabs');
  const glass = document.createElement('span'); glass.className = 'fx-glass'; glass.setAttribute('aria-hidden', 'true'); list.prepend(glass);
  const l = list.getBoundingClientRect(), r = sel.getBoundingClientRect(), to = { x: r.left - l.left + list.scrollLeft, w: r.width };
  glass.style.transform = `translateX(${to.x}px)`; glass.style.width = to.w + 'px';
  if (from && !less() && (from.x !== to.x || from.w !== to.w)) glass.animate([{ transform: `translateX(${from.x}px)`, width: from.w + 'px' }, { transform: `translateX(${to.x}px)`, width: to.w + 'px' }], { duration: GLASS_MS, easing: EASE, id: 'fxt-glass' });
  return to;
}
// the page turn: the new panel slides 24 px in from the side of travel (460 ms) with a 160 ms fade; never past the edge, so 320 px never scrolls sideways
export function pageTurn(panel, dir = 'forward') {
  if (less() || dir === 'none') return null;
  panel.getAnimations().filter(a => String(a.id).startsWith('fxt-')).forEach(a => a.cancel());   // one turn at a time
  const from = dir === 'back' ? -24 : 24;
  const slide = panel.animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }], { duration: PAGE_MS, easing: EASE, id: 'fxt-turn' });
  panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: EASE, id: 'fxt-fade' });
  return slide;
}

// ---- view transitions: the browser's own when it has them, a plain arrive (fade and rise) when it does not, nothing when still. The update runs first either way.
// The default is the plain arrive: the update runs first, then the new view fades and rises. The browser's own transition (native: true) is for pages that have shown it is cheap:
// even skipped after 80 ms it can hold a tap for a frame on a very slow phone, and no tap may wait more than 200 ms.
export async function transitionView(update, { dir = 'forward', node = null, timeout = 1600, native = false } = {}) {
  watchStill();
  const arrive = () => { if (node && !still()) { node.classList.remove('fx-arrive'); void node.offsetWidth; node.classList.add('fx-arrive'); node.addEventListener('animationend', () => node.classList.remove('fx-arrive'), { once: true }); } };
  if (still()) { await update(); return 'none'; }
  if (!native || less() || typeof document.startViewTransition !== 'function') { await update(); arrive(); return 'fallback'; }   // under Less the new view only fades (css/fx.css)
  document.documentElement.dataset.fxDir = dir;
  let called = false;
  const vt = document.startViewTransition(() => { called = true; return update(); });
  const guard = setTimeout(() => { if (!called) { try { vt.skipTransition(); } catch { /* it had ended */ } } }, VT_GUARD_MS);   // slow snapshot (a slow phone): the update runs now and the screen simply changes
  const safety = setTimeout(() => { try { vt.skipTransition(); } catch { /* it had ended */ } }, timeout);   // a stuck transition is skipped at 1.6 s
  vt.ready?.catch?.(() => {}); vt.finished?.catch?.(() => {});   // a skipped transition rejects these: that is expected, not an error
  try { await vt.updateCallbackDone; } finally { clearTimeout(guard); clearTimeout(safety); vt.finished?.finally?.(() => { delete document.documentElement.dataset.fxDir; }); }
  return 'transition';
}

// ---- the reading rail: a fixed 3 px bar at the top whose width is the scroll fraction; it shows after 400 px
export function readingRail({ on = true, doc = document, win = window } = {}) {
  let rail = doc.getElementById('fx-rail');
  if (!rail) { rail = doc.createElement('div'); rail.id = 'fx-rail'; rail.className = 'fx-rail'; rail.setAttribute('aria-hidden', 'true'); const i = doc.createElement('i'); rail.append(i); doc.body.append(rail); }
  const bar = rail.firstElementChild; let frame = 0, enabled = on;
  const draw = () => { frame = 0; const y = win.scrollY, f = railFraction(y, doc.documentElement.scrollHeight, win.innerHeight); bar.style.transform = `scaleX(${f})`; rail.classList.toggle('is-on', railShown(y, enabled)); };
  const ask = () => { if (!frame) frame = win.requestAnimationFrame(draw); };   // once a frame
  win.addEventListener('scroll', ask, { passive: true }); win.addEventListener('resize', ask, { passive: true }); draw();
  return { rail, set(v) { enabled = !!v; ask(); }, dispose() { win.removeEventListener('scroll', ask); win.removeEventListener('resize', ask); rail.remove(); } };
}

// ---- Watch the year: a button under a calendar of twelve columns. Moving: a 9 s sweep and a Stop button. Still: one month a press.
// columns: twelve elements; their title attribute is the words ("Jul: hot days · corn"), so the live text can never disagree with the calendar.
export function watchYear({ columns, button, live, raf = requestAnimationFrame, cancel = cancelAnimationFrame, now = () => performance.now() }) {
  watchStill();
  let st = yearStart(less()), frame = 0, began = 0;
  const show = () => {
    columns.forEach((c, i) => { c.classList.toggle('fx-passed', i <= st.month); c.classList.toggle('fx-now', i === st.month); });
    button.textContent = yearLabel(st); button.setAttribute('aria-pressed', String(st.phase === 'playing'));
    if (live) live.textContent = st.month >= 0 ? (columns[st.month]?.getAttribute('title') || '') : '';
  };
  const stop = () => { cancel(frame); frame = 0; };
  const tick = t => {
    if (st.phase !== 'playing') return;
    const elapsed = t - began;
    if (yearDone(elapsed)) { st = { phase: 'done', month: 11, still: false }; show(); return; }
    const m = yearMonthAt(elapsed); if (m !== st.month) { st = { ...st, month: m }; show(); }
    frame = raf(tick);
  };
  button.addEventListener('click', () => {
    stop(); st = { ...st, still: less() };
    const wasPlaying = st.phase === 'playing';
    st = yearPress(st);
    if (st.phase === 'playing' && !wasPlaying) { began = now(); show(); frame = raf(tick); } else show();
  });
  onStill(() => { stop(); st = { phase: st.phase === 'playing' ? 'stopped' : st.phase, month: st.month, still: true }; show(); });
  show();
  return { state: () => st, stop: () => { stop(); if (st.phase === 'playing') st = { ...st, phase: 'stopped' }; show(); } };
}

// ---- the small states
export function markSaved(button, on = true, { say } = {}) {
  button.setAttribute('aria-pressed', String(!!on)); button.classList.toggle('fx-saved', !!on);
  say?.(on ? 'Saved.' : 'Removed from saved.');
}
const TICK = '<svg class="fx-tick" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>';
export function copied(button, text, { label = 'Copied', writer = navigator.clipboard?.writeText?.bind(navigator.clipboard), say } = {}) {
  if (button.classList.contains('fx-copied')) return null;   // one press, one message, until it has gone
  const was = button.innerHTML;
  const done = () => { button.innerHTML = `${TICK}<span>${label}</span>`; button.classList.add('fx-copied'); say?.(label + '.'); const t = setTimeout(() => { button.innerHTML = was; button.classList.remove('fx-copied'); }, 2000); return t; };
  return Promise.resolve(writer ? writer(text) : null).then(done, () => { say?.('Could not copy.'); });
}
export function added(button, { label = 'Added to your farm', say } = {}) {
  button.innerHTML = `${TICK}<span>${label}</span>`; button.classList.add('fx-added'); button.setAttribute('aria-disabled', 'true'); say?.(label + '.');
  return button;
}
// The undo toast: fades and slides in (400 ms), stays 6 s and while the pointer or focus is on it; a second message while it shows replaces the words with a soft flash, no bump.
let toastEl = null, toastTimer = 0;
export function toast(message, { undo, ms = TOAST_MS, doc = document } = {}) {
  let region = doc.getElementById('fx-toasts');
  if (!region) { region = doc.createElement('div'); region.id = 'fx-toasts'; region.className = 'fx-toasts'; region.setAttribute('role', 'status'); region.setAttribute('aria-live', 'polite'); doc.body.append(region); }
  const fill = t => {
    t.replaceChildren(); const p = doc.createElement('span'); p.textContent = message; t.append(p);
    if (typeof undo === 'function') { const b = doc.createElement('button'); b.type = 'button'; b.className = 'fx-toast-undo'; b.textContent = 'Undo'; b.addEventListener('click', () => { try { undo(); } finally { dismiss(); } }); t.append(b); }
  };
  const dismiss = () => { clearTimeout(toastTimer); const t = toastEl; toastEl = null; if (!t) return; t.classList.remove('is-in'); setTimeout(() => t.remove(), still() ? 0 : 400); };
  const arm = () => { clearTimeout(toastTimer); toastTimer = setTimeout(dismiss, ms); };
  if (toastEl) { fill(toastEl); toastEl.classList.remove('fx-flash'); void toastEl.offsetWidth; if (!less()) toastEl.classList.add('fx-flash'); arm(); return { dismiss, node: toastEl }; }
  const t = doc.createElement('div'); t.className = 'fx-toast'; fill(t); region.append(t); toastEl = t;
  requestAnimationFrame(() => t.classList.add('is-in'));
  t.addEventListener('pointerenter', () => clearTimeout(toastTimer)); t.addEventListener('pointerleave', arm); t.addEventListener('focusin', () => clearTimeout(toastTimer)); t.addEventListener('focusout', arm);
  arm();
  return { dismiss, node: t };
}
