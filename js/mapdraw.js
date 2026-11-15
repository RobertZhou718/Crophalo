// Crophalo's drawing kit for the setup map: what a drawing and an outline look like on the satellite photo (a navy core over a white halo), the corner dots,
// the close ring, the length labels, the corner handles and "+" midpoints, the ghost of an old outline, the refused ×, and the one close motion. It decides nothing.
// Not pure: it draws Leaflet layers in three panes above the pin. Colours come from css/map.css by class, never from here. Checked by scripts/e2e_maptools.mjs.
import { motionOff, motionLess } from './motion.js';
import { SAY } from './mapwords.js';
import { loadLeaflet } from './leaflet-load.js';

const L = await loadLeaflet();   // every way into the map waits here for the map library (js/leaflet-load.js), so the Start page never needs it
const SEAL_MS = 700, FADE_MS = 160;

// One line: a halo path under a core path. kind names it for the stylesheet (mapx-guide, mapx-closing...). dashed: a draft line.
function line(map, renderer, kind, dashed = true) {
  const opt = cls => ({ renderer, interactive: false, fill: false, className: `${cls} ${kind}${dashed && cls === 'mapx-core' ? ' mapx-dash' : ''}` });
  const halo = L.polyline([], opt('mapx-halo')), core = L.polyline([], opt('mapx-core'));
  let on = false;
  return {
    set(latlngs, bad = false) {
      if (!latlngs || !latlngs.length) { if (on) { halo.remove(); core.remove(); on = false; } return; }
      halo.setLatLngs(latlngs); core.setLatLngs(latlngs);
      if (!on) { halo.addTo(map); core.addTo(map); on = true; }
      core.getElement()?.classList.toggle('bad', !!bad);
    },
    els: () => (on ? [halo.getElement(), core.getElement()] : []),
  };
}
const shape = (map, renderer, cls) => {   // a filled area with no stroke
  const p = L.polygon([], { renderer, interactive: false, stroke: false, className: cls });
  let on = false;
  return { set(latlngs) { if (!latlngs || latlngs.length < 3) { if (on) { p.remove(); on = false; } return; } p.setLatLngs(latlngs); if (!on) { p.addTo(map); on = true; } }, el: () => (on ? p.getElement() : null) };
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// a length on the map: drawn by the stylesheet from data-text, so the oversized map canvas holds no words of its own (the length is said aloud when it matters)
const pill = (cls, text) => L.divIcon({ className: 'mapx-lbl', iconSize: null, iconAnchor: [0, 0], html: `<span class="${cls}" aria-hidden="true" data-text="${esc(text)}"></span>` });

export function drawKit(map) {
  for (const [name, z] of [['mapx-draft', 620], ['mapx-dots', 630], ['mapx-handles', 640]]) (map.getPane(name) || map.createPane(name)).style.zIndex = z;
  const R = { outline: L.svg({ pane: 'overlayPane' }), draft: L.svg({ pane: 'mapx-draft' }), dots: L.svg({ pane: 'mapx-dots' }) };
  for (const r of Object.values(R)) r.addTo(map);   // the renderers are made at mount, so the first corner draws at once
  const still = () => motionOff(), less = () => motionLess();
  const once = (el, cls, ms) => { if (!el) return; el.classList.remove(cls); void el.getBoundingClientRect?.(); el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms + 40); };

  // ---- the drawing in progress
  const parts = {
    fill: shape(map, R.draft, 'mapx-fillpre'), edges: line(map, R.draft, 'mapx-edges'), closing: line(map, R.draft, 'mapx-closing'),
    guide: line(map, R.draft, 'mapx-guide'), preview: line(map, R.draft, 'mapx-preview'), box: line(map, R.draft, 'mapx-boxline'),
    marks: line(map, R.dots, 'mapx-square', false), stem: line(map, R.dots, 'mapx-stem', false),
  };
  let dots = [], ring = null, labels = [], newest = -1;
  function draft(v) {
    v ||= {};
    parts.fill.set(v.fill); parts.edges.set(v.edges); parts.closing.set(v.closing, v.closeBad); parts.guide.set(v.guide, v.bad);
    parts.preview.set(v.preview); parts.box.set(v.box); parts.marks.set(v.marks); parts.stem.set(v.stem);
    // the corner dots: one per corner, the newest fades in once
    const pts = v.dots || [];
    while (dots.length > pts.length) { const d = dots.pop(), el = d.getElement(); if (el && !still() && pts.length) { el.classList.add('mapx-fadeout'); setTimeout(() => d.remove(), FADE_MS); } else d.remove(); }   // an undone corner's dot fades out
    pts.forEach((p, i) => { if (dots[i]) dots[i].setLatLng(p); else { dots[i] = L.circleMarker(p, { renderer: R.dots, radius: 5, interactive: false, className: 'mapx-dot' }).addTo(map); if (i > newest && !still()) once(dots[i].getElement(), 'mapx-in', 140); } });
    newest = pts.length - 1;
    // the close ring at the first corner, from three corners; bigger and filled while the magnet holds
    if (v.ring) {
      if (!ring) ring = L.circleMarker(v.ring.at, { renderer: R.dots, radius: 12, interactive: false, className: 'mapx-ring' }).addTo(map);
      ring.setLatLng(v.ring.at);
      const near = !!v.ring.near, el = ring.getElement(), was = el?.classList.contains('near');
      ring.setRadius(near ? 16 : 12); el?.classList.toggle('near', near);
      if (near && !was && !still()) once(el, less() ? 'mapx-fadein' : 'mapx-grow', 140);
    } else if (ring) { ring.remove(); ring = null; }
    // the length labels
    const want = v.labels || [];
    while (labels.length > want.length) labels.pop().remove();
    want.forEach((l, i) => { if (labels[i]) { labels[i].setLatLng(l.at); const s = labels[i].getElement()?.firstElementChild; if (s && s.dataset.text !== l.text) s.dataset.text = l.text; } else labels[i] = L.marker(l.at, { pane: 'mapx-dots', interactive: false, keyboard: false, icon: pill('mapx-len', l.text) }).addTo(map); });
  }
  function clearDraft(fade = false) {
    if (fade && !still()) for (const el of [...parts.edges.els(), ...dots.map(d => d.getElement())]) { const c = el?.cloneNode(true); if (c) { el.parentNode.append(c); c.classList.add('mapx-fadeout'); setTimeout(() => c.remove(), FADE_MS + 40); } }
    draft(null); newest = -1;
  }
  // the newest line draws itself from the corner before it (touch, and a rectangle's side): returns the share of it to show, 0 to 1, over 160 ms
  function grow(ms = FADE_MS, step) {
    if (still() || less()) { step(1); return; }
    const t0 = performance.now(), tick = now => { const t = Math.min(1, (now - t0) / ms); step(1 - (1 - t) ** 3); if (t < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // ---- the finished outline, at rest or sealing
  let outline = null, ghost = null;
  function setOutline(latlngs, { seal = false, crossFrom = null, bad = false } = {}) {
    if (!latlngs) { if (outline) { for (const l of outline) l.remove(); outline = null; } return; }
    if (!outline) outline = [L.polygon(latlngs, { renderer: R.outline, interactive: false, stroke: false, className: 'mapx-fill' }), L.polygon(latlngs, { renderer: R.outline, interactive: false, fill: false, className: 'mapx-halo mapx-out' }), L.polygon(latlngs, { renderer: R.outline, interactive: false, fill: false, className: 'mapx-core mapx-out' })].map(l => l.addTo(map));
    else for (const l of outline) l.setLatLngs(latlngs);
    outline[2].getElement()?.classList.toggle('bad', !!bad);   // a corner dragged where its lines would cross: the outline shows red until it is dropped
    if (!seal || still()) return;
    const [fill, , core] = outline.map(l => l.getElement());
    if (less()) { once(core, 'mapx-fadein', FADE_MS); once(fill, 'mapx-fadein', FADE_MS); if (crossFrom) crossFade(crossFrom); }
    else { once(core, 'mapx-seal', SEAL_MS); once(fill, 'mapx-fillin', 520); }
  }
  function crossFade(latlngs) {   // under Less the dashed drawing fades out while the solid outline fades in
    const old = L.polyline([...latlngs, latlngs[0]], { renderer: R.draft, interactive: false, fill: false, className: 'mapx-core mapx-dash mapx-fadeout' }).addTo(map);
    setTimeout(() => old.remove(), FADE_MS + 40);
  }
  function fadeOutline(done) {   // Start again: the outline fades out over 160 ms, then goes
    if (!outline || still()) { setOutline(null); done?.(); return; }
    for (const l of outline) l.getElement()?.classList.add('mapx-fadeout');
    const was = outline; outline = null;
    setTimeout(() => { for (const l of was) l.remove(); done?.(); }, FADE_MS);
  }
  function setGhost(latlngs) {
    if (!latlngs) { ghost?.remove(); ghost = null; return; }
    if (!ghost) ghost = L.polygon(latlngs, { renderer: R.outline, interactive: false, fill: false, className: 'mapx-ghost' }).addTo(map);
    else ghost.setLatLngs(latlngs);
  }
  const outlineEls = () => (outline ? outline.map(l => l.getElement()) : []);

  // ---- the corner handles and the "+" midpoints of the outline being changed
  let handles = [], mids = [], wired = null;
  const hIcon = (i, n, chosen) => L.divIcon({ className: 'mapx-hicon', iconSize: [44, 44], iconAnchor: [22, 22],
    html: `<button type="button" class="mapx-handle" data-i="${i}" aria-label="${esc(SAY.corner(i + 1, n))}" aria-describedby="mapxCornerHelp" aria-pressed="${chosen ? 'true' : 'false'}"><i aria-hidden="true"></i></button>` });
  const mIcon = i => L.divIcon({ className: 'mapx-micon', iconSize: [44, 44], iconAnchor: [22, 22], html: `<span class="mapx-mid" data-m="${i}" aria-hidden="true"><i></i></span>` });
  // ring: the corners, or null to take the handles away. on: { down(i, event), key(i, event), click(i, event), midDown(i, event) }. label(i, n) names a corner.
  function setHandles(latlngs, { chosen = -1, on = null, label = null, midsFrom = 88, fade = false } = {}) {
    if (on) wired = on;
    if (!latlngs) {
      const gone = [...handles, ...mids]; handles = []; mids = [];
      if (fade && !still()) { for (const m of gone) m.getElement()?.classList.add('mapx-fadeout'); setTimeout(() => gone.forEach(m => m.remove()), FADE_MS); } else gone.forEach(m => m.remove());
      return;
    }
    const n = latlngs.length, redraw = handles.length !== n, focused = redraw ? handles.findIndex(h => h.getElement()?.contains(document.activeElement)) : -1;
    if (redraw) {
      handles.forEach(h => h.remove()); handles = [];
      latlngs.forEach((p, i) => {
        const m = L.marker(p, { pane: 'mapx-handles', icon: hIcon(i, n, i === chosen), interactive: false, keyboard: false }).addTo(map), b = m.getElement().firstElementChild;
        if (label) b.setAttribute('aria-label', label(i, n));
        b.addEventListener('pointerdown', e => wired?.down(i, e));
        b.addEventListener('keydown', e => wired?.key(i, e));
        b.addEventListener('click', e => wired?.click(i, e));
        if (fade && !still()) once(m.getElement(), 'mapx-fadein', FADE_MS);
        handles.push(m);
      });
      if (focused >= 0) handles[Math.min(focused, n - 1)]?.getElement()?.firstElementChild?.focus({ preventScroll: true });
    } else latlngs.forEach((p, i) => { handles[i].setLatLng(p); const b = handles[i].getElement()?.firstElementChild; b?.setAttribute('aria-pressed', i === chosen ? 'true' : 'false'); });
    // the midpoints: only on lines long enough on the screen to hold one, and never a Tab stop
    const pts = latlngs.map(p => map.latLngToContainerPoint(p)), want = [];
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; if (a.distanceTo(b) >= midsFrom) want.push({ i, at: map.containerPointToLatLng(a.add(b).divideBy(2)) }); }
    mids.forEach(m => m.remove()); mids = [];
    for (const w of want) { const m = L.marker(w.at, { pane: 'mapx-handles', icon: mIcon(w.i), interactive: false, keyboard: false }).addTo(map); m.getElement().firstElementChild.addEventListener('pointerdown', e => wired?.midDown(w.i, e)); mids.push(m); }
  }
  const handleEl = i => handles[i]?.getElement()?.firstElementChild ?? null;

  // ---- the refused ×: holds 600 ms, then fades (Full and Less); under Still it shows 1.2 s and goes
  function refusedAt(latlng) {
    const m = L.marker(latlng, { pane: 'mapx-dots', interactive: false, keyboard: false, icon: L.divIcon({ className: 'mapx-lbl', iconSize: null, iconAnchor: [0, 0], html: '<span class="mapx-x" aria-hidden="true"></span>' }) }).addTo(map);
    if (!still()) m.getElement()?.classList.add('mapx-xgo');
    setTimeout(() => m.remove(), still() ? 1200 : 780);
  }

  return { renderers: R, draft, clearDraft, grow, outline: setOutline, fadeOutline, outlineEls, ghost: setGhost, handles: setHandles, handleEl, refusedAt, hasHandles: () => handles.length > 0 };
}
