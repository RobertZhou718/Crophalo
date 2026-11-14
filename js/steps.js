// What each setup step needs before the farmer may go on, and which steps a field has.
// Pure: no page, no storage, no network.
// Checked by scripts/test_wizard.mjs.
import { STEPS, WORDS } from './words.m3.js';
import { PRESETS } from './crops.js';
import { checkSerialized } from './state.js';

export const hasRotation = s => !!(s.rotation.garden || (s.rotation.preset && s.rotation.preset !== 'custom') || (s.rotation.preset === 'custom' && s.rotation.custom.length));
export const hasSoil = s => s.soil.mode === 'assumed' || (s.soil.mode === 'manual' && !!s.soil.texture && !!s.soil.om);
export const isGarden = s => !!s.rotation.garden;
export const stepsFor = s => STEPS.filter(step => !(step.id === 'matters' && isGarden(s)));   // a tree or bush garden has nothing to rank
export function needFor(id, s) { return id === 'crops' ? (hasRotation(s) ? '' : WORDS.cropsNeed) : id === 'soil' ? (hasSoil(s) ? '' : WORDS.soilNeed) : ''; }
export const canGo = (id, s) => !needFor(id, s);
export const rotationSlots = s => s.rotation.garden ? [] : s.rotation.preset === 'custom' ? s.rotation.custom : (PRESETS[s.rotation.preset]?.slots ?? []);

// The answers a demo region comes with: its rotation, how it gets water and an assumed soil. Cleaned through the same whitelist as a shared link,
// so a broken region file can never put an impossible answer into the state.
export function readyAnswers(base, region) {
  const asked = { ...base, loc: base.loc ?? { lat: 0, lon: 0 }, rotation: { preset: region.rotation ?? null, custom: [], garden: null, second: {} }, farm: { ...base.farm, irrigation: region.defaults?.irrigation ?? null },
    soil: region.defaults?.soil === 'assumed' ? { mode: 'assumed', texture: null, om: null, omPct: null } : base.soil };
  const checked = checkSerialized(asked);
  if (!checked.ok) return {};
  const { rotation, farm, soil } = checked.state;
  return { rotation, farm, soil, touched: { rotation: true, farm: true } };
}
export const isReady = s => hasRotation(s) && hasSoil(s) && !!s.farm.irrigation;
