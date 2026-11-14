// Crophalo's motion switch for scripts. The stylesheet stills its own animations; a script must ask here first.
// Nothing here is pure: it reads the page and the device.
// Checked by scripts/e2e.mjs (always still).

const DEVICE_STILL = matchMedia('(prefers-reduced-motion: reduce)');

// True when nothing should move: the farmer chose "Always still", or the device asks for less motion.
export const motionOff = () => document.documentElement.dataset.motion === 'reduce' || DEVICE_STILL.matches;   // the same attribute the stylesheet reads, so script and style can never disagree
