// Crophalo's report screen: the loading screen, the sticky bar (Change answers, the field's name, one obvious "Add to My Farm"), the seven tabs with roving
// arrow keys, the priorities panel, and the Overview and Options panels. The markup comes from js/report-view.js; the answers from the joins (js/joins.js).
// Not pure: it draws into #view-report and listens to the page. Back steps Report → Setup → Home through the app's own history, never between tabs.
// Checked by scripts/e2e_flow.mjs (the report group: tabs, keys, the panel, the "i", Add to My Farm, Back) and scripts/test_report.mjs (the markup).
import { esc } from './words.js';
import { SLOW_MS, WEATHER_RETRY_MS, assumptions, strategies, setMoneyHook, farmPlans, planWithCrops, proposedPlan, PROPOSED_WORDS, loadingHTML, infoButton, estimatedArea, planName, optionLabel, allPlans, longDate, NOT_READ } from './report-view.js';
import { getSoilSurvey, spotFor, freshRows, getSmap, getNearby, getImerg, getGrace, getEco, getHls, getDem, slopeInto, prefetchPlace } from './report-load.js';
import { wireRegion } from './region.js';
import { mountNotes, fieldKey } from './notes-view.js';
import { foldHTML as soilFoldHTML, bindSoilTest } from './soiltestui.js';
import { withSoilTest } from './soiltest.js';
import { soilLine } from './soil-load.js';
import { mountReminders, jobsHTML, jobsFor, openRemindDialog, setCropNamer, startReminderWatch } from './remind-wire.js';
import { pickRecord, recordWords, readNotes } from './notice.js';
import { buildWeather } from './weather-data.js';
import { weatherHTML, chartZoomHTML } from './weather-view.js';
import { buildCalendar } from './calendar-data.js';
import { calendarHTML } from './calendar-view.js';
import './added-fx.js';
import { loadName, FINDING } from './placename.js';
import { coordText } from './places.js';
import { hooks } from './hooks.js';
import { startMarket } from './market-data.js';
import { marketLineHTML, marketListsFor } from './market-view.js';
import { hardYearModel } from './hardyear-model.js';
import { climateFacts, satelliteFacts, priceFacts } from './letter-facts.js';
import { buildTrends } from './trends-data.js';
import { trendsPartHTML } from './trends-view.js';
import { loadGreenness } from './greenness.js';
import { answerHTML, compareBlockHTML, wrongHTML, blockHTML, foldHTML, shareBlockHTML, H } from './letter-view.js';
import { satellitesHTML, rainCardHTML, moistureCardHTML } from './satellites-view.js';
import { graceCardHTML, hlsCardHTML, ecoCardHTML } from './satellites2-view.js';
import { fieldHTML } from './field-view.js';
import { getOptions, addToFarm, climateFor } from './joins.js';
import { toast } from './toast.js';
import { initSources } from './srci.js';
import { motionOff } from './motion.js';
import { currentState, setFieldOk, toPlaceStep } from './wizard.js';
import { fieldWord } from './nearby.js';
import { loadRegions } from './places.js';
import { engineSpot } from './near-load.js';
import { loadMoney, moneyFor } from './money-data.js';
import { moneyLineHTML, openMoneySheet } from './money-view.js';
import { readSettings } from './settings.js';
import { readUnits, unitsFor, fmtLength } from './units.js';
import { localiseDeep, localiseText } from './unitstext.js';
import { loadRates, readRates } from './currency.js';
import { hasRotation, hasSoil, hasPlace } from './steps.js';

const $ = (sel, root = document) => root.querySelector(sel), $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const WORDS = { change: 'Change answers', farm: 'Add to My farm', farmDone: 'Open in My farm', title: 'Your field', sources: 'Sources', again: 'Try again', back: 'Back', home: 'Back to the start',
  none: 'There is no report to show yet. Answer the setup questions first.', askTitle: 'Is this your field?', fieldOk: 'This is my field: carry on', movePin: 'Move the pin to my field', priorities: 'Your priorities', fine: 'Fine-tune what matters', whatif: 'What if the weather shifts?' };
const PRIO_NAMES = ['Water fit', 'Soil health', 'Soil wash-off', 'Income', 'Weather safety (drought, heat, frost)'], PRIO_WORDS = ['Not a concern', 'A little', 'Some', 'Important', 'Very important', 'Most important'];
// The Calendar tab's stylesheet is added when the report starts, so the page's own file does not have to list it.
function ensureStyle(href) { if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l); } }
let seam = { change() {}, home() {}, farmOpened() {}, engine: null, farm: null, climateFrom: null }, cur = null, run = 0;
const today = () => new Date().toLocaleDateString('en-CA');
const root = () => $('#reportRoot');

// ---- the answers the screens read
export const spotOf = (state, extra = {}) => ({ lat: state.loc.lat, lon: state.loc.lon, name: state.name, label: state.loc.label, cc: state.loc.cc, ...extra });
async function work() {   // the options for the answers now; the screens redraw from cur.result
  const climate = climateFor(cur.series, cur.climate, cur.state.sc, cur.state.loc.lat);
  cur.result = await getOptions(cur.state, climate, engineSpot(cur.state, cur.near), seam.engine, { today: today() });
  // only the weather record is needed to compare strategies: when the answer fails with the crop map's fields in, it is asked again without them (the crop check then says it was not made)
  if (!cur.result.ok && !cur.result.refused && cur.near && Object.keys(cur.near).length) cur.result = await getOptions(cur.state, climate, engineSpot(cur.state, {}), seam.engine, { today: today() });
  cur.plan = cur.result.ok ? (allPlans(cur.result).find(p => p.id === cur.plan) ? cur.plan : cur.result.recommended.id) : null;
  await preselect();
}
// A demo region may name a plan worth a look (its crops, in order). While the answer says keep, that plan is pre-selected to try, labelled as an option and not as our suggestion, and it is the plan carried to My Farm.
// The farmer's own choice is never overwritten.
async function preselect() {
  if (cur.chosen || cur.picked || !cur.result?.ok || cur.result.recommended.id !== cur.result.current.id) return;
  let regions = []; try { regions = await loadRegions(); } catch { /* no regions: nothing to pre-select */ }
  const loc = cur.state.loc, region = regions.find(r => Math.abs(r.lat - loc.lat) < 1e-3 && Math.abs(r.lon - loc.lon) < 1e-3 && Array.isArray(r.try)), plan = region ? planWithCrops(cur.result, region.try) : null;
  if (plan) { cur.chosen = plan.id; cur.preselected = true; }
}

// ---- the rough money line (js/money-data.js, js/money-view.js): the two world lookups are asked once; the figures follow the farmer's currency and are worked out again whenever the options change
const fin0 = v => typeof v === 'number' && Number.isFinite(v);
const unitsNow = () => unitsFor(readUnits(), cur?.state?.loc?.cc);
// The answer as the farmer reads it: every sentence of the engine's answer in the farmer's units, worked out once for each answer and each choice of units, for the screen only.
// cur.result keeps the engine's own figures: My farm, Share or print and the what-ifs read those, and nothing is converted twice.
function viewOf(u = unitsNow()) {
  if (!cur?.result) return cur?.result ?? null;
  const key = JSON.stringify(u);
  if (cur.viewOf !== cur.result || cur.viewKey !== key) { cur.view = localiseDeep(cur.result, u); cur.viewOf = cur.result; cur.viewKey = key; }
  return cur.view;
}
function figuresNow() {
  if (!cur?.moneyLookups || !cur.result?.ok) return;
  const settings = readSettings(), rates = settings.currency === 'USD' ? null : readRates();
  cur.money = { byPlan: moneyFor(cur.result, cur.state.loc.cc, { ...cur.moneyLookups, currency: settings.currency, rates }), rates };
}
async function startMoney(mine) {
  if (!cur?.result?.ok) return;
  cur.money = { loading: true };
  try { cur.moneyLookups = await loadMoney(); if (settings0() !== 'USD') await loadRates().catch(() => null); } catch { cur.moneyLookups = null; }
  if (mine !== run || !cur) return;
  figuresNow(); if (!cur.moneyLookups) cur.money = undefined;
  redrawKeep();   // the money line and the price cards fill in when the lookups answer
}
const settings0 = () => readSettings().currency;
setMoneyHook((plan, where) => moneyLineHTML(cur?.money, plan, where, unitsNow()));

// ---- drawing
// A field that reached the report with no place name is named now (once, from the place service); the bar is redrawn when the name arrives.
async function nameThePlace(mine) {
  const s = cur.state;
  if (s.name || s.loc?.label || cur.demo || !hasPlace(s)) return;
  cur.naming = true;
  const got = await loadName(s.loc.lat, s.loc.lon).catch(() => ({ ok: false }));
  if (mine !== run) return;
  cur.naming = false;
  if (got.ok) s.loc.label = got.name;
  const bar = $('#reportBar'); if (bar && !bar.contains(document.activeElement)) bar.outerHTML = barHTML();
}
// The page's parts as jump links, fixed under the top bar while the page scrolls: the current part is marked and a heading is never hidden under the bar.
const PARTS = [['blkAnswer', 'Plant next'], ['blkCompare', 'Strategies'], ['blkWrong', 'What could go wrong'], ['blkWhen', 'When'], ['blkMore', 'Your field'], ['blkShare', 'Print']];
// The row of parts also carries the page's two actions at its right end, so Add to My farm and Print are always in reach while the page scrolls.
const partsHTML = () => { const added = !!(cur?.farm && cur.farmFor === (cur.chosen ?? ''));
  return `<nav class="rv-parts" aria-label="Parts of this page"><div class="rv-parts-in"><ul>${PARTS.map(([id, label], i) => `<li><a href="#${id}" data-part="${id}"${i === 0 ? ' aria-current="true"' : ''}>${esc(label)}</a></li>`).join('')}</ul><span class="rv-parts-acts"><button type="button" class="btn" data-act="share" aria-haspopup="dialog"><svg class="ic" aria-hidden="true"><use href="#i-share"/></svg><span>Print or save</span></button><button type="button" class="btn primary" data-act="farm">${added ? '<svg class="ic" aria-hidden="true"><use href="#i-tick"/></svg> Added' : cur?.inFarm ? 'Open in My farm' : 'Add to My farm'}</button></span></div></nav>`; };
function markPart() {
  const bar = $('#reportBar'); if (!bar || !cur || cur.loading) return;
  document.documentElement.style.setProperty('--rbh', `${bar.offsetHeight}px`);
  const edge = bar.getBoundingClientRect().bottom + 96; let at = PARTS[0][0];   // a part is the current one as soon as its heading is in the top of the page under the bar
  const held = partHold.id && Date.now() < partHold.until;
  if (held) at = partHold.id; else for (const [id] of PARTS) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= edge) at = id; }
  for (const a of $$('.rv-parts a')) { if (a.dataset.part === at) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }
}
let partsTick = 0;
const partHold = { id: '', until: 0 };   // the part just pressed stays marked while the page travels to it
function barHTML() {
  const s = cur.state, line = [s.name && s.loc.label ? s.loc.label : '', coordText(s.loc.lat, s.loc.lon), `Made ${longDate(today())}`].filter(Boolean).join(' · ');
  return `<header class="reportbar" id="reportBar"><div class="rb-in">
    <button type="button" class="btn rb-back" data-act="change"><svg class="ic" aria-hidden="true"><use href="#i-back"/></svg><span>${WORDS.change}</span></button>
    <div class="rb-title"><span class="rv-glyph" aria-hidden="true"></span><h1 id="reportTitle">${esc(s.name || s.loc.label || (cur.naming ? FINDING : WORDS.title))}</h1><p class="rb-meta">${esc(line)}</p></div></div>${cur.result?.ok ? partsHTML() : ''}</header>`;
}
// What could not be read, in one plain sentence: the engine's own reason when it gives one, else which lookup was missing.
const failWords = r => { const why = String(r?.reason ?? '').trim(); return why && why !== NOT_READ ? why : 'The weather was read, but the crop check gave no answer. Try again in a moment.'; };
// The page: six blocks, in the farmer's questions. Blocks 4 and 5 hold the old tab bodies, folded, until each is rewritten.
function letterBody() {
  const r = viewOf(), ready = !!r?.ok, ctx = { units: unitsNow(), pick: cur.pick, market: cur.market && !cur.market.loading && cur.market.ok !== false ? { data: cur.market, near: cur.near } : null, hard: ready ? localiseDeep(hardYearModel(cur), unitsNow()) : null, state: cur.state, chosen: cur.chosen, preselected: cur.preselected, farm: cur.farm, farmFor: cur.farmFor, farmNote: cur.farmNote, inFarm: cur.inFarm, ready };
  // a pin the crop map shows as forest, wetland, built land and the like: the map's sentence and the two ways on (water and sea have no askField and keep the plain message)
  if (!ready && r?.askField) return `<div class="rv-letter"><section class="rv-block" id="blkAsk" aria-labelledby="bkAsk"><h2 id="bkAsk">${WORDS.askTitle}</h2><p>${esc(r.reason)}</p><p class="btnrow"><button type="button" class="btn primary" data-act="fieldok">${WORDS.fieldOk}</button> <button type="button" class="btn" data-act="movepin">${WORDS.movePin}</button></p></section></div>`;
  if (!ready) return `<div class="rv-letter"><section class="rv-block" id="blkFail" role="alert"><h2>We could not work out your report</h2><p>${esc(failWords(r))}</p><p><button type="button" class="btn primary" data-act="retry">Try again</button></p></section></div>`;   // one plain message and one button; no empty boxes below
  const shown = proposedPlan(r, cur.chosen).plan;
  const job = jobsNow()[0], next = job ? `<div class="rv-nextjob">${jobsHTML([job])}</div>` : '';
  const when = blockHTML('When', H.when, `${next}${foldHTML('lfMonths', 'See the year month by month', calendarHTML(namedCalendar(), unitsNow()))}`);
  // the satellite cards, each one closed line, inside the fold "What NASA satellites see" (asked when the fold is first opened; a soil reading that failed outright is a plain line, never a lasting "Reading")
  const cards = `${rainCardHTML(cur.imerg)}${moistureCardHTML(cur.reading === null ? { value: null } : cur.reading)}${graceCardHTML(cur.grace)}${hlsCardHTML(cur.hls)}${ecoCardHTML(cur.eco)}`;
  const u = unitsNow(), wk = cur.weather, cf = climateFacts(wk, u), sf = satelliteFacts({ reading: cur.reading, imerg: cur.imerg, hls: cur.hls, grace: cur.grace, eco: cur.eco }, u, { cards: localiseText(cards, u) });   // the cards' own figures (mm, °C, km) in the farmer's units too
  // "Trends on this land": one closed part inside "Weather here since 2001", after its plain lines (its stored water and greenness are asked when it is first opened)
  const trends = wk?.ok && wk.C ? trendsPartHTML(buildTrends({ C: wk.C, series: cur.series, state: cur.state, grace: cur.grace, green: cur.green, lat: wk.lat, lon: wk.lon ?? cur.state.loc?.lon }), { localise: t => localiseText(t, u) }) : '';
  const pr = cur.moneyLookups === undefined ? undefined : cur.moneyLookups ? cur.moneyLookups.prices : { ok: false }, pf = priceFacts({ prices: pr, crops: planCrops(), units: u });
  // USDA's cash bids: what buyers reported paying, with its date and unit, for each crop of the strategies (a United States field only; nothing when the lookup is absent or has not answered)
  let bids = '';
  if (cur.market && !cur.market.loading && cur.market.ok !== false && r?.ok) {
    const plans = strategies(r).first, ev = [];
    for (const p of plans) for (const e of marketListsFor(cur.market, p, r, cur.near).evidence) if (!ev.some(x => x.text === e.text)) ev.push(e);
    const shown = (cur.market.crops ?? []).some(c => c && (c.status === 'own' || c.status === 'neighbour')), detail = plans.map(p => marketLineHTML(cur.market, p, 'detail', r, cur.near)).find(Boolean) ?? '';
    if (ev.length) bids = `<div class="lf-bids">${shown ? '<p class="cap">What buyers reported paying in the newest report for your area. A bid, not your price.</p>' : ''}<ul class="lf-list">${ev.map(e => `<li>${esc(e.text)} ${infoButton(e.sources, e.text)}</li>`).join('')}</ul>${detail}</div>`;
  }
  const more = blockHTML('More', H.more, [foldHTML('lfWeather', cf.head, cf.body + trends), foldHTML('lfSat', sf.head, sf.body), foldHTML('lfPrices', pf.head, pf.body + bids)].join(''));
  const dem = cur.dem, land = dem?.ok ? `${fin0(dem.height) ? `<li>Height above the sea: about ${fmtLength(dem.height, u)}. ${infoButton(['dem'], 'the height map')}</li>` : ''}${dem.band ? `<li>Slope: ${esc(String(dem.band))}. ${infoButton(['dem'], 'the slope')}</li>` : ''}` : (cur.demLoading ? '<li>Reading the height map…</li>' : dem === undefined ? '' : '<li>The height map did not answer, so slope and height are not shown.</li>');
  const extra = `${land ? `<ul>${land}</ul>` : ''}<div id="stHost">${soilFoldHTML(cur.state.soilTest)}</div><p class="cap" id="stStatus" role="status"></p>`;
  const note = typeof r.fieldNote === 'string' && r.fieldNote ? `<p class="cap rv-fieldnote" role="note">${esc(r.fieldNote)}</p>` : '';   // the farmer said the pin is a field: the report says so at its top
  return `<div class="rv-letter">${cur.late?.size ? `<div class="rv-fresh card pad" id="rvFresh" role="status">${freshHTML()}</div>` : ''}${note}${answerHTML(r, ctx)}${recordHTML()}${compareBlockHTML(r, ctx)}${wrongHTML(r, { state: cur.state, shown, extra, units: u })}${when}${more}${shareBlockHTML(cur.rows, { ready })}</div>`;
}
// A late answer redraws the page without closing what the farmer opened or moving the keyboard: the open folds, the focused element and the place on the page come back.
function redrawKeep() {
  if (!cur || cur.loading || cur.failed || !root()) return;
  const r = root(), open = [...r.querySelectorAll('details[open][id]')].map(d => d.id), focus = document.activeElement?.id || '', y = scrollY;
  paint({ keepScroll: false }); announceDrawn();
  for (const id of open) { const d = document.getElementById(id); if (d) d.open = true; }
  if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
  scrollTo(0, y);
}
// Each draw tells the page what was drawn, so the small motions (js/motion-wire.js) can join in without this file knowing them.
// What happens after a panel is drawn: the region cards are wired, and the tab Notes and to-do is mounted (its notes and list are read from this device, never kept in the report).
function afterPanel(main) {
  wireRegion(main);
  const st = $('#stHost', main); if (st && cur) bindSoilTest(st, applySoilTest);
  const rm = $('#rmRoot', main); if (rm && cur?.state?.loc) mountReminders(rm, { fieldId: fieldKey(cur.state.loc), jobs: jobsNow });
  const host = $('#ntRoot', main); if (host && cur?.state?.loc) notesMount = mountNotes(host, { loc: cur.state.loc, today, crop: planName({ seasons: (cur.result?.current?.seasons ?? []).slice(0, 1) }), seasonEnd: lastHarvest(cur.result?.current), extra: () => '' });
}
let notesMount = null;
// The Calendar tab's own Remind me buttons: the sowing and harvest days, the soil test and the frost checks of the plan grown now (no day is invented: a job without one asks the farmer to pick).
function calendarRemind() { const jobs = jobsNow(); return jobs.length ? `<section class="rm-cal" aria-labelledby="rmCalT"><h3 id="rmCalT">Remind me</h3><p class="cap">Set a reminder for a job on this plan. It stays on this device.</p>${jobsHTML(jobs)}</section>` : ''; }
const jobsNow = () => jobsFor({ result: cur?.result, climate: cur?.climate, forecastDays: cur?.weather?.week?.days, today: today(), now: nowLocalStamp(), units: unitsNow() });
const nowLocalStamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
// The farmer's own soil test, typed on the Field tab: it replaces what the map or the survey gave, for what was typed, and the options are worked out again (the Field tab is not redrawn while the farmer types).
let soilBase = null, soilTimer = 0;
function applySoilTest(test) {
  if (test && !cur.state.soilTest) soilBase = { ...cur.state.soil };
  cur.state.soilTest = test; cur.state.soil = test ? withSoilTest(soilBase ?? cur.state.soil, test).soil : (soilBase ?? cur.state.soil); if (!test) soilBase = null;
  const mine = run; clearTimeout(soilTimer);
  soilTimer = setTimeout(async () => { await work(); if (mine !== run) return; figuresNow(); const ul = $('#lfAssumed .lf-assumed'); if (ul) ul.innerHTML = assumptions(cur.state).map(x => `<li>${esc(localiseText(x, unitsNow()))}</li>`).join('');   // the assumptions follow the test without redrawing the page under the farmer's typing
    const s = $('#stStatus'); if (s) s.textContent = test ? 'Your soil test is in use. The report shows it.' : 'Your soil test was removed.'; }, 700);
}
const lastHarvest = plan => (plan?.seasons ?? []).map(s => s.harvest).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '')).sort().at(-1) ?? '';
// "Your record": the note the farmer wrote about an earlier season, shown beside this plan once it is 30 days old.
function recordHTML() {
  const crops = (cur?.result?.current?.seasons ?? []).map(x => planName({ seasons: [x] }));
  const n = pickRecord({ notes: readNotes(), fieldId: fieldKey(cur?.state?.loc), crops, today: today() });
  return n ? `<p class="cap nt-record" role="note">${esc(recordWords(n))}</p>` : '';
}
// the crops of the plans on screen, for the prices tab
const planCrops = () => [...new Set([cur?.result?.current, cur?.result?.recommended].flatMap(p => (p?.seasons ?? []).map(s => s.crop)))];
// One point less sure, and the reason among the things to confirm.
const SURE_LEVELS = ['Very sure', 'Fairly sure', 'Somewhat sure'];
function lowerSureness(result) {
  const at = SURE_LEVELS.indexOf(result.sureness); if (at >= 0) result.sureness = SURE_LEVELS[Math.min(SURE_LEVELS.length - 1, at + 1)];
  result.gaps = [...(Array.isArray(result.gaps) ? result.gaps : []), 'The weather is from the back-up record, not NASA, so every count of past years is rougher.'];
}
// "Back to my farm": when the report's field is already in My farm (farmHas(fieldKey)), the bar offers a way back. The page hands in seam.farmHas, the tiny js/farmhas.js, so the report never loads My farm
// and its map just to ask; without it the farm module's own farmHas is asked. A module with no farmHas, or no farm at all, adds nothing.
async function inFarmCheck(mine) {
  try {
    const m = await (seam.farmHas ?? seam.farm)?.(); if (typeof m?.farmHas !== 'function' || mine !== run || !cur?.state?.loc) return;
    if (!m.farmHas(fieldKey(cur.state.loc))) return;
    cur.inFarm = true; const act = $('.rb-act'); if (act && !$('[data-act=tofarm]', act)) act.insertAdjacentHTML('afterbegin', '<button type="button" class="btn" data-act="tofarm">Back to my farm</button>');
  } catch { /* the farm is not there: nothing is added */ }
}
// the Calendar names each plan as the Overview and Options do (the crops, and what changes), never by the engine's own words
function namedCalendar() {
  const cal = buildCalendar({ result: cur.result?.ok ? cur.result : null, climate: cur.climate ?? cur.weather?.C ?? null });
  for (const p of cal?.plans ?? []) p.name = p.plan === cur.result.current || p.plan?.id === cur.result.current?.id ? planName(cur.result.current) : optionLabel(p.plan, cur.result);
  return cal;
}
const announceDrawn = () => { const r = root(); if (r) document.dispatchEvent(new CustomEvent('crophalo:report-drawn', { detail: { root: r, tab: cur.tab, loading: !!cur.loading, failed: !!cur.failed, result: cur.result ?? null } })); };
let lastKind = '';   // which kind of screen the report showed last: loading, failed or ready (a change of kind is the one the motion hook may wrap)
function draw(options) {
  const kind = cur.loading ? 'loading' : cur.failed ? 'failed' : 'ready', from = lastKind;
  lastKind = kind;
  const update = () => { paint(options); announceDrawn(); };
  if (kind !== from) hooks.report(update, { loading: kind === 'loading', to: kind, from }); else update();   // a screen change goes through the hook; an in-place update of the same screen does not
}
function paint({ focus = false, keepScroll = true } = {}) {
  const y = scrollY, r = root();
  if (cur.loading) {
    const live = r.querySelector('.rv-loading'), ctx = loadingCtx(), t = document.createElement('div'); t.innerHTML = loadingHTML(cur.rows, ctx); const n = t.firstElementChild;
    if (live && !focus) {   // the same screen again: change its parts in place, so the count is spoken each time and the keyboard is not moved
      for (const sel of ['.rv-count', '.rv-rows']) { const x = live.querySelector(sel), y = n.querySelector(sel); if (x && y && x.innerHTML !== y.innerHTML) x.innerHTML = y.innerHTML; }
      const act = live.querySelector('#ldAction'), nact = n.querySelector('#ldAction'); if (act && nact && act.innerHTML !== nact.innerHTML && !act.contains(document.activeElement)) act.innerHTML = nact.innerHTML;
      live.setAttribute('aria-busy', n.getAttribute('aria-busy')); return; }
    r.innerHTML = `<div class="rv-wrap">${loadingHTML(cur.rows, ctx)}</div>`; if (focus) $('#ldTitle', r)?.setAttribute('tabindex', '-1'); return; }
  if (cur.failed) { r.innerHTML = `<div class="rv-wrap"><section class="rv-sec"><h1 id="reportTitle" tabindex="-1" aria-describedby="failWhy">${cur.noPlace ? 'Choose your field first.' : 'We couldn’t get weather data.'}</h1><p id="failWhy">${esc(cur.failed)}</p><p class="btnrow">${cur.noPlace ? '' : `<button type="button" class="btn primary" data-act="retry">${WORDS.again}</button>`}<button type="button" class="btn${cur.noPlace ? ' primary' : ''}" data-act="change">${WORDS.back}</button></p></section></div>`; $('#reportTitle', r).focus(); return; }
  r.innerHTML = `${barHTML()}<div class="rv-wrap">${letterBody()}</div>`;
  afterPanel(r);
  markPart();
  paintFresh();   // answers that landed while the strategies were being compared are offered as soon as the report is on screen
  if (focus) { const h = $('#reportTitle', r); h.tabIndex = -1; h.focus(); setTimeout(() => { if (document.activeElement === document.body || !document.activeElement) $('#reportTitle')?.focus({ preventScroll: true }); }, 160); }   // the keyboard starts at the page's heading, also when a screen change took the first focus away
  if (keepScroll) scrollTo(0, y);
}

// What the loading screen needs to know: the seconds so far, and whether "See the report now" is offered (the weather record is in and another row is still reading after five seconds).
const loadingCtx = () => {
  const elapsed = Date.now() - (cur?.t0 ?? Date.now()), power = cur.rows.find(r => r.key === 'power');
  return { elapsed, hideRetry: !!cur.keep && Date.now() - cur.keep < WEATHER_RETRY_MS, canSee: !!cur.weatherIn && elapsed >= SLOW_MS && cur.rows.some(r => r.key !== 'power' && r.state === 'wait') && !cur.seen };
};
// ---- opening
export async function openReport(state, { demo = false } = {}) {
  const mine = ++run;
  cur = { state: structuredClone(state), tab: 'letter', plan: null, rows: freshRows(), loading: true, result: null, climate: null, demo, t0: Date.now(), weatherIn: false, seen: false, late: new Map() };
  lastKind = '';   // a report that opens again is a new screen change, whatever the last one showed
  if (!hasPlace(cur.state)) { cur.loading = false; cur.noPlace = true; cur.failed = 'Tap the map or draw your field, then open the report again.'; draw(); return; }   // no position: nothing is asked of any service
  draw({ focus: true });
  const ticker = setInterval(() => { if (mine !== run || !cur?.loading) { clearInterval(ticker); return; } draw(); }, 1000);   // the seconds and the slow words of the list move once a second
  const rowOf = key => cur.rows.find(r => r.key === key), loc = cur.state.loc, env = { fetch: globalThis.fetch.bind(globalThis), caches: globalThis.caches, climateFrom: seam.climateFrom };
  const smapP = getSmap(loc).catch(() => null), nearP = getNearby(loc).catch(() => null);   // asked now, side by side with the weather; if the place was chosen a while ago they were asked then and are already in
  const setRow = (key, st, reason = '') => { const r = rowOf(key); if (r) { r.state = st; r.reason = reason; } if (cur?.loading) draw(); };
  if (String(loc?.cc ?? '').toUpperCase() !== 'US') setRow('soil', 'skip');
  inFarmCheck(mine);
  nameThePlace(mine);
  const loaded = await spotFor(loc, env, (key, st, reason) => { if (mine !== run) return; setRow(key, st, reason); if (key === 'power' && st === 'ok') cur.weatherIn = true; });
  if (mine !== run) return;
  if (!loaded.ok) { clearInterval(ticker); cur.loading = false; cur.failed = loaded.reason; draw(); return; }
  cur.weatherIn = true;
  cur.climate = loaded.climate; cur.series = loaded.series; cur.note = loaded.note;
  const weatherWith = forecast => { cur.weather = buildWeather({ series: loaded.series, climate: loaded.climate, forecast, loc }); if (cur.weather.ok && loaded.note) cur.weather.note = loaded.note; };
  weatherWith(null);
  // The other lookups are extras: each one that lands after the report is open is kept and offered with "Refresh the report", never put on the page by itself.
  const landed = (name, apply) => { if (mine !== run) return; if (cur.loading) { apply(); return; } cur.late.set(name, apply); paintFresh(); };
  // the slope of a drawn field, from the height map (it can take a while): in before the strategies are compared it is used at once, later it waits for "Refresh the report"
  if (cur.state.area) getDem(loc, outlineOf(cur.state)).then(dem => { if (mine !== run || !cur?.state?.area || !dem?.ok || !fin0(dem.slope)) return; const useDem = () => { if (slopeInto(cur.state, dem)) cur.dem = dem; };
    if (cur.loading && !cur.worked) useDem(); else { cur.late.set(SLOPE_NEWS, useDem); paintFresh(); } }, () => {});
  const forecastP = (loaded.forecastP ?? Promise.resolve(null)).then(forecast => { if (forecast) landed('this week’s weather', () => weatherWith(forecast)); }, () => {});
  const smapDone = smapP.then(reading => { if (mine !== run) return; setRow('smap', reading?.value != null ? 'ok' : 'fail', reading?.value != null ? '' : String(reading?.reason ?? 'It did not answer.')); landed('soil moisture', () => { cur.reading = reading; }); });
  // soil: the farmer's own test first (typed in setup), then the US soil survey for a field in the United States (given a few seconds), else an assumed loam
  const soilNeeded0 = null;
  const soilNeeded = !cur.state.soilTest && cur.state.soil?.mode === 'assumed' && String(cur.state.loc?.cc ?? '').toUpperCase() === 'US';
  if (!soilNeeded) setRow('soil', 'skip');   // no survey is asked for this field: the row is not left waiting
  const soilP = soilNeeded ? Promise.race([getSoilSurvey(loc).catch(() => null), new Promise(r => setTimeout(() => r(null), 4000))]).then(sv => { setRow('soil', sv?.ok ? 'ok' : 'fail', sv?.ok ? '' : String(sv?.reason ?? 'It did not answer.')); return sv; }) : Promise.resolve(null);
  const nearDone = nearP.then(near => { if (mine === run) setRow('crops', near?.nearby?.gap ? 'fail' : 'ok', near?.nearby?.gap ?? ''); return near; });
  const optional = Promise.all([soilP, nearDone, smapDone, forecastP]);
  const seeNow = new Promise(done => { cur.seeNow = () => { cur.seen = true; done('now'); }; });
  const first = await Promise.race([optional.then(() => 'all'), seeNow]);
  if (mine !== run) return;
  const applySoil = sv => { if (sv?.ok && sv.soil.mode === 'manual') { cur.state.soil = sv.soil; cur.state.soilSurveyLine = soilLine(sv); } };
  if (first === 'all') { const [sv, near] = await Promise.all([soilP, nearDone]); applySoil(sv); cur.near = near; }
  else { soilP.then(sv => landed('soil survey', () => applySoil(sv))); nearDone.then(near => landed('crops nearby', () => { cur.near = near; })); }   // the report opens on the weather alone: the crop check says it was not made
  cur.worked = true;   // from here a late answer no longer reaches this run of the comparison
  await work();
  if (mine !== run) return;
  if (loaded.backup && cur.result?.ok) lowerSureness(cur.result);   // the back-up record is rougher: the answer says so and is one point less sure
  startMarket(cur, mine, () => landed('crop prices', () => {})).catch(() => { if (cur) cur.market = undefined; });   // USDA's cash bids for a field in the United States: asked after the answer, never in its way
  startMoney(mine);   // the rough money line under each option; the report does not wait for it
  await new Promise(r => setTimeout(r, motionOff() || loaded.allCached || first === 'now' ? 0 : 150));   // answers that were kept need no pause; fresh ones keep a moment so the rows are seen to finish
  if (mine !== run) return;
  clearInterval(ticker);
  cur.loading = false; draw({ focus: true, keepScroll: false }); scrollTo(0, 0);
}
// "New data has arrived: soil moisture, crops nearby." with one button; spoken politely; more late answers add to the same line. Pressing the button puts everything in and works the answer out again.
function paintFresh() {
  const r = root(); if (!r || !cur || cur.loading) return;
  const host = r.querySelector('.rv-letter'); if (!host) return;
  let line = r.querySelector('#rvFresh');
  if (!cur.late?.size) { line?.remove(); return; }
  if (!line) { host.insertAdjacentHTML('afterbegin', '<div class="rv-fresh card pad" id="rvFresh" role="status"></div>'); line = r.querySelector('#rvFresh'); }
  const html = freshHTML(); if (line.innerHTML !== html) line.innerHTML = html;
}
const SLOPE_NEWS = 'your field’s slope';
const freshHTML = () => `<p>New data has arrived: ${esc([...cur.late.keys()].join(', '))}.</p><button type="button" class="btn primary" data-act="refresh" id="rvRefresh">Refresh the report</button>`;
async function refreshReport() {
  if (!cur?.late?.size) return;
  const mine = run, queue = [...cur.late.values()], needsWork = [...cur.late.keys()].some(k => /crops|soil survey|slope/.test(k));
  cur.late.clear(); for (const apply of queue) { try { apply(); } catch { /* one late answer that cannot be applied leaves the others in */ } }
  if (needsWork) { await work(); if (mine !== run) return; }
  figuresNow(); redrawKeep(); paintFresh();
}
// Draw a ready answer without loading (the tests and the engine's own demo use it): the state and the engine's result.
export async function renderResult(state, result, { climate = null, weather = null, reading = null, imerg, dem, demo = false, series = null } = {}) {
  run++; cur = { state: structuredClone(state), tab: 'letter', plan: result?.recommended?.id ?? null, rows: [], loading: false, result: result ? { ...result, ok: result.ok !== false } : null, climate, weather, reading, imerg, dem, demo, series };   // imerg and dem: answers given in advance (undefined means: ask when the tab opens)
  draw({ focus: true, keepScroll: false });
  inFarmCheck(run);
  startMarket(cur, run, () => redrawKeep()).catch(() => { if (cur) cur.market = undefined; });
  startMoney(run);   // the rough money line, as in a report that was just opened
}
// When the report view opens: a report in hand stays; else the wizard's own answers, if they are enough; else the way back.
export function showReport() {
  if (cur && !cur.loading && !cur.failed) return;
  if (cur?.loading) return;
  const s = currentState();
  if (hasPlace(s) && hasRotation(s) && hasSoil(s)) return void openReport(s);
  root().innerHTML = `<div class="rv-wrap"><section class="rv-sec"><h1 id="reportTitle" tabindex="-1">Your report</h1><p>${WORDS.none}</p><p><button type="button" class="btn primary" data-act="home">${WORDS.home}</button></p></section></div>`;
}

// The outline a report works with: the one the farmer drew, or an estimated 10 ha square round the pin, always flagged.
const outlineOf = state => state.area ? { ...state.area, estimated: false } : estimatedArea(state.loc);
// The tabs that ask the server when they are first opened: Satellites & prices (30 days of satellite rain) and Field (the height map). Each fills its panel when it answers.
function loadFor(part) {
  const mine = run, panel = () => { if (mine === run) redrawKeep(); };
  if (part === 'satellites' && cur.imerg === undefined) { cur.imerg = { loading: true }; getImerg(cur.state.loc).then(r => { cur.imerg = r; panel(); }); }
  if (part === 'satellites' && cur.grace === undefined) { cur.grace = { loading: true }; getGrace(cur.state.loc).then(r => { cur.grace = r; panel(); }); }
  if (part === 'satellites' && cur.hls === undefined) { cur.hls = { loading: true }; getHls(cur.state.loc).then(r => { cur.hls = r; panel(); }); }
  if (part === 'satellites' && cur.eco === undefined) { cur.eco = { loading: true }; getEco(cur.state.loc, e => { if (mine === run) { cur.eco = e; panel(); } }).then(r => { if (mine === run) { cur.eco = r; panel(); } }); }   // drawn again after each of its asks
  if (part === 'trends' && cur.grace === undefined) { cur.grace = { loading: true }; getGrace(cur.state.loc).then(r => { cur.grace = r; panel(); }); }   // shared with the satellite fold: asked once
  if (part === 'trends' && cur.green === undefined) { cur.green = { status: 'loading' }; loadGreenness(cur.state.loc).then(r => { cur.green = r; panel(); }, () => { cur.green = { ok: false }; panel(); }); }
  if (part === 'field' && cur.dem === undefined) { cur.dem = null; cur.demLoading = true; getDem(cur.state.loc, outlineOf(cur.state)).then(r => { cur.dem = r; cur.demLoading = false; panel(); }); }
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
  const plans = farmPlans(r, cur.chosen);
  if (!cur.chosen && r.recommended?.id === r.current?.id && cur.pick !== 'alt') plans.proposed = { ...r.current, kind: 'proposed', name: planName(r.current) };   // a keep answer carries what the farmer grows now: the plan the card shows, never another one
  const payload = { place: spotOf(s, cur.demo && s.name ? { fieldName: s.name } : {}), area: area.ha, outline: s.area ? s.area.pts : null, areaEstimated: !s.area, ...plans, date: today() };
  const note = $('#farmNote'), btn = $('#rbFarm');
  btn.disabled = true;
  const out = await addToFarm(payload, seam.farm);
  btn.disabled = false;
  if (out.ok) { cur.farm = out; cur.farmFor = cur.chosen ?? ''; cur.farmNote = ''; document.dispatchEvent(new CustomEvent('crophalo:did', { detail: { what: 'added', button: btn, label: 'Added', ring: Array.isArray(cur.state.area?.pts) && cur.state.area.pts.length >= 3 ? cur.state.area.pts.map(p => [p[0], p[1]]) : null } })); const nav = document.getElementById('navFarm'); nav?.setAttribute('data-new', '');   // a quiet mark on "My farm" until My farm is opened
    cur.farmNote = 'Added to My farm.'; redrawKeep();
    toast('This field is added to My farm.', { action: 'Open My farm', onAction: () => document.getElementById('navFarm')?.click(), ms: 7000 }); }   // the page stays: the button turns to Added with its check, a star travels to My farm, a screen reader hears the note; nothing opens by itself
  else { cur.farmNote = out.reason; if (note) note.textContent = out.reason; }
}

// ---- Print or save: the sheet with Print and Save as PDF (js/sharemenu.js), built from this report
async function openShare(trigger) {
  if (!cur?.result?.ok) return;
  ensureStyle('css/share.css');
  const [menu, model, notice, units] = await Promise.all([import('./sharemenu.js'), import('./sharemodel.js'), import('./notice.js'), import('./units.js')]);
  const s = cur.state, notes = notice.readNotes().map(n => ({ date: n.date, text: n.text, photo: !!n.photo, kind: n.kind }));
  const report = model.buildShareReport({ state: s, result: cur.result, weather: cur.weather, notes, madeOn: today() });
  const cc = s.loc?.cc ?? '', recordCrop = cur.result.current?.seasons?.[0]?.crop;
  menu.openShareSheet({ report, result: cur.result, state: s, series: cur.series, today: today(), units: units.unitsFor(units.readUnits(), cc), cc, fetch: globalThis.fetch?.bind(globalThis), trigger, cropName: recordCrop ? (cur.result.current.seasons[0] && planName({ seasons: [cur.result.current.seasons[0]] })) : '', inputs: s });
}

// ---- events
function bind() {
  const r = root();
  r.addEventListener('click', event => {
    const jump = event.target.closest('[data-part]'); if (jump) { event.preventDefault(); const el = document.getElementById(jump.dataset.part); partHold.id = jump.dataset.part; partHold.until = Date.now() + 1100; for (const a of $$('.rv-parts a')) { if (a === jump) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); } const goTo = smooth => { const bar = $('#reportBar'); if (!el || !bar) return; const y = el.getBoundingClientRect().top + scrollY - bar.getBoundingClientRect().bottom - 8; scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' }); }; goTo(!motionOff()); setTimeout(() => { const bar = $('#reportBar'); if (el && bar && Math.abs(el.getBoundingClientRect().top - bar.getBoundingClientRect().bottom - 8) > 24) goTo(false); markPart(); }, 900); const h = el?.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } return; }
    const zoom = event.target.closest('[data-zoom]'); if (zoom) return openZoom(zoom);
    const chip = event.target.closest('[data-hy-year]'); if (chip) { cur.hyYear = +chip.dataset.hyYear; redrawKeep(); document.getElementById(`hy-${cur.hyYear}`)?.focus({ preventScroll: true }); return; }
    const t = event.target.closest('[data-act], [data-plan]'); if (!t) return;
    if (t.dataset.act === 'money') { const f = cur?.money?.byPlan?.[t.dataset.plan]; if (f?.ok) openMoneySheet(f, allPlans(cur.result).find(p => p.id === t.dataset.plan), cur.money.rates, unitsNow(), t); return; }
    if (t.dataset.act === 'try' || t.dataset.act === 'untry') { const id = t.dataset.plan; cur.chosen = t.dataset.act === 'untry' ? null : id; cur.preselected = false; cur.picked = true; const open = id ? `sr-${id}` : ''; redrawKeep(); if (open) document.getElementById(open)?.setAttribute('open', ''); toast(cur.chosen ? `You chose: ${optionLabel(allPlans(cur.result).find(p => p.id === id), cur.result)}` : 'Back to our suggestion'); return; }
    const act = t.dataset.act;
    if (act === 'change') return seam.change(cur?.state);
    if (act === 'home') return seam.home();
    if (act === 'share') return void openShare(t);
    if (act === 'tofarm') return void seam.farmOpened?.(cur.farm ?? {});
    if (act === 'remind' && !t.closest('#rmRoot')) return void openRemindDialog({ title: t.dataset.title, when: t.dataset.when, kind: t.dataset.kind, source: t.dataset.source, note: t.dataset.note, hint: t.dataset.hint }, { fieldId: fieldKey(cur.state.loc), trigger: t });
    if (act === 'farm') { if (cur.farm && cur.farmFor === (cur.chosen ?? '')) return; return void (cur.inFarm && !cur.farm ? seam.farmOpened?.({}) : addFarm()); }   // once added, a second press does nothing new; a field that was already in My farm opens it; a different chosen plan adds again
    if (act === 'retry') return void openReport(cur.state);
    if (act === 'fieldok') { const word = fieldWord(cur.state.loc, cur.result?.askField); if (!word) return; cur.state.loc = { ...cur.state.loc, fieldOk: word }; setFieldOk(word); return void openReport(cur.state); }   // the farmer's word, kept like any change of place, and the report worked out again
    if (act === 'movepin') { toPlaceStep(); return seam.change(cur.state); }   // back to where the pin is placed; nothing is set
    if (act === 'seenow') return void cur.seeNow?.();
    if (act === 'keepwaiting') { cur.keep = Date.now(); return; }
    if (act === 'refresh') return void refreshReport();
  });
  r.addEventListener('change', event => { const pick = event.target.closest?.('input[name=rvpick]'); if (pick) { cur.pick = pick.value; redrawKeep(); document.getElementById(`pick-${pick.value}`)?.focus({ preventScroll: true }); return; } const sel = event.target.closest?.('[data-hy-select]'); if (sel && sel.value) { cur.hyYear = +sel.value; redrawKeep(); } });
  addEventListener('scroll', () => { if (!partsTick) partsTick = requestAnimationFrame(() => { partsTick = 0; markPart(); }); }, { passive: true });
  r.addEventListener('toggle', event => { const d = event.target; if (!d.open) return; if (d.id === 'lfSat') loadFor('satellites'); if (d.id === 'lfTrends') loadFor('trends'); if (d.id === 'lfAssumed') loadFor('field'); }, true);   // a fold that asks the server asks when it is first opened
}
// seam: { change(state), home(), farmOpened(result), engine: the engine's worker client (engine-client.js engineLoader) or () => import('./engine.js'), farm: () => import('./farm.js') } (the last two are given by the page start once those files exist)
// The map says a place was chosen ('crophalo:prefetch', detail { lat, lon, outline? }): the lookups the report will want start now, once the place has settled for 600 ms (a dragged pin starts nothing).
let prefetchTimer = 0, prefetchBound = false;
export const PREFETCH_MS = 600;
function bindPrefetch() {
  if (prefetchBound) return; prefetchBound = true;
  document.addEventListener('crophalo:prefetch', event => {
    const d = event.detail ?? {}; clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => prefetchPlace({ lat: d.lat, lon: d.lon, ...(d.cc ? { cc: d.cc } : {}), ...(d.label ? { label: d.label } : {}) }, { fetch: globalThis.fetch.bind(globalThis), caches: globalThis.caches, climateFrom: seam.climateFrom }, d.outline ?? null), PREFETCH_MS);
  });
}
export function initReport(next) { seam = { ...seam, ...next }; setCropNamer(id => planName({ seasons: [{ crop: id }] })); startReminderWatch(); initSources(); bindPrefetch(); for (const sheet of ['calendar', 'satellites', 'field', 'notes', 'remind', 'market']) ensureStyle(`css/${sheet}.css`); if (root()) bind(); }
export const currentReport = () => cur;
export const setSeam = next => { seam = { ...seam, ...next }; };   // for the browser suites: a stand-in engine or farm
