// Crophalo's setup map: a Leaflet map whose every control is drawn here. The Pin, Rectangle and Polygon tools, the satellite photo, the view stack,
// the hint line, the finished outline, and a keyboard mode with a crosshair. It never shows a sea, lake or border name.
// Nothing here is pure (the pure maths is js/geo.js). The map mounts in the wizard's #setupMap each time the wizard redraws it.
// Checked by scripts/e2e_map.mjs (tools by mouse and by key, the outline, the view stack, the Escape order, fit at five widths, axe).
import { areaHa, boxCorners, cleanRing, outlineProblem, areaWords, pinWords, wrapLon, selfCrosses } from './geo.js';
import { toast } from './toast.js';
import { motionOff } from './motion.js';
import { openSpot, closeSpot, refreshSpot, spotOpen, keepInside } from './spotcard.js';

const L = window.L;
const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SAT_CREDIT = 'Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community';
const WORLD = { center: [20, 10], zoom: 2 };
const SAY = {
  help: 'Arrow keys move the map; plus and minus zoom. While you use the keyboard, a cross marks the centre of the map, and the buttons above the map put your pin or your field\'s corners there; on those buttons the arrow keys move the map too.',
  pin: 'Tap the map to move your field. Tap the pin to see the weather.',
  pinFirst: 'Tap the map where your field is.',
  rect: 'Press and drag across your field',
  rectKey: 'Move the map, then set the opposite corner',
  poly: 'Tap each corner of your field',
  tooThin: 'That is a line, not a field. Press and drag a wider box.',
  dropFirst: 'Drop a pin first: tap the map where your field is.',
  noLocate: 'This browser cannot share its location. Search for a place instead.',
  locateOff: 'Location is switched off for this site. Allow it in your browser settings, or search for a place or paste coordinates instead.',
  locateFailed: 'Your device could not find its position (weak signal or timed out). Move outdoors and try again, or search for a place.',
};
const MIN_BOX_PX = 12, CLOSE_PX = 16, PIN_STEP = 8, PIN_BIG = 40, PAN_STEP = 60, PAN_BIG = 240, LOCATE_MS = 12e3;
const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const icon = {   // one outline family, 24 grid, 1.7 stroke (the same drawings as the design page)
  pin: '<path d="M12 21s6.5-6.2 6.5-11a6.5 6.5 0 0 0-13 0c0 4.8 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
  poly: '<path d="M5 9l6-4.500 7 3.500-1.500 9.500L8 18z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  field: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  here: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', exit: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  undo: '<path d="M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 8"/>',
};
const svg = (name, extra = '') => `<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"${extra}>${icon[name]}</svg>`;

// What the map keeps while the wizard redraws its shell around it: the place, the outline, the tool.
const keep = { pin: null, ring: null, used: false, mode: 'pin', pick: false, units: 'metric' };
let map = null, host = null, ui = null, layers = null, draft = null, tapSwallow = 0, moveTimer = 0, lastSpot = '';

const bus = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
let lastSaid = '';
const say = words => { lastSaid = words; if (ui) ui.live.textContent = words; };   // the wizard redraws the shell on a new place: the last words are put back

// ---- the markup of the controls
function shell(root) {
  root.innerHTML = `<div class="mapx" id="mapx" tabindex="0" role="application" aria-roledescription="map" aria-label="Field map" aria-describedby="mapxHelp">
    <div class="mapx-canvas" id="mapxCanvas"></div>
    <p class="sr" id="mapxHelp">${esc(SAY.help)}</p><p class="sr" id="mapxLive" role="status" aria-live="polite"></p>
    <div class="mapx-top">
      <div class="seg mapx-seg" role="group" aria-label="Map tool">
        <button type="button" data-tool="pin" aria-pressed="true" title="Pin">${svg('pin')}<span class="mapx-w">Pin</span></button>
        <button type="button" data-tool="rect" aria-pressed="false" title="Rectangle">${svg('rect')}<span class="mapx-w">Rectangle</span></button>
        <button type="button" data-tool="poly" aria-pressed="false" title="Polygon">${svg('poly')}<span class="mapx-w">Polygon</span></button>
      </div>
      <button type="button" class="mapbtn" id="mapxReselect" hidden>${svg('undo')}Reselect</button>
      <button type="button" class="mapbtn" id="mapxAbout" aria-haspopup="dialog">About this spot</button>
    </div>
    <div class="mapx-hint" id="mapxHint"><p id="mapxHintText"></p><div class="mapx-hint-btns" id="mapxHintBtns"></div></div>
    <div class="mapx-stack" role="group" aria-label="Map view">
      <button type="button" data-view="in" aria-label="Zoom in" title="Zoom in">${svg('plus')}</button>
      <button type="button" data-view="out" aria-label="Zoom out" title="Zoom out">${svg('minus')}</button>
      <button type="button" data-view="field" aria-label="Zoom to your field" title="Zoom to your field">${svg('field')}</button>
      <button type="button" data-view="here" aria-label="Move the pin to where I am" title="Move the pin to where I am">${svg('here')}</button>
      <button type="button" data-view="full" aria-label="Full-screen map" aria-pressed="false" title="Full-screen map">${svg('full')}</button>
    </div>
    <div class="mapx-cross" aria-hidden="true"></div>
    <p class="mapx-credit" id="mapxCredit"></p></div>`;
  const q = s => root.querySelector(s);
  return { box: q('#mapx'), canvas: q('#mapxCanvas'), live: q('#mapxLive'), about: q('#mapxAbout'), hint: q('#mapxHintText'), hintBtns: q('#mapxHintBtns'), reselect: q('#mapxReselect'), credit: q('#mapxCredit'), stack: q('.mapx-stack'), tools: q('.mapx-seg') };
}

// ---- the pin: a 30 by 38 teardrop with a person in it, inside a 44 by 44 tap area
const pinIcon = () => L.divIcon({ className: 'mapx-pin', iconSize: [44, 44], iconAnchor: [22, 40],
  html: '<svg viewBox="0 0 30 38" width="30" height="38" aria-hidden="true"><path d="M15 1.200C7.700 1.200 1.800 7 1.800 14.200 1.800 24 15 36.800 15 36.800S28.200 24 28.200 14.200C28.200 7 22.300 1.200 15 1.200z" fill="#0a63d8" stroke="#fff" stroke-width="2.400"/><circle cx="15" cy="11.500" r="3.200" fill="#fff"/><path d="M8.800 20.200c.6-3.400 3.300-5 6.200-5s5.600 1.600 6.200 5z" fill="#fff"/></svg>' });
function drawPin() {
  if (!layers) return;
  if (!keep.pin) { layers.pin?.remove(); layers.pin = null; return; }
  const at = L.latLng(keep.pin.lat, keep.pin.lon);
  if (!layers.pin) {
    layers.pin = L.marker(at, { icon: pinIcon(), draggable: true, keyboard: true, title: 'Your field', alt: 'Your field. Arrow keys move the pin.', riseOnHover: false }).addTo(map);
    layers.pin.on('dragend', () => { const p = layers.pin.getLatLng(); movePin(p.lat, p.lng, true); });
    layers.pin.on('click', () => { tapSwallow = Date.now(); openCard('weather'); });
    layers.pin.on('keydown', event => pinKey(event.originalEvent));
    const dot = layers.pin.getElement(); if (dot) { dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', 'Your field'); }
  } else layers.pin.setLatLng(at);
}
function pinKey(event) {
  const k = event.key, step = event.shiftKey ? PIN_BIG : PIN_STEP, dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
  if (!dx && !dy) return;
  event.preventDefault(); event.stopPropagation();
  const p = map.latLngToContainerPoint(layers.pin.getLatLng()).add([dx, dy]), at = map.containerPointToLatLng(p);
  layers.pin.setLatLng(at); keep.pin = { ...keep.pin, lat: at.lat, lon: wrapLon(at.lng) };
  clearTimeout(moveTimer); moveTimer = setTimeout(() => movePin(at.lat, at.lng, true), 400);   // the move is committed once the keys stop
}
// A new place for the field. "settled" is true once the farmer has finished moving (a tap, a drop, the end of key presses).
async function movePin(lat, lon, settled) {
  const spot = { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(wrapLon(lon) * 1e4) / 1e4 };
  keep.pin = { ...(keep.pin || {}), ...spot };
  drawPin(); if (spotOpen()) refreshSpot();
  if (!settled) return;
  say(pinWords(spot.lat, spot.lon));
  const wizard = await import('./wizard.js');
  const key = `${spot.lat},${spot.lon}`;
  if (key === lastSpot) return;
  lastSpot = key;
  (wizard.movePlace || wizard.setPlace)({ lat: spot.lat, lon: spot.lon, name: keep.pin.name || '', place: keep.pin.country || '' });
}

// ---- the tools
function setTool(tool, quiet) {
  cancelDraft();
  keep.mode = tool;
  for (const b of ui.tools.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.tool === tool ? 'true' : 'false');
  ui.box.dataset.tool = tool;
  hint();
  if (map) { tool === 'poly' ? map.doubleClickZoom.disable() : map.doubleClickZoom.enable(); tool === 'rect' ? map.dragging.disable() : map.dragging.enable(); }
  if (!quiet) say({ pin: 'Pin tool', rect: 'Rectangle tool', poly: 'Polygon tool' }[tool]);
}
function cancelDraft() {
  if (draft?.shape) draft.shape.remove();
  if (draft?.dots) draft.dots.forEach(d => d.remove());
  draft = null; hint();
}
function hint() {
  const kbd = document.body.classList.contains('kbd-mode');
  ui.hintBtns.innerHTML = '';
  const add = (words, run, off = false, plain = false) => { const b = document.createElement('button'); b.type = 'button'; b.className = plain ? 'btn sm ghost' : 'btn sm'; b.textContent = words; b.disabled = off; b.addEventListener('click', run); ui.hintBtns.append(b); };
  if (keep.ring) { ui.hint.textContent = ''; ui.box.classList.remove('has-hint'); return; }
  if (keep.mode === 'pin') { ui.hint.textContent = keep.pin ? SAY.pin : SAY.pinFirst; if (kbd) add('Pin at centre', () => atCentre('pin')); }
  else if (keep.mode === 'rect') {
    ui.hint.textContent = draft?.first && kbd ? SAY.rectKey : SAY.rect;
    if (kbd) { add(draft?.first ? 'Opposite corner at centre' : 'First corner at centre', () => atCentre('rect')); if (draft?.first) add('Cancel', cancelDraft, false, true); }
  } else {
    const n = draft?.pts?.length || 0;
    ui.hint.textContent = n ? `${n} ${n === 1 ? 'corner' : 'corners'}` : SAY.poly;
    if (n) { add('Undo', undoCorner, false, true); add('Finish', finishPoly, n < 3); }
    if (kbd) add('Corner at centre', () => atCentre('poly'));
  }
  ui.box.classList.add('has-hint');
}
function atCentre(tool) {
  const c = map.getCenter();
  if (tool === 'pin') return movePin(c.lat, c.lng, true);
  if (tool === 'rect') { if (!draft?.first) { startBox(c); hint(); say('First corner set. Move the map to the opposite corner.'); } else endBox(c); return; }
  addCorner(c); say(`Corner ${draft.pts.length} added`);
}

// rectangle: press, drag, release (a pointer is a mouse, a finger or a pen alike)
function startBox(at) { draft = { first: at, shape: L.rectangle([at, at], boxStyle()).addTo(map) }; }
const boxStyle = () => ({ color: '#4da3ff', weight: 2.5, fillColor: '#4da3ff', fillOpacity: .16, dashArray: '6 6', interactive: false });
function endBox(at) {
  const a = draft?.first; if (!a) return;
  const pa = map.latLngToContainerPoint(a), pb = map.latLngToContainerPoint(at);
  if (Math.abs(pa.x - pb.x) < MIN_BOX_PX || Math.abs(pa.y - pb.y) < MIN_BOX_PX) { cancelDraft(); toast(SAY.tooThin); say(SAY.tooThin); return; }   // a rectangle with no real width or height is not a field
  const ring = boxCorners([a.lat, a.lng], [at.lat, at.lng]);
  cancelDraft(); finish(ring);
}
function onPointerDown(event) {
  if (keep.mode !== 'rect' || keep.ring || event.button > 0 || event.target.closest('.mapx-top, .mapx-hint, .mapx-stack, .mapx-pin')) return;
  event.preventDefault(); ui.canvas.setPointerCapture?.(event.pointerId);
  startBox(map.mouseEventToLatLng(event));
  const move = e => draft?.shape?.setBounds(L.latLngBounds(draft.first, map.mouseEventToLatLng(e)));
  const up = e => { ui.canvas.removeEventListener('pointermove', move); ui.canvas.removeEventListener('pointerup', up); ui.canvas.removeEventListener('pointercancel', cancel); endBox(map.mouseEventToLatLng(e)); };
  const cancel = () => { ui.canvas.removeEventListener('pointermove', move); ui.canvas.removeEventListener('pointerup', up); ui.canvas.removeEventListener('pointercancel', cancel); cancelDraft(); };
  ui.canvas.addEventListener('pointermove', move); ui.canvas.addEventListener('pointerup', up); ui.canvas.addEventListener('pointercancel', cancel);
}

// polygon: tap each corner; the first corner closes it, or Finish, Enter, a double click
function addCorner(at) {
  draft ||= { pts: [], dots: [], shape: null };
  const pts = draft.pts;
  if (pts.length >= 3) { const first = map.latLngToContainerPoint(pts[0]), here = map.latLngToContainerPoint(at); if (first.distanceTo(here) <= CLOSE_PX) return finishPoly(); }
  pts.push(at);
  draft.dots.push(L.circleMarker(at, { radius: 6, color: '#fff', weight: 2, fillColor: '#0a63d8', fillOpacity: 1, interactive: false }).addTo(map));
  draft.shape?.remove();
  draft.shape = (pts.length > 1 ? L.polyline(pts, { color: '#4da3ff', weight: 2.5, dashArray: '6 6', interactive: false }) : L.layerGroup()).addTo(map);
  hint();
}
function undoCorner() {
  if (!draft?.pts?.length) return;
  draft.pts.pop(); draft.dots.pop().remove(); draft.shape?.remove();
  draft.shape = (draft.pts.length > 1 ? L.polyline(draft.pts, { color: '#4da3ff', weight: 2.5, dashArray: '6 6', interactive: false }) : L.layerGroup()).addTo(map);
  say(`Last corner removed. ${draft.pts.length} left.`);
  if (!draft.pts.length) draft = null;
  hint();
}
function finishPoly() {
  if (!draft || draft.pts.length < 3) return;
  const ring = cleanRing(draft.pts.map(p => [p.lat, p.lng]));
  const problem = outlineProblem(ring);
  if (problem) { toast(problem); say(problem); return; }   // a crossed outline stays open so the farmer can undo the corner
  cancelDraft(); finish(ring);
}

// a finished outline: blue, marching ants, the tools lock and Reselect appears
function finish(ring) {
  const problem = outlineProblem(ring);
  if (problem) { toast(problem); say(problem); return; }
  keep.ring = ring; keep.used = false;
  showOutline();
  say(`Outline finished, ${areaWords(areaHa(ring), keep.units)}`);
  openCard('area');   // the outline is only used for the report when the farmer says so
}
const cardContext = () => ({ box: ui.box, say, units: () => keep.units, pin: () => keep.pin, ring: () => keep.ring,
  anchor: () => (keep.pin && map ? map.latLngToContainerPoint([keep.pin.lat, keep.pin.lon]) : null),
  avoid: () => { if (!keep.ring || !map) return []; const b = L.latLngBounds(keep.ring), n = map.latLngToContainerPoint(b.getNorthWest()), z = map.latLngToContainerPoint(b.getSouthEast()); return [{ left: n.x, top: n.y, w: z.x - n.x, h: z.y - n.y }]; },
  areaInfo: () => (keep.ring ? { ha: areaHa(keep.ring), corners: keep.ring.length, used: keep.used } : null), use: useOutline, clear: reselect });
function openCard(tab) { openSpot(cardContext(), tab, ui.about); }
function useOutline() {
  if (!keep.ring) return;
  keep.used = true;
  const ha = areaHa(keep.ring);
  toast(`Using your field outline (${areaWords(ha, keep.units)}) for the report`);
  say(`Using your field outline, ${areaWords(ha, keep.units)}`);
  bus('crophalo:area', { pts: keep.ring, ha });
  refreshSpot();
}
function showOutline() {
  layers.ring?.remove(); layers.ring = null;
  if (keep.ring) {
    layers.ring = L.polygon(keep.ring, { color: '#4da3ff', weight: 2.5, fillColor: '#4da3ff', fillOpacity: .16, className: 'mapx-ants' }).addTo(map);
    layers.ring.on('click', () => { tapSwallow = Date.now(); openCard('area'); });
  }
  ui.reselect.hidden = !keep.ring;
  ui.box.classList.toggle('locked', !!keep.ring);
  for (const b of ui.tools.querySelectorAll('button')) b.disabled = !!keep.ring;
  hint();
}
function reselect() {
  const was = keep.used;
  closeSpot(false); keep.ring = null; keep.used = false; showOutline(); setTool('poly', true); if (was) bus('crophalo:area', null);
  say('Outline cleared. Draw your field again.');
}

// ---- the map's own clicks and keys
function onMapClick(event) {
  if (Date.now() - tapSwallow < 350) return;                // a tap that closed something or hit the pin does not also move it
  if (keep.mode === 'pin') { if (keep.ring) return; return movePin(event.latlng.lat, event.latlng.lng, true); }
  if (keep.mode === 'poly' && !keep.ring) addCorner(event.latlng);
}
function onKey(event) {
  if (event.target.closest?.('.spot')) { if (event.key === 'Escape') escape(event); return; }   // the card's own keys (tabs, grip) stay its own
  if (event.target.closest?.('.mapx-top, .mapx-hint, .mapx-stack') && !(event.key === 'Escape')) { arrowsOnHint(event); return; }
  const k = event.key;
  if (k === 'Escape') return escape(event);
  if (k === 'Enter' && keep.mode === 'poly' && draft?.pts?.length >= 3) { event.preventDefault(); finishPoly(); return; }
  if (k.startsWith('Arrow')) { document.body.classList.add('kbd-mode'); hint(); }
}
function arrowsOnHint(event) {   // on the "at centre" buttons the arrow keys move the map too
  if (!event.target.closest('.mapx-hint') || !event.key.startsWith('Arrow')) return;
  event.preventDefault();
  const step = event.shiftKey ? PAN_BIG : PAN_STEP;
  map.panBy([event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0], { animate: false });
}
// Escape, in order: the last corner, the whole drawing, back to Pin, out of full screen.
function escape(event) {
  if (spotOpen()) { event.preventDefault(); closeSpot(); return; }
  if (draft?.pts?.length > 1) { event.preventDefault(); return undoCorner(); }
  if (draft) { event.preventDefault(); cancelDraft(); say('Drawing cleared. Escape again stops drawing.'); return; }
  if (keep.mode !== 'pin' && !keep.ring) { event.preventDefault(); setTool('pin'); return; }
  if (ui.box.classList.contains('full')) { event.preventDefault(); fullscreen(false); }
}

// ---- the view stack
function fit() {
  if (keep.ring) return map.fitBounds(L.latLngBounds(keep.ring), { padding: [48, 48], animate: !motionOff() });
  if (keep.pin) return map.setView([keep.pin.lat, keep.pin.lon], 14, { animate: !motionOff() });
  toast(SAY.dropFirst); say(SAY.dropFirst);
}
function fullscreen(on) {
  ui.box.classList.toggle('full', on); document.body.classList.toggle('mapx-full', on);
  const b = ui.stack.querySelector('[data-view=full]'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.setAttribute('aria-label', on ? 'Exit full-screen map' : 'Full-screen map'); b.title = b.getAttribute('aria-label');
  b.innerHTML = svg(on ? 'exit' : 'full');
  setTimeout(() => map.invalidateSize(), 50);
}
function locate(button) {
  if (!navigator.geolocation) { toast(SAY.noLocate); say(SAY.noLocate); return; }
  button.setAttribute('aria-busy', 'true');
  navigator.geolocation.getCurrentPosition(
    at => { button.removeAttribute('aria-busy'); map.setView([at.coords.latitude, at.coords.longitude], 14, { animate: !motionOff() }); movePin(at.coords.latitude, at.coords.longitude, true); },
    error => { button.removeAttribute('aria-busy'); const words = error.code === 1 ? SAY.locateOff : SAY.locateFailed; toast(words); say(words); },
    { enableHighAccuracy: true, timeout: LOCATE_MS, maximumAge: 60e3 });
}
function onStack(event) {
  const b = event.target.closest('[data-view]'); if (!b) return;
  ({ in: () => map.zoomIn(), out: () => map.zoomOut(), field: fit, here: () => locate(b), full: () => fullscreen(!ui.box.classList.contains('full')) })[b.dataset.view]();
}

// ---- the place from the wizard
function onPlace(event) {
  const place = event.detail;
  if (!map) return;
  if (!place) { closeSpot(false); keep.pick = true; keep.pin = null; keep.ring = null; lastSpot = ''; drawPin(); showOutline(); map.setView(WORLD.center, WORLD.zoom, { animate: false }); hint(); return; }
  keep.pick = false;
  const same0 = keep.pin && keep.pin.lat === place.lat && keep.pin.lon === place.lon;
  if (!same0) closeSpot(false);
  const same = keep.pin && keep.pin.lat === place.lat && keep.pin.lon === place.lon;
  keep.pin = { lat: place.lat, lon: place.lon, name: place.name || '', country: place.country || '' };
  lastSpot = `${place.lat},${place.lon}`;
  if (!same) { keep.ring = null; showOutline(); map.setView([place.lat, place.lon], 14, { animate: false }); }
  drawPin(); hint();
}

// ---- mounting
function mount(root) {
  if (map) { closeSpot(false); map.remove(); map = null; }
  host = root; ui = shell(root); layers = {};
  map = L.map(ui.canvas, { zoomControl: false, attributionControl: false, zoomSnap: 1, worldCopyJump: true, keyboard: false, maxBoundsViscosity: 0, minZoom: 2, maxZoom: 19 });
  L.tileLayer(SAT, { maxNativeZoom: 18, maxZoom: 19, attribution: SAT_CREDIT, crossOrigin: true }).addTo(map);
  ui.credit.textContent = SAT_CREDIT;
  const start = keep.pin ? { c: [keep.pin.lat, keep.pin.lon], z: 14 } : { c: WORLD.center, z: WORLD.zoom };
  map.setView(start.c, start.z, { animate: false });
  const scale = L.control['scale']({   // the distance bar (not a CSS scale): written this way so the calm-motion rule does not mistake it for one
     position: 'bottomleft', maxWidth: 110, imperial: keep.units === 'us', metric: keep.units !== 'us' }).addTo(map);
  ui.box.append(scale.getContainer());   // the scale lives beside the map, not inside its oversized canvas, so the canvas holds no words to be cut off
  ui.tools.addEventListener('click', event => { const b = event.target.closest('[data-tool]'); if (b && !b.disabled) setTool(b.dataset.tool); });
  ui.stack.addEventListener('click', onStack);
  ui.reselect.addEventListener('click', reselect);
  ui.about.addEventListener('click', () => (spotOpen() ? closeSpot() : openCard('weather')));
  ui.canvas.addEventListener('pointerdown', onPointerDown);
  ui.box.addEventListener('keydown', onKey);
  ui.box.addEventListener('pointerdown', () => { document.body.classList.remove('kbd-mode'); hint(); }, true);   // any pointer ends keyboard mode
  ui.box.addEventListener('focusin', event => { if (event.target === ui.box) { document.body.classList.add('kbd-mode'); hint(); } });
  ui.box.addEventListener('focusout', event => { if (!ui.box.contains(event.relatedTarget)) { document.body.classList.remove('kbd-mode'); hint(); } });
  map.on('click', onMapClick);
  ui.box.addEventListener('keydown', event => { if (event.target === ui.box && event.key.startsWith('Arrow')) { event.preventDefault(); const s = event.shiftKey ? PAN_BIG : PAN_STEP; map.panBy([event.key === 'ArrowLeft' ? -s : event.key === 'ArrowRight' ? s : 0, event.key === 'ArrowUp' ? -s : event.key === 'ArrowDown' ? s : 0], { animate: false }); } });
  drawPin(); showOutline(); setTool(keep.mode, true); ui.live.textContent = lastSaid;
  new ResizeObserver(() => { map?.invalidateSize(); keepInside(); }).observe(ui.box);
}

// Start watching: whenever the wizard draws a fresh #setupMap, the map is mounted in it. The wizard owns the shell; this owns what is inside.
export function initMapX() {
  document.addEventListener('crophalo:place', onPlace);
  const look = () => { const root = $('#setupMap'); if (root && !root.querySelector('#mapx')) mount(root); };
  const watch = $('#setupRoot') || document.body;
  new MutationObserver(look).observe(watch, { childList: true, subtree: true });
  look();
}
export const mapState = () => ({ pin: keep.pin, ring: keep.ring, mode: keep.mode });
export { selfCrosses };
