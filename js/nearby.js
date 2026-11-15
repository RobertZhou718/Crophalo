// What farmers grow around the field, from the crop-map lookup (scripts/live/cropsnear.py), turned into the two things the report
// engine takes (js/engine.js optionsFor, spot.absent and spot.common) and the plain lines that go with them.
// Pure: no page, no network, no clock. Checked by scripts/test_cropsnear.mjs.
//
/*
 * gateFrom(answer) -> { read: true|false, absent: [cropId] | undefined, common: { cropId: bonus } | undefined, bands: { cropId: 0..4 | null },
 * water: true|false, pin: { code, name } | null, notField: { code, name, word, source, year, text } | null, nearby: { source: 'aci'|'cdl'|null, line: text|null, left: text|null, gap: text|null } }
 * answer  the lookup's JSON: { ok, source, year, country, box, cropland_ha, crops: [{ crop, share, ha }], wider: [{ crops, share, ha }], classes, pin }
 * or { ok: false, reason }. A failed or missing answer leaves the gate open (absent and common undefined) and says so in gap.
 * The rules (the local bands of the crop-statistics rules, read here from the national 30 m crop maps instead of a 10 km grid):
 * under 2,000 ha of farmland in the box, the map says too little and nothing is left out;
 * a crop is judged by its own class AND every wider class that may hold it ("Pasture/forages" may hold alfalfa, "Other crops" any crop):
 * under 1 ha in all of them → band 0, under 250 ha → band 1; both are never newly suggested (absent);
 * else its own share of the farmland: 15 in 100 or more → 4 (a main crop), 3 in 100 or more → 3 (common), 250 ha or more → 2 (grown),
 * and null when only a wider class holds 250 ha or more (present, but the map cannot say how much of it is this crop);
 * the ranking bonus of a crop with band 2 or more is min(0.15, 0.04 × log10(share × 10,000)).
 * Only field crops are judged (grain, legume, oil and fibre crops, and alfalfa): vegetables, fruit and the rest are never judged by
 * the map, so they are neither left out nor ranked up here.
 */
import { cropOf, cropName, cropIds } from './crops.js';
import { WATER_WORDS } from './words.js';

export const FLOOR_HA = 2000, LITTLE_HA = 250, SOME_HA = 100, MAIN = 0.15, COMMON = 0.03;
// SOME_HA: a crop on 100 ha or more in the box is grown nearby, only on less land than the usual line. Where the rule above leaves too few other rotations to compare,
// the engine may offer such a crop, then a crop the map sees at all, then a crop the country's own list holds, and says so on that strategy (js/engine.js, relax).
// The class at the pin itself (the answer's "pin"): a farm field's own pixel is never water. AAFC class 20 is Water; USDA's Cropland
// Data Layer writes water as 111 Open Water (83 Water in its oldest years). A pin on water gets no plans at all (js/engine.js).
export const WATER = Object.freeze({ CA: Object.freeze([20]), US: Object.freeze([83, 111]) });
export { WATER_WORDS };
const isWater = answer => Number.isInteger(answer?.pin?.code) && (WATER[answer.country] ?? []).includes(answer.pin.code);
// The class at the pin when it is NOT farmland: by the map's own class names (scripts/live/cdl_codes.json, aci_classes.json). Water is the hard refusal above;
// these ask the farmer first. Pasture and hay classes, fallow, greenhouses and "too wet to be seeded" are farmland and are not here. Developed land, wetland,
// forest, shrubland, barren land, ice and snow, and natural grassland (Canada's "Grassland", not its "Pasture/forages") are not.
const word = (list, w) => Object.fromEntries(list.map(code => [code, w]));
export const NOT_FIELD = Object.freeze({
  US: Object.freeze({ ...word([63, 141, 142, 143], 'forest'), ...word([64, 152], 'shrubland'), ...word([65, 131], 'barren land'), ...word([82, 121, 122, 123, 124], 'developed land'),
    ...word([87, 190, 195], 'wetland'), ...word([112], 'ice or snow'), ...word([88], 'land that is not farmland') }),
  CA: Object.freeze({ ...word([200, 210, 220, 230], 'forest'), ...word([50], 'shrubland'), ...word([30], 'barren land'), ...word([34], 'developed land'), ...word([80, 85], 'wetland'),
    ...word([60], 'burnt land'), ...word([110], 'natural grassland') }),
});
const WHO = { US: 'USDA crop map', CA: 'Canadian crop map (Agriculture and Agri-Food Canada)' };
// What the map shows at the pin when it is not a field: { code, name, word, source, year, text } or null. text is the sentence the report shows.
export function notField(answer) {
  const code = answer?.pin?.code, kind = NOT_FIELD[answer?.country];
  if (!answer || answer.ok !== true || !Number.isInteger(code) || !kind || !Object.hasOwn(kind, code) || isWater(answer)) return null;
  const year = String(answer.year ?? answer.data_date ?? '').trim(), w = kind[code];
  return { code, name: typeof answer.pin.name === 'string' ? answer.pin.name : '', word: w, source: KEYS[answer.country], year,
    text: `The ${WHO[answer.country]}${year ? ` of ${year}` : ''} shows ${w} at this place, not a field.` };
}
// The farmer's own word that it is a field, kept with the place: { lat, lon, code, word } or null. It counts only for the same pin and the same class,
// so moving the pin, or a new map year that reads another class, asks again.
export const fieldWord = (loc, nf) => nf && Number.isFinite(loc?.lat) && Number.isFinite(loc?.lon) ? { lat: Math.round(loc.lat * 1e4) / 1e4, lon: Math.round(loc.lon * 1e4) / 1e4, code: nf.code, word: nf.word } : null;
export const fieldWordFor = (loc, ok) => !!ok && Number.isFinite(loc?.lat) && Number.isFinite(loc?.lon) && Math.round(loc.lat * 1e4) / 1e4 === ok.lat && Math.round(loc.lon * 1e4) / 1e4 === ok.lon && Number.isInteger(ok.code) ? ok.code : null;
const JUDGED = new Set(['grain', 'legume', 'oil', 'fibre']);
export const judgedIds = () => cropIds((crop, id) => (crop.type === 'cash' && JUDGED.has(crop.group)) || id === 'alfalfa');
const fin = Number.isFinite;
const KEYS = { CA: 'aci', US: 'cdl' }, MAPS = { aci: 'AAFC Annual Crop Inventory', cdl: 'USDA Cropland Data Layer' };
const per100 = share => { const v = Math.round(share * 100); return v >= 1 ? String(v) : 'under 1'; };
const ha = v => Math.round(v).toLocaleString('en-US');
const list = items => items.length < 2 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const low = id => cropName(id, true).toLowerCase();
const CLASS_WORDS = { 'Pasture/forages': 'pasture and hay', 'Other Hay/Non Alfalfa': 'hay other than alfalfa', 'Canola/rapeseed': 'canola and rapeseed' };

export function bonusOf(share) { return fin(share) && share > 0 ? Math.max(0, Math.min(0.15, 0.04 * Math.log10(share * 1e4))) : 0; }

function open(reason) {
  const gap = `What farmers grow around here could not be read${reason ? ` (${String(reason).replace(/[.\s]+$/, '')})` : ''}, so no crop was checked against local practice.`;
  return { read: false, absent: undefined, common: undefined, bands: {}, water: false, pin: null, nearby: { source: null, line: null, left: null, gap } };
}

export function gateFrom(answer) {
  if (!answer || typeof answer !== 'object') return open('');
  if (answer.ok !== true) return open(typeof answer.reason === 'string' ? answer.reason : '');
  const key = KEYS[answer.country] ?? null, farm = answer.cropland_ha, box = answer.box;
  if (!key || !fin(farm) || !box || !Array.isArray(answer.crops) || !Array.isArray(answer.wider)) return open('the crop map sent an answer Crophalo could not read');
  const pin = Number.isInteger(answer.pin?.code) ? { code: answer.pin.code, name: typeof answer.pin.name === 'string' ? answer.pin.name : '' } : null;   // null: the pin's own class was not read
  if (isWater(answer)) return { read: false, absent: undefined, common: undefined, bands: {}, water: true, pin, nearby: { source: key, line: null, left: null, gap: WATER_WORDS } };
  const year = String(answer.year ?? answer.data_date ?? '');
  const ns = Math.round((box.north - box.south) * 111.2), ew = Math.round((box.east - box.west) * 111.32 * Math.cos((box.north + box.south) / 2 * Math.PI / 180));
  const where = `a box about ${ns} km north to south and ${ew} km east to west around the field (${MAPS[key]} ${year})`;
  if (farm < FLOOR_HA) return { read: false, absent: undefined, common: undefined, bands: {}, water: false, pin, notField: notField(answer), nearby: { source: key, line: null, left: null, gap: `The crop map shows only ${ha(farm)} ha of farmland in ${where}, too little to say what is grown here, so no crop was left out for it.` } };
  const own = new Map(answer.crops.filter(c => c && typeof c.crop === 'string' && fin(c.ha) && fin(c.share)).map(c => [c.crop, c]));
  const widerHa = id => answer.wider.filter(w => Array.isArray(w.crops) && (w.crops.includes(id) || w.crops.includes('*')) && fin(w.ha)).reduce((s, w) => s + w.ha, 0);
  const bands = {}, common = {}, absent = [], some = {}, seen = {};
  for (const id of judgedIds()) {
    const mine = own.get(id), any = (mine?.ha ?? 0) + widerHa(id);
    let band;
    if (any < 1) band = 0;
    else if (any < LITTLE_HA) band = 1;
    else if (mine && mine.share >= MAIN) band = 4;
    else if (mine && mine.share >= COMMON) band = 3;
    else if (mine && mine.ha >= LITTLE_HA) band = 2;
    else band = null;
    bands[id] = band;
    if (band === 0 || band === 1) absent.push(id);
    if (band === 1) (any >= SOME_HA ? some : seen)[id] = mine && mine.ha >= 1 ? Math.round(mine.ha * 10) / 10 : null;   // its own class's hectares; null when only a wider class may hold it
    else if (band >= 2) common[id] = Math.round(bonusOf(mine.share) * 1000) / 1000;
  }
  const top = (Array.isArray(answer.classes) ? answer.classes : []).filter(c => fin(c.share) && c.share > 0 && typeof c.name === 'string').slice(0, 4).map(c => {
    const one = c.kind === 'own' && Array.isArray(c.crops) && c.crops.length === 1 && cropOf(c.crops[0]);   // a class of one crop reads as that crop's name
    return `${one ? low(c.crops[0]) : (CLASS_WORDS[c.name] ?? c.name.toLowerCase())} ${per100(c.share)}`;
  });
  const line = `Farmland in ${where}: ${ha(farm)} ha, of which every 100 ha hold about ${list(top)}.`;
  const left = absent.length ? `Crops with under ${LITTLE_HA} ha in that box are not suggested here (${absent.length} field crops, among them ${list(absent.filter(id => cropOf(id)).slice(0, 3).map(low))}).` : null;
  const shares = {}; for (const id of judgedIds()) { const mine = own.get(id); if (mine) shares[id] = Math.round(mine.share * 10000) / 10000; }   // each judged crop's own share of the farmland in the box: the market signal of js/compare.js
  const relax = [{ step: 'some', crops: some }, { step: 'seen', crops: seen }].filter(t => Object.keys(t.crops).length);
  return { read: true, absent, common, bands, relax, water: false, pin, notField: notField(answer), nearby: { source: key, line, left, gap: null }, market: { source: key, year: /^\d{4}$/.test(year) ? +year : null, shares } };
}

// ---- the national lists: where the crop map cannot read the place (no map outside Canada and the United States, a box with under 2,000 ha of
// farmland, a lookup that failed), the crops a country does not grow are still left out. The figures are FAOSTAT's harvested areas (scripts/live/faostat.py:
// the mean of FAO's three newest years, in hectares per crop per country). A crop with under FAO_MIN_HA harvested in the whole country is never suggested there.
// FAO_MIN_HA: a crop counts as grown in a country when FAO reports at least this many hectares of it harvested in the whole country (mean of FAO's three newest years).
// It is Crophalo's own caution (the same floor faostat.py uses before it calls a national yield real), not a threshold FAO or anyone else publishes.
export const FAO_MIN_HA = 1000;
// Crophalo crop -> the FAOSTAT item its area is read from. FAO has one item "Millet" (pearl, finger and proso together), no item for teff
// ("Cereals n.e.c." holds it), none for durum or spring wheat apart from "Wheat", none for mung beans apart from "Beans, dry", and none for alfalfa:
// alfalfa is never judged by country.
const FAO_KEY = Object.freeze({ corn: 'corn', wheat: 'wheat', swheat: 'wheat', durum: 'wheat', barley: 'barley', sorghum: 'sorghum', oats: 'oats', rye: 'rye', rice: 'rice',
  pmillet: 'millet', proso: 'millet', quinoa: 'quinoa', soy: 'soy', chickpea: 'chickpea', lentil: 'lentil', pea: 'pea', bean: 'bean', mung: 'bean', faba: 'faba', cowpea: 'cowpea',
  groundnut: 'groundnut', pigeonpea: 'pigeonpea', sunflower: 'sunflower', canola: 'canola', scanola: 'canola', sesame: 'sesame', safflower: 'safflower', flax: 'flax',
  cotton: 'cotton', hemp: 'hemp', jute: 'jute', buckwheat: 'buckwheat', triticale: 'triticale', lupin: 'lupin', bambara: 'bambara', mustardseed: 'mustardseed' });
// The two crops FAO does not list on their own are allowed only where a published crop page says they are grown, and where FAO shows the item that holds them:
// finger millet in Africa and South Asia (Crop Trust crop page "Finger millet": https://www.croptrust.org/knowledge-hub/crops/finger-millet/ ; FAO Plant Production and Protection
// Paper, https://www.fao.org/4/W1808e/w1808e0c.htm), here sub-Saharan Africa and Southern Asia, where FAO shows "Millet"; teff in Ethiopia (FAO AGRIS record
// "Empirical review on the use dynamics and economics of teff in Ethiopia", https://agris.fao.org/search/en/records/65de52344c5aef494fdbaec5: Ethiopia grows nearly all of the world's teff),
// where FAO shows "Cereals n.e.c.". Eritrea is left out: no published figure was found for it. ISO 3166 alpha-2 codes.
const FINGER_MILLET = new Set(['AO', 'BI', 'BJ', 'BW', 'CD', 'CF', 'CG', 'CI', 'CM', 'ET', 'ER', 'GH', 'GN', 'KE', 'LS', 'LR', 'MG', 'ML', 'MW', 'MZ', 'NA', 'NE', 'NG', 'RW', 'SD', 'SL', 'SN', 'SS', 'SZ', 'TD', 'TG', 'TZ', 'UG', 'ZA', 'ZM', 'ZW', 'IN', 'NP', 'LK', 'BD', 'PK', 'BT', 'AF']);
const TEFF = new Set(['ET']);
// Mung beans: FAO counts them inside "Beans, dry", so a country that grows dry beans would pass; they are offered only in the countries a published page names as growing them
// (Agriculture & Food Security 2021, "Mungbean in Southeast Asia and East Africa": https://agricultureandfoodsecurity.biomedcentral.com/articles/10.1186/s40066-020-00273-7 ;
// World Vegetable Center, "Beans without borders": https://avrdc.org/?p=14075): South and Southeast Asia, China, Kenya and its East African neighbours, Australia.
const MUNG = new Set(['IN', 'CN', 'MM', 'TH', 'ID', 'PK', 'BD', 'LK', 'VN', 'PH', 'KH', 'LA', 'NP', 'AF', 'KE', 'TZ', 'UG', 'ET', 'MZ', 'RW', 'BI', 'AU']);
const FAO_MIN_CROPS = 3;   // a country row that shows fewer than three field crops is a gap in FAO's files, not a country that grows nothing: the gate stays open
export function countryGate(faostat, cc) {
  const code = String(cc ?? '').trim().toUpperCase();
  const row = faostat?.ok === true && faostat.countries && Object.hasOwn(faostat.countries, code) ? faostat.countries[code] : null;
  if (!row || !row.area || typeof row.area !== 'object') return null;
  const area = key => (fin(row.area[key]) && row.area[key] > 0 ? row.area[key] : 0);
  const grows = id => {
    if (id === 'fmillet') return FINGER_MILLET.has(code) && area('millet') >= FAO_MIN_HA;
    if (id === 'teff') return TEFF.has(code) && area('cereals_nec') >= FAO_MIN_HA;
    if (id === 'mung') return MUNG.has(code) && area('bean') >= FAO_MIN_HA;
    return Object.hasOwn(FAO_KEY, id) ? area(FAO_KEY[id]) >= FAO_MIN_HA : true;   // alfalfa and any crop FAO has no item for: not judged
  };
  if (new Set(Object.values(FAO_KEY).filter(key => area(key) >= FAO_MIN_HA)).size < FAO_MIN_CROPS) return null;
  const ids = judgedIds(), absent = ids.filter(id => !grows(id));
  const years = String(faostat.data_date ?? '').replace('/', ' to ');
  const main = ['corn', 'wheat', 'barley', 'sorghum', 'oats', 'rye', 'rice', 'soy', 'sunflower', 'canola', 'cotton'].filter(id => ids.includes(id)).sort((a, b) => area(FAO_KEY[b]) - area(FAO_KEY[a])).slice(0, 3).filter(id => area(FAO_KEY[id]) >= FAO_MIN_HA).map(low);
  const name = typeof row.name === 'string' && row.name ? row.name : code;
  const line = main.length ? `The crop map cannot read this place, so the figures for the whole country are used. Field crops harvested most in ${name}: ${list(main)} (FAOSTAT${years ? `, ${years}` : ''}).` : null;
  return { absent, common: {}, name, nearby: { source: 'fao', line, left: absent.length ? notOffered(name, absent) : null, gap: null } };
}
const notOffered = (name, ids, more = '') => `Not offered here: ${name} does not report growing ${ids.length}${more} field crops on ${ha(FAO_MIN_HA)} ha or more for harvest, among them ${list(ids.filter(id => cropOf(id)).slice(0, 3).map(low))} (FAOSTAT).`;

// The spot fields optionsFor reads, ready to spread into the spot: { ...spot, ...spotFields(answer, faostat, cc) }. A pin on water adds water: true.
// A read answer also carries market: { source, year, shares: { cropId: share of the farmland } }, how common each crop is around the field (the national lists give none).
// faostat (the FAOSTAT lookup's answer) and cc are optional: given, the national lists take over wherever the crop map says nothing, and decide the crops the map
// can only place in a wide class (see countryGate). A crop the map names by its own class is never left out by the national list.
export function spotFields(answer, faostat = null, cc = '') {
  const g = gateFrom(answer);
  if (g.water) return { water: true, nearby: g.nearby };
  const nf = notField(answer), ask = nf ? { notField: nf } : {};
  if (g.read) {
    // The map reads the place. A crop the map names by its own class (250 ha or more) is grown here and stays; a crop only a wide class ("Other crops", "Other small
    // grains") could hold, with no class of its own, is no proof: there the country's list decides. A crop the map itself calls absent stays absent.
    const nat = faostat ? countryGate(faostat, answer.country) : null, more = nat ? nat.absent.filter(id => g.bands[id] === null) : [];
    // the last step of the relaxing: a crop the map does not see here at all, but the country's own list holds
    const held = nat ? g.absent.filter(id => g.bands[id] === 0 && !nat.absent.includes(id)) : [];
    const relax = held.length ? [...g.relax, { step: 'country', name: nat.name, crops: Object.fromEntries(held.map(id => [id, null])) }] : g.relax;
    if (!more.length) return { ...ask, absent: g.absent, common: g.common, relax, nearby: g.nearby, market: g.market };
    return { ...ask, absent: [...g.absent, ...more], common: g.common, relax, nearby: { ...g.nearby, left: [g.nearby.left, notOffered(nat.name, more, ' more')].filter(Boolean).join(' '), source: g.nearby.source }, market: g.market };
  }
  const nat = countryGate(faostat, KEYS[answer?.country] ? answer.country : cc);
  if (nat) return { ...ask, absent: nat.absent, common: nat.common, nearby: nat.nearby };
  // FAOSTAT was asked and has no usable row for this country: say that nothing could check the nearby crops
  return faostat ? { ...ask, nearby: { ...g.nearby, gap: `${String(g.nearby.gap ?? '').replace(/\s+$/, '')} The national crop figures could not check it either, so nearby crops could not be checked.`.trim() } } : { ...ask, nearby: g.nearby };
}
