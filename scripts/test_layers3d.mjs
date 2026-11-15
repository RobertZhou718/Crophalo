// The suite for the layers of the 3D view that need no page: the slope of a synthetic hill with known answers by the map's own classes, the legend, the drape's colours, the missing heights, and the state list the page shows.
// Checked in a page by scripts/e2e_farm3d.mjs. RULE: never loosen a check to make it pass. Run: node scripts/test_layers3d.mjs
import { slopeGrid, frostGrid, erosionGrid, erosionFactorOf, greenSquares, drapeOf, drapeWords, legendOf, LAYER_LIST, NEEDS_HEIGHTS, NEEDS_EROSION, NEEDS_GREENNESS } from '../js/layers3d.js';
import { createLayers } from '../js/layers3d-load.js';
import { SLOPE_CLASSES, slopeClass } from '../js/terrain-math.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else { fail++; console.log(`FAIL  ${name}${detail !== '' ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };
const same = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);

// a grid of 21 x 21 points over 200 m x 200 m (10 m cells): a plane rising 5 m east for every 100 m = a 5 % slope toward the east, then a steep ramp
const mk = (f, nx = 21, ny = 21, width = 200, depth = 200) => { const h = new Float32Array(nx * ny); for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) h[r * nx + c] = f(c * width / (nx - 1), r * depth / (ny - 1)); return { nx, ny, width, depth, h, flat: false, cellX: width / (nx - 1), cellZ: depth / (ny - 1) }; };
const plane5 = mk(x => 0.05 * x), plane20 = mk((x, z) => 0.2 * z), level = mk(() => 100);
const mid = g => g[10 * 21 + 10];
check('a plane rising 5 m in 100 m is a 5 % slope, to the digit', Math.abs(mid(slopeGrid(plane5)) - 5) < 1e-4, mid(slopeGrid(plane5)));
check('a plane falling south at 20 % is a 20 % slope whichever way it faces', Math.abs(mid(slopeGrid(plane20)) - 20) < 1e-4, mid(slopeGrid(plane20)));
check('level ground is 0 %', mid(slopeGrid(level)) === 0);
check('the classes are the map\'s own: 5 % is "sloping" (5 to 10 %), 20 % "moderately steep", 1 % "flat to very gently sloping"', SLOPE_CLASSES[slopeClass(5)].range === '5 to 10 %' && SLOPE_CLASSES[slopeClass(20)].range === '15 to 30 %' && SLOPE_CLASSES[slopeClass(1)].colour === null);
const d5 = drapeOf('slope', plane5);
check('the drape has one square for every point of the grid, coloured with the class colour, a little see-through', d5.w === 21 && d5.h === 21 && d5.rgba.length === 21 * 21 * 4 && d5.rgba[(10 * 21 + 10) * 4 + 3] > 100 && d5.rgba[(10 * 21 + 10) * 4 + 3] < 200 && d5.drawn > 300, [d5.drawn, d5.rgba[(10 * 21 + 10) * 4 + 3]]);
const dl = drapeOf('slope', level); check('level ground colours nothing and the words say so', dl.drawn === 0 && /nearly level/.test(drapeWords('slope', dl)));
check('the legend is the classes that are coloured, each with its range and its words', legendOf('slope').length === 5 && legendOf('slope').every(k => /^#/.test(k.colour) && /%/.test(k.label)));
// missing heights: nothing is filled in
const holey = mk(x => 0.05 * x); holey.h[10 * 21 + 10] = NaN; const sh = slopeGrid(holey);
check('a missing height leaves a square with no slope (NaN) and its neighbours in the same ring, never a made-up number', Number.isNaN(sh[10 * 21 + 10]) && Number.isNaN(sh[10 * 21 + 11]) && !Number.isNaN(sh[2 * 21 + 2]));
check('with no grid, or a flat stand-in, there is no drape and the words are the plain sentence', drapeOf('slope', null) === null && drapeOf('slope', { flat: true }) === null && drapeWords('slope', null) === NEEDS_HEIGHTS);
check('the layers worked out here: the picture (a base) and four drapes (slope, erosion, frost, greenness), each with a plain line', LAYER_LIST.map(l => l.id).join() === 'picture,slope,erosion,frost,greenness' && LAYER_LIST.every(l => l.line.length > 10));

// frost pockets: a bowl 6 m deep in the middle of a gentle field, 41 x 41 points over 400 m (10 m cells; the window is 300 m)
const bowl = mk((x, z) => 100 + 0.002 * x - 6 * Math.exp(-((x - 200) ** 2 + (z - 200) ** 2) / (2 * 40 ** 2)), 41, 41, 400, 400);
const fg = frostGrid(bowl), centre = fg[20 * 41 + 20], rim = fg[20 * 41 + 4];
check('frost: the middle of a bowl 5 m or more below its surroundings is "settles more" (1), high ground is not drawn (-1)', centre === 1 && rim === -1 && fg[2 * 41 + 38] === -1, [centre, rim]);
check('frost: steep ground is never drawn as a frost pocket (a slope of 5 % or more)', (() => { const steep = mk((x, z) => 100 + 0.2 * x - 6 * Math.exp(-((x - 200) ** 2 + (z - 200) ** 2) / (2 * 40 ** 2)), 41, 41, 400, 400); return frostGrid(steep)[20 * 41 + 20] === -1; })());
const dfrost = drapeOf('frost', bowl); check('frost: the drape colours only the low squares, with the map\'s two colours, and the words count them', dfrost.drawn > 5 && dfrost.drawn < 500 && /Cold air may settle on \d+ of 1681 squares/.test(drapeWords('frost', dfrost)) && legendOf('frost').length === 2);
// erosion: the index is the map's: a 9 % slope of loam under moderate rain (MFI 100 mm) is 1
const loam = { soil: { sand: 40, silt: 40, clay: 20, carbon: 1.5 }, mfi: 100 };
check('erosion: the factor of loam under an MFI of 100 mm is 1, and a plane of 9 % reads 1.0 (to 2 digits)', Math.abs(erosionFactorOf(loam) - 1) < 1e-3 && Math.abs(erosionGrid(mk(x => 0.09 * x), 1)[10 * 21 + 10] - 1) < 0.02, [erosionFactorOf(loam), erosionGrid(mk(x => 0.09 * x), 1)[10 * 21 + 10]]);
check('erosion: the soil and rain handed in, or a ready factor, make the factor; nothing handed in makes none (no drape, never a made-up one)', erosionFactorOf({ factor: 2.5 }) === 2.5 && erosionFactorOf(null) === null && drapeOf('erosion', plane5, {}) === null && drapeOf('erosion', plane5, { erosion: loam }).drawn > 0);
check('erosion: its legend is the map\'s three coloured classes', legendOf('erosion').length === 3);
// greenness: the squares of the weak-spots answer
const slab = { lat: 41.18, lon: -96.44, width: 600, depth: 600 };
const corners = (dx, dz) => [[-96.44 + dx / 83500, 41.18 + dz / 110574], [-96.44 + (dx + 30) / 83500, 41.18 + dz / 110574], [-96.44 + (dx + 30) / 83500, 41.18 + (dz + 30) / 110574], [-96.44 + dx / 83500, 41.18 + (dz + 30) / 110574]];
const ans = { ok: true, cells: [{ id: 0, corners: corners(0, 0), inside: true }, { id: 1, corners: corners(30, 0), inside: true }, { id: 2, corners: corners(60, 0), inside: false }, { id: 3, corners: corners(90, 0), inside: true }],
  passes: [{ ndvi: [0.5, 0.9, 0.5, null], clear_share: 0.9 }, { ndvi: [0.7, 0.7, 0.7, null], clear_share: 0.8 }, { ndvi: [0.0, 0.0, 0.0, 0.0], clear_share: 0.3 }] };
const gs = greenSquares(ans, slab);
check('greenness: a square is the average of its clear looks (the pass that was mostly cloud is dropped, a cloud is never a zero), a square with no clear look is not drawn, a square not wholly inside is not drawn', gs.squares.length === 2 && Math.abs(gs.squares[0].value - 0.6) < 1e-9 && Math.abs(gs.squares[1].value - 0.8) < 1e-9 && gs.passes === 2 && gs.cells === 3, gs.squares.map(q => q.value));
check('greenness: each square has four corners laid on the land in metres from the middle of the block', gs.squares.every(q => q.pts.length === 4) && Math.abs(gs.squares[0].pts[0].x + 0) < 1 && Math.abs(gs.squares[1].pts[0].x - 30) < 1, gs.squares[1].pts[0]);
const dg = drapeOf('greenness', null, { green: gs });
check('greenness: the drape is squares with the five classes of the legend, the words say how many of how many and from how many looks', dg.polys.length === 2 && dg.polys[0].colour === '#1a9641' && dg.polys[1].colour === '#006837' && legendOf('greenness').length === 5 && /2 of 3 squares of the field are coloured, from 2 clear looks/.test(drapeWords('greenness', dg)), dg.polys.map(p => p.colour));
check('greenness: an answer that failed, or has no squares, gives no drape', greenSquares({ ok: false }, slab) === null && drapeOf('greenness', null, { green: { squares: [] } }) === null);

// the controller: the state of each layer, without a page (no fetch: the picture fails plainly)
const said = [], ctl = createLayers({ fetchImpl: async () => { throw new Error('offline'); }, makeCanvas: () => null, say: id => said.push(id) });
const sc = (heights) => ({ slab: { lat: 41.18, lon: -96.44, width: 1101, depth: 1100 }, heights });
let s1 = ctl.attach(sc({ status: 'missing', model: null }));
check('at first the picture is loading and the slope waits for the heights; the picture is on, the slope off', ctl.layers(s1).find(l => l.id === 'picture').state === 'loading' && ctl.layers(s1).find(l => l.id === 'picture').on && ctl.layers(s1).find(l => l.id === 'slope').state === 'loading' && !ctl.layers(s1).find(l => l.id === 'slope').on);
await new Promise(r => setTimeout(r, 30));
check('a picture that cannot be read says so in one plain sentence and the view is told once', ctl.layers(s1).find(l => l.id === 'picture').state === 'failed' && /could not be (read|asked)/.test(ctl.layers(s1).find(l => l.id === 'picture').line) && said.includes('picture'), said);
ctl.setLayer('slope', true);
s1 = ctl.attach(sc({ status: 'failed', model: null, words: 'No height map answered for this place right now.' }));
check('slope with heights that failed: failed, with the reason', ctl.layers(s1).find(l => l.id === 'slope').state === 'failed' && /No height map answered/.test(ctl.layers(s1).find(l => l.id === 'slope').line));
const s2 = ctl.attach(sc({ status: 'read', model: plane5 }));
const sl = ctl.layers(s2).find(l => l.id === 'slope');
check('slope with the heights read: ready, on, with its legend and a sentence about the land; the scene is given the drape and a new paint key', sl.state === 'ready' && sl.on && sl.legend.length === 5 && /steeper than 2 %/.test(sl.line) && s2.drape?.id === 'slope' && /slope:/.test(s2.paintKey) && s2.picture === null, [sl.state, s2.paintKey]);
ctl.setLayer('slope', false); const s3 = ctl.attach(sc({ status: 'read', model: plane5 }));
check('turning the slope off takes the drape away and changes the paint key', !s3.drape && s3.paintKey !== s2.paintKey && !ctl.layers(s3).find(l => l.id === 'slope').on);
check('an unknown layer is refused, nothing changes', ctl.setLayer('nothing', true) === false);
// erosion, greenness and the plants through the controller
const ctl2 = createLayers({ fetchImpl: async () => { throw new Error('offline'); }, makeCanvas: () => null, say: id => said.push(id) });
const modelOf = plane5, sc5 = h => ({ slab, heights: h });
let e1 = ctl2.attach(sc5({ status: 'read', model: modelOf })); ctl2.setLayer('erosion', true);
check('erosion with no soil and rain handed in needs them, and says so in one plain sentence', ctl2.layers(e1).find(l => l.id === 'erosion').state === 'needs' && ctl2.layers(e1).find(l => l.id === 'erosion').line.includes(NEEDS_EROSION));
ctl2.setErosion(loam); e1 = ctl2.attach(sc5({ status: 'read', model: modelOf }));
check('erosion with them: ready, drawn over the land, its legend three classes', ctl2.layers(e1).find(l => l.id === 'erosion').state === 'ready' && e1.drape?.id === 'erosion' && ctl2.layers(e1).find(l => l.id === 'erosion').legend.length === 3);
ctl2.setLayer('greenness', true);
let g1 = ctl2.attach(sc5({ status: 'read', model: modelOf }));
check('greenness with no weak-spots answer needs it, says "Find weak spots", and the erosion drape was replaced (one at a time)', ctl2.layers(g1).find(l => l.id === 'greenness').state === 'needs' && ctl2.layers(g1).find(l => l.id === 'greenness').line.includes(NEEDS_GREENNESS) && !ctl2.layers(g1).find(l => l.id === 'erosion').on);
ctl2.setGreenness(ans); g1 = ctl2.attach(sc5({ status: 'read', model: modelOf }));
check('greenness with the answer: ready, squares given to the scene', ctl2.layers(g1).find(l => l.id === 'greenness').state === 'ready' && g1.drape?.polys?.length === 2, g1.drape?.polys?.length);
const keyOn = g1.paintKey; ctl2.setLayer('plants', false); const g2 = ctl2.attach(sc5({ status: 'read', model: modelOf }));
check('the plants switch off: the scene says to hide them and the paint key changes', g2.hidePlants === true && g2.paintKey !== keyOn && g1.hidePlants === false);
ctl2.setLayer('plants', true); check('the plants switch on again', ctl2.attach(sc5({ status: 'read', model: modelOf })).hidePlants === false);
console.log(`layers3d: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
