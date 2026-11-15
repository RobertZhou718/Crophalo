// Crophalo's setup map: a Leaflet map whose every control is drawn here. The Pin, Rectangle and Corners tools read one pointer for mouse, finger and pen, and the keys at a cross;
// the action bar, the live area chip, Precise, undo and redo, the drawing kept for a reload, the outline's handles, the photo, the view stack. It never names a sea, lake or border.
// Nothing here is pure (the maths is js/geo.js, the look of lines and handles js/mapdraw.js, every word js/mapwords.js). The map is made once per page and never rebuilt.
// Checked by scripts/e2e_maptools.mjs (the three tools by every hand, every state, undo, the motion levels) and scripts/e2e_map.mjs (the rest of the map, the fit, axe).
import { areaHa, boxCorners, cleanRing, outlineProblem, pinWords, wrapLon, selfCrosses, insideRing, pinSpot, threePointRect, snapAxis, rightAngleSnap, squareOff, edgeCrosses, areaPair, lengthWords, unitsOrder, metres, direction, MAX_CORNERS } from './geo.js';
import { SAY, says } from './mapwords.js';
import { toast, hideToast, isToast, runToastAction } from './toast.js';
import { motionOff, motionLess, motionQuiet, onMotionChange } from './motion.js';
import { openSpot, closeSpot, refreshSpot, spotOpen, keepInside } from './spotcard.js';
import { fitPadding, SIDE_FROM, WIDE } from './cardplace.js';
import { initBase } from './mapbase.js';
import { initBusy } from './mapbusy.js';
import { initPanels } from './mappanels.js';
import { loadRegions, regionOutline, regionAt } from './places.js';
import { placesPanel } from './mapplaces.js';
import { initLayers } from './maplayers.js';
import { readSettings } from './settings.js';
import { currentState, movePlace } from './wizard.js';
import { drawKit } from './mapdraw.js';
import { loadLeaflet } from './leaflet-load.js';

const L = await loadLeaflet();   // every way into the map waits here for the map library (js/leaflet-load.js), so the Start page never needs it
const WORLD = { center: [20, 10], zoom: 2 };
// With no place chosen the map opens on the United States, centred at 39.8 N, 98.6 W, at the zoom that keeps the lower 48 states in view (one step further out on a narrow map): Crophalo's first fields are there.
const US = { center: [39.8, -98.6], box: [[24.5, -125], [49.4, -66.9]] };
const usView = () => { const sz = map.getSize(); return { c: US.center, z: sz.x && sz.y ? Math.max(2, Math.min(5, map.getBoundsZoom(US.box, false, L.point(8, 8)))) : 3 }; };
const PIN_STEP = 8, PIN_BIG = 40, PAN_STEP = 60, PAN_BIG = 240, LOCATE_MS = 12e3;
const PIN_FROM = 10, DRAW_FROM = 13, SELF_MAX = 16, LAND_AT = 15;   // zoom: a pin needs 10, a drawing 13; the map never zooms itself past 16 (the NASA picture only blurs past it)
const SLOP = { mouse: 3, pen: 4, touch: 6 }, HOLD_MS = 250, HOLD_SLOP = 4, TAP_WAIT = 300, QUICK_MS = 350, TOUCH_TAP_MS = 1000, LIFT = 48, AUTO_EDGE = 40;
const MAGNET = { mouse: [24, 16], pen: [24, 16], touch: [40, 24], cross: [24, 16] }, NEAR_LAST = { mouse: 8, pen: 8, touch: 16, cross: 8 };
const MIN_PX = 12, MID_FROM = 88, HISTORY_MAX = 60, UNDO_MS = 6000, REFUSE_MS = 4000, SWALLOW_MS = 350, NEAR_KM = 1;
const DRAFT_KEY = 'crophalo.map.draft', PRECISE_KEY = 'crophalo.map.precise';
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const r4 = v => Math.round(v * 1e4) / 1e4;

const icon = {   // one outline family, 24 grid, 1.7 stroke (the same drawings as the design page)
  pin: '<path d="M12 21s6.5-6.2 6.5-11a6.5 6.5 0 0 0-13 0c0 4.8 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
  poly: '<path d="M5 9l6-4.500 7 3.500-1.500 9.500L8 18z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  field: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  here: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  undo: '<path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 8"/>',
  precise: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/>',
};
const svg = name => `<svg class="ic" aria-hidden="true" viewBox="0 0 24 24">${icon[name]}</svg>`;

// What the map keeps: the place, the outline (used for the report or not), the tool that made it and the tool pressed now.
const keep = { pin: null, ring: null, used: false, madeBy: 'poly', tool: 'pin' };
let busyCtl = null, map = null, ui = null, kit = null, layers = {}, panels = null, gibsCtl = null, baseCtl = null, scaleCtl = null;
let draft = null;              // a drawing: { tool: 'rect' | 'poly', pts: [L.LatLng], times: [ms], ghost: true when an outline rests under it }
let selected = false, chosen = -1, changedUsed = false, moving = null;   // the outline being changed; the corner chosen; a used outline changed since; a drag in progress
let hand = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse', kbd = false, precise = readPrecise();
let hover = null, hoverShift = false, gesture = null, pendingTap = 0, lastTouchTap = null, tapSwallow = 0, glide = false;
let refusal = null, refusalTimer = 0, backWords = '', toastToken = 0, prefetchTimer = 0, lastSaid = '', drawView = false, ignorePop = false, resultSide = false;
let magnetOn = false, crossingNow = false, closeCrossNow = false, growF = 1, boxNow = null;
const past = [], future = [], pointers = new Set();   // the map's own undo list (the browser's history is window.history)

const bus = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
// The report's data is fetched while the farmer is still choosing: the page is told the place (and the outline, when there is one) the moment either is settled. The listener debounces.
const prefetch = (lat, lon, ring) => bus('crophalo:prefetch', { lat, lon, ...(ring ? { outline: ring, ring } : {}) });   // outline is what the report reads; ring is the same corners under the older name
const prefetchSoon = () => { clearTimeout(prefetchTimer); prefetchTimer = setTimeout(() => keep.pin && prefetch(keep.pin.lat, keep.pin.lon, keep.ring), 600); };
// One polite message per event. The same words twice are cleared and set again a frame later, so they are heard again.
function say(words) {
  if (!ui || !words) return;
  lastSaid = words;
  if (ui.live.textContent === words) { ui.live.textContent = ''; requestAnimationFrame(() => { if (lastSaid === words) ui.live.textContent = words; }); }
  else ui.live.textContent = words;
}
const haptic = ms => { if (!motionOff() && hand === 'touch') navigator.vibrate?.(ms); };
const order = () => unitsOrder(readSettings().area, navigator.languages?.[0] || navigator.language || '');
const pairOf = ring => areaPair(areaHa(ring), order());
const ll = p => [p.lat, p.lng], LL = a => L.latLng(a[0], a[1]);
const cp = p => map.latLngToContainerPoint(p);
function readPrecise() { try { return localStorage.getItem(PRECISE_KEY) === '1'; } catch { return false; } }

// ---- the markup of the controls, made once
function shell(root) {
  const B = SAY.btn;
  root.innerHTML = `<div class="mapx" id="mapx" tabindex="0" role="application" aria-roledescription="map" aria-label="${esc(SAY.mapName)}" aria-describedby="mapxHelp" data-tool="pin" data-state="idle">
    <div class="mapx-canvas" id="mapxCanvas"></div>
    <p class="sr" id="mapxHelp">${esc(SAY.help)}</p><p class="sr" id="mapxLive" role="status" aria-live="polite"></p>
    <p class="sr" id="mapxPinHelp">${esc(SAY.pinHelp)}</p><p class="sr" id="mapxCornerHelp">${esc(SAY.cornerHelp)}</p><p class="sr" id="mapxWhy"></p>
    <div class="mapx-top">
      <div class="seg slide mapx-seg" role="group" aria-label="${esc(SAY.toolGroup)}">${['rect', 'poly'].map(t => `<button type="button" data-tool="${t}" aria-pressed="${t === 'rect'}" title="${esc(SAY.tool[t])}">${svg(t)}<span class="mapx-w">${esc(SAY.tool[t])}</span></button>`).join('')}</div>
      <div class="mapx-dock" id="mapxDock">
        <div class="mapx-hint" id="mapxHint" role="group" aria-label="${esc(SAY.barName)}">
          <div class="mapx-result" id="mapxResult" hidden><p class="mapx-big" id="mapxBig"></p><p class="mapx-second"><span id="mapxSecond"></span> <span class="chip" id="mapxUsed"></span></p></div>
          <p class="mapx-line"><span id="mapxHintText"></span><span class="mapx-chip in-bar" id="mapxBarChip" aria-hidden="true" hidden></span></p>
          <div class="mapx-hint-btns" id="mapxHintBtns">
            <button type="button" class="btn sm" data-act="precise" aria-pressed="false" hidden>${svg('precise')}${esc(B.precise)}</button>
            <button type="button" class="btn sm" data-act="step" hidden></button>
            <button type="button" class="btn sm" data-act="undo" hidden>${svg('undo')}${esc(B.undo)}</button>
            <button type="button" class="btn sm" data-act="remove" hidden>${esc(B.removeCorner)}</button>
            <button type="button" class="btn sm" data-act="cancel" hidden>${esc(B.cancel)}</button>
            <button type="button" class="btn sm" data-act="again" hidden>${esc(B.again)}</button>
            <button type="button" class="btn sm" data-act="done" hidden>${esc(B.done)}</button>
            <button type="button" class="btn sm primary" data-act="finish" hidden>${esc(B.finish)}</button>
            <button type="button" class="btn sm primary" data-act="use" hidden>${esc(B.use)}</button>
          </div>
        </div>
        <div class="mapx-foot" id="mapxFoot"><p class="mapx-basenote" id="mapxBaseNote" role="status" hidden></p><p class="mapx-credit" id="mapxCredit"></p></div>
      </div>
      <div class="seg mapx-base" role="group" aria-label="${esc(SAY.baseGroup)}"><button type="button" data-base="light" aria-pressed="false">${esc(SAY.base.light)}</button><button type="button" data-base="sat" aria-pressed="true">${esc(SAY.base.sat)}</button></div>
      <div class="mapx-pic" id="mapxPic" hidden><p class="mapx-pic-t" id="mapxPicText" role="status"></p><div class="mapx-pic-b"><button type="button" class="btn sm ghost" data-pic="earlier">Earlier</button><button type="button" class="btn sm ghost" data-pic="newest">Newest</button></div></div>
    </div>
    <div class="mapx-right" id="mapxRight"></div><div class="mapx-panelhost" id="mapxPanels"></div>
    <div class="mapx-lcol"><div class="mapx-legends" id="mapxLegends" hidden></div></div>
    <div class="mapx-stack" role="group" aria-label="${esc(SAY.viewGroup)}">
      <button type="button" data-view="in" aria-label="${esc(SAY.view.in)}" title="${esc(SAY.view.in)}">${svg('plus')}</button>
      <button type="button" data-view="out" aria-label="${esc(SAY.view.out)}" title="${esc(SAY.view.out)}">${svg('minus')}</button>
      <button type="button" data-view="field" aria-label="${esc(SAY.view.field)}" title="${esc(SAY.view.field)}">${svg('field')}</button>
      <button type="button" data-view="here" aria-label="${esc(SAY.view.here)}" title="${esc(SAY.view.here)}">${svg('here')}</button>
      <button type="button" data-view="full" aria-label="${esc(SAY.view.full)}" aria-pressed="false" title="${esc(SAY.view.full)}">${svg('full')}</button>
    </div>
    <div class="mapx-cross" aria-hidden="true"></div><div class="mapx-chip" id="mapxChip" aria-hidden="true" hidden></div>
    <div class="mapx-far" id="mapxFar" role="status" aria-live="polite" hidden><span>Zoom in to choose your field.</span> <button type="button" class="btn sm primary" data-act="zoomhere">Zoom in here</button></div>
    <p class="mapx-busy" id="mapxBusy" role="status" aria-live="polite" hidden><i class="dot busy" aria-hidden="true"></i> <span data-busytext>Loading the map…</span></p>
    <button type="button" class="mapbtn mapx-change" id="mapxChange">${esc(B.changeField)}</button></div>`;
  const q = s => root.querySelector(s);
  return { box: q('#mapx'), canvas: q('#mapxCanvas'), live: q('#mapxLive'), pic: q('#mapxPic'), busy: q('#mapxBusy'), far: q('#mapxFar'), hintBox: q('#mapxHint'), hint: q('#mapxHintText'), hintBtns: q('#mapxHintBtns'), why: q('#mapxWhy'),
    result: q('#mapxResult'), big: q('#mapxBig'), second: q('#mapxSecond'), usedChip: q('#mapxUsed'), chip: q('#mapxChip'), barChip: q('#mapxBarChip'), dock: q('#mapxDock'), foot: q('#mapxFoot'),
    credit: q('#mapxCredit'), stack: q('.mapx-stack'), top: q('.mapx-top'), tools: q('.mapx-seg'), base: q('.mapx-base'), baseNote: q('#mapxBaseNote'), right: q('#mapxRight'), panelHost: q('#mapxPanels'),
    legends: q('#mapxLegends'), cross: q('.mapx-cross'), change: q('#mapxChange'), btn: act => q(`#mapxHintBtns [data-act=${act}]`) };
}

// ---- the hand in use, keyboard mode and the cross
function setHand(type) { const h = type === 'mouse' ? 'mouse' : 'touch'; if (h !== hand) { hand = h; return true; } return false; }
const preciseNow = () => precise && !kbd && (!!draft || selected);
const wordsHand = () => (kbd ? 'key' : preciseNow() ? 'cross' : hand);
function kbdOn() { if (kbd) return; kbd = true; document.body.classList.add('kbd-mode'); sync(); }
function kbdOff() { if (!kbd) return; kbd = false; document.body.classList.remove('kbd-mode'); sync(); }
// How far down the bars at the top of the map reach (they wrap on a narrow map), and how tall the dock is at the foot: the free part of the map lies between.
function barsBottom() {
  const box = ui.box.getBoundingClientRect(), z = zoomOf();
  const low = [...ui.box.querySelectorAll('.mapx-top > .mapx-seg, .mapx-top > .mapx-base, .mapx-top > .mapx-pic, .mapx-right')].filter(e => e.offsetParent !== null && e.getBoundingClientRect().height > 0).reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom - box.top), 0);
  return Math.max(56, Math.ceil(low / z) + 8);
}
const dockHeight = () => (ui.dock.offsetParent === null ? 0 : ui.dock.offsetHeight + 8);
const zoomOf = () => { const r = ui.box.getBoundingClientRect(); return ui.box.offsetWidth ? r.width / ui.box.offsetWidth : 1; };   // the text-size zoom of the page
function crossPoint() { const s = map.getSize(), top = barsBottom(), bottom = s.y - dockHeight(); return L.point(s.x / 2, Math.round(bottom > top + 40 ? (top + bottom) / 2 : s.y / 2)); }
const crossLatLng = () => map.containerPointToLatLng(crossPoint());
function measure() {
  if (!ui?.box) return;
  const right = ui.right.offsetParent === null ? 0 : ui.right.offsetWidth;
  ui.box.style.setProperty('--mapx-bars', `${barsBottom()}px`);
  ui.box.style.setProperty('--mapx-dock', `${dockHeight()}px`);
  ui.box.style.setProperty('--mapx-hint-h', `${ui.hintBox && getComputedStyle(ui.hintBox).display !== 'none' ? Math.ceil(ui.hintBox.getBoundingClientRect().height) : 0}px`);
  ui.box.style.setProperty('--mapx-right-w', `${right}px`);
  if (map) { const c = crossPoint(); ui.box.style.setProperty('--cross-x', `${c.x}px`); ui.box.style.setProperty('--cross-y', `${c.y}px`); }
  roomForStack();
}
// The view stack never runs down into the dock (a tall result bar with the largest text on a short phone): buttons step aside until it fits,
// Locate first, then Zoom to your field, then Exit; zoom in and out always stay. A focused button keeps its place.
function roomForStack() {
  for (const b of ui.stack.children) b.classList.remove('over');
  if (ui.dock.offsetParent === null) return;
  const room = ui.box.clientHeight - dockHeight() - ui.stack.offsetTop - 8;
  let used = ui.stack.offsetHeight;
  for (const view of ['here', 'field', 'full']) {
    if (used <= room) break;
    const b = ui.stack.querySelector(`[data-view=${view}]`);
    if (!b || b.offsetParent === null || b === document.activeElement) continue;
    used -= b.offsetHeight; b.classList.add('over');
  }
}
function syncCross() {
  const a = document.activeElement, onBoxOrBar = a === ui.box || (ui.hintBox.contains(a) && a.tagName === 'BUTTON');
  ui.box.classList.toggle('cross-on', (kbd && onBoxOrBar) || preciseNow());
}

// ---- the pin: a teardrop inside a 44 px target, its tip on the spot, with a soft shadow that settles when it lands
const pinIcon = () => L.divIcon({ className: 'mapx-pin', iconSize: [44, 52], iconAnchor: [22, 48],
  html: '<span class="mapx-pinbody"><svg viewBox="0 0 30 38" width="30" height="38" aria-hidden="true"><path class="mapx-pinfill" d="M15 1.200C7.700 1.200 1.800 7 1.800 14.200 1.800 24 15 36.800 15 36.800S28.200 24 28.200 14.200C28.200 7 22.300 1.200 15 1.200z" stroke-width="2.400"/><circle class="mapx-pinmark" cx="15" cy="11.500" r="3.200"/><path class="mapx-pinmark" d="M8.800 20.200c.6-3.400 3.300-5 6.200-5s5.600 1.600 6.200 5z"/></svg></span><i class="mapx-pinshadow" aria-hidden="true"></i>' });
const pinEl = () => layers.pin?.getElement() ?? null;
function drawPin({ land = false, from = null } = {}) {
  if (!map) return;
  if (!keep.pin) { layers.pin?.remove(); layers.pin = null; return; }
  const at = L.latLng(keep.pin.lat, keep.pin.lon);
  if (!layers.pin) {
    layers.pin = L.marker(at, { icon: pinIcon(), interactive: false, keyboard: false, riseOnHover: false }).addTo(map);
    const el = pinEl();
    el.tabIndex = -1; el.setAttribute('aria-hidden', 'true'); el.classList.add('target');   // a field is not a spot: the mark is a soft target at the chosen place, never a pin to drag, press or reach by keys
  } else layers.pin.setLatLng(at);
  if (from && !motionOff() && (from.lat !== keep.pin.lat || from.lon !== keep.pin.lon)) {   // the old pin fades out where it was
    const old = L.marker([from.lat, from.lon], { icon: pinIcon(), interactive: false, keyboard: false }).addTo(map), o = old.getElement();
    o.setAttribute('aria-hidden', 'true'); o.classList.add('mapx-leaving');
    setTimeout(() => old.remove(), motionLess() ? 200 : 160);
  }
  if (land && !motionOff()) { const el = pinEl(); el.classList.remove('landing'); void el.offsetWidth; el.classList.add('landing'); setTimeout(() => el.classList.remove('landing'), 520); }
  dimPin();
}
function dimPin() {
  const el = pinEl(); if (!el) return;
  el.classList.toggle('dim', !!draft); el.tabIndex = -1; el.setAttribute('aria-hidden', 'true');   // the place mark is only a soft target: out of the pointer's and the Tab order's way
  el.classList.toggle('carries', !!keep.ring);
}
// A settled place for the field: the wizard keeps it (its answers and step stay), the report starts fetching.
function tellPlace() {
  if (!keep.pin) return;
  movePlace({ lat: keep.pin.lat, lon: keep.pin.lon, name: keep.pin.name || '', place: keep.pin.country || '' }, { from: 'map' });
  prefetch(keep.pin.lat, keep.pin.lon, keep.ring);
}
function setPin(latlng, { land = true } = {}) {
  const from = keep.pin ? { ...keep.pin } : null;
  keep.pin = { ...(keep.pin || {}), lat: r4(latlng.lat), lon: r4(wrapLon(latlng.lng)) };
  drawPin({ land, from: land ? from : null });
}
// the pin moved by a tap or a click (or Space at the cross): one Undo step, a toast, and the spot said
function movePinTo(latlng) {
  step('pin');
  const first = !keep.pin;
  setPin(latlng);
  tellPlace();
  if (first) { say(pinWords(keep.pin.lat, keep.pin.lon)); if (map.getZoom() < DRAW_FROM) map.setView(latlng, LAND_AT, { animate: !motionQuiet(), duration: 0.6 }); }
  else { undoToast(SAY.toast.moved); say(pinWords(keep.pin.lat, keep.pin.lon)); }
  if (spotOpen()) refreshSpot();
  saveDraft(); sync();
}

// the pin by hand: a mouse drags it at once; a finger holds it 250 ms, then it lifts 48 px above the finger; a quick tap opens the weather
function pinDown(e) {
  if (e.button > 0 || draft || !keep.pin) return;
  e.stopPropagation();
  setHand(e.pointerType); kbdOff(); clearTimeout(pendingTap);
  const touch = e.pointerType === 'touch', start = { x: e.clientX, y: e.clientY }, t0 = performance.now(), from = L.latLng(keep.pin.lat, keep.pin.lon);
  const ring0 = keep.ring?.map(p => [...p]), grab = cp(from).subtract(map.mouseEventToContainerPoint(e));
  let lifted = !touch, dragging = false, timer = 0, done = false, tip = from, auto = null;
  if (!touch) map.dragging.disable();
  const lift = () => { if (done || lifted) return; lifted = true; clearTimeout(timer); map.dragging.disable(); pinEl()?.classList.add('lifted'); haptic(8); };
  if (touch) timer = setTimeout(lift, HOLD_MS);
  const place = point => {   // a finger: the marker stays under the finger, drawn 48 px above it (its tip is the spot); a mouse: it follows the cursor
    const p = touch ? point.subtract([0, LIFT]) : point.add(grab);
    tip = map.containerPointToLatLng(p); layers.pin.setLatLng(touch ? map.containerPointToLatLng(point) : tip);
    if (ring0) { const dx = p.subtract(cp(from)); kit.outline(shiftRing(ring0, dx)); if (selected) kit.handles(shiftRing(ring0, dx), { chosen }); }
  };
  const move = ev => {
    if (ev.pointerId !== e.pointerId) return;
    const d = Math.hypot(ev.clientX - start.x, ev.clientY - start.y) / zoomOf();
    if (!lifted && performance.now() - t0 >= HOLD_MS) lift();   // still for 250 ms: a hold, even if its timer is late
    if (!lifted) { if (d > HOLD_SLOP) { clearTimeout(timer); end(); } return; }   // a quick swipe from the pin pans the map
    if (!dragging && d <= SLOP[e.pointerType === 'pen' ? 'pen' : touch ? 'touch' : 'mouse']) return;
    if (!dragging) { dragging = true; ui.box.classList.add('dragging'); moving = 'field'; sync(); }
    const pt = map.mouseEventToContainerPoint(ev); place(pt);
    auto = autoPan(pt, () => place(pt));
  };
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return;
    const quick = !dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) / zoomOf() <= SLOP[touch ? 'touch' : 'mouse'] && performance.now() - t0 < TOUCH_TAP_MS;
    end();
    if (dragging) dropPin(tip, ring0);
    else if (quick && (!touch || !lifted)) { tapSwallow = Date.now(); openCard('weather'); }
    else if (lifted) { pinEl()?.classList.remove('lifted'); }
  };
  const end = () => {
    if (done) return; done = true; clearTimeout(timer); auto?.stop();
    document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', cancel, true);
    if (!map.dragging.enabled()) map.dragging.enable();
    ui.box.classList.remove('dragging'); pinEl()?.classList.remove('lifted'); moving = null;
  };
  const cancel = ev => { if (ev.pointerId !== e.pointerId) return; end(); if (dragging) { layers.pin.setLatLng(from); if (ring0) { kit.outline(ring0); sync(); } } };
  document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', cancel, true);
}
// a ring moved by a number of screen px (the field carried by its pin)
const shiftRing = (ring, d) => ring.map(p => ll(map.containerPointToLatLng(cp(LL(p)).add(d))));
function dropPin(tip, ring0) {
  step(ring0 ? 'field' : 'pin');
  const before = { ...keep.pin };
  keep.pin = { ...keep.pin, lat: r4(tip.lat), lon: r4(wrapLon(tip.lng)) };
  if (ring0) {
    const d = cp(LL([keep.pin.lat, keep.pin.lon])).subtract(cp(LL([before.lat, before.lon])));
    keep.ring = cleanRing(shiftRing(ring0, d), 5);
    if (!insideRing(keep.pin.lat, keep.pin.lon, keep.ring)) { const at = pinSpot(keep.ring); keep.pin = { ...keep.pin, lat: r4(at[0]), lon: r4(at[1]) }; }
  }
  drawPin({ land: false });
  tellPlace(); outlineChanged();
  say(ring0 ? SAY.said.fieldMoved(Math.round(metres([before.lat, before.lon], [keep.pin.lat, keep.pin.lon])), direction([before.lat, before.lon], [keep.pin.lat, keep.pin.lon])) : pinWords(keep.pin.lat, keep.pin.lon));
  if (spotOpen()) refreshSpot();
  saveDraft(); sync();
}
// the pin by keys: the arrows move the field 8 px (Shift 40); the move is kept 400 ms after the last key, and focus stays on the pin
let pinKeys = null;
function pinKey(e) {
  const k = e.key;
  if (k === 'Enter' || k === ' ') { e.preventDefault(); e.stopPropagation(); openCard('weather'); return; }
  const s = e.shiftKey ? PIN_BIG : PIN_STEP, dx = k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0, dy = k === 'ArrowUp' ? -s : k === 'ArrowDown' ? s : 0;
  if (!dx && !dy) return;
  e.preventDefault(); e.stopPropagation(); kbdOn();
  pinKeys ||= { from: L.latLng(keep.pin.lat, keep.pin.lon), ring0: keep.ring?.map(p => [...p]), d: L.point(0, 0), timer: 0 };
  pinKeys.d = pinKeys.d.add([dx, dy]);
  const tip = map.containerPointToLatLng(cp(pinKeys.from).add(pinKeys.d));
  layers.pin.setLatLng(tip);
  if (pinKeys.ring0) { kit.outline(shiftRing(pinKeys.ring0, pinKeys.d)); if (selected) kit.handles(shiftRing(pinKeys.ring0, pinKeys.d), { chosen }); }
  clearTimeout(pinKeys.timer);
  pinKeys.timer = setTimeout(() => { const k0 = pinKeys; pinKeys = null; dropPin(tip, k0.ring0); pinEl()?.focus({ preventScroll: true }); }, 400);
}

// ---- the history: one list of up to 60 steps for the page; a step keeps what was there before it
const snap = () => ({ pin: keep.pin && { ...keep.pin }, ring: keep.ring && keep.ring.map(p => [...p]), used: keep.used, madeBy: keep.madeBy, tool: keep.tool, selected,
  draft: draft && { tool: draft.tool, pts: draft.pts.map(ll), ghost: draft.ghost } });
const clearRefusal = () => { if (refusal) { refusal = null; clearTimeout(refusalTimer); } };   // a step that went through puts the bar's words back to what to do next
function step(kind) {
  past.push({ kind, state: snap() }); if (past.length > HISTORY_MAX) past.shift();
  future.length = 0; backWords = '';
  clearRefusal();
  if (toastToken && isToast(toastToken)) hideToast();
  toastToken = 0;
}
function undoToast(words) {
  const entry = past[past.length - 1];
  toastToken = toast(words, { action: SAY.btn.undo, ms: UNDO_MS, at: toastSpot(), onAction: () => { if (past[past.length - 1] === entry) undo(); if (!ui.box.contains(document.activeElement)) ui.box.focus({ preventScroll: true, focusVisible: kbd }); } });
}
// Where the map's undo line stands: at the foot of the screen it covered the bar's words on a laptop and the Next button on a phone.
// On a phone's field step it stands just above the setup's Next bar, off the map, where it takes no tap meant for the field; on a laptop and in the
// drawing view it stands over the map, centred on it, just above the map's bar. When neither is on the screen (the page scrolled), it keeps its usual place.
function toastSpot() {
  const z = zoomOf(), m = ui.box.getBoundingClientRect(), cta = document.querySelector('#setupPanel .cta')?.getBoundingClientRect();
  if (!m.width) return null;
  if (compact() && !ui.box.classList.contains('full')) return cta && cta.height && cta.top > 120 && cta.top <= innerHeight ? { bottom: (innerHeight - cta.top + 10) / z } : null;
  const bar = ui.hintBox.offsetParent ? ui.hintBox.getBoundingClientRect().top : m.bottom, top = Math.min(bar, m.bottom);
  if (top < 120 || top > innerHeight) return null;
  return { left: Math.max(0, m.left) / z, right: Math.max(0, innerWidth - m.right) / z, bottom: (innerHeight - top + 10) / z };
}
const samePin = (a, b) => (!a && !b) || (a && b && a.lat === b.lat && a.lon === b.lon);
const sameRing = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function restore(s) {
  const pinBefore = keep.pin, ringBefore = keep.ring, usedBefore = keep.used;
  keep.pin = s.pin && { ...s.pin }; keep.ring = s.ring && s.ring.map(p => [...p]); keep.used = s.used; keep.madeBy = s.madeBy; keep.tool = s.tool;
  draft = s.draft && { tool: s.draft.tool, pts: s.draft.pts.map(LL), times: s.draft.pts.map(() => 0), ghost: s.draft.ghost };
  selected = !!(s.selected && keep.ring && !draft); chosen = -1; growF = 1;
  if (!samePin(pinBefore, keep.pin)) { drawPin({ land: false }); tellPlace(); }
  if (usedBefore && !keep.used) bus('crophalo:area', null);
  if (keep.used && (!usedBefore || !sameRing(ringBefore, keep.ring))) bus('crophalo:area', { pts: keep.ring, ha: areaHa(keep.ring) });
  if (!sameRing(ringBefore, keep.ring) || usedBefore !== keep.used) bus('crophalo:outline', { ring: keep.ring, used: keep.used });
  kit.clearDraft(); kit.outline(draft?.ghost ? null : keep.ring); kit.ghost(draft?.ghost ? keep.ring : null);
  if (spotOpen()) { if (resultSide && (!keep.ring || draft)) closeSpot(false); else refreshSpot(); }   // the result card goes with the outline it showed, and while a drawing is back
  if (selected) { if (!(resultSide && spotOpen())) showResult(false, { quiet: true }); }   // an open card is only brought up to date: it neither opens again nor takes the keyboard from a corner
  else if (!keep.ring) resultSide = false;
  dimPin(); saveDraft(); sync();
}
function undo() {
  const entry = past.pop();
  if (!entry) { say(SAY.said.nothing); return; }
  const before = snap();
  future.push({ kind: entry.kind, state: before });
  restore(entry.state);
  say(undoWords(entry.kind, before, entry.state));
}
function redo() { const entry = future.pop(); if (!entry) return; past.push({ kind: entry.kind, state: snap() }); restore(entry.state); say(SAY.said.redone); }
function undoWords(kind, before, now) {
  const n = now.draft?.pts.length ?? 0, ring = now.ring;
  if (kind === 'corner') return now.draft ? SAY.said.cornerGone(before.draft?.pts.length ?? n + 1) : '';
  if (kind === 'finish') return SAY.said.reopened(n);
  if (kind === 'move') return SAY.said.cornerBack;
  if (kind === 'add') return SAY.said.cornerRemoved(ring?.length ?? 0);
  if (kind === 'remove') return SAY.said.cornerAdded(ring?.length ?? 0);
  if (kind === 'pin' || kind === 'field') return now.pin ? pinWords(now.pin.lat, now.pin.lon) : '';
  if (kind === 'cancel' || kind === 'switch') return SAY.said.drawingBack(n);
  return ring ? SAY.said.outlineBack(pairOf(ring).spoken) : '';
}

// ---- the tools
const DRAWING = ['rect', 'poly'];
// With no outline the Rectangle is always armed: there is no Pin tool to fall back to.
function armIdle() { if (!keep.ring && !draft && keep.tool === 'pin') { draft = { tool: 'rect', pts: [], times: [], ghost: false }; keep.tool = 'rect'; } }
function setTool(tool) {
  if (!['pin', ...DRAWING].includes(tool)) return;
  if (tool === 'pin' && !keep.ring) tool = 'rect';   // there is no Pin tool: with no outline the Rectangle stays armed
  if (tool === keep.tool) { if (draft && compact()) enterDrawView(); checkFar(); return; }   // the tool already pressed changes nothing (on a phone it only brings the drawing view back)
  const had = draft;
  if (had?.pts.length) { step('switch'); kit.clearDraft(true); }
  clearRefusal();
  if (selected) deselect({ quiet: true });
  growF = 1;
  if (tool === 'pin') draft = null;
  else { draft = { tool, pts: [], times: [], ghost: !!keep.ring }; if (keep.ring) closeSpot(false); }
  keep.tool = tool;
  kit.outline(draft?.ghost ? null : keep.ring); kit.ghost(draft?.ghost ? keep.ring : null);
  if (had?.pts.length) undoToast(SAY.toast[had.tool]);
  if (draft && compact()) enterDrawView();
  dimPin(); saveDraft(); sync();
  say(`${SAY.toolSaid[tool]} ${lineWords()}`);
  checkFar();
}
// Too far out to choose a field: a clear message at once near the top centre (the same pill as "Loading the map…") with a button that zooms to the pressed spot; it goes away when the map is close enough.
let farAt = null;
const needZoom = () => (keep.tool === 'pin' ? PIN_FROM : DRAW_FROM);
function showFar(at) { if (!ui?.far || !map || map.getZoom() >= needZoom()) return; farAt = at ?? map.getCenter(); ui.far.hidden = false; }
function checkFar(at) { if (!ui?.far || !map) return; if (map.getZoom() >= needZoom()) { ui.far.hidden = true; farAt = null; } else showFar(at); }
// The drawing is taken away (Cancel, or Escape on a drawing): back to Pin, and the old outline rests again. An Undo brings it back.
function cancelDrawing() {
  if (!draft) return;
  const n = draft.pts.length, tool = draft.tool;
  if (n) step('cancel');
  kit.clearDraft(true);
  draft = null; keep.tool = 'pin'; growF = 1; armIdle();
  kit.ghost(null); kit.outline(keep.ring);
  if (n) undoToast(SAY.toast[tool]);
  dimPin(); saveDraft(); sync();
}
// Escape, one layer at a time: a panel or card, a drawing, the editing, an armed tool, full screen.
function escape(event) {
  const stop = () => event?.preventDefault?.();
  if (panels?.isOpen()) { stop(); panels.close(true); return; }
  if (spotOpen()) { stop(); closeSpot(); return; }
  if (draft?.pts.length) { stop(); cancelDrawing(); return; }
  if (selected) { stop(); deselect({ words: true }); return; }
  if (draft && keep.ring) { stop(); setTool('pin'); return; }   // with no outline the Rectangle is always armed: Escape goes on to leave full screen
  if (ui.box.classList.contains('full')) { stop(); exitFull(); }
}

// ---- reading a gesture: one pointer reader for every tool (a tap is short, still and one-fingered; a pan, a pinch or a brush never is)
function onDown(e) {
  pointers.add(e.pointerId);
  if (pointers.size > 1) { if (gesture) gesture.multi = true; return; }
  if (e.button > 0 || ui.box.classList.contains('strip')) return;
  if (e.target.closest('.mapx-pin, .mapx-hicon, .mapx-micon')) return;   // those own their gesture
  setHand(e.pointerType);
  if (!ui.box.contains(document.activeElement) || document.activeElement === document.body) ui.box.focus({ preventScroll: true, focusVisible: false });   // the keys work after a click, with no focus ring and no keyboard mode
  if (gesture?.timer) clearTimeout(gesture.timer);
  const type = e.pointerType === 'pen' ? 'pen' : e.pointerType === 'touch' ? 'touch' : 'mouse';
  gesture = { id: e.pointerId, type, x0: e.clientX, y0: e.clientY, p0: map.mouseEventToContainerPoint(e), t0: performance.now(), max: 0, multi: false, moved: false, shift: e.shiftKey };
  const d = map.dragging._draggable; if (d) d.options.clickTolerance = type === 'touch' ? 9 : 3;   // a finger's tap may wander 6 px: the map does not pan for that
  if (type !== 'touch' && keep.tool === 'rect' && draft && !draft.pts.length && !preciseNow() && map.getZoom() >= DRAW_FROM) { gesture.boxable = true; map.dragging.disable(); }   // the quick north-up box: only the very first press-and-drag
}
function onMove(e) {
  const g = gesture;
  if (g && e.pointerId === g.id) {
    const d = Math.hypot(e.clientX - g.x0, e.clientY - g.y0) / zoomOf();
    g.max = Math.max(g.max, d);
    if (g.boxable && (g.box || d > SLOP.mouse)) { g.box = true; boxDrag(g.p0, map.mouseEventToContainerPoint(e)); return; }
  }
  if (e.pointerType === 'mouse' && !e.buttons) { hover = map.mouseEventToContainerPoint(e); hoverShift = e.shiftKey; if (draft || (selected && moving)) liveRedraw(); }
}
function onUp(e) {
  pointers.delete(e.pointerId);
  const g = gesture;
  if (!g || e.pointerId !== g.id) return;
  gesture = null;
  if (g.boxable) map.dragging.enable();
  if (g.box) { endBox(g.p0, map.mouseEventToContainerPoint(e)); return; }
  const now = performance.now(), tap = !g.multi && !g.moved && g.max <= SLOP[g.type] && (g.type !== 'touch' || now - g.t0 <= TOUCH_TAP_MS) && Date.now() - tapSwallow >= SWALLOW_MS;
  if (!tap) return;
  const point = map.mouseEventToContainerPoint(e);
  onTap({ point, latlng: map.containerPointToLatLng(point), type: g.type, shift: e.shiftKey, at: now });
}
function onCancel(e) { pointers.delete(e.pointerId); if (gesture?.id === e.pointerId) { if (gesture.boxable) map.dragging.enable(); if (gesture.box) { boxNow = null; drawDraft(); } gesture = null; } }

function onTap(t) {
  if (ui.box.classList.contains('strip')) return;
  if (preciseNow()) { glideToCross(t.point); return; }   // Precise: a tap glides that spot under the cross; it never places a point
  if (draft) {
    if (map.getZoom() < DRAW_FROM) { showFar(t.latlng); zoomInAt(t.latlng, 2); return; }
    if (draft.tool === 'rect') rectTap(t); else polyTap(t);
    return;
  }
  // the Pin tool
  if (map.getZoom() < PIN_FROM) { showFar(t.latlng); zoomInAt(t.latlng, 3, true); return; }
  if (keep.ring) {
    const on = onOutline(t.point);
    if (on && !selected) select({ open: true });
    else if (!on && selected) deselect({ words: true });
    return;
  }
  if (!keep.pin) { movePinTo(t.latlng); return; }
  if (t.type === 'touch') {   // a finger waits 300 ms: a second tap makes it a double tap, which zooms and never moves the pin
    const twice = lastTouchTap && t.at - lastTouchTap.at < TAP_WAIT + 150 && t.point.distanceTo(lastTouchTap.point) < 40;
    clearTimeout(pendingTap); lastTouchTap = twice ? null : t;
    if (!twice) pendingTap = setTimeout(() => { lastTouchTap = null; movePinTo(t.latlng); }, TAP_WAIT);
    return;
  }
  movePinTo(t.latlng);
}
function zoomInAt(latlng, levels, forPin = false) {
  const z = Math.min(map.getZoom() + levels, forPin ? PIN_FROM + 2 : DRAW_FROM + 1);
  map.setZoomAround(latlng, Math.max(z, map.getZoom() + 1), { animate: !motionQuiet() });
  say(SAY.said.zoomedIn);
}
// Zoom by a step from the keys or the stack. A press while the map is still zooming is kept and done when it stops (Leaflet would drop it).
let zoomGoal = null;
function zoomBy(d) {
  const base = zoomGoal ?? (map._animatingZoom ? map._animateToZoom : map.getZoom()), z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), base + d));
  if (map._animatingZoom) { if (zoomGoal === null) map.once('zoomend', () => { const g = zoomGoal; zoomGoal = null; if (g !== null && g !== map.getZoom()) map.setZoom(g, { animate: !motionQuiet() }); }); zoomGoal = z; return; }
  map.setZoom(z, { animate: !motionQuiet() });
}
function glideToCross(point) {
  const d = point.subtract(crossPoint());
  if (Math.abs(d.x) < 1 && Math.abs(d.y) < 1) return;
  glide = true; map.panBy(d, { animate: !motionQuiet(), duration: 0.24, easeLinearity: 0.25 }); setTimeout(() => { glide = false; }, 300);
}
const onOutline = point => {   // a tap inside the outline, or on its line
  if (!keep.ring) return false;
  const at = map.containerPointToLatLng(point);
  if (insideRing(at.lat, at.lng, keep.ring)) return true;
  const pts = keep.ring.map(p => cp(LL(p))), tol = hand === 'touch' ? 16 : 8;
  return pts.some((a, i) => { const b = pts[(i + 1) % pts.length]; return L.LineUtil.pointToSegmentDistance(point, a, b) <= tol; });
};

// ---- Rectangle: three taps (two corners along one side, then the far side), or the quick north-up box by a mouse drag
function rectTap(t) {
  const pts = draft.pts, n = pts.length;
  if (n === 0) { step('corner'); pts.push(t.latlng); draft.times.push(t.at ?? performance.now()); say(SAY.said.firstSet); haptic(8); saveDraft(); sync(); return; }
  const A = pts[0];
  if (n === 1) {
    if (t.point.distanceTo(cp(A)) < MIN_PX) { refuse(SAY.no.rectNear, t.latlng); return; }
    let B = t.latlng;
    if (t.type !== 'cross' && !(t.shift && t.type === 'mouse')) B = LL(snapAxis(ll(A), ll(B), 3).at);   // a side within 3 degrees of north-south or east-west lies on it: a north-up field stays easy by finger
    step('corner'); pts.push(B); draft.times.push(t.at ?? performance.now());
    say(SAY.said.sideSet(lengthWords(metres(ll(A), ll(B)), order(), true))); haptic(8);
    growEdge(); saveDraft(); sync(); return;
  }
  const a = cp(A), b = cp(pts[1]), p = t.point, len = a.distanceTo(b), off = len ? Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len : 0;
  if (off < MIN_PX) { refuse(SAY.no.farSide, t.latlng); return; }
  const ring = threePointRect(ll(A), ll(pts[1]), ll(t.latlng));
  if (ring) finish(ring.map(LL), 'rect');
}
function boxDrag(p0, p) {
  const a = map.containerPointToLatLng(p0), c = map.containerPointToLatLng(p), b = map.containerPointToLatLng([p.x, p0.y]), d = map.containerPointToLatLng([p0.x, p.y]);
  boxNow = { a, b, c, d, point: p };
  drawDraft(); syncLight();   // follows the hand 1:1: only the box, its chip and the bar's words
}
function endBox(p0, p1) {
  boxNow = null;
  if (Math.abs(p1.x - p0.x) < MIN_PX || Math.abs(p1.y - p0.y) < MIN_PX) { drawDraft(); refuse(SAY.no.thinBox); return; }   // a line, not a field
  const a = map.containerPointToLatLng(p0), b = map.containerPointToLatLng(p1);
  finish(boxCorners(ll(a), ll(b), 5).map(LL), 'rect');
}

// ---- Corners: a tap for each corner; the first corner's magnet, a double click, a tap on the last corner, Enter or Finish closes it
function magnetRadius(kind) {
  const [base, floor] = MAGNET[kind] || MAGNET.mouse, pts = draft.pts, f = cp(pts[0]);
  const nearest = Math.min(...pts.slice(1).map(p => f.distanceTo(cp(p))));
  return Math.max(floor, Math.min(base, nearest / 4));
}
function polySnap(latlng, kind, shift) {   // a mouse only: a right angle at the last corner, or the one point that squares the field off; Shift turns it off
  const pts = draft.pts, n = pts.length;
  if (kind !== 'mouse' || shift || n < 2) return { latlng, marks: [] };
  const P = cp(latlng), xy = p => { const q = cp(p); return [q.x, q.y]; };
  if (n >= 3) { const s = squareOff(xy(pts[n - 2]), xy(pts[n - 1]), xy(pts[0]), xy(pts[1]), [P.x, P.y], 12); if (s.snapped) { const at = map.containerPointToLatLng(s.at); return { latlng: at, marks: [n - 1, 'new', 0] }; } }
  const r = rightAngleSnap(xy(pts[n - 2]), xy(pts[n - 1]), [P.x, P.y], { tol: 5, minLen: 40 });
  return r.snapped ? { latlng: map.containerPointToLatLng(r.at), marks: [n - 1] } : { latlng, marks: [] };
}
function polyTap(t) {
  const pts = draft.pts, n = pts.length, kind = t.type === 'cross' ? 'cross' : t.type, P = t.point;
  if (n >= 3 && P.distanceTo(cp(pts[0])) <= magnetRadius(kind)) { closePoly(); return; }
  if (n >= 1 && P.distanceTo(cp(pts[n - 1])) <= NEAR_LAST[kind]) {   // on the last corner: it closes, unless it is the quick second tap of a habitual double tap
    const late = (t.at ?? performance.now()) - (draft.times[n - 1] || 0) > QUICK_MS;
    if (n >= 3 && late && t.type !== 'cross') closePoly();
    else if (n === 1 && late) refuse(SAY.no.fewCorners, pts[0]);   // the only corner is also the first: closing needs 3
    return;
  }
  if (n >= 1 && n < 3 && P.distanceTo(cp(pts[0])) <= NEAR_LAST[kind]) { refuse(SAY.no.fewCorners, pts[0]); return; }
  if (n >= MAX_CORNERS) { refuse(SAY.no.tooMany, t.latlng); return; }
  const at = t.type === 'cross' ? t.latlng : polySnap(t.latlng, kind, t.shift).latlng;
  if (n >= 2 && edgeCrosses(pts.map(ll), ll(pts[n - 1]), ll(at))) { refuse(SAY.no.cross, at); return; }
  step('corner'); pts.push(at); draft.times.push(t.at ?? performance.now());
  const m = pts.length;
  say(m < 3 ? SAY.said.corner(m) : SAY.said.cornerSoFar(m, pairOf(cleanRing(pts.map(ll), 5)).spoken)); haptic(8);   // the corners as the outline will keep them: the close then says the same figure
  if (t.type === 'touch' && m >= 2) growEdge();
  saveDraft(); sync();
}
function closePoly() {
  const pts = draft?.pts ?? [];
  if (pts.length < 3) { refuse(SAY.no.fewCorners); return; }
  if (edgeCrosses(pts.map(ll), ll(pts[pts.length - 1]), ll(pts[0]))) { refuse(SAY.no.closeCross); return; }
  finish(pts, 'poly');
}
function growEdge() { if (motionOff() || motionLess()) return; growF = 0; kit.grow(160, f => { growF = f; drawDraft(); }); }

// ---- the close: the outline, the pin inside it, one message, and the result
function finish(latlngs, madeBy) {
  const ring = cleanRing(latlngs.map(ll), 5), problem = outlineProblem(ring, order());
  if (problem) { refuse(problem); return; }
  step('finish');
  const oldUsed = draft?.ghost && keep.used, from = draft?.pts.map(ll);
  draft = null; boxNow = null; growF = 1;
  keep.ring = ring; keep.madeBy = madeBy; keep.used = true; keep.tool = 'pin';   // a closed outline is used for the report at once; Undo takes it back
  if (oldUsed) bus('crophalo:area', null);
  let pinMoved = false;
  if (!keep.pin || !insideRing(keep.pin.lat, keep.pin.lon, ring)) { const had = !!keep.pin, at = pinSpot(ring); setPin(LL(at)); pinMoved = had; }   // on the pin's own 4-decimal grid, so the kept pin is still inside
  tellPlace();
  if (keep.pin) import('./weather.js').then(w => w.getForecast(keep.pin.lat, keep.pin.lon)).catch(() => {});   // the forecast is asked for now, kept in memory, and the Weather tab finds it there
  bus('crophalo:area', { pts: ring, ha: areaHa(ring) }); bus('crophalo:outline', { ring, used: true });
  if (keep.pin) prefetch(keep.pin.lat, keep.pin.lon, ring);
  selected = true; chosen = -1; changedUsed = false;
  kit.clearDraft(); kit.ghost(null); kit.outline(ring, { seal: true, crossFrom: from });
  say(SAY.said.outlined(pairOf(ring).spoken, ring.length) + ` ${SAY.said.usedNow}` + (pinMoved ? ` ${SAY.said.pinInside}` : ''));
  haptic(16);
  undoToast(SAY.toast.used);
  dimPin(); saveDraft(); sync({ fade: true });
  showResult(true);
}
// the outline selected: its handles, and the area beside the map (a card on a wide map, the result bar on a narrow one)
function select({ open = true } = {}) {
  if (!keep.ring) return;
  selected = true; chosen = -1; changedUsed = false; clearRefusal();
  sync({ fade: true });
  if (open) showResult(false);
}
function deselect({ words = false, quiet = false } = {}) {
  if (!selected) return;
  selected = false; chosen = -1; clearRefusal();
  if (!quiet) { if (changedUsed) say(SAY.said.usedChanged(pairOf(keep.ring).spoken)); else if (words && keep.ring) say(SAY.said.kept(pairOf(keep.ring).spoken)); }
  changedUsed = false;
  sync({ fade: true });
  if (spotOpen()) refreshSpot();
}
const wideMap = () => ui.box.offsetWidth >= SIDE_FROM;
function showResult(fresh, { quiet = fresh } = {}) {   // fresh: a close (its figure rolls in); quiet: the card says nothing of its own and leaves the keyboard where it is
  if (!keep.ring) return;
  if (wideMap()) { resultSide = true; openCard('area', { quiet, roll: fresh }); requestAnimationFrame(() => fitResult()); }
  else { if (spotOpen()) closeSpot(false); resultSide = false; if (fresh && !motionOff()) { ui.hintBox.classList.remove('rising'); void ui.hintBox.offsetWidth; ui.hintBox.classList.add('rising'); setTimeout(() => ui.hintBox.classList.remove('rising'), 300); } requestAnimationFrame(() => fitResult()); }
}
// The outline shows in the free part of the map: left of the card, below the bars, above the dock. Already there: the view stays still.
function fitResult() {
  if (!keep.ring || !map) return;
  const size = map.getSize(), card = resultSide && spotOpen() ? { w: Math.min(WIDE, size.x) } : null, pad = fitPadding(card, { w: size.x, h: size.y }, barsBottom(), dockHeight());
  if (size.y - pad.topLeft[1] - pad.bottomRight[1] < 40) { pad.topLeft[1] -= 12; pad.bottomRight[1] -= 12; }   // a short phone with the largest text: the outline may come closer to the bars than the usual gap
  const b = L.latLngBounds(keep.ring), nw = cp(b.getNorthWest()), se = cp(b.getSouthEast());
  const free = { l: pad.topLeft[0], t: pad.topLeft[1], r: size.x - pad.bottomRight[0], b: size.y - pad.bottomRight[1] };
  if (free.r - free.l < 40 || free.b - free.t < 40) return;   // even then it shows above the bar, if small; with less room than that the view stays
  if (nw.x >= free.l && nw.y >= free.t && se.x <= free.r && se.y <= free.b) return;
  if (se.x - nw.x <= free.r - free.l && se.y - nw.y <= free.b - free.t) {   // it fits: only a pan, just far enough
    const dx = nw.x < free.l ? nw.x - free.l : se.x > free.r ? se.x - free.r : 0, dy = nw.y < free.t ? nw.y - free.t : se.y > free.b ? se.y - free.b : 0;
    map.panBy([dx, dy], { animate: !motionQuiet(), duration: 0.4, easeLinearity: 0.25 });
  } else map.fitBounds(b, { paddingTopLeft: pad.topLeft, paddingBottomRight: pad.bottomRight, maxZoom: Math.max(SELF_MAX, map.getZoom()), animate: !motionQuiet(), duration: 0.4 });   // the fit never zooms in past 16
}

// ---- changing the finished outline: corners by mouse, finger (after a hold) and keys; "+" midpoints; Remove corner
const handleOn = {
  down: (i, e) => cornerDown(i, e, false),
  midDown: (i, e) => cornerDown(i, e, true),
  key: (i, e) => cornerKey(i, e),
  click: (i, e) => { if (e.detail === 0) { e.preventDefault(); choose(i); } },   // Enter or Space on a corner chooses it (a pointer's click is read by its own press)
};
function choose(i) {
  chosen = chosen === i ? -1 : i;
  if (chosen >= 0 && preciseNow()) glideToCross(cp(LL(keep.ring[chosen])));
  sync();
}
// A corner drag: a mouse moves it at once; a finger holds it 250 ms first (a quick swipe from it pans the map), then the corner shows 48 px above the finger.
function cornerDown(i, e, mid) {
  if (e.button > 0 || !keep.ring) return;
  setHand(e.pointerType); kbdOff();
  const touch = e.pointerType === 'touch', start = { x: e.clientX, y: e.clientY }, t0 = performance.now(), ring0 = keep.ring.map(p => [...p]);
  let lifted = !touch, dragging = false, timer = 0, done = false, ring = ring0, auto = null;
  if (!touch) { e.stopPropagation(); e.preventDefault(); map.dragging.disable(); }
  const lift = () => {
    if (done || lifted) return; lifted = true; clearTimeout(timer); map.dragging.disable(); ui.box.classList.add('lifting'); haptic(8);
    const el = mid ? null : kit.handleEl(i)?.parentElement;   // the corner rises above the finger: slides up under Full, jumps under Less and Still
    if (el && !motionQuiet()) { el.classList.add('mapx-lift'); setTimeout(() => el.classList.remove('mapx-lift'), 160); }
    show(at(down));
  };
  if (touch) timer = setTimeout(lift, HOLD_MS);
  const down = map.mouseEventToContainerPoint(e);
  const at = point => {   // the ring with this corner (or a new one after the "+") where the pointer says
    const p = touch ? point.subtract([0, LIFT]) : point, q = map.containerPointToLatLng(p);
    let r = mid ? [...ring0.slice(0, i + 1), ll(q), ...ring0.slice(i + 1)] : ring0.map((c, k) => (k === i ? ll(q) : c));
    const k = mid ? i + 1 : i;
    if (!touch && !e.shiftKey && r.length >= 4) r = squareCorner(r, k, p);
    return r;
  };
  const show = (r, finger = null) => {
    const bad = selfCrosses(r);
    ring = r; kit.outline(r, { bad }); kit.handles(r, { chosen: mid ? i + 1 : i }); liveArea(r, bad); ui.box.classList.toggle('crossing', bad);
    if (touch) { const k = mid ? i + 1 : i, f = finger ?? lastFinger; kit.draft(f ? { stem: [r[k], ll(map.containerPointToLatLng(f))] } : null); }   // a thin stem from the lifted corner down to the finger
  };
  let lastFinger = down;
  const move = ev => {
    if (ev.pointerId !== e.pointerId) return;
    const d = Math.hypot(ev.clientX - start.x, ev.clientY - start.y) / zoomOf();
    if (!lifted && performance.now() - t0 >= HOLD_MS) lift();   // still for 250 ms: a hold, even if its timer is late
    if (!lifted) { if (d > HOLD_SLOP) { clearTimeout(timer); end(); } return; }
    if (!dragging && d <= SLOP[touch ? 'touch' : 'mouse']) return;
    if (!dragging) { dragging = true; moving = 'corner'; ui.box.classList.add('dragging'); sync(); }
    const pt = map.mouseEventToContainerPoint(ev); lastFinger = pt; show(at(pt), pt);
    auto = autoPan(pt, () => show(at(pt), pt));
  };
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return;
    const quick = !dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) / zoomOf() <= SLOP[touch ? 'touch' : 'mouse'] && performance.now() - t0 < TOUCH_TAP_MS;
    end();
    if (touch) kit.draft(null);
    if (dragging) dropCorner(ring0, ring, mid ? 'add' : 'move');
    else if (lifted && touch) { kit.outline(ring0); sync(); }
    else if (quick && (!touch || !lifted)) { if (mid) { const r = [...ring0.slice(0, i + 1), ll(L.latLngBounds([LL(ring0[i]), LL(ring0[(i + 1) % ring0.length])]).getCenter()), ...ring0.slice(i + 1)]; dropCorner(ring0, r, 'add'); chosen = i + 1; sync(); } else choose(i); }
  };
  const end = () => {
    if (done) return; done = true; clearTimeout(timer); auto?.stop();
    document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', cancel, true);
    if (!map.dragging.enabled()) map.dragging.enable();
    ui.box.classList.remove('dragging', 'lifting', 'crossing'); moving = null;
  };
  const cancel = ev => { if (ev.pointerId !== e.pointerId) return; end(); kit.draft(null); if (dragging || lifted) { kit.outline(ring0); sync(); } };
  document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', cancel, true);
}
function squareCorner(r, k, p) {   // a mouse: a corner snaps when both its neighbours' angles are within 4 degrees of square; Shift frees it
  const n = r.length, xy = c => { const q = cp(LL(c)); return [q.x, q.y]; }, at = i => r[(i + n) % n];
  const s = squareOff(xy(at(k - 2)), xy(at(k - 1)), xy(at(k + 1)), xy(at(k + 2)), [p.x, p.y], 1e9);
  if (!s.snapped) return r;
  const ang = (a, b, c) => { const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]]; return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1)))) * 180 / Math.PI; };
  const P = [p.x, p.y], ok = Math.abs(ang(xy(at(k - 2)), xy(at(k - 1)), P) - 90) <= 4 && Math.abs(ang(P, xy(at(k + 1)), xy(at(k + 2))) - 90) <= 4;
  return ok ? r.map((c, i) => (i === k ? ll(map.containerPointToLatLng(s.at)) : c)) : r;
}
// a drop that would cross slides back (160 ms under Full, a jump otherwise) with the words
function dropCorner(ring0, ring, kind) {
  if (selfCrosses(ring)) {
    refuse(SAY.no.cross, LL(ring.find((c, i) => c !== ring0[i]) || ring[0]));
    if (!motionQuiet()) { const from = ring.map(LL), to = ring0.map(LL); if (from.length === to.length) kit.grow(160, f => kit.outline(from.map((p, i) => L.latLng(p.lat + (to[i].lat - p.lat) * f, p.lng + (to[i].lng - p.lng) * f)))); else kit.outline(ring0); }
    else kit.outline(ring0);
    sync(); return;
  }
  editRing(cleanRing(ring, 5), kind);
}
// every finished drag, add, remove or move: one Undo step, the pin kept inside, the report told when the outline is used
function editRing(ring, kind, words = '') {
  const problem = outlineProblem(ring, order());
  if (problem) { refuse(problem); kit.outline(keep.ring); sync(); return false; }
  step(kind);
  keep.ring = ring;
  if (keep.pin && !insideRing(keep.pin.lat, keep.pin.lon, ring)) { setPin(LL(pinSpot(ring)), { land: false }); tellPlace(); }
  outlineChanged();
  kit.outline(ring);
  if (words) say(words);
  saveDraft(); sync();
  return true;
}
function outlineChanged() {
  if (!keep.ring) return;
  prefetchSoon();
  if (keep.used) { bus('crophalo:area', { pts: keep.ring, ha: areaHa(keep.ring) }); changedUsed = true; }
  bus('crophalo:outline', { ring: keep.ring, used: keep.used });
  if (spotOpen()) refreshSpot();
}
function removeCorner(i) {
  if (!keep.ring || i < 0) return;
  if (keep.ring.length <= 3) { refuse(SAY.no.fewCorners, LL(keep.ring[i])); return; }
  const ring = keep.ring.filter((_, k) => k !== i);
  if (editRing(ring, 'remove', SAY.said.cornerRemoved(ring.length))) { chosen = -1; sync(); kit.handleEl(Math.min(i, ring.length - 1))?.focus({ preventScroll: true, focusVisible: kbd }); }
}
function insertCorner(i) {
  if (!keep.ring) return;
  if (keep.ring.length >= MAX_CORNERS) { refuse(SAY.no.tooMany); return; }
  const a = keep.ring[i], b = keep.ring[(i + 1) % keep.ring.length], ring = [...keep.ring.slice(0, i + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ...keep.ring.slice(i + 1)];
  if (editRing(cleanRing(ring, 5), 'add', SAY.said.cornerAdded(ring.length))) kit.handleEl(i + 1)?.focus({ preventScroll: true, focusVisible: kbd });
}
function moveCornerTo(i, latlng) {
  const ring = keep.ring.map((c, k) => (k === i ? ll(latlng) : c));
  if (selfCrosses(ring)) { refuse(SAY.no.cross, latlng); return; }
  editRing(cleanRing(ring, 5), 'move');
}
// a corner by keys: the arrows move it by the larger of 10 m and 4 px (Shift five times as far); Delete or Backspace takes it away, Insert adds one after it
function cornerKey(i, e) {
  const k = e.key;
  if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); deselect({ words: true }); ui.box.focus({ preventScroll: true }); return; }
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); e.stopPropagation(); kbdOn(); removeCorner(i); return; }
  if (k === 'Insert') { e.preventDefault(); e.stopPropagation(); kbdOn(); insertCorner(i); return; }
  const sx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, sy = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
  if (!sx && !sy) return;
  e.preventDefault(); e.stopPropagation(); kbdOn();
  const c = LL(keep.ring[i]), p = cp(c), mPerPx = Math.max(1e-6, metres(ll(c), ll(map.containerPointToLatLng(p.add([1, 0]))))), px = Math.max(10 / mPerPx, 4) * (e.shiftKey ? 5 : 1);
  const to = map.containerPointToLatLng(p.add([sx * px, sy * px])), ring = keep.ring.map((q, n) => (n === i ? ll(to) : q));
  if (selfCrosses(ring)) { refuse(SAY.no.cross, to); return; }
  chosen = i;
  editRing(cleanRing(ring, 5), 'move', SAY.said.cornerMoved(i + 1, Math.round(metres(ll(c), ll(to))), direction(ll(c), ll(to))));
}
// Under Full, a corner or the pin dragged near the edge of the map moves the map along, 40 px from the edge.
function autoPan(point, redraw) {
  if (motionQuiet()) return null;
  const s = map.getSize(), dx = point.x < AUTO_EDGE ? -6 : point.x > s.x - AUTO_EDGE ? 6 : 0, dy = point.y < barsBottom() ? -6 : point.y > s.y - dockHeight() - 8 ? 6 : 0;
  if (!dx && !dy) return null;
  let on = true;
  const tick = () => { if (!on) return; map.panBy([dx, dy], { animate: false }); redraw(); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return { stop() { on = false; } };
}

// ---- the drawing as it is now: placed corners, the guide to the pointer or the cross, previews, the chip
function liveLatLng() {
  if (kbd || preciseNow()) return crossLatLng();
  if (hand === 'mouse' && hover) return map.containerPointToLatLng(hover);
  return null;
}
const liveKind = () => (kbd || preciseNow() ? 'cross' : hand === 'mouse' ? 'mouse' : 'touch');
function liveRedraw() { drawDraft(); syncLight(); }
const pathOf = pts => pts.map(p => [p.lat, p.lng]);
function drawDraft() {
  magnetOn = false; crossingNow = false; closeCrossNow = false;
  let chip = null;
  if (boxNow) {
    const { a, b, c, d, point } = boxNow;
    kit.draft({ box: [[a, b], [a, d], [b, c], [d, c]].map(pathOf), fill: [a, b, c, d] });
    chip = chipWords([a, b, c, d].map(ll)); placeChip(chip, point); return;
  }
  if (!draft) {
    if (selected && chosen >= 0 && keep.ring && preciseNow() && !moving) {   // Precise: the chosen corner's two edges follow the cross until Move corner here
      const n = keep.ring.length, c = crossLatLng(), r = keep.ring.map((p, k) => (k === chosen ? ll(c) : p));
      kit.draft({ guide: [keep.ring[(chosen - 1 + n) % n], ll(c), keep.ring[(chosen + 1) % n]], bad: selfCrosses(r) });
      placeChip(chipWords(r), null, true); return;
    }
    if (!moving) { kit.draft(null); placeChip(null); }
    return;
  }
  const live = liveLatLng(), pts = draft.pts, n = pts.length, kind = liveKind();
  if (draft.tool === 'poly') {
    let tip = null, marks = [];
    if (live && n) {
      const s = kind === 'cross' ? { latlng: live, marks: [] } : polySnap(live, kind, hoverShift);
      tip = s.latlng; marks = s.marks;
      if (n >= 3 && cp(live).distanceTo(cp(pts[0])) <= magnetRadius(kind)) { magnetOn = true; tip = pts[0]; marks = []; }
    }
    crossingNow = !!(tip && !magnetOn && n >= 2 && edgeCrosses(pts.map(ll), ll(pts[n - 1]), ll(tip)));
    const shown = n >= 2 && growF < 1 ? [...pts.slice(0, n - 1), L.latLng(pts[n - 2].lat + (pts[n - 1].lat - pts[n - 2].lat) * growF, pts[n - 2].lng + (pts[n - 1].lng - pts[n - 2].lng) * growF)] : pts;
    const closeFrom = tip && !magnetOn ? tip : (hand === 'touch' || kind === 'touch') && n >= 3 ? pts[n - 1] : null;
    if (closeFrom && n >= 3 && !magnetOn) closeCrossNow = edgeCrosses(pts.map(ll), ll(closeFrom), ll(pts[0]));
    const shape = magnetOn ? pts : tip ? [...pts, tip] : pts;
    kit.draft({ edges: shown.length >= 2 ? pathOf(shown) : null, guide: tip && n ? pathOf([pts[n - 1], tip]) : null, closing: closeFrom && n >= 2 ? pathOf([closeFrom, pts[0]]) : null,
      fill: shape.length >= 3 ? pathOf(shape) : null, dots: pts, ring: n >= 3 ? { at: pts[0], near: magnetOn } : null, marks: squareMarks(marks, tip), bad: crossingNow, closeBad: closeCrossNow });
    chip = crossingNow ? 'cross' : shape.length >= 3 ? chipWords(shape.map(ll)) : null;
  } else {
    const A = pts[0];
    if (n === 1) {
      const guide = live ? [A, live] : null;
      kit.draft({ dots: pts, guide: guide && pathOf(guide), labels: guide ? inView([{ at: midOf(A, live), text: lengthWords(metres(ll(A), ll(live)), order()) }]) : [] });
    } else if (n === 2) {
      const B = growF < 1 ? L.latLng(A.lat + (pts[1].lat - A.lat) * growF, A.lng + (pts[1].lng - A.lng) * growF) : pts[1];
      const rect = live && growF >= 1 ? threePointRect(ll(A), ll(pts[1]), ll(live)) : null, labels = [{ at: midOf(A, B), text: lengthWords(metres(ll(A), ll(B)), order()) }];
      if (rect) labels.push({ at: midOf(LL(rect[1]), LL(rect[2])), text: lengthWords(metres(rect[1], rect[2]), order()) });
      kit.draft({ dots: growF < 1 ? [A] : pts, edges: pathOf([A, B]), preview: rect ? [[rect[1], rect[2]], [rect[0], rect[3]], [rect[2], rect[3]]] : null, fill: rect, labels: inView(labels) });
      if (rect) chip = chipWords(rect);
    } else kit.draft(null);
  }
  placeChip(chip, hover);
}
const midOf = (a, b) => L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
const inView = labels => { const s = map.getSize(), top = barsBottom(), bottom = s.y - dockHeight(); return labels.filter(l => { const p = cp(l.at); return p.x >= 40 && p.x <= s.x - 40 && p.y >= top && p.y <= bottom; }); };   // a length is shown only where it can be read whole
function squareMarks(marks, tip) {   // a small open square at each corner snapped square
  if (!marks.length || !draft) return null;
  const pts = [...draft.pts, tip], n = pts.length, out = [];
  for (const m of marks) {
    const i = m === 'new' ? n - 1 : m, c = cp(pts[i]), a = cp(pts[(i - 1 + n) % n]), b = cp(pts[(i + 1) % n]);
    const u = a.subtract(c), v = b.subtract(c), lu = Math.hypot(u.x, u.y) || 1, lv = Math.hypot(v.x, v.y) || 1, uu = u.multiplyBy(9 / lu), vv = v.multiplyBy(9 / lv);
    out.push([c.add(uu), c.add(uu).add(vv), c.add(vv)].map(p => ll(map.containerPointToLatLng(p))));
  }
  return out;
}
const chipWords = ring => { const p = areaPair(areaHa(cleanRing(ring, 5)), order()); return `${SAY.about} ${p.first} · ${p.second}`; };   // the corners as the outline will keep them, so the chip at the close reads what the card then shows
function liveArea(ring, crossing = false) {   // while a corner moves: the area follows the hand in the bar's chip, or "Lines cross" while the outline would cross itself
  placeChip(crossing ? 'cross' : chipWords(ring), null, true);
}
// The live area chip: by the pointer for a mouse (16 px right and below, kept 8 px inside the free part of the map), else at the right of the bar line.
function placeChip(text, at, inBar = false) {
  const cross = text === 'cross', words = cross ? SAY.linesCross : text, mouse = !inBar && hand === 'mouse' && at && !kbd && !preciseNow();
  ui.chip.hidden = !(words && mouse); ui.barChip.hidden = !(words && !mouse);
  for (const c of [ui.chip, ui.barChip]) c.classList.toggle('bad', !!cross);
  if (!words) return;
  if (!mouse) { if (ui.barChip.textContent !== words) ui.barChip.textContent = words; return; }
  if (ui.chip.textContent !== words) ui.chip.textContent = words;
  const s = map.getSize(), w = ui.chip.offsetWidth, h = ui.chip.offsetHeight, top = barsBottom(), bottom = s.y - dockHeight();
  let x = at.x + 16, y = at.y + 16;
  if (x + w > s.x - 8) x = at.x - 16 - w;
  if (y + h > bottom - 8) y = at.y - 16 - h;
  x = Math.max(8, Math.min(x, s.x - 8 - w)); y = Math.max(top, Math.min(y, bottom - 8 - h));
  ui.chip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

// ---- the action bar: made once; its buttons show, hide and say why they cannot act, never rebuilt
function stateNow() {
  if (draft) return !draft.pts.length && !boxNow ? 'armed' : draft.tool === 'poly' && magnetOn ? 'closing' : 'drawing';
  if (selected) return chosen >= 0 || moving ? 'editing' : 'finished';
  return 'idle';
}
function lineWords() {
  const h = wordsHand(), st = stateNow(), n = draft?.pts.length ?? 0, z = map ? map.getZoom() : 0;
  if (backWords) return backWords;
  if (draft) {
    if (boxNow) return SAY.rectBox;
    if (z < DRAW_FROM) return says(SAY.drawFar, h);
    if (draft.tool === 'rect') return says(n === 0 ? (keep.pin ? SAY.rectHere : SAY.rect0) : n === 1 ? SAY.rect1 : SAY.rect2, h, n === 2 ? SAY.btn.setFar : SAY.btn.setCorner);
    if (st === 'closing') return says(SAY.polyClose, h, SAY.btn.closeOutline);
    return says(n === 0 ? SAY.poly0 : n < 3 ? SAY.poly1 : SAY.poly3, h, SAY.btn.addCorner);
  }
  const ph = h === 'cross' ? (kbd ? 'key' : hand) : h;
  if (selected) return outlineTiny() ? SAY.no.zoomCorners : says(SAY.edit, h, SAY.btn.moveCorner);
  if (!keep.pin) return says(z < PIN_FROM ? SAY.pinFar : SAY.pinFirst, ph);
  return says(keep.ring ? SAY.pinRing : SAY.pin, ph);
}
const outlineTiny = () => { if (!keep.ring || !map) return false; const b = L.latLngBounds(keep.ring), a = cp(b.getNorthWest()), c = cp(b.getSouthEast()); return Math.max(c.x - a.x, c.y - a.y) < MID_FROM; };
function setBtn(act, show, { label = null, off = '', pressed = null } = {}) {
  const b = ui.btn(act); if (!b) return;
  if (b.hidden === show) b.hidden = !show;
  if (label !== null && b.textContent !== label) b.textContent = label;
  if (off) { b.setAttribute('aria-disabled', 'true'); b.dataset.why = off; b.setAttribute('aria-describedby', 'mapxWhy'); }
  else if (b.hasAttribute('aria-disabled')) { b.removeAttribute('aria-disabled'); delete b.dataset.why; b.removeAttribute('aria-describedby'); }
  if (pressed !== null) b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
}
function drawBar() {
  const st = stateNow(), n = draft?.pts.length ?? 0, B = SAY.btn, keys = kbd, pointerHand = !kbd, onOutline = selected && !!keep.ring, wide = wideMap();
  const words = refusal || lineWords();
  if (ui.hint.textContent !== words) ui.hint.textContent = words;
  ui.box.classList.toggle('refused', !!refusal);
  const stepOn = keys || preciseNow();
  let stepLabel = null;
  if (!draft && !onOutline) stepLabel = keys && !keep.ring ? (keep.pin ? B.movePin : B.putPin) : null;
  else if (draft) stepLabel = stepOn ? (draft.tool === 'rect' ? (n === 2 ? B.setFar : B.setCorner) : st === 'closing' ? B.closeOutline : B.addCorner) : null;
  else if (onOutline) stepLabel = preciseNow() && chosen >= 0 ? B.moveCorner : null;
  setBtn('precise', pointerHand && (!!draft || onOutline), { pressed: precise });
  setBtn('step', !!stepLabel, { label: stepLabel ?? '' });
  setBtn('undo', (!!draft && n > 0) || onOutline);
  setBtn('remove', onOutline && chosen >= 0, { off: keep.ring && keep.ring.length <= 3 ? SAY.no.fewCorners : '' });
  setBtn('cancel', !!draft && n > 0);
  setBtn('again', onOutline && !wide);
  setBtn('done', onOutline && wide);
  const closeBad = draft?.tool === 'poly' && n >= 3 && edgeCrosses(draft.pts.map(ll), ll(draft.pts[n - 1]), ll(draft.pts[0]));
  setBtn('finish', draft?.tool === 'poly' && n > 0, { off: n < 3 ? SAY.no.finishNeeds : closeBad ? SAY.no.closeCross : '' });
  setBtn('use', onOutline && !wide && !keep.used, { label: B.use });
  // the result bar: the area large, the second unit and the corners, and whether the report uses it
  const showResult = onOutline && !wide;
  if (ui.result.hidden === showResult) ui.result.hidden = !showResult;
  if (showResult) {
    const p = pairOf(keep.ring), second = SAY.figureLine(p.second, keep.ring.length), chip = keep.used ? SAY.usedChip : SAY.selected;
    if (ui.big.textContent !== p.first) ui.big.textContent = p.first;
    if (ui.second.textContent !== second) ui.second.textContent = second;
    if (ui.usedChip.textContent !== chip) ui.usedChip.textContent = chip;
    ui.usedChip.classList.toggle('on', keep.used);
  }
  ui.hintBox.classList.toggle('result', showResult);
}
// A refused step: everything stays as it was; the words show for 4 s in the bar and are said once, and an × marks the spot.
function refuse(words, at = null) {
  refusal = words; clearTimeout(refusalTimer);
  refusalTimer = setTimeout(() => { refusal = null; drawBar(); }, REFUSE_MS);
  if (at) kit.refusedAt(at);
  say(words); drawBar();
}
// Only what follows the pointer: the state, the cursor, the bar's words.
function syncLight() {
  const st = stateNow();
  if (ui.box.dataset.state !== st) ui.box.dataset.state = st;
  ui.box.classList.toggle('crossing', crossingNow);
  drawBar(); syncCross();
}
let syncing = false;
function sync({ fade = false } = {}) {
  if (!ui || !map) return;
  if (syncing) { queueMicrotask(() => sync({ fade })); return; }   // never inside itself (a focused handle taken away calls back here)
  syncing = true;
  try { syncNow(fade); } finally { syncing = false; }
}
function syncNow(fade) {
  drawDraft();
  const st = stateNow();
  ui.box.dataset.tool = keep.tool; ui.box.dataset.state = st; ui.box.dataset.hand = wordsHand();
  ui.box.classList.toggle('crossing', crossingNow);
  ui.box.classList.toggle('drawview', drawView);
  ui.box.classList.toggle('no-pin', !keep.pin);
  if (keep.tool !== 'pin') lastTool = keep.tool;   // with the field drawn no tool is armed: the switch keeps showing the one that drew it, so its blue thumb always has its white words
  const shownTool = keep.tool === 'pin' ? (keep.ring ? lastTool : 'rect') : keep.tool;
  ui.box.classList.toggle('has-ring', !!keep.ring);
  for (const b of ui.tools.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.tool === shownTool ? 'true' : 'false');
  slideTools();
  if (map.doubleClickZoom) DRAWING.includes(keep.tool) ? map.doubleClickZoom.disable() : map.doubleClickZoom.enable();
  const handlesOn = selected && keep.ring && !outlineTiny() && !draft;
  if (handlesOn) kit.handles(keep.ring, { chosen, on: handleOn, fade, midsFrom: MID_FROM }); else if (kit.hasHandles()) kit.handles(null, { fade });
  drawBar(); syncCross(); measure();
}
let lastTool = 'rect';
function slideTools() {
  const b = ui.tools.querySelector('[aria-pressed=true]'); if (!b) return;
  ui.tools.style.setProperty('--x', `${b.offsetLeft}px`); ui.tools.style.setProperty('--w', `${b.offsetWidth}px`);
}
function act(name) {
  if (name === 'precise') return togglePrecise();
  if (name === 'step') return stepAtCross();
  if (name === 'undo') return undo();
  if (name === 'remove') return removeCorner(chosen);
  if (name === 'cancel') return cancelDrawing();
  if (name === 'again') return again();
  if (name === 'done') { deselect({ words: true }); if (spotOpen() && resultSide) closeSpot(false); return; }
  if (name === 'finish') return closePoly();
  if (name === 'use') return use();
}
function togglePrecise() {
  precise = !precise;
  try { localStorage.setItem(PRECISE_KEY, precise ? '1' : '0'); } catch { /* the choice holds for this visit */ }
  say(precise ? SAY.said.preciseOn : SAY.said.preciseOff);
  sync();
}
// the step at the cross: Space, Enter, or the bar's step button
function stepAtCross() {
  const latlng = crossLatLng(), t = { point: crossPoint(), latlng, type: 'cross', at: performance.now() };
  if (draft) { if (map.getZoom() < DRAW_FROM) { showFar(latlng); zoomInAt(latlng, 2); return; } draft.tool === 'rect' ? rectTap(t) : polyTap(t); return; }
  if (selected) { if (chosen >= 0) moveCornerTo(chosen, latlng); return; }
  if (map.getZoom() < PIN_FROM) { showFar(latlng); zoomInAt(latlng, 3, true); return; }
  if (!keep.ring) movePinTo(latlng);
}

// ---- the result: use it, change it, start again
function use() {
  if (!keep.ring || keep.used) return;
  keep.used = true;
  bus('crophalo:area', { pts: keep.ring, ha: areaHa(keep.ring) }); bus('crophalo:outline', { ring: keep.ring, used: true });
  if (keep.pin) prefetch(keep.pin.lat, keep.pin.lon, keep.ring);
  say(SAY.said.using(pairOf(keep.ring).spoken));
  changedUsed = false; deselect({ quiet: true });
  saveDraft();
  if (spotOpen()) refreshSpot();
  if (drawView) { exitFull(); ui.box.focus({ preventScroll: true, focusVisible: kbd }); }
  sync();
}
function toggleEdit() {
  if (!keep.ring) return;
  if (selected) deselect({ words: true });
  else { if (compact()) enterDrawView(); select({ open: false }); }
  if (spotOpen()) refreshSpot();
}
// Start again: the outline fades out with an Undo (which brings it back, used or not), and the tool that made it is armed.
function again() {
  if (!keep.ring) return;
  const viaKeys = kbd, tool = keep.madeBy || 'poly', wasUsed = keep.used;
  step('again');
  closeSpot(false); resultSide = false;
  selected = false; chosen = -1; kit.handles(null);
  kit.fadeOutline();
  keep.ring = null; keep.used = false;
  if (wasUsed) bus('crophalo:area', null);
  bus('crophalo:outline', { ring: null, used: false });
  draft = { tool, pts: [], times: [], ghost: false }; keep.tool = tool;
  undoToast(SAY.toast.outline);
  if (compact()) enterDrawView();
  dimPin(); saveDraft(); sync();
  (viaKeys ? ui.box : ui.tools.querySelector(`[data-tool=${tool}]`))?.focus({ preventScroll: true, focusVisible: viaKeys });
}
// the outline on the map now ({ ring, used } or null): for the setup's "Your field" step, which mounts the area block (js/areablock.js)
export const outlineNow = () => (keep.ring ? { ring: keep.ring, used: keep.used } : null);
const cardContext = () => ({ box: ui.box, top: () => barsBottom(), dock: () => dockHeight(), say, order, pin: () => keep.pin, ring: () => keep.ring,
  anchor: () => (keep.pin && map ? map.latLngToContainerPoint([keep.pin.lat, keep.pin.lon]) : null),
  avoid: () => { const lg = gibsCtl?.legendRect?.(), box = ui.box.getBoundingClientRect(), legend = lg ? [{ left: lg.left - box.left, top: lg.top - box.top, w: lg.width, h: lg.height }] : []; if (!keep.ring || !map) return legend; const b = L.latLngBounds(keep.ring), n = map.latLngToContainerPoint(b.getNorthWest()), z = map.latLngToContainerPoint(b.getSouthEast()); return [{ left: n.x, top: n.y, w: z.x - n.x, h: z.y - n.y }, ...legend]; },
  areaInfo: () => (keep.ring ? { ha: areaHa(keep.ring), corners: keep.ring.length, used: keep.used, pair: pairOf(keep.ring), editing: selected } : null),
  side: () => resultSide && wideMap(), use, again, edit: toggleEdit, closed: () => { resultSide = false; } });
function openCard(tab, { quiet = false, roll = quiet } = {}) {   // a card the map opens by itself gives the keyboard back to where it was when it closes
  panels?.close(false); if (tab !== 'area') resultSide = false;
  openSpot(cardContext(), tab, quiet && ui.box.contains(document.activeElement) ? document.activeElement : (layers?.pin?.getElement?.() ?? ui.box), { quiet, roll });
}

// ---- the view stack, full screen and the drawing view of a phone
const compact = () => ui.box.offsetWidth < 600 || ui.box.offsetHeight < 420;
function fit() {
  if (keep.ring) return map.fitBounds(L.latLngBounds(keep.ring), { padding: [48, 48], maxZoom: SELF_MAX, animate: !motionQuiet() });
  if (keep.pin) return map.setView([keep.pin.lat, keep.pin.lon], Math.min(Math.max(map.getZoom(), 14), SELF_MAX), { animate: !motionQuiet() });
  toast(SAY.dropFirst); say(SAY.dropFirst);
}
function fullscreen(on) {
  ui.box.classList.toggle('full', on); document.body.classList.toggle('mapx-full', on);
  const b = ui.stack.querySelector('[data-view=full]'), name = on ? SAY.view.exit : SAY.view.full;
  b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', name); b.title = name; b.innerHTML = svg(on ? 'exit' : 'full');
  if (!on) drawView = false;
  if (!motionOff()) { ui.box.classList.remove('fading'); void ui.box.offsetWidth; ui.box.classList.add('fading'); setTimeout(() => ui.box.classList.remove('fading'), 200); }
  setTimeout(() => { map.invalidateSize(); applyStrip(); measure(); sync(); }, 50);
}
// The drawing view: the full-screen map on a phone, opened by Rectangle, Corners, Edit outline or Change field. The phone's Back gesture closes it and keeps the drawing.
// Its history entry carries a mark made for this page only: a reload keeps the entries of the page before it (a phone that dropped the tab, a pull to refresh),
// and an old entry's mark must never pass for the open view's, or Back would land on it and leave the view open.
const DRAW_MARK = `draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
function enterDrawView() {
  if (ui.box.classList.contains('full')) return;
  drawView = true; fullscreen(true); drawView = true;
  try { window.history.pushState({ ...(window.history.state || {}), mapx: DRAW_MARK }, ''); } catch { /* the Back gesture then leaves the page as before */ }
  say(SAY.said.viewOpen);
}
function exitFull() {
  const was = drawView; fullscreen(false);
  if (was && window.history.state?.mapx === DRAW_MARK) { ignorePop = true; window.history.back(); }
}
function onPop(event) {
  if (ignorePop) { ignorePop = false; return; }
  if (ui?.box.classList.contains('full') && event.state?.mapx !== DRAW_MARK) fullscreen(false);
}
function locate(button) {
  if (!navigator.geolocation) { toast(SAY.noLocate); say(SAY.noLocate); return; }
  button.setAttribute('aria-busy', 'true');
  navigator.geolocation.getCurrentPosition(
    at => { button.removeAttribute('aria-busy'); fieldFromOutside(at.coords.latitude, at.coords.longitude, { zoom: 14 }); },
    error => { button.removeAttribute('aria-busy'); const words = error.code === 1 ? SAY.locateOff : SAY.locateFailed; toast(words); say(words); },
    { enableHighAccuracy: true, timeout: LOCATE_MS, maximumAge: 60e3 });
}
function onStack(event) {
  const b = event.target.closest('[data-view]'); if (!b) return;
  ({ in: () => zoomBy(1), out: () => zoomBy(-1), field: fit, here: () => locate(b), full: () => (ui.box.classList.contains('full') ? exitFull() : fullscreen(true)) })[b.dataset.view]();
}
// The later steps on a phone: a strip that only shows the field, with one way back to it.
const STRIP = typeof matchMedia === 'function' ? matchMedia('(max-width: 860px)') : { matches: false };
function applyStrip() {
  if (!ui || !map) return;
  const step = document.querySelector('#setupRoot')?.dataset.step, on = STRIP.matches && !!step && step !== 'field' && !ui.box.classList.contains('full');
  if (ui.box.classList.contains('strip') === on && ui.box.dataset.stripped === String(on)) return;
  ui.box.classList.toggle('strip', on); ui.box.dataset.stripped = String(on);
  for (const h of ['dragging', 'touchZoom', 'scrollWheelZoom', 'doubleClickZoom']) map[h]?.[on ? 'disable' : 'enable']();
  ui.box.tabIndex = on ? -1 : 0;
  if (on && draft && !draft.pts.length) setTool('pin');
  if (!on) sync();
}

// ---- a place from outside (Places, locate, coordinates): the field moves there with one calm fly; an outline it left is removed with an Undo
function fieldFromOutside(lat, lon, { zoom = 13, name, country } = {}) {
  const at = L.latLng(lat, lon), outside = keep.ring && !insideRing(lat, lon, keep.ring), drawing = draft?.pts.length;
  if (outside || drawing || keep.pin) step(outside ? 'moveOut' : 'pin');
  if (drawing) { kit.clearDraft(); draft = null; keep.tool = 'pin'; armIdle(); }
  if (selected) { selected = false; chosen = -1; }
  if (outside) { const wasUsed = keep.used; keep.ring = null; keep.used = false; kit.outline(null); kit.ghost(null); closeSpot(false); if (wasUsed) bus('crophalo:area', null); bus('crophalo:outline', { ring: null, used: false }); }
  else if (draft?.ghost) { kit.ghost(null); kit.outline(keep.ring); }
  if (!keep.ring && draft) { draft = null; keep.tool = 'pin'; armIdle(); }
  keep.pin = { ...(keep.pin || {}), lat: r4(lat), lon: r4(wrapLon(lon)), ...(name !== undefined ? { name } : {}), ...(country !== undefined ? { country } : {}) };
  drawPin({ land: true });
  map.flyTo(at, zoom, { animate: !motionQuiet(), duration: 0.6 });   // one calm fly
  tellPlace();
  if (outside) undoToast(SAY.toast.movedOut); else if (drawing) undoToast(SAY.toast.drawing);
  say(pinWords(keep.pin.lat, keep.pin.lon));
  dimPin(); saveDraft(); sync();
}
function goTo(spot) { panels?.close(true); fieldFromOutside(spot.lat, spot.lon, { zoom: 13, name: spot.name || '', country: spot.country || '' }); }
function showOnMap(kind) {
  if (kind === 'pin' && keep.pin) map.setView([keep.pin.lat, keep.pin.lon], Math.min(Math.max(map.getZoom(), 14), SELF_MAX), { animate: !motionQuiet() });
  else if (kind === 'area' && keep.ring) map.fitBounds(L.latLngBounds(keep.ring), { padding: [48, 48], maxZoom: SELF_MAX, animate: !motionQuiet() });
  else return;
  panels?.close(true);
}
// the wizard's place: a new setup (from the home), or coordinates typed in (movePlace from outside)
function onPlace(event) {
  const place = event.detail;
  if (!map) return;
  if (place?.from === 'outside') { fieldFromOutside(place.lat, place.lon, { zoom: Math.max(map.getZoom(), 13) }); return; }
  // a new setup: nothing of the last field is carried over
  closeSpot(false); past.length = 0; future.length = 0; clearTimeout(pendingTap);
  draft = null; selected = false; chosen = -1; keep.ring = null; keep.used = false; keep.tool = 'pin'; boxNow = null; armIdle();
  kit.clearDraft(); kit.outline(null); kit.ghost(null);
  keep.pin = place ? { lat: place.lat, lon: place.lon, name: place.name || '', country: place.country || '' } : null;
  if (place) { prefetch(place.lat, place.lon); if (place.area?.pts?.length >= 3) { keep.ring = cleanRing(place.area.pts, 5); keep.used = true; kit.outline(keep.ring); } }
  drawPin();
  if (keep.ring) map.fitBounds(L.latLngBounds(keep.ring), { padding: [48, 48], maxZoom: SELF_MAX, animate: false });
  else if (place) { map.setView([place.lat, place.lon], 14, { animate: false }); openDemoOutline(place); }
  else { const v = usView(); map.setView(v.c, v.z, { animate: false }); }
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* nothing kept */ }
  dimPin(); sync();
}

// ---- the drawing kept for a reload, a phone that drops the tab, or the Back gesture (this tab only)
function saveDraft() {
  try {
    const place = keep.pin ? [keep.pin.lat, keep.pin.lon] : null;
    if (draft?.pts.length) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ tool: draft.tool, step: draft.pts.length, pts: draft.pts.map(ll), place }));
    else if (keep.ring && !keep.used) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ tool: keep.madeBy, step: 'done', pts: keep.ring, place }));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch { /* a blocked store costs only the reload */ }
}
function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY));
    if (!d || !DRAWING.includes(d.tool) || !Array.isArray(d.pts) || !d.pts.length || d.pts.length > MAX_CORNERS || !d.pts.every(p => Array.isArray(p) && p.every(Number.isFinite))) return null;
    if (keep.pin && d.place && metres([keep.pin.lat, keep.pin.lon], d.place) > NEAR_KM * 1000) return null;   // another field: not this one's drawing
    return d;
  } catch { return null; }
}
// A demo region that is a field: its outline is drawn and put in use at once, so the report and My farm get its real area, not an estimate. The drawing tools are not involved.
function openDemoOutline(place) {
  loadRegions().then(list => {
    const region = regionAt(list, place), ring = region && regionOutline(region);   // by id, else by nearness: the pin keeps 4 decimals, the data 6
    if (!ring || !map || !keep.pin || keep.pin.lat !== place.lat || keep.pin.lon !== place.lon || keep.ring) return;
    keep.ring = ring; keep.used = false; keep.madeBy = 'poly'; kit.outline(ring);
    map.fitBounds(L.latLngBounds(ring), { padding: [48, 48], maxZoom: SELF_MAX, animate: false });
    use(); drawPin(); dimPin(); sync();
  }, () => {});
}

// ---- the map's own keys
function onKey(event) {
  const t = event.target, k = event.key;
  if (t.closest?.('.spot')) { if (k === 'Escape') escape(event); return; }   // the card's own keys (tabs, grip) stay its own
  if (t.closest?.('.mapx-panelhost') || t.matches?.('input, textarea, select')) return;
  if ((event.ctrlKey || event.metaKey) && (k === 'z' || k === 'Z')) { event.preventDefault(); kbdKey(t); if (event.shiftKey) redo(); else if (!runToastAction()) undo(); return; }
  if (event.ctrlKey && (k === 'y' || k === 'Y')) { event.preventDefault(); redo(); return; }
  if (k === 'Escape') { escape(event); return; }
  if (t.closest?.('#mapxHint') && k.startsWith('Arrow')) { arrowsPan(event); return; }   // on the bar's buttons the arrows move the map too
  if (t !== ui.box) return;
  if (k.startsWith('Arrow')) { arrowsPan(event); kbdOn(); return; }
  if (k === '+' || k === '=') { event.preventDefault(); kbdOn(); zoomBy(1); return; }
  if (k === '-' || k === '_') { event.preventDefault(); kbdOn(); zoomBy(-1); return; }
  if (k === '1' || k === '2') { event.preventDefault(); kbdOn(); setTool(['rect', 'poly'][+k - 1]); return; }
  if (k === ' ' || k === 'Spacebar') { event.preventDefault(); kbdOn(); stepAtCross(); return; }
  if (k === 'Enter') { event.preventDefault(); kbdOn(); if (draft?.tool === 'poly' && draft.pts.length >= 3) closePoly(); else stepAtCross(); return; }
  if (k === 'Backspace' && draft?.pts.length) { event.preventDefault(); undo(); }
}
const kbdKey = t => { if (t === ui.box || t.closest?.('.mapx-hicon, .mapx-pin')) kbdOn(); };
function arrowsPan(event) {
  event.preventDefault();
  const s = event.shiftKey ? PAN_BIG : PAN_STEP, k = event.key;
  map.panBy([k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0, k === 'ArrowUp' ? -s : k === 'ArrowDown' ? s : 0], { animate: false });
}

// ---- motion: the map's own animations follow the level (a zoom jumps under Less and Still)
function applyMotion() {
  if (!map) return;
  map._zoomAnimated = !motionQuiet() && L.Browser.any3d;   // Leaflet reads this at every zoom
  map._fadeAnimated = !motionOff() && L.Browser.any3d;
  map.options.inertia = !motionQuiet();
}

// ---- mounting: once per page
export let mounts = 0;   // how many maps were built since the page opened (one): for the checks
// The spot card opens from the pin (a tap, or Enter on it); this is the same act for a check or another part of the page.
export const openAbout = (tab = 'weather') => { if (!map || !keep.pin) return false; if (spotOpen()) closeSpot(); else openCard(tab); return true; };
function mount(root) {
  mounts++;
  ui = shell(root); layers = {};
  map = L.map(ui.canvas, { zoomControl: false, attributionControl: false, zoomSnap: 1, worldCopyJump: true, keyboard: false, boxZoom: false, zoomAnimation: true, fadeAnimation: true, maxBoundsViscosity: 0, minZoom: 2, maxZoom: 19 });
  kit = drawKit(map);
  applyMotion(); onMotionChange(applyMotion);
  // what the setup already holds (a reload mid-setup): the pin, a used outline, and a drawing kept for this tab
  const s = currentState();
  if (s.loc) keep.pin = { lat: s.loc.lat, lon: s.loc.lon, name: s.name || '', country: s.loc.label || '' };
  if (s.area?.pts?.length >= 3) { keep.ring = s.area.pts.map(p => [...p]); keep.used = true; }
  const kept = loadDraft();
  if (kept && kept.step === 'done' && !keep.ring) { keep.ring = cleanRing(kept.pts, 5); keep.used = false; keep.madeBy = kept.tool; }
  else if (kept && kept.step !== 'done') { draft = { tool: kept.tool, pts: kept.pts.map(LL), times: kept.pts.map(() => 0), ghost: !!keep.ring }; keep.tool = kept.tool; backWords = SAY.said.draftBack; }
  armIdle();   // with no outline yet, the Rectangle is armed when the map opens
  const view = keep.ring || draft?.pts.length > 1 ? L.latLngBounds([...(keep.ring || []), ...(draft?.pts.map(ll) || [])]) : null;
  if (view) map.fitBounds(view, { padding: [48, 48], maxZoom: SELF_MAX, animate: false });
  else if (draft?.pts.length) map.setView(draft.pts[0], LAND_AT, { animate: false });
  else if (keep.pin) map.setView([keep.pin.lat, keep.pin.lon], 14, { animate: false });
  else { const v = usView(); map.setView(v.c, v.z, { animate: false }); }
  busyCtl = initBusy(ui.busy);
  ui.credit.title = 'Tap to show or hide the whole credit'; ui.credit.dataset.open = 'false';   // a convenience for a pointer; the words and links are always in the page, so no ARIA state is claimed
  ui.credit.addEventListener('click', event => { if (event.target.closest('a')) return; const open = ui.credit.dataset.open !== 'true'; ui.credit.dataset.open = String(open); });
  baseCtl = initBase(map, { segment: ui.base, credit: ui.credit, note: ui.baseNote, pic: ui.pic }, { say });
  panels = initPanels({ box: ui.box, right: ui.right, host: ui.panelHost }, { say, swallow: () => { tapSwallow = Date.now(); }, beforeOpen: () => closeSpot(false) });
  panels.add(placesPanel({ goTo }));
  gibsCtl = initLayers({ right: ui.right, legends: ui.legends }, { map: () => map, say, toast, pin: () => keep.pin, groundIsVector: () => baseCtl?.state().ground === 'gl' });
  panels.add(gibsCtl.def); gibsCtl.restore();
  makeScale();
  // the listeners
  ui.tools.addEventListener('click', event => { const b = event.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
  ui.hintBtns.addEventListener('click', event => {
    const b = event.target.closest('[data-act]'); if (!b) return;
    if (b.getAttribute('aria-disabled') === 'true') { refuse(b.dataset.why || ''); ui.why.textContent = b.dataset.why || ''; return; }   // it says why, and keeps its focus
    act(b.dataset.act);
  });
  ui.hintBtns.addEventListener('focusin', event => { const b = event.target.closest('[data-act]'); ui.why.textContent = b?.dataset.why || ''; syncCross(); });
  ui.stack.addEventListener('click', onStack);
  ui.change.addEventListener('click', () => { if (keep.ring) { setTool('rect'); } enterDrawView(); });
  ui.canvas.addEventListener('pointerdown', onDown);
  ui.canvas.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerup', onUp, true); document.addEventListener('pointercancel', onCancel, true);
  // A tap on the map can change what lies under the finger (the result bar grows over it, a card opens): the click a phone sends after the tap
  // must never press a button that was not where the finger went down (it once undid the outline the same tap had just closed).
  let tapOnMap = null;
  document.addEventListener('pointerdown', e => { tapOnMap = ui.canvas.contains(e.target) ? { up: 0 } : null; }, true);
  document.addEventListener('pointerup', () => { if (tapOnMap) tapOnMap.up = performance.now(); }, true);
  document.addEventListener('click', e => {
    const t = tapOnMap; tapOnMap = null;
    if (!t?.up || !e.isTrusted || e.detail === 0 || performance.now() - t.up > 800 || ui.canvas.contains(e.target)) return;   // keys, and clicks on the map itself, go on
    if (e.target.closest?.('button, a, input, select, label, [role=button], [role=tab]')) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  ui.canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hover = null; if (draft) liveRedraw(); } });
  ui.canvas.addEventListener('dblclick', e => { if (hand === 'mouse' && !e.sourceCapabilities?.firesTouchEvents && draft?.tool === 'poly' && draft.pts.length >= 3 && !preciseNow()) { e.preventDefault(); closePoly(); } });   // a mouse's double click adds that corner and finishes; a finger's habitual double tap never closes the field
  ui.box.addEventListener('pointerdown', e => { clearTimeout(pendingTap); if (setHand(e.pointerType) || kbd) { kbdOff(); } }, true);   // any pointer on the map ends keyboard mode; the words follow the hand
  ui.box.addEventListener('keydown', onKey);
  ui.box.addEventListener('focusin', event => { if (event.target === ui.box && ui.box.matches(':focus-visible')) kbdOn(); else syncCross(); });
  ui.box.addEventListener('focusout', () => setTimeout(() => { if (!ui.box.contains(document.activeElement)) kbdOff(); else syncCross(); }));   // a moment later: a handle drawn again hands its focus on first
  map.on('movestart', () => { if (gesture && !glide) gesture.moved = true; });
  map.on('move', () => { if ((draft || (selected && chosen >= 0)) && (kbd || preciseNow())) liveRedraw(); });
  map.on('zoomend', () => { if (draft || selected) sync(); else drawBar(); checkFar(); });
  ui.far?.querySelector('[data-act=zoomhere]')?.addEventListener('click', () => { const at = farAt ?? map.getCenter(); map.setView(at, Math.max(map.getZoom() + 1, needZoom() + 1), { animate: !motionQuiet() }); say(SAY.said.zoomedIn); });
  map.on('moveend', () => { if (selected) sync(); });
  document.addEventListener('crophalo:settings', () => { makeScale(); sync(); if (spotOpen()) refreshSpot(); });
  addEventListener('popstate', onPop);
  STRIP.addEventListener?.('change', applyStrip);
  new MutationObserver(applyStrip).observe(document.querySelector('#setupRoot') || document.body, { attributes: true, attributeFilter: ['data-step'] });
  drawPin(); kit.outline(draft?.ghost ? null : keep.ring); kit.ghost(draft?.ghost ? keep.ring : null);
  const sized = new ResizeObserver(() => { map?.invalidateSize(); measure(); slideTools(); keepInside(); applyStrip(); });
  for (const e of [ui.box, ui.top, ui.right, ui.dock, ui.tools]) sized.observe(e);
  applyStrip(); dimPin(); sync(); measure();
}
// the distance bar (not a CSS scale): one line, in feet and miles when acres come first, else in metres and kilometres
function makeScale() {
  scaleCtl?.remove();
  scaleCtl = L.control['scale']({ position: 'bottomleft', maxWidth: 110, metric: order() !== 'acres', imperial: order() === 'acres' }).addTo(map);
  ui.foot.prepend(scaleCtl.getContainer());   // the scale lives in the dock beside the credit, not inside the oversized canvas
}

// Start watching: the wizard makes #setupMap once, and the map is made in it once. The wizard owns the shell; this owns what is inside.
export function initMapX() {
  document.addEventListener('crophalo:place', onPlace);
  const look = () => { const root = $('#setupMap'); if (root && !root.querySelector('#mapx')) mount(root); };
  const watch = $('#setupRoot') || document.body;
  new MutationObserver(look).observe(watch, { childList: true, subtree: true });
  look();
}
export const mapState = () => ({ pin: keep.pin, ring: keep.ring, mode: keep.tool, tool: keep.tool, state: ui ? stateNow() : 'idle', draft: draft ? draft.pts.map(ll) : null, selected, precise, used: keep.used, mapId: map ? L.stamp(map) : null });
export { selfCrosses };
export const leafletMap = () => map;   // the setup map, for the big animations' flight into the field (null until it is mounted)
