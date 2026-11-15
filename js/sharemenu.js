// Crophalo's "Print or save" sheet on the report: two actions only, Print and Save as PDF. Both print the whole report as one document (js/printdoc.js): the page itself, every fold open, with a title block;
// the browser's print window saves it as a PDF. Nothing is copied and nothing is sent.
// shareSheetHTML() is pure; openShareSheet() draws the sheet and listens. Checked by scripts/test_sharemodel.mjs and scripts/test_printdoc.mjs (the markup) and scripts/e2e_share.mjs (the sheet and the printed layout in a real browser).
import { esc } from './words.js';
import { SUPPORT_LINE, longDate } from './report-view.js';
import { printReport, SAVE_NOTE } from './printdoc.js';
import { fmtArea } from './units.js';

export const WORDS = Object.freeze({ title: 'Print or save', print: 'Print', pdf: 'Save as PDF', note: SAVE_NOTE, close: 'Close' });
// The sheet: the two buttons, the one line about saving, and the line that Crophalo is a guide.
export function shareSheetHTML() {
  return `<div class="sheet-head"><h2 id="shareTitle">${WORDS.title}</h2><button type="button" class="btn" data-share="close">${WORDS.close}</button></div>
  <div class="sheet-body share-body">
    <p class="btnrow share-two"><button type="button" class="btn primary lg" data-share="print"><svg class="ic" aria-hidden="true"><use href="#i-share"/></svg><span>${WORDS.print}</span></button><button type="button" class="btn lg" data-share="pdf"><svg class="ic" aria-hidden="true"><use href="#i-share"/></svg><span>${WORDS.pdf}</span></button></p>
    <p class="cap" id="shareSaveNote">${esc(WORDS.note)}</p><p class="cap">${esc(SUPPORT_LINE)}</p></div>`;
}
// ctx: { report (from buildShareReport: name, place { label, ha }), today, units, trigger }
export function openShareSheet(ctx) {
  const doc = document, win = window, report = ctx.report ?? {};
  const dlg = doc.createElement('dialog'); dlg.className = 'sheet share-sheet'; dlg.setAttribute('aria-labelledby', 'shareTitle'); doc.body.append(dlg);
  dlg.innerHTML = shareSheetHTML();
  const close = () => { try { dlg.close(); } catch { /* not open */ } dlg.remove(); ctx.trigger?.focus?.(); };
  dlg.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dlg.addEventListener('click', async event => {
    const b = event.target.closest('[data-share]'); if (!b) return; const act = b.dataset.share;
    if (act === 'close') return void close();
    if (act !== 'print' && act !== 'pdf') return;
    const place = [report.place?.label, Number.isFinite(report.place?.lat) ? `${(+report.place.lat).toFixed(5)}, ${(+report.place.lon).toFixed(5)}` : ''].filter(Boolean).join(' · ');
    const info = { name: report.name, place, size: Number.isFinite(report.place?.ha) ? fmtArea(report.place.ha, ctx.units ?? { area: 'metric' }) : '', madeOn: longDate(ctx.today || report.madeOn) };
    close();   // the sheet goes first: the report alone is what is printed
    await new Promise(r => setTimeout(r, 0));
    await printReport({ doc, win, info });
  });
  dlg.showModal(); dlg.querySelector('[data-share=print]')?.focus();
  return { dialog: dlg, close };
}
