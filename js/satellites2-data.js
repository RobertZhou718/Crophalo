// Crophalo's Satellites & prices tab, two more NASA lookups, the figures: GRACE-FO regional water storage (a monthly record for a region about 300 km wide) and ECOSTRESS ground temperature
// (each clear pass of the space station over the field, seen at about 70 m), and HLS greenness. Rebuilt from the server's answer from known parts only: a month or a pass nobody could read is a gap
// or a reason, never a number. Pure: cleanGrace(), graceWords(), cleanEco(), ecoWords(), cleanHls(), hlsWords(); loadGrace(), loadEco() and loadHls() ask the server's own routes once each.
// Checked by scripts/test_satellites2.mjs (the lookups' own answers, the 2017-18 gap, a missing trend, day and night kept apart, no-clear-pass reasons, hostile input, every sentence).
/* GET /api/gracecell?lat=&lon= -> { ok, months: [[YYYY-MM, cm | null, uncertainty | null]], months_read, gaps, gap_spans, merged_months, newest_month, newest_date, value_cm, uncertainty_cm,
     trend_cm_per_year | null, trend_from, trend_to, trend_years, trend_note, cell, area_km, data_date } or { ok: false, reason }
   GET /api/ecopass?lat=&lon= -> { ok, passes: [{ date, utc, solar_time, solar_date, day_night, lst_c, lst_k, error_k, orbit, version, granule }], clear_passes, passes_checked,
     not_usable: { cloud, quality, water, no_data }, read_errors, newest_clear, window, pixel_m, incomplete, why_none } or { ok: false, reason } */
const fin = v => typeof v === 'number' && Number.isFinite(v);
const isMonth = m => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z'));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthWords = m => isMonth(m) ? `${MON[+m.slice(5) - 1]} ${m.slice(0, 4)}` : '';
const monthIndex = m => +m.slice(0, 4) * 12 + (+m.slice(5) - 1);
export const dayShort = d => isDay(d) ? `${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '';
const num = (v, d = 1) => v.toFixed(d).replace(/\.0$/, '');
const text = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
export const GRACE_DOWN = 'The GRACE-FO water-storage lookup did not answer. The rest of the report does not need it.';
export const ECO_DOWN = 'The ECOSTRESS ground-temperature lookup did not answer. The rest of the report does not need it.';
export const GRACE_MEANS = 'This is the water stored in the ground and soil over a region about 300 km wide, not a well in your field.';
export const ECO_MEANS = 'Ground temperature seen from space at about 70 m, not the air temperature.';
export const GRACE_DOI = '10.5067/TEMSC-3JC634';

// ---- GRACE-FO
export function cleanGrace(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true || !Array.isArray(raw.months)) return { ok: false, reason: text(raw?.reason, 240) || GRACE_DOWN };
  const seen = new Map();
  for (const row of raw.months.slice(0, 400)) {
    if (!Array.isArray(row) || !isMonth(row[0])) continue;
    const cm = fin(row[1]) && Math.abs(row[1]) < 5000 ? Math.round(row[1] * 100) / 100 : null, unc = cm !== null && fin(row[2]) && row[2] >= 0 && row[2] < 5000 ? Math.round(row[2] * 100) / 100 : null;
    seen.set(row[0], { month: row[0], cm, unc });
  }
  const months = [...seen.values()].sort((a, b) => a.month < b.month ? -1 : 1);
  if (!months.length || !months.some(m => m.cm !== null)) return { ok: false, reason: text(raw?.reason, 240) || 'No month of the water-storage record could be read.' };
  const readMonths = months.filter(m => m.cm !== null), newest = readMonths.at(-1);
  const trend = fin(raw.trend_cm_per_year) && Math.abs(raw.trend_cm_per_year) < 1000 && isMonth(text(raw.trend_from, 7)) && isMonth(text(raw.trend_to, 7)) && fin(raw.trend_years) && raw.trend_years > 0 ? { perYear: Math.round(raw.trend_cm_per_year * 10) / 10, from: raw.trend_from, to: raw.trend_to, years: Math.round(raw.trend_years * 10) / 10 } : null;
  const gaps = [];   // runs of months with no value, from the series itself, so a gap is never drawn as a line
  let run = null; for (const m of months) { if (m.cm === null) { run ??= { from: m.month, to: m.month }; run.to = m.month; } else if (run) { gaps.push(run); run = null; } } if (run) gaps.push(run);
  const km = fin(raw.area_km) && raw.area_km > 0 && raw.area_km < 2000 ? Math.round(raw.area_km) : 300;
  return { ok: true, months, read: readMonths.length, gaps, newest: { month: newest.month, cm: newest.cm, unc: newest.unc }, trend, trendNote: text(raw.trend_note, 240), km, dataDate: text(raw.data_date, 40) };
}
export function graceWords(g) {
  if (!g?.ok) return { head: '', lines: [g?.reason ?? GRACE_DOWN] };
  const lines = [], n = g.newest;
  lines.push(`Newest month: ${monthWords(n.month)}, ${n.cm > 0 ? '+' : ''}${num(n.cm)} cm of stored water compared with NASA’s reference level${n.unc !== null ? ` (give or take ${num(n.unc)} cm)` : ''}.`);
  if (g.trend) lines.push(`Trend over ${monthWords(g.trend.from)} to ${monthWords(g.trend.to)} (${num(g.trend.years)} years): ${g.trend.perYear > 0 ? '+' : ''}${num(g.trend.perYear)} cm a year. It is the slope over those years, not one month.`);
  else lines.push('There is not enough record to give a trend, so none is shown.');
  if (g.trendNote) lines.push(g.trendNote);
  const long = g.gaps.filter(s => monthIndex(s.to) - monthIndex(s.from) >= 2), short = g.gaps.length - long.length;   // only the long stretches are listed; the table has every month
  if (g.gaps.length) lines.push(`${long.length ? `${long.length === 1 ? 'A stretch' : 'Stretches'} with no data (${long.map(s => `${monthWords(s.from)} to ${monthWords(s.to)}`).join('; ')})${short ? ` and ${short} shorter ${short === 1 ? 'gap' : 'gaps'}` : ''}` : `${short} ${short === 1 ? 'month' : 'months'} with no data`} ${long.length + short === 1 ? 'is' : 'are'} left empty, never joined by a line.`);
  lines.push(GRACE_MEANS);
  return { head: `${n.cm > 0 ? '+' : ''}${num(n.cm)} cm`, lines };
}

// ---- ECOSTRESS
// The server's window is { first, last } (two days); older answers gave text. Both become "20 September to 14 November".
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayLong = d => isDay(d) ? `${+d.slice(8)} ${LONG[+d.slice(5, 7) - 1]}` : '';
export const windowWords = w => w && typeof w === 'object' ? (isDay(w.first) && isDay(w.last) ? `${dayLong(w.first)} to ${dayLong(w.last)}` : '') : text(w, 60);
export function cleanEco(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true || !Array.isArray(raw.passes)) return { ok: false, reason: text(raw?.reason, 240) || ECO_DOWN };
  const passes = [];
  for (const p of raw.passes.slice(0, 60)) {
    if (!p || typeof p !== 'object' || !isDay(p.date) || !fin(p.lst_c) || p.lst_c < -90 || p.lst_c > 90 || (p.day_night !== 'day' && p.day_night !== 'night')) continue;
    const solar = typeof p.solar_time === 'string' && /^\d{2}:\d{2}/.test(p.solar_time) ? p.solar_time.slice(0, 5) : '';
    passes.push({ date: p.date, solarDate: isDay(p.solar_date) ? p.solar_date : p.date, solar, dn: p.day_night, c: Math.round(p.lst_c * 10) / 10, err: fin(p.error_k) && p.error_k >= 0 && p.error_k < 50 ? Math.round(p.error_k * 10) / 10 : null });
  }
  passes.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const nu = raw.not_usable && typeof raw.not_usable === 'object' ? raw.not_usable : {}, cnt = v => fin(v) && v >= 0 && v < 1e5 ? Math.round(v) : 0;
  return { ok: true, passes, checked: cnt(raw.passes_checked), notUsable: { cloud: cnt(nu.cloud), quality: cnt(nu.quality), water: cnt(nu.water), none: cnt(nu.no_data) }, window: windowWords(raw.window),
    pixel: fin(raw.pixel_m) && raw.pixel_m > 0 && raw.pixel_m < 1000 ? Math.round(raw.pixel_m) : 70, incomplete: text(raw.incomplete, 240), whyNone: text(raw.why_none, 300), newest: isDay(raw.newest_clear) ? raw.newest_clear : (passes[0]?.date ?? null) };
}
export const clock = p => p.solar ? `${p.solar} local solar time` : 'time not given';
export function ecoWords(e) {
  if (!e?.ok) return { head: '', lines: [e?.reason ?? ECO_DOWN] };
  const lines = [];
  if (!e.passes.length) { lines.push(e.whyNone || 'No clear pass could be used in this window, so no ground temperature is shown.'); }
  else {
    lines.push(`${e.passes.length} clear ${e.passes.length === 1 ? 'pass' : 'passes'}${e.window ? `, ${e.window}` : ''}. Day and night passes are never compared with each other: the ground is hottest by day and coolest at night.`);
    if (e.notUsable.cloud + e.notUsable.quality + e.notUsable.water + e.notUsable.none) lines.push(`Not used: ${[[e.notUsable.cloud, 'cloud'], [e.notUsable.quality, 'poor quality'], [e.notUsable.water, 'water'], [e.notUsable.none, 'no data']].filter(([k]) => k).map(([k, w]) => `${k} for ${w}`).join(', ')}.`);
  }
  if (e.incomplete) lines.push(e.incomplete);
  lines.push(ECO_MEANS);
  return { head: e.passes.length ? `${e.passes[0].c} °C` : '', lines };
}

// ---- HLS greenness (NASA/USGS Harmonized Landsat Sentinel-2): one dot for each clear photo, never a line across the days with none
// GET /api/hlsndvi?lat=&lon= -> { ok, passes: [{ date, sensor, ndvi, clear_pixels, of_pixels }], gaps, newest_date, newest_ndvi, why_none } or { ok: false, reason }
export const HLS_DOWN = 'The greenness lookup did not answer. The rest of the report does not need it.';
export const HLS_SCALE = 'The scale runs from 0 for bare ground to about 0.8 for thick green crop.';
export const HLS_CREDIT = 'NASA/USGS Harmonized Landsat Sentinel-2 (HLS), LP DAAC.';
export function cleanHls(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true || !Array.isArray(raw.passes)) return { ok: false, reason: text(raw?.reason, 240) || HLS_DOWN };
  const passes = [];
  for (const p of raw.passes.slice(0, 200)) {
    if (!p || typeof p !== 'object' || !isDay(p.date) || !fin(p.ndvi) || p.ndvi < -1 || p.ndvi > 1) continue;
    const clear = fin(p.clear_pixels) && p.clear_pixels >= 0 ? Math.round(p.clear_pixels) : null, of = fin(p.of_pixels) && p.of_pixels > 0 ? Math.round(p.of_pixels) : null;
    passes.push({ date: p.date, sensor: text(p.sensor, 24), ndvi: Math.round(p.ndvi * 100) / 100, clear, of });
  }
  passes.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const gaps = Array.isArray(raw.gaps) ? raw.gaps.length : fin(raw.gaps) && raw.gaps >= 0 ? Math.round(raw.gaps) : 0, newest = passes.at(-1) ?? null;
  return { ok: true, passes, gaps, newest, whyNone: text(raw.why_none, 300) };
}
export function hlsWords(h) {
  if (!h?.ok) return { head: '', lines: [h?.reason ?? HLS_DOWN] };
  const lines = [];
  if (!h.passes.length) lines.push(h.whyNone || 'No clear photo of your field could be used in this window, so no greenness is shown.');
  else {
    lines.push(`Newest clear photo: ${dayShort(h.newest.date)}, greenness ${h.newest.ndvi}.`);
    lines.push(`${h.passes.length} clear ${h.passes.length === 1 ? 'photo' : 'photos'}. Days with no clear photo are left empty, never joined by a line${h.gaps ? ` (${h.gaps} such ${h.gaps === 1 ? 'stretch' : 'stretches'})` : ''}.`);
  }
  lines.push(HLS_SCALE);
  return { head: h.passes.length ? String(h.newest.ndvi) : '', lines };
}

// ---- asking the server's own routes
const pair = loc => { const lat = Number(loc?.lat), lon = Number(loc?.lon); return Number.isFinite(lat) && Number.isFinite(lon) ? `lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}` : ''; };
export async function loadGrace(loc, get = globalThis.fetch?.bind(globalThis)) {
  const q = pair(loc); if (!q || typeof get !== 'function') return { ok: false, reason: GRACE_DOWN };
  try { return cleanGrace(await (await get(`/api/gracecell?${q}`)).json()); } catch { return { ok: false, reason: GRACE_DOWN }; }
}
export async function loadHls(loc, get = globalThis.fetch?.bind(globalThis)) {
  const q = pair(loc); if (!q || typeof get !== 'function') return { ok: false, reason: HLS_DOWN };
  try { return cleanHls(await (await get(`/api/hlsndvi?${q}`)).json()); } catch { return { ok: false, reason: HLS_DOWN }; }
}
export async function loadEco(loc, get = globalThis.fetch?.bind(globalThis)) {
  const q = pair(loc); if (!q || typeof get !== 'function') return { ok: false, reason: ECO_DOWN };
  try { return cleanEco(await (await get(`/api/ecopass?${q}`)).json()); } catch { return { ok: false, reason: ECO_DOWN }; }
}
