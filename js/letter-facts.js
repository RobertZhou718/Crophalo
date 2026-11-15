// Crophalo's "More about your field" in plain lines: the weather record, what the NASA satellites see and the crop prices, each a single line with its figure, its date and its source. No chart and no picture:
// the numbers are the ones the old tabs drew, said in words and in the farmer's units. A line that could not be read is left out and one plain sentence says what is missing; nothing is filled in.
// Pure: markup from plain data. Checked by scripts/test_letter.mjs (every line, the units, a missing lookup) and scripts/e2e_letter.mjs.
import { esc } from './words.js';
import { fmtRain, fmtTemp, BUSHEL_LB } from './units.js';
import { dateWord } from './climate.js';
import { infoButton } from './report-view.js';
import { monthWords } from './sales.js';
import { cropName } from './crops.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const li = (text, keys, what) => `<li>${esc(text)} ${keys?.length ? infoButton(keys, what || text) : ''}</li>`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? ''); return m ? `${+m[3]} ${MON[+m[2] - 1]}` : ''; };
const miss = text => `<p class="cap">${esc(text)}</p>`;

// 1. the weather record: one figure for the closed line, four lines inside
export function climateFacts(w, u) {
  const C = w?.C, F = w?.F;
  if (!w?.ok || !C) return { head: 'Weather here since 2001', body: miss('The weather record could not be read, so nothing is shown here.') };
  const rain = C.med?.P, frost = F && fin(F.last) && fin(F.first) ? [dateWord(F.last), dateWord(F.first)] : null, hot = C.med?.heat32, dry = C.dryOf > 0 ? `${C.dryYears.length} of ${C.dryOf}` : '';
  const head = fin(rain) ? `Weather here since ${w.first ?? 2001} · ${fmtRain(rain, u)} of rain in a normal year` : `Weather here since ${w.first ?? 2001}`;
  const lines = [fin(rain) ? li(`Rain in a normal year: ${fmtRain(rain, u)}.`, ['power']) : '', frost ? li(`Frost: the last in spring is about ${frost[0]}, the first in fall about ${frost[1]}.`, ['power']) : '',
    fin(hot) ? li(`Hot days of ${u?.temp === 'F' ? '90 °F' : '32 °C'} or more: about ${Math.round(hot)} a year.`, ['power']) : '', dry ? li(`Dry years: ${dry}.`, ['power']) : ''].filter(Boolean);
  const area = u?.area === 'imperial' ? 'about 30 miles wide' : 'about 56 by 52 km';
  return { head, body: `<p class="cap">For an area ${area} around your field. A rain gauge near you is more exact.</p><ul class="lf-list">${lines.join('')}</ul><p class="cap">From NASA POWER, ${w.first}–${w.last}. ${infoButton(['power'], 'the weather record')}</p>` };
}

// 2. what the satellites see: the lines that were read, then one sentence for each that was not
export function satelliteFacts({ reading, imerg, hls, grace, eco }, u) {
  const lines = [], more = [], lacking = [];
  const soil = reading?.value != null && fin(Number(reading.value)) ? Math.round(Number(reading.value) * 100) : null;
  if (soil !== null) lines.push(li(`Water in the top soil: ${soil}%${day(reading.date) ? ` on ${day(reading.date)}` : ''}. From NASA SMAP`, ['smap']));
  else if (reading !== undefined && !(reading && reading.loading)) lacking.push('The soil water reading did not answer.');
  if (imerg?.ok && imerg.read) lines.push(li(`Rain in the last ${imerg.days?.length ?? 30} days: ${fmtRain(imerg.total, u)}${imerg.newest ? `, to ${day(imerg.newest)}` : ''}. From NASA GPM`, ['gpm']));
  else if (imerg && !imerg.loading) lacking.push('The satellite rain did not answer.');
  const pass = hls?.ok ? [...(hls.passes ?? [])].filter(p => fin(p.ndvi)).sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
  if (pass) lines.push(li(`How green the plants are: ${pass.ndvi.toFixed(2)} of 1, on ${day(pass.date)}. From NASA and USGS HLS`, ['hls']));
  else if (hls && !hls.loading) lacking.push('The plant greenness did not answer.');
  const months = grace?.ok ? (grace.months ?? []).filter(m => fin(m.cm)) : [];
  if (months.length > 3) { const last = months.at(-1), mean = months.reduce((s, m) => s + m.cm, 0) / months.length; lines.push(li(`Water stored deep under your region: ${last.cm > mean ? 'higher' : 'lower'} than usual, ${monthWords(last.month)}. From NASA GRACE-FO`, ['grace'])); }
  else if (grace && !grace.loading) lacking.push('The deep water record did not answer.');
  const ep = eco?.ok ? [...(eco.passes ?? [])].filter(p => fin(p.lst_c)).sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
  if (ep) more.push(li(`Ground temperature from space: ${fmtTemp(ep.lst_c, u)}, ${day(ep.date)}. It is the ground, not the air. From NASA ECOSTRESS`, ['ecostress']));
  else if (eco && !eco.loading) lacking.push('The ground temperature did not answer.');
  const loading = [reading, imerg, hls, grace, eco].some(x => x === undefined || x?.loading);
  const head = soil !== null ? `What NASA satellites see · water in the top soil ${soil}%` : 'What NASA satellites see';
  const body = `${lines.length ? `<ul class="lf-list">${lines.join('')}</ul>` : ''}${more.length ? `<details class="fold-card" id="lfSatMore"><summary><span class="t">Show more</span></summary><div class="fold-b"><ul class="lf-list">${more.join('')}</ul></div></details>` : ''}${loading && !lines.length ? '<p class="cap" role="status" aria-live="polite">Reading the satellite lookups…</p>' : ''}${lacking.map(miss).join('')}`;
  return { head, body };
}

// 3. prices: world prices in the farmer's units (US dollars a bushel for a field in the United States)
export function priceFacts({ prices, crops, units }) {
  if (prices === undefined) return { head: 'Crop prices', body: '<p class="cap" role="status" aria-live="polite">Reading the world prices…</p>' };
  if (!prices || prices.ok === false) return { head: 'Crop prices', body: miss('The world prices did not answer, so no price is shown.') };
  const us = units?.area === 'imperial', rows = [], seen = new Set();
  let headFigure = '';
  for (const id of crops ?? []) {
    if (seen.has(id)) continue; seen.add(id);
    const s = prices.series && Object.hasOwn(prices.series, id) ? prices.series[id] : null, v = s?.latest?.value;
    if (!fin(v)) continue;
    const bu = us && BUSHEL_LB[id] ? v / (2204.62 / BUSHEL_LB[id]) : null, name = cropName(id, true) || id, figure = bu !== null ? `$${bu.toFixed(2)} a bushel` : `US$${Math.round(v)} a tonne`;
    if (!headFigure) headFigure = `${name.toLowerCase()} about ${figure}`;
    rows.push(li(`${name}: about ${figure} in ${monthWords(s.latest.month)}.`, ['worldbank']));
  }
  return { head: headFigure ? `Crop prices · ${headFigure}` : 'Crop prices', body: rows.length ? `<ul class="lf-list">${rows.join('')}</ul><p class="cap">These are world prices, not your buyer’s price. From the World Bank Pink Sheet. ${infoButton(['worldbank'], 'world prices')}</p>` : miss('No world price is listed for these crops.') };
}
