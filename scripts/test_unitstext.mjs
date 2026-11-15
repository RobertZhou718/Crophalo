// Crophalo's units-in-sentences suite (js/unitstext.js): every metric figure in a sentence becomes the farmer's unit when the choice is imperial, right to the
// rounding a farmer expects; a temperature difference and degree days are multiplied by 1.8 and get no 32; a year, a count, a score, a date and a ratio keep their numbers;
// the metric choice changes nothing; a second run changes nothing; no metric unit is left. RULE: never loosen a check to make it pass.
// No internet is needed. Run: node scripts/test_unitstext.mjs   (the last line is "N passed, M failed")
import { localiseText, localiseDetailed, localiseDeep, metricLeft } from '../js/unitstext.js';
import { IMPERIAL, METRIC } from '../js/units.js';
let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 260 ? s.slice(0, 260) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const US = IMPERIAL, say = t => localiseText(t, US);

// ---- temperatures: absolute (×1.8 + 32, whole degrees)
same('35 °C is 95 °F', say('13 days of 35 °C or more'), '13 days of 95 °F or more');
same('0 °C is 32 °F', say('a night under 0 °C'), 'a night under 32 °F');
same('-2 °C is 28 °F', say('a frost of -2 °C kills the flowers'), 'a frost of 28 °F kills the flowers');
same('a real minus sign is read', say('the coldest night is about −26 °C'), 'the coldest night is about −15 °F');
same('-40 °C is -40 °F', say('down to −40 °C'), 'down to −40 °F');
same('10 °C base is 50 °F', say('base 10 °C'), 'base 50 °F');
same('no space before the unit', say('it needs 14°C or more'), 'it needs 57°F or more');
same('never "−0 °F"', say('under -17.8 °C'), 'under 0 °F');
// ---- temperature differences: ×1.8, no 32
same('2 °C colder', say('with weather 2 °C colder than the NASA weather square'), 'with weather 3.6 °F colder than the NASA weather square');
same('2 °C hotter', say('2 °C hotter, and a fifth drier'), '3.6 °F hotter, and a fifth drier');
same('moved by', say('the temperatures were moved by 1.2 °C'), 'the temperatures were moved by 2.2 °F');
same('plus sign', say('+0.5 °C a decade'), '+0.9 °F a decade');
same('a big difference has no decimal', say('a swing of 12 °C warmer'), 'a swing of 22 °F warmer');
// ---- degree days: ×1.8
same('degree days', say('1,828 degree days (base 10 °C)'), '3,290 °F degree days (base 50 °F)');
same('growing degree days', say('about 2,135 growing degree days from April'), 'about 3,843 °F growing degree days from April');
same('degree-days with a hyphen', say('1,000 °C-days'), '1,800 °F-days');
// ---- rain: mm to in (one decimal under 10 in, whole above, two under 0.1)
same('20 mm', say('20 mm or more in a day'), '0.8 in or more in a day');
same('59 mm', say('the wettest day gives about 59 mm'), 'the wettest day gives about 2.3 in');
same('25.4 mm is 1 in', say('25.4 mm of rain'), '1 in of rain');
same('801 mm is 32 in (whole inches from 10 in up, as units.js writes them)', say('801 mm a year'), '32 in a year');
same('254 mm is 10 in', say('254 mm'), '10 in'); same('241 mm is 9.5 in', say('241 mm'), '9.5 in');
same('1,380 mm is 54 in', say('1,380 mm a year'), '54 in a year');
same('0.5 mm is 0.02 in', say('0.5 mm'), '0.02 in');
same('a range', say('between 20 to 30 mm of rain'), 'between 0.8 to 1.2 in of rain');
same('per day', say('about 4 mm/day'), 'about 0.2 in/day');
same('a ratio keeps its numbers', say('rain covers about 89 of every 100 mm corn needs'), 'rain covers about 89 of every 100 inches corn needs');
same('seven of every ten', say('rain covers about 7 of every 10 mm of water it needs'), 'rain covers about 7 of every 10 inches of water it needs');
// ---- area, distance, height, speed
same('hectares to acres', say('under 250 ha in that box'), 'under 618 acres in that box');
same('46,713 ha', say('46,713 ha of farmland'), '115,430 acres of farmland');
same('small field in one decimal', say('a field of 10 ha'), 'a field of 24.7 acres');
same('one hectare is 2.5 acres', say('1 ha'), '2.5 acres');
same('km to miles', say('a box about 28 km north to south and 21 km east to west'), 'a box about 17 miles north to south and 13 miles east to west');
same('a short distance has a decimal', say('about 5 km away'), 'about 3.1 miles away');
same('metres to feet', say('a field at 300 m'), 'a field at 984 ft');
same('357.6 m', say('height 357.6 m'), 'height 1,173 ft');
same('km/h to mph', say('wind 40 km/h'), 'wind 25 mph');
same('kg per hectare', say('60 kg/ha of nitrogen'), '54 lb/acre of nitrogen');
// ---- yield: bushels only where the crop's bushel weight is known, else short tons
same('corn t/ha to bushels', localiseText('Yield of corn: 10 t/ha', US), 'Yield of corn: 160 bushels/acre');
same('soybeans', localiseText('3.5 t/ha of soybeans', US), '3.5 t/ha of soybeans'.replace('3.5 t/ha', '50 bushels/acre'));
same('a crop given in the options', localiseText('about 6 t/ha', US, { crop: 'wheat' }), 'about 90 bushels/acre');
same('no crop known: tons an acre', localiseText('about 12 t/ha', US), 'about 5.35 tons/acre');
same('two crops in one sentence: tons an acre', localiseText('corn 10 t/ha and wheat 6 t/ha', US), 'corn 4.46 tons/acre and wheat 2.68 tons/acre');
// ---- never touched
for (const t of ['scores 66 against 60 for what you grow now', 'sown 2027-04-23 and harvested 2027-09-20', 'corn in 6 of 25 years', '2026 so far: 737 total', 'about 13.2 heavy-rain days a year', 'a fifth drier and 20 % wetter', 'in the 2001 to 2025 record', 'every 100 ha hold about corn 51'.replace(' ha', ' acres'), 'The word mm in "mmm" and 5 min and 3 months and 10 m²'.replace('10 m²', '10 m2')])
  same(`untouched: ${t.slice(0, 40)}`, say(t), t);
check('"3 months" and "5 min" are kept', say('3 months and 5 min') === '3 months and 5 min');
check('metres squared is not a length', say('10 m²') === '10 m²', say('10 m²'));
// ---- the choice
const sets = [METRIC, { rain: 'in', temp: 'C', area: 'metric', yield: 't' }, { rain: 'mm', temp: 'F', area: 'metric', yield: 't' }, { rain: 'mm', temp: 'C', area: 'imperial', yield: 't' }, { rain: 'mm', temp: 'C', area: 'metric', yield: 'bu' }];
const SAMPLE = '13 days of 35 °C or more, 2 °C colder, 20 mm a day, 28 km, 40,802 ha, 300 m, 40 km/h, 10 t/ha of corn, 1,828 degree days';
same('metric choice changes nothing', localiseText(SAMPLE, METRIC), SAMPLE);
same('only the rain', localiseText(SAMPLE, sets[1]), SAMPLE.replace('20 mm', '0.8 in'));
same('only the temperatures', localiseText(SAMPLE, sets[2]), SAMPLE.replace('35 °C', '95 °F').replace('2 °C', '3.6 °F').replace('1,828 degree days', '3,290 °F degree days'));
same('only the area and distance', localiseText(SAMPLE, sets[3]), SAMPLE.replace('28 km', '17 miles').replace('40,802 ha', '100,824 acres').replace('300 m', '984 ft').replace('40 km/h', '25 mph'));
same('only the yield', localiseText(SAMPLE, sets[4]), SAMPLE.replace('10 t/ha', '160 bushels/acre'));
check('a missing choice reads as imperial', localiseText('35 °C', undefined) === '95 °F');
// ---- idempotence and what is left
const BIG = 'Farmland in a box about 28 km north to south and 21 km east to west (USDA Cropland Data Layer 2025): 46,713 ha. ' + SAMPLE;
const once = localiseText(BIG, US);
same('a second run changes nothing', localiseText(once, US), once);
same('no metric unit left', metricLeft(once, US), []);
check('metricLeft finds them in the original', metricLeft(BIG, US).length >= 9, brief(metricLeft(BIG, US)));
same('metricLeft respects the choice', metricLeft(BIG, METRIC), []);
// ---- every conversion recomputed by a second, plain route
const arith = { temp: v => Math.round(v * 9 / 5 + 32), diff: v => v * 1.8, rain: v => v / 25.4, area: v => v * 2.4710538147, dist: v => v * 0.621371192, len: v => v * 3.280839895 };
const { text: t2, changes } = localiseDetailed('a night of −3 °C, 2.5 °C warmer, 33 mm, 120 ha, 12 km, 450 m, 1,500 degree days', US);
const kinds = Object.fromEntries(changes.map(c => [c.kind, c.to]));
same('detail: the kinds found', changes.map(c => c.kind).sort(), ['area', 'degreedays', 'distance', 'length', 'rain', 'temp', 'tempdiff']);
same('detail: temp', kinds.temp, `${arith.temp(-3) < 0 ? '−' : ''}${Math.abs(arith.temp(-3))} °F`);
same('detail: difference', kinds.tempdiff, `${arith.diff(2.5).toFixed(1)} °F`);
same('detail: rain', kinds.rain, `${arith.rain(33).toFixed(1)} in`);
same('detail: acres', kinds.area, `${Math.round(arith.area(120)).toLocaleString('en-US')} acres`);
same('detail: miles', kinds.distance, `${arith.dist(12).toFixed(1)} miles`);
same('detail: feet', kinds.length, `${Math.round(arith.len(450)).toLocaleString('en-US')} ft`);
same('detail: degree days', kinds.degreedays, `${Math.round(1500 * 1.8).toLocaleString('en-US')} °F degree days`);
// ---- deep walk: strings only
const deep = { reason: 'about 20 mm', n: 20, list: ['35 °C', { why: '10 km' }], year: 2026, nope: null };
same('deep walk', localiseDeep(deep, US), { reason: 'about 0.8 in', n: 20, list: ['95 °F', { why: '6.2 miles' }], year: 2026, nope: null });
same('deep walk copies', deep.reason, 'about 20 mm');
// ---- hostile input
for (const bad of [undefined, null, 5, {}, [], '']) check(`hostile ${brief(bad)}`, typeof localiseText(bad, US) === 'string');
check('a long text is fast', (() => { const t0 = performance.now(); localiseText('35 °C and 20 mm. '.repeat(20000), US); return performance.now() - t0 < 2000; })());
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
