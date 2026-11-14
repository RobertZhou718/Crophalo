// The 3D look of one field: the same field, plan and date as the Map, drawn as a slab of land with what covers the ground (standing plants, young plants,
// low residue, bare soil) as clearly different shapes. Part 2 of the 3D farm: it draws only what js/farm3d-data.js describes. three.js is loaded only when
// this is opened (a dynamic import), the picture is drawn only when something changes, and everything is freed on dispose. Every number or word is page text
// beside the picture, never drawn inside it.
//
//   const view = await view3d(input, node, { onFallback })     input is what My Farm gives for one field, one plan and one date (see groundScene in farm3d-data.js)
//   view.update(nextInput)   view.dispose()   view.ok   view.status
import { groundScene, heightAtMesh, mix, PALETTE, soilDepthDrawn, GRID_SIZE_PHONE } from './farm3d-data.js';
import { esc } from './words.js';

const THREE_URL = new URL('../vendor/three/three.module.js', import.meta.url).href;
const ORBIT_URL = new URL('../vendor/three/addons/controls/OrbitControls.js', import.meta.url).href;
const UTILS_URL = new URL('../vendor/three/addons/utils/BufferGeometryUtils.js', import.meta.url).href;

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
// A software renderer (no graphics chip) draws slowly: the view then uses the phone's smaller limits.
export function softwareRenderer(gl) {
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; return /swiftshader|llvmpipe|software|basic render/i.test(name); } catch { return false; }
}
export function canDraw3d() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

const LEGEND = [
  { id: 'standing', name: 'Standing plants', mark: '<path d="M6 20V6M12 20V3M18 20V7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>' },
  { id: 'residue', name: 'Residue left after harvest', mark: '<path d="M3 17l7-2M12 18l8-2M5 21l6-1M14 12l6-1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>' },
  { id: 'bare', name: 'Bare soil', mark: '<path d="M3 18h18M3 13h18" stroke="currentColor" stroke-width="2" stroke-dasharray="1 4" stroke-linecap="round" fill="none"/>' },
];
const legendFor = cover => cover?.kind === 'standing' || cover?.kind === 'young' ? 'standing' : cover?.kind || null;

function markup(sc, ids) {
  const act = legendFor(sc.cover);
  return `
    <div class="f3d-bar"><p class="f3d-label" id="${ids}-label"><strong>${esc(sc.label.state)}</strong> · ${esc(sc.label.plan)} · ${esc(sc.label.dateWords)}</p></div>
    <div class="f3d-stage" tabindex="0" role="application" aria-label="${esc(sc.aria)}" aria-describedby="${ids}-keys">
      <canvas class="f3d-canvas" aria-hidden="true"></canvas>
      <div class="f3d-tools" role="group" aria-label="Camera">
        <button type="button" class="f3d-btn" data-act="left" aria-label="Turn left">&#8630;</button>
        <button type="button" class="f3d-btn" data-act="right" aria-label="Turn right">&#8631;</button>
        <button type="button" class="f3d-btn" data-act="in" aria-label="Zoom in">+</button>
        <button type="button" class="f3d-btn" data-act="out" aria-label="Zoom out">&minus;</button>
        <button type="button" class="f3d-btn f3d-reset" data-act="reset">Reset view</button>
      </div>
      <p class="f3d-wait" hidden></p>
    </div>
    <p class="f3d-keys" id="${ids}-keys">Arrow keys move the view around the field. Plus and minus zoom. 0 goes back to the first view.</p>
    <ul class="f3d-legend" aria-label="What the shapes mean">${LEGEND.map(l => `<li class="${l.id === act ? 'is-on' : ''}"${l.id === act ? ' aria-current="true"' : ''}><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${l.mark}</svg><span>${l.name}</span></li>`).join('')}</ul>
    <div class="f3d-words" aria-live="polite">
      <p class="f3d-cover">${esc(sc.words.cover)}${sc.words.note ? ' ' + esc(sc.words.note) : ''}</p>
      <p>${esc(sc.words.outline)}</p>
      <p class="f3d-heights">${esc(sc.words.heights)}</p>
      <p>${esc(sc.words.sun)}</p>
      <p class="f3d-note">${esc(sc.words.illustrative)}</p>
    </div>`;
}

let counter = 0;
export async function view3d(input, node, options = {}) {
  const ids = 'f3d' + (++counter);
  const view = { ok: false, status: 'starting', node, update() {}, dispose() { node.replaceChildren(); } };
  node.classList.add('f3d');
  if (!canDraw3d()) {
    node.innerHTML = '<p class="f3d-plain" role="status">This device cannot draw 3D. The Map shows the same field, plan and date.</p>';
    view.status = 'no-webgl'; options.onFallback?.('no-webgl');
    return view;
  }
  let THREE, Orbit, Utils;
  try {
    [THREE, { OrbitControls: Orbit }, Utils] = await Promise.all([import(THREE_URL), import(ORBIT_URL), import(UTILS_URL)]);
  } catch {
    node.innerHTML = '<p class="f3d-plain" role="status">The 3D view could not load. The Map shows the same field, plan and date.</p>';
    view.status = 'load-failed'; options.onFallback?.('load-failed');
    return view;
  }

  let weak = false;
  const phone = () => weak || node.clientWidth < 600 || (typeof matchMedia === 'function' && matchMedia('(max-width: 599px)').matches);
  let sc = groundScene({ ...input, phone: phone() });
  node.innerHTML = markup(sc, ids);
  const stage = node.querySelector('.f3d-stage'), canvas = node.querySelector('.f3d-canvas'), waitEl = node.querySelector('.f3d-wait');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    node.innerHTML = '<p class="f3d-plain" role="status">This device cannot draw 3D. The Map shows the same field, plan and date.</p>';
    view.status = 'no-webgl'; options.onFallback?.('no-webgl');
    return view;
  }
  weak = softwareRenderer(renderer.getContext());
  if (weak) sc = groundScene({ ...input, phone: true });   // the plants are the same ones, fewer of them, on a smaller map
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone() ? 1.5 : 2));

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, 1, 50000);
  const content = new THREE.Group(); scene.add(content);
  const controls = new Orbit(camera, canvas);
  controls.enableDamping = !reduced(); controls.dampingFactor = 0.12;
  controls.minPolarAngle = 10 * Math.PI / 180; controls.maxPolarAngle = 80 * Math.PI / 180;
  controls.screenSpacePanning = false;
  controls.listenToKeyEvents(stage);

  let frame = 0, disposed = false, moved = false, framing = null, lastKey = '';
  const need = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw); };
  const draw = () => {
    frame = 0; if (disposed) return;
    const busy = controls.update();
    renderer.render(scene, camera);
    if (busy) need();
  };
  controls.addEventListener('change', need);
  controls.addEventListener('start', () => { moved = true; });

  // ---- what is in the scene is rebuilt whenever the field, plan or date changes; the camera stays where the farmer put it
  const owned = [];
  const own = o => { owned.push(o); return o; };
  const clearContent = () => { for (const o of owned.splice(0)) o.dispose?.(); content.clear(); };

  function fitCamera(keep) {
    const b = sc.field.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, radius = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2;
    const w = Math.max(stage.clientWidth, 1), h = Math.max(stage.clientHeight, 1), aspect = w / h;
    camera.fov = aspect < 1 ? 36 : sc.camera.fov; camera.aspect = aspect; camera.updateProjectionMatrix();
    const vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect), fit = Math.min(vf, hf);
    const R = Math.max(radius * 1.6 / Math.tan(fit / 2), 40);
    controls.minDistance = R * 0.15; controls.maxDistance = R * 3;
    const lim = sc.slab.span; controls.maxTargetRadius = lim;
    const gy = sc.heights.model ? Math.max(0, heightAtMesh(sc.heights.model, cx, cz) || 0) : 0;
    controls.target.set(cx, gy, cz);
    const az = sc.camera.azimuth * Math.PI / 180, tilt = sc.camera.tilt * Math.PI / 180;
    camera.position.set(cx + R * Math.cos(tilt) * Math.sin(az), gy + R * Math.sin(tilt), cz - R * Math.cos(tilt) * Math.cos(az));
    camera.lookAt(controls.target);
    controls.update();
    framing = { R, cx, cz, gy };
    if (!keep) moved = false;
  }

  function terrain() {
    const W = sc.slab.width, D = sc.slab.depth, hm = sc.heights.model;
    const nx = hm ? hm.nx : 2, ny = hm ? hm.ny : 2, pos = new Float32Array(nx * ny * 3), ok = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = -W / 2 + i * W / (nx - 1), z = -D / 2 + j * D / (ny - 1);
      let y = 0, good = 1;
      if (hm) { const v = hm.h[k]; if (v === v) y = v - hm.base; else good = 0; }
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; ok[k] = good;
    }
    const idx = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {   // two triangles a cell, the long side north-east to south-west, facing up
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (ok[a] && ok[c] && ok[b]) idx.push(a, c, b);
      if (ok[b] && ok[c] && ok[d]) idx.push(b, c, d);
    }
    const uv = new Float32Array(nx * ny * 2);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { uv[(j * nx + i) * 2] = i / (nx - 1); uv[(j * nx + i) * 2 + 1] = j / (ny - 1); }
    const geo = own(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const tex = own(paintGround());
    const mesh = new THREE.Mesh(geo, own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, flatShading: !!hm })));
    mesh.receiveShadow = true; content.add(mesh);
    // the cut sides: the real top 2 m of soil drawn deep, in the soil's colour, so the slab reads as a piece of land
    const depth = soilDepthDrawn(sc.slab.span).depth * 0.5, soil = sc.soilColour, sides = [];
    const edge = (i0, j0, i1, j1) => { const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0)); for (let s = 0; s < n; s++) { const a = (j0 + Math.sign(j1 - j0) * s) * nx + i0 + Math.sign(i1 - i0) * s, b = (j0 + Math.sign(j1 - j0) * (s + 1)) * nx + i0 + Math.sign(i1 - i0) * (s + 1); if (ok[a] && ok[b]) sides.push([a, b]); } };
    edge(0, 0, nx - 1, 0); edge(nx - 1, 0, nx - 1, ny - 1); edge(nx - 1, ny - 1, 0, ny - 1); edge(0, ny - 1, 0, 0);
    const sp = [], si = [];
    sides.forEach(([a, b], n) => { const base = n * 4; sp.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2], pos[b * 3], -depth, pos[b * 3 + 2], pos[a * 3], -depth, pos[a * 3 + 2]); si.push(base, base + 1, base + 2, base, base + 2, base + 3, base + 2, base + 1, base, base + 3, base + 2, base); });
    const sg = own(new THREE.BufferGeometry()); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setIndex(si); sg.computeVertexNormals();
    const wall = new THREE.Mesh(sg, own(new THREE.MeshStandardMaterial({ color: soil, roughness: 1, side: THREE.DoubleSide, flatShading: true }))); wall.castShadow = false; content.add(wall);
    const bottom = new THREE.Mesh(own(new THREE.PlaneGeometry(W, D)), own(new THREE.MeshStandardMaterial({ color: PALETTE.slabBase, roughness: 1 })));
    bottom.rotation.x = Math.PI / 2; bottom.position.y = -depth; content.add(bottom);
  }

  // the ground painted: open land, the field in the colour of what lies on it, faint rows, the outline (dashed when it is only an estimate)
  function paintGround() {
    const size = phone() ? 1024 : 2048, cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d'), W = sc.slab.width, D = sc.slab.depth, px = x => (x + W / 2) / W * size, pz = z => (z + D / 2) / D * size;
    g.fillStyle = mix(PALETTE.openGround, PALETTE.grass, 0.25); g.fillRect(0, 0, size, size);
    const cover = sc.cover, soil = sc.soilColour;
    const base = !cover || cover.kind === 'bare' ? soil : cover.kind === 'residue' ? mix(soil, '#d9c490', 0.55) : mix(soil, cover.colour, 0.22);
    g.beginPath(); sc.field.polygon.forEach((p, i) => i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z))); g.closePath();
    g.fillStyle = base; g.fill();
    if (cover && (cover.kind === 'standing' || cover.kind === 'young' || cover.kind === 'bare')) {   // faint rows, or ridges of bare soil, along the row direction
      g.save(); g.clip(); g.strokeStyle = cover.kind === 'bare' ? 'rgba(60,40,20,0.22)' : 'rgba(30,60,30,0.14)'; g.lineWidth = Math.max(1, size / 700);
      const a = (cover.bearing || 90) * Math.PI / 180, ux = Math.sin(a), uz = -Math.cos(a), vx = -uz, vz = ux, step = Math.max(6, size / 90), big = size * 1.5;
      for (let o = -big; o < big; o += step) { const cx = size / 2 + vx * o, cz = size / 2 + vz * o; g.beginPath(); g.moveTo(cx - ux * big, cz - uz * big); g.lineTo(cx + ux * big, cz + uz * big); g.stroke(); }
      g.restore();
    }
    if (cover && cover.kind === 'residue') {   // the stubble texture: many short light and dark strokes lying every way, only inside the field
      g.save(); g.clip();
      const b = sc.field.box, n = phone() ? 5000 : 14000, len = Math.max(4, cover.length / W * size * 0.9);
      for (let i = 0; i < n; i++) {
        const h1 = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1, h2 = Math.abs(Math.sin(i * 78.233) * 12345.678) % 1, h3 = Math.abs(Math.sin(i * 39.346) * 9876.543) % 1;
        const x = px(b.x0 + h1 * (b.x1 - b.x0)), z = pz(b.z0 + h2 * (b.z1 - b.z0)), a = h3 * Math.PI;
        g.strokeStyle = i % 3 ? 'rgba(240,222,170,0.9)' : 'rgba(110,80,40,0.7)'; g.lineWidth = Math.max(1.4, size / 900);
        g.beginPath(); g.moveTo(x - Math.cos(a) * len / 2, z - Math.sin(a) * len / 2); g.lineTo(x + Math.cos(a) * len / 2, z + Math.sin(a) * len / 2); g.stroke();
      }
      g.restore();
    }
    g.beginPath(); sc.field.polygon.forEach((p, i) => i ? g.lineTo(px(p.x), pz(p.z)) : g.moveTo(px(p.x), pz(p.z))); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = Math.max(3, size / 340); g.strokeStyle = PALETTE.navy; if (sc.field.estimated) g.setLineDash([size / 60, size / 90]); g.stroke();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;
    return t;
  }

  // plant shapes, one unit tall, drawn from parts with their colours baked in; the field's cover decides which stands up
  const paint = (geo, hex) => { const n = geo.attributes.position.count, c = new THREE.Color(hex), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };
  const lean = (geo, tilt, yaw, y) => { geo.rotateZ(tilt); geo.rotateY(yaw); geo.translate(0, y, 0); return geo; };
  function plantGeometry(cover) {
    const leaf = cover.colour, stem = mix(cover.colour, '#7a5a3a', 0.45), head = '#d9b45a', parts = [];
    if (cover.shape === 'maize') {
      parts.push(paint(new THREE.CylinderGeometry(0.045, 0.065, 1, 5).translate(0, 0.5, 0), stem));
      for (let k = 0; k < 6; k++) parts.push(paint(lean(new THREE.ConeGeometry(0.09, 0.62, 4).translate(0, 0.31, 0), (k % 2 ? -1 : 1) * 1.12, k * 2.1, 0.22 + k * 0.1), leaf));
      if (cover.stage >= 2) parts.push(paint(new THREE.ConeGeometry(0.06, 0.2, 4).translate(0, 0.98, 0), head));
    } else if (cover.shape === 'legume-bush') {
      const blob = (r, x, y, z, sy) => paint(new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1).translate(x, y, z), leaf);
      parts.push(blob(0.36, 0, 0.32, 0, 0.85), blob(0.28, 0.3, 0.26, 0.12, 0.8), blob(0.26, -0.26, 0.24, -0.16, 0.8), blob(0.22, 0.05, 0.62, -0.05, 0.8));
    } else {   // cereal and the rest: a tuft of narrow blades
      for (let k = 0; k < 8; k++) parts.push(paint(lean(new THREE.ConeGeometry(0.035, 1, 3).translate(0, 0.5, 0), 0.12 + (k % 3) * 0.1, k * 0.8, 0), k % 2 ? leaf : mix(leaf, '#ffffff', 0.12)));
      if (cover.stage >= 3) for (let k = 0; k < 3; k++) parts.push(paint(lean(new THREE.ConeGeometry(0.05, 0.16, 4).translate(0, 0.92, 0), 0.1 + k * 0.08, k * 2.4, 0), head));
    }
    return Utils.mergeGeometries(parts, false);
  }
  const MATERIAL = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const groundAt = (x, z) => { const hm = sc.heights.model; if (!hm) return 0; const y = heightAtMesh(hm, x, z); return y === y ? y : 0; };
  const WIDTH = { maize: 0.62, 'legume-bush': 1.05, cereal: 0.7 };

  function plants() {
    const cover = sc.cover; if (!cover || !cover.plants.length) return;
    const dummy = new THREE.Object3D(), list = cover.plants;
    if (cover.kind === 'residue') {
      const fleck = own(paint(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cover.colour)), stub = own(paint(new THREE.CylinderGeometry(0.5, 0.5, 1, 5).translate(0, 0.5, 0), mix(cover.colour, '#7a5a3a', 0.35)));
      const flecks = list.filter((p, i) => i % 3 !== 0), stubs = list.filter((p, i) => i % 3 === 0);
      for (const [geo, items, kind] of [[fleck, flecks, 'fleck'], [stub, stubs, 'stub']]) {
        const mesh = new THREE.InstancedMesh(geo, own(MATERIAL()), items.length);
        items.forEach((p, i) => {
          dummy.position.set(p.x, groundAt(p.x, p.z), p.z); dummy.rotation.set(0, p.turn * Math.PI / 180, 0);
          if (kind === 'fleck') dummy.scale.set(cover.length * p.scale, cover.height * 0.5, cover.length * 0.16);
          else dummy.scale.set(cover.length * 0.12, cover.height * 1.6 * p.scale, cover.length * 0.12);
          dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = false; mesh.receiveShadow = true; content.add(mesh);
      }
      return;
    }
    const geo = own(plantGeometry(cover)), mesh = new THREE.InstancedMesh(geo, own(MATERIAL()), list.length), w = WIDTH[cover.shape] ?? 0.7;
    list.forEach((p, i) => {
      const s = cover.height * p.scale;
      dummy.position.set(p.x, groundAt(p.x, p.z), p.z); dummy.rotation.set(0, p.turn * Math.PI / 180, 0); dummy.scale.set(s * w, s, s * w);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = true; mesh.receiveShadow = false; content.add(mesh);
  }

  // exactly one sun: one directional light, and a hemisphere of sky and ground
  function lights() {
    const hemi = sc.light.lights.find(l => l.type === 'hemisphere'), sun = sc.light.lights.find(l => l.type === 'directional');
    content.add(new THREE.HemisphereLight(hemi.sky, hemi.ground, hemi.intensity));
    if (!sun) return;
    const b = sc.field.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, r = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 + 50, d = sun.direction;
    const light = new THREE.DirectionalLight(sun.colour, sun.intensity);
    light.position.set(cx + d.x * r * 3, d.y * r * 3, cz + d.z * r * 3); light.target.position.set(cx, 0, cz);
    light.castShadow = true; light.shadow.mapSize.set(phone() ? 1024 : 2048, phone() ? 1024 : 2048);
    Object.assign(light.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: r * 8 }); light.shadow.camera.updateProjectionMatrix(); light.shadow.bias = -0.0006; light.shadow.normalBias = 0.3;
    content.add(light, light.target);
  }

  function build() {
    clearContent(); terrain(); plants(); lights();
    renderer.shadowMap.needsUpdate = true;
    const [top, bottom] = [sc.sky.top, sc.sky.bottom];
    stage.style.background = `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`;
  }
  function size() {
    const w = Math.max(stage.clientWidth, 1), h = Math.max(stage.clientHeight, 1);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const text = () => { const parent = node.querySelector('.f3d-words'), label = node.querySelector('.f3d-label'); return { parent, label }; };
  function refreshWords() {   // only the words and the legend change when the date or plan does; the stage and its camera stay
    const fresh = document.createElement('div'); fresh.innerHTML = markup(sc, ids);
    for (const sel of ['.f3d-label', '.f3d-words', '.f3d-legend']) node.querySelector(sel).replaceWith(fresh.querySelector(sel));
    stage.setAttribute('aria-label', sc.aria);
  }

  size(); build(); fitCamera(false); need();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (disposed) return; size(); if (!moved) fitCamera(false); need(); }) : null;
  ro?.observe(stage);

  // ---- the camera buttons and keys: the first view can always be had again
  const turn = deg => { const off = camera.position.clone().sub(controls.target), a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); camera.position.set(controls.target.x + off.x * c - off.z * s, camera.position.y, controls.target.z + off.x * s + off.z * c); moved = true; controls.update(); need(); };
  const zoom = k => { const off = camera.position.clone().sub(controls.target).multiplyScalar(k); const len = off.length(); if (len < controls.minDistance || len > controls.maxDistance) return; camera.position.copy(controls.target).add(off); moved = true; controls.update(); need(); };
  const act = { left: () => turn(-15), right: () => turn(15), in: () => zoom(0.8), out: () => zoom(1.25), reset: () => { fitCamera(false); need(); } };
  const onClick = e => { const b = e.target.closest('[data-act]'); if (b) act[b.dataset.act]?.(); };
  const onKey = e => {
    if (e.target !== stage) return;
    if (e.key === '+' || e.key === '=') zoom(0.8); else if (e.key === '-') zoom(1.25); else if (e.key === '0') act.reset();
    else if (e.shiftKey && e.key === 'ArrowLeft') turn(-15); else if (e.shiftKey && e.key === 'ArrowRight') turn(15); else return;
    e.preventDefault();
  };
  node.addEventListener('click', onClick); stage.addEventListener('keydown', onKey);
  const onLost = e => { e.preventDefault(); view.status = 'context-lost'; waitEl.hidden = false; waitEl.textContent = '3D paused. The device needed its graphics memory. The Map shows the same field.'; options.onFallback?.('context-lost'); };
  canvas.addEventListener('webglcontextlost', onLost);
  const onRestore = () => { waitEl.hidden = true; view.status = 'ready'; build(); need(); };
  canvas.addEventListener('webglcontextrestored', onRestore);

  // ---- heights: the farm may hand them over, or a loader to ask for them once
  let heightsToken = 0;
  async function wantHeights(inp) {
    if (inp.heights !== undefined || typeof inp.loadHeights !== 'function') return;
    const token = ++heightsToken;
    waitEl.hidden = false; waitEl.textContent = "Reading the land's heights…";
    let grid = null; try { grid = await inp.loadHeights(sc.heightRequest); } catch { grid = null; }
    if (disposed || token !== heightsToken) return;
    waitEl.hidden = true;
    input = { ...input, heights: grid || null };
    sc = groundScene({ ...input, phone: phone() }); build(); refreshWords(); if (!moved) fitCamera(false); need();
  }

  view.ok = true; view.status = 'ready';
  view.scene = () => sc;
  view.weak = weak;
  view.drawn = () => {   // the share of the picture that holds something drawn: it renders now, then reads the canvas in the same moment
    renderer.render(scene, camera);
    const g = document.createElement('canvas'); g.width = canvas.width; g.height = canvas.height; const x = g.getContext('2d'); x.drawImage(canvas, 0, 0);
    const d = x.getImageData(0, 0, g.width, g.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n / (d.length / 4);
  };
  view.camera = () => ({ position: camera.position.toArray(), target: controls.target.toArray(), moved });
  view.lightCount = () => { let n = 0; scene.traverse(o => { if (o.isDirectionalLight) n++; }); return n; };
  view.update = next => {
    input = next; sc = groundScene({ ...input, phone: phone() });
    const key = JSON.stringify([sc.field.polygon.length, sc.slab.width, sc.slab.depth, sc.field.estimated]);
    build(); refreshWords();
    if (key !== lastKey) { lastKey = key; if (!moved) fitCamera(false); }
    need(); wantHeights(input);
  };
  lastKey = JSON.stringify([sc.field.polygon.length, sc.slab.width, sc.slab.depth, sc.field.estimated]);
  view.dispose = () => {
    if (disposed) return; disposed = true;
    cancelAnimationFrame(frame); ro?.disconnect();
    node.removeEventListener('click', onClick); stage.removeEventListener('keydown', onKey);
    canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestore);
    controls.dispose(); clearContent();
    renderer.dispose(); try { renderer.forceContextLoss(); } catch { /* already gone */ }
    node.replaceChildren(); node.classList.remove('f3d'); view.ok = false; view.status = 'closed';
  };
  wantHeights(input);
  return view;
}
