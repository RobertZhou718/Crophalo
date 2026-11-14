// Crophalo's setup wizard: four short questions about one field, one screen each (your field, your crops, water and soil, what matters most),
// with a numbered step bar, a Listen line and a sticky bar whose button is only on when the step has what it needs.
// Nothing here is pure: it draws into #view-setup and keeps the farmer's answers in one state object (js/state.js).
// Checked by scripts/test_wizard.mjs (the pure rules) and scripts/e2e_flow.mjs (the steps, the keys, 320 px, the largest text).
import { esc } from './words.js';
import { hasRotation, hasSoil, isGarden, stepsFor, needFor, canGo, rotationSlots, readyAnswers, isReady } from './steps.js';
import { STEPS, WATER, FEEL, COLOUR, MATTERS, TILLAGE, HABITS, PARCEL_FOR, PARCEL_ELSE, WORDS } from './words.js';
import { newState, checkSerialized, PRIORITY_SETS } from './state.js';
import { parseCoords, coordText } from './places.js';
import { PRESETS, GARDENS, presetIds, gardenIds, pickerGroups, cropName, cropOf, gardenOf, isPreset } from './crops.js';
import { cropRow, waterPic, soilPic, cropPic } from './pics.js';
import { enhancePickers } from './croppicker.js';
import { initListen, stopSpeaking } from './listen.js';
import { toast } from './toast.js';
import { motionOff } from './motion.js';

const $ = (sel, root = document) => root.querySelector(sel), $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export { hasRotation, hasSoil, isGarden, stepsFor, needFor, canGo, rotationSlots };
export const SESSION_KEY = 'crophalo.session';
export { readyAnswers };

let state = newState(), at = 0, where = { report() {}, home() {} }, spot = null;
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

function head() {
  const place = state.loc ? [state.name, state.loc.label].filter(Boolean).join(' · ') || coordText(state.loc.lat, state.loc.lon) : WORDS.placeLoading;
  return `<div class="panel-head"><h2 class="panel-name">${esc(state.name || (state.loc ? coordText(state.loc.lat, state.loc.lon) : WORDS.placeLoading))}</h2>
    <p class="panel-place"><svg class="ic" aria-hidden="true"><use href="#i-pin"/></svg><span>${esc(place)}</span>${spot?.demo ? `<span class="chip">${WORDS.demoChip}</span>` : ''}</p></div>`;
}
function bar() {
  const list = steps();
  return `<ol class="wsteps" aria-label="Steps">${list.map((step, i) => {
    const state_ = i < at ? 'done' : i === at ? 'now' : '', off = i > at + 1;
    return `<li><button type="button" class="wstep ${state_}" data-go="${i}" ${i === at ? 'aria-current="step"' : ''} ${off ? 'disabled' : ''}>
      <span class="wnum" aria-hidden="true">${i < at ? '<svg class="ic"><use href="#i-tick"/></svg>' : i + 1}</span><span class="wlab"><span class="sr">${esc(`Step ${i + 1} of 4: `)}</span>${esc(step.bar)}</span></button></li>`;
  }).join('')}</ol>`;
}
function parcel() {
  const links = PARCEL_FOR[state.loc?.cc] ?? [PARCEL_ELSE];
  return `<p>${esc(WORDS.parcelLead)}</p><ul class="plinks">${links.map(([name, url]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a></li>`).join('')}</ul>`;
}
function shortRoad() {   // a demo region comes with ready answers: one tap reaches the report, the four steps stay for anyone who wants to change one
  return spot?.demo && isReady(state) ? `<div class="road"><p><b>${WORDS.roadTitle}</b><br><span class="cap">${WORDS.roadSub}</span></p><button type="button" class="btn primary lg" id="wRoad">${WORDS.last}</button></div>` : '';
}
function stepField() {
  return `${shortRoad()}${fold('foldCoords', esc(WORDS.fold), `<form class="coords" id="coordForm"><label class="field"><span>${WORDS.coordLabel}</span><input type="text" id="coordInput" inputmode="decimal" autocomplete="off" autocapitalize="off" enterkeyhint="go" spellcheck="false" value="${state.loc ? esc(coordText(state.loc.lat, state.loc.lon)) : ''}"></label><button type="submit" class="btn">${WORDS.go}</button></form>${parcel()}`)}
    <p class="cap" id="mapSlot">${WORDS.mapMissing}</p>`;
}
function rotationCards() {
  const cards = presetIds().filter(id => id !== 'custom').map(id => radio('rot', id, state.rotation.preset === id, `<span class="rc-row">${cropRow(PRESETS[id].slots)}</span><b class="sr">${esc(PRESETS[id].label)}</b>`, 'rcard')).join('');
  return `<div class="rcards" role="radiogroup" aria-label="Crops you grow now">${cards}${radio('rot', 'custom', state.rotation.preset === 'custom', `<b>${WORDS.buildOwn}</b><small>${WORDS.buildSub}</small>`, 'rcard own')}</div>`;
}
function yearRows() {
  const own = state.rotation.custom, rows = own.length ? own : [''];
  const select = (value, i) => `<select class="year-pick" data-picker data-year="${i}" aria-label="${esc(WORDS.yearN(i + 1))}"><option value="">${WORDS.chooseCrop}</option>${pickerGroups().map(g => `<optgroup label="${esc(g.group)}">${g.ids.map(id => `<option value="${id}"${id === value ? ' selected' : ''}>${esc(cropName(id))}</option>`).join('')}</optgroup>`).join('')}</select>`;
  return `<div class="years">${rows.map((v, i) => `<div class="year"><span class="year-n">${WORDS.yearN(i + 1)}</span>${select(v, i)}<button type="button" class="iconbtn" data-rm="${i}" aria-label="${esc(WORDS.removeYear(i + 1))}" ${rows.length < 2 ? 'disabled' : ''}>−</button></div>`).join('')}
    ${rows.length < 4 ? `<button type="button" class="btn" id="addYear">${WORDS.addYear}</button>` : ''}<p class="cap">${WORDS.yearsNote}</p></div>`;
}
function stepCrops() {
  const slots = rotationSlots(state), g = gardenOf(state.rotation.garden);
  const name = g ? g.name : slots.length ? slots.map(id => cropName(id, true)).join(' → ') : WORDS.rotName;
  const note = g ? WORDS.garden : slots.length ? (slots.length === 1 ? WORDS.rotSame : WORDS.rotCycle(slots.length)) : '';
  const trees = gardenIds().slice(0, 6).map(id => radio('garden', id, state.rotation.garden === id, `${cropPic(id)}<b>${esc(GARDENS[id].name)}</b>`, 'chipc')).join('');
  return `<div class="wheel"><p class="wheel-name" id="rotName">${esc(name)}</p><p class="cap" id="rotNote">${esc(note)}</p></div>
    <p class="cap">${WORDS.noSuggest}</p>${rotationCards()}${state.rotation.preset === 'custom' ? yearRows() : ''}
    <h2 class="sub">${WORDS.trees}</h2><div class="chipsc" role="radiogroup" aria-label="${esc(WORDS.trees)}">${trees}</div><p class="cap">${WORDS.mine}</p>`;
}
function soilStatus() {
  if (state.soil.mode === 'assumed') return `<p class="cap">${WORDS.soilAssumed}</p>`;
  if (state.soil.mode === 'manual') return `<p class="cap">${WORDS.soilMine}</p>`;
  return `<p class="cap">${WORDS.soilMapOff} <button type="button" class="link" id="assumeSoil">${WORDS.soilAssume}</button></p>`;
}
function stepSoil() {
  const soilMark = !state.soil.mode ? `<span class="chip warn">${WORDS.tapOne}</span>` : '';
  return `<h2 class="sub">${WORDS.waterQ}</h2><div class="tiles3" role="radiogroup" aria-label="${esc(WORDS.waterQ)}">${WATER.map(w => tile('water', w, state.farm.irrigation === w.value, waterPic(w.value, { size: 40 }))).join('')}</div>
    <div class="soilcard"><h2 class="sub">${WORDS.soilQ} ${soilMark}</h2><p class="q">${WORDS.feelQ}</p><div class="tiles4" role="radiogroup" aria-label="${esc(WORDS.feelQ)}">${FEEL.map(f => tile('feel', f, state.soil.mode === 'manual' && state.soil.texture === f.value)).join('')}</div>
    <p class="q">${WORDS.colourQ}</p><div class="tiles3" role="radiogroup" aria-label="${esc(WORDS.colourQ)}">${COLOUR.map(c => tile('colour', c, state.soil.mode === 'manual' && state.soil.om === c.value, soilPic(c.value, { size: 36 }))).join('')}</div>
    <details class="disc"><summary>${WORDS.colourAbout}</summary><p class="cap">${WORDS.colourWhy}</p></details>${soilStatus()}</div>`;
}
function stepMatters() {
  const taken = [state.farm.tillage === 'notill' ? 'no-till' : state.farm.tillage === 'conventional' ? 'conventional tillage' : 'min-till', state.farm.coverOK ? 'you can sow cover crops' : 'no cover crops', state.farm.labor ? 'short on workers or machines' : 'enough workers and machines'].join(', ');
  return `<div class="tiles3 big" role="radiogroup" aria-label="${esc(STEPS[3].heading)}">${MATTERS.map(m => radio('matters', m.value, state.prioPreset === m.value, `<svg class="ic" aria-hidden="true"><use href="#${m.icon}"/></svg><b>${esc(m.title)}</b>`, 'tile')).join('')}</div>
    <details class="fold-card" id="foldMore"><summary><span class="t">${WORDS.more} <span class="cap">${WORDS.optional}</span></span></summary><div class="fold-b">
      <p class="cap" id="takenAs">${esc(WORDS.takenAs(taken))}</p><p class="q">${WORDS.tillage}</p>
      <div class="seg" role="radiogroup" aria-label="${WORDS.tillage}">${TILLAGE.map(t => `<button type="button" role="radio" aria-checked="${state.farm.tillage === t.value}" data-till="${t.value}">${t.title}</button>`).join('')}</div>
      ${HABITS.map(h => `<label class="swrow"><span>${esc(h.title)}<small>${esc(h.sub)}</small></span><input type="checkbox" role="switch" class="sr" data-habit="${h.key}"${state.farm[h.key] ? ' checked' : ''}><i class="sw" aria-hidden="true"></i></label>`).join('')}</div></details>`;
}
const BODY = { field: stepField, crops: stepCrops, soil: stepSoil, matters: stepMatters };

function cta() {
  const step = steps()[at], last = at === steps().length - 1, need = needFor(step.id, state), off = !!need;
  const note = need || (last ? WORDS.ready : '');
  return `<div class="cta"><button type="button" class="btn lg" id="wBack"><svg class="ic" aria-hidden="true"><use href="#i-back"/></svg>${WORDS.back}</button>
    <button type="button" class="btn primary lg" id="wNext"${off ? ' aria-disabled="true" disabled' : ''}>${last ? WORDS.last : WORDS.next}</button>${note ? `<p class="cap cta-note" id="ctaNote" role="status">${esc(note)}</p>` : '<p class="cap cta-note" id="ctaNote" role="status"></p>'}</div>`;
}
export function render({ focus = false } = {}) {
  const step = steps()[at], root = $('#setupRoot');
  root.innerHTML = `<aside class="panel" id="setupPanel" aria-label="Setup">${head()}${bar()}<p class="listen-row"><button type="button" class="listen" id="wListen" hidden><svg class="ic" aria-hidden="true"><use href="#i-speaker"/></svg><span class="t">Listen to this step</span></button></p>
    <h1 class="${step.id === 'field' ? 'sr' : 'wh'}" id="wHeading">${esc(step.heading)}</h1><div class="wbody">${BODY[step.id]()}</div>${cta()}</aside><div class="mapcol" id="setupMap" role="group" aria-label="Map"></div>`;
  enhancePickers($('#setupRoot'));
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
function go(i, focus = true) { stopSpeaking(); at = Math.max(0, Math.min(steps().length - 1, i)); render({ focus }); }
function next() {
  const step = steps()[at];
  if (!canGo(step.id, state)) { toast(needFor(step.id, state)); return; }
  if (at < steps().length - 1) go(at + 1); else where.report(structuredClone(state));
}

// ---- the farmer's answers
function choose(target) {
  const { name, value } = target;
  if (name === 'rot') { state.rotation = { ...state.rotation, preset: value, garden: null, custom: value === 'custom' ? (state.rotation.custom.length ? state.rotation.custom : ['corn', 'soy']) : state.rotation.custom }; state.touched.rotation = true; }
  else if (name === 'garden') { state.rotation = { ...state.rotation, garden: value, preset: null }; state.touched.rotation = true; if (at >= steps().length) at = steps().length - 1; }
  else if (name === 'water') { state.farm.irrigation = value; state.touched.farm = true; }
  else if (name === 'feel') state.soil = { ...state.soil, mode: 'manual', texture: value };
  else if (name === 'colour') state.soil = { ...state.soil, mode: 'manual', om: value };
  else if (name === 'matters') { state.prioPreset = value; state.prio = [...PRIORITY_SETS[value]]; }
  if (name === 'feel' || name === 'colour') { state.soil.mode = 'manual'; }
  refresh(true);
}
function bind() {
  const root = $('#setupRoot');
  root.addEventListener('change', event => {
    const t = event.target;
    if (t.matches('input[type=radio]')) choose(t);
    else if (t.matches('[data-habit]')) { state.farm[t.dataset.habit] = t.checked; state.touched.farm = true; $('#takenAs') && refresh(true); keep(); }
    else if (t.matches('.year-pick')) { const list = [...(state.rotation.custom.length ? state.rotation.custom : [''])]; list[+t.dataset.year] = t.value; state.rotation.custom = list.filter(Boolean); state.touched.rotation = true; refresh(true); }
  });
  root.addEventListener('click', event => {
    const t = event.target.closest('button, a');
    if (!t) return;
    if (t.dataset.go) return go(+t.dataset.go);
    if (t.id === 'wNext') return next();
    if (t.id === 'wRoad') return void where.report(structuredClone(state));
    if (t.id === 'wBack') return at === 0 ? where.home() : go(at - 1);
    if (t.id === 'assumeSoil') { state.soil = { ...state.soil, mode: 'assumed' }; return refresh(false); }
    if (t.id === 'addYear') { state.rotation.custom = [...state.rotation.custom, ...(state.rotation.custom.length ? [] : ['']), 'wheat'].slice(0, 4); return refresh(false); }
    if (t.dataset.rm !== undefined) { state.rotation.custom = state.rotation.custom.filter((_, i) => i !== +t.dataset.rm); return refresh(false); }
    if (t.dataset.till) { state.farm.tillage = t.dataset.till; state.touched.farm = true; return refresh(true); }
  });
  root.addEventListener('submit', event => {
    if (event.target.id !== 'coordForm') return;
    event.preventDefault();
    const at4 = parseCoords($('#coordInput').value);
    if (!at4 || at4.reason) return void toast(at4?.reason ?? WORDS.badCoords);
    setPlace({ lat: at4.lat, lon: at4.lon, name: '', place: '' });
  });
}

// ---- the seam to the home and the map
// Start the setup for a chosen place: { lat, lon, name, place|country, region?, demo? }. null means the farmer will tap the map.
export function setPlace(chosen) {
  spot = chosen;
  const fresh = newState();
  if (chosen) {
    const lat = Math.round(chosen.lat * 1e4) / 1e4, lon = Math.round(chosen.lon * 1e4) / 1e4;
    fresh.loc = { lat, lon, label: chosen.place || chosen.country || '', cc: '' };
    fresh.name = chosen.name || '';
    if (chosen.demo) Object.assign(fresh, readyAnswers(fresh, chosen));
  }
  state = fresh; at = 0;
  render({ focus: false });
  document.dispatchEvent(new CustomEvent('crophalo:place', { detail: chosen ? { lat: fresh.loc.lat, lon: fresh.loc.lon, name: fresh.name, country: chosen.country ?? chosen.place ?? '', demo: !!chosen.demo } : null }));
}
export const currentState = () => structuredClone(state);
export function initWizard(seam) {
  where = { ...where, ...seam };
  if (!$('#setupRoot')) return;
  bind();
  if (recall()) render(); else render();
}
