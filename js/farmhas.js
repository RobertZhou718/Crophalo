// Is this field already in My farm? It reads the saved farms straight from storage and imports nothing, so a report can ask without loading My farm or its engine.
// My farm uses this same function for its own farmHas, so there is one rule. Checked by scripts/test_sim.mjs (the key, the answer) and scripts/e2e_farm.mjs (in the page).
const KEY = 'crophalo.farms.v1';
const four = v => (Math.round(v * 1e4) / 1e4).toFixed(4);
export const keyOf = (lat, lon) => `${four(lat)},${four(lon)}`;   // a field is filed by its inside point to 4 decimals (about 11 m): "43.1300,-80.7500"
// place: the key "lat,lon" to 4 decimals, or { lat, lon }.
export function farmHas(place, storage = globalThis.localStorage) {
  const k = typeof place === 'string' ? (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(place.trim()) ? keyOf(...place.trim().split(',').map(Number)) : '') : Number.isFinite(+place?.lat) && Number.isFinite(+place?.lon) ? keyOf(+place.lat, +place.lon) : '';
  if (!k) return false;
  try { const saved = JSON.parse(storage?.getItem(KEY) || 'null'); return Array.isArray(saved?.farms) && saved.farms.some(f => Array.isArray(f?.fields) && f.fields.some(x => x?.key === k)); } catch { return false; }
}
