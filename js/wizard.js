// Crophalo's setup wizard: four short questions about one field, one screen each (your field, your crops, water and soil, what matters most),
// with a numbered step bar, a Listen line and a sticky bar whose button is only on when the step has what it needs.
// Nothing here is pure: it draws into #view-setup (the map beside it is made once and kept) and keeps the farmer's answers in one state object (js/state.js).
// Checked by scripts/test_wizard.mjs (the pure rules), scripts/e2e_flow.mjs (the steps, the keys, 320 px, the largest text) and scripts/e2e_maptools.mjs (a moved pin keeps the step and the answers).
import { hooks } from './hooks.js';
import { esc } from './words.js';
import { SOIL_MAP_WORDS, countryCode, hasRotation, hasSoil, isGarden, stepsFor, needFor, canGo, rotationSlots, readyAnswers } from './steps.js';
import { STEPS, WATER, FEEL, COLOUR, WORDS } from './words.js';
import { newState, checkSerialized, cleanArea } from './state.js';
import { mattersHTML, inputsChange, inputsClick } from './inputs-step.js';
import { coordText, loadRegions } from './places.js';
import { PRESETS, GARDENS, presetIds, gardenIds, pickerGroups, cropName, cropOf, gardenOf, isPreset } from './crops.js';
import { cropRow, waterPic, soilPic, cropPic } from './pics.js';
import { foldHTML as soilFoldHTML, bindSoilTest } from './soiltestui.js';
import { withSoilTest } from './soiltest.js';
import { enhancePickers, setOffer, pickList } from './croppicker.js';
import { stepPlan, rotationLine, thenWords, repeatWords, previewWords, moreGroups, inOntario, WORDS as CROP_WORDS } from './cropstep.js';
import { initListen, stopSpeaking } from './listen.js';
import { toast } from './toast.js';
import { whyButton } from './srci.js';
import { motionOff } from './motion.js';
import { SAY as MAPSAY } from './mapwords.js';
import { loadName, SETTLE_MS, FINDING, PLACE_UNKNOWN } from './placename.js';
import { mountAreaBlock } from './areablock.js';
import { readUnits, unitsFor } from './units.js';
import { fieldYearsModel, fieldYearsHTML, loadFieldYears, rotationFor, countryOk } from './fieldyears.js';

const $ = (sel, root = document) => root.querySelector(sel), $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export { hasRotation, hasSoil, isGarden, stepsFor, needFor, canGo, rotationSlots };
export const SESSION_KEY = 'crophalo.session';
export { readyAnswers };

let state = newState(), at = 0, where = { report() {}, home() {} }, spot = null, outline = null;   // outline: { ring, used } as the map last told it, for the line under Next
const steps = () => stepsFor(state);

// ---- saved for this tab only, so a reload mid-setup comes back to the same step
function keep() { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ at: steps()[at]?.id, state, demo: !!spot?.demo })); } catch { /* a blocked store costs only the memory */ } }
function recall() {
  try {
    const kept = JSON.parse(sessionStorage.getItem(SESSION_KEY)), checked = checkSerialized(kept?.state);
    if (!checked.ok) return false;
    state = checked.state; spot = kept.demo ? { demo: true } : spot; at = Math.max(0, steps().findIndex(s => s.id === kept.at));
    return true;
  } catch { return false; }
}

// ---- drawing
const radio = (name, value, checked, inner, cls = '') => `<label class="choice ${cls}"><input type="radio" class="sr" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}>${inner}</label>`;
const tile = (name, item, checked, pic = '') => radio(name, item.value, checked, `${pic}<b>${esc(item.title)}</b>${item.sub ? `<small>${esc(item.sub)}</small>` : ''}`, 'tile');
const fold = (id, title, body) => `<details class="fold-card" id="${id}"><summary><span class="t">${title}</span></summary><div class="fold-b">${body}</div></details>`;

// As soon as a place is chosen (a demo, a search result, typed coordinates, a pin, a drawn outline) the lookups the report starts with are asked, with the country kept so the crop map is warmed too; the first answer never waits for the slow ones.
// A quiet line under the area says so: a skeleton while the weather is read, "Weather read." when it is in.
let placeRead = { key: '', words: '' };
function paintPlaceRead() { const el = $('#placeRead'); if (!el) return; el.innerHTML = placeRead.words === 'reading' ? '<span class="sk" style="width:60%;height:12px;display:block"></span><span class="sr">Reading this place’s weather…</span>' : esc(placeRead.words); el.hidden = !placeRead.words; }
function announcePlace() {
  const loc = state.loc; if (!loc) { placeRead = { key: '', words: '' }; return; }
  const key = `${loc.lat},${loc.lon}`; placeRead = { key, words: 'reading' }; paintPlaceRead();
  clearTimeout(announcePlace.t);
  announcePlace.t = setTimeout(async () => {
    const ring = Array.isArray(state.area?.pts) && state.area.pts.length >= 3 ? state.area.pts : Array.isArray(spot?.outline) ? spot.outline.map(([lo, la]) => [la, lo]) : null;
    document.dispatchEvent(new CustomEvent('crophalo:prefetch', { detail: { lat: loc.lat, lon: loc.lon, cc: loc.cc || '', label: loc.label || '', ...(ring ? { outline: ring } : {}) } }));   // the report's own handler asks the lookups (and keeps them for the report)
    try {
      const m = await import('./report-load.js'), got = await m.spotFor({ lat: loc.lat, lon: loc.lon, cc: loc.cc, label: loc.label }, { fetch: globalThis.fetch.bind(globalThis), caches: globalThis.caches });
      if (placeRead.key === key) { placeRead.words = got?.ok ? 'Weather read.' : 'The weather could not be read yet. It will be asked again when you open the report.'; paintPlaceRead(); }
    } catch { if (placeRead.key === key) { placeRead.words = 'The weather could not be read yet. It will be asked again when you open the report.'; paintPlaceRead(); } }
  }, 650);
}
// The field's area under "Your field": the size in the farmer's unit, the corners, "Used in report" and the small outline, from the outline the map holds (the join gives the map's own source with setOutlineSource);
// grey skeleton lines while the field's data load, never an empty area.
let outlineSource = null, areaBlock = null, demoOutline = null;
export const setOutlineSource = fn => { outlineSource = typeof fn === 'function' ? fn : null; };
const fallbackOutline = () => {
  const own = Array.isArray(state.area?.pts) && state.area.pts.length >= 3 ? state.area.pts : null;
  if (own) return { ring: own, used: true };
  const raw = Array.isArray(spot?.outline) && spot.outline.length >= 3 ? spot.outline : demoOutline, demoRing = raw ? raw.map(([lo, la]) => [la, lo]) : null;   // a demo field's outline is lon,lat
  return demoRing ? { ring: demoRing, used: !!spot?.demo } : null;
};
function mountArea() {
  areaBlock?.destroy(); areaBlock = null;
  const host = $('#areaHost'); if (!host) return;
  areaBlock = mountAreaBlock(host, { order: () => (unitsFor(readUnits(), state.loc?.cc).area === 'imperial' ? 'acres' : 'hectares'), now: () => (outlineSource ? outlineSource() : null) ?? fallbackOutline() });
  if (naming) areaBlock.setLoading(true);
  if (spot?.demo && !spot.outline && spot.region && !demoOutline) loadRegions().then(list => { const r = list.find(x => x.id === spot.region); if (r?.outline) { demoOutline = r.outline; areaBlock?.redraw(); } }).catch(() => {});   // the demo field's outline comes from its region
}
// The top line is the place's name; the coordinates are the small line under it, never the same thing twice.
let naming = false, nameTimer = null;
function head() {
  const loc = state.loc, label = loc?.label ?? '';
  const title = !loc ? WORDS.placeLoading : state.name || label || (naming ? FINDING : PLACE_UNKNOWN);
  const same = !!label && !!state.name && (state.name.toLowerCase().includes(label.toLowerCase()) || label.toLowerCase().includes(state.name.toLowerCase())), small = loc ? [state.name && label && !same ? label : '', coordText(loc.lat, loc.lon)].filter(Boolean).join(' · ') : WORDS.placeAsk;   // the name once on top; the country and the coordinates under it, never the name again
  return `<div class="panel-head"><h2 class="panel-name">${esc(title)}</h2>
    <p class="panel-place"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg><span>${esc(small)}</span>${spot?.demo ? `<span class="chip">${WORDS.demoChip}</span>` : ''}</p></div>`;
}
// Asks for the place's name once the position has rested (or at once with now = true: the farmer pressed Next). A place that already has a name is not asked about.
function askName(now = false) {
  clearTimeout(nameTimer); nameTimer = null;
  if (!state.loc || state.name || state.loc.label || spot?.demo) { naming = false; return; }
  naming = true; areaBlock?.setLoading(true);
  const lat = state.loc.lat, lon = state.loc.lon;
  const run = async () => {
    nameTimer = null;
    const got = await loadName(lat, lon);
    if (!state.loc || state.loc.lat !== lat || state.loc.lon !== lon) return;   // the farmer chose another place meanwhile
    naming = false; areaBlock?.setLoading(false);
    if (got.ok && !state.loc.label) { state.loc = { ...state.loc, label: got.name }; keep(); }
    const h = $('#setupRoot .panel-head'); if (h) h.outerHTML = head();
  };
  if (now) run(); else nameTimer = setTimeout(run, SETTLE_MS);
}
function bar() {
  const list = steps();
  return `<ol class="wsteps" aria-label="Steps">${list.map((step, i) => {
    const state_ = i < at ? 'done' : i === at ? 'now' : '', off = i > at + 1;
    return `<li><button type="button" class="wstep ${state_}" data-go="${i}" ${i === at ? 'aria-current="step"' : ''} ${off ? 'disabled' : ''}>
      <span class="wnum" aria-hidden="true">${i < at ? '<svg class="ic"><use href="#i-tick"/></svg>' : i + 1}</span><span class="wlab"><span class="sr">${esc(`Step ${i + 1} of 4: `)}</span>${esc(step.bar)}</span></button></li>`;
  }).join('')}</ol>`;
}
function stepField() {
  const demo = spot?.demo ? `<div class="demo-ready"><p>${esc(WORDS.demoAnswers)}</p><button type="button" class="btn primary" id="demoSee">${esc(WORDS.last)}</button></div>` : '';
  return `${demo}<div id="areaHost" class="area-host"></div><p class="cap place-read" id="placeRead" role="status" aria-live="polite" hidden></p><div id="mapSlot"></div>`;
}
// ---- step 2: what do you grow? (the rules and the words are in js/cropstep.js)
let cropMap = { key: '', status: 'idle', answer: null }, moreOpen = false, fieldYears = { key: '', status: 'idle', answer: null, used: false };
const mapKey = () => (state.loc ? `${state.loc.lat},${state.loc.lon}` : '');
// a region whose list of crops comes from data (the United States: the USDA crop map's crops for the state); none is given yet, so only Ontario's list applies
const listedOffer = () => (globalThis.__cropOffer?.[state.loc?.cc] ?? null);
const demoPreset = () => (spot?.demo && isPreset(spot.rotation) ? spot.rotation : null);
const plan = () => stepPlan({ crop: cropMap.key === mapKey() ? cropMap : { status: 'idle' }, demo: demoPreset(), ontario: !!state.loc && inOntario(state.loc.lat, state.loc.lon), listed: listedOffer() });
const CHECK = '<svg class="rc-check" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4 10.5l4 4 8-9"/></svg>';
const rotCard = (id, { big = false, tag = '', source = '', note = '' } = {}) => {
  const p = PRESETS[id], line = rotationLine(p.slots), [first, ...more] = line.split(', ');
  return radio('rot', id, state.rotation.preset === id, `${CHECK}${tag ? `<span class="rc-tag">${esc(tag)}</span>` : ''}<span class="rc-row">${cropRow(p.slots)}</span><b>${esc(thenWords(p.slots))}</b><small>${esc(repeatWords(p.slots.length))}</small>${source ? `<small class="rc-source">${esc(source)}</small>` : ''}${note ? `<small class="rc-source">${esc(note)}</small>` : ''}`, `rcard${big ? ' rbig' : ''}`);
};
function placeholderCard() {
  return `<div class="rcard rbig rc-wait" aria-hidden="true"><span class="rc-tag">${esc(CROP_WORDS.suggestTitle)}</span><b>${esc(CROP_WORDS.loading)}</b>${CROP_WORDS.loadingSub ? `<small>${esc(CROP_WORDS.loadingSub)}</small>` : ''}<span class="rc-bar"></span></div>`;
}
function yearRows() {
  const own = state.rotation.custom, rows = own.length ? own : [''];
  const select = (value, i) => `<select class="year-pick" data-picker data-year="${i}" aria-label="${esc(WORDS.yearN(i + 1))}"><option value="">${WORDS.chooseCrop}</option>${pickerGroups().map(g => ({ group: g.group, ids: g.ids.filter(id => pickList('', 'all').includes(id)) })).filter(g => g.ids.length).map(g => `<optgroup label="${esc(g.group)}">${g.ids.map(id => `<option value="${id}"${id === value ? ' selected' : ''}>${esc(cropName(id))}</option>`).join('')}</optgroup>`).join('')}</select>`;
  return `<div class="years"><ol class="yearlist">${rows.map((v, i) => `<li class="year"><span class="year-n">${WORDS.yearN(i + 1)}</span>${select(v, i)}<button type="button" class="iconbtn" data-rm="${i}" aria-label="${esc(WORDS.removeYear(i + 1))}" ${rows.length < 2 ? 'disabled' : ''}>−</button></li>`).join('')}</ol>
    ${rows.length < 4 ? `<button type="button" class="btn" id="addYear">${CROP_WORDS.addYear}</button>` : ''}<p class="rc-preview" id="rotPreview" aria-live="polite">${esc(previewWords(own))}</p><p class="cap">${WORDS.yearsNote}</p></div>`;
}
// "What this field grew": the crop map by year at the field's own points, for a field in the United States or Canada, asked once the crop map has named the country (never for a demo field)
function fieldYearsCard() {
  if (!state.loc || fieldYears.key !== mapKey()) return '';
  return fieldYearsHTML(fieldYearsModel({ state: fieldYears.status, answer: fieldYears.answer, country: state.loc.cc, used: fieldYears.used, filled: filledRotation() }));
}
const filledRotation = () => (hasRotation(state) && !state.rotation.garden ? { preset: state.rotation.preset, custom: state.rotation.custom } : null);
async function readFieldYears() {
  if (!state.loc || !countryOk(state.loc.cc)) return;
  const key = mapKey(); if (fieldYears.key === key) return;
  fieldYears = { key, status: 'reading', answer: null, used: false }; if (steps()[at]?.id === 'crops') render();
  const demoRing = Array.isArray(spot?.outline) && spot.outline.length >= 3 ? spot.outline.map(([lo, la]) => [la, lo]) : null;   // a demo field's outline is lon,lat
  const ring = Array.isArray(state.area?.pts) && state.area.pts.length >= 3 ? state.area.pts : demoRing;
  const answer = await loadFieldYears({ lat: state.loc.lat, lon: state.loc.lon, country: state.loc.cc, ring });
  if (key !== mapKey()) return;
  fieldYears = { key, status: answer?.ok === true ? 'ok' : 'down', answer, used: false };
  if (steps()[at]?.id === 'crops') render();
}
function useFieldYears() {
  const model = fieldYearsModel({ state: fieldYears.status, answer: fieldYears.answer, country: state.loc?.cc }), r = model?.rotation;
  if (!r) return;
  state.rotation = { preset: r.preset, custom: r.custom, garden: null, second: {} }; state.touched.rotation = true; fieldYears.used = true; keep(); render({ focus: false });
  say(fieldYearsModel({ state: 'ok', answer: fieldYears.answer, country: state.loc.cc, used: true })?.lines[0] ?? '');
  $('#fieldYears')?.scrollIntoView?.({ block: 'nearest' });
}
function stepCrops() {
  const p = plan(), shown = [p.suggested?.id, ...p.cards].filter(Boolean), picked = state.rotation.preset, garden = state.rotation.garden;
  setOffer(p.restrict ? p.restrict.crops : null);
  const top = p.suggested ? rotCard(p.suggested.id, { big: true, tag: p.suggested.title, source: p.suggested.source, note: p.suggested.note })
    : p.phase === 'loading' ? placeholderCard() : `<p class="rc-msg" role="note">${esc(p.message)}</p>${p.more ? `<details class="fold-card" id="foldGardenWhy"><summary><span class="t">Show more</span></summary><div class="fold-b"><p class="cap">${esc(p.more)}</p></div></details>` : ''}`;
  const groups = moreGroups(shown, p.restrict), inMore = (picked && groups.some(g => g.presets?.includes(picked))) || !!garden, isOpen = moreOpen || inMore;
  const more = groups.map(g => g.presets ? (g.presets.length ? `<h3 class="sub">${esc(g.title)}</h3><div class="rcards compact" role="radiogroup" aria-label="${esc(g.title)}">${g.presets.map(id => rotCard(id)).join('')}</div>` : '')
    : g.gardens ? `<h3 class="sub">${esc(g.title)}</h3><div class="chipsc" role="radiogroup" aria-label="${esc(g.title)}">${g.gardens.map(id => radio('garden', id, garden === id, `${cropPic(id)}<b>${esc(GARDENS[id].name)}</b>`, 'chipc')).join('')}</div>` : `<h3 class="sub">${esc(g.title)}</h3><p class="cap">${esc(g.note)}</p>`).join('');
  const own = picked === 'custom';
  return `${CROP_WORDS.helper ? `<p class="lead rc-helper">${esc(CROP_WORDS.helper)}</p>` : ''}
    ${fieldYearsCard()}<div class="rc-suggest">${top}</div>
    <h2 class="sub">${esc(p.suggested || p.phase === 'loading' ? CROP_WORDS.chooseHead : CROP_WORDS.chooseHeadNone)} ${whyButton('rotations')}</h2>
    <div class="rcards" role="radiogroup" aria-label="Ready rotations">${p.cards.map(id => rotCard(id, { big: true })).join('')}</div>
    ${p.restrict ? `<p class="cap">${esc(p.restrict.note)}</p>` : ''}
    <details class="fold-card" id="foldMoreRot"${isOpen ? ' open' : ''}><summary><span class="t">${esc(CROP_WORDS.more)}</span></summary><div class="fold-b">${more}</div></details>
    <div class="rcards own">${radio('rot', 'custom', own, `${CHECK}<b>${esc(CROP_WORDS.buildOwn)}</b><small>${esc(CROP_WORDS.buildSub)}</small>`, 'rcard rbig own')}</div>${own ? yearRows() : ''}
    <p class="cap">${WORDS.mine}</p>`;
}
// what the farmer chose, in words, for the polite line
const chosenWords = () => { const g = gardenOf(state.rotation.garden); if (g) return CROP_WORDS.treePicked(g.name); const sl = rotationSlots(state); if (!sl.length) return ''; const line = rotationLine(sl); return state.rotation.preset === plan().suggested?.id && plan().phase === 'suggest' ? CROP_WORDS.suggestedPicked(line) : CROP_WORDS.rotationPicked(line); };
let liveEl = null;
function say(text) { if (!liveEl) return; liveEl.textContent = ''; setTimeout(() => { if (liveEl) liveEl.textContent = text; }, 40); }
// ask the crop map once for this place; when it answers, the step is redrawn in place and the suggestion is chosen for a farmer who has not chosen yet
async function readCropMap() {
  if (state.loc && spot?.demo) { import('./report-load.js').then(m => m.getCropMap(state.loc)).catch(() => {}); readFieldYears(); return; }   // a demo field's crop map is asked now too (the same lookup the report shares), so the Overview does not wait for it
  if (!state.loc) return;
  const key = mapKey(); if (cropMap.key === key) return;   // once for each place: a failure is not asked again by redrawing
  cropMap = { key, status: 'loading', answer: null }; if (steps()[at]?.id === 'crops') render();
  let answer = null;
  try { answer = await (await import('./report-load.js')).getCropMap(state.loc); } catch { answer = null; }
  if (key !== mapKey()) return;   // the farmer moved on to another place meanwhile
  cropMap = { key, status: answer?.ok === true ? 'read' : 'failed', answer };
  if (answer?.ok === true && typeof answer.country === 'string' && answer.country && !state.loc.cc) { state.loc = { ...state.loc, cc: answer.country }; keep(); }
  readFieldYears();   // the country the crop map found: the units default follows it (inches, °F and acres only for the United States), unless the farmer chose
  const p = plan();
  if (p.phase === 'garden' && !state.touched.rotation && !hasRotation(state)) { const id = (p.garden ?? []).find(g => gardenOf(g)); if (id) { state.rotation = { ...state.rotation, preset: null, garden: id }; keep(); } }   // the standing crop at the pin is chosen for a farmer who has not chosen yet
  if (p.phase === 'suggest' && !state.touched.rotation && !hasRotation(state)) { state.rotation = { ...state.rotation, preset: p.suggested.id, garden: null }; keep(); }
  if (steps()[at]?.id === 'crops') { const a = document.activeElement?.name; render(); say(p.phase === 'suggest' ? `${CROP_WORDS.suggestTitle}: ${p.suggested.line}. ${state.rotation.preset === p.suggested.id ? 'Chosen.' : ''}` : p.message); }
}
function soilStatus() {
  if (state.soil.mode === 'assumed') return `<p class="cap">${WORDS.soilAssumed}</p>`;
  if (state.soil.mode === 'manual') return '';
  if (state.soil.mode === 'map') return `<p class="cap" id="soilFromMap">Soil from the soil map: ${esc(SOIL_MAP_WORDS[state.soil.texture] ?? 'not named')}. It is not a test of this field. Tap your soil above if yours is different.</p>`;
  return '';
}
function stepSoil() {
  return `<h2 class="sub">${WORDS.waterQ}</h2><div class="tiles3" role="radiogroup" aria-label="${esc(WORDS.waterQ)}">${WATER.map(w => tile('water', w, state.farm.irrigation === w.value, waterPic(w.value, { size: 40 }))).join('')}</div>${spot?.demo && !state.farm.irrigation ? '<p class="cap" id="waterUnknown">Not known: assumed rain-fed. Tap one above if you know.</p>' : ''}
    <div class="soilcard"><h2 class="sub">${WORDS.soilQ}</h2><p class="q">${WORDS.feelQ}</p><div class="tiles4" role="radiogroup" aria-label="${esc(WORDS.feelQ)}">${FEEL.map(f => tile('feel', f, (state.soil.mode === 'manual' || state.soil.mode === 'map') && state.soil.texture === f.value)).join('')}</div><p><button type="button" class="btn" id="assumeSoil">${WORDS.soilAssume}</button></p>
    <p class="q">${WORDS.colourQ}</p><div class="tiles3" role="radiogroup" aria-label="${esc(WORDS.colourQ)}">${COLOUR.map(c => tile('colour', c, state.soil.mode === 'manual' && state.soil.om === c.value, soilPic(c.value, { size: 36 }))).join('')}</div>
    <details class="disc"><summary>${WORDS.colourAbout}</summary><p class="cap">${WORDS.colourWhy}</p></details>${soilStatus()}</div>${soilFoldHTML(state.soilTest)}`;
}
const BODY = { field: stepField, crops: stepCrops, soil: stepSoil, matters: () => mattersHTML(state) };   // step 4 is drawn by js/inputs-step.js

function cta() {
  const step = steps()[at], last = at === steps().length - 1, need = needFor(step.id, state), off = !!need;
  const note = need;
  return `<div class="cta"><button type="button" class="btn lg" id="wBack"><svg class="ic" aria-hidden="true"><use href="#i-back"/></svg>${WORDS.back}</button>
    <button type="button" class="btn primary lg" id="wNext"${off ? ' aria-disabled="true" disabled' : ''}>${last ? WORDS.last : WORDS.next}</button><p class="cap cta-note${note ? ' sr' : ''}" id="ctaNote" role="status">${esc(note)}</p>${outlineLine()}</div>`;
}
// An outline on the map that the farmer has not used yet is said under Next: nothing is used without the farmer saying so.
const outlineLine = () => `<p class="cap cta-note" id="ctaOutline"${outline?.ring && !outline.used ? '' : ' hidden'}>${esc(MAPSAY.next)}</p>`;
export function render({ focus = false } = {}) {
  const step = steps()[at], root = $('#setupRoot');
  const h1 = `<h1 class="${step.id === 'field' ? 'sr' : 'wh'}" id="wHeading">${esc(step.heading)}</h1>`;   // the one h1 of the setup: first in the panel on the field step (its place line is an h2 under it), after the steps bar on the others
  const panel = `<aside class="panel" id="setupPanel" aria-label="Setup">${step.id === 'field' ? h1 : ''}${head()}${bar()}<p class="listen-row"><button type="button" class="listen" id="wListen" hidden><svg class="ic" aria-hidden="true"><use href="#i-speaker"/></svg><span class="t">Listen to this step</span></button></p>
    ${step.id === 'field' ? '' : h1}<div class="wbody">${BODY[step.id]()}</div>${cta()}</aside>`;
  // only the panel is drawn again: the map beside it is made once and kept, so a new answer or step never rebuilds it (its pin, outline and view stay)
  const map = $('#setupMap', root), old = $('#setupPanel', root);
  if (map && old) old.outerHTML = panel;
  else if (map) map.insertAdjacentHTML('beforebegin', panel);
  else root.innerHTML = `${panel}<div class="mapcol" id="setupMap" role="group" aria-label="Map"></div>`;
  root.dataset.step = step.id;   // the stylesheet shrinks the map on a phone once the field is chosen
  enhancePickers($('#setupRoot'));
  mountArea(); paintPlaceRead();
  initListen($('#wListen'), step.listen);
  if (focus) { $('#wHeading').tabIndex = -1; $('#wHeading').focus(); $('#setupPanel').scrollTop = 0; if (!motionOff()) scrollTo({ top: 0, behavior: 'smooth' }); else scrollTo(0, 0); }
  document.title = `Farm setup · Crophalo`;
  keep();
}
function refresh(keepFocus) {   // redraw the step, then put the keyboard back on the radio it was on
  const a = document.activeElement, name = a?.name, value = a?.value, till = a?.dataset?.till, year = a?.dataset?.year;
  render();
  const yb = a?.dataset?.yearbtn ?? year, again = name ? $(`input[name="${name}"][value="${CSS.escape(value ?? '')}"]`) : till ? $(`[data-till="${till}"]`) : yb ? $(`[data-yearbtn="${yb}"]`) : null;
  if (keepFocus && again) again.focus();
}

// ---- moving between steps
function go(i, focus = true) { stopSpeaking(); const from = at; at = Math.max(0, Math.min(steps().length - 1, i)); if (from !== at) hooks.step(() => render({ focus }), { from, to: at }); else render({ focus }); }   // a move between steps goes through the hook (js/macro-setup.js); with none loaded it just draws
function next() {
  const step = steps()[at];
  if (!canGo(step.id, state)) { toast(needFor(step.id, state)); return; }
  if (naming) askName(true);   // the field is confirmed: its name is asked for now
  if (at < steps().length - 1) go(at + 1); else where.report(structuredClone(state), { demo: !!spot?.demo });
}

// ---- the farmer's answers
function choose(target) {
  const { name, value } = target;
  if (name === 'rot') { state.rotation = { ...state.rotation, preset: value, garden: null, custom: value === 'custom' ? (state.rotation.custom.length ? state.rotation.custom : ['corn', 'soy']) : state.rotation.custom }; state.touched.rotation = true; }
  else if (name === 'garden') { state.rotation = { ...state.rotation, garden: value, preset: null }; state.touched.rotation = true; if (at >= steps().length) at = steps().length - 1; }
  else if (name === 'water') { state.farm.irrigation = value; state.touched.farm = true; }
  else if (name === 'feel') state.soil = { ...state.soil, mode: 'manual', texture: value };
  else if (name === 'colour') state.soil = { ...state.soil, mode: 'manual', om: value };
  if (name === 'feel' || name === 'colour') { state.soil.mode = 'manual'; }
  refresh(true);
  if (name === 'rot' || name === 'garden') say(chosenWords());
}
// The farmer's own soil test (the fold in step 3): what is typed replaces the soil for those properties; removing it brings back what was chosen before. The bar is redrawn so Next follows, and the boxes are left alone while the farmer types.
let soilBefore = null;
function onSoilTest(test) {
  if (test && !state.soilTest) soilBefore = { ...state.soil };
  state.soilTest = test; state.soil = test ? withSoilTest(soilBefore ?? state.soil, test).soil : (soilBefore ?? state.soil); if (!test) soilBefore = null;
  keep(); const bar = $('.cta'); if (bar) bar.outerHTML = cta();
}
function bind() {
  const root = $('#setupRoot');
  bindSoilTest(root, onSoilTest);
  root.addEventListener('toggle', event => { if (event.target.id === 'foldMoreRot') moreOpen = event.target.open; }, true);
  const after = r => { refresh(true); if (r.focus) $(r.focus)?.focus(); if (r.say) say(r.say); };   // step 4's answers (js/inputs-step.js)
  root.addEventListener('change', event => {
    const t = event.target, inp = inputsChange(t, state);
    if (inp) return void after(inp);
    if (t.matches('input[type=radio]')) choose(t);
    else if (t.matches('[data-habit]')) { state.farm[t.dataset.habit] = t.checked; state.touched.farm = true; $('#takenAs') && refresh(true); keep(); }
    else if (t.matches('.year-pick')) { const list = [...(state.rotation.custom.length ? state.rotation.custom : [''])]; list[+t.dataset.year] = t.value; state.rotation.custom = list.filter(Boolean); state.touched.rotation = true; refresh(true); }
  });
  root.addEventListener('click', event => {
    const t = event.target.closest('button, a');
    if (!t) return;
    const inp = inputsClick(t, state); if (inp) return void after(inp);
    if (t.dataset.go) return go(+t.dataset.go);
    if (t.id === 'wNext') return next();
    if (t.id === 'useFieldYears') return useFieldYears();
    if (t.id === 'demoSee') return where.report(structuredClone(state), { demo: true });
    if (t.id === 'wBack') return at === 0 ? where.home() : go(at - 1);
    if (t.id === 'assumeSoil') { state.soil = { ...state.soil, mode: 'assumed' }; return refresh(false); }
    if (t.id === 'addYear') { state.rotation.custom = [...state.rotation.custom, ...(state.rotation.custom.length ? [] : ['']), 'wheat'].slice(0, 4); return refresh(false); }
    if (t.dataset.rm !== undefined) { state.rotation.custom = state.rotation.custom.filter((_, i) => i !== +t.dataset.rm); return refresh(false); }
    if (t.dataset.till) { state.farm.tillage = t.dataset.till; state.touched.farm = true; return refresh(true); }
  });
  // the map tells the outline: kept in the state when it is used for the report, and said under Next while it is not
  document.addEventListener('crophalo:area', event => {
    const d = event.detail;
    state.area = d && state.loc ? cleanArea({ pts: d.pts, ha: d.ha }, state.loc) : null;
    keep();
  });
  document.addEventListener('crophalo:outline', event => {
    outline = event.detail?.ring ? { ring: event.detail.ring, used: !!event.detail.used } : null;
    const line = $('#ctaOutline');
    if (line) line.hidden = !(outline?.ring && !outline.used);
  });
}

// ---- the seam to the home and the map
// Start the setup for a chosen place: { lat, lon, name, place|country, region?, demo? }. null means the farmer will tap the map.
export function setPlace(chosen) {
  spot = chosen;
  const fresh = newState();
  if (chosen) {
    const lat = Math.round(chosen.lat * 1e4) / 1e4, lon = Math.round(chosen.lon * 1e4) / 1e4;
    fresh.loc = { lat, lon, label: chosen.place || chosen.country || '', cc: countryCode(chosen.country ?? chosen.place) };
    fresh.name = chosen.name || '';
    if (chosen.demo) Object.assign(fresh, readyAnswers(fresh, chosen));
  }
  demoOutline = null; state = fresh; at = 0; outline = null; cropMap = { key: '', status: 'idle', answer: null }; fieldYears = { key: '', status: 'idle', answer: null, used: false }; moreOpen = false;
  askName();
  render({ focus: false });
  setTimeout(() => { const v = $('#view-setup'); if (v && !v.hidden && (document.activeElement === document.body || !document.activeElement)) { const h = $('#wHeading'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } } }, 160);   // when the setup opens the keyboard goes to its heading (the one h1)
  readCropMap();
  announcePlace();
  document.dispatchEvent(new CustomEvent('crophalo:place', { detail: chosen ? { lat: fresh.loc.lat, lon: fresh.loc.lon, name: fresh.name, country: chosen.country ?? chosen.place ?? '', demo: !!chosen.demo, region: chosen.region ?? null, from: 'setup' } : null }));
}
// The field moved (a pin moved on the map, or coordinates typed in): only the place changes. Every answer and the step are kept, and only the panel's
// head is drawn again. from: 'map' sends nothing back; 'outside' tells the map, which then flies there.
export function movePlace(chosen, { from = 'map' } = {}) {
  if (!chosen || !Number.isFinite(+chosen.lat) || !Number.isFinite(+chosen.lon)) return;
  const lat = Math.round(chosen.lat * 1e4) / 1e4, lon = Math.round(chosen.lon * 1e4) / 1e4, first = !state.loc;
  state.loc = { lat, lon, label: chosen.place ?? chosen.country ?? state.loc?.label ?? '', cc: state.loc?.cc ?? '' };
  if (typeof chosen.name === 'string') state.name = chosen.name;
  if (state.area && !cleanArea(state.area, state.loc)) state.area = null;   // the report's outline must hold the pin; the map sends the moved outline next
  askName();   // a moved pin with no name of its own is named again once it rests
  const headNow = $('#setupPanel .panel-head');
  if (headNow) headNow.outerHTML = head();
  if (first) {   // the field step can go on now: the Next button and the line under it follow without drawing the panel again (focus stays where it is)
    const step = steps()[at], need = needFor(step.id, state), next = $('#wNext'), under = $('#ctaNote');
    if (next) { next.disabled = !!need; if (need) next.setAttribute('aria-disabled', 'true'); else next.removeAttribute('aria-disabled'); }
    if (under) under.textContent = need;
  }
  keep();
  readCropMap();   // the crop map is asked for the new place (once for each place); the step is redrawn only while it is the crops step
  if (from === 'outside') document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat, lon, name: state.name, country: state.loc.label, from: 'outside' } }));
}
export const currentState = () => structuredClone(state);
// The report's field question (a pin the crop map shows as not farmland). setFieldOk: the farmer's word "This is my field", kept for this pin only (js/state.js cleanLoc drops it once the pin moves).
// toPlaceStep: "Draw my field" opens the setup on its first step, where the pin is placed; nothing else changes.
export function setFieldOk(word) { if (!state.loc || !word) return; state.loc = { ...state.loc, fieldOk: word }; keep(); }
export function toPlaceStep() { at = 0; keep(); render({ focus: false }); }
export function initWizard(seam) {
  where = { ...where, ...seam };
  if (!$('#setupRoot')) return;
  bind();
  liveEl = document.createElement('p'); liveEl.className = 'sr'; liveEl.setAttribute('role', 'status'); liveEl.setAttribute('aria-live', 'polite'); $('#view-setup')?.append(liveEl);   // outside the redrawn panel, so what it says is spoken
  if (recall()) { askName(); render(); readCropMap(); } else render();
}
