// Crophalo's "What this field grew" card on setup step 2: the national crop map (USDA for the United States, Agriculture and Agri-Food Canada for Canada) read year by year at the field's own points, said in one plain sentence,
// with one button, "Use this rotation", that fills the step. The rules of the turn are the ones My farm's history card uses (js/grew.js: turnOf), so one fact has one rule. Nothing is filled without the farmer's tap.
// Pure but for loadFieldYears(), which asks the server's /api/crophist once for a place with a country code US or CA. Checked by scripts/test_fieldyears.mjs on the answers recorded from the live services on 15 November 2026.
import { esc } from './words.js';
import { cropName, PRESETS } from './crops.js';
import { turnOf, turnWords, LINKS } from './grew.js';
import { apiUrl } from './api.js';

export const WORDS = Object.freeze({
  title: 'This field on the crop map', reading: 'Reading this field’s crop map, year by year…', wrong: 'It can be wrong for one field.',
  use: 'Use this rotation', done: names => `Your crops are set to ${names}. Change them below if you like.`, down: 'The crop map did not answer. Choose your crops below.',
  matches: 'It matches the rotation filled in.', small: 'This field is too small to read by year on the crop map. Choose your crops below.', more: 'Show more',
});
const low = id => { try { return cropName(id, true).toLowerCase(); } catch { return String(id); } };
const list = names => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
export const countryOk = cc => ['US', 'CA'].includes(String(cc ?? '').toUpperCase());

// The turn as the step's rotation, in the order the farmer will sow: a ready rotation that has the same crops in the same cycle, else the crops as a custom rotation. Never more than four years.
export function rotationFor(turn) {
  if (!turn?.crops?.length) return null;
  const seq = [...turn.crops].reverse();   // oldest to newest of the cycle: the next crop to sow is the first
  const same = slots => slots.length === seq.length && seq.some((_, k) => slots.every((c, i) => c === seq[(i + k) % seq.length]));
  const id = Object.keys(PRESETS).find(p => p !== 'custom' && same(PRESETS[p].slots));
  return id ? { preset: id, custom: [] } : { preset: 'custom', custom: seq.slice(0, 4) };
}
export const slotsOf = r => (r.preset === 'custom' ? r.custom : PRESETS[r.preset]?.slots ?? []);
// Do two rotations grow the same crops in the same cycle (a ready rotation and a custom one with the same slots count as the same)?
export function sameRotation(a, b) {
  const x = slotsOf(a), y = slotsOf(b);
  return x.length > 0 && x.length === y.length && x.some((_, k) => y.every((c, i) => c === x[(i + k) % x.length]));
}
export const roleWords = r => list(slotsOf(r).map(low)).replace(/ and ([^,]*)$/, ' then $1');

// The card's model: state 'reading' | 'ok' | 'down' | 'small', or null when nothing is shown (a demo field, a country without crop maps by year).
export function fieldYearsModel({ state, answer = null, country = '', used = false, filled = null }) {
  if (!countryOk(country)) return null;
  if (state === 'reading') return { state: 'reading', lines: [WORDS.reading] };
  if (state !== 'ok' || !answer?.ok) { const small = /too small/i.test(answer?.reason ?? ''); return { state: small ? 'small' : 'down', lines: [small ? WORDS.small : WORDS.down] }; }
  const turn = turnOf(answer), pin = answer.where === 'pin', us = String(country).toUpperCase() === 'US', first = answer.years?.first, last = answer.years?.last;
  const recent = (answer.field ?? []).slice(0, 3).map(f => `${f.year} ${f.crop ? low(f.crop) : 'mixed'}`);
  const more = [`Years read: ${first} to ${last}. We look at up to ${answer.points || 9} points ${pin ? 'around your pin' : 'inside your field'} for each year. A year counts when more than half of the points agree.`,
    `${us ? 'USDA crop map' : 'Agriculture and Agri-Food Canada crop map'}, 30 m squares, ${first} to ${last}.`, ...(answer.not_read?.length ? [`${answer.not_read.map(y => `${y} not read`).join('. ')}.`] : [])];
  const link = LINKS[us ? 'US' : 'CA'];
  if (!turn) return { state: 'ok', lines: [`The crop map shows: ${recent.join(', ')}. Choose your crops below.`], more, link, rotation: null };
  const rotation = rotationFor(turn), matches = !!filled && !!rotation && sameRotation(rotation, filled);
  const shows = `The crop map shows ${turnWords(turn)} ${pin ? 'around your pin' : 'on this field'} since ${turn.since}.`;
  return { state: 'ok', lines: used ? [WORDS.done(roleWords(rotation))] : matches ? [shows, WORDS.matches] : [shows, WORDS.wrong], more, link, rotation: matches ? null : rotation, used, matches };
}
export function fieldYearsHTML(model) {
  if (!model) return '';
  const p = model.lines.map(l => `<p${model.state === 'reading' ? ' role="status" aria-live="polite"' : ''}>${esc(l)}</p>`).join('');
  const button = model.rotation && !model.used ? `<p><button type="button" class="btn" id="useFieldYears">${esc(WORDS.use)}</button></p>` : '';
  const more = model.more ? `<details class="fold-card" id="foldFieldYears"><summary><span class="t">${esc(WORDS.more)}</span></summary><div class="fold-b">${model.more.map(l => `<p class="cap">${esc(l)}</p>`).join('')}<p class="cap"><a class="link" href="${esc(model.link[1])}" target="_blank" rel="noopener noreferrer">${esc(model.link[0])}</a></p></div></details>` : '';
  return `<section class="fy-card card pad" id="fieldYears" aria-labelledby="fyTitle"><h2 class="sub" id="fyTitle">${esc(WORDS.title)}</h2>${p}${button}${more}</section>`;
}
// The ask: once for each place, kept for the visit. ring: [[lat, lon], ...] of a drawn outline, or none (a pin). Answers the lookup's object, or { ok: false, reason }.
const kept = new Map();
export function loadFieldYears({ lat, lon, country, ring = null, fetchFn = globalThis.fetch?.bind(globalThis) }) {
  const cc = String(country ?? '').toUpperCase();
  if (!countryOk(cc)) return Promise.resolve({ ok: false, reason: 'no crop map by year here' });
  const corners = Array.isArray(ring) && ring.length >= 3 ? ring.slice(0, 200).map(([a, o]) => `${o.toFixed(4)},${a.toFixed(4)}`).join(';') : '', key = `${cc}|${lat.toFixed(4)},${lon.toFixed(4)}|${corners}`;
  if (!kept.has(key)) {
    const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), country: cc, near: '0' }); if (corners) q.set('ring', corners);
    kept.set(key, (async () => { try { const r = await fetchFn(apiUrl(`/api/crophist?${q}`)); return await r.json(); } catch { return { ok: false, reason: 'The crop map did not answer' }; } })().then(a => { if (!a?.ok) kept.delete(key); return a; }));
  }
  return kept.get(key);
}
export const forgetFieldYears = () => kept.clear();
