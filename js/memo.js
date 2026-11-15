// Crophalo's lookup memory: one lookup for one place is started once and shared by whoever asks next, while it runs and for a few minutes after, so the report can open on answers that
// were started when the place was chosen. A lookup that failed is forgotten at once (the next ask tries again); a good one is kept for MEMO_MS.
// Pure but for the promises it holds: once(), forget(), spotKey(). Checked by scripts/test_report.mjs (one start for two asks, a failure retried, an old answer asked again, places kept apart).
export const MEMO_MS = 10 * 60e3;
const kept = new Map();
export const spotKey = (name, loc, extra = '') => `${name}:${Number(loc?.lat).toFixed(4)},${Number(loc?.lon).toFixed(4)}${extra ? ':' + extra : ''}`;
// run() starts the lookup; good(answer) says whether the answer is worth keeping (default: it is not null and not { ok: false }).
export function once(key, run, { good = a => a != null && a.ok !== false, now = Date.now } = {}) {
  const hit = kept.get(key);
  if (hit && now() - hit.at < MEMO_MS) return hit.promise;
  const promise = Promise.resolve().then(run);
  kept.set(key, { at: now(), promise });
  promise.then(a => { if (!good(a) && kept.get(key)?.promise === promise) kept.delete(key); }, () => { if (kept.get(key)?.promise === promise) kept.delete(key); });
  return promise;
}
export const forget = key => void kept.delete(key);
export const forgetAll = () => kept.clear();
export const isKept = key => kept.has(key);
