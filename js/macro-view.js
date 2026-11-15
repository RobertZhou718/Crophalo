// The one way the big animations change screens: become(update, { names, types, iris }) moves shared elements from one view to the next with the browser's view transitions,
// a cross-fade at Less and the plain update at Still. nameOnce() keeps every transition name on one element only; proxyOutline() lays a field's outline where a name cannot go.
// Not pure: it reads and changes the page. rectOf() only reads. Checked by scripts/test_macro.mjs (with a stand-in page and view transitions) and scripts/e2e_macro.mjs.
/*
 * Decisions taken where the plan left a detail open:
 * - become() takes one more option, scene: the name in SCENES the transition counts as (default 'turn'), so the budget and the input rule know it. A scene module always
 *   writes it (scripts/macro_rules.mjs rule 1), so the Iris counts as 'iris' and starts the loading chain, never the generic page's.
 * - become() is a screen change: it starts the chain clock of its scene's screen at every level.
 * - The options form startViewTransition({ update, types }) is used only when the browser's ViewTransition has "types"; otherwise the plain call, so the CSS reads right with no type.
 * - The stylesheet's shared defaults only reach transitions started here: html[data-macro-vt] is set for the life of each one, so no other transition of the app changes.
 * - Names and proxies left by a Full transition still in flight are cleared before a Less or Still change, so nothing travels at Less.
 * - An input during the transition skips it, at Full (through its scene, so running() shows it) and at Less (through one listener for its life).
 * - If the browser refuses to start a transition, the flag is taken off, the update runs at once and become() answers 'fallback'.
 * - Proxies made by proxyOutline() are removed when the next transition started here has finished; nameOnce(el, '') takes a name off.
 * - nameOnce() also takes the name off any element of the page whose own style attribute carries it. A name given by a stylesheet is not seen: every shared name of
 *   the big animations goes through nameOnce(), never through a stylesheet.
 * - become() answers 'none' (Still), 'fallback' (no view transitions, or one the browser refused), 'transition', or 'error' when the update threw: the error is reported
 *   (reportError) and the screen keeps what the update had drawn, so a caller that must know can look for 'error'.
 */
import { T, EASE, SCENES, may, scene, chain, interrupts } from './macro-core.js';
import { arrive, VT_GUARD_MS } from './fx.js';

const named = new Map(), proxies = new Set();
let serial = 0;   // the newest transition started here: an older one that ends late leaves the newer one's names and flag alone
const doc = () => globalThis.document;
const report = e => globalThis.reportError?.(e);
const INPUTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

// Set a transition name on one element, after taking it off any other element that had it: two visible elements with one name make the browser skip the transition.
export function nameOnce(el, name) {
  if (!name) { if (el?.style) el.style.viewTransitionName = ''; return el; }
  const was = named.get(name);
  if (was && was !== el && was.style) was.style.viewTransitionName = '';
  try { for (const other of doc()?.querySelectorAll?.('[style*="view-transition-name"]') || []) if (other !== el && other.style?.viewTransitionName === name) other.style.viewTransitionName = ''; } catch { /* no page to look in */ }
  if (el?.style) { el.style.viewTransitionName = name; named.set(name, el); } else named.delete(name);
  return el;
}
function clearNames() {
  for (const [name, el] of named) if (el?.style?.viewTransitionName === name) el.style.viewTransitionName = '';
  named.clear();
  for (const p of proxies) p.remove?.();
  proxies.clear();
}

// The box of an element on the screen, with its centre; null when there is none.
export function rectOf(el) {
  const b = el?.getBoundingClientRect?.(); if (!b) return null;
  return { x: b.left, y: b.top, w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
}

// A positioned, hidden-from-readers drawing of the field's outline over a map path or a picture in the page. points: [[x, y], ...] on the screen; rect: where the drawing sits.
export function proxyOutline(points, rect) {
  const d = doc(); if (!d?.createElementNS || !d.body || !rect || !Array.isArray(points) || points.length < 2) return null;
  const NS = 'http://www.w3.org/2000/svg', w = Math.max(1, rect.w), h = Math.max(1, rect.h);
  const svg = d.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.setAttribute('class', 'm-proxy'); svg.setAttribute('data-macro-proxy', '');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h));
  svg.style.left = `${rect.x}px`; svg.style.top = `${rect.y}px`;
  const r = v => Math.round(v * 10) / 10;
  const path = d.createElementNS(NS, 'path');
  path.setAttribute('d', points.map(([x, y], i) => `${i ? 'L' : 'M'}${r(x - rect.x)} ${r(y - rect.y)}`).join(' ') + ' Z');
  path.setAttribute('class', 'm-proxy-line');
  svg.append(path); d.body.append(svg); proxies.add(svg);
  return svg;
}

const shownView = () => doc()?.querySelector?.('.view:not([hidden])') || null;

// The new screen opens as a circle from the press, to the far corner.
function irisOpen({ x, y }) {
  const w = globalThis.innerWidth || 0, h = globalThis.innerHeight || 0, r = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
  try { doc().documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: T.TURN, easing: EASE.ARRIVE, pseudoElement: '::view-transition-new(root)' }); } catch { /* the plain cross-fade */ }
}
const skipIt = vt => { try { vt?.skipTransition?.(); } catch { /* it had ended */ } };

// update must be synchronous and never fetch: the page is frozen while it runs. Focus moves to the new heading inside it, as show() does.
export async function become(update, { names = {}, types = [], iris = null, scene: name = 'turn' } = {}) {
  const d = doc(), root = d?.documentElement;
  let ran = false, error = null;
  const step = () => { if (ran) return; ran = true; try { update(); } catch (e) { error = e; report(e); } };
  const answer = ok => (error ? 'error' : ok);
  const screen = Object.hasOwn(SCENES, name) ? SCENES[name].screen : null;
  if (screen !== null) chain(screen).start();   // a change of screen starts its chain clock
  const lv = d ? may(name).level : 'still';
  if (!d || lv === 'still') { if (d) clearNames(); step(); return answer('none'); }
  const native = typeof d.startViewTransition === 'function';
  if (!native) {
    if (lv === 'full') for (const [n, el] of Object.entries(names).slice(0, 3)) nameOnce(el, n);
    step(); clearNames();
    const v = shownView();
    if (lv === 'less') { try { v?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: T.QUICK, easing: EASE.FADE }); } catch { /* the screen has changed: that is enough */ } }
    else { try { arrive(v); } catch { /* the screen has changed: that is enough */ } }
    return answer('fallback');
  }
  const mine = ++serial;
  root.dataset.macroVt = lv;
  let vt;
  try {
    if (lv === 'full') {
      for (const [n, el] of Object.entries(names).slice(0, 3)) nameOnce(el, n);   // at most three names a transition
      const typed = Array.isArray(types) && types.length && typeof globalThis.ViewTransition === 'function' && 'types' in globalThis.ViewTransition.prototype;
      try { vt = typed ? d.startViewTransition({ update: step, types }) : d.startViewTransition(step); } catch { vt = d.startViewTransition(step); }
    } else { clearNames(); vt = d.startViewTransition(step); }   // Less: no names (not even a Full one's still in flight), a root cross-fade of T.QUICK
  } catch {   // the browser would not start one: the screen simply changes
    if (mine === serial) { delete root.dataset.macroVt; clearNames(); }
    step(); return answer('fallback');
  }
  const sc = lv === 'full' ? scene({ name, end() {}, stop() { skipIt(vt); } }) : null;   // an input skips the animation; the update still happens
  sc?.play();
  const onInput = event => { if (interrupts(event)) skipIt(vt); }, listens = !sc || sc.form !== 'full';
  if (listens) for (const type of INPUTS) d.addEventListener?.(type, onInput, { capture: true, passive: true });   // Less (or a Full turn the conductor gave its Less form) has no running scene, so it listens itself
  const guard = setTimeout(() => { if (!ran) skipIt(vt); }, VT_GUARD_MS);   // a snapshot that is slow to come: the screen simply changes
  const latest = setTimeout(() => skipIt(vt), T.OPEN_MAX);   // a stuck transition never holds the screen
  vt.ready?.then?.(() => { if (iris && lv === 'full') irisOpen(iris); }, () => {});   // a rejected ready means no animation
  try { await vt.finished; } catch { /* skipped: no animation */ } finally {
    clearTimeout(guard); clearTimeout(latest);
    if (listens) for (const type of INPUTS) d.removeEventListener?.(type, onInput, { capture: true });
    if (mine === serial) { delete root.dataset.macroVt; clearNames(); }
    sc?.skip();
    if (!ran) step();   // never left without the new screen
  }
  return answer('transition');
}
