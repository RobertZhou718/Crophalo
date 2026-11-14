// Crophalo's soil-test form: the boxes of a lab report, drawn inside the "I have a soil test" fold of the water and soil step. Every box is optional;
// an empty box means "Not sure". A number outside its range stays in its box with the reason under it; only usable numbers reach the state.
// Nothing here is pure: it draws and reads the page. The rules are in js/soiltest.js.
// Checked by scripts/e2e_flow.mjs (the form opens, a bad number is explained and kept, Remove clears it) and scripts/test_soil.mjs (the rules).
import { esc } from './words.js';
import { FIELDS, FIELD_LABEL, METHODS, NP_UNITS, EC_UNITS, fieldProblem, partsProblem, cleanSoilTest, FIRST_DATE } from './soiltest.js';

const WORDS = {
  fold: 'I have a soil test', optional: '(optional)',
  lead: 'Type what your lab report says. Every box is optional. A number you type replaces the map’s guess for that property and is marked “from your soil test”. Your soil test stays on this device.',
  date: 'Date of the test', notSure: 'Not sure', parts: 'Soil parts, if your report gives them (%)', partsHelp: 'Two of the three are enough.',
  share: 'Include my soil test when I share a link. Off means the link carries no soil test.', remove: 'Remove my soil test',
  ecHelp: 'If your lab gives a saturated-paste value (ECe), use that one.',
};
const LABEL = { ...FIELD_LABEL, ph: 'pH', om: 'Organic matter (%)', n: 'Nitrate (N)', p: 'Phosphorus (P)', k: 'Potassium (K)', ec: 'Salt (EC)', clay: 'Clay', sand: 'Sand', silt: 'Silt' };
const METHOD_WORDS = { olsen: 'Olsen', bray: 'Bray', mehlich3: 'Mehlich-3', unsure: 'Not sure' };
const UNIT_WORDS = { mgkg: 'mg/kg', ppm: 'ppm', dsm: 'dS/m', mscm: 'mS/cm' };
const today = () => new Date().toISOString().slice(0, 10);

const box = (field, value) => `<label class="field st-field"><span>${esc(LABEL[field])}</span><input type="text" inputmode="decimal" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" data-st="${field}" value="${esc(value ?? '')}" placeholder="${WORDS.notSure}" aria-describedby="stErr-${field}"><small class="st-err" id="stErr-${field}" role="status"></small></label>`;
const select = (key, list, words, value, label) => `<label class="field st-unit"><span class="sr">${esc(label)}</span><select data-st-pick="${key}" aria-label="${esc(label)}">${list.map(v => `<option value="${v}"${v === value ? ' selected' : ''}>${esc(words[v])}</option>`).join('')}</select></label>`;

// The markup for the form, filled from a state's soil test (or empty).
export function soilTestHTML(test) {
  const t = test ?? {}, units = t.units ?? { np: 'mgkg', ec: 'dsm' };
  return `<p class="cap">${WORDS.lead}</p>
    <label class="field st-field"><span>${WORDS.date}</span><input type="date" data-st-date min="${FIRST_DATE}" max="${today()}" value="${esc(t.date ?? '')}"></label>
    <div class="st-grid">${box('ph', t.ph)}${box('om', t.om)}</div>
    <div class="st-grid">${box('n', t.n)}${select('npN', NP_UNITS, UNIT_WORDS, units.np, 'Unit for nitrate')}</div>
    <div class="st-grid">${box('p', t.p)}${select('method', METHODS, METHOD_WORDS, t.method ?? 'unsure', 'How phosphorus was measured')}</div>
    <div class="st-grid">${box('k', t.k)}${select('npK', NP_UNITS, UNIT_WORDS, units.np, 'Unit for potassium')}</div>
    <div class="st-grid">${box('ec', t.ec)}${select('ec', EC_UNITS, UNIT_WORDS, units.ec, 'Unit for salt')}</div><p class="cap">${WORDS.ecHelp}</p>
    <p class="q">${WORDS.parts}</p><div class="st-grid three">${['clay', 'sand', 'silt'].map(f => box(f, t[f])).join('')}</div><p class="cap st-err" id="stErr-parts" role="status">${WORDS.partsHelp}</p>
    <label class="cbrow"><input type="checkbox" class="sr" data-st-share${t.share ? ' checked' : ''}><i class="cbx" aria-hidden="true"></i><span>${WORDS.share}</span></label>
    <p><button type="button" class="btn danger" data-st-remove>${WORDS.remove}</button></p>`;
}
export const foldHTML = test => `<details class="fold-card" id="foldSoilTest"${test ? ' open' : ''}><summary><span class="t">${WORDS.fold} <span class="cap">${WORDS.optional}</span></span></summary><div class="fold-b st-form">${soilTestHTML(test)}</div></details>`;

// Read what is in the boxes right now, as typed.
function readRaw(root) {
  const raw = { units: {} };
  for (const f of FIELDS) raw[f] = root.querySelector(`[data-st="${f}"]`)?.value ?? '';
  raw.date = root.querySelector('[data-st-date]')?.value ?? '';
  raw.method = root.querySelector('[data-st-pick=method]')?.value; raw.units.np = root.querySelector('[data-st-pick=npN]')?.value; raw.units.ec = root.querySelector('[data-st-pick=ec]')?.value;
  raw.share = !!root.querySelector('[data-st-share]')?.checked;
  return raw;
}
// Make the form work. onChange(test) gets the cleaned soil test, or null when nothing usable is typed or the farmer pressed Remove.
export function bindSoilTest(root, onChange) {
  const show = (id, text) => { const n = root.querySelector(`#${id}`); if (n) n.textContent = text; };
  const update = () => {
    const raw = readRaw(root);
    for (const f of FIELDS) {
      const bad = fieldProblem(f, raw[f]);
      root.querySelector(`[data-st="${f}"]`).setAttribute('aria-invalid', bad ? 'true' : 'false');
      show(`stErr-${f}`, bad);
    }
    show('stErr-parts', partsProblem(raw) || WORDS.partsHelp);
    onChange(cleanSoilTest(raw));
  };
  root.addEventListener('input', event => { if (event.target.closest('#foldSoilTest')) update(); });
  root.addEventListener('change', event => { if (event.target.closest('#foldSoilTest')) update(); });
  root.addEventListener('click', event => {
    if (!event.target.closest('[data-st-remove]')) return;
    for (const input of root.querySelectorAll('#foldSoilTest input[type=text], #foldSoilTest input[type=date]')) input.value = '';
    root.querySelector('[data-st-share]').checked = false;
    update();
    root.querySelector('#foldSoilTest summary')?.focus();
  });
}
