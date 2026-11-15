// Crophalo's soil from the US soil survey: one lookup for the field's place, turned into the three things the report reads (texture, organic matter band and percent) and the plain sentence that says where they came from.
// The order is the farmer's own soil test first, then the soil survey, then an assumed average loam; this file is only the second. A figure the survey leaves blank stays unknown, never 0. Only a field in the United States is asked.
// Pure but for the one fetch: surveyToSoil(), soilLine(), loadSoilSurvey(). Checked by scripts/test_soilload.mjs (answers in the shape of the server's soil lookup, a blank layer, a place with no survey, a failed lookup).
import { omBand } from './soiltest.js';
import { apiUrl } from './api.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
export const SOIL_MS = 25e3;
const textureOf = (clay, sand, silt) => (!fin(clay) || !fin(sand) && !fin(silt) ? null : clay >= 35 ? 'clay' : fin(silt) && silt >= 50 && clay < 27 ? 'silt' : fin(sand) && sand >= 70 && clay < 15 ? 'sand' : 'loam');
// answer: { ok, survey: 'SSURGO'|'STATSGO2', mapunit: { name }, soils: [{ name, percent, top: { organic_matter_pct, sand_pct, silt_pct, clay_pct } }] } or { ok: false, reason }.
// The soil taken is the main soil of the map unit (the largest share) that has a top layer with texture; the farmer is told which survey and which soil.
export function surveyToSoil(answer) {
  if (!answer || answer.ok !== true || !Array.isArray(answer.soils)) return { ok: false, reason: typeof answer?.reason === 'string' && answer.reason ? answer.reason : 'The soil survey was not read.' };
  const main = [...answer.soils].filter(s => s && s.top).sort((a, b) => (fin(b.percent) ? b.percent : -1) - (fin(a.percent) ? a.percent : -1)).find(s => textureOf(s.top.clay_pct, s.top.sand_pct, s.top.silt_pct));
  if (!main) return { ok: false, reason: 'The soil survey has no soil texture at this place, so an average loam is assumed.' };
  const t = main.top, texture = textureOf(t.clay_pct, t.sand_pct, t.silt_pct), om = fin(t.organic_matter_pct) ? t.organic_matter_pct : null;
  return { ok: true, soil: { mode: texture && om !== null ? 'manual' : 'assumed', texture, om: om !== null ? omBand(om) : null, omPct: om !== null ? Math.min(om, 30) : null }, survey: answer.survey ?? '', name: String(main.name ?? ''), percent: fin(main.percent) ? main.percent : null, complete: om !== null };
}
export const SURVEY_NAMES = Object.freeze({ SSURGO: 'the detailed US soil survey (SSURGO)', STATSGO2: 'the general US soil map (STATSGO2)' });
// One sentence for the report: which survey, which soil, which layer, and what is still assumed.
export function soilLine(s) {
  if (!s?.ok) return '';
  const where = SURVEY_NAMES[s.survey] ?? 'the US soil survey';
  return `Soil: from ${where}, the main soil here${s.name ? ` (${s.name})` : ''}, top layer. ${s.complete ? 'Your own soil test would replace it.' : 'Its organic matter is not given, so that is assumed. Your own soil test would replace it.'}`;
}
// The lookup, asked once for a field in the United States; anything else, or a failure, gives { ok: false, reason } and the soil stays as it was.
let routeGone = false;   // a server without the soil route answers 404 once; it is not asked again this visit
export const forgetSoilRoute = () => { routeGone = false; };
export async function loadSoilSurvey(loc, get = globalThis.fetch?.bind(globalThis), ms = SOIL_MS) {
  const lat = Number(loc?.lat), lon = Number(loc?.lon);
  if (String(loc?.cc ?? '').toUpperCase() !== 'US') return { ok: false, reason: 'The US soil survey covers only the United States.' };
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof get !== 'function') return { ok: false, reason: 'No place to look at.' };
  if (routeGone) return { ok: false, reason: 'The soil survey is not available here, so an average loam is assumed.' };
  try { return surveyToSoil(await Promise.race([get(apiUrl(`/api/soilfield?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`)).then(r => { if (r.status === 404) { routeGone = true; throw new Error('no route'); } return r.json(); }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms))])); }
  catch { return { ok: false, reason: 'The soil survey did not answer, so an average loam is assumed.' }; }
}
