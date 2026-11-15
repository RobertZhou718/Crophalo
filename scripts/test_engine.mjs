// Crophalo's offline suite for the report engine (js/engine.js) with its fit checks (js/fit.js) and stress test (js/sure.js): the rules at their edges, the
// hostile cases, the score's invariance to how a cycle is written, the second-crop credit rule, the must-not crops at a few places,
// and the Ontario walkthrough on the recorded NASA POWER answers for Barrie and for Oxford County, with the grown-nearby gate
// (js/nearby.js) on the AAFC crop-map answers recorded for both.
/*
 * Run: node scripts/test_engine.mjs (no network). The last line is "N passed, M failed".
 */
import fs from 'node:fs';
import { flagged } from './wordguard.mjs';
import * as E from '../js/engine.js';
import * as F from '../js/fit.js';
import * as SU from '../js/sure.js';
import * as SE from '../js/season.js';
import * as N from '../js/nearby.js';
import * as CMP from '../js/compare.js';
import { cropOf } from '../js/crops.js';
import { ONTARIO_LISTED } from '../js/cropstep.js';
import { PLACES, climateOf, barrie, oxford, TODAY } from './hand_climates.mjs';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };
const same = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const fin = Number.isFinite;
const ISO = /^\d{4}-\d\d-\d\d$/;
// An answer of "keep" beside an option that scores a little higher now carries its reason in one or two more sentences (js/words.compare.js keepWords): the main reason is the first.
const mainReason = r => String(r).replace(/ It scores \d+ points? higher, which is too small a difference to change what works(; it is listed below as an option worth a look)?\./, '').replace(/ [A-Z][^.]* scores \d+, but [^.]*, not our suggestion\.$/, '');
const BANNED = /NaN|undefined|null|\[object|%|likely|probab|expected|chance|forecast|guarantee|\bsafe\b/i;

const state = (more = {}) => ({
  rotation: { preset: 'corn-soy', custom: [], garden: null, second: {} },
  farm: { irrigation: 'none', tillage: 'reduced', livestock: false, coverOK: true, labor: false },
  soil: { mode: 'assumed', texture: null, om: null, omPct: null }, soilTest: null, avoid: [], prio: [3, 3, 3, 3, 3], ...more,
});
const BARRIE = { lat: 44.4, lon: -79.78, country: 'CA' };
const { C, recorded } = barrie();
same('the Barrie record is the NASA POWER answer recorded today', recorded, TODAY);

// every sentence a plan or a result carries
const sentencesOf = R => [R.reason, ...R.gaps, ...R.risks, ...R.evidence.map(e => e.text), ...R.sureWhy.map(s => s.text),
  ...[R.current, ...R.others].filter(Boolean).flatMap(p => [p.name, p.fit, p.why, ...p.whyLines, ...p.gaps, ...p.risks, ...p.evidence.map(e => e.text), ...p.seasons.map(s => s.timing)])];

// ---- the gates (js/fit.js)
const arctic = climateOf(PLACES.arctic), tropic = climateOf(PLACES.humidTropic), yukon = climateOf(PLACES.yukon), warm = climateOf(PLACES.longSummer), valley = climateOf(PLACES.hotValley);
same('no wheat or canola on an Arctic coast: the warmest month under 14 °C', [F.feasible('wheat', arctic).gate, F.feasible('canola', arctic).gate], ['minhot', 'minhot']);
same('no wheat or barley in the humid lowland tropics', [F.feasible('wheat', tropic).ok, F.feasible('barley', tropic).gate], [false, 'coolhumid']);
same('no corn or soybeans in a subarctic valley: too few frost-free days', [F.feasible('corn', yukon).gate, F.feasible('soy', yukon).gate], ['frostfree', 'frostfree']);
same('no rain-fed rice where it rains under 1,000 mm', F.feasible('rice', valley).gate, 'minrain');
ok('with full irrigation the water gate is passed (the farmer says water is not the limit)', !F.feasible('corn', valley).ok && F.feasible('corn', valley, { irrigation: 'full' }).ok);
same('a soil test of pH 7.8 and 9 dS/m rules out corn and soybeans, every limit checked first', [F.feasible('corn', warm, { soilTest: { ph: 7.8, ec: 9 } }).gate, F.feasible('soy', warm, { soilTest: { ph: 7.8, ec: 9 } }).gate, F.soilTestVeto('corn', { ph: 7.8, ec: 9 }).length], ['soil', 'soil', 1]);
same('pH 4.0 and 9 dS/m: both limits are named for soybeans', F.soilTestVeto('soy', { ph: 4, ec: 9 }).length, 2);
ok('a field above a crop\'s height limit plus 150 m', F.feasible('cotton', warm, { elev: 1700 }).gate === 'height' && F.feasible('cotton', warm, { elev: 1600 }).gate !== 'height');
ok('water ratio: Barrie corn gets about 7 of every 10 mm it needs', Math.abs(F.supplyOf('corn', C).ratio - 0.72) < 0.05, `${F.supplyOf('corn', C).ratio}`);
ok('an unknown texture is read as loam and said so', F.supplyOf('corn', C, { texture: 'gravel' }).assumedTexture === true && F.supplyOf('corn', C, { texture: 'clay' }).assumedTexture === false);
same('hostile ids are no crops', [F.feasible('toString', C).gate, F.feasible('__proto__', C).gate, F.cropFit('constructor', C), F.gardenFit('valueOf', C)], ['unknown', 'unknown', -9, -1]);
same('no climate: no fit, said plainly', [F.feasible('corn', null).gate, F.gardenFit('apple', null), F.cropFit('corn', null)], ['noclimate', -1, -9]);

// ---- the stress test (js/sure.js)
const [, cold, hot, dry, wet] = SU.scenarios(C);
same('five variants', SU.scenarios(C).map(v => v.variant), ['data', 'colder', 'hotter', 'drier', 'wetter']);
ok('2 °C hotter: a longer frost-free season and more hot days at each line', hot.med.frostFree > C.med.frostFree && hot.monthly.heatByMonth[2][6] > C.monthly.heatByMonth[2][6]);
ok('2 °C colder: the reverse', cold.med.frostFree < C.med.frostFree && cold.monthly.heatByMonth[2][6] < C.monthly.heatByMonth[2][6]);
ok('a fifth drier and wetter move the rain only', Math.abs(dry.med.P / C.med.P - 0.8) < 1e-9 && Math.abs(wet.med.P / C.med.P - 1.2) < 1e-9 && dry.monthly.tmean[6] === C.monthly.tmean[6]);
ok('Barrie corn passes on the data but not a fifth drier: "Only just suits"', SU.sureField('corn', C).flag === 'borderline' && SU.sureField('corn', C).fails.includes('drier'));
same('Barrie soybeans and winter wheat hold up in every variant', [SU.sureField('soy', C).flag, SU.sureField('wheat', C).flag], ['holds', 'holds']);

// ---- the must-not crops are never a sure fit
const mustNotTrees = ['tea', 'coffee', 'robusta', 'cocoa', 'banana', 'citrus', 'olive', 'avocado', 'mango', 'datepalm', 'almond', 'pistachio', 'fig', 'macadamia', 'papaya', 'guava'];
const badBarrie = mustNotTrees.filter(id => SU.sureTree(id, C).sure);
same('Barrie, Ontario: no tea, coffee, citrus, olives, avocados, dates, almonds or pistachios as a sure fit', badBarrie, []);
same('Barrie: tea is not even shown (winter kill and rain)', [SU.sureTree('tea', C).shown, F.gardenFit('tea', C) <= -9], [false, true]);
same('Barrie: no rice or cotton', [SU.sureField('rice', C).flag, SU.sureField('cotton', C).flag], ['fails', 'fails']);
same('an Arctic coast: no tea and no field crop but the hardiest', [SU.sureTree('tea', arctic).sure, SU.sureField('wheat', arctic).sure, SU.sureField('corn', arctic).sure], [false, false, false]);
same('a subarctic valley: no corn, soybeans, apples-of-the-south', [SU.sureField('corn', yukon).sure, SU.sureField('soy', yukon).sure, SU.sureTree('citrus', yukon).sure, SU.sureTree('tea', yukon).sure], [false, false, false, false]);
same('the humid tropics: no wheat, olives or apples', [SU.sureField('wheat', tropic).sure, SU.sureTree('olive', tropic).sure, SU.sureTree('apple', tropic).sure], [false, false, false]);

// ---- endorses: the four cases
same('endorses: an infeasible best never', E.endorses({ flag: 'fails', score: 90 }, { flag: 'holds', score: 60 }), false);
same('endorses: a gain of 21 on a borderline best never', E.endorses({ flag: 'borderline', score: 81 }, { flag: 'holds', score: 60 }), false);
same('endorses: a gain of 3 when the farmer\'s own rotation fails', E.endorses({ flag: 'holds', score: 63 }, { flag: 'fails', score: 60 }), true);
same('endorses: a gain of 3 when it does not', E.endorses({ flag: 'holds', score: 63 }, { flag: 'holds', score: 60 }), false);
same('endorses: a gain of 8 that holds up', E.endorses({ flag: 'holds', score: 68 }, { flag: 'borderline', score: 60 }), true);

// ---- the score does not depend on how the cycle is written
const scoreOf = (slots, C2 = C) => E.optionsFor(state({ rotation: { preset: 'custom', custom: slots, second: {} } }), C2, BARRIE, { today: TODAY }).current.score;
same('corn, soy = corn, soy, corn, soy', scoreOf(['corn', 'soy', 'corn', 'soy']), scoreOf(['corn', 'soy']));
same('corn, soy = soy, corn (phase)', scoreOf(['soy', 'corn']), scoreOf(['corn', 'soy']));
same('corn, soy, wheat = soy, wheat, corn = wheat, corn, soy', [scoreOf(['soy', 'wheat', 'corn']), scoreOf(['wheat', 'corn', 'soy'])], [scoreOf(['corn', 'soy', 'wheat']), scoreOf(['corn', 'soy', 'wheat'])]);
same('the shortest cycle', [E.shortestCycle(['corn', 'soy', 'corn', 'soy']), E.shortestCycle(['corn', 'soy', 'corn'])], [['corn', 'soy'], ['corn', 'soy', 'corn']]);

// ---- a failed second crop earns no credit
const ctxOf = (st, C2) => E.analyse(st, C2, BARRIE, { today: TODAY });
const plain = ctxOf(state(), C).base, withSecond = ctxOf(state({ rotation: { preset: 'corn-soy', custom: [], second: { 0: 'soy' } } }), C).base;
ok('soybeans after corn fail in Barrie, and the option keeps the reason', withSecond.ev.lay.seconds[0] && !withSecond.ev.lay.seconds[0].fit.ok);
same('the failed second crop adds no income, soil, cover or weather credit', [withSecond.ev.parts.income, withSecond.ev.parts.soil, withSecond.ev.parts.erosion, withSecond.ev.parts.weather], [plain.ev.parts.income, plain.ev.parts.soil, plain.ev.parts.erosion, plain.ev.parts.weather]);
ok('and its score is not higher', withSecond.score <= plain.score);
const R2 = E.optionsFor(state({ rotation: { preset: 'corn-soy', custom: [], second: { 0: 'soy' } } }), C, BARRIE, { today: TODAY });
ok('the risk line says it earns no credit, with its reason', R2.current.risks.some(r => /^Soybeans after the corn: only about \d+ days are free.*It earns no credit in the score\.$/.test(r)), R2.current.risks.join(' | '));
const warmBase = ctxOf(state({ rotation: { preset: 'custom', custom: ['barley', 'corn'], second: {} } }), warm).base;
const warmSecond = ctxOf(state({ rotation: { preset: 'custom', custom: ['barley', 'corn'], second: { 0: 'soy' } } }), warm).base;
ok('a second crop that passes earns credit in step with its days', warmSecond.ev.lay.seconds[0]?.fit.ok && warmSecond.ev.parts.income > warmBase.ev.parts.income, `${warmSecond.ev.lay.seconds[0]?.fit.words}`);

// ---- hostile cases
const none = E.optionsFor(state(), null, BARRIE, { today: TODAY });
same('missing climate: no recommendation, no sureness, no dates', [none.recommended, none.sureness, none.current.seasons.every(s => s.sow === null && s.harvest === null)], [null, null, true]);
ok('missing climate: said plainly in the gaps', none.gaps.some(g => /No weather has been read for this field yet/.test(g)));
const odd = E.optionsFor(state({ rotation: { preset: 'custom', custom: ['toString', '__proto__', 'corn', 'hasOwnProperty'], second: { 0: 'constructor' } }, avoid: ['valueOf'] }), C, BARRIE, { today: TODAY });
same('crop ids that are not in the table are dropped (own() guard)', odd.current.slots, ['corn']);
const empty = E.optionsFor(null, C, BARRIE, { today: TODAY });
same('no state: nothing to compare, said plainly', [empty.current, empty.recommended, /Tell us what you grow now/.test(empty.reason)], [null, null, true]);
ok('a broken climate object is treated as missing', E.optionsFor(state(), { monthly: null }, BARRIE, { today: TODAY }).recommended === null);
same('groundOn without a plan or with a bad date', [E.groundOn(null, '2028-10-01').state, E.groundOn({ seasons: [] }, 'soon').state], [null, null]);
same('absent crops are never newly suggested', E.optionsFor(state({ avoid: [] }), C, { ...BARRIE, absent: ['wheat', 'barley', 'alfalfa', 'chickpea', 'canola'] }, { today: TODAY }).others.filter(p => p.slots.some(id => ['wheat', 'barley', 'alfalfa', 'chickpea', 'canola'].includes(id))).length, 0);
same('avoided crops are never newly suggested', E.optionsFor(state({ avoid: ['wheat', 'canola', 'fmillet'] }), C, BARRIE, { today: TODAY }).others.filter(p => p.slots.some(id => ['wheat', 'canola', 'fmillet'].includes(id))).length, 0);

// ================= THE ONTARIO DEMO: Barrie & Simcoe County, corn then soybeans, loam assumed, rain-fed =================
for (const [label, prio] of [['equal priorities', [3, 3, 3, 3, 3]], ['"keep soil covered" raised', [2, 4, 5, 2, 3]]]) {
  const R = E.optionsFor(state({ prio }), C, BARRIE, { today: TODAY });
  const all = [R.current, ...R.others];
  same(`${label}: the current plan is corn, soybeans, corn from 2027`, R.current.seasons.map(s => `${s.year} ${s.crop}`), ['2027 corn', '2028 soy', '2029 corn']);
  const wheatPlan = all.find(p => p.kind === 'proposed' && p.slots.join() === 'corn,soy,wheat');
  ok(`${label}: winter wheat after soybeans is offered by the engine's own rules`, !!wheatPlan && (R.recommended === wheatPlan || R.others.includes(wheatPlan)));
  if (!wheatPlan) continue;
  same(`${label}: the proposed plan is corn 2027, soybeans 2028, winter wheat sown in fall 2028 and harvested in summer 2029`, wheatPlan.seasons.map(s => `${s.year} ${s.crop} ${s.sow.slice(0, 4)}-${s.harvest.slice(0, 4)}`), ['2027 corn 2027-2027', '2028 soy 2028-2028', '2029 wheat 2028-2029']);
  const ws = wheatPlan.seasons[2], ss = wheatPlan.seasons[1];
  ok(`${label}: the wheat window is two real dates`, ISO.test(ws.window.earliest) && ISO.test(ws.window.latest) && ws.window.earliest < ws.window.latest);
  // The window is closed by the cold, not by the first autumn frost: winter wheat comes up through autumn frosts (OMAFRA: leaves that
  // have not hardened off still take −9 °C). Since the autumn frost date is read as the Ontario weather stations record it, Barrie's
  // first frost (about Oct 19) falls before the last good sowing day (about Oct 30).
  const wt = SE.cropTiming('wheat', C);
  ok(`${label}: the window ends with the FAO-56 days to come up still before the normal mean falls under 3 °C, frost or no frost`, SE.doyOfIso(ws.window.latest).doy === wt.window.latest && wt.window.latest + wt.window.init === wt.window.cold, `${ws.window.latest} vs ${SE.isoOf(2028, wt.window.cold)}`);
  ok(`${label}: wheat is sown inside its window, a week or more after the soybean harvest`, ws.sow >= ws.window.earliest && ws.sow <= ws.window.latest && ws.sow >= SE.isoOf(2028, SE.doyOfIso(ss.harvest).doy + SE.TURN));
  const room = SE.doyOfIso(ws.window.latest).doy - (SE.doyOfIso(ss.harvest).doy + SE.TURN);
  ok(`${label}: the late-harvest caveat is there when the turn is tight`, room >= SE.TIGHT || wheatPlan.risks.some(r => /^A late soybean harvest squeezes the winter wheat sowing window/.test(r)), wheatPlan.risks.join(' | '));
  ok(`${label}: an option that only just suits is never the firm suggestion`, wheatPlan.flag === 'holds' || R.recommended !== wheatPlan);
  const dates = E.keyDates(R.current, wheatPlan);
  same(`${label}: three walkthrough dates`, dates.map(d => d.key), ['harvest', 'establish', 'spring']);
  const [, fall, spring] = dates;
  for (const d of [fall, spring]) {
    same(`${label}: ${d.key} ${d.date}: the current plan has soybean residue`, [d.current.state, d.current.crop, d.current.label], ['residue', 'soy', 'Planned']);
    ok(`${label}: ${d.key} ${d.date}: the proposed plan has living winter wheat with its stage`, d.proposed.state === 'crop' && d.proposed.crop === 'wheat' && d.proposed.stage >= 1 && d.proposed.stage <= 4 && d.proposed.label === 'Planned', JSON.stringify(d.proposed));
  }
  ok(`${label}: the soybean harvest date is the proposed soybean harvest`, dates[0].date === ss.harvest);
  ok(`${label}: every season has real dates, sowing before harvest, residue after harvest`, all.every(p => p.seasons.every(s => s.crop === 'fallow' || (ISO.test(s.sow) && ISO.test(s.harvest) && s.sow < s.harvest && (!s.residueUntil || s.residueUntil > s.harvest)))));
  ok(`${label}: no plan starts with a sowing that is already past`, all.every(p => p.seasons[0].sow > TODAY));
  const bad = sentencesOf(R).filter(t => typeof t !== 'string' || !t || BANNED.test(t));
  same(`${label}: every sentence is plain: no NaN, undefined, percent or chance words`, bad, []);
  ok(`${label}: every evidence line names its sources by key`, all.flatMap(p => p.evidence).every(e => e.sources.length && e.sources.every(k => Object.hasOwn(E.SOURCE_KEYS, k))));
  ok(`${label}: NASA POWER is a source of the weather lines`, R.evidence.filter(e => /frost|rain|bare/i.test(e.text)).every(e => e.sources.includes('power')));
  ok(`${label}: the stress count is a count with its denominator`, all.every(p => p.evidence.some(e => /^No stress thresholds crossed in (\d+ of )?\d+ tested years/.test(e.text) && Array.isArray(e.rules) && e.rules.length === 4)));
  ok(`${label}: sureness is one of the three words`, ['Very sure', 'Fairly sure', 'Somewhat sure'].includes(R.sureness));
  ok(`${label}: the reason is one sentence with real numbers (and, on keep beside a higher score, why keep stands)`, /^[A-Z].*\d.*\.$/.test(mainReason(R.reason)) && !/\.\s+[A-Z]/.test(mainReason(R.reason).replace(/\b(Oct|Nov|Sep|May|Apr|Jul)\./g, '')), R.reason);
  ok(`${label}: the recommendation is a plan of the result`, all.includes(R.recommended));
  ok(`${label}: the five parts and the score are 0 to 100`, all.every(p => p.score >= 0 && p.score <= 100 && Object.values(p.parts).every(v => v >= 0 && v <= 100)));
}

// ---- the plans in a colder year: the soybean harvest comes later and the caveat says what happens
const Rc = E.optionsFor(state(), SU.shifted(C, -2, 1, 'colder'), BARRIE, { today: TODAY });
const cw = [Rc.current, ...Rc.others].find(p => p.slots.join() === 'corn,soy,wheat');
ok('2 °C colder: winter wheat after soybeans still says what the late harvest does', !cw || cw.risks.some(r => /late soybean harvest squeezes/.test(r)) || cw.risks.some(r => /past the last good sowing day/.test(r)), cw?.risks.join(' | '));

// ================= THE ONTARIO DEMO, moved: Oxford County near Woodstock (43.13, -80.75), on the records made today =================
// NASA POWER daily weather (scripts/fixtures/power_oxford.json), the field's height (height_oxford.json, NASA SRTM) and what farmers
// grow in the box around it (oxford_cropsnear.json: the AAFC Annual Crop Inventory 2025, replayed from the live answer).
const OX = oxford(), OXA = JSON.parse(fs.readFileSync(new URL('./fixtures/oxford_cropsnear.json', import.meta.url), 'utf8'));
same('Oxford: the NASA POWER record and the field height are the answers recorded today', [OX.recorded.power, OX.recorded.height], [TODAY, TODAY]);
same('Oxford: field 298 m, NASA square 265 m: under 100 m apart, so no height correction (the js/data.js rule)', [OX.field, Math.round(OX.cellElev), OX.dz, OX.C.coldRecords === (OX.cold ? 2 : 1)], [298, 265, 0, true]);
same('Oxford: 25 full years of NASA weather, 2001 to 2025', [OX.C.years.length, OX.C.years[0], OX.C.years.at(-1)], [25, 2001, 2025]);
const OXSPOT = { lat: 43.13, lon: -80.75, country: 'CA', elev: OX.field, ...N.spotFields(OXA) };
ok('Oxford: the grown-nearby answer is read and sent as spot.absent and spot.common', Array.isArray(OXSPOT.absent) && OXSPOT.common.wheat > 0 && OXSPOT.nearby.source === 'aci');
const OXR = {};
for (const [label, prio] of [['equal priorities', [3, 3, 3, 3, 3]], ['"keep soil covered" raised', [2, 4, 5, 2, 3]]]) {
  const R = OXR[label] = E.optionsFor(state({ prio }), OX.C, OXSPOT, { today: TODAY });
  const all = [R.current, ...R.others];
  same(`Oxford, ${label}: the current plan is corn, soybeans, corn from 2027`, R.current.seasons.map(s => `${s.year} ${s.crop}`), ['2027 corn', '2028 soy', '2029 corn']);
  same(`Oxford, ${label}: no new option holds a crop the box grows under 250 ha of (canola, chickpeas, millet and the rest)`, R.others.filter(p => p.slots.some(id => OXSPOT.absent.includes(id))).map(p => p.name), []);
  const w = all.find(p => p.kind === 'proposed' && p.slots.join() === 'corn,soy,wheat');
  ok(`Oxford, ${label}: winter wheat after soybeans is offered by the engine's own rules`, !!w);
  if (!w) continue;
  same(`Oxford, ${label}: it passes every check with room to spare ("Holds up")`, [w.flag, w.fit], ['holds', 'Holds up']);
  const ss = w.seasons[1], ws = w.seasons[2];
  same(`Oxford, ${label}: soybeans harvested Oct 4, 2028; wheat window Oct 1 to Nov 5, 2028; sown Oct 11, 2028, harvested Jul 15, 2029`, [ss.harvest, ws.window.earliest, ws.window.latest, ws.sow, ws.harvest], ['2028-10-04', '2028-10-01', '2028-11-05', '2028-10-11', '2029-07-15']);
  const room = SE.doyOfIso(ws.window.latest).doy - (SE.doyOfIso(ss.harvest).doy + SE.TURN);
  same(`Oxford, ${label}: the turn after the normal soybean harvest leaves 25 days, more than the ${SE.TIGHT}-day tight line`, [room, room >= SE.TIGHT], [25, true]);
  ok(`Oxford, ${label}: the late-harvest caveat is still written, with the 25 days`, w.risks.some(r => r === 'A late soybean harvest squeezes the winter wheat sowing window: in a normal year the soybeans are ready about Oct 4, and a week later leaves 25 days before the last good sowing day here (about Nov 5).'), w.risks.join(' | '));
  const dates = E.keyDates(R.current, w);
  same(`Oxford, ${label}: the three walkthrough dates`, dates.map(d => `${d.key} ${d.date}`), ['harvest 2028-10-04', 'establish 2028-10-31', 'spring 2029-03-26']);
  for (const d of dates.slice(1)) {
    same(`Oxford, ${label}: ${d.key} ${d.date}: soybean residue on the current plan, living winter wheat (stage 2 of 4) on the proposed`, [d.current.state, d.current.crop, d.proposed.state, d.proposed.crop, d.proposed.stage, d.proposed.label], ['residue', 'soy', 'crop', 'wheat', 2, 'Planned']);
  }
  same(`Oxford, ${label}: on the soybean harvest day both plans show the soybeans ready to harvest`, [dates[0].current.stage, dates[0].proposed.stage], [5, 5]);
  // With the autumn frost read as the Ontario stations record it (Oct 18, not NASA's own Oct 31), three more years have a frost before
  // the corn or soybean harvest: 14 of 25 years cross no threshold (17 when the autumn date was NASA's own).
  ok(`Oxford, ${label}: the stress count is a count with its denominator`, w.evidence.some(e => e.text === 'No stress thresholds crossed in 14 of 25 tested years (2001 to 2025); the others are 2001, 2002, 2003, 2006, 2007, 2009, 2011, 2013, 2020, 2022 and 2025.'));
  ok(`Oxford, ${label}: the grown-nearby line is evidence with the AAFC source`, R.evidence.some(e => /^Farmland in a box about 28 km north to south/.test(e.text) && e.sources.join() === 'aci'));
  ok(`Oxford, ${label}: no gap says the crops grown nearby were not read`, !R.gaps.some(g => /not read, so no crop was checked/.test(g)));
  ok(`Oxford, ${label}: every plan carries score, the five scores (0 to 100 or null) and one why sentence`, all.every(p => Number.isInteger(p.score) && E.DIMS.every(d => Object.hasOwn(p.scores, d.id) && (p.scores[d.id] === null || (p.scores[d.id] >= 0 && p.scores[d.id] <= 100))) && typeof p.why === 'string' && /^[A-Z].*\.$/.test(p.why) && !/\.\s+[A-Z]/.test(p.why)));
  ok(`Oxford, ${label}: the reason is one sentence with real numbers (and, on keep beside a higher score, why keep stands)`, /^[A-Z].*\d.*\.$/.test(mainReason(R.reason)) && !/\.\s+[A-Z]/.test(mainReason(R.reason)), R.reason);
  ok(`Oxford, ${label}: keep beside a best option that scores higher says why`, R.endorsed || !(R.others[0]?.flag === 'holds' && R.others[0].score > R.current.score) || R.reason.includes(`It scores ${R.others[0].score - R.current.score} point`), R.reason);
  const bad = sentencesOf(R).filter(t => typeof t !== 'string' || !t || BANNED.test(t));
  same(`Oxford, ${label}: every sentence is plain`, bad, []);
  ok(`Oxford, ${label}: an option that does not lead by ${E.STRONG} points is never the firm suggestion`, R.endorsed === (R.others[0].flag === 'holds' && R.others[0].score - R.current.score >= E.STRONG));
}
// The honest result, with its numbers: winter wheat after soybeans holds up here, but it does not score ahead of corn then soybeans.
// The weather parts are lower than when the autumn frost date was NASA's own (86 and 87 then): the frost now comes about Oct 18, as the
// Ontario stations record it, so corn and soybeans meet it before harvest in more years. Keep, and "Holds up", are unchanged.
const OXE = OXR['equal priorities'], OXS = OXR['"keep soil covered" raised'], wOf = R => [R.current, ...R.others].find(p => p.slots.join() === 'corn,soy,wheat');
same('Oxford, equal priorities: keep corn then soybeans; corn, soybeans, winter wheat scores 68 against 69', [OXE.recommended === OXE.current, OXE.current.score, wOf(OXE).score, OXE.sureness, wOf(OXE).flag], [true, 69, 68, 'Somewhat sure', 'holds']);
same('Oxford, "keep soil covered" raised: keep; 66 against 66', [OXS.recommended === OXS.current, OXS.current.score, wOf(OXS).score, OXS.sureness, wOf(OXS).flag], [true, 66, 66, 'Somewhat sure', 'holds']);
same('Oxford: the five parts, corn then soybeans', OXE.current.scores, { water: 55, soil: 64, erosion: 41, income: 87, weather: 83 });
same('Oxford: the five parts, corn, soybeans, winter wheat: better water, soil, wash-off and weather, less income', wOf(OXE).scores, { water: 64, soil: 68, erosion: 50, income: 81, weather: 85 });
same('Oxford: the three-year plan pays its pest-break and length costs: pest 88 against 100, 3 points for the third year', [wOf(OXE).pest, OXE.current.pest], [88, 100]);
same('Oxford: the reason says nothing does clearly better, and why 4 points more is not a change', OXE.reason, 'Nothing we tested does clearly better here: the best other idea, winter wheat, then soybeans, scores 73 against 69 for what you grow now. It scores 4 points higher, which is too small a difference to change what works; it is listed below as an option worth a look.');

// ---- Barrie again, now with the grown-nearby gate (the AAFC answer for Barrie recorded today)
const BAA = JSON.parse(fs.readFileSync(new URL('./fixtures/barrie_cropsnear.json', import.meta.url), 'utf8'));
const strange = ['canola', 'chickpea', 'fmillet'];
const RBno = E.optionsFor(state(), C, BARRIE, { today: TODAY }), RBgate = E.optionsFor(state(), C, { ...BARRIE, ...N.spotFields(BAA) }, { today: TODAY });
// Without the crop map the climate-only pool once named canola, chickpeas and finger millet here. Crophalo's rule for Ontario: when the
// crop map cannot check what farmers grow around the field, only the field crops Statistics Canada lists for Ontario are offered (js/cropstep.js).
same('Barrie without the gate: only crops Statistics Canada lists for Ontario are newly offered (no chickpeas, no finger millet)', RBno.others.flatMap(p => p.slots).filter(id => !ONTARIO_LISTED.includes(id) && !['corn', 'soy'].includes(id)), []);
ok('Barrie without the gate: the gaps say why, naming Statistics Canada', RBno.gaps.some(g => /Statistics Canada/.test(g) && /crop map could not check/.test(g)), RBno.gaps.join(' | '));
// Only the national lists read (no crop map, FAOSTAT's figures for Canada, scripts/test_countrygate.mjs): they are not a crop map, so Crophalo's Ontario rule still holds beside them
{
  const FAOG = JSON.parse(fs.readFileSync(new URL('./fixtures/faostat-gate.json', import.meta.url), 'utf8'));
  const natOnly = { ...BARRIE, ...N.spotFields({ ok: false, reason: 'the lookup did not answer' }, FAOG, 'CA') }, RBnat = E.optionsFor(state(), C, natOnly, { today: TODAY });
  same('Barrie with the national lists only: they were read (source fao)', [natOnly.nearby?.source, Array.isArray(natOnly.absent)], ['fao', true]);
  same('Barrie with the national lists only: still only crops Statistics Canada lists for Ontario are newly offered', RBnat.others.flatMap(p => p.slots).filter(id => !ONTARIO_LISTED.includes(id) && !['corn', 'soy'].includes(id)), []);
  ok('Barrie with the national lists only: the gaps still name Statistics Canada', RBnat.gaps.some(g => /Statistics Canada/.test(g)), RBnat.gaps.join(' | '));
}
same('Barrie with the gate: none of them is offered any more', RBgate.others.filter(p => p.slots.some(id => strange.includes(id))).map(p => p.name), []);
same('Barrie with the gate: still keep corn then soybeans; winter wheat after soybeans 70 against 70, held back by the 6-day turn', [RBgate.recommended === RBgate.current, RBgate.current.score, wOf(RBgate).score, wOf(RBgate).flag], [true, 70, 70, 'borderline']);

// ================= THE STRATEGY COMPARISON (js/compare.js): three strategies, the one grown now first, each with why, evidence, benefits, gaps and review =================
const KINDS = new Set(CMP.BENEFIT_KINDS), OPPS = new Set(CMP.OPPORTUNITIES), FACETS = ['nitrogen', 'organic', 'pest', 'forage', 'market', 'waterUse', 'infiltration'];
const PROMISE = /\bwill (raise|improve|increase|cut|save|give|stop|prevent|fix|boost|double)\b|\bguarantee|\bsure to\b|\bcertain/i;
const plansOfR = R => [R.current, ...R.others].filter(Boolean);
const planById = (R, id) => plansOfR(R).find(p => p.id === id);
// every new sentence of an answer: the strategies, the few line, the exposure rows, the bare months, and each plan's benefits, review and facets
const newTexts = R => [R.fewWhy, R.exposureNote, ...(R.strategies ?? []).map(s => s.text), ...(R.exposure ?? []).flatMap(e => [e.text, e.hazard, e.stage]), ...(R.bare ?? []).map(b => b.text),
  ...plansOfR(R).flatMap(p => [...(p.benefits ?? []).map(b => b.text), ...(p.review ?? []), ...Object.values(p.facets ?? {}).flatMap(f => [f.text, f.source])])].filter(t => t !== '');
function strategyChecks(label, R, { three = true } = {}) {
  const S = R.strategies ?? [];
  if (three) same(`${label}: at least three strategies, the one grown now first`, [S.length >= 3, S[0]?.role, S[0]?.id], [true, 'now', 'current']);
  ok(`${label}: each strategy is a plan of the answer, once, with its role, its opportunity and its words`, S.every(s => planById(R, s.id) && OPPS.has(s.opportunity) && ['now', 'suggest', 'worth', 'another'].includes(s.role) && /^[A-Z].*\.$/.test(s.text)) && new Set(S.map(s => s.id)).size === S.length, JSON.stringify(S));
  if (S.length >= 3) ok(`${label}: the third differs in kind from the second`, planById(R, S[2].id).optionKind !== planById(R, S[1].id).optionKind);
  ok(`${label}: no plan that does not suit is one of the three`, S.every(s => planById(R, s.id).flag !== 'fails' || s.role === 'now'));
  if (!R.endorsed && S[1]) same(`${label}: the answer is to keep, so the second is the best other option`, S[1].role, 'worth');
  for (const s of S) {
    const p = planById(R, s.id), name = `${label}, ${p.name}`;
    ok(`${name}: why, evidence, benefits, gaps and review are all there`, typeof p.why === 'string' && p.why && p.evidence.length > 0 && p.benefits.length > 0 && p.gaps.length > 0 && p.review.length > 0, JSON.stringify({ b: p.benefits?.length, r: p.review?.length }));
    ok(`${name}: every benefit has a kind of the list and says "may" or "can", never a promise`, p.benefits.every(b => KINDS.has(b.kind) && /\b(may|can)\b/i.test(b.text) && !PROMISE.test(b.text)), JSON.stringify(p.benefits));
    ok(`${name}: the review names drainage first and asks for local checks`, /^Drainage:/.test(p.review[0]) && p.review.every(t => /^[A-Z].*\.$/.test(t)));
    ok(`${name}: the seven facets, each a score of 0 to 100 or null, with its words and source`, FACETS.every(k => { const f = p.facets?.[k]; return f && (f.score === null || (Number.isInteger(f.score) && f.score >= 0 && f.score <= 100)) && typeof f.text === 'string' && f.text && typeof f.source === 'string' && (f.score !== null || /Not worked out/.test(f.text)); }), JSON.stringify(p.facets));
    ok(`${name}: the bare months are month numbers in order`, Array.isArray(p.bare) && p.bare.every((m, i) => Number.isInteger(m) && m >= 1 && m <= 12 && (!i || m > p.bare[i - 1])));
  }
  same(`${label}: one bare-months line for each strategy`, (R.bare ?? []).map(b => b.id), S.map(s => s.id));
  ok(`${label}: the exposure rows are counts of years from the record, by month and stage, with their sources`, Array.isArray(R.exposure) && R.exposure.every(e => Number.isInteger(e.month) && e.month >= 1 && e.month <= 12 && Number.isInteger(e.count) && e.count > 0 && e.count <= e.of && new RegExp(`\\b${e.count} of ${e.of} years\\b`).test(e.text) && e.sources.includes(e.source) && e.sources.every(k => Object.hasOwn(E.SOURCE_KEYS, k))), JSON.stringify(R.exposure));
  same(`${label}: no NaN, undefined, percent or promise in any new sentence`, newTexts(R).filter(t => typeof t !== 'string' || BANNED.test(t) || PROMISE.test(t)), []);
}
const BGATE = { ...BARRIE, ...N.spotFields(BAA) };
const RBG = E.optionsFor(state(), C, BGATE, { today: TODAY });
strategyChecks('Barrie with the crop map', RBG);
strategyChecks('Barrie without the crop map', RBno);
strategyChecks('Oxford, equal priorities', OXE);
strategyChecks('Oxford, "keep soil covered" raised', OXS);
same('Barrie: keep corn then soybeans; compared with winter wheat then soybeans and a cover-crop version', [RBG.strategies.map(s => s.role), planById(RBG, RBG.strategies[1].id).name, planById(RBG, RBG.strategies[2].id).optionKind], [['now', 'worth', 'another'], 'Winter wheat, then soybeans', 'cover']);
same('Barrie: the opportunities: what is grown now, less water, soil health', RBG.strategies.map(s => s.opportunity), ['income', 'water', 'soil']);
// the market facet: the share of the farmland around the field, from the crop map; not worked out without it
same('Barrie with the crop map: market facet from the AAFC shares (soybeans 34, corn 19 in 100)', [RBG.current.facets.market.score, /soybeans 34 in 100/.test(RBG.current.facets.market.text), /corn 19 in 100/.test(RBG.current.facets.market.text), /AAFC Annual Crop Inventory 2025/.test(RBG.current.facets.market.source)], [Math.round(100 * (Math.min(1, 0.1872 / 0.15) + Math.min(1, 0.3422 / 0.15)) / 2), true, true, true]);
same('Barrie without the crop map: market facet not worked out, and it says why', [RBno.current.facets.market.score, /was not read/.test(RBno.current.facets.market.text)], [null, true]);
same('the crop map gives the engine each judged crop\'s own share and the year', [N.spotFields(BAA).market.source, N.spotFields(BAA).market.year, N.spotFields(BAA).market.shares.soy], ['aci', 2025, 0.3422]);
// nitrogen, pest, water use, worked out from the crop table
same('corn then soybeans: nitrogen from soybeans; the family changes in 2 of 2 turns; about 552 mm needed against 396 mm of rain', [/^Soybeans fix nitrogen/.test(RBG.current.facets.nitrogen.text), RBG.current.facets.pest.score, /2 of 2 turns/.test(RBG.current.facets.pest.text), /About 552 mm/.test(RBG.current.facets.waterUse.text)], [true, 100, true, true]);
const cc = E.optionsFor(state({ rotation: { preset: 'custom', custom: ['corn'], second: {} } }), C, BGATE, { today: TODAY });
same('corn every year: no nitrogen from legumes, and no pest break', [cc.current.facets.nitrogen.score, /No crop in this plan fixes nitrogen/.test(cc.current.facets.nitrogen.text), cc.current.facets.pest.score, /no break/.test(cc.current.facets.pest.text)], [0, true, 10, true]);
strategyChecks('Barrie, corn every year', cc);
ok('Barrie, corn every year: a plan that breaks the cycle says it can help break pest cycles', plansOfR(cc).some(p => p.benefits.some(b => b.kind === 'pest')));
// the months the soil is bare, from the layout, and when the current crops are most exposed
same('Barrie, corn then soybeans: bare November to May after soybeans, one year in two', [RBG.current.bare, RBG.bare[0].years.filter(n => n > 0).length, RBG.bare[0].of, /in 1 of every 2 years/.test(RBG.bare[0].text)], [[1, 2, 3, 4, 5, 11, 12], 7, 2, true]);
ok('Barrie: the cover-crop version and winter wheat then soybeans leave the soil bare in fewer months', RBG.bare.slice(1).every(b => b.months.length < RBG.bare[0].months.length));
const kindsSeen = new Set(RBG.exposure.map(e => e.hazard));
ok('Barrie, corn then soybeans: exposure counts heat at flowering, a dry month at grain fill and heavy rain on bare soil', ['heat', 'a dry month', 'heavy rain on bare soil'].every(h => kindsSeen.has(h)), [...kindsSeen].join(', '));
ok('Barrie: every exposure row is counted over the 25 years of the record', RBG.exposure.every(e => e.of === 25));
ok('Barrie: heavy rain is counted only in months above 0 °C (rain, not snow)', RBG.exposure.filter(e => e.hazard === 'heavy rain on bare soil').every(e => C.monthly.tmean[e.month - 1] > 0));
const corn = RBG.exposure.find(e => e.crop === 'corn' && e.hazard === 'heat');
const monthOfDay = d => { let left = ((d - 1) % 365 + 365) % 365, m = 0; while (left >= SE.MONTH_DAYS[m]) left -= SE.MONTH_DAYS[m++]; return m; };   // a year with no leap day, like the crop calendar
const cornT = E.analyse(state(), C, BGATE, { today: TODAY }).base.ev.lay.t[0], midFrom = cornT.sow + cornT.stages[0] + cornT.stages[1], midDays = Array.from({ length: cornT.stages[2] }, (_, d) => midFrom + d);
const midMonths = [...new Set(midDays.map(monthOfDay))].filter(m => midDays.filter(d => monthOfDay(d) === m).length >= 15);
ok('Barrie: the heat count is real: years with 3 or more days of 32 °C or more in the months of the corn mid-season stage, counted again here', !!corn && corn.count === C.years.filter((_, k) => midMonths.reduce((t, m) => t + C.hotCal[32][k][m], 0) >= 3).length, JSON.stringify([corn, midMonths]));
ok('the climate keeps each month of each year: rain, heavy days and hot days per line', C.rainCal.length === 25 && C.heavyCal[0].length === 12 && C.hotCal[32].length === 25 && Math.abs(C.rainCal.reduce((a, y) => a + y.reduce((b, v) => b + v, 0), 0) / 25 - C.yearly.P.reduce((a, b) => a + b, 0) / 25) < 1e-6);
// the goals and limits of the setup step, as weights and hard limits; a plan they leave out is named in the gaps, never silently
const lim = more => E.optionsFor(state(more), C, BGATE, { today: TODAY });
const noDrill = lim({ limits: { noDrill: true, sell: [] } });
same('no small-seed drill: no cover crop and no hay crop in any new plan, and the gaps say the cover-crop version was left out', [plansOfR(noDrill).filter(p => p.seasons.some(s => s.cover) || p.slots.some(id => ['alfalfa', 'ley'].includes(id))).length, noDrill.gaps.some(g => /cover-crop version of your rotation was left out: you have no drill for small seed/.test(g))], [0, true]);
strategyChecks('Barrie, no small-seed drill', noDrill);
const veg = lim({ limits: { noDrill: false, sell: ['veg'] } });
same('vegetables only: every new plan keeps to corn and soybeans, and the crops left out are named with the reason', [plansOfR(veg).every(p => p.slots.every(id => ['corn', 'soy'].includes(id))), veg.gaps.some(g => /^Winter wheat.* left out of the ideas: (it does|they do) not fit what you said you can sell\.$/.test(g))], [true, true]);
ok('vegetables only: either three strategies, or one sentence says why fewer', veg.strategies.length >= 3 || /^Only .* can be compared here: .*\.$/.test(veg.fewWhy), veg.fewWhy);
strategyChecks('Barrie, vegetables only', veg, { three: false });
const feed = lim({ limits: { noDrill: false, sell: ['feed'] } });
same('hay and feed only: no winter wheat, canola or dry beans', plansOfR(feed).filter(p => p.kind === 'proposed' && p.slots.some(id => ['wheat', 'canola', 'bean'].includes(id))).length, 0);
const avoidWheat = lim({ avoid: ['wheat'] });
same('a crop the farmer will not grow: never in a new plan, and the gaps name it', [plansOfR(avoidWheat).filter(p => p.kind === 'proposed' && p.slots.includes('wheat')).length, avoidWheat.gaps.some(g => /^Winter wheat was left out of the ideas: you said you will not grow it\.$/.test(g))], [0, true]);
const market = lim({ goals: ['market'] });
ok('sell what I already sell: a new plan holds only the farmer\'s own crops, crops grown widely (FAOSTAT) or crops common around the field', plansOfR(market).filter(p => p.kind === 'proposed').every(p => p.slots.every(id => ['corn', 'soy'].includes(id) || cropOf(id).major === true || Number.isFinite(BGATE.common[id]))));
const forage = lim({ goals: ['forage'] }), forageNo = lim({});
ok('feed for my animals: feed value counts as income, and the forage facet says so', forage.current.facets.forage.text.includes('You keep animals') && forage.current.scores.income >= forageNo.current.scores.income);
const nitro = lim({ goals: ['nitrogen'] });
ok('less fertiliser to buy: plans with legumes gain up to 5 points, and the evidence says why', nitro.current.score >= forageNo.current.score && nitro.current.score - forageNo.current.score <= 5 && nitro.current.evidence.some(e => /less fertiliser to buy/.test(e.text)), `${nitro.current.score} ${forageNo.current.score}`);
same('the farmer\'s own rotation is never changed by goals or limits', [noDrill, veg, feed, avoidWheat, market, forage, nitro].map(R => R.current.slots.join()), Array(7).fill('corn,soy'));
same('no goals and no limits: the answer is the old answer, score for score', [forageNo.current.score, forageNo.others.map(p => `${p.name} ${p.score}`)], [RBG.current.score, RBG.others.map(p => `${p.name} ${p.score}`)]);
// state.goals and state.limits come from a setup step joined later: an answer saved before it has neither field, and that must read as "none chosen"
{
  const full = R => JSON.stringify([R.current, R.others, R.reason, R.gaps, R.strategies, R.fewWhy, R.exposure, R.bare, R.dropped]);
  const missing = E.optionsFor(state(), C, BGATE, { today: TODAY });
  same('no goals or limits fields at all: the same whole answer as none chosen', full(missing), full(lim({ goals: [], limits: { sell: [], noDrill: false } })));
  same('goals and limits that are null: the same whole answer as none chosen', full(lim({ goals: null, limits: null })), full(missing));
  same('no goals or limits fields: nothing is dropped and no limit gap is written', [missing.dropped, missing.gaps.filter(g => /left out of the ideas/.test(g))], [[], []]);
}
same('hostile goals and limits are ignored', lim({ goals: ['__proto__', 'toString', 7], limits: { noDrill: 'yes', sell: ['constructor', null] } }).others.map(p => `${p.name} ${p.score}`), RBG.others.map(p => `${p.name} ${p.score}`));
// short on workers or machines: a cover crop costs more, never less
const busy = lim({ farm: { irrigation: 'none', tillage: 'reduced', livestock: false, coverOK: true, labor: true } }), coverOf = R => plansOfR(R).find(p => p.optionKind === 'cover');
ok('short on workers or machines: the cover-crop version scores lower, not higher', coverOf(busy).score < coverOf(RBG).score, `${coverOf(busy).score} vs ${coverOf(RBG).score}`);
// winter wheat where the coldest night of a cold winter is under −32 °C: only "survives only under steady snow cover here", never recommended
const deep = { ...C, coldLow10: -35, coldNight10: -35 };
const Rdeep = E.optionsFor(state({ rotation: { preset: 'corn-soy-wheat', custom: [], second: {} } }), deep, BGATE, { today: TODAY }), Rdeep2 = E.optionsFor(state(), deep, BGATE, { today: TODAY });
ok('deep cold: winter wheat only just suits, with "survives only under steady snow cover here"', Rdeep.current.flag === 'borderline' && Rdeep.current.risks.some(r => /survives only under steady snow cover here/.test(r)) && Rdeep.current.review.some(r => /survives only under steady snow cover here/.test(r)), Rdeep.current.risks.join(' | '));
same('deep cold: no plan with winter wheat is recommended or among the strategies shown after what is grown now', [Rdeep2, Rdeep].flatMap(R => [R.endorsed && R.recommended.slots.includes('wheat'), ...R.strategies.slice(1).map(s => planById(R, s.id).slots.includes('wheat'))]).filter(Boolean), []);
ok('deep cold: the normal-winter line is not claimed when the normal winter is milder than −24 °C', !Rdeep.current.risks.some(r => /coldest night of a normal winter/.test(r)));
// the QA places of the Ontario accuracy run (scripts/fixtures/accuracy), three ways of farming each: no NaN, undefined or null in any new sentence
{
  const zlib = await import('node:zlib'), D = await import('../js/data.js'), CL = await import('../js/climate.js');
  const FIX = new URL('./fixtures/accuracy/', import.meta.url), QA = JSON.parse(fs.readFileSync(new URL('places.json', FIX), 'utf8')).places, cells = new Map();
  const climateQA = p => { if (!cells.has(p.cell + p.lat)) { const S = D.buildSeries(JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL(`power_${p.cell}.json.gz`, FIX)))), { lat: p.lat, lon: p.lon }); cells.set(p.cell + p.lat, { S, C: CL.computeClimate(S, p.lat, { today: TODAY }) }); } return cells.get(p.cell + p.lat); };
  const BAD = /\bNaN\b|undefined|\bnull\b|\[object|Infinity/;
  const badNumber = (v, out = []) => { if (typeof v === 'number' && !Number.isFinite(v)) out.push(v); else if (Array.isArray(v)) v.forEach(w => badNumber(w, out)); else if (v && typeof v === 'object') Object.values(v).forEach(w => badNumber(w, out)); return out; };
  let answers = 0, three = 0, fewSaid = 0; const bad = [];
  for (const p of QA) {
    let qa; try { qa = climateQA(p); } catch { continue; }
    for (const preset of ['corn-soy', 'corn-corn', 'corn-soy-wheat']) {
      const pin = p.cropmap && (p.cropmap.pin !== undefined || p.aci == null ? p.cropmap : { ...p.cropmap, pin: { code: +p.aci, name: p.aci_name } });
      // a pin the crop map shows as forest or shrubland (three of these places) is asked about before it is judged (scripts/test_nonfarm.mjs, on purpose);
      // these checks read the plans, so they give the farmer's word, as "This is my field: carry on" does
      const fields = pin ? N.spotFields(pin) : {}, worded = fields.notField ? { ...fields, fieldOk: true } : fields;
      const R = E.optionsFor(state({ rotation: { preset, custom: [], second: {} } }), qa.C, { lat: p.lat, lon: p.lon, elev: qa.S.cellElev, country: p.country || 'CA', ...worded }, { today: TODAY });
      if (!R.current) continue;
      answers++;
      const texts = newTexts(R).filter(t => typeof t !== 'string' || BAD.test(t)), nums = badNumber([R.strategies, R.exposure, R.bare, plansOfR(R).map(q => [q.facets, q.bare])]);
      if (texts.length || nums.length) bad.push(`${p.id} ${preset}: ${texts.concat(nums).slice(0, 2).join(' | ')}`);
      if (R.strategies.length >= 3) three++; else if (R.fewWhy) fewSaid++;
    }
  }
  ok(`the QA places: answers to read (${answers})`, answers >= 30, String(answers));
  same('the QA places: no NaN, undefined or null in any new sentence, and no number that is not a number', bad, []);
  same(`the QA places: three strategies, or one sentence why fewer (${three} with three, ${fewSaid} with the sentence)`, three + fewSaid, answers);
}

// ---- the files: pure, plain
const files = ['season.js', 'fit.js', 'sure.js', 'engine.js', 'nearby.js', 'compare.js', 'words.compare.js', 'inputs.js'].map(n => [n, fs.readFileSync(new URL(`../js/${n}`, import.meta.url), 'utf8')]);
same('the engine files touch no page, storage, network, clock or chance', files.filter(([, t]) => /Date\.now|new Date\(\)|fetch\(|(?<![.\w])document\.|(?<![.\w])window\.|localStorage|Math\.random|XMLHttpRequest/.test(t)).map(([n]) => n), []);
same('the engine files import only each other, the crop table, the words and the climate', files.flatMap(([, t]) => [...t.matchAll(/from '([^']+)'/g)].map(m => m[1])).filter(p => !['./words.js', './crops.js', './climate.js', './season.js', './fit.js', './sure.js', './compare.js', './words.compare.js', './cropstep.js'].includes(p)), []);
const own = fs.readFileSync(new URL(import.meta.url), 'utf8'), others = ['test_season.mjs', 'hand_climates.mjs'].map(n => fs.readFileSync(new URL(`./${n}`, import.meta.url), 'utf8'));
const marks = new RegExp(['aud' + 'it', 'mile' + 'stone', 're' + 'build', 'Tur' + 'key\\b'].join('|'), 'i');
same('no tool names, no process words, the country written Türkiye', [...files.map(([n, t]) => [n, t]), ['test_engine.mjs', own], ['others', others.join('\n')]].filter(([, t]) => marks.test(t) || flagged(t).length).map(([n]) => n), []);

console.log(`${passed} passed, ${failed} failed`);
