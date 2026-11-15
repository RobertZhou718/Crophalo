// The 3D farm's slope view, pure: the slope of every cell of the height map over its own cell size, four bands drawn as patterns (never colour alone),
// each field's slope by a least-squares plane (never the mean of cell slopes, which reads noise as slope), the way water runs, the contour rules, and the words.
// The farmer's own marks (slope, downhill direction) always win over the map. No page, no storage, no network, nothing random.
// Frame: metres, +x east, +z south, from the middle of the land block. Checked by scripts/test_land3d.mjs.
import { insidePolygon, areaOf, heightAtMesh } from './farm3d-data.js';
import { contourStep, contourLevels, bearingOf } from './land3d-data.js';

// The four bands: under 2%, 2 to 6%, 6 to 12%, over 12%, each a pattern on a tint, with navy marks.
export const BANDS = Object.freeze([
  { id: 'flat', name: 'Under 2%', from: 0, to: 2, pattern: 'plain', tint: '#f2f2f4', mark: '#0b2545' },
  { id: 'gentle', name: '2 to 6%', from: 2, to: 6, pattern: 'dots', tint: '#f2c14e', mark: '#0b2545' },
  { id: 'moderate', name: '6 to 12%', from: 6, to: 12, pattern: 'lines', tint: '#e8943a', mark: '#0b2545' },
  { id: 'steep', name: 'Over 12%', from: 12, to: Infinity, pattern: 'crossed', tint: '#8a5a3c', mark: '#0b2545' },
]);
export const bandOf = pct => (Number.isFinite(pct) ? (pct < 2 ? BANDS[0] : pct < 6 ? BANDS[1] : pct < 12 ? BANDS[2] : BANDS[3]) : null);
export const WATER_BLUE = '#2670cc', MARK_NAVY = '#0b2545';
export const STEEPEST_MIN_CELLS = 25;     // the steepest part is named from this many cells
export const MIN_FIELD_CELLS = 4;         // a plane needs at least this many height cells
const compass8 = deg => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const nodeXZ = (m, i, j) => [-m.width / 2 + i * m.cellX, -m.depth / 2 + j * m.cellZ];

// The slope of each node in percent, from the heights on both sides over the map's own cell size; NaN where a neighbour is missing (never filled in).
export function cellSlopes(model) {
  const { nx, ny } = model, out = new Float32Array(nx * ny).fill(NaN), h = model.h;
  if (model.flat) return out;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(ny - 1, j + 1);
    const a = h[j * nx + i0], b = h[j * nx + i1], c = h[j0 * nx + i], d = h[j1 * nx + i];
    if (![a, b, c, d].every(v => v === v)) continue;
    const gx = (b - a) / ((i1 - i0) * model.cellX), gz = (d - c) / ((j1 - j0) * model.cellZ);
    out[j * nx + i] = Math.hypot(gx, gz) * 100;
  }
  return out;
}
// The fraction of a field's cells in each band
export function bandShares(model, polygon) {
  const s = cellSlopes(model), counts = [0, 0, 0, 0]; let n = 0;
  for (let j = 0; j < model.ny; j++) for (let i = 0; i < model.nx; i++) {
    const v = s[j * model.nx + i]; if (!(v === v)) continue;
    const [x, z] = nodeXZ(model, i, j); if (!insidePolygon(x, z, polygon)) continue;
    counts[BANDS.indexOf(bandOf(v))]++; n++;
  }
  return { n, shares: n ? counts.map(c => c / n) : [0, 0, 0, 0] };
}
// A field's slope: the plane through its height cells (least squares). slope in percent and the downhill compass bearing; cells = how many heights it stands on.
export function fieldSlope(model, polygon) {
  const pts = [];
  for (let j = 0; j < model.ny; j++) for (let i = 0; i < model.nx; i++) { const v = model.h[j * model.nx + i]; if (!(v === v)) continue; const [x, z] = nodeXZ(model, i, j); if (insidePolygon(x, z, polygon)) pts.push([x, z, v]); }
  if (pts.length < MIN_FIELD_CELLS) return { cells: pts.length, tooSmall: true };
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, mz = pts.reduce((s, p) => s + p[1], 0) / n, mh = pts.reduce((s, p) => s + p[2], 0) / n;
  let sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
  for (const [x, z, v] of pts) { const dx = x - mx, dz = z - mz, dh = v - mh; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; sxh += dx * dh; szh += dz * dh; }
  const det = sxx * szz - sxz * sxz;
  if (!(Math.abs(det) > 1e-9)) return { cells: n, tooSmall: true };   // all the cells on one line: no plane
  const gx = (sxh * szz - szh * sxz) / det, gz = (szh * sxx - sxh * sxz) / det, pct = Math.hypot(gx, gz) * 100;
  return { cells: n, tooSmall: false, pct, downhill: pct < 0.05 ? null : bearingOf(-gx, -gz), gx, gz };
}
// The steepest part of a field: the 95th percentile of its cell slopes, named only from 25 cells or more
export function steepest(model, polygon) {
  const s = cellSlopes(model), v = [];
  for (let j = 0; j < model.ny; j++) for (let i = 0; i < model.nx; i++) { const x = s[j * model.nx + i]; if (!(x === x)) continue; const [px, pz] = nodeXZ(model, i, j); if (insidePolygon(px, pz, polygon)) v.push(x); }
  if (v.length < STEEPEST_MIN_CELLS) return { cells: v.length, pct: null };
  v.sort((a, b) => a - b);
  return { cells: v.length, pct: v[Math.min(v.length - 1, Math.floor(0.95 * v.length))] };
}

// ---- the whole view for the fields. fields: [{id, name, polygon, own?: {pct, downhill}}]; source: {name, res_m} of the height map.
// The farmer's own measure wins: its slope, its direction; the map fills only what the farmer did not say.
export function slopeView(model, fields, source = {}) {
  const read = model && !model.flat && model.h;
  const out = { read: !!read, bands: BANDS, fields: [], words: [] };
  for (const f of fields || []) {
    const own = f.own || {}, ownPct = Number.isFinite(own.pct) ? own.pct : null, ownDir = Number.isFinite(own.downhill) ? own.downhill : null;
    const map = read ? fieldSlope(model, f.polygon) : null, st = read ? steepest(model, f.polygon) : null;
    const pct = ownPct ?? (map && !map.tooSmall ? map.pct : null), dir = ownDir ?? (map && !map.tooSmall ? map.downhill : null);
    const pctFrom = ownPct != null ? 'you' : 'map', dirFrom = ownDir != null ? 'you' : 'map';
    let sentence;
    const bit = from => from === 'you' ? 'from you' : `from ${source.name || 'the height map'}`;
    if (pct == null) {
      sentence = !read ? `${f.name}: the slope cannot be worked out: the ground heights were not read.` : `${f.name}: too small to work out its slope (${map?.cells ?? 0} height cells).`;
    } else {
      const toward = dir == null ? 'the land is level, so no way is downhill' : `water runs toward the ${compass8(dir)}${dirFrom === 'you' ? ' (from you)' : ''}`;
      sentence = `${f.name}: slope ${pct.toFixed(1)}% (${bit(pctFrom)}), ${toward}.`;
      if (pctFrom === 'map' && st) sentence += st.pct != null ? ` Its steepest part is about ${st.pct.toFixed(1)}%.` : ` Too small to say where it is steepest (${st.cells} height cells).`;
    }
    const longer = Math.max(...(f.polygon.map(p => p.x)), 0) - Math.min(...f.polygon.map(p => p.x)), tall = Math.max(...f.polygon.map(p => p.z)) - Math.min(...f.polygon.map(p => p.z));
    const c = f.polygon.reduce((s, p) => ({ x: s.x + p.x / f.polygon.length, z: s.z + p.z / f.polygon.length }), { x: 0, z: 0 });
    out.fields.push({
      id: f.id, name: f.name, pct, band: bandOf(pct), downhill: dir, source: { slope: pct == null ? null : pctFrom, direction: dir == null ? null : dirFrom }, steepest: st?.pct ?? null,
      shares: read ? bandShares(model, f.polygon).shares : null, words: sentence,
      // a blue arrow the way water runs on each field that has no arrow of the farmer's own, 45% of the longer side
      arrow: dir != null && !f.ownArrow ? { from: c, bearing: dir, length: 0.45 * Math.max(longer, tall), colour: WATER_BLUE } : null,
      ownMarks: ownPct != null || ownDir != null,
    });
  }
  out.words = out.fields.map(f => f.words);
  return out;
}

// ---- the drawer's words
export function drawerWords(model, source = {}) {
  const read = model && !model.flat && model.h, lines = [];
  if (!read) {
    lines.push('Slope cannot be worked out here: the ground heights were not read. Your own marks still show.');
  } else {
    const cell = Math.min(model.cellX, model.cellZ), every = cell >= 10 ? Math.round(cell) : cell.toFixed(1);
    lines.push(`Slope from ${source.name || 'the height map'}, one height every ${every} m. Small bumps, banks and ditches are not in it. Your own measure wins.`);
    const { step, rise } = contourLevels(model);
    lines.push(rise < 5 ? 'The land here rises less than 5 m, so no contour line is drawn.' : `Contour lines every ${step} m of height.`);
  }
  lines.push('Blue arrows lie the way water runs downhill.', 'Plants are hidden while the slope is shown. Your own marks, drawn in navy, win over the map.');
  return lines;
}
export const SLOPE_LINE = 'Slope shown on the fields: patterns for four slope bands, contour lines and arrows where water runs.';
// The step contour lines are drawn at while the slope is shown (the data's own, never finer than the map)
export const contourStepFor = model => contourStep(Math.min(model.cellX, model.cellZ));
