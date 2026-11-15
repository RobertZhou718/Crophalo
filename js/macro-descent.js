// THE DESCENT (plan part 3.2): when the farmer picks a place on the home, the Earth turns to it, the camera falls toward it and the globe hands over to the setup map, landing on the field.
// The camera stays still in space, so "turn the Earth so the place faces the camera, then fall" is natural. The setup screen is shown under the globe's cover from the first moment (so its map loads during the fall
// and a screen reader is already on Setup); no picture of the last globe frame is taken; no words on screen while the camera moves. A tap or key lands at once on the final map view (150 ms fade).
// Less: only a cross-fade of the setup screen. Still: today's cut. Takes the change of place through hooks.place (js/hooks.js). Checked by scripts/test_live_orbits.mjs (the pure parts) and scripts/e2e_home.mjs.
import { scene, may, claimCamera, releaseCamera, say, ease, T } from './macro-core.js';
import { setHook } from './hooks.js';
import { theGlobe } from './home-orbit.js';
import { loadLeaflet } from './leaflet-load.js';
// The setup map's module is asked for only when a fall begins (the setup is loading it then anyway), so Home never fetches the map library or the setup early.
let mapx = null;
const leafletMap = () => mapx?.leafletMap?.() ?? null;

import { handoff, flightPlan, part, shortWay, PIN_ZOOM, placeEcf, nearestImager, witnessWords } from './descent-plan.js';
export { handoff, flightPlan, shortWay };

let busy = false;
const WITNESS_STAYS = 8000;   // how long the Witness line stays to be read: a reading time, not a motion
// After landing, on a still screen: one line in the map's credit corner, on a solid backing; it goes at the farmer's first touch of the map, or after 8 s
function witnessLine(w, ms) {
  const words = witnessWords(w, ms); if (!words) return;
  const el = Object.assign(document.createElement('p'), { className: 'macro-witness', textContent: words }); el.setAttribute('role', 'status'); document.body.append(el);
  const gone = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), T.QUICK + 40); document.removeEventListener('pointerdown', gone, true); };
  document.addEventListener('pointerdown', gone, { capture: true, once: true }); setTimeout(gone, WITNESS_STAYS);
}
function descend(update, spot) {
  const g = theGlobe, home = document.getElementById('view-home');
  const target = spot && Number.isFinite(spot.lat) && Number.isFinite(spot.lon) ? { lat: spot.lat, lon: spot.lon } : null;
  if (busy || !target || !g || !home || home.hidden) return false;   // "Find it on the map" and a press with the home out of sight take today's cut
  const d = may('descent');
  const hostOf = () => document.getElementById('view-setup');
  if (d.level !== 'full') {   // Less: the screen changes and fades in over 160 ms; Still: today's cut
    busy = true; const s = scene({ name: 'descent', host: hostOf(), end() { update(); } }); s.play(); s.done.finally(() => { busy = false; }); return true;
  }
  if (!g.hasWorld() || !claimCamera('descent')) return false;
  busy = true;
  if (!mapx) loadLeaflet().then(() => import('./mapx.js')).then(m => { mapx = m; }).catch(() => { /* no map: the cover just fades */ });
  const phone = matchMedia('(max-width: 600px)').matches || matchMedia('(pointer: coarse)').matches, plan = flightPlan({ phone, quality: d.k }), W = innerWidth, H = innerHeight;
  const ph = document.querySelector('.orbit-ph')?.getBoundingClientRect(), c0 = g.cam(), x0 = ph ? ph.left + ph.width / 2 : W / 2, y0 = ph ? ph.top + ph.height / 2 : H / 2, r0 = ph ? ph.width / 2 : H * 0.3;
  const { z_h, r_h } = handoff(target.lat), lon1 = shortWay(c0.lon, target.lon);
  const sky = Object.assign(document.createElement('div'), { className: 'macro-sky' }); sky.setAttribute('aria-hidden', 'true'); document.body.append(sky);
  let wit = null, sats = null, seenAt = Date.now();   // the Witness: the picture-taking satellite nearest the place now
  const placePt = (([x, y, z]) => ({ x: x / 6371.0088, y: y / 6371.0088, z: z / 6371.0088 }))(placeEcf(target.lat, target.lon));
  import('./home-sats.js').then(m => { sats = m; seenAt = Date.now(); wit = nearestImager(m.positionsAt(seenAt), target.lat, target.lon); }).catch(() => {});   // "now" is the real present, not the moment the home shows
  g.hold('descent', true); g.force(true); g.lift(sky, W, H);
  update();   // the setup screen is shown from this moment, under the cover: its history, title and focus are right, and a screen reader is on it
  let flew = false, closed = false, seen = null;
  // The setup draws a FRESH map for a new place a moment after update(), and may draw another while the fall plays; the map before it is then taken down and steering it does nothing.
  // So the map is asked for each time it is needed and never kept, and each fresh one is given the view this moment of the flight calls for.
  // The field's own view is worked out here and never read back from the setup map: fitted to the outline when the place has one, else a field's zoom on the pin.
  let fin = { c: [target.lat, target.lon], z: PIN_ZOOM };
  const ring = Array.isArray(spot.outline) ? spot.outline.filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
  const ready = () => {
    const map = leafletMap(); if (!map || map === seen) return map;
    seen = map;
    try {
      map.invalidateSize();
      if (ring.length >= 3 && globalThis.L) { const b = globalThis.L.latLngBounds(ring.map(([lo, la]) => [la, lo])), c = b.getCenter(), z = map.getBoundsZoom(b, false, [48, 48]); if (Number.isFinite(z)) fin = { c: [c.lat, c.lng], z: Math.min(PIN_ZOOM + 1, z) }; }
      if (flew) map.setView(fin.c, fin.z, { animate: false }); else map.setView([target.lat, target.lon], z_h, { animate: false });   // a map drawn after the flight began starts on the field; one drawn before it starts where the globe hands over
    } catch { /* the map is not there: the cover just fades */ }
    return map;
  };
  ready();
  say(`Opening the map of ${spot.name || 'your place'}.`);
  const land = () => { const map = ready(); try { map?.stop(); } catch { /* a map being taken down */ } try { map?.setView(fin.c, fin.z, { animate: false }); } catch { /* as is */ } };   // the field's own view, at once
  const fly = () => {
    const map = ready(); if (flew) return; flew = true;
    try { if (map && Math.abs(map.getZoom() - z_h) > 0.01) map.setView([target.lat, target.lon], z_h, { animate: false }); map?.flyTo(fin.c, fin.z, { duration: phone ? 1.0 : 1.4 }); } catch { land(); }   // the setup may have moved the map under the cover: the flight still starts where the globe hands over
  };
  const finish = (fast) => {   // the end: the final view, the cover gone, everything given back
    if (closed) return; closed = true;
    const done = () => { sats?.setWitness(null); sky.remove(); g.lift(null); g.force(false); g.satAlpha(1); g.hold('descent', false); releaseCamera('descent'); busy = false; witnessLine(wit, seenAt); };
    const map = ready();
    if (fast || (map && Math.abs(map.getZoom() - fin.z) > 0.5 && !map._animatingZoom)) land();   // a flight that has not reached the field by the end is finished at its view: it never stops high
    if (fast) { sky.style.transition = `opacity ${T.BEAT}ms linear`; sky.style.opacity = '0'; setTimeout(done, T.BEAT + 20); }
    else done();
  };
  const s = scene({
    name: 'descent', host: sky, ms: plan.total,
    paint(k) {
      const t = k * plan.total, turn = ease.glide(part(t, plan.turn)), fall = part(t, plan.fall), over = part(t, plan.over);
      const r = r0 * Math.exp(Math.log(r_h / r0) * ease.glide(fall)), lat = c0.lat + (target.lat - c0.lat) * turn, lon = c0.lon + (lon1 - c0.lon) * turn;
      const x = x0 + (W / 2 - x0) * turn, y = y0 + (H / 2 - y0) * turn;
      g.camera({ lat, lon, x, y, r }); g.floor(Math.max(0, (fall - 0.6) / 0.4)); if (sats && wit) sats.setWitness({ norad: wit.norad, place: placePt, k: ease.arrive(part(t, [0, 500])) });
      ready();   // a map the setup has just drawn gets its view at once, so its pictures load under the cover
      if (over > 0) { fly(); sky.style.opacity = String(1 - ease.fade(over)); }
    },
    end() { fly(); finish(false); },
    stop() { finish(true); },   // a tap or key: at once on the final map view, never half-way down
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) s.stop('hidden'); }, { once: true });
  s.play();
  return true;
}

export function start() { setHook('place', (update, spot) => descend(update, spot)); }
