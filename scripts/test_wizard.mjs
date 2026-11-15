// Crophalo's wizard suite: the rules that decide when a farmer may go on, and that every step has its words.
// RULE: never loosen a check to make it pass; fix the project. No page and no internet are needed. Run: node scripts/test_wizard.mjs
import { STEPS, WATER, FEEL, COLOUR, MATTERS, TILLAGE, HABITS, PARCEL_FOR } from '../js/words.js';
import { newState, PRIORITY_SETS, TEXTURES, ORGANIC } from '../js/state.js';
import { hasPlace, hasRotation, hasSoil, stepsFor, needFor, canGo, rotationSlots, readyAnswers, isReady } from '../js/steps.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

const s = newState();
same('four steps, in order', STEPS.map(x => x.id), ['field', 'crops', 'soil', 'matters']);
check('every step has a bar label, a heading and a Listen text', STEPS.every(x => x.bar && x.heading && x.listen.startsWith('Step ')));
check('the first step blocks only until the field has a position', !canGo('field', s) && canGo('field', { ...s, loc: { lat: 43.1, lon: -80.7 } }));
const NEED_PLACE = 'Tap the map or draw your field to go on.';
check('step one blocks with no position', needFor('field', { ...s, loc: null }) === NEED_PLACE && needFor('field', { ...s, loc: {} }) === NEED_PLACE && !hasPlace({ loc: { lat: '43', lon: 1 } }) && needFor('field', { ...s, loc: { lat: '43', lon: 1 } }) === NEED_PLACE);
check('step one opens with a real position', needFor('field', { ...s, loc: { lat: 43.1, lon: -80.7 } }) === '' && hasPlace({ loc: { lat: 0, lon: 0 } }) && !hasPlace(null) && !hasPlace({ loc: { lat: NaN, lon: 1 } }));
check('step two blocks until a rotation is chosen', !canGo('crops', s) && needFor('crops', s) === 'Tap what you grow to go on.');
s.rotation.preset = 'corn-soy'; check('a ready rotation lets step two go on', canGo('crops', s));
s.rotation.preset = 'custom'; check('building your own with no year does not', !hasRotation(s));
s.rotation.custom = ['corn']; check('building your own with one year does', hasRotation(s));
s.rotation = { preset: null, custom: [], garden: 'tea', second: {} }; check('a garden lets step two go on', hasRotation(s));
same('a garden skips the last step', stepsFor(s).map(x => x.id), ['field', 'crops', 'soil']);
same('a garden has no rotation to repeat', rotationSlots(s), []);
same('a ready rotation has its crops in order', rotationSlots({ ...newState(), rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }), ['corn', 'soy', 'wheat']);

const t = newState();
check('step three blocks with no soil chosen', !canGo('soil', t) && needFor('soil', t) === 'Tap your soil and its colour to go on.');
t.soil = { mode: 'manual', texture: 'loam', om: null, omPct: null }; check('the feel alone is not enough', !hasSoil(t));
t.soil = { mode: 'manual', texture: null, om: 'med', omPct: null }; check('the colour alone is not enough', !hasSoil(t));
t.soil = { mode: 'manual', texture: 'loam', om: 'med', omPct: null }; check('feel and colour are enough', hasSoil(t));
t.soil = { mode: 'assumed', texture: null, om: null, omPct: null }; check('an assumed soil is enough', hasSoil(t));
check('a new field never has a soil nobody chose', !hasSoil(newState()));

// a demo region comes with ready answers
const region = { rotation: 'corn-soy-wheat', defaults: { irrigation: 'none', soil: 'assumed' } };
const d = { ...newState(), ...readyAnswers(newState(), region) };
check('a demo region is ready for the report at once', isReady(d));
same('its answers', [d.rotation.preset, d.farm.irrigation, d.soil.mode], ['corn-soy-wheat', 'none', 'assumed']);
check('a field that is not a demo is never ready', !isReady(newState()));
check('a broken region file puts nothing impossible in', !isReady({ ...newState(), ...readyAnswers(newState(), { rotation: 'zz', defaults: { irrigation: 'flood', soil: 'x' } }) }));

// the crop chooser's list
import { pickList, tabs, ALL, TREES } from '../js/croppicker.js';
import { CROPS, GARDENS } from '../js/crops.js';
check('with nothing typed every crop and every garden is listed', pickList('', ALL).length === Object.keys(CROPS).length + Object.keys(GARDENS).length);
check('"bean" finds more than one kind of bean', pickList('bean', ALL).length > 1);
same('a search with no match is empty', pickList('zzzz', ALL), []);
check('the trees tab lists only gardens', pickList('', TREES).length === Object.keys(GARDENS).length && pickList('', TREES).every(id => id in GARDENS));
check('a group tab lists only that group', pickList('', 'grain').length > 0 && pickList('', 'grain').every(id => CROPS[id].group === 'grain'));
check('every tab has crops to show', tabs().every(g => pickList('', g).length > 0));

// the choices on the screen are the choices the state accepts
same('the four feel tiles are the four textures', FEEL.map(x => x.value), TEXTURES);
same('the three colours are the three organic levels', COLOUR.map(x => x.value), ORGANIC);
same('the six priorities are the six weight sets', MATTERS.map(x => x.value).sort(), Object.keys(PRIORITY_SETS).sort());
same('three water choices', WATER.map(x => x.value), ['none', 'limited', 'full']);
same('three tillage choices', TILLAGE.map(x => x.value), ['conventional', 'reduced', 'notill']);
same('three habits', HABITS.map(x => x.key), ['coverOK', 'livestock', 'labor']);
check('every tile has a title', [...WATER, ...FEEL, ...COLOUR, ...MATTERS, ...TILLAGE, ...HABITS].every(x => x.title));
check('Türkiye is written with its own name wherever the parcel links name it', JSON.stringify(PARCEL_FOR).indexOf('Tur' + 'key') === -1);
check('every parcel link is https', Object.values(PARCEL_FOR).flat().every(([, url]) => url.startsWith('https://')));

console.log(`wizard: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
