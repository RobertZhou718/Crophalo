// The area block of the map's spot card, as a part any screen can mount: the area large in the first unit, the second unit and the corners under it, whether the report uses it, and the picture of the outline (north up).
// areaBlockHTML() is pure; mountAreaBlock(host, opts) draws it in a host element and keeps it current from the map's own events (crophalo:outline and crophalo:area). While anything loads (setLoading(true)) it shows grey skeleton lines in the shape of the block, never an empty area.
// For the setup's "Your field" step: mountAreaBlock(document.querySelector('#areaHost'), { order: () => order(), now: outlineNow }) where outlineNow comes from js/mapx.js. Checked by scripts/test_areablock.mjs.
import { areaHa, areaPair } from './geo.js';
import { outlineSVG } from './outline.js';
import { skeleton } from './skeleton.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const WORDS = Object.freeze({
  loading: 'Working out the size of your field…',
  none: 'Draw your field on the map (a rectangle or corners) to see its size here, or tap the map to drop a pin.',
  used: 'Used in report', selected: 'Outline drawn, not used yet',
  line: (second, corners) => `${second} · ${corners} corners`,
});
// state: { ring: [[lat, lon], ...], used } or null. order: 'hectares' | 'acres' (the first unit). Pure.
export function areaBlockHTML(state, { order = 'hectares', loading = false } = {}) {
  if (loading) return skeleton('area', WORDS.loading);
  const ring = Array.isArray(state?.ring) ? state.ring : null;
  if (!ring || ring.length < 3) return `<p class="cap ab-none">${esc(WORDS.none)}</p>`;
  const ha = areaHa(ring), pair = areaPair(ha, order), fig = outlineSVG({ pts: ring }, { label: 'The outline you drew, north up' });
  return `<section class="ab" aria-label="Your field's area"><p class="spot-big fig" id="abFigure">${esc(pair.first)}</p>
    <p class="spot-second">${esc(WORDS.line(pair.second, ring.length))}</p><p><span class="chip ${state.used ? 'on' : ''}">${esc(state.used ? WORDS.used : WORDS.selected)}</span></p>
    ${fig ? `<figure class="land-fig ab-fig">${fig}<figcaption class="cap">The outline you drew, north up</figcaption></figure>` : ''}</section>`;
}
// Draws the block in host and keeps it current. opts: { order: () => 'hectares' | 'acres', now: () => ({ ring, used }) | null }. Returns { setLoading(on), redraw(), destroy() }.
export function mountAreaBlock(host, { order = () => 'hectares', now = () => null } = {}) {
  let loading = false, alive = true;
  const draw = () => { if (alive && host) host.innerHTML = areaBlockHTML(now(), { order: order(), loading }); };
  const on = () => draw();
  document.addEventListener('crophalo:outline', on); document.addEventListener('crophalo:area', on);
  draw();
  return { setLoading(v) { loading = !!v; draw(); }, redraw: draw, destroy() { alive = false; document.removeEventListener('crophalo:outline', on); document.removeEventListener('crophalo:area', on); } };
}
