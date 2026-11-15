// Crophalo's Layers on the setup map: the Layers panel in two groups ("NASA data": the NASA GIBS pictures, Regional water storage and the fires; "Terrain analysis": the layers worked out from the land heights; "Turn all overlays off") and a legend card
// for every layer that is on, with its NASA product, what one image spans, the colour bar and the value at the pin, the date row (days from NASA's own list, up to yesterday, snapping across gaps), "Play the last 30 days", the opacity and the credit.
// Not pure (the pure parts are js/gibs.js and js/layeranim.js; the other groups are js/gracelayer.js and js/terrain-layers.js). Checked by scripts/e2e_map.mjs (the layers, grace, panelgroups and alive groups), scripts/e2e_terrain.mjs and scripts/live_check_layers.mjs (NASA, live).
import { southWords, southOf, LAYERS, layerOf, DOMAINS, tileTemplate, tileUrl, parseDomains, newest, snap, stepBy, hasDay, dateWords, legendGradient, buttonWords, WORDS, addDays, FIRES, FIRES_URL, fireRadius, fireTime, fireWords, COLORMAP, GIBS_CREDIT, FIRES_CREDIT } from './gibs.js';
import { initTerrain, isTerrain } from './terrain-layers.js';
import { initGrace } from './gracelayer.js';
import { GRACE } from './grace.js';
import { srcButton } from './srci.js';
import { busy, watchTiles } from './mapbusy.js';
import { motionOff, motionLess, motionQuiet } from './motion.js';
import { PLAY, PLAY_WORDS, frames, coversDays, holdFor, parseColormap, valueAt, palettePixel, hereWords, HERE_WHY, pixelOf, fireOrder, inView, countWords, shortDay } from './layeranim.js';
import { loadLeaflet } from './leaflet-load.js';

const L = globalThis.window?.L ?? (globalThis.document ? await loadLeaflet() : undefined);   // on a page every way in waits for the map library (js/leaflet-load.js); a test with no page loads the file as before
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const LAYERS_ICON = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4 3 9l9 5 9-5z"/><path d="m3 14 9 5 9-5"/></svg>';
const X = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
export const PROBE_MS = 9e3, PROBE_EVERY_MS = 3 * 60e3, DATE_DELAY_MS = 700;

// What the page asks of the network, in one place so a check can stand in for it.
export const net = {
  text: (url, ms = PROBE_MS) => fetch(url, { signal: AbortSignal.timeout(ms) }).then(r => { if (!r.ok) throw new Error(`status ${r.status}`); return r.text(); }),
  tile: (url, ms = PROBE_MS) => new Promise((ok, no) => { const img = new Image(), t = setTimeout(() => { img.src = ''; no(new Error('slow')); }, ms); img.onload = () => { clearTimeout(t); ok(); }; img.onerror = () => { clearTimeout(t); no(new Error('tile')); }; img.src = url; }),
  today: () => new Date().toISOString().slice(0, 10),
  colormap: (url, ms = 15e3) => fetch(url, { signal: AbortSignal.timeout(ms) }).then(r => { if (!r.ok) throw new Error(`status ${r.status}`); return r.text(); }),
  async pixel(url, px, py, ms = 12e3) {   // the palette entry of one pixel of one tile: [r, g, b, alpha], or throws. Read only where NASA's server lets a page read its pictures (it does: CORS is open)
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`status ${r.status}`);
    const blob = await r.blob();
    if (typeof DecompressionStream === 'function') return palettePixel(new Uint8Array(await blob.arrayBuffer()), px, py, bytes => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    const bmp = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = c.height = 1;   // an older browser: the colour as drawn (a clear pixel then reads as not read)
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, px, py, 1, 1, 0, 0, 1, 1); bmp.close?.();
    return [...g.getImageData(0, 0, 1, 1).data];
  },
  fires: (lat, lon, ms = 75e3) => fetch(FIRES_URL(lat, lon), { signal: AbortSignal.timeout(ms) }).then(r => (r.ok ? r.json() : { ok: false, reason: FIRE_WHY[r.status] ?? FIRE_WHY.other })),   // our own server's /api/firms: one JSON object; a refusal is said in plain words, never the server's own
  async why(url, ms = PROBE_MS) {   // why a picture did not load, asked of NASA's server once: 'empty' when it answers that it has no image there (404 or 400), 'offline' with no connection, 'again' when it sends the picture now, else 'down'
    if (globalThis.navigator?.onLine === false) return 'offline';
    if (!url) return 'down';
    try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); return r.status === 404 || r.status === 400 ? 'empty' : r.ok ? 'again' : 'down'; }
    catch { return globalThis.navigator?.onLine === false ? 'offline' : 'down'; }
  },
};

export const FIRE_WHY = Object.freeze({ 404: 'This copy of Crophalo’s server has no fire lookup, so no spots are drawn', 429: 'Crophalo’s server is busy. Try again in a minute', other: 'Not available right now: Crophalo’s server did not answer for NASA FIRMS. Try again later' });

// What the layers keep while the wizard redraws the map around them: which are on, their days, the opacity.
const keep = { on: [], date: {}, opacities: {}, ranges: {}, health: {}, probedAt: 0 };   // opacities: each layer keeps its own (75 until the farmer moves its slider)
export const OPACITY_START = 75;
const opOf = id => keep.opacities[id] ?? OPACITY_START;
let ctl = null;
export const layersCtl = () => ctl;   // the layers of the map on the page now: for the checks
export const layersNow = () => ({ on: [...keep.on], date: { ...keep.date }, opacity: { ...keep.opacities }, health: { ...keep.health } });
export const resetLayers = () => { Object.assign(keep, { on: [], date: {}, opacities: {}, ranges: {}, health: {}, probedAt: 0 }); };

// ui: { right, legends } (the button row, the legend stack). env: { map(), say, toast, groundIsVector() }. Returns { def, dispose, restore, probe }.
export function initLayers(ui, env) {
  const tiles = new Map();   // id -> the Leaflet layer shown; each layer counts its own tiles ({ loaded, failed } since the last change of day), so a day loading unseen for the time-lapse never touches the day shown
  const countsOf = id => tiles.get(id)?.counts;
  let dead = false, probing = null, timer = 0, panelRoot = null;
  const playing = new Map(), reads = new Map(), cmaps = new Map();   // id -> a time-lapse running; id -> the latest reading of the value under the pin; id -> the colormap's entries
  const pending = new Map();   // id -> a date typed, applied after a pause
  let fireGroup = null, fireAnswer = null, fireBusy = false;   // the fire points on the map, the last answer, and whether one is being asked for

  const today = () => net.today();
  const health = id => keep.health[id] ?? { state: 'unknown' };
  const order = () => keep.on;
  const zOf = id => (env.groundIsVector?.() ? 6 : 2) + Math.max(0, order().indexOf(id));   // over the photo and under its names; over the Light map, which draws its own ground
  const zTiles = id => (env.groundIsVector?.() ? zOf(id) : Math.min(zOf(id), 4));   // the place names over the photo sit at 5: no picture layer goes over them, however many are on
  const terrain = initTerrain({ legends: ui.legends }, { map: env.map, pin: env.pin, say: env.say, toast: env.toast, groundIsVector: env.groundIsVector, zOf, isOn: id => keep.on.includes(id) });   // the Terrain analysis group shares the order, the button and "Turn all overlays off"
  const grace = initGrace({ legends: ui.legends }, { map: env.map, pin: env.pin, say: env.say, toast: env.toast, groundIsVector: env.groundIsVector, zOf });   // Regional water storage: one region from our own server, in the NASA data group
  const nameOf = id => (id === GRACE.id ? GRACE.name : layerOf(id)?.name ?? terrain.nameOf(id));

  // ---- the days NASA has an image for, asked once per layer and kept
  async function rangesOf(layer) {
    if (keep.ranges[layer.id]?.length) return keep.ranges[layer.id];
    const ranges = parseDomains(await net.text(DOMAINS(layer)));
    if (!ranges.length) throw new Error('no dates');
    return (keep.ranges[layer.id] = ranges);
  }
  // ---- checking that a layer works: its dates, and one world tile of its newest day
  async function check(layer) {
    try {
      const ranges = await rangesOf(layer), day = newest(ranges, today());
      if (!day) throw new Error('no day');
      await net.tile(tileUrl(layer, day, 1, 0, 0));
      keep.health[layer.id] = { state: 'ok', at: Date.now() };
    } catch (e) { keep.health[layer.id] = { state: 'down', why: String(e?.message ?? e).slice(0, 80), at: Date.now() }; }
  }
  function probe(force = false) {
    if (probing) return probing;
    if (!force && Date.now() - keep.probedAt < PROBE_EVERY_MS && LAYERS.every(l => keep.health[l.id])) return Promise.resolve();
    keep.probedAt = Date.now();
    probing = Promise.all(LAYERS.map(check)).then(() => { probing = null; if (dead) return; drawRows(); for (const id of [...keep.on]) if (health(id).state === 'down') failLayer(id); });
    return probing;
  }

  // ---- the layers on the map
  function makeTiles(layer, day, opacity) {
    const t = watchTiles(L.tileLayer(tileTemplate(layer), { time: day, maxNativeZoom: layer.native, maxZoom: 19, opacity, zIndex: zTiles(layer.id), attribution: '', ...(layer.south != null ? { bounds: L.latLngBounds([layer.south, -180], [90, 180]) } : {}) }), 'layer-' + layer.id);   // no tile is asked for south of the layer's own limit   // the loading sign shows while its tiles come
    t.counts = { loaded: 0, failed: 0 };
    t.drawn = new Map();   // the tiles on the map now, each with whether its picture came: "nothing came" is judged on the view shown, not on the day's whole history (a map moved to new ground after pictures came elsewhere)
    t.on('tileload', e => { t.counts.loaded++; t.retried = false; t.drawn.set(tileKey(e.coords), { el: e.tile, ok: true }); });
    t.on('tileerror', e => { t.counts.failed++; t.counts.lastFailed = e.tile?.src ?? ''; t.drawn.set(tileKey(e.coords), { el: e.tile, ok: false }); });   // the address is asked once more to learn why (explainEmpty)
    t.on('tileunload', e => t.drawn.delete(tileKey(e.coords)));
    t.on('load', () => { if (tiles.get(layer.id) === t) settle(layer.id); });   // every tile of the view came back: none with a picture is said in words
    return t;
  }
  const tileKey = c => `${c.z}/${c.x}/${c.y}`;
  function tilesInView(t) {   // the tiles of a layer that lie in the map's view now (not inView of js/layeranim.js, which counts the fires in view)
    const box = env.map().getContainer().getBoundingClientRect();
    return [...(t?.drawn?.values() ?? [])].filter(({ el }) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom; });
  }
  function addTiles(layer, reveal = false) {
    if (tiles.has(layer.id)) return;
    const t = makeTiles(layer, keep.date[layer.id], opOf(layer.id) / 100);
    t.addTo(env.map()); tiles.set(layer.id, t);
    if (reveal && !motionQuiet()) { const c = t.getContainer?.(); if (c) { c.classList.add('mapx-reveal'); setTimeout(() => c.classList.remove('mapx-reveal'), 900); } }   // a soft fade in, Full only
  }
  function dropTiles(id) { tiles.get(id)?.remove(); tiles.delete(id); }
  function rezindex() { for (const [id, t] of tiles) t.setZIndex(zTiles(id)); terrain.rezindex(); grace.rezindex(); }
  function setDay(id, day) {
    keep.date[id] = day;
    const t = tiles.get(id); if (t) { t.options.time = day; t.counts = { loaded: 0, failed: 0 }; t.redraw(); }
    updateDay(id);
    readHere(id);
  }
  async function turnOn(id) {
    if (isTerrain(id)) { if (!keep.on.includes(id)) { keep.on.push(id); terrain.turnOn(id); refreshButton(); drawRows(); } return true; }
    if (id === GRACE.id) { if (!keep.on.includes(id)) { keep.on.push(id); grace.turnOn(); rezindex(); refreshButton(); drawRows(); } return true; }
    if (id === FIRES.id) return turnOnFires();
    const layer = layerOf(id); if (!layer || keep.on.includes(id)) return true;
    if (health(id).state === 'down') { env.toast?.(`${layer.name}: ${WORDS.down}`); drawRows(); return false; }
    keep.on.push(id);
    let ranges; busy('layer-' + id, true);
    try { ranges = await rangesOf(layer); } catch { busy('layer-' + id, false); keep.on = keep.on.filter(x => x !== id); keep.health[id] = { state: 'down', why: 'dates', at: Date.now() }; env.toast?.(`${layer.name}: ${WORDS.down}`); drawRows(); return false; }
    if (!keep.date[id] || !hasDay(ranges, keep.date[id])) keep.date[id] = newest(ranges, today());
    busy('layer-' + id, false);   // the tiles say the rest
    addTiles(layer, true); renderLegend(id); refreshButton(); drawRows(); readHere(id); southCheck();
    env.say?.(`${layer.name} on the map, image of ${dateWords(keep.date[id])}`);
    return true;
  }
  function turnOff(id) {
    const hadFocus = !!ui.legends.querySelector(`[data-legend="${id}"]`)?.contains(document.activeElement);   // the card about to go holds the focus (its ×, say): it moves to the Layers button, never lost on the page
    stopPlay(id); reads.delete(id);
    keep.on = keep.on.filter(x => x !== id); dropTiles(id);
    if (isTerrain(id)) { terrain.turnOff(id); rezindex(); }
    if (id === GRACE.id) { grace.turnOff(); rezindex(); }
    if (id === FIRES.id) { clearFires(); fireAnswer = null; env.map().off('moveend', countFires); }
    ui.legends.querySelector(`[data-legend="${id}"]`)?.remove();
    ui.legends.hidden = !keep.on.length;
    refreshButton(); drawRows(); env.say?.(keep.on.length ? `${nameOf(id)} off` : 'All layers off');
    if (hadFocus) ui.right.querySelector('[data-panel="layers"]')?.focus();
  }
  function failLayer(id) {   // a layer that was on and now fails its check: said in words, taken off the map
    const layer = layerOf(id); turnOff(id);
    env.toast?.(`${layer?.name}: ${WORDS.down}`);
  }
  function allOff() { for (const id of [...keep.on]) turnOff(id); env.say?.('All layers off'); }

  // ---- fires and hot spots: points from our server, not tiles
  const fireTimers = new Set();
  const clearFires = () => { for (const t of fireTimers) clearTimeout(t); fireTimers.clear(); fireGroup?.remove(); fireGroup = null; };
  function countFires() {
    const el = ui.legends.querySelector('[data-fcount]'); if (!el) return;
    if (!fireAnswer) { el.textContent = ''; return; }
    const b = env.map().getBounds(); el.textContent = countWords(inView(fireAnswer.points, { s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() }));
  }
  function drawFires(a) {
    clearFires(); fireGroup = L.layerGroup();
    const animate = !motionQuiet(), group = fireGroup;   // Full: spots fade in in the order they were seen, the newest few get a calm halo that rings three times and stops; Less and Still: all there at once, no halo motion
    for (const { p, delay, newest } of fireOrder(a.points)) {
      const colour = FIRES.colours[p.confidence] ?? FIRES.colours.nominal, r = fireRadius(p.frp);
      const m = L.circleMarker([p.lat, p.lon], { radius: r, color: '#ffffff', weight: 1.5, fillColor: colour, fillOpacity: animate ? 0 : 0.92, opacity: animate ? 0 : 0.95, bubblingMouseEvents: false, className: 'mapx-fire' });
      m.bindTooltip(`${FIRES.words[p.confidence] ?? 'Confidence not given'} · ${fireTime(p.time)} · ${p.frp == null ? 'power not given' : `${p.frp} MW`} · ${p.satellite}`);
      group.addLayer(m);
      const show = () => { m.setStyle({ fillOpacity: 0.92, opacity: 0.95 }); if (newest) group.addLayer(L.circleMarker([p.lat, p.lon], { radius: r + 8, fill: false, color: colour, weight: 2, opacity: 0.8, interactive: false, className: `mapx-firehalo${animate ? ' ring' : ''}` })); };
      if (animate) { const t = setTimeout(() => { fireTimers.delete(t); if (fireGroup === group) show(); }, delay); fireTimers.add(t); }
      else show();
    }
    group.addTo(env.map()); countFires();
  }
  async function lookFires() {
    if (fireBusy) return; fireBusy = true; busy('fires', true);
    const c = env.map().getCenter(), card = () => ui.legends.querySelector(`[data-legend="${FIRES.id}"]`);
    noteOf(FIRES.id, 'Asking NASA for the spots seen in the last 24 hours…');
    try {
      const a = await net.fires(c.lat, c.lng);
      if (!keep.on.includes(FIRES.id)) return;
      if (!a || a.ok === false) { clearFires(); fireAnswer = null; countFires(); noteOf(FIRES.id, a?.reason ? `${a.reason}.` : fireWords(a)); env.say?.(`${FIRES.name}: ${a?.reason ?? FIRE_WHY.other}`); }
      else { fireAnswer = a; drawFires(a); noteOf(FIRES.id, fireWords(a)); env.say?.(`${FIRES.name}: ${a.count} spots`); }
    } catch { if (keep.on.includes(FIRES.id)) { noteOf(FIRES.id, `${FIRE_WHY.other}.`); env.say?.(`${FIRES.name}: ${FIRE_WHY.other}`); } }   // no answer from our own server (offline, or it took too long): the fires come from NASA FIRMS through it, not from NASA's image server
    finally { fireBusy = false; busy('fires', false); card()?.querySelector('[data-look]')?.removeAttribute('disabled'); }
  }
  async function turnOnFires() {
    if (keep.on.includes(FIRES.id)) return true;
    keep.on.push(FIRES.id); env.map().on('moveend', countFires);
    renderLegend(FIRES.id); refreshButton(); drawRows();
    env.say?.(`${FIRES.name} on the map`);
    await lookFires();
    return true;
  }
  const firesLegendHtml = () => `<section class="mapx-legend" data-legend="${FIRES.id}" aria-label="${esc(FIRES.name)} legend">
      <header><div><b>${esc(FIRES.name)}</b> ${srcButton('firms', `${FIRES.name}: ${FIRES.sub}.`)}<br><span class="cap">${esc(FIRES.plain)}</span></div><button type="button" class="mapx-lx" data-off="${FIRES.id}" aria-label="Turn off ${esc(FIRES.name)}">${X}</button></header>
      <ul class="mapx-dots">${['high', 'nominal', 'low'].map(k => `<li><i style="background:${FIRES.colours[k]}" aria-hidden="true"></i>${esc(FIRES.words[k])}</li>`).join('')}</ul>
      <p class="cap">A bigger dot is a more powerful fire. Touch a dot for its time and power.</p>
      <button type="button" class="btn sm ghost" data-look="${FIRES.id}">Look again at the map centre</button>
      <p class="mapx-here" data-fcount role="status" aria-live="polite"></p>
      <details class="fold mapx-more"><summary>Show more</summary><p class="cap">NASA ${esc(FIRES.sub)}.</p><p class="cap mapx-credit-line">${esc(FIRES_CREDIT)}</p></details>
      <p class="cap mapx-lnote" data-lnote="${FIRES.id}" role="status"></p></section>`;

  // ---- the value of the layer at the field, for the day shown: read from the palette entry of the one pixel under the pin, by NASA's own colormap. Never guessed: when it cannot be read it says why.
  const hereEl = id => ui.legends.querySelector(`[data-here="${id}"]`), markEl = id => ui.legends.querySelector(`[data-mark="${id}"]`);
  function showHere(id, hit, why = '') {
    const layer = layerOf(id), el = hereEl(id), mk = markEl(id); if (!el || !layer) return;
    el.textContent = hereWords(layer, hit, keep.date[id], why);
    const at = hit?.at ?? (hit?.clear ? 0 : null);   // a value under the bottom of the scale stands at its left end
    if (mk) { mk.hidden = at === null; if (at !== null) mk.style.left = `${Math.round(at * 1000) / 10}%`; }   // the marker slides there under Full motion and jumps under Less and Still (css/map.css)
  }
  async function readHere(id) {
    const layer = layerOf(id); if (!layer || layer.kind === 'points') return;
    const pin = env.pin?.(); if (!pin) return showHere(id, null, HERE_WHY.nopin);
    const mine = Symbol(); reads.set(id, mine); const day = keep.date[id];
    try {
      if (!cmaps.has(id)) cmaps.set(id, net.colormap(COLORMAP(layer)).then(x => parseColormap(x, layer.cm)));
      const entries = await cmaps.get(id), at = pixelOf(pin.lat, pin.lon, layer.native);
      const [r, g, b, a] = await net.pixel(tileUrl(layer, day, at.z, at.x, at.y), at.px, at.py);
      if (reads.get(id) !== mine || dead) return;
      const hit = valueAt(entries, r, g, b, a);
      showHere(id, hit, hit ? '' : HERE_WHY.nodata);
    } catch (e) {
      if (reads.get(id) !== mine || dead) return;
      cmaps.delete(id);
      showHere(id, null, /secur|tainted|cors/i.test(String(e?.message ?? e)) ? HERE_WHY.blocked : HERE_WHY.down);
    }
  }
  const onPin = () => { for (const id of keep.on) if (id !== FIRES.id) readHere(id); };
  document.addEventListener('crophalo:prefetch', onPin);

  // ---- the time-lapse: NASA's real days, oldest to newest, one pass, then it stops by itself. Full cross-fades, Less steps without a fade, Still plays nothing by itself (Earlier and Later step instead).
  // The next day's tiles load while the day shown is held; a day whose tiles have not come after 4 s is shown as it is, and the legend says so if NASA has no image there.
  const playBtn = id => ui.legends.querySelector(`[data-play="${id}"]`);
  const sleep = ms => new Promise(done => setTimeout(done, ms));
  function drawPlay(id) {
    const b = playBtn(id); if (!b) return;
    const layer = layerOf(id), run = playing.get(id), days = frames(keep.ranges[id] ?? [], layer, today()), n = days.length;
    b.textContent = run ? PLAY_WORDS.pause : coversDays(days) ? PLAY_WORDS.play : PLAY_WORDS.playN(n);   // the words say what will play
    b.toggleAttribute('data-playing', !!run);   // a button whose words change (Play, Pause) carries no pressed state: a screen reader would say "Pause, pressed"
    b.disabled = !run && n < 2 || (!run && motionOff());
    b.title = motionOff() ? PLAY_WORDS.still : n < 2 ? PLAY_WORDS.few : '';
  }
  const progressOf = (id, text) => { const p = ui.legends.querySelector(`[data-progress="${id}"]`); if (p) p.textContent = text; };
  function updateDay(id) {   // a new day in the card without drawing it again, so focus stays where it was (on Pause, say) and the value keeps its place
    const layer = layerOf(id), card = ui.legends.querySelector(`[data-legend="${id}"]`); if (!layer || !card) return;
    const day = keep.date[id], input = card.querySelector('[data-date]');
    if (input && document.activeElement !== input) input.value = day;
    card.querySelector('[data-day]').textContent = `Image of ${dateWords(day)}`;
    card.querySelector('[data-snap]').textContent = '';
    noteOf(id, layer.note);
    const i = card.querySelector('.srci'); if (i) i.dataset.note = srcNote(layer, day);
    drawPlay(id); settle(id);
  }
  function stopPlay(id, say = false) {
    const run = playing.get(id); if (!run) return;
    run.stop = true; playing.delete(id); run.next?.layer.remove(); drawPlay(id); progressOf(id, ''); hereEl(id)?.setAttribute('aria-live', 'polite');
    if (say) env.say?.('Paused');
  }
  function prepare(id, day) {   // the next day's copy of the layer, on the map but unseen, loading while the current day is held
    const next = makeTiles(layerOf(id), day, 0); next.addTo(env.map());
    const loaded = Promise.race([new Promise(done => next.once('load', done)), sleep(PLAY.loadWaitMs)]);
    return { day, layer: next, loaded, counts: { loaded: 0, failed: 0 } };
  }
  async function showFrame(id, p, fade, run) {   // the prepared day takes the place of the one shown: a cross-fade under Full, at once under Less
    const old = tiles.get(id); if (!old) { p.layer.remove(); return false; }
    await p.loaded;
    const old2 = tiles.get(id);
    if (!old2 || run.stop) { p.layer.remove(); return false; }   // turned off, or paused while the day was loading: the day shown stays
    const c = p.layer.getContainer?.();
    if (fade) c?.classList.add('mapx-xfade');
    if (old2 !== old) { p.layer.remove(); return false; }
    keep.date[id] = p.day; tiles.set(id, p.layer);
    p.layer.setOpacity(opOf(id) / 100); if (fade) old.setOpacity(0); else old.remove();
    updateDay(id); readHere(id);
    if (fade) { await sleep(PLAY.fadeMs); old.remove(); c?.classList.remove('mapx-xfade'); }
    return true;
  }
  async function startPlay(id) {
    const layer = layerOf(id); if (!layer || playing.has(id) || motionOff() || !tiles.has(id)) return;
    const days = frames(keep.ranges[id] ?? [], layer, today()); if (days.length < 2) return;
    const run = { stop: false, next: null }; playing.set(id, run); drawPlay(id); hereEl(id)?.setAttribute('aria-live', 'off');   // the value changes with every day: said once at the end, not on every frame
    env.say?.(`${layer.name}: playing ${days.length} images, ${shortDay(days[0])} to ${shortDay(days.at(-1))}`);
    run.next = prepare(id, days[0]);
    for (let i = 0; i < days.length && !run.stop && !dead; i++) {
      const p = run.next; run.next = null;
      if (!await showFrame(id, p, !motionQuiet(), run)) break;
      progressOf(id, PLAY_WORDS.progress(i + 1, days.length, days[i]));
      if (run.stop || i === days.length - 1) break;
      run.next = prepare(id, days[i + 1]);
      await sleep(motionQuiet() ? PLAY.holdLessMs : holdFor(days.length));
    }
    if (playing.get(id) === run) { playing.delete(id); drawPlay(id); progressOf(id, ''); hereEl(id)?.setAttribute('aria-live', 'polite'); env.say?.(`${layer.name}: back at the newest image. ${hereEl(id)?.textContent ?? ''}`); }   // one pass, then it stops by itself on the newest image
  }
  const togglePlay = id => (playing.has(id) ? stopPlay(id, true) : startPlay(id));

  // ---- the legend cards
  const srcNote = (layer, day) => `${layer.name}: NASA ${layer.sub}. Image of ${dateWords(day)}. ${layer.span}`;
  function legendHtml(layer) {
    const day = keep.date[layer.id], ranges = keep.ranges[layer.id] ?? [], first = ranges[0]?.from ?? '', last = newest(ranges, today()) ?? '', live = playing.has(layer.id) ? 'off' : 'polite';
    return `<section class="mapx-legend" data-legend="${layer.id}" aria-label="${esc(layer.name)} legend">
      <header><div><b>${esc(layer.name)}</b> ${srcButton('gibs', srcNote(layer, day))}<br><span class="cap">${esc(layer.plain)}</span></div><button type="button" class="mapx-lx" data-off="${layer.id}" aria-label="Turn off ${esc(layer.name)}">${X}</button></header>
      <div class="mapx-barwrap"><div class="mapx-bar" role="img" aria-label="${esc(`${layer.name} colours, from ${layer.low} to ${layer.high}`)}" style="background:${legendGradient(layer)}"></div><i class="mapx-mark" data-mark="${layer.id}" hidden aria-hidden="true"></i></div>
      <div class="mapx-ends"><span>${esc(layer.low)}</span><span>${esc(layer.high)}</span></div>
      <p class="mapx-here" data-here="${layer.id}" role="status" aria-live="${live}">${esc(layer.here)}: reading\u2026</p>
      <div class="mapx-date" role="group" aria-label="Image date for ${esc(layer.name)}"><button type="button" class="btn sm ghost" data-step="-1" data-id="${layer.id}">Earlier image</button>
        <input type="date" data-date="${layer.id}" value="${esc(day)}" min="${esc(first)}" max="${esc(last)}" aria-label="Day of the image, ${esc(layer.name)}"><button type="button" class="btn sm ghost" data-step="1" data-id="${layer.id}">Later image</button><button type="button" class="btn sm ghost" data-newest="${layer.id}">Newest</button></div>
      <div class="mapx-playrow"><button type="button" class="btn sm" data-play="${layer.id}">${esc(PLAY_WORDS.play)}</button></div>
      <p class="cap mapx-progress" data-progress="${layer.id}" aria-hidden="true"></p>
      <p class="cap mapx-imageday" data-day="${layer.id}">Image of ${esc(dateWords(day))}</p>
      <details class="fold mapx-more"><summary>Show more</summary><p class="cap">NASA ${esc(layer.sub)}.</p><p class="cap mapx-span">${esc(layer.span)}</p><p class="cap mapx-credit-line">${esc(GIBS_CREDIT)}</p></details>
      <p class="cap mapx-snap" data-snap="${layer.id}" role="status"></p>
      <label class="mapx-op"><span>Opacity</span><input type="range" min="20" max="100" step="5" value="${opOf(layer.id)}" data-op="${layer.id}" aria-label="Opacity of ${esc(layer.name)}"><output>${opOf(layer.id)}%</output></label>
      <p class="cap mapx-lnote" data-lnote="${layer.id}" role="status">${esc(layer.note)}</p></section>`;
  }
  function renderLegend(id, { keepNote = true } = {}) {
    if (id === FIRES.id) {
      const holder = document.createElement('div'); holder.innerHTML = firesLegendHtml();
      const old = ui.legends.querySelector(`[data-legend="${id}"]`), card = holder.firstElementChild;
      if (old) old.replaceWith(card); else ui.legends.append(card);
      ui.legends.hidden = !keep.on.length;
      if (fireAnswer) { card.querySelector('[data-lnote]').textContent = fireWords(fireAnswer); countFires(); }
      return;
    }
    const layer = layerOf(id); if (!layer) return;
    const old = ui.legends.querySelector(`[data-legend="${id}"]`), note = keepNote ? old?.querySelector('[data-lnote]')?.textContent : layer.note;
    const holder = document.createElement('div'); holder.innerHTML = legendHtml(layer);
    const card = holder.firstElementChild;
    if (note != null) card.querySelector('[data-lnote]').textContent = note;
    if (keepNote && old) card.querySelector('[data-snap]').textContent = old.querySelector('[data-snap]')?.textContent ?? '';
    const oldHere = old?.querySelector('[data-here]')?.textContent, oldLeft = old?.querySelector('[data-mark]')?.style.left, oldShown = old && !old.querySelector('[data-mark]')?.hidden;
    if (old) old.replaceWith(card); else ui.legends.append(card);
    if (oldHere) { card.querySelector('[data-here]').textContent = oldHere; const mk = card.querySelector('[data-mark]'); if (oldShown) { mk.hidden = false; mk.style.left = oldLeft; } }   // the last reading stays until the new day's comes
    ui.legends.hidden = !keep.on.length;
    drawPlay(id);
    settle(id);
  }
  const noteKept = id => layerOf(id)?.note ?? '';
  const noteOf = (id, text) => { const n = ui.legends.querySelector(`[data-lnote="${id}"]`); if (n) n.textContent = text; };
  const snapOf = (id, text) => { const n = ui.legends.querySelector(`[data-snap="${id}"]`); if (n) n.textContent = text; };
  const EMPTY = { empty: WORDS.empty, offline: WORDS.offline, down: `${WORDS.down}. ${WORDS.retry}` };
  function settle(id) {
    const t = tiles.get(id), n = ui.legends.querySelector(`[data-lnote="${id}"]`); if (!t || !n) return;
    const shown = tilesInView(t), failed = shown.filter(x => !x.ok);
    if (shown.length && failed.length === shown.length && !t._loading) explainEmpty(id, failed[0].el.src || t.counts.lastFailed);
    else if (shown.some(x => x.ok) && Object.values(EMPTY).includes(n.textContent)) noteOf(id, noteKept(id));
  }
  // No tile of the view came: NASA's own "no image for this day" is said apart from no answer at all (offline, or the server down), never one for the other
  async function explainEmpty(id, url) {
    const t = tiles.get(id); if (!t || t.explaining) return;
    t.explaining = true;
    const why = await net.why(url);
    t.explaining = false;
    if (dead || tiles.get(id) !== t || tilesInView(t).some(x => x.ok)) return;   // another day, or the pictures came meanwhile
    if (why === 'again' && !t.retried) { t.retried = true; t.redraw(); return; }   // NASA sends the picture now: one more try, said nothing
    const words = EMPTY[why] ?? EMPTY.down;
    if (ui.legends.querySelector(`[data-lnote="${id}"]`)?.textContent === words) return;
    noteOf(id, words); env.say?.(words);
  }
  const onOnline = () => { for (const t of tiles.values()) if (tilesInView(t).some(x => !x.ok)) t.redraw(); };   // back online: the pictures that failed are asked again
  addEventListener('online', onOnline);

  ui.legends.addEventListener('click', event => {
    const off = event.target.closest('[data-off]'); if (off) return turnOff(off.dataset.off);
    const play = event.target.closest('[data-play]'); if (play) return togglePlay(play.dataset.play);
    const look = event.target.closest('[data-look]'); if (look) { look.disabled = true; return lookFires(); }
    const stepBtn = event.target.closest('button[data-step]');   // a button: the setup screen around the map carries data-step too (the wizard's step)
    if (stepBtn || event.target.closest('[data-newest]')) stopPlay(stepBtn?.dataset.id ?? event.target.closest('[data-newest]').dataset.newest);
    if (stepBtn) { const id = stepBtn.dataset.id, layer = layerOf(id), to = stepBy(keep.ranges[id] ?? [], keep.date[id], +stepBtn.dataset.step, layer.step, today()); if (!to) { env.say?.(+stepBtn.dataset.step < 0 ? 'No earlier image.' : 'No later image: this is the newest.'); return; } return setDay(id, to); }
    const now = event.target.closest('[data-newest]'); if (now) { const id = now.dataset.newest, to = newest(keep.ranges[id] ?? [], today()); if (to) setDay(id, to); }
  });
  ui.legends.addEventListener('input', event => {
    const op = event.target.closest('[data-op]');
    if (op) { const id = op.dataset.op; keep.opacities[id] = +op.value; op.nextElementSibling.textContent = `${op.value}%`; tiles.get(id)?.setOpacity(+op.value / 100); return; }   // only this layer's own slider changes this layer
    const date = event.target.closest('[data-date]');
    if (date) { const id = date.dataset.date; clearTimeout(pending.get(id)); pending.set(id, setTimeout(() => applyTyped(id, date.value), DATE_DELAY_MS)); }   // a typed date applies a moment after the last digit
  });
  function applyTyped(id, value) {
    const ranges = keep.ranges[id] ?? [], got = snap(ranges, value, today());
    if (!got) return;
    setDay(id, got);
    if (got !== value) { snapOf(id, WORDS.snapped(value, got)); env.say?.(WORDS.snapped(value, got)); }
  }

  // ---- the panel
  const rowHtml = layer => {
    const h = health(layer.id), on = keep.on.includes(layer.id), down = h.state === 'down';
    return `<li><label class="mapx-lrow${on ? ' on' : ''}${down ? ' off' : ''}"${down ? ` title="${esc(h.why ?? '')}"` : ''}><input type="checkbox" data-layer="${layer.id}"${on ? ' checked' : ''}${down ? ' disabled' : ''}><span><b>${esc(layer.name)}</b><span class="cap">${down ? esc(WORDS.down) : esc(layer.plain ?? layer.sub)}</span></span></label></li>`;
  };
  function drawRows() {
    const list = panelRoot?.querySelector('#mapxLayerRows'); if (!list) return;
    const had = panelRoot.contains(document.activeElement) ? document.activeElement : null, row = had?.dataset?.layer, allOffHad = !!had?.matches?.('[data-alloff]');   // the row (or button) the keyboard is on keeps the focus while the rows are drawn again
    list.innerHTML = [...LAYERS, GRACE, FIRES].map(rowHtml).join('');   // the owner's order: the four pictures, the water storage, the fires
    terrain.drawRows(panelRoot);
    const none = panelRoot.querySelector('[data-alloff]'); if (none) none.disabled = !keep.on.length;
    if (row || (allOffHad && none?.disabled)) (panelRoot.querySelector(`[data-layer="${row}"]:not(:disabled)`) ?? panelRoot.querySelector('.mapx-lrow input:not(:disabled)'))?.focus({ preventScroll: true });
  }
  function refreshButton() {
    const b = ui.right.querySelector('[data-panel="layers"]'); if (!b) return;
    const words = buttonWords(keep.on, nameOf); b.querySelector('.mapx-w').textContent = words;
    b.classList.toggle('has-on', keep.on.length > 0);
    b.setAttribute('aria-label', !keep.on.length ? 'Map layers' : keep.on.length === 1 ? `${words}, map layer on` : `${words} on: ${keep.on.map(nameOf).join(', ')}`);   // the name starts with the words on the button (WCAG 2.5.3)
  }
  const def = { id: 'layers', label: 'Layers', icon: LAYERS_ICON, build(body) {
    panelRoot = body;
    body.innerHTML = `<p class="cap">Draw pictures and land maps on your map.</p>
      <button type="button" class="btn sm" data-alloff${keep.on.length ? '' : ' disabled'}>Turn all overlays off</button>
      <fieldset class="mapx-lset"><legend>NASA data</legend>
      <ul class="mapx-rows" id="mapxLayerRows"></ul></fieldset>
      ${terrain.fieldsetHtml()}`;
    drawRows();
    body.addEventListener('change', event => { const box = event.target.closest('[data-layer]'); if (!box) return; const id = box.dataset.layer; if (box.checked) turnOn(id).then(ok => { if (!ok) box.checked = false; }); else turnOff(id); });
    body.addEventListener('click', event => { if (event.target.closest('[data-alloff]')) allOff(); });
    probe(Date.now() - keep.probedAt >= PROBE_EVERY_MS);   // checked again on every opening, at most every three minutes
    return { focus: () => (body.querySelector('input:checked') ?? body.querySelector('input:not(:disabled)') ?? body.querySelector('button'))?.focus(), destroy() { panelRoot = null; } };
  } };

  // ---- the map starts again (the wizard redrew it): what was on comes back
  async function restore() {
    const wasOn = [...keep.on]; keep.on = [];
    for (const id of wasOn) await turnOn(id);
    refreshButton();
  }
  const onBase = () => rezindex();
  const southCheck = () => { for (const id of keep.on) { const l = layerOf(id); if (l?.south == null) continue; const south = southOf(l, env.map().getBounds().getNorth()); if (south) noteOf(id, southWords(l)); else if (ui.legends.querySelector(`[data-lnote="${id}"]`)?.textContent === southWords(l)) noteOf(id, noteKept(id)); } };
  const mapNow = env.map(); mapNow.on('moveend', southCheck);
  document.addEventListener('crophalo:base', onBase);
  // the legends keep clear of the picture's date bar at the foot of the map, however many lines a phone wraps its words into (css/map.css reads --mapx-foot)
  const foot = document.getElementById('mapxPic'), box = ui.legends.closest('#mapx');
  const clearFoot = () => { if (!dead) box?.style.setProperty('--mapx-foot', `${foot && !foot.hidden ? foot.offsetHeight : 0}px`); };
  const footWatch = foot && box && typeof ResizeObserver === 'function' ? new ResizeObserver(clearFoot) : null;
  footWatch?.observe(foot); clearFoot();
  // the NASA layers are not probed until the Layers panel opens (its own build asks): nobody looks at layers on the road to the report, and the probe is 4 date lists and 4 world tiles
  return ctl = { def, restore, probe, turnOn, turnOff, allOff, tilesOf: () => tiles, emptyOf: id => ({ ...(countsOf(id) ?? {}) }), fireAnswer: () => fireAnswer, playing: id => playing.has(id), startPlay, stopPlay, readHere, terrain: () => terrain, grace: () => grace, legendRect: () => (ui.legends.hidden ? null : ui.legends.getBoundingClientRect()),
    dispose() { dead = true; clearTimeout(timer); try { mapNow.off('moveend', southCheck); } catch { /* the map was already gone */ } for (const t of pending.values()) clearTimeout(t); removeEventListener('online', onOnline); document.removeEventListener('crophalo:base', onBase); document.removeEventListener('crophalo:prefetch', onPin); footWatch?.disconnect(); for (const id of [...playing.keys()]) stopPlay(id); for (const id of [...tiles.keys()]) dropTiles(id); terrain.dispose(); grace.dispose(); clearFires(); try { env.map().off('moveend', countFires); } catch { /* the map was already gone */ } } };
}
