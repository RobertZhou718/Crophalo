// Crophalo's USDA Market News lines, as pure markup: one line on each strategy card, a second line in the "Income and market" cell of the side by side table,
// the strategy detail's evidence, gaps and risks, the fold "Each region" and the credit lines, and the Layers card. The sentences come from js/market-data.js.
// Pure: plain data in, text out. Nothing is read from the page, nothing is drawn here. Checked by scripts/test_market.mjs.
import { esc } from './words.js';
import { marketFor, layerFor, creditLine, WORDS } from './market-data.js';
const sentences = t => String(t ?? '').split(/(?<=[.!?])\s+(?=[A-Z\u201c"])/).map(x => x.trim()).filter(Boolean);   // a full stop, question or exclamation mark and a capital: a number such as 3.95 never splits

export { creditLine };
// The words of the "i" source card and of the Layers card (part 5 of the specification), kept here so the source list and the map card can take them as they are.
export const AMS_SOURCE_WORDS = Object.freeze({
  name: 'USDA Market News prices',
  who: 'The USDA Agricultural Marketing Service, Market News',
  what: 'Bids that buyers reported on one day, by region, in the state of the field or the nearest state with a live report. Used only for fields in the United States.',
  talk: 'Market News reporters gather the prices buyers bid, by region. A bid is a price on a day at a place. It is not what you will be paid: your price, yield and costs differ. Crophalo shows these bids as evidence beside its scores and never puts them into a score. USDA Market News data is a work of the United States Government, in the public domain in the United States. Some reports are issued with a state department of agriculture, named on each line. Crophalo is not made, reviewed or endorsed by USDA or NASA.',
  url: 'https://mymarketnews.ams.usda.gov',
});
export const LAYER_CARD_WORDS = Object.freeze({
  credit: 'USDA Agricultural Marketing Service, Market News (mymarketnews.ams.usda.gov). Not made, reviewed or endorsed by USDA.',
  licence: 'U.S. Government work, public domain in the United States (the Market News terms of use are to be read before the site is public)',
});
export const REGIONS_TITLE = 'Each region';

// The fold "Each region": groups of { heading, lines }, one line per region and crop. A summary at least 44 px tall (css/market.css).
export function regionsFoldHTML(groups) {
  const list = (Array.isArray(groups) ? groups : []).filter(g => g && Array.isArray(g.lines) && g.lines.length);
  if (!list.length) return '';
  const count = list.reduce((n, g) => n + g.lines.length, 0);
  return `<details class="fold-card mk-fold"><summary><span class="t">${esc(REGIONS_TITLE)} <span class="count soft">${count}</span></span></summary><div class="fold-b">${list.map(g => `<div class="mk-region"><h5>${esc(g.heading)}</h5><ul class="cap mk-list">${g.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('')}</div></details>`;
}
const creditsHTML = credits => (Array.isArray(credits) && credits.length ? `<div class="mk-credits">${credits.map(c => `<p class="cap mk-credit">${esc(c)}</p>`).join('')}</div>` : '');

// One hook for the report's three places. where: 'card' (the strategy card), 'cell:<row key>' (only the "market" row draws), 'note:table' (nothing in this tier), 'detail' (the region fold and the credit lines).
// market: cur.market (undefined, { loading: true }, { ok: false } or the server's answer). near: the engine's crop-map answer (its `absent` list), or nothing.
export function marketLineHTML(market, plan, where = 'card', result = null, near = null) {
  const m = marketFor(market, plan, result, near);
  if (!m) return '';
  if (where === 'card') return m.card ? `<span class="cap mk-line mk-card">${esc(m.card)}</span>` : '';
  if (where === 'cell:market') return m.cell ? `<span class="cap mk-line mk-cell">${esc(m.cell)}</span>` : '';
  if (where === 'detail') return m.failed ? '' : `${regionsFoldHTML(m.regions)}${creditsHTML(m.credits)}`;
  return '';
}
// The lines the strategy detail adds to "What evidence supports it" ({ text, sources }), "Where information is missing" and "Risks to check locally" (plain text: the detail escapes them).
export function marketListsFor(market, plan, result = null, near = null) {
  const m = marketFor(market, plan, result, near);
  return m ? { evidence: m.evidence, gaps: m.gaps, risks: m.risks } : { evidence: [], gaps: [], risks: [] };
}
// The Layers card "Local cash prices (USDA Market News)": answer is the server's answer, or { ok: false, reason } when it could not be read.
export function layerCardHTML(answer) {
  const l = layerFor(answer);
  if (!l) return '';
  if (l.failed) return `<p class="cap" role="status">${esc(l.line)}</p>`;
  // what the farmer gets first, at most four short sentences, then "A bid, not your price."; the rest, the report numbers, markets and dates (the credit lines) under Show more
  const shown = [], rest = []; let n = 0;
  for (const t of l.lines) { const k = sentences(t).length; if (n + k <= 4 || !shown.length) { shown.push(t); n += k; } else rest.push(t); }
  const more = rest.length || l.credits.length ? `<details class="fold mapx-more"><summary>Show more</summary>${rest.length ? `<ul class="cap mk-list">${rest.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}${creditsHTML(l.credits)}</details>` : '';
  return `${l.bid ? `<p class="wk-big mk-first">${esc(WORDS.first)}</p>` : ''}<ul class="cap mk-list">${shown.map(t => `<li>${esc(t)}</li>`).join('')}</ul>${l.bid ? `<p class="cap"><b>${esc(l.bid)}</b></p>` : ''}${more}`;
}
