// The report engine without freezing the page: one promise-returning call for each engine call, run on a worker started once; where there is none, or it dies, the same calls run on the page in pieces that yield.
// Pure apart from the worker and the clock it is handed; no network, no storage. The answers are the same everywhere.
// Checked by scripts/test_engine_worker.mjs (no browser) and scripts/e2e_engine_worker.mjs (a tap during a run still paints).
import { unpackSeries } from './series-pack.js';

// Let the browser handle taps and paint before the next piece of work.
export function yieldToBrowser() {
  const s = globalThis.scheduler;
  if (s && typeof s.yield === 'function') return s.yield();
  return new Promise(resolve => setTimeout(resolve, 0));
}

// True when this browser starts a worker as a module (reading the "type" option is how it is found out: an old browser never reads it).
export function supportsModuleWorkers(WorkerClass = globalThis.Worker) {
  if (typeof WorkerClass !== 'function') return false;
  let read = false, w = null, url = null;
  try {
    url = URL.createObjectURL(new Blob([''], { type: 'text/javascript' }));
    w = new WorkerClass(url, { get type() { read = true; return 'module'; } });
  } catch { return false; } finally { try { w?.terminate(); } catch { /* it had ended */ } try { if (url) URL.revokeObjectURL(url); } catch { /* nothing to free */ } }
  return read;
}

const drain = async (gen, yieldFn, stats) => {
  let r = gen.next();
  while (!r.done) { stats.pieces++; await yieldFn(); r = gen.next(); }
  return r.value;
};

// options: workerUrl, engineUrl (where js/engine.js is), forceFallback (never use a worker), yieldFn, WorkerClass, engine (an already loaded engine module: for tests).
export function createEngineClient(options = {}) {
  const { forceFallback = false, yieldFn = yieldToBrowser, WorkerClass = globalThis.Worker } = options;
  const workerUrl = options.workerUrl || new URL('./engine-worker.js', import.meta.url);
  const engineUrl = options.engineUrl || new URL('./engine.js', import.meta.url);
  const powerUrl = options.powerUrl || new URL('./power-climate.js', import.meta.url);
  let mode = 'idle', worker = null, next = 1, enginePromise = options.engine ? Promise.resolve(options.engine) : null, ready = null;
  const pending = new Map();
  const stats = { calls: 0, pieces: 0, fellBack: 0, startedAt: null };

  const failAll = reason => { for (const [id, p] of pending) { pending.delete(id); p.fail(reason); } };
  function toFallback(why) {
    if (mode === 'main') return;
    mode = 'main'; stats.fellBack++; stats.why = why;
    try { worker?.terminate(); } catch { /* already gone */ }
    worker = null;
    const waiting = [...pending.values()]; pending.clear();
    for (const p of waiting) runMain(p.op, p.args).then(p.done, p.fail);   // what was asked of the worker is asked again here, so no call is ever lost
  }
  function start() {
    if (ready) return ready;
    ready = new Promise(resolve => {
      if (forceFallback || !supportsModuleWorkers(WorkerClass)) { mode = 'main'; stats.why = forceFallback ? 'forced' : 'no module workers'; return resolve(); }
      try {
        worker = new WorkerClass(workerUrl, { type: 'module', name: 'crophalo-engine' });
      } catch (e) { mode = 'main'; stats.why = 'worker could not start'; return resolve(); }
      mode = 'worker'; stats.startedAt = Date.now();
      worker.onmessage = event => {
        const m = event.data, p = pending.get(m?.id);
        if (!p) return;
        pending.delete(m.id);
        if (m.ok) p.done(m.result); else { const err = new Error(m.error?.message || 'The engine could not answer'); err.name = m.error?.name || 'Error'; p.fail(err); }
      };
      worker.onerror = event => { event?.preventDefault?.(); toFallback('worker error'); };   // it could not load (an old browser), or it died: carry on here
      worker.onmessageerror = () => toFallback('worker message error');
      resolve();
    });
    return ready;
  }
  async function loadEngine() { return enginePromise ||= import(/* @vite-ignore */ String(engineUrl)); }
  async function runMain(op, args) {
    stats.calls++;
    if (op === 'climateFromPower') { await yieldFn(); const m = await import(/* @vite-ignore */ String(powerUrl)); return m.climateFromPower(...args); }   // needs no engine: only the climate files
    const E = await loadEngine();
    await yieldFn();   // the tap that started this goes first
    if (op === 'optionsFor' && typeof E.optionsForSteps === 'function') return drain(E.optionsForSteps(...args), yieldFn, stats);
    if (typeof E[op] !== 'function') throw new Error(`The engine has no call named ${op}`);
    return E[op](...args);
  }
  function call(op, args) {
    return start().then(() => new Promise((done, fail) => {
      if (mode === 'main') return runMain(op, args).then(done, fail);
      const id = next++;
      pending.set(id, { done, fail, op, args });
      try { worker.postMessage({ id, op, args }); } catch (e) { pending.delete(id); toFallback('post failed'); runMain(op, args).then(done, fail); }
    }));
  }
  return {
    optionsFor: (state, climate, spot, opts) => call('optionsFor', [state, climate, spot ?? {}, opts ?? {}]),
    groundOn: (plan, date) => call('groundOn', [plan, date]),
    keyDates: (current, proposed) => call('keyDates', [current, proposed]),
    climateFromPower: async (power, place) => { const r = await call('climateFromPower', [power, place]); return r?.ok ? { ...r, series: unpackSeries(r.series) } : r; },   // power: the answer as text (cheapest to send) or as an object
    ready: () => start().then(() => mode),
    mode: () => mode,
    stats: () => ({ ...stats, mode }),
    dispose() { try { worker?.terminate(); } catch { /* already gone */ } worker = null; failAll(new Error('The engine was stopped')); mode = 'idle'; ready = null; },
  };
}

// The page's one shared client, made the first time it is used.
let shared = null;
export const engine = () => shared ||= createEngineClient();
export const optionsFor = (...a) => engine().optionsFor(...a);
export const groundOn = (...a) => engine().groundOn(...a);
export const keyDates = (...a) => engine().keyDates(...a);
export const climateFromPower = (...a) => engine().climateFromPower(...a);
// For joins.js getOptions(state, climate, spot, engineLoader): the shared client has the same optionsFor, answering a promise (getOptions waits for it).
export const engineLoader = async () => engine();
