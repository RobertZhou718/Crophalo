// Crophalo's satellite card frame, pure markup. Every card has two forms: CLOSED, one line (the name in the farmer's words, one figure, its date), and OPEN: what the farmer gets first,
// at most four short sentences, then a closed "Show more" (the instrument, the square size, the dates, the numbers) and one link to the source's own website. Never "not read yet": a card with nothing yet shows a loading line or one plain line.
// Checked by scripts/test_satcard.mjs (the frame in each state, the four-sentence cap, the one link, no program words).
import { esc } from './words.js';
import { ALL_SOURCES } from './sources.more.js';

export const MAX_SENTENCES = 4;
// Split lines of text into sentences (a full stop, question or exclamation mark followed by a space); a number such as 0.62 or "e.g." style marks do not split. Pure.
export const sentences = lines => (Array.isArray(lines) ? lines : [lines]).flatMap(t => String(t ?? '').split(/(?<=[.!?])\s+(?=[A-Z“"])/)).map(s => s.trim()).filter(Boolean);
// The shown sentences (at most four) and the rest, which belong under Show more. Pure.
export function fit(lines, max = MAX_SENTENCES) { const all = sentences(lines); return { shown: all.slice(0, max), rest: all.slice(max) }; }
export const sourceLink = key => { const s = ALL_SOURCES?.[key]; return s?.url ? `<p class="sat-src"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}<span class="sr"> (opens the source’s own website in a new tab)</span></a></p>` : ''; };

// card({ id, name, one, first, chart, lines, more, source, open })
//  name: the farmer's words ("How wet the soil is around your field"); one: the closed line's figure and date ("0.21, 12 Nov"); first: the one thing the farmer gets;
//  lines: sentences shown (the first four; extra go under Show more); more: markup for under Show more; source: a SOURCES key.
export function satCard({ id, name, one = '', first = '', chart = '', lines = [], more = '', source = '', open = false, state = 'ready' }) {
  const f = fit(lines), extra = f.rest.map(s => `<p class="cap">${esc(s)}</p>`).join('');
  const fold = (extra || more) ? `<details class="fold sat-more"><summary>Show more</summary>${extra}${more}</details>` : '';
  const body = `${first ? `<p class="wk-big num sat-first">${esc(first)}</p>` : ''}${chart}${f.shown.map(s => `<p class="cap">${esc(s)}</p>`).join('')}${fold}${sourceLink(source)}`;
  return `<article class="card pad sat-card" data-card="${esc(id)}" data-state="${esc(state)}"><details class="fold sat-fold"${open ? ' open' : ''}><summary><h3 class="sat-name">${esc(name)}</h3>${one ? `<span class="sat-one">${esc(one)}</span>` : ''}</summary>${body}</details></article>`;
}
// A card that is still loading, or has one plain thing to say (what is missing and what to do): one line, never "not read yet".
export const satWaiting = ({ id, name, line, source = '' }) => satCard({ id, name, one: 'Reading…', lines: [line], source, open: true, state: 'loading' }).replace('<p class="cap">', '<p class="cap" role="status" aria-live="polite">');
export const satPlain = ({ id, name, line, source = '' }) => satCard({ id, name, one: 'No value yet', lines: [line], source, open: true, state: 'plain' });
