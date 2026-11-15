// Crophalo's crop seasons: when a crop is sown, when it flowers and when it is ready, on the field's own normal year, and
// whether the next crop of the rotation, or a second crop in the same year, still has time after a harvest.
// Pure: no page, no storage, no network and no clock. The normal year is built from the climate object of js/climate.js.
// Maize heat units: Neild & Newman, National Corn Handbook NCH-40. Checked by scripts/test_season.mjs.
/*
 * Season lengths: FAO Irrigation and Drainage Paper 56 (Allen et al. 1998), Table 11 "Lengths of crop development stages":
 * initial, development, mid-season and late stage, in days. FAO says they are a general guide and local observations are better.
 * Heat at flowering: Luo Q. (2011) Temperature thresholds and crop production: a review. Climatic Change 109:583–598.
 *
 * Days are counted on a normal year of 365 days. A day number (doy) counts from 1 January of the year a crop is sown, so a
 * harvest in the next summer has a number over 365. A month the weather record could not read stays unknown (NaN), never 0.
 */
import { own } from './words.js';
import { cropOf, cropName } from './crops.js';
import { hotDaysAt, gddDay, gapWords, keyToDoy, SOUTH_SHIFT } from './climate.js';

const fin = Number.isFinite;
const lock = thing => { if (thing && typeof thing === 'object' && !Object.isFrozen(thing)) { Object.freeze(thing); Object.values(thing).forEach(lock); } return thing; };
export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const BEFORE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const MID = MONTH_DAYS.map((d, m) => BEFORE[m] + (d + 1) / 2);   // the middle day of each month
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---- the stage table: [initial, development, mid-season, late] days, short / medium / long rows (null where FAO-56 gives none)
// sp: spring or summer sowing (and the rains in the tropics); au: autumn sowing. fl: where flowering sits (mid = start of mid-season;
// end = 10 days before the end of mid-season, small grains and rice; null = grown for roots, leaves or bulbs, no flowering check).
// tc: daily high, °C, at which flowering fails (Luo 2011). tb: base temperature for heat units. sow: normal daily mean, °C,
// at which spring sowing starts (FAO-56: maize 13 °C, spring cereals 5 °C; other crops their own lowest growing temperature minT).
const SMALL_GRAIN = { sp: [[40, 30, 40, 20], [20, 25, 60, 30], [15, 30, 65, 40]], au: [[15, 25, 50, 30], [20, 50, 60, 30], [40, 60, 60, 40]], fl: 'end', tc: 35, tb: 0, sow: 5 };   // FAO-56 spring cereals and barley/oats rows
const WINTER_WHEAT = { au: [[15, 25, 50, 30], [20, 60, 70, 30], [30, 140, 40, 30]], fl: 'end', tc: 35, tb: 0 };   // Winter wheat: 120 (Central India), 180 (East Africa, Mediterranean), 240 (frozen soils, Idaho and Central Europe)
export const SEASON = lock({
  corn: { sp: [[20, 35, 40, 30], [30, 40, 50, 30], [30, 50, 60, 40]], fl: 'mid', tc: 35, tb: 10, sow: 13 },   // Maize (grain): 125 (June, Nigeria; October, India), 150 (April, Spain and California), 180 (April, East African highlands)
  sweetcorn: { sp: [[20, 20, 30, 10], [20, 30, 30, 10], [20, 40, 70, 10]], fl: 'mid', tc: 35, tb: 10, sow: 13 },   // Sweet maize: 80 (Philippines), 90 (Mediterranean), 140 (Idaho)
  wheat: WINTER_WHEAT, triticale: WINTER_WHEAT,
  barley: SMALL_GRAIN, swheat: SMALL_GRAIN, oats: SMALL_GRAIN, durum: SMALL_GRAIN,
  rye: { au: [null, [25, 35, 65, 40], null], fl: 'end', tc: 35, tb: 0 },   // Rye: the one FAO-56 row, 165 days
  sorghum: { sp: [[20, 35, 40, 30], null, [20, 35, 45, 30]], fl: 'mid', tc: 40, tb: 8 },   // Sorghum (grain): 125 (May–June, USA, Pakistan), 130 (March, arid region)
  rice: { sp: [null, [30, 30, 60, 30], [30, 30, 80, 40]], fl: 'end', tc: 37, tb: 8 },   // Rice: 150 (Dec, May; Tropics, Mediterranean), 180 (May, Tropics); 37 °C on the daily high, flowers open in the late morning
  pmillet: { sp: [[15, 25, 40, 25], null, [20, 30, 55, 35]], fl: 'mid' }, fmillet: { sp: [[15, 25, 40, 25], null, [20, 30, 55, 35]], fl: 'mid' }, proso: { sp: [[15, 25, 40, 25], null, [20, 30, 55, 35]], fl: 'mid' },   // Millet: 105 (June, Pakistan), 140 (April, Central USA)
  soy: { sp: [[15, 15, 40, 15], [20, 35, 60, 25], [20, 25, 75, 30]], fl: 'mid', tc: 38, tb: 6, rowSow: 5 },   // Soybeans: 85 (December, Tropics), 140 (May, Central USA), 150 (May–June, Japan); rowSow: the month of the middle row, May
  lentil: { sp: [null, [20, 30, 60, 40], null], au: [null, [25, 35, 70, 40], null], fl: 'mid' },   // Lentil: 150 (April, Europe), 170 (October–November, Arid region)
  pea: { sp: [[15, 25, 35, 15], [20, 30, 35, 15], [35, 25, 30, 20]], fl: 'mid' },   // Peas, fresh: 90 (May, Europe), 100 (March, Mediterranean), 110 (Idaho)
  bean: { sp: [[15, 25, 35, 20], [25, 25, 30, 20], [20, 30, 40, 20]], fl: 'mid', tc: 34 },   // Beans, dry: 95 (May–June, Continental), 100 (June, Pakistan), 110 (June, Idaho)
  faba: { sp: [[15, 25, 35, 15], [20, 30, 35, 15], null], fl: 'mid' },   // Faba bean: 90 (May, Europe), 100 (March–April, Mediterranean)
  cowpea: { sp: [null, [20, 30, 30, 20], null], fl: 'mid' }, mung: { sp: [null, [20, 30, 30, 20], null], fl: 'mid' },   // Green gram, cowpeas: 100 (March, Mediterranean)
  groundnut: { sp: [[25, 35, 45, 25], [35, 35, 35, 35], null], fl: 'mid', tc: 37, tb: 10 },   // Groundnut: 130 (dry season, West Africa), 140 (Late Spring, Mediterranean)
  greenbean: { sp: [[15, 25, 25, 10], [20, 30, 30, 10], null], fl: 'mid', tc: 34 },   // Beans, green: 75 (February–March, California), 90 (August–September, Egypt)
  sunflower: { sp: [null, [25, 35, 45, 25], null], fl: 'mid' },   // Sunflower: 130 (April–May, Mediterranean)
  canola: { au: [null, [30, 35, 90, 40], null], fl: 'end' },   // Rapeseed, canola: the one autumn row, 195 days
  sesame: { sp: [null, [20, 30, 40, 20], null], fl: 'mid' },   // Sesame: 100 (June, China)
  safflower: { sp: [[20, 35, 45, 25], [25, 35, 55, 30], null], au: [null, [35, 55, 60, 40], null], fl: 'mid' },   // Safflower: 125 (April, California), 145 (Mar, High Latitudes), 190 (Oct–Nov, Arid region)
  flax: { sp: [null, [25, 35, 50, 40], null], au: [null, [30, 40, 100, 50], null], fl: 'mid' },   // Flax: 150 (April, Cold winter), 220 (October, Arizona)
  cotton: { sp: [[30, 50, 55, 45], [30, 50, 60, 55], [45, 90, 45, 45]], fl: 'mid', tb: 14 },   // Cotton: 180 (March, Egypt; March–May, Pakistan), 195 (September, Yemen), 225 (April, Texas)
  potato: { sp: [[25, 30, 30, 30], [25, 30, 45, 30], [45, 30, 70, 20]], fl: null },   // Potato: 115 (Jan–Nov, Semi-arid), 130 (May, Continental), 165 (April, Europe)
  sweetpotato: { sp: [[15, 30, 50, 30], [20, 30, 60, 40], null], fl: null },   // Sweet potato: 125 (April, Mediterranean), 150 (Rainy season, Tropical regions)
  cassava: { sp: [null, [20, 40, 90, 60], null], fl: null },   // Cassava: 210 (Rainy season, Tropical regions)
  sugarbeet: { sp: [[25, 35, 50, 50], [30, 45, 90, 15], null], au: [[35, 60, 70, 40], [45, 75, 80, 30], null], fl: null },   // Sugar beet: 160 (March, Coastal Lebanon), 180 (June, Mediterranean); 205 and 230 (November and Sept, Mediterranean)
  tomato: { sp: [[30, 40, 40, 25], [30, 40, 45, 30], [35, 40, 50, 30]], fl: 'mid', tb: 7 },   // Tomato: 135 (January, Arid region), 145 (April–May, California), 155 (Calif., USA)
  onion: { sp: [null, [15, 25, 70, 40], null], au: [null, [20, 35, 110, 45], null], fl: null },   // Onion (dry): 150 (April, Mediterranean), 210 (Oct–Jan, Arid region)
  cabbage: { sp: [[20, 30, 20, 10], [25, 35, 25, 10], [40, 60, 50, 15]], fl: null },   // Cabbage: 80 (Mediterranean), 95, 165 (Sept, Calif. Desert)
  watermelon: { sp: [[10, 20, 20, 30], [20, 30, 30, 30], null], fl: 'mid' },   // Watermelon: 80 (April, Italy), 110 (Mid-March–August, Near East)
  pepper: { sp: [null, [25, 35, 40, 20], null], au: [null, [30, 40, 110, 30], null], fl: 'mid' },   // Peppers: 120 (April–June, Europe), 210 (October, Arid region)
  carrot: { sp: [[20, 30, 30, 20], [30, 40, 60, 20], [30, 50, 90, 30]], fl: null },   // Carrots: 100 (Oct–Jan, Arid climate), 150 (Feb–Mar, Mediterranean), 200 (Oct, California Desert)
  lettuce: { sp: [[20, 30, 15, 10], [25, 35, 30, 10], [35, 50, 45, 10]], fl: null },   // Lettuce: 75 (April, Mediterranean), 100 (Nov–Jan, Arid region), 140 (Feb, Mediterranean)
  cucumber: { sp: [[20, 30, 40, 15], null, [25, 35, 50, 20]], fl: 'mid' },   // Cucumber: 105 (June–Aug, Arid region), 130 (Nov–Feb, Arid region)
  eggplant: { sp: [[30, 40, 40, 20], [30, 45, 40, 25], null], fl: 'mid' },   // Egg plant: 130 (October, Arid region), 140 (May–June, Mediterranean)
  pumpkin: { sp: [[20, 30, 30, 20], [25, 35, 35, 25], null], fl: 'mid' },   // Pumpkin, winter squash: 100 (March, August; Mediterranean), 120 (June, Europe)
  spinach: { sp: [[20, 20, 15, 5], [20, 20, 25, 5], [20, 30, 40, 10]], fl: null },   // Spinach: 60 (Apr; Sep–Oct, Mediterranean), 70, 100 (Arid region)
  melon: { sp: [[25, 35, 40, 20], null, [30, 30, 50, 30]], fl: 'mid' },   // Melon: 120 (May, Mediterranean), 140 (Calif., USA)
  cauliflower: { sp: [null, [35, 50, 40, 15], null], fl: null },   // Cauliflower: 140 (Sept, Calif. Desert)
});
// Crops FAO-56 does not list take a listed crop's stage SHARES over their own season length (the crop table's days), marked estimated.
const SHARE_OF = lock({ grains: [20, 30, 60, 40], crucifer: [20, 30, 20, 10] });   // "Grains (small)" and the crucifers of FAO-56 Table 11
export const ESTIMATED = lock({
  teff: 'grains', quinoa: 'grains', buckwheat: 'grains', chickpea: 'lentil', pigeonpea: 'soy', bambara: 'groundnut', lupin: 'pea',
  scanola: 'crucifer', mustardseed: 'crucifer', hemp: 'flax', jute: 'sorghum', yam: 'cassava', taro: 'cassava', tobacco: 'tomato', garlic: 'onion', okra: 'eggplant',
});
export const TURN = 7;   // days from a harvest to the next sowing: cut the crop, clear or drill through the straw, and sow
export const TIGHT = 14;  // under this many spare days the turn from one crop to the next is tight
export const CORN_UNITS = { s: 1167, m: 1333, l: 1611 };   // °C-days NCH-40 hybrids of each length need (the lowest of the 2,100, 2,400 and 2,900 °F-day classes)
const LEN_WORDS = { s: 'short-season', m: 'medium', l: 'long-season' };

// ---- variety lengths
const sumOf = row => row.reduce((a, b) => a + b, 0);
// The rows of one crop for one way of sowing ('sp' or 'au'), short to long, a row within 10 days of a kept one dropped.
export function lengthsOf(id, way = 'sp') {
  const crop = cropOf(id);
  if (!crop) return [];
  if (own(ESTIMATED, id)) {
    const from = ESTIMATED[id], src = own(SHARE_OF, from) ? SHARE_OF[from] : (SEASON[from].sp ?? SEASON[from].au).find(Boolean) ?? null;
    if (!src || !fin(crop.days)) return [];
    const total = sumOf(src), stages = src.map(d => Math.round(d / total * crop.days));
    return [{ len: 'm', stages, total: sumOf(stages), estimated: true }];
  }
  if (!own(SEASON, id)) return [];
  const rows = SEASON[id][way];
  if (!rows) return [];
  const out = [];
  // FAO's middle row is always kept, then the long and the short row unless within 10 days of a kept one: spring cereals offer 135 and 150, not 130 and 135
  [['m', 1], ['l', 2], ['s', 0]].forEach(([len, k]) => { const row = rows[k]; if (row && !out.some(o => Math.abs(o.total - sumOf(row)) <= 10)) out.push({ len, stages: [...row], total: sumOf(row), estimated: false }); });
  return out.sort((a, b) => a.total - b.total);
}
// The usual row: FAO's middle row, or the row nearest the crop's own season length in the crop table.
export function usualOf(id, way = 'sp') {
  const rows = lengthsOf(id, way), crop = cropOf(id);
  if (!rows.length) return null;
  const mid = rows.find(r => r.len === 'm');
  if (mid) return mid;
  return [...rows].sort((a, b) => Math.abs(a.total - (crop?.days ?? 0)) - Math.abs(b.total - (crop?.days ?? 0)))[0];
}
const ruleOf = id => own(SEASON, id) ? SEASON[id] : own(ESTIMATED, id) ? (own(SEASON, ESTIMATED[id]) ? SEASON[ESTIMATED[id]] : { fl: 'mid' }) : null;
// The daily high at which flowering fails: Luo 2011 where it gives one, else the crop's heat limit plus 3 °C (5 °C from 35 °C, or its own margin).
export function flowerLine(id) {
  const rule = ruleOf(id), crop = cropOf(id);
  if (!crop || !rule || !rule.fl) return NaN;
  if (fin(rule.tc) && !own(ESTIMATED, id)) return rule.tc;
  return crop.heat + (fin(crop.heatMargin) ? crop.heatMargin : crop.heat >= 35 ? 5 : 3);
}
const farTooHot = crop => crop.heat + (fin(crop.heatMargin) ? crop.heatMargin : crop.heat >= 35 ? 5 : 3);

// ---- a crop sown in autumn where the winter is not cold (winter wheat, triticale, rye): its season runs on warmth.
// FAO-56 prints one season length per row for the climate it was measured in (winter wheat 180 days in East Africa and the Mediterranean),
// so a fixed count of days ripens wheat in March in Kansas and in February in Ireland. Here a day counts as one day of the FAO-56 row when
// its normal mean sits at the low end of the crop's best warmth (FAO ECOCROP: 15 °C for winter wheat), as part of a day when cooler and
// as more when warmer, up to the high end of that range (23 °C): (mean − base) ÷ (best low − base). Under its base (the stage table's
// base for heat units, 0 °C for winter wheat) the crop does not grow: the count pauses through a cold spell and goes on after it, so
// there is no cliff at one winter line. No number here is new: each is the crop's own; the way of counting is Crophalo's own (neither
// FAO-56 nor ECOCROP gives it as a rule) and says so on the ECOCROP card. A crop with no base in the stage table (canola)
// keeps its FAO-56 row as printed.
function warmthOf(id) {
  const crop = cropOf(id), rule = ruleOf(id);
  if (!crop || !(crop.sow > crop.harv) || own(ESTIMATED, id) || !own(SEASON, id) || !SEASON[id].au || !fin(rule.tb) || !Array.isArray(crop.tOpt)) return null;
  const base = rule.tb, [low, high] = crop.tOpt;
  return fin(base) && fin(low) && fin(high) && low > base && high >= low ? { base, low, high } : null;
}
// The day the crop sown on day sow has gathered `days` days of FAO-56 growth on the normal year; NaN when a year is not enough.
function warmEnd(Y, sow, days, w) {
  let got = 0;
  for (let d = sow; d < sow + 365; d++) { got += Math.max(0, Math.min(Y.tmean(d), w.high) - w.base) / (w.low - w.base); if (got >= days) return d + 1; }
  return NaN;
}
// FAO-56's four stages shared out over the days the season takes here, in the row's own proportions.
const spread = (stages, span) => { const all = sumOf(stages), out = stages.map(s => Math.round(s / all * span)); out[3] = span - out[0] - out[1] - out[2]; return out; };

// ---- the normal year, day by day: a straight line through the middles of the months (wrapping past December)
const line12 = (v12, d) => {
  const day = ((Math.round(d) - 1) % 365 + 365) % 365 + 1;
  let a = -1; for (let m = 0; m < 12; m++) if (MID[m] <= day) a = m;
  const [from, to, x0, x1] = a < 0 ? [11, 0, MID[11] - 365, MID[0]] : a === 11 ? [11, 0, MID[11], MID[0] + 365] : [a, a + 1, MID[a], MID[a + 1]];
  return v12[from] + (v12[to] - v12[from]) * (day - x0) / (x1 - x0);   // an unread month on either side gives NaN
};
const monthOf = d => { const day = ((Math.round(d) - 1) % 365 + 365) % 365 + 1; let m = 0; while (m < 11 && day > BEFORE[m + 1]) m++; return m; };
const YEARS = new WeakMap();
// The climate's normal year: highs, lows, means, the share of nights with frost, rain per day, and hot days per day at any line.
export function normalYear(C) {
  if (!C || typeof C !== 'object' || !C.monthly) return null;
  if (YEARS.has(C)) return YEARS.get(C);
  const M = C.monthly, hot = new Map();
  // hot days per day of each month; a line under the lowest bucket takes the lowest bucket, which can only count too few days
  const perDay = (H, low = H) => H.map((v, m) => (fin(v) ? v : low[m]) / MONTH_DAYS[m]);
  const Y = {
    tmax: d => line12(M.tmax, d), tmin: d => line12(M.tmin, d), tmean: d => line12(M.tmean, d),
    frost: d => line12(M.frostByMonth.map((v, m) => v / MONTH_DAYS[m]), d),
    rain: d => M.P[monthOf(d)] / MONTH_DAYS[monthOf(d)],   // each month's rain spread evenly over its days, so month totals stay exact
    hot: (limit, d) => { const key = `b${limit}`; if (!hot.has(key)) hot.set(key, perDay(hotDaysAt(C, limit, 'between'), hotDaysAt(C, limit, 'near'))); return line12(hot.get(key), d); },
    hotNear: (limit, d) => { const key = `n${limit}`; if (!hot.has(key)) hot.set(key, perDay(hotDaysAt(C, limit, 'near'))); return line12(hot.get(key), d); },
    gdd: (d, base = 10) => base === 10 ? gddDay(line12(M.tmax, d), line12(M.tmin, d)) : Math.max(0, line12(M.tmean, d) - base),
  };
  YEARS.set(C, Y);
  return Y;
}
const total = (from, to, f) => { let s = 0; for (let d = from; d < to; d++) s += f(d); return s; };   // a sum over the days [from, to)
const meanOver = (from, to, f) => to > from ? total(from, to, f) / (to - from) : NaN;
export const frostDoy = (key, south = false) => fin(key) ? south ? keyToDoy(key, true) : key : NaN;   // north of the equator a frost key is the day of the year; south of it, half a year on (js/climate.js seasonKey)
const springFrost = C => frostDoy(C.med?.frostLast, C.south);   // the normal last spring frost, as a day of the year
const autumnFrost = C => frostDoy(C.med?.frostFirst, C.south);   // the normal first autumn frost: in the south it comes in May or June, before that year's spring
// The crop table's months are those of the northern temperate zone. South of the equator the seasons come half a year later, so its
// usual days move on by half a year there (an October sowing becomes an April one); everything read from the field's own weather needs no move.
const HALF = SOUTH_SHIFT;   // half of the 365-day year, rounded down: the same shift as the south's frost keys (js/climate.js)
const halfOf = C => C?.south ? HALF : 0;
const moved = (C, sow, harvest) => { const h = halfOf(C); let a = sow - h, b = harvest - h; if (a < 1) { a += 365; b += 365; } return [a, b]; };
const firstAfter = (C, first, day) => C.south && fin(first) && fin(day) && first < day ? first + 365 : first;   // the south's first autumn frost after a spring sowing falls the next calendar year

// ---- dates and words
export const monthDay = doy => { let d = ((Math.round(doy) - 1) % 365 + 365) % 365 + 1, m = 0; while (m < 11 && d > MONTH_DAYS[m]) d -= MONTH_DAYS[m++]; return [m, d]; };
// A real calendar date for day doy counted from 1 January of year, on the normal 365-day year ("Oct 19" stays Oct 19 in a leap year).
export function isoOf(year, doy) {
  if (!fin(year) || !fin(doy)) return null;
  const y = year + Math.floor((Math.round(doy) - 1) / 365), [m, d] = monthDay(doy);
  return `${String(y).padStart(4, '0')}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export const doyOfIso = iso => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(iso ?? '')); if (!m) return null; const mm = +m[2] - 1, dd = Math.min(+m[3], MONTH_DAYS[mm] ?? 31); return mm >= 0 && mm < 12 ? { year: +m[1], doy: BEFORE[mm] + dd } : null; };
export const dayWord = doy => { if (!fin(doy)) return 'an unknown day'; const [m, d] = monthDay(doy); return `${MON[m]} ${d}`; };   // "Oct 19"
export const roughWord = doy => { if (!fin(doy)) return 'an unknown time'; const [m, d] = monthDay(doy); return `${d <= 10 ? 'early' : d <= 20 ? 'mid' : 'late'} ${MONTHS[m]}`; };   // "mid October"

// ---- what kind of sowing a crop gets here
const coolest = C => Math.min(...C.monthly.tmean.filter(fin));
// Where frost does not set the season (frost in under half the years, js/climate.js frostFreeClimate), the coolest month is still too cool
// to sow the crop, and the rains come in the warm half of the year (a monsoon), the rains set the season as in the tropics: FAO-56 Table 11
// times such rows by the rains ("June, Nigeria; October, India"). Without this the first warm enough day after the coldest one falls in
// the dry winter (soybeans in January in Punjab). The warm half: the six wettest months in a row average warmer than the other six.
// No new number: six months is the growing season's own length, and the sowing warmth is the crop's own.
const warmRains = C => {
  const s = C.wet?.[6], T = C.monthly?.tmean;
  if (C.frostFreeClimate !== true || !fin(s) || !T || T.some(v => !fin(v))) return false;
  const wet = Array.from({ length: 6 }, (_, j) => T[(s + j) % 12]), dry = Array.from({ length: 6 }, (_, j) => T[(s + 6 + j) % 12]);
  return sumOf(wet) > sumOf(dry);
};
export function kindOf(id, C) {
  const crop = cropOf(id);
  if (!crop || crop.type === 'fallow' || crop.type === 'cover' || crop.type === 'forage') return 'calendar';
  if (!ruleOf(id)) return 'calendar';
  const autumnSown = crop.sow > crop.harv;   // sown in one year, harvested in the next (the crop table's months)
  if (autumnSown) return C.coldWinter === false ? 'autumn' : 'winter';
  const sowT = fin(ruleOf(id).sow) ? ruleOf(id).sow : crop.minT;
  if ((C.tropic || (warmRains(C) && fin(coolest(C)) && coolest(C) < sowT)) && crop.tropic !== false && Array.isArray(C.wet)) return 'rains';
  if (crop.mildAutumn && fin(coolest(C)) && coolest(C) >= crop.minT && lengthsOf(id, 'au').length) return 'autumn';   // it keeps growing through a winter whose coolest month stays at its lowest growing temperature
  return 'spring';
}

// ---- the timing of one crop
// opts: len 's'|'m'|'l' (a whole FAO row); after: the day the field comes free (a previous harvest, same day count as the sowing year).
// Returns { id, ok, why, kind, len, stages, total, sow, harvest, flower, hot, line, window, room, wake, units, estimated, words }.
export function cropTiming(id, C, opts = {}) {
  const crop = cropOf(id), Y = normalYear(C);
  if (!crop) return { id, ok: false, why: 'unknown', words: 'This crop is not in Crophalo\'s crop table.' };
  if (!Y) return { id, ok: false, why: 'noclimate', words: 'No weather has been read for this field yet, so no sowing dates can be worked out.' };
  const name = cropName(id, true), kind = kindOf(id, C), gaps = C.gaps?.temp ?? [];
  const base = { id, kind, ok: true, why: '', len: null, stages: null, estimated: false, window: null, room: NaN, wake: NaN, units: NaN, unitsNeed: NaN, hot: NaN, line: NaN, flower: NaN, remarks: [] };
  const calendar = why => {   // the crop table's usual months: sown in the middle of its sowing month, ready in the middle of its harvest month
    const [sow, harvest] = moved(C, BEFORE[crop.sow - 1] + 15, BEFORE[crop.harv - 1] + 15 + (crop.harv < crop.sow ? 365 : 0));
    return { ...base, kind: 'calendar', sow, harvest, total: harvest - sow, remarks: why ? [why] : [] };
  };
  if (kind === 'calendar') return calendar('');
  if (gaps.length) return calendar(`${name}: sowing dates cannot be checked, because ${gapWords(gaps)}.`);
  if (kind === 'winter') return winterTiming(id, C, opts, base);
  const way = kind === 'autumn' ? 'au' : 'sp', rows = lengthsOf(id, way).length ? lengthsOf(id, way) : lengthsOf(id, 'sp');
  const usual = usualOf(id, lengthsOf(id, way).length ? way : 'sp');
  if (!rows.length || !usual) return calendar('');
  const tender = crop.frost < 0.3, rule = ruleOf(id), sowT = fin(rule.sow) ? rule.sow : crop.minT, last = springFrost(C);
  const warm = kind === 'autumn' ? warmthOf(id) : null;   // a winter cereal where the winter is not cold (canola has no base in the stage table and keeps its FAO-56 row): its season runs on warmth
  // The sowing month of the FAO-56 row itself (soybeans: the 140-day row is "May, Central USA"). Where the winter is not cold, the spring
  // warmth comes weeks before that month, and the row would be sown in March; so there the crop is not sown before the first day of that
  // month (in the south half a year later). Where the winter is cold, the field's own warmth sets the day as before. No new number: the
  // month is FAO-56's own, the cold-winter line is js/climate.js coldWinter.
  const floor = kind === 'spring' && C.coldWinter === false && fin(rule.rowSow) ? moved(C, BEFORE[rule.rowSow - 1] + 1, 0)[0] : NaN;
  let fromCold = d => d;
  // the usual sowing day
  let start = NaN;
  if (kind === 'spring') {
    const temps = Array.from({ length: 365 }, (_, i) => Y.tmean(i + 1)), cold = temps.indexOf(Math.min(...temps)) + 1;
    fromCold = d => ((Math.round(d) - cold) % 365 + 365) % 365;   // days since the coldest day of the normal year
    if (Math.min(...temps) >= sowT) start = moved(C, BEFORE[crop.sow - 1] + 1, 0)[0];   // warm all year: no window from temperature, its usual sowing month, still judged for heat
    else for (let k = 1; k <= 365; k++) { const d = (cold + k - 1) % 365 + 1; if (Y.tmean(d) >= sowT && (!tender || !fin(last) || d > last)) { start = d; break; } }
    if (!fin(start)) return { ...base, ok: false, why: 'cold', words: `${name}: in a normal year the daily mean never reaches ${sowT} °C, the warmth it is sown at.` };
  } else if (kind === 'autumn') {
    const usualDay = BEFORE[crop.sow - 1] + 1, h = halfOf(C);   // worked on the northern count, then moved back half a year in the south
    let d17 = NaN; for (let d = 182; d <= 335; d++) if (Y.tmean(d - h) <= 17) { d17 = d; break; }   // the normal mean falls to 17 °C (FAO-56), or 1 December (1 June in the south)
    start = moved(C, Math.max(Math.min(fin(d17) ? d17 : 335, 335), usualDay - (warm ? 0 : 30)), 0)[0];   // a crop sown in autumn: never before its usual sowing month, the same first day as where winters are cold
  } else {   // the rains
    const months = Math.max(1, Math.min(12, Math.ceil(usual.total / 30))), first = C.wet[months];
    start = fin(first) ? BEFORE[first] + 1 : moved(C, BEFORE[crop.sow - 1] + 1, 0)[0];
  }
  const judge = (sow, row) => {
    const end = warm ? warmEnd(Y, sow, row.total, warm) : sow + row.total;
    const stages = warm && fin(end) ? spread(row.stages, end - sow) : row.stages;
    const [i, dv, mid] = stages, harvest = end, line = flowerLine(id), span = harvest - sow;
    const flower = rule.fl === 'mid' ? sow + i + dv : rule.fl === 'end' ? sow + i + dv + mid - 10 : NaN;
    const hot = fin(flower) && fin(line) ? total(flower - 10, flower + 11, d => Y.hot(line, d)) : NaN;
    const farLine = farTooHot(crop), far = total(sow, harvest, d => Y.hot(farLine, d));
    const late = tender ? total(sow + i + dv, harvest, d => Y.frost(d)) : 0;   // frosty nights once it has grown past its first two stages
    let why = '';
    if (!fin(end)) why = 'ripen'; else if (late >= 10) why = 'frost'; else if (hot > 10.5) why = 'flower'; else if (far > span / 2) why = 'season';
    return { sow, harvest, flower, hot, line, far, late, why, row, stages, span };
  };
  const words = (t, mine) => t.why === 'ripen' ? `${name}: in a normal year it does not gather the warmth to ripen within a year of sowing.`
    : t.why === 'frost' ? `${name}: about ${Math.round(t.late)} frosty nights fall after its first two stages in a normal year: a grown crop standing in the frost season.`
    : t.why === 'flower' ? `${name}: in a normal year about ${Math.round(t.hot)} of the 21 days around flowering reach ${t.line} °C or more, ${mine ? 'with the sowing date and variety you gave' : 'whatever the sowing date or variety length'}. Its flowers fail in that heat.`
      : t.why === 'season' ? `${name}: most of its season is far too hot here.` : '';
  const pick = (t, extra = []) => {
    const out = { ...base, ok: !t.why, why: t.why, len: t.row.len, stages: [...t.stages], total: t.span, estimated: t.row.estimated, sow: t.sow, harvest: t.harvest, flower: t.flower, hot: t.hot, line: t.line, words: words(t, !!opts.len), remarks: [...extra] };
    if (warm) { out.rowTotal = t.row.total; out.byWarmth = true; }
    if (out.ok && t.hot >= 2) out.remarks.push(`In a normal year about ${Math.round(t.hot)} of the 21 days around flowering reach ${t.line} °C or more.`);
    if (id === 'corn' || id === 'sweetcorn') {
      const first = firstAfter(C, autumnFrost(C), t.sow), need = CORN_UNITS[t.row.len];
      if (fin(first) && first > t.sow) {
        out.units = total(t.sow, first, d => Y.gdd(d)); out.unitsNeed = need;
        if (fin(need) && out.units < need) out.remarks.push(`The summer gives about ${Math.round(out.units).toLocaleString('en-US')} corn heat units (°C days above 10 °C) before the normal first frost; hybrids of this length need about ${need.toLocaleString('en-US')} (National Corn Handbook NCH-40), so a shorter hybrid may be needed.`);
      }
    }
    const first = firstAfter(C, autumnFrost(C), t.sow);
    // ready on the day of the normal first autumn frost or after it: a same-day harvest is said as such, not as "after"
    if (out.ok && tender && fin(first) && Math.round(t.harvest) >= Math.round(first)) out.remarks.push(`FAO's season lengths come from warmer places; cold regions grow shorter varieties than FAO lists. Here this one would be ready about ${dayWord(t.harvest)}, ${Math.round(t.harvest) > Math.round(first) ? 'after' : 'on the day of'} the normal first autumn frost (${dayWord(first)}).`);
    return out;
  };
  const chosen = opts.len ? rows.filter(r => r.len === opts.len) : [usual];
  if (!chosen.length) return { ...base, ok: false, why: 'len', words: `${name}: no ${LEN_WORDS[opts.len] ?? ''} row is listed for it.` };
  // not before the month of the FAO-56 row (above), unless the heat on that later day fails the crop where its own warmth day passes:
  // in a hot summer farmers sow early against the heat, as the flowering-heat search below does
  if (fin(floor) && fromCold(start) < fromCold(floor)) { const at = judge(floor, chosen[0]); if (!(at.why === 'flower' || at.why === 'season') || judge(start, chosen[0]).why) start = floor; }
  const first = judge(fin(opts.sow) ? opts.sow : start, chosen[0]);
  if (!first.why || opts.len || fin(opts.sow) || first.why !== 'flower') return pick(first);
  // Only heat at flowering moves the timing: earlier sowings, in 10-day steps from two months before (one in autumn), every length;
  // then later sowings (45 to 120 days after the usual) for warm-season crops, to flower after the hottest weeks.
  const tries = [];
  for (let s = start - (kind === 'autumn' ? 30 : 60); s <= start; s += 10) {
    if (kind === 'spring' && tender && fin(last) && s <= last) continue;
    if (kind === 'spring' && Y.tmean(s) < crop.minT) continue;   // heat at flowering may still move a crop before the month of its FAO-56 row (above), as farmers sow early against the summer heat
    rows.forEach(row => tries.push(judge(s, row)));
  }
  if (crop.minT >= 10) for (let s = start + 45; s <= start + 120; s += 10) rows.forEach(row => { const t = judge(s, row); if (total(s, s + row.total, d => Y.tmean(d) >= crop.minT ? 0 : 1) === 0) tries.push(t); });
  // An autumn crop takes the sowing (up to a month earlier) whose flowering meets the least heat, as farmers sow wheat early against the
  // spring heat. A summer crop is moved no further than the heat needs: the passing sowing nearest its usual day, so it is not pushed to
  // the end of the summer only to shave off a hot day or two.
  const near = (a, b) => Math.abs(a.sow - start) - Math.abs(b.sow - start);
  const good = tries.filter(t => !t.why).sort(kind === 'autumn' ? (a, b) => a.hot - b.hot || near(a, b) : (a, b) => near(a, b) || a.hot - b.hot);
  return good.length ? pick(good[0], [`${name}: sown about ${roughWord(good[0].sow)} instead of ${roughWord(start)}, so it flowers before or after the hottest weeks.`]) : pick(first);
}

// Where winters are cold, an autumn-sown crop rests through the winter and keeps its usual calendar. Its sowing window here:
// earliest  the first day of its usual sowing month (the crop table);
// latest    the last day that still leaves its FAO-56 initial stage (coming up and rooting) before the normal daily mean drops
//           under its lowest growing temperature (the crop table's minT, 3 °C for winter wheat) for the winter.
// Ready in the middle of its usual harvest month next year.
function winterTiming(id, C, opts, base) {
  const crop = cropOf(id), Y = normalYear(C), name = cropName(id, true), usual = usualOf(id, 'au');
  if (!usual) return { ...base, kind: 'winter', ok: false, why: 'rows', words: `${name}: FAO-56 lists no autumn row for it.` };
  const [earliest, harvest] = moved(C, BEFORE[crop.sow - 1] + 1, BEFORE[crop.harv - 1] + 15 + 365), init = usual.stages[0];
  let cold = NaN; for (let d = earliest; d < earliest + 300; d++) if (Y.tmean(d) < crop.minT) { cold = d; break; }
  let wake = NaN; if (fin(cold)) for (let d = cold; d < cold + 300; d++) if (Y.tmean(d) >= crop.minT) { wake = d; break; }
  const latest = fin(cold) ? cold - init : NaN;
  const out = { ...base, kind: 'winter', len: usual.len, estimated: usual.estimated, window: { earliest, latest, cold, init, minT: crop.minT }, wake, harvest };
  if (!fin(cold)) return { ...out, ok: false, why: 'nowinter', words: `${name}: the normal year never cools under ${crop.minT} °C, so the cold-winter calendar does not apply.` };
  if (latest < earliest) return { ...out, ok: false, why: 'autumn', words: `${name}: the normal daily mean drops under ${crop.minT} °C about ${dayWord(cold)}, too soon after ${dayWord(earliest)} for its ${init} days of coming up and rooting (FAO-56).` };
  const free = fin(opts.after) ? opts.after + TURN : -Infinity, sow = Math.max(earliest, free);
  out.room = latest - free; out.sow = sow;
  // Coming up and rooting keeps the usual row's own days (the window is built on them). The rest of the span is shared out by the
  // longest autumn row, FAO's row for frozen soils, whose development stage holds the winter rest (winter wheat 30, 140, 40, 30).
  const cold_ = lengthsOf(id, 'au').at(-1), span = harvest - sow, restFAO = cold_.total - cold_.stages[0], rest = span - init;
  out.stages = [init, Math.round(cold_.stages[1] / restFAO * rest), Math.round(cold_.stages[2] / restFAO * rest), 0]; out.stages[3] = span - out.stages[0] - out.stages[1] - out.stages[2];
  out.total = span; out.rowTotal = usual.total;
  const rule = ruleOf(id), line = flowerLine(id), flower = rule.fl === 'end' ? sow + out.stages[0] + out.stages[1] + out.stages[2] - 10 : sow + out.stages[0] + out.stages[1];
  out.flower = flower; out.line = line; out.hot = fin(line) ? total(flower - 10, flower + 11, d => Y.hot(line, d)) : NaN;
  out.units = total(Math.min(sow, latest), cold, d => Y.gdd(d, rule.tb ?? 0));   // warmth above its base before the winter, from the sowing (or the last good day)
  if (out.hot > 10.5) { out.ok = false; out.why = 'flower'; out.words = `${name}: in a normal year about ${Math.round(out.hot)} of the 21 days around flowering reach ${line} °C or more. Its flowers fail in that heat.`; }
  return out;
}

// Whether a winter crop can follow the crop before it: that crop's harvest plus one week must come by the last good sowing day.
// prevTimings: the earlier crop's timing for each variety length to try, usual first. Returns the first that leaves room, or the reason.
export function followOn(nextId, prevId, C, opts = {}) {
  const name = cropName(nextId, true), prev = cropName(prevId, true).toLowerCase();
  const usualPrev = cropTiming(prevId, C, opts.prev ?? {});
  if (kindOf(nextId, C) !== 'winter') return { ok: true, follow: false, prev: usualPrev, next: cropTiming(nextId, C, {}) };
  const harvestYearDay = t => fin(t.harvest) ? t.harvest - (t.harvest > 365 ? 365 : 0) : NaN;   // the earlier crop's harvest, on the next crop's sowing year
  const tryWith = t => cropTiming(nextId, C, { after: harvestYearDay(t) });
  const first = tryWith(usualPrev);
  const base = { follow: true, usualPrev, usualNext: first, latest: first.window?.latest, slack: first.room };
  if (!first.ok) return { ...base, ok: false, why: first.why, prev: usualPrev, next: first, words: first.words };
  if (first.room >= 0) return { ...base, ok: true, tight: first.room < TIGHT, shortened: false, prev: usualPrev, next: first };
  // the usual earlier crop comes off too late: try its shorter rows, the longest that still leaves room first
  const rows = lengthsOf(prevId, 'sp').filter(r => r.total < (usualPrev.total ?? Infinity)).sort((a, b) => b.total - a.total);
  for (const row of rows) {
    const t = cropTiming(prevId, C, { len: row.len }); if (!t.ok) continue;
    const n = tryWith(t);
    if (n.ok && n.room >= 0) return { ...base, ok: true, tight: n.room < TIGHT, shortened: true, prev: t, next: n };
  }
  return { ...base, ok: false, why: 'window', prev: usualPrev, next: first,
    words: `${name} after the ${prev}: the ${prev} are ready about ${dayWord(harvestYearDay(usualPrev))}, and a week later is past the last good sowing day here (about ${dayWord(first.window.latest)}), with no shorter variety in the FAO-56 rows that leaves room.` };
}

// ---- a second crop in the same year (after a spring or summer main crop, sown and ready before the normal first autumn frost)
// Checks in order, each with its one-sentence reason: unknown crop, no timing, fallow, window, cold, frost years.
export function secondFit(mainId, secondId, C, opts = {}) {
  const main = cropName(mainId, true).toLowerCase(), crop = cropOf(secondId), Y = normalYear(C);
  const nameS = cropName(secondId, true), say = text => `${nameS} after the ${main}: ${text}`;
  if (!crop || !cropOf(mainId)) return { ok: false, why: 'unknown', words: 'One of these crops is not in Crophalo\'s crop table.' };
  if (!Y) return { ok: false, why: 'noclimate', words: 'No weather has been read for this field yet, so a second crop cannot be checked.' };
  if (mainId === 'fallow') return { ok: false, why: 'fallow', words: say('a fallow year follows, and it is there to store water. A second crop would use that water up.') };
  const m = opts.mainTiming ?? cropTiming(mainId, C);
  if (!m.ok || !fin(m.harvest)) return { ok: false, why: 'main', words: say(`the ${main} has no harvest day here.`) };
  if (kindOf(secondId, C) === 'winter') return { ok: false, why: 'winter', words: say('where winters are cold it rests through the winter and is harvested next summer, so it is the next year\'s main crop, not a second crop.') };
  const rows = lengthsOf(secondId, 'sp'), sow = m.harvest + TURN;
  let first = autumnFrost(C); if (fin(first)) while (first < sow) first += 365;   // the first autumn frost after it is sown
  const day = ((Math.round(sow) - 1) % 365 + 365) % 365 + 1, af = autumnFrost(C), sf = springFrost(C);
  const late = fin(af) && (C.south ? day >= af && (!fin(sf) || day <= sf) : day > af);   // sown after that year's first autumn frost: the frost season has begun, and no day is free (in the south it runs from about May to the last spring frost)
  if (!rows.length) return { ok: false, why: 'rows', words: say('FAO-56 lists no season length for it.') };
  const shortest = rows[0].total, free = fin(first) ? (late ? 0 : first - sow) : NaN;
  if (fin(free) && free < shortest) return { ok: false, why: 'window', words: say(`only about ${Math.max(0, Math.round(free))} days are free between the ${main} harvest and the first autumn frost, and even its shortest variety needs about ${shortest}.`) };
  const rule = ruleOf(secondId), sowT = fin(rule?.sow) ? rule.sow : crop.minT;
  if (Y.tmean(sow) < sowT) return { ok: false, why: 'cold', words: say(`it is too cool to sow it after the ${main} harvest.`) };
  const row = rows.find(r => !fin(first) || sow + r.total <= first) ?? rows[0];
  const shift = fin(first) ? first - autumnFrost(C) : 0, yearsFirst = (C.yearly?.frostFirst ?? []).filter(fin).map(f => frostDoy(f, C.south)), early = yearsFirst.filter(f => f + shift < sow + row.total).length;
  if (yearsFirst.length && early * 4 > yearsFirst.length) return { ok: false, why: 'frostyears', words: say(`in ${early} of the last ${yearsFirst.length} years the first autumn frost came before it would be ready.`) };
  const slack = fin(first) ? first - (sow + row.total) : NaN;
  return { ok: true, why: '', sow, harvest: sow + row.total, len: row.len, total: row.total, share: row.total / (crop.days || row.total), tight: fin(slack) && slack < TIGHT, frostYears: early, of: yearsFirst.length,
    words: say(`sown about ${roughWord(sow)}, it is ready about ${roughWord(sow + row.total)}${fin(first) ? ', before the normal first autumn frost' : ''}.`) };
}

// "Corn: sow from late May · flowers about late July · ready about late October."
export function timingWords(t) {
  if (!t || !t.id) return '';
  const name = cropName(t.id, true);
  if (!t.ok) return t.words ?? `${name}: no sowing time fits here.`;
  if (t.kind === 'winter') return `${name}: sow from ${dayWord(t.window.earliest)} to about ${dayWord(t.window.latest)} · ready about ${roughWord(t.harvest)}.`;
  if (t.kind === 'calendar') return `${name}: sow about ${MONTHS[monthDay(t.sow)[0]]} · harvest about ${MONTHS[monthDay(t.harvest)[0]]}.`;
  return `${name}: sow from ${roughWord(t.sow)}${fin(t.flower) ? ` · flowers about ${roughWord(t.flower)}` : ''} · ready about ${roughWord(t.harvest)}.`;
}
export const varietyWords = t => t?.len && t.total ? `${LEN_WORDS[t.len][0].toUpperCase()}${LEN_WORDS[t.len].slice(1)} variety: about ${t.rowTotal ?? t.total} days${t.estimated ? ' (estimated from a similar crop in FAO tables)' : ' in FAO tables'}${t.rowTotal ? t.byWarmth ? `, here ${t.total} days from sowing: it grows faster when warm, slower when cool and not at all in the cold` : `, spread here over ${t.total} days from sowing to the usual harvest month` : ''}.` : '';
export const SEASON_FOOT = 'Season lengths from FAO-56 (Allen et al. 1998, Table 11), dates from your normal weather. Local sowing dates and varieties can differ by a few weeks. We count one week from a harvest to the next sowing.';
