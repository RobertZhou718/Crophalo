// Crophalo's Regional water storage on the setup map: NASA GRACE and GRACE-FO stored water for the region round the pin, asked of Crophalo's own server, drawn as one soft disc about 300 km across under the place names,
// with a legend card: the value and its month, "very coarse: one value for a whole region, not your field", the colour bar with a marker, Earlier / Later / Newest month, "Play the last 8 months", the credit, an "i" card and an honest reason when nothing is drawn.
// Not pure (the facts and words are js/grace.js). Checked by scripts/e2e_map.mjs (the grace group: on and off, no pin, the answer drawn, a month with no measurement, a failed lookup, the months, the play, the fit at 320 px).
import { GRACE, GRACE_URL, GRACE_CREDIT, GRACE_CLASSES, GAP_COLOUR, GRACE_WORDS, cleanGrace, cellKey, classOf, barAt, barGradient, monthOf, stepMonth, graceFrames, monthWords, monthShort,
  discInTile, discBounds, viewInside, hereWords, trendWords, monthLine, whyWords } from './grace.js';
import { PLAY, holdFor } from './layeranim.js';
import { srcButton } from './srci.js';
import { busy } from './mapbusy.js';
import { motionOff, motionQuiet } from './motion.js';
import { loadLeaflet } from './leaflet-load.js';

const L = globalThis.window?.L ?? (globalThis.document ? await loadLeaflet() : undefined);   // on a page every way in waits for the map library (js/leaflet-load.js); a test with no page loads the file as before
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const X = '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const sleep = ms => new Promise(done => setTimeout(done, ms));

// What the page asks of the outside, in one place so a check can stand in for it: our own server's lookup, which reads NASA's file with the server's NASA login.
export const graceNet = {
  async ask(lat, lon, ms = 170e3) {
    const r = await fetch(GRACE_URL(lat, lon), { signal: AbortSignal.timeout(ms) });
    let answer = null; try { answer = await r.json(); } catch { /* not an answer at all: said below */ }
    return { status: r.status, answer };
  },
};

const keep = { opacity: GRACE.opacity, month: null, answers: new Map() };   // what stays while the wizard redraws the map: the opacity, the month shown, the answers by half-degree square
export const graceNow = () => ({ opacity: keep.opacity, month: keep.month, asked: [...keep.answers.keys()] });
export const resetGrace = () => { keep.opacity = GRACE.opacity; keep.month = null; keep.answers.clear(); };
let current = null;
export const graceCtl = () => current;   // the layer of the map on the page now: for the checks

const hexRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const rgba = (hex, a) => `rgba(${hexRgb(hex).join(',')},${a})`;

// ui: { legends }. env: { map(), pin(), say, toast, groundIsVector(), zOf(id) }.
export function initGrace(ui, env) {
  const s = { on: false, layer: null, g: null, key: '', status: 'idle', why: '', retry: false, play: null, revealed: false, seq: 0 };
  let dead = false;
  const map = () => env.map();
  const card = () => ui.legends.querySelector(`[data-legend="${GRACE.id}"]`);
  const part = sel => card()?.querySelector(sel);
  const setText = (el, text) => { if (el && el.textContent !== text) el.textContent = text; };
  const zIndexOf = () => { const z = env.zOf?.(GRACE.id) ?? 3; return env.groundIsVector?.() ? z : Math.min(z, 4); };   // under the place names (5) over the photo; over the Light map, which draws its own ground

  // ---- the disc, painted tile by tile: solid inside, a soft edge, hatched grey for a month with no measurement
  function paint(canvas, coords, g, month) {
    const d = discInTile(g, coords.z, coords.x, coords.y); if (!d) return;
    const c = canvas.getContext('2d'), m = monthOf(g, month), gap = !m || m.cm === null, colour = gap ? GAP_COLOUR : classOf(m.cm).colour, inner = d.r * 0.78;
    const far = Math.max(...[[0, 0], [256, 0], [0, 256], [256, 256]].map(([x, y]) => Math.hypot(x - d.x, y - d.y)));
    if (far <= inner) { c.fillStyle = colour; c.fillRect(0, 0, 256, 256); }
    else { const grad = c.createRadialGradient(d.x, d.y, inner, d.x, d.y, d.r); grad.addColorStop(0, rgba(colour, 1)); grad.addColorStop(1, rgba(colour, 0)); c.fillStyle = grad; c.fillRect(0, 0, 256, 256); }
    const rimIn = d.r * 0.84;   // a soft dark rim round the disc, so the region shows over white clouds and snow too: soft, because NASA's own edges of the region are not given
    if (far > rimIn) { const rim = c.createRadialGradient(d.x, d.y, rimIn, d.x, d.y, d.r); rim.addColorStop(0, 'rgba(30,30,30,0)'); rim.addColorStop(0.6, 'rgba(30,30,30,.34)'); rim.addColorStop(1, 'rgba(30,30,30,0)'); c.fillStyle = rim; c.fillRect(0, 0, 256, 256); }
    if (gap) {   // the hatch lines up across tiles: it is laid on the world's pixels, not the tile's
      c.save(); c.globalCompositeOperation = 'source-atop'; c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2;
      const off = ((coords.x * 256 + coords.y * 256) % 14 + 14) % 14;
      c.beginPath(); for (let k = -256 - off; k < 256; k += 14) { c.moveTo(k, 256); c.lineTo(k + 256, 0); } c.stroke(); c.restore();
    }
  }
  function makeLayer(g, month, opacity) {
    const live = new Map();   // canvas → its tile, so a step to another month repaints in place (no tile is made again, nothing flickers)
    const Grid = L.GridLayer.extend({ createTile(coords) { const t = document.createElement('canvas'); t.width = t.height = 256; live.set(t, { ...coords }); paint(t, coords, g, layer.month); return t; } });
    const layer = new Grid({ tileSize: 256, maxZoom: 19, opacity, zIndex: zIndexOf(), className: 'gr-layer', updateWhenZooming: false, keepBuffer: 1 });
    layer.month = month; layer.live = live; layer.g = g;
    layer.on('tileunload', e => live.delete(e.tile));
    return layer;
  }
  function repaint(layer, month) { layer.month = month; for (const [t, coords] of layer.live) { t.getContext('2d').clearRect(0, 0, 256, 256); paint(t, coords, layer.g, month); } }
  function attach() {   // the disc on the map for the month shown, with a soft fade in the first time (Full motion only)
    if (!s.on || !s.g || dead) return;
    if (s.layer && s.layer.g !== s.g) detach();   // another region: a new disc
    if (s.layer) { if (s.layer.month !== keep.month) repaint(s.layer, keep.month); return; }
    s.layer = makeLayer(s.g, keep.month, keep.opacity / 100); s.layer.addTo(map());
    if (!s.revealed && !motionQuiet()) { const c = s.layer.getContainer?.(); if (c) { c.classList.add('mapx-reveal'); setTimeout(() => c.classList.remove('mapx-reveal'), 900); } }
    s.revealed = true;
  }
  function detach() { s.layer?.remove(); s.layer = null; }

  // ---- the legend card
  const note = () => {
    if (!s.g) return `${GRACE.name}: NASA GRACE and GRACE-FO, JPL mascons, one value for a region about 300 km wide.`;
    const read = s.g.fetched ? ` Read from NASA by Crophalo’s server on ${new Date(s.g.fetched).toUTCString().slice(5, 16)}.` : '';
    return `${GRACE.name}: NASA GRACE and GRACE-FO, JPL mascon solution RL06.3Mv04 (CRI filter), one value for a region about 300 km wide, read for the half-degree square centred at ${s.g.centre.lat.toFixed(2)}, ${s.g.centre.lon.toFixed(2)}. Month shown: ${monthWords(keep.month)}.${read} ${GRACE_WORDS.what}`;
  };
  const html = () => `<section class="mapx-legend gr-legend" data-legend="${GRACE.id}" aria-label="${esc(GRACE.name)} legend">
      <header><div><b>${esc(GRACE.name)}</b> <span class="gr-i">${srcButton('grace', note())}</span><br><span class="cap">${esc(GRACE.plain)}</span></div><button type="button" class="mapx-lx" data-off="${GRACE.id}" aria-label="Turn off ${esc(GRACE.name)}">${X}</button></header>
      <p class="gr-coarse">${esc(GRACE_WORDS.coarse)}</p>
      <div class="mapx-barwrap"><div class="mapx-bar" role="img" aria-label="${esc(`${GRACE.name} colours: ${GRACE_CLASSES.map(k => `${k.range} the 2004 to 2009 average, ${k.words}`).join('; ')}`)}" style="background:${barGradient()}"></div><i class="gr-band" data-gband hidden aria-hidden="true"></i><i class="mapx-mark" data-mark="${GRACE.id}" hidden aria-hidden="true"></i></div>
      <div class="mapx-ends"><span>−20 cm · less</span><span>usual</span><span>+20 cm · more</span></div>
      <p class="mapx-here" data-here="${GRACE.id}" role="status" aria-live="polite">${esc(GRACE.here)}: reading…</p>
      <div class="mapx-date gr-months" role="group" aria-label="Month of the ${esc(GRACE.name)} measurement"><button type="button" class="btn sm ghost" data-gstep="-1">Earlier month</button><button type="button" class="btn sm ghost" data-gstep="1">Later month</button><button type="button" class="btn sm ghost" data-gnewest>Newest</button></div>
      <div class="mapx-playrow"><button type="button" class="btn sm" data-gplay>${esc(GRACE_WORDS.play(8))}</button></div>
      <p class="cap mapx-progress" data-gprogress aria-hidden="true"></p>
      <p class="cap mapx-imageday" data-gmonth></p>
      <p class="cap" data-gtrend></p>
      <p class="cap" data-gview></p>
      <button type="button" class="btn sm ghost gr-whole" data-gwhole>${esc(GRACE_WORDS.whole)}</button>
      <label class="mapx-op"><span>Opacity</span><input type="range" min="20" max="100" step="5" value="${keep.opacity}" data-gop aria-label="Opacity of ${esc(GRACE.name)}"><output>${keep.opacity}%</output></label>
      <details class="fold mapx-more"><summary>Show more</summary><p class="cap">NASA GRACE and GRACE-FO · JPL mascons · about 300 km · monthly since 2002.</p><p class="cap mapx-credit-line">${esc(GRACE_CREDIT)}</p></details>
      <p class="cap mapx-lnote" data-gnote role="status"></p>
      <button type="button" class="btn sm ghost gr-retry" data-gretry hidden>Try again</button></section>`;
  function render() {
    const holder = document.createElement('div'); holder.innerHTML = html();
    const old = card(), fresh = holder.firstElementChild;
    if (old) old.replaceWith(fresh); else ui.legends.append(fresh);
    ui.legends.hidden = false;
    draw();
  }
  function draw() {   // every line of the card from the state: what is asked, what came back, the month shown
    if (!card()) return;
    const g = s.g, ready = s.status === 'ready' && g, m = ready ? monthOf(g, keep.month) : null;
    setText(part('[data-here]'), ready ? hereWords(g, keep.month) : (s.status === 'asking' ? `${GRACE.here}: reading…` : `No value for your pin: ${s.status === 'nopin' ? 'drop a pin first' : 'nothing came back'}.`));
    const mark = part('[data-mark]'), band = part('[data-gband]');
    if (mark) { const at = m && m.cm !== null ? barAt(m.cm) : null; mark.hidden = at === null; if (at !== null) mark.style.left = `${Math.round(at * 1000) / 10}%`; }
    if (band) {
      const lo = m && m.cm !== null && m.unc !== null ? barAt(m.cm - m.unc) : null, hi = lo === null ? null : barAt(m.cm + m.unc);
      band.hidden = lo === null; if (lo !== null) { band.style.left = `${Math.round(lo * 1000) / 10}%`; band.style.width = `${Math.max(0.5, Math.round((hi - lo) * 1000) / 10)}%`; }
    }
    setText(part('[data-gmonth]'), ready ? `Month: ${monthLine(g, keep.month)}` : '');
    setText(part('[data-gtrend]'), ready ? trendWords(g) : '');
    setText(part('[data-gview]'), ready ? viewWords() : '');
    setText(part('[data-gnote]'), s.status === 'nopin' ? GRACE_WORDS.nopin : s.status === 'asking' ? GRACE_WORDS.asking : s.status === 'failed' ? s.why : '');
    const retry = part('[data-gretry]'); if (retry) retry.hidden = !(s.status === 'failed' && s.retry);
    for (const el of card().querySelectorAll('.gr-months, .mapx-playrow, [data-gwhole], .mapx-op')) el.hidden = !ready;
    if (ready) {
      part('[data-gstep="-1"]').disabled = !stepMonth(g, keep.month, -1);
      part('[data-gstep="1"]').disabled = !stepMonth(g, keep.month, 1);
      part('[data-gnewest]').disabled = keep.month === g.newest;
    }
    const i = part('.srci'); if (i) i.dataset.note = note();
    drawPlay();
  }
  function viewWords() {
    try { const b = map().getBounds(); return viewInside(s.g, { s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() }) ? GRACE_WORDS.inside : GRACE_WORDS.disc; } catch { return GRACE_WORDS.disc; }
  }
  function drawPlay() {
    const b = part('[data-gplay]'); if (!b) return;
    const n = s.g ? graceFrames(s.g).length : 0;
    b.textContent = s.play ? 'Pause' : GRACE_WORDS.play(n || PLAY.maxFrames);
    b.toggleAttribute('data-playing', !!s.play);   // its words say the state (Play, Pause): no pressed state on top
    b.disabled = !s.play && (n < 2 || motionOff() || s.status !== 'ready');
    b.title = motionOff() ? 'Playing by itself is off (Still motion). Use Earlier month and Later month to step.' : '';
  }

  // ---- asking the server: once per half-degree square, kept for the page; a failure is kept only until Try again
  async function ask() {
    const pin = env.pin?.();
    if (!pin) { s.status = 'nopin'; s.g = null; s.key = ''; detach(); draw(); return; }
    const key = cellKey(pin.lat, pin.lon), mine = ++s.seq;
    s.key = key;
    let got = keep.answers.get(key);
    if (!got) {
      s.status = 'asking'; s.g = null; detach(); draw();
      got = graceNet.ask(pin.lat, pin.lon).then(({ status, answer }) => { const g = status === 200 ? cleanGrace(answer) : { ok: false }; return { status, answer, g }; }, () => ({ status: 0, answer: null, g: { ok: false } }));
      keep.answers.set(key, got);
    }
    busy('grace', true);
    const r = await got.finally(() => busy('grace', false));   // the loading sign while the region's answer is asked for
    if (dead || mine !== s.seq || !s.on) return;
    if (r.g.ok) {
      s.g = r.g; s.status = 'ready'; s.why = ''; s.retry = false;
      if (!keep.month || !monthOf(r.g, keep.month)) keep.month = r.g.newest;
      attach(); draw();
      env.say?.(`${GRACE.name} on the map: ${hereWords(r.g, keep.month)}`);
    } else {
      const final = r.status === 200 && (r.answer?.final === true || r.g.final === true);
      s.g = null; s.status = 'failed'; s.why = whyWords(r.status === 200 ? { reason: r.answer?.reason, final } : null, r.status); s.retry = !final && r.status !== 404;
      if (!final) keep.answers.delete(key);   // a final answer (open water, no value) is kept; anything else is asked again
      detach(); draw();
      env.say?.(`${GRACE.name}: ${s.why}`);
    }
  }

  // ---- the months: one step, the newest, and the time-lapse of the last eight
  async function showMonth(month, fade) {
    keep.month = month;
    if (!s.layer) { attach(); draw(); return; }
    if (!fade) { repaint(s.layer, month); draw(); return; }   // a step: the new month replaces the old at once
    const old = s.layer, next = makeLayer(s.g, month, 0); next.addTo(map());
    const c = next.getContainer?.(); c?.classList.add('mapx-xfade');
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    if (dead || !s.on) { next.remove(); return; }
    next.setOpacity(keep.opacity / 100); old.setOpacity(0); s.layer = next; draw();
    await sleep(PLAY.fadeMs);
    old.remove(); c?.classList.remove('mapx-xfade');
  }
  function stopPlay(say = false) { if (!s.play) return; s.play.stop = true; s.play = null; part('[data-here]')?.setAttribute('aria-live', 'polite'); setText(part('[data-gprogress]'), ''); drawPlay(); if (say) env.say?.('Paused'); }
  async function play() {
    if (s.play || motionOff() || s.status !== 'ready') return;
    const months = graceFrames(s.g); if (months.length < 2) return;
    const run = s.play = { stop: false }; drawPlay(); part('[data-here]')?.setAttribute('aria-live', 'off');
    env.say?.(`${GRACE.name}: playing ${months.length} months, ${monthShort(months[0])} to ${monthShort(months.at(-1))}`);
    for (let i = 0; i < months.length && !run.stop && !dead; i++) {
      setText(part('[data-gprogress]'), `${i + 1} of ${months.length} · ${monthShort(months[i])}`);
      await showMonth(months[i], !motionQuiet());
      if (i < months.length - 1 && !run.stop) await sleep(motionQuiet() ? PLAY.holdLessMs : holdFor(months.length));
    }
    if (s.play === run) { s.play = null; part('[data-here]')?.setAttribute('aria-live', 'polite'); setText(part('[data-gprogress]'), ''); drawPlay(); env.say?.(`${GRACE.name}: back at ${monthWords(keep.month)}`); }
  }

  // ---- the card's own controls
  const onClick = event => {
    if (!card()?.contains(event.target)) return;
    const b = event.target.closest('button'); if (!b) return;
    if (b.matches('[data-gplay]')) return s.play ? stopPlay(true) : play();
    if (b.matches('[data-gstep]')) { stopPlay(); const to = stepMonth(s.g, keep.month, +b.dataset.gstep); if (to) { showMonth(to, false); env.say?.(hereWords(s.g, to)); } return; }
    if (b.matches('[data-gnewest]')) { stopPlay(); if (s.g) { showMonth(s.g.newest, false); env.say?.(hereWords(s.g, s.g.newest)); } return; }
    if (b.matches('[data-gwhole]')) { if (s.g) map().fitBounds(discBounds(s.g), { animate: !motionQuiet(), padding: [24, 24] }); return; }
    if (b.matches('[data-gretry]')) { b.hidden = true; ask(); }
  };
  const onInput = event => {
    const op = event.target.closest?.('[data-gop]'); if (!op || !card()?.contains(op)) return;
    keep.opacity = +op.value; op.nextElementSibling.textContent = `${op.value}%`; s.layer?.setOpacity(keep.opacity / 100);
  };
  ui.legends.addEventListener('click', onClick);
  ui.legends.addEventListener('input', onInput);
  const onPin = () => { if (!s.on) return; const pin = env.pin?.(); if (pin && cellKey(pin.lat, pin.lon) === s.key && s.status !== 'failed') return; stopPlay(); keep.month = null; ask(); };
  document.addEventListener('crophalo:prefetch', onPin);
  const onView = () => { if (s.on && s.status === 'ready') setText(part('[data-gview]'), viewWords()); };
  map().on('moveend', onView);

  // ---- on and off
  function turnOn() { if (s.on || dead) return; s.on = true; s.revealed = false; render(); ask(); }
  function turnOff() { if (!s.on) return; stopPlay(); s.on = false; s.seq++; detach(); card()?.remove(); s.status = 'idle'; s.g = null; }
  const api = { turnOn, turnOff, play, stopPlay, playing: () => !!s.play, state: () => ({ status: s.status, month: keep.month, key: s.key, why: s.why, drawn: !!s.layer, newest: s.g?.newest ?? null }), layer: () => s.layer,
    rezindex: () => s.layer?.setZIndex(zIndexOf()),
    dispose() { stopPlay(); dead = true; turnOff(); ui.legends.removeEventListener('click', onClick); ui.legends.removeEventListener('input', onInput); document.removeEventListener('crophalo:prefetch', onPin); try { map().off('moveend', onView); } catch { /* the map was already gone */ } if (current === api) current = null; } };
  return current = api;
}
