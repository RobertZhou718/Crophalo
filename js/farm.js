// My farm: the board on the real map (Leaflet), one slim top row with the date and one finding, one toolbar, and the Compare plans drawer.
// Loaded the first time "My farm" opens. Everything the farmer sees comes from the farm's own record (js/simulate.js) and, for what covers the ground, from the crop engine's groundOn;
// until that answers, the screen says "not read yet". Works without signing in. Checked by scripts/e2e_farm.mjs (the browser) and scripts/test_sim.mjs (the logic).
import { esc } from './words.js';
import * as S from './simulate.js';
import { areaWords } from './geo.js';
import * as crops from './crops.js';

const $ = (sel, node = document) => node.querySelector(sel);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayWords = iso => { const [y, m, d] = String(iso).split('-').map(Number); return y ? `${d} ${MON[m - 1]} ${y}` : ''; };
export const addDays = (iso, n) => { const t = new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5); return t.toISOString().slice(0, 10); };
const GROUND_WORDS = { crop: 'a growing crop', cover: 'a cover crop', residue: 'crop residue', bare: 'bare soil' };
const STATE_FILL = { residue: '#cdb88a', bare: '#a47148', cover: '#9ccc65' }, UNREAD_FILL = '#dfe6d0', NAVY = '#0b2545', GOLD = '#ffc233';
const KINDS = { current: 'Current plan', proposed: 'Proposed plan' };

// ---- state: kept for the whole visit, so the field, the plan and the date survive switching between Map and 3D and back
const ui = { farmId: '', fieldId: '', planKind: 'proposed', date: '', view: 'map', look: 'board', panel: '' };
let handle3d = null, store = S.emptyStore(), root = null, map = null, layer = null, tiles = null, groundFn = null, cropsMod = crops, opener = null, saveTimer = 0, builtFor = null, view3dFn = null, undo = S.makeUndo(), toastTimer = 0;

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
const cropName = id => cropsMod?.cropName?.(id) || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
const cropInfo = id => { const c = cropsMod?.entryOf?.(id); return c ? { group: c.group || (c.garden ? 'tree' : 'other'), days: c.days || 365, sow: c.sow || 4, kind: c.garden ? 'tree' : c.type === 'cover' ? 'cover' : 'crop' } : null; };

// ---- the seams, each one function: setGround(groundOn) from the crop engine, setView3d(view3d) from the 3D farm (the app loads it lazily and hands it in), addFromReport() from a report
export function setGround(fn) { groundFn = typeof fn === 'function' ? fn : null; if (root) render(); }
export function setOpener(fn) { opener = typeof fn === 'function' ? fn : null; }
export function setView3d(fn) { view3dFn = typeof fn === 'function' ? fn : null; }
// What covers the ground on a day under a plan, checked: only a state the engine really answered, else null ("not read yet").
export function groundOf(plan, date) {
  if (!groundFn || !plan || !date) return null;
  try {
    const g = groundFn(plan, date);
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
  if (!ui.date) ui.date = dates[0]?.date || '';
  if (root) render();
  if (opener) opener(); else document.getElementById('navFarm')?.click();
  return { farmId: res.farmId, fieldId: res.fieldId };
}

// ---- the three dates a judge steps through: the harvest before, the fall the next crop is sown, the spring after
export function keyDates(f) {
  const plan = f?.report?.proposed || f?.report?.current, seasons = plan?.seasons || [];
  if (seasons.length < 2) return seasons.length ? [{ id: 'harvest', label: `${cropName(seasons[0].crop)} harvest`, date: seasons[0].harvest, hint: '' }] : [];
  const prev = seasons[seasons.length - 2], last = seasons[seasons.length - 1], fall = +last.sow.slice(5, 7) >= 8;
  return [
    { id: 'harvest', label: `${cropName(prev.crop).replace(/beans$/i, 'bean')} harvest`, date: prev.harvest, hint: 'The day the harvest is planned to finish.' },
    { id: 'fall', label: fall ? 'Fall establishment' : 'Establishment', date: addDays(last.sow, 30), hint: '30 days after the next crop is sown.' },
    { id: 'spring', label: 'Spring growth', date: `${last.harvest.slice(0, 4)}-05-15`, hint: 'Mid-May, as the next crop grows.' },
  ];
}
const dateIndex = f => Math.max(0, keyDates(f).findIndex(d => d.date === ui.date));

// ---- words on screen
function say(text) { const n = $('#fwSay'); if (n) { n.textContent = ''; setTimeout(() => { n.textContent = text; }, 30); } }
function toast(text, onUndo) {
  const n = $('#fwToast'); if (!n) return;
  n.innerHTML = `<span>${esc(text)}</span>${onUndo ? '<button type="button" class="btn sm" id="fwUndo">Undo</button>' : ''}`; n.classList.add('show');
  if (onUndo) $('#fwUndo').onclick = () => { onUndo(); n.classList.remove('show'); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => n.classList.remove('show'), 8000); say(text);
}
function finding(f) {
  if (!f) return 'No field on your farm yet. Open a report and choose Add to my farm.';
  const r = f.report;
  if (!r?.current && !r?.proposed) return `${f.name} has no plan from a report yet. Open its report and choose Add to my farm.`;
  const d = dayWords(ui.date), cur = groundOf(r.current, ui.date), pro = groundOf(r.proposed, ui.date);
  if (!r.proposed || !r.current) return `Ground cover on ${d}: compare plans needs both a current and a proposed plan.`;
  if (!cur || !pro) return `What covers the ground on ${d}: not read yet. Compare plans shows both plans on this day.`;
  if (cur.state === pro.state) return `On ${d} both plans have ${GROUND_WORDS[cur.state]} on the ground.`;
  return `On ${d} the current plan has ${GROUND_WORDS[cur.state]} on the ground and the proposed plan has ${GROUND_WORDS[pro.state]}.`;
}
const chipFor = f => { const g = groundOf(f?.report?.[ui.planKind], ui.date); return g ? g.label : 'not read yet'; };

// ---- the page
function build(node) {
  node.innerHTML = `<div class="fw" id="fw">
  <header class="fw-hud" id="fwHud">
    <h1 class="sr" id="fwTitle" tabindex="-1">My farm</h1>
    <div class="fw-row">
      <div class="fw-pick"><label class="sr" for="fwField">Field</label><select id="fwField" class="fw-select"></select></div>
      <p class="fw-date" id="fwDate"><time id="fwTime"></time> <b id="fwLabel" class="fw-label"></b></p>
      <button type="button" class="btn primary lg fw-compare" id="fwCompare" aria-controls="fwPanel" aria-expanded="false">Compare plans</button>
    </div>
    <p class="fw-finding" id="fwFinding"></p>
  </header>
  <div class="fw-bar" id="fwBar" role="toolbar" aria-label="Board tools">
    <div class="fw-seg" role="group" aria-label="View">
      <button type="button" class="fw-segb" id="fwMapBtn" aria-pressed="true">Map</button><button type="button" class="fw-segb" id="fwThreeBtn" aria-pressed="false">3D</button>
    </div>
    <div class="fw-menuwrap"><button type="button" class="btn lg fw-tool" id="fwStyleBtn" aria-haspopup="true" aria-expanded="false" aria-controls="fwStyleMenu">Map style</button>
      <div class="fw-menu" id="fwStyleMenu" role="menu" hidden><button type="button" role="menuitemradio" data-look="board">Board</button><button type="button" role="menuitemradio" data-look="photo">Photo</button></div></div>
    <div class="fw-menuwrap"><button type="button" class="btn lg fw-tool" id="fwEditBtn" aria-haspopup="true" aria-expanded="false" aria-controls="fwEditMenu">Edit field</button>
      <div class="fw-menu" id="fwEditMenu" role="menu" hidden><button type="button" role="menuitem" data-edit="rename">Rename</button><button type="button" role="menuitem" data-edit="recent">Recently deleted</button><button type="button" role="menuitem" class="fw-danger" data-edit="delete">Delete</button></div></div>
  </div>
  <div class="fw-stage" id="fwStage">
    <div id="fwMap" class="fw-map" tabindex="-1"></div>
    <div id="fw3d" class="fw-3d" hidden></div>
    <p class="fw-status" id="fwStatus" role="status" hidden></p>
    <div class="fw-empty" id="fwEmpty" hidden><h2>Your fields appear here</h2><p>Open a field report and choose Add to my farm. The field joins this board with its current plan and the report's proposed plan.</p></div>
    <aside class="fw-panel" id="fwPanel" role="dialog" aria-labelledby="fwPanelTitle" hidden></aside>
  </div>
  <div class="fw-toast" id="fwToast" role="status"></div><div class="sr" id="fwSay" role="status" aria-live="polite"></div>
</div>`;
}
function wire() {
  const on = (sel, ev, fn) => $(sel, root).addEventListener(ev, fn);
  on('#fwField', 'change', e => select(e.target.value));
  on('#fwCompare', 'click', () => togglePanel('compare'));
  on('#fwMapBtn', 'click', () => setView('map')); on('#fwThreeBtn', 'click', () => setView('3d'));
  for (const [btn, menu] of [['#fwStyleBtn', '#fwStyleMenu'], ['#fwEditBtn', '#fwEditMenu']]) on(btn, 'click', () => toggleMenu(btn, menu));
  for (const b of root.querySelectorAll('[data-look]')) b.addEventListener('click', () => { setLook(b.dataset.look); closeMenus(); $('#fwStyleBtn', root).focus(); });
  for (const b of root.querySelectorAll('[data-edit]')) b.addEventListener('click', () => { const what = b.dataset.edit; closeMenus(); edit(what); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !root || root.closest('[hidden]')) return;
    if (!$('#fwStyleMenu', root).hidden || !$('#fwEditMenu', root).hidden) { const open = !$('#fwStyleMenu', root).hidden ? '#fwStyleBtn' : '#fwEditBtn'; closeMenus(); $(open, root).focus(); }
    else if (ui.panel) { const opener = ui.panel === 'compare' ? '#fwCompare' : '#fwEditBtn'; closePanel(); $(opener, root).focus(); }
  });
  document.addEventListener('click', e => { if (root && !e.target.closest?.('.fw-menuwrap')) closeMenus(); });
}
function toggleMenu(btn, menu) {
  const m = $(menu, root), was = !m.hidden; closeMenus();
  if (!was) { m.hidden = false; $(btn, root).setAttribute('aria-expanded', 'true'); m.querySelector('button')?.focus(); }
}
const closeMenus = () => { for (const [b, m] of [['#fwStyleBtn', '#fwStyleMenu'], ['#fwEditBtn', '#fwEditMenu']]) { $(m, root).hidden = true; $(b, root).setAttribute('aria-expanded', 'false'); } };

// ---- choosing
function select(id) { if (!S.getField(farm(), id)) return; ui.fieldId = id; const f = field(), ds = keyDates(f); if (!ds.some(d => d.date === ui.date)) ui.date = ds[0]?.date || ''; render(true); say(`${f.name} chosen.`); }
function setLook(look) { ui.look = look === 'photo' ? 'photo' : 'board'; applyLook(); render(); }
function setDate(i) { const ds = keyDates(field()); if (!ds[i]) return; ui.date = ds[i].date; render(); }
function setPlanKind(k) { ui.planKind = k === 'current' ? 'current' : 'proposed'; render(); }

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
      handle3d = await view3dFn(input, node, { onFallback: why => { handle3d = null; ui.view = 'map'; showStatus(why === 'no-webgl' ? 'This device cannot draw 3D. The board shows the same things.' : 'The 3D view could not load. The board is shown.'); render(); } });
      if (handle3d && handle3d.ok === false) throw new Error(handle3d.status || '3d');
      say('3D view.');
    } catch { handle3d = null; ui.view = 'map'; showStatus('The 3D view could not load. The board is shown.'); render(); }
  } else { handle3d?.dispose?.(); handle3d = null; ui.view = 'map'; render(); say('Map view.'); setTimeout(() => map?.invalidateSize(), 50); }
}
function showStatus(text) { const n = $('#fwStatus', root); n.textContent = text; n.hidden = !text; if (text) say(text); }

// ---- the drawer: Compare plans
function togglePanel(which) { ui.panel === which ? closePanel() : openPanel(which); }
function openPanel(which) { ui.panel = which; renderPanel(); const p = $('#fwPanel', root); p.hidden = false; $('#fwCompare', root).setAttribute('aria-expanded', String(which === 'compare')); $('#fwPanelTitle', root)?.focus(); }
function closePanel() { ui.panel = ''; $('#fwPanel', root).hidden = true; $('#fwCompare', root).setAttribute('aria-expanded', 'false'); }
function groundCard(f, kind) {
  const plan = f.report?.[kind], name = KINDS[kind];
  if (!plan) return `<section class="fw-card" aria-labelledby="fwc-${kind}"><h3 id="fwc-${kind}">${name}</h3><p class="fw-muted">No ${name.toLowerCase()} came from the report.</p></section>`;
  const g = groundOf(plan, ui.date), crops = [...new Set(plan.seasons.map(x => cropName(x.crop)))].join(' → ');
  const body = g ? `<p class="fw-state"><span class="fw-swatch" data-state="${g.state}" aria-hidden="true"></span><b>${esc(GROUND_WORDS[g.state][0].toUpperCase() + GROUND_WORDS[g.state].slice(1))}</b> <span class="fw-label">${g.label}</span></p>${g.note ? `<p>${esc(g.note)}</p>` : ''}`
    : `<p class="fw-state"><b>What covers the ground: not read yet</b></p><p class="fw-muted">The ground-cover reading has not arrived, so Crophalo shows no guess.</p>`;
  return `<section class="fw-card" aria-labelledby="fwc-${kind}"><h3 id="fwc-${kind}">${name}</h3><p class="fw-crops">${esc(crops)}</p>${body}</section>`;
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
  if (ui.panel !== 'compare' || !f) { p.innerHTML = ''; return; }
  const ds = keyDates(f), i = dateIndex(f), cur = ds[i];
  p.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">Compare plans · ${esc(f.name)}</h2><button type="button" class="btn lg" id="fwClose" aria-label="Close compare plans">Close</button></div>
  <div class="fw-stepper" role="group" aria-label="Date to compare">
    <button type="button" class="btn lg" id="fwPrev" ${i <= 0 ? 'disabled' : ''} aria-label="Previous date">‹</button>
    <div class="fw-steps">${ds.map((d, k) => `<button type="button" class="fw-step" data-i="${k}" aria-pressed="${k === i}"><span>${esc(d.label)}</span><small>${dayWords(d.date)}</small></button>`).join('')}</div>
    <button type="button" class="btn lg" id="fwNext" ${i >= ds.length - 1 ? 'disabled' : ''} aria-label="Next date">›</button>
  </div>
  <p class="fw-onedate">Same date for both plans: <time datetime="${esc(ui.date)}">${dayWords(ui.date)}</time>${cur?.hint ? ` · ${esc(cur.hint)}` : ''}</p>
  <div class="fw-cards">${groundCard(f, 'current')}${groundCard(f, 'proposed')}</div>
  <div class="fw-caveat">${caveat(f)}</div>${assumptions(f)}
  <p class="fw-note">Soil washes away most from bare or thinly covered ground in heavy rain. Living plants and residue slow it. This is a guide, not advice. You decide.</p>`;
  $('#fwClose', root).onclick = () => { closePanel(); $('#fwCompare', root).focus(); };
  $('#fwPrev', root).onclick = () => setDate(i - 1); $('#fwNext', root).onclick = () => setDate(i + 1);
  for (const b of p.querySelectorAll('.fw-step')) b.onclick = () => setDate(+b.dataset.i);
}

// ---- editing the field (the occasional tools)
function edit(what) {
  const f = field(), fm = farm(); if (!fm || (!f && what !== 'recent')) return;
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
  return g ? STATE_FILL[g.state] : UNREAD_FILL;
}
function drawMap(refit) {
  const fm = farm(); if (!map) return;
  layer.clearLayers();
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
    const token = L.divIcon({ className: 'fw-tokenwrap', html: `<button type="button" class="fw-token${chosen ? ' is-chosen' : ''}" data-field="${esc(f.id)}" aria-label="${esc(label)}" aria-pressed="${chosen}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c-3 4-6 6-6 10a6 6 0 0 0 12 0c0-4-3-6-6-10z"/></svg></button><span class="fw-plate"><b>${esc(f.name)}</b><small>${areaWords(f.area)}${f.estimated ? ' · estimated' : ''}</small></span>`, iconSize: [120, 90], iconAnchor: [60, 22] });
    L.marker(mid, { icon: token, keyboard: false }).addTo(layer).on('click', () => select(f.id));
  }
  const chosen = field();
  if (refit !== false && chosen) map.fitBounds(L.polygon(chosen.ring).getBounds().pad(0.6), { animate: false, maxZoom: 17 });
}
function initMap() {
  if (map) return;
  map = L.map($('#fwMap', root), { zoomControl: true, attributionControl: true, zoomSnap: 0.25, maxZoom: 19, minZoom: 3, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  map.setView([46, -80], 10); layer = L.layerGroup().addTo(map);
  $('#fwMap', root).addEventListener('click', e => { const t = e.target.closest?.('.fw-token'); if (t) select(t.dataset.field); });
  applyLook();
}

// ---- drawing the whole screen
export function render(refit = false) {
  if (!root) return;
  const fm = farm(), f = field();
  if (f) ui.fieldId = f.id; if (fm) ui.farmId = fm.id;
  const ds = keyDates(f); if (f && !ds.some(d => d.date === ui.date) && !(ui.date && f.report)) ui.date = ds[0]?.date || '';
  const sel = $('#fwField', root); sel.innerHTML = fm ? S.naturalSort(fm.fields).map(x => `<option value="${esc(x.id)}"${x.id === ui.fieldId ? ' selected' : ''}>${esc(x.name)} · ${areaWords(x.area)}${x.estimated ? ' (estimated)' : ''}</option>`).join('') : '';
  sel.disabled = !fm || !fm.fields.length;
  $('#fwTime', root).textContent = ui.date ? dayWords(ui.date) : ''; $('#fwTime', root).setAttribute('datetime', ui.date || '');
  $('#fwLabel', root).textContent = f && ui.date ? chipFor(f) : '';
  $('#fwFinding', root).textContent = finding(f);
  $('#fwCompare', root).disabled = !f?.report;
  $('#fwEmpty', root).hidden = !!f; $('#fwMap', root).hidden = ui.view === '3d' || !f; $('#fw3d', root).hidden = ui.view !== '3d';
  $('#fwMapBtn', root).setAttribute('aria-pressed', String(ui.view === 'map')); $('#fwThreeBtn', root).setAttribute('aria-pressed', String(ui.view === '3d'));
  $('#fwEditBtn', root).disabled = !f && !fm?.trash.length;
  for (const b of root.querySelectorAll('[data-edit=rename], [data-edit=delete]')) b.disabled = !f;
  $('[data-edit=recent]', root).disabled = !fm?.trash.length;
  if (map && f && ui.view === 'map') { drawMap(refit); map.invalidateSize(); }
  if (ui.panel === 'compare') renderPanel();
  if (ui.view === '3d' && f && handle3d?.update) { try { handle3d.update(S.farmFor3d(fm, { fieldId: ui.fieldId, planKind: ui.planKind, date: ui.date, ground: groundOf })); } catch { /* the board stays */ } }   // the farmer's camera angle is kept by the 3D view
}

// Show My farm in this node (the page's #view-farm). Called every time the view opens; the first call builds the screen.
export async function mountFarm(node) {
  if (builtFor !== node) { builtFor = node; root = node; build(node); wire(); map = null; layer = null; tiles = null; }
  store = read();
  if (!ui.farmId || !S.getFarm(store, ui.farmId)) { ui.farmId = store.active; ui.fieldId = ''; }
  if (!ui.look) ui.look = 'board';
  initMap();
  const f = field();
  if (f && !ui.date) ui.date = keyDates(f)[0]?.date || '';
  render(true);
  setTimeout(() => { map?.invalidateSize(); if (field()) drawMap(true); }, 60);
  if (ui.view === '3d') setView('3d');
  $('#fwTitle', node).focus?.();
}
export const _ui = ui;   // read by the browser checks
