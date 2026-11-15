// "What this field grew": the national crop maps (USDA for the United States, Agriculture and Agri-Food Canada for Canada), year by year at the field's own points, in a Land history card.
// Pure: turnOf() finds the turn (the crops that repeat), afterCorn() the share of what the fields around grew after corn, grewHTML() the card. loadGrew() asks the server's /api/crophist once per field and keeps the answer.
// Checked by scripts/test_grew.mjs on the answers recorded from the live services on 15 November 2026 (scripts/fixtures/crophist-mead.json and crophist-oxford.json).
import { esc } from './words.js';
import { cropName, cropColor } from './crops.js';

export const LINKS = Object.freeze({
  US: ['USDA crop map, about its accuracy', 'https://www.nass.usda.gov/Research_and_Science/Cropland/SARS1a.php'],
  CA: ['Canada\'s crop map, about its data', 'https://open.canada.ca/data/en/dataset/ba2645d5-4458-414d-b196-6303ac06c1c9'],
});
const lower = id => cropName(id, true).toLowerCase();
const list = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

// The turn: the shortest cycle length L from 1 to 4 such that each year's crop equals the crop L years before it, for at least 2 x L years and at least 4 years in a row from the newest year back,
// with no mixed year inside. Returns { crops (in the order they follow each other, the newest year's first), since, L, years } or null.
export function turnOf(answer) {
  const years = (Array.isArray(answer?.field) ? answer.field : []).filter(f => Number.isFinite(f?.year)).sort((a, b) => b.year - a.year);
  for (let L = 1; L <= 4; L++) {
    let i = 0;
    while (i + L < years.length && years[i].crop && years[i].crop === years[i + L].crop && years[i].year - years[i + L].year === L) i++;
    const covered = i + L, run = years.slice(0, covered);
    if (covered >= Math.max(2 * L, 4) && run.every(y => y.crop) && run.every((y, k) => !k || run[k - 1].year - y.year === 1)) {
      const crops = [years[0].crop, ...Array.from({ length: L - 1 }, (_, k) => years[L - 1 - k].crop)];
      return { crops, since: run.at(-1).year, L, years: covered };
    }
  }
  return null;
}
// What the fields around grew the year after corn: only with 50 fields or more; shares in tenths, the biggest first, corn staying corn named apart. Returns { n, next: { crop, tenths }, stayed } or null.
export function afterCorn(near) {
  const a = near?.after?.corn; if (!a || !(a.n >= 50)) return null;
  const crops = Object.entries(a).filter(([k, v]) => k !== 'n' && k !== 'other' && k !== 'corn' && v > 0).sort((x, y) => y[1] - x[1]);
  const tenths = v => Math.round(10 * v / a.n), next = crops[0] ? { crop: crops[0][0], tenths: tenths(crops[0][1]) } : null, stayed = tenths(a.corn || 0);
  return { n: a.n, next: next && next.tenths ? next : null, stayed };
}
export const turnWords = turn => turn.L === 1 ? `${lower(turn.crops[0])} every year` : turn.L === 2 ? `${list(turn.crops.map(lower))} in turn` : `${list(turn.crops.map(lower))} in a cycle of ${turn.L} years`;
const neighbourWords = near => {
  const times = (t, word) => `${word} about ${t} ${t === 1 ? 'time' : 'times'} in 10`, a = near.next ? times(near.next.tenths, `${lower(near.next.crop)} followed corn`) : '', b = near.stayed ? times(near.stayed, 'corn followed corn') : '';
  return a || b ? `On the cropland within 3 km, ${[a, b].filter(Boolean).join(', and ')}.` : 'On the cropland within 3 km, many different crops followed corn.';
};
const recent = answer => (answer.field || []).slice(0, 3).map(f => `${f.year} ${f.crop ? lower(f.crop) : f.mixed ? 'mixed' : (f.name || 'another crop').toLowerCase()}`);

// The words of the card, from the lookup's answer. state: 'reading' | 'ok' | 'outside' | 'down' | 'small'. Never "not read yet".
export function grewModel({ state, answer = null, country = 'US', pinOnly = false }) {
  if (state === 'reading') return { state, lines: ['Reading this field\'s crop map, year by year…'], strip: [], more: [] };
  if (state === 'outside') return { state, lines: ['Crop maps by year are read for Canada and the United States only.'], strip: [], more: [] };
  if (state !== 'ok' || !answer?.ok) {
    const small = /too small/i.test(answer?.reason || '') || state === 'small';
    return { state: small ? 'small' : 'down', lines: [small ? 'This field is too small to read by year on the crop map.' : 'The crop map did not answer. Try again later.'], strip: [], more: [] };
  }
  const turn = turnOf(answer), near = afterCorn(answer.near), where = pinOnly || answer.where === 'pin' ? 'around your pin' : 'on this field';
  const lines = [turn ? `The crop map shows ${turnWords(turn)} ${pinOnly ? 'around your pin' : 'here'} since ${turn.since}.` : `The crop map shows: ${recent(answer).join(', ')}.`];
  if (answer.near) lines.push(near ? neighbourWords(near) : 'Too few map points around you to count.');
  if (turn && turn.crops.includes('corn')) lines.push('Rotation breaks some corn pests but not all, so ask your adviser which ones here.');
  lines.push(turn ? 'The map can be wrong for one field, so trust what you know.' : 'The map can be wrong for one field, so choose your crops from what you know.');
  const first = answer.years?.first, last = answer.years?.last, us = country === 'US';
  const more = [
    `How we read it: we look at up to ${answer.points || 9} points ${pinOnly ? 'around your pin' : 'inside your field'} for each year. A year counts when more than half of the points agree. `,
    ...(answer.near ? [`Around you: we count what followed corn in ${answer.near.years?.first ?? ''} to ${answer.near.years?.last ?? ''}, on about ${answer.near.grid_points || 900} map points 170 m apart within 3 km of the field. It counts map points, not farms, and never one named place.`] : []),
    us ? 'How good the map is: its makers say major crops are normally right 85 to 95 times in 100.' : 'How good the map is: it aims to be right at least 85 times in 100.',
    `The map: ${us ? 'USDA crop map' : 'Agriculture and Agri-Food Canada crop map'}, 30 m squares, ${first} to ${last}.`,
    ...(answer.not_read?.length ? [`${answer.not_read.map(y => `${y} not read`).join('. ')}.`] : []),
  ];
  const strip = [...answer.field].sort((a, b) => a.year - b.year).map(f => ({ year: f.year, crop: f.crop, word: f.crop ? cropName(f.crop, true) : f.mixed ? 'mixed' : (f.name || 'other'), color: f.crop ? cropColor(f.crop) : '', mixed: !f.crop }));
  return { state: 'ok', lines, strip, more, link: LINKS[us ? 'US' : 'CA'], where };
}
// The card for Land history (the title is the card's own; this is its body).
export function grewHTML(model) {
  const p = model.lines.map(l => `<p>${esc(l)}</p>`).join('');
  if (model.state !== 'ok') return `<div class="h-grew" data-state="${esc(model.state)}"${model.state === 'reading' ? ' role="status"' : ''}>${p}</div>`;
  const strip = `<ol class="h-years" aria-label="Crops by year">${model.strip.map(y => `<li class="h-year${y.mixed ? ' is-mixed' : ''}"${y.color ? ` style="--crop:${esc(y.color)}"` : ''}><b>${y.year}</b><span>${esc(y.word)}</span></li>`).join('')}</ol>`;
  return `<div class="h-grew" data-state="ok">${p}${strip}<details class="h-fold"><summary>Show more</summary>${model.more.map(l => `<p class="cap">${esc(l)}</p>`).join('')}<p class="cap"><a href="${esc(model.link[1])}" target="_blank" rel="noopener">${esc(model.link[0])}</a></p></details></div>`;
}

// The ask: once per field, kept for the visit. ring: [[lat, lon], ...] of a drawn outline, or none (a pin). Returns the answer object, or { ok: false, reason }.
const kept = new Map();
export function loadGrew({ lat, lon, country, ring = null, fetchFn = globalThis.fetch?.bind(globalThis) }) {
  const corners = Array.isArray(ring) && ring.length >= 3 ? ring.map(([a, o]) => `${o.toFixed(4)},${a.toFixed(4)}`).join(';') : '', key = `${country}|${lat.toFixed(4)},${lon.toFixed(4)}|${corners}`;
  if (!kept.has(key)) {
    const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), country, near: '1' }); if (corners) q.set('ring', corners);
    kept.set(key, (async () => { try { const r = await fetchFn(`/api/crophist?${q}`); return await r.json(); } catch { return { ok: false, reason: 'The crop map did not answer' }; } })().then(a => { if (!a?.ok) kept.delete(key); return a; }));
  }
  return kept.get(key);
}
export const forgetGrew = () => kept.clear();
