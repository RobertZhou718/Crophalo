// The 3D picture of one field with three.js: a slab of land, the ground painted with what covers it and the plants' shadows, the plants as instanced symbols, one sun.
// It runs the same in a worker (on an OffscreenCanvas, js/farm3d-worker.js) or on the page (js/farm3d.js), and builds in small steps with a pause between them.
// No page, no storage, no network: only the canvas and the graphics context it is handed. Checked by scripts/e2e_3d_open.mjs (worker) and scripts/e2e_farm3d.mjs (page).
import { mix, PALETTE, soilDepthDrawn, heightAtMesh, shadowOffset, thinPlants, pictureKey } from './farm3d-data.js';
import { shadeRects } from './shade3d.js';
import { BUILDERS, createBuilder, thinnedWords } from './land3d-mesh.js';
import { switchOf } from './land3d-data.js';

// The steps a first picture takes, with the share of the work done after each: the page shows them on its progress line.
export const STEPS = Object.freeze({ tools: { share: 0.15, words: 'Loading the 3D tools' }, land: { share: 0.35, words: 'Laying out the land' }, ground: { share: 0.5, words: 'Painting the ground' },
  plants: { share: 0.7, words: 'Placing the plants' }, details: { share: 0.78, words: 'Placing the details of the land' }, light: { share: 0.85, words: 'Preparing the light' }, draw: { share: 0.95, words: 'Drawing the picture' } });
const SLICE = 800;   // plants placed, or strokes painted, between two pauses
const STRIP = 16;    // rows of plain white under the ground picture: every shape that is not the ground takes its colour from its corners on that white
const WIDTH = { maize: 0.62, 'legume-bush': 1.05, cereal: 0.7 };
const PER_PLANT = { maize: 104, 'legume-bush': 80, cereal: 108 };   // triangles of one symbol, for the budget
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;
const superseded = Symbol('superseded');
export const rendererName = gl => { try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; } catch { return ''; } };
// The one graphics context of the view, made on the view's own canvas before three.js is even loaded: a device without one is told so at once, and nothing is fetched for it.
// (A software one is refused when asked: drawing on the page it would hold the page.)
export function makeContext(canvas, { antialias = false, refuseSoftware = false } = {}) {
  const attrs = { alpha: true, depth: true, stencil: false, antialias, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: !!refuseSoftware };
  let gl = null;
  try { gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs); } catch { gl = null; }
  if (!gl || (refuseSoftware && SOFTWARE.test(rendererName(gl)))) { try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ } return null; }
  return gl;
}

// env: { THREE, Utils (BufferGeometryUtils), canvas, gl (from makeContext), makeCanvas(w, h), budget (budgetFor()), pause(), onProgress(step), onLost(), onRestored() }
// Returns { failed: 'no-webgl' } when three.js cannot use the context, else the drawer.
export function createDrawer(env) {
  const { THREE, Utils, canvas, gl, makeCanvas, pause = () => new Promise(r => setTimeout(r, 0)) } = env;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: !!env.budget.antialias, alpha: true, depth: true, stencil: false, powerPreference: 'low-power' });
  } catch { return { failed: 'no-webgl' }; }
  const weak = SOFTWARE.test(rendererName(gl));
  const budget = { ...env.budget };
  if (weak) Object.assign(budget, { tier: 'low', plants: Math.min(budget.plants, 600), triangles: Math.min(budget.triangles, 70000), ground: Math.min(budget.ground, 512), pixelRatio: 1 });
  try { budget.ground = Math.min(budget.ground, gl.getParameter(gl.MAX_TEXTURE_SIZE) || budget.ground); } catch { /* the budget's own */ }
  renderer.debug.checkShaderErrors = false;   // three.js would otherwise read each new program's log at once, which makes the thread wait for the graphics process
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;         // the plants' shadows are painted on the ground: no shadow map, no programs of its own
  renderer.setPixelRatio(budget.pixelRatio);

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 1, 50000), content = new THREE.Group();
  scene.add(content);
  // exactly one sun, always there (its strength is 0 when the sun is down), and a sky light: the same lights every time keep the same program
  const hemi = new THREE.HemisphereLight('#eaf2ff', '#a47148', 1.5), sun = new THREE.DirectionalLight('#fff3df', 0);
  scene.add(hemi, sun, sun.target);
  // the ground picture, with a white strip at its foot; one material for every shape (the land, its sides, the plants), so the graphics chip compiles ONE small
  // program for the whole visit: the ground shows the picture, everything else its own colours on the white strip
  const size = budget.ground, paper = makeCanvas(size, size), g = paper.getContext('2d'), vTop = (size - STRIP - 2) / size, WHITE = [0.5, (size - STRIP / 2) / size];
  const texture = new THREE.CanvasTexture(paper);
  texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = false; texture.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: texture, vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  // the program is compiled while the first scene is laid out: a stand-in shape with the same make-up, gone once the program is ready
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3)); tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([...WHITE, ...WHITE, ...WHITE], 2)); tri.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  const standIn = new THREE.InstancedMesh(tri, mat, 1); content.add(standIn);
  env.onProgress?.('compiling');
  const warm = renderer.compileAsync(scene, camera).catch(() => {}).finally(() => { env.onProgress?.('compiled'); content.remove(standIn); tri.dispose(); standIn.dispose(); });

  let shown = null, usedPlants = [], token = 0, disposed = false, lastKey = '', lastLand = '', lastPaint = '', scenes = 0, compiled = false, frame = 0;
  const meshes = [];   // what the shown scene holds, freed when the next one replaces it
  const extra = [];    // the details of the land (apart, so a switch changes only these and not the ground and the plants)
  const stats = { plants: 0, landTriangles: 0, plantTriangles: 0, contexts: 1, weak, budget };
  const step = async (mine, name) => { env.onProgress?.(name); await pause(); if (disposed || mine !== token) throw superseded; };
  const free = m => { content.remove(m); m.geometry.dispose(); m.dispose?.(); };
  const colours = (geo, hex) => { const n = geo.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };
  const onWhite = geo => { const n = geo.attributes.position.count, a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { a[i * 2] = WHITE[0]; a[i * 2 + 1] = WHITE[1]; } geo.setAttribute('uv', new THREE.BufferAttribute(a, 2)); return geo; };
  const one = geo => { const m = new THREE.InstancedMesh(geo, mat, 1); m.frustumCulled = false; return m; };

  // ---- the land: the height mesh (or a flat sheet), its cut sides in the soil's colour, and a base
  function land_(sc) {
    const W = sc.slab.width, D = sc.slab.depth, hm = sc.heights.model;
    const nx = hm ? hm.nx : 2, ny = hm ? hm.ny : 2, pos = new Float32Array(nx * ny * 3), ok = new Uint8Array(nx * ny), uv = new Float32Array(nx * ny * 2);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; let y = 0, good = 1;
      if (hm) { const v = hm.h[k]; if (v === v) y = v - hm.base; else good = 0; }
      pos[k * 3] = -W / 2 + i * W / (nx - 1); pos[k * 3 + 1] = y; pos[k * 3 + 2] = -D / 2 + j * D / (ny - 1); ok[k] = good;
      uv[k * 2] = i / (nx - 1); uv[k * 2 + 1] = j / (ny - 1) * vTop;
    }
    const idx = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {   // two triangles a cell, the long side north-east to south-west, facing up; a missing height leaves its cell open
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (ok[a] && ok[c] && ok[b]) idx.push(a, c, b);
      if (ok[b] && ok[c] && ok[d]) idx.push(b, c, d);
    }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.BufferAttribute(pos, 3)); top.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); top.setIndex(idx); top.computeVertexNormals();
    colours(top, '#ffffff');
    const depth = soilDepthDrawn(sc.slab.span).depth * 0.5, sides = [];
    const edge = (i0, j0, i1, j1) => { const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0)); for (let s = 0; s < n; s++) { const a = (j0 + Math.sign(j1 - j0) * s) * nx + i0 + Math.sign(i1 - i0) * s, b = (j0 + Math.sign(j1 - j0) * (s + 1)) * nx + i0 + Math.sign(i1 - i0) * (s + 1); if (ok[a] && ok[b]) sides.push([a, b]); } };
    edge(0, 0, nx - 1, 0); edge(nx - 1, 0, nx - 1, ny - 1); edge(nx - 1, ny - 1, 0, ny - 1); edge(0, ny - 1, 0, 0);
    const sp = [], si = [];
    sides.forEach(([a, b], n) => { const o = n * 4; sp.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2], pos[b * 3], -depth, pos[b * 3 + 2], pos[a * 3], -depth, pos[a * 3 + 2]); si.push(o, o + 1, o + 2, o, o + 2, o + 3); });
    const wall = new THREE.BufferGeometry(); wall.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); wall.setIndex(si); wall.computeVertexNormals();
    const bottom = new THREE.PlaneGeometry(W, D); bottom.rotateX(Math.PI / 2); bottom.translate(0, -depth, 0);
    stats.landTriangles = idx.length / 3 + si.length / 3 + 2;
    return [one(top), one(onWhite(colours(wall, sc.soilColour))), one(onWhite(colours(bottom, PALETTE.slabBase)))];
  }

  // ---- the ground picture: open land, the field in the colour of what lies on it, faint rows, stubble, the plants' shadows, the outline (dashed when estimated)
  async function paint(sc, mine, plants) {
    const W = sc.slab.width, D = sc.slab.depth, high = size - STRIP, px = x => (x + W / 2) / W * size, pz = z => (z + D / 2) / D * high;
    const outline = () => { g.beginPath(); sc.field.polygon.forEach((p, i) => i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z))); g.closePath(); };
    g.save();
    try {
      g.setLineDash([]);
      g.fillStyle = '#ffffff'; g.fillRect(0, high, size, STRIP);
      g.fillStyle = mix(PALETTE.openGround, PALETTE.grass, 0.25); g.fillRect(0, 0, size, high);
      stats.picture = !!sc.picture?.canvas;
      if (sc.picture?.canvas) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(sc.picture.canvas, 0, 0, size, high); }   // the real picture of the ground, edge to edge
      const cover = sc.cover, soil = sc.soilColour;
      g.fillStyle = !cover || cover.kind === 'bare' ? soil : cover.kind === 'residue' ? mix(soil, '#d9c490', 0.55) : mix(soil, cover.colour, 0.22);
      if (sc.picture?.canvas) g.globalAlpha = 0.3;   // over the real picture the field's colour only tints it: the ground stays the real ground
      outline(); g.fill(); g.globalAlpha = 1;
      g.save();
      try {
        outline(); g.clip();
        if (cover && (cover.kind === 'standing' || cover.kind === 'young' || cover.kind === 'bare')) {   // faint rows, or ridges of bare soil, along the row direction
          g.strokeStyle = cover.kind === 'bare' ? 'rgba(60,40,20,0.22)' : 'rgba(30,60,30,0.14)'; g.lineWidth = Math.max(1, size / 700);
          const a = (cover.bearing || 90) * Math.PI / 180, ux = Math.sin(a), uz = -Math.cos(a), vx = -uz, vz = ux, gap = Math.max(6, size / 90), big = size * 1.5;
          g.beginPath();
          for (let o = -big; o < big; o += gap) { const cx = size / 2 + vx * o, cz = high / 2 + vz * o; g.moveTo(cx - ux * big, cz - uz * big); g.lineTo(cx + ux * big, cz + uz * big); }
          g.stroke();
        }
        if (cover && cover.kind === 'residue') {   // the stubble: short light and dark strokes lying every way, a few thousand in two passes of one path each, in slices
          const b = sc.field.box, n = Math.round(14000 * (size / 2048) ** 2), len = Math.max(3, cover.length / W * size * 0.9);
          g.lineWidth = Math.max(1.2, size / 900); g.lineCap = 'butt';
          for (const [colour, pick] of [['rgba(240,222,170,0.9)', i => i % 3 !== 0], ['rgba(110,80,40,0.7)', i => i % 3 === 0]]) {
            for (let from = 0; from < n; from += SLICE * 2) {
              g.beginPath(); g.strokeStyle = colour;
              for (let i = from; i < Math.min(n, from + SLICE * 2); i++) {
                if (!pick(i)) continue;
                const h1 = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1, h2 = Math.abs(Math.sin(i * 78.233) * 12345.678) % 1, h3 = Math.abs(Math.sin(i * 39.346) * 9876.543) % 1;
                const x = px(b.x0 + h1 * (b.x1 - b.x0)), z = pz(b.z0 + h2 * (b.z1 - b.z0)), a = h3 * Math.PI;
                g.moveTo(x - Math.cos(a) * len / 2, z - Math.sin(a) * len / 2); g.lineTo(x + Math.cos(a) * len / 2, z + Math.sin(a) * len / 2);
              }
              g.stroke(); await step(mine, 'ground');
            }
          }
        }
        // the plants' shadows from the one sun of the scene: one soft stroke from each plant's foot away from the sun, painted (so no shadow map is needed)
        const dir = sc.sun?.up ? sc.sun : null;
        if (cover && plants.length && dir && (cover.kind === 'standing' || cover.kind === 'young')) {
          const wide = WIDTH[cover.shape] ?? 0.7;
          g.strokeStyle = 'rgba(28,44,22,0.18)'; g.lineCap = 'round';
          for (let from = 0; from < plants.length; from += SLICE) {
            g.beginPath();
            let width = 0;
            for (const p of plants.slice(from, from + SLICE)) {
              const hgt = cover.height * p.scale, off = shadowOffset(dir, hgt); if (!off) continue;
              width = Math.max(width, wide * hgt / W * size * 0.6);
              g.moveTo(px(p.x), pz(p.z)); g.lineTo(px(p.x + off.dx), pz(p.z + off.dz));
            }
            g.lineWidth = Math.max(1, width); g.stroke(); await step(mine, 'ground');
          }
        }
      } finally { g.restore(); }
      if (sc.drape?.polys) {   // squares drawn as they lie on the ground (the weak-spots squares of 30 m)
        g.save(); try { g.globalAlpha = 0.72; for (const q of sc.drape.polys) { g.beginPath(); q.pts.forEach((p, i) => i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z))); g.closePath(); g.fillStyle = q.colour; g.fill(); } } finally { g.restore(); }
        stats.drape = sc.drape.id;
      } else if (sc.drape?.rgba) {   // a layer draped over the land: the squares of the height grid, coloured by the layer's own rule, a little see-through so the picture shows under it
        const d = sc.drape, tmp = makeCanvas(d.w, d.h), tg = tmp.getContext('2d'), img = tg.createImageData(d.w, d.h); img.data.set(d.rgba); tg.putImageData(img, 0, 0);
        const cw = size / (d.w - 1), ch = high / (d.h - 1);   // the grid's points sit on the corners of its cells: the picture is spread from half a cell outside to half a cell outside
        g.imageSmoothingEnabled = true; g.drawImage(tmp, -cw / 2, -ch / 2, size + cw, high + ch);
        stats.drape = d.id;
      } else stats.drape = null;
      if (!(sc.shade?.state === 'ready')) stats.shadeCells = 0;
      // the shade of the land at the hour shown: a navy tint, and hatching, so it never relies on colour alone; only where the shade job worked it out
      if (sc.shade?.state === 'ready' && sc.shade.mask) {
        const rects = shadeRects(sc.shade.lattice, sc.shade.mask);
        stats.shadeCells = rects.length;
        if (rects.length) {
          g.save();
          try {
            g.beginPath(); for (const r of rects) g.rect(px(r.x), pz(r.z), r.w / W * size, r.d / D * high);
            g.fillStyle = 'rgba(11,37,69,0.22)'; g.fill();
            g.clip(); g.strokeStyle = 'rgba(11,37,69,0.55)'; g.lineWidth = Math.max(1, size / 700); g.beginPath();
            const gap = Math.max(6, size / 70);
            for (let o = -size; o < size * 2; o += gap) { g.moveTo(o, 0); g.lineTo(o + high, high); }
            g.stroke();
          } finally { g.restore(); }
        }
      }
      outline(); g.lineJoin = 'round'; g.lineWidth = Math.max(3, size / 340); g.strokeStyle = PALETTE.navy; if (sc.field.estimated) g.setLineDash([size / 60, size / 90]); g.stroke();
    } finally { g.restore(); }
  }

  // ---- plant shapes, one unit tall, built from parts with their colours on the white strip
  const lean = (geo, tilt, yaw, y) => { geo.rotateZ(tilt); geo.rotateY(yaw); geo.translate(0, y, 0); return geo; };
  function plantGeometry(cover) {
    const leaf = cover.colour, stem = mix(cover.colour, '#7a5a3a', 0.45), head = '#d9b45a', parts = [];
    if (cover.shape === 'maize') {
      parts.push(colours(new THREE.CylinderGeometry(0.045, 0.065, 1, 5).translate(0, 0.5, 0), stem));
      for (let k = 0; k < 6; k++) parts.push(colours(lean(new THREE.ConeGeometry(0.09, 0.62, 4).translate(0, 0.31, 0), (k % 2 ? -1 : 1) * 1.12, k * 2.1, 0.22 + k * 0.1), leaf));
      if (cover.stage >= 2) parts.push(colours(new THREE.ConeGeometry(0.06, 0.2, 4).translate(0, 0.98, 0), head));
    } else if (cover.shape === 'legume-bush') {
      const blob = (r, x, y, z, sy) => colours(new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1).translate(x, y, z), leaf);
      parts.push(blob(0.36, 0, 0.32, 0, 0.85), blob(0.28, 0.3, 0.26, 0.12, 0.8), blob(0.26, -0.26, 0.24, -0.16, 0.8), blob(0.22, 0.05, 0.62, -0.05, 0.8));
    } else {   // cereal and the rest: a tuft of narrow blades
      for (let k = 0; k < 8; k++) parts.push(colours(lean(new THREE.ConeGeometry(0.035, 1, 3).translate(0, 0.5, 0), 0.12 + (k % 3) * 0.1, k * 0.8, 0), k % 2 ? leaf : mix(leaf, '#ffffff', 0.12)));
      if (cover.stage >= 3) for (let k = 0; k < 3; k++) parts.push(colours(lean(new THREE.ConeGeometry(0.05, 0.16, 4).translate(0, 0.92, 0), 0.1 + k * 0.08, k * 2.4, 0), head));
    }
    const flat = parts.map(p => { const f = p.index ? p.toNonIndexed() : p; if (f !== p) p.dispose(); return f; }), merged = Utils.mergeGeometries(flat, false);
    for (const p of flat) p.dispose();
    return onWhite(merged);
  }
  const tris = geo => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  async function instanced(geo, list, place, mine) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)), dummy = new THREE.Object3D();
    mesh.count = list.length; mesh.frustumCulled = false;
    try {
      for (let from = 0; from < list.length; from += SLICE) {
        for (let i = from; i < Math.min(list.length, from + SLICE); i++) { place(dummy, list[i]); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); }
        await step(mine, 'plants');
      }
    } catch (e) { geo.dispose(); mesh.dispose(); throw e; }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
  async function plants(sc, list, mine, made) {
    const cover = sc.cover; if (!cover || !list.length) { stats.plantTriangles = 0; return; }
    const hm = sc.heights.model, groundAt = (x, z) => { if (!hm) return 0; const y = heightAtMesh(hm, x, z); return y === y ? y : 0; };
    if (cover.kind === 'residue') {
      const fleck = onWhite(colours(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cover.colour)), stub = onWhite(colours(new THREE.CylinderGeometry(0.5, 0.5, 1, 5).translate(0, 0.5, 0), mix(cover.colour, '#7a5a3a', 0.35)));
      const flecks = list.filter((p, i) => i % 3 !== 0), stubs = list.filter((p, i) => i % 3 === 0);
      stats.plantTriangles = tris(fleck) * flecks.length + tris(stub) * stubs.length;
      made.push(await instanced(fleck, flecks, (d, p) => { d.position.set(p.x, groundAt(p.x, p.z), p.z); d.rotation.set(0, p.turn * Math.PI / 180, 0); d.scale.set(cover.length * p.scale, cover.height * 0.5, cover.length * 0.16); }, mine));
      made.push(await instanced(stub, stubs, (d, p) => { d.position.set(p.x, groundAt(p.x, p.z), p.z); d.rotation.set(0, p.turn * Math.PI / 180, 0); d.scale.set(cover.length * 0.12, cover.height * 1.6 * p.scale, cover.length * 0.12); }, mine));
      return;
    }
    const geo = plantGeometry(cover), wide = WIDTH[cover.shape] ?? 0.7;
    stats.plantTriangles = tris(geo) * list.length;
    made.push(await instanced(geo, list, (d, p) => { const s = cover.height * p.scale; d.position.set(p.x, groundAt(p.x, p.z), p.z); d.rotation.set(0, p.turn * Math.PI / 180, 0); d.scale.set(s * wide, s, s * wide); }, mine));
  }
  // ---- the details of the land (buildings, roads, water, hedges, fences, power lines, silos): shapes made as plain numbers (js/land3d-mesh.js), each layer in its own pause, all of them with the
  // view's one material, so no new program is compiled. A layer takes only what is left of the triangle budget after the land and the plants; what does not fit is thinned from the far edge inwards and said.
  const WEIGHT = { buildings: 0.3, roads: 0.22, hedges: 0.14, water: 0.1, fences: 0.12, power: 0.06, things: 0.06 };
  const geometryOf = g => {
    const geo = new THREE.BufferGeometry(), n = g.position.length / 3, uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { uv[i * 2] = WHITE[0]; uv[i * 2 + 1] = WHITE[1]; }
    geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3)); geo.setAttribute('color', new THREE.BufferAttribute(g.color, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(g.index, 1));
    return geo;
  };
  async function details(sc, mine, made) {
    const report = [], layers = (sc.land?.layers || []).filter(l => l.state === 'ready' && BUILDERS[l.id]);
    stats.detailTriangles = 0;
    if (!layers.length) { stats.details = report; return; }
    const hm = sc.heights.model, yAt = hm && !hm.flat ? (x, z) => { const y = heightAtMesh(hm, x, z); return y === y ? y : 0; } : () => 0;
    let pool = Math.max(0, budget.triangles - stats.landTriangles - stats.plantTriangles), weights = layers.reduce((t, l) => t + (WEIGHT[l.id] ?? 0.05), 0);
    for (const layer of layers) {
      const share = Math.floor(pool * (WEIGHT[layer.id] ?? 0.05) / weights), b = createBuilder();
      weights -= WEIGHT[layer.id] ?? 0.05;
      const got = BUILDERS[layer.id](b, layer, { yAt, budget: share }), g = b.build();
      await step(mine, 'details');
      pool -= g.triangles; stats.detailTriangles += g.triangles;
      if (g.triangles) made.push(one(geometryOf(g)));
      report.push({ id: layer.id, drawn: got.drawn, of: got.of, detail: got.detail, triangles: g.triangles, note: thinnedWords(switchOf(layer.id)?.name || layer.id, got) });
    }
    stats.details = report;
  }
  // the lights of the scene's date: the sky light, and the one sun (a fill light at night, nothing in twilight), placed far off over the field
  function lights(sc) {
    const sky = sc.light.lights.find(l => l.type === 'hemisphere'), dir = sc.light.lights.find(l => l.type === 'directional');
    hemi.color.set(sky.sky); hemi.groundColor.set(sky.ground); hemi.intensity = sky.intensity;
    const b = sc.field.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, r = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 + 50;
    if (dir) { const d = dir.direction; sun.color.set(dir.colour); sun.intensity = dir.intensity; sun.position.set(cx + d.x * r * 3, d.y * r * 3, cz + d.z * r * 3); }
    else sun.intensity = 0;
    sun.target.position.set(cx, 0, cz); sun.target.updateMatrixWorld();
  }

  function draw() { frame = 0; if (!disposed && shown) renderer.render(scene, camera); }
  const need = () => { if (!frame && !disposed) frame = (globalThis.requestAnimationFrame || (f => setTimeout(f, 16)))(draw); };

  // Show a scene: built in steps beside the one on screen, then put in its place at once. A newer show() makes an older one stop at its next pause (it answers false).
  async function show(sc) {
    const key = pictureKey(sc) + '|' + (sc.shadeKey || '') + (sc.hidePlants ? '|np' : ''), land = sc.landKey || '';   // a new shade (another hour, an answer that has come) draws the ground again; a new land key draws the details
    const paintKey = sc.paintKey || '';
    if (shown && key === lastKey && land === lastLand && paintKey === lastPaint) return true;   // the same picture: nothing to draw again
    const mine = ++token, made = [], madeExtra = [];
    try {
      if (shown && key === lastKey && paintKey !== lastPaint) {   // only the picture or a layer over it changed: the ground is painted again, nothing is built
        await paint(sc, mine, usedPlants);
        if (disposed || mine !== token) throw superseded;
        texture.needsUpdate = true; lastPaint = paintKey; shown = sc;
        if (land === lastLand) { renderer.render(scene, camera); return true; }
      }
      if (shown && key === lastKey) {   // only the details of the land changed (a switch, or an answer that has arrived): the ground and the plants stay
        await step(mine, 'details');
        await details(sc, mine, madeExtra);
        await warm;
        if (disposed || mine !== token) throw superseded;
        for (const m of extra.splice(0)) free(m);
        for (const m of madeExtra.splice(0)) { content.add(m); extra.push(m); }
        lastLand = land; lastPaint = paintKey; shown = sc; scenes++;
        renderer.render(scene, camera);
        return true;
      }
      const first = !shown;
      await step(mine, 'land');
      made.push(...land_(sc));
      const room = Math.max(0, budget.triangles - stats.landTriangles), per = PER_PLANT[sc.cover?.shape] ?? 110;
      const list = sc.cover && !sc.hidePlants ? thinPlants(sc.cover.plants, Math.min(budget.plants, Math.floor(room / per))) : [];
      await step(mine, 'ground');
      await paint(sc, mine, list);
      await step(mine, 'plants');
      await plants(sc, list, mine, made);
      await step(mine, 'details');
      await details(sc, mine, madeExtra);
      await step(mine, 'light');
      await warm;   // the one program, compiled while all this was laid out
      if (disposed || mine !== token) throw superseded;
      // the swap: the new scene replaces the old in one moment; the old shapes are freed
      for (const m of meshes.splice(0)) free(m);
      for (const m of extra.splice(0)) free(m);
      for (const m of made.splice(0)) { content.add(m); meshes.push(m); }
      for (const m of madeExtra.splice(0)) { content.add(m); extra.push(m); }
      lights(sc);
      texture.needsUpdate = true;
      stats.plants = list.length;
      shown = sc; usedPlants = list; lastKey = key; lastLand = land; lastPaint = paintKey; scenes++;
      if (!compiled) {   // the first picture only: the ground picture goes up to the graphics chip in a step of its own
        await renderer.compileAsync(scene, camera);
        if (disposed || mine !== token) throw superseded;
        compiled = true;
        await step(mine, 'draw');
        renderer.initTexture(texture);
        await step(mine, 'draw');
      }
      renderer.render(scene, camera);
      if (first) env.onProgress?.('draw');
      return true;
    } catch (e) {
      for (const m of made) free(m);
      for (const m of madeExtra) free(m);
      if (e === superseded) return false;
      throw e;
    }
  }

  // Only the sun moved (a time of day for the same date): the ground picture is painted again (the plants' shadows and the shade) and the one sun light is moved. Nothing is built, no program changes.
  // A newer show() ends it at its next pause; it answers true when the new ground is on the glass.
  async function relight(sc) {
    if (!shown || disposed) return false;
    const mine = token, key = pictureKey(sc) + '|' + (sc.shadeKey || ''), paintKey = sc.paintKey || '';
    if (key === lastKey && paintKey === lastPaint) return true;
    try {
      await paint(sc, mine, usedPlants);
      if (disposed || mine !== token) return false;
      lights(sc); texture.needsUpdate = true; shown = sc; lastKey = key; lastPaint = paintKey;
      renderer.render(scene, camera);
      return true;
    } catch (e) { if (e === superseded) return false; throw e; }
  }

  const onLost = e => { e.preventDefault?.(); env.onLost?.(); };
  const onRestored = () => { compiled = false; lastKey = ''; lastLand = ''; lastPaint = ''; const sc = shown; shown = null; if (sc) show(sc).then(() => env.onRestored?.(), () => {}); };
  canvas.addEventListener?.('webglcontextlost', onLost);
  canvas.addEventListener?.('webglcontextrestored', onRestored);

  return {
    weak, budget,
    show, relight,
    pose({ position, target, fov }) {
      camera.position.set(position[0], position[1], position[2]);
      if (fov && camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.lookAt(target[0], target[1], target[2]);
      need();
    },
    size(width, height, ratio) {
      const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
      renderer.setPixelRatio(Math.min(ratio || 1, budget.pixelRatio));
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      need();
    },
    lightCount() { let n = 0; scene.traverse(o => { if (o.isDirectionalLight) n++; }); return n; },
    // the share of the picture that holds something drawn: it draws now, then reads the picture back in the same moment
    drawn() {
      if (!shown) return 0;
      renderer.render(scene, camera);
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
      return n / (W * H);
    },
    stats() {
      const info = renderer.info;
      return { ...stats, budget, scenes, programs: info.programs?.length ?? 0, triangles: stats.landTriangles + stats.plantTriangles + (stats.detailTriangles || 0), geometries: info.memory.geometries, textures: info.memory.textures, renderer: weak ? 'software' : 'graphics chip' };
    },
    dispose() {
      if (disposed) return; disposed = true; token++;
      if (frame) (globalThis.cancelAnimationFrame || clearTimeout)(frame);
      canvas.removeEventListener?.('webglcontextlost', onLost); canvas.removeEventListener?.('webglcontextrestored', onRestored);
      for (const m of meshes.splice(0)) free(m);
      for (const m of extra.splice(0)) free(m);
      mat.dispose(); texture.dispose(); renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* already gone */ }
      paper.width = paper.height = 1;
    },
  };
}
