// The 3D view's land heights: asks the server's height lookup for the block the scene wants and turns its answer into the grid the view draws.
// decodeHeights() is pure; loadHeights() is the one function that reaches the server. A failure is an answer too: the view then draws the land flat and says why.
// Checked by scripts/test_farm3d.mjs.
import { plainReason } from './satellites2-data.js';
import { apiUrl } from './api.js';

// "AAAA" base64 of little-endian 32-bit floats -> Float32Array (NaN stays NaN: no height there)
export function floatsOf(b64) {
  const bin = atob(String(b64 || '')), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
}
// The server's answer -> the grid {nx, ny, width, depth, h, source, name, res_m, native_m, kind, credit, licence, data_date, cover}, or {failed: sentence}.
export function decodeHeights(answer, request) {
  if (!answer || typeof answer !== 'object') return { failed: 'The land heights could not be read right now.' };
  if (answer.ok !== true) return { failed: plainReason(answer.reason, 'The land heights could not be read right now.') };
  const nx = answer.grid?.nx, ny = answer.grid?.ny, h = floatsOf(answer.h);
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || h.length !== nx * ny) return { failed: 'The land heights came back in a shape that could not be used.' };
  if (Math.abs(answer.grid.w - request.width) > 1 || Math.abs(answer.grid.d - request.depth) > 1) return { failed: 'The land heights were for another piece of land.' };
  return {
    nx, ny, width: answer.grid.w, depth: answer.grid.d, h, source: answer.source, name: answer.name, res_m: answer.res_m, native_m: answer.native_m, kind: answer.kind,
    credit: answer.credit, licence: answer.licence, data_date: answer.data_date, cover: answer.cover, filled: answer.filled ?? null,
  };
}
// request: {lat, lon, width, depth, n} from the scene; fetchImpl is replaceable for tests.
export async function loadHeights(request, { fetchImpl = globalThis.fetch, base = '' } = {}) {
  const q = new URLSearchParams({ lat: request.lat, lon: request.lon, w: request.width, d: request.depth, nx: request.n, ny: request.n });
  try {
    const res = await fetchImpl(apiUrl(`/api/dem?${q}`, base));
    const answer = await res.json().catch(() => null);
    return decodeHeights(answer, request);
  } catch {
    return { failed: 'The land heights could not be reached right now.' };
  }
}
// The words: where the heights come from, how fine they are, and what they include.
export function sourceWords(g) {
  const cell = g.res_m ? `one every ${g.res_m >= 10 ? Math.round(g.res_m) : g.res_m.toFixed(1)} m` : 'cell size not stated';
  const what = g.kind === 'DSM' ? 'The map includes the tops of trees and buildings.' : 'Bare ground: trees and buildings are not in it.';
  return `${g.name}, ${cell}. ${what}`;
}
