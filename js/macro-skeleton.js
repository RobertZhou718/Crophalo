// THE SKELETON BECOMES THE FIELD (plan part 3.19): the sketch of the land that shows while 3D is built stays as the first frame, and its parts fill in as the build really reaches them: land, ground, plants, light.
// It listens to the 3D view's events (f3d-step, f3d-ready) and writes only a data attribute; the fades are in css/macro-3d.css. Nothing waits for it and it never shows a part before it is built.
// Under Less the skeleton goes as it does today, under Still it hides at once: only Full fills in. Checked by scripts/test_macro_3d.mjs (builtAfter) and scripts/e2e_macro_farm.mjs.
import { level } from './macro-core.js';
import { ORDER, builtAfter } from './macro-sun-data.js';

// the stylesheet comes with the scene, not with the page
const href = new URL('../css/macro-3d.css', import.meta.url).href;
if (typeof document !== 'undefined' && !document.querySelector(`link[rel=stylesheet][href="${href}"]`)) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link); }

// node: the 3D view's element (the .f3d). Returns { dispose }.
export function skeletonFades(node) {
  if (!node?.addEventListener) return { dispose() {} };
  const heard = [];
  const onStep = e => {
    const step = e.detail?.step; if (!ORDER.includes(step) || heard.includes(step)) return;
    heard.push(step);
    if (level() === 'full') node.dataset.built = builtAfter(heard).join(' ');   // Less and Still: the sketch stays as today and goes with the picture
  };
  const onReady = () => { node.dataset.built = ORDER.join(' '); };
  node.addEventListener('f3d-step', onStep); node.addEventListener('f3d-ready', onReady);
  return { dispose() { node.removeEventListener('f3d-step', onStep); node.removeEventListener('f3d-ready', onReady); delete node.dataset.built; } };
}
