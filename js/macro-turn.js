// THE CHAPTER TURN and THE GENERIC TURN (plan parts 3.8 and 3.17): a tab of the report turns like a page (the new panel comes 24 px from the side the farmer moved toward, the old one leaves the other way),
// and a change between the calm screens (Home, Data, Privacy, Limitations, Settings, the status page) is a 200 ms cross-fade. Both go through js/macro-view.js become(), so Less is a 160 ms cross-fade and Still is
// today's swap; a press or key ends a turn at once and leaves the new screen complete. Nothing is fetched inside the update. With this file absent the screens simply change, as they did.
// It does its work when it is imported (js/macro.js fetches it with the home) and adds its hooks with setHook. Checked by scripts/test_macro_turn.mjs and scripts/e2e_macro_turn.mjs.
import { setHook } from './hooks.js';
import { become } from './macro-view.js';
import { directionIn, genericTurn } from './turn-plan.js';

const doc = () => globalThis.document;
const href = new URL('../css/macro-turn.css', import.meta.url).href;
if (doc() && !doc().querySelector(`link[rel=stylesheet][href="${href}"]`)) { const link = doc().createElement('link'); link.rel = 'stylesheet'; link.href = href; doc().head.append(link); }

// the report's tabs in the order they are drawn
const tabIds = () => [...(doc()?.querySelectorAll?.('[role=tab][id^="tab-"]') ?? [])].map(t => t.id.slice(4));

function register() {
  setHook('tab', (update, info = {}) => {
    const main = doc()?.querySelector?.('.rv-main');
    const dir = directionIn(tabIds(), info.from, info.to);
    if (!main || dir === 'none') return false;                   // not a tab move: it simply happens
    become(update, { names: { panel: main }, types: [dir], scene: 'chapter-turn' });
    return true;
  });
  setHook('view', (update, info = {}) => {
    if (!genericTurn(info)) return false;
    become(update, { scene: 'turn' });                           // a root cross-fade; Less: 160 ms; Still: the swap
    return true;
  });
}
register();   // the work is done when the module is imported
