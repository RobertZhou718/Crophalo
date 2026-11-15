// The land details of the 3D view, from the server to the layers: asks the OpenStreetMap lookups once for each block of land (the answers are kept for a day on the device and the server keeps them too),
// checks that an answer is about the land that was asked, and turns the switches that are on into layers. It runs in the 3D worker (or on the page where there is none); a failure is an answer too.
// Fetch and the cache are handed in, so a test needs no server. Checked by scripts/test_land3d_load.mjs and scripts/e2e_land3d.mjs.
import { SWITCHES, sourcesNeeded, layerOf, osmCredit } from './land3d-data.js';
import { frameAt } from './farm3d-data.js';
import { plainReason } from './satellites2-data.js';

export const KEEP_MS = 24 * 3600e3;
const WHERE = { osm: 'api/osm', osmx: 'api/osmextra' };
const DOWN = 'OpenStreetMap could not be read right now (its map service did not answer); try again in a few minutes';
const BAD = 'OpenStreetMap sent an answer that could not be used';

// The block the scene stands on, as the lookups key it: the place to 4 decimals, the sides in whole metres.
export const blockOf = slab => ({ lat: Math.round(slab.lat * 1e4) / 1e4, lon: Math.round(slab.lon * 1e4) / 1e4, w: Math.round(slab.width), d: Math.round(slab.depth) });
export const keyOf = (kind, b) => `${kind}:${b.lat}:${b.lon}:${b.w}:${b.d}`;

// An answer of the lookup -> what the layers read, or { failed: sentence }. It must be ok, in the shape of its kind, and about this block.
export function decodeOsm(kind, answer, block) {
  if (!answer || typeof answer !== 'object') return { failed: DOWN };
  if (answer.ok !== true) return { failed: plainReason(answer.reason, DOWN) };
  const lists = kind === 'osm' ? ['buildings', 'roads', 'water', 'trees'] : ['fences', 'gates', 'power', 'poles', 'things'];
  if (!lists.every(k => Array.isArray(answer[k]))) return { failed: BAD };
  const at = answer.box;
  if (!at || Math.abs(at.lat - block.lat) > 1e-4 || Math.abs(at.lon - block.lon) > 1e-4 || Math.abs(at.w - block.w) > 1 || Math.abs(at.d - block.d) > 1) return { failed: 'OpenStreetMap answered for another piece of land' };
  return answer;
}

// One lookup for one block. cache: { get(key) -> { at, answer } | null, put(key, { at, answer }) } (the device's own, optional). now() is the clock.
// The device's cache is a nicety: a cache that never answers (a worker with no storage of its own) must never hold a lookup back
const soon = (promise, ms = 1500) => Promise.race([promise, new Promise(done => setTimeout(() => done(null), ms))]);
export async function loadOsm(kind, block, { fetchImpl = globalThis.fetch, base = '', cache = null, now = Date.now, signal } = {}) {
  const key = keyOf(kind, block);
  try { const held = await soon(cache?.get(key)); if (held && now() - held.at < KEEP_MS && held.answer?.ok === true) { const kept = decodeOsm(kind, held.answer, block); if (!kept.failed) return kept; } } catch { /* the cache is a nicety */ }
  const q = new URLSearchParams({ lat: block.lat, lon: block.lon, w: block.w, d: block.d });
  let answer = null;
  try { const res = await fetchImpl(`${base}${WHERE[kind]}?${q}`, { signal }); answer = await res.json().catch(() => null); } catch { return { failed: DOWN }; }
  const got = decodeOsm(kind, answer, block);
  if (!got.failed) { try { await soon(cache?.put(key, { at: now(), answer })); } catch { /* a full device keeps nothing */ } }
  return got;
}
// The device's cache of answers, in the Cache API where there is one (a worker has it too).
export function deviceCache(name = 'crophalo-land-v1') {
  if (typeof caches === 'undefined') return null;
  const url = key => `https://crophalo.local/${encodeURIComponent(key)}`;
  return {
    async get(key) { const c = await caches.open(name), r = await c.match(url(key)); if (!r) return null; try { return await r.json(); } catch { return null; } },
    async put(key, value) { const c = await caches.open(name); await c.put(url(key), new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })); },
  };
}

// ---- the controller: one per view. It asks for what the switches need (once for each block), and answers the layers for a scene.
// say(): told when a source arrives, so the view draws again. The sources a copy has no lookup for are said plainly, never filled in.
const NOT_CONNECTED = { soil: 'The soil map is not connected in this copy yet', cover: 'The land-cover map is not connected in this copy yet' };
export function createLand({ fetchImpl, base = '', cache = deviceCache(), now = Date.now, say = () => {} } = {}) {
  let block = null, got = {}, asked = new Set(), closed = false;
  const need = choice => sourcesNeeded(choice);
  function want(choice, slab) {
    const b = blockOf(slab);
    if (!block || keyOf('osm', block) !== keyOf('osm', b)) { block = b; got = {}; asked = new Set(); }   // another piece of land: nothing is carried over
    for (const kind of need(choice)) {
      if (kind !== 'osm' && kind !== 'osmx') continue;
      if (asked.has(kind)) continue;
      asked.add(kind);
      loadOsm(kind, b, { fetchImpl, base, cache, now }).then(answer => { if (closed || !block || keyOf('osm', block) !== keyOf('osm', b)) return; got[kind] = answer; say(kind); }, () => { got[kind] = { failed: DOWN }; say(kind); });
    }
  }
  // the layers of the switches that are on, for this scene (sc: groundScene's answer)
  function layers(choice, sc, phone) {
    const frame = frameAt(sc.slab.lat, sc.slab.lon), fields = [{ id: sc.field.id, name: sc.field.name, polygon: sc.field.polygon }];
    const ctx = { span: sc.slab.span, frame, fields, phone, chosen: fields[0], heights: sc.heights.model ?? undefined, osm: got.osm, osmx: got.osmx, soil: { failed: NOT_CONNECTED.soil }, cover: { failed: NOT_CONNECTED.cover } };
    if (!sc.heights.model && sc.heights.status === 'missing') ctx.heights = undefined;
    return SWITCHES.filter(s => choice?.[s.id] === true).map(s => layerOf(s.id, ctx));
  }
  return { want, layers, credit: list => osmCredit(list), state: () => ({ ...got }), dispose() { closed = true; } };
}
// A key for what a scene's details look like, so a picture is drawn again when a switch or a source changes and not otherwise.
export const landKey = (choice, got) => JSON.stringify([Object.keys(choice || {}).filter(k => choice[k] === true).sort(), ['osm', 'osmx'].map(k => got?.[k] === undefined ? 0 : got[k].failed ? 'x' : (got[k].data_date || 1))]);

// The land's details for a scene, put on it: the switches that are on, asked of the sources once for each block of land, as layers (sc.land) and a key for the picture (sc.landKey).
export function attachLand(land, sc, input) {
  const choice = input.land?.choice || {};
  land.want(choice, sc.slab);
  sc.land = { choice, layers: land.layers(choice, sc, !!input.phone) }; sc.landKey = landKey(choice, land.state());
  return sc;
}
// What the page is told once a picture with its details is up: each layer's state and words, how many were drawn of how many were mapped, and the credit OpenStreetMap asks for (only while something of it is drawn).
export function landMessage(sc, report, land) {
  const rep = report || [], drawn = sc.land.layers.filter(l => (rep.find(r => r.id === l.id)?.drawn || 0) > 0);
  return { type: 'land', layers: sc.land.layers.map(l => ({ id: l.id, state: l.state, words: l.words })), report: rep, credit: land.credit(drawn) };
}
