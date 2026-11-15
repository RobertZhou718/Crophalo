// Crophalo's Satellites & prices tab, two more cards as pure markup: GRACE-FO regional water storage (a line that breaks where there is no data, a trend line with its years, the region drawn as
// about 300 km) and ECOSTRESS ground temperature (every clear pass with its date and local solar time, day and night kept apart, the 70 m pixel drawn as a dot, the reason when there is no clear pass).
// Pure: functions of plain data (js/satellites2-data.js) that return text. Every card carries NASA's "i".
// Checked by scripts/test_satellites2.mjs (each state, the chart's gaps and trend, day and night apart, plain-text escaping).
import { esc } from './words.js';
import { infoButton } from './report-view.js';
import { graceWords, ecoWords, hlsWords, monthWords, dayShort, clock, GRACE_DOI, HLS_CREDIT } from './satellites2-data.js';

const card = (id, title, keys, body, figure = '') => `<article class="card pad sat-card" data-card="${esc(id)}"><h3>${esc(title)} ${infoButton(keys, figure || title)}</h3>${body}</article>`;
const monthIndex = m => +m.slice(0, 4) * 12 + (+m.slice(5) - 1);

// The series as one path per unbroken run (a gap is an empty stretch, never a joined line), a dot for each month, and the trend as a straight line over its own years.
export function graceChartSVG(g, { w = 320, h = 170 } = {}) {
  const pad = { l: 34, r: 8, t: 10, b: 22 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, ms = g.months, a = monthIndex(ms[0].month), b = monthIndex(ms.at(-1).month) || a + 1, span = Math.max(1, b - a);
  const vals = ms.filter(m => m.cm !== null).map(m => m.cm), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), pad2 = (hi - lo || 1) * 0.1, vmin = lo - pad2, vmax = hi + pad2;
  const x = m => pad.l + (monthIndex(m) - a) / span * iw, y = v => pad.t + ih - (v - vmin) / (vmax - vmin) * ih;
  const runs = []; let cur = [];
  for (const m of ms) { if (m.cm === null) { if (cur.length) runs.push(cur); cur = []; } else cur.push(m); } if (cur.length) runs.push(cur);
  const lines = runs.map(r => r.length === 1 ? '' : `<path class="gr-line" d="${r.map((m, i) => `${i ? 'L' : 'M'}${x(m.month).toFixed(1)} ${y(m.cm).toFixed(1)}`).join(' ')}"/>`).join('');
  const dots = runs.flat().map(m => `<circle class="gr-dot" cx="${x(m.month).toFixed(1)}" cy="${y(m.cm).toFixed(1)}" r="1.6"><title>${esc(monthWords(m.month))}: ${m.cm} cm${m.unc !== null ? ` (give or take ${m.unc})` : ''}</title></circle>`).join('');
  let trend = '';
  if (g.trend) {
    const inT = ms.filter(m => m.cm !== null && monthIndex(m.month) >= monthIndex(g.trend.from) && monthIndex(m.month) <= monthIndex(g.trend.to));
    if (inT.length >= 2) { const mx = inT.reduce((s, m) => s + monthIndex(m.month), 0) / inT.length, my = inT.reduce((s, m) => s + m.cm, 0) / inT.length, slope = g.trend.perYear / 12, f = i => my + slope * (i - mx), i0 = monthIndex(g.trend.from), i1 = monthIndex(g.trend.to), px = i => pad.l + (i - a) / span * iw;
      trend = `<line class="gr-trend" x1="${px(i0).toFixed(1)}" y1="${y(f(i0)).toFixed(1)}" x2="${px(i1).toFixed(1)}" y2="${y(f(i1)).toFixed(1)}"/>`; }
  }
  const gapBands = g.gaps.map(s => `<rect class="gr-gap" x="${x(s.from).toFixed(1)}" y="${pad.t}" width="${Math.max(2, x(s.to) - x(s.from)).toFixed(1)}" height="${ih}"><title>No data: ${esc(monthWords(s.from))} to ${esc(monthWords(s.to))}</title></rect>`).join('');
  const ticks = [vmin, (vmin + vmax) / 2, vmax].map(v => `<text class="ch-tick" x="${pad.l - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text><line class="ch-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`).join('');
  const zero = vmin < 0 && vmax > 0 ? `<line class="gr-zero" x1="${pad.l}" x2="${w - pad.r}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>` : '';
  const lab = [ms[0].month, ms.at(-1).month].map((m, i) => `<text class="ch-tick" x="${(i ? w - pad.r : pad.l)}" y="${h - 6}" text-anchor="${i ? 'end' : 'start'}">${esc(monthWords(m))}</text>`).join('');
  const words = `Water stored in the region by month, ${monthWords(ms[0].month)} to ${monthWords(ms.at(-1).month)}, in centimetres. ${g.read} months read${g.gaps.length ? `, with ${g.gaps.length} ${g.gaps.length === 1 ? 'stretch' : 'stretches'} of no data left empty` : ''}.`;
  return `<svg class="ch gr-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(words)}" focusable="false">${gapBands}${ticks}${zero}${lines}${trend}${dots}${lab}</svg>`;
}
// The region drawn at its true shape: a big square marked "about 300 km", with the field a dot you cannot even see at this scale.
export const regionDiagram = km => `<svg class="gr-region" viewBox="0 0 120 120" width="96" height="96" role="img" aria-label="${esc(`The region is a square about ${km} kilometres wide. Your field is a dot far smaller than the square.`)}" focusable="false"><rect x="6" y="6" width="108" height="108" class="gr-box"/><circle cx="60" cy="60" r="2.2" class="gr-field"/><text x="60" y="104" text-anchor="middle" class="ch-tick">about ${km} km</text></svg>`;
export function graceTable(g) {
  return `<div class="tbl" tabindex="0" role="region" aria-label="The numbers: water stored by month"><table><caption class="sr">Regional water storage by month</caption><thead><tr><th scope="col">Month</th><th scope="col">Water (cm)</th><th scope="col">Give or take (cm)</th></tr></thead><tbody>${[...g.months].reverse().map(m => `<tr><th scope="row">${esc(monthWords(m.month))}</th><td>${m.cm === null ? 'No data' : m.cm}</td><td>${m.unc === null ? '' : m.unc}</td></tr>`).join('')}</tbody></table></div>`;
}
export function graceCardHTML(g) {
  const T = 'Regional water storage';
  if (!g || g.loading) return card('grace', T, ['grace'], '<p class="cap" role="status" aria-live="polite">Reading NASA’s GRACE-FO water-storage record for your region…</p>');
  if (!g.ok) return card('grace', T, ['grace'], `<p class="rv-notread"><b>Not read yet.</b> ${esc(g.reason)}</p>`);
  const w = graceWords(g);
  return card('grace', T, ['grace'], `<div class="gr-head"><p class="wk-big num">${esc(w.head)}</p>${regionDiagram(g.km)}</div>${graceChartSVG(g)}
    <p class="ch-legend"><span><i class="ch-key rain" aria-hidden="true"></i>Month read</span>${g.trend ? '<span><i class="ch-key trend" aria-hidden="true"></i>Trend</span>' : ''}${g.gaps.length ? '<span><i class="ch-key gap" aria-hidden="true"></i>No data</span>' : ''}</p>
    ${w.lines.map(l => `<p class="cap">${esc(l)}</p>`).join('')}<p class="cap">NASA GRACE-FO, DOI ${esc(GRACE_DOI)}.</p><details class="disc"><summary>The numbers</summary>${graceTable(g)}</details>`, `Water stored over a region about ${g.km} km wide, ${monthWords(g.newest.month)}.`);
}

// ---- ECOSTRESS
const passRow = p => `<li class="eco-pass"><b class="num">${esc(String(p.c))} °C</b> <span>${esc(dayShort(p.solarDate))}, ${esc(clock(p))}</span>${p.err !== null ? ` <span class="cap">give or take ${esc(String(p.err))} °C</span>` : ''}</li>`;
export const pixelDot = m => `<svg class="eco-dot" viewBox="0 0 60 60" width="44" height="44" role="img" aria-label="${esc(`One reading covers a square about ${m} metres wide, drawn here as a dot.`)}" focusable="false"><circle cx="30" cy="30" r="5" class="eco-pix"/></svg>`;
export function ecoCardHTML(e) {
  const T = 'Ground surface temperature';
  if (!e || e.loading) return card('ecostress', T, ['ecostress'], '<p class="cap" role="status" aria-live="polite">Looking for clear passes of NASA’s heat camera over your field. The first time this can take a minute.</p>');
  if (!e.ok) return card('ecostress', T, ['ecostress'], `<p class="rv-notread"><b>Not read yet.</b> ${esc(e.reason)}</p>`);
  const w = ecoWords(e), day = e.passes.filter(p => p.dn === 'day'), night = e.passes.filter(p => p.dn === 'night');
  const group = (label, list) => list.length ? `<section aria-label="${esc(label)}"><h4>${esc(label)}</h4><ul class="eco-list">${list.map(passRow).join('')}</ul></section>` : '';
  const body = e.passes.length ? `${group('Daytime passes', day)}${group('Night passes', night)}` : `<p class="rv-notread"><b>No clear pass.</b> ${esc(w.lines[0])}</p>`;
  return card('ecostress', T, ['ecostress'], `<div class="eco-head">${pixelDot(e.pixel)}<p class="cap eco-means">${esc(`Ground temperature seen from space at about ${e.pixel} m, not the air temperature.`)}</p></div>${body}
    ${w.lines.slice(e.passes.length ? 0 : 1).filter(l => !/seen from space at about/.test(l)).map(l => `<p class="cap">${esc(l)}</p>`).join('')}<p class="cap">NASA ECOSTRESS, ECO_L2T_LSTE, LP DAAC.</p>`, e.newest ? `Newest clear pass: ${dayShort(e.newest)}.` : '');
}

// ---- HLS greenness: one dot for each clear photo on a 0 to 1 scale, no line across days with no photo
export function hlsChartSVG(h, { w = 320, h: ht = 150 } = {}) {
  const pad = { l: 30, r: 8, t: 10, b: 22 }, iw = w - pad.l - pad.r, ih = ht - pad.t - pad.b, t0 = Date.parse(h.passes[0].date + 'T00:00:00Z'), t1 = Date.parse(h.passes.at(-1).date + 'T00:00:00Z'), span = Math.max(864e5, t1 - t0);
  const x = d => pad.l + (Date.parse(d + 'T00:00:00Z') - t0) / span * iw, y = v => pad.t + ih - Math.max(0, Math.min(1, v)) * ih;
  const dots = h.passes.map(p => `<circle class="hl-dot" cx="${x(p.date).toFixed(1)}" cy="${y(p.ndvi).toFixed(1)}" r="3"><title>${esc(dayShort(p.date))}: ${p.ndvi}${p.sensor ? ` (${esc(p.sensor)})` : ''}</title></circle>`).join('');
  const ticks = [0, 0.4, 0.8].map(v => `<text class="ch-tick" x="${pad.l - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text><line class="ch-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`).join('');
  const lab = [h.passes[0].date, h.passes.at(-1).date].map((d, i) => `<text class="ch-tick" x="${i ? w - pad.r : pad.l}" y="${ht - 6}" text-anchor="${i ? 'end' : 'start'}">${esc(dayShort(d))}</text>`).join('');
  return `<svg class="ch hl-chart" viewBox="0 0 ${w} ${ht}" width="${w}" height="${ht}" role="img" aria-label="${esc(`Greenness of your field on ${h.passes.length} clear days, from ${dayShort(h.passes[0].date)} to ${dayShort(h.passes.at(-1).date)}. 0 is bare ground and about 0.8 is thick green crop.`)}" focusable="false">${ticks}${dots}${lab}</svg>`;
}
export function hlsCardHTML(h) {
  const T = 'Greenness of your field';
  if (!h || h.loading) return card('hls', T, ['hls'], '<p class="cap" role="status" aria-live="polite">Looking for clear satellite photos of your field…</p>');
  if (!h.ok) return card('hls', T, ['hls'], `<p class="rv-notread"><b>Not read yet.</b> ${esc(h.reason)}</p>`);
  const w = hlsWords(h);
  if (!h.passes.length) return card('hls', T, ['hls'], `<p class="rv-notread"><b>No clear photo.</b> ${esc(w.lines[0])}</p><p class="cap">${esc(w.lines.at(-1))}</p><p class="cap">${esc(HLS_CREDIT)}</p>`);
  return card('hls', T, ['hls'], `<p class="wk-big num">${esc(w.head)}</p>${hlsChartSVG(h)}${w.lines.map(l => `<p class="cap">${esc(l)}</p>`).join('')}<p class="cap">${esc(HLS_CREDIT)}</p>
    <details class="disc"><summary>The numbers</summary><div class="tbl" tabindex="0" role="region" aria-label="The numbers: greenness by clear day"><table><caption class="sr">Greenness by clear day</caption><thead><tr><th scope="col">Day</th><th scope="col">Greenness</th><th scope="col">Clear part of the photo</th></tr></thead><tbody>${[...h.passes].reverse().map(p => `<tr><th scope="row">${esc(dayShort(p.date))}</th><td>${p.ndvi}</td><td>${p.clear !== null && p.of ? `${p.clear} of ${p.of} pixels` : ''}</td></tr>`).join('')}</tbody></table></div></details>`, h.newest ? `Newest clear photo: ${dayShort(h.newest.date)}.` : '');
}
