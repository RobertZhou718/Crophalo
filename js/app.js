// Crophalo's page shell: the start, show(view), the top bar with its Menu, and the address routes of the info pages.
// Nothing here is pure: it reads and changes the page and the browser's history. Each feature gets its own module, not a section here.
// Checked by scripts/e2e.mjs (the shell: one heading per view, the Menu, Back, focus), scripts/e2e_flow.mjs (home to report), scripts/e2e_map.mjs and scripts/e2e_farm.mjs.
import './api-timings.js';   // every call to the data server is timed in this browser, for the API connections page
import { applySettings } from './settings.js';
import { own } from './words.js';
import { initHome } from './home.js';
import { initWelcome, openWelcome } from './welcome.js';
import { toast } from './toast.js';
import { loadLeaflet, warmLeaflet } from './leaflet-load.js';
// The Start page loads only what it shows. The setup (wizard and map), the report, the info pages and My farm are fetched the first time they are asked for, each by the few lines below.
import { renderAdminPage } from './admin-view.js';   // the service status page
import { initOffline } from './offline.js';   // the worker that keeps a copy for offline use, the offline bar, the install button
import { hooks } from './hooks.js';   // the wrappers the big animations may take; with none loaded each update simply runs

const $ = (sel, root = document) => root.querySelector(sel), $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---- state
const VIEW_TITLES = { home: 'Start', setup: 'Farm setup', report: 'Your report', farm: 'My farm', admin: 'API connections' };
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
  const from = current.view, was = current.page;
  current = { view, page };
  hooks.view(() => {   // the big animations may run this inside a view transition; with none loaded it runs at once
  for (const section of $$('.view')) section.hidden = section.id !== 'view-' + view;
  if (page) $('#infoTitle').textContent = INFO_PAGES[page];
  document.title = (page ? INFO_PAGES[page] : VIEW_TITLES[view]) + ' · Crophalo';
  for (const [node, here] of [[$('#navFarm'), view === 'farm'], ...$$('#navMenu a').map(link => [link, link.hash === '#' + page])]) here ? node.setAttribute('aria-current', 'page') : node.removeAttribute('aria-current');   // the open place looks chosen in the bar
  if (!first && changed) { scrollTo(0, 0); focusHeading(); }   // a page that has only just opened keeps focus at the top, so the skip link comes first
  }, { from, to: view, page, wasPage: was });   // the whole change, focus included, is the hook's update: the page turns (js/macro-turn.js) tell one info page from another by page and wasPage
  // What fetches stays outside the wrapped update: the info page's two modules, the report, My farm, Admin and the setup map.
  if (page) Promise.all([import('./pages.js'), import('./srci.js')]).then(([m, sources]) => { sources.initSources(); m.renderInfo(page); }).catch(() => { $('#infoBody').textContent = 'This page could not load. Check the internet connection, then reload the page.'; });
  if (page === 'data') explain();   // "How to read Crophalo" under the Data page's NASA line
  setMenu(false);
  if (view === 'farm') $('#navFarm')?.removeAttribute('data-new');   // the quiet mark of "Added to My farm" goes once My farm is open
  if (view === 'report') { wire(); showReport(); }   // a report in hand stays; else it is built from the setup answers, or the way back is offered
  if (view === 'farm') { wire(); openFarm(); }   // the board loads the first time it opens; the small motions come too, so a Copy in the land history already shows Copied
  if (view === 'admin') openAdmin();   // open to everyone, no password: it shows nothing private
  if (view === 'setup') loadMap().catch(setupFailed);   // the wizard and the map come in while the screen is already up
}

// Which view the address and the history entry ask for: #data, #privacy, #limits, #settings (with an optional /tab), #admin, else the entry's own view.
function fromAddress() {
  const [, name = ''] = /^#([a-z]+)(?:\/[a-z]+)?$/.exec(location.hash) || [];
  if (own(INFO_PAGES, name)) return { view: 'info', page: name };
  if (location.hash === '#admin' || location.hash === '#status') return { view: 'admin', page: '' };
  const kept = history.state?.v ?? 'home';   // an entry with no view of its own (an address typed in, or one we do not know) is the home, so Back never stands still
  return { view: IN_HISTORY.includes(kept) ? kept : 'home', page: '' };
}
function route() { const { view, page } = fromAddress(); show(view, true, page); }

// ── the top bar ──
const menuBtn = $('#navMenuBtn'), menu = $('#navMenu');
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

// ---- the report engine on its worker (js/engine-client.js): the long work of a report runs off the page, which keeps answering taps; with no worker it runs here in pieces
const engineClient = () => import('./engine-client.js').then(m => m.engineLoader());

// ---- "How to read Crophalo" (js/explain-page.js): its folds on the Data page and the word "i" in the report. Fetched with the first of the two, never for the Start page, because it reads the crop and engine tables.
let explainLoad = null;
const explain = () => explainLoad ||= import('./explain-page.js').then(m => m.initExplain(), () => { explainLoad = null; /* the Data page is then without its "How to read Crophalo"; asked again next time */ });

// ---- the setup (wizard and map) and the report: loaded the first time they are asked for. Each loader starts a module once and gives back the same one after.
// The place the wizard last announced, and the place the map last chose, are kept here, so a module that arrives after them still learns where the field is.
let lastPlace, lastPrefetch;
document.addEventListener('crophalo:place', event => { lastPlace = event.detail; });
document.addEventListener('crophalo:prefetch', event => { lastPrefetch = event.detail; });
let wizardLoad = null, mapLoad = null, reportLoad = null;
const seam = { report: (state, opts) => { show('report'); loadReport().then(r => r.openReport(state, opts)).catch(reportFailed); }, home: () => show('home') };
const loadWizard = () => wizardLoad ||= import('./wizard.js').then(wizard => { wizard.initWizard(seam); return wizard; }).catch(error => { wizardLoad = null; throw error; });
// The map joins the wizard: the library, then the map's own module. The map listens for the place from the moment it starts; a place the wizard announced before that is announced again.
const loadMap = () => mapLoad ||= Promise.all([loadLeaflet().then(() => import('./mapx.js')), import('./srci.js'), loadWizard()]).then(([map, sources, wizard]) => {
  sources.initSources();   // the "i" beside a figure on the map's card (the report starts it too, when it loads)
  map.initMapX();
  wizard.setOutlineSource?.(map.outlineNow);   // the area block of the setup's first step reads the outline the map holds
  if (lastPlace !== undefined) document.dispatchEvent(new CustomEvent('crophalo:place', { detail: lastPlace }));
  loadReport().catch(() => { /* asked again when the report is opened */ });   // the report comes in behind the setup, so the lookups for a chosen place can start before "See my field report"
  return { map, wizard };
}).catch(error => { mapLoad = null; throw error; });
const loadReport = () => reportLoad ||= Promise.all([import('./report.js'), loadWizard()]).then(([report]) => {   // the report reads the wizard's answers, and needs no map library
  report.initReport({ change: () => show('setup'), home: () => show('home'), engine: engineClient, farm: loadFarm, farmHas: () => import('./farmhas.js'), farmOpened: () => show('farm') });
  if (lastPrefetch !== undefined) document.dispatchEvent(new CustomEvent('crophalo:prefetch', { detail: lastPrefetch }));   // a place the map chose before the report was here
  explain();   // the word "i" beside the report's headings that use a word
  return report;
}).catch(error => { reportLoad = null; throw error; });
const setupFailed = () => toast('The setup could not load. Check the internet connection, then try again.');
const reportFailed = () => toast('The report could not load. Check the internet connection, then try again.');
const showReport = () => loadReport().then(report => report.showReport()).catch(reportFailed);   // the report's own showReport(), once its module is here
// Fetch the setup's files before they are asked for: when a finger or a key first touches the page, and when the browser is idle after the Start page has settled. Nothing runs, nothing is shown.
let warmed = false;
function warmSetup() {
  if (warmed || navigator.connection?.saveData || /^(slow-)?2g$/.test(navigator.connection?.effectiveType || '')) return;   // a farmer who asked to save data, or is on a very slow line, gets the files when the tap needs them
  warmed = true;
  for (const file of ['wizard.js', 'mapx.js']) { const link = document.createElement('link'); link.rel = 'modulepreload'; link.href = new URL('./' + file, import.meta.url).href; document.body.append(link); }   // at the very end of the page, so nothing already on it changes its place
  warmLeaflet();
}
for (const kind of ['pointerdown', 'keydown', 'touchstart']) addEventListener(kind, warmSetup, { once: true, passive: true });
addEventListener('load', () => setTimeout(() => (window.requestIdleCallback || (fn => fn()))(warmSetup, { timeout: 8000 }), 400), { once: true });   // a moment after the page has loaded (the Start page is already usable, only its pictures are still coming)

// ---- My Farm: loaded the first time it opens. The engine says what covers the ground on a date; the 3D look is loaded only when asked for.
const loadFarm = () => Promise.all([loadLeaflet(), import('./farm.js')]).then(async ([, farm]) => {
  if (!loadFarm.wired) {
    loadFarm.wired = true;
    farm.setOpener(() => show('farm'));
    farm.setGo?.((view, page) => show(view, false, page));
    farm.setScenes?.(true);   // the two 3D scenes (the sketch that fills in, Play the day): My farm loads them lazily and guarded once 3D opens
    farm.setView3d((input, node, options) => import('./farm3d.js').then(m => m.view3d(input, node, options)));
    import('./engine.js').then(engine => farm.setGround(engine.groundOn)).catch(() => { /* the board says "not read yet" for the ground */ });
    engineClient().then(client => farm.setEngineClient?.(client)).catch(() => { /* the chips run the engine on the page */ });
  }
  return farm;
});
function openFarm() {
  loadFarm().then(farm => farm.mountFarm($('#view-farm'))).catch(() => { $('#view-farm').innerHTML = '<div class="wrap"><div class="sec"><h1>My farm</h1><p>My farm could not load. Check the internet connection, then reload the page.</p></div></div>'; });
}

// ---- Admin, the service status page: the live data services, read from the server each time it opens. Its one button only asks the services again.
const openAdmin = () => renderAdminPage($('#view-admin .sec'));

// ---- what other parts of the page ask for by event: the welcome sheet again (Settings), and every timer stopped (after reminders are deleted)
document.addEventListener('crophalo:welcome', () => openWelcome());
document.addEventListener('crophalo:stop-timers', () => {
  clearTimeout(focusTimer);
  import('./remind.js').then(remind => remind.forgetMemory?.()).catch(() => { /* reminders not loaded: nothing runs */ });
  try { globalThis.speechSynthesis?.cancel(); } catch { /* nothing is being read aloud */ }
});

// ---- the place the farmer chose on the home: the setup wizard takes it from here
async function openSetup(spot) {   // with no place yet, the map's own line says what to do: no second line in a toast
  show('setup');   // the screen is up at once; the wizard and the map arrive a moment later (or already did, when a finger had been on the page)
  try {
    const { wizard } = await loadMap();
    wizard.setPlace(spot);
  } catch (e) { setupFailed(); }
}

// ---- the small motions (js/motion-wire.js): fetched a moment after the page has loaded, or when the report or My farm is asked for, whichever is first
let wireLoad = null;
const wire = () => wireLoad ||= import('./motion-wire.js').catch(() => null);
addEventListener('load', () => setTimeout(wire, 1500), { once: true });

// ---- start
applySettings();
initTopBar();
initOffline();
initHome({ place: spot => hooks.place(() => openSetup(spot), spot), mapPick: () => hooks.place(() => openSetup(null), null) });
initWelcome();
addEventListener('popstate', route);
addEventListener('hashchange', route);
{
  const { view, page } = fromAddress();
  if (IN_HISTORY.includes(view) && !history.state?.v) history.replaceState({ v: view }, '');   // so Back to the first entry knows its view
  show(view, true, page);
}

// The big animations: loaded once the page is ready, never in its way. With the macro files absent each import fails quietly and every screen is what it was. The report's scenes are fetched here too,
// so the first report of a visit has its iris (js/macro.js would only fetch them when the report first opens, one screen change too late).
const startMacro = () => { import('./macro.js').then(m => m.start()).catch(() => {}); import('./macro-report.js').catch(() => {}); };
if (document.readyState === 'complete') startMacro(); else addEventListener('load', startMacro, { once: true });
