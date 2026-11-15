// Crophalo's offline suite for the "grown nearby" gate: the crop-map lookup scripts/live/cropsnear.py (run the way the server runs it, with the network ALWAYS
// replaced by the answers recorded from the live services on 2026-11-14) and js/nearby.js, which turns its answer into what the
// report leaves out (spot.absent) and ranks first (spot.common). Also checks the hand-written map from each map's classes to
// crops.js ids against the maps' own class lists.
/*
 * Run: node scripts/test_cropsnear.mjs (no network). The last line is "N passed, M failed".
 */
import fs from 'node:fs';
import { flagged } from './wordguard.mjs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isCrop, cropOf, isGarden } from '../js/crops.js';
import * as NB from '../js/nearby.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), LIVE = path.join(HERE, 'live'), REC = path.join(HERE, 'fixtures', 'live');
const PYTHON = path.resolve(HERE, '..', process.env.FW_PYTHON || path.join('.venv', 'bin', 'python'));
let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${detail ? `: ${String(detail).slice(0, 400)}` : ''}`); } };
const same = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const temps = [];
process.on('exit', () => temps.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const temp = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-cropsnear-')); temps.push(dir); return dir; };

// One run of the lookup on recorded answers: the parsed answer, stderr, the exit code.
function run(args, replay) {
  const cache = temp();
  const r = spawnSync(PYTHON, ['-u', 'cropsnear.py', ...args], { cwd: LIVE, encoding: 'utf8', timeout: 60e3,
    env: { PATH: process.env.PATH, FW_NET_REPLAY: replay, FW_NOW: '2026-11-14T12:00:00Z', FW_CACHE: cache, PYTHONWARNINGS: 'ignore' } });
  let answer = null; try { answer = JSON.parse(r.stdout); } catch { /* checked below */ }
  return { answer, err: r.stderr ?? '', code: r.status, lines: (r.stdout ?? '').split('\n').filter(Boolean).length };
}
// A copy of a recording with one thing changed by hand (the change is the test's own, in a temp folder).
function changed(name, edit) {
  const dir = temp();
  for (const f of fs.readdirSync(path.join(REC, name))) fs.copyFileSync(path.join(REC, name, f), path.join(dir, f));
  const metas = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({ f, meta: readJSON(path.join(dir, f)) }));
  edit(metas.map(({ f, meta }) => ({ meta, url: meta.url, body: path.join(dir, f.replace(/\.json$/, '.body')), save: m => fs.writeFileSync(path.join(dir, f), JSON.stringify(m)) })), dir);
  return dir;
}
const SPOTS = { oxford: ['43.1300', '-80.7500', 'CA'], barrie: ['44.4000', '-79.7800', 'CA'], ames: ['42.1000', '-93.6000', 'US'] };

// ---- the map from classes to crops.js ids, held against each map's own class list
const MAP = readJSON(path.join(LIVE, 'cropsnear_map.json')), LISTS = { aci: readJSON(path.join(LIVE, 'aci_classes.json')), cdl: readJSON(path.join(LIVE, 'cdl_codes.json')) };
const flat = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
for (const [mapName, M] of Object.entries({ aci: MAP.aci, cdl: MAP.cdl })) {
  const list = LISTS[mapName], lines = [...Object.entries(M.own), ...Object.entries(M.wider)];
  same(`${mapName}: every mapped class has the name the map's own class list gives it`, lines.filter(([code, [name]]) => flat(list[code]) !== flat(name)).map(([code, [name]]) => `${code} ${name} / ${list[code]}`), []);
  same(`${mapName}: every mapped crop is a crop of crops.js ("*" = any crop)`, lines.flatMap(([, [, ids]]) => ids).filter(id => id !== '*' && !isCrop(id)), []);
  same(`${mapName}: every class counted as farmland is in the map's class list`, M.cropland.filter(c => !Object.hasOwn(list, String(c))), []);
  same(`${mapName}: every mapped class is counted as farmland, and no unread class is`, [lines.filter(([code]) => !M.cropland.includes(+code)).map(([c]) => c), M.noread.filter(c => M.cropland.includes(c))], [[], []]);
  same(`${mapName}: an own class names its crops once`, lines.filter(([, [, ids]]) => new Set(ids).size !== ids.length).map(([c]) => c), []);
}
// the hand checks themselves: the classes whose crop is not plain from the name alone
same('AAFC "Winter wheat" is crops.js winter wheat, "Spring wheat" spring wheat, "Corn for grain" corn', [MAP.aci.own['145'][1], MAP.aci.own['146'][1], MAP.aci.own['147'][1]], [['wheat'], ['swheat'], ['corn']]);
same('AAFC has no durum class: durum is judged by "Wheat" and "Spring wheat", which may hold it', [MAP.aci.wider['140'][1].includes('durum'), MAP.aci.wider['146'][1]], [true, ['durum']]);
same('"Canola/rapeseed" does not say winter or spring canola, so it holds both and names neither', MAP.aci.wider['153'][1], ['canola', 'scanola']);
// USDA's "Millet" (29) is proso millet, the millet US farmers grow (NASS Acreage report of 2026: "Proso millet"), so it is now an own class of the crop proso;
// it was a wide class of pearl and finger millet before proso was a crop of the table. AAFC's "Millet" (135) does not say which millet, so it stays wide.
same('AAFC "Millet" does not say pearl or finger millet; USDA "Millet" is proso millet, an own class', [MAP.aci.wider['135'][1], MAP.cdl.own['29'][1], Object.hasOwn(MAP.cdl.wider, '29')], [['pmillet', 'fmillet'], ['proso'], false]);
same('USDA "Other Small Grains" may hold proso, teff, quinoa, durum and spring wheat, no longer pearl or finger millet', MAP.cdl.wider['25'][1], ['proso', 'teff', 'quinoa', 'durum', 'swheat']);
// The 19 crops US farmers plant on over one million acres (NASS Acreage report of 2026, and Crop Production 2025 Summary): each has an own class that names its crop,
// so the map can lead to each of them. Hay other than alfalfa (37) and canola (31, and rapeseed 34) were wide classes before and are own classes now.
const BIG = { 1: 'corn', 5: 'soy', 37: 'ley', 24: 'wheat', 36: 'alfalfa', 2: 'cotton', 23: 'swheat', 4: 'sorghum', 31: 'canola', 21: 'barley', 28: 'oats', 27: 'rye', 3: 'rice', 22: 'durum', 10: 'groundnut', 6: 'sunflower', 42: 'bean', 53: 'pea', 41: 'sugarbeet' };
same('USDA: each of the 19 crops over one million US acres has an own class that names it', Object.entries(BIG).filter(([code, id]) => !MAP.cdl.own[code]?.[1].includes(id)).map(([code, id]) => `${code} ${id}`), []);
same('USDA canola and rapeseed are own classes of both canolas; other hay is grass hay', [MAP.cdl.own['31'][1], MAP.cdl.own['34'][1], MAP.cdl.own['37'][1]], [['canola', 'scanola'], ['canola', 'scanola'], ['ley']]);
same('USDA lettuce double crops count lettuce too, and the vegetables have their own classes', [MAP.cdl.own['230'][1], MAP.cdl.own['231'][1], MAP.cdl.own['232'][1], MAP.cdl.own['233'][1], ['12', '46', '48', '49', '214', '227'].map(c => MAP.cdl.own[c][1][0])],
  [['lettuce', 'durum'], ['lettuce', 'melon'], ['lettuce', 'cotton'], ['lettuce', 'barley'], ['sweetcorn', 'sweetpotato', 'watermelon', 'onion', 'cauliflower', 'lettuce']]);
// ---- the "garden" part: USDA classes of a crop that stays in the ground for years, read only at the pin
const GARDEN = MAP.cdl.garden;
same('USDA garden: every class has the name the map\'s own class list gives it', Object.entries(GARDEN).filter(([code, [name]]) => flat(LISTS.cdl[code]) !== flat(name)).map(([code, [name]]) => `${code} ${name} / ${LISTS.cdl[code]}`), []);
same('USDA garden: every class names one standing-crop entry of crops.js GARDENS, and is counted as farmland', [Object.entries(GARDEN).filter(([, [, ids]]) => ids.length !== 1 || !ids.every(isGarden)).map(([c]) => c), Object.keys(GARDEN).filter(c => !MAP.cdl.cropland.includes(+c))], [[], []]);
same('USDA garden: almonds (75) are almonds and grapes (69) are grapes', [GARDEN['75'], GARDEN['69']], [['Almonds', ['almond']], ['Grapes', ['grape']]]);
// The crop table has no plum entry, and a plum grower must not be handed the needs of peaches and cherries (scripts/test_crops.mjs): plums and prunes
// go to "Other trees or bushes". Strawberries (221) are left out: in some US regions they are replanted every year, and no published source on that was read.
same('USDA garden: plums and prunes are "other trees", strawberries and mint are not in the part', [GARDEN['210'][1], GARDEN['220'][1], Object.hasOwn(GARDEN, '221'), Object.hasOwn(GARDEN, '14')], [['trees'], ['trees'], false, false]);
same('AAFC has no garden part', Object.hasOwn(MAP.aci, 'garden'), false);
// AAFC "Spring wheat" (146) is the one class written in two parts on purpose: own for spring wheat, wide for durum (checked above).
const twice = M => ['own', 'wider', 'garden'].flatMap(k => Object.keys(M[k] ?? {})).filter((c, i, all) => all.indexOf(c) !== i);
same('USDA: no class number is in two parts (own, wider, garden); AAFC: only 146', [twice(MAP.cdl), twice(MAP.aci)], [[], ['146']]);
same('"Pasture/forages" may hold alfalfa: it is never read as "no alfalfa"', MAP.aci.wider['122'][1], ['alfalfa', 'ley']);
same('USDA double crops count for both crops of the year', [MAP.cdl.own['26'][1], MAP.cdl.own['241'][1]], [['wheat', 'soy'], ['corn', 'soy']]);
ok('USDA grassland and pasture (176) is not farmland here; AAFC pasture/forages (122) is', !MAP.cdl.cropland.includes(176) && MAP.aci.cropland.includes(122));
same('AAFC cloud and USDA "No Data" are unread land', [MAP.aci.noread, MAP.cdl.noread], [[10], [0, 81, 88]]);

// ---- the lookup on the recorded live answers
const got = {};
for (const [name, args] of Object.entries(SPOTS)) {
  const r = run(args, path.join(REC, `cropsnear-${name}`)); got[name] = r.answer;
  ok(`${name}: one JSON object, exit code 0, no request missing from the recording`, r.code === 0 && r.lines === 1 && !/NET-REPLAY-MISS/.test(r.err), r.err.slice(-300));
  ok(`${name}: a good answer made from recordings says so`, r.answer?.ok === true && r.answer.replayed === true, JSON.stringify(r.answer)?.slice(0, 300));
  if (!r.answer?.ok) continue;
  const A = r.answer, sum = A.classes.reduce((s, c) => s + c.share, 0);
  ok(`${name}: source, data year, units and licence are named`, A.source && A.data_date === String(A.year) && A.units && A.licence);
  ok(`${name}: the farmland classes add up to the farmland (shares to 1 within rounding)`, Math.abs(sum - 1) < 0.002 && Math.abs(A.classes.reduce((s, c) => s + c.ha, 0) - A.cropland_ha) < 5, `${sum}`);
  same(`${name}: the box is the field ± 0.125 degrees`, [A.box.north - A.box.south, A.box.east - A.box.west].map(v => Math.round(v * 1e4) / 1e4), [0.25, 0.25]);
  ok(`${name}: every crop in the answer is a crops.js id`, A.crops.every(c => isCrop(c.crop) && c.share > 0 && c.ha > 0));
}
const share = (A, id) => A?.crops.find(c => c.crop === id)?.share ?? 0;
same('Oxford, AAFC 2025: corn, soybeans, winter wheat as the map counts them', [got.oxford?.year, share(got.oxford, 'corn'), share(got.oxford, 'soy'), share(got.oxford, 'wheat'), got.oxford?.cropland_ha], [2025, 0.4982, 0.263, 0.0972, 42781.2]);
same('Oxford: canola and rapeseed are 10.4 ha of 42,781; no chickpeas, no millet', [got.oxford?.wider.find(w => w.code === 153)?.ha, share(got.oxford, 'chickpea'), got.oxford?.wider.some(w => w.code === 135)], [10.4, 0, false]);
same('Barrie, AAFC 2025: soybeans, corn, winter wheat as the map counts them', [got.barrie?.year, share(got.barrie, 'soy'), share(got.barrie, 'corn'), share(got.barrie, 'wheat'), got.barrie?.cropland_ha], [2025, 0.3422, 0.1872, 0.1639, 18901.1]);
same('Iowa, USDA Cropland Data Layer 2025: corn and soybeans', [got.ames?.year, share(got.ames, 'corn'), share(got.ames, 'soy')], [2025, 0.6401, 0.3375]);
ok('one pixel of the Web Mercator grid is (30 m × cos latitude)² on the ground', Math.abs(got.oxford?.pixel_ha - (30 * Math.cos(43.13 * Math.PI / 180)) ** 2 / 1e4) < 1e-4);

// ---- the class at the pin itself (a second request, the map service's identify): the box can hold farmland while the pin is in a lake
same('the farm pins read their own class: Oxford 34 Urban/developed (the demo pin is on the edge of Woodstock), Barrie 122 Pasture/forages, Ames 1 Corn',
  [got.oxford?.pin, got.barrie?.pin, got.ames?.pin], [{ code: 34, name: 'Urban/developed' }, { code: 122, name: 'Pasture/forages' }, { code: 1, name: 'Corn' }]);
// Five lake points of the Ontario accuracy run, and one US lake, each recorded live: the crop map says Water at the pin itself.
const LAKES = { georgianbay: ['45.3000', '-80.9000', 'CA', 20, 'Water'], lakesimcoe: ['44.4200', '-79.3500', 'CA', 20, 'Water'], lakenipissing: ['46.2700', '-79.7500', 'CA', 20, 'Water'],
  lakeofthewoods: ['49.1000', '-94.5000', 'CA', 20, 'Water'], lakestclair: ['42.4000', '-82.7000', 'CA', 20, 'Water'], clearlake: ['43.1300', '-93.4000', 'US', 111, 'Open Water'] };
const kept = name => readJSON(path.join(HERE, 'fixtures', 'accuracy', `cropsnear_${name}.json`));
for (const [name, [lat, lon, cc, code, word]] of Object.entries(LAKES)) {
  const r = run([lat, lon, cc], path.join(REC, `cropsnear-${name}`));
  ok(`${name}: one answer, nothing missing from the recording`, r.code === 0 && r.answer?.ok === true && !/NET-REPLAY-MISS/.test(r.err), r.err.slice(-200));
  same(`${name}: the pin's own class is ${code} ${word}, as the live answer said`, [r.answer?.pin, kept(name).pin], [{ code, name: word }, { code, name: word }]);
  same(`${name}: js/nearby.js reads a water pin as water, with the plain words`, [NB.gateFrom(r.answer).water, NB.gateFrom(r.answer).nearby.gap, NB.spotFields(r.answer).water], [true, NB.WATER_WORDS, true]);
}
same('Lake Simcoe and Lake St Clair: the box around the pin holds over 2,000 ha of farmland, so only the pin itself can tell it is water', [kept('lakesimcoe').cropland_ha > 2000, kept('lakestclair').cropland_ha > 2000], [true, true]);
const idf = list => list.find(x => /\/identify\?/.test(x.url));
const nopin = run(SPOTS.oxford, changed('cropsnear-oxford', l => { const h = idf(l); h.save({ ...h.meta, replies: [{ status: 503 }] }); }));
same('the pin lookup answers 503 twice: the box answer still stands, with no pin (never a guessed class)', [nopin.answer?.ok, nopin.answer?.pin, share(nopin.answer, 'corn')], [true, null, 0.4982]);
// The pin on a class of the "garden" part: the Iowa recording with the pin's class changed by hand to 75 Almonds and to 69 Grapes (the test's own change).
const pinAt = code => run(SPOTS.ames, changed('cropsnear-ames', l => { const h = idf(l); fs.writeFileSync(h.body, fs.readFileSync(h.body, 'utf8').replace('"value":"1"', `"value":"${code}"`)); }));
const almonds = pinAt(75), grapes = pinAt(69), corn = got.ames?.pin;
same('a pin on almonds or grapes says "garden" with its standing crop; a pin on corn stays as it was', [almonds.answer?.pin, grapes.answer?.pin, corn],
  [{ code: 75, name: 'Almonds', kind: 'garden', crops: ['almond'] }, { code: 69, name: 'Grapes', kind: 'garden', crops: ['grape'] }, { code: 1, name: 'Corn' }]);
same('a garden pin changes nothing in the box: the same shares as the plain Iowa answer', [share(almonds.answer, 'corn'), share(almonds.answer, 'soy'), almonds.answer?.cropland_ha], [share(got.ames, 'corn'), share(got.ames, 'soy'), got.ames?.cropland_ha]);
same('a garden pin is not water and not "not a field": the gate reads the box as usual', [NB.gateFrom(almonds.answer).water, NB.notField(almonds.answer), NB.gateFrom(almonds.answer).read], [false, null, true]);
same('a farm pin, or one not read, is never water: the gate stays as the box says', [NB.gateFrom(got.oxford).water, NB.gateFrom(nopin.answer).water, NB.gateFrom(got.oxford).read], [false, false, true]);

// ---- the failures, each in plain words
const fail = (name, r, re, final = false) => ok(name, r.code === 0 && r.lines === 1 && r.answer?.ok === false && re.test(r.answer.reason) && (!!r.answer.final) === final && Object.keys(r.answer).every(k => ['ok', 'reason', 'final'].includes(k)), JSON.stringify(r.answer));
fail('no country: the maps read here cover Canada and the US only (final)', run(['43.13', '-80.75'], path.join(REC, 'cropsnear-oxford')), /cover Canada \(CA\) and the 48 lower US states \(US\) only/, true);
fail('another country: the same (final)', run(['39.9', '32.8', 'TR'], path.join(REC, 'cropsnear-oxford')), /cover Canada/, true);
fail('a blank latitude is missing, never 0', run(['', '-80.75', 'CA'], path.join(REC, 'cropsnear-oxford')), /^lat and lon are required as decimal degrees$/);
fail('beyond 84 degrees: refused', run(['86', '-80.75', 'CA'], path.join(REC, 'cropsnear-oxford')), /^lat must be -84\.\.84 and lon -180\.\.180$/);
const hist = list => list.find(x => /computeHistograms/.test(x.url)), years = list => list.find(x => /\?f=json$/.test(x.url));
fail('the count answers 503 twice: did not answer, not final', run(SPOTS.oxford, changed('cropsnear-oxford', l => { const h = hist(l); h.save({ ...h.meta, replies: [{ status: 503 }] }); })), /^The Canadian crop map \(AAFC Annual Crop Inventory\) did not answer just now; try again in a minute$/);
fail('a 429: asked to slow down, nothing more is asked', run(SPOTS.oxford, changed('cropsnear-oxford', l => { const y = years(l); y.save({ ...y.meta, replies: [{ status: 429 }] }); })), /asked us to slow down; try again in a few minutes$/);
fail('a broken-off connection, then nothing: did not answer', run(SPOTS.oxford, changed('cropsnear-oxford', l => { const h = hist(l); h.save({ ...h.meta, replies: [{ fail: 'connection reset' }] }); })), /did not answer just now/);
const once = run(SPOTS.oxford, changed('cropsnear-oxford', l => { const h = hist(l); h.save({ ...h.meta, replies: [{ fail: 'connection reset' }, h.meta.replies[0]] }); }));
ok('fails once, then answers: the second try is used', once.answer?.ok === true && share(once.answer, 'corn') === 0.4982);
fail('no year listed: said so', run(SPOTS.oxford, changed('cropsnear-oxford', l => fs.writeFileSync(years(l).body, JSON.stringify({ currentVersion: 11.1, folders: [], services: [] })))), /did not list any year of its map/);
fail('a class value not in AAFC\'s list: no share is sent', run(SPOTS.oxford, changed('cropsnear-oxford', l => { const b = hist(l).body, j = readJSON(b); j.histograms[0].counts[144] = 5; fs.writeFileSync(b, JSON.stringify(j)); })), /used a class Crophalo does not know \(144\)/);
fail('a histogram that is not one bin per class: refused', run(SPOTS.oxford, changed('cropsnear-oxford', l => { const b = hist(l).body, j = readJSON(b); j.histograms[0].min = 0; j.histograms[0].max = 255; fs.writeFileSync(b, JSON.stringify(j)); })), /sent counts Crophalo could not read/);
fail('a box outside the map: no reading (final)', run(SPOTS.oxford, changed('cropsnear-oxford', l => { const b = hist(l).body, j = readJSON(b); j.histograms[0].counts = j.histograms[0].counts.map(() => 0); fs.writeFileSync(b, JSON.stringify(j)); })), /has no reading for this place$/, true);
const miss = run(['43.2000', '-80.7500', 'CA'], path.join(REC, 'cropsnear-oxford'));
ok('a request with no recording is refused, never sent out', miss.answer?.ok === false && /NET-REPLAY-MISS/.test(miss.err), miss.err.slice(-200));

// ---- js/nearby.js: from the answer to absent and common
const ox = NB.gateFrom(got.oxford), ba = NB.gateFrom(got.barrie), am = NB.gateFrom(got.ames);
ok('Oxford: the gate is read', ox.read === true && Array.isArray(ox.absent) && ox.nearby.source === 'aci');
same('Oxford: canola, chickpeas and finger millet are never newly suggested (under 250 ha in the box)', ['canola', 'chickpea', 'fmillet', 'scanola', 'pmillet'].map(id => ox.absent.includes(id)), [true, true, true, true, true]);
same('Oxford: corn a main crop (band 4), soybeans a main crop, winter wheat common (band 3)', [ox.bands.corn, ox.bands.soy, ox.bands.wheat], [4, 4, 3]);
same('Oxford: dry beans 213 ha is under 250 ha: band 1, left out', [ox.bands.bean, ox.absent.includes('bean')], [1, true]);
same('Oxford: alfalfa is not known (it may be in 5,656 ha of pasture and forages), so it is neither left out nor ranked', [ox.bands.alfalfa, ox.absent.includes('alfalfa'), Object.hasOwn(ox.common, 'alfalfa')], [null, false, false]);
same('Oxford: the ranking bonus is min(0.15, 0.04 × log10(share × 10,000))', ox.common, { corn: 0.148, wheat: 0.12, soy: 0.137 });
same('Barrie: canola, chickpeas and finger millet are left out too', ['canola', 'chickpea', 'fmillet'].map(id => ba.absent.includes(id)), [true, true, true]);
same('Barrie: winter wheat is a main crop of the box (16 of every 100 ha)', ba.bands.wheat, 4);
same('Iowa: corn and soybeans main crops, alfalfa grown (303 ha)', [am.bands.corn, am.bands.soy, am.bands.alfalfa, am.nearby.source], [4, 4, 2, 'cdl']);
ok('vegetables and fruit are never judged by the map', !['tomato', 'potato', 'onion', 'apple', 'sugarbeet'].some(id => Object.hasOwn(ox.bands, id)) && NB.judgedIds().every(id => ['grain', 'legume', 'oil', 'fibre', 'forage'].includes(cropOf(id).group)));
same('the Oxford line: counts with their denominator, from the map', ox.nearby.line, 'Farmland in a box about 28 km north to south and 20 km east to west around the field (AAFC Annual Crop Inventory 2025): 42,781 ha, of which every 100 ha hold about corn 50, soybeans 26, pasture and hay 13 and winter wheat 10.');
ok('no percent sign, no chance words in the lines', [ox, ba, am].every(g => !/%|likely|probab|chance|forecast/i.test(`${g.nearby.line} ${g.nearby.left}`)));
const small = NB.gateFrom({ ...got.oxford, cropland_ha: 1500 });
ok('under 2,000 ha of farmland: the map alone says too little and leaves nothing out, said so (scripts/test_countrygate.mjs: the national lists then take over)', small.read === false && small.absent === undefined && /only 1,500 ha of farmland/.test(small.nearby.gap));
const down = NB.gateFrom({ ok: false, reason: 'The Canadian crop map (AAFC Annual Crop Inventory) did not answer just now; try again in a minute' });
same('a failed lookup: the map alone leaves the gate open with its plain gap line, never a list (scripts/test_countrygate.mjs: the national lists then take over)', [down.read, down.absent, down.common, down.nearby.gap], [false, undefined, undefined, 'What farmers grow around here could not be read (The Canadian crop map (AAFC Annual Crop Inventory) did not answer just now; try again in a minute), so no crop was checked against local practice.']);
same('no answer at all: the gate is open', [NB.gateFrom(null).read, NB.spotFields(null).absent], [false, undefined]);
same('a broken answer: open, said so', NB.gateFrom({ ok: true, country: 'CA' }).nearby.gap, 'What farmers grow around here could not be read (the crop map sent an answer Crophalo could not read), so no crop was checked against local practice.');

// ---- the files: plain words only
const mine = ['js/nearby.js', 'scripts/live/cropsnear.py', 'scripts/live/cropsnear_map.json', 'scripts/test_cropsnear.mjs', 'scripts/record_demo.mjs'].map(f => [f, fs.readFileSync(path.join(HERE, '..', f), 'utf8')]);
const marks = new RegExp(['aud' + 'it', 'mile' + 'stone', 're' + 'build', 'Tur' + 'key\\b'].join('|'), 'i');
same('no tool names, no process words', mine.filter(([, t]) => marks.test(t) || flagged(t).length).map(([f]) => f), []);
same('js/nearby.js touches no page, network, clock or chance', /Date\.now|new Date\(|fetch\(|document\.|window\.|localStorage|Math\.random/.test(mine[0][1]), false);

console.log(`${passed} passed, ${failed} failed`);
