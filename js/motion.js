// Crophalo's motion switch for scripts. The stylesheet stills its own animations; a script must ask here first.
// Nothing here is pure: it reads the page and the device.
// Checked by scripts/e2e.mjs (always still).

const DEVICE_STILL = matchMedia('(prefers-reduced-motion: reduce)');

// True under "Less" (html[data-motion=less]): the big movements stop (flying, sliding, pulsing, marching lines) and quick fades of 200 ms or less stay.
export const motionLess = () => document.documentElement.dataset.motion === 'less';
// True when the map should not travel or glide at all: "Always still", the device asking for less motion, or "Less".
export const motionQuiet = () => motionOff() || motionLess();

// True when nothing should move: the farmer chose "Always still", or the device asks for less motion.
export const motionOff = () => document.documentElement.dataset.motion === 'reduce' || DEVICE_STILL.matches;   // the same attribute the stylesheet reads, so script and style can never disagree
