// The map library, fetched the first time a map is about to show (the setup map, My farm) and never for the Start page: its 147 KB script and its stylesheet are not
// loaded with the page any more. loadLeaflet() answers the library (window.L) once both its script and its stylesheet are in; asked again it answers the same one.
// The stylesheet goes in front of the app's own, as it did in the page, so the app's rules still win. A file that does not arrive rejects, and the next call tries again.
// Checked by scripts/e2e_start_speed.mjs (no map library on the Start page, every map screen still opens).
let pending = null;

// Each file is named in full, so the offline copy (sw.js) and the page check (scripts/test.mjs) find them the way they find every module.
const FILES = { 'leaflet.js': new URL('../vendor/leaflet/leaflet.js', import.meta.url).href, 'leaflet.css': new URL('../vendor/leaflet/leaflet.css', import.meta.url).href };
const here = file => FILES[file];

export function loadLeaflet() {
  if (globalThis.L && typeof globalThis.L.map === 'function') return Promise.resolve(globalThis.L);
  if (pending) return pending;
  const sheet = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = here('leaflet.css');
    link.onload = resolve; link.onerror = () => reject(new Error('The map styles did not load'));
    (document.querySelector('link[rel=stylesheet][href$="css/app.css"]') ? document.querySelector('link[rel=stylesheet][href$="css/app.css"]').before(link) : document.head.append(link));
  });
  const script = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = here('leaflet.js'); tag.async = true;
    tag.onload = () => globalThis.L ? resolve(globalThis.L) : reject(new Error('The map library did not start'));
    tag.onerror = () => reject(new Error('The map library did not load'));
    document.head.append(tag);
  });
  pending = Promise.all([sheet, script]).then(([, L]) => L, error => { pending = null; document.querySelectorAll('link[href$="leaflet.css"], script[src$="leaflet.js"]').forEach(node => node.remove()); throw error; });
  return pending;
}

// Ask the browser for the map's files now, at low priority, so that the tap that needs them finds them near. Changes nothing on the page.
export function warmLeaflet() {
  for (const [file, as] of [['leaflet.js', 'script'], ['leaflet.css', 'style']]) {
    if (document.querySelector(`link[rel=preload][href="${here(file)}"]`)) continue;
    const link = document.createElement('link'); link.rel = 'preload'; link.as = as; link.href = here(file); document.body.append(link);
  }
}
