// Crophalo's report on paper and as a PDF: the one-page report itself, printed by the browser with the print style sheet (css/print.css), after one small step that opens every fold and draws
// the title block at the top, and a step after that puts everything back. So the document can never differ from the report on the screen. "Print" and "Save as PDF" are the same document:
// the browser's print window offers Save as PDF as a destination.
// titleBlockHTML(), docTitle() and the order of the headings are pure; preparePrint() and printReport() change the page and give it back. Checked by scripts/test_printdoc.mjs and scripts/e2e_share.mjs.
import { esc } from './words.js';

export const GUIDE_LINE = 'Crophalo: a guide, you decide what to plant.';
export const END_LINE = 'Crophalo supports your judgment. It does not replace it, or local advice.';
export const SAVE_NOTE = 'In the print window choose Save as PDF.';
// The parts of the report, in the order they print: the id of each block of the one page and the heading it carries.
export const PARTS = Object.freeze([
  ['blkAnswer', 'What should I plant next?'], ['blkCompare', 'Compare strategies'], ['blkWrong', 'What could go wrong?'], ['blkWhen', 'When do I do what?'], ['blkMore', 'More about your field'],
]);
export const SOURCES_FOLD = 'lfSources';

// The title block: the field's name, the place and its size, the day the report was made, and the one line about who decides.
export function titleBlockHTML({ name, place, size, madeOn }) {
  const quiet = [place, size, madeOn ? `Report made on ${madeOn}` : ''].filter(Boolean).join(' · ');
  return `<p class="pd-brand"><svg class="pd-mark" aria-hidden="true" viewBox="0 0 256 256"><use href="#logo"/></svg><span>Crophalo</span></p><h1 class="pd-name">${esc(name || 'My field')}</h1>${quiet ? `<p class="pd-quiet">${esc(quiet)}</p>` : ''}<p class="pd-guide">${esc(GUIDE_LINE)}</p>`;
}
// The answer at a glance, for the first page: one row for each strategy of the report (its tag, its name, its score and the one line of what changes), the chosen one marked. The words are the report's own: nothing is made up here.
export function glanceHTML(rows) {
  const list = (rows ?? []).filter(r => r && r.name);
  if (!list.length) return '';
  return `<h2 class="pd-glance-h">${list.length === 3 ? 'The three strategies' : 'The strategies'} at a glance</h2><ol class="pd-glance">${list.map(r => `<li class="pd-g${r.rec ? ' is-rec' : ''}"><span class="pd-g-tag">${esc(r.tag || '')}</span><span class="pd-g-name">${esc(r.name)}</span>${r.score ? `<span class="pd-g-score">${r.score}</span>` : ''}${r.change ? `<span class="pd-g-change">${esc(r.change)}</span>` : ''}</li>`).join('')}</ol>`;
}
// What the page shows of each strategy, read from the page itself (the report's rows).
export function glanceRowsOf(view) {
  return [...view.querySelectorAll('.srows > .srow')].map(r => ({ rec: r.classList.contains('is-rec'), tag: r.querySelector('.srow-tag')?.textContent.replace(/\s+/g, ' ').trim() ?? '', name: r.querySelector('.srow-name')?.textContent.trim() ?? '', score: r.querySelector('.chip')?.outerHTML ?? '', change: r.querySelector('.srow-change')?.textContent.trim() ?? '' }));
}
// A part with nothing in it (no list items, only "None listed yet") and a money line that says there is no figure are not printed: the screen keeps its own words, the paper says only what there is.
export const EMPTY_MONEY = /^No money figure/i;
export function markEmpty(view) {
  for (const sec of view.querySelectorAll('.sd-sec')) if (!sec.querySelector('li')) sec.setAttribute('data-pd-empty', '');
  for (const m of view.querySelectorAll('.money-line')) if (EMPTY_MONEY.test(m.textContent.trim())) m.setAttribute('data-pd-empty', '');
}

// The foot of every page, in the page's own margin boxes: the name of the field and "page N of M" on the left, the day on the right.
const cssText = t => String(t ?? '').replace(/[\\"]/g, ' ').replace(/[\r\n]+/g, ' ');
export const footCSS = ({ name, madeOn }) => `@page { @bottom-left { content: "Crophalo · ${cssText(name || 'My field')} · page " counter(page) " of " counter(pages); font: 8.5pt system-ui, sans-serif; color: #555; } @bottom-right { content: "${cssText(madeOn)}"; font: 8.5pt system-ui, sans-serif; color: #555; } }`;
// The name the print window offers when the farmer saves: "Crophalo report – Field name – 15 November 2026".
export const docTitle = (name, madeOn) => `Crophalo report – ${name || 'My field'}${madeOn ? ` – ${madeOn}` : ''}`;

const styleHref = 'css/print.css';
// The print style sheet, asked for and waited for (at most 3 s: a print without it is the plain page, never nothing).
export function printStyle(doc = globalThis.document) {
  let link = doc.querySelector(`link[rel=stylesheet][href="${styleHref}"]`);
  if (!link) { link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = styleHref; doc.head.append(link); }
  if (link.sheet) return Promise.resolve();
  return new Promise(done => { link.addEventListener('load', done, { once: true }); link.addEventListener('error', done, { once: true }); setTimeout(done, 3000); });
}

// Make the page ready for paper: every fold open, the title block first. Gives back { restore, head } (restore puts the folds, the title and the class back as they were).
// A late answer can draw the report again while the print window is open (a price, a satellite picture): the page is made ready again at once, so the paper is never the plain page.
// info: { name, place, size, madeOn }
export function preparePrint(doc, info) {
  const view = doc.getElementById('view-report'); if (!view?.querySelector('.rv-wrap')) return null;
  const wasOpen = new Set([...view.querySelectorAll('details[open][id]')].map(d => d.id)), openEls = new Set([...view.querySelectorAll('details[open]')]), openIdx = [...view.querySelectorAll('details')].map(d => d.open), unnamed = [...view.querySelectorAll('details')].filter(d => d.open && !d.id).length;
  let head = null;
  const make = () => {
    const wrap = view.querySelector('.rv-wrap'); if (!wrap) return;
    for (const d of view.querySelectorAll('details:not([open])')) d.open = true;
    if (!wrap.querySelector('#printEnd')) { const end = doc.createElement('p'); end.id = 'printEnd'; end.className = 'pd-end'; end.textContent = END_LINE; wrap.append(end); }
    markEmpty(view);
    if (!view.querySelector('#printGlance')) { const rows = glanceRowsOf(view), at = view.querySelector('#blkAnswer'), html = glanceHTML(rows); if (at && html) { const g = doc.createElement('section'); g.id = 'printGlance'; g.className = 'pd-glance-block'; g.innerHTML = html; at.after(g); } }
    if (!head?.isConnected) { head = doc.createElement('header'); head.id = 'printTitle'; head.className = 'pd-title'; head.innerHTML = titleBlockHTML(info); wrap.prepend(head); }
  };
  make();
  const watch = new MutationObserver(() => { watch.disconnect(); make(); watch.observe(view, { childList: true, subtree: true }); });
  watch.observe(view, { childList: true, subtree: true });
  const foot = doc.createElement('style'); foot.id = 'printPage'; foot.textContent = footCSS(info); doc.head.append(foot);
  const old = doc.title; doc.title = docTitle(info.name, info.madeOn); doc.documentElement.classList.add('print-doc');
  let done = false;
  const restore = () => {
    if (done) return; done = true; watch.disconnect(); view.querySelector('#printTitle')?.remove(); view.querySelector('#printEnd')?.remove(); view.querySelector('#printGlance')?.remove(); for (const e of view.querySelectorAll('[data-pd-empty]')) e.removeAttribute('data-pd-empty'); foot.remove();
    const all = [...view.querySelectorAll('details')];
    all.forEach((d, i) => { d.open = d.id ? wasOpen.has(d.id) : (all.length === openIdx.length ? openIdx[i] : openEls.has(d)); });   // a fold with no id comes back by its place when the page was drawn again meanwhile
    doc.title = old; doc.documentElement.classList.remove('print-doc');
  };
  return { restore, get head() { return head; }, unnamed };
}

// Print the report: wait for the style sheet, prepare, open the print window, restore when it closes.
export async function printReport({ doc = document, win = window, info }) {
  await printStyle(doc);
  const prep = preparePrint(doc, info); if (!prep) return false;
  const finish = () => { win.removeEventListener('afterprint', finish); prep.restore(); };
  win.addEventListener('afterprint', finish); setTimeout(finish, 120000);   // a browser that never says afterprint still gets its page back
  win.print();
  return true;
}

// The browser's own Print (Ctrl+P, the menu) must give the same document as the sheet: while a report is on the screen the page is made ready when the browser asks to print and given back when it is done.
// The name, place and day are read from the report's own bar. Armed once (the report arms it when it opens); the sheet's own route does not arm it a second time.
export function infoFromPage(doc) {
  const name = doc.getElementById('reportTitle')?.textContent.trim() ?? '', meta = (doc.querySelector('#reportBar .rb-meta')?.textContent ?? '').split(' · ').map(t => t.trim()).filter(Boolean);
  const made = meta.find(t => /^Made /.test(t)) ?? '', rest = meta.filter(t => t !== made);
  return { name, place: rest.join(' · '), size: '', madeOn: made.replace(/^Made /, '') };
}
let armed = false, own = null;
export function armPrint(doc = globalThis.document, win = globalThis.window) {
  if (armed || !doc || !win) return false; armed = true;
  win.addEventListener('beforeprint', () => {
    const view = doc.getElementById('view-report');
    if (own || doc.documentElement.classList.contains('print-doc') || !view || view.hidden || !view.querySelector('.rv-wrap .rv-letter')) return;   // another route has it ready, or no report is on the screen
    own = preparePrint(doc, infoFromPage(doc));
  });
  win.addEventListener('afterprint', () => { if (own) { own.restore(); own = null; } });
  return true;
}
