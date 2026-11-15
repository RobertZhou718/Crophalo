// Crophalo's "Your hardest year": the three strategies played on a real hard year of this land's own weather record. A year is picked (the driest growing season, the year with most downpour days, the latest spring frost, the most hot days),
// each plan's crops are judged on it with the same rules as Land history (frost after sowing, heat at flowering, a dry season, heavy rain), and each plan gets "Hurt", "Close call" or "No hard day found" with one reason.
// Past weather on this land, never a forecast and never a chance. Pure: no page, no network. Checked by scripts/test_hardyear.mjs on the recorded NASA POWER answer.
import * as S from './simulate.js';
import { buildHistory, MIN_YEARS } from './history.js';
import { stateOn } from './calendar-data.js';
import { cropOf, cropName } from './crops.js';
import { SEASON } from './season.js';

export const WATER_HOLD = Object.freeze({ sand: 80, loam: 150, silt: 185, clay: 140 }), IRRIGATION_MM = Object.freeze({ none: 0, limited: 200, full: 500 });   // the same tables My farm uses
export const WORDS = Object.freeze({
  title: 'Your hardest year',
  lead: n => `Pick a hard year from this land’s real weather. We play your ${n === 1 ? 'strategy' : n === 2 ? 'two strategies' : n === 3 ? 'three strategies' : `${n} strategies`} on that year. This is past weather, not a forecast.`,
  pick: 'Pick another year', footer: 'Past weather on this land, not a forecast.',
  hurt: 'Hurt', close: 'Close call', fine: 'No hard day found', nodata: 'Not judged',
  fineWhy: 'Under this plan, our rules found no hard day that year.',
  noWeather: 'This land’s weather record could not be read, so no year can be played.', tooFew: 'Too few full years of weather here to pick a hard year.',
  noCrop: 'Not judged: this crop is not in Crophalo’s crop table.', tooMany: 'Not judged that year: too many days were not read.',
  how: 'How the hard years are picked', howBody: 'Driest growing season: the least rain from April to September. Most downpour days: the most days with 50 mm of rain or more. Latest spring frost: the last frost came latest. Most hot days: the most days of 35 °C or more in summer. A tie goes to the more recent year.',
  judged: 'How a strategy is judged', judgedBody: 'Each crop is checked with the same rules as Land history: frost after sowing or before ripening, heat at flowering, a dry season, and heavy rain. A strategy gets the worst result of the crops it grows that year.',
  weather: 'One NASA POWER square about 50 km wide.', backup: 'The ERA5 back-up record (NASA POWER did not answer).',
});
const CHIP_WORDS = Object.freeze({ dry: 'driest growing season', downpour: 'most downpour days', frost: 'latest spring frost', hot: 'most hot days' });
const RANK = { hurt: 3, close: 2, fine: 1, nodata: 0 };
const fin = v => typeof v === 'number' && Number.isFinite(v);

// The years of the record that are complete (so a half year never looks like a mild one).
export function fullYears(series) {
  if (!series || !Array.isArray(series.days) || !series.days.length) return [];
  const h = buildHistory(series);
  return (h?.seasons ?? []).map(s => s.year).sort((a, b) => a - b);
}
// The year chips, in the farmer's order of care: up to four, never the same year twice. prio is the setup's five weights (water, soil, wash-off, income, weather).
export function yearChips(series, prio = null) {
  const h = series ? buildHistory(series) : null, list = h?.seasons ?? [];
  if (list.length < MIN_YEARS) return [];
  const best = (key, sign) => list.filter(s => fin(s[key])).sort((a, b) => sign * (b[key] - a[key]) || b.year - a.year)[0] ?? null;
  const picks = { dry: best('grow', -1), downpour: best('down', 1), frost: best('last', 1), hot: best('heat', 1) };
  let order = ['dry', 'downpour', 'frost', 'hot'];
  const w = Array.isArray(prio) ? prio.slice(0, 5).map(Number) : [];
  if (w.length === 5 && w.every(Number.isFinite)) { const top = Math.max(...w); if (w[1] === top || w[2] === top) order = ['downpour', 'dry', 'frost', 'hot']; }
  const seen = new Set(), out = [];
  for (const kind of order) {
    const s = picks[kind]; if (!s || seen.has(s.year)) continue;
    if (kind === 'downpour' && !(s.down > 0)) continue;
    if (kind === 'hot' && !(s.heat > 0)) continue;
    seen.add(s.year); out.push({ year: s.year, kind, words: `${s.year} · ${CHIP_WORDS[kind]}` });
  }
  return out;
}

const ctxFor = (plan, season, i, texture, irrigation) => {
  const n = plan.seasons.length, next = plan.seasons[(i + 1) % n], prev = plan.seasons[(i + n - 1) % n];
  const dayN = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
  const gap = Math.round(dayN(next.sow) - dayN(season.harvest)) + (next === season ? 365 : 0), bareAfterDays = season.after === 'bare' || !(season.residue > 0) ? Math.max(0, Math.min(240, gap)) : 0;
  return { holdMm: WATER_HOLD[texture] ?? 150, irrigationMm: IRRIGATION_MM[irrigation] ?? 0, bareAfterDays, fallowBonusMm: prev.crop === 'fallow' ? 120 : 0 };
};
// Every crop of a plan judged on every full year: Map(plan seasons index -> { year -> { verdict, why } }).
export function judgePlan(plan, series, { texture = 'loam', irrigation = 'none', years = fullYears(series) } = {}) {
  const out = new Map();
  (plan?.seasons ?? []).forEach((season, i) => {
    if (!season || season.crop === 'fallow') { out.set(i, null); return; }
    const row = cropOf(season.crop);
    if (!row) { out.set(i, 'nocrop'); return; }
    const res = S.judgeCrop(season, series, { id: season.crop, ...row, fl: SEASON?.[season.crop]?.fl }, ctxFor(plan, season, i, texture, irrigation), years);
    out.set(i, new Map(res.years.map(y => [y.year, { verdict: y.verdict, why: (y.causes ?? []).map(c => c.text).filter(Boolean) }])));
  });
  return out;
}
// The plan's crop in a real year: R1, the cycle index of that year.
export const indexIn = (plan, year, first = 2001) => { const n = plan.seasons.length; return ((year - first) % n + n) % n; };
const monthState = (plan, year, m) => {
  const votes = {};
  for (const d of [1, 8, 15, 22]) { const s = stateOn(plan, `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`); if (s.state) votes[s.state] = (votes[s.state] ?? 0) + 1; }
  return Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
// The plan with its own dates moved so that its cycle year for a real year lands in that year (the season k of the cycle goes to year Y + k - i).
export function movedPlan(plan, year, first = 2001) {
  const i = indexIn(plan, year, first);
  return { ...plan, seasons: (plan.seasons ?? []).map((s, k) => (s?.sow && s?.harvest ? S.seasonInYear(s, year + (k - i)) : s)) };
}
// A plan's twelve months for a real year.
export function monthsOf(plan, year, first = 2001) {
  const moved = movedPlan(plan, year, first);
  return Array.from({ length: 12 }, (_, m) => ({ month: m, state: monthState(moved, year, m) }));
}
// One year played on the plans: [{ plan, cells, result, reason }]. judged: Map(plan -> judgePlan answer), made once.
export function playYear(plans, judged, year, first = 2001) {
  return plans.map(plan => {
    const i = indexIn(plan, year, first), season = plan.seasons?.[i], j = judged.get(plan)?.get(i);
    const cells = monthsOf(plan, year, first);
    if (!season || season.crop === 'fallow') return { plan, cells, result: 'fine', reason: WORDS.fineWhy };
    if (j === 'nocrop') return { plan, cells, result: 'nodata', reason: WORDS.noCrop };
    const y = j?.get(year);
    if (!y || y.verdict === 'nodata' || y.verdict === 'growing') return { plan, cells, result: 'nodata', reason: WORDS.tooMany };
    return { plan, cells, result: y.verdict, reason: y.verdict === 'fine' ? WORDS.fineWhy : `Under this plan, ${(y.why[0] ?? 'a hard day was found').replace(/^./, c => c.toLowerCase())}` };
  });
}
// The counts over all full years, per plan: hurt, close and fine years of those that could be judged.
export function allYears(plans, judged, years, first = 2001) {
  return plans.map(plan => {
    const c = { hurt: 0, close: 0, fine: 0, of: 0 };
    for (const y of years) { const r = playYear([plan], judged, y, first)[0]; if (r.result === 'nodata') continue; c.of++; c[r.result]++; }
    return { plan, ...c };
  });
}
// The days of the heaviest rain (20 mm or more, at least 3 days apart, full years only), and for each plan the number on which the ground stood bare.
export function stormRow(plans, series, years = fullYears(series), first = 2001) {
  if (!series?.days?.length) return { days: [], perPlan: [], n: 0 };
  const rain = series.rain ?? series.PRECTOTCORR ?? [], ok = new Set(years), list = [];
  series.days.forEach((d, i) => { const mm = rain[i], y = +String(d).slice(0, 4); if (fin(mm) && mm >= 20 && ok.has(y)) list.push({ date: `${String(d).slice(0, 4)}-${String(d).slice(4, 6)}-${String(d).slice(6, 8)}`, mm, t: Date.UTC(y, +String(d).slice(4, 6) - 1, +String(d).slice(6, 8)) / 864e5 }); });
  const picked = [];
  for (const x of list.sort((a, b) => b.mm - a.mm)) { if (picked.length >= 10) break; if (picked.every(p => Math.abs(p.t - x.t) >= 3)) picked.push(x); }
  const perPlan = plans.map(plan => ({ plan, bare: picked.filter(p => stateOn(movedPlan(plan, +p.date.slice(0, 4), first), p.date).state === 'bare').length }));
  return { days: picked.map(({ date, mm }) => ({ date, mm })), perPlan, n: picked.length };
}
export const worst = results => results.reduce((a, r) => (RANK[r] > RANK[a] ? r : a), 'nodata');
