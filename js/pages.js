// Crophalo's info pages: the Data page lists every source the app uses, built from the source table (never by hand), with the one line that says which NASA data
// Crophalo uses and that NASA does not stand behind it, and a link to the full credit. Privacy, Limitations and Settings are drawn by js/pages-info.js.
// Pure: dataPageHTML(). renderInfo() writes the page asked for into the info view.
// Checked by scripts/test_report.mjs (the NASA line, the link, one entry per source in the table, NASA first, plain-text escaping).
import { esc } from './words.js';
import { SOURCES, NASA_LINE, NASA_CREDIT_PAGE } from './sources.js';
import './sources.more.js';
import { srcButton } from './srci.js';
import { renderInfoAll } from './pages-info.js';

// Every source in the table, NASA first, then the others by name. Each with who runs it, what it is and its "i".
export function dataPageHTML(table = SOURCES) {
  const list = Object.entries(table).map(([key, n]) => ({ key, ...n })).sort((a, b) => Number(b.nasa) - Number(a.nasa) || a.name.localeCompare(b.name));
  return `<p class="data-note" id="nasaLine">${esc(NASA_LINE)} <a href="${esc(NASA_CREDIT_PAGE)}" target="_blank" rel="noopener noreferrer">Read how Crophalo uses it<span class="sr"> (opens in a new tab)</span></a></p>
    <h2>Where the numbers come from</h2>
    <ul class="gl data-sources">${list.map(n => `<li class="row"><div class="src-body"><div class="src-head"><b>${esc(n.name)}</b>${n.nasa ? ' <span class="src nasa">NASA</span>' : ` <span class="src">${esc(n.org)}</span>`}</div><p class="cap">${esc(n.what)}</p><p class="cap">Run by ${esc(n.who)}.</p></div>${srcButton([n.key], '')}</li>`).join('')}</ul>`;
}
export function renderInfo(page, root = document.getElementById('infoBody')) {
  if (!root) return;
  if (page !== 'data' && renderInfoAll(page)) return;
  root.innerHTML = page === 'data' ? dataPageHTML() : `<div class="rv-notread"><p><b>This page could not be drawn.</b> Reload the page to try again.</p></div>`;   // only if its module failed to load: every page in the menu is drawn above
}
