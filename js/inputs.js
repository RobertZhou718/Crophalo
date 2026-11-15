// What else the farmer told step 4: goals (state.goals, a small list of keys) and limits (state.limits), the clean-up every saved or
// shared copy passes, and the weights a goal moves. The report engine reads the same two fields itself (js/compare.js inputsOf and withLimits).
// Pure: no page, no storage, no network. Checked by scripts/test_state.mjs (clean-up, old states) and scripts/test_wizard.mjs (weights, the keys the engine reads).
import { CROPS } from './crops.js';

export const GOAL_KEYS = Object.freeze(['forage', 'nitrogen', 'market']);   // the same keys as js/compare.js GOAL_KEYS (test_wizard checks it)
export const SELL_KEYS = Object.freeze(['grain', 'feed', 'veg']);
export const newLimits = () => ({ noDrill: false, sell: [] });   // safe defaults: no limit at all
const POOL = ['grain', 'legume', 'oil', 'fibre'];   // the crop groups the engine may put into a new plan (js/engine.js POOL_GROUPS)

const keysOf = (list, allowed) => Array.isArray(list) ? allowed.filter(k => list.includes(k)) : [];   // known keys only, in a fixed order, once each
// Goals: known keys only. An old state without goals takes "Feed for my animals" from its "I keep animals" answer.
export function cleanGoals(raw, livestock = false) {
  const goals = keysOf(raw, GOAL_KEYS);
  return livestock === true && !goals.includes('forage') ? keysOf([...goals, 'forage'], GOAL_KEYS) : goals;
}
export function cleanLimits(raw) {
  const given = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { noDrill: given.noDrill === true, sell: keysOf(given.sell, SELL_KEYS) };
}

// The weights after the goals: "Less fertiliser to buy" moves Soil health one step up (at most 5). base is the chosen picture's set.
export function weightsFor(base, goals = []) {
  const w = Array.isArray(base) && base.length === 5 ? [...base] : [3, 3, 3, 3, 3];
  if (goals.includes('nitrogen')) w[1] = Math.min(5, w[1] + 1);
  return w;
}
// The weights when one goal is ticked or unticked after the farmer moved the weights by hand (no picture chosen).
export function nudge(prio, key, on) {
  const w = [...prio];
  if (key === 'nitrogen') w[1] = Math.max(0, Math.min(5, w[1] + (on ? 1 : -1)));
  return w;
}

// The crops a new plan may hold: the cash crops of the groups above and the hay crops. "Crops I will not grow" offers these.
export const proposable = () => Object.keys(CROPS).filter(id => (CROPS[id].type === 'cash' && POOL.includes(CROPS[id].group)) || CROPS[id].type === 'forage');
