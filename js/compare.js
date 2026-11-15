// The strategy comparison the report engine (js/engine.js) adds to its answer: the farmer's goals and limits as weights and hard limits,
// what each plan may offer and what to check locally, the facets of each plan, the three strategies to compare first, the months the
// soil is bare, and when the crops grown now are most exposed, counted year by year on the field's own weather record.
// Pure: no page, no storage, no network and no clock. Fixed rules and counts, each said in words. Checked by scripts/test_engine.mjs.
/*
 * FOR THE ENGINE (one call each, made by js/engine.js):
 * withLimits(state, C, spot, ctx) -> ctx with the goals and limits applied: avoid gains the crops the limits leave out (never the farmer's
 *   own crops), coverOK is false with no small-seed drill, livestock is true with the forage goal; ctx.limits holds why each crop was left out.
 * goalTerm(ctx, perSlot) -> the points (0 to 0.05) the nitrogen goal adds to a plan from its legumes; 0 without that goal.
 * finish({ a, ctx, C, current, others, recommended, generate }) -> { strategies, fewWhy, exposure, exposureNote, bare, gaps, dropped }
 *   and, on every plan: benefits [{ kind, text }], review [text], facets { nitrogen, organic, pest, forage, market, waterUse, infiltration }
 *   each { score: 0..100 | null, text, source }, bare [month 1..12].
 * strategies  [{ id, role: 'now'|'suggest'|'worth'|'another', opportunity: 'pest'|'water'|'infiltration'|'income'|'soil', text }]
 * exposure    [{ month: 1..12, hazard, crop: cropId | null, stage, count, of, text, source, sources }], the current rotation only, most years first
 * bare        [{ id, months: [1..12], text }] for each strategy
 */
import { cropOf, cropName, cropIds } from './crops.js';
import { THR } from './climate.js';
import { MONTH_DAYS } from './season.js';
import { ONTARIO_LISTED, inOntario } from './cropstep.js';
import { MONTH_NAMES, LEFT_WHY, leftLine, COVER_LEFT, LISTED_GAP, NITROGEN_EVIDENCE, FACET_NONE, FACET_BROKEN, facetWords as FW, benefitWords as BW, PART_LABELS,
  reviewWords as RW, strategyWords as SW, fewWords, bareWords, exposureWords as XW } from './words.compare.js';

const fin = Number.isFinite;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mean = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN;
const round = v => Math.round(v);
const one = v => (Math.round(v * 10) / 10).toString();
const short = id => cropName(id, true), low = id => short(id).toLowerCase();
const uniq = list => [...new Set(list)];
export const DEEP_COLD = -32;   // °C: the coldest night of a cold winter (about once in ten years) under which winter wheat survives only under steady snow cover; Crophalo's own line for winter wheat
export const GOAL_KEYS = Object.freeze(['forage', 'nitrogen', 'market']), SELL_KEYS = Object.freeze(['grain', 'feed', 'veg']);
export const OPPORTUNITIES = Object.freeze(['pest', 'water', 'infiltration', 'income', 'soil']);
export const BENEFIT_KINDS = Object.freeze(['soil', 'water', 'erosion', 'pest', 'nitrogen', 'organic', 'forage', 'income', 'weather']);
const MAPS = { aci: 'AAFC Annual Crop Inventory', cdl: 'USDA Cropland Data Layer' };
const TILL_SOAK = { conventional: 0, reduced: 0.5, notill: 1 };

// ---- the setup answers of the goals and limits step (state.goals, state.limits), read defensively: unknown keys are ignored
export function inputsOf(state) {
  const s = state && typeof state === 'object' ? state : {}, lim = s.limits && typeof s.limits === 'object' ? s.limits : {};
  const goals = new Set(Array.isArray(s.goals) ? s.goals.filter(g => GOAL_KEYS.includes(g)) : []);
  const sell = new Set(Array.isArray(lim.sell) ? lim.sell.filter(k => SELL_KEYS.includes(k)) : []);
  return { goals, sell, noDrill: lim.noDrill === true };
}
// What a crop can be sold as: grain = cash crops of the grain, legume and oil groups; feed = hay crops or a feed value of 0.4 or more; veg = vegetables.
export const sellable = (id, sell) => { const c = cropOf(id); if (!c) return false;
  return (sell.has('grain') && c.type === 'cash' && ['grain', 'legume', 'oil'].includes(c.group)) || (sell.has('feed') && (c.type === 'forage' || c.forage >= 0.4)) || (sell.has('veg') && c.group === 'veg'); };

export function withLimits(state, C, spot, ctx) {
  const g = inputsOf(state), lat = spot?.lat, lon = spot?.lon;
  const own = new Set([...ctx.slots, ...Object.values(ctx.second)]);   // the farmer's own crops are never left out of a new plan
  // Crophalo's rule: no crop map in Ontario, only the crops Statistics Canada lists for it. The national lists (nearby source 'fao', js/nearby.js countryGate) are
  // not a crop map: where only they were read, the rule still holds, beside the crops the country's list leaves out.
  const mapRead = ctx.recordsRead && ctx.nearby?.source !== 'fao';
  const listed = !mapRead && inOntario(lat, lon);
  const reasons = new Map(), leave = (id, key) => { if (!own.has(id) && !reasons.has(id)) reasons.set(id, key); };
  const pool = cropIds(c => c.type === 'cash' || c.type === 'forage');
  if (g.noDrill) pool.filter(id => cropOf(id).type === 'forage').forEach(id => leave(id, 'noDrill'));
  if (g.sell.size) pool.filter(id => !sellable(id, g.sell)).forEach(id => leave(id, 'sell'));
  if (g.goals.has('market')) pool.filter(id => !(cropOf(id).major === true || fin(ctx.common[id]))).forEach(id => leave(id, 'market'));
  if (listed) pool.filter(id => !ONTARIO_LISTED.includes(id)).forEach(id => leave(id, 'listed'));
  [...ctx.avoid].forEach(id => { if (!reasons.has(id)) reasons.set(id, 'avoid'); });   // the crops the farmer will not grow, said as such
  const rawAvoid = new Set();   // the ideas as they would be with no limits at all, to name what each limit left out
  const market = spot?.market && typeof spot.market === 'object' && spot.market.shares && typeof spot.market.shares === 'object' ? spot.market : null;
  const limits = { reasons, rawAvoid, rawCoverOK: g.noDrill ? true : ctx.coverOK, coverWhy: g.noDrill ? 'noDrill' : null, listed, goals: g.goals, sell: g.sell, noDrill: g.noDrill };
  return { ...ctx, avoid: new Set([...rawAvoid, ...reasons.keys()]), coverOK: g.noDrill ? false : ctx.coverOK, livestock: ctx.livestock || g.goals.has('forage'),
    lat: fin(lat) ? lat : null, lon: fin(lon) ? lon : null, market, limits };
}
// The nitrogen goal: legumes count for up to 5 of the 100 points (the same nitrogen term as the soil part).
export const goalTerm = (ctx, perSlot) => ctx.limits?.goals?.has('nitrogen') ? 0.05 * clamp(mean(perSlot.map(p => p.nfix).filter(fin)) * 1.8) || 0 : 0;

// ---- days and months on the cycle count (day 1 is 1 January of year 0)
const BEFORE = MONTH_DAYS.reduce((acc, d, m) => (acc.push(m ? acc[m - 1] + MONTH_DAYS[m - 1] : 0), acc), []);
const monthOf = d => { const day = ((Math.round(d) - 1) % 365 + 365) % 365; let m = 0; while (m < 11 && day >= BEFORE[m + 1]) m++; return m; };
const yearOff = d => Math.floor((Math.round(d) - 1) / 365);
const median = list => { const s = list.filter(fin).sort((a, b) => a - b), h = s.length >> 1; return !s.length ? NaN : s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
// The months (with the year offset) a span of days covers by 15 days or more.
function monthsOver(from, to) {
  const out = new Map();
  for (let d = Math.round(from); d < to; d++) { const k = `${yearOff(d)}:${monthOf(d)}`; out.set(k, (out.get(k) ?? 0) + 1); }
  return [...out].filter(([, n]) => n >= 15).map(([k]) => { const [off, m] = k.split(':').map(Number); return { off, m }; });
}

// ---- the months the soil is typically bare: cover under 0.3 in at least half the years of the rotation (the layout's own months)
// years: in how many years of the rotation each month is bare (the same cover line as bareMonths); months: those bare in at least half of them.
export function bareYears(lay) {
  if (!lay?.monthly?.length) return { years: Array(12).fill(0), of: 0 };
  const N = lay.N, years = Array.from({ length: 12 }, (_, m) => { let n = 0; for (let y = 0; y < N; y++) if (lay.monthly[y * 12 + m] < 0.3) n++; return n; });
  return { years, of: N };
}
export const bareOf = lay => { const b = bareYears(lay); return b.years.map((n, m) => n > 0 && n * 2 >= b.of ? m + 1 : 0).filter(Boolean); };

// ---- the facets of one plan, from the crop table's own fields and the layout
function facetsOf(x, ctx) {
  const keysAll = ['nitrogen', 'organic', 'pest', 'forage', 'market', 'waterUse', 'infiltration'];
  if (x.flag === 'fails') return Object.fromEntries(keysAll.map(k => [k, { score: null, text: FACET_NONE, source: '' }]));
  const P = x.ev.perSlot.filter(p => p.id !== 'fallow'), lay = x.ev.lay, slots = x.o.slots.filter(id => id !== 'fallow'), cover = lay.covers.some(Boolean);
  const pct = v => fin(v) ? round(100 * clamp(v)) : null, broken = source => ({ score: null, text: FACET_BROKEN, source });
  const out = {};
  const legumes = uniq([...slots.filter(id => cropOf(id).nfix > 0), ...lay.covers.filter(c => c && cropOf(c.id).nfix > 0).map(c => c.id)]).map(low);
  const n = pct(mean(x.ev.perSlot.map(p => p.nfix)) * 1.8);
  out.nitrogen = n === null ? broken(FW.nitrogenSource) : { score: n, text: FW.nitrogen(legumes, n), source: FW.nitrogenSource };
  const o = pct(mean(x.ev.perSlot.map(p => p.om)));
  out.organic = o === null ? broken(FW.organicSource) : { score: o, text: FW.organic(o, FW.tillage[x.o.tillage] ?? FW.tillage.reduced, cover), source: FW.organicSource };
  const N = x.o.slots.length, turns = N > 1 ? N : 0, changes = turns ? x.o.slots.filter((a, i) => { const b = x.o.slots[(i + 1) % N]; return a !== b && (a === 'fallow' || b === 'fallow' || cropOf(a).fam !== cropOf(b).fam); }).length : 0;
  const p = pct(x.ev.pest);
  out.pest = p === null ? broken(FW.pestSource) : { score: p, text: FW.pest(changes, turns, N === 1 || new Set(x.o.slots).size === 1), source: FW.pestSource };
  const feeds = uniq(slots.filter(id => cropOf(id).type === 'forage' || cropOf(id).forage >= 0.5)).map(low), f = pct(mean(slots.map(id => cropOf(id).forage).filter(fin)));
  out.forage = f === null ? broken(FW.forageSource) : { score: f, text: FW.forage(f, feeds, ctx.livestock), source: FW.forageSource };
  const M = ctx.market, shares = M ? uniq(slots).map(id => ({ id, share: fin(M.shares[id]) ? M.shares[id] : ctx.absent.has(id) ? 0 : null })).filter(s => s.share !== null) : [];
  const mapName = M ? `${MAPS[M.source] ?? 'the crop map'}${M.year ? ` ${M.year}` : ''}` : '';
  out.market = !shares.length ? { score: null, text: FW.marketNone, source: M ? mapName : 'AAFC Annual Crop Inventory or USDA Cropland Data Layer, not read here' }
    : { score: pct(mean(shares.map(s => clamp(s.share / 0.15)))), text: FW.market(shares.map(s => FW.marketShare(low(s.id), s.share >= 0.01 ? String(round(s.share * 100)) : 'under 1')), mapName), source: `${mapName}; a crop on 15 in 100 ha or more counts in full (Crophalo’s own line)` };
  const need = mean(P.map(q => q.need).filter(fin)), rain = mean(P.map(q => q.rain).filter(fin)), w = pct(1 - (need - 250) / 600);
  out.waterUse = w === null || !fin(rain) ? broken(FW.waterUseSource) : { score: w, text: FW.waterUse(round(need), round(rain)), source: FW.waterUseSource };
  const root = mean(x.ev.perSlot.map(q => q.root)), i = pct(0.4 * root + 0.4 * lay.yearCover + 0.2 * (TILL_SOAK[x.o.tillage] ?? 0.5));
  out.infiltration = i === null || !fin(lay.yearCover) ? broken(FW.infiltrationSource) : { score: i, text: FW.infiltration(i, round(100 * clamp(lay.yearCover))), source: FW.infiltrationSource };
  return out;
}
const needOf = x => mean(x.ev.perSlot.filter(p => p.id !== 'fallow').map(p => p.need).filter(fin));
const calmYears = st => st.of - st.crossed.length;

// ---- what a plan may offer, from its own numbers against what is grown now
function benefitsOf(plan, x, cur, curX, st, stNow, country) {
  if (x.flag === 'fails') return [];
  const out = [], add = (kind, text) => out.push({ kind, text }), s = plan.scores ?? {}, s0 = cur.scores ?? {}, F = plan.facets, F0 = cur.facets;
  const up = (a, b, by) => fin(a) && fin(b) && a - b >= by;
  if (plan === cur) {
    add('income', BW.known);
    Object.entries(PART_LABELS).forEach(([k, label]) => { if (fin(s[k]) && s[k] >= 70) add(k === 'erosion' ? 'erosion' : k, BW.strong(label, s[k])); });
    if (fin(plan.pest) && plan.pest >= 80 && x.o.slots.length > 1) add('pest', BW.breaks);
    return out;
  }
  if (fin(plan.bareMonths) && fin(cur.bareMonths) && cur.bareMonths - plan.bareMonths >= 0.5) add('erosion', BW.erosion(one(plan.bareMonths), one(cur.bareMonths), country));
  if (up(s.soil, s0.soil, 3)) add('soil', BW.soil(s.soil, s0.soil));
  if (up(F.organic.score, F0.organic.score, 5)) add('organic', BW.organic(F.organic.score, F0.organic.score));
  if (up(F.nitrogen.score, F0.nitrogen.score, 5)) add('nitrogen', BW.nitrogen(uniq([...x.o.slots.filter(id => cropOf(id)?.nfix > 0), ...x.ev.lay.covers.filter(c => c && cropOf(c.id).nfix > 0).map(c => c.id)]).map(low)));
  if (up(plan.pest, cur.pest, 5)) add('pest', BW.pest(plan.pest, cur.pest));
  const w = needOf(x), w0 = needOf(curX);
  if (fin(w) && fin(w0) && w0 - w >= 25) add('water', BW.water(round(w), round(w0)));
  if (up(F.infiltration.score, F0.infiltration.score, 5)) add('water', BW.infiltration(F.infiltration.score, F0.infiltration.score));
  if (up(F.forage.score, F0.forage.score, 10)) add('forage', BW.forage(x.o.slots.filter(id => !curX.o.slots.includes(id) && (cropOf(id).type === 'forage' || cropOf(id).forage >= 0.5)).map(low)));
  if (up(s.income, s0.income, 3)) add('income', BW.income(s.income, s0.income));
  if (up(s.weather, s0.weather, 3)) add('weather', BW.weather(s.weather, s0.weather));
  else if (st.of > 0 && st.of === stNow.of && calmYears(st) - calmYears(stNow) >= 2) add('weather', BW.calmer(calmYears(st), calmYears(stNow), st.of));
  if (!out.length) {   // nothing better: say so, with its best part against what is grown now
    const best = Object.keys(PART_LABELS).filter(k => fin(s[k]) && fin(s0[k])).sort((a, b) => (s[b] - s0[b]) - (s[a] - s0[a]))[0];
    if (best) add(best, BW.best(PART_LABELS[best], s[best], s0[best]));
  }
  return out;
}

// ---- what a farmer or adviser must check locally before acting
function reviewOf(plan, x, curX, ctx, C, cold) {
  const out = [RW.drainage], slots = x.o.slots.filter(id => id !== 'fallow'), isNow = x === curX;
  const added = uniq(slots.filter(id => !curX.o.slots.includes(id))), names = (added.length ? added : uniq(slots)).map(low);
  const who = ctx.country === 'CA' ? (inOntario(ctx.lat, ctx.lon) ? RW.insurers.ontario : RW.insurers.ca) : ctx.country === 'US' ? RW.insurers.us : RW.insurers.other;
  if (!isNow && added.length) {
    out.push(RW.markets(added.map(low)), RW.seed(added.map(low)));
    out.push(RW.carryOver(low(added[0])));
  } else if (!isNow && x.o.covers.some(Boolean)) out.push(RW.carryOver('the cover crop'));
  out.push(isNow ? RW.pestsNow : RW.pests(names));
  out.push(RW.insurance(names, who));
  if (x.o.covers.some(Boolean)) out.push(RW.cover);
  if (x.o.kind === 'notill') out.push(RW.notill);
  slots.filter(id => cropOf(id).winterKill !== undefined).forEach(id => out.push(cold.has(id) ? RW.deepCold(low(id), String(round(cold.get(id))).replace('-', '−')) : RW.winter(low(id))));
  if (slots.some(id => cropOf(id).type === 'forage')) out.push(RW.hay);
  if (x.flag === 'borderline') out.push(isNow ? RW.borderlineNow : RW.borderline);
  if (isNow) out.push(RW.records);
  return uniq(out);
}

// ---- when the crops grown now are most exposed: counts of years from the weather record, by month and growth stage
export function exposureOf(x, ctx, C) {
  const Y = C?.years ?? [], of = Y.length, rows = [], lay = x?.ev?.lay;
  if (!lay || !of || C.south) return { rows, note: of ? '' : '' };
  const at = new Map(Y.map((y, k) => [y, k])), idxOf = (k, off) => at.get(Y[k] + off);
  const frostKeys = C.frostMargin > 0 ? ['power', 'eccc', 'fao56'] : ['power', 'fao56'], rainKeys = C.source === 'era5' ? ['era5'] : ['power', C.imerg ? 'gpm' : 'merra2'];
  const push = row => { if (row.count > 0) rows.push(row); };
  const seen = new Set();
  x.o.slots.forEach((id, i) => {
    if (id === 'fallow' || seen.has(id)) return; seen.add(id);
    const crop = cropOf(id), tm = lay.t[i], st = tm?.stages;
    if (!crop || !fin(tm?.sow) || !fin(tm?.harvest) || !Array.isArray(st) || st.length < 4 || !st.every(fin)) return;
    const name = short(id), sow = tm.sow, midStart = sow + st[0] + st[1], midEnd = midStart + st[2], lateStart = midEnd;
    if (tm.harvest <= 365 && crop.frost < 0.5 && !C.frostFreeClimate) {   // spring-sown: a frost after sowing
      const hits = Y.map((_, k) => C.yearly.frostLast[k]).filter(v => fin(v) && v >= sow), counted = Y.filter((_, k) => fin(C.yearly.frostLast[k]) || C.yearly.frostFree?.[k] === 365).length;
      const m = hits.length ? monthOf(median(hits)) : monthOf(sow);
      push({ month: m + 1, hazard: XW.hazard.frostSpring, crop: id, stage: XW.stage.up, count: hits.length, of: counted, text: XW.frostSpring(name, hits.length, counted, MONTH_NAMES[m]), source: 'power', sources: frostKeys });
    }
    if (lateStart <= 365 && crop.frost < 0.3 && !C.frostFreeClimate) {   // a frost before it starts to ripen
      const firsts = Y.map((_, k) => C.yearly.frostFirst[k]), hits = firsts.filter(v => fin(v) && v < lateStart), counted = firsts.filter(fin).length + Y.filter((_, k) => !fin(firsts[k]) && C.yearly.frostFree?.[k] === 365).length;
      const m = hits.length ? monthOf(median(hits)) : monthOf(lateStart);
      push({ month: m + 1, hazard: XW.hazard.frostAutumn, crop: id, stage: XW.stage.fill, count: hits.length, of: counted, text: XW.frostAutumn(name, hits.length, counted, MONTH_NAMES[m]), source: 'power', sources: frostKeys });
    }
    const line = [...THR].reverse().find(t => t <= crop.heat), hot = line !== undefined ? C.hotCal?.[line] : null, span = monthsOver(midStart, midEnd);
    if (hot && span.length && crop.heat <= 40) {   // heat while it flowers and fills
      let n = 0, counted = 0;
      Y.forEach((_, k) => { const v = span.map(({ off, m }) => { const j = idxOf(k, off); return j === undefined ? NaN : hot[j]?.[m]; }); if (!v.every(fin)) return; counted++; if (v.reduce((a, b) => a + b, 0) >= 3) n++; });
      const names = span.map(({ m }) => MONTH_NAMES[m]), words = names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
      if (counted) push({ month: span[0].m + 1, hazard: XW.hazard.heat, crop: id, stage: XW.stage.flower, count: n, of: counted, text: XW.heat(name, line, n, counted, words), source: 'power', sources: ['power', 'fao56', 'luo2011'] });
    }
    const fill = lateStart - 5, fm = monthOf(fill), fo = yearOff(fill), normal = C.monthly?.P?.[fm];   // the month the grain fills: where the FAO-56 mid-season stage ends
    if (ctx.irrigation === 'none' && C.rainCal && fin(normal) && normal > 0) {   // a dry month at grain fill, for a rain-fed field
      let n = 0, counted = 0;
      Y.forEach((_, k) => { const j = idxOf(k, fo), v = j === undefined ? NaN : C.rainCal[j]?.[fm]; if (!fin(v)) return; counted++; if (v < 0.5 * normal) n++; });
      if (counted) push({ month: fm + 1, hazard: XW.hazard.dry, crop: id, stage: XW.stage.fill, count: n, of: counted, text: XW.dry(name, n, counted, MONTH_NAMES[fm]), source: 'power', sources: rainKeys });
    }
  });
  if (C.heavyCal) {   // heavy rain in the months the soil is bare in any year of the rotation
    const bare = bareYears(lay).years.map((n, m) => n > 0 ? m : -1).filter(m => m >= 0 && C.monthly.tmean[m] > 0), heavy = [];   // rain, not snow: months above 0 °C
    bare.forEach(m => { let n = 0, counted = 0; Y.forEach((_, k) => { const v = C.heavyCal[k]?.[m]; if (!fin(v)) return; counted++; if (v >= 1) n++; }); if (counted) heavy.push({ m, n, counted }); });
    heavy.sort((a, b) => b.n - a.n || a.m - b.m).slice(0, 2).forEach(h => push({ month: h.m + 1, hazard: XW.hazard.heavy, crop: null, stage: XW.stage.bare, count: h.n, of: h.counted, text: XW.heavy(MONTH_NAMES[h.m], h.n, h.counted), source: 'power', sources: [...rainKeys, 'crophalo'] }));
  }
  rows.sort((a, b) => b.count / b.of - a.count / a.of || a.month - b.month);
  return { rows: rows.slice(0, 6), note: rows.length ? XW.rule : XW.none(of) };
}

// ---- the opportunity each idea stands for, and the three strategies to compare first
function opportunityOf(plan, x, curX, ctx) {
  const kind = x.o.kind;
  if (kind === 'drought') return 'water';
  if (kind === 'notill') return 'infiltration';
  if (kind === 'cover') return 'soil';
  if (kind === 'diverse') return 'pest';
  if (kind === 'forage') return ctx.livestock ? 'income' : 'soil';
  if (kind === 'legume') { const added = x.o.slots.filter(id => !curX.o.slots.includes(id)); return added.some(id => cropOf(id).group === 'legume') ? 'soil' : 'pest'; }
  return 'income';   // what is grown now: the crops, machinery and buyers in place
}
const deepColdOf = (x, cold) => x.o.slots.some(id => cold.has(id));

// ---- why crops and plans were left out by the limits, never silently: the ideas with and without them, side by side
function droppedOf(generate, ctx, C) {
  const L = ctx.limits; if (!L) return { gaps: [], dropped: [] };
  const gaps = [], dropped = [];
  if (L.reasons.size || L.coverWhy) {
    const sig = o => `${o.kind}|${o.slots.join('>')}|${o.covers.map(c => c ? 1 : 0).join('')}|${o.tillage}`;
    const kept = new Set(generate(ctx, C).map(sig)), raw = generate({ ...ctx, avoid: new Set([...L.rawAvoid]), coverOK: L.rawCoverOK }, C).filter(o => !kept.has(sig(o)));
    const byKey = new Map(); let coverGone = false;
    raw.forEach(o => {
      const left = uniq(o.slots.filter(id => L.reasons.has(id)));
      if (!left.length && o.covers.some(Boolean) && L.coverWhy) { coverGone = true; dropped.push({ kind: o.kind, slots: [...o.slots], reason: L.coverWhy }); return; }
      left.forEach(id => { const key = L.reasons.get(id); if (!byKey.has(key)) byKey.set(key, new Set()); byKey.get(key).add(id); });
      if (left.length) dropped.push({ kind: o.kind, slots: [...o.slots], reason: L.reasons.get(left[0]) });
    });
    if (coverGone) gaps.push(COVER_LEFT);
    [...byKey].forEach(([key, ids]) => gaps.push(leftLine(key, [...ids].map(low))));
  }
  if (L.listed && !gaps.some(g => g.includes('Statistics Canada'))) gaps.push(LISTED_GAP);
  return { gaps, dropped };
}

// ---- everything the comparison adds to one answer
export function finish({ a, ctx, C, current, others, recommended, generate, stressYears }) {
  const xs = [a.base, ...a.others], plans = [current, ...others];
  const cold = new Map();   // winter crops whose cold-winter night is under the deep-cold line
  const night10 = fin(C.coldLow10) ? C.coldLow10 : C.coldNight10;
  plans.forEach(p => p.slots.forEach(id => { if (cropOf(id)?.winterKill !== undefined && fin(night10) && night10 < DEEP_COLD) cold.set(id, night10); }));
  plans.forEach((p, k) => { p.facets = facetsOf(xs[k], ctx); p.bare = bareOf(xs[k].ev.lay); });
  const st = xs.map(x => stressYears(x.o, x.ev.lay, C, ctx));
  plans.forEach((p, k) => { p.benefits = benefitsOf(p, xs[k], current, a.base, st[k], st[0], ctx.country); p.review = reviewOf(p, xs[k], a.base, ctx, C, cold); });
  if (ctx.limits?.goals?.has('nitrogen')) plans.forEach(p => { if (Array.isArray(p.evidence)) p.evidence.push({ text: NITROGEN_EVIDENCE, sources: ['crophalo'] }); });
  // the three strategies: what is grown now, the suggestion (or the best other idea), and one that differs in kind
  const fits = k => xs[k].flag !== 'fails' && !deepColdOf(xs[k], cold);
  const cand = others.map((p, j) => j + 1).filter(fits);
  const keep = recommended === current, second = keep ? cand[0] : plans.indexOf(recommended);
  const opp = k => opportunityOf(plans[k], xs[k], a.base, ctx);
  let third;
  if (second !== undefined && second >= 0) {
    const rest = cand.filter(k => k !== second);
    third = rest.find(k => xs[k].o.kind !== xs[second].o.kind && opp(k) !== opp(second)) ?? rest.find(k => xs[k].o.kind !== xs[second].o.kind);
  }
  const strategies = [{ id: current.id, role: 'now', opportunity: opp(0), text: SW.now }];
  if (second !== undefined && second >= 0) strategies.push({ id: plans[second].id, role: keep ? 'worth' : 'suggest', opportunity: opp(second), text: (keep ? SW.worth : SW.suggest)(opp(second)) });
  if (third !== undefined) strategies.push({ id: plans[third].id, role: 'another', opportunity: opp(third), text: SW.another(opp(third)) });
  strategies.forEach(s => { const p = plans.find(q => q.id === s.id); if (p?.lessCommon) s.text = `${s.text} ${p.lessCommon}`; });   // a crop that is rare nearby is named on the strategy itself
  const { gaps, dropped } = droppedOf(generate, ctx, C);
  let fewWhy = '';
  if (strategies.length < 3) {
    const why = [], fails = xs.slice(1).filter(x => x.flag === 'fails').length, coldN = xs.slice(1).filter(x => x.flag !== 'fails' && deepColdOf(x, cold)).length;
    if (fails) why.push(fewWords.fails(fails));
    if (coldN) why.push(fewWords.cold(coldN));
    if (dropped.length) why.push(fewWords.limits);
    if (cand.length > strategies.length - 1) why.push(fewWords.sameKind);
    if (!why.length) why.push(fewWords.none);
    fewWhy = fewWords.join(fewWords.lead(strategies.length), why);
  }
  const byId = new Map(plans.map(p => [p.id, p]));
  const bare = strategies.map(s => { const x = xs[plans.indexOf(byId.get(s.id))], b = bareYears(x.ev.lay); return { id: s.id, months: [...byId.get(s.id).bare], years: b.years, of: b.of, text: bareWords(b.years, b.of) }; });
  const ex = exposureOf(a.base, ctx, C);
  return { strategies, fewWhy, exposure: ex.rows, exposureNote: ex.note, bare, gaps, dropped };
}
export { LEFT_WHY };
