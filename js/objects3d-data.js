// The 3D farm's objects, pure: the catalogue of 58 kinds at their real size in metres, the sizes (Real, Big 2x, Huge 4x and a fine size), the cleaners,
// the operations (add, move, turn, resize, copy, lock, remove, undo), standing on the ground, the crops cleared under a footprint, the readings and the words.
// Nothing is placed for the farmer: the list starts empty. No page, no storage, no network, nothing random.
// Checked by scripts/test_objects3d.mjs.
import { metresPerDegreeLat, metresPerDegreeLon } from './farm3d-data.js';

export const MAX_OBJECTS = 150, TURN_STEP = 15, PULL_BACK_DEG = 0.5, TABLE_SHARE = 0.94, MAX_UNDO = 30, MERGE_MS = 1200;
export const LEVELS = [{ id: 1, label: 'Real' }, { id: 2, label: 'Big 2x' }, { id: 4, label: 'Huge 4x' }];
export const FINE = { min: 0.5, max: 2, step: 1.25, snap: 0.03 };
export const LAND_SHARE = 0.3;      // no object is drawn longer than 30% of the land's width
export const PICK_PX = 22, TAP_PX = 5;

export const GROUPS = [
  { id: 'buildings', name: 'Buildings' }, { id: 'machines', name: 'Machines' }, { id: 'trees-water', name: 'Trees and water' },
  { id: 'fences-tracks', name: 'Fences and tracks' }, { id: 'other', name: 'Other' }, { id: 'readings', name: 'Readings' },
];

// kind: id, name, plural, group, w (across, x), d (along, z), h (up), line (one line on its card), solid (stands on a field: a note), soft (clears no crop),
// shadow (the big kinds cast one), len {min, max, def} for a strip kind (its d is the length, w and h its cross-section), noTurn (why it cannot be turned), pack (a pack model),
// reading (what it shows; from the pack). Sizes are real metres.
const K = (id, name, group, w, d, h, line, extra = {}) => ({ id, name, plural: extra.plural ?? name.toLowerCase() + 's', group, w, d, h, line, ...extra });
export const KINDS = [
  K('farmhouse', 'Farmhouse', 'buildings', 10, 12, 7, 'A one-storey house.', { solid: true, shadow: true }),
  K('barn', 'Barn', 'buildings', 12, 25, 8, 'A big barn for hay and machines.', { solid: true, shadow: true }),
  K('shed', 'Shed or workshop', 'buildings', 4, 6, 3, 'A small shed.', { plural: 'sheds', solid: true, shadow: true }),
  K('silo', 'Grain silo', 'buildings', 6, 6, 20, 'A tall round grain store.', { solid: true, shadow: true }),
  K('water-tank', 'Water tank', 'buildings', 4, 4, 6, 'A tank on legs.', { solid: true, shadow: true }),
  K('greenhouse', 'Greenhouse', 'buildings', 6, 15, 3, 'A glass house for seedlings.', { solid: true, shadow: true }),
  K('coop', 'Chicken coop', 'buildings', 2, 3, 2.6, 'A small coop.', { solid: true }),
  K('shelter', 'Livestock shelter', 'buildings', 8.4, 4.8, 3.5, 'An open shelter for animals.', { solid: true, shadow: true }),
  K('container', 'Shipping container', 'buildings', 2.4, 12, 2.6, 'A steel box.', { solid: true, shadow: true }),

  K('tractor', 'Tractor', 'machines', 2.2, 4, 2.8, 'A farm tractor.'),
  K('combine', 'Combine harvester', 'machines', 7, 9, 4, 'A harvesting machine.', { shadow: true }),
  K('trailer', 'Trailer', 'machines', 2.4, 7.5, 1.8, 'A farm trailer.'),
  K('plough', 'Plough or tool', 'machines', 3, 2.2, 1.2, 'A tool that hangs behind a tractor.', { plural: 'ploughs or tools' }),

  K('tree', 'Tree', 'trees-water', 6, 6, 8.5, 'A broad tree.', { shadow: true }),
  K('pine', 'Pine tree', 'trees-water', 4, 4, 10, 'A tall pine.', { shadow: true }),
  K('orchard', 'Orchard patch', 'trees-water', 15, 15, 4, 'Nine small fruit trees.', { plural: 'orchard patches' }),
  K('hedge', 'Hedge', 'trees-water', 1.4, 20, 1.7, 'A row of shrubs, as long as you choose.', { len: { min: 4, max: 120, def: 20 } }),
  K('pond', 'Pond', 'trees-water', 15.6, 11.6, 0.3, 'A farm pond.'),
  K('well', 'Well or pump', 'trees-water', 1.8, 1.4, 3, 'A hand pump over a well.', { plural: 'wells or pumps' }),
  K('windmill', 'Windmill pump', 'trees-water', 3, 3, 10, 'A wind pump on a tower.', { shadow: true }),
  K('trough', 'Water trough', 'trees-water', 2.2, 0.6, 0.7, 'A trough for animals.'),
  K('ditch', 'Ditch or stream', 'trees-water', 2.2, 30, 0.2, 'A ditch, as long as you choose.', { plural: 'ditches or streams', len: { min: 4, max: 200, def: 30 } }),
  K('pipe', 'Irrigation pipe', 'trees-water', 0.4, 40, 0.4, 'A pipe laid on the ground.', { len: { min: 4, max: 300, def: 40 } }),
  K('pivot', 'Pivot arm', 'trees-water', 1.4, 100, 4.2, 'The arm of a centre pivot sprinkler.', { len: { min: 30, max: 400, def: 100 } }),

  K('fence', 'Fence', 'fences-tracks', 0.2, 24, 1.2, 'A fence, as long as you choose. A post about every 3 m.', { len: { min: 3, max: 200, def: 24 } }),
  K('gate', 'Gate', 'fences-tracks', 3.6, 0.2, 1.3, 'A farm gate.'),
  K('track', 'Farm track', 'fences-tracks', 3.5, 40, 0.05, 'A dirt track, as long as you choose.', { len: { min: 4, max: 300, def: 40 } }),
  K('bridge', 'Bridge or culvert', 'fences-tracks', 3, 6, 1.1, 'A small bridge over a ditch.', { plural: 'bridges or culverts' }),
  K('power-pole', 'Power pole', 'fences-tracks', 0.4, 2, 10, 'A wooden pole with a cross-arm.', { shadow: true }),
  K('power-line', 'Power line span', 'fences-tracks', 0.1, 40, 9, 'A wire between two poles.', { plural: 'power line spans', len: { min: 10, max: 120, def: 40 } }),
  K('yard', 'Yard or parking pad', 'fences-tracks', 12, 12, 0.2, 'A hard pad of gravel.', { plural: 'yards or parking pads' }),

  K('round-bale', 'Round bale', 'other', 1.5, 1.2, 1.5, 'A round hay bale.'),
  K('square-bales', 'Square bales', 'other', 2.5, 1.2, 1, 'A stack of square bales.', { plural: 'stacks of square bales' }),
  K('haystack', 'Haystack', 'other', 4, 4, 4, 'A heap of hay.', { plural: 'haystacks' }),
  K('firewood', 'Firewood stack', 'other', 2.5, 1, 1.2, 'Split logs, stacked.', { plural: 'firewood stacks' }),
  K('rock-small', 'Small rock', 'other', 0.7, 0.7, 0.7, 'A rock you can lift.', { soft: true }),
  K('rock-large', 'Large rock', 'other', 2.5, 2.5, 2.4, 'A boulder.'),
  K('rock-pile', 'Rock pile', 'other', 3, 3, 1.2, 'A heap of cleared stones.', { plural: 'rock piles' }),
  K('beehives', 'Beehives', 'other', 2, 0.7, 0.9, 'Two hives on a stand.', { plural: 'sets of beehives' }),
  K('scarecrow', 'Scarecrow', 'other', 1.4, 0.3, 2.1, 'A scarecrow on a pole.', { soft: true }),
  K('solar', 'Solar panels', 'other', 4, 2.4, 1.8, 'A row of solar panels on a frame.', { plural: 'sets of solar panels' }),
  K('mailbox', 'Mailbox', 'other', 0.3, 0.55, 1.3, 'A mailbox on a post.', { soft: true }),
  K('farm-sign', 'Farm sign', 'other', 2.2, 0.2, 2, 'A sign board. It shows no words.', { soft: true }),
  K('picnic-table', 'Picnic table', 'other', 1.8, 1.5, 0.8, 'A table with benches.', { soft: true }),
  K('bird-house', 'Bird house', 'other', 0.4, 0.4, 2.7, 'A bird house on a pole.', { soft: true, plural: 'bird houses' }),
  K('feeding-trough', 'Feeding trough', 'other', 2.5, 0.9, 1, 'A long feeder.'),
  K('cow', 'Cow', 'other', 0.9, 2.3, 1.4, 'A cow.', { plural: 'cows' }),
  K('sheep', 'Sheep', 'other', 0.6, 1.3, 0.85, 'A sheep.', { plural: 'sheep' }),
  K('house-marker', 'House marker', 'other', 10, 12, 7, 'Marks where a house stands. It shows no reading.', { plural: 'house markers', pack: 'prop-house', solid: true }),
  K('person', 'Person', 'other', 0.5, 0.4, 1.7, 'A person standing.', { plural: 'people', pack: 'prop-person', soft: true }),

  K('rain-gauge', 'Rain gauge', 'readings', 0.4, 0.4, 1, 'Filled to the forecast rain.', { pack: 'piece-rain-gauge', reading: 'rain', noTurn: 'Rain gauge cannot be turned: it is round.', soft: true }),
  K('windsock', 'Windsock', 'readings', 1.8, 0.5, 4, 'Points the way the forecast wind blows.', { pack: 'piece-windsock', reading: 'wind', noTurn: 'Windsock cannot be turned: it follows the wind.', soft: true }),
  K('stump', 'Tree stump', 'readings', 0.8, 0.8, 0.5, 'One ring for each year of NASA weather.', { pack: 'piece-stump', reading: 'rings', soft: true }),
  K('flagpole', 'Flagpole', 'readings', 1, 1, 6, 'One pennant for each stamp the farm has earned.', { pack: 'piece-flagpole', reading: 'stamps', soft: true }),
  K('compass', 'Compass', 'readings', 1.2, 1.2, 0.3, 'Always points to true north.', { pack: 'prop-compass', reading: 'north', noTurn: 'Compass cannot be turned: it stays on true north.', soft: true }),
  K('signpost', 'Signpost', 'readings', 1.2, 0.3, 2.2, 'Carries the forecast warnings for your fields.', { pack: 'prop-signpost', reading: 'warnings', soft: true }),
  K('seed-bag', 'Seed bag', 'readings', 0.6, 0.35, 0.9, 'Shows the crop your plan sows this month.', { pack: 'prop-seed-bag', reading: 'sowing', soft: true }),
  K('sprinkler', 'Sprinkler', 'readings', 1.2, 1.2, 0.9, "Shows the field's watering.", { pack: 'prop-irrigation', reading: 'watering', soft: true }),
];
for (const k of KINDS) { k.built = !k.pack; if (k.len) k.d = k.len.def; }
const BY_ID = new Map(KINDS.map(k => [k.id, k]));
export const kindOf = id => typeof id === 'string' && BY_ID.has(id) ? BY_ID.get(id) : null;
export const READING_KINDS = KINDS.filter(k => k.reading);

// ---- search: every word must match the name or the line
export function searchKinds(query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return KINDS;
  return KINDS.filter(k => { const text = (k.name + ' ' + k.plural + ' ' + k.line).toLowerCase(); return words.every(w => text.includes(w)); });
}
export const matchWords = n => n === 0 ? 'No object matches. Try another word.' : `${n} object${n === 1 ? '' : 's'} match${n === 1 ? 'es' : ''}.`;

// ---- sizes. An object: {id, kind, lat, lon, turn (0-359), scale (fine, default 1), level (1 2 4, optional), length (strip kinds), lock}
export const levelLabel = l => (LEVELS.find(x => x.id === l) || LEVELS[0]).label;
export function snapScale(s) { const v = Math.min(FINE.max, Math.max(FINE.min, s)); return Math.abs(v - 1) <= FINE.snap + 1e-9 ? 1 : v; }
// The drawn size in metres: level × fine scale, capped at 30% of the land's width, never under 0.05. Length kinds keep their chosen length (the level does not stretch them).
export function sizeOf(obj, farmLevel = 1, landWidth = Infinity) {
  const k = kindOf(obj.kind); if (!k) return null;
  const level = obj.level ?? farmLevel, f = level * (obj.scale ?? 1), cap = LAND_SHARE * landWidth;
  const grow = (v, strip = false) => Math.max(0.05, strip ? v : Math.min(v * f, Math.max(v, cap)));
  let w = k.w * f, h = k.h * f, d = k.len ? clamp(obj.length ?? k.len.def, k.len.min, k.len.max) : k.d * f;
  const longest = Math.max(w, d);
  if (longest > cap && cap < Infinity) { const s = Math.max(cap / longest, 1 / f); if (!k.len) { w *= s; d *= s; h *= s; } else { w *= Math.min(1, s); h *= Math.min(1, s); } }
  return { w: Math.max(0.05, w), d: Math.max(0.05, d), h: Math.max(0.05, h), level, scale: obj.scale ?? 1 };
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---- places: latitude and longitude to 6 decimals, pulled back within 0.5° of the pin
const six = v => Math.round(v * 1e6) / 1e6;
export function cleanObjects(list, pin) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(), out = [];
  for (const o of list) {
    if (out.length >= MAX_OBJECTS) break;
    if (!o || typeof o !== 'object') continue;
    const k = kindOf(o.kind); if (!k) continue;
    if (typeof o.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(o.id) || seen.has(o.id)) continue;
    let lat = Number(o.lat), lon = Number(o.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (pin) { lat = clamp(lat, pin.lat - PULL_BACK_DEG, pin.lat + PULL_BACK_DEG); lon = clamp(lon, pin.lon - PULL_BACK_DEG, pin.lon + PULL_BACK_DEG); }
    const clean = { id: o.id, kind: k.id, lat: six(lat), lon: six(lon), turn: ((Math.round(Number(o.turn) || 0) % 360) + 360) % 360 };
    if (Number.isFinite(Number(o.scale)) && snapScale(Number(o.scale)) !== 1) clean.scale = snapScale(Number(o.scale));
    if ([1, 2, 4].includes(Number(o.level)) ) clean.level = Number(o.level);
    if (k.len) clean.length = clamp(Math.round(Number(o.length) || k.len.def), k.len.min, k.len.max);
    if (o.lock === true) clean.lock = true;
    seen.add(o.id); out.push(clean);
  }
  return out;
}

// ---- operations: each takes the state {objects, farmLevel} and returns {state, say, ok}; nothing is changed in place
const nextId = objects => { let n = objects.length + 1; const ids = new Set(objects.map(o => o.id)); while (ids.has('o' + n)) n++; return 'o' + n; };
const toXZ = (o, pin) => ({ x: (o.lon - pin.lon) * metresPerDegreeLon(pin.lat), z: -(o.lat - pin.lat) * metresPerDegreeLat(pin.lat) });
const fromXZ = (x, z, pin) => ({ lat: six(pin.lat - z / metresPerDegreeLat(pin.lat)), lon: six(pin.lon + x / metresPerDegreeLon(pin.lat)) });
export const placeOf = toXZ, placeAt = fromXZ;
const withObjects = (state, objects) => ({ ...state, objects });
const nameOf = o => kindOf(o.kind).name;

export function addObject(state, kindId, at, pin, { facing = 0, landWidth = Infinity } = {}) {
  const k = kindOf(kindId);
  if (!k) return { state, ok: false, say: 'That object is not in the list.' };
  if (state.objects.length >= MAX_OBJECTS) return { state, ok: false, say: `Most objects reached: ${MAX_OBJECTS}. Remove one first.` };
  let { x, z } = at;
  // a second one beside the first, never on top
  const dims = sizeOf({ kind: kindId, level: undefined }, state.farmLevel ?? 1, landWidth);
  for (let n = 0; n < 40; n++) {
    const clash = state.objects.some(o => { const p = toXZ(o, pin), s = sizeOf(o, state.farmLevel ?? 1, landWidth); return Math.abs(p.x - x) < (s.w + dims.w) / 4 + 0.1 && Math.abs(p.z - z) < (s.d + dims.d) / 4 + 0.1; });
    if (!clash) break;
    x += dims.w * 0.75 + 0.5;
  }
  const turn = (Math.round(facing / TURN_STEP) * TURN_STEP % 360 + 360) % 360;
  const o = { id: nextId(state.objects), kind: kindId, ...fromXZ(x, z, pin), turn: k.noTurn ? 0 : turn };
  if (k.len) o.length = k.len.def;
  return { state: withObjects(state, [...state.objects, o]), ok: true, id: o.id, say: `${k.name} added at the centre of the view` };
}
const edit = (state, ids, fn) => {
  const set = new Set(ids); let changed = 0;
  const objects = state.objects.map(o => { if (!set.has(o.id)) return o; const r = fn(o); if (r && r !== o) { changed++; return r; } return o; });
  return { objects, changed };
};
export function moveObjects(state, ids, dx, dz, pin) {
  const movable = state.objects.filter(o => ids.includes(o.id) && !o.lock);
  if (!movable.length) return { state, ok: false, say: 'Locked. Unlock to move.' };
  const { objects } = edit(state, movable.map(o => o.id), o => { const p = toXZ(o, pin); return { ...o, ...fromXZ(p.x + dx, p.z + dz, pin) }; });
  return { state: withObjects(state, objects), ok: true, say: `${nameOf(movable[0])} moved` };
}
export function turnObjects(state, ids, delta = TURN_STEP) {
  const targets = state.objects.filter(o => ids.includes(o.id));
  const blocked = targets.find(o => kindOf(o.kind).noTurn);
  if (blocked && targets.length === 1) return { state, ok: false, say: kindOf(blocked.kind).noTurn };
  if (targets.every(o => o.lock)) return { state, ok: false, say: 'Locked. Unlock to turn.' };
  const { objects } = edit(state, ids, o => o.lock || kindOf(o.kind).noTurn ? o : { ...o, turn: ((o.turn + delta) % 360 + 360) % 360 });
  return { state: withObjects(state, objects), ok: true, say: `Turned by ${Math.abs(delta)} degrees` };
}
export function scaleObjects(state, ids, direction) {
  const t = state.objects.filter(o => ids.includes(o.id) && !o.lock)[0];
  if (!t) return { state, ok: false, say: 'Locked. Unlock to resize.' };
  const cur = t.scale ?? 1, next = snapScale(direction > 0 ? cur * FINE.step : cur / FINE.step);
  if (direction > 0 && cur >= FINE.max - 1e-9) return { state, ok: false, say: 'Already the largest.' };
  if (direction < 0 && cur <= FINE.min + 1e-9) return { state, ok: false, say: 'Already the smallest.' };
  const { objects } = edit(state, ids, o => o.lock ? o : (() => { const n = { ...o }; const s = snapScale((o.scale ?? 1) * (direction > 0 ? FINE.step : 1 / FINE.step)); if (s === 1) delete n.scale; else n.scale = s; return n; })());
  return { state: withObjects(state, objects), ok: true, say: `${nameOf(t)} ${Math.round(next * 100)} percent.` };
}
export function levelObjects(state, ids, level) {   // level: 1, 2, 4, or null for "Like farm"
  const t = state.objects.filter(o => ids.includes(o.id) && !o.lock)[0];
  if (!t) return { state, ok: false, say: 'Locked. Unlock to resize.' };
  const { objects } = edit(state, ids, o => { if (o.lock) return o; const n = { ...o }; if (level == null) delete n.level; else n.level = level; return n; });
  return { state: withObjects(state, objects), ok: true, say: level == null ? `${nameOf(t)} follows the farm size.` : `${levelLabel(level)} for ${nameOf(t)}.` };
}
// The farm's default size (the panel's group with nothing chosen): pins every placed object to its old level first, so only the next one changes.
export function setFarmLevel(state, level) {
  const objects = state.objects.map(o => o.level == null ? { ...o, level: state.farmLevel ?? 1 } : o);
  return { state: { ...state, objects, farmLevel: level }, ok: true, say: level === 1 ? 'New objects will be drawn at real size.' : `New objects will be drawn ${level}x bigger than real. Objects already placed stay as they are.` };
}
export function lengthObjects(state, ids, direction) {
  const t = state.objects.filter(o => ids.includes(o.id) && !o.lock && kindOf(o.kind).len)[0];
  if (!t) return { state, ok: false, say: 'This one has no length to change.' };
  const k = kindOf(t.kind), cur = t.length ?? k.len.def, step = cur < 30 ? 2 : cur < 100 ? 5 : 10;
  const len = clamp(cur + direction * step, k.len.min, k.len.max);
  if (len === cur) return { state, ok: false, say: direction > 0 ? 'Already the longest.' : 'Already the shortest.' };
  const { objects } = edit(state, [t.id], o => ({ ...o, length: len }));
  return { state: withObjects(state, objects), ok: true, say: `${k.name} ${len} metres long.` };
}
export function copyObjects(state, ids, pin, landWidth = Infinity) {
  let s = state, made = [];
  for (const o of state.objects.filter(x => ids.includes(x.id) && !x.lock)) {
    if (s.objects.length >= MAX_OBJECTS) return { state: s, ok: made.length > 0, say: `Most objects reached: ${MAX_OBJECTS}. Remove one first.` };
    const p = toXZ(o, pin), dims = sizeOf(o, s.farmLevel ?? 1, landWidth), copy = { ...o, id: nextId(s.objects), ...fromXZ(p.x + dims.w + 0.5, p.z, pin) };
    delete copy.lock; s = withObjects(s, [...s.objects, copy]); made.push(copy.id);
  }
  return { state: s, ok: made.length > 0, ids: made, say: made.length ? `${nameOf(s.objects.find(o => o.id === made[0]))} copied` : 'Locked. Unlock to copy.' };
}
export function lockObjects(state, ids, lock) {
  const { objects, changed } = edit(state, ids, o => (!!o.lock === lock) ? o : (() => { const n = { ...o }; if (lock) n.lock = true; else delete n.lock; return n; })());
  return { state: withObjects(state, objects), ok: changed > 0, say: lock ? 'Locked.' : 'Unlocked.' };
}
export function lockAll(state, lock) { return lockObjects(state, state.objects.map(o => o.id), lock); }
export function removeObjects(state, ids) {
  const gone = state.objects.filter(o => ids.includes(o.id) && !o.lock);
  if (!gone.length) return { state, ok: false, say: 'Locked. Unlock to remove.' };
  return { state: withObjects(state, state.objects.filter(o => !gone.includes(o))), ok: true, say: `${nameOf(gone[0])} removed` };
}
export function removeAll(state) {
  const kept = state.objects.filter(o => o.lock), n = state.objects.length - kept.length;
  if (!n) return { state, ok: false, say: kept.length ? 'Every object is locked.' : 'Nothing yet.' };
  return { state: withObjects(state, kept), ok: true, say: `All ${n} object${n === 1 ? '' : 's'} removed${kept.length ? `; ${kept.length} locked stay` : ''}` };
}

// ---- undo: 30 steps for the visit, the same action within 1.2 s merged into one step
export function makeHistory() { return { steps: [], lastAction: null, lastAt: -Infinity }; }
export function remember(history, before, action, at) {
  const merge = history.lastAction === action && at - history.lastAt <= MERGE_MS && history.steps.length > 0;
  const steps = merge ? history.steps : [...history.steps, before].slice(-MAX_UNDO);
  return { steps, lastAction: action, lastAt: at };
}
export function undo(history, current) {
  if (!history.steps.length) return { history, state: current, ok: false, say: 'Nothing to undo.' };
  const steps = history.steps.slice(0, -1);
  return { history: { steps, lastAction: null, lastAt: -Infinity }, state: history.steps.at(-1), ok: true, say: 'Undone.' };
}

// ---- standing on the ground
// A building (4 m² or more) stands on the lowest of its four turned corners; a strip kind lies along the slope between its ends (tilt up to 0.6 rad); a small thing on the point under it.
export function cornersOf(x, z, w, d, turnDeg) {
  const a = turnDeg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => ({ x: x + u * c + v * s, z: z - u * s + v * c }));
}
export function groundFit(heightAt, obj, dims, at) {
  const k = kindOf(obj.kind);
  if (k.len) {
    const e = cornersOf(at.x, at.z, dims.w, dims.d, obj.turn), a = { x: (e[0].x + e[1].x) / 2, z: (e[0].z + e[1].z) / 2 }, b = { x: (e[2].x + e[3].x) / 2, z: (e[2].z + e[3].z) / 2 };
    const ha = heightAt(a.x, a.z), hb = heightAt(b.x, b.z);
    if (!Number.isFinite(ha) || !Number.isFinite(hb)) return { y: 0, tilt: 0, missing: true };
    return { y: (ha + hb) / 2, tilt: clamp(Math.atan2(hb - ha, dims.d), -0.6, 0.6), missing: false };
  }
  if (dims.w * dims.d >= 4) {
    const hs = cornersOf(at.x, at.z, dims.w, dims.d, obj.turn).map(c => heightAt(c.x, c.z));
    if (hs.some(h => !Number.isFinite(h))) return { y: 0, tilt: 0, missing: true };
    return { y: Math.min(...hs), tilt: 0, missing: false };
  }
  const h = heightAt(at.x, at.z);
  return Number.isFinite(h) ? { y: h, tilt: 0, missing: false } : { y: 0, tilt: 0, missing: true };
}

// ---- crops cleared under a footprint: the footprint (turned) plus 0.5 m or 5%, whichever is more; soft kinds clear nothing; a plain soil pad when 2.5 m or wider
export function clearingOf(obj, dims, at) {
  const k = kindOf(obj.kind);
  if (k.soft) return null;
  const margin = Math.max(0.5, 0.05 * Math.max(dims.w, dims.d)), w = dims.w + 2 * margin, d = dims.d + 2 * margin, a = obj.turn * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return {
    w, d, pad: Math.min(w, d) >= 2.5, centre: at,
    contains: (x, z) => { const dx = x - at.x, dz = z - at.z, u = dx * c - dz * s, v = dx * s + dz * c; return Math.abs(u) <= w / 2 && Math.abs(v) <= d / 2; },
  };
}
// The clearings only change the picture when one moves 0.1 m or 0.1°.
export const clearingMoved = (a, b) => !a || !b || Math.hypot(a.x - b.x, a.z - b.z) >= 0.1 || Math.abs(a.turn - b.turn) >= 0.1;

// ---- the readings: real data, or dimmed with a reason, never a made-up value
// data: {rainMm, today (bool), windKmh, windFrom (degrees or null), ncYears {from, to, count, nasa (bool)}, stamps {earned, total, gold}, warnings: [{field, text}], sowing: {fieldName, crop|null}, watering: {fieldName, kind: 'full'|'limited'|null}}
export function readingOf(kind, data = {}) {
  const dim = reason => ({ shown: false, dim: 0.38, reason: `Not shown: ${reason}`, words: `Not shown: ${reason}` });
  switch (kind) {
    case 'rain-gauge': {
      if (!data.today) return dim('Shown for Today only: it holds the forecast rain.');
      if (!Number.isFinite(data.rainMm)) return dim('No forecast rain for this day right now.');
      return { shown: true, fill: Math.min(1, data.rainMm / 50), words: `Filled to the forecast rain for today, ${Math.round(data.rainMm)} mm (full: 50 mm or more).` };
    }
    case 'windsock': {
      if (!Number.isFinite(data.windKmh)) return dim('The forecast did not say how strong the wind is.');
      if (!Number.isFinite(data.windFrom)) return dim('The forecast did not say where the wind comes from.');
      const full = data.windKmh < 15 ? 0 : data.windKmh >= 40 ? 1 : 0.5, state = full === 0 ? 'limp' : full === 1 ? 'full' : 'half full';
      const points = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east', 'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
      return { shown: true, fill: full, pointsTo: (data.windFrom + 180) % 360, words: `Forecast wind ${Math.round(data.windKmh)} km/h from the ${points[Math.round(data.windFrom / 22.5) % 16]}; the sock points the way it blows and is ${state}.` };
    }
    case 'stump': {
      const y = data.years;
      if (!y || !y.nasa) return dim('The back-up weather is in use, not NASA\'s, so no years are counted.');
      return { shown: true, rings: y.count, words: `One ring for each year of NASA weather replayed, ${y.from} to ${y.to} (${y.count} years).` };
    }
    case 'flagpole': {
      const s = data.stamps; if (!s) return dim('No stamps are counted yet.');
      const up = Math.min(8, s.total);
      return { shown: true, pennants: up, raised: s.earned, gold: s.earned >= s.total, words: `One pennant for each of the farm's ${s.total} stamps, raised as far as you have come; ${s.earned} of ${s.total} at the top${s.earned >= s.total ? ' (gold)' : ''}.` };
    }
    case 'compass': return { shown: true, north: true, words: 'Always points to true north.' };
    case 'signpost': {
      const w = data.warnings || [];
      return { shown: true, warnings: w, words: w.length ? w.map(x => `${x.field}: ${x.text}`).join(' ') : 'No forecast warning for your fields right now.' };
    }
    case 'seed-bag': {
      const s = data.sowing; if (!s) return dim('No field is under it.');
      return s.crop ? { shown: true, crop: s.crop, words: `${s.fieldName}: your plan sows ${s.crop} this month.` } : { shown: true, crop: null, words: `Your plan sows nothing on ${s.fieldName} in the month shown.` };
    }
    case 'sprinkler': {
      const w = data.watering; if (!w) return dim('No field is under it.');
      return w.kind ? { shown: true, style: w.kind === 'full' ? 'wheel-line' : 'drip-reel', words: `${w.fieldName} is watered ${w.kind === 'full' ? 'in full (a wheel-line)' : 'a little (a drip reel)'} in your plan.` } : { shown: true, style: null, words: `${w.fieldName} has no watering in your plan.` };
    }
    default: return { shown: false, words: 'Your own marker. It shows no reading.' };
  }
}

// ---- words for the panel and In words
export function inWords(objects, farmLevel = 1) {
  if (!objects.length) return ['Nothing is placed on your land. Open Add objects to put a barn, a fence, a tractor, a rain gauge and more where you want them.'];
  const lines = [];
  const big = objects.filter(o => (o.level ?? farmLevel) === 2).length, huge = objects.filter(o => (o.level ?? farmLevel) === 4).length;
  if (!big && !huge) lines.push('Objects are drawn at real size.');
  else lines.push([big ? `${big} object${big === 1 ? ' is' : 's are'} drawn 2x bigger than real` : '', huge ? `${huge} object${huge === 1 ? ' is' : 's are'} drawn 4x bigger than real so you can see ${huge === 1 ? 'it' : 'them'} from far` : ''].filter(Boolean).join(', and ') + '. The rest are at real size.');
  const counts = new Map(); for (const o of objects) counts.set(o.kind, (counts.get(o.kind) || 0) + 1);
  const named = [...counts].map(([id, n]) => `${n} ${n === 1 ? kindOf(id).name.toLowerCase() : kindOf(id).plural}`);
  lines.push(`You placed ${named.length > 1 ? named.slice(0, -1).join(', ') + ' and ' + named.at(-1) : named[0]}. These are your own markers, not measured things.`);
  if (objects.some(o => kindOf(o.kind).reading)) lines.push('Objects with a reading show records, not things on your land.');
  return lines;
}
export const sizeGroupLabel = (chosen, farmLevel) => chosen.length === 0 ? 'Size of the next object' : chosen.length === 1 ? `Size of this ${kindOf(chosen[0].kind).name.toLowerCase()}` : `Size of the ${chosen.length} chosen objects`;
export const sizeHint = (chosenCount, farmLevel) => chosenCount ? 'Only the chosen object changes size.' : farmLevel === 1 ? 'Drag onto the land, or press to add. Real size: small things look tiny from far. Pick Big or Huge for the next one.' : `The next one is drawn ${farmLevel}x bigger than real. The ones already placed stay as they are.`;
export const solidNote = (kindName, fieldName) => `${kindName} stands on ${fieldName}. That is allowed; move it if you did not mean to cover the crop.`;
export const KEY_HELP = 'Arrow keys move the chosen one (Shift for bigger steps), R turns it, [ and ] resize it, D copies it, L locks it, Delete removes it, Control Z takes the last change back.';
// One arrow-key step as the screen sees it: the span × 0.004, 0.5 to 20 m; Shift five times that.
export const arrowStep = (span, shift = false) => clamp(span * 0.004, 0.5, 20) * (shift ? 5 : 1);
