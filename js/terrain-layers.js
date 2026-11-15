// Crophalo's Terrain analysis on the setup map: Slope, Erosion exposure, Frost pockets, Sun and shade and Relief shading, worked out from Terrain Tiles heights in a module worker (or on the page in small steps when no worker starts)
// and drawn as canvas tiles under the place names, each with a legend card: its classes or units in words, the height map under the view and its credit, the grid, the value at the pin, an "i" card and an honest "no heights here".
// Not pure (the maths is js/terrain-math.js, the fetching js/terrain-jobs.js). Checked by scripts/e2e_terrain.mjs (each layer on and off, the words, the worker, long tasks, fit at 320 and 1280, axe).
import { TERRAIN_LAYERS, terrainLayer, TERRAIN_TILES, TILE, MID, SLOPE_CLASSES, EROSION_CLASSES, FROST_CLASSES, KEYS_WORDS, SAYS, METHOD, SHADE_RGB, SHADE_ALPHA, TILES_LINE, fromWords, creditWords, shortNames, gridWords, rowSize, pixelAt,
  williamsK, K_LOAM, fournier, erosionFactor, textureWords, soilFromSoilGrids, rainYears, slopeHere, frostHere, erosionHere, heightHere, sunDayWords, lowSunWords } from './terrain-math.js';
import { srcButton } from './srci.js';
import { busy } from './mapbusy.js';
import { motionOff, motionQuiet } from './motion.js';
import { sunAt, sunEvents, sunPath, clockParts, compass8, heightWords, timesAreWords } from './sun.js';
import { loadLeaflet } from './leaflet-load.js';

const L = globalThis.window?.L ?? (globalThis.document ? await loadLeaflet() : undefined);   // on a page every way in waits for the map library (js/leaflet-load.js); a test with no page loads the file as before
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const X = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
export const HELLO_MS = 15e3, PAGE_BUDGET_MS = 6, VIEW_DELAY_MS = 160, HOUR_DELAY_MS = 220;
export const PLAY_DAY = { holdMs: 700, holdLessMs: 900, frameWaitMs: 4000 };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.y}-${pad(d.m)}-${pad(d.d)}`;

// ---- what the page asks of the outside, in one place so a check can stand in for it
const SOILGRIDS = (lat, lon) => `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}&property=sand&property=silt&property=clay&property=soc&depth=0-5cm&depth=5-15cm&value=mean`;
export const terrainNet = {
  template: TERRAIN_TILES,   // the height tiles
  worker: true,              // false: work on the page in small steps, as when a browser cannot start a module worker
  now: () => Date.now(),
  async soil(lat, lon) {     // the top 15 cm at the pin, from ISRIC SoilGrids: { sand, silt, clay, carbon } in %
    const r = await fetch(SOILGRIDS(lat, lon), { signal: AbortSignal.timeout(30e3) });
    if (!r.ok) throw Object.assign(new Error(r.status === 429 ? 'busy' : 'down'), { why: 'down' });
    const soil = soilFromSoilGrids(await r.json());
    if (!soil) throw Object.assign(new Error('no soil'), { why: 'nosoil' });
    return soil;
  },
  async rain(lat, lon) {     // the monthly rain of whole years at the pin, from the report's own NASA POWER record (satellite rain first)
    const d = await import('./data.js'), got = await d.fetchPower(lat, lon);
    if (!got.ok) throw Object.assign(new Error(got.reason), { why: 'down' });
    const f = fournier(rainYears(got.S, d.lastFullYear()));
    if (!f || f.years < 5) throw Object.assign(new Error('few years'), { why: 'few' });
    return { ...f, source: got.S.rainSource };
  },
  async clock(lat, lon) {    // the field's own clock, as the spot card reads it: { zone } or { offsetMin }; {} means sun time
    const d = await import('./data.js'), place = d.cleanPlace(lat, lon); if (place.reason) return {};
    try {
      const got = await d.cachedJSON(d.forecastUrl(place), { keep: d.KEEP.forecast, limit: d.LIMIT.forecast, check: json => (d.buildForecast(json, Date.now()) ? '' : 'unreadable') });
      const zone = got.json?.timezone;
      if (typeof zone === 'string' && /^[A-Za-z]+\/[A-Za-z0-9_/+-]+$/.test(zone)) return { zone };
      return Number.isFinite(got.json?.utc_offset_seconds) ? { offsetMin: got.json.utc_offset_seconds / 60 } : {};
    } catch { return {}; }
  },
};
export const isTerrain = id => TERRAIN_LAYERS.some(l => l.id === id);

// ---- the engine: one module worker for the page (it keeps its tiles while the wizard redraws the map), or the same work on the page in small steps
let engineAt = null, jobSeq = 0;
function engine() { return (engineAt ??= startEngine()); }
async function startEngine() {
  if (terrainNet.worker !== false && typeof Worker === 'function') {
    let w = null;
    try { w = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' }); } catch { w = null; }   // a browser without module workers
    if (w) {
      const ready = await new Promise(done => {
        const t = setTimeout(() => done(false), HELLO_MS);
        w.addEventListener('message', e => { if (e.data?.type === 'ready') { clearTimeout(t); done(true); } });
        w.addEventListener('error', () => { clearTimeout(t); done(false); });
        w.postMessage({ type: 'hello' });
      });
      if (ready) return workerEngine(w);
      w.terminate();
    }
  }
  return pageEngine();
}
function workerEngine(w) {
  const waiting = new Map();
  w.addEventListener('message', e => { const m = e.data; const done = m && waiting.get(m.id); if (done) { waiting.delete(m.id); done(m); } });
  w.addEventListener('error', () => { for (const done of waiting.values()) done({ ok: false, why: 'error' }); waiting.clear(); engineAt = null; });   // the next job starts afresh
  return {
    kind: 'worker',
    run: job => new Promise(done => { waiting.set(job.id, done); w.postMessage(job); }),
    cancel: id => w.postMessage({ type: 'cancel', id }),
    retry: () => w.postMessage({ type: 'retry' }),
    counts: () => new Promise(done => { const id = `counts${++jobSeq}`; waiting.set(id, m => done(m.counts)); w.postMessage({ type: 'counts', id }); }),
  };
}
async function pageEngine() {
  const { createEngine } = await import('./terrain-jobs.js'), e = createEngine({ budgetMs: PAGE_BUDGET_MS });
  return { kind: 'page', run: e.run, cancel: e.cancel, retry: e.retry, counts: async () => e.counts() };
}
export const terrainEngine = async () => { const e = await engine(); return { kind: e.kind, counts: await e.counts() }; };   // for the checks
export const resetTerrainEngine = () => { engineAt = null; };   // for the checks: the next layer starts a new engine (a worker, or the page when terrainNet.worker is false)

// ---- the field's clock and the sun on a date and hour
function localHour(ms, opts) { const p = clockParts(ms, opts); return p.hh + p.mm / 60; }
export function momentOf(date, hour, opts) {   // the UTC moment of a whole hour on the field's clock (a zone, an offset or sun time)
  const want = Date.UTC(date.y, date.m - 1, date.d, hour);
  let t = want - Math.round(Number.isFinite(opts.offsetMin) ? opts.offsetMin : (opts.lon ?? 0) * 4) * 6e4;   // a whole minute: the clock is read to the minute, so a first guess with seconds in it kept them (08:00 came out as 07:59:39)
  for (let i = 0; i < 3; i++) { const p = clockParts(t, opts); t += want - Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm); }
  return t;
}
export function hourRange(date, lat, lon, opts) {   // the whole hours with the sun up, on the field's clock; null when it does not rise
  const ev = sunEvents(date, lat, lon);
  if (ev.state === 'night') return null;
  if (ev.state === 'day') return { min: 0, max: 23, ev };
  const min = Math.ceil(localHour(ev.rise, opts)), max = Math.floor(localHour(ev.set, opts));
  return min <= max ? { min, max, ev } : { min: Math.round(localHour(ev.noon, opts)), max: Math.round(localHour(ev.noon, opts)), ev };
}

const keep = { opacity: {}, strong: false, sun: { date: '', hour: null }, soil: new Map(), rain: new Map(), clocks: new Map() };   // what stays while the wizard redraws the map
let current = null;
export const terrainCtl = () => current;   // the terrain layers of the map on the page now: for the checks
export const terrainNow = () => ({ opacity: { ...keep.opacity }, strong: keep.strong, sun: { ...keep.sun } });

function ensureStyle() {   // the terrain styles live beside the map's: loaded once, when the map first starts
  if (document.querySelector('link[data-terrain-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../css/terrain.css', import.meta.url).href; l.dataset.terrainCss = '1'; document.head.append(l);
}

// ui: { legends }. env: { map(), pin(), say, toast, groundIsVector(), zOf(id), isOn(id) }.
export function initTerrain(ui, env) {
  ensureStyle();
  const on = new Map();   // id → { def, layer, cz, live: Map(canvas → tile), prefixes, inputs, timer, gate }
  const view = { native: 12, key: '' };
  let dead = false, pinSeq = 0, viewTimer = 0, hourTimer = 0, play = null, clockOpts = {}, clockKey = '';
  const map = () => env.map();
  const card = id => ui.legends.querySelector(`[data-legend="${id}"]`);
  const part = (id, attr) => card(id)?.querySelector(`[${attr}]`);
  const opacityOf = id => keep.opacity[id] ?? terrainLayer(id).opacity;
  const zIndexOf = id => { const z = env.zOf?.(id) ?? 3; return env.groundIsVector?.() ? z : Math.min(z, 4); };   // under the place names (5) over the photo; over the Light map, which draws its own ground
  const czFor = zoom => { const v = Math.floor(zoom); return v < 12 ? Math.min(v, view.native) : view.native >= 13 && v >= 13 ? 13 : Math.min(12, view.native); };
  const gridAt = z => { const c = map().getCenter(), at = pixelAt(c.lat, c.lng, z); return rowSize(z, at.y, MID + at.py); };

  // ---- the panel rows
  const fieldsetHtml = () => `<fieldset class="mapx-lset tl-set"><legend>Terrain analysis</legend>
      <p class="cap tl-setnote">From the land’s height: SRTM or a finer national map.</p>
      <ul class="mapx-rows" id="mapxTerrainRows"></ul></fieldset>`;
  function drawRows(root) {
    const list = root?.querySelector('#mapxTerrainRows'); if (!list) return;
    list.innerHTML = TERRAIN_LAYERS.map(l => { const lit = !!env.isOn?.(l.id); return `<li><label class="mapx-lrow${lit ? ' on' : ''}"><input type="checkbox" data-layer="${l.id}"${lit ? ' checked' : ''}><span><b>${esc(l.name)}</b><span class="cap">${esc(l.plain ?? l.sub)}</span></span></label></li>`; }).join('');
  }

  // ---- the legend cards
  const swatch = colour => (colour ? `<i class="tl-sw" style="background:${colour}" aria-hidden="true"></i>` : '<i class="tl-sw tl-none" aria-hidden="true"></i>');
  function keysHtml(id) {
    if (id === 'slope') return `<ul class="tl-keys" aria-label="Slope classes">${SLOPE_CLASSES.map(k => `<li>${swatch(k.colour)}<span>${esc(`${k.range} (${k.degrees}): ${k.words}${k.colour ? '' : `, ${KEYS_WORDS.notColoured}`}`)}</span></li>`).join('')}</ul>`;
    if (id === 'erosion') return `<ul class="tl-keys" aria-label="Erosion exposure classes">${EROSION_CLASSES.map(k => `<li>${swatch(k.colour)}<span>${esc(`${k.words}: ${k.range}${k.colour ? '' : `, ${KEYS_WORDS.notColoured}`}`)}</span></li>`).join('')}</ul><p class="cap">1 is a 9 % slope of loam under moderate rain. A relative index, not tonnes of soil.</p>`;
    if (id === 'frost') return `<ul class="tl-keys" aria-label="Frost pocket classes">${FROST_CLASSES.map(k => `<li>${swatch(k.colour)}<span>${esc(`${k.words}: ${k.rule}`)}</span></li>`).join('')}</ul><p class="cap">On slopes under 5 % only. Not a temperature measurement or a forecast; lakes, wide flats and the sea are not judged.</p>`;
    if (id === 'sunshade') return `<ul class="tl-keys" aria-label="Sun and shade">${`<li>${swatch(`rgba(${SHADE_RGB.join(',')},${SHADE_ALPHA})`)}<span>${esc(KEYS_WORDS.sunShade)}</span></li><li>${swatch('rgba(255,250,235,1)')}<span>${esc(KEYS_WORDS.sunLit)}</span></li>`}</ul><p class="cap">Shadows of the land’s shape only: trees, buildings and clouds are not included.</p>`;
    return `<div class="tl-bar" role="img" aria-label="Relief shading, from clear to dark grey"></div><p class="cap">${esc(KEYS_WORDS.relief)}</p>`;
  }
  const sunHtml = () => `<div class="tl-when" role="group" aria-label="Date and hour of the shadows">
      <label class="tl-field"><span>Date</span><input type="date" data-tdate value="${esc(keep.sun.date)}"></label>
      <label class="tl-field"><span>Hour</span><input type="range" data-thour min="0" max="23" step="1" value="${keep.sun.hour ?? 12}"><output data-thourout>${pad(keep.sun.hour ?? 12)}:00</output></label>
      <button type="button" class="btn sm" data-tplay>Play the day</button></div>
      <p class="cap" data-tclock></p><p class="cap" data-tsunpos></p>`;
  const srcKeys = id => (id === 'erosion' ? ['terrain', 'soilgrids', on.get('erosion')?.inputs?.rain?.source === 'merra2' ? 'merra2' : 'gpm'] : ['terrain']);
  function noteFor(entry) {   // "For this figure" in the "i" card: what was computed, from what, on which grid
    const id = entry.def.id, z = entry.cz, g = gridAt(z).gx, names = shortNames(entry.prefixes);
    const base = `${entry.def.name} computed by Crophalo from ${names} heights on a ${gridWords(g)}. ${METHOD[id]}`;
    if (id !== 'erosion' || entry.inputs?.state !== 'ready') return base;
    const { soil, rain, k } = entry.inputs;
    return `${base} Soil at your field (ISRIC SoilGrids, top 15 cm): sand ${Math.round(soil.sand)} %, silt ${Math.round(soil.silt)} %, clay ${Math.round(soil.clay)} %, organic carbon ${soil.carbon.toFixed(1)} %, K = ${k.toFixed(2)}. Rain: Modified Fournier Index ${Math.round(rain.mfi)} mm, whole years ${rain.first} to ${rain.last}.`;
  }
  function legendHtml(entry) {
    const d = entry.def, id = d.id, op = opacityOf(id);
    return `<section class="mapx-legend tl-legend" data-legend="${id}" aria-label="${esc(d.name)} legend">
      <header><div><b>${esc(d.name)}</b> <span class="tl-i">${srcButton(srcKeys(id), noteFor(entry))}</span><br><span class="cap">${esc(d.plain)}</span></div><button type="button" class="mapx-lx" data-off="${id}" aria-label="Turn off ${esc(d.name)}">${X}</button></header>
      ${keysHtml(id)}
      ${id === 'sunshade' ? sunHtml() : ''}
      <p class="mapx-here" data-there="${id}" role="status" aria-live="polite">${esc(d.here)}: reading…</p>
      ${id === 'sunshade' ? '<p class="mapx-here tl-day" data-tday role="status" aria-live="polite"></p>' : ''}
      ${id === 'erosion' ? '<p class="cap tl-inputs" data-tinputs role="status"></p>' : ''}
      <details class="fold mapx-more"><summary>Show more</summary><p class="cap" data-tfrom="${id}">${esc(fromWords(entry.prefixes))}</p><p class="cap" data-tgrid="${id}"></p><p class="cap tl-credit" data-tcredit="${id}">${esc(TILES_LINE)}.</p></details>
      ${id === 'relief' ? `<label class="tl-check"><input type="checkbox" data-tstrong${keep.strong ? ' checked' : ''}><span>Stronger shading (heights × 3)</span></label>` : ''}
      <label class="mapx-op tl-op"><span>Opacity</span><input type="range" min="20" max="100" step="5" value="${op}" data-top="${id}" aria-label="Opacity of ${esc(d.name)}"><output>${op}%</output></label>
      <p class="cap mapx-lnote" data-tnote="${id}" role="status"></p>
      <button type="button" class="btn sm ghost tl-retry" data-tretry="${id}" hidden>Try again</button></section>`;
  }
  function renderLegend(entry) {
    const holder = document.createElement('div'); holder.innerHTML = legendHtml(entry);
    const old = card(entry.def.id), fresh = holder.firstElementChild;
    if (old) old.replaceWith(fresh); else ui.legends.append(fresh);
    ui.legends.hidden = false;
  }
  const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };

  // ---- the layers on the map
  function optsFor(id) {
    if (id === 'relief') return { strong: keep.strong };
    if (id === 'erosion') return { factor: on.get('erosion')?.inputs?.factor };
    if (id === 'sunshade') { const s = sunNow(); return { azimuth: s.sun.azimuth, apparent: s.sun.apparent }; }
    return {};
  }
  function makeLayer(entry) {
    const Grid = L.GridLayer.extend({ createTile: (coords, done) => tileFor(entry, coords, done) });
    const layer = new Grid({ tileSize: TILE, maxNativeZoom: entry.cz, minZoom: entry.def.minZoom, maxZoom: 19, opacity: opacityOf(entry.def.id) / 100, zIndex: zIndexOf(entry.def.id),
      className: `tl-layer${entry.def.sharp ? ' tl-sharp' : ''}`, updateWhenZooming: false, keepBuffer: 1 });
    layer.on('tileunload', e => dropTile(entry, e.tile));
    return layer;
  }
  function tileFor(entry, coords, done) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = TILE;
    const t = { canvas, z: coords.z, x: coords.x, y: coords.y, state: 'busy', job: 0, gen: 0 };
    entry.live.set(canvas, t);
    paint(entry, t).then(() => done(null, canvas), () => done(null, canvas));
    return canvas;
  }
  async function paint(entry, t) {
    const gen = ++t.gen, eng = await engine();
    if (t.job) eng.cancel(t.job);
    const id = ++jobSeq; t.job = id; t.state = 'busy'; changed(entry);
    const res = await eng.run({ type: 'tile', id, kind: entry.def.id, z: t.z, x: t.x, y: t.y, template: terrainNet.template, opts: optsFor(entry.def.id) });
    if (t.gen !== gen || dead || !entry.live.has(t.canvas)) return;
    t.job = 0;
    const g = t.canvas.getContext('2d');
    if (res.ok) { g.putImageData(new ImageData(new Uint8ClampedArray(res.rgba), TILE, TILE), 0, 0); Object.assign(t, { state: 'ok', prefixes: res.prefixes, whole: res.whole, native: res.native, lo: res.lo, hi: res.hi, gx: res.gx, gy: res.gy, missing: res.missing }); }
    else if (res.why !== 'cancelled') { g.clearRect(0, 0, TILE, TILE); t.state = res.why; }
    t.drawnGen = t.gen;
    changed(entry);
  }
  function dropTile(entry, canvas) { const t = entry.live.get(canvas); if (!t) return; if (t.job) engineAt?.then(e => e.cancel(t.job)); entry.live.delete(canvas); changed(entry); }
  function repaint(entry) { for (const t of entry.live.values()) paint(entry, t); }
  function attach(entry) {   // on the map at the computing zoom, or off with the reason said
    const z = map().getZoom(), id = entry.def.id;
    let gate = z < entry.def.minZoom ? entry.def.zoomIn : '';
    if (!gate && id === 'erosion' && entry.inputs?.state !== 'ready') gate = 'inputs';
    if (!gate && id === 'sunshade') { const s = sunNow(); if (!s.range) gate = SAYS.polarNight; else if (!(s.sun.apparent > 0)) gate = SAYS.sunDown; }
    entry.gate = gate;
    if (gate) { if (entry.layer) { for (const t of entry.live.values()) if (t.job) engineAt?.then(e => e.cancel(t.job)); entry.layer.remove(); entry.layer = null; entry.live.clear(); } status(entry); return; }
    const cz = czFor(z);
    if (entry.layer && entry.cz !== cz) { entry.cz = cz; entry.layer.options.maxNativeZoom = cz; entry.layer.redraw(); }
    else if (!entry.layer) {
      entry.cz = cz; entry.layer = makeLayer(entry); entry.layer.addTo(map());
      if (!entry.revealed && !motionQuiet()) { const c = entry.layer.getContainer?.(); if (c) { c.classList.add('mapx-reveal'); setTimeout(() => c.classList.remove('mapx-reveal'), 900); } }   // a soft fade in, Full motion only
      entry.revealed = true;
    }
    status(entry);
  }
  const changed = entry => { clearTimeout(entry.timer); entry.timer = setTimeout(() => status(entry), 120); };
  function status(entry) {   // the legend's lines from the tiles in view: the source, the grid, the credit, and what is missing or still being worked out
    if (dead || !on.has(entry.def.id)) return;
    const id = entry.def.id, tiles = [...entry.live.values()], ok = tiles.filter(t => t.state === 'ok');
    const seen = []; for (const t of ok) for (const p of t.prefixes ?? []) if (!seen.includes(p)) seen.push(p);
    if (seen.length) entry.prefixes = seen;
    const busy = tiles.filter(t => t.state === 'busy').length, failed = tiles.filter(t => t.state === 'fetch' || t.state === 'decode' || t.state === 'error').length, none = tiles.filter(t => t.state === 'none').length;
    const g = gridAt(entry.cz).gx, whole = ok.length ? ok.some(t => t.whole) : true, coarse = entry.cz < 12 && view.native >= 12;
    setText(part(id, 'data-tfrom'), fromWords(entry.prefixes));
    setText(part(id, 'data-tgrid'), entry.gate && entry.gate !== 'inputs' ? '' : `${gridWords(g)} · ${whole ? SAYS.whole(3 * g) : SAYS.decimal}${coarse ? `; zoom in for the ${gridWords(gridAt(Math.min(12, view.native)).gx)}` : ''}`);
    setText(part(id, 'data-tcredit'), entry.prefixes.length ? creditWords(entry.prefixes) : `${TILES_LINE}.`);
    const i = card(id)?.querySelector('.srci'); if (i) i.dataset.note = noteFor(entry);
    let note = '';
    if (entry.gate === 'inputs') note = '';
    else if (entry.gate) note = entry.gate;
    else if (failed && failed + none === tiles.length) note = SAYS.noHeights;
    else if (failed) note = `${SAYS.someMissing} Try again.`;
    else if (none && none === tiles.length) note = SAYS.none;
    else if (busy) note = SAYS.working;
    if (!note && id === 'relief' && keep.strong) note = SAYS.stronger;
    if (!note && id === 'sunshade' && !entry.gate) { const s = sunNow(), relief = Math.max(0, ...ok.map(t => t.hi - t.lo)), reach = ok.length ? TILE * Math.min(...ok.map(t => Math.min(t.gx, t.gy))) : 0; note = reach ? lowSunWords(s.sun.apparent, reach, relief) : ''; }
    const noteEl = part(id, 'data-tnote');
    if (note === SAYS.working) { if (noteEl && !noteEl.querySelector('.sk')) noteEl.innerHTML = `<span class="sr">${SAYS.working}</span><i class="sk" aria-hidden="true" style="width:70%"></i>`; }   // grey skeleton line while the heights are read
    else { if (noteEl?.querySelector('.sk')) noteEl.textContent = ''; setText(noteEl, note); }
    const retry = card(id)?.querySelector('[data-tretry]'); if (retry) retry.hidden = !(failed || entry.inputs?.state === 'failed');
    if (id === 'sunshade') drawSun();
    if (play && !busy) play.frameDone?.();
  }

  // ---- the value at the pin
  const WHY = { fetch: 'the height tiles did not load', decode: 'the height tiles did not load', error: 'it could not be worked out', none: 'no heights here', far: 'no heights this far north or south' };
  function hereText(entry, res, s) {
    const d = entry.def, v = res?.values;
    if (!res?.ok) return `No value for your field: ${WHY[res?.why] ?? WHY.error}.`;
    if (d.id === 'slope') return `${d.here}: ${slopeHere(v)}`;
    if (d.id === 'relief') return `${d.here}: ${heightHere(v, shortNames(res.prefixes))}`;
    if (d.id === 'frost') return frostHere(v);
    if (d.id === 'erosion') return entry.inputs?.state === 'ready' ? `${d.here}: ${erosionHere(v)}` : `No value for your field: ${erosionWhy(entry)}.`;
    const when = `${+s.date.d} ${MON[s.date.m - 1]}, ${pad(s.hour)}:00`;
    if (!s.range) return `${when}: ${SAYS.polarNight}`;
    if (!(s.sun.apparent > 0)) return `${when}: the sun is down.`;
    return `${d.here}: ${v.shade ? 'in the shade of higher ground' : v.cos > 0 ? 'in the sun' : 'on ground turned away from the sun'} at ${pad(s.hour)}:00.`;   // where the sun stands is said on the line above
  }
  async function readPin() {
    if (!on.size || dead) return;
    const pin = env.pin?.(), mine = ++pinSeq, zoom = map().getZoom();
    const gated = e => zoom < e.def.minZoom;
    for (const e of on.values()) if (gated(e)) setText(part(e.def.id, 'data-there'), `${e.def.here}: zoom in to read it`);
    if (!pin) { for (const e of on.values()) if (!gated(e)) setText(part(e.def.id, 'data-there'), `No value for your field: ${SAYS.noPin}.`); setText(card('sunshade')?.querySelector('[data-tday]'), ''); return; }
    if ([...on.values()].every(gated)) return;
    const s = on.has('sunshade') ? sunNow() : null, opts = { factor: on.get('erosion')?.inputs?.factor };
    if (s && s.range) { const at = sunAt(s.ms, pin.lat, pin.lon); opts.sun = { azimuth: at.azimuth, apparent: at.apparent }; opts.path = dayPath(s.date, pin); }
    const res = await (await engine()).run({ type: 'point', id: ++jobSeq, lat: pin.lat, lon: pin.lon, z: czFor(Math.max(zoom, 9)), template: terrainNet.template, opts });
    if (mine !== pinSeq || dead) return;
    for (const e of on.values()) if (!gated(e)) setText(part(e.def.id, 'data-there'), hereText(e, res, s));
    const day = card('sunshade')?.querySelector('[data-tday]');
    if (day) setText(day, res.ok && s?.range ? sunDayWords(res.values) ?? '' : '');
  }
  const dayPath = (date, pin) => sunPath(date, pin.lat, pin.lon, 10).map(p => ({ height: p.height, azimuth: p.azimuth, minutes: 10 }));
  const onPin = () => { for (const e of on.values()) if (e.def.id === 'erosion') erosionInputs(e); clockFor(); readPin(); };
  document.addEventListener('crophalo:prefetch', onPin);

  // ---- erosion exposure: the soil and the rain at the pin
  const RAIN_NAME = { imerg: 'NASA GPM IMERG satellite rain', merra2: 'NASA’s MERRA-2 weather model', era5: 'the ERA5 back-up record' };
  function erosionWhy(entry) {
    const s = entry.inputs;
    if (!s || s.state === 'nopin') return SAYS.noPin;
    if (s.state === 'reading') return 'reading the soil and rain at your field';
    return s.soilWhy ? 'no soil reading at your field' : 'no rain record at your field';
  }
  function inputsWords(s) {
    if (!s || s.state === 'nopin') return SAYS.pinFirst;
    if (s.state === 'reading') return 'Reading the soil (ISRIC SoilGrids) and the rain (NASA POWER) at your field…';
    if (s.state === 'failed') {
      if (s.soilWhy === 'nosoil') return 'SoilGrids has no soil at your field (water, a town or rock), so erosion exposure is not drawn.';
      if (s.soilWhy) return 'ISRIC SoilGrids did not answer for your field, so erosion exposure is not drawn. Try again later.';
      if (s.rainWhy === 'few') return 'NASA POWER has too few whole years of rain at your field, so erosion exposure is not drawn.';
      return 'NASA POWER’s rain record did not load for your field, so erosion exposure is not drawn. Try again later.';
    }
    const { soil, rain, k } = s;
    return `Soil at your field: ${textureWords(soil)} (sand ${Math.round(soil.sand)} %, silt ${Math.round(soil.silt)} %, clay ${Math.round(soil.clay)} %, organic carbon ${soil.carbon.toFixed(1)} %), erodibility ${(k / K_LOAM).toFixed(1)} × loam · ISRIC SoilGrids, 250 m, CC BY 4.0. Rain: Modified Fournier Index ${Math.round(rain.mfi)} mm (${Math.round(rain.yearly)} mm a year) from ${RAIN_NAME[rain.source] ?? RAIN_NAME.imerg}, whole years ${rain.first} to ${rain.last} · NASA POWER.`;
  }
  async function erosionInputs(entry) {
    const pin = env.pin?.();
    if (!pin) { entry.inputs = { state: 'nopin' }; setText(part('erosion', 'data-tinputs'), inputsWords(entry.inputs)); attach(entry); return; }
    const key = `${pin.lat.toFixed(3)},${pin.lon.toFixed(3)}`;
    if (entry.inputs?.key === key && entry.inputs.state !== 'failed') return;
    entry.inputs = { key, state: 'reading' }; setText(part('erosion', 'data-tinputs'), inputsWords(entry.inputs)); attach(entry);
    const ask = (store, fn) => { if (!store.has(key)) store.set(key, fn(pin.lat, pin.lon).catch(e => { store.delete(key); throw e; })); return store.get(key); };
    busy('erosion-inputs', true);   // the soil and the rain are asked for only now, when the layer is turned on: the loading sign shows meanwhile
    const [soil, rain] = await Promise.allSettled([ask(keep.soil, (a, b) => terrainNet.soil(a, b)), ask(keep.rain, (a, b) => terrainNet.rain(a, b))]).finally(() => busy('erosion-inputs', false));
    if (dead || on.get('erosion') !== entry || entry.inputs?.key !== key) return;
    if (soil.status === 'fulfilled' && rain.status === 'fulfilled') { const k = williamsK(soil.value); entry.inputs = { key, state: 'ready', soil: soil.value, rain: rain.value, k, factor: erosionFactor(k, rain.value.mfi) }; }
    else entry.inputs = { key, state: 'failed', soilWhy: soil.status === 'rejected' ? soil.reason?.why ?? 'down' : '', rainWhy: rain.status === 'rejected' ? rain.reason?.why ?? 'down' : '' };
    setText(part('erosion', 'data-tinputs'), inputsWords(entry.inputs));
    const i = card('erosion')?.querySelector('.tl-i'); if (i) i.innerHTML = srcButton(srcKeys('erosion'), noteFor(entry));
    const had = !!entry.layer; attach(entry); if (had && entry.layer) repaint(entry); readPin();   // a layer made just now paints itself
    env.say?.(entry.inputs.state === 'ready' ? 'Erosion exposure on the map, from the soil and rain at your field' : inputsWords(entry.inputs));
  }

  // ---- sun and shade: the date, the hour, and playing the day
  const asking = new Set();
  function clockFor() {   // the field's clock, asked once per pin, and only while Sun and shade is on
    const pin = env.pin?.(), key = pin ? `${pin.lat.toFixed(2)},${pin.lon.toFixed(2)}` : '';
    clockKey = key; clockOpts = keep.clocks.get(key) ?? {};
    if (!pin || !on.has('sunshade') || keep.clocks.has(key) || asking.has(key)) return;
    asking.add(key);
    terrainNet.clock(pin.lat, pin.lon).then(opts => { asking.delete(key); keep.clocks.set(key, opts ?? {}); if (clockKey !== key || dead) return; clockOpts = opts ?? {}; sunChanged(); }, () => asking.delete(key));
  }
  let sunMemo = { key: '', value: null };
  function sunNow() {   // the chosen moment on the field's clock and where the sun stands then over the middle of the view
    const pin = env.pin?.(), c = map().getCenter(), key = [keep.sun.date, keep.sun.hour, clockKey, JSON.stringify(clockOpts), pin?.lat, pin?.lon, c.lat.toFixed(2), c.lng.toFixed(2), Math.floor(terrainNet.now() / 6e4)].join('|');
    if (sunMemo.key !== key) sunMemo = { key, value: sunAt0(pin, c) };
    return sunMemo.value;
  }
  function sunAt0(pin, c) {
    const place = pin ? { lat: pin.lat, lon: pin.lon } : { lat: c.lat, lon: c.lng };
    const opts = { ...(pin ? clockOpts : {}), lon: place.lon }, now = terrainNet.now();
    const today = clockParts(now, opts), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(keep.sun.date);
    const date = m ? { y: +m[1], m: +m[2], d: +m[3] } : { y: today.y, m: today.m, d: today.d };
    const range = hourRange(date, place.lat, place.lon, opts);
    let hour = keep.sun.hour;
    if (hour == null) { const h = today.hh, ev = range?.ev; hour = range && (!m || isoOf(date) === isoOf(today)) && ev && (ev.state === 'day' || (now >= ev.rise && now <= ev.set)) ? h : 12; }
    if (range) hour = Math.min(range.max, Math.max(range.min, hour));
    const ms = momentOf(date, hour, opts), at = sunAt(ms, c.lat, c.lng);
    return { date, hour, ms, opts, range, pin: !!pin, sun: { azimuth: at.azimuth, apparent: at.apparent } };
  }
  function drawSun() {
    const root = card('sunshade'); if (!root) return;
    const s = sunNow(), date = root.querySelector('[data-tdate]'), hour = root.querySelector('[data-thour]'), out = root.querySelector('[data-thourout]'), playBtn = root.querySelector('[data-tplay]');
    if (date && document.activeElement !== date && date.value !== isoOf(s.date)) date.value = isoOf(s.date);
    if (hour) { if (s.range) { hour.min = String(s.range.min); hour.max = String(s.range.max); } hour.disabled = !s.range; if (document.activeElement !== hour && +hour.value !== s.hour) hour.value = String(s.hour); hour.setAttribute('aria-valuetext', `${pad(s.hour)}:00`); }
    setText(out, `${pad(s.hour)}:00`);
    setText(root.querySelector('[data-tclock]'), s.pin ? timesAreWords(s.opts) : 'Times are sun time at the middle of the map (noon is when the sun is highest). Draw your field for its own clock.');
    setText(root.querySelector('[data-tsunpos]'), !s.range ? SAYS.polarNight : s.sun.apparent > 0 ? `${+s.date.d} ${MON[s.date.m - 1]}, ${pad(s.hour)}:00: the sun is ${heightWords(s.sun.apparent)} up in the ${compass8(s.sun.azimuth)}.` : `${+s.date.d} ${MON[s.date.m - 1]}, ${pad(s.hour)}:00: ${SAYS.sunDown}`);
    if (playBtn) { playBtn.textContent = play ? 'Pause' : 'Play the day'; playBtn.toggleAttribute('data-playing', !!play); playBtn.disabled = !play && (motionOff() || !s.range || s.range.min === s.range.max); playBtn.title = motionOff() ? 'Playing by itself is off (Still motion). Move the hour by hand.' : ''; }
  }
  function sunChanged() {   // a new date or hour: the shadows are worked out again, tile by tile, over the old picture
    const e = on.get('sunshade'); if (!e) return;
    const had = !!e.layer; drawSun(); attach(e); if (had && e.layer) repaint(e); readPin();
  }
  const sleep = ms => new Promise(done => setTimeout(done, ms));
  async function playDay() {
    const s = sunNow(); if (play || !s.range || motionOff() || !on.has('sunshade')) return;
    const run = play = { stop: false, frameDone: null };
    const there = part('sunshade', 'data-there'); there?.setAttribute('aria-live', 'off');
    env.say?.(`Sun and shade: playing ${s.range.max - s.range.min + 1} hours, ${pad(s.range.min)}:00 to ${pad(s.range.max)}:00`);
    for (let h = s.range.min; h <= s.range.max && !run.stop && !dead; h++) {
      keep.sun.hour = h;
      const frame = new Promise(done => { run.frameDone = done; });
      sunChanged();
      await Promise.race([frame, sleep(PLAY_DAY.frameWaitMs)]);
      if (h < s.range.max && !run.stop) await sleep(motionQuiet() ? PLAY_DAY.holdLessMs : PLAY_DAY.holdMs);
    }
    if (play === run) { play = null; there?.setAttribute('aria-live', 'polite'); drawSun(); env.say?.(`Sun and shade: ${pad(keep.sun.hour)}:00`); }
  }
  function stopPlay(say = false) { if (!play) return; play.stop = true; play = null; part('sunshade', 'data-there')?.setAttribute('aria-live', 'polite'); drawSun(); if (say) env.say?.('Paused'); }

  // ---- the legend's own controls
  ui.legends.addEventListener('click', event => {
    const p = event.target.closest('[data-tplay]'); if (p) { if (play) stopPlay(true); else playDay(); return; }
    const r = event.target.closest('[data-tretry]');
    if (r) { const e = on.get(r.dataset.tretry); if (!e) return; r.hidden = true; engine().then(x => x.retry()); if (e.def.id === 'erosion' && e.inputs?.state === 'failed') { e.inputs = null; erosionInputs(e); } if (e.layer) e.layer.redraw(); readPin(); }
  });
  ui.legends.addEventListener('input', event => {
    const op = event.target.closest('[data-top]');
    if (op) { const id = op.dataset.top; keep.opacity[id] = +op.value; op.nextElementSibling.textContent = `${op.value}%`; on.get(id)?.layer?.setOpacity(+op.value / 100); return; }
    const hour = event.target.closest('[data-thour]');
    if (hour) { stopPlay(); keep.sun.hour = +hour.value; setText(card('sunshade')?.querySelector('[data-thourout]'), `${pad(+hour.value)}:00`); hour.setAttribute('aria-valuetext', `${pad(+hour.value)}:00`); clearTimeout(hourTimer); hourTimer = setTimeout(sunChanged, HOUR_DELAY_MS); }
  });
  ui.legends.addEventListener('change', event => {
    const date = event.target.closest('[data-tdate]');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date.value)) { stopPlay(); keep.sun.date = date.value; sunChanged(); env.say?.(`Shadows for ${date.value}`); return; }
    const strong = event.target.closest('[data-tstrong]');
    if (strong) { keep.strong = strong.checked; const e = on.get('relief'); if (e?.layer) repaint(e); setText(part('relief', 'data-tnote'), keep.strong ? SAYS.stronger : ''); env.say?.(keep.strong ? 'Stronger shading on' : 'Stronger shading off'); }
  });

  // ---- the view: the zoom worth computing at, the layers that need a closer look, the sun over the middle of the map
  async function probe() {
    if (!on.size || dead) return;
    const m = map(), c = m.getCenter(), z = Math.min(12, Math.floor(m.getZoom())); if (z < 6) return;
    const at = pixelAt(c.lat, c.lng, z), key = `${z}/${at.x}/${at.y}`; if (key === view.key) return;
    view.key = key;
    const res = await (await engine()).run({ type: 'probe', id: ++jobSeq, lat: c.lat, lon: c.lng, z, template: terrainNet.template });
    if (dead || view.key !== key || !res.ok || res.native === view.native) return;
    view.native = res.native; for (const e of on.values()) attach(e); readPin();
  }
  let sunKey = '';
  function onView() {
    clearTimeout(viewTimer);
    viewTimer = setTimeout(() => {
      if (dead) return;
      for (const e of on.values()) attach(e);
      const s = on.has('sunshade') ? sunNow() : null, k = s ? `${s.sun.azimuth.toFixed(1)}:${s.sun.apparent.toFixed(1)}` : '';
      if (s && k !== sunKey) { sunKey = k; const e = on.get('sunshade'); if (e?.layer) repaint(e); }
      probe(); readPin();
    }, VIEW_DELAY_MS);
  }
  map().on('zoomend moveend', onView);

  // ---- on and off
  function turnOn(id) {
    const def = terrainLayer(id); if (!def || on.has(id) || dead) return;
    const entry = { def, layer: null, cz: czFor(map().getZoom()), live: new Map(), prefixes: [], inputs: null, timer: 0, gate: '', revealed: false };
    on.set(id, entry);
    renderLegend(entry);
    if (id === 'sunshade') { clockFor(); drawSun(); }
    if (id === 'erosion') erosionInputs(entry); else attach(entry);
    probe(); readPin();
    if (map().getZoom() < def.minZoom) { const p = env.pin?.(); map().setView(p && Number.isFinite(p.lat) ? [p.lat, p.lon] : map().getCenter(), def.minZoom, { animate: true }); }   // ticked too far out: the map comes to where the layer can be drawn, so the row visibly changes the map
    env.say?.(`${def.name} on the map, ${entry.gate && entry.gate !== 'inputs' ? entry.gate : 'worked out from the land heights'}`);
  }
  function turnOff(id) {
    const e = on.get(id); if (!e) return;
    if (id === 'sunshade') stopPlay();
    clearTimeout(e.timer);
    for (const t of e.live.values()) if (t.job) engineAt?.then(x => x.cancel(t.job));
    e.layer?.remove(); on.delete(id);
    card(id)?.remove();
  }
  const rezindex = () => { for (const [id, e] of on) e.layer?.setZIndex(zIndexOf(id)); };
  const nameOf = id => terrainLayer(id)?.name;
  const api = { fieldsetHtml, drawRows, turnOn, turnOff, rezindex, nameOf, readPin, playing: () => !!play, playDay, stopPlay, layerOf: id => on.get(id)?.layer ?? null, entry: id => on.get(id) ?? null, sunNow, view: () => ({ ...view }),
    dispose() { stopPlay(); dead = true; clearTimeout(viewTimer); clearTimeout(hourTimer); document.removeEventListener('crophalo:prefetch', onPin); try { map().off('zoomend moveend', onView); } catch { /* the map was already gone */ } for (const id of [...on.keys()]) turnOff(id); if (current === api) current = null; } };
  return current = api;
}
