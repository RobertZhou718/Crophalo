// Crophalo's suite for the map's skeleton lines (js/skeleton.js) and the area block that the setup's "Your field" step mounts (js/areablock.js).
// Pure: the html is checked as text, with a stand-in host and document for the mount; every shape of skeleton, the block's words, and the redraw on the map's own events.
import { skeleton, SHAPE_NAMES } from '../js/skeleton.js';
import { areaBlockHTML, WORDS, mountAreaBlock } from '../js/areablock.js';
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };

for (const shape of SHAPE_NAMES) {
  const h = skeleton(shape, 'Getting the weather here…');
  check(`${shape}: grey lines are hidden from a screen reader, the words are read, and the block says it is a status`, /role="status"/.test(h) && /class="sr">Getting the weather here…</.test(h) && /class="sk-lines" aria-hidden="true"/.test(h) && /class="sk/.test(h));
  check(`${shape}: it holds no text of its own to see (only grey shapes)`, !/>[^<\s][^<]*</.test(h.replace(/<span class="sr">[^<]*<\/span>/, '')));
}
check('an unknown shape still draws lines, never an empty area', /class="sk/.test(skeleton('nope', 'x')));
check('words are escaped', !/<script/.test(skeleton('list', '<script>')));

const RING = [[41.17, -96.45], [41.17, -96.44], [41.165, -96.44], [41.165, -96.45]];
const acres = areaBlockHTML({ ring: RING, used: true }, { order: 'acres' }), ha = areaBlockHTML({ ring: RING, used: false }, { order: 'hectares' });
check('the area is large in the first unit (acres first for acres), the second unit and the corners under it', /class="spot-big fig"[^>]*>[\d.,]+ acres/.test(acres) && /ha · 4 corners/.test(acres) && /class="spot-big fig"[^>]*>[\d.,]+ ha/.test(ha) && /acres · 4 corners/.test(ha), acres);
check('"Used in report" when it is used, else "Outline drawn, not used yet"', /Used in report/.test(acres) && /Outline drawn, not used yet/.test(ha) && /chip on/.test(acres) && !/chip on/.test(ha));
check('the picture of the outline is in it, north up, with its arrow', /class="outline/.test(acres) && /The outline you drew, north up/.test(acres) && /outline-n/.test(acres));
check('nothing drawn: one plain sentence says how to draw, no empty box', areaBlockHTML(null) === `<p class="cap ab-none">${WORDS.none}</p>` && areaBlockHTML({ ring: RING.slice(0, 2) }).includes('ab-none'));
check('loading: skeleton lines in the shape of the block, with words for a screen reader', /sk-block/.test(areaBlockHTML(null, { loading: true })) && /Working out the size of your field/.test(areaBlockHTML({ ring: RING }, { loading: true })) && !/spot-big/.test(areaBlockHTML({ ring: RING }, { loading: true })));
check('every sentence is plain and ends with a full stop or an ellipsis', [WORDS.loading, WORDS.none].every(t => /[.…]$/.test(t)));

// mounting: a stand-in host and document
const listeners = {}; globalThis.document = { addEventListener: (n, f) => { (listeners[n] ??= []).push(f); }, removeEventListener: (n, f) => { listeners[n] = (listeners[n] ?? []).filter(x => x !== f); } };
const host = { innerHTML: '' }; let state = null;
const m = mountAreaBlock(host, { order: () => 'acres', now: () => state });
check('mounted with nothing drawn it shows the sentence', host.innerHTML.includes('ab-none'));
state = { ring: RING, used: true }; listeners['crophalo:outline'].forEach(f => f());
check('an outline event redraws it', /acres/.test(host.innerHTML) && /Used in report/.test(host.innerHTML));
m.setLoading(true); check('setLoading(true) shows the skeleton', /sk-block/.test(host.innerHTML));
m.setLoading(false); check('setLoading(false) shows the block again', /spot-big/.test(host.innerHTML));
m.destroy(); check('destroy takes the listeners away', !(listeners['crophalo:outline']?.length) && !(listeners['crophalo:area']?.length));
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
