// Crophalo's Look ahead judging: every future (a model's run laid on NASA's footing, or a past year moved by a seasonal run or a climate model) is judged with the SAME one scoring path as the land history, injected as judgeSeason(), and counted.
// Hurt, close call, fine and no data are counted apart and never added into one another; a run with temperatures missing on more than one window day is no data, never fine. Pure: the judge, the crop table and the plan are handed in.
// Used by js/future-worker.js and by the page when no worker can start. Checked by scripts/test_ahead_run.mjs (the window rule, the worst season of a field, frost counts with the crop's own line, the three horizons, with a stand-in judge).
import { tally, disagree, seasonCounts, climateCounts } from './future.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const dash = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
// The future as the daily record the judge reads (days YYYYMMDD, T2M_MAX, T2M_MIN, rain, and the last real day, so no season in it counts as "still growing").
export const asSeries = f => ({ days: f.days, T2M_MAX: f.hi, T2M_MIN: f.lo, PRECTOTCORR: f.rain, rain: f.rain, lastDate: { T2M_MAX: f.days.at(-1), T2M_MIN: f.days.at(-1) } });
export const worst = list => (list.includes('hurt') ? 'hurt' : list.includes('close') ? 'close' : list.includes('nodata') ? 'nodata' : list.length ? 'fine' : 'nodata');
// The seasons of a plan that overlap a window of days, and the next sowing after it starts.
export function seasonsInWindow(plan, today, endDate) {
  const list = (plan?.seasons ?? []).filter(s => s && typeof s.crop === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.sow ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(s.harvest ?? ''));
  const inside = list.filter(s => s.sow <= endDate && s.harvest >= today), next = list.filter(s => s.sow > today).sort((a, b) => (a.sow < b.sow ? -1 : 1))[0] ?? null;
  return { inside, next };
}
// Temperatures missing on more than one day of the window make the run no data.
export function windowMissing(f, today, endDate) {
  let missing = 0; for (let i = 0; i < f.days.length; i++) { const d = dash(f.days[i]); if (d < today || d > endDate) continue; if (!fin(f.hi[i]) || !fin(f.lo[i])) missing++; } return missing;
}
// One future against one season. kinds: only causes of these kinds count (the 2-week horizon counts frost and heat only: the days inside the window cannot show a dry or wet season); window: { from, to }, only causes dated inside it.
export function seasonVerdict(judge, season, crop, future, ctx = {}, opts = null) {
  const { kinds = null, window = null } = opts ?? {};
  let r; try { r = judge(season, asSeries(future), crop, ctx); } catch { return 'nodata'; }
  if (!r) return 'nodata';
  if (!kinds && !window) return r.verdict === 'hurt' || r.verdict === 'close' || r.verdict === 'fine' ? r.verdict : 'nodata';
  if (r.verdict === 'nodata' || r.verdict === 'growing') return 'nodata';
  const causes = (r.causes ?? []).filter(c => (!kinds || kinds.some(k => String(c.kind).startsWith(k))) && (!window || (c.date >= window.from && c.date <= window.to)));
  return causes.some(c => c.severity === 'hit') ? 'hurt' : causes.length ? 'close' : 'fine';
}
// The verdict of a field on one future: the worst of its plan's seasons that the window reaches.
export function fieldVerdict(judge, seasons, cropOf, future, ctx, opts) {
  const list = seasons.map(s => { const crop = cropOf(s.crop); return crop ? seasonVerdict(judge, s, { id: s.crop, ...crop }, future, ctx, opts) : 'nodata'; });
  return worst(list);
}
// Frost counts the headline needs, from the runs' own nights: how many have a night below 0 °C inside the window, how many go below the crop's hard-frost line, and how many bring heat that counts.
export function nightCounts(futures, today, endDate, { hardLine = -2, heatLine = 35 } = {}) {
  let below0 = 0, belowHard = 0, hot = 0, firstDay = '';
  for (const f of futures) {
    let min = Infinity, max = -Infinity, first = '';
    for (let i = 0; i < f.days.length; i++) { const d = dash(f.days[i]); if (d < today || d > endDate) continue; if (fin(f.lo[i])) { if (f.lo[i] < min) min = f.lo[i]; if (f.lo[i] < 0 && !first) first = d; } if (fin(f.hi[i]) && f.hi[i] > max) max = f.hi[i]; }
    if (min < 0) { below0++; if (!firstDay || first < firstDay) firstDay = first; } if (min <= hardLine) belowHard++; if (max >= heatLine) hot++;
  }
  return { below0, belowHard, hot, firstDay, of: futures.length };
}

// The runs' days as bands, for the chart: for each day of the window the lowest and highest run, and the middle half (the 25th to 75th place), for the nights (lo) and the days (hi). A day with fewer than 5 valued runs is a gap, never 0.
const place = (sorted, q) => { const p = (sorted.length - 1) * q, a = Math.floor(p), b = Math.ceil(p); return sorted[a] + (sorted[b] - sorted[a]) * (p - a); };
export function dayBands(futures, today, endDate) {
  const days = [], lo = [], hi = [];
  if (!futures?.length) return { days, lo, hi, runs: 0 };
  const first = futures[0];
  for (let i = 0; i < first.days.length; i++) {
    const d = dash(first.days[i]); if (d < today || d > endDate) continue;
    const band = key => { const v = futures.map(f => f[key][i]).filter(fin).sort((a, b) => a - b); return v.length >= 5 ? { min: v[0], q1: place(v, 0.25), q3: place(v, 0.75), max: v.at(-1), n: v.length } : null; };
    days.push(d); lo.push(band('lo')); hi.push(band('hi'));
  }
  return { days, lo, hi, runs: futures.length };
}

// ---- the three horizons
// Next 2 weeks: for each model, every run judged on the window's own days. job: { models: [futuresOf() results], plan, today, endDate, judge, cropOf, ctx, hardLine }.
export function runWeeks({ models, plan, today, endDate, judge, cropOf, ctx = {}, hardLine = -2 }) {
  const { inside, next } = seasonsInWindow(plan, today, endDate), per = [];
  for (const m of models.filter(x => x?.ok)) {
    const verdicts = m.runs.map(run => windowMissing(run, today, endDate) > 1 ? 'nodata' : (inside.length ? fieldVerdict(judge, inside, cropOf, run, ctx, { kinds: ['frost', 'heat'], window: { from: today, to: endDate } }) : 'none'));
    const t = inside.length ? tally(verdicts) : { hurt: 0, close: 0, fine: 0, nodata: 0, runs: m.runs.length, judged: 0 };
    per.push({ model: m.model, label: m.label, short: m.short, matched: m.matched, matchReason: m.matchReason, stale: m.stale, tally: t, nights: nightCounts(m.runs, today, endDate, { hardLine }), bands: dayBands(m.runs, today, endDate) });
  }
  return { inGround: inside.length > 0, next, per, disagree: disagree(per.map(p => p.tally)), allNoData: inside.length > 0 && per.length > 0 && per.every(p => p.tally.judged === 0) };
}
// This season: the futures of seasonFutures() (the past years moved by each seasonal run, run -1 the usual years), the season of the plan that the window reaches, the whole season's verdict.
export function runSeasonHorizon({ fut, plan, today, endDate, judge, cropOf, ctx = {} }) {
  const { inside, next } = seasonsInWindow(plan, today, endDate);
  if (!inside.length) return { inGround: false, next, counts: null };
  const verdictOf = f => (windowMissing(f, today, endDate) > Math.max(1, Math.floor(0.05 * f.days.length)) ? 'nodata' : fieldVerdict(judge, inside, cropOf, f, ctx, null));
  return { inGround: true, next, counts: seasonCounts(fut.futures, verdictOf), years: fut.years.length };
}
// Years ahead: each climate model's copy of the past years, counted per model, beside the past years as they really were (the usual futures with no change).
export function runYearsHorizon({ models, real, plan, today, endDate, judge, cropOf, ctx = {} }) {
  const { inside } = seasonsInWindow(plan, today, endDate);
  if (!inside.length) return { inGround: false, counts: null };
  const verdictOf = f => fieldVerdict(judge, inside, cropOf, f, ctx, null), realV = real.futures.filter(f => f.run === -1).map(verdictOf);
  return { inGround: true, counts: climateCounts(models, verdictOf, realV) };
}
