// The "Weak spots in this field" card of This field, and the squares and numbered pins on the board map. Nothing is asked until the farmer presses "Find weak spots":
// the first look reads two summers of satellite pictures (about a minute and a half), so the card says so at once; the answer is kept, so a second look is instant.
// Pure words: weakModel(), weakSpotsHTML(). Page parts: loadWeakSpots() (the ask and its keeping) and drawWeakSpots() (a Leaflet layer). Checked by scripts/test_weakspots.mjs and scripts/e2e_farm.mjs (group weak).
import { esc } from './words.js';
import { greenSpots, pins, classify } from './weakspots.js';
import { apiUrl } from './api.js';

export const LINK = ['NASA\'s page about the HLS pictures', 'https://hls.gsfc.nasa.gov/'];
export const STATE_WORDS = Object.freeze({
  idle: ['We can look for parts of this field that stay less green in satellite pictures.', 'The first look takes about a minute and a half.'],
  reading: ['Reading two summers of satellite pictures of this field. The first time takes about a minute and a half.'],
  toosmall: ['This field is too small for 30 m squares.'],
  toobig: ['This field is too big for one look (over 2 km across). Split it to look for weak spots.'],
  nologin: ['Satellite pictures could not be read: the NASA login is not set up on this computer.'],
  down: ['The satellite pictures could not be read just now. Try again later.'],
  estimated: ['Draw the field\'s edges first. Weak spots need the real outline.'],
});
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// state: 'idle' | 'reading' | 'ok' | 'estimated' | 'toosmall' | 'toobig' | 'nologin' | 'down'; answer: the lookup's answer when state is 'ok' (or a failed one, which is classified).
export function weakModel({ state, answer = null }) {
  if (state !== 'ok') return { state, lines: STATE_WORDS[state] || STATE_WORDS.down, pins: [], more: [] };
  if (!answer?.ok) { const s = classify(answer); return { state: s, lines: STATE_WORDS[s], pins: [], more: [] }; }
  const green = greenSpots(answer);
  if (!green.ok) {
    const lines = green.state === 'nopass' ? [`Too few clear pictures (${green.count}) to look for less-green places. Clouds hid the ground.`] : STATE_WORDS[green.state] || STATE_WORDS.down;
    return { state: green.state, lines, pins: [], more: [] };
  }
  const found = pins(green), n = green.passes.length;
  const more = [
    'Every field has a less green part. This shows where it stays, not why.',
    `What we counted: each square is 30 m. In each clear picture we took the fifth of the field that was least green. A weak spot is a square in that fifth in at least 2 of every 3 clear pictures, and in 5 or more.`,
    'Why it can be: less green can be wet ground, thin soil, packed soil, pests, a different seed or a headland. A picture cannot say which.',
    ...green.passes.map(p => `${p.date} · ${p.sensor}`),
    `The pictures: NASA HLS, 30 m squares, ${n} clear ${n === 1 ? 'picture' : 'pictures'} in the summers of ${[...new Set(green.passes.map(p => p.date.slice(0, 4)))].join(' and ')}.`,
  ];
  if (!found.length) return { state: 'none', lines: [`No place stayed less green on ${plural(n, 'clear picture', 'clear pictures')}.`], pins: [], more, green };
  const said = found.map((p, k) => k ? `spot ${p.n} on ${p.weak} of ${p.of}` : `Spot ${p.n} stayed less green than the rest on ${p.weak} of ${p.of} clear pictures`).join(', ');
  return { state: 'found', lines: [`We found ${plural(found.length, 'weak spot', 'weak spots')} in this field.`, `${said}.`, 'Walk there and look: it can be wet ground, thin soil, compaction or a headland.'], pins: found, more, green };
}
// The card: a button before the first look, one waiting line while reading, then the words; the details are under Show more with one source link.
export function weakSpotsHTML(model) {
  const p = model.lines.map(l => `<p>${esc(l)}</p>`).join('');
  const idle = model.state === 'idle' ? `<p><button type="button" class="btn lg primary" data-act="weak">Find weak spots</button></p>` : '';
  const again = ['down', 'nologin'].includes(model.state) ? `<p><button type="button" class="btn lg" data-act="weak">Try again</button></p>` : '';
  const more = model.more.length ? `<details class="fw-fold"><summary>Show more</summary>${model.more.map(l => `<p class="cap">${esc(l)}</p>`).join('')}<p class="cap"><a href="${esc(LINK[1])}" target="_blank" rel="noopener">${esc(LINK[0])}</a></p></details>` : '';
  return `<div class="fw-weakbody" data-state="${esc(model.state)}"${model.state === 'reading' ? ' role="status"' : ''}>${p}${idle}${again}${more}</div>`;
}

// The ask: only when the farmer presses the button. ring: [[lat, lon], ...]. One ask per field and outline; a failed ask is not kept.
const kept = new Map();
export function loadWeakSpots({ lat, lon, ring, fetchFn = globalThis.fetch?.bind(globalThis) }) {
  const corners = ring.map(([a, o]) => `${o.toFixed(6)},${a.toFixed(6)}`).join(';'), key = `${lat.toFixed(5)},${lon.toFixed(5)}|${corners}`;
  if (!kept.has(key)) {
    const q = new URLSearchParams({ lat: lat.toFixed(6), lon: lon.toFixed(6), ring: corners });
    kept.set(key, (async () => { try { const r = await fetchFn(apiUrl(`/api/hlsbox?${q}`)); return await r.json(); } catch { return { ok: false, reason: 'The satellite pictures did not answer' }; } })().then(a => { if (!a?.ok) kept.delete(key); return a; }));
  }
  return kept.get(key);
}
export const hasKept = ({ lat, lon, ring }) => kept.has(`${lat.toFixed(5)},${lon.toFixed(5)}|${ring.map(([a, o]) => `${o.toFixed(6)},${a.toFixed(6)}`).join(';')}`);
export const forgetWeakSpots = () => kept.clear();

// The squares of the spots and a numbered pin on each, on the board map; "layer" is a Leaflet layer group of the page. Returns what it added (a layer group).
export function drawWeakSpots(L, model) {
  if (!model?.pins?.length) return null;
  const group = L.layerGroup();
  for (const p of model.pins) {
    for (const c of p.cells) L.polygon(c.corners, { color: '#7a3e00', weight: 1, fillColor: '#ffb703', fillOpacity: .45, interactive: false, className: 'fw-weaksq' }).addTo(group);
    const tip = `Spot ${p.n} · less green · ${p.weak} of ${p.of} clear pictures · about ${p.ha} ha`;
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'fw-weakpin', html: `<button type="button" class="fw-weakbtn" aria-label="${esc(tip)}"><b aria-hidden="true">${p.n}</b></button>`, iconSize: [44, 44], iconAnchor: [22, 22] }), keyboard: false }).bindTooltip(tip, { direction: 'top' }).addTo(group);
  }
  return group;
}
