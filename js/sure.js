// The weather behind every answer is a 50 km grid (NASA POWER), which can be a couple of degrees or a fifth of the rain off for
// one field. A crop is called a sure fit ("Holds up") only if it still passes when the weather is colder, hotter, drier and wetter
// than the data says; one that passes only on the exact numbers "Only just suits". This is a stress test, not new data.
// Pure: no page, no storage, no network, no clock. Checked by scripts/test_engine.mjs.
import { THR, hotDaysAt } from './climate.js';
import { feasible, gardenFit } from './fit.js';

const fin = Number.isFinite;
export const DT = 2, DP = 0.2, DFF = 12;   // °C, a fifth of the rain, frost-free days per 2 °C
export const VARIANT_WORDS = Object.freeze({ data: 'the NASA weather as read', colder: '2 °C colder', hotter: '2 °C hotter', drier: 'a fifth drier', wetter: 'a fifth wetter', era5: 'the colder second record of winter nights' });
export const FLAG_WORDS = Object.freeze({ fails: "Doesn't suit here", borderline: 'Only just suits', holds: 'Holds up' });

// One climate moved by dT °C and with its rain times f. Every heat threshold moves with the weather (a day at 33 °C becomes a day
// at 35 °C when 2 °C hotter), the frost dates move by DFF/2 days each way (not where frost is already rare), the cold nights by dT.
export function shifted(C, dT = 0, f = 1, name = 'data') {
  const M = C.monthly, add = list => list.map(v => v + dT), rare = !!C.frostFreeClimate, half = rare ? 0 : DFF / 2 * Math.sign(dT);
  const at = limit => hotDaysAt(C, Math.max(THR[0], Math.min(THR.at(-1), limit)), 'between');   // past the buckets: the nearest bucket
  const heatByMonth = dT === 0 ? M.heatByMonth : THR.map(line => at(line - dT));
  return {
    ...C, variant: name,
    monthly: { ...M, tmax: add(M.tmax), tmin: add(M.tmin), tmean: add(M.tmean), P: M.P.map(v => v * f), heatByMonth },
    med: { ...C.med, P: C.med.P * f, gsRain: C.med.gsRain * f, T: C.med.T + dT, frostLast: C.med.frostLast - half, frostFirst: C.med.frostFirst + half, frostFree: rare ? C.med.frostFree : Math.min(365, C.med.frostFree + 2 * half) },
    yearly: C.yearly && { ...C.yearly, frostLast: C.yearly.frostLast.map(v => v - half), frostFirst: C.yearly.frostFirst.map(v => v + half) },
    coldNight: C.coldNight + dT, coldNight10: C.coldNight10 + dT, coldLow: C.coldLow + dT, coldLow10: C.coldLow10 + dT,
  };
}
const MEMO = new WeakMap();
// The five variants: the data; 2 °C colder; 2 °C hotter; rain × 0.8; rain × 1.2. No combined variants.
export function scenarios(C) {
  if (!C || !C.monthly) return [];
  if (MEMO.has(C)) return MEMO.get(C);
  const list = [{ ...C, variant: 'data' }, shifted(C, -DT, 1, 'colder'), shifted(C, DT, 1, 'hotter'), shifted(C, 0, 1 - DP, 'drier'), shifted(C, 0, 1 + DP, 'wetter')];
  MEMO.set(C, list);
  return list;
}

// A field crop is sure when it passes the gates in all five variants. Each variant has its own sowing timing.
export function sureField(id, C, ctx = {}) {
  const base = feasible(id, C, ctx);
  if (!base.ok) return { ok: false, sure: false, flag: 'fails', fails: ['data'], base };
  const fails = scenarios(C).slice(1).filter(V => !feasible(id, V, { ...ctx, tm: undefined }).ok).map(V => V.variant);
  return { ok: true, sure: fails.length === 0, flag: fails.length ? 'borderline' : 'holds', fails, base };
}

// A tree must keep a score of −1 or more (the "shown" line) in every variant, or 1 or more when watered. When a second cold record
// (ERA5-Land) is more than 0.5 °C colder than the figure in use, one more variant runs on it: a tree that fails only there is
// borderline, never ruled out.
export function sureTree(id, C, ctx = {}) {
  const line = ctx.irrigation === 'full' || ctx.irrigation === 'limited' ? 1 : -1, score = gardenFit(id, C, ctx);
  const variants = [...scenarios(C).slice(1)];
  if (fin(C?.coldLow) && fin(C?.coldNight) && C.coldNight - C.coldLow > 0.5) variants.push({ ...C, variant: 'era5', coldNight: C.coldLow, coldNight10: fin(C.coldLow10) ? C.coldLow10 : C.coldNight10 });
  const fails = variants.filter(V => gardenFit(id, V, ctx) < line).map(V => V.variant);
  const shown = score >= -1, sure = shown && score >= line && fails.length === 0;
  return { score, shown, sure, flag: !shown ? 'fails' : sure ? 'holds' : 'borderline', fails };
}
