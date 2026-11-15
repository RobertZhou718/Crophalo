// The layers of the 3D view of My farm: the real picture of the ground, and facts about the land draped over it one at a time (slope first; sun and shade, erosion exposure and frost pockets next).
// A drape is a small picture the size of the height grid, drawn over the real picture with some transparency. The rules are the map's own (js/terrain-math.js): one fact has one rule.
// Pure: the grid of heights goes in, colours and a legend come out. Checked by scripts/test_layers3d.mjs (a synthetic hill with known slopes, the classes, the legend, the missing heights) and scripts/e2e_farm3d.mjs.
import { SLOPE_CLASSES, slopePercent, slopeClass, FROST_CLASSES, frostClass, frostRadius, EROSION_CLASSES, erosionClass, sFactor, erosionFactor, williamsK } from './terrain-math.js';
import { frameAt } from './farm3d-data.js';

export const DRAPES = Object.freeze(['slope', 'erosion', 'frost', 'greenness']);   // the layers worked out here that go over the picture, one at a time (Sun and shade is the shade of the view, which has its own hour)
export const LAYER_LIST = Object.freeze([
  { id: 'picture', name: 'Satellite picture', line: 'A real picture of the ground, taken from space.', group: 'base' },
  { id: 'slope', name: 'Slope', line: 'How steep the ground is, from the heights.', group: 'drape', needs: 'heights' },
  { id: 'erosion', name: 'Erosion exposure', line: 'Where rain could wash soil away: slope, soil and rain together, a relative index.', group: 'drape', needs: 'heights' },
  { id: 'frost', name: 'Frost pockets', line: 'Low spots where cold air settles and frost comes first.', group: 'drape', needs: 'heights' },
  { id: 'greenness', name: 'Greenness of this field', line: 'How green each 30 m square of the field looked, season after season.', group: 'drape', needs: 'greenness' },
]);
export const NEEDS_EROSION = 'Erosion exposure needs the soil and the rain of this field. They are read when the field is opened in My farm.';
export const NEEDS_GREENNESS = 'Greenness is read when you press Find weak spots.';
export const NEEDS_HEIGHTS = 'The land heights were not read, so this cannot be drawn.';
const DRAPE_ALPHA = 0.62;

const rgbOf = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
// The slope of every cell of the height grid as a percentage, by Horn's method on the true size of a cell (the edge cells use the cell they stand on). NaN where a height is missing.
export function slopeGrid(model) {
  const { nx, ny, h, cellX, cellZ } = model, out = new Float32Array(nx * ny);
  const at = (r, c) => h[Math.min(ny - 1, Math.max(0, r)) * nx + Math.min(nx - 1, Math.max(0, c))];
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const a = at(r - 1, c - 1), b = at(r - 1, c), cc = at(r - 1, c + 1), d = at(r, c - 1), f = at(r, c + 1), g = at(r + 1, c - 1), hh = at(r + 1, c), i = at(r + 1, c + 1);
    const dx = ((cc + 2 * f + i) - (a + 2 * d + g)) / (8 * cellX), dy = ((g + 2 * hh + i) - (a + 2 * b + cc)) / (8 * cellZ);
    out[r * nx + c] = at(r, c) === at(r, c) ? slopePercent(dx, dy) : NaN;   // NaN where this square's own height, or any of its eight neighbours', is missing: no slope is made up
  }
  return out;
}
// The legend of a layer: a colour and the words for each class that is drawn.
export const legendOf = id => id === 'slope' ? SLOPE_CLASSES.filter(k => k.colour).map(k => ({ colour: k.colour, label: `${k.range} · ${k.words}` }))
  : id === 'frost' ? FROST_CLASSES.map(k => ({ colour: k.colour, label: `${k.words} · ${k.rule}` }))
  : id === 'erosion' ? EROSION_CLASSES.filter(k => k.colour).map(k => ({ colour: k.colour, label: `${k.range} · ${k.words}` }))
  : id === 'greenness' ? GREEN_CLASSES.map(k => ({ colour: k.colour, label: `${k.range} · ${k.words}` })) : [];
const fill = (rgba, k, colour) => { const [r, g, b] = rgbOf(colour); rgba[k * 4] = r; rgba[k * 4 + 1] = g; rgba[k * 4 + 2] = b; rgba[k * 4 + 3] = Math.round(255 * DRAPE_ALPHA); };

// ---- frost pockets: a height against the average height within 300 m (a topographic position index), on gentle ground only; the average is worked out from a summed-area table. Squares near the edge of the view average what lies inside it.
export function frostGrid(model) {
  const { nx, ny, h, cellX, cellZ } = model, r = frostRadius(Math.max(1e-6, (cellX + cellZ) / 2)), sat = new Float64Array((nx + 1) * (ny + 1)), cnt = new Int32Array((nx + 1) * (ny + 1));
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const v = h[y * nx + x], ok = v === v, i = (y + 1) * (nx + 1) + x + 1; sat[i] = (ok ? v : 0) + sat[i - 1] + sat[i - nx - 1] - sat[i - nx - 2]; cnt[i] = (ok ? 1 : 0) + cnt[i - 1] + cnt[i - nx - 1] - cnt[i - nx - 2]; }
  const slope = slopeGrid(model), out = new Int8Array(nx * ny).fill(-1);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const v = h[y * nx + x]; if (!(v === v)) continue;
    const x0 = Math.max(0, x - r), x1 = Math.min(nx - 1, x + r), y0 = Math.max(0, y - r), y1 = Math.min(ny - 1, y + r), at = (a, b) => b * (nx + 1) + a;
    const n = cnt[at(x1 + 1, y1 + 1)] - cnt[at(x0, y1 + 1)] - cnt[at(x1 + 1, y0)] + cnt[at(x0, y0)], sum = sat[at(x1 + 1, y1 + 1)] - sat[at(x0, y1 + 1)] - sat[at(x1 + 1, y0)] + sat[at(x0, y0)];
    out[y * nx + x] = n > 0 ? frostClass(v - sum / n, slope[y * nx + x], v) : -1;
  }
  return out;
}
// ---- erosion exposure: E = S(slope) × (K / K of loam) × (MFI / 100 mm) as on the map; the soil's K and the rain's MFI are handed in by My farm (input: { factor } or { soil: { sand, silt, clay, carbon }, mfi })
export const erosionFactorOf = input => Number.isFinite(input?.factor) ? input.factor : (input?.soil && Number.isFinite(input.mfi) ? erosionFactor(williamsK(input.soil), input.mfi) : null);
export function erosionGrid(model, factor) {
  const sg = slopeGrid(model), out = new Float32Array(sg.length);
  for (let k = 0; k < sg.length; k++) out[k] = sg[k] === sg[k] ? sFactor(sg[k] / 100) * factor : NaN;
  return out;
}
// ---- greenness (the weak-spots answer): the average NDVI of each 30 m square over the passes the page keeps (a pass counts when 60 % of the squares inside the field were clear), clouds and the like (null) never counted as zero
export const GREEN_CLASSES = Object.freeze([
  { upTo: 0.2, range: 'under 0.2', words: 'bare ground or dead plants', colour: '#8c510a' }, { upTo: 0.4, range: '0.2 to 0.4', words: 'sparse or young plants', colour: '#d8b365' },
  { upTo: 0.6, range: '0.4 to 0.6', words: 'growing', colour: '#a6d96a' }, { upTo: 0.8, range: '0.6 to 0.8', words: 'healthy green', colour: '#1a9641' }, { upTo: Infinity, range: 'over 0.8', words: 'thick healthy green', colour: '#006837' },
]);
export const greenClass = v => { for (let i = 0; i < GREEN_CLASSES.length; i++) if (v < GREEN_CLASSES[i].upTo) return i; return GREEN_CLASSES.length - 1; };
export function greenSquares(answer, slab, minClear = 0.6) {
  if (!answer || answer.ok !== true || !Array.isArray(answer.cells) || !Array.isArray(answer.passes)) return null;
  const frame = frameAt(slab.lat, slab.lon), passes = answer.passes.filter(p => Array.isArray(p.ndvi) && p.ndvi.length === answer.cells.length && (p.clear_share ?? 1) >= minClear), squares = [];
  answer.cells.forEach((c, k) => {
    if (c.inside === false || !Array.isArray(c.corners)) return;
    let sum = 0, n = 0; for (const p of passes) { const v = p.ndvi[k]; if (typeof v === 'number' && Number.isFinite(v)) { sum += v; n++; } }
    if (!n) return;   // no clear look at this square: nothing is drawn there
    squares.push({ value: sum / n, looks: n, pts: c.corners.map(([lon, lat]) => { const q = frame.toXZ(lat, lon); return { x: q.x, z: q.z }; }) });
  });
  return { squares, passes: passes.length, cells: answer.cells.filter(c => c.inside !== false).length };
}
// The drape of a layer: a raster on the height grid ({ w, h, rgba, counts, drawn }) or, for the greenness, squares ({ polys }). input is what the layer needs besides the heights.
export function drapeOf(id, model, input = {}) {
  if (id === 'greenness') {
    const g = input.green; if (!g?.squares?.length) return null;
    const polys = g.squares.map(sq => ({ pts: sq.pts, colour: GREEN_CLASSES[greenClass(sq.value)].colour })), counts = GREEN_CLASSES.map(() => 0); g.squares.forEach(sq => counts[greenClass(sq.value)]++);
    return { id, polys, counts, drawn: polys.length, cells: g.cells, passes: g.passes };
  }
  if (!model || model.flat) return null;
  const nx = model.nx, ny = model.ny, rgba = new Uint8ClampedArray(nx * ny * 4); let drawn = 0, counts = [];
  if (id === 'slope') {
    const sg = slopeGrid(model); counts = SLOPE_CLASSES.map(() => 0);
    for (let k = 0; k < sg.length; k++) { const cls = slopeClass(sg[k]); if (cls < 0) continue; counts[cls]++; const colour = SLOPE_CLASSES[cls].colour; if (!colour) continue; fill(rgba, k, colour); drawn++; }
  } else if (id === 'frost') {
    const fg = frostGrid(model); counts = FROST_CLASSES.map(() => 0);
    for (let k = 0; k < fg.length; k++) { const cls = fg[k]; if (cls < 0) continue; counts[cls]++; fill(rgba, k, FROST_CLASSES[cls].colour); drawn++; }
  } else if (id === 'erosion') {
    const factor = erosionFactorOf(input.erosion); if (factor === null || !(factor >= 0)) return null;   // nothing handed in is no factor (never read as zero)
    const eg = erosionGrid(model, factor); counts = EROSION_CLASSES.map(() => 0);
    for (let k = 0; k < eg.length; k++) { const cls = erosionClass(eg[k]); if (cls < 0) continue; counts[cls]++; const colour = EROSION_CLASSES[cls].colour; if (!colour) continue; fill(rgba, k, colour); drawn++; }
  } else return null;
  return { id, w: nx, h: ny, rgba, counts, drawn };
}
// One plain sentence about what the drape shows on this land.
export function drapeWords(id, d) {
  if (!d) return NEEDS_HEIGHTS;
  const all = d.w ? d.w * d.h : d.cells;
  if (id === 'slope') return d.drawn ? `${d.drawn} of ${all} squares of the land are steeper than 2 %. Ground under 2 % is left clear.` : 'The land is nearly level, under 2 % everywhere, so nothing is coloured.';
  if (id === 'frost') return d.drawn ? `Cold air may settle on ${d.drawn} of ${all} squares. Near the edge of the view the low ground can be missed, because the land beyond it is not in the height map.` : 'No low spot where cold air settles shows on this land.';
  if (id === 'erosion') return d.drawn ? `${d.drawn} of ${all} squares are at moderate exposure or more. It is a relative index, not tonnes of soil lost.` : 'Erosion exposure is low everywhere on this land.';
  if (id === 'greenness') return `${d.drawn} of ${d.cells} squares of the field are coloured, from ${d.passes} clear look${d.passes === 1 ? '' : 's'}. A square with no clear look is left empty.`;
  return '';
}
