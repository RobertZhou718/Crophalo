// Crophalo's "Trends on this land", the figures: one row per pattern (heat at the crops' own lines, spring and autumn frost, heavy rain, dry spells, rain against water given off, regional stored water, peak greenness, dry soil), year by year.
// Every value comes from a record the app already reads (the climate of js/climate.js, the daily series of js/data.js, the GRACE answer of js/satellites2-data.js, the greenness answer of js/greenness.js); a year or month not read is NaN, never 0.
// Pure: buildTrends() and its helpers, no page, no storage, no network, no clock. The trend rule is the land history's (js/history.js trendOf: 10 years at least, a clear trend at t of 2 or more).
// Checked by scripts/test_trends.mjs (the recorded Barrie and Oxford records: counts that add up, the 32 °C line equal to the hot days of "Weather here since 2001", no trend named when unclear, no chance words).
import { trendOf, MIN_YEARS } from './history.js';
import { REAL, MONTH_READ, enough } from './data.js';
import { keyToDoy, dateWord } from './climate.js';
import { cropOf, cropName, presetOf, isCrop } from './crops.js';
import { TW, fmt } from './trends-words.js';
import { plainReason } from './satellites2-data.js';

export const T_CLEAR = 2, GRACE_MONTHS = 6, MAX_LIMITS = 3;
const fin = v => typeof v === 'number' && Number.isFinite(v);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y, m) => (m === 1 && leap(y) ? 29 : MONTH_DAYS[m]);
const median = list => { const a = list.filter(fin).sort((x, y) => x - y), h = a.length >> 1; return !a.length ? NaN : a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
const mean = list => { const a = list.filter(fin); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; };
const r1 = v => Math.round(v * 10) / 10;

// ---- the trend of one row: the land history's straight line, named only when clear
export function lineOf(years, values) {
  const pts = years.map((y, i) => [y, values[i]]).filter(p => fin(p[0]) && fin(p[1])), n = pts.length;
  if (n < MIN_YEARS) return { n, slope: NaN, t: NaN, clear: false, short: true };
  const t = trendOf(pts);
  if (!t) return { n, slope: NaN, t: NaN, clear: false, short: false };
  return { n, slope: t.slope, t: t.t, clear: !Number.isNaN(t.t) && Math.abs(t.t) >= T_CLEAR && t.slope !== 0, short: false };
}
const sizeWords = (perTen, digits) => fmt.num(Math.abs(perTen), Math.abs(perTen) < 1 && digits === 0 ? 1 : digits);
export const trendSize = (slope, digits = 0) => sizeWords(slope * 10, digits);   // the change every 10 years, in the row's own unit
export function trendSentence(tr, words, unit, digits = 0) {
  if (!tr) return '';
  if (tr.short) return TW.trendShort(tr.n);
  if (!tr.clear) return TW.trendNone;
  return TW.trendClear(tr.slope > 0 ? words.up : words.down, sizeWords(tr.slope * 10, digits), unit);
}

// ---- the crops' heat lines, from the farm's rotation (a preset's slots or the farmer's own list). Cover crops count too: they stand in the field in summer as well.
export function cropLimits(state) {
  const rot = state?.rotation, preset = typeof rot?.preset === 'string' ? presetOf(rot.preset) : null;
  const ids = (preset?.slots?.length ? preset.slots : Array.isArray(rot?.custom) ? rot.custom : []).filter(id => isCrop(id) && fin(cropOf(id).heat) && cropOf(id).type !== 'fallow');
  const by = new Map();
  for (const id of ids) { const h = cropOf(id).heat, name = cropName(id, true); if (!by.has(h)) by.set(h, []); if (!by.get(h).includes(name)) by.get(h).push(name); }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).slice(0, MAX_LIMITS).map(([heat, names]) => ({ heat, names }));
}

// ---- days at or above a heat line in each counted year, from the daily series, worked out exactly as js/climate.js counts its hot days:
// per month, the days read at or above the line, scaled to the whole month when at least 80 % of its days were read; a year with one month not read is NaN.
export function heatYears(series, years, limit) {
  const days = series?.days, hi = series?.T2M_MAX;
  if (!Array.isArray(days) || !hi || !fin(limit)) return years.map(() => NaN);
  const want = new Set(years), cell = new Map();
  for (let i = 0; i < days.length; i++) {
    const k = String(days[i]), y = +k.slice(0, 4), m = +k.slice(4, 6) - 1, v = hi[i];
    if (!want.has(y) || !(typeof v === 'number' && REAL.T2M_MAX(v))) continue;
    const key = y * 12 + m, c = cell.get(key) ?? cell.set(key, { n: 0, hit: 0 }).get(key);
    c.n++; if (v >= limit) c.hit++;
  }
  return years.map(y => {
    let t = 0;
    for (let m = 0; m < 12; m++) { const c = cell.get(y * 12 + m), all = daysIn(y, m); if (!c || !enough(c.n, MONTH_READ, all)) return NaN; t += c.hit / c.n * all; }
    return t;
  });
}

// ---- GRACE and GRACE-FO: the yearly average of the months read, a year counting with at least 6 of them
export function graceYears(g) {
  if (!g?.ok || !Array.isArray(g.months)) return [];
  const by = new Map(), last = g.months.at(-1)?.month ?? '', openYear = /-12$/.test(last) ? null : +last.slice(0, 4);   // the running year is not over: left out
  for (const m of g.months) { if (m.cm === null || !fin(m.cm)) continue; const y = +m.month.slice(0, 4); if (y === openYear) continue; const e = by.get(y) ?? by.set(y, []).get(y); e.push(m.cm); }
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([year, list]) => ({ year, n: list.length, cm: list.length >= GRACE_MONTHS ? r1(mean(list)) : NaN }));
}

// ---- the rows
const span = years => (years.length ? [years[0], years.at(-1)] : ['', '']);
function yearRow(id, words, years, series, { digits = 0, sources, notes = [], said, kind = 'bars', fmtValue = v => fmt.num(v, digits), trendOn = series[0].values, unit = words.unit, trendDigits = digits, extra = {} }) {
  const trend = lineOf(years, trendOn);
  return { id, title: words.title, kind, axis: words.axis, unit, years, series, trend, trendDigits, said, trendText: trendSentence(trend, words, unit, trendDigits), notes, sources, fmtValue, ...extra };
}

// The ONTARIO stations check of the first autumn frost covers roughly southern and central Ontario; elsewhere the date is said to be NASA's own.
export const nearStations = (lat, lon) => fin(lat) && fin(lon) && lat >= 41.6 && lat <= 50 && lon >= -90 && lon <= -74.3;

export function buildTrends({ C, series = null, state = null, grace, green, lat = C?.lat, lon = null } = {}) {
  if (!C || !Array.isArray(C.years) || !C.years.length) return { ok: false, reason: TW.noRecord };
  const years = C.years, [a, b] = span(years), rows = [], rainKeys = C.rainSource === 'imerg' ? ['power', 'gpm'] : C.rainSource === 'era5' ? ['era5'] : ['power', 'merra2'];

  // heat
  const limits = cropLimits(state), useCrops = limits.length && series?.days;
  const heatSets = useCrops ? limits.map(lim => ({ lim, values: heatYears(series, years, lim.heat) })) : [{ lim: { heat: 32, names: [] }, values: C.yearly.heat32 }];
  rows.push(yearRow('heat', TW.heat, years, heatSets.map(s => ({ key: `h${s.lim.heat}`, name: TW.heat.col(s.lim), values: s.values })), {
    sources: useCrops ? ['power', 'rules'] : ['power'],
    said: TW.heat.said(heatSets.map(s => TW.heat.part(fmt.num(median(s.values)), s.lim.heat)), a, b),
    notes: useCrops ? [TW.heat.line(limits), TW.heat.estimate] : [TW.heat.lineAny],
    extra: { limits: heatSets.map(s => s.lim) },
  }));

  // frost: season keys (half a year moved in the south), shown as days of the year
  const toDoy = list => list.map(k => (fin(k) ? keyToDoy(k, C.south) : NaN)), dateOf = v => (fin(v) ? dateWord(Math.round(v)) : TW.notRead);
  const frostRow = (id, words, keys, notes, margin = 0) => {
    const any = keys.some(fin), med = median(keys);
    return yearRow(id, words, years, [{ key: id, name: words.col, values: keys }], { kind: 'dots', sources: margin > 0 ? ['power', 'eccc'] : ['power'], said: any ? words.said(dateWord(Math.round(keyToDoy(med, C.south))), a, b) : words.none, notes: [margin > 0 ? words.lineMargin(margin) : words.line, ...notes], fmtValue: v => (fin(v) ? dateWord(Math.round(keyToDoy(v, C.south))) : TW.none), extra: { dates: toDoy(keys), dateOf, missing: TW.none } });   // a counted year with no frost night has no date: said as such, never as not read
  };
  rows.push(frostRow('springFrost', TW.springFrost, C.yearly.frostLast, []));
  const margin = fin(C.frostMargin) && C.frostMargin > 0 ? C.frostMargin : 0;   // the station margin of js/climate.js, when the autumn dates are already counted with it
  rows.push(frostRow('autumnFrost', TW.autumnFrost, C.yearly.frostFirst, [margin ? TW.autumnFrost.corrected(margin) : nearStations(lat, lon) ? TW.autumnFrost.station : TW.autumnFrost.stationFar], margin));

  // heavy rain: the 50 mm days are part of the 20 mm days
  const h50 = C.yearly.heavy50, with50 = h50.filter(v => fin(v) && v > 0).length, read50 = h50.filter(fin).length;
  rows.push(yearRow('heavy', TW.heavy, years, [{ key: 'h20', name: TW.heavy.col20, values: C.yearly.heavy }, { key: 'h50', name: TW.heavy.col50, values: h50 }], {
    kind: 'stack', sources: [...rainKeys, 'erosion'], said: TW.heavy.said(fmt.num(mean(C.yearly.heavy), 0), TW.heavy.m50(with50, read50), a, b),
    notes: [TW.heavy.line, TW.heavy.soil, ...(C.rainSource === 'imerg' ? [TW.heavy.satellite] : [])],
  }));

  // dry spells
  const dry = C.yearly.dryRun, topDry = Math.max(...dry.filter(fin)), topDryYear = years[dry.indexOf(topDry)];
  rows.push(yearRow('dry', TW.dry, years, [{ key: 'dry', name: TW.dry.col, values: dry }], { sources: rainKeys, said: dry.some(fin) ? TW.dry.said(fmt.num(median(dry)), fmt.num(topDry), topDryYear, a, b) : TW.notRead, notes: [TW.dry.line] }));

  // rain against the water given off, by month of a middle year: only where the record has the water given off (NASA POWER EVLAND)
  const P = C.monthly.P, ET = C.monthly.ET, hasEt = Array.isArray(ET) && ET.some(fin);
  if (hasEt) {
    const bal = P.map((p, m) => (fin(p) && fin(ET[m]) ? p - ET[m] : NaN)), short = bal.map((v, m) => (v < -0.5 ? m : -1)).filter(m => m >= 0), low = Math.min(...bal.filter(fin)), lowM = bal.indexOf(low);
    rows.push({ id: 'balance', title: TW.balance.title, kind: 'month', axis: TW.balance.axis, unit: 'mm', labels: MON, rain: P, et: ET, values: bal, trend: null, trendText: '', sources: [...rainKeys, 'merra2'],
      said: TW.balance.said(short.map(m => LONG[m]), low < -0.5 ? fmt.num(Math.abs(low)) : '', LONG[lowM]), notes: [TW.balance.line, TW.balance.what], fmtValue: v => fmt.num(v) });
  } else rows.push({ id: 'balance', title: TW.balance.title, kind: 'none', said: TW.balance.none, notes: [], sources: ['power'] });

  // stored water (regional)
  rows.push(storedRow(grace));
  // peak greenness
  rows.push(greenRow(green));

  // dry soil in the growing months, from the weather model's root-zone wetness; SMAP's short record is named, not charted here
  const seasonDays = (C.season?.months ?? [3, 4, 5, 6, 7, 8]).reduce((s, m) => s + MONTH_DAYS[m], 0), soilDays = C.yearly.stress.map(v => (fin(v) ? v * seasonDays : NaN));
  const topSoil = Math.max(...soilDays.filter(fin)), topSoilYear = years[soilDays.indexOf(topSoil)];
  rows.push(yearRow('soil', TW.soil, years, [{ key: 'soil', name: TW.soil.col, values: soilDays }], { sources: ['power', 'merra2', 'smap'], said: soilDays.some(fin) ? TW.soil.said(fmt.num(median(soilDays)), fmt.num(topSoil), topSoilYear, a, b) : TW.notRead, notes: [TW.soil.line, TW.soil.smap] }));

  return { ok: true, first: a, last: b, counted: years.length, rows };
}

export function storedRow(grace) {
  const W = TW.stored, base = { id: 'stored', title: W.title, sources: ['grace'] };
  if (grace === undefined || grace?.loading) return { ...base, kind: 'wait', said: TW.reading, notes: [] };
  if (!grace?.ok) return { ...base, kind: 'none', said: plainReason(grace?.reason, W.none), notes: [] };   // never a server's own words on a card
  const ys = graceYears(grace), years = ys.map(y => y.year), values = ys.map(y => y.cm), kept = values.filter(fin).length, read = ys.filter(y => fin(y.cm)).map(y => y.year);
  return yearRow('stored', W, years, [{ key: 'cm', name: W.col, values }], { digits: 1, sources: ['grace'], said: W.said(kept, read[0], read.at(-1)), notes: [W.line, W.gap, W.regional], kind: 'signed', extra: { months: ys.map(y => y.n) } });
}
export function greenRow(green) {
  const W = TW.green, base = { id: 'green', title: W.title, sources: ['gibs'] };
  if (green === undefined || green?.status === 'loading') return { ...base, kind: 'wait', said: TW.reading, notes: [] };
  const g = green?.status === 'ok' ? green.result : green;
  if (!g?.ok) return { ...base, kind: 'none', said: plainReason(g?.reason || green?.reason, TW.green.none), notes: [] };
  const years = g.seasons.map(s => s.year), values = g.seasons.map(s => (s.peak === null ? NaN : s.peak));
  return yearRow('green', W, years, [{ key: 'peak', name: W.col, values }], { digits: 2, kind: 'dots', sources: ['gibs'], said: W.said(fmt.num(median(values), 2), years[0], years.at(-1)), notes: [W.line, W.patch] });
}
