// The joins of the report: the one function each other part of the app owns, called here by name. While a function does not exist the report shows the honest
// "not read yet" line and never a sample number. When the engine's file is in, nothing here changes: it is found by its own name.
// Not pure: it loads files on demand. Checked by scripts/test_report.mjs (no engine gives { ok: false } and never a made-up plan) and scripts/e2e_flow.mjs.
import { NOT_READ } from './report-view.js';
import { computeClimate, applyScenario } from './climate.js';

// The engine names its own rule set 'crophalo'; the source table holds that card once, under 'rules'.
const SOURCE_ALIAS = { crophalo: 'rules' };

// optionsFor(state, climate, spot) lives in js/engine.js (the report engine). It answers { current, recommended, others, reason, evidence, gaps, risks, sureness }.
// The climate the options are worked out on: the real one, or, when the farmer has moved a what-if slider, the same record moved by it (rain by a percentage, temperatures by degrees).
// A record that cannot be moved leaves the real climate, never a made-up one.
export function climateFor(series, climate, sc, lat) {
  const moved = sc && ((+sc.rainPct || 0) !== 0 || (+sc.tempC || 0) !== 0);
  if (!moved || !series) return climate;
  try { return computeClimate(applyScenario(series, sc), lat); } catch { return climate; }
}
export async function getOptions(state, climate, spot, load = null, opts = {}) {   // opts: { today } so the plans start after the day the report is made   // load: the engine's worker client (engine-client.js engineLoader) or () => import('./engine.js'), handed in by the page start; with none, the answer is "not read yet"
  let engine = null;
  try { engine = load ? await load() : null; } catch { /* the file is not there yet */ }
  if (typeof engine?.optionsFor !== 'function') return { ok: false, reason: NOT_READ };
  try {
    const result = await engine.optionsFor(state, climate, spot, opts);   // a promise when the engine is the worker client (engine-client.js engineLoader), a plain answer when it is the module itself
    const refusal = typeof result?.refusal === 'string' ? result.refusal : result?.refused === true && typeof result.reason === 'string' ? result.reason : '';   // the engine refuses a place (no water, a season too short): only its one plain sentence is shown
    if (refusal) return { ok: false, refused: true, reason: refusal.trim() };
    if (result?.notFarmland && typeof result.reason === 'string') return { ok: false, reason: result.reason, notFarmland: true, ...(result.askField ? { askField: result.askField } : {}) };   // water, sea or ice, or no growing season: said in its own words
    if (!(result && result.recommended && result.current)) return { ok: false, reason: NOT_READ };
    const evidence = Array.isArray(result.evidence) ? result.evidence.map(e => ({ ...e, sources: (e.sources || []).map(key => SOURCE_ALIAS[key] || key) })) : result.evidence;
    return { ...result, evidence, ok: true };
  } catch (e) { return { ok: false, reason: 'The options could not be worked out just now. Try again, or change an answer.' }; }
}
// addFromReport(payload) lives in js/farm.js (My Farm). It answers { farmId, fieldId } and opens My Farm on that field.
export async function addToFarm(payload, load = null) {   // load: () => import('./farm.js'), handed in by the page start; with none My Farm is "not connected yet"
  let farm = null;
  try { farm = load ? await load() : null; } catch { /* My Farm is not built into this copy yet */ }
  if (typeof farm?.addFromReport !== 'function') return { ok: false, reason: 'My farm is not connected yet, so the field could not be added.' };
  try { const r = await farm.addFromReport(payload); return r?.fieldId ? { ok: true, ...r } : { ok: false, reason: 'My farm did not take the field. Try again.' }; }
  catch { return { ok: false, reason: 'My farm did not take the field. Try again.' }; }
}
