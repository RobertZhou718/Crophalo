// The 3D picture of a field, drawn off the page: a module worker that loads three.js and draws on the OffscreenCanvas the page hands it, so building the
// scene and waiting for the graphics chip never hold the page. In: start, scene, pose, size, ask, dispose. Out: step, ready, shown, fail, lost, restored, answer.
// Checked by scripts/e2e_3d_open.mjs (in a real browser: the page stays free, one context in all, nothing left after ten opens and closes).
import { createDrawer, makeContext } from './farm3d-draw.js';
import { groundScene } from './farm3d-data.js';
import { shadeFor } from './shade3d.js';
import { createLand, attachLand, landMessage } from './land3d-load.js';
import { createLayers } from './layers3d-load.js';

const THREE_URL = new URL('../vendor/three/three.module.js', import.meta.url).href;
const UTILS_URL = new URL('../vendor/three/addons/utils/BufferGeometryUtils.js', import.meta.url).href;
const post = m => self.postMessage(m);
const failed = e => post({ type: 'fail', why: 'error', message: String(e?.message || e).slice(0, 200) });
// a pause that lets the next message in (a newer scene, a camera move, a close) without the 4 ms floor of a chain of timers
const lane = new MessageChannel(), waiting = [];
lane.port1.onmessage = () => waiting.shift()?.();
const pause = () => new Promise(done => { waiting.push(done); lane.port2.postMessage(0); });

let lastInput = null;
const shadeView = shadeFor({ say: () => { if (lastInput && !closed) { sunDirty = true; if (!showing) relight(); } } });   // the shade job runs in its own worker; an answer that arrives paints the ground again (nothing is rebuilt)
const BASE = new URL('../', import.meta.url).href;   // the lookups are at /api/osm and /api/osmextra of the same site
const land = createLand({ fetchImpl: (u, o) => fetch(u, o), base: BASE, say: () => { if (lastInput && !closed) display(lastInput); } });   // an answer that arrives draws the details again
const layers = createLayers({ fetchImpl: (u, o) => fetch(u, o), makeCanvas: (w, h) => new OffscreenCanvas(w, h), say: () => { if (lastInput && !closed) display(lastInput); } });   // the picture and the layers over it: an answer that arrives draws the ground again
let drawer = null, pending = null, ready = false, closed = false, scenes = 0, shownAt = 0, size = null, pose = null;   // a size or a camera that comes before the drawer is kept for it
// Only the newest scene is drawn: a newer one makes the one being built stop at its next pause.
// sunMs: a time of day the page asked for (message 'sun'); it stands over the scene's own hour until the page asks for none (null).
let sunMs = null, showing = 0, relighting = false, sunDirty = false;
const withSun = input => (sunMs == null ? input : { ...input, hourMs: sunMs });
function display(input) {
  if (!drawer || closed) { pending = input; return; }
  lastInput = input;
  const use = withSun(input), mine = ++shownAt, sc = layers.attach(attachLand(land, shadeView.attach(groundScene({ ...use, plantLimit: drawer.budget.plants }), use), use));
  showing++;
  drawer.show(sc).then(done => {
    showing--;
    if (!done || closed || mine !== shownAt) return;
    scenes++;
    post(shadeView.message(sc));
    post(landMessage(sc, drawer.stats().details, land));
    post({ type: 'layers', layers: layers.layers(sc) });
    if (!ready) { ready = true; post({ type: 'ready', stats: drawer.stats() }); } else post({ type: 'shown', scenes });
    if (sunDirty) relight();
  }, e => { showing--; failed(e); });
}
// Only the sun moved: the ground and the light for the time asked, nothing else. Asks that come while one is drawn fold into the newest, so a call for every frame is safe.
async function relight() {
  if (relighting) return;
  relighting = true;
  try {
    while (sunDirty && drawer && lastInput && !closed && !showing) {
      sunDirty = false;
      const use = withSun(lastInput), sc = layers.attach(shadeView.attach(groundScene({ ...use, plantLimit: drawer.budget.plants }), use));
      if (await drawer.relight(sc) && !closed) { post(shadeView.message(sc)); post({ type: 'sunshown', ms: sc.momentMs }); }
    }
  } catch (e) { failed(e); } finally { relighting = false; }
}

async function start(m) {
  const gl = makeContext(m.canvas, { antialias: !!m.budget?.antialias });   // off the page a software context is kept: it is slow, but it holds only this worker
  if (!gl) { post({ type: 'fail', why: 'no-webgl' }); return; }
  post({ type: 'step', step: 'tools' });
  let THREE, Utils;
  try { [THREE, Utils] = await Promise.all([import(THREE_URL), import(UTILS_URL)]); } catch { post({ type: 'fail', why: 'load-failed' }); return; }
  if (closed) return;
  const made = createDrawer({ THREE, Utils, canvas: m.canvas, gl, makeCanvas: (w, h) => new OffscreenCanvas(w, h), budget: m.budget, pause,
    onProgress: step => post({ type: 'step', step }), onLost: () => post({ type: 'lost' }), onRestored: () => post({ type: 'restored' }) });
  if (made.failed) { post({ type: 'fail', why: made.failed }); return; }
  drawer = made;
  size = size || m.size; pose = pose || m.pose;
  if (size) drawer.size(size.width, size.height, size.dpr);
  if (pose) drawer.pose(pose);
  display(pending || m.input); pending = null;
}

self.onmessage = event => {
  const m = event.data || {};
  if (closed) return;
  try {
    if (m.type === 'start') start(m).catch(failed);
    else if (m.type === 'scene') display(m.input);
    else if (m.type === 'layer') layers.setLayer(m.id, m.on);
    else if (m.type === 'greenness') layers.setGreenness(m.answer);
    else if (m.type === 'erosion') layers.setErosion(m.input);
    else if (m.type === 'sun') { sunMs = Number.isFinite(m.ms) ? m.ms : null; sunDirty = true; if (!showing) relight(); }
    else if (m.type === 'pose') { pose = m.pose; drawer?.pose(m.pose); }
    else if (m.type === 'size') { size = { width: m.width, height: m.height, dpr: m.dpr }; drawer?.size(m.width, m.height, m.dpr); }
    else if (m.type === 'ask') {
      const value = !drawer ? null : m.what === 'stats' ? { ...drawer.stats(), drawn: drawer.drawn(), lights: drawer.lightCount() } : m.what === 'drawn' ? drawer.drawn() : m.what === 'lights' ? drawer.lightCount() : null;
      post({ type: 'answer', id: m.id, value });
    } else if (m.type === 'dispose') { closed = true; shadeView.dispose(); land.dispose(); layers.dispose(); drawer?.dispose(); drawer = null; self.close(); }
  } catch (e) { failed(e); }
};
