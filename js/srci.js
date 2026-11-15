// Crophalo's "i" source button and its card: beside every figure that comes from outside, a button that opens one card saying where it comes from.
// A NASA figure carries the solid blue "i" and the NASA tag; any other source carries the outlined "i" and its own name. The two shapes are the same everywhere.
// Pure: srcButton(), cardHtml(), cardPlace(). initSources() adds one shared card to the page and listens for every button; nothing is sent anywhere.
// Checked by scripts/test_sources.mjs (the markup, the words, the placement) and scripts/e2e_map.mjs (open, close, Escape, focus, 320 px).
import { sourceNotes, anyNasa, sourceNote } from './sources.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const keysOf = keys => [...new Set([].concat(keys).filter(k => sourceNote(k)))];
const CARD_W = 320, EDGE = 12, GAP = 8;
const X = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

// The button for one figure. keys: one source key or several; note: "For this figure" words (a date, a square's width), or none.
// Returns '' when no key has a note, so a figure never gets an "i" that says nothing.
export function srcButton(keys, note = '') {
  const ks = keysOf(keys); if (!ks.length) return '';
  const notes = sourceNotes(ks), nasa = anyNasa(ks);
  return `<button type="button" class="srci${nasa ? ' nasa' : ''}" aria-label="Where this comes from: ${esc(notes.map(n => n.name).join(', '))}" aria-haspopup="dialog" aria-expanded="false" data-src="${ks.join(',')}"${note ? ` data-note="${esc(note)}"` : ''}></button>`;
}

// What the card says: the tags, then "For this figure", then one block per source, NASA first.
export function cardHtml(keys, note = '') {
  const notes = sourceNotes(keysOf(keys)), tags = [...new Set(notes.map(n => (n.nasa ? 'NASA' : n.org)))];
  return `<div class="srcp-top"><span class="srcp-tags">${tags.map(t => `<span class="src${t === 'NASA' ? ' nasa' : ''}">${esc(t)}</span>`).join('')}</span><button type="button" class="srcp-x" aria-label="Close">${X}</button></div>
    ${note ? `<p class="srcp-fig"><b>For this figure</b><span>${esc(note)}</span></p>` : ''}
    ${notes.map(n => `<section class="srcp-src"><h3>${esc(n.name)}</h3><p>${esc(n.what)}</p><p class="cap">Run by ${esc(n.who)}.</p>
      <details class="disc"><summary>More about it</summary><p class="small"><b>How to explain it.</b> ${esc(n.talk)}</p></details>
      <a class="link small" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">Visit the source (opens in a new tab)</a></section>`).join('')}`;
}

// Where the card goes: 320 px wide (or the screen less 24), below the button when it fits, else above; always inside the screen.
// anchor is the button's box in screen pixels; view and card are { w, h }. Returns { left, top, width }.
export function cardPlace(anchor, view, card) {
  const width = Math.min(CARD_W, view.w - 2 * EDGE);
  const left = Math.min(Math.max(anchor.left + anchor.w / 2 - width / 2, EDGE), view.w - width - EDGE);
  const below = anchor.top + anchor.h + GAP, fitsBelow = below + card.h <= view.h - EDGE;
  const top = fitsBelow ? below : Math.max(EDGE, anchor.top - GAP - card.h);
  return { left, top, width };
}

// ---- the "why and how" cards: the same small pop-over, with words written for one question instead of one source. Only what the code really does is said here.
export const WHY = Object.freeze({
  rotations: {
    label: 'Why and how we suggest these rotations',
    title: 'Why these rotations',
    lines: [
      'These are ready-made rotations, so you do not have to build one from nothing.',
      'The first one is picked from what the national crop map shows on the farmland around your field.',
      'You can change it: choose another card, or build your own.',
    ],
    more: [
      'How they are picked: Crophalo looks at which crops cover the most farmland within about 10 km of your field, in the USDA crop map (United States) or the Agriculture and Agri-Food Canada crop map (Canada). It offers the rotations made only of crops that are common there.',
      'The map shows which crops grow near you, not the order they follow. The order in a rotation is the usual one.',
      'If the crop map cannot be read, or covers another country, you see a standard short list. Where a country has an official crop list (Statistics Canada for Ontario), only crops from that list are offered.',
      'Nothing is chosen for you until you tap. After you pick, the report checks your rotation against your field’s own weather since 2001.',
    ],
  },
});
export function whyButton(id) {
  const w = WHY[id]; if (!w) return '';
  return `<button type="button" class="srci" aria-label="${esc(w.label)}" aria-haspopup="dialog" aria-expanded="false" data-why="${esc(id)}"></button>`;
}
export function whyHtml(id) {
  const w = WHY[id]; if (!w) return '';
  return `<div class="srcp-top"><span class="srcp-tags"></span><button type="button" class="srcp-x" aria-label="Close">${X}</button></div>
    <section class="srcp-src"><h3>${esc(w.title)}</h3>${w.lines.map(l => `<p>${esc(l)}</p>`).join('')}
      <details class="disc"><summary>Show more</summary>${w.more.map(l => `<p class="small">${esc(l)}</p>`).join('')}</details></section>`;
}
// ---- the one shared card
let pop = null, openFor = null, hoverTimer = 0, leaveTimer = 0, pinned = false;
const zoom = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tz')) || 1;

function ensure() {
  if (pop) return pop;
  pop = document.createElement('div');
  pop.id = 'srcPop'; pop.className = 'srcp'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Where this information comes from'); pop.hidden = true; pop.tabIndex = -1;
  document.documentElement.append(pop);   // outside the page's own text zoom: placed in screen pixels, then zoomed as one piece
  pop.addEventListener('click', event => { if (event.target.closest('.srcp-x')) close(true); });
  pop.addEventListener('mouseenter', () => clearTimeout(leaveTimer));
  pop.addEventListener('mouseleave', () => { if (!pinned) leaveTimer = setTimeout(() => close(false), 220); });
  pop.addEventListener('focusout', event => { if (pinned && event.relatedTarget && !pop.contains(event.relatedTarget) && event.relatedTarget !== openFor) close(false); });
  return pop;
}
function place() {
  if (!pop || pop.hidden || !openFor?.isConnected) return;
  const z = zoom(), r = openFor.getBoundingClientRect(), view = { w: innerWidth / z, h: innerHeight / z };
  const at = cardPlace({ left: r.left / z, top: r.top / z, w: r.width / z, h: r.height / z }, view, { w: Math.min(CARD_W, view.w - 24), h: pop.offsetHeight });
  Object.assign(pop.style, { left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, maxHeight: `${view.h - 24}px` });
}
function show(button, pin) {
  const card = ensure();
  card.innerHTML = button.dataset.why ? whyHtml(button.dataset.why) : cardHtml(button.dataset.src.split(','), button.dataset.note || '');
  card.hidden = false; openFor = button; pinned = pin || pinned;
  document.querySelectorAll('.srci[aria-expanded=true]').forEach(b => { if (b !== button) b.setAttribute('aria-expanded', 'false'); });
  button.setAttribute('aria-expanded', 'true');
  place();
}
export function close(refocus) {
  if (!pop || pop.hidden) return;
  pop.hidden = true; pinned = false;
  const was = openFor; openFor = null;
  was?.setAttribute('aria-expanded', 'false');
  if (refocus && was?.isConnected) was.focus();
}
export const sourceOpen = () => !!pop && !pop.hidden;

// Start listening. Click opens the card pinned; a second click on the same button closes it; with a mouse the card also opens on hover after 140 ms.
export function initSources() {
  if (initSources.on) return; initSources.on = true;
  document.addEventListener('click', event => {
    const b = event.target.closest?.('.srci[data-src], .srci[data-why]');
    if (b) { event.preventDefault(); event.stopPropagation(); if (openFor === b && pinned) close(true); else { show(b, true); pop.focus({ preventScroll: true }); } return; }
    if (sourceOpen() && !pop.contains(event.target)) close(false);   // a click outside
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && sourceOpen()) { event.preventDefault(); event.stopPropagation(); close(true); } }, true);
  document.addEventListener('mouseover', event => {
    const b = event.target.closest?.('.srci[data-src], .srci[data-why]');
    if (!b || !matchMedia('(hover: hover)').matches || pinned) return;
    clearTimeout(hoverTimer); clearTimeout(leaveTimer); hoverTimer = setTimeout(() => show(b, false), 140);
  });
  document.addEventListener('mouseout', event => {
    if (!event.target.closest?.('.srci[data-src], .srci[data-why]')) return;
    clearTimeout(hoverTimer); if (!pinned) leaveTimer = setTimeout(() => close(false), 220);
  });
  document.addEventListener('focusin', event => { if (sourceOpen() && pinned && !pop.contains(event.target) && event.target !== openFor) close(false); });
  addEventListener('resize', place); addEventListener('scroll', place, { passive: true, capture: true });
}
