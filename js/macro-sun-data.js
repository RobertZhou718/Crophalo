// PLAY THE DAY, the parts that are only numbers and words: which moments of the shown date the film shows, how far along the day it is at each point of the film, what is said.
// Pure: no page, no clock, no storage. Checked by scripts/test_macro_3d.mjs. The scene that plays it is js/macro-sun.js.
import { compass8 } from './sun.js';

export const FILM_MS = 8000, HOLD_MS = 2000;   // the sun crosses in 8 s, then holds at sunset for 2 s: the film is 10 s
export const WORDS = Object.freeze({
  play: 'Play the day', pause: 'Pause the day', resume: 'Play the day', skip: 'Skip', step: 'Next time of day', label: 'The sun over the day shown',
  sunrise: 'Sunrise', noon: 'Noon', sunset: 'Sunset',
  none: 'The sun does not rise and set on this day here, so there is no day to play.',
});

// Can the film run? Only a day with a real sunrise and a real sunset after it (not a day with the sun up or down all day).
export const canPlay = day => !!day && day.state === 'normal' && Number.isFinite(day.rise) && Number.isFinite(day.set) && Number.isFinite(day.noon) && day.rise < day.noon && day.noon < day.set;

// How far along the day the film is: k is the progress of the whole film, 0 to 1, in even time; the last fifth of it holds at sunset.
export const dayShare = k => Math.min(1, Math.max(0, +k || 0) / (FILM_MS / (FILM_MS + HOLD_MS)));
// The moment of the date the film shows at progress k: sunrise to sunset in even steps of real time.
export const msAt = (k, day) => (canPlay(day) ? day.rise + dayShare(k) * (day.set - day.rise) : null);

// The stops "Next time of day" steps through (Less and Still): sunrise, noon, sunset; or every whole hour between them, with sunrise and sunset at the ends.
export function stopsOf(day, kind = 'three', hour = 36e5) {
  if (!canPlay(day)) return [];
  const three = [{ at: 'sunrise', ms: day.rise, label: WORDS.sunrise }, { at: 'noon', ms: day.noon, label: WORDS.noon }, { at: 'sunset', ms: day.set, label: WORDS.sunset }];
  if (kind !== 'hours') return three;
  const out = [three[0]];
  for (let t = Math.ceil((day.rise + 60000) / hour) * hour; t < day.set - 60000; t += hour) out.push({ at: 'hour', ms: t, label: '' });
  out.push(three[2]);
  return out;
}

// The angle the sun dial turns to: the sun's heading, 0 to 360, north at the top, clockwise.
export const dialAngle = az => { const a = Number(az); return Number.isFinite(a) ? (((Math.round(a * 10) / 10) % 360) + 360) % 360 : 0; };
// Said once at the end: "Sun at noon: 61° up, from the south." (the noon of the date shown, from the 3D view's own sun answer)
export const noonWords = s => (s && Number.isFinite(s.height) && Number.isFinite(s.azimuth) ? `Sun at noon: ${Math.round(s.height)}° up, from the ${compass8(s.azimuth)}.` : '');

// The sketch of the land while 3D is built: which parts have been built once these steps of the build have been heard, in building order, never one before its step.
export const ORDER = Object.freeze(['land', 'ground', 'plants', 'light']);
// The parts built once these steps have been heard, in building order, never one before its step: ['land'] gives ['land'], then ['land','ground']...
export const builtAfter = heard => { const seen = new Set(heard || []); return ORDER.filter(p => seen.has(p)); };

