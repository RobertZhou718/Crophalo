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
check('step two blocks until a rotation is chosen', !canGo('crops', s) && needFor('crops', s) === 'Pick what you grow to go on.');   // the crop step now offers a suggestion and cards to pick from, so the line says Pick
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
// a demo field whose soil comes from a soil map, and whose tillage is known (as data/regions.json gives Mead)
const mapped = { ...newState(), ...readyAnswers(newState(), { rotation: 'corn-soy', defaults: { irrigation: 'none', tillage: 'notill', soil: 'map', soil_texture: 'silt' } }) };
check('a demo field with a soil map\'s texture is ready for the report at once', isReady(mapped) && hasSoil(mapped));
same('its soil and tillage are the region\'s', [mapped.soil.mode, mapped.soil.texture, mapped.farm.tillage], ['map', 'silt', 'notill']);
check('a soil map with no texture is not a soil', !hasSoil({ ...newState(), soil: { mode: 'map', texture: null, om: null, omPct: null } }));
same('a region that says nothing of tillage keeps the usual one', readyAnswers(newState(), { rotation: 'corn-soy', defaults: { irrigation: null, soil: 'map', soil_texture: 'loam' } }).farm.tillage, newState().farm.tillage);
check('a broken region file puts nothing impossible in',!isReady({ ...newState(), ...readyAnswers(newState(), { rotation: 'zz', defaults: { irrigation: 'flood', soil: 'x' } }) }));

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

import { countryCode } from '../js/steps.js';
same('a region\'s country becomes the two letters the report and the units read', [countryCode('United States'), countryCode('Canada'), countryCode('Türkiye'), countryCode('')], ['US', 'CA', '', '']);
check('a demo region\'s tillage default is read (a no-till field starts no-till); none given leaves the default', readyAnswers(newState(), { rotation: 'corn-soy', defaults: { irrigation: 'none', soil: 'assumed', tillage: 'notill' } }).farm?.tillage === 'notill' && readyAnswers(newState(), { rotation: 'corn-soy', defaults: { irrigation: 'none', soil: 'assumed' } }).farm?.tillage === 'reduced');
// the three demo fields (Mead, Beltsville and Barrie): each walks all four steps with Next, and the report can open
{
  const fs = await import('node:fs'), REGIONS = JSON.parse(fs.readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8'));
  const { SOIL_MAP_WORDS } = await import('../js/steps.js'), { checkSerialized, serialize } = await import('../js/state.js');
  check('the region file holds the three demo fields', ['mead-field', 'beltsville-field', 'barrie-field'].every(id => REGIONS.some(r => r.id === id)), REGIONS.map(r => r.id).join());
  for (const id of ['mead-field', 'beltsville-field', 'barrie-field']) {
    const r = REGIONS.find(x => x.id === id); if (!r) continue;
    const base = { ...newState(), loc: { lat: Math.round(r.lat * 1e4) / 1e4, lon: Math.round(r.lon * 1e4) / 1e4, label: r.country, cc: '' }, name: r.name };
    const st = { ...base, ...readyAnswers(base, r) };
    check(`${id}: every step can be passed with Next (place, crops, water and soil)`, stepsFor(st).every(step => canGo(step.id, st)), stepsFor(st).map(step => `${step.id}:${needFor(step.id, st)}`).join(' | '));
    check(`${id}: the soil is the soil map's, said in words`, st.soil.mode === 'map' && st.soil.texture === r.defaults.soil_texture && typeof SOIL_MAP_WORDS[st.soil.texture] === 'string', JSON.stringify(st.soil));
    check(`${id}: the tillage and the water answer follow the region; water not known stays open`, st.farm.irrigation === (r.defaults.irrigation ?? null) && (!r.defaults.tillage || st.farm.tillage === r.defaults.tillage), JSON.stringify(st.farm));
    const again = checkSerialized(JSON.parse(JSON.stringify(st)));
    check(`${id}: the state the report opens with is a valid one and keeps the soil map`, again.ok && again.state.soil.mode === 'map' && hasPlace(again.state) && hasRotation(again.state), JSON.stringify(again.ok ? again.state.soil : again));
  }
}
// The seam home -> setup -> map for the three real demo fields of data/regions.json: the home's spot ({ lat, lon, outline, name, place, country, region, demo, ... }, js/home.js openRegion)
// gives the setup its two-letter country (js/wizard.js setPlace: countryCode(country ?? place)), and the map finds the field by its id, or by nearness from the pin kept to 4 decimals, and draws its own outline.
{
  const fsm = await import('node:fs'), { regionAt, regionOutline } = await import('../js/places.js'), { areaHa } = await import('../js/geo.js');
  const demo = JSON.parse(fsm.readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8'));
  const want = { 'mead-field': 'US', 'beltsville-field': 'US', 'barrie-field': 'CA' };
  for (const region of demo.filter(r => Object.hasOwn(want, r.id))) {
    const spot = { lat: region.lat, lon: region.lon, outline: region.outline, name: region.name, place: region.country, country: region.country, region: region.id, demo: true, rotation: region.rotation, defaults: region.defaults, from: 'region' };
    const pin = { lat: Math.round(spot.lat * 1e4) / 1e4, lon: Math.round(spot.lon * 1e4) / 1e4 }, ring = regionOutline(regionAt(demo, { ...pin, region: spot.region }));
    same(`demo ${region.id}: the setup reads its country as ${want[region.id]}`, countryCode(spot.country ?? spot.place), want[region.id]);
    check(`demo ${region.id}: the map finds it by its id and by nearness from the pin`, regionAt(demo, { ...pin, region: spot.region })?.id === region.id && regionAt(demo, pin)?.id === region.id);
    check(`demo ${region.id}: its own outline is a real ring of its own size`, Array.isArray(ring) && ring.length >= 3 && areaHa(ring) > 1, ring && areaHa(ring));
  }
  const mead = demo.find(r => r.id === 'mead-field');
  check('demo mead-field: its outline is about 64 ha, never the estimated 10 ha square', mead && Math.abs(areaHa(regionOutline(mead)) - 64) < 3, mead && areaHa(regionOutline(mead)));
}

// ---- step 4: what else matters and what limits the farmer (js/inputs.js, js/inputs-step.js, js/words.inputs.js)
import { GOALS, SELL, PART_NAMES, INPUT_WORDS } from '../js/words.inputs.js';
import { GOAL_KEYS, SELL_KEYS, weightsFor, nudge, proposable } from '../js/inputs.js';
import { GOAL_KEYS as ENGINE_GOALS, SELL_KEYS as ENGINE_SELL, inputsOf, sellable } from '../js/compare.js';
import { cropOf } from '../js/crops.js';
import { mattersHTML, inputsChange, inputsClick, doesLine, takenAs } from '../js/inputs-step.js';
import { cases } from './engine_cases.mjs';
import { optionsFor } from '../js/engine.js';
same('the goals on the screen are the goals the state accepts', GOALS.map(g => g.key), GOAL_KEYS);
same('the markets on the screen are the markets the state accepts', SELL.map(x => x.key), SELL_KEYS);
check('every goal and market has a title and a line on what it changes', [...GOALS.map(g => [g.title, g.does]), ...SELL.map(x => [x.title, x.sub])].every(([a, b]) => a && b && b.length > 20));
same('five part names for five weights', PART_NAMES.length, 5);
same('no goal leaves the picture\'s weights as they are', weightsFor(PRIORITY_SETS.income, []), PRIORITY_SETS.income);
same('"Less fertiliser to buy" moves soil health one step up', weightsFor(PRIORITY_SETS.balanced, ['nitrogen']), [3, 4, 3, 3, 3]);
same('never above 5', weightsFor(PRIORITY_SETS.soil, ['nitrogen'])[1], 5);
same('the other goals move no weight', weightsFor(PRIORITY_SETS.balanced, ['forage', 'market']), PRIORITY_SETS.balanced);
same('a nudge after the sliders moved goes up and back down', nudge(nudge([1, 2, 3, 4, 5], 'nitrogen', true), 'nitrogen', false), [1, 2, 3, 4, 5]);
for (const [key, w] of Object.entries(PRIORITY_SETS)) {
  const line = doesLine(w), top = PART_NAMES[w.indexOf(Math.max(...w))];
  check(`the line for "${key}" names what counts most`, key === 'balanced' ? line === INPUT_WORDS.doesAll : line.includes(`${top} counts most`), line);
}
check('every tile of the six still has its weights', MATTERS.every(m => PRIORITY_SETS[m.value]));

// The engine reads state.goals and state.limits itself (js/compare.js inputsOf and withLimits, joined before this step), so the step's own
// engine view (withInputs) was not joined: these checks read the engine's functions instead, and test_engine checks the engine's answers.
const base = { ...newState(), loc: { lat: 44.4438, lon: -79.6618 }, rotation: { preset: 'corn-soy', custom: [], garden: null, second: {} }, farm: { ...newState().farm, irrigation: 'none' } };
same('the step\'s goal and market keys are the ones the engine reads', [GOAL_KEYS, SELL_KEYS], [ENGINE_GOALS, ENGINE_SELL]);
check('no goal and no limit: the engine reads none', (({ goals, sell, noDrill }) => !goals.size && !sell.size && !noDrill)(inputsOf(base)));
check('what the step keeps is what the engine reads', (({ goals, sell, noDrill }) => [...goals].join() === 'forage,market' && [...sell].join() === 'grain' && noDrill)(inputsOf({ ...base, goals: ['forage', 'market'], limits: { noDrill: true, sell: ['grain'] } })));
check('grain and oilseeds: corn, soybeans and canola, not hay', sellable('corn', new Set(['grain'])) && sellable('soy', new Set(['grain'])) && sellable('canola', new Set(['grain'])) && !sellable('alfalfa', new Set(['grain'])));
check('hay and feed: alfalfa and feed grains, not soybeans', sellable('alfalfa', new Set(['feed'])) && sellable('barley', new Set(['feed'])) && !sellable('soy', new Set(['feed'])));
check('the crops offered under "Crops I will not grow" are crops a new plan could hold', proposable().length > 5 && proposable().every(id => ['cash', 'forage'].includes(cropOf(id).type)) && !proposable().includes('apple'));

// the engine honours them on the recorded Barrie field
const [bs, BC, bspot, bopts] = cases()[2].args;
const plans = st => { const r = optionsFor(st, BC, bspot, bopts); return [r.current, ...r.others, ...(r.recommended ? [r.recommended] : [])]; };
const usesCover = p => p.seasons.some(x => x.cover), crops = p => p.seasons.map(x => x.crop).filter(id => id !== 'fallow');
check('Barrie, plain answers: a cover-crop plan is among the options', plans(bs).some(usesCover));
const pnd = plans({ ...bs, limits: { noDrill: true, sell: [] } });
check('Barrie, no small-seed drill: no plan sows a cover crop or alfalfa', !pnd.some(usesCover) && !pnd.some(p => crops(p).includes('alfalfa')));
const pveg = plans({ ...bs, limits: { noDrill: false, sell: ['veg'] } });
check('Barrie, vegetables only: every plan keeps corn and soybeans', pveg.every(p => crops(p).every(id => ['corn', 'soy'].includes(id))));
check('Barrie, vegetables only: still three plans to compare, the existing one too', new Set(pveg.map(p => p.id)).size >= 3 && pveg.some(p => p.kind === 'current'));
const pfeed = plans({ ...bs, limits: { noDrill: false, sell: ['feed'] } });
check('Barrie, hay and feed only: no new plan brings in wheat or canola', pfeed.every(p => !crops(p).includes('wheat') && !crops(p).includes('canola')));

// the drawing: every choice and its line, nothing undefined
const html = mattersHTML(base);
check('step 4 shows the six pictures, the three goals and the four limits', MATTERS.every(m => html.includes(`value="${m.value}"`)) && GOALS.every(g => html.includes(`value="${g.key}"`)) && html.includes('value="noDrill"') && SELL.every(x => html.includes(`value="${x.key}"`)) && html.includes('id="avoidAdd"'));
check('every goal and limit says what it changes', [...GOALS.map(g => g.does), INPUT_WORDS.noDrillDoes, INPUT_WORDS.sellDoes, INPUT_WORDS.avoidDoes].every(line => html.includes(line)));
// the setup was shortened: the water answer stays on step 3 only (the step's paper showed it again here with a "Change water" button)
check('the water is neither asked nor shown again on step 4', !html.includes('name="water"') && !html.includes('data-in="water"') && !/Rainfed/.test(html));
check('each goal says in one short line what it changes', GOALS.every(g => g.does.split(/[.!?](\s|$)/).filter(x => x && x.trim()).length === 1 && g.does.split(' ').length <= 15));
check('nothing reads undefined or null', !/undefined|null|NaN/.test(html));
check('the old switches for cover crops and animals are not asked twice', !html.includes('data-habit="coverOK"') && !html.includes('data-habit="livestock"'));
check('the line under the pictures follows the weights', html.includes(doesLine(base.prio)));

// the answers
const st = structuredClone(base);
inputsChange({ name: 'matters', type: 'radio', value: 'moisture' }, st); same('a picture sets its weights', [st.prioPreset, st.prio], ['moisture', PRIORITY_SETS.moisture]);
inputsChange({ name: 'goal', value: 'nitrogen', checked: true }, st); same('a goal on top of the picture', st.prio, [5, 4, 2, 2, 4]);
inputsChange({ name: 'matters', type: 'radio', value: 'balanced' }, st); same('another picture keeps the goal', st.prio, [3, 4, 3, 3, 3]);
inputsChange({ name: 'goal', value: 'nitrogen', checked: false }, st); same('the goal off again', st.prio, PRIORITY_SETS.balanced);
inputsChange({ name: 'goal', value: 'forage', checked: true }, st); check('"Feed for my animals" also sets "I keep animals"', st.goals.includes('forage') && st.farm.livestock === true);
inputsChange({ name: 'goal', value: 'zzz', checked: true }, st); same('an unknown goal is ignored', st.goals, ['forage']);
inputsChange({ name: 'limit', value: 'noDrill', checked: true }, st); check('no drill also turns cover crops off', st.limits.noDrill && st.farm.coverOK === false);
inputsChange({ name: 'sell', value: 'grain', checked: true }, st); inputsChange({ name: 'sell', value: 'feed', checked: true }, st); same('two markets', st.limits.sell, ['grain', 'feed']);
const r1 = inputsChange({ id: 'avoidAdd', value: 'rye' }, st); check('a crop is added to the ones left out, and focus stays on the list', st.avoid.includes('rye') && r1.focus === '#avoidAdd' && /Rye/.test(r1.say));
inputsChange({ id: 'avoidAdd', value: 'apple' }, st); check('only crops a plan could use can be left out', !st.avoid.includes('apple'));
check('the summary names the limits', /no small-seed drill/.test(takenAs(st)) && /sells only grain and oilseeds and hay and feed/.test(takenAs(st)) && /1 crop left out/.test(takenAs(st)), takenAs(st));
inputsClick({ dataset: { unavoid: 'rye' } }, st); check('and removed again', !st.avoid.includes('rye'));
same('other events are not step 4\'s', [inputsChange({ name: 'rot', value: 'corn-soy' }, st), inputsClick({ dataset: {} }, st)], [null, null]);
same('a demo field starts with no goal and no limit', [d.goals, d.limits, d.prioPreset], [[], { noDrill: false, sell: [] }, 'balanced']);

console.log(`wizard: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
