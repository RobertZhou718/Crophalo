// Crophalo's halo family: the rotation halo (a ring of crop pictures round the field, current against proposed, easing between the two), the answer card assembling
// in calm steps as its data arrives, option cards unfolding from the card that was tapped, option cards reordering when priorities change (FLIP), and the marching
// ants of a finished outline. Pure parts: arc geometry and timing, plan comparison, FLIP distances, the order and times of the answer's steps. Checked by scripts/test_fx_halo.mjs and scripts/e2e_fx_halo.mjs.
/*
 * Built on js/fx.js and held to the same rules (fades, colour and smooth slides only; nothing past full size; once per trigger; text at
 * full contrast; nothing over 5 s that cannot be stopped; everything off under "Always still" and the device's reduce-motion choice; a tap never waits for motion).
 */
import { less, onStill, playOnce, EASE, FADE_MS } from './fx.js';

export const ARC_MS = 700;          // an outer arc drawn
export const ARC_STEP_MS = 380;     // one year after the other (260 ms and a little more, so the arcs flow)
export const INNER_MS = 600;        // an inner arc (a cover crop, a second crop)
export const COVER_AT = 260;        // the cover crop's arc starts this long after its year's arc
export const SECOND_AT = 460;       // a second crop's arc
export const PIC_AT = 480, PIC_MS = 350;   // the crop pictures fade in (graphics, not words)
export const YEAR_AT = 500;         // the year number appears, in 160 ms (it is text)
export const STEP_MS = 520;         // an answer step opening
export const STEP_GAP_MS = 140;     // one step after the other, at the earliest
export const FLIP_MS = 460, NEW_MS = 380, UNFOLD_MS = 520;
export const ANTS_CYCLES = 3, ANTS_CYCLE_MS = 900;   // marching ants: three passes, then they rest (2.7 s)
const SVGNS = 'http://www.w3.org/2000/svg';
const RAD = Math.PI / 180;
const el = (tag, attrs = {}) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

// ---- pure: geometry and timing of the rotation halo
// n seasons share the ring; each gets an arc with a small gap. Angles in degrees from the top, clockwise.
export function arcAngles(n, gap = 8) {
  const span = 360 / Math.max(1, n), out = [];
  for (let i = 0; i < n; i++) { const from = i * span + (n > 1 ? gap / 2 : 0), to = (i + 1) * span - (n > 1 ? gap / 2 : 0); out.push({ from, to, mid: (from + to) / 2 }); }
  return out;
}
export const pointAt = (cx, cy, r, deg) => ({ x: cx + r * Math.sin(deg * RAD), y: cy - r * Math.cos(deg * RAD) });
export function arcPath(cx, cy, r, from, to) {
  const a = pointAt(cx, cy, r, from), b = pointAt(cx, cy, r, to);
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}
export const arcLength = (r, from, to) => r * (to - from) * RAD;
// When each part of each season starts and ends, in ms from the start of the halo. A season's cover crop and second crop are optional.
export function haloTimeline(seasons) {
  const out = seasons.map((s, i) => {
    const at = i * ARC_STEP_MS, cover = s.after === 'cover' ? at + COVER_AT : null, second = s.second ? at + SECOND_AT : null;
    return { arc: at, cover, second, pic: at + PIC_AT, year: at + YEAR_AT, ends: Math.max(at + ARC_MS, cover != null ? cover + INNER_MS : 0, second != null ? second + INNER_MS : 0, at + PIC_AT + PIC_MS, at + YEAR_AT + FADE_MS) };
  });
  return { parts: out, end: out.length ? Math.max(...out.map(p => p.ends)) : 0 };
}
export const diffSeasons = (a = [], b = []) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => i).filter(i => a[i]?.crop !== b[i]?.crop || a[i]?.after !== b[i]?.after || a[i]?.second !== b[i]?.second);
export function describeRotation(plan, names = id => id) {
  if (!plan?.seasons?.length) return 'No rotation to show.';
  const parts = plan.seasons.map(s => `${names(s.crop)} in ${s.year}${s.after === 'cover' ? ' with a cover crop after' : ''}${s.second ? `, then ${names(s.second)}` : ''}`);
  const first = parts[0][0].toUpperCase() + parts[0].slice(1);
  return `${plan.name || 'Plan'}: ${[first, ...parts.slice(1)].join(', ')}.`;
}

// ---- the rotation halo
// plans: {current, proposed}; show: 'current' | 'proposed'. names(cropId) -> words; pictures(cropId) -> an SVG string for the little picture, or null for a plain disc.
export function rotationHalo(node, { plans, show = 'proposed', names = id => id, pictures = () => null, size = 112 } = {}) {
  const compact = size < 72, c = size / 2, R = size * (compact ? 0.38 : 0.3), w = size * 0.085;   // the ring leaves room round it for the year numbers
  node.classList.add('fx-halo'); node.classList.toggle('is-compact', compact);
  let shown = null, arcs = [], pics = [], years = [];
  const arcOf = (cls, r, sw, from, to) => { const p = el('path', { d: arcPath(c, c, r, from, to), class: `fx-arc ${cls}`, 'stroke-width': sw, fill: 'none' }); p.dataset.len = String(arcLength(r, from, to)); return p; };
  function build(plan, animate) {
    const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': describeRotation(plan, names), class: 'fx-halo-art' });
    svg.append(el('circle', { cx: c, cy: c, r: R, class: 'fx-halo-track', 'stroke-width': w, fill: 'none' }));
    const seasons = plan?.seasons || [], ang = arcAngles(seasons.length), tl = haloTimeline(seasons), made = [];
    seasons.forEach((s, i) => {
      const a = ang[i], g = el('g', { class: 'fx-season', 'data-i': String(i) });
      const outer = arcOf('crop', R, w, a.from, a.to); g.append(outer);
      let cover = null, second = null;
      if (s.after === 'cover') { cover = arcOf('cover', R - w * 1.45, w * 0.6, a.from + 2, a.to - 2); g.append(cover); }
      if (s.second) { second = arcOf('second', R - w * 2.2, w * 0.6, a.from + 2, a.to - 2); g.append(second); }
      if (!compact) {
        const p = pointAt(c, c, R, a.mid), pic = el('g', { class: 'fx-pic', transform: `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})` });
        const svgText = pictures(s.crop);
        if (svgText) { const holder = el('g', { class: 'fx-pic-art' }); holder.innerHTML = svgText; pic.append(el('circle', { r: w * 1.35, class: 'fx-pic-disc' }), holder); }
        else pic.append(el('circle', { r: w * 1.25, class: 'fx-pic-disc plain' }));
        const t = el('title'); t.textContent = names(s.crop); pic.append(t);
        const yp = pointAt(c, c, R + w * 1.35 + size * 0.07, a.mid), yr = el('text', { x: yp.x.toFixed(2), y: yp.y.toFixed(2), class: 'fx-year', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }); yr.textContent = String(s.year);
        g.append(pic, yr); made.push({ outer, cover, second, pic, yr, tl: tl.parts[i] });
      } else made.push({ outer, cover, second, pic: null, yr: null, tl: tl.parts[i] });
      svg.append(g);
    });
    node.replaceChildren(svg);
    arcs = made;
    if (animate && !less()) for (const m of made) draw(m, true);
    return svg;
  }
  const grow = (path, delay, ms) => {   // an arc drawn by its dash: from nothing to all of it, once
    const len = Number(path.dataset.len); path.style.strokeDasharray = String(len);
    const a = path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: ms, delay, easing: EASE, fill: 'both', id: 'fxh-arc' });
    a.onfinish = () => { path.style.strokeDasharray = ''; a.cancel(); };
    return a;
  };
  function draw(m, withDelay) {
    const d0 = withDelay ? m.tl.arc : 0;
    grow(m.outer, d0, ARC_MS);
    if (m.cover) grow(m.cover, withDelay ? m.tl.cover : COVER_AT, INNER_MS);
    if (m.second) grow(m.second, withDelay ? m.tl.second : SECOND_AT, INNER_MS);
    if (m.pic) m.pic.animate([{ opacity: 0 }, { opacity: 1 }], { duration: PIC_MS, delay: withDelay ? m.tl.pic : PIC_AT, easing: EASE, fill: 'both', id: 'fxh-pic' });
    if (m.yr) m.yr.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, delay: withDelay ? m.tl.year ?? m.tl.pic : YEAR_AT, easing: EASE, fill: 'both', id: 'fxh-year' });
  }
  const ctl = {
    show(which) {   // easing between plans: only the seasons that differ are drawn again; the rest stay as they are
      const next = plans?.[which]; if (!next) return;
      const prev = shown ? plans[shown] : null;
      if (!prev || compact) { shown = which; build(next, true); return; }
      const changed = diffSeasons(prev.seasons, next.seasons), sameCount = prev.seasons.length === next.seasons.length;
      shown = which;
      if (!sameCount) { build(next, true); return; }   // a different number of years re-divides the ring: draw it fresh
      const svg = build(next, false);
      if (less()) return;
      for (const i of changed) { const m = arcs[i]; if (m) draw(m, false); }
      svg.setAttribute('data-changed', changed.join(','));
    },
    get current() { return shown; },
    dispose() { node.replaceChildren(); node.classList.remove('fx-halo', 'is-compact'); },
  };
  onStill(() => { node.getAnimations({ subtree: true }).forEach(a => a.finish()); node.querySelectorAll('.fx-arc').forEach(p => { p.style.strokeDasharray = ''; }); });   // finished, and every arc complete
  ctl.show(show);
  return ctl;
}

// ---- the answer card assembling: its steps open one after another (a wipe, not a fade: the words are clipped, never partly transparent)
// Each step is an element with data-step="now" | "try" | "reason" | "sureness" (the card's own order). arrive(step) says its data is in; it opens when the one before it has.
export function assemblyPlan(arrivals, order, gap = STEP_GAP_MS, ms = STEP_MS) {
  let prev = -Infinity; const at = {};
  for (const k of order) { const t = arrivals[k]; if (t == null) continue; at[k] = Math.max(t, prev + gap); prev = at[k]; }
  const last = Object.values(at).length ? Math.max(...Object.values(at)) : 0;
  return { at, end: last + ms };
}
export function answerAssembly(card, { order = ['now', 'try', 'reason', 'sureness'], fresh = true } = {}) {
  const steps = Object.fromEntries(order.map(k => [k, card.querySelector(`[data-step="${k}"]`)]));
  const instant = !fresh || less() || !playOnce(card, 'assembly');
  const waiting = new Set(), open = new Set(); let lastOpen = -Infinity, timer = 0;
  if (!instant) for (const k of order) if (steps[k]) { steps[k].classList.add('fx-wait'); waiting.add(k); }
  const reveal = k => { const n = steps[k]; if (!n || open.has(k)) return; open.add(k); waiting.delete(k); lastOpen = performance.now(); n.style.setProperty('--fx-step', '0ms'); n.classList.add('fx-open'); };
  const arrived = new Set();
  const flush = () => {
    clearTimeout(timer);
    for (const k of order) {   // in the card's order: a step never opens before the one above it
      if (!steps[k] || open.has(k)) continue;
      if (!arrived.has(k)) return;
      const wait = Math.max(0, lastOpen + STEP_GAP_MS - performance.now());
      if (wait > 0) { timer = setTimeout(flush, wait); return; }
      reveal(k);
    }
  };
  const ctl = {
    arrive(k, fill) { if (fill) fill(steps[k]); arrived.add(k); if (instant) { steps[k]?.classList.remove('fx-wait', 'fx-open'); open.add(k); } else flush(); },
    showAll() { for (const k of order) { steps[k]?.classList.remove('fx-wait'); open.add(k); } clearTimeout(timer); },
    setSureness(share) { const dial = card.querySelector('.fx-dial-arc'); if (dial) dial.style.setProperty('--share', String(Math.min(1, Math.max(0, share)))); },
    pending: () => order.filter(k => steps[k] && !open.has(k)),
    instant,
  };
  onStill(() => ctl.showAll());
  return ctl;
}

// ---- FLIP: reorder cards (priorities changed) so that each moves from where it was to where it is, by translation only; new cards rise in
export function flipDeltas(first, last) {
  const moves = [], added = [];
  for (const [id, b] of last) { const a = first.get(id); if (!a) added.push(id); else { const dx = a.left - b.left, dy = a.top - b.top; if (Math.abs(dx) + Math.abs(dy) > 1) moves.push({ id, dx, dy }); } }
  return { moves, added };
}
export function flipReorder(container, mutate, { attr = 'data-flip' } = {}) {
  const read = () => new Map([...container.querySelectorAll(`[${attr}]`)].map(n => { const r = n.getBoundingClientRect(); return [n.getAttribute(attr), { left: r.left, top: r.top, node: n }]; }));
  const first = read(); mutate();
  if (less()) return { moves: [], added: [] };
  const last = read(), d = flipDeltas(first, last);
  for (const m of d.moves) last.get(m.id).node.animate([{ transform: `translate(${m.dx}px, ${m.dy}px)` }, { transform: 'translate(0px, 0px)' }], { duration: FLIP_MS, easing: EASE, id: 'fxh-flip' });
  for (const id of d.added) last.get(id).node.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, offset: 0.35 }, { opacity: 1, transform: 'translateY(0px)' }], { duration: NEW_MS, easing: EASE, id: 'fxh-new' });
  return d;
}

// ---- an option card's detail unfolding from the card that was tapped: translate and clip, never scale, so the words are never stretched
export function unfoldInsets(from, to) {
  const clampTo = (v, max) => Math.max(0, Math.min(max, v));
  const top = clampTo(from.top - to.top, to.height), left = clampTo(from.left - to.left, to.width), right = clampTo(to.right - from.right, to.width), bottom = clampTo(to.bottom - from.bottom, to.height);
  const dy = Math.max(-48, Math.min(48, (from.top - to.top) * 0.25));
  return { top, left, right, bottom, dy };
}
export function unfold(fromEl, detailEl) {
  if (less() || !fromEl || !detailEl) return null;
  const f = fromEl.getBoundingClientRect(), t = detailEl.getBoundingClientRect(), i = unfoldInsets(f, t);
  return detailEl.animate([
    { clipPath: `inset(${i.top}px ${i.right}px ${i.bottom}px ${i.left}px round var(--r1))`, transform: `translateY(${i.dy}px)` },
    { clipPath: 'inset(0px 0px 0px 0px round var(--r1))', transform: 'translateY(0px)' },
  ], { duration: UNFOLD_MS, easing: EASE, id: 'fxh-unfold' });
}

// ---- marching ants on a finished outline: three passes, then it rests (2.7 s, so it needs no pause button)
export function marchingAnts(path) {
  if (less() || !playOnce(path, 'ants')) return false;
  path.classList.remove('fx-ants'); void path.getBoundingClientRect(); path.classList.add('fx-ants');
  path.addEventListener('animationend', () => path.classList.remove('fx-ants'), { once: true });
  return true;
}
