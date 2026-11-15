// Crophalo's weather for the spot card: today and the next three days at one place. It reads the same Open-Meteo answer as the report and My farm (js/data.js), cut to today and three days, so a place is asked for ONCE.
// Pure: cutForecast(), parseForecast(), conditionWords(), fieldwork(). getForecast() asks through data.js's kept, shared request (and keeps the cut answer ten minutes in memory).
// Checked by scripts/test_spot.mjs (the cut, a full answer, a missing reading that stays unknown, every word of the fieldwork rule, one request for a place shared by two askers).
// ONE FUNCTION so the build's own weather module can take its place: getForecast(lat, lon) gives { ok: true, ...forecast } or { ok: false, reason }.
import { cleanPlace, forecastUrl as sharedUrl, cachedJSON, KEEP, LIMIT } from './data.js';

const KEPT_MS = 10 * 60e3, WAIT_MS = 12e3;
const WORDS = {   // the WMO weather codes Open-Meteo uses, in a farmer's words
  0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
};
export const conditionWords = code => (Object.hasOwn(WORDS, code) ? WORDS[code] : '');

// The shared answer (30 days back, 16 days ahead, hour by hour) cut to the card's four days: today at the field, by the field's own clock, and the next three. null when today is not in it.
const isoOf = ms => new Date(ms).toISOString().slice(0, 10);
export function cutForecast(raw, now = Date.now()) {
  const offset = raw?.utc_offset_seconds, days = raw?.daily?.time;
  if (!raw || typeof raw !== 'object' || !Number.isFinite(offset) || !Array.isArray(days)) return null;
  const today = isoOf(now + offset * 1000), start = days.findIndex(d => String(d) >= today);
  if (start < 0) return null;
  const daily = {};
  for (const [key, list] of Object.entries(raw.daily)) if (Array.isArray(list)) daily[key] = list.slice(start, start + 4);
  const { hourly, ...rest } = raw;   // the card has no use for the hours
  return { ...rest, daily };
}

// A reading that is a real number, else null: a reading nobody took is unknown, never zero.
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const at = (list, i) => (Array.isArray(list) ? num(list[i]) : null);

// The forecast as the card reads it, or null when the answer is not a forecast at all.
export function parseForecast(raw) {
  if (!raw || typeof raw !== 'object' || !raw.daily || !Array.isArray(raw.daily.time) || !raw.daily.time.length) return null;
  const cur = raw.current && typeof raw.current === 'object' ? raw.current : {}, d = raw.daily;
  const days = d.time.slice(0, 4).map((date, i) => ({ date: String(date), code: at(d.weather_code, i), hi: at(d.temperature_2m_max, i), lo: at(d.temperature_2m_min, i), pop: at(d.precipitation_probability_max, i), mm: at(d.precipitation_sum, i) }));
  const time = typeof cur.time === 'string' ? cur.time : '';
  return {
    now: { temp: num(cur.temperature_2m), feels: num(cur.apparent_temperature), wind: num(cur.wind_speed_10m), code: num(cur.weather_code) },
    days, elevation: num(raw.elevation), offsetS: num(raw.utc_offset_seconds), zone: typeof raw.timezone_abbreviation === 'string' ? raw.timezone_abbreviation : '',
    updated: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(time) ? time.slice(11, 16) : '', today: /^\d{4}-\d{2}-\d{2}/.test(String(d.time[0])) ? String(d.time[0]) : '',
  };
}

// Is today a calm, dry day for fieldwork? Rain is likely at 50% or 2 mm; wind is too much at 25 km/h. null when the readings are missing: the card then says so.
export function fieldwork(day, wind) {
  if (!day || (day.pop == null && day.mm == null) || wind == null) return { ok: null, words: 'Not enough readings to say whether today suits fieldwork.' };
  const why = [];
  if ((day.pop ?? 0) >= 50 || (day.mm ?? 0) >= 2) why.push('rain is likely');
  if (wind >= 25) why.push('too windy');
  return why.length ? { ok: false, words: `Not a calm, dry day: ${why.join(' and ')}.` } : { ok: true, words: 'Calm, dry day: fieldwork may be possible.' };
}

// The weekday of a date at the field ("Thu"), read from the date itself so the device's own zone cannot move it.
export const dayName = iso => { const [y, m, d] = iso.split('-').map(Number); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
export const degrees = v => (v == null ? 'not available' : `${Math.round(v)}°`);

const memory = new Map();   // the shared address → { at, forecast }; in memory only, gone when the tab closes
export async function getForecast(lat, lon, { ask = globalThis.fetch, now = Date.now, caches } = {}) {
  const place = cleanPlace(lat, lon);
  if (place.reason) return { ok: false, reason: place.reason };
  const key = sharedUrl(place), had = memory.get(key);
  if (had && now() - had.at < KEPT_MS) return { ok: true, ...had.forecast };
  try {
    const got = await cachedJSON(key, { keep: KEEP.forecast, limit: LIMIT.forecast ?? WAIT_MS }, { fetch: ask, now, ...(caches ? { caches } : {}) });   // the report and My farm ask for this very address: one request
    const forecast = parseForecast(cutForecast(got.json, now()));
    if (!forecast) return { ok: false, reason: 'The weather service sent an answer Crophalo could not read.' };
    memory.set(key, { at: now(), forecast });
    return { ok: true, ...forecast };
  } catch (e) { return { ok: false, reason: e instanceof SyntaxError ? 'The weather service sent an answer Crophalo could not read.' : e?.status ? 'The weather service answered with an error.' : 'The weather service did not answer.' }; }
}
export const forgetForecasts = () => memory.clear();
