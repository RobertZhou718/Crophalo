// Crophalo's weather reading: every live weather request the browser makes (NASA POWER, the Open-Meteo back-up record, the second
// record of the coldest night, the forecast), each with its keep-time, its fall-back and a plain reason when it cannot be read.
// Pure (no network, no storage, no page): the addresses, the builders, the year rules, the height correction, the cold nights and
// every text. Not pure: cachedJSON and the fetch* functions, which take fetch, caches and the clock from `env`. Checked by scripts/test_weather.mjs.

// THE DAILY SERIES `S` (what buildSeries and buildBackupSeries return and what js/climate.js reads), field by field:
//   lat, lon            degrees as asked, 4 decimals; lon brought into −180…180 (the 180 line is written −180)
//   cellElev, elev      metres, one number under both names: the weather square's own average height; NaN on the back-up record
//   source              'power' | 'era5'            which record the temperatures come from
//   rainSource          'imerg' | 'merra2' | 'era5' the ONE rain record this place uses (never a blend of two)
//   through             'YYYY-MM-DD'                the last day that holds a real high and a real low
//   days                ['YYYYMMDD', …]             every UTC day from the first to the last day in the answer, none skipped
//   year, month, doy    one number per day          month 1–12, doy 1–366
//   T2M_MAX, T2M_MIN    °C per day                  NaN where nobody read it (never 0, never the service's fill value)
//   PRECTOTCORR         mm per day                  NASA's weather-model rain (MERRA-2); on the back-up record it holds ERA5's rain
//   IMERG_PRECTOT       mm per day                  GPM IMERG satellite rain; all NaN on the back-up record
//   GWETROOT            0–1 per day                 root-zone soil wetness; all NaN on the back-up record
//   EVLAND              mm per day                  water the land loses to the air; all NaN on the back-up record
//   rain                the same array as IMERG_PRECTOT or PRECTOTCORR, whichever rainSource names
//   lastDate            { T2M_MAX: 'YYYYMMDD' | null, … }  the last day each measure holds a real reading
//   altWeather          'Open-Meteo (ERA5)' on the back-up record, else null
//   dz, dT, fieldElev   set by fitHeight: metres and °C the temperatures were moved by (0 and 0 before), and the field's height
// EVERY fetch* ANSWER is { ok: true, source, cached, fetched (ISO time the service was asked), … } or { ok: false, reason }.
import { own } from './words.js';

// ---- the years and the days
export const Y0 = 2001;                                                                  // the first year read: satellite rain and plant greenness both reach back to it
export const lastFullYear = (now = Date.now()) => new Date(now).getUTCFullYear() - 1;   // the running year is shown apart, as "so far"
export const Y1 = lastFullYear();
export const FULL_YEAR_DAYS = 330;                                                       // a year counts only with this many days read
const DAY = 864e5, HOUR = 36e5, real = Number.isFinite;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoDay = ms => new Date(ms).toISOString().slice(0, 10), ymd = ms => isoDay(ms).replace(/-/g, '');   // UTC days, like the weather itself
const dash = day8 => `${day8.slice(0, 4)}-${day8.slice(4, 6)}-${day8.slice(6)}`;
const dayMs = day8 => Date.UTC(+day8.slice(0, 4), +day8.slice(4, 6) - 1, +day8.slice(6));
const count = n => n.toLocaleString('en-US'), round = (v, places) => Math.round(v * 10 ** places) / 10 ** places + 0;   // + 0: "−0" would make a second address for one place
const degrees = v => `${String(Math.round(v) + 0).replace('-', '−')} °C`;
export function dayText(day) {   // '2026-11-20' → 'Nov 20, 2026'
  const [y, m, d] = String(day ?? '').split('-').map(Number);
  return real(y) && m >= 1 && m <= 12 && real(d) ? `${MONTHS[m - 1]} ${d}, ${y}` : 'an unknown day';
}

// ---- the place and the addresses
export function cleanPlace(lat, lon) {   // { lat, lon } to ask for, or { reason }
  if (!real(lat) || !real(lon)) return { reason: 'This place has no position Crophalo can read.' };   // a blank or a text is not a number: a missing position is never 0, 0
  if (Math.abs(lat) > 90) return { reason: 'This place is off the map: north and south end at 90 degrees.' };
  return { lat: round(lat, 4), lon: round(((round(lon, 4) + 180) % 360 + 360) % 360 - 180, 4) };   // 180 and −180 are one line on the Earth, so one address and one weather square
}
const POWER_PARAMS = 'T2M_MAX,T2M_MIN,PRECTOTCORR,IMERG_PRECTOT,GWETROOT,EVLAND';
export const MEASURES = POWER_PARAMS.split(',');
const FC_CURRENT = 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m';
const FC_DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,weather_code,sunrise,sunset,et0_fao_evapotranspiration';
const FC_HOURLY = 'soil_temperature_6cm,soil_moisture_3_to_9cm,cloud_cover,direct_radiation,diffuse_radiation,temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,wind_speed_10m';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive', at3 = p => `latitude=${round(p.lat, 3).toFixed(3)}&longitude=${round(p.lon, 3).toFixed(3)}`;
// NASA POWER: whole UTC days from 2001-01-01 to yesterday. The address ends yesterday, so each day asks afresh.
export const powerUrl = (p, now = Date.now()) => `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${POWER_PARAMS}&community=AG`
  + `&longitude=${p.lon.toFixed(4)}&latitude=${p.lat.toFixed(4)}&start=${Y0}0101&end=${ymd(now - DAY)}&format=JSON&time-standard=UTC`;
// The back-up record. models=era5 is asked by name: with no model the service joins ERA5 to a finer model from 2017 on, a seam that would bend every trend.
export const era5Url = (p, now = Date.now()) => `${ARCHIVE}?${at3(p)}&start_date=${Y0}-01-01&end_date=${isoDay(now - 6 * DAY)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&models=era5&timezone=UTC`;
export const era5LandUrl = (p, now = Date.now()) => `${ARCHIVE}?${at3(p)}&start_date=${Y0}-01-01&end_date=${lastFullYear(now)}-12-31&daily=temperature_2m_min&models=era5_land&timezone=UTC`;
export const forecastUrl = p => `https://api.open-meteo.com/v1/forecast?${at3(p)}&current=${FC_CURRENT}&daily=${FC_DAILY}&hourly=${FC_HOURLY}&timezone=auto&past_days=30&forecast_days=16`;

// ---- what counts as a reading
const heat = v => v > -90 && v < 70, wet = v => v >= 0 && v < 2000;   // °C and mm a day that can happen on Earth
export const REAL = { T2M_MAX: heat, T2M_MIN: heat, PRECTOTCORR: wet, IMERG_PRECTOT: wet, GWETROOT: v => v >= 0 && v <= 1, EVLAND: v => v > -50 && v < 50 };   // one test per measure, shared with js/climate.js
const POWER_UNITS = { T2M_MAX: 'C', T2M_MIN: 'C', PRECTOTCORR: 'mm/day', IMERG_PRECTOT: 'mm/day', GWETROOT: '1', EVLAND: 'mm/day' };
const reading = (v, ok, fill) => (typeof v === 'number' && v !== fill && ok(v) ? v : NaN);   // the fill value, null, a text or an impossible figure is unknown, never 0
const lastReal = (days, list) => { for (let i = list.length - 1; i >= 0; i--) if (real(list[i])) return days[i]; return null; };
export const IMERG_SHARE = 0.9;   // the satellite rain is the place's rain record when MORE than this share of its days were read
const MAX_DAYS = 40 * 366;
export const RAIN_WHY = 'Satellite rain (GPM IMERG) comes first. The rain of NASA’s weather model (MERRA-2) reads low after about 2015 in several regions, which would look like the land drying out when it is not, so it is used only where the satellite record has too few days.';

// One series from first to last day, every day present. pick(measure, 'YYYYMMDD') gives the raw value or undefined.
function makeSeries(place, source, cellElev, first, last, pick, fill) {
  if (!(dayMs(last) >= dayMs(first)) || (dayMs(last) - dayMs(first)) / DAY > MAX_DAYS) return null;
  const S = { lat: place.lat, lon: place.lon, cellElev, elev: cellElev, source, days: [], year: [], month: [], doy: [], lastDate: {}, altWeather: null, dz: 0, dT: 0, fieldElev: NaN };
  for (let t = dayMs(first), end = dayMs(last); t <= end; t += DAY) {   // by the calendar, not by what was sent: a day left out of an answer is a gap, not a shorter year
    const d = new Date(t), y = d.getUTCFullYear();
    S.days.push(ymd(t)); S.year.push(y); S.month.push(d.getUTCMonth() + 1); S.doy.push(Math.round((t - Date.UTC(y, 0, 1)) / DAY) + 1);
  }
  for (const m of MEASURES) { S[m] = S.days.map(day => reading(pick(m, day), REAL[m], fill)); S.lastDate[m] = lastReal(S.days, S[m]); }
  const both = S.days.map((_, i) => (real(S.T2M_MAX[i]) && real(S.T2M_MIN[i]) ? 1 : NaN)), newest = lastReal(S.days, both);
  S.through = newest && dash(newest);
  const seen = S.IMERG_PRECTOT.filter(real).length / S.days.length;
  S.rainSource = source === 'era5' ? 'era5' : seen > IMERG_SHARE ? 'imerg' : 'merra2';   // one record for the whole place: patching years of one into the other would bend the trend
  S.rain = S.rainSource === 'imerg' ? S.IMERG_PRECTOT : S.PRECTOTCORR;
  return S;
}

// NASA POWER's answer → S, or null when it is not a POWER answer at all.
export function buildSeries(answer, place = {}) {
  const sent = answer?.properties?.parameter, spot = answer?.geometry?.coordinates;
  if (!sent || typeof sent !== 'object') return null;
  const rows = {}; let first = '', last = '';
  for (const m of MEASURES) {
    rows[m] = own(sent, m) && sent[m] && typeof sent[m] === 'object' ? sent[m] : {};
    for (const day of Object.keys(rows[m])) if (/^\d{8}$/.test(day) && day >= `${Y0}0101`) { if (!first || day < first) first = day; if (day > last) last = day; }
  }
  const height = Array.isArray(spot) ? reading(spot[2], v => v > -500 && v < 9000) : NaN;
  return first ? makeSeries(place, 'power', height, first, last, (m, day) => (own(rows[m], day) ? rows[m][day] : undefined), answer.header?.fill_value ?? -999) : null;
}
// Is this really the answer to what was asked: the place, whole UTC days, the units? '' when it is.
export function powerProblem(answer, place) {
  const spot = answer?.geometry?.coordinates, units = answer?.parameters;
  if (!answer?.properties?.parameter) return 'NASA POWER sent an answer Crophalo could not read';
  if (!Array.isArray(spot) || !(Math.abs(spot[1] - place.lat) < 0.01) || !(Math.abs(((spot[0] - place.lon + 540) % 360) - 180) < 0.01)) return 'NASA POWER answered for a different place';
  if (answer.header?.time_standard !== 'UTC') return 'NASA POWER did not answer in whole UTC days';
  if (units && MEASURES.some(m => own(units, m) && units[m]?.units !== POWER_UNITS[m])) return 'NASA POWER changed the units of its answer';
  return '';
}
// The Open-Meteo ERA5 answer → S. It has no satellite rain, soil wetness, evaporation or square height, and says so by NaN.
// The service sums the rain of a day that is still being filled (its newest day comes with a rain figure but no high and no low):
// that is part of a day's rain, so a day without both temperatures has no rain reading either.
export function buildBackupSeries(answer, place = {}) {
  const d = answer?.daily, time = d?.time;
  if (!Array.isArray(time) || !time.length || !time.every(t => /^\d{4}-\d\d-\d\d$/.test(t))) return null;
  const at = Object.fromEntries(time.map((t, i) => [t.replace(/-/g, ''), i])), from = { T2M_MAX: d.temperature_2m_max, T2M_MIN: d.temperature_2m_min, PRECTOTCORR: d.precipitation_sum };
  const sent = (m, i) => (own(from, m) && Array.isArray(from[m]) ? from[m][i] : undefined), wholeDay = i => typeof sent('T2M_MAX', i) === 'number' && typeof sent('T2M_MIN', i) === 'number';
  const days = Object.keys(at).sort(), S = makeSeries(place, 'era5', NaN, days[0], days[days.length - 1], (m, day) => (own(at, day) && (m !== 'PRECTOTCORR' || wholeDay(at[day])) ? sent(m, at[day]) : undefined));
  return S && Object.assign(S, { altWeather: 'Open-Meteo (ERA5)' });
}
export function backupProblem(answer, place, who = 'Open-Meteo') {
  const units = answer?.daily_units, far = (a, b) => !(Math.abs(a - b) < 0.3);   // the service answers for its nearest square, up to an eighth of a degree away
  if (!Array.isArray(answer?.daily?.time)) return `${who} sent an answer Crophalo could not read`;
  if (far(answer.latitude, place.lat) || (Math.abs(place.lat) < 89 && far(((answer.longitude - place.lon + 540) % 360) - 180, 0))) return `${who} answered for a different place`;
  if (answer.utc_offset_seconds !== 0) return `${who} did not answer in whole UTC days`;
  if (units && Object.entries(units).some(([name, unit]) => (name.startsWith('temperature') && unit !== '°C') || (name.startsWith('precipitation') && unit !== 'mm'))) return `${who} changed the units of its answer`;
  return '';
}

// ---- the year rules
export const MONTH_READ = 0.8;   // one month of one year is read well enough from this share of its days
export const enough = (read, share, of) => read + 1e-9 >= share * of;   // 24 of 30 days is 80%: a rounding crumb in 0.8 × 30 must not say otherwise
// One month's total from the days read: its unread days are taken at the month's own daily mean, never at 0; a badly read month has no total at all.
export const monthTotal = (sum, read, days) => (read > 0 && enough(read, MONTH_READ, days) ? sum / read * days : NaN);
// One row per year: days on the calendar, days with both temperatures, days with rain in the place's own rain record, and the year's rain.
export function yearTable(S) {
  const rows = new Map();
  S.days.forEach((_, i) => {
    const y = S.year[i], row = rows.get(y) || { year: y, days: 0, temp: 0, rain: 0, imerg: 0, model: 0, sums: Array(12).fill(0), months: Array(12).fill(0) };
    row.days++; row.temp += real(S.T2M_MAX[i]) && real(S.T2M_MIN[i]); row.imerg += real(S.IMERG_PRECTOT[i]); row.model += real(S.PRECTOTCORR[i]);
    if (real(S.rain[i])) { row.rain++; row.sums[S.month[i] - 1] += S.rain[i]; row.months[S.month[i] - 1]++; }
    rows.set(y, row);
  });
  return [...rows.values()].map(({ sums, months, ...row }) => {
    const complete = row.temp >= FULL_YEAR_DAYS && row.rain >= FULL_YEAR_DAYS;
    const total = months.reduce((t, n, m) => t + monthTotal(sums[m], n, new Date(Date.UTC(row.year, m + 1, 0)).getUTCDate()), 0);   // unknown as soon as one month was badly read: no honest total
    return { ...row, complete, rainTotal: complete ? round(total, 2) : NaN };
  });
}
export const completeYears = (S, now = Date.now()) => yearTable(S).filter(y => y.complete && y.year <= lastFullYear(now)).map(y => y.year);
export const lastCompleteYear = (S, now = Date.now()) => completeYears(S, now).pop() ?? null;   // never the running year, however many of its days are in
export function seriesProblem(S, who) {   // '' when the record can carry a report
  if (!S || !S.through) return `${who} has no temperatures for this place`;
  if (S.days.filter((_, i) => real(S.T2M_MAX[i]) && real(S.T2M_MIN[i])).length / S.days.length < 0.9) return `${who} has no temperatures for this place`;
  if (S.days[0] !== `${Y0}0101` || yearTable(S).filter(y => y.temp >= FULL_YEAR_DAYS).length < 5) return `${who} sent too little history for this place`;
  return '';
}
export function rainDays(S) {   // how many days each rain record really read
  const n = { days: S.days.length, imerg: 0, model: 0, modelOnly: 0, none: 0, used: S.rainSource };
  S.days.forEach((_, i) => { const a = real(S.IMERG_PRECTOT[i]), b = real(S.PRECTOTCORR[i]); n.imerg += a; n.model += b; n.modelOnly += !a && b; n.none += !a && !b; });
  return n;
}
export function rainNote(S) {   // the line under a rain figure's "i": which record, on how many days of how many; RAIN_WHY gives the reason for the order
  const n = rainDays(S), of = `of ${count(n.days)} days`;
  if (S.rainSource === 'era5') return `Rain is from the back-up record, Open-Meteo (ERA5), read on ${count(n.model)} ${of}. Satellite rain is not available.`;
  if (S.rainSource === 'imerg') return `Rain is satellite rain (GPM IMERG), read on ${count(n.imerg)} ${of}, through ${dayText(S.lastDate.IMERG_PRECTOT && dash(S.lastDate.IMERG_PRECTOT))}.`;
  return `Satellite rain (GPM IMERG) was read on only ${count(n.imerg)} ${of} here, so rain is from NASA’s weather model (MERRA-2), read on ${count(n.model)}.`;
}

// ---- the field's own height
export const LAPSE = 0.0065, HEIGHT_FROM = 100, HEIGHT_CAP = 1500;   // °C per metre; metres
const LOWEST_FIELD = -20;   // metres: a field height below this is the height map reading the sea floor
export function heightShift(fieldElev, cellElev) {   // metres to move the temperatures by; 0 when there is nothing sure to correct
  if (!real(fieldElev) || !real(cellElev) || fieldElev < LOWEST_FIELD) return 0;
  const dz = Math.max(-HEIGHT_CAP, Math.min(HEIGHT_CAP, fieldElev - cellElev));    // capped in case the height map misreads a cliff
  return Math.abs(dz) < HEIGHT_FROM ? 0 : dz;
}
export function atHeight(S, dz) {   // both temperatures moved, rain and the rest left as they are; asking twice moves once
  const more = -LAPSE * (dz - (S.dz || 0)), move = list => list.map(v => v + more);
  return more ? { ...S, T2M_MAX: move(S.T2M_MAX), T2M_MIN: move(S.T2M_MIN), dz, dT: -LAPSE * dz + 0 } : S;
}
export const fitHeight = (S, fieldElev) => atHeight({ ...S, fieldElev }, heightShift(fieldElev, S.cellElev));
export function heightNote(S) {
  if (!S.dT) return '';
  return `Temperatures are set ${Math.abs(S.dT).toFixed(1)} °C ${S.dT < 0 ? 'cooler' : 'warmer'} for your field’s height: NASA’s grid averages ${count(Math.round(S.cellElev))} m, your field is ${count(Math.round(S.fieldElev))} m.`;
}

// ---- the coldest night, from two records
export const COLD_MIN_YEARS = 8;   // the second record counts only with this many full years
const COLD_APART = 2;
// From each year's lowest night: night is the middle year, night10 a cold one-in-ten year. The one-in-ten night is a year that happened,
// the one a tenth of the way up the sorted list (the third coldest of 25), not a figure worked out between two years.
export function coldOf(yearLows) {
  const s = yearLows.filter(real).sort((a, b) => a - b), h = s.length >> 1;
  return { night: !s.length ? NaN : s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2, night10: s.length ? s[Math.floor(0.1 * s.length)] : NaN, years: s.length };
}
// The lowest night of each year with 330 or more nights read, through coldOf.
export function coldNights(days, lows, minYears = 1) {
  const years = new Map();
  days.forEach((day, i) => { if (!real(lows[i])) return; const y = day.slice(0, 4), row = years.get(y) || { nights: 0, low: Infinity }; row.nights++; row.low = Math.min(row.low, lows[i]); years.set(y, row); });
  const each = [...years.values()].filter(row => row.nights >= FULL_YEAR_DAYS).map(row => row.low);
  return each.length && each.length >= minYears ? coldOf(each) : null;
}
export function coldFromDaily(answer) {   // the ERA5-Land answer → { night, night10, years, through } or null
  const time = answer?.daily?.time, lows = answer?.daily?.temperature_2m_min;
  if (!Array.isArray(time) || !Array.isArray(lows)) return null;
  const days = time.map(t => String(t).replace(/-/g, '')), read = days.map((_, i) => reading(lows[i], heat)), cold = coldNights(days, read, COLD_MIN_YEARS), newest = lastReal(days, read);
  return cold && { ...cold, through: dash(newest) };
}
// NASA's own figures and the second record's, both { night, night10 } in °C. The middle of the two is used; the colder is kept for the cautious checks.
// A second record that did not answer, or holds fewer than eight years, is left out: the figures then rest on NASA alone and say so (records: 1).
export function mergeCold(nasa, second) {
  if (!nasa || !real(nasa.night)) return null;
  const two = !!second && real(second.night) && real(second.night10) && !(second.years < COLD_MIN_YEARS), mid = (a, b) => (a + b) / 2;
  const out = { coldNasa: nasa.night, coldNasa10: nasa.night10, coldSecond: two ? second.night : NaN, coldSecond10: two ? second.night10 : NaN, records: two ? 2 : 1,
    coldNight: two ? mid(nasa.night, second.night) : nasa.night, coldNight10: two ? mid(nasa.night10, second.night10) : nasa.night10,
    coldLow: two ? Math.min(nasa.night, second.night) : nasa.night, coldLow10: two ? Math.min(nasa.night10, second.night10) : nasa.night10 };
  out.differ = two && Math.abs(nasa.night - second.night) >= COLD_APART;
  out.note = out.differ ? `In a normal winter NASA’s weather says about ${degrees(nasa.night)} and a second record (ERA5-Land) about ${degrees(second.night)}. They disagree, so the figure above is the middle of the two and the colder one is kept in mind.` : '';
  return out;
}

// ---- the forecast (one answer, cut four ways)
const numberAt = (list, i) => (Array.isArray(list) && typeof list[i] === 'number' && real(list[i]) ? list[i] : NaN);   // unknown is NaN, not null: null + 0 is 0 and null < 20 is true
const textAt = (list, i) => (Array.isArray(list) && typeof list[i] === 'string' ? list[i] : '');
const HOURS_FOR_A_MEAN = 22;   // of 24: one warm hour among missing ones is not a day's mean
export function buildForecast(answer, now = Date.now()) {
  const d = answer?.daily, h = answer?.hourly, offset = answer?.utc_offset_seconds;
  if (!d || !Array.isArray(d.time) || !real(offset)) return null;
  const today = isoDay(now + offset * 1000), toUtc = local => (local ? Date.parse(local + ':00Z') - offset * 1000 : NaN);   // the service's times are the field's own clock: read them with the service's own offset
  const all = d.time.map((date, i) => ({ date, tmax: numberAt(d.temperature_2m_max, i), tmin: numberAt(d.temperature_2m_min, i), rain: numberAt(d.precipitation_sum, i),
    rainChance: numberAt(d.precipitation_probability_max, i), wind: numberAt(d.wind_speed_10m_max, i), windDir: numberAt(d.wind_direction_10m_dominant, i), code: numberAt(d.weather_code, i),
    sunrise: textAt(d.sunrise, i).slice(11), sunset: textAt(d.sunset, i).slice(11), sunriseAt: toUtc(textAt(d.sunrise, i)), sunsetAt: toUtc(textAt(d.sunset, i)), et0: numberAt(d.et0_fao_evapotranspiration, i) }));
  const weekEnd = isoDay(Date.parse(today) + 6 * DAY), week = all.filter(day => day.date >= today && day.date <= weekEnd);
  const byDay = name => { const sums = new Map(); (Array.isArray(h?.time) ? h.time : []).forEach((t, i) => { const v = numberAt(h[name], i), row = sums.get(t.slice(0, 10)) || { sum: 0, hours: 0 }; if (real(v)) { row.sum += v; row.hours++; } sums.set(t.slice(0, 10), row); });
    return [...sums].map(([date, row]) => ({ date, hours: row.hours, value: row.hours >= HOURS_FOR_A_MEAN ? row.sum / row.hours : NaN })); };
  const whole = week.length === 7 && week.every(day => real(day.et0) && real(day.rain)), total = key => (whole ? round(week.reduce((sum, day) => sum + day[key], 0), 2) : NaN);   // a sum over unread days would be a made-up low figure
  const c = answer.current || {}, one = key => (typeof c[key] === 'number' && real(c[key]) ? c[key] : NaN);
  return { elevation: reading(answer.elevation, v => v > -500 && v < 9000), timezone: String(answer.timezone ?? ''), utcOffset: offset, today,
    current: { time: String(c.time ?? ''), temp: one('temperature_2m'), feels: one('apparent_temperature'), code: one('weather_code'), wind: one('wind_speed_10m'), windDir: one('wind_direction_10m'), humidity: one('relative_humidity_2m') },
    days: week.filter(day => real(day.tmax) && real(day.tmin) && real(day.rain)),   // a day without its temperature or rain is left out; a day without only its wind stays, each under its own date
    ahead16: all.filter(day => day.date >= today), past: all.filter(day => day.date < today),
    soilT: byDay('soil_temperature_6cm'), soilM: byDay('soil_moisture_3_to_9cm'), water: { et0: total('et0'), rain: total('rain'), days: week.filter(day => real(day.et0) && real(day.rain)).length } };
}
export function buildHourly(answer, now = Date.now()) {   // the last 3 days and the next 7, hour by hour
  const h = answer?.hourly, offset = answer?.utc_offset_seconds;
  if (!h || !Array.isArray(h.time) || !real(offset)) return null;
  return h.time.map((time, i) => ({ time, at: Date.parse(time + ':00Z') - offset * 1000, t: numberAt(h.temperature_2m, i), rh: numberAt(h.relative_humidity_2m, i), dp: numberAt(h.dew_point_2m, i), rain: numberAt(h.precipitation, i), wind: numberAt(h.wind_speed_10m, i) }))
    .filter(hour => hour.at > now - 72 * HOUR && hour.at <= now + 168 * HOUR);
}

// ---- the device's cache and the network
export const DATA_CACHE = 'crophalo-data-v1', CACHE_HOLDS = 30;
export const KEEP = { power: 12 * HOUR, era5: 12 * HOUR, era5land: 24 * HOUR, forecast: HOUR };   // how long an answer is used again before the service is asked anew
export const LIMIT = { power: 30e3, era5: 45e3, era5land: 45e3, forecast: 12e3 };                  // how long a service may take
const clock = env => (env.now ? env.now() : Date.now());
const inFlight = new Map();   // one request per address at a time: eight callers share one answer
async function openCache(env) { try { const home = 'caches' in env ? env.caches : globalThis.caches; return home ? await home.open(DATA_CACHE) : null; } catch { return null; } }   // a browser without the cache, or one that refuses it, still gets its weather
async function readKept(env, url, keep) {
  try {
    const box = await openCache(env), hit = box && await box.match(url), saved = Number(hit?.headers.get('x-saved')), age = clock(env) - saved;
    return hit && real(saved) && age >= 0 && age < keep ? { json: await hit.json(), cached: true, fetched: new Date(saved).toISOString() } : null;   // undated, dated ahead of the clock or too old: ask again
  } catch { return null; }
}
async function keepAnswer(env, url, text) {
  try {
    const box = await openCache(env); if (!box) return;
    await box.put(url, new Response(text, { headers: { 'content-type': 'application/json', 'x-saved': String(clock(env)) } }));
    const all = await Promise.all((await box.keys()).map(async key => ({ key, saved: Number((await box.match(key))?.headers.get('x-saved')) || 0 })));
    for (const { key } of all.sort((a, b) => b.saved - a.saved).slice(CACHE_HOLDS)) await box.delete(key);   // the newest answers stay
  } catch { /* a full or broken cache costs only the saving */ }
}
// One answer, from the cache while it is young enough, else from the service: { json, cached, fetched }. Throws when the service fails
// or when check(json) names a fault: a failure or a faulty answer is never kept, and an old kept answer is never handed out in its place.
export function cachedJSON(url, { keep, limit, check = () => '' }, env = {}) {
  if (inFlight.has(url)) return inFlight.get(url);
  const run = (async () => {
    const kept = await readKept(env, url, keep);
    if (kept && !check(kept.json)) return kept;
    const stop = new AbortController(), timer = setTimeout(() => stop.abort(), limit);
    try {
      const res = await (env.fetch || globalThis.fetch)(url, { signal: stop.signal });
      if (!res.ok) throw Object.assign(new Error(`status ${res.status}`), { status: res.status, retryAfter: res.headers?.get?.('retry-after') ?? null });
      const text = await res.text(), json = JSON.parse(text), fault = check(json);
      if (fault) throw Object.assign(new Error(fault), { plain: true });
      await keepAnswer(env, url, text);
      return { json, cached: false, fetched: new Date(clock(env)).toISOString() };
    } finally { clearTimeout(timer); }
  })().finally(() => inFlight.delete(url));
  inFlight.set(url, run);
  return run;
}
function failed(e, who) {   // a plain reason, with what a caller needs to wait politely
  const reason = e?.plain ? e.message : e?.name === 'AbortError' || e?.name === 'TimeoutError' ? `${who} took too long` : e?.status === 429 ? `${who} is busy and asked us to wait`
    : e instanceof SyntaxError ? `${who} sent an answer Crophalo could not read` : `${who} did not answer`;
  return { ok: false, reason, status: e?.status ?? null, retryAfter: e?.retryAfter ?? null };
}
export function waitSeconds(retryAfter, now = Date.now()) {   // what a "too many requests" answer asks for: its own figure, or a minute when it names none
  const said = String(retryAfter ?? '').trim(), secs = /^\d+$/.test(said) ? +said : (Date.parse(said) - now) / 1000;
  return real(secs) && secs >= 0 ? Math.max(1, Math.ceil(secs)) : 60;
}

// ---- the weather record
export const NO_WEATHER = 'No weather source answered for this spot. Check your connection and try again.';
export const BACKUP_CARD = 'Weather is from the back-up record, Open-Meteo (ERA5), because NASA POWER did not answer.';
export const backupNote = S => `NASA has no weather for this spot right now. Using Open-Meteo (ERA5) instead, through ${dayText(S.through)}. Rain from satellites and root-zone wetness are not available.`;
const RETRY_WAIT = 4, LONGEST_WAIT = 120;   // seconds: the free back-up service sometimes says busy; a longer wait than two minutes is not made, and not cut short either
function agoText(ms) { const mins = Math.max(1, Math.round(ms / 6e4)), hours = Math.round(mins / 60); return mins < 60 ? `${mins} minute${mins === 1 ? '' : 's'}` : `${hours} hour${hours === 1 ? '' : 's'}`; }
// The report's header line. A kept answer says when it was read: it is never called live.
export const weatherLine = (got, now = Date.now()) => `${got.cached ? `read ${agoText(now - Date.parse(got.fetched))} ago` : 'live'} · weather through ${dayText(got.through)}`;

export async function fetchPower(lat, lon, env = {}) {
  const place = cleanPlace(lat, lon);
  if (place.reason) return { ok: false, reason: place.reason, final: true };
  const url = powerUrl(place, clock(env)), check = json => powerProblem(json, place) || seriesProblem(buildSeries(json, place), 'NASA POWER');
  try { const got = await cachedJSON(url, { keep: KEEP.power, limit: LIMIT.power, check }, env), S = buildSeries(got.json, place); return { ok: true, source: 'power', S, through: S.through, cached: got.cached, fetched: got.fetched, url }; }
  catch (e) { return failed(e, 'NASA POWER'); }
}
export async function fetchOpenMeteoHistory(lat, lon, env = {}) {
  const place = cleanPlace(lat, lon);
  if (place.reason) return { ok: false, reason: place.reason, final: true };
  const url = era5Url(place, clock(env)), check = json => backupProblem(json, place) || seriesProblem(buildBackupSeries(json, place), 'Open-Meteo');
  try { const got = await cachedJSON(url, { keep: KEEP.era5, limit: LIMIT.era5, check }, env), S = buildBackupSeries(got.json, place); return { ok: true, source: 'era5', S, through: S.through, cached: got.cached, fetched: got.fetched, url }; }
  catch (e) { return failed(e, 'Open-Meteo'); }
}
export async function fetchEra5Cold(lat, lon, env = {}) {   // the second record of the coldest night; when it fails the figure rests on NASA alone, and says so
  const place = cleanPlace(lat, lon), who = 'The second record of the coldest night (ERA5-Land)';
  if (place.reason) return { ok: false, reason: place.reason, final: true };
  const url = era5LandUrl(place, clock(env)), check = json => backupProblem(json, place, who) || (coldFromDaily(json) ? '' : `${who} has too few years for this place`);
  try { const got = await cachedJSON(url, { keep: KEEP.era5land, limit: LIMIT.era5land, check }, env); return { ok: true, source: 'era5land', ...coldFromDaily(got.json), cached: got.cached, fetched: got.fetched, url }; }
  catch (e) { return failed(e, who); }
}
// The whole chain: NASA POWER, else the back-up record (asked twice at most, waiting as the service asks), else a plain reason. Never a saved copy, never a guess.
// env.onWait(seconds, text) is told when the chain waits, so the screen can say so.
export async function fetchWeather(lat, lon, env = {}) {
  const nasa = await fetchPower(lat, lon, env);
  if (nasa.ok) return { ...nasa, backup: false, note: '', sources: ['power', nasa.S.rainSource === 'imerg' ? 'gpm' : 'merra2'], cold: await fetchEra5Cold(lat, lon, env) };
  if (nasa.final) return nasa;
  let alt = await fetchOpenMeteoHistory(lat, lon, env);
  const secs = alt.status === 429 ? waitSeconds(alt.retryAfter, clock(env)) : RETRY_WAIT;
  if (!alt.ok && secs <= LONGEST_WAIT) {
    env.onWait?.(secs, `Waiting ${secs} seconds for the weather service’s limit.`);
    await (env.wait ? env.wait(secs * 1000) : new Promise(done => setTimeout(done, secs * 1000)));
    alt = await fetchOpenMeteoHistory(lat, lon, env);
  }
  if (!alt.ok) return { ok: false, reason: NO_WEATHER, tried: [nasa.reason, alt.reason], retryIn: alt.status === 429 ? secs : 0 };
  return { ...alt, backup: true, why: nasa.reason, note: backupNote(alt.S), card: BACKUP_CARD, sources: ['era5'], cold: null };   // no second cold record on the back-up: it would be the same family twice
}

// ---- the forecast, the hours, the soil and the water loss: four readings of one answer, kept one hour
const FORECAST_WORDS = { week: 'The forecast service', hourly: 'The hourly weather service', soil: 'The soil forecast', water: 'The water-loss forecast' };
async function forecastPart(lat, lon, env, part, build) {
  const place = cleanPlace(lat, lon), who = own(FORECAST_WORDS, part) ? FORECAST_WORDS[part] : FORECAST_WORDS.week;
  if (place.reason) return { ok: false, reason: place.reason, final: true };
  const check = json => (buildForecast(json, clock(env)) ? '' : `${who} sent an answer Crophalo could not read`);
  try { const got = await cachedJSON(forecastUrl(place), { keep: KEEP.forecast, limit: LIMIT.forecast, check }, env); return { ok: true, source: 'forecast', cached: got.cached, fetched: got.fetched, ...build(got.json, clock(env)) }; }
  catch (e) { return failed(e, who); }
}
export const fetchForecast = (lat, lon, env = {}) => forecastPart(lat, lon, env, 'week', buildForecast);
export const fetchHourlyWeather = (lat, lon, env = {}) => forecastPart(lat, lon, env, 'hourly', (json, now) => ({ utcOffset: json.utc_offset_seconds, hours: buildHourly(json, now) || [] }));
export const fetchSoil = (lat, lon, env = {}) => forecastPart(lat, lon, env, 'soil', (json, now) => { const f = buildForecast(json, now); return { today: f.today, soilT: f.soilT, soilM: f.soilM }; });
export const fetchWaterLoss = (lat, lon, env = {}) => forecastPart(lat, lon, env, 'water', (json, now) => { const f = buildForecast(json, now); return { today: f.today, ...f.water }; });
