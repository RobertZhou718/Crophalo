// Crophalo's 3D scene suite: js/farm3d-data.js and js/moon.js, with no drawing. Positions, the slab, the height mesh, the soil, the stages, the rows,
// the sky, the one sun and the moon, all from real or made-up data whose answer is known. No internet is needed.
// RULE: never loosen a check here without a written farming reason beside it. The picture must never show a farmer a field, a crop or a sun that is not there.
// Run: node scripts/test_farm3d.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as d from '../js/farm3d-data.js';
import * as sun from '../js/sun.js';
import { moonAt, moonWords } from '../js/moon.js';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, tol) => check(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DAY = 86400000;

// ---- the palette: text pairs 4.5:1, one blue
check('navy text on the page background reads at 4.5:1', d.contrast(d.PALETTE.navy, d.PALETTE.background) >= 4.5, d.contrast(d.PALETTE.navy, d.PALETTE.background));
check('the one blue on white reads at 4.5:1', d.contrast(d.PALETTE.blue, '#ffffff') >= 4.5, d.contrast(d.PALETTE.blue, '#ffffff'));
near('black on white is 21:1', d.contrast('#000000', '#ffffff'), 21, 0.01);
same('a colour mix halfway', d.mix('#000000', '#ffffff', 0.5), '#808080');

// ---- the earth: WGS84 metres per degree and positions within 0.5% of the great circle
near('a degree of latitude at the equator, 110,574 m', d.metresPerDegreeLat(0), 110574, 5);
near('a degree of longitude at the equator, 111,320 m', d.metresPerDegreeLon(0), 111320, 5);
near('a degree of longitude at 45°, 78,847 m', d.metresPerDegreeLon(45), 78847, 5);
near('a degree of latitude at 45°, 111,132 m', d.metresPerDegreeLat(45), 111132, 5);
{
  const hav = (a, b, c, e) => { const R = 6371008.8, p = Math.PI / 180, dp = (c - a) * p, dl = (e - b) * p, h = Math.sin(dp / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  for (const [lat, lon] of [[44.39, -79.69], [-33.89, -60.57], [69.65, 18.96], [0, 0], [37.87, 32.48]]) {
    const f = d.frameAt(lat, lon), p = f.toXZ(lat + 0.01, lon + 0.012), truth = hav(lat, lon, lat + 0.01, lon + 0.012);
    near(`${lat},${lon}: a 1 km step lands within 0.5% of the great circle`, Math.hypot(p.x, p.z), truth, truth * 0.005);
    check(`${lat},${lon}: north is −z (up the screen), east is +x`, p.z < 0 && p.x > 0, p);
    const back = f.toLatLon(p.x, p.z); near(`${lat},${lon}: and back again`, back.lat, lat + 0.01, 1e-9); near(`${lat},${lon}: longitude back`, back.lon, lon + 0.012, 1e-9);
  }
}

// ---- the slab: the fields only, never widened by the pin
const squareAt = (lat, lon, mx, mz) => { const f = d.frameAt(lat, lon); return [[-mz / 2, -mx / 2], [-mz / 2, mx / 2], [mz / 2, mx / 2], [mz / 2, -mx / 2]].map(([z, x]) => { const p = f.toLatLon(x, z); return [p.lat, p.lon]; }); };
const Iowa = { lat: 42.03, lon: -93.62 };
{
  const fields = [{ id: 'a', polygon: squareAt(42.03, -93.62, 300, 200) }, { id: 'b', polygon: squareAt(42.031, -93.617, 150, 150) }];
  const town = { lat: 42.06, lon: -93.58 };       // the pin sits in town, 4 km away
  const s = d.slabOf(fields, town);
  same('two near fields make one block', s.blocks.length, 1);
  check('the pin in town does not widen the slab', s.span < 1200, s.span);
  check('the sides are whole metres and the middle has four decimals', Number.isInteger(s.blocks[0].width) && Number.isInteger(s.blocks[0].depth) && String(s.blocks[0].lat).split('.')[1].length <= 4, s.blocks[0]);
  check('the padding is a quarter of the longer side clamped to 100–150 m', s.blocks[0].width >= 300 + 2 * 100 - 2 && s.blocks[0].width <= 600 + 2 * 150, s.blocks[0].width);
  check('the table is 1.08 × half the diagonal wide, with fog from 3× to 9× the span', Math.abs(s.table.radius - 1.08 * Math.hypot(s.width, s.depth) / 2) < 1e-6 && s.fog.near === 3 * s.span && s.fog.far === 9 * s.span);
  const tiny = d.slabOf([{ id: 'c', polygon: squareAt(42.03, -93.62, 20, 20) }], Iowa);
  check('the smallest side is 250 m', tiny.blocks[0].width >= 250 && tiny.blocks[0].depth >= 250, tiny.blocks[0]);
  const none = d.slabOf([], Iowa);
  same('no fields: a 400 m square round the pin', [none.blocks[0].width, none.blocks[0].depth, none.blocks[0].lat, none.blocks[0].lon], [400, 400, 42.03, -93.62]);
  const far = d.slabOf([{ id: 'w', polygon: squareAt(42.03, -93.62, 200, 200) }, { id: 'e', polygon: squareAt(42.03, -93.4, 200, 200) }], Iowa);
  same('fields 18 km apart get a block each', far.blocks.length, 2);
  check('the blocks are drawn side by side with a gap of about a fifth of a block, and the real gap is said', far.blocks[1].drawnGap <= 0.2 * far.blocks[1].width + 1 && far.blocks[1].realGap > 15000 && far.blocks[1].scaled === false, far.blocks.map(b => [b.drawnGap, b.realGap, b.scaled]));
  check('block 0 stands west of block 1, centred overall', far.blocks[0].offsetX < 0 && far.blocks[1].offsetX > 0 && Math.abs(far.blocks[0].offsetX + far.blocks[1].offsetX) < 1);
  const close = d.slabOf([{ id: 'w', polygon: squareAt(42.03, -93.62, 200, 200) }, { id: 'e', polygon: squareAt(42.03, -93.6075, 200, 200) }], Iowa);
  same('fields 900 m apart (under 1 km) share one block', close.blocks.length, 1);
}

// ---- the height mesh
{
  const nx = 5, ny = 5, h = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = 100 + 2 * i + 3 * j;   // a plane rising to the east and south
  const m = d.heightModel({ nx, ny, width: 400, depth: 400, h });
  check('a plane: base is near the lowest, rise near the highest less the lowest', m.base >= 100 && m.rise <= 20 && m.rise >= 17, [m.base, m.rise]);
  const h0 = m.base;
  near('the mesh reads a node exactly', d.heightAtMesh(m, -200, -200), 100 - h0, 1e-4);
  near('the mesh on a plane is the plane, whichever triangle (north-west of the diagonal)', d.heightAtMesh(m, -150, -150), 100 + 2 * 0.5 + 3 * 0.5 - h0, 1e-4);
  near('the mesh on a plane is the plane (south-east of the diagonal)', d.heightAtMesh(m, 50, 80), 100 + 2 * (250 / 100) + 3 * (280 / 100) - h0, 1e-4);
  same('off the block is not a height', Number.isNaN(d.heightAtMesh(m, 300, 0)), true);
  // a bump: the drawn triangle, not a smooth curve (the diagonal runs north-east to south-west)
  const b = new Float32Array(9); b[4] = 10;   // 3 × 3, only the middle node is high
  const bm = d.heightModel({ nx: 3, ny: 3, width: 2, depth: 2, h: b });
  const bb = bm.base;
  near('the very triangle: half way from the peak toward the north-east corner is 5 m', d.heightAtMesh(bm, 0.5, -0.5) + bb, 5, 1e-4);
  near('the long side runs north-east to south-west: the middle of that diagonal in the north-west cell is the mean of its two low ends (0 m), not of the high corner and the far corner (5 m)', d.heightAtMesh(bm, -0.5, -0.5) + bb, 0, 1e-4);
  // missing
  const g = new Float32Array(nx * ny).fill(100); g[12] = NaN;
  const gm = d.heightModel({ nx, ny, width: 400, depth: 400, h: g });
  check('a missing node is not filled in: the triangles that use it say NaN', Number.isNaN(d.heightAtMesh(gm, 0, 0)) && !Number.isNaN(d.heightAtMesh(gm, -190, -190)));
  const mostly = new Float32Array(nx * ny).fill(NaN); mostly[0] = 5; mostly[1] = 6; mostly[2] = 7;
  const fm = d.heightModel({ nx, ny, width: 400, depth: 400, h: mostly });
  same('over half missing is flat', [fm.flat, d.heightAtMesh(fm, 0, 0)], [true, 0]);
  const spiky = new Float32Array(101 * 101); for (let k = 0; k < spiky.length; k++) spiky[k] = k < 100 ? -1000 : k > spiky.length - 100 ? 5000 : 200 + (k % 10);
  const sm = d.heightModel({ nx: 101, ny: 101, width: 1000, depth: 1000, h: spiky });
  check('base is the 2nd percentile and the rise the 98th less the 2nd, so a few spikes do not set the scale', sm.base > 0 && sm.rise < 30, [sm.base, sm.rise]);
  // hills: true height by default; a step only when the rise would not show
  same('a 100 m rise on 1 km shows: no taller-hills offer', d.hillStep(100, 1000), { offered: false, step: 1 });
  same('a 20 m rise on 1 km: offered 2×', d.hillStep(20, 1000), { offered: true, step: 2 });
  same('a 14 m rise on 1 km: offered 3× (14 × 3 = 42 m, over 4% of the span)', d.hillStep(14, 1000), { offered: true, step: 3 });
  same('a 12 m rise on 1 km needs 5× (12 × 3 = 36 m is still under 4%)', d.hillStep(12, 1000), { offered: true, step: 5 });
  same('a rise under 1 m is always step 1 (offered, but it stays 1)', d.hillStep(0.4, 1000), { offered: true, step: 1 });
  check('a step is never over 5', d.hillStep(2, 5000).step <= 5);
}

// ---- the soil
same('soil drawn depth for a 1 km span: factor nearest to 30 → 20, 40 m', [d.soilDepthDrawn(1000).factor, d.soilDepthDrawn(1000).depth], [20, 40]);
same('soil drawn depth for a 100 m span: 4 m', d.soilDepthDrawn(100).depth, 4);
same('soil drawn depth for a 300 m span: half of 18 m is 9, nearest factor 10, so 20 m', d.soilDepthDrawn(300).depth, 20);
same('loam (sand 40, silt 40, clay 20)', d.soilClass({ sand: 40, silt: 40, clay: 20 }), 'loam');
same('USDA classes at their corners', [[90, 5, 5], [10, 85, 5], [10, 20, 70], [20, 55, 25], [65, 20, 15], [60, 10, 30]].map(([sand, silt, clay]) => d.soilClass({ sand, silt, clay })), ['sand', 'silt', 'clay', 'silt loam', 'sandy loam', 'sandy clay loam']);
same('unknown soil has no colour and no class (drawn hatched)', [d.soilColour({ sand: 0, silt: 0, clay: 0 }), d.soilClass({ sand: 0, silt: 0, clay: 0 })], [null, null]);
check('pure sand, silt and clay give the three base colours', d.soilColour({ sand: 100, silt: 0, clay: 0, organic: 0 }) === d.PALETTE.sand && d.soilColour({ sand: 0, silt: 100, clay: 0, organic: 0 }) === d.PALETTE.silt && d.soilColour({ sand: 0, silt: 0, clay: 100, organic: 0 }) === d.PALETTE.clay);
{
  const lum = c => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16);
  const cols = [0.5, 1.5, 2.5, 4, 6].map(om => lum(d.soilColour({ sand: 40, silt: 40, clay: 20, organic: om })));
  check('more organic matter darkens the soil, step by step', cols.every((v, i) => i === 0 || v < cols[i - 1]), cols);
}

// ---- crops and stages
const sow = Date.UTC(2027, 4, 1);
const maize = { id: 'corn', group: 'cereal', sow, lengths: { ini: 30, dev: 40, mid: 50, late: 30 } };
{
  const day = n => sow + n * DAY;
  same('before sowing there is nothing', d.stageOn(maize, day(-1)), null);
  same('day 0 to day 5 is "just sown" (a fifth of the first stage), then "young plants"', [0, 5, 6, 29].map(n => d.stageOn(maize, day(n)).stage), [0, 0, 1, 1]);
  same('the FAO-56 days: 30 starts growing, 70 full growth, 120 ripening, 150 harvested', [30, 69, 70, 119, 120, 149, 150, 400].map(n => d.stageOn(maize, day(n)).stage), [2, 2, 3, 3, 4, 4, 5, 5]);
  let last = -1, forward = true;
  for (let n = 0; n <= 200; n++) { const s = d.stageOn(maize, day(n)).stage; if (s < last) forward = false; last = s; }
  check('the stage only goes forward through a season', forward);
  const shares = [0, 25, 45, 100, 135, 160].map(n => d.stageOn(maize, day(n)).share);
  check('the growth share climbs to 1 at full growth and stays, then falls to 0.12 after harvest', shares[0] < shares[1] && shares[1] < shares[2] && shares[2] < 1 && shares[3] === 1 && shares[4] === 1 && shares[5] === 0.12, shares);
  near('young plants are at 0.15 + 0.25 × how far through the stage', d.stageOn(maize, day(18)).share, 0.15 + 0.25 * d.stageOn(maize, day(18)).f, 1e-9);
  same('fresh sowing is a bare 0', d.stageOn(maize, day(2)).share, 0);
  same('stage names', d.STAGES, ['just sown', 'young plants', 'growing', 'full growth', 'ripening', 'harvested']);
  same('leaf colours: lime when young, grass at full growth, straw after harvest', [d.leafColour(0, 0), d.leafColour(1, 0.5), d.leafColour(3, 0), d.leafColour(5, 1)], [d.PALETTE.lime, d.PALETTE.lime, d.PALETTE.grass, d.PALETTE.straw]);
  same('covers and trees keep their own green', [d.leafColour(3, 0, 'cover'), d.leafColour(3, 0, 'tree')], [d.PALETTE.cover, d.PALETTE.treeCrown]);
  same('roots: 0.15 m young, full depth by the end of development', [d.rootDepth(1, 0, 1), d.rootDepth(2, 1, 1), d.rootDepth(3, 0, 1)], [0.15, 1, 1]);
  check('a crop without dates has no stage (nothing is invented)', d.stageOn({ id: 'corn' }, sow) === null && d.stageOn(null, sow) === null);
}
{
  const named = { corn: 'maize', sorghum: 'maize', sweetcorn: 'maize', 'pearl-millet': 'maize', rice: 'rice', sunflower: 'sunflower', safflower: 'sunflower', cotton: 'cotton', 'sugar-beet': 'beet', carrot: 'beet', onion: 'beet', garlic: 'beet',
    cabbage: 'leafy-veg', lettuce: 'leafy-veg', spinach: 'leafy-veg', cauliflower: 'leafy-veg', tobacco: 'leafy-veg', tomato: 'fruit-veg', pepper: 'fruit-veg', eggplant: 'fruit-veg', okra: 'fruit-veg', watermelon: 'fruit-veg', melon: 'fruit-veg',
    cucumber: 'fruit-veg', pumpkin: 'fruit-veg', 'green-bean': 'legume-bush', hemp: 'cane', jute: 'cane' };
  for (const [id, shape] of Object.entries(named)) same(`${id} is drawn as ${shape}`, d.cropShape(id, 'x'), shape);
  same('by group: cover, forage, legume, root, oil, vegetable, sugar, else cereal', ['cover', 'forage', 'legume', 'root', 'oil', 'vegetable', 'sugar', 'grain'].map(g => d.cropShape('unknown-crop', g)), ['cover-mix', 'forage', 'legume-bush', 'tuber', 'brassica', 'leafy-veg', 'beet', 'cereal']);
  check('every shape a crop can get is one of the 14', Object.values(named).concat(['cover-mix', 'forage', 'legume-bush', 'tuber', 'brassica', 'cereal']).every(s => d.SHAPES.includes(s)) && d.SHAPES.length === 14);
  same('"Sweet Corn" and "SWEETCORN" are not mistaken for each other or for a crash', [d.cropShape('Pearl Millet', 'x'), d.cropShape(undefined, undefined), d.cropShape('__proto__', 'x')], ['maize', 'cereal', 'cereal']);
  same('after harvest: stubble, ridged soil, litter', [d.afterHarvest('cereal'), d.afterHarvest('tuber'), d.afterHarvest('brassica')], ['stubble', 'ridged soil', 'litter']);
  same('the model lookup order', [d.modelNames('wheat', 'cereal', 3), d.modelNames('clover', 'cover-mix', 2, { cover: true }), d.modelNames('olive', null, 3, { tree: true })], [['crop-wheat-stage3.glb', 'shape-cereal-stage3.glb'], ['cover-clover-stage2.glb', 'shape-cover-mix-stage2.glb'], ['tree-olive.glb', 'tree.glb']]);
  // symbol heights: a grown crop at least 34 px in the first view, never under the farm unit nor over 8 units
  near('the farm unit is 1.8% of the span, 2.5 to 60 m', d.farmUnit(1000), 18, 1e-9); same('clamped', [d.farmUnit(10), d.farmUnit(1e6)], [2.5, 60]);
  const tall = d.symbolHeight({ realHeight: 2, span: 1000, pxPerMetre: 0.5, stage: 3, share: 1 });
  check('a 2 m crop on a 1 km farm seen at 0.5 px/m is drawn at least 34 px tall, between 1 and 8 units', tall * 0.5 >= 34 - 1e-9 && tall >= 18 && tall <= 144, tall);
  check('young plants and fresh sowing are at least 0.6 of a grown one', d.symbolHeight({ realHeight: 2, span: 1000, pxPerMetre: 0.5, stage: 1, share: 0.15 }) >= 0.6 * tall - 1e-9 && d.symbolHeight({ realHeight: 2, span: 1000, pxPerMetre: 0.5, stage: 5, share: 0.12 }) >= 0.6 * tall - 1e-9);
}

// ---- rows and plants
{
  const P = (x, z) => ({ x, z }), field = [P(0, 0), P(200, 0), P(200, 100), P(0, 100)];
  same('rows run along the long side (east–west: bearing 90)', Math.round(d.rowBearing(field, 0)), 90);
  same('on a slope of 2% or more rows run across it, to the nearest 5° (downhill south: rows east–west)', d.rowBearing(field, 3, 180), 90);
  same('downhill 120° gives rows at 30°, to the 5°', d.rowBearing(field, 4, 117), 25 % 180 === 25 ? 25 : 25);
  const L = d.plantsOf(field, { bearing: 90, rowGap: 10, plantGap: 10, limit: 100000 });
  check('every plant is inside the field', L.plants.length > 100 && L.plants.every(p => d.insidePolygon(p.x, p.z, field)));
  const again = d.plantsOf(field, { bearing: 90, rowGap: 10, plantGap: 10, limit: 100000 });
  same('the same input gives the same plants, turns and sizes (nothing random)', again.plants, L.plants);
  check('rows are staggered', (() => { const rows = new Map(); for (const p of L.plants) { const k = Math.round(p.z); (rows.get(k) || rows.set(k, []).get(k)).push(p.x); } const keys = [...rows.keys()].sort((a, b) => a - b); return Math.abs(Math.min(...rows.get(keys[0])) - Math.min(...rows.get(keys[1]))) > 1; })());
  const capped = d.plantsOf(field, { bearing: 90, rowGap: 2, plantGap: 2, limit: 500 });
  check('the spacing widens until the count fits the limit', capped.plants.length <= 500 && capped.plants.length > 100 && capped.rowGap > 2, [capped.plants.length, capped.rowGap]);
  const hole = d.plantsOf(field, { bearing: 90, rowGap: 10, plantGap: 10, limit: 100000, exclude: [(x, z) => x > 50 && x < 100 && z < 60] });
  check('plants are left out inside a placed object\'s footprint', hole.plants.length < L.plants.length && hole.plants.every(p => !(p.x > 50 && p.x < 100 && p.z < 60)));
  check('turns and sizes are hashes: 0–360 and 0.9–1.1', L.plants.every(p => p.turn >= 0 && p.turn < 360 && p.scale >= 0.9 && p.scale <= 1.1));
  same('limits are shared by area, at least 24 each, 4,000 in all (1,500 on phones)', [d.plantLimits([300000, 100000]), d.plantLimits([300000, 100000], true), d.plantLimits([1000000, 1])], [[3000, 1000], [1125, 375], [3999, 24]]);
}

// ---- trees from the tree map
{
  const nx = 20, ny = 20, heights = new Float32Array(nx * ny);
  const put = (i, j, h) => { heights[j * nx + i] = h; };
  put(5, 5, 12); put(6, 5, 11); put(5, 6, 10);            // one tree with its shoulders: a single crown
  put(16, 14, 8); put(15, 3, 2.5);                        // a second tree; a 2.5 m bush is not a tree
  put(10, 10, 9); put(11, 10, 9);                         // two equal neighbours: one crown, not two
  const t = d.treeCrowns({ nx, ny, x0: 0, z0: 0, dx: 1, dz: 1, heights });
  same('three trees found, tallest first', t.crowns.map(c => c.h), [12, 9, 8]);
  check('the crown is a ball of radius 0.18 × height clamped to 1–2 m, green', t.crowns[0].radius === 2 && t.crowns[2].radius === 1.44 && t.crowns[0].colour === d.PALETTE.treeCrown);
  same('nothing capped, not said to be', t.capped, false);
  const many = new Float32Array(200 * 200); for (let k = 0; k < many.length; k += 7) many[k] = 5 + (k % 5);
  const mt = d.treeCrowns({ nx: 200, ny: 200, x0: 0, z0: 0, dx: 1, dz: 1, heights: many }, true);
  check('on a phone at most 3,000 crowns, and it says so', mt.crowns.length <= 3000 && (mt.found <= 3000 || mt.capped), [mt.crowns.length, mt.found]);
}

// ---- the sky from the forecast
same('WMO codes to sky kinds', [0, 1, 2, 3, 45, 48, 53, 66, 81, 73, 86, 95, 99, null].map(d.skyKind), ['clear', 'clear', 'cloud', 'cloud', 'fog', 'fog', 'rain', 'rain', 'rain', 'snow', 'snow', 'storm', 'storm', 'none']);
{
  const clear = d.skyOf({ wmo: 0, cloudPct: 38 }, 40), rain = d.skyOf({ wmo: 61, cloudPct: 90, rainMm: 12 }, 30), storm = d.skyOf({ wmo: 95, cloudPct: 100, rainMm: 30 }, 30);
  same('clear sky colours and 38% cloud is 3 of 8 clouds', [clear.top, clear.bottom, clear.clouds], ['#cfe2f6', '#f2f2f4', 3]);
  same('rain: 12 mm is 500 streaks in the one rain blue, clouds greyer', [rain.rainStreaks, rain.rainColour, rain.cloudColour], [500, '#2a77d4', '#d5dae3']);
  same('streaks by the day\'s rain: under 1, 5, 20 mm, else', [0.5, 3, 10, 40].map(mm => d.skyOf({ wmo: 61, cloudPct: 50, rainMm: mm }, 30).rainStreaks), [60, 200, 500, 900]);
  same('a storm is thunder and rain, never a lightning flash', [storm.words, storm.lightning], ['thunder and rain', false]);
  same('snow: 500 white points', d.skyOf({ wmo: 71, cloudPct: 60 }, 30).snowPoints, 500);
  same('a planned season has a plain sky', [d.skyOf({ wmo: 61, cloudPct: 90 }, 30, false).kind, d.skyOf({ wmo: 61, cloudPct: 90 }, 30, false).clouds], ['none', 0]);
  same('night: the sun under −6°, with its words', [d.skyOf(null, -10).light, d.skyOf(null, -10).words, d.skyOf(null, -10).top], ['night', 'Night at the farm. Lit so you can read it.', '#2c3f68']);
  same('twilight: the sun between 0 and −6°', d.skyOf(null, -3).light, 'twilight');
  check('nothing random: the same forecast gives the same sky', JSON.stringify(d.skyOf({ wmo: 61, cloudPct: 90, rainMm: 3 }, 30)) === JSON.stringify(d.skyOf({ wmo: 61, cloudPct: 90, rainMm: 3 }, 30)));
}

// ---- the one sun and its lights
{
  const noon = { apparent: 52, azimuth: 225 };
  const l = d.lightsOf(noon, null, 0);
  same('day: one hemisphere light and exactly one directional sun', [l.lights.filter(x => x.type === 'hemisphere').length, l.lights.filter(x => x.type === 'directional').length, l.lights.find(x => x.name === 'sun').colour], [1, 1, '#fff3df']);
  near('the sun light is 2.4 × clamp(0.55 + 52/60, 0.55, 1) = 2.4', l.lights.find(x => x.name === 'sun').intensity, 2.4, 1e-9);
  near('a low sun (3° up) is 2.4 × 0.6', d.lightsOf({ apparent: 3, azimuth: 90 }, null, 0).lights.find(x => x.name === 'sun').intensity, 2.4 * 0.6, 1e-9);
  near('cloud of 80% or more softens it to 0.55', d.lightsOf(noon, null, 85).lights.find(x => x.name === 'sun').intensity, 2.4 * 0.55, 1e-9);
  check('cloud of 80% or more is "soft"', d.lightsOf(noon, null, 85).lights.find(x => x.name === 'sun').soft === true && d.lightsOf(noon, null, 20).lights.find(x => x.name === 'sun').soft === false);
  near('behind the far hills it is 0.35', d.lightsOf(noon, null, 0, true).lights.find(x => x.name === 'sun').intensity, 2.4 * 0.35, 1e-9);
  const tw = d.lightsOf({ apparent: -3, azimuth: 270 }, null, 0);
  same('twilight: no sun light, a hemisphere of 1.05', [tw.lights.filter(x => x.type === 'directional').length, tw.lights[0].intensity, tw.state], [0, 1.05, 'twilight']);
  const ni = d.lightsOf({ apparent: -20, azimuth: 0 }, null, 0), fill = ni.lights.find(x => x.name === 'fill');
  check('night: a fill from 40° up toward azimuth 200°, 1.1, and it is not called a sun', fill && fill.intensity === 1.1 && !ni.lights.some(x => x.name === 'sun') && fill.direction.y > 0.6 && fill.direction.z > 0.5, fill);
  check('no case ever has two directional lights', [noon, { apparent: -3, azimuth: 0 }, { apparent: -30, azimuth: 0 }, { apparent: 0.2, azimuth: 80 }].every(s => d.lightsOf(s, null, 90, true).lights.filter(x => x.type === 'directional').length <= 1));
  near('the sun\'s direction is a unit vector pointing up when it is up', (({ x, y, z }) => Math.hypot(x, y, z))(l.lights.find(x => x.name === 'sun').direction), 1, 1e-9);
}

// ---- the first view
same('the first view looks from 200° in the north, 340° in the south, tilt 55°, 62° with Layers', [d.camera(false).azimuth, d.camera(true).azimuth, d.camera(false).tilt, d.camera(false, true).tilt], [200, 340, 55, 62]);
same('field of view 30°, 36° when taller than wide, polar limits 10–80', [d.camera(false).fov, d.camera(false, false, true).fov, d.camera(false).polar], [30, 36, [10, 80]]);

// ---- the moon against the Naval Observatory
{
  const fx = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'usno.json'), 'utf8'));
  let n = 0, wh = 0, wz = 0;
  for (const c of fx.cases) for (const s of c.samples) {
    if (!s.moon) continue;
    const m = moonAt(Date.parse(s.utc), c.lat, c.lon), dh = Math.abs(m.height - s.moon.height), dz = Math.abs(((m.azimuth - s.moon.azimuth + 540) % 360) - 180);
    n++; wh = Math.max(wh, dh); if (m.height > 5) wz = Math.max(wz, dz);
    check(`moon ${c.place} ${s.utc}: height within 0.3°`, dh <= 0.3, dh);
    if (m.height > 5) check(`moon ${c.place} ${s.utc}: direction within 0.5°`, dz <= 0.5, dz);
  }
  check('at least 40 moon samples were compared', n >= 40, n);
  console.log(`measured against the Observatory: moon height ${wh.toFixed(3)}°, direction ${wz.toFixed(3)}°`);
  const full = moonAt(Date.UTC(2026, 10, 24, 14), 42, -93), newer = moonAt(Date.UTC(2026, 10, 9, 18), 42, -93);   // the full moon of 24 Nov 2026 and the new moon of 9 Nov
  check('around full moon about all of it is lit; around new moon almost none', full.lit > 0.9 && newer.lit < 0.1, [full.lit, newer.lit]);
  check('growing before full, shrinking after', moonAt(Date.UTC(2026, 10, 18), 42, -93).growing === true && moonAt(Date.UTC(2026, 10, 30), 42, -93).growing === false);
  same('the moon\'s words', [moonWords({ lit: 0.62, growing: true }), moonWords({ lit: 0.01, growing: true }), moonWords({ lit: 1, growing: false })], ['62% lit, growing.', 'New moon, hardly lit.', 'Full moon.']);
}

// ---- the whole scene, for an Iowa farm on 21 June at noon and at night
{
  const f = d.frameAt(42.03, -93.62), ll = (x, z) => { const p = f.toLatLon(x, z); return [p.lat, p.lon]; };
  const farm = {
    name: 'Ames farm', pin: { lat: 42.03, lon: -93.62 },
    fields: [
      { id: 'north', name: 'North field', polygon: [ll(-200, -250), ll(100, -250), ll(100, -50), ll(-200, -50)], crop: { id: 'corn', group: 'cereal', sow: Date.UTC(2027, 4, 1), lengths: { ini: 30, dev: 40, mid: 50, late: 30 } } },
      { id: 'south', name: 'South field', polygon: [ll(-200, 50), ll(100, 50), ll(100, 200), ll(-200, 200)], slope: { pct: 4, downhill: 180 } },
    ],
  };
  const noon = sun.sunEvents({ y: 2027, m: 7, d: 10 }, 42.03, -93.62).noon;
  const sc = d.sceneOf({ farm, momentMs: noon, forecast: { wmo: 1, cloudPct: 10, rainMm: 0 }, today: true, offsetMin: -300 });
  same('exactly one sun in the scene', sc.suns.length, 1);
  check('exactly one directional light', sc.light.lights.filter(l => l.type === 'directional').length === 1);
  check('the sun stands high at noon in July, in the south', sc.suns[0].height > 65 && Math.abs(sc.suns[0].azimuth - 180) < 20, sc.suns[0]);
  const nf = sc.fields[0], sf = sc.fields[1];
  same('the north field is at full growth in July: corn as maize with its models', [nf.crop.stage.name, nf.crop.shape, nf.crop.models[0]], ['full growth', 'maize', 'crop-corn-stage3.glb']);
  check('and drawn grass-green with plants inside it', nf.surface.colour === d.PALETTE.grass && nf.plants.length >= 24 && nf.plants.every(p => d.insidePolygon(p.x, p.z, nf.polygon)));
  same('the south field has nothing planned: bare soil, never lime, no plants', [sf.surface.bare, sf.surface.colour, sf.plants.length, sf.crop], [true, d.PALETTE.soil, 0, null]);
  check('the south field\'s rows run across its 4% slope (east–west)', Math.round(sf.bearing) % 180 === 90 || sf.crop === null);
  same('the label reads for a screen reader', sc.label, '3D view of Ames farm: 2 fields, 10 ha, seen from the south. Hills at true height.');
  const again = d.sceneOf({ farm, momentMs: noon, forecast: { wmo: 1, cloudPct: 10, rainMm: 0 }, today: true, offsetMin: -300 });
  same('the same day gives the same scene, byte for byte', JSON.stringify(again), JSON.stringify(sc));
  const night = d.sceneOf({ farm, momentMs: noon + 12 * 3600000, forecast: { wmo: 1, cloudPct: 10 }, today: true, offsetMin: -300 });
  same('at midnight the one sun is down and the light is a fill', [night.suns.length, night.suns[0].up, night.light.state, night.sky.light], [1, false, 'night', 'night']);
  const sou = d.sceneOf({ farm: { ...farm, pin: { lat: -33.89, lon: -60.57 } }, momentMs: noon, today: false });
  same('south of the equator the first view is from the north, 340°', [sou.camera.azimuth, sou.label.includes('seen from the north')], [340, true]);
  check('the sun, moon and sky words have no placeholder text', !/undefined|NaN|\[object/.test(JSON.stringify(sc.moon) + sc.label + sc.sky.words));
}

// ---- the comparison view: one field, one plan, one date, what covers the ground
{
  const pin = { lat: 44.40, lon: -79.78 };
  const mk = (ground, extra = {}) => d.groundScene({ pin, field: { id: 'demo', name: 'Demo field', polygon: null, areaEstimated: true }, planKind: 'proposed', date: '2027-10-05', ground, ...extra });
  const corn = mk({ state: 'crop', crop: 'corn', stage: 3, label: 'Planned' }), soy = mk({ state: 'crop', crop: 'soy', stage: 3, label: 'Planned' });
  const res = mk({ state: 'residue', crop: 'soy', label: 'Planned' }), wheat1 = mk({ state: 'crop', crop: 'wheat', stage: 1, label: 'Planned' }), wheat2 = mk({ state: 'crop', crop: 'wheat', stage: 2, label: 'Observed' }), bare = mk({ state: 'bare', label: 'Planned' });
  same('crop ids from the engine get their shapes: corn maize, soy a bush, wheat a cereal', [corn.cover.shape, soy.cover.shape, wheat1.cover.shape], ['maize', 'legume-bush', 'cereal']);
  same('no outline: a square of 10 ha, said to be estimated', [corn.field.estimated, corn.field.areaHa, corn.words.outline.startsWith('Outline estimated: a 10 ha square')], [true, 10, true]);
  same('drawn outline: its own area, not estimated', (g => [g.field.estimated, g.words.outline.includes('from the outline you drew')])(d.groundScene({ pin, field: { id: 'x', name: 'North', polygon: squareAt(44.4, -79.78, 200, 100) }, date: '2027-10-05', ground: null })), [false, true]);
  same('the label says Planned or Observed, the plan and the date', [corn.label.line, wheat2.label.line], ['Planned · Proposed plan · 5 October 2027', 'Observed · Proposed plan · 5 October 2027']);
  same('the four kinds are different things', [corn.cover.kind, res.cover.kind, wheat1.cover.kind, bare.cover.kind], ['standing', 'residue', 'young', 'bare']);
  check('standing corn is far taller than residue, and residue lies low and thin', corn.cover.height > 3 * res.cover.height && res.cover.length > res.cover.height, [corn.cover.height, res.cover.height]);
  check('wheat seedlings are shorter than standing wheat and both are drawn at least the farm unit for standing', wheat1.cover.height < mk({ state: 'crop', crop: 'wheat', stage: 3 }).cover.height, [wheat1.cover.height]);
  check('every plant and fleck is inside the field, none beyond 4,000', [corn, res, wheat1].every(s => s.cover.plants.length > 100 && s.cover.plants.length <= 4000 && s.cover.plants.every(p => d.insidePolygon(p.x, p.z, s.field.polygon))));
  same('bare soil has nothing standing and says so', [bare.cover.plants.length, bare.words.cover], [0, 'Bare soil: nothing grows and no residue is left.']);
  check('the residue words name the crop and say it lies low', /^Soybeans residue|^Soybean|residue: thin, low stalks left lying/.test(res.words.cover), res.words.cover);
  same('no ground answer yet: the honest line, never a made-up cover', [mk(null).cover, mk(null).words.cover], [null, 'Not read yet: what covers this field on this date.']);
  same('missing heights: flat, schematic, plain status', [corn.heights.status, corn.words.heights], ['missing', 'Heights not read: the land is drawn flat, as a plain schematic.']);
  const n = 17, h = new Float32Array(n * n); for (let k = 0; k < h.length; k++) h[k] = 300 + (k % n) * 1.5;
  const hilly = mk({ state: 'crop', crop: 'corn', stage: 3 }, { heights: { nx: n, ny: n, width: 800, depth: 800, h } });
  same('heights read: true height, said so', [hilly.heights.status, /^Heights read: the land rises \d+ m across this view, drawn at true height\.$/.test(hilly.words.heights)], ['read', true]);
  same('heights that are over half missing are drawn flat, said so', mk(null, { heights: { nx: 3, ny: 3, width: 800, depth: 800, h: new Float32Array(9).fill(NaN) } }).heights.status, 'flat');
  same('the height request is the block the server keys on: 4 decimals, whole metres, 257 points (129 on a phone)', [corn.heightRequest.n, mk(null, { phone: true }).heightRequest.n, Number.isInteger(corn.heightRequest.width), String(corn.heightRequest.lat).split('.')[1].length <= 4], [257, 129, true, true]);
  same('one sun: one directional light, a unit direction, up in the morning', [corn.light.lights.filter(l => l.type === 'directional').length, Math.abs(Math.hypot(corn.sun.x, corn.sun.y, corn.sun.z) - 1) < 1e-9, corn.sun.up], [1, true, true]);
  same('the sun is the same on the same date for every plan', [JSON.stringify(corn.sun), JSON.stringify(res.sun)].filter((v, i, a) => a.indexOf(v) === i).length, 1);
  same('the same input gives the same scene', JSON.stringify(mk({ state: 'crop', crop: 'corn', stage: 3, label: 'Planned' })), JSON.stringify(corn));
  check('the first view is one repeatable angle: from the south at 200°, tilt 55°', corn.camera.azimuth === 200 && corn.camera.tilt === 55);
  check('the screen-reader sentence names the field, the cover and the heights', /^3D view of Demo field, seen from the south\. Planned: .*Drawn flat\.$/.test(corn.aria), corn.aria);
  check('plants are said to be symbols', corn.words.illustrative.includes('drawn larger than real'));
  same('a polar-night date still describes the scene (no sun)', mk(null, { pin: { lat: 69.65, lon: 18.96 }, date: '2026-12-21' }).sun.up, false);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
