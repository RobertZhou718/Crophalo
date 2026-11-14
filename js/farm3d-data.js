// The 3D farm, part 1: the scene described from real data, with no drawing. The slab of land, the height mesh, the soil, each field's crop at its
// growth stage, the rows, the trees, the sky from the forecast, the one sun, the moon and the words. Part 2 (js/farm3d.js) only draws what this says.
// Pure: no page, no storage, no network, no randomness (every "random" turn or size is a hash of the plant's place, so a picture is the same every time).
// Units: 1 unit = 1 metre; +x east, +y up, +z south. Angles in degrees, azimuth clockwise from north.
// RULE: a missing value stays missing (drawn hatched or flat, and said so); it is never filled in from a neighbour.
// Checked by scripts/test_farm3d.mjs.
import { sunAt, sunEvents, clock, farmDate, compass8, heightWords, shadowRatio, shadowWords, lightDirection, ZENITH_CIVIL } from './sun.js';
import { moonAt, moonWords } from './moon.js';

// ---- the palette: one blue for marks, text pairs checked to 4.5:1
export const PALETTE = Object.freeze({
  navy: '#0b2545', grass: '#2e8b57', lime: '#7ed957', soil: '#a47148', straw: '#f2c14e', cover: '#43aa8b', gold: '#ffc233', water: '#2670cc',
  rain: '#2a77d4', background: '#f2f2f4', tabletop: '#ebe7df', treeCrown: '#3f9a4a', bark: '#7a5a3a', lowSpot: '#0a4fa8', blue: '#0a63d8',
  propMain: '#ffffff', propAccent: '#0b2545', glass: '#cfe3f5', hatch: '#ece6dc', hatchStripe: '#cfc4b2', slabBase: '#c9ccd3',
  sunArc: '#e0a526', sunPath: '#b06a00', moonDark: '#4a5878', moonLit: '#f6f1df', openGround: '#f2f2f4',
  sand: '#e3c88f', silt: '#b89b72', clay: '#8a5a3c',
});
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
export function contrast(a, b) {
  const lum = h => { const [r, g, bl] = hex(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const hash = (...n) => { let h = 2166136261; for (const v of n) { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; } return ((h >>> 0) % 100000) / 100000; };   // 0 up to 1, the same every time

// ---- the earth: WGS84 metres per degree, and a local frame round an origin
export const metresPerDegreeLat = lat => { const p = lat * Math.PI / 180; return 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p) - 0.0023 * Math.cos(6 * p); };
export const metresPerDegreeLon = lat => { const p = lat * Math.PI / 180; return 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p); };
export function frameAt(lat0, lon0) {
  const mLat = metresPerDegreeLat(lat0), mLon = metresPerDegreeLon(lat0);
  return {
    lat0, lon0,
    toXZ: (lat, lon) => ({ x: (lon - lon0) * mLon, z: -(lat - lat0) * mLat }),
    toLatLon: (x, z) => ({ lat: lat0 - z / mLat, lon: lon0 + x / mLon }),
  };
}

// ---- the slab: the fields only, never widened by the pin
const bboxOf = pts => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const [la, lo] of pts) { a = Math.min(a, la); b = Math.max(b, la); c = Math.min(c, lo); d = Math.max(d, lo); } return { south: a, north: b, west: c, east: d }; };
const round4 = v => Math.round(v * 1e4) / 1e4;
// Blocks of land: fields less than 1 km apart share a block; the block's middle is rounded to 4 decimals and its sides to whole metres (the key the height server uses).
export function blocksOf(fields, pin) {
  const usable = (fields || []).filter(f => Array.isArray(f.polygon) && f.polygon.length >= 3);
  if (!usable.length) {
    const lat = round4(pin.lat), lon = round4(pin.lon);
    return [{ lat, lon, width: 400, depth: 400, fieldIds: [], box: null }];
  }
  const boxes = usable.map(f => ({ f, b: bboxOf(f.polygon) }));
  const groups = boxes.map((_, i) => [i]);
  const gapBetween = (A, B) => {
    const mLat = metresPerDegreeLat((A.south + B.north) / 2), mLon = metresPerDegreeLon((A.south + B.north) / 2);
    const dx = Math.max(0, A.west - B.east, B.west - A.east) * mLon, dz = Math.max(0, A.south - B.north, B.south - A.north) * mLat;
    return Math.hypot(dx, dz);
  };
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      if (groups[i].some(a => groups[j].some(b => gapBetween(boxes[a].b, boxes[b].b) < 1000))) { groups[i] = groups[i].concat(groups[j]); groups.splice(j, 1); merged = true; break outer; }
    }
  }
  const blocks = groups.map(g => {
    const b = bboxOf(g.flatMap(i => boxes[i].f.polygon));
    const lat = (b.south + b.north) / 2, lon = (b.west + b.east) / 2;
    const w = (b.east - b.west) * metresPerDegreeLon(lat), d = (b.north - b.south) * metresPerDegreeLat(lat);
    const pad = clamp(Math.max(w, d) / 4, 100, 150);
    return { lat: round4(lat), lon: round4(lon), width: Math.round(Math.max(250, w + 2 * pad)), depth: Math.round(Math.max(250, d + 2 * pad)), fieldIds: g.map(i => boxes[i].f.id), box: b };
  });
  return blocks.sort((p, q) => p.lon - q.lon);
}
// Blocks are laid side by side west to east (north–south differences are not kept) with a drawn gap of this share of a block.
export const BLOCK_GAP_SHARE = 0.2;
// Blocks laid side by side west to east with a gap of about a fifth of a block; the real gap between neighbours is kept for the "Gap not to scale" line.
export function layoutBlocks(blocks) {
  let x = 0; const out = [];
  blocks.forEach((b, i) => {
    const prev = out[i - 1];
    const real = prev ? Math.max(0, (b.lon - prev.lon) * metresPerDegreeLon((b.lat + prev.lat) / 2) - (b.width + prev.width) / 2) : 0;
    const gap = prev ? Math.round(Math.min(real, BLOCK_GAP_SHARE * Math.max(b.width, prev.width))) : 0;
    x += prev ? prev.width / 2 + gap + b.width / 2 : 0;
    out.push({ ...b, offsetX: x, realGap: Math.round(real), drawnGap: gap, scaled: prev ? Math.abs(real - gap) < 1 : true });
  });
  const shift = out.length ? (out[0].offsetX + out.at(-1).offsetX) / 2 : 0;
  for (const b of out) b.offsetX -= shift;
  return out;
}
export function slabOf(fields, pin, soilDepthDrawn = 10, lowest = 0) {
  const blocks = layoutBlocks(blocksOf(fields, pin));
  const w = blocks.length ? blocks.at(-1).offsetX + blocks.at(-1).width / 2 - (blocks[0].offsetX - blocks[0].width / 2) : 400;
  const d = Math.max(...blocks.map(b => b.depth));
  const span = Math.max(w, d), half = Math.hypot(w, d) / 2;
  return {
    blocks, width: Math.round(w), depth: Math.round(d), span: Math.round(span),
    table: { radius: 1.08 * half, colour: PALETTE.tabletop, top: lowest - 1.6 * soilDepthDrawn },
    fog: { colour: PALETTE.background, near: 3 * span, far: 9 * span },
  };
}

// ---- the heights: one grid per block, a mesh of two triangles per cell with the long side north-east to south-west
export const GRID_SIZE = 257, GRID_SIZE_PHONE = 129;
const percentile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1) + 0.5)))];
// grid: {nx, ny, width, depth, h: Float32Array row-major from the north-west corner, NaN = missing}
export function heightModel(grid) {
  const finite = []; let missing = 0;
  for (let k = 0; k < grid.h.length; k++) { const v = grid.h[k]; if (v === v && v != null) finite.push(v); else missing++; }
  const share = missing / grid.h.length;
  if (share > 0.5 || finite.length < 4) return { ...grid, flat: true, missingShare: share, base: 0, rise: 0, cellX: grid.width / (grid.nx - 1), cellZ: grid.depth / (grid.ny - 1) };
  finite.sort((a, b) => a - b);
  const base = percentile(finite, 0.02), top = percentile(finite, 0.98);
  return { ...grid, flat: false, missingShare: share, base, rise: top - base, cellX: grid.width / (grid.nx - 1), cellZ: grid.depth / (grid.ny - 1) };
}
// The height of the very triangle that is drawn. x, z are metres from the block's middle. NaN where a corner is missing (nothing is filled in).
export function heightAtMesh(model, x, z) {
  if (model.flat) return 0;
  const fx = (x + model.width / 2) / model.cellX, fz = (z + model.depth / 2) / model.cellZ;
  if (fx < 0 || fz < 0 || fx > model.nx - 1 || fz > model.ny - 1) return NaN;
  const i = Math.min(model.nx - 2, Math.floor(fx)), j = Math.min(model.ny - 2, Math.floor(fz)), u = fx - i, v = fz - j;
  const at = (a, b) => model.h[b * model.nx + a] - model.base;
  const nw = at(i, j), ne = at(i + 1, j), sw = at(i, j + 1), se = at(i + 1, j + 1);
  // the diagonal runs from the north-east corner to the south-west corner: u + v = 1
  if (u + v <= 1) return nw + (ne - nw) * u + (sw - nw) * v;
  return se + (sw - se) * (1 - u) + (ne - se) * (1 - v);
}
// "Draw hills N× taller (not real)": offered only when the true rise would not show.
export function hillStep(rise, span) {
  if (!(rise >= 0)) return { offered: false, step: 1 };
  if (rise * 1 >= 0.04 * span) return { offered: false, step: 1 };
  if (rise < 1) return { offered: true, step: 1 };
  for (const s of [1, 1.5, 2, 3, 5]) if (rise * s >= 0.04 * span) return { offered: s > 1, step: Math.min(5, s) };
  return { offered: true, step: 5 };
}

// ---- the soil: the real top 2 m drawn D metres deep, colour from sand / silt / clay and organic matter, class by the USDA triangle
// The round exaggeration factors the drawn soil depth may take: a few steady choices, so a picture never gets an odd depth. Change them here.
export const DEPTH_FACTORS = [2, 5, 10, 20, 50, 100];
export function soilDepthDrawn(span) {
  const target = clamp(0.06 * span, 4, 60) / 2;
  const factor = DEPTH_FACTORS.reduce((best, f) => Math.abs(f - target) < Math.abs(best - target) ? f : best);
  return { factor, depth: 2 * factor };
}
// How much the organic matter (%) darkens the soil colour: upper edge of each band and the share of the colour kept. Bands are a working choice; change them here.
export const ORGANIC_STEPS = [[1, 1], [2, 0.9], [3, 0.8], [5, 0.68], [Infinity, 0.55]];
export function soilColour({ sand, silt, clay, organic }) {
  const total = sand + silt + clay;
  if (!(total > 0)) return null;
  const w = [sand / total, silt / total, clay / total], a = [hex(PALETTE.sand), hex(PALETTE.silt), hex(PALETTE.clay)];
  let rgb = [0, 1, 2].map(c => a[0][c] * w[0] + a[1][c] * w[1] + a[2][c] * w[2]);
  const dark = organic == null ? 1 : ORGANIC_STEPS.find(([edge]) => organic < edge)[1];
  return toHex(rgb.map(v => v * dark));
}
export function soilClass({ sand, silt, clay }) {
  const total = sand + silt + clay; if (!(total > 0)) return null;
  [sand, silt, clay] = [sand, silt, clay].map(v => v / total * 100);
  if (silt + 1.5 * clay < 15) return 'sand';
  if (silt + 1.5 * clay >= 15 && silt + 2 * clay < 30) return 'loamy sand';
  if ((clay >= 7 && clay < 20 && sand > 52 && silt + 2 * clay >= 30) || (clay < 7 && silt < 50 && silt + 2 * clay >= 30)) return 'sandy loam';
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return 'loam';
  if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) return 'silt loam';
  if (silt >= 80 && clay < 12) return 'silt';
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return 'sandy clay loam';
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return 'clay loam';
  if (clay >= 27 && clay < 40 && sand <= 20) return 'silty clay loam';
  if (clay >= 35 && sand > 45) return 'sandy clay';
  if (clay >= 40 && silt >= 40) return 'silty clay';
  if (clay >= 40 && sand <= 45 && silt < 40) return 'clay';
  return 'loam';
}

// ---- crops: six stages on the FAO-56 days, the leaf colour, the shape of each crop
export const STAGES = ['just sown', 'young plants', 'growing', 'full growth', 'ripening', 'harvested'];
export const GROWTH_SHARE = [0, f => 0.15 + 0.25 * f, f => 0.4 + 0.6 * f, 1, 1, 0.12];
const DAY = 86400000;
// "Just sown" lasts this share of the first stage, never under 3 days nor over 10 (a working choice: the stage is named but its length is not given).
export const FRESH_SOWING = { share: 0.2, minDays: 3, maxDays: 10 };
// crop: {sow: UTC ms of the sowing day, lengths: {ini, dev, mid, late} in days}. Returns the stage on a day: {stage, f (0..1 within it), share}, or null before sowing.
export function stageOn(crop, ms) {
  if (!crop || !Number.isFinite(crop.sow) || !crop.lengths) return null;
  const { ini, dev, mid, late } = crop.lengths, t = (ms - crop.sow) / DAY;
  if (t < 0) return null;
  const seed = clamp(ini * FRESH_SOWING.share, FRESH_SOWING.minDays, FRESH_SOWING.maxDays);      // fresh sowing: until the first leaves
  let stage, f;
  if (t < Math.min(seed, ini)) { stage = 0; f = t / Math.min(seed, ini); }
  else if (t < ini) { stage = 1; f = (t - seed) / Math.max(1, ini - seed); }
  else if (t < ini + dev) { stage = 2; f = (t - ini) / dev; }
  else if (t < ini + dev + mid) { stage = 3; f = (t - ini - dev) / mid; }
  else if (t < ini + dev + mid + late) { stage = 4; f = (t - ini - dev - mid) / late; }
  else { stage = 5; f = 1; }
  f = clamp(f, 0, 1);
  const g = GROWTH_SHARE[stage];
  return { stage, name: STAGES[stage], f, share: typeof g === 'function' ? g(f) : g };
}
export function leafColour(stage, f, kind = 'crop') {
  if (kind === 'cover') return PALETTE.cover;
  if (kind === 'tree') return PALETTE.treeCrown;
  if (stage <= 1) return PALETTE.lime;
  if (stage === 2) return mix(PALETTE.lime, PALETTE.grass, f);
  if (stage === 3) return PALETTE.grass;
  if (stage === 4) return mix(PALETTE.grass, PALETTE.straw, f);
  return PALETTE.straw;
}
export const rootDepth = (stage, f, full) => stage <= 1 ? 0.15 : stage === 2 ? 0.15 + (full - 0.15) * f : full;

export const SHAPES = ['cereal', 'maize', 'rice', 'legume-bush', 'brassica', 'sunflower', 'cotton', 'tuber', 'beet', 'cane', 'leafy-veg', 'fruit-veg', 'forage', 'cover-mix'];
const SHAPE_OF_CROP = {
  corn: 'maize', sorghum: 'maize', sweetcorn: 'maize', 'pearl-millet': 'maize', rice: 'rice', sunflower: 'sunflower', safflower: 'sunflower', cotton: 'cotton',
  'sugar-beet': 'beet', carrot: 'beet', onion: 'beet', garlic: 'beet', cabbage: 'leafy-veg', lettuce: 'leafy-veg', spinach: 'leafy-veg', cauliflower: 'leafy-veg', tobacco: 'leafy-veg',
  tomato: 'fruit-veg', pepper: 'fruit-veg', eggplant: 'fruit-veg', okra: 'fruit-veg', watermelon: 'fruit-veg', melon: 'fruit-veg', cucumber: 'fruit-veg', pumpkin: 'fruit-veg',
  'green-bean': 'legume-bush', hemp: 'cane', jute: 'cane',
};
const SHAPE_OF_GROUP = { cover: 'cover-mix', forage: 'forage', legume: 'legume-bush', root: 'tuber', oil: 'brassica', vegetable: 'leafy-veg', sugar: 'beet' };
const squash = id => String(id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const SHAPE_BY_KEY = new Map([...Object.entries(SHAPE_OF_CROP).map(([k, v]) => [squash(k), v]), ['soy', 'legume-bush'], ['soybean', 'legume-bush'], ['soybeans', 'legume-bush'], ['greenbean', 'legume-bush'], ['bean', 'legume-bush']]);
export function cropShape(id, group) {
  const key = squash(id);
  if (key && SHAPE_BY_KEY.has(key)) return SHAPE_BY_KEY.get(key);
  if (Object.hasOwn(SHAPE_OF_GROUP, group)) return SHAPE_OF_GROUP[group];
  return 'cereal';
}
// What a harvest leaves, by shape: stubble after stalks, ridged soil after tubers, beets and vegetables, a thin litter after the rest.
export function afterHarvest(shape) {
  if (['cereal', 'maize', 'rice', 'cane', 'sunflower', 'cotton'].includes(shape)) return 'stubble';
  if (['tuber', 'beet', 'leafy-veg', 'fruit-veg'].includes(shape)) return 'ridged soil';
  return 'litter';
}
// The model files to try, in order, for a crop at a stage; the code's stand-in comes last (stages 1 to 4 only).
export function modelNames(cropId, shape, stage, { cover = false, tree = false } = {}) {
  if (tree) return [`tree-${cropId}.glb`, 'tree.glb'];
  if (cover) return [`cover-${cropId}-stage2.glb`, 'shape-cover-mix-stage2.glb'];
  return [`crop-${cropId}-stage${stage}.glb`, `shape-${shape}-stage${stage}.glb`];
}
// Symbol heights: a grown crop at least 34 px tall in the first view, never under the farm unit (1.8% of the span, 2.5 to 60 m) nor over 8 units.
export const farmUnit = span => clamp(0.018 * span, 2.5, 60);
export function symbolHeight({ realHeight, span, pxPerMetre, stage, share }) {
  const unit = farmUnit(span);
  const grown = clamp(Math.max(realHeight || 0, pxPerMetre > 0 ? 34 / pxPerMetre : 0), unit, 8 * unit);
  const floor = (stage === 0 || stage === 1 || stage === 5) ? 0.6 : 0;
  return grown * Math.max(share, floor);
}

// ---- rows and plants
export const MAX_PLANTS = 4000, MAX_PLANTS_PHONE = 1500, MIN_PLANTS_FIELD = 24;
const polyArea = p => { let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j].x * p[i].z - p[i].x * p[j].z; return Math.abs(a) / 2; };
const inPoly = (x, z, p) => { let r = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i].z > z) !== (p[j].z > z) && x < (p[j].x - p[i].x) * (z - p[i].z) / (p[j].z - p[i].z) + p[i].x) r = !r; return r; };
export { polyArea as areaOf, inPoly as insidePolygon };
// The row direction as a compass bearing (0 to 179): along the long side, or across the slope (along the contour) when the slope is 2% or more, to the nearest 5°.
export function rowBearing(poly, slopePct, downhill) {
  if (slopePct >= 2 && Number.isFinite(downhill)) return (Math.round((downhill + 90) / 5) * 5) % 180;
  let best = 0, bearing = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len > best) { best = len; bearing = (Math.atan2(b.x - a.x, -(b.z - a.z)) * 180 / Math.PI + 360) % 180; }
  }
  return bearing;
}
// Plants on staggered rows inside a polygon, spacing widened until the count fits the limit; each turned and scaled by a hash of its place.
export function plantsOf(poly, { bearing, rowGap, plantGap, limit, exclude = [] }) {
  const rad = bearing * Math.PI / 180, ux = Math.sin(rad), uz = -Math.cos(rad), vx = -uz, vz = ux;   // along the row, across it
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const p of poly) { const u = p.x * ux + p.z * uz, v = p.x * vx + p.z * vz; minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v); }
  let rg = rowGap, pg = plantGap, out = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    out = []; let r = 0;
    for (let v = minV + rg / 2; v <= maxV; v += rg, r++) {
      for (let u = minU + (r % 2 ? pg / 2 : 0) + pg / 2; u <= maxU; u += pg) {
        const x = u * ux + v * vx, z = u * uz + v * vz;
        if (!inPoly(x, z, poly)) continue;
        if (exclude.some(e => e(x, z))) continue;
        out.push({ x, z, turn: hash(x, z, 1) * 360, scale: 0.9 + hash(x, z, 2) * 0.2 });
        if (out.length > limit) break;
      }
      if (out.length > limit) break;
    }
    if (out.length <= limit) break;
    rg *= 1.15; pg *= 1.15;
  }
  return { plants: out, rowGap: rg, plantGap: pg, bearing };
}
// The limit shared by area over all fields, at least 24 each.
export function plantLimits(areas, phone = false) {
  const total = areas.reduce((s, a) => s + a, 0), cap = phone ? MAX_PLANTS_PHONE : MAX_PLANTS;
  return areas.map(a => Math.max(MIN_PLANTS_FIELD, Math.floor(total > 0 ? cap * a / total : cap)));
}

// ---- trees from the tree-height map: every cell 3 m or taller that no neighbour beats, merged within 3 m of a taller one, tallest first
export function treeCrowns(grid, phone = false) {
  const cap = phone ? 3000 : 8000, tops = [];
  const { nx, ny } = grid, at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny) ? 0 : grid.heights[j * nx + i];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const h = at(i, j); if (!(h >= 3)) continue;
    let top = true;
    for (let dj = -1; dj <= 1 && top; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const o = at(i + di, j + dj); if (o > h || (o === h && (dj < 0 || (dj === 0 && di < 0)))) { top = false; break; } }
    if (top) tops.push({ x: grid.x0 + i * grid.dx, z: grid.z0 + j * grid.dz, h });
  }
  tops.sort((a, b) => b.h - a.h || a.z - b.z || a.x - b.x);
  const kept = [];
  for (const t of tops) if (!kept.some(k => Math.hypot(k.x - t.x, k.z - t.z) < 3)) kept.push(t);
  return { crowns: kept.slice(0, cap).map(t => ({ ...t, radius: clamp(0.18 * t.h, 1, 2), colour: PALETTE.treeCrown })), found: kept.length, capped: kept.length > cap, cap };
}

// ---- the sky from the forecast
export function skyKind(wmo) {
  if (wmo == null || !Number.isFinite(wmo)) return 'none';
  if (wmo <= 1) return 'clear';
  if (wmo === 45 || wmo === 48) return 'fog';
  if ((wmo >= 51 && wmo <= 67) || (wmo >= 80 && wmo <= 82)) return 'rain';
  if ((wmo >= 71 && wmo <= 77) || wmo === 85 || wmo === 86) return 'snow';
  if (wmo >= 95) return 'storm';
  return 'cloud';
}
const SKY_COLOURS = { clear: ['#cfe2f6', '#f2f2f4'], cloud: ['#dfe4ec', '#eef0f3'], fog: ['#dfe4ec', '#eef0f3'], rain: ['#c9d0db', '#e6e9ee'], snow: ['#dfe4ec', '#eef0f3'], storm: ['#b9c0cc', '#e1e4ea'], none: ['#f2f2f4', '#f2f2f4'], night: ['#2c3f68', '#8593b4'], twilight: ['#7d8fb8', '#e3d3c8'] };
// forecast: {wmo, cloudPct, rainMm, windKmh}; sunHeight: the sun's apparent height now. Today only: a planned season has a plain sky.
export function skyOf(forecast, sunHeight, today = true) {
  let kind = today && forecast ? skyKind(forecast.wmo) : 'none';
  const light = sunHeight < -6 ? 'night' : sunHeight <= 0 ? 'twilight' : 'day';
  const colours = light === 'night' ? SKY_COLOURS.night : light === 'twilight' ? SKY_COLOURS.twilight : SKY_COLOURS[kind];
  const rain = kind === 'rain' || kind === 'storm' ? (() => { const mm = forecast.rainMm ?? 0; return mm < 1 ? 60 : mm < 5 ? 200 : mm < 20 ? 500 : 900; })() : 0;
  const clouds = today && forecast && Number.isFinite(forecast.cloudPct) ? Math.round(clamp(forecast.cloudPct, 0, 100) / 12.5) : 0;
  return {
    kind, light, top: colours[0], bottom: colours[1], rainStreaks: rain, rainColour: PALETTE.rain, snowPoints: kind === 'snow' ? 500 : 0,
    clouds, cloudColour: kind === 'storm' ? '#9aa3b2' : kind === 'rain' ? '#d5dae3' : '#ffffff', cloudArc: 150, lightning: false,
    words: light === 'night' ? 'Night at the farm. Lit so you can read it.' : kind === 'storm' ? 'thunder and rain' : kind,
  };
}

// ---- the sun, the moon and the lights: exactly one sun
export function lightsOf(sun, sky, cloudPct = 0, behindHills = false) {
  const lights = [{ type: 'hemisphere', sky: '#eaf2ff', ground: '#a47148', intensity: 1.5 }];
  let state = 'day';
  if (sun.apparent < -6) state = 'night';
  else if (sun.apparent <= 0) state = 'twilight';
  if (state === 'day') {
    let k = 2.4 * clamp(0.55 + sun.apparent / 60, 0.55, 1);
    if (cloudPct >= 80) k *= 0.55;
    if (behindHills) k *= 0.35;
    lights.push({ type: 'directional', name: 'sun', colour: '#fff3df', intensity: k, direction: lightDirection(sun.apparent, sun.azimuth), soft: cloudPct >= 80 });
  } else if (state === 'twilight') {
    lights[0] = { type: 'hemisphere', sky: '#c7d3f2', ground: '#a47148', intensity: 1.05 };
  } else {
    lights.push({ type: 'directional', name: 'fill', colour: '#d4defa', intensity: 1.1, direction: lightDirection(40, 200) });
  }
  return { state, lights };
}

// ---- the first view
export const camera = (southernHemisphere, layers = false, tall = false) => ({
  fov: tall ? 36 : 30, polar: [10, 80], azimuth: southernHemisphere ? 340 : 200, tilt: layers ? 62 : 55, introMs: 900, moveMs: 700,
});

// ---- the words for the legend and the live region
export function sunLine(sun, ev, opts) {
  if (sun.apparent <= 0) {
    return `The sun is down at ${opts.at}.` + (opts.twilightUntil ? ` Twilight until ${opts.twilightUntil}.` : '') + ' No sun shadows.';
  }
  return `Sun at ${opts.at}: ${heightWords(sun.apparent)} up, in the ${compass8(sun.azimuth)}. Shadows ${shadowWords(shadowRatio(sun.apparent))}, on flat ground. The dotted arc is the sun's path in the sky.`;
}
export function dayLine(kind, dateMs, opts = {}) {
  const d = new Date(dateMs);
  const names = { today: `Today, ${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`, planned: `${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}, in your plan, not today`, past: `${d.getUTCFullYear()}: past weather, not today` };
  return names[kind] || names.today;
}
export const farmLabel = (name, fields, hectares, from, trueHeights, step) =>
  `3D view of ${name}: ${fields} field${fields === 1 ? '' : 's'}, ${hectares} ha, seen from the ${from}. ` + (trueHeights ? 'Hills at true height.' : `Hills drawn ${step}× taller than real.`);

// ---- the whole scene, from the farm and the day shown
// input: {farm: {name, pin:{lat,lon}, fields:[{id, name, polygon:[[lat,lon]…], crop?:{id, group, sow, lengths, kind?}, slope?:{pct, downhill}}]},
//         momentMs, zone?, forecast?, today (bool), heights?: Map blockIndex → grid, phone?}
export function sceneOf(input) {
  const { farm, momentMs, forecast, today = true, phone = false } = input;
  const zoneOpts = { zone: input.zone, offsetMin: input.offsetMin, lon: farm.pin.lon };
  const slab = slabOf(farm.fields, farm.pin);
  const lat = farm.pin.lat, lon = farm.pin.lon;
  const sunNow = sunAt(momentMs, lat, lon);
  const date = farmDate(momentMs, zoneOpts), ev = sunEvents(date, lat, lon);
  const sky = skyOf(forecast, sunNow.apparent, today);
  const lit = lightsOf(sunNow, sky, forecast?.cloudPct ?? 0, !!input.behindHills);
  const moon = moonAt(momentMs, lat, lon);
  const hs = soilDepthDrawn(slab.span);
  const frames = slab.blocks.map(b => frameAt(b.lat, b.lon));
  const limits = plantLimits((farm.fields || []).map(f => polyArea(f.polygon.map(([la, lo]) => frameAt(lat, lon).toXZ(la, lo)))), phone);
  const unit = farmUnit(slab.span);
  const fields = (farm.fields || []).map((f, idx) => {
    const bi = Math.max(0, slab.blocks.findIndex(b => b.fieldIds.includes(f.id))), fr = frames[bi], off = slab.blocks[bi].offsetX;
    const poly = f.polygon.map(([la, lo]) => { const p = fr.toXZ(la, lo); return { x: p.x + off, z: p.z }; });
    const crop = f.crop || null, st = crop ? stageOn(crop, momentMs) : null;
    const shape = crop ? cropShape(crop.id, crop.group) : null;
    const kind = crop?.kind || 'crop';
    const surface = !crop || !st ? { colour: PALETTE.soil, bare: true } : { colour: leafColour(st.stage, st.f, kind), bare: false };
    const bearing = rowBearing(poly, f.slope?.pct ?? 0, f.slope?.downhill);
    const layout = crop && st && st.stage < 5 ? plantsOf(poly, { bearing, rowGap: unit * 0.5, plantGap: unit * 0.4, limit: limits[idx], exclude: input.cleared || [] }) : { plants: [], rowGap: 0, plantGap: 0, bearing };
    return { id: f.id, name: f.name, polygon: poly, areaM2: polyArea(poly), crop: crop && { id: crop.id, shape, stage: st, kind, models: st ? modelNames(crop.id, shape, st.stage, { cover: kind === 'cover', tree: kind === 'tree' }) : [], after: shape ? afterHarvest(shape) : null }, surface, bearing, plants: layout.plants, rowGap: layout.rowGap };
  });
  const ha = Math.round(fields.reduce((s, f) => s + f.areaM2, 0) / 1e4);
  const southern = lat < 0;
  return {
    slab, soil: { depth: hs.depth, factor: hs.factor }, fields, sky, light: lit,
    suns: [{ ...lightDirection(sunNow.apparent, sunNow.azimuth), height: sunNow.apparent, azimuth: sunNow.azimuth, up: sunNow.apparent > 0 }],   // exactly one
    sunEvents: { rise: ev.rise, set: ev.set, noon: ev.noon, state: ev.state },
    moon: { height: moon.apparent, azimuth: moon.azimuth, lit: moon.lit, growing: moon.growing, up: moon.apparent > 0, words: moonWords(moon) },
    camera: camera(southern),
    label: farmLabel(farm.name, fields.length, ha, southern ? 'north' : 'south', true, 1),
    palette: PALETTE,
  };
}

// ---- the comparison view: one field, one plan, one date, what covers the ground (the smallest 3D look)
// Real heights of a grown plant by shape and stage (metres), so a symbol is never drawn smaller than the real crop. From the FAO-56 stages.
export const REAL_HEIGHT = {
  maize: [0.057, 0.308, 1.201, 2.002, 2.002, 0.302], cereal: [0.024, 0.15, 0.551, 1, 1, 0.182], 'legume-bush': [0.03, 0.12, 0.3, 0.45, 0.45, 0.1],
};
const NAMES = { corn: 'corn', soy: 'soybeans', wheat: 'winter wheat', swheat: 'spring wheat', durum: 'durum wheat', barley: 'barley', oats: 'oats', rye: 'rye', sorghum: 'sorghum' };
export const cropName = id => NAMES[id] || String(id || 'the crop').replace(/[-_]/g, ' ');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function dateWords(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : 'no date'; }
export const ESTIMATED_HA = 10;
// input: {name, pin:{lat,lon}, field:{id, name, polygon:[[lat,lon]…] | null, areaEstimated}, planKind:'current'|'proposed', planName, date:'YYYY-MM-DD',
//         ground:{state:'crop'|'cover'|'residue'|'bare', crop, stage, label:'Planned'|'Observed', note}|null, heights:{nx, ny, width, depth, h}|null, soil:{colour}|null, viewPx?, phone?, offsetMin?, zone?}
export function groundScene(input) {
  const pin = input.pin, field = input.field || {}, phone = !!input.phone;
  let polygon = field.polygon, estimated = !!field.areaEstimated;
  if (!Array.isArray(polygon) || polygon.length < 3) {   // no outline drawn: a square of 10 ha round the pin, always said to be an estimate
    const half = Math.sqrt(ESTIMATED_HA * 1e4) / 2, f = frameAt(pin.lat, pin.lon);
    polygon = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([x, z]) => { const p = f.toLatLon(x, z); return [p.lat, p.lon]; });
    estimated = true;
  }
  const block = blocksOf([{ id: field.id || 'f', polygon }], pin)[0];
  const frame = frameAt(block.lat, block.lon);
  const poly = polygon.map(([la, lo]) => frame.toXZ(la, lo));
  const area = polyArea(poly), xs = poly.map(p => p.x), zs = poly.map(p => p.z);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  const span = Math.max(block.width, block.depth), unit = farmUnit(span);
  // the sun, at a morning moment of the chosen date so shadows and light read the same on every date
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date || '');
  const day = m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  const ev = day ? sunEvents(day, pin.lat, pin.lon) : null;
  const momentMs = ev && ev.state === 'normal' ? ev.noon - 90 * 60000 : ev ? ev.noon : null;
  const sunNow = momentMs != null ? sunAt(momentMs, pin.lat, pin.lon) : null;
  const sunUp = sunNow && sunNow.apparent > 0;
  const lights = sunNow ? lightsOf(sunNow, null, 0) : { state: 'day', lights: [{ type: 'hemisphere', sky: '#eaf2ff', ground: '#a47148', intensity: 1.5 }] };
  // the ground cover
  const g = input.ground, label = g?.label === 'Observed' ? 'Observed' : 'Planned';
  let cover = null;
  if (g) {
    const shape = g.crop ? cropShape(g.crop) : null, st = Number.isInteger(g.stage) ? g.stage : null;
    const px = (input.viewPx || (phone ? 360 : 900)) * 0.8 / Math.max(box.x1 - box.x0, box.z1 - box.z0, 1);
    const limit = (phone ? MAX_PLANTS_PHONE : MAX_PLANTS);
    const bearing = rowBearing(poly, 0);
    if ((g.state === 'crop' || g.state === 'cover') && shape) {
      const stage = st ?? 3, real = (REAL_HEIGHT[shape] || REAL_HEIGHT.cereal)[stage], share = GROWTH_SHARE[stage];
      const height = symbolHeight({ realHeight: real, span, pxPerMetre: px, stage, share: typeof share === 'function' ? 0.5 : share });
      const lay = plantsOf(poly, { bearing, rowGap: unit * 0.55, plantGap: unit * 0.45, limit });
      cover = { kind: stage >= 2 ? 'standing' : 'young', state: g.state, shape, crop: g.crop, stage, stageName: STAGES[stage], height, realHeight: real, colour: g.state === 'cover' ? PALETTE.cover : leafColour(stage, 0.5), plants: lay.plants, bearing,
        words: `${stage >= 2 ? 'Standing' : 'Young'} ${cropName(g.crop)}, ${STAGES[stage]}.` };
    } else if (g.state === 'residue') {
      const lay = plantsOf(poly, { bearing, rowGap: unit * 0.22, plantGap: unit * 0.22, limit });
      cover = { kind: 'residue', shape: shape || 'cereal', crop: g.crop, stage: null, height: unit * 0.2, length: unit * 0.7, colour: '#cdb27a', plants: lay.plants, bearing,
        words: `${g.crop ? cropName(g.crop)[0].toUpperCase() + cropName(g.crop).slice(1) + ' residue' : 'Crop residue'}: thin, low stalks left lying after harvest.` };
    } else {
      cover = { kind: 'bare', shape: null, crop: null, stage: null, height: 0, colour: PALETTE.soil, plants: [], bearing, words: 'Bare soil: nothing grows and no residue is left.' };
    }
  }
  // heights
  const hm = input.heights ? heightModel(input.heights) : null;
  const heights = hm && !hm.flat ? { model: hm, rise: hm.rise, status: 'read', words: `Heights read: the land rises ${hm.rise < 10 ? hm.rise.toFixed(1) : Math.round(hm.rise)} m across this view, drawn at true height.` }
    : { model: null, rise: 0, status: input.heights ? 'flat' : 'missing', words: 'Heights not read: the land is drawn flat, as a plain schematic.' };
  const soilColour = input.soil?.colour || PALETTE.soil;
  const kindWord = input.planKind === 'proposed' ? 'Proposed plan' : 'Current plan';
  return {
    slab: { width: block.width, depth: block.depth, span, lat: block.lat, lon: block.lon }, heightRequest: { lat: block.lat, lon: block.lon, width: block.width, depth: block.depth, n: phone ? GRID_SIZE_PHONE : GRID_SIZE },
    field: { id: field.id || null, name: field.name || 'Your field', polygon: poly, areaM2: area, areaHa: Math.round(area / 1e3) / 10, estimated, box },
    heights, soilColour, cover, camera: camera(pin.lat < 0), light: lights, momentMs, sun: sunNow ? { ...lightDirection(sunNow.apparent, sunNow.azimuth), height: sunNow.apparent, azimuth: sunNow.azimuth, up: sunUp } : null,
    sky: skyOf(null, sunNow ? sunNow.apparent : 30, false),
    label: { state: label, plan: kindWord, planName: input.planName || null, date: input.date || null, dateWords: dateWords(input.date), line: `${label} · ${kindWord} · ${dateWords(input.date)}` },
    words: {
      cover: cover?.words || 'Not read yet: what covers this field on this date.', note: g?.note || null,
      outline: estimated ? `Outline estimated: a ${ESTIMATED_HA} ha square round the pin. Draw the field to replace it.` : `${field.name || 'Your field'}: ${Math.round(area / 1e3) / 10} ha, from the outline you drew.`,
      heights: heights.words, sun: sunNow ? (sunUp ? `Sun at ${clock(momentMs, { zone: input.zone, offsetMin: input.offsetMin, lon: pin.lon })}: ${heightWords(sunNow.apparent)} up, in the ${compass8(sunNow.azimuth)}. The one light in the picture.` : 'The sun is down on this date at the hour shown.') : 'No date, so no sun.',
      illustrative: 'Plants are symbols, drawn larger than real so they show from here.',
    },
    aria: `3D view of ${field.name || 'your field'}, seen from the ${pin.lat < 0 ? 'north' : 'south'}. ${label}: ${cover?.words || 'ground cover not read yet'} ${heights.status === 'read' ? 'Hills at true height.' : 'Drawn flat.'}`,
    palette: PALETTE,
  };
}
