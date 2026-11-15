// Crophalo's conductor for the big, choreographed animations: the named times and curves, the three levels (Full, Less, Still), the input rule, the chain budget, play-once,
// the camera owner, the quality step, the polite announcer, number rolls and the play bar. A scene is only a description; this file alone decides how it plays.
// Pure where it can be (the curves, the table of scenes, the budget, the quality rule); the rest reads the page only when a scene plays. No network, no storage.
// Checked by scripts/test_macro.mjs (the pure parts, with small stand-ins for the page) and scripts/e2e_macro.mjs (in a real browser).
/*
 * The rules that never bend live here and nowhere else: nothing flashes; anything over 5 s is started by a press and has Pause and Skip; any input ends every running scene
 * in the same frame and is never prevented; words are never faded over T.QUICK; Less is fades of 200 ms or less; Still and the device's reduce-motion setting move nothing
 * and start no frame loop; no curve leaves 0..1; a scene never makes a tap wait; a rolled number ends on the page's own text; the end of Full equals Still.
 *
 * Decisions taken where the plan left a detail open (each is written in the report too):
 * - SCENES is the declared table of every scene of the plan: its screen (the chain key), its length, whether it is big, auto or a film, and "at", the moment it starts
 *   after its screen change (0: it is the change itself; a number: it follows the change; null: it waits for data or a view and is judged by chain(screen).left() when
 *   it comes). A scene whose name is not in the table plays its Still form. The declared length is a ceiling: a longer spec is cut to it. A scene's own spec may make it
 *   stricter (auto: true), never looser: only the table says a scene is not auto.
 * - The chain clock is wall time from the screen change. The screen change starts it: become() does, and so does chain(screen).start() by hand. A scene whose "at" is 0
 *   starts it only when the chain was never started, when the last chain is spent (4.8 s are over), or when it is played with play({ change: true }); otherwise it is
 *   judged against what is left like any other auto scene. A scene that plays on a chain never started counts the chain as started "at" ms before it.
 * - T.FLIGHT is the laptop flight; T.FLIGHT_PHONE (2100) is the phone's. T.PRESS_MAX (5000) is the length over which a scene needs a press and a play bar.
 * - On a phone the table's phone length is already the phone's length: x 0.7 is added to it only when the frames were measured slow. On a laptop, low quality
 *   (small memory or slow frames) is x 0.7. may() answers that factor as k, and the length it allows as ms.
 * - A Full scene's paint(k, dt) gets the raw share of time k = 0..1; the scene applies its own curve from ease.
 * - An interrupt calls the scene's stop() when it has one (a camera scene), else its end(); then every Web Animation under its host is finished, committed and cancelled.
 *   A film (a scene over 5 s) skips to its end on an input outside its play bar. Tab, Shift+Tab and a bare modifier key do not end a Full film that has its play bar,
 *   because the plan's two rules meet here (every key interrupts; Pause is reachable by Tab) and the play bar must be reachable; every other scene ends on them as usual.
 * - A hidden tab pauses a film and ends every other scene at its finished state (end(), never the interrupt's stop()), as "the final view at once" asks.
 * - A Full scene listens from the frame after play(); an input before that frame still ends it when the event is later than play() (event.timeStamp).
 * - When a film's play bar goes while focus is on it, focus moves to controls.back when given, else to controls.host, so it never drops to the page.
 * - Less and Still films: end() at once (the screen is complete), then "Step through" shows steps.at(i) per press (a T.QUICK fade at Less, none at Still).
 * - claimCamera: 'descent' and 'lift' may take the camera from 'closeup' (the satellite close-up is a look, not a flight); the loser hears 'crophalo:camera' on document.
 *   Any other claim while someone holds it answers false.
 * - quality(): phones (a coarse pointer or a window under 600 px) and devices with under 4 GB start low. Low is pixel ratio 1, lengths x 0.7 and 36 slices.
 *   The first 30 frames of each Full scene that paints are judged (a new one starts a new window); a median over 22 ms steps down; back up after 10 s with no slow verdict.
 * - say(text) speaks once per screen change, counted by js/hooks.js (one per outermost hook call); a second sentence in the same change is dropped. The conductor's own
 *   live region is laid empty the first time a scene plays, and a region that has only just been laid gets its words on the next tick, so readers hear them.
 * - roll() leaves the page's own text alone and rolls only an aria-hidden painted copy. It rolls only when the page prints the value exactly once at number boundaries;
 *   the element's own child nodes are kept in the visually hidden copy while it rolls and put back at the end. At Less and Still the element is never touched.
 * - _clock and _peek are seams for the suites only (as farm.js has _map and _ui): the time, the frame request and the count of frames this file asked for.
 */
import { level, formatRoll } from './fx.js';
import { changes } from './hooks.js';

export { level };   // the one reading: 'full' | 'less' | 'still'; the device's reduce-motion setting always counts as 'still'

// ---- the named curves: every control point inside 0..1, so nothing bounces or passes its end
export const EASE = Object.freeze({
  ARRIVE: 'cubic-bezier(.16, 1, .3, 1)',   // anything landing: a fast start and a long soft stop
  GLIDE: 'cubic-bezier(.65, 0, .35, 1)',   // camera legs and the tilt: even at both ends
  LEAVE: 'cubic-bezier(.4, 0, 1, 1)',      // things going away, 160 to 240 ms only
  FADE: 'cubic-bezier(0, 0, .2, 1)',       // opacity only
  EVEN: 'linear',                          // the time axis of any data that plays: a year is a year
});

const clamp01 = x => (x > 0 ? (x < 1 ? x : 1) : 0);   // NaN counts as 0
const bez = (p1, p2, t) => { const u = 1 - t; return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t; };
// A cubic Bézier from (0,0) to (1,1) as a function of time. x only climbs when both x points are inside 0..1, so halving the interval finds t for any x.
function curve(x1, y1, x2, y2) {
  return x => {
    const at = clamp01(x); if (at === 0 || at === 1) return at;
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (bez(x1, x2, mid) < at) lo = mid; else hi = mid; }
    return clamp01(bez(y1, y2, (lo + hi) / 2));
  };
}
// The same curves as functions for canvas and WebGL scenes: clamped to 0..1 in and out.
export const ease = Object.freeze({ arrive: curve(0.16, 1, 0.3, 1), glide: curve(0.65, 0, 0.35, 1), leave: curve(0.4, 0, 1, 1), fade: curve(0, 0, 0.2, 1), even: clamp01 });

// ---- the named times (ms). No macro file writes a number for a duration that is not here.
export const T = Object.freeze({
  QUICK: 160, LESS_MAX: 200, STEP: 320, TURN: 560, HOLD: 120, STAGGER: 60, STAGGER_MAX: 8, OPEN_MAX: 2000,
  FLIGHT: 3200, FLIGHT_PHONE: 2100, AUTO_MAX: 4800, PRESS_MAX: 5000, SKIP_UNDER: 600, FAST_FORWARD: 200,
  BEAT: 150, YEAR: 400, MONTH: 750, MONTH_FILM: 900, DAY: 8000,
});
// Siblings arrive T.STAGGER apart; the ninth and later arrive with the eighth.
export const stagger = i => Math.min(Math.max(0, Math.trunc(i) || 0), T.STAGGER_MAX - 1) * T.STAGGER;

// ---- the declared scenes of every package. screen: the chain key. at: when it starts after its screen change (0: it is the change; null: on data or view).
const S = (screen, ms, { big = false, auto = true, at = 0, phone = ms } = {}) => Object.freeze({ screen, ms, phone, big, auto, at, controls: !auto && ms > T.PRESS_MAX });
export const SCENES = Object.freeze({
  'first-light': S('home', 1600, { big: true, phone: 1200 }),
  'descent': S('setup', 3200, { big: true, phone: 2100 }),
  'rewind': S('setup', 560),
  'step-turn': S('step', 320),
  'season-sweep': S('layers', 34500, { auto: false }),
  'iris': S('loading', 560),
  'pullback': S('loading', 2400, { at: 560 }),
  'record-band': S('loading', 2100, { at: null }),
  'fold': S('report', 560),
  'curl': S('report', 600, { big: true }),
  'answer-rise': S('report', 320, { at: 300 }),
  'score-roll': S('report', 900, { at: 500 }),
  'what-if': S('what-if', 460),
  'chapter-turn': S('tab', 320),
  'three-futures': S('tab', 4200, { at: 320 }),
  'rings': S('tab', 3960, { at: 320 }),
  'relief': S('tab', 900, { at: 320 }),
  'relief-shade': S('tab', 600, { at: null }),
  'passes-rain': S('tab', 1800, { at: null }),
  'passes-water': S('tab', 2500, { at: null }),
  'passes-heat': S('tab', 1600, { at: null }),
  'record-film': S('weather-film', 10000, { auto: false }),
  'year-grows': S('calendar-film', 12000, { auto: false }),
  'field-home': S('added', 2100),
  'homecoming': S('farm', 560),
  'track-trace': S('farm', 800, { at: 500 }),
  'time-door': S('door', 420),
  'lift': S('3d', 1300, { big: true }),
  'skeleton': S('3d', 1200, { at: null }),
  'settle': S('board', 900),
  'play-day': S('day-film', 10000, { auto: false }),
  'season-film': S('season-film', 12000, { auto: false }),
  'twenty-five': S('history-film', 30000, { auto: false }),
  'greenness': S('history', 2500, { at: null }),
  'turn': S('page', 560),
  'roll': S(null, 900, { at: null }),
});

// ---- the seams for the suites: the clock, the frame request, and how many frames this file asked for
export const _clock = {
  now: () => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()),
  frame: fn => globalThis.requestAnimationFrame(fn),
  canFrame: () => typeof globalThis.requestAnimationFrame === 'function',
  rafCalls: 0,
};

const live = new Set();           // the running scenes (and the Less fades), each an inner record
const call = (fn, ...args) => { try { return typeof fn === 'function' ? fn(...args) : undefined; } catch (e) { globalThis.reportError?.(e); return undefined; } };   // a scene that throws never stops the screen
const doc = () => globalThis.document;

// ---- the chain budget: scenes that run one after another count as one scene
const chains = new Map();
const begin = (key, at) => { chains.set(key, at); };
export function chain(screen) {
  const key = String(screen ?? '');
  const left = () => { const at = chains.get(key); return at === undefined ? T.AUTO_MAX : Math.max(0, T.AUTO_MAX - (_clock.now() - at)); };
  return {
    screen: key,
    start() { begin(key, _clock.now()); return left(); },
    left,
    fits: ms => Number(ms) <= left(),
    began: () => chains.get(key) ?? null,
  };
}
// Is this play of a scene a new screen change of its chain? Only a scene that is the change (at 0) can be, and only on a chain that is not still running.
const isChange = (entry, change) => { if (entry.at !== 0) return false; const c = chain(entry.screen); return c.began() === null || c.left() === 0 || !!change; };
// What is left for a scene of this table entry now: a chain never started counts as started `at` ms ago; a new screen change has the whole budget.
function budgetOf(entry, change) {
  if (entry.screen === null) return T.AUTO_MAX;
  const c = chain(entry.screen);
  if (c.began() === null) return Math.max(0, T.AUTO_MAX - (entry.at || 0));
  return isChange(entry, change) ? T.AUTO_MAX : c.left();
}

// ---- play once per visit (in memory, never in storage: a reload plays it again)
const played = new Set();
export const once = key => { const k = String(key); if (played.has(k)) return false; played.add(k); return true; };

// ---- the one camera
let camera = null;
const TAKES = Object.freeze({ descent: ['closeup'], lift: ['closeup'] });
export function claimCamera(owner) {
  if (!owner) return false;
  if (camera === owner) return true;
  if (camera && !(Object.hasOwn(TAKES, owner) ? TAKES[owner] : []).includes(camera)) return false;
  const lost = camera; camera = owner;
  if (lost) call(() => doc()?.dispatchEvent?.(new CustomEvent('crophalo:camera', { detail: { owner, lost } })));
  return true;
}
export function releaseCamera(owner) { if (!owner || camera !== owner) return false; camera = null; return true; }
export const cameraOwner = () => camera;

// ---- phone and quality
const QUALITY = Object.freeze({ frames: 30, slowMs: 22, calmMs: 10000, lowK: 0.7, slices: 72, lowSlices: 36, highDpr: 2, phoneWidth: 600, memory: 4 });
export function phone() {
  try { if (globalThis.matchMedia?.('(pointer: coarse)')?.matches) return true; } catch { /* an old browser: the width still counts */ }
  const w = globalThis.innerWidth;
  return typeof w === 'number' && w > 0 && w < QUALITY.phoneWidth;
}
const smallMemory = () => { const m = globalThis.navigator?.deviceMemory; return typeof m === 'number' && m < QUALITY.memory; };
let slowAt = null, watch = null;   // when the frames were last judged slow; the intervals of the window being judged
const slowNow = () => { if (slowAt !== null && _clock.now() - slowAt >= QUALITY.calmMs) slowAt = null; return slowAt !== null; };   // ten calm seconds: back up
export function quality() {
  const low = phone() || smallMemory() || slowNow();
  return { low, k: low ? QUALITY.lowK : 1, dpr: low ? 1 : Math.min(Number(globalThis.devicePixelRatio) || 1, QUALITY.highDpr), slices: low ? QUALITY.lowSlices : QUALITY.slices };
}
// One frame interval of a scene being watched; the thirtieth closes the window and judges it by its median.
quality.feed = dt => {
  if (!(dt > 0)) return quality();
  (watch ||= []).push(dt);
  if (watch.length >= QUALITY.frames) { const s = [...watch].sort((a, b) => a - b), mid = s.length / 2; const median = (s[Math.floor(mid - 0.5)] + s[Math.ceil(mid - 0.5)]) / 2; if (median > QUALITY.slowMs) slowAt = _clock.now(); watch = null; }
  return quality();
};
quality.watch = () => { watch = []; };   // a new scene that paints: its own first 30 frames are judged, not the end of the last one
quality.reset = () => { slowAt = null; watch = null; };
// The length a scene may run on this device, and the factor that made it: the device's own column of the table, cut at its ceiling, then x 0.7 when low.
function lengthOf(entry, ms) {
  const onPhone = phone(), ceiling = onPhone ? entry.phone : entry.ms, want = Math.min(Number(ms) || ceiling, ceiling);
  const k = onPhone ? (slowNow() ? QUALITY.lowK : 1) : quality().k;
  return { want, k, len: want * k };
}

// ---- the polite announcer: one sentence per screen change, through the screen's own live region when it has one
let saidIn = -1;
function region(d, { lay = true } = {}) {   // the screen's own region when it is shown, else the conductor's one region (laid empty, once)
  const own = d.querySelector?.('#fwSay');
  if (own && !own.closest?.('[hidden]')) return { node: own, fresh: false };
  const mine = d.getElementById?.('macroSay');
  if (mine || !lay || !d.createElement || !d.body) return { node: mine || null, fresh: false };
  const node = d.createElement('div'); node.id = 'macroSay'; node.className = 'sr'; node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); d.body.append(node);
  return { node, fresh: true };
}
export function say(text) {
  const d = doc(); if (!text || !d?.createElement || !d.body) return false;
  const serial = changes();
  if (saidIn === serial) return false;
  saidIn = serial;
  const { node, fresh } = region(d);
  if (!node) return false;
  const words = String(text);
  if (fresh) setTimeout(() => { node.textContent = words; }, 0);   // a live region that arrives already filled is often not read: fill it on the next tick
  else node.textContent = words;
  return true;
}

// ---- the decision: how a scene may play now. The one place the Motion setting, the budget, the big-move rule and the quality are read together.
// change: this play is a new screen change of the scene's chain (see the decisions above).
export function may(name, { auto, ms, change = false } = {}) {
  const entry = Object.hasOwn(SCENES, name) ? SCENES[name] : null, q = quality(), base = level();
  if (!entry) return { level: 'still', k: q.k, dpr: q.dpr, budgetMs: 0, ms: 0 };
  const isAuto = entry.auto || auto === true, { want, k, len } = lengthOf(entry, ms);
  const budgetMs = budgetOf(entry, change);
  let lv = base;
  if (lv === 'full' && !_clock.canFrame()) lv = 'still';   // no frames at all: nothing can move
  if (lv === 'full') {
    if (isAuto && (want > T.AUTO_MAX || len > budgetMs)) lv = 'less';   // over the budget: its Less form, a T.QUICK fade
    if (!isAuto && want > T.PRESS_MAX && !entry.controls) lv = 'less';   // a long scene with no play bar in the table never plays by itself
    if (entry.big && [...live].some(s => s.big && s.screen === entry.screen && s.form === 'full')) lv = 'less';   // one big move per screen
  }
  return { level: lv, k, dpr: q.dpr, budgetMs, ms: len };
}

// ---- the shared clock: one frame request for every running Full scene, time-based so a slow phone does not drift
let looping = false, lastTick = null;
function loop() {
  if (looping) return;
  looping = true; _clock.rafCalls++;
  _clock.frame(tick);
}
function tick() {
  looping = false;
  const now = _clock.now(), dt = lastTick === null ? 0 : now - lastTick;
  lastTick = now;
  if (watch && dt > 0) quality.feed(dt);
  for (const s of [...live]) s.tick(now, dt);
  if ([...live].some(s => s.form === 'full' && !s.paused)) loop(); else lastTick = null;   // a paused film asks for no frames
}

// ---- the input rule
const INPUTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
const TO_THE_BAR = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta']);   // the keys that take a keyboard user to a film's Pause and Skip
// Pure: does this event end the running scenes? Every press, key (Tab too), wheel and touch does, except a press on a scene's own Pause and Skip.
export function interrupts(event) {
  if (!event || !INPUTS.includes(event.type)) return false;
  const t = event.target;
  try { if (t?.closest?.('[data-macro-control]')) return false; } catch { /* a target that is not an element still interrupts */ }
  return true;
}
function onInput(event) {   // never prevented: the tap does what it would have done anyway
  if (!interrupts(event)) return;
  const toBar = event.type === 'keydown' && TO_THE_BAR.has(event.key), at = typeof event.timeStamp === 'number' ? event.timeStamp : null;
  for (const s of [...live]) {
    if (!s.armed && !(at !== null && s.playedAt !== null && at > s.playedAt)) continue;   // the event that started the scene is not an interrupt; a later one is, even before the first frame
    if (s.film) { if (toBar && s.form === 'full' && s.hasBar()) continue; s.skip('input'); } else s.stop('input');
  }
}
let wired = false, lastLevel = null;
const levelFns = new Set();
function wire() {
  const d = doc(); if (wired || !d?.addEventListener) return; wired = true;
  for (const type of INPUTS) d.addEventListener(type, onInput, { capture: true, passive: true });
  d.addEventListener('crophalo:stop-timers', () => stopAll('timers'));
  d.addEventListener('visibilitychange', () => { if (!d.hidden) return; for (const s of [...live]) { if (s.film) s.pause(); else s.skip('hidden'); } });
  region(d);   // the announcer's region is on the page, empty, before its first sentence
  watchLevel();
}
function watchLevel() {
  const d = doc(); if (lastLevel !== null || !d) return;
  lastLevel = level();
  const changed = () => { const now = level(); if (now === lastLevel) return; lastLevel = now; stopAll('level'); for (const fn of [...levelFns]) call(fn, now); };
  try { globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', changed); } catch { /* the attribute still counts */ }
  if (typeof globalThis.MutationObserver === 'function' && d.documentElement) new MutationObserver(changed).observe(d.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
}
// A change of level at any moment ends every running scene at its end state, then tells fn the new level.
export function onLevel(fn) { if (typeof fn !== 'function') return () => false; levelFns.add(fn); watchLevel(); wire(); return () => levelFns.delete(fn); }

// ---- helpers for the DOM
const isCss = a => (typeof CSSAnimation === 'function' && a instanceof CSSAnimation) || (typeof CSSTransition === 'function' && a instanceof CSSTransition);
function settleAnimations(host) {   // a DOM scene jumps to its end: finish, keep the end, cancel (the stylesheet's own animations are left alone)
  if (!host?.getAnimations) return;
  for (const a of host.getAnimations({ subtree: true })) { if (isCss(a)) continue; try { a.finish(); a.commitStyles?.(); a.cancel(); } catch { /* it had ended */ } }
}
function fadeIn(host) {   // the one move of Less: opacity only, T.QUICK
  if (!host?.animate) return null;
  try { return host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.QUICK, easing: EASE.FADE }); } catch { return null; }
}
const FOCUSABLE = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/;
function giveFocus(el) {   // focus that was on a play bar that has gone lands here, never on the page itself
  if (!el?.focus) return;
  try { if (el.getAttribute?.('tabindex') == null && !FOCUSABLE.test(el.tagName || '')) el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); } catch { /* the page has moved on */ }
}

// ---- a scene: a description; the conductor decides how it plays
export function scene(spec = {}) {
  const name = String(spec.name || ''), entry = Object.hasOwn(SCENES, name) ? SCENES[name] : null;
  const rec = { name, screen: entry ? entry.screen : spec.screen ?? null, big: !!entry?.big, film: !!entry?.controls, form: '', armed: false, k: 0, paused: false, playedAt: null };
  let state = 'idle', began = 0, len = 0, pausedAt = 0, pausedFor = 0, drawn = false, bar = null, fade = null, step = -1, settle = () => {};
  const done = new Promise(resolve => { settle = resolve; });
  const drawEnd = () => { if (drawn) return; drawn = true; call(spec.end); };
  rec.hasBar = () => !!bar;
  const close = reason => {
    if (state === 'over') return;
    state = 'over'; live.delete(rec); rec.armed = false;
    if (rec.form === 'full' && bar) {   // a film's Pause and Skip go when it ends; the "Step through" of Less and Still stays with the finished screen
      const held = !!bar.node?.contains?.(doc()?.activeElement);
      bar.remove(); bar = null;
      if (held) giveFocus(spec.controls?.back || spec.controls?.host);
    }
    settle(reason);
  };
  rec.tick = (now, dt) => {
    if (state !== 'running' || rec.form !== 'full') return;
    if (!rec.armed) { rec.armed = true; if (!spec.paint) return; }   // the frame after play(): the event that started the scene is behind us
    if (rec.paused) return;
    rec.k = len > 0 ? clamp01((now - began - pausedFor) / len) : 1;
    if (spec.paint) { try { spec.paint(rec.k, dt); } catch (e) { globalThis.reportError?.(e); drawEnd(); return close('error'); } }
    if (rec.k >= 1) { drawEnd(); live.delete(rec); state = 'hold'; setTimeout(() => close('end'), T.HOLD); }   // the still beat at the end of a big move: nothing moves, so it is no longer running
  };
  rec.stop = (reason = 'stop') => {
    if (state === 'over' || state === 'idle') { if (state === 'idle') { drawEnd(); close(reason); } return; }
    if (fade) { try { fade.finish(); fade.cancel(); } catch { /* it had ended */ } }
    if (typeof spec.stop === 'function' && !drawn && rec.form === 'full') { drawn = true; call(spec.stop, reason); } else drawEnd();
    settleAnimations(spec.host);
    close(reason);
  };
  rec.skip = (reason = 'skip') => {   // Skip leaves the finished state, a camera scene included
    if (state === 'over') return;
    if (fade) { try { fade.finish(); fade.cancel(); } catch { /* it had ended */ } }
    drawEnd(); settleAnimations(spec.host); close(reason);
  };
  rec.pause = () => { if (state !== 'running' || rec.form !== 'full' || rec.paused) return; rec.paused = true; pausedAt = _clock.now(); bar?.sync(); };
  rec.resume = () => { if (!rec.paused) return; rec.paused = false; pausedFor += _clock.now() - pausedAt; bar?.sync(); if (state === 'running') loop(); };
  rec.step = () => {   // Less and Still films: one step per press, then round again
    const steps = spec.steps; if (!steps || !(steps.count > 0)) return -1;
    step = (step + 1) % steps.count; call(steps.at, step);
    if (rec.form === 'less') fadeIn(spec.host);
    return step;
  };
  const handle = {
    // change: true when this play is a new screen change of its chain although that chain is still running (a second report within 4.8 s, say)
    play({ change = false } = {}) {
      if (state !== 'idle') return done;
      const d = may(name, { auto: spec.auto, ms: spec.ms, change });
      rec.form = d.level === 'full' && rec.film && !spec.controls?.host ? 'less' : d.level;   // a film with nowhere to put Pause and Skip never plays by itself
      if (entry && entry.screen !== null) {
        const c = chain(entry.screen), now = _clock.now();
        if (c.began() === null) begin(entry.screen, now - (entry.at || 0));   // the screen change did not start its chain: count it as started when it must have been
        else if (isChange(entry, change)) begin(entry.screen, now);           // this scene is a new screen change: its chain clock starts now
      }
      if (rec.form === 'still') {
        drawEnd();
        if (rec.film && spec.steps && spec.controls?.host) bar = playbar(spec.controls.host, handle, spec.controls.words);
        state = 'over'; settle('still'); return done;
      }
      wire();
      if (rec.form === 'less') {
        drawEnd();
        if (rec.film && spec.steps && spec.controls?.host) bar = playbar(spec.controls.host, handle, spec.controls.words);
        fade = fadeIn(spec.host);
        if (!fade) { state = 'over'; settle('less'); return done; }
        state = 'running'; rec.armed = true; live.add(rec);
        fade.finished?.then(() => close('less'), () => close('less'));
        return done;
      }
      len = d.ms; began = _clock.now(); rec.playedAt = began; state = 'running'; live.add(rec);
      if (rec.film && spec.controls?.host) bar = playbar(spec.controls.host, handle, spec.controls.words);
      if (spec.paint) quality.watch();
      loop();
      return done;
    },
    pause: () => rec.pause(),
    resume: () => rec.resume(),
    skip: () => rec.skip('skip'),
    stop: (reason = 'stop') => rec.stop(reason),
    step: () => rec.step(),
    get form() { return rec.form; },
    get paused() { return rec.paused; },
    name,
    done,
  };
  return handle;
}

// Every running scene ends at its end state (an interrupt, the stop-timers event, a change of level). Answers how many were running.
export function stopAll(reason = 'stop') { const list = [...live]; for (const s of list) s.stop(reason); return list.length; }
export const running = () => [...live].map(s => s.name);
export const _peek = () => [...live].map(s => ({ name: s.name, screen: s.screen, form: s.form, k: s.k, armed: s.armed, film: s.film, paused: s.paused }));

// ---- number rolls: the real value is the page's text from 0 ms; only an aria-hidden painted copy rolls, with tabular figures in a reserved width
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Where the page prints this exact figure as a number of its own: not inside 2001, 17, 12,480 or 7.25, and not after a minus sign.
const figureAt = (text, final) => [...text.matchAll(new RegExp(`(?<![\\d\\u2212-]|\\d[.,])${escapeRe(final)}(?!\\d|[.,]\\d)`, 'g'))].map(m => m.index);
export function roll(el, to, { decimals = 0, ms, from = 0 } = {}) {
  const final = formatRoll(Number(to), decimals);
  if (!el) return { final, rolled: false, done: Promise.resolve('none') };
  const said = String(el.textContent ?? ''), hits = figureAt(said, final), d = doc();
  if (hits.length !== 1 || !Number.isFinite(Number(to)) || !d?.createElement) return { final, rolled: false, done: Promise.resolve('none') };   // never a lie: the page does not print this value once
  const at = hits[0], head = said.slice(0, at), tail = said.slice(at + final.length), kept = [...(el.childNodes || [])];
  const shown = v => { const r = Number(v.toFixed(decimals)); return formatRoll(r === 0 ? 0 : r, decimals); };   // no "-0" on the way to a figure below zero
  let painted = null;
  const sc = scene({
    name: 'roll', ms,
    paint(k) {
      if (!painted) {
        painted = d.createElement('span'); painted.className = 'm-roll'; painted.setAttribute('aria-hidden', 'true'); painted.style.minWidth = `${said.length}ch`;
        const real = d.createElement('span'); real.className = 'sr'; real.append(...kept);   // the page's own nodes, markup and all, are what a reader hears while it rolls
        el.replaceChildren(painted, real);
      }
      painted.textContent = head + shown(Number(from) + (Number(to) - Number(from)) * ease.arrive(k)) + tail;
    },
    end() { if (painted) el.replaceChildren(...kept); },   // Less and Still never painted, so the element was never touched
  });
  const done = sc.play();
  return { final, rolled: sc.form === 'full', done };
}

// ---- the play bar: Pause or Play, and Skip (Full); "Step through" (Less and Still). Every button 44 px, reachable by Tab, marked so a press on it is not an interrupt.
// The first button's name says what a press does (Pause, then Play); it has no pressed state as well, so a reader never hears "Play, pressed".
export const PLAYBAR_WORDS = Object.freeze({ label: 'Animation controls', pause: 'Pause', play: 'Play', skip: 'Skip', step: 'Step through' });
export function playbar(host, sc, words = {}) {
  const d = doc(); if (!host?.append || !d?.createElement || !sc) return null;
  const w = { ...PLAYBAR_WORDS, ...(words || {}) };
  const bar = d.createElement('div'); bar.className = 'm-playbar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', w.label); bar.setAttribute('data-macro-control', '');
  const button = (text, act) => { const b = d.createElement('button'); b.type = 'button'; b.className = 'btn m-ctl'; b.setAttribute('data-macro-control', ''); b.textContent = text; b.addEventListener('click', act); bar.append(b); return b; };
  let pause = null;
  if (sc.form === 'full') {
    pause = button(w.pause, () => (sc.paused ? sc.resume() : sc.pause()));
    button(w.skip, () => sc.skip());
  } else button(w.step, () => sc.step());
  host.append(bar);
  const sync = () => { if (pause) pause.textContent = sc.paused ? w.play : w.pause; };
  return { node: bar, sync, remove: () => bar.remove() };
}
