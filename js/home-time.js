// The home's own time and sky: how the Earth turns for the moment shown, where the Sun is, and the words that say the moment and the pace.
// The camera stays still in space and the Earth turns under it, west to east; time runs PACE times faster than life so the eye can follow it. Pure: no page, no clock.
// Checked by scripts/test_live_orbits.mjs (the turn against the true turn, the Sun against the sidereal day, the words).
const D = Math.PI / 180;
export const PACE = 120;                 // the Earth turns once in about 12 minutes; a satellite goes once round in about 50 seconds
export const MAX_AHEAD_MS = 864e5;       // the moment shown never runs more than a day from now: it starts again from now
const norm360 = x => ((x % 360) + 360) % 360, norm180 = x => norm360(x + 180) - 180;
export const julian = ms => ms / 864e5 + 2440587.5;

// The turn of the Earth for a moment: Greenwich mean sidereal time in degrees (the same sum the orbit library makes).
export const gmstDeg = ms => norm360(280.46061837 + 360.98564736629 * (julian(ms) - 2451545));
// The Sun for a moment: its right ascension and declination in degrees (the low-precision sum of the Astronomical Almanac, about 0.01°).
export function sunEq(ms) {
  const n = julian(ms) - 2451545, L = 280.460 + 0.9856474 * n, g = (357.528 + 0.9856003 * n) * D, lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D, eps = (23.439 - 4e-7 * n) * D;
  return { ra: norm360(Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / D), dec: Math.asin(Math.sin(eps) * Math.sin(lam)) / D };
}
// The camera stands still in space, a little to the west of the Sun, so the day side is mostly towards the eye and the night edge shows at one side.
export const cameraRa = ms => norm360(sunEq(ms).ra - 32);
// The Earth-fixed longitude under the middle of the picture: it falls as the Earth turns east, so every feature moves east across the disk.
export const lonUnder = (ra, ms) => norm180(ra - gmstDeg(ms));
// The Sun's direction in the picture's own space (east, north, towards the eye), as the shader reads it.
export function sunView(cam, ms, ra) {
  const { ra: rs, dec } = sunEq(ms), lon = (rs - gmstDeg(ms)) * D, x = Math.cos(dec * D) * Math.cos(lon), y = Math.cos(dec * D) * Math.sin(lon), z = Math.sin(dec * D);
  const sl = Math.sin(cam.lat * D), cl = Math.cos(cam.lat * D), so = Math.sin(cam.lon * D), co = Math.cos(cam.lon * D), fwd = x * co + y * so;
  return [-x * so + y * co, cl * z - sl * fwd, sl * z + cl * fwd];
}

// ---- the words
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], two = n => String(n).padStart(2, '0');
export const momentWords = ms => { const d = new Date(ms); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())} UTC`; };
// "Showing 15 Nov, 07:42 UTC · real orbits, sped up 120 times"; at real pace, "Showing now · …"; with motion off the present moment, said so
export const clockWords = (ms, { pace = PACE, level = 'full' } = {}) =>
  level === 'still' ? `Showing the present moment, ${momentWords(ms)} · real orbits; motion is off`
    : pace === 1 || level === 'less' ? `Showing ${momentWords(ms)} · real orbits at real pace` : `Showing ${momentWords(ms)} · real orbits, sped up ${pace} times`;
export const nowButtonWords = pace => (pace === 1 ? 'Speed up' : 'Now');
export const hintWords = (level, pace, touch) => `${touch ? 'Tap a satellite' : 'Point at a satellite'} to see what it does.`;   // the pace is said once, by the clock line
