// Crophalo's soil-test suite: what a lab report may put into the app, how its numbers are read, and when a crop is ruled out. A soil test is
// the one place where a typed number can end a crop's chance in the report, so each edge is tested. RULE: never loosen a check to make it pass;
// fix the project. No page and no internet are needed. Run: node scripts/test_soil.mjs
import { readNumber, fieldProblem, partsProblem, cleanSoilTest, phBand, ecBand, omBand, pBand, kBand, describe, textureOf, withSoilTest, soilTestCheck, soilTestChecks, RANGES, FIRST_YEAR, FIRST_DATE } from '../js/soiltest.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const NOW = Date.UTC(2026, 10, 14, 12);

// ---- reading what was typed: plain numbers only
same('a plain number', readNumber('6.4'), 6.4);
same('a comma for a point', readNumber('6,4'), 6.4);
same('two decimals are kept', readNumber('6.456'), 6.46);
same('a number from code', readNumber(3), 3);
for (const bad of ['0x10', '1e3', '-1', '+2', '6.4.1', '', ' ', 'six', 'NaN', 'Infinity', '1 000', null, undefined, NaN, Infinity, {}, [], true]) same(`not a number: ${brief(bad)}`, readNumber(bad), null);
same('spaces around a number are fine', readNumber('  7 '), 7);

// ---- ranges
for (const [field, [lo, hi]] of Object.entries(RANGES)) {
  same(`${field}: the low edge is taken`, cleanSoilTest({ [field]: String(lo) }, NOW)?.[field], lo);
  same(`${field}: the high edge is taken`, cleanSoilTest({ [field]: String(hi) }, NOW)?.[field], hi);
  same(`${field}: above the range nothing is usable`, cleanSoilTest({ [field]: String(hi + 1) }, NOW), null);
  check(`${field}: a number above the range is explained`, /expected between/.test(fieldProblem(field, String(hi + 1))));
}
same('pH below 3 is not usable', cleanSoilTest({ ph: '2.9' }, NOW), null);
same('nothing typed is nothing', cleanSoilTest({}, NOW), null);
same('not an object is nothing', [cleanSoilTest(null), cleanSoilTest('x'), cleanSoilTest([1])], [null, null, null]);
same('an empty box is no problem', fieldProblem('ph', ''), '');
check('a word in a number box is explained', /plain number/.test(fieldProblem('ph', 'acid')));
same('one good value among bad ones stays', cleanSoilTest({ ph: '6.4', om: 'lots', n: '99999' }, NOW).ph, 6.4);

// ---- the three soil parts
same('parts that add up are kept', ['clay', 'sand', 'silt'].map(k => cleanSoilTest({ clay: '20', sand: '40', silt: '40' }, NOW)[k]), [20, 40, 40]);
same('parts within five of 100 are kept', cleanSoilTest({ clay: '20', sand: '40', silt: '44', ph: '6' }, NOW).silt, 44);
same('parts that do not add up are all dropped', Object.keys(cleanSoilTest({ clay: '20', sand: '40', silt: '60', ph: '6' }, NOW)).filter(k => ['clay', 'sand', 'silt'].includes(k)), []);
check('and the farmer is told why', /add up to 120/.test(partsProblem({ clay: '20', sand: '40', silt: '60' })));
same('two parts are enough', cleanSoilTest({ clay: '30', sand: '40' }, NOW).clay, 30);
check('two parts above 100 are dropped', !('clay' in (cleanSoilTest({ clay: '80', sand: '40', ph: '6' }, NOW))));

// ---- the date, the method, the units, the share switch
same('a date in range', cleanSoilTest({ ph: '6', date: '2026-11-14' }, NOW).date, '2026-11-14');
same('tomorrow is allowed', cleanSoilTest({ ph: '6', date: '2026-11-15' }, NOW).date, '2026-11-15');
same('the day after tomorrow is not', 'date' in cleanSoilTest({ ph: '6', date: '2026-11-16' }, NOW), false);
same('before the first year (1990) is not', 'date' in cleanSoilTest({ ph: '6', date: `${FIRST_YEAR - 1}-12-31` }, NOW), false);
same('its first day is', [FIRST_YEAR, cleanSoilTest({ ph: '6', date: FIRST_DATE }, NOW).date], [1990, `${FIRST_YEAR}-01-01`]);
same('February 30th is not a day', 'date' in cleanSoilTest({ ph: '6', date: '2027-02-30' }, NOW), false);
same('a date written another way is not read', 'date' in cleanSoilTest({ ph: '6', date: '14/11/2026' }, NOW), false);
same('the method defaults to not sure', cleanSoilTest({ p: '12' }, NOW).method, 'unsure');
same('a known method is kept', cleanSoilTest({ p: '12', method: 'olsen' }, NOW).method, 'olsen');
same('an unknown method is not sure', cleanSoilTest({ p: '12', method: 'x' }, NOW).method, 'unsure');
same('units default and unknown units fall back', [cleanSoilTest({ ec: '2' }, NOW).units, cleanSoilTest({ ec: '2', units: { np: 'kg', ec: 'x' } }, NOW).units], [{ np: 'mgkg', ec: 'dsm' }, { np: 'mgkg', ec: 'dsm' }]);
same('ppm and mS/cm are accepted', cleanSoilTest({ ec: '2', units: { np: 'ppm', ec: 'mscm' } }, NOW).units, { np: 'ppm', ec: 'mscm' });
same('the share switch is off unless it is on', [cleanSoilTest({ ph: '6' }, NOW).share, cleanSoilTest({ ph: '6', share: 'yes' }, NOW).share, cleanSoilTest({ ph: '6', share: true }, NOW).share], [false, false, true]);

// ---- bands: each edge
same('pH bands', [4.99, 5, 5.99, 6, 7.5, 7.51, 8.5, 8.51].map(phBand), ['very acid', 'acid', 'acid', 'near neutral', 'near neutral', 'alkaline', 'alkaline', 'very alkaline']);
same('salt bands', [1.99, 2, 3.99, 4, 7.99, 8, 16, 16.01].map(ecBand), ['not salty', 'slightly salty', 'slightly salty', 'moderately salty', 'moderately salty', 'strongly salty', 'strongly salty', 'very strongly salty']);
same('organic matter bands', [1.99, 2, 4, 4.01].map(omBand), ['low', 'med', 'med', 'high']);
same('phosphorus by method', [pBand(9, 'olsen'), pBand(10, 'olsen'), pBand(20, 'olsen'), pBand(14, 'bray'), pBand(30, 'bray'), pBand(19, 'mehlich3'), pBand(40, 'mehlich3')], ['low', 'medium', 'high', 'low', 'high', 'low', 'high']);
same('phosphorus with no method has no band', [pBand(15, 'unsure'), pBand(15, undefined)], [null, null]);
same('potassium bands', [99, 100, 199, 200].map(kBand), ['low', 'medium', 'medium', 'high']);
same('nitrate gets no band, only a snapshot', describe({ n: 12 }), ['Nitrate 12 mg/kg (a snapshot of the day it was sampled)']);
same('the lines of a typed test', describe({ ph: 6.4, om: 3.2, ec: 1, method: 'unsure', p: 12 }), ['pH 6.4 (near neutral)', 'Organic matter 3.2% (med)', 'Phosphorus 12 mg/kg', 'Salt 1 dS/m (not salty)']);
same('no test, no lines', describe(null), []);

// ---- texture and what stands alone
same('a clay soil', textureOf({ clay: 40, sand: 20, silt: 40 }), 'clay');
same('a silt soil', textureOf({ clay: 10, sand: 20, silt: 70 }), 'silt');
same('a sandy soil', textureOf({ clay: 5, sand: 85, silt: 10 }), 'sand');
same('a loam', textureOf({ clay: 20, sand: 40, silt: 40 }), 'loam');
same('two parts are enough for a texture', textureOf({ clay: 10, silt: 70 }), 'silt');
same('one part is not', textureOf({ clay: 10 }), null);
same('texture alone does not make it the farmer\'s own soil', withSoilTest({ mode: 'auto', texture: 'loam', om: 'med', omPct: 3 }, { clay: 20, sand: 40, silt: 40 }).soil.mode, 'auto');
same('organic matter alone does not either', withSoilTest({ mode: 'auto', texture: 'loam', om: 'med', omPct: 3 }, { om: 5 }).soil.mode, 'auto');
same('both together do', withSoilTest({ mode: null, texture: null, om: null, omPct: null }, { clay: 20, sand: 40, silt: 40, om: 5 }).soil, { mode: 'manual', texture: 'loam', om: 'high', omPct: 5 });
same('only the typed properties are replaced', withSoilTest({ mode: 'auto', texture: 'sand', om: 'low', omPct: 1 }, { om: 5 }).soil, { mode: 'auto', texture: 'sand', om: 'high', omPct: 5 });
same('no test changes nothing', withSoilTest({ mode: 'auto', texture: 'sand', om: 'low', omPct: 1 }, null), { soil: { mode: 'auto', texture: 'sand', om: 'low', omPct: 1 }, from: [] });
same('a lab value above 30% is kept to the state\'s 30', withSoilTest({}, { om: 45, clay: 20, sand: 40, silt: 40 }).soil.omPct, 30);

// ---- what a crop takes
check('no soil test, no check', soilTestCheck(null, 'corn') === null);
same('corn at pH 6.5 is fine', soilTestCheck({ ph: 6.5 }, 'corn'), { veto: null, notes: [] });
const acid = soilTestCheck({ ph: 4.8 }, 'corn');
check('corn at pH 4.8 is ruled out, in words', acid.veto === 'Your soil test pH 4.8 is below what corn takes: they do best at pH 5.5–7.5 and stop growing well under 5.', acid.veto);
check('corn at pH 9 is ruled out', /above what corn takes/.test(soilTestCheck({ ph: 9 }, 'corn').veto));
same('the edge itself is not a veto', [soilTestCheck({ ph: 5 }, 'corn').veto, soilTestCheck({ ph: 8.5 }, 'corn').veto], [null, null]);
check('between best and lowest is a note, not a veto', soilTestCheck({ ph: 5.2 }, 'corn').veto === null && soilTestCheck({ ph: 5.2 }, 'corn').notes.length === 1);
check('potatoes like it more acid than wheat', soilTestCheck({ ph: 5.2 }, 'potato').notes.length === 0 && soilTestCheck({ ph: 5.2 }, 'wheat').notes.length === 1);
check('salt below the threshold is fine', soilTestCheck({ ec: 1.5 }, 'corn').notes.length === 0);
check('salt above the threshold is a note with a loss (12% per dS/m over 1.7 is 13% at 2.8)', /lose about 13%/.test(soilTestCheck({ ec: 2.8 }, 'corn').notes[0]), soilTestCheck({ ec: 2.8 }, 'corn').notes[0]);
check('corn is ruled out where its yield would halve (1.7 + 50/12 = 5.9 dS/m)', soilTestCheck({ ec: 5.9 }, 'corn').veto !== null && soilTestCheck({ ec: 5.8 }, 'corn').veto === null);
check('barley takes much more salt than beans', soilTestCheck({ ec: 6 }, 'barley').veto === null && soilTestCheck({ ec: 6 }, 'bean').veto !== null);
same('a crop with no published limit is never ruled out', soilTestCheck({ ph: 3, ec: 60 }, 'tea'), { veto: null, notes: [] });
check('a hard limit comes before a caution', (() => { const r = soilTestCheck({ ph: 5.2, ec: 9 }, 'corn'); return r.veto && /salt/.test(r.veto) && r.notes.length === 1; })(), brief(soilTestCheck({ ph: 5.2, ec: 9 }, 'corn')));
check('with both a pH veto and a salt veto, the pH one is first and nothing is lost', /pH/.test(soilTestCheck({ ph: 4.8, ec: 9 }, 'corn').veto));
same('a list of crops', Object.keys(soilTestChecks({ ph: 4.8 }, ['corn', 'potato', 'tea'])), ['corn', 'potato', 'tea']);
same('a list with no test is empty', soilTestChecks(null, ['corn']), {});

console.log(`soil: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
