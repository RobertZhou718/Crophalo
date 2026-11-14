// Crophalo's sun: where it stands, when it rises, noon and sets, worked out on the device from the NOAA solar equations (after Meeus).
// Pure: no page, no storage, no network, so it works offline. Moments are UTC milliseconds, angles are degrees, the azimuth runs clockwise from north.
// The height used for every shadow, light and "X° up" is the apparent one (the geometric height plus the bending of the air).
// Checked by scripts/test_sun.mjs against fresh answers of the US Naval Observatory.

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const MS_DAY = 86400000, MS_MIN = 60000;
const norm360 = x => ((x % 360) + 360) % 360;
const norm180 = x => norm360(x + 180) - 180;          // −180 up to 180, so an evening west of Greenwich is never read as a morning
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export const ZENITH_RISE = 90.833;     // the sun's upper edge on the horizon, with standard air
export const ZENITH_CIVIL = 96;        // civil twilight

export const julianDay = ms => ms / MS_DAY + 2440587.5;

// The sun's declination and the equation of time (minutes) at a moment.
function core(ms) {
  const T = (julianDay(ms) - 2451545) / 36525;
  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * RAD;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const dec = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  const y = Math.tan(eps * RAD / 2) ** 2, L0r = L0 * RAD;
  const eot = 4 * DEG * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  return { dec, eot };
}

// NOAA's bending of the light by the air, in degrees, for a geometric height: 0.482° at the horizon, nothing above 85°.
export function refraction(height) {
  if (!Number.isFinite(height) || height > 85) return 0;
  const t = Math.tan(height * RAD);
  let arcsec;
  if (height > 5) arcsec = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5;
  else if (height > -0.575) arcsec = 1735 + height * (-518.2 + height * (103.4 + height * (-12.79 + height * 0.711)));
  else arcsec = -20.772 / t;
  return arcsec / 3600;
}

// The sun at a moment and a place. lat/lon in degrees (east positive).
export function sunAt(ms, lat, lon) {
  const { dec, eot } = core(ms);
  const minutes = (((ms % MS_DAY) + MS_DAY) % MS_DAY) / MS_MIN;
  const hourAngle = norm180((minutes + eot + 4 * lon) / 4 - 180);
  const la = lat * RAD, de = dec * RAD, ha = hourAngle * RAD;
  const cosZ = Math.sin(la) * Math.sin(de) + Math.cos(la) * Math.cos(de) * Math.cos(ha);
  const height = 90 - Math.acos(clamp(cosZ, -1, 1)) * DEG;
  const azimuth = norm360(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(de) * Math.cos(la)) * DEG + 180);
  const apparent = height + refraction(height);
  return { height, apparent, azimuth, declination: dec, equationOfTime: eot, hourAngle };
}

// How many times as long as the object a shadow is on flat ground (1 / tan of the apparent height); null with the sun on or under the horizon.
export const shadowRatio = apparent => apparent > 0.5 ? 1 / Math.tan(apparent * RAD) : null;
export const shadowLength = (apparent, objectHeight) => { const r = shadowRatio(apparent); return r == null ? null : r * objectHeight; };

// The direction toward the sun in the 3D scene (+x east, +y up, +z south), a unit vector, from an apparent height and an azimuth.
export function lightDirection(apparent, azimuth) {
  const h = apparent * RAD, a = azimuth * RAD;
  return { x: Math.sin(a) * Math.cos(h), y: Math.sin(h), z: -Math.cos(a) * Math.cos(h) };
}

// ---- the farm's own day. A date is {y, m, d} (month 1 to 12) on the farm's own calendar.
// The mean solar noon of a date at a longitude: 12:00 sun time. Each daily moment is looked for round this, so a farm near ±180° gets its own day.
const meanNoon = (date, lon) => Date.UTC(date.y, date.m - 1, date.d, 12) - lon * 4 * MS_MIN;

function noonOf(date, lon) {
  const base = meanNoon(date, lon);
  let t = base;
  for (let i = 0; i < 4; i++) t = base - core(t).eot * MS_MIN;
  return t;
}

// A moment where the sun's geometric height crosses 90 − zenith, going up (rising) or down, started from noon's own answer. null when it does not cross.
function crossing(date, lat, lon, zenith, rising, noon) {
  const base = meanNoon(date, lon);
  const cosZen = Math.cos(zenith * RAD);
  let t = noon, ok = false;
  for (let i = 0; i < 6; i++) {
    const { dec, eot } = core(t);
    const arg = (cosZen - Math.sin(lat * RAD) * Math.sin(dec * RAD)) / (Math.cos(lat * RAD) * Math.cos(dec * RAD));
    if (!(Math.abs(arg) <= 1)) { if (!ok) return null; break; }   // later steps that fall off the edge keep the last good answer
    const ha = Math.acos(arg) * DEG;
    t = base - eot * MS_MIN + (rising ? -1 : 1) * ha * 4 * MS_MIN;
    ok = true;
  }
  return ok ? t : null;
}

// All the moments of a date at a place. state is 'normal', 'day' (the sun does not set) or 'night' (it does not rise); the times are null where the sun does not cross the line.
export function sunEvents(date, lat, lon) {
  const noon = noonOf(date, lon);
  const atNoon = sunAt(noon, lat, lon), atMidnight = sunAt(noon + MS_DAY / 2, lat, lon);
  const line = 90 - ZENITH_RISE;
  const state = atNoon.height <= line ? 'night' : atMidnight.height > line ? 'day' : 'normal';
  const rise = state === 'normal' ? crossing(date, lat, lon, ZENITH_RISE, true, noon) : null;
  const set = state === 'normal' ? crossing(date, lat, lon, ZENITH_RISE, false, noon) : null;
  return {
    state, noon, rise, set,
    civilDawn: crossing(date, lat, lon, ZENITH_CIVIL, true, noon),
    civilDusk: crossing(date, lat, lon, ZENITH_CIVIL, false, noon),
    noonHeight: atNoon.apparent, noonAzimuth: atNoon.azimuth, midnightHeight: atMidnight.apparent,
    daylightMinutes: rise != null && set != null ? (set - rise) / MS_MIN : state === 'day' ? 1440 : 0,
  };
}

// The path every 10 minutes (or step minutes) from sunrise to sunset; the 24 hours round noon in polar day; nothing in polar night.
export function sunPath(date, lat, lon, step = 10) {
  const ev = sunEvents(date, lat, lon);
  let from, to;
  if (ev.state === 'night') return [];
  if (ev.state === 'day') { from = ev.noon - MS_DAY / 2; to = ev.noon + MS_DAY / 2; }
  else { from = ev.rise; to = ev.set; }
  const out = [];
  for (let t = from; t <= to + 1; t += step * MS_MIN) { const s = sunAt(t, lat, lon); out.push({ ms: t, height: s.apparent, azimuth: s.azimuth }); }
  return out;
}

// The twelve 21sts of a year, for the year charts.
export const twentyFirsts = y => Array.from({ length: 12 }, (_, i) => ({ y, m: i + 1, d: 21 }));

// ---- the clock. A zone the browser knows ({zone: 'America/Toronto'}), else one UTC offset in minutes ({offsetMin}), else sun time (UTC + longitude / 15 h).
const zoneFormats = new Map();
function zoneParts(ms, zone) {
  let f = zoneFormats.get(zone);
  if (!f) { f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }); zoneFormats.set(zone, f); }
  const p = {}; for (const x of f.formatToParts(new Date(ms))) p[x.type] = Number(x.value);
  return p;
}
// Year, month, day, hour, minute of a moment on the chosen clock, to the nearest minute.
export function clockParts(ms, { zone, offsetMin, lon = 0 } = {}) {
  const t = Math.round(ms / MS_MIN) * MS_MIN;
  if (zone) { try { const p = zoneParts(t, zone); return { y: p.year, m: p.month, d: p.day, hh: p.hour, mm: p.minute, sunTime: false }; } catch { /* a zone this browser does not know falls through to sun time */ } }
  const shift = Number.isFinite(offsetMin) ? offsetMin * MS_MIN : lon * 4 * MS_MIN;
  const u = new Date(t + Math.round(shift / MS_MIN) * MS_MIN);
  return { y: u.getUTCFullYear(), m: u.getUTCMonth() + 1, d: u.getUTCDate(), hh: u.getUTCHours(), mm: u.getUTCMinutes(), sunTime: !Number.isFinite(offsetMin) };
}
export const clock = (ms, opts) => { if (ms == null || !Number.isFinite(ms)) return ''; const p = clockParts(ms, opts); return String(p.hh).padStart(2, '0') + ':' + String(p.mm).padStart(2, '0'); };
export const timesAreWords = ({ zone, offsetMin } = {}) => zone || Number.isFinite(offsetMin)
  ? 'Times are local time at the field.'
  : 'Times are sun time at the field (noon is when the sun is highest).';
// The farm's date for a moment on that clock.
export const farmDate = (ms, opts) => { const p = clockParts(ms, opts); return { y: p.y, m: p.m, d: p.d }; };

// ---- words
const POINTS8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const POINTS16 = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east', 'south',
  'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
export const compass8 = az => POINTS8[Math.round(norm360(az) / 45) % 8];
export const compass16 = az => POINTS16[Math.round(norm360(az) / 22.5) % 16];

// "3 times as long as the plants", from a shadow ratio.
export function shadowWords(ratio) {
  if (ratio == null) return 'no sun shadows';
  if (ratio > 20) return 'more than 20 times as long as the plants are tall';
  if (ratio >= 1.5) return `about ${Math.round(ratio)} times as long as the plants`;
  if (ratio >= 0.75) return 'about as long as the plants';
  return 'shorter than the plants';
}
export const heightWords = apparent => apparent < 1 ? 'less than 1°' : `${Math.round(apparent)}°`;   // never "0° up"

// One moment in words: "09:30, sun 18° up in the south-east, shadows about 3 times as long as the plants" or "19:47, the sun is down. Twilight until 20:21."
export function momentWords(ms, lat, lon, opts = {}) {
  const s = sunAt(ms, lat, lon);
  const at = clock(ms, { ...opts, lon });
  if (s.apparent > 0) {
    return `${at}, sun ${heightWords(s.apparent)} up in the ${compass8(s.azimuth)}, shadows ${shadowWords(shadowRatio(s.apparent))}`;
  }
  const ev = sunEvents(farmDate(ms, { ...opts, lon }), lat, lon);
  if (s.height > 90 - ZENITH_CIVIL) {   // under 6° below the horizon: twilight, evening or morning
    const end = ms >= ev.noon ? ev.civilDusk : ev.rise;
    if (end != null) return `${at}, the sun is down. Twilight until ${clock(end, { ...opts, lon })}.`;
  }
  return `${at}, the sun is down.`;
}
