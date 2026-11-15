// Crophalo's Satellites & prices tab, two more NASA lookups, the figures: GRACE-FO regional water storage (a monthly record for a region about 300 km wide) and ECOSTRESS ground temperature
// (each clear pass of the space station over the field, seen at about 70 m), and HLS greenness. Rebuilt from the server's answer from known parts only: a month or a pass nobody could read is a gap
// or a reason, never a number. Pure: cleanGrace(), graceWords(), cleanEco(), ecoWords(), cleanHls(), hlsWords(); loadGrace(), loadEco() and loadHls() ask the server's own routes once each.
// Checked by scripts/test_satellites2.mjs (the lookups' own answers, the 2017-18 gap, the Falling / Rising / Roughly stable word, the 45 C days, a failed card's farmer sentence, hostile input, every sentence).
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
// A failed card never shows an internal reason: the server's sentence is turned into a farmer's sentence here (the table is in this module's tests). Anything not listed is passed through only when it is short and holds no path,
// no program name and no status code; otherwise the card's own plain fallback is used. Pure.
export const NOT_HERE = 'This reading is not available on this copy of Crophalo.';
export const NOT_NOW = 'This reading could not be started just now. Try again in a minute.';
export const TOO_LONG = 'This reading took too long. Try again in a minute.';
export const NASA_OFF = 'This NASA reading is not available right now.';
export const NO_POSITION = 'Your field\u2019s position was not given in a form this reading can use. Pick the field on the map again.';
export const NO_COUNTRY = 'The crop map covers Canada and the United States only.';
export const ECO_NO_COVER = 'NASA\u2019s ground-heat camera flies between 52\u00b0 north and 52\u00b0 south (the space station\u2019s orbit), so there is no reading for this place.';
const RULES = [
  [/lat must be -52\.\.52/i, ECO_NO_COVER],
  [/could not start python/i, NOT_NOW],
  [/python environment|\.venv|environment for the live lookups/i, NOT_HERE],
  [/timed out after/i, TOO_LONG],
  [/earthdata|\blogin\b|\btoken\b|approved for nasa/i, NASA_OFF],
  [/country of the field|country=/i, NO_COUNTRY],
  [/other websites|unknown endpoint|^use (get|post)\b/i, NOT_HERE],
  [/\blat\b|\blon\b|first and last must|plain number|whole number|not one of the known sources|real day written/i, NO_POSITION],
];
export function plainReason(reason, fallback) {
  const t = text(reason, 300);
  if (!t) return fallback;
  for (const [re, say] of RULES) if (re.test(t)) return say;
  return t.length > 260 || /[\\/]|traceback|exception|errno|\bpython\b|\bundefined\b|\bnull\b|\bstatus \d{3}\b|\bhttp \d{3}\b/i.test(t) ? fallback : t;
}
export const GRACE_DOWN = 'The GRACE-FO water-storage lookup did not answer. The rest of the report does not need it.';
export const ECO_DOWN = 'The ECOSTRESS ground-temperature lookup did not answer. The rest of the report does not need it.';
export const GRACE_MEANS = 'This is the water stored in the ground and soil over a region about 300 km wide, not a well in your field.';
export const ECO_MEANS = 'Ground temperature seen from space at about 70 m, not the air temperature.';
export const GRACE_DOI = '10.5067/TEMSC-3JC634';

// ---- GRACE-FO
export function cleanGrace(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true || !Array.isArray(raw.months)) return { ok: false, reason: plainReason(raw?.reason, GRACE_DOWN) };
  const seen = new Map();
  for (const row of raw.months.slice(0, 400)) {
    if (!Array.isArray(row) || !isMonth(row[0])) continue;
    const cm = fin(row[1]) && Math.abs(row[1]) < 5000 ? Math.round(row[1] * 100) / 100 : null, unc = cm !== null && fin(row[2]) && row[2] >= 0 && row[2] < 5000 ? Math.round(row[2] * 100) / 100 : null;
    seen.set(row[0], { month: row[0], cm, unc });
  }
  const months = [...seen.values()].sort((a, b) => a.month < b.month ? -1 : 1);
  if (!months.length || !months.some(m => m.cm !== null)) return { ok: false, reason: plainReason(raw?.reason, 'No month of the water-storage record could be read.') };
  const readMonths = months.filter(m => m.cm !== null), newest = readMonths.at(-1);
  const trend = fin(raw.trend_cm_per_year) && Math.abs(raw.trend_cm_per_year) < 1000 && isMonth(text(raw.trend_from, 7)) && isMonth(text(raw.trend_to, 7)) && fin(raw.trend_years) && raw.trend_years > 0 ? { perYear: Math.round(raw.trend_cm_per_year * 10) / 10, from: raw.trend_from, to: raw.trend_to, years: Math.round(raw.trend_years * 10) / 10 } : null;
  const gaps = [];   // runs of months with no value, from the series itself, so a gap is never drawn as a line
  let run = null; for (const m of months) { if (m.cm === null) { run ??= { from: m.month, to: m.month }; run.to = m.month; } else if (run) { gaps.push(run); run = null; } } if (run) gaps.push(run);
  const km = fin(raw.area_km) && raw.area_km > 0 && raw.area_km < 2000 ? Math.round(raw.area_km) : 300;
  return { ok: true, months, read: readMonths.length, gaps, newest: { month: newest.month, cm: newest.cm, unc: newest.unc }, trend, trendNote: text(raw.trend_note, 240), km, dataDate: text(raw.data_date, 40) };
}
// Falling / Rising / Roughly stable. An ordinary least-squares line through the months read inside the trend's own years; it is called Falling or Rising only when its slope is more than twice its own standard error
// (about 95 % confidence), otherwise Roughly stable. No fixed centimetre-a-year limit is used, because none has a published source: the record's own scatter decides instead.
// With under 24 months in the window there is no word. Pure.
export function graceDirection(g) {
  if (!g?.ok || !g.trend) return { word: null, why: 'not enough record' };
  const from = monthIndex(g.trend.from), to = monthIndex(g.trend.to), pts = g.months.filter(m => m.cm !== null && monthIndex(m.month) >= from && monthIndex(m.month) <= to).map(m => [(monthIndex(m.month) - from) / 12, m.cm]);
  if (pts.length < 24) return { word: null, why: 'not enough record' };
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0), slope = sxy / sxx;
  const sse = pts.reduce((a, p) => a + (p[1] - (my + slope * (p[0] - mx))) ** 2, 0), se = Math.sqrt(sse / (n - 2) / sxx);
  const word = Math.abs(slope) > 2 * se ? (slope < 0 ? 'Falling' : 'Rising') : 'Roughly stable';
  return { word, slope: Math.round(slope * 100) / 100, se: Math.round(se * 100) / 100, n };
}
export const GRACE_TILE = (g, km) => `Change in total water above and below ground (soil water, snow, lakes and groundwater together) over a region about ${km} km wide, ${monthWords(g.trend.from)} to ${monthWords(g.trend.to)}. Not a well level.`;
export const GRACE_PUMPING = 'The long decline matters for any crop that relies on pumping.';
export const GRACE_NO_DECLINE = 'No strong long-term decline.';
export const GRACE_RULE = 'Falling or Rising is said only when the slope of the line is more than twice its own uncertainty; otherwise the water is called Roughly stable.';
export const GRACE_LATE = 'NASA adds each month some time after it ends, so the newest weeks are never in this record.';
export function graceWords(g, { today } = {}) {
  if (!g?.ok) return { head: '', lines: [g?.reason ?? GRACE_DOWN] };
  const lines = [], n = g.newest;
  lines.push(`Newest month: ${monthWords(n.month)}, ${n.cm > 0 ? '+' : ''}${num(n.cm)} cm of stored water compared with NASA’s reference level${n.unc !== null ? ` (give or take ${num(n.unc)} cm)` : ''}.`);
  if (g.trend) lines.push(`Trend over ${monthWords(g.trend.from)} to ${monthWords(g.trend.to)} (${num(g.trend.years)} years): ${g.trend.perYear > 0 ? '+' : ''}${num(g.trend.perYear)} cm a year. It is the slope over those years, not one month.`);
  else lines.push('There is not enough record to give a trend, so none is shown.');
  const dir = graceDirection(g);
  if (dir.word) { lines.push(dir.word === 'Falling' ? GRACE_PUMPING : GRACE_NO_DECLINE); lines.push(GRACE_RULE); }
  if (g.trendNote) lines.push(g.trendNote);
  lines.push(`The newest month in this record is ${monthWords(n.month)}${isDay(today) ? `, which ended ${Math.max(0, Math.round((Date.parse(today + 'T00:00:00Z') - Date.UTC(+n.month.slice(0, 4), +n.month.slice(5), 1)) / 864e5))} days ago` : ''}. ${GRACE_LATE}`);
  const long = g.gaps.filter(s => monthIndex(s.to) - monthIndex(s.from) >= 2), short = g.gaps.length - long.length;   // only the long stretches are listed; the table has every month
  if (g.gaps.length) lines.push(`${long.length ? `${long.length === 1 ? 'A stretch' : 'Stretches'} with no data (${long.map(s => `${monthWords(s.from)} to ${monthWords(s.to)}`).join('; ')})${short ? ` and ${short} shorter ${short === 1 ? 'gap' : 'gaps'}` : ''}` : `${short} ${short === 1 ? 'month' : 'months'} with no data`} ${long.length + short === 1 ? 'is' : 'are'} left empty, never joined by a line.`);
  lines.push(GRACE_MEANS);
  return { head: `${n.cm > 0 ? '+' : ''}${num(n.cm)} cm`, direction: dir.word, lines };
}

// ---- ECOSTRESS
// The server's window is { first, last } (two days); older answers gave text. Both become "20 September to 14 November".
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayLong = d => isDay(d) ? `${+d.slice(8)} ${LONG[+d.slice(5, 7) - 1]}` : '';
export const windowWords = w => w && typeof w === 'object' ? (isDay(w.first) && isDay(w.last) ? `${dayLong(w.first)} to ${dayLong(w.last)}` : '') : text(w, 60);
export function cleanEco(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true || !Array.isArray(raw.passes)) return { ok: false, reason: plainReason(raw?.reason, ECO_DOWN) };
  const passes = [];
  for (const p of raw.passes.slice(0, 300)) {
    if (!p || typeof p !== 'object' || !isDay(p.date) || !fin(p.lst_c) || p.lst_c < -90 || p.lst_c > 90 || (p.day_night !== 'day' && p.day_night !== 'night')) continue;
    const solar = typeof p.solar_time === 'string' && /^\d{2}:\d{2}/.test(p.solar_time) ? p.solar_time.slice(0, 5) : '';
    passes.push({ date: p.date, solarDate: isDay(p.solar_date) ? p.solar_date : p.date, solar, dn: p.day_night, c: Math.round(p.lst_c * 10) / 10, err: fin(p.error_k) && p.error_k >= 0 && p.error_k < 50 ? Math.round(p.error_k * 10) / 10 : null });
  }
  passes.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const nu = raw.not_usable && typeof raw.not_usable === 'object' ? raw.not_usable : {}, cnt = v => fin(v) && v >= 0 && v < 1e5 ? Math.round(v) : 0;
  const sum = ecoSummary(passes), cv = raw.coverage && typeof raw.coverage === 'object' ? raw.coverage : null;
  const coverage = cv ? { found: cnt(cv.found), examined: cnt(cv.examined), backTo: isDay(cv.back_to) ? cv.back_to : null, kept: cnt(cv.kept), newlyRead: cnt(cv.newly_read), complete: cv.complete === true } : { found: 0, examined: 0, backTo: null, kept: 0, newlyRead: 0, complete: !text(raw.incomplete, 240) };   // an answer with no coverage is whole unless it says it was cut short
  return { ok: true, passes, summary: sum, coverage, found: cnt(raw.passes_found), checked: cnt(raw.passes_checked), notUsable: { cloud: cnt(nu.cloud), quality: cnt(nu.quality), water: cnt(nu.water), none: cnt(nu.no_data) }, window: windowWords(raw.window),
    pixel: fin(raw.pixel_m) && raw.pixel_m > 0 && raw.pixel_m < 1000 ? Math.round(raw.pixel_m) : 70, incomplete: text(raw.incomplete, 240), whyNone: text(raw.why_none, 300), newest: isDay(raw.newest_clear) ? raw.newest_clear : (passes[0]?.date ?? null) };
}
// The clear DAY days of the year: for each day its hottest pass, and how many of those days reached 45 C. Counted here from the passes themselves (never from a total the server says), by day not by pass, night never.
// 45 C: soil above it stopped sorghum seedlings establishing in the field (Peacock and others, Crop Science 30(1):138-143, 1990). A sorghum finding: other crops differ, and the card says so.
export const HOT_C = 45;
export const HOT_SOURCE = 'Peacock and others, Crop Science 1990 (sorghum seedlings in the field)';
export function ecoSummary(passes) {
  const days = new Map();
  for (const p of passes) if (p.dn === 'day' && (!days.has(p.solarDate) || p.c > days.get(p.solarDate))) days.set(p.solarDate, p.c);
  const list = [...days.entries()].sort((a, b) => b[1] - a[1]);
  return { dayDays: days.size, hotDays: list.filter(([, c]) => c >= HOT_C).length, max: list[0] ? list[0][1] : null, maxDate: list[0] ? list[0][0] : null, night: passes.filter(p => p.dn === 'night').length };
}
export const ECO_CLOUD = 'Cloudy days are missing, because the camera cannot see through cloud, so the real hottest day may have been hotter.';
export const ECO_WHY45 = `45 °C is where soil slowed seedlings coming up in field trials (${HOT_SOURCE}). Other crops differ.`;
export const clock = p => p.solar ? `${p.solar} local solar time` : 'time not given';
export const readSoFar = cv => `the newest ${cv.examined} of ${cv.found} passes${cv.backTo ? `, back to ${dayLong(cv.backTo)}` : ''}; the rest are still being read`;
export const ECO_GAVE_UP = 'The rest of the year is still unread after three tries. Open the report again later: it goes on from here.';
export function ecoWords(e) {
  if (!e?.ok) return { head: '', lines: [e?.reason ?? ECO_DOWN] };
  const lines = [], sm = e.summary ?? ecoSummary(e.passes), cv = e.coverage ?? { complete: true }, part = !cv.complete && cv.found > 0, so = part ? ' so far' : '';
  if (!sm.dayDays) lines.push(part ? `No clear daytime pass in what has been read so far (${readSoFar(cv)}).` : e.whyNone || 'No clear daytime pass could be used in the last year, so no ground heat is counted.');
  else {
    if (sm.hotDays) lines.push(`Ground hot enough to hurt seedlings (${HOT_C} °C or more) on ${sm.hotDays} of ${sm.dayDays} clear days${so}. The hottest${so} was ${num(sm.max)} °C on ${dayShort(sm.maxDate)}.`);
    if (!sm.hotDays)  lines.push(`Ground never reached ${HOT_C} °C on ${sm.dayDays} clear days${so} (hottest${so} ${num(sm.max)} °C, ${dayShort(sm.maxDate)}).`);
    if (part) lines.push(`Read so far: ${readSoFar(cv)}.`);
    const span = part && cv.backTo ? `${dayLong(cv.backTo)} to ${e.window && /to (.+)$/.exec(e.window) ? /to (.+)$/.exec(e.window)[1] : 'today'}` : e.window;
    lines.push(`${e.passes.length} clear ${e.passes.length === 1 ? 'pass' : 'passes'}${span ? `, ${span}` : ''}. Day and night passes are never compared with each other: the ground is hottest by day and coolest at night. Only day passes are counted for heat.`);
    lines.push(ECO_CLOUD, ECO_WHY45);
  }
  if (e.notUsable.cloud + e.notUsable.quality + e.notUsable.water + e.notUsable.none) lines.push(`Not used: ${[[e.notUsable.cloud, 'cloud'], [e.notUsable.quality, 'poor quality'], [e.notUsable.water, 'water'], [e.notUsable.none, 'no data']].filter(([k]) => k).map(([k, w]) => `${k} for ${w}`).join(', ')}.`);
  if (e.incomplete) lines.push(e.incomplete);
  if (e.gaveUp) lines.push(ECO_GAVE_UP);
  lines.push(ECO_MEANS);
  return { head: sm.dayDays ? `${sm.hotDays} of ${sm.dayDays}${so}` : '', lines };
}

// ---- HLS greenness (NASA/USGS Harmonized Landsat Sentinel-2): one dot for each clear photo, never a line across the days with none
// GET /api/hlsndvi?lat=&lon= -> { ok, passes: [{ date, sensor, ndvi, clear_pixels, of_pixels }], gaps, newest_date, newest_ndvi, why_none } or { ok: false, reason }
export const HLS_DOWN = 'The greenness lookup did not answer. The rest of the report does not need it.';
export const HLS_SCALE = 'The scale runs from 0 for bare ground to about 0.8 for thick green crop.';
export const HLS_CREDIT = 'NASA/USGS Harmonized Landsat Sentinel-2 (HLS), LP DAAC.';
export function cleanHls(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true || !Array.isArray(raw.passes)) return { ok: false, reason: plainReason(raw?.reason, HLS_DOWN) };
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
// The card asks again by itself until the year is read to the end or three asks have passed: each ask goes on where the last stopped (the server keeps every pass it read), nobody has to press anything.
// onUpdate gets every answer as it comes, with `again` set while another ask is under way; the last one says `gaveUp` when three asks left the year unfinished. Pure but for get, wait and onUpdate.
export async function loadEcoUntilDone(loc, { get = globalThis.fetch?.bind(globalThis), onUpdate = () => {}, tries = 3, wait = ms => new Promise(done => setTimeout(done, ms)), pause = 1500 } = {}) {
  let e = null;
  for (let n = 1; n <= tries; n++) {
    e = await loadEco(loc, get);
    const more = e.ok && !e.coverage.complete && e.coverage.found > 0;
    if (!more) { onUpdate(e); return e; }
    if (n === tries) { e = { ...e, gaveUp: true }; onUpdate(e); return e; }
    onUpdate({ ...e, again: { n: n + 1, of: tries } });
    await wait(pause);
  }
  return e;
}
export async function loadEco(loc, get = globalThis.fetch?.bind(globalThis)) {
  const q = pair(loc); if (!q || typeof get !== 'function') return { ok: false, reason: ECO_DOWN };
  try { return cleanEco(await (await get(`/api/ecopass?${q}`)).json()); } catch { return { ok: false, reason: ECO_DOWN }; }
}
