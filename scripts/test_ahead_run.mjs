// Crophalo's Look ahead judging suite: with a stand-in for the one scoring path (the real judgeSeason is the farm's), the window rule (only the window's days can bring an event, temperatures missing on more than one day are no data),
// the worst season of a field, frost counts from the runs' own nights, and the three horizons' counts. RULE: never loosen a check to make it pass. No network. Run: node scripts/test_ahead_run.mjs
import { asSeries, worst, seasonsInWindow, windowMissing, seasonVerdict, fieldVerdict, nightCounts, runWeeks, runSeasonHorizon, runYearsHorizon } from '../js/ahead-run.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

// a stand-in judge with the shape of the farm's: frost at -2 or colder is a hit, below 0 a close call, dated; a missing temperature is no data
const judge = (season, series, crop) => {
  const causes = []; let seen = 0;
  for (let i = 0; i < series.days.length; i++) { const d = `${series.days[i].slice(0, 4)}-${series.days[i].slice(4, 6)}-${series.days[i].slice(6, 8)}`; if (d < season.sow || d > season.harvest) continue; seen++; const lo = series.T2M_MIN[i]; if (!Number.isFinite(lo)) return { verdict: 'nodata', causes: [], notes: [] }; if (lo <= -2) causes.push({ severity: 'hit', kind: 'frost-young', date: d, text: 'Frost on young plants' }); else if (lo < 0) causes.push({ severity: 'close', kind: 'frost-young', date: d, text: 'Frost on young plants' }); }
  if (!seen) return { verdict: 'growing', causes: [], notes: [] };
  return { verdict: causes.some(c => c.severity === 'hit') ? 'hurt' : causes.length ? 'close' : 'fine', causes, notes: [] };
};
const cropOf = id => (id === 'corn' || id === 'soy' ? { frost: 0.1, heat: 33, water: 500, group: 'cereal' } : null);
const days = (from, n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 10, 14 + i)).toISOString().slice(0, 10).replace(/-/g, ''));
const run = (los, his = null) => ({ days: days('', los.length), lo: los, hi: his ?? los.map(() => 10), rain: los.map(() => 0) });
const PLAN = { seasons: [{ crop: 'corn', sow: '2026-11-10', harvest: '2026-11-30' }, { crop: 'soy', sow: '2027-05-01', harvest: '2027-10-01' }] };
const T = '2026-11-14', E = '2026-11-27';

same('the series the judge reads carries the days, the temperatures, the rain and the last real day', Object.keys(asSeries(run([1, 2]))), ['days', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'rain', 'lastDate']);
same('the worst season: hurt over close over no data over fine; nothing to judge is no data', [worst(['fine', 'close', 'hurt']), worst(['fine', 'close']), worst(['fine', 'nodata']), worst(['fine', 'fine']), worst([])], ['hurt', 'close', 'nodata', 'fine', 'nodata']);
{
  const s = seasonsInWindow(PLAN, T, E); same('the seasons the window reaches, and the next sowing after it starts', [s.inside.map(x => x.crop), s.next?.crop], [['corn'], 'soy']);
  same('nothing in the ground: no seasons inside, the next sowing named', [seasonsInWindow({ seasons: [PLAN.seasons[1]] }, T, E).inside.length, seasonsInWindow({ seasons: [PLAN.seasons[1]] }, T, E).next.sow], [0, '2027-05-01']);
  same('a plan with bad dates or no seasons has nothing', [seasonsInWindow(null, T, E).inside.length, seasonsInWindow({ seasons: [{ crop: 'corn', sow: 'x', harvest: 'y' }] }, T, E).inside.length], [0, 0]);
}
{
  const calm = run(Array(14).fill(5)), cold = run([5, 5, -1, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), hard = run([5, 5, -3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), gap = run([5, NaN, NaN, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), one = run([5, NaN, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
  same('missing temperatures: none, one day, two days in the window', [windowMissing(calm, T, E), windowMissing(one, T, E), windowMissing(gap, T, E)], [0, 1, 2]);
  const corn = { id: 'corn', frost: 0.1 }, season = PLAN.seasons[0];
  same('the window verdicts: calm is fine, -1 a close call, -3 hurt', [seasonVerdict(judge, season, corn, calm, {}, { kinds: ['frost', 'heat'], window: { from: T, to: E } }), seasonVerdict(judge, season, corn, cold, {}, { kinds: ['frost', 'heat'], window: { from: T, to: E } }), seasonVerdict(judge, season, corn, hard, {}, { kinds: ['frost', 'heat'], window: { from: T, to: E } })], ['fine', 'close', 'hurt']);
  check('only the window\'s days can bring an event: a hard frost after the window is not counted', seasonVerdict(judge, season, corn, run([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, -5, -5]), {}, { kinds: ['frost'], window: { from: T, to: '2026-11-20' } }) === 'fine');
  check('only the named kinds count: a dry-season cause is ignored in a 2-week window', seasonVerdict((s, ser) => ({ verdict: 'hurt', causes: [{ severity: 'hit', kind: 'dry', date: '2026-11-20', text: 'A dry season' }], notes: [] }), season, corn, calm, {}, { kinds: ['frost', 'heat'], window: { from: T, to: E } }) === 'fine');
  same('a judge that throws or answers nothing is no data, never fine', [seasonVerdict(() => { throw new Error('x'); }, season, corn, calm), seasonVerdict(() => null, season, corn, calm)], ['nodata', 'nodata']);
  same('with no window the judge\'s own verdict stands; "growing" is no data', [seasonVerdict(judge, season, corn, hard), seasonVerdict(() => ({ verdict: 'growing', causes: [] }), season, corn, calm)], ['hurt', 'nodata']);
  same('a field is as bad as its worst season; a crop that is not in the table is no data', [fieldVerdict(judge, PLAN.seasons, cropOf, run(Array(14).fill(5)), {}, null), fieldVerdict(judge, [{ crop: 'rice', sow: T, harvest: E }], cropOf, calm, {}, null)], ['nodata', 'nodata']);
  const n = nightCounts([calm, cold, hard, gap], T, E, { hardLine: -2 }); same('frost counts from the runs\' own nights: below 0, below the crop\'s hard line, the first day', [n.below0, n.belowHard, n.of, n.firstDay], [2, 1, 4, '2026-11-16']);
  same('heat counts the runs whose highs reach the line', nightCounts([run(Array(14).fill(5), Array(14).fill(36)), calm], T, E, { heatLine: 35 }).hot, 1);
  // the 2-week horizon
  const model = (label, runs) => ({ ok: true, model: label, label: `${label} model`, short: label, matched: true, stale: false, runs });
  const w = runWeeks({ models: [model('European', [calm, calm, cold, hard, gap]), model('American', [calm, calm, calm]), { ok: false }], plan: PLAN, today: T, endDate: E, judge, cropOf });
  same('the week: each model\'s counts, hurt first; a run with two missing days is no data, never fine', w.per.map(p => [p.label, p.tally.hurt, p.tally.close, p.tally.fine, p.tally.nodata, p.tally.runs]), [['European model', 1, 1, 2, 1, 5], ['American model', 0, 0, 3, 0, 3]]);
  check('the week: the models disagree when one has trouble in a third of its runs and the other in none, and a model with no answer is left out', w.disagree === true && w.per.length === 2 && w.inGround === true && w.allNoData === false);
  const empty = runWeeks({ models: [model('European', [calm])], plan: { seasons: [PLAN.seasons[1]] }, today: T, endDate: E, judge, cropOf });
  check('nothing in the ground: nothing is checked, and the next sowing is named', empty.inGround === false && empty.next.sow === '2027-05-01' && empty.per[0].tally.judged === 0);
  const blind = runWeeks({ models: [model('European', [gap, gap])], plan: PLAN, today: T, endDate: E, judge, cropOf }); check('missing temperatures on the days that matter in every run: "cannot be checked", not fine', blind.allNoData === true && blind.per[0].tally.nodata === 2 && blind.per[0].tally.fine === 0);
}
// ---- this season and years ahead, on small made-up futures
{
  const fut = { years: [2001, 2002, 2003], futures: [] }; for (const y of fut.years) fut.futures.push({ run: -1, year: y, days: days('', 20), lo: Array(20).fill(y === 2003 ? -3 : 5), hi: Array(20).fill(10), rain: Array(20).fill(0) });
  for (const r of ['01', '02']) for (const y of fut.years) fut.futures.push({ run: r, year: y, days: days('', 20), lo: Array(20).fill(y === 2001 ? -1 : y === 2003 ? -3 : 5), hi: Array(20).fill(10), rain: Array(20).fill(0) });
  const s = runSeasonHorizon({ fut, plan: PLAN, today: T, endDate: '2026-12-01', judge, cropOf });
  check('this season: the counts with the lean (2 runs x 3 years = 6 futures) and the same years with no lean', s.inGround && s.counts.lean.runs === 6 && s.counts.lean.hurt === 2 && s.counts.lean.close === 2 && s.counts.lean.fine === 2 && s.counts.usual.hurt === 1 && s.counts.usual.fine === 2 && s.counts.runs === 2 && s.counts.years === 3, brief(s.counts));
  check('this season: nothing in the ground is said, not counted as fine', runSeasonHorizon({ fut, plan: { seasons: [PLAN.seasons[1]] }, today: T, endDate: '2026-12-01', judge, cropOf }).counts === null);
  const models = [{ model: 'A', years: fut.years, futures: fut.futures.filter(f => f.run === '01') }, { model: 'B', years: fut.years, futures: fut.futures.filter(f => f.run === '02') }];
  const y = runYearsHorizon({ models, real: fut, plan: PLAN, today: T, endDate: '2026-12-01', judge, cropOf });
  check('years ahead: hurt counts for each model, the range across models, and the years as they really were', y.inGround && y.counts.models === 2 && y.counts.hurtMin === 1 && y.counts.hurtMax === 1 && y.counts.real.hurt === 1 && y.counts.years === 3, brief(y.counts));
}
console.log(`ahead_run: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
