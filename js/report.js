// Crophalo's report screen: the loading screen, the sticky bar (Change answers, the field's name, one obvious "Add to My Farm"), the seven tabs with roving
// arrow keys, the priorities panel, and the Overview and Options panels. The markup comes from js/report-view.js; the answers from the joins (js/joins.js).
// Not pure: it draws into #view-report and listens to the page. Back steps Report → Setup → Home through the app's own history, never between tabs.
// Checked by scripts/e2e_flow.mjs (the report group: tabs, keys, the panel, the "i", Add to My Farm, Back) and scripts/test_report.mjs (the markup).
import { esc } from './words.js';
import { TABS, overviewHTML, optionsHTML, laterHTML, loadingHTML, infoButton, estimatedArea, planName, allPlans, longDate, NOT_READ } from './report-view.js';
import { loadSpot, freshRows, loadSmap } from './report-load.js';
import { wireRegion } from './region.js';
import { buildWeather } from './weather-data.js';
import { weatherHTML, chartZoomHTML } from './weather-view.js';
import { buildCalendar } from './calendar-data.js';
import { calendarHTML } from './calendar-view.js';
import { getOptions, addToFarm } from './joins.js';
import { toast } from './toast.js';
import { initSources } from './srci.js';
import { motionOff } from './motion.js';
import { currentState } from './wizard.js';
import { hasRotation, hasSoil, hasPlace } from './steps.js';

const $ = (sel, root = document) => root.querySelector(sel), $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const WORDS = { change: 'Change answers', farm: 'Add to My Farm', farmDone: 'Open in My Farm', title: 'Your field', sources: 'Sources', again: 'Try again', back: 'Back', home: 'Back to the start',
  none: 'There is no report to show yet. Answer the setup questions first.', priorities: 'Your priorities', fine: 'Fine-tune what matters', whatif: 'What if the weather shifts?' };
const PRIO_NAMES = ['Water fit', 'Soil health', 'Soil wash-off', 'Income', 'Weather safety (drought, heat, frost)'], PRIO_WORDS = ['Not a concern', 'A little', 'Some', 'Important', 'Very important', 'Most important'];
// The Calendar tab's stylesheet is added when the report starts, so the page's own file does not have to list it.
function ensureStyle(href) { if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l); } }
let seam = { change() {}, home() {}, farmOpened() {}, engine: null, farm: null }, cur = null, run = 0;
const today = () => new Date().toLocaleDateString('en-CA');
const root = () => $('#reportRoot');

// ---- the answers the screens read
export const spotOf = (state, extra = {}) => ({ lat: state.loc.lat, lon: state.loc.lon, name: state.name, label: state.loc.label, cc: state.loc.cc, ...extra });
async function work() {   // the options for the answers now; the screens redraw from cur.result
  cur.result = await getOptions(cur.state, cur.climate, spotOf(cur.state), seam.engine);
  cur.plan = cur.result.ok ? (allPlans(cur.result).find(p => p.id === cur.plan) ? cur.plan : cur.result.recommended.id) : null;
}

// ---- drawing
function barHTML() {
  const s = cur.state, ready = cur.result?.ok, line = [s.loc.label || s.name ? s.loc.label : '', longDate(today())].filter(Boolean).join(' · ');
  return `<header class="reportbar" id="reportBar"><div class="rb-in">
    <button type="button" class="btn rb-back" data-act="change"><svg class="ic" aria-hidden="true"><use href="#i-back"/></svg><span>${WORDS.change}</span></button>
    <div class="rb-title"><h1 id="reportTitle">${esc(s.name || WORDS.title)}</h1><p class="rb-meta">${esc(line)} · <span class="rb-key">${WORDS.sources} ${infoButton(['power', 'gpm'], 'Weather and rain for this report')}</span></p></div>
    <div class="rb-act"><button type="button" class="btn primary" data-act="farm" id="rbFarm"${ready ? '' : ' disabled'}><svg class="ic" aria-hidden="true"><use href="#i-cube"/></svg><span>${cur.farm ? WORDS.farmDone : WORDS.farm}</span></button></div></div>
    <p class="rb-note cap" id="farmNote" role="status">${esc(cur.farmNote ?? '')}</p></header>`;
}
function tabsHTML() {
  return `<div class="chaps" role="tablist" aria-label="Parts of your report">${TABS.map(t => `<button type="button" role="tab" class="tab chap" id="tab-${t.id}" aria-controls="panel-${t.id}" aria-selected="${t.id === cur.tab}" tabindex="${t.id === cur.tab ? 0 : -1}" data-tab="${t.id}"><svg class="ic" aria-hidden="true"><use href="#${t.icon}"/></svg><span>${esc(t.label)}</span></button>`).join('')}</div>`;
}
function panelHTML() {
  const id = cur.tab, ctx = { state: cur.state, today: today() };
  const body = id === 'overview' ? overviewHTML(cur.result, ctx) : id === 'options' ? optionsHTML(cur.result, cur.plan) : id === 'weather' ? weatherHTML(cur.weather, { reading: cur.reading }) : id === 'calendar' ? calendarHTML(buildCalendar({ result: cur.result?.ok ? cur.result : null, climate: cur.climate ?? cur.weather?.C ?? null })) : laterHTML(id);
  const nextTab = TABS[TABS.findIndex(t => t.id === id) + 1];
  return `<div class="rv-panel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" tabindex="0">${body}${nextTab ? `<p class="rv-nextrow"><button type="button" class="btn lg" data-tab="${nextTab.id}" data-focus="1">Next: ${esc(nextTab.label)}</button></p>` : ''}</div>`;
}
function prioHTML() {
  const s = cur.state, open = cur.prioOpen !== false;
  return `<aside class="rv-prio${open ? '' : ' is-shut'}" aria-label="${WORDS.priorities}"><button type="button" class="rv-prio-h" data-act="prio" aria-expanded="${open}" aria-controls="prioBody"><span>${WORDS.priorities}</span><i class="chev" aria-hidden="true"></i></button>
    <div id="prioBody" class="rv-prio-b"${open ? '' : ' hidden'}><h2>${WORDS.fine}</h2><p class="cap">How much each thing counts when the options are ranked. Slide right if it matters more to you, left if it matters less.</p>
    ${PRIO_NAMES.map((n, i) => `<label class="rv-slider"><span>${esc(n)}</span><input type="range" min="0" max="5" step="1" value="${s.prio[i]}" data-prio="${i}" aria-valuetext="${PRIO_WORDS[s.prio[i]]}" style="--p:${s.prio[i] * 20}%"><small>${PRIO_WORDS[s.prio[i]]}</small></label>`).join('')}
    <h2>${WORDS.whatif}</h2>
    <label class="rv-slider"><span>Rainfall</span><input type="range" min="-40" max="30" step="5" value="${s.sc.rainPct}" data-sc="rainPct" aria-valuetext="${s.sc.rainPct > 0 ? '+' : ''}${s.sc.rainPct}%" style="--p:${(s.sc.rainPct + 40) / 70 * 100}%"><small>${s.sc.rainPct > 0 ? '+' : ''}${s.sc.rainPct}%</small></label>
    <label class="rv-slider"><span>Temperature</span><input type="range" min="0" max="4" step="0.5" value="${s.sc.tempC}" data-sc="tempC" aria-valuetext="+${s.sc.tempC} °C" style="--p:${s.sc.tempC / 4 * 100}%"><small>+${s.sc.tempC} °C</small></label>
    <p class="cap">A rough what-if, not a forecast.</p></div></aside>`;
}
function draw({ focus = false, keepScroll = true } = {}) {
  const y = scrollY, r = root();
  if (cur.loading) { r.innerHTML = `<div class="rv-wrap">${loadingHTML(cur.rows)}</div>`; if (focus) $('#ldTitle', r)?.setAttribute('tabindex', '-1'); return; }
  if (cur.failed) { r.innerHTML = `<div class="rv-wrap"><section class="rv-sec"><h2 id="reportTitle" tabindex="-1">${cur.noPlace ? 'Choose your field first.' : 'We couldn’t get weather data.'}</h2><p>${esc(cur.failed)}</p><p class="btnrow">${cur.noPlace ? '' : `<button type="button" class="btn primary" data-act="retry">${WORDS.again}</button>`}<button type="button" class="btn${cur.noPlace ? ' primary' : ''}" data-act="change">${WORDS.back}</button></p></section></div>`; $('#reportTitle', r).focus(); return; }
  r.innerHTML = `${barHTML()}<div class="rv-wrap">${tabsHTML()}<div class="rv-grid${prioShown() ? ' has-prio' : ''}">${prioShown() ? prioHTML() : ''}<div class="rv-main">${panelHTML()}</div></div></div>`;
  wireRegion(r);
  if (focus) { const h = $('#reportTitle', r); h.tabIndex = -1; h.focus(); }
  if (keepScroll) scrollTo(0, y);
}
const prioShown = () => ['overview', 'options', 'weather', 'calendar'].includes(cur.tab) && !(cur.state.rotation?.garden);

// ---- opening
export async function openReport(state, { demo = false } = {}) {
  const mine = ++run;
  cur = { state: structuredClone(state), tab: 'overview', plan: null, rows: freshRows(), loading: true, result: null, climate: null, prioOpen: matchMedia('(min-width: 861px)').matches, demo };
  if (!hasPlace(cur.state)) { cur.loading = false; cur.noPlace = true; cur.failed = 'Tap the map or draw your field, then open the report again.'; draw(); return; }   // never ask for weather without a position
  draw({ focus: true });
  const rowOf = key => cur.rows.find(r => r.key === key);
  const loaded = await loadSpot(cur.state.loc, { fetch: globalThis.fetch.bind(globalThis), caches: globalThis.caches }, (key, st, reason) => { if (mine !== run) return; const r = rowOf(key); if (r) { r.state = st; r.reason = reason; } if (cur.loading) draw(); });
  if (mine !== run) return;
  if (!loaded.ok) { cur.loading = false; cur.failed = loaded.reason; draw(); return; }
  cur.climate = loaded.climate; cur.note = loaded.note;
  cur.weather = buildWeather({ series: loaded.series, climate: loaded.climate, forecast: loaded.forecast, loc: cur.state.loc });
  if (cur.weather.ok && loaded.note) cur.weather.note = loaded.note;
  loadSmap(cur.state.loc).then(reading => { if (mine !== run) return; cur.reading = reading; if (!cur.loading && cur.tab === 'weather') { const main = $('.rv-main'); if (main) { main.innerHTML = panelHTML(); wireRegion(main); } } });   // the regional card fills in when it answers; the report does not wait for it
  await work();
  if (mine !== run) return;
  await new Promise(r => setTimeout(r, motionOff() ? 0 : 450));   // the screen resolves 450 ms after the last source
  if (mine !== run) return;
  cur.loading = false; draw({ focus: true, keepScroll: false }); scrollTo(0, 0);
}
// Draw a ready answer without loading (the tests and the engine's own demo use it): the state and the engine's result.
export async function renderResult(state, result, { climate = null, weather = null, reading = null } = {}) {
  run++; cur = { state: structuredClone(state), tab: 'overview', plan: result?.recommended?.id ?? null, rows: [], loading: false, result: result ? { ...result, ok: result.ok !== false } : null, climate, weather, reading, prioOpen: true };
  draw({ focus: true, keepScroll: false });
}
// When the report view opens: a report in hand stays; else the wizard's own answers, if they are enough; else the way back.
export function showReport() {
  if (cur && !cur.loading && !cur.failed) return;
  if (cur?.loading) return;
  const s = currentState();
  if (hasPlace(s) && hasRotation(s) && hasSoil(s)) return void openReport(s);
  root().innerHTML = `<div class="rv-wrap"><section class="rv-sec"><h1 id="reportTitle" tabindex="-1">Your report</h1><p>${WORDS.none}</p><p><button type="button" class="btn primary" data-act="home">${WORDS.home}</button></p></section></div>`;
}

// ---- the tabs
function setTab(id, { focus = true } = {}) {
  if (!TABS.some(t => t.id === id) || id === cur.tab) { if (focus) $(`#tab-${id}`)?.focus(); return; }
  cur.tab = id; draw();
  const tab = $(`#tab-${id}`); tab?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' }); if (focus) tab?.focus();
  const panel = $(`#panel-${id}`); if (panel && panel.getBoundingClientRect().top < 0) scrollTo({ top: scrollY + panel.getBoundingClientRect().top - ($('#reportBar')?.offsetHeight ?? 60) - 60 });
}
function onTabKey(event) {
  const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'home', End: 'end' }, k = keys[event.key];
  if (!k || !event.target.matches('[role=tab]')) return;
  event.preventDefault();
  const i = TABS.findIndex(t => t.id === cur.tab), n = TABS.length, to = k === 'home' ? 0 : k === 'end' ? n - 1 : (i + k + n) % n;
  setTab(TABS[to].id);
}

// ---- a chart opened large: a modal sheet with the chart at full width, how to read it, in words and every number; Escape and the backdrop close it, focus goes back to Enlarge
let zoomFrom = null;
function openZoom(button) {
  const chart = cur?.weather?.charts?.find(c => c.id === button.dataset.zoom); if (!chart) return;
  let dlg = $('#dlgChart');
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'dlgChart'; dlg.className = 'sheet chart-sheet'; dlg.setAttribute('aria-labelledby', 'czTitle');
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-zoom-close]')) dlg.close(); });
    dlg.addEventListener('close', () => { if (zoomFrom?.isConnected) zoomFrom.focus(); zoomFrom = null; }); document.body.append(dlg); }
  dlg.innerHTML = chartZoomHTML(chart); zoomFrom = button; dlg.showModal(); $('[data-zoom-close]', dlg).focus();
}

// ---- Add to My Farm: one action. It hands the field, both plans and the date to My Farm, which opens on that field.
async function addFarm() {
  if (!cur?.result?.ok) return;
  const s = cur.state, r = cur.result, area = s.area ? { ...s.area, estimated: false } : estimatedArea(s.loc);
  const payload = { place: spotOf(s), area, areaEstimated: !s.area, current: { ...r.current, kind: 'current' }, proposed: { ...r.recommended, kind: 'proposed' }, date: today() };
  const note = $('#farmNote'), btn = $('#rbFarm');
  btn.disabled = true;
  const out = await addToFarm(payload, seam.farm);
  btn.disabled = false;
  if (out.ok) { cur.farm = out; cur.farmNote = ''; seam.farmOpened(out); toast('Added to My Farm'); } else { cur.farmNote = out.reason; if (note) note.textContent = out.reason; }
}

// ---- events
function bind() {
  const r = root();
  r.addEventListener('click', event => {
    const zoom = event.target.closest('[data-zoom]'); if (zoom) return openZoom(zoom);
    const t = event.target.closest('[data-act], [data-tab], [data-plan]'); if (!t) return;
    if (t.dataset.tab) return setTab(t.dataset.tab, { focus: true });
    if (t.dataset.plan) { cur.plan = t.dataset.plan; draw(); $(`[data-plan="${CSS.escape(cur.plan)}"]`)?.focus(); toast(`Details below changed to ${planName(allPlans(cur.result).find(p => p.id === cur.plan))}`); return; }
    const act = t.dataset.act;
    if (act === 'change') return seam.change(cur?.state);
    if (act === 'home') return seam.home();
    if (act === 'farm') return void addFarm();
    if (act === 'retry') return void openReport(cur.state);
    if (act === 'prio') { cur.prioOpen = !(cur.prioOpen !== false); draw(); $('.rv-prio-h')?.focus(); }
  });
  r.addEventListener('keydown', onTabKey);
  r.addEventListener('input', event => {
    const t = event.target; if (!t.matches('input[type=range]')) return;
    const s = cur.state; t.style.setProperty('--p', `${(t.value - t.min) / (t.max - t.min) * 100}%`);
    if (t.dataset.prio !== undefined) { s.prio[+t.dataset.prio] = +t.value; s.prioPreset = null; t.nextElementSibling.textContent = PRIO_WORDS[t.value]; t.setAttribute('aria-valuetext', PRIO_WORDS[t.value]); }
    else { s[`sc`][t.dataset.sc] = +t.value; t.nextElementSibling.textContent = t.dataset.sc === 'tempC' ? `+${t.value} °C` : `${+t.value > 0 ? '+' : ''}${t.value}%`; }
    clearTimeout(cur.rerun); cur.rerun = setTimeout(async () => { await work(); const f = document.activeElement, id = f?.dataset?.prio ?? f?.dataset?.sc; const main = $('.rv-main'); if (main) main.innerHTML = panelHTML(); void id; }, 120);   // the options re-rank a moment after the slider stops, in place
  });
}
// seam: { change(state), home(), farmOpened(result), engine: () => import('./engine.js'), farm: () => import('./farm.js') } (the last two are given by the page start once those files exist)
export function initReport(next) { seam = { ...seam, ...next }; initSources(); ensureStyle('css/calendar.css'); if (root()) bind(); }
export const currentReport = () => cur;
