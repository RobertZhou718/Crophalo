// STEP TURN (plan part 3.3): between the setup's steps the column's content leaves 16 px to the left and fades, and the new step enters 16 px from the right in 320 ms (back reverses it); the map never moves.
// Focus goes to the step's heading as it always did, because the update is the step's own drawing. Less: a 160 ms cross-fade. Still: today's swap. A press or key lands on the new step complete.
// Goes through hooks.step (js/hooks.js, called from js/wizard.js go()). With this file absent the steps simply change. Checked by scripts/test_macro_turn.mjs and scripts/e2e_macro_turn.mjs.
import { setHook } from './hooks.js';
import { become } from './macro-view.js';
import { stepDirection } from './turn-plan.js';

const doc = () => globalThis.document;
const href = new URL('../css/macro-turn.css', import.meta.url).href;
if (doc() && !doc().querySelector(`link[rel=stylesheet][href="${href}"]`)) { const link = doc().createElement('link'); link.rel = 'stylesheet'; link.href = href; doc().head.append(link); }

function register() {
  setHook('step', (update, info = {}) => {
    const col = doc()?.getElementById?.('setupPanel'), dir = stepDirection(info.from, info.to);
    if (!col || dir === 'none') return false;
    become(update, { names: { stepcol: col }, types: [dir], scene: 'step-turn' });
    return true;
  });
}
register();   // the work is done when the module is imported
