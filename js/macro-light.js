// FIRST LIGHT (plan part 3.1): at the first visit the day side arrives from the Sun's real place twelve hours ago to its real place now, in 1.6 s (1.2 s on a phone), with the real satellites flying throughout. Then it holds.
// The credit line says "Daylight over the last 12 hours" during the sweep and "Light: the sun's real place at 15:42 UTC. Picture: Blue Marble (2004)." at the end; the text changes once at each end and does not tick.
// Any input ends it at "now" in the same frame (js/macro-core.js). Less and Still: the real light now, with no sweep. Once for each visit; not a delay: it starts when the Earth's picture is up. Checked by scripts/e2e_home.mjs (the credit line).
import { scene, once, may, ease, phone } from './macro-core.js';
import { theGlobe } from './home-orbit.js';
import { momentWords } from './home-time.js';

const HOURS = 12;
export function start() {
  const g = theGlobe, credit = document.getElementById('orbitCreditPic');
  if (!g?.hasWorld?.() || !credit || !once('first-light')) return;
  const sentence = ms => `Light: the sun’s real place at ${momentWords(ms).slice(-9)}. Picture: Blue Marble (2004).`;
  const sc = scene({
    name: 'first-light', host: document.getElementById('orbitCanvas'), ms: phone() ? 1200 : 1600,
    paint(k) { g.sunShift(HOURS * 36e5 * (1 - ease.even(k))); },
    end() { g.sunShift(0); credit.textContent = sentence(g.clock()); },
  });
  if (may('first-light').level === 'full') credit.textContent = 'Daylight over the last 12 hours';
  sc.play();
}
