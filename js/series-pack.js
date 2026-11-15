// Moves the weather record between a worker and the page without freezing the page: lists of numbers cross as one block of memory and come back as the same plain lists.
// Pure, with no imports, so the page loads it at once; every number, NaN and -0 included, returns exactly.
// Checked by scripts/test_engine_worker.mjs.
export function packSeries(series) {
  if (!series || typeof series !== 'object') return series;
  const out = {};
  for (const [k, v] of Object.entries(series)) out[k] = Array.isArray(v) && v.length > 64 && v.every(x => typeof x === 'number') ? Float64Array.from(v) : v;
  return out;
}
export function unpackSeries(series) {
  if (!series || typeof series !== 'object') return series;
  const out = {};
  for (const [k, v] of Object.entries(series)) out[k] = v instanceof Float64Array ? Array.from(v) : v;
  return out;
}
