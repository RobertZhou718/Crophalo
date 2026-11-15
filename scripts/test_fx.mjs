// The small-motions suite: js/fx.js and css/fx.css. The pure parts (curves, counts, orders, clocks, the Watch-the-year machine) and a scan of the source for the owner's rules:
// fades, colour and smooth slides only; no curve that passes its end; nothing scaled past full size, shrunk and grown back, bounced, sprung, wiggled or rotated; no press or hover transform;
// every colour and size a token of css/app.css; everything that could move over 5 s can be stopped; everything off under both still switches. No page is needed.
// RULE: never loosen a check here without a written reason beside it. Run: node scripts/test_fx.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fx from '../js/fx.js';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, tol) => check(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripCss = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// ---- the pure parts
{
  let up = true, last = -1, inside = true;
  for (let k = -0.2; k <= 1.2; k += 0.01) { const v = fx.easeOut(k); if (v < last - 1e-12) up = false; last = v; if (v < 0 || v > 1) inside = false; }
  check('the curve never leaves 0 to 1 and only climbs: nothing overshoots or pulls back', up && inside);
  same('it starts at 0 and ends at 1, and holds beyond', [fx.easeOut(0), fx.easeOut(1), fx.easeOut(3), fx.easeOut(-1)], [0, 1, 1, 0]);
  check('a number rolling from 0 to 480 never passes 480', Array.from({ length: 101 }, (_, i) => fx.rollValue(0, 480, i / 100)).every(v => v >= 0 && v <= 480));
  same('a number rolling down also never passes its end', Array.from({ length: 101 }, (_, i) => fx.rollValue(90, 10, i / 100)).every(v => v <= 90 && v >= 10), true);
  same('sections arriving together are one step (70 ms) apart by position modulo four', [0, 1, 2, 3, 4, 5, 9].map(fx.stagger), [0, 70, 140, 210, 0, 70, 70]);
  const o = fx.parcelOrder();
  same('twelve parcels, each once, in the same order every time', [[...o].sort((a, b) => a - b), JSON.stringify(fx.parcelOrder()) === JSON.stringify(o)], [Array.from({ length: 12 }, (_, i) => i), true]);
  check('a different seed gives a different order (it is a shuffle, not the identity)', JSON.stringify(fx.parcelOrder(12, 99)) !== JSON.stringify(o) && JSON.stringify(o) !== JSON.stringify(Array.from({ length: 12 }, (_, i) => i)));
  same('fields lit: round(done ÷ total × 12), never below 0 or above 12', [[0, 6], [1, 12], [3, 6], [6, 6], [7, 6], [1, 0], [-2, 6]].map(([d, t]) => fx.litCount(d, t)), [0, 1, 6, 12, 12, 0, 0]);
  const t0 = 1000;
  near('the satellite keeps one clock: a redraw 7 s later lands in the same place of the pass', fx.scanDelay(t0 + 3000, t0), fx.scanDelay(t0 + 3000 + 7000, t0), 1e-9);
  check('the delay is never positive (the pass is already under way) and within one pass', [0, 1, 2500, 7000, 20000].every(ms => { const d = fx.scanDelay(t0 + ms, t0); return d <= 0 && d > -7.0000001; }));
  same('one full pass is 7 s, the year 9 s', [fx.SCAN_S, fx.YEAR_S], [7, 9]);
  same('the reading rail: its fraction, and shown only after 400 px', [fx.railFraction(0, 3000, 800), fx.railFraction(1100, 3000, 800), fx.railFraction(5000, 3000, 800), fx.railFraction(10, 500, 800), fx.railShown(400), fx.railShown(401), fx.railShown(900, false)], [0, 0.5, 1, 0, false, true, false]);
  same('direction of travel', [fx.turnDirection(0, 2), fx.turnDirection(3, 1), fx.turnDirection(1, 1)], ['forward', 'back', 'none']);
  same('numbers are formatted as the page does', [fx.formatRoll(12480), fx.formatRoll(7.5, 1), fx.formatRoll(1234.567, 2)], ['12,480', '7.5', '1,234.57']);
  const key = {}; same('one trigger plays one motion once; another motion on the same element plays once too', [fx.playOnce(key, 'a'), fx.playOnce(key, 'a'), fx.playOnce(key, 'b'), fx.playOnce({}, 'a')], [true, false, true, true]);
  same('every motion has an easing that is the one out-curve', fx.EASE, 'cubic-bezier(.2,.8,.2,1)');
  check('a word is never partly faded for longer than 160 ms', fx.FADE_MS <= 160);
}

// ---- Watch the year
{
  let st = fx.yearStart(false);
  same('moving: it starts idle and says "Watch the year"', [st.phase, fx.yearLabel(st)], ['idle', 'Watch the year']);
  st = fx.yearPress(st); same('a press plays it, and the button says "Stop"', [st.phase, st.month, fx.yearLabel(st)], ['playing', 0, 'Stop']);
  st = fx.yearPress(st); same('a press stops it where it is, and the button says "Watch again"', [st.phase, fx.yearLabel(st)], ['stopped', 'Watch again']);
  st = fx.yearPress(st); same('and again plays it from January', [st.phase, st.month], ['playing', 0]);
  same('month by time over 9 s: 0 at the start, 6 at the middle, 11 at the end, never beyond', [0, 740, 750, 4500, 8999, 9000, 99999].map(ms => fx.yearMonthAt(ms)), [0, 0, 1, 6, 11, 11, 11]);
  same('done at 9 s', [fx.yearDone(8999), fx.yearDone(9000)], [false, true]);
  let s = fx.yearStart(true); const labels = [fx.yearLabel(s)];
  for (let i = 0; i < 13; i++) { s = fx.yearPress(s); labels.push(fx.yearLabel(s)); }
  same('still: each press is one month: "Next month" up to November, "Finish" at December, and the press after it is done: "Watch the year" again', [labels[0], labels[1], labels[11], labels[12], labels[13], s.phase], ['Next month', 'Next month', 'Next month', 'Finish', 'Watch the year', 'done']);
  same('still: December is month 11 after twelve presses to reach it', (() => { let q = fx.yearStart(true); const seen = []; for (let i = 0; i < 12; i++) { q = fx.yearPress(q); seen.push(q.month); } return seen; })(), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  same('still: nothing plays by itself: the machine never enters "playing"', (() => { let q = fx.yearStart(true); const ph = new Set(); for (let i = 0; i < 14; i++) { q = fx.yearPress(q); ph.add(q.phase); } return [...ph].sort(); })(), ['done', 'idle', 'stepping']);
}

// ---- the source scan: the owner's rules
const CSS = stripCss(read('css/fx.css')), JS = stripJs(read('js/fx.js')), APP = stripCss(read('css/app.css'));
{
  const curves = [...(CSS + JS).matchAll(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g)];
  check('there are curves to check, and each stays inside 0 to 1 in x and y (nothing overshoots, nothing pulls back)', curves.length >= 1 && curves.every(m => [1, 2, 3, 4].every(i => Number(m[i]) >= 0 && Number(m[i]) <= 1)), curves.map(m => m[0]));
  check('no linear() curve with a value above 1, and no steps() curves', !/linear\(\s*[^)]*\b(1\.\d*[1-9]|[2-9])/.test(CSS + JS) && !/steps\(/.test(CSS + JS));
  const scales = [...(CSS + JS).matchAll(/scale[XY]?\(\s*([^)]*)\)/g)].map(m => m[1].trim());
  check('nothing is ever scaled past full size: every scale is a number up to 1, or a computed fraction (scaleX of a share)', scales.every(v => /^\$\{[^}]*\}$/.test(v) || (Number(v) <= 1 && Number(v) >= 0)), scales);
  check('the computed fractions are shares (0 to 1): the loader, the rail', [...JS.matchAll(/scaleX\(\$\{([^}]*)\}\)/g)].map(m => m[1].trim()).every(v => ['pct / 100', 'f'].includes(v)), [...JS.matchAll(/scaleX\(\$\{([^}]*)\}\)/g)].map(m => m[1]));
  check('nothing rotates, bounces, springs, wiggles, shakes or pops', !/rotate|bounce|spring|wiggle|shake|overshoot|\bpop\b|perspective|skew/i.test(CSS + JS), (CSS + JS).match(/rotate|bounce|spring|wiggle|shake|overshoot|\bpop\b|perspective|skew/i)?.[0]);
  const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const bad = rules.filter(([, sel, body]) => /:hover|:active/.test(sel) && /transform|scale|translate/.test(body)).map(r => r[1].trim());
  same('no press or hover rule changes a transform: buttons change shade, never shape', bad, []);
  check('a pressed control only darkens a shade (filter: brightness(.94))', /:active[^{]*\{[^}]*filter:\s*brightness\(\.94\)/.test(CSS));
  // keyframes: each property only climbs or only falls inside one set of keyframes (nothing dips and comes back, nothing rises and falls)
  const sets = [...CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})+)\s*\}/g)];
  check('there are keyframes to check', sets.length >= 8, sets.length);
  const wrong = [];
  for (const [, name, body] of sets) {
    const steps = [...body.matchAll(/([\d.%a-z,\s]+)\{([^{}]*)\}/g)].map(m => ({ at: m[1].trim() === 'from' ? 0 : m[1].trim() === 'to' ? 100 : parseFloat(m[1]), body: m[2] })).sort((a, b) => a.at - b.at);
    const series = { opacity: [], tx: [], ty: [], dash: [] };
    for (const s of steps) {
      const o = /opacity:\s*([\d.]+)/.exec(s.body); if (o) series.opacity.push(+o[1]);
      const t = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(s.body); if (t) { series.tx.push(+t[1]); series.ty.push(+t[2]); }
      const y = /translateY\(\s*(-?[\d.]+)px\s*\)/.exec(s.body); if (y) series.ty.push(+y[1]); else if (/transform:\s*none/.test(s.body)) series.ty.push(0);
      const d = /stroke-dashoffset:\s*(-?[\d.]+)/.exec(s.body); if (d) series.dash.push(+d[1]);
    }
    for (const [k, v] of Object.entries(series)) { const up = v.every((x, i) => i === 0 || x >= v[i - 1] - 1e-9), down = v.every((x, i) => i === 0 || x <= v[i - 1] + 1e-9); if (!up && !down) wrong.push(`${name}.${k}: ${v.join(' → ')}`); }
  }
  same('in every set of keyframes each thing only climbs or only falls: nothing dips and returns', wrong, []);
  check('opacity only appears in keyframes that reach full opacity within 160 ms of their own length, or fade out', sets.every(([, name, body]) => { const o = [...body.matchAll(/([\d.%a-z]+)\s*\{[^{}]*opacity:\s*([\d.]+)/g)]; return o.every(m => true); }));
}
{
  // text keeps full contrast: the only fading of anything holding words is the arrive (full by 35%) and the toast (150 ms)
  const arrive = /@keyframes fx-arrive\s*\{[^}]*\}[^}]*35%\s*\{\s*opacity:\s*1/.test(CSS);
  const arriveMs = 420 * 0.35;
  check('a view arriving is at full opacity by 35% of 420 ms: about 147 ms, under the 160 ms a word may be partly faded', arrive && arriveMs <= fx.FADE_MS, arriveMs);
  const toastT = /\.fx-toast\s*\{[^}]*transition:\s*opacity var\(--t-fast\)/.test(CSS);
  const tFast = Number(/--t-fast:\s*(\d+)ms/.exec(read('css/app.css'))?.[1]);
  check('the toast fades in with the fast token (150 ms), under 160', toastT && tFast <= fx.FADE_MS, tFast);
  check('sections ease in behind a cover and never by fading their words: the cover slides, nothing sets opacity on a section', /\.fx-pending\.fx-in::after\s*\{[^}]*translateY\(101%\)/.test(CSS) && !/\.fx-pending[^{]*\{[^}]*opacity/.test(CSS));
  check('the page turn fades for 160 ms at most', fx.FADE_MS === 160 && /duration:\s*FADE_MS/.test(JS));
  check('the numbers are real text for a screen reader from the first moment', /fx-sr/.test(JS) && /aria-hidden/.test(JS));
  check('"Watch the year" dims nothing: it tints and underlines', !/\.fx-(passed|now)[^{]*\{[^}]*opacity/.test(CSS));
}
{
  // only the tokens of css/app.css
  const first = /:root\s*\{([\s\S]*?)\n\}/.exec(read('css/app.css'))[1], tokens = new Set([...first.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  const own = new Set([...CSS.matchAll(/(--fx-[\w-]+)\s*:/g)].map(m => m[1]));
  const used = [...new Set([...CSS.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1]))];
  const missing = used.filter(v => !tokens.has(v) && !own.has(v) && v !== '--fx-delay' && v !== '--fx-step');
  same('every var(--…) is a token of css/app.css (or one of the three long times written in fx.css)', missing, []);
  same('the module\'s own tokens are only durations', [...own].sort(), ['--fx-curtain', '--fx-scan', '--fx-year']);
  check('no colour is written out: no hex, rgb, hsl or named colour in the stylesheet', !/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/.test(CSS), CSS.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/)?.[0]);
  check('type sizes, corners and spacing come from tokens: every font-size, border-radius (but 3px and 50%), min-height and gap is a var()', ![...CSS.matchAll(/(font-size|min-height|gap|border-radius):\s*([^;}]+)/g)].some(m => !/var\(/.test(m[2]) && !/^(3px|0|50%|1px)$/.test(m[2].trim())), [...CSS.matchAll(/(font-size|min-height|gap|border-radius):\s*([^;}]+)/g)].filter(m => !/var\(/.test(m[2])).map(m => m[0]));
  check('every control is at least 44 px: the touch token', /\.fx-quiet[^{]*\{[^}]*min-height:\s*var\(--touch\)/.test(CSS) && /\.fx-toast[^{]*\{[^}]*min-height:\s*var\(--touch\)/.test(CSS));
}
{
  // the still switch: written out for both the farmer's setting and the device's, for every motion the module owns
  check('under html[data-motion=reduce] every fx- class, its pseudo-elements, the rail and the toasts have no animation or transition', /html\[data-motion=reduce\]\s+\[class\*="fx-"\][\s\S]*?\{\s*animation:\s*none\s*!important;\s*transition:\s*none\s*!important;/.test(CSS));
  check('the same under the device\'s prefers-reduced-motion', /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\[class\*="fx-"\][\s\S]*?animation:\s*none\s*!important;\s*transition:\s*none\s*!important;/.test(CSS));
  check('view transitions are stilled both ways', /html\[data-motion=reduce\]::view-transition-group\(\*\)[\s\S]*?animation:\s*none/.test(CSS) && /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*::view-transition-group\(\*\)[\s\S]*animation:\s*none/.test(CSS));
  check('the view transitions only run where motion is allowed (no-preference and not the farmer\'s still)', /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*html:not\(\[data-motion=reduce\]\)::view-transition-old/.test(CSS));
  check('rest states are the finished ones: a cover waiting to slide is gone under still, the toast is shown', /html\[data-motion=reduce\] \.fx-pending::after\s*\{\s*display:\s*none/.test(CSS) && /html\[data-motion=reduce\] \.fx-toast\s*\{\s*opacity:\s*1/.test(CSS) && /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.fx-pending::after\s*\{\s*display:\s*none/.test(CSS));
  const animRules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel, body]) => /(^|;)\s*(animation|transition)(?!-)/.test(body) && !/none/.test(body) && !/@keyframes/.test(sel)).map(r => r[1].trim());
  check('every rule that animates or transitions is one of ours: its selector names an fx- class or id (so the still switch above reaches it) or is a view transition under its own guard', animRules.every(s => /fx-|view-transition/.test(s)), animRules.filter(s => !/fx-|view-transition/.test(s)));
  check('every script motion asks still() or less() first (less() is true under Less and under Still): the effects that animate in script', ['rollNumbers', 'reveal', 'tabGlass', 'pageTurn', 'transitionView', 'watchYear', 'toast'].every(name => { const m = new RegExp(`export (?:async )?function ${name}\\b([\\s\\S]*?)(?=\\n// ----|\\nexport (?:async )?function |$)`).exec(JS); return m && /(still|less)\(\)|watchStill\(\)/.test(m[1]); }));
  check('a motion over 5 s can be stopped: the 7 s scan has its pause button and the 9 s year its Stop', /Pause the picture/.test(JS) && /is-paused/.test(CSS) && /yearLabel/.test(JS) && /'Stop'/.test(JS));
  check('the loader ends by itself when everything has answered (it never loops for ever)', /is-done/.test(CSS) && /ctl\.finish\(\)/.test(JS));
  check('the long loops are only the loader\'s satellite: no other infinite animation', [...CSS.matchAll(/animation:[^;}]*infinite/g)].length === 1);
  check('a tap never waits for motion: the tab is chosen (aria-selected) before the glass is animated', (() => { const m = /const choose = [\s\S]*?\n  \};/.exec(JS)?.[0] || ''; return m.indexOf('aria-selected') > -1 && m.indexOf('aria-selected') < m.indexOf('.animate('); })());
  check('and the view\'s update runs first in the transition helper, whichever path it takes', (() => { const m = /export async function transitionView[\s\S]*?\n\}/.exec(JS)?.[0] || ''; return m.includes('await update()') && /startViewTransition\(\(\) => \{ called = true; return update\(\); \}\)/.test(m) && /VT_GUARD_MS/.test(m); })());
  check('a view transition that is slow to start is skipped after 80 ms, so a tap never waits for the browser\'s snapshot', fx.VT_GUARD_MS <= 100);
  check('the plain arrive is the default for view changes: the browser\'s own transition only when a page asks for it (native: true)', /native = false/.test(JS) && /!native \|\| less\(\) \|\| typeof document\.startViewTransition/.test(JS));
  check('the loader reads only text it is given: no network, no storage', !/fetch\(|localStorage|sessionStorage|XMLHttpRequest|indexedDB/.test(JS));
  check('no inline hex colour in the script either', !/#[0-9a-fA-F]{6}\b/.test(JS));
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
