// What farmers grow around the field, from the crop-map lookup (scripts/live/cropsnear.py), turned into the two things the report
// engine takes (js/engine.js optionsFor, spot.absent and spot.common) and the plain lines that go with them.
// Pure: no page, no network, no clock. Checked by scripts/test_cropsnear.mjs.
//
/*
 * gateFrom(answer) -> { read: true|false, absent: [cropId] | undefined, common: { cropId: bonus } | undefined, bands: { cropId: 0..4 | null },
 * nearby: { source: 'aci'|'cdl'|null, line: text|null, left: text|null, gap: text|null } }
 * answer  the lookup's JSON: { ok, source, year, country, box, cropland_ha, crops: [{ crop, share, ha }], wider: [{ crops, share, ha }], classes }
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

export const FLOOR_HA = 2000, LITTLE_HA = 250, MAIN = 0.15, COMMON = 0.03;
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
  return { read: false, absent: undefined, common: undefined, bands: {}, nearby: { source: null, line: null, left: null, gap } };
}

export function gateFrom(answer) {
  if (!answer || typeof answer !== 'object') return open('');
  if (answer.ok !== true) return open(typeof answer.reason === 'string' ? answer.reason : '');
  const key = KEYS[answer.country] ?? null, farm = answer.cropland_ha, box = answer.box;
  if (!key || !fin(farm) || !box || !Array.isArray(answer.crops) || !Array.isArray(answer.wider)) return open('the crop map sent an answer Crophalo could not read');
  const year = String(answer.year ?? answer.data_date ?? '');
  const ns = Math.round((box.north - box.south) * 111.2), ew = Math.round((box.east - box.west) * 111.32 * Math.cos((box.north + box.south) / 2 * Math.PI / 180));
  const where = `a box about ${ns} km north to south and ${ew} km east to west around the field (${MAPS[key]} ${year})`;
  if (farm < FLOOR_HA) return { read: false, absent: undefined, common: undefined, bands: {}, nearby: { source: key, line: null, left: null, gap: `The crop map shows only ${ha(farm)} ha of farmland in ${where}, too little to say what is grown here, so no crop was left out for it.` } };
  const own = new Map(answer.crops.filter(c => c && typeof c.crop === 'string' && fin(c.ha) && fin(c.share)).map(c => [c.crop, c]));
  const widerHa = id => answer.wider.filter(w => Array.isArray(w.crops) && (w.crops.includes(id) || w.crops.includes('*')) && fin(w.ha)).reduce((s, w) => s + w.ha, 0);
  const bands = {}, common = {}, absent = [];
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
    else if (band >= 2) common[id] = Math.round(bonusOf(mine.share) * 1000) / 1000;
  }
  const top = (Array.isArray(answer.classes) ? answer.classes : []).filter(c => fin(c.share) && c.share > 0 && typeof c.name === 'string').slice(0, 4).map(c => {
    const one = c.kind === 'own' && Array.isArray(c.crops) && c.crops.length === 1 && cropOf(c.crops[0]);   // a class of one crop reads as that crop's name
    return `${one ? low(c.crops[0]) : (CLASS_WORDS[c.name] ?? c.name.toLowerCase())} ${per100(c.share)}`;
  });
  const line = `Farmland in ${where}: ${ha(farm)} ha, of which every 100 ha hold about ${list(top)}.`;
  const left = absent.length ? `Crops with under ${LITTLE_HA} ha in that box are not suggested here (${absent.length} field crops, among them ${list(absent.filter(id => cropOf(id)).slice(0, 3).map(low))}).` : null;
  return { read: true, absent, common, bands, nearby: { source: key, line, left, gap: null } };
}

// The spot fields optionsFor reads, ready to spread into the spot: { ...spot, ...spotFields(answer) }.
export function spotFields(answer) {
  const g = gateFrom(answer);
  return g.read ? { absent: g.absent, common: g.common, nearby: g.nearby } : { nearby: g.nearby };
}
