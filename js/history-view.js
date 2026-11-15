// Crophalo's land history page: the cards, each figure a picture with its own spoken sentence and a 44 px "More" that stays open across redraws; print and copy as plain text.
// My farm's History tab calls openHistory(container, { farm, fields, series, climate }). The record is worked out in js/history.js from the daily weather the report already loaded; nothing is stored or sent.
// A card whose lookup does not exist yet (greenness history, pests, the crop replay) says "not read yet" and why, never a figure. No verdict on the land and no money, anywhere on this page.
// Pure markup: historyHTML(), stripSVG(), printHTML(). openHistory() and the print and copy buttons are the only parts that touch the page. Checked by scripts/test_history.mjs and scripts/e2e_history.mjs.
import { esc } from './words.js';
import { toast } from './toast.js';
import { winterOnly, countWords, buildHistory, inShort, spokenLine, moreLine, yearsOf, notCountedWords, gapsWords, asText, cropsLines, causesOf, rowNotes, yearLabel, ORDER, LINES, NOT_READ, CHECKLIST, checklistFor, NO_MONEY, CLOSING, HOW, FIRST_YEAR_NOTE } from './history.js';
import { infoButton } from './report-view.js';
import { greenItemHTML, loadGreenness } from './greenness.js';

const CELL_WORDS = { marked: 'yes', hurt: 'hurt', close: 'a close call', fine: 'fine', none: 'not judged', clear: 'no' };
const KIND_LABEL = { hatch: 'hatched', dots: 'dotted', solid: 'solid', lines: 'lined' };
// One row of cells, one for each year counted. A marked year is filled with the line's own pattern, a clear year is an outline, a year not read is dashed: never colour alone.
export function stripSVG(cells, kind, label, { w = 320, glyphs = false } = {}) {
  const n = cells.length, gap = 1.5, cw = Math.max(3, (w - gap * (n - 1)) / n), h = 22, pid = `p-${kind}`, dots = cells.some(c => c.state === 'close') && kind !== 'dots' ? '<pattern id="p-dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1" class="h-pat-fill"/></pattern>' : '';
  const defs = `<defs>${dots}<pattern id="${pid}" width="5" height="5" patternUnits="userSpaceOnUse">${kind === 'hatch' ? '<path d="M0 5L5 0" class="h-pat"/>' : kind === 'dots' ? '<circle cx="2.5" cy="2.5" r="1" class="h-pat-fill"/>' : kind === 'lines' ? '<path d="M0 2.5H5" class="h-pat"/>' : '<rect width="5" height="5" class="h-pat-fill"/>'}</pattern></defs>`;
  const rects = cells.map((c, i) => `<rect class="h-cell ${c.state}" x="${(i * (cw + gap)).toFixed(1)}" y="1" width="${cw.toFixed(1)}" height="${h - 2}" rx="1.5"${c.state === 'marked' ? ` fill="url(#${pid})"` : c.state === 'close' ? ' fill="url(#p-dots)"' : ''}><title>${c.year}: ${CELL_WORDS[c.state] ?? 'no'}</title></rect>`).join('');
  const GLYPH = { marked: '\u2715', close: '!', clear: '\u2713', none: '\u2013' };   // a cross, an exclamation mark, a tick, a dash: the verdict is a shape and a word, never colour or pattern alone
  const marks = glyphs && cw >= 8 ? cells.map((c, i) => `<text class="h-glyph" x="${(i * (cw + gap) + cw / 2).toFixed(1)}" y="${h / 2 + 4}" text-anchor="middle" aria-hidden="true">${GLYPH[c.state] ?? ''}</text>`).join('') : '';
  const ticks = [0, ...cells.map((c, i) => (c.year % 10 === 0 ? i : -1)).filter(i => i > 0), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  const lab = ticks.map(i => `<text class="ch-tick" x="${(i * (cw + gap) + cw / 2).toFixed(1)}" y="${h + 11}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${cells[i].year}</text>`).join('');
  return `<svg class="h-strip" viewBox="0 0 ${w} ${h + 14}" width="${w}" height="${h + 14}" role="img" aria-label="${esc(label)}" focusable="false">${defs}${rects}${marks}${lab}</svg>`;
}
const moreBtn = (id, open, label = 'More') => `<button type="button" class="btn more" data-more="${esc(id)}" aria-expanded="${open}" aria-controls="more-${esc(id)}">${esc(label)}</button>`;
const moreBox = (id, open, lines) => `<div class="h-more" id="more-${esc(id)}"${open ? '' : ' hidden'}>${lines.map(l => `<p class="cap">${esc(l)}</p>`).join('')}</div>`;
const FOLDED = new Set(['weather', 'land', 'sat', 'how']);   // closed at first: the careful reader opens them
const card = (id, title, body, keys = null) => FOLDED.has(id)
  ? `<details class="card pad hcard hfold" id="h-${esc(id)}"><summary class="hsum"><h2 id="ht-${esc(id)}">${esc(title)}</h2></summary>${keys ? `<p class="cap">${infoButton(keys, title)}</p>` : ''}${body}</details>`
  : `<section class="card pad hcard" id="h-${esc(id)}" aria-labelledby="ht-${esc(id)}"><h2 id="ht-${esc(id)}">${esc(title)}${keys ? ` ${infoButton(keys, title)}` : ''}</h2>${body}</section>`;
const notRead = text => `<p class="rv-notread"><b>Not read yet.</b> ${esc(text)}</p>`;

// The crops card: for each crop of the plan, how many of the weather years were fine, a close call or hurt. One cell for each year: hatched = hurt, dotted = a close call, outline = fine, dashed = not judged.
// Each cause and its day is under "More". A close call is never drawn as fine or as hurt.
function cropsCard(crops, open) {
  if (!crops?.ok || !Array.isArray(crops.rows) || !crops.rows.length) return notRead(crops?.reason || NOT_READ.crops);
  const rows = crops.rows.map((r, i) => {
    const c = r.counts, cells = r.years.map(y => ({ year: y.year, state: y.verdict === 'hurt' ? 'marked' : y.verdict === 'close' ? 'close' : y.verdict === 'fine' ? 'clear' : 'none' }));
    const words = countWords(r), spoken = `${r.field}, ${r.crop}: ${winterOnly(r) ? words : words.replace(/^Fine/, 'fine')}`, id = `crop${i}`;
    const why = r.years.filter(y => (y.verdict === 'hurt' || y.verdict === 'close') && causesOf(y).length).map(y => `${yearLabel(y)}: ${y.verdict === 'hurt' ? 'Hurt' : 'Close call'}. ${causesOf(y).join('; ')}.`);
    const skipped = c.nodata + c.growing, notes = skipped ? `Not counted: ${skipped} ${skipped === 1 ? 'year' : 'years'} (no weather, or the season was not over).` : '';
    return `<div class="h-line"><p><b>${esc(r.field)}: ${esc(r.crop)}</b></p><p><span class="num">Fine in ${c.fine} of ${c.judged}</span>${esc(words.slice(`Fine in ${c.fine} of ${c.judged}`.length))}</p>${stripSVG(cells, 'hatch', spoken, { glyphs: true })}<p class="cap">${esc(spoken)}${notes ? ` ${esc(notes)}` : ''}</p>${rowNotes(r).map(n => `<p class="cap h-note">${esc(n)}</p>`).join('')}${why.length ? `${moreBtn(id, open.has(id))}${moreBox(id, open.has(id), why)}` : ''}</div>`;
  }).join('');
  return `${rows}<p class="cap h-legend"><span aria-hidden="true">\u2713</span> Fine. <span aria-hidden="true">!</span> A close call. <span aria-hidden="true">\u2715</span> Hurt. <span aria-hidden="true">\u2013</span> Not judged. Hatched is hurt, dotted a close call, outline fine, dashed not judged.</p>${crops.basis ? `<p class="cap">${esc(crops.basis)}</p>` : ''}`;
}
// A host that already has its own main heading asks for heading: 'h2', so the view keeps exactly one h1.
export const asHeading = (html, heading) => heading === 'h2' ? html.replace(/<h1>([^<]*)<\/h1>/, '<h2>$1</h2>') : html;
export function historyHTML(model, open = new Set()) {
  const { h, farm = 'Your farm', place = '', fields = [], extras = {}, date = '', crops = null } = model;
  if (!h?.ok) return `<div class="hist"><h1>Land history</h1><p class="rv-notread"><b>Not read yet.</b> ${esc(h?.reason ?? 'The weather record is not read yet.')}</p></div>`;
  const s = inShort(h), sub = [farm, place, `${yearsOf(h)}`, 'weather from NASA'].filter(Boolean).join(' · ');
  const strips = ORDER.map(id => {
    const c = h.counts[id], spoken = spokenLine(h, id);
    if (!c) return `<div class="h-line"><p><b>${esc(LINES[id].label)}</b></p><p class="cap">${esc(spoken)}</p></div>`;
    return `<div class="h-line"><p><b>${esc(LINES[id].label)}:</b> <span class="num">${c.n} of ${c.of}</span> years.</p>${stripSVG(h.strips[id], LINES[id].kind, spoken)}
      <p class="cap">${esc(spoken)}</p>${moreBtn(id, open.has(id))}${moreBox(id, open.has(id), moreLine(h, id))}</div>`;
  }).join('');
  const marks = [notCountedWords(h), gapsWords(h)].filter(Boolean);
  const inShortBody = `${s.short ? `<p>${esc(s.short)}</p>` : ''}${s.lines.map(l => `<p>${esc(l)}</p>`).join('')}${s.notSeen ? `<p class="cap">${esc(s.notSeen)}</p>` : ''}${s.trend ? `<p>${esc(s.trend)}</p>` : ''}
    <p class="cap">${esc(FIRST_YEAR_NOTE)} Past weather, not a forecast${h.through ? `. Weather through ${esc(h.through)}` : ''}.</p>${marks.map(m => `<p class="cap">${esc(m)}</p>`).join('')}`;
  const land = fields.length ? fields.map(f => `<p><b>${esc(f.name || 'Field')}</b>: ${esc(f.slope?.words || NOT_READ.slope)}</p>${f.marks?.length ? f.marks.map(m => `<p class="cap">${esc(m)}</p>`).join('') : ''}`).join('') : `<p class="cap">${esc(NOT_READ.slope)}</p>`;
  const sat = `${extras.modis?.status ? greenItemHTML(extras.modis) : `<li><b>MODIS greenness since 2001:</b> ${extras.modis?.words ? esc(extras.modis.words) : esc(NOT_READ.modis)}</li>`}${['GRACE-FO water storage', 'SMAP soil moisture', 'HLS clear pictures'].map((n, i) => `<li><b>${esc(n)}:</b> ${extras[['grace', 'smap', 'hls'][i]]?.words ? esc(extras[['grace', 'smap', 'hls'][i]].words) : 'Not read yet.'}</li>`).join('')}`;
  return `<div class="hist"><header class="hist-head"><h1>Land history</h1><p class="cap" id="histSub">${esc(sub)}</p>
    <div class="btnrow" role="group" aria-label="Ways to look at the record"><button type="button" class="btn" data-hist="print">Print or save as PDF</button>${model.onAhead ? '<button type="button" class="btn" data-hist="ahead">Look ahead</button>' : ''}${model.onYear ? '<button type="button" class="btn" data-hist="year">See one year on the map</button><button type="button" class="btn" data-hist="play">Play the years</button>' : ''}<button type="button" class="btn" data-hist="copy">Copy as text</button></div></header>
    ${card('short', 'In short', inShortBody, ['power'])}
    ${card('weather', 'Weather on this land', strips, ['power'])}
    ${card('crops', 'Your crops, year by year', cropsCard(crops, open))}
    ${extras.grewHTML ? card('grew', 'What this field grew', extras.grewHTML) : ''}
    ${card('land', 'The land itself', land)}
    ${card('sat', 'What satellites saw', `<ul class="h-list">${sat}</ul>`, ['grace', 'smap'])}
    ${card('check', 'Risks to check locally', `${checklistFor(h).led ? '<p class="cap">The checks this weather record points at most come first.</p>' : ''}<ul class="h-check">${checklistFor(h).list.map(([a, b]) => `<li>${esc(a)}${b ? ` <span class="cap">${esc(b)}</span>` : ''}</li>`).join('')}</ul>`)}
    ${card('how', 'How this was worked out', `${HOW.map(l => `<p class="cap">${esc(l)}</p>`).join('')}${ORDER.map(id => `<p class="cap"><b>${esc(LINES[id].label)}:</b> ${esc(h.counts[id] ? moreLine(h, id)[0] : 'Not worked out here.')}</p>`).join('')}`)}
    <p class="cap hist-end">${esc(NO_MONEY)} ${esc(CLOSING)}</p></div>`;
}
// The paper: no controls, tables for each part, a box to tick for each check, the sources and the closing line.
export function printHTML(model) {
  const { h, farm = 'Your farm', place = '', date = '', crops = null } = model;
  if (!h?.ok) return `<h1>${esc(farm)}: land history</h1><p>${esc(h?.reason ?? '')}</p>`;
  const s = inShort(h);
  return `<article class="hist-paper"><h1>${esc(farm)}: land history</h1><p>${esc([place, yearsOf(h), `printed ${date}`].filter(Boolean).join(' · '))}</p>
    <h2>In short</h2>${[...s.lines, s.notSeen, s.trend, s.short].filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('')}
    <h2>Weather on this land</h2><table><thead><tr><th scope="col">Line</th><th scope="col">Years</th><th scope="col">Which years</th></tr></thead><tbody>${ORDER.map(id => `<tr><th scope="row">${esc(LINES[id].label)}</th><td>${h.counts[id] ? `${h.counts[id].n} of ${h.counts[id].of}` : 'not worked out'}</td><td>${esc(h.counts[id]?.years.join(', ') ?? '')}</td></tr>`).join('')}</tbody></table>
    <h2>Your crops, year by year</h2>${cropsLines(crops).map(l => `<p>${esc(l)}</p>`).join('')}<h2>Check before you decide</h2><ul class="paper-check">${checklistFor(h).list.map(([a, b]) => `<li>☐ ${esc(a)}${b ? ` (${esc(b)})` : ''}</li>`).join('')}</ul>
    <h2>Sources</h2><p>NASA POWER daily weather, ${esc(yearsOf(h))}.</p><p>${esc(NO_MONEY)} ${esc(CLOSING)}</p></article>`;
}

// ---- the page
let styled = false;
function ensureStyle() { if (styled || typeof document === 'undefined') return; styled = true; if (!document.querySelector('link[href="css/history.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/history.css'; document.head.append(l); } }
const stamp = (now = new Date()) => now.toLocaleDateString('en-CA');
export function openHistory(container, { heading = 'h1', farm = null, fields = [], series = null, climate = null, extras = {}, crops = null, now = new Date(), greenness = loadGreenness, onAhead = null, onYear = null } = {}) {
  ensureStyle();
  const open = new Set(), model = { h: buildHistory(series, { today: stamp(now) }), farm: farm?.name || 'Your farm', place: farm?.place || '', fields: Array.isArray(fields) ? fields : [], extras, crops, onAhead, onYear, date: stamp(now) };
  const draw = () => { const y = scrollY, f = document.activeElement?.dataset?.more; container.innerHTML = asHeading(historyHTML(model, open), heading); if (f) container.querySelector(`[data-more="${CSS.escape(f)}"]`)?.focus(); scrollTo(0, y); };
  const onClick = async event => {
    const m = event.target.closest('[data-more]'), a = event.target.closest('[data-hist]');
    if (m) { const id = m.dataset.more; if (open.has(id)) open.delete(id); else open.add(id); draw(); return; }
    if (!a) return;
    if (a.dataset.hist === 'ahead' && model.onAhead) { model.onAhead(); return; }
    if ((a.dataset.hist === 'year' || a.dataset.hist === 'play') && model.onYear) { model.onYear(a.dataset.hist === 'play' ? 'play' : 'choose'); return; }
    if (a.dataset.hist === 'copy') { const text = asText(model.h, model); try { await navigator.clipboard.writeText(text); document.dispatchEvent(new CustomEvent('crophalo:did', { detail: { what: 'copied', button: a } })); toast('The land history was copied as text'); } catch { toast('This browser would not copy. Use Print or save as PDF.'); } }
    if (a.dataset.hist === 'print') {
      const sheet = document.createElement('div'); sheet.id = 'printRoot'; sheet.innerHTML = printHTML(model); document.body.append(sheet); document.body.classList.add('printing-history');
      const done = () => { document.body.classList.remove('printing-history'); sheet.remove(); removeEventListener('afterprint', done); }; addEventListener('afterprint', done); print();
    }
  };
  container.addEventListener('click', onClick); draw();
  if (!extras.modis && typeof greenness === 'function' && Number.isFinite(Number(farm?.lat)) && Number.isFinite(Number(farm?.lon))) {   // the greenness history is read in the background: the page is already drawn, and it is drawn again when the answer comes
    model.extras = { ...model.extras, modis: { status: 'loading' } }; draw();
    greenness({ lat: farm.lat, lon: farm.lon }).then(r => { model.extras = { ...model.extras, modis: r.ok ? { status: 'ok', result: r } : { status: 'error', reason: r.reason } }; draw(); }, () => {});
  }
  return { destroy() { container.removeEventListener('click', onClick); container.innerHTML = ''; }, model, redraw: draw };
}
