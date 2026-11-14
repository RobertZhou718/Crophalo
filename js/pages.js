// Crophalo's info pages, as far as they are built: the Data page lists every source the app uses, built from the source table (never by hand), with the one line
// that says which NASA data Crophalo uses and that NASA does not stand behind it, and a link to the full credit.
// Pure: dataPageHTML(). renderInfo() writes it into the info view. The other pages (Privacy, Limitations, Settings) are not built yet and say so.
// Checked by scripts/test_report.mjs (the NASA line, the link, one entry per source in the table, NASA first, plain-text escaping).
import { esc } from './words.js';
import { SOURCES, NASA_LINE, NASA_CREDIT_PAGE } from './sources.js';
import './sources.more.js';
import { srcButton } from './srci.js';

// Every source in the table, NASA first, then the others by name. Each with who runs it, what it is and its "i".
export function dataPageHTML(table = SOURCES) {
  const list = Object.entries(table).map(([key, n]) => ({ key, ...n })).sort((a, b) => Number(b.nasa) - Number(a.nasa) || a.name.localeCompare(b.name));
  return `<p class="lead" id="nasaLine">${esc(NASA_LINE)} <a href="${esc(NASA_CREDIT_PAGE)}" target="_blank" rel="noopener noreferrer">Read how Crophalo uses it<span class="sr"> (opens in a new tab)</span></a></p>
    <h2>Where the numbers come from</h2>
    <p class="lead">Every figure in Crophalo that comes from outside carries an “i” button. It opens a card that says who runs the source and what the figure is. NASA’s come first.</p>
    <ul class="gl data-sources">${list.map(n => `<li class="row"><span><b>${esc(n.name)}</b>${n.nasa ? ' <span class="src nasa">NASA</span>' : ` <span class="src">${esc(n.org)}</span>`}<br><span class="cap">${esc(n.what)}</span><br><span class="cap">Run by ${esc(n.who)}.</span></span>${srcButton([n.key], '')}</li>`).join('')}</ul>`;
}
const LATER = { privacy: 'Privacy', limits: 'Limitations', settings: 'Settings' };
export function renderInfo(page, root = document.getElementById('infoBody')) {
  if (!root) return;
  root.innerHTML = page === 'data' ? dataPageHTML() : `<div class="rv-notread"><p><b>Not built yet.</b> The ${esc(LATER[page] ?? 'page')} page is still to come.</p></div>`;
}
