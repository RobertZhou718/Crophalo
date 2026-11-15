// Crophalo's suite for the map's loading sign (js/mapbusy.js): the sign comes up within a tenth of a second of work starting, never flashes for work that ends sooner, stays while any part is still loading,
// does not flicker off and on, and lets go of a part that never ends. The clock is driven by hand. RULE: never loosen a check here without a written reason beside it. Run: node scripts/test_mapbusy.mjs
import { initBusy, SHOW_AFTER_MS, STAY_MS, LET_GO_MS, SLOW_AFTER_MS, WORDS } from '../js/mapbusy.js';
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${JSON.stringify(detail)})` : ''}`); } };
function rig() {
  let t = 0, n = 0; const timers = new Map(), word = { textContent: WORDS.loading }, el = { hidden: true, word, querySelector: s => (s === '[data-busytext]' ? word : null) };
  const clock = { now: () => t, later: (fn, ms) => { timers.set(++n, { at: t + ms, fn }); return n; }, cancel: id => timers.delete(id) };
  const go = ms => { const end = t + ms; for (;;) { const next = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; t = next[1].at; timers.delete(next[0]); next[1].fn(); } t = end; };
  return { el, go, b: initBusy(el, clock, null), timers };
}
check('the sign comes up within a tenth of a second', SHOW_AFTER_MS <= 100 && SHOW_AFTER_MS >= 50, SHOW_AFTER_MS);
{ const r = rig(); r.b.set('base', true); r.go(SHOW_AFTER_MS - 1); check('just before the tenth of a second it is still hidden', r.el.hidden === true); r.go(1); check('at the tenth of a second it shows', r.el.hidden === false);
  r.go(3000); check('it stays while the work goes on', r.el.hidden === false); r.b.set('base', false); r.go(1); check('and goes when the work is done', r.el.hidden === true); }
{ const r = rig(); r.b.set('base', true); r.go(40); r.b.set('base', false); r.go(1000); check('work over in 40 ms (a kept base) never shows the sign, not even for a moment', r.el.hidden === true && r.timers.size === 0, r.timers.size); }
{ const r = rig(); r.b.set('base', true); r.go(SHOW_AFTER_MS + 10); r.b.set('base', false); r.go(STAY_MS - 20); check('once shown it stays a moment, so it does not blink', r.el.hidden === false); r.go(30); check('then it goes', r.el.hidden === true); }
{ const r = rig(); r.b.set('base', true); r.b.set('layer-rain', true); r.go(200); r.b.set('base', false); r.go(500); check('two parts loading: the sign stays until both are done', r.el.hidden === false); r.b.set('layer-rain', false); r.go(STAY_MS + 1); check('and goes after the second', r.el.hidden === true); }
{ const r = rig(); r.b.set('a', true); r.go(200); r.b.set('a', false); r.go(100); r.b.set('b', true); r.go(STAY_MS); check('new work while it is about to go keeps it on without a blink', r.el.hidden === false); r.b.set('b', false); r.go(STAY_MS + 1); check('and it goes at the end', r.el.hidden === true); }
{ const r = rig(); r.b.set('stuck', true); r.go(LET_GO_MS - 1); check('a part that never ends keeps the sign for a while', r.el.hidden === false); r.go(STAY_MS + 5); check('and is let go after 20 seconds, so the sign never stays for ever', r.el.hidden === true && r.b.keys().length === 0); }
{ const r = rig(); r.b.set('x', false); r.go(500); check('an end with no start does nothing', r.el.hidden === true); r.b.set('x', true); r.b.set('x', true); r.go(150); r.b.set('x', false); r.go(STAY_MS + 1); check('a start said twice needs one end', r.el.hidden === true); }
{ const r = rig(); r.b.set('x', true); r.go(150); r.b.dispose(); check('taking the map away hides the sign and drops every timer', r.el.hidden === true && r.timers.size === 0); }
{ const r = rig(); r.b.set('x', true); r.go(SLOW_AFTER_MS - 100); check('the sign says Loading the map until 8 seconds have gone', r.el.word.textContent === WORDS.loading, r.el.word.textContent); r.go(200); check('after 8 seconds of work it says it is still loading', r.el.word.textContent === WORDS.slow && /^Still loading/.test(WORDS.slow), r.el.word.textContent); }
{ const r = rig(); r.b.set('x', true); r.go(500); r.b.set('x', false); r.go(1000); check('a request that fails and ends at once: the sign is gone within 1.5 seconds, still on its first words', r.el.hidden === true && r.el.word.textContent === WORDS.loading); }
{ const r = rig(); r.b.set('hang', true); r.go(LET_GO_MS); r.go(STAY_MS + 5); check('a request that hangs is let go at the limit', r.el.hidden === true); r.b.set('next', true); check('the next work starts with the first words', r.el.word.textContent === WORDS.loading); }
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
