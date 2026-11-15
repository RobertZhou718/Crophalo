// Crophalo's offline suite for the pure parts of the page turns: which way a tab, a setup step or a screen moves, and which screen changes get the generic cross-fade. No page, no clock.
// RULE: never loosen a check here without a written reason beside it. Run: node scripts/test_macro_turn.mjs
import { directionIn, stepDirection, genericTurn } from '../js/turn-plan.js';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

const TABS = ['options', 'weather', 'satellites', 'field', 'calendar'];
same('a tab later in the list turns forward, an earlier one back', [directionIn(TABS, 'options', 'weather'), directionIn(TABS, 'calendar', 'options'), directionIn(TABS, 'weather', 'field')], ['forward', 'back', 'forward']);
same('the same tab, or a tab that is not in the list, does not turn', [directionIn(TABS, 'field', 'field'), directionIn(TABS, 'nope', 'field'), directionIn(TABS, 'field', undefined)], ['none', 'none', 'none']);
same('setup steps: on is forward, back is back, the same or rubbish is none', [stepDirection(0, 1), stepDirection(3, 2), stepDirection(2, 2), stepDirection(NaN, 1), stepDirection(undefined, 1)], ['forward', 'back', 'none', 'none', 'none']);
check('the calm screens get the generic turn: to or from Home, Data, Privacy, Limitations, Settings and the status page', genericTurn({ from: 'report', to: 'home' }) && genericTurn({ from: 'home', to: 'info', page: 'data' }) && genericTurn({ from: 'info', to: 'info', page: 'privacy', wasPage: 'data' }) && genericTurn({ from: 'info', to: 'report' }) && genericTurn({ from: 'home', to: 'admin' }));
check('the report, setup and My farm keep their own scenes: no generic turn between them', !genericTurn({ from: 'setup', to: 'report' }) && !genericTurn({ from: 'report', to: 'farm' }) && !genericTurn({ from: 'farm', to: 'setup' }));
check('the first screen of a visit and the same screen again do not turn', !genericTurn({ from: undefined, to: 'home' }) && !genericTurn({ from: 'info', to: 'info', page: 'data', wasPage: 'data' }) && !genericTurn(null) && !genericTurn({}));

console.log(`macro turn: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
