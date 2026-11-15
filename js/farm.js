// My farm: the board on the real map (Leaflet). The first view holds the field picker, Compare plans, one date line, one finding, Map | 3D and More, the map with its
// ground-cover key and one time bar; the tools used now and then sit where they are used (Compare plans, the field's details, More). Loaded the first time "My farm" opens.
// Everything shown comes from the farm's own record (js/simulate.js) and the crop engine's groundOn, or says "not read yet". Works without signing in.
// Checked by scripts/e2e_myfarm_simple.mjs and scripts/e2e_farm.mjs (the browser) and scripts/test_sim.mjs (the logic).
import { esc, FARM_WORDS as FW } from './words.js';
import * as S from './simulate.js';
import { areaWords, areaUnit, setCountry } from './farmunits.js';
import * as crops from './crops.js';
import * as FE from './fieldedit.js';
import { renderFields } from './fieldstable.js';
import { startFarm } from './farmstart.js';
import { renderFarms, renderSettings } from './farmlist.js';
import { loadObserved, observedFor, forgetObserved, dayShort } from './farmobserved.js';
import { fitHeight } from './data.js';
import { stressOf, engineAdapter, dataFetch, readingsFor, whenSeries, planFigures, weatherNow, sheetFor, setDataEnv, setEngineClient, forgetReadings } from './farmchips.js';
import { alertJobs } from './remind-plan.js';
import { srcButton, initSources } from './srci.js';
import { cropsFor } from './farmhistory.js';
import { TIGHT } from './season.js';
import * as Y from './farmyears.js';
import { farmHas } from './farmhas.js';
import { hooks } from './hooks.js';   // the wrappers a motion module may take; with none, each one just runs its update
import { weakModel, weakSpotsHTML, loadWeakSpots, drawWeakSpots } from './weakspots-view.js';
export { setDataEnv, setEngineClient, forgetReadings, forgetObserved };
import { renderDrawer, resetDrawer, drawerState, startPlant, startCopy, ADDED_WORDS } from './fielddrawer.js';
import { shellHTML } from './farm3d-shell.js';
import { firstView, remember, recall, WORDS as RULE_WORDS } from './farm3d-rule.js';   // when 3D opens by itself, and what the board says when it does not
export { ADDED_WORDS };

const $ = (sel, node = document) => node.querySelector(sel);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayWords = iso => { const [y, m, d] = String(iso).split('-').map(Number); return y ? `${d} ${MON[m - 1]} ${y}` : ''; };
export const addDays = (iso, n) => { const t = new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5); return t.toISOString().slice(0, 10); };
const GROUND_WORDS = { crop: 'a growing crop', cover: 'a cover crop', residue: 'stubble', bare: 'bare soil' };
const STATE_FILL = { crop: '#7ed957', residue: '#cdb88a', bare: '#a47148', cover: '#9ccc65' }, UNREAD_FILL = '#dfe6d0', NAVY = '#0b2545', GOLD = '#ffc233';
const KINDS = { current: 'What you grow now', proposed: 'Plan to try' };

// ---- state: kept for the whole visit, so the field, the plan and the date survive switching between Map and 3D and back
const ui = { opener: '', history: false, mode: '', farmId: '', fieldId: '', planKind: 'proposed', date: '', view: 'map', look: 'board', panel: '', year: 0, editFrom: '' };
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
setCountry(() => farm()?.pin?.cc || '');   // sizes and temperatures follow Settings, or the farm's own country
const field = () => S.getField(farm(), ui.fieldId) || farm()?.fields[0] || null;
const cropName = id => cropsMod?.cropName?.(id, true) || (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');   // the short name: "Corn", not "Corn (maize)"
const cropInfo = id => { const c = cropsMod?.entryOf?.(id); return c ? { group: c.group || (c.garden ? 'tree' : 'other'), days: c.days || 365, sow: c.sow || 4, kind: c.garden ? 'tree' : c.type === 'cover' ? 'cover' : 'crop' } : null; };

// ---- the seams, each one function: setGround(groundOn) from the crop engine, setView3d(view3d) from the 3D farm (the app loads it lazily and hands it in), addFromReport() from a report
let keyFn = null, groundSet = false;
export function setGround(fn) { groundSet = true; groundFn = typeof fn === 'function' ? fn : null; if (root) render(); }
export function setKeyDates(fn) { keyFn = typeof fn === 'function' ? fn : null; if (root) render(); }
// The engine is found by its own name: its groundOn and keyDates are used unless a caller has handed in others.
// The reminders come from their own file when it is in the project; without it the board says "not connected" and nothing changes.
function loadReminders() { if (reminders) return; import('./remind-wire.js').then(m => { if (!reminders && typeof m.reminderApi === 'function') setReminders(m.reminderApi()); }).catch(() => { /* not connected */ }); }
function loadEngine() { import('./engine.js').then(m => { if (!groundSet && !groundFn) groundFn = m.groundOn; if (!keyFn) keyFn = m.keyDates; if (!S.engineReady()) S.setEngine(engineAdapter(readingsChanged)); if (root) render(); }).catch(() => { /* the plain days only */ }); }
export function setReminders(api) { reminders = api && typeof api.forField === 'function' ? api : null; if (root) render(); }   // { forField(farmId, fieldId) -> [{ id, title, when, done }], add({ title, when, kind, farmId, fieldId }) -> { ok, refused? } } from the reminders screen
export function setForecast(fn) { forecast = typeof fn === 'function' ? fn : null; if (root) render(); }   // fn(field) -> { alerts[{ id, text, remind }], checkedAt } or 'none'
export { farmHas };   // the report's "Back to My farm" asks js/farmhas.js directly, without loading this file
// The page hands in one function that shows another view of the app (the field search, the report); without it those two buttons are not drawn.
let go = null;
export function setGo(fn) { go = typeof fn === 'function' ? fn : null; if (root) render(); }
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
  store = rotationOfReport(res.store, res, payload); write();
  Object.assign(ui, { farmId: res.farmId, fieldId: res.fieldId, planKind: 'proposed', view: 'map', panel: '', date: payload.date && S.isDay(payload.date) ? payload.date : '' });
  const f = S.getField(S.getFarm(store, res.farmId), res.fieldId), dates = keyDates(f);
  if (!dates.some(d => d.date === ui.date)) ui.date = dates[0]?.date || '';   // the day the report arrives is rarely a day of the plan: start on the first of its dates
  loadEngine();
  if (root) render();
  if (opener) opener(); else document.getElementById('navFarm')?.click();
  return { farmId: res.farmId, fieldId: res.fieldId };
}

// The engine lists a rotation over three seasons or more ("corn, soybeans, corn" for corn and soybeans in turn). The report hands over the crops it really repeats
// ("slots"), so the field keeps the rotation the report was worked out for and My farm asks the engine the report's own question: its figures are then the report's.
// Only while the field's rotation is still the report's listing; a rotation the farmer chose stays as it is.
function rotationOfReport(st, res, payload) {
  const slots = payload?.current?.slots, listed = Array.isArray(payload?.current?.seasons) ? payload.current.seasons.map(x => x?.crop) : [];
  if (!Array.isArray(slots) || !slots.length || slots.length > 12 || !slots.every(id => typeof id === 'string' && crops.isCrop(id)) || !listed.length) return st;
  if (!listed.every((id, i) => id === slots[i % slots.length])) return st;   // the listing must be these crops in turn
  const fm = S.getFarm(st, res.farmId), plan = fm && S.planOf(fm, res.fieldId), own = JSON.stringify(plan?.seasons.map(x => x.crop) || []);
  if (!plan || own !== JSON.stringify(listed) || own === JSON.stringify(slots)) return st;
  return S.setPlan(st, res.farmId, res.fieldId, { start: plan.start, water: plan.water, seasons: slots.map(crop => ({ crop })) }, { now: Date.now(), cropOk: id => crops.isCrop(id) }).store ?? st;
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
  if (!f) return farm() ? 'No field on this farm yet. Choose More, then Add a field.' : '';
  const r = f.report;
  if (!r?.current && !r?.proposed) return `${f.name} has no plan from a report yet. Open its report and choose Add to My farm.`;
  const d = dayWords(ui.date), cur = groundOf(r.current, ui.date), pro = groundOf(r.proposed, ui.date);
  if (!r.proposed || !r.current) return `Compare plans needs a current and a proposed plan to show ${d}.`;
  if (!cur || !pro) return `The ground on ${d} could not be read. Compare plans shows both plans for this day.`;
  if (cur.state === null || pro.state === null) return `On ${d}: ${(cur.state === null ? cur : pro).note || 'outside the years of this plan.'}`;
  const why = decision(f, ui.date), end = why ? `; ${why}.` : '.';   // one sentence: what covers the ground today, then what the plan to try changes and when it must happen
  if (cur.state === pro.state) return `On ${d} both plans have ${GROUND_WORDS[cur.state]} on the ground${end}`;
  return `On ${d} the current plan has ${GROUND_WORDS[cur.state]} on the ground and the proposed plan has ${GROUND_WORDS[pro.state]}${end}`;
}
// The decision behind the comparison, from the plans' own dates only: the day the plan to try sows its new crop after the harvest before it, how many days that
// leaves before the crop's sowing window closes, and what the current plan leaves on the ground meanwhile. Said only while that change is in play (from the sowing
// before it to the new crop's harvest); '' when a plan has no window. A harvest planned after the window has closed is said as that, on every day. After the harvest a
// tight turn (under the engine's own TIGHT days from the harvest to the window's last day) is said as a squeeze, and a roomy one as how late the harvest may be.
const oneCrop = id => cropName(id).toLowerCase().replace(/beans$/, 'bean');   // "soybean harvest"
const daysFrom = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
function decision(f, date) {
  const seasons = f.report?.proposed?.seasons || [], last = seasons.at(-1), prev = seasons.at(-2), w = last?.window;
  if (!prev || !w || !S.isDay(w.earliest) || !S.isDay(w.latest) || !S.isDay(date) || date < prev.sow || date > last.harvest) return '';
  const name = cropName(last.crop).toLowerCase(), before = oneCrop(prev.crop);
  if (prev.harvest > w.latest) return `${name} has to be sown between ${dayWords(w.earliest)} and ${dayWords(w.latest)}, but the ${before} harvest is planned for ${dayWords(prev.harvest)}, so it may be hard to plant`;
  const sown = S.isDay(last.sow) && last.sow >= w.earliest && last.sow <= w.latest ? last.sow : '', left = sown ? daysFrom(sown, w.latest) : -1;   // the plan's own sowing day, inside the window
  const when = !sown ? `between ${dayWords(w.earliest)} and ${dayWords(w.latest)}` : left === 0 ? `on ${dayWords(sown)}, the day its sowing window closes`
    : `on ${dayWords(sown)}, ${left} day${left === 1 ? '' : 's'} before its sowing window closes on ${dayWords(w.latest)}`;
  if (date <= prev.harvest) {
    const same = f.report.current?.seasons?.find(s => s.harvest === prev.harvest);
    const meanwhile = same?.after === 'residue' && same.residueUntil ? `, while the current plan leaves stubble until ${dayWords(same.residueUntil)}` : same?.after === 'bare' ? ', while the current plan leaves the soil bare' : '';
    return `after ${date === prev.harvest ? `this ${before} harvest` : `the ${before} harvest on ${dayWords(prev.harvest)}`} the proposed plan sows ${name} ${when}${meanwhile}`;
  }
  const tight = daysFrom(prev.harvest, w.latest) < TIGHT;   // the report's own line for "only just suits"
  return `${name} is sown ${when}, ${tight || left < 1 ? `so a late ${before} harvest squeezes it` : `so a ${before} harvest up to ${left} day${left === 1 ? '' : 's'} late still leaves time to sow it`}`;
}
const chipFor = f => { const g = groundOf(f?.report?.[ui.planKind], ui.date); return g ? (g.state === null ? 'outside the plan' : g.label) : ''; };

// ---- the page
// The first view: the farm's name over the field picker, Compare plans, the one date line, the one finding, Map | 3D and More, then the map with its key and the time bar.
const item = (attrs, label) => `<button type="button" ${attrs}>${esc(label)}</button>`;
function build(node) {
  node.innerHTML = `<div class="fw" id="fw">
  <h1 class="sr" id="fwTitle" tabindex="-1">My farm</h1>
  <header class="fw-hud" id="fwHud">
    <div class="fw-pick">
      <p class="fw-farmname" id="fwFarmCap" hidden></p>
      <button type="button" class="btn fw-farmchip" id="fwFarmBtn" aria-haspopup="dialog" aria-controls="fwPanel" aria-expanded="false" hidden><span class="fw-farmchip-name"></span><i class="chev" aria-hidden="true"></i></button>
      <h2 class="fw-name" id="fwFieldName"></h2>
      <label class="sr" for="fwField">Field</label><select id="fwField" class="fw-select" hidden></select>
    </div>
    <p class="fw-headsub" id="fwSub"></p>
    <p class="fw-plan" id="fwPlan"></p>
    <p class="fw-next" id="fwNextJob"></p>
    <p class="fw-date" id="fwDate"><b class="fw-planname" id="fwPlanName"></b><span class="fw-dot" aria-hidden="true">·</span><time id="fwTime"></time><b id="fwLabel" class="fw-label"></b> <b id="fwObs" class="fw-label fw-obs" role="status" hidden></b></p>
    <p class="fw-finding" id="fwFinding"></p>
  </header>
  <div class="fw-bar" id="fwBar">
    <button type="button" class="btn primary lg fw-compare" id="fwCompare" aria-controls="fwPanel" aria-expanded="false">Compare plans</button>
    <button type="button" class="btn lg fw-tool" id="fwDetailsBtn" aria-controls="fwPanel" aria-expanded="false">${esc(FW.details)}</button>
    <div class="fw-seg" role="group" aria-label="View">
      <button type="button" class="fw-segb" id="fwMapBtn" aria-pressed="true">Map</button><button type="button" class="fw-segb" id="fwThreeBtn" aria-pressed="false">3D</button>
    </div>
    <div class="fw-menuwrap fw-morewrap"><button type="button" class="btn lg fw-tool fw-more" id="fwMoreBtn" aria-haspopup="menu" aria-expanded="false" aria-controls="fwMoreMenu">${esc(FW.more)}<i class="chev" aria-hidden="true"></i></button>
      <div class="fw-menu" id="fwMoreMenu" role="menu" aria-labelledby="fwMoreBtn" hidden>
        <div role="group" aria-labelledby="fwMoreH2"><p class="fw-menuh" id="fwMoreH2">${esc(FW.moreMap)}</p>${item('role="menuitemradio" data-look="photo" aria-checked="false"', FW.photo)}${item('role="menuitemradio" data-look="board" aria-checked="true"', FW.board)}</div>
        <div role="group" aria-labelledby="fwMoreH3"><p class="fw-menuh" id="fwMoreH3">${esc(FW.moreFarm)}</p>${item('role="menuitem" id="fwFieldsBtn"', FW.fields)}${item('role="menuitem" data-edit="add"', FW.add)}${item('role="menuitem" id="fwToolsBtn"', FW.tools)}</div>
      </div></div>
    <input type="file" id="fwFile" hidden aria-label="Choose a map file" accept=".geojson,.json,.kml,application/geo+json,application/json,application/vnd.google-earth.kml+xml">
  </div>
  <div class="fw-stage" id="fwStage">
    <div id="fwMap" class="fw-map" tabindex="-1"></div>
    <div id="fw3d" class="fw-3d" hidden></div>
    <details class="fw-key" id="fwKey" hidden><summary class="fw-keyh" id="fwKeyH">What the colours mean</summary><ul aria-labelledby="fwKeyH">
      <li data-k="crop"><i aria-hidden="true"></i><span>${esc(FW.keyPlants)}</span></li><li data-k="residue"><i aria-hidden="true"></i><span>${esc(FW.keyResidue)}</span></li><li data-k="bare"><i aria-hidden="true"></i><span>${esc(FW.keyBare)}</span></li></ul></details>
    <p class="fw-status" id="fwStatus" role="status" hidden></p>
    <div class="fw-empty" id="fwEmpty" hidden><h2>No field yet</h2><p>Your fields and their plans show here. Find your field, then choose Add to My farm on its report.</p><div class="fw-emptybtns"><button type="button" class="btn lg primary" id="fwEmptyFind" hidden>Find your field</button><button type="button" class="btn lg" id="fwEmptyAdd">Draw a field by hand</button></div></div>
    <div class="fw-editbar" id="fwEditBar" role="group" aria-label="Edit the field" hidden></div>
    <div class="fw-strip" id="fwStrip" role="group" aria-label="Time on the board" hidden>
      <button type="button" class="btn lg fw-stepm" id="fwMonthPrev" aria-label="Previous month"><span aria-hidden="true">‹</span></button>
      <input type="range" id="fwMonthSlider" min="0" max="11" step="1" value="0" list="fwKeyDays" aria-label="${esc(FW.timeLine)}" aria-describedby="fwTimeHelp"><datalist id="fwKeyDays"></datalist>
      <button type="button" class="btn lg fw-stepm" id="fwMonthNext" aria-label="Next month"><span aria-hidden="true">›</span></button>
      <p class="sr" id="fwTimeHelp">${esc(FW.timeHelp)}</p>
    </div>
    <p class="fw-ribbon" id="fwRibbon" hidden></p>
    <div class="fw-strip fw-yearbar" id="fwYear" role="group" aria-label="One year on the map" hidden>
      <div class="fw-yrow"><button type="button" class="btn lg" id="fwYearBack"><span aria-hidden="true">‹</span> Back to the board</button><button type="button" class="btn lg" id="fwYearPrev"><span aria-hidden="true">‹</span> Earlier</button><label class="fw-yearpick" for="fwYearPick">Year of harvest</label><select id="fwYearPick" class="fw-sel"></select><button type="button" class="btn lg" id="fwYearNext">Later <span aria-hidden="true">›</span></button><button type="button" class="btn lg" id="fwYearPlay">Play the years</button></div>
      <details class="fw-ycard" id="fwYearCard"><summary id="fwYearSum"></summary><div id="fwYearBody"></div></details>
    </div>
    <section class="fw-history" id="fwHistory" aria-label="Land history" hidden><div class="fw-history-bar"><button type="button" class="btn lg" id="fwHistoryBack">‹ Back to the board</button></div><div id="fwHistoryBody" class="fw-history-body"></div></section>
    <div class="fw-panel" id="fwPanel" role="dialog" aria-labelledby="fwPanelTitle" hidden></div>
  </div>
  <div class="fw-toast" id="fwToast" role="status"></div><div class="sr" id="fwSay" role="status" aria-live="polite"></div>
</div>`;
}
function wire() {
  new MutationObserver(() => behind()).observe($('#fwPanel', root), { attributes: true, attributeFilter: ['hidden', 'class'] });   // whatever opens or lowers a sheet, what it covers is put out of reach
  const on = (sel, ev, fn) => $(sel, root).addEventListener(ev, fn);
  on('#fwField', 'change', e => select(e.target.value));
  on('#fwMonthPrev', 'click', () => moveMonth(-1)); on('#fwMonthNext', 'click', () => moveMonth(1));
  on('#fwMonthSlider', 'input', e => { const f = field(); if (f && ui.date) { ui.date = dateAt(span(), +e.target.value); ui.dayOnly = true; render(); } });
  on('#fwMonthSlider', 'change', () => announceDay(`${S.monthWord(ui.date)}. `));
  on('#fwMonthSlider', 'keydown', e => { if ((e.key === 'PageUp' || e.key === 'PageDown') && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); moveSeason(e.key === 'PageUp' ? 1 : -1); } });   // a season at a time
  on('#fwYearBack', 'click', () => exitYear()); on('#fwYearCard', 'toggle', () => sizeYear()); on('#fwYearPrev', 'click', () => stepBy(-1)); on('#fwYearNext', 'click', () => stepBy(1)); on('#fwYearPlay', 'click', () => (yearTimer ? stopPlay(true) : playYears()));
  on('#fwYearPick', 'change', e => { stopPlay(); setYear(+e.target.value); });
  on('#fwHistoryBack', 'click', () => closeHistory());
  on('#fwCompare', 'click', () => togglePanel('compare')); on('#fwFarmBtn', 'click', () => togglePanel('farms')); on('#fwEmptyAdd', 'click', () => edit('newfarm')); on('#fwEmptyFind', 'click', () => go?.('setup'));
  on('#fwMapBtn', 'click', () => press('map')); on('#fwThreeBtn', 'click', () => press('3d'));   // the farmer's own press is remembered (an automatic fallback never writes it)
  on('#fw3d', 'click', e => { if (e.target.closest?.('.f3d-boot [data-act="back"]')) setView('map'); });   // Back to the Map on the skeleton, before the 3D look has loaded
  // the room the time bar takes at the foot of the board, measured as it is drawn (bigger text makes it taller): the 3D picture and its words stay above it
  if (typeof ResizeObserver === 'function') new ResizeObserver(([e]) => { const h = e.borderBoxSize?.[0]?.blockSize ?? 0, st = $('#fwStage', root).style; if (h > 0) st.setProperty('--strip-room', `${Math.ceil(h + 16)}px`); else st.removeProperty('--strip-room'); }).observe($('#fwStrip', root));   // a hidden bar takes no room
  // More: the field's, the map's and the farm's occasional tools, one tap away
  on('#fwMoreBtn', 'click', () => toggleMenu());
  on('#fwMoreMenu', 'keydown', menuKey);
  on('#fwMoreMenu', 'focusout', e => { if (e.relatedTarget && !$('.fw-morewrap', root).contains(e.relatedTarget)) closeMenus(); });   // the keyboard left the menu
  const pick = (sel, fn) => on(sel, 'click', () => { closeMenus(); fn(); });
  on('#fwDetailsBtn', 'click', () => { ui.opener = 'bar'; openPanel('field'); });
  pick('#fwFieldsBtn', () => openPanel('fields'));
  pick('#fwToolsBtn', () => openPanel('tools'));
  for (const b of root.querySelectorAll('#fwMoreMenu [data-look]')) b.addEventListener('click', () => { setLook(b.dataset.look); closeMenus(); focusOn('#fwMoreBtn'); });
  for (const b of root.querySelectorAll('#fwMoreMenu [data-edit]')) b.addEventListener('click', () => { const what = b.dataset.edit; closeMenus(); ui.editFrom = 'more'; edit(what); });
  $('#fwFile', root).addEventListener('change', e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) FE.startImport(editEnv(), file); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !root || root.closest('[hidden]')) return;
    if (!$('#fwMoreMenu', root).hidden) { closeMenus(); focusOn('#fwMoreBtn'); }
    else if (ui.year) { exitYear(); }
    else if (ui.history) { closeHistory(); }
    else if (ui.panel === 'field' && drawerState.sheet) { resetDrawer(); renderPanel(); $('#fwPanelTitle', root)?.focus(); }
    else if (ui.panel === 'field' && ui.opener === 'token') { const id = ui.fieldId; closePanel(); $(`.fw-token[data-field="${CSS.escape(id)}"]`, root)?.focus({ preventScroll: true }); }
    else if ((ui.panel === 'rename' || ui.panel === 'delete') && ui.editFrom === 'field') { const what = ui.panel; closePanel(); toField(what); }   // a field's tool goes back to the field's details
    else if (ui.panel) { const back = ui.panel === 'compare' ? '#fwCompare' : ui.panel === 'field' ? '#fwDetailsBtn' : ui.panel === 'farms' || ui.panel === 'settings' ? farmOpener() : '#fwMoreBtn'; closePanel(); focusOn(back); }
  });
  document.addEventListener('click', e => { if (root && !e.target.closest?.('.fw-morewrap')) closeMenus(); });
}
// Where the keyboard goes when something closes: back to what opened it. A button inside the closed More menu hands over to More itself.
const onScreen = n => !!n && n.isConnected && !!n.getClientRects().length && !n.disabled;
function focusOn(target) { const n = typeof target === 'string' ? $(target, root) : target; (onScreen(n) ? n : $('#fwMoreBtn', root))?.focus({ preventScroll: true }); }
const farmOpener = () => (onScreen($('#fwFarmBtn', root)) ? '#fwFarmBtn' : '#fwMoreBtn');
function toField(what) {   // back to the field's details, with the keyboard on the tool that was used
  if (!field()) { focusOn('#fwMoreBtn'); return; }
  openPanel('field'); const fold = $('.fw-editfold', root); if (fold) fold.open = true;   // the tool that was used is inside the Edit this field fold: it opens so the keyboard can stand on it
  const b = $(`#fwPanel [data-edit="${what}"]`, root); if (b) b.focus({ preventScroll: true });
}
const afterEdit = what => { if (ui.editFrom === 'field' && field()) toField(what); else focusOn('#fwMoreBtn'); };
const afterTool = () => { if (ui.editFrom === 'field' && field()) focusOn(`.fw-token[data-field="${CSS.escape(ui.fieldId)}"]`); else focusOn('#fwMoreBtn'); };   // after an outline tool the keyboard is on the field that changed
function toggleMenu() {
  const m = $('#fwMoreMenu', root), was = !m.hidden; closeMenus();
  if (was) return;
  m.hidden = false; $('#fwMoreBtn', root).setAttribute('aria-expanded', 'true'); menuBehind(m); placeMenu(m);
  m.querySelector('[role^=menuitem]:not(:disabled)')?.focus();
}
// Up and down move through the menu's items, Home and End go to the first and the last; Escape closes it (the board's own Escape handler).
function menuKey(e) {
  const items = [...$('#fwMoreMenu', root).querySelectorAll('[role^=menuitem]')].filter(b => !b.disabled), i = items.indexOf(document.activeElement);
  const to = e.key === 'ArrowDown' ? (i + 1) % items.length : e.key === 'ArrowUp' ? (i - 1 + items.length) % items.length : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : -1;
  if (to < 0 || !items.length) return;
  e.preventDefault(); items[to].focus();
}
// The menu opens under More, on its right edge, and slides only as far as it must to stay on the screen; it ends above the time bar and scrolls inside itself
// when it is longer, so it never lies over the bar's controls. Boxes are read on the screen and written in the page's own pixels (the text size zooms the page).
function placeMenu(m) {
  m.style.left = ''; m.style.right = ''; m.style.maxHeight = '';
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tz')) || 1, r = m.getBoundingClientRect(), strip = $('#fwStrip', root);
  if (r.left < 8) { m.style.right = 'auto'; m.style.left = '0'; }
  const end = strip && !strip.hidden && strip.getClientRects().length ? strip.getBoundingClientRect().top : innerHeight;
  m.style.maxHeight = `${Math.max(176, Math.floor((end - 8 - r.top) / z))}px`;
}
// An open menu lies over the board: until it closes only the menu can be reached, and a tap anywhere else closes it (on a phone it covers the top rows too).
function menuBehind(open) {
  const on = !!open;
  for (const n of [$('.fw-hud', root), $('#fwStage', root), ...[...$('#fwBar', root).children].filter(c => !open || !c.contains(open))]) if (n) n.inert = on;
}
const closeMenus = () => { const m = root && $('#fwMoreMenu', root); if (!m) return; m.hidden = true; $('#fwMoreBtn', root).setAttribute('aria-expanded', 'false'); menuBehind(null); behind(); };

// ---- time: one line of months over every season of both plans moves the ONE date of the board; ‹ and › step a month, Page Up and Page Down a season,
// and the Compare days are marks on the same line. The date itself is written once, in the date line at the top.
function moveSeason(n) { const f = field(); if (!f || !ui.date) return; ui.date = S.shiftSeason(ui.date, n); ui.dayOnly = true; render(); const lat = farm().pin.lat; announceDay(`${S.seasonLabel(lat, S.seasonOfDate(lat, ui.date))} season. `); }
function span() {   // the seasons the line covers: every sowing and harvest of both plans, and the day shown
  const fm = farm(), f = field(), lat = fm?.pin.lat ?? 0, days = [ui.date];
  for (const k of ['current', 'proposed']) for (const s of f?.report?.[k]?.seasons || []) days.push(s.sow, s.harvest);
  const ys = days.filter(S.isDay).map(d => S.seasonOfDate(lat, d));
  return { lat, from: ys.length ? Math.min(...ys) : 0, to: ys.length ? Math.max(...ys) : 0 };
}
const indexIn = (sp, iso) => (S.seasonOfDate(sp.lat, iso) - sp.from) * 12 + S.monthIndexOf(sp.lat, iso);
const dateAt = (sp, i) => S.monthDate(sp.lat, sp.from + Math.floor(i / 12), ((i % 12) + 12) % 12);
function moveMonth(n) {
  const f = field(); if (!f || !ui.date) return;
  const lat = farm().pin.lat; let sy = S.seasonOfDate(lat, ui.date), i = S.monthIndexOf(lat, ui.date) + n;
  if (i > 11) { i = 0; sy++; } else if (i < 0) { i = 11; sy--; }
  ui.date = S.monthDate(lat, sy, i); ui.dayOnly = true; render(); announceDay(`${S.monthWord(ui.date)}. `);
}
function renderStrip() {
  const strip = $('#fwStrip', root), fm = farm(), f = field(), show = !!(fm && f && ui.date && !ui.mode && !ui.history && !ui.year && ui.panel === 'compare' && !$('#fwPanel', root).hidden);
  strip.hidden = !show; $('#fwStage', root).classList.toggle('has-strip', show); $('#fw', root).classList.toggle('has-strip', show);
  if (!show) return;
  const sp = span(), slider = $('#fwMonthSlider', root);
  slider.max = String((sp.to - sp.from + 1) * 12 - 1); slider.value = String(indexIn(sp, ui.date)); slider.setAttribute('aria-valuetext', S.monthWord(ui.date));
  const marks = keyDates(f).filter(d => S.isDay(d.date)).map(d => `<option value="${indexIn(sp, d.date)}" label="${esc(d.label)}"></option>`).join(''), list = $('#fwKeyDays', root);
  if (list.innerHTML !== marks) list.innerHTML = marks;
  sizeStrip();
}
const sizeStrip = () => { const s = $('#fwStrip', root); if (s && !s.hidden && s.offsetHeight) $('#fw', root).style.setProperty('--striph', `${s.offsetHeight}px`); };   // the map's own buttons, the toast and the 3D view keep clear of the bar
addEventListener('resize', () => { if (root) sizeStrip(); });
// ---- the field tokens by keyboard: one in the Tab order; arrows go to the nearest field that way (within 60 degrees), Home and End to the first and last by name, Enter or Space opens the field's drawer
function tokenKey(e, t) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const fm = farm(), id = t.dataset.field, bearings = { ArrowUp: 0, ArrowRight: 90, ArrowDown: 180, ArrowLeft: 270 }, all = S.naturalSort(fm.fields), pt = f => S.interiorPoint(f.ring);
  let target = null;
  if (Object.hasOwn(bearings, e.key)) { const me = S.getField(fm, id); target = S.nearestInDirection({ at: pt(me) }, fm.fields.filter(f => f.id !== id).map(f => ({ id: f.id, at: pt(f) })), bearings[e.key]); }
  else if (e.key === 'Home') target = all[0]?.id; else if (e.key === 'End') target = all.at(-1)?.id;
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (ui.year) { selectInYear(id); return; } ui.opener = 'token'; select(id); openPanel('field'); return; }
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

// The farmer's press of Map or 3D is kept (js/farm3d-rule.js). My farm opens on the board, as its design says; it opens in 3D by itself only when the farmer's own last press was 3D
// and the device allows it, never because the device is strong. High contrast, or a weak device, gives the board with its sentence.
const press = v => { remember(globalThis.localStorage, v); return setView(v); };
const deviceFacts = () => ({ webgl: typeof globalThis.WebGLRenderingContext === 'function' || typeof globalThis.WebGL2RenderingContext === 'function', memoryGB: globalThis.navigator?.deviceMemory || 0,
  forcedColors: !!globalThis.matchMedia?.('(forced-colors: active)').matches, highContrast: document.documentElement.dataset.contrast === 'high', software: false, caveat: false });   // software and caveat are found out when 3D starts, and then the board is shown by the fallback
let ruleDone = false;
function openByRule() {   // once for each visit, when there is a field to show
  if (ruleDone || !field()) return; ruleDone = true;
  const v = firstView(deviceFacts(), recall(globalThis.localStorage));
  if (v.view === '3d' && !v.auto) ui.view = '3d'; else if (v.view !== '3d' && v.say) showStatus(v.say);
}
// ---- 3D: only when asked; the board never depends on it. The toolbar and a skeleton of the scene answer in the same moment as the tap, the scene is built
// without holding the page (a worker draws it where the browser can), Map and Back to the Map stop a build at any moment, and a failure is said in words on the Map.
const NO_3D = { 'no-webgl': 'This device cannot draw 3D. The board shows the same things.', 'context-lost': '3D paused: the device needed its graphics memory. The board is shown.', 'lost-twice': RULE_WORDS.twice, other: 'The 3D view could not load. The board is shown.' };
// The two 3D scenes of the motion pieces (the skeleton that fills in as the build goes, "Play the day"): their files come with the motion pieces, and the page turns them on with setScenes(true).
// Both loads are lazy and guarded, so a missing file changes nothing; the module names are built in code so a project without the files is not told it is missing them.
let scenes = false, skelFx = null, sunFx = null, sceneLoad = null;
export function setScenes(on, load) { scenes = !!on; sceneLoad = typeof load === 'function' ? load : null; }   // load(name) -> the module: a test hands in its own
const sceneModule = name => Promise.resolve().then(() => (sceneLoad ? sceneLoad(name) : import(`./macro-${name}.js`))).catch(() => null);
function endScenes() { skelFx?.dispose?.(); sunFx?.dispose?.(); skelFx = sunFx = null; }
let build3d = null, sent3d = '';   // the build under way ({ stop, why }), and the last field, plan, date and ground the 3D view was given
const input3d = () => ({ ...S.farmFor3d(farm(), { fieldId: ui.fieldId, planKind: ui.planKind, date: ui.date, ground: groundOf }), pastYear: Number.isInteger(ui.year) && ui.year > 0 ? ui.year : null });   // ui.year is the year being replayed, 0 when off and -1 while the years load; 3D then says "2012: past weather, not today"
function back3d(why) { endScenes(); build3d = null; handle3d?.dispose?.(); handle3d = null; $('#fw3d', root).replaceChildren(); ui.view = 'map'; showStatus(NO_3D[why] || NO_3D.other); render(); setTimeout(() => map?.invalidateSize(), 50); }
async function setView(v) {
  closeMenus();
  if (ui.year && v === '3d') exitYear({ quiet: true });
  if (v === '3d') {
    if (ui.view === '3d' && (handle3d || build3d)) return;   // already there, or on its way: a second tap does nothing
    const node = $('#fw3d', root), mine = { stop: new AbortController(), why: '' };
    build3d = mine; showStatus('');
    hooks.farmView(() => { ui.view = '3d'; node.innerHTML = shellHTML({ ids: 'f3dboot', compact: true, back: true }); render(); }, { to: '3d', stage: $('#fwStage', root), mapEl: $('#fwMap', root), handle: null });   // the skeleton, drawn in this same moment (with no motion module, now): no file has to load first
    if (scenes) sceneModule('skeleton').then(m => { if (m?.skeletonFades && build3d === mine) skelFx = m.skeletonFades(node); });   // before the build ends: it hears the build's steps
    say('Building the 3D view.');
    try {
      if (typeof view3dFn !== 'function') throw new Error('no view');   // the 3D look is handed in with setView3d(); the board never needs it
      const input = input3d(); sent3d = JSON.stringify(input);
      const h = await view3dFn(input, node, { motion: motionNow(), compact: true, offPage: true, refuseSoftware: true, signal: mine.stop.signal, onCancel: () => press('map'),
        onFallback: why => { if (build3d === mine) mine.why = why; else if (handle3d && ui.view === '3d') back3d(why); } });   // during the build its answer says why; later (the graphics memory taken back) the Map comes back
      if (build3d !== mine) { h?.dispose?.(); return; }   // the farmer went back to the Map while it was being built
      if (!h || h.ok === false) throw new Error(mine.why || h?.status || '3d');
      build3d = null; handle3d = h;
      if (scenes) sceneModule('sun').then(m => { if (m?.playDay && handle3d === h) sunFx = m.playDay(h, node); });   // once the 3D view is ready
      node.querySelector(':scope > .f3d-boot')?.remove();   // a 3D look that draws nothing of its own leaves no skeleton behind
      push3d();   // a date or plan chosen while it was built
      say('3D view ready.');
    } catch (e) { if (build3d === mine) back3d(e?.message); }
  } else {
    const had = $('#fw3d', root).contains(document.activeElement);   // Back to the Map pressed inside the 3D view: the keyboard lands on the Map button, not on the page
    endScenes(); build3d?.stop.abort(); build3d = null;
    const leaving = handle3d; handle3d = null;
    hooks.farmView(() => { leaving?.dispose?.(); $('#fw3d', root).replaceChildren(); ui.view = 'map'; render(); }, { to: 'map', stage: $('#fwStage', root), mapEl: $('#fwMap', root), handle: leaving });   // the settle may keep the 3D on screen until it calls update
    say('Map view.'); setTimeout(() => map?.invalidateSize(), 50);
    if (had) $('#fwMapBtn', root).focus();
  }
}
// The 3D view hears of a change only when what it shows would change: a new field, plan, date or ground, never the same answer twice.
function push3d() {
  if (ui.view !== '3d' || !handle3d?.update || !field()) return;
  try { const next = input3d(), key = JSON.stringify(next); if (key === sent3d) return; sent3d = key; handle3d.update(next); } catch { /* the board stays */ }
}
function showStatus(text) { const n = $('#fwStatus', root); n.textContent = text; n.hidden = !text; if (text) say(text); }

// ---- the drawer: Compare plans
function togglePanel(which) { ui.panel === which ? closePanel() : openPanel(which); }
function openPanel(which) { if (ui.year) exitYear({ quiet: true }); closeMenus(); ui.panel = which; $('#fwStage', root).classList.toggle('panel-wide', which === 'fields'); $('#fwPanel', root).classList.toggle('wide', which === 'fields'); renderPanel(); const p = $('#fwPanel', root); p.hidden = false; p.classList.remove('is-low'); $('#fwStage', root).classList.add('has-panel'); setTimeout(() => map?.invalidateSize(), 30); addLower(); renderStrip(); renderKey(); renderHead(); $('#fwDetailsBtn', root).setAttribute('aria-expanded', String(which === 'field')); $('#fwCompare', root).setAttribute('aria-expanded', String(which === 'compare')); $('#fwFarmBtn', root).setAttribute('aria-expanded', String(which === 'farms')); $('#fwPanelTitle', root)?.focus(); }
// On a phone the open sheet covers the board and the top rows, so what it covers is out of reach for the finger, the keyboard and a screen reader until the sheet is lowered or closed.
const phone = () => matchMedia('(max-width: 700px)').matches;
function behind() {
  const cover = !!ui.panel && !$('#fwPanel', root).hidden && phone() && !$('#fwPanel', root).classList.contains('is-low');
  for (const sel of ['.fw-hud', '.fw-bar', '#fwStage > .fw-map', '#fwStage > .fw-3d', '#fwStrip']) { const n = $(sel, root); if (n) n.inert = cover; }
}
addEventListener('resize', () => { if (root) behind(); });
function closePanel() { ui.panel = ''; ui.opener = ''; resetDrawer(); $('#fwPanel', root).hidden = true; $('#fwStage', root).classList.remove('has-panel'); setTimeout(() => map?.invalidateSize(), 30); $('#fwCompare', root).setAttribute('aria-expanded', 'false'); $('#fwDetailsBtn', root).setAttribute('aria-expanded', 'false'); $('#fwFarmBtn', root).setAttribute('aria-expanded', 'false'); renderStrip(); renderKey(); renderHead(); behind(); }
// On a phone the sheet can be lowered to a short bar so the 3D picture and the map can be seen while comparing.
function addLower() {
  const p = $('#fwPanel', root), head = p.querySelector('.fw-panel-head'); if (!head || head.querySelector('#fwLower')) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'fwLower'; b.className = 'btn lg fw-lower'; b.textContent = 'Lower'; b.setAttribute('aria-expanded', 'true'); b.setAttribute('aria-controls', 'fwPanel');
  b.onclick = () => { const low = p.classList.toggle('is-low'); b.textContent = low ? 'Raise' : 'Lower'; b.setAttribute('aria-expanded', String(!low)); behind(); };
  head.append(b);
}
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// What the field drawer is given: the farm's parts as one object, so the drawer itself fetches and stores nothing.
// The field's forecast as its details read it: the frost, heat, heavy rain, wind and storm alerts of the coming week by the reminders' own rules, or 'none' until it is read.
function forecastOf(f) {
  const fm = farm(); if (forecast) return forecast(f); if (!fm || !f) return 'none';
  const r = readingsFor(fm, f, readingsChanged), fc = r.forecast; if (!fc?.days?.length || !r.forecastAt) return 'none';
  const local = new Date(r.forecastAt + (fc.utcOffset || 0) * 1000).toISOString().slice(0, 16);   // the field's own clock, as the reminders count evenings
  const alerts = alertJobs(fc.days, local).map(j => ({ id: j.kind, text: `${j.title}: ${j.value}`, remind: reminders ? { title: j.title, when: j.when, kind: j.kind } : null }));
  return { alerts, checkedAt: `${dayWords(local.slice(0, 10))}, ${local.slice(11, 16)} at the field` };
}
const readingsNow = () => { const fm = farm(), f = field(); return fm && f ? { f, r: readingsFor(fm, f, readingsChanged) } : null; };
function drawerEnv() {
  return { node: $('#fwPanel', root), get: () => ({ store, farm: farm(), field: field() }), cropName, crops, reminders, forecast: forecastOf, today: isoToday, year: () => S.seasonNow(farm().pin.lat),
    weather: () => { const x = readingsNow(); return x ? weatherNow(x.r, x.f) : null; },   // the weather that was a chip on the first view: today's words, with their "i"
    sales: () => { const x = readingsNow(); return x ? sheetFor('sales', x.r, x.f, ui.planKind).lines.filter(l => !/^Not worked out/.test(l)) : []; },
    edit: what => { ui.editFrom = 'field'; edit(what); }, history: () => openHistoryTab(), weakHTML: f => weakSpotsHTML(weakModelFor(f)), weakOpen: f => ['reading', 'ok'].includes(weak.get(f.id)?.state), findWeak, settings: go ? () => go('info', 'settings') : null,
    toast, say, close: () => { const back = ui.opener === 'token' ? `.fw-token[data-field="${CSS.escape(ui.fieldId)}"]` : '#fwDetailsBtn'; closePanel(); focusOn(back); },
    commit: (next, words) => { const before = store; undo.push(before, words); store = next; later(); render(); toast(words, () => { store = before; later(); render(); if (ui.panel === 'field') renderPanel(); say('Undone'); }); } };
}
// A plan's card: its crops, what covers the ground on the day, then its figures (the score in the report's words, bare soil, past years), each with its "i".
const figCache = new WeakMap();
function figuresHTML(f, kind) {
  const r = readingsFor(farm(), f, readingsChanged), key = `${kind}|${f.report?.[kind]?.id || ''}`, mine = figCache.get(r) || figCache.set(r, {}).get(r);
  const figs = r.state === 'ok' ? (mine[key] ||= planFigures(r, f, kind)) : planFigures(r, f, kind), score = figs.find(x => x.id === 'score');   // worked out once for a settled reading: a month step draws the card again and must stay light   // the card shows the score chip only; bare soil and past years are under Show more
  if (score?.state === 'ok') return `<p class="fw-figline"><span class="fw-scorechip">${esc(score.value)}</span> ${score.src.length ? srcButton(score.src, score.note) : ''}</p>`;
  return figs.some(x => x.state === 'wait') ? `<p class="fw-muted fw-reading" role="status">Reading your field's figures…</p>` : '';
}
function groundCard(f, kind) {
  const plan = f.report?.[kind], name = KINDS[kind];
  if (!plan) return `<section class="fw-card" data-plan="${kind}" aria-labelledby="fwc-${kind}"><h3 id="fwc-${kind}">${name}</h3><p class="fw-muted">The report sent no plan here.</p></section>`;
  const g = groundOf(plan, ui.date), crops = [...new Set(plan.seasons.map(x => cropName(x.crop)))].join(' › '), role = kind === 'proposed' ? (plan.role === 'suggest' ? 'Our suggestion' : plan.role === 'chosen' ? 'You chose' : '') : '';
  const body = g && g.state === null ? `<p class="fw-state"><b>Outside this plan's years</b></p><p>${esc(g.note)}</p>` : g ? `<p class="fw-state"><span class="fw-swatch" data-state="${g.state}" aria-hidden="true"></span><b>${esc(GROUND_WORDS[g.state][0].toUpperCase() + GROUND_WORDS[g.state].slice(1))}</b> <span class="fw-label">${g.label}</span></p>`
    : `<p class="fw-state"><b>The ground could not be read for this day.</b></p>`;
  return `<section class="fw-card" data-plan="${kind}" aria-labelledby="fwc-${kind}"><h3 id="fwc-${kind}">${name}</h3>${role ? `<p class="fw-role">${role}</p>` : ''}<p class="fw-crops">${esc(crops)}</p>${body}${figuresHTML(f, kind)}</section>`;
}
function caveat(f) {
  const p = f.report?.proposed; if (!p?.seasons?.length) return '';
  const last = p.seasons[p.seasons.length - 1], prev = p.seasons[p.seasons.length - 2], w = last.window, name = cropName(last.crop).toLowerCase(), prevName = prev ? cropName(prev.crop).toLowerCase().replace(/beans$/, 'bean') : 'earlier';
  if (!w) return '';
  const late = prev && prev.harvest > w.latest, tail = late ? `The ${esc(prevName)} harvest is planned for ${dayWords(prev.harvest)}, so it may be too late.` : `A late ${esc(prevName)} harvest squeezes it.`;
  return `<p class="fw-window">Sowing window for ${esc(name)}: ${dayWords(w.earliest)} to ${dayWords(w.latest)}. ${tail} ${srcButton(['power'], 'From the crop guide and this field\'s own frost and heat record.')}</p>`;
}
const assumedLine = f => `Assumed: ${f.soil?.assumed ? 'loam' : f.soil?.texture ? esc(f.soil.texture) : 'loam'} soil, ${farm().practice.irrigation === 'none' ? 'rain only' : farm().practice.irrigation === 'limited' ? 'a little watering' : 'watering as needed'}${f.estimated ? ', outline estimated' : ''}.`;
// Under "Show more": one sentence each, only the ones that have something to say.
function moreLines(f) {
  const cur = f.report?.current, pro = f.report?.proposed, out = [], num = v => Number.isFinite(v) ? String(Math.round(v * 10) / 10).replace(/\.0$/, '') : '', st = stressOf(pro);
  if (pro?.why) out.push(`Why try it: ${esc(pro.why)}`);
  if (Number.isFinite(cur?.bareMonths) && Number.isFinite(pro?.bareMonths)) out.push(`Bare soil: about ${num(cur.bareMonths)} months a year now, ${num(pro.bareMonths)} with the plan to try.`);
  if (st) out.push(`Past years: no crop stress in ${st.ok} of ${st.of} years with the plan to try.`);
  const o = observedNow(); if (o?.state === 'ok') out.push(`Seen from space: ${esc(o.line.replace(/^Seen from space on /, 'the newest clear NASA picture is from '))}`);
  out.push(assumedLine(f));
  return out;
}
function updateCompareDay() {
  const p = $('#fwPanel', root), f = field(), cards = p && $('.fw-cards', p); if (!f || !cards) { renderPanel(); return; }
  cards.innerHTML = `${groundCard(f, 'current')}${groundCard(f, 'proposed')}`;
  const i = dateIndex(f); for (const b of p.querySelectorAll('.fw-step')) b.setAttribute('aria-pressed', String(+b.dataset.i === i));
}
function renderPanel() {
  const p = $('#fwPanel', root), f = field(), had = document.activeElement, fig = had?.closest?.('.fw-card[data-plan] [data-fig]');
  const keep = p.contains(had) ? (had.id ? '#' + had.id : had.dataset?.i != null ? `.fw-step[data-i="${had.dataset.i}"]` : had.dataset?.edit ? `[data-edit="${had.dataset.edit}"]` : fig && had.classList.contains('srci') ? `.fw-card[data-plan="${fig.closest('.fw-card').dataset.plan}"] [data-fig="${fig.dataset.fig}"] .srci` : '') : '';
  try { renderPanelNow(p, f); } finally { if (keep) $(`#fwPanel ${keep}`, root)?.focus(); }
}
const readingsChanged = () => { if (root && ['compare', 'field', 'fields'].includes(ui.panel) && !$('#fwPanel', root).hidden && !(ui.panel === 'field' && drawerState.sheet)) renderPanel(); };   // the figures and the weather arrive after the first view; a sheet being filled in is left alone
// Farm tools: what is used now and then, one level in. Each button does what its menu item did.
function renderTools(p) {
  const fm = farm(), f = field(), tool = (id, label, off) => `<button type="button" class="btn lg fw-row" data-tool="${id}"${off ? ' disabled' : ''}>${esc(label)}</button>`;
  p.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">${esc(FW.tools)}</h2><button type="button" class="btn lg" id="fwClose">Close</button></div>
  <div class="fw-list fw-tools">${tool('farms', FW.farms)}${tool('newfarm', FW.newFarm)}${tool('import', FW.importFile)}${tool('split', FW.split + ' a field', !f)}${tool('copy', FW.copyPlan, !f || fm.fields.length < 2 || !S.planOf(fm, f.id))}${tool('savemap', FW.saveMap, !f)}${tool('savetable', FW.saveTable, !f)}${tool('recent', FW.recent, !fm?.trash.length)}</div>`;
  $('#fwClose', root).onclick = () => { closePanel(); focusOn('#fwMoreBtn'); };
  for (const b of p.querySelectorAll('[data-tool]')) b.onclick = () => { const what = b.dataset.tool; if (what === 'farms') { openPanel('farms'); return; } if (what === 'copy') { closePanel(); ui.opener = 'more'; openPanel('field'); startCopy(drawerEnv()); return; } closePanel(); ui.editFrom = 'more'; edit(what); };
}
function renderPanelNow(p, f) {
  if (ui.panel === 'field' && f) { renderDrawer(drawerEnv()); return; }
  if (ui.panel === 'fields' && fm0()) { renderFields(tableEnv()); return; }
  if (ui.panel === 'tools') { renderTools(p); return; }
  if (ui.panel === 'farms') { renderFarms(farmsEnv()); return; }
  if (ui.panel === 'settings') { renderSettings(farmsEnv()); return; }
  if (ui.panel !== 'compare' || !f) { if (!['rename', 'delete', 'recent', 'import', 'add', 'confirm', 'newfarm', 'farms', 'settings'].includes(ui.panel)) p.innerHTML = ''; return; }
  const ds = keyDates(f), i = dateIndex(f), r = readingsFor(farm(), f, readingsChanged), last = f.report?.proposed?.seasons?.at(-1), lastName = last ? cropName(last.crop) : '';
  const dayLabel = d => d.id === 'establish' ? `${lastName} sown` : d.id === 'spring' ? `${lastName} in spring` : d.label;   // the engine's labels, in plain words
  p.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">Compare plans · ${esc(f.name)}</h2><button type="button" class="btn lg" id="fwClose" aria-label="Close compare plans">Close</button></div>
  <div class="fw-show" role="group" aria-labelledby="fwShowL"><p class="fw-showl" id="fwShowL" aria-label="${esc(FW.showPlan)}">Show on the map:</p><div class="fw-seg">${['current', 'proposed'].map(k => `<button type="button" class="fw-segb" id="${k === 'current' ? 'fwCurBtn' : 'fwPropBtn'}" data-kind="${k}" aria-pressed="${ui.planKind === k}"${f.report?.[k] ? '' : ' disabled'}>${KINDS[k]}</button>`).join('')}</div></div>
  <div class="fw-stepper" role="group" aria-label="Key days"><div class="fw-steps">${ds.map((d, k) => `<button type="button" class="fw-step" data-i="${k}" aria-pressed="${k === i}"><span>${esc(dayLabel(d))}</span><small>${dayWords(d.date)}</small></button>`).join('')}</div></div>
  <div class="fw-cards">${groundCard(f, 'current')}${groundCard(f, 'proposed')}</div>${r.state === 'failed' && r.reason ? `<p class="fw-muted fw-figwhy">The plan figures could not be read. Try again later.</p>` : ''}
  <div class="fw-caveat">${caveat(f)}</div>
  <details class="fw-fold fw-moreplan"><summary>Show more</summary>${moreLines(f).map(l => `<p>${l}</p>`).join('')}</details>
  <p class="fw-note">Crophalo is a guide. You decide what to plant.</p>
  <p class="fw-muted fw-changeplan">To change the plan, pick another strategy in the field report.</p>${go ? `<p><button type="button" class="btn lg" id="fwChangePlan">Open the field report</button></p>` : ''}`;
  $('#fwClose', root).onclick = () => { closePanel(); $('#fwCompare', root).focus(); };
  $('#fwChangePlan', root)?.addEventListener('click', () => go?.('report'));
  for (const b of p.querySelectorAll('.fw-step')) b.onclick = () => setDate(+b.dataset.i);
  for (const b of p.querySelectorAll('button[data-kind]')) b.onclick = () => setPlanKind(b.dataset.kind);   // the plan the map and 3D show is chosen here, beside the two plans
}

// ---- editing the field (the occasional tools)
let editLayer = null;
function editEnv() {
  const p = $('#fwPanel', root);
  return { L, map, layer: editLayer, bar: $('#fwEditBar', root), panel: p, get: () => ({ store, farm: farm(), field: field() }), cropName, units: () => areaUnit(), toast, say,
    commit: (next, words) => { const before = store; undo.push(before, words); store = next; later(); render(); toast(words, () => { store = before; later(); render(true); say('Undone'); }); },
    finish: lost => { ui.mode = ''; render(true); if (ui.panel !== 'field') afterTool(); if (lost) say(lost); },
    startDraw: () => enterMode('draw', FE.startDraw), chooseFile: () => $('#fwFile', root).click(),
    afterAdd: id => { ui.mode = ''; FE.hideBar(editEnv()); select(id); resetDrawer(); ui.panel = 'field'; $('#fwPanel', root).hidden = false; startPlant(drawerEnv()); },
    openPanel: which => { ui.panel = which; p.hidden = false; }, closePanel: keep => { closePanel(); if (keep !== true) focusOn('#fwMoreBtn'); }, select: id => { if (id) select(id); } };
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
  const o = observedFor(entry.answer, ui.date, { waiting: entry.waiting }), w = entry.answer?.window;
  if (o.state === 'outside' && S.isDay(w?.last) && ui.date > w.last) {   // after the pictures: name the newest clear picture there is, never the end of the days searched
    const newest = (Array.isArray(entry.answer.passes) ? entry.answer.passes : []).filter(x => S.isDay(x?.date) && Number.isFinite(x.ndvi)).map(x => x.date).sort().at(-1);
    return { ...o, line: newest ? `Observed: not yet. ${dayShort(ui.date)} is after NASA's newest clear picture of this field (${dayShort(newest)}), so only the plan speaks for that day.` : `Observed: not yet. NASA has no clear picture of this field up to ${dayShort(w.last)}, so only the plan speaks for ${dayShort(ui.date)}.` };
  }
  return o;
}
// "Observed" is answered in Compare plans: the card "Observed from space" says it, on every day (a clear picture, looking, not read, not yet, none).
function renderObs() {
  const n = $('#fwObs', root), o = ui.date ? observedNow() : null;
  n.hidden = true; if (o) { n.textContent = o.chip; n.dataset.state = o.state; n.title = o.line; }   // the badge no longer stands beside the date (less to read): the answer is in Compare plans' "Observed from space" card
}
// The replay of a field's crops on the field's own recorded weather: the same one the History page shows, so the board and the page cannot disagree.
async function buildCrops(fm, f, r) {
  const [fit, season] = await Promise.all([import('./fit.js'), import('./season.js')]);
  const elev = Number.isFinite(f.terrain?.hMin) && Number.isFinite(f.terrain?.hMax) ? (f.terrain.hMin + f.terrain.hMax) / 2 : null, series = elev != null && r.series ? fitHeight(r.series, elev) : r.series;   // the field's own height, when it is 100 m or more off the weather cell
  const crops = cropsFor(fm, f, series, { floweringOf: id => season.SEASON?.[id]?.fl, cropOf: id => crops_.cropOf(id), cropName: (id, short) => cropName(id, short), holdOf: t => fit.WATER_HOLD[t] ?? 150, irrigationMm: l => fit.IRRIGATION_MM[l] ?? 0 });
  return { series, crops };
}
// ---- Land history: the history page, with the field's own recorded weather and the replay of each crop of its plan; the board is where the farm reopens
let historyHandle = null;
async function openHistoryTab() {
  const fm = farm(), f = field(); if (!fm || !f) return;
  if (ui.year) exitYear({ quiet: true });
  closeMenus();
  const body = $('#fwHistoryBody', root); body.innerHTML = '<p class="fw-muted">Reading the weather record of this field…</p>';
  hooks.farmView(() => { closePanel(); ui.history = true; render(); $('#fwHistory', root).hidden = false; $('#fwHistoryBack', root).focus(); }, { to: 'history', from: 'board', stage: $('#fwStage', root), mapEl: $('#fwMap', root), pane: $('#fwHistory', root) });   // Land history is the past: a motion module brings it in from the left
  say('Land history.');
  const r = await whenSeries(readingsFor(fm, f));
  if (!ui.history) return;
  try {
    const [view, built] = await Promise.all([import('./history-view.js'), buildCrops(fm, f, r)]), { series, crops } = built;
    const slope = f.marks?.slope ?? f.terrain?.slope, fields = [{ name: f.name, slope: Number.isFinite(slope) ? { words: `${slopeWordsOf(slope)} (${slope.toFixed(1)}%)${f.marks?.slope != null ? ', from you' : ''}` } : null, marks: [] }];
    historyCtx = { fm, f, series, climate: r.climate, crops, fields, view };
    showHistory();
    satelliteLines(f); grewLines(f, fm);
    const plan = f.report?.[ui.planKind];   // opening the land history marks the plan as checked against the past: its id and the day
    if (plan?.id) { store = S.setFarmPrefs(store, fm.id, { checked: `${plan.id}@${new Date().toISOString().slice(0, 10)}` }).store; later(); }
  } catch { body.innerHTML = '<p class="fw-muted">The land history could not load. The board is shown.</p>'; }
}
let historyCtx = null;
// "What this field grew": the national crop map by year at the field's own points, in its own card; one honest waiting line first, then the answer (kept for the visit).
async function grewLines(f, fm) {
  const handle = historyHandle; if (!handle?.model || !handle.redraw) return;
  const G = await import('./grew.js'), cc = String(fm?.pin?.cc || '').toUpperCase(), put = html => { if (historyHandle !== handle) return; handle.model.extras = { ...handle.model.extras, grewHTML: html }; handle.redraw(); };
  if (cc !== 'US' && cc !== 'CA') { put(G.grewHTML(G.grewModel({ state: 'outside' }))); return; }
  const [lat, lon] = S.interiorPoint(f.ring), pinOnly = !!f.estimated;
  put(G.grewHTML(G.grewModel({ state: 'reading' })));
  const answer = await G.loadGrew({ lat, lon, country: cc, ring: pinOnly ? null : f.ring, fetchFn: dataFetch() });
  put(G.grewHTML(G.grewModel({ state: 'ok', answer, country: cc, pinOnly })));
}
// "What satellites saw": the lines whose data code is in the project (GRACE-FO water storage, HLS greenness, ECOSTRESS ground temperature), read in the background after the page is drawn; each says "not read yet" until its answer is in.
async function satelliteLines(f) {
  const handle = historyHandle; if (!handle?.model || !handle.redraw) return;
  const [lat, lon] = S.interiorPoint(f.ring), loc = { lat, lon };
  try {
    const D = await import('./satellites2-data.js'), get = dataFetch(), say2 = w => ({ words: w.lines.slice(0, 2).join(' ') });
    const [grace, hls, eco] = await Promise.all([D.loadGrace(loc, get), D.loadHls(loc, get), D.loadEco(loc, get)]);
    if (historyHandle !== handle) return;   // the page was left meanwhile
    handle.model.extras = { ...handle.model.extras, grace: say2(D.graceWords(grace)), hls: say2(D.hlsWords(hls)), eco: say2(D.ecoWords(eco)) }; handle.redraw();
  } catch { /* the lines stay empty */ }
}
function showHistory() {
  const c = historyCtx; if (!c || !ui.history) return;
  const body = $('#fwHistoryBody', root);
  historyHandle?.destroy?.();
  historyHandle = c.view.openHistory(body, { farm: { name: c.fm.name, place: c.fm.pin.label || '', lat: c.fm.pin.lat, lon: c.fm.pin.lon }, fields: c.fields, series: c.series, climate: c.climate, crops: c.crops, onAhead: aheadFn ? showAhead : null, onYear: enterYear });
  $('#fwHistoryBar', root)?.removeAttribute('hidden');
}
let aheadFn = null;   // the Look ahead page is a separate piece: it hands in one function that opens it (setAhead), and its button shows only then
export function setAhead(fn) { aheadFn = typeof fn === 'function' ? fn : null; }
// Look ahead: the page of what the next weeks, the season and the years may bring, opened from the History page; its own Back returns to the History page.
// The function gets the container and what the page needs of the field; it returns a handle with destroy().
async function showAhead() {
  const c = historyCtx; if (!c || !ui.history || !aheadFn) return;
  const body = $('#fwHistoryBody', root); body.innerHTML = '<p class="fw-muted">Opening Look ahead…</p>';
  try {
    const f = c.f, [lat, lon] = S.interiorPoint(f.ring), plan = f.report?.current, first = plan?.seasons?.[0], today = new Date().toISOString().slice(0, 10);
    historyHandle?.destroy?.(); historyHandle = null;
    const handle = await aheadFn(body, { fetch: dataFetch(), field: { name: f.name, lat, lon, elev: Number.isFinite(f.terrain?.hMin) ? (f.terrain.hMin + f.terrain.hMax) / 2 : NaN },
      plan, series: c.series, today, planName: plan?.name || 'Your plan', year: first ? String(first.year) : '', youngCrop: first ? `young ${cropName(first.crop).toLowerCase()}` : 'young crop', hardLine: '−2 °C', hardLineC: -2, onBack: () => { handle?.destroy?.(); showHistory(); $('#fwHistoryBack', root)?.focus(); } });
    historyHandle = handle; say('Look ahead.');
  } catch { showHistory(); toast('Look ahead could not load.'); }
}
const crops_ = crops;
const slopeWordsOf = pct => pct < 2 ? 'nearly flat' : pct < 6 ? 'gently sloping' : pct < 12 ? 'moderately sloping' : 'steep';
function closeHistory() {
  historyHandle?.destroy?.(); historyHandle = null;
  hooks.farmView(() => { ui.history = false; $('#fwHistory', root).hidden = true; scrollTo(0, 0); render(); focusOn('#fwMoreBtn'); }, { to: 'board', from: 'history', stage: $('#fwStage', root), mapEl: $('#fwMap', root), pane: $('#fwHistory', root) });
  say('The board.');
}
// ---- Weak spots in this field: asked only when the farmer presses "Find weak spots"; the answer is kept for the visit; the spots are drawn on the board.
const weak = new Map();   // field id -> { state, answer }
const weakModelFor = f => (f.estimated ? weakModel({ state: 'estimated' }) : weakModel({ state: weak.get(f.id)?.state || 'idle', answer: weak.get(f.id)?.answer }));
async function findWeak() {
  const f = field(); if (!f || f.estimated || weak.get(f.id)?.state === 'reading') return;
  const [lat, lon] = S.interiorPoint(f.ring); weak.set(f.id, { state: 'reading' }); if (ui.panel === 'field') renderPanel(); say('Reading satellite pictures of this field.');
  const answer = await loadWeakSpots({ lat, lon, ring: f.ring, fetchFn: dataFetch() });
  weak.set(f.id, { state: 'ok', answer }); if (ui.panel === 'field') renderPanel(); render(); say(weakModelFor(f).lines[0]);
}
// ---- One year on the map: from the History page, each field token takes its verdict for one weather year (the History page's own replay, never a second one), under a ribbon that says it is the past.
// Play steps through the years and can always be paused; under Still motion it does not play by itself; Escape and Back leave it, and the board comes back on today's date.
const VERDICT_ICON = { fine: 'M9.5 17.2 4.8 12.5l1.9-1.9 2.8 2.8 7.8-7.8 1.9 1.9z', close: 'M12 3 2 21h20L12 3zm-1 7h2v5h-2v-5zm0 6h2v2h-2v-2z', hurt: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z', none: 'M5 11h14v2H5z' };
const YEAR_STEP_MS = 2500;
let yearData = null, yearTimer = 0, yearView = null, yearPrevView = 'map';
const yearNow = () => { if (!ui.year || !yearData) return null; if (yearView?.year !== ui.year || yearView.src !== yearData) yearView = { ...Y.yearView(yearData.fieldCrops, ui.year), src: yearData }; return yearView; };
const yearField = id => yearNow()?.fields.find(x => x.id === id) || null;
async function enterYear(mode) {
  const fm = farm(); if (!fm || !ui.history) return;
  historyHandle?.destroy?.(); historyHandle = null; ui.history = false; $('#fwHistory', root).hidden = true;
  yearData = null; yearView = null; ui.year = -1; yearPrevView = ui.view; $('#fwYearPick', root).innerHTML = ''; scrollTo(0, 0); if (ui.view === '3d') await setView('map');   // the board, not the History page's scroll place; the year is shown on the map
  render(); say('One year on the map. Reading the weather of each field.');
  const list = [];
  for (const f of S.naturalSort(fm.fields)) { const r = await whenSeries(readingsFor(fm, f)); if (!ui.year) return; try { list.push({ id: f.id, name: f.name, crops: (await buildCrops(fm, f, r)).crops }); } catch { list.push({ id: f.id, name: f.name, crops: { ok: false, reason: 'This field’s weather could not be read.' } }); } }
  if (!ui.year) return;
  const years = Y.yearsIn(list); yearData = { fieldCrops: list, years };
  const pick = $('#fwYearPick', root); pick.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  $('#fwYearCard', root).open = false;   // the year card starts closed
  if (!years.length) { ui.year = -1; render(); say('No season of this farm could be judged on the weather record.'); $('#fwYearBack', root).focus({ preventScroll: true }); return; }
  if (mode === 'play') { ui.year = Y.playOrder(years)[0]; render(); $('#fwYearPlay', root).focus({ preventScroll: true }); playYears(true); return; }
  ui.year = years[0]; render(); say(yearNow().sentence); pick.focus({ preventScroll: true });
}
function setYear(y) { if (!yearData || !yearData.years.includes(y)) return; ui.year = y; render(); say(yearNow().sentence); }
function stepBy(by) { stopPlay(); const n = Y.stepYear(yearData?.years || [], ui.year, by); if (n != null) setYear(n); else say(by < 0 ? 'This is the first year of the record.' : 'This is the newest year judged.'); }
function playYears(fromStart = false) {
  if (!yearData?.years.length) return;
  if (motionNow() === 'reduce') { say('Motion is set to Still, so the years do not play by themselves. Use Earlier and Later.'); return; }
  const order = Y.playOrder(yearData.years);
  if (!fromStart && ui.year === order.at(-1)) { ui.year = order[0]; render(); say(yearNow().sentence); }
  else if (fromStart) say(yearNow().sentence);
  clearInterval(yearTimer); yearTimer = setInterval(() => { const n = Y.stepYear(yearData.years, ui.year, 1); if (n == null) { stopPlay(true, 'The years have all been shown.'); return; } setYear(n); }, YEAR_STEP_MS);
  renderYear();
}
function stopPlay(announce = false, words = '') { if (yearTimer) { clearInterval(yearTimer); yearTimer = 0; renderYear(); if (announce) say(words || `Paused on ${ui.year}.`); } }
function selectInYear(id) { if (!S.getField(farm(), id)) return; ui.fieldId = id; render(true); const yf = yearField(id); say(yf ? Y.tokenLabel(yf, ui.year) : `${field()?.name} chosen.`); }
function exitYear({ quiet = false } = {}) {
  if (!ui.year) return; stopPlay(); ui.year = 0; yearData = null; yearView = null;
  ui.date = new Date().toISOString().slice(0, 10);   // the board comes back on today's date
  $('#fwYearCard', root).open = false;
  if (!quiet && yearPrevView === '3d') setView('3d');
  render(true); if (!quiet) { focusOn('#fwMoreBtn'); say('The board, on today’s date.'); }
}
function renderYear() {
  const bar = $('#fwYear', root), rib = $('#fwRibbon', root), on = !!ui.year;
  bar.hidden = !on; rib.hidden = !on; $('#fwStage', root).classList.toggle('has-year', on); $('#fw', root).classList.toggle('in-year', on);
  if (!on) return;
  const v = yearNow(), loading = !yearData;
  requestAnimationFrame(sizeYear);
  rib.textContent = loading || !yearData.years.length ? Y.RIBBON : `${Y.RIBBON} · seasons harvested in ${ui.year}`;
  for (const id of ['#fwYearPrev', '#fwYearNext', '#fwYearPick', '#fwYearPlay']) $(id, root).disabled = loading || !yearData.years.length;
  if (loading) { $('#fwYearSum', root).textContent = 'Reading the weather of each field…'; $('#fwYearBody', root).innerHTML = ''; return; }
  if (!yearData.years.length) { $('#fwYearSum', root).textContent = 'No year to show'; $('#fwYearBody', root).innerHTML = `<p>No season of this farm could be judged on the weather record. ${esc(yearData.fieldCrops.find(f => f.crops?.reason)?.crops.reason || '')}</p>`; return; }
  const order = Y.playOrder(yearData.years);
  $('#fwYearPick', root).value = String(ui.year); $('#fwYearPrev', root).disabled = ui.year === order[0]; $('#fwYearNext', root).disabled = ui.year === order.at(-1);
  const play = $('#fwYearPlay', root); play.textContent = yearTimer ? 'Pause' : 'Play the years'; play.setAttribute('aria-label', yearTimer ? 'Pause the years' : 'Play the years');
  $('#fwYearSum', root).textContent = `${ui.year}: ${v.counts.fine} fine, ${v.counts.close} close call, ${v.counts.hurt} hurt, ${v.counts.none} not judged`;
  $('#fwYearBody', root).innerHTML = `<p class="fw-small">${esc(Y.RIBBON)}. ${esc(Y.recordWords(yearData.fieldCrops))} A field shows the worst of its crops.</p>` + v.fields.map(f => `<section class="fw-yfield"><p class="fw-yh"><b>${esc(f.name)}: <span class="fw-yword" data-verdict="${f.verdict}">${esc(f.word)}</span></b></p>${f.reason ? `<p>${esc(f.reason)}</p>` : ''}${f.crops.map(c => `<div class="fw-ycrop"><p><b>${esc(c.crop)}, ${esc(c.label)}: ${esc(c.word)}</b></p>${c.why.length ? `<ul>${c.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}${c.stages.length ? `<ol class="fw-ystages" aria-label="Stages of ${esc(c.crop)} in ${esc(c.label)}">${c.stages.map(st => `<li>${esc(st.text)}</li>`).join('')}</ol>` : ''}</div>`).join('')}</section>`).join('');
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlay(true); });
const sizeYear = () => { const st = $('#fwStage', root), b = $('#fwYear', root); if (st && b && !b.hidden) st.style.setProperty('--yearh', `${b.offsetHeight}px`); };
addEventListener('resize', () => { if (root && ui.year) sizeYear(); });
function openFarmId(id) {
  const res = S.openFarm(store, id); if (res.refused) return toast(res.refused);
  store = res.store; write(); ui.farmId = id; ui.fieldId = ''; ui.date = ''; closePanel(); render(true); say(`${farm().name} opened.`); focusOn(farmOpener());
}
function farmsEnv() {
  const p = $('#fwPanel', root);
  return { node: p, get: () => ({ store, farm: farm() }), say, toast, close: () => { const back = farmOpener(); closePanel(); focusOn(back); },
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
    close: () => { closePanel(); focusOn('#fwMoreBtn'); }, open: id => { select(id); openPanel('field'); }, add: () => { ui.editFrom = 'more'; edit('add'); } };
}
// A new farm: the place, the name and water, then the first field. The map is used to tap a place, so it shows (as the satellite photo) while the farmer picks.
function pickOnMap(env, cb, back) {
    const p = $('#fwPanel', root), was = ui.look;
    p.hidden = true; ui.mode = 'pick'; ui.look = 'photo'; applyLook(); render(); map.invalidateSize();
    if (!farm()) usStart();
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
  if (ui.year) exitYear({ quiet: true });
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
    $('#fwCancel', root).onclick = () => { closePanel(); afterEdit('rename'); };
    $('#fwRename', root).onsubmit = e => {
      e.preventDefault();
      const res = S.renameField(store, fm.id, f.id, $('#fwName', root).value);
      if (res.refused) { $('#fwNameErr', root).textContent = res.refused; return; }
      const before = store; store = res.store; closePanel(); later(); render(); afterEdit('rename');
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
  $('#fwKeep', root).onclick = () => { closePanel(); afterEdit('delete'); };
  $('#fwDoDelete', root).onclick = () => {
    const before = store, res = S.deleteField(store, farm().id, f.id); if (res.refused) { toast(res.refused); return; }
    store = res.store; ui.fieldId = ''; closePanel(); later(); render(true); focusOn(farm()?.fields.length ? '#fwField' : '#fwMoreBtn');
    toast(`${f.name} deleted`, () => { store = before; ui.fieldId = f.id; later(); render(true); say(`${f.name} is back`); });
  };
}
function showRecent() {
  const p = $('#fwPanel', root), fm = farm(), items = fm.trash;
  ui.panel = 'recent'; p.hidden = false;
  p.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">Recently deleted</h2><button type="button" class="btn lg" id="fwClose">Close</button></div><p class="fw-muted">Kept on this device for 30 days. A field comes back with its plan.</p>
  ${items.length ? `<ul class="fw-list">${items.map(t => `<li><span><b>${esc(t.field.name)}</b><br><small>${areaWords(t.field.area)} · deleted ${dayWords(new Date(t.at).toISOString().slice(0, 10))}</small></span><button type="button" class="btn lg" data-restore="${esc(t.field.id)}">Restore</button></li>`).join('')}</ul>` : '<p>Nothing was deleted recently.</p>'}`;
  $('#fwPanelTitle', root).focus();
  $('#fwClose', root).onclick = () => { closePanel(); focusOn('#fwMoreBtn'); };
  for (const b of p.querySelectorAll('[data-restore]')) b.onclick = () => {
    const res = S.restoreField(store, fm.id, b.dataset.restore); if (res.refused) { toast(res.refused); return; }
    store = res.store; ui.fieldId = res.field.id; closePanel(); later(); render(true); toast(`${res.field.name} is back, with its plan.`);
  };
}

// ---- the map
// The Photo look is NASA's own picture from GIBS, built as the setup map builds its Satellite ground (js/mapbase.js with js/nasabase.js): MODIS true colour of two days back for the whole view, and over it
// the 30 m HLS picture of the newest clear day near the field, with the setup map's credit line word for word. Nothing from another photo service.
let photoRun = 0;
function nasaPhoto() {
  const run = ++photoRun, f = field(), [lat, lon] = f ? S.interiorPoint(f.ring) : [map.getCenter().lat, map.getCenter().lng];
  showStatus('Looking for the newest clear NASA picture of this place…');
  Promise.all([import('./nasabase.js'), import('./mapbase.js')]).then(async ([NB, MB]) => {
    const day = MB.yesterday(), pk = await NB.pick({ lat, lon });   // the setup map's day for the coarse picture: yesterday's is often not made yet and comes back blank
    if (run !== photoRun || ui.look !== 'photo') return;
    const credit = esc(MB.creditFor({ ground: 'photo', names: false, pic: NB.creditWords(pk?.ok ? pk : null, day) }));
    const group = L.layerGroup([L.tileLayer(NB.trueTemplate, { time: day, maxNativeZoom: NB.TRUE_NATIVE, maxZoom: 19, zIndex: 0, attribution: credit, crossOrigin: true })]);
    if (pk?.ok) group.addLayer(L.tileLayer(NB.hlsTemplate(NB.HLS[pk.layer]), { time: pk.day, minZoom: NB.HLS_MIN_ZOOM, maxNativeZoom: NB.HLS_NATIVE, maxZoom: 19, zIndex: 1, attribution: '', crossOrigin: true }));
    if (tiles) map.removeLayer(tiles);
    tiles = group.addTo(map);
    showStatus(pk?.ok ? NB.hlsWords(pk) : NB.SAYS.noHls);
  }).catch(() => { if (run === photoRun) showStatus('The satellite photo needs internet.'); });
}
function applyLook() {
  if (!map) return;
  root.classList.toggle('fw-photo', ui.look === 'photo');
  photoRun++;   // a picture still on its way for an earlier choice is dropped
  if (tiles) { map.removeLayer(tiles); tiles = null; }
  if (ui.look === 'photo') nasaPhoto(); else showStatus('');
  for (const b of root.querySelectorAll('[data-look]')) b.setAttribute('aria-checked', String(b.dataset.look === ui.look));
}
const VERDICT_FILL = { fine: '#a5d6a7', close: '#ffe082', hurt: '#ef9a9a', none: UNREAD_FILL };
function fillFor(f) {
  const yf = yearField(f.id); if (yf) return VERDICT_FILL[yf.verdict];
  const g = f.id === ui.fieldId ? groundOf(f.report?.[ui.planKind], ui.date) : null;   // the board is the ground-cover layer: a growing crop is the one green of its key and of Compare's cards, whatever the crop (its name is on the field's label)
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
    if (chosen && weak.get(f.id)?.state === 'ok') drawWeakSpots(L, weakModelFor(f))?.addTo(layer);   // the squares and numbered pins of the weak spots, over the field
    const mid = S.interiorPoint(f.ring);
    const label = `${f.name}, ${areaWords(f.area)}${f.estimated ? ', estimated outline' : ''}${chosen ? ', chosen' : ''}`;
    const month = ui.date ? S.MONTH_NAMES[+ui.date.slice(5, 7) - 1] : '', state = f.report ? S.plateWord(groundOf(f.report[ui.planKind], ui.date), cropName, month) : '';   // "Growing (corn) in June": only where the engine has an answer for the day
    const yf = yearField(f.id), shape = yf ? VERDICT_ICON[yf.verdict] : 'M12 3c-3 4-6 6-6 10a6 6 0 0 0 12 0c0-4-3-6-6-10z';   // in a year, the drop is replaced by the verdict's own shape: a tick, a triangle, a cross, a dash
    const token = L.divIcon({ className: 'fw-tokenwrap', html: `<button type="button" class="fw-token${chosen ? ' is-chosen' : ''}"${yf ? ` data-verdict="${yf.verdict}"` : ''} tabindex="${f.id === tabId ? 0 : -1}" data-field="${esc(f.id)}" aria-label="${esc(yf ? `${Y.tokenLabel(yf, ui.year)}, ${areaWords(f.area)}${chosen ? ', chosen' : ''}` : label + (month ? `. ${month}: ${state}` : ''))}" aria-pressed="${chosen}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="${shape}"/></svg></button><span class="fw-plate"><b>${esc(f.name)}</b><small>${areaWords(f.area)}${f.estimated ? ' · estimated' : ''}</small>${yf ? `<small class="fw-plate-state">${esc(yf.word)}</small>` : state ? `<small class="fw-plate-state">${esc(state)}</small>` : ''}</span>`, iconSize: [120, 90], iconAnchor: [60, 22] });
    L.marker(mid, { icon: token, keyboard: false }).addTo(layer).on('click', () => select(f.id));
  }
  if (hadFocus) $(`.fw-token[data-field="${CSS.escape(hadFocus)}"]`, root)?.focus({ preventScroll: true });
  const chosen = field();
  if (refit !== false && chosen) map.fitBounds(L.polygon(chosen.ring).getBounds().pad(0.6), { animate: false, maxZoom: 17 });
  else if (refit !== false) map.setView([fm.pin.lat, fm.pin.lon], 15, { animate: false });
}
// Motion, as Settings says it: full, Less (nothing slides or glides, a fade of 200 ms at most) or Still (nothing moves at all). The board never animates its own pans and zooms in any of them.
const motionNow = () => { const m = document.documentElement.dataset.motion || ''; return m === 'reduce' || m === 'less' ? m : matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : ''; };
// With no place known the map starts on the United States, as the setup map does: the whole country in view.
const US_VIEW = { center: [39.8, -98.6], box: [[24.5, -125], [49.4, -66.9]] };
function usStart() { const sz = map.getSize(), z = sz.x && sz.y ? Math.max(2, Math.min(5, map.getBoundsZoom(US_VIEW.box, false, L.point(8, 8)))) : 3; map.setView(US_VIEW.center, z, { animate: false }); }
function initMap() {
  if (map) return;
  map = L.map($('#fwMap', root), { zoomControl: true, attributionControl: true, zoomSnap: 0.25, maxZoom: 19, minZoom: 3, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, inertia: !motionNow() });   // a dragged map stops where the hand stops when motion is less or still
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  usStart(); layer = L.layerGroup().addTo(map); editLayer = L.layerGroup().addTo(map);
  $('#fwMap', root).addEventListener('keydown', e => { const t = e.target.closest?.('.fw-token'); if (t) tokenKey(e, t); });
  $('#fwMap', root).addEventListener('click', e => { const t = e.target.closest?.('.fw-token'); if (t) { if (ui.year) selectInYear(t.dataset.field); else if (t.dataset.field === ui.fieldId && ui.panel !== 'field') { ui.opener = 'token'; openPanel('field'); } else select(t.dataset.field); } });
  applyLook();
}

// ---- the ground-cover key of the board: growing crop, crop residue, bare soil, in the colours the field and Compare's cards use; what the chosen field shows is marked
function renderKey() {
  const k = $('#fwKey', root), f = field(), g = f ? groundOf(f.report?.[ui.planKind], ui.date) : null;
  k.hidden = !f || ui.view !== 'map' || !!ui.year || !!ui.mode || ui.history || !(ui.panel === 'compare' && !$('#fwPanel', root).hidden);
  if (k.hidden) return;
  const plants = k.querySelector('[data-k=crop]');
  plants.querySelector('i').style.background = g?.state === 'cover' ? STATE_FILL.cover : STATE_FILL.crop;
  plants.querySelector('span').textContent = g?.state === 'cover' ? 'Cover crop' : FW.keyPlants;
  for (const li of k.querySelectorAll('li')) { const on = !!g?.state && (li.dataset.k === g.state || (li.dataset.k === 'crop' && g.state === 'cover')); li.classList.toggle('is-on', on); if (on) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current'); }
}

// ---- drawing the whole screen
// ---- the head of the first view
const planNames = plan => [...new Set((plan?.seasons || []).map(x => cropName(x.crop)))].join(', ');
const SCORE_WORDS = (score, flag) => flag === 'fails' ? 'Does not suit here' : flag === 'borderline' ? 'Only just suits' : !Number.isFinite(score) ? '' : `${Math.round(score)} · ${score >= 70 ? 'Good fit' : score >= 50 ? 'OK fit' : 'Poor fit'}`;
function subLine(f, fm) {
  const size = `${f.estimated ? 'About ' : ''}${areaWords(f.area)}${f.estimated ? ' (estimated)' : ''}`, place = fm?.pin?.label ? String(fm.pin.label).split(',').slice(0, 2).join(',').trim() : '';
  return place ? `${size} · ${place}` : size;
}
function planLine(f) {
  const p = f.report?.proposed; if (!p) return null;
  const chip = SCORE_WORDS(p.score, p.flag);
  return { html: `Plan to try: ${esc(planNames(p) || '')}${chip ? ` <span class="fw-scorechip">${esc(chip)}</span> ${srcButton(['power'], 'The score from your field report, from 0 to 100. It shows how well this plan fits your field. It is a guide, not a yield.')}` : ''}` };
}
// The next job of the plan to try after today, in one sentence.
function nextLine(f, today = new Date().toISOString().slice(0, 10)) {
  const p = f.report?.proposed; if (!p?.seasons?.length) return f.report ? '' : 'No plan yet. Open the field report and choose Add to My farm.';
  for (const x of p.seasons) {
    if (S.isDay(x.sow) && x.sow > today) return x.window?.earliest && x.window?.latest ? `Next: sow ${cropName(x.crop).toLowerCase()} between ${dayWords(x.window.earliest)} and ${dayWords(x.window.latest)}.` : `Next: sow ${cropName(x.crop).toLowerCase()} about ${dayWords(x.sow)}.`;
    if (S.isDay(x.harvest) && x.harvest > today) return `Next: harvest ${cropName(x.crop).toLowerCase()} about ${dayWords(x.harvest)}.`;
  }
  const last = p.seasons.at(-1)?.harvest;
  return `No job planned. The plan ends in ${S.isDay(last) ? last.slice(0, 4) : 'a later year'}.`;
}
// What shows in the head depends on whether Compare plans is open: the next job on its own, or the day and the sentence about the day.
function renderHead() {
  const f = field(), cmp = ui.panel === 'compare' && !$('#fwPanel', root).hidden;
  $('#fwNextJob', root).hidden = !f || cmp || !$('#fwNextJob', root).textContent;
  $('#fwDate', root).hidden = !(f && ui.date) || !cmp;
  $('#fwFinding', root).hidden = (!!f && !cmp) || !$('#fwFinding', root).textContent;   // with no field the sentence says how to add one
}
export function render(refit = false) {
  if (!root) return;
  const fm = farm(), f = field();
  if (f) ui.fieldId = f.id; if (fm) ui.farmId = fm.id;
  const ds = keyDates(f); if (f && ds.length && !ui.date) ui.date = ds[0].date;   // a day the farmer moved to by the time bar stays; only a board with no day starts on the plan's first
  const sel = $('#fwField', root); sel.innerHTML = fm ? S.naturalSort(fm.fields).map(x => `<option value="${esc(x.id)}"${x.id === ui.fieldId ? ' selected' : ''}>${esc(x.name)} · ${areaWords(x.area)}${x.estimated ? ' (estimated)' : ''}</option>`).join('') : '';
  sel.disabled = !fm || !fm.fields.length; sel.hidden = !fm || fm.fields.length < 2;   // with one field its name is the head; with two or more the head is the picker
  $('#fwFieldName', root).hidden = !!fm && fm.fields.length > 1; $('#fwFieldName', root).textContent = f ? f.name : '';
  // with two farms or more a small button names the farm and opens My farms
  const many = store.farms.length > 1, cap = $('#fwFarmCap', root), chip = $('#fwFarmBtn', root);
  cap.hidden = true; cap.textContent = fm ? fm.name : '';
  chip.hidden = !fm || !many; if (fm) { chip.querySelector('.fw-farmchip-name').textContent = fm.name; chip.setAttribute('aria-label', `${fm.name}. Change farm`); }
  // the head: size and place, the plan to try with the report's score, and the next job; the day and the long sentence belong to Compare plans
  $('#fwSub', root).textContent = f ? subLine(f, fm) : '';
  { const pl = f ? planLine(f) : null, pe = $('#fwPlan', root); pe.innerHTML = pl ? pl.html : ''; pe.hidden = !pl; }
  $('#fwNextJob', root).textContent = f ? nextLine(f) : ''; $('#fwPlanName', root).textContent = f?.report?.[ui.planKind] ? KINDS[ui.planKind] : '';
  $('#fwTime', root).textContent = ui.date ? dayWords(ui.date) : ''; $('#fwTime', root).setAttribute('datetime', ui.date || '');
  $('#fwLabel', root).textContent = f && ui.date ? chipFor(f) : '';
  { const full = finding(f), n = $('#fwFinding', root); n.textContent = full; n.dataset.full = full; }
  renderHead();
  $('#fwCompare', root).disabled = !f?.report;
  for (const q of ['#fwHud', '#fwBar']) $(q, root).hidden = !fm;   // with no field there is nothing to pick, compare, turn or open: only the one message shows
  $('#fwEmptyFind', root).hidden = !go;
  $('#fwEmpty', root).hidden = !!fm || ui.mode === 'pick'; $('#fwMap', root).hidden = ui.view === '3d' || (!fm && ui.mode !== 'pick'); $('#fw3d', root).hidden = ui.view !== '3d';
  for (const b of root.querySelectorAll('button[data-kind]')) { b.setAttribute('aria-pressed', String(b.dataset.kind === ui.planKind)); b.disabled = !f?.report?.[b.dataset.kind]; }
  $('#fwStage', root).classList.toggle('is-3d', ui.view === '3d');
  $('#fwStage', root).classList.toggle('has-panel', !!ui.panel && !$('#fwPanel', root).hidden); $('#fwStage', root).classList.toggle('panel-wide', ui.panel === 'fields'); $('#fwPanel', root).classList.toggle('wide', ui.panel === 'fields');
  $('#fwMapBtn', root).setAttribute('aria-pressed', String(ui.view === 'map')); $('#fwThreeBtn', root).setAttribute('aria-pressed', String(ui.view === '3d'));
  // More: a tool that needs a field or a farm is off without one, and says nothing it cannot do
  $('#fwDetailsBtn', root).disabled = !f; $('#fwFieldsBtn', root).disabled = !fm;
  for (const b of root.querySelectorAll('#fwMoreMenu [data-edit=add]')) b.disabled = !fm;
  if (map && fm && ui.view === 'map' && !ui.mode) { drawMap(refit); map.invalidateSize() }
  if (fm && f) readingsFor(fm, f, readingsChanged);   // the plans' figures and the weather are asked for at once, so Compare plans and the field's details have them when opened
  renderKey(); renderStrip(); renderObs(); renderYear();
  if (ui.dayOnly && ui.panel === 'compare') updateCompareDay();   // a step of the time bar changes the day, not the plans: only the two cards and the pressed key day are drawn again
  else if (['compare', 'field', 'fields', 'farms', 'settings'].includes(ui.panel)) { renderPanel(); addLower(); }
  ui.dayOnly = false;
  behind();
  push3d();   // the farmer's camera angle is kept by the 3D view
}

// Show My farm in this node (the page's #view-farm). Called every time the view opens; the first call builds the screen.
export async function mountFarm(node) {
  if (builtFor !== node) { build3d?.stop.abort(); build3d = null; handle3d?.dispose?.(); handle3d = null; builtFor = node; root = node; build(node); wire(); map = null; layer = null; tiles = null; }
  store = read();
  if (!ui.farmId || !S.getFarm(store, ui.farmId)) { ui.farmId = store.active; ui.fieldId = ''; }
  if (!ui.look) ui.look = 'board';
  initMap(); loadEngine(); loadReminders(); initSources();
  const f = field();
  if (f && !ui.date) ui.date = keyDates(f)[0]?.date || '';
  render(true);
  document.dispatchEvent(new CustomEvent('crophalo:farm-ready', { detail: { root: node, map, fieldLayer: layer, slider: $('#fwMonthSlider', node) } }));   // the big animations lay the field's outline over the board
  setTimeout(() => { map?.invalidateSize(); if (field()) drawMap(true); }, 60);
  openByRule();   // after render(true), so the field and the status line exist; before the 3D line, which builds the 3D view when the rule chose it
  if (ui.view === '3d') setView('3d');
  $('#fwTitle', node).focus?.();
}
export const _map = () => map;
export const _view3d = () => handle3d;   // read by the browser checks
export const _entry = () => readingsFor(farm(), field());   // read by the browser checks
export const _ui = ui;   // read by the browser checks
