// Crophalo's "Share or print" sheet on the report: copy the summary as a text message or a longer message, print the field card, print the season weather record, download the strategies as a spreadsheet or every figure as a file, and write a page for a farm adviser.
// Every text names the three strategies. What leaves with it is ticked by the farmer: where the field is, their notes, their soil test (all off to begin with). Crophalo sends nothing: the farmer copies, prints or saves.
// shareSheetHTML() and the small text helpers are pure; openShareSheet() draws the sheet and listens. Checked by scripts/test_sharemodel.mjs (the markup, the ticks, what each output holds) and scripts/e2e_share.mjs (the sheet in a real browser).
import { esc } from './words.js';
import { shortText, longMessage, countLine, GUIDE } from './sharetext.js';
import { printFieldCard } from './fieldcard.js';
import { csvOf, jsonOf } from './exports.js';
import { discussModel, discussText, discussHTML, changeChoices, liveLine, copyText, COPY_WORDS, BOXES, QUESTION_HINT, DEFAULT_CHOICE, TOO_LONG } from './discuss.js';
import { seasonWindow, canOffer, buildRecord, recordHTML, OFFER_WORDS, DROUGHT_ASK } from './statement.js';
import { csvReport, statementSeries } from './sharemodel.js';
import { SUPPORT_LINE } from './report-view.js';
import { toast } from './toast.js';
import { apiUrl } from './api.js';

export const WORDS = Object.freeze({
  title: 'Share or print', lead: n => (n > 1 ? `These include ${n === 3 ? 'three strategies' : `${n} strategies`}: what you grow now, our suggestion and another option.` : 'These carry what Crophalo found for this field.'),
  leaves: 'What leaves with it', position: 'Where the field is', notes: 'My notes', soil: 'My soil test', tickNote: 'Crophalo sends nothing. You copy, print or save, and only what you tick goes in.',
  short: 'Copy as a text message', long: 'Copy a longer message', card: 'Print the field card', cardNote: 'One page for the cab or the store room. Your notes and soil test are never on it.', record: 'Print the season weather record',
  recordNote: 'What the weather did around this field this season, ranked against every season since 2001. Ranks only: nothing about yields or money.', files: 'Save for a spreadsheet', csv: 'Table of strategies (CSV)', json: 'Every figure (JSON)', adviser: 'Write a page for my farm adviser',
  adviserNote: 'You choose the change to discuss and edit every text. They get that page and nothing else.', copy: 'Copy', close: 'Close', back: 'Back to Share or print', print: 'Print', droughtTick: 'Add the US Drought Monitor line',
});
const tick = (id, label, on) => `<label class="share-tick"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> <span>${esc(label)}</span></label>`;
// The sheet's first view as markup. m: { name, strategiesCount, hasNotes, hasSoil, garden, record: { ok, why } | null, us: bool, ticks }.
export function shareSheetHTML(m) {
  const t = m.ticks ?? {};
  return `<div class="sheet-head"><h2 id="shareTitle">${WORDS.title}</h2><button type="button" class="btn" data-share="close">${WORDS.close}</button></div>
  <div class="sheet-body share-body"><p class="cap">${esc(SUPPORT_LINE)}</p><p class="lead">${esc(WORDS.lead(m.garden ? 0 : m.strategiesCount))}</p>
    <fieldset class="share-ticks"><legend>${WORDS.leaves}</legend>${tick('tkPos', WORDS.position, t.position)}${m.hasNotes ? tick('tkNotes', WORDS.notes, t.notes) : ''}${m.hasSoil ? tick('tkSoil', WORDS.soil, t.soil) : ''}<p class="cap">${WORDS.tickNote}</p></fieldset>
    <section class="share-row" aria-labelledby="shShort"><h3 id="shShort">${WORDS.short}</h3><textarea class="share-text" id="shareShort" rows="4" readonly aria-labelledby="shShort"></textarea><p class="cap" id="shareShortCount" role="status"></p><p><button type="button" class="btn" data-share="copy-short">${WORDS.copy}</button></p></section>
    <section class="share-row" aria-labelledby="shLong"><h3 id="shLong">${WORDS.long}</h3><textarea class="share-text" id="shareLong" rows="8" readonly aria-labelledby="shLong"></textarea><p><button type="button" class="btn" data-share="copy-long">${WORDS.copy}</button></p></section>
    <section class="share-row" aria-labelledby="shCard"><h3 id="shCard">${WORDS.card}</h3><p class="cap">${WORDS.cardNote}</p><p><button type="button" class="btn" data-share="print-card">${WORDS.card}</button></p></section>
    <section class="share-row" aria-labelledby="shRec"><h3 id="shRec">${WORDS.record}</h3>${m.record?.ok ? `<p class="cap">${WORDS.recordNote}</p>${m.us ? `<p>${tick('tkDrought', WORDS.droughtTick, t.drought)}</p><p class="cap">${esc(DROUGHT_ASK)}</p>` : ''}<p><button type="button" class="btn" data-share="print-record">${WORDS.record}</button></p>` : `<p class="cap">${esc(m.record?.why || OFFER_WORDS)}</p>`}</section>
    <section class="share-row" aria-labelledby="shFiles"><h3 id="shFiles">${WORDS.files}</h3><p class="btnrow"><button type="button" class="btn" data-share="csv">${WORDS.csv}</button><button type="button" class="btn" data-share="json">${WORDS.json}</button></p><p class="cap" id="shareFileNote" role="status"></p></section>
    <section class="share-row" aria-labelledby="shAdv"><h3 id="shAdv">${WORDS.adviser}</h3><p class="cap">${WORDS.adviserNote}</p><p><button type="button" class="btn" data-share="adviser">${WORDS.adviser}</button></p></section></div>`;
}
// The adviser view: the change to discuss, three ticks, four boxes, the line saying what is left out, and the buttons.
export function adviserSheetHTML(report, choice) {
  const m = discussModel(report, choice);
  if (m.garden) return `<div class="sheet-head"><h2 id="shareTitle">${WORDS.adviser}</h2><button type="button" class="btn" data-share="back">${WORDS.back}</button></div><div class="sheet-body"><p>${esc(m.text)}</p></div>`;
  const choices = changeChoices(report);
  return `<div class="sheet-head"><h2 id="shareTitle">${WORDS.adviser}</h2><button type="button" class="btn" data-share="back">${WORDS.back}</button></div>
  <div class="sheet-body share-body"><p class="cap">${esc(SUPPORT_LINE)}</p>
    <label class="field"><span>The change to discuss</span><select id="dsChange">${choices.map(c => `<option value="${esc(c.value)}"${c.value === choice.change ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
    <div class="share-ticks">${tick('dsWhere', WORDS.position, choice.showWhere)}${(report.notes ?? []).length ? tick('dsNotes', WORDS.notes, choice.notes) : ''}${(report.soilTestLines ?? []).length ? tick('dsSoil', WORDS.soil, choice.soilTest) : ''}</div>
    ${Object.entries(BOXES).map(([k, b]) => `<label class="field"><span>${esc(b.label)}</span><textarea class="share-text" data-ds="${k}" rows="${k === 'plan' ? 8 : 4}" maxlength="${b.max}"${k === 'question' ? ` placeholder="${esc(QUESTION_HINT)}"` : ''}>${esc(m.boxes[k])}</textarea></label>`).join('')}
    <p class="cap" id="dsLive">${esc(liveLine(choice))}</p>${m.tooLong ? `<p class="cap" role="note">${esc(TOO_LONG)}</p>` : ''}
    <p class="btnrow"><button type="button" class="btn" data-share="copy-brief">${WORDS.copy}</button><button type="button" class="btn" data-share="print-brief">${WORDS.print}</button></p></div>`;
}
// Put one piece of markup on paper alone: a hidden host, one class on the page that hides everything else, the title changed, and all of it put back afterwards.
export function printHTML(doc, win, html, title) {
  const host = doc.createElement('div'), old = doc.title, root = doc.documentElement;
  host.id = 'printHost'; host.className = 'print-host'; host.innerHTML = html; doc.body.append(host); root.classList.add('print-card'); doc.title = title;
  const done = () => { host.remove(); root.classList.remove('print-card'); doc.title = old; win.removeEventListener('afterprint', done); };
  win.addEventListener('afterprint', done); win.print(); return done;
}
// The season to rank: the crop sown most recently on or before today, from the plan grown now.
export function recordWindow(result, today) {
  const seasons = (result?.current?.seasons ?? []).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.sow ?? '') && s.sow <= today).sort((a, b) => (a.sow < b.sow ? 1 : -1));
  return seasons[0] ? { win: seasonWindow({ today, sowDay: seasons[0].sow, harvestDay: seasons[0].harvest }), crop: seasons[0].crop } : { win: null, crop: '' };
}
// What the sheet offers for the season record: ok, or why not.
export function recordOffer({ series, result, today }) {
  if (!series) return { ok: false, why: 'The weather record of this field is not read yet, so no season is ranked.' };
  const { win, crop } = recordWindow(result, today);
  if (!win) return { ok: false, why: 'No season of the plan you grow now has started yet, so there is nothing to rank.' };
  return canOffer(series, win) ? { ok: true, win, crop } : { ok: false, why: OFFER_WORDS };
}
const download = (doc, file) => { const blob = new Blob([file.text], { type: file.type }), url = URL.createObjectURL(blob), a = doc.createElement('a'); a.href = url; a.download = file.name; doc.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); };

// ctx: { report (from buildShareReport), result, state, series, today, units, cc, fetch, trigger, base }
export function openShareSheet(ctx) {
  const doc = document, win = window, report = ctx.report, ticks = { position: false, notes: false, soil: false, drought: false };
  let choice = { ...DEFAULT_CHOICE, edits: {} }, view = 'menu';
  const dlg = doc.createElement('dialog'); dlg.className = 'sheet share-sheet'; dlg.setAttribute('aria-labelledby', 'shareTitle'); doc.body.append(dlg);
  const rec = statementSeries(ctx.series), offer = recordOffer({ series: rec, result: ctx.result, today: ctx.today });
  const pickNotes = () => (ticks.notes ? report.notes : []), shared = () => ({ ...report, notes: pickNotes(), soilTestLines: ticks.soil ? report.soilTestLines : [], place: ticks.position ? report.place : { ...report.place, lat: NaN, lon: NaN } });
  const fill = () => {
    const s = shortText(shared(), { withPosition: ticks.position }), box = dlg.querySelector('#shareShort'), cnt = dlg.querySelector('#shareShortCount'); if (!box) return;
    box.value = s.text; cnt.textContent = countLine(s.text);
    dlg.querySelector('#shareLong').value = longMessage(shared(), { notes: ticks.notes, soilTest: ticks.soil });
  };
  const drawMenu = () => { view = 'menu'; dlg.innerHTML = shareSheetHTML({ strategiesCount: report.strategies?.length ?? 0, hasNotes: (report.notes ?? []).some(n => n && n.kind !== 'notice' && String(n.text ?? '').trim()), hasSoil: (report.soilTestLines ?? []).length > 0, garden: report.garden, record: offer, us: ctx.cc === 'US', ticks }); fill(); };
  const drawAdviser = () => { view = 'adviser'; dlg.innerHTML = adviserSheetHTML({ ...report, farmerPick: null }, choice); };
  const model = () => discussModel({ ...report }, choice);
  const close = () => { try { dlg.close(); } catch { /* not open */ } dlg.remove(); ctx.trigger?.focus?.(); };
  dlg.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dlg.addEventListener('change', event => {
    const t = event.target;
    if (t.id === 'tkPos') ticks.position = t.checked; else if (t.id === 'tkNotes') ticks.notes = t.checked; else if (t.id === 'tkSoil') ticks.soil = t.checked; else if (t.id === 'tkDrought') ticks.drought = t.checked;
    if (['tkPos', 'tkNotes', 'tkSoil'].includes(t.id)) return void fill();
    if (t.id === 'dsChange') { choice = { ...choice, change: t.value, edits: {} }; drawAdviser(); dlg.querySelector('#dsChange')?.focus(); }
    else if (t.id === 'dsWhere' || t.id === 'dsNotes' || t.id === 'dsSoil') { choice = { ...choice, showWhere: dlg.querySelector('#dsWhere')?.checked ?? false, notes: dlg.querySelector('#dsNotes')?.checked ?? false, soilTest: dlg.querySelector('#dsSoil')?.checked ?? false }; const keep = t.id; drawAdviser(); dlg.querySelector(`#${keep}`)?.focus(); }
  });
  dlg.addEventListener('input', event => { const k = event.target.dataset?.ds; if (k) choice = { ...choice, edits: { ...choice.edits, [k]: event.target.value } }; });
  dlg.addEventListener('click', async event => {
    const b = event.target.closest('[data-share]'); if (!b) return; const act = b.dataset.share;
    if (act === 'close') return void close();
    if (act === 'back') { drawMenu(); return void dlg.querySelector('[data-share=adviser]')?.focus(); }
    if (act === 'adviser') { drawAdviser(); return void dlg.querySelector('#dsChange')?.focus(); }
    if (act === 'copy-short' || act === 'copy-long') { const box = dlg.querySelector(act === 'copy-short' ? '#shareShort' : '#shareLong'), r = await copyText(box.value, globalThis, box, b); return void toast(COPY_WORDS[r]); }
    if (act === 'copy-brief') { const r = await copyText(discussText(model()), globalThis, null, b); return void toast(COPY_WORDS[r]); }
    if (act === 'print-brief') return void printHTML(doc, win, discussHTML(model()), `Crophalo field brief – ${report.name}`);
    if (act === 'print-card') return void printFieldCard(doc, win, { ...report, notes: [], soilTestLines: [] });
    if (act === 'print-record' && offer.ok) {
      let drought = null; if (ticks.drought && ctx.fetch) { try { const from = offer.win.start.replace(/-/g, ''), to = offer.win.end.replace(/-/g, ''), r = await ctx.fetch(apiUrl(`/api/drought?lat=${report.place.lat}&lon=${report.place.lon}&from=${from}&to=${to}`)).then(x => x.json()); drought = r?.ok ? { weeks: r.weeks, county: r.county, state: r.state } : { reason: r?.reason || 'The US Drought Monitor line could not be read.' }; } catch { drought = { reason: 'The US Drought Monitor line could not be read.' }; } }
      const rec = buildRecord({ name: report.name, place: report.place.label, crop: ctx.cropName ?? '', series: rec, win: offer.win, units: ctx.units ?? {}, backupNote: report.backupNote, drought, madeOn: ctx.today, sources: report.sources.map(s => [s.name, s.who, s.url].filter(Boolean).join('. ')), notes: ticks.notes ? (report.notes ?? []).filter(n => n.kind !== 'notice').map(n => n.text) : [] });
      return void printHTML(doc, win, recordHTML(rec), `Crophalo season weather record – ${report.name}`);
    }
    if (act === 'csv' || act === 'json') {
      const file = act === 'csv' ? csvOf(csvReport(report, ctx.result)) : jsonOf({ name: report.name, inputs: ctx.inputs ?? null, strategies: report.strategies, soil: ticks.soil ? { lines: report.soilTestLines } : null, notes: pickNotes(), garden: report.garden || null, live: {} });
      const note = dlg.querySelector('#shareFileNote'); if (!file.ok) { note.textContent = file.message; return; }
      download(doc, file); note.textContent = `Saved ${file.name}.`;
    }
  });
  drawMenu(); dlg.showModal(); dlg.querySelector('[data-share=close]')?.focus();
  return { dialog: dlg, close };
}
