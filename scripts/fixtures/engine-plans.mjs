// The report's two plans as the crop engine really makes them, on the weather recorded for the Barrie demo place: the farm tests use them so that
// what My farm keeps and shows is what the engine said, not a hand-made shape. Needs js/engine.js and the recorded answers in this folder.
import fs from 'node:fs';
import * as K from '../../js/farmchips.js';
import * as S from '../../js/simulate.js';
import { REPORT } from './demo-plans.mjs';

const text = f => fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8');
const fetchRecorded = async url => {
  const f = /power[.]larc/.test(url) ? 'power_barrie.json' : /api[.]open-meteo[.]com\/v1\/forecast/.test(url) ? 'forecast_barrie.json' : /era5_land/.test(url) ? 'era5land_barrie.json' : /archive/.test(url) ? 'era5_barrie.json' : null;
  return f ? { ok: true, status: 200, headers: { get: () => null }, text: async () => text(f) } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
};
export const NOW = Date.parse('2026-11-14T15:00:00Z');
export const PLACE = { lat: 44.4, lon: -79.78, name: 'Barrie', label: 'Barrie, Canada', cc: 'CA' };
// { options, report }: the engine's answer for corn, soybeans, corn, and a report payload that proposes the winter-wheat plan.
export async function realReport(proposedId = 'legume-corn-soy-corn-wheat') {
  K.setDataEnv({ fetch: fetchRecorded, now: () => NOW });
  const made = S.applyReport(S.emptyStore(), { ...REPORT, place: PLACE }, { now: NOW }), farm = S.getFarm(made.store, made.farmId), field = S.getField(farm, made.fieldId);
  const r = await K.whenSettled(K.readingsFor(farm, field));
  K.setDataEnv({});
  const proposed = [r.options.recommended, ...r.options.others].find(p => p.id === proposedId);
  if (!proposed) throw new Error(`the engine did not list ${proposedId}`);
  return { options: r.options, report: { place: PLACE, area: 10, areaEstimated: true, current: r.options.current, proposed, date: '2026-11-15' } };
}

// The daily weather record of the demo place as the report reads it (NASA POWER, recorded), for the land history checks.
import { loadSpot } from '../../js/report-load.js';
export async function realSeries() {
  const got = await loadSpot({ lat: PLACE.lat, lon: PLACE.lon }, { fetch: fetchRecorded, now: () => NOW });
  return got.ok ? got.series : null;
}
