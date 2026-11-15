// Crophalo's Weather tab on screen, as pure markup: "Weather through <date>", the next 7 days, this year so far, the climate record as facts and charts that open large,
// and the slot for the regional reading. Every figure carries its "i"; the record never says a chance, and a figure that was not read says "Not read".
// Pure: functions of plain data (see js/weather-data.js) that return text. The page glue (opening a chart large) is in js/report.js.
// Checked by scripts/test_weather_tab.mjs (the sections in order, the "i" on every figure, the charts' tables, a missing forecast, plain-text escaping).
import { fmtRain } from './units.js';
import { weekBlockHTML } from './weather-week.js';
import { esc } from './words.js';
import { infoButton, NOT_READ } from './report-view.js';
import { regionHtml } from './region.js';
import { longDay, MONTH_LABELS } from './weather-data.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const MARK = { good: 'good', watch: 'watch', risk: 'risk', unclear: 'unclear' };   // each status has its own shape as well as its word: never colour alone
const ICON = { frost: 'Frost', rain: 'Rain', sun: 'Hot', leaf: 'Mild' };
const num = (v, d = 0) => Math.abs(v).toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// ---- charts: bars, with the numbers beside them in a table that a screen reader reads and the large view shows
export function chartSVG(chart, { w = 320, h = 170 } = {}) {
  const pad = { l: 34, r: 8, t: 10, b: 22 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, n = chart.labels.length, all = chart.series.flatMap(s => s.values.filter(fin));
  if (!all.length) return '';
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all, chart.median ?? -Infinity), span = hi - lo || 1, y = v => pad.t + ih - (v - lo) / span * ih, zero = y(0);
  const group = iw / n, bw = Math.max(1, group / (chart.series.length + 0.6) - 1);
  const bars = chart.series.map((s, si) => s.values.map((v, i) => fin(v) ? `<rect class="ch-bar ${esc(s.cls)}" x="${(pad.l + i * group + si * (bw + 1) + group * 0.15).toFixed(1)}" y="${Math.min(y(v), zero).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, Math.abs(zero - y(v))).toFixed(1)}"/>` : '').join('')).join('');
  const ticks = [lo, (lo + hi) / 2, hi].map(v => `<text class="ch-tick" x="${pad.l - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text><line class="ch-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`).join('');
  const every = n > 14 ? Math.ceil(n / 6) : 1, labels = chart.labels.map((l, i) => i % every === 0 ? `<text class="ch-tick" x="${(pad.l + i * group + group / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle">${esc(n > 14 ? l.slice(2) : l)}</text>` : '').join('');
  const med = fin(chart.median) ? `<line class="ch-median" x1="${pad.l}" x2="${w - pad.r}" y1="${y(chart.median).toFixed(1)}" y2="${y(chart.median).toFixed(1)}"/>` : '';
  return `<svg class="ch" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(`${chart.title}. ${chart.words}`)}" focusable="false">${ticks}${bars}${med}${labels}</svg>`;
}
export function chartTable(chart) {
  const head = chart.series.map(s => `<th scope="col">${esc(s.name)} (${esc(chart.unit)})</th>`).join('');
  const rows = chart.labels.map((l, i) => `<tr><th scope="row">${esc(l)}</th>${chart.series.map(s => `<td>${fin(s.values[i]) ? esc(chart.signed && s.values[i] < 0 ? '−' + num(s.values[i], 1) : num(s.values[i], chart.unit === 'mm' ? 0 : 1)) : 'Not read'}</td>`).join('')}</tr>`).join('');
  return `<div class="tbl" tabindex="0" role="region" aria-label="${esc(`${chart.title}: the numbers`)}"><table><caption class="sr">${esc(chart.title)}</caption><thead><tr><th scope="col">${chart.labels.length === 12 ? 'Month' : 'Year'}</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
export function chartCard(chart) {
  const legend = chart.series.length > 1 ? `<p class="ch-legend">${chart.series.map(s => `<span><i class="ch-key ${esc(s.cls)}" aria-hidden="true"></i>${esc(s.name)}</span>`).join('')}</p>` : '';
  return `<figure class="card pad chart-card" data-chart="${esc(chart.id)}"><figcaption><b>${esc(chart.title)}</b> ${infoButton(chart.sources, chart.title)}</figcaption>
    ${chartSVG(chart)}${legend}<p class="cap">${esc(chart.words)}</p>
    <button type="button" class="btn sm cz-open" data-zoom="${esc(chart.id)}" aria-haspopup="dialog" aria-label="${esc(`Enlarge: ${chart.title}`)}"><svg class="ic" aria-hidden="true"><use href="#i-expand"/></svg>Enlarge</button></figure>`;
}
// The large view's inside: the chart at full width, how to read it, in words, and every number.
export function chartZoomHTML(chart) {
  return `<div class="sheet-head"><h2 id="czTitle">${esc(chart.title)}</h2><button type="button" class="btn" data-zoom-close>Done</button></div>
    <div class="sheet-body cz-body">${chartSVG(chart, { w: 720, h: 340 })}${chart.series.length > 1 ? `<p class="ch-legend">${chart.series.map(s => `<span><i class="ch-key ${esc(s.cls)}" aria-hidden="true"></i>${esc(s.name)}</span>`).join('')}</p>` : ''}
    <h3>How to read it</h3><p>${esc(chart.how)}</p><h3>In words</h3><p>${esc(chart.words)}</p><h3>The numbers</h3>${chartTable(chart)}
    <h3>Where it comes from</h3><p class="cap">${esc(chart.sources.length ? 'Worked out on your device from the daily weather record of your field’s area.' : '')} ${infoButton(chart.sources, chart.title)}</p></div>`;
}

// ---- the sections
const tile = t => `<article class="card pad wk-tile" data-tile="${esc(t.id)}"><h3>${esc(t.title)} ${infoButton(t.sources, t.title)}</h3><p class="wk-big num">${esc(t.value)}</p>
  <p class="wk-status"><span class="mark ${MARK[t.tone] ?? 'unclear'}" aria-hidden="true"></span><b>${esc(t.status)}</b></p><p class="cap">${esc(t.text)}</p></article>`;
const fact = f => `<article class="wk-fact" data-fact="${esc(f.id)}"><h3>${esc(f.title)} ${infoButton(f.sources, f.title)}</h3><p class="wk-big num">${esc(f.value)}</p><p class="cap">${esc(f.text)}</p></article>`;
const FORECAST_CREDIT = '<a class="link" href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a> (CC BY 4.0)';
export function forecastHTML(w, units = {}) {
  const head = `<h3 id="wk7">The next 7 days ${infoButton(['forecast'], w.week?.today ? `For 7 days from ${longDay(w.week.today)}.` : 'The forecast for the coming days.')}</h3>`;
  if (!w.days.length) return `<section class="wk-sec" aria-labelledby="wk7">${head}<div class="rv-notread" role="status"><p>The forecast is not available right now. The weather record above does not depend on it.</p></div></section>`;
  const calm = w.days.filter(d => d.calm).length, deg = v => Math.round(units.temp === 'F' ? v * 9 / 5 + 32 : v), rain = d => (units.rain === 'in' && d.rain >= 0.5 ? fmtRain(d.rain, units) : d.rainText);
  return `<section class="wk-sec" aria-labelledby="wk7">${head}<ol class="wk-days">${w.days.map(d => `<li class="wk-day${d.calm ? ' is-calm' : ''}"><b>${esc(d.name)}</b><span class="wk-ico" data-icon="${esc(d.icon)}">${esc(ICON[d.icon])}</span><span class="wk-hi num">${deg(d.hi)}°</span><span class="wk-lo num">${deg(d.lo)}°</span><span class="cap">${esc(rain(d))}</span>${d.calm ? '<span class="chip ok">Calm, dry</span>' : ''}</li>`).join('')}</ol>
    <p class="cap">${calm ? 'Calm, dry: no rain, a low chance of rain, wind under 20 km/h, no frost and under 35 °C, with every value known. A weather check only: fieldwork may be possible.' : 'No calm, dry days this week: rain, wind, frost or heat on every day, or a reading missing.'}</p>
    ${weekBlockHTML(w.week, units, esc)}
    <p class="cap">${FORECAST_CREDIT}</p></section>`;
}
export function weatherHTML(w, { reading = null, units = {} } = {}) {
  const head = '<section class="rv-sec" aria-labelledby="wkTitle"><h2 id="wkTitle">Weather</h2>';
  if (!w || w.ok === false) return `${head}<div class="rv-notread" role="status"><p>${esc(w?.reason || NOT_READ)}</p></div></section>`;
  const through = longDay(w.through), region = reading ?? { label: 'Root-zone soil moisture', value: null, km: 9, lat: w.lat, lon: w.lon, source: 'smap', why: 'Soil moisture seen from space comes for a whole square of land, so it is shown as a regional value, never as a pattern inside the field.' };
  return `${head}<p class="lead wk-through">Weather through <b>${esc(through || 'the last day read')}</b> ${infoButton(['power'], through ? `Newest day: ${through}` : '')} <span class="cap">${w.note ? esc(w.note) : ''}</span>${w.C?.weatherLine ? `<br><span class="cap wk-freshness">${esc(w.C.weatherLine)}</span>` : ''}</p>
    ${forecastHTML(w, units)}
    <section class="wk-sec" aria-labelledby="wkYear"><h3 id="wkYear">This year so far, against the same days of earlier years</h3><div class="grid tiles">${w.tiles.map(tile).join('')}</div></section>
    <section class="wk-sec" aria-labelledby="wkRec"><h3 id="wkRec">Your climate, ${esc(`${w.first}–${w.last}`)}: rain, heat and frost records</h3>
      <p class="lead">Rain, heat and frost records for the area around your field (NASA’s squares are about 50 km wide, and satellite rain is an estimate for a square about 10 km wide). A rain gauge near you can read quite differently. If you keep one, trust it over these totals.</p>
      <div class="wk-facts">${w.facts.map(fact).join('')}</div>
      <div class="grid charts">${w.charts.map(chartCard).join('')}</div></section>
    <section class="wk-sec" aria-labelledby="wkReg"><h3 id="wkReg">A regional reading</h3>${regionHtml(region)}</section></section>`;
}
