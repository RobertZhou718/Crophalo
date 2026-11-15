// Crophalo's info pages: the Data page lists every source in the source table, built from that table (never by hand), with the one line that says which NASA data
// Crophalo uses and that NASA does not stand behind it, and a link to the full credit. Privacy, Limitations and Settings are drawn by js/pages-info.js.
// Pure: dataPageHTML(). renderInfo() writes the page asked for into the info view.
// Checked by scripts/test_report.mjs (the NASA line, the link, one entry per source in the table, NASA first, plain-text escaping).
import { pageStyle } from './page-style.js';
import { esc } from './words.js';
import { SOURCES, NASA_LINE, NASA_USE, NASA_CREDIT } from './sources.js';
import './sources.more.js';
import { renderInfoAll } from './pages-info.js';

// Every source in the table on three tabs: NASA data, Other sources, How it fits together. Each source with who runs it, what it is, what it means for the field, a link to visit and a "Show more". A filter narrows the lists as you type.
export const DATA_TABS = Object.freeze([{ id: 'nasa', label: 'NASA data' }, { id: 'other', label: 'Other sources' }, { id: 'fit', label: 'How it fits together' }]);
const sentencesOf = t => String(t ?? '').split(/(?<=[.!?])\s+(?=[A-Z0-9“‘])/).filter(Boolean);
// A source in four short sentences at most (what it is, then what it means for your field), one link, and "Show more" for who runs it and the rest.
const row = n => { const talk = sentencesOf(n.talk), now = talk.slice(0, 2), later = talk.slice(2), link = /^https:\/\//.test(n.url ?? '') || (!n.nasa && /^\.\/#[a-z]+$/.test(n.url ?? ''));   // a note of Crophalo's own links to one of its own pages (./#limits)
  return `<li class="row"><div class="src-body"><div class="src-head"><b>${esc(n.name)}</b>${n.nasa ? ' <span class="src nasa">NASA</span>' : ` <span class="src">${esc(n.org)}</span>`}</div><p>${esc(n.what)}</p>${now.length ? `<p class="cap">${esc(now.join(' '))}</p>` : ''}${link ? `<p class="cap"><a class="link" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">Visit ${esc(n.name)}<span class="sr"> (opens in a new tab)</span></a></p>` : ''}<details class="data-fold"><summary>Show more</summary><p class="cap">Run by ${esc(n.who)}.</p>${later.length ? `<p class="cap">${esc(later.join(' '))}</p>` : ''}</details></div></li>`; };
export const FIT_STEPS = Object.freeze([
  ['You say where the field is and what you grow.', 'Crophalo keeps only a position, rounded as each service is asked, and your answers. They stay on this device.'],
  ['Crophalo reads the field’s own weather record.', 'NASA POWER gives every day since 2001 for the square round the field. If it does not answer, a second record (Open-Meteo ERA5) is used and the report says so.'],
  ['Satellites add what they can see.', 'NASA SMAP, GPM IMERG, GRACE-FO, ECOSTRESS and HLS are read for the square, strip or pixel that holds the field. Each is shown as what it is: regional or recent, never a measurement inside the field.'],
  ['Crophalo’s own rules judge each crop against that record.', 'The rules are written in plain words and name their sources. The report counts the past years that crossed a limit. It gives counts, never a chance.'],
  ['You decide.', 'A suggestion is a guide with its reason, its evidence, what is missing and what to check locally. Ask a farm adviser or farmers near you before you change your rotation.'],
]);
export function dataPageHTML(table = SOURCES) {
  const list = Object.entries(table).map(([key, n]) => ({ key, ...n })).sort((a, b) => Number(b.nasa) - Number(a.nasa) || a.name.localeCompare(b.name)), nasa = list.filter(n => n.nasa), other = list.filter(n => !n.nasa);
  const count = { nasa: nasa.length, other: other.length };
  return `<p class="data-note" id="nasaLine">${esc(NASA_LINE)}</p>
    <details class="data-fold data-nasa" id="nasaUse"><summary>How Crophalo uses NASA data</summary>${NASA_USE.map(([n, what, does]) => `<p><b>${esc(n)}.</b> ${esc(what)}</p><p class="cap">${esc(does)}</p>`).join('')}<p class="cap">${esc(NASA_CREDIT)}</p></details>
    <h2>Where the numbers come from</h2>
    <div class="data-filter"><label class="field"><span>Find a source</span><input type="search" id="srcFilter" autocomplete="off" placeholder="e.g. rain, soil, price"></label><p class="cap" id="srcCount" role="status" aria-live="polite"></p></div>
    <div class="pg-tabs" role="tablist" aria-label="Kinds of source">${DATA_TABS.map((t, i) => `<button type="button" role="tab" class="tab" id="srctab-${t.id}" aria-selected="${i === 0}" aria-controls="srcpanel-${t.id}" tabindex="${i === 0 ? 0 : -1}">${esc(t.label)}${count[t.id] != null ? ` <span class="count soft">${count[t.id]}</span>` : ''}</button>`).join('')}</div>
    <div role="tabpanel" id="srcpanel-nasa" aria-labelledby="srctab-nasa" tabindex="0"><ul class="gl data-sources">${nasa.map(row).join('')}</ul><p class="cap data-none" hidden>No NASA source matches.</p></div>
    <div role="tabpanel" id="srcpanel-other" aria-labelledby="srctab-other" tabindex="0" hidden><ul class="gl data-sources">${other.map(row).join('')}</ul><p class="cap data-none" hidden>No other source matches.</p></div>
    <div role="tabpanel" id="srcpanel-fit" aria-labelledby="srctab-fit" tabindex="0" hidden><h3>How a suggestion is made</h3><ol class="data-fit">${FIT_STEPS.map(([h, t]) => `<li><b>${esc(h)}</b> ${esc(t)}</li>`).join('')}</ol>
      <p class="cap">${nasa.length} of the ${list.length} sources here are NASA’s. The others are named for what they are, and each says who runs it.</p></div>`;
}
// The tabs move with the arrow keys, Home and End; the filter narrows both lists by what was typed and says how many match.
export function wireDataPage(root = document) {
  const tabs = [...root.querySelectorAll('[role=tab][id^="srctab-"]')]; if (!tabs.length) return;
  const show = tab => { for (const t of tabs) { const on = t === tab; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; root.querySelector(`#${t.getAttribute('aria-controls')}`).hidden = !on; } };
  for (const t of tabs) t.addEventListener('click', () => show(t));
  root.querySelector('[role=tablist][aria-label="Kinds of source"]')?.addEventListener('keydown', event => {
    const at = tabs.indexOf(document.activeElement), k = event.key; if (at < 0 || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(k)) return;
    event.preventDefault(); const to = k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : (at + (k === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; show(tabs[to]); tabs[to].focus();
  });
  const input = root.querySelector('#srcFilter'), say = root.querySelector('#srcCount');
  input?.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase(); let nasa = 0, other = 0;
    for (const li of root.querySelectorAll('.data-sources .row')) { const hit = !q || li.textContent.toLowerCase().includes(q); li.hidden = !hit; if (hit) { if (li.closest('#srcpanel-nasa')) nasa++; else other++; } }
    for (const [id, n] of [['nasa', nasa], ['other', other]]) { const none = root.querySelector(`#srcpanel-${id} .data-none`); if (none) none.hidden = !q || n > 0; }
    say.textContent = q ? `${nasa + other} ${nasa + other === 1 ? 'source matches' : 'sources match'}: ${nasa} from NASA, ${other} other.` : '';
  });
}
export function renderInfo(page, root = document.getElementById('infoBody')) {
  if (!root) return;
  if (page !== 'data' && renderInfoAll(page)) return;
  if (page === 'data') pageStyle('css/pages.css', root);
  root.innerHTML = page === 'data' ? dataPageHTML() : `<div class="rv-notread"><p><b>This page could not be drawn.</b> Reload the page to try again.</p></div>`;   // only if its module failed to load: every page in the menu is drawn above
  if (page === 'data') wireDataPage(root);
}
