// Crophalo's "what farmers grow around here" for the report: asks the server's own crop-map route once and gives back the spot fields the engine reads (absent, common, nearby), plus the place fields it needs
// (country, elevation). A lookup that fails leaves the gate open and says so in nearby.gap: no crop is then checked against local practice, and the report says that.
// Pure but for the one fetch: engineSpot(), loadNearby(). Checked by scripts/test_report.mjs (the spot built for the engine, a failed lookup, the answer's fields passed through).
import { spotFields } from './nearby.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
export const NEAR_MS = 25e3;
// The spot the engine is asked with: the place, its country (the engine reads country, not cc), height and slope when known, and what the crop map says.
export const engineSpot = (state, near = {}) => ({ lat: state.loc.lat, lon: state.loc.lon, name: state.name, label: state.loc.label, cc: state.loc.cc, country: state.loc.cc,
  ...(fin(state.loc.elev) ? { elev: state.loc.elev } : {}), ...(fin(state.area?.slope) ? { slope: state.area.slope } : {}), ...near });
export async function loadNearby(loc, get = globalThis.fetch?.bind(globalThis), ms = NEAR_MS) {
  const lat = Number(loc?.lat), lon = Number(loc?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof get !== 'function') return spotFields(null);
  const country = String(loc.cc || String(loc.label ?? '').split(',').pop()).trim();   // the code when known, else the country the place line ends with ("Canada"); the server reads either
  try {
    const raced = await Promise.race([get(`/api/cropsnear?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}${country ? `&country=${encodeURIComponent(country)}` : ''}`).then(r => r.json()), new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms))]);
    return spotFields(raced);
  } catch { return spotFields({ ok: false, reason: 'the lookup did not answer' }); }
}
