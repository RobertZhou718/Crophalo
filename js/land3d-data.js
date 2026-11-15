// The 3D farm's ten "On the land" switches, pure: what each one needs, what it works out from real data, and the plain words for each state.
// A source that has not answered yet is `undefined` ("Reading…"); one that failed is {failed: sentence} (it says it could not read and draws nothing);
// an answer that is simply empty says so. A layer is never drawn from a guess. No page, no storage, no network, nothing random.
// Frame: the 3D scene's own: metres, +x east, +z south, from the middle of the land block; heights in metres. Checked by scripts/test_land3d.mjs.
import { heightAtMesh, areaOf, insidePolygon, soilColour, soilClass, frameAt } from './farm3d-data.js';

export const STORAGE_KEY = 'crophalo.farm3d.land';

// id, name (the switch's label), what it needs, and its one line when on
export const SWITCHES = [
  { id: 'scale', name: 'Scale, high, low', needs: ['heights'], line: 'A scale bar, and the highest and lowest point of each field.' },
  { id: 'edges', name: 'Edge lengths', needs: ['heights'], line: 'The length of each side of the chosen field and the height at its corners.' },
  { id: 'contours', name: 'Contour lines', needs: ['heights'], line: 'Lines of equal height over the land.' },
  { id: 'soil', name: 'Soil colour', needs: ['soil'], line: 'Open ground tinted with the soil\'s colour.' },
  { id: 'cover', name: 'Land cover', needs: ['cover'], line: 'What covers the ground, in squares of 10 m.' },
  { id: 'buildings', name: 'Buildings', needs: ['osm'], line: 'Building outlines from OpenStreetMap.' },
  { id: 'roads', name: 'Roads, tracks', needs: ['osm'], line: 'Roads and tracks from OpenStreetMap.' },
  { id: 'water', name: 'Water paths', needs: ['osm', 'heights'], line: 'Mapped streams, ditches and ponds, and where rain would run.' },
  { id: 'hedges', name: 'Hedges, woods', needs: ['osm', 'trees'], line: 'Hedges, tree rows and woods from OpenStreetMap and the tree map.' },
  { id: 'wet', name: 'Wet spots', needs: ['heights'], line: 'Low places where rain would collect.' },
];
const BY_ID = new Map(SWITCHES.map(s => [s.id, s]));
export const switchOf = id => (typeof id === 'string' && BY_ID.has(id) ? BY_ID.get(id) : null);

// ---- the farmer's choice: only "Scale, high, low" is on at first; the rest of what was saved is cleaned
export const DEFAULT_CHOICE = Object.freeze({ scale: true });
export function cleanChoice(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...DEFAULT_CHOICE };
  const out = {};
  for (const s of SWITCHES) if (saved[s.id] === true) out[s.id] = true;
  return out;
}
export const toggleWords = (id, on) => { const s = switchOf(id); return !s ? '' : on ? `${s.name} on. ${s.line}` : `${s.name} off.`; };
// A switch that is off costs nothing: the outside services asked are only those the switches that are on need, once for each land block.
export function sourcesNeeded(choice) {
  const need = new Set();
  for (const s of SWITCHES) if (choice?.[s.id] === true) for (const n of s.needs) need.add(n);
  return [...need].sort();
}

// ---- limits (computer, phone)
export const LIMITS = { buildings: [1500, 600], roads: [1500, 700], trees: [1200, 500], water: [400, 200], rain: [60, 30], hollows: [40, 20], labels: [40, 14] };
const limit = (name, phone) => LIMITS[name][phone ? 1 : 0];

// ---- shared small helpers
const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;
const num = v => v.toLocaleString('en-CA', { maximumFractionDigits: 0 });
const waiting = (id, what) => ({ id, state: 'waiting', words: [`Reading ${what}…`], items: [] });
const cannot = (id, name, reason) => ({ id, state: 'cannot', words: [`${name}: ${String(reason).replace(/[.\s]+$/, '')}. Nothing is drawn.`], items: [] });
const NO_HEIGHTS = 'Heights not read, so this cannot be worked out.';
const hasHeights = m => m && !m.flat && m.h;
const nodeAt = (m, i, j) => m.h[j * m.nx + i];
const nodeXZ = (m, i, j) => [-m.width / 2 + i * m.cellX, -m.depth / 2 + j * m.cellZ];
const trueHeight = (m, x, z) => { const v = heightAtMesh(m, x, z); return Number.isFinite(v) ? v + m.base : NaN; };   // metres above sea level
const cardinal = deg => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
export const bearingOf = (dx, dz) => ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;   // compass bearing of a step east dx and south dz

// ---- 1. scale, high, low
const NICE = [1, 2, 5];
function nicePart(v) { const e = Math.pow(10, Math.floor(Math.log10(v))); let best = e; for (const n of NICE) if (n * e <= v + 1e-9) best = n * e; return best; }
// A bar of a round length about 18% of the span, in metres or feet.
export function scaleBar(span, units = 'm') {
  const target = 0.18 * span;
  if (units === 'ft') { const feet = nicePart(target * 3.28084), metres = feet / 3.28084; return { metres, label: feet >= 5280 ? `${round(feet / 5280, 1)} mi` : `${feet} ft` }; }
  const m = nicePart(target);
  return { metres: m, label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
}
export const MIN_CELLS = 25;   // a field needs at least this many height cells to name its highest and lowest point
export function highLow(model, field) {
  let high = null, low = null, cells = 0;
  for (let j = 0; j < model.ny; j++) for (let i = 0; i < model.nx; i++) {
    const v = nodeAt(model, i, j); if (!(v === v)) continue;
    const [x, z] = nodeXZ(model, i, j); if (!insidePolygon(x, z, field.polygon)) continue;
    cells++;
    if (!high || v > high.h) high = { x, z, h: v };
    if (!low || v < low.h) low = { x, z, h: v };
  }
  return { cells, high, low };
}
export function scaleLayer(ctx) {
  if (ctx.heights === undefined) return waiting('scale', "the land's heights");
  if (!hasHeights(ctx.heights)) return { id: 'scale', state: 'cannot', words: [NO_HEIGHTS], items: [], bar: scaleBar(ctx.span, ctx.units) };
  const items = [], words = [];
  for (const f of ctx.fields || []) {
    const r = highLow(ctx.heights, f);
    if (r.cells < MIN_CELLS) { words.push(`${f.name} is too small to name its highest and lowest point (${r.cells} height cells).`); continue; }
    items.push({ field: f.id, high: r.high, low: r.low });
    words.push(`${f.name}: High ${r.high.h.toFixed(1)} m, Low ${r.low.h.toFixed(1)} m.`);
  }
  return { id: 'scale', state: 'ready', words, items, bar: scaleBar(ctx.span, ctx.units) };
}

// ---- 2. edge lengths: each side's length at its middle (under 8 m skipped, at most 12), and the height at each labelled corner
export function edgeLabels(polygon, model) {
  const sides = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len >= 8) sides.push({ i, from: a, to: b, length: len, mid: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 } });
  }
  const kept = sides.sort((p, q) => q.length - p.length).slice(0, 12).sort((p, q) => p.i - q.i);
  const corners = new Map();
  for (const s of kept) for (const c of [s.from, s.to]) { const k = c.x.toFixed(2) + ',' + c.z.toFixed(2); if (!corners.has(k)) corners.set(k, { x: c.x, z: c.z, h: model ? round(trueHeight(model, c.x, c.z)) : null }); }
  return { sides: kept, corners: [...corners.values()].map(c => ({ ...c, h: Number.isFinite(c.h) ? c.h : null })) };
}
export function edgesLayer(ctx) {
  const f = ctx.chosen;
  if (!f || !f.polygon || f.polygon.length < 3) return { id: 'edges', state: 'cannot', words: ['Edge lengths: there is no field outline to write on.'], items: [] };
  if (ctx.heights === undefined) return waiting('edges', "the land's heights");
  const model = hasHeights(ctx.heights) ? ctx.heights : null, r = edgeLabels(f.polygon, model);
  return { id: 'edges', state: model ? 'ready' : 'cannot', items: r, words: [`${f.name}: ${r.sides.length} sides labelled.`, "Lengths are along the ground's plan (flat), from the outline you drew. Heights are the height map's, at each corner."].concat(model ? [] : [NO_HEIGHTS]) };
}

// ---- 3. contour lines at the data's step
export function contourStep(cellMetres) { return cellMetres < 2 ? 1 : cellMetres < 8 ? 2 : cellMetres < 60 ? 5 : 10; }
export function contourLevels(model) {
  const hs = []; for (let k = 0; k < model.h.length; k++) if (model.h[k] === model.h[k]) hs.push(model.h[k]);
  if (!hs.length) return { step: null, levels: [], rise: 0 };
  let lo = Infinity, hi = -Infinity; for (const v of hs) { if (v < lo) lo = v; if (v > hi) hi = v; }
  let step = contourStep(Math.min(model.cellX, model.cellZ)), levels = [];
  for (let n = 0; n < 12; n++) {
    levels = []; for (let l = Math.ceil(lo / step) * step; l <= hi + 1e-9; l += step) levels.push(round(l, 3));
    if (levels.length <= 40) break; step *= 2;
  }
  return { step, levels, rise: hi - lo };
}
// The line segments of one level through the very triangles that are drawn (north-east to south-west diagonal): [[x1, z1, x2, z2], …]
export function contourSegments(model, level) {
  const out = [];
  const tri = (p, q, r) => {
    const pts = [];
    for (const [a, b] of [[p, q], [q, r], [r, p]]) {
      const da = a.h - level, db = b.h - level;
      if ((da < 0 && db >= 0) || (db < 0 && da >= 0)) { const t = da / (da - db); pts.push([a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t]); }
    }
    if (pts.length === 2) out.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
  };
  for (let j = 0; j < model.ny - 1; j++) for (let i = 0; i < model.nx - 1; i++) {
    const at = (a, b) => { const [x, z] = nodeXZ(model, a, b); return { x, z, h: nodeAt(model, a, b) }; };
    const nw = at(i, j), ne = at(i + 1, j), sw = at(i, j + 1), se = at(i + 1, j + 1);
    if ([nw, ne, sw, se].some(p => !(p.h === p.h))) continue;   // a missing height draws nothing
    tri(nw, ne, sw); tri(ne, se, sw);
  }
  return out;
}
export function contoursLayer(ctx, { slopeDrawsThem = false } = {}) {
  if (slopeDrawsThem) return { id: 'contours', state: 'ready', words: ['Contour lines are drawn by the slope view.'], items: [] };
  if (ctx.heights === undefined) return waiting('contours', "the land's heights");
  if (!hasHeights(ctx.heights)) return { id: 'contours', state: 'cannot', words: [NO_HEIGHTS], items: [] };
  const { step, levels, rise } = contourLevels(ctx.heights);
  const always = 'Small bumps, banks and ditches are not in the height map.';
  if (rise < 5) return { id: 'contours', state: 'ready', words: ['The land here rises less than 5 m, so no contour line is drawn.', always], items: [], step, rise };
  return { id: 'contours', state: 'ready', step, rise, items: levels.map(level => ({ level, segments: contourSegments(ctx.heights, level) })), words: [`Contour lines every ${step} m of height.`, always] };
}

// ---- 4. soil colour
export function soilLayer(ctx) {
  if (ctx.soil === undefined) return waiting('soil', 'the soil map');
  if (ctx.soil?.failed) return cannot('soil', 'Soil colour', ctx.soil.failed);
  const colour = ctx.soil && soilColour(ctx.soil);
  if (!colour) return { id: 'soil', state: 'cannot', words: ['Soil colour: the soil is not known yet, so nothing is tinted.'], items: [] };
  const name = ctx.soil.name || soilClass(ctx.soil), om = Number.isFinite(ctx.soil.organic) ? `, ${round(ctx.soil.organic)}% organic matter` : '';
  return { id: 'soil', state: 'ready', colour, tintOnly: ctx.cover && !ctx.cover.failed ? ['cropland', 'bare or sparse vegetation'] : null, items: [], words: [`Open ground tinted ${name} soil${om}. One reading for the whole view, not a photo.`] };
}

// ---- 5. land cover (ESA WorldCover 2021, squares of 10 m)
export const COVER_CLASSES = { 10: ['tree cover', '#2f7d4a', 'trees'], 20: ['shrubland', '#8aa04a', 'shrubs'], 30: ['grassland', '#a9c36a', 'grass'], 40: ['cropland', '#d9b84a', 'cropland'], 50: ['built-up', '#9a9aa0', 'built-up'],
  60: ['bare or sparse vegetation', '#c9a77c', 'bare'], 70: ['snow and ice', '#e8f0f8', 'snow'], 80: ['permanent water', '#2670cc', 'water'], 90: ['herbaceous wetland', '#4fa39a', 'wet land'], 95: ['mangroves', '#1f6b5a', 'mangroves'], 100: ['moss and lichen', '#b7c2a0', 'moss'] };
export function coverShares(counts) {
  const entries = Object.entries(counts || {}).map(([code, n]) => [Number(code), Number(n)]).filter(([c, n]) => COVER_CLASSES[c] && n > 0), total = entries.reduce((s, [, n]) => s + n, 0);
  return total ? entries.map(([code, n]) => ({ code, short: COVER_CLASSES[code][2], name: COVER_CLASSES[code][0], colour: COVER_CLASSES[code][1], share: n / total })).sort((a, b) => b.share - a.share) : [];
}
export function coverLayer(ctx) {
  const a = ctx.cover;
  if (a === undefined) return waiting('cover', 'the land cover');
  if (a?.failed) return cannot('cover', 'Land cover', a.failed);
  const shares = coverShares(a?.counts);
  if (!shares.length) return { id: 'cover', state: 'cannot', words: ['Land cover: the map has no class for this place (open sea, or beyond the map\'s edge). Nothing is drawn.'], items: [] };
  const year = /^\d{4}/.exec(a.data_date || '')?.[0] ?? 'the map\'s year';
  const top = shares.slice(0, 3).map(s => `${s.short} ${Math.round(s.share * 100)}%`).join(', ');
  return { id: 'cover', state: 'ready', shares, items: shares, words: [`Land cover in ${year}: ${top}. Squares of 10 m, worked out by computer: edges and small things are missed.`] };
}

// ---- 6. buildings
export const BUILDING_MIN_M2 = 4, BUILDING_MAX_M2 = 50000, LEVEL_M = 3, PLAIN_BOX_M = 4;
const toLocal = (frame, pts) => pts.map(([la, lo]) => { const p = frame.toXZ(la, lo); return { x: p.x, z: p.z }; });
export function buildingsLayer(ctx) {
  const a = ctx.osm;
  if (a === undefined) return waiting('buildings', 'the map of buildings');
  if (a?.failed) return cannot('buildings', 'Buildings', a.failed);
  const items = [];
  let mapped = 0;
  for (const b of a?.buildings || []) {
    const poly = toLocal(ctx.frame, b.p), area = areaOf(poly);
    if (!(area >= BUILDING_MIN_M2 && area <= BUILDING_MAX_M2)) continue;
    let height = PLAIN_BOX_M, how = 'box';
    if (Number.isFinite(b.h) && b.h > 0) { height = b.h; how = 'mapped'; mapped++; } else if (Number.isFinite(b.lv) && b.lv > 0) { height = b.lv * LEVEL_M; how = 'levels'; mapped++; }
    items.push({ polygon: poly, height, how, area, kind: b.k });
  }
  if (!items.length) return { id: 'buildings', state: 'ready', items: [], words: ['No buildings are mapped on this land (OpenStreetMap may just not have them yet).'] };
  const cap = limit('buildings', ctx.phone), kept = items.length > cap ? items.sort((p, q) => dist2(p.polygon[0]) - dist2(q.polygon[0])).slice(0, cap) : items;
  return { id: 'buildings', state: 'ready', items: kept, words: [`${kept.length} buildings drawn. ${mapped} have a mapped height or levels (${LEVEL_M} m each level). ${items.length - mapped} are a plain ${PLAIN_BOX_M} m box: no height is mapped.`, 'Outlines drawn by OpenStreetMap volunteers. A new building may be missing and an old one may stand no more.'] };
}
const dist2 = p => p.x * p.x + p.z * p.z;

// ---- 7. roads and tracks: ribbons draped on the ground, typical widths unless a width is mapped
// The widest (motorway 12 m) and the narrowest (path 1.2 m) are fixed; the kinds between them are working choices, kept here to change in one place.
export const ROAD_WIDTHS = { motorway: 12, motorway_link: 6, trunk: 11, trunk_link: 6, primary: 10, primary_link: 6, secondary: 8, secondary_link: 5, tertiary: 7, tertiary_link: 5, unclassified: 6, residential: 6, living_street: 5, road: 6, service: 4, pedestrian: 3, track: 3.5, cycleway: 2, bridleway: 2, footway: 1.2, path: 1.2 };
export const UNPAVED = new Set(['track', 'bridleway', 'path']);
export const PAVED_COLOUR = '#8a8f98', TRACK_COLOUR = '#b79f78';
const ROAD_WORDS = { track: 'a farm track', path: 'a path', footway: 'a footpath', cycleway: 'a cycle path', bridleway: 'a bridle path', service: 'a service road', residential: 'a residential road' };
const roadName = k => ROAD_WORDS[k] || 'a road';
function nearestOn(poly, pts) {   // the nearest point of a polyline to a field's middle
  const c = poly.reduce((s, p) => ({ x: s.x + p.x / poly.length, z: s.z + p.z / poly.length }), { x: 0, z: 0 });
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.z - a.z) * dz) / L)) : 0, px = a.x + t * dx, pz = a.z + t * dz, d = Math.hypot(px - c.x, pz - c.z);
    if (!best || d < best.d) best = { d, x: px, z: pz, c };
  }
  return best;
}
// The nearest approach of a road line to a field's outline: the shortest distance between the two outlines (a road's end points are not the nearest thing to a field).
function segPoint(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L)) : 0;
  const q = { x: a.x + t * dx, z: a.z + t * dz };
  return { d: Math.hypot(p.x - q.x, p.z - q.z), q };
}
function edgeDistance(field, pts) {
  let best = null;
  const edges = field.polygon.map((a, i) => [a, field.polygon[(i + 1) % field.polygon.length]]);
  for (let i = 0; i < pts.length - 1; i++) {
    for (const v of field.polygon) { const r = segPoint(v, pts[i], pts[i + 1]); if (!best || r.d < best.d) best = { d: r.d, from: v, to: r.q }; }
    for (const e of edges) for (const v of [pts[i], pts[i + 1]]) { const r = segPoint(v, e[0], e[1]); if (!best || r.d < best.d) best = { d: r.d, from: r.q, to: v }; }
  }
  return best;
}
export function roadsLayer(ctx) {
  const a = ctx.osm;
  if (a === undefined) return waiting('roads', 'the map of roads and tracks');
  if (a?.failed) return cannot('roads', 'Roads, tracks', a.failed);
  const items = (a?.roads || []).map(r => ({ points: toLocal(ctx.frame, r.p), kind: r.k, width: Number.isFinite(r.w) ? r.w : ROAD_WIDTHS[r.k] ?? 6, widthMapped: Number.isFinite(r.w), colour: UNPAVED.has(r.k) ? TRACK_COLOUR : PAVED_COLOUR })).slice(0, limit('roads', ctx.phone));
  if (!items.length) return { id: 'roads', state: 'ready', items: [], words: ['No roads or tracks are mapped on this land.'] };
  const words = [`${items.length} road${items.length === 1 ? '' : 's'} or tracks drawn; widths are typical for each kind unless a width is mapped.`];
  for (const f of ctx.fields || []) {
    let best = null;
    for (const r of items) { const e = edgeDistance(f, r.points); if (e && (!best || e.d < best.e.d)) best = { r, e }; }
    if (best) words.push(`${f.name}: nearest is ${roadName(best.r.kind)}, ${Math.round(best.e.d / 5) * 5 || 5} m to the ${cardinal(bearingOf(best.e.to.x - best.e.from.x, best.e.to.z - best.e.from.z))}.`);
  }
  words.push('A gate or an entrance is not mapped here.');
  return { id: 'roads', state: 'ready', items, words };
}

// ---- 8. water paths: mapped streams, ditches and ponds, and where rain would run (worked out from the height map)
export const WATER_WIDTHS = { river: 12, canal: 5, stream: 2, ditch: 1.2, drain: 1.2 };
export const RAIN_COLOUR = '#7fb2ee', WATER_COLOUR = '#2670cc';
export const RAIN_HA = 0.4;   // a rain path is drawn where about this much land drains through
// Where rain would run: each cell drains to its lowest neighbour (eight ways); the area draining through a cell is counted from the highest cell down.
export function flowPaths(model, minHa = RAIN_HA) {
  const { nx, ny } = model, n = nx * ny, h = model.h, cellArea = model.cellX * model.cellZ, acc = new Float32Array(n).fill(1), to = new Int32Array(n).fill(-1);
  const order = []; for (let k = 0; k < n; k++) if (h[k] === h[k]) order.push(k);
  for (const k of order) {
    const i = k % nx, j = (k / nx) | 0; let best = -1, drop = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const q = b * nx + a, v = h[q]; if (!(v === v)) continue;
      const slope = (h[k] - v) / Math.hypot(di * model.cellX, dj * model.cellZ); if (slope > drop) { drop = slope; best = q; }
    }
    to[k] = best;
  }
  order.sort((p, q) => h[q] - h[p]);
  for (const k of order) if (to[k] >= 0) acc[to[k]] += acc[k];
  const need = (minHa * 1e4) / cellArea, cells = [];
  for (const k of order) if (acc[k] >= need) cells.push({ k, x: nodeXZ(model, k % nx, (k / nx) | 0)[0], z: nodeXZ(model, k % nx, (k / nx) | 0)[1], ha: acc[k] * cellArea / 1e4, to: to[k] });
  return { cells, need, to };
}
export function waterLayer(ctx) {
  const a = ctx.osm;
  if (a === undefined) return waiting('water', 'the map of water');
  if (a?.failed) return cannot('water', 'Water paths', a.failed);
  const lines = [], ponds = [];
  for (const w of a?.water || []) {
    const pts = toLocal(ctx.frame, w.p);
    if (w.area) {
      const shore = hasHeights(ctx.heights) ? median(pts.map(p => trueHeight(ctx.heights, p.x, p.z)).filter(Number.isFinite)) : NaN;
      ponds.push({ polygon: pts, level: Number.isFinite(shore) ? shore - ctx.heights.base : null, kind: w.k });   // flat at the shore's height; with no heights, on the flat ground
    } else lines.push({ points: pts, kind: w.k, width: WATER_WIDTHS[w.k] ?? 2 });
  }
  const mapped = lines.slice(0, limit('water', ctx.phone)), words = [];
  if (!mapped.length && !ponds.length) words.push('No streams, ditches or ponds are mapped on this land.');
  let rain = [];
  if (ctx.heights !== undefined && hasHeights(ctx.heights)) {
    rain = flowPaths(ctx.heights).cells.slice(0, limit('rain', ctx.phone) * 40);
    if (!rain.length) words.push('No rain path shows in the height map here.');
  }
  words.push('Mapped water is from OpenStreetMap volunteers. Rain paths are worked out here from the height map, not seen.');
  return { id: 'water', state: 'ready', items: mapped, ponds, rain, words };
}
const median = a => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ---- 9. hedges and woods: lines raised to the tree map's median height where it holds one, else a flat band; no height is invented
export const HEDGE_WIDTH = 2, ROW_WIDTH = 4, HEDGE_WOOD_COLOUR = '#2f7d4a';
export function hedgesLayer(ctx) {
  const a = ctx.osm;
  if (a === undefined) return waiting('hedges', 'the map of hedges and woods');
  if (a?.failed) return cannot('hedges', 'Hedges, woods', a.failed);
  const lines = [], woods = []; let flat = 0;
  for (const t of a?.trees || []) {
    const pts = toLocal(ctx.frame, t.p);
    if (t.area || t.k === 'wood' || t.k === 'scrub') { woods.push({ polygon: pts, kind: t.k }); continue; }
    let height = null;
    if (typeof ctx.treeAt === 'function') {
      const hs = []; for (let i = 0; i < pts.length - 1; i++) for (let s = 0; s <= 4; s++) { const v = ctx.treeAt(pts[i].x + (pts[i + 1].x - pts[i].x) * s / 4, pts[i].z + (pts[i + 1].z - pts[i].z) * s / 4); if (Number.isFinite(v) && v > 0) hs.push(v); }
      if (hs.length) height = median(hs);
    }
    if (height == null) flat++;
    lines.push({ points: pts, kind: t.k, width: t.k === 'row' ? ROW_WIDTH : HEDGE_WIDTH, height });
  }
  const cap = limit('trees', ctx.phone);
  if (!lines.length && !woods.length) return { id: 'hedges', state: 'ready', items: [], woods: [], words: ['No hedges, tree rows or woods are mapped on this land.'] };
  const words = [`${lines.length} hedge or tree-row line${lines.length === 1 ? '' : 's'} and ${woods.length} wood${woods.length === 1 ? '' : 's'} drawn.`];
  if (flat) words.push('Where the tree map holds no height along a line, only a flat band is drawn: no height is invented.');
  return { id: 'hedges', state: 'ready', items: lines.slice(0, cap), woods: woods.slice(0, cap), words };
}

// ---- 10. wet spots: low places where rain would collect, from the height map
// How deep a hollow must be to count, by the height map's cell: lidar under 2 m cells 0.2 m, 2 to 10 m cells 0.4 m, coarser (30 m) 0.8 m. At least 60 m² to be named.
export const hollowDepth = cell => (cell < 2 ? 0.2 : cell <= 10 ? 0.4 : 0.8);
export const HOLLOW_MIN_M2 = 60;
// Fill every hollow up to the level where it would spill (a priority flood from the edge), and name the places the fill is deep enough.
export function hollows(model, minDepth = hollowDepth(Math.min(model.cellX, model.cellZ)), minArea = HOLLOW_MIN_M2) {
  const { nx, ny } = model, n = nx * ny, h = model.h, filled = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
  const heap = []; const push = (k, v) => { heap.push([v, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (; ;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (let k = 0; k < n; k++) { const i = k % nx, j = (k / nx) | 0; if ((i === 0 || j === 0 || i === nx - 1 || j === ny - 1 || !(h[k] === h[k])) && h[k] === h[k]) { filled[k] = h[k]; done[k] = 1; push(k, h[k]); } }
  // a missing height lets water escape (it never fills a hollow): its neighbours start from their own height
  for (let k = 0; k < n; k++) if (!(h[k] === h[k])) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = (k % nx) + di, b = ((k / nx) | 0) + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const q = b * nx + a; if (h[q] === h[q] && !done[q]) { filled[q] = h[q]; done[q] = 1; push(q, h[q]); } }
  while (heap.length) {
    const [v, k] = pop(), i = k % nx, j = (k / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const q = b * nx + a; if (done[q] || !(h[q] === h[q])) continue;
      done[q] = 1; filled[q] = Math.max(h[q], v); push(q, filled[q]);
    }
  }
  const wet = new Uint8Array(n); for (let k = 0; k < n; k++) if (h[k] === h[k] && filled[k] - h[k] >= minDepth) wet[k] = 1;
  const seen = new Uint8Array(n), cellArea = model.cellX * model.cellZ, out = [];
  for (let k = 0; k < n; k++) {
    if (!wet[k] || seen[k]) continue;
    const stack = [k]; seen[k] = 1; let count = 0, deep = 0, sx = 0, sz = 0; const cells = [];
    while (stack.length) {
      const c = stack.pop(), i = c % nx, j = (c / nx) | 0; count++; deep = Math.max(deep, filled[c] - h[c]); cells.push(c);
      const [x, z] = nodeXZ(model, i, j); sx += x; sz += z;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const q = b * nx + a; if (wet[q] && !seen[q]) { seen[q] = 1; stack.push(q); } }
    }
    if (count * cellArea >= minArea) out.push({ area: count * cellArea, depth: deep, x: sx / count, z: sz / count, cells });
  }
  return out.sort((p, q) => q.area - p.area);
}
export function wetLayer(ctx) {
  if (ctx.heights === undefined) return waiting('wet', "the land's heights");
  if (!hasHeights(ctx.heights)) return { id: 'wet', state: 'cannot', words: [NO_HEIGHTS], items: [] };
  const depth = hollowDepth(Math.min(ctx.heights.cellX, ctx.heights.cellZ)), list = hollows(ctx.heights, depth).slice(0, limit('hollows', ctx.phone));
  const guard = 'A drain, a pipe or a culvert is not in the height map, so water may leave where this says it stays.';
  if (!list.length) return { id: 'wet', state: 'ready', items: [], depth, words: [`No low place deeper than ${depth} m shows in the height map here.`, guard] };
  const total = list.reduce((s, p) => s + p.area, 0), maxDepth = Math.max(...list.map(p => p.depth));
  const onFields = (ctx.fields || []).length ? list.filter(p => (ctx.fields || []).some(f => insidePolygon(p.x, p.z, f.polygon))).length : 0;
  return { id: 'wet', state: 'ready', items: list, depth, total, words: [`${list.length} low place${list.length === 1 ? '' : 's'} where rain would collect, about ${num(Math.round(total / 10) * 10)} m² in all and up to ${Math.round(maxDepth * 100)} cm deep; ${onFields} on your fields. Worked out from the height map: a guess, not a sighting.`, guard] };
}

// ---- the one door: a layer's state for a switch, from the sources as they stand
// ctx: {span, units, phone, frame, fields:[{id, name, polygon}], chosen, heights (heightModel or undefined / {failed}), soil, cover, osm, treeAt}
export function layerOf(id, ctx) {
  const c = { ...ctx };
  if (c.heights?.failed) c.heights = { flat: true, failedReason: c.heights.failed };
  switch (id) {
    case 'scale': return scaleLayer(c);
    case 'edges': return edgesLayer(c);
    case 'contours': return contoursLayer(c);
    case 'soil': return soilLayer(c);
    case 'cover': return coverLayer(c);
    case 'buildings': return buildingsLayer(c);
    case 'roads': return roadsLayer(c);
    case 'water': return waterLayer(c);
    case 'hedges': return hedgesLayer(c);
    case 'wet': return wetLayer(c);
    default: return { id, state: 'cannot', words: ['Unknown switch.'], items: [] };
  }
}
// The legend for the cover colours: only what is in the answer
export const coverLegend = shares => shares.map(s => ({ name: s.short, colour: s.colour, share: Math.round(s.share * 100) }));
export { frameAt };
