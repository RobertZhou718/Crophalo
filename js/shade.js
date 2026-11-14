// Crophalo's shade: for every spot of a piece of land, which way the horizon stands and so when the sun reaches it.
// Pure (no page, no storage, no network) so it runs in a background worker (js/shade-worker.js) or, on a phone without one, on the page in slices.
// A spot sees a horizon made of the near land and trees (out to 300 m, from the grid given) and the far hills (a horizon the server read from the
// Copernicus heights to 20 km). The sun is in sight when it stands higher than that horizon. Every figure is "about, to the half hour". Checked by scripts/test_shade.mjs.
/*
 * Coordinates: metres, +x east, +z south (the 3D scene's own), heights up. Directions: 72, every 5° clockwise from north, angles kept in 0.5° steps (one byte).
 * RULE: a missing height never shades and never clears: a spot with no height is "bad", never clear sky.
 */
import { sunAt, sunEvents, clock } from './sun.js';

export const DIRS = 72, DIR_DEG = 5, ANGLE_UNIT = 0.5, NEAR_RANGE = 300;
export const MOMENT = { SUN: 0, LAND: 1, TREES: 2, HILLS: 3, UNDER: 4, DOWN: 5, BAD: 6, OUT: 255 };
const RAD = Math.PI / 180;
const DIR_SIN = Float64Array.from({ length: DIRS }, (_, k) => Math.sin(k * DIR_DEG * RAD));
const DIR_COS = Float64Array.from({ length: DIRS }, (_, k) => Math.cos(k * DIR_DEG * RAD));
const TREE_UNDER = 3;   // a spot under a tree of 3 m or more is "under"

// ---- the words: "about, to the half hour"
export const RECIPE = 'About, to the half hour. In tests against laser scans it was about half an hour too sunny per day near trees.';
export function hoursWords(hours) {   // 6½ h, ½ h, 7 h
  if (!Number.isFinite(hours)) return 'not read';
  const halves = Math.round(hours * 2), whole = Math.floor(halves / 2), half = halves % 2;
  if (halves === 0) return 'less than ¼ h';
  return (whole ? String(whole) : '') + (half ? '½' : '') + ' h';
}
export const aboutTime = (ms, opts) => ms == null ? '' : 'about ' + clock(Math.round(ms / 600000) * 600000, opts);   // shade times to 10 minutes
export const EDGE_WORDS = { north: 'north', east: 'east', south: 'south', west: 'west' };
export function stripWords(strip, opts) {
  const w = Math.max(5, Math.round(strip.width / 5) * 5), edge = EDGE_WORDS[strip.edge];
  const cause = { trees: 'of trees', hills: 'of the hills', land: 'of the land' }[strip.cause] || 'of the land';
  if (strip.sunless) return `A strip about ${w} m wide along the ${edge} edge gets no direct sun on this day (shade ${cause}).`;
  return `A strip about ${w} m wide along the ${edge} edge is in the shade ${cause} until ${aboutTime(strip.firstSunMs, opts)}.`;
}

// ---- the grid a job is given: {nx, ny, x0, z0, dx, dz, ground: Float32Array, trees?: Uint8Array/Float32Array (whole metres, 0 none)}; NaN in ground is a missing height
export function surfaceAt(grid, x, z) {   // the surface height at a point (nearest node); NaN when missing or off the grid
  const i = Math.round((x - grid.x0) / grid.dx), j = Math.round((z - grid.z0) / grid.dz);
  if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) return NaN;
  const k = j * grid.nx + i;
  return grid.ground[k] + (grid.trees ? grid.trees[k] : 0);
}
export function groundAt(grid, x, z) {   // the ground height, bilinear between the four nodes; NaN when any is missing
  const fx = (x - grid.x0) / grid.dx, fz = (z - grid.z0) / grid.dz;
  const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= grid.nx - 1 || j >= grid.ny - 1) { const ii = Math.round(fx), jj = Math.round(fz); return ii < 0 || jj < 0 || ii >= grid.nx || jj >= grid.ny ? NaN : grid.ground[jj * grid.nx + ii]; }
  const tx = fx - i, tz = fz - j, k = j * grid.nx + i, g = grid.ground;
  return (g[k] * (1 - tx) + g[k + 1] * tx) * (1 - tz) + (g[k + grid.nx] * (1 - tx) + g[k + grid.nx + 1] * tx) * tz;
}
const treeAt = (grid, x, z) => {
  if (!grid.trees) return 0;
  const i = Math.round((x - grid.x0) / grid.dx), j = Math.round((z - grid.z0) / grid.dz);
  return i < 0 || j < 0 || i >= grid.nx || j >= grid.ny ? 0 : grid.trees[j * grid.nx + i];
};

// ---- the spots: a lattice over the land's box, only nodes inside a land polygon are worked
export function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, za] = poly[a], [xb, zb] = poly[b];
    if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) inside = !inside;
  }
  return inside;
}
// The step is the smallest of 2, 3, 4, 5, 10, 15, 20, 30 m that keeps the spots inside the land to the limit (90,000 on a computer, 25,000 on a phone; phones start at 4 m).
export function chooseStep(areaM2, phone = false) {
  const limit = phone ? 25000 : 90000;
  for (const s of phone ? [4, 5, 10, 15, 20, 30] : [2, 3, 4, 5, 10, 15, 20, 30]) if (areaM2 / (s * s) <= limit) return s;
  return 30;
}
export function polygonArea(poly) { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] * poly[i][1]) - (poly[i][0] * poly[j][1]); return Math.abs(a) / 2; }
export function makeLattice(polys, step) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of polys) for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  // nodes sit in the middle of their cells, so a box 100 m wide at 10 m has ten spots, none half on the border
  const nx = Math.max(1, Math.floor((x1 - x0) / step)), ny = Math.max(1, Math.floor((z1 - z0) / step));
  x0 += (x1 - x0 - (nx - 1) * step) / 2; z0 += (z1 - z0 - (ny - 1) * step) / 2;
  const inside = new Uint8Array(nx * ny);
  let count = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, z = z0 + j * step;
    if (polys.some(p => pointInPolygon(x, z, p))) { inside[j * nx + i] = 1; count++; }
  }
  return { x0, z0, step, nx, ny, inside, count };
}

// ---- the near horizon: for each spot and direction the highest angle to the surface out to 300 m, in 0.5° steps (one byte), with a tree bit.
// A march of one cell at a time for the first 20 m, then 3% of the distance; a ray stops once it is above the grid's highest point.
export function nearHorizon(grid, lat, { onSlice } = {}) {
  const L = grid.lattice, n = L.nx * L.ny;
  const angles = new Uint8Array(n * DIRS), treeBits = new Uint8Array(n * DIRS), under = new Uint8Array(n), bad = new Uint8Array(n);
  let top = -Infinity;
  for (let k = 0; k < grid.ground.length; k++) { const s = grid.ground[k] + (grid.trees ? grid.trees[k] : 0); if (s > top) top = s; }
  const cell = Math.min(grid.dx, grid.dz);
  // the highest surface in each block of about 24 m: a ray goes straight across a block that holds nothing tall enough to matter
  const bs = Math.max(1, Math.round(24 / cell)), bnx = Math.ceil(grid.nx / bs), bny = Math.ceil(grid.ny / bs);
  const blockTop = new Float32Array(bnx * bny).fill(-Infinity);
  for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    const q = j * grid.nx + i, g = grid.ground[q];
    if (g === g) { const v = g + (grid.trees ? grid.trees[q] : 0), b = ((j / bs) | 0) * bnx + ((i / bs) | 0); if (v > blockTop[b]) blockTop[b] = v; }
  }
  for (let idx = 0; idx < n; idx++) {
    if (!L.inside[idx]) continue;
    const x = L.x0 + (idx % L.nx) * L.step, z = L.z0 + Math.floor(idx / L.nx) * L.step;
    const h0 = groundAt(grid, x, z);
    if (!Number.isFinite(h0)) { bad[idx] = 1; continue; }     // never clear sky
    if (treeAt(grid, x, z) >= TREE_UNDER) { under[idx] = 1; continue; }
    const gx = grid.x0, gz = grid.z0, rdx = 1 / grid.dx, rdz = 1 / grid.dz, gn = grid.nx, gm = grid.ny, G = grid.ground, T = grid.trees, hi = top - h0, near4 = 20;
    for (let k = 0; k < DIRS; k++) {
      const sx = DIR_SIN[k], sz = -DIR_COS[k];
      let best = 0, treeHit = 0, d = cell;     // best is a slope (rise over run); the angle is taken once, at the end
      while (d <= NEAR_RANGE) {
        const fi = (x + sx * d - gx) * rdx, fj = (z + sz * d - gz) * rdz;
        if (fi < -0.5 || fj < -0.5 || fi >= gn - 0.5 || fj >= gm - 0.5) break;
        const q = ((fj + 0.5) | 0) * gn + ((fi + 0.5) | 0);
        // close to the spot the ground is read bilinear, so a slope is not made steeper or flatter by the nearest node's rounding
        let g;
        if (d < near4 && fi >= 0 && fj >= 0 && fi < gn - 1 && fj < gm - 1) {
          const i0 = fi | 0, j0 = fj | 0, tx = fi - i0, tz = fj - j0, k0 = j0 * gn + i0;
          g = (G[k0] * (1 - tx) + G[k0 + 1] * tx) * (1 - tz) + (G[k0 + gn] * (1 - tx) + G[k0 + gn + 1] * tx) * tz;
        } else g = G[q];
        if (g === g) {   // a missing height shades nothing
          const t = T ? T[q] : 0, rise = g + t - h0;
          if (rise > best * d) { best = rise / d; treeHit = t > 0 && g - h0 < rise ? 1 : 0; }
        }
        if (hi <= best * d) break;     // above the highest point: nothing further can beat it
        if (d < 20) { d += cell; continue; }
        const bi = (((fi + 0.5) | 0) / bs) | 0, bj = (((fj + 0.5) | 0) / bs) | 0;
        if (blockTop[bj * bnx + bi] - h0 <= best * d) {   // nothing in this block can beat the horizon so far: on to where the ray leaves it
          const dfi = sx * rdx, dfj = sz * rdz;
          const ex = dfi > 1e-12 ? ((bi + 1) * bs - 0.5 - fi) / dfi : dfi < -1e-12 ? (bi * bs - 0.5 - fi) / dfi : Infinity;
          const ez = dfj > 1e-12 ? ((bj + 1) * bs - 0.5 - fj) / dfj : dfj < -1e-12 ? (bj * bs - 0.5 - fj) / dfj : Infinity;
          d += Math.max(Math.min(ex, ez) + 0.02 * cell, 0.01 * d);
        } else d *= 1.03;
      }
      const b = Math.min(255, Math.round(Math.atan(best) / RAD / ANGLE_UNIT));
      angles[idx * DIRS + k] = b; treeBits[idx * DIRS + k] = treeHit;
    }
    if (onSlice && idx % 2000 === 0) onSlice(idx / n);
  }
  return { angles, treeBits, under, bad };
}

// ---- the far horizon, read from the server: {x0, z0, dx, dz, nx, ny, bytes: Uint8Array [ny][nx][72]} in 0.5° steps; read bilinear between its spots.
export function farHorizon(far, lattice) {
  const n = lattice.nx * lattice.ny, out = new Uint8Array(n * DIRS);
  if (!far) return { angles: out, read: false };
  for (let idx = 0; idx < n; idx++) {
    if (!lattice.inside[idx]) continue;
    const x = lattice.x0 + (idx % lattice.nx) * lattice.step, z = lattice.z0 + Math.floor(idx / lattice.nx) * lattice.step;
    let fx = far.nx > 1 ? (x - far.x0) / far.dx : 0, fz = far.ny > 1 ? (z - far.z0) / far.dz : 0;
    fx = Math.min(far.nx - 1, Math.max(0, fx)); fz = Math.min(far.ny - 1, Math.max(0, fz));
    const i = Math.min(far.nx - 2 < 0 ? 0 : far.nx - 2, Math.floor(fx)), j = Math.min(far.ny - 2 < 0 ? 0 : far.ny - 2, Math.floor(fz));
    const tx = far.nx > 1 ? fx - i : 0, tz = far.ny > 1 ? fz - j : 0, i1 = Math.min(far.nx - 1, i + 1), j1 = Math.min(far.ny - 1, j + 1);
    const b = (a, c) => (c * far.nx + a) * DIRS;
    const b00 = b(i, j), b10 = b(i1, j), b01 = b(i, j1), b11 = b(i1, j1);
    for (let k = 0; k < DIRS; k++) out[idx * DIRS + k] = Math.round((far.bytes[b00 + k] * (1 - tx) + far.bytes[b10 + k] * tx) * (1 - tz) + (far.bytes[b01 + k] * (1 - tx) + far.bytes[b11 + k] * tx) * tz);
  }
  return { angles: out, read: true };
}

// ---- a job: everything worked once for one piece of land
export function buildJob(input, { phone = false, onSlice } = {}) {
  const area = input.polys.reduce((s, p) => s + polygonArea(p), 0);
  const step = input.step || chooseStep(area, phone);
  const lattice = makeLattice(input.polys, step);
  const grid = { ...input.grid, lattice };
  const near = nearHorizon(grid, input.lat, { onSlice });
  const far = farHorizon(input.far, lattice);
  return { lat: input.lat, lon: input.lon, step, lattice, grid, near, far, farRead: far.read, groundRead: input.grid.ground.some(v => v === v), polys: input.polys };
}

// ---- a moment: for every lattice node, 0 sun, 1 shaded by the near land, 2 trees, 3 the far hills, 4 under trees, 5 the sun is down, 6 bad, 255 outside
export function momentOf(job, sun) {
  const L = job.lattice, n = L.nx * L.ny, out = new Uint8Array(n).fill(MOMENT.OUT);
  const pos = ((sun.azimuth % 360) + 360) % 360 / DIR_DEG, k0 = Math.floor(pos) % DIRS, k1 = (k0 + 1) % DIRS, f = pos - Math.floor(pos);
  const a = sun.apparent;
  for (let idx = 0; idx < n; idx++) {
    if (!L.inside[idx]) continue;
    if (job.near.bad[idx]) { out[idx] = MOMENT.BAD; continue; }
    if (a <= 0) { out[idx] = MOMENT.DOWN; continue; }
    if (job.near.under[idx]) { out[idx] = MOMENT.UNDER; continue; }
    const o = idx * DIRS;
    const nearA = (job.near.angles[o + k0] * (1 - f) + job.near.angles[o + k1] * f) * ANGLE_UNIT;
    const farA = (job.far.angles[o + k0] * (1 - f) + job.far.angles[o + k1] * f) * ANGLE_UNIT;
    if (a > Math.max(nearA, farA)) out[idx] = MOMENT.SUN;
    else if (farA > nearA) out[idx] = MOMENT.HILLS;
    else out[idx] = (f < 0.5 ? job.near.treeBits[o + k0] : job.near.treeBits[o + k1]) ? MOMENT.TREES : MOMENT.LAND;
  }
  return out;
}
export function sunSteps(date, lat, lon, stepMin = 10) {   // the sun every 10 minutes from sunrise to sunset
  const ev = sunEvents(date, lat, lon);
  if (ev.state === 'night') return { ev, steps: [] };
  const from = ev.state === 'day' ? ev.noon - 12 * 3600000 : ev.rise, to = ev.state === 'day' ? ev.noon + 12 * 3600000 : ev.set;
  const steps = [];
  for (let t = from; t <= to; t += stepMin * 60000) { const s = sunAt(t, lat, lon); steps.push({ ms: t, apparent: s.apparent, azimuth: s.azimuth }); }
  return { ev, steps };
}
// A day: minutes of direct sun per node, the first and last sunny moment, and the shaded steps by cause.
export function dayOf(job, date, stepMin = 10) {
  const { ev, steps } = sunSteps(date, job.lat, job.lon, stepMin), L = job.lattice, n = L.nx * L.ny;
  const minutes = new Uint16Array(n), first = new Float64Array(n).fill(NaN), last = new Float64Array(n).fill(NaN);
  const cause = { land: new Uint16Array(n), trees: new Uint16Array(n), hills: new Uint16Array(n) };
  for (const s of steps) {
    if (s.apparent <= 0) continue;
    const m = momentOf(job, s);
    for (let i = 0; i < n; i++) {
      const c = m[i];
      if (c === MOMENT.SUN) { minutes[i] += stepMin; if (first[i] !== first[i]) first[i] = s.ms; last[i] = s.ms; }
      else if (c === MOMENT.LAND) cause.land[i] += stepMin;
      else if (c === MOMENT.TREES || c === MOMENT.UNDER) cause.trees[i] += stepMin;
      else if (c === MOMENT.HILLS) cause.hills[i] += stepMin;
    }
  }
  return { date, ev, steps: steps.length, minutes, first, last, cause };
}

// ---- per field
const median = a => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (a, q) => { const s = Float64Array.from(a).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };
export function fieldOf(job, day, poly) {
  const L = job.lattice, spots = [];
  for (let idx = 0; idx < L.nx * L.ny; idx++) {
    if (!L.inside[idx] || job.near.bad[idx]) continue;
    const x = L.x0 + (idx % L.nx) * L.step, z = L.z0 + Math.floor(idx / L.nx) * L.step;
    if (pointInPolygon(x, z, poly)) spots.push(idx);
  }
  const open = spots.filter(i => !job.near.under[i]);
  if (open.length < 4) return { tooSmall: true, spots: spots.length };
  const mins = open.map(i => day.minutes[i]);
  const best = quantile(mins, 0.95);
  const mean = mins.reduce((s, v) => s + v, 0) / mins.length;
  const tenth = mins.slice().sort((a, b) => a - b).slice(0, Math.max(1, Math.round(mins.length / 10)));
  const sunny = open.filter(i => day.minutes[i] > 0);
  const out = {
    spots: open.length, tooSmall: false, bestHours: best / 60, meanHours: mean / 60, leastSunnyHours: tenth.reduce((s, v) => s + v, 0) / tenth.length / 60,
    firstSunMs: median(sunny.map(i => day.first[i])), lastSunMs: median(sunny.map(i => day.last[i])), strips: [],
  };
  // strips: runs of spots with under half the field's best minutes, starting at an edge (north, east, south, west), grouped by edge
  const shaded = new Set(open.filter(i => day.minutes[i] < best * 0.5));
  const col = i => i % L.nx, row = i => Math.floor(i / L.nx), at = (c, r) => r * L.nx + c;
  const set = new Set(open);
  let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  for (const i of open) { c0 = Math.min(c0, col(i)); c1 = Math.max(c1, col(i)); r0 = Math.min(r0, row(i)); r1 = Math.max(r1, row(i)); }
  const edges = [
    { edge: 'south', lines: range(c0, c1), start: c => { for (let r = r1; r >= r0; r--) if (set.has(at(c, r))) return [r, -1]; return null; }, pos: (c, r) => at(c, r) },
    { edge: 'north', lines: range(c0, c1), start: c => { for (let r = r0; r <= r1; r++) if (set.has(at(c, r))) return [r, 1]; return null; }, pos: (c, r) => at(c, r) },
    { edge: 'east', lines: range(r0, r1), start: r => { for (let c = c1; c >= c0; c--) if (set.has(at(c, r))) return [c, -1]; return null; }, pos: (r, c) => at(c, r) },
    { edge: 'west', lines: range(r0, r1), start: r => { for (let c = c0; c <= c1; c++) if (set.has(at(c, r))) return [c, 1]; return null; }, pos: (r, c) => at(c, r) },
  ];
  for (const e of edges) {
    const runs = [], members = [];
    for (const line of e.lines) {
      const s = e.start(line); if (!s) continue;
      let p = s[0], len = 0;
      while (set.has(e.pos(line, p)) && shaded.has(e.pos(line, p))) { members.push(e.pos(line, p)); len++; p += s[1]; }
      runs.push(len * L.step);
    }
    if (!runs.length || !members.length) continue;
    const width = median(runs), share = members.length / open.length;
    if (share < 0.05 || width < 10) continue;
    const c = { land: 0, trees: 0, hills: 0 };
    for (const i of members) { c.land += day.cause.land[i]; c.trees += day.cause.trees[i]; c.hills += day.cause.hills[i]; }
    const cause = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
    const everSun = members.filter(i => day.minutes[i] > 0);
    const sunless = everSun.length < members.length / 2;
    out.strips.push({ edge: e.edge, width, share, cause, sunless, firstSunMs: sunless ? NaN : median(everSun.map(i => day.first[i])), treeHeight: outsideTreeHeight(job, e.edge, c0, c1, r0, r1) });
  }
  out.strips.sort((a, b) => b.share - a.share);
  return out;
}
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
// the median tree height within 40 m outside an edge of the field's box
function outsideTreeHeight(job, edge, c0, c1, r0, r1) {
  const g = job.grid, L = job.lattice;
  if (!g.trees) return NaN;
  const xa = L.x0 + c0 * L.step, xb = L.x0 + c1 * L.step, za = L.z0 + r0 * L.step, zb = L.z0 + r1 * L.step, hs = [];
  const box = edge === 'south' ? [xa, xb, zb, zb + 40] : edge === 'north' ? [xa, xb, za - 40, za] : edge === 'east' ? [xb, xb + 40, za, zb] : [xa - 40, xa, za, zb];
  for (let z = box[2]; z <= box[3]; z += g.dz) for (let x = box[0]; x <= box[1]; x += g.dx) { const t = treeAt(g, x, z); if (t > 0) hs.push(t); }
  return hs.length ? median(hs) : NaN;
}

// ---- the job store: the last 2 jobs of a visit, nothing saved
const store = new Map();
export function runJob(msg, phone = false) {
  switch (msg.op) {
    case 'build': {
      const job = buildJob(msg.input, { phone });
      store.delete(msg.key); store.set(msg.key, job);
      while (store.size > 2) store.delete(store.keys().next().value);
      return { key: msg.key, step: job.step, spots: job.lattice.count, farRead: job.farRead, groundRead: job.groundRead };
    }
    case 'moment': { const job = need(msg.key); return { moment: momentOf(job, msg.sun) }; }
    case 'day': { const job = need(msg.key); const d = dayOf(job, msg.date); return { day: d, fields: (msg.fields || []).map(p => fieldOf(job, d, p)) }; }
    case 'drop': store.delete(msg.key); return { dropped: true };
    default: throw new Error(`unknown job ${msg.op}`);
  }
}
function need(key) { const j = store.get(key); if (!j) throw new Error('This shade job is no longer kept: build it again.'); return j; }
export const jobKeys = () => [...store.keys()];
