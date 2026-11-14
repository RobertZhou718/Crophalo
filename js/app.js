// Crophalo's page shell: the start, show(view), the top bar with its Menu, and the address routes of the info pages.
// Nothing here is pure: it reads and changes the page and the browser's history. Each feature gets its own module, not a section here.
// Checked by scripts/e2e.mjs (the shell: one heading per view, the Menu, Back, focus).
import { applySettings } from './settings.js';
import { own } from './words.js';

const $ = (sel, root = document) => root.querySelector(sel), $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---- state
const VIEW_TITLES = { home: 'Start', setup: 'Farm setup', report: 'Your report', farm: 'My farm', admin: 'Admin' };
const INFO_PAGES = { data: 'Data', privacy: 'Privacy', limits: 'Limitations', settings: 'Settings' };
const IN_HISTORY = ['home', 'setup', 'report', 'farm'];   // Back steps through these; the info pages and Admin ride on the address instead
let current = { view: '', page: '' }, focusTimer = 0;

// ---- views
function focusOnce(node) {   // focusable for this one move only: a part left focusable would catch every click on its words
  if (!node) return;
  node.tabIndex = -1; node.focus();
  node.addEventListener('blur', () => node.removeAttribute('tabindex'), { once: true });
}
const focusHeading = () => { clearTimeout(focusTimer); focusTimer = setTimeout(() => focusOnce($(`#view-${current.view} h1`)), 80); };   // after the screen has changed, so a screen reader reads the new heading

// Show one view and hide the rest. fromPop: the browser's Back or the address brought us here, so history is left alone.
// The info pages and Admin are opened by their address (location.hash = '#data'), never by calling show('info') directly.
export function show(view, fromPop = false, page = '') {
  if (view === 'info' ? !own(INFO_PAGES, page) : !own(VIEW_TITLES, view)) view = 'home';
  if (view !== 'info') page = '';
  const first = !current.view, changed = view !== current.view || page !== current.page;
  if (!fromPop && IN_HISTORY.includes(view) && (changed || location.hash)) history.pushState({ v: view }, '', location.pathname + location.search);   // a clean address: leaving an info page or Admin drops its hash
  current = { view, page };
  for (const section of $$('.view')) section.hidden = section.id !== 'view-' + view;
  if (page) $('#infoTitle').textContent = INFO_PAGES[page];
  document.title = (page ? INFO_PAGES[page] : VIEW_TITLES[view]) + ' · Crophalo';
  for (const [node, here] of [[$('#navFarm'), view === 'farm'], ...$$('#navMenu a').map(link => [link, link.hash === '#' + page])]) here ? node.setAttribute('aria-current', 'page') : node.removeAttribute('aria-current');   // the open place looks chosen in the bar
  setMenu(false);
  if (first || !changed) return;   // a page that has only just opened keeps focus at the top, so the skip link comes first
  scrollTo(0, 0); focusHeading();
}

// Which view the address and the history entry ask for: #data, #privacy, #limits, #settings (with an optional /tab), #admin, else the entry's own view.
function fromAddress() {
  const [, name = ''] = /^#([a-z]+)(?:\/[a-z]+)?$/.exec(location.hash) || [];
  if (own(INFO_PAGES, name)) return { view: 'info', page: name };
  if (location.hash === '#admin') return { view: 'admin', page: '' };
  const kept = history.state?.v ?? current.view;   // an address we do not know changes nothing
  return { view: IN_HISTORY.includes(kept) ? kept : 'home', page: '' };
}
function route() { const { view, page } = fromAddress(); show(view, true, page); }

// ── the top bar ──
const menuBtn = $('#navMenuBtn'), menu = $('#navMenu'), saved = $('#dlgSaved');
const menuOpen = () => menuBtn.getAttribute('aria-expanded') === 'true';
function setMenu(open, refocus = false) {
  if (open === menuOpen()) return;
  menuBtn.setAttribute('aria-expanded', open);   // the stylesheet opens the list from this one attribute
  if (open) $('a', menu).focus(); else if (refocus) menuBtn.focus();
}
function initTopBar() {
  $('.skip').addEventListener('click', event => { event.preventDefault(); focusOnce($('#main')); });
  $('.brand').addEventListener('click', event => { if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); show('home'); });   // a new-tab click stays the browser's
  $('#navFarm').addEventListener('click', () => show('farm'));
  $('#navSaved').addEventListener('click', () => saved.showModal());
  $('#dlgSavedDone').addEventListener('click', () => saved.close());
  saved.addEventListener('click', event => { if (event.target === saved) saved.close(); });   // only the dimmed page around the sheet is the dialog itself
  menuBtn.addEventListener('click', () => setMenu(!menuOpen()));   // the same button twice closes it
  menu.addEventListener('click', event => { const link = event.target.closest('a'); if (!link) return; setMenu(false); if (link.hash === location.hash) focusHeading(); });
  for (const kind of ['click', 'focusin']) document.addEventListener(kind, event => { if (!menuBtn.contains(event.target) && !menu.contains(event.target)) setMenu(false); });   // a click or a Tab that lands outside closes the list, so it never covers what has focus
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && menuOpen()) setMenu(false, true); });
  matchMedia('(min-width: 1181px)').addEventListener('change', () => setMenu(false));   // on a wide screen the links sit in the bar and the Menu button is gone
  const bar = $('.nav'), root = document.documentElement;
  bar.style.setProperty('--navh', getComputedStyle(root).getPropertyValue('--navh'));   // the bar keeps the stylesheet's own height for itself, or its measured height would feed its minimum and it could only ever grow
  new ResizeObserver(() => root.style.setProperty('--navh', bar.offsetHeight + 'px')).observe(bar);   // sticky bars below sit under the real height, offline bar included
}
// ── end ──

// ---- start
applySettings();
initTopBar();
addEventListener('popstate', route);
addEventListener('hashchange', route);
{
  const { view, page } = fromAddress();
  if (IN_HISTORY.includes(view) && !history.state?.v) history.replaceState({ v: view }, '');   // so Back to the first entry knows its view
  show(view, true, page);
}
