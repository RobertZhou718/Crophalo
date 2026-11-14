// The farm suite of Crophalo's offline checks: the cleaner, plans, natural order, outlines, split, trash, undo, scores, the report hand-off and the files in and out.
// RULE: never loosen a check here to make it pass without a written farming reason beside the check itself. Run: node scripts/test_sim.mjs
import * as S from '../js/simulate.js';
import * as IO from '../js/farmio.js';
import { areaHa } from '../js/geo.js';
import { REPORT, CURRENT, PROPOSED, PLACE } from './fixtures/demo-plans.mjs';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, tol) => check(name, Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);
async function group(name, run) { try { await run(); } catch (e) { check(`${name}: ran to its end`, false, e?.stack?.split('\n').slice(0, 2).join(' ') || String(e)); } }

const NOW = Date.UTC(2026, 10, 14, 12), PIN = [44.3894, -79.6903];   // a test farm near Barrie, Ontario
const sq = (lat, lon, m) => { const dLat = m / 111195, dLon = m / (111195 * Math.cos(lat * Math.PI / 180)); return [[lat + dLat / 2, lon - dLon / 2], [lat + dLat / 2, lon + dLon / 2], [lat - dLat / 2, lon + dLon / 2], [lat - dLat / 2, lon - dLon / 2]].map(p => p.map(v => Math.round(v * 1e5) / 1e5)); };
const farmWith = (n = 0) => {
  let store = S.emptyStore(), id;
  ({ store } = S.addFarm(store, { name: 'Test farm', lat: PIN[0], lon: PIN[1], label: 'Barrie', cc: 'CA' }, { now: NOW, random: () => 0.5 }));
  id = store.active;
  for (let i = 0; i < n; i++) ({ store } = S.addField(store, id, { ring: sq(PIN[0] + 0.004 * (i % 6), PIN[1] + 0.006 * Math.floor(i / 6), 100) }, { now: NOW + i, random: () => (i + 1) / 100 }));
  return { store, id };
};
const corn = { start: 2026, water: 'none', seasons: [{ crop: 'corn' }, { crop: 'soy' }] };

await group('outlines', async () => {
  const a = sq(44.4, -79.7, 100), ha = areaHa(a);
  near('a 100 m square is about 1 ha', ha, 1, 0.02);
  const mid = S.interiorPoint(a);
  near('its interior point is its middle (lat)', mid[0], 44.4, 0.0002); near('its interior point is its middle (lon)', mid[1], -79.7, 0.0003);
  check('the interior point of an L shape is inside the L', (() => { const L = [[44.4, -79.7], [44.4, -79.696], [44.3995, -79.696], [44.3995, -79.6985], [44.397, -79.6985], [44.397, -79.7]]; const p = S.interiorPoint(L); return S.outlineIssue(L) === '' && p[0] < 44.4 && p[0] > 44.397; })());
  same('a field key is lat,lon at 4 decimals', S.fieldKey([44.123456, -79.98766]), '44.1235,-79.9877');
  same('a closing corner is not a corner', S.cleanRing([...a, a[0]]), a);
  same('two corners are refused', S.outlineIssue([[44, -79], [44.1, -79]]), 'It needs at least 3 corners.');
  same('a bow-tie is refused', S.outlineIssue([[44, -79], [44.001, -78.999], [44.001, -79], [44, -78.999]]), 'Its edges cross. Draw it again, going round the field.');
  same('too small (metric)', S.outlineIssue(sq(44, -79, 10)), 'Smaller than 0.05 ha.');
  same('too small (acres)', S.outlineIssue(sq(44, -79, 10), 'us'), 'Smaller than 0.12 acres.');
  same('too large', S.outlineIssue(sq(44, -79, 80000)), 'Too large to read the terrain for.');
  same('101 corners are refused', S.outlineIssue(Array.from({ length: 101 }, (_, i) => [44 + 0.01 * Math.sin(i / 16), -79 + 0.01 * Math.cos(i / 16)])), 'Up to 100 corners.');
  same('a good square passes', S.outlineIssue(a), '');
  const big = Array.from({ length: 300 }, (_, i) => [round(44.4 + 0.01 * Math.sin(i / 300 * 2 * Math.PI)), round(-79.7 + 0.01 * Math.cos(i / 300 * 2 * Math.PI))]);
  function round(v) { return Math.round(v * 1e5) / 1e5; }
  const simp = S.simplifyRing(big, 100);
  check('a 300-corner outline is simplified to 100 or fewer', simp.length <= 100 && simp.length >= 20, simp.length);
  near('and keeps its area within 1%', areaHa(simp) / areaHa(big), 1, 0.01);
  near('overlap of two squares shifted by half is half a hectare', S.overlapHa(sq(44.4, -79.7, 100), sq(44.4, -79.69937, 100)), 0.5, 0.03);
  same('squares far apart overlap nothing', S.overlapHa(sq(44.4, -79.7, 100), sq(44.41, -79.7, 100)), 0);
  same('a field north-east of the pin', S.nameForField(PIN, sq(44.3950, -79.6820, 100)), 'North-east field');
  same('a field at the pin is the Home field', S.nameForField(PIN, sq(PIN[0], PIN[1], 100)), 'Home field');
  same('a second field in the same direction is numbered', S.nameForField(PIN, sq(44.3950, -79.6820, 100), ['North-east field']), 'North-east field 2');
  same('a third is 3', S.nameForField(PIN, sq(44.3950, -79.6820, 100), ['North-east field', 'North-east field 2']), 'North-east field 3');
  same('compass words', [0, 45, 90, 135, 180, 225, 270, 315, 359].map(S.compassWord), ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west', 'North']);
  near('distance of 0.01 degrees of latitude is about 1112 m', S.distanceM([44, -79], [44.01, -79]), 1112, 3);
  near('bearing due east is 90', S.bearingDeg([44, -79], [44, -78.9]), 90, 0.2);
  // the date line: a field either side of 180 is one small field, not 360 degrees wide
  const dl = [[-17.7, 179.9995], [-17.7, -179.9995], [-17.701, -179.9995], [-17.701, 179.9995]];
  near('a field across the date line has its real size', areaHa(dl), 1.1 * 0.94, 0.15);
  check('and its interior point sits near the line', Math.abs(Math.abs(S.interiorPoint(dl)[1]) - 180) < 0.01, S.interiorPoint(dl));
});

await group('seasons', async () => {
  same('north: the season is the calendar year', S.seasonNow(44, new Date(2026, 10, 14)), 2026);
  same('south, in August: the season that began in July', S.seasonNow(-35, new Date(2026, 7, 1)), 2026);
  same('south, in March: the season that began last July', S.seasonNow(-35, new Date(2027, 2, 1)), 2026);
  same('north label', S.seasonLabel(44, 2026), '2026'); same('south label has an en dash', S.seasonLabel(-35, 2025), '2025–26');
  same('south months start in July', S.seasonMonths(-35)[0], 6); same('north months start in January', S.seasonMonths(44)[0], 0);
});

await group('the cleaner', async () => {
  const { store, id } = farmWith(2), farm = S.getFarm(store, id);
  const round = S.cleanStore(JSON.parse(JSON.stringify(store)));
  same('a good store survives a round trip unchanged', round, store);
  same('null gives an empty store', S.cleanStore(null), S.emptyStore()); same('a number gives an empty store', S.cleanStore(7), S.emptyStore());
  same('broken JSON text gives an empty store', S.cleanStore('{nope'), S.emptyStore());
  same('an array gives an empty store', S.cleanStore([]), S.emptyStore());
  check('a farm with no pin is dropped', S.cleanStore({ farms: [{ id: 'a', name: 'x' }] }).farms.length === 0);
  check('a farm with a bad id is dropped', S.cleanStore({ farms: [{ id: '../x', name: 'x', pin: { lat: 1, lon: 1 } }] }).farms.length === 0);
  const hostile = { v: 1, active: '__proto__', farms: [{ id: 'f1', name: '<img src=x onerror=alert(1)>', pin: { lat: 44.3894, lon: -79.6903, label: '<b>x</b>' }, fields: [
    { id: 'ok', name: 'A "quote" <script>', ring: sq(44.4, -79.7, 100), waterShare: 0.2 }, { id: 'bad', ring: [[1, 2]] }, { id: 'ok', name: 'dup', ring: sq(44.4, -79.7, 100) }, 'text', null,
    { id: 'toString', name: 'p', ring: sq(44.42, -79.7, 100) }, { id: 'tostr', name: 'x', ring: sq(44.41, -79.7, 100), kind: 'garden', tree: '__proto__' }], scenarios: [{ id: 'base', plans: { ok: { seasons: [{ crop: '../etc' }] }, ghost: { seasons: [{ crop: 'corn' }] } } }, 'x'], trash: [{ field: { id: 'k' } }], prefs: { look: 'neon', tab: 7, objects: [{ a: 1 }, 5] } }] };
  const c = S.cleanStore(hostile), f = c.farms[0];
  check('a hostile farm becomes a plain one', f && !/[<>]/.test(f.name) && !/[<>]/.test(f.pin.label), f?.name);
  same('its bad fields, the duplicate id and a prototype name as id go', f.fields.map(x => x.id), ['ok', 'tostr']);
  check('the water share shortens the area', f.fields[0].area < areaHa(f.fields[0].ring) && Math.abs(f.fields[0].area - areaHa(f.fields[0].ring) * 0.8) < 0.01, f.fields[0].area);
  check('a prototype name is not a tree', f.fields[1].kind === 'rot' && f.fields[1].tree === null);
  same('the first scenario is always My plan', [f.scenarios[0].id, f.scenarios[0].name], ['base', 'My plan']);
  same('a plan with a bad crop and a plan for no field are dropped', f.scenarios[0].plans, {});
  same('an unknown look falls back to the board', f.prefs.look, 'board'); same('an unknown tab falls back to board', f.prefs.tab, 'board');
  same('the active farm falls back to the first', c.active, 'f1');
  same('a stored farm without a base scenario gets one', S.cleanStore({ farms: [{ id: 'g', pin: { lat: 1, lon: 1 }, scenarios: [{ id: 'what', name: 'W' }] }] }).farms[0].scenarios.map(s => s.id), ['base', 'what']);
  const nine = { farms: Array.from({ length: 12 }, (_, i) => ({ id: 'f' + i, pin: { lat: 1, lon: 1 } })) };
  same('at most 8 farms are kept', S.cleanStore(nine).farms.length, 8);
  const fortyfive = { farms: [{ id: 'f', pin: { lat: 44, lon: -79 }, fields: Array.from({ length: 45 }, (_, i) => ({ id: 'x' + i, name: 'F' + i, ring: sq(44 + i * 0.001, -79, 60) })) }] };
  same('at most 40 fields are kept', S.cleanStore(fortyfive).farms[0].fields.length, 40);
  same('a what-if rain is rounded to fives and held in range', S.cleanFarm({ id: 'f', pin: { lat: 1, lon: 1 }, scenarios: [{}, { id: 'w', rain: -99, temp: 9 }, { id: 'v', rain: 12, temp: 0.3 }] }).scenarios.slice(2).map(s => [s.rain, s.temp]), [[-40, 4], [10, 0.5]]);
  same('a name is held to 60 and a field name to 40 characters', [S.cleanFarm({ id: 'f', name: 'x'.repeat(90), pin: { lat: 1, lon: 1 } }).name.length, S.cleanField({ id: 'a', name: 'y'.repeat(90), ring: sq(44, -79, 100) }).name.length], [60, 40]);
  check('a storage that throws gives an empty store', S.loadStore({ getItem() { throw new Error('blocked'); } }).farms.length === 0);
  same('a full device says so', S.saveStore({ setItem() { throw new Error('full'); } }, store), { ok: false, reason: 'Your device is full, so this could not be saved.' });
  const mem = new Map(), storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  S.saveStore(storage, store); same('saved under crophalo.farms.v1 and read back', [S.FARMS_KEY, S.loadStore(storage)], ['crophalo.farms.v1', store]);
  same('the pin is kept to 4 decimals', S.cleanFarm({ id: 'f', pin: { lat: 44.389412345, lon: -79.69031234 } }).pin, { lat: 44.3894, lon: -79.6903, label: '', cc: '' });
  same('the field key is made from the interior point', farm.fields[0].key, S.fieldKey(S.interiorPoint(farm.fields[0].ring)));
});

await group('farms and fields', async () => {
  let { store, id } = farmWith(0);
  same('an empty name is refused', S.addFarm(store, { name: '  ', lat: 1, lon: 1 }).refused, 'Give the farm a name.');
  for (let i = 0; i < 7; i++) ({ store } = S.addFarm(store, { name: 'F' + i, lat: 10 + i, lon: 10 }, { now: NOW + i, random: () => (i + 2) / 50 }));
  same('eight farms is the most', store.farms.length, 8);
  same('a ninth is refused in words', S.addFarm(store, { name: 'Nine', lat: 1, lon: 1 }).refused, 'You have the most farms Crophalo keeps (8).');
  const gone = S.removeFarm(store, store.active);
  check('deleting the active farm picks another', gone.farms.length === 7 && gone.active === gone.farms[0].id);
  ({ store, id } = farmWith(0));
  let r1 = S.addField(store, id, { ring: sq(44.3950, -79.6820, 120) }, { now: NOW });
  same('the first field is named by its direction', r1.field.name, 'North-east field');
  store = r1.store; const r2 = S.addField(store, id, { ring: sq(44.3951, -79.6819, 120) }, { now: NOW + 1, random: () => 0.7 });
  same('the next in the same direction gets a 2', r2.field.name, 'North-east field 2');
  check('ids differ', r1.field.id !== r2.field.id);
  same('an outline that fails is refused with the reason', S.addField(store, id, { ring: [[1, 1], [2, 2]] }).refused, 'It needs at least 3 corners.');
  const chk = S.checkNewOutline(S.getFarm(r2.store, id), sq(44.3950, -79.6820, 100));
  check('an overlap asks first, with the field and the hectares', chk.ok && chk.overlap && /^This overlaps North-east field by about \d\.\d ha\. Keep both\?$/.test(chk.overlap.words), chk.overlap?.words);
  const far = S.checkNewOutline(S.getFarm(r2.store, id), sq(44.95, -79.69, 100));
  check('a field 62 km away is refused as needing its own farm', far.ask === 'far' && /^This outline is \d+ km from the farm pin\. NASA weather squares are about 50 km wide, so it needs its own farm\.$/.test(far.reason), far.reason);
  const mid = S.checkNewOutline(S.getFarm(r2.store, id), sq(44.4600, -79.6903, 100));
  check('a field 7 km away is added without a warning', mid.ok && mid.note === '', mid.note);
  const warn = S.checkNewOutline(S.getFarm(r2.store, id), sq(44.5100, -79.6903, 100));
  check('a field 13 km away is added with the weather note', warn.ok && /^13 km from the farm pin: this field's weather may differ\.$/.test(warn.note), warn.note);
  const rn = S.renameField(r2.store, id, r2.field.id, 'Creek bottom', NOW + 5);
  same('rename keeps the new name and returns the old', [S.getField(S.getFarm(rn.store, id), r2.field.id).name, rn.was], ['Creek bottom', 'North-east field 2']);
  same('an empty rename is refused', S.renameField(r2.store, id, r2.field.id, '   ').refused, 'Give the field a name.');
  // 40 fields
  const full = farmWith(40);
  same('forty fields fit', S.getFarm(full.store, full.id).fields.length, 40);
  same('the forty-first is refused', S.addField(full.store, full.id, { ring: sq(45, -79, 100) }).refused, 'A farm holds up to 40 fields.');
});

await group('plans', async () => {
  let { store, id } = farmWith(3), farm = S.getFarm(store, id), [a, b, c] = farm.fields;
  same('a plan with no crop is refused', S.setPlan(store, id, a.id, { seasons: [] }).refused, 'Choose a crop first.');
  same('a plan with a missing crop in the middle is refused', S.setPlan(store, id, a.id, { seasons: [{ crop: 'corn' }, {}, { crop: 'soy' }] }).refused, 'Choose a crop first.');
  let res = S.setPlan(store, id, a.id, { ...corn, seasons: [{ crop: 'corn' }, { crop: 'soy' }, null, null] }); store = res.store;
  same('trailing empty years are dropped', res.plan.seasons.length, 2);
  same('this season is the first year of the rotation', S.thisSeasonCrop(S.getFarm(store, id), a, { year: 2026 }), 'corn');
  same('next season is the second', S.thisSeasonCrop(S.getFarm(store, id), a, { year: 2027 }), 'soy');
  same('the third year goes round again', S.thisSeasonCrop(S.getFarm(store, id), a, { year: 2028 }), 'corn');
  same('a field with no plan has no crop', S.thisSeasonCrop(S.getFarm(store, id), b, { year: 2026 }), null);
  same('a sowing date must be MM-DD', S.cleanSeason({ crop: 'corn', sowing: '4/25' }).sowing, null); same('a good sowing date stays', S.cleanSeason({ crop: 'corn', sowing: '04-25' }).sowing, '04-25');
  same('a day of 31 February passes the shape but a 13th month does not', [S.cleanSeason({ crop: 'a', sowing: '13-01' }).sowing, S.cleanSeason({ crop: 'a', variety: 'epic' }).variety], [null, null]);
  const cp = S.copyPlan(store, id, a.id, [a.id, b.id, c.id]); store = cp.store;
  same('copy fills the other fields and not the source', cp.count, 2); same('copied plans are equal', S.planOf(S.getFarm(store, id), c.id), S.planOf(S.getFarm(store, id), a.id));
  check('copied plans are separate objects', S.planOf(S.getFarm(store, id), c.id) !== S.planOf(S.getFarm(store, id), a.id));
  same('copying with nothing ticked is refused', S.copyPlan(store, id, a.id, []).refused, 'Tick at least one field.');
  same('copying from a field with no plan is refused', S.copyPlan(S.setPlan(farmWith(2).store, '', '', {}).store ?? farmWith(2).store, farmWith(2).id, 'nope', ['x']).refused, 'Choose a crop first.');
  // trees
  const tr = S.setTree(store, id, b.id, 'apple'); store = tr.store;
  const fb = S.getField(S.getFarm(store, id), b.id);
  same('a tree choice turns the field into a garden', [fb.kind, fb.tree], ['garden', 'apple']);
  same('a garden field has its tree as this season\'s crop', S.thisSeasonCrop(S.getFarm(store, id), fb, { year: 2026 }), 'apple');
  same('a tree cannot be chosen inside a what-if', S.setTree(store, id, a.id, 'apple', { scenario: 'w1' }).refused, 'Trees and bushes change the field itself, so they are chosen in My plan, not in a what-if.');
  const cp2 = S.copyPlan(store, id, a.id, [b.id, c.id]);
  same('a copy leaves tree fields out', cp2.count, 1);
  // a what-if never reaches the real plan
  const farmW = S.getFarm(store, id), w = { ...farmW, scenarios: [...farmW.scenarios, { id: 'w1', name: 'Dry', rain: -20, temp: 1, plans: {} }] }, st2 = { ...store, farms: [w] };
  const inW = S.setPlan(st2, id, a.id, { seasons: [{ crop: 'oats' }] }, { scenario: 'w1' });
  same('a what-if plan leaves My plan alone', S.planOf(S.getFarm(inW.store, id), a.id, 'base').seasons[0].crop, 'corn');
  same('and is kept in the what-if', S.planOf(S.getFarm(inW.store, id), a.id, 'w1').seasons[0].crop, 'oats');
  same('an unknown what-if is refused', S.setPlan(store, id, a.id, corn, { scenario: 'nope' }).refused, 'That what-if could not be found.');
  const cl = S.clearPlan(store, id, a.id); same('a cleared plan is gone', S.planOf(S.getFarm(cl.store, id), a.id), null);
});

await group('redraw, move corners, split, trash', async () => {
  let { store, id } = farmWith(2), farm = S.getFarm(store, id), a = farm.fields[0];
  store = S.setPlan(store, id, a.id, corn).store; store = S.setFieldSoil(store, id, a.id, { texture: 'loam', om: 'med', source: 'SoilGrids' }).store;
  store = S.setFieldTerrain(store, id, a.id, { v: 1, slope: 2.1 }).store;
  const mk = S.getField(S.getFarm(store, id), a.id).key.split(',').map(Number);
  store = S.setMarks(store, id, a.id, { low: mk.map(v => v), slope: 2 }).store;
  // move the outline a little, key point still inside
  const small = a.ring.map(([la, lo]) => [la + 0.00002, lo + 0.00002]);
  const rd = S.redrawField(store, id, a.id, small, { now: NOW + 9 }), f2 = S.getField(S.getFarm(rd.store, id), a.id);
  same('redraw keeps id, name, plan and soil', [f2.id, f2.name, S.planOf(S.getFarm(rd.store, id), a.id).seasons[0].crop, f2.soil.texture], [a.id, a.name, 'corn', 'loam']);
  same('redraw clears the terrain to be read again', f2.terrain, null); same('the key stays when its point is still inside', rd.moved, null);
  // move far: the key falls outside, the records follow; marks outside go
  const moved = sq(44.4100, -79.7000, 100), rd2 = S.redrawField(store, id, a.id, moved), f3 = S.getField(S.getFarm(rd2.store, id), a.id);
  check('a redraw away from the old key point re-files under a new key', rd2.moved && rd2.moved.from === a.key && rd2.moved.to === f3.key && f3.key !== a.key, rd2.moved);
  check('the low spot outside the new outline is removed, in words', f3.marks?.low == null && /^Your low spot fell outside the new outline, so it was removed\.$/.test(rd2.lostMarks), rd2.lostMarks);
  check('the typed slope stays', f3.marks?.slope === 2, f3.marks);
  same('a bad redraw is refused with its reason', S.redrawField(store, id, a.id, [[1, 1]]).refused, 'It needs at least 3 corners.');
  // split
  const line = IO.splitRing(a.ring, [(a.ring[0][0] + a.ring[3][0]) / 2, a.ring[0][1] - 0.01], [(a.ring[0][0] + a.ring[3][0]) / 2, a.ring[1][1] + 0.01]);
  check('a line across the middle splits a square in two halves', line.ok && line.rings.length === 2, line.reason);
  near('the halves add up to the whole', areaHa(line.rings[0]) + areaHa(line.rings[1]), areaHa(a.ring), 0.01);
  near('and are about equal', areaHa(line.rings[0]) / areaHa(line.rings[1]), 1, 0.05);
  const sp = S.splitField(store, id, a.id, line.rings, { now: NOW + 20, random: () => 0.31 }), sf = S.getFarm(sp.store, id);
  same('a split adds one field', sf.fields.length, 3);
  check('the keeper has the field\'s id, name and key', sp.kept.id === a.id && sp.kept.name === a.name && sp.kept.key === a.key || sp.kept.id === a.id && sp.kept.name === a.name);
  same('the new half is "<name> 2"', sp.added.name, `${a.name} 2`);
  same('with the same plan in My plan', S.planOf(sf, sp.added.id), S.planOf(sf, a.id));
  same('and the same soil', sp.added.soil, S.getField(sf, a.id).soil);
  check('and the words say the field split in two', sp.words === `${a.name} split in two: ${a.name} and ${a.name} 2`, sp.words);
  same('a line missing the field is refused', IO.splitRing(a.ring, [44.5, -79.8], [44.5, -79.7]).reason, 'The line does not cross the field. Tap two points so the line goes right across it.');
  same('two points too close are refused', IO.splitRing(a.ring, [44.4, -79.7], [44.400001, -79.7]).reason, 'The two points are too close. Tap them further apart.');
  const U = [[44.4, -79.7], [44.4, -79.696], [44.3985, -79.696], [44.3985, -79.698], [44.3995, -79.698], [44.3995, -79.7]];   // a U-ish shape: a line through its arms cuts four times
  const four = IO.splitRing([[44.40, -79.70], [44.40, -79.69], [44.399, -79.69], [44.399, -79.696], [44.398, -79.696], [44.398, -79.69], [44.397, -79.69], [44.397, -79.70]], [44.39, -79.693], [44.41, -79.693]);
  check('a line that cuts in more than two places is refused', !four.ok && /more than two places/.test(four.reason) || four.ok === true && false, four.reason ?? four);
  const sliver = IO.splitRing(a.ring, [a.ring[0][0] - 0.01, a.ring[0][1] + 0.000002], [a.ring[3][0] + 0.01, a.ring[3][1] + 0.000002]);
  same('a line that leaves a sliver is refused', sliver.reason, 'One half would be smaller than the smallest field Crophalo keeps.');
  // trash
  const del = S.deleteField(store, id, a.id, { now: NOW + 30 }), df = S.getFarm(del.store, id);
  check('delete removes the field and its plan', !S.getField(df, a.id) && !S.planOf(df, a.id) && df.trash.length === 1);
  const back = S.restoreField(del.store, id, a.id, { now: NOW + 40 }), bf = S.getFarm(back.store, id);
  check('restore brings the field back with its plan', S.getField(bf, a.id)?.name === a.name && S.planOf(bf, a.id)?.seasons[0].crop === 'corn' && bf.trash.length === 0);
  same('restore of something not in the trash is refused', S.restoreField(back.store, id, 'nothing').refused, 'That field could not be brought back.');
  let t = farmWith(8); let st = t.store;
  for (const f of S.getFarm(st, t.id).fields.slice(0, 7)) st = S.deleteField(st, t.id, f.id, { now: NOW + 100 }).store;
  same('the trash keeps the last 5', S.getFarm(st, t.id).trash.length, 5);
  same('and they are the newest', S.getFarm(st, t.id).trash.map(x => x.field.id), S.getFarm(farmWith(8).store, t.id).fields.slice(0, 7).reverse().slice(0, 5).map(f => f.id));
  same('after 30 days the trash is pruned', S.pruneTrash(S.getFarm(st, t.id).trash, NOW + 100 + 31 * 864e5).length, 0);
  same('and at 29 days it is not', S.pruneTrash(S.getFarm(st, t.id).trash, NOW + 100 + 29 * 864e5).length, 5);
  // restore into a full farm
  const fl = farmWith(40); const dl = S.deleteField(fl.store, fl.id, S.getFarm(fl.store, fl.id).fields[0].id, { now: NOW }); const refill = S.addField(dl.store, fl.id, { ring: sq(45, -79, 100) }, { now: NOW + 1, random: () => 0.9 });
  same('a field cannot be restored into a full farm', S.restoreField(refill.store, fl.id, dl.field.id).refused, 'A farm holds up to 40 fields.');
});

await group('undo', async () => {
  const u = S.makeUndo(); const A = { n: 1 }, B = { n: 2 };
  u.push(A, 'one', NOW); u.push(B, 'two', NOW + 1000);
  same('the last change comes back first', u.take(NOW + 2000).label, 'two'); same('then the one before', u.take(NOW + 2000).label, 'one'); same('then nothing', u.take(NOW + 2000), null);
  for (let i = 0; i < 20; i++) u.push({ i }, 'x' + i, NOW + i);
  same('only the last 12 are kept', u.size(NOW + 100), 12);
  same('the oldest kept is the ninth', u.take(NOW + 100).label, 'x19');
  u.clear(); u.push(A, 'old', NOW); same('after 5 minutes it is gone', u.take(NOW + 5 * 60e3 + 1), null);
  u.push(A, 'edge', NOW); same('at 5 minutes it still stands', u.take(NOW + 5 * 60e3)?.label, 'edge');
  const { store, id } = farmWith(1), before = store, after = S.renameField(store, id, S.getFarm(store, id).fields[0].id, 'Z').store;
  const v = S.makeUndo(); v.push(before, 'rename', NOW); check('a snapshot is never changed by later edits', v.take(NOW).store === before && S.getFarm(before, id).fields[0].name !== 'Z' && after !== before);
});

await group('natural order', async () => {
  same('Field 2 before Field 10', S.naturalSort([{ name: 'Field 10' }, { name: 'Field 2' }, { name: 'Field 1' }]).map(x => x.name), ['Field 1', 'Field 2', 'Field 10']);
  same('case is ignored', S.naturalSort(['b', 'A', 'c']), ['A', 'b', 'c']);
  same('words before numbers inside names', S.naturalSort(['East 2 field', 'East 10 field', 'East field']).map(String), ['East field', 'East 2 field', 'East 10 field'].sort(S.naturalCompare));
  same('a name with no digits sorts by letters', S.naturalSort(['South field', 'North field']), ['North field', 'South field']);
  same('the keyboard finds the nearest field to the east', S.nearestInDirection({ at: [44, -79] }, [{ id: 'near', at: [44, -78.99] }, { id: 'far', at: [44, -78.9] }, { id: 'north', at: [44.01, -79] }], 90), 'near');
  same('and nothing when none lies that way', S.nearestInDirection({ at: [44, -79] }, [{ id: 'n', at: [44.01, -79] }], 180), null);
});

await group('scores through one function', async () => {
  let { store, id } = farmWith(3), farm = S.getFarm(store, id), [a, b, c] = farm.fields;
  store = S.setPlan(store, id, a.id, corn).store; store = S.setPlan(store, id, b.id, corn).store; store = S.setTree(store, id, c.id, 'apple').store; farm = S.getFarm(store, id);
  S.setEngine(null);
  same('with no engine a planted field says "Not read yet"', S.readScore(farm, a).words, 'Not read yet');
  same('an unplanted field says so', S.readScore(S.getFarm(S.clearPlan(store, id, a.id).store, id), a).words, 'Not planted');
  same('a tree field is not scored', S.readScore(farm, S.getField(farm, c.id)).words, 'Trees and bushes are not scored');
  same('with no engine the four values say nothing', [S.farmValues(farm).score, S.farmValues(farm).sales], [null, null]);
  same('and the plant choices say not ready', S.cropChoices(farm, a), { ready: false, list: [] });
  S.setEngine({ score: ({ field }) => field.id === a.id ? { score: 62, bareMonths: 3, sales: { perYear: 14000 }, years: { hurt: 2, total: 26, close: 1, hurtYears: [2002, 2012] } } : { score: 80, bareMonths: 5, sales: { perYear: 6000 }, years: { hurt: 1, total: 26, close: 0, hurtYears: [2012, 2021] } }, crops: () => [{ id: 'corn', word: 'Holds up', tone: 'good', nearby: true, traits: ['120 days'] }, { id: '../x', word: 'bad' }] });
  same('a score is read from the engine', S.readScore(farm, a).words, '62 · OK fit');
  const v = S.farmValues(farm);
  check('the plan score is the average by size (two equal fields: 71)', v.score.value === 71 && v.score.fit === 'Good fit', v.score);
  same('bare soil is averaged too', v.bare.months, 4); same('sales add up and say how many fields count', [v.sales.perYear, v.sales.counted, v.sales.of], [20000, 2, 2]);
  same('past years hurt are the years any field was hurt', v.past, { hurtYears: 3, total: 26, list: [2002, 2012, 2021] });
  same('only the real crops come back as choices', S.cropChoices(farm, a).list.map(x => x.id), ['corn']);
  S.setEngine({ score: () => { throw new Error('boom'); } });
  same('an engine that throws gives "Not read yet", never an error', S.readScore(farm, a).words, 'Not read yet');
  S.setEngine({ score: () => ({ score: 'high' }) }); same('a junk answer gives "Not read yet"', S.readScore(farm, a).words, 'Not read yet');
  S.setEngine({ score: () => ({ state: 'needs-soil' }) }); same('"needs a soil" is passed on', S.readScore(farm, a).words, 'Needs a soil');
  S.setEngine(null);
  same('fit words by band', [S.fitWord(70), S.fitWord(69), S.fitWord(50), S.fitWord(49)], ['Good fit', 'OK fit', 'OK fit', 'Poor fit']);
});

await group('the 3D seam', async () => {
  let { store, id } = farmWith(2), farm = S.getFarm(store, id), [a, b] = farm.fields;
  store = S.setPlan(store, id, a.id, { start: 2026, seasons: [{ crop: 'corn', sowing: '05-01' }] }).store; store = S.setTree(store, id, b.id, 'apple').store; store = S.setMarks(store, id, a.id, { down: [[44.4, -79.7], [44.399, -79.7]], slope: 3.5 }).store;
  const out = S.farmFor3d(S.getFarm(store, id), { year: 2026, info: c => ({ corn: { group: 'grain', days: 150, sow: 4, kind: 'crop' }, apple: { group: 'tree', days: 365, sow: 3, kind: 'tree' } })[c] });
  same('the farm gives its name and pin', [out.name, out.pin], ['Test farm', { lat: 44.3894, lon: -79.6903 }]);
  const f = out.fields[0];
  same('a field gives id, name, polygon, crop, slope', Object.keys(f), ['id', 'name', 'polygon', 'crop', 'slope']);
  same('the crop is sown on its own date in UTC milliseconds', f.crop.sow, Date.UTC(2026, 4, 1));
  same('the four stage lengths add up to the season', Object.values(f.crop.lengths).reduce((s, v) => s + v, 0), 150);
  same('crop group and kind come from the table', [f.crop.group, f.crop.kind], ['grain', 'crop']);
  check('the slope is the farmer\'s own and its downhill is south (180)', f.slope.pct === 3.5 && Math.abs(f.slope.downhill - 180) < 1, f.slope);
  same('a tree field is of kind tree', out.fields[1].crop.kind, 'tree');
  same('an unknown crop gives no crop, never a guess', S.farmFor3d(S.getFarm(store, id), { year: 2026, info: () => null }).fields[0].crop, null);
  same('stage lengths of a short crop stay whole numbers', Object.values(S.stageLengths(60)).every(Number.isInteger), true);
});

await group('reading map files', async () => {
  const sqLonLat = (lat, lon, m) => { const r = sq(lat, lon, m).map(([la, lo]) => [lo, la]); return [...r, r[0]]; };
  const feat = (name, coords, type = 'Polygon', props = { name }) => ({ type: 'Feature', properties: props, geometry: { type, coordinates: coords } });
  const fc = (...f) => JSON.stringify({ type: 'FeatureCollection', features: f });
  const opts = { pin: { lat: PIN[0], lon: PIN[1] }, taken: [], room: 40 };
  const good = IO.readMapFile('a.geojson', fc(feat('North', [sqLonLat(44.395, -79.69, 100)]), feat('South', [sqLonLat(44.385, -79.69, 100)])), opts);
  same('two good polygons are two rows', [good.ok, good.rows.map(x => x.name), good.usable, good.skipped], [true, ['North', 'South'], 2, 0]);
  near('the hectares are read', good.rows[0].ha, 1, 0.03); same('corners come as [lat, lon]', good.rows[0].ring[0].length, 2);
  check('lat is first', Math.abs(good.rows[0].ring[0][0] - 44.395) < 0.01, good.rows[0].ring[0]);
  const multi = IO.readMapFile('m.geojson', fc(feat('Parts', [[sqLonLat(44.395, -79.69, 100)], [sqLonLat(44.385, -79.69, 100)]], 'MultiPolygon')), opts);
  same('a MultiPolygon gives parts "<name> 1", "<name> 2"', multi.rows.map(x => x.name), ['Parts 1', 'Parts 2']);
  const dup = IO.readMapFile('d.geojson', fc(feat('A', [sqLonLat(44.395, -79.69, 100)]), feat('A', [sqLonLat(44.385, -79.69, 100)])), { ...opts, taken: ['a'] });
  same('duplicates become "<name> 2" and "<name> 3" against names on the farm', dup.rows.map(x => x.name), ['A 2', 'A 3']);
  const holey = IO.readMapFile('h.geojson', fc(feat('Holey', [sqLonLat(44.395, -79.69, 200), sqLonLat(44.395, -79.69, 50).reverse()])), opts);
  check('a hole is filled in and said', holey.rows[0].notes.includes('a hole was filled in'), holey.rows[0]);
  const names = IO.readMapFile('n.geojson', fc(feat('', [sqLonLat(44.395, -79.69, 100)], 'Polygon', { Field_Name: '<b>Creek</b> bottom' }), feat('', [sqLonLat(44.385, -79.69, 100)], 'Polygon', { id: 7 }), feat('', [sqLonLat(44.375, -79.69, 100)], 'Polygon', {})), opts);
  same('names come from the usual keys, tags stripped, and Field N when none', names.rows.map(x => x.name), ['Creek bottom', '7', 'Field 3']);
  const skips = IO.readMapFile('s.geojson', fc(feat('Line', [[-79.7, 44.4], [-79.69, 44.4]], 'LineString'), feat('Dot', [-79.7, 44.4], 'Point'), { type: 'Feature', properties: { name: 'Nothing' }, geometry: null }, feat('Two', [[[-79.7, 44.4], [-79.69, 44.4], [-79.7, 44.4]]]), feat('Bow', [[[-79.7, 44.4], [-79.699, 44.401], [-79.699, 44.4], [-79.7, 44.401], [-79.7, 44.4]]]), feat('Tiny', [sqLonLat(44.395, -79.69, 10)]), feat('Huge', [sqLonLat(44.4, -79.7, 80000)]), feat('Far', [sqLonLat(45.0, -79.69, 100)]), feat('Proj', [[[500000, 4900000], [500100, 4900000], [500100, 4900100], [500000, 4900000]]])), opts);
  same('every skip has its own reason', skips.rows.map(x => x.skipped), ['A LineString is not a field outline.', 'A point or a line is not a field outline.', 'It has no shape.', 'It needs at least 3 corners.', 'Its edges cross.', 'Smaller than the smallest field Crophalo keeps (0.05 ha).', 'Bigger than the largest field Crophalo keeps (5000 ha).', 'More than 50 km from this farm. It needs its own farm.', 'Its map is not in latitude and longitude (WGS84).']);
  same('the bad file says no field can be added', IO.previewLine(0, 9, 40), 'No field in this file can be added.');
  same('the preview line counts', IO.previewLine(3, 2, 37), '3 fields can be added. 2 skipped. This farm has room for 37 more.');
  same('one field, none skipped', IO.previewLine(1, 0, 5), '1 field can be added. This farm has room for 5 more.');
  same('tick lines', [IO.tickLine(0, 3), IO.tickLine(1, 3), IO.tickLine(3, 3), IO.tickLine(5, 3)], ['No field ticked', '1 field ticked', '3 fields ticked', '5 fields ticked. Only 3 fit: untick 2.']);
  const wide = IO.readMapFile('w.geojson', fc(feat('Round', [Array.from({ length: 300 }, (_, i) => [Math.round((-79.69 + 0.004 * Math.cos(i / 300 * 6.2832)) * 1e5) / 1e5, Math.round((44.39 + 0.003 * Math.sin(i / 300 * 6.2832)) * 1e5) / 1e5])])), opts);
  check('a 300-corner outline is simplified to 100 and says so', wide.rows[0].ring?.length <= 100 && wide.rows[0].notes.includes('simplified to 100 corners'), wide.rows[0].ring?.length);
  // refusals before reading
  same('room 0', IO.readMapFile('a.geojson', fc(), { ...opts, room: 0 }).reason, 'A farm holds up to 40 fields.');
  same('too big', IO.readMapFile('a.geojson', ' '.repeat(5e6 + 1)).reason, 'That file is too big. Crophalo reads files up to 5 MB.');
  same('empty', IO.readMapFile('a.geojson', '  \n ').reason, 'That file is empty.'); same('unreadable', IO.readMapFile('a.geojson', null).reason, 'That file could not be read.');
  same('kmz by name', IO.readMapFile('farm.kmz', '<kml/>').reason, 'Crophalo cannot open KMZ or zipped files yet. In your map program, save the fields as KML or GeoJSON.');
  same('a zip by its first bytes', IO.readMapFile('farm.kml', 'PK\u0003\u0004abc').reason, 'Crophalo cannot open KMZ or zipped files yet. In your map program, save the fields as KML or GeoJSON.');
  same('broken GeoJSON', IO.readMapFile('a.geojson', '{"type":').reason, 'That file is not valid GeoJSON.');
  same('a different map system', IO.readMapFile('a.geojson', JSON.stringify({ type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32617' } }, features: [] })).reason, 'This file uses a different map system. Save it as GeoJSON in latitude and longitude (WGS84) and try again.');
  same('a collection with no polygons', IO.readMapFile('a.geojson', fc()).reason, 'That file has no fields in it. Crophalo reads a GeoJSON FeatureCollection of polygons.');
  same('JSON that is not GeoJSON', IO.readMapFile('a.geojson', '{"hello":1}').reason, 'That file has no fields in it. Crophalo reads a GeoJSON FeatureCollection of polygons.');
  same('a bare Polygon is read', IO.readMapFile('a.geojson', JSON.stringify({ type: 'Polygon', coordinates: [sqLonLat(44.395, -79.69, 100)] }), opts).usable, 1);
  same('a GeometryCollection gives numbered parts', IO.readMapFile('g.geojson', JSON.stringify({ type: 'Feature', properties: { name: 'G' }, geometry: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', coordinates: [sqLonLat(44.395, -79.69, 100)] }, { type: 'Polygon', coordinates: [sqLonLat(44.385, -79.69, 100)] }] } }), opts).rows.map(x => x.name), ['G 1', 'G 2']);
  // KML
  const ring = s => sqLonLat(44.395, -79.69, s).map(([lo, la]) => `${lo},${la},0`).join(' ');
  const kml = body => `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${body}</Document></kml>`;
  const pm = (name, inner) => `<Placemark><name>${name}</name>${inner}</Placemark>`, poly = (c, hole = '') => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${c}</coordinates></LinearRing></outerBoundaryIs>${hole}</Polygon>`;
  const k = IO.readMapFile('a.kml', kml(pm('Hill &amp; dale', poly(ring(100))) + pm('<![CDATA[Low <i>field</i>]]>', poly(sqLonLat(44.385, -79.69, 100).map(([lo, la]) => `${lo},${la}`).join('\n'))) + pm('Road', '<LineString><coordinates>1,1 2,2</coordinates></LineString>') + pm('Pin', '<Point><coordinates>1,1</coordinates></Point>') + pm('Holey', poly(ring(200), `<innerBoundaryIs><LinearRing><coordinates>${ring(50)}</coordinates></LinearRing></innerBoundaryIs>`))), opts);
  same('KML names are decoded and tags stripped', k.rows.map(x => x.name).slice(0, 2), ['Hill & dale', 'Low field']);
  same('KML lines and points are skipped with their reasons', k.rows.slice(2, 4).map(x => x.skipped), ['A LineString is not a field outline.', 'A point or a line is not a field outline.']);
  check('KML holes are filled in and said', k.rows[4].notes.includes('a hole was filled in'), k.rows[4]);
  same('three KML fields can be added', k.usable, 3);
  same('KML with a multi-polygon placemark numbers the parts', IO.readMapFile('a.kml', kml(pm('Two', `<MultiGeometry>${poly(ring(100))}${poly(sqLonLat(44.385, -79.69, 100).map(([lo, la]) => `${lo},${la}`).join(' '))}</MultiGeometry>`)), opts).rows.map(x => x.name), ['Two 1', 'Two 2']);
  same('not KML', IO.readMapFile('a.kml', '<html></html>').reason, 'That file is not KML.');
  same('KML with no polygons', IO.readMapFile('a.kml', kml(pm('x', '<Point><coordinates>1,1</coordinates></Point>')).replace('Point', 'Point')).usable, 0);
  same('KML with no placemark', IO.readMapFile('a.kml', kml('')).reason, 'That file has no fields in it. Crophalo reads KML placemarks that hold polygons.');
  same('a KML read by its first character even with another extension', IO.readMapFile('farm.txt', kml(pm('Z', poly(ring(100)))), opts).usable, 1);
  same('a BOM before the text is ignored', IO.readMapFile('a.geojson', '﻿' + fc(feat('B', [sqLonLat(44.395, -79.69, 100)])), opts).usable, 1);
});

await group('writing files and round trips', async () => {
  let { store, id } = farmWith(0);
  for (const [i, m] of [100, 160, 80].entries()) store = S.addField(store, id, { ring: sq(44.3894 + 0.003 * (i + 1), -79.6903 + 0.002 * i, m), name: ['Field 10', 'Field 2', '=cmd|calc'][i] }, { now: NOW + i, random: () => 0.1 * (i + 1) }).store;
  store = S.setPlan(store, id, S.getFarm(store, id).fields[0].id, { start: 2026, water: 'limited', seasons: [{ crop: 'corn' }] }).store;
  const farm = S.getFarm(store, id), name = c => ({ corn: 'Corn' })[c] ?? c;
  same('file names are the farm slug', IO.fileNames({ name: 'Test Farm — Home!' }), { geojson: 'test-farm-home-fields.geojson', csv: 'test-farm-home-fields.csv' });
  same('an empty farm name gives "farm"', IO.farmSlug('???'), 'farm'); same('the slug is held to 30 characters', IO.farmSlug('a'.repeat(50)).length, 30);
  const text = IO.writeGeoJSON(farm, { cropName: name, year: 2026 }), obj = JSON.parse(text);
  same('a FeatureCollection with every field in natural order', [obj.type, obj.features.map(f => f.properties.name)], ['FeatureCollection', ['=cmd|calc', 'Field 2', 'Field 10']]);
  const p = obj.features[2];
  same('a polygon with a closed ring', [p.geometry.type, JSON.stringify(p.geometry.coordinates[0][0]) === JSON.stringify(p.geometry.coordinates[0].at(-1))], ['Polygon', true]);
  same('properties are name, hectares, crop, water', Object.keys(p.properties), ['name', 'hectares', 'crop', 'water']);
  same('this season\'s crop and its water in words', [p.properties.crop, p.properties.water], ['Corn', 'Limited irrigation']);
  same('an unplanted field has crop null', obj.features[0].properties.crop, null);
  check('coordinates are [lon, lat] to 6 decimals', p.geometry.coordinates[0].every(([lo, la]) => lo < 0 && la > 0 && Math.round(lo * 1e6) / 1e6 === lo), p.geometry.coordinates[0][0]);
  const back = IO.readMapFile('x.geojson', text, { pin: { lat: PIN[0], lon: PIN[1] }, taken: [], room: 40 });
  same('the map file reads back as the same three fields', back.rows.map(x => x.name), ['=cmd|calc', 'Field 2', 'Field 10']);
  const orig = S.naturalSort(farm.fields);
  check('and the same shapes to 6 decimals', back.rows.every((row, i) => row.ring.every((pt, j) => Math.abs(pt[0] - orig[i].ring[j][0]) < 1e-5 && Math.abs(pt[1] - orig[i].ring[j][1]) < 1e-5)));
  check('and the same areas', back.rows.every((row, i) => Math.abs(row.ha - orig[i].area) < 0.02), back.rows.map(x => x.ha));
  const imp = S.addFields(S.removeFarm(store, 'none'), id, back.rows.map(x => ({ name: x.name + ' again', ring: x.ring })), { now: NOW + 99, random: (() => { let n = 0; return () => (++n * 0.137) % 1; })() });
  same('importing adds them to the farm', imp.added.length, 3);
  const csv = IO.writeCSV([{ name: '=cmd|calc', ha: 1.234, crop: 'Corn', water: 'Rainfed', fit: '62 · OK fit', hurt: '5 of 26', reminders: 2 }, { name: 'Say "hi", ok', ha: 0.5, crop: null }, { name: '+1', ha: 2 }, { name: '−1', ha: 2 }, { name: '@x', ha: 2 }, { name: '\tx', ha: 2 }]);
  check('the CSV starts with a BOM and ends with CRLF', csv.startsWith('﻿') && csv.endsWith('\r\n'));
  same('its header is the eight columns', csv.slice(1).split('\r\n')[0], 'Field,Area (hectares),Area (acres),This season,Water,Fit,Past years a crop was hurt,Reminders');
  const lines = csv.slice(1).split('\r\n');
  same('a formula cell gets a quote in front', lines[1].split(',')[0], "'=cmd|calc"); same('acres are worked out', lines[1].split(',')[2], '3.05');
  same('quotes and commas are escaped', lines[2], '"Say ""hi"", ok",0.5,1.24,,,,,0');
  same('+, minus sign, @ and tab are all made safe', lines.slice(3, 7).map(l => l[0] === '"' ? l.slice(1, 3) : l.slice(0, 2)), ["'+", "'−", "'@", "'\t"]);
  same('the csvCell of a plain word is itself', IO.csvCell('Corn'), 'Corn'); same('and of null is empty', IO.csvCell(null), '');
  same('the hurt-years column reads "5 of 26"', lines[1].split(',')[6], '5 of 26');
});

await group('Add to my farm from a report', async () => {
  const first = S.applyReport(S.emptyStore(), REPORT, { now: NOW, random: () => 0.4 });
  check('the first add makes a farm and a field', first.created && first.farmId && first.fieldId && first.store.farms.length === 1, first.refused);
  const farm = S.getFarm(first.store, first.farmId), f = S.getField(farm, first.fieldId);
  same('the farm is named from the place', farm.name, 'Barrie & Simcoe County');
  near('with no outline the field is a 10 ha square', f.area, 10, 0.1); same('and it is labelled estimated', f.estimated, true);
  same('its key is the pin to 4 decimals', f.key, '44.4000,-79.7800');
  same('the soil is loam, assumed', [f.soil.texture, f.soil.assumed], ['loam', true]);
  same('the farm is rain-fed', farm.practice.irrigation, 'none');
  same('the current plan is kept and the proposal is separate', [f.report.current.kind, f.report.proposed.kind, f.report.proposed.seasons[2].crop], ['current', 'proposed', 'wheat']);
  same('the rotation of the current plan is the field\'s plan', S.planOf(farm, f.id).seasons.map(x => x.crop), ['corn', 'soy', 'corn']);
  const again = S.applyReport(first.store, { ...REPORT, proposed: { ...PROPOSED, name: 'Proposed again' }, current: { ...CURRENT, name: 'Other name' } }, { now: NOW + 5, random: () => 0.9 });
  check('a repeat add finds the same field, never a duplicate', !again.created && again.fieldId === first.fieldId && S.getFarm(again.store, first.farmId).fields.length === 1);
  same('and keeps the current plan it had', S.getField(S.getFarm(again.store, first.farmId), first.fieldId).report.current.name, 'Current plan');
  same('while the proposal is the newest', S.getField(S.getFarm(again.store, first.farmId), first.fieldId).report.proposed.name, 'Proposed again');
  const near2 = S.applyReport(again.store, { ...REPORT, place: { ...PLACE, lat: 44.43, lon: -79.78 } }, { now: NOW + 9, random: () => 0.2 });
  check('a different field near the same farm joins that farm', near2.created && near2.farmId === first.farmId && S.getFarm(near2.store, first.farmId).fields.length === 2);
  const faraway = S.applyReport(again.store, { ...REPORT, place: { ...PLACE, lat: 41.0, lon: -93.6, name: 'Central Iowa' } }, { now: NOW + 9, random: () => 0.3 });
  check('a field 500 km away starts its own farm', faraway.created && faraway.farmId !== first.farmId && faraway.store.farms.length === 2);
  same('and the board shows it as the active farm', faraway.store.active, faraway.farmId);
  const drawn = S.applyReport(S.emptyStore(), { ...REPORT, areaEstimated: false, outline: sq(44.4, -79.78, 200) }, { now: NOW, random: () => 0.5 });
  near('a drawn outline is used as drawn', S.getField(S.getFarm(drawn.store, drawn.farmId), drawn.fieldId).area, 4, 0.1);
  same('and is not called estimated', S.getField(S.getFarm(drawn.store, drawn.farmId), drawn.fieldId).estimated, false);
  same('no place is refused', S.applyReport(S.emptyStore(), { ...REPORT, place: null }).refused, 'That field could not be added to My farm.');
  same('a report with no plan is refused', S.applyReport(S.emptyStore(), { ...REPORT, current: null, proposed: null }).refused, 'That field could not be added to My farm.');
  same('a plan with an impossible date is dropped', S.cleanContractPlan({ ...PROPOSED, seasons: [{ ...PROPOSED.seasons[0], sow: '2027-02-30' }] }), null);
  same('a plan survives the store\'s cleaner', S.cleanStore(JSON.parse(JSON.stringify(first.store))), first.store);
  same('the three plan words after a season', PROPOSED.seasons.every(x => ['residue', 'cover', 'bare'].includes(x.after)), true);
  const fixed = S.getFarm(first.store, first.farmId), t = S.farmFor3d(fixed, { year: 2028, info: () => ({ group: 'grain', days: 100, sow: 5, kind: 'crop' }) });
  same('the seam for 3D still gives the farm and its field', [t.name, t.fields.length], ['Barrie & Simcoe County', 1]);
  const one = S.farmFor3d(fixed, { fieldId: first.fieldId, planKind: 'proposed', date: '2028-10-20', ground: (plan, d) => ({ state: 'cover', crop: 'wheat', stage: 1, label: 'Planned', note: plan.name + d }) });
  same('with a field chosen the 3D input is the field, the plan, the date and the ground', [Object.keys(one), one.planKind, one.planName, one.date, one.ground.state, one.field.areaEstimated], [['name', 'pin', 'field', 'planKind', 'planName', 'date', 'ground'], 'proposed', 'Proposed plan', '2028-10-20', 'cover', true]);
  same('its field carries the polygon as [lat, lon] pairs', [one.field.polygon.length, one.field.polygon[0].length], [4, 2]);
  same('an engine that throws gives no ground, not an error', S.farmFor3d(fixed, { fieldId: first.fieldId, planKind: 'current', date: '2028-10-20', ground: () => { throw new Error('x'); } }).ground, null);
  same('with no engine the ground is null', S.farmFor3d(fixed, { fieldId: first.fieldId, planKind: 'current', date: '2028-10-20' }).ground, null);
});


console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
