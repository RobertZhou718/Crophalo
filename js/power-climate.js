// NASA POWER's answer (as text or as an object) turned into the weather record and the climate the report works on, with the page's own steps, order and words.
// Pure: no page, no network, no storage, no clock; it answers { ok, series, climate } or { ok: false, reason } and is used by js/engine-worker.js and js/engine-client.js.
// Checked by scripts/test_engine_worker.mjs and scripts/e2e_engine_worker.mjs.
import { buildSeries, powerProblem, seriesProblem } from './data.js';
import { computeClimate } from './climate.js';

export function climateFromPower(power, place) {
  let json = power;
  if (typeof power === 'string') { try { json = JSON.parse(power); } catch { return { ok: false, reason: 'NASA POWER sent an answer Crophalo could not read' }; } }
  const bad = powerProblem(json, place || {});
  if (bad) return { ok: false, reason: bad };
  const series = buildSeries(json, place || {});
  const trouble = series ? seriesProblem(series, 'NASA POWER') : 'NASA POWER sent an answer Crophalo could not read';
  if (trouble) return { ok: false, reason: trouble };
  let climate;
  try { climate = computeClimate(series, place.lat); } catch { return { ok: false, reason: 'The weather could not be turned into figures for this spot.' }; }
  return { ok: true, series, climate };
}

