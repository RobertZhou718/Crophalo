// The halo family's suite: js/fx-halo.js and css/fx-halo.css. The pure parts (arc geometry and timing, plan comparison, the answer's step times, FLIP distances, unfold insets)
// and the owner's motion rules scanned on the source (scripts/fx_rules.mjs). No page is needed.
// RULE: never loosen a check here without a written reason beside it. Run: node scripts/test_fx_halo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as h from '../js/fx-halo.js';
import { FADE_MS } from '../js/fx.js';
import { scanMotion } from './fx_rules.mjs';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, tol) => check(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ---- geometry
{
  const a = h.arcAngles(3);
  same('three years share the ring: each 120° less a gap, starting at the top and going clockwise', a.map(x => [x.from, x.to].map(Math.round)), [[4, 116], [124, 236], [244, 356]]);
  check('the arcs never overlap and never cross the top twice', a.every((x, i) => i === 0 || x.from > a[i - 1].to) && a[0].from > 0 && a.at(-1).to < 360);
  same('one year uses the whole ring', h.arcAngles(1).map(x => [x.from, x.to]), [[0, 360]]);
  same('none is none', h.arcAngles(0), []);
  const top = h.pointAt(50, 50, 40, 0), right = h.pointAt(50, 50, 40, 90);
  near('0° is straight up', top.y, 10, 1e-9); near('90° is to the right', right.x, 90, 1e-9);
  check('an arc path starts at its start and says whether it is the long way round', /^M50\.00 10\.00A40 40 0 0 1 90\.00 50\.00$/.test(h.arcPath(50, 50, 40, 0, 90)) && /A40 40 0 1 1/.test(h.arcPath(50, 50, 40, 0, 200)), h.arcPath(50, 50, 40, 0, 90));
  near('an arc\'s length is r × angle', h.arcLength(40, 0, 90), 40 * Math.PI / 2, 1e-9);
}
// ---- timing
{
  const plan = [{ crop: 'corn' }, { crop: 'soy', after: 'cover' }, { crop: 'wheat', second: 'soy' }];
  const t = h.haloTimeline(plan);
  same('each year starts one step after the last', t.parts.map(p => p.arc), [0, 380, 760]);
  same('a cover crop\'s arc comes 260 ms after its year, a second crop\'s 460 ms; neither where there is none', t.parts.map(p => [p.cover, p.second]), [[null, null], [640, null], [null, 1220]]);
  same('pictures at 480 ms into each year, the year number at 500 ms', t.parts.map(p => [p.pic - p.arc, p.year - p.arc]), [[480, 500], [480, 500], [480, 500]]);
  check('the whole halo is drawn in under 2.5 s, and a single year in under 1.2 s', t.end < 2500 && h.haloTimeline([{ crop: 'corn' }]).end < 1200, t.end);
  check('the year numbers (words) fade for 160 ms at most, the pictures for 350 ms', FADE_MS <= 160 && h.PIC_MS === 350);
  same('an empty plan has nothing to draw', h.haloTimeline([]).end, 0);
}
// ---- plans
{
  const a = [{ crop: 'corn' }, { crop: 'soy' }, { crop: 'corn' }], b = [{ crop: 'corn' }, { crop: 'soy', after: 'cover' }, { crop: 'wheat', second: 'soy' }];
  same('only the years that differ are drawn again when the plan changes', [h.diffSeasons(a, b), h.diffSeasons(a, a), h.diffSeasons(a, a.slice(0, 2))], [[1, 2], [], [2]]);
  const names = id => ({ corn: 'corn', soy: 'soybeans', wheat: 'winter wheat' }[id] || id);
  same('the words for a screen reader name every year and the extra crops', h.describeRotation({ name: 'Proposed plan', seasons: b.map((s, i) => ({ ...s, year: 2027 + i })) }, names), 'Proposed plan: Corn in 2027, soybeans in 2028 with a cover crop after, winter wheat in 2029, then soybeans.');
  same('no rotation says so', h.describeRotation(null), 'No rotation to show.');
}
// ---- the answer assembling
{
  const order = ['now', 'try', 'reason', 'sureness'];
  const p = h.assemblyPlan({ now: 0, reason: 50, try: 120, sureness: 300 }, order);
  same('a step never opens before the one above it, and never sooner than 140 ms after it', order.map(k => p.at[k]), [0, 140, 280, 420]);
  check('the whole answer is assembled in under 1.8 s from the first data', p.end < 1800, p.end);
  same('late data waits for nothing else: a step that arrives late opens when it arrives', h.assemblyPlan({ now: 0, try: 2000 }, order).at, { now: 0, try: 2000 });
  same('steps that never arrive are not opened', Object.keys(h.assemblyPlan({ now: 0 }, order).at), ['now']);
  check('a step opens in 520 ms by a wipe', h.STEP_MS === 520 && h.STEP_GAP_MS === 140);
}
// ---- FLIP and unfold
{
  const m = (l, t) => ({ left: l, top: t });
  const d = h.flipDeltas(new Map([['a', m(0, 0)], ['b', m(0, 100)], ['c', m(0, 200)]]), new Map([['c', m(0, 0)], ['a', m(0, 100)], ['b', m(0, 200)], ['n', m(0, 300)]]));
  same('each card moves from where it was by the distance it travelled; a card that did not move is left alone; a new card is "added"', [d.moves.map(x => [x.id, x.dx, x.dy]).sort(), d.added], [[['a', 0, -100], ['b', 0, -100], ['c', 0, 200]], ['n']]);
  same('nothing moves when nothing changed', h.flipDeltas(new Map([['a', m(0, 0)]]), new Map([['a', m(0.4, 0.4)]])).moves, []);
  const f = { top: 120, left: 16, right: 336, bottom: 180 }, t = { top: 100, left: 0, right: 360, bottom: 600, width: 360, height: 500 };
  const i = h.unfoldInsets(f, t);
  same('the detail starts clipped to the card that was tapped, inside the detail\'s own box', [i.top, i.left, i.right, i.bottom], [20, 16, 24, 420]);
  check('and it travels at most 48 px', Math.abs(i.dy) <= 48 && Math.abs(h.unfoldInsets({ top: 9999, left: 0, right: 10, bottom: 10000 }, t).dy) <= 48);
  check('the insets are never negative or larger than the box (nothing is made bigger than it is)', [i.top, i.left, i.right, i.bottom].every(v => v >= 0) && h.unfoldInsets({ top: -500, left: -500, right: 9999, bottom: 9999 }, t).top <= 500);
  same('three passes of marching ants, 900 ms each: 2.7 s, so no pause button is needed', [h.ANTS_CYCLES, h.ANTS_CYCLE_MS, h.ANTS_CYCLES * h.ANTS_CYCLE_MS], [3, 900, 2700]);
}
// ---- the motion rules, on the source
{
  const r = scanMotion({ css: read('css/fx-halo.css'), js: read('js/fx-halo.js'), appCss: read('css/app.css'), label: 'halo', check, same, effects: ['rotationHalo', 'answerAssembly', 'flipReorder', 'unfold', 'marchingAnts'], fxCss: read('css/fx.css') });
  check('the halo\'s only CSS animation is the marching ants, finite (3 passes)', [...r.CSS.matchAll(/animation:[^;}]*\b\d+(?:ms|s)[^;}]*;/g)].filter(m => !/none/.test(m[0])).length === 1 && /fx-march 900ms linear 3\b/.test(r.CSS));
  check('the wipe clips the words and never fades them: no opacity on the steps', !/\.fx-wait[^{]*\{[^}]*opacity/.test(r.CSS));
  check('the dial only grows up to its share (its dash array climbs from 0)', /\.fx-wait \.fx-dial-arc\s*\{\s*stroke-dasharray:\s*0 100/.test(r.CSS) && /\.fx-wait\.fx-open \.fx-dial-arc\s*\{[^}]*transition:\s*stroke-dasharray 640ms var\(--ease\)/.test(r.CSS));
  check('under still the steps are open, the arcs complete, the ants at rest', /html\[data-motion=reduce\] \.fx-wait\s*\{\s*clip-path:\s*none/.test(r.CSS) && /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.fx-wait\s*\{\s*clip-path:\s*none/.test(r.CSS) && /\.fx-ants\s*\{\s*animation:\s*none\s*!important/.test(r.CSS));
  check('a tap never waits for motion: the card reorders first, then its move is animated; the detail is shown before it unfolds', (() => { const m = /export function flipReorder[\s\S]*?\n\}/.exec(r.JS)?.[0] || ''; return m.indexOf('mutate()') > -1 && m.indexOf('mutate()') < m.indexOf('.animate('); })());
  check('the halo draws only what is in the plan: nothing is invented (every arc comes from a season)', /seasons\.forEach/.test(r.JS) && !/Math\.random/.test(r.JS));
  check('the halo has no satellite loop: nothing runs over 5 s here', !/9000|9s|orbit/i.test(r.JS + r.CSS));
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
