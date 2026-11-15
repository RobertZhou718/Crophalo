// The camera of the 3D field, as numbers only: the first view of the whole field, and how a drag, a pinch, the wheel, a key or a camera button moves it round the field.
// Pure: no page, no drawing, no clock. The page turns pointer moves into these calls and hands the pose (where the camera stands and what it looks at) to whatever draws.
// Checked by scripts/test_farm3d.mjs (the numbers) and scripts/e2e_farm3d.mjs, scripts/e2e_3d_open.mjs (the buttons in a real browser).
import { heightAtMesh } from './farm3d-data.js';

const RAD = Math.PI / 180;
// The same limits the view has always had: looking down between 10° and 80° from straight above, as close as 0.15 and as far as 3 times the first distance,
// and never wandering further from the middle of the land than its own span. Damping is the share of a swing still to come that each frame takes.
export const ORBIT = Object.freeze({ minPolar: 10 * RAD, maxPolar: 80 * RAD, nearShare: 0.15, farShare: 3, damping: 0.12, keyPanPx: 7, rest: 1e-4 });

// The first view: the whole field fits the picture, seen from the south (from the north south of the equator), tilted down as the scene says.
// sc is groundScene()'s answer; aspect is the picture's width over its height.
export function firstView(sc, aspect) {
  const b = sc.field.box, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, radius = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2;
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1, fov = a < 1 ? 36 : sc.camera.fov, vf = fov * RAD, hf = 2 * Math.atan(Math.tan(vf / 2) * a), fit = Math.min(vf, hf);
  const R = Math.max(radius * 1.6 / Math.tan(fit / 2), 40);
  const gy = sc.heights.model ? Math.max(0, heightAtMesh(sc.heights.model, cx, cz) || 0) : 0;
  return { target: [cx, gy, cz], theta: Math.PI - sc.camera.azimuth * RAD, phi: Math.PI / 2 - sc.camera.tilt * RAD, radius: R, fov, near: R * ORBIT.nearShare, far: R * ORBIT.farShare, span: sc.slab.span };
}

// Where the camera stands for a view: the target plus the radius along the angles (theta round the upright axis from +z, phi down from straight above).
export function poseOf(v) {
  const s = Math.sin(v.phi);
  return { position: [v.target[0] + v.radius * s * Math.sin(v.theta), v.target[1] + v.radius * Math.cos(v.phi), v.target[2] + v.radius * s * Math.cos(v.theta)], target: v.target.slice(), fov: v.fov };
}

// What a page needs to lean its own board to the first view and put the field where the first view puts it: the tilt, the field of view, the heading, and the field's corners as fractions of the picture
// (x to the right, y down, 0 to 1). Always the first view, never the farmer's turned camera; the ground is taken flat at the height of the field's middle. size is the picture in CSS pixels, handed back as it is.
export function firstViewFacts(sc, aspect, size = null) {
  const v = firstView(sc, aspect), a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1, pose = poseOf(v);
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]], dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]], unit = p => { const n = Math.hypot(...p) || 1; return [p[0] / n, p[1] / n, p[2] / n]; };
  const f = unit(sub(v.target, pose.position)), r = unit(cross(f, [0, 1, 0])), u = cross(r, f), th = Math.tan(v.fov * RAD / 2);
  const project = (x, z) => { const d = sub([x, v.target[1], z], pose.position), zc = dot(d, f); return { x: Math.round(((dot(d, r) / (zc * th * a)) + 1) / 2 * 1e4) / 1e4, y: Math.round((1 - dot(d, u) / (zc * th)) / 2 * 1e4) / 1e4 }; };
  const outline = sc.field.polygon.map(p => project(p.x, p.z)), xs = outline.map(p => p.x), ys = outline.map(p => p.y);
  return { tilt: sc.camera.tilt, fov: v.fov, azimuth: sc.camera.azimuth, northUp: Math.cos(sc.camera.azimuth * RAD) < 0, aspect: a, size: size ? { width: size.width, height: size.height } : null,
    centre: project(v.target[0], v.target[2]), outline, box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
// A camera that moves: drag to turn and tilt, drag with the right button (or a modifier, or two fingers) to slide over the ground, wheel or pinch to come closer.
// With damping (Settings > Motion: Full) a swing eases out over a few frames; without it (Less, Still) every move lands at once.
export function createOrbit(first, { damping = true } = {}) {
  let home = { ...first, target: first.target.slice() }, v = { ...home, target: home.target.slice() }, moved = false;
  let dTheta = 0, dPhi = 0, dScale = 1, pan = [0, 0];
  const settle = () => {
    v.phi = clamp(v.phi, ORBIT.minPolar, ORBIT.maxPolar);
    v.radius = clamp(v.radius, v.near, v.far);
    const r = Math.hypot(v.target[0], v.target[2]);
    if (r > v.span) { v.target[0] *= v.span / r; v.target[2] *= v.span / r; }
  };
  const apply = share => {
    v.theta += dTheta * share; v.phi += dPhi * share;
    v.radius *= Math.pow(dScale, share);
    v.target[0] += pan[0] * share; v.target[2] += pan[1] * share;
    settle();
  };
  const left = share => { dTheta *= 1 - share; dPhi *= 1 - share; dScale = Math.pow(dScale, 1 - share); pan = [pan[0] * (1 - share), pan[1] * (1 - share)]; };
  const now = () => { if (!damping) { apply(1); left(1); } };
  return {
    get moved() { return moved; },
    get view() { return { ...v, target: v.target.slice() }; },
    pose: () => poseOf(v),
    // dx, dy: pixels the pointer moved; h: the picture's height in pixels (a drag over the whole height turns the camera a full circle, as before)
    rotate(dx, dy, h) { dTheta -= 2 * Math.PI * dx / Math.max(1, h); dPhi -= 2 * Math.PI * dy / Math.max(1, h); moved = true; now(); },
    // slide over the ground: the field follows the hand, at the speed that keeps the point under the pointer under it
    slide(dx, dy, h) {
      const per = 2 * v.radius * Math.tan(v.fov * RAD / 2) / Math.max(1, h), rx = Math.cos(v.theta), rz = -Math.sin(v.theta), fx = -Math.sin(v.theta), fz = -Math.cos(v.theta);
      pan = [pan[0] - rx * dx * per + fx * dy * per, pan[1] - rz * dx * per + fz * dy * per]; moved = true; now();
    },
    // k below 1 comes closer, above 1 goes further; the wheel's notch of 100 is 5% (as the view always did)
    dolly(k) { if (k > 0 && Number.isFinite(k)) { dScale *= k; moved = true; now(); } },
    wheel(deltaY) { const k = Math.pow(0.95, Math.abs(deltaY) / 100); this.dolly(deltaY > 0 ? 1 / k : k); },
    // the camera buttons: a turn of so many degrees round the field (minus is to the left), and a zoom that does nothing past the limits; both land at once
    turn(deg) { v.theta -= deg * RAD; moved = true; settle(); },
    zoom(k) { const r = v.radius * k; if (r < v.near || r > v.far) return false; v.radius = r; moved = true; return true; },
    keyPan(dx, dy, h) { const was = damping; damping = false; this.slide(dx, dy, h); damping = was; },
    // one frame: true while a swing is still easing out (the page asks for another frame)
    step() {
      if (!damping) return false;
      apply(ORBIT.damping); left(ORBIT.damping);
      return Math.abs(dTheta) > ORBIT.rest || Math.abs(dPhi) > ORBIT.rest || Math.abs(dScale - 1) > ORBIT.rest || Math.hypot(pan[0], pan[1]) > ORBIT.rest * v.radius;
    },
    reset(next) { if (next) home = { ...next, target: next.target.slice() }; v = { ...home, target: home.target.slice() }; dTheta = dPhi = 0; dScale = 1; pan = [0, 0]; moved = false; },
    // a new first view (the picture changed shape, or the field did): taken at once unless the farmer has moved the camera, whose view is then kept
    refit(next) { if (!moved) this.reset(next); else { home = { ...next, target: next.target.slice() }; v.near = next.near; v.far = next.far; v.span = next.span; v.fov = next.fov; settle(); } },
    setDamping(on) { damping = !!on; if (!damping) { apply(1); left(1); } },
  };
}
