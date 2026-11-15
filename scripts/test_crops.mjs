// The suite for js/crops.js (the crop table), js/pics.js (the pictures) and the crop-side words of the one vocabulary.
// It pins the table: the counts, every id, every value of every crop (written out here a second time, so that a slip in the
// table shows), every special limit, every ready rotation, and the facts that keep a wrong crop out of a wrong place.
// It needs no internet and writes nothing. Run: node scripts/test_crops.mjs
/*
 * RULE: never loosen a test here to make it pass without a written farming reason in the test itself.
 * A failure means a farmer would be shown a crop that cannot grow, or a real crop would be hidden: fix the table, not the test.
 */
import fs from 'node:fs';
import * as T from '../js/crops.js';
import * as P from '../js/pics.js';
import * as BASE from '../js/words.js';

const { CROPS, GARDENS, PRESETS, BUD_COLD_F, WHAT_IT_DOES, TEST_PH, TEST_SAL } = T;
const MORE = await import('../js/words.additions.js').catch(() => ({}));   // the crop-side words, while they are kept apart from js/words.js
const W = { ...BASE, ...MORE };
const { own } = BASE;

// ---- the counting
let passed = 0, failed = 0;
const skipped = [];   // a check that could not run is printed above the last line, never passed over in silence
const show = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 200 ? s.slice(0, 200) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${show(got)}, wanted ${show(want)}`);
function group(name, run) { try { run(); } catch (e) { check(`${name}: ran to its end`, false, e?.message || String(e)); } }   // a check that throws fails its group, never the whole run
const words = list => list.split(' ').filter(Boolean);
const num = v => typeof v === 'number' && Number.isFinite(v);
const within = (v, low, high) => num(v) && v >= low && v <= high;
const share = v => within(v, 0, 1);   // a 0-1 scale
const picked = (table, field, keep = v => v !== undefined && v !== false) => Object.fromEntries(Object.entries(table).filter(([, e]) => keep(e[field])).map(([id, e]) => [id, e[field]]));
const sorted = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a < b ? -1 : 1));
const flags = list => Object.fromEntries(words(list).map(id => [id, true]));
const text = name => fs.readFileSync(new URL(`../js/${name}`, import.meta.url), 'utf8');
const CROPS_JS = text('crops.js'), PICS_JS = text('pics.js');
const WORDS_JS = fs.existsSync(new URL('../js/words.additions.js', import.meta.url)) ? text('words.additions.js') : text('words.js');
const block = (start, end = '\n};') => { const i = CROPS_JS.indexOf(start); if (i < 0) throw new Error(`"${start}" is not in crops.js`); const j = CROPS_JS.indexOf(end, i); return CROPS_JS.slice(i + start.length, j).split('\n').filter(line => line.trim()); };

// ---- the ids, every value, the special limits and the rotations, written out a second time so that a slip in the table shows
const FIELD_IDS = words('corn wheat barley sorghum swheat oats rye rice pmillet fmillet proso teff quinoa soy chickpea lentil pea bean faba cowpea groundnut pigeonpea mung sunflower canola scanola sesame safflower flax cotton potato sweetpotato cassava yam sugarbeet tomato onion cabbage watermelon pepper tobacco alfalfa ley ryecover vetchmix radish sunnhemp clover mustard carrot garlic lettuce cucumber eggplant okra pumpkin sweetcorn spinach greenbean melon cauliflower hemp jute buckwheat triticale durum lupin taro bambara mustardseed fallow');
const GARDEN_IDS = words('tea hazelnut coffee robusta cocoa oilpalm rubber banana citrus olive grape apple stonefruit almond walnut pistachio cashew coconut mango datepalm avocado sugarcane pineapple strawberry blueberry raspberry kiwi fig pomegranate pecan macadamia chestnut blackpepper cardamom vanilla cinnamon hops sisal papaya guava lychee passionfruit asparagus trees');
const FIELD_LIMITS = {
  minSeason: { corn: 13.3, barley: 3.3, sorghum: 19, rice: 18, soy: 15.3, chickpea: 10.3, lentil: 9.5, sunflower: 14, scanola: 12, cotton: 21 },
  maxCool: { wheat: 22, barley: 20.5, swheat: 22, oats: 20, rye: 20, canola: 20, scanola: 20, triticale: 22, durum: 22 },
  maxCoolHumid: { wheat: 19, barley: 19, swheat: 19, oats: 19, rye: 19, canola: 19, scanola: 19, triticale: 19, durum: 19 },   // the nine cool-season grains and canolas: rust and leaf blight fail them in the wet tropics (Tabasco, Veracruz, Belize)
  minCool: { cassava: 16 },
  minHot: { wheat: 14, barley: 11, swheat: 12, oats: 10, sunflower: 18, canola: 14, scanola: 14 },
  mildAutumn: 'barley swheat oats chickpea lentil faba potato durum mustardseed',
  minRatio: { swheat: 0.52 },
  maxAlt: { pmillet: 1600, cotton: 1500, cassava: 1800 },
  needDry: { cotton: 2 },
  heatMargin: { cotton: 7 },
  scl: 'soy chickpea lentil pea bean faba sunflower canola scanola safflower greenbean lupin mustardseed',
  legumeMix: 'ley',
  ffd: { corn: 125, sorghum: 125, pmillet: 90, fmillet: 100, soy: 115, bean: 100, cowpea: 90, groundnut: 140, pigeonpea: 150, mung: 75, sunflower: 105, sesame: 120, cotton: 175, sweetpotato: 120, cassava: 300, yam: 270, tomato: 110, watermelon: 100, pepper: 110, tobacco: 100, sunnhemp: 75, cucumber: 90, eggplant: 110, okra: 100, pumpkin: 100, sweetcorn: 90, greenbean: 70, melon: 100, buckwheat: 80, proso: 90 },
  maxGs: { quinoa: 500, chickpea: 420, lentil: 420, sesame: 700, safflower: 400 },
  // What hardened winter wheat survives through its winter rest, and the snow that shelters it: OMAFRA Field Crop News, "Winter Survival".
  // Only a crop with a published figure has one; the other winter crops say in the report that their winter cold is not checked.
  winterKill: { wheat: -24 }, winterSnow: { wheat: 7.5 }, winterBy: { wheat: 'OMAFRA' },
  minRain: { rice: 1000, proso: 200, cassava: 500, yam: 800, jute: 1000, taro: 1000 },
  major: 'corn wheat barley sorghum swheat oats rice pmillet soy chickpea lentil pea bean cowpea groundnut pigeonpea sunflower canola scanola sesame cotton potato cassava durum',
  tropicFalse: 'wheat oats rye chickpea lentil faba canola scanola safflower flax potato sugarbeet tomato onion cabbage watermelon pepper alfalfa ley ryecover vetchmix radish clover mustard carrot garlic lettuce spinach melon cauliflower buckwheat triticale durum lupin mustardseed',
};
const GARDEN_LIMITS = {
  summer: { tea: 15.5, coffee: 17.5, robusta: 19, cocoa: 18, oilpalm: 22, rubber: 22, banana: 19, citrus: 23, olive: 21, grape: 19.5, apple: 15, almond: 21, walnut: 18.5, pistachio: 25, cashew: 21, coconut: 19, mango: 23, datepalm: 28, avocado: 20.5, sugarcane: 23, pineapple: 21, kiwi: 17, pomegranate: 19, pecan: 27.5, macadamia: 21, blackpepper: 17, cardamom: 19, vanilla: 18, cinnamon: 21, hops: 17, papaya: 18, guava: 21, lychee: 22, passionfruit: 21 },
  summerMild: { citrus: 20 },
  maxSummer: { tea: 30, hazelnut: 26, coffee: 25, olive: 33, apple: 28.2, almond: 32, walnut: 28, pistachio: 34, blueberry: 29, raspberry: 27, kiwi: 31, pecan: 32, hops: 27 },
  msTol: { tea: 0.4, olive: 1.5, apple: 0.9, pistachio: 1 },
  // Cocoa's coolest month: two figures are on record, "about 20 °C" (with coconuts and oil palm) and 18 °C. A cocoa farm stays
  // for 25 years, so a wrong "fits" costs far more than a missed option: the stricter 20 °C is pinned until the owner settles it.
  minMonth: { coffee: 12.5, robusta: 18, cocoa: 20, oilpalm: 20, rubber: 18, banana: 13, cashew: 17, coconut: 20, mango: 12, avocado: 7, sugarcane: 9, pineapple: 15, macadamia: 12, blackpepper: 18, cardamom: 14, vanilla: 18, cinnamon: 18, sisal: 14, papaya: 14, guava: 12, lychee: 10, passionfruit: 12 },
  minNight: { robusta: 9, cocoa: 12, oilpalm: 12, rubber: 8, cashew: 10, coconut: 12, pineapple: 3, blackpepper: 11, vanilla: 12, cinnamon: 10, papaya: 3 },
  needCool: { olive: 16, grape: 22, almond: 14, asparagus: 16 },
  maxDryMonths: { tea: 4, robusta: 5, cocoa: 4, oilpalm: 3, rubber: 5, coconut: 6, blueberry: 2, blackpepper: 5, cardamom: 4, vanilla: 4, cinnamon: 5 },
  minDry: { mango: 3 },
  dryA: { robusta: 4, cocoa: 4, oilpalm: 4, rubber: 4 },
  dryB: { robusta: 6, cocoa: 6, oilpalm: 6, rubber: 7 },
  dryS: { olive: 105 },
  wetMult: { coffee: 2.2, olive: 2, grape: 2.8, walnut: 0.8, mango: 99, pomegranate: 1.45 },
  maxAlt: { robusta: 1000, cocoa: 1000, oilpalm: 600, rubber: 800, cashew: 1000, coconut: 450, mango: 1500, sugarcane: 1800, macadamia: 1800, blackpepper: 1000, vanilla: 1000, cinnamon: 1000, papaya: 1800, guava: 2000 },
  warm: { macadamia: 10, blackpepper: 10, cardamom: 10, vanilla: 10, cinnamon: 18, sisal: 10, papaya: 12, guava: 10, lychee: 15 },
  chillSoft: 'grape',
  chillHard: 'apple',
  protectable: 'grape',
  budCold: { grape: ['grape'], apple: ['apple', 'pear'], stonefruit: ['peach', 'apricot', 'sweetcherry'] },
  chill: { hazelnut: [290, 1550], grape: [136, 392], apple: [800, 1500], stonefruit: [650, 1300], almond: [100, 350], walnut: [600, 1000], pistachio: [750, 1000], blueberry: [150, 1000], raspberry: [200, 1400], kiwi: [600, 1100], pecan: [200, 500], chestnut: [400, 500], hops: [720, 1440] },
  kill: { tea: 0, hazelnut: -3, citrus: 0, olive: 0, grape: -1.2, apple: -2.2, stonefruit: -2.2, almond: -2.2, walnut: -1.1, pistachio: -1, mango: -1.1, datepalm: -6, avocado: -1.1, sugarcane: 0, strawberry: -1.1, blueberry: -2.2, raspberry: -1, kiwi: -1, fig: -1, pomegranate: -2.2, pecan: -2.2, macadamia: -2, chestnut: -1, hops: -2, sisal: -5, guava: -2, lychee: -2, passionfruit: -1, asparagus: -2.2 },
  winterKill: { tea: -12, hazelnut: -15, citrus: -9, olive: -12, grape: -23, apple: -35, stonefruit: -24, almond: -9, walnut: -24, pistachio: -13, mango: -4, datepalm: -7, avocado: -3, sugarcane: -10, blueberry: -32, raspberry: -35, kiwi: -10, fig: -9, pomegranate: -11, pecan: -20, macadamia: -4, chestnut: -29, hops: -29, sisal: -5, guava: -4, lychee: -4, passionfruit: -2 },
  heatSevere: { tea: 35, citrus: 39, olive: 35, pineapple: 35, blueberry: 40, blackpepper: 40, cardamom: 35, cinnamon: 36, sisal: 45, lychee: 40 },
  dry: 'coffee robusta olive grape almond walnut pistachio cashew mango datepalm sugarcane pomegranate vanilla lychee',
  noFrost: 'coffee robusta cocoa oilpalm rubber banana cashew coconut pineapple blackpepper cardamom vanilla cinnamon papaya',
  steep: 'tea hazelnut coffee rubber olive grape apple stonefruit cashew avocado macadamia chestnut blackpepper cardamom',
  irrigated: 'citrus datepalm',
  humid: 'tea robusta cocoa oilpalm rubber coconut blackpepper cardamom vanilla cinnamon',
  wb: { tea: 'Tea, avg 3 auctions', coffee: 'Coffee, Arabica', robusta: 'Coffee, Robusta', cocoa: 'Cocoa', oilpalm: 'Palm oil', rubber: 'Rubber, TSR20 **', banana: 'Banana, US', citrus: 'Orange', coconut: 'Coconut oil', sugarcane: 'Sugar, world' },
};
const ROTATIONS = [   // id, the name shown, one crop per year, the zone that only orders the list
  ['corn-soy', 'Corn → Soybeans', 'corn soy', 'any'],
  ['corn-corn', 'Corn on corn', 'corn', 'any'],
  ['soy-soy', 'Soybeans every year', 'soy', 'any'],
  ['wheat-fallow', 'Wheat → Fallow', 'wheat fallow', 'dry'],
  ['wheat-wheat', 'Wheat on wheat', 'wheat', 'temperate'],
  ['wheat-barley', 'Wheat → Barley', 'wheat barley', 'temperate'],
  ['cotton-wheat', 'Cotton → Wheat', 'cotton wheat', 'warm'],
  ['corn-soy-wheat', 'Corn → Soybeans → Wheat', 'corn soy wheat', 'temperate'],
  ['sunflower-wheat', 'Sunflowers → Wheat', 'sunflower wheat', 'temperate'],
  ['corn-bean', 'Corn → Dry beans', 'corn bean', 'highland'],
  ['potato-wheat', 'Potatoes → Wheat', 'potato wheat', 'temperate'],
  ['wheat-chickpea', 'Wheat → Chickpeas', 'wheat chickpea', 'warm'],
  ['millet-cowpea', 'Pearl millet → Cowpeas', 'pmillet cowpea', 'tropic-dry'],
  ['sorghum-groundnut', 'Sorghum → Peanuts', 'sorghum groundnut', 'tropic-dry'],
  ['cassava-corn', 'Cassava → Corn', 'cassava corn', 'tropic-wet'],
  ['rice-rice', 'Rice every year', 'rice', 'tropic-wet'],
  ['teff-faba', 'Teff → Faba beans', 'teff faba', 'highland'],
  ['cotton-corn', 'Cotton → Corn', 'cotton corn', 'warm'],
  ['tobacco-corn', 'Tobacco → Corn', 'tobacco corn', 'tropic-dry'],
  ['sugarbeet-wheat', 'Sugar beets → Wheat', 'sugarbeet wheat', 'temperate'],
  ['canola-wheat', 'Canola → Wheat', 'canola wheat', 'temperate'],
  ['scanola-swheat', 'Spring canola → Spring wheat', 'scanola swheat', 'temperate'],
  ['wheat-lentil', 'Wheat → Lentils', 'wheat lentil', 'dry'],
  ['custom', 'Build my own', '', ''],
];
// Every value of the 71 field entries (null: fallow grows nothing, so it has no season length and no temperature range).
const FIELD_ROWS = {   // name, type, group, family, water mm, days, root m, nfix, om, cover, resid, drought, heat °C, frost, minT °C, tMin, tOpt, tMax, income, forage, sow, harv, colour
  corn: ['Corn (maize)', 'cash', 'grain', 'grass', 650, 150, 1.7, 0, 0.9, 0.55, 0.55, 0.3, 32, 0.1, 14, 10, [18, 33], 47, 0.7, 0.4, 4, 10, '#f5b83d'],
  wheat: ['Winter wheat', 'cash', 'grain', 'grass', 550, 270, 1.8, 0, 0.7, 0.7, 0.45, 0.55, 30, 0.85, 3, 5, [15, 23], 27, 0.5, 0.3, 10, 7, '#d9a441'],
  barley: ['Spring barley', 'cash', 'grain', 'grass', 450, 110, 1.5, 0, 0.6, 0.6, 0.4, 0.65, 30, 0.55, 5, 2, [15, 20], 40, 0.42, 0.55, 3, 7, '#c9a95c'],
  sorghum: ['Sorghum (milo)', 'cash', 'grain', 'grass', 550, 125, 2, 0, 0.8, 0.6, 0.55, 0.85, 38, 0, 17, 8, [22, 35], 40, 0.46, 0.7, 5, 10, '#c0763a'],
  swheat: ['Spring wheat', 'cash', 'grain', 'grass', 500, 125, 1.5, 0, 0.65, 0.65, 0.45, 0.5, 30, 0.5, 5, 5, [15, 23], 27, 0.48, 0.3, 4, 8, '#e2c06a'],
  oats: ['Oats', 'cash', 'grain', 'grass', 500, 115, 1.5, 0, 0.6, 0.65, 0.45, 0.45, 28, 0.45, 5, 5, [16, 20], 30, 0.38, 0.5, 4, 8, '#d9cf9a'],
  rye: ['Rye (grain)', 'cash', 'grain', 'grass', 500, 290, 1.6, 0, 0.75, 0.75, 0.55, 0.65, 29, 0.95, 2, 3, [15, 20], 31, 0.36, 0.4, 9, 7, '#b9a37a'],
  rice: ['Rice (paddy)', 'cash', 'grain', 'grass', 1100, 135, 0.6, 0, 0.6, 0.6, 0.4, 0.1, 35, 0, 16, 10, [20, 30], 36, 0.6, 0.3, 5, 9, '#e0c870'],
  pmillet: ['Pearl millet', 'cash', 'grain', 'grass', 450, 95, 2, 0, 0.7, 0.5, 0.45, 0.95, 40, 0, 18, 12, [25, 35], 40, 0.35, 0.5, 6, 9, '#b8a46e'],
  fmillet: ['Finger millet', 'cash', 'grain', 'grass', 400, 120, 1, 0, 0.5, 0.55, 0.35, 0.7, 34, 0.05, 14, 8, [18, 30], 35, 0.4, 0.4, 5, 9, '#a5714a'],
  proso: ['Proso millet', 'cash', 'grain', 'grass', 650, 140, 1, 0, 0.5, 0.55, 0.35, 0.85, 32, 0, 15, 15, [20, 32], 45, 0.35, 0.5, 4, 8, '#cdb27a'],
  teff: ['Teff', 'cash', 'grain', 'grass', 350, 110, 0.6, 0, 0.45, 0.6, 0.3, 0.6, 32, 0.05, 12, 2, [22, 28], 30, 0.6, 0.4, 6, 9, '#c9a57a'],
  quinoa: ['Quinoa', 'cash', 'grain', 'chenopod', 400, 150, 1.5, 0, 0.4, 0.45, 0.25, 0.8, 30, 0.55, 6, 2, [14, 18], 35, 0.7, 0.1, 4, 8, '#d9784a'],
  soy: ['Soybeans', 'cash', 'legume', 'legume', 575, 140, 1.3, 0.3, 0.4, 0.45, 0.2, 0.5, 33, 0.1, 14, 10, [20, 33], 38, 0.65, 0.2, 5, 10, '#8bc34a'],
  chickpea: ['Chickpeas', 'cash', 'legume', 'legume', 350, 120, 1, 0.23, 0.35, 0.35, 0.2, 0.8, 33, 0.4, 8, 7, [15, 29], 35, 0.76, 0.1, 3, 7, '#b5c26b'],
  lentil: ['Lentils', 'cash', 'legume', 'legume', 300, 120, 0.8, 0.3, 0.3, 0.3, 0.15, 0.75, 30, 0.45, 6, 5, [15, 29], 32, 0.78, 0.15, 3, 7, '#a39a4a'],
  pea: ['Field peas', 'cash', 'legume', 'legume', 425, 100, 1, 0.37, 0.35, 0.4, 0.2, 0.45, 28, 0.55, 5, 4, [10, 24], 30, 0.5, 0.4, 3, 7, '#7fbf6a'],
  bean: ['Dry beans', 'cash', 'legume', 'legume', 400, 105, 0.9, 0.13, 0.3, 0.4, 0.15, 0.3, 30, 0.05, 13, 7, [16, 25], 32, 0.62, 0.1, 5, 9, '#b5543a'],
  faba: ['Faba beans', 'cash', 'legume', 'legume', 450, 120, 0.7, 0.5, 0.45, 0.5, 0.25, 0.3, 28, 0.5, 5, 5, [18, 28], 32, 0.55, 0.3, 3, 8, '#5f9a45'],
  cowpea: ['Cowpeas', 'cash', 'legume', 'legume', 375, 100, 1, 0.27, 0.35, 0.6, 0.2, 0.85, 38, 0, 18, 15, [25, 35], 40, 0.5, 0.35, 5, 8, '#9aa85a'],
  groundnut: ['Peanuts (groundnuts)', 'cash', 'legume', 'legume', 600, 130, 1, 0.37, 0.25, 0.55, 0.1, 0.75, 34, 0, 16, 10, [22, 32], 45, 0.65, 0.3, 5, 10, '#d9b27a'],
  pigeonpea: ['Pigeon peas', 'cash', 'legume', 'legume', 650, 180, 2, 0.33, 0.6, 0.55, 0.35, 0.85, 37, 0.05, 16, 10, [18, 38], 45, 0.55, 0.3, 6, 12, '#7a8a3a'],
  mung: ['Mung beans', 'cash', 'legume', 'legume', 300, 75, 1, 0.17, 0.25, 0.5, 0.15, 0.6, 36, 0, 15, 8, [21, 36], 40, 0.6, 0.2, 6, 8, '#4f8f3a'],
  sunflower: ['Sunflowers', 'cash', 'oil', 'composite', 800, 130, 1.5, 0, 0.6, 0.5, 0.35, 0.7, 35, 0.2, 11, 5, [17, 34], 45, 0.58, 0.1, 4, 9, '#ffd23f'],
  canola: ['Canola (rapeseed)', 'cash', 'oil', 'brassica', 450, 300, 1.5, 0, 0.5, 0.55, 0.3, 0.45, 29, 0.7, 4, 5, [15, 25], 41, 0.6, 0.2, 9, 7, '#e6d84c'],
  scanola: ['Spring canola', 'cash', 'oil', 'brassica', 450, 110, 1.5, 0, 0.5, 0.55, 0.3, 0.45, 29, 0.5, 4, 5, [15, 25], 41, 0.6, 0.2, 5, 9, '#e6d84c'],
  sesame: ['Sesame', 'cash', 'oil', 'sesame', 450, 100, 1.5, 0, 0.35, 0.4, 0.2, 0.8, 38, 0, 18, 10, [20, 30], 40, 0.65, 0.05, 6, 9, '#e9e1cf'],
  safflower: ['Safflower', 'cash', 'oil', 'composite', 650, 140, 2, 0, 0.45, 0.45, 0.3, 0.85, 34, 0.45, 7, 5, [20, 32], 45, 0.45, 0.1, 4, 8, '#f08a24'],
  flax: ['Flax (linseed)', 'cash', 'oil', 'flax', 400, 120, 1.2, 0, 0.35, 0.4, 0.3, 0.5, 30, 0.35, 6, 5, [16, 24], 30, 0.5, 0.1, 4, 8, '#6a8fe0'],
  cotton: ['Cotton', 'cash', 'fibre', 'mallow', 1000, 180, 1.7, 0, 0.5, 0.35, 0.15, 0.65, 36, 0, 18, 15, [22, 36], 42, 0.62, 0, 4, 10, '#e8e2d0'],
  potato: ['Potatoes', 'cash', 'root', 'nightshade', 600, 130, 0.6, 0, 0.3, 0.6, 0.1, 0.25, 28, 0.15, 10, 7, [15, 25], 30, 0.75, 0.1, 4, 9, '#c8a165'],
  sweetpotato: ['Sweet potatoes', 'cash', 'root', 'morning-glory', 500, 135, 1.5, 0, 0.25, 0.7, 0.1, 0.6, 34, 0, 16, 10, [18, 28], 38, 0.65, 0.3, 5, 9, '#c45a6a'],
  cassava: ['Cassava', 'cash', 'root', 'euphorbia', 1000, 300, 1, 0, 0.35, 0.5, 0.15, 0.85, 36, 0, 18, 10, [20, 29], 35, 0.55, 0.2, 4, 2, '#9a6a3a'],
  yam: ['Yams', 'cash', 'root', 'yam', 1000, 240, 0.8, 0, 0.25, 0.45, 0.1, 0.4, 35, 0, 20, 15, [25, 32], 38, 0.7, 0.1, 3, 11, '#8a6a48'],
  sugarbeet: ['Sugar beets', 'cash', 'sugar', 'chenopod', 650, 180, 1.2, 0, 0.4, 0.6, 0.15, 0.5, 30, 0.3, 6, 4, [15, 25], 35, 0.7, 0.3, 3, 10, '#efe6cf'],
  tomato: ['Tomatoes', 'cash', 'veg', 'nightshade', 600, 145, 1.5, 0, 0.25, 0.45, 0.15, 0.35, 32, 0, 14, 7, [20, 27], 35, 0.9, 0.05, 5, 9, '#e5533d'],
  onion: ['Onions', 'cash', 'veg', 'allium', 450, 150, 0.6, 0, 0.1, 0.25, 0.05, 0.25, 30, 0.55, 6, 4, [12, 25], 30, 0.85, 0, 3, 8, '#c9845a'],
  cabbage: ['Cabbage', 'cash', 'veg', 'brassica', 425, 130, 0.8, 0, 0.3, 0.55, 0.15, 0.35, 28, 0.65, 6, 7, [15, 24], 32, 0.75, 0.2, 4, 8, '#8fc46a'],
  watermelon: ['Watermelons', 'cash', 'veg', 'cucurbit', 500, 100, 1.5, 0, 0.2, 0.45, 0.1, 0.45, 35, 0, 18, 15, [20, 35], 40, 0.75, 0.05, 5, 8, '#3f8f3a'],
  pepper: ['Peppers', 'cash', 'veg', 'nightshade', 750, 125, 1, 0, 0.2, 0.4, 0.1, 0.3, 32, 0, 15, 8, [17, 30], 35, 0.88, 0, 5, 9, '#d9362a'],
  tobacco: ['Tobacco', 'cash', 'other', 'nightshade', 500, 130, 0.8, 0, 0.2, 0.4, 0.1, 0.45, 32, 0.05, 14, 7, [15, 30], 35, 0.8, 0, 5, 9, '#8aa84a'],
  alfalfa: ['Alfalfa hay', 'forage', 'forage', 'legume', 1000, 200, 2, 0.5, 0.85, 0.95, 0.9, 0.65, 35, 0.8, 6, 5, [21, 27], 45, 0.6, 1, 4, 10, '#2e9d57'],
  ley: ['Grass hay (grass-clover ley)', 'forage', 'forage', 'grass', 750, 210, 1, 0.5, 0.9, 0.95, 0.9, 0.4, 28, 0.85, 5, 4, [14, 25], 35, 0.4, 0.95, 4, 10, '#6fbf5f'],
  ryecover: ['Cereal rye cover', 'cover', 'cover', 'grass', 130, 200, 1.3, 0, 0.8, 0.9, 0.7, 0.7, 30, 1, 1, 3, [15, 20], 31, -0.05, 0.5, 10, 4, '#4f8a5b'],
  vetchmix: ['Vetch + rye cover', 'cover', 'cover', 'legume', 140, 210, 1, 0.3, 0.75, 0.9, 0.6, 0.55, 30, 0.7, 4, 2, [12, 22], 28, -0.07, 0.4, 9, 4, '#3f9e7a'],
  radish: ['Radish cover mix', 'cover', 'cover', 'brassica', 90, 75, 1.5, 0, 0.5, 0.75, 0.3, 0.5, 30, 0.4, 6, 10, [12, 26], 37, -0.05, 0.3, 8, 11, '#6bb38a'],
  sunnhemp: ['Sunn hemp cover', 'cover', 'cover', 'legume', 300, 75, 1.2, 0.37, 0.8, 0.85, 0.6, 0.75, 38, 0, 16, 10, [20, 30], 40, -0.05, 0.4, 7, 9, '#e2b62e'],
  clover: ['Crimson clover cover', 'cover', 'cover', 'legume', 200, 210, 0.9, 0.37, 0.6, 0.85, 0.5, 0.4, 28, 0.6, 4, 4, [13, 22], 28, -0.06, 0.5, 9, 4, '#d6455a'],
  mustard: ['Mustard cover', 'cover', 'cover', 'brassica', 150, 75, 1, 0, 0.5, 0.75, 0.3, 0.5, 30, 0.3, 5, 7, [15, 28], 40, -0.04, 0.2, 8, 11, '#e8d040'],
  carrot: ['Carrots', 'cash', 'veg', 'carrot', 400, 125, 1, 0, 0.15, 0.45, 0.05, 0.35, 30, 0.45, 7, 3, [15, 24], 30, 0.8, 0.1, 4, 8, '#ef8a2e'],
  garlic: ['Garlic', 'cash', 'veg', 'allium', 470, 240, 0.5, 0, 0.1, 0.2, 0.05, 0.25, 30, 0.8, 7, 7, [18, 30], 35, 0.9, 0, 10, 7, '#e9dccb'],
  lettuce: ['Lettuce', 'cash', 'veg', 'composite', 310, 105, 0.5, 0, 0.15, 0.45, 0.1, 0.15, 28, 0.4, 7, 5, [12, 21], 30, 0.85, 0.05, 4, 6, '#9ccc65'],
  cucumber: ['Cucumbers', 'cash', 'veg', 'cucurbit', 500, 115, 1.2, 0, 0.2, 0.5, 0.1, 0.3, 32, 0, 16, 6, [18, 32], 38, 0.8, 0, 5, 8, '#4f9a3a'],
  eggplant: ['Eggplants (brinjal)', 'cash', 'veg', 'nightshade', 600, 135, 1.2, 0, 0.25, 0.4, 0.15, 0.35, 35, 0, 18, 9, [20, 35], 40, 0.8, 0, 5, 9, '#6a3a8a'],
  okra: ['Okra', 'cash', 'veg', 'mallow', 400, 110, 1, 0, 0.35, 0.45, 0.3, 0.5, 38, 0, 18, 12, [20, 30], 35, 0.7, 0.05, 5, 9, '#7fae4a'],
  pumpkin: ['Pumpkins and squash', 'cash', 'veg', 'cucurbit', 480, 110, 1.5, 0, 0.25, 0.65, 0.15, 0.45, 32, 0.05, 10, 9, [20, 30], 38, 0.6, 0.15, 5, 9, '#e9782a'],
  sweetcorn: ['Sweet corn', 'cash', 'veg', 'grass', 550, 95, 1.2, 0, 0.7, 0.5, 0.45, 0.25, 32, 0.1, 10, 12, [16, 24], 38, 0.7, 0.4, 5, 8, '#f7d65a'],
  spinach: ['Spinach', 'cash', 'veg', 'chenopod', 320, 80, 0.5, 0, 0.1, 0.4, 0.05, 0.15, 26, 0.8, 4, 2, [13, 20], 27, 0.75, 0.05, 3, 5, '#3f8a3a'],
  greenbean: ['Green beans (snap beans)', 'cash', 'veg', 'legume', 350, 85, 0.7, 0.13, 0.25, 0.4, 0.15, 0.25, 30, 0.05, 10, 7, [16, 25], 32, 0.75, 0.1, 5, 7, '#6aae4a'],
  melon: ['Melons (cantaloupe)', 'cash', 'veg', 'cucurbit', 500, 120, 1.5, 0, 0.2, 0.5, 0.1, 0.45, 35, 0, 16, 9, [18, 30], 35, 0.75, 0.05, 5, 8, '#e2b86a'],
  cauliflower: ['Cauliflower and broccoli', 'cash', 'veg', 'brassica', 400, 135, 0.6, 0, 0.35, 0.55, 0.25, 0.3, 28, 0.6, 6, 5, [10, 25], 30, 0.8, 0.15, 4, 8, '#ece4c8'],
  hemp: ['Hemp', 'cash', 'fibre', 'hemp', 475, 120, 1.5, 0, 0.4, 0.8, 0.25, 0.5, 32, 0.35, 8, 6, [15, 28], 32, 0.55, 0.05, 5, 9, '#5f8f4a'],
  jute: ['Jute', 'cash', 'fibre', 'mallow', 550, 120, 1, 0, 0.35, 0.75, 0.15, 0.3, 38, 0, 17, 15, [22, 35], 45, 0.4, 0, 4, 8, '#a89a5a'],
  buckwheat: ['Buckwheat', 'cash', 'grain', 'buckwheat', 450, 80, 0.8, 0, 0.4, 0.75, 0.35, 0.3, 28, 0.05, 10, 7, [17, 27], 40, 0.45, 0.2, 6, 9, '#8a6a5a'],
  triticale: ['Triticale', 'cash', 'grain', 'grass', 550, 270, 1.8, 0, 0.8, 0.75, 0.55, 0.6, 30, 0.8, 3, 5, [15, 23], 27, 0.4, 0.55, 10, 7, '#c4aa6a'],
  durum: ['Durum wheat', 'cash', 'grain', 'grass', 500, 125, 1.5, 0, 0.65, 0.65, 0.45, 0.55, 30, 0.45, 5, 6, [17, 25], 30, 0.55, 0.3, 4, 8, '#e0b45a'],
  lupin: ['Lupins', 'cash', 'legume', 'legume', 400, 130, 1.5, 0.43, 0.4, 0.5, 0.25, 0.5, 30, 0.5, 5, 4, [12, 18], 26, 0.45, 0.3, 4, 8, '#6f7fd0'],
  taro: ['Taro (cocoyam)', 'cash', 'root', 'aroid', 620, 210, 0.6, 0, 0.2, 0.6, 0.1, 0.15, 35, 0, 16, 10, [21, 28], 35, 0.6, 0.1, 4, 10, '#8a7aa0'],
  bambara: ['Bambara groundnuts', 'cash', 'legume', 'legume', 500, 130, 1, 0.34, 0.25, 0.5, 0.1, 0.8, 35, 0, 18, 16, [19, 30], 38, 0.5, 0.2, 5, 9, '#b08a5a'],
  mustardseed: ['Mustard (for seed)', 'cash', 'oil', 'brassica', 400, 100, 1.5, 0, 0.5, 0.6, 0.35, 0.5, 30, 0.45, 7, 7, [15, 28], 40, 0.5, 0.1, 5, 8, '#d9c03a'],
  fallow: ['Fallow', 'fallow', 'fallow', 'none', 0, null, 0, 0, 0, 0.05, 0.05, 0, 99, 1, -99, null, null, null, 0, 0, 1, 12, '#a9856a'],
};
const SOIL_PH = {   // best low, best high, lowest it takes, highest it takes
  corn: [5.5, 7.5, 5, 8.5], wheat: [6, 7.5, 5, 8.5], barley: [6, 7.5, 5, 8.5], sorghum: [6, 7.5, 5, 8.5], swheat: [6, 7.5, 5, 8.5], oats: [5.5, 7, 4.5, 8],
  rye: [5.5, 7, 4.5, 8], rice: [5.5, 7, 4, 8.5], soy: [6, 7.5, 5, 8], chickpea: [6, 8, 5, 9], lentil: [6, 7.5, 5, 8.5], pea: [6, 7.5, 5, 8],
  bean: [6, 7, 5, 8], faba: [6, 7.5, 5, 8.5], groundnut: [5.5, 7, 4.5, 8], sunflower: [6, 7.5, 5, 8.5], canola: [6, 7.5, 5, 8.5], cotton: [6, 7.5, 5, 8.5],
  potato: [5, 6.5, 4.5, 7.5], sugarbeet: [6, 7.5, 5.5, 8.5], tomato: [5.5, 7, 5, 8], onion: [6, 7, 5.5, 8], cabbage: [6, 7.5, 5, 8.5], pepper: [5.5, 7, 5, 8],
  alfalfa: [6.5, 7.5, 5.5, 8.5], carrot: [5.5, 7, 5, 8], lettuce: [6, 7, 5.5, 8], cucumber: [5.5, 7, 5, 8], sweetcorn: [5.5, 7.5, 5, 8.5], greenbean: [6, 7, 5, 8],
  triticale: [5.5, 7.5, 4.5, 8.5], durum: [6, 8, 5, 8.5], proso: [6, 6.5, 5, 8],
};
const SOIL_SALT = {   // threshold ECe in dS/m, % of yield lost per dS/m above it
  corn: [1.7, 12], wheat: [6, 7.1], barley: [8, 5], sorghum: [6.8, 16], swheat: [6, 7.1], rye: [11.4, 10.8], rice: [3, 12], soy: [5, 20],
  bean: [1, 19], faba: [1.6, 9.6], cowpea: [4.9, 12], groundnut: [3.2, 29], canola: [11, 13], safflower: [7, 5.3], flax: [1.7, 12], cotton: [7.7, 5.2],
  potato: [1.7, 12], sweetpotato: [1.5, 11], sugarbeet: [7, 5.9], tomato: [2.5, 9.9], onion: [1.2, 16], cabbage: [1.8, 9.7], pepper: [1.5, 14], alfalfa: [2, 7.3],
  carrot: [1, 14], lettuce: [1.3, 13], cucumber: [2.5, 13], eggplant: [1.1, 6.9], sweetcorn: [1.7, 12], spinach: [2, 7.6], greenbean: [1, 19], triticale: [6.1, 2.5],
  durum: [5.9, 3.8],
};
const GARDEN_ROWS = {   // name, what its place is called, best rain mm, lowest rain, highest rain, heat °C, best pH, the pH range it takes
  tea: ['Tea', 'tea garden', [1400, 2000], 1000, 5000, 30, [4.5, 5.5], [4, 6]],
  hazelnut: ['Hazelnuts', 'hazelnut garden', [900, 1100], 600, 1800, 35, [6, 6.5], [5.5, 7.5]],
  coffee: ['Arabica coffee', 'coffee farm', [1400, 2300], 750, 4200, 30, [5.5, 7], [4.3, 8.4]],
  robusta: ['Robusta coffee', 'coffee farm', [1700, 3000], 900, 4000, 32, [5, 6.3], [4, 8]],
  cocoa: ['Cocoa', 'cocoa farm', [1200, 3000], 900, 7600, 32, [5, 6.5], [4, 8]],
  oilpalm: ['Oil palm', 'plantation', [1500, 3000], 1000, 8000, 33, [4.5, 6], [3.2, 8]],
  rubber: ['Rubber', 'rubber plantation', [2000, 4000], 1200, 6000, 34, [4.5, 6], [3.5, 8]],
  banana: ['Bananas and plantains', 'banana plantation', [1400, 2400], 1000, 5000, 38, [5.5, 6.5], [4.5, 8]],
  citrus: ['Oranges and citrus', 'orange grove', [1200, 2000], 450, 2700, 36, [5, 6], [4, 8.3]],
  olive: ['Olives', 'olive grove', [400, 1000], 200, 2200, 30, [6, 7], [5.3, 8.5]],
  grape: ['Grapes', 'vineyard', [650, 1000], 300, 2400, 35, [5.5, 7.5], [4.5, 8.5]],
  apple: ['Apples and pears', 'orchard', [700, 2500], 500, 3200, 35, [6, 7], [4.5, 8]],
  stonefruit: ['Peaches, apricots, cherries', 'orchard', [500, 1300], 300, 1600, 35, [5.5, 7], [4.5, 8]],
  almond: ['Almonds', 'orchard', [600, 900], 250, 1500, 38, [6.5, 7], [5.5, 8]],
  walnut: ['Walnuts', 'orchard', [800, 1700], 400, 2200, 38, [5.5, 6.5], [4.5, 8.3]],
  pistachio: ['Pistachios', 'orchard', [400, 700], 250, 1100, 40, [7, 8], [6, 8.5]],
  cashew: ['Cashews', 'cashew orchard', [750, 1600], 400, 4000, 36, [4.5, 6.5], [3.8, 8.7]],
  coconut: ['Coconuts', 'coconut grove', [1200, 2400], 650, 4000, 38, [5, 8], [4.3, 8.7]],
  mango: ['Mangoes', 'mango orchard', [600, 1500], 300, 4000, 40, [5.5, 7.5], [4.3, 8.5]],
  datepalm: ['Date palms', 'date palm grove', [200, 300], 100, 500, 40, [6.5, 8], [6, 8.5]],
  avocado: ['Avocados', 'avocado orchard', [500, 2000], 300, 2500, 32, [5, 7], [4.5, 8.3]],
  sugarcane: ['Sugarcane', 'cane field', [1500, 2000], 1000, 5000, 38, [5, 8], [4.5, 9]],
  pineapple: ['Pineapples', 'pineapple field', [800, 2500], 550, 3500, 32, [4.5, 6.5], [3.5, 9]],
  strawberry: ['Strawberries', 'berry field', [600, 900], 300, 1700, 30, [5.5, 6.5], [4.5, 8.2]],
  blueberry: ['Blueberries', 'berry field', [900, 1100], 700, 1300, 30, [4.5, 5.5], [3, 5.5]],
  raspberry: ['Raspberries and blackberries', 'berry field', [800, 1200], 300, 1700, 32, [5.5, 6.5], [4.5, 7.8]],
  kiwi: ['Kiwifruit', 'kiwifruit orchard', [900, 1300], 700, 1500, 35, [6, 7], [5.5, 7.5]],
  fig: ['Figs', 'fig orchard', [700, 1500], 300, 2700, 38, [6, 7], [4.3, 8.6]],
  pomegranate: ['Pomegranates', 'pomegranate orchard', [900, 1200], 400, 4200, 40, [5.5, 7], [5.5, 8.5]],
  pecan: ['Pecans', 'pecan orchard', [600, 1200], 400, 1800, 40, [5.5, 6.5], [5, 7.5]],
  macadamia: ['Macadamia', 'macadamia orchard', [1000, 3000], 700, 3500, 35, [5, 6.5], [4.5, 7]],
  chestnut: ['Chestnuts', 'chestnut grove', [900, 1300], 500, 1600, 32, [5.5, 6.5], [4, 7]],
  blackpepper: ['Black pepper', 'spice garden', [1250, 3000], 1000, 5500, 35, [4.5, 6.5], [4.5, 7.5]],
  cardamom: ['Cardamom', 'spice garden', [3000, 6000], 1500, 7000, 32, [5.5, 6], [4.8, 7]],
  vanilla: ['Vanilla', 'spice garden', [2000, 2500], 1500, 3000, 32, [5.5, 6.5], [4.3, 8]],
  cinnamon: ['Cinnamon', 'spice garden', [2000, 2600], 1200, 3000, 32, [5.5, 6.5], [5, 7]],
  hops: ['Hops', 'hop yard', [400, 700], 300, 1300, 29, [6, 7], [5, 8]],
  sisal: ['Sisal', 'sisal plantation', [900, 1250], 500, 1800, 40, [6, 7.5], [5.5, 8]],
  papaya: ['Papaya', 'papaya field', [1500, 2500], 1000, 3000, 32, [5.5, 6.7], [4.5, 8]],
  guava: ['Guava', 'guava orchard', [1000, 3000], 400, 5000, 38, [4.5, 7], [4, 8.5]],
  lychee: ['Lychee', 'lychee orchard', [1000, 1700], 700, 2800, 35, [5.5, 6.5], [5, 8.5]],
  passionfruit: ['Passion fruit', 'passion fruit field', [900, 2000], 600, 2500, 32, [6, 7], [5.5, 8.5]],
  asparagus: ['Asparagus', 'asparagus field', [800, 1200], 500, 4000, 29, [6.5, 7.5], [6, 8.2]],
  trees: ['Other trees or bushes', 'orchard', null, null, null, null, null, null],
};
const GARDEN_TEXTS = {   // how long it stays, the rain it likes, its soil, the part frost hurts, the sources: word for word
  tea: ['Tea bushes are picked for many decades.', 'Tea likes plenty of rain all through the year.',
    'Tea likes acid soil, about pH 4.5 to 5.5.', 'new shoots (the flush) and young leaves', 'FAO ECOCROP database; De Costa, Mohotti & Wijeratne 2007, Ecophysiology of tea, Braz. J. Plant Physiol.; UF/IFAS EDIS HS308'],
  hazelnut: ['Hazelnut bushes give nuts for 40 to 50 years.', 'Hazelnut likes rain spread over the year and suffers in long dry summers.',
    'Hazelnut likes deep soil that drains well, about pH 6 to 6.5.', 'new leaves, shoots and young nuts', 'FAO ECOCROP database; Oregon State Univ. Extension EM 9072 Growing Hazelnuts in the Pacific Northwest; Mehlenbacher 1991'],
  coffee: ['Arabica coffee bushes give beans for 20 to 30 years with good pruning.', 'Arabica likes 1,400 to 2,300 mm of rain, with a short dry spell before flowering.',
    'Arabica likes deep, rich soil that drains well, about pH 5.5 to 7.', 'leaves, young shoots and berries', 'FAO ECOCROP database; Camargo 2010, Bragantia 69(1):239-247; DaMatta & Ramalho 2006, Braz. J. Plant Physiol. 18:55-81'],
  robusta: ['Robusta coffee bushes give beans for 20 to 30 years.', 'Robusta likes lots of rain, 1,700 to 3,000 mm, with a short dry spell.',
    'Robusta likes deep soil that drains well, about pH 5 to 6.3.', 'leaves and young berries (cold below 6 C already hurts)', 'FAO ECOCROP database; Camargo 2010, Bragantia 69(1); Kath et al. 2020, Global Change Biology'],
  cocoa: ['Cocoa trees give pods for about 20 to 30 years.', 'Cocoa likes about 1,500 to 2,500 mm of rain and no more than four dry months.',
    'Cocoa likes deep soil that drains well, about pH 5 to 6.5.', 'the whole tree: leaves, flowers and pods', 'FAO ECOCROP database; ICCO, Growing cocoa; Eskes 2006 cited in ICCO symposium paper T1.252'],
  oilpalm: ['Oil palms give fruit bunches for about 25 years, then are replanted.', 'Oil palm likes 1,500 to 3,000 mm of rain with no long dry season.',
    'Oil palm likes deep, moist soil that drains well, about pH 4.5 to 6.', 'leaves and the growing spear', 'FAO ECOCROP database; MINADER Cameroon, Oil palm plantation management sheet; TNAU Agritech / Corley & Tinker climatic ranges'],
  rubber: ['Rubber trees are tapped for about 25 to 30 years.', 'Rubber likes heavy rain, 2,000 to 4,000 mm, spread through the year.',
    'Rubber likes deep soil that drains well, about pH 4.5 to 6.', 'leaves and young shoots', 'FAO ECOCROP database; Philippine Dept. of Agriculture; NSF Sri Lanka land suitability for rubber'],
  banana: ['A banana field gives bunches for about 5 to 10 years before replanting.', 'Bananas need water all year, about 1,400 to 2,400 mm of rain.',
    'Bananas like deep, rich soil that drains well, about pH 5.5 to 6.5.', 'leaves and the fruit bunch', 'FAO ECOCROP database; FAO Land & Water crop information: Banana'],
  citrus: ['Orange trees give fruit for 30 to 50 years.', 'Oranges like 1,200 to 2,000 mm of rain, or watering in dry months.',
    'Oranges like deep soil that drains well, about pH 5 to 6.', 'flowers and young fruit; harder frost hurts leaves and branches', 'FAO ECOCROP database; FAO Land & Water crop information: Citrus; Citrus heat-stress reviews'],
  olive: ['Olive trees can give fruit for a hundred years or more.', 'Olive likes dry summers and only 400 to 700 mm of rain a year.',
    'Olive likes soil that drains fast, about pH 6 to 7.', 'flowers and fruit; hard winter frost hurts branches', 'FAO ECOCROP database; FAO Land & Water crop information: Olive; FAO I2800E'],
  grape: ['Grapevines give grapes for 25 to 50 years.', 'Grapes like dry summers and about 700 to 850 mm of rain a year.',
    'Grapes like soil that drains well, about pH 5.5 to 7.5.', 'new shoots and young flower clusters', 'FAO ECOCROP database; FAO Land & Water crop information: Grape; WSU Wine Extension, Cold hardiness table'],
  apple: ['Apple and pear trees give fruit for 15 to 30 years.', 'Apples and pears like steady rain or watering, and need a cold winter.',
    'Apples and pears like deep soil that drains well, about pH 6 to 7.', 'flowers and young fruit', 'FAO ECOCROP database; MSU Extension, Critical spring temperatures for tree fruit bud stages; OEHHA 2022 Indicators of Climate Change in California: Winter chill'],
  stonefruit: ['Peach, apricot and cherry trees give fruit for about 15 to 25 years.', 'These trees like 500 to 1,300 mm of rain and need a cold winter.',
    'They like deep soil that drains well, about pH 5.5 to 7.', 'flowers and young fruit', 'FAO ECOCROP database; WSU Tree Fruit, Critical bud temperatures; MSU Extension critical spring temperatures'],
  almond: ['Almond trees give nuts for about 20 to 25 years.', 'Almonds like dry summers and 600 to 900 mm of rain.',
    'Almonds like deep soil that drains very well, about pH 6.5 to 7.', 'flowers and small nuts', 'FAO ECOCROP database; UC ANR / The Almond Doctor, almond frost critical temperatures; OEHHA 2022 Winter chill indicator'],
  walnut: ['Walnut trees give nuts for 40 to 60 years or more.', 'Walnuts like 800 to 1,700 mm of rain, or watering in summer.',
    'Walnuts like very deep soil that drains well, about pH 5.5 to 6.5.', 'new shoots, flowers and small nuts', 'FAO ECOCROP database; UC IPM walnut sunburn; UC frost guidance; NSW DPI Climate vulnerability factsheet: Walnut'],
  pistachio: ['Pistachio trees give nuts for 50 years or more.', 'Pistachio likes long hot dry summers and only 400 to 700 mm of rain.',
    'Pistachio likes soil that drains fast, about pH 7 to 8.', 'flowers and new shoots', 'FAO ECOCROP database; UC Cooperative Extension pistachio; NSW DPI Pistachio industry expansion'],
  cashew: ['Cashew trees give nuts for about 20 to 30 years.', 'Cashew likes 750 to 1,600 mm of rain and a long dry season.',
    'Cashew grows on poor, sandy soil that drains well, about pH 4.5 to 6.5.', 'leaves, flowers and young trees', 'FAO ECOCROP database; USAID cashew growers manual; Kerala Agricultural Univ.'],
  coconut: ['Tall coconut palms give nuts for about 60 years.', 'Coconut likes 1,200 to 2,400 mm of rain spread over the year.',
    'Coconut likes sandy or loamy soil that drains well, about pH 5 to 8.', 'leaves and young nuts', 'FAO ECOCROP database; ICAR-CPCRI Coconut extension publication No.133; Vikaspedia coconut cultivation practices'],
  mango: ['Mango trees give fruit for many decades.', 'Mango likes 600 to 1,500 mm of rain and a dry season before flowering.',
    'Mango likes deep soil that drains well, about pH 5.5 to 7.5.', 'flowers, young fruit and young trees', 'FAO ECOCROP database; UF/IFAS Extension'],
  datepalm: ['Date palms give fruit for 40 to 60 years or more.', 'Date palms like almost no rain; they need water from the ground or irrigation.',
    'Date palms like sandy soil that drains well, about pH 6.5 to 8.', 'leaves and flower clusters', 'FAO ECOCROP database; FAO 2002 Date Palm Cultivation'],
  avocado: ['Avocado trees give fruit for about 20 to 40 years.', 'Avocado likes 500 to 2,000 mm of rain, but never standing water.',
    'Avocado needs soil that drains very well, about pH 5 to 7.', 'flowers, young fruit and new leaves', 'FAO ECOCROP database; UF/IFAS; UC Cooperative Extension avocado notes; UC Master Gardeners'],
  sugarcane: ['Sugarcane is cut every year and regrows for 3 to 5 harvests.', 'Sugarcane needs lots of water, 1,500 to 2,500 mm, then a dry, cool ripening time.',
    'Sugarcane likes deep soil that drains well, about pH 5 to 8.', 'leaves and the top growing buds', 'FAO ECOCROP database; FAO Land & Water crop information: Sugarcane'],
  pineapple: ['A pineapple field gives one main crop and one more crop, over 2 to 4 years.', 'Pineapple likes 800 to 2,500 mm of rain and can stand dry spells.',
    'Pineapple likes acid, light soil that drains well, about pH 4.5 to 6.5.', 'leaves and fruit', 'FAO ECOCROP database; FAO Land & Water crop information: Pineapple; Queensland DAF pineapple'],
  strawberry: ['Strawberry plants give fruit for 2 to 4 years.', 'Strawberries need steady water, about 600 to 900 mm of rain or watering.',
    'Strawberries like soil that drains well, about pH 5.5 to 6.5.', 'open flowers', 'FAO ECOCROP database; Virginia Tech Extension SPES-56, Frost/Freeze Protection in Strawberry; Clemson/SC Extension and MSU Extension'],
  blueberry: ['Blueberry bushes can give fruit for 30 to 50 years.', 'Blueberries need steady moisture because their roots are shallow.',
    'Blueberries need acid soil that drains well, about pH 4.5 to 5.5.', 'open flowers and young fruit', 'FAO ECOCROP database; Penn State Extension, Highbush Blueberry Production; Oregon State Extension'],
  raspberry: ['Raspberry and blackberry plants give fruit for about 8 to 15 years.', 'They need steady water while fruiting, about 800 to 1,200 mm of rain.',
    'They like soil that drains well, about pH 5.5 to 6.5.', 'flowers and new shoots', 'FAO ECOCROP database; Oregon State Extension EC 1306; Univ. Kentucky HO-15 and Fruit Scout, Winter injury on brambles'],
  kiwi: ['Kiwifruit vines give fruit from year 3 or 4 for 25 years or more.', 'Kiwifruit needs plenty of water in summer, but its roots die in flooded soil.',
    'Kiwifruit likes deep soil that drains well, about pH 6 to 7.', 'new shoots and flower buds', 'FAO ECOCROP database; UC ANR Small Farms Network, Kiwifruit production in California; NZKGI Kiwifruit Book, chapter 2'],
  fig: ['Fig trees give fruit for 35 to 40 years or more.', 'Figs stand dry weather; rain at ripening can split the fruit.',
    'Figs like soil that drains well, about pH 6 to 7.', 'new shoots, buds and young fruit', 'FAO ECOCROP database; UF/IFAS EDIS HS27, The Fig; Valley Fig Growers / California Grown'],
  pomegranate: ['Pomegranate trees give fruit for 20 to 30 years or more.', 'Pomegranate likes hot, dry summers; rain at ripening can split fruit.',
    'Pomegranate likes soil that drains well, about pH 5.5 to 7.', 'new shoots, flowers and young bark', 'FAO ECOCROP database; UGA Extension C997, Pomegranate Production; UF/IFAS EDIS HS44, The Pomegranate'],
  pecan: ['Pecan trees give nuts for many decades, starting in year 4 to 7.', 'Pecans need much water in summer; dry places must irrigate.',
    'Pecans like deep soil that drains well, about pH 5.5 to 6.5.', 'new shoots, leaves and flowers', 'FAO ECOCROP database; UF/IFAS EDIS HS984, The Pecan Tree; UGA Extension pecan blog'],
  macadamia: ['Macadamia trees give nuts from year 4 or 5 for many decades.', 'Macadamia needs rain all through the year, about 1,200 mm or more.',
    'Macadamia likes deep, acid soil that drains well, about pH 5 to 6.5.', 'young trees, flowers and new leaves', 'FAO ECOCROP database; NSW macadamia culture summary 1983; California Rare Fruit Growers, Macadamia fruit facts'],
  chestnut: ['Chestnut trees give nuts from year 2 or 3 for many decades.', 'Chestnut needs rain in summer; long dry summers give small nuts.',
    'Chestnut likes acid soil that drains well, about pH 5.5 to 6.5.', 'new shoots, buds and catkins', 'FAO ECOCROP database; Univ. Missouri Center for Agroforestry AF1007, Growing Chinese Chestnuts in Missouri; MSU Extension, Michigan chestnut updates'],
  blackpepper: ['Pepper vines give berries from year 3 for about 15 to 20 years.', 'Pepper needs plenty of rain spread over the year.',
    'Pepper likes rich soil that drains well, about pH 4.5 to 6.5.', 'the whole vine', 'FAO ECOCROP database; ICAR-IISR, Good Agricultural Practices: Black Pepper; DASD India, Good Agricultural Practices for Black Pepper'],
  cardamom: ['Cardamom plants give pods from year 3 for about 8 to 12 years.', 'Cardamom needs much rain spread through the year, and shade.',
    'Cardamom likes rich forest soil that drains well, about pH 5.5 to 6.', 'the whole plant', 'FAO ECOCROP database; Spices Board India, small cardamom cultivation manual; AICRP on Spices, Cardamom'],
  vanilla: ['Vanilla vines give beans from year 3 for about 12 to 14 years.', 'Vanilla needs rain most of the year and a short dry spell to flower.',
    'Vanilla likes loose, rich soil that drains well, about pH 5.5 to 6.5.', 'the whole vine', 'FAO ECOCROP database; TNAU Agritech, Vanilla; Vikaspedia, Vanilla package of practices'],
  cinnamon: ['Cinnamon bushes are cut for bark from year 3 or 4 for many decades.', 'Cinnamon needs a warm, wet climate with plenty of rain.',
    'Cinnamon likes deep soil that drains well, about pH 5.5 to 6.5.', 'the whole plant', 'FAO ECOCROP database; Sri Lanka Dept. of Export Agriculture farmer guide; Northern Province cinnamon guide; AICRP on Spices, Cinnamon'],
  hops: ['A hop yard gives cones from year 2 and lasts about 15 to 20 years.', 'Hops need steady water and long summer days.',
    'Hops like deep soil that drains well, about pH 6 to 7.', 'young spring shoots', 'FAO ECOCROP database; Univ. Tennessee Extension, Hop production presentations; Colorado State Univ. 2019, Hops don\'t need to go dormant to flower'],
  sisal: ['Sisal plants give leaves for about 7 to 15 years, then flower and die.', 'Sisal stands dry spells; it grows best with 900 to 1,250 mm of rain.',
    'Sisal likes light soil that drains well, about pH 6 to 7.5.', 'leaves', 'FAO ECOCROP database; South Africa DALRRD, Sisal production brochure; ICRAF Useful Trees, Agave sisalana'],
  papaya: ['A papaya plant fruits within a year and is replaced after 2 to 4 years.', 'Papaya needs plenty of rain or watering, but flooding kills it fast.',
    'Papaya likes light soil that drains very well, about pH 5.5 to 6.7.', 'the whole plant: leaves, top and fruit', 'FAO ECOCROP database; UF/IFAS EDIS HS11, Papaya Growing in the Florida Home Landscape; Morton 1987, Fruits of Warm Climates: Papaya'],
  guava: ['Guava trees give fruit for 15 to 40 years; best in the first 15.', 'Guava likes 1,000 to 2,000 mm of rain but stands dry spells.',
    'Guava grows in many soils, best about pH 4.5 to 7.', 'young trees, new shoots and leaves', 'FAO ECOCROP database; UF/IFAS EDIS HS4, Guava Growing in the Florida Home Landscape; Morton 1987, Fruits of Warm Climates: Guava'],
  lychee: ['Lychee trees fruit from year 3 to 5 and can bear for 100 years.', 'Lychee needs hot, wet summers and a cool, dry winter to flower.',
    'Lychee likes deep soil that drains well, about pH 5.5 to 6.5.', 'young trees, new flush and flowers', 'FAO ECOCROP database; UF/IFAS EDIS HS6, Lychee Growing in the Florida Home Landscape; Morton 1987, Fruits of Warm Climates: Lychee'],
  passionfruit: ['Passion fruit vines fruit within 1 to 2 years and last 3 to 6 years.', 'Passion fruit needs 900 to 2,000 mm of rain spread through the year.',
    'Passion fruit likes soil that drains well, about pH 6 to 7.', 'leaves, shoots and whole vine', 'FAO ECOCROP database; UF/IFAS EDIS HS1467, The Emerging Passion Fruit Industry in Florida; UF/IFAS EDIS HS1397, Passion Fruit Problems in the Home Landscape'],
  asparagus: ['An asparagus field is cut from year 2 or 3 for 12 to 20 years.', 'Asparagus needs 800 to 1,200 mm of rain or watering, and a yearly rest.',
    'Asparagus likes deep soil that drains well, about pH 6.5 to 7.5.', 'young spears', 'FAO ECOCROP database; MSU Extension, Growing asparagus; Purdue Extension HO-96-W, Asparagus'],
  trees: ['Fruit and nut trees stay for many years.', 'Young fruit needs water in dry spells.',
    'Most trees need deep soil that drains well.', 'flowers and young fruit', 'General guidance'],
};
const BUD_STAGES = {   // the plain name, then each stage: name, °F where 10% of the buds die, °F where 90% die
  apple: ['apple', ['Silver tip', 15, 2], ['Green tip', 18, 10], ['Half-inch green', 23, 15], ['Tight cluster', 27, 21], ['First pink', 28, 24], ['Full pink', 28, 25], ['First bloom', 28, 25], ['Full bloom', 28, 25], ['Post bloom', 28, 25]],
  pear: ['pear', ['Bud scales separating', 15, 0], ['Blossom buds exposed', 20, 6], ['Tight cluster', 24, 15], ['First white', 25, 19], ['Full white', 26, 22], ['First bloom', 27, 23], ['Full bloom', 28, 24], ['Post bloom', 28, 24]],
  apricot: ['apricot', ['Swollen bud', 15, null], ['Tips separate', 20, 0], ['Calyx red', 22, 9], ['First white', 24, 14], ['First bloom', 25, 19], ['Full bloom', 27, 22], ['In the shuck', 27, 24], ['Green fruit', 28, 25]],
  peach: ['peach', ['Swollen bud', 18, 1], ['Calyx green', 21, 5], ['Calyx red', 23, 9], ['First pink', 25, 15], ['First bloom', 26, 21], ['Full bloom', 27, 24], ['Post bloom', 28, 25]],
  sweetcherry: ['cherry', ['Swollen bud', 17, 5], ['Side green', 22, 9], ['Green tip', 25, 14], ['Tight cluster', 26, 17], ['Open cluster', 27, 21], ['First white', 27, 24], ['First bloom', 28, 25], ['Full bloom', 28, 25], ['Post bloom', 28, 25]],
  grape: ['grape', ['First swell', 13, -3], ['Full swell', 21, 10], ['Bud burst', 25, 16], ['First leaf', 27, 21], ['Second leaf', 28, 22], ['Third leaf', 28, 26], ['Fourth leaf', 28, 27], ['Fifth leaf', 28, 27]],
};
const EXPLANATIONS = {
  nfix: 'Peas, lentils, faba beans, clover and alfalfa (legumes) make their own fertiliser (nitrogen) from the air. A part of it stays in the soil, so the next crop may need less fertiliser. Soybeans and dry beans take much of it away with the grain.',
  cover: 'Cover crops are grown between your main crops to cover the soil. Their roots and leaves stop rain and wind taking soil, and feed the soil. But they drink some water too.',
  deep: 'Crops with deep roots (milo, sunflowers, alfalfa, radish) open holes in the soil so rain soaks in, and reach water that short roots cannot.',
  drought: 'Drought-tough crops (milo, chickpeas, barley, sunflowers) need less water. They may give a little less in a great year, but more in a dry year.',
  fallow: 'Leaving a field empty (fallow) can save some water for the next crop where rain is short. In a wet climate it saves little. But the bare soil can blow or wash away, and gets poorer.',
};
const GARDEN_COLORS = { tea: '#3f8f4a', hazelnut: '#a8743a', coffee: '#b23a2e', robusta: '#8a3a2a', cocoa: '#b5651d', oilpalm: '#d9772a', rubber: '#7a6a55', banana: '#f2cf3a', citrus: '#f39a1e', olive: '#6f7a3a', grape: '#6a3f9a',
  apple: '#d6392e', stonefruit: '#f29a76', almond: '#c79a6a', walnut: '#9a6a42', pistachio: '#a8bf6a', cashew: '#f0b040', coconut: '#7a5234', mango: '#f5a623', datepalm: '#9a5a2a', avocado: '#5a7a2e', sugarcane: '#93b83a',
  pineapple: '#e9b82e', strawberry: '#e0343c', blueberry: '#3f58b0', raspberry: '#c2305a', kiwi: '#8a6f3a', fig: '#6a3f6a', pomegranate: '#c22a3a', pecan: '#8a5a36', macadamia: '#c9a274', chestnut: '#7a4526', blackpepper: '#b02a2a',
  cardamom: '#7fae5a', vanilla: '#4a3526', cinnamon: '#b5653a', hops: '#9cc45a', sisal: '#5f9a8a', papaya: '#f08a3c', guava: '#a8c94a', lychee: '#c8324e', passionfruit: '#5a2f6a', asparagus: '#5f9a4a', trees: '#4f9a4a' };
// Where each value of a crop row is printed. A crop on a list must say so beside its row; a crop on no list must say plainly that
// its value is a regional rule of thumb. The lists were checked against the printed tables: FAO Irrigation Water Management
// Training Manual 3 prints water needs for 21 crops, FAO-56 Table 11 season lengths, FAO-56 Table 22 rooting depths.
const WATER_PRINTED = words('corn wheat barley sorghum swheat oats pmillet proso soy pea bean groundnut sunflower cotton potato sugarbeet tomato onion cabbage watermelon pepper alfalfa sweetcorn greenbean melon durum');
const DAYS_PRINTED = words('corn sorghum proso soy pea cowpea groundnut sunflower sesame cotton potato sugarbeet tomato onion pepper lettuce melon cauliflower');
const ROOT_PRINTED = words('corn wheat barley sorghum swheat oats rice pmillet fmillet proso soy chickpea lentil pea bean faba cowpea groundnut mung sunflower canola scanola sesame safflower flax cotton potato sweetpotato cassava sugarbeet tomato onion cabbage watermelon pepper alfalfa carrot garlic lettuce cucumber eggplant pumpkin sweetcorn spinach greenbean melon cauliflower durum');
const SALT_UNPRINTED = words('rye canola safflower eggplant triticale');   // in neither FAO paper 29 Table 4 nor FAO-56 Table 23: their rows must say so
// The place that proves each limit line, by the line's first field and first crop: every name must stand on that very line.
// (FAO, ECOCROP, WSU, NSW DPI and ICAR-IISR are the authority a line rests on where it is a book and not a place.)
const PROOF = {
  'maxCool:wheat': 'Tabasco|Veracruz|Belize|Pune', 'maxCool:barley': 'Tabasco|Veracruz|Belize', 'maxCool:canola': 'Tanzania',
  'minSeason:cotton': 'Black Sea|Yukon|Nunavik|prairies', 'minSeason:rice': 'Germany|Yukon|Nunavik|prairies', 'minSeason:sorghum': 'Yukon|Nunavik|prairies', 'minSeason:soy': 'Yukon|Nunavik|prairies',
  'minSeason:corn': 'Yukon|Nunavik|prairies|Ottawa|Quebec|Manitoba', 'minSeason:sunflower': 'Yukon|Nunavik|prairies', 'minSeason:scanola': 'Yukon|Nunavik|prairies', 'minSeason:chickpea': 'Yukon|Nunavik|prairies',
  'minSeason:lentil': 'Yukon|Nunavik|prairies', 'minSeason:barley': 'Yukon|Nunavik|prairies', 'minHot:wheat': 'Norway', 'minHot:swheat': 'Norway', 'minHot:sunflower': 'Sweden',
  'heatMargin:cotton': 'Sindh', 'mildAutumn:barley': 'Iraq|Morocco|Egypt|Spain', 'mildAutumn:chickpea': 'Punjab|Nile|Iraq|Andalusia', 'tropic:faba': 'India|Egypt', 'water:rice': 'FAO', 'minRatio:swheat': 'Saskatoon',
  'humid:tea': 'Fresno|Meknes|Dubbo', 'maxDryMonths:oilpalm': 'Nashik', 'maxDryMonths:cocoa': 'Nashik', 'maxDryMonths:rubber': 'Nashik', 'maxDryMonths:blueberry': 'Maine|Florida',
  'minNight:coconut': 'Ribeirão Preto', 'minMonth:coconut': 'Crete|Nile Delta', 'minMonth:banana': 'Guangdong|Canaries|Israel', 'minMonth:guava': 'Fès', 'minMonth:sugarcane': 'Louisiana', 'warm:macadamia': 'NSW DPI',
  'summer:tea': 'Edinburgh|Dublin', 'summer:coffee': 'Boyacá|Peru|New Zealand', 'summer:citrus': 'Bordeaux|Kent|Lisbon', 'summer:grape': 'Finland|Sweden|Kent|Cowichan', 'summer:apple': 'Lofoten|Vesterålen|Hardanger|Oulu',
  'summer:walnut': 'Alaska|Newfoundland', 'summer:avocado': 'Oregon|California|France', 'summer:pineapple': 'Perth|Sydney|Queensland|Hawaii|Costa Rica', 'summer:pecan': 'Kennewick|Taganrog|Kuban|Georgia|Texas|Mexico',
  'summer:hops': 'Kent|Fraser|Yakima|Newfoundland|British Columbia', 'summer:lychee': 'Ethiopian|Kenyan', 'summer:guava': 'New Zealand', 'summer:macadamia': 'Galicia',
  'maxSummer:apple': 'Punjab', 'maxSummer:blueberry': 'Punjab', 'maxSummer:hazelnut': 'Punjab', 'maxSummer:hops': 'Punjab', 'maxSummer:tea': 'Assam', 'maxSummer:coffee': 'Nile Delta', 'maxSummer:olive': 'Delhi', 'maxSummer:walnut': 'Gulf',
  'needCool:asparagus': 'equatorial lowlands', 'needCool:almond': 'Tamaulipas|Sfax|Andalusia', 'needCool:grape': 'Congo|Riau',
  'rainMax:datepalm': 'Çukurova', 'rainOpt:olive': 'Sicily|Liguria|Corfu', 'dryS:olive': 'Niigata', 'wetMult:coffee': 'Costa Rica', 'rainOpt:grape': 'Bordeaux|Mosel|Rías Baixas', 'rainMax:grape': 'Brazil|Maharashtra',
  'rainMax:mango': 'Konkan|Kerala|Riau|Chocó', 'rainMax:hazelnut': 'Willamette', 'dry:walnut': 'Gulf', 'rainOpt:blackpepper': 'ICAR-IISR|Vietnam',
  'winterKill:tea': 'Japan|Georgia|Black Sea|Assam', 'winterKill:almond': 'interior west|Ontario', 'winterKill:grape': 'Ukraine|Russia', 'winterKill:sugarcane': 'Louisiana', 'winterKill:apple': 'Antonovka|Michurin',
  'winterKill:blueberry': 'Maine', 'winterKill:avocado': 'Iowa', 'winterKill:raspberry': 'ECOCROP', 'chill:almond': 'Sfax|Andalusia', 'chillSoft:grape': 'Maharashtra', 'chillHard:apple': 'Florida',
  'budCold:apple': 'WSU', 'budCold:stonefruit': 'WSU', 'budCold:grape': 'WSU',
};
// Limit lines for which no proving place is on record: each says what the limit is and names no place. The owner is asked for the
// place; until then a place may not be written beside one of these, because a place there would read as proof that does not exist.
const NO_PLACE = words('minHot:barley minHot:oats minCool:cassava needDry:cotton maxAlt:cotton maxAlt:pmillet maxAlt:cassava scl:sunflower nfix:soy nfix:alfalfa legumeMix:ley major:oats major:sugarbeet tMin:sunnhemp maxDryMonths:tea maxDryMonths:coconut dryA:cocoa dryA:rubber minNight:blackpepper minNight:cinnamon minNight:robusta minNight:rubber minNight:pineapple minMonth:cocoa minMonth:robusta minMonth:cashew minMonth:pineapple minMonth:cardamom minMonth:coffee minMonth:mango minMonth:lychee minMonth:avocado maxAlt:coconut maxAlt:oilpalm maxAlt:rubber maxAlt:robusta maxAlt:mango maxAlt:sugarcane maxAlt:guava warm:blackpepper warm:papaya warm:lychee warm:cinnamon summer:olive summer:almond summer:pistachio summer:mango summer:datepalm summer:sugarcane summer:oilpalm summer:cashew summer:robusta summer:cocoa summer:kiwi maxSummer:raspberry maxSummer:kiwi maxSummer:almond maxSummer:pistachio maxSummer:pecan wetMult:pomegranate irrigated:citrus winterKill:datepalm winterKill:olive winterKill:citrus winterKill:pistachio winterKill:hazelnut winterKill:stonefruit');
const TRICKS = ['toString', '__proto__', 'constructor', 'hasOwnProperty', 'valueOf', 'prototype', '', ' corn', 'Corn', 'CORN'];   // names every object answers to, and near misses
const NOT_TEXT = [0, 1, null, undefined, {}, [], ['corn'], true, NaN];

group('the counts', () => {
  const ids = Object.keys(CROPS), types = type => ids.filter(id => CROPS[id].type === type).length;
  same('64 field crops: 62 cash crops and 2 forage crops', [types('cash'), types('forage'), types('cash') + types('forage')], [62, 2, 64]);
  same('6 cover crops', types('cover'), 6);
  same('1 fallow entry, and its id is fallow', [types('fallow'), CROPS.fallow?.type], [1, 'fallow']);
  same('71 field entries in all', ids.length, 71);
  same('43 tree, bush, vine and palm crops plus the one "Other trees or bushes" entry', [Object.keys(GARDENS).length, Object.keys(GARDENS).filter(id => id !== 'trees').length, GARDENS.trees?.name], [44, 43, 'Other trees or bushes']);
  same('24 ready rotations: 23 with crops and "Build my own" last', [Object.keys(PRESETS).length, Object.keys(PRESETS).filter(id => PRESETS[id].slots.length).length, Object.keys(PRESETS).at(-1)], [24, 23, 'custom']);
  same('the chooser can show all 115 crops', new Set([...ids, ...Object.keys(GARDENS)]).size, 115);
  same('the 71 field entries are the expected ones, in the agreed order', ids, FIELD_IDS);
  same('the 44 garden entries are the expected ones, in the agreed order (the owner\'s own region first: tea, hazelnuts)', Object.keys(GARDENS), GARDEN_IDS);
  same('the six cover crops', ids.filter(id => CROPS[id].type === 'cover'), words('ryecover vetchmix radish sunnhemp clover mustard'));
  same('the two forage crops', ids.filter(id => CROPS[id].type === 'forage'), words('alfalfa ley'));
  same('the lists a screen can loop over', [T.TYPES.length, T.GROUPS.length, T.FAMILIES.length, T.ZONES.length], [4, 11, 19, 7]);
});

group('every value of the crop table, against the copy written out above', () => {
  // The table must equal the published values, so each one is written twice: a slip of one digit in either place fails here.
  const FIELDS = words('name type group fam water days root nfix om cover resid drought heat frost minT tMin tOpt tMax income forage sow harv color');
  same('the second copy lists the 71 field entries in the table\'s order', Object.keys(FIELD_ROWS), Object.keys(CROPS));
  for (const [id, row] of Object.entries(FIELD_ROWS)) {
    const c = CROPS[id] ?? {};
    same(`${id}: name, type, group, family, water, season length, rooting depth, the 0-1 scales, heat, frost, temperatures, income, feed value, months and colour`, Object.fromEntries(FIELDS.map(k => [k, c[k] ?? null])), Object.fromEntries(FIELDS.map((k, i) => [k, row[i]])));
  }
  same('the soil pH limits, crop by crop', sorted(TEST_PH), sorted(SOIL_PH));
  same('the salt limits, crop by crop', sorted(TEST_SAL), sorted(SOIL_SALT));
  same('the second copy lists the 44 garden entries in the table\'s order', [Object.keys(GARDEN_ROWS), Object.keys(GARDEN_TEXTS), Object.keys(GARDEN_COLORS)], [Object.keys(GARDENS), Object.keys(GARDENS), Object.keys(GARDENS)]);
  const NEEDS = words('name garden rainOpt rainMin rainMax heat ph phAbs'), TEXTS = words('stays rain soil frost src');
  for (const id of Object.keys(GARDEN_ROWS)) {
    const g = GARDENS[id] ?? {};
    same(`${id}: name, place name, rain, heat and soil pH`, Object.fromEntries(NEEDS.map(k => [k, g[k] ?? null])), Object.fromEntries(NEEDS.map((k, i) => [k, GARDEN_ROWS[id][i]])));
    same(`${id}: the four sentences and the sources, word for word`, TEXTS.map(k => g[k]), GARDEN_TEXTS[id]);
    same(`${id}: its one colour`, g.color, GARDEN_COLORS[id]);
  }
  same('the six bud-frost tables, stage by stage', Object.fromEntries(Object.entries(BUD_COLD_F).map(([id, b]) => [id, [b.name, ...b.stages]])), BUD_STAGES);
  same('the five explanations, word for word', { ...WHAT_IT_DOES }, EXPLANATIONS);
});

group('ids are unique, lower-case and safe', () => {
  const field = Object.keys(CROPS), garden = Object.keys(GARDENS), preset = Object.keys(PRESETS);
  check('every field id is lower-case letters only', field.every(id => /^[a-z]+$/.test(id)), show(field.filter(id => !/^[a-z]+$/.test(id))));
  check('every garden id is lower-case letters only', garden.every(id => /^[a-z]+$/.test(id)), show(garden.filter(id => !/^[a-z]+$/.test(id))));
  check('every rotation id is lower-case words joined by a dash', preset.every(id => /^[a-z]+(-[a-z]+)*$/.test(id)), show(preset));
  same('no id is both a field crop and a garden crop (one id, one crop, one colour)', field.filter(id => garden.includes(id)), []);
  same('no id is both a crop and a rotation', preset.filter(id => field.includes(id) || garden.includes(id)), []);
  same('no id is a name every object answers to', [...field, ...garden, ...preset].filter(id => id in {}), []);
  for (const trick of TRICKS) {
    same(`"${trick}" is not a crop, a garden crop or a rotation`, [T.isCrop(trick), T.isGarden(trick), T.isPreset(trick), T.cropOf(trick), T.gardenOf(trick), T.presetOf(trick), T.entryOf(trick)], [false, false, false, null, null, null, null]);
    same(`"${trick}" has no name, colour, picture or bud table`, [T.cropName(trick), T.cropName(trick, true), T.cropColor(trick), P.cropPic(trick), P.hasPic(trick), T.budTables(trick)], ['', '', '', '', false, []]);
  }
  same('own() itself turns the tricks away on the crop table', TRICKS.map(trick => own(CROPS, trick)), TRICKS.map(() => false));
  same('a value that is not text is never an id', NOT_TEXT.map(v => [T.isCrop(v), T.isGarden(v), T.isPreset(v), T.cropName(v), P.cropPic(v)]), NOT_TEXT.map(() => [false, false, false, '', '']));
  same('a real id still reads', [T.isCrop('corn'), T.cropOf('corn') === CROPS.corn, T.isGarden('tea'), T.gardenOf('tea') === GARDENS.tea, T.isPreset('corn-soy'), T.entryOf('tea') === GARDENS.tea], [true, true, true, true, true, true]);
  const closed = thing => Object.isFrozen(thing) && Object.values(thing).every(v => !v || typeof v !== 'object' || closed(v));
  check('every table is closed, so no screen can change a crop', [CROPS, GARDENS, PRESETS, BUD_COLD_F, WHAT_IT_DOES, TEST_PH, TEST_SAL, T.FAO_ALIAS, T.FAO_KIND, T.FAO_ONLY, T.SPAM_OF, T.SPAM_KIND, T.TYPES, T.GROUPS, T.FAMILIES, T.ZONES].every(closed));
  let changed = false; try { CROPS.corn.water = 1; changed = CROPS.corn.water === 1; } catch { changed = false; }
  check('writing to a crop changes nothing', !changed && CROPS.corn.water === 650);
});

// The ranges below are not the proof that the table is right: the second copy above is. They guard the day a row is added or
// re-sourced and table and copy are changed together: a value outside what a crop can be still fails here.
group('every field crop has every field, inside a sane range', () => {
  const NEEDED = words('name type group fam water root nfix om cover resid drought heat frost minT income forage sow harv color');
  const GROWS = words('days tMin tOpt tMax');   // fallow grows nothing, so it has no season length and no temperature range
  const KNOWN = new Set([...NEEDED, ...GROWS, ...words('major tropic ffd maxGs minRain minSeason maxCool maxCoolHumid minCool minHot mildAutumn minRatio maxAlt needDry heatMargin scl legumeMix soilTest winterKill winterSnow winterBy')]);
  for (const [id, c] of Object.entries(CROPS)) {
    const crop = c.type !== 'fallow';
    same(`${id}: has every field and no unknown one`, [[...NEEDED, ...(crop ? GROWS : [])].filter(k => c[k] === undefined), Object.keys(c).filter(k => !KNOWN.has(k))], [[], []]);
    check(`${id}: a plain name, a type, a group, a family and a colour`, typeof c.name === 'string' && /^[A-Z][A-Za-z+ ()-]+$/.test(c.name) && T.TYPES.includes(c.type) && T.GROUPS.includes(c.group) && T.FAMILIES.includes(c.fam) && /^#[0-9a-f]{6}$/.test(c.color), show([c.name, c.type, c.group, c.fam, c.color]));
    // water 90-1100 mm: a quick radish cover drinks about 90 mm, a flooded paddy about 1,100 mm in the field; fallow drinks nothing
    // days 30-400: nothing ripens in under a month, and no field crop is longer in the ground than winter canola's 300 days
    // root 0.3-3 m: FAO-56 Table 22 runs from lettuce (0.3) to alfalfa (up to 3 m); fallow has no roots
    check(`${id}: water, season length and rooting depth`, crop ? within(c.water, 90, 1100) && Number.isInteger(c.days) && within(c.days, 30, 400) && within(c.root, 0.3, 3) : c.water === 0 && c.days === undefined && c.root === 0, show([c.water, c.days, c.root]));
    check(`${id}: every 0-1 scale is between 0 and 1`, [c.nfix, c.om, c.cover, c.resid, c.drought, c.frost, c.forage].every(share), show([c.nfix, c.om, c.cover, c.resid, c.drought, c.frost, c.forage]));
    // heat 20-45 °C: no crop is stressed by a day under 20 °C, none stands days over 45 °C; fallow's 99 and -99 switch the checks off
    // minT (the base temperature for useful growth) -5 to 20 °C: cereal rye still grows at 1 °C, yams need 20 °C
    check(`${id}: heat limit and lowest month for growth`, crop ? within(c.heat, 20, 45) && within(c.minT, -5, 20) : c.heat === 99 && c.minT === -99, show([c.heat, c.minT]));
    // ECOCROP season temperatures: lowest 0-20 °C, highest 25-50 °C, and the best range lies between them
    check(`${id}: season temperatures in order (lowest, best range, highest)`, crop ? within(c.tMin, 0, 20) && within(c.tMax, 25, 50) && Array.isArray(c.tOpt) && c.tOpt.length === 2 && c.tMin <= c.tOpt[0] && c.tOpt[0] < c.tOpt[1] && c.tOpt[1] <= c.tMax : c.tMin === undefined && c.tOpt === undefined && c.tMax === undefined, show([c.tMin, c.tOpt, c.tMax]));
    // income: a cash or forage crop earns 0-1; a cover crop costs its seed (just under 0); fallow earns nothing
    check(`${id}: the income guide fits its type`, c.type === 'cover' ? within(c.income, -0.1, -0.01) : c.type === 'fallow' ? c.income === 0 : within(c.income, 0.3, 1), show(c.income));
    check(`${id}: sowing and harvest months are months`, Number.isInteger(c.sow) && within(c.sow, 1, 12) && Number.isInteger(c.harv) && within(c.harv, 1, 12), show([c.sow, c.harv]));
    check(`${id}: type and group agree`, c.type === 'cash' ? words('grain legume oil fibre root sugar veg other').includes(c.group) : c.group === c.type, show([c.type, c.group]));
  }
  same('fallow is the only entry of no family', Object.keys(CROPS).filter(id => CROPS[id].fam === 'none'), ['fallow']);
  same('every family is used by a crop, and every crop has a family from the list', T.FAMILIES.filter(f => !Object.values(CROPS).some(c => c.fam === f)), []);
  same('every group has a crop', T.GROUPS.filter(g => !T.cropsOfGroup(g).length), []);
  same('the pest break: crops of one family share it (the nightshades)', Object.keys(CROPS).filter(id => CROPS[id].fam === 'nightshade'), words('potato tomato pepper tobacco eggplant'));
  same('the cereals, sweet corn, ley and rye cover are all grasses', Object.keys(CROPS).filter(id => CROPS[id].fam === 'grass'), words('corn wheat barley sorghum swheat oats rye rice pmillet fmillet proso teff ley ryecover sweetcorn triticale durum'));
});

group('nitrogen: every legume fixes it, and nothing else claims to', () => {
  const legumes = Object.keys(CROPS).filter(id => CROPS[id].fam === 'legume');
  same('the 17 legumes', legumes, words('soy chickpea lentil pea bean faba cowpea groundnut pigeonpea mung alfalfa vetchmix sunnhemp clover greenbean lupin bambara'));
  check('every legume is marked as fixing nitrogen', legumes.every(id => CROPS[id].nfix > 0), show(legumes.filter(id => !(CROPS[id].nfix > 0))));
  same('the only crop outside the family that fixes nitrogen is the grass and clover mix', Object.keys(CROPS).filter(id => CROPS[id].nfix > 0 && CROPS[id].fam !== 'legume'), ['ley']);
  // The figure is what the NEXT crop can count on once the grain or hay is hauled off, not the gross amount fixed:
  // counting the gross amount would tell a farmer to cut fertiliser that the next crop still needs.
  same('soybeans leave 0.3 and alfalfa 0.5, not the gross 0.6 and 0.85', [CROPS.soy.nfix, CROPS.alfalfa.nfix], [0.3, 0.5]);
  check('dry beans and green beans leave the least of the legumes (most goes with the crop)', legumes.every(id => CROPS[id].nfix >= CROPS.bean.nfix) && CROPS.greenbean.nfix === CROPS.bean.nfix);
  check('the explanation says "may need less fertiliser" and never that none is needed', WHAT_IT_DOES.nfix.includes('the next crop may need less fertiliser') && !/no(t)? (need|fertiliser)|without fertiliser/i.test(WHAT_IT_DOES.nfix));
});

group('special limits sit only where one was set', () => {
  const RANGE = {   // why each range: the unit, and the real spread of field crops
    minSeason: [3, 22], maxCool: [19, 23], maxCoolHumid: [19, 19], minCool: [10, 20], minHot: [9, 20],   // °C of a season or a month
    minRatio: [0.45, 0.6],   // between the watered floor (0.45) and the rain-fed floor (0.6) of the water check
    maxAlt: [1000, 3000], needDry: [1, 4], heatMargin: [3, 8],   // metres; months; °C on top of the heat limit
    ffd: [60, 330], maxGs: [300, 800], minRain: [200, 1200],   // days without frost; mm of rain (200: proso millet, the lowest yearly rain FAO ECOCROP prints for it; the floor was 400 before that crop was added)
    winterKill: [-35, -10], winterSnow: [2, 30],   // °C a hardened winter cereal survives (the hardiest go to about −24 °C); cm of snow
  };
  // Every crop with a winter-kill figure names who says so, on its own row, with both figures.
  const rowOf = id => { const lines = CROPS_JS.split('\n'), i = lines.findIndex(l => l.startsWith(`  ${id}: {`)); return `${lines[i]}\n${lines[i + 1]}`; };
  same('a winter-kill figure is cited on its row: OMAFRA Field Crop News, "Winter Survival", with the −24 °C and the 7.5 cm', Object.keys(picked(CROPS, 'winterKill')).filter(id => !/OMAFRA Field Crop News, "Winter Survival": hardened-off plants survive down to −24 °C, and 7\.5 cm of snow/.test(rowOf(id))), []);
  for (const [field, want] of Object.entries(FIELD_LIMITS)) {
    // Sown by the calendar even in the tropics: the cool-season crops, and five warm-season ones the table marks the same way
    // (tomatoes, watermelons, peppers, melons, buckwheat). Whether those five are meant is the owner's to say; the table is kept.
    if (field === 'tropicFalse') { same('tropic: false on exactly the 35 crops the table marks as sown by the calendar even in the tropics', Object.keys(picked(CROPS, 'tropic', v => v !== undefined)), words(want)); continue; }
    const got = picked(CROPS, field), pin = typeof want === 'string' ? flags(want) : want;
    same(`${field}: exactly the expected crops and values, and no other crop has one`, sorted(got), sorted(pin));
    if (RANGE[field]) check(`${field}: every value is in a sane range for its unit`, Object.values(got).every(v => within(v, ...RANGE[field])), show(got));
  }
  check('tropic is only ever false (absent means "sown with the rains")', Object.values(CROPS).every(c => c.tropic === undefined || c.tropic === false));
  same('sugar beets alone carry a plain "no" for major (under 5 million ha); every other crop is yes or says nothing', picked(CROPS, 'major', v => v !== undefined && v !== true), { sugarbeet: false });
  check('a humid limit never sits without the plain cool-season limit', Object.values(CROPS).every(c => (c.maxCoolHumid === undefined) === (c.maxCool === undefined) && !(c.maxCoolHumid > c.maxCool)));
  const rows = block('export const CROPS = {').join('\n');
  same('no special limit is folded into a table row: each is its own line with its reason', words('minSeason maxCool maxCoolHumid minCool minHot mildAutumn minRatio maxAlt needDry heatMargin scl legumeMix').filter(k => new RegExp(`\\b${k}:`).test(rows)), []);
});

group('soil-test limits', () => {
  same('pH limits for 33 crops and salt limits for 33', [Object.keys(TEST_PH).length, Object.keys(TEST_SAL).length], [33, 33]);
  same('every soil-test limit belongs to a field crop', [...Object.keys(TEST_PH), ...Object.keys(TEST_SAL)].filter(id => !T.isCrop(id)), []);
  // pH [best low, best high, lowest it takes, highest it takes]: soils run from about pH 3.5 to 9.5; the best range lies inside the outer one
  check('every pH limit is four figures in order', Object.values(TEST_PH).every(p => p.length === 4 && within(p[2], 3.5, 6) && p[2] <= p[0] && p[0] < p[1] && p[1] <= p[3] && within(p[3], 7, 9.5)), show(TEST_PH));
  check('pH figures are rounded to 0.5', Object.values(TEST_PH).flat().every(v => Number.isInteger(v * 2)));
  // salt [threshold ECe dS/m, % yield lost per dS/m above it] (Maas & Hoffman): thresholds run from 1 (beans) to 11.4 (rye)
  check('every salt limit is a threshold and a loss per dS/m', Object.values(TEST_SAL).every(s => s.length === 2 && within(s[0], 1, 12) && within(s[1], 2, 30)), show(TEST_SAL));
  same('beans are the most salt-shy crop and rye the hardiest', [Math.min(...Object.values(TEST_SAL).map(s => s[0])), TEST_SAL.bean, TEST_SAL.greenbean, Math.max(...Object.values(TEST_SAL).map(s => s[0])), TEST_SAL.rye], [1, [1, 19], [1, 19], 11.4, [11.4, 10.8]]);
  same('barley, cotton and sugar beets stand salt; corn and potatoes do not', [TEST_SAL.barley, TEST_SAL.cotton, TEST_SAL.sugarbeet, TEST_SAL.corn, TEST_SAL.potato], [[8, 5], [7.7, 5.2], [7, 5.9], [1.7, 12], [1.7, 12]]);
  same('potatoes like the most acid soil of the listed crops', [TEST_PH.potato, Math.min(...Object.values(TEST_PH).map(p => p[1]))], [[5, 6.5, 4.5, 7.5], 6.5]);
  same('each crop carries its own pH limit, the figure of the second copy', sorted(Object.fromEntries(Object.entries(CROPS).filter(([, c]) => c.soilTest?.ph).map(([id, c]) => [id, c.soilTest.ph]))), sorted(SOIL_PH));
  same('each crop carries its own salt limit, the figure of the second copy', sorted(Object.fromEntries(Object.entries(CROPS).filter(([, c]) => c.soilTest?.salt).map(([id, c]) => [id, c.soilTest.salt]))), sorted(SOIL_SALT));
  same('a soil-test entry holds nothing but a pH limit, a salt limit or both', Object.keys(CROPS).filter(id => CROPS[id].soilTest && (Object.keys(CROPS[id].soilTest).some(k => k !== 'ph' && k !== 'salt') || !Object.keys(CROPS[id].soilTest).length)), []);
  // A crop with no published value is never ruled out by a soil test: a made-up limit would hide a crop for no reason.
  same('crops with no published value carry no soil-test limit at all', words('teff quinoa fmillet pmillet cassava yam fallow ryecover hemp').filter(id => CROPS[id].soilTest !== undefined), []);
  same('a crop may have one limit without the other (oats: pH only; flax: salt only)', [CROPS.oats.soilTest, CROPS.flax.soilTest], [{ ph: [5.5, 7, 4.5, 8] }, { salt: [1.7, 12] }]);
});

group('the ready rotations', () => {
  same('the 24 expected rotations, in the agreed order', Object.keys(PRESETS), ROTATIONS.map(r => r[0]));
  for (const [id, label, slots, zone] of ROTATIONS) {
    const p = PRESETS[id] ?? {};
    same(`${id}: the expected name, crops and zone`, [p.label, p.slots, p.zone], [label, words(slots), zone || undefined]);
    check(`${id}: uses only crops that exist, and never a cover crop as a year's crop`, (p.slots ?? []).every(s => T.isCrop(s) && CROPS[s].type !== 'cover'), show(p.slots));
    check(`${id}: the name has one arrow fewer than the cycle has years`, id === 'custom' ? p.slots.length === 0 && !label.includes('→') : label.split(' → ').length === p.slots.length, show([label, p.slots]));
    same(`${id}: carries nothing but a name, crops and a zone`, Object.keys(p).filter(k => !['label', 'slots', 'zone'].includes(k)), []);
  }
  check('every cycle is one to three years long', ROTATIONS.every(([id]) => id === 'custom' || within(PRESETS[id].slots.length, 1, 3)));
  check('every zone is one of the seven, and a zone only orders the list', Object.values(PRESETS).every(p => p.zone === undefined || T.ZONES.includes(p.zone)));
  same('the four "same crop every year" rotations', Object.keys(PRESETS).filter(id => PRESETS[id].slots.length === 1), words('corn-corn soy-soy wheat-wheat rice-rice'));
  // Fallow stores rain for a small grain in a dry place; beside corn it only bares the soil. So the only ready rotation with fallow is wheat.
  same('fallow is only ever paired with a small grain', Object.keys(PRESETS).filter(id => PRESETS[id].slots.includes('fallow')).map(id => [id, PRESETS[id].slots]), [['wheat-fallow', ['wheat', 'fallow']]]);
  // Outside the demo regions nothing is picked for the farmer: a rule that starts every wet place on corn and soybeans is a guess,
  // and it hides tea from Trabzon. So no rotation may carry a mark that makes it the starting choice.
  check('no rotation is marked as a default or a starting choice', !/default|preselect|start(s|ing)? with/i.test(block('export const PRESETS = {').join('\n')));
  same('"Build my own" is the last entry and has no crops and no zone', [PRESETS.custom.label, PRESETS.custom.slots, PRESETS.custom.zone], ['Build my own', [], undefined]);
  same('reading a rotation by id', [T.presetOf('wheat-chickpea')?.slots, T.presetOf('wheat-rice'), T.presetIds().length], [['wheat', 'chickpea'], null, 24]);
});

group('every garden crop has what the garden report needs', () => {
  const TEXTS = words('name garden stays rain soil frost src color');
  const KNOWN = new Set([...TEXTS, ...words('rainOpt rainMin rainMax dry noFrost kill winterKill heat heatSevere ph phAbs steep irrigated humid chill wb summer summerMild maxSummer msTol minMonth minNight needCool maxDryMonths minDry dryA dryB dryS wetMult maxAlt chillSoft chillHard protectable budCold warm')]);
  for (const [id, g] of Object.entries(GARDENS)) {
    same(`${id}: has its name, its place name, the four sentences, its sources and a colour, and no unknown field`, [TEXTS.filter(k => typeof g[k] !== 'string' || !g[k].trim()), Object.keys(g).filter(k => !KNOWN.has(k))], [[], []]);
    check(`${id}: the three full sentences end with a full stop and the frost line names the part that is hurt`, [g.stays, g.rain, g.soil].every(s => /^[A-Z].*\.$/.test(s)) && /^[a-z]/.test(g.frost) && !g.frost.endsWith('.'), show([g.stays, g.rain, g.soil, g.frost]));
    if (id === 'trees') { same('trees: the catch-all entry has no figures at all', [Object.keys(g).sort(), g.src], [[...TEXTS].sort(), 'General guidance']); continue; }
    check(`${id}: sources start with FAO ECOCROP and name at least one more body`, g.src.startsWith('FAO ECOCROP database; ') && g.src.split('; ').length >= 2, g.src);
    // yearly rain, mm: lowest it takes <= best range <= highest it takes; the driest crop (date palms) starts at 100 mm, the wettest ends at 8,000 mm
    check(`${id}: rain limits in order`, within(g.rainMin, 100, 1500) && g.rainMin <= g.rainOpt[0] && g.rainOpt[0] < g.rainOpt[1] && g.rainOpt[1] <= g.rainMax && within(g.rainMax, 500, 8000), show([g.rainMin, g.rainOpt, g.rainMax]));
    // heat stress starts between 29 °C (hops, asparagus) and 40 °C (dates, mango); clear harm, where given, comes later
    check(`${id}: heat limits`, within(g.heat, 29, 40) && (g.heatSevere === undefined || (g.heatSevere > g.heat && g.heatSevere <= 45)), show([g.heat, g.heatSevere]));
    check(`${id}: the best soil pH lies inside the range it takes`, g.ph.length === 2 && g.phAbs.length === 2 && within(g.phAbs[0], 3, 6) && g.phAbs[0] <= g.ph[0] && g.ph[0] < g.ph[1] && g.ph[1] <= g.phAbs[1] && within(g.phAbs[1], 5.5, 9), show([g.ph, g.phAbs]));
    // Frost: a crop any frost kills has no frost figures; every other crop says which frost hurts new growth (0 to -6 °C),
    // and the cold that hurts the resting plant is never milder than that.
    check(`${id}: frost limits fit together`, g.noFrost ? g.kill === undefined && g.winterKill === undefined : within(g.kill, -6, 0) && (g.winterKill === undefined || (g.winterKill <= g.kill && within(g.winterKill, -35, -2))), show([g.noFrost, g.kill, g.winterKill]));
    check(`${id}: a crop any frost kills still has a warmth it needs, so a cool frost-free place does not pass`, !g.noFrost || num(g.summer), show(g.summer));
    check(`${id}: a hottest month, where set, is above the warmth it needs`, g.maxSummer === undefined || g.summer === undefined || g.maxSummer > g.summer, show([g.summer, g.maxSummer]));
  }
  // As with the field crops, these ranges guard a later edit; the exact values are pinned in the line above each.
  const RANGE = {   // °C unless said
    summer: [15, 28], summerMild: [15, 28], maxSummer: [25, 34], msTol: [0.4, 1.5], minMonth: [7, 20], minNight: [3, 12], needCool: [14, 22], warm: [10, 18],
    maxDryMonths: [2, 6], minDry: [1, 6], dryA: [3, 7], dryB: [3, 8],   // months
    dryS: [50, 150], maxAlt: [450, 2000], wetMult: [0.8, 99], kill: [-6, 0], winterKill: [-35, -2], heatSevere: [35, 45],   // mm; m; a multiple of the best rain
  };
  for (const [field, want] of Object.entries(GARDEN_LIMITS)) {
    const got = picked(GARDENS, field), pin = typeof want === 'string' ? flags(want) : want;
    same(`gardens, ${field}: exactly the expected crops and values, and no other crop has one`, sorted(got), sorted(pin));
    if (RANGE[field]) check(`gardens, ${field}: every value is in a sane range for its unit`, Object.values(got).every(v => within(v, ...RANGE[field])), show(got));
  }
  // winter chill hours (0 to 7.2 °C): [what it needs, the high end]; low-chill almonds need 100, hazelnuts up to 1,550
  check('chill hours: need below the high end, both between 100 and 1,600', Object.values(picked(GARDENS, 'chill')).every(c => c.length === 2 && within(c[0], 100, 1500) && c[0] < c[1] && c[1] <= 1600));
  check('the dry-month counts of the wet-tropics crops rise from the 60 mm line to the 100 mm line', Object.values(GARDENS).every(g => (g.dryA === undefined) === (g.dryB === undefined) && !(g.dryA > g.dryB)));
  check('a slack above the hottest month only sits where a hottest month is set', Object.values(GARDENS).every(g => g.msTol === undefined || g.maxSummer !== undefined));
  check('a mild-coast warmth only sits beside the plain warmth, and is lower', Object.values(GARDENS).every(g => g.summerMild === undefined || g.summerMild < g.summer));
  const rows = block('export const GARDENS = {').join('\n');
  same('no limit found by testing real places is folded into a garden row', words('summer summerMild maxSummer msTol minMonth minNight needCool maxDryMonths minDry dryA dryB dryS wetMult maxAlt chillSoft chillHard protectable budCold warm').filter(k => new RegExp(`\\b${k}:`).test(rows)), []);
});

group('the facts that keep a wrong crop out of a wrong place', () => {
  const G = GARDENS, cold = id => G[id].noFrost ? 99 : G[id].winterKill;   // 99: any frost kills it
  // Tea is not an option in Canada. Barrie, Ontario has a normal coldest night of about -19 °C: even hardy tea dies at -12 °C,
  // and tea needs humid air that watering cannot give.
  same('tea: killed at -12 °C at rest, needs a 15.5 °C summer, humid air and at least 1,000 mm', [G.tea.winterKill, G.tea.summer, G.tea.humid, G.tea.rainMin, G.tea.maxDryMonths], [-12, 15.5, true, 1000, 4]);
  check('tea cannot pass a normal Ontario winter (about -19 °C)', G.tea.winterKill > -19);
  // The crops that must never be offered in Barrie: each is killed by any frost or by a winter milder than Barrie's normal coldest night.
  const NOT_BARRIE = words('tea coffee banana citrus olive avocado mango datepalm almond pistachio fig macadamia papaya guava coconut oilpalm cocoa rubber cashew robusta');
  same('every crop on Barrie\'s must-not list dies in a normal Barrie winter', NOT_BARRIE.filter(id => !(cold(id) > -19)), []);
  // ...while the fruit Ontario really grows must come through a cold one-in-ten winter there (about -24 °C).
  check('apples and raspberries take a hard Ontario winter, and strawberries have no winter limit (straw mulch and snow keep the crowns alive)', G.apple.winterKill <= -30 && G.raspberry.winterKill <= -30 && G.strawberry.winterKill === undefined && G.strawberry.noFrost === undefined);
  // No avocados in Iowa, no almonds in Ontario: a country's hectares must never outweigh the climate.
  same('avocado -3 °C (Hass), almond -9 °C (flowers and wood, not the -15 °C of the resting tree)', [G.avocado.winterKill, G.almond.winterKill], [-3, -9]);
  same('citrus -9 °C (mandarins; oranges and lemons are hurt sooner), olive -12 °C, pistachio -13 °C, date palm -7 °C', [G.citrus.winterKill, G.olive.winterKill, G.pistachio.winterKill, G.datepalm.winterKill], [-9, -12, -13, -7]);
  // Stone fruit: the final figure protects wood and buds; blossom frost is a separate risk carried by the bud tables.
  same('stone fruit -24 °C (peach and apricot buds near -20, wood near -25), with bud tables for peach, apricot and sweet cherry', [G.stonefruit.winterKill, G.stonefruit.budCold], [-24, ['peach', 'apricot', 'sweetcherry']]);
  same('grapes -23 °C and marked as buried for winter (Ukraine, Russia); apples -35 °C (Antonovka)', [G.grape.winterKill, G.grape.protectable, G.apple.winterKill], [-23, true, -35]);
  same('the crops any frost kills are the tropical ones', Object.keys(G).filter(id => G[id].noFrost), words('coffee robusta cocoa oilpalm rubber banana cashew coconut pineapple blackpepper cardamom vanilla cinnamon papaya'));
  // Cassava and frost: frost kills cassava, it needs 300 frost-free days, a coolest month of 16 °C, and no field above 1,800 m.
  same('cassava: no frost tolerance, 300 frost-free days, coolest month 16 °C, not above 1,800 m, 500 mm of rain', [CROPS.cassava.frost, CROPS.cassava.ffd, CROPS.cassava.minCool, CROPS.cassava.maxAlt, CROPS.cassava.minRain, CROPS.cassava.minT], [0, 300, 16, 1800, 500, 18]);
  check('every crop with no frost tolerance at all is a warm-season crop (grows only in months of 14 °C or more)', Object.values(CROPS).filter(c => c.frost === 0).every(c => c.minT >= 14));
  // Wheat and barley do not crop in the humid lowland tropics (Tabasco, Veracruz, Belize): every cool-season grain and canola has both
  // limits, and the wet-climate one is never the milder of the two.
  check('each of the nine cool-season crops stops sooner where it is wet than where it is dry', Object.keys(FIELD_LIMITS.maxCoolHumid).length === 9 && Object.keys(FIELD_LIMITS.maxCoolHumid).every(id => CROPS[id].maxCoolHumid < CROPS[id].maxCool));
  // No cotton on the Black Sea coast, no rice in Germany, no sunflowers in central Sweden (hottest month about 17 °C).
  same('cotton needs a 21 °C season, rice 18 °C, sunflowers a hottest month of 18 °C', [CROPS.cotton.minSeason, CROPS.rice.minSeason, CROPS.sunflower.minHot], [21, 18, 18]);
  // Cotton cools its own canopy when watered (upper Sindh grows it at 38 °C): "far too hot" starts at 36 + 7 = 43 °C. Bolls rot without two dry months.
  same('cotton: heat limit 36 °C plus a margin of 7, two dry months to ripen, not above 1,500 m', [CROPS.cotton.heat + CROPS.cotton.heatMargin, CROPS.cotton.needDry, CROPS.cotton.maxAlt], [43, 2, 1500]);
  same('cotton is the only crop with its own heat margin and the only one that needs dry months', [Object.keys(picked(CROPS, 'heatMargin')), Object.keys(picked(CROPS, 'needDry'))], [['cotton'], ['cotton']]);
  // Paddy rice: 575 mm is crop water alone; a flooded field also seeps and puddles, so 1,100 mm, and 1,000 mm of rain without irrigation.
  same('rice needs 1,100 mm in the field, more than any other field crop, and 1,000 mm of yearly rain when it is not watered', [CROPS.rice.water, Object.keys(CROPS).filter(id => id !== 'rice' && CROPS[id].water >= 1100), CROPS.rice.minRain], [1100, [], 1000]);
  // Saskatoon (388 mm a year) grows rain-fed spring wheat on stored soil water: its own floor of 0.52, and only spring wheat has one.
  same('spring wheat alone has its own rain-fed water floor, 0.52', picked(CROPS, 'minRatio'), { swheat: 0.52 });
  // Chickpeas and lentils rot in a monsoon summer but are fine in a dry winter: a wettest-season limit, not a yearly one.
  same('chickpeas and lentils stop at 420 mm of rain in their own season, safflower at 400', [CROPS.chickpea.maxGs, CROPS.lentil.maxGs, CROPS.safflower.maxGs], [420, 420, 400]);
  // A country total must never put finger millet in Alaska: only the main traded crops may count on a country figure alone.
  check('finger millet, teff, quinoa, buckwheat, tomatoes and onions are not "major" crops; potatoes are', words('fmillet teff quinoa buckwheat tomato onion').every(id => !CROPS[id].major) && CROPS.potato.major === true);
  // Proso millet is the millet of the United States, a different plant from pearl and finger millet. Its figures are the printed ones: FAO-56 Tables 11 and 22,
  // FAO Irrigation Water Management Training Manual 3 Table 14 (the top of 450 to 650 mm, for the long 140-day season) and the FAO ECOCROP data sheet of Panicum miliaceum.
  same('proso millet: a grass that fixes no nitrogen, 650 mm, 140 days, roots 1 m, 15 to 45 °C with 20 to 32 °C best, at least 200 mm of rain a year, pH 6 to 6.5 (5 to 8)',
    [CROPS.proso.fam, CROPS.proso.group, CROPS.proso.nfix, CROPS.proso.water, CROPS.proso.days, CROPS.proso.root, CROPS.proso.tMin, CROPS.proso.tOpt, CROPS.proso.tMax, CROPS.proso.minRain, TEST_PH.proso, own(TEST_SAL, 'proso'), CROPS.proso.major],
    ['grass', 'grain', 0, 650, 140, 1, 15, [20, 32], 45, 200, [6, 6.5, 5, 8], false, undefined]);
  same('proso millet is counted under FAO\'s one millet item, and the crop step finds it by "millet" and "proso"', [T.FAO_ALIAS.proso, T.findCrops('millet'), T.findCrops('proso')], ['millet', words('pmillet fmillet proso'), ['proso']]);
  // The names US farmers use (NASS: "Hay, all other", "Snap beans"); the old name stays in the bracket, which is dropped where space is short.
  same('grass hay and snap beans carry the US names, and their short names drop the bracket', [CROPS.ley.name, CROPS.greenbean.name, T.cropName('ley', true), T.cropName('greenbean', true), T.findCrops('hay'), T.findCrops('snap')],
    ['Grass hay (grass-clover ley)', 'Green beans (snap beans)', 'Grass hay', 'Green beans', words('alfalfa ley'), ['greenbean']]);
  // Vegetables, roots, sugar and tobacco can be grown and scored but are never proposed (markets and labour the data cannot see):
  // the engine tells them apart by group, so the groups must be right.
  same('tobacco is "other", tomatoes are vegetables, potatoes are roots, sugar beets are sugar', [CROPS.tobacco.group, CROPS.tomato.group, CROPS.potato.group, CROPS.sugarbeet.group], ['other', 'veg', 'root', 'sugar']);
  same('the groups a new rotation may be drawn from hold 38 crops (16 grains, 12 beans and peas, 7 oil crops, 3 fibre crops)', words('grain legume oil fibre').map(g => T.cropsOfGroup(g).length), [16, 12, 7, 3]);
  // Sclerotinia stem rot: its hosts are no clean break from each other, though they are of three different families.
  same('the 13 hosts of sclerotinia span three families', [Object.keys(picked(CROPS, 'scl')).length, [...new Set(Object.keys(picked(CROPS, 'scl')).map(id => CROPS[id].fam))].sort()], [13, ['brassica', 'composite', 'legume']]);
  // Coconuts, cocoa and oil palm stop growing below about 20 °C: none in Crete or the Nile Delta though no frost falls there.
  same('coconut, cocoa and oil palm need a coolest month of 20 °C; coconuts stay under 450 m ("palms of the coast")', [G.coconut.minMonth, G.cocoa.minMonth, G.oilpalm.minMonth, G.coconut.maxAlt], [20, 20, 20, 450]);
  // Ribeirão Preto is too cold for cocoa and coconut: chilling injury well above freezing.
  same('cocoa and coconut are not offered where a normal year has a night under 12 °C', [G.cocoa.minNight, G.coconut.minNight], [12, 12]);
  // Dates rot in humid air (none on the humid Çukurova coast, 700 mm) and ripen only in a very hot summer.
  same('date palms: at most 500 mm of rain, a 28 °C summer, and they live on irrigation', [G.datepalm.rainMax, G.datepalm.summer, G.datepalm.irrigated], [500, 28, true]);
  // Mango needs a dry season to flower, not a low yearly total: the Konkan coast grows it at 3,000 mm, all-year-wet Riau does not.
  same('mango: three dry months needed, rain up to 4,000 mm', [G.mango.minDry, G.mango.rainMax, G.mango.wetMult], [3, 4000, 99]);
  // Olives and asparagus need a cool rest (none in the equatorial lowlands); olives need a dry summer (not Niigata).
  same('olives: coolest month at most 16 °C, midsummer rain under 105 mm; asparagus 16 °C too', [G.olive.needCool, G.olive.dryS, G.asparagus.needCool], [16, 105, 16]);
  // Apples need real winter cold (none in Florida) and do not crop in the 34 °C summers of the Punjab plain.
  same('apples: 800 chill hours and the hard chill rule, hottest month 28.2 °C', [G.apple.chill, G.apple.chillHard, G.apple.maxSummer, G.apple.msTol], [[800, 1500], true, 28.2, 0.9]);
  check('the cool-summer crops all stop below a 34 °C hottest month', words('apple blueberry raspberry hazelnut hops kiwi').every(id => G[id].maxSummer < 34));
  // Humid-air crops cannot be saved by watering: tea in Fresno or cocoa in a dry place is wrong.
  same('the ten humid-air crops', Object.keys(picked(G, 'humid')), words('tea robusta cocoa oilpalm rubber coconut blackpepper cardamom vanilla cinnamon'));
  // Black pepper keeps ICAR-IISR's rain range: a 2,000 mm floor would rule out Vietnam's Central Highlands.
  same('black pepper: best rain 1,250 to 3,000 mm, lowest 1,000 mm', [G.blackpepper.rainOpt, G.blackpepper.rainMin], [[1250, 3000], 1000]);
  same('macadamia grows down to 10 °C (growth stops there)', G.macadamia.warm, 10);
});

group('spring frost on buds', () => {
  same('six bud tables, with the plain names the frost line says', Object.entries(BUD_COLD_F).map(([id, b]) => [id, b.name, b.stages.length]), [['apple', 'apple', 9], ['pear', 'pear', 8], ['apricot', 'apricot', 8], ['peach', 'peach', 7], ['sweetcherry', 'cherry', 9], ['grape', 'grape', 8]]);
  const stages = Object.values(BUD_COLD_F).flatMap(b => b.stages);
  check('every stage is a name, the °F where 10% of the buds die and the °F where 90% die', stages.every(s => s.length === 3 && typeof s[0] === 'string' && s[0] && within(s[1], 10, 30) && (s[2] === null || within(s[2], -5, 28))), show(stages.filter(s => s.length !== 3)));
  check('harm starts first: the 10% figure is never colder than the 90% figure', stages.every(s => s[2] === null || s[1] > s[2]));
  check('buds get more tender as they open: the 10% figure never falls from one stage to the next', Object.values(BUD_COLD_F).every(b => b.stages.every((s, i) => !i || s[1] >= b.stages[i - 1][1])));
  same('WSU prints no 90% figure for a swollen apricot bud, and none is made up', BUD_COLD_F.apricot.stages[0], ['Swollen bud', 15, null]);
  same('the first and last stages of apple and grape, as printed', [BUD_COLD_F.apple.stages[0], BUD_COLD_F.apple.stages.at(-1), BUD_COLD_F.grape.stages[0], BUD_COLD_F.grape.stages.at(-1)], [['Silver tip', 15, 2], ['Post bloom', 28, 25], ['First swell', 13, -3], ['Fifth leaf', 28, 27]]);
  same('full bloom: apple 28/25, pear 28/24, apricot 27/22, peach 27/24, sweet cherry 28/25', words('apple pear apricot peach sweetcherry').map(id => BUD_COLD_F[id].stages.find(s => s[0] === 'Full bloom').slice(1)), [[28, 25], [28, 24], [27, 22], [27, 24], [28, 25]]);
  same('which gardens get stage numbers', [T.budTables('apple').map(b => b.name), T.budTables('stonefruit').map(b => b.name), T.budTables('grape').map(b => b.name)], [['apple', 'pear'], ['peach', 'apricot', 'cherry'], ['grape']]);
  // There is no plum entry among the gardens, so no plum table is carried; hazelnut, almond, walnut and the rest are not in
  // these tables: they get the forecast only, with no stage numbers.
  same('every other garden gets no stage numbers', Object.keys(GARDENS).filter(id => T.budTables(id).length), words('grape apple stonefruit'));
  check('every bud table a garden names exists', Object.values(GARDENS).every(g => (g.budCold ?? []).every(k => own(BUD_COLD_F, k))));
});

group('what the records call each crop', () => {
  const known = id => T.isCrop(id) || T.isGarden(id);
  same('seven crops are counted under another crop in the country records', T.FAO_ALIAS, { pmillet: 'millet', fmillet: 'millet', proso: 'millet', swheat: 'wheat', durum: 'wheat', scanola: 'canola', robusta: 'coffee' });
  same('seven crops sit only inside a wider item', T.FAO_KIND, { pecan: 'nuts_nec', macadamia: 'nuts_nec', lychee: 'tropfruit_nec', passionfruit: 'tropfruit_nec', pomegranate: 'fruit_nec', guava: 'mango', mung: 'bean' });
  same('teff is counted only in Ethiopia and Eritrea', T.FAO_ONLY, { teff: ['ET', 'ER'] });
  same('every key of these tables is a real crop', [...Object.keys(T.FAO_ALIAS), ...Object.keys(T.FAO_KIND), ...Object.keys(T.FAO_ONLY), ...Object.keys(T.SPAM_OF), ...Object.keys(T.SPAM_KIND)].filter(id => !known(id)), []);
  // One crop, one way of being counted: a crop both under another crop's figure and inside a catch-all would be counted twice.
  same('no crop is both an alias and inside a wider item', Object.keys(T.FAO_ALIAS).filter(id => own(T.FAO_KIND, id)), []);
  same('an alias points at a crop that is counted itself (or at the one millet item)', Object.values(T.FAO_ALIAS).filter(to => to !== 'millet' && (!known(to) || own(T.FAO_ALIAS, to))), []);
  same('no crop is both mapped on its own and only inside a wider group of the crop map', Object.keys(T.SPAM_OF).filter(id => own(T.SPAM_KIND, id)), []);
  check('every crop-map name is four lower-case letters', [...Object.values(T.SPAM_OF), ...Object.values(T.SPAM_KIND)].flat().every(code => /^[a-z]{4}$/.test(code)));
  same('the crop-map names that are known for sure', [T.SPAM_OF.corn, T.SPAM_OF.banana, T.SPAM_KIND.oats, T.SPAM_KIND.olive, T.SPAM_KIND.grape, T.SPAM_KIND.mango], [['maiz'], ['bana', 'plnt'], ['ocer'], ['ooil'], ['temf'], ['trof']]);
  // Spring canola is read from the map's rapeseed layer like canola: Canada's canola is spring-sown, and the map does not tell the two apart.
  same('the crop map tells 40 crops apart on their own and knows 35 more only by their group', [Object.keys(T.SPAM_OF).length, Object.keys(T.SPAM_KIND).length, T.SPAM_OF.scanola, T.SPAM_OF.canola], [40, 35, ['rape'], ['rape']]);
  // Around Trabzon the map shows no "rest of crops" at all, yet hazelnuts are the main crop there:
  // nuts, spices, hops and vegetables other than tomatoes and onions are never judged by the map.
  const unjudged = id => !own(T.SPAM_OF, id) && !own(T.SPAM_KIND, id);
  same('nuts, spices and hops are never judged by the crop map', words('hazelnut almond walnut pistachio cashew pecan macadamia chestnut blackpepper cardamom vanilla cinnamon hops').filter(id => !unjudged(id)), []);
  same('of the vegetables only tomatoes and onions are judged by the crop map', T.cropsOfGroup('veg').filter(id => !unjudged(id)), ['tomato', 'onion']);
  const index = new URL('../data/spam/index.json', import.meta.url);
  if (fs.existsSync(index)) {   // once the crop map is in the folder, its own list of names is the judge
    const names = JSON.parse(fs.readFileSync(index, 'utf8')).crops ?? [];
    same('every crop-map name used here is one the shipped crop map has', [...new Set([...Object.values(T.SPAM_OF), ...Object.values(T.SPAM_KIND)].flat())].filter(code => !names.includes(code)), []);
  } else skipped.push('the crop-map names could not be held against the crop map itself: data/spam/index.json is not in the folder, so all but six of them are checked for shape only');
});

group('every value row names its source, or says plainly that none is on record', () => {
  const cropRows = block('export const CROPS = {');
  same('the crop table is two lines a crop, in the table\'s order', [cropRows.length, FIELD_IDS.filter((id, i) => !cropRows[2 * i]?.startsWith(`  ${id}: {`))], [142, []]);
  const said = line => (line ?? '').split('   // ')[1] ?? '';
  const where = (text, field, printed) => printed.test(text) ? 'printed' : new RegExp(`\\b${field}\\b[^;]*cover-crop guides`).test(text) ? 'guides' : new RegExp(`\\b${field}\\b[^;]*rules? of thumb`).test(text) ? 'rule of thumb' : 'not said';
  FIELD_IDS.forEach((id, i) => {
    const first = said(cropRows[2 * i]), second = said(cropRows[2 * i + 1]), row = cropRows[2 * i + 1], c = CROPS[id];
    // Fallow grows nothing, so no published crop value applies to it: its two lines say so instead of naming a source.
    if (id === 'fallow') { check('fallow: both lines say why nothing is cited', first.startsWith('no crop in the ground: nothing to cite') && second.length > 10, show([first, second])); return; }
    const want = kind => c.type === 'cover' ? 'guides' : kind.includes(id) ? 'printed' : 'rule of thumb';
    // A source may be named only for a crop on the written list, and a crop on the list must name it: a line that says
    // "not in the table" must never pass as naming the table. Rice's water is set on its own line under the table.
    same(`${id}: water, season length and rooting depth each name the table that prints them, or say that none does`,
      [id === 'rice' && first.startsWith('water on its own line under the table;') ? 'own line' : where(first, 'water', /\bwater FAO Manual 3 and FAO-56/), where(first, 'days', /\bdays FAO-56 Table 11/), where(first, 'root', /\broot FAO-56 Table 22/)],
      [id === 'rice' ? 'own line' : want(WATER_PRINTED), want(DAYS_PRINTED), want(ROOT_PRINTED)]);
    check(`${id}: drought tolerance names the FAO yield-response papers or the ECOCROP rain range`, /; drought (FAO 33\/66 Ky and ECOCROP rain|from FAO ECOCROP rain)$/.test(first), first);
    same(`${id}: the second line names ECOCROP for temperatures, FAOSTAT where the row says major, ECOCROP for a yearly rain need, and says that a wet-season limit is Crophalo's own`,
      [second.startsWith('temperatures FAO ECOCROP'), second.includes('; major by FAOSTAT harvested area'), second.includes('; rain limit ECOCROP'), second.includes('; maxGs Crophalo\'s own wet-season disease limit (no publication on record)')],
      [true, / major: true,/.test(row), / minRain: \d/.test(row), / maxGs: \d/.test(row)]);
  });
  same('the header says which values are Crophalo\'s own estimates', [/^\/\/ nfix, heat, frost, minT, ffd, sow and harv are Crophalo's own regional estimates/m.test(CROPS_JS), /^\/\/ om, cover, resid .*Crophalo's own scales/m.test(CROPS_JS)], [true, true]);
  check('every row of pH limits names FAO ECOCROP', block('export const TEST_PH = {').every(line => /\/\/ pH: FAO ECOCROP/.test(line)));
  const saltRows = block('export const TEST_SAL = {').map(line => [[...line.split('   // ')[0].matchAll(/([a-z]+): \[/g)].map(m => m[1]), said(line)]);
  same('every salt limit stands on a line', saltRows.flatMap(([ids]) => ids), Object.keys(TEST_SAL));
  // Rye, canola, safflower, eggplant and triticale are printed in neither FAO table: their lines must say so, and no other line may.
  same('each salt row names Maas & Hoffman and FAO paper 29, FAO-56 Table 23 for durum, or says that no checked table prints it',
    saltRows.map(([ids, text]) => [ids.every(id => SALT_UNPRINTED.includes(id)) ? 'unprinted' : ids.join() === 'durum' ? 'durum' : ids.some(id => SALT_UNPRINTED.includes(id)) ? 'mixed' : 'printed',
      /^salt: printed in neither FAO Irrigation and Drainage Paper 29 rev\. 1 Table 4 nor FAO-56 Table 23; which publication (it rests|they rest) on is not on record$/.test(text) ? 'unprinted' : /^salt: FAO-56 Table 23, .*FAO Irrigation and Drainage Paper 29 rev\. 1 Table 4 prints 5\.7$/.test(text) ? 'durum' : /^salt: Maas & Hoffman 1977; FAO Irrigation and Drainage Paper 29 rev\. 1, Table 4$/.test(text) ? 'printed' : 'not said']).filter(([want, got]) => want !== got), []);
  check('every bud table names Washington State University Extension', block('export const BUD_COLD_F = {').every(line => /\/\/ WSU Extension/.test(line)));
  const gardenRows = block('export const GARDENS = {');
  same('the garden table is four lines a crop', gardenRows.length, 176);
  check('every garden\'s figures name FAO ECOCROP and the bodies in its src', gardenRows.filter(line => /^  [a-z]+: \{/.test(line)).every(line => /\/\/ needs from FAO ECOCROP/.test(line) || line.startsWith('  trees:')));
  same('every garden carries its own source line', gardenRows.filter(line => /^    src: '/.test(line)).length, 44);
  const fixes = CROPS_JS.split('\n').filter(line => line.startsWith('fix('));
  check('every limit found by testing real places is one line with its reason after it', fixes.length >= 120 && fixes.every(line => /\);   \/\/ \S.{14,}$/.test(line)), `${fixes.length} lines; ${show(fixes.filter(line => !/\);   \/\/ \S.{14,}$/.test(line)))}`);
  const keyOf = line => { const m = line.match(/^fix\(\[?'([a-z]+)'.*?\{ ([A-Za-z]+):/); return m ? `${m[2]}:${m[1]}` : line; };   // the line's first field and first crop
  const lineOf = Object.fromEntries(fixes.map(line => [keyOf(line), said(line)]));
  same('every limit line is known by its first field and crop, and no two share them', [Object.keys(lineOf).length, Object.keys(PROOF).filter(key => NO_PLACE.includes(key))], [fixes.length, []]);
  same('every limit line either has its proving place written here or is on the list of lines with none on record', [Object.keys(lineOf).filter(key => !own(PROOF, key) && !NO_PLACE.includes(key)), [...Object.keys(PROOF), ...NO_PLACE].filter(key => !own(lineOf, key))], [[], []]);
  // The place is the proof, so it must stand on the very line of its own limit: a place named on some other line proves nothing.
  same('each proving place is still named on its own limit line', Object.keys(PROOF).flatMap(key => PROOF[key].split('|').filter(place => !(lineOf[key] ?? '').includes(place)).map(place => `${key}: ${place}`)), []);
  const AUTHORITY = words('FAO ECOCROP WSU'), places = [...new Set(Object.values(PROOF).flatMap(p => p.split('|')))].filter(p => !AUTHORITY.includes(p) && !/^(NSW DPI|ICAR-IISR)$/.test(p));
  same('a limit line with no proving place on record names no place at all', NO_PLACE.flatMap(key => places.filter(place => (lineOf[key] ?? '').includes(place)).map(place => `${key}: ${place}`)), []);
  check('each module opens by saying what it is, that it is pure and which suite checks it', [CROPS_JS, PICS_JS, WORDS_JS].every(src => { const head = src.split('\n').slice(0, 5).join('\n'); return /^\/\/ Crop/.test(head) && /Pure|pure/.test(head) && /Checked by scripts\//.test(head); }));
  check('the pure modules touch no page, storage or network', [CROPS_JS, PICS_JS, WORDS_JS].every(src => !/\b(document|window|localStorage|sessionStorage|navigator|fetch|XMLHttpRequest|require)\s*[.(]/.test(src)));
  same('the pure modules import only each other', [...CROPS_JS.matchAll(/from '([^']+)'/g), ...PICS_JS.matchAll(/from '([^']+)'/g)].map(m => m[1]).sort(), ['./crops.js', './words.js', './words.js']);
});

group('names a farmer reads', () => {
  const all = { ...CROPS, ...GARDENS };
  check('every crop has a plain name, and no two crops share one', new Set(Object.values(all).map(e => e.name)).size === 115 && Object.values(all).every(e => e.name.trim() === e.name && e.name.length >= 3));
  same('the everyday name comes first; the bracket holds the other common name, never Latin', Object.keys(all).filter(id => all[id].name.includes('(')).map(id => all[id].name), ['Corn (maize)', 'Sorghum (milo)', 'Rye (grain)', 'Rice (paddy)', 'Peanuts (groundnuts)', 'Canola (rapeseed)', 'Flax (linseed)', 'Grass hay (grass-clover ley)', 'Eggplants (brinjal)', 'Green beans (snap beans)', 'Melons (cantaloupe)', 'Taro (cocoyam)', 'Mustard (for seed)']);
  same('where space is short the bracket is dropped', [T.cropName('corn', true), T.cropName('groundnut', true), T.cropName('mustardseed', true), T.cropName('wheat', true), T.cropName('corn'), T.cropName('tea', true)], ['Corn', 'Peanuts', 'Mustard', 'Winter wheat', 'Corn (maize)', 'Tea']);
  check('no short name keeps a bracket', Object.keys(all).every(id => !/[()]/.test(T.cropName(id, true))));
  check('every rotation has a plain name built from short crop names', Object.values(PRESETS).every(p => typeof p.label === 'string' && p.label.length >= 5 && !/[()]/.test(p.label)));
  same('every garden says what its place is called', [GARDENS.tea.garden, GARDENS.grape.garden, GARDENS.sugarcane.garden, GARDENS.apple.garden, GARDENS.hops.garden], ['tea garden', 'vineyard', 'cane field', 'orchard', 'hop yard']);
  check('every crop has one colour, written as six hex digits, and the table\'s reader gives the same one', Object.keys(all).every(id => /^#[0-9a-f]{6}$/.test(all[id].color) && T.cropColor(id) === all[id].color));
  // One colour per crop everywhere, field crops and gardens alike: two crops of one colour cannot be told apart in the halo.
  // Spring canola is drawn as canola and shares its colour (whether it should have its own is the owner's to say).
  same('spring canola is drawn as canola, so they share a colour; no other two of the 115 crops do', Object.keys(all).filter((id, i, ids) => ids.some((other, j) => j < i && all[other].color === all[id].color)), ['scanola']);
  same('the five "what is this?" explanations', Object.keys(WHAT_IT_DOES), words('nfix cover deep drought fallow'));
  check('each explanation is one short paragraph of plain sentences', Object.values(WHAT_IT_DOES).every(s => /^[A-Z].*\.$/.test(s) && within(s.length, 100, 320) && !/[<>{}]|\n/.test(s)));
  check('fallow is explained honestly: it saves little in a wet climate and the bare soil can blow or wash away', WHAT_IT_DOES.fallow.includes('In a wet climate it saves little') && WHAT_IT_DOES.fallow.includes('blow or wash away'));
  check('cover crops are explained honestly: they drink some water too', WHAT_IT_DOES.cover.endsWith('But they drink some water too.'));
});

group('reading the table for the chooser', () => {
  const groups = T.pickerGroups();
  same('the chooser lists the eleven groups in the agreed order', groups.map(g => g.group), words('grain legume oil fibre root sugar veg other forage cover fallow'));
  same('the chooser holds every field entry exactly once', groups.flatMap(g => g.ids).sort(), Object.keys(CROPS).sort());
  same('how many crops each group holds', groups.map(g => g.ids.length), [16, 12, 7, 3, 5, 1, 17, 1, 2, 6, 1]);
  // A whole word comes before a part of a word, so a grower who types "bean" reads the four beans before soybeans, and one who
  // types "wheat" reads the three wheats before buckwheat (which is no wheat at all).
  same('typing "bean" finds five kinds of beans across the groups, the whole word first', T.findCrops('bean'), words('bean faba mung greenbean soy'));
  same('the search ignores capitals and spaces, and also finds trees and bushes', [T.findCrops('  WHEAT '), T.findCrops('berr'), T.findCrops('maize'), T.findCrops('winter wh')], [words('wheat swheat durum buckwheat'), words('strawberry blueberry raspberry'), ['corn'], ['wheat']]);
  same('one fruit and many are one word: cherry, peach, potato and berries all find their crop', [T.findCrops('cherry'), T.findCrops('peach'), T.findCrops('apricots'), T.findCrops('potato'), T.findCrops('strawberry'), T.findCrops('tomatoes')], [['stonefruit'], ['stonefruit'], ['stonefruit'], words('potato sweetpotato'), ['strawberry'], ['tomato']]);
  same('"pear" finds apples and pears before pearl millet; lemons, mandarins and satsumas find the citrus entry', [T.findCrops('pear'), T.findCrops('lemon'), T.findCrops('mandarin'), T.findCrops('Satsumas')], [words('apple pmillet'), ['citrus'], ['citrus'], ['citrus']]);
  // There is no plum entry among the gardens: a plum grower must not be handed the needs of peaches and cherries as if they were plums'.
  same('"plum" finds nothing', T.findCrops('plum'), []);
  same('an empty search lists everything, a search with no match nothing, and a strange value does no harm', [T.findCrops('').length, T.findCrops('zzz'), T.findCrops(null).length, T.findCrops(undefined).length, T.findCrops('__proto__')], [115, [], 115, 115, []]);
  same('crops by type and by group', [T.cropsOfType('forage'), T.cropsOfGroup('fibre'), T.cropsOfGroup('sugar'), T.cropsOfType('nothing'), T.cropsOfGroup('toString')], [words('alfalfa ley'), words('cotton hemp jute'), ['sugarbeet'], [], []]);
  same('garden ids come in the table\'s order', [T.gardenIds().slice(0, 4), T.gardenIds().at(-1)], [words('tea hazelnut coffee robusta'), 'trees']);
  same('a filter of one\'s own', T.cropIds(c => c.minRain !== undefined), words('rice proso cassava yam jute taro'));
});

group('the pictures', () => {
  const ids = [...Object.keys(CROPS), ...Object.keys(GARDENS)], pics = Object.fromEntries(ids.map(id => [id, P.cropPic(id)]));
  same('every one of the 115 crops has a picture', ids.filter(id => !P.hasPic(id) || !pics[id]), []);
  check('every picture is a 32 × 32 drawing', ids.every(id => pics[id].startsWith('<svg class="pic" viewBox="0 0 32 32" width="32" height="32" ') && pics[id].endsWith('</svg>')));
  // A crop picture is decoration: the word beside it is what a screen reader reads, so it is hidden from one and cannot take focus.
  check('every picture is hidden from screen readers and cannot take focus', ids.every(id => pics[id].includes(' aria-hidden="true"') && pics[id].includes(' focusable="false"') && !pics[id].includes('role=')));
  check('every picture is well-formed: only shapes, each closed', ids.every(id => { const inner = pics[id].replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''); return inner.length > 40 && /^(<(circle|ellipse|path|rect) [^<>]*\/>)+$/.test(inner); }), show(ids.filter(id => !/^(<(circle|ellipse|path|rect) [^<>]*\/>)+$/.test(pics[id].replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')))));
  check('no picture carries a script, a link or an outside file', ids.every(id => !/script|href|url\(|\bon[a-z]+=|<image|<use|style=/i.test(pics[id])));
  check('no picture has a broken number in it', ids.every(id => !/NaN|undefined|null|Infinity/.test(pics[id])), show(ids.filter(id => /NaN|undefined|null|Infinity/.test(pics[id]))));
  same('every picture is drawn in its crop\'s own colour', ids.filter(id => !pics[id].includes(T.cropColor(id))), []);
  same('spring canola is canola, and it is the only crop that shares a picture', ids.filter((id, i) => ids.some((other, j) => j < i && pics[other] === pics[id])), ['scanola']);
  check('sweet corn is corn with paler kernels', pics.sweetcorn !== pics.corn && pics.sweetcorn.replaceAll(T.cropColor('sweetcorn'), 'X').length === pics.corn.replaceAll(T.cropColor('corn'), 'X').length);
  check('the three cover crops of the temperate rotation and the other covers stand on a soil line', words('ryecover vetchmix radish sunnhemp clover mustard').every(id => pics[id].includes('M4 29h24')));
  const named = P.cropPic('tea', { label: 'Tea "leaf" <b>&' });
  check('a picture that stands alone can be named for a screen reader, safely', named.includes('role="img" aria-label="Tea &quot;leaf&quot; &lt;b&gt;&amp;"') && !named.includes('aria-hidden') && !named.includes('<b>'));
  check('a picture can be drawn larger (a garden shows its one picture at 64)', P.cropPic('tea', { size: 64 }).includes('width="64" height="64"') && P.cropPic('tea', { size: '"><x' }).includes('width="32" height="32"'));
  same('how the field gets water: rain only, some watering, full irrigation', [P.WATER_KINDS, P.WATER_KINDS.map(k => P.waterPic(k).startsWith('<svg class="pic"') && P.waterPic(k).includes('aria-hidden="true"')), new Set(P.WATER_KINDS.map(k => P.waterPic(k))).size, P.waterPic('toString'), P.waterPic('flood')], [['none', 'limited', 'full'], [true, true, true], 3, '', '']);
  const lum = hex => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
  // The three soil colours stand for plant matter in the soil: darker soil usually holds more, so the swatches must darken in order.
  check('the three soil colours darken from pale to brown to dark', Object.keys(P.SOIL_COLORS).join() === 'low,med,high' && lum(P.SOIL_COLORS.low) > lum(P.SOIL_COLORS.med) + 100 && lum(P.SOIL_COLORS.med) > lum(P.SOIL_COLORS.high) + 100);
  same('each soil colour has its swatch', [Object.keys(P.SOIL_COLORS).map(k => P.soilPic(k).includes(P.SOIL_COLORS[k])), P.soilPic('constructor')], [[true, true, true], '']);
  // The swatch is a round patch of soil with a few flat crumbs. Curved marks inside a round patch read as a face, and a sad face
  // on the best soil says the wrong thing: so only straight, level marks are drawn on it.
  check('a soil swatch is a round patch with straight, level marks only', Object.keys(P.SOIL_COLORS).every(k => { const d = P.soilPic(k).match(/<path d="([^"]*)"/)?.[1] ?? 'c'; return /^(M[\d.]+ [\d.]+h[\d.]+)+$/.test(d) && P.soilPic(k).split('<circle').length === 2; }));
  same('the three soil colours have their words: Pale, Brown, Dark', [W.SOIL_WORDS, Object.keys(W.SOIL_WORDS ?? {})], [{ low: 'Pale', med: 'Brown', high: 'Dark' }, Object.keys(P.SOIL_COLORS)]);
  // A state must never rest on colour alone: each mark has its own shape and takes the colour of the text around it.
  same('a mark for every status, flag and past-season word', P.MARK_KINDS, words('good watch risk unclear fails borderline risky holds ok close hurt nodata growing'));
  check('every mark has its own shape', new Set(P.MARK_KINDS.map(k => P.markPic(k).replace(/^<svg[^>]*>/, ''))).size === P.MARK_KINDS.length);
  check('no mark carries a colour of its own', P.MARK_KINDS.every(k => !/#[0-9a-f]{3,6}/i.test(P.markPic(k)) && P.markPic(k).includes('currentColor')));
  check('a mark is hidden beside its word and can be named when it stands alone', P.markPic('risk').includes('aria-hidden="true"') && P.markPic('risk', { label: 'Risk' }).includes('role="img" aria-label="Risk"') && P.markPic('__proto__') === '' && P.markPic('danger') === '');
  same('the marks and the words use the same keys', [...Object.keys(W.STATUS_WORDS ?? {}), ...Object.keys(W.FLAG_WORDS ?? {}), ...Object.keys(W.SEASON_WORDS ?? {})], P.MARK_KINDS);
  same('a mark is 16 wide unless told otherwise, and a size that is no size falls back to 16, a crop picture to 32', [P.markPic('risk'), P.markPic('risk', { size: 0 }), P.markPic('risk', { size: 'big' }), P.markPic('risk', { size: -4 }), P.markPic('risk', { size: 24 })].map(s => s.match(/width="(-?[\d.]+)" height="(-?[\d.]+)"/)?.slice(1).join()).concat(P.cropPic('tea', { size: 0 }).match(/width="(\d+)"/)?.[1]), ['16,16', '16,16', '16,16', '16,16', '24,24', '32']);
  const row = P.cropRow(['corn', 'soy', 'wheat']);
  check('the crop row reads "Corn, Soybeans, Winter wheat" in order, with arrows that are decoration', row.indexOf('>Corn<') > 0 && row.indexOf('>Corn<') < row.indexOf('>Soybeans<') && row.indexOf('>Soybeans<') < row.indexOf('>Winter wheat<') && row.split('aria-hidden="true">›</span>').length === 3 && row.startsWith('<span class="croprow" role="list">') && row.split('role="listitem"').length === 4);
  check('a cover crop sits small after the crop it follows', P.cropRow(['corn', 'soy'], ['ryecover']).split('class="croprow-cover"').length === 2 && P.cropRow(['corn', 'soy'], ['ryecover']).indexOf('croprow-cover') < P.cropRow(['corn', 'soy'], ['ryecover']).indexOf('>Soybeans<'));
  // Only a cover crop may sit in the small place after a cash crop: a tree or a cash crop drawn there would be read as a cover crop.
  same('the small place after a crop takes a cover crop only, never tea or wheat', [P.cropRow(['corn'], ['tea']).includes('croprow-cover'), P.cropRow(['corn'], ['wheat']).includes('croprow-cover'), P.cropRow(['corn'], ['fallow']).includes('croprow-cover'), words('ryecover vetchmix radish sunnhemp clover mustard').every(id => P.cropRow(['corn'], [id]).includes('croprow-cover'))], [false, false, false, true]);
  same('the crop row leaves out what is not a crop', [P.cropRow(['toString', '__proto__']), P.cropRow([]), P.cropRow(null), P.cropRow(['corn', 'nothing']).split('role="listitem"').length, P.cropRow(['corn'], ['constructor']).includes('croprow-cover')], ['', '', '', 2, false]);
});

group('the crop-side words of the one vocabulary', () => {
  if (!W.SEASON_WORDS) { check('the crop-side words are in js/words.js or js/words.additions.js', false); return; }
  same('a crop in one past year: Fine, Close call, Hurt, No data, Still growing', W.SEASON_WORDS, { ok: 'Fine', close: 'Close call', hurt: 'Hurt', nodata: 'No data', growing: 'Still growing' });
  same('after "Hurt by": frost, heat, dry weather, a wet season', [W.hurtBy(['frost-flower']), W.hurtBy(['frost-young', 'frost-ripe', 'heat']), W.hurtBy(['water', 'wet']), W.hurtBy('frost-jointing'), W.hurtBy(['heat', 'water', 'frost-young'])], ['Hurt by frost', 'Hurt by frost and heat', 'Hurt by dry weather and a wet season', 'Hurt by frost', 'Hurt by heat, dry weather and frost']);
  same('a cause nobody knows is never printed', [W.hurtBy([]), W.hurtBy(['toString', '__proto__']), W.hurtBy(null), W.hurtBy(['locusts', 'heat'])], ['Hurt', 'Hurt', 'Hurt', 'Hurt by heat']);
  // The word goes with the number a farmer is shown. The score is shown rounded, so 69.5 is shown as 70 and must read "Good fit":
  // "70 · OK fit" would break the rule that 70 and up is a good fit. (This is why 69.9 and 49.9 take the higher word here.)
  same('the score band: 70 and up Good fit, 50 to 69 OK fit, under 50 Poor fit, by the number as shown', [100, 70, 69.9, 69.5, 69.4, 69, 50, 49.9, 49.5, 49.4, 49, 0].map(W.bandWord), ['Good fit', 'Good fit', 'Good fit', 'Good fit', 'OK fit', 'OK fit', 'OK fit', 'OK fit', 'OK fit', 'Poor fit', 'Poor fit', 'Poor fit']);
  same('the number comes first, then the word; "out of 100" is kept for the screen reader', [W.scoreWords(71), W.scoreWords(54), W.scoreWords(12), W.scoreSaid(71)], ['71 · Good fit', '54 · OK fit', '12 · Poor fit', '71 out of 100, Good fit']);
  same('the number shown and its word never disagree at the edges', [W.scoreWords(69.5), W.scoreWords(69.6), W.scoreWords(69.4), W.scoreWords(49.5), W.scoreWords(49.4), W.scoreSaid(69.5), W.scoreSaid(49.5)], ['70 · Good fit', '70 · Good fit', '69 · OK fit', '50 · OK fit', '49 · Poor fit', '70 out of 100, Good fit', '50 out of 100, OK fit']);
  same('every whole score from 0 to 100 reads with the word of its own band', Array.from({ length: 101 }, (_, n) => n).filter(n => W.scoreWords(n) !== `${n} · ${n >= 70 ? 'Good fit' : n >= 50 ? 'OK fit' : 'Poor fit'}`), []);
  // A score that is not a number must never be printed as "NaN · Poor fit": a missing answer is not a poor crop.
  same('what is not a score reads "No data", never a number or a band', [NaN, null, undefined, '71', Infinity, {}].map(v => [W.scoreWords(v), W.scoreSaid(v), W.bandWord(v)]), [NaN, null, undefined, '71', Infinity, {}].map(() => ['No data', 'No data', '']));
  same('the four flags that replace the band word', W.FLAG_WORDS, { fails: "Doesn't suit here", borderline: 'Only just suits', risky: 'Often hurt in past years', holds: 'Holds up' });
  same('tile status: Good, Watch, Risk, Unclear', W.STATUS_WORDS, { good: 'Good', watch: 'Watch', risk: 'Risk', unclear: 'Unclear' });
  same('the six parts of the score, one name each', Object.values(W.PART_WORDS), ['Water fit', 'Soil health', 'Soil wash-off', 'Income', 'Weather safety', 'Pest break']);
  // Three levels of sureness, and the lowest is worded as a good start: "Not very sure" reads as a warning, so it is not used.
  same('sureness has three levels and the lowest is a good start', [Object.values(W.SURE_WORDS), W.SURE_LINES.somewhat], [['Very sure', 'Fairly sure', 'Somewhat sure'], 'Somewhat sure: a few things to confirm']);
  check('no sureness word is a warning', [...Object.values(W.SURE_WORDS), ...Object.values(W.SURE_LINES)].every(s => !/not |un|low|poor/i.test(s)));
  same('every group of the crop table has its chooser word', [T.GROUPS.filter(g => !own(W.GROUP_WORDS, g)), [...new Set(T.GROUPS.map(g => W.GROUP_WORDS[g]))]], [[], ['Grains', 'Beans and peas', 'Oil crops', 'Fibre', 'Roots and tubers', 'Sugar', 'Vegetables', 'Other crops', 'Hay and grazing', 'Rest']]);
  same('the lines said once per sheet', W.SAID_ONCE, { ask: 'Check with farmers near you or your farm adviser before you change anything.', past: 'Past weather, not a forecast', guide: 'A guide, not advice. You decide.' });
  same('one day, two days', [W.plural(1, 'day'), W.plural(2, 'day'), W.plural(0, 'day'), W.plural(1, 'dry month'), W.plural(3, 'bush', 'bushes')], ['1 day', '2 days', '0 days', '1 dry month', '3 bushes']);
  // Counts, never chances: the report says how many of the recorded years, and never turns that into a percentage.
  same('counts over the record', [W.countOf(6, 26), W.countOf(26, 26), W.countOf(0, 26), W.countOf(12, 12, 'run'), W.countOf(3, 51, 'run'), W.countOf(0, 12, 'run'), W.countOf(1, 1)], ['6 of 26 years', 'every year', 'none of the 26 years', 'all 12 runs', '3 of 51 runs', 'none of the 12 runs', 'every year']);
  // With nothing on record there is nothing to count: "none of the 0 years" would read as a clean record.
  same('a count over an empty record reads "No data"', [W.countOf(0, 0), W.countOf(3, 0), W.countOf(0, 0, 'run'), W.countOf(0, NaN), W.countOf(0, -1)], ['No data', 'No data', 'No data', 'No data', 'No data']);
  check('a count never becomes a percentage or a chance', [W.countOf(6, 26), W.countOf(26, 26), W.countOf(0, 26)].every(s => !/%|chance|likely|percent/.test(s)));
  same('lists of years', [W.listOf([2007, 2020, 2021, 2025]), W.listOf([2012, 2020]), W.listOf([2012]), W.listOf([])], ['2007, 2020, 2021 and 2025', '2012 and 2020', '2012', '']);
  same('the bracket is dropped where space is short', [W.shortName('Corn (maize)'), W.shortName('Winter wheat'), W.shortName('Mustard (for seed)'), W.shortName(null)], ['Corn', 'Winter wheat', 'Mustard', '']);
  check('the short name of every crop is the same in the words and in the table', Object.keys(CROPS).every(id => W.shortName(CROPS[id].name) === T.cropName(id, true)));
});

group('nothing risky, nothing untrue in the words', () => {
  const strings = [];
  const gather = v => { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(gather); };
  [CROPS, GARDENS, PRESETS, WHAT_IT_DOES, BUD_COLD_F, W.SEASON_WORDS, W.FLAG_WORDS, W.STATUS_WORDS, W.PART_WORDS, W.SURE_WORDS, W.SURE_LINES, W.GROUP_WORDS, W.SAID_ONCE, W.SOIL_WORDS].forEach(gather);
  // The gathering must reach every table: one known sentence from each stands for it, so an empty or skipped table fails here.
  same('the suite read every sentence a person can be shown', ['Corn (maize)', 'Tea likes plenty of rain all through the year.', 'FAO ECOCROP database; FAO 2002 Date Palm Cultivation', 'Corn → Soybeans → Wheat', EXPLANATIONS.deep, 'Half-inch green', 'Still growing', 'Only just suits', 'Unclear', 'Soil wash-off', 'Somewhat sure: a few things to confirm', 'Roots and tubers', 'A guide, not advice. You decide.', 'Pale'].filter(s => !strings.includes(s)), []);
  // No spray or fertiliser dose anywhere: the farmer reads the product label, and a dose from a world table could do harm.
  const DOSE = /\d\s*(kg|g|mg|l|ml|lb|lbs|oz|gal|litres?|liters?|pints?|quarts?|tonnes?|tons?|t)\s*(\/|per|an?)\s*(ha|hectare|acre|ac|m2|sq)|\b(apply|spray|dress|dose|rate of)\b/i;
  same('no sentence gives a dose, a rate or an order to apply anything', strings.filter(s => DOSE.test(s)), []);
  const PRODUCTS = ['herbi', 'pesti', 'fungi', 'insecti'].map(p => p + 'cide').concat(['glypho' + 'sate', 'ure' + 'a ', 'NPK', 'ammon' + 'ium', 'nitr' + 'ate']);
  same('no file names a spray or fertiliser product', PRODUCTS.filter(p => [CROPS_JS, PICS_JS, WORDS_JS].some(src => src.includes(p))), []);
  same('"fertiliser" is said only where legumes are explained, and there it says "may need less"', strings.filter(s => /fertili[sz]er/i.test(s)), [WHAT_IT_DOES.nfix]);
  // British spellings on screen, one vocabulary: the American forms would give one thing two names.
  const US = ['fertili' + 'zer', 'plo' + 'w ', 'lab' + 'or ', 'neighb' + 'or ', 'advi' + 'sor', 'fib' + 'er', 'col' + 'or '];
  same('no sentence uses an American spelling', strings.filter(s => US.some(w => s.toLowerCase().includes(w))), []);
  const files = { 'js/crops.js': CROPS_JS, 'js/pics.js': PICS_JS, 'js/words (crop side)': WORDS_JS, 'scripts/test_crops.mjs': fs.readFileSync(new URL(import.meta.url), 'utf8') };
  const OLD_NAME = new RegExp('Tur' + 'key', 'i');   // put together from two pieces so that this suite does not trip over its own check
  for (const [name, src] of Object.entries(files)) {
    check(`${name}: the country is written Türkiye`, !OLD_NAME.test(src));
    // The project started on 14 November 2026: no file may carry an earlier day. (The year a cited paper was printed is the paper's own.)
    same(`${name}: no day before the project started`, [...src.matchAll(/\b(19|20)\d\d-\d\d-\d\d\b/g)].map(m => m[0]).filter(day => day < '2026-11-14'), []);
  }
  check('no sentence shown to a farmer calls a result "safe", "guaranteed" or a "forecast" of a crop', strings.every(s => !/\b(safe|guarantee|guaranteed|100%)\b/i.test(s)) && strings.filter(s => /forecast/i.test(s)).every(s => s === 'Past weather, not a forecast'));
  check('the table says it is a rule of thumb for whole regions, not local advice', CROPS_JS.split('\n').slice(0, 5).join(' ').includes('Rule-of-thumb values for whole regions, NOT local recommendations'));
});

for (const what of skipped) console.log(`SKIPPED  ${what}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
