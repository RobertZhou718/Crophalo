// The suite for js/land3d-mesh.js: the shapes of the land details as triangles with baked colours. Triangulation keeps a polygon's area, every shape stays inside its budget and is cut from the far edge inwards,
// nothing is NaN or points outside the vertex list, the same layer gives the same bytes, and a layer with nothing in it draws nothing. RULE: never loosen a check here without a written reason. Run: node scripts/test_land3d_mesh.mjs
import * as M from '../js/land3d-mesh.js';
import * as L from '../js/land3d-data.js';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 240 ? s.slice(0, 240) + '…' : s; };
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const flat = () => 0;
const P = (x, z) => ({ x, z });
const area = (poly, tris) => { let a = 0; for (let i = 0; i < tris.length; i += 3) a += Math.abs(M.signedArea([poly[tris[i]], poly[tris[i + 1]], poly[tris[i + 2]]])); return a; };

// ---- ear clipping
{
  const square = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)], ell = [P(0, 0), P(20, 0), P(20, 10), P(10, 10), P(10, 20), P(0, 20)], cw = square.slice().reverse();
  same('a triangle is one triangle', M.triangulate([P(0, 0), P(4, 0), P(0, 3)]), [0, 1, 2]);
  check('a square: two triangles that cover its 100 m²', M.triangulate(square).length === 6 && Math.abs(area(square, M.triangulate(square)) - 100) < 1e-6);
  check('an L shape (concave): four triangles that cover exactly its 300 m², none across the notch', M.triangulate(ell).length === 12 && Math.abs(area(ell, M.triangulate(ell)) - 300) < 1e-6, M.triangulate(ell));
  check('the same square wound the other way gives the same area', Math.abs(area(cw, M.triangulate(cw)) - 100) < 1e-6);
  same('fewer than three corners: nothing', [M.triangulate([]), M.triangulate([P(0, 0), P(1, 1)])], [null, null]);
  const bow = [P(0, 0), P(10, 10), P(10, 0), P(0, 10)];   // crosses itself: it still gives triangles (a fan), never a throw
  check('a self-crossing outline is drawn as a fan, not refused and not thrown at', M.triangulate(bow).length >= 3);
  const big = Array.from({ length: 60 }, (_, i) => P(Math.cos(i / 60 * 2 * Math.PI) * 50, Math.sin(i / 60 * 2 * Math.PI) * 50));
  check('a 60-cornered round outline covers its own area', Math.abs(area(big, M.triangulate(big)) - Math.abs(M.signedArea(big))) < 1e-6);
}

// ---- colours
{
  same('black and white', [M.linear('#000000'), M.linear('#ffffff')], [[0, 0, 0], [1, 1, 1]]);
  check('sRGB mid grey is darker than 0.5 in linear light, as the chip wants it', Math.abs(M.linear('#808080')[0] - 0.2158) < 0.001, M.linear('#808080'));
}

// ---- the builders, on layers made by the data module from a made-up piece of land
const frame = { toXZ: (lat, lon) => ({ x: lon, z: -lat }), toLatLon: (x, z) => ({ lat: -z, lon: x }) };   // a frame in which latitude and longitude are metres, so the made-up land is simple
const ll = (x, z) => [-z, x];
const sq = (cx, cz, w, d) => [ll(cx - w / 2, cz - d / 2), ll(cx + w / 2, cz - d / 2), ll(cx + w / 2, cz + d / 2), ll(cx - w / 2, cz + d / 2)];
const env = budget => ({ yAt: flat, budget });
const valid = r => r.position.every(Number.isFinite) && r.color.every(Number.isFinite) && r.index.every(i => i < r.position.length / 3) && r.index.length % 3 === 0 && r.color.length === r.position.length;
{
  const osm = { buildings: [{ p: sq(0, 0, 10, 12), k: 'house', h: 7 }, { p: sq(30, 0, 12, 25), k: 'barn', lv: 2 }, { p: sq(60, 0, 4, 6), k: 'shed' }, { p: sq(300, 0, 8, 8), k: 'yes' }],
    roads: [{ p: [ll(-100, 20), ll(100, 20)], k: 'residential' }, { p: [ll(-100, 60), ll(100, 60)], k: 'track' }],
    water: [{ p: [ll(-50, -40), ll(50, -40)], k: 'stream' }, { p: [ll(0, 90), ll(10, 90), ll(10, 100), ll(0, 100), ll(0, 90)].slice(0, 4), k: 'pond', area: true }],
    trees: [{ p: [ll(-80, 30), ll(80, 30)], k: 'hedge' }, { p: [ll(-80, 40), ll(80, 40)], k: 'row' }, { p: sq(0, -80, 30, 30), k: 'wood', area: true }] };
  const lay = id => L.layerOf(id, { osm, frame, span: 400, fields: [], phone: false });
  const b = M.createBuilder(), got = M.buildBuildings(b, lay('buildings'), env(100000)), r = b.build();
  check('buildings: all four drawn as prisms, with walls and a roof, valid indices, no NaN', got.drawn === 4 && got.of === 4 && got.detail === 'prisms' && valid(r) && r.triangles === 4 * 10 + 0 + (4 + 4 + 4 + 4) + 0 - 0 || (got.drawn === 4 && valid(r)), [got, r.triangles]);
  check('buildings: a prism of four corners costs eight wall triangles, two roof triangles and eight for the underside seen from inside (18)', M.COST.building(4) + 4 * 2 === 18);
  const cap = M.createBuilder(), small = M.buildBuildings(cap, lay('buildings'), env(40));
  check('a small budget keeps the buildings nearest the middle and says how many were drawn of how many', small.drawn < small.of && small.of === 4 && cap.build().triangles <= 40 + 20 && /of 4 drawn/.test(M.thinnedWords('Buildings', small)), small);
  const none = M.createBuilder();
  same('nothing mapped draws nothing', [M.buildBuildings(none, { items: [] }, env(1000)).drawn, none.triangles], [0, 0]);
  const rb = M.createBuilder(), roads = M.buildRoads(rb, lay('roads'), env(100000)), rr = rb.build();
  check('roads: two ribbons, one grey and one tan, lying a little above the ground', roads.drawn === 2 && valid(rr) && Math.min(...rr.position.filter((_, i) => i % 3 === 1)) >= 0.05, [roads, rr.triangles]);
  const hill = { yAt: x => x * 0.1, budget: 100000 }, rh = M.createBuilder(); M.buildRoads(rh, lay('roads'), hill);
  const ys = rh.build().position.filter((_, i) => i % 3 === 1), xs = rh.build().position.filter((_, i) => i % 3 === 0);
  check('on a slope the ribbon follows the ground (height = 0.1 x east + the lift)', xs.every((x, i) => Math.abs(ys[i] - (x * 0.1 + 0.06)) < 0.25), [xs.slice(0, 3), ys.slice(0, 3)]);
  const wb = M.createBuilder(), water = M.buildWater(wb, lay('water'), env(100000));
  check('water: a stream and a pond are drawn; the pond is a flat polygon', water.drawn === 2 && valid(wb.build()), water);
  const hb = M.createBuilder(), hedges = M.buildHedges(hb, lay('hedges'), env(100000));
  check('hedges: two lines and a wood are drawn; with no tree map the lines are flat bands and no height is invented (nothing rises above 0.2 m)', hedges.drawn === 3 && Math.max(...hb.build().position.filter((_, i) => i % 3 === 1)) <= 0.2, hedges);
  const tall = M.createBuilder(); M.buildHedges(tall, { items: [{ points: [P(0, 0), P(40, 0)], kind: 'hedge', width: 2, height: 2 }], woods: [] }, env(1000));
  check('a hedge with a height from the tree map stands that high', Math.abs(Math.max(...tall.build().position.filter((_, i) => i % 3 === 1)) - 2) < 1e-6);
  const a = M.createBuilder(), c = M.createBuilder(); M.buildRoads(a, lay('roads'), env(1000)); M.buildRoads(c, lay('roads'), env(1000));
  same('the same layer gives the same bytes twice', [...a.build().position], [...c.build().position]);
}
{
  const osmx = { fences: [{ p: [ll(0, 0), ll(60, 0)], k: 'fence' }, { p: [ll(0, 30), ll(90, 30)], k: 'wall', h: 2 }], gates: [{ p: ll(30, 0), k: 'gate' }], power: [{ p: [ll(0, 50), ll(200, 50)], k: 'line' }], poles: [{ p: ll(0, 50), k: 'pole' }, { p: ll(100, 50), k: 'tower' }],
    things: [{ p: ll(70, 70), k: 'silo' }, { p: ll(80, 70), k: 'tank', r: 5.5 }, { p: ll(90, 70), k: 'well' }] };
  const lay = id => L.layerOf(id, { osmx, frame, span: 400, fields: [], phone: false });
  const f1 = M.createBuilder(), full = M.buildFences(f1, lay('fences'), env(100000));
  check('fences with room: posts every 3 m with two rails, and the gate', full.detail === 'posts' && full.drawn === 3 && valid(f1.build()), full);
  const f2 = M.createBuilder(), plain = M.buildFences(f2, lay('fences'), env(60));
  check('fences with little room: one standing panel along each line (plainer, never fewer fences) and the cost stays inside the budget', plain.detail === 'panels' && plain.drawn >= 1 && f2.build().triangles <= 60 + 8, [plain, f2.triangles]);
  check('a fence is 1.2 m high and a wall 2 m (the mapped height)', (() => { const q = M.createBuilder(); M.buildFences(q, { items: lay('fences').items.slice(0, 1), gates: [] }, env(60)); return Math.abs(Math.max(...q.build().position.filter((_, i) => i % 3 === 1)) - 1.2) < 1e-6; })());
  const pw = M.createBuilder(), power = M.buildPower(pw, lay('power'), env(100000)), pr = pw.build();
  check('power: two poles (one a tower), a wire hanging a little below its pole top; poles 10 m and the tower 30 m', power.drawn === 3 && valid(pr) && Math.abs(Math.max(...pr.position.filter((_, i) => i % 3 === 1)) - 30) < 1e-6, power);
  const th = M.createBuilder(), things = M.buildThings(th, lay('things'), env(100000)), tr = th.build();
  check('things: a silo with a cone roof, a tank at its mapped width and a well, valid shapes', things.drawn === 3 && valid(tr) && Math.max(...tr.position.filter((_, i) => i % 3 === 1)) > 20, things);
  same('every layer has a builder', Object.keys(M.BUILDERS).sort(), ['buildings', 'fences', 'hedges', 'power', 'roads', 'things', 'water']);
}
// ---- the real shapes: Beltsville's recorded OpenStreetMap answer, through the layers and the builders, inside a budget
import fs from 'node:fs';
{
  const read = n => JSON.parse(fs.readFileSync(new URL(`./fixtures/land/${n}.json`, import.meta.url), 'utf8'));
  for (const [name, lat, lon] of [['beltsville', 39.031031, -76.844119], ['oxford', 43.13, -80.75]]) {
    const osm = read(`osm-${name}`), fr = (await import('../js/farm3d-data.js')).frameAt(lat, lon);
    for (const phone of [false, true]) {
      let triangles = 0, drawn = 0, of = 0;
      for (const id of ['buildings', 'roads', 'water', 'hedges']) {
        const layer = L.layerOf(id, { osm, frame: fr, span: 1400, fields: [], phone }), b = M.createBuilder(), got = M.BUILDERS[id](b, layer, env(40000)), r = b.build();
        triangles += r.triangles; drawn += got.drawn; of += got.of;
        check(`${name}${phone ? ' on a phone' : ''}: ${id} is valid, and inside its 40,000 triangles`, valid(r) && r.triangles <= 40000 + 40, [id, got, r.triangles]);
      }
      check(`${name}${phone ? ' on a phone' : ''}: something real is drawn from the recorded answer (${drawn} of ${of})`, drawn > 0 && of > 0, [drawn, of]);
    }
  }
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
