// My farm: the board on the real map (Leaflet), one slim top row with the date and one finding, one toolbar, and the Compare plans drawer.
// Loaded the first time "My farm" opens. Everything the farmer sees comes from the farm's own record (js/simulate.js) and, for what covers the ground, from the crop engine's groundOn;
// until that answers, the screen says "not read yet". Works without signing in. Checked by scripts/e2e_farm.mjs (the browser) and scripts/test_sim.mjs (the logic).
import { esc } from './words.js';
import * as S from './simulate.js';
import { areaWords } from './geo.js';
import * as crops from './crops.js';
import * as FE from './fieldedit.js';
import { renderFields } from './fieldstable.js';
import { startFarm } from './farmstart.js';
import { renderFarms, renderSettings } from './farmlist.js';
import { loadObserved, observedFor, forgetObserved } from './farmobserved.js';
import { fitHeight } from './data.js';
import { dataFetch, readingsFor, whenSeries, chipsFrom, chipRowHTML, renderChipSheet, setDataEnv, setEngineClient, forgetReadings } from './farmchips.js';
import { cropsFor } from './farmhistory.js';
export { setDataEnv, setEngineClient, forgetReadings, forgetObserved };
import { renderDrawer, resetDrawer, drawerState, startPlant, ADDED_WORDS } from './fielddrawer.js';
export { ADDED_WORDS };

const $ = (sel, node = document) => node.querySelector(sel);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayWords = iso => { const [y, m, d] = String(iso).split('-').map(Number); return y ? `${d} ${MON[m - 1]} ${y}` : ''; };
export const addDays = (iso, n) => { const t = new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5); return t.toISOString().slice(0, 10); };
const GROUND_WORDS = { crop: 'a growing crop', cover: 'a cover crop', residue: 'crop residue', bare: 'bare soil' };
const STATE_FILL = { residue: '#cdb88a', bare: '#a47148', cover: '#9ccc65' }, UNREAD_FILL = '#dfe6d0', NAVY = '#0b2545', GOLD = '#ffc233';
const KINDS = { current: 'Current plan', proposed: 'Proposed plan' };

// ---- state: kept for the whole visit, so the field, the plan and the date survive switching between Map and 3D and back
const ui = { opener: '', history: false, chip: '', mode: '', farmId: '', fieldId: '', planKind: 'proposed', date: '', view: 'map', look: 'board', panel: '' };
let reminders = null, forecast = null, handle3d = null, store = S.emptyStore(), root = null, map = null, layer = null, tiles = null, groundFn = null, cropsMod = crops, opener = null, saveTimer = 0, builtFor = null, view3dFn = null, undo = S.makeUndo(), toastTimer = 0;

// ---- storage
const read = () => S.loadStore(localStorage);
function write(now = Date.now()) {
  clearTimeout(saveTimer); saveTimer = 0;
  const res = S.saveStore(localStorage, store);
  if (!res.ok) say(res.reason);
  return res;
}
const later = () => { clearTimeout(saveTimer); saveTimer = setTimeout(write, 300); };
addEventListener('pagehide', () => { if (saveTimer) write(); });
const farm = () => S.getFarm(store, ui.farmId) || S.getFarm(store);
const field = () => S.getField(farm(), ui.fieldId) || farm()?.fields[0] || null;
const cropName = id => cropsMod?.cropName?.(id, true) || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');   // the short name: "Corn", not "Corn (maize)"
const cropInfo = id => { const c = cropsMod?.entryOf?.(id); return c ? { group: c.group || (c.garden ? 'tree' : 'other'), days: c.days || 365, sow: c.sow || 4, kind: c.garden ? 'tree' : c.type === 'cover' ? 'cover' : 'crop' } : null; };

// ---- the seams, each one function: setGround(groundOn) from the crop engine, setView3d(view3d) from the 3D farm (the app loads it lazily and hands it in), addFromReport() from a report
let keyFn = null, groundSet = false;
export function setGround(fn) { groundSet = true; groundFn = typeof fn === 'function' ? fn : null; if (root) render(); }
export function setKeyDates(fn) { keyFn = typeof fn === 'function' ? fn : null; if (root) render(); }
// The engine is found by its own name: its groundOn and keyDates are used unless a caller has handed in others.
function loadEngine() { import('./engine.js').then(m => { if (!groundSet && !groundFn) groundFn = m.groundOn; if (!keyFn) keyFn = m.keyDates; if (root) render(); }).catch(() => { /* the plain days and "not read yet" */ }); }
export function setReminders(api) { reminders = api && typeof api.forField === 'function' ? api : null; if (root) render(); }   // { forField(farmId, fieldId) -> [{ id, title, when, done }], add({ title, when, kind, farmId, fieldId }) -> { ok, refused? } } from the reminders screen
export function setForecast(fn) { forecast = typeof fn === 'function' ? fn : null; if (root) render(); }   // fn(field) -> { alerts[{ id, text, remind }], checkedAt } or 'none'
export const farmHas = place => { const s = read(), k = S.fieldKey([+place?.lat, +place?.lon]); return s.farms.some(f => f.fields.some(x => x.key === k)); };   // so a report's button can say "Back to my farm"
export function setOpener(fn) { opener = typeof fn === 'function' ? fn : null; }
export function setView3d(fn) { view3dFn = typeof fn === 'function' ? fn : null; }
// What covers the ground on a day under a plan, checked: only a state the engine really answered, else null ("not read yet").
export function groundOf(plan, date) {
  if (!groundFn || !plan || !date) return null;
  try {
    const g = groundFn(plan, date);
    if (g && g.state === null && ['Planned', 'Observed'].includes(g.label)) return { state: null, crop: null, stage: null, label: g.label, note: typeof g.note === 'string' ? g.note.slice(0, 240) : '' };   // a day outside the plan's years: the engine's own sentence
    if (!g || !Object.hasOwn(GROUND_WORDS, g.state) || !['Planned', 'Observed'].includes(g.label)) return null;
    return { state: g.state, crop: typeof g.crop === 'string' ? g.crop : null, stage: Number.isFinite(g.stage) ? g.stage : null, label: g.label, note: typeof g.note === 'string' ? g.note.slice(0, 240) : '' };
  } catch { return null; }
}

// "Add to my farm" from a report: the same field every time, the current plan kept, the proposal separate; the board then opens with that field chosen.
export function addFromReport(payload) {
  store = read();
  const res = S.applyReport(store, payload, { now: Date.now() });
  if (res.refused) return { refused: res.refused };
  store = res.store; write();
  Object.assign(ui, { farmId: res.farmId, fieldId: res.fieldId, planKind: 'proposed', view: 'map', panel: '', date: payload.date && S.isDay(payload.date) ? payload.date : '' });
  const f = S.getField(S.getFarm(store, res.farmId), res.fieldId), dates = keyDates(f);
  if (!dates.some(d => d.date === ui.date)) ui.date = dates[0]?.date || '';   // the day the report arrives is rarely a day of the plan: start on the first of its dates
  loadEngine();
  if (root) render();
  if (opener) opener(); else document.getElementById('navFarm')?.click();
  return { farmId: res.farmId, fieldId: res.fieldId };
}

// ---- the three dates a judge steps through: the harvest before, the fall the next crop is sown, the spring after
export const keyDates = f => S.planDates(f, { keyFn, cropName, addDays });
const dateIndex = f => keyDates(f).findIndex(d => d.date === ui.date);   // -1 when the date is a month of the slider, not one of the plan's days

// ---- words on screen
function say(text) { const n = $('#fwSay'); if (n) { n.textContent = ''; setTimeout(() => { n.textContent = text; }, 30); } }
function toast(text, onUndo) {
  const n = $('#fwToast'); if (!n) return;
  n.innerHTML = `<span>${esc(text)}</span>${onUndo ? '<button type="button" class="btn sm" id="fwUndo">Undo</button>' : ''}`; n.classList.add('show');
  if (onUndo) $('#fwUndo').onclick = () => { onUndo(); n.classList.remove('show'); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => n.classList.remove('show'), 8000); say(text);
}
function finding(f) {
  if (!f) return farm() ? 'No field on this farm yet. Choose Edit field, then Add a field.' : 'No farm yet. Choose Add my farm, or open a report and choose Add to my farm.';
  const r = f.report;
  if (!r?.current && !r?.proposed) return `${f.name} has no plan from a report yet. Open its report and choose Add to my farm.`;
  const d = dayWords(ui.date), cur = groundOf(r.current, ui.date), pro = groundOf(r.proposed, ui.date);
  if (!r.proposed || !r.current) return `Ground cover on ${d}: compare plans needs both a current and a proposed plan.`;
  if (!cur || !pro) return `What covers the ground on ${d}: not read yet. Compare plans shows both plans on this day.`;
  if (cur.state === null || pro.state === null) return `On ${d}: ${(cur.state === null ? cur : pro).note || 'outside the years of this plan.'}`;
  if (cur.state === pro.state) return `On ${d} both plans have ${GROUND_WORDS[cur.state]} on the ground.`;
  return `On ${d} the current plan has ${GROUND_WORDS[cur.state]} on the ground and the proposed plan has ${GROUND_WORDS[pro.state]}.`;
}
const chipFor = f => { const g = groundOf(f?.report?.[ui.planKind], ui.date); return g ? (g.state === null ? 'outside the plan' : g.label) : 'not read yet'; };

// ---- the page
function build(node) {
  node.innerHTML = `<div class="fw" id="fw">
  <header class="fw-hud" id="fwHud">
    <h1 class="sr" id="fwTitle" tabindex="-1">My farm</h1>
    <div class="fw-row">
      <button type="button" class="btn lg fw-farmchip" id="fwFarmBtn" aria-haspopup="dialog" aria-controls="fwPanel" aria-expanded="false" hidden></button>
      <div class="fw-pick"><label class="sr" for="fwField">Field</label><select id="fwField" class="fw-select"></select></div>
      <p class="fw-date" id="fwDate"><time id="fwTime"></time> <b id="fwLabel" class="fw-label"></b> <b id="fwObs" class="fw-label fw-obs" role="status" hidden></b></p>
      <button type="button" class="btn primary lg fw-compare" id="fwCompare" aria-controls="fwPanel" aria-expanded="false">Compare plans</button>
    </div>
    <p class="fw-finding" id="fwFinding"></p>
    <div class="fw-chiprow" id="fwChips" role="group" aria-label="This field at a glance" hidden></div>
  </header>
  <div class="fw-bar" id="fwBar" role="toolbar" aria-label="Board tools">
    <div class="fw-seg" role="group" aria-label="View">
      <button type="button" class="fw-segb" id="fwMapBtn" aria-pressed="true">Map</button><button type="button" class="fw-segb" id="fwThreeBtn" aria-pressed="false">3D</button>
    </div>
    <div class="fw-seg" role="group" aria-label="Plan shown on the map and in 3D"><button type="button" class="fw-segb" id="fwCurBtn" data-kind="current" aria-pressed="false">Current plan</button><button type="button" class="fw-segb" id="fwPropBtn" data-kind="proposed" aria-pressed="true">Proposed plan</button></div>
    <div class="fw-menuwrap"><button type="button" class="btn lg fw-tool" id="fwStyleBtn" aria-haspopup="true" aria-expanded="false" aria-controls="fwStyleMenu">Map style</button>
      <div class="fw-menu" id="fwStyleMenu" role="menu" hidden><button type="button" role="menuitemradio" data-look="board">Board</button><button type="button" role="menuitemradio" data-look="photo">Photo</button></div></div>
    <button type="button" class="btn lg fw-tool" id="fwDetailsBtn" aria-controls="fwPanel" aria-expanded="false">Field details</button>
    <button type="button" class="btn lg fw-tool" id="fwFieldsBtn" aria-controls="fwPanel" aria-expanded="false">Fields</button>
    <button type="button" class="btn lg fw-tool" id="fwTab-rewind" aria-label="Land history" aria-controls="fwHistory" aria-expanded="false">History</button>
    <div class="fw-menuwrap"><button type="button" class="btn lg fw-tool" id="fwEditBtn" aria-haspopup="true" aria-expanded="false" aria-controls="fwEditMenu">Edit field</button>
      <div class="fw-menu" id="fwEditMenu" role="menu" hidden><button type="button" role="menuitem" data-edit="add">Add a field</button><button type="button" role="menuitem" data-edit="newfarm">Add another farm</button><button type="button" role="menuitem" data-edit="corners">Move corners</button><button type="button" role="menuitem" data-edit="split">Split</button><button type="button" role="menuitem" data-edit="rename">Rename</button><button type="button" role="menuitem" data-edit="import">Bring in a map file</button><button type="button" role="menuitem" data-edit="savemap">Save fields as a map file</button><button type="button" role="menuitem" data-edit="savetable">Save the Fields table</button><button type="button" role="menuitem" data-edit="recent">Recently deleted</button><button type="button" role="menuitem" class="fw-danger" data-edit="delete">Delete</button></div></div>
    <input type="file" id="fwFile" hidden aria-label="Choose a map file" accept=".geojson,.json,.kml,application/geo+json,application/json,application/vnd.google-earth.kml+xml">
  </div>
  <div class="fw-stage" id="fwStage">
    <div id="fwMap" class="fw-map" tabindex="-1"></div>
    <div id="fw3d" class="fw-3d" hidden></div>
    <p class="fw-status" id="fwStatus" role="status" hidden></p>
    <div class="fw-empty" id="fwEmpty" hidden><h2>Your fields appear here</h2><p>Open a field report and choose Add to my farm, or add a field yourself. Everything stays on this device.</p><button type="button" class="btn lg primary" id="fwEmptyAdd">Add my farm</button></div>
    <div class="fw-editbar" id="fwEditBar" role="group" aria-label="Edit the field" hidden></div>
    <div class="fw-strip" id="fwStrip" role="group" aria-label="Time on the board" hidden>
      <div class="fw-season"><button type="button" class="btn lg" id="fwSeasonPrev" aria-label="Previous season">‹ Season</button><div class="fw-when"><b id="fwSeasonLabel" role="status"></b><output id="fwMonthName" for="fwMonthSlider"></output></div><button type="button" class="btn lg" id="fwSeasonNext" aria-label="Next season">Season ›</button></div>
      <div class="fw-month"><button type="button" class="btn lg" id="fwMonthPrev" aria-label="Previous month">‹</button><input type="range" id="fwMonthSlider" min="0" max="11" step="1" value="0" aria-label="Month of the season"><button type="button" class="btn lg" id="fwMonthNext" aria-label="Next month">›</button></div>
    </div>
    <section class="fw-history" id="fwHistory" aria-label="Land history" hidden><div class="fw-history-bar"><button type="button" class="btn lg" id="fwHistoryBack">‹ Back to the board</button></div><div id="fwHistoryBody" class="fw-history-body"></div></section>
    <aside class="fw-panel" id="fwPanel" role="dialog" aria-labelledby="fwPanelTitle" hidden></aside>
  </div>
  <div class="fw-toast" id="fwToast" role="status"></div><div class="sr" id="fwSay" role="status" aria-live="polite"></div>
</div>`;
}
function wire() {
  new MutationObserver(() => behind()).observe($('#fwPanel', root), { attributes: true, attributeFilter: ['hidden', 'class'] });   // whatever opens or lowers a sheet, what it covers is put out of reach
  const on = (sel, ev, fn) => $(sel, root).addEventListener(ev, fn);
  on('#fwField', 'change', e => select(e.target.value));
  on('#fwSeasonPrev', 'click', () => moveSeason(-1)); on('#fwSeasonNext', 'click', () => moveSeason(1));
  on('#fwMonthPrev', 'click', () => moveMonth(-1)); on('#fwMonthNext', 'click', () => moveMonth(1));
  on('#fwMonthSlider', 'input', e => { const f = field(); if (f && ui.date) { ui.date = S.monthDate(farm().pin.lat, S.seasonOfDate(farm().pin.lat, ui.date), +e.target.value); render(); } });
  on('#fwMonthSlider', 'change', () => announceDay(`${S.monthWord(ui.date)}. `));
  on('#fwTab-rewind', 'click', () => openHistoryTab()); on('#fwHistoryBack', 'click', () => closeHistory());
  on('#fwChips', 'click', e => { const b = e.target.closest?.('[data-chip]'); if (b) openChip(b.dataset.chip); });
  on('#fwCompare', 'click', () => togglePanel('compare')); on('#fwDetailsBtn', 'click', () => togglePanel('field')); on('#fwFieldsBtn', 'click', () => togglePanel('fields')); on('#fwFarmBtn', 'click', () => togglePanel('farms')); on('#fwEmptyAdd', 'click', () => edit('newfarm'));
  for (const b of root.querySelectorAll('[data-kind]')) b.addEventListener('click', () => setPlanKind(b.dataset.kind));
  on('#fwMapBtn', 'click', () => setView('map')); on('#fwThreeBtn', 'click', () => setView('3d'));
  for (const [btn, menu] of [['#fwStyleBtn', '#fwStyleMenu'], ['#fwEditBtn', '#fwEditMenu']]) on(btn, 'click', () => toggleMenu(btn, menu));
  for (const b of root.querySelectorAll('[data-look]')) b.addEventListener('click', () => { setLook(b.dataset.look); closeMenus(); $('#fwStyleBtn', root).focus(); });
  for (const b of root.querySelectorAll('[data-edit]')) b.addEventListener('click', () => { const what = b.dataset.edit; closeMenus(); edit(what); });
  $('#fwFile', root).addEventListener('change', e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) FE.startImport(editEnv(), file); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !root || root.closest('[hidden]')) return;
    if (!$('#fwStyleMenu', root).hidden || !$('#fwEditMenu', root).hidden) { const open = !$('#fwStyleMenu', root).hidden ? '#fwStyleBtn' : '#fwEditBtn'; closeMenus(); $(open, root).focus(); }
    else if (ui.history) { closeHistory(); }
    else if (ui.panel === 'field' && drawerState.sheet) { resetDrawer(); renderPanel(); $('#fwPanelTitle', root)?.focus(); }
    else if (ui.panel === 'field' && ui.opener === 'token') { const id = ui.fieldId; closePanel(); $(`.fw-token[data-field="${CSS.escape(id)}"]`, root)?.focus({ preventScroll: true }); }
    else if (ui.panel) { const opener = ui.panel === 'chip' ? `[data-chip="${ui.chip}"]` : ui.panel === 'compare' ? '#fwCompare' : ui.panel === 'field' ? '#fwDetailsBtn' : ui.panel === 'fields' ? '#fwFieldsBtn' : ui.panel === 'farms' || ui.panel === 'settings' ? '#fwFarmBtn' : '#fwEditBtn'; closePanel(); $(opener, root).focus(); }
  });
  document.addEventListener('click', e => { if (root && !e.target.closest?.('.fw-menuwrap')) closeMenus(); });
}
function toggleMenu(btn, menu) {
  const m = $(menu, root), was = !m.hidden; closeMenus();
  if (!was) { m.hidden = false; $(btn, root).setAttribute('aria-expanded', 'true'); menuBehind(m); placeMenu(m); m.querySelector('button')?.focus(); }
}
// A menu opens under its button, and slides sideways only as far as it must to stay on the screen.
function placeMenu(m) {
  m.style.left = ''; m.style.right = '';
  const wrap = m.parentElement.getBoundingClientRect(); let r = m.getBoundingClientRect();
  if (r.right > innerWidth - 8) { m.style.left = 'auto'; m.style.right = '0'; r = m.getBoundingClientRect(); }
  if (r.left < 8) { m.style.right = 'auto'; m.style.left = `${Math.round(8 - wrap.left)}px`; }
}
// On a phone an open menu covers the toolbar, the chips and the board: until it closes, only the menu can be reached.
function menuBehind(open) {
  const on = !!open && phone();
  for (const n of [$('.fw-hud', root), $('#fwStage', root), ...[...$('#fwBar', root).children].filter(c => !open || !c.contains(open))]) if (n) n.inert = on;
}
const closeMenus = () => { for (const [b, m] of [['#fwStyleBtn', '#fwStyleMenu'], ['#fwEditBtn', '#fwEditMenu']]) { $(m, root).hidden = true; $(b, root).setAttribute('aria-expanded', 'false'); } menuBehind(null); behind(); };

// ---- time: the season arrows and the month slider move the ONE date of the board; the Compare days are marks on the same line
function moveSeason(n) { const f = field(); if (!f || !ui.date) return; ui.date = S.shiftSeason(ui.date, n); render(); const lat = farm().pin.lat; announceDay(`${S.seasonLabel(lat, S.seasonOfDate(lat, ui.date))} season. `); }
function moveMonth(n) {
  const f = field(); if (!f || !ui.date) return;
  const lat = farm().pin.lat; let sy = S.seasonOfDate(lat, ui.date), i = S.monthIndexOf(lat, ui.date) + n;
  if (i > 11) { i = 0; sy++; } else if (i < 0) { i = 11; sy--; }
  ui.date = S.monthDate(lat, sy, i); render(); announceDay(`${S.monthWord(ui.date)}. `);
}
function renderStrip() {
  const strip = $('#fwStrip', root), fm = farm(), f = field(), show = !!(fm && f && ui.date && !ui.mode && !ui.history);
  strip.hidden = !show; $('#fwStage', root).classList.toggle('has-strip', show); $('#fw', root).classList.toggle('has-strip', show);
  if (!show) return;
  const lat = fm.pin.lat, sy = S.seasonOfDate(lat, ui.date), idx = S.monthIndexOf(lat, ui.date);
  $('#fwSeasonLabel', root).textContent = `${S.seasonLabel(lat, sy)} season`;
  const slider = $('#fwMonthSlider', root); slider.value = String(idx); slider.setAttribute('aria-valuetext', S.monthWord(ui.date));
  $('#fwMonthName', root).textContent = S.monthWord(ui.date);
}
// ---- the field tokens by keyboard: one in the Tab order; arrows go to the nearest field that way (within 60 degrees), Home and End to the first and last by name, Enter or Space opens the field's drawer
function tokenKey(e, t) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const fm = farm(), id = t.dataset.field, bearings = { ArrowUp: 0, ArrowRight: 90, ArrowDown: 180, ArrowLeft: 270 }, all = S.naturalSort(fm.fields), pt = f => S.interiorPoint(f.ring);
  let target = null;
  if (Object.hasOwn(bearings, e.key)) { const me = S.getField(fm, id); target = S.nearestInDirection({ at: pt(me) }, fm.fields.filter(f => f.id !== id).map(f => ({ id: f.id, at: pt(f) })), bearings[e.key]); }
  else if (e.key === 'Home') target = all[0]?.id; else if (e.key === 'End') target = all.at(-1)?.id;
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); ui.opener = 'token'; select(id); openPanel('field'); return; }
  else return;
  e.preventDefault(); e.stopPropagation();   // the map must not pan under a key that moves between fields
  if (target && target !== id) focusToken(target);
}
function focusToken(id) {
  const f = S.getField(farm(), id); if (!f) return;
  for (const b of root.querySelectorAll('.fw-token')) b.tabIndex = b.dataset.field === id ? 0 : -1;
  $(`.fw-token[data-field="${CSS.escape(id)}"]`, root)?.focus({ preventScroll: true });
  const mid = S.interiorPoint(f.ring); if (map && !map.getBounds().contains(mid)) map.panTo(mid, { animate: false });
  say(`${f.name}, ${areaWords(f.area)}${f.estimated ? ', estimated outline' : ''}.`);
}
// Every change of day, season or plan is said, in the board's own sentence, in the polite region.
const announceDay = (prefix = '') => { const f = field(); if (f) say(`${prefix}${finding(f)}`); };
// ---- choosing
function select(id) { if (ui.mode || !S.getField(farm(), id)) return; ui.fieldId = id; const f = field(), ds = keyDates(f); if (!ui.date) ui.date = ds[0]?.date || ''; render(true); say(`${f.name} chosen.`); }
function setLook(look) { ui.look = look === 'photo' ? 'photo' : 'board'; applyLook(); render(); }
function setDate(i) { const ds = keyDates(field()); if (!ds[i]) return; ui.date = ds[i].date; render(); announceDay(); }
export function setPlanKind(k) { ui.planKind = k === 'current' ? 'current' : 'proposed'; render(); announceDay(`${KINDS[ui.planKind]} shown. `); }

// ---- 3D: only when asked, only where the device can draw it; the board never depends on it
function canDraw3d() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info'), name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch { return false; }
}
async function setView(v) {
  if (v === '3d') {
    if (!canDraw3d()) { ui.view = 'map'; showStatus('This device cannot draw 3D. The board shows the same things.'); render(); return; }
    ui.view = '3d'; render();
    try {
      if (typeof view3dFn !== 'function') throw new Error('no view');   // the 3D look is handed in with setView3d(); the board never needs it
      const node = $('#fw3d', root), input = S.farmFor3d(farm(), { fieldId: ui.fieldId, planKind: ui.planKind, date: ui.date, ground: groundOf });
      handle3d?.dispose?.();
      handle3d = await view3dFn(input, node, { motion: motionNow(), onFallback: why => { handle3d = null; ui.view = 'map'; showStatus(why === 'no-webgl' ? 'This device cannot draw 3D. The board shows the same things.' : 'The 3D view could not load. The board is shown.'); render(); } });
      if (handle3d && handle3d.ok === false) throw new Error(handle3d.status || '3d');
      say('3D view.');
    } catch { handle3d = null; ui.view = 'map'; showStatus('The 3D view could not load. The board is shown.'); render(); }
  } else { handle3d?.dispose?.(); handle3d = null; ui.view = 'map'; render(); say('Map view.'); setTimeout(() => map?.invalidateSize(), 50); }
}
function showStatus(text) { const n = $('#fwStatus', root); n.textContent = text; n.hidden = !text; if (text) say(text); }

// ---- the drawer: Compare plans
function togglePanel(which) { ui.panel === which ? closePanel() : openPanel(which); }
function openPanel(which) { ui.panel = which; $('#fwStage', root).classList.toggle('panel-wide', which === 'fields'); $('#fwPanel', root).classList.toggle('wide', which === 'fields'); renderPanel(); const p = $('#fwPanel', root); p.hidden = false; p.classList.remove('is-low'); $('#fwStage', root).classList.add('has-panel'); setTimeout(() => map?.invalidateSize(), 30); addLower(); $('#fwCompare', root).setAttribute('aria-expanded', String(which === 'compare')); $('#fwDetailsBtn', root).setAttribute('aria-expanded', String(which === 'field')); $('#fwFieldsBtn', root).setAttribute('aria-expanded', String(which === 'fields')); $('#fwFarmBtn', root).setAttribute('aria-expanded', String(which === 'farms')); $('#fwPanelTitle', root)?.focus(); }
// On a phone the open sheet covers the board and the top rows, so what it covers is out of reach for the finger, the keyboard and a screen reader until the sheet is lowered or closed.
const phone = () => matchMedia('(max-width: 700px)').matches;
function behind() {
  const cover = !!ui.panel && !$('#fwPanel', root).hidden && phone() && !$('#fwPanel', root).classList.contains('is-low');
  for (const sel of ['.fw-hud', '.fw-bar', '#fwStage > .fw-map', '#fwStage > .fw-3d', '#fwStrip']) { const n = $(sel, root); if (n) n.inert = cover; }
}
addEventListener('resize', () => { if (root) behind(); });
function closePanel() { ui.panel = ''; ui.opener = ''; resetDrawer(); $('#fwPanel', root).hidden = true; $('#fwStage', root).classList.remove('has-panel'); setTimeout(() => map?.invalidateSize(), 30); $('#fwCompare', root).setAttribute('aria-expanded', 'false'); $('#fwDetailsBtn', root).setAttribute('aria-expanded', 'false'); $('#fwFieldsBtn', root).setAttribute('aria-expanded', 'false'); $('#fwFarmBtn', root).setAttribute('aria-expanded', 'false'); behind(); }
// On a phone the sheet can be lowered to a short bar so the 3D picture and the map can be seen while comparing.
function addLower() {
  const p = $('#fwPanel', root), head = p.querySelector('.fw-panel-head'); if (!head || head.querySelector('#fwLower')) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'fwLower'; b.className = 'btn lg fw-lower'; b.textContent = 'Lower'; b.setAttribute('aria-expanded', 'true'); b.setAttribute('aria-controls', 'fwPanel');
  b.onclick = () => { const low = p.classList.toggle('is-low'); b.textContent = low ? 'Raise' : 'Lower'; b.setAttribute('aria-expanded', String(!low)); behind(); };
  head.append(b);
}
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// What the field drawer is given: the farm's parts as one object, so the drawer itself fetches and stores nothing.
function drawerEnv() {
  return { node: $('#fwPanel', root), get: () => ({ store, farm: farm(), field: field() }), cropName, crops, reminders, forecast, today: isoToday, year: () => S.seasonNow(farm().pin.lat),
    toast, say, close: () => { closePanel(); $('#fwDetailsBtn', root).focus(); },
    commit: (next, words) => { const before = store; undo.push(before, words); store = next; later(); render(); toast(words, () => { store = before; later(); render(); if (ui.panel === 'field') renderPanel(); say('Undone'); }); } };
}
function groundCard(f, kind) {
  const plan = f.report?.[kind], name = KINDS[kind];
  if (!plan) return `<section class="fw-card" aria-labelledby="fwc-${kind}"><h3 id="fwc-${kind}">${name}</h3><p class="fw-muted">No ${name.toLowerCase()} came from the report.</p></section>`;
  const g = groundOf(plan, ui.date), crops = [...new Set(plan.seasons.map(x => cropName(x.crop)))].join(' → ');
  const body = g && g.state === null ? `<p class="fw-state"><b>Outside this plan's years</b> <span class="fw-label">${g.label}</span></p><p>${esc(g.note)}</p>` : g ? `<p class="fw-state"><span class="fw-swatch" data-state="${g.state}" aria-hidden="true"></span><b>${esc(GROUND_WORDS[g.state][0].toUpperCase() + GROUND_WORDS[g.state].slice(1))}</b> <span class="fw-label">${g.label}</span></p>${g.note ? `<p>${esc(g.note)}</p>` : ''}`
    : `<p class="fw-state"><b>What covers the ground: not read yet</b></p><p class="fw-muted">The ground-cover reading has not arrived, so Crophalo shows no guess.</p>`;
  return `<section class="fw-card" aria-labelledby="fwc-${kind}"><h3 id="fwc-${kind}">${name}</h3><p class="fw-crops">${esc(crops)}</p>${body}</section>`;
}
function observedCard() {
  const o = observedNow(); if (!o) return '';
  return `<section class="fw-card fw-observed" aria-labelledby="fwc-obs"><h3 id="fwc-obs">Observed from space</h3><p class="fw-state"><b>${esc(o.line)}</b></p>${o.detail ? `<p>${esc(o.detail)}</p>` : ''}<p class="fw-muted">NASA HLS, 30 m. A picture is days old and shows the field as it was that day, never today's state.</p></section>`;
}
function caveat(f) {
  const p = f.report?.proposed; if (!p) return '';
  const last = p.seasons[p.seasons.length - 1], prev = p.seasons[p.seasons.length - 2], w = last.window, name = cropName(last.crop);
  if (!w) return `<p><b>Planting window for ${esc(name)}:</b> not read yet.</p>`;
  const late = prev && prev.harvest > w.latest;
  return `<p><b>Planting window for ${esc(name)}:</b> ${dayWords(w.earliest)} to ${dayWords(w.latest)}, from the crop table and this field's own frost and heat record. A late ${prev ? esc(cropName(prev.crop).toLowerCase().replace(/beans$/, 'bean')) : 'earlier'} harvest squeezes it.${late ? ` Here the harvest is planned for ${dayWords(prev.harvest)}, after the latest planting date, so ${esc(name.toLowerCase())} may be hard to plant.` : prev ? ` The harvest is planned for ${dayWords(prev.harvest)}, inside the window.` : ''}</p>`;
}
function assumptions(f) {
  const items = [];
  items.push(f.soil?.assumed ? 'Soil: loam, assumed until the soil lookup answers.' : f.soil ? `Soil: ${esc(f.soil.texture)}.` : 'Soil: not read yet.');
  items.push(`Water: ${farm().practice.irrigation === 'none' ? 'rain-fed' : farm().practice.irrigation === 'limited' ? 'limited irrigation' : 'irrigated as needed'}.`);
  items.push(f.estimated ? `Outline: estimated, a square of ${areaWords(f.area)} around the pin. Draw the real outline to make it exact.` : `Outline: drawn by you, ${areaWords(f.area)}.`);
  items.push('Dates are planned dates from the report, not observed ones, unless a state says Observed.');
  return `<details class="fw-fold"><summary>Assumptions</summary><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></details>`;
}
function renderPanel() {
  const p = $('#fwPanel', root), f = field(), had = document.activeElement, keep = p.contains(had) ? (had.id ? '#' + had.id : had.dataset?.i != null ? `.fw-step[data-i="${had.dataset.i}"]` : '') : '';
  try { renderPanelNow(p, f); } finally { if (keep) $(keep, root)?.focus(); }
}
function renderPanelNow(p, f) {
  if (ui.panel === 'field' && f) { renderDrawer(drawerEnv()); return; }
  if (ui.panel === 'fields' && fm0()) { renderFields(tableEnv()); return; }
  if (ui.panel === 'chip' && f) { renderChipSheet(chipEnv(), ui.chip); return; }
  if (ui.panel === 'farms') { renderFarms(farmsEnv()); return; }
  if (ui.panel === 'settings') { renderSettings(farmsEnv()); return; }
  if (ui.panel !== 'compare' || !f) { if (!['rename', 'delete', 'recent', 'import', 'add', 'confirm', 'newfarm', 'farms', 'settings'].includes(ui.panel)) p.innerHTML = ''; return; }
  const ds = keyDates(f), i = dateIndex(f), cur = ds[i], before = ds.map((d, k) => d.date < ui.date ? k : -1).filter(k => k >= 0), after = ds.findIndex(d => d.date > ui.date);
  p.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">Compare plans · ${esc(f.name)}</h2><button type="button" class="btn lg" id="fwClose" aria-label="Close compare plans">Close</button></div>
  <div class="fw-stepper" role="group" aria-label="Date to compare">
    <button type="button" class="btn lg" id="fwPrev" ${(i >= 0 ? i <= 0 : !before.length) ? 'disabled' : ''} aria-label="Previous date">‹ Earlier</button>
    <div class="fw-steps">${ds.map((d, k) => `<button type="button" class="fw-step" data-i="${k}" aria-pressed="${k === i}"><span>${esc(d.label)}</span><small>${dayWords(d.date)}</small></button>`).join('')}</div>
    <button type="button" class="btn lg" id="fwNext" ${(i >= 0 ? i >= ds.length - 1 : after < 0) ? 'disabled' : ''} aria-label="Next date">Later ›</button>
  </div>
  <p class="fw-onedate">Same date for both plans: <time datetime="${esc(ui.date)}">${dayWords(ui.date)}</time>${cur?.hint ? ` · ${esc(cur.hint)}` : ''}</p>
  <div class="fw-cards">${groundCard(f, 'current')}${groundCard(f, 'proposed')}</div>
  <div class="fw-caveat">${caveat(f)}</div>${assumptions(f)}
  ${observedCard()}
  <p class="fw-note">Soil washes away most from bare or thinly covered ground in heavy rain. Living plants and residue slow it. This is a guide, not advice. You decide.</p>`;
  $('#fwClose', root).onclick = () => { closePanel(); $('#fwCompare', root).focus(); };
  $('#fwPrev', root).onclick = () => setDate(i >= 0 ? i - 1 : before.at(-1)); $('#fwNext', root).onclick = () => setDate(i >= 0 ? i + 1 : after);
  for (const b of p.querySelectorAll('.fw-step')) b.onclick = () => setDate(+b.dataset.i);
}

// ---- editing the field (the occasional tools)
let editLayer = null;
function editEnv() {
  const p = $('#fwPanel', root);
  return { L, map, layer: editLayer, bar: $('#fwEditBar', root), panel: p, get: () => ({ store, farm: farm(), field: field() }), cropName, units: () => 'metric', toast, say,
    commit: (next, words) => { const before = store; undo.push(before, words); store = next; later(); render(); toast(words, () => { store = before; later(); render(true); say('Undone'); }); },
    finish: lost => { ui.mode = ''; render(true); if (ui.panel !== 'field') $('#fwEditBtn', root).focus(); if (lost) say(lost); },
    startDraw: () => enterMode('draw', FE.startDraw), chooseFile: () => $('#fwFile', root).click(),
    afterAdd: id => { ui.mode = ''; FE.hideBar(editEnv()); select(id); resetDrawer(); ui.panel = 'field'; $('#fwPanel', root).hidden = false; startPlant(drawerEnv()); },
    openPanel: which => { ui.panel = which; p.hidden = false; }, closePanel: keep => { closePanel(); if (keep !== true) $('#fwEditBtn', root).focus(); }, select: id => { if (id) select(id); } };
}
function enterMode(mode, start) {
  if (ui.view === '3d') { toast('Go back to the map to change the outline.'); return; }
  closePanel(); ui.mode = mode; renderStrip(); start(editEnv());
}
const fm0 = () => farm();
// ---- Observed beside Planned: what NASA's pictures of this field saw, on the day shown
function observedNow() {
  const fm = farm(), f = field(); if (!fm || !f) return null;
  const [lat, lon] = S.interiorPoint(f.ring), entry = loadObserved(lat, lon, { fetchFn: dataFetch(), onDone: () => { renderObs(); if (ui.panel === 'compare') renderPanel(); } });
  return observedFor(entry.answer, ui.date, { waiting: entry.waiting });
}
function renderObs() {
  const n = $('#fwObs', root), o = ui.date ? observedNow() : null;
  n.hidden = !o; if (o) { n.textContent = o.chip; n.dataset.state = o.state; n.title = o.line; }
}
// ---- Land history: the history page, with the field's own recorded weather and the replay of each crop of its plan; the board is where the farm reopens
let historyHandle = null;
async function openHistoryTab() {
  const fm = farm(), f = field(); if (!fm || !f) return;
  closePanel(); ui.history = true; render();
  const body = $('#fwHistoryBody', root); body.innerHTML = '<p class="fw-muted">Reading the weather record of this field…</p>';
  $('#fwHistory', root).hidden = false; $('#fwTab-rewind', root).setAttribute('aria-expanded', 'true'); $('#fwHistoryBack', root).focus(); say('Land history.');
  const r = await whenSeries(readingsFor(fm, f));
  if (!ui.history) return;
  try {
    const [view, fit] = await Promise.all([import('./history-view.js'), import('./fit.js')]);
    const elev = Number.isFinite(f.terrain?.hMin) && Number.isFinite(f.terrain?.hMax) ? (f.terrain.hMin + f.terrain.hMax) / 2 : null, series = elev != null && r.series ? fitHeight(r.series, elev) : r.series;   // the field's own height, when it is 100 m or more off the weather cell
    const crops = cropsFor(fm, f, series, { cropOf: id => crops_.cropOf(id), cropName: (id, short) => cropName(id, short), holdOf: t => fit.WATER_HOLD[t] ?? 150, irrigationMm: l => fit.IRRIGATION_MM[l] ?? 0 });
    const slope = f.marks?.slope ?? f.terrain?.slope, fields = [{ name: f.name, slope: Number.isFinite(slope) ? { words: `${slopeWordsOf(slope)} (${slope.toFixed(1)}%)${f.marks?.slope != null ? ', from you' : ''}` } : null, marks: [] }];
    historyHandle?.destroy?.();
    historyHandle = view.openHistory(body, { farm: { name: fm.name, place: fm.pin.label || '' }, fields, series: r.series, climate: r.climate, crops });
  } catch { body.innerHTML = '<p class="fw-muted">The land history could not load. The board is shown.</p>'; }
}
const crops_ = crops;
const slopeWordsOf = pct => pct < 2 ? 'nearly flat' : pct < 6 ? 'gently sloping' : pct < 12 ? 'moderately sloping' : 'steep';
function closeHistory() {
  historyHandle?.destroy?.(); historyHandle = null; ui.history = false; $('#fwHistory', root).hidden = true; $('#fwTab-rewind', root).setAttribute('aria-expanded', 'false'); render(); $('#fwTab-rewind', root).focus(); say('The board.');
}
// ---- the chips: the weather, the plan's score, bare soil, past years, sales; each opens its sheet in the one drawer
function renderChips() {
  const row = $('#fwChips', root), fm = farm(), f = field();
  if (!fm || !f) { row.hidden = true; row.innerHTML = ''; return; }
  const r = readingsFor(fm, f, () => { renderChips(); if (ui.panel === 'chip') renderPanel(); });
  row.hidden = false; row.innerHTML = chipRowHTML(chipsFrom(r, f, ui.planKind));
}
function chipEnv() { return { node: $('#fwPanel', root), get: () => ({ farm: farm(), field: field(), kind: ui.planKind, readings: readingsFor(farm(), field()) }), close: () => { closePanel(); $(`[data-chip="${ui.chip}"]`, root)?.focus(); } }; }
function openChip(id) { ui.chip = id; openPanel('chip'); }
function openFarmId(id) {
  const res = S.openFarm(store, id); if (res.refused) return toast(res.refused);
  store = res.store; write(); ui.farmId = id; ui.fieldId = ''; ui.date = ''; closePanel(); render(true); say(`${farm().name} opened.`); $('#fwFarmBtn', root).focus();
}
function farmsEnv() {
  const p = $('#fwPanel', root);
  return { node: p, get: () => ({ store, farm: farm() }), say, toast, close: () => { closePanel(); $('#fwFarmBtn', root).focus(); },
    open: openFarmId, add: () => newFarm(), settings: () => { ui.panel = 'settings'; p.hidden = false; renderSettings(farmsEnv()); }, list: () => { ui.panel = 'farms'; p.hidden = false; renderFarms(farmsEnv()); },
    apply: next => { store = next; later(); render(); },
    commit: (next, words, undoable, openId, deleted) => {
      const before = store; store = next; later();
      if (deleted || openId) { ui.farmId = store.active; ui.fieldId = ''; ui.date = ''; }
      if (deleted) closePanel();
      render(true);
      if (undoable) toast(words, () => { store = before; ui.farmId = store.active; ui.fieldId = ''; ui.date = ''; later(); render(true); say('Undone'); }); else toast(words);
    },
    pickPin: (cb, back) => pickOnMap(editEnv(), cb, back) };
}
function tableEnv() {
  return { node: $('#fwPanel', root), get: () => ({ store, farm: farm(), field: field() }), cropName, reminders, say,
    close: () => { closePanel(); $('#fwFieldsBtn', root).focus(); }, open: id => { select(id); openPanel('field'); }, add: () => edit('add') };
}
// A new farm: the place, the name and water, then the first field. The map is used to tap a place, so it shows (as the satellite photo) while the farmer picks.
function pickOnMap(env, cb, back) {
    const p = $('#fwPanel', root), was = ui.look;
    p.hidden = true; ui.mode = 'pick'; ui.look = 'photo'; applyLook(); render(); map.invalidateSize();
    if (!farm()) map.setView([46, -80], 4, { animate: false });
    const bar = env.bar, leave = () => { ui.mode = ''; ui.look = was; applyLook(); FE.hideBar(env); p.hidden = false; render(); };
    bar.innerHTML = '<p class="fw-editline" role="status">Move the map, then tap the farm</p><div class="fw-editbtns"><button type="button" class="btn lg" data-bar="centre">Use the map\'s centre</button><button type="button" class="btn lg" data-bar="cancel">Cancel</button></div>'; bar.hidden = false; bar.setAttribute('aria-label', 'Choose the farm on the map');
    const done = ll => { leave(); cb(ll); };
    env._tap = e => done(e.latlng); map.on('click', env._tap);
    bar.onclick = e => { const b = e.target.closest('[data-bar]'); if (!b) return; if (b.dataset.bar === 'cancel') { leave(); back(true); } else done(map.getCenter()); };
    env._key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); leave(); back(true); } };
    document.addEventListener('keydown', env._key, true);
    say('Move the map, then tap the farm. With the keyboard: move the map with the arrow keys, then Use the map centre.');
}
function newFarm() {
  closePanel(); ui.panel = 'newfarm'; $('#fwPanel', root).hidden = false; $('#fwStage', root).classList.add('has-panel');
  const env = editEnv();
  env.pickOnMap = (cb, back) => pickOnMap(env, cb, back);
  env.createFarm = opts => {
    const res = S.addFarm(store, opts);
    if (res.refused) return { refused: res.refused };
    undo.clear(); store = res.store; write(); ui.farmId = res.farm.id; ui.fieldId = ''; ui.panel = 'newfarm'; ui.date = '';
    render(true); say(`${res.farm.name} opened.`); return { farm: res.farm };
  };
  env.squareAtPin = ha => { const fm = farm(); FE.proposeField(env, S.squareAround(fm.pin.lat, fm.pin.lon, ha)); };
  startFarm(env);
}
function edit(what) {
  if (what === 'newfarm') return newFarm();
  const f = field(), fm = farm(); if (!fm || (!f && !['recent', 'import'].includes(what))) return;
  if (what === 'add') { ui.panel = 'add'; $('#fwPanel', root).hidden = false; return FE.renderAdd(editEnv()); }
  if (what === 'corners') return enterMode('corners', FE.startCorners);
  if (what === 'split') return enterMode('split', FE.startSplit);
  if (what === 'import') return $('#fwFile', root).click();
  if (what === 'savemap') return FE.saveMapFile(editEnv());
  if (what === 'savetable') return FE.saveTable(editEnv());
  if (what === 'rename') {
    const p = $('#fwPanel', root); ui.panel = 'rename'; p.hidden = false;
    p.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">Rename ${esc(f.name)}</h2></div><form id="fwRename" class="fw-form"><label for="fwName">Field name</label><input id="fwName" class="fw-input" maxlength="40" value="${esc(f.name)}" autocomplete="off"><p class="fw-err" id="fwNameErr" role="alert"></p><div class="fw-actions"><button type="submit" class="btn lg primary">Save name</button><button type="button" class="btn lg" id="fwCancel">Cancel</button></div></form>`;
    $('#fwName', root).focus(); $('#fwName', root).select();
    $('#fwCancel', root).onclick = () => { closePanel(); $('#fwEditBtn', root).focus(); };
    $('#fwRename', root).onsubmit = e => {
      e.preventDefault();
      const res = S.renameField(store, fm.id, f.id, $('#fwName', root).value);
      if (res.refused) { $('#fwNameErr', root).textContent = res.refused; return; }
      const before = store; store = res.store; closePanel(); later(); render(); $('#fwEditBtn', root).focus();
      toast(`Renamed to ${S.getField(S.getFarm(store, fm.id), f.id).name}`, () => { store = before; later(); render(); say(`The name is ${res.was} again`); });
    };
  } else if (what === 'delete') confirmDelete(f);
  else if (what === 'recent') showRecent();
}
function confirmDelete(f) {
  const p = $('#fwPanel', root); ui.panel = 'delete'; p.hidden = false;
  p.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">Delete ${esc(f.name)}?</h2></div><p>The field and its plan are removed from this farm. You can undo it for a few seconds, and it stays under Recently deleted for 30 days.</p>
  <div class="fw-actions"><button type="button" class="btn lg danger armed" id="fwDoDelete">Delete</button><button type="button" class="btn lg" id="fwKeep">Keep it</button></div>`;
  $('#fwPanelTitle', root).focus();
  $('#fwKeep', root).onclick = () => { closePanel(); $('#fwEditBtn', root).focus(); };
  $('#fwDoDelete', root).onclick = () => {
    const before = store, res = S.deleteField(store, farm().id, f.id); if (res.refused) { toast(res.refused); return; }
    store = res.store; ui.fieldId = ''; closePanel(); later(); render(true);
    toast(`${f.name} deleted`, () => { store = before; ui.fieldId = f.id; later(); render(true); say(`${f.name} is back`); });
  };
}
function showRecent() {
  const p = $('#fwPanel', root), fm = farm(), items = fm.trash;
  ui.panel = 'recent'; p.hidden = false;
  p.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">Recently deleted</h2><button type="button" class="btn lg" id="fwClose">Close</button></div><p class="fw-muted">Kept on this device for 30 days. A field comes back with its plan.</p>
  ${items.length ? `<ul class="fw-list">${items.map(t => `<li><span><b>${esc(t.field.name)}</b><br><small>${areaWords(t.field.area)} · deleted ${dayWords(new Date(t.at).toISOString().slice(0, 10))}</small></span><button type="button" class="btn lg" data-restore="${esc(t.field.id)}">Restore</button></li>`).join('')}</ul>` : '<p>Nothing was deleted recently.</p>'}`;
  $('#fwPanelTitle', root).focus();
  $('#fwClose', root).onclick = () => { closePanel(); $('#fwEditBtn', root).focus(); };
  for (const b of p.querySelectorAll('[data-restore]')) b.onclick = () => {
    const res = S.restoreField(store, fm.id, b.dataset.restore); if (res.refused) { toast(res.refused); return; }
    store = res.store; ui.fieldId = res.field.id; closePanel(); later(); render(true); toast(`${res.field.name} is back, with its plan.`);
  };
}

// ---- the map
function applyLook() {
  if (!map) return;
  root.classList.toggle('fw-photo', ui.look === 'photo');
  if (tiles) { map.removeLayer(tiles); tiles = null; }
  if (ui.look === 'photo') {
    tiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }).addTo(map);
    let said = false; tiles.on('tileerror', () => { if (!said) { said = true; showStatus('The satellite photo needs internet.'); } }); tiles.on('load', () => { if (!said) showStatus(''); });
  } else showStatus('');
  for (const b of root.querySelectorAll('[data-look]')) b.setAttribute('aria-checked', String(b.dataset.look === ui.look));
}
function fillFor(f) {
  const g = f.id === ui.fieldId ? groundOf(f.report?.[ui.planKind], ui.date) : null;
  if (g?.state === 'crop') return (g.crop && cropsMod?.cropColor?.(g.crop)) || '#7ed957';
  return g && g.state ? STATE_FILL[g.state] : UNREAD_FILL;
}
function drawMap(refit) {
  const fm = farm(); if (!map) return;
  const hadFocus = document.activeElement?.closest?.('.fw-token')?.dataset.field;   // a token that has the keyboard keeps it when the board is drawn again
  layer.clearLayers();
  const tabId = ui.fieldId || S.naturalSort(fm?.fields || [])[0]?.id;   // one token in the Tab order: the chosen field, else the first by name
  if (!fm) return;
  const person = L.divIcon({ className: 'fw-here', html: '<span role="img" aria-label="You are here: the pin of ' + esc(fm.name) + '"><svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="14" fill="#0b2545" stroke="#fff" stroke-width="2"/><circle cx="15" cy="10" r="3.2" fill="#fff"/><path d="M9.5 21.5c0-3.6 2.4-5.8 5.5-5.8s5.5 2.2 5.5 5.8z" fill="#fff"/></svg></span>', iconSize: [30, 30], iconAnchor: [15, 15] });
  L.marker([fm.pin.lat, fm.pin.lon], { icon: person, interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(layer);
  for (const f of S.naturalSort(fm.fields)) {
    const chosen = f.id === ui.fieldId, ll = f.ring.map(p => [p[0], p[1]]);
    if (chosen) L.polygon(ll, { color: GOLD, weight: 13, opacity: .65, fill: false, interactive: false, className: 'fw-halo' }).addTo(layer);
    const poly = L.polygon(ll, { color: NAVY, weight: chosen ? 5 : 3, fillColor: fillFor(f), fillOpacity: ui.look === 'photo' ? .66 : .92, className: 'fw-field' + (chosen ? ' is-chosen' : '') }).addTo(layer);
    poly.on('click', () => select(f.id));
    const mid = S.interiorPoint(f.ring);
    const label = `${f.name}, ${areaWords(f.area)}${f.estimated ? ', estimated outline' : ''}${chosen ? ', chosen' : ''}`;
    const month = ui.date ? S.MONTH_NAMES[+ui.date.slice(5, 7) - 1] : '', state = f.report ? S.plateWord(groundOf(f.report[ui.planKind], ui.date), cropName, month) : '';   // "Growing (corn) in June": only where the engine has an answer for the day
    const token = L.divIcon({ className: 'fw-tokenwrap', html: `<button type="button" class="fw-token${chosen ? ' is-chosen' : ''}" tabindex="${f.id === tabId ? 0 : -1}" data-field="${esc(f.id)}" aria-label="${esc(label + (month ? `. ${month}: ${state}` : ''))}" aria-pressed="${chosen}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c-3 4-6 6-6 10a6 6 0 0 0 12 0c0-4-3-6-6-10z"/></svg></button><span class="fw-plate"><b>${esc(f.name)}</b><small>${areaWords(f.area)}${f.estimated ? ' · estimated' : ''}</small>${state ? `<small class="fw-plate-state">${esc(state)}</small>` : ''}</span>`, iconSize: [120, 90], iconAnchor: [60, 22] });
    L.marker(mid, { icon: token, keyboard: false }).addTo(layer).on('click', () => select(f.id));
  }
  if (hadFocus) $(`.fw-token[data-field="${CSS.escape(hadFocus)}"]`, root)?.focus({ preventScroll: true });
  const chosen = field();
  if (refit !== false && chosen) map.fitBounds(L.polygon(chosen.ring).getBounds().pad(0.6), { animate: false, maxZoom: 17 });
  else if (refit !== false) map.setView([fm.pin.lat, fm.pin.lon], 15, { animate: false });
}
// Motion, as Settings says it: full, Less (nothing slides or glides, a fade of 200 ms at most) or Still (nothing moves at all). The board never animates its own pans and zooms in any of them.
const motionNow = () => { const m = document.documentElement.dataset.motion || ''; return m === 'reduce' || m === 'less' ? m : matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : ''; };
function initMap() {
  if (map) return;
  map = L.map($('#fwMap', root), { zoomControl: true, attributionControl: true, zoomSnap: 0.25, maxZoom: 19, minZoom: 3, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, inertia: !motionNow() });   // a dragged map stops where the hand stops when motion is less or still
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.setView([46, -80], 10); layer = L.layerGroup().addTo(map); editLayer = L.layerGroup().addTo(map);
  $('#fwMap', root).addEventListener('keydown', e => { const t = e.target.closest?.('.fw-token'); if (t) tokenKey(e, t); });
  $('#fwMap', root).addEventListener('click', e => { const t = e.target.closest?.('.fw-token'); if (t) { if (t.dataset.field === ui.fieldId && ui.panel !== 'field') openPanel('field'); else select(t.dataset.field); } });
  applyLook();
}

// ---- drawing the whole screen
export function render(refit = false) {
  if (!root) return;
  const fm = farm(), f = field();
  if (f) ui.fieldId = f.id; if (fm) ui.farmId = fm.id;
  const ds = keyDates(f); if (f && ds.length && !ui.date) ui.date = ds[0].date;   // a day the farmer moved to by the time bar stays; only a board with no day starts on the plan's first
  const sel = $('#fwField', root); sel.innerHTML = fm ? S.naturalSort(fm.fields).map(x => `<option value="${esc(x.id)}"${x.id === ui.fieldId ? ' selected' : ''}>${esc(x.name)} · ${areaWords(x.area)}${x.estimated ? ' (estimated)' : ''}</option>`).join('') : '';
  sel.disabled = !fm || !fm.fields.length;
  $('#fwTime', root).textContent = ui.date ? dayWords(ui.date) : ''; $('#fwTime', root).setAttribute('datetime', ui.date || '');
  $('#fwLabel', root).textContent = f && ui.date ? chipFor(f) : '';
  $('#fwFinding', root).textContent = finding(f);
  $('#fwCompare', root).disabled = !f?.report;
  $('#fwEmpty', root).hidden = !!fm || ui.mode === 'pick'; $('#fwMap', root).hidden = ui.view === '3d' || (!fm && ui.mode !== 'pick'); $('#fw3d', root).hidden = ui.view !== '3d';
  for (const b of root.querySelectorAll('[data-kind]')) { b.setAttribute('aria-pressed', String(b.dataset.kind === ui.planKind)); b.disabled = !f?.report?.[b.dataset.kind]; }
  $('#fwStage', root).classList.toggle('has-panel', !!ui.panel && !$('#fwPanel', root).hidden); $('#fwStage', root).classList.toggle('panel-wide', ui.panel === 'fields'); $('#fwPanel', root).classList.toggle('wide', ui.panel === 'fields');
  $('#fwMapBtn', root).setAttribute('aria-pressed', String(ui.view === 'map')); $('#fwThreeBtn', root).setAttribute('aria-pressed', String(ui.view === '3d'));
  $('#fwEditBtn', root).disabled = !fm; $('#fwFieldsBtn', root).disabled = !fm; $('#fwTab-rewind', root).disabled = !f;
  for (const b of root.querySelectorAll('[data-edit=corners], [data-edit=split], [data-edit=savemap], [data-edit=savetable]')) b.disabled = !f;
  for (const b of root.querySelectorAll('[data-edit=rename], [data-edit=delete]')) b.disabled = !f;
  $('[data-edit=recent]', root).disabled = !fm?.trash.length;
  if (map && fm && ui.view === 'map' && !ui.mode) { drawMap(refit); map.invalidateSize() }
  renderChips(); renderStrip(); renderObs();
  if (['compare', 'field', 'fields', 'farms', 'settings', 'chip'].includes(ui.panel)) { renderPanel(); addLower(); }
  behind();
  const chip = $('#fwFarmBtn', root); chip.hidden = !fm; if (fm) { chip.textContent = `${fm.name} ⌄`; chip.setAttribute('aria-label', `${fm.name}. Change farm`); }
  $('#fwDetailsBtn', root).disabled = !f;
  if (ui.view === '3d' && f && handle3d?.update) { try { handle3d.update(S.farmFor3d(fm, { fieldId: ui.fieldId, planKind: ui.planKind, date: ui.date, ground: groundOf })); } catch { /* the board stays */ } }   // the farmer's camera angle is kept by the 3D view
}

// Show My farm in this node (the page's #view-farm). Called every time the view opens; the first call builds the screen.
export async function mountFarm(node) {
  if (builtFor !== node) { builtFor = node; root = node; build(node); wire(); map = null; layer = null; tiles = null; }
  store = read();
  if (!ui.farmId || !S.getFarm(store, ui.farmId)) { ui.farmId = store.active; ui.fieldId = ''; }
  if (!ui.look) ui.look = 'board';
  initMap(); loadEngine();
  const f = field();
  if (f && !ui.date) ui.date = keyDates(f)[0]?.date || '';
  render(true);
  setTimeout(() => { map?.invalidateSize(); if (field()) drawMap(true); }, 60);
  if (ui.view === '3d') setView('3d');
  $('#fwTitle', node).focus?.();
}
export const _map = () => map;
export const _entry = () => readingsFor(farm(), field());   // read by the browser checks
export const _ui = ui;   // read by the browser checks
