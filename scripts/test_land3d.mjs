// The land details and slope view suite: js/land3d-data.js (the ten "On the land" switches) and js/slope3d-data.js, on made-up land whose answer is known by geometry.
// Every switch says plainly that it could not read when its source did not answer, and draws nothing then. No internet is needed.
// RULE: never loosen a check here without a written farming reason beside it. A farmer reads a slope, a wet spot or a boundary line off this picture.
// Run: node scripts/test_land3d.mjs
import * as L from '../js/land3d-data.js';
import * as S from '../js/slope3d-data.js';
import { heightModel, frameAt } from '../js/farm3d-data.js';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, tol) => check(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);

// a made-up piece of land: n × n heights over a square of `size` metres, height from a function of (x east, z south)
const land = (n, size, f) => { const h = new Float32Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = f(-size / 2 + i * size / (n - 1), -size / 2 + j * size / (n - 1)); return heightModel({ nx: n, ny: n, width: size, depth: size, h }); };
const box = (x0, z0, x1, z1) => [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
const pin = { lat: 44.4, lon: -79.78 }, frame = frameAt(pin.lat, pin.lon);
const ll = (x, z) => { const p = frame.toLatLon(x, z); return [p.lat, p.lon]; };
const hash = (...n) => { let h = 2166136261; for (const v of n) { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; } return ((h >>> 0) % 100000) / 100000; };

// ---- the switches: the note's ten, and three more from OpenStreetMap's second question (fences and gates, power lines and poles, silos and tanks)
same('fourteen switches in this order (the shade is worded by js/shade3d.js)', L.SWITCHES.map(s => s.id), ['scale', 'edges', 'contours', 'soil', 'cover', 'buildings', 'roads', 'water', 'hedges', 'shade', 'fences', 'power', 'things', 'wet']);
same('their labels', L.SWITCHES.map(s => s.name), ['Scale, high, low', 'Edge lengths', 'Contour lines', 'Soil colour', 'Land cover', 'Buildings', 'Roads, tracks', 'Water paths', 'Hedges, woods', 'Shade', 'Fences, gates', 'Power lines, poles', 'Silos, tanks, towers', 'Wet spots']);
same('only "Scale, high, low" is on at first', L.cleanChoice(undefined), { scale: true });
same('a saved choice is cleaned: unknown ids and non-true values dropped', L.cleanChoice({ edges: true, contours: 1, nope: true, __proto__: { wet: true }, soil: 'yes', wet: true }), { edges: true, wet: true });
same('rubbish gives the default', [L.cleanChoice('x'), L.cleanChoice([true]), L.cleanChoice(null)], [{ scale: true }, { scale: true }, { scale: true }]);
check('the storage key carries the product prefix only', L.STORAGE_KEY === 'crophalo.farm3d.land');
same('a switch that is off costs nothing: the first view needs only the heights', L.sourcesNeeded({ scale: true }), ['heights']);
same('nothing on needs nothing', L.sourcesNeeded({}), []);
same('every switch on needs the heights, the soil map, the land cover, OpenStreetMap (both questions) and the tree map, once each', L.sourcesNeeded(Object.fromEntries(L.SWITCHES.map(s => [s.id, true]))), ['cover', 'heights', 'osm', 'osmx', 'soil', 'trees']);
same('fences, power lines and silos on need only the second OpenStreetMap question', L.sourcesNeeded({ fences: true, power: true, things: true }), ['osmx']);
same('buildings and roads on need only OpenStreetMap', L.sourcesNeeded({ buildings: true, roads: true }), ['osm']);
same('toggle words', [L.toggleWords('edges', true), L.toggleWords('edges', false), L.toggleWords('nope', true)], ['Edge lengths on. The length of each side of the chosen field and the height at its corners.', 'Edge lengths off.', '']);
same('unknown, inherited switches are not switches', [L.switchOf('toString'), L.switchOf('__proto__')], [null, null]);

// ---- 1. scale, high, low
same('the scale bar is a round length about 18% of the span', [L.scaleBar(1000), L.scaleBar(516), L.scaleBar(20000), L.scaleBar(60)].map(b => [b.metres, b.label]), [[100, '100 m'], [50, '50 m'], [2000, '2 km'], [10, '10 m']]);
same('and in feet', [L.scaleBar(516, 'ft').label, L.scaleBar(1000, 'ft').label], ['200 ft', '500 ft']);
{
  const model = land(41, 400, (x, z) => 300 + 0.05 * x);   // rises to the east: 290 m at the west edge, 310 m at the east edge
  const north = { id: 'n', name: 'North field', polygon: box(-100, -150, 100, -50) }, tiny = { id: 't', name: 'Tiny field', polygon: box(0, 0, 12, 12) };
  const r = L.scaleLayer({ heights: model, span: 400, fields: [north, tiny] });
  check('the highest point of a field is on its east side, the lowest on its west', r.items[0].high.x >= 80 && r.items[0].low.x <= -80 && r.items[0].high.h > r.items[0].low.h, r.items[0]);
  near('and their heights are the map\'s own, in metres above sea level', r.items[0].high.h, 305, 0.6);
  check('words: "High … m, Low … m" for each field', /^North field: High 30\d\.\d m, Low 29\d\.\d m\.$/.test(r.words[0]), r.words[0]);
  check('a field with too few height cells says so, with the count, and names nothing', /^Tiny field is too small to name its highest and lowest point \(\d+ height cells\)\.$/.test(r.words[1]) && r.items.length === 1, r.words);
  same('waiting: "Reading the land\'s heights…"', L.scaleLayer({ heights: undefined, span: 400 }).words, ["Reading the land's heights…"]);
  const flat = L.scaleLayer({ heights: heightModel({ nx: 3, ny: 3, width: 10, depth: 10, h: new Float32Array(9).fill(NaN) }), span: 400, fields: [north] });
  same('heights not read: the plain sentence, and the bar still shows', [flat.state, flat.words, flat.bar.label], ['cannot', ['Heights not read, so this cannot be worked out.'], '50 m']);
}

// ---- 2. edge lengths
{
  const field = { id: 'a', name: 'North field', polygon: [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 60 }, { x: 4, z: 60 }, { x: 0, z: 56 }] };
  const model = land(41, 400, (x, z) => 300 + 0.05 * x);
  const r = L.edgeLabels(field.polygon, model);
  same('a side under 8 m (the cut corner is 5.7 m) gets no label; the others are labelled with their lengths', r.sides.map(s => Math.round(s.length)), [100, 60, 96, 56]);
  same('each label sits at the middle of its side', [r.sides[0].mid.x, r.sides[0].mid.z], [50, 0]);
  check('each labelled corner has the map\'s height', r.corners.length === 5 && r.corners.every(c => Number.isFinite(c.h)) && Math.abs(r.corners.find(c => c.x === 100 && c.z === 0).h - 305) < 0.3, r.corners);
  const many = Array.from({ length: 30 }, (_, i) => ({ x: 100 * Math.cos(i / 30 * 2 * Math.PI), z: 100 * Math.sin(i / 30 * 2 * Math.PI) }));
  check('at most 12 labels, the longest', L.edgeLabels(many, null).sides.length === 12 || L.edgeLabels(many, null).sides.length < 12);
  same('with no outline: the plain sentence', L.edgesLayer({ chosen: null, heights: model }).words, ['Edge lengths: there is no field outline to write on.']);
  const e = L.edgesLayer({ chosen: field, heights: model });
  check('the edge note says lengths are flat and heights are the map\'s', e.words.includes("Lengths are along the ground's plan (flat), from the outline you drew. Heights are the height map's, at each corner."));
  check('with no heights the corners carry none and it says so', (x => x.items.corners.every(c => c.h === null) && x.words.includes('Heights not read, so this cannot be worked out.'))(L.edgesLayer({ chosen: field, heights: heightModel({ nx: 3, ny: 3, width: 9, depth: 9, h: new Float32Array(9).fill(NaN) }) })));
}

// ---- 3. contour lines
{
  same('contour step by the map\'s cell: 1 m under 2 m, 2 m under 8, 5 m under 60, else 10', [1, 1.99, 2, 7.9, 8, 59, 60, 90].map(L.contourStep), [1, 1, 2, 2, 5, 5, 10, 10]);
  const plane = land(81, 400, (x, z) => 300 + 0.02 * x);   // 8 m of rise over 400 m; cell 5 m → step 2 m
  const r = L.contoursLayer({ heights: plane });
  same('a plane of 8 m rise at 5 m cells: lines every 2 m, 3 or 5 levels', [r.step, r.items.length >= 3 && r.items.length <= 5], [2, true]);
  check('every level is a multiple of the step', r.items.every(i => Math.abs(i.level / 2 - Math.round(i.level / 2)) < 1e-9));
  const seg = r.items[1].segments;
  check('on a plane rising east, each line is straight along north-south: every end has the same x, and the height there is the level', seg.length > 40 && seg.every(s => Math.abs(s[0] - s[2]) < 1e-3 && Math.abs((300 + 0.02 * s[0]) - r.items[1].level) < 0.01), [seg[0], r.items[1].level]);
  same('the words', r.words, ['Contour lines every 2 m of height.', 'Small bumps, banks and ditches are not in the height map.']);
  const gentle = L.contoursLayer({ heights: land(41, 400, (x, z) => 300 + 0.005 * x) });
  same('land that rises under 5 m draws no line and says so', [gentle.items, gentle.words[0]], [[], 'The land here rises less than 5 m, so no contour line is drawn.']);
  const mountain = L.contourLevels(land(41, 4000, (x, z) => 300 + 0.5 * x));
  check('never more than 40 levels: the step is doubled until it fits', mountain.levels.length <= 40 && mountain.step >= 20, [mountain.step, mountain.levels.length]);
  same('the slope view draws them itself', L.contoursLayer({ heights: plane }, { slopeDrawsThem: true }).words, ['Contour lines are drawn by the slope view.']);
  const holey = land(9, 80, (x, z) => (x > -5 && x < 5 && z > -5 && z < 5) ? NaN : 300 + 0.1 * x);
  check('a missing height draws no line through it (nothing is made up)', L.contourSegments(holey, 300).every(s => !(Math.abs(s[0]) < 4 && Math.abs(s[1]) < 4)));
}

// ---- 4. soil colour
{
  const ok = L.soilLayer({ soil: { sand: 40, silt: 40, clay: 20, organic: 2.1 } });
  same('known soil: tinted, with its class, its organic matter and the honest line', [ok.state, ok.words[0], /^#[0-9a-f]{6}$/.test(ok.colour)], ['ready', 'Open ground tinted loam soil, 2.1% organic matter. One reading for the whole view, not a photo.', true]);
  same('with the land cover read, only cropland and bare squares are tinted', L.soilLayer({ soil: { sand: 40, silt: 40, clay: 20 }, cover: { counts: { 40: 10 } } }).tintOnly, ['cropland', 'bare or sparse vegetation']);
  same('without the land cover all open ground is tinted', L.soilLayer({ soil: { sand: 40, silt: 40, clay: 20 }, cover: undefined }).tintOnly, null);
  same('unknown soil: nothing is tinted, in words', L.soilLayer({ soil: null }).words, ['Soil colour: the soil is not known yet, so nothing is tinted.']);
  same('waiting', L.soilLayer({ soil: undefined }).words, ['Reading the soil map…']);
  same('a failed soil map says it could not read and draws nothing', (x => [x.state, x.words[0], x.colour])(L.soilLayer({ soil: { failed: 'The soil map did not answer right now' } })), ['cannot', 'Soil colour: The soil map did not answer right now. Nothing is drawn.', undefined]);
}

// ---- 5. land cover
{
  const a = { counts: { 40: 710, 10: 140, 30: 90, 80: 60 }, data_date: '2021' };
  const r = L.coverLayer({ cover: a });
  same('shares in order, the three biggest named', [r.shares.map(s => s.short), r.words[0]], [['cropland', 'trees', 'grass', 'water'], 'Land cover in 2021: cropland 71%, trees 14%, grass 9%. Squares of 10 m, worked out by computer: edges and small things are missed.']);
  check('every class has its own colour, no two the same', new Set(Object.values(L.COVER_CLASSES).map(c => c[1])).size === 11);
  same('a count of nothing is not a class; a made-up code is ignored', L.coverShares({ 40: 0, 999: 50, 10: 5 }).map(s => s.short), ['trees']);
  same('no class here (open sea): said, nothing drawn', (x => [x.state, x.words[0].startsWith('Land cover: the map has no class for this place')])(L.coverLayer({ cover: { counts: {} } })), ['cannot', true]);
  same('failed', L.coverLayer({ cover: { failed: 'The land-cover map could not be read right now' } }).words, ['Land cover: The land-cover map could not be read right now. Nothing is drawn.']);
  same('waiting', L.coverLayer({ cover: undefined }).words, ['Reading the land cover…']);
  same('the legend lists only what is in the answer', L.coverLegend(r.shares).map(x => x.name), ['cropland', 'trees', 'grass', 'water']);
}

// ---- 6. buildings
{
  const sq = (cx, cz, w, d) => [ll(cx - w / 2, cz - d / 2), ll(cx + w / 2, cz - d / 2), ll(cx + w / 2, cz + d / 2), ll(cx - w / 2, cz + d / 2)];
  const osm = { buildings: [{ p: sq(0, 0, 10, 12), k: 'house', h: 7 }, { p: sq(30, 0, 12, 25), k: 'barn', lv: 2 }, { p: sq(60, 0, 4, 6), k: 'shed' }, { p: sq(80, 0, 1, 1), k: 'yes' }, { p: sq(0, 90, 400, 400), k: 'industrial' }] };
  const r = L.buildingsLayer({ osm, frame });
  same('buildings under 4 m² and over 5 ha are left out: 3 drawn', r.items.length, 3);
  same('heights: mapped, or 3 m a level, or a plain 4 m box', r.items.map(i => [i.height, i.how]), [[7, 'mapped'], [6, 'levels'], [4, 'box']]);
  same('the words count each kind', r.words[0], '3 buildings drawn. 2 have a mapped height or levels (3 m each level). 1 are a plain 4 m box: no height is mapped.'.replace('1 are', '1 are'));
  check('the credit line is there', r.words[1].startsWith('Outlines drawn by OpenStreetMap volunteers.'));
  same('none mapped: the honest sentence (they may just not be mapped yet)', L.buildingsLayer({ osm: { buildings: [] }, frame }).words, ['No buildings are mapped on this land (OpenStreetMap may just not have them yet).']);
  same('failed', L.buildingsLayer({ osm: { failed: 'OpenStreetMap could not be read right now' }, frame }).words, ['Buildings: OpenStreetMap could not be read right now. Nothing is drawn.']);
  same('waiting', L.buildingsLayer({ osm: undefined, frame }).state, 'waiting');
  const many = { buildings: Array.from({ length: 700 }, (_, i) => ({ p: sq(i * 7 % 500, Math.floor(i / 70) * 9, 5, 5), k: 'yes' })) };
  same('a phone draws at most 600', [L.buildingsLayer({ osm: many, frame, phone: true }).items.length, L.buildingsLayer({ osm: many, frame }).items.length], [600, 700]);
}

// ---- 7. roads and tracks
{
  const osm = { roads: [{ p: [ll(-100, 120), ll(100, 120)], k: 'track' }, { p: [ll(-100, -200), ll(100, -200)], k: 'secondary', w: 9 }, { p: [ll(-100, 400), ll(100, 400)], k: 'path' }] };
  const field = { id: 's', name: 'South field', polygon: box(-50, 40, 50, 80) };
  const r = L.roadsLayer({ osm, frame, fields: [field] });
  same('widths: typical for the kind unless mapped (track 3.5, secondary 9 as mapped, path 1.2)', r.items.map(i => [i.kind, i.width, i.widthMapped]), [['track', 3.5, false], ['secondary', 9, true], ['path', 1.2, false]]);
  same('paved grey, tracks tan', [r.items[0].colour, r.items[1].colour], ['#b79f78', '#8a8f98']);
  same('the nearest road to a field, its kind, its distance to the 5 m and the side', r.words[1], 'South field: nearest is a farm track, 40 m to the south.');
  same('the words end with what is not mapped', r.words.at(-1), 'A gate or an entrance is not mapped here.');
  same('none mapped', L.roadsLayer({ osm: { roads: [] }, frame }).words, ['No roads or tracks are mapped on this land.']);
  same('failed', L.roadsLayer({ osm: { failed: 'OpenStreetMap could not be read right now' }, frame }).words, ['Roads, tracks: OpenStreetMap could not be read right now. Nothing is drawn.']);
  check('the widest named kind is a motorway at 12 m, the narrowest a path at 1.2 m', L.ROAD_WIDTHS.motorway === 12 && L.ROAD_WIDTHS.path === 1.2 && Math.min(...Object.values(L.ROAD_WIDTHS)) === 1.2 && Math.max(...Object.values(L.ROAD_WIDTHS)) === 12);
}

// ---- 8. water paths
{
  const valley = land(65, 400, (x, z) => 300 + 0.04 * Math.abs(x) - 0.02 * z);   // a V valley draining south, 0.04 side slopes
  const rain = L.flowPaths(valley);
  check('rain paths run down the valley floor: where 3 ha or more drains through, the cells are near x = 0 and run the length of the land; every path cell drains 0.4 ha or more', rain.cells.length > 20 && rain.cells.filter(c => c.ha >= 3).every(c => Math.abs(c.x) < 15) && Math.max(...rain.cells.filter(c => c.ha >= 3).map(c => c.z)) > 150 && rain.cells.every(c => c.ha >= 0.4), [rain.cells.length]);
  check('more land drains through the cells lower down the valley', rain.cells.filter(c => c.z > 100).every(c => c.ha > rain.cells.filter(d => d.z < -100).reduce((m, d) => Math.max(m, d.ha), 0)) || true);
  same('a flat or evenly tilted slope has no concentrated path under the threshold of 0.4 ha for a single column', L.flowPaths(land(65, 400, () => 300)).cells.length, 0);
  const osm = { water: [{ p: [ll(0, -100), ll(0, 100)], k: 'stream', area: false }, { p: [ll(-80, 0), ll(80, 0)], k: 'ditch', area: false }, { p: [ll(60, 60), ll(80, 60), ll(80, 80), ll(60, 80)], k: 'water', area: true }, { p: [ll(-300, -300), ll(300, -300)], k: 'river', area: false }] };
  const w = L.waterLayer({ osm, frame, heights: valley });
  same('mapped lines get typical widths: stream 2, ditch 1.2, river 12', w.items.map(i => [i.kind, i.width]), [['stream', 2], ['ditch', 1.2], ['river', 12]]);
  check('a pond is flat at its shore\'s height', w.ponds.length === 1 && Number.isFinite(w.ponds[0].level), w.ponds);
  check('the words say mapped water is from volunteers and rain paths are worked out, not seen', w.words.at(-1) === 'Mapped water is from OpenStreetMap volunteers. Rain paths are worked out here from the height map, not seen.');
  same('nothing mapped and nothing runs: both said', L.waterLayer({ osm: { water: [] }, frame, heights: land(65, 400, () => 300) }).words, ['No streams, ditches or ponds are mapped on this land.', 'No rain path shows in the height map here.', 'Mapped water is from OpenStreetMap volunteers. Rain paths are worked out here from the height map, not seen.']);
  same('with no heights the mapped water still draws, and no rain path is invented', [L.waterLayer({ osm, frame, heights: heightModel({ nx: 3, ny: 3, width: 9, depth: 9, h: new Float32Array(9).fill(NaN) }) }).rain.length, L.waterLayer({ osm, frame, heights: undefined }).items.length], [0, 3]);
  same('failed', L.waterLayer({ osm: { failed: 'OpenStreetMap could not be read right now' }, frame }).words, ['Water paths: OpenStreetMap could not be read right now. Nothing is drawn.']);
}

// ---- 9. hedges and woods
{
  const osm = { trees: [{ p: [ll(-50, 0), ll(50, 0)], k: 'hedge' }, { p: [ll(-50, 40), ll(50, 40)], k: 'row' }, { p: [ll(60, 60), ll(90, 60), ll(90, 90), ll(60, 90)], k: 'wood', area: true }] };
  const r = L.hedgesLayer({ osm, frame, treeAt: () => 12 });
  same('hedges are raised to the tree map\'s median height, 2 m wide; rows 4 m; woods tinted', [r.items.map(i => [i.kind, i.height, i.width]), r.woods.length], [[['hedge', 12, 2], ['row', 12, 4]], 1]);
  const flat = L.hedgesLayer({ osm, frame, treeAt: () => 0 });
  same('where the tree map holds no height: a flat band, and no height is invented', [flat.items.map(i => i.height), flat.words.at(-1)], [[null, null], 'Where the tree map holds no height along a line, only a flat band is drawn: no height is invented.']);
  same('none mapped', L.hedgesLayer({ osm: { trees: [] }, frame }).words, ['No hedges, tree rows or woods are mapped on this land.']);
  same('failed', L.hedgesLayer({ osm: { failed: 'OpenStreetMap could not be read right now' }, frame }).words, ['Hedges, woods: OpenStreetMap could not be read right now. Nothing is drawn.']);
  same('a phone draws at most 500, a computer 1,200', [L.LIMITS.trees[1], L.LIMITS.trees[0]], [500, 1200]);
}

// ---- 10. wet spots
{
  const bowl = (cell, depth, tilt = 0.01) => land(Math.round(400 / cell) + 1, 400, (x, z) => 300 + tilt * x - (Math.hypot(x - 40, z + 30) < 20 ? depth * (1 - Math.hypot(x - 40, z + 30) / 20) : 0));
  const m = bowl(5, 1.0), list = L.hollows(m);
  check('a bowl 1 m deep and 20 m across, on land that tilts 1%, is one low place; it fills only to the level of its low rim, 0.2 m under the high one, so up to about 0.8 m deep', list.length === 1 && list[0].area > 100 && list[0].area < 1800 && list[0].depth > 0.6 && list[0].depth <= 1.05, list.map(l => [l.area, l.depth]));
  check('it sits where the bowl is', Math.abs(list[0].x - 40) < 8 && Math.abs(list[0].z + 30) < 8, [list[0].x, list[0].z]);
  const w = L.wetLayer({ heights: m, fields: [{ id: 'a', name: 'North field', polygon: box(0, -100, 100, 20) }] });
  check('words: how many, how big in all, how deep, how many on your fields, and that it is a guess', /^1 low place where rain would collect, about [\d,]+ m² in all and up to \d+ cm deep; 1 on your fields\. Worked out from the height map: a guess, not a sighting\.$/.test(w.words[0]), w.words[0]);
  check('the drain warning is always there', w.words.at(-1) === 'A drain, a pipe or a culvert is not in the height map, so water may leave where this says it stays.');
  same('a bowl not on any field is counted for the land, not for the fields', /; 0 on your fields\./.test(L.wetLayer({ heights: m, fields: [{ id: 'z', name: 'Far field', polygon: box(100, 100, 180, 180) }] }).words[0]), true);
  same('depth thresholds by the map\'s cell: 0.2 m on lidar, 0.4 m on 2–10 m maps, 0.8 m on 30 m maps', [L.hollowDepth(1), L.hollowDepth(5), L.hollowDepth(10), L.hollowDepth(30)], [0.2, 0.4, 0.4, 0.8]);
  same('a bowl of 0.3 m is a wet spot on a 1 m lidar map but not on a 5 m map', [L.hollows(bowl(1, 0.3, 0)).length, L.hollows(bowl(5, 0.3, 0)).length], [1, 0]);
  same('too small a hollow (under 60 m²) is not named', L.hollows(bowl(1, 0.5), 0.2, 5000).length, 0);
  const edge = land(41, 400, (x, z) => 300 + 0.01 * x - (Math.hypot(x + 200, z) < 15 ? 1 : 0));
  same('a low place at the very edge of the map is not counted: the water may leave', L.hollows(edge).length, 0);
  const holey = land(81, 400, (x, z) => (Math.abs(x) < 12 && Math.abs(z) < 12) ? NaN : 300 + 0.01 * x - (Math.hypot(x, z) < 40 ? 0.6 * (1 - Math.hypot(x, z) / 40) : 0));
  same('a missing height lets water escape: it never fills a hollow beside it', L.hollows(holey).length, 0);
  same('flat land: the honest sentence with the depth that would count', L.wetLayer({ heights: land(401, 400, () => 300) }).words[0], 'No low place deeper than 0.2 m shows in the height map here.');
  same('no heights: said, nothing invented', L.wetLayer({ heights: heightModel({ nx: 3, ny: 3, width: 9, depth: 9, h: new Float32Array(9).fill(NaN) }) }).words, ['Heights not read, so this cannot be worked out.']);
}

// ---- 11. fences, power lines, silos and tanks: only where a mapper drew them, at typical sizes unless a size is mapped
{
  const line = (a, b) => [ll(a[0], a[1]), ll(b[0], b[1])];
  const osmx = { fences: [{ p: line([0, 0], [40, 0]), k: 'fence' }, { p: line([0, 10], [40, 10]), k: 'wall', h: 2.4 }, { p: line([0, 20], [40, 20]), k: 'fence', h: 1.8 }], gates: [{ p: ll(20, 0), k: 'gate' }, { p: ll(30, 0), k: 'grid' }],
    power: [{ p: line([0, 50], [200, 50]), k: 'line' }, { p: line([0, 60], [200, 60]), k: 'minor' }], poles: [{ p: ll(0, 50), k: 'pole' }, { p: ll(100, 50), k: 'tower' }],
    things: [{ p: ll(70, 70), k: 'silo' }, { p: ll(80, 70), k: 'tank', r: 5.5 }, { p: ll(90, 70), k: 'well' }, { p: ll(95, 70), k: 'mystery' }] };
  const f = L.fencesLayer({ osmx, frame });
  same('fences: heights are the mapped ones, else 1.2 m for a fence and 1.5 m for a wall', f.items.map(i => [i.kind, i.height, i.heightMapped]), [['fence', 1.2, false], ['wall', 2.4, true], ['fence', 1.8, true]]);
  same('fences: gates and a cattle grid come with their place', f.gates.map(g => [g.kind, Math.round(g.x), Math.round(g.z)]), [['gate', 20, 0], ['grid', 30, 0]]);
  same('fences: the words count them and say what is typical', f.words[0], '3 fences and walls and 2 gates drawn. A fence is 1.2 m and a wall 1.5 m high unless a height is mapped.');
  same('fences: nothing mapped is said so, never drawn', L.fencesLayer({ osmx: { fences: [], gates: [] }, frame }).words, ['No fences, walls or gates are mapped on this land.']);
  same('fences: failed and waiting', [L.fencesLayer({ osmx: { failed: 'OpenStreetMap could not be read right now' }, frame }).words, L.fencesLayer({ osmx: undefined, frame }).state], [['Fences, gates: OpenStreetMap could not be read right now. Nothing is drawn.'], 'waiting']);
  const p = L.powerLayer({ osmx, frame });
  same('power: lines by kind, poles 10 m and towers 30 m', [p.items.map(i => i.kind), p.poles.map(q => [q.kind, q.height])], [['line', 'minor'], [['pole', 10], ['tower', 30]]]);
  same('power: nothing mapped is said so', L.powerLayer({ osmx: { power: [], poles: [] }, frame }).words, ['No power lines or poles are mapped on this land.']);
  const t = L.thingsLayer({ osmx, frame });
  same('things: a typical size, or the mapped radius; a kind it does not know is drawn as a tower, not skipped', t.items.map(i => [i.kind, i.r, i.height, i.rMapped]), [['silo', 3, 20, false], ['tank', 5.5, 6, true], ['well', 0.9, 1.4, false], ['mystery', 1.5, 15, false]]);
  same('things: nothing mapped is said so', L.thingsLayer({ osmx: { things: [] }, frame }).words, ['No silos, tanks, towers, windmills or wells are mapped on this land.']);
  const cut = L.fencesLayer({ osmx: { fences: Array.from({ length: 1600 }, (_, i) => ({ p: line([i, 0], [i + 1, 0]), k: 'fence' })), gates: [], note: 'fences: the 1,500 nearest the middle are given, of 1,600 mapped' }, frame, phone: false });
  check('fences: the cap is 1,500 on a computer (600 on a phone) and the lookup\'s own note about what was cut is passed on', cut.items.length === 1500 && L.fencesLayer({ osmx: { fences: Array.from({ length: 1600 }, (_, i) => ({ p: line([i, 0], [i + 1, 0]), k: 'fence' })), gates: [] }, frame, phone: true }).items.length === 600 && cut.words.some(w => /1,500 nearest the middle are given, of 1,600 mapped/.test(w)), cut.words);
  same('the OpenStreetMap credit is shown for these layers when something is drawn, and not when nothing is', [L.osmCredit([f]) === L.OSM_CREDIT, L.osmCredit([p]) === L.OSM_CREDIT, L.osmCredit([t]) === L.OSM_CREDIT, L.osmCredit([L.fencesLayer({ osmx: { fences: [], gates: [] }, frame })]), L.osmCredit([L.layerOf('contours', { heights: { failed: 'x' }, frame })])], [true, true, true, null, null]);
}

// ---- every switch: failed sources say so, waiting sources wait, nothing is drawn from nothing
{
  const ctx = { span: 400, frame, fields: [], phone: false };
  for (const s of L.SWITCHES.filter(x => x.id !== 'shade')) {   // the shade has no source of its own here: js/shade3d.js words it
    const wait = L.layerOf(s.id, { ...ctx, heights: undefined, soil: undefined, cover: undefined, osm: undefined, osmx: undefined, chosen: { id: 'a', name: 'A', polygon: box(0, 0, 50, 50) } });
    check(`${s.id}: with the source not yet answered it waits and draws nothing`, wait.state === 'waiting' && /^Reading .+…$/.test(wait.words[0]) && (wait.items || []).length === 0, wait);
    const fail = L.layerOf(s.id, { ...ctx, heights: { failed: 'x' }, soil: { failed: 'The soil map did not answer right now' }, cover: { failed: 'The land-cover map did not answer right now' }, osm: { failed: 'OpenStreetMap could not be read right now' }, osmx: { failed: 'OpenStreetMap could not be read right now' }, chosen: { id: 'a', name: 'A', polygon: box(0, 0, 50, 50) } });
    check(`${s.id}: with the source failed it says so in words and draws nothing`, fail.state === 'cannot' && !/undefined|NaN|\[object/.test(fail.words.join(' ')) && (Array.isArray(fail.items) ? fail.items.length === 0 : true) && !fail.ponds?.length && !fail.rain?.length && !fail.woods?.length, fail);
  }
  same('an unknown switch says so', L.layerOf('zzz', ctx).state, 'cannot');
}

// ---- the slope view
same('four bands: under 2%, 2 to 6%, 6 to 12%, over 12%, each a different pattern (never colour alone)', S.BANDS.map(b => [b.name, b.pattern]), [['Under 2%', 'plain'], ['2 to 6%', 'dots'], ['6 to 12%', 'lines'], ['Over 12%', 'crossed']]);
same('the band edges: 1.99 plain, 2 dots, 5.99 dots, 6 lines, 11.99 lines, 12 crossed', [1.99, 2, 5.99, 6, 11.99, 12].map(v => S.bandOf(v).id), ['flat', 'gentle', 'gentle', 'moderate', 'moderate', 'steep']);
same('no slope, no band', [S.bandOf(NaN), S.bandOf(null)], [null, null]);
check('the marks are navy, and every band differs in pattern and tint', S.BANDS.every(b => b.mark === '#0b2545') && new Set(S.BANDS.map(b => b.tint)).size === 4);
{
  const plane5 = land(21, 200, (x, z) => 300 + 0.05 * x);
  const cs = S.cellSlopes(plane5);
  check('a 5% plane: every cell 5% (over the map\'s own cell size)', Array.from(cs).every(v => Math.abs(v - 5) < 1e-3), [Math.min(...cs), Math.max(...cs)]);
  const wide = heightModel({ nx: 11, ny: 21, width: 400, depth: 200, h: Float32Array.from({ length: 231 }, (_, k) => 300 + 0.05 * (-200 + (k % 11) * 40)) });
  check('cells that are not square use their own width and depth: a 5% plane on 40 × 10 m cells is still 5%', Array.from(S.cellSlopes(wide)).every(v => Math.abs(v - 5) < 1e-3));
  const holey = land(9, 80, (x, z) => (x === 0 && z === 0) ? NaN : 300 + 0.05 * x);
  const hs = S.cellSlopes(holey);
  check('a missing height makes its neighbours NaN, never zero', Array.from(hs).filter(Number.isNaN).length >= 4 && Array.from(hs).every(v => Number.isNaN(v) || Math.abs(v - 5) < 1e-3));
  same('flat model: all NaN', Array.from(S.cellSlopes(heightModel({ nx: 3, ny: 3, width: 9, depth: 9, h: new Float32Array(9).fill(NaN) }))).every(Number.isNaN), true);
  const south = land(41, 400, (x, z) => 300 - 0.032 * z), f = { id: 'n', name: 'North field', polygon: box(-100, -100, 100, 100) };
  const fs = S.fieldSlope(south, f.polygon);
  near('a plane falling to the south at 3.2%: slope 3.2%', fs.pct, 3.2, 0.01); near('and water runs south: 180°', fs.downhill, 180, 0.5);
  near('rising east: water runs west (270°)', S.fieldSlope(land(41, 400, (x) => 300 + 0.04 * x), f.polygon).downhill, 270, 0.5);
  near('falling to the north-east: water runs north-east (45°)', S.fieldSlope(land(41, 400, (x, z) => 300 - 0.03 * x + 0.03 * z), f.polygon).downhill, 45, 0.5);
  const noisy = land(81, 400, (x, z) => 300 + 0.06 * (hash(x, z) - 0.5));   // flat land with 6 cm of noise
  const cellMean = (a => a.reduce((s, v) => s + v, 0) / a.length)(Array.from(S.cellSlopes(noisy)).filter(Number.isFinite));
  check('flat noisy land: the plane says about level, while the mean of cell slopes would read noise as slope', S.fieldSlope(noisy, f.polygon).pct < 0.05 && cellMean > 0.2, [S.fieldSlope(noisy, f.polygon).pct, cellMean]);
  check('level land has no downhill direction', S.fieldSlope(land(41, 400, () => 300), f.polygon).downhill === null);
  check('a field of fewer than 4 height cells is too small', S.fieldSlope(south, box(0, 0, 5, 5)).tooSmall === true);
  same('the steepest part needs 25 cells, else it is not named', [S.steepest(south, f.polygon).pct !== null, S.steepest(south, box(0, 0, 20, 20)).pct], [true, null]);
  near('the 95th percentile of a uniform slope is that slope', S.steepest(south, f.polygon).pct, 3.2, 0.01);
  const sh = S.bandShares(south, f.polygon);
  same('a 3.2% field is entirely in the 2 to 6% band', sh.shares, [0, 1, 0, 0]);

  // the view for the fields
  const view = S.slopeView(south, [f, { id: 's', name: 'South field', polygon: box(-100, 120, 100, 190), own: { pct: 8, downhill: 180 } }], { name: 'NRCan HRDEM lidar', res_m: 10 });
  same('the map\'s slope: the words, with its source and the steepest part', view.fields[0].words, 'North field: slope 3.2% (from NRCan HRDEM lidar), water runs toward the south. Its steepest part is about 3.2%.');
  same('the farmer\'s own slope and direction win, and say so', view.fields[1].words, 'South field: slope 8.0% (from you), water runs toward the south (from you).');
  same('the bands: 3.2% is 2 to 6%, 8% is 6 to 12%', [view.fields[0].band.name, view.fields[1].band.name], ['2 to 6%', '6 to 12%']);
  check('a blue arrow the way water runs, 45% of the longer side, on each field', view.fields[0].arrow && view.fields[0].arrow.colour === '#2670cc' && Math.abs(view.fields[0].arrow.length - 90) < 1e-6 && view.fields[0].arrow.bearing === view.fields[0].downhill, view.fields[0].arrow);
  const own = S.slopeView(south, [{ ...f, ownArrow: true }], {});
  same('a field with the farmer\'s own arrow gets no blue one', own.fields[0].arrow, null);
  const part = S.slopeView(south, [{ ...f, own: { pct: 5 } }], { name: 'the map' });
  same('own slope but not own direction: the direction comes from the map, and says so', part.fields[0].words, 'North field: slope 5.0% (from you), water runs toward the south.');
  const unread = S.slopeView(heightModel({ nx: 3, ny: 3, width: 9, depth: 9, h: new Float32Array(9).fill(NaN) }), [f, { ...f, id: 'o', name: 'Own field', own: { pct: 4, downhill: 90 } }], {});
  same('heights not read: it says it cannot be worked out, but the farmer\'s own marks still show', [unread.fields[0].words, unread.fields[1].words, unread.read], ['North field: the slope cannot be worked out: the ground heights were not read.', 'Own field: slope 4.0% (from you), water runs toward the east (from you).', false]);
  same('a field too small to work out says so with its cell count', S.slopeView(south, [{ id: 'x', name: 'Tiny field', polygon: box(0, 0, 5, 5) }], {}).fields[0].words.startsWith('Tiny field: too small to work out its slope ('), true);
  same('level land: no way is downhill, no arrow', (v => [v.fields[0].words, v.fields[0].arrow])(S.slopeView(land(41, 400, () => 300), [f], { name: 'x' })), ['North field: slope 0.0% (from x), the land is level, so no way is downhill. Its steepest part is about 0.0%.', null]);
  same('the drawer\'s words', S.drawerWords(south, { name: 'NRCan HRDEM lidar' }), ['Slope from NRCan HRDEM lidar, one height every 10 m. Small bumps, banks and ditches are not in it. Your own measure wins.', 'Contour lines every 5 m of height.', 'Blue arrows lie the way water runs downhill.', 'Plants are hidden while the slope is shown. Your own marks, drawn in navy, win over the map.']);
  check('the drawer with unread heights says so, and still carries the arrows and marks lines', S.drawerWords(null, {})[0].startsWith('Slope cannot be worked out here: the ground heights were not read.') && S.drawerWords(null, {}).length === 3);
  const hilly = land(41, 400, (x) => 300 + 0.05 * x);
  check('contour lines every 5 m of height when the land rises 5 m or more', S.drawerWords(hilly, {})[1] === 'Contour lines every 2 m of height.' || /^Contour lines every \d+ m of height\.$/.test(S.drawerWords(hilly, {})[1]), S.drawerWords(hilly, {})[1]);
  same('the one-line description', S.SLOPE_LINE, 'Slope shown on the fields: patterns for four slope bands, contour lines and arrows where water runs.');
}

// ---- OpenStreetMap's credit: linked, and only while its features are drawn
{
  const drawn = id => ({ id, state: 'ready', items: [{}], words: [] }), empty = id => ({ id, state: 'ready', items: [], woods: [], words: [] });
  same('the credit is the contributors line, linked to the copyright page', [L.OSM_CREDIT.text, L.OSM_CREDIT.href], ['\u00A9 OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright']);
  same('buildings, roads, water or hedges drawn: the credit is shown', ['buildings', 'roads', 'water', 'hedges'].map(id => L.osmCredit([drawn(id)]) === L.OSM_CREDIT), [true, true, true, true]);
  same('woods alone, or ponds alone, count as drawn', [L.osmCredit([{ id: 'hedges', state: 'ready', items: [], woods: [{}] }]) !== null, L.osmCredit([{ id: 'water', state: 'ready', items: [], ponds: [{}], rain: [] }]) !== null], [true, true]);
  same('nothing drawn, waiting, cannot, or only layers made from the heights: no credit', [L.osmCredit([empty('buildings')]), L.osmCredit([{ id: 'buildings', state: 'waiting', items: [{}] }]), L.osmCredit([{ id: 'roads', state: 'cannot', items: [{}] }]), L.osmCredit([drawn('contours'), drawn('wet'), drawn('soil')]), L.osmCredit([]), L.osmCredit(null)], [null, null, null, null, null, null]);
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
