// Crophalo's Satellites & prices tab on screen, as pure markup: the last 30 days of NASA GPM satellite rain, the regional soil-moisture card, a slot for GRACE-FO water storage,
// and one plain line for the lookups the report does not carry. Every card is one closed line (name, one figure, date) that opens (js/satcard.js). A day nobody read is a gap, never a dry day.
// Pure: functions of plain data (js/satellites-data.js, js/region.js) that return text.
// Checked by scripts/test_satellites.mjs (the rain card in each state, the chart's gaps and first estimates, the table, the other cards, plain-text escaping).
import { priceCards } from './prices-cards.js';
import { esc } from './words.js';
import { regionHtml, valueWords, dateWords, cleanReading } from './region.js';
import { satCard, satWaiting, satPlain } from './satcard.js';
import { rainWords, dayWords, longDay } from './satellites-data.js';
import { graceCardHTML, ecoCardHTML, hlsCardHTML } from './satellites2-view.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const RUN_WORDS = { late: 'Final', early: 'First estimate', null: 'No reading' };

// 30 bars, oldest first; a gap is a small marker on the baseline with its own pattern, a first estimate is an outlined lighter bar: never colour alone.
export function rainChartSVG(r, { w = 320, h = 160 } = {}) {
  const pad = { l: 30, r: 6, t: 8, b: 22 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, n = r.days.length, top = Math.max(5, ...r.days.map(d => d.mm ?? 0)) * 1.1, y = v => pad.t + ih - v / top * ih, g = iw / n, bw = Math.max(1.5, g - 1.5);
  const bars = r.days.map((d, i) => {
    const x = (pad.l + i * g + (g - bw) / 2).toFixed(1);
    return d.mm === null ? `<rect class="sr-gap" x="${x}" y="${(pad.t + ih - 6).toFixed(1)}" width="${bw.toFixed(1)}" height="6"><title>${esc(dayWords(d.day))}: no reading</title></rect>`
      : `<rect class="sr-bar${d.run === 'early' ? ' early' : ''}" x="${x}" y="${y(d.mm).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, pad.t + ih - y(d.mm)).toFixed(1)}"><title>${esc(dayWords(d.day))}: ${d.mm} mm${d.run === 'early' ? ' (first estimate)' : ''}</title></rect>`;
  }).join('');
  const ticks = [0, top / 2, top].map(v => `<text class="ch-tick" x="${pad.l - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text><line class="ch-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`).join('');
  const lab = [0, Math.floor(n / 2), n - 1].map(i => `<text class="ch-tick" x="${(pad.l + i * g + g / 2).toFixed(1)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(dayWords(r.days[i].day))}</text>`).join('');
  const words = `Satellite rain for each of the last ${n} days. ${r.read} read${r.missing ? `, ${r.missing} with no reading` : ''}${r.early.length ? `, ${r.early.length} first estimates` : ''}.`;
  return `<svg class="ch sr-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(words)}" focusable="false">${ticks}${bars}${lab}</svg>`;
}
export function rainTable(r) {
  return `<div class="tbl" tabindex="0" role="region" aria-label="The numbers: satellite rain by day"><table><caption class="sr">Satellite rain by day</caption><thead><tr><th scope="col">Day</th><th scope="col">Rain (mm)</th><th scope="col">Run</th></tr></thead><tbody>${r.days.map(d => `<tr><th scope="row">${esc(longDay(d.day))}</th><td>${d.mm === null ? 'No reading' : d.mm}</td><td>${esc(RUN_WORDS[d.run ?? 'null'])}</td></tr>`).join('')}</tbody></table></div>`;
}
const rainTbl = r => `<details class="fold"><summary>The numbers</summary>${rainTable(r)}</details>`;
export function rainCardHTML(rain) {
  const name = 'How much rain fell in the last 30 days';
  if (!rain || rain.loading) return satWaiting({ id: 'imerg', name, line: 'Reading 30 days of NASA satellite rain for your field. The first time this can take up to a minute.', source: 'gpm' });
  if (!rain.ok) return satPlain({ id: 'imerg', name, line: rain.reason, source: 'gpm' });
  const w = rainWords(rain);
  const legend = `<p class="ch-legend"><span><i class="ch-key rain" aria-hidden="true"></i>Final</span><span><i class="ch-key early" aria-hidden="true"></i>First estimate</span><span><i class="ch-key gap" aria-hidden="true"></i>No reading</span></p>`;
  return satCard({ id: 'imerg', name, one: `${w.head}${rain.newest ? `, ${dayWords(rain.newest)}` : ''}`, first: w.head, chart: rainChartSVG(rain), lines: w.lines.filter(l => !/^Newest day read|^One value for a square/.test(l)), more: `${legend}<p class="cap">${esc(w.lines.find(l => /^One value for a square/.test(l)) ?? '')}</p>${rain.newest ? `<p class="cap">Newest day read: ${esc(longDay(rain.newest))}.</p>` : ''}${rainTbl(rain)}`, source: 'gpm' });
}
export function moistureCardHTML(reading) {
  const name = 'How wet the soil is around your field', r = reading ? cleanReading(reading) : null;
  if (!reading) return satWaiting({ id: 'smap', name, line: 'Reading the NASA SMAP soil moisture for your area\u2026', source: 'smap' });
  if (!r) return satPlain({ id: 'smap', name, line: 'There is no soil moisture value for the area round your field. Try again later.', source: 'smap' });
  const v = valueWords(r.value), when = dateWords(r.date);
  if (r.value == null) return satPlain({ id: 'smap', name, line: 'There is no soil moisture value for the area round your field. It will not guess one.', source: 'smap' });
  return satCard({ id: 'smap', name, one: `${v}${when ? `, ${when}` : ''}`, first: v, lines: ['This is one value for the whole square round your field, not for the field alone.'], more: regionHtml(reading), source: 'smap' });
}
const later = (id, name, line) => satPlain({ id, name, line });
// The world price, farm-gate and country cards (js/prices-cards.js) in the same closed-line frame; their body is the price module's own markup. The pests card is the plain line below.
const moneyCard = c => satCard({ id: c.id, name: c.title, chart: c.body, source: c.keys[0] });
export function satellitesHTML({ rain = null, reading = null, grace = null, eco = null, hls = null, prices = {} } = {}) {
  return `<section class="rv-sec" aria-labelledby="satTitle"><h2 id="satTitle">Satellites &amp; prices</h2>
    <p class="lead">What NASA\u2019s satellites and public records say about the area round your field. A figure that could not be read is left out, never filled in.</p>
    <div class="grid charts sat-grid">${rainCardHTML(rain)}${moistureCardHTML(reading)}
      ${graceCardHTML(grace)}
      ${hlsCardHTML(hls)}
      ${ecoCardHTML(eco)}
      ${priceCards(prices).filter(c => c.id !== 'pests').map(moneyCard).join('')}
      ${later('pests', 'Pests reported nearby', 'Pest sightings are not part of this report. Few people report pests, so ask your neighbours.')}</div></section>`;
}
