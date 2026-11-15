// The entry of the big animations: start() waits for the page to load and Home to be up, then fetches the scene modules each view needs, Home's first and the others
// when their view first opens, and css/macro.css once the first of them has come. Each module is fetched in its own try, so one that is missing or fails changes nothing.
// Not pure: it watches which view is shown. With no scene module in the folder it changes nothing at all. Checked by scripts/test_macro.mjs and scripts/e2e_macro.mjs.
/*
 * Decisions taken where the plan left a detail open:
 * - A scene module does its work when it is imported (it adds its hook with setHook, or listens for its event); if it also exports start(), that is called once.
 * - The modules are named through VIEW_SCENES and fetched by a computed name, so a module that is not in the folder yet is never named to the offline copy or the
 *   page's own checks. Only the names in LANDED are fetched at all, so a folder without a module asks for nothing and logs no missing file. A package that lands its
 *   module adds its one name to LANDED in the same change (one word in one list); its own package may also add a plain import line if it must be kept for offline use.
 * - A module's start() may be async: its failure, at once or later, is reported and never reaches the page as an unhandled rejection.
 * - The generic turn is fetched with Home and before any other module: hooks ask the newest wrapper first, so a screen's own module always goes before it.
 * - "Home is up" is the event crophalo:orbit-ready when the globe sends it, or an idle moment after load (at most T.OPEN_MAX), whichever comes first.
 * - The stylesheet comes only with the first module that loads, so a folder without scene modules gets no new rule at all.
 */
import { T } from './macro-core.js';

export const VIEW_SCENES = Object.freeze({
  home: ['turn', 'home', 'descent', 'light'],
  setup: ['setup', 'layers'],
  report: ['record', 'report', 'pullback', 'compare', 'weather', 'calendar', 'sats', 'field', 'farm'],
  farm: ['farm', 'lift', 'sun', 'history'],
});
// The scene modules that are in the folder: the report's scenes (js/macro-report.js: the iris, the record band, the fold, the curl and the score roll), the page turns
// (js/macro-turn.js: a report tab turns like a page, the calm screens cross-fade), the step turn of the setup (js/macro-setup.js), and Home's own two:
// the fall from the Earth to the field (js/macro-descent.js) and First Light (js/macro-light.js).
export const LANDED = Object.freeze(['report', 'turn', 'setup', 'descent', 'light']);
const fetchModule = name => import(`./macro-${name}.js`);

let begun = null;
// importer and landed: for the suites only (a stand-in that answers or fails as a module would, and the list it stands for).
export function start({ importer = fetchModule, landed = LANDED } = {}) {
  if (begun) return begun;
  const d = globalThis.document;
  if (!d?.documentElement) return (begun = Promise.resolve({ loaded: [] }));
  const loaded = [], tried = new Set();
  let styled = false;
  const style = () => {
    if (styled) return; styled = true;
    try {
      const href = new URL('../css/macro.css', import.meta.url).href;
      if (!d.querySelector(`link[rel=stylesheet][href="${href}"]`)) { const link = d.createElement('link'); link.rel = 'stylesheet'; link.href = href; d.head.append(link); }
    } catch { /* the scenes still play; only the shared defaults are missing */ }
  };
  const bring = async name => {
    if (tried.has(name) || !landed.includes(name)) return false; tried.add(name);
    try {
      const mod = await importer(name);
      if (!mod) return false;
      style(); loaded.push(name);
      if (typeof mod.start === 'function') Promise.resolve().then(() => mod.start()).catch(e => globalThis.reportError?.(e));   // a throw now or a rejection later: reported, never into the page
      return true;
    } catch { return false; }   // not in the folder yet, or it failed: the screen stays as it is
  };
  const group = async view => { for (const name of VIEW_SCENES[view] || []) await bring(name); };
  const viewOf = node => /^view-(\w+)$/.exec(node?.id || '')?.[1] || '';
  const watchViews = () => {
    const opened = new Set(['home']);
    const look = () => { for (const v of d.querySelectorAll('.view:not([hidden])')) { const view = viewOf(v); if (view && !opened.has(view)) { opened.add(view); group(view); } } };
    if (typeof globalThis.MutationObserver === 'function') new MutationObserver(look).observe(d.querySelector('main') || d.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    look();
  };
  begun = loadedPage(d).then(() => homeUp(d)).then(() => group('home')).then(() => { watchViews(); return { loaded }; }, () => ({ loaded }));
  return begun;
}

const loadedPage = d => new Promise(done => { if (d.readyState === 'complete' || typeof globalThis.addEventListener !== 'function') done(); else globalThis.addEventListener('load', () => done(), { once: true }); });
function homeUp(d) {
  return new Promise(done => {
    let over = false; const go = () => { if (!over) { over = true; done(); } };
    d.addEventListener?.('crophalo:orbit-ready', go, { once: true });
    if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(go, { timeout: T.OPEN_MAX });
    else setTimeout(go, T.QUICK);
  });
}
