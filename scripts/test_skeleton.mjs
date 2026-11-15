// The offline suite of the grey skeletons: each shape draws grey lines, the words for a screen reader are written out, and an unknown shape falls back to the list.
// RULE: never loosen a check here without a written reason beside it. Run: node scripts/test_skeleton.mjs
import { skeleton, SHAPE_NAMES } from '../js/skeleton.js';
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail === '' ? '' : `  (${detail})`}`); } };
for (const n of SHAPE_NAMES) { const h = skeleton(n, 'Reading <this>'); check(`${n}: grey lines, a status for the reader, the words written out`, /class="sk/.test(h) && /role="status"/.test(h) && /Reading &lt;this&gt;/.test(h) && /aria-hidden="true"/.test(h), h.slice(0, 80)); }
check('an unknown shape is the list', skeleton('nothing', 'x') === skeleton('list', 'x'));
console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
