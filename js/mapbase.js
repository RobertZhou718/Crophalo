// Crophalo's map base: the Satellite / Light switch and the place names (never a water name). Satellite is Esri's photo with the names of countries, regions and places over it; Light is the calm vector map of js/lightstyle.js.
// MapLibre loads with the map and draws both; without it (no WebGL, offline, tiles that do not come) the photo stays without names or the Light map is Esri's plain grey, and a sentence says so. The old base stays until the new one is up.
// Not pure: it needs the page, Leaflet and the vendored MapLibre; the pure parts are backdropFor(), creditFor() and SAYS. Checked by scripts/test_mapbase.mjs (the pure parts), scripts/e2e_map.mjs (the switch, the credits, the fallbacks)
// and scripts/live_check_basemap.mjs (a real browser: country and city names at zoom 3, 6 and 10 over Ontario, no water name in the style).
import { lightStyle, labelsStyle, CREDIT as LABEL_CREDIT } from './lightstyle.js';

const L = globalThis.window?.L;
export const PHOTO = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const PHOTO_CREDIT = 'Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community';
export const GREY = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
export const GREY_CREDIT = 'Esri, HERE, Garmin, (c) OpenStreetMap contributors, and the GIS user community';
// The credit line of what is on the map, word for word. Pure.
export function creditFor({ ground, names }) {
  const base = ground === 'photo' ? PHOTO_CREDIT : ground === 'grey' ? GREY_CREDIT : '';
  return base ? `${base}${names ? ` \u00b7 Place names: ${LABEL_CREDIT}` : ''}` : names ? LABEL_CREDIT : '';   // the Light map's credit is OpenFreeMap's alone
}
// The credit as links: OpenFreeMap, OpenMapTiles and OpenStreetMap each lead to their own page. Pure: [{ text, href? }].
export const CREDIT_LINKS = Object.freeze({ OpenFreeMap: 'https://openfreemap.org', OpenMapTiles: 'https://openmaptiles.org', OpenStreetMap: 'https://www.openstreetmap.org/copyright' });
export function creditParts(text) {
  const out = []; let rest = String(text ?? '');
  for (let m; (m = /OpenFreeMap|OpenMapTiles|OpenStreetMap/.exec(rest));) { if (m.index) out.push({ text: rest.slice(0, m.index) }); out.push({ text: m[0], href: CREDIT_LINKS[m[0]] }); rest = rest.slice(m.index + m[0].length); }
  if (rest) out.push({ text: rest });
  return out;
}
export const POLE = 63;            // beyond this latitude the light map is Esri's: its coastlines match the photo better there
export const STALL_MS = 15e3, RETRY_MS = 10 * 60e3, MANY_ERRORS = 6;
export const SAYS = Object.freeze({
  noGL: 'This browser cannot draw the detailed map (WebGL is switched off), so the names of places are missing on the photo and the light map is the simpler one from Esri, without names.',
  offline: 'This device is offline, so the place names and the detailed light map cannot load. They come back by themselves when you are online again.',
  stalled: 'The place names and the detailed light map did not load (some map tiles did not answer), so the photo has no names and the light map is the simpler one from Esri, without names. It tries again in ten minutes, and when you are online again.',
  pole: 'Near the poles the light map is Esri\'s plain light grey: there its coastlines match the satellite photo more closely. Place names still show.',
});

// Which backdrop (the photo, Esri's light grey, or MapLibre's own ground) and which names style a choice needs. Pure.
export function backdropFor({ choice, lat = 0, gl = true }) {
  const far = Math.abs(lat) > POLE;
  if (choice === 'sat') return { ground: 'photo', names: gl ? 'photo' : null, note: gl ? '' : null };
  if (!gl) return { ground: 'grey', names: null, note: 'gl' };
  return far ? { ground: 'grey', names: 'paper', note: 'pole' } : { ground: 'gl', names: 'light', note: '' };
}

// ---- MapLibre, loaded once, with its stylesheet and its Leaflet plugin, from the app's own vendor folder
const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
let loading = null;
function loadGL() {
  if (window.maplibregl && L.maplibreGL) return Promise.resolve(true);
  if (loading) return loading;
  const at = file => new URL(`../vendor/maplibre/${file}`, import.meta.url).href;
  const script = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('script')); document.head.append(s); });
  if (!document.querySelector('link[data-maplibre]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = at('maplibre-gl.css'); l.dataset.maplibre = '1'; document.head.append(l); }
  loading = script(at('maplibre-gl.js')).then(() => script(at('leaflet-maplibre-gl.js'))).then(() => !!(window.maplibregl && L.maplibreGL), () => false).then(ok => { if (!ok) loading = null; return ok; });
  return loading;
}

let choice = 'sat';                       // the farmer's choice survives the wizard redrawing the map
export const baseChoice = () => choice;
let current = null;                       // the base of the map that is on the page now: for the checks

// Start the base on a Leaflet map. ui: { segment, credit, note }. Returns { set(name), state(), glMap(), dispose() }.
export function initBase(map, ui, { say = () => {} } = {}) {
  const photo = L.tileLayer(PHOTO, { maxNativeZoom: 18, maxZoom: 19, attribution: PHOTO_CREDIT, crossOrigin: true });
  const grey = L.tileLayer(GREY, { maxNativeZoom: 16, maxZoom: 19, attribution: GREY_CREDIT, crossOrigin: true });
  let errors = 0, gl = null, glMap = null, namesStyle = null, failed = '', retryTimer = 0, stallTimer = 0, dead = false, token = 0, using = { ground: 'photo', names: null };
  const wantGL = () => hasWebGL() && navigator.onLine !== false;

  const show = (layer, on) => { if (on && !map.hasLayer(layer)) layer.addTo(map); if (!on && map.hasLayer(layer)) layer.remove(); };
  const sentence = key => { const text = key ? SAYS[key] : ''; if (ui.note) { ui.note.textContent = text; ui.note.hidden = !text; } document.dispatchEvent(new CustomEvent('crophalo:basenote', { detail: { text } })); };
  const credits = () => {
    ui.credit.replaceChildren(...creditParts(creditFor(using)).map(p => { if (!p.href) return document.createTextNode(p.text); const a = document.createElement('a'); a.href = p.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = p.text; return a; }));
  };
  const segment = () => { for (const b of ui.segment.querySelectorAll('[data-base]')) b.setAttribute('aria-pressed', b.dataset.base === choice ? 'true' : 'false'); };

  // MapLibre's layer: made once, when the library is there. Its style is swapped by name.
  function ensureGL() {
    if (gl) return true;
    if (!window.maplibregl || !L.maplibreGL) return false;
    gl = L.maplibreGL({ style: { version: 8, sources: {}, layers: [] }, interactive: false, padding: 0.1, attributionControl: false });
    // The plugin's step after a zoom, as the plugin does it, but only while the layer is still on a map: the wizard may take the map down within that one frame
    gl._transitionEnd = function () {
      L.Util.requestAnimFrame(function () {
        if (!this._map || !this._glMap) return;
        const zoom = this._map.getZoom(), center = this._map.getCenter(), offset = this._map.latLngToContainerPoint(this._map.getBounds().getNorthWest());
        L.DomUtil.setTransform(this._glMap._actualCanvas, offset, 1);
        this._glMap.once('moveend', L.Util.bind(function () { if (this._map) this._zoomEnd(); }, this));
        this._glMap.jumpTo({ center, zoom: zoom - 1 });
      }, this);
    };
    gl.addTo(map);
    if (gl._container) gl._container.style.zIndex = 5;   // above the photo and the grey tiles, below Leaflet's markers
    glMap = gl.getMaplibreMap();
    glMap.on('error', event => { if (event?.error && (event.sourceId || /tile|fetch|network|failed/i.test(String(event.error.message ?? ''))) && ++errors >= MANY_ERRORS) onFail(); });   // one tile that does not come is retried by MapLibre; many mean the service is not answering
    return true;
  }
  function setNames(kind) {   // 'light' | 'photo' | 'paper' | null
    if (!kind) { if (gl && gl._container) gl._container.style.display = 'none'; namesStyle = null; return Promise.resolve(); }
    if (gl?._container) gl._container.style.display = '';
    if (namesStyle === kind) return Promise.resolve();
    namesStyle = kind;
    glMap.setStyle(kind === 'light' ? lightStyle() : labelsStyle(kind === 'photo'));
    return new Promise(done => { const stop = () => { clearTimeout(stallTimer); done(); }; glMap.once('idle', stop); clearTimeout(stallTimer); stallTimer = setTimeout(() => { glMap.off('idle', stop); onFail(); done(); }, STALL_MS); });
  }
  function onFail() { if (failed || dead) return; failed = 'stalled'; clearTimeout(stallTimer); apply(); clearTimeout(retryTimer); retryTimer = setTimeout(retry, RETRY_MS); }
  function retry() { if (dead) return; failed = ''; errors = 0; namesStyle = null; apply(); }

  async function apply() {
    const mine = ++token, lat = map.getCenter().lat;
    const gloriously = !failed && wantGL();
    const glOk = gloriously && (ensureGL() || await loadGL().then(ok => ok && !dead && ensureGL()));
    if (mine !== token || dead) return;
    const plan = backdropFor({ choice, lat, gl: !!glOk });
    const key = !gloriously ? (failed ? 'stalled' : navigator.onLine === false ? 'offline' : 'noGL') : !glOk ? 'noGL' : plan.note === 'pole' ? 'pole' : '';
    // the ground first (the old one stays until the new one is up), then the names
    if (plan.ground === 'photo') { show(photo, true); show(grey, false); }
    else if (plan.ground === 'grey') { show(grey, true); show(photo, false); }
    else show(grey, false);
    using = { ground: plan.ground === 'gl' ? 'gl' : plan.ground, names: plan.names };
    if (plan.ground === 'gl') { await setNames('light'); if (mine !== token || dead) return; show(photo, false); }
    else await setNames(plan.names);
    if (mine !== token || dead) return;
    credits(); sentence(key); segment();
    document.dispatchEvent(new CustomEvent('crophalo:base', { detail: { ground: using.ground, names: using.names } }));   // the layers over the map re-stack themselves
  }

  function set(name) {
    if (name !== 'sat' && name !== 'light') return;
    choice = name; segment(); apply();
    say(name === 'sat' ? 'Satellite map' : 'Light map');
  }
  ui.segment.addEventListener('click', event => { const b = event.target.closest('[data-base]'); if (b) set(b.dataset.base); });
  const onMove = () => { if (choice === 'light' && (Math.abs(map.getCenter().lat) > POLE) !== (using.ground === 'grey')) apply(); };
  map.on('moveend', onMove);
  const onOnline = () => { if (failed || !using.names) retry(); };
  window.addEventListener('online', onOnline);
  // The base starts when the map is on the screen: the map drawn in the hidden setup screen at the page start asks for no tiles and no MapLibre until it is shown, so the first screen stays light.
  const box = map.getContainer(), onScreen = () => box.offsetWidth > 0 && box.offsetHeight > 0;
  let waitShown = null;
  segment(); credits();
  if (onScreen()) apply();
  else { waitShown = new ResizeObserver(() => { if (dead || !onScreen()) return; waitShown.disconnect(); waitShown = null; apply(); }); waitShown.observe(box); }
  const api = {
    set, state: () => ({ choice, ...using, failed, gl: !!glMap, names: namesStyle }), glMap: () => glMap, leaflet: () => map, apply, retry,
    dispose() { dead = true; waitShown?.disconnect(); clearTimeout(retryTimer); clearTimeout(stallTimer); window.removeEventListener('online', onOnline); map.off('moveend', onMove); },
  };
  current = api;
  return api;
}
export const baseNow = () => current;
