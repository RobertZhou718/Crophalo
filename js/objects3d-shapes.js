// The 3D farm's built object shapes, pure data: for each of the 48 kinds drawn from code, a list of simple parts (boxes, cylinders, cones, balls,
// roofs, discs) at the object's real size in metres, standing on y = 0 round the footprint's middle (+x east, +z south at turn 0). Part 2 turns the parts into
// meshes; the card pictures are drawn from the very same parts. Quiet colours, one navy accent; no words, no logos. Checked by scripts/test_objects3d.mjs.
/*
 * The 10 kinds that come from the art pack get a plain stand-in box here until their model has loaded.
 */
import { KINDS, kindOf } from './objects3d-data.js';

export const TONES = Object.freeze({
  wall: '#e8dfd0', roof: '#0b2545', wood: '#a47148', darkwood: '#7a5a3a', metal: '#9aa3b2', steel: '#6f7889', leaf: '#3f9a4a', glass: '#cfe3f5', stone: '#a9a9ad',
  water: '#2670cc', hay: '#e0c068', white: '#ffffff', charcoal: '#3a3f4a', soil: '#a47148', gravel: '#c9c3b6', hide: '#f4efe6', spot: '#4a4a4f', wool: '#f1ede4', navy: '#0b2545',
});

// A part: {t, x, y, z, w, h, d, c} with x, z the part's middle and y its base; cyl and cone use w as the diameter and take an axis ('y' up, 'x' or 'z' lying);
// 'prism' is a gable roof with its ridge along z; 'disc' an elliptic cylinder; rx tilts a part about the x axis (radians).
const B = (x, y, z, w, h, d, c, o = {}) => ({ t: 'box', x, y, z, w, h, d, c, ...o });
const Cy = (x, y, z, dia, h, c, o = {}) => ({ t: 'cyl', x, y, z, w: dia, h, d: dia, c, ax: 'y', ...o });
const Co = (x, y, z, dia, h, c, o = {}) => ({ t: 'cone', x, y, z, w: dia, h, d: dia, c, ax: 'y', ...o });
const Sp = (x, y, z, w, h, d, c) => ({ t: 'ball', x, y, z, w, h, d, c });
const Pr = (x, y, z, w, h, d, c) => ({ t: 'prism', x, y, z, w, h, d, c });
const Di = (x, y, z, w, h, d, c) => ({ t: 'disc', x, y, z, w, h, d, c });
// a cylinder lying along x (axis 'x') or z (axis 'z'): w, d are then the length and the diameter in the axis's own terms
const Lx = (x, y, z, len, dia, c) => ({ t: 'cyl', x, y, z, w: len, h: dia, d: dia, c, ax: 'x' });
const Lz = (x, y, z, len, dia, c) => ({ t: 'cyl', x, y, z, w: dia, h: dia, d: len, c, ax: 'z' });

const tree = (W, H, trunkC = TONES.darkwood, crown = TONES.leaf) => [Cy(0, 0, 0, W * 0.1, H * 0.4, trunkC), Sp(0, H * 0.3, 0, W, H * 0.5, W, crown), Sp(W * 0.12, H * 0.62, -W * 0.08, W * 0.7, H * 0.38, W * 0.7, crown)];
const wheel = (x, z, r, w = 0.3) => Lx(x, 0, z, w, r * 2, TONES.charcoal);
const SHAPES = {
  farmhouse: ({ w, d, h }) => [B(0, 0, 0, w, h * 0.62, d, TONES.wall), Pr(0, h * 0.62, 0, w * 1.08, h * 0.38, d * 1.04, TONES.roof), B(w * 0.3, h * 0.62, -d * 0.2, w * 0.1, h * 0.38, w * 0.1, TONES.steel), B(0, 0, d / 2, w * 0.14, h * 0.32, 0.05, TONES.navy)],
  barn: ({ w, d, h }) => [B(0, 0, 0, w, h * 0.6, d, TONES.wall), Pr(0, h * 0.6, 0, w * 1.06, h * 0.4, d * 1.02, TONES.roof), B(0, 0, d / 2, w * 0.4, h * 0.45, 0.06, TONES.navy)],
  shed: ({ w, d, h }) => [B(0, 0, 0, w, h * 0.75, d, TONES.wood), Pr(0, h * 0.75, 0, w * 1.1, h * 0.25, d * 1.05, TONES.roof)],
  silo: ({ w, h }) => [Cy(0, 0, 0, w, h * 0.88, TONES.metal), Sp(0, h * 0.78, 0, w, h * 0.22, w, TONES.roof)],
  'water-tank': ({ w, h }) => [...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => B(i * w * 0.38, 0, j * w * 0.38, w * 0.08, h * 0.5, w * 0.08, TONES.steel)), Cy(0, h * 0.45, 0, w * 0.9, h * 0.55, TONES.metal), Co(0, h * 0.97, 0, w * 0.9, h * 0.03, TONES.roof)],
  greenhouse: ({ w, d, h }) => [B(0, 0, 0, w, h * 0.55, d, TONES.glass), Pr(0, h * 0.55, 0, w, h * 0.45, d, TONES.glass), B(0, 0, d / 2, w * 0.02, h * 0.55, 0.04, TONES.steel)],
  coop: ({ w, d, h }) => [B(0, h * 0.2, 0, w, h * 0.5, d, TONES.wood), Pr(0, h * 0.7, 0, w * 1.15, h * 0.3, d * 1.1, TONES.roof), B(-w * 0.25, 0, d * 0.5, w * 0.06, h * 0.2, w * 0.06, TONES.darkwood), B(w * 0.25, 0, d * 0.5, w * 0.06, h * 0.2, w * 0.06, TONES.darkwood)],
  shelter: ({ w, d, h }) => [...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => B(i * (w / 2 - 0.1), 0, j * (d / 2 - 0.1), 0.2, h, 0.2, TONES.darkwood)), B(0, h, 0, w * 1.05, 0.15, d * 1.05, TONES.roof), B(0, 0, -(d / 2 - 0.1), w, h * 0.7, 0.12, TONES.wood)],
  container: ({ w, d, h }) => [B(0, 0, 0, w, h, d, TONES.steel), B(0, h * 0.9, 0, w * 1.0, h * 0.1, d, TONES.navy)],

  tractor: ({ w, d, h }) => [B(0, h * 0.25, -d * 0.12, w * 0.7, h * 0.3, d * 0.7, TONES.navy), B(0, h * 0.55, d * 0.1, w * 0.62, h * 0.4, d * 0.28, TONES.glass), B(0, h * 0.55, d * 0.1, w * 0.64, h * 0.04, d * 0.3, TONES.roof), Cy(w * 0.15, h * 0.55, -d * 0.35, w * 0.08, h * 0.45, TONES.steel), wheel(-w * 0.43, d * 0.28, h * 0.33, w * 0.2), wheel(w * 0.43, d * 0.28, h * 0.33, w * 0.2), wheel(-w * 0.42, -d * 0.3, h * 0.2, w * 0.15), wheel(w * 0.42, -d * 0.3, h * 0.2, w * 0.15)],
  combine: ({ w, d, h }) => [B(0, h * 0.2, 0, w * 0.6, h * 0.55, d * 0.55, TONES.navy), B(0, h * 0.7, d * 0.28, w * 0.35, h * 0.3, d * 0.2, TONES.glass), B(0, 0.15, d * 0.45, w, h * 0.15, d * 0.1, TONES.steel), wheel(-w * 0.38, d * 0.2, h * 0.25, w * 0.15), wheel(w * 0.38, d * 0.2, h * 0.25, w * 0.15)],
  trailer: ({ w, d, h }) => [B(0, h * 0.3, 0, w, h * 0.55, d, TONES.wood), wheel(-w * 0.5, d * 0.1, h * 0.25, w * 0.1), wheel(w * 0.5, d * 0.1, h * 0.25, w * 0.1), B(0, h * 0.2, -d * 0.55, w * 0.1, h * 0.1, d * 0.12, TONES.steel)],
  plough: ({ w, d, h }) => [B(0, h * 0.5, 0, w, h * 0.12, d * 0.2, TONES.steel), ...[-0.35, -0.12, 0.12, 0.35].map(i => Cy(i * w, 0, 0, w * 0.18, h * 0.5, TONES.metal))],

  tree: ({ w, h }) => tree(w, h),
  pine: ({ w, h }) => [Cy(0, 0, 0, w * 0.12, h * 0.3, TONES.darkwood), Co(0, h * 0.2, 0, w, h * 0.45, TONES.leaf), Co(0, h * 0.5, 0, w * 0.75, h * 0.35, TONES.leaf), Co(0, h * 0.75, 0, w * 0.5, h * 0.25, TONES.leaf)],
  orchard: ({ w, d, h }) => [-1, 0, 1].flatMap(i => [-1, 0, 1].map(j => tree(w * 0.2, h).map(p => ({ ...p, x: p.x + i * w * 0.33, z: p.z + j * d * 0.33 })))).flat(),
  hedge: ({ w, d, h }) => [B(0, 0, 0, w, h, d, TONES.leaf)],
  pond: ({ w, d, h }) => [Di(0, 0, 0, w, h, d, TONES.water)],
  well: ({ w, d, h }) => [Cy(0, 0, 0, w * 0.5, h * 0.35, TONES.stone), B(-w * 0.35, 0, 0, 0.1, h, 0.1, TONES.darkwood), B(w * 0.35, 0, 0, 0.1, h, 0.1, TONES.darkwood), B(0, h * 0.92, 0, w * 0.9, h * 0.08, d, TONES.roof)],
  windmill: ({ w, h }) => [Co(0, 0, 0, w * 0.5, h * 0.8, TONES.steel), B(0, h * 0.8, 0, w * 0.2, h * 0.08, w * 0.4, TONES.navy), B(0, h * 0.7, w * 0.25, w * 0.08, h * 0.3, 0.05, TONES.white), B(0, h * 0.84, w * 0.25, w * 0.9, h * 0.04, 0.05, TONES.white)],
  trough: ({ w, d, h }) => [B(0, 0, 0, w, h, d, TONES.metal), B(0, h * 0.7, 0, w * 0.9, h * 0.3, d * 0.7, TONES.water)],
  ditch: ({ w, d, h }) => [B(0, 0, 0, w, h, d, TONES.soil), B(0, h * 0.6, 0, w * 0.6, h * 0.4, d, TONES.water)],
  pipe: ({ w, d }) => [Lz(0, 0, 0, d, w, TONES.navy)],
  pivot: ({ w, d, h }) => { const n = Math.max(2, Math.round(d / 30)) + 1; return [B(0, h * 0.85, 0, w, h * 0.12, d, TONES.metal), ...Array.from({ length: n }, (_, i) => B(0, 0, -d / 2 + i * d / (n - 1), w * 0.5, h * 0.85, w * 0.5, TONES.steel))]; },

  fence: ({ w, d, h }) => { const n = Math.max(1, Math.round(d / 3)), posts = Array.from({ length: n + 1 }, (_, i) => B(0, 0, -d / 2 + i * d / n, w, h, w, TONES.darkwood)); return [...posts, B(0, h * 0.75, 0, w * 0.5, h * 0.08, d, TONES.wood), B(0, h * 0.4, 0, w * 0.5, h * 0.08, d, TONES.wood)]; },
  gate: ({ w, d, h }) => [B(-w / 2 + 0.1, 0, 0, 0.2, h, d, TONES.darkwood), B(w / 2 - 0.1, 0, 0, 0.2, h, d, TONES.darkwood), B(0, h * 0.2, 0, w - 0.2, 0.1, d, TONES.wood), B(0, h * 0.6, 0, w - 0.2, 0.1, d, TONES.wood), B(0, h * 0.9, 0, w - 0.2, 0.1, d, TONES.wood)],
  track: ({ w, d, h }) => [B(0, 0, 0, w, h, d, TONES.gravel)],
  bridge: ({ w, d, h }) => [B(0, h * 0.5, 0, w, h * 0.5, d, TONES.wood), B(-w / 2 + 0.1, h * 0.5, 0, 0.12, h * 0.5, d, TONES.darkwood), B(w / 2 - 0.1, h * 0.5, 0, 0.12, h * 0.5, d, TONES.darkwood), B(-w * 0.4, 0, 0, w * 0.1, h * 0.5, d * 0.8, TONES.stone), B(w * 0.4, 0, 0, w * 0.1, h * 0.5, d * 0.8, TONES.stone)],
  'power-pole': ({ w, d, h }) => [Cy(0, 0, 0, w, h, TONES.darkwood), B(0, h * 0.92, 0, w, 0.12, d, TONES.wood)],
  'power-line': ({ w, d, h }) => [Cy(0, 0, -d / 2, 0.2, h, TONES.darkwood), Cy(0, 0, d / 2, 0.2, h, TONES.darkwood), B(0, h * 0.95, 0, w, 0.05, d, TONES.charcoal)],
  yard: ({ w, d, h }) => [B(0, 0, 0, w, h, d, TONES.gravel)],

  'round-bale': ({ w, d, h }) => [Lx(0, 0, 0, d, h, TONES.hay)],
  'square-bales': ({ w, d, h }) => [B(-w * 0.25, 0, 0, w * 0.48, h * 0.5, d, TONES.hay), B(w * 0.25, 0, 0, w * 0.48, h * 0.5, d, TONES.hay), B(0, h * 0.5, 0, w * 0.48, h * 0.5, d, TONES.hay)],
  haystack: ({ w, h }) => [Cy(0, 0, 0, w, h * 0.55, TONES.hay), Co(0, h * 0.55, 0, w, h * 0.45, TONES.hay)],
  firewood: ({ w, d, h }) => [...[0, 1, 2].flatMap(r => [0, 1, 2, 3, 4].slice(0, 5 - r).map(i => Lz(-w / 2 + (i + 0.5 + r * 0.5) * w / 5, r * h / 3, 0, d, h / 3, TONES.wood)))],
  'rock-small': ({ w, h }) => [Sp(0, 0, 0, w, h, w, TONES.stone)],
  'rock-large': ({ w, d, h }) => [Sp(0, 0, 0, w, h, d, TONES.stone), Sp(w * 0.2, 0, -d * 0.15, w * 0.5, h * 0.7, d * 0.5, TONES.stone)],
  'rock-pile': ({ w, d, h }) => [Sp(0, 0, 0, w * 0.6, h * 0.8, d * 0.6, TONES.stone), Sp(w * 0.25, 0, d * 0.15, w * 0.45, h * 0.6, d * 0.45, TONES.stone), Sp(-w * 0.25, 0, -d * 0.1, w * 0.4, h * 0.55, d * 0.4, TONES.stone)],
  beehives: ({ w, d, h }) => [-0.25, 0.25].flatMap(i => [B(i * w, 0, 0, w * 0.4, h * 0.3, d * 0.9, TONES.white), B(i * w, h * 0.3, 0, w * 0.4, h * 0.45, d * 0.9, TONES.wall), B(i * w, h * 0.75, 0, w * 0.44, h * 0.25, d, TONES.navy)]),
  scarecrow: ({ w, d, h }) => [Cy(0, 0, 0, 0.1, h * 0.95, TONES.darkwood), B(0, h * 0.6, 0, w, 0.08, d, TONES.wood), Sp(0, h * 0.78, 0, 0.3, 0.3, 0.3, TONES.hay), Co(0, h * 0.9, 0, 0.4, h * 0.1, TONES.navy)],
  solar: ({ w, d, h }) => [B(0, h * 0.75, 0, w, 0.08, d * 0.95, TONES.navy, { rx: 0.5 }), B(-w * 0.4, 0, 0, 0.08, h * 0.8, 0.08, TONES.steel), B(w * 0.4, 0, 0, 0.08, h * 0.8, 0.08, TONES.steel)],
  mailbox: ({ w, d, h }) => [B(0, 0, 0, 0.08, h * 0.8, 0.08, TONES.darkwood), B(0, h * 0.8, 0, w, h * 0.2, d, TONES.navy)],
  'farm-sign': ({ w, d, h }) => [B(-w * 0.4, 0, 0, 0.12, h, 0.12, TONES.darkwood), B(w * 0.4, 0, 0, 0.12, h, 0.12, TONES.darkwood), B(0, h * 0.5, 0, w, h * 0.4, d, TONES.wall)],
  'picnic-table': ({ w, d, h }) => [B(0, h * 0.85, 0, w, 0.08, d * 0.5, TONES.wood), B(0, h * 0.5, -d * 0.45, w, 0.08, d * 0.2, TONES.wood), B(0, h * 0.5, d * 0.45, w, 0.08, d * 0.2, TONES.wood), B(-w * 0.35, 0, 0, 0.08, h * 0.85, d * 0.9, TONES.darkwood), B(w * 0.35, 0, 0, 0.08, h * 0.85, d * 0.9, TONES.darkwood)],
  'bird-house': ({ w, d, h }) => [Cy(0, 0, 0, 0.08, h * 0.75, TONES.darkwood), B(0, h * 0.75, 0, w, h * 0.12, d, TONES.wood), Pr(0, h * 0.87, 0, w * 1.2, h * 0.13, d * 1.1, TONES.navy)],
  'feeding-trough': ({ w, d, h }) => [B(0, h * 0.35, 0, w, h * 0.35, d, TONES.wood), B(-w * 0.4, 0, 0, 0.1, h * 0.35, d, TONES.darkwood), B(w * 0.4, 0, 0, 0.1, h * 0.35, d, TONES.darkwood), B(0, h * 0.62, 0, w * 0.9, h * 0.1, d * 0.7, TONES.hay)],
  cow: ({ w, d, h }) => [B(0, h * 0.35, 0, w * 0.9, h * 0.45, d * 0.65, TONES.hide), B(0, h * 0.55, d * 0.42, w * 0.5, h * 0.35, d * 0.22, TONES.hide), ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => B(i * w * 0.3, 0, j * d * 0.25, w * 0.12, h * 0.38, w * 0.12, TONES.charcoal)), B(w * 0.1, h * 0.55, -d * 0.1, w * 0.4, h * 0.2, d * 0.25, TONES.spot)],
  sheep: ({ w, d, h }) => [Sp(0, h * 0.28, 0, w, h * 0.5, d * 0.75, TONES.wool), Sp(0, h * 0.5, d * 0.42, w * 0.4, h * 0.3, d * 0.2, TONES.charcoal), ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => B(i * w * 0.28, 0, j * d * 0.25, w * 0.1, h * 0.3, w * 0.1, TONES.charcoal))],
};

export const BUILT_KINDS = KINDS.filter(k => k.built).map(k => k.id);
export const PACK_KINDS = KINDS.filter(k => !k.built).map(k => k.id);
// The parts of a kind at the drawn size {w, d, h} in metres. A kind from the pack gets a plain box until its model has loaded.
export function shapeOf(kindId, dims) {
  const k = kindOf(kindId); if (!k) return [];
  const fn = SHAPES[k.id];
  return fn ? fn(dims) : [B(0, 0, 0, dims.w, dims.h, dims.d, TONES.wall)];
}
export const hasBuiltShape = id => Object.hasOwn(SHAPES, id);

// The half extent of a part along x and z (turned parts count their full reach), for the checks and the pick boxes.
export function partBounds(p) {
  const rx = Math.abs(Math.sin(p.rx || 0));
  return { x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2 - rx * p.h * 0.5, z1: p.z + p.d / 2 + rx * p.h * 0.5, y0: p.y, y1: p.y + p.h };
}

// ---- the card picture: a 48 × 48 front view drawn from the same parts, at the kind's real size
export function cardSvg(kindId) {
  const k = kindOf(kindId); if (!k) return '';
  const dims = { w: k.w, d: k.len ? Math.min(k.d, k.w * 6) : k.d, h: k.h };
  const parts = shapeOf(kindId, k.len ? { ...dims, d: dims.d } : dims), side = k.len && k.d > k.w * 3;
  // lengths are shown from the side so a fence reads as a fence
  const xs = p => side ? p.z : p.x, ws = p => side ? p.d : p.w;
  let x0 = Infinity, x1 = -Infinity, y1 = 0;
  for (const p of parts) { x0 = Math.min(x0, xs(p) - ws(p) / 2); x1 = Math.max(x1, xs(p) + ws(p) / 2); y1 = Math.max(y1, p.y + p.h); }
  const span = Math.max(x1 - x0, y1, 1e-6), s = 38 / span, ox = 24 - ((x0 + x1) / 2) * s, base = 43;
  const f = n => Math.round(n * 100) / 100;
  const shapes = parts.slice().sort((a, b) => a.y - b.y).map(p => {
    const cx = ox + xs(p) * s, w = Math.max(0.6, ws(p) * s), h = Math.max(0.6, p.h * s), top = base - (p.y + p.h) * s;
    if (p.t === 'ball' || p.t === 'disc') return `<ellipse cx="${f(cx)}" cy="${f(top + h / 2)}" rx="${f(w / 2)}" ry="${f(h / 2)}" fill="${p.c}"/>`;
    if (p.t === 'cone') return `<polygon points="${f(cx - w / 2)},${f(top + h)} ${f(cx + w / 2)},${f(top + h)} ${f(cx)},${f(top)}" fill="${p.c}"/>`;
    if (p.t === 'prism') return `<polygon points="${f(cx - w / 2)},${f(top + h)} ${f(cx + w / 2)},${f(top + h)} ${f(cx)},${f(top)}" fill="${p.c}"/>`;
    return `<rect x="${f(cx - w / 2)}" y="${f(top)}" width="${f(w)}" height="${f(h)}" fill="${p.c}"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false">${shapes.join('')}<line x1="3" y1="${base}" x2="45" y2="${base}" stroke="${TONES.stone}" stroke-width="1"/></svg>`;
}
