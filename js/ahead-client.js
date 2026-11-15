// Crophalo's Look ahead client: one function, run(type, job, onProgress), that works on a worker started the first time it is asked, or, where module workers are not available or the worker dies, in small steps on the page between frames.
// The answers are the same either way. No network, no storage. Checked by scripts/test_ahead_job.mjs (the fallback path, progress, a dead worker) and scripts/e2e_ahead.mjs (a real worker).
import { computeJob } from './ahead-job.js';

export const yieldToBrowser = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise(r => setTimeout(r, 0)));
export function supportsModuleWorkers(W = globalThis.Worker) {
  if (typeof W !== 'function') return false;
  let read = false, w = null, url = null;
  try { url = URL.createObjectURL(new Blob([''], { type: 'text/javascript' })); w = new W(url, { get type() { read = true; return 'module'; } }); } catch { return false; } finally { try { w?.terminate(); } catch { /* ended */ } try { if (url) URL.revokeObjectURL(url); } catch { /* none */ } }
  return read;
}
// options: workerUrl, judgeUrl, forceFallback, Worker, judge, cropOf (the fallback's own), yieldFn.
export function createAheadClient(options = {}) {
  const { forceFallback = false, judgeUrl = '', yieldFn = yieldToBrowser } = options, W = options.Worker ?? globalThis.Worker;
  let worker = null, mode = 'idle', next = 1; const pending = new Map();
  const fallback = async (type, job, onProgress) => {
    let judge = options.judge, cropOf = options.cropOf;
    if (!judge && judgeUrl) { try { judge = (await import(judgeUrl)).judgeSeason; } catch { judge = null; } }
    if (!cropOf) { const m = await import('./crops.js'); cropOf = id => m.cropOf(id); }
    return computeJob(type, job, { judge: judge ?? (() => null), cropOf, yieldFn, progress: (what, done, of) => onProgress?.({ what, done, of }) });
  };
  function start() {
    if (mode !== 'idle') return;
    if (forceFallback || !supportsModuleWorkers(W)) { mode = 'fallback'; return; }
    try {
      worker = new W(options.workerUrl ?? new URL('./future-worker.js', import.meta.url), { type: 'module' }); mode = 'worker';
      worker.onmessage = e => { const p = pending.get(e.data?.id); if (!p) return; if (e.data.progress) return void p.onProgress?.(e.data.progress); pending.delete(e.data.id); p.done(e.data.out); };
      const dies = () => { mode = 'fallback'; const lost = [...pending.values()]; pending.clear(); for (const p of lost) fallback(p.type, p.job, p.onProgress).then(p.done); };
      worker.onerror = dies; worker.onmessageerror = dies;
    } catch { mode = 'fallback'; }
  }
  return {
    get mode() { return mode; },
    run(type, job, onProgress) {
      start();
      if (mode === 'fallback') return fallback(type, job, onProgress);
      return new Promise(done => { const id = next++; pending.set(id, { done, onProgress, type, job }); try { worker.postMessage({ id, type, job, judgeUrl }); } catch { pending.delete(id); mode = 'fallback'; fallback(type, job, onProgress).then(done); } });
    },
    stop() { try { worker?.terminate(); } catch { /* ended */ } worker = null; mode = 'idle'; for (const p of pending.values()) p.done({ ok: false, type: p.type, reason: 'Look ahead was stopped.' }); pending.clear(); },
  };
}
