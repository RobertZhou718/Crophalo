// The suite for js/climate.js. Offline: the records are made by hand from simple rules, so each right answer can be worked
// out on paper, and the working is written beside the check. The last group reads the answers recorded from NASA POWER and
// ERA5-Land in scripts/fixtures (kept by scripts/record_fixtures.mjs) through js/data.js. The suite writes nothing.
// RULE: never loosen a check here without a written farming reason in the check itself. A failure means a farmer would be shown a wrong frost date, a made-up rain total or a dry year that never was: fix the maths, not the test.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { buildSeries, coldFromDaily, fitHeight } from '../js/data.js';
import {
  THR, NOT_ENOUGH, computeClimate, computeFrost, computeYTD, computeGDD, applyScenario, hotDaysAt, gddDay, chillHours, seasonKey, keyToDoy, trend,
  trendWords, gapWords, frostWords, hotWords, heavyWords, drySpellWords, dryYearsWords, rainSoFarWords, soilWords, warmthWords, dateWord,
} from '../js/climate.js';

// ---- the counting
let passed = 0, failed = 0;
const show = v => { const s = typeof v === 'string' ? v : JSON.stringify(v, (_, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x)); return s == null ? String(v) : s.length > 220 ? s.slice(0, 220) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, isDeepStrictEqual(got, want), `got ${show(got)}, wanted ${show(want)}`);   // NaN equals NaN here, and 0 is not NaN
const near = (name, got, want, by = 1e-9) => check(name, Number.isFinite(got) && Math.abs(got - want) <= by, `got ${show(got)}, wanted ${want}`);
const unknown = (name, got) => check(name, Number.isNaN(got), `got ${show(got)}, wanted NaN (unknown, never 0)`);
const throws = (name, run, text) => { let said = ''; try { run(); } catch (e) { said = e.message; } check(name, said.includes(text), `threw ${show(said)}, wanted ${show(text)}`); };
function group(name, run) { try { run(); } catch (e) { check(`${name}: ran to its end`, false, e?.stack?.split('\n').slice(0, 3).join(' | ') || String(e)); } }

// ---- hand-made records
// One value per day from a plain rule. Each rule gets the day as { y, m (1 to 12), d, doy, key 'YYYYMMDD' }.
const LEAP = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], two = v => String(v).padStart(2, '0');
function record({ first = '20010101', last = '20251231', lat = 44.4, hi = () => 20, lo = () => 10, rain = () => 0, sat = rain, gw = () => 0.5, et = () => 1, source = 'power' } = {}) {
  const S = { lat, source, days: [], T2M_MAX: [], T2M_MIN: [], PRECTOTCORR: [], IMERG_PRECTOT: [], GWETROOT: [], EVLAND: [] };
  for (let y = +first.slice(0, 4); y <= +last.slice(0, 4); y++) for (let m = 1, doy = 0; m <= 12; m++) for (let d = 1; d <= DAYS_IN[m - 1] + (m === 2 && LEAP(y) ? 1 : 0); d++) {
    const day = { y, m, d, doy: ++doy, key: `${y}${two(m)}${two(d)}` };
    if (day.key < first || day.key > last) continue;
    S.days.push(day.key); S.T2M_MAX.push(hi(day)); S.T2M_MIN.push(lo(day)); S.PRECTOTCORR.push(rain(day)); S.IMERG_PRECTOT.push(sat(day)); S.GWETROOT.push(gw(day)); S.EVLAND.push(et(day));
  }
  return S;
}
const RAIN = ['PRECTOTCORR', 'IMERG_PRECTOT'], TEMP = ['T2M_MAX', 'T2M_MIN'], ALL = [...TEMP, ...RAIN, 'GWETROOT', 'EVLAND'];
const put = (S, names, from, to, value) => { S.days.forEach((key, i) => { if (key >= from && key <= to) for (const name of names) S[name][i] = value; }); return S; };   // one value over a stretch of days
const drop = (S, from, to) => { const keep = S.days.map(key => key < from || key > to), out = { ...S }; for (const name of ['days', ...ALL]) out[name] = S[name].filter((_, i) => keep[i]); return out; };   // days left out of the record altogether
const copy = S => structuredClone(S);
const yearAt = (C, year) => C.years.indexOf(year);
const between = (day, from, to) => day.m * 100 + day.d >= from && day.m * 100 + day.d <= to;   // month-and-day, as 420 for 20 April
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const dash = key => `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6)}`;   // '20260719' as the modules write a day; the days of the hand-made records are kept in the 8-digit form

// Which numbers of the climate object may be NaN on purpose (an unknown), by their place in the object. Every other number must be finite.
const MAY_BE_NAN = [
  /^wet\.\d+$/,                                   // wet.0 is never used; a run of months through an unread month has no start
  /^monthly\.(tmax|tmin|tmean|P|ET|gw|heavy|frostByMonth)\.\d+$/, /^monthly\.heatByMonth\.\d+\.\d+$/,   // a month read in too few years
  /^yearly\.(P|T|gsRain|heat32|heat35|heavy|heavy50|maxDay|dryRun|stress|chill)\.\d+$/,   // a year or a season with a badly read month
  /^yearly\.(frostLast|frostFirst)\.\d+$/,        // a year with no spring or no autumn frost has no date
  /^med\.(P|T|gsRain|heat32|heat35|heavy|heavy50|maxDay|dryRun|stress|frostLast|frostFirst)$/,   // no year gave the figure
  /^coldSecond(10)?$/,                            // no second record of the coldest night
  /^chill$/, /^droughtYears$/, /^gwCal\.\d+\.\d+$/, /^trend\.(P|T|heat32|heavy|stress)\.(slope|t)$/,   // fewer than five years: no trend
];
const MAY_BE_NULL = [/^through$/, /^rainThrough$/, /^season$/, /^coldWinter$/, /^dry$/];   // unknown where a true-or-false or a date would be a claim
function faults(value, path = '', out = []) {   // every place where the object holds something that is neither a real value nor an allowed unknown
  if (typeof value === 'number') { if (!Number.isFinite(value) && !(Number.isNaN(value) && MAY_BE_NAN.some(rule => rule.test(path)))) out.push(`${path} = ${value}`); }
  else if (value === null) { if (!MAY_BE_NULL.some(rule => rule.test(path))) out.push(`${path} = null`); }
  else if (value === undefined) out.push(`${path} = undefined`);
  else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) faults(v, path ? `${path}.${k}` : k, out);
  return out;
}
const BAD_WORDS = /NaN|undefined|null|Infinity|\[object|forecast/i;   // an unknown must be said in plain words; the past is never called a forecast
function everyText(S, lat, opts) {   // every sentence this module can say about one record
  const C = computeClimate(S, lat, opts), Y = computeYTD(S, opts), G = computeGDD(S, lat, opts);
  return [frostWords(computeFrost(S, lat, opts)), hotWords(C, Y).text, hotWords(C).status, heavyWords(C), drySpellWords(C), dryYearsWords(C), rainSoFarWords(Y).text, rainSoFarWords(Y).status,
    soilWords(Y).text, soilWords(Y).chip, warmthWords(G).text, warmthWords(G).status, gapWords(C.gaps.temp), gapWords(C.gaps.rain),
    trendWords(C.trend.P, 'mm'), trendWords(C.trend.T, '°C', 1), trendWords(C.trend.heat32, 'days'), trendWords(C.trend.heavy, 'days'), trendWords(C.trend.stress, 'of the season', 2)];
}

const PLAIN = { hi: () => 20, lo: () => 10, rain: () => 2 };   // the base record: 20 °C by day, 10 °C by night, 2 mm of rain every day

// ---- 1. the monthly climatology
group('monthly climatology', () => {
  const C = computeClimate(record(PLAIN));
  same('25 full years are kept, 2001 to 2025', C.years, range(2001, 2025));
  near('January rain: 31 days of 2 mm = 62 mm', C.monthly.P[0], 62);
  near('April rain: 30 days of 2 mm = 60 mm', C.monthly.P[3], 60);
  near('February rain: 19 years of 56 mm and 6 leap years of 58 mm = 1412 / 25 = 56.48 mm', C.monthly.P[1], 56.48);
  same('highs, lows and means of every month: 20, 10 and 15 °C', [C.monthly.tmax, C.monthly.tmin, C.monthly.tmean].map(list => list.map(v => Math.round(v * 1e9) / 1e9)), [Array(12).fill(20), Array(12).fill(10), Array(12).fill(15)]);
  near('yearly rain 2001: 365 days of 2 mm = 730 mm', C.yearly.P[0], 730);
  near('yearly rain 2004, a leap year: 366 days of 2 mm = 732 mm', C.yearly.P[yearAt(C, 2004)], 732);
  near('the usual yearly rain is the middle year: 730 mm', C.med.P, 730);
  near('the usual yearly mean temperature: 15 °C', C.med.T, 15);
  near('water lost in January: 31 days of 1 mm = 31 mm', C.monthly.ET[0], 31);
  near('soil wetness of June: 0.5', C.monthly.gw[5], 0.5);
  same('no month is missing', C.gaps, { temp: [], rain: [] });
  same('satellite rain read on every day is the rain record in use', [C.imerg, C.rainSource], [true, 'imerg']);
  same('the record knows its last day', [C.through, C.rainThrough, C.y1], [dash('20251231'), dash('20251231'), 2025]);
});

// ---- 2. a reading nobody took is unknown, never zero
group('missing readings', () => {
  // May unread in 13 of 25 years (2001 to 2013): 12 × 31 = 372 of 775 May days were read, 48%, under half.
  const few = record(PLAIN); for (const y of range(2001, 2013)) put(few, [...TEMP, ...RAIN], `${y}0501`, `${y}0531`, NaN);
  const C = computeClimate(few);
  unknown('a May read in 12 of 25 years has no rain normal', C.monthly.P[4]);
  unknown('…and no temperature normal', C.monthly.tmean[4]);
  check('…and the unknown is not 0', C.monthly.P[4] !== 0 && C.monthly.tmean[4] !== 0);
  same('…and May is named as the gap, for temperature and for rain', C.gaps, { temp: [4], rain: [4] });
  same('the gap is said in plain words', gapWords(C.gaps.temp), 'the weather record has no readings for May');
  near('June beside it keeps its 60 mm', C.monthly.P[5], 60);
  same('a year with 334 days read still counts: 25 years', C.years.length, 25);
  unknown('a year with a missing rain month has no yearly total', C.yearly.P[yearAt(C, 2001)]);
  unknown('…and no yearly mean temperature', C.yearly.T[yearAt(C, 2001)]);
  near('a fully read year keeps its total: 730 mm', C.yearly.P[yearAt(C, 2014)], 730);
  near('the usual yearly rain comes from the 12 full years only: 730 mm (a missing May taken as 0 mm would give 668)', C.med.P, 730);
  unknown('no frost count for a month read in too few years', C.monthly.frostByMonth[4]);

  // May unread in 12 of 25 years: 13 × 31 = 403 of 775 days, 52%, and 13 of 25 years have the month: enough.
  const more = record(PLAIN); for (const y of range(2001, 2012)) put(more, [...TEMP, ...RAIN], `${y}0501`, `${y}0531`, NaN);
  const D = computeClimate(more);
  near('a May read in 13 of 25 years has its normal: 31 days of 2 mm = 62 mm', D.monthly.P[4], 62);
  same('…and is not a gap', D.gaps, { temp: [], rain: [] });

  // Single days of rain unread inside one January (31 days).
  const six = put(record(PLAIN), RAIN, '20100101', '20100106', NaN), seven = put(record(PLAIN), RAIN, '20100101', '20100107', NaN);
  near('6 unread rain days in January (25 of 31 read, 81%): the month is 31 days at its own mean of 2 mm = 62 mm, the year 730 mm (unread days as 0 mm would give 718)', computeClimate(six).yearly.P[9], 730);
  unknown('7 unread rain days in January (24 of 31 read, 77%): no yearly total', computeClimate(seven).yearly.P[9]);
  const april = n => computeClimate(put(record(PLAIN), RAIN, '20100401', `201004${String(n).padStart(2, '0')}`, NaN)).yearly.P[9];
  near('April with 24 of 30 days read is exactly 80%: read well enough, 730 mm', april(6), 730);
  unknown('April with 23 of 30 days read: no yearly total', april(7));

  const noRain = computeClimate(put(record(PLAIN), RAIN, '20120101', '20121231', NaN));
  same('a year with no rain readings is a gap: 24 years, 2012 left out', [noRain.years.length, noRain.years.includes(2012)], [24, false]);
  same('…and it is not a dry year', noRain.dryYears, []);
  throws('ten days of weather are not a climate', () => computeClimate(record({ ...PLAIN, first: '20250101', last: '20250110' })), NOT_ENOUGH);
  throws('…nor is a record whose only year is still running', () => computeClimate(record({ ...PLAIN, first: '20260101', last: '20260630' }), 44.4, { today: dash('20260701') }), NOT_ENOUGH);

  const filled = record(PLAIN); put(filled, ['T2M_MIN'], '20100115', '20100115', -999); put(filled, RAIN, '20100101', '20100131', null); put(filled, ['T2M_MAX'], '20100301', '20100301', '45');
  const F = computeClimate(filled);
  near('the service\'s fill value (−999) is not a cold night: the coldest night stays 10 °C', F.coldNasa, 10);
  unknown('null is not 0 mm: a January of nulls leaves 2010 without a total', F.yearly.P[yearAt(F, 2010)]);
  near('a text is not a reading: "45" makes no hot day', F.yearly.heat32[yearAt(F, 2010)], 0);
  throws('a day listed twice is refused', () => computeClimate({ ...record(PLAIN), days: record(PLAIN).days.map((k, i) => (i === 5 ? '20010105' : k)) }), 'out of order');
  throws('a measure shorter than the days is refused', () => computeClimate({ ...record(PLAIN), T2M_MAX: [20, 20] }), 'T2M_MAX does not match');
  throws('a day that is not a date is refused', () => computeClimate({ ...record(PLAIN), days: record(PLAIN).days.map((k, i) => (i === 0 ? '20010230' : k)) }), 'not a date');
});

// ---- 3. frost, counted night by night
group('frost night by night', () => {
  // Every seventh night of January freezes (the 7th, 14th, 21st and 28th at −3 °C), every other night is +2 °C.
  const mild = record({ hi: () => 12, lo: d => (d.m === 1 && d.d % 7 === 0 ? -3 : 2) }), C = computeClimate(mild);
  near('the January mean low is above freezing: (4 × −3 + 27 × 2) / 31 = 1.35 °C', C.monthly.tmin[0], 42 / 31);
  near('…yet January has 4 frost nights in a normal year', C.monthly.frostByMonth[0], 4);
  near('…and June none', C.monthly.frostByMonth[5], 0);
  same('frost every year is not rare', [computeFrost(mild).frostYears, computeFrost(mild).rare], [25, false]);
  same('the last spring frost is 28 January; with no autumn frost that date is said to be unknown', frostWords(computeFrost(mild)),
    'Last spring frost: usually about Jan 28. No reliable usual date for the first autumn frost. Counted night by night: frost in 25 of 25 years.');

  const zero = computeClimate(record({ lo: d => (d.m === 1 ? 0 : 5) })), below = computeClimate(record({ lo: d => (d.m === 1 ? -0.1 : 5) }));
  near('a night of exactly 0 °C is not frost', zero.monthly.frostByMonth[0], 0);
  near('…so that year has 365 frost-free days', zero.med.frostFree, 365);
  near('a night of −0.1 °C is frost: 31 January nights', below.monthly.frostByMonth[0], 31);

  // The first 15 nights of every January unread, the other 16 all freezing: 16 of 16 read nights × 31 = 31, not 16.
  const half = computeClimate(record({ lo: d => (d.m === 1 ? (d.d <= 15 ? NaN : -5) : 5) }));
  near('a half-read January is scaled by the nights read: 16 of 16 × 31 = 31 frost nights', half.monthly.frostByMonth[0], 31);

  // One night of −2 °C on 10 January in the first k years, +5 °C on every other night.
  const some = (k, first = '20010101') => record({ first, lo: d => (d.m === 1 && d.d === 10 && d.y < +first.slice(0, 4) + k ? -2 : 5) });
  same('frost on one night in one year of 25 is rare', [computeFrost(some(1)).frostYears, computeFrost(some(1)).rare], [1, true]);
  same('frost in 12 of 25 years is rare (fewer than half)', [computeFrost(some(12)).frostYears, computeFrost(some(12)).rare], [12, true]);
  same('frost in 13 of 25 years is not rare', [computeFrost(some(13)).frostYears, computeFrost(some(13)).rare], [13, false]);
  same('frost in 12 of 24 years is not rare: exactly half is not fewer than half', [computeFrost(some(12, '20020101')).years, computeFrost(some(12, '20020101')).rare], [24, false]);
  same('12 of 25 years: no usual date is given', frostWords(computeFrost(some(12))), 'Frost is rare here: frost in 12 of 25 years. No reliable usual frost date here.');
  near('13 of 25 years: the usual last frost is 10 January', computeFrost(some(13)).last, 10);
  same('the climate calls 12 of 25 spring-frost years frost-free, 13 of 25 not', [computeClimate(some(12)).frostFreeClimate, computeClimate(some(13)).frostFreeClimate], [true, false]);
  same('no frost in any year is said with its count', frostWords(computeFrost(some(0))), 'No frost in any of 25 years.');

  // Frost in 13 of 25 years, but only 7 of them in spring (10 January) and 6 in autumn (10 December): neither date in half the years.
  const loose = computeFrost(record({ lo: d => ((d.m === 1 && d.d === 10 && d.y <= 2007) || (d.m === 12 && d.d === 10 && d.y >= 2008 && d.y <= 2013) ? -2 : 5) }));
  same('a missing usual date gets its own sentence, never the worst wording', frostWords(loose), 'Some years: frost in 13 of 25 years, no reliable dates.');
  const thin = computeFrost(put(record({ lo: d => (d.m === 1 ? -5 : 5) }), ['T2M_MIN'], '20100601', '20100710', NaN));
  same('a year with 325 nights read is not counted: 24 years', thin.years, 24);
  same('too few nights is said, not guessed', frostWords(computeFrost(record({ first: '20250101', last: '20250301' }))), 'Too few nights were read to say when frost comes here.');
});

// ---- 4. the frost-free season, in four kinds of place
group('frost-free season', () => {
  // Ontario (44.4 N): frost from 1 January to 30 April and from 20 October to 31 December.
  // 30 April is day 120 (121 in a leap year), 20 October is day 293 (294): 293 − 120 = 173 days.
  const ontario = record({ lat: 44.4, hi: d => (between(d, 501, 1019) ? 18 : 5), lo: d => (between(d, 501, 1019) ? 8 : -5) }), C = computeClimate(ontario), F = computeFrost(ontario);
  same('Ontario: last spring frost day 120, first autumn frost day 293, 173 days between', [C.med.frostLast, C.med.frostFirst, C.med.frostFree], [120, 293, 173]);
  near('Ontario: October has 12 frost nights (the 20th to the 31st)', C.monthly.frostByMonth[9], 12);
  same('Ontario: the report\'s dates agree', [F.last, F.first, F.free, F.rare], [120, 293, 173, false]);
  same('Ontario: said as dates', frostWords(F), 'Last spring frost: usually about Apr 30. First autumn frost: usually about Oct 20. About 173 days lie between them. Counted night by night: frost in 25 of 25 years.');
  same('Ontario: not a frost-free climate', C.frostFreeClimate, false);

  // Southern hemisphere (35 S): frost from 1 June to 31 August. Last frost 31 August is day 243, first frost 1 June is day 152.
  // From 31 August to 1 June of the next year: 365 − (243 − 152) = 274 days. Read as a northern place the answer would be 1 day.
  const south = record({ lat: -35, hi: d => (between(d, 601, 831) ? 6 : 18), lo: d => (between(d, 601, 831) ? -4 : 8) }), CS = computeClimate(south), FS = computeFrost(south);
  near('south: the frost-free season runs across New Year, 274 days', CS.med.frostFree, 274);
  same('south: the season keys are half a year on: 60 for 31 August, 334 for 1 June', [CS.med.frostLast, CS.med.frostFirst], [60, 334]);
  same('south: the keys turn back into the real days 243 and 152', [keyToDoy(CS.med.frostLast, true), keyToDoy(CS.med.frostFirst, true)], [243, 152]);
  same('south: the report\'s dates are the real ones, 274 days apart', [FS.last, FS.first, FS.free], [243, 152, 274]);
  same('south: said as dates', frostWords(FS), 'Last spring frost: usually about Aug 31. First autumn frost: usually about Jun 1. About 274 days lie between them. Counted night by night: frost in 25 of 25 years.');
  near('south: July has 31 frost nights, January none', CS.monthly.frostByMonth[6] - CS.monthly.frostByMonth[0], 31);
  same('the key of a day and back again, both hemispheres', [1, 17, 18, 182, 183, 184, 365].map(doy => [keyToDoy(seasonKey(doy, true), true), keyToDoy(seasonKey(doy, false), false)]), [1, 17, 18, 182, 183, 184, 365].map(doy => [doy, doy]));

  // The equator: never below 20 °C.
  const equator = record({ lat: 0.5, hi: () => 30, lo: () => 20, rain: () => 5 }), CE = computeClimate(equator);
  same('equator: no frost night in any month', CE.monthly.frostByMonth, Array(12).fill(0));
  same('equator: 365 frost-free days, a frost-free climate, and no frost dates', [CE.med.frostFree, CE.frostFreeClimate, CE.med.frostLast, CE.med.frostFirst], [365, true, NaN, NaN]);
  same('equator: said with its count', frostWords(computeFrost(equator)), 'No frost in any of 25 years.');

  // Inside the polar circle (78 N): every night of the year is −10 °C.
  const polar = record({ lat: 78, hi: () => -2, lo: () => -10 }), CP = computeClimate(polar);
  near('polar: no frost-free day at all', CP.med.frostFree, 0);
  near('polar: 31 frost nights in July', CP.monthly.frostByMonth[6], 31);
  same('polar: frost in every month is said so', frostWords(computeFrost(polar)), 'Frost in every month of the year (in 25 of 25 years).');
  // A polar summer of 20 nights above freezing, 1 to 20 July: last frost 30 June (day 181), first frost 21 July (day 202): 21 days.
  const brief = computeClimate(record({ lat: 78, hi: () => 4, lo: d => (d.m === 7 && d.d <= 20 ? 1 : -10) }));
  near('polar with a short summer: 21 days from the last frost to the first', brief.med.frostFree, 21);
  // Only one frost a year, on 1 February (day 32): the rest of the year, 365 − 32 = 333 days, is free.
  near('one spring frost and no autumn frost: 333 days', computeClimate(record({ lo: d => (d.m === 2 && d.d === 1 ? -3 : 5) })).med.frostFree, 333);
});

// ---- 5. heat units, base 10 °C and cap 30 °C
group('heat units', () => {
  same('a day of 9.9 °C gives no heat units', gddDay(9.9, 9.9), 0);
  same('a day of 10 °C gives none either: the base', gddDay(10, 10), 0);
  same('a day of 30 °C gives 20: (30 + 30) / 2 − 10', gddDay(30, 30), 20);
  same('a day of 35 °C gives 20 too: the cap', gddDay(35, 35), 20);
  same('35 by day and 20 by night: (30 + 20) / 2 − 10 = 15', gddDay(35, 20), 15);
  same('25 by day and 5 by night: the night counts as 10, (25 + 10) / 2 − 10 = 7.5', gddDay(25, 5), 7.5);
  unknown('a day with no high has no heat units', gddDay(NaN, 10));

  // 20 °C by day and 10 °C by night is 5 units a day.
  const north = computeGDD(record({ last: '20260719' }), 44.4);
  same('north, 1 April to 19 July: 30 + 31 + 30 + 19 = 110 days × 5 = 550, the same as a normal year', [north.total, Math.round(north.normal * 1e6) / 1e6, north.since, north.through, north.full], [550, 550, dash('20260401'), dash('20260719'), false]);
  same('…in words', warmthWords(north), { status: 'Normal', tone: 'Good', text: '550 growing degree days (warmth above 10 °C) since Apr 1.' });
  const south = computeGDD(record({ lat: -35, last: '20260228' }), -35);
  same('south, 1 October to 28 February across New Year: 31 + 30 + 31 + 31 + 28 = 151 days × 5 = 755', [south.total, south.since, south.through], [755, dash('20251001'), dash('20260228')]);
  const before = computeGDD(record({ last: '20260215' }), 44.4);
  same('north in February, before the season starts: the whole last season, 183 days × 5 = 915', [before.total, before.full, before.since, before.through], [915, true, dash('20250401'), dash('20250930')]);
  same('…in words', warmthWords(before).text, '915 growing degree days (warmth above 10 °C) from Apr 1 to Sep 30.');
  const warm = computeGDD(record({ last: '20260719', hi: d => (d.y === 2026 ? 22 : 20), lo: d => (d.y === 2026 ? 12 : 10) }), 44.4);
  near('a season 2 °C warmer: 7 units a day against 5, 40% more', warm.pct, 40, 1e-6);
  same('…is called warmer', [warmthWords(warm).status, warmthWords(warm).text], ['Warmer', 'A warm season: crops are moving fast. 770 growing degree days (warmth above 10 °C) since Apr 1.']);
  const over = computeGDD(record({ last: '20261112', hi: d => (d.y === 2026 ? 22 : 20), lo: d => (d.y === 2026 ? 12 : 10) }), 44.4);
  same('in November the season is over: the whole of it is shown, 183 days × 7 = 1281, and it is not said to be "moving"', [warmthWords(over).status, warmthWords(over).text], ['Warmer', '1,281 growing degree days (warmth above 10 °C) from Apr 1 to Sep 30.']);
  const cool = computeGDD(record({ last: '20260719', hi: d => (d.y === 2026 ? 19 : 20), lo: d => (d.y === 2026 ? 9 : 10) }), 44.4);
  same('a season 1 °C cooler: 4.5 units a day against 5, 10% less: cooler, not yet a watch', [Math.round(cool.pct), warmthWords(cool).status, warmthWords(cool).tone], [-10, 'Cooler', 'Good']);
  const gap5 = computeGDD(put(record({ last: '20260719' }), TEMP, '20260501', '20260505', NaN), 44.4), gap10 = computeGDD(put(record({ last: '20260719' }), TEMP, '20260501', '20260510', NaN), 44.4);
  same('5 of 110 days unread (95.5% read): the 105 days read give 525, held against 525 for the same count of days, 0% off (an unread day is not a cool day)', [gap5.total, Math.round(gap5.normal * 1e6) / 1e6, Math.round(gap5.pct * 1e6) / 1e6 + 0], [525, 525, 0]);
  unknown('10 of 110 days unread (90.9% read): no figure for the season', gap10.total);
  same('…and the words say so', warmthWords(gap10), { status: 'Unknown', tone: 'Unknown', text: 'Too few temperature readings this season to count its warmth.' });
});

// ---- 6. hot days at each crop's own limit
group('hot days', () => {
  // July: 10 days of exactly 32.0 °C, 5 days of 35 °C, 3 days of 31.9 °C; 25 °C on every other day of the year.
  const hot = record({ hi: d => (d.m !== 7 ? 25 : d.d <= 10 ? 32 : d.d <= 15 ? 35 : d.d <= 18 ? 31.9 : 25), lo: () => 15 }), C = computeClimate(hot), k = line => THR.indexOf(line);
  same('the limits run from 28 to 45 °C', [THR[0], THR.at(-1), THR.length], [28, 45, 11]);
  same('days of 32 °C or more: 10 + 5 = 15 (32.0 counts, 31.9 does not); of 35 °C or more: 5', [C.med.heat32, C.med.heat35], [15, 5]);
  same('July at 30, 32, 33, 35 and 45 °C: 18, 15, 5, 5 and 0 days', [30, 32, 33, 35, 45].map(line => Math.round(C.monthly.heatByMonth[k(line)][6] * 1e9) / 1e9), [18, 15, 5, 5, 0]);
  near('a crop limit of 31 °C sits between two buckets and takes the lower one, 30 °C: 18 days', hotDaysAt(C, 31)[6], 18);
  near('the highest bucket at or under 31 °C is 30 °C: 18 days', hotDaysAt(C, 31, 'under')[6], 18);
  near('between the buckets of 30 and 32 °C: (18 + 15) / 2 = 16.5 days', hotDaysAt(C, 31, 'between')[6], 16.5);
  same('no bucket lies at or under 27 °C: unknown, not 0 days and not the too-few days of the 28 °C bucket', [hotDaysAt(C, 27, 'under')[6], hotDaysAt(C, 27, 'between')[6]], [NaN, NaN]);
  near('a limit over the highest bucket takes that bucket: 0 days at 45 °C', hotDaysAt(C, 50, 'between')[6], 0);
  const upside = computeClimate(put(put(record({ hi: d => (d.m <= 3 || d.m >= 10 ? 7.2 : 20), lo: d => (d.m <= 3 || d.m >= 10 ? 0 : 10) }), ['T2M_MAX'], '20100110', '20100110', -5), ['T2M_MIN'], '20100110', '20100110', 3));
  near('a day whose high reads under its low is no reading: the winter still has its 4368 chill hours', upside.yearly.chill[9], 4368, 1e-6);
  const noLow = computeClimate(put(copy(hot), ['T2M_MIN'], '20100701', '20100701', NaN));
  near('a measured hot day still counts when its night was not read: 15 days in 2010', noLow.yearly.heat32[9], 15);
  same('15 hot days a year is a watch', hotWords(C), { status: 'Watch', text: 'Heat can hurt crops at flowering.' });
  same('under 10 is said as rare', hotWords(computeClimate(record(PLAIN))), { status: 'Good', text: 'Heat stress is rare here.' });
  // Hot days rising by one a year from 1 July on, 20 in 2001 and 44 in 2025 (all July and 13 days of August): a straight line.
  const rising = computeClimate(record({ hi: d => ((d.m === 7 && d.d <= d.y - 1981) || (d.m === 8 && d.d <= d.y - 1981 - 31) ? 33 : 25), lo: () => 15 }));
  same('the middle year, 2013, has 32 hot days: 30 or more is a risk, and a rising count is said to be increasing', [rising.med.heat32, hotWords(rising)], [32, { status: 'Risk', text: 'Heat can hurt crops at flowering. And it is increasing.' }]);
  same('…the trend is one day a year', [Math.round(rising.trend.heat32.slope * 1e9) / 1e9, trendWords(rising.trend.heat32, 'days')], [1, '+10 days per decade · clear trend']);
  const july = computeClimate(put(copy(hot), ['T2M_MAX'], '20100701', '20100731', NaN));
  unknown('a year whose July highs were not read has no hot-day count (it is not a cool year)', july.yearly.heat32[9]);
});

// ---- 7. heavy rain
group('heavy rain', () => {
  // Each year: 20.0 mm on 1 June, 19.9 mm on 2 June, 50 mm on 3 June, 49.9 mm on 4 June, dry otherwise.
  const C = computeClimate(record({ rain: d => (d.m !== 6 ? 0 : d.d === 1 ? 20 : d.d === 2 ? 19.9 : d.d === 3 ? 50 : d.d === 4 ? 49.9 : 0) }));
  same('days of 20 mm or more: 3 (20.0 counts, 19.9 does not); of 50 mm or more: 1 (49.9 does not count)', [C.med.heavy, C.med.heavy50], [3, 1]);
  near('June has the 3 heavy days of a normal year', C.monthly.heavy[5], 3);
  near('the wettest day of a normal year: 50 mm', C.med.maxDay, 50);
  near('the yearly total: 20 + 19.9 + 50 + 49.9 = 139.8 mm', C.med.P, 139.8);
  same('under 500 mm a year is a dry place', C.dry, true);
  same('…in words', heavyWords(C), 'Heavy-rain days (20 mm or more in a day): about 3 a year. The wettest day of a normal year brings about 50 mm: bare soil is most at risk then.');
});

// ---- 8. dry spells
group('dry spells', () => {
  // North: 5 mm every day, but no rain from 1 to 23 July: a spell of 23 days.
  const dry = (hole = () => 5) => record({ rain: d => (d.m === 7 && d.d <= 23 ? hole(d) : 5) });
  const C = computeClimate(dry(() => 0));
  near('23 dry days in a row in the season', C.med.dryRun, 23);
  same('…in words', drySpellWords(C), 'A dry spell lasts about 23 days in a normal season.');
  near('a day of 0.9 mm is still a dry day: 23', computeClimate(dry(d => (d.y === 2010 && d.d === 12 ? 0.9 : 0))).yearly.dryRun[9], 23);
  near('a day of 1.0 mm ends the spell: 11 days before it and 11 after', computeClimate(dry(d => (d.y === 2010 && d.d === 12 ? 1 : 0))).yearly.dryRun[9], 11);
  near('an unread day is not a dry day: it ends the spell too, 11 days', computeClimate(dry(d => (d.y === 2010 && d.d === 12 ? NaN : 0))).yearly.dryRun[9], 11);
  near('dry days outside the growing season do not count: a dry January to March leaves 0', computeClimate(record({ rain: d => (d.m <= 3 ? 0 : 5) })).med.dryRun, 0);

  // South (35 S, season October to March): no rain from 20 December to 10 January: 12 + 10 = 22 days across New Year.
  const south = record({ lat: -35, rain: d => ((d.m === 12 && d.d >= 20) || (d.m === 1 && d.d <= 10) ? 0 : 5) }), CS = computeClimate(south);
  near('a dry spell across New Year is one spell of 22 days, not 12 and 10', CS.med.dryRun, 22);
  same('24 southern seasons are judged from 25 years: the one that began in October of 2025 is not over', [CS.dryOf, CS.yearly.dryRun.filter(Number.isFinite).length, CS.yearly.dryRun[24]], [24, 24, NaN]);
  // Days left out of the record altogether, 1 to 5 January of 2010: the spell that began on 20 December of 2009 ends at the hole.
  near('a spell does not run across days that are not in the record: 12 days', computeClimate(drop(south, '20100101', '20100105')).yearly.dryRun[8], 12);
});

// ---- 9. the growing season, dry years and soil wetness
group('dry years and soil wetness', () => {
  // 3 mm every day: the season April to September has 183 days, 549 mm; the year 1095 mm.
  // 2010 and 2012: 2 mm a day in the season, 366 mm, 67% of 549. 2015 and 2016: 2.3 mm a day, 420.9 mm, 77%.
  // 2016 also has dry soil in the season (0.3 against 0.5). Soil z-score of 2016: mean 0.492, spread 0.04, (0.3 − 0.492) / 0.04 = −4.8.
  const season = d => d.m >= 4 && d.m <= 9;
  const make = () => record({ rain: d => (!season(d) ? 3 : d.y === 2010 || d.y === 2012 ? 2 : d.y === 2015 || d.y === 2016 ? 2.3 : 3), gw: d => (season(d) && d.y === 2016 ? 0.3 : 0.5) });
  const C = computeClimate(make());
  near('growing-season rain of a normal year: 183 days of 3 mm = 549 mm', C.med.gsRain, 549);
  same('the season is April to September', C.season, { start: 3, months: [3, 4, 5, 6, 7, 8] });
  same('a quarter short on rain is a dry year (2010, 2012); 77% is not (2015), unless the soil was clearly dry too (2016)', C.dryYears, [2010, 2012, 2016]);
  same('dry years as a count with its denominator', [dryYearsWords(C), C.dryOf, C.droughtYears], ['3 of 25 years', 25, 0.12]);
  same('1095 mm a year and 549 mm in the season is not a dry place', C.dry, false);
  near('the share of season days with dry soil: all of 2016, none of the other 24 years = 1 / 25', C.med.stress, 0.04);
  near('June soil wetness in a normal year: (24 × 0.5 + 0.3) / 25 = 0.492', C.monthly.gw[5], 0.492);
  near('the drought calendar for June of 2016: 0.3 − 0.492 = −0.192', C.gwCal[yearAt(C, 2016)][5], -0.192);
  near('…and for June of 2015: 0.5 − 0.492 = +0.008', C.gwCal[yearAt(C, 2015)][5], 0.008);
  const edge = computeClimate(record({ rain: () => 3, gw: d => (season(d) && d.y === 2016 ? 0.4 : 0.5) }));
  near('soil wetness of exactly 0.4 is not under 0.4', edge.yearly.stress[15], 0);
  const noJune = computeClimate(put(make(), RAIN, '20100601', '20100630', NaN));
  same('a season with an unread rain month cannot be judged: 2010 is not a dry year, and 24 seasons are counted', [noJune.dryYears, noJune.dryOf, noJune.yearly.gsRain[9]], [[2012, 2016], 24, NaN]);
  same('1 mm a day is 365 mm a year: a dry place', computeClimate(record({ rain: () => 1 })).dry, true);
  const blind = computeClimate(record({ source: 'era5', rain: () => 3, sat: () => NaN, gw: () => NaN, et: () => NaN }));
  same('the back-up record has no evaporation and no soil wetness: unknown in every month, never zeros', [blind.monthly.ET, blind.monthly.gw, blind.med.stress, blind.rainSource], [Array(12).fill(NaN), Array(12).fill(NaN), NaN, 'era5']);
});

// ---- 10. the tropics: seasons by rain
group('tropic wet windows', () => {
  // One rainy season (12 N): 6 mm a day from June to September. June 180, July 186, August 186, September 180 mm.
  const one = computeClimate(record({ lat: 12, hi: () => 33, lo: () => 22, rain: d => (d.m >= 6 && d.m <= 9 ? 6 : 0) }));
  same('one season: the wettest four months start in June, the wettest single month is July', [one.tropic, one.wet[4], one.wet[1]], [true, 5, 6]);
  same('one season: of the six-month runs that hold all the rain (732 mm) the earliest starts in April', [one.wet[6], one.season.months, one.med.gsRain], [3, [3, 4, 5, 6, 7, 8], 732]);
  same('the whole year starts in January; wet[0] is never used', [one.wet[12], one.wet[0]], [0, NaN]);
  near('the dry April and May before the rains are a 61-day dry spell in the season', one.med.dryRun, 61);

  // Two rainy seasons (1 S): mm a day by month 1, 1, 5, 7, 5, 1, 0, 0, 1, 4, 5, 2.
  // Monthly: 31, 28.24, 155, 210, 155, 30, 0, 0, 30, 124, 150, 62.
  // Wettest three months: March to May, 520 mm (October to December is 336).
  // Wettest six months: December to May, 62 + 31 + 28.24 + 155 + 210 + 155 = 641.24 (November to April is 636.24).
  const RATE = [1, 1, 5, 7, 5, 1, 0, 0, 1, 4, 5, 2], two = computeClimate(record({ lat: -1, hi: () => 28, lo: () => 18, rain: d => RATE[d.m - 1] }));
  same('two seasons: the long rains start in March, the wettest six months in December', [two.wet[3], two.wet[6]], [2, 11]);
  same('two seasons: the growing season runs across New Year, December to May', two.season.months, [11, 0, 1, 2, 3, 4]);
  near('two seasons: a season without a leap day brings 62 + 31 + 28 + 155 + 210 + 155 = 641 mm', two.yearly.gsRain[0], 641);
  near('two seasons: the short rains are the wettest two months outside March to May: October and November follow at 274 mm, under March and April at 365', two.monthly.P[9] + two.monthly.P[10], 274);
  // July rain unread in every year: no run of twelve months can be added up.
  const holed = computeClimate(record({ lat: 12, rain: d => (d.m === 7 ? NaN : d.m >= 6 && d.m <= 9 ? 6 : 0) }));
  same('a run of months through an unread month is unknown, a run beside it is not', [holed.wet[12], holed.wet[1], holed.gaps.rain], [NaN, 7, [6]]);
});

// ---- 11. trends, by ordinary least squares
group('trends', () => {
  // Years 1 to 5 with 1, 2, 4, 4, 5: means 3 and 3.2; slope = 10 / 10 = 1; residuals −0.2, −0.2, 0.8, −0.2, −0.2, squares sum 0.8;
  // standard error = √(0.8 / 3 / 10) = 0.1633; t = 1 / 0.1633 = 6.124.
  const five = trend([1, 2, 3, 4, 5], [1, 2, 4, 4, 5]);
  near('five years: slope 1 a year', five.slope, 1); near('five years: t = 6.124', five.t, 6.1237, 1e-4);
  same('four years give no trend', trend([1, 2, 3, 4], [1, 2, 4, 4]), { slope: NaN, t: NaN, n: 4 });
  same('…and the words say so', trendWords(trend([1, 2, 3, 4], [1, 2, 4, 4]), 'mm'), 'Not enough data for a trend');
  same('an unread year is not a year: five years with one unknown give no trend', trend([1, 2, 3, 4, 5], [1, 2, NaN, 4, 5]).slope, NaN);
  // Through the climate: 2 mm a day (Feb 29 dry, so every year has 730 mm) plus an extra on 1 July of 0, 100, 300, 300, 400 mm.
  const EXTRA = [0, 100, 300, 300, 400], rainy = last => record({ last: `${last}1231`, rain: d => (d.m === 2 && d.d === 29 ? 0 : d.m === 7 && d.d === 1 ? 2 + (EXTRA[d.y - 2001] ?? 0) : 2) });
  const C5 = computeClimate(rainy(2005)), C4 = computeClimate(rainy(2004));
  same('yearly rain 730, 830, 1030, 1030, 1130 mm', C5.yearly.P.map(Math.round), [730, 830, 1030, 1030, 1130]);
  near('…rises by 100 mm a year', C5.trend.P.slope, 100, 1e-6); near('…with t = 6.124', C5.trend.P.t, 6.1237, 1e-4);
  same('…said per decade', trendWords(C5.trend.P, 'mm'), '+1,000 mm per decade · clear trend');
  same('the same record cut to four years: no trend is given', [C4.trend.P.n, C4.trend.P.slope, C4.trend.P.t, trendWords(C4.trend.P, 'mm')], [4, NaN, NaN, 'Not enough data for a trend']);
  same('a fall of 1.2 mm a year with t = −1.6', trendWords({ slope: -1.2, t: -1.6, n: 25 }, 'mm'), '−12 mm per decade · possible trend');
  same('t of 2.5 is clear, 1.49 is not', [trendWords({ slope: 0.06, t: 2.5, n: 25 }, '°C', 1), trendWords({ slope: 0.06, t: 1.49, n: 25 }, '°C', 1)], ['+0.6 °C per decade · clear trend', '+0.6 °C per decade · no clear trend']);
  same('a flat line', trendWords(computeClimate(record(PLAIN)).trend.T, '°C', 1), '0.0 °C per decade · no clear trend');
});

// ---- 12. winter chill
group('chill hours', () => {
  same('a day from 0 to 7.2 °C is 24 chill hours', chillHours(0, 7.2), 24);
  near('a day from −7.2 to 7.2 °C is above 0 for half of it: 12 hours', chillHours(-7.2, 7.2), 12);
  near('a day from 3.6 to 10.8 °C is under 7.2 for half of it: 12 hours', chillHours(3.6, 10.8), 12);
  same('a day from 8 to 22 °C has none, nor has a day from −5 to −1 °C', [chillHours(8, 22), chillHours(-5, -1)], [0, 0]);
  same('a steady 0 °C counts, a steady −0.1 °C does not', [chillHours(0, 0), chillHours(-0.1, -0.1)], [24, 0]);
  unknown('a day with no low has no chill hours', chillHours(NaN, 5));
  // North: 0 to 7.2 °C on every day of October to March, 10 to 20 °C otherwise: 182 days × 24 h = 4368 h (183 days in a leap year).
  const winter = d => d.m <= 3 || d.m >= 10, north = record({ hi: d => (winter(d) ? 7.2 : 20), lo: d => (winter(d) ? 0 : 10) });
  near('north: a normal winter half-year brings 182 × 24 = 4368 chill hours', computeClimate(north).chill, 4368, 1e-6);
  near('south: the cold half is April to September, 183 × 24 = 4392 hours', computeClimate(record({ lat: -35, hi: d => (winter(d) ? 20 : 7.2), lo: d => (winter(d) ? 10 : 0) })).chill, 4392, 1e-6);
  near('south: cold weather in October to March is not its winter: 0 hours', computeClimate({ ...north, lat: -35 }, -35).chill, 0);
  const jan = computeClimate(put(copy(north), TEMP, '20100101', '20100131', NaN));
  near('an unread January (151 of 182 winter days read) does not lower the year\'s chill: 151 days × 24 h, scaled to 182 days = 4368 (unread days as 0 hours would give 3624)', jan.yearly.chill[9], 4368, 1e-6);
});

// ---- 13. the coldest night, from one record and from two
group('coldest night', () => {
  // The coldest night of year y is −(y − 2000) °C on 15 January: −1 in 2001 down to −25 in 2025.
  // Middle year: −13. One-in-ten: a tenth of the way up the 25 sorted years is the third coldest, −23.
  const S = record({ lo: d => (d.m === 1 && d.d === 15 ? -(d.y - 2000) : 5) }), C = computeClimate(S);
  same('one record: the middle year −13, a cold one-in-ten year −23 (the third coldest of 25), and NASA alone is the cautious figure', [C.coldNight, C.coldNight10, C.coldLow, C.coldSecond], [-13, -23, -13, NaN]);
  const two = computeClimate(S, 44.4, { cold: { night: -19, night10: -25, years: 25 } });
  same('two records: the middle of −13 and −19 is −16; the colder, −19, is kept; NASA\'s own stays −13', [two.coldNight, two.coldLow, two.coldNasa, two.coldSecond], [-16, -19, -13, -19]);
  same('two records: the one-in-ten night is the middle of −23 and −25', two.coldNight10, -24);
  same('two records: the colder one-in-ten night is kept too', two.coldLow10, -25);
  const flat = computeClimate(record({ lo: d => (d.m === 1 && d.d === 15 ? -6 : 5) }), 44.4, { cold: { night: -12, night10: -14, years: 20 } });
  same('−6 and −12 give −9, and −12 is the cautious figure', [flat.coldNight, flat.coldLow], [-9, -12]);
  same('a second record that is warmer: the middle is used, NASA\'s colder night is kept', (c => [c.coldNight, c.coldLow])(computeClimate(S, 44.4, { cold: { night: -10, night10: -20, years: 25 } })), [-11.5, -13]);
  same('a second record of 7 years is left out', computeClimate(S, 44.4, { cold: { night: -19, night10: -25, years: 7 } }).coldNight, -13);
  same('a second record that did not answer is left out', [computeClimate(S, 44.4, { cold: { ok: false, reason: 'x' } }).coldNight, computeClimate(S, 44.4, { cold: null }).coldNight], [-13, -13]);
  same('a cold month mean under −3 °C makes a cold winter; a gap in the months leaves it unknown', [computeClimate(record({ hi: d => (d.m === 1 ? -2 : 20), lo: d => (d.m === 1 ? -10 : 10) })).coldWinter, C.coldWinter,
    computeClimate(record({ hi: d => (d.m === 1 ? NaN : 20), lo: () => 10 })).coldWinter], [true, false, null]);
});

// ---- 14. this year so far, against the same days of earlier years
group('this year so far', () => {
  // 29 February of 2028: 60 days since 1 January. 2 mm every day, but 10 mm on every 1 March.
  // Earlier years are held to the same number of days from 1 January: a year without a leap day runs to 1 March (59 × 2 + 10 = 128 mm),
  // a leap year to 29 February (120 mm). 21 plain years and 6 leap years: (21 × 128 + 6 × 120) / 27 = 126.22 mm.
  const leapDay = computeYTD(record({ last: '20280229', rain: d => (d.m === 3 && d.d === 1 ? 10 : 2) }));
  same('on 29 February: 60 days, 120 mm, 27 earlier years', [leapDay.year, leapDay.gpm.days, leapDay.gpm.total, leapDay.gpm.years, leapDay.gpm.through], [2028, 60, 120, 27, '2028-02-29']);
  near('…against 126.22 mm for the same number of days', leapDay.gpm.normal, 3408 / 27, 1e-6);
  near('…4.9% under', leapDay.gpm.pct, (120 / (3408 / 27) - 1) * 100, 1e-6);
  const newYear = computeYTD(record({ ...PLAIN, last: '20260101' }));
  same('on 1 January: one day, 2 mm against 2 mm', [newYear.gpm.days, newYear.gpm.total, Math.round(newYear.gpm.normal * 1e9) / 1e9, newYear.gpm.since], [1, 2, 2, dash('20260101')]);
  const nothing = computeYTD(record(PLAIN), { today: dash('20260101') });
  same('on 1 January before any reading of the new year: unknown, never 0 mm', [nothing.year, nothing.gpm.days, nothing.gpm.total, nothing.model.total, nothing.temp.mean], [2026, 0, NaN, NaN, NaN]);
  same('…and the words say so', rainSoFarWords(nothing), { status: 'Unknown', tone: 'Unknown', text: 'Too few rain readings so far in 2026 to compare with other years.' });

  // To 30 June of 2026 (181 days): 1 mm a day this year against 2 mm in every earlier year.
  const halfRain = computeYTD(record({ last: '20260630', rain: d => (d.y === 2026 ? 1 : 2) }));
  same('half the usual rain: 181 mm against 362 mm, 50% under', [halfRain.gpm.total, Math.round(halfRain.gpm.normal * 1e6) / 1e6, Math.round(halfRain.gpm.pct * 1e6) / 1e6, halfRain.agree], [181, 362, -50, true]);
  same('…in words: drier, a risk, and both sources named', rainSoFarWords(halfRain), { status: 'Drier', tone: 'Risk', text: "Normal by this date: 362 mm. You have 181 mm, GPM satellite rain through 30 Jun; NASA's weather model agrees (−50%)." });
  const gap9 = computeYTD(put(record({ ...PLAIN, last: '20260630' }), RAIN, '20260301', '20260309', NaN)), gap10 = computeYTD(put(record({ ...PLAIN, last: '20260630' }), RAIN, '20260301', '20260310', NaN));
  same('9 of 181 days unread (95.03% read): 172 days of 2 mm = 344 mm as read, against 344 mm for as many days: 0% off (unread days as dry days would say 5% under)', [gap9.gpm.total, gap9.gpm.read, Math.round(gap9.gpm.normal * 1e6) / 1e6, Math.round(gap9.gpm.pct * 1e6) / 1e6 + 0], [344, 172, 344, 0]);
  unknown('10 of 181 days unread (94.5% read): a gap, no figure', gap10.gpm.total);
  const apart = computeYTD(record({ last: '20260630', sat: d => (d.y === 2026 ? 3 : 2), rain: d => (d.y === 2026 ? 1 : 2) }));
  same('the satellites 50% over and the weather model 50% under: unclear, with both figures', rainSoFarWords(apart), { status: 'Unclear', tone: 'Unclear', text: "The satellite and NASA's weather model disagree. Check your own rain gauge. GPM satellite rain: 543 mm (+50%). NASA's weather model: 181 mm (−50%)." });
  const sized = computeYTD(record({ last: '20260630', sat: d => (d.y === 2026 ? 3 : 2), rain: d => (d.y === 2026 ? 2.3 : 2) }));
  same('50% over against 15% over: the same direction, not the same size; the middle, 32.5%, is wetter and a watch', [sized.agree, rainSoFarWords(sized)], [false, { status: 'Wetter', tone: 'Watch',
    text: 'Normal by this date: 362 mm. You have 543 mm, GPM satellite rain through 30 Jun. Both NASA sources agree on the direction but not the size. The newest GPM months are not yet gauge-corrected.' }]);
  const lone = computeYTD(record({ last: '20260630', sat: d => (d.y === 2026 ? 3 : 2), rain: d => (d.y === 2026 ? 2.02 : 2) }));
  same('50% over against 1% over: one says wetter, the other says normal: that is no agreement on the direction, so unclear', rainSoFarWords(lone).status, 'Unclear');
  const close = computeYTD(record({ last: '20260630', sat: d => (d.y === 2026 ? 2.6 : 2), rain: d => (d.y === 2026 ? 2.2 : 2) }));
  same('30% over against 10% over is 20 points apart: they agree', close.agree, true);
  const fresh = record({ ...PLAIN, last: '20260630' }); fresh.IMERG_FRESH = fresh.days.map(key => (key >= '20260601' ? 1 : 0));
  same('first estimates are named as first estimates, and only when there are some', [rainSoFarWords(computeYTD(fresh)).text.includes('(the newest weeks are a first estimate)'), rainSoFarWords(computeYTD(record({ ...PLAIN, last: '20260630' }))).text.includes('first estimate'), computeYTD(fresh).fresh], [true, false, 30]);

  const warm = computeYTD(record({ last: '20260630', hi: d => (d.y === 2026 ? 22 : 20), lo: d => (d.y === 2026 ? 12 : 10) }));
  same('a year 2 °C warmer so far: 17 °C against 15 °C', [warm.temp.mean, warm.temp.normalMean, warm.temp.diff].map(v => Math.round(v * 1e9) / 1e9), [17, 15, 2]);
  // Hot days: 14 days of 33 °C in June of 2026; 9 in June of every earlier year.
  const hotRec = record({ last: '20260630', hi: d => (d.m === 6 && d.d <= (d.y === 2026 ? 14 : 9) ? 33 : 25), lo: () => 15 }), hotY = computeYTD(hotRec);
  same('hot days so far: 14, normal by now 9', [hotY.hot.total, Math.round(hotY.hot.normal * 1e9) / 1e9], [14, 9]);
  same('…in words', hotWords(computeClimate(hotRec, 44.4, { today: dash('20260701') }), hotY).text, 'Heat stress is rare here. So far in 2026: 14 (normal by now 9).');
  const soil = computeYTD(record({ last: '20260630', gw: d => (d.y === 2026 ? 0.61 : 0.66) }));
  same('soil wetness of the last 30 days: 61% against 66% for the same weeks, drier than usual', [soilWords(soil), soil.soil.since, soil.soil.days], [{ chip: 'Drier than usual', text: 'Root-zone wetness, last 30 days: 61% of saturation. Normal for these weeks: 66%.' }, dash('20260601'), 30]);
  same('4 points apart is not yet "drier"', soilWords(computeYTD(record({ last: '20260630', gw: d => (d.y === 2026 ? 0.62 : 0.66) }))).chip, '');

  const backup = computeYTD(record({ source: 'era5', last: '20260630', rain: d => (d.y === 2026 ? 1 : 2), sat: () => NaN, gw: () => NaN, et: () => NaN }));
  same('the back-up record has no satellite rain: its own rain is named for what it is', [backup.gpm, backup.agree, rainSoFarWords(backup).text, soilWords(backup).text], [null, null, 'Normal by this date: 362 mm. You have 181 mm, rain from the back-up weather record through 30 Jun.', 'Root-zone wetness has not been read for the last 30 days.']);
  const young = last => computeYTD(record({ ...PLAIN, first: `${last}0101`, last: '20260630' })).gpm;
  same('four earlier years are not a normal; five are', [young(2022).years, young(2022).normal, young(2021).years, Math.round(young(2021).normal * 1e6) / 1e6], [4, NaN, 5, 362]);
});

// ---- 15. which rain record, which years
group('rain record and years', () => {
  // The satellites read 3 mm a day, the weather model 2 mm.
  const both = computeClimate(record({ rain: () => 2, sat: () => 3 }));
  near('satellite rain is used first: January 31 × 3 = 93 mm', both.monthly.P[0], 93);
  const thin = computeClimate(record({ rain: () => 2, sat: d => (d.y <= 2003 ? NaN : 3) }));
  same('satellite rain on 88% of days (2001 to 2003 unread): the weather model is used for the whole record, never a mix: 62 mm', [thin.imerg, thin.rainSource, Math.round(thin.monthly.P[0] * 1e9) / 1e9, thin.years.length], [false, 'merra2', 62, 25]);
  const year1 = computeClimate(record({ rain: () => 2, sat: d => (d.y === 2001 ? NaN : 3) }));
  same('satellite rain on 96% of days (2001 unread): still the satellites, and 2001 is a gap, not patched from the model', [year1.imerg, year1.years.length, year1.years[0], Math.round(year1.monthly.P[0] * 1e9) / 1e9], [true, 24, 2002, 93]);

  const running = record({ last: '20260630', rain: d => (d.y === 2026 ? 50 : 2), hi: d => (d.y === 2026 ? 40 : 20) });
  same('the running year is shown apart: it changes no normal', [computeClimate(running, 44.4, { today: dash('20260701') }).med.P, computeClimate(running, 44.4, { today: dash('20260701') }).years.at(-1), computeClimate(running, 44.4, { today: dash('20260701') }).med.heat32], [730, 2025, 0]);
  same('today may be written with or without dashes', isDeepStrictEqual(computeClimate(running, 44.4, { today: dash('20260701') }), computeClimate(running, 44.4, { today: '20260701' })), true);
  throws('today must be a whole date', () => computeClimate(running, 44.4, { today: '2026-07' }), "Today's date");
  same('a record that starts on 1 July of 2010: that half year does not count, 15 years do', computeClimate(record({ ...PLAIN, first: '20100701' })).years, range(2011, 2025));
  const holed = computeClimate(drop(record(PLAIN), '20150101', '20151231'));
  same('a year left out of the record altogether is a gap: 24 years, and the normal is unchanged', [holed.years.length, holed.years.includes(2015), holed.med.P], [24, false, 730]);
  throws('a place with no latitude is refused', () => computeClimate({ ...record(PLAIN), lat: undefined }), 'latitude');
});

// ---- 16. what-ifs
group('what-ifs', () => {
  // A year that swings between −7 °C and +21 °C by night, coldest in mid January.
  const wave = record({ hi: d => 17 - 14 * Math.cos(2 * Math.PI * (d.doy - 15) / 365), lo: d => 7 - 14 * Math.cos(2 * Math.PI * (d.doy - 15) / 365), rain: () => 2 }), before = copy(wave);
  const base = computeClimate(wave), warmer = computeClimate(applyScenario(wave, { tempC: 2 })), colder = computeClimate(applyScenario(wave, { tempC: -2 }));
  check('2 °C warmer lengthens the frost-free season, 2 °C colder shortens it', warmer.med.frostFree > base.med.frostFree && base.med.frostFree > colder.med.frostFree, `${colder.med.frostFree} < ${base.med.frostFree} < ${warmer.med.frostFree}`);
  near('2 °C warmer moves every monthly mean by 2 °C', warmer.monthly.tmean[6] - base.monthly.tmean[6], 2);
  near('a fifth less rain: January 62 × 0.8 = 49.6 mm', computeClimate(applyScenario(wave, { rainPct: -20 })).monthly.P[0], 49.6);
  same('a what-if leaves the record it was given untouched', wave, before);
  const what = applyScenario({ ...record({ last: '20010110', gw: () => 0.5, et: () => 1 }), cold: { night: -9, night10: -14, years: 20 } }, { rainPct: -40, tempC: 4 });
  near('soil wetness: 0.5 × (1 − 0.24 − 0.12) = 0.32', what.GWETROOT[0], 0.32); near('water lost: 1 × (1 + 0.04 × 4) = 1.16 mm', what.EVLAND[0], 1.16);
  same('the second cold record moves with the temperatures: −9 + 4 = −5', [what.cold.night, what.cold.night10], [-5, -10]);
  const named = record({ last: '20010110', rain: () => 2 }); named.rain = named.IMERG_PRECTOT;
  same('a record that also names its rain record in use keeps that name on the changed rain', (out => [out.rain === out.IMERG_PRECTOT, out.rain[0]])(applyScenario(named, { rainPct: -50 })), [true, 1]);
  near('very dry soil is held at 0.02', applyScenario(record({ last: '20010110', gw: () => 0.02 }), { rainPct: -40, tempC: 4 }).GWETROOT[0], 0.02);
  const monthly = applyScenario(record({ last: '20011231', rain: () => 2 }), { tempC: 1, months: { dTx: Array(12).fill(0).map((_, m) => (m === 6 ? 3 : 0)), dTn: Array(12).fill(0), r: Array(12).fill(1).map((_, m) => (m === 6 ? 0.5 : m === 7 ? NaN : 1)) } });
  same('month-by-month changes with the plain shift on top: July highs 20 + 1 + 3, July rain halved, a month with no change given is unknown', [monthly.T2M_MAX[181], monthly.T2M_MAX[0], monthly.PRECTOTCORR[181], monthly.PRECTOTCORR[212]], [24, 21, 1, NaN]);
  unknown('an unread day stays unread through a what-if', applyScenario(put(record({ last: '20010110' }), ['T2M_MAX'], '20010105', '20010105', NaN), { tempC: 2 }).T2M_MAX[4]);
});

// ---- 17. the same record gives the same answer; every number is real or an unknown on purpose; no sentence leaks one
const AWKWARD = [
  ['plain', record(PLAIN), {}],
  ['a May gap', (S => { for (const y of range(2001, 2013)) put(S, [...TEMP, ...RAIN], `${y}0501`, `${y}0531`, NaN); return S; })(record(PLAIN)), {}],
  ['the back-up record', record({ source: 'era5', last: '20260630', rain: d => (d.y === 2026 ? 1 : 2), sat: () => NaN, gw: () => NaN, et: () => NaN }), { today: dash('20260701') }],
  ['polar', record({ lat: 78, hi: () => -2, lo: () => -10 }), {}],
  ['the south', record({ lat: -35, last: '20260228', hi: d => (between(d, 601, 831) ? 6 : 18), lo: d => (between(d, 601, 831) ? -4 : 8), rain: d => (d.m === 1 ? 0 : 3) }), { today: dash('20260301') }],
  ['the tropics with an unread July', record({ lat: 12, hi: () => 33, lo: () => 22, rain: d => (d.m === 7 ? NaN : d.m >= 6 && d.m <= 9 ? 6 : 0) }), {}],
  ['four years', record({ ...PLAIN, first: '20220101', last: '20260415' }), { today: dash('20260416') }],
  ['no soil, no evaporation, a desert', record({ rain: () => 0, gw: () => NaN, et: () => NaN, hi: () => 44, lo: () => 28 }), {}],
];
group('same in, same out', () => {
  for (const [name, S, opts] of AWKWARD) {
    const before = copy(S), run = () => [computeClimate(S, S.lat, opts), computeFrost(S, S.lat, opts), computeYTD(S, opts), computeGDD(S, S.lat, opts)], first = run(), again = run();
    same(`${name}: twice the same record, twice the same answer`, first, again);
    same(`${name}: the record itself is left untouched`, S, before);
    same(`${name}: every number is finite, or an unknown where an unknown is allowed`, faults(first[0]), []);
    same(`${name}: no sentence holds a leaked unknown or the word "forecast"`, everyText(S, S.lat, opts).filter(text => BAD_WORDS.test(text)), []);
  }
  const C = computeClimate(record(PLAIN));
  same('the fields that must always be numbers are numbers', [C.lat, C.y0, C.y1, C.dryOf, C.coldNight, C.coldNight10, C.coldNasa, C.coldLow, C.med.frostFree, C.trend.P.n].every(Number.isFinite), true);
  same('the words for nothing at all are plain sentences too', [frostWords(null), hotWords(null).text, heavyWords(null), drySpellWords(null), dryYearsWords(null), rainSoFarWords(null).text, soilWords(null).text, warmthWords(null).text, trendWords(null, 'mm'), gapWords(null), gapWords([])].filter(text => BAD_WORDS.test(text)), []);
  same('two gap months are both named', gapWords([4, 5]), 'the weather record has no readings for May and June');
  same('dates are written the short way', [dateWord(111), dateWord(1), dateWord(365), dateWord(120.5)], ['Apr 21', 'Jan 1', 'Dec 31', 'May 1']);
  same('a date nobody knows (a place with no usual frost) is said to be unknown, never written as a made-up day', [dateWord(NaN), dateWord(undefined), dateWord(0)], ['an unknown day', 'an unknown day', 'an unknown day']);
});

// ---- 18. property checks over seeded random records (no Math.random: the same records on every run)
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randomRecord(seed, first = '20180101', last = '20260630') {   // a seasonal swing with weather on top, random rain, and a few unread days
  const rnd = seeded(seed), lat = Math.round((rnd() * 125 - 60) * 10) / 10, mean = 28 - Math.abs(lat) * 0.45 + rnd() * 6 - 3, swing = Math.abs(lat) * 0.3 * (0.5 + rnd()), wetness = 0.15 + rnd() * 0.5, gapShare = rnd() < 0.5 ? 0 : 0.03;
  const miss = v => (rnd() < gapShare ? NaN : v), cold = lat < 0 ? 196 : 15;
  return record({ first, last, lat,
    hi: d => miss(Math.round((mean + 5 - swing * Math.cos(2 * Math.PI * (d.doy - cold) / 365) + rnd() * 8 - 4) * 10) / 10),
    lo: d => miss(Math.round((mean - 5 - swing * Math.cos(2 * Math.PI * (d.doy - cold) / 365) + rnd() * 8 - 4) * 10) / 10),
    rain: () => miss(rnd() < wetness ? Math.round(-Math.log(1 - rnd()) * 90) / 10 : 0), gw: () => miss(Math.round((0.25 + rnd() * 0.5) * 100) / 100) });
}
const RUNS = 300, TODAY = { today: dash('20260701') };
const pairs = (a, b, visit, path = '') => { if (typeof a === 'number') visit(a, b, path); else if (a && typeof a === 'object') for (const k of Object.keys(a)) pairs(a[k], b?.[k], visit, `${path}.${k}`); };
// Every number under `parts` of two climates, compared one by one. An unknown must stay an unknown on both sides.
function broken(A, B, parts, holds) {
  const out = [];
  for (const part of parts) pairs(part(A), part(B), (a, b, path) => { if (Number.isNaN(a) !== Number.isNaN(b) || (Number.isFinite(a) && !holds(a, b))) out.push(`${path}: ${a} → ${b}`); });
  return out;
}
group('property checks', () => {
  const heatUp = [], frostDown = [], freeUp = [], unitsUp = [], rainDown = [], spellsUp = [], counted = { frost: 0, heat: 0, rain: 0, gaps: 0 };
  const EPS = 1e-9;
  for (let seed = 1; seed <= RUNS; seed++) {
    const S = randomRecord(seed), C = computeClimate(S, S.lat, TODAY), hot = applyScenario(S, { tempC: 2 }), CH = computeClimate(hot, S.lat, TODAY), CD = computeClimate(applyScenario(S, { rainPct: -20 }), S.lat, TODAY);
    counted.frost += C.monthly.frostByMonth.some(v => v > 0); counted.heat += C.med.heat32 > 0; counted.rain += C.med.P > 0; counted.gaps += S.T2M_MAX.some(Number.isNaN);
    const tag = list => list.slice(0, 2).map(line => `seed ${seed} ${line}`);
    heatUp.push(...tag(broken(C, CH, [c => c.monthly.heatByMonth, c => c.yearly.heat32, c => c.yearly.heat35, c => c.med.heat32], (a, b) => b >= a - EPS)));
    frostDown.push(...tag(broken(C, CH, [c => c.monthly.frostByMonth], (a, b) => b <= a + EPS)));
    freeUp.push(...tag(broken(C, CH, [c => c.yearly.frostFree, c => c.med.frostFree], (a, b) => b >= a - EPS)));
    const G = computeGDD(S, S.lat, TODAY), GH = computeGDD(hot, S.lat, TODAY), Y = computeYTD(S, TODAY), YH = computeYTD(hot, TODAY);
    unitsUp.push(...tag(broken({ g: G.total, n: G.normal, h: Y.hot.total }, { g: GH.total, n: GH.normal, h: YH.hot.total }, [c => c], (a, b) => b >= a - 1e-6)));
    rainDown.push(...tag(broken(C, CD, [c => c.monthly.P, c => c.yearly.P, c => c.yearly.gsRain, c => c.med.P, c => c.med.gsRain, c => c.yearly.heavy, c => c.yearly.maxDay, c => c.monthly.heavy], (a, b) => b <= a + EPS)));
    spellsUp.push(...tag(broken(C, CD, [c => c.yearly.dryRun], (a, b) => b >= a)));
  }
  same(`${RUNS} random records: 2 °C warmer never lowers a hot-day count`, heatUp.slice(0, 3), []);
  same(`${RUNS} random records: 2 °C warmer never raises the frost nights of a month`, frostDown.slice(0, 3), []);
  same(`${RUNS} random records: 2 °C warmer never shortens a frost-free season`, freeUp.slice(0, 3), []);
  same(`${RUNS} random records: 2 °C warmer never lowers the heat units or the hot days so far`, unitsUp.slice(0, 3), []);
  same(`${RUNS} random records: rain × 0.8 never raises a rain total, a heavy-day count or the wettest day`, rainDown.slice(0, 3), []);
  same(`${RUNS} random records: rain × 0.8 never shortens a dry spell`, spellsUp.slice(0, 3), []);
  check('the random records are not all alike: many have frost, many have hot days, all have rain, about half have unread days', counted.frost >= 60 && counted.heat >= 60 && counted.rain === RUNS && counted.gaps >= 100 && counted.gaps <= 200, show(counted));

  // One year of weather repeated: 4 years (2022 to 2025), then 8, then 12. Each set holds one leap year in four, so no average may move.
  const more = [];
  for (let seed = 1; seed <= 100; seed++) {
    const year = randomRecord(seed * 7 + 1000, '20230101', '20231231'), lat = year.lat, pick = (name, d) => year[name][d.m === 2 && d.d === 29 ? 58 : d.doy - (LEAP(d.y) && d.doy > 59 ? 1 : 0) - 1];   // 29 February repeats the 28th
    const fill = v => (Number.isFinite(v) ? v : 5), repeat = first => record({ first: `${first}0101`, last: '20251231', lat, hi: d => fill(pick('T2M_MAX', d)), lo: d => fill(pick('T2M_MIN', d)), rain: d => fill(pick('PRECTOTCORR', d)), gw: () => 0.5 });
    const [four, eight, twelve] = [2022, 2018, 2014].map(first => computeClimate(repeat(first), lat));
    for (const longer of [eight, twelve]) more.push(...broken(four, longer, [c => c.monthly, c => c.med, c => c.wet, c => [c.coldNight, c.chill]], (a, b) => Math.abs(a - b) <= 1e-6).slice(0, 2).map(line => `seed ${seed} ${line}`));
  }
  same('100 random years: adding more years of the very same weather changes no average, no middle year and no wet window', more.slice(0, 3), []);
});

// ---- 19. the joint with the weather module, on recorded answers
// Every expected figure is worked out here from the raw answer by the plainest sum, never taken from the module under test.
group('a recorded NASA answer', () => {
  const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures'), load = name => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
  const answer = load('power_iowa.json'), raw = answer.properties.parameter, fill = answer.header.fill_value, keys = Object.keys(raw.T2M_MAX).sort(), today = answer._recorded.date;
  const val = (name, key) => { const v = raw[name][key]; return typeof v === 'number' && v !== fill ? v : NaN; }, of = year => keys.filter(key => key.startsWith(String(year)));
  const total = list => list.reduce((s, v) => s + v, 0), middle = list => [...list].sort((a, b) => a - b)[(list.length - 1) / 2];
  const [lon, lat] = answer.geometry.coordinates, S = buildSeries(answer, { lat, lon }), C = computeClimate(S, lat, { today }), YEARS = range(2001, 2025);
  same('the record the weather module builds is one this module reads: 25 full years, 2001 to 2025', C.years, YEARS);
  same('both modules name the same rain record and the same last day', [C.rainSource, C.imerg, C.through], [S.rainSource, S.rainSource === 'imerg', S.through]);
  const rainOf = year => total(of(year).map(key => val('IMERG_PRECTOT', key)));
  near('the rain of 2012 is the plain sum of its 366 satellite readings', C.yearly.P[yearAt(C, 2012)], rainOf(2012), 1e-6);
  near('the usual yearly rain is the middle one of the 25 plain yearly sums', C.med.P, middle(YEARS.map(rainOf)), 1e-6);
  same('the hot days of 2012 are the days whose high reached 32 °C', C.yearly.heat32[yearAt(C, 2012)], of(2012).filter(key => val('T2M_MAX', key) >= 32).length);
  const nights = month => keys.filter(key => key < '2026' && key.slice(4, 6) === month);
  near('January frost nights in a normal year: all the January nights under 0 °C, divided by 25 years', C.monthly.frostByMonth[0], nights('01').filter(key => val('T2M_MIN', key) < 0).length / 25);
  const april = nights('04');
  check('April in central Iowa: the mean low is above freezing, yet frost nights are counted, night by night', C.monthly.tmin[3] > 0 && C.monthly.frostByMonth[3] >= 3 && Math.abs(C.monthly.frostByMonth[3] - april.filter(key => val('T2M_MIN', key) < 0).length / 25) < 1e-9, `mean low ${C.monthly.tmin[3]}, frost nights ${C.monthly.frostByMonth[3]}`);
  near('the July mean is the mean of every July day\'s high and low', C.monthly.tmean[6], total(nights('07').map(key => (val('T2M_MAX', key) + val('T2M_MIN', key)) / 2)) / nights('07').length);
  near('the coldest night of a normal year is the middle one of the 25 yearly lows', C.coldNasa, middle(YEARS.map(year => Math.min(...of(year).map(key => val('T2M_MIN', key))))));
  const lastSat = keys.filter(key => Number.isFinite(val('IMERG_PRECTOT', key))).at(-1), Y = computeYTD(S, { today });
  same('rain so far ends on the last day the satellites read, and is the plain sum up to it', [Y.gpm.through, Math.round(Y.gpm.total * 1e6) / 1e6], [dash(lastSat), Math.round(total(of(today.slice(0, 4)).filter(key => key <= lastSat).map(key => val('IMERG_PRECTOT', key))) * 1e6) / 1e6]);
  const cold = coldFromDaily(load('era5land_iowa.json')), two = computeClimate(S, lat, { today, cold });
  same('the second record of the coldest night, as the weather module reads it, is used: the middle of the two, the colder kept', [cold.years >= 8, two.coldNight, two.coldLow, two.coldSecond], [true, (C.coldNasa + cold.night) / 2, Math.min(C.coldNasa, cold.night), cold.night]);
  const konya = load('power_konya.json'), SK = buildSeries(konya, { lat: konya.geometry.coordinates[1], lon: konya.geometry.coordinates[0] }), hill = fitHeight(SK, SK.cellElev + 500);
  const low = computeClimate(SK, SK.lat, { today }), high = computeClimate(hill, SK.lat, { today });
  // A field 500 m above the weather square is 500 × 0.0065 = 3.25 °C cooler; its rain is the square's rain.
  same('a field 500 m higher: every monthly mean 3.25 °C cooler, the rain untouched, never fewer frost nights', [low.monthly.tmean.map((v, m) => Math.round((high.monthly.tmean[m] - v) * 1e6) / 1e6), high.monthly.P, high.monthly.frostByMonth.every((v, m) => v >= low.monthly.frostByMonth[m])], [Array(12).fill(-3.25), low.monthly.P, true]);
  same('the real records leave nothing unknown that should be known, and no sentence leaks', [faults(C), faults(high), everyText(S, lat, { today }).filter(text => BAD_WORDS.test(text))], [[], [], []]);
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
