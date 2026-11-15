// Crophalo's name for a chosen place: "Near Barrie, Ontario". None of the answers the app already asks gives a town (the crop map names only the country, the weather services only a time zone),
// so the name is asked once from OpenStreetMap's place service (Nominatim, reverse lookup) when the field's position has stopped changing, never on every tap, and at most one request a second.
// The pure parts (the web address, the wording of the answer) are checked by scripts/test_placename.mjs; the lookup takes fetch, the clock and the wait as arguments so a test can stand in for them.
import { countryName } from './words.js';

export const GAP_MS = 1100;   // at most one request a second, the service's own rule
export const SETTLE_MS = 1500;   // the position must have rested this long before it is asked for its name
export const TOWN_KEYS = ['city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'county'];
export const PLACE_UNKNOWN = 'Your field';   // said when the service could not name the place; the coordinates are the small line under it
export const FINDING = 'Finding the place name';

export const reverseUrl = (lat, lon) => `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=en&lat=${(+lat).toFixed(4)}&lon=${(+lon).toFixed(4)}`;
const clean = v => String(v ?? '').trim();
// The service's answer as the top line: the nearest town and its province or state, else the region and the country, else the country. '' when it names nothing.
export function nameFromReverse(answer) {
  const a = answer?.address;
  if (!a || typeof a !== 'object') return '';
  const town = TOWN_KEYS.map(k => clean(a[k])).find(Boolean) ?? '', region = clean(a.state || a.province || a.region || a.state_district), country = countryName(clean(a.country), a.country_code);
  if (town && region) return `Near ${town}, ${region}`;
  if (town && country) return `Near ${town}, ${country}`;
  if (region && country) return `${region}, ${country}`;
  return country || region || '';
}
let lastAt = 0;
const kept = new Map();
const keyOf = (lat, lon) => `${(+lat).toFixed(3)},${(+lon).toFixed(3)}`;   // about a hundred metres: the same field is asked once
// Asks for the name of a position: { ok: true, name } or { ok: false, reason }. A name is kept for the visit; a failure is asked again next time.
export function loadName(lat, lon, env = {}) {
  const key = keyOf(lat, lon);
  if (kept.has(key)) return kept.get(key);
  const now = env.now ?? Date.now, wait = env.wait ?? (ms => new Promise(done => setTimeout(done, ms))), get = env.fetch ?? globalThis.fetch?.bind(globalThis);
  const run = (async () => {
    if (!get) return { ok: false, reason: 'No way to ask for the name.' };
    const gap = lastAt + GAP_MS - now();
    lastAt = Math.max(now(), lastAt) + (gap > 0 ? gap : 0);
    if (gap > 0) await wait(gap);
    try {
      const res = await get(reverseUrl(lat, lon), { signal: globalThis.AbortSignal?.timeout?.(8000) });
      if (!res.ok) return { ok: false, reason: `status ${res.status}` };
      const name = nameFromReverse(await res.json());
      return name ? { ok: true, name } : { ok: false, reason: 'The service gave no town for this place.' };
    } catch (e) { return { ok: false, reason: String(e?.message ?? e) }; }
  })();
  kept.set(key, run);
  run.then(a => { if (!a.ok && kept.get(key) === run) kept.delete(key); });
  return run;
}
export const forgetNames = () => { kept.clear(); lastAt = 0; };
