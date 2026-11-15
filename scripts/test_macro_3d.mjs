// Crophalo's offline suite for the pure parts of the 3D view's big animations: PLAY THE DAY's moments, stops and words, and the order the sketch of the land fills in. No page, no clock.
// RULE: never loosen a check here without a written reason beside it: the film shows only real moments of the real date, and a day without a sunrise has no film.
// Run: node scripts/test_macro_3d.mjs
import * as m from '../js/macro-sun-data.js';
import { sunEvents, sunAt } from '../js/sun.js';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

const MEAD = [41.179469, -96.439756], day = sunEvents({ y: 2027, m: 7, d: 5 }, ...MEAD), polar = sunEvents({ y: 2027, m: 6, d: 21 }, 80, 10), dark = sunEvents({ y: 2027, m: 12, d: 21 }, 80, 10);

// ---- which days can play
check('an ordinary day can play', m.canPlay(day), day.state);
check('a day with the sun up all day, or down all day, cannot, and says so in words', !m.canPlay(polar) && !m.canPlay(dark) && !m.canPlay(null) && /no day to play/.test(m.WORDS.none), [polar.state, dark.state]);
check('a day with a missing time cannot play, and nothing becomes zero', !m.canPlay({ ...day, rise: NaN }) && !m.canPlay({ ...day, set: null }) && m.msAt(0.5, { ...day, rise: null }) === null);

// ---- the film: 8 s of the day, then 2 s held at sunset, in even time
same('the film is 8 s of day and 2 s of hold, 10 s in all', [m.FILM_MS, m.HOLD_MS, m.FILM_MS + m.HOLD_MS], [8000, 2000, 10000]);
check('at the start it is the real sunrise, at the end of the sweep the real sunset', m.msAt(0, day) === day.rise && Math.abs(m.msAt(0.8, day) - day.set) < 1, [m.msAt(0, day) - day.rise, m.msAt(0.8, day) - day.set]);
check('it holds at sunset for the last fifth of the film and never goes past it', m.msAt(0.9, day) === day.set && m.msAt(1, day) === day.set && m.msAt(2, day) === day.set, m.msAt(0.9, day) - day.set);
check('it never goes before sunrise', m.msAt(-1, day) === day.rise && m.msAt(NaN, day) === day.rise);
check('even time: equal steps of the film are equal steps of the day (the day is not hurried or slowed anywhere)', (() => { const a = m.msAt(0.2, day) - m.msAt(0.1, day), b = m.msAt(0.6, day) - m.msAt(0.5, day); return Math.abs(a - b) < 1; })());
check('the sun is up at every moment of the sweep, and highest near the middle (noon is between them)', (() => { let top = -90, topAt = 0; for (let i = 0; i <= 80; i++) { const ms = m.msAt(i / 100, day), s = sunAt(ms, ...MEAD); if (i > 0 && i < 80 && s.apparent <= -1) return false; if (s.apparent > top) { top = s.apparent; topAt = i; } } return Math.abs(topAt - 40) <= 3; })());
check('noon is a real moment of the date, between sunrise and sunset', day.rise < day.noon && day.noon < day.set);

// ---- the stops for Less and Still: one time of day for each press
same('the three stops are sunrise, noon and sunset, in that order, with their words', m.stopsOf(day).map(s => [s.label, s.ms]), [['Sunrise', day.rise], ['Noon', day.noon], ['Sunset', day.set]]);
check('by the hour: sunrise, each whole hour between, sunset; rising, all inside the day', (() => { const s = m.stopsOf(day, 'hours'); return s.length >= 10 && s[0].ms === day.rise && s.at(-1).ms === day.set && s.every((x, i) => i === 0 || x.ms > s[i - 1].ms) && s.slice(1, -1).every(x => x.ms % 36e5 === 0 && x.ms > day.rise && x.ms < day.set); })(), m.stopsOf(day, 'hours').length);
same('a day that cannot play has no stops', [m.stopsOf(polar), m.stopsOf(null)], [[], []]);

// ---- the dial and the words
same('the dial turns to the sun\'s heading, north at the top, always 0 to 360', [m.dialAngle(0), m.dialAngle(90), m.dialAngle(180), m.dialAngle(-90), m.dialAngle(450), m.dialAngle(NaN)], [0, 90, 180, 270, 90, 0]);
same('the noon sentence: height rounded, and the compass point the sun is at', m.noonWords({ height: 61.4, azimuth: 180 }), 'Sun at noon: 61° up, from the south.');
same('and with the sun in the south-west or no number, nothing is made up', [m.noonWords({ height: 40.2, azimuth: 225 }), m.noonWords({ height: NaN, azimuth: 180 }), m.noonWords(null)], ['Sun at noon: 40° up, from the south-west.', '', '']);
check('the words are plain and the play button says what it does', m.WORDS.play === 'Play the day' && m.WORDS.pause === 'Pause the day' && Object.values(m.WORDS).every(w => typeof w === 'string' && w.length > 2 && !/undefined|NaN/.test(w)));

// ---- the sketch of the land filling in
same('the sketch fills in in building order: land, ground, plants, light', m.ORDER, ['land', 'ground', 'plants', 'light']);
same('only parts whose step has been heard are built, in order, whatever order the steps are heard in', [m.builtAfter([]), m.builtAfter(['land']), m.builtAfter(['plants', 'land']), m.builtAfter(['light', 'ground', 'plants', 'land', 'draw', 'tools'])], [[], ['land'], ['land', 'plants'], ['land', 'ground', 'plants', 'light']]);
check('a step that is not a part (tools, draw) builds nothing, and rubbish builds nothing', m.builtAfter(['tools', 'draw']).length === 0 && m.builtAfter(null).length === 0 && m.builtAfter(['nope']).length === 0);

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
