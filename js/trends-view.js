// Crophalo's "Trends on this land" as markup. On the one-page report it is one closed part inside "Weather here since 2001" (trendsPartHTML): at most four sentences, then under "Show more" one static chart per pattern (a dashed line only for a clear trend), its sentence, notes, source "i" and folded table.
// The report asks the later answers itself (js/report.js loadFor). Pure markup from js/trends-data.js, plus a small table of answers given later (setTrendsExtras) and refreshTrends(), which redraws only the rows that depend on them.
// The charts are plain SVG with no motion, so they look the same under Full, Less and Still. Colour is never alone: each row says its figures in words and in its table.
// Checked by scripts/test_trends.mjs (the markup on the recorded records, the one-page part) and scripts/e2e_trends.mjs (the fit at 320 and 1280 px, axe).
import { esc } from './words.js';
import { infoButton } from './report-view.js';
import { buildTrends, storedRow, greenRow, trendSize } from './trends-data.js';
import { TW, fmt } from './trends-words.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const LATER = new Set(['heat', 'stored', 'green']);   // the rows that change when a later answer arrives
const extras = new Map(), drawn = new Map();
export const trendsKey = (lat, lon) => (fin(+lat) && fin(+lon) ? `${(+lat).toFixed(4)},${(+lon).toFixed(4)}` : '');
export function setTrendsExtras(lat, lon, more) { const k = trendsKey(lat, lon); if (k) extras.set(k, { ...extras.get(k), ...more }); }
export const trendsExtras = (lat, lon) => extras.get(trendsKey(lat, lon)) ?? {};

// ---- one chart. Years along the bottom, the row's values up the side; an unread year is a small cross on the baseline, never a 0.
export function rowSVG(row, { w = 320, h = 150 } = {}) {
  const pad = { l: 40, r: 8, t: 10, b: 22 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const month = row.kind === 'month', labels = month ? row.labels : row.years, n = labels.length;
  const main = month ? row.values : row.series[0].values, all = (month ? row.values : row.series.flatMap(s => s.values)).filter(fin);
  if (!n || !all.length) return '';
  const dots = row.kind === 'dots', signed = month || row.kind === 'signed';
  let lo = dots ? Math.min(...all) : Math.min(0, ...all), hi = dots ? Math.max(...all) : Math.max(0, ...all);
  if (dots) { const room = (hi - lo || 1) * 0.15; lo -= room; hi += room; }
  if (hi === lo) hi = lo + 1;
  const y = v => pad.t + ih - (v - lo) / (hi - lo) * ih, band = iw / n, cx = i => pad.l + band * (i + 0.5), bw = Math.max(1.5, band * 0.7), base = y(signed || !dots ? Math.max(lo, Math.min(hi, 0)) : lo);
  const tickVals = [lo, (lo + hi) / 2, hi], tickText = v => (dots && row.fmtValue ? row.fmtValue(v) : fmt.num(v, Math.abs(hi - lo) < 3 ? 1 : 0));
  const ticks = tickVals.map(v => `<line class="ch-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="ch-tick" x="${pad.l - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${esc(tickText(v))}</text>`).join('');
  const show = month ? labels.map((_, i) => i) : [...new Set([0, Math.round((n - 1) / 2), n - 1])];   // every month; for years the first, the middle and the last
  const xs = show.map(i => `<text class="ch-tick" x="${cx(i).toFixed(1)}" y="${h - 6}" text-anchor="${month ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(String(labels[i]))}</text>`).join('');
  const gap = i => `<path class="tr-gap" d="M${(cx(i) - 2.5).toFixed(1)} ${(pad.t + ih - 5).toFixed(1)} l5 5 m-5 0 l5 -5"/>`;
  let marks = '';
  main.forEach((v, i) => {
    if (!fin(v)) { marks += gap(i); return; }
    if (dots) { marks += `<circle class="tr-dot ${esc(row.id)}" cx="${cx(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6"/>`; return; }
    const top = Math.min(y(v), base), tall = Math.max(0.6, Math.abs(base - y(v))), neg = v < 0 ? ' neg' : '';
    marks += `<rect class="tr-bar ${esc(row.id)}${neg}" x="${(cx(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${tall.toFixed(1)}"/>`;
    const inner = row.kind === 'stack' ? row.series[1].values[i] : NaN;
    if (fin(inner) && inner > 0) marks += `<rect class="tr-bar inner" x="${(cx(i) - bw / 2).toFixed(1)}" y="${y(inner).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.6, base - y(inner)).toFixed(1)}"/>`;
  });
  let line = '';
  if (row.trend?.clear) {
    const pts = row.years.map((yr, i) => [i, yr, main[i]]).filter(p => fin(p[2])), mx = pts.reduce((s, p) => s + p[1], 0) / pts.length, my = pts.reduce((s, p) => s + p[2], 0) / pts.length;
    const at = p => my + row.trend.slope * (p[1] - mx), p0 = pts[0], p1 = pts.at(-1);
    line = `<line class="tr-trend" x1="${cx(p0[0]).toFixed(1)}" y1="${y(at(p0)).toFixed(1)}" x2="${cx(p1[0]).toFixed(1)}" y2="${y(at(p1)).toFixed(1)}"/>`;
  }
  const zero = signed && lo < 0 && hi > 0 ? `<line class="gr-zero" x1="${pad.l}" x2="${w - pad.r}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>` : '';
  return `<svg class="ch tr-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(spoken(row))}" focusable="false">${ticks}${zero}${marks}${line}${xs}</svg>`;
}
export const spoken = row => TW.spokenChart(row.title, row.said, row.trendText || '').trim();

// ---- every number, folded
export function rowTable(row) {
  const cell = v => (fin(v) ? esc(row.fmtValue ? row.fmtValue(v) : fmt.num(v)) : esc(row.missing ?? TW.notRead));
  let head, body;
  if (row.kind === 'month') {
    head = [TW.month, TW.balance.colRain, TW.balance.colEt, TW.balance.colBal];
    body = row.labels.map((m, i) => `<tr><th scope="row">${esc(m)}</th><td>${cell(row.rain[i])}</td><td>${cell(row.et[i])}</td><td>${cell(row.values[i])}</td></tr>`);
  } else {
    const more = row.id === 'stored' ? [TW.stored.colMonths] : [];
    head = [TW.year, ...row.series.map(s => s.name), ...more];
    body = row.years.map((yr, i) => `<tr><th scope="row">${esc(String(yr))}</th>${row.series.map(s => `<td>${cell(s.values[i])}</td>`).join('')}${row.id === 'stored' ? `<td>${esc(String(row.months[i]))}</td>` : ''}</tr>`).reverse();
  }
  return `<details class="disc tr-nums"><summary>${esc(TW.numbers)}</summary><div class="tbl" tabindex="0" role="region" aria-label="${esc(`${row.title}: ${TW.numbers.toLowerCase()}`)}"><table><caption class="sr">${esc(row.title)}</caption><thead><tr>${head.map(t => `<th scope="col">${esc(t)}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div></details>`;
}

// ---- one row of the card. Each figure carries a short signature of its own markup, so a redraw with nothing new changes nothing.
export const sigOf = html => { let h = 0; for (let i = 0; i < html.length; i++) h = (h * 31 + html.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
export function rowHTML(row) { const html = rowMarkup(row); return html.replace('<figure ', `<figure data-sig="${sigOf(html)}" `); }
function rowMarkup(row) {
  const head = `<figcaption><b>${esc(row.title)}</b> ${infoButton(row.sources, row.title)}</figcaption>`;
  const slot = LATER.has(row.id) ? ` data-trend-slot="${esc(row.id)}"` : '';
  if (row.kind === 'wait') return `<figure class="card pad chart-card tr-row" data-trend="${esc(row.id)}"${slot}>${head}<p class="cap" role="status">${esc(row.said)}</p></figure>`;
  if (row.kind === 'none') return `<figure class="card pad chart-card tr-row" data-trend="${esc(row.id)}"${slot}>${head}<p class="rv-notread cap"><b>${esc(TW.notRead)}.</b> ${esc(row.said)}</p>${row.notes.map(t => `<p class="cap">${esc(t)}</p>`).join('')}</figure>`;
  const legend = [row.kind === 'stack' ? `<span><i class="ch-key tr-k20" aria-hidden="true"></i>${esc(row.series[0].name)}</span><span><i class="ch-key tr-k50" aria-hidden="true"></i>${esc(row.series[1].name)}</span>` : '', row.trend?.clear ? `<span><i class="ch-key trend" aria-hidden="true"></i>${esc(TW.trendCol)}</span>` : ''].join('');
  return `<figure class="card pad chart-card tr-row" data-trend="${esc(row.id)}"${slot}>${head}${rowSVG(row)}${legend ? `<p class="ch-legend">${legend}</p>` : ''}
    <p class="tr-said">${esc(row.said)}${row.trendText ? ` <b>${esc(row.trendText)}</b>` : ''}</p>${row.notes.map(t => `<p class="cap">${esc(t)}</p>`).join('')}${rowTable(row)}</figure>`;
}

// ---- the whole card with every row, for a place with the weather record w (the one page uses trendsPartHTML)
export function trendsHTML(w) {
  if (!w?.ok || !w.C) return '';
  const key = trendsKey(w.lat, w.lon);
  drawn.set(key, { C: w.C, lat: w.lat, lon: w.lon });
  const model = buildTrends({ C: w.C, lat: w.lat, lon: w.lon, ...extras.get(key) });
  addStyle();
  return sectionHTML(model, key);
}
export function sectionHTML(model, key = '') {
  if (!model?.ok) return '';
  return `<section class="wk-sec tr-sec" aria-labelledby="wkTrends" data-trends="${esc(key)}"><h3 id="wkTrends">${esc(TW.title)} ${infoButton(['power', 'rules'], TW.title)}</h3>
    <p class="lead">${esc(TW.lead)}</p><p class="tr-past"><b>${esc(TW.past)}</b> ${esc(TW.yearsWord(model.counted, model.first, model.last))}.</p>
    <div class="grid charts tr-grid">${model.rows.map(rowHTML).join('')}</div>
    <p class="cap">${esc(TW.rule)}</p><p class="cap">${esc(TW.area)}</p><p class="cap"><b>${esc(TW.local)}</b></p></section>`;
}

// The rows that wait for a later answer, redrawn in place; a table the farmer opened stays open.
export function refreshTrends(root = globalThis.document) {
  if (!root?.querySelectorAll) return 0;
  let done = 0;
  for (const sec of root.querySelectorAll('[data-trends]')) {
    const seen = drawn.get(sec.dataset.trends); if (!seen) continue;
    const rows = buildTrends({ C: seen.C, lat: seen.lat, lon: seen.lon, ...extras.get(sec.dataset.trends) }).rows ?? [];
    for (const el of sec.querySelectorAll('[data-trend-slot]')) {
      const row = rows.find(r => r.id === el.dataset.trendSlot); if (!row) continue;
      if (el.dataset.sig === sigOf(rowMarkup(row))) continue;
      const html = rowHTML(row);
      const open = el.querySelector('details')?.open;
      el.outerHTML = html; done++;
      if (open) sec.querySelector(`[data-trend-slot="${row.id}"] details`)?.setAttribute('open', '');
    }
  }
  return done;
}
export { storedRow, greenRow };

// In a page only: the card's stylesheet is added once (the same way as js/history-view.js).
function addStyle() {
  if (typeof document === 'undefined' || document.querySelector('link[href="css/trends.css"]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/trends.css'; document.head.append(l);
}

// ---- the one-page report: one closed part inside "Weather here since 2001". Closed: its name and the years counted. Open: at most four
// sentences (what it is, up to two clear trends with their years and source, the source line), then "Show more" with every row.
// model: buildTrends({ C, series, state, grace, green, lat, lon }); localise: the farmer's units for the words (js/unitstext.js localiseText).
const SRC_NAME = { stored: 'NASA GRACE and GRACE-FO', green: 'NASA MODIS' };
export function trendLines(model, max = 2) {
  if (!model?.ok) return [];
  if (model.counted < 10) return [TW.trendShort(model.counted)];
  const clear = model.rows.filter(r => r.trend?.clear && r.years?.length);
  if (!clear.length) return [TW.partNone(model.first, model.last)];
  return clear.slice(0, max).map(r => { const W = TW[r.id] ?? {}; return TW.partClear(r.title, r.trend.slope > 0 ? W.up : W.down, trendSize(r.trend.slope, r.trendDigits ?? 0), r.unit, r.years[0], r.years.at(-1), SRC_NAME[r.id] ?? 'NASA POWER'); });
}
export function trendsPartHTML(model, { localise = t => t } = {}) {
  if (!model?.ok) return '';
  addStyle();
  const L = t => esc(localise(t));
  const said = [TW.partLead, ...trendLines(model)].map(t => `<p>${L(t)}</p>`).join('');
  const rows = localise(`<div class="grid charts tr-grid">${model.rows.map(rowHTML).join('')}</div>`);
  return `<article class="card pad sat-card tr-part" data-card="trends"><details class="fold sat-fold" id="lfTrends"><summary><h3 class="sat-name">${esc(TW.title)}</h3><span class="sat-one">${esc(TW.yearsWord(model.counted, model.first, model.last))}</span></summary>
    ${said}<p class="cap">${esc(TW.partSource(model.first, model.last))} ${infoButton(['power', 'rules'], TW.title)}</p>
    <details class="fold sat-more" id="lfTrendsMore"><summary>${esc(TW.more)}</summary>${rows}<p class="cap">${L(TW.rule)}</p><p class="cap">${L(TW.area)}</p><p class="cap"><b>${L(TW.local)}</b></p></details></details></article>`;
}
