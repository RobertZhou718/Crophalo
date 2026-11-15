// Crophalo's "Discuss this field": one page about one field for a farm adviser to read outside the app. The farmer edits every text, chooses the change to
// discuss, and copies or prints it. Crophalo sends nothing. Where the field is, the farmer's notes and the soil test are out unless ticked.
// Pure: discussModel(), discussText(), discussHTML(), liveLine(). copyText() needs the page's clipboard (or a selection).
// Checked by scripts/test_sharetext.mjs (the order of the text, the limits, what is left out, the one-page warning, a garden).
/*
 *
 * report (plain data): { name, place: { label, lat, lon, ha }, area, madeOn, garden, nowYears: ['Corn'], nowScore, farmerPick: index | null,
 * suggestion: { headline, years: [...], score, why, catch, gaps: [...] } | null, options: [{ headline, years, score, why, catch, gaps }], notes: [{ text, kind }], soilTestLines: [], sources: [{ name, who, url }] }
 */
import { esc } from './words.js';
import { orderedWarnings } from './sharetext.js';
import { outlineSVG } from './fieldcard.js';
import { position, longDay, isScore } from './sharetext.js';

export const BOXES = Object.freeze({ plan: { label: 'The plan', max: 2400 }, why: { label: 'Why, and the catch', max: 700 }, unknown: { label: 'Not known yet', max: 800 }, question: { label: 'My question', max: 400 } });
export const QUESTION_HINT = 'e.g. Is this change worth trying on this field next year?', LONG_LINES = 70, TIGHT_LINES = 56;
export const GARDEN_WORDS = 'A tree crop has no options to discuss. Use Print field card.';
const cut = (v, n) => String(v ?? '').slice(0, n);
export const yearLines = years => (Array.isArray(years) ? years : []).map((y, i) => `${i + 1}. ${y}`);

// The choices the page keeps: which change, three ticks, and the edits (a box left alone keeps its start text).
export const DEFAULT_CHOICE = Object.freeze({ change: 'suggestion', showWhere: false, notes: false, soilTest: false, edits: {} });
// The change to discuss as the select lists it: the suggestion, up to three options, and "No change"; the farmer's own pick in Options goes first.
export function changeChoices(r) {
  const out = [];
  if (r?.suggestion) out.push({ value: 'suggestion', label: `Our suggestion: ${r.suggestion.headline}` });
  const opts = Array.isArray(r?.options) ? r.options.map((o, i) => ({ o, i })) : [];
  const first = Number.isInteger(r?.farmerPick) ? opts.filter(x => x.i === r.farmerPick) : [];
  for (const { o, i } of [...first, ...opts.filter(x => !first.includes(x))].slice(0, 3)) out.push({ value: `option:${i}`, label: `Option: ${o.headline}` });
  out.push({ value: 'none', label: 'No change: keep what I grow' });
  return out;
}
const chosen = (r, change) => change === 'none' ? null : change.startsWith('option:') ? r?.options?.[+change.slice(7)] ?? null : r?.suggestion ?? null;
// The page as data: each box with its start text, edits applied, and the lines it would run to.
export function discussModel(report, choice = DEFAULT_CHOICE) {
  const r = report ?? {}, c = { ...DEFAULT_CHOICE, ...choice, edits: { ...(choice?.edits ?? {}) } };
  if (r.garden) return { garden: true, text: GARDEN_WORDS };
  const pick = chosen(r, c.change), edits = c.edits;
  const now = ['Now, year by year:', ...yearLines(r.nowYears)].join('\n');
  const change = pick ? [`The change to discuss (${c.change === 'suggestion' ? 'Crophalo’s suggestion' : 'my own pick'}), year by year:`, ...yearLines(pick.years)].join('\n') : 'No change: I keep what I grow.';
  const start = {
    plan: [Array.isArray(r.strategies) && r.strategies.length > 1 ? `${r.strategies.length === 3 ? 'Three strategies compared' : 'Strategies compared'}: ${r.strategies.map(x => `${x.roleWords}: ${x.headline}${isScore(x.score) ? ` (${Math.round(x.score)})` : ''}`).join('; ')}.` : '', now, change, pick && isScore(pick.score) ? `Crophalo’s score: ${Math.round(pick.score)} out of 100${isScore(r.nowScore) ? ` (what I grow now: ${Math.round(r.nowScore)})` : ''}. A guide, not a chance of success.` : ''].filter(Boolean).join('\n\n'),
    why: pick ? [pick.why ? `Why: ${pick.why}` : '', pick.catch ? `The catch: ${pick.catch}` : ''].filter(Boolean).join('\n') : '',
    unknown: (Array.isArray(pick?.gaps) ? pick.gaps : []).slice(0, 2).map(g => `- ${g}`).join('\n'),
    question: '',
  };
  const boxes = Object.fromEntries(Object.entries(BOXES).map(([k, b]) => [k, cut(Object.hasOwn(edits, k) ? edits[k] : start[k], b.max)]));
  const where = c.showWhere ? [r.place?.label, position(r.place), Number.isFinite(+r.place?.ha) ? `${(+r.place.ha).toFixed(1)} ha` : ''].filter(Boolean).join(' · ') : (Number.isFinite(+r.place?.ha) ? `About ${(+r.place.ha).toFixed(1)} ha` : '');
  const notes = c.notes ? (Array.isArray(r.notes) ? r.notes : []).filter(n => n && n.kind !== 'notice' && String(n.text ?? '').trim()).slice(0, 5).map(n => cut(String(n.text).trim(), 300)) : [];
  const soil = c.soilTest && Array.isArray(r.soilTestLines) ? r.soilTestLines : [];
  const warnings = orderedWarnings(r.warnings);
  const lines = 4 + Object.values(boxes).reduce((a, t) => a + (t ? t.split('\n').length + 1 : 0), 0) + notes.length + soil.length + (r.sources?.length ?? 0);
  return { garden: false, name: r.name || 'My field', where, boxes, notes, soil, warnings, madeOn: r.madeOn, sources: r.sources ?? [], area: c.showWhere ? r.area : null, showWhere: c.showWhere, lines, tooLong: lines > LONG_LINES, tight: lines > TIGHT_LINES,
    choice: c, change: pick ? pick.headline : null };
}
export const TOO_LONG = 'This is longer than one page. Shorten a text to keep it on one page.';
// The line over the page: what the adviser gets and what is left out.
export function liveLine(choice = DEFAULT_CHOICE) {
  const left = [!choice.showWhere && 'where the field is', !choice.notes && 'your notes', !choice.soilTest && 'your soil test'].filter(Boolean), inn = [choice.showWhere && 'where the field is', choice.notes && 'your notes', choice.soilTest && 'your soil test'].filter(Boolean);
  const list = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`;
  return `Crophalo sends nothing: you copy or print this page. They get only that, with no link and no photos.${left.length ? ` Left out: ${list(left)}.` : ''}${inn.length ? ` In it: ${list(inn)}.` : ''}`;
}
// The words that are copied, in the order of the page.
export function discussText(m) {
  if (m.garden) return m.text;
  const L = [`Field brief: ${m.name}`, m.where, ''];
  for (const [k, b] of Object.entries(BOXES)) if (m.boxes[k]) L.push(`${b.label}:`, m.boxes[k], '');
  if (m.notes.length) L.push('My notes:', ...m.notes.map(n => `- ${n}`), '');
  if (m.soil.length) L.push('My soil test:', ...m.soil.map(n => `- ${n}`), '');
  L.push(`Prepared ${longDay(m.madeOn)} with Crophalo. A guide, not advice. You decide.`);
  if (m.sources.length) L.push('Sources:', ...m.sources.map((s, i) => `${i + 1}. ${[s.name, s.who, s.url].filter(Boolean).join('. ')}`));
  return L.filter((x, i, a) => !(x === '' && (a[i - 1] === '' || i === 0 || i === a.length - 1))).join('\n');
}
// The printed brief: the sections, the question boxed, two-column sources, tighter type above 56 lines.
export function discussHTML(m) {
  if (m.garden) return `<article class="discuss"><p>${esc(m.text)}</p></article>`;
  const sec = (k) => m.boxes[k] ? `<section class="ds-${k}${k === 'question' ? ' ds-boxed' : ''}"><h3>${esc(BOXES[k].label)}</h3>${m.boxes[k].split('\n').map(l => `<p>${esc(l)}</p>`).join('')}</section>` : '';
  return `<article class="discuss${m.tight ? ' tight' : ''}"><header><p class="ds-brand">Crophalo field brief</p><h1>${esc(m.name)}</h1>${m.where ? `<p>${esc(m.where)}</p>` : ''}${m.area ? outlineSVG(m.area, 110) : ''}</header>
    ${['plan', 'why', 'unknown'].map(sec).join('')}${m.notes.length ? `<section><h3>My notes</h3><ul>${m.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}${m.soil.length ? `<section><h3>My soil test</h3><ul>${m.soil.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}${sec('question')}
    <footer><p>Prepared ${esc(longDay(m.madeOn))} with Crophalo. A guide, not advice. You decide.</p>${m.sources.length ? `<ol class="ds-sources">${m.sources.map(s => `<li>${esc([s.name, s.who, s.url].filter(Boolean).join('. '))}</li>`).join('')}</ol>` : ''}</footer></article>`;
}
// Copy text to the clipboard; if the browser refuses, select it in the box so the farmer can copy it by hand. Returns 'copied', 'selected' or 'failed'.
// button: the button that was pressed, so it can show the small "Copied" state (js/motion-wire.js listens for crophalo:did).
export async function copyText(text, env = globalThis, box = null, button = null) {
  const done = () => { try { if (button) env.document?.dispatchEvent(new CustomEvent('crophalo:did', { detail: { what: 'copied', button } })); } catch { /* the small state is a nicety */ } return 'copied'; };
  try { if (env.navigator?.clipboard?.writeText) { await env.navigator.clipboard.writeText(text); return done(); } } catch { /* fall through to the selection */ }
  try { if (box?.select) { box.focus?.(); box.select(); if (env.document?.execCommand?.('copy')) return done(); return 'selected'; } } catch { /* nothing more to try */ }
  return 'failed';
}
export const COPY_WORDS = Object.freeze({ copied: 'Copied. Paste it into your message or email.', selected: 'Select the text and copy it.', failed: 'Copying did not work here. Select the text and copy it.' });
