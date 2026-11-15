// Crophalo's state suite: a farmer's answers must survive a link and a reload unchanged, and a link written by someone else
// must never put anything into the app that the app did not allow. RULE: never loosen a check to make it pass; fix the project.
// No internet is needed. Run: node scripts/test_state.mjs
import { newState, checkSerialized, serialize, fromLink, PRIORITY_SETS } from '../js/state.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const ok = raw => checkSerialized(raw).state;
const here = { lat: 44.4, lon: -79.78 };

// ---- a new state chooses nothing for the farmer
const fresh = newState();
same('no soil is chosen', fresh.soil, { mode: null, texture: null, om: null, omPct: null });
same('no rotation is chosen', fresh.rotation, { preset: null, custom: [], garden: null, second: {} });
same('water is not chosen', fresh.farm.irrigation, null);
same('priorities start balanced', fresh.prio, PRIORITY_SETS.balanced);
check('two new states share nothing', newState().prio !== newState().prio && newState().rotation !== newState().rotation);

// ---- the place is the one hard refusal
for (const bad of [null, undefined, 'x', [], {}, { loc: {} }, { loc: { lat: 91, lon: 0 } }, { loc: { lat: 0, lon: 181 } }, { loc: { lat: NaN, lon: 1 } }, { loc: { lat: 'north', lon: 1 } }, { loc: { lat: Infinity, lon: 1 } }])
  same(`a bad place is refused: ${brief(bad)}`, checkSerialized(bad), { ok: false, reason: 'bad place' });
same('the place is kept to four decimals', ok({ loc: { lat: 44.400049, lon: -79.78 } }).loc.lat, 44.4);
same('a country code of two letters only', [ok({ loc: { ...here, cc: 'ca' } }).loc.cc, ok({ loc: { ...here, cc: 'CAN' } }).loc.cc, ok({ loc: { ...here, cc: '<b>' } }).loc.cc], ['CA', '', '']);
same('label and name are cut', [ok({ loc: { ...here, label: 'x'.repeat(500) } }).loc.label.length, ok({ loc: here, name: 'y'.repeat(500) }).name.length], [200, 120]);

// ---- the outline
const square = [[44.39, -79.79], [44.39, -79.77], [44.41, -79.77], [44.41, -79.79]];
same('an outline round the pin is kept', ok({ loc: here, area: { pts: square, ha: 12.4, slope: 3.1 } }).area, { pts: square, ha: 12.4, slope: 3.1 });
same('its corners keep 5 decimals (about 1 m: a corner dragged at a close zoom stays where it was dropped), the pin keeps 4', [ok({ loc: { lat: 44.400049, lon: -79.78 }, area: { pts: [[44.391234567, -79.791234567], ...square.slice(1)] } }).area.pts[0], ok({ loc: { lat: 44.400049, lon: -79.78 } }).loc.lat], [[44.39123, -79.79123], 44.4]);
same('an outline with two corners is dropped', ok({ loc: here, area: { pts: square.slice(0, 2) } }).area, null);
same('a flat outline is dropped', ok({ loc: here, area: { pts: [[44.4, -79.8], [44.4, -79.7], [44.4, -79.6]] } }).area, null);
same('an outline that leaves the pin outside is dropped', ok({ loc: { lat: 45, lon: -79.78 }, area: { pts: square } }).area, null);
// the pin is kept to 4 decimals, a square about 11 m across: a 10 m garden with no 4-decimal point inside it keeps the pin whose square meets it
const garden = [[43.10147, -80.78128], [43.1015, -80.78141], [43.10141, -80.78144], [43.10138, -80.78131]];
check('a 10 m garden keeps its pin when the pin\'s 11 m square meets it', !!ok({ loc: { lat: 43.1014, lon: -80.7814 }, area: { pts: garden } }).area);
same('a pin one step further off is still dropped', ok({ loc: { lat: 43.1016, lon: -80.7814 }, area: { pts: garden } }).area, null);
same('an outline with a broken corner is dropped', ok({ loc: here, area: { pts: [...square, ['a', 1]] } }).area, null);
same('a steep slope is cleaned to nothing, the outline stays', ok({ loc: here, area: { pts: square, slope: 900 } }).area.slope, null);

// ---- the answers, each from its own allow-list
const mixed = ok({ loc: here, rotation: { preset: 'corn-soy', custom: ['corn', 'soy', 'nonsense', 7, '__proto__', 'toString'], garden: 'apple', second: { 0: 'oats', 9: 'oats', 1: 'nonsense' } },
  farm: { irrigation: 'limited', tillage: 'notill', livestock: true, coverOK: false, labor: 'yes' },
  soil: { mode: 'manual', texture: 'silt', om: 'high', omPct: 4.5 }, avoid: ['rice', 'rice', 'zzz'], prio: [5, 0, 1, 2, 3], prioPreset: 'income', sc: { rainPct: -10, tempC: 1.5 } });
same('a preset is kept', mixed.rotation.preset, 'corn-soy');
same('only real crops are kept in a custom rotation', mixed.rotation.custom, ['corn', 'soy']);
same('a real garden is kept', mixed.rotation.garden, 'apple');
same('a second crop only in a real slot with a real crop', mixed.rotation.second, { 0: 'oats' });
same('farm answers', mixed.farm, { irrigation: 'limited', tillage: 'notill', livestock: true, coverOK: false, labor: false });
same('soil answers', mixed.soil, { mode: 'manual', texture: 'silt', om: 'high', omPct: 4.5 });
same('avoid is a set of real crops', mixed.avoid, ['rice']);
same('priorities are kept', [mixed.prio, mixed.prioPreset], [[5, 0, 1, 2, 3], 'income']);
same('the what-if is kept', mixed.sc, { rainPct: -10, tempC: 1.5 });
for (const [name, raw, want] of [
  ['an unknown preset', { rotation: { preset: 'zz' } }, null], ['custom as a preset', { rotation: { preset: 'custom' } }, 'custom'], ['a garden id as a preset', { rotation: { preset: 'apple' } }, 'apple'],
  ['a long preset', { rotation: { preset: 'c'.repeat(80) } }, null]]) same(name, ok({ loc: here, ...raw }).rotation.preset, want);
same('an unknown irrigation is nothing', ok({ loc: here, farm: { irrigation: 'flood' } }).farm.irrigation, null);
same('an unknown tillage falls back to the default', ok({ loc: here, farm: { tillage: 'plough' } }).farm.tillage, 'reduced');
same('soil from outside the lists', ok({ loc: here, soil: { mode: 'x', texture: 'rock', om: 'huge', omPct: 99 } }).soil, { mode: null, texture: null, om: null, omPct: null });
same('priorities out of range fall back to balanced', [ok({ loc: here, prio: [9, 0, 0, 0, 0] }).prio, ok({ loc: here, prio: [1.5, 0, 0, 0, 0] }).prio, ok({ loc: here, prio: [1, 2] }).prio], [PRIORITY_SETS.balanced, PRIORITY_SETS.balanced, PRIORITY_SETS.balanced]);
same('the what-if outside its range is nothing', ok({ loc: here, sc: { rainPct: -90, tempC: 7 } }).sc, { rainPct: 0, tempC: 0 });
same('a what-if between the steps is nothing', ok({ loc: here, sc: { rainPct: 7, tempC: 0.3 } }).sc, { rainPct: 0, tempC: 0 });
same('a soil test keeps the numbers inside their ranges', ok({ loc: here, soilTest: { ph: 6.4, om: 3.2, n: -4, ec: 'salty', date: '2026-11-14', extra: 1 } }).soilTest, { ph: 6.4, om: 3.2, date: '2026-11-14' });
same('a soil test of nothing is nothing', ok({ loc: here, soilTest: { ph: 12 } }).soilTest, null);

// ---- each limit of the whitelist
same('at most twelve crops in a custom rotation', ok({ loc: here, rotation: { custom: Array(20).fill('corn') } }).rotation.custom.length, 1);
same('twelve different crops are the most', ok({ loc: here, rotation: { custom: ['corn','wheat','barley','sorghum','oats','rye','rice','soy','pea','bean','faba','teff','quinoa','lentil'] } }).rotation.custom.length, 12);
same('organic matter is 0 to 30 only', [ok({ loc: here, soil: { omPct: 31 } }).soil.omPct, ok({ loc: here, soil: { omPct: -1 } }).soil.omPct, ok({ loc: here, soil: { omPct: 30 } }).soil.omPct, ok({ loc: here, soil: { omPct: 0 } }).soil.omPct], [null, null, 30, 0]);
same('the what-if edges', [ok({ loc: here, sc: { rainPct: -40, tempC: 4 } }).sc, ok({ loc: here, sc: { rainPct: 30, tempC: 0 } }).sc, ok({ loc: here, sc: { rainPct: 35, tempC: 4.5 } }).sc], [{ rainPct: -40, tempC: 4 }, { rainPct: 30, tempC: 0 }, { rainPct: 0, tempC: 0 }]);
same('priorities are integers 0 to 5 and five of them', [ok({ loc: here, prio: [0, 5, 0, 5, 0] }).prio, ok({ loc: here, prio: [-1, 0, 0, 0, 0] }).prio, ok({ loc: here, prio: [0, 0, 0, 0, 0, 0] }).prio], [[0, 5, 0, 5, 0], PRIORITY_SETS.balanced, PRIORITY_SETS.balanced]);
same('latitude and longitude edges are on Earth', [!!checkSerialized({ loc: { lat: 90, lon: 180 } }).ok, !!checkSerialized({ loc: { lat: -90, lon: -180 } }).ok, !!checkSerialized({ loc: { lat: 90.0001, lon: 0 } }).ok], [true, true, false]);

// ---- a hostile link runs nothing and pollutes nothing
const hostile = JSON.parse('{"v":1,"loc":{"lat":44.4,"lon":-79.78,"label":"<script>alert(1)</script>","cc":"CA"},"name":"<img src=x onerror=alert(1)>","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},' +
  '"rotation":{"preset":"__proto__","custom":["__proto__","constructor","toString","corn"],"__proto__":{"polluted":true}},"farm":{"__proto__":{"polluted":true},"irrigation":"toString"},"soil":{"mode":"constructor"},"prioPreset":"toString","avoid":["hasOwnProperty"]}');
const result = checkSerialized(hostile);
check('a hostile link is read as plain text only', result.ok && result.state.name === '<img src=x onerror=alert(1)>' && result.state.loc.label === '<script>alert(1)</script>');
check('a hostile link pollutes nothing', ({}).polluted === undefined && Object.prototype.polluted === undefined && result.state.polluted === undefined);
same('inherited names are never crops, presets or choices', [result.state.rotation.preset, result.state.rotation.custom, result.state.farm.irrigation, result.state.soil.mode, result.state.prioPreset, result.state.avoid], [null, ['corn'], null, null, null, []]);
check('nothing but known keys comes out', Object.keys(result.state).sort().join() === Object.keys(newState()).sort().join());

// ---- the round trip through a link
const kept = ok({ loc: { ...here, label: 'Barrie, Ontario', cc: 'CA' }, area: { pts: square, ha: 12.4, slope: 3.1 }, name: 'North field', rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} },
  farm: { irrigation: 'none', tillage: 'reduced', livestock: false, coverOK: true, labor: false }, soil: { mode: 'manual', texture: 'loam', om: 'med', omPct: null }, soilTest: { ph: 6.5 }, avoid: ['rice'], prio: [3, 3, 3, 3, 3], prioPreset: 'balanced', sc: { rainPct: 0, tempC: 0 } });
const back = fromLink('#s=' + serialize(kept));
check('a link carries the field and the answers back', back.ok && JSON.stringify({ ...back.state, soilTest: null }) === JSON.stringify({ ...kept, soilTest: null }), brief(back));
same('the soil test is left off a link unless asked for', back.state.soilTest, null);
same('the soil test rides when asked for', fromLink('#s=' + serialize(kept, { withSoilTest: true })).state.soilTest, { ph: 6.5 });
same('a shared field with no name is called Shared field', fromLink('#s=' + serialize({ ...kept, name: '' })).state.name, 'Shared field');
same('the letters of every language survive a link', fromLink('#s=' + serialize({ ...kept, name: 'Tarla Şahin ı ğ' })).state.name, 'Tarla Şahin ı ğ');
for (const [name, hash] of [['nothing', ''], ['a plain hash', '#data'], ['broken text', '#s=%%%'], ['not base64', '#s=!!!!'], ['not JSON', '#s=' + btoa('hello').replace(/=+$/, '')], ['a number', '#s=' + btoa('42')], ['another version', '#s=' + btoa(JSON.stringify({ v: 9, loc: here })).replace(/=+$/, '')], ['no place', '#s=' + btoa(JSON.stringify({ v: 1 })).replace(/=+$/, '')]])
  check(`a link that cannot be read is refused, not thrown: ${name}`, fromLink(hash).ok === false);

console.log(`state: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
