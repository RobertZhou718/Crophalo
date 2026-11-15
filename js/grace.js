// Crophalo's Regional water storage on the map, the facts and the pure parts: NASA GRACE and GRACE-FO (JPL's mascon solution) as one region about 300 km wide round your place, from Crophalo's own server (/api/gracecell);
// the answer rebuilt from known parts only, the classes and their colours, where a value stands on the colour bar, the region's disc in map pixels, the months a time-lapse plays and every sentence.
// Pure: nothing here asks the network or reads the page. Checked by scripts/test_grace.mjs (answers in the lookup's own shape, a month with no measurement, open water, hostile input, the colours for every kind of colour sight).
import { PLAY } from './layeranim.js';
import { plainReason } from './satellites2-data.js';
import { apiUrl } from './api.js';

export const GRACE = Object.freeze({ id: 'grace', kind: 'region', name: 'Regional water storage', plain: 'Water stored across a wide region.', sub: 'GRACE / GRACE-FO 2002 to now · very coarse, about 300 km',
  here: 'Stored water in this region', areaKm: 300, opacity: 60, step: 1 });
export const GRACE_URL = (lat, lon) => apiUrl(`/api/gracecell?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}`);
export const GRACE_DOI = '10.5067/TEMSC-3JC634';
export const GRACE_CREDIT = 'Credit: NASA JPL GRACE and GRACE-FO mascons, release RL06.3Mv04 with the CRI filter, from NASA PO.DAAC (DOI 10.5067/TEMSC-3JC634). NASA open data.';
export const CELL_DEG = 0.5;   // the grid the server reads the answer on: one value for each half-degree square, each square inside one JPL region

// The classes: centimetres of water against the 2004 to 2009 average, in symmetric steps at 5, 10 and 20 cm. Crophalo's own colours: brown for less water, a light neutral for about usual, teal for more.
// Each side gets darker step by step, at least 8 L* apart for normal, protan, deutan and tritan sight, and the two sides stay apart; none is the page's blue (scripts/test_grace.mjs).
export const GRACE_CLASSES = Object.freeze([
  { lo: -Infinity, hi: -20, colour: '#975126', words: 'much less water than usual', range: '20 cm or more below' },
  { lo: -20, hi: -10, colour: '#bf7c48', words: 'less water than usual', range: '10 to 20 cm below' },
  { lo: -10, hi: -5, colour: '#dcad7b', words: 'a little less water than usual', range: '5 to 10 cm below' },
  { lo: -5, hi: 5, colour: '#e4d8c9', words: 'about usual', range: 'within 5 cm' },
  { lo: 5, hi: 10, colour: '#73c3c1', words: 'a little more water than usual', range: '5 to 10 cm above' },
  { lo: 10, hi: 20, colour: '#339a98', words: 'more water than usual', range: '10 to 20 cm above' },
  { lo: 20, hi: Infinity, colour: '#007072', words: 'much more water than usual', range: '20 cm or more above' },
].map(Object.freeze));
export const GAP_COLOUR = '#8d8d8d';   // a month the satellites did not measure: grey and hatched, never a colour of the scale
export const classOf = cm => (Number.isFinite(cm) ? GRACE_CLASSES.find(k => cm >= k.lo && cm < k.hi) ?? GRACE_CLASSES.at(-1) : null);
// The bar: one equal part for each class, hard edges between them.
export const barGradient = () => { const n = GRACE_CLASSES.length, p = i => `${Math.round((i / n) * 10000) / 100}%`; return `linear-gradient(90deg, ${GRACE_CLASSES.map((k, i) => `${k.colour} ${p(i)} ${p(i + 1)}`).join(', ')})`; };
// Where a value stands on the bar (0 to 1): straight within its class; the two open ends run 20 cm more each, then stop at the edge.
export function barAt(cm) {
  if (!Number.isFinite(cm)) return null;
  const n = GRACE_CLASSES.length, i = GRACE_CLASSES.indexOf(classOf(cm)), k = GRACE_CLASSES[i];
  const lo = Number.isFinite(k.lo) ? k.lo : k.hi - 20, hi = Number.isFinite(k.hi) ? k.hi : k.lo + 20, f = Math.min(1, Math.max(0, (cm - lo) / (hi - lo)));
  return Math.round(((i + f) / n) * 1e4) / 1e4;
}

// ---- months
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const isMonth = m => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export const monthWords = m => (isMonth(m) ? `${MON[+m.slice(5) - 1]} ${m.slice(0, 4)}` : '');
export const monthShort = m => (isMonth(m) ? `${MON[+m.slice(5) - 1].slice(0, 3)} ${m.slice(0, 4)}` : '');
const index = m => +m.slice(0, 4) * 12 + (+m.slice(5) - 1);

// ---- the server's answer, rebuilt from known parts. A month with no value stays empty (null), never 0 and never filled; a reason is plain words of 240 characters at most.
const fin = v => typeof v === 'number' && Number.isFinite(v);
const plain = (v, n = 240) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
export function cleanGrace(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true || !Array.isArray(raw.months)) return { ok: false, reason: plain(raw?.reason), final: raw?.final === true };
  const seen = new Map();
  for (const row of raw.months.slice(0, 600)) {
    if (!Array.isArray(row) || !isMonth(row[0]) || seen.has(row[0])) continue;
    const cm = fin(row[1]) && Math.abs(row[1]) < 500 ? row[1] : null, unc = cm !== null && fin(row[2]) && row[2] >= 0 && row[2] < 500 ? row[2] : null;
    seen.set(row[0], { month: row[0], cm, unc });
  }
  const months = [...seen.values()].sort((a, b) => index(a.month) - index(b.month));
  while (months.length && months.at(-1).cm === null) months.pop();   // the record ends on the newest month NASA measured
  if (!months.length) return { ok: false, reason: '', final: true };
  const cell = raw.cell && typeof raw.cell === 'object' ? raw.cell : {}, spot = raw.spot && typeof raw.spot === 'object' ? raw.spot : {};
  const lat = fin(cell.lat) && Math.abs(cell.lat) <= 90 ? cell.lat : fin(spot.lat) && Math.abs(spot.lat) <= 90 ? spot.lat : null;
  const lon = fin(cell.lon) && Math.abs(cell.lon) <= 180 ? cell.lon : fin(spot.lon) && Math.abs(spot.lon) <= 180 ? spot.lon : null;
  if (lat === null || lon === null) return { ok: false, reason: '', final: false };
  const trend = fin(raw.trend_cm_per_year) && Math.abs(raw.trend_cm_per_year) < 50 && isMonth(raw.trend_from) && isMonth(raw.trend_to) ? { cmPerYear: raw.trend_cm_per_year, from: raw.trend_from, to: raw.trend_to } : null;
  return { ok: true, months, newest: months.at(-1).month, centre: { lat, lon }, areaKm: fin(raw.area_km) && raw.area_km >= 50 && raw.area_km <= 1000 ? raw.area_km : GRACE.areaKm, trend,
    fetched: typeof raw.fetched === 'string' && !Number.isNaN(Date.parse(raw.fetched)) ? raw.fetched : '' };
}
// The half-degree square a place falls in, as the server reads it: the same answer for every pin inside it.
export const cellKey = (lat, lon) => `${Math.floor(Math.min(lat, 90 - 1e-9) / CELL_DEG + 1e-9)}:${Math.floor(Math.min(lon, 180 - 1e-9) / CELL_DEG + 1e-9)}`;
export const monthOf = (g, month) => g?.months?.find(m => m.month === month) ?? null;
export function stepMonth(g, month, dir) {   // the month before or after in the record (an empty month included: it is shown as empty), or null at either end
  const i = g?.months?.findIndex(m => m.month === month) ?? -1;
  const to = i < 0 ? null : g.months[i + dir];
  return to ? to.month : null;
}
// The months a time-lapse plays, oldest first, ending on the newest: a month record has fewer than six pictures in 30 days, so it plays its last eight months, an empty one included.
export const graceFrames = g => (g?.ok ? g.months.slice(-PLAY.maxFrames).map(m => m.month) : []);

// ---- the region on the map: a disc about 300 km across round the centre of the square read (NASA's own region edges are not given, so none is drawn)
const R_EARTH = 6378137;
export function discKm(g) { return g?.areaKm ?? GRACE.areaKm; }
export function discBounds(g) {   // [[south, west], [north, east]] round the disc, for "Show the whole region"
  const r = (discKm(g) * 1000) / 2, dLat = (r / R_EARTH) * (180 / Math.PI), dLon = dLat / Math.max(0.05, Math.cos((g.centre.lat * Math.PI) / 180));
  return [[Math.max(-85, g.centre.lat - dLat), g.centre.lon - dLon], [Math.min(85, g.centre.lat + dLat), g.centre.lon + dLon]];
}
// The disc in the pixels of one map tile: { x, y, r } with x, y from the tile's top left corner, or null when the disc does not reach the tile. Web Mercator, 256 px tiles.
export function discInTile(g, z, tx, ty) {
  const n = 256 * 2 ** z, lat = Math.max(-85.0511, Math.min(85.0511, g.centre.lat)), la = (lat * Math.PI) / 180;
  const cx = ((g.centre.lon + 180) / 360) * n, cy = ((1 - Math.asinh(Math.tan(la)) / Math.PI) / 2) * n;
  const metresPerPx = (2 * Math.PI * R_EARTH * Math.cos(la)) / n, r = (discKm(g) * 1000) / 2 / metresPerPx;
  const x = cx - tx * 256, y = cy - ty * 256;
  return x + r < 0 || x - r > 256 || y + r < 0 || y - r > 256 ? null : { x, y, r };
}
// True when every corner of the view lies inside the disc: the farmer's whole view is one value.
export function viewInside(g, view) {
  const r = (discKm(g) * 1000) / 2, near = (lat, lon) => { const p1 = (g.centre.lat * Math.PI) / 180, p2 = (lat * Math.PI) / 180, dp = p2 - p1, dl = ((lon - g.centre.lon) * Math.PI) / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h))) <= r * 0.85; };   // 0.85: the soft edge is not counted
  return [[view.s, view.w], [view.s, view.e], [view.n, view.w], [view.n, view.e]].every(([a, b]) => near(a, b));
}

// ---- words
const cmWords = v => `${Math.abs(Math.round(v))} cm`;
export const GRACE_WORDS = Object.freeze({
  coarse: 'Very coarse: one value for a whole region, not your field.',
  what: 'All the water stored in the ground, the soil, the snow, the lakes and the rivers together, as centimetres of water against its 2004 to 2009 average.',
  inside: 'Your whole view lies inside one GRACE region.',
  disc: 'The soft disc shows the size of one region, about 300 km across. NASA’s own edges of the region are not drawn.',
  nopin: 'Draw your field to see the stored water of its region.',
  asking: 'Asking NASA’s GRACE-FO record for the region of your field… The first answer can take half a minute.',
  down: 'Not available right now: Crophalo’s server did not answer for NASA’s GRACE-FO record. Try again later.',
  noroute: 'This copy of Crophalo’s server has no water-storage lookup, so nothing is drawn.',
  busy: 'Crophalo’s server is busy. Try again in a minute.',
  final: 'NASA has no GRACE-FO value for this place, so nothing is drawn.',
  whole: 'Show the whole region',
  play: n => `Play the last ${n} months`,
  gapKey: 'no measurement that month',
});
// "Stored water in this region: 4 cm less than the 2004–2009 average (± 8 cm)", then the month in short, or a month with no measurement said plainly. Never more exact than the measurement: whole centimetres.
export function hereWords(g, month) {
  const m = monthOf(g, month);
  if (!m) return 'No value for your field: no measurement that month.';
  if (m.cm === null) return `${GRACE.here}: no measurement for ${monthWords(m.month)} (the satellites did not measure it; it is left empty, never filled in)`;
  const v = m.cm, same = Math.round(v) === 0, within = m.unc !== null && Math.abs(v) < m.unc;
  const size = same ? 'the same as the 2004–2009 average' : `${cmWords(v)} ${v < 0 ? 'less' : 'more'} than the 2004–2009 average`;
  return `${GRACE.here}: ${size}${m.unc !== null ? ` (± ${Math.max(1, Math.round(m.unc))} cm)` : ''}${within ? ', within the measurement’s uncertainty, so about usual' : ''} · ${monthShort(m.month)}`;
}
export const classWords = (g, month) => { const m = monthOf(g, month); return !m ? '' : m.cm === null ? GRACE_WORDS.gapKey : classOf(m.cm).words; };
export function trendWords(g) {
  if (!g?.trend) return 'No trend is given: fewer than five years of months were read.';
  const t = g.trend.cmPerYear, r = Math.round(t * 10) / 10;
  return `Trend from ${monthWords(g.trend.from)} to ${monthWords(g.trend.to)}: ${r === 0 ? 'about flat' : `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)} cm a year`}, a straight line through every month NASA measured.`;
}
export const monthLine = (g, month) => (month === g?.newest ? `${monthWords(month)}, the newest month NASA has (it comes about two months after the month ends)` : monthWords(month));
// What the server said, in words for the legend: its own plain reason when it gave one, else ours.
export function whyWords(answer, status = 200) {
  if (status === 404) return GRACE_WORDS.noroute;
  if (status === 429) return GRACE_WORDS.busy;
  const said = plainReason(answer?.reason, '');
  if (said) return /[.!?]$/.test(said) ? said : `${said}.`;
  return answer?.final ? GRACE_WORDS.final : GRACE_WORDS.down;
}
