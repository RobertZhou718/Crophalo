// The Fields table: one row per field with its size, this season's crop, water and fit, filters, a search box over eight fields, sorting, totals.
// The filtering, sorting and totals are pure and tested; the page part takes one env object and draws into the node it is given.
// Checked by scripts/test_sim.mjs (the pure parts) and scripts/e2e_farm.mjs (the table in a browser).
import { esc } from './words.js';
import { areaWords } from './farmunits.js';
import * as S from './simulate.js';

export const FILTERS = Object.freeze([['all', 'All'], ['ready', 'Ready to plant'], ['look', 'Needs a look']]);
export const COLUMNS = Object.freeze([['name', 'Field'], ['ha', 'Size'], ['crop', 'This season'], ['fit', 'Fit']]);
export const SEARCH_FROM = 8;   // above this many fields a search box joins the filters

export const needsLook = r => r.fit.state === 'needs-soil' || (r.fit.state === 'scored' && r.fit.score < 50);
export const isReady = r => r.kind === 'rot' && !r.crop;
export function filterRows(rows, filter = 'all', query = '') {
  const q = String(query).trim().toLowerCase();
  return rows.filter(r => (filter === 'ready' ? isReady(r) : filter === 'look' ? needsLook(r) : true) && (!q || r.name.toLowerCase().includes(q)));
}
export function sortRows(rows, key = 'name', dir = 1, cropName = id => id || '') {
  const val = r => key === 'ha' ? r.ha : key === 'crop' ? cropName(r.crop).toLowerCase() : key === 'water' ? r.water || '' : key === 'fit' ? (r.fit.state === 'scored' ? r.fit.score : -1) : 0;
  return [...rows].sort((a, b) => key === 'name' ? dir * S.naturalCompare(a.name, b.name) : (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : S.naturalCompare(a.name, b.name)) * dir);
}
export function totals(rows) {
  const rot = rows.filter(r => r.kind === 'rot');
  return { ha: Math.round(rows.reduce((s, r) => s + r.ha, 0) * 100) / 100, planted: rot.filter(r => r.crop).length, rot: rot.length };
}
export const countLine = (shown, all) => `${shown} of ${all} fields`;

let st = { filter: 'all', query: '', key: 'name', dir: 1 };
export const tableState = st;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export function renderFields(env) {
  const { farm } = env.get(), node = env.node, rows = S.fieldRows(farm), shown = sortRows(filterRows(rows, st.filter, st.query), st.key, st.dir, env.cropName), t = totals(rows);
  const cell = r => r.kind === 'garden' ? `${cap(env.cropName(r.tree))}, trees` : r.crop ? cap(env.cropName(r.crop)) : 'Not planted';
  node.innerHTML = `<div class="fw-panel-head"><div><h2 id="fwPanelTitle" tabindex="-1">Fields of ${esc(farm.name)}</h2><p class="fw-sub">${rows.length ? `${rows.length} field${rows.length === 1 ? '' : 's'}, ${areaWords(t.ha)}` : 'No fields yet'}</p></div><button type="button" class="btn lg" id="fwClose">Close</button></div>
  ${rows.length ? `<div class="fw-chips" role="group" aria-label="Show">${FILTERS.map(([id, label]) => `<button type="button" class="fw-chipb" data-filter="${id}" aria-pressed="${st.filter === id}">${label}</button>`).join('')}</div>
  ${rows.length > SEARCH_FROM ? `<label for="fwFind" class="fw-small">Find a field</label><input id="fwFind" class="fw-input" type="search" placeholder="Type part of a name" value="${esc(st.query)}" autocomplete="off"><p class="fw-sub" role="status" id="fwCount">${countLine(shown.length, rows.length)}</p>` : ''}
  ${shown.length ? `<div class="fw-sortby"><label for="fwSortBy" class="fw-small">Sort by</label><select id="fwSortBy" class="fw-select">${COLUMNS.map(([k, l]) => `<option value="${k}" ${st.key === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <div class="fw-tablewrap" tabindex="0" role="region" aria-label="Fields table"><table class="fw-table"><thead><tr>${COLUMNS.map(([k, l]) => `<th scope="col" aria-sort="${st.key === k ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="fw-sortb" data-sort="${k}">${l}</button></th>`).join('')}<th scope="col"><span class="sr">Actions</span></th></tr></thead>
  <tbody>${shown.map(r => `<tr><th scope="row">${esc(r.name)}</th><td data-label="Size">${areaWords(r.ha)}</td><td data-label="This season">${esc(cell(r))}</td><td data-label="Fit">${esc(r.fit.state === 'unread' ? '–' : r.fit.words)}</td><td><button type="button" class="btn lg" data-open="${esc(r.id)}" aria-label="Open ${esc(r.name)}">Open</button></td></tr>`).join('')}</tbody>
  <tfoot><tr><th scope="row">Total</th><td>${areaWords(t.ha)}</td><td colspan="2">${t.planted} of ${t.rot} planted</td><td></td></tr></tfoot></table></div>` : '<p>No field matches this filter.</p>'}` : '<p>No fields yet. Add the first one.</p>'}
  <div class="fw-actions"><button type="button" class="btn lg primary" data-add>Add a field</button></div>`;
  node.querySelector('#fwClose').onclick = () => env.close();
  for (const b of node.querySelectorAll('[data-filter]')) b.onclick = () => { st.filter = b.dataset.filter; renderFields(env); node.querySelector(`[data-filter="${st.filter}"]`)?.focus(); };
  for (const b of node.querySelectorAll('[data-sort]')) b.onclick = () => { st.dir = st.key === b.dataset.sort ? -st.dir : 1; st.key = b.dataset.sort; renderFields(env); node.querySelector(`[data-sort="${st.key}"]`)?.focus(); env.say(`Sorted by ${COLUMNS.find(c => c[0] === st.key)[1].toLowerCase()}, ${st.dir > 0 ? 'ascending' : 'descending'}.`); };
  const by = node.querySelector('#fwSortBy'); if (by) by.onchange = () => { st.key = by.value; st.dir = 1; renderFields(env); node.querySelector('#fwSortBy')?.focus(); env.say(`Sorted by ${COLUMNS.find(c => c[0] === st.key)[1].toLowerCase()}.`); };
  for (const b of node.querySelectorAll('[data-open]')) b.onclick = () => env.open(b.dataset.open);
  node.querySelector('[data-add]').onclick = () => env.add();
  const find = node.querySelector('#fwFind');
  if (find) find.oninput = () => { st.query = find.value; const at = find.selectionStart; renderFields(env); const f2 = node.querySelector('#fwFind'); f2.focus(); f2.setSelectionRange(at, at); };
}
export const resetTable = () => { st.filter = 'all'; st.query = ''; st.key = 'name'; st.dir = 1; };
