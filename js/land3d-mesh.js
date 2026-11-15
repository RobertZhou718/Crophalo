// The shapes of the 3D farm's land details as plain numbers: buildings, roads and tracks, water, hedges and woods, fences and gates, power lines, silos and tanks, turned into triangles with their colours
// baked in, to be drawn with the view's one material in the worker. Pure (no page, no three.js, nothing random): the same layer always gives the same shapes, in slices of a few hundred so a worker can pause between them.
// Frame: metres, +x east, +z south, y up. Checked by scripts/test_land3d_mesh.mjs.

// ---- colours: sRGB hex to the linear floats the graphics chip wants
const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const cache = new Map();
export function linear(hex) {
  let c = cache.get(hex);
  if (!c) { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0; c = [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)]; cache.set(hex, c); }
  return c;
}
export const COLOURS = Object.freeze({
  wall: '#ddd6c8', roof: '#8f959c', roofFarm: '#9c5b45', pave: '#8a8f98', track: '#b79f78', water: '#2670cc', pond: '#2670cc', hedge: '#2f7d4a', wood: '#2f7d4a', fence: '#8a6a45', wall2: '#a9a49a',
  gate: '#c9a77c', pole: '#6b5a48', wire: '#2b2f36', silo: '#c9ced4', tank: '#b8c0c8', tower: '#9aa3ab', well: '#5b6770', windmill: '#e8eaec',
});

// ---- a builder: indexed triangles with a colour at every corner
export function createBuilder() {
  const pos = [], col = [], idx = [];
  const v = (x, y, z, c) => { pos.push(x, y, z); col.push(c[0], c[1], c[2]); return pos.length / 3 - 1; };
  const tri = (a, b, c) => { idx.push(a, b, c); };
  const quad = (a, b, c, d) => { idx.push(a, b, c, a, c, d); };
  const api = {
    v, tri, quad,
    get triangles() { return idx.length / 3; },
    get vertices() { return pos.length / 3; },
    // a vertical strip along a polyline: from y0(x, z) up by h
    strip(points, h, yAt, colour, lift = 0) {
      const c = linear(colour);
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1];
        const ya = yAt(a.x, a.z) + lift, yb = yAt(b.x, b.z) + lift;
        const q0 = v(a.x, ya, a.z, c), q1 = v(b.x, yb, b.z, c), q2 = v(b.x, yb + h, b.z, c), q3 = v(a.x, ya + h, a.z, c);
        quad(q0, q1, q2, q3); quad(q0, q3, q2, q1);   // seen from both sides
      }
    },
    // a flat ribbon lying on the ground along a polyline, width metres wide, lifted a little so it never fights with the ground
    ribbon(points, width, yAt, colour, lift = 0.06, step = 8) {
      const c = linear(colour), half = width / 2, dense = [];
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i], b = points[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(len / step));
        for (let k = 0; k < n; k++) dense.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
      }
      if (points.length) dense.push(points[points.length - 1]);
      if (dense.length < 2) return;
      let prev = null;
      for (let i = 0; i < dense.length; i++) {
        const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L * half, nz = dx / L * half, p = dense[i], y = yAt(p.x, p.z) + lift;
        const l = v(p.x + nx, yAt(p.x + nx, p.z + nz) + lift, p.z + nz, c), r = v(p.x - nx, yAt(p.x - nx, p.z - nz) + lift, p.z - nz, c);
        if (prev) { quad(prev[0], prev[1], r, l); }
        prev = [l, r];
        void y;
      }
    },
    // a flat polygon at one height (or on the ground), triangulated
    flat(poly, y, colour, yAt = null) {
      const c = linear(colour), tris = triangulate(poly);
      if (!tris) return;
      const ids = poly.map(p => v(p.x, yAt ? yAt(p.x, p.z) + y : y, p.z, c));
      for (let i = 0; i < tris.length; i += 3) tri(ids[tris[i]], ids[tris[i + 1]], ids[tris[i + 2]]);
    },
    // a box standing on the ground at (cx, cz), turned by yaw (radians), from y0 up by h
    box(cx, cz, y0, w, h, d, yaw, colour) {
      const c = linear(colour), s = Math.sin(yaw), k = Math.cos(yaw), hw = w / 2, hd = d / 2;
      const at = (lx, lz) => [cx + lx * k + lz * s, cz - lx * s + lz * k];
      const corners = [at(-hw, -hd), at(hw, -hd), at(hw, hd), at(-hw, hd)];
      const lo = corners.map(([x, z]) => v(x, y0, z, c)), hi = corners.map(([x, z]) => v(x, y0 + h, z, c));
      quad(hi[0], hi[1], hi[2], hi[3]);
      for (let i = 0; i < 4; i++) quad(lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]);
    },
    // a round shape: sides, and a flat top (a cone when roof > 0)
    round(cx, cz, y0, r, h, colour, sides = 12, roof = 0) {
      const c = linear(colour), ring = [];
      for (let i = 0; i < sides; i++) { const a = i / sides * Math.PI * 2; ring.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
      const lo = ring.map(([x, z]) => v(x, y0, z, c)), hi = ring.map(([x, z]) => v(x, y0 + h, z, c));
      for (let i = 0; i < sides; i++) quad(lo[i], lo[(i + 1) % sides], hi[(i + 1) % sides], hi[i]);
      if (roof > 0) { const top = v(cx, y0 + h + roof, cz, c); for (let i = 0; i < sides; i++) tri(hi[i], hi[(i + 1) % sides], top); }
      else for (let i = 1; i < sides - 1; i++) tri(hi[0], hi[i], hi[i + 1]);
    },
    build() {
      const position = Float32Array.from(pos), color = Float32Array.from(col), count = pos.length / 3;
      const index = count > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx);
      return { position, color, index, triangles: idx.length / 3 };
    },
  };
  return api;
}

// ---- ear clipping for a simple polygon [{x, z}] (any winding): the corners to join, three at a time, or null when it cannot be cut
export const signedArea = poly => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.z - q.x * p.z; } return a / 2; };
export function triangulate(poly) {
  const n = poly.length;
  if (n < 3) return null;
  if (n === 3) return [0, 1, 2];
  const order = Array.from({ length: n }, (_, i) => i);
  if (signedArea(poly) < 0) order.reverse();
  const out = [], cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const inside = (p, a, b, c) => cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
  let guard = n * n + 10;
  while (order.length > 3 && guard-- > 0) {
    let cut = false;
    for (let k = 0; k < order.length; k++) {
      const i0 = order[(k + order.length - 1) % order.length], i1 = order[k], i2 = order[(k + 1) % order.length], a = poly[i0], b = poly[i1], c = poly[i2];
      if (cross(a, b, c) <= 1e-9) continue;   // not a convex corner
      if (order.some(j => j !== i0 && j !== i1 && j !== i2 && inside(poly[j], a, b, c))) continue;
      out.push(i0, i1, i2); order.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (order.length === 3) out.push(order[0], order[1], order[2]);
  else if (order.length > 3) { for (let i = 1; i < order.length - 1; i++) out.push(order[0], order[i], order[i + 1]); }   // a shape that would not cut (it crosses itself): a fan, so something is drawn rather than nothing
  return out;
}

// ---- the cost of a layer in triangles, so the view can keep to its budget before it builds anything
export const COST = Object.freeze({ building: (n) => n * 2 + Math.max(1, n - 2), ribbonPerStep: 2, post: 10, gate: 34, pole: 10, thing: 28 });
const lenOf = pts => { let L = 0; for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z); return L; };

// ---- one layer into a builder. env: { yAt(x, z), budget (triangles this layer may take), baseOf(poly) }. Every function returns { triangles, detail, drawn, of } and never goes over its budget:
// what does not fit is thinned from the far edge of the land inwards (the nearest the middle is kept), never invented, and the words of the layer say how many were drawn of how many mapped.
const nearest = (items, key) => items.slice().sort((a, b) => key(a) - key(b));
const mid = pts => { let x = 0, z = 0; for (const p of pts) { x += p.x; z += p.z; } return { x: x / pts.length, z: z / pts.length }; };
const d2 = p => p.x * p.x + p.z * p.z;

export function buildBuildings(b, layer, env) {
  const items = layer.items || []; let used = 0, drawn = 0;
  const base = env.yAt, order = nearest(items, it => d2(mid(it.polygon)));
  for (const it of order) {
    const poly = it.polygon, n = poly.length, cost = COST.building(n);
    if (used + cost > env.budget) break;
    const low = Math.min(...poly.map(p => base(p.x, p.z)));
    const roof = ['barn', 'farm', 'farm_auxiliary', 'shed', 'stable', 'cowshed'].includes(it.kind) ? COLOURS.roofFarm : COLOURS.roof, top = low + it.height;
    const wall = linear(COLOURS.wall);
    const lo = poly.map(p => b.v(p.x, low - 0.4, p.z, wall)), hi = poly.map(p => b.v(p.x, top, p.z, wall));
    for (let i = 0; i < n; i++) b.quad(lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]), b.quad(lo[i], hi[i], hi[(i + 1) % n], lo[(i + 1) % n]);
    b.flat(poly, top + 0.02, roof);
    used += cost + n * 2; drawn++;
  }
  return { triangles: used, drawn, of: items.length, detail: 'prisms' };
}

export function buildRoads(b, layer, env) {
  const items = layer.items || []; let used = 0, drawn = 0;
  for (const r of nearest(items, it => d2(mid(it.points)))) {
    const L = lenOf(r.points), cost = Math.max(1, Math.ceil(L / 8)) * COST.ribbonPerStep;
    if (used + cost > env.budget) break;
    b.ribbon(r.points, r.width, env.yAt, r.colour, 0.06, 8); used += cost; drawn++;
  }
  return { triangles: used, drawn, of: items.length, detail: 'ribbons' };
}

export function buildWater(b, layer, env) {
  const lines = layer.items || [], ponds = layer.ponds || []; let used = 0, drawn = 0;
  for (const p of ponds) {
    const cost = Math.max(1, p.polygon.length - 2); if (used + cost > env.budget) break;
    const level = Number.isFinite(p.level) ? p.level : null;
    b.flat(p.polygon, level == null ? 0.1 : level + 0.05, COLOURS.pond, level == null ? env.yAt : null); used += cost; drawn++;
  }
  for (const w of nearest(lines, it => d2(mid(it.points)))) {
    const cost = Math.max(1, Math.ceil(lenOf(w.points) / 8)) * COST.ribbonPerStep; if (used + cost > env.budget) break;
    b.ribbon(w.points, w.width, env.yAt, COLOURS.water, 0.1, 8); used += cost; drawn++;
  }
  return { triangles: used, drawn, of: lines.length + ponds.length, detail: 'ribbons' };
}

export function buildHedges(b, layer, env) {
  const lines = layer.items || [], woods = layer.woods || []; let used = 0, drawn = 0;
  for (const w of woods) {
    const cost = Math.max(1, w.polygon.length - 2); if (used + cost > env.budget) break;
    b.flat(w.polygon, 0.12, COLOURS.wood, env.yAt); used += cost; drawn++;   // tinted, flat: no height of a wood is invented
  }
  for (const h of nearest(lines, it => d2(mid(it.points)))) {
    const steps = Math.max(1, Math.ceil(lenOf(h.points) / 8)), tall = Number.isFinite(h.height) && h.height > 0, cost = steps * (tall ? 6 : 2); if (used + cost > env.budget) break;
    if (tall) {
      b.ribbon(h.points, h.width, env.yAt, COLOURS.hedge, h.height, 8);                    // the top
      b.strip(offsetLine(h.points, h.width / 2), -h.height, env.yAt, COLOURS.hedge, h.height); b.strip(offsetLine(h.points, -h.width / 2), -h.height, env.yAt, COLOURS.hedge, h.height);
    } else b.ribbon(h.points, h.width, env.yAt, COLOURS.hedge, 0.12, 8);   // a flat band where no height is known
    used += cost; drawn++;
  }
  return { triangles: used, drawn, of: lines.length + woods.length, detail: 'bands' };
}
function offsetLine(points, d) {
  return points.map((p, i) => { const a = points[Math.max(0, i - 1)], c = points[Math.min(points.length - 1, i + 1)], dx = c.x - a.x, dz = c.z - a.z, L = Math.hypot(dx, dz) || 1; return { x: p.x - dz / L * d, z: p.z + dx / L * d }; });
}

// Fences: posts every 3 m and a rail where the budget allows ("full"), else one standing panel along the line ("panel"): never fewer than are mapped, only plainer.
export function buildFences(b, layer, env) {
  const items = layer.items || [], gates = layer.gates || []; let used = 0, drawn = 0;
  const full = items.reduce((s, f) => s + Math.ceil(lenOf(f.points) / 3) * (COST.post + 2), 0) + gates.length * COST.gate, panels = items.reduce((s, f) => s + Math.ceil(lenOf(f.points) / 8) * 4, 0);
  const detail = full <= env.budget ? 'posts' : 'panels';
  for (const f of nearest(items, it => d2(mid(it.points)))) {
    const colour = f.kind === 'wall' ? COLOURS.wall2 : COLOURS.fence;
    if (detail === 'posts') {
      const cost = Math.ceil(lenOf(f.points) / 3) * (COST.post + 2); if (used + cost > env.budget) break;
      for (let i = 0; i < f.points.length - 1; i++) {
        const a = f.points[i], c = f.points[i + 1], len = Math.hypot(c.x - a.x, c.z - a.z), n = Math.max(1, Math.round(len / 3));
        for (let k = 0; k <= n; k++) { const t = k / n, x = a.x + (c.x - a.x) * t, z = a.z + (c.z - a.z) * t; b.box(x, z, env.yAt(x, z) - 0.1, 0.2, f.height + 0.1, 0.2, 0, colour); }
      }
      b.strip(f.points, 0.12, env.yAt, colour, f.height * 0.75); b.strip(f.points, 0.12, env.yAt, colour, f.height * 0.35);
      used += cost;
    } else {
      const cost = Math.ceil(lenOf(f.points) / 8) * 4; if (used + cost > env.budget) break;
      b.strip(f.points, f.height, env.yAt, colour, 0); used += cost;
    }
    drawn++;
  }
  for (const g of gates) {
    if (used + COST.gate > env.budget) break;
    const y = env.yAt(g.x, g.z);
    b.box(g.x - 1.8, g.z, y - 0.1, 0.25, 1.4, 0.25, 0, COLOURS.gate); b.box(g.x + 1.8, g.z, y - 0.1, 0.25, 1.4, 0.25, 0, COLOURS.gate); b.box(g.x, g.z, y + 0.5, 3.6, 0.7, 0.12, 0, COLOURS.gate);
    used += COST.gate; drawn++;
  }
  return { triangles: used, drawn, of: items.length + gates.length, detail };
}

// Power lines: poles of their height, the wire as a thin ribbon hanging a little between them (typical, not measured).
export function buildPower(b, layer, env) {
  const lines = layer.items || [], poles = layer.poles || []; let used = 0, drawn = 0;
  for (const p of nearest(poles, it => d2(it))) {
    if (used + COST.pole > env.budget) break;
    const y = env.yAt(p.x, p.z); b.box(p.x, p.z, y - 0.2, p.kind === 'tower' ? 1.6 : 0.4, p.height + 0.2, p.kind === 'tower' ? 1.6 : 0.4, 0, p.kind === 'tower' ? COLOURS.tower : COLOURS.pole);
    used += COST.pole; drawn++;
  }
  for (const l of nearest(lines, it => d2(mid(it.points)))) {
    const dense = []; for (let i = 0; i < l.points.length - 1; i++) { const a = l.points[i], c = l.points[i + 1], n = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.z - a.z) / 10)); for (let k = 0; k < n; k++) dense.push({ x: a.x + (c.x - a.x) * k / n, z: a.z + (c.z - a.z) * k / n }); }
    dense.push(l.points[l.points.length - 1]);
    const cost = (dense.length - 1) * 4; if (used + cost > env.budget) break;
    let acc = 0;
    const hang = dense.map((p, i) => { if (i) acc += Math.hypot(p.x - dense[i - 1].x, p.z - dense[i - 1].z); const t = (acc % 40) / 40; return { x: p.x, z: p.z, y: env.yAt(p.x, p.z) + (l.kind === 'minor' ? 8 : 9.5) - 0.9 * Math.sin(Math.PI * t) }; });
    const c = linear(COLOURS.wire);
    for (let i = 0; i < hang.length - 1; i++) {
      const a = hang[i], d = hang[i + 1], q0 = b.v(a.x, a.y, a.z, c), q1 = b.v(d.x, d.y, d.z, c), q2 = b.v(d.x, d.y + 0.14, d.z, c), q3 = b.v(a.x, a.y + 0.14, a.z, c);
      b.quad(q0, q1, q2, q3); b.quad(q0, q3, q2, q1);
    }
    used += cost; drawn++;
  }
  return { triangles: used, drawn, of: lines.length + poles.length, detail: 'wires' };
}

export function buildThings(b, layer, env) {
  const items = layer.items || []; let used = 0, drawn = 0;
  for (const t of nearest(items, it => d2(it))) {
    if (used + COST.thing > env.budget) break;
    const y = env.yAt(t.x, t.z), col = COLOURS[t.kind === 'water tower' ? 'tower' : t.kind] || COLOURS.tower;
    b.round(t.x, t.z, y - 0.2, t.r, t.height + 0.2, col, 12, t.kind === 'silo' ? t.r * 0.5 : 0);
    used += COST.thing; drawn++;
  }
  return { triangles: used, drawn, of: items.length, detail: 'round' };
}

export const BUILDERS = Object.freeze({ buildings: buildBuildings, roads: buildRoads, water: buildWater, hedges: buildHedges, fences: buildFences, power: buildPower, things: buildThings });
// The words a layer adds when it could not draw everything it was given: how many were drawn of how many are mapped, and that the nearest the middle were kept.
export const thinnedWords = (name, got) => (got.drawn < got.of ? `${name}: ${got.drawn} of ${got.of} drawn, the nearest the middle of the land first, to keep the picture quick.` : '');
