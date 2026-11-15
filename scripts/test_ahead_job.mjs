// Crophalo's Look ahead job suite: the four jobs (next 2 weeks, this season, the 24-month outlook, years ahead) run on the recorded Oxford answers with a stand-in for the scoring path, the progress they report, a job that cannot be worked out,
// and the client's fallback path (no worker, a worker that cannot start, a stopped client). RULE: never loosen a check to make it pass. No network. Run: node scripts/test_ahead_job.mjs
import fs from 'node:fs';
import { computeJob } from '../js/ahead-job.js';
import { createAheadClient, supportsModuleWorkers } from '../js/ahead-client.js';
import { buildSeries } from '../js/data.js';
import { cropOf } from '../js/crops.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const rec = name => { const text = fs.readFileSync(new URL(`./fixtures/open-meteo/${name}.rec`, import.meta.url), 'utf8'); return JSON.parse(text.slice(text.indexOf('\n') + 1)); };
const ENS = rec('ensemble-oxford'), SEAS = rec('seasonal-oxford'), CLIM = rec('climate-oxford');
const POW = buildSeries(JSON.parse(fs.readFileSync(new URL('./fixtures/power_oxford.json', import.meta.url), 'utf8')), { lat: 43.13, lon: -80.75 });
// a stand-in for the farm's judgeSeason: a frost of -2 or colder is a hit, below 0 a close call (dated), a season with no days is "growing"
const judge = (season, series) => { const causes = []; let seen = 0; for (let i = 0; i < series.days.length; i++) { const d = `${series.days[i].slice(0, 4)}-${series.days[i].slice(4, 6)}-${series.days[i].slice(6, 8)}`; if (d < season.sow || d > season.harvest) continue; seen++; const lo = series.T2M_MIN[i]; if (!Number.isFinite(lo)) continue; if (lo <= -2) causes.push({ severity: 'hit', kind: 'frost-young', date: d }); else if (lo < 0) causes.push({ severity: 'close', kind: 'frost-young', date: d }); } return seen ? { verdict: causes.some(c => c.severity === 'hit') ? 'hurt' : causes.length ? 'close' : 'fine', causes, notes: [] } : { verdict: 'growing', causes: [], notes: [] }; };
const WHEAT = { seasons: [{ crop: 'wheat', sow: '2026-10-05', harvest: '2027-07-20' }] };
const T = '2026-11-14';

{
  const steps = []; const w = await computeJob('weeks', { models: [{ model: 'ecmwf_ifs025', answer: ENS }], series: POW, plan: WHEAT, today: T, endDate: '2026-11-28', fieldElev: 298, ctx: {} }, { judge, cropOf, progress: (what, done, of) => steps.push([what, done, of]) });
  check('weeks: the real ensemble on the real record gives counts for the 51 runs of the European model, hurt first, nothing added together', w.ok && w.result.per.length === 1 && w.result.per[0].tally.runs === 51 && w.result.per[0].tally.hurt + w.result.per[0].tally.close + w.result.per[0].tally.fine + w.result.per[0].tally.nodata === 51 && w.result.inGround === true, brief(w.result.per?.[0]?.tally));
  same('weeks: it says how far it has got', steps, [['ecmwf_ifs025', 0, 1]]);
  check('weeks: the model says whether it was matched to NASA, and the nights are counted from the runs', typeof w.result.per[0].matched === 'boolean' && w.result.per[0].nights.of === 51 && w.result.per[0].nights.below0 >= 0);
  const none = await computeJob('weeks', { models: [{ model: 'ecmwf_ifs025', answer: ENS }], series: POW, plan: { seasons: [{ crop: 'corn', sow: '2027-05-01', harvest: '2027-10-01' }] }, today: T, endDate: '2026-11-28' }, { judge, cropOf });
  check('weeks: nothing in the ground is said, with the next sowing', none.ok && none.result.inGround === false && none.result.next.sow === '2027-05-01');
}
{
  const s = await computeJob('season', { seasonal: SEAS, series: POW, plan: WHEAT, today: T, endDate: '2027-05-15', ctx: {} }, { judge, cropOf });
  check('season: 50 runs laid over the past years of the real record, counted with the lean and without it', s.ok && s.result.inGround && s.result.runs === 50 && s.result.counts.lean.runs === 50 * s.result.years && s.result.counts.usual.runs === s.result.years && s.result.counts.perRunHurt.min <= s.result.counts.perRunHurt.max, brief(s.result.counts));
  check('season: the months the seasonal forecast reaches are reported', s.result.changesMonths.length === 7);
  same('season: a forecast that cannot be read, or a record too short, says so in a sentence', [(await computeJob('season', { seasonal: { daily: {}, monthly: {} }, series: POW, plan: WHEAT, today: T, endDate: '2027-05-15' }, { judge, cropOf })).reason, (await computeJob('season', { seasonal: SEAS, series: { days: ['20260101'], T2M_MAX: [1], T2M_MIN: [0], rain: [0] }, plan: WHEAT, today: T, endDate: '2027-05-15' }, { judge, cropOf })).reason], ['The seasonal forecast could not be read.', 'Too few past years in the weather record to lay the forecast over.']);
}
{
  const o = await computeJob('outlook', { seasonal: SEAS, climate: [{ model: 'EC_Earth3P_HR', answer: CLIM }], series: POW, today: T }, { judge, cropOf });
  check('outlook: 24 months, the first 7 from the seasonal runs, the rest from the climate trend, and what was skipped is listed', o.ok && o.result.rows.length === 24 && o.result.kinds.counts.seasonal === 7 && o.result.kinds.counts.trend === 17 && o.result.models === 1 && o.result.skipped.length === 0, brief(o.result?.kinds?.counts));
  const bad = await computeJob('outlook', { climate: [{ model: 'X', answer: null }], series: POW, today: T }, { judge, cropOf }); check('outlook: a model with no answer is skipped with its reason, and the months are the usual month', bad.ok && bad.result.skipped[0].model === 'X' && bad.result.kinds.counts.usual === 24);
}
{
  const steps = []; const y = await computeJob('years', { climate: [{ model: 'EC_Earth3P_HR', answer: CLIM }, { model: 'NICAM16_8S', answer: null }], series: POW, plan: WHEAT, today: T, endDate: '2027-07-31', ctx: {} }, { judge, cropOf, progress: (w, d, o) => steps.push([w, d, o]) });
  check('years: one model answered (its copy of every past year counted), the other is skipped with its reason, and the years as they really were are beside it', y.ok && y.result.counts.models === 1 && y.result.skipped.length === 1 && y.result.counts.years >= 20 && y.result.counts.real.runs === y.result.counts.years, brief([y.result?.counts?.models, y.result?.skipped]));
  same('years: progress for each model', steps.map(s => [s[0], s[1], s[2]]), [['EC_Earth3P_HR', 0, 2], ['NICAM16_8S', 1, 2]]);
  const warm = y.result.warming[0]; check('years: the warming of daytime highs is a figure per model', Number.isFinite(warm) && warm > 0 && warm < 6, String(warm));
  same('years: no usable model says so', (await computeJob('years', { climate: [{ model: 'X', answer: null }], series: POW, plan: WHEAT, today: T, endDate: '2027-07-31' }, { judge, cropOf })).reason, 'No climate model could be used here.');
  same('an unknown job is a sentence', (await computeJob('nope', {}, { judge, cropOf })).reason, 'Unknown job.');
  same('weeks with no usable forecast says so in a sentence', (await computeJob('weeks', { models: [{ model: 'x', answer: ENS }], series: null, plan: WHEAT, today: T, endDate: '2026-11-28' }, { judge, cropOf })).reason, 'The forecast could not be used: No ensemble answer to build futures from.');
  const boom = await computeJob('weeks', { models: [{ model: 'ecmwf_ifs025', answer: ENS }], series: POW, plan: WHEAT, today: T, endDate: '2026-11-28' }, { judge: () => { throw new Error('boom'); }, cropOf }); check('a judge that throws makes every run "no data", never fine and never a crash', boom.ok && boom.result.per[0].tally.nodata === 51 && boom.result.per[0].tally.fine === 0 && boom.result.allNoData === true);
}
{
  check('no worker in this place: module workers are not supported', supportsModuleWorkers(undefined) === false && supportsModuleWorkers(class { constructor() { throw new Error('no'); } }) === false);
  const c = createAheadClient({ forceFallback: true, judge, cropOf, yieldFn: async () => {} }), seen = [];
  const r = await c.run('weeks', { models: [{ model: 'ecmwf_ifs025', answer: ENS }], series: POW, plan: WHEAT, today: T, endDate: '2026-11-28' }, p => seen.push(p.what));
  check('the client runs the job in small steps without a worker, with the same answer and progress', c.mode === 'fallback' && r.ok && r.result.per[0].tally.runs === 51 && seen.join() === 'ecmwf_ifs025');
  const direct = await computeJob('weeks', { models: [{ model: 'ecmwf_ifs025', answer: ENS }], series: POW, plan: WHEAT, today: T, endDate: '2026-11-28' }, { judge, cropOf }); same('the answers are the same with and without the client', r, direct);
  const stopped = createAheadClient({ forceFallback: true, judge, cropOf }); stopped.stop(); check('a stopped client can be used again (it starts afresh)', (await stopped.run('nope', {})).reason === 'Unknown job.');
  let yields = 0; const stepped = createAheadClient({ forceFallback: true, judge, cropOf, yieldFn: async () => { yields++; } }); await stepped.run('years', { climate: [{ model: 'EC_Earth3P_HR', answer: CLIM }], series: POW, plan: WHEAT, today: T, endDate: '2027-07-31' }); check('the page gets control back between pieces of work', yields >= 2, String(yields));
}
console.log(`ahead_job: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
