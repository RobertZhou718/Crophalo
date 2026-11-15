// The model of "Your hardest year" for the report that is on the screen: the chips, the chosen year played on the three strategies, the storm row and the counts. The crops are judged once for each answer and kept with it.
// Not pure (it reads the report's own state); the rules are in js/hardyear.js. Checked through scripts/test_hardyear.mjs (the rules) and scripts/e2e_letter.mjs (the card).
import { yearChips, fullYears, judgePlan, playYear, allYears, stormRow, worst, WORDS } from './hardyear.js';
import { strategies, optionLabels, ROLE_TAG } from './report-view.js';
import { MIN_YEARS } from './history.js';

export function hardYearModel(cur) {
  const result = cur?.result, series = cur?.series;
  if (!result?.ok || !series?.days?.length) return { status: 'noweather' };
  const years = fullYears(series);
  if (years.length < MIN_YEARS) return { status: 'toofew' };
  const plans = strategies(result).first, labels = optionLabels(result), roles = strategies(result).roles;
  const key = `${series.days.length}|${plans.map(p => p.id).join()}|${cur.state?.soil?.texture ?? ''}|${cur.state?.farm?.irrigation ?? ''}`;
  if (cur._hy?.key !== key) {
    const texture = cur.state?.soil?.texture ?? 'loam', irrigation = cur.state?.farm?.irrigation ?? 'none';
    const judged = new Map(plans.map(p => [p, judgePlan(p, series, { texture, irrigation, years })]));
    cur._hy = { key, judged, chips: yearChips(series, cur.state?.prio), counts: allYears(plans, judged, years), storm: stormRow(plans, series, years) };
  }
  const { judged, chips, counts, storm } = cur._hy;
  const year = years.includes(cur.hyYear) ? cur.hyYear : (chips[0]?.year ?? years.at(-1));
  const rows = playYear(plans, judged, year).map(r => ({ name: labels.get(r.plan) ?? r.plan.id, role: ROLE_TAG[roles.get(r.plan)] ?? 'Option', cells: r.cells, result: r.result, reason: r.reason }));
  const names = plans.map(p => labels.get(p) ?? p.id), bare = storm.perPlan.map((x, i) => `${x.bare} under ${i === 0 ? 'what you grow now' : names[i]}`);
  const stormWords = storm.n ? `The ${storm.n === 10 ? '10 rainiest days' : `${storm.n} days with 20 mm of rain or more`} since ${years[0]}: bare soil on ${bare.join(', ')}.` : '';
  const record = `${series.source === 'era5' ? WORDS.backup : WORDS.weather} ${years[0]}–${years.at(-1)}.`;
  return { status: 'ok', chips, years, year, rows, storm: { n: storm.n, words: stormWords }, counts: counts.map((c, i) => ({ name: names[i], hurt: c.hurt, close: c.close, of: c.of })), record, worst: worst(rows.map(r => r.result)) };
}
