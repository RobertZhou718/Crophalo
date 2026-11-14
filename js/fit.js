// Crophalo's fit checks: can this field crop grow here at all (fifteen yes-or-no gates, in order), how much water it gets
// against what it needs, a continuous fit for the crop chooser, and the point score for trees, bushes, vines and palms.
// Pure: no page, no storage, no network, no clock. Reads the climate object of js/climate.js and the crop table of js/crops.js.
// Checked by scripts/test_engine.mjs.
/*
 * Every limit is the crop table's (FAO ECOCROP, FAO-56, FAO Manual 3, the rows' own sources) or the field's NASA weather.
 * The 50 km weather square is the reason for every slack below (150 m of height, 3 °C above a kill, 1 °C under a minimum month).
 */
import { own } from './words.js';
import { cropOf, gardenOf, cropName } from './crops.js';
import { hotDaysAt } from './climate.js';
import { cropTiming, normalYear } from './season.js';

const fin = Number.isFinite;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const sum = list => list.reduce((a, b) => a + b, 0);
const mean = list => list.length ? sum(list) / list.length : NaN;
const deg = v => (Math.round(v * 10) / 10).toFixed(1).replace(/^-(?=.*[1-9])/, '−').replace(/^-/, '');   // −6.1, with a true minus sign
export const WATER_HOLD = Object.freeze({ sand: 80, loam: 150, silt: 185, clay: 140 });   // mm of water the soil holds per texture
export const IRRIGATION_MM = Object.freeze({ none: 0, limited: 200, full: 500 });
const monthsOfSpan = (sow, harvest) => { const set = new Set(); for (let d = sow; d < harvest; d++) { let day = ((d - 1) % 365 + 365) % 365, m = 0; while (m < 11 && day >= [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][m]) m++; set.add(m); } return [...set]; };
const span = (from, to, f) => { let s = 0; for (let d = from; d < to; d++) s += f(d); return s; };

// The months and days a crop stands in the field here: its timing (the sowing rules of js/season.js) or the crop table's months.
export function seasonOf(id, C, tm) {
  const t = tm ?? cropTiming(id, C);
  const ok = t && fin(t.sow) && fin(t.harvest) && t.harvest > t.sow;
  return ok ? { t, sow: t.sow, harvest: t.harvest, days: t.harvest - t.sow, months: monthsOfSpan(t.sow, t.harvest) } : { t, sow: NaN, harvest: NaN, days: NaN, months: [] };
}
export const seasonMean = (C, s) => { const Y = normalYear(C); return Y && s.days > 0 ? span(s.sow, s.harvest, d => Y.tmean(d)) / s.days : NaN; };

// ---- water: what the crop gets against what it needs, in a normal year
// ctx: irrigation 'none'|'limited'|'full', texture, prevFallow, afterSecond, warming (°C of a what-if).
export function supplyOf(id, C, ctx = {}, tm) {
  const crop = cropOf(id), Y = normalYear(C), s = seasonOf(id, C, tm);
  if (!crop || !Y || !fin(s.days)) return { rain: NaN, supply: NaN, need: NaN, ratio: NaN };
  const rain = span(s.sow, s.harvest, d => Y.rain(d)), pre = span(s.sow - 120, s.sow, d => Y.rain(d));
  const texture = own(WATER_HOLD, ctx.texture) ? ctx.texture : 'loam', hold = WATER_HOLD[texture];
  const carry = ctx.afterSecond ? 0 : Math.min(hold * Math.min(1, crop.root / 1.2 + 0.2), 0.5 * pre) * 0.9;
  const fallow = ctx.prevFallow && C.med.P < 700 ? Math.min(120, 0.22 * C.med.P) : 0;   // fallow stores rain only where rain is short; in a wet climate it just dries out
  const irr = (crop.type === 'cash' || crop.type === 'forage') && own(IRRIGATION_MM, ctx.irrigation) ? IRRIGATION_MM[ctx.irrigation] : 0;
  const supply = 0.8 * rain + carry + fallow + irr;
  const need = (crop.water ?? 0) * (1 + 0.04 * (fin(ctx.warming) ? ctx.warming : 0)) * (1 - 0.25 * crop.drought) * (fin(crop.days) && crop.days > 0 ? s.days / crop.days : 1);
  return { rain, pre, carry, fallow, irr, supply, need, ratio: need > 0 ? supply / need : Infinity, texture, assumedTexture: !own(WATER_HOLD, ctx.texture), season: s };
}

// ---- the gates for a field crop, in order; the crop fails at the first gate it misses
const coolestOf = C => Math.min(...C.monthly.tmean.filter(fin)), warmestOf = C => Math.max(...C.monthly.tmean.filter(fin));
const under = (C, mm) => C.monthly.P.filter(v => fin(v) && v < mm).length;
// The soil test: every hard limit is checked before any is returned (pH outside the crop's outer range; salt costing half the yield or more).
export function soilTestVeto(id, test) {
  const crop = cropOf(id), limits = crop?.soilTest, out = [];
  if (!limits || !test) return out;
  if (limits.ph && fin(test.ph) && (test.ph < limits.ph[2] || test.ph > limits.ph[3])) out.push(`the soil test's pH ${test.ph} is outside the ${limits.ph[2]} to ${limits.ph[3]} it takes (FAO ECOCROP)`);
  if (limits.salt && fin(test.ec) && (test.ec - limits.salt[0]) * limits.salt[1] >= 50) out.push(`the soil test's salt (${test.ec} dS/m) would cost half its yield or more (Maas & Hoffman 1977)`);
  return out;
}
export function feasible(id, C, ctx = {}) {
  const crop = cropOf(id), name = cropName(id, true);
  const no = (gate, words, more = {}) => ({ ok: false, gate, words: `${name}: ${words}`, ...more });
  if (!crop) return { ok: false, gate: 'unknown', words: 'This crop is not in Crophalo\'s crop table.' };
  if (!C || !C.monthly) return { ok: false, gate: 'noclimate', words: `${name}: no weather has been read for this field yet.` };
  if (crop.type === 'fallow') return { ok: true, gate: '' };
  const veto = soilTestVeto(id, ctx.soilTest);
  if (veto.length) return no('soil', `${veto.join('; ')}.`);
  if (fin(ctx.elev) && fin(crop.maxAlt) && ctx.elev > crop.maxAlt + 150) return no('height', `the field sits at ${Math.round(ctx.elev)} m, above the ${crop.maxAlt} m it is grown at.`);
  const tm = ctx.tm ?? cropTiming(id, C), s = seasonOf(id, C, tm), rainFed = !ctx.irrigation || ctx.irrigation === 'none';
  const ffd = fin(crop.ffd) ? crop.ffd : crop.frost < 0.3 ? (fin(s.days) ? s.days : crop.days) : NaN;
  if (fin(ffd) && fin(C.med.frostFree) && C.med.frostFree < ffd) return no('frostfree', `it needs about ${ffd} frost-free days and the field has about ${Math.round(C.med.frostFree)} in a normal year.`);
  if (fin(crop.needDry) && under(C, 60) < crop.needDry && (rainFed || C.med.P > 2000)) return no('needdry', `it needs ${crop.needDry} months under 60 mm to ripen and dry, and this field has ${under(C, 60)}.`);
  if (rainFed && fin(crop.minRain) && C.med.P < crop.minRain) return no('minrain', `it needs about ${crop.minRain} mm of rain a year without watering, and this field gets about ${Math.round(C.med.P)} mm.`);
  const warmest = warmestOf(C), coolest = coolestOf(C);
  if (crop.type !== 'cover' && warmest < 9 && warmest - coolest >= 6) return no('summer', `the warmest month averages only ${deg(warmest)} °C: there is no real summer here.`);
  if (fin(crop.minHot) && warmest < crop.minHot) return no('minhot', `the warmest month averages ${deg(warmest)} °C, under the ${crop.minHot} °C it needs.`);
  const Y = normalYear(C), gsRain = fin(s.days) ? span(s.sow, s.harvest, d => Y.rain(d)) : NaN;
  if (fin(crop.maxGs) && gsRain > crop.maxGs) return no('wet', `about ${Math.round(gsRain)} mm of rain falls in its season, more than the ${crop.maxGs} mm it takes before disease spreads.`);
  const warmMonths = C.monthly.tmean.filter(v => fin(v) && v >= crop.minT).length, needMonths = Math.max(2, Math.round(0.45 * (s.months.length || Math.round((crop.days ?? 120) / 30))));
  if (warmMonths < needMonths) return no('warmmonths', `only ${warmMonths} months average ${crop.minT} °C or more, and it needs ${needMonths}.`);
  if (tm && !tm.ok) return no('timing', (tm.words ?? '').replace(new RegExp(`^${name}: `), ''), { tm });
  const sm = seasonMean(C, s);
  if (fin(crop.tMax) && sm > crop.tMax) return no('toowarm', `its season averages ${deg(sm)} °C here, over the ${crop.tMax} °C it takes (FAO ECOCROP).`);
  if (fin(crop.minSeason) && sm < crop.minSeason) return no('toocool', `its season averages ${deg(sm)} °C here, under the ${crop.minSeason} °C it needs.`);
  if (fin(crop.maxCoolHumid) && C.med.P > 1000 && !(ctx.elev >= 1000) && coolest > crop.maxCoolHumid) return no('coolhumid', `the coolest month averages ${deg(coolest)} °C in a wet climate, warmer than the ${crop.maxCoolHumid} °C it takes.`);
  if (fin(crop.maxCool) && (C.med.P > 800 || coolest > 24 || warmest - coolest < 7) && coolest > crop.maxCool) return no('cool', `the coolest month averages ${deg(coolest)} °C, warmer than the ${crop.maxCool} °C it takes.`);
  if (fin(crop.minCool) && coolest < crop.minCool) return no('mincool', `the coolest month averages ${deg(coolest)} °C, under the ${crop.minCool} °C it needs.`);
  const w = supplyOf(id, C, ctx, tm);
  if (crop.type !== 'cover' && ctx.irrigation !== 'full') {
    const floor = ctx.irrigation === 'limited' ? 0.45 : fin(crop.minRatio) && sm >= 11 ? crop.minRatio : 0.6;
    if (!(w.ratio >= floor)) return no('water', `${ctx.irrigation === 'limited' ? 'rain and your watering cover' : 'rain covers'} only about ${Math.round(10 * w.ratio)} of every 10 mm of water it needs in its season.`, { water: w });
  }
  return { ok: true, gate: '', tm, water: w, seasonMean: sm };
}
export const canGrow = feasible;

// ---- a continuous fit for the crop chooser
export function heatShare(id, C, tm) {
  const crop = cropOf(id), s = seasonOf(id, C, tm), Y = normalYear(C);
  if (!crop || !Y || !fin(s.days) || crop.heat > 60) return 0;
  const days = span(s.sow, s.harvest, d => Y.hotNear(crop.heat, d));   // the bucket nearest the crop's own heat limit
  return fin(days) ? days / s.days : 0;
}
export function cropFit(id, C, ctx = {}) {
  const crop = cropOf(id);
  if (!crop || !C) return -9;
  if (crop.type === 'fallow') return C.med.P < 600 ? 1 : 0.6;
  const f = feasible(id, C, ctx);
  if (!f.ok) return -9;
  const s = seasonOf(id, C, f.tm), sm = seasonMean(C, s), top3 = mean([...C.monthly.tmean].filter(fin).sort((a, b) => b - a).slice(0, 3));
  const warmth = Math.max(0, sm - crop.tOpt?.[1]) || 0, coolness = Math.max(0, crop.tOpt?.[0] - top3) || 0;
  return Math.min(1.1, f.water?.ratio ?? 1.1) - 0.8 * heatShare(id, C, f.tm) - 0.5 * warmth - 0.8 * coolness + (crop.major ? 0.1 : 0);
}
export const fitBand = fit => fit >= 0.9 ? 3 : fit >= 0.7 ? 2 : fit > -5 ? 1 : 0;

// ---- trees, bushes, vines and palms: 2 or more fits well, 1 tolerable, 0 or less is a stretch, −9 or less is ruled out by a hard limit
export function gardenFit(id, C, ctx = {}) {
  const g = gardenOf(id);
  if (!g || !C || !C.monthly || !(fin(C.med?.P))) return -1;
  if (!g.rainOpt && !fin(g.rainMin)) return -1;
  const p = C.med.P, wet = ctx.irrigation === 'full' || ctx.irrigation === 'limited', opt = g.rainOpt ?? [g.rainMin, g.rainMax ?? Infinity];
  if (fin(ctx.elev) && fin(g.maxAlt) && ctx.elev > g.maxAlt + 150) return -9;
  let score;
  if (g.irrigated) score = p < 400 ? 2 : p <= (g.rainMax ?? Infinity) ? (p >= 0.5 * opt[0] ? 1 : 0) : -9;
  else if ((p >= opt[0] && p <= opt[1]) || (wet && !g.humid)) score = 2;
  else score = p >= (g.rainMin ?? 0.45 * opt[0]) && p <= (g.rainMax ?? 2.2 * opt[1]) ? 1 : -2;
  const coolest = coolestOf(C), hottest = warmestOf(C), night = C.coldNight, night10 = C.coldNight10;
  if (g.noFrost) score += night10 > 2 ? 1 : night10 > -2 ? -3 : -9;
  if (fin(g.winterKill)) score += night <= g.winterKill ? -9 : night <= g.winterKill + 3 ? (g.protectable ? -2 : -4) : 0;
  if (g.humid && p < 0.55 * opt[0]) score -= 9;
  if (fin(g.maxDryMonths) && under(C, 30) > g.maxDryMonths) score -= 9;
  if (fin(g.minDry) && under(C, 60) < g.minDry) score -= 9;
  if (g.dry && !wet && p > opt[1] * (g.wetMult ?? 1.5)) score -= 6;
  if (fin(g.minMonth)) score += coolest >= g.minMonth ? 0 : coolest >= g.minMonth - 1 ? -3 : -9;
  if (fin(g.winterKill) && g.winterKill >= -6 && night10 <= g.winterKill + 2) score -= 9;   // such a winter is not rare enough to plant into
  else if (fin(g.winterKill) && g.winterKill >= -16 && night10 <= g.winterKill - 2) score -= 9;
  const summerMonths = C.south ? [0, 1] : [6, 7];
  if (fin(g.dryS) && mean(summerMonths.map(m => C.monthly.P[m])) > g.dryS) score -= 9;
  if ((fin(g.dryA) && under(C, 60) >= g.dryA) || (fin(g.dryB) && under(C, 100) >= g.dryB)) score -= 9;
  if (fin(g.minNight)) score += night < g.minNight - 2 ? -9 : night < g.minNight ? -4 : 0;
  if (fin(g.needCool) && coolest > g.needCool) score += coolest <= g.needCool + 2 ? -3 : -9;
  if (fin(g.maxSummer) && hottest > g.maxSummer) score += hottest <= g.maxSummer + (g.msTol ?? 1.5) ? -3 : -9;
  if (Array.isArray(g.chill) && fin(g.chill[0])) {
    const need = g.chill[0], have = C.chill;
    if (have >= need) score += 1;
    else if (g.chillHard && have < 0.75 * need && hottest > 27 && coolest > 9) score -= 9;
    else if (g.chillSoft || have >= 0.2 * need || coolest <= 16) score -= 2;   // the grid understates chill on mild coasts, so only a near-total lack of cold hides the tree
    else score -= 5;
  }
  if (fin(g.warm)) { const n = C.monthly.tmean.filter(v => fin(v) && v >= g.warm).length; score += n >= 10 ? 0 : n === 9 ? -3 : -9; }
  if (fin(g.summer)) {
    const have = g.noFrost ? C.med.T : hottest, need = fin(g.summerMild) && coolest > 9 ? g.summerMild : g.summer;
    score += have >= need ? 0 : have >= need - 1 ? -3 : -9;
  }
  if (fin(g.heatSevere)) { const days = sum(hotDaysAt(C, g.heatSevere, 'under').filter(fin)); if (days >= 120) score -= 2; }
  return score;
}
export const gardenShown = score => score >= -1;
