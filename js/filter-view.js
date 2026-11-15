// Crophalo's "Change and see" panel on the report: the answers that drive the result (how the field gets water, how it is worked, the soil by feel, what matters most) and the two what-if sliders (rain, warmth), as the house controls.
// Changing one works the report out again at once through the engine, with no new lookup; "Reset to my answers" puts them back. The farmer's saved answers are never changed: the panel edits the report's own copy.
// Pure: markup and the changes of a state. Checked by scripts/test_filter.mjs (every control, the change of a state, the reset) and scripts/e2e_filter.mjs (in a page: the recalculation, the reset, the left column and the phone fold).
import { esc } from './words.js';
import { WATER, FEEL, MATTERS, TILLAGE } from './words.m3.js';
import { PRIORITY_SETS } from './state.js';

export const WORDS = Object.freeze({
  title: 'Change and see', lead: 'Change an answer to see the report follow. Nothing is looked up again.', reset: 'Reset to my answers',
  note: 'Changed here only: your saved answers stay.', water: 'How the field gets water', tillage: 'How it is worked', soil: 'Soil, by feel', matters: 'What matters most', rain: 'Rainfall', temp: 'Temperature',
});
// the part of a state this panel edits, copied: the report's own copy of the answers, and the one the reset goes back to
export const pick = s => structuredClone({ farm: { irrigation: s?.farm?.irrigation ?? null, tillage: s?.farm?.tillage ?? null }, soil: s?.soil ?? null, prio: s?.prio ?? null, prioPreset: s?.prioPreset ?? null, sc: s?.sc ?? { rainPct: 0, tempC: 0 } });
export const differs = (s, base) => JSON.stringify(pick(s)) !== JSON.stringify(base);
// One change applied to a state (the report's copy). name: 'water' | 'tillage' | 'soil' | 'matters' | 'rain' | 'temp'. Answers true when the value was acceptable.
export function apply(state, name, value) {
  if (!state) return false;
  if (name === 'water' && WATER.some(w => w.value === value)) { state.farm = { ...state.farm, irrigation: value }; return true; }
  if (name === 'tillage' && TILLAGE.some(t => t.value === value)) { state.farm = { ...state.farm, tillage: value }; return true; }
  if (name === 'soil' && FEEL.some(f => f.value === value)) { state.soil = { ...state.soil, mode: 'manual', texture: value }; return true; }   // as the setup does
  if (name === 'matters' && Object.hasOwn(PRIORITY_SETS, value)) { state.prio = [...PRIORITY_SETS[value]]; state.prioPreset = value; return true; }
  if (name === 'rain') { const v = Math.max(-40, Math.min(30, Math.round(Number(value) / 5) * 5)); if (!Number.isFinite(v)) return false; state.sc = { ...(state.sc ?? { rainPct: 0, tempC: 0 }), rainPct: v }; return true; }
  if (name === 'temp') { const v = Math.max(0, Math.min(4, Math.round(Number(value) * 2) / 2)); if (!Number.isFinite(v)) return false; state.sc = { ...(state.sc ?? { rainPct: 0, tempC: 0 }), tempC: v }; return true; }
  return false;
}
// The soil tile that is on: only a soil described by feel counts; an assumed soil has none on.
const feelOf = s => (s?.soil?.mode === 'manual' || s?.soil?.mode === 'map' || s?.soil?.mode === 'auto') && FEEL.some(f => f.value === s.soil.texture) ? s.soil.texture : '';
const tiles = (name, label, list, on, cls = '') => `<fieldset class="rv-ff"><legend>${esc(label)}</legend><div class="rv-ff-tiles ${cls}" role="radiogroup" aria-label="${esc(label)}">${list.map(x => `<label class="choice tile${x.value === on ? ' is-on' : ''}"><input type="radio" class="sr" name="ff-${name}" id="ff-${name}-${esc(x.value)}" value="${esc(x.value)}" data-ff="${name}"${x.value === on ? ' checked' : ''}><b>${esc(x.title)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</label>`).join('')}</div></fieldset>`;
const slider = (name, label, min, max, step, value, text) => `<label class="rv-slider"><span>${esc(label)}</span><input type="range" id="ff-${name}" data-ff="${name}" min="${min}" max="${max}" step="${step}" value="${value}" aria-valuetext="${esc(text)}" style="--p:${(value - min) / (max - min) * 100}%"><small id="ff-${name}-text">${esc(text)}</small></label>`;
export const rainText = v => (v === 0 ? 'As recorded' : `${v > 0 ? '+' : ''}${v}% rain`);
export const tempText = v => (v === 0 ? 'As recorded' : `+${v} °C warmer`);
// state: the report's copy of the answers; base: what the reset goes back to; open: whether the panel starts open (the left column on a wide screen)
export function filterHTML(state, base, { open = false } = {}) {
  if (!state) return '';
  const sc = state.sc ?? { rainPct: 0, tempC: 0 }, changed = base ? differs(state, base) : false;
  return `<details class="rv-filter" id="lfFilter"${open ? ' open' : ''}><summary><span class="t">${esc(WORDS.title)}</span></summary><div class="rv-filter-body" id="rvFilter">
    <p class="cap">${esc(WORDS.lead)}</p>
    ${tiles('water', WORDS.water, WATER, state.farm?.irrigation ?? '')}
    ${tiles('tillage', WORDS.tillage, TILLAGE, state.farm?.tillage ?? '')}
    ${tiles('soil', WORDS.soil, FEEL, feelOf(state))}
    ${tiles('matters', WORDS.matters, MATTERS.map(m => ({ value: m.value, title: m.title })), state.prioPreset ?? '')}
    <fieldset class="rv-ff"><legend>If the weather shifts</legend>${slider('rain', WORDS.rain, -40, 30, 5, sc.rainPct, rainText(sc.rainPct))}${slider('temp', WORDS.temp, 0, 4, 0.5, sc.tempC, tempText(sc.tempC))}</fieldset>
    <p class="rv-ff-actions"><button type="button" class="btn" id="ffReset" data-ff-reset${changed ? '' : ' disabled'}>${esc(WORDS.reset)}</button></p>
    <p class="cap" id="ffNote">${esc(WORDS.note)}</p></div></details>`;
}
