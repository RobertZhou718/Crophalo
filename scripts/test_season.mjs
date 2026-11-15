// Crophalo's offline suite for the sowing rules of js/season.js at their edges: FAO-56 rows, the spring start, the cold-winter sowing window, the turn from one
// crop to the next, heat at flowering, corn heat units, a second crop, gap months and hostile ids.
// Run: node scripts/test_season.mjs (no network). The last line is "N passed, M failed".
import * as SE from '../js/season.js';
import { shifted } from '../js/sure.js';
import { PLACES, climateOf, makeSeries, barrie } from './hand_climates.mjs';
import { computeClimate } from '../js/climate.js';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ''}`); } };
const same = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const fin = Number.isFinite;

// ---- the FAO-56 rows
same('soybeans offer 85 and 140 days: the 150-day row is within 10 days of the middle row', SE.lengthsOf('soy').map(r => r.total), [85, 140]);
same('spring cereals offer 135 and 150, not 130 and 135', SE.lengthsOf('barley').map(r => r.total), [135, 150]);
same('the usual corn row is FAO\'s middle row, 150 days', SE.usualOf('corn').total, 150);
same('winter wheat has the three autumn rows', SE.lengthsOf('wheat', 'au').map(r => r.total), [120, 180, 240]);
same('a crop FAO-56 does not list is estimated on its own season length', [SE.lengthsOf('chickpea')[0].estimated, SE.lengthsOf('chickpea')[0].total], [true, 120]);
same('an id that is not a crop has no rows', [SE.lengthsOf('toString'), SE.lengthsOf('__proto__'), SE.lengthsOf('constructor')], [[], [], []]);
same('the flowering line: Luo 2011 for corn, the heat limit plus 3 °C under 35 °C for peas', [SE.flowerLine('corn'), SE.flowerLine('pea'), SE.flowerLine('sunflower')], [35, 31, 40]);

// ---- dates
same('a day of the normal year keeps its date in a leap year', [SE.isoOf(2028, 303), SE.isoOf(2027, 303), SE.isoOf(2028, 365 + 196)], ['2028-10-30', '2027-10-30', '2029-07-15']);
same('a date back to its day of the year', SE.doyOfIso('2028-10-30'), { year: 2028, doy: 303 });
same('no date from nothing', [SE.isoOf(2028, NaN), SE.doyOfIso('soon'), SE.dayWord(NaN)], [null, null, 'an unknown day']);
same('rough words: early, mid, late', [SE.roughWord(5), SE.roughWord(15), SE.roughWord(25)], ['early January', 'mid January', 'late January']);

// ---- Barrie, Ontario, on the recorded NASA POWER answer
const { C } = barrie(), Y = SE.normalYear(C);
const corn = SE.cropTiming('corn', C), soy = SE.cropTiming('soy', C), wheat = SE.cropTiming('wheat', C);
ok('corn is sown after the usual last spring frost', corn.sow > C.med.frostLast, `${corn.sow} vs ${C.med.frostLast}`);
ok('corn is sown on the first day the normal mean reaches 13 °C after that frost', Y.tmean(corn.sow) >= 13 && (Y.tmean(corn.sow - 1) < 13 || corn.sow - 1 <= C.med.frostLast));
ok('soybeans are sown when the normal mean reaches their own 14 °C', Y.tmean(soy.sow) >= 14 && Y.tmean(soy.sow - 1) < 14);
same('soybeans take the usual 140-day row', [soy.len, soy.harvest - soy.sow], ['m', 140]);
same('Barrie has a cold winter, so winter wheat keeps its calendar', wheat.kind, 'winter');
same('the wheat window opens on the crop table\'s sowing month, 1 October', SE.dayWord(wheat.window.earliest), 'Oct 1');
ok('the wheat window closes 20 FAO days before the normal mean drops under 3 °C', wheat.window.latest === wheat.window.cold - 20 && Y.tmean(wheat.window.cold) < 3 && Y.tmean(wheat.window.cold - 1) >= 3);
// The cold closes the window, not the first autumn frost: winter wheat comes up through autumn frosts (OMAFRA: leaves that have not
// hardened off still take −9 °C). Read as the Ontario weather stations record it, Barrie's first frost (about Oct 19) comes before the
// last good sowing day (about Oct 30); with NASA's own, later date (Oct 31) it came after.
ok('the window is set by warmth alone: its last day leaves the 20 FAO days before the cold, even when the first autumn frost comes earlier', wheat.window.latest + wheat.window.init === wheat.window.cold && C.med.frostFirst < wheat.window.latest, `${SE.dayWord(wheat.window.latest)} vs ${SE.dayWord(C.med.frostFirst)}`);
same('winter wheat is ready in the middle of July of the next year', SE.dayWord(wheat.harvest), 'Jul 15');
ok('winter wheat grows again in spring when the normal mean is back at 3 °C', wheat.wake > 365 && Y.tmean(wheat.wake) >= 3 && Y.tmean(wheat.wake - 1) < 3);
ok('winter wheat flowers in early summer, not in the winter', wheat.flower > 365 + 120 && wheat.flower < 365 + 196);
same('its first stage keeps FAO\'s 20 days', wheat.stages[0], 20);
ok('the stages add up from sowing to harvest', wheat.stages.reduce((a, b) => a + b, 0) === wheat.harvest - wheat.sow);
ok('corn heat units are counted to the first frost and a short summer gives the NCH-40 sentence', fin(corn.units) && corn.units < 1333 && corn.remarks.some(r => /National Corn Handbook NCH-40/.test(r)));
ok('the timing words are plain', /^Winter wheat: sow from Oct 1 to about Oct \d+ · ready about mid July\.$/.test(SE.timingWords(wheat)), SE.timingWords(wheat));

// ---- the turn from soybeans to winter wheat
const f = SE.followOn('wheat', 'soy', C);
ok('winter wheat follows soybeans: a following crop, not a second crop', f.follow === true && f.ok === true);
same('the room is the last good day less the soybean harvest and one week', f.next.room, wheat.window.latest - (soy.harvest + SE.TURN));
ok('under 14 spare days the turn is tight', f.tight === (f.next.room < SE.TIGHT));
same('with room the wheat is sown a week after the soybean harvest', f.next.sow, Math.max(wheat.window.earliest, soy.harvest + SE.TURN));
const later = SE.followOn('wheat', 'soy', C, { prev: { sow: soy.sow + 20 } });
ok('a soybean crop sown 20 days later has no room with the usual variety', later.usualNext.room < 0);
ok('then a shorter soybean row is tried, and the words name the reason when none fits', later.ok ? later.shortened && later.prev.total < 140 : /past the last good sowing day/.test(later.words));
const colder = SE.followOn('wheat', 'soy', shifted(C, -2, 1, 'colder'));
ok('2 °C colder: the window closes sooner', SE.cropTiming('wheat', shifted(C, -2, 1, 'colder')).window.latest < wheat.window.latest);
ok('2 °C colder: the usual soybeans leave no room, so a shorter variety or a refusal follows', colder.usualNext.room < 0 && (colder.shortened || !colder.ok));
ok('a spring crop after a winter crop needs no turn check', SE.followOn('corn', 'wheat', C).follow === false);

// ---- a second crop in the same year
const sc = SE.secondFit('corn', 'soy', C);
ok('soybeans after corn in Barrie: no time before the first autumn frost, with the reason', !sc.ok && sc.why === 'window' && /^Soybeans after the corn: only about \d+ days are free/.test(sc.words), sc.words);
ok('winter wheat is never a second crop where winters are cold', SE.secondFit('soy', 'wheat', C).why === 'winter');
ok('after fallow: no second crop', SE.secondFit('fallow', 'soy', C).why === 'fallow');
const warm = climateOf(PLACES.longSummer), w2 = SE.secondFit('barley', 'soy', warm);
ok('soybeans after autumn-sown barley in a long warm season fit, with dates', w2.ok && fin(w2.sow) && fin(w2.harvest), w2.words);

// ---- heat at flowering
const furnace = climateOf({ lat: 30, tmax: [30, 32, 36, 40, 43, 45, 45, 45, 43, 40, 34, 30], tmin: [14, 16, 20, 24, 28, 30, 31, 31, 28, 24, 18, 14], rain: [10, 10, 10, 5, 5, 5, 5, 5, 5, 5, 10, 10], spread: 2 });
const hotCorn = SE.cropTiming('corn', furnace);
ok('where every summer day is 40 °C or more, corn fails at flowering, whatever the sowing date', !hotCorn.ok && ['flower', 'season'].includes(hotCorn.why), `${hotCorn.why} ${hotCorn.words}`);
ok('its words count the hot days of the 21 around flowering', hotCorn.why !== 'flower' || /of the 21 days around flowering reach 35 °C or more/.test(hotCorn.words));
const valley = climateOf(PLACES.hotValley), vc = SE.cropTiming('corn', valley);
ok('in a hot valley corn is placed so no more than 10.5 of 21 days at flowering reach 35 °C', vc.ok && vc.hot <= 10.5, `${vc.hot}`);

// ---- gaps and hostile input
const holes = computeClimate(makeSeries({ ...PLACES.longSummer, gaps: [4] }), 36, { today: '2026-11-14' });
const gapT = SE.cropTiming('corn', holes);
ok('a month the weather record could not read: no made-up date, the gap is said', gapT.kind === 'calendar' && gapT.remarks.some(r => /the weather record has no readings for May/.test(r)), JSON.stringify(gapT.remarks));
same('no climate: no timing, said plainly', [SE.cropTiming('corn', null).ok, SE.cropTiming('corn', null).why], [false, 'noclimate']);
same('a crop id that is not in the table', [SE.cropTiming('__proto__', C).why, SE.cropTiming('hasOwnProperty', C).why], ['unknown', 'unknown']);
ok('every sentence here is free of NaN and undefined', [corn, soy, wheat, f.next, colder.next, sc, w2, hotCorn, vc, gapT].every(t => !/NaN|undefined/.test(`${SE.timingWords(t)} ${t.words ?? ''} ${(t.remarks ?? []).join(' ')}`)));

console.log(`${passed} passed, ${failed} failed`);
