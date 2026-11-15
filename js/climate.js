// Crophalo's climate indicators: the daily weather record of one spot turned into the few plain figures every screen uses.
// All of it is pure: no page, no storage, no network and no clock. Today's date is passed in, so one record always gives one answer.
// A reading nobody took is unknown (NaN), never zero, all the way to the words. Checked by scripts/test_climate.mjs,
// and on the recorded NASA answers, joined to js/data.js, by scripts/test_weather.mjs.

// THE DAILY RECORD READ HERE (S, as js/data.js builds it), field by field:
//   days            ['YYYYMMDD', …]  UTC days, oldest first, no day twice; a day may be absent altogether
//   T2M_MAX         °C       the day's high                 T2M_MIN   °C       the day's low (the night)
//   PRECTOTCORR     mm/day   rain of the weather model (MERRA-2; the back-up record's own rain when source is 'era5')
//   IMERG_PRECTOT   mm/day   rain seen by the GPM satellites (absent or all NaN on the back-up record)
//   GWETROOT        0 to 1   root-zone soil wetness         EVLAND    mm/day   water lost from the land to the air
//   IMERG_FRESH     0|1|2    optional: 1 or 2 marks a satellite rain day that is still a first estimate
//   lat             degrees  used when no latitude is passed            source   'power' | 'era5'
//   Every measure is one array as long as days, with NaN where no reading was taken. null, a missing array, the service's
//   fill value (−999) and anything outside the measure's possible range are read as NaN too, never as 0.
//   Not read here: lon, elev, cellElev, year, month, doy, rain, rainSource, through, lastDate. The calendar, the rain record
//   in use and the last days are worked out here from days and the readings, so a hand-made record needs only the fields above.
//   The second record of the coldest night is passed apart, as opts.cold: { night, night10, years } in °C (data.js coldFromDaily);
//   a what-if may carry it as S.cold, so that it moves with the temperatures.
//   The height correction is made before this file sees the record (data.js fitHeight).
import { Y0, FULL_YEAR_DAYS, REAL, IMERG_SHARE, MONTH_READ, enough, monthTotal as wholeMonth, coldOf, mergeCold, SEA_WORDS } from './data.js';

export const THR = [28, 29, 30, 32, 33, 35, 36, 38, 40, 42, 45];   // °C; up to 45 because sisal and date palms count days above their own limit
export const NOT_ENOUGH = 'Not enough complete years of weather';
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], DAYS_BEFORE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NORMAL_READ = 0.5;    // a monthly normal needs this share of the month's days over all the years
const SO_FAR_READ = 0.95;   // "so far" needs nearly every day: a missing stretch is a gap, never a dry spell
const MIN_YEARS = 5;        // fewer years than this make no trend and no "normal by now"
const HEAVY = 20, HEAVY50 = 50, DRY_DAY = 1, DRY_SOIL = 0.4, TROPIC = 23.5;
export const SOUTH_SHIFT = 182, AUTUMN = 200;   // frost keys: half a year's shift in the south (365 ÷ 2, rounded down); keys from 200 are the autumn side
const T_TOP = 1e6;          // a perfectly straight line has no scatter to divide by: its t is held here, not left infinite

// The first autumn frost on NASA's record. NASA POWER's night lows run warm on the clear, still autumn nights that bring the first
// frost: held against the daily records 2001 to 2025 of 35 Environment and Climate Change Canada stations in Ontario, NASA's first
// autumn frost came a median 11 days after the stations' own, while the last spring frost agreed (a median day apart). So on NASA's
// record, within 300 km of one of those stations, an autumn night whose low is under 2.5 °C counts as the first frost; the stations'
// median difference is then a day (a margin chosen on the southern stations alone leaves the northern ones 2 days late, and one
// chosen on the northern ones leaves the southern ones a day early; chosen on 34 and read on the one left out, each in turn, a day). The spring date and every count of frost nights stay at
// 0 °C, and the back-up record is read as it is. Checked by scripts/test_accuracy.mjs on the stations' own recorded nights.
export const AUTUMN_MARGIN = 2.5, MARGIN_KM = 300;   // °C; km from the nearest station
export const MARGIN_STATIONS = Object.freeze([   // latitude, longitude: Ear Falls, Lansdowne House, Pickle Lake, Barwick, Rawson Lake, Cameron Falls, Upsala, Kapuskasing, Nagagami,
  // Appleton, Cornwall, Hartington, Ompah, Ottawa, St. Albert, Shanty Bay, Udora, Goderich, Delhi, Harrow, Port Weller, Fergus, Mount Forest, Strathroy,
  // Belleville, Centreville, Hamilton, Trenton, Bonner Lake, Drummond Centre, Petawawa, Atikokan, Bancroft, Toronto North York, Egbert
  [50.63, -93.22], [52.20, -87.94], [51.45, -90.22], [48.63, -93.97], [49.65, -93.72], [49.15, -88.34], [49.03, -90.47], [49.41, -82.44], [49.75, -84.16],
  [45.19, -76.11], [45.02, -74.75], [44.43, -76.69], [45.05, -76.78], [45.38, -75.72], [45.29, -75.06], [44.40, -79.63], [44.26, -79.16], [43.77, -81.72],
  [42.87, -80.55], [42.03, -82.90], [43.25, -79.22], [43.73, -80.33], [43.98, -80.75], [42.98, -81.64], [44.15, -77.39], [44.40, -76.91], [43.29, -79.91],
  [44.12, -77.53], [49.38, -82.12], [45.03, -76.25], [45.88, -77.25], [48.76, -91.63], [45.07, -77.88], [43.78, -79.47], [44.23, -79.78],
].map(Object.freeze));
export const MARGIN_LATE = 11;   // days NASA's first autumn frost came after the stations' own, as a median, read at 0 °C
const km = (a, b, c, d) => { const r = Math.PI / 180, h = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(h))); };   // great-circle distance
export const nearStations = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && MARGIN_STATIONS.some(([a, b]) => km(lat, lon, a, b) <= MARGIN_KM);
export const autumnLine = (source, lat, lon) => source === 'power' && nearStations(lat, lon) ? AUTUMN_MARGIN : 0;
// Nothing grows where no month averages above 5 °C: FAO and IIASA's Global Agro-Ecological Zones (GAEZ v4) count the temperature
// growing period as the days with a daily mean above 5 °C.
export const GROW_LINE = 5;
// A place that is not farmland at all is said so in words, never shown with figures and plans (js/engine.js and js/report-load.js).
export const NO_GROWTH_WORDS = `No month here averages above ${GROW_LINE} °C, the warmth crops need to grow (the growing season of FAO GAEZ), so this is not farmland: Crophalo cannot compare crops here.`;
export const notFarmlandWords = C => (C?.noLand ? SEA_WORDS : C?.noGrowth ? NO_GROWTH_WORDS : '');
// The one sentence about the weather square, said where the climate is shown (the frost-free season, the report's gaps).
export const SQUARE_WORDS = 'Nearby fields can differ from these figures: NASA’s weather is the average of a square about 50 km across, so two fields on either side of a square’s edge can read about a degree apart and a week or more apart in frost-free days.';

// ---- small sums
const fin = Number.isFinite;
const sum = list => list.reduce((s, v) => s + v, 0);
const mean = list => list.length ? sum(list) / list.length : NaN;   // the mean of nothing is unknown, never 0
const sorted = list => list.filter(fin).sort((a, b) => a - b);
const median = list => { const s = sorted(list), h = s.length >> 1; return !s.length ? NaN : s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const months12 = f => Array.from({ length: 12 }, (_, m) => f(m));
const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const monthDays = (y, m) => m === 1 && leap(y) ? 29 : MONTH_DAYS[m];
const dayNum = (y, m, d) => Date.UTC(y, m, d) / 864e5;   // whole UTC days since 1970, as NASA counts days; a month past December rolls into the next year
const iso = num => new Date(num * 864e5).toISOString().slice(0, 10);
const lastRead = list => { for (let i = list.length - 1; i >= 0; i--) if (fin(list[i])) return i; return -1; };

// ---- reading the record
// The record checked and laid out once: each day's year, month and day number, each measure with NaN for every unread day.
function read(S, opts = {}) {
  if (!S || !Array.isArray(S.days) || !S.days.length) throw new Error('No daily weather was given');
  const n = S.days.length, y = new Array(n), m = new Array(n), num = new Array(n), doy = new Array(n);
  for (let i = 0, year = NaN, jan1 = NaN; i < n; i++) {
    const k = S.days[i], v = typeof k === 'string' && /^\d{8}$/.test(k) ? +k : NaN, yy = Math.floor(v / 1e4), mm = Math.floor(v / 100) % 100 - 1, dd = v % 100;
    if (!(mm >= 0 && mm <= 11 && dd >= 1 && dd <= monthDays(yy, mm))) throw new Error(`The weather record has a day that is not a date: ${String(k).slice(0, 12)}`);
    if (yy !== year) { year = yy; jan1 = dayNum(yy, 0, 1); }
    y[i] = yy; m[i] = mm; doy[i] = DAYS_BEFORE[mm] + (mm > 1 && leap(yy) ? 1 : 0) + dd; num[i] = jan1 + doy[i] - 1;
    if (i && num[i] <= num[i - 1]) throw new Error('The days of the weather record are out of order');   // a day counted twice would double its rain
  }
  const col = name => {
    const list = S[name], real = REAL[name], out = new Array(n).fill(NaN);
    if (list == null) return out;
    if (!(Array.isArray(list) || ArrayBuffer.isView(list)) || list.length !== n) throw new Error(`${name} does not match the days of the weather record`);
    for (let i = 0; i < n; i++) { const v = list[i]; if (typeof v === 'number' && real(v)) out[i] = v; }   // no numeric coercion: null would become 0
    return out;
  };
  const today = String(opts.today ?? iso(num[n - 1] + 1)).replace(/\D/g, '');   // with no date given, "today" is the day after the record ends
  if (today.length !== 8) throw new Error("Today's date must be given as YYYY-MM-DD");
  const cur = +today.slice(0, 4), y1 = cur - 1, ny = Math.max(0, y1 - Y0 + 1);   // y1: the last complete calendar year; cur is shown apart as "so far"
  const hi = col('T2M_MAX'), lo = col('T2M_MIN'), model = col('PRECTOTCORR'), gpm = col('IMERG_PRECTOT');
  // Satellite rain first: the weather model's gauge-corrected rain drifts low after about 2015 in several regions,
  // which would fake a drying trend, so it is only the fallback. First estimates are satellite rain too and count.
  const imerg = gpm.filter(fin).length / n > IMERG_SHARE;
  return {
    n, y, m, num, doy, hi, lo, model, gpm, gw: col('GWETROOT'), et: col('EVLAND'), imerg, rain: imerg ? gpm : model, cur, y1, ny,
    source: S.source === 'era5' ? 'era5' : 'power', at: null,   // at: day number → place in the record, made when a stretch of days is first asked for
    g: y.map((yy, i) => yy >= Y0 && yy <= y1 ? (yy - Y0) * 12 + m[i] : -1),   // which month of which year a day belongs to
    exp: Array.from({ length: ny * 12 }, (_, g) => monthDays(Y0 + Math.floor(g / 12), g % 12)),
  };
}

// For every month of every year: how many days were read and the sum of f over them.
function grid(R, list, f) {
  const n = new Float64Array(R.ny * 12), s = new Float64Array(R.ny * 12);
  for (let i = 0; i < R.n; i++) { const g = R.g[i], v = list[i]; if (g >= 0 && fin(v)) { n[g]++; s[g] += f ? f(v) : v; } }
  return { n, s };
}

// ---- the pieces every screen shares
// Growing degree days of one day: base 10 °C, cap 30 °C, the corn method (National Corn Handbook NCH-40).
export const gddDay = (high, low) => fin(high) && fin(low) ? Math.max(0, (Math.min(high, 30) + Math.max(Math.min(low, 30), 10)) / 2 - 10) : NaN;

// Hours of one day between 0 and 7.2 °C, from its low and high on a sine-wave day (plain chill hours, the usual way from daily data).
export function chillHours(low, high) {
  if (!fin(low) || !fin(high) || high < low) return NaN;
  const mid = (high + low) / 2, amp = (high - low) / 2;
  const under = (x, strict) => amp === 0 ? (strict ? mid < x : mid <= x) ? 1 : 0 : x <= mid - amp ? 0 : x >= mid + amp ? 1 : 0.5 + Math.asin((x - mid) / amp) / Math.PI;   // the share of the day under x
  return 24 * (under(7.2, false) - under(0, true));
}

// A frost night's place in the season: the day of the year, moved half a year in the south so spring keys stay under 200 there too.
export const seasonKey = (doy, south) => !south ? doy : doy + SOUTH_SHIFT > 365 ? doy + SOUTH_SHIFT - 365 : doy + SOUTH_SHIFT;
export const keyToDoy = (key, south) => !south ? key : key > SOUTH_SHIFT ? key - SOUTH_SHIFT : key + 365 - SOUTH_SHIFT;

// A straight line through yearly values by ordinary least squares: the slope per year and a plain t (slope ÷ its standard error).
export function trend(years, values) {
  const pts = years.map((x, i) => [x, values[i]]).filter(p => fin(p[0]) && fin(p[1])), n = pts.length;
  if (n < MIN_YEARS) return { slope: NaN, t: NaN, n };   // too few years: no trend is given
  const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
  const sxx = sum(pts.map(p => (p[0] - mx) ** 2)), slope = sum(pts.map(p => (p[0] - mx) * (p[1] - my))) / sxx;
  const se = Math.sqrt(sum(pts.map(p => (p[1] - my - slope * (p[0] - mx)) ** 2)) / (n - 2) / sxx);
  return { slope, t: se > 0 ? Math.max(-T_TOP, Math.min(T_TOP, slope / se)) : Math.sign(slope) * T_TOP, n };
}

// The first month of the wettest run of 1 to 12 months in a row (wrapping past December). A run through an unread month is never chosen.
function wetWindows(P) {
  const wet = [NaN];   // wet[0] is never used: runs are 1 to 12 months long
  for (let len = 1; len <= 12; len++) {
    let top = -1, at = NaN;
    for (let s = 0; s < 12; s++) { let t = 0; for (let j = 0; j < len; j++) t += P[(s + j) % 12]; if (t > top + 1e-9) { top = t; at = s; } }   // the earliest start wins a tie, and a rounding crumb is a tie
    wet.push(at);
  }
  return wet;
}

// ---- the climate of the spot
export function computeClimate(S, lat = S?.lat, opts = {}) {
  if (!fin(lat) || Math.abs(lat) > 90) throw new Error('The place has no latitude');
  const R = read(S, opts), south = lat < 0, tropic = Math.abs(lat) < TROPIC, { exp } = R;
  const both = R.hi.map((v, i) => fin(v) && fin(R.lo[i])), pair = list => list.map((v, i) => both[i] ? v : NaN), hit = line => v => v >= line ? 1 : 0;
  const G = {
    hi: grid(R, pair(R.hi)), lo: grid(R, pair(R.lo)), mid: grid(R, R.hi.map((v, i) => both[i] ? (v + R.lo[i]) / 2 : NaN)),
    rain: grid(R, R.rain), et: grid(R, R.et), gw: grid(R, R.gw), drySoil: grid(R, R.gw, v => v < DRY_SOIL ? 1 : 0),
    frost: grid(R, R.lo, v => v < 0 ? 1 : 0),   // frost is a night strictly below 0 °C; exactly 0 is not frost. Each night is judged on its own low
    heat: THR.map(line => grid(R, R.hi, hit(line))), heavy: grid(R, R.rain, hit(HEAVY)), heavy50: grid(R, R.rain, hit(HEAVY50)),
  };

  // Which years count: 330 days with both temperatures and 330 days with rain. A year with no rain readings is a gap, not a dry year.
  const daysRead = (g, yi) => g.n.subarray(yi * 12, yi * 12 + 12).reduce((s, v) => s + v, 0);
  const idx = []; for (let yi = 0; yi < R.ny; yi++) if (daysRead(G.mid, yi) >= FULL_YEAR_DAYS && daysRead(G.rain, yi) >= FULL_YEAR_DAYS) idx.push(yi);
  if (!idx.length) throw new Error(NOT_ENOUGH);   // never a history from nothing
  const years = idx.map(yi => Y0 + yi), pos = new Map(years.map((year, k) => [year, k]));

  // One month of one year, and one whole year. The unread days of a well-read month are taken at that month's own daily mean, never at 0.
  const well = (g, yi, m) => enough(g.n[yi * 12 + m], MONTH_READ, exp[yi * 12 + m]);
  const monthMean = (g, yi, m) => well(g, yi, m) ? g.s[yi * 12 + m] / g.n[yi * 12 + m] : NaN;
  const monthTotal = (g, yi, m) => wholeMonth(g.s[yi * 12 + m], g.n[yi * 12 + m], exp[yi * 12 + m]);
  const yearTotal = (g, yi) => { let t = 0; for (let m = 0; m < 12; m++) t += monthTotal(g, yi, m); return t; };   // NaN as soon as one month was not read: no honest yearly total

  // The normals of a calendar month over the years that count.
  const over = (g, m, list = idx) => { let n = 0, s = 0, e = 0; for (const yi of list) { n += g.n[yi * 12 + m]; s += g.s[yi * 12 + m]; e += exp[yi * 12 + m]; } return { n, s, e, ok: n > 0 && enough(n, NORMAL_READ, e) }; };
  const dayNormal = (g, m) => { const o = over(g, m); return o.ok ? o.s / o.n : NaN; };   // the mean of the days read
  const countNormal = (g, m) => { const o = over(g, m); return o.ok ? o.s / o.n * o.e / idx.length : NaN; };   // days per normal month, scaled by the days read so a half-read month is not undercounted
  const totalNormal = (g, m) => { const t = idx.map(yi => monthTotal(g, yi, m)).filter(fin); return over(g, m).ok && t.length * 2 >= idx.length ? mean(t) : NaN; };
  const wellNormal = (g, m) => { const list = idx.filter(yi => well(g, yi, m)), o = over(g, m, list); return list.length * 2 >= idx.length && o.n ? o.s / o.n : NaN; };

  const monthly = {
    tmax: months12(m => dayNormal(G.hi, m)), tmin: months12(m => dayNormal(G.lo, m)), tmean: [],
    P: months12(m => totalNormal(G.rain, m)), ET: months12(m => totalNormal(G.et, m)), gw: months12(m => wellNormal(G.gw, m)), heavy: [],
    frostByMonth: months12(m => countNormal(G.frost, m)), heatByMonth: G.heat.map(g => months12(m => countNormal(g, m))),
  };
  monthly.tmean = months12(m => (monthly.tmax[m] + monthly.tmin[m]) / 2);
  monthly.heavy = months12(m => fin(monthly.P[m]) ? countNormal(G.heavy, m) : NaN);
  const gaps = { temp: months12(m => m).filter(m => !fin(monthly.tmean[m])), rain: months12(m => m).filter(m => !fin(monthly.P[m])) };

  // The growing season: April to September north of the tropics, October to March south of them, and in the tropics the
  // wettest six months in a row. A season is named by the year it starts in and may run past New Year.
  const wet = wetWindows(monthly.P), gsStart = tropic ? wet[6] : south ? 9 : 3;
  const seasonMonths = s => fin(gsStart) ? Array.from({ length: 6 }, (_, j) => [s + (gsStart + j > 11 ? 1 : 0), (gsStart + j) % 12]) : [];
  const seasonRead = (g, s) => { const ms = seasonMonths(s); return ms.length > 0 && ms.every(([year, m]) => pos.has(year) && well(g, year - Y0, m)); };
  const seasonTotal = (g, s) => seasonRead(g, s) ? sum(seasonMonths(s).map(([year, m]) => monthTotal(g, year - Y0, m))) : NaN;
  const seasonShare = (g, s) => seasonRead(g, s) ? sum(seasonMonths(s).map(([year, m]) => g.s[(year - Y0) * 12 + m])) / sum(seasonMonths(s).map(([year, m]) => g.n[(year - Y0) * 12 + m])) : NaN;
  const gsRain = years.map(s => seasonTotal(G.rain, s)), stress = years.map(s => seasonShare(G.drySoil, s)), gwSeason = years.map(s => seasonShare(G.gw, s));

  // One pass over the days for what a monthly sum cannot hold: frost dates, the coldest night, the wettest day, winter chill, dry spells.
  const rows = years.map(() => ({ nights: 0, frosts: 0, last: NaN, first: NaN, cold: NaN, top: NaN, chill: 0, chillRead: 0, run: 0 }));
  const coldHalf = m => south ? m >= 3 && m <= 8 : m <= 2 || m >= 9;
  const line = autumnLine(R.source, lat, fin(opts.lon) ? opts.lon : S.lon);   // 0 °C, or the autumn margin on NASA's record in the stations' area
  let run = 0, before = NaN;
  for (let i = 0; i < R.n; i++) {
    const row = rows[pos.get(R.y[i])], lo = R.lo[i], rain = R.rain[i], m = R.m[i];
    if (!row) continue;
    if (fin(lo)) {
      row.nights++; if (!(lo >= row.cold)) row.cold = lo;
      if (lo < line || lo < 0) {
        const key = seasonKey(R.doy[i], south);
        if (lo < 0) { row.frosts++; if (key < AUTUMN && !(key <= row.last)) row.last = key; }
        if (key >= AUTUMN && !(key >= row.first)) row.first = key;
      }
    }
    const chill = both[i] && coldHalf(m) ? chillHours(lo, R.hi[i]) : NaN;
    if (fin(chill)) { row.chill += chill; row.chillRead++; }   // a day whose high reads under its low is not a reading
    if (fin(rain) && !(rain <= row.top)) row.top = rain;
    // Dry spell: one counter over the whole record, so a spell that crosses New Year is not cut in two. It ends on a wet day,
    // outside the season, in a year that does not count and on any day that was not read: an unread day is not a dry day.
    const inSeason = fin(gsStart) && (m - gsStart + 12) % 12 < 6, season = rows[pos.get(m >= gsStart ? R.y[i] : R.y[i] - 1)];
    if (inSeason && fin(rain) && rain < DRY_DAY) { run = R.num[i] === before + 1 ? run + 1 : 1; before = R.num[i]; if (season && run > season.run) season.run = run; } else { run = 0; before = NaN; }
  }
  const chillDays = year => sum(MONTH_DAYS.map((_, m) => coldHalf(m) ? monthDays(year, m) : 0));
  const yearOf = g => idx.map(yi => yearTotal(g, yi)), at = line => G.heat[THR.indexOf(line)];
  const yearly = {
    P: yearOf(G.rain), T: idx.map(yi => yearTotal(G.mid, yi) / (leap(Y0 + yi) ? 366 : 365)), gsRain,
    heat32: yearOf(at(32)), heat35: yearOf(at(35)), heat35m: idx.map(yi => months12(m => monthTotal(at(35), yi, m))), heavy: yearOf(G.heavy), heavy50: yearOf(G.heavy50), maxDay: [], dryRun: rows.map((row, k) => fin(gsRain[k]) ? row.run : NaN), stress,
    frostLast: rows.map(row => row.last), frostFirst: rows.map(row => row.first),
    // No frost: the whole year is free. Every night read froze: none is. Else from the last spring frost to the first autumn frost.
    frostFree: rows.map(row => !row.frosts ? 365 : row.frosts === row.nights ? 0 : Math.min(365, (fin(row.first) ? row.first : 365) - (fin(row.last) ? row.last : 0))),
    coldest: rows.map(row => row.cold),
    chill: rows.map((row, k) => row.chill / row.chillRead * chillDays(years[k])),   // scaled by the winter days read: a year that counts has at least 147 of them
  };
  yearly.maxDay = rows.map((row, k) => fin(yearly.P[k]) ? row.top : NaN);
  const med = {
    P: median(yearly.P), T: median(yearly.T), gsRain: median(gsRain), heat32: median(yearly.heat32), heat35: median(yearly.heat35),
    heavy: mean(yearly.heavy.filter(fin)), heavy50: mean(yearly.heavy50.filter(fin)), maxDay: median(yearly.maxDay), dryRun: median(yearly.dryRun), stress: mean(stress.filter(fin)),
    frostLast: median(yearly.frostLast), frostFirst: median(yearly.frostFirst), frostFree: median(yearly.frostFree),
  };

  // A dry year is a quarter short on growing-season rain, or clearly dry soil with below-normal rain: not simply the driest fifth of years.
  const soil = gwSeason.filter(fin), soilMean = mean(soil), soilSd = soil.length >= MIN_YEARS ? Math.sqrt(sum(soil.map(v => (v - soilMean) ** 2)) / (soil.length - 1)) : NaN;
  const dryYears = years.filter((_, k) => gsRain[k] < 0.75 * med.gsRain || (soilSd > 1e-6 && (gwSeason[k] - soilMean) / soilSd < -1 && gsRain[k] < 0.9 * med.gsRain));
  const dryOf = gsRain.filter(fin).length;   // only seasons with a full rain total can be judged

  // The coldest night, and the second record: the middle of the two is used, the colder is kept for the cautious checks, both are shown.
  const { records, differ, note, ...cold } = mergeCold(coldOf(yearly.coldest), opts.cold ?? S.cold);   // one rule for both records, kept in js/data.js
  const coolest = Math.min(...monthly.tmean.filter(fin)), known = gaps.temp.length === 0;
  const day = list => { const i = lastRead(list); return i < 0 ? null : iso(R.num[i]); };
  return {
    lat, south, tropic, source: R.source, imerg: R.imerg, rainSource: R.imerg ? 'imerg' : R.source === 'era5' ? 'era5' : 'merra2',
    years, y0: Y0, y1: R.y1, through: day(pair(R.hi)), rainThrough: day(R.rain),   // the last day with both temperatures, and the last day of the rain record in use
    monthly, gaps, wet, season: fin(gsStart) ? { start: gsStart, months: Array.from({ length: 6 }, (_, j) => (gsStart + j) % 12) } : null,
    yearly, med,
    frostMargin: line, frostSource: line ? 'power+eccc' : R.source,   // the autumn margin in use (0 or 2.5 °C), and what the frost dates rest on
    noLand: S.noLand === true,   // NASA sent its "no value" mark for every day of soil wetness and water from the land: the square is sea or ice
    noGrowth: known && Math.max(...monthly.tmean) <= GROW_LINE,   // no month of a normal year averages above 5 °C (FAO GAEZ): no growing season at all
    frostFreeClimate: rows.filter(row => fin(row.last)).length * 2 < years.length,   // fewer than half the years had a spring frost
    coldWinter: coolest < -3 ? true : known ? false : null,   // null: an unread month could be the cold one
    dry: med.P < 500 || med.gsRain < 260 ? true : fin(med.P) && fin(med.gsRain) ? false : null,
    ...cold, coldRecords: records, coldDiffer: differ, coldNote: note,   // coldNight(10), coldNasa(10), coldSecond(10), coldLow(10); the note is the sentence for when the two records are 2 °C or more apart
    chill: median(yearly.chill),
    dryYears, dryOf, droughtYears: dryOf ? dryYears.length / dryOf : NaN,
    gwCal: idx.map(yi => months12(m => monthMean(G.gw, yi, m) - monthly.gw[m])),   // that month's soil wetness that year, less the month's normal
    // Each month of each year that counts, for the counts by growth stage (js/compare.js): rain (mm), days of 20 mm or more, and days at or above each heat line; NaN where the month was not read well.
    rainCal: idx.map(yi => months12(m => monthTotal(G.rain, yi, m))),
    heavyCal: idx.map(yi => months12(m => well(G.heavy, yi, m) ? G.heavy.s[yi * 12 + m] : NaN)),
    hotCal: Object.fromEntries(THR.map((line, j) => [line, idx.map(yi => months12(m => well(G.heat[j], yi, m) ? G.heat[j].s[yi * 12 + m] : NaN))])),
    trend: { P: trend(years, yearly.P), T: trend(years, yearly.T), heat32: trend(years, yearly.heat32), heavy: trend(years, yearly.heavy), stress: trend(years, stress) },
  };
}

// Hot days per month of a normal year at a crop's own heat limit, from the buckets of THR.
// 'near': the bucket nearest the limit (the lower one on a tie); 'under': the highest bucket at or under it; 'between': a straight line
// between two buckets. A limit under the lowest bucket is unknown for 'under' and 'between': the lowest bucket would count too few days.
export function hotDaysAt(C, limit, how = 'near') {
  const H = C.monthly.heatByMonth, none = months12(() => NaN);
  if (!fin(limit)) return none;
  const k = THR.findLastIndex(line => line <= limit);
  if (how === 'under') return k < 0 ? none : H[k];
  if (how === 'between') {
    if (k < 0) return none;
    if (k === THR.length - 1) return H[k];   // over the highest bucket: that bucket, which can only count too many days
    const share = (limit - THR[k]) / (THR[k + 1] - THR[k]);
    return months12(m => H[k][m] + share * (H[k + 1][m] - H[k][m]));
  }
  let best = 0; for (let k = 1; k < THR.length; k++) if (Math.abs(THR[k] - limit) < Math.abs(THR[best] - limit)) best = k;
  return H[best];
}

// ---- the report's frost dates, on real days of the year
// Per year the last spring frost and the first autumn frost; "rare" is frost in fewer than half the years;
// a usual date is given only when at least half the years had one.
export function computeFrost(S, lat = S?.lat, opts = {}) {
  if (!fin(lat)) throw new Error('The place has no latitude');
  const R = read(S, opts), south = lat < 0, rows = new Map(), line = autumnLine(R.source, lat, fin(opts.lon) ? opts.lon : S.lon);
  for (let i = 0; i < R.n; i++) {
    const lo = R.lo[i], year = R.y[i], doy = R.doy[i];
    if (R.g[i] < 0 || !fin(lo)) continue;
    const row = rows.get(year) ?? rows.set(year, { nights: 0, last: NaN, first: NaN, months: new Set() }).get(year);
    row.nights++;
    const frost = lo < 0, margin = !frost && lo < line && !south && doy >= AUTUMN;   // a night under the autumn margin counts for the autumn date only, from day 200 as in computeClimate
    if (!frost && !margin) continue;
    if (frost) row.months.add(R.m[i]);
    const spring = (doy <= 182) !== south;   // spring is the first half of the year in the north, the second half in the south
    if (spring) { if (!(doy <= row.last)) row.last = doy; } else if (!(doy >= row.first)) row.first = doy;
  }
  const kept = [...rows.values()].filter(row => row.nights >= FULL_YEAR_DAYS), M = kept.length, half = count => M > 0 && count * 2 >= M;
  const lasts = kept.map(row => row.last).filter(fin), firsts = kept.map(row => row.first).filter(fin);
  const frostYears = kept.filter(row => row.months.size > 0).length, everyMonth = kept.filter(row => row.months.size === 12).length;
  const last = half(lasts.length) ? median(lasts) : NaN, first = half(firsts.length) ? median(firsts) : NaN;
  return {
    years: M, frostYears, rare: M ? frostYears * 2 < M : null, lastYears: lasts.length, firstYears: firsts.length, last, first,
    free: first - last + (south ? 365 : 0), everyMonth, allYear: half(everyMonth), south, margin: line, source: R.source,
  };
}

// ---- this year so far
// One stretch of days against the same number of days from the same start in every earlier year. A year counts only with
// nearly every day read. What was read this year is given as it is; the comparison is made per day read, so an unread day
// is never taken as a dry or a cool one.
function stretch(R, list, startOf, label, end, f = v => v) {
  const days = end - startOf(label) + 1;
  if (!(days > 0)) return { days: 0, read: 0, total: NaN, mean: NaN, normal: NaN, normalMean: NaN, pct: NaN, years: 0, since: null, through: null };
  R.at ??= new Map(R.num.map((v, i) => [v, i]));
  const span = from => { let read = 0, s = 0; for (let k = 0; k < days; k++) { const v = list[R.at.get(from + k)]; if (fin(v)) { read++; s += f(v); } } return { read, s }; };
  const now = span(startOf(label)), ok = enough(now.read, SO_FAR_READ, days), past = [];
  for (let old = Y0; old < label; old++) { const p = span(startOf(old)); if (enough(p.read, SO_FAR_READ, days)) past.push(p.s / p.read); }
  const usual = ok && past.length >= MIN_YEARS ? mean(past) : NaN, mine = ok ? now.s / now.read : NaN;
  return { days, read: now.read, total: ok ? now.s : NaN, mean: mine, normal: usual * now.read, normalMean: usual, pct: usual > 0 ? (mine / usual - 1) * 100 : NaN, years: past.length, since: iso(startOf(label)), through: iso(end) };
}

// Rain three ways (the satellites to their own last day, the weather model to its last day, the model over the satellites' days),
// the mean temperature, the days of 32 °C or more and the soil wetness of the last 30 days, each against the same days of earlier years.
export function computeYTD(S, opts = {}) {
  const R = read(S, opts), jan1 = year => dayNum(year, 0, 1), end = list => { const i = lastRead(list); return i < 0 ? NaN : R.num[i]; };
  const sinceJan = (list, last, f) => stretch(R, list, jan1, R.cur, last, f);
  const gpmEnd = end(R.gpm), gpm = fin(gpmEnd) ? sinceJan(R.gpm, gpmEnd) : null, modelSame = gpm ? sinceJan(R.model, gpmEnd) : null;
  const mid = R.hi.map((v, i) => fin(R.lo[i]) ? (v + R.lo[i]) / 2 : NaN), soilEnd = end(R.gw);
  const fresh = Array.isArray(S.IMERG_FRESH) ? R.y.filter((year, i) => year === R.cur && (S.IMERG_FRESH[i] === 1 || S.IMERG_FRESH[i] === 2)).length : 0;
  const plain = ({ pct, ...figure }, more) => ({ ...figure, ...more });   // a percentage means nothing for degrees, days or a share of saturation
  const temp = sinceJan(mid, end(mid)), soil = stretch(R, R.gw, year => jan1(year) + soilEnd - jan1(R.cur) - 29, R.cur, soilEnd);
  return {
    year: R.cur, source: R.source, gpm, model: sinceJan(R.model, end(R.model)), modelSame, fresh,
    agree: gpm && fin(gpm.pct) && fin(modelSame.pct) ? Math.abs(gpm.pct - modelSame.pct) <= 20 + 1e-9 : null,   // within 20 points, a rounding crumb aside
    temp: plain(temp, { diff: temp.mean - temp.normalMean }), hot: plain(sinceJan(R.hi, end(R.hi), v => v >= 32 ? 1 : 0)),
    soil: plain(soil, { diff: soil.mean - soil.normalMean }),
  };
}

// Warmth for crops this season: growing degree days from 1 April (north) or 1 October (south, across New Year) to the last
// day read, against earlier years. Once the six months are over, the whole last season is shown until the next one starts.
export function computeGDD(S, lat = S?.lat, opts = {}) {
  if (!fin(lat)) throw new Error('The place has no latitude');
  const R = read(S, opts), south = lat < 0, month = south ? 9 : 3, gdd = R.hi.map((v, i) => gddDay(v, R.lo[i])), i = lastRead(gdd);
  const startOf = year => dayNum(year, month, 1), label = i < 0 ? NaN : R.m[i] >= month ? R.y[i] : R.y[i] - 1;
  const close = dayNum(label, month + 6, 1) - 1, full = i >= 0 && R.num[i] > close;
  return { ...stretch(R, gdd, startOf, label, i < 0 ? NaN : Math.min(R.num[i], close)), south, full };
}

// ---- what-ifs
const moved = (S, change) => { const out = { ...S }; for (const name of Object.keys(REAL)) if (S[name] && change[name]) out[name] = Array.from(S[name], (v, i) => fin(v) ? change[name](v, i) : v); return out; };

// A plain what-if, not new data: rain by a percentage, temperatures by degrees, and optional month-by-month changes
// (months: { dTx, dTn, r } with r the rain factor) with the plain shift stacked on top. A month with no change given becomes unknown.
export function applyScenario(S, sc = {}) {
  const pct = fin(sc.rainPct) ? sc.rainPct : 0, dT = fin(sc.tempC) ? sc.tempC : 0, mo = sc.months, monthOf = i => +S.days[i].slice(4, 6) - 1;
  const by = (list, i, none) => !mo ? none : fin(list?.[monthOf(i)]) ? list[monthOf(i)] : NaN;
  const rain = (v, i) => v * (1 + pct / 100) * by(mo?.r, i, 1), wetter = 1 + 0.6 * pct / 100 - 0.03 * dT;
  const out = moved(S, {
    T2M_MAX: (v, i) => v + dT + by(mo?.dTx, i, 0), T2M_MIN: (v, i) => v + dT + by(mo?.dTn, i, 0), PRECTOTCORR: rain, IMERG_PRECTOT: rain,
    EVLAND: v => v * (1 + 0.04 * dT), GWETROOT: v => Math.max(0.02, Math.min(1, v * wetter)),
  });
  if (S.cold) out.cold = { ...S.cold, night: S.cold.night + dT, night10: S.cold.night10 + dT };
  if (S.rain) out.rain = S.rain === S.IMERG_PRECTOT ? out.IMERG_PRECTOT : out.PRECTOTCORR;   // the weather module's name for the rain record in use follows the change
  return out;
}

// ---- the words
// Every sentence checks its own figure first: an unknown figure gets its own plain sentence, never "NaN" in the text.
const MON = MONTHS.map(name => name.slice(0, 3));
const num = (v, digits = 0) => { const text = Math.abs(v).toFixed(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (v < 0 && /[1-9]/.test(text) ? '−' : '') + text; };
const signed = (v, digits = 0) => (v > 0 && /[1-9]/.test(num(v, digits)) ? '+' : '') + num(v, digits);
const listWords = list => list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
export const dateWord = doy => { if (!(doy >= 1 && doy <= 366)) return 'an unknown day'; let d = Math.round(doy), m = 0; while (m < 11 && d > MONTH_DAYS[m]) d -= MONTH_DAYS[m++]; return `${MON[m]} ${d}`; };   // "Apr 21", on a year without a leap day; no date, no made-up word
const dayWord = date => `${+date.slice(8, 10)} ${MON[+date.slice(5, 7) - 1]}`;   // "3 Nov"

// "−12 mm per decade · possible trend": the slope over ten years, and how clear the line is.
export function trendWords(tr, unit, digits = 0) {
  if (!tr || !fin(tr.slope) || !fin(tr.t)) return 'Not enough data for a trend';
  const size = Math.abs(tr.t);
  return `${signed(tr.slope * 10, digits)} ${unit} per decade · ${size >= 2.5 ? 'clear trend' : size >= 1.5 ? 'possible trend' : 'no clear trend'}`;
}

// "the weather record has no readings for May": for the months of C.gaps.temp or C.gaps.rain; empty when no month is missing.
export const gapWords = months => months?.length ? `the weather record has no readings for ${listWords(months.map(m => MONTHS[m]))}` : '';

export function frostWords(F) {
  if (!F || !(F.years > 0)) return 'Too few nights were read to say when frost comes here.';
  const of = `frost in ${F.frostYears} of ${F.years} years`, date = (name, doy) => fin(doy) ? `${name}: usually about ${dateWord(doy)}.` : `No reliable usual date for the ${name.toLowerCase()}.`;
  if (!F.frostYears) return `No frost in any of ${F.years} years.`;
  if (F.allYear) return `Frost in every month of the year (in ${F.everyMonth} of ${F.years} years).`;
  if (F.rare) return `Frost is rare here: ${of}. No reliable usual frost date here.`;
  if (!fin(F.last) && !fin(F.first)) return `Some years: ${of}, no reliable dates.`;   // a missing date has its own sentence, never the worst wording
  return `${date('Last spring frost', F.last)} ${date('First autumn frost', F.first)}${fin(F.free) ? ` About ${num(F.free)} days lie between them.` : ''} Counted night by night: ${of}.${fin(F.first) ? autumnWords(F.margin, F.source) : ''}`;
}
// Where the autumn date comes from, and the low spots: said after every first autumn frost date (the Weather tab and the report).
export function autumnWords(margin, source) {
  const low = ' Low, cold spots can get frost two weeks earlier, or more.';
  if (margin > 0) return ` NASA’s night lows run warm in autumn, so here a night under ${margin} °C counts for the autumn date; read that way, it sits in the middle of what ${MARGIN_STATIONS.length} Ontario weather stations (Environment and Climate Change Canada) recorded.${low}`;
  if (source === 'power') return ` This autumn date is NASA’s own: where it was held against weather stations, in Ontario, it came about ${MARGIN_LATE} days late.${low}`;
  return low;
}

export function hotWords(C, Y) {
  const days = C?.med?.heat32;
  if (!fin(days)) return { status: 'Unknown', text: 'Too few readings to count the hot days here.' };
  const status = days >= 30 ? 'Risk' : days >= 10 ? 'Watch' : 'Good', soFar = Y && fin(Y.hot?.total) && fin(Y.hot?.normal);
  return { status, text: (status === 'Good' ? 'Heat stress is rare here.' : `Heat can hurt crops at flowering.${C.trend.heat32.t > 1.5 ? ' And it is increasing.' : ''}`) + (soFar ? ` So far in ${Y.year}: ${num(Y.hot.total)} (normal by now ${num(Y.hot.normal)}).` : '') };
}

export function heavyWords(C) {
  if (!fin(C?.med?.heavy)) return 'Too few rain readings to count the heavy-rain days here.';
  return `Heavy-rain days (20 mm or more in a day): about ${num(C.med.heavy)} a year.` + (fin(C.med.maxDay) ? ` The wettest day of a normal year brings about ${num(C.med.maxDay)} mm: bare soil is most at risk then.` : '');
}

export const drySpellWords = C => fin(C?.med?.dryRun) ? `A dry spell lasts about ${num(C.med.dryRun)} days in a normal season.` : 'Too few rain readings to say how long a dry spell lasts here.';
export const dryYearsWords = C => C?.dryOf > 0 ? `${C.dryYears.length} of ${C.dryOf} years` : 'Too few rain readings to count the dry years here.';

// The "Rain so far" tile: the satellites and the weather model held against each other before anything is said.
export function rainSoFarWords(Y) {
  const g = Y?.gpm, same = Y?.modelSame, model = Y?.source === 'era5' ? 'the back-up weather record' : "NASA's weather model";
  const word = pct => pct > 10 ? 'Wetter' : pct < -10 ? 'Drier' : 'Normal', band = pct => ({ status: word(pct), tone: pct < -20 ? 'Risk' : pct < -10 || pct > 30 ? 'Watch' : 'Good' });
  const have = (f, name) => `Normal by this date: ${num(f.normal)} mm. You have ${num(f.total)} mm, ${name} through ${dayWord(f.through)}`;
  const figure = f => `${num(f.total)} mm (${signed(f.pct)}%)`;
  if (g && same && fin(g.pct) && fin(same.pct)) {   // satellite rain exists only on NASA's record, so the second source here is always NASA's weather model
    const first = Y.fresh > 0 ? ' (the newest weeks are a first estimate)' : '';
    if (Y.agree) return { ...band(g.pct), text: `${have(g, 'GPM satellite rain')}${first}; NASA's weather model agrees (${signed(same.pct)}%).` };
    // More than 20 points apart. One saying wetter while the other says normal or drier is no agreement on the direction either.
    if (word(g.pct) !== word(same.pct)) return { status: 'Unclear', tone: 'Unclear', text: `The satellite and NASA's weather model disagree. Check your own rain gauge. GPM satellite rain: ${figure(g)}. NASA's weather model: ${figure(same)}.` };
    return { ...band((g.pct + same.pct) / 2), text: `${have(g, 'GPM satellite rain')}${first}. Both NASA sources agree on the direction but not the size. The newest GPM months are not yet gauge-corrected.` };
  }
  const one = g && fin(g.pct) ? [g, 'GPM satellite rain'] : fin(Y?.model?.pct) ? [Y.model, `rain from ${model}`] : null;
  return one ? { ...band(one[0].pct), text: `${have(...one)}.` } : { status: 'Unknown', tone: 'Unknown', text: `Too few rain readings so far${Y?.year ? ` in ${Y.year}` : ''} to compare with other years.` };
}

export function soilWords(Y) {
  const s = Y?.soil;
  if (!s || !fin(s.mean)) return { chip: '', text: 'Root-zone wetness has not been read for the last 30 days.' };
  const usual = fin(s.normalMean), chip = !usual ? '' : s.diff < -0.04 - 1e-9 ? 'Drier than usual' : s.diff > 0.04 + 1e-9 ? 'Wetter than usual' : '';
  return { chip, text: `Root-zone wetness, last 30 days: ${num(s.mean * 100)}% of saturation.${usual ? ` Normal for these weeks: ${num(s.normalMean * 100)}%.` : ''}` };
}

export function warmthWords(G) {
  if (!G || !fin(G.total)) return { status: 'Unknown', tone: 'Unknown', text: 'Too few temperature readings this season to count its warmth.' };
  const pct = G.pct, status = pct > 6 ? 'Warmer' : pct < -6 ? 'Cooler' : fin(pct) ? 'Normal' : 'Unknown', span = G.full ? `from ${dateWord(doyOf(G.since))} to ${dateWord(doyOf(G.through))}` : `since ${dateWord(doyOf(G.since))}`;
  const lead = G.full ? '' : status === 'Cooler' ? 'A cool season: crops grow and ripen more slowly. ' : status === 'Warmer' ? 'A warm season: crops are moving fast. ' : '';   // a season that is over is not "moving"
  return { status, tone: pct < -12 ? 'Watch' : fin(pct) ? 'Good' : 'Unknown', text: `${lead}${num(G.total)} growing degree days (warmth above 10 °C) ${span}.` };
}
const doyOf = date => { const m = +date.slice(5, 7) - 1; return sum(MONTH_DAYS.slice(0, m)) + Math.min(+date.slice(8, 10), MONTH_DAYS[m]); };   // the day of a year without a leap day
