// The land history for a farm's field: the replay of each crop of the plan on the field's own recorded weather (Fine, Close call, Hurt per year), handed to the history page.
// Pure: cropsFor() works from the plan, the daily record and the crop tables given to it. openFarmHistory() loads the history page when it is asked for and fills it.
// Checked by scripts/test_sim.mjs (the crops card's counts on the recorded weather) and scripts/e2e_farm.mjs (the History tab).
import * as S from './simulate.js';

export const BASIS = 'Each crop is played on the NASA weather of every year in the record, with Crophalo\'s own rules (frost, heat at flowering, water). A season is counted in the year of its harvest (written 2026\u201327 when it crosses New Year). These are counts of real years, never a chance and never a forecast. Crophalo\'s own rules on NASA weather. Past weather for this crop, not a forecast and not a value of the land.';
const CHRONIC_WORDS = { 'frost-young': 'Frost on young plants', 'frost-flowering': 'Frost at flowering', 'frost-ripening': 'Frost before the crop is ripe', 'frost-winter': 'A hard frost before flowering', 'heat-flowering': 'Heat at flowering', dry: 'A dry season', wet: 'A very wet season' };
// deps: { cropOf(id) -> the crop table's row, cropName(id, short), holdOf(texture) -> mm the soil holds, irrigationMm(level) -> mm }
// The series should be the field's own: moved to the field's height when it is 100 m or more off the weather cell (data.js fitHeight), by the caller.
export function cropsFor(farm, field, series, deps) {
  if (!series || !Array.isArray(series.days) || !series.days.length) return { ok: false, reason: 'The weather record of this field is not read yet, so no year is judged here.' };
  const plan = field?.report?.current;
  if (!plan?.seasons?.length) return { ok: false, reason: `${field?.name || 'This field'} has no crop plan with dates yet, so no year is judged here.` };
  const first = +series.days[0].slice(0, 4), last = +series.days.at(-1).slice(0, 4), years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const texture = (field.soil || farm.soil)?.texture ?? 'loam', irr = S.planOf(farm, field.id)?.water || farm.practice.irrigation, n = plan.seasons.length;
  const dayN = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5, seen = new Set(), rows = [];
  plan.seasons.forEach((season, i) => {
    if (seen.has(season.crop) || season.crop === 'fallow') return;
    seen.add(season.crop);
    const row = deps.cropOf(season.crop);
    if (!row) return;
    const next = plan.seasons[(i + 1) % n], prev = plan.seasons[(i + n - 1) % n];
    const gap = Math.round(dayN(next.sow) - dayN(season.harvest)) + (next === season ? 365 : 0), bareAfterDays = season.after === 'bare' || !(season.residue > 0) ? Math.max(0, Math.min(240, gap)) : 0;   // days the ground stands bare before the next sowing
    const ctx = { holdMm: deps.holdOf(texture), irrigationMm: deps.irrigationMm(irr), bareAfterDays, fallowBonusMm: prev.crop === 'fallow' ? 120 : 0 };   // the fallow bonus: the most the table allows, when a fallow year came before
    const res = S.judgeCrop(season, series, { id: season.crop, ...row }, ctx, years), notes = [...new Set(res.years.flatMap(y => y.notes))];
    for (const k of res.chronic) notes.unshift(`${CHRONIC_WORDS[k] || k} happens in most years here. It is the normal climate of the place, not bad luck in one year.`);
    const rejected = plan.flag === 'fails';
    if (rejected) notes.push('Crophalo\'s own crop check says this plan does not suit this place. A year judged fine here is not a sign it would work.');
    rows.push({ field: field.name, crop: deps.cropName(season.crop, true), counts: res.counts, rejected, chronic: res.chronic.map(k => CHRONIC_WORDS[k] || k), notes,
      years: res.years.map(y => ({ year: y.year, label: S.seasonLabel2(season, y.year), verdict: y.verdict, why: y.causes.map(c => ({ text: c.text, date: c.date })) })) });
  });
  return rows.length ? { ok: true, basis: BASIS, rows } : { ok: false, reason: 'None of the crops in this field\'s plan is in the crop table, so no year is judged here.' };
}
