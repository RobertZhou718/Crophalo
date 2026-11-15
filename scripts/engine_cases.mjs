// The engine's inputs for the Oxford and Barrie demo fields, built from recorded answers (no network), shared by scripts/test_engine_worker.mjs and scripts/e2e_engine_worker.mjs.
// cases() gives [{ name, args: [state, climate, spot, opts] }]; the climates are the real NASA POWER records turned into the engine's own climate object.
import fs from 'node:fs';
import * as N from '../js/nearby.js';
import { oxford, barrie, TODAY } from './hand_climates.mjs';

export { TODAY };
export const stateOf = (more = {}) => ({
  rotation: { preset: 'corn-soy', custom: [], garden: null, second: {} },
  farm: { irrigation: 'none', tillage: 'reduced', livestock: false, coverOK: true, labor: false },
  soil: { mode: 'assumed', texture: null, om: null, omPct: null }, soilTest: null, avoid: [], prio: [3, 3, 3, 3, 3], ...more,
});
export function cases() {
  const OX = oxford(), BA = barrie();
  const OXA = JSON.parse(fs.readFileSync(new URL('./fixtures/oxford_cropsnear.json', import.meta.url), 'utf8'));
  const BAA = JSON.parse(fs.readFileSync(new URL('./fixtures/barrie_cropsnear.json', import.meta.url), 'utf8'));
  const oxSpot = { lat: 43.13, lon: -80.75, country: 'CA', elev: OX.field, ...N.spotFields(OXA) };
  const baSpot = { lat: 44.4, lon: -79.78, country: 'CA', ...N.spotFields(BAA) };
  const opts = { today: TODAY };
  return [
    { name: 'Oxford, equal priorities', args: [stateOf(), OX.C, oxSpot, opts] },
    { name: 'Oxford, keep the soil covered', args: [stateOf({ prio: [2, 4, 5, 2, 3] }), OX.C, oxSpot, opts] },
    { name: 'Barrie, equal priorities', args: [stateOf(), BA.C, baSpot, opts] },
    { name: 'Barrie, irrigated with livestock', args: [stateOf({ farm: { irrigation: 'full', tillage: 'notill', livestock: true, coverOK: true, labor: false } }), BA.C, baSpot, opts] },
    { name: 'Oxford, a custom rotation with odd names', args: [stateOf({ rotation: { preset: 'custom', custom: ['toString', '__proto__', 'corn', 'hasOwnProperty'], second: { 0: 'constructor' } }, avoid: ['valueOf'] }), OX.C, oxSpot, opts] },
    { name: 'no climate yet', args: [stateOf(), null, oxSpot, opts] },
    { name: 'no state at all', args: [null, OX.C, oxSpot, opts] },
  ];
}
