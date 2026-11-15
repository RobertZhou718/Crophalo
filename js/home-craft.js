// The real spacecraft in a satellite's card on the home: NASA's pictures of its 3D models (Terra, GPM, Landsat 8, the Space Station) and NASA/JPL-Caltech's
// artist's concepts (SMAP, GRACE-FO), each with its credit. Loaded on the first pointing, never before; a picture that cannot load leaves the simple mark and says so.
// The files and their licence rows: img/craft/README.md. Checked by scripts/test_live_orbits.mjs (every picture has its words) and scripts/e2e_home.mjs.
import { WORDS } from './home-sats-data.js';
import { JPSS_SVG, S2_SVG } from './home-craft-art.js';

const MODEL = 'Picture: NASA (NASA 3D Resources model).', JPL = 'Artist’s concept. Courtesy NASA/JPL-Caltech.';
export const PICS = Object.freeze({
  terra: { src: 'img/craft/terra.webp', credit: MODEL, alt: 'Terra, from NASA’s 3D model: a gold box-shaped body with a small dish on top and one long blue solar wing, which runs out of the picture.' },
  gpm: { src: 'img/craft/gpm.webp', credit: MODEL, alt: 'The GPM Core Observatory, from NASA’s 3D model: a white body with a solar wing on each side and a round dish on a frame on top.' },
  landsat: { src: 'img/craft/landsat8.webp', credit: MODEL, alt: 'Landsat 8, from NASA’s 3D model: a gold and grey body with a round end, one large dark solar wing and a smaller flat panel.' },
  iss: { src: 'img/craft/iss.webp', credit: 'Picture: NASA (NASA 3D Resources model of the Space Station).', alt: 'The International Space Station, from NASA’s 3D model: a long truss with large solar wings at both ends and a line of modules in the middle.' },
  smap: { src: 'img/craft/smap.webp', cover: true, sides: true, credit: JPL, alt: 'SMAP, artist’s concept: a small gold spacecraft with a solar wing and a large round mesh antenna on a long arm, above the Earth.' },
  gracefo: { src: 'img/craft/gracefo.webp', cover: true, credit: `${JPL} Both craft are shown; not to scale.`, alt: 'GRACE-FO, artist’s concept: two identical satellites with gold ends flying one behind the other above the Earth.' },
});
const LANDSAT9 = { credit: 'Picture: Landsat 8, NASA (NASA 3D Resources model). Landsat 9 is built on the same design.', alt: 'Landsat 8, from NASA’s 3D model, shown for Landsat 9, which is built on the same design.' };
// NOAA-20, NOAA-21 and Sentinel-2: no picture of theirs that we may use was found in the time, so each is drawn as a spacecraft (js/home-craft-art.js), never as a box, and the caption says it is a drawing.
const DRAWING = 'Drawing: Crophalo, a simplified picture of the craft; not the agency’s picture and not to scale.';
export const DRAWN = Object.freeze({
  jpss: { svg: JPSS_SVG, credit: DRAWING, alt: 'A drawing of a weather satellite of the JPSS family, for NOAA-20 or NOAA-21: a long body wrapped in gold foil, one large blue solar wing on a boom, a telescope and instruments on the earth-facing end, and a small dish.' },
  s2: { svg: S2_SVG, credit: DRAWING, alt: 'A drawing of Sentinel-2: a white and gold body with the imager’s dark opening and its telescope under it, one large blue solar wing on a boom, and a dish on a mast.' },
});
// The picture for a satellite, or null where there is none (NOAA-20, NOAA-21, Sentinel-2: no free picture was found)
export const pictureOf = sat => { const p = PICS[sat?.look]; return p ? (sat.norad === 49260 ? { ...p, ...LANDSAT9 } : p) : null; };

// Put a satellite's picture into the card's window: parts { pic (the figure), img, cap }; landed: resolves when the mark has finished growing; still(): is this satellite still the one shown?
export async function show({ pic, img, cap }, sat, landed, still = () => true) {
  pic.classList.add('is-loading');   // a grey shimmer in the shape of the picture until it is here
  try { return await showIn({ pic, img, cap }, sat, landed, still); } finally { pic.classList.remove('is-loading'); }
}
async function showIn({ pic, img, cap }, sat, landed, still) {
  const d = DRAWN[sat?.look];
  if (d) { await landed; if (!still()) return false; img.className = ''; img.alt = d.alt; img.src = 'data:image/svg+xml,' + encodeURIComponent(d.svg); img.hidden = false; cap.textContent = d.credit; pic.classList.add('has-pic'); return true; }
  const p = pictureOf(sat);
  if (!p) return false;
  const fail = () => { if (still()) { img.hidden = true; img.removeAttribute('src'); pic.classList.remove('has-pic'); cap.textContent = navigator.onLine === false ? WORDS.picOff : WORDS.picFail; } return false; };
  const probe = new Image(); probe.decoding = 'async'; probe.src = p.src;
  try { await probe.decode(); await landed; } catch { return fail(); }
  if (!still()) return false;
  img.className = [p.cover ? 'cover' : '', p.sides ? 'sides' : ''].join(' ').trim(); img.alt = p.alt; img.src = p.src; img.hidden = false;
  cap.textContent = p.credit; pic.classList.add('has-pic');
  return true;
}
// The other pictures, fetched quietly once a card has been seen (never on data saver), so they are there offline and at once
export function prefetch(except, lowData) {
  if (lowData) return;
  const go = () => { for (const [look, p] of Object.entries(PICS)) if (look !== except) fetch(p.src).catch(() => {}); };
  (globalThis.requestIdleCallback || (f => setTimeout(f, 1500)))(go);
}
