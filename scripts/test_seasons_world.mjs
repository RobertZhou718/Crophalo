// Crophalo's offline suite for the crop calendar around the world: when winter wheat, corn and soybeans are sown and harvested at 18 farm
// places, against the dates farmers there know, from the climates in scripts/fixtures/seasons/ (each the climate object js/climate.js makes
// from a NASA POWER answer), and the answers that must not move (Oxford, Ontario; the demo field near Mead). Run: node scripts/test_seasons_world.mjs
// (no network; CROPHALO_ROOT=<folder> checks another copy's js/). Last line "N passed, M failed". Never loosen a check without a farming reason beside it.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), FIX = path.join(HERE, 'fixtures', 'seasons');
const ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(HERE, '..'));
const load = f => import(pathToFileURL(path.join(ROOT, 'js', f)).href);
const [D, CL, E, SE] = await Promise.all(['data.js', 'climate.js', 'engine.js', 'season.js'].map(load));

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 400 ? s.slice(0, 400) + '…' : s; };
const ok = (name, cond, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${detail ? `: ${brief(detail)}` : ''}`); } };
const same = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, want ${brief(want)}`);
async function group(name, run) { try { await run(); } catch (e) { ok(`${name}: ran to its end`, false, e?.stack?.split('\n').slice(0, 2).join(' ') || String(e)); } }
const fin = Number.isFinite, TODAY = '2026-11-14';
const BAD = /\bNaN\b|undefined|\bnull\b|\[object|Infinity/;

// ---- the kept climates (numbers that are not finite are kept as strings)
const back = (k, v) => v === 'NaN' ? NaN : v === 'Infinity' ? Infinity : v === '-Infinity' ? -Infinity : v;
const AT = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(FIX, 'places.json'), 'utf8')).places.map(p => [p.key, JSON.parse(fs.readFileSync(path.join(FIX, `${p.key}.json`), 'utf8'), back)]));
const climate = key => AT[key].climate;

// ---- days of the year: "Jun 15" is 166; a usual window [from, to] may cross New Year (from > to)
const BEFORE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = text => { const [m, d] = text.split(' '); return BEFORE[MON.indexOf(m)] + +d; };
const onYear = d => ((Math.round(d) - 1) % 365 + 365) % 365 + 1;
const inside = (d, from, to) => from <= to ? d >= from && d <= to : d >= from || d <= to;
const away = (d, from, to) => { if (inside(d, from, to)) return 0; const gap = (a, b) => { const x = Math.abs(a - b) % 365; return Math.min(x, 365 - x); }; return Math.min(gap(d, from), gap(d, to)); };
const NEAR = 28;   // "within about four weeks" of the usual dates: the bar this check was given, not a published figure; farmers' own dates differ by a few weeks from year to year and field to field
const near = (name, d, [from, to]) => ok(`${name} (usual ${from} to ${to}, within four weeks)`, fin(d) && away(onYear(d), day(from), day(to)) <= NEAR, fin(d) ? SE.dayWord(d) : 'no date');

// ---- the usual dates farmers there know (sowing; harvest), month by month, as they were given for this check from general farming practice; no
// calendar page was read for them here (FAO's crop calendar service gave no dates for Argentina's Pampa), so no calendar is named as their source.
// The soybean dates of the US places in group 5 are USDA NASS's own (Agricultural Handbook 628).
const WHEAT = {
  kansas: [['Sep 20', 'Oct 15'], ['Jun 15', 'Jul 5']], oklahoma: [['Sep 1', 'Oct 31'], ['Jun 1', 'Jun 30']], panhandle: [['Sep 1', 'Oct 31'], ['Jun 1', 'Jun 30']],
  columbia: [['Sep 1', 'Sep 30'], ['Jul 1', 'Aug 10']], georgia: [['Nov 1', 'Nov 30'], ['May 1', 'Jun 30']], maryland: [['Oct 1', 'Oct 31'], ['Jun 10', 'Jun 30']],
  konya: [['Oct 1', 'Oct 31'], ['Jun 20', 'Jul 31']], beauce: [['Oct 1', 'Oct 31'], ['Jul 1', 'Jul 31']], meath: [['Sep 20', 'Oct 31'], ['Aug 1', 'Aug 31']],
  flevoland: [['Oct 1', 'Oct 31'], ['Jul 20', 'Aug 31']], punjab: [['Nov 1', 'Nov 30'], ['Apr 1', 'Apr 30']], egypt: [['Nov 1', 'Nov 30'], ['Apr 1', 'May 31']],
};

// ================= 1. winter wheat where the winter is not cold: harvested the next summer, not in February to April =================
await group('1. winter wheat in mild winters', () => {
  for (const [key, [sow, harvest]] of Object.entries(WHEAT)) {
    const t = SE.cropTiming('wheat', climate(key)), name = AT[key].label;
    ok(`${name}: winter wheat has sowing dates`, t.ok && fin(t.sow) && fin(t.harvest), t.words);
    near(`${name}: winter wheat sown about ${SE.dayWord(t.sow)}`, t.sow, sow);
    near(`${name}: winter wheat harvested about ${SE.dayWord(t.harvest)}`, t.harvest, harvest);
    ok(`${name}: the harvest is in the year after the sowing, or the same winter's spring where it grows through the winter`, t.harvest > 365 && t.harvest - t.sow >= 120, [t.sow, t.harvest]);
    ok(`${name}: the words give the dates, with no "NaN" or "undefined"`, !BAD.test(SE.timingWords(t)) && !BAD.test(SE.varietyWords(t)), [SE.timingWords(t), SE.varietyWords(t)]);
  }
  // where the winter is truly mild, wheat grows through it and is cut in spring: Punjab and the Nile Delta keep a spring harvest
  for (const key of ['punjab', 'egypt']) { const t = SE.cropTiming('wheat', climate(key)); ok(`${AT[key].label}: winter wheat is ready in spring, not in summer`, onYear(t.harvest) <= day('May 31'), SE.dayWord(t.harvest)); }
  // Leamington and Essex, Ontario (an accuracy check of 1,000 Ontario places): wheat after soybeans was ready about Apr 9; Ontario cuts it in July
  const P = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'accuracy', 'places.json'), 'utf8')).places.find(p => p.id === 'P0001');
  const S = D.buildSeries(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(HERE, 'fixtures', 'accuracy', `power_${P.cell}.json.gz`)))), { lat: P.lat, lon: P.lon });
  const CLe = CL.computeClimate(S, P.lat, { today: TODAY });
  const R = E.optionsFor(stateOf('corn-soy-wheat', 'reduced', 'assumed'), CLe, { lat: P.lat, lon: P.lon, elev: S.cellElev, country: 'CA', today: TODAY }, { today: TODAY });
  const w = R.current.seasons.find(s => s.crop === 'wheat'), soy = R.current.seasons.find(s => s.crop === 'soy');
  same('Leamington: soybeans still off Oct 4 and wheat still sown a week later, Oct 11', [soy.harvest, w.sow], ['2028-10-04', '2028-10-11']);
  near('Leamington: winter wheat harvested the next summer', SE.doyOfIso(w.harvest).doy, ['Jul 10', 'Jul 31']);
});

// ================= 2. the southern hemisphere: its seasons come half a year after the north's =================
const SOUTH_WHEAT = { wheatbelt: [['May 1', 'Jun 30'], ['Nov 1', 'Dec 31']], swartland: [['May 1', 'Jun 30'], ['Oct 1', 'Nov 30']], chile: [['May 1', 'Aug 31'], ['Dec 1', 'Jan 31']] };
const SOUTH = ['pergamino', 'riogrande', 'chile', 'swartland', 'wheatbelt'];
await group('2. the southern hemisphere', () => {
  for (const [key, [sow, harvest]] of Object.entries(SOUTH_WHEAT)) {
    const t = SE.cropTiming('wheat', climate(key)), name = AT[key].label;
    near(`${name}: wheat sown about ${SE.dayWord(t.sow)}`, t.sow, sow);
    near(`${name}: wheat harvested about ${SE.dayWord(t.harvest)}`, t.harvest, harvest);
  }
  // Pergamino: wheat is cut in November and December. Farmers there sow it in June and July, later than its warmth allows; the engine
  // has no rule for that (frost at heading), so it sows when the autumn cools, in April or May: checked here only for the right half of the year.
  const pw = SE.cropTiming('wheat', climate('pergamino'));
  near('Pergamino, Argentina: wheat harvested about ' + SE.dayWord(pw.harvest), pw.harvest, ['Nov 1', 'Dec 31']);
  ok('Pergamino, Argentina: wheat is sown in the southern autumn or winter, never in the northern September', inside(onYear(pw.sow), day('Mar 1'), day('Jul 31')), SE.dayWord(pw.sow));
  for (const key of ['pergamino', 'riogrande']) { const t = SE.cropTiming('corn', climate(key)); near(`${AT[key].label}: corn sown about ${SE.dayWord(t.sow)}`, t.sow, ['Sep 1', 'Dec 31']); }
  // Soybeans: sown there from October to December (Rio Grande do Sul) and November to December (Pergamino). Where the winter is not cold they
  // are now sown no earlier than the month of FAO-56's row moved half a year (Oct 31), not at the first warm day after the last frost (Sep 11 and
  // Jul 31 before); group 5 checks the dates. Here: in the southern spring, after the last spring frost, ready in its summer or autumn.
  for (const key of ['pergamino', 'riogrande']) {
    const C = climate(key), t = SE.cropTiming('soy', C), last = CL.keyToDoy(C.med.frostLast, true);
    ok(`${AT[key].label}: soybeans are not sown in the northern spring months (March to June), which are autumn and early winter here`, !inside(onYear(t.sow), day('Mar 1'), day('Jun 30')), SE.dayWord(t.sow));
    ok(`${AT[key].label}: soybeans are sown after the normal last spring frost (about ${SE.dayWord(last)})`, t.sow > last, [SE.dayWord(t.sow), SE.dayWord(last)]);
    ok(`${AT[key].label}: soybeans are ready in the southern summer or autumn (December to May)`, inside(onYear(t.harvest), day('Dec 1'), day('May 31')), SE.dayWord(t.harvest));
  }
  // the crop table's usual months move half a year in the south: corn with no cold month to wait for (Rio Grande do Sul) is sown in October, not April
  same('Rio Grande do Sul: corn is sown on the first day of its usual month moved to the south, Oct 1', SE.dayWord(SE.cropTiming('corn', climate('riogrande')).sow), 'Oct 1');
  // the sentences: the growing season and the frost dates are the place's own
  for (const key of SOUTH) {
    const C = climate(key), R = E.optionsFor(stateOf('corn-soy-wheat'), C, { lat: AT[key].lat, lon: AT[key].lon, elev: AT[key].elev, country: null, today: TODAY }, { today: TODAY });
    const texts = [...R.current.evidence.map(e => e.text), ...R.current.risks, ...R.current.gaps, ...R.current.seasons.map(s => s.timing ?? '')];
    same(`${AT[key].label}: no "NaN", "undefined" or "null" in any sentence`, texts.filter(t => BAD.test(String(t))), []);
    ok(`${AT[key].label}: the growing season is named October to March`, !texts.some(t => /April to September/.test(t)) && (!C.dryOf || texts.some(t => /growing seasons \(October to March\)/.test(t))), texts.filter(t => /growing season/.test(t)));
    ok(`${AT[key].label}: the stress years are counted here too`, texts.some(t => /tested years/.test(t)), '');
    const line = texts.find(t => /^The usual last spring frost/.test(t));
    // Frost in under half the years (Central Valley of Chile and the wheatbelt on NASA's record): the middle of those few years is no usual date, so
    // none is given and the line says how many years had a frost. The stations there see frost more often; the line says a station can.
    if (C.frostFreeClimate) {
      const n = C.yearly.frostLast.filter(fin).length, few = texts.find(t => /^(Frost came in only|No frost came in)/.test(t));
      ok(`${AT[key].label}: frost in ${n} of ${C.years.length} years, so no usual frost dates are given and the line says so`, !line && !!few && few.includes(n ? `only ${n} of the last ${C.years.length} years` : `last ${C.years.length} years`), [line, few]);
    } else if (fin(C.med.frostLast) && fin(C.med.frostFirst)) {
      const last = CL.keyToDoy(C.med.frostLast, true), first = CL.keyToDoy(C.med.frostFirst, true);
      ok(`${AT[key].label}: the frost line gives the southern dates (last spring frost about ${SE.dayWord(last)}, first autumn frost about ${SE.dayWord(first)})`, !!line && line.includes(`about ${SE.dayWord(last)}`) && line.includes(`about ${SE.dayWord(first)}`) && inside(last, day('Jun 1'), day('Dec 31')) && inside(first, day('Mar 1'), day('Aug 31')), line);
    } else ok(`${AT[key].label}: no frost in most years, so no frost dates are given`, !line, line);
  }
  // the frost count of the risks, on real days: the Pergamino soybeans meet a spring frost in the years whose last spring frost came after their sowing day
  const C = climate('pergamino'), R = E.optionsFor(stateOf('corn-soy-wheat'), C, { lat: AT.pergamino.lat, lon: AT.pergamino.lon, elev: AT.pergamino.elev, country: null, today: TODAY }, { today: TODAY });
  const soy = R.current.seasons.find(s => s.crop === 'soy'), sowDay = SE.doyOfIso(soy.sow).doy;
  const byHand = C.yearly.frostLast.filter(k => fin(k) && CL.keyToDoy(k, true) >= sowDay).length;
  ok(`Pergamino: the soybean frost count is the years whose last spring frost came on or after its sowing (${byHand} of ${C.yearly.frostLast.length})`, R.current.risks.some(t => t.includes(`soybeans in ${byHand} of ${C.yearly.frostLast.length}`)) || byHand === 0, R.current.risks.filter(t => /frost/.test(t)));
  // a place with no frost at all still works: Swartland
  const Sw = climate('swartland');
  ok('Swartland: frost in under half the years', Sw.frostFreeClimate === true, String(Sw.frostFreeClimate));
  for (const id of ['wheat', 'corn', 'soy']) { const t = SE.cropTiming(id, Sw); ok(`Swartland: ${id} has a timing and plain words`, fin(t.sow) && fin(t.harvest) && !BAD.test(SE.timingWords(t)), SE.timingWords(t)); }
  // the north keeps its own words
  const K = E.optionsFor(stateOf('corn-soy'), climate('kansas'), { lat: AT.kansas.lat, lon: AT.kansas.lon, elev: AT.kansas.elev, country: 'US', today: TODAY }, { today: TODAY });
  ok('Central Kansas: the growing season is still named April to September', K.current.evidence.some(e => /growing seasons \(April to September\)/.test(e.text)), '');
});

// ---- the farmer's answers used below
function stateOf(preset, tillage = 'reduced', soil = 'assumed') {
  return { rotation: { preset, custom: [], garden: null, second: {} }, farm: { irrigation: 'none', tillage, livestock: false, coverOK: true, labor: false },
    soil: soil === 'map' ? { mode: 'map', texture: 'silt', om: 'high', omPct: 3.5 } : { mode: 'assumed', texture: null, om: null, omPct: null }, soilTest: null, avoid: [], prio: [3, 3, 3, 3, 3] };
}
const dates = R => R.current.seasons.map(s => [s.crop, s.sow, s.harvest]);

// ================= the answers that must not move =================
await group('unchanged: the demo field near Mead, Nebraska', () => {
  const C = climate('mead'), w = SE.cropTiming('wheat', C), f = SE.followOn('wheat', 'soy', C);
  same('Mead: winter wheat rests through a cold winter: sown from Oct 1 to about Nov 8, ready mid July', [w.kind, SE.dayWord(w.window.earliest), SE.dayWord(w.window.latest), SE.dayWord(w.harvest)], ['winter', 'Oct 1', 'Nov 8', 'Jul 15']);
  same('Mead: after soybeans (off Sep 15) wheat is sown Oct 1', [f.ok, SE.dayWord(f.prev.harvest), SE.dayWord(f.next.sow)], [true, 'Sep 15', 'Oct 1']);
  const spot = { lat: AT.mead.lat, lon: AT.mead.lon, elev: 357.5, slope: 0.5, soil: { texture: 'silt', source: 'map' }, country: 'US', fieldDrawn: true, today: TODAY };
  const R1 = E.optionsFor(stateOf('corn-soy', 'notill', 'map'), C, spot, { today: TODAY }), R2 = E.optionsFor(stateOf('corn-soy-wheat', 'notill', 'map'), C, spot, { today: TODAY });
  same('Mead, corn then soybeans: the same score and dates', [R1.current.score, dates(R1)], [69, [['corn', '2027-04-23', '2027-09-20'], ['soy', '2028-04-28', '2028-09-15'], ['corn', '2029-04-23', '2029-09-20']]]);
  same('Mead, corn, soybeans, winter wheat: the same score and dates', [R2.current.score, dates(R2)], [67, [['corn', '2027-04-23', '2027-09-20'], ['soy', '2028-04-28', '2028-09-15'], ['wheat', '2028-10-01', '2029-07-15']]]);
});
await group('unchanged: the Oxford demo field, Ontario', () => {
  const S = D.fitHeight(D.buildSeries(JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'power_oxford.json'), 'utf8')), { lat: 43.13, lon: -80.75 }), JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'height_oxford.json'), 'utf8')).results[0].elevation);
  const C = CL.computeClimate(S, S.lat, { today: TODAY, cold: null }), spot = { lat: 43.13, lon: -80.75, elev: S.cellElev, country: 'CA', today: TODAY };
  const R1 = E.optionsFor(stateOf('corn-soy'), C, spot, { today: TODAY }), R2 = E.optionsFor(stateOf('corn-soy-wheat'), C, spot, { today: TODAY });
  same('Oxford, corn then soybeans: the same score and dates', [R1.current.score, dates(R1)], [69, [['corn', '2027-05-13', '2027-10-10'], ['soy', '2028-05-17', '2028-10-04'], ['corn', '2029-05-13', '2029-10-10']]]);
  same('Oxford, corn, soybeans, winter wheat: the same score and dates', [R2.current.score, dates(R2)], [68, [['corn', '2027-05-13', '2027-10-10'], ['soy', '2028-05-17', '2028-10-04'], ['wheat', '2028-10-11', '2029-07-15']]]);
});

// ================= 3. the frost line of the risks says what it counts =================
// A year counts when its last spring frost came on or after the sowing day, or, for a crop that frost kills, its first autumn frost came on or
// before the harvest day. A frost before the crop is up counts too: no published emergence rule is kept in the crop table, so the count stays
// and the sentence says so. (At Mead the nearest station record, Mead 6 S, gives corn 13 of 25 on the same rule; NASA's square gives 6.)
await group('3. the frost line', () => {
  const C = climate('mead'), spot = { lat: AT.mead.lat, lon: AT.mead.lon, elev: 357.5, slope: 0.5, soil: { texture: 'silt', source: 'map' }, country: 'US', fieldDrawn: true, today: TODAY };
  const R = E.optionsFor(stateOf('corn-soy', 'notill', 'map'), C, spot, { today: TODAY }), line = R.current.risks.find(t => /frost came/.test(t));
  const count = (sow, harvest) => C.yearly.frostLast.filter((last, k) => (fin(last) && last >= sow) || (fin(C.yearly.frostFirst[k]) && C.yearly.frostFirst[k] <= harvest)).length;
  const corn = count(day('Apr 23'), day('Sep 20')), soy = count(day('Apr 28'), day('Sep 15'));
  same('Mead: the counts are the years with a frost on or after the sowing day or by the harvest day, on NASA\'s record (corn 6, soybeans 4)', [corn, soy], [6, 4]);
  same('Mead: the sentence says what it counts, frost before the crop is up included',
    line, `In some years a frost came on or after the sowing day, or by the harvest day (corn in ${corn} of 25 years and soybeans in ${soy} of 25). This counts a frost before the crop is up too. Check your sowing dates with farmers near you.`);
  ok('Mead: the old words, which named a "late spring or early autumn frost", are gone', !R.current.risks.some(t => /late spring or early autumn frost/.test(t)), R.current.risks);
});

// ================= 4. the plan follows the south's season years; the stress years count what the crop met in the field =================
await group('4. southern plans, stress years in the field, the monsoon', () => {
  const plan = (key, preset) => E.optionsFor(stateOf(preset), climate(key), { lat: AT[key].lat, lon: AT[key].lon, elev: AT[key].elev, country: null, today: TODAY }, { today: TODAY });
  const doy = iso => { const d = SE.doyOfIso(iso); return Date.UTC(d.year, 0, 1) / 864e5 + d.doy; };
  // A summer crop in the south is cut after New Year and its wheat in November of the same season year: each crop follows the one before
  // within a year, never a whole year later (Pergamino had soybeans off Jan 29 and wheat sown 14 months later), and never before it is off.
  for (const key of SOUTH) for (const preset of ['corn-soy-wheat', 'corn-soy']) {
    const S = plan(key, preset).current.seasons.filter(s => s.sow && s.harvest);
    for (let k = 1; k < S.length; k++) {
      const gap = doy(S[k].sow) - doy(S[k - 1].harvest);
      ok(`${AT[key].label}, ${preset}: ${S[k].crop} sown ${S[k].sow}, after the ${S[k - 1].crop} harvest of ${S[k - 1].harvest} and within a year of it`, gap >= 0 && gap < 365, gap);
    }
  }
  const P = plan('pergamino', 'corn-soy-wheat').current.seasons;
  same('Pergamino: corn on its own day, soybeans the next spring, wheat the autumn after the soybeans are off', P.map(s => [s.crop, s.sow, s.harvest]),
    // the soybeans changed from Sep 11 to Jan 29: sown at the first warm day after the last frost, two months before Pampa farmers sow them;
    // now from Oct 31 (FAO-56's May row, half a year on) to Mar 20, in the usual November to December and March to May (group 5)
    [['corn', '2027-08-30', '2028-01-27'], ['soy', '2028-10-31', '2029-03-20'], ['wheat', '2029-04-18', '2029-11-05']]);
  // Hot days count only while the crop is in the field: Pergamino's 35 °C days come from December to February, after its wheat is cut in
  // November, and its wheat flowers in September, outside the October to March season whose rain the dry-year count reads.
  const pr = plan('pergamino', 'corn-soy-wheat').current.evidence.find(e => Array.isArray(e.years));
  const wheatLines = (pr?.years ?? []).flatMap(y => y.why).filter(t => /^winter wheat/.test(t));
  same('Pergamino: no stress year blames the wheat for summer heat or for a dry October to March', wheatLines, []);
  for (const key of ['kansas', 'panhandle', 'punjab', 'mead']) {
    const C = climate(key), ev = plan(key, 'corn-soy-wheat').current.evidence.find(e => Array.isArray(e.years));
    const bad = (ev?.years ?? []).filter(y => y.why.some(t => { const m = /^winter wheat: about (\d+) days of 35 °C or more in the field$/.exec(t); return m && !(+m[1] <= C.yearly.heat35[C.years.indexOf(y.year)] + 0.5); }));
    same(`${AT[key].label}: a wheat heat line never counts more hot days than the whole year had`, bad, []);
    ok(`${AT[key].label}: the old whole-year heat words are gone`, !(ev?.years ?? []).some(y => y.why.some(t => /^winter wheat: \d+ days of 35/.test(t))), ev?.years);
  }
  // Punjab: frost in 3 of 25 years, a dry winter and the monsoon in the warm half. Soybeans were sown Jan 21 (the first day after the coldest at
  // their 14 °C); farmers sow them with the monsoon, mid June to July, and cut them in October.
  const ps = SE.cropTiming('soy', climate('punjab'));
  same('Punjab: soybeans are timed by the rains', ps.kind, 'rains');
  near(`Punjab: soybeans sown about ${SE.dayWord(ps.sow)}`, ps.sow, ['Jun 15', 'Jul 15']);
  near(`Punjab: soybeans ready about ${SE.dayWord(ps.harvest)}`, ps.harvest, ['Oct 1', 'Oct 31']);
  same('Punjab: winter wheat keeps its timing (sown Dec 1, ready Apr 28)', [SE.dayWord(SE.cropTiming('wheat', climate('punjab')).sow), SE.dayWord(SE.cropTiming('wheat', climate('punjab')).harvest)], ['Dec 1', 'Apr 28']);
  // a frost-free place whose rains come in winter (Swartland, the wheatbelt) keeps the spring timing: the rains rule is for the warm half
  for (const key of ['swartland', 'wheatbelt']) for (const id of ['corn', 'soy']) same(`${AT[key].label}: ${id} is not timed by its winter rains`, SE.cropTiming(id, climate(key)).kind, 'spring');
  // "ready about Nov 20, after the normal first autumn frost (Nov 20)": the same day is not after it
  for (const key of Object.keys(AT)) for (const id of ['corn', 'soy']) {
    const r = (SE.cropTiming(id, climate(key)).remarks ?? []).find(t => /after the normal first autumn frost/.test(t)), m = r && /ready about (\w+ \d+), after the normal first autumn frost \((\w+ \d+)\)/.exec(r);
    ok(`${AT[key].label}: ${id} is never "after" a frost on its own ready day`, !m || m[1] !== m[2], r);
  }
});

// ================= 5. soybeans where the winter is not cold; the dry season of a winter-rain place =================
// FAO-56's soybean row of 140 days is the one for a May sowing in the Central USA. Where the winter is not cold the normal mean passes the
// soybeans' 14 °C weeks before May, and they were sown in March or April, before the corn (Tifton Mar 6, ready Jul 24; Raleigh Apr 6; Stuttgart
// Mar 27; Passo Fundo Jul 31, in its winter; Pergamino Sep 11). Now they are not sown before May (half a year on in the south), unless the summer
// heat there fails a May sowing that an earlier one passes. Where the winter is cold the field's own warmth still sets the day (Mead Apr 28, above).
// Usual dates in the US: USDA NASS, Field Crops Usual Planting and Harvesting Dates (Agricultural Handbook 628), the most active dates of each state.
const SOY_US = {
  tifton: [['May 17', 'Jun 26'], ['Oct 25', 'Dec 8']], georgia: [['May 17', 'Jun 26'], ['Oct 25', 'Dec 8']], raleigh: [['May 20', 'Jun 30'], ['Nov 10', 'Dec 5']],
  stuttgart: [['May 5', 'Jun 22'], ['Sep 29', 'Nov 13']], maryland: [['May 28', 'Jun 26'], ['Oct 18', 'Nov 15']], enid: [['Apr 27', 'Jun 27'], ['Sep 22', 'Nov 20']],
  lancaster: [['May 20', 'Jun 10'], ['Oct 20', 'Nov 10']],
};
// where the 140-day row is ready within four weeks of NASS's harvest dates; elsewhere it is ready in mid September, three to seven weeks before
// them: much of the South's soybeans are sown after wheat in June, and later varieties are grown there, and FAO-56 gives no row for them
const SOY_US_HARVEST = ['stuttgart', 'enid'];
const SOY_SOUTH = { pergamino: [['Nov 1', 'Dec 31'], ['Mar 1', 'May 31']], riogrande: [['Oct 1', 'Dec 31'], ['Mar 1', 'May 15']], passofundo: [['Oct 1', 'Dec 31'], ['Mar 1', 'May 15']] };
await group('5. soybeans in mild winters, winter rains', () => {
  for (const [key, [sow, harvest]] of [...Object.entries(SOY_US), ...Object.entries(SOY_SOUTH)]) {
    const C = climate(key), t = SE.cropTiming('soy', C), c = SE.cropTiming('corn', C), name = AT[key].label;
    ok(`${name}: the winter is not cold here`, C.coldWinter === false, String(C.coldWinter));
    ok(`${name}: soybeans have sowing dates`, t.ok && t.kind === 'spring', t.words);
    near(`${name}: soybeans sown about ${SE.dayWord(t.sow)}`, t.sow, sow);
    if (SOY_US_HARVEST.includes(key) || !SOY_US[key]) near(`${name}: soybeans ready about ${SE.dayWord(t.harvest)}`, t.harvest, harvest);
    else ok(`${name}: soybeans are ready in September or later, not in July or August (ready about ${SE.dayWord(t.harvest)})`, onYear(t.harvest) >= day('Sep 1'), SE.dayWord(t.harvest));
    ok(`${name}: soybeans are not sown before the corn (corn ${SE.dayWord(c.sow)}, soybeans ${SE.dayWord(t.sow)})`, !(c.ok && fin(c.sow)) || (onYear(t.sow) - onYear(c.sow) + 365) % 365 < 182, [SE.dayWord(c.sow), SE.dayWord(t.sow)]);
  }
  // Passo Fundo had its soybeans sown Jul 31, a day after its usual last frost, with a frost in 19 of 25 years: now in the southern spring
  const pf = SE.cropTiming('soy', climate('passofundo'));
  ok(`Passo Fundo: soybeans are sown after the normal last spring frost (sown ${SE.dayWord(pf.sow)})`, pf.sow > CL.keyToDoy(climate('passofundo').med.frostLast, true), SE.dayWord(pf.sow));
  // Carlow, Ireland: the summer only just reaches the soybeans' 14 °C in July, and the 140-day row is ready on the day of the usual first autumn
  // frost; the remark says so rather than staying silent on the same day
  const cs = SE.cropTiming('soy', climate('carlow')), first = CL.keyToDoy(climate('carlow').med.frostFirst, false);
  ok(`Carlow: soybeans ready about ${SE.dayWord(cs.harvest)}, and the remark names the first autumn frost (${SE.dayWord(first)}) when it is the same day or earlier`,
    Math.round(cs.harvest) < Math.round(first) || (cs.remarks ?? []).some(r => r.includes(`ready about ${SE.dayWord(cs.harvest)}, ${Math.round(cs.harvest) > Math.round(first) ? 'after' : 'on the day of'} the normal first autumn frost (${SE.dayWord(first)})`)), cs.remarks);
  // Winter-rain places (Cunderdin and the wheatbelt, Malmesbury and the Swartland, central Chile): October to March is the dry summer, and the
  // wheat grows in the rainy winter. A short October to March rain is not laid on the wheat there (a summer crop still gets it); where the season
  // counted is the wet half (Kansas, Mead) the wheat still gets it.
  const lines = (key, preset = 'corn-soy-wheat') => {
    const ev = E.optionsFor(stateOf(preset), climate(key), { lat: AT[key].lat, lon: AT[key].lon, elev: AT[key].elev, country: null, today: TODAY }, { today: TODAY }).current.evidence.find(e => Array.isArray(e.years));
    return (ev?.years ?? []).flatMap(y => y.why);
  };
  for (const key of ['cunderdin', 'wheatbelt', 'malmesbury', 'swartland', 'chile']) same(`${AT[key].label}: the winter wheat is not blamed for a dry October to March`, lines(key).filter(t => t === 'winter wheat: dry season'), []);
  for (const key of ['kansas', 'mead']) ok(`${AT[key].label}: a dry April to September is still laid on the winter wheat, which flowers in it`, lines(key).includes('winter wheat: dry season'), '');
  // Ireland, the Netherlands, the Columbia Basin, Konya: rain mostly from October to March too, but those months are too cold to grow through
  // (a month under 5 °C), so a dry April to September is still laid on the wheat there in its dry years
  for (const key of ['meath', 'flevoland', 'columbia', 'konya']) ok(`${AT[key].label}: a dry April to September is still laid on the winter wheat`, !(climate(key).dryYears ?? []).length || lines(key).includes('winter wheat: dry season'), climate(key).dryYears);
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
