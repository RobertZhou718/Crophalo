// The national crop lists' suite: js/nearby.js countryGate and js/near-load.js, where the crop map says nothing and the crops a country does not grow are still left out.
// The figures are FAOSTAT's harvested areas per country, cut from the real lookup of 2026-11-15 (scripts/fixtures/faostat-gate.json); no network.
// Run: node scripts/test_countrygate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCrop } from '../js/crops.js';
import * as NB from '../js/nearby.js';
import { loadNearby, nearbyFrom } from '../js/near-load.js';
import { flagged } from './wordguard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`); } };
const same = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const FAO = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'faostat-gate.json'), 'utf8'));

// a map answer that reads the place (an Oxford-sized box with farmland) and the same box cut down to 1,500 ha
const MAP = { ok: true, country: 'US', year: 2025, box: { north: 39.1, south: 38.9, east: -76.8, west: -77.0 }, cropland_ha: 90000, crops: [{ crop: 'corn', share: 0.3, ha: 27000 }, { crop: 'soy', share: 0.3, ha: 27000 }], wider: [], classes: [], pin: { code: 1, name: 'Corn' } };
const SMALL = { ...MAP, cropland_ha: 1500 }, NONE = { ok: false, reason: 'x' };
const nat = (cc, answer = SMALL) => NB.spotFields(answer, FAO, cc);

const md = nat('US').absent;
ok('Maryland (a box with under 2,000 ha of farmland): pigeon peas, finger millet, teff, jute and bambara groundnuts are not suggested, the US harvests none of them', ['pigeonpea', 'fmillet', 'teff', 'jute', 'bambara'].every(id => md.includes(id)), md.join());
// Proso millet is the millet the US grows: FAO counts it in its one "Millet" item, of which the US harvests about 201,000 ha (the fixture's mean of 2022 to 2024).
same('proso millet passes in the United States: FAO\'s millet item, over 1,000 ha', [md.includes('proso'), FAO.countries.US.area.millet >= NB.FAO_MIN_HA], [false, true]);
same('a country with no millet in FAO\'s figures is not offered proso millet', NB.countryGate({ ...FAO, countries: { ...FAO.countries, US: { ...FAO.countries.US, area: { ...FAO.countries.US.area, millet: 0 } } } }, 'US').absent.includes('proso'), true);
ok('Maryland: corn, soybeans, wheat, cotton and sorghum stay, the US harvests tens of thousands of hectares of each', ['corn', 'soy', 'wheat', 'swheat', 'cotton', 'sorghum'].every(id => !md.includes(id)));
ok('the list says where it came from: FAOSTAT, the years, the country, what is left out', nat('US').nearby.source === 'fao' && /FAOSTAT, 2022 to 2024/.test(nat('US').nearby.line) && /United States of America/.test(nat('US').nearby.left), JSON.stringify(nat('US').nearby));
const fr = nat('FR', NONE).absent;
ok('no crop map at all (France): finger millet, teff and pigeon peas are left out; corn, wheat, sunflowers, canola and barley stay', ['fmillet', 'pigeonpea', 'teff'].every(id => fr.includes(id)) && ['corn', 'wheat', 'sunflower', 'canola', 'barley'].every(id => !fr.includes(id)), fr.join());
ok('India: pigeon peas and finger millet stay, teff does not', (a => !a.includes('pigeonpea') && !a.includes('fmillet') && a.includes('teff'))(nat('IN', NONE).absent));
ok('Ethiopia: teff and finger millet stay (Eritrea has no published figure, so teff is not offered there)', (a => !a.includes('teff') && !a.includes('fmillet'))(nat('ET', NONE).absent));
ok('Eritrea is not offered teff: no published figure was found for it', (a => a === undefined || a.includes('teff'))(NB.spotFields(NONE, { ...FAO, countries: { ...FAO.countries, ER: FAO.countries.ET } }, 'ER').absent));
ok('mung beans: not in the US or France (FAO counts them inside dry beans), allowed in India', nat('US').absent.includes('mung') && nat('FR', NONE).absent.includes('mung') && !nat('IN', NONE).absent.includes('mung'));
ok('alfalfa has no FAO item: never judged by country', ['US', 'FR', 'IN'].every(cc => !nat(cc).absent.includes('alfalfa')));
ok('every crop the list leaves out is a real judged field crop', nat('FR').absent.every(id => isCrop(id) && NB.judgedIds().includes(id)));
{ // what is left out is the map's alone; the national list only names, as the last step of a relaxing, the crops the map does not see but the country grows (js/engine.js)
  const { relax: withList, ...a } = NB.spotFields(MAP, FAO, 'US'), { relax: mapOnly, ...b } = NB.spotFields(MAP);
  same('a map that reads the place wins: the national list is not used', a, b);
  same('a map that reads the place: the relaxing steps are the map\'s own, then the country\'s list', withList.filter(t => t.step !== 'country'), mapOnly);
  ok('a map that reads the place: the country step holds only crops the map calls absent', withList.filter(t => t.step === 'country').every(t => Object.keys(t.crops).every(id => a.absent.includes(id))));
}
same('no FAOSTAT answer, a country FAO does not list, or a failed FAOSTAT answer: the gate stays open, as before', [NB.spotFields(NONE, null, 'US').absent, NB.spotFields(NONE, FAO, 'XX').absent, NB.spotFields(NONE, { ok: false }, 'US').absent], [undefined, undefined, undefined]);
same('a country row with almost nothing in it is a gap in FAO\'s file, not a country that grows nothing: the gate stays open and says nearby crops could not be checked', [NB.spotFields(NONE, FAO, 'ZZ').absent, /nearby crops could not be checked/.test(NB.spotFields(NONE, FAO, 'ZZ').nearby.gap)], [undefined, true]);
ok('the left-out line says what it means: not offered, the country does not report growing them', /^Not offered here: United States of America does not report growing \d+ field crops on 1,000 ha or more for harvest/.test(nat('US').nearby.left), nat('US').nearby.left);
const WATER = { ...MAP, pin: { code: 111, name: 'Open Water' } };
same('a pin on water still gets no plans, whatever the national list says', [NB.spotFields(WATER, FAO, 'US').water, NB.spotFields(WATER, FAO, 'US').absent], [true, undefined]);
same('the country is read from the map answer when it has one (US), else from the place', [NB.spotFields(SMALL, FAO, 'FR').absent, NB.spotFields({ ...NONE }, FAO, 'FR').absent].map(a => a.includes('pigeonpea')), [true, true]);
ok('no percent sign and no chance words in the lines', !/%|likely|probab|chance|forecast/i.test(`${nat('US').nearby.line} ${nat('US').nearby.left}`));

// ---- where the map reads the place: its own class keeps a crop, a wide class is no proof, the country's list decides the rest
const own = (crop, ha) => ({ crop, share: ha / 40000, ha }), WIDE = [{ crops: ['*'], share: 0.04, ha: 1600, name: 'Other Crops' }, { crops: ['fmillet', 'pmillet', 'oats', 'barley', 'rye'], share: 0.02, ha: 800, name: 'Other Small Grains' }];
const READ = { ...MAP, crops: [own('corn', 12000), own('soy', 12000), own('wheat', 4000), own('oats', 600), own('sorghum', 300)], wider: WIDE, classes: [] };
const both = NB.spotFields(READ, FAO, 'US'), mapOnly = NB.spotFields(READ);
ok('the map reads: a crop only a wide class could hold (finger millet, pigeon peas, teff, mung beans) is left out by the country\'s list', ['fmillet', 'pigeonpea', 'teff'].every(id => both.absent.includes(id)) && !mapOnly.absent.includes('fmillet'), both.absent.join());
ok('the map reads: crops the map names by their own class stay, whatever the list says (corn, soybeans, wheat, oats, sorghum)', ['corn', 'soy', 'wheat', 'oats', 'sorghum'].every(id => !both.absent.includes(id)));
ok('the map reads: the map\'s own absent crops stay absent and nothing it called present is removed', mapOnly.absent.every(id => both.absent.includes(id)) && both.absent.filter(id => !mapOnly.absent.includes(id)).every(id => mapOnly.common[id] === undefined));
ok('the added line names the country and says "more"', /Not offered here: United States of America does not report growing \d+ more field crops/.test(both.nearby.left) && both.nearby.source === 'cdl', both.nearby.left);
// a crop the map names by its own class beats the country list: a US place whose map shows 400 ha of triangle triticale keeps it though FAO shows none in the whole country
const OWN = NB.spotFields({ ...READ, crops: [...READ.crops, own('triticale', 400)] }, FAO, 'US');
ok('a class of its own at 250 ha or more keeps the crop even where FAO lists none (triticale)', !OWN.absent.includes('triticale') && NB.spotFields(READ, FAO, 'US').absent.includes('triticale'));
same('no FAOSTAT answer: the map\'s answer is exactly what it was', NB.spotFields(READ, null, 'US'), NB.spotFields(READ));
same('a thin country row (open list): the map\'s answer is exactly what it was', NB.spotFields({ ...READ, country: 'US' }, { ...FAO, countries: { US: FAO.countries.ZZ } }, 'US'), NB.spotFields(READ));

// ---- what the page asks: the map first, FAOSTAT only when the map says nothing
{
  const asked = [], reply = body => ({ json: async () => body });
  const get = answers => async url => { asked.push(url.split('?')[0]); return reply(url.includes('cropsnear') ? answers.map : FAO); };
  const place = { lat: 38.99, lon: -76.9, label: 'Beltsville, Maryland, United States', cc: 'US' };
  let near = await loadNearby(place, get({ map: MAP }));
  same('the map reads the place: both are asked side by side, the map\'s line stands', [asked.splice(0).sort(), near.nearby.source], [['/api/cropsnear', '/api/faostat'], 'cdl']);
  near = await loadNearby(place, get({ map: SMALL }));
  same('the map says too little: the national list is used', [asked.splice(0).sort(), near.nearby.source, near.absent.includes('pigeonpea')], [['/api/cropsnear', '/api/faostat'], 'fao', true]);
  near = await loadNearby(place, async url => { asked.length = 0; if (url.includes('cropsnear')) throw new Error('down'); return reply(FAO); });
  same('the map is down: FAOSTAT still gives a list', [near.nearby.source, near.absent.includes('pigeonpea')], ['fao', true]);
  near = await loadNearby(place, async () => { throw new Error('down'); });
  ok('both down: the gate stays open and says so', near.absent === undefined && /could not be read/.test(near.nearby.gap));
  near = await loadNearby(place, async url => url.includes('cropsnear') ? reply(SMALL) : new Promise(() => {}), 40);
  ok('FAOSTAT never answers: given up on, the gate stays open', near.absent === undefined);
  // the report's loader keeps the crop map's answer and hands it in: the national lists are still asked, with the same result as loadNearby
  near = await nearbyFrom(Promise.resolve(SMALL), place, get({ map: SMALL }));
  same('a kept map answer: only the national list is asked, and it is used', [asked.splice(0), near.nearby.source, near.absent.includes('pigeonpea')], [['/api/faostat'], 'fao', true]);
  same('a kept map answer gives what loadNearby gives', near, await loadNearby(place, get({ map: SMALL })));
  asked.length = 0;
}

const src = fs.readFileSync(path.join(HERE, '..', 'js', 'nearby.js'), 'utf8');
same('js/nearby.js touches no page, network, clock or chance', /Date\.now|new Date\(|fetch\(|document\.|window\.|localStorage|Math\.random/.test(src), false);
same('no tool names or process words in the new lines', flagged(src).length, 0);
console.log(`countrygate: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
