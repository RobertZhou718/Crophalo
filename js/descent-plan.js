// The numbers of THE DESCENT: where the globe and the map are the same size, how long each stretch of the flight is, which way round the Earth turns. Pure: no page, no clock.
// Used by js/macro-descent.js; checked by scripts/test_live_orbits.mjs.
const D = Math.PI / 180, SHARP_PX = 2048;
export const PIN_ZOOM = 15;   // a field's zoom on a pin: what the setup uses after "I am at my field"   // the setup map's own zoom for a place; the width of the Earth picture that stays sharp
// An orthographic globe of radius r px shows 6,371,000 / r metres a pixel at its middle; a Web Mercator map at zoom z shows 156,543.03 cos(lat) / 2^z: they match when 2^z = 0.024571 r cos(lat).
// A whole zoom, so the map's tiles are crisp; zoom 4 where the picture stays sharp at that size (r at most (width / 2 pi) x 1.6), else zoom 3.
export function handoff(lat, rMax = (SHARP_PX / (2 * Math.PI)) * 1.6) {
  const c = Math.cos(Math.min(84, Math.abs(lat)) * D), at = z => 2 ** z / (0.024571 * c), z = at(4) <= rMax ? 4 : 3;
  return { z_h: z, r_h: at(z) };
}
// The times (ms) of one flight: the turn, the fall, the hand-off; never over 3,200 (2,100 on a phone); a slow computer shortens them
export function flightPlan({ phone = false, quality = 1 } = {}) {
  const k = Math.min(1, Math.max(0.5, quality || 1)), p = phone ? { total: 2100, turn: [0, 500], fall: [300, 1100], over: [1100, 1350] } : { total: 3200, turn: [0, 700], fall: [400, 1700], over: [1700, 2060] };
  return { total: Math.round(p.total * k), turn: p.turn.map(x => Math.round(x * k)), fall: p.fall.map(x => Math.round(x * k)), over: p.over.map(x => Math.round(x * k)), sats: [0, Math.round(400 * k)] };
}
export const part = (t, [a, b]) => Math.min(1, Math.max(0, (t - a) / Math.max(1, b - a)));   // how far through a stretch of the flight t is, 0 to 1
export const shortWay = (from, to) => from + (((to - from + 540) % 360) - 180);       // the longitude to turn to, the short way round


// ---- the Witness: of Landsat 8 and 9 and Sentinel-2A, 2B and 2C, the one nearest the place now
export const IMAGERS = Object.freeze([39084, 49260, 40697, 42063, 60989]);
const RE = 6371.0088;
// A place on the Earth's surface as a point fixed to the Earth, in km (x to 0° E on the equator, y to 90° E, z north), the same frame as the satellites' places
export const placeEcf = (lat, lon) => { const p = lat * D, l = lon * D; return [RE * Math.cos(p) * Math.cos(l), RE * Math.cos(p) * Math.sin(l), RE * Math.sin(p)]; };
export const slantKm = (ecf, lat, lon) => { const q = placeEcf(lat, lon); return Math.hypot(ecf[0] - q[0], ecf[1] - q[1], ecf[2] - q[2]); };
// sats: [{ norad, name, ecf: [x, y, z] km | null }] as the home draws them; the nearest of the picture-taking ones with a place, or null
export function nearestImager(sats, lat, lon) {
  let best = null;
  for (const s of sats || []) { if (!IMAGERS.includes(s.norad) || !Array.isArray(s.ecf) || !s.ecf.every(Number.isFinite)) continue; const km = slantKm(s.ecf, lat, lon); if (!best || km < best.km) best = { norad: s.norad, name: s.name, km }; }
  return best;
}
export const witnessWords = (w, ms) => (w ? `Nearest picture-taking satellite now: ${w.name}, ${String(Math.round(w.km)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km from this field (${new Date(ms).toISOString().slice(11, 16)} UTC)` : '');
