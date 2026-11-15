// Crophalo's soil-survey suite: the survey's answer turned into the report's soil (texture, organic matter band and percent), the sentence naming the survey, a blank layer left unknown, a place with no survey, and the rule that the farmer's own soil test comes first.
// RULE: never loosen a check to make it pass. No network: stand-ins in the shape of the server's soil lookup. Run: node scripts/test_soilload.mjs
import { surveyToSoil, soilLine, loadSoilSurvey, forgetSoilRoute } from '../js/soil-load.js';
import { withSoilTest } from '../js/soiltest.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

const ANSWER = { ok: true, survey: 'SSURGO', mapunit: { name: 'Yutan silty clay loam' }, soils: [{ name: 'Yutan', percent: 85, top: { from_cm: 0, to_cm: 25, organic_matter_pct: 3.2, ph: 6.4, sand_pct: 18, silt_pct: 62, clay_pct: 20 } }, { name: 'Tieville', percent: 10, top: { organic_matter_pct: 2.0, sand_pct: 80, silt_pct: 10, clay_pct: 10 } }] };
const s = surveyToSoil(ANSWER);
check('the main soil is the largest share, its top layer gives the texture and the organic matter band', s.ok && s.name === 'Yutan' && s.soil.texture === 'silt' && s.soil.om === 'med' && s.soil.omPct === 3.2 && s.soil.mode === 'manual' && s.survey === 'SSURGO', brief(s));
check('a blank organic matter stays unknown and the soil stays assumed, never 0', (() => { const r = surveyToSoil({ ...ANSWER, soils: [{ name: 'X', percent: 100, top: { organic_matter_pct: null, sand_pct: 40, silt_pct: 40, clay_pct: 20 } }] }); return r.ok && r.soil.mode === 'assumed' && r.soil.om === null && r.soil.omPct === null && r.soil.texture === 'loam' && r.complete === false; })());
check('a soil with no texture is passed over for the next one', surveyToSoil({ ...ANSWER, soils: [{ name: 'Blank', percent: 90, top: { organic_matter_pct: 1, sand_pct: null, silt_pct: null, clay_pct: null } }, { name: 'Next', percent: 8, top: { organic_matter_pct: 5, sand_pct: 75, silt_pct: 10, clay_pct: 8 } }] }).name === 'Next');
check('no texture anywhere, a failed answer or nothing: not ok, with a reason in words', !surveyToSoil({ ok: true, soils: [{ name: 'x', percent: 1, top: {} }] }).ok && /no soil texture/.test(surveyToSoil({ ok: true, soils: [{ name: 'x', percent: 1, top: {} }] }).reason) && surveyToSoil({ ok: false, reason: 'The USDA soil survey covers only the United States' }).reason.startsWith('The USDA') && !surveyToSoil(null).ok);
check('the sentence names the survey, the soil, the layer and that the farmer\'s own test would replace it', /Soil: from the detailed US soil survey \(SSURGO\), the main soil here \(Yutan\), top layer\. Your own soil test would replace it\./.test(soilLine(s)) && /general US soil map/.test(soilLine({ ...s, survey: 'STATSGO2' })) && /organic matter is not given/.test(soilLine({ ...s, complete: false })) && soilLine({ ok: false }) === '');
await (async () => {
  const get = body => async () => ({ json: async () => body });
  same('a field in Canada is not asked: the survey covers the United States only', (await loadSoilSurvey({ lat: 43.13, lon: -80.75, cc: 'CA' }, get(ANSWER))).ok, false);
  check('a US field is asked and answered', (await loadSoilSurvey({ lat: 41.15, lon: -96.47, cc: 'US' }, get(ANSWER))).ok === true);
  let url = ''; await loadSoilSurvey({ lat: 41.15, lon: -96.47, cc: 'US' }, async u => { url = u; return { json: async () => ANSWER }; });
  check('only the position is sent, to four decimals', url === '/api/soilfield?lat=41.1500&lon=-96.4700', url);
  check('a failed or slow lookup leaves the soil as it was, said in words', /did not answer/.test((await loadSoilSurvey({ lat: 41, lon: -96, cc: 'US' }, async () => { throw new Error('x'); })).reason) && /did not answer/.test((await loadSoilSurvey({ lat: 41, lon: -96, cc: 'US' }, () => new Promise(() => {}), 20)).reason));
})();
// the order: own test, then survey, then assumed
const own = withSoilTest(s.soil, { clay: 50, sand: 20, om: 6 });
check('the farmer\'s own soil test replaces what the survey gave, for the properties typed', own.soil.texture === 'clay' && own.soil.om === 'high' && own.from.includes('texture') && own.from.includes('om'), brief(own));
{ let asked = 0; forgetSoilRoute();
  const gone = async () => { asked++; return { status: 404, json: async () => ({}) }; };
  const a1 = await loadSoilSurvey({ lat: 41, lon: -96, cc: 'US' }, gone), a2 = await loadSoilSurvey({ lat: 41, lon: -96, cc: 'US' }, gone);
  check('a server without the soil route is asked once, then never again this visit, and the soil stays as it was', asked === 1 && a1.ok === false && a2.ok === false && /not available/.test(a2.reason), `${asked}`); forgetSoilRoute(); }
console.log(`soilload: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
