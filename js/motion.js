// Crophalo's motion switch for scripts. The stylesheet stills its own animations; a script must ask here first, and may watch for a change of level.
// Nothing here is pure but easeOut(): it reads the page and the device.
// Checked by scripts/e2e.mjs (always still) and scripts/e2e_maptools.mjs (Full, Less and Still on the map).

const DEVICE_STILL = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };   // a test with no page still loads this file

// True when nothing should move: the farmer chose "Always still", or the device asks for less motion.
export const deviceAsksStill = () => DEVICE_STILL.matches;
export const motionOff = () => globalThis.document?.documentElement.dataset.motion === 'reduce' || DEVICE_STILL.matches;   // the same attribute the stylesheet reads, so script and style can never disagree
// True when only quick fades and colour changes (200 ms at most) and press, hover and focus states are allowed: the farmer chose "Less" or "Still", or the device asks for less motion. Under it a script draws no sweep, scan or parallax,
// rolls no number (it shows the final one), draws no line itself (it shows it drawn), and starts nothing that loops.
export const motionLess = () => motionOff() || globalThis.document?.documentElement.dataset.motion === 'less';
// True when the map should not travel or glide at all: "Always still", the device asking for less motion, or "Less".
export const motionQuiet = () => motionLess();
export const STILL_BY_DEVICE = 'Your device asks for less motion, so Crophalo keeps still.';

// The app's out-curve for script motion: fast at first, settling at its end, never past it. Pure.
export const easeOut = t => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

// Call fn whenever the level changes: the page's own choice (html[data-motion]) or the device's. Returns a function that stops watching.
export function onMotionChange(fn) {
  const seen = new MutationObserver(() => fn()), device = () => fn();
  seen.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  DEVICE_STILL.addEventListener?.('change', device);
  return () => { seen.disconnect(); DEVICE_STILL.removeEventListener?.('change', device); };
}
