// The 3D view's shade: where the shade of the near land falls on a field at the day and hour shown, drawn on the ground picture, and said in words with "Shade figures are about, to the half hour."
// Pure: the job itself is js/shade.js, run in its own background worker (or inline where a device has none) through the `ask` handed in; no page, no storage, no network. A missing height never shades and never clears.
// Checked by scripts/test_shade.mjs (the sentences, the lattice, a wall's shadow, nothing filled in) and scripts/e2e_farm3d.mjs.
import { MOMENT, chooseStep, polygonArea, makeLattice } from './shade.js';
import { clock } from './sun.js';

export const ABOUT = 'Shade figures are about, to the half hour.';
export const SWITCH_ON = 'Shade on: the hatching shows where the shade falls at the hour shown.';
export const SWITCH_OFF = 'Shade off.';
const NO_HEIGHTS = 'Heights not read, so the shade cannot be worked out.';
const WORKING = 'Working out the shade…';
const FAILED = 'Shade could not be worked out right now.';

// The lattice step for the 3D picture: coarser than the shade job's own default, because the picture is drawn at about this size and the job must stay quick.
export const stepFor = (areaM2, phone = false) => Math.min(30, Math.max(phone ? 10 : 5, chooseStep(areaM2, phone), areaM2 > 2e6 ? 20 : areaM2 > 1e5 ? 10 : 5));

// What the job needs from a scene: the fields' outlines and the heights, in the scene's own metres. { ok: false, why } when the heights are not read.
export function shadeInput(sc, { phone = false } = {}) {
  const hm = sc.heights?.model;
  if (!hm || hm.flat) return { ok: false, why: NO_HEIGHTS };
  const polys = [sc.field.polygon.map(p => [p.x, p.z])];
  const area = polys.reduce((s, p) => s + polygonArea(p), 0), step = stepFor(area, phone);
  const ground = Float32Array.from(hm.h);
  return { ok: true, key: [sc.slab.lat, sc.slab.lon, sc.slab.width, sc.slab.depth, hm.nx, hm.ny, polys[0].length, Math.round(area), step].join(':'),
    input: { polys, lat: sc.slab.lat, lon: sc.slab.lon, step, far: null, grid: { nx: hm.nx, ny: hm.ny, x0: -hm.width / 2, z0: -hm.depth / 2, dx: hm.cellX, dz: hm.cellZ, ground } } };
}
export const sunOf = sc => (sc.sun ? { azimuth: sc.sun.azimuth, apparent: sc.sun.height } : null);
export const momentKey = sun => sun ? `${Math.round(sun.azimuth * 2) / 2}:${Math.round(sun.apparent * 2) / 2}` : 'none';

// The cells that are in shade, as rectangles in the scene's metres (runs along a row joined), for the ground picture.
export function shadeRects(lattice, mask) {
  const out = [], { nx, ny, x0, z0, step } = lattice;
  for (let j = 0; j < ny; j++) {
    let from = -1;
    for (let i = 0; i <= nx; i++) {
      const shaded = i < nx && (mask[j * nx + i] === MOMENT.LAND || mask[j * nx + i] === MOMENT.TREES || mask[j * nx + i] === MOMENT.HILLS);
      if (shaded && from < 0) from = i;
      if (!shaded && from >= 0) { out.push({ x: x0 + from * step - step / 2, z: z0 + j * step - step / 2, w: (i - from) * step, d: step }); from = -1; }
    }
  }
  return out;
}

// The words for the moment: how much of the field is in shade, and why, and that the figure is about.
export function shadeWords({ field, mask, lattice, momentMs, zone }) {
  const when = momentMs != null ? clock(momentMs, zone) : '';
  const count = { sun: 0, shade: 0, land: 0, trees: 0, hills: 0, under: 0, down: 0, bad: 0 };
  for (let k = 0; k < mask.length; k++) {
    const m = mask[k];
    if (m === MOMENT.OUT) continue;
    if (m === MOMENT.SUN) count.sun++; else if (m === MOMENT.LAND) { count.land++; count.shade++; } else if (m === MOMENT.TREES) { count.trees++; count.shade++; } else if (m === MOMENT.HILLS) { count.hills++; count.shade++; }
    else if (m === MOMENT.UNDER) { count.under++; count.shade++; } else if (m === MOMENT.DOWN) count.down++; else if (m === MOMENT.BAD) count.bad++;
  }
  const all = count.sun + count.shade + count.down + count.bad;
  const name = field?.name || 'Your field', lead = when ? `${when}. ` : '';
  let line;
  if (!all) line = `${lead}${name}: the shade could not be worked out here.`;
  else if (count.down === all) line = `${lead}${name}: the sun is down, so there is no shade to show.`;
  else if (count.bad > all / 2) line = `${lead}${name}: the shade could not be worked out for most of it, because heights are missing there. Nothing is drawn where heights are missing.`;
  else if (!count.shade) line = `${lead}${name}: in sun.`;
  else {
    const share = Math.round(count.shade / (count.sun + count.shade) * 20) * 5, cause = count.hills >= count.land && count.hills >= count.trees && count.hills ? 'the hills' : count.trees > count.land ? 'trees' : 'the land';
    line = share < 5 ? `${lead}${name}: in sun, with a few small patches of shade of ${cause}.` : share >= 95 ? `${lead}${name}: in shade of ${cause}.` : `${lead}${name}: about ${share}% of it is in the shade of ${cause}.`;
  }
  return { lines: [line, ABOUT], count, share: all ? count.shade / Math.max(1, count.sun + count.shade) : 0 };
}

// ---- the controller: one per view. It asks for the job once for each piece of land and for the moment once for each sun position; a state for each scene.
// ask(msg) -> Promise of the job worker's result ({ op: 'build' | 'moment', key, input | sun }). say(): told when something arrived, so the view draws again.
export function createShade({ ask, say = () => {} } = {}) {
  let job = null, closed = false;   // job: { key, state: 'building' | 'ready' | 'cannot', lattice? }
  let moment = { key: '', mask: null }, asking = '';
  function stateFor(on, sc, phone) {
    if (!on) return { state: 'off' };
    const made = shadeInput(sc, { phone });
    if (!made.ok) return { state: 'cannot', words: [made.why] };
    if (!job || job.key !== made.key) {
      // the lattice is cheap: made here, so the job worker sends back nothing large
      const mine = job = { key: made.key, state: 'building', lattice: null }; moment = { key: '', mask: null }; asking = '';
      ask({ op: 'build', key: made.key, input: made.input }).then(r => { if (closed || job !== mine) return; mine.state = 'ready'; mine.step = r.step; mine.lattice = makeLattice(made.input.polys, made.input.step); say(); }, () => { if (job === mine) { mine.state = 'failed'; say(); } });
    }
    if (job.state === 'building') return { state: 'waiting', words: [WORKING] };
    if (job.state === 'failed') return { state: 'cannot', words: [FAILED] };
    const sun = sunOf(sc), key = momentKey(sun);
    if (!sun) return { state: 'cannot', words: ['The sun is not known for this day, so the shade cannot be worked out.'] };
    if (moment.key !== key && asking !== key) {
      asking = key;
      const mine = job;
      ask({ op: 'moment', key: job.key, sun }).then(r => { if (closed || job !== mine) return; moment = { key, mask: r.moment }; asking = ''; say(); }, () => { asking = ''; if (job === mine) { mine.state = 'failed'; say(); } });
    }
    if (moment.key !== key) return { state: 'waiting', words: [WORKING] };
    return { state: 'ready', mask: moment.mask, lattice: job.lattice, key: `${job.key}|${key}` };
  }
  return { stateFor, dispose() { closed = true; job = null; } };
}

// ---- the job's own background worker, started on first use (js/shade-worker.js); where a device cannot start one the job runs here, in the thread that asked (slower, and said nowhere: the answer is the same).
export function shadeAsker() {
  let worker = null, ids = 0;
  const waiting = new Map();
  const inline = msg => import('./shade.js').then(m => m.runJob(msg));
  return {
    ask(msg) {
      if (typeof Worker !== 'function') return inline(msg);
      if (!worker) {
        try {
          worker = new Worker(new URL('./shade-worker.js', import.meta.url), { type: 'module', name: 'crophalo-shade' });
          worker.onmessage = e => { const { id, ok, result, error } = e.data || {}, w = waiting.get(id); waiting.delete(id); if (w) ok ? w.res(result) : w.rej(new Error(error)); };
          worker.onerror = () => { for (const w of waiting.values()) w.rej(new Error('the shade worker stopped')); waiting.clear(); worker = null; };
        } catch { worker = null; return inline(msg); }
      }
      return new Promise((res, rej) => { const id = ++ids; waiting.set(id, { res, rej }); worker.postMessage({ id, ...msg }); });
    },
    dispose() { try { worker?.terminate(); } catch { /* it had ended */ } worker = null; for (const w of waiting.values()) w.rej(new Error('closed')); waiting.clear(); },
  };
}
// The scene's shade for one view: the controller, and what the page is told (the words), in one place for the worker and the page's own drawer.
export function shadeFor({ say }) {
  const asker = shadeAsker(), shade = createShade({ ask: asker.ask, say });
  return {
    attach(sc, input) {
      sc.shade = shade.stateFor(!!input.land?.choice?.shade, sc, !!input.phone);
      sc.shadeKey = sc.shade.state === 'ready' ? sc.shade.key : sc.shade.state;
      sc.zoneOpts = { zone: input.zone, offsetMin: input.offsetMin, lon: sc.slab.lon };
      return sc;
    },
    message(sc) {
      const s = sc.shade;
      if (!s || s.state === 'off') return { type: 'shade', state: 'off', words: [] };
      if (s.state !== 'ready') return { type: 'shade', state: s.state, words: s.words || [] };
      return { type: 'shade', state: 'ready', words: shadeWords({ field: sc.field, mask: s.mask, lattice: s.lattice, momentMs: sc.momentMs, zone: sc.zoneOpts }).lines };
    },
    dispose() { shade.dispose(); asker.dispose(); },
  };
}
