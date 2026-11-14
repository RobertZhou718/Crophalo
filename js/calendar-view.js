// Crophalo's Calendar tab on screen, as pure markup: a normal year of rain, frost and hot days; the ground month by month under the current plan and the proposed plan,
// each labelled Planned; and "When to sow" with the sowing window and the late-harvest squeeze drawn on a small timeline. Every figure carries its "i".
// Pure: functions of the data from js/calendar-data.js that return text. Nothing rests on colour alone: each ground state has its own pattern, word and title.
// Checked by scripts/test_calendar.mjs (twelve equal months, the labels, the window and squeeze on the timeline, the screen-reader tables, plain-text escaping).
import { esc } from './words.js';
import { cropName } from './crops.js';
import { infoButton, NOT_READ } from './report-view.js';
import { MONTHS, FULL, STATE_WORDS, frostTitle, hotTitle, dayWords, dayYear, daysBetween } from './calendar-data.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const num = v => Math.round(v).toLocaleString('en-US');
const INITIAL = m => MONTHS[m][0];
const GLYPH = { crop: '', cover: '', residue: '', bare: '' };   // the pattern is in CSS; the word is in the title and the table

// ---- the climate card
function climateCard(c) {
  if (!c) return `<div class="rv-notread" role="status"><p>${esc(NOT_READ)}</p></div>`;
  const top = Math.max(...c.rain.filter(fin), 1) * 1.25;
  const head = `<div class="fc-row fc-head" aria-hidden="true">${MONTHS.map((m, i) => `<span class="fc-m"><span class="fc-full">${m}</span><span class="fc-ini">${INITIAL(i)}</span></span>`).join('')}</div>`;
  const rain = `<div class="fc-row fc-rain" aria-hidden="true">${c.rain.map((v, i) => `<span class="fc-col" title="${esc(fin(v) ? `${FULL[i]}: about ${num(v)} mm of rain` : `${FULL[i]}: rain not read`)}"><span class="fc-fig num">${fin(v) ? num(v) : ''}</span><span class="fc-bar" style="height:${fin(v) ? Math.max(4, v / top * 100).toFixed(0) : 0}%"></span></span>`).join('')}</div>`;
  const marks = `<div class="fc-row fc-marks" aria-hidden="true">${c.frost.map((f, i) => `<span class="fc-mk" title="${esc([fin(f) && f >= 1 ? frostTitle(i, f) : '', fin(c.hot[i]) && c.hot[i] >= 2 ? hotTitle(i, c.hot[i]) : ''].filter(Boolean).join('. ') || `${FULL[i]}: no frost or hot days in a normal year`)}">${fin(f) && f >= 1 ? '<i class="fc-frost">❄</i>' : ''}${fin(c.hot[i]) && c.hot[i] >= 2 ? '<i class="fc-sun">☀</i>' : ''}</span>`).join('')}</div>`;
  const table = `<table class="sr"><caption>Month by month: rain, frost and hot days in a normal year</caption><thead><tr><th scope="col">Month</th><th scope="col">Rain (mm)</th><th scope="col">Frost</th><th scope="col">Hot days</th></tr></thead><tbody>${MONTHS.map((m, i) => `<tr><th scope="row">${FULL[i]}</th><td>${fin(c.rain[i]) ? num(c.rain[i]) : 'not read'}</td><td>${esc(frostTitle(i, c.frost[i]).split(': ')[1])}</td><td>${esc(hotTitle(i, c.hot[i]).split(': ')[1])}</td></tr>`).join('')}</tbody></table>`;
  return `<div class="card pad fcal"><div class="fc-labels" aria-hidden="true"><span></span><span class="fc-lab fc-lab-rain">Rain (mm)</span><span class="fc-lab">Frost · heat</span></div><div class="fc-grid">${head}${rain}${marks}</div>${table}
    <p class="cap">The middle of ${c.years} years (${c.first}–${c.last}). ❄ a month with frosty nights; ☀ a month with two or more days above 32 °C.</p></div>`;
}

// ---- a plan's ground, year by year
function planBlock(p) {
  const rows = p.years.map(y => `<div class="fc-yearrow"><span class="fc-year num">${y.year}</span><div class="fc-row fc-ground" aria-hidden="true">${y.cells.map(c => {
    const word = c.state ? STATE_WORDS[c.state] : 'nothing planned';
    const title = `${FULL[c.month]} ${y.year}: ${c.state === 'crop' && c.crop ? `${shortWord(c.crop)} growing` : word}${c.window ? `. Sowing window for ${c.window}` : ''}`;
    return `<span class="fc-cell is-${c.state ?? 'none'}${c.window ? ' in-window' : ''}${c.starts ? ' starts' : ''}" title="${esc(title)}">${c.starts ? `<span class="fc-name">${esc(c.starts)}</span>` : ''}</span>`;
  }).join('')}</div></div>`).join('');
  const table = `<table class="sr"><caption>${esc(p.label)}: the ground, month by month</caption><thead><tr><th scope="col">Year</th><th scope="col">Month</th><th scope="col">Ground</th></tr></thead><tbody>${p.years.flatMap(y => y.cells.filter(c => c.state).map(c => `<tr><td>${y.year}</td><th scope="row">${FULL[c.month]}</th><td>${esc(c.state === 'crop' ? `${c.crop ? shortWord(c.crop) : 'a crop'} growing` : STATE_WORDS[c.state])}${c.window ? ` (sowing window for ${esc(c.window)})` : ''}</td></tr>`)).join('')}</tbody></table>`;
  return `<section class="fc-plan" aria-labelledby="fp-${esc(p.plan.id)}"><h3 id="fp-${esc(p.plan.id)}">${esc(p.label)} <span class="chip">Planned</span> ${infoButton(['rules', 'power'], `${p.label}: what the ground has on it, month by month`)}</h3>
    <p class="cap">${esc(p.name ?? '')}</p><div class="card pad fcal">${rows}${table}</div></section>`;
}
const shortWord = id => { try { return cropName(id, true) || String(id); } catch { return String(id); } };
export const legendHTML = () => `<ul class="fc-legend" aria-label="What the colours and patterns mean">
  <li><i class="fc-key is-crop" aria-hidden="true"></i>A crop growing</li><li><i class="fc-key is-cover" aria-hidden="true"></i>Living cover</li><li><i class="fc-key is-residue" aria-hidden="true"></i>Crop residue (thin cover)</li><li><i class="fc-key is-bare" aria-hidden="true"></i>Bare soil</li><li><i class="fc-key in-window" aria-hidden="true"></i>Sowing window</li></ul>`;

// ---- When to sow: the window, the planned day, the harvest before it, and the squeeze, drawn on a small timeline
export function timelineSVG(l) {
  const W = 320, H = 70, pad = 8, from = (l.harvestBefore && l.harvestBefore < l.earliest ? l.harvestBefore : l.earliest), to = l.latest;
  const pre = 10, span = Math.max(1, daysBetween(from, to) + pre * 2), start = new Date(Date.parse(from + 'T00:00:00Z') - pre * 864e5).toISOString().slice(0, 10);
  const x = d => pad + Math.max(0, Math.min(1, daysBetween(start, d) / span)) * (W - 2 * pad);
  const win = `<rect class="tl-window" x="${x(l.earliest).toFixed(1)}" y="26" width="${(x(l.latest) - x(l.earliest)).toFixed(1)}" height="18" rx="3"/>`;
  const left = l.squeeze && l.squeeze.kind === 'squeezed' && l.harvestBefore ? `<rect class="tl-left" x="${x(l.harvestBefore).toFixed(1)}" y="26" width="${(x(l.latest) - x(l.harvestBefore)).toFixed(1)}" height="18" rx="3"/>` : '';
  const mark = (d, cls, label, y) => d ? `<line class="${cls}" x1="${x(d).toFixed(1)}" x2="${x(d).toFixed(1)}" y1="${y}" y2="48"/><text class="tl-t" x="${Math.min(W - pad, Math.max(pad, x(d))).toFixed(1)}" y="${y - 3}" text-anchor="middle">${esc(label)}</text>` : '';
  const label = `${l.crop} sowing window ${dayWords(l.earliest)} to ${dayWords(l.latest)}${l.harvestBefore ? `; the harvest before it is on ${dayWords(l.harvestBefore)}` : ''}${l.planned ? `; sowing is planned for ${dayWords(l.planned)}` : ''}.`;
  return `<svg class="tl" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}" focusable="false">${win}${left}${l.harvestBefore ? mark(l.harvestBefore, 'tl-harvest', 'Harvest', 20) : ''}${mark(l.planned, 'tl-sow', 'Sow', 20)}
    <text class="tl-t" x="${x(l.earliest).toFixed(1)}" y="62" text-anchor="start">${esc(dayWords(l.earliest))}</text><text class="tl-t" x="${x(l.latest).toFixed(1)}" y="62" text-anchor="end">${esc(dayWords(l.latest))}</text></svg>`;
}
function sowCard(l) {
  const tone = l.squeeze?.kind === 'closed' ? 'risk' : l.squeeze?.kind === 'squeezed' ? 'watch' : 'good';
  return `<article class="card pad fc-sow" data-crop="${esc(l.cropId)}"><h4>${esc(l.crop)} ${infoButton(l.sources, `${l.crop}: when to sow`)}</h4>
    <p><b>Sow between ${esc(dayWords(l.earliest))} and ${esc(dayYear(l.latest))}</b> (${l.open} days).${l.planned ? ` Planned for ${esc(dayYear(l.planned))}${l.plannedInside === false ? ', outside this window' : ''}.` : ''} <span class="chip">Planned</span></p>
    ${timelineSVG(l)}
    ${l.squeeze ? `<p class="fc-squeeze is-${tone}"><span class="mark ${tone === 'good' ? 'good' : tone}" aria-hidden="true"></span><b>${l.squeeze.kind === 'open' ? 'The window is open.' : l.squeeze.kind === 'squeezed' ? 'The window is squeezed.' : 'The window is closed.'}</b> ${esc(l.squeeze.text)}</p>` : ''}</article>`;
}
export function sowingHTML(lines) {
  if (!lines.length) return '';
  return `<section class="fc-when" aria-labelledby="calWhen"><h3 id="calWhen">When to sow</h3><div class="grid tiles">${lines.map(sowCard).join('')}</div>
    <p class="cap">Dates come from the crop guide and your field’s own frost and heat record. Local dates and varieties can differ by a few weeks.</p></section>`;
}

export function calendarHTML(cal) {
  const head = `<section class="rv-sec" aria-labelledby="calTitle"><h2 id="calTitle">Your farming year ${infoButton(['power', 'gpm'], 'Rain, frost and hot days in a normal year')}</h2><p class="lead">A normal year on your field, month by month, and what each plan would put on the ground.</p>`;
  if (!cal) return `${head}<div class="rv-notread" role="status"><p>${esc(NOT_READ)}</p></div></section>`;
  return `${head}${climateCard(cal.climate)}
    ${cal.hasPlans ? `<div class="fc-plans">${cal.plans.map(planBlock).join('')}${legendHTML()}</div>` : '<div class="rv-notread" role="status"><p>The plans have not been read yet, so the ground is not drawn. Crophalo never shows a made-up plan.</p></div>'}
    ${sowingHTML(cal.sowing)}</section>`;
}
