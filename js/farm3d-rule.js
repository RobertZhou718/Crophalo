// When My farm opens in 3D by itself, and what it says when it does not: a strong device opens in 3D the first time and the farmer's own choice is remembered; high contrast colours give the board with its sentence;
// the graphics memory taken back once gives "3D paused" and a way to try again, twice gives the board. Pure: the device's facts are handed in, the memory is a storage object handed in. Checked by scripts/test_farm3d.mjs and scripts/test_shade.mjs.
export const KEY = 'crophalo.farm3d.v1';
export const WORDS = Object.freeze({
  contrast: 'High contrast colours are on, so the board is shown.',
  lost: '3D paused. The device needed its graphics memory.',
  twice: 'The 3D view stopped twice, so the board is shown.',
  weak: 'This device is better with the board, so the board is shown. Press 3D to open the 3D view.',
  again: 'Try 3D again',
});
export const MAX_LOSSES = 2;
// device: { webgl (bool: a context could be made), memoryGB (0 or missing = not known), forcedColors (the system's high-contrast mode), highContrast (Crophalo's own High contrast setting),
//           software (a software renderer's name was read), caveat (the browser says the chip has a major performance problem) }
// -> { strong: bool, why: '' | 'no-webgl' | 'contrast' | 'memory' | 'software' | 'caveat' } : why is the first reason a device is not "strong", in the order a farmer would want it said
export function deviceRule(device = {}) {
  if (device.highContrast || device.forcedColors) return { strong: false, why: 'contrast' };
  if (!device.webgl) return { strong: false, why: 'no-webgl' };
  if (device.caveat) return { strong: false, why: 'caveat' };
  if (device.software) return { strong: false, why: 'software' };
  if (Number(device.memoryGB) > 0 && Number(device.memoryGB) <= 2) return { strong: false, why: 'memory' };
  return { strong: true, why: '' };
}
// What the farm opens on: 'board' or '3d', and the sentence to say when the board comes by itself. remembered: what the farmer chose last ('3d', 'board' or nothing).
// High contrast always gives the board. A remembered choice stands where the device allows it; with none, a strong device opens in 3D and the first open is remembered only when the farmer keeps it (pressing a button), never by this rule.
export function firstView(device, remembered) {
  const rule = deviceRule(device);
  if (rule.why === 'contrast') return { view: 'board', say: WORDS.contrast, auto: true };
  if (remembered === 'board') return { view: 'board', say: '', auto: false };
  if (remembered === '3d') return rule.strong || rule.why === 'memory' ? { view: '3d', say: '', auto: false } : { view: 'board', say: WORDS.weak, auto: true };
  return rule.strong ? { view: '3d', say: '', auto: true } : { view: 'board', say: rule.why === 'no-webgl' ? '' : WORDS.weak, auto: true };
}
// The farmer's own press of 3D or Map is remembered; what the rule or a fallback does is never written.
export const remember = (storage, mode) => { try { storage?.setItem(KEY, mode === '3d' ? '3d' : 'board'); } catch { /* a device that keeps nothing */ } };
export const recall = storage => { try { const v = storage?.getItem(KEY); return v === '3d' || v === 'board' ? v : null; } catch { return null; } };
// Graphics memory taken back: the first time the view says so and offers to try again; the second time the board is shown.
export const lossStep = count => (count >= MAX_LOSSES ? { action: 'board', say: WORDS.twice } : { action: 'pause', say: WORDS.lost, again: WORDS.again });
