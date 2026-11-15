// The land history for a farm's field: the replay of each crop of the plan on the field's own recorded weather (Fine, Close call, Hurt per year), handed to the history page.
// Pure: cropsFor() works from the plan, the daily record and the crop tables given to it. openFarmHistory() loads the history page when it is asked for and fills it.
// Checked by scripts/test_sim.mjs (the crops card's counts on the recorded weather) and scripts/e2e_farm.mjs (the History tab).
import * as S from './simulate.js';

export const BASIS_TEXT = 'Each crop is played on every weather year in the record, using Crophalo\'s own rules for frost, heat and water. A season counts in the year it is harvested. These are counts of real years, never a chance. Past weather for this crop, not a forecast and not a value of the land.';   // with the record\'s name in front: four sentences, the owner\'s limit
export const RULES = Object.freeze([
  'Frost on young plants: from day 7 to the end of the first stage, a night under 0 \u00b0C is a close call and -2 \u00b0C or colder is hurt (corn: only -2 \u00b0C in its first 30 days).',
  'Frost at flowering for a frost-tender crop: a night under 0 \u00b0C is hurt. Frost before the crop is ripe: under 0 \u00b0C is a close call, -2 \u00b0C or colder is hurt.',
  'Winter cereals: -4 \u00b0C in the 40 to 10 days before flowering, or -2 \u00b0C through flowering, is hurt. Flowering is the crop table\'s own day (early to mid June in southern Ontario). Winter survival is not judged: it needs snow cover, which this record does not have.',
  'Heat at flowering: 3 or more days at the crop\'s heat line plus 2 \u00b0C, and at least 3 more than the usual year here, is hurt.',
  'Water: 0.8 of the season\'s rain plus the water the soil holds plus any watering, against what the crop needs. Under 60% (45% with watering) is hurt. Under 75% and 10 points below the usual year is a close call.',
  'A very wet season is a close call only for crops that have a sourced wettest-season limit; for the others it is not judged.',
  'Something that happens in more than half of the years here is the normal climate of the place: said once, not counted year by year.',
  'Known limits: the dry line can miss the worst dry years (a farm adviser should check it), and the heat rule rarely fires on a weather square about 50 km wide, where hot days are local.',
]);
const CHRONIC_WORDS = { 'frost-young': 'Frost on young plants', 'frost-flowering': 'Frost at flowering', 'frost-ripening': 'Frost before the crop is ripe', 'frost-winter': 'A hard frost before flowering', 'heat-flowering': 'Heat at flowering', dry: 'A dry season', wet: 'A very wet season' };
// deps: { cropOf(id) -> the crop table's row, cropName(id, short), holdOf(texture) -> mm the soil holds, irrigationMm(level) -> mm }
// The series should be the field's own: moved to the field's height when it is 100 m or more off the weather cell (data.js fitHeight), by the caller.
export function cropsFor(farm, field, series, deps) {
  if (!series || !Array.isArray(series.days) || !series.days.length) return { ok: false, reason: 'The weather record of this field could not be read, so no year is judged here.' };
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
    const res = S.judgeCrop(season, series, { id: season.crop, ...row, fl: deps.floweringOf ? deps.floweringOf(season.crop) : undefined }, ctx, years), notes = [...new Set(res.years.flatMap(y => y.notes))];
    const chronic = res.chronic.map(k => `${CHRONIC_WORDS[k] || k} happens in most years here. It is the normal climate of the place, not bad luck in one year.`);   // said once, in full
    const rejected = plan.flag === 'fails';   // the History page says it in its own words
    const winterOnly = notes.some(x => /^Winter survival is not judged/.test(x));   // a winter crop's counts are the spring weather only
    rows.push({ field: field.name, crop: deps.cropName(season.crop, true), season: { sow: season.sow, harvest: season.harvest, stages: season.stages || null }, counts: res.counts, rejected, scope: winterOnly ? 'Spring weather only: winter survival is not judged.' : '', chronic, notes,
      years: res.years.map(y => ({ year: y.year, label: S.seasonLabel2(season, y.year), verdict: y.verdict, why: y.causes.map(c => ({ text: c.text, date: c.date })) })) });
  });
  const through = String(series.through || series.days.at(-1)).replace(/-/g, ''), fullLast = through.slice(4) === '1231' ? last : last - 1;   // the years the record holds complete
  const record = { name: series.source === 'era5' ? 'the Open-Meteo ERA5 back-up record' : 'NASA POWER', first, last: fullLast };   // one record for the whole field, never two mixed
  const basis = `Counts on ${record.name} weather, ${first}\u2013${fullLast}. ${BASIS_TEXT}`;
  return rows.length ? { ok: true, basis, record, rules: RULES, rows } : { ok: false, reason: 'None of the crops in this field\'s plan is in the crop table, so no year is judged here.' };
}
