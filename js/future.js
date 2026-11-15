// Crophalo's possible futures, the pure core. The rule: model weather is never used raw. An ensemble of forecast runs is put on NASA's footing (the offset between the model's control run and NASA's own days is taken off,
// the field's height added), copied behind 800 recorded NASA days so a season can be judged, and the verdicts of every run are counted. Counts of runs, never a chance: "19 of 51 runs", with the denominator, hurt first.
// Pure: no page, no network, no clock, no randomness (today is passed in). Checked by scripts/test_future.mjs (the parser on the recorded Open-Meteo shape, the matching rules and their limits, the height shift, the copied history,
// the counts and the disagreement rule). The seasonal, 24-month and climate-model parts, the worker and the page come after this file.
export const MIN_SHARED = 5, MAX_OFFSET = 8, HISTORY_DAYS = 800, STALE_GAP = 3, HEIGHT_PER_KM = 6.5, HEIGHT_MIN_M = 100, HEIGHT_MAX_M = 1500;
const fin = v => typeof v === 'number' && Number.isFinite(v);
const num = v => (fin(v) ? v : NaN);
const median = list => { const v = list.filter(fin).sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : NaN; };
export const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z'));
const compact = d => d.replace(/-/g, '');
export const MODELS = Object.freeze({ ecmwf_ifs025: { label: 'European model', short: 'European', runs: 51 }, gfs_seamless: { label: 'American model', short: 'American', runs: 31 }, gem_global: { label: 'Canadian model', short: 'Canadian', runs: 21 } });

// The temperature a field's height adds to a model's weather: 6.5 °C colder for each 1,000 m the field is above the model's grid cell, ignored under 100 m, capped at 1,500 m.
export function heightShift(fieldElev, cellElev) {
  if (!fin(fieldElev) || !fin(cellElev)) return 0;
  const d = fieldElev - cellElev; if (Math.abs(d) < HEIGHT_MIN_M) return 0;
  return -HEIGHT_PER_KM * Math.max(-HEIGHT_MAX_M, Math.min(HEIGHT_MAX_M, d)) / 1000;
}

// Open-Meteo's ensemble answer ({ daily: { time, temperature_2m_max, temperature_2m_max_member01, ... } }) as runs: { time: ['YYYY-MM-DD'], runs: [{ id, hi, lo, rain }] }, the control run first. Not an ensemble: null.
export function ensembleRuns(answer) {
  const d = answer?.daily ?? answer?.data?.daily;
  if (!d || !Array.isArray(d.time) || !d.time.length || !d.time.every(isDay)) return null;
  const ids = new Set(['']); for (const k of Object.keys(d)) { const m = /^temperature_2m_max_member(\d{2})$/.exec(k); if (m) ids.add(m[1]); }
  const col = (name, id) => { const a = d[`${name}${id ? `_member${id}` : ''}`]; return Array.isArray(a) && a.length === d.time.length ? a.map(num) : null; };
  const runs = [];
  for (const id of [...ids].sort()) { const hi = col('temperature_2m_max', id), lo = col('temperature_2m_min', id), rain = col('precipitation_sum', id) ?? d.time.map(() => NaN); if (hi && lo) runs.push({ id: id || 'control', hi, lo, rain }); }
  return runs.length ? { time: d.time, runs, elevation: fin(answer?.elevation) ? answer.elevation : fin(answer?.data?.elevation) ? answer.data.elevation : null } : null;
}

// How far a model's control run sits from NASA's own days, over the days both have before today: the median offset of the highs and of the lows. At least 5 shared days and both offsets within 8 °C, else not matched (and the page says so).
export function matchOffset(time, control, series, today) {
  const index = new Map((series?.days ?? []).map((d, i) => [d, i])), dh = [], dl = [];
  for (let i = 0; i < time.length; i++) {
    if (!(time[i] < today)) continue; const j = index.get(compact(time[i])); if (j === undefined) continue;
    const nh = series.T2M_MAX?.[j], nl = series.T2M_MIN?.[j]; if (fin(nh) && fin(control.hi[i])) dh.push(control.hi[i] - nh); if (fin(nl) && fin(control.lo[i])) dl.push(control.lo[i] - nl);
  }
  const shared = Math.min(dh.length, dl.length);
  if (shared < MIN_SHARED) return { ok: false, shared, reason: 'too few days shared with NASA’s record' };
  const hi = median(dh), lo = median(dl);
  if (Math.abs(hi) > MAX_OFFSET || Math.abs(lo) > MAX_OFFSET) return { ok: false, shared, reason: 'the offset from NASA’s record is too large to trust' };
  return { ok: true, shared, hi, lo };
}

// The futures of one model: every run, on NASA's footing where it could be matched (offset taken off, the field's height added) and on its own weather, moved only to the field's height, where it could not. Rain is never corrected.
// Each future is the last 800 recorded NASA days followed by the run's days from today on, so a season can be judged on it. { model, label, matched, offset, shared, runs: [{ id, days, hi, lo, rain, from }], stale, gapDays, reason }.
export function futuresOf(model, answer, series, { today, fieldElev = null, cellElev = null } = {}) {
  const parsed = ensembleRuns(answer), info = MODELS[model] ?? { label: model, short: model };
  if (!parsed || !isDay(today) || !series?.days?.length) return { model, label: info.label, ok: false, reason: 'No ensemble answer to build futures from.', runs: [] };
  const control = parsed.runs.find(r => r.id === 'control') ?? parsed.runs[0], match = matchOffset(parsed.time, control, series, today);
  const shift = heightShift(fieldElev, cellElev ?? parsed.elevation), dHi = match.ok ? match.hi : 0, dLo = match.ok ? match.lo : 0;
  const from = parsed.time.findIndex(t => t >= today); if (from < 0) return { model, label: info.label, ok: false, reason: 'The forecast has no days from today on.', runs: [] };
  const lastRecorded = series.days.reduce((best, d, i) => (fin(series.T2M_MAX?.[i]) && fin(series.T2M_MIN?.[i]) && d > best ? d : best), '00000000');
  const firstForecast = compact(parsed.time[from]), gapDays = Math.round((Date.parse(`${firstForecast.slice(0, 4)}-${firstForecast.slice(4, 6)}-${firstForecast.slice(6)}T00:00:00Z`) - Date.parse(`${lastRecorded.slice(0, 4)}-${lastRecorded.slice(4, 6)}-${lastRecorded.slice(6)}T00:00:00Z`)) / 864e5) - 1;
  const endIdx = series.days.findIndex(d => d >= firstForecast), end = endIdx < 0 ? series.days.length : endIdx, begin = Math.max(0, end - HISTORY_DAYS);
  const history = { days: series.days.slice(begin, end), hi: series.T2M_MAX.slice(begin, end).map(num), lo: series.T2M_MIN.slice(begin, end).map(num), rain: (series.rain ?? series.PRECTOTCORR ?? []).slice(begin, end).map(num) };
  const runs = parsed.runs.map(r => ({ id: r.id, from: history.days.length, days: [...history.days, ...parsed.time.slice(from).map(compact)],
    hi: [...history.hi, ...r.hi.slice(from).map(v => (fin(v) ? v - dHi + shift : NaN))], lo: [...history.lo, ...r.lo.slice(from).map(v => (fin(v) ? v - dLo + shift : NaN))], rain: [...history.rain, ...r.rain.slice(from)] }));
  return { model, label: info.label, short: info.short, ok: true, matched: match.ok, offset: match.ok ? { hi: Math.round(match.hi * 10) / 10, lo: Math.round(match.lo * 10) / 10 } : null, shared: match.shared, matchReason: match.ok ? '' : match.reason, shift, gapDays, stale: gapDays > STALE_GAP, runs };
}

// ---- counts, never chances
export const VERDICTS = Object.freeze(['hurt', 'close', 'fine', 'nodata']);
// The verdicts of a model's runs as counts: hurt first, then close calls, then fine; a run with no weather where it matters is "no data", never fine. Fine and close calls are never added into one count, nor close calls into hurt.
export function tally(verdicts) {
  const c = { hurt: 0, close: 0, fine: 0, nodata: 0 };
  for (const v of Array.isArray(verdicts) ? verdicts : []) if (Object.hasOwn(c, v)) c[v]++;
  return { ...c, runs: c.hurt + c.close + c.fine + c.nodata, judged: c.hurt + c.close + c.fine };
}
// Two or more models disagree when one has close calls plus hurt in at least a third of its runs while another has them in under a tenth, or their most common verdict differs.
export function disagree(tallies) {
  const list = tallies.filter(t => t && t.judged > 0); if (list.length < 2) return false;
  const bad = t => (t.hurt + t.close) / t.judged, common = t => ['hurt', 'close', 'fine'].reduce((a, v) => (t[v] > t[a] ? v : a), 'fine');
  return list.some(a => bad(a) >= 1 / 3 && list.some(b => b !== a && bad(b) < 0.1)) || new Set(list.map(common)).size > 1;
}
// "About N in 10": the only rounded share, always written beside the real counts and never alone.
export const aboutInTen = (n, of) => (of > 0 ? Math.round(n / of * 10) : null);

// ---- this season: the seasonal forecast turned into CHANGES, laid over the field's own past years
// Each month of each run gets a change measured against the model's OWN usual month, so the model's bias cancels: warmth dT = the month's anomaly + (this run's mean over the month - the mean of all runs);
// rain r = [the month's mean / (mean - anomaly)] x [this run's rain / all runs' rain]. Guards: a dry month (under 5 mm, or under 0.05 mm a day across the runs) keeps r = 1; a missing rain figure is "not known" and rain is not moved;
// r is kept within 0.5 and 2; a run more than 6 °C off the others' mean is dropped for that month; a month needs 15 valued days. Returns { months: ['2026-12', ...], runs: [{ id, months: { '2026-12': { dT, r (null = not moved), dropped } } }] }.
export const MIN_MONTH_DAYS = 15, DRY_MONTH_MM = 5, DRY_DAY_MM = 0.05, DROP_OFF = 6, R_MIN = 0.5, R_MAX = 2;
const monthOf = iso => iso.slice(0, 7);
function seasonalColumns(daily) {
  if (!daily || !Array.isArray(daily.time) || !daily.time.every(isDay)) return null;
  const ids = new Set(); for (const k of Object.keys(daily)) { const m = /^temperature_2m_mean_member(\d{2})$/.exec(k); if (m) ids.add(m[1]); }
  const col = (name, id) => { const a = daily[`${name}_member${id}`]; return Array.isArray(a) && a.length === daily.time.length ? a.map(num) : null; };
  const runs = [...ids].sort().map(id => ({ id, t: col('temperature_2m_mean', id), rain: col('precipitation_sum', id) })).filter(r => r.t);
  return runs.length ? { time: daily.time, runs } : null;
}
export function seasonalChanges(daily, monthly) {
  const cols = seasonalColumns(daily), mt = monthly?.time;
  if (!cols || !Array.isArray(mt) || !mt.length) return null;
  const monthsSeen = [...new Set(cols.time.map(monthOf))], out = cols.runs.map(r => ({ id: r.id, months: {} })), months = [];
  const idx = new Map(); cols.time.forEach((t, i) => { const m = monthOf(t); if (!idx.has(m)) idx.set(m, []); idx.get(m).push(i); });
  for (const m of monthsSeen) {
    const mi = mt.findIndex(x => String(x).slice(0, 7) === m), rowsIdx = idx.get(m);
    const anomaly = num(monthly.temperature_2m_anomaly?.[mi]), pMean = num(monthly.precipitation_mean?.[mi]), pAnom = num(monthly.precipitation_anomaly?.[mi]);
    const stat = cols.runs.map(r => { const t = rowsIdx.map(i => r.t[i]).filter(fin), rn = r.rain ? rowsIdx.map(i => r.rain[i]) : []; const rv = rn.filter(fin); return { t: t.length >= MIN_MONTH_DAYS ? t.reduce((a, b) => a + b, 0) / t.length : NaN, rain: r.rain && rv.length >= MIN_MONTH_DAYS ? rv.reduce((a, b) => a + b, 0) : NaN, days: rv.length }; });
    const okT = stat.map(s => s.t).filter(fin); if (!fin(anomaly) || okT.length < 2) continue;
    const allT = okT.reduce((a, b) => a + b, 0) / okT.length, okR = stat.map(s => s.rain).filter(fin), allR = okR.length ? okR.reduce((a, b) => a + b, 0) / okR.length : NaN;
    const dryAcross = fin(allR) && (allR < DRY_MONTH_MM || allR / Math.max(1, rowsIdx.length) < DRY_DAY_MM), base = fin(pMean) && fin(pAnom) && pMean - pAnom > 0 ? pMean / (pMean - pAnom) : NaN;
    months.push(m);
    stat.forEach((s, k) => {
      if (!fin(s.t)) { out[k].months[m] = { dT: null, r: null, dropped: true }; return; }
      const dT = anomaly + (s.t - allT), dropped = Math.abs(s.t - allT) > DROP_OFF;
      let r = null; if (!dropped && !dryAcross && fin(base) && fin(s.rain) && fin(allR) && allR > 0) r = Math.max(R_MIN, Math.min(R_MAX, base * (s.rain / allR)));
      out[k].months[m] = { dT: dropped ? null : Math.round(dT * 100) / 100, r: r === null ? null : Math.round(r * 1000) / 1000, dropped };
    });
  }
  return months.length ? { months, runs: out } : null;
}

// The same calendar day in another year (29 February becomes 28 February where the year has none).
export function sameDayIn(iso, year) { const m = +iso.slice(5, 7), d = +iso.slice(8, 10), last = new Date(Date.UTC(year, m, 0)).getUTCDate(); return `${year}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`; }
// Each past NASA year of the field moved forward to the coming dates (today to endDate), and shifted by a run's change for each month; a month the forecast does not reach is left as the year was. A past year counts when 95% of the
// coming days are in the record. Run -1 is "the usual years": every past year with no change at all. Returns { years: [..], coming: ['YYYY-MM-DD'...], futures: [{ run, year, days, hi, lo, rain }] }.
export function seasonFutures(series, changes, { today, endDate, minShare = 0.95 } = {}) {
  if (!series?.days?.length || !isDay(today) || !isDay(endDate) || endDate < today) return { years: [], coming: [], futures: [] };
  const coming = []; for (let t = Date.parse(today + 'T00:00:00Z'); t <= Date.parse(endDate + 'T00:00:00Z'); t += 864e5) coming.push(new Date(t).toISOString().slice(0, 10));
  const index = new Map(series.days.map((d, i) => [d, i])), rainArr = series.rain ?? series.PRECTOTCORR ?? [];
  const firstYear = +series.days[0].slice(0, 4), lastYear = +series.days.at(-1).slice(0, 4), years = [], pulled = new Map();
  for (let y = firstYear; y <= lastYear; y++) {
    const rows = coming.map(c => { const j = index.get(compact(sameDayIn(c, y + (+c.slice(0, 4) - +today.slice(0, 4))))); return j === undefined ? null : { hi: num(series.T2M_MAX?.[j]), lo: num(series.T2M_MIN?.[j]), rain: num(rainArr[j]) }; });
    const have = rows.filter(r => r && fin(r.hi) && fin(r.lo)).length;
    if (have >= minShare * coming.length) { years.push(y); pulled.set(y, rows); }
  }
  const futures = [], days = coming.map(compact);
  const push = (run, y, change) => { const rows = pulled.get(y); futures.push({ run, year: y, days, hi: rows.map((r, i) => (r && fin(r.hi) ? r.hi + (change?.[monthOf(coming[i])]?.dT ?? 0) : NaN)), lo: rows.map((r, i) => (r && fin(r.lo) ? r.lo + (change?.[monthOf(coming[i])]?.dT ?? 0) : NaN)),
    rain: rows.map((r, i) => (r && fin(r.rain) ? r.rain * (change?.[monthOf(coming[i])]?.r ?? 1) : NaN)) }); };
  for (const y of years) push(-1, y, null);
  for (const run of changes?.runs ?? []) for (const y of years) push(run.id, y, run.months);
  return { years, coming, futures };
}
// The counts of a season's futures: with the lean (every run x every past year) and without it (the past years alone, run -1). Hurt, close calls and fine are never added into one another.
export function seasonCounts(futures, verdictOf) {
  const lean = [], usual = [], byRun = new Map();
  for (const f of futures) { const v = verdictOf(f); if (f.run === -1) usual.push(v); else { lean.push(v); if (!byRun.has(f.run)) byRun.set(f.run, []); byRun.get(f.run).push(v); } }
  const perRun = [...byRun.values()].map(list => tally(list).hurt);
  return { lean: tally(lean), usual: tally(usual), runs: byRun.size, years: usual.length, perRunHurt: perRun.length ? { min: Math.min(...perRun), max: Math.max(...perRun) } : null };
}

// ---- the next 24 months: no forecast, the usual month moved by what the models say
// Each calendar month is the field's USUAL month from the NASA years (the mean and the middle half; a year counts for a month with 90% of its days; at least 10 years; rain as a total), moved by the seasonal runs' median lean where the
// seasonal forecast reaches and, after that, by the median of the climate models' change scaled along a straight line in time from the middle of the NASA years to 2046. A lean word needs two thirds of the runs or models to agree.
// A month with too few NASA years stays "not available", never 0. Frost and heat days are not counted: they need real days, and no one can give those two years out.
export const MIN_USUAL_YEARS = 10, MONTH_SHARE = 0.9, LEAN_SHARE = 2 / 3, LEAN_MIN_C = 0.5, TREND_END = 2046, WINDOW_FROM = 2041, WINDOW_TO = 2050, MIN_BASE_YEARS = 20, MIN_WINDOW_YEARS = 8, CLIM_YEAR_DAYS = 330, WET_FLOOR_MM = 5;
const quantile = (sorted, q) => { if (!sorted.length) return NaN; const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); };
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
// The usual month: for each month 1 to 12 { available, years, mean, low, high (the middle half of the years' means), rain (total, mm) }.
export function usualMonths(series) {
  const rainArr = series?.rain ?? series?.PRECTOTCORR ?? [], acc = new Map();
  for (let i = 0; i < (series?.days?.length ?? 0); i++) {
    const d = String(series.days[i]); if (!/^\d{8}$/.test(d)) continue; const key = `${d.slice(0, 4)}-${d.slice(4, 6)}`, a = acc.get(key) ?? { t: 0, tn: 0, r: 0, rn: 0, n: 0 };
    a.n++; const h = series.T2M_MAX?.[i], l = series.T2M_MIN?.[i], r = rainArr[i]; if (fin(h) && fin(l)) { a.t += (h + l) / 2; a.tn++; } if (fin(r)) { a.r += r; a.rn++; } acc.set(key, a);
  }
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const temps = [], rains = [];
    for (const [key, a] of acc) { if (+key.slice(5) !== m) continue; const [y] = key.split('-'), len = new Date(Date.UTC(+y, m, 0)).getUTCDate(); if (a.tn >= MONTH_SHARE * len) temps.push(a.t / a.tn); if (a.rn >= MONTH_SHARE * len) rains.push(a.r); }
    if (temps.length < MIN_USUAL_YEARS || rains.length < MIN_USUAL_YEARS) { out.push({ month: m, available: false, years: Math.min(temps.length, rains.length) }); continue; }
    const s = [...temps].sort((a, b) => a - b), mean = temps.reduce((a, b) => a + b, 0) / temps.length;
    out.push({ month: m, available: true, years: temps.length, mean, low: quantile(s, 0.25), high: quantile(s, 0.75), rain: rains.reduce((a, b) => a + b, 0) / rains.length });
  }
  return out;
}
// One climate model's change for each calendar month: its mean daily highs and lows in 2041 to 2050 minus the same in its baseline years (2001 to the last full year, the years NASA gives the field, so warming already in the record is
// not counted twice); rain as a ratio of monthly totals, 1 where the baseline month is under 5 mm, kept within 0.5 and 2. A year needs 330 days; a model needs 20 baseline years and 8 window years, else no answer with the reason.
export function climateFactors(answer, { baseTo = 2025 } = {}) {
  const d = answer?.daily ?? answer?.data?.daily; if (!d || !Array.isArray(d.time) || !d.temperature_2m_max || !d.temperature_2m_min || !d.precipitation_sum) return { ok: false, reason: 'No climate answer to read.' };
  const perYear = new Map();
  for (let i = 0; i < d.time.length; i++) { const y = +d.time[i].slice(0, 4), m = +d.time[i].slice(5, 7), hi = d.temperature_2m_max[i], lo = d.temperature_2m_min[i], r = d.precipitation_sum[i]; if (!fin(hi) || !fin(lo) || !fin(r)) continue;
    const key = `${y}-${m}`, a = perYear.get(key) ?? { hi: 0, lo: 0, r: 0, n: 0 }; a.hi += hi; a.lo += lo; a.r += r; a.n++; perYear.set(key, a); }
  const yearDays = new Map(); for (const [k, a] of perYear) { const y = +k.split('-')[0]; yearDays.set(y, (yearDays.get(y) ?? 0) + a.n); }
  const full = y => (yearDays.get(y) ?? 0) >= CLIM_YEAR_DAYS, baseYears = [], winYears = [];
  for (const y of yearDays.keys()) { if (!full(y)) continue; if (y <= baseTo && y >= 2001) baseYears.push(y); else if (y >= WINDOW_FROM && y <= WINDOW_TO) winYears.push(y); }
  if (baseYears.length < MIN_BASE_YEARS) return { ok: false, reason: 'too few baseline years' };
  if (winYears.length < MIN_WINDOW_YEARS) return { ok: false, reason: 'too few years in the 2040s' };
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const avg = years => { const rows = years.map(y => perYear.get(`${y}-${m}`)).filter(Boolean); if (!rows.length) return null; const n = rows.reduce((s, a) => s + a.n, 0); return { hi: rows.reduce((s, a) => s + a.hi, 0) / n, lo: rows.reduce((s, a) => s + a.lo, 0) / n, r: rows.reduce((s, a) => s + a.r, 0) / rows.length }; };
    const b = avg(baseYears), w = avg(winYears); if (!b || !w) { months.push(null); continue; }
    const ratio = b.r < WET_FLOOR_MM ? 1 : Math.max(R_MIN, Math.min(R_MAX, w.r / b.r));
    months.push({ dHi: w.hi - b.hi, dLo: w.lo - b.lo, dT: ((w.hi - b.hi) + (w.lo - b.lo)) / 2, r: ratio });
  }
  return { ok: true, baseYears: baseYears.length, windowYears: winYears.length, months };
}
// The lean of a list of changes: warmer or cooler when at least two thirds of them agree on a change of 0.5 °C or more, else no clear lean. { word, n, of } with the count of runs or models.
export function leanOf(changes) {
  const list = changes.filter(fin), of = list.length; if (!of) return { word: null, n: 0, of: 0 };
  const warm = list.filter(v => v >= LEAN_MIN_C).length, cool = list.filter(v => v <= -LEAN_MIN_C).length;
  if (warm >= Math.ceil(of * LEAN_SHARE)) return { word: 'warmer', n: warm, of };
  if (cool >= Math.ceil(of * LEAN_SHARE)) return { word: 'cooler', n: cool, of };
  return { word: null, n: Math.max(warm, cool), of, warm, cool };
}
// The 24 months from the month of `today`. Each row: { month: 'YYYY-MM', kind: 'seasonal' | 'trend' | 'usual' | 'unavailable', mean, low, high (°C), rain (mm), lean: { word, n, of }, models }.
export function outlook(series, { seasonal = null, climate = [], today } = {}) {
  const usual = usualMonths(series), start = { y: +today.slice(0, 4), m: +today.slice(5, 7) }, firstYear = series?.days?.length ? +String(series.days[0]).slice(0, 4) : 2001, lastYear = series?.days?.length ? +String(series.days.at(-1)).slice(0, 4) : 2025;
  const mid = (firstYear + lastYear) / 2, models = climate.filter(c => c?.ok), rows = [];
  for (let k = 0; k < 24; k++) {
    const y = start.y + Math.floor((start.m - 1 + k) / 12), m = (start.m - 1 + k) % 12 + 1, key = monthKey(y, m), u = usual[m - 1];
    if (!u.available) { rows.push({ month: key, kind: 'unavailable', reason: 'Too few NASA years here for this month.' }); continue; }
    const row = { month: key, kind: 'usual', mean: u.mean, low: u.low, high: u.high, rain: u.rain, usual: { mean: u.mean, low: u.low, high: u.high, rain: u.rain }, lean: { word: null, n: 0, of: 0 }, models: 0 };
    const runs = seasonal?.months?.includes(key) ? seasonal.runs.map(r => r.months[key]).filter(c => c && !c.dropped && fin(c.dT)) : [];
    if (runs.length >= 2) {
      const dT = median(runs.map(c => c.dT)), rs = runs.map(c => c.r).filter(fin); row.kind = 'seasonal'; row.mean += dT; row.low += dT; row.high += dT; if (rs.length) row.rain *= median(rs);
      row.lean = leanOf(runs.map(c => c.dT)); row.models = runs.length;
    } else if (models.length) {
      const frac = Math.max(0, Math.min(1, ((y + (m - 0.5) / 12) - mid) / (TREND_END - mid))), per = models.map(c => c.months[m - 1]).filter(Boolean);
      if (per.length) { const dT = median(per.map(c => c.dT)) * frac, r = 1 + (median(per.map(c => c.r)) - 1) * frac; row.kind = 'trend'; row.mean += dT; row.low += dT; row.high += dT; row.rain *= r; row.lean = leanOf(per.map(c => c.dT * frac)); row.models = per.length; row.shift = dT; }
    }
    rows.push(row);
  }
  return rows;
}
// The months of each kind, for the line under the chart ("Nov 2026 to Apr 2027 (6 months): ...").
export function outlookKinds(rows) {
  const spans = []; for (const r of rows) { const last = spans.at(-1); if (last && last.kind === r.kind) { last.to = r.month; last.n++; } else spans.push({ kind: r.kind, from: r.month, to: r.month, n: 1 }); }
  return { spans, counts: { seasonal: rows.filter(r => r.kind === 'seasonal').length, trend: rows.filter(r => r.kind === 'trend').length, usual: rows.filter(r => r.kind === 'usual').length, unavailable: rows.filter(r => r.kind === 'unavailable').length } };
}

// ---- years ahead: each climate model moves the field's REAL past years, month by month, by its own change (highs, lows, rain); one vote per model, never averaged across models, and a model's single years are never used.
// factors: [{ model, ok, months: [{ dHi, dLo, r } x 12] }] from climateFactors(). Returns [{ model, years, futures }] in the same shape as seasonFutures (run = the model's name).
export function climateFutures(series, factors, { today, endDate, minShare = 0.95 } = {}) {
  const base = seasonFutures(series, null, { today, endDate, minShare }), out = [];
  if (!base.futures.length) return out;
  for (const f of factors ?? []) {
    if (!f?.ok || !Array.isArray(f.months)) continue;
    const futures = base.futures.map(b => { const monthIdx = base.coming.map(c => +c.slice(5, 7) - 1); return { run: f.model, year: b.year, days: b.days, hi: b.hi.map((v, i) => (Number.isFinite(v) ? v + (f.months[monthIdx[i]]?.dHi ?? 0) : NaN)), lo: b.lo.map((v, i) => (Number.isFinite(v) ? v + (f.months[monthIdx[i]]?.dLo ?? 0) : NaN)), rain: b.rain.map((v, i) => (Number.isFinite(v) ? v * (f.months[monthIdx[i]]?.r ?? 1) : NaN)) }; });
    out.push({ model: f.model, years: base.years, futures });
  }
  return out;
}
// How many of the past years each model has hurt, and "as they really were": counts, the range across models.
export function climateCounts(models, verdictOf, realVerdicts = []) {
  const per = models.map(m => ({ model: m.model, tally: tally(m.futures.map(verdictOf)) })), hurt = per.map(p => p.tally.hurt);
  return { per, models: per.length, years: models[0]?.years.length ?? 0, hurtMin: hurt.length ? Math.min(...hurt) : null, hurtMax: hurt.length ? Math.max(...hurt) : null, real: tally(realVerdicts) };
}
