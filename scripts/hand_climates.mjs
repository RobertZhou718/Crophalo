// Hand-made daily weather records for the engine suites: each place is 2001 to 2026 of days built from twelve monthly highs, lows
// and rain totals, run through js/climate.js exactly like a NASA POWER record. The monthly figures are rounded climate normals of
// the kind of place named, written by hand for the tests; they are test inputs, never shown to a farmer.
// Also reads the recorded NASA POWER answers for Barrie and for Oxford County, Ontario (scripts/fixtures/; no network). Used and checked by scripts/test_engine.mjs and scripts/test_season.mjs.
import fs from 'node:fs';
import { buildSeries, fitHeight, coldFromDaily } from '../js/data.js';
import { computeClimate } from '../js/climate.js';

export const TODAY = '2026-11-14';
const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// spread: how far a day's high and low swing around the monthly figure (a fixed wave, so counts of hot days and frost nights vary)
export function makeSeries({ lat, tmax, tmin, rain, spread = 4, gaps = [] }) {
  const S = { lat, lon: 0, source: 'power', days: [], T2M_MAX: [], T2M_MIN: [], PRECTOTCORR: [], IMERG_PRECTOT: [], GWETROOT: [], EVLAND: [] };
  let n = 0;
  for (let y = 2001; y <= 2026; y++) for (let m = 0; m < 12; m++) {
    const days = m === 1 && leap(y) ? 29 : MD[m];
    for (let d = 1; d <= days; d++) {
      if (y === 2026 && (m > 10 || (m === 10 && d > 12))) continue;
      const wave = spread * Math.sin(n * 2.399), wet = n % 3 === 0, gap = gaps.includes(m);
      S.days.push(`${y}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`);
      S.T2M_MAX.push(gap ? NaN : tmax[m] + wave); S.T2M_MIN.push(gap ? NaN : tmin[m] + wave * 0.8);
      const r = wet ? rain[m] / days * 3 : 0;
      S.PRECTOTCORR.push(r); S.IMERG_PRECTOT.push(r); S.GWETROOT.push(0.5); S.EVLAND.push(2);
      n++;
    }
  }
  return S;
}
export const climateOf = spec => computeClimate(makeSeries(spec), spec.lat, { today: TODAY });

export const PLACES = {
  arctic: { lat: 70, tmax: [-4, -4, -2, 1, 5, 9, 12, 12, 8, 4, 0, -2], tmin: [-9, -9, -7, -4, 0, 4, 7, 7, 4, 0, -4, -7], rain: [80, 70, 60, 50, 40, 50, 60, 70, 90, 100, 90, 80] },   // a cool, wet Arctic coast
  humidTropic: { lat: 5, tmax: [31, 31, 32, 32, 31, 30, 30, 30, 30, 31, 31, 31], tmin: [23, 23, 23, 24, 24, 23, 23, 23, 23, 23, 23, 23], rain: [150, 120, 180, 250, 300, 280, 250, 250, 260, 280, 260, 200] },   // a lowland rainforest coast
  yukon: { lat: 62, tmax: [-14, -10, -2, 7, 15, 21, 22, 19, 12, 3, -8, -12], tmin: [-24, -21, -14, -5, 2, 7, 9, 7, 2, -5, -16, -21], rain: [15, 12, 10, 8, 20, 35, 45, 40, 30, 22, 18, 15] },   // a dry subarctic valley
  longSummer: { lat: 36, tmax: [12, 14, 18, 23, 28, 32, 34, 33, 29, 24, 17, 13], tmin: [1, 2, 5, 9, 14, 19, 21, 20, 16, 10, 5, 2], rain: [90, 90, 110, 110, 120, 100, 110, 100, 90, 80, 90, 95], spread: 3 },   // a humid warm-temperate plain
  hotValley: { lat: 36.7, tmax: [13, 17, 21, 25, 30, 35, 38, 37, 33, 27, 19, 13], tmin: [3, 5, 7, 9, 13, 16, 19, 18, 15, 11, 6, 3], rain: [55, 50, 45, 20, 8, 3, 1, 1, 5, 15, 30, 45], spread: 3 },   // a hot, dry inland valley
};
export function barrie() {
  const answer = JSON.parse(fs.readFileSync(new URL('./fixtures/power_barrie.json', import.meta.url), 'utf8'));
  const S = buildSeries(answer, { lat: 44.4, lon: -79.78 });
  return { C: computeClimate(S, S.lat, { today: TODAY }), recorded: answer._recorded?.date ?? null };
}
// A demo field recorded with scripts/record_demo.mjs: the NASA POWER answer, the field's own height (js/data.js height rule) and,
// when it was recorded, the ERA5-Land coldest-night record. A file that was not recorded is said so (cold: null, field: NaN), never filled in.
const readFixture = file => { try { return JSON.parse(fs.readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8')); } catch { return null; } };
export function recordedField(name, place) {
  const answer = readFixture(`power_${name}.json`), second = readFixture(`era5land_${name}.json`), height = readFixture(`height_${name}.json`);
  const S0 = buildSeries(answer, place), field = height?.results?.[0]?.elevation ?? NaN;
  const S = fitHeight(S0, field), cold = second ? coldFromDaily(second) : null;
  return { C: computeClimate(S, S.lat, { today: TODAY, cold }), S, field, cellElev: S0.cellElev, dz: S.dz || 0, cold, recorded: { power: answer?._recorded?.date ?? null, era5land: second?._recorded?.date ?? null, height: height?._recorded?.date ?? null } };
}
export const oxford = () => recordedField('oxford', { lat: 43.13, lon: -80.75 });
