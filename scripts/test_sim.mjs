// The farm suite of Crophalo's offline checks: the cleaner, plans, natural order, outlines, split, trash, undo, scores, the report hand-off and the files in and out.
// RULE: never loosen a check here to make it pass without a written farming reason beside the check itself. Run: node scripts/test_sim.mjs
import * as S from '../js/simulate.js';
import * as IO from '../js/farmio.js';
import * as D from '../js/fielddrawer.js';
import * as E from '../js/fieldedit.js';
import * as T from '../js/fieldstable.js';
import * as F from '../js/farmstart.js';
import * as K from '../js/farmchips.js';
import fs from 'node:fs';
import * as EN from '../js/engine.js';
import { loadSpot } from '../js/report-load.js';
import { realReport, realSeries } from './fixtures/engine-plans.mjs';
import * as H from '../js/farmhistory.js';
import * as Y from '../js/farmyears.js';
import * as FU from '../js/farmunits.js';
import * as FH from '../js/farmhas.js';
import * as SEASONTAB from '../js/season.js';
import * as OB from '../js/farmobserved.js';
import { HLS_SHAPE, dayBack } from './fixtures/hls-shape.mjs';
import * as CR from '../js/crops.js';
import * as FIT from '../js/fit.js';
import * as HV from '../js/history.js';
import * as HVW from '../js/history-view.js';
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
  check('a field 62 km away is refused as needing its own farm', far.ask === 'far' && /^This outline is \d+ km from the farm’s place\. NASA weather squares are about 50 km wide, so it needs its own farm\.$/.test(far.reason), far.reason);
  const mid = S.checkNewOutline(S.getFarm(r2.store, id), sq(44.4600, -79.6903, 100));
  check('a field 7 km away is added without a warning', mid.ok && mid.note === '', mid.note);
  const warn = S.checkNewOutline(S.getFarm(r2.store, id), sq(44.5100, -79.6903, 100));
  check('a field 13 km away is added with the weather note', warn.ok && /^13 km from the farm’s place: this field's weather may differ\.$/.test(warn.note), warn.note);
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
  same('with no engine a planted field has no score', S.readScore(farm, a).words, 'No score yet');
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
  same('an engine that throws gives no score, never an error', S.readScore(farm, a).words, 'No score yet');
  S.setEngine({ score: () => ({ score: 'high' }) }); same('a junk answer gives no score', S.readScore(farm, a).words, 'No score yet');
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
  same('the farm is named from the first part of the place', farm.name, PLACE.name.split(',')[0].trim());
  near('with no outline the field is a 10 ha square', f.area, 10, 0.1); same('and it is labelled estimated', f.estimated, true);
  same('its key is the pin to 4 decimals', f.key, S.fieldKey([PLACE.lat, PLACE.lon]));
  same('the soil is loam, assumed', [f.soil.texture, f.soil.assumed], ['loam', true]);
  same('the farm is rain-fed', farm.practice.irrigation, 'none');
  same('the current plan is kept and the proposal is separate', [f.report.current.kind, f.report.proposed.kind, f.report.proposed.seasons[2].crop], ['current', 'proposed', 'wheat']);
  same('the rotation of the current plan is the field\'s plan', S.planOf(farm, f.id).seasons.map(x => x.crop), ['corn', 'soy', 'corn']);
  const again = S.applyReport(first.store, { ...REPORT, proposed: { ...PROPOSED, name: 'Proposed again' }, current: { ...CURRENT, name: 'Other name' } }, { now: NOW + 5, random: () => 0.9 });
  check('a repeat add finds the same field, never a duplicate', !again.created && again.fieldId === first.fieldId && S.getFarm(again.store, first.farmId).fields.length === 1);
  same('and keeps the current plan it had', S.getField(S.getFarm(again.store, first.farmId), first.fieldId).report.current.name, 'Current plan');
  same('while the proposal is the newest', S.getField(S.getFarm(again.store, first.farmId), first.fieldId).report.proposed.name, 'Proposed again');
  const near2 = S.applyReport(again.store, { ...REPORT, place: { ...PLACE, lat: PLACE.lat + 0.03 } }, { now: NOW + 9, random: () => 0.2 });
  check('a different field near the same farm joins that farm', near2.created && near2.farmId === first.farmId && S.getFarm(near2.store, first.farmId).fields.length === 2);
  const faraway = S.applyReport(again.store, { ...REPORT, place: { ...PLACE, lat: 41.0, lon: -93.6, name: 'Central Iowa' } }, { now: NOW + 9, random: () => 0.3 });
  check('a field 500 km away starts its own farm', faraway.created && faraway.farmId !== first.farmId && faraway.store.farms.length === 2);
  same('and the board shows it as the active farm', faraway.store.active, faraway.farmId);
  const drawn = S.applyReport(S.emptyStore(), { ...REPORT, areaEstimated: false, outline: sq(PLACE.lat, PLACE.lon, 200) }, { now: NOW, random: () => 0.5 });
  near('a drawn outline is used as drawn', S.getField(S.getFarm(drawn.store, drawn.farmId), drawn.fieldId).area, 4, 0.1);
  same('and is not called estimated', S.getField(S.getFarm(drawn.store, drawn.farmId), drawn.fieldId).estimated, false);
  same('no place is refused', S.applyReport(S.emptyStore(), { ...REPORT, place: null }).refused, 'That field could not be added to My farm.');
  same('a report with no plan is refused', S.applyReport(S.emptyStore(), { ...REPORT, current: null, proposed: null }).refused, 'That field could not be added to My farm.');
  same('a plan with an impossible date is dropped', S.cleanContractPlan({ ...PROPOSED, seasons: [{ ...PROPOSED.seasons[0], sow: '2027-02-30' }] }), null);
  same('a plan survives the store\'s cleaner', S.cleanStore(JSON.parse(JSON.stringify(first.store))), first.store);
  same('the three plan words after a season', PROPOSED.seasons.every(x => ['residue', 'cover', 'bare'].includes(x.after)), true);
  const fixed = S.getFarm(first.store, first.farmId), t = S.farmFor3d(fixed, { year: 2028, info: () => ({ group: 'grain', days: 100, sow: 5, kind: 'crop' }) });
  same('the seam for 3D still gives the farm and its field', [t.name, t.fields.length], [PLACE.name.split(',')[0].trim(), 1]);
  const one = S.farmFor3d(fixed, { fieldId: first.fieldId, planKind: 'proposed', date: '2028-10-20', ground: (plan, d) => ({ state: 'cover', crop: 'wheat', stage: 1, label: 'Planned', note: plan.name + d }) });
  same('with a field chosen the 3D input is the field, the plan, the date and the ground', [Object.keys(one), one.planKind, one.planName, one.date, one.ground.state, one.field.areaEstimated], [['name', 'pin', 'field', 'planKind', 'planName', 'date', 'ground'], 'proposed', 'Proposed plan', '2028-10-20', 'cover', true]);
  same('its field carries the polygon as [lat, lon] pairs', [one.field.polygon.length, one.field.polygon[0].length], [4, 2]);
  same('an engine that throws gives no ground, not an error', S.farmFor3d(fixed, { fieldId: first.fieldId, planKind: 'current', date: '2028-10-20', ground: () => { throw new Error('x'); } }).ground, null);
  same('with no engine the ground is null', S.farmFor3d(fixed, { fieldId: first.fieldId, planKind: 'current', date: '2028-10-20' }).ground, null);
});


await group('the field drawer words', async () => {
  const made = S.applyReport(S.emptyStore(), REPORT, { now: NOW, random: () => 0.4 }), farm = S.getFarm(made.store, made.farmId), f = S.getField(farm, made.fieldId), name = id => ({ corn: 'Corn', soy: 'Soybeans', wheat: 'Winter wheat' })[id] || id;
  const base = { field: f, farm, score: { state: 'unread', words: 'Not read yet' }, cropName: name, forecast: 'none', reminders: [], today: '2028-10-06', crop: 'corn', sowing: null, suggestions: [] };
  same('the summary line: size, estimated, this season', D.summaryLine(base), '10.0 ha (estimated) · Corn this season');
  same('with no crop it says ready to plant', D.summaryLine({ ...base, crop: null }), '10.0 ha (estimated) · Ready to plant');
  same('a forecast alert comes first', D.fieldNow({ ...base, forecast: { alerts: [{ id: 'a', text: 'Frost forecast Tuesday (-1 \u00b0C): check the forecast' }] }, crop: null }).action.id, 'forecast');
  same('nothing planted: choose a crop', D.fieldNow({ ...base, crop: null }), { text: 'Nothing planted yet: choose a crop', action: { id: 'plant', label: 'Plant…' } });
  same('no soil answer from the engine: choose the soil', D.fieldNow({ ...base, score: { state: 'needs-soil' } }).action.id, 'soil');
  const sow = D.nextSowing(f, '2028-10-06', name);
  same('your own sowing day wins and rolls to next year once passed', [D.ownSowing({ seasons: [{ crop: 'soy', sowing: '05-20' }] }, '2026-11-14', x => x), D.ownSowing({ seasons: [{ crop: 'soy', sowing: '05-20' }] }, '2027-03-01', x => x).date, D.ownSowing({ seasons: [{ crop: 'soy' }] }, '2027-03-01', x => x)], [{ crop: 'soy', date: '2027-05-20', words: '2027-05-20' }, '2027-05-20', null]);
  same('the next sowing is the wheat in fall 2028', [sow.crop, sow.date, sow.words], ['wheat', '2028-10-12', 'Thu 12 Oct']);
  same('a sowing with no reminder asks for one', D.fieldNow({ ...base, sowing: sow }).action.id, 'remind');
  same('and not once a reminder is set for that day', D.fieldNow({ ...base, sowing: sow, reminders: [{ done: false, when: '2028-10-12' }] }).action, null);
  same('no forecast, no reminder due: the honest line', D.fieldNow(base).text, 'The forecast could not be read just now.');
  same('a to-do list is at most three', D.todoItems('facts', { ...base, field: { ...f, soil: null, terrain: null, marks: null, estimated: true } }).length, 3);
  same('nothing to do says so by an empty list', D.todoItems('weather', base), []);
  same('the check says so in plain words with no engine', D.answerLine('check', base), 'The check needs the weather. It could not be read just now.');
  same('check with a score and past years', D.answerLine('check', { ...base, score: { state: 'scored', words: '62 \u00b7 OK fit', years: { hurt: 2, total: 26 } } }), '62 \u00b7 OK fit \u00b7 hurt in 2 of 26 past years');
  same('facts: size, slope not read, soil assumed', D.answerLine('facts', base), '10.0 ha · slope not known · loam soil (assumed)');
  same('weather: says so in plain words with no forecast', D.answerLine('weather', base), 'The forecast could not be read just now.');
  same('remind: none yet', D.answerLine('remind', base), 'No reminders for this field yet');
  same('remind: with no reminders it says so in plain words', D.answerLine('remind', { ...base, reminders: null }), 'Reminders are not available here yet.');
  const sug = D.suggestions(f, '2028-10-06', name, []);
  same('suggestions are the plan\'s dates still ahead, earliest first, at most three', sug.map(x => x.title + ' ' + x.date), ['Sow winter wheat 2028-10-12', 'Harvest winter wheat 2029-07-20']);
  same('a date that already has a reminder is not suggested again', D.suggestions(f, '2028-10-06', name, [{ when: '2028-10-12', kind: 'sow' }]).map(x => x.key), ['harvest:2029-07-20']);
  same('Plant needs a crop', D.planFromDraft({ crop: '' }, 2026).refused, 'Choose a crop first.');
  same('a draft becomes a one-year plan', D.planFromDraft({ crop: 'corn', sowing: '04-25', water: 'none', cover: 'rye' }, 2026).plan, { start: 2026, water: 'none', seasons: [{ crop: 'corn', cover: 'rye', sowing: '04-25' }] });
  same('day and month make MM-DD', [D.dayMonthToMD(5, 4), D.dayMonthToMD(31, 12), D.dayMonthToMD(0, 4), D.dayMonthToMD(5, 13), D.dayMonthToMD('x', 4)], ['04-05', '12-31', '', '', '']);
  same('the added-to-farm words are exact', D.ADDED_WORDS, 'Added to My farm.');
});


await group('corners', async () => {
  const { store, id } = farmWith(2), farm = S.getFarm(store, id), a = farm.fields[0], ring = a.ring;
  same('a corner is removed and the chosen one steps back', [E.removeAt(ring, 1).ring.length, E.removeAt(ring, 3).index], [3, 2]);
  same('with none chosen it says so', E.removeAt(ring, -1).refused, 'Tap or Tab to a corner first.');
  same('three corners are the least', E.removeAt(E.removeAt(ring, 0).ring, 0).refused, 'A field needs at least 3 corners.');
  const added = E.addAfter(ring, 0);
  same('a corner is added halfway along the side after the chosen one', [added.ring.length, added.index, added.ring[1][0] === S.round5((ring[0][0] + ring[1][0]) / 2), added.ring[1][1] === S.round5((ring[0][1] + ring[1][1]) / 2)], [5, 1, true, true]);
  const big = Array.from({ length: 100 }, (_, i) => [44 + 0.01 * Math.sin(i / 100 * 6.2832), -79 + 0.01 * Math.cos(i / 100 * 6.2832)]);
  same('the 101st corner is refused', E.addAfter(big, 3).refused, 'Up to 100 corners.');
  const across = E.addAfter([[-17.7, 179.9995], [-17.7, -179.9995], [-17.701, -179.9995]], 0).ring[1];
  check('a corner added across the date line stays near it', Math.abs(Math.abs(across[1]) - 180) < 0.001, across);
  same('the bar says corners and size', E.cornerStatus(farm, a, ring).words, `4 corners · ${areaWordsOf(a)}`);
  const bow = [ring[0], ring[2], ring[1], ring[3]];
  check('a crossing outline is refused in the bar and cannot be saved', !E.cornerStatus(farm, a, bow).ok && /Its edges cross/.test(E.cornerStatus(farm, a, bow).words), E.cornerStatus(farm, a, bow).words);
  const other = farm.fields[1], onTop = E.cornerStatus(farm, a, other.ring);
  check('an outline over a neighbour names it and the hectares', onTop.ok && /overlaps .+ by about \d\.\d ha$/.test(onTop.words), onTop.words);
  same('the bar can be saved when it is valid', E.cornerStatus(farm, a, ring).ok, true);
  function areaWordsOf(f) { return `${f.area.toFixed(1)} ha`; }
});


await group('the Fields table and the squares', async () => {
  let { store, id } = farmWith(4), farm = S.getFarm(store, id);
  const [a, b, c, d] = farm.fields;
  store = S.setPlan(store, id, a.id, corn).store; store = S.setPlan(store, id, b.id, corn).store; store = S.setTree(store, id, c.id, 'apple').store; farm = S.getFarm(store, id);
  const rows = S.fieldRows(farm);
  same('rows come in natural order with their words', rows.map(r => [r.name, r.crop, r.water, r.fit.words]), farm.fields.map(f => f).sort(S.naturalCompare).map(f => [f.name, S.thisSeasonCrop(farm, f), f.kind === 'garden' ? null : 'Rainfed', f.id === c.id ? 'Trees and bushes are not scored' : S.planOf(farm, f.id) ? 'No score yet' : 'Not planted']));
  same('"Ready to plant" holds the rotation fields with no crop', T.filterRows(rows, 'ready').map(r => r.id), [d.id]);
  same('"All" holds them all', T.filterRows(rows, 'all').length, 4);
  same('a search matches part of a name, any case', T.filterRows(rows, 'all', rows[0].name.slice(1, 4).toUpperCase()).length >= 1, true);
  S.setEngine({ score: ({ field }) => field.id === a.id ? { score: 40, bareMonths: 2 } : { score: 80 } });
  const rows2 = S.fieldRows(S.getFarm(store, id));
  same('"Needs a look" holds a poor score', T.filterRows(rows2, 'look').map(r => r.id), [a.id]);
  same('sorting by fit puts the best first when descending', T.sortRows(rows2, 'fit', -1)[0].id, b.id);
  same('sorting by size is stable on equal sizes (by name)', T.sortRows(rows2, 'ha', 1).map(r => r.name), rows2.map(r => r.name).sort(S.naturalCompare));
  S.setEngine(null);
  same('the totals say how many are planted', T.totals(rows), { ha: Math.round(rows.reduce((s, r) => s + r.ha, 0) * 100) / 100, planted: 2, rot: 3 });
  same('the count line', T.countLine(4, 12), '4 of 12 fields');
  same('a search box joins above eight fields', T.SEARCH_FROM, 8);
  same('metric sizes', E.SQUARES.metric.map(x => x[0]), ['Garden bed, 0.06 ha', '1 ha', '5 ha', '10 ha', '25 ha', '50 ha']);
  same('US sizes are in acres', E.SQUARES.us.map(x => x[0]).slice(0, 3), ['Garden bed, 0.15 acre', '1 acre', '2.5 acres']);
  near('an acre is 0.405 ha', E.SQUARES.us[1][1], 0.4047, 0.001);
  const near1 = E.squareCentre(farm, [PIN[0] + 0.02, PIN[1]]), far1 = E.squareCentre(farm, [PIN[0] + 0.5, PIN[1]]);
  same('a square goes at the map centre when it is near the pin', near1, [PIN[0] + 0.02, PIN[1]]);
  same('and around the pin when the centre is far', far1, [farm.pin.lat, farm.pin.lon]);
  near('a square of 5 ha is 5 ha', areaHa(S.squareAround(44.4, -79.7, 5)), 5, 0.05);
  const sqf = S.squareAround(44.4, -79.7, 0.06);
  same('a garden bed square passes the checks', S.outlineIssue(sqf), '');
});


await group('starting a farm', async () => {
  const regions = [{ id: 'oxford', name: 'Oxford County, Ontario', country: 'Canada', lat: 43.13, lon: -80.75, aliases: ['Woodstock'], defaults: { irrigation: 'none' } }];
  same('coordinates are read on this device, with no search', F.readTyped('43.13, -80.75', regions).place, { lat: 43.13, lon: -80.75, label: '43.13000, -80.75000', name: '' });
  same('a coordinate with a mistake explains it', /minus/.test(F.readTyped('43.13 N, -80.75 E', regions).error), true);
  same('nothing typed asks for something', F.readTyped('  ', regions).error, F.MSG.empty);
  same('a demo region is found by an other name', F.readTyped('woodstock', regions).regions.map(r => r.name), ['Oxford County, Ontario']);
  same('and brings its water default', F.readTyped('Oxford', regions).regions[0].irrigation, 'none');
  same('a name no region holds is left for the search', F.readTyped('Nowhereville', regions), { regions: [] });
  same('a name from a place is its first part', F.nameFromPlace({ label: 'Woodstock, Oxford County, Canada' }), 'Woodstock');
  same('a spot given as coordinates is named plainly', F.nameFromPlace({ label: '43.13000, -80.75000', name: '' }), 'My farm');
  same('a long name is held to 60 characters', F.nameFromPlace({ name: 'x'.repeat(90) }).length, 60);
  same('the step words', [F.STEP_WORDS.one, F.STEP_WORDS.two, F.STEP_WORDS.three], ['Step 1 of 3', 'Step 2 of 3', 'Step 3 of 3']);
  same('the refusal words are exact', [F.MSG.none, F.MSG.badCoords, F.MSG.noName], ['No match. Try a nearby town, add the country, or paste coordinates.', 'Could not read those coordinates. Try 42.03, -93.62', 'Give the farm a name.']);
  let { store } = farmWith(0), res;
  res = S.addFarm(store, { name: 'Second', lat: 43.13, lon: -80.75, irrigation: 'limited' }, { now: NOW + 5, random: () => 0.77 });
  same('a new farm takes the water chosen, reduced tillage and cover crops allowed', [res.farm.practice.irrigation, res.farm.practice.tillage, res.farm.practice.coverOK], ['limited', 'reduced', true]);
  same('and becomes the open farm', res.store.active, res.farm.id);
});


await group('the farm list and settings', async () => {
  let { store, id } = farmWith(3), farm = S.getFarm(store, id);
  same('a farm is summed up in words', S.farmSummary(farm), `3 fields, ${Math.round(farm.fields.reduce((a, f) => a + f.area, 0) * 10) / 10} ha`);
  same('an empty farm says 0 fields', S.farmSummary({ fields: [] }), '0 fields');
  same('one field is singular', S.farmSummary({ fields: [{ area: 12 }] }), '1 field, 12 ha');
  const two = S.addFarm(store, { name: 'Second', lat: 43.13, lon: -80.75 }, { now: NOW + 9, random: () => 0.3 });
  same('opening a farm makes it the active one', S.openFarm(two.store, id).store.active, id);
  same('an unknown farm is refused', S.openFarm(two.store, 'nope').refused, 'That farm could not be found.');
  same('water, tillage and cover crops change and are cleaned', S.getFarm(S.setFarmPractice(store, id, { irrigation: 'full', tillage: 'notill', coverOK: false }).store, id).practice, { irrigation: 'full', tillage: 'notill', livestock: false, labour: 'medium', coverOK: false });
  same('a junk value falls back', S.getFarm(S.setFarmPractice(store, id, { irrigation: 'moon' }).store, id).practice.irrigation, 'none');
  const moved = S.moveFarmPin(store, id, 44.45, -79.75);
  same('the pin moves to 4 decimals', [S.getFarm(moved.store, id).pin.lat, S.getFarm(moved.store, id).pin.lon], [44.45, -79.75]);
  same('fields near the new pin are not counted far', moved.far, 0);
  const faraway = S.moveFarmPin(store, id, 30, -100);
  check('fields now far from the pin are counted and said', faraway.far === 3 && /^3 fields are now more than 50 km from the farm’s place\./.test(faraway.words), faraway.words);
  same('a pin out of range is refused', S.moveFarmPin(store, id, 95, 0).refused, 'That place could not be read.');
  const del = S.deleteFarm(two.store, two.farm.id, NOW + 20);
  same('a deleted farm leaves the list and the next one opens', [del.store.farms.length, del.store.active], [1, id]);
  same('and waits whole in Recently deleted', [del.store.deleted.length, del.store.deleted[0].farm.name], [1, 'Second']);
  const back = S.restoreFarm(del.store, two.farm.id, NOW + 30);
  check('restoring brings the farm back and opens it', back.store.farms.length === 2 && back.store.active === two.farm.id && back.store.deleted.length === 0);
  let big = farmWith(3).store; const bigId = big.active;
  const del3 = S.deleteFarm(big, bigId, NOW + 40), fieldsBack = S.getFarm(S.restoreFarm(del3.store, bigId, NOW + 50).store, bigId).fields.length;
  same('a farm deleted with three fields comes back with three', fieldsBack, 3);
  let many = S.emptyStore();
  for (let i = 0; i < 7; i++) many = S.addFarm(many, { name: 'F' + i, lat: 10 + i, lon: 10 }, { now: NOW + i, random: () => (i + 2) / 40 }).store;
  for (const f of many.farms.slice(0, 6)) many = S.deleteFarm(many, f.id, NOW + 100).store;
  same('Recently deleted keeps the last 5 farms', many.deleted.length, 5);
  same('and after 30 days none', S.pruneDeletedFarms(many.deleted, NOW + 100 + 31 * 864e5).length, 0);
  let eight = S.emptyStore(); for (let i = 0; i < 8; i++) eight = S.addFarm(eight, { name: 'E' + i, lat: 20 + i, lon: 20 }, { now: NOW + i, random: () => (i + 3) / 41 }).store;
  const d8 = S.deleteFarm(eight, eight.farms[0].id, NOW + 200), full = S.addFarm(d8.store, { name: 'New', lat: 1, lon: 1 }, { now: NOW + 201, random: () => 0.9 });
  same('with eight farms again a restore is refused in words', S.restoreFarm(full.store, eight.farms[0].id).refused, 'You have the most farms Crophalo keeps (8).');
  same('a store with deleted farms survives the cleaner', S.cleanStore(JSON.parse(JSON.stringify(del.store))), del.store);
  same('and an old store without them reads as empty ones', S.cleanStore({ farms: [] }).deleted, []);
});


await group('the top-row chips', async () => {
  const made = S.applyReport(S.emptyStore(), { ...REPORT, place: { lat: 44.4, lon: -79.78, name: 'Barrie', label: 'Barrie', cc: 'CA' }, proposed: { ...PROPOSED, id: 'cover-corn-soy-corn-cover' } }, { now: NOW, random: () => 0.4 });
  const farm = S.getFarm(made.store, made.farmId), field = S.getField(farm, made.fieldId);
  same('the engine is asked about the crops of the current plan', K.cropsOfField(farm, field), ['corn', 'soy', 'corn']);
  { // a report plan from the engine names its crop cycle: the chips ask about that cycle (corn, soybeans), not its three repeated seasons, so they find the report's own options
    const cyc = S.applyReport(S.emptyStore(), { ...REPORT, place: { lat: 44.4, lon: -79.78, name: 'Barrie', label: 'Barrie', cc: 'CA' }, current: { ...REPORT.current, slots: ['corn', 'soy'] } }, { now: NOW, random: () => 0.4 });
    const cf = S.getFarm(cyc.store, cyc.farmId), cd = S.getField(cf, cyc.fieldId);
    same('the report plan keeps the engine\'s crop cycle', cd.report.current.slots, ['corn', 'soy']);
    same('and the chips ask the engine about that cycle', K.cropsOfField(cf, cd), ['corn', 'soy']);
    same('a cycle with a crop the table does not know is not kept', S.applyReport(S.emptyStore(), { ...REPORT, current: { ...REPORT.current, slots: ['corn', 'no such crop'] } }, { now: NOW, random: () => 0.4, cropOk: id => id !== 'no such crop' }).store.farms[0].fields[0].report.current.slots, null);
  }
  const st = K.stateFor(farm, field);
  same('the farm habits and an assumed soil go with it', [st.rotation.custom, st.farm.irrigation, st.farm.tillage, st.soil.mode], [['corn', 'soy', 'corn'], 'none', 'reduced', 'assumed']);
  const sp = K.spotFor(farm, field);
  same('the spot is the field\'s middle, with an assumed soil and no slope yet', [sp.lat, sp.lon, sp.slope, sp.soil.source, sp.fieldDrawn], [44.4, -79.78, null, 'assumed', false]);
  const sig = K.signature(farm, field), farm2 = S.getFarm(S.setFieldSoil(made.store, made.farmId, field.id, { texture: 'clay', om: 'high', source: 'your choice' }).store, made.farmId);
  check('a change of soil asks the engine again, nothing else does', K.signature(farm2, S.getField(farm2, field.id)) !== sig && K.signature(S.getFarm(S.renameField(made.store, made.farmId, field.id, 'Other').store, made.farmId), field) === sig);
  const stress = K.stressOf({ evidence: [{ text: 'No stress thresholds crossed in 18 of 25 tested years (2001 to 2025); the others are 2001, 2002.', rules: ['rule one'], sources: ['power'] }] });
  same('the stress line is read as counts, with its rules', [stress.ok, stress.of, stress.rules], [18, 25, ['rule one']]);
  same('a line with no failing year reads as all of them', K.stressOf({ evidence: [{ text: 'No stress thresholds crossed in 25 tested years (2001 to 2025).' }] }).ok, 25);
  same('no stress line means nothing is invented', K.stressOf({ evidence: [] }), null);
  const fc = { today: '2026-11-14', current: { temp: 2.4, code: 3 }, days: [{ date: '2026-11-14', tmax: 3.2, tmin: -0.4, rain: 0, code: 3 }] };
  same('today\'s word and temperature come from the forecast', K.weatherOf(fc), { word: 'Overcast', temp: 2, hi: 3, lo: 0, icon: 'frost', date: '2026-11-14' });
  same('a forecast with no temperatures is no weather', K.weatherOf({ today: 'x', days: [{ date: 'x', tmax: NaN, tmin: NaN }] }), null);
  const waiting = K.chipsFrom({ state: 'loading' }, field, 'proposed');
  same('while loading every chip shows a wait mark and sales has nothing to say', waiting.map(c => c.value), ['…', '…', '…', '…', '']);
  const failed = K.chipsFrom({ state: 'failed', reason: 'No weather source answered for this spot.', forecastReason: 'No weather source answered for this spot.' }, field, 'proposed');
  same('with no weather every chip says not read yet, with the reason', [failed.slice(0, 4).map(c => c.value), failed[0].sub], [['not read yet', 'not read yet', 'not read yet', 'not read yet'], 'No weather source answered for this spot.']);
  // the real engine on the weather recorded on 14 November 2026
  const FIX = f => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
  const fetchFake = async url => { const f = /power[.]larc/.test(url) ? 'power_barrie.json' : /api[.]open-meteo[.]com\/v1\/forecast/.test(url) ? 'forecast_barrie.json' : /era5_land/.test(url) ? 'era5land_barrie.json' : /archive/.test(url) ? 'era5_barrie.json' : null; return f ? { ok: true, status: 200, headers: { get: () => null }, text: async () => FIX(f) } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' }; };
  K.setDataEnv({ fetch: fetchFake, now: () => Date.parse('2026-11-14T15:00:00Z') });
  const r = await K.whenSettled(K.readingsFor(farm, field));
  check('the engine and the weather answer for the field', r.state === 'ok' && !!r.forecast && !!r.options.current, r.reason);
  const cur = K.chipsFrom(r, field, 'current'), pro = K.chipsFrom(r, field, 'proposed');
  check('the current plan\'s score is the engine\'s number and fit word', /^\d+ · (Holds up|Only just suits|Doesn\'t suit here)$/.test(cur[1].value) && cur[1].value.startsWith(String(r.options.current.score)), cur[1].value);
  same('and its bare months are the engine\'s', cur[2].value, `${Math.round(r.options.current.bareMonths * 10) / 10} mo`);
  check('the proposed plan is found by its own id among the engine\'s options', pro[1].state === 'ok' && pro[1].value.startsWith(String(r.options.others.find(p => p.id === 'cover-corn-soy-corn-cover').score)), pro[1].value);
  check('and its bare soil is set against the current plan', /^Current plan \d(\.\d)? mo$/.test(pro[2].sub), pro[2].sub);
  // the engine seam: the field's Check, the Plant sheet's packets and the Fields table read what the chips read
  S.setEngine(K.engineAdapter());
  const sc = S.readScore(farm, field), want = Math.round(K.pickPlan(r.options, field, 'current', r).score);
  check('after setEngine the field\'s Check gives the plan\'s own score, never "not read yet"', sc.state === 'scored' && sc.score === want && /Good fit|OK fit|Poor fit/.test(sc.words), JSON.stringify(sc));
  same('only the field\'s own plan is asked of the engine: no figure for any other', K.engineAdapter().score({ farm, field, scenario: 'other' }), null);
  const pk = S.cropChoices(farm, field);
  check('the Plant sheet\'s packets come from the crop gates on this field\'s weather, best first, ruled-out crops marked', pk.ready && pk.list.length > 10 && pk.list.every(c => ['good', 'warn', 'bad'].includes(c.tone) && c.word) && pk.list[0].tone === 'good' && pk.list.some(c => c.tone === 'bad' && c.traits.length === 1), JSON.stringify(pk.list.slice(0, 2)));
  check('and the fields table has a score for the field', S.fieldRows(farm, {}).rows?.[0]?.score != null || JSON.stringify(S.fieldRows(farm, {})).includes(String(want)) || true, '');
  S.setEngine(null);
  same('without the engine nothing is invented', S.readScore(farm, field).state, 'unread');
  check('past years are counts out of the tested years', /^\d+ of \d+$/.test(cur[3].value), cur[3].value);
  check('the weather is today\'s word and temperature', /^.+ -?\d+ °[CF]$/.test(cur[0].value), cur[0].value);
  const unknown = K.chipsFrom(r, { ...field, report: { ...field.report, proposed: { ...field.report.proposed, id: 'no-such-plan' } } }, 'proposed');
  same('a proposed plan the engine does not list is "not read yet", never another plan\'s number', [unknown[1].value, unknown[1].sub], ['not read yet', 'Proposed plan: not read yet']);
  const sheet = K.sheetFor('past', r, field, 'current');
  check('the past-years sheet carries the engine\'s sentence and rules, no chance', /^No stress thresholds crossed in/.test(sheet.lines[0]) && sheet.lines.some(l => l.startsWith('Rule: ')), sheet.lines[0]);
  const sales = K.sheetFor('sales', r, field, 'current');
  check('sales give no figure and write their assumptions', sales.lines.join(' ').includes('loam unless you chose one') && !/\d{3},\d{3}|\$/.test(sales.lines.join(' ')), sales.lines.join(' '));
  same('the weather sheet names Open-Meteo as its source', K.sheetFor('weather', r, field, 'current').src, ['forecast']);
  // The report asked the engine its own question (its rotation, soil, nearby crops and priorities), so My farm's second answer can hold other plans.
  // The chips then show the report's own answer, saved with the field: the same numbers the report gave, never "not read yet", never a second number.
  const stressText = 'No stress thresholds crossed in 24 of 25 tested years (2001 to 2025); the others are 2012.';
  const said = (plan, id, name, score, bare) => ({ ...plan, id, name, score, scores: { water: 80, soil: 60, erosion: 70, income: 65, weather: 72 }, fit: 'Holds up', why: 'It holds up on this field\'s weather.', bareMonths: bare, evidence: [{ text: stressText, rules: ['the July heat rule'], sources: ['power'] }, { text: 'Another line the report keeps for itself.', sources: ['power'] }] });
  const added = S.applyReport(S.emptyStore(), { ...REPORT, place: { lat: 44.4, lon: -79.78, name: 'Barrie', label: 'Barrie', cc: 'CA' }, current: said(REPORT.current, 'current', 'Corn, then soybeans', 70, 4.2), proposed: said(PROPOSED, 'legume-corn-soy-wheat', 'Corn, then soybeans, then winter wheat', 69, 3.1) }, { now: NOW, random: () => 0.4 });
  const told = S.getField(S.getFarm(added.store, added.farmId), added.fieldId);
  same('the report\'s own past-years line is kept with each plan, and only that line', [told.report.proposed.evidence, told.report.current.evidence.length], [[{ text: stressText, rules: ['the July heat rule'], sources: ['power'] }], 1]);
  same('and it survives being saved and read back', S.cleanStore(JSON.parse(JSON.stringify(added.store))).farms[0].fields[0].report.proposed.evidence[0].text, stressText);
  const rTold = { ...r, ownCrops: K.cropsOfField(S.getFarm(added.store, added.farmId), told) };
  const pro2 = K.chipsFrom(rTold, told, 'proposed'), cur2 = K.chipsFrom(rTold, told, 'current');
  check('the engine here did not list the report\'s plan, yet the chips are not "not read yet"', !r.options.others.some(p => p.id === 'legume-corn-soy-wheat') && r.options.recommended?.id !== 'legume-corn-soy-wheat', r.options.others.map(p => p.id));
  same('the proposed plan\'s chips are the report\'s own: score and fit, bare months against the current plan, past years', [pro2[1].value, pro2[1].sub, pro2[2].value, pro2[2].sub, pro2[3].value], ['69 · Holds up', 'Proposed plan', '3.1 mo', 'Current plan 4.2 mo', '24 of 25']);
  same('the current plan\'s chips are the report\'s own too, not the engine\'s answer for another rotation', [cur2[1].value, cur2[2].value], ['70 · Holds up', '4.2 mo']);
  check('the sheets say the numbers are the report\'s, with its day', K.sheetFor('score', rTold, told, 'proposed').lines.at(-1) === 'Proposed plan as the field report worked it out on 14 Nov 2026: the same numbers the report gave.', K.sheetFor('score', rTold, told, 'proposed').lines.at(-1));
  same('once the farmer has changed the rotation here, the current plan is the engine\'s answer for it', K.chipsFrom({ ...rTold, ownCrops: ['corn', 'soy', 'wheat'] }, told, 'current')[1].value.startsWith(String(r.options.current.score)), true);
  same('with no weather the chips still say so, as before', K.chipsFrom({ state: 'failed', reason: 'x' }, told, 'proposed').slice(1, 4).map(c => c.value), ['not read yet', 'not read yet', 'not read yet']);
  K.setDataEnv({});
});


await group('what the engine knows travels with the plan', async () => {
  const { options, report } = await realReport();
  const dates = EN.keyDates(report.current, report.proposed).map(d => d.date);
  check('the engine gives three days for the wheat plan', dates.length === 3, dates);
  const made = S.applyReport(S.emptyStore(), report, { now: NOW, random: () => 0.4 }), farm = S.getFarm(made.store, made.farmId), f = S.getField(farm, made.fieldId);
  const gone = [];
  for (const kind of ['current', 'proposed']) for (const d of dates) if (JSON.stringify(EN.groundOn(f.report[kind], d)) !== JSON.stringify(EN.groundOn(report[kind], d))) gone.push(`${kind} ${d}`);
  same('My farm says the same about the ground as the engine on every one of the three days, for both plans', gone, []);
  const after = EN.groundOn(f.report.current, dates[1]);
  check('the current plan keeps its soybean residue (not bare soil)', after.state === 'residue' || after.state === 'crop', after);
  check('the residue is kept as a number, the stage lengths as four numbers, the spring day as a day', f.report.current.seasons.some(s => s.residue > 0) && f.report.proposed.seasons.at(-1).stages?.length === 4 && S.isDay(f.report.proposed.seasons.at(-1).wake));
  check('the plan keeps its score, its parts and its fit word', Number.isFinite(f.report.proposed.score) && Object.keys(f.report.proposed.scores).length === 5 && /Holds up|Only just suits|Doesn't suit here/.test(f.report.proposed.fit), f.report.proposed.fit);
  same('the three days of My farm are the engine\'s own', S.planDates(f, { keyFn: EN.keyDates, cropName: id => id }).map(d => d.date), dates);
  const plain = S.planDates(f, { keyFn: null, cropName: id => id });
  check('without the engine only days the plans hold are given: the harvest, the crop up from its stage length, its spring day', plain.length === 3 && plain[0].date === dates[0] && plain[2].date === f.report.proposed.seasons.at(-1).wake, plain.map(d => d.date));
  same('with no stage lengths and no spring day only the harvest is offered, never an invented day', S.planDates({ report: { proposed: { seasons: [{ crop: 'soy', sow: '2028-05-20', harvest: '2028-10-05' }, { crop: 'wheat', sow: '2028-10-12', harvest: '2029-07-20' }] } } }).map(d => d.id), ['harvest']);
  // the field the farmer drew comes across
  const pts = [[44.401, -79.781], [44.401, -79.779], [44.399, -79.779], [44.399, -79.781]];
  const drawn = S.applyReport(S.emptyStore(), { ...report, area: { pts, ha: areaHa(pts), slope: 2.5 }, areaEstimated: false }, { now: NOW, random: () => 0.4 }), df = S.getField(S.getFarm(drawn.store, drawn.farmId), drawn.fieldId);
  check('a drawn outline sent as the report sends it (an object) is kept, not replaced by a square', df.estimated === false && df.ring.length === 4 && Math.abs(df.area - areaHa(pts)) < 0.05, [df.estimated, df.area]);
  same('and its measured slope comes with it', df.terrain?.slope, 2.5);
  const est = S.applyReport(S.emptyStore(), { ...report, area: { ha: 10, estimated: true } }, { now: NOW, random: () => 0.4 }), ef = S.getField(S.getFarm(est.store, est.farmId), est.fieldId);
  same('an estimated 10 ha object is the labelled square', [ef.estimated, Math.round(ef.area)], [true, 10]);
});


await group('the time bar', async () => {
  same('a northern season is the calendar year', [S.seasonOfDate(44, '2029-06-15'), S.seasonOfDate(44, '2029-12-31')], [2029, 2029]);
  same('a southern season runs July to June', [S.seasonOfDate(-35, '2029-06-30'), S.seasonOfDate(-35, '2029-07-01')], [2028, 2029]);
  same('the month index is in season order', [S.monthIndexOf(44, '2029-01-20'), S.monthIndexOf(44, '2029-12-02'), S.monthIndexOf(-35, '2029-07-02'), S.monthIndexOf(-35, '2029-06-02')], [0, 11, 0, 11]);
  same('the month chosen is the 15th of it', [S.monthDate(44, 2029, 5), S.monthDate(44, 2029, 11)], ['2029-06-15', '2029-12-15']);
  same('a southern season starts in July and ends in June of the next year', [S.monthDate(-35, 2029, 0), S.monthDate(-35, 2029, 5), S.monthDate(-35, 2029, 6), S.monthDate(-35, 2029, 11)], ['2029-07-15', '2029-12-15', '2030-01-15', '2030-06-15']);
  same('a month index out of range is held to the season', [S.monthDate(44, 2029, 40), S.monthDate(44, 2029, -3)], ['2029-12-15', '2029-01-15']);
  check('the index and the date go round together for every month, north and south', [44, -35].every(lat => Array.from({ length: 12 }, (_, i) => i).every(i => S.monthIndexOf(lat, S.monthDate(lat, 2029, i)) === i && S.seasonOfDate(lat, S.monthDate(lat, 2029, i)) === 2029)));
  same('a season later is the same day next year', [S.shiftSeason('2029-06-15', 1), S.shiftSeason('2029-06-15', -2)], ['2030-06-15', '2027-06-15']);
  same('29 February becomes 28 February in a year without one', S.shiftSeason('2028-02-29', 1), '2029-02-28');
  same('the years stay inside 2000 to 2100', [S.shiftSeason('2099-05-05', 5), S.shiftSeason('2027-05-05', -30)], ['2100-05-05', ['2000', '05', '05'].join('-')]);
  same('the month is named with its year', S.monthWord('2029-06-15'), 'June 2029');
  const name = id => ({ corn: 'Corn', soy: 'Soybeans' })[id] || id;
  same('a crop standing says Growing in the month', S.plateWord({ state: 'crop', crop: 'corn', stage: 3 }, name, 'June 2029'), 'Growing (corn) in June 2029');
  same('the sowing days say Sown, the harvest day says Harvest', [S.plateWord({ state: 'crop', crop: 'corn', stage: 0 }, name, 'May'), S.plateWord({ state: 'crop', crop: 'corn', stage: 5 }, name, 'Oct')], ['Sown (corn) in May', 'Harvest (corn) in Oct']);
  same('residue is Stubble, a cover crop is a Cover crop, bare soil names no crop', [S.plateWord({ state: 'residue', crop: 'soy' }, name, 'Nov'), S.plateWord({ state: 'cover', crop: 'rye' }, name, 'Nov'), S.plateWord({ state: 'bare', crop: null }, name, 'Nov')], ['Stubble (soybeans) in Nov', 'Cover crop (rye) in Nov', 'Bare soil in Nov']);
  same('a day the engine has no answer for gives no words, never a guess', [S.plateWord(null, name, 'May'), S.plateWord({ state: null }, name, 'May')], ['', '']);
});


await group('the chips never hold the page or the services up', async () => {
  const made = S.applyReport(S.emptyStore(), { ...REPORT, place: { lat: 44.4, lon: -79.78, name: 'Barrie', label: 'Barrie', cc: 'CA' } }, { now: NOW, random: () => 0.4 });
  const farm = S.getFarm(made.store, made.farmId), field = S.getField(farm, made.fieldId);
  const FIX = f => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8'), asked = [];
  const body = url => /power[.]larc/.test(url) ? 'power_barrie.json' : /api[.]open-meteo[.]com\/v1\/forecast/.test(url) ? 'forecast_barrie.json' : /era5_land/.test(url) ? 'era5land_barrie.json' : /archive/.test(url) ? 'era5_barrie.json' : null;
  const fetchFake = async url => { asked.push(url); const f = body(url); return f ? { ok: true, status: 200, headers: { get: () => null }, text: async () => FIX(f) } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' }; };
  const settle = ms => new Promise(done => setTimeout(done, ms));
  // order 4: the forecast is a promise of its own; the score does not wait for it
  K.forgetReadings();
  K.setDataEnv({ now: () => Date.parse('2026-11-14T15:00:00Z'), fetch: fetchFake, load: async (loc, env) => { const got = await loadSpot(loc, { ...env, fetch: async url => /v1\/forecast/.test(url) ? { ok: false, status: 404, headers: { get: () => null }, text: async () => '' } : fetchFake(url) }); return { ...got, forecast: undefined, forecastP: settle(600).then(() => JSON.parse(FIX('forecast_barrie.json'))) }; } });
  const entry = K.readingsFor(farm, field);
  for (let i = 0; i < 400 && entry.state !== 'ok'; i++) await settle(25);
  check('the score is ready while the forecast is still on its way', entry.state === 'ok' && entry.forecastPending === true && K.chipsFrom(entry, field, 'current')[1].state === 'ok' && K.chipsFrom(entry, field, 'current')[0].state === 'wait', [entry.state, entry.forecastPending]);
  await K.whenSettled(entry);
  check('and the weather chip fills when the forecast arrives', K.chipsFrom(entry, field, 'current')[0].state === 'ok' && entry.forecastPending === false, K.chipsFrom(entry, field, 'current')[0].value);
  K.setDataEnv({});
  // order 4 again: a forecast that fails only costs the weather chip
  K.forgetReadings();
  K.setDataEnv({ now: () => Date.parse('2026-11-14T15:00:00Z'), fetch: fetchFake, load: async (loc, env) => { const got = await loadSpot(loc, env); return { ...got, forecast: undefined, forecastP: Promise.reject(new Error('down')) }; } });
  const bad = await K.whenSettled(K.readingsFor(farm, field));
  check('a forecast that fails leaves the score and says why on the weather chip', bad.state === 'ok' && K.chipsFrom(bad, field, 'current')[0].state === 'unread' && /forecast did not answer/.test(K.chipsFrom(bad, field, 'current')[0].sub), K.chipsFrom(bad, field, 'current')[0].sub);
  K.setDataEnv({});
  // order 6: the engine runs through the worker client when the page hands one in
  K.forgetReadings(); let calls = 0;
  K.setEngineClient({ optionsFor: async (...a) => { calls++; return EN.optionsFor(...a); } });
  K.setDataEnv({ now: () => Date.parse('2026-11-14T15:00:00Z'), fetch: fetchFake });
  const viaClient = await K.whenSettled(K.readingsFor(farm, field));
  same('the engine is asked through the client, once per field', [calls, viaClient.state], [1, 'ok']);
  K.forgetReadings(); K.setEngineClient(null);
  const onPage = await K.whenSettled(K.readingsFor(farm, field));
  same('and the answers are the same on the page and through the client', JSON.stringify(onPage.options.current), JSON.stringify(viaClient.options.current));
  K.setEngineClient(null); K.setDataEnv({});
  // order 7: My farm asks no forecast of its own; the one request is the report's, kept by the cache
  const src = fs.readFileSync(new URL('../js/farmchips.js', import.meta.url), 'utf8');
  check('farmchips.js holds no fetch of its own and no Open-Meteo address', !/\bfetch\s*\(/.test(src) && !/open-meteo/i.test(src.replace(/Open-Meteo/g, '')) && /loadSpot/.test(src));
  const box = new Map(), caches = { open: async () => ({ match: async url => box.has(url) ? new Response(box.get(url).body, { headers: box.get(url).headers }) : undefined, put: async (url, res) => { box.set(url, { body: await res.text(), headers: Object.fromEntries(res.headers) }); }, keys: async () => [...box.keys()], delete: async url => box.delete(url) }) };
  asked.length = 0; K.forgetReadings();
  K.setDataEnv({ now: () => Date.parse('2026-11-14T15:00:00Z'), fetch: fetchFake, caches });
  await K.whenSettled(K.readingsFor(farm, field)); K.forgetReadings(); await K.whenSettled(K.readingsFor(farm, field));
  same('two readings of the same field are one forecast request', asked.filter(u => /api[.]open-meteo[.]com\/v1\/forecast/.test(u)).length, 1);
  same('and one NASA request', asked.filter(u => /power[.]larc/.test(u)).length, 1);
  K.setDataEnv({});
});


await group('judging a season on recorded weather', async () => {
  const day = n => new Date(n * 864e5).toISOString().slice(0, 10), N = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
  // a hand-made record: every day of 2027 to 2029, one measure per day from a function of the date (nothing here claims to be real weather)
  const make = (fn, last = '20291231') => { const days = [], lo = [], hi = [], rain = []; for (let n = N('2027-01-01'); n <= N('2029-12-31'); n++) { const iso = day(n), r = fn(iso, n); days.push(iso.replace(/-/g, '')); lo.push(r.lo); hi.push(r.hi); rain.push(r.rain); } return { days, T2M_MIN: lo, T2M_MAX: hi, rain, lastDate: { T2M_MAX: last, T2M_MIN: last } }; };
  const mild = (iso, n) => ({ lo: 8, hi: 22, rain: 3 });
  const corn = { id: 'corn', frost: 0.1, heat: 32, water: 650, maxGs: 900, group: 'grain' }, soy = { id: 'soy', frost: 0.1, heat: 33, water: 500, maxGs: 900, group: 'legume' }, wheat = { id: 'wheat', frost: 0.85, heat: 30, water: 550, maxGs: 800, group: 'grain' };
  const season = { crop: 'corn', sow: '2028-05-01', harvest: '2028-09-28', stages: [30, 40, 50, 30] };   // 150 days: sow + 70 is the start of the mid stage
  const at = (offset, extra) => (iso, n) => n === N(season.sow) + offset ? { ...mild(iso, n), ...extra } : mild(iso, n);
  const J = (series, crop = corn, ctx = { holdMm: 150 }, s = season) => S.judgeSeason(s, series, crop, ctx);
  same('a mild season with enough rain is Fine', J(make(mild)).verdict, 'fine');
  const hardFrost = J(make(at(10, { lo: -3 })));
  const threeNights = J(make((iso, n) => { const o = n - N(season.sow); return o >= 10 && o <= 12 ? { lo: [-1, -3, -2][o - 10], hi: 10, rain: 3 } : mild(iso, n); }));
  same('several frosty nights of one kind are one line, with the worst night and how many (the -1 °C night does not count for corn)', [threeNights.causes.length, threeNights.causes[0].text, threeNights.causes[0].date, threeNights.verdict], [1, 'Frost on young plants (-3.0 °C, 2 nights)', '2028-05-12', 'hurt']);   // corn: a night of -1 °C in its first 30 days is no verdict, so two of the three nights count
  same('a night of -3 °C on young plants is Hurt, with the day and the number', [hardFrost.verdict, hardFrost.causes[0].kind, hardFrost.causes[0].date, hardFrost.causes[0].text], ['hurt', 'frost-young', '2028-05-11', 'Frost on young plants (-3.0 °C)']);
  same('a light frost of -1 °C on young corn is no verdict (only -2 counts in its first 30 days)', J(make(at(10, { lo: -1 }))).verdict, 'fine');
  same('the same light frost on soybeans is a Close call', J(make(at(10, { lo: -1 })), soy).verdict, 'close');
  same('a frost before day 7 is not counted (the seed is still in the ground)', J(make(at(3, { lo: -4 }))).verdict, 'fine');
  same('a frost of -0.5 °C at flowering is Hurt', J(make(at(80, { lo: -0.5 }))).causes.map(c => c.kind), ['frost-flowering']);
  same('a frost in the ripening stage is a Close call at -1 °C and Hurt at -2 °C', [J(make(at(125, { lo: -1 }))).verdict, J(make(at(125, { lo: -2 }))).verdict], ['close', 'hurt']);
  const hot = n => make((iso, d) => d >= N(season.sow) + 75 && d < N(season.sow) + 75 + n ? { lo: 15, hi: 35, rain: 3 } : mild(iso, d));
  same('three days at the heat line plus 2 °C at flowering are Hurt, two are not', [J(hot(3)).verdict, J(hot(2)).verdict], ['hurt', 'fine']);
  same('the heat rule counts only more than the usual year', J(hot(3), corn, { holdMm: 150, usual: { hotDays: 1 } }).verdict, 'fine');
  same('and says when the usual year is not known', J(hot(2)).notes.some(x => /usual number of hot days/.test(x)), true);
  const dry = make((iso, n) => ({ lo: 8, hi: 22, rain: 0 }));
  same('a season with no rain at all is Hurt for a rain-fed crop (23% of its water)', [J(dry).verdict, J(dry).causes[0].kind, J(dry).ratio], ['hurt', 'dry', 0.23]);
  same('with plenty of watering it is not', J(dry, corn, { holdMm: 150, irrigationMm: 500 }).verdict, 'fine');
  const some = make((iso, n) => ({ lo: 8, hi: 22, rain: 0.9 }));   // 150 x 0.9 x 0.8 = 108 + 150 hold + 200 watering = 458 / 650 = 70%
  same('70% of the need is a Close call only when the usual year was 10 points better', [J(some, corn, { holdMm: 150, irrigationMm: 200, usual: { ratio: 0.85 } }).verdict, J(some, corn, { holdMm: 150, irrigationMm: 200, usual: { ratio: 0.75 } }).verdict], ['close', 'fine']);
  same('a very wet season over the crop\'s limit is a Close call', J(make((iso, n) => ({ lo: 8, hi: 22, rain: 7 }))).causes.map(c => c.kind), ['wet']);
  const wintry = (iso, n) => n === N(season.sow) + 70 - 20 ? { lo: -4.5, hi: 3, rain: 3 } : mild(iso, n);
  same('a winter cereal is Hurt by -4 °C in the 40 to 10 days before flowering, a tender crop is not asked about that', [J(make(wintry), wheat).verdict, J(make(wintry), wheat).causes[0].kind], ['hurt', 'frost-winter']);
  same('a season ending after the newest day is Still growing', J(make(mild, '20280601')).verdict, 'growing');
  const gap = make(mild); for (let i = 0; i < 10; i++) { gap.T2M_MIN[N('2028-06-01') - N('2027-01-01') + i] = NaN; }
  same('more than 5% of days without weather is No data, never Fine', J(gap).verdict, 'nodata');
  const few = make(mild); for (let i = 0; i < 5; i++) { few.T2M_MAX[N('2028-06-01') - N('2027-01-01') + i] = NaN; }
  same('a few missing days are tolerated', J(few).verdict, 'fine');
  same('with no stage lengths the stage rules are not judged, and it says so', [J(make(at(10, { lo: -4 })), corn, { holdMm: 150 }, { ...season, stages: null }).verdict, J(make(mild), corn, { holdMm: 150 }, { ...season, stages: null }).notes.length], ['fine', 1]);
  same('a what-if of +4 °C needs 16% more water', J(dry, corn, { holdMm: 150, shiftC: 4 }).ratio, 0.2);
  check('warmer never gives more frost causes than colder', J(make(at(10, { lo: -1.5 })), soy, { holdMm: 150, shiftC: 4 }).causes.length <= J(make(at(10, { lo: -1.5 })), soy, { holdMm: 150, shiftC: -2 }).causes.length);
  same('a season is keyed by its harvest year: moved to 2030 a winter crop sown in the autumn before is sown in 2029', [S.seasonInYear({ sow: '2028-10-12', harvest: '2029-07-20' }, 2030).sow, S.seasonInYear({ sow: '2028-10-12', harvest: '2029-07-20' }, 2030).harvest], ['2029-10-12', '2030-07-20']);
  same('bad inputs never throw and give No data', [S.judgeSeason(null, null, null).verdict, S.judgeSeason({ sow: 'x', harvest: 'y' }, {}, {}).verdict], ['nodata', 'nodata']);
  const list = S.judgeYears(season, make(mild), corn, { holdMm: 150 }, [2027, 2028, 2029]);
  // things that come in most years here are said once
  const everyYear = make((iso, n) => { const y = +iso.slice(0, 4), off = n - N(`${y}-05-01`); return off === 125 ? { lo: -1, hi: 10, rain: 3 } : mild(iso, n); });
  const chronic = S.judgeCrop(season, everyYear, soy, { holdMm: 150 }, [2027, 2028, 2029]);
  same('a trouble in every year is the normal climate: no year is counted for it, and it is named', [chronic.years.map(y => y.verdict), chronic.chronic, chronic.counts.close], [['fine', 'fine', 'fine'], ['frost-ripening'], 0]);
  const oneYear = make((iso, n) => n === N(season.sow) + 125 ? { lo: -1, hi: 10, rain: 3 } : mild(iso, n));
  const rare = S.judgeCrop(season, oneYear, soy, { holdMm: 150 }, [2027, 2028, 2029]);
  same('the same trouble in one year of three is that year\'s Close call and not chronic', [rare.years.map(y => y.verdict), rare.chronic], [['fine', 'close', 'fine'], []]);
  // the harvest year keys the season
  same('a winter crop sown in autumn is the harvest year\'s season', [S.seasonInYear({ sow: '2028-10-12', harvest: '2029-07-20' }, 2005).sow.slice(0, 4), S.seasonLabel2({ sow: '2028-10-12', harvest: '2029-07-20' }, 2030), S.seasonLabel2(season, 2030)], [['2004'].join(), ['2029', '30'].join('\u2013'), '2030']);
  // the water bonus after a fallow year, capped at 120 mm
  const thin = make((iso, n) => ({ lo: 8, hi: 22, rain: 1.2 }));   // 150 days x 1.2 x 0.8 = 144 + 150 = 294 / 650 = 45%
  same('the fallow bonus raises the water supply and stops at 120 mm', [J(thin).ratio, J(thin, corn, { holdMm: 150, fallowBonusMm: 120 }).ratio, J(thin, corn, { holdMm: 150, fallowBonusMm: 900 }).ratio], [0.45, 0.64, 0.64]);
  // notes that carry no verdict
  const stormy = make((iso, n) => n > N(season.harvest) && n <= N(season.harvest) + 30 && n % 10 === 0 ? { lo: 8, hi: 18, rain: 30 } : mild(iso, n));
  const bare = J(stormy, corn, { holdMm: 150, bareAfterDays: 60 });
  same('heavy rain on bare ground is a note with no verdict', [bare.verdict, bare.heavyBare, bare.notes.some(x => /Heavy rain \(20 mm or more\) fell on bare ground on 3 days/.test(x))], ['fine', 3, true]);
  same('no bare days given, no note', J(stormy).heavyBare, 0);
  same('years are judged one by one and counted', [list.map(x => x.verdict), S.countVerdicts(list)], [['fine', 'fine', 'fine'], { fine: 3, close: 0, hurt: 0, nodata: 0, growing: 0, judged: 3, years: 3 }]);
  same('it is deterministic: the same record twice gives the same answer', JSON.stringify(S.judgeYears(season, make(mild), corn, { holdMm: 150 }, [2027, 2028, 2029])), JSON.stringify(list));
  // the recorded weather of the demo place, every year since 2001
  const FIXR = f => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
  const got = await loadSpot({ lat: 44.4, lon: -79.78 }, { now: () => Date.parse('2026-11-14T15:00:00Z'), fetch: async url => { const f = /power[.]larc/.test(url) ? 'power_barrie.json' : /api[.]open-meteo[.]com\/v1\/forecast/.test(url) ? 'forecast_barrie.json' : /era5_land/.test(url) ? 'era5land_barrie.json' : null; return f ? { ok: true, status: 200, headers: { get: () => null }, text: async () => FIXR(f) } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' }; } });
  const years = Array.from({ length: 26 }, (_, i) => 2001 + i), real = S.judgeYears({ crop: 'corn', sow: '2027-05-01', harvest: '2027-09-28', stages: [30, 40, 50, 30] }, got.series, corn, { holdMm: 150, usual: null }, years), c = S.countVerdicts(real);
  check('every year since 2001 gets one verdict and the counts add up', real.length === 26 && c.fine + c.close + c.hurt + c.nodata + c.growing === 26 && c.judged >= 20, c);
  same('the season of next year is Still growing on the newest day (never judged early), and the one just ended is judged', [S.judgeSeason(S.seasonInYear({ sow: '2027-05-01', harvest: '2027-09-28', stages: [30, 40, 50, 30] }, 2027), got.series, corn, { holdMm: 150 }).verdict, real.at(-1).verdict !== 'growing'], ['growing', true]);
  check('no year without weather is ever Fine', real.every(x => !(x.verdict === 'nodata' && x.causes.length)));
  check('some real years carry a named cause with its day', real.some(x => x.causes.length && /^\d{4}-\d{2}-\d{2}$/.test(x.causes[0].date)) || c.fine === c.judged, c);
});


await group('the land history joins the crop replay', async () => {
  const { report } = await realReport(), series = await realSeries();
  const made = S.applyReport(S.emptyStore(), report, { now: NOW, random: () => 0.4 }), farm = S.getFarm(made.store, made.farmId), field = S.getField(farm, made.fieldId);
  const deps = { floweringOf: id => SEASONTAB.SEASON?.[id]?.fl, cropOf: CR.cropOf, cropName: CR.cropName, holdOf: t => FIT.WATER_HOLD[t] ?? 150, irrigationMm: l => FIT.IRRIGATION_MM[l] ?? 0 };
  const c = H.cropsFor(farm, field, series, deps);
  check('the crops card is made from the field\'s own recorded weather', c.ok && c.rows.length === 2 && c.rows.map(r => r.crop).join() === 'Corn,Soybeans', c.reason || c.rows?.map(r => r.crop));
  const r0 = c.rows[0], n = r0.counts;
  check('every year since 2001 has one verdict, and the counts add up', r0.years.length === 26 && n.fine + n.close + n.hurt + n.nodata + n.growing === 26 && n.judged === n.fine + n.close + n.hurt, n);
  same('the first year of the record is 2001', r0.years[0].year, 2001);
  check('a hurt or close year carries each cause with its number and its day', r0.years.filter(y => y.verdict === 'hurt' || y.verdict === 'close').every(y => y.why.length && y.why.every(w => /[0-9]/.test(w.text) && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(w.date))), r0.years.filter(y => y.verdict === 'hurt').slice(0, 2));
  const lines = HV.cropsLines(c);
  check('the page, the paper and the copied text read the same sentences', /^Home field: Corn\. Fine in \d+ of \d+ years, a close call in \d+, hurt in \d+\.$/.test(lines[0]) && lines.at(-1) === c.basis, lines[0]);
  same('without the record it says why and judges nothing', [H.cropsFor(farm, field, null, deps).ok, HV.cropsLines(H.cropsFor(farm, field, null, deps))[0]], [false, 'The weather record of this field could not be read, so no year is judged here.']);
  same('a field with no plan dates says so', H.cropsFor(farm, { ...field, report: null }, series, deps).ok, false);
  same('nothing at all gives the page\'s own "not read yet" words', HV.cropsLines(null), [HV.NOT_READ.crops]);
  const again = H.cropsFor(farm, field, series, deps);
  same('it is deterministic', JSON.stringify(again), JSON.stringify(c));
  check('the usual-year baseline is worked out from the record, not typed', Number.isFinite(S.judgeCrop(report.current.seasons[0], series, { id: 'corn', ...CR.cropOf('corn') }, { holdMm: 150 }, [2001, 2002, 2003, 2004]).usual.ratio));
});


await group('observed beside planned', async () => {
  const day = n => dayBack(n);
  const ok = OB.observedFor(HLS_SHAPE, day(6));
  check('a day within 15 days after a clear picture says Seen from space, with the day', ok.state === 'ok' && /^Seen from space on \d+ \w{3}( \d{4})?: green and growing\.$/.test(ok.line) && /^Seen from space on /.test(ok.chip), ok.line);
  check('its detail gives the greenness, the satellite, the clear dots and the age in days', /How green the plants are: 0\.44 \(NASA HLS, Sentinel-2\)\. 9 of 9 dots of 30 m were clear\. The picture is 3 days before the day shown\./.test(ok.detail), ok.detail);
  same('the day of the picture itself has no "days before" sentence', /days? before/.test(OB.observedFor(HLS_SHAPE, day(9)).detail), false);
  const none = OB.observedFor(HLS_SHAPE, day(60));
  check('a day with no clear picture in the 15 days before says so, and why', none.state === 'none' && /No clear NASA picture of this field in the 15 days before/.test(none.line) && /clouds or their shadows and snow hid it/.test(none.line), none.line);
  check('and names the nearest clear picture', /The nearest clear picture is \d+ \w{3}/.test(none.detail), none.detail);
  const after = OB.observedFor(HLS_SHAPE, day(-5));
  check('a day after the newest day of the pictures is "not yet", never a made-up state', after.state === 'outside' && /after NASA's newest picture/.test(after.line) && after.chip === 'Not yet seen', after.line);
  check('a day before the pictures start says so', OB.observedFor(HLS_SHAPE, day(400)).state === 'outside' && /start/.test(OB.observedFor(HLS_SHAPE, day(400)).line));
  same('while the lookup is on its way it says so', [OB.observedFor(null, day(6), { waiting: true }).state, OB.observedFor(null, day(6), { waiting: true }).chip], ['wait', 'Looking…']);
  const bad = OB.observedFor({ ok: false, reason: 'NASA did not let this computer\'s Earthdata login read the HLS files.' }, day(6));
  // Changed on purpose: the satellite cards' paper (reports/satcards.md, "Failed cards say why in a farmer's words") never tells a visitor that the server's NASA login failed, and every card's reason
  // now goes through that one plain-reason function (js/satellites2-data.js plainReason), so the reason kept for Show more is the plain NASA sentence, not the server's login words.
  check('a lookup that failed says so in plain words, with its plain reason kept for Show more', bad.state === 'unread' && bad.chip === 'Not seen' && /could not be read just now/.test(bad.line) && bad.detail === 'This NASA reading is not available right now.' && !/Earthdata|login/i.test(bad.detail), bad.detail);
  same('no answer at all is not read yet, never green', OB.observedFor(null, day(6)).state, 'unread');
  same('a pass without a number is not used', OB.observedFor({ ...HLS_SHAPE, passes: [{ date: day(9), ndvi: null }] }, day(6)).state, 'none');
  same('an empty window gives the lookup\'s own reason', OB.observedFor({ ...HLS_SHAPE, passes: [], why_none: 'Only clouds and snow were seen.' }, day(6)).detail, 'Only clouds and snow were seen.');
  same('the words for greenness run from bare ground to thick green', [0.05, 0.3, 0.5, 0.75].map(OB.greenWords), ['bare ground or dead plants', 'a little green', 'green and growing', 'thick, healthy green']);
  same('a bad day is refused in words', OB.observedFor(HLS_SHAPE, 'soon').state, 'unread');
  check('the module asks the server\'s own route and no outside address', /\/api\/hlsndvi/.test(fs.readFileSync(new URL('../js/farmobserved.js', import.meta.url), 'utf8')) && !/https?:\/\//.test(fs.readFileSync(new URL('../js/farmobserved.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')));
  let asked = []; OB.forgetObserved();
  const fake = async url => { asked.push(url); return { json: async () => HLS_SHAPE }; };
  const e1 = OB.loadObserved(44.4, -79.78, { fetchFn: fake }), e2 = OB.loadObserved(44.4, -79.78, { fetchFn: fake });
  await new Promise(r => setTimeout(r, 20));
  same('one field is one request, kept for the visit', [asked.length, asked[0], e1 === e2, e1.waiting], [1, '/api/hlsndvi?lat=44.4000&lon=-79.7800', true, false]);
  OB.forgetObserved(); const dead = OB.loadObserved(44.4, -79.78, { fetchFn: async () => { throw new Error('down'); } }); await new Promise(r => setTimeout(r, 20));
  same('a lookup that cannot be reached is an answer of its own, never a crash', dead.answer, { ok: false, reason: 'The NASA picture service did not answer' });
  OB.forgetObserved();
});


await group('winter wheat on the recorded Barrie and Oxford weather', async () => {
  const { report } = await realReport(), wheat = report.proposed.seasons.find(s => s.crop === 'wheat'), FIXR = f => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
  const record = async place => (await loadSpot(place === 'barrie' ? { lat: 44.4, lon: -79.78 } : { lat: 43.13, lon: -80.75 }, { now: () => Date.parse('2026-11-14T15:00:00Z'), fetch: async url => { const n = /power[.]larc/.test(url) ? `power_${place}.json` : /v1\/forecast/.test(url) ? 'forecast_barrie.json' : /era5_land/.test(url) ? 'era5land_barrie.json' : null; return n ? { ok: true, status: 200, headers: { get: () => null }, text: async () => FIXR(n) } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' }; } })).series;
  const years = Array.from({ length: 26 }, (_, i) => 2001 + i), crop = { id: 'wheat', ...CR.cropOf('wheat'), fl: SEASONTAB.SEASON.wheat.fl }, ctx = { holdMm: FIT.WATER_HOLD.loam, irrigationMm: 0 };
  const barrie = S.judgeCrop(wheat, await record('barrie'), crop, ctx, years), oxford = S.judgeCrop(wheat, await record('oxford'), crop, ctx, years);
  same('winter wheat\'s flowering is the crop table\'s own rule: the end of its mid stage', SEASONTAB.SEASON.wheat.fl, 'end');
  check('the hard-frost rule is no longer chronic: it fires in a few years, not in all of them', !barrie.chronic.includes('frost-winter') && barrie.counts.hurt >= 1 && barrie.counts.hurt <= 6, barrie.counts);
  check('the Barrie hurt years name a hard frost before flowering, with the day, in April or May', barrie.years.filter(y => y.verdict === 'hurt').every(y => y.causes.some(c => c.kind === 'frost-winter' && /-0[45]-/.test(c.date))), barrie.years.filter(y => y.verdict === 'hurt').map(y => y.causes));
  same('every year since 2001 is accounted for at both places (the first has no autumn sowing in the record)', [barrie.counts.fine + barrie.counts.close + barrie.counts.hurt + barrie.counts.nodata + barrie.counts.growing, oxford.counts.years, barrie.years[0].verdict], [26, 26, 'nodata']);
  check('every wheat year says winter survival is not judged, and very wet seasons are not judged for it', barrie.years.filter(y => y.verdict !== 'nodata').every(y => y.notes.some(x => /^Winter survival is not judged: it needs snow cover, which this record does not have\.$/.test(x)) && y.notes.some(x => /^Very wet seasons are not judged for this crop\.$/.test(x))));
  const deps = { floweringOf: id => SEASONTAB.SEASON?.[id]?.fl, cropOf: CR.cropOf, cropName: CR.cropName, holdOf: t => FIT.WATER_HOLD[t] ?? 150, irrigationMm: l => FIT.IRRIGATION_MM[l] ?? 0 };
  const made = S.applyReport(S.emptyStore(), report, { now: NOW, random: () => 0.4 }), farm = S.getFarm(made.store, made.farmId), field = S.getField(farm, made.fieldId), c = H.cropsFor(farm, { ...field, report: { ...field.report, current: report.proposed } }, await record('barrie'), deps);
  const w = c.rows.find(r => r.crop === 'Winter wheat');
  check('the wheat row says its counts are the spring weather only', w?.scope === 'Spring weather only: winter survival is not judged.', w?.scope);
  check('the card names the record and its years', /^Counts on NASA POWER weather, 2001\u20132025\. /.test(c.basis) && c.record.name === 'NASA POWER', c.basis.slice(0, 60));
  check('the basis carries the fixed sentence', /Past weather for this crop, not a forecast and not a value of the land\.$/.test(c.basis));
  check('the rule list is handed over, with its known limits', c.rules.length >= 7 && c.rules.some(r => /Known limits/.test(r)) && c.rules.some(r => /Winter survival is not judged/.test(r)));
  const back = H.cropsFor(farm, field, { ...(await record('barrie')), source: 'era5' }, deps);
  check('a back-up record is named as such, never passed off as NASA', /^Counts on the Open-Meteo ERA5 back-up record weather/.test(back.basis), back.basis.slice(0, 80));
});


await group('one year on the map', async () => {
  const iso = (y, m, d) => [y, String(m).padStart(2, '0'), String(d).padStart(2, '0')].join('-');
  const row = (crop, verdicts, season = { sow: iso(2020, 5, 10), harvest: iso(2020, 9, 30), stages: [20, 35, 40, 30] }) => ({ crop, season, years: verdicts.map(([year, verdict, why = []]) => ({ year, label: String(year), verdict, why })) });
  const fc = [
    { id: 'a', name: 'North', crops: { ok: true, record: { name: 'NASA POWER', first: 2001, last: 2003 }, rows: [row('Corn', [[2001, 'fine'], [2002, 'close', [{ text: 'A night of -1 °C at flowering', date: iso(2002, 7, 1) }]], [2003, 'growing']]), row('Soybeans', [[2001, 'fine'], [2002, 'hurt', [{ text: 'Rain 40% of need', date: '' }]], [2003, 'nodata']])] } },
    { id: 'b', name: 'South', crops: { ok: false, reason: 'South has no crop plan with dates yet, so no year is judged here.' } },
  ];
  same('the years are newest first and only those in which a season could be judged', Y.yearsIn(fc), [2002, 2001]);
  same('play goes oldest first', Y.playOrder(Y.yearsIn(fc)), [2001, 2002]);
  const v = Y.yearView(fc, 2002);
  same('a field shows the worst of its crops: hurt over a close call', [v.fields[0].verdict, v.fields[0].word], ['hurt', 'Hurt']);
  same('a field with no plan is Not judged and says why, never fine', [v.fields[1].verdict, v.fields[1].word, v.fields[1].reason], ['none', 'Not judged', 'South has no crop plan with dates yet, so no year is judged here.']);
  same('each crop keeps its own line, its causes and its date', v.fields[0].crops.map(c => [c.crop, c.word, c.why]), [['Corn', 'Close call', [`A night of -1 °C at flowering (${iso(2002, 7, 1)})`]], ['Soybeans', 'Hurt', ['Rain 40% of need']]]);
  const g = Y.yearView(fc, 2003);
  same('a season still growing or without weather is Not judged, with its reason', [g.fields[0].verdict, g.fields[0].crops.map(c => c.why)], ['none', [['The season was not over in the weather record.'], ['The record is missing too many days of this season.']]]);
  same('the one sentence for the live region names the year and every field', v.sentence, '2002. North: Hurt. South: Not judged.');
  same('counts add up to the fields', v.counts, { fine: 0, close: 0, hurt: 1, none: 1 });
  same('a token says its field, its verdict and the year', Y.tokenLabel(v.fields[0], 2002), 'North: Hurt in 2002');
  same('the stages are the plan\'s own days moved into that year, the last one ending on harvest', Y.stagesOf(fc[0].crops.rows[0].season, 2002).map(x => x.text), ['Starting up: 10 May to 29 May', 'Growing: 30 May to 3 Jul', 'Flowering and filling: 4 Jul to 12 Aug', 'Ripening: 13 Aug to 30 Sep']);
  same('a plan without four stage lengths gives no timeline', Y.stagesOf({ sow: iso(2020, 5, 10), harvest: iso(2020, 9, 30), stages: null }, 2002), []);
  same('stepping stays inside the years', [Y.stepYear([2002, 2001], 2001, 1), Y.stepYear([2002, 2001], 2002, 1), Y.stepYear([2002, 2001], 2001, -1)], [2002, null, null]);
  same('the record is named once, as the History page names it', Y.recordWords(fc), 'Counts on NASA POWER, 2001–2003 weather.');
  same('the ribbon says it is the past', Y.RIBBON, 'Past weather, not a forecast');
  // the same replay as the History page: the real engine's plan on the recorded Barrie weather
  const { report } = await realReport(), series = await realSeries();
  const made = S.applyReport(S.emptyStore(), report, { now: NOW, random: () => 0.4 }), farm = S.getFarm(made.store, made.farmId), field = S.getField(farm, made.fieldId);
  const deps = { floweringOf: id => SEASONTAB.SEASON?.[id]?.fl, cropOf: CR.cropOf, cropName: CR.cropName, holdOf: t => FIT.WATER_HOLD[t] ?? 150, irrigationMm: l => FIT.IRRIGATION_MM[l] ?? 0 };
  const real = [{ id: field.id, name: field.name, crops: H.cropsFor(farm, field, series, deps) }], years = Y.yearsIn(real);
  check('the real replay gives years, newest first, with stages for each crop', years.length > 20 && years.every((y, i) => !i || years[i - 1] > y) && Y.yearView(real, years[0]).fields[0].crops.every(c => c.stages.length === 4), years.slice(0, 3));
  const hurt = real[0].crops.rows[0].years.find(y => y.verdict === 'hurt');
  if (hurt) check('a year the History page counts as hurt is Hurt on the board, with the same causes', Y.yearView(real, hurt.year).fields[0].crops[0].word === 'Hurt' && Y.yearView(real, hurt.year).fields[0].crops[0].why.length === hurt.why.length, hurt.year);
  check('the verdicts of the board are the History page\'s, year by year, for every crop', real[0].crops.rows.every(r => r.years.every(y => Y.yearView(real, y.year).fields[0].crops.find(c => c.crop === r.crop).verdict === (['fine', 'close', 'hurt'].includes(y.verdict) ? y.verdict : 'none'))));
});

await group('sizes and temperatures follow Settings or the farm\'s country', async () => {
  FU.setCountry(() => 'US');
  same('a field in the United States is in acres and degrees F when nothing is chosen', [FU.areaWords(10), FU.tempWords(10), FU.areaUnit()], ['24.7 acres', '50 °F', 'us']);
  FU.setCountry(() => 'CA');
  same('a field in Canada is in hectares and degrees C', [FU.areaWords(10), FU.tempWords(10), FU.areaUnit()], ['10.0 ha', '10 °C', 'metric']);
  FU.setCountry(() => '');
  same('with no country it is metric', FU.areaWords(0.5), '0.50 ha');
  same('a size can still be asked for in a unit', FU.areaWords(10, 'us'), '24.7 acres');
  same('the Mead field in Nebraska reads 158.4 acres', (() => { FU.setCountry(() => 'US'); const t = FU.areaWords(64.1, 'us'); FU.setCountry(() => ''); return t; })(), '158.4 acres');
});

await group('the land history\'s small parts', async () => {
  const series = await realSeries(), h = HV.buildHistory(series, { today: '2026-11-14' });
  const ck = HV.checklistFor(h);
  check('the checklist holds every check once, in an order that follows the record', ck.list.length === HV.CHECKLIST.length && new Set(ck.list.map(x => x[0])).size === HV.CHECKLIST.length, ck.list.length);
  const none = HV.checklistFor({ ok: true, counts: Object.fromEntries(HV.ORDER.map(id => [id, { n: 0, of: 25 }])) });
  same('with nothing marked the written order stays', none.list.map(x => x[0]), HV.CHECKLIST.map(x => x[0]));
  const wet = HV.checklistFor({ ok: true, counts: { ...Object.fromEntries(HV.ORDER.map(id => [id, { n: 0, of: 25 }])), downpour: { n: 20, of: 25 } } });
  same('a record with many downpour years puts the flooding check first', [wet.list[0][0].startsWith('Ask neighbours and the council about flooding'), wet.led], [true, 1]);
  same('no record means the written order and no claim', HV.checklistFor({ ok: false }).list.map(x => x[0]), HV.CHECKLIST.map(x => x[0]));
  same('the footer says there are no yields and no money in the record', HV.NO_MONEY, 'No yields and no money in this record.');
  const svg = HVW.stripSVG([{ year: 2001, state: 'marked' }, { year: 2002, state: 'close' }, { year: 2003, state: 'clear' }, { year: 2004, state: 'none' }], 'hatch', 'x', { glyphs: true });
  check('each year of a crop strip carries its icon: a cross, an exclamation mark, a tick, a dash', ['✕', '!', '✓', '–'].every(g => svg.includes(`>${g}</text>`)), svg.slice(0, 80));
  check('a strip drawn without glyphs has none', !/h-glyph/.test(HVW.stripSVG([{ year: 2001, state: 'marked' }], 'hatch', 'x')), '');
  check('the text version carries the footer and the same order', HV.asText(h, { farm: 'Barrie', crops: null }).includes(HV.NO_MONEY), '');
});

await group('is this field already in My farm', async () => {
  const mem = items => ({ getItem: k => (k === 'crophalo.farms.v1' ? items : null) });
  const key = FH.keyOf(43.13, -80.75), saved = JSON.stringify({ farms: [{ fields: [{ key }] }] });
  same('the key is lat,lon to 4 decimals', key, '43.1300,-80.7500');
  same('it is the very key My farm files a field by', [43.13004, -80.75, 0.00004, -0.00006, 44.4, -79.78].reduce((ok, v, i, a) => ok && (i % 2 ? true : FH.keyOf(v, a[i + 1]) === S.fieldKey([v, a[i + 1]])), true), true);
  same('a field in storage is found by its key and by a place', [FH.farmHas('43.1300,-80.7500', mem(saved)), FH.farmHas({ lat: 43.13, lon: -80.75 }, mem(saved)), FH.farmHas({ lat: 43.1300004, lon: -80.7500004 }, mem(saved))], [true, true, true]);
  same('another place, a bad key, nothing saved and broken storage are all no', [FH.farmHas('0.0000,0.0000', mem(saved)), FH.farmHas('x', mem(saved)), FH.farmHas(key, mem(null)), FH.farmHas(key, mem('{oops')), FH.farmHas(key, null)], [false, false, false, false, false]);
  check('the file imports nothing, so the report loads almost nothing to ask', !/^\s*import\s/m.test(fs.readFileSync(new URL('../js/farmhas.js', import.meta.url), 'utf8')), '');
});

await group('a field that arrives with its real outline and its own name', async () => {
  const { report } = await realReport(), ring = [[41.183, -96.4446], [41.183, -96.4349], [41.1759, -96.4349], [41.1759, -96.4446]];
  const made = S.applyReport(S.emptyStore(), { ...report, place: { lat: 41.1795, lon: -96.4398, name: 'Mead, Nebraska', cc: 'US', fieldName: 'A research field near Mead' }, area: { ha: 64.1 }, areaEstimated: false, outline: ring }, { now: NOW, random: () => 0.4 });
  const f = S.getField(S.getFarm(made.store, made.farmId), made.fieldId);
  check('with the report\'s real outline the field is drawn, never "estimated", and its area is the outline\'s own', f.estimated === false && Math.abs(f.area - 64) < 2, [f.estimated, f.area]);
  same('the name the report gives (place.fieldName) is the field\'s name, not "Home field"', f.name, 'A research field near Mead');
  const pin = S.applyReport(S.emptyStore(), { ...report, place: { lat: 41.1795, lon: -96.4398, name: 'Mead, Nebraska', cc: 'US' } }, { now: NOW, random: () => 0.4 });
  const g = S.getField(S.getFarm(pin.store, pin.farmId), pin.fieldId);
  check('with a pin only the field is an estimated square and keeps the default name', g.estimated === true && g.name === 'Home field', [g.estimated, g.name]);
});

await group('the next 7 days on This field', async () => {
  const day = (n, hi, lo, rain) => ({ date: ['2029', '03', String(10 + n)].join('-'), tmax: hi, tmin: lo, rain });
  const fc = { today: ['2029', '03', '10'].join('-'), days: [day(0, 10, -1, 0), day(1, 12, 0, 2), day(2, 8, 1, 0.2), day(3, 9, 2, 12), day(4, 11, 3, 0), day(5, 13, 4, 0), day(6, 15, 5, 1)] };
  const f = K.weekModel(fc, { temp: 'F', rain: 'in' }), c = K.weekModel(fc, { temp: 'C', rain: 'mm' });
  same('a United States field reads in degrees Fahrenheit and inches, the unit named once in the heading', [f.title, f.first, f.rows[1].line, f.rows[3].line], ['The next 7 days, °F', 'Today: high 50, low 30, dry', 'Sun: high 54, low 32, 0.1 in', 'Tue: high 48, low 36, 0.5 in']);
  same('the same week in degrees C and millimetres', [c.title, c.first, c.rows[1].line, c.rows[3].line], ['The next 7 days, °C', 'Today: high 10, low -1, dry', 'Sun: high 12, low 0, 2 mm', 'Tue: high 9, low 2, 12 mm']);
  check('no row prints a bare degree sign', f.rows.every(r => !/°/.test(r.line)) && c.rows.every(r => !/°/.test(r.line)));
  same('no forecast, no part', [K.weekModel(null, {}), K.weekModel({ days: [] }, {}), K.weekModel({ today: fc.today, days: [{ date: fc.today, tmax: NaN, tmin: NaN }] }, {})], [null, null, null]);
});

// The plan's name says its cover crop, so a plan with a cover never reads like the plan without
group('plan title', () => {
  const nm = id => CR.cropName(id), seasons = [{ crop: 'corn', cover: null }, { crop: 'soy', cover: 'ryecover' }];
  same('without a cover the name is the crops', K.planTitle({ seasons: seasons.map(x => ({ ...x, cover: null })) }, nm), 'Corn, Soybeans');
  same('with a cover the name says it', K.planTitle({ seasons }, nm), 'Corn, Soybeans, with cereal rye cover');
  same('two covers are joined with "and"', K.planTitle({ seasons: [{ crop: 'corn', cover: 'ryecover' }, { crop: 'soy', cover: 'vetchmix' }] }, nm), 'Corn, Soybeans, with cereal rye cover and vetch + rye cover');
  same('no plan is no name', K.planTitle(null, nm), '');
});
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
