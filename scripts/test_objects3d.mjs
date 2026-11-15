// The 3D objects suite: js/objects3d-data.js (the 58 kinds at real size, sizes, cleaning, operations, ground fitting, clearing, readings, words)
// and js/objects3d-shapes.js (the 48 built shapes and their card pictures). No internet is needed.
// RULE: never loosen a check here without a written farming reason beside it. A farmer plans with these markers: a barn must be the size of a barn.
// Run: node scripts/test_objects3d.mjs
import * as o from '../js/objects3d-data.js';
import * as sh from '../js/objects3d-shapes.js';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, tol) => check(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);
const pin = { lat: 44.4, lon: -79.78 };
const fresh = () => ({ objects: [], farmLevel: 1 });

// ---- the catalogue
same('58 kinds in all', o.KINDS.length, 58);
same('by group: buildings 9, machines 4, trees and water 11, fences and tracks 7, other 19, readings 8', o.GROUPS.map(g => o.KINDS.filter(k => k.group === g.id).length), [9, 4, 11, 7, 19, 8]);
same('48 are built from code and 10 come from the pack', [sh.BUILT_KINDS.length, sh.PACK_KINDS.length], [48, 10]);
same('the pack kinds are the house marker, the person and the eight readings', sh.PACK_KINDS.slice().sort(), ['compass', 'flagpole', 'house-marker', 'person', 'rain-gauge', 'seed-bag', 'signpost', 'sprinkler', 'stump', 'windsock']);
check('every id is unique and lower-case with hyphens', new Set(o.KINDS.map(k => k.id)).size === 58 && o.KINDS.every(k => /^[a-z][a-z-]*$/.test(k.id)));
check('every kind has a name, a plural, a one-line sentence, and positive real sizes', o.KINDS.every(k => k.name && k.plural && k.line && k.w > 0 && k.d > 0 && k.h > 0));
const size = (id) => { const k = o.kindOf(id); return [k.w, k.d, k.h]; };
for (const [id, want] of Object.entries({ farmhouse: [10, 12, 7], barn: [12, 25, 8], shed: [4, 6, 3], silo: [6, 6, 20], 'water-tank': [4, 4, 6], greenhouse: [6, 15, 3], coop: [2, 3, 2.6], shelter: [8.4, 4.8, 3.5], container: [2.4, 12, 2.6],
  tractor: [2.2, 4, 2.8], combine: [7, 9, 4], trailer: [2.4, 7.5, 1.8], plough: [3, 2.2, 1.2], tree: [6, 6, 8.5], pine: [4, 4, 10], orchard: [15, 15, 4], pond: [15.6, 11.6, 0.3], well: [1.8, 1.4, 3], windmill: [3, 3, 10], trough: [2.2, 0.6, 0.7],
  gate: [3.6, 0.2, 1.3], bridge: [3, 6, 1.1], 'power-pole': [0.4, 2, 10], yard: [12, 12, 0.2], 'round-bale': [1.5, 1.2, 1.5], 'square-bales': [2.5, 1.2, 1], haystack: [4, 4, 4], firewood: [2.5, 1, 1.2], 'rock-small': [0.7, 0.7, 0.7], 'rock-large': [2.5, 2.5, 2.4],
  'rock-pile': [3, 3, 1.2], beehives: [2, 0.7, 0.9], scarecrow: [1.4, 0.3, 2.1], solar: [4, 2.4, 1.8], mailbox: [0.3, 0.55, 1.3], 'farm-sign': [2.2, 0.2, 2], 'picnic-table': [1.8, 1.5, 0.8], 'bird-house': [0.4, 0.4, 2.7], 'feeding-trough': [2.5, 0.9, 1], cow: [0.9, 2.3, 1.4],
  sheep: [0.6, 1.3, 0.85], 'house-marker': [10, 12, 7], person: [0.5, 0.4, 1.7], 'rain-gauge': [0.4, 0.4, 1], windsock: [1.8, 0.5, 4], stump: [0.8, 0.8, 0.5], flagpole: [1, 1, 6], compass: [1.2, 1.2, 0.3], signpost: [1.2, 0.3, 2.2], 'seed-bag': [0.6, 0.35, 0.9], sprinkler: [1.2, 1.2, 0.9] })) same(`${id} is ${want.join(' × ')} m`, size(id), want);
for (const [id, cross, len] of [['hedge', [1.4, 1.7], { min: 4, max: 120, def: 20 }], ['ditch', [2.2, 0.2], { min: 4, max: 200, def: 30 }], ['pipe', [0.4, 0.4], { min: 4, max: 300, def: 40 }], ['pivot', [1.4, 4.2], { min: 30, max: 400, def: 100 }], ['fence', [0.2, 1.2], { min: 3, max: 200, def: 24 }], ['track', [3.5, 0.05], { min: 4, max: 300, def: 40 }], ['power-line', [0.1, 9], { min: 10, max: 120, def: 40 }]]) {
  const k = o.kindOf(id); same(`${id}: cross-section ${cross.join(' × ')} m and length ${len.min}–${len.max} (starts ${len.def})`, [[k.w, k.h], k.len, k.d], [cross, len, len.def]);
}
same('only the strip kinds have a length', o.KINDS.filter(k => k.len).map(k => k.id).sort(), ['ditch', 'fence', 'hedge', 'pipe', 'pivot', 'power-line', 'track']);
same('the soft kinds clear no crop', o.KINDS.filter(k => k.soft).map(k => k.id).sort(), ['bird-house', 'compass', 'farm-sign', 'flagpole', 'mailbox', 'person', 'picnic-table', 'rain-gauge', 'rock-small', 'scarecrow', 'seed-bag', 'signpost', 'sprinkler', 'stump', 'windsock']);
same('the four kinds that cannot be turned say why', [['rain-gauge', 'windsock', 'compass'].map(id => o.kindOf(id).noTurn)], [['Rain gauge cannot be turned: it is round.', 'Windsock cannot be turned: it follows the wind.', 'Compass cannot be turned: it stays on true north.']]);
same('unknown, inherited and non-text kinds are not kinds', [o.kindOf('toString'), o.kindOf('__proto__'), o.kindOf(5), o.kindOf(null)], [null, null, null, null]);
same('nothing is placed by default', fresh().objects, []);

// ---- search and words
same('search: every word must match', [o.searchKinds('fence').map(k => k.id), o.searchKinds('barn hay').length, o.searchKinds('').length], [['fence'], 1, 58]);
same('search words', [o.matchWords(3), o.matchWords(1), o.matchWords(0)], ['3 objects match.', '1 object matches.', 'No object matches. Try another word.']);
check('the farm sign says it shows no words', o.kindOf('farm-sign').line.includes('It shows no words.'));
check('the unit for no overlap: every kind has a drawable shape or a plain stand-in', o.KINDS.every(k => sh.shapeOf(k.id, { w: k.w, d: k.d, h: k.h }).length > 0));

// ---- sizes: Real, Big 2x, Huge 4x and a fine size
same('levels', o.LEVELS.map(l => [l.id, l.label]), [[1, 'Real'], [2, 'Big 2x'], [4, 'Huge 4x']]);
{
  const tractor = { kind: 'tractor' };
  same('real size', (s => [s.w, s.d, s.h])(o.sizeOf(tractor, 1, 1000)), [2.2, 4, 2.8]);
  same('Big doubles every side, Huge quadruples', [o.sizeOf({ ...tractor, level: 2 }, 1, 1000), o.sizeOf({ ...tractor, level: 4 }, 1, 1000)].map(s => [s.w, s.d, s.h]), [[4.4, 8, 5.6], [8.8, 16, 11.2]]);
  same('the farm level applies to an object with no level of its own, and its own level wins', [o.sizeOf(tractor, 2, 1000).w, o.sizeOf({ ...tractor, level: 1 }, 2, 1000).w], [4.4, 2.2]);
  near('the fine scale multiplies', o.sizeOf({ ...tractor, scale: 1.25 }, 1, 1000).w, 2.75, 1e-9);
  const huge = o.sizeOf({ kind: 'barn', level: 4 }, 1, 100);
  check('no object is drawn longer than 30% of the land\'s width', Math.max(huge.w, huge.d) <= 30.0001, huge);
  check('a barn at real size on a small 40 m land is not shrunk below real by the cap alone... it may be capped at 30% of 40 m = 12 m', Math.max(o.sizeOf({ kind: 'barn' }, 1, 40).d) <= 25, o.sizeOf({ kind: 'barn' }, 1, 40));
  same('a length kind keeps its chosen length under Huge, only its cross-section grows', (s => [s.d, s.w])(o.sizeOf({ kind: 'fence', level: 4, length: 24 }, 1, 10000)), [24, 0.8]);
  check('never under 0.05 m', o.sizeOf({ kind: 'rock-small', scale: 0.5 }, 1, 10).w >= 0.05);
  same('fine scale snaps to 1 within 0.03 and clamps 0.5 to 2', [o.snapScale(1.02), o.snapScale(0.97), o.snapScale(3), o.snapScale(0.1)], [1, 1, 2, 0.5]);
}

// ---- cleaning what was saved
{
  const bad = [{ id: 'a1', kind: 'barn', lat: 44.4, lon: -79.78, turn: 370, scale: 1.01 }, { id: 'a1', kind: 'barn', lat: 44.4, lon: -79.78 }, { id: 'b', kind: 'spaceship', lat: 44.4, lon: -79.78 }, { id: 'c d', kind: 'barn', lat: 44.4, lon: -79.78 },
    { id: 'd', kind: 'barn', lat: 'x', lon: -79.78 }, { id: 'e', kind: 'barn', lat: 95, lon: 0 }, { id: 'f', kind: 'fence', lat: 50, lon: -70, length: 9999, level: 3, lock: 'yes' }, { id: 'g', kind: 'tractor', lat: 44.4000001234, lon: -79.78, scale: 1.5, level: 4, lock: true }, null, 5, 'x'];
  const c = o.cleanObjects(bad, pin);
  same('unknown kinds, duplicate or bad ids, bad places and non-objects are dropped', c.map(x => x.id), ['a1', 'f', 'g']);
  same('turn to 0–359, a near-1 scale dropped, the place to 6 decimals', [c[0].turn, 'scale' in c[0], c[2].lat], [10, false, 44.4]);
  check('a place far away is pulled back to within 0.5° of the pin', Math.abs(c[1].lat - pin.lat) <= 0.5 + 1e-9 && Math.abs(c[1].lon - pin.lon) <= 0.5 + 1e-9, c[1]);
  same('a length is clamped to the kind\'s range, a level of 3 is dropped, a lock only when exactly true', [c[1].length, 'level' in c[1], 'lock' in c[1], c[2].level, c[2].lock, c[2].scale], [200, false, false, 4, true, 1.5]);
  same('not a list: nothing', [o.cleanObjects(undefined, pin), o.cleanObjects({}, pin)], [[], []]);
  const many = Array.from({ length: 400 }, (_, i) => ({ id: 'x' + i, kind: 'barn', level: 4, lat: 44.4, lon: -79.78 }));
  same('a corrupted list is cleaned to the 150 most', o.cleanObjects(many, pin).length, 150);
}

// ---- operations
{
  let s = fresh(), r = o.addObject(s, 'barn', { x: 0, z: 0 }, pin, { facing: 100 });
  check('add: a barn is put at the centre, facing the camera to the 15° step', r.ok && r.state.objects.length === 1 && r.state.objects[0].turn === 105 && /Barn added at the centre of the view/.test(r.say), r);
  s = r.state; const id1 = r.id;
  r = o.addObject(s, 'barn', { x: 0, z: 0 }, pin);
  const p1 = o.placeOf(r.state.objects[0], pin), p2 = o.placeOf(r.state.objects[1], pin);
  check('a second one lands beside the first, never on top', Math.hypot(p1.x - p2.x, p1.z - p2.z) > 6, [p1, p2]);
  check('a kind that cannot turn is added facing 0', o.addObject(fresh(), 'compass', { x: 0, z: 0 }, pin, { facing: 100 }).state.objects[0].turn === 0);
  check('a strip kind starts at its own length', o.addObject(fresh(), 'fence', { x: 0, z: 0 }, pin).state.objects[0].length === 24);
  check('an unknown kind is refused in words', o.addObject(fresh(), 'xx', { x: 0, z: 0 }, pin).say === 'That object is not in the list.');
  const full = { objects: Array.from({ length: 150 }, (_, i) => ({ id: 'q' + i, kind: 'rock-small', lat: 44.4, lon: -79.78, turn: 0 })), farmLevel: 1 };
  same('at 150 it says so and adds nothing', (x => [x.ok, x.say, x.state.objects.length])(o.addObject(full, 'barn', { x: 0, z: 0 }, pin)), [false, 'Most objects reached: 150. Remove one first.', 150]);
  // move, turn, resize
  s = r.state; const [a, b] = s.objects.map(x => x.id);
  const mv = o.moveObjects(s, [a], 10, 0, pin); near('move: 10 m east (places are kept to 6 decimals of a degree, about 10 cm, so within 10 cm)', o.placeOf(mv.state.objects[0], pin).x - o.placeOf(s.objects[0], pin).x, 10, 0.1);
  same('turn: +15°, and -15° wraps', [o.turnObjects(s, [a]).state.objects[0].turn, o.turnObjects({ ...s, objects: [{ ...s.objects[0], turn: 5 }] }, [a], -15).state.objects[0].turn], [(s.objects[0].turn + 15) % 360, 350]);
  same('a windsock cannot be turned, and the words say why', (x => [x.ok, x.say])(o.turnObjects(o.addObject(fresh(), 'windsock', { x: 0, z: 0 }, pin).state, ['o1'])), [false, 'Windsock cannot be turned: it follows the wind.']);
  let sc = o.scaleObjects(s, [a], 1); same('larger: x1.25, "125 percent"', [sc.state.objects[0].scale, sc.say], [1.25, 'Barn 125 percent.']);
  for (let i = 0; i < 6; i++) sc = o.scaleObjects(sc.state, [a], 1);
  same('at the top: "Already the largest."', [sc.ok, sc.say, sc.state.objects[0].scale], [false, 'Already the largest.', 2]);
  sc = o.scaleObjects(s, [a], -1); near('smaller: /1.25', sc.state.objects[0].scale, 0.8, 1e-9);
  const lv = o.levelObjects(s, [a], 4); same('Huge for this one only', [lv.state.objects[0].level, lv.state.objects[1].level, lv.say], [4, undefined, 'Huge 4x for Barn.']);
  same('"Like farm" clears the level', 'level' in o.levelObjects(lv.state, [a], null).state.objects[0], false);
  // the farm default pins the placed ones first
  const fd = o.setFarmLevel(s, 2);
  same('changing the farm size pins the objects already placed, so only the next one changes', [fd.state.objects.map(x => x.level), fd.state.farmLevel, fd.say], [[1, 1], 2, 'New objects will be drawn 2x bigger than real. Objects already placed stay as they are.']);
  // lengths
  let f = o.addObject(fresh(), 'fence', { x: 0, z: 0 }, pin).state;
  same('longer: 24 → 26 (steps of 2 m under 30)', o.lengthObjects(f, ['o1'], 1).state.objects[0].length, 26);
  same('steps are 5 m under 100 and 10 m above', [o.lengthObjects({ ...f, objects: [{ ...f.objects[0], length: 40 }] }, ['o1'], 1).state.objects[0].length, o.lengthObjects({ ...f, objects: [{ ...f.objects[0], length: 100 }] }, ['o1'], 1).state.objects[0].length], [45, 110]);
  same('at the limits', [o.lengthObjects({ ...f, objects: [{ ...f.objects[0], length: 200 }] }, ['o1'], 1).say, o.lengthObjects({ ...f, objects: [{ ...f.objects[0], length: 3 }] }, ['o1'], -1).say], ['Already the longest.', 'Already the shortest.']);
  same('a barn has no length to change', o.lengthObjects(s, [a], 1).say, 'This one has no length to change.');
  // copy, lock, remove
  const cp = o.copyObjects(s, [a], pin); check('copy: beside the original, never locked', cp.state.objects.length === 3 && !cp.state.objects[2].lock && cp.say === 'Barn copied');
  const lk = o.lockObjects(s, [a], true); check('lock', lk.state.objects[0].lock === true);
  same('a locked object is never moved, turned, resized, copied or removed', [o.moveObjects(lk.state, [a], 5, 5, pin).say, o.turnObjects(lk.state, [a]).say, o.scaleObjects(lk.state, [a], 1).say, o.copyObjects(lk.state, [a], pin).say, o.removeObjects(lk.state, [a]).say],
    ['Locked. Unlock to move.', 'Locked. Unlock to turn.', 'Locked. Unlock to resize.', 'Locked. Unlock to copy.', 'Locked. Unlock to remove.']);
  const rm = o.removeObjects(s, [a]); same('remove', [rm.state.objects.map(x => x.id), rm.say], [[b], 'Barn removed']);
  same('remove all keeps the locked, and says so', (x => [x.state.objects.map(y => y.id), x.say])(o.removeAll(lk.state)), [[a], 'All 1 object removed; 1 locked stay']);
  same('lock all and unlock all', [o.lockAll(s, true).state.objects.every(x => x.lock), 'lock' in o.lockAll(o.lockAll(s, true).state, false).state.objects[0]], [true, false]);
  check('state is never changed in place', s.objects[0].scale === undefined && s.objects.length === 2 && s.objects[0].turn === 105);
}

// ---- undo: 30 steps, the same action within 1.2 s merged
{
  let h = o.makeHistory(), cur = fresh();
  const step = (action, at) => { const before = cur; cur = o.addObject(cur, 'rock-small', { x: cur.objects.length * 3, z: 0 }, pin).state; h = o.remember(h, before, action, at); };
  step('add', 0); step('add', 500); step('add', 1000);
  same('three quick adds are one step', h.steps.length, 1);
  step('add', 5000); same('a pause makes a new step', h.steps.length, 2);
  step('move', 5100); same('another action is its own step', h.steps.length, 3);
  const u = o.undo(h, cur); same('undo takes the last change back', [u.state.objects.length, u.say], [4, 'Undone.']);
  for (let i = 0; i < 40; i++) step('turn' + i, 10000 + i * 5000);
  same('at most 30 steps are kept', h.steps.length, 30);
  same('nothing to undo says so', o.undo(o.makeHistory(), cur).say, 'Nothing to undo.');
}

// ---- standing on the ground
{
  const slope = (x, z) => 0.1 * x, tilt = { kind: 'barn', turn: 0 };
  const barn = o.groundFit(slope, tilt, { w: 12, d: 25, h: 8 }, { x: 0, z: 0 });
  near('a building stands on the lowest of its four corners, so none floats: 6 m west of centre is 0.6 m down', barn.y, -0.6, 1e-9);
  const rock = o.groundFit(slope, { kind: 'rock-small', turn: 0 }, { w: 0.7, d: 0.7, h: 0.7 }, { x: 10, z: 0 });
  same('a small thing stands on the point under it', [rock.y, rock.tilt], [1, 0]);
  const fence = o.groundFit(slope, { kind: 'fence', turn: 90 }, { w: 0.2, d: 20, h: 1.2 }, { x: 0, z: 0 });
  check('a strip kind lies along the slope, tilted by the rise over its length, up to 0.6 rad', Math.abs(fence.tilt) > 0.09 && Math.abs(fence.tilt) < 0.11 && Math.abs(fence.y) < 1e-9, fence);
  const steep = o.groundFit((x) => 5 * x, { kind: 'fence', turn: 90 }, { w: 0.2, d: 20, h: 1.2 }, { x: 0, z: 0 });
  check('the tilt never passes 0.6 rad', Math.abs(steep.tilt) <= 0.6 + 1e-9);
  same('a missing height is not stood on: reported, never invented', o.groundFit(() => NaN, tilt, { w: 12, d: 25, h: 8 }, { x: 0, z: 0 }).missing, true);
}

// ---- crops cleared under a footprint
{
  const farmhouse = { kind: 'farmhouse', turn: 0 }, dims = { w: 10, d: 12, h: 7 }, c = o.clearingOf(farmhouse, dims, { x: 0, z: 0 });
  check('a farmhouse 10 × 12 m clears 11.2 × 13.2 m (the footprint plus 0.5 m or 5% of its long side, a side each: here 0.6 m)', Math.abs(c.w - 11.2) < 1e-9 && Math.abs(c.d - 13.2) < 1e-9 && c.pad, [c.w, c.d, c.pad]);
  check('inside is cleared, outside is not', c.contains(5, 6) && c.contains(0, 0) && !c.contains(6, 0) && !c.contains(0, 7));
  const turned = o.clearingOf({ kind: 'farmhouse', turn: 90 }, dims, { x: 0, z: 0 });
  check('turned 90°, the long side runs across', turned.contains(6, 0) && !turned.contains(0, 7));
  near('a big building clears 5% of its long side a side: a 25 m barn clears 27.5 m', o.clearingOf({ kind: 'barn', turn: 0 }, { w: 12, d: 25, h: 8 }, { x: 0, z: 0 }).d, 27.5, 1e-9);
  same('a soft kind clears nothing', o.clearingOf({ kind: 'scarecrow', turn: 0 }, { w: 1.4, d: 0.3, h: 2.1 }, { x: 0, z: 0 }), null);
  same('under 2.5 m wide: cleared, but no soil pad', o.clearingOf({ kind: 'trough', turn: 0 }, { w: 2.2, d: 0.6, h: 0.7 }, { x: 0, z: 0 }).pad, false);
  check('it is redrawn only when it moves 0.1 m or 0.1°', !o.clearingMoved({ x: 0, z: 0, turn: 0 }, { x: 0.05, z: 0, turn: 0.05 }) && o.clearingMoved({ x: 0, z: 0, turn: 0 }, { x: 0.2, z: 0, turn: 0 }) && o.clearingMoved({ x: 0, z: 0, turn: 0 }, { x: 0, z: 0, turn: 0.2 }));
}

// ---- the readings: real data, or dimmed with a reason, never a made-up value
{
  const R = o.readingOf;
  same('rain gauge: filled to the forecast rain, full at 50 mm', [R('rain-gauge', { today: true, rainMm: 12 }).fill, R('rain-gauge', { today: true, rainMm: 80 }).fill, R('rain-gauge', { today: true, rainMm: 12 }).words], [0.24, 1, 'Filled to the forecast rain for today, 12 mm (full: 50 mm or more).']);
  same('rain gauge: dimmed with its reason on another day or with no forecast', [R('rain-gauge', { today: false, rainMm: 3 }).words, R('rain-gauge', { today: true }).words, R('rain-gauge', { today: true }).shown], ['Not shown: Shown for Today only: it holds the forecast rain.', 'Not shown: No forecast rain for this day right now.', false]);
  same('windsock: limp under 15 km/h, half to 40, full above', [R('windsock', { windKmh: 10, windFrom: 270 }).fill, R('windsock', { windKmh: 23, windFrom: 292 }).fill, R('windsock', { windKmh: 55, windFrom: 0 }).fill], [0, 0.5, 1]);
  same('windsock words and direction (from the west-north-west, pointing east-south-east)', (x => [x.words, x.pointsTo])(R('windsock', { windKmh: 23, windFrom: 292 })), ['Forecast wind 23 km/h from the west-north-west; the sock points the way it blows and is half full.', 112]);
  same('windsock without a direction says so, never guesses', R('windsock', { windKmh: 23 }).words, 'Not shown: The forecast did not say where the wind comes from.');
  same('stump: one ring for each NASA year, or not shown with back-up weather', [R('stump', { years: { nasa: true, from: 2001, to: 2026, count: 26 } }).rings, R('stump', { years: { nasa: false } }).words], [26, "Not shown: The back-up weather is in use, not NASA's, so no years are counted."]);
  same('flagpole: pennants up to 8, gold when all earned', (x => [x.pennants, x.gold, x.words])(R('flagpole', { stamps: { earned: 4, total: 4 } })), [4, true, "One pennant for each of the farm's 4 stamps, raised as far as you have come; 4 of 4 at the top (gold)."]);
  same('flagpole never shows more than 8 pennants', R('flagpole', { stamps: { earned: 3, total: 12 } }).pennants, 8);
  same('compass always points to true north', R('compass').north, true);
  same('signpost: warnings, or "no forecast warning"', [R('signpost', { warnings: [] }).words, R('signpost', { warnings: [{ field: 'North field', text: 'Frost tonight.' }] }).words], ['No forecast warning for your fields right now.', 'North field: Frost tonight.']);
  same('seed bag: the crop the plan sows this month, or nothing', [R('seed-bag', { sowing: { fieldName: 'North field', crop: 'winter wheat' } }).words, R('seed-bag', { sowing: { fieldName: 'North field', crop: null } }).words], ['North field: your plan sows winter wheat this month.', 'Your plan sows nothing on North field in the month shown.']);
  same('sprinkler: a wheel-line for full watering, a drip reel for limited, none', [R('sprinkler', { watering: { fieldName: 'A', kind: 'full' } }).style, R('sprinkler', { watering: { fieldName: 'A', kind: 'limited' } }).style, R('sprinkler', { watering: { fieldName: 'A', kind: null } }).words], ['wheel-line', 'drip-reel', 'A has no watering in your plan.']);
  same('a non-reading kind has no reading', R('barn').words, 'Your own marker. It shows no reading.');
  check('every reading kind is dimmed at 38% when it has nothing to show', o.READING_KINDS.filter(k => ['rain-gauge', 'windsock', 'stump', 'flagpole', 'seed-bag', 'sprinkler'].includes(k.id)).every(k => { const r = o.readingOf(k.id, {}); return r.shown === false && r.dim === 0.38 && /^Not shown: /.test(r.words); }));
}

// ---- words
same('in words: nothing placed', o.inWords([]), ['Nothing is placed on your land. Open Add objects to put a barn, a fence, a tractor, a rain gauge and more where you want them.']);
{
  const objs = [{ kind: 'barn', level: 2 }, { kind: 'barn' }, { kind: 'silo', level: 4 }, { kind: 'silo', level: 4 }, { kind: 'rain-gauge' }];
  const w = o.inWords(objs);
  check('in words names what was placed and what is drawn bigger than real', w[0].includes('1 object is drawn 2x bigger than real') && w[0].includes('2 objects are drawn 4x bigger than real') && w[1].startsWith('You placed 2 barns, 2 grain silos and 1 rain gauge.') && w[1].endsWith('These are your own markers, not measured things.') && w[2] === 'Objects with a reading show records, not things on your land.', w);
  same('all at real size', o.inWords([{ kind: 'barn' }])[0], 'Objects are drawn at real size.');
}
same('size group label', [o.sizeGroupLabel([], 1), o.sizeGroupLabel([{ kind: 'tractor' }], 1), o.sizeGroupLabel([{ kind: 'tractor' }, { kind: 'barn' }], 1)], ['Size of the next object', 'Size of this tractor', 'Size of the 2 chosen objects']);
same('size hints', [o.sizeHint(1, 1), o.sizeHint(0, 2)], ['Only the chosen object changes size.', 'The next one is drawn 2x bigger than real. The ones already placed stay as they are.']);
same('a barn on a field gets its note', o.solidNote('Barn', 'North field'), 'Barn stands on North field. That is allowed; move it if you did not mean to cover the crop.');
same('arrow steps: the span × 0.004, 0.5 to 20 m, Shift five times', [o.arrowStep(1000), o.arrowStep(10), o.arrowStep(1e6), o.arrowStep(1000, true)], [4, 0.5, 20, 20]);
check('the key help names every key', ['Arrow keys', 'R turns', '[ and ]', 'D copies', 'L locks', 'Delete removes', 'Control Z'].every(w => o.KEY_HELP.includes(w)));

// ---- the shapes
{
  const bad = [];
  for (const k of o.KINDS) {
    const dims = { w: k.w, d: k.d, h: k.h }, parts = sh.shapeOf(k.id, dims);
    if (!parts.length) { bad.push(`${k.id}: no parts`); continue; }
    for (const p of parts) {
      if (![p.x, p.y, p.z, p.w, p.h, p.d].every(Number.isFinite) || p.w <= 0 || p.h <= 0 || p.d <= 0) bad.push(`${k.id}: a part with a missing size`);
      if (!/^#[0-9a-f]{6}$/i.test(p.c)) bad.push(`${k.id}: a part without a colour`);
      if (p.y < -0.001) bad.push(`${k.id}: a part under the ground`);
    }
    const bx = parts.map(sh.partBounds), x0 = Math.min(...bx.map(b => b.x0)), x1 = Math.max(...bx.map(b => b.x1)), z0 = Math.min(...bx.map(b => b.z0)), z1 = Math.max(...bx.map(b => b.z1)), y1 = Math.max(...bx.map(b => b.y1));
    const ok = (got, want, slack) => got <= want * (1 + slack) + 0.15;
    if (!ok(x1 - x0, k.w, 0.25)) bad.push(`${k.id}: wider than real (${(x1 - x0).toFixed(2)} vs ${k.w})`);
    if (!ok(z1 - z0, k.d, 0.25)) bad.push(`${k.id}: longer than real (${(z1 - z0).toFixed(2)} vs ${k.d})`);
    if (!ok(y1, k.h, 0.15)) bad.push(`${k.id}: taller than real (${y1.toFixed(2)} vs ${k.h})`);
    if (y1 < k.h * 0.6) bad.push(`${k.id}: much lower than real (${y1.toFixed(2)} vs ${k.h})`);
  }
  same('every one of the 58 kinds draws, with sizes, colours and a base on the ground, and none is bigger or much smaller than its real size', bad, []);
  const fence = sh.shapeOf('fence', { w: 0.2, d: 24, h: 1.2 }), posts = fence.filter(p => p.h === 1.2 && p.w === 0.2);
  same('a 24 m fence has a post about every 3 m: 9 posts', posts.length, 9);
  check('a 6 m fence has 3 posts and a 200 m one has 68', sh.shapeOf('fence', { w: 0.2, d: 6, h: 1.2 }).filter(p => p.h === 1.2).length === 3 && sh.shapeOf('fence', { w: 0.2, d: 200, h: 1.2 }).filter(p => p.h === 1.2).length === 68);
  check('the shape scales with the drawn size: a Huge barn is 4 times the parts\' reach', (b => b.x1 - b.x0)(sh.partBounds(sh.shapeOf('barn', { w: 48, d: 100, h: 32 })[0])) === 48);
  check('every colour is from the quiet tones, with navy only as the one accent', o.KINDS.every(k => sh.shapeOf(k.id, { w: k.w, d: k.d, h: k.h }).every(p => Object.values(sh.TONES).includes(p.c))));
  const svgs = o.KINDS.map(k => [k.id, sh.cardSvg(k.id)]);
  check('every kind has a 48 × 48 card picture with no stray number and no text', svgs.every(([, s]) => /^<svg [^>]*viewBox="0 0 48 48"[^>]*aria-hidden="true"/.test(s) && !/NaN|undefined|Infinity/.test(s) && !/<text/.test(s)), svgs.filter(([, s]) => /NaN|undefined|Infinity|<text/.test(s)).map(a => a[0]));
  check('the pictures differ: a barn and a tractor are not the same drawing', sh.cardSvg('barn') !== sh.cardSvg('tractor'));
  same('an unknown kind has no picture and no shape', [sh.cardSvg('nope'), sh.shapeOf('nope', { w: 1, d: 1, h: 1 })], ['', []]);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
