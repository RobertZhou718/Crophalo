// The real spacecraft in a satellite's card on the home: NASA's pictures of its 3D models (Terra, GPM, Landsat 8, the Space Station) and NASA/JPL-Caltech's
// artist's concepts (SMAP, GRACE-FO), each with its credit. Loaded on the first pointing, never before; a picture that cannot load leaves the simple mark and says so.
// The files and their licence rows: img/craft/README.md. Checked by scripts/test_live_orbits.mjs (every picture has its words) and scripts/e2e_home.mjs.
import { WORDS } from './home-sats-data.js';

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
// NOAA-20, NOAA-21 and Sentinel-2 have no free picture: a plain body drawn here, three faces of a box lit from the upper left, nothing added that no page shows.
// w, h: the front face in px of the 640 x 360 window; deep: the side going back. Sentinel-2's are its published 3.4 x 2.35 x 1.8 m at 70 px to the metre.
const box = (w, h, deep, note = '') => { const x = 320 - w / 2 - deep * .25, y = 166 - h / 2 + deep * .15, dx = deep * .5, dy = -deep * .3, e = ' stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-linejoin="round"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><path d="M${x} ${y}h${w}v${h}h${-w}z" fill="#d4dae3"${e}/><path d="M${x} ${y}l${dx} ${dy}h${w}l${-dx} ${-dy}z" fill="#e9edf3"${e}/><path d="M${x + w} ${y}l${dx} ${dy}v${h}l${-dx} ${-dy}z" fill="#a9b3c2"${e}/>${note ? `<text x="14" y="24" fill="#fff" fill-opacity=".8" font-family="system-ui, sans-serif" font-size="13">${note}</text>` : ''}</svg>`; };
export const DRAWN = Object.freeze({
  jpss: { svg: box(150, 150, 150), credit: 'Drawing: Crophalo, a plain body; not a picture of the real craft.', alt: 'A plain drawing of a weather satellite’s body, with no parts added, for NOAA-20 or NOAA-21.' },
  s2: { svg: box(238, 165, 126, 'Wing not drawn: its published pages do not show it.'), credit: 'Drawing: Crophalo, after ESA’s published size (3.4 x 1.8 x 2.35 m).', alt: 'A plain drawing of Sentinel-2’s body in its published proportions, 3.4 by 1.8 by 2.35 metres, with no wing.' },
});
// The picture for a satellite, or null where there is none (NOAA-20, NOAA-21, Sentinel-2: no free picture was found)
export const pictureOf = sat => { const p = PICS[sat?.look]; return p ? (sat.norad === 49260 ? { ...p, ...LANDSAT9 } : p) : null; };

// Put a satellite's picture into the card's window: parts { pic (the figure), img, cap }; landed: resolves when the mark has finished growing; still(): is this satellite still the one shown?
export async function show({ pic, img, cap }, sat, landed, still = () => true) {
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
