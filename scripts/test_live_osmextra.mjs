// The offline suite for scripts/live/osmextra.py (fences, walls, gates, power lines, poles, tanks, silos): answers recorded from the live service on 2026-11-15 (Mead, Nebraska and Beltsville, Maryland), hand-made ones for
// every kind and every refusal, and the failures a real service shows. It never reaches the internet. RULE: never loosen a check here without a written farming reason. Run: node scripts/test_live_osmextra.mjs
import fs from 'node:fs';
import path from 'node:path';
import { check, same, group, finish, runLookup, addAnswer, tempFolder, netKey, FIXTURES } from './live_testlib.mjs';

const MAIN = 'https://overpass-api.de/api/interpreter', BACKUP = 'https://overpass.kumi.systems/api/interpreter', PRIVATE = 'https://overpass.private.coffee/api/interpreter';
const RECORDED_ERA = `overpass-api.de|${MAIN};overpass.kumi.systems|${BACKUP}`;   // the recordings were made from the main server (once, for these fixtures); the lookup's own servers are checked below
const NOW = '2026-11-15T12:00:00Z';
const DOWN = 'OpenStreetMap could not be read right now (its map service did not answer); try again in a few minutes';
const BUSY = 'OpenStreetMap could not be read right now (its map service is busy); try again in a few minutes';
const HEAVY = 'OpenStreetMap could not be read right now (its map service did not finish this box in time); try again in a few minutes';
const MEAD = ['41.179469', '-96.439756', '1400', '1400'], BELT = ['39.031031', '-76.844119', '1400', '1400'];
const folders = [];
const newFolder = () => { const d = path.join(tempFolder(`osmextra-${folders.length}`), 'answers'); folders.push(d); return d; };

// The one question, built here a second time from the contract's words (the recorded answers are filed under a name made from it).
const m = lat => [111132.92 - 559.82 * Math.cos(2 * lat * Math.PI / 180) + 1.175 * Math.cos(4 * lat * Math.PI / 180) - 0.0023 * Math.cos(6 * lat * Math.PI / 180), 111412.84 * Math.cos(lat * Math.PI / 180) - 93.5 * Math.cos(3 * lat * Math.PI / 180) + 0.118 * Math.cos(5 * lat * Math.PI / 180)];
function question(lat, lon, w, d) {
  const [mLat, mLon] = m(lat), box = [lat - d / 2 / mLat, lon - w / 2 / mLon, lat + d / 2 / mLat, lon + w / 2 / mLon], b = `(${box.map(v => v.toFixed(6)).join(',')})`;
  const parts = [`way["barrier"~"^(fence|wall|retaining_wall)$"]${b}`, `node["barrier"~"^(gate|lift_gate|cattle_grid)$"]${b}`, `way["power"~"^(line|minor_line)$"]${b}`, `node["power"~"^(pole|tower)$"]${b}`,
    `node["man_made"~"^(silo|storage_tank|water_tower|windmill|water_well|tower)$"]${b}`, `way["man_made"~"^(silo|storage_tank|water_tower)$"]${b}`];
  return `[out:json][timeout:40];(${parts.join(';')};);out geom tags 12000;`;
}
const bodyOf = (...box) => 'data=' + encodeURIComponent(question(...box.map(Number))).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const run = (replay, args = MEAD, options = {}) => runLookup('osmextra', args, { replay, now: NOW, ...options, env: { FW_OVERPASS: RECORDED_ERA, ...(options.env || {}) } });
const runDefault = (replay, args = MEAD, options = {}) => runLookup('osmextra', args, { replay, now: NOW, ...options });
const handMade = (elements, change = {}) => ({ version: 0.6, generator: 'HAND-MADE TEST ANSWER, not from Overpass', osm3s: { timestamp_osm_base: '2026-11-15T05:00:00Z', copyright: 'hand-made test input' }, elements, ...change });
const put = (dir, url, what, box = MEAD) => addAnswer(dir, { method: 'POST', url, request: { body: bodyOf(...box) }, ...(what.replies ? { replies: what.replies, body: what.body } : { body: what, headers: { 'content-type': 'application/json' } }) });
const status = code => ({ replies: [{ status: code }] }), broken = why => ({ replies: [{ fail: why }] });
const way = (id, tags, pts) => ({ type: 'way', id, geometry: pts.map(([lat, lon]) => ({ lat, lon })), tags });
const node = (id, tags, lat, lon) => ({ type: 'node', id, lat, lon, tags });
const only = (o, ...keys) => Object.fromEntries(keys.map(k => [k, o?.[k]]));
const recorded = name => JSON.parse(fs.readFileSync(path.join(FIXTURES, '..', 'land', `${name}.json`), 'utf8'));

await group('osmextra: recorded live', async () => {
  for (const [name, args, want] of [['mead', MEAD, { fences: 1, gates: 0, power: 0, poles: 0, things: 0 }], ['beltsville', BELT, { fences: 2, gates: 7, power: 3, poles: 9, things: 0 }]]) {
    const r = await run(`osmextra-${name}`, args), live = recorded(`osmextra-${name}`);
    check(`${name}: it answers ok, offline, with one request to the first server`, r.answer?.ok === true && r.asked === 1 && r.misses.length === 0, [r.answer?.reason, r.asked, r.misses]);
    same(`${name}: the counts are the live service's`, r.answer?.counts, want);
    same(`${name}: replayed it gives the shapes the live service gave`, only(r.answer, 'fences', 'gates', 'power', 'poles', 'things', 'data_date', 'credit', 'licence', 'box'), only(live, 'fences', 'gates', 'power', 'poles', 'things', 'data_date', 'credit', 'licence', 'box'));
    same(`${name}: the question that was asked is the contract's, letter for letter`, answersOf(`osmextra-${name}`), [netKey('POST', MAIN, bodyOf(...args))]);
  }
  const b = recorded('osmextra-beltsville');
  check('Beltsville: a gate, a pole and a power line have a place, a kind and nothing invented', b.gates.every(g => g.p.length === 2 && g.k === 'gate') && b.poles.every(p => p.p.length === 2 && ['pole', 'tower'].includes(p.k)) && b.power.every(l => l.p.length >= 2 && ['line', 'minor'].includes(l.k)), [b.gates[0], b.poles[0], b.power[0]]);
  const md = recorded('osmextra-mead');
  check('Mead: nothing is mapped for the rest, and the answer says so by empty lists, not by a made-up shape', md.gates.length === 0 && md.power.length === 0 && md.poles.length === 0 && md.things.length === 0 && md.ok === true, md.counts);
});
function answersOf(name) { return fs.readdirSync(path.join(FIXTURES, name)).filter(f => f.endsWith('.json') && f !== 'recording.json').map(f => f.replace(/\.json$/, '')); }

await group('osmextra: the rules, on a hand-made answer for every kind', async () => {
  const square = (lat, lon, d) => [[lat, lon], [lat, lon + d], [lat + d, lon + d], [lat + d, lon], [lat, lon]];
  const els = [
    way(1, { barrier: 'fence' }, [[41.1790, -96.4400], [41.1795, -96.4400]]), way(2, { barrier: 'wall', height: '2.4' }, [[41.1790, -96.4395], [41.1795, -96.4395]]), way(3, { barrier: 'retaining_wall' }, [[41.1790, -96.4390], [41.1795, -96.4390]]),
    way(4, { barrier: 'fence', height: 'tall' }, [[41.1791, -96.4385], [41.1796, -96.4385]]),   // a height that is not plain metres is not passed on
    node(10, { barrier: 'gate' }, 41.1792, -96.4401), node(11, { barrier: 'lift_gate' }, 41.1793, -96.4401), node(12, { barrier: 'cattle_grid' }, 41.1794, -96.4401),
    way(20, { power: 'line' }, [[41.1780, -96.4410], [41.1800, -96.4380]]), way(21, { power: 'minor_line' }, [[41.1781, -96.4410], [41.1801, -96.4380]]),
    node(30, { power: 'pole' }, 41.1785, -96.4400), node(31, { power: 'tower' }, 41.1786, -96.4400),
    node(40, { man_made: 'silo' }, 41.1788, -96.4402), node(41, { man_made: 'water_well' }, 41.1789, -96.4402), node(42, { man_made: 'windmill' }, 41.1790, -96.4402),
    way(50, { man_made: 'storage_tank' }, square(41.1781, -96.4390, 0.00005)), way(51, { man_made: 'silo' }, [[41.1782, -96.4390], [41.1782, -96.4389], [41.1783, -96.4389]]),   // an open outline is not a round shape
    way(60, { barrier: 'hedge' }, [[41.1790, -96.4380], [41.1791, -96.4380]]), way(61, { building: 'yes' }, square(41.1790, -96.4390, 0.0001)), node(62, { barrier: 'bollard' }, 41.1790, -96.4390),   // not this lookup's kinds
    { type: 'node', id: 70, lat: 'x', lon: 5, tags: { barrier: 'gate' } },   // a place that is not a number is left out
  ];
  const a = newFolder(); put(a, MAIN, handMade(els));
  const r = await run(a);
  same('every kind is sorted into its list', r.answer?.counts, { fences: 4, gates: 3, power: 2, poles: 2, things: 4 });
  same('a fence and a wall keep their kind, and a mapped height only when it is plain metres', r.answer?.fences.map(f => [f.k, f.h ?? null]), [['fence', null], ['wall', 2.4], ['wall', null], ['fence', null]]);
  same('gates and a cattle grid', r.answer?.gates.map(g => g.k), ['gate', 'gate', 'grid']);
  same('lines and poles', [r.answer?.power.map(l => l.k), r.answer?.poles.map(p => p.k)], [['line', 'minor'], ['pole', 'tower']]);
  same('a silo, a well and a windmill are points; a closed tank has its middle and a radius from its own corners; an open outline is not drawn', r.answer?.things.map(t => [t.k, Array.isArray(t.p) && t.p.length === 2, t.r ?? null]), [['silo', true, null], ['well', true, null], ['windmill', true, null], ['tank', true, 3.5]]);
  check('a place that is not a number is counted as a shape that could not be read, and not drawn', r.answer?.left_out === 1 && /could not be read/.test(r.answer?.note || ''), [r.answer?.left_out, r.answer?.note]);
  check('the credit and the licence travel with the answer', r.answer?.credit === '(c) OpenStreetMap contributors' && r.answer?.licence === 'ODbL 1.0' && r.answer?.server === 'overpass-api.de', only(r.answer, 'credit', 'licence', 'server'));
  const empty = newFolder(); put(empty, MAIN, handMade([]));
  const e = await run(empty);
  same('the first server answers whole with nothing in the box: "nothing is mapped" is a true answer', [e.answer?.ok, e.answer?.counts], [true, { fences: 0, gates: 0, power: 0, poles: 0, things: 0 }]);
  const many = newFolder(); put(many, MAIN, handMade(Array.from({ length: 1600 }, (_, i) => way(1000 + i, { barrier: 'fence' }, [[41.1790 + i * 1e-6, -96.4400], [41.1790 + i * 1e-6, -96.4399]]))));
  const c = await run(many);
  check('over the cap: the 1,500 nearest the middle are given and the answer says how many were mapped', c.answer?.counts.fences === 1500 && c.answer?.cut.fences === 1600 && /1,500 nearest the middle are given, of 1,600 mapped/.test(c.answer?.note || ''), [c.answer?.counts, c.answer?.cut, c.answer?.note]);
});

await group('osmextra: the servers it asks, and the failures', async () => {
  const good = handMade([way(1, { barrier: 'fence' }, [[41.1790, -96.4400], [41.1795, -96.4400]])]);
  const a = newFolder(); put(a, PRIVATE, good);
  const r1 = await runDefault(a);
  same('by default the first server asked is overpass.private.coffee, once', [r1.answer?.ok, r1.answer?.server, r1.asked, r1.misses], [true, 'overpass.private.coffee', 1, []]);
  const c = newFolder(); put(c, PRIVATE, broken('connection reset')); put(c, BACKUP, good);
  const r3 = await runDefault(c);
  same('the first dead: the back-up answers and says which server gave it', [r3.answer?.ok, r3.answer?.server, r3.asked], [true, 'overpass.kumi.systems', 2]);
  const m2 = newFolder(); put(m2, MAIN, good); put(m2, PRIVATE, broken('connection reset')); put(m2, BACKUP, broken('connection reset'));
  const r2 = await runDefault(m2);
  same('both dead, the main server able to answer: it is never asked; the words say plainly that the map service did not answer', [r2.answer, r2.asked, r2.misses], [{ ok: false, reason: DOWN }, 2, []]);
  const b = newFolder(); put(b, PRIVATE, status(503)); put(b, BACKUP, status(502));
  same('both at capacity: one try each, no loop, and the words say busy', (await runDefault(b)).answer, { ok: false, reason: BUSY });
  const h = newFolder(); const half = { ...good, remark: 'runtime error: Query timed out' }; put(h, PRIVATE, half); put(h, BACKUP, half);
  same('a service that gives up half-way is not taken for the whole box', (await runDefault(h)).answer, { ok: false, reason: HEAVY });
  const elsewhere = newFolder(); put(elsewhere, PRIVATE, handMade([way(9, { barrier: 'fence' }, [[48.14, 11.58], [48.141, 11.58]])])); put(elsewhere, BACKUP, broken('connection reset'));
  same('an answer about another place (Munich) is not an answer', (await runDefault(elsewhere)).answer, { ok: false, reason: DOWN });
  const backupEmpty = newFolder(); put(backupEmpty, PRIVATE, broken('connection reset')); put(backupEmpty, BACKUP, handMade([]));
  same('an empty answer from the back-up alone is never taken for "nothing is mapped"', (await runDefault(backupEmpty)).answer, { ok: false, reason: DOWN });
  const own = await runDefault(a, MEAD, { env: { FW_OVERPASS: `own.example|${PRIVATE}` } });
  same('FW_OVERPASS replaces the servers (a server of our own later)', [own.answer?.server, own.asked], ['own.example', 1]);
});

await group('osmextra: the arguments', async () => {
  const empty = newFolder(); fs.mkdirSync(empty, { recursive: true });
  for (const [what, args, words] of [['no arguments', [], /latitude|lat/i], ['a box under 20 m', ['41.18', '-96.44', '10', '800'], /20 m to 3.6 km/], ['a box over 3.6 km', ['41.18', '-96.44', '800', '4000'], /20 m to 3.6 km/], ['north of 84', ['85', '0', '800', '800'], /84|lat/i], ['words for numbers', ['a', 'b', '800', '800'], /lat|number/i]]) {
    const r = await run(empty, args);
    check(`${what}: refused in a sentence, no request sent`, r.answer?.ok === false && words.test(r.answer?.reason || '') && r.asked === 0, [r.answer, r.asked]);
  }
  const text = fs.readFileSync(new URL('./live/osmextra.py', import.meta.url), 'utf8'), block = /osm\.servers\(\)/.test(text);
  check('osmextra.py asks the servers osm.py names, and carries no server address of its own', block && !/https?:\/\/overpass/.test(text.replace(/#.*$/gm, '')));
});
finish();
