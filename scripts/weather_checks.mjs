// Crophalo's shared checks for a whole weather record: what may be unknown in the climate of a real record and why, the hunt for anything else
// that is not a real number, and every sentence the weather and climate modules can say about one record. Pure: no file, no network.
// Used and checked by scripts/test_weather.mjs (the recorded NASA answers and the back-up record) and scripts/test_fallback.mjs (16 awkward places).
import * as D from '../js/data.js';
import * as K from '../js/climate.js';
import { sourceNotes } from '../js/sources.js';

// Where a number of the climate object may be NaN on a real record, and why. Everything else must be a real number; nothing may be null or undefined.
export const NASA_UNKNOWNS = [/^wet\.0$/,             // runs of months are 1 to 12 long: place 0 is never used
  /^yearly\.frost(Last|First)\.\d+$/];                // a year without a spring or an autumn frost has no date
export const BACKUP_UNKNOWNS = [...NASA_UNKNOWNS,
  /^monthly\.(ET|gw)\.\d+$/, /^yearly\.stress\.\d+$/, /^med\.stress$/, /^gwCal\.\d+\.\d+$/, /^trend\.stress\.(slope|t)$/,   // the back-up record has no soil wetness and no water-loss figure
  /^coldSecond(10)?$/];                               // and no second record of the coldest night
// Every place where the object holds something that is neither a real value nor an unknown the list allows: ['monthly.P.4 = NaN', …].
export function strays(value, allowed, at = '', out = []) {
  if (typeof value === 'number') { if (!Number.isFinite(value) && !(Number.isNaN(value) && allowed.some(rule => rule.test(at)))) out.push(`${at} = ${value}`); }
  else if (value == null) out.push(`${at} = ${value}`);
  else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) strays(v, allowed, at ? `${at}.${k}` : k, out);
  return out;
}
export const BAD_TEXT = /NaN|undefined|null|Infinity|\[object/;                 // an unknown must be said in plain words
export const FUTURE_WORD = new RegExp(['fore', 'cast'].join(''), 'i');          // a record of the past is never called by the word for the days ahead
export const whole = v => Number.isInteger(v) && v >= 0;
export const figures = Y => [Y.gpm, Y.model, Y.modelSame, Y.temp, Y.hot, Y.soil].filter(Boolean);   // the "so far" figures a record has
// Every sentence the two modules can say about one weather record (got is what fetchWeather returned, now its clock).
export function recordTexts(S, C, F, Y, G, got, now) {
  return [K.frostWords(F), ...Object.values(K.hotWords(C, Y)), K.heavyWords(C), K.drySpellWords(C), K.dryYearsWords(C), ...Object.values(K.rainSoFarWords(Y)), ...Object.values(K.soilWords(Y)), ...Object.values(K.warmthWords(G)),
    K.gapWords(C.gaps.temp), K.gapWords(C.gaps.rain), K.trendWords(C.trend.P, 'mm'), K.trendWords(C.trend.T, '°C', 1), K.trendWords(C.trend.heat32, 'days'), K.trendWords(C.trend.heavy, 'days'), K.trendWords(C.trend.stress, 'of the season', 2),
    K.dateWord(F.last), K.dateWord(F.first), C.coldNote, D.rainNote(S), D.heightNote(S), D.weatherLine(got, now), got.note, got.card ?? '', ...sourceNotes(got.sources).flatMap(n => [n.name, n.who, n.what, n.talk])];
}
// The counts of one record, by name, for "every count is a whole number": years, frost years, days read, earlier years, the years behind each trend.
export function recordCounts(C, F, Y, G) {
  return { 'years': C.years.length, 'dry years': C.dryYears.length, 'seasons judged': C.dryOf, 'frost: years': F.years, 'frost: years with frost': F.frostYears, 'frost: years with a spring frost': F.lastYears,
    'frost: years with an autumn frost': F.firstYears, 'frost: years with frost in every month': F.everyMonth, 'first-estimate days': Y.fresh, ...Object.fromEntries(Object.entries(C.trend).map(([k, t]) => [`trend ${k}: years`, t.n])),
    ...Object.fromEntries(figures(Y).concat(G).flatMap((f, i) => [[`so far ${i}: days`, f.days], [`so far ${i}: days read`, f.read], [`so far ${i}: earlier years`, f.years]])) };
}
// No count is larger than what it is counted out of.
export const countsFit = (C, F, Y, G) => C.dryYears.length <= C.dryOf && C.dryOf <= C.years.length && F.frostYears <= F.years && F.lastYears <= F.frostYears && F.firstYears <= F.frostYears && F.years === C.years.length
  && Object.values(C.trend).every(t => t.n <= C.years.length) && figures(Y).concat(G).every(f => f.read <= f.days && f.years <= C.years.length);
