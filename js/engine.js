// Crophalo's report engine: it takes the farmer's rotation and builds a handful of alternatives from it, scores each 0–100 on
// five parts (Water fit, Soil health, Soil wash-off, Income, Weather safety) weighted by the farmer's priorities, checks every crop
// against the field's NASA weather (js/fit.js, js/sure.js, js/season.js) and writes why, evidence, gaps and risks for each.
// Pure: no page, no storage, no network and no clock (today is passed in). Checked by scripts/test_engine.mjs.
/*
 * It is intentionally a transparent rule-based model (no black box) so each number can be explained. A higher score never
 * overrides a failed check, and an option that only just suits is never a firm suggestion.
 *
 * FOR THE SCREENS (the two functions every screen codes against):
 *
 * optionsFor(state, climate, spot, { today: 'YYYY-MM-DD' }) -> {
 * current: Plan, recommended: Plan | null, others: [Plan],
 * reason: 'one sentence', evidence: [{ text, sources: ['power', ...] }], gaps: [text], risks: [text],
 * sureness: 'Very sure' | 'Fairly sure' | 'Somewhat sure' | null,
 * sureWhy: [{ firm: true|false, text }], endorsed: true|false, gain: points | null,
 * strategies: [{ id, role, opportunity, text }], fewWhy: text, exposure: [{ month, hazard, crop, stage, count, of, text, source, sources }],
 * exposureNote: text, bare: [{ id, months, years, of, text }], dropped: [{ kind, slots, reason }]   (js/compare.js: the three strategies to compare
 * first, when the crops grown now are most exposed, the months the soil is bare, and the ideas the farmer's limits left out, also named in gaps)
 * }
 * state    the setup answers of js/state.js (rotation, farm, soil, soilTest, avoid, prio, goals, limits).
 * climate  computeClimate() of js/climate.js on the field's NASA POWER record; null when the weather is not read yet: then
 * recommended, sureness and gain are null, current lists the crops with null dates, and gaps says why.
 * spot     what is known about the place: { lat, lon, elev, slope (percent, or null), soil: { texture, source:
 * 'assumed'|'own'|'map'|'world'|'test' }, country, fieldDrawn, absent: [cropIds], common: { cropId: bonus },
 * nearby: { source: 'aci'|'cdl'|'fao', line, left, gap }, market: { source, year, shares } }; all optional. absent, common and nearby come from js/nearby.js
 * (spotFields) on the crop-map lookup scripts/live/cropsnear.py; without them nothing is checked against local practice.
 * today    the date the plans start after; when left out, the day after the last day of the weather record.
 * recommended is the endorsed best option, or the current plan when nothing does clearly better ("Keep").
 * others   every other option considered, best first, each with its own why, evidence, gaps, risks, flag and score.
 *
 * Plan = { id, name, kind: 'current' | 'proposed', seasons: [Season],
 * score 0–100, scores { water, soil, erosion, income, weather } 0–100 each (null for a part not worked out; parts is the same
 * object under its older name), pest 0–100, flag: 'holds' | 'borderline' | 'fails', fit: 'Holds up' | 'Only just suits' | "Doesn't suit here",
 * why: one sentence, whyLines: [the longer lines], evidence, gaps, risks, bareMonths, slots,
 * benefits: [{ kind, text }], review: [text], facets: { nitrogen, organic, pest, forage, market, waterUse, infiltration } each { score | null, text, source },
 * bare: [month 1..12] }   (the last four from js/compare.js)
 * Season = { year (the harvest year), crop: cropId, sow: 'YYYY-MM-DD', harvest: 'YYYY-MM-DD', after: 'residue' | 'cover' | 'bare',
 * residueUntil: 'YYYY-MM-DD' | null, window: { earliest, latest } | null,
 * stages: [initial, development, mid, late] days | null, variety: 's'|'m'|'l'|null, wake: 'YYYY-MM-DD' | null,
 * cover: cropId | null, coverFrom, coverUntil, timing: 'plain sentence' }
 * A fallow year has crop 'fallow' and null dates. wake is the spring day a winter crop grows again (winter crops only).
 *
 * groundOn(plan, 'YYYY-MM-DD') -> { state: 'crop' | 'cover' | 'residue' | 'bare' | null, crop: cropId | null,
 * stage: 0..5 | null, label: 'Planned', note: 'plain sentence' }
 * stage: 0 sown, 1 coming up (FAO-56 initial), 2 development, 3 mid-season (flowering), 4 late season (ripening), 5 harvest day.
 * 'crop' is a main crop standing (a winter crop after sowing is living cover of the soil); 'cover' a cover crop; 'residue' the
 * straw and leaves left after a harvest; 'bare' nothing; null outside the plan's years (nothing is known there).
 *
 * keyDates(current, proposed) -> [{ key: 'harvest'|'establish'|'spring', date, label, current: ground, proposed: ground }] or []
 * The three dates of the walkthrough when the proposed plan sows a winter crop after another crop's harvest.
 */
import { own, WATER_WORDS } from './words.js';
import { cropOf, cropName, cropIds, presetOf, isCrop } from './crops.js';
import { hotDaysAt, notFarmlandWords, autumnWords, SQUARE_WORDS, seasonKey, keyToDoy, SOUTH_SHIFT, GROW_LINE } from './climate.js';
import { cropTiming, followOn, secondFit, kindOf, normalYear, isoOf, doyOfIso, dayWord, roughWord, timingWords, varietyWords, lengthsOf, usualOf, TURN, TIGHT, MONTH_DAYS, SEASON_FOOT } from './season.js';
import { feasible, supplyOf, cropFit, seasonOf, IRRIGATION_MM } from './fit.js';
import { scenarios, sureField, FLAG_WORDS, VARIANT_WORDS } from './sure.js';
import { withLimits, goalTerm, finish, DEEP_COLD } from './compare.js';
import { rareWords, keepWords } from './words.compare.js';   // the goals and limits, and the strategy comparison (benefits, review, facets, strategies, exposure, bare months)

const fin = Number.isFinite;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const sum = list => list.reduce((a, b) => a + b, 0);
const mean = list => list.length ? sum(list) / list.length : NaN;
const lockAll = thing => { if (thing && typeof thing === 'object' && !Object.isFrozen(thing)) { Object.freeze(thing); Object.values(thing).forEach(lockAll); } return thing; };

// ---- the five parts, and the fixed figures of the rules
export const DIMS = lockAll([
  { id: 'water', label: 'Water fit', hint: 'Do the crops fit the rain and moisture you get, and use less of it?' },
  { id: 'soil', label: 'Soil health', hint: 'Organic matter, living roots, free nitrogen from legumes and crop variety.' },
  { id: 'erosion', label: 'Soil wash-off', hint: 'How well the ground stays covered when a heavy downpour hits (rain is modelled; wind is not).' },
  { id: 'income', label: 'Income', hint: 'A rough money score from typical crop values, not a budget. Check your own numbers.' },
  { id: 'weather', label: 'Weather safety', hint: 'Higher is safer: how well the crops stand up to heat, frost and drought.' },
]);
export const PRIORITY_SETS = lockAll({ balanced: [3, 3, 3, 3, 3], moisture: [5, 3, 2, 2, 4], soil: [2, 5, 4, 2, 3], erosion: [2, 4, 5, 2, 3], income: [2, 2, 2, 5, 3], weather: [4, 3, 3, 2, 5] });
export const STRONG = 8, SOME = 3;   // a suggestion needs a clear margin: the score is a transparent rule set, not a precise model
const TILL = { conventional: 0.5, reduced: 0.8, notill: 1 }, OM_TILL = { conventional: 0.75, reduced: 0.9, notill: 1 };
const ERODE = { sand: 0.85, loam: 1, silt: 1.25, clay: 0.8 }, IRR_FACTOR = { none: 0, limited: 0.4, full: 0.8 };
const POOL_GROUPS = ['grain', 'legume', 'oil', 'fibre'];   // vegetables, roots, sugar and tobacco need markets and labour the data cannot see: never proposed
// The keys an evidence line names for its "i" (NASA POWER, GPM and MERRA-2 have their cards in js/sources.js).
export const SOURCE_KEYS = lockAll({
  power: 'NASA POWER daily weather', gpm: 'NASA GPM IMERG rain', merra2: 'NASA MERRA-2 weather model',
  fao56: 'FAO Irrigation and Drainage Paper 56 (Allen et al. 1998), Table 11', ecocrop: 'FAO ECOCROP',
  faowater: 'FAO Irrigation Water Management Training Manual 3', faoky: 'FAO Irrigation and Drainage Papers 33 and 66',
  nch40: 'National Corn Handbook NCH-40 (Neild & Newman)', luo2011: 'Luo 2011, Climatic Change 109:583–598', crophalo: "Crophalo's own rule set and crop scales",
  aci: 'Agriculture and Agri-Food Canada, Annual Crop Inventory (30 m)', cdl: 'USDA NASS Cropland Data Layer (30 m)', fao: 'FAOSTAT, harvested area by country',
  eccc: 'Environment and Climate Change Canada, daily climate records of 35 Ontario stations', wintersurvival: 'OMAFRA Field Crop News, Winter Survival',
  era5land: 'ERA5-Land coldest nights (Open-Meteo)',
});

// ---- small words
const short = id => cropName(id, true);
const low = id => short(id).toLowerCase();
const are = id => /s$/.test(short(id)) ? 'are' : 'is';
const adj = id => low(id).replace(/(bean|pea|nut|flower|oat|lentil|potato|green bean)s$/, '$1');   // "a late soybean harvest"
const keys = list => [...new Set(list)];
const list = items => items.length < 2 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
const round = v => Math.round(v);
const one = v => (Math.round(v * 10) / 10).toString();
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const capital = text => text ? text[0].toUpperCase() + text.slice(1) : text;
const minus = v => String(round(v) + 0).replace('-', '−');   // −24, with a true minus sign; + 0 so −0 reads 0
const winterChecked = (id, C) => kindOf(id, C) === 'winter' && fin(cropOf(id)?.winterKill);
// Frost dates are kept as season keys (js/climate.js seasonKey): the day of the year in the north, half a year on in the south.
const keyOf = (C, d) => fin(d) ? seasonKey(((Math.round(d) - 1) % 365 + 365) % 365 + 1, !!C.south) : NaN;
const frostDay = (C, key) => fin(key) ? keyToDoy(key, !!C.south) : NaN;
const sownInAutumn = (id, C) => ['winter', 'autumn'].includes(kindOf(id, C));   // sown in autumn, harvested the next year: no spring frost after its sowing
// The years a timing's harvest lies past its sowing year's season year: north of the equator a season year is the calendar year; south of it
// it runs half a year later (July to June), so a summer crop cut after New Year and a winter crop cut that November share one season year.
const yearsOn = (C, tm) => fin(tm?.harvest) ? Math.floor((tm.harvest - (C.south ? SOUTH_SHIFT : 0) - 1) / 365) : 0;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const seasonWords = C => C.season?.months?.length ? `${MONTH_NAMES[C.season.months[0]]} to ${MONTH_NAMES[C.season.months.at(-1)]}` : 'the six wettest months';   // the growing season of js/climate.js
const rainKeys = C => C.source === 'era5' ? [] : ['power', C.imerg ? 'gpm' : 'merra2'];

// ---- the farmer's answers and the place, read once
function contextOf(state, C, spot = {}, opts = {}) {
  const s = state && typeof state === 'object' ? state : {}, rot = s.rotation ?? {}, farm = s.farm ?? {}, soil = s.soil ?? {};
  const preset = typeof rot.preset === 'string' ? presetOf(rot.preset) : null;
  const slots = (preset?.slots?.length ? preset.slots : Array.isArray(rot.custom) ? rot.custom : []).filter(id => isCrop(id) && cropOf(id).type !== 'cover');
  const texture = ['sand', 'loam', 'silt', 'clay'].includes(spot.soil?.texture) ? spot.soil.texture : ['sand', 'loam', 'silt', 'clay'].includes(soil.texture) && soil.mode !== 'assumed' ? soil.texture : null;
  const source = spot.soil?.source ?? (texture ? (soil.mode === 'manual' ? 'own' : 'map') : 'assumed');
  const prio = Array.isArray(s.prio) && s.prio.length === 5 && s.prio.every(v => Number.isInteger(v) && v >= 0 && v <= 5) ? s.prio : PRIORITY_SETS.balanced;
  const second = {}; if (rot.second && typeof rot.second === 'object') for (const k of Object.keys(rot.second)) if (/^[0-9]$/.test(k) && isCrop(rot.second[k])) second[k] = rot.second[k];
  const today = doyOfIso(opts.today ?? spot.today) ?? (C?.through ? doyOfIso(C.through) : null);
  return withLimits(s, C, spot, {
    slots, irrigation: ['none', 'limited', 'full'].includes(farm.irrigation) ? farm.irrigation : 'none', irrigationAsked: ['none', 'limited', 'full'].includes(farm.irrigation),
    tillage: own(TILL, farm.tillage) ? farm.tillage : 'reduced', livestock: farm.livestock === true, coverOK: farm.coverOK !== false, labor: farm.labor === true,
    texture: texture ?? 'loam', soilSource: texture ? source : 'assumed', slope: fin(spot.slope) ? spot.slope : fin(s.area?.slope) ? s.area.slope : null,
    fieldDrawn: spot.fieldDrawn === true || !!s.area, elev: fin(spot.elev) ? spot.elev : NaN, soilTest: s.soilTest ?? null,
    prio, avoid: new Set(Array.isArray(s.avoid) ? s.avoid.filter(isCrop) : []), absent: new Set(Array.isArray(spot.absent) ? spot.absent.filter(isCrop) : []),
    common: spot.common && typeof spot.common === 'object' ? spot.common : {}, recordsRead: Array.isArray(spot.absent) || !!spot.common,
    nearby: spot.nearby && typeof spot.nearby === 'object' ? spot.nearby : null,
    relax: Array.isArray(spot.relax) ? spot.relax.filter(t => t && t.crops && typeof t.crops === 'object') : [],   // the steps by which the nearby-crops rule may be relaxed (js/nearby.js)
    country: typeof spot.country === 'string' && spot.country ? spot.country : null, second, today,
  });
}
const fitCtx = ctx => ({ irrigation: ctx.irrigation, texture: ctx.texture, elev: ctx.elev, soilTest: ctx.soilTest });

// The shortest repeating cycle: corn, soy, corn, soy is corn, soy.
export function shortestCycle(slots) {
  const n = slots.length;
  for (let k = 1; k <= n; k++) if (n % k === 0 && slots.every((id, i) => id === slots[i % k])) return slots.slice(0, k);
  return [...slots];
}
const signature = o => `${o.slots.join('>')}|${o.covers.map(c => c ? 1 : 0).join('')}|${o.tillage}|${Object.entries(o.seconds).map(e => e.join(':')).join(',')}`;

// ---- one option laid out on the field's normal years: the timing of each slot, the turn to the next crop, cover crops, second crops
// Days are counted on the cycle: slot i is harvested in season year i of the cycle (yearsOn); day 1 is 1 January of year 0; the cycle wraps.
function coverCropFor(C, slots) {
  const legume = slots.some(id => cropOf(id).group === 'legume');
  if (C.tropic && C.med.P > 1200) return 'sunnhemp';   // the wet tropics
  if (!C.coldWinter && !C.dry && C.med.P > 600 && !legume) return 'vetchmix';   // mild, wet winters and no legume grown
  return 'ryecover';   // cereal rye where it is dry or cold
}
export function layout(o, C, ctx) {
  const N = o.slots.length, Y = normalYear(C);
  const t = o.slots.map(id => cropTiming(id, C));
  const follow = o.slots.map(() => null);
  o.slots.forEach((id, i) => {
    if (id === 'fallow' || kindOf(id, C) !== 'winter') return;
    const prevId = o.slots[(i - 1 + N) % N];
    if (prevId === 'fallow') return;
    const f = followOn(id, prevId, C);
    follow[i] = f;
    if (f.ok) { t[i] = f.next; if (f.shortened && (i - 1 + N) % N !== i) t[(i - 1 + N) % N] = f.prev; }
    else if (f.why === 'window' && f.next?.ok && fin(f.next.sow)) t[i] = f.next;   // past its last good sowing day: still never sown before the crop before it is off (the check says it fails)
  });
  const rel = tm => { const back = 365 * yearsOn(C, tm); return { sow: tm.sow - back, harvest: tm.harvest - back }; };   // on the harvest's season year
  // Every other crop is never sown into the crop before it either: one sown in autumn where winters are mild, or with the rains, whose usual
  // day comes before the harvest before it is off moves to a week after that harvest and is checked again at its new date (js/season.js).
  // Slot i is harvested in season year i, so on its own count the crop before it comes off on that crop's own harvest day less 365.
  const pushed = o.slots.map(() => null);
  for (let lap = 0; lap < 2; lap++) for (let i = 0; i < N; i++) {   // twice round the cycle: a move at its end can reach its first crop
    const id = o.slots[i], j = (i - 1 + N) % N, kind = kindOf(id, C);
    if (id === 'fallow' || o.slots[j] === 'fallow' || follow[i] || kind === 'winter' || kind === 'calendar') continue;
    const sowAt = rel(t[i]).sow, offAt = rel(t[j]).harvest - 365;
    if (!fin(sowAt) || !fin(offAt) || sowAt >= offAt + TURN) continue;
    const day = offAt + TURN + 365 * yearsOn(C, t[i]), moved = cropTiming(id, C, { sow: day });
    pushed[i] = { from: pushed[i]?.from ?? t[i].sow, to: day, ok: !!moved.ok && fin(moved.harvest) };
    t[i] = moved;
  }
  const L = N * 365, wrap = d => ((Math.round(d) - 1) % L + L) % L;
  const at = o.slots.map((id, i) => {
    if (id === 'fallow' || !fin(t[i].sow) || !fin(t[i].harvest)) return null;
    const r = rel(t[i]);
    return { sow: i * 365 + r.sow, harvest: i * 365 + r.harvest };
  });
  const cov = new Float64Array(L).fill(NaN), what = new Array(L).fill(null);
  const paint = (from, to, f, kind) => { for (let d = from; d < to; d++) { const k = wrap(d); cov[k] = f(d); what[k] = kind; } };
  o.slots.forEach((id, i) => { if (id === 'fallow') paint(i * 365 + 1, (i + 1) * 365 + 1, () => cropOf('fallow').cover, { state: 'bare', crop: 'fallow' }); });
  const covers = o.slots.map(() => null), seconds = o.slots.map(() => null), gaps = o.slots.map(() => null);
  o.slots.forEach((id, i) => {
    const a = at[i]; if (!a) return;
    let j = (i + 1) % N, add = 365 * (i + 1 >= N ? N : 0); while (!at[j] && j !== i) { j = (j + 1) % N; if (j === 0) add = 365 * N; }
    const next = at[j] ? at[j].sow + (j <= i ? N * 365 : 0) : a.harvest + 365;   // the next crop's sowing day on the same count
    gaps[i] = { from: a.harvest, to: next, next: o.slots[j] };
    if (o.seconds[i]) {
      const sf = secondFit(id, o.seconds[i], C, { mainTiming: t[i] });
      seconds[i] = { id: o.seconds[i], fit: sf, from: sf.ok ? i * 365 + rel(t[i]).harvest + TURN : NaN, to: sf.ok ? i * 365 + rel(t[i]).harvest + TURN + sf.total : NaN };
    }
    if (o.covers[i]) {
      const gapDays = next - a.harvest, harvestMonth = monthAt(a.harvest), months = Array.from({ length: Math.max(1, Math.round(gapDays / 30.4)) }, (_, k) => (harvestMonth + k) % 12);
      const warm = Math.max(...months.map(m => C.monthly.tmean[m]).filter(fin));
      if (gapDays >= 60 && warm >= 6) {
        const cc = coverCropFor(C, o.slots), from = (seconds[i]?.fit?.ok ? seconds[i].to : a.harvest) + TURN;
        const rain = sum(Array.from({ length: Math.max(0, next - from) }, (_, k) => Y.rain(from + k)));
        covers[i] = { id: cc, from, to: next, rain, dry: clamp(1 - 0.8 * rain / cropOf(cc).water) };
      }
    }
  });
  o.slots.forEach((id, i) => {   // straw after harvest, then the cover crop, then the crop itself painted last
    const a = at[i]; if (!a) return;
    const crop = cropOf(id), g = gaps[i], resid = crop.resid * TILL[o.tillage];
    paint(g.from, g.to, () => resid, { state: resid > 0 ? 'residue' : 'bare', crop: id });
    const cc = covers[i];
    if (cc) paint(cc.from, cc.to, d => Y.tmean(d) > -8 ? Math.max(resid, cropOf(cc.id).cover * (d - cc.from < 30 ? 0.5 : 1)) : resid, { state: 'cover', crop: cc.id });
    const s = seconds[i];
    if (s?.fit?.ok) paint(s.from, s.to, d => cropOf(s.id).cover * (d - s.from < 20 ? 0.5 : 1), { state: 'crop', crop: s.id });
    const init = t[i].stages?.[0] ?? 0;
    paint(a.sow, a.harvest, d => crop.cover * (d - a.sow < init ? 0.5 : 1), { state: 'crop', crop: id });
  });
  for (let k = 0; k < L; k++) if (!fin(cov[k])) { cov[k] = 0; what[k] = { state: 'bare', crop: null }; }
  const monthly = Array.from({ length: N * 12 }, (_, g) => { const y = Math.floor(g / 12), m = g % 12, from = y * 365 + BEFORE[m]; let s = 0; for (let d = 0; d < MONTH_DAYS[m]; d++) s += cov[from + d]; return s / MONTH_DAYS[m]; });
  return { N, t, back: t.map(tm => yearsOn(C, tm)), follow, pushed, at, covers, seconds, gaps, monthly, cov, bareMonths: monthly.filter(v => v < 0.3).length / N, yearCover: mean([...cov]) };
}
const BEFORE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
function monthAt(d) { const day = ((Math.round(d) - 1) % 365 + 365) % 365; let m = 0; while (m < 11 && day >= BEFORE[m + 1]) m++; return m; }

// ---- scoring one option
export function evaluate(o, C, ctx) {
  const lay = layout(o, C, ctx), N = lay.N, Y = normalYear(C), crops = o.slots;
  const share = i => { const id = crops[i], tm = lay.t[i], u = usualOf(id, kindOf(id, C) === 'winter' ? 'au' : 'sp'); return tm.len && u && tm.len !== u.len && tm.total < u.total && kindOf(id, C) !== 'winter' ? tm.total / u.total : 1; };   // a shortened variety counts in step with its days
  const years = (C.yearly?.frostLast ?? []).map((v, k) => ({ last: v, first: C.yearly.frostFirst[k] }));
  const perSlot = crops.map((id, i) => {
    const crop = cropOf(id), tm = lay.t[i];
    if (id === 'fallow') return { id, water: 0.55 * 0.55 + 0.45 * 0.7, ratio: Infinity, need: 0, resil: 0.5, income: 0, om: 0, nfix: 0, root: 0, fallow: 1 };
    const w = supplyOf(id, C, { ...fitCtx(ctx), prevFallow: crops[(i - 1 + N) % N] === 'fallow' }, tm);
    const waterFit = clamp((w.ratio - 0.45) / 0.6), lowUse = 1 - clamp((w.need - 250) / 600), cc = lay.covers[i];
    const water = 0.55 * waterFit + 0.45 * lowUse - (cc ? 0.30 * cc.dry : 0);
    const s = seasonOf(id, C, tm), heatDays = crop.heat > 60 || !fin(s.days) ? 0 : sumDays(s.sow, s.harvest, d => Y.hotNear(crop.heat, d));
    const heatExp = clamp(heatDays / 25), tender = crop.frost < 0.3, r = { sow: tm.harvest > 365 && sownInAutumn(id, C) ? NaN : keyOf(C, tm.sow), harvest: keyOf(C, tm.harvest > 365 ? tm.harvest - 365 : tm.harvest) };   // on the frost keys' count
    const hit = years.filter(y => (fin(r.sow) && fin(y.last) && y.last >= r.sow) || (tender && fin(r.harvest) && fin(y.first) && y.first <= r.harvest));
    const frostRisk = years.length ? hit.length / years.length * (1 - crop.frost) : 0;
    const droughtExp = (fin(C.droughtYears) ? C.droughtYears : 0) * (1 - crop.drought) * (1 - IRR_FACTOR[ctx.irrigation]) * 1.6;
    let resil = 1 - clamp(0.40 * heatExp + 0.375 * frostRisk + 0.35 * clamp(droughtExp));
    const k = share(i), sc = lay.seconds[i]?.fit?.ok ? lay.seconds[i] : null;   // a second crop that failed its checks earns nothing
    let income = crop.income * k + (ctx.livestock ? 0.2 * crop.forage : 0) + (cc ? cropOf(cc.id).income : 0);
    if (ctx.irrigation !== 'none' && w.need > 0) income -= 0.08 * clamp(IRRIGATION_MM[ctx.irrigation] / w.need) * crop.water / 700;
    let om = crop.om * OM_TILL[o.tillage] * k + (cc ? 0.5 * cropOf(cc.id).om : 0), nfix = crop.nfix * k + (cc ? cropOf(cc.id).nfix : 0);
    if (sc) { const s2 = cropOf(sc.id), k2 = clamp(sc.fit.share); income += s2.income * k2; om += 0.5 * s2.om * k2; nfix += s2.nfix * k2; resil = (resil + 1 - clamp(0.35 * clamp((C.droughtYears || 0) * (1 - s2.drought) * 1.6))) / 2; }
    return { id, water, waterFit, ratio: w.ratio, need: w.need, rain: w.rain, supply: w.supply, resil, heatDays, frostHit: hit.length, frostOf: years.length, income, om: clamp(om), nfix: clamp(nfix), root: clamp(Math.min(crop.root, 3) / 2.2), fallow: 0, share: k };
  });
  const coverN = lay.covers.filter(Boolean).length, secondN = lay.seconds.filter(s => s?.fit?.ok).length;
  const families = new Set(crops.filter(id => id !== 'fallow').map(id => cropOf(id).fam)).size, kinds = new Set(crops.filter(id => id !== 'fallow')).size;
  const diversity = 0.6 * Math.min(families, 3) / 3 + 0.4 * Math.min(kinds + coverN / 2, 4) / 4;
  const fallowShare = crops.filter(id => id === 'fallow').length / N;
  const soil = clamp((0.28 * mean(perSlot.map(p => p.om)) + 0.22 * clamp(mean(perSlot.map(p => p.nfix)) * 1.8) + 0.15 * mean(perSlot.map(p => p.root)) + 0.20 * lay.yearCover + 0.15 * diversity - 0.30 * fallowShare) * 1.15 + 0.08);
  // soil wash-off: month weights follow rain and heavy-rain days (× 0.4 in months under −3 °C, the ground is frozen)
  const P = C.monthly.P, H = C.monthly.heavy, sP = sum(P.filter(fin)), sH = sum(H.filter(fin));
  const weight = Array.from({ length: 12 }, (_, m) => (0.5 * (fin(P[m]) && sP > 0 ? P[m] / sP : 0) + 0.5 * (fin(H[m]) && sH > 0 ? H[m] / sH : 0)) * (C.monthly.tmean[m] < -3 ? 0.4 : 1));
  const exposure = sum(lay.monthly.map((c, g) => weight[g % 12] * (1 - c))) / N;
  const slopeF = !fin(ctx.slope) ? 0.8 : ctx.slope < 2 ? 0.4 : ctx.slope < 6 ? 0.75 : ctx.slope < 12 ? 1.1 : 1.5;
  const hazard = slopeF * ERODE[ctx.texture] * clamp(0.6 + 0.4 * (fin(C.med.heavy) ? C.med.heavy : 0) / 5, 0.6, 1.6), risk = hazard * exposure;
  const erosion = 1 - clamp(risk / 1.1);
  const income = clamp((mean(perSlot.map(p => p.income)) + 0.04 * diversity) / 0.8);
  const water = clamp(mean(perSlot.map(p => p.water)));
  const weather = clamp(mean(perSlot.map(p => p.resil)) + 0.06 * diversity + 0.02 * coverN / N);
  // pest break over each neighbouring pair, the last to the first too
  let pest;
  if (N === 1) pest = 0.1;
  else {
    pest = mean(crops.map((a, i) => { const b = crops[(i + 1) % N], A = cropOf(a), B = cropOf(b); return a === b ? 0 : a === 'fallow' || b === 'fallow' ? 0.8 : A.fam === B.fam || (A.scl && B.scl) ? 0.35 : 1; }));
    if (N >= 3) pest += 0.1;
  }
  lay.seconds.forEach((s, i) => { if (!s?.fit?.ok) return; const S = cropOf(s.id); pest += (S.fam !== cropOf(crops[i]).fam ? 0.1 : 0) / N - ([crops[i], crops[(i + 1) % N]].includes(s.id) ? 0.1 : 0) / N; });
  pest = clamp(pest);
  const parts = { water, soil, erosion, income, weather }, w = ctx.prio, wsum = sum(w);
  const overall = (wsum > 0 ? sum(DIMS.map((d, k) => w[k] * parts[d.id])) / wsum : mean(Object.values(parts))) * 0.9 + 0.1 * pest + goalTerm(ctx, perSlot);
  const extra = 0.03 * Math.max(0, N - 2) + coverN / N * (ctx.labor ? 0.08 : 0.04) + secondN / N * (ctx.labor ? 0.10 : 0.06);   // short on workers or machines: a cover or second crop costs more, never less
  return { score: Math.round(100 * clamp(overall - extra)), parts, pest, perSlot, lay, risk, erosionLevel: risk < 0.22 ? 'low' : risk < 0.5 ? 'medium' : 'high', diversity, coverN, secondN, extra };
}
function sumDays(from, to, f) { let s = 0; for (let d = from; d < to; d++) { const v = f(d); if (fin(v)) s += v; } return s; }

// ---- the checks on one option: infeasible and borderline crops, and the turn from one crop to the next in every variant
export function check(o, C, ctx, ev) {
  const lay = ev?.lay ?? layout(o, C, ctx), marks = {};
  o.slots.forEach((id, i) => {
    if (id === 'fallow' || marks[id]?.flag === 'fails') return;
    const f = feasible(id, C, { ...fitCtx(ctx), prevFallow: o.slots[(i - 1 + o.slots.length) % o.slots.length] === 'fallow', tm: lay.t[i] });
    if (!f.ok) { marks[id] = { flag: 'fails', words: f.words }; return; }
    const fol = lay.follow[i];
    if (fol && !fol.ok) { marks[id] = { flag: 'fails', words: fol.words }; return; }
    const s = sureField(id, C, fitCtx(ctx));
    const variantsFail = scenarios(C).slice(1).filter(V => { if (!fol) return false; const f2 = followOn(id, o.slots[(i - 1 + o.slots.length) % o.slots.length], V); return !f2.ok; }).map(V => V.variant);
    const fails = [...new Set([...s.fails, ...variantsFail])], cold = winterCold(id, C);
    if (fails.length || fol?.tight || cold) marks[id] = { flag: 'borderline', fails, tight: !!fol?.tight, cold };
    else if (!marks[id]) marks[id] = { flag: 'holds', fails: [] };
  });
  o.covers.forEach((c, i) => { const cc = lay.covers[i]; if (cc) { const f = feasible(cc.id, C, fitCtx(ctx)); if (!f.ok) marks[cc.id] = { flag: 'fails', words: f.words }; } });
  Object.entries(o.seconds).forEach(([i, id]) => { const s = lay.seconds[i]; if (s && !s.fit.ok) marks[`second:${id}`] = { flag: 'second', words: s.fit.words }; });
  const flags = Object.entries(marks).filter(([k]) => !k.startsWith('second:')).map(([, m]) => m.flag);
  return { marks, flag: flags.includes('fails') ? 'fails' : flags.includes('borderline') ? 'borderline' : 'holds' };
}

// Winter cold on a crop that rests through the winter. The crop table's winterKill is what the hardened crop survives (winter wheat about
// −24 °C, OMAFRA). Where the coldest night of a normal winter (the colder of the two records) is colder than that, the crop lives through
// the winter only under snow, which the weather record cannot see: it only just suits. No 2 °C slack is added: the line holds the air
// against what the plant itself survives, and on a cold night the plant at its crown, in the soil, is warmer than the air above it.
// Never "doesn't suit" on this alone: under snow, farmers grow winter wheat where the nights are far colder (New Liskeard, Thunder Bay).
// A cold winter (about once in ten years) with a night under DEEP_COLD (js/compare.js) also makes it only just suit: it survives only under steady snow cover there.
export function winterCold(id, C) {
  const kill = cropOf(id)?.winterKill, night = fin(C?.coldLow) ? C.coldLow : C?.coldNight, night10 = fin(C?.coldLow10) ? C.coldLow10 : C?.coldNight10;
  if (!fin(kill) || kindOf(id, C) !== 'winter') return null;
  const normal = fin(night) && night < kill, deep = fin(night10) && night10 < DEEP_COLD;
  if (!normal && !deep) return null;
  return { night, kill, snow: cropOf(id).winterSnow ?? null, normal, deep, night10 };
}

// ---- building the options from the farmer's own rotation (never from a catalogue of permutations)
function poolOf(C, ctx, keep) {
  return cropIds((crop, id) => crop.type === 'cash' && POOL_GROUPS.includes(crop.group) && !ctx.avoid.has(id) && !ctx.absent.has(id) && keep(crop, id))
    .map(id => ({ id, fit: cropFit(id, C, fitCtx(ctx)) + (fin(ctx.common[id]) ? ctx.common[id] : 0) }))
    .filter(x => x.fit > -5).sort((a, b) => b.fit - a.fit || a.id.localeCompare(b.id));
}
export function generate(ctx, C) {
  const base = shortestCycle(ctx.slots), out = [], none = s => s.map(() => false);
  if (!base.length) return out;
  const make = (kind, slots, more = {}) => ({ kind, slots, covers: more.covers ?? none(slots), tillage: more.tillage ?? ctx.tillage, seconds: more.seconds ?? {} });
  const seconds = {}; Object.entries(ctx.second).forEach(([k, id]) => { if (+k < base.length) seconds[k] = id; });
  out.push(make('existing', base, { seconds }));
  const grown = new Set(base), ratioOf = id => { const w = supplyOf(id, C, fitCtx(ctx)); return w.ratio; };
  if (ctx.coverOK) out.push(make('cover', base, { covers: base.map(id => id !== 'fallow') }));
  if (ctx.tillage !== 'notill') out.push(make('notill', base, { tillage: 'notill' }));
  const legumes = base.filter(id => cropOf(id).group === 'legume' || cropOf(id).legumeMix);
  if (!legumes.length) {
    const best = poolOf(C, ctx, crop => crop.group === 'legume').map(x => ({ ...x, rank: 0.5 * cropOf(x.id).income + 0.5 * clamp(ratioOf(x.id) / 1.2) })).sort((a, b) => b.rank - a.rank)[0];
    if (best) {
      const f = base.indexOf('fallow'), thirsty = [...base].sort((a, b) => (cropOf(b).water ?? 0) - (cropOf(a).water ?? 0))[0];
      out.push(make('legume', f >= 0 ? base.map((id, i) => i === f ? best.id : id) : base.length === 1 ? [...base, best.id] : base.map(id => id === thirsty ? best.id : id)));
    }
  } else if (base.length < 4) {
    const best = poolOf(C, ctx, (crop, id) => crop.group !== 'legume' && !grown.has(id))[0];
    if (best) out.push(make('legume', [...base, best.id]));
  }
  const thirsty = base.filter(id => id !== 'fallow').map(id => ({ id, ratio: ratioOf(id) })).sort((a, b) => a.ratio - b.ratio)[0];
  if (thirsty && (thirsty.ratio < 0.9 || C.droughtYears >= 0.5)) {
    const T = cropOf(thirsty.id), next = new Set([base[(base.indexOf(thirsty.id) + 1) % base.length], base[(base.indexOf(thirsty.id) - 1 + base.length) % base.length]]);
    const pick = poolOf(C, ctx, (crop, id) => crop.drought >= 0.55 && crop.drought >= T.drought && !next.has(id) && id !== thirsty.id)
      .map(x => ({ ...x, rank: 0.5 * cropOf(x.id).drought + 0.3 * cropOf(x.id).income + 0.4 * clamp(ratioOf(x.id) / 1.2) })).filter(x => (supplyOf(x.id, C, fitCtx(ctx)).need) < 0.95 * supplyOf(thirsty.id, C, fitCtx(ctx)).need).sort((a, b) => b.rank - a.rank)[0];
    if (pick) out.push(make('drought', base.map(id => id === thirsty.id ? pick.id : id)));
  }
  if ((ctx.livestock || ctx.prio[1] >= 4 || ctx.prio[2] >= 4) && !ctx.avoid.has('alfalfa') && !ctx.absent.has('alfalfa') && feasible('alfalfa', C, fitCtx(ctx)).ok && ratioOf('alfalfa') >= 0.8) {
    const cash = poolOf(C, ctx, crop => crop.group !== 'legume')[0];
    if (cash) out.push(make('forage', ['alfalfa', 'alfalfa', cash.id]));
  }
  if (!C.tropic) {
    const cool = poolOf(C, ctx, (crop, id) => crop.minT <= 6 && id !== 'wheat' && crop.group !== 'legume')[0], leg = poolOf(C, ctx, crop => crop.group === 'legume')[0];
    const warm = poolOf(C, ctx, crop => crop.minT >= 10 && crop.group !== 'legume')[0], wheatOK = !ctx.avoid.has('wheat') && !ctx.absent.has('wheat') && feasible('wheat', C, fitCtx(ctx)).ok;
    const four = [cool?.id, leg?.id, warm?.id, wheatOK ? 'wheat' : 'barley'].filter(Boolean), uniq = [...new Set(four)];
    if (uniq.length >= 3 && uniq.every(id => feasible(id, C, fitCtx(ctx)).ok)) out.push(make('diverse', uniq, { covers: ctx.coverOK ? uniq.map(() => true) : none(uniq) }));
  } else {
    const warm = poolOf(C, ctx, crop => crop.group !== 'legume'), leg = poolOf(C, ctx, crop => crop.group === 'legume');
    const four = [warm[0]?.id, leg[0]?.id, warm[1]?.id, leg[1]?.id].filter(Boolean);
    if (new Set(four).size >= 3) out.push(make('diverse', four));
  }
  // first wins; at most nine; a new option never uses an avoided crop or one nobody grows here
  const seen = new Set();
  return out.filter(o => { const k = signature(o); if (seen.has(k)) return false; seen.add(k); return o.kind === 'existing' || o.slots.every(id => id === 'fallow' || (!ctx.avoid.has(id) && !ctx.absent.has(id))); }).slice(0, 9);
}

// One decision rule for the whole report: a firm suggestion passes the checks with room to spare AND leads clearly.
export function endorses(option, base) {
  if (!option || !base || option.flag !== 'holds') return false;
  const gain = option.score - base.score;
  return gain >= STRONG || (base.flag === 'fails' && gain >= SOME);
}

// ---- the plans: real dates for the field's coming years
function firstYear(o, lay, ctx) {
  const t0 = lay.t[0], today = ctx.today;
  if (!today) return null;
  let y = today.year;
  const sowAt = year => ({ year: year - lay.back[0], doy: t0.sow });
  if (fin(t0.sow)) while (sowAt(y).year < today.year || (sowAt(y).year === today.year && t0.sow <= today.doy)) y++;
  else y++;
  return y;
}
export function planOf(o, C, ctx, ev, chk, year0, count) {
  const lay = ev.lay, N = lay.N, seasons = [];
  for (let k = 0; k < Math.max(count, N); k++) {
    const i = k % N, id = o.slots[i], tm = lay.t[i], year = year0 + k;
    if (id === 'fallow' || !fin(tm.sow)) { seasons.push({ year, crop: id, sow: null, harvest: null, after: 'bare', residueUntil: null, window: null, stages: null, variety: null, wake: null, cover: null, coverFrom: null, coverUntil: null, timing: id === 'fallow' ? 'Fallow: no crop in the ground this year.' : timingWords(tm) }); continue; }
    const sowYear = year - lay.back[i], g = lay.gaps[i], cc = lay.covers[i];
    const dateAt = d => isoOf(year0 + (k - i) + Math.floor((d - 1) / 365), ((d - 1) % 365 + 365) % 365 + 1);   // a day of the cycle, in this lap of it
    const crop = cropOf(id), resid = crop.resid * TILL[o.tillage];
    seasons.push({
      year, crop: id, sow: isoOf(sowYear, tm.sow), harvest: isoOf(sowYear, tm.harvest), after: cc ? 'cover' : resid > 0 ? 'residue' : 'bare',
      residueUntil: g ? dateAt(cc ? cc.from : g.to) : null,
      window: tm.window ? { earliest: isoOf(sowYear, tm.window.earliest), latest: isoOf(sowYear, tm.window.latest) } : null,
      stages: tm.stages ? [...tm.stages] : null, variety: tm.len ?? null, wake: fin(tm.wake) ? isoOf(sowYear, tm.wake) : null,
      cover: cc ? cc.id : null, coverFrom: cc ? dateAt(cc.from) : null, coverUntil: cc ? dateAt(cc.to) : null,
      second: lay.seconds[i] ? { crop: lay.seconds[i].id, ok: lay.seconds[i].fit.ok, words: lay.seconds[i].fit.words, sow: lay.seconds[i].fit.ok ? dateAt(lay.seconds[i].from) : null, harvest: lay.seconds[i].fit.ok ? dateAt(lay.seconds[i].to) : null } : null,
      residue: resid, timing: timingWords(tm),
    });
  }
  return seasons.slice(0, Math.max(count, N));
}
const nameOf = o => {
  const crops = o.slots.map((id, i) => i === 0 ? short(id) : low(id));
  let name = crops.length === 1 ? `${crops[0]} every year` : `${crops.slice(0, -1).join(', then ')}, then ${crops.at(-1)}`.replace(/^([^,]*), then ([^,]*)$/, '$1, then $2');
  if (o.covers.some(Boolean)) name += ', with a cover crop after harvest';
  if (o.kind === 'notill') name += ', without ploughing';
  return name;
};

// ---- the four texts of one option (why, evidence, gaps, risks), built from its own numbers
function textsOf(o, ev, chk, C, ctx, base, baseEv) {
  const lay = ev.lay, why = [], evidence = [], gaps = [], risks = [];
  const rk = rainKeys(C), names = [...new Set(o.slots)].filter(id => id !== 'fallow');
  const bare = one(lay.bareMonths), bareBase = baseEv ? one(baseEv.lay.bareMonths) : null;
  // why
  const added = o.slots.filter(id => !base?.slots.includes(id));
  if (o.kind === 'existing') why.push('This is what you grow now. We compare every other idea with it.');
  else if (o.kind === 'cover') why.push(`After harvest your soil is bare for about ${bareBase} months a year. A cover crop in that gap keeps roots and straw on the ground, which can help heavy rain take less soil.`);
  else if (o.kind === 'notill') why.push('Keep your crops, but stop ploughing. The old crop straw stays on top, which can help protect the soil.');
  else if (o.kind === 'legume' && added.length && cropOf(added[0]).group !== 'legume') {
    const w = added[0], f = lay.follow[o.slots.indexOf(w)];
    why.push(`Adding ${low(w)} makes your rotation ${o.slots.length} years long. Pests and diseases that build up when the same crops come back often may be broken up.`);
    if (f?.follow) why.push(`${short(w)} ${are(w)} sown in the fall after the ${adj(f.prev.id)} harvest, so living plants cover the ground through the fall and spring, when the soil would otherwise carry only ${adj(f.prev.id)} residue.`);
  } else if (o.kind === 'legume') why.push(`${short(added[0] ?? o.slots[0])} make${are(added[0] ?? o.slots[0]) === 'are' ? '' : 's'} their own fertiliser (nitrogen) from the air and leave some in the soil for the next crop. They can also help break the cycle of pests that like your main crops.`);
  else if (o.kind === 'drought') why.push(`${short(base.slots.find(id => !o.slots.includes(id)))} needs the most water of your crops (about ${cropOf(base.slots.find(id => !o.slots.includes(id))).water} mm a season). ${short(added[0])} ${are(added[0]) === 'are' ? 'need' : 'needs'} less water and handle${are(added[0]) === 'are' ? '' : 's'} dry spells better, so a dry year may hurt less.`);
  else if (o.kind === 'forage') why.push(`Two years of alfalfa can give deep roots, some nitrogen for the next crop and hay for your animals. Then ${low(o.slots[2])} can use the nitrogen it leaves behind.`);
  else if (o.kind === 'diverse') why.push(`A ${o.slots.length}-year mix (${list(o.slots.map(low))}) uses different crop families in turn, which can spread the weather risk, puts a nitrogen-fixing crop in the rotation and can help break pest cycles.`);
  // evidence
  evidence.push({ text: `Your soil would be bare about ${bare} months a year${bareBase !== null && o.kind !== 'existing' ? ` (now ${bareBase})` : ''}.`, sources: ['power', 'fao56', 'crophalo'] });
  if (fin(C.med.heavy)) evidence.push({ text: `Heavy-rain days (20 mm or more in a day): about ${one(C.med.heavy)} a year${fin(C.med.maxDay) ? ` (the wettest day of a normal year gives about ${round(C.med.maxDay)} mm)` : ''}.`, sources: rk });
  evidence.push({ text: `${fin(ctx.slope) ? `Land sloping about ${one(ctx.slope)} in 100` : 'Slope not read, so a medium slope is used'}; soil wash-off with this mix: ${ev.erosionLevel}.`, sources: ['power', 'crophalo'] });
  const ratios = ev.perSlot.filter(p => p.id !== 'fallow' && fin(p.ratio));
  const worst = ratios.sort((a, b) => a.ratio - b.ratio)[0];
  if (worst) evidence.push({ text: worst.ratio >= 1 ? 'Rain covers all of what these crops need in a normal year.' : `In a normal year rain covers about ${round(worst.ratio * 100)} of every 100 mm ${low(worst.id)} ${are(worst.id) === 'are' ? 'need' : 'needs'}.`, sources: [...rk, 'faowater', 'faoky'] });
  if (C.dryOf > 0) evidence.push({ text: C.dryYears.length ? `In ${C.dryYears.length} of the last ${C.dryOf} growing seasons (${seasonWords(C)}) rain fell a quarter or more short of its usual amount, or the soil was clearly dry (${list(C.dryYears.map(String))}).` : `In none of the last ${C.dryOf} growing seasons (${seasonWords(C)}) did rain fall a quarter short of its usual amount.`, sources: keys(['power', ...rk]) });
  const frostKeys = C.frostMargin > 0 ? ['power', 'eccc'] : ['power'];   // where the autumn date comes from (js/climate.js autumnLine)
  // The usual frost dates are the middle of the years that had a frost; where under half the years had one (frostFreeClimate) there is no usual date to give.
  const frostYears = (C.yearly?.frostLast ?? []).filter(fin).length;
  if (C.frostFreeClimate === true && C.years.length) evidence.push({ text: frostYears ? `Frost came in only ${frostYears} of the last ${C.years.length} years on NASA’s record, so no usual frost dates are given. A weather station near you can see frost more often, most of all in low, cold spots.` : `No frost came in the last ${C.years.length} years on NASA’s record. A weather station near you can still see some, most of all in low, cold spots.`, sources: frostKeys });
  else if (fin(C.med.frostLast) && fin(C.med.frostFirst)) evidence.push({ text: `The usual last spring frost is about ${dayWord(frostDay(C, C.med.frostLast))} and the usual first autumn frost about ${dayWord(frostDay(C, C.med.frostFirst))} (the middle of ${frostYears < C.years.length ? `the ${frostYears} years with a frost` : `${C.years.length} years`}).${autumnWords(C.frostMargin, C.source, ctx.country)}`, sources: frostKeys });
  names.forEach(id => { const i = o.slots.indexOf(id), tm = lay.t[i]; if (tm?.ok) evidence.push({ text: `${timingWords(tm)}${tm.len ? ` ${varietyWords(tm)}` : ''}`, sources: ['power', 'fao56', ...(tm.byWarmth ? ['ecocrop'] : []), ...(fin(tm.hot) ? ['luo2011'] : [])] }); });
  lay.follow.forEach((f, i) => {
    if (!f?.follow || !f.ok) return;
    const w = f.next.window, wid = o.slots[i];
    evidence.push({ text: `${short(wid)} needs about ${w.init} days to come up and root (FAO-56) before the normal daily mean drops under ${w.minT} °C (about ${dayWord(w.cold)}), so the last good sowing day here is about ${dayWord(w.latest)}; sown on ${dayWord(f.next.sow)} it gathers about ${round(f.next.units)} °C-days above 0 °C before then.`, sources: ['power', 'fao56', 'ecocrop'] });
    const firsts = (C.yearly?.frostFirst ?? []).filter(fin), early = firsts.filter(v => v < keyOf(C, w.latest)).length;
    if (firsts.length) evidence.push({ text: early ? `The first autumn frost came before ${dayWord(w.latest)} in ${early} of ${firsts.length} years.` : `The first autumn frost never came before ${dayWord(w.latest)} in ${firsts.length} years.`, sources: frostKeys });
  });
  names.filter(id => winterChecked(id, C)).forEach(id => {   // the winter-cold check of a crop that rests through the winter, with its figures
    const crop = cropOf(id), night = fin(C.coldLow) ? C.coldLow : C.coldNight, night10 = fin(C.coldLow10) ? C.coldLow10 : C.coldNight10;
    evidence.push({ text: `Hardened ${low(id)} survives about ${minus(crop.winterKill)} °C${fin(crop.winterSnow) ? `, and ${crop.winterSnow} cm of snow keeps colder nights off it` : ''} (${crop.winterBy}); the coldest night of a normal winter here is about ${minus(night)} °C${fin(night10) ? `, and of a cold winter about ${minus(night10)} °C` : ''}.`, sources: ['power', ...(C.coldRecords === 2 ? ['era5land'] : []), 'wintersurvival'] });
  });
  if (ctx.recordsRead && typeof ctx.nearby?.line === 'string' && own(SOURCE_KEYS, ctx.nearby.source)) {   // what farmers grow around the field (js/nearby.js)
    evidence.push({ text: ctx.nearby.line, sources: [ctx.nearby.source] });
    if (typeof ctx.nearby.left === 'string' && ctx.nearby.left) evidence.push({ text: ctx.nearby.left, sources: [ctx.nearby.source, 'crophalo'] });
  }
  const st = stressYears(o, lay, C, ctx);
  if (st.of > 0) evidence.push({ text: st.crossed.length ? `No stress thresholds crossed in ${st.of - st.crossed.length} of ${st.of} tested years (${C.years[0]} to ${C.years.at(-1)}); the others are ${list(st.crossed.map(c => String(c.year)))}.` : `No stress thresholds crossed in ${st.of} tested years (${C.years[0]} to ${C.years.at(-1)}).`, sources: keys(['power', ...rk]), rules: st.rules, years: st.crossed });
  // gaps
  gaps.push(ctx.soilSource === 'assumed' ? 'No soil was measured here, so loam is assumed until the soil lookup answers. A soil test from your field would make every score better.' : ctx.soilSource === 'own' ? 'Your soil type is your own choice by feel and colour, not a test of your field.' : ctx.soilSource === 'world' ? 'Your soil type came from a rough world map, not a test of your field.' : ctx.soilSource === 'test' ? 'Your soil comes from the lab test you typed in.' : 'Your soil type comes from a soil map, not a test of your field.');
  if (!ctx.irrigationAsked) gaps.push('Watering was not answered, so the field is taken as rain-fed.');
  gaps.push('Satellites can\'t see your drains, field edges or packed soil.');
  gaps.push('Bare months come from the usual crop calendar on your normal weather, not from what grows on your field this year.');
  gaps.push('The scores use typical prices, never yours. Money figures are a rough guide.');
  if (!ctx.recordsRead) gaps.push(typeof ctx.nearby?.gap === 'string' && ctx.nearby.gap ? ctx.nearby.gap : 'What farmers around here grow was not read, so no crop was checked against local practice.');
  if (o.slots.includes('corn')) gaps.push('FAO-56 season lengths are used as printed: they are not stretched for this field\'s cooler summers.');
  if (lay.follow.some(f => f?.follow)) gaps.push(`We count one week from a harvest to the next sowing. A no-till drill can be quicker, a wet harvest slower.`);
  const winterIds = names.filter(id => kindOf(id, C) === 'winter'), unchecked = winterIds.filter(id => !winterChecked(id, C));
  if (winterIds.length > unchecked.length) gaps.push('Snow is not in the weather record: the winter-cold check counts the coldest nights, not the snow that shelters a winter crop from them.');
  if (unchecked.length) gaps.push(`Winter cold on ${list(unchecked.map(low))} is not checked: Crophalo has no winter-hardiness figure for ${unchecked.length > 1 ? 'them' : 'it'}. The coldest night of a normal winter here is about ${minus(C.coldNight)} °C.`);
  gaps.push(SQUARE_WORDS);
  if (o.covers.some(Boolean)) gaps.push('Cover crop seed price, sowing date and when to end it are different in every area.');
  if (Object.keys(o.seconds).length) gaps.push('A second crop is placed with one week between harvesting a crop and sowing the next. Our data has no yields for second crops.');
  // risks: a failed check first, then the borderline line, then the rest
  Object.entries(chk.marks).forEach(([id, m]) => {
    if (m.flag === 'fails') risks.push(`${short(id)} ${are(id) === 'are' ? 'do' : 'does'} not pass the weather${ctx.soilTest ? ', water or soil test' : ' or water'} check at this spot. Treat this option as a question to ask local farmers, not as advice. ${m.words}`);
    if (m.flag === 'second') risks.push(`${m.words} It earns no credit in the score.`);
  });
  Object.entries(chk.marks).forEach(([id, m]) => {
    if (m.flag !== 'borderline') return;
    const parts = [];
    if (m.tight) parts.push(`the turn from the harvest before it to its last good sowing day is under ${TIGHT} days in a normal year`);
    if (m.fails.length) parts.push(`with weather ${list(m.fails.map(v => VARIANT_WORDS[v]))} than the NASA weather square, it could fall short`);
    if (m.cold?.normal) parts.push(`the coldest night of a normal winter here, about ${minus(m.cold.night)} °C, is colder than the ${minus(m.cold.kill)} °C that hardened ${low(id)} survives (${cropOf(id).winterBy}), so it lives through the winter only under snow${fin(m.cold.snow) ? ` (${m.cold.snow} cm is enough)` : ''}`);
    if (m.cold?.deep) parts.push(`in a cold winter, about once in ten years, the coldest night is about ${minus(m.cold.night10)} °C, so it survives only under steady snow cover here`);
    risks.push(`${short(id)} only just suit${are(id) === 'are' ? '' : 's'} this field: ${parts.join('; and ')}. Ask farmers near you.`);
  });
  lay.follow.forEach((f, i) => {
    if (!f?.follow) return;
    const prev = f.usualPrev, nxt = f.usualNext, wid = o.slots[i], pid = prev.id, harvestDay = prev.harvest > 365 ? prev.harvest - 365 : prev.harvest;
    if (!nxt.window || !fin(harvestDay)) return;   // a crop before it with no harvest day here squeezes nothing: why it has none is said with its own check
    const room = nxt.window.latest - (harvestDay + TURN);
    risks.push(`A late ${adj(pid)} harvest squeezes the ${low(wid)} sowing window: in a normal year the ${low(pid)} ${are(pid)} ready about ${dayWord(harvestDay)}, and a week later ${room >= 0 ? `leaves ${plural(room, 'day')} before` : `is ${plural(-room, 'day')} past`} the last good sowing day here (about ${dayWord(nxt.window.latest)}).${f.shortened ? ` So the plan uses a ${f.prev.len === 's' ? 'short-season' : 'shorter'} ${low(pid)} variety (about ${f.prev.total} days in FAO tables, ready about ${dayWord(f.prev.harvest)}).` : ''}`);
  });
  if (lay.bareMonths >= 4) risks.push(`Your soil would be bare for about ${bare} months a year. Heavy rain can take soil away.`);
  if (ev.erosionLevel === 'high') risks.push('Soil wash-off on this land with this mix: high.');
  if (ev.pest < 0.5) risks.push('When the same crops come back often, their pests and diseases build up.');
  if ((C.trend?.heat32?.t > 1.5) || (C.trend?.P?.t < -1.5)) risks.push('The weather is changing (more hot days or less rain). That is slowly getting worse for these crops.');
  const frosty = ev.perSlot.filter(p => p.frostHit > 0);
  // What the count holds, said as it is: a year counts when that year's last spring frost came on or after the sowing day, or, for a crop that
  // frost kills, its first autumn frost came on or before the harvest day; a frost before the crop is up counts too (no emergence day is placed).
  const tenderHits = frosty.filter(p => cropOf(p.id).frost < 0.3), hardyHits = frosty.filter(p => !(cropOf(p.id).frost < 0.3)), hits = list => list.map((p, k) => `${low(p.id)} in ${p.frostHit} of ${p.frostOf}${k === 0 ? ' years' : ''}`);
  if (frosty.length) risks.push(`In some years a frost came ${tenderHits.length ? `on or after the sowing day, or by the harvest day (${list(hits(tenderHits))})` : ''}${tenderHits.length && hardyHits.length ? ', and ' : ''}${hardyHits.length ? `on or after the sowing day for crops that stand frost (${list(hits(hardyHits))})` : ''}. This counts a frost before the crop is up too. Check your sowing dates with farmers near you.`);
  names.forEach(id => { const tm = lay.t[o.slots.indexOf(id)]; (tm?.remarks ?? []).filter(r => /heat units|shorter hybrid|frost/.test(r)).forEach(r => risks.push(r)); });
  if (o.slots.includes('fallow')) risks.push('In a fallow year the soil is bare, and water dries out of it.');
  if (o.covers.some(Boolean)) risks.push('Cover crops drink water too. In a dry spring, less is left for the next crop. Ask a local adviser when to end them.');
  if (o.kind === 'notill') risks.push('Without ploughing you may need other weed control and a different planter. Cold, wet soil warms up more slowly in spring.');
  if (base && o.kind !== 'existing') { const more = mean(ev.perSlot.map(p => p.need)) - mean(baseEvNeed(baseEv)); if (more > 40) risks.push(`It needs more water than what you grow now (about ${round(mean(ev.perSlot.map(p => p.need)))} mm instead of ${round(mean(baseEvNeed(baseEv)))} mm a season). In a dry year it depends on water stored in the soil or on watering.`); }
  return { why, evidence, gaps, risks, one: whyOne(o, lay, base, bareBase) };
}
// The plan's why in ONE sentence (the contract's Plan.why); the longer lines stay as whyLines.
function whyOne(o, lay, base, bareBase) {
  const added = o.slots.filter(id => !base?.slots.includes(id)), first = added[0] ?? o.slots[0];
  if (o.kind === 'existing') return 'This is what you grow now, and every other idea is compared with it.';
  if (o.kind === 'cover') return `A cover crop after each harvest puts roots and leaves on soil that is now bare about ${bareBase} months a year, so heavy rain takes less soil.`;
  if (o.kind === 'notill') return 'The same crops without ploughing leave the old crop straw on top, where it can help protect the soil.';
  if (o.kind === 'legume' && added.length && cropOf(added[0]).group !== 'legume') {
    const f = lay.follow[o.slots.indexOf(added[0])];
    return f?.follow ? `${short(added[0])} ${are(added[0])} sown in the fall after the ${adj(f.prev.id)} harvest, so living plants cover the ground through the fall and spring, when the soil would otherwise carry only ${adj(f.prev.id)} residue.`
      : `Adding ${low(added[0])} makes your rotation ${o.slots.length} years long, which may break up the pests and diseases that build up when the same crops come back often.`;
  }
  if (o.kind === 'legume') return `${short(first)} make${are(first) === 'are' ? '' : 's'} their own fertiliser (nitrogen) from the air and leave some in the soil for the next crop.`;
  if (o.kind === 'drought') { const gone = base.slots.find(id => !o.slots.includes(id)); return `${short(first)} ${are(first) === 'are' ? 'need' : 'needs'} less water than ${low(gone)} and handle${are(first) === 'are' ? '' : 's'} dry spells better, so a dry year may hurt less.`; }
  if (o.kind === 'forage') return `Two years of alfalfa can give deep roots, some nitrogen and hay, and then ${low(o.slots[2])} can use the nitrogen it leaves behind.`;
  return `A ${o.slots.length}-year mix (${list(o.slots.map(low))}) uses different crop families in turn, which can spread the weather risk and can help break pest cycles.`;
}
const baseEvNeed = ev => ev ? ev.perSlot.map(p => p.need).filter(fin) : [];

// The years that crossed a stress threshold, counted on the field's own record. Rules (each named in the fold):
// a frost-tender crop sown before that year's last spring frost; a frost-tender crop not yet harvested at that year's first autumn
// frost; a dry growing season for a rain-fed crop that flowers in it; 10 or more days of 35 °C or more while a crop whose heat limit
// is under 35 °C stands in the field.
// Hot days in the field: that year's days of 35 °C or more month by month (js/climate.js yearly.heat35m), a month the crop stands in for
// only part of it counted in step with its days there. The crop's year is the one it is harvested in. A month not read gives no count.
const hotInField = (C, k, tm) => {
  const H = C.yearly?.heat35m; if (!Array.isArray(H) || !fin(tm.sow) || !fin(tm.harvest)) return NaN;
  const last = Math.floor((Math.round(tm.harvest) - 1) / 365); let n = 0;
  for (let d = Math.round(tm.sow); d < Math.round(tm.harvest); d++) { const row = H[k + Math.floor((d - 1) / 365) - last], m = monthAt(d); if (!row || !fin(row[m])) return NaN; n += row[m] / MONTH_DAYS[m]; }
  return n;
};
// A dry growing season is laid on a rain-fed crop that flowers in it, as a grain crop's yield answers most to water around flowering (FAO
// Irrigation and Drainage Paper 33, yield response by growth stage); a crop timed with no flowering day is judged by the middle of its season.
// A winter-rain place (the Western Australian wheatbelt, the Swartland, central Chile): the season counted holds the drier half of the year's
// rain, and every month of the other, rainy half averages above 5 °C, warm enough for crops to grow (the growing season of FAO GAEZ,
// js/climate.js GROW_LINE). There a crop sown in autumn grows in the rainy winter, so the counted season's rain is not laid on it; a summer
// crop still is. Where the winter months are colder (Ireland, the Netherlands, the Columbia Basin, Konya) nothing changes. No new number.
const winterRains = C => {
  const months = C.season?.months, P = C.monthly?.P, T = C.monthly?.tmean;
  if (C.coldWinter !== false || !months?.length || !Array.isArray(P) || !Array.isArray(T) || P.some(v => !fin(v)) || T.some(v => !fin(v))) return false;
  const other = MONTH_DAYS.map((_, m) => m).filter(m => !months.includes(m)), inside = months.reduce((s, m) => s + P[m], 0), outside = other.reduce((s, m) => s + P[m], 0);
  return inside < outside && other.every(m => T[m] > GROW_LINE);
};
const floweringInSeason = (C, tm, id) => { const months = C.season?.months; if (!months?.length) return true; if (winterRains(C) && sownInAutumn(id, C)) return false; const d = fin(tm.flower) ? tm.flower : (tm.sow + tm.harvest) / 2; return !fin(d) || months.includes(monthAt(d)); };
export function stressYears(o, lay, C, ctx) {
  const Y = C.years ?? [], rules = ['A frost-tender crop sown before that year\'s last spring frost', 'A frost-tender crop not yet harvested at that year\'s first autumn frost', 'A dry growing season (rain a quarter short, or clearly dry soil) for a rain-fed crop that flowers in it; where most rain falls in a mild winter, not for a crop sown in autumn, which grows on that rain', '10 or more days of 35 °C or more while a crop whose heat stress starts below 35 °C stands in the field'];
  const dry = new Set(C.dryYears ?? []), crossed = [];
  let of = 0;
  Y.forEach((year, k) => {
    const last = C.yearly.frostLast[k], first = C.yearly.frostFirst[k];
    of++;
    const why = [];
    o.slots.forEach((id, i) => {
      if (id === 'fallow') return;
      const crop = cropOf(id), tm = lay.t[i], tender = crop.frost < 0.3, sow = tm.harvest > 365 && sownInAutumn(id, C) ? NaN : keyOf(C, tm.sow), harvest = keyOf(C, tm.harvest > 365 ? tm.harvest - 365 : tm.harvest);
      if (tender && fin(sow) && fin(last) && last >= sow) why.push(`${low(id)}: spring frost on ${dayWord(frostDay(C, last))}`);
      if (tender && fin(harvest) && fin(first) && first <= harvest) why.push(`${low(id)}: autumn frost on ${dayWord(frostDay(C, first))}`);
      if (ctx.irrigation === 'none' && dry.has(year) && floweringInSeason(C, tm, id)) why.push(`${low(id)}: dry season`);
      const hot = crop.heat < 35 ? hotInField(C, k, tm) : NaN;
      if (hot >= 10) why.push(`${low(id)}: about ${round(hot)} days of 35 °C or more in the field`);
    });
    if (why.length) crossed.push({ year, why: [...new Set(why)] });
  });
  return { of, crossed, rules };
}

// ---- how sure the answer is: data completeness plus the score gap, never a chance
function surenessOf(best, base, ctx, C) {
  let points = 0; const why = [];
  const gain = best ? (best.flag === 'holds' ? best.score - base.score : 0) : 0;
  if (best && best.flag !== 'holds') why.push({ firm: false, text: 'Best idea only just suits, so it is not offered as a change' });
  if (base.flag === 'fails') { points -= 1; why.push({ firm: false, text: 'What you grow now doesn\'t suit here: confirm that first' }); }
  if (gain >= 15) { points += 2; why.push({ firm: true, text: 'The suggestion scores well ahead' }); }
  else if (gain >= STRONG) { points += 1; why.push({ firm: true, text: 'The suggestion scores clearly ahead' }); }
  else if (gain >= SOME) why.push({ firm: false, text: 'Options score close: pick the one that suits your farm' });
  else why.push({ firm: false, text: 'No option scores clearly ahead of what you grow now' });
  if (ctx.soilSource === 'assumed') { points -= 1; why.push({ firm: false, text: 'Soil: loam assumed until the soil lookup answers. A soil test makes this firmer' }); }
  else if (ctx.soilSource === 'map' || ctx.soilSource === 'test') { points += 1; why.push({ firm: true, text: ctx.soilSource === 'test' ? 'Soil: from your lab test' : 'Soil: from a soil map' }); }
  else why.push({ firm: false, text: ctx.soilSource === 'world' ? 'Soil: from a rough world map. A soil test makes this firmer' : 'Soil: your own pick by feel and colour' });
  if (C.source !== 'era5') { points += 1; why.push({ firm: true, text: `Weather: NASA, since ${C.years[0]}` }); } else why.push({ firm: false, text: 'Weather: the back-up record, not NASA' });
  if (ctx.fieldDrawn && fin(ctx.slope)) { points += 1; why.push({ firm: true, text: 'Slope: measured on your drawn field' }); } else why.push({ firm: false, text: 'Slope: not read for your field. Draw your field for its own slope' });
  if (!ctx.country) { points -= 1; why.push({ firm: false, text: 'No country found here, so the crops grown nearby are not known' }); }
  const level = points >= 4 && ctx.soilSource !== 'world' && base.flag !== 'fails' ? 'Very sure' : points >= 2 ? 'Fairly sure' : 'Somewhat sure';
  return { level, why, points };
}

// ---- everything for one field
// The engine's long calls are written as steps: a call that does its work in several pieces yields between them, so a caller that must not block (a page without a worker)
// can run one piece, let the screen breathe, and run the next. optionsFor and analyse are the same calls run to the end at once: the answers are the same, to the byte.
const drain = gen => { let r = gen.next(); while (!r.done) r = gen.next(); return r.value; };
function* evaluateAllSteps(ctx, C) {
  const options = [];
  for (const o of generate(ctx, C)) { const ev = evaluate(o, C, ctx), chk = check(o, C, ctx, ev); options.push({ o, ev, chk, score: ev.score, flag: chk.flag }); yield 'option'; }
  // A new idea whose winter crop cannot follow the crop before it in time (its sowing window closes before that harvest is off), or whose
  // crop moved to a week after the harvest before it no longer fits there, is no idea at all and is dropped; the farmer's own rotation is
  // always shown, with the reason it fails.
  const base = options[0], rest = options.slice(1).filter(x => !x.ev.lay.follow.some(f => f && !f.ok) && !x.ev.lay.pushed.some(p => p && !p.ok));
  const scoreOf = x => fin(x.score) ? x.score : -Infinity;   // an option that could not be scored ranks last
  const rank = (a, b) => (a.flag === 'fails') - (b.flag === 'fails') || (a.flag === 'borderline') - (b.flag === 'borderline') || scoreOf(b) - scoreOf(a);
  rest.sort(rank);
  // Three strategies need two other ideas of two different kinds. Where the nearby-crops rule leaves fewer, it is relaxed one step at a time (a crop on 100 ha or more
  // nearby, then any crop the crop map sees nearby, then the crops the country's own list holds) until there are enough. Only ideas that suit the place are added,
  // each carries the crops that made it an exception (rare), and they rank after the ideas built under the full rule: toPlan says so on the strategy.
  const night10 = fin(C.coldLow10) ? C.coldLow10 : C.coldNight10;
  const kinds = () => new Set(rest.filter(x => x.flag !== 'fails' && !x.o.slots.some(id => cropOf(id)?.winterKill !== undefined && fin(night10) && night10 < DEEP_COLD)).map(x => x.o.kind)).size;
  if (ctx.relax.length && ctx.absent.size && kinds() < 2) {
    const seen = new Set(options.map(x => signature(x.o))), open = new Map();
    for (const tier of ctx.relax) {
      Object.entries(tier.crops).forEach(([id, ha]) => { if (ctx.absent.has(id) && !open.has(id)) open.set(id, { id, step: tier.step, ha: fin(ha) ? ha : null, name: typeof tier.name === 'string' ? tier.name : '' }); });
      for (const o of generate({ ...ctx, absent: new Set([...ctx.absent].filter(id => !open.has(id))) }, C)) {
        const k = signature(o); if (seen.has(k)) continue; seen.add(k);
        const ev = evaluate(o, C, ctx), chk = check(o, C, ctx, ev); yield 'option';
        if (chk.flag === 'fails' || ev.lay.follow.some(f => f && !f.ok) || ev.lay.pushed.some(p => p && !p.ok)) continue;
        rest.push({ o, ev, chk, score: ev.score, flag: chk.flag, rare: [...new Set(o.slots)].filter(id => open.has(id)).map(id => open.get(id)) });
      }
      if (kinds() >= 2) break;
    }
    // among the exceptions, one that keeps every crop the farmer grows and adds to them comes before one that takes a crop of theirs out
    const keeps = x => base.o.slots.every(id => x.o.slots.includes(id));
    rest.sort((a, b) => (a.flag === 'fails') - (b.flag === 'fails') || !!a.rare - !!b.rare || (a.rare && b.rare ? keeps(b) - keeps(a) : 0) || rank(a, b));
  }
  return { base, rest };
}
function* analyseSteps(state, climate, spot = {}, opts = {}) {
  const ctx = contextOf(state, climate, spot, opts);
  const { base, rest } = yield* evaluateAllSteps(ctx, climate);
  const best = rest[0] ?? null;
  return { ctx, base, others: rest, best, gain: best ? (fin(best.score - base.score) ? best.score - base.score : null) : 0, endorsed: endorses(best, base) };
}
export function analyse(state, climate, spot = {}, opts = {}) { return drain(analyseSteps(state, climate, spot, opts)); }

// A plan that does not suit here, or could not be scored, carries no number at all: "Doesn't suit here" next to a 69 reads as a good
// idea. Its words (fitWhy) say why instead. The numbers stay inside the engine, where they still rank the options.
const shownScore = x => x.flag !== 'fails' && fin(x.score);
function fitWhyOf(x) {
  if (shownScore(x)) return null;
  const words = Object.values(x.chk.marks).filter(m => m.flag === 'fails' && m.words).map(m => m.words);
  return `${words.length ? `${words.join(' ')} ` : ''}So it has no score here.`;
}
function toPlan(x, kind, C, ctx, base, baseEv, year0, count) {
  year0 = Math.max(year0, firstYear(x.o, x.ev.lay, ctx) ?? year0);   // a plan never starts with a sowing that is already past
  const t = textsOf(x.o, x.ev, x.chk, C, ctx, base?.o, baseEv), shown = shownScore(x);
  const parts = Object.fromEntries(Object.entries(x.ev.parts).map(([k, v]) => [k, shown && fin(v) ? Math.round(100 * v) : null]));   // a part not worked out is null, never a guess
  const scores = Object.fromEntries(DIMS.map(d => [d.id, parts[d.id] ?? null]));
  if (x.rare?.length) {   // built with a crop the nearby-crops rule had left out: said first under why, and beside the line that says such crops are not suggested
    const low = id => cropName(id, true).toLowerCase(), far = x.rare.filter(r => r.step === 'country'), near = x.rare.filter(r => r.step !== 'country');
    const lines = [near.length ? rareWords.lead(near.map(r => r.ha !== null ? rareWords.some(low(r.id), r.ha) : rareWords.little(low(r.id)))) : '', far.length ? rareWords.leadNone(far.map(r => rareWords.none(low(r.id), r.name || 'this country'))) : ''].filter(Boolean);
    t.lessCommon = lines.join(' ');
    t.why = [t.lessCommon, ...t.why];
    t.evidence = t.evidence.map(e => e.text === ctx.nearby?.left ? { ...e, text: `${e.text} ${rareWords.left(x.rare.map(r => low(r.id)))}` } : e);
  }
  return {
    id: kind === 'current' ? 'current' : `${x.o.kind}-${x.o.slots.join('-')}${x.o.covers.some(Boolean) ? '-cover' : ''}${x.o.tillage === 'notill' && x.o.kind === 'notill' ? '-notill' : ''}`,
    name: nameOf(x.o), kind, seasons: planOf(x.o, C, ctx, x.ev, x.chk, year0, count),
    score: shown ? x.score : null, scores, parts, pest: shown ? Math.round(100 * x.ev.pest) : null, flag: x.flag, fit: FLAG_WORDS[x.flag], fitWhy: fitWhyOf(x), optionKind: x.o.kind, slots: [...x.o.slots],
    bareMonths: Math.round(x.ev.lay.bareMonths * 10) / 10, erosionLevel: x.ev.erosionLevel, why: t.one, whyLines: t.why, evidence: t.evidence, gaps: t.gaps, risks: t.risks, ...(t.lessCommon ? { lessCommon: t.lessCommon } : {}),
  };
}
// The answer for a point that is not farmland at all: no plans, no figures, the reason in words.
const notHere = reason => ({ current: null, recommended: null, others: [], reason, notFarmland: true, evidence: [], gaps: [], risks: [], sureness: null, sureWhy: [], endorsed: false, gain: null });

function* stepsInner(state, climate, spot = {}, opts = {}) {
  const C = climate && typeof climate === 'object' && climate.monthly ? climate : null;
  if (spot?.water === true) return notHere(WATER_WORDS);   // the crop map's class at the pin is water (js/nearby.js)
  if (spot?.notField && typeof spot.notField.text === 'string' && spot.fieldOk !== true) return askField(spot.notField);   // forest, wetland, developed land...: no plan until the farmer says it is a field
  if (C && notFarmlandWords(C)) return notHere(notFarmlandWords(C));   // sea or ice under the weather square, or no growing season at all
  const ctx0 = contextOf(state, C, spot, opts);
  if (!ctx0.slots.length) return { current: null, recommended: null, others: [], reason: 'Tell us what you grow now, and the field report compares other ideas with it.', evidence: [], gaps: ['No crops were given for this field.'], risks: [], sureness: null, sureWhy: [], endorsed: false, gain: null };
  if (!C) {
    const seasons = shortestCycle(ctx0.slots).map((id, k) => ({ year: null, crop: id, sow: null, harvest: null, after: id === 'fallow' ? 'bare' : 'residue', residueUntil: null, window: null, stages: null, variety: null, wake: null, cover: null, coverFrom: null, coverUntil: null, timing: '' }));
    const scores = Object.fromEntries(DIMS.map(d => [d.id, null]));
    return { current: { id: 'current', name: nameOf({ slots: shortestCycle(ctx0.slots), covers: [], kind: 'existing' }), kind: 'current', seasons, score: null, scores, parts: { ...scores }, why: 'This is what you grow now; it is not scored until the field\'s weather is read.', whyLines: [] }, recommended: null, others: [], reason: 'The field\'s NASA weather has not been read yet, so nothing is compared.', evidence: [], gaps: ['No weather has been read for this field yet, so no sowing dates, scores or checks can be worked out.'], risks: [], sureness: null, sureWhy: [], endorsed: false, gain: null };
  }
  const a = yield* analyseSteps(state, C, spot, opts), ctx = a.ctx;
  const year0 = firstYear(a.base.o, a.base.ev.lay, ctx) ?? (C.y1 + 2);
  const current = toPlan(a.base, 'current', C, ctx, null, null, year0, Math.max(3, a.base.o.slots.length));
  const others = [];
  for (const x of a.others) { others.push(toPlan(x, 'proposed', C, ctx, a.base, a.base.ev, year0, Math.max(3, x.o.slots.length))); yield 'plan'; }
  const recommended = a.endorsed ? others[0] : current;
  const sure = surenessOf(a.best, a.base, ctx, C);
  const pick = a.endorsed ? a.best : null, best = a.best ? others[0] : null;
  // What the comparison is set against: the current plan's own score, or, when it has none, why (it does not suit, or could not be scored).
  const failWords = (Object.values(a.base.chk.marks).find(m => m.flag === 'fails' && m.words)?.words ?? '').replace(/\.$/, ''), why = failWords ? ` (${failWords.charAt(0).toLowerCase()}${failWords.slice(1)})` : '';
  const nowWhy = fin(current.score) ? '' : `what you grow now ${a.base.flag === 'fails' ? 'doesn\'t suit here' : 'could not be scored here'}${why}`;
  let reason, close = 0, after = '';
  if (pick) {
    const r = others[0], change = [];
    if (r.bareMonths < current.bareMonths) change.push(`the soil is bare about ${r.bareMonths} months a year instead of ${current.bareMonths}`);
    if (fin(current.parts.soil) && r.parts.soil - current.parts.soil >= 4) change.push(`the soil score is ${r.parts.soil - current.parts.soil} points higher`);
    reason = `${r.why.replace(/\.$/, '')}; it scores ${r.score}${nowWhy ? `, while ${nowWhy}` : ` against ${current.score} for what you grow now`}${change.length ? `, and ${list(change)}` : ''}.`;
  } else if (best && best.flag === 'fails') {
    reason = nowWhy ? `${capital(nowWhy)}, and no other idea passes the weather and water checks here either: ask farmers near you what grows well.`
      : `No other idea passes the weather and water checks here, so nothing is offered in place of what you grow now, which scores ${current.score}.`;
  } else if (best && nowWhy) {   // no number for what is grown now: its reason first, then the best other idea on its own
    reason = best.flag !== 'holds'
      ? `${capital(nowWhy)}, and nothing that passes every check does better: the highest scoring idea, ${best.name.toLowerCase()}, scores ${best.score} and only just suits, so it is worth a look, not a firm change.`
      : `${capital(nowWhy)}; the best other idea, ${best.name.toLowerCase()}, scores ${best.score} and passes every check, but it does not lead clearly, so it is a question for farmers near you, not a firm change.`;
  } else if (best) {
    reason = best.flag !== 'holds'
      ? `Nothing that passes every check does clearly better here; the highest scoring idea, ${best.name.toLowerCase()}, scores ${best.score} against ${current.score} now and only just suits, so it is worth a look, not a firm change.`
      : `Nothing we tested does clearly better here: the best other idea, ${best.name.toLowerCase()}, scores ${best.score} against ${current.score} for what you grow now.`;
    if (best.flag === 'holds' && best.score > current.score) close = best.score - current.score;   // said once the strategies are known (below)
    // an option that scores above the kept rotation but is not the best other idea (it only just suits, or it uses a crop that is rare nearby) is named with its reason
    const top = others.filter(p => p !== best && p.flag !== 'fails' && fin(p.score) && p.score > current.score && p.score > best.score).sort((p, q) => q.score - p.score)[0];
    if (top) after = ` ${keepWords.other(top.name, top.score, top.lessCommon ? keepWords.rare : keepWords.just)}`;
  } else reason = nowWhy ? `${capital(nowWhy)}, and Crophalo could build no other idea that fits here: ask farmers near you what grows well.` : 'Nothing we tested does clearly better here.';
  const chosen = recommended, more = finish({ a, ctx, C, current, others, recommended, generate, stressYears });
  // keep, although the best other idea scores a little higher: the reason in sight, and where that idea is shown
  if (close) reason += ` ${keepWords.close(close, more.strategies.some(s => s.role === 'worth' && s.id === best.id))}`;
  reason += after;
  return {
    current, recommended, others, reason, evidence: chosen.evidence, gaps: more.gaps.length ? [...chosen.gaps, ...more.gaps] : chosen.gaps, risks: chosen.risks,
    sureness: sure.level, sureWhy: sure.why, endorsed: a.endorsed, gain: best && fin(best.score) && fin(current.score) ? best.score - current.score : null, foot: SEASON_FOOT,
    strategies: more.strategies, fewWhy: more.fewWhy, exposure: more.exposure, exposureNote: more.exposureNote, bare: more.bare, dropped: more.dropped,
  };
}

// The map shows something that is not a field at the pin: no score and no plan, the sentence, and the two ways on (the report draws the two buttons from askField).
const ASK_WORDS = ' Crophalo gives no score or plan until you say which.';
const askField = nf => ({ ...notHere(`${nf.text}${ASK_WORDS}`), askField: { code: nf.code, word: nf.word, source: nf.source, year: nf.year, text: nf.text, actions: ['move-pin', 'carry-on'] } });
// The same steps with the farmer's word noted: a plan for a pin the map calls forest keeps one line saying so.
export function* optionsForSteps(state, climate, spot = {}, opts = {}) {
  const r = yield* stepsInner(state, climate, spot, opts);
  return spot?.notField && spot.fieldOk === true && !r.notFarmland ? { fieldNote: `The crop map shows ${spot.notField.word} here; you said it is your field.`, ...r } : r;
}
export function optionsFor(state, climate, spot = {}, opts = {}) { return drain(optionsForSteps(state, climate, spot, opts)); }

// ---- what covers the ground on a date
const STAGE_WORDS = ['sown', 'coming up', 'growing leaves', 'flowering and filling', 'ripening', 'ready to harvest'];
const dayNum = iso => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(iso ?? '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
const nice = iso => { const n = dayNum(iso); if (!fin(n)) return 'an unknown day'; const d = new Date(n * 864e5); return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
export function groundOn(plan, date) {
  const on = dayNum(date), none = note => ({ state: null, crop: null, stage: null, label: 'Planned', note });
  if (!plan || !Array.isArray(plan.seasons) || !fin(on)) return none('No plan or no date was given.');
  const S = plan.seasons.filter(s => s && fin(dayNum(s.sow)) && fin(dayNum(s.harvest)));
  for (let k = 0; k < S.length; k++) {
    const s = S[k], sow = dayNum(s.sow), harvest = dayNum(s.harvest), next = S[k + 1];
    if (on >= sow && on <= harvest) {
      let stage = on === sow ? 0 : on === harvest ? 5 : 4;
      if (Array.isArray(s.stages) && stage === 4) { let c = sow; for (let j = 0; j < 4; j++) { c += s.stages[j]; if (on < c) { stage = j + 1; break; } } }
      const living = stage >= 1 && stage <= 4;
      const prev = S[k - 1], under = stage <= 1 && prev && dayNum(prev.harvest) < sow ? ` Until it is up, the ${adj(prev.crop)} residue is the main cover.` : '';
      return { state: 'crop', crop: s.crop, stage, label: 'Planned', note: `${short(s.crop)}, sown ${nice(s.sow)}: ${living ? 'living plants' : STAGE_WORDS[stage]}${living ? `, ${STAGE_WORDS[stage]} (stage ${stage} of 4, FAO-56)` : ''}.${under}` };
    }
    const until = next ? dayNum(next.sow) : dayNum(s.residueUntil);
    if (on > harvest && fin(until) && on < until) {
      if (s.cover && fin(dayNum(s.coverFrom)) && on >= dayNum(s.coverFrom) && on < dayNum(s.coverUntil)) return { state: 'cover', crop: s.cover, stage: null, label: 'Planned', note: `${short(s.cover)}, sown after the ${low(s.crop)} harvest on ${nice(s.harvest)}, covers the ground until ${next ? `${low(next.crop)} is sown` : 'the next crop'}.` };
      if (s.second?.ok && on >= dayNum(s.second.sow) && on <= dayNum(s.second.harvest)) return { state: 'crop', crop: s.second.crop, stage: null, label: 'Planned', note: `${short(s.second.crop)}, a second crop after the ${low(s.crop)}.` };
      if (s.after === 'bare' || !(s.residue > 0)) return { state: 'bare', crop: null, stage: null, label: 'Planned', note: `Bare soil after the ${low(s.crop)} harvest on ${nice(s.harvest)}.` };
      return { state: 'residue', crop: s.crop, stage: null, label: 'Planned', note: `${capital(adj(s.crop))} residue after the harvest on ${nice(s.harvest)}: ${s.residue < 0.3 ? 'thin cover' : 'straw cover'} until ${next ? `${low(next.crop)} is sown about ${nice(next.sow)}` : 'the next crop'}.` };
    }
  }
  return none('This date is outside the years of this plan, so nothing is known about the ground then.');
}

// The walkthrough's three dates: the harvest before a winter crop, its fall establishment, and its spring growth.
export function keyDates(current, proposed) {
  if (!proposed?.seasons) return [];
  const S = proposed.seasons;
  for (let k = 1; k < S.length; k++) {
    const s = S[k], prev = S[k - 1];
    if (!s.window || !s.stages || !prev?.harvest || !s.sow) continue;
    const est = isoOf(+s.sow.slice(0, 4), doyOfIso(s.sow).doy + s.stages[0]);
    const spring = s.wake ?? null;
    const at = (key, date, label) => ({ key, date, label, current: groundOn(current, date), proposed: groundOn(proposed, date) });
    const out = [at('harvest', prev.harvest, `${capital(adj(prev.crop))} harvest`), at('establish', est, `${short(s.crop)} established for the fall`)];
    if (spring) out.push(at('spring', spring, `${short(s.crop)} growing again in spring`));
    return out;
  }
  return [];
}
export { roughWord, lengthsOf, TIGHT };
