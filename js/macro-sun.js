// PLAY THE DAY on the 3D view (plan part 3.20): on a press, the sun of the shown date crosses from its real sunrise to its real sunset in 8 s (then holds 2 s), the ground's shadows and the one light follow,
// a 64 px dial turns in step, and the view ends on the date's own time, exactly as Still shows it. Pause and Skip come from the play bar. At Less and Still the day is stepped through, one time of day for each press.
// Not pure: it adds one section to the 3D view's words and draws on the view's own handle (handle.sun, handle.sunDay, js/farm3d.js). The numbers are in js/macro-sun-data.js.
// Never reads the Motion setting: js/macro-core.js decides how a scene plays. Checked by scripts/test_macro_3d.mjs (the numbers) and scripts/e2e_macro_farm.mjs (the screen).
import { scene, say, onLevel } from './macro-core.js';
import { sunAt } from './sun.js';
import { WORDS, canPlay, msAt, stopsOf, dialAngle, noonWords, FILM_MS, HOLD_MS } from './macro-sun-data.js';

// the stylesheet comes with the scene, not with the page
const href = new URL('../css/macro-3d.css', import.meta.url).href;
if (typeof document !== 'undefined' && !document.querySelector(`link[rel=stylesheet][href="${href}"]`)) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link); }

// handle: what view3d() resolved with. node: the 3D view's element (where its words are). Gives { dispose } and adds the button; nothing plays until it is pressed.
export function playDay(handle, node, { stops: stopKind = 'three' } = {}) {
  if (!handle?.sun || !handle.sunDay || !node?.isConnected) return { dispose() {} };
  const host = node.querySelector?.('.f3d-words') || node;
  const box = Object.assign(document.createElement('div'), { className: 'm-day' });
  const button = Object.assign(document.createElement('button'), { type: 'button', className: 'btn m-day-btn', textContent: WORDS.play });
  const dial = Object.assign(document.createElement('span'), { className: 'm-sundial' }); dial.setAttribute('aria-hidden', 'true');
  const controls = Object.assign(document.createElement('div'), { className: 'm-day-controls' });
  box.append(button, dial, controls); host.append(box);
  let current = null, disposed = false;

  const refresh = () => { const day = handle.sunDay(); box.hidden = !canPlay(day); return day; };
  const turn = s => { if (s) dial.style.setProperty('--sun-az', `${dialAngle(s.azimuth)}deg`); };
  function start() {
    if (disposed || current) return;
    const day = refresh(); if (!canPlay(day)) return;
    const stops = stopsOf(day, stopKind);
    const sc = current = scene({
      name: 'play-day', host: controls, ms: FILM_MS + HOLD_MS,
      paint(k) { turn(handle.sun(msAt(k, day))); },
      end() { turn(handle.sun(null)); },
      steps: { count: stops.length, at: i => { const s = handle.sun(stops[i].ms); turn(s); say(`${stops[i].label}. ${s.words}`); } },
      controls: { host: controls, words: { label: WORDS.label, pause: WORDS.pause, play: WORDS.resume, skip: WORDS.skip, step: WORDS.step } },
    });
    button.disabled = true; sc.play();
    sc.done.then(() => {
      current = null; if (disposed) return;
      button.disabled = false;
      if (sc.form === 'full') { const at = handle.scene?.()?.slab, n = at && sunAt(day.noon, at.lat, at.lon); if (n) say(noonWords({ height: n.apparent, azimuth: n.azimuth })); }   // said once, for the noon of the date, without moving the sun there
    });
  }
  button.addEventListener('click', start);
  const off = onLevel(() => { current?.stop('level'); refresh(); });
  refresh();
  return { dispose() { disposed = true; current?.stop('closed'); off?.(); box.remove(); handle.sun(null); } };
}
