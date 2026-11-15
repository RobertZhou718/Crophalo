// Crophalo's suite for the three strategies a field is given to compare (js/engine.js, js/compare.js, js/nearby.js): the three demo fields run as the report runs them, on the
// recorded NASA POWER answers, the recorded crop-map answers (USDA Cropland Data Layer for Mead and Beltsville, AAFC Annual Crop Inventory for Barrie) and FAOSTAT's country
// lists. A crop that is less common nearby is said so on its strategy, a place where nothing else suits says so, and "keep" beside a higher-scoring option says why.
/*
 * Run: node scripts/test_strategies.mjs (no network). The last line is "N passed, M failed". Add "print" to see each field's strategies.
 */
import fs from 'node:fs';
import { buildSeries } from '../js/data.js';
import { computeClimate } from '../js/climate.js';
import { optionsFor, STRONG } from '../js/engine.js';
import { spotFields } from '../js/nearby.js';
import { engineSpot } from '../js/near-load.js';
import { newState } from '../js/state.js';
import { readyAnswers, countryCode } from '../js/steps.js';
import { localiseDeep, metricLeft } from '../js/unitstext.js';
import { unitsFor } from '../js/units.js';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };
const read = f => JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const REGIONS = JSON.parse(fs.readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8')), FAO = read('faostat-gate.json');
const TODAY = '2026-11-15', PRINT = process.argv.includes('print');

export function runField(id, power, map, { fao = FAO, mapAnswer = null } = {}) {
  const r = REGIONS.find(x => x.id === id), S = buildSeries(read(power), { lat: r.lat, lon: r.lon }), C = computeClimate(S, S.lat, { today: TODAY });
  const base = { ...newState(), name: r.name, loc: { lat: Math.round(r.lat * 1e4) / 1e4, lon: Math.round(r.lon * 1e4) / 1e4, label: r.country, cc: countryCode(r.country) } };
  const st = { ...base, ...readyAnswers(base, { ...r, demo: true }) };
  const near = spotFields(mapAnswer ?? read(map), fao, st.loc.cc);
  return { res: optionsFor(st, C, engineSpot(st, near), { today: TODAY }), near, st, C };
}
const planOf = (res, id) => [res.current, ...res.others].find(p => p.id === id);
const show = (id, res) => { console.log(`\n${id}: suggestion = ${res.recommended === res.current ? 'keep' : 'change'}; ${res.reason}`);
  res.strategies.forEach(s => { const p = planOf(res, s.id); console.log(`  [${s.role}] ${p.name} · ${p.score ?? 'no score'} · ${p.fit}\n      ${s.text}`); });
  if (res.fewWhy) console.log(`  ${res.fewWhy}`); };

const FIELDS = [['mead-field', 'power_mead.json', 'mead_cropsnear.json'], ['beltsville-field', 'power_beltsville.json', 'beltsville_cropsnear.json'], ['barrie-field', 'power_barriefield.json', 'barrie_cropsnear.json']];
for (const [id, power, map] of FIELDS) {
  const { res, near } = runField(id, power, map);
  if (PRINT) show(id, res);
  const plans = res.strategies.map(s => planOf(res, s.id));
  ok(`${id}: three strategies to compare`, res.strategies.length === 3, `${res.strategies.length}; ${res.fewWhy}`);
  ok(`${id}: what is grown now comes first`, res.strategies[0]?.role === 'now' && res.strategies[0].id === 'current');
  ok(`${id}: the three are three different plans`, new Set(plans.map(p => p?.id)).size === res.strategies.length && new Set(plans.map(p => p?.name)).size === res.strategies.length, plans.map(p => p?.name).join(' | '));
  ok(`${id}: at least one strategy changes the crops themselves`, plans.slice(1).some(p => p && p.slots.join() !== res.current.slots.join()), plans.map(p => p?.slots.join('>')).join(' | '));
  ok(`${id}: with three strategies nothing says too few were found`, res.strategies.length < 3 || !res.fewWhy);
  // a crop the nearby-crops rule had struck out is never used silently
  const struck = new Set(near.absent ?? []);
  for (const s of res.strategies.slice(1)) {
    const p = planOf(res, s.id), odd = p.slots.filter(c => struck.has(c) && !res.current.slots.includes(c));
    ok(`${id}: ${p.name}: a crop that is rare nearby is said so on the strategy`, !odd.length || (/Less common near you|Not seen near you/.test(s.text) && typeof p.lessCommon === 'string' && s.text.includes(p.lessCommon)), s.text);
    ok(`${id}: ${p.name}: no such line without such a crop`, odd.length > 0 || !/Less common near you|Not seen near you/.test(s.text), s.text);
  }
  // the suggestion never scores below a listed option without the reason in sight
  const top = Math.max(...res.others.filter(p => Number.isFinite(p.score)).map(p => p.score), -Infinity), rec = res.recommended;
  if (Number.isFinite(rec?.score) && top > rec.score) {
    const best = res.others[0], gain = best.score - rec.score;
    if (best.flag === 'holds' && gain > 0) {
      ok(`${id}: keep beside the best option, ${gain} points higher, says why`, new RegExp(`It scores ${gain} points? higher, which is too small a difference to change what works; it is listed below as an option worth a look\\.`).test(res.reason), res.reason);
      ok(`${id}: such a lead is under the engine's own line for a firm change`, gain < STRONG, `${gain}`);
    } else if (gain > 0) ok(`${id}: keep beside an option that only just suits says so`, /only just suits, so it is worth a look, not a firm change/.test(res.reason), res.reason);
    for (const p of res.others.filter(p => p !== best && p.flag !== 'fails' && p.score > rec.score && p.score > best.score).slice(0, 1))
      ok(`${id}: ${p.name} scores above the kept rotation and the answer says why it is not the suggestion`, res.reason.includes(`${p.name} scores ${p.score}, but `) && /not our suggestion\./.test(res.reason), res.reason);
  }
}
// Mead: the third rotation uses a crop that is grown nearby, only on less land than the usual line, and says how much in acres
{
  const { res } = runField(...FIELDS[0]), third = res.strategies[2], p = third && planOf(res, third.id);
  ok('Mead: the third strategy is a new rotation, not the same crops again', !!p && p.slots.join() !== 'corn,soy', p?.slots.join('>'));
  ok('Mead: its line names the crop and how much of it grows nearby', !!third && /Less common near you: winter wheat is grown on about 210 ha nearby\./.test(third.text), third?.text);
  const us = localiseDeep(res, unitsFor({}, 'US')), usPlan = planOf(us, third?.id);
  ok('Mead: on the page of a United States field the area reads in acres', /Less common near you: winter wheat is grown on about [\d,]+ acres nearby\./.test(usPlan?.whyLines[0] ?? ''), usPlan?.whyLines[0]);
  ok('Mead: on the page of a United States field no strategy keeps a metric figure (snow depth reads in inches)', metricLeft(JSON.stringify(us.strategies.map(s => planOf(us, s.id)))).length === 0 && /3 inches of snow/.test(JSON.stringify(usPlan)), metricLeft(JSON.stringify(us.strategies.map(s => planOf(us, s.id)))).join(' | '));
  ok('Mead: the line is the first under why, so it is in sight when the strategy is opened', p?.whyLines[0] === p?.lessCommon && !!p?.lessCommon);
  ok('Mead: the line that says rare crops are not suggested names this strategy as the exception', p?.evidence.some(e => /are not suggested here .+ This strategy is the exception: without winter wheat/.test(e.text)), p?.evidence.map(e => e.text).filter(t => /not suggested/.test(t)).join(' | '));
  ok('Mead: no other strategy carries that exception', [res.current, planOf(res, res.strategies[1].id)].every(q => !q.lessCommon && !q.evidence.some(e => /the exception/.test(e.text))));
  ok('Mead: the new rotation keeps the farmer\'s corn and soybeans and adds to them', ['corn', 'soy'].every(c => p?.slots.includes(c)), p?.slots.join('>'));
  ok('Mead: the farmer\'s own answer stays what it was: the second strategy is the cover crop on the same rotation', planOf(res, res.strategies[1].id).slots.join() === 'corn,soy');
}
// A place where the crop map shows nothing else at all, and the country's list holds nothing else that suits: still said honestly
{
  const a = read('mead_cropsnear.json'), only = { ...a, crops: a.crops.filter(c => ['corn', 'soy'].includes(c.crop)), wider: [] };
  const none = { ...FAO, countries: { ...FAO.countries, US: { ...FAO.countries.US, area: Object.fromEntries(Object.entries(FAO.countries.US.area).map(([k, v]) => [k, ['corn', 'soy', 'rice'].includes(k) ? v : 0])) } } };
  const st0 = runField(...FIELDS[0], { mapAnswer: only, fao: none });
  const state = { ...st0.st, farm: { ...st0.st.farm, coverOK: false } };
  const res = optionsFor(state, st0.C, engineSpot(state, st0.near), { today: TODAY });
  if (PRINT) show('nothing else suits', res);
  ok('nothing else suits: fewer than three strategies', res.strategies.length < 3, String(res.strategies.length));
  ok('nothing else suits: the page says so in words', /^Only .+ can be compared here: .+\. Ask farmers near you/.test(res.fewWhy), res.fewWhy);
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
