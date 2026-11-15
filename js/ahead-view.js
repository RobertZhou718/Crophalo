// Crophalo's Look ahead page: the note box, the horizon switch (a radio group, the arrow keys move and choose) with its "Most sure ... Rough guide" scale, and the panel of the chosen horizon, drawn from the state of js/ahead.js.
// Every sentence is a count of runs with its denominator, hurt first, and none sounds like a chance. Pure markup: aheadHTML(), panelHTML(), rulesHTML(). openAhead() is the one function that touches the page (events, focus, the rules sheet, tab visibility).
// Checked by scripts/test_ahead_view.mjs (every state of every horizon, the words, the buttons) and scripts/e2e_ahead.mjs (a real browser: focus, keys, 44 px, fit, axe).
import { esc } from './words.js';
import { asHeading } from './history-view.js';
import { createAhead } from './ahead.js';
import { bandChartSVG, bandWords, bandTable, tempChartSVG, rainChartSVG, outlookWords, outlookTables } from './ahead-charts.js';
import { infoButton } from './report-view.js';
import { NOTE_BOX, I_CARD, SKILL, EXPLAINERS, HORIZONS, DISAGREE, THIN_LINES, modelNote, weekHeadline, nothingInGround, cannotCheck, nothingThisSeason, tileWords, runsWords, KIND_WORDS, leanWords, kindsLine, OUTLOOK_HINT, OUTLOOK_TREND_NOTE, CLIMATE_BUTTON_NOTE, seasonHeadline, runByRun, NOT_SEPARATE, seasonEnds, yearsHeadline, YEARS_LIMITS, warmingLine, LOOKAHEAD_CREDIT, RULES } from './ahead-words.js';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayWords = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? `${WD[new Date(iso + 'T00:00:00Z').getUTCDay()]} ${+iso.slice(8)}` : '');
const sowWords = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? `${+iso.slice(8)} ${MONTHS[+iso.slice(5, 7) - 1]}` : '');
const num = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace(/\.0$/, '') : '');
const retry = h => `<p><button type="button" class="btn" data-ahead="retry:${h}">Try again</button></p>`;
const notRead = (reason, h) => `<div class="rv-notread" role="status"><p><b>Not read yet.</b> ${esc(reason)}</p>${h ? retry(h) : ''}</div>`;
const working = (text, p) => `<p class="cap" role="status" aria-live="polite">${esc(text)}${p?.of ? ` ${esc(`Step ${Math.min(p.of, (p.done ?? 0) + 1)} of ${p.of}.`)}` : ''}</p>`;

const fold = (title, html) => `<details class="ahead-fold"><summary>${esc(title)}</summary>${html}</details>`;
const figure = (svg, words, table, tableTitle) => svg ? `<figure class="ahead-fig">${svg}<figcaption class="cap">${esc(words)}</figcaption>${fold(tableTitle, table)}</figure>` : '';
function weekCharts(first, ctx) {
  const b = first.bands; if (!b?.days.length) return '';
  const runs = first.tally.runs, lineC = ctx.hardLineC, lines = [{ v: 0, label: '0 °C' }].concat(Number.isFinite(lineC) && lineC < 0 ? [{ v: lineC, label: `${lineC} °C`.replace('-', '−') }] : []);
  const nightWords = bandWords(b, 'lo', { model: first.short, runs, below0: first.nights.below0, belowLine: first.nights.belowHard, lineLabel: ctx.hardLine }), dayWordsText = bandWords(b, 'hi', { model: first.short, runs });
  return `<div class="ahead-figs">${figure(bandChartSVG(b, { kind: 'lo', lines, label: nightWords }), nightWords, bandTable(b, 'lo', `Nights, ${first.short}, every day`), 'The numbers: nights')}${figure(bandChartSVG(b, { kind: 'hi', label: dayWordsText }), dayWordsText, bandTable(b, 'hi', `Days, ${first.short}, every day`), 'The numbers: days')}</div>`;
}
function weeksPanel(s, ctx) {
  if (s.status === 'idle' || s.status === 'loading') return working('Reading the forecast for your field…', s.progress);
  if (s.status === 'hidden') return `<p class="cap" role="status">${esc(s.reason)}</p>`;
  if (s.status === 'error') return notRead(s.reason, 'weeks');
  const r = s.result, first = r.per[0];
  if (!r.inGround) return `<p>${esc(nothingInGround(sowWords(r.next?.sow), ''))}</p>`;
  if (r.allNoData) return `<p class="rv-notread">${esc(cannotCheck(ctx.field, first?.tally.runs ?? 0))}</p>`;
  const head = weekHeadline({ field: ctx.field, model: first.short, of: first.nights.of, below0: first.nights.below0, belowHard: first.nights.belowHard, hot: first.nights.hot, by: dayWords(first.nights.firstDay), crop: ctx.youngCrop, hardLine: ctx.hardLine });
  const tiles = r.per.map(p => `<li class="card pad ahead-tile"><h3>${esc(p.label)}</h3><p class="num">${esc(tileWords(p.tally))}</p><p class="cap">${p.tally.runs} ${p.tally.runs === 1 ? 'run' : 'runs'}.</p>${modelNote(p) ? `<p class="cap">${esc(modelNote(p))}</p>` : ''}${p.stale ? '<p class="cap">NASA’s newest day here is well before the forecast’s first day, so the days between are less sure.</p>' : ''}</li>`).join('');
  return `<p class="ahead-head">${esc(head)}</p><ul class="ahead-tiles">${tiles}</ul>${weekCharts(first, ctx)}${r.disagree ? `<div class="card pad ahead-disagree" role="note"><p>${esc(DISAGREE)}</p></div>` : ''}
    <p class="cap">${esc(THIN_LINES)}</p>${r.per.length < 3 ? '<p><button type="button" class="btn" data-ahead="more-models">Add the American and Canadian models</button></p><p class="cap">Each model is one more request to the weather service, so they are asked only when you ask.</p>' : ''}`;
}
function seasonPanel(s, ctx) {
  if (s.status === 'idle' || s.status === 'loading') return working('Reading the seasonal forecast and laying it over your field’s past years…', s.progress);
  if (s.status === 'hidden') return `<p class="cap" role="status">${esc(s.reason)}</p>`;
  if (s.status === 'error') return notRead(s.reason, 'season');
  const r = s.result; if (!r.inGround) return `<p>${esc(nothingThisSeason(sowWords(r.next?.sow)))}</p>`;
  const c = r.counts, last = r.changesMonths?.at(-1);
  return `<p class="ahead-head">${esc(seasonHeadline({ plan: ctx.planName, field: ctx.field, year: ctx.year, lean: c.lean, usual: c.usual, runs: c.runs, years: c.years }))}</p>
    ${c.perRunHurt ? `<p>${esc(runByRun(c.perRunHurt.min, c.perRunHurt.max, c.years))}</p>` : ''}<p class="cap">${esc(NOT_SEPARATE(c.runs, c.years))}</p>${last ? `<p class="cap">${esc(seasonEnds(last, FULL))}</p>` : ''}<p class="cap">${esc(SKILL)}</p>`;
}
function outlookCharts(rows) {
  const w = outlookWords(rows);
  return `<div class="ahead-figs">${figure(tempChartSVG(rows), w.temp, '', 'The numbers: both charts')}${figure(rainChartSVG(rows), w.rain, '', '')}</div>`.replace(/<details class="ahead-fold"><summary>The numbers: both charts<\/summary><\/details>/, '').replace(/<details class="ahead-fold"><summary><\/summary><\/details>/, '') + fold('The numbers behind both charts', outlookTables(rows));
}
function outlookPanel(s) {
  if (s.status === 'idle' || s.status === 'loading') return working('Working out the next 24 months…', s.progress);
  if (s.status === 'hidden') return `<p class="cap" role="status">${esc(s.reason)}</p>`;
  if (s.status === 'error') return notRead(s.reason, 'outlook');
  const r = s.result, rows = r.rows.map(x => x.kind === 'unavailable' ? `<tr><th scope="row">${esc(label(x.month))}</th><td colspan="5">${esc(x.reason)}</td></tr>` : `<tr><th scope="row">${esc(label(x.month))}</th><td>${esc(KIND_WORDS[x.kind])}</td><td>${num(x.mean)} °C</td><td>${num(x.low)} to ${num(x.high)} °C</td><td>${Math.round(x.rain)} mm</td><td>${esc(leanWords(x))}</td></tr>`).join('');
  const trend = r.models ? '' : `<p class="cap">${esc(OUTLOOK_TREND_NOTE)}</p><p><button type="button" class="btn" data-ahead="load-climate">Add the climate models’ trend</button></p>`;
  return `<p class="lead">${esc(EXPLAINERS.outlook)}</p>${r.seasonalFailed ? `<p class="cap">${esc(r.seasonalFailed)} The seasonal months are shown as the usual month.</p>` : ''}
    <div class="tbl" role="region" tabindex="0" aria-label="The next 24 months"><table><caption class="sr">The next 24 months: the usual month, moved by the models</caption><thead><tr><th scope="col">Month</th><th scope="col">From</th><th scope="col">Usual mean</th><th scope="col">Middle half</th><th scope="col">Rain</th><th scope="col">Lean</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${outlookCharts(r.rows)}
    ${r.kinds.spans.map(sp => `<p class="cap">${esc(kindsLine(sp, MONTHS))}</p>`).join('')}<p class="cap">${esc(OUTLOOK_HINT)}</p>${trend}`;
}
const label = m => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
function yearsPanel(s, ctx) {
  if (s.status === 'idle') return `<p class="lead">${esc(EXPLAINERS.years)}</p><p class="cap">${esc(CLIMATE_BUTTON_NOTE)}</p><p><button type="button" class="btn primary" data-ahead="load-climate">Load the climate models</button></p>`;
  if (s.status === 'loading') return working(`Reading climate model ${Math.min(s.progress?.of ?? 7, (s.progress?.done ?? 0) + 1)} of ${s.progress?.of ?? 7}…`, null);
  if (s.status === 'hidden') return `<p class="cap" role="status">${esc(s.reason)}</p>`;
  if (s.status === 'error') return `${notRead(s.reason, null)}<p><button type="button" class="btn" data-ahead="load-climate">Try again</button></p>`;
  const r = s.result; if (!r.inGround) return `<p>${esc(nothingThisSeason(''))}</p>`;
  const c = r.counts, warm = r.warming?.filter(Number.isFinite) ?? [];
  return `<p class="ahead-head">${esc(yearsHeadline({ plan: ctx.planName, field: ctx.field, years: c.years, min: c.hurtMin, max: c.hurtMax, models: c.models, real: c.real.hurt }))}</p>
    ${warm.length ? `<p>${esc(warmingLine(Math.min(...warm), Math.max(...warm)))}</p>` : ''}${r.partial ? `<p class="cap">${esc(`Only ${r.loaded} of 7 climate models could be read. ${r.partial}`)}</p>` : ''}${r.loaded < 7 ? '<p><button type="button" class="btn" data-ahead="load-climate">Load the rest of the climate models</button></p>' : ''}
    ${r.skipped?.length ? `<p class="cap">${esc(r.skipped.map(k => `${k.model}: ${k.reason}`).join('; '))}.</p>` : ''}${YEARS_LIMITS.map(l => `<p class="cap">${esc(l)}</p>`).join('')}`;
}
export function panelHTML(state, ctx) { const h = state.horizon; return h === 'weeks' ? weeksPanel(state.weeks, ctx) : h === 'season' ? seasonPanel(state.season, ctx) : h === 'outlook' ? outlookPanel(state.outlook) : yearsPanel(state.years, ctx); }
const creditHTML = () => esc(LOOKAHEAD_CREDIT).replace('Weather data by Open-Meteo.com', '<a class="link" href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a>');
export const rulesHTML = () => `<div class="sheet-head"><h2 id="aheadRulesTitle">How Look ahead works</h2><button type="button" class="btn" data-ahead="rules-done">Done</button></div><div class="sheet-body">${RULES.map(([h, t]) => `<h3>${esc(h)}</h3><p>${esc(t)}</p>`).join('')}<p class="cap">${creditHTML()}</p></div>`;
// ctx: { field: name, planName, year, youngCrop, hardLine }
export function aheadHTML(state, ctx) {
  const h = state.horizon, tabs = HORIZONS.map(x => `<button type="button" role="radio" aria-checked="${x.id === h}" tabindex="${x.id === h ? 0 : -1}" data-horizon="${x.id}">${esc(x.label)}</button>`).join('');
  return `<div class="ahead"><header class="ahead-top"><button type="button" class="btn" data-ahead="back">Back to the land history</button><h1>Look ahead</h1><p class="cap">Your plan, laid over the weather models’ possible futures.</p></header>
    <aside class="card pad ahead-note" role="note"><p><b>${esc(NOTE_BOX[0])}</b> ${esc(NOTE_BOX[1])} ${infoButton(['forecast'], I_CARD)}</p></aside>
    <div class="ahead-switch"><div class="seg" role="radiogroup" aria-label="How far ahead">${tabs}</div><p class="cap ahead-scale"><span>${esc(HORIZONS[0].sure)}</span><span aria-hidden="true">…</span><span>${esc(HORIZONS[3].sure)}</span></p></div>
    <section class="ahead-panel" aria-live="polite" aria-labelledby="aheadHorizonTitle"><h2 id="aheadHorizonTitle">${esc(HORIZONS.find(x => x.id === h).label)}</h2>${h === 'weeks' ? `<p class="lead">${esc(EXPLAINERS.weeks)}</p>` : h === 'season' ? `<p class="lead">${esc(EXPLAINERS.season)}</p>` : ''}${panelHTML(state, ctx)}</section>
    <p class="btnrow"><button type="button" class="btn" data-ahead="rules" aria-haspopup="dialog">How Look ahead works</button></p><p class="cap">${creditHTML()}</p></div>`;
}

// ---- the page
let styled = false;
function ensureStyle() { if (styled || typeof document === 'undefined') return; styled = true; for (const href of ['css/history.css', 'css/ahead.css']) if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l); } }
export function openAhead(container, { loader, client, field, plan, series, today, planName = 'Your plan', year = '', youngCrop = 'young corn', hardLine = '−2 °C', hardLineC = -2, heading = 'h1', ctx = {}, onBack = () => {} }) {
  ensureStyle();
  const view = { field: field.name || 'your field', planName, year, youngCrop, hardLine, hardLineC };
  const ahead = createAhead({ loader, client, field, plan, series, today, ctx, hardLine: hardLineC, render: state => draw(state) });
  let rules = null;
  function draw(state) {
    const focusH = document.activeElement?.dataset?.horizon, y = scrollY;
    container.innerHTML = asHeading(aheadHTML(state, view), heading);
    if (focusH) container.querySelector(`[data-horizon="${state.horizon}"]`)?.focus();   // the key that chose a horizon leaves the focus on the horizon it chose
    scrollTo(0, y);
  }
  const onClick = e => {
    const b = e.target.closest('[data-ahead], [data-horizon]'); if (!b) return;
    if (b.dataset.horizon) return void ahead.choose(b.dataset.horizon);
    const [act, arg] = b.dataset.ahead.split(':');
    if (act === 'back') return onBack();
    if (act === 'more-models') return void ahead.moreModels();
    if (act === 'load-climate') return void ahead.loadClimate();
    if (act === 'retry') return void ahead.retry(arg);
    if (act === 'rules') { rules ??= (() => { const d = document.createElement('dialog'); d.className = 'sheet'; d.id = 'dlgAhead'; d.setAttribute('aria-labelledby', 'aheadRulesTitle'); document.body.append(d); d.addEventListener('click', ev => { if (ev.target.closest('[data-ahead="rules-done"]') || ev.target === d) d.close(); }); return d; })(); rules.innerHTML = rulesHTML(); const from = document.activeElement; rules.addEventListener('close', () => from?.focus?.(), { once: true }); rules.showModal(); }
  };
  const order = ['weeks', 'season', 'outlook', 'years'];
  const onKey = e => {
    const r = e.target.closest('[role=radio][data-horizon]'); if (!r) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!step) return;
    e.preventDefault(); ahead.choose(order[(order.indexOf(r.dataset.horizon) + step + order.length) % order.length]);
  };
  const onVisible = () => { if (!document.hidden) ahead.visible(); };
  container.addEventListener('click', onClick); container.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onVisible);
  ahead.open();
  return { ahead, destroy() { container.removeEventListener('click', onClick); container.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVisible); rules?.remove(); container.innerHTML = ''; } };
}
