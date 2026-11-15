// The replaceable wrappers the screens call around a change of screen: hooks.view, report, tab, place, farmView and step. With no motion module loaded each one simply runs its update, so the app is exactly as it is without the big animations.
// Pure: no page, no storage, no timer. A motion module adds a wrapper with setHook(name, fn): fn(update, info) either takes the change (calls update once, now or inside a view transition, and answers true) or answers false and leaves it to the next.
// changes() counts the screen changes (one per outermost hook call), so the conductor can speak once per change. Checked by scripts/test_macro.mjs.
const NAMES = ['view', 'report', 'tab', 'place', 'farmView', 'step'];   // step: a move between the setup's steps
const wrappers = Object.fromEntries(NAMES.map(n => [n, []]));
let count = 0, depth = 0;   // a hook called from inside another hook's update (show() inside the place hook) is the same screen change

// The newest wrapper is asked first, so a module for one screen goes before the one for every screen. A wrapper that throws before it ran the update is passed over.
// An error of the update itself that comes back out of a wrapper is thrown on to the caller, exactly as it would be with no wrapper.
function dispatch(name, update, info) {
  if (!depth) count++;
  depth++;
  try {
    let ran = false, out, failed = null;
    const once = () => { if (!ran) { ran = true; try { out = update(); } catch (e) { failed = { e }; throw e; } } return out; };
    for (const fn of [...wrappers[name]].reverse()) {
      let took = false;
      try { took = !!fn(once, info); } catch (e) { if (failed && e === failed.e) throw e; took = false; }
      if (took || ran) return out;
    }
    return once();
  } finally { depth--; }
}

export const hooks = Object.freeze(Object.fromEntries(NAMES.map(n => [n, (update, info) => dispatch(n, update, info)])));

// How many screen changes have gone through the hooks since the page opened.
export const changes = () => count;

// Adds fn as a wrapper of one hook and answers the way to take it off again; setHook(name, null) takes every wrapper of that hook off. An unknown name is refused (false).
export function setHook(name, fn) {
  if (!NAMES.includes(name)) return false;
  if (fn === null) { wrappers[name].length = 0; return true; }
  if (typeof fn !== 'function') return false;
  wrappers[name].push(fn);
  return () => { const i = wrappers[name].indexOf(fn); if (i >= 0) wrappers[name].splice(i, 1); return i >= 0; };
}
