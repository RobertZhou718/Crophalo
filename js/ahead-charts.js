// Crophalo's Look ahead charts, from real counts only: the band chart under the weeks tiles (for each day of the next 2 weeks the lowest to the highest run in light, the middle half of the runs darker, no centre line, the crop's frost lines dashed, the
// days after the 7th drawn lighter) and the two 24-month charts (the moved temperature with the usual month dashed, and the rain). Every chart is still: nothing is animated, so Less and Still look the same. Each has a spoken sentence (its label) and a folded table of every number.
// Pure markup from plain data: bandChartSVG(), bandWords(), bandTable(), tempChartSVG(), rainChartSVG(), outlookWords(), outlookTables(). Checked by scripts/test_ahead_charts.mjs on the recorded Oxford answers and scripts/e2e_ahead.mjs.
import { esc } from './words.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const deg = v => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace(/\.0$/, '')} °C`;
const dayText = iso => `${+iso.slice(8)} ${MON[+iso.slice(5, 7) - 1]}`;
const monthText = m => `${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const nice = (lo, hi) => { const span = Math.max(1, hi - lo), step = span > 30 ? 10 : span > 14 ? 5 : span > 6 ? 2 : 1, a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step; return { a, b: b === a ? a + step : b, step }; };

// ---- the 2-week band chart
// bands: { days, lo, hi } from dayBands(); kind: 'lo' (the nights) or 'hi' (the days); lines: [{ v, label }] the crop's own lines, dashed.
export function bandChartSVG(bands, { kind = 'lo', lines = [], label = '', w = 320, h = 170 } = {}) {
  const pts = bands[kind], n = bands.days.length;
  const vals = pts.filter(Boolean).flatMap(b => [b.min, b.max]).concat(lines.map(l => l.v)); if (!n || !vals.length) return '';
  const pad = { l: 36, r: 52, t: 10, b: 22 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, { a, b, step } = nice(Math.min(...vals), Math.max(...vals));
  const x = i => pad.l + (n === 1 ? iw / 2 : i / (n - 1) * iw), y = v => pad.t + ih - (v - a) / (b - a) * ih;
  const poly = (from, to, top, bot) => { const runs = []; let cur = []; for (let i = from; i <= to; i++) { if (pts[i]) cur.push(i); else { runs.push(cur); cur = []; } } runs.push(cur);   // a day with too few runs breaks the band: it is never bridged
    return runs.filter(idx => idx.length >= 2).map(idx => `M${idx.map(i => `${x(i).toFixed(1)} ${y(pts[i][top]).toFixed(1)}`).join(' L')} L${[...idx].reverse().map(i => `${x(i).toFixed(1)} ${y(pts[i][bot]).toFixed(1)}`).join(' L')}Z`).join(' '); };
  const run = (cls, top, bot) => [[0, Math.min(7, n - 1), ''], [7, n - 1, ' thin']].map(([f, t, thin]) => `<path class="${cls}${thin}" d="${poly(f, t, top, bot)}"/>`).join('');
  const grid = []; for (let v = a; v <= b + 1e-9; v += step) grid.push(`<line class="ch-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="ch-tick" x="${pad.l - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`);
  const marks = lines.map(l => `<line class="ab-line" x1="${pad.l}" x2="${w - pad.r}" y1="${y(l.v).toFixed(1)}" y2="${y(l.v).toFixed(1)}"/><text class="ch-tick" x="${w - pad.r + 3}" y="${(y(l.v) + 3).toFixed(1)}">${esc(l.label)}</text>`).join('');
  const xs = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, arr) => arr.indexOf(v) === i).map(i => `<text class="ch-tick" x="${x(i).toFixed(1)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${dayText(bands.days[i])}</text>`).join('');
  return `<svg class="ch ab-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}" focusable="false">${grid.join('')}${run('ab-all', 'max', 'min')}${run('ab-mid', 'q3', 'q1')}${marks}${xs}</svg>`;
}
// The chart's spoken sentence, from the real runs: the day the band reaches furthest, and what the lowest, the highest and the middle half of the runs do there.
export function bandWords(bands, kind, { model = 'forecast', runs = 0, below0 = null, belowLine = null, lineLabel = '' } = {}) {
  const pts = bands[kind], idx = pts.map((b, i) => (b ? i : -1)).filter(i => i >= 0); if (!idx.length) return `${kind === 'lo' ? 'Nights' : 'Days'}, ${model}: not enough runs with a value to draw a band.`;
  const pick = kind === 'lo' ? idx.reduce((m, i) => (pts[i].min < pts[m].min ? i : m), idx[0]) : idx.reduce((m, i) => (pts[i].max > pts[m].max ? i : m), idx[0]), b = pts[pick], what = kind === 'lo' ? 'coldest night' : 'warmest day';
  const from = dayText(bands.days[idx[0]]), to = dayText(bands.days[idx.at(-1)]);
  return `${kind === 'lo' ? 'Nights' : 'Days'}, ${model}, ${from} to ${to}, ${runs} runs. On the ${what}, ${dayText(bands.days[pick])}, the runs range from ${deg(b.min)} to ${deg(b.max)}, and the middle half of them from ${deg(b.q1)} to ${deg(b.q3)}.${below0 !== null ? ` ${below0} of ${runs} runs have a night below 0 °C${belowLine !== null ? `, ${belowLine} below ${lineLabel}` : ''}.` : ''} Days after the 7th are drawn lighter.`;
}
export function bandTable(bands, kind, caption) {
  const rows = bands.days.map((d, i) => { const b = bands[kind][i]; return b ? `<tr><th scope="row">${dayText(d)}</th><td>${deg(b.min)}</td><td>${deg(b.q1)} to ${deg(b.q3)}</td><td>${deg(b.max)}</td><td>${b.n}</td></tr>` : `<tr><th scope="row">${dayText(d)}</th><td colspan="4">Too few runs with a value</td></tr>`; }).join('');
  return `<div class="tbl" tabindex="0" role="region" aria-label="${esc(caption)}"><table><caption class="sr">${esc(caption)}</caption><thead><tr><th scope="col">Day</th><th scope="col">Lowest run</th><th scope="col">Middle half</th><th scope="col">Highest run</th><th scope="col">Runs</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---- the 24-month charts
// rows: outlook() rows. Months that are not available are gaps. The seasonal months are shaded in a pattern, the trend months plain, so no kind rests on colour alone.
export function tempChartSVG(rows, { w = 320, h = 170 } = {}) {
  const ok = rows.filter(r => r.kind !== 'unavailable'); if (!ok.length) return '';
  const pad = { l: 34, r: 8, t: 10, b: 22 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, vals = ok.flatMap(r => [r.low, r.high, r.usual?.mean ?? r.mean]), { a, b, step } = nice(Math.min(...vals), Math.max(...vals)), n = rows.length;
  const x = i => pad.l + (n === 1 ? iw / 2 : i / (n - 1) * iw), y = v => pad.t + ih - (v - a) / (b - a) * ih, cw = iw / Math.max(1, n - 1);
  const segs = key => { const out = []; let cur = []; rows.forEach((r, i) => { if (r.kind === 'unavailable') { if (cur.length) out.push(cur); cur = []; } else cur.push(i); }); if (cur.length) out.push(cur); return out; };
  const band = segs().map(s => s.length < 2 ? '' : `<path class="ab-mid" d="M${s.map(i => `${x(i).toFixed(1)} ${y(rows[i].high).toFixed(1)}`).join(' L')} L${[...s].reverse().map(i => `${x(i).toFixed(1)} ${y(rows[i].low).toFixed(1)}`).join(' L')}Z"/>`).join('');
  const line = (get, cls) => segs().map(s => s.length < 2 ? '' : `<path class="${cls}" d="M${s.map(i => `${x(i).toFixed(1)} ${y(get(rows[i])).toFixed(1)}`).join(' L')}"/>`).join('');
  const seasonal = rows.map((r, i) => (r.kind === 'seasonal' ? i : -1)).filter(i => i >= 0), shade = seasonal.length ? `<rect class="ab-season" x="${(x(seasonal[0]) - cw / 2).toFixed(1)}" y="${pad.t}" width="${(x(seasonal.at(-1)) - x(seasonal[0]) + cw).toFixed(1)}" height="${ih}"/>` : '';
  const grid = []; for (let v = a; v <= b + 1e-9; v += step) grid.push(`<line class="ch-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="ch-tick" x="${pad.l - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`);
  const xs = [0, Math.floor((n - 1) / 2), n - 1].map(i => `<text class="ch-tick" x="${x(i).toFixed(1)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${monthText(rows[i].month)}</text>`).join('');
  return `<svg class="ch ab-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(outlookWords(rows).temp)}" focusable="false">${grid.join('')}${shade}${band}${line(r => r.usual?.mean ?? r.mean, 'ab-usual')}${line(r => r.mean, 'ab-mean')}${xs}</svg>`;
}
export function rainChartSVG(rows, { w = 320, h = 150 } = {}) {
  const ok = rows.filter(r => r.kind !== 'unavailable'); if (!ok.length) return '';
  const pad = { l: 34, r: 8, t: 10, b: 22 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, top = Math.max(...ok.flatMap(r => [r.rain, r.usual?.rain ?? r.rain])) * 1.15, n = rows.length, g = iw / n, bw = Math.max(3, g - 2);
  const y = v => pad.t + ih - v / top * ih, bars = rows.map((r, i) => r.kind === 'unavailable' ? '' : `<rect class="ab-bar${r.kind === 'seasonal' ? ' seasonal' : ''}" x="${(pad.l + i * g + (g - bw) / 2).toFixed(1)}" y="${y(r.rain).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, pad.t + ih - y(r.rain)).toFixed(1)}"><title>${monthText(r.month)}: about ${Math.round(r.rain)} mm (usual ${Math.round(r.usual?.rain ?? r.rain)} mm)</title></rect><line class="ab-tick" x1="${(pad.l + i * g + (g - bw) / 2).toFixed(1)}" x2="${(pad.l + i * g + (g + bw) / 2).toFixed(1)}" y1="${y(r.usual?.rain ?? r.rain).toFixed(1)}" y2="${y(r.usual?.rain ?? r.rain).toFixed(1)}"/>`).join('');
  const ticks = [0, top / 2, top].map(v => `<text class="ch-tick" x="${pad.l - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text><line class="ch-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`).join('');
  const xs = [0, Math.floor((n - 1) / 2), n - 1].map(i => `<text class="ch-tick" x="${(pad.l + i * g + g / 2).toFixed(1)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${monthText(rows[i].month)}</text>`).join('');
  return `<svg class="ch ab-chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(outlookWords(rows).rain)}" focusable="false">${ticks}${bars}${xs}</svg>`;
}
// The two charts' spoken sentences, from the rows.
export function outlookWords(rows) {
  const ok = rows.filter(r => r.kind !== 'unavailable'); if (!ok.length) return { temp: 'The next 24 months: too few NASA years here to draw them.', rain: 'The next 24 months: too few NASA years here to draw them.' };
  const hot = ok.reduce((m, r) => (r.mean > m.mean ? r : m), ok[0]), cold = ok.reduce((m, r) => (r.mean < m.mean ? r : m), ok[0]), wet = ok.reduce((m, r) => (r.rain > m.rain ? r : m), ok[0]), dry = ok.reduce((m, r) => (r.rain < m.rain ? r : m), ok[0]);
  const shifts = ok.filter(r => fin(r.shift)).map(r => r.shift), moved = shifts.length ? ` After the seasonal months the usual month is moved by the trend of the climate models, by ${deg(Math.min(...shifts))} to ${deg(Math.max(...shifts))}.` : '';
  const kinds = ok.some(r => r.kind === 'seasonal') ? ' The months moved by the seasonal forecast are shaded.' : '';
  return {
    temp: `Mean temperature, ${monthText(rows[0].month)} to ${monthText(rows.at(-1).month)}: the warmest month is ${monthText(hot.month)}, about ${deg(hot.mean)} (the usual ${MON[+hot.month.slice(5, 7) - 1]} is ${deg(hot.usual?.mean ?? hot.mean)}); the coldest is ${monthText(cold.month)}, about ${deg(cold.mean)} (usual ${deg(cold.usual?.mean ?? cold.mean)}). The band is the middle half of the NASA years; the dashed line is the usual month.${kinds}${moved}`,
    rain: `Rain for each month: the wettest is ${monthText(wet.month)}, about ${Math.round(wet.rain)} mm (usual ${Math.round(wet.usual?.rain ?? wet.rain)} mm); the driest is ${monthText(dry.month)}, about ${Math.round(dry.rain)} mm (usual ${Math.round(dry.usual?.rain ?? dry.rain)} mm). The small marks are the usual month.`,
  };
}
export function outlookTables(rows) {
  const t = rows.map(r => r.kind === 'unavailable' ? `<tr><th scope="row">${monthText(r.month)}</th><td colspan="4">${esc(r.reason ?? 'Not available')}</td></tr>` : `<tr><th scope="row">${monthText(r.month)}</th><td>${deg(r.usual?.mean ?? r.mean)}</td><td>${deg(r.mean)}</td><td>${deg(r.low)} to ${deg(r.high)}</td><td>${Math.round(r.usual?.rain ?? r.rain)} mm</td><td>${Math.round(r.rain)} mm</td></tr>`).join('');
  return `<div class="tbl" tabindex="0" role="region" aria-label="The numbers behind the charts"><table><caption class="sr">Usual and moved temperature and rain for each of the next 24 months</caption><thead><tr><th scope="col">Month</th><th scope="col">Usual mean</th><th scope="col">Moved mean</th><th scope="col">Middle half</th><th scope="col">Usual rain</th><th scope="col">Moved rain</th></tr></thead><tbody>${t}</tbody></table></div>`;
}
