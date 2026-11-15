// Crophalo's "what farmers grow around here" for the report: asks the server's own crop-map route once and gives back the spot fields the engine reads (absent, common, nearby), plus the place fields it needs
// (country, elevation). A lookup that fails leaves the gate open and says so in nearby.gap: no crop is then checked against local practice, and the report says that.
// Pure but for the fetches: engineSpot(), fetchCropMap(), loadNearby(), nearbyFrom(). Checked by scripts/test_report.mjs (the spot built for the engine, a failed lookup, the answer's fields passed through).
import { spotFields, fieldWordFor } from './nearby.js';
import { plainReason } from './satellites2-data.js';
import { apiUrl } from './api.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
export const NEAR_MS = 25e3, LISTS_MS = 6e3;   // how long the page waits for the national lists once the crop map has answered
// The spot the engine is asked with: the place, its country (the engine reads country, not cc), height and slope when known, and what the crop map says.
export const engineSpot = (state, near = {}) => ({ lat: state.loc.lat, lon: state.loc.lon, name: state.name, label: state.loc.label, cc: state.loc.cc, country: state.loc.cc,
  ...(fin(state.loc.elev) ? { elev: state.loc.elev } : {}), ...(fin(state.area?.slope) ? { slope: state.area.slope } : {}), ...near,
  ...(near?.notField && fieldWordFor(state.loc, state.loc?.fieldOk) === near.notField.code ? { fieldOk: true } : {}) });   // the farmer's word counts for this pin and this class only
// The crop map's own answer, as the server gives it (the setup's crop step and the report both read it). A lookup that fails or is slow gives { ok: false, reason }.
export async function fetchCropMap(loc, get = globalThis.fetch?.bind(globalThis), ms = NEAR_MS) {
  const lat = Number(loc?.lat), lon = Number(loc?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof get !== 'function') return { ok: false, reason: 'no place to look at' };
  const country = countryOf(loc);
  try {
    const a = await Promise.race([get(apiUrl(`/api/cropsnear?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}${country ? `&country=${encodeURIComponent(country)}` : ''}`)).then(r => r.json()), new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms))]);
    return a && typeof a === 'object' && a.ok !== true && typeof a.reason === 'string' ? { ...a, reason: plainReason(a.reason, 'the lookup did not answer') } : a;   // a refusal in a farmer's words: it is shown in the report's gaps and the crop step
  } catch { return { ok: false, reason: 'the lookup did not answer' }; }
}
// The code when known, else the country the place line ends with ("Canada"); the server reads either.
const countryOf = loc => String(loc.cc || String(loc.label ?? '').split(',').pop()).trim();
export async function loadNearby(loc, get = globalThis.fetch?.bind(globalThis), ms = NEAR_MS) {
  const lat = Number(loc?.lat), lon = Number(loc?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof get !== 'function') return spotFields(null);
  const lists = nationalLists(get, ms);   // asked side by side with the crop map; the server keeps the answer for a day
  return gated(fetchCropMap(loc, get, ms), lists, loc, ms);
}
// The same spot fields from a crop-map answer that is already kept (or the promise of one), as the report's loader keeps it: only the national lists are asked here.
export const nearbyFrom = (mapAnswer, loc, get = globalThis.fetch?.bind(globalThis), ms = NEAR_MS) =>
  gated(mapAnswer, typeof get === 'function' ? nationalLists(get, ms) : Promise.resolve(null), loc, ms);
async function gated(mapAnswer, lists, loc, ms) {
  let map;
  try { map = await mapAnswer; } catch { map = { ok: false, reason: 'the lookup did not answer' }; }
  return spotFields(map ?? null, await Promise.race([lists, new Promise(done => setTimeout(() => done(null), Math.min(ms, LISTS_MS)))]), countryOf(loc ?? {}));   // the map names the crops it can; the country's list decides the rest (given up on after a few seconds: the map's own answer stands)
}
// FAOSTAT's harvested areas per country (the server keeps the answer for a day and shares it). Null when it does not answer: the gate then stays open.
async function nationalLists(get, ms) {
  try { return await Promise.race([get(apiUrl('/api/faostat')).then(r => r.json()), new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms))]); } catch { return null; }
}
