// Crophalo's loading sign on the map: any press that makes the map fetch or draw again (Satellite / Light, a layer turned on, an earlier or newer picture) shows the house loading sign within a tenth of a second and until the new tiles are drawn.
// Work that ends sooner than that (a base already kept by the browser) never flashes the sign; once shown it stays a moment so it does not flicker. Parts say busy(key, true / false); a key that never ends is let go after 20 s.
// Not pure (it listens on the page), but its clock is handed in. Checked by scripts/test_mapbusy.mjs (the timing rules with a hand-driven clock) and scripts/e2e_map.mjs (the busy group: slow tiles show it, a quick change never does).
export const SHOW_AFTER_MS = 90, STAY_MS = 350, LET_GO_MS = 20000, SLOW_AFTER_MS = 8000;
export const WORDS = Object.freeze({ loading: 'Loading the map\u2026', slow: 'Still loading the map\u2026' });   // after 8 s the sign says it is still going
export const busy = (key, on) => { try { document.dispatchEvent(new CustomEvent('crophalo:busy', { detail: { key, on: !!on } })); } catch { /* no page: nothing to show */ } };
// A tile layer says by itself when it starts and ends loading; removing it ends it too.
export function watchTiles(layer, key) {
  layer.on('loading', () => busy(key, true)); layer.on('load', () => busy(key, false)); layer.on('remove', () => busy(key, false));
  return layer;
}
// el: the sign (hidden when idle). clock: { now(), later(fn, ms) -> id, cancel(id) }.
export function initBusy(el, clock = { now: () => performance.now(), later: (fn, ms) => setTimeout(fn, ms), cancel: id => clearTimeout(id) }, target = globalThis.document) {
  const keys = new Map(); let showTimer = null, hideTimer = null, shownAt = 0, slowTimer = null;
  const word = el.querySelector?.('[data-busytext]');
  const say = text => { if (word && word.textContent !== text) word.textContent = text; };
  const show = () => { showTimer = null; if (!keys.size) return; el.hidden = false; shownAt = clock.now(); };
  const hide = () => { hideTimer = null; if (!keys.size) el.hidden = true; };
  function set(key, on) {
    if (on) {
      if (keys.has(key)) clock.cancel(keys.get(key));
      if (!keys.size) { say(WORDS.loading); if (slowTimer !== null) clock.cancel(slowTimer); slowTimer = clock.later(() => { slowTimer = null; if (keys.size) say(WORDS.slow); }, SLOW_AFTER_MS); }
      keys.set(key, clock.later(() => set(key, false), LET_GO_MS));
      if (hideTimer !== null) { clock.cancel(hideTimer); hideTimer = null; }
      if (el.hidden && showTimer === null) showTimer = clock.later(show, SHOW_AFTER_MS);
      return;
    }
    if (!keys.has(key)) return;
    clock.cancel(keys.get(key)); keys.delete(key);
    if (keys.size) return;
    if (slowTimer !== null) { clock.cancel(slowTimer); slowTimer = null; }
    if (showTimer !== null) { clock.cancel(showTimer); showTimer = null; return; }   // over before the sign came up: never a flash
    if (!el.hidden && hideTimer === null) hideTimer = clock.later(hide, Math.max(0, STAY_MS - (clock.now() - shownAt)));
  }
  const heard = event => set(String(event.detail?.key ?? ''), !!event.detail?.on);
  target?.addEventListener?.('crophalo:busy', heard);
  return { set, on: () => !el.hidden, keys: () => [...keys.keys()], dispose() { target?.removeEventListener?.('crophalo:busy', heard); for (const t of keys.values()) clock.cancel(t); keys.clear(); if (showTimer !== null) clock.cancel(showTimer); if (slowTimer !== null) clock.cancel(slowTimer); if (hideTimer !== null) clock.cancel(hideTimer); el.hidden = true; } };
}
