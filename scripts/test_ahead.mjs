// Crophalo's Look ahead controller suite: exactly which requests are made, and when. One ensemble request on opening; the other two models only when asked; the seasonal forecast only when that horizon or the outlook is chosen; the seven climate
// models only on the button, one at a time and not after a busy answer; a failure is said once and asked again only on Try again; nothing while hidden. A stand-in loader and client record every call. RULE: never loosen a check. No network. Run: node scripts/test_ahead.mjs
import { createAhead, HORIZON_IDS } from '../js/ahead.js';
import { CLIMATE_MODELS, ENSEMBLE_MODELS } from '../js/ahead-load.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const FIELD = { name: 'North field', lat: 43.13, lon: -80.75, elev: 298 }, PLAN = { seasons: [] }, SERIES = { days: [] };
function rig(script = {}) {
  const calls = [], jobs = []; let active = 0, maxActive = 0;
  const reply = async (key, kind, args) => { calls.push([kind, ...args]); active++; maxActive = Math.max(maxActive, active); await Promise.resolve(); active--; const r = script[key]?.(args) ?? { ok: true, data: { kind, args } }; return r; };
  const loader = { ensemble: (lat, lon, m) => reply(`ens:${m}`, 'ensemble', [m]), seasonal: () => reply('seas', 'seasonal', []), climate: (lat, lon, m) => reply(`clim:${m}`, 'climate', [m]) };
  const client = { run: async (type, job, progress) => { jobs.push([type, job]); progress?.({ what: 'x', done: 0, of: 1 }); return script.client?.(type, job) ?? { ok: true, type, result: { type } }; } };
  const states = []; const ahead = createAhead({ loader, client, field: FIELD, plan: PLAN, series: SERIES, today: '2026-11-14', render: s => states.push(s.horizon + ':' + s.weeks.status + ':' + s.season.status + ':' + s.outlook.status + ':' + s.years.status) });
  return { ahead, calls, jobs, states, max: () => maxActive };
}

{
  const r = rig(); await r.ahead.open();
  same('opening asks for ONE ensemble answer: the European model, and nothing else', r.calls, [['ensemble', 'ecmwf_ifs025']]);
  check('and works it out with that one model', r.jobs.length === 1 && r.jobs[0][0] === 'weeks' && r.jobs[0][1].models.length === 1 && r.jobs[0][1].models[0].model === 'ecmwf_ifs025' && r.jobs[0][1].fieldElev === 298 && r.jobs[0][1].endDate === '2026-11-28', brief(r.jobs[0]?.[1]?.models?.length));
  check('the weeks are ready; the other horizons have asked for nothing', r.ahead.state.weeks.status === 'ok' && ['season', 'outlook', 'years'].every(h => r.ahead.state[h].status === 'idle'));
  await r.ahead.moreModels(); same('asking for the other models fetches only the American and the Canadian (the European is kept)', r.calls.slice(1), [['ensemble', 'gfs_seamless'], ['ensemble', 'gem_global']]);
  check('and the job now has all three models', r.jobs.at(-1)[1].models.map(m => m.model).join() === ENSEMBLE_MODELS.join());
  await r.ahead.choose('season'); same('choosing This season asks for the seasonal forecast once', r.calls.filter(c => c[0] === 'seasonal').length, 1);
  await r.ahead.choose('weeks'); await r.ahead.choose('season'); check('going back and again asks for nothing more', r.calls.filter(c => c[0] === 'seasonal').length === 1 && r.jobs.filter(j => j[0] === 'season').length === 1);
  await r.ahead.choose('outlook'); check('the 24-month outlook uses the kept seasonal answer: no second request, and no climate model', r.calls.filter(c => c[0] === 'seasonal').length === 1 && r.calls.filter(c => c[0] === 'climate').length === 0 && r.jobs.at(-1)[0] === 'outlook');
  await r.ahead.choose('years'); check('choosing Years ahead asks for NOTHING: it waits for the button', r.calls.filter(c => c[0] === 'climate').length === 0 && r.ahead.state.years.status === 'idle');
  await r.ahead.loadClimate();
  same('the button asks for the seven climate models, one after the other in the note\'s order', r.calls.filter(c => c[0] === 'climate').map(c => c[1]), [...CLIMATE_MODELS]);
  check('the models are asked one at a time, never together', r.max() === 1, String(r.max()));
  check('and the years job has all seven; the years are ready', r.jobs.at(-1)[0] === 'years' && r.jobs.at(-1)[1].climate.length === 7 && r.ahead.state.years.status === 'ok' && r.ahead.state.years.result.loaded === 7);
  await r.ahead.choose('years'); await r.ahead.loadClimate(); check('pressing again asks for nothing: the answers are kept', r.calls.filter(c => c[0] === 'climate').length === 7);
  check('the outlook can be redrawn with the trend after the models are in, using the kept answers', (await r.ahead.retry('outlook'), r.jobs.at(-1)[1].climate.length === 7 && r.calls.filter(c => c[0] === 'seasonal').length === 1));
  check('every state was drawn (the page is told each step)', r.states.length > 10 && HORIZON_IDS.length === 4);
}
{
  // a failure is said once and not asked again on its own
  let n = 0; const r = rig({ 'ens:ecmwf_ifs025': () => (++n, { ok: false, kind: 'down', reason: 'The weather service did not answer. Look ahead can try again later.' }) }); await r.ahead.open(); await Promise.resolve(); await new Promise(res => setTimeout(res, 30));
  same('a failed forecast is said in the service\'s sentence, and nothing is asked again on its own', [r.ahead.state.weeks.status, r.ahead.state.weeks.reason, n, r.jobs.length], ['error', 'The weather service did not answer. Look ahead can try again later.', 1, 0]);
  await r.ahead.retry('weeks'); check('Try again asks once more, and only then', n === 2);
  const busy = rig({ seas: () => ({ ok: false, kind: 'busy', reason: 'The weather service is busy. Look ahead can try again in a minute.' }) }); await busy.ahead.open(); await busy.ahead.choose('season'); await new Promise(res => setTimeout(res, 30));
  same('a busy seasonal service: one sentence for that horizon, the weeks stay as they were, no retry', [busy.ahead.state.season.status, busy.ahead.state.season.reason, busy.ahead.state.weeks.status, busy.calls.filter(c => c[0] === 'seasonal').length], ['error', 'The weather service is busy. Look ahead can try again in a minute.', 'ok', 1]);
  const out = rig({ client: () => ({ ok: false, reason: 'Too few past years in the weather record to lay the forecast over.' }) }); await out.ahead.open(); check('a job that cannot be worked out is its own sentence', out.ahead.state.weeks.status === 'error' && /Too few past years/.test(out.ahead.state.weeks.reason));
}
{
  // a busy climate service stops the loading: no more requests on its own
  let k = 0; const r = rig({ ...Object.fromEntries(CLIMATE_MODELS.map(m => [`clim:${m}`, () => (++k >= 3 ? { ok: false, kind: 'busy', reason: 'The weather service is busy. Look ahead can try again in a minute.' } : { ok: true, data: {} })])) });
  await r.ahead.open(); await r.ahead.loadClimate();
  same('the third climate model gets a busy answer: loading stops there, no 4th request', r.calls.filter(c => c[0] === 'climate').map(c => c[1]), CLIMATE_MODELS.slice(0, 3));
  check('the two models that did arrive are used, and the page says why the rest are missing', r.ahead.state.years.status === 'ok' && r.ahead.state.years.result.loaded === 2 && /busy/.test(r.ahead.state.years.result.partial), brief(r.ahead.state.years.result));
  await r.ahead.loadClimate(); check('pressing the button again asks only for the models still missing, starting with the one that failed', r.calls.filter(c => c[0] === 'climate').length >= 4 && r.calls.filter(c => c[0] === 'climate')[3][1] === CLIMATE_MODELS[2]);
  const none = rig({ ...Object.fromEntries(CLIMATE_MODELS.map(m => [`clim:${m}`, () => ({ ok: false, kind: 'down', reason: 'The weather service did not answer. Look ahead can try again later.' })])) }); await none.ahead.open(); await none.ahead.loadClimate();
  check('a service that answers for none: all seven are tried once (a plain failure does not stop the others), then one sentence', none.calls.filter(c => c[0] === 'climate').length === 7 && none.ahead.state.years.status === 'error' && /did not answer/.test(none.ahead.state.years.reason));
}
{
  // hidden: nothing is asked; in view again: what waited is asked
  let hidden = true; const r = rig({ 'ens:ecmwf_ifs025': () => (hidden ? { ok: false, kind: 'hidden', reason: 'Look ahead waits until this tab is in view before it asks the weather service.' } : { ok: true, data: {} }) });
  await r.ahead.open(); same('a hidden tab: the weeks wait, with the sentence', [r.ahead.state.weeks.status, r.ahead.state.weeks.reason.slice(0, 20)], ['hidden', 'Look ahead waits unt']);
  hidden = false; r.ahead.visible(); await new Promise(res => setTimeout(res, 30)); check('in view again: it asks, and the weeks are ready', r.ahead.state.weeks.status === 'ok' && r.calls.filter(c => c[0] === 'ensemble').length === 2);
  check('an unknown horizon changes nothing', (await r.ahead.choose('nope'), r.ahead.state.horizon === 'weeks'));
}
console.log(`ahead: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
