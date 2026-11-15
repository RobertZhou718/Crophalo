// Crophalo's money and pest cards of the Satellites & prices tab: the world price of each crop in the plan (World Bank Pink Sheet), what farmers in the field's country were paid at the farm gate (FAOSTAT), and which crops the country grows most (FAOSTAT area).
// And the pests card, which says plainly that pest records are not read yet. Every card names its source and year; a lookup that did not answer gives a plain "could not read" line, never a made-up figure. Pure: no page, no network.
// The answers are the server's own (/api/prices and /api/faostat, already asked for the money line); the markup is wrapped by js/satellites-view.js. Checked by scripts/test_prices_cards.mjs on the answers recorded from both services.
import { esc } from './words.js';
import { cropName } from './crops.js';
import { monthWords } from './sales.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const name = id => { try { return cropName(id, true) || String(id); } catch { return String(id); } };
const usd = v => `US$${Math.round(v).toLocaleString('en-US')}`;
const million = v => `${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1).replace(/\.0$/, '')} million`;
export const DOWN = 'The lookup did not answer just now, so nothing is shown here. Nothing was filled in.';
const reading = '<p class="cap" role="status" aria-live="polite">Reading this from the world price and crop lookups…</p>';
const bad = (after, reason) => `<p class="rv-notread"><b>Could not be read.</b> ${esc(reason || DOWN)}${after ? ` ${esc(after)}` : ''}</p>`;
const quiet = text => `<p class="cap">${esc(text)}</p>`;

// 1. The world price of each crop of the plan: the newest month, the same month a year ago, and the change. A series marked stale says so.
export function priceBody(prices, crops) {
  if (prices === undefined) return reading;
  if (!prices || prices.ok === false) return bad('Ask your buyer for your own price.', prices?.reason);
  const rows = crops.map(id => {
    const s = prices.series && Object.hasOwn(prices.series, id) ? prices.series[id] : null, l = s?.latest;
    if (!s || !fin(l?.value)) return `<li><b>${esc(name(id))}:</b> no world price series for this crop.</li>`;
    const ago = s.year_ago && fin(s.year_ago.value) && fin(s.change_pct) ? `, ${s.change_pct >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(s.change_pct))} in 100 from ${monthWords(s.year_ago.month)} (${usd(s.year_ago.value)})` : '';
    return `<li><b>${esc(name(id))}:</b> ${usd(l.value)} ${esc(String(s.unit_words ?? '').replace(/^US\$ /, '').toLowerCase() || 'per tonne')} in ${esc(monthWords(l.month))}${ago}${s.stale ? ' (this series ended earlier: its newest month is shown)' : ''}.</li>`;
  });
  return `<ul class="pc-list">${rows.join('')}</ul>${quiet(`World Bank Pink Sheet${prices.data_date ? `, newest month ${monthWords(prices.data_date)}` : ''}. These are world prices in US dollars, not your buyer's price: ask your buyer for your own.`)}`;
}
const countryOf = (faostat, cc) => (cc && faostat?.countries && Object.hasOwn(faostat.countries, cc) ? faostat.countries[cc] : null);
// 2. What farmers in the country were paid at the farm gate, per crop, with the year of each figure.
export function paidBody(faostat, cc, crops) {
  if (faostat === undefined) return reading;
  if (!faostat || faostat.ok === false) return bad('', faostat?.reason);
  if (!cc) return quiet('The country of this field is not known, so national figures are not shown.');
  const c = countryOf(faostat, cc);
  if (!c) return quiet(`FAOSTAT has no crop figures for the country with code ${String(cc).slice(0, 3)}.`);
  const rows = crops.map(id => { const p = c.price && Object.hasOwn(c.price, id) ? c.price[id] : null; return fin(p?.[0]) ? `<li><b>${esc(name(id))}:</b> ${usd(p[0])} a tonne in ${esc(String(p[1]))}.</li>` : `<li><b>${esc(name(id))}:</b> no farm-gate price reported.</li>`; });
  return `<ul class="pc-list">${rows.join('')}</ul>${quiet(`FAOSTAT Producer Prices, ${c.name}: the national average paid to farmers, in US dollars. Not your field's, and not today's.`)}`;
}
// 3. What the country grows: the five crops with the most land, from FAOSTAT's area.
export function grownBody(faostat, cc, units = {}) {
  if (faostat === undefined) return reading;
  if (!faostat || faostat.ok === false) return bad('', faostat?.reason);
  if (!cc) return quiet('The country of this field is not known, so national figures are not shown.');
  const c = countryOf(faostat, cc);
  if (!c) return quiet(`FAOSTAT has no crop figures for the country with code ${String(cc).slice(0, 3)}.`);
  const top = Object.entries(c.area ?? {}).filter(([, v]) => fin(v) && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!top.length) return quiet(`FAOSTAT lists no crop area for ${c.name}.`);
  const area = v => (units.area === 'imperial' ? `${million(v * 2.4710538147)} acres` : `${million(v)} ha`);
  return `<ul class="pc-list">${top.map(([id, v]) => `<li><b>${esc(name(id))}:</b> ${esc(area(v))}</li>`).join('')}</ul>${quiet(`FAOSTAT, ${c.name}: land in each crop, the average of ${(faostat.years ?? []).join(', ') || faostat.data_date || 'recent years'}. The whole country, not your area.`)}`;
}
export const PESTS_WORDS = 'Pest records are not read yet. Few people report pests, so ask your neighbours or a farm adviser what is in your area.';
// The four cards, ready for the tab to wrap: { id, title, keys, body }.
export function priceCards({ prices, faostat, country = '', crops = [], units = {} } = {}) {
  const cc = String(country ?? '').toUpperCase(), ids = [...new Set(crops)].slice(0, 6), countryName = countryOf(faostat, cc)?.name ?? '';
  return [
    { id: 'prices', title: 'World crop prices', keys: ['worldbank'], body: priceBody(prices, ids) },
    { id: 'paid', title: `What farmers ${countryName ? `in ${countryName}` : 'in your country'} were paid`, keys: ['fao'], body: paidBody(faostat, cc, ids) },
    { id: 'grown', title: `What farmers ${countryName ? `in ${countryName}` : 'in your country'} grow`, keys: ['fao'], body: grownBody(faostat, cc, units) },
    { id: 'pests', title: 'Pests reported nearby', keys: ['gbif'], body: `<p class="rv-notread"><b>Not read yet.</b> ${esc(PESTS_WORDS)}</p>` },
  ];
}
