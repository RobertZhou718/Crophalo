// Crophalo's terrain work, done in the module worker (js/terrain-worker.js) or, when no worker can start, on the page in small steps: Terrain Tiles fetched six at a time and kept once decoded, then one layer tile
// or the readings at the pin worked out from the 3 × 3 block of height tiles round it. Not pure (it fetches); the maths is js/terrain-math.js.
// Checked by scripts/test_terrain.mjs (a stand-in network: every tile fetched once, the six-at-a-time limit, failures said, the small steps) and scripts/e2e_terrain.mjs (the real worker in a browser).
import { TILE, MID, SIDE, MAX_ZOOM, tileAddress, prefixesOf, nativeZoom, decodeTerrarium, makeGrid, renderTile, pointValues, pixelAt } from './terrain-math.js';

export const AT_ONCE = 6, KEEP_TILES = 64, FETCH_MS = 20e3, RETRY_AFTER_MS = 60e3;
const inflateDeflate = bytes => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
export const nextTask = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(done => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); done(); }; ch.port2.postMessage(0); }));

// budgetMs: how long one stretch of computing may run before it lets the page (or the worker's messages) in. The page uses a few milliseconds; the worker a little more.
export function createEngine({ fetch: ask = (url, o) => globalThis.fetch(url, o), inflate = inflateDeflate, atOnce = AT_ONCE, keep = KEEP_TILES, budgetMs = 40, now = () => Date.now(), clock = () => globalThis.performance?.now?.() ?? Date.now(), pause = nextTask } = {}) {
  const kept = new Map(), loading = new Map(), waiting = [], cancelled = new Set();   // 'z/x/y' → a decoded tile, { none } or { failed, at }; 'z/x/y' → its fetch; queued fetches; ids of jobs no longer wanted
  const counts = { fetched: 0, asked: {}, computed: 0, longestStepMs: 0, steps: 0, slowest: [] };   // slowest: the five longest steps, with their layer and place in the work
  let active = 0, chain = Promise.resolve(), scratch = null;   // scratch: the two 768 × 768 buffers every block is worked in, reused (one computation at a time)
  const buffers = () => (scratch ??= { raw: new Float32Array(SIDE * SIDE), smooth: new Float32Array(SIDE * SIDE), pool: {} });
  const decodePause = budgetMs <= 16 ? pause : null;   // on the page, a tile is decoded 64 rows at a time
  const slot = () => new Promise(go => { if (active < atOnce) { active++; go(); } else waiting.push(go); });
  const free = () => { const next = waiting.shift(); if (next) next(); else active--; };
  const remember = (key, value) => { kept.delete(key); kept.set(key, value); while (kept.size > keep) kept.delete(kept.keys().next().value); };   // the least recently used goes first

  // One height tile, fetched once and kept: { heights, whole, prefixes }, { none: true } (no tile there) or { failed: 'fetch' | 'decode' }.
  function load(template, z, x, y) {
    const n = 2 ** z; if (!(z >= 0 && z <= MAX_ZOOM) || y < 0 || y >= n) return Promise.resolve({ none: true });
    const wx = ((x % n) + n) % n, key = `${z}/${wx}/${y}`, have = kept.get(key);
    if (have && !(have.failed && now() - have.at > RETRY_AFTER_MS)) { remember(key, have); return Promise.resolve(have); }
    if (loading.has(key)) return loading.get(key);
    const run = (async () => {
      await slot();
      try {
        counts.fetched++; counts.asked[key] = (counts.asked[key] ?? 0) + 1;
        const res = await ask(tileAddress(template, z, wx, y), { signal: AbortSignal.timeout(FETCH_MS), credentials: 'omit' });
        if (res.status === 404 || res.status === 403) return { none: true };
        if (!res.ok) return { failed: 'fetch', at: now() };
        const prefixes = prefixesOf(res.headers.get('x-amz-meta-x-imagery-sources')), bytes = new Uint8Array(await res.arrayBuffer());
        try { const { heights, whole, lo, hi } = await decodeTerrarium(bytes, inflate, decodePause); return { heights, whole, lo, hi, prefixes }; } catch { return { failed: 'decode', at: now() }; }
      } catch { return { failed: 'fetch', at: now() }; } finally { free(); }
    })().then(v => { loading.delete(key); remember(key, v); return v; });
    loading.set(key, run);
    return run;
  }
  const block = (template, z, x, y) => Promise.all([-1, 0, 1].flatMap(dy => [-1, 0, 1].map(dx => load(template, z, x + dx, y + dy))));
  const exclusive = fn => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };   // one computation at a time, so small steps of two never interleave

  async function drive(gen, id, kind = '') {   // runs a generator, letting others in whenever a stretch passes budgetMs; null when the job was called off
    let from = clock();
    for (let i = 0; ; i++) {
      if (cancelled.has(id)) return null;
      const t = clock(), step = gen.next(), took = clock() - t;
      counts.steps++; if (took > counts.longestStepMs) counts.longestStepMs = took;
      if (took > 16) { counts.slowest.push({ kind, at: i, ms: Math.round(took) }); counts.slowest.sort((a, b) => b.ms - a.ms); counts.slowest.length = Math.min(5, counts.slowest.length); }
      if (step.done) return step.value;
      if (clock() - from > budgetMs) { await pause(); from = clock(); }
    }
  }
  const refused = (id, centre) => ({ id, ok: false, why: centre.none ? 'none' : centre.failed ?? 'fetch' });

  async function tileJob(job) {
    const { id, kind, z, x, y, template } = job, tiles = await block(template, z, x, y), centre = tiles[4];
    if (cancelled.has(id)) return { id, ok: false, why: 'cancelled' };
    if (!centre.heights) return refused(id, centre);
    return exclusive(async () => {
      if (cancelled.has(id)) return { id, ok: false, why: 'cancelled' };
      const grid = makeGrid(tiles.map(t => (t.heights ? t : null)), z, y, centre.whole, buffers());
      await pause();
      const out = await drive(renderTile(kind, grid, job.opts ?? {}, new Uint8ClampedArray(TILE * TILE * 4)), id, kind);
      if (!out) return { id, ok: false, why: 'cancelled' };
      counts.computed++;
      return { id, ok: true, rgba: out.buffer, prefixes: centre.prefixes, native: nativeZoom(centre.prefixes), whole: centre.whole, lo: grid.lo, hi: grid.hi, gx: grid.gx[MID + TILE / 2], gy: grid.gy[MID + TILE / 2], missing: tiles.filter(t => !t.heights).length };
    });
  }
  async function pointJob(job) {
    const { id, lat, lon, z, template } = job;
    if (!(Math.abs(lat) <= 85.0511)) return { id, ok: false, why: 'far' };
    const at = pixelAt(lat, lon, z), tiles = await block(template, z, at.x, at.y), centre = tiles[4];
    if (!centre.heights) return refused(id, centre);
    return exclusive(async () => {
      const grid = makeGrid(tiles.map(t => (t.heights ? t : null)), z, at.y, centre.whole, buffers());
      await pause();
      const values = pointValues(grid, MID + at.py, MID + at.px, job.opts ?? {});
      return { id, ok: values.ok, why: values.ok ? '' : 'none', values, prefixes: centre.prefixes, native: nativeZoom(centre.prefixes), whole: centre.whole, lo: grid.lo, hi: grid.hi };
    });
  }
  async function probeJob(job) {   // which height map lies under a place: the zoom worth computing at
    const { id, lat, lon, z, template } = job, at = pixelAt(lat, lon, z), t = await load(template, z, at.x, at.y);
    return t.heights ? { id, ok: true, prefixes: t.prefixes, native: nativeZoom(t.prefixes), whole: t.whole } : refused(id, t);
  }

  async function run(job) {
    try {
      if (job.type === 'tile') return await tileJob(job);
      if (job.type === 'point') return await pointJob(job);
      if (job.type === 'probe') return await probeJob(job);
      return { id: job.id, ok: false, why: 'unknown job' };
    } finally { cancelled.delete(job.id); }
  }
  return {
    run,
    cancel(id) { cancelled.add(id); if (cancelled.size > 4096) cancelled.clear(); },
    retry() { for (const [key, v] of kept) if (v.failed) kept.delete(key); },   // "Try again": the tiles that failed are asked for once more
    counts: () => ({ fetched: counts.fetched, asked: { ...counts.asked }, computed: counts.computed, kept: kept.size, longestStepMs: Math.round(counts.longestStepMs * 10) / 10, steps: counts.steps, slowest: counts.slowest.map(s => ({ ...s })) }),
  };
}
