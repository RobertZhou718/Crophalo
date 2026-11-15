// Crophalo's offline suite for what the Ontario accuracy run over 1,000 places found: eight answers that were wrong, each held against the
// answers that run kept (NASA POWER squares, 35 ECCC station records, crop-map answers) in scripts/fixtures/accuracy/, and the Oxford demo.
// Run: node scripts/test_accuracy.mjs (no network). CROPHALO_ROOT=<folder> runs the same checks on another copy's js/. Last line "N passed, M failed".
// RULE: never loosen a check here without a written farming reason beside it: each one stands for a sentence a farmer would have read.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), FIX = path.join(HERE, 'fixtures', 'accuracy');
const ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(HERE, '..'));
const load = f => import(pathToFileURL(path.join(ROOT, 'js', f)).href);
const [D, CL, E, NB, SE, PL, WD, CR] = await Promise.all(['data.js', 'climate.js', 'engine.js', 'nearby.js', 'season.js', 'places.js', 'weather-data.js', 'crops.js'].map(load));
const H = await import(pathToFileURL(path.join(HERE, 'hand_climates.mjs')).href);   // only its hand-made records (makeSeries, PLACES): every climate below is worked out by ROOT's own js/
// The two demo fields from their recorded answers, through ROOT's own code (as scripts/hand_climates.mjs does it for this folder's code).
const recorded = file => JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', file), 'utf8'));
const oxford = () => { const S0 = D.buildSeries(recorded('power_oxford.json'), { lat: 43.13, lon: -80.75 }), S = D.fitHeight(S0, recorded('height_oxford.json').results[0].elevation); return { S, C: CL.computeClimate(S, S.lat, { today: '2026-11-14', cold: null }) }; };
const barrie = () => { const S = D.buildSeries(recorded('power_barrie.json'), { lat: 44.4, lon: -79.78 }); return { S, C: CL.computeClimate(S, S.lat, { today: '2026-11-14' }) }; };
const handClimate = spec => CL.computeClimate(H.makeSeries(spec), spec.lat, { today: '2026-11-14' });

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 400 ? s.slice(0, 400) + '…' : s; };
const ok = (name, cond, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${detail ? `: ${brief(detail)}` : ''}`); } };
const same = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, want ${brief(want)}`);
async function group(name, run) { try { await run(); } catch (e) { ok(`${name}: ran to its end`, false, e?.stack?.split('\n').slice(0, 2).join(' ') || String(e)); } }
const fin = Number.isFinite, TODAY = '2026-11-14';
const BAD = /\bNaN\b|undefined|\bnull\b|\[object|Infinity/;
const median = list => { const s = list.filter(fin).sort((a, b) => a - b), h = s.length >> 1; return !s.length ? NaN : s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

// ---- the places of the accuracy run, their weather squares and their crop-map answers
const PLACES = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(FIX, 'places.json'), 'utf8')).places.map(p => [p.id, p]));
const power = cell => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(FIX, `power_${cell}.json.gz`))));
const climateAt = id => { const p = PLACES[id], S = D.buildSeries(power(p.cell), { lat: p.lat, lon: p.lon }); return { p, S, C: CL.computeClimate(S, p.lat, { today: TODAY }) }; };
const pinned = p => p.cropmap && (p.cropmap.pin !== undefined || p.aci == null ? p.cropmap : { ...p.cropmap, pin: { code: +p.aci, name: p.aci_name } });   // the class at the point, as the run read it
const spotOf = (p, S) => ({ lat: p.lat, lon: p.lon, elev: S.cellElev, country: p.country || 'CA', today: TODAY, ...(pinned(p) ? NB.spotFields(pinned(p)) : {}) });
// A pin that the crop map shows as forest, shrubland or other land that is not a field is asked about before it is judged (scripts/test_nonfarm.mjs, on purpose:
// "a pin on water, desert, ice, a city or woods is asked about instead of judged as a field"). Three places here are such pins (P0853 shrubland, P0964 and P0966 broadleaf forest).
// The checks below look at the plans, so they give the farmer's word, as "This is my field: carry on" does; with the word the answer is the plan it was before.
const worded = spot => (spot.notField ? { ...spot, fieldOk: true } : spot);
const spotWorded = (p, S) => worded(spotOf(p, S));
const state = (preset, custom = []) => ({ rotation: { preset, custom, garden: null, second: {} }, farm: { irrigation: 'none', tillage: 'reduced', livestock: false, coverOK: true, labor: false }, soil: { mode: 'assumed', texture: null, om: null, omPct: null }, soilTest: null, avoid: [], prio: [3, 3, 3, 3, 3] });
const PRESETS = ['corn-soy', 'corn-corn', 'corn-soy-wheat'];
const plansOf = R => [R.current, ...(R.others || [])].filter(Boolean);
const textsOf = R => [R.reason, ...(R.gaps || []), ...(R.risks || []), ...(R.evidence || []).map(e => e.text), ...plansOf(R).flatMap(p => [p.name, p.why, p.fit, p.fitWhy, ...(p.risks || []), ...(p.gaps || []), ...(p.evidence || []).map(e => e.text), ...(p.seasons || []).map(s => s.timing)])].filter(t => t !== null && t !== undefined);

// ================= 1. "scores 66 against NaN now": a current plan that cannot be scored =================
await group('1. a plan that cannot be scored', () => {
  for (const id of ['P0930', 'P0949', 'P0950']) {   // Hudson Bay coast near Fort Severn, Attawapiskat, Peawanuck
    const { p, S, C } = climateAt(id);
    for (const preset of PRESETS) {
      const R = E.optionsFor(state(preset), C, spotOf(p, S), { today: TODAY });
      same(`${p.label}, ${preset}: no "NaN", "undefined" or "null" in any sentence`, textsOf(R).filter(t => BAD.test(String(t))), []);
      ok(`${p.label}, ${preset}: the gain is a number or null, never NaN`, R.gain === null || fin(R.gain), String(R.gain));
      if (R.current && R.current.score === null) ok(`${p.label}, ${preset}: with no score for what is grown now, the reason says why instead of a number`, /what you grow now (doesn't suit here|could not be scored here)|has no score here/i.test(R.reason) && R.gain === null, R.reason);
    }
  }
  const { p, S, C } = climateAt('P0930'), R = E.optionsFor(state('corn-soy'), C, spotOf(p, S), { today: TODAY });
  same('Fort Severn, corn then soybeans: the current plan carries no score, and its words say corn needs 125 frost-free days and the field has about 100', [R.current.score, /^Corn: it needs about 125 frost-free days and the field has about 100 in a normal year\./.test(R.current.fitWhy ?? '')], [null, true]);
});

// ================= 2. lake and river points =================
await group('2. a pin on water', () => {
  const B = barrie();   // the weather does not matter here: a water pin is answered before any crop is looked at
  for (const name of ['georgianbay', 'lakesimcoe', 'lakenipissing', 'lakeofthewoods', 'lakestclair', 'clearlake']) {
    const answer = JSON.parse(fs.readFileSync(path.join(FIX, `cropsnear_${name}.json`), 'utf8'));
    const R = E.optionsFor(state('corn-soy'), B.C, { lat: answer.box.south + 0.125, lon: answer.box.west + 0.125, country: answer.country, ...NB.spotFields(answer) }, { today: TODAY });
    same(`${name}: the crop map says water at the pin (class ${answer.pin?.code}), so there is no plan, only the words`, [NB.gateFrom(answer).water, R.current, R.recommended, R.others.length, R.reason], [true, null, null, 0, 'This point is water: Crophalo cannot compare crops here. Put the pin on the field itself.']);
  }
  // the same five lakes in the accuracy run's own crop-map answers, with the class at the point the run read (AAFC 20 Water)
  for (const id of ['P0898', 'P0900', 'P0901', 'P0902', 'P0903']) {
    const p = PLACES[id];
    same(`${p.label}: the run read class ${p.aci} (${p.aci_name}) at the point, and the gate says water`, [p.aci, NB.gateFrom(pinned(p)).water], [20, true]);
  }
  const OX = oxford(), OXA = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'oxford_cropsnear.json'), 'utf8'));
  const farm = E.optionsFor(state('corn-soy'), OX.C, { lat: 43.13, lon: -80.75, country: 'CA', ...NB.spotFields({ ...OXA, pin: { code: 147, name: 'Corn for grain' } }) }, { today: TODAY });
  ok('a pin on farmland still gets its plans', !!farm.recommended && farm.others.length > 0 && !farm.notFarmland);
});

// ================= 3. 0, 0 and squares that are sea, ice or never warm =================
await group('3. not a field at all', async () => {
  same('0, 0 is refused in words where a position is typed and where it is asked for', [PL.parseCoords('0, 0')?.reason, PL.parseCoords('0.00001, -0.00002')?.reason, D.cleanPlace(0, 0).reason], Array(3).fill('The position reads 0, 0: that point is open sea off West Africa, and it is what a missing position usually turns into. Check the two numbers and try again.'));
  same('a place on one zero line is still a place', [PL.parseCoords('0, 32.5'), PL.parseCoords('5.6, 0'), D.cleanPlace(0, 32.5)], [{ lat: 0, lon: 32.5 }, { lat: 5.6, lon: 0 }, { lat: 0, lon: 32.5 }]);
  const sw = PLACES.P0990, S = D.buildSeries(power(sw.cell), { lat: sw.lat, lon: sw.lon });   // latitude and longitude swapped: -80.75, 43.13 (Antarctica)
  same('swapped latitude and longitude (Antarctica): NASA has no land under the square, said in words', D.landProblem(S), 'NASA POWER’s weather square here is sea or ice: it holds no soil wetness and no water from the land on any day, so Crophalo cannot compare crops here. Put the pin on the field itself.');
  const C = CL.computeClimate(S, sw.lat, { today: TODAY }), R = E.optionsFor(state('corn-soy'), C, { lat: sw.lat, lon: sw.lon }, { today: TODAY });
  same('…and the engine gives no plan and no figure there', [R.notFarmland, R.current, R.recommended, R.others.length], [true, null, null, 0]);
  const calls = [], env = { fetch: async url => { calls.push(url); return new Response(JSON.stringify(/power\.larc/.test(url) ? power(sw.cell) : {}), { status: /power\.larc/.test(url) ? 200 : 500 }); }, caches: null, now: () => Date.parse('2026-11-14T12:00:00Z') };
  const R2 = await (await load('report-load.js')).loadSpot({ lat: sw.lat, lon: sw.lon }, env);
  same('the report loader answers in words, with no figures, and never asks the back-up record for a square of ice', [R2.ok, R2.reason, R2.climate, calls.some(u => /archive-api/.test(u))], [false, D.landProblem(S), undefined, false]);
  const got = await D.fetchPower(sw.lat, sw.lon, { fetch: env.fetch, caches: null, now: env.now });
  same('fetchPower says the same, as a final answer (no back-up record is tried)', [got.ok, got.final, got.reason], [false, true, D.landProblem(S)]);
  const arctic = climateAt('P0992');   // 80 N, 80 W: Ellesmere Island, land, but no month above 2.6 °C
  same('the far Arctic square has land readings but no month above 5 °C: no growing season, said in words', [D.landProblem(arctic.S), Math.max(...arctic.C.monthly.tmean) <= 5, CL.notFarmlandWords(arctic.C)], ['', true, 'No month here averages above 5 °C, the warmth crops need to grow (the growing season of FAO GAEZ), so this is not farmland: Crophalo cannot compare crops here.']);
  same('…and gets no plan', E.optionsFor(state('corn-soy'), arctic.C, spotOf(arctic.p, arctic.S), { today: TODAY }).notFarmland, true);
  const severn = climateAt('P0930');
  same('Fort Severn is land with a summer (warmest month 11.7 °C): it is never refused as not farmland, it gets its plans and their reasons', [D.landProblem(severn.S), CL.notFarmlandWords(severn.C), !!E.optionsFor(state('corn-soy'), severn.C, spotOf(severn.p, severn.S), { today: TODAY }).current], ['', '', true]);
});

// ================= 4. a crop sown before the crop before it is harvested =================
// Every plan from every place: each sowing comes after the harvest before it, a second crop sits between them, every season is sown before it is harvested.
function broken(plan) {
  const out = [], S = plan.seasons || [];
  S.forEach((s, k) => {
    if (s.sow && s.harvest && !(s.sow < s.harvest)) out.push(`${s.crop} sown ${s.sow}, harvested ${s.harvest}`);
    if (s.second?.ok && !(s.harvest < s.second.sow && s.second.sow < s.second.harvest)) out.push(`second ${s.second.crop} ${s.second.sow} to ${s.second.harvest} after ${s.crop} ${s.harvest}`);
    const prev = S[k - 1], off = prev?.second?.ok ? prev.second.harvest : prev?.harvest;
    if (off && s.sow && !(off < s.sow)) out.push(`${s.crop} sown ${s.sow} is not after the ${prev.second?.ok ? prev.second.crop : prev.crop} harvest ${off}`);
  });
  return out.map(text => `${plan.name}: ${text}`);
}
await group('4. sowing after the harvest before it', () => {
  for (const id of ['P0853', 'P0889']) {   // Sudbury to Timmins; Hudson Bay lowlands: the short seasons where the run found it
    const { p, S, C } = climateAt(id);
    if (id === 'P0853') ok(`${p.label}: the pin is shrubland on the crop map, so without the farmer's word the field is asked about`, !!E.optionsFor(state('corn-soy'), C, spotOf(p, S), { today: TODAY }).askField);
    for (const preset of PRESETS) {
      const R = E.optionsFor(state(preset), C, spotWorded(p, S), { today: TODAY });
      same(`${p.label}, ${preset}: every sowing is after the harvest before it`, plansOf(R).flatMap(broken), []);
      same(`${p.label}, ${preset}: no new idea whose winter crop cannot follow the crop before it in time`, R.others.filter(o => (o.risks || []).some(r => /with no shorter variety in the FAO-56 rows that leaves room/.test(r))).map(o => o.name), []);
      same(`${p.label}, ${preset}: a winter crop is sown a week or more after the harvest before it`, plansOf(R).flatMap(pl => pl.seasons.filter((s, k) => s.window && s.sow && pl.seasons[k - 1]?.harvest && SE.doyOfIso(s.sow).doy + (s.sow.slice(0, 4) > pl.seasons[k - 1].harvest.slice(0, 4) ? 365 : 0) - SE.doyOfIso(pl.seasons[k - 1].harvest).doy < SE.TURN).map(s => `${pl.name}: ${s.crop} ${s.sow}`)), []);
    }
  }
  // Leamington and Essex: winters there are mild by the engine's line (no month under −3 °C), so winter wheat is timed as an autumn crop,
  // with no window to clip it; its usual day (Sep 29) came before the soybeans were off (Oct 4). It now waits a week after that harvest.
  const lm = climateAt('P0001');
  for (const preset of ['corn-soy', 'corn-soy-wheat']) {
    const R = E.optionsFor(state(preset), lm.C, spotOf(lm.p, lm.S), { today: TODAY }), w = plansOf(R).find(pl => pl.slots.join() === 'corn,soy,wheat');
    same(`Leamington, ${preset}: winter wheat after soybeans is sown a week after the soybean harvest (Oct 4 to Oct 11), and every plan keeps the order`, [SE.kindOf('wheat', lm.C), w?.seasons[1].harvest.slice(5), w?.seasons[2].sow.slice(5), plansOf(R).flatMap(broken)], ['autumn', '10-04', '10-11', []]);
  }
  // the farmer's own corn, soybeans, then winter canola, where the canola window (to Sep 18) closes before the soybeans are off (Nov 10):
  // shown, as it is what the farmer grows, said not to suit, and its canola sown a week after the soybean harvest, never into the standing crop
  const { p, S, C } = climateAt('P0889'), R = E.optionsFor(state('custom', ['corn', 'soy', 'canola']), C, spotOf(p, S), { today: TODAY }), cur = R.current;
  const ci = cur.seasons.findIndex(s => s.crop === 'canola'), cs = cur.seasons[ci], before = cur.seasons[ci - 1];
  same('Hudson Bay lowlands, corn, soybeans, canola: the farmer\'s own plan is shown and does not suit, with the reason', [cur.flag, cur.score, cur.risks.some(r => /^Canola does not pass .*Canola after the soybeans: the soybeans are ready about Nov 10, and a week later is past the last good sowing day here \(about Sep 18\)/.test(r))], ['fails', null, true]);
  same('…and its canola is sown a week after the soybean harvest (Nov 10 to Nov 17), not on Sep 1 into the standing soybeans', [before.harvest.slice(5), cs.sow.slice(5), broken(cur)], ['11-10', '11-17', []]);
  // every place there is: the recorded squares of the run, the demo fields, the four recorded weather places and the hand-made climates
  const climates = [...Object.keys(PLACES).filter(id => !['P0986'].includes(id) && fs.existsSync(path.join(FIX, `power_${PLACES[id].cell}.json.gz`))).map(id => { const { p, S, C } = climateAt(id); return [p.label, C, spotWorded(p, S)]; }),
    ['Oxford', oxford().C, { lat: 43.13, lon: -80.75, country: 'CA' }], ['Barrie', barrie().C, { lat: 44.4, lon: -79.78, country: 'CA' }],
    ...Object.entries(H.PLACES).map(([name, spec]) => [name, handClimate(spec), { lat: spec.lat, lon: 0 }])];
  const rotations = [...PRESETS.map(p => state(p)), state('canola-wheat'), state('sunflower-wheat'), state('wheat-barley'), state('custom', ['soy', 'canola']), state('custom', ['corn', 'soy', 'canola']), state('custom', ['sunflower', 'wheat', 'soy']), { ...state('corn-soy'), rotation: { preset: 'custom', custom: ['wheat', 'corn'], garden: null, second: { 0: 'soy' } } }];
  let plans = 0; const bad = [];
  for (const [name, C, spot] of climates) for (const st of rotations) { const R = E.optionsFor(st, C, spot, { today: TODAY }); if (R.notFarmland) continue; for (const pl of plansOf(R)) { plans++; bad.push(...broken(pl).map(b => `${name}: ${b}`)); } }
  same(`every plan from every place (${climates.length} places, ${rotations.length} rotations): each sowing after the harvest before it`, bad.slice(0, 8), []);
  ok('…and that is many plans, not a few', plans > 500, String(plans));
});

// ================= 5. the first autumn frost against 35 ECCC weather stations =================
await group('5. the first autumn frost', async () => {
  const ST = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(FIX, 'stations.json.gz'))));
  const days = []; for (let t = Date.parse(`${ST.first.slice(0, 4)}-${ST.first.slice(4, 6)}-${ST.first.slice(6)}T00:00Z`), end = Date.parse(`${ST.last.slice(0, 4)}-${ST.last.slice(4, 6)}-${ST.last.slice(6)}T00:00Z`); t <= end; t += 864e5) days.push(new Date(t).toISOString().slice(0, 10).replace(/-/g, ''));
  const nums = list => list.map(v => (v === null ? NaN : v));
  // the station's own nights are counted at 0 °C (no longitude: the margin is for NASA's square only); NASA's nights go through the app as they would at the station
  const rows = ST.stations.map(s => {
    const station = CL.computeFrost({ days, T2M_MIN: nums(s.station), source: 'power' }, s.lat, { today: TODAY });
    const nasa = CL.computeFrost({ days, T2M_MIN: nums(s.nasa), source: 'power', lon: s.lon }, s.lat, { today: TODAY });
    return { name: s.name, first: nasa.first - station.first, last: nasa.last - station.last };
  });
  same('35 stations, each with a usual first autumn frost on both records', [rows.length, rows.every(r => fin(r.first))], [35, true]);
  const first = median(rows.map(r => r.first)), absFirst = median(rows.map(r => Math.abs(r.first))), last = median(rows.map(r => r.last));
  ok(`the first autumn frost: NASA minus the station, the middle of 35 stations, is under 5 days (it is ${first})`, Math.abs(first) < 5, rows.map(r => `${r.name} ${r.first}`).join('; '));
  ok(`…and within the 3 days the accuracy run asked for (${first})`, Math.abs(first) <= 3);
  ok(`the size of the difference, station by station, is smaller than NASA's own 10.5 days (it is ${absFirst})`, absFirst < 10.5);
  ok(`the last spring frost is left as it was: still within 3 days (${last})`, Math.abs(last) <= 3);
  const card = (await load('sources.js')).sourceNote('eccc');   // the source card says what the 35 stations show, no rounder than that
  ok(`the stations' source card gives the middle difference as the stations show it (${first} days): "about a day", never "under a day"`, Math.abs(first) < 1 || (/median difference is about a day/.test(card?.talk ?? '') && !/under a day/.test(card?.talk ?? '')), card?.talk);
  // where the margin is used: within 300 km of a station, NASA's record only
  same('the margin is used near the stations only: Oxford, Barrie, New Liskeard, Sudbury, Thunder Bay yes; Ames (Iowa), Konya, Sault Ste. Marie, Fort Severn no',
    [[43.13, -80.75], [44.4, -79.78], [47.57, -79.43], [46.33, -81.46], [48.32, -89.47], [42.03, -93.62], [37.87, 32.48], [46.52, -84.35], [56, -87.6]].map(([a, b]) => CL.autumnLine('power', a, b)), [2.5, 2.5, 2.5, 2.5, 2.5, 0, 0, 0, 0]);
  same('the back-up record (ERA5) is read as it is, without the margin', CL.autumnLine('era5', 43.13, -80.75), 0);
  const OX = oxford(), F = CL.computeFrost(OX.S, OX.S.lat, { today: TODAY });
  same('Oxford: the usual first autumn frost is Oct 18 (NASA\'s own reading said Oct 31); the climate and the report\'s frost dates agree', [CL.dateWord(OX.C.med.frostFirst), CL.dateWord(F.first), OX.C.frostMargin, OX.C.frostSource], ['Oct 18', 'Oct 18', 2.5, 'power+eccc']);
  const words = CL.frostWords(F);
  ok('the words give the usual date, where it comes from, and that low, cold spots can get frost two weeks earlier or more', /First autumn frost: usually about Oct 18\./.test(words) && /35 Ontario weather stations \(Environment and Climate Change Canada\)/.test(words) && /Low, cold spots can get frost two weeks earlier, or more\./.test(words), words);
  const W = WD.buildWeather({ series: OX.S, climate: OX.C, loc: { lat: 43.13, lon: -80.75 }, now: Date.parse('2026-11-14T12:00:00Z') });
  same('the Weather tab names the stations as a source of the frost dates', [W.facts.find(f => f.id === 'frost').sources, W.facts.find(f => f.id === 'free').sources], [['power', 'eccc'], ['power', 'eccc']]);
  const R = E.optionsFor(state('corn-soy'), OX.C, { lat: 43.13, lon: -80.75, country: 'CA' }, { today: TODAY }), line = R.evidence.find(e => /usual first autumn frost/.test(e.text));
  ok('the report\'s frost line says the same, with both sources', !!line && line.sources.join() === 'power,eccc' && /Low, cold spots can get frost two weeks earlier, or more\./.test(line.text), line?.text);
});

// ================= 6. a score beside "Doesn't suit here" =================
await group('6. no number on a plan that does not suit', () => {
  for (const id of ['P0741', 'P0949', 'P0889']) {   // Clay Belt (Hearst to Cochrane), Attawapiskat, Hudson Bay lowlands
    const { p, S, C } = climateAt(id);
    for (const preset of PRESETS) {
      const R = E.optionsFor(state(preset), C, spotOf(p, S), { today: TODAY }), fails = plansOf(R).filter(pl => pl.flag === 'fails');
      ok(`${p.label}, ${preset}: there are plans here that do not suit, so the two checks below look at something`, fails.length > 0);
      same(`${p.label}, ${preset}: every plan that does not suit carries no score, no part scores and no pest score`, fails.filter(pl => pl.score !== null || Object.values(pl.scores).some(v => v !== null) || pl.pest !== null).map(pl => `${pl.name} ${pl.score}`), []);
      same(`${p.label}, ${preset}: and its words say why`, fails.filter(pl => !/So it has no score here\.$/.test(pl.fitWhy ?? '')).map(pl => pl.name), []);
      if (R.current.flag === 'fails') ok(`${p.label}, ${preset}: the reason gives no number for what is grown now`, !/against \d+ (for what you grow now|now)/.test(R.reason) && /what you grow now doesn't suit here|has no score here/i.test(R.reason), R.reason);
    }
  }
});

// ================= 7. two points 220 m apart across a weather-square edge =================
await group('7. the weather square', () => {
  const a = climateAt('P0964'), b = climateAt('P0966');   // 43.25, -80.3125 and 43.249, -80.3135, Oxford area
  ok('two points 220 m apart sit in two squares and read about a degree and a week or more of frost-free days apart (8.6 against 9.5 °C, 160 against 168 days)', a.p.cell !== b.p.cell && Math.abs(b.C.med.T - a.C.med.T) > 0.8 && Math.abs(b.C.med.frostFree - a.C.med.frostFree) >= 7, `${a.C.med.T} ${b.C.med.T} ${a.C.med.frostFree} ${b.C.med.frostFree}`);
  for (const { p, S, C } of [a, b]) {
    const W = WD.buildWeather({ series: S, climate: C, loc: { lat: p.lat, lon: p.lon }, now: Date.parse('2026-11-14T12:00:00Z') });
    ok(`${p.label}: the frost-free season says, in one plain sentence, that nearby fields can differ because the weather is a 50 km square`, W.facts.find(f => f.id === 'free').text.includes(CL.SQUARE_WORDS) && /about 50 km across/.test(CL.SQUARE_WORDS), W.facts.find(f => f.id === 'free').text);
    const asked = E.optionsFor(state('corn-soy'), C, spotOf(p, S), { today: TODAY });
    ok(`${p.label}: the pin is broadleaf forest on the crop map, so without the farmer's word the field is asked about, with no plan`, asked.notFarmland === true && !!asked.askField && asked.current === null, asked.reason);
    const R = E.optionsFor(state('corn-soy'), C, spotWorded(p, S), { today: TODAY });
    ok(`${p.label}: the report says it too, once, among what it cannot see`, R.gaps.filter(g => g === CL.SQUARE_WORDS).length === 1);
  }
});

// ================= 8. winter wheat where the winter nights are colder than it survives =================
await group('8. winter cold on winter wheat', () => {
  let read = 0;   // borderline wheat plans whose words were read: the "says why" check below looks at something
  same('the crop table: hardened winter wheat survives −24 °C and 7.5 cm of snow shelters it (OMAFRA Field Crop News, "Winter Survival")', [CR.cropOf('wheat').winterKill, CR.cropOf('wheat').winterSnow, CR.cropOf('wheat').winterBy], [-24, 7.5, 'OMAFRA']);
  for (const id of ['P0702', 'P0808', 'P0786']) {   // New Liskeard and Temiskaming, Sudbury basin farms, Thunder Bay farms
    const { p, S, C } = climateAt(id), night = fin(C.coldLow) ? C.coldLow : C.coldNight;
    ok(`${p.label}: the coldest night of a normal winter here is colder than the −24 °C hardened winter wheat survives (${Math.round(night)} °C)`, night < -24);
    for (const preset of PRESETS) {
      const R = E.optionsFor(state(preset), C, spotOf(p, S), { today: TODAY });
      same(`${p.label}, ${preset}: winter wheat is never the firm suggestion here`, R.recommended !== R.current && R.recommended.slots.includes('wheat'), false);
      const wheat = plansOf(R).filter(pl => pl.slots.includes('wheat'));
      same(`${p.label}, ${preset}: every plan with winter wheat only just suits, or does not suit`, wheat.filter(pl => pl.flag === 'holds').map(pl => pl.name), []);
      read += wheat.filter(pl => pl.flag === 'borderline').length;
      same(`${p.label}, ${preset}: and says why, with the coldest night and the snow`, wheat.filter(pl => pl.flag === 'borderline' && !pl.risks.some(r => /^Winter wheat only just suits this field: .*the coldest night of a normal winter here, about −\d+ °C, is colder than the −24 °C that hardened winter wheat survives \(OMAFRA\), so it lives through the winter only under snow \(7\.5 cm is enough\)/.test(r))).map(pl => pl.name), []);
    }
  }
  ok(`the three places hold many plans with winter wheat that only just suits, and each was read for its words (${read})`, read >= 10, String(read));
  for (const [name, C] of [['Oxford', oxford().C], ['Barrie', barrie().C]]) {
    ok(`${name}: a normal winter's coldest night (${Math.round(C.coldLow)} °C) is above the −24 °C line, so winter wheat keeps its own flag here`, C.coldLow > -24 && E.winterCold('wheat', C) === null);
  }
});

// ================= what the screens say about a plan that does not suit (found when the fixes were checked again) =================
// The engine gives such a plan no number and a reason in words (fitWhy). The report and My Farm must show those words: never "not read
// yet", never "Keep" or "Why it suits this field" for what does not suit, and never a number in its place.
await group('the screens, for a plan that does not suit', async () => {
  const [RV, FC, W, SH, CARD] = await Promise.all(['report-view.js', 'farmchips.js', 'words.js', 'sharetext.js', 'fieldcard.js'].map(load));
  for (const id of ['P0930', 'P0741']) {   // Hudson Bay coast near Fort Severn; the Clay Belt: corn does not suit, and no other idea is a firm suggestion
    const { p, S, C } = climateAt(id), st = state('corn-soy'), R = E.optionsFor(st, C, spotOf(p, S), { today: TODAY }), cur = R.current;
    same(`${p.label}: what is grown now does not suit, has no number, and no other idea is a firm suggestion`, [cur.flag, cur.score, R.recommended === cur, /So it has no score here\.$/.test(cur.fitWhy)], ['fails', null, true, true]);
    const r = { state: 'ok', options: R }, chip = FC.chipsFrom(r, {}, 'current').find(c => c.id === 'score'), sheet = FC.sheetFor('score', r, {}, 'current').lines;
    same(`${p.label}, My Farm: the plan chip says "Doesn't suit here", read, with no number`, [chip.value, chip.state, /\d/.test(chip.value)], ["Doesn't suit here", 'ok', false]);
    ok(`${p.label}, My Farm: the chip's sheet gives the reason in words, not "not read yet"`, sheet.includes(cur.fitWhy) && !sheet.some(l => /not read yet/.test(l)), sheet.join(' | '));
    const card = RV.optionCardHTML(cur, R, false), detail = RV.optionDetailHTML(cur, R), view = RV.overviewHTML(R, { state: st });
    ok(`${p.label}, the report: the option card says it does not suit, with no score ring`, card.includes(W.esc(cur.fit)) && !card.includes('rv-ring'), card);
    ok(`${p.label}, the report: the option's detail gives the reason in words`, detail.includes(W.esc(cur.fitWhy)), detail);
    const head = view.match(/rv-headline">([^<]*)</)?.[1] ?? '';
    ok(`${p.label}, the report: the headline never says "Keep" for what does not suit, and the reason is never "why it suits this field"`, head !== '' && !/^Keep /.test(head) && !view.includes('Why it suits this field') && !view.includes('our suggestion: keep it') && !view.includes('Our suggestion is to keep'), head);
    // The text message and the printed field card take the plan's score as it is: a plan with no score must never print as 0.
    const shared = { name: 'Field', place: { label: p.label, lat: p.lat, lon: p.lon }, suggestion: { headline: cur.name, why: cur.fitWhy, score: cur.score, years: ['Corn', 'Soybeans'] }, nowScore: cur.score, options: [], notes: [], sources: [] };
    const printed = `${SH.longMessage(shared)}\n${CARD.fieldCardHTML(shared)}`;
    ok(`${p.label}: the text message and the field card never turn the missing score into 0`, !/scores 0 out of 100|Score 0 out of 100|grow now: 0\)|grow now scores 0/.test(printed), printed.split('\n').filter(l => /score/i.test(l)).join(' | '));
  }
});

// ================= the Oxford demo answer stays what it was =================
await group('the Oxford demo', () => {
  const OX = oxford(), OXA = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'oxford_cropsnear.json'), 'utf8'));
  for (const prio of [[3, 3, 3, 3, 3], [2, 4, 5, 2, 3]]) {
    const R = E.optionsFor({ ...state('corn-soy'), prio }, OX.C, { lat: 43.13, lon: -80.75, country: 'CA', ...NB.spotFields(OXA) }, { today: TODAY });
    const w = plansOf(R).find(pl => pl.slots.join() === 'corn,soy,wheat'), ws = w?.seasons[2], ss = w?.seasons[1];
    same(`Oxford, priorities ${prio.join(' ')}: "Keep corn and soybeans", and corn, soybeans, winter wheat holds up`, [R.recommended === R.current, R.current.name, w?.flag, w?.fit], [true, 'Corn, then soybeans', 'holds', 'Holds up']);
    same(`Oxford, priorities ${prio.join(' ')}: the same dates: soybeans off Oct 4, wheat window Oct 1 to Nov 5, sown Oct 11, harvested Jul 15`, [ss?.harvest, ws?.window?.earliest, ws?.window?.latest, ws?.sow, ws?.harvest], ['2028-10-04', '2028-10-01', '2028-11-05', '2028-10-11', '2029-07-15']);
  }
});

console.log(`${passed} passed, ${failed} failed`);
