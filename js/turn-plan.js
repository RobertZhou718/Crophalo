// The directions of the page turns: which way a tab, a setup step or a screen moves, and which screen changes get the generic cross-fade.
// Pure: no page, no clock. Used by js/macro-turn.js and js/macro-setup.js; checked by scripts/test_macro_turn.mjs.
export const FIRST_VIEWS = Object.freeze(['home', 'setup', 'report', 'farm']);

// forward when the new one is later in the list, back when it is earlier, 'none' when it is the same or either is not in the list
export function directionIn(ids, from, to) {
  const a = ids.indexOf(from), b = ids.indexOf(to);
  return a < 0 || b < 0 || a === b ? 'none' : b > a ? 'forward' : 'back';
}
export const stepDirection = (from, to) => (Number.isFinite(from) && Number.isFinite(to) && from !== to ? (to > from ? 'forward' : 'back') : 'none');

// A change of screen gets the generic cross-fade only for the calm pages (Home, Data, Privacy, Limitations, Settings and the status page); the report, setup and My farm have their own scenes.
export function genericTurn(info = {}) {
  if (!info || info.to === undefined) return false;
  if (info.from === undefined) return false;                       // the first screen of a visit: nothing to turn from
  if (info.from === info.to && (info.page ?? '') === (info.wasPage ?? '')) return false;   // the same screen again
  return info.to === 'home' || info.to === 'info' || info.to === 'admin' || info.from === 'info' || info.from === 'admin';
}
