// Crophalo's Layers on the setup map: the Layers panel (a checkbox for each NASA GIBS layer, "Turn all overlays off") and a legend card for every layer that is on, with its NASA product, the day of the image, the colour bar,
// the date row (earlier, a date, later, newest; days come from NASA's own list, up to yesterday, snapping across gaps) and the opacity. A layer that fails its check, or has no image for the day, says so in words, never a blank tile.
// Not pure (the pure parts are js/gibs.js). Checked by scripts/e2e_map.mjs (the layers group: the panel, the legend, the date row, the opacity, a broken layer disabled, no image said) and scripts/live_check_layers.mjs (NASA, live).
import { LAYERS, layerOf, DOMAINS, tileTemplate, tileUrl, parseDomains, newest, snap, stepBy, hasDay, dateWords, legendGradient, buttonWords, WORDS, addDays, FIRES, FIRES_URL, fireRadius, fireTime, fireWords } from './gibs.js';
import { srcButton } from './srci.js';

const L = globalThis.window?.L;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const LAYERS_ICON = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4 3 9l9 5 9-5z"/><path d="m3 14 9 5 9-5"/></svg>';
const X = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
export const PROBE_MS = 9e3, PROBE_EVERY_MS = 3 * 60e3, DATE_DELAY_MS = 700, FIRST_PROBE_MS = 1500;

// What the page asks of the network, in one place so a check can stand in for it.
export const net = {
  text: (url, ms = PROBE_MS) => fetch(url, { signal: AbortSignal.timeout(ms) }).then(r => { if (!r.ok) throw new Error(`status ${r.status}`); return r.text(); }),
  tile: (url, ms = PROBE_MS) => new Promise((ok, no) => { const img = new Image(), t = setTimeout(() => { img.src = ''; no(new Error('slow')); }, ms); img.onload = () => { clearTimeout(t); ok(); }; img.onerror = () => { clearTimeout(t); no(new Error('tile')); }; img.src = url; }),
  today: () => new Date().toISOString().slice(0, 10),
  fires: (lat, lon, ms = 75e3) => fetch(FIRES_URL(lat, lon), { signal: AbortSignal.timeout(ms) }).then(r => r.json()),   // our own server's /api/firms: one JSON object
};

// What the layers keep while the wizard redraws the map around them: which are on, their days, the opacity.
const keep = { on: [], date: {}, opacity: 75, ranges: {}, health: {}, probedAt: 0 };
let ctl = null;
export const layersCtl = () => ctl;   // the layers of the map on the page now: for the checks
export const layersNow = () => ({ on: [...keep.on], date: { ...keep.date }, opacity: keep.opacity, health: { ...keep.health } });
export const resetLayers = () => { Object.assign(keep, { on: [], date: {}, opacity: 75, ranges: {}, health: {}, probedAt: 0 }); };

// ui: { right, legends } (the button row, the legend stack). env: { map(), say, toast, groundIsVector() }. Returns { def, dispose, restore, probe }.
export function initLayers(ui, env) {
  const tiles = new Map(), empties = new Map();   // id -> the Leaflet layer; id -> { loaded, failed } since the last change of day or view
  let dead = false, probing = null, timer = 0, panelRoot = null;
  const pending = new Map();
  let fireGroup = null, fireAnswer = null, fireBusy = false;   // the fire points on the map, the last answer, and whether one is being asked for                       // id -> a date typed, applied after a pause

  const today = () => net.today();
  const health = id => keep.health[id] ?? { state: 'unknown' };
  const order = () => keep.on;
  const zOf = id => (env.groundIsVector?.() ? 6 : 2) + Math.max(0, order().indexOf(id));   // over the photo and under its names; over the Light map, which draws its own ground

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
  function addTiles(layer) {
    if (tiles.has(layer.id)) return;
    const t = L.tileLayer(tileTemplate(layer), { time: keep.date[layer.id], maxNativeZoom: layer.native, maxZoom: 19, opacity: keep.opacity / 100, zIndex: zOf(layer.id), attribution: '' });
    empties.set(layer.id, { loaded: 0, failed: 0 });
    t.on('tileload', () => { empties.get(layer.id).loaded++; });
    t.on('tileerror', () => { empties.get(layer.id).failed++; });
    t.on('load', () => settle(layer.id));   // every tile of the view came back: none with a picture is "no image"
    t.addTo(env.map()); tiles.set(layer.id, t);
  }
  function dropTiles(id) { tiles.get(id)?.remove(); tiles.delete(id); empties.delete(id); }
  function rezindex() { for (const [id, t] of tiles) t.setZIndex(zOf(id)); }
  function setDay(id, day) {
    keep.date[id] = day;
    const t = tiles.get(id); if (t) { t.options.time = day; empties.set(id, { loaded: 0, failed: 0 }); t.redraw(); }
    renderLegend(id, { keepNote: false });
  }
  async function turnOn(id) {
    if (id === FIRES.id) return turnOnFires();
    const layer = layerOf(id); if (!layer || keep.on.includes(id)) return true;
    if (health(id).state === 'down') { env.toast?.(`${layer.name}: ${WORDS.down}`); drawRows(); return false; }
    keep.on.push(id);
    let ranges;
    try { ranges = await rangesOf(layer); } catch { keep.on = keep.on.filter(x => x !== id); keep.health[id] = { state: 'down', why: 'dates', at: Date.now() }; env.toast?.(`${layer.name}: ${WORDS.down}`); drawRows(); return false; }
    if (!keep.date[id] || !hasDay(ranges, keep.date[id])) keep.date[id] = newest(ranges, today());
    addTiles(layer); renderLegend(id); refreshButton(); drawRows();
    env.say?.(`${layer.name} on the map, image of ${dateWords(keep.date[id])}`);
    return true;
  }
  function turnOff(id) {
    keep.on = keep.on.filter(x => x !== id); dropTiles(id);
    if (id === FIRES.id) { fireGroup?.remove(); fireGroup = null; fireAnswer = null; }
    ui.legends.querySelector(`[data-legend="${id}"]`)?.remove();
    ui.legends.hidden = !keep.on.length;
    refreshButton(); drawRows(); env.say?.(keep.on.length ? `${layerOf(id)?.name} off` : 'All layers off');
  }
  function failLayer(id) {   // a layer that was on and now fails its check: said in words, taken off the map
    const layer = layerOf(id); turnOff(id);
    env.toast?.(`${layer?.name}: ${WORDS.down}`);
  }
  function allOff() { for (const id of [...keep.on]) turnOff(id); env.say?.('All layers off'); }

  // ---- fires and hot spots: points from our server, not tiles
  function drawFires(a) {
    fireGroup?.remove(); fireGroup = L.layerGroup();
    for (const p of a.points ?? []) {
      const m = L.circleMarker([p.lat, p.lon], { radius: fireRadius(p.frp), color: '#ffffff', weight: 1, fillColor: FIRES.colours[p.confidence] ?? FIRES.colours.nominal, fillOpacity: 0.9, opacity: 0.9, bubblingMouseEvents: false });
      m.bindTooltip(`${FIRES.words[p.confidence] ?? 'Confidence not given'} · ${fireTime(p.time)} · ${p.frp == null ? 'power not given' : `${p.frp} MW`} · ${p.satellite}`);
      fireGroup.addLayer(m);
    }
    fireGroup.addTo(env.map());
  }
  async function lookFires() {
    if (fireBusy) return; fireBusy = true;
    const c = env.map().getCenter(), card = () => ui.legends.querySelector(`[data-legend="${FIRES.id}"]`);
    noteOf(FIRES.id, 'Asking NASA for the spots seen in the last 24 hours…');
    try {
      const a = await net.fires(c.lat, c.lng);
      if (!keep.on.includes(FIRES.id)) return;
      if (!a || a.ok === false) { fireGroup?.remove(); fireGroup = null; fireAnswer = null; noteOf(FIRES.id, a?.reason ? `${a.reason}.` : fireWords(a)); env.say?.(`${FIRES.name}: ${WORDS.down}`); }
      else { fireAnswer = a; drawFires(a); noteOf(FIRES.id, fireWords(a)); env.say?.(`${FIRES.name}: ${a.count} spots`); }
    } catch { if (keep.on.includes(FIRES.id)) { noteOf(FIRES.id, `${WORDS.down}. ${WORDS.retry}`); env.say?.(`${FIRES.name}: ${WORDS.down}`); } }
    finally { fireBusy = false; card()?.querySelector('[data-look]')?.removeAttribute('disabled'); }
  }
  async function turnOnFires() {
    if (keep.on.includes(FIRES.id)) return true;
    keep.on.push(FIRES.id);
    renderLegend(FIRES.id); refreshButton(); drawRows();
    env.say?.(`${FIRES.name} on the map`);
    await lookFires();
    return true;
  }
  const firesLegendHtml = () => `<section class="mapx-legend" data-legend="${FIRES.id}" aria-label="${esc(FIRES.name)} legend">
      <header><div><b>${esc(FIRES.name)}</b> ${srcButton('firms', `${FIRES.name}: ${FIRES.sub}.`)}<br><span class="cap">NASA ${esc(FIRES.sub)}</span></div><button type="button" class="mapx-lx" data-off="${FIRES.id}" aria-label="Turn off ${esc(FIRES.name)}">${X}</button></header>
      <ul class="mapx-dots">${['high', 'nominal', 'low'].map(k => `<li><i style="background:${FIRES.colours[k]}" aria-hidden="true"></i>${esc(FIRES.words[k])}</li>`).join('')}</ul>
      <p class="cap">A bigger dot is a more powerful fire. Touch a dot for its time and power.</p>
      <button type="button" class="btn sm ghost" data-look="${FIRES.id}">Look again at the map centre</button>
      <p class="cap mapx-lnote" data-lnote="${FIRES.id}" role="status"></p></section>`;

  // ---- the legend cards
  function legendHtml(layer) {
    const day = keep.date[layer.id], ranges = keep.ranges[layer.id] ?? [], first = ranges[0]?.from ?? '', last = newest(ranges, today()) ?? '';
    return `<section class="mapx-legend" data-legend="${layer.id}" aria-label="${esc(layer.name)} legend">
      <header><div><b>${esc(layer.name)}</b> ${srcButton('gibs', `${layer.name}: ${layer.sub}. Image of ${dateWords(day)}.`)}<br><span class="cap">NASA ${esc(layer.sub)}</span></div><button type="button" class="mapx-lx" data-off="${layer.id}" aria-label="Turn off ${esc(layer.name)}">${X}</button></header>
      <div class="mapx-bar" role="img" aria-label="${esc(`${layer.name} colours, from ${layer.low} to ${layer.high}`)}" style="background:${legendGradient(layer)}"></div>
      <div class="mapx-ends"><span>${esc(layer.low)}</span><span>${esc(layer.high)}</span></div>
      <div class="mapx-date" role="group" aria-label="Image date for ${esc(layer.name)}"><button type="button" class="btn sm ghost" data-step="-1" data-id="${layer.id}">Earlier image</button>
        <input type="date" data-date="${layer.id}" value="${esc(day)}" min="${esc(first)}" max="${esc(last)}" aria-label="Day of the image, ${esc(layer.name)}"><button type="button" class="btn sm ghost" data-step="1" data-id="${layer.id}">Later image</button><button type="button" class="btn sm ghost" data-newest="${layer.id}">Newest</button></div>
      <p class="cap mapx-imageday" data-day="${layer.id}">Image of ${esc(dateWords(day))}</p>
      <p class="cap mapx-snap" data-snap="${layer.id}" role="status"></p>
      <label class="mapx-op"><span>Opacity</span><input type="range" min="20" max="100" step="5" value="${keep.opacity}" data-op="${layer.id}" aria-label="Opacity of ${esc(layer.name)}"><output>${keep.opacity}%</output></label>
      <p class="cap mapx-lnote" data-lnote="${layer.id}" role="status">${esc(layer.note)}</p></section>`;
  }
  function renderLegend(id, { keepNote = true } = {}) {
    if (id === FIRES.id) {
      const holder = document.createElement('div'); holder.innerHTML = firesLegendHtml();
      const old = ui.legends.querySelector(`[data-legend="${id}"]`), card = holder.firstElementChild;
      if (old) old.replaceWith(card); else ui.legends.append(card);
      ui.legends.hidden = !keep.on.length;
      if (fireAnswer) card.querySelector('[data-lnote]').textContent = fireWords(fireAnswer);
      return;
    }
    const layer = layerOf(id); if (!layer) return;
    const old = ui.legends.querySelector(`[data-legend="${id}"]`), note = keepNote ? old?.querySelector('[data-lnote]')?.textContent : layer.note;
    const holder = document.createElement('div'); holder.innerHTML = legendHtml(layer);
    const card = holder.firstElementChild;
    if (note != null) card.querySelector('[data-lnote]').textContent = note;
    if (keepNote && old) card.querySelector('[data-snap]').textContent = old.querySelector('[data-snap]')?.textContent ?? '';
    if (old) old.replaceWith(card); else ui.legends.append(card);
    ui.legends.hidden = !keep.on.length;
    settle(id);
  }
  const noteKept = id => layerOf(id)?.note ?? '';
  const noteOf = (id, text) => { const n = ui.legends.querySelector(`[data-lnote="${id}"]`); if (n) n.textContent = text; };
  const snapOf = (id, text) => { const n = ui.legends.querySelector(`[data-snap="${id}"]`); if (n) n.textContent = text; };
  function settle(id) {
    const e = empties.get(id), n = ui.legends.querySelector(`[data-lnote="${id}"]`); if (!e || !n) return;
    if (e.failed > 0 && !e.loaded && !tiles.get(id)?._loading) showEmpty(id);
    else if (e.loaded && n.textContent === WORDS.empty) noteOf(id, noteKept(id));
  }
  const showEmpty = id => { noteOf(id, WORDS.empty); env.say?.(WORDS.empty); };

  ui.legends.addEventListener('click', event => {
    const off = event.target.closest('[data-off]'); if (off) return turnOff(off.dataset.off);
    const look = event.target.closest('[data-look]'); if (look) { look.disabled = true; return lookFires(); }
    const stepBtn = event.target.closest('button[data-step]');   // a button: the setup screen around the map carries data-step too (the wizard's step)
    if (stepBtn) { const id = stepBtn.dataset.id, layer = layerOf(id), to = stepBy(keep.ranges[id] ?? [], keep.date[id], +stepBtn.dataset.step, layer.step, today()); if (!to) { env.say?.(+stepBtn.dataset.step < 0 ? 'No earlier image.' : 'No later image: this is the newest.'); return; } return setDay(id, to); }
    const now = event.target.closest('[data-newest]'); if (now) { const id = now.dataset.newest, to = newest(keep.ranges[id] ?? [], today()); if (to) setDay(id, to); }
  });
  ui.legends.addEventListener('input', event => {
    const op = event.target.closest('[data-op]');
    if (op) { keep.opacity = +op.value; op.nextElementSibling.textContent = `${op.value}%`; for (const t of tiles.values()) t.setOpacity(keep.opacity / 100); return; }
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
    return `<li><label class="mapx-lrow${on ? ' on' : ''}${down ? ' off' : ''}"${down ? ` title="${esc(h.why ?? '')}"` : ''}><input type="checkbox" data-layer="${layer.id}"${on ? ' checked' : ''}${down ? ' disabled' : ''}><span><b>${esc(layer.name)}</b><span class="cap">${down ? esc(WORDS.down) : esc(layer.sub)}</span></span></label></li>`;
  };
  function drawRows() {
    const list = panelRoot?.querySelector('#mapxLayerRows'); if (!list) return;
    list.innerHTML = [...LAYERS, FIRES].map(rowHtml).join('');
    const none = panelRoot.querySelector('[data-alloff]'); if (none) none.disabled = !keep.on.length;
  }
  function refreshButton() {
    const b = ui.right.querySelector('[data-panel="layers"]'); if (!b) return;
    const words = buttonWords(keep.on); b.querySelector('.mapx-w').textContent = words;
    b.classList.toggle('has-on', keep.on.length > 0);
    b.setAttribute('aria-label', keep.on.length ? `Map layers, showing ${keep.on.map(id => layerOf(id)?.name).join(', ')}` : 'Map layers');
  }
  const def = { id: 'layers', label: 'Layers', icon: LAYERS_ICON, build(body) {
    panelRoot = body;
    body.innerHTML = `<p class="cap">Satellite images from NASA, drawn over the map. Any number at once; the last one you turn on is on top.</p>
      <p class="mapx-lbase" id="mapxLayerBase" role="status"></p>
      <button type="button" class="btn sm" data-alloff${keep.on.length ? '' : ' disabled'}>Turn all overlays off</button>
      <fieldset class="mapx-lset"><legend>NASA data</legend><ul class="mapx-rows" id="mapxLayerRows"></ul></fieldset>`;
    drawRows();
    const baseNote = document.querySelector('#mapxBaseNote'); if (baseNote?.textContent) body.querySelector('#mapxLayerBase').textContent = baseNote.textContent;
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
  document.addEventListener('crophalo:base', onBase);
  timer = setTimeout(() => { if (!dead) probe(true); }, FIRST_PROBE_MS);   // a first check shortly after the map is up, so a broken layer is already grey when the panel opens
  return ctl = { def, restore, probe, turnOn, turnOff, allOff, tilesOf: () => tiles, emptyOf: id => ({ ...(empties.get(id) ?? {}) }), fireAnswer: () => fireAnswer, legendRect: () => (ui.legends.hidden ? null : ui.legends.getBoundingClientRect()),
    dispose() { dead = true; clearTimeout(timer); for (const t of pending.values()) clearTimeout(t); document.removeEventListener('crophalo:base', onBase); for (const id of [...tiles.keys()]) dropTiles(id); fireGroup?.remove(); fireGroup = null; } };
}
