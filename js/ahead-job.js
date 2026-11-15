// Crophalo's Look ahead jobs, one function for the worker and for the page when no worker can start: raw answers in (Open-Meteo's own shapes, the field's daily record, the plan), counts out. Between pieces of work it calls
// yieldFn so the farm stays smooth. The one scoring path (judgeSeason) and the crop table are handed in. Nothing here touches the page, the network or storage.
// Checked by scripts/test_ahead_run.mjs (the counts) and scripts/test_ahead_job.mjs (the three jobs on the recorded Oxford answers, with a stand-in judge, progress and a failure).
import { futuresOf, seasonalChanges, seasonFutures, climateFactors, climateFutures, outlook, outlookKinds } from './future.js';
import { runWeeks, runSeasonHorizon, runYearsHorizon } from './ahead-run.js';

const none = async () => {};
// type: 'weeks' | 'season' | 'outlook' | 'years'. job: { series, plan, today, endDate, ctx, fieldElev, answers: ... }. deps: { judge, cropOf, yieldFn, progress }.
export async function computeJob(type, job, { judge, cropOf, yieldFn = none, progress = () => {} } = {}) {
  try {
    if (type === 'weeks') {
      const models = [];
      for (const [i, m] of (job.models ?? []).entries()) { progress(`${m.model}`, i, job.models.length); await yieldFn(); models.push(futuresOf(m.model, m.answer, job.series, { today: job.today, fieldElev: job.fieldElev, cellElev: m.answer?.elevation ?? null })); }
      await yieldFn();
      if (!models.some(m => m.ok)) return { ok: false, type, reason: models[0]?.reason ? `The forecast could not be used: ${models[0].reason.replace(/\.$/, '')}.` : 'No forecast could be used here.' };
      return { ok: true, type, result: runWeeks({ models, plan: job.plan, today: job.today, endDate: job.endDate, judge, cropOf, ctx: job.ctx, hardLine: job.hardLine }) };
    }
    if (type === 'season') {
      const changes = seasonalChanges(job.seasonal?.daily, job.seasonal?.monthly); await yieldFn();
      if (!changes) return { ok: false, type, reason: 'The seasonal forecast could not be read.' };
      const fut = seasonFutures(job.series, changes, { today: job.today, endDate: job.endDate }); await yieldFn();
      if (!fut.years.length) return { ok: false, type, reason: 'Too few past years in the weather record to lay the forecast over.' };
      return { ok: true, type, result: { ...runSeasonHorizon({ fut, plan: job.plan, today: job.today, endDate: job.endDate, judge, cropOf, ctx: job.ctx }), changesMonths: changes.months, runs: changes.runs.length } };
    }
    if (type === 'outlook') {
      const changes = job.seasonal ? seasonalChanges(job.seasonal.daily, job.seasonal.monthly) : null, factors = (job.climate ?? []).map(c => ({ ...climateFactors(c.answer, { baseTo: job.baseTo }), model: c.model }));
      const rows = outlook(job.series, { seasonal: changes, climate: factors, today: job.today });
      return { ok: true, type, result: { rows, kinds: outlookKinds(rows), models: factors.filter(f => f.ok).length, skipped: factors.filter(f => !f.ok).map(f => ({ model: f.model, reason: f.reason })) } };
    }
    if (type === 'years') {
      const factors = []; for (const [i, c] of (job.climate ?? []).entries()) { progress(c.model, i, job.climate.length); await yieldFn(); factors.push({ ...climateFactors(c.answer, { baseTo: job.baseTo }), model: c.model }); }
      const models = climateFutures(job.series, factors, { today: job.today, endDate: job.endDate }); await yieldFn();
      if (!models.length) return { ok: false, type, reason: 'No climate model could be used here.', skipped: factors.filter(f => !f.ok).map(f => ({ model: f.model, reason: f.reason })) };
      const real = seasonFutures(job.series, null, { today: job.today, endDate: job.endDate });
      const warm = factors.filter(f => f.ok).map(f => f.months.filter(Boolean).reduce((m, c) => Math.max(m, c.dHi), -Infinity)).filter(Number.isFinite);
      return { ok: true, type, result: { ...runYearsHorizon({ models, real, plan: job.plan, today: job.today, endDate: job.endDate, judge, cropOf, ctx: job.ctx }), skipped: factors.filter(f => !f.ok).map(f => ({ model: f.model, reason: f.reason })), warming: factors.filter(f => f.ok).map(f => { const hi = f.months.filter(Boolean).map(c => c.dHi); return hi.reduce((a, b) => a + b, 0) / hi.length; }), warmMax: warm.length ? Math.max(...warm) : null } };
    }
    return { ok: false, type, reason: 'Unknown job.' };
  } catch (e) { return { ok: false, type, reason: 'Look ahead could not work this out just now.' }; }
}
