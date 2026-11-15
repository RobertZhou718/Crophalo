// Crophalo's crop chooser: a button that shows the chosen crop, and under it a small panel with a search box, group tabs and the list of
// crops with their pictures. It replaces every <select data-picker> the wizard draws; the select stays underneath for forms and scripts.
// Pure: pickList(). The rest changes the page. Whether a crop suits this spot is a join (suitFor), empty until the engine is in.
// Checked by scripts/test_wizard.mjs (the list) and scripts/e2e_flow.mjs (open, search, choose, keys, focus back).
import { esc, GROUP_WORDS } from './words.js';
import { CROPS, GARDENS, GROUPS, cropName, cropsOfGroup, gardenIds, findCrops } from './crops.js';
import { cropPic } from './pics.js';

export const ALL = 'all', TREES = 'trees', REST = 'rest';   // REST is the cover crops and fallow together, as the crop table's own words call both "Rest"
export const suitFor = () => null;   // join: 'near' | 'water' | 'climate' for a crop at this spot, once the engine can say; until then nothing is marked

// The crops the chooser may list: null means all of them. Set when the setup offers only a national list (see js/cropstep.js); cover crops and fallow are always allowed.
let offer = null;
export const setOffer = ids => { offer = Array.isArray(ids) ? ids : null; };
const allowed = id => !offer || offer.includes(id) || (id in CROPS && (CROPS[id].group === 'cover' || CROPS[id].group === 'fallow'));
// The crops to list for what was typed and the tab chosen: ids, field crops first, in table order.
export function pickList(text = '', group = ALL) {
  const typed = String(text).trim(), found = typed ? findCrops(typed) : [...Object.keys(CROPS), ...gardenIds()];
  if (group === ALL) return found.filter(allowed);
  if (group === TREES) return offer ? [] : found.filter(id => id in GARDENS);
  if (group === REST) return found.filter(id => id in CROPS && (CROPS[id].group === 'cover' || CROPS[id].group === 'fallow'));
  return found.filter(id => id in CROPS && CROPS[id].group === group && allowed(id));
}
export const tabs = () => [ALL, ...GROUPS.filter(g => g !== 'cover' && g !== 'fallow' && cropsOfGroup(g).length), REST, TREES];
export const tabName = g => g === ALL ? 'All' : g === TREES ? 'Trees and bushes' : g === REST ? 'Rest' : (GROUP_WORDS[g] ?? g);

const $ = (sel, root = document) => root.querySelector(sel);
let open = null;   // { button, panel, select, close }

function close(refocus = true) {
  if (!open) return;
  const { button, panel } = open;
  open = null;
  button.setAttribute('aria-expanded', 'false');
  panel.remove();
  if (refocus && button.isConnected) button.focus();
}
function draw(panel, state) {
  const ids = pickList(state.text, state.group);
  $('.pk-list', panel).innerHTML = ids.length ? ids.map(id => `<li><button type="button" class="pk-row" data-id="${esc(id)}"${id === state.value ? ' aria-current="true"' : ''}>${cropPic(id)}<span>${esc(cropName(id))}</span></button></li>`).join('')
    : '<li class="cap pk-none">No crop matches. Try another word.</li>';
}
function openPanel(button, select) {
  close(false);
  const state = { text: '', group: ALL, value: select.value }, panel = document.createElement('div');
  panel.className = 'pk-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Choose a crop');
  panel.innerHTML = `<input type="search" class="pk-search" aria-label="Search crops" placeholder="Search crops" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
    <div class="pk-tabs" role="group" aria-label="Kinds of crop">${tabs().map(g => `<button type="button" class="chip" data-tab="${g}" aria-pressed="${g === ALL}">${esc(tabName(g))}</button>`).join('')}</div>
    <ul class="pk-list" aria-label="Crops"></ul>`;
  button.closest('.year').append(panel);
  button.setAttribute('aria-expanded', 'true');
  open = { button, panel, select };
  draw(panel, state);
  const search = $('.pk-search', panel);
  search.focus();
  search.addEventListener('input', () => { state.text = search.value; draw(panel, state); });
  panel.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]'), row = event.target.closest('.pk-row');
    if (tab) { state.group = tab.dataset.tab; for (const t of panel.querySelectorAll('[data-tab]')) t.setAttribute('aria-pressed', t === tab); draw(panel, state); }
    if (row) { select.value = row.dataset.id; close(); select.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  panel.addEventListener('keydown', event => {
    const rows = [...panel.querySelectorAll('.pk-row')], at = rows.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1, to = at < 0 ? (step > 0 ? 0 : rows.length - 1) : at + step;
      if (to < 0) search.focus(); else rows[Math.min(to, rows.length - 1)]?.focus();
    }
  });
}
// Replace each select[data-picker] under root by a button. The select stays, hidden from the eye and from the keys.
let listening = false;
export function enhancePickers(root) {
  if (!listening) { listening = true; document.addEventListener('click', event => { if (open && !open.panel.contains(event.target) && !open.button.contains(event.target)) close(false); }); }
  for (const select of root.querySelectorAll('select[data-picker]')) {
    if (select.dataset.enhanced) continue;
    select.dataset.enhanced = '1'; select.classList.add('sr'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'pk-btn'; button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false');
    button.dataset.yearbtn = select.dataset.year;
    button.setAttribute('aria-label', `${select.getAttribute('aria-label')}: ${select.value ? cropName(select.value) : 'choose a crop'}`);
    button.innerHTML = `${select.value ? cropPic(select.value) : ''}<span class="pk-name">${esc(select.value ? cropName(select.value) : (select.options[0]?.textContent ?? ''))}</span><i class="chev" aria-hidden="true"></i>`;
    select.after(button);
    button.addEventListener('click', () => open?.button === button ? close() : openPanel(button, select));
    button.addEventListener('keydown', event => { if (event.key === 'ArrowDown' && open?.button !== button) { event.preventDefault(); openPanel(button, select); } });
  }
}
