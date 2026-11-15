// Crophalo's "added to My farm" moment, the part that travels: when the report says crophalo:did "added", a small field token leaves the button and flies to the My farm item in the top bar along a soft arc, fading as it arrives, and the item glows once.
// Full only. Less and Still draw nothing here (the check on the button and the toast are enough). Nothing is bigger than full size, nothing bounces, nothing takes a click or a key, and the token is removed when it lands. Not pure: it changes the page.
// Checked by scripts/e2e_reportux.mjs (Full travels and lands, Less and Still add nothing).
import { motionLess } from './motion.js';

export const FLIGHT_MS = 700;
// The path of the token: from the button's centre to the item's centre, rising a little in the middle (an arc), as three keyframes.
export function arcFrames(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, lift = Math.min(80, Math.max(24, Math.hypot(dx, dy) * 0.2));
  return [{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - lift}px) scale(1)`, opacity: 1, offset: 0.55 }, { transform: `translate(${dx}px, ${dy}px) scale(.6)`, opacity: 0 }];
}
const centre = el => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; };
export function fly(button, target, { doc = document } = {}) {
  const a = centre(button), b = centre(target); if (!a.w || !b.w) return null;
  const token = doc.createElement('span'); token.className = 'added-token'; token.setAttribute('aria-hidden', 'true');
  token.innerHTML = '<svg class="ic"><use href="#i-cube"/></svg>'; token.style.left = `${a.x - 14}px`; token.style.top = `${a.y - 14}px`;
  doc.body.append(token);
  const move = token.animate(arcFrames(a, b), { duration: FLIGHT_MS, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  move.onfinish = move.oncancel = () => { token.remove(); target.animate([{ boxShadow: '0 0 0 0 transparent' }, { boxShadow: '0 0 0 6px var(--accent-soft)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 600, easing: 'ease-out' }); };   // the item glows once as the token lands
  return token;
}
if (typeof document !== 'undefined') document.addEventListener('crophalo:did', event => {
  const d = event.detail; if (d?.what !== 'added' || !d.button || motionLess()) return;
  const target = document.querySelector('#navFarm'); if (target) try { fly(d.button, target); } catch { /* the moment is a nicety: the toast still says it */ }
});
