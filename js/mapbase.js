// Crophalo's map base: the Satellite / Light switch and the place names (never a water name). Satellite is NASA's own picture (js/nasabase.js: HLS 30 m near the ground, MODIS 250 m under it and zoomed out) with the names of countries,
// regions and places over it; Light is the calm vector map of js/lightstyle.js. Without WebGL (or when its tiles do not come) the names are missing and the ground is NASA's picture, and a sentence says so. The old base stays until the new one is up.
// Not pure: it needs the page, Leaflet and the vendored MapLibre; the pure parts are backdropFor(), creditFor() and SAYS. Checked by scripts/test_mapbase.mjs (the pure parts), scripts/test_nasabase.mjs (the picture), scripts/e2e_map.mjs (the switch, the credits,
// the date, the fallbacks) and scripts/live_check_basemap.mjs (a real browser: names at zoom 3, 6 and 10 over Ontario, no water name in the style).
import { lightStyle, labelsStyle, CREDIT as LABEL_CREDIT } from './lightstyle.js';
import { busy, watchTiles } from './mapbusy.js';
import { CREDIT, blueTemplate, eoxTemplate, aerialTemplate, AERIAL_MIN_ZOOM, AERIAL_NATIVE, clearCredit, CLEAR_FAR_MAX, CLEAR_NEAR_MIN, CLEAR_NEAR_NATIVE, trueTemplate, hlsTemplate, HLS, HLS_NATIVE, TRUE_NATIVE, HLS_MIN_ZOOM, SAYS as PIC_SAYS, pick, trueWords, hlsWords, creditWords } from './nasabase.js';
import { loadLeaflet } from './leaflet-load.js';

const L = globalThis.window?.L ?? (globalThis.document ? await loadLeaflet() : undefined);   // on a page every way in waits for the map library (js/leaflet-load.js); a test with no page loads the file as before
export const PHOTO_CREDIT = CREDIT;   // NASA's picture needs no licence key; its day is added to the line
// The coarse MODIS day is two days back: yesterday's picture is often not made yet (NASA fills a day in during the next one), and a blank map must never be what a farmer sees.
export const yesterday = (now = Date.now()) => new Date(now - 2 * 864e5).toISOString().slice(0, 10);
// The credit line of what is on the map, word for word. Pure. Satellite is the clean base (NASA Blue Marble far, Sentinel-2 cloudless 2016 by EOX close); the newest NASA picture, when it is switched on, adds its own credit and day.
export function creditFor({ ground, names, pic = '', zoom = 0, newest = false, clean = true, aerial = 'none' }) {
  const base = ground === 'photo' ? (!clean ? `${PHOTO_CREDIT}${pic ? ` \u00b7 ${pic}` : ''}` : `${clearCredit(zoom, aerial)}${newest ? ` \u00b7 Newest picture: ${PHOTO_CREDIT.replace(/^Imagery: /, '')}${pic ? `, ${pic}` : ''}` : ''}`) : '';
  return base ? `${base}${names ? ` \u00b7 Place names: ${LABEL_CREDIT}` : ''}` : names ? LABEL_CREDIT : '';   // the Light map's credit is OpenFreeMap's alone
}
// The credit as links: OpenFreeMap, OpenMapTiles and OpenStreetMap each lead to their own page. Pure: [{ text, href? }].
export const CREDIT_LINKS = Object.freeze({ OpenFreeMap: 'https://openfreemap.org', OpenMapTiles: 'https://openmaptiles.org', OpenStreetMap: 'https://www.openstreetmap.org/copyright', 'Sentinel-2 cloudless 2016': 'https://cloudless.eox.at', 'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/', 'The National Map: Orthoimagery': 'https://www.usgs.gov/programs/national-geospatial-program/national-map' });
export function creditParts(text) {
  const out = []; let rest = String(text ?? '');
  for (let m; (m = /OpenFreeMap|OpenMapTiles|OpenStreetMap|Sentinel-2 cloudless 2016|CC BY 4\.0|The National Map: Orthoimagery/.exec(rest));) { if (m.index) out.push({ text: rest.slice(0, m.index) }); out.push({ text: m[0], href: CREDIT_LINKS[m[0]] }); rest = rest.slice(m.index + m[0].length); }
  if (rest) out.push({ text: rest });
  return out;
}
export const STALL_MS = 15e3, RETRY_MS = 10 * 60e3, MANY_ERRORS = 3;
export const SAYS = Object.freeze({
  noGL: 'This browser cannot draw the detailed map (WebGL is switched off), so the map shows the satellite picture without place names.',
  offline: 'This device is offline, so the place names and the detailed light map cannot load. They come back by themselves when you are online again.',
  cleanDown: 'The clean satellite picture did not load, so NASA\'s daily picture shows instead. It can show clouds and gaps between the satellite\'s passes.',
  stalled: 'The detailed map did not load, so the satellite picture shows without place names. It tries again in ten minutes.',
});

// Which backdrop (NASA's satellite picture, or MapLibre's own ground) and which names style a choice needs. Pure.
export function backdropFor({ choice, gl = true }) {
  if (choice === 'sat') return { ground: 'photo', names: gl ? 'photo' : null, note: gl ? '' : null };
  return gl ? { ground: 'gl', names: 'light', note: '' } : { ground: 'photo', names: null, note: 'gl' };
}

// ---- MapLibre, loaded once, with its stylesheet and its Leaflet plugin, from the app's own vendor folder
const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
let loading = null;
function loadGL() {
  if (window.maplibregl && L.maplibreGL) return Promise.resolve(true);
  if (loading) return loading;
  const at = file => new URL(`../vendor/maplibre/${file}`, import.meta.url).href;
  const script = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = ok; s.onerror = () => no(new Error('script')); document.head.append(s); });   // async=false: both are fetched at once and run in this order
  if (!document.querySelector('link[data-maplibre]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = at('maplibre-gl.css'); l.dataset.maplibre = '1'; document.head.append(l); }
  loading = Promise.all([script(at('maplibre-gl.js')), script(at('leaflet-maplibre-gl.js'))]).then(() => !!(window.maplibregl && L.maplibreGL), () => false).then(ok => { if (!ok) loading = null; try { performance.mark('crophalo-gl-ready'); } catch { /* no marks */ } return ok; });
  return loading;
}

let choice = 'sat';                       // the farmer's choice survives the wizard redrawing the map
export const baseChoice = () => choice;
let current = null;                       // the base of the map that is on the page now: for the checks

// Start the base on a Leaflet map. ui: { segment, credit, note }. Returns { set(name), state(), glMap(), dispose() }.
export function initBase(map, ui, { say = () => {} } = {}) {
  // NASA's picture: MODIS 250 m for the whole world (native to zoom 9, drawn larger beyond), and over it the HLS 30 m picture of the day chosen for the place (native to zoom 12, drawn larger beyond: honestly blurrier)
  const day = yesterday();
  // The base is clean: Blue Marble (NASA GIBS, cloud-free, no date) for zoom 0 to 8 and Sentinel-2 cloudless 2016 (EOX, 10 m) from zoom 9; neither has a day. The newest NASA picture below is a choice in the Layers panel, off at first.
  // Blue Marble stays under everything at EVERY zoom (drawn larger, so soft close up): where the Sentinel-2 or the USGS tile has not come yet, or never comes, the farmer sees this and never a dark hole. Order, bottom to top: Blue Marble, Sentinel-2, USGS photos, the daily picture.
  const far = watchTiles(L.tileLayer(blueTemplate, { minZoom: 0, maxZoom: 19, maxNativeZoom: CLEAR_FAR_MAX, zIndex: 0, attribution: '', crossOrigin: true }), 'base-clear');
  const near = watchTiles(L.tileLayer(eoxTemplate, { minZoom: CLEAR_NEAR_MIN, maxZoom: 19, maxNativeZoom: CLEAR_NEAR_NATIVE, zIndex: 0, attribution: '', crossOrigin: true }), 'base-clear');
  // Zoom 13 and nearer: USGS aerial photographs over the Sentinel-2 tiles; a tile the USGS does not have (outside the United States answers 404) leaves the Sentinel-2 tile showing, so there is never a hole. The credit names what is really in view.
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const aerialLayer = L.tileLayer(aerialTemplate, { minZoom: AERIAL_MIN_ZOOM, maxZoom: 19, maxNativeZoom: AERIAL_NATIVE, zIndex: 1, attribution: '', crossOrigin: true, errorTileUrl: BLANK, keepBuffer: 4 });
  const seenOk = new Set(), seenNo = new Set(); let creditTimer = 0;
  const key = e => `${e.coords.z}/${e.coords.x}/${e.coords.y}`;
  const aerialNow = () => (map.getZoom() >= AERIAL_MIN_ZOOM && seenOk.size ? (seenNo.size ? 'both' : 'usgs') : 'none');
  const later = () => { clearTimeout(creditTimer); creditTimer = setTimeout(() => { if (!dead) { credits(); } }, 200); };
  aerialLayer.on('tileload', e => { if (String(e.tile?.src).startsWith('data:')) { seenOk.delete(key(e)); seenNo.add(key(e)); } else { seenNo.delete(key(e)); seenOk.add(key(e)); } later(); });   // a tile that answered 404 shows the blank stand-in, which also "loads": it is not a photograph
  aerialLayer.on('tileerror', e => { seenOk.delete(key(e)); seenNo.add(key(e)); later(); });
  aerialLayer.on('tileunload', e => { seenOk.delete(key(e)); seenNo.delete(key(e)); later(); });
  let newestOn = false, cleanFailed = false, cleanErrors = 0;
  for (const layer of [far, near]) { layer.on('tileload', () => { cleanErrors = 0; }); layer.on('tileerror', () => { if (++cleanErrors >= 4 && !cleanFailed) { cleanFailed = true; apply(); } }); }   // many tiles in a row not coming: NASA's daily picture stands in, and a sentence says so
  const coarse = watchTiles(L.tileLayer(trueTemplate, { time: day, maxNativeZoom: TRUE_NATIVE, maxZoom: 19, zIndex: 1, attribution: '', crossOrigin: true }), 'base-coarse');
  let fine = null, picked = null, picking = false, pickCell = '', pickTimer = 0, pickToken = 0;
  let errors = 0, gl = null, glMap = null, namesStyle = null, failed = '', retryTimer = 0, stallTimer = 0, dead = false, token = 0, using = { ground: 'photo', names: null };
  const wantGL = () => hasWebGL() && navigator.onLine !== false;

  // the ground pictures: the clean base always on Satellite; NASA's daily picture only when it is switched on, or when the clean base failed
  const photo = on => { show(far, on && !cleanFailed); show(near, on && !cleanFailed); show(aerialLayer, on && !cleanFailed); show(coarse, on && (newestOn || cleanFailed)); if (fine) show(fine, on && newestOn); };
  const show = (layer, on) => { if (on && !map.hasLayer(layer)) layer.addTo(map); if (!on && map.hasLayer(layer)) layer.remove(); };
  const sentence = key => { const text = key ? (SAYS[key] ?? PIC_SAYS[key] ?? '') : ''; if (ui.note) { ui.note.textContent = text; ui.note.hidden = !text; } document.dispatchEvent(new CustomEvent('crophalo:basenote', { detail: { text } })); };
  const credits = () => {
    ui.credit.replaceChildren(...creditParts(creditFor({ ...using, pic: picCredit(), zoom: map.getZoom(), newest: newestOn, clean: !cleanFailed, aerial: aerialNow() })).map(p => { if (!p.href) return document.createTextNode(p.text); const a = document.createElement('a'); a.href = p.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = p.text; return a; }));
  };
  const segment = () => { for (const b of ui.segment.querySelectorAll('[data-base]')) b.setAttribute('aria-pressed', b.dataset.base === choice ? 'true' : 'false'); };

  // ---- the picture's day: HLS near the ground when a clear day is found for the place, MODIS otherwise; always said on the map
  let baseKey = '';
  const closeUp = () => map.getZoom() >= HLS_MIN_ZOOM;
  const hlsShown = () => !!(picked?.ok && closeUp());
  const picCredit = () => (using.ground === 'photo' && (newestOn || cleanFailed) ? creditWords(hlsShown() ? picked : null, day) : '');
  const picKey = () => (using.ground === 'photo' && newestOn && closeUp() && picked && !picking ? (picked.ok ? (picked.state === 'cloudy' ? 'cloudy' : '') : 'noHls') : '');
  const noteNow = () => sentence(baseKey || (using.ground === 'photo' && cleanFailed && !newestOn ? 'cleanDown' : picKey()));
  function drawPic() {
    const el = ui.pic; if (!el) return;
    el.hidden = using.ground !== 'photo' || !(newestOn || cleanFailed); if (el.hidden) return;   // the date bar belongs to the newest picture: it shows only while that is on
    const text = picking && closeUp() ? PIC_SAYS.picking : hlsShown() ? hlsWords(picked) : trueWords(day);
    el.querySelector('.mapx-pic-t').textContent = text;
    el.querySelector('.mapx-pic-b').hidden = !(newestOn && closeUp());
    for (const b of el.querySelectorAll('[data-pic]')) b.disabled = picking;
  }
  function putFine() {
    fine?.remove(); fine = null;
    if (picked?.ok) { fine = watchTiles(L.tileLayer(hlsTemplate(HLS[picked.layer]), { time: picked.day, maxNativeZoom: HLS_NATIVE, minZoom: HLS_MIN_ZOOM, maxZoom: 19, zIndex: 1, attribution: '', crossOrigin: true }), 'base-fine'); if (using.ground === 'photo' && newestOn) fine.addTo(map); }
  }
  async function wantPick(before = null) {
    if (dead || waitShown || !newestOn || using.ground !== 'photo' || !closeUp()) return;   // nothing is asked of NASA before the map is on the screen
    const c = map.getCenter(), cell = `${Math.round(c.lat / 0.25)}:${Math.round(c.lng / 0.25)}`;
    if (!before && cell === pickCell && picked) return;
    const mine = ++pickToken; picking = true; drawPic(); busy('picture', true);
    const r = await pick({ lat: c.lat, lon: c.lng, before }).finally(() => busy('picture', false));
    if (mine !== pickToken || dead) return;
    picking = false;
    if (before && !r.ok) { say(PIC_SAYS.noEarlier); }
    else { picked = r; pickCell = cell; putFine(); }
    credits(); noteNow(); drawPic();
    if (picked?.ok) say(`${hlsWords(picked)}`);
  }
  ui.pic?.addEventListener('click', event => {
    const b = event.target.closest('[data-pic]'); if (!b || picking) return;
    if (b.dataset.pic === 'earlier') { if (picked?.ok) wantPick(picked.day); else say(PIC_SAYS.noEarlier); }
    else { pickCell = ''; wantPick(); }
  });

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
    if (gl._container) gl._container.style.zIndex = 5;   // above NASA's picture, below Leaflet's markers
    glMap = gl.getMaplibreMap();
    glMap.on('error', event => { if (event?.error && (event.sourceId || /tile|fetch|network|failed/i.test(String(event.error.message ?? ''))) && ++errors >= MANY_ERRORS) onFail(); });   // one tile that does not come is retried by MapLibre; many mean the service is not answering
    return true;
  }
  let releaseNames = null;   // ends the wait for the names' style when the requests are refused
  function setNames(kind) {   // 'light' | 'photo' | 'paper' | null
    if (!kind) { if (gl && gl._container) gl._container.style.display = 'none'; namesStyle = null; return Promise.resolve(); }
    if (gl?._container) gl._container.style.display = '';
    if (namesStyle === kind) return Promise.resolve();
    namesStyle = kind;
    glMap.setStyle(kind === 'light' ? lightStyle() : labelsStyle(kind === 'photo'));
    return new Promise(done => { const stop = () => { clearTimeout(stallTimer); releaseNames = null; done(); }; releaseNames = () => { glMap.off('idle', stop); stop(); }; glMap.once('idle', stop); clearTimeout(stallTimer); stallTimer = setTimeout(() => { glMap.off('idle', stop); onFail(); done(); }, STALL_MS); });
  }
  // a request that is refused ends the waiting at once (releaseNames): the sign goes and the note says why
  function onFail() { if (failed || dead) return; failed = 'stalled'; clearTimeout(stallTimer); releaseNames?.(); apply(); clearTimeout(retryTimer); retryTimer = setTimeout(retry, RETRY_MS); }
  function retry() { if (dead) return; failed = ''; errors = 0; namesStyle = null; apply(); }

  async function apply() {
    busy('base', true);
    try { await applyNow(); } finally { busy('base', false); }
  }
  async function applyNow() {
    const mine = ++token, lat = map.getCenter().lat;
    const gloriously = !failed && wantGL();
    // the ground does not wait for the vector-map library: on Satellite the NASA picture is drawn first, then the library arrives and the names are added
    if (choice === 'sat' && !map.hasLayer(far) && !map.hasLayer(near)) { photo(true); using = { ground: 'photo', names: using.names }; credits(); drawPic(); try { performance.mark('crophalo-ground-shown'); } catch { /* no marks */ } }
    const glOk = gloriously && (ensureGL() || await loadGL().then(ok => ok && !dead && ensureGL()));
    if (mine !== token || dead) return;
    const plan = backdropFor({ choice, lat, gl: !!glOk });
    const key = !gloriously ? (failed ? 'stalled' : navigator.onLine === false ? 'offline' : 'noGL') : !glOk ? 'noGL' : '';
    // the ground first (the old one stays until the new one is up), then the names
    photo(plan.ground === 'photo');
    using = { ground: plan.ground === 'gl' ? 'gl' : plan.ground, names: plan.names };
    if (plan.ground === 'gl') { await setNames('light'); if (mine !== token || dead) return; photo(false); }
    else await setNames(plan.names);
    if (mine !== token || dead) return;
    baseKey = key; credits(); noteNow(); drawPic(); segment(); if (plan.ground === 'photo') wantPick();
    document.dispatchEvent(new CustomEvent('crophalo:base', { detail: { ground: using.ground, names: using.names } }));   // the layers over the map re-stack themselves
  }

  function set(name) {
    if (name !== 'sat' && name !== 'light') return;
    choice = name; segment(); apply();
    say(name === 'sat' ? 'Satellite map' : 'Street map');
  }
  ui.segment.addEventListener('click', event => { const b = event.target.closest('[data-base]'); if (b) set(b.dataset.base); });
  const onMove = () => { clearTimeout(pickTimer); pickTimer = setTimeout(wantPick, 700); };
  const onZoom = () => { credits(); noteNow(); drawPic(); wantPick(); };
  const setNewest = on => { newestOn = !!on; if (!newestOn) pickToken++; photo(using.ground === 'photo'); if (newestOn) putFine(); credits(); noteNow(); drawPic(); if (newestOn) wantPick(); document.dispatchEvent(new CustomEvent('crophalo:newestpicture', { detail: { on: newestOn, day } })); };
  map.on('moveend', onMove); map.on('zoomend', onZoom);
  const onOnline = () => { if (failed || !using.names) retry(); };
  window.addEventListener('online', onOnline);
  // The base starts when the map is on the screen: the map drawn in the hidden setup screen at the page start asks for no tiles and no MapLibre until it is shown, so the first screen stays light.
  const box = map.getContainer(), onScreen = () => box.offsetWidth > 0 && box.offsetHeight > 0;
  let waitShown = null;
  segment(); credits();
  if (onScreen()) apply();
  else { waitShown = new ResizeObserver(() => { if (dead || !onScreen()) return; waitShown.disconnect(); waitShown = null; apply(); }); waitShown.observe(box); }
  const api = {
    set, setNewest, newest: () => newestOn, state: () => ({ choice, ...using, failed, gl: !!glMap, names: namesStyle, newest: newestOn, clean: !cleanFailed }), glMap: () => glMap, leaflet: () => map, apply, retry,
    dispose() { dead = true; waitShown?.disconnect(); clearTimeout(retryTimer); clearTimeout(stallTimer); window.removeEventListener('online', onOnline); map.off('moveend', onMove); map.off('zoomend', onZoom); clearTimeout(pickTimer); pickToken++; },
  };
  current = api;
  return api;
}
export const baseNow = () => current;
