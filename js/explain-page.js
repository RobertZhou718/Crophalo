// The "How to read Crophalo" folds and the word cards on the page: puts the folds into the Data page whenever it is drawn,
// adds the word "i" beside the headings that use a word (Weather and Satellites tabs) and opens one shared card for it. Nothing here is pure; nothing is sent anywhere.
// Checked by scripts/e2e_explain.mjs in a real browser (each fold opens, the pictures fit at 320 and 1280 and have their text, the word card opens and closes, axe).
import { explainHTML, wordButton, wordCardHTML } from './explain.js';
import { WORD_SPOTS } from './words.explain.js';
import { cardPlace } from './srci.js';

const ensureStyle = href => { if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l); } };
let frostFixed = false, wantTerm = '', termAsked = null, pop = null, openFor = null;

// A word card link needs the "How it fits together" tab in sight: select it (by hand, so it works whether or not the tabs are wired yet)
function showFitTab() {
  for (const t of document.querySelectorAll('#infoBody [role=tab][id^="srctab-"]')) { const on = t.id === 'srctab-fit'; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; const p = document.getElementById(t.getAttribute('aria-controls')); if (p) p.hidden = !on; }
  const f = document.querySelector('#infoBody .data-filter'); if (f) f.hidden = true;
}

// ---- the folds, at the top of the "How it fits together" tab of the Data page
function mount() {
  const line = document.querySelector('#infoBody #srcpanel-fit');
  if (!line || document.getElementById('explain')) return;
  ensureStyle('css/explain.css');
  line.insertAdjacentHTML('afterbegin', explainHTML({ frostFixed }));
  const root = document.getElementById('explain');
  if (wantTerm) { termAsked = { id: wantTerm, until: Date.now() + 2500 }; wantTerm = ''; }
  if (termAsked && Date.now() < termAsked.until) {   // a word card link: the fit tab in sight, the word's fold open and the word focused; asked again if the folds are drawn once more as the page settles
    showFitTab(); const t = document.getElementById(`ex-term-${termAsked.id}`);
    if (t) { root.querySelector('#ex-words').open = true; t.setAttribute('tabindex', '-1'); t.scrollIntoView({ block: 'start' }); t.focus({ preventScroll: true }); }
    for (const ms of [120, 400, 900]) setTimeout(() => { const w = document.getElementById(`ex-term-${termAsked?.id}`); if (w && (!document.activeElement || document.activeElement === document.body)) { w.setAttribute('tabindex', '-1'); w.focus({ preventScroll: true }); } }, ms);
  }
}

// ---- the word "i" beside the headings that use a word; a heading drawn again gets it again
function decorate() {
  for (const spot of WORD_SPOTS) for (const h of document.querySelectorAll(spot.sel)) if (!h.querySelector(`.wordi[data-word="${spot.id}"]`)) h.insertAdjacentHTML('beforeend', ` ${wordButton(spot.id)}`);
}

// ---- the one shared word card
function ensurePop() {
  if (pop) return pop;
  pop = document.createElement('div');
  pop.id = 'wordPop'; pop.className = 'srcp'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-labelledby', 'wordPopTitle'); pop.hidden = true; pop.tabIndex = -1;
  document.documentElement.append(pop);
  pop.addEventListener('click', event => {
    if (event.target.closest('.srcp-x')) return close(true);
    const go = event.target.closest('[data-word-go]'); if (go) { event.preventDefault(); wantTerm = go.dataset.wordGo; close(false); if (location.hash === '#data') { document.getElementById('explain')?.remove(); mount(); } else location.hash = '#data'; }
  });
  return pop;
}
function place() {
  if (!pop || pop.hidden || !openFor?.isConnected) return;
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tz')) || 1, r = openFor.getBoundingClientRect(), view = { w: innerWidth / z, h: innerHeight / z };
  const at = cardPlace({ left: r.left / z, top: r.top / z, w: r.width / z, h: r.height / z }, view, { w: Math.min(320, view.w - 24), h: pop.offsetHeight });
  Object.assign(pop.style, { left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, maxHeight: `${view.h - 24}px` });
}
function show(button) {
  const card = ensurePop();
  card.innerHTML = wordCardHTML(button.dataset.word); card.hidden = false;
  openFor?.setAttribute('aria-expanded', 'false'); openFor = button; button.setAttribute('aria-expanded', 'true');
  place(); card.focus({ preventScroll: true });
}
function close(refocus) {
  if (!pop || pop.hidden) return;
  pop.hidden = true; const was = openFor; openFor = null; was?.setAttribute('aria-expanded', 'false');
  if (refocus && was?.isConnected) was.focus();
}

// Start once: watch the page for the Data page and for headings that use a word.
export function initExplain() {
  if (initExplain.on) return; initExplain.on = true;
  import('./climate.js').then(m => { frostFixed = 'autumnWords' in m; if (document.getElementById('explain')) { document.getElementById('explain').remove(); mount(); } }, () => {});   // the stations' margin, once that correction is in this copy
  let queued = false;
  const tick = () => { queued = false; mount(); decorate(); };
  new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(tick); } }).observe(document.body, { childList: true, subtree: true });
  tick();
  document.addEventListener('click', event => {
    const b = event.target.closest?.('.wordi[data-word]');
    if (b) { event.preventDefault(); event.stopPropagation(); if (openFor === b) close(true); else show(b); return; }
    if (pop && !pop.hidden && !pop.contains(event.target)) close(false);
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && pop && !pop.hidden) { event.preventDefault(); event.stopPropagation(); close(true); } }, true);
  document.addEventListener('focusin', event => { if (pop && !pop.hidden && !pop.contains(event.target) && event.target !== openFor) close(false); });
  addEventListener('resize', place); addEventListener('scroll', place, { passive: true, capture: true });
}
