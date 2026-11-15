// One year on the map: each field of the farm in its verdict for one weather year, from the same replay the History page shows (judgeYears, in simulate.js, through cropsFor).
// Pure: it works from the crop replays handed to it and touches nothing. Checked by scripts/test_sim.mjs (the year list, the worst-of rule, the stages) and scripts/e2e_farm.mjs (the year bar).
import { seasonInYear } from './simulate.js';

export const RIBBON = 'Past weather, not a forecast';
export const TOKEN = Object.freeze({ fine: 'Fine', close: 'Close call', hurt: 'Hurt', none: 'Not judged' });
const JUDGED = ['fine', 'close', 'hurt'], RANK = { fine: 1, close: 2, hurt: 3 };
export const STAGE_NAMES = Object.freeze(['Starting up', 'Growing', 'Flowering and filling', 'Ripening']);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayWord = iso => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;
const dayN = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5, isoOf = n => new Date(n * 864e5).toISOString().slice(0, 10);
const tokenOf = verdict => (JUDGED.includes(verdict) ? verdict : 'none');
const NONE_WHY = { growing: 'The season was not over in the weather record.', nodata: 'The record is missing too many days of this season.', missing: 'This year is not in the weather record.' };

// fieldCrops: [{ id, name, crops }] where crops is cropsFor()'s answer for that field.
// The years worth showing, newest first: a year in which at least one field has a season that could be judged.
export function yearsIn(fieldCrops) {
  const set = new Set();
  for (const f of fieldCrops) for (const r of f.crops?.rows || []) for (const y of r.years) if (JUDGED.includes(y.verdict)) set.add(y.year);
  return [...set].sort((a, b) => b - a);
}
export const playOrder = years => [...years].sort((a, b) => a - b);   // oldest first
// The stages of one crop in one weather year: its own sowing and harvest days moved to that year, cut by the stage lengths the plan holds.
export function stagesOf(season, year) {
  if (!season?.sow || !season?.harvest || !Array.isArray(season.stages) || season.stages.length !== 4) return [];
  const s = seasonInYear(season, year), end = dayN(s.harvest);
  let from = dayN(s.sow);
  return season.stages.map((len, i) => {
    const to = i === 3 ? end : Math.min(end, from + len - 1), out = { name: STAGE_NAMES[i], from: isoOf(from), to: isoOf(Math.max(from, to)), text: `${STAGE_NAMES[i]}: ${dayWord(isoOf(from))} to ${dayWord(isoOf(Math.max(from, to)))}` };
    from = to + 1; return out;
  });
}
// One field in one year: the worst of its crops' verdicts (hurt over close over fine); not judged when no crop could be judged.
export function yearView(fieldCrops, year) {
  const fields = fieldCrops.map(f => {
    const crops = (f.crops?.rows || []).map(r => {
      const y = r.years.find(x => x.year === year), verdict = tokenOf(y?.verdict);
      return { crop: r.crop, label: y?.label || String(year), verdict, word: TOKEN[verdict], why: verdict === 'none' ? [NONE_WHY[y?.verdict] || NONE_WHY.missing] : (y.why || []).map(w => w.date ? `${w.text} (${w.date})` : w.text),
        stages: stagesOf(r.season, year), record: f.crops.record?.name || '' };
    });
    const judged = crops.filter(c => c.verdict !== 'none'), verdict = judged.length ? judged.reduce((a, c) => (RANK[c.verdict] > RANK[a] ? c.verdict : a), 'fine') : 'none';
    return { id: f.id, name: f.name, verdict, word: TOKEN[verdict], crops, reason: f.crops?.ok ? '' : (f.crops?.reason || 'This field has no plan to judge.') };
  });
  const counts = { fine: 0, close: 0, hurt: 0, none: 0 }; for (const f of fields) counts[f.verdict]++;
  return { year, fields, counts, sentence: sentenceOf(year, fields) };
}
// The one sentence the live region says each time the year changes.
export const sentenceOf = (year, fields) => `${year}. ${fields.map(f => `${f.name}: ${f.word}.`).join(' ')}`;
export const tokenLabel = (field, year) => `${field.name}: ${field.word} in ${year}`;
// The weather record the replays were run on, said once (or each, if the fields did not read the same one: never two mixed without saying so).
export function recordWords(fieldCrops) {
  const names = [...new Set(fieldCrops.map(f => f.crops?.record).filter(Boolean).map(r => `${r.name}, ${r.first}–${r.last}`))];
  return names.length ? `Counts on ${names.join(' and on ')} weather.` : 'The weather record could not be read.';
}
// The next year in a list sorted oldest first; null at the end.
export const stepYear = (years, year, by) => { const list = playOrder(years), i = list.indexOf(year); return i < 0 ? null : (list[i + by] ?? null); };
