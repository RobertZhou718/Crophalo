// Crophalo's Look ahead loader suite: the fixed Open-Meteo addresses (the pin rounded to 0.1 degree), one request at a time, one request for one address however many ask, the keeping times and the 40-answer limit (which goes first),
// an answer up to a week past its limit shown as old, a 429 or a failure said in one plain sentence with NO retry, nothing fetched while the tab is hidden. RULE: never loosen a check to make it pass. No network. Run: node scripts/test_ahead_load.mjs
import { ensembleUrl, seasonalUrl, climateUrl, createStore, createAheadLoader, evictionOrder, KEEP, MAX_KEPT, WEEK_MS, WORDS, CLIMATE_MODELS, ENSEMBLE_MODELS, BUCKET } from '../js/ahead-load.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- the addresses
same('the ensemble address: one model, highs, lows and rain, 15 forecast days and 7 past, GMT, the pin to 0.1 degree', ensembleUrl(43.1312, -80.7499, 'ecmwf_ifs025'), 'https://ensemble-api.open-meteo.com/v1/ensemble?latitude=43.1&longitude=-80.7&models=ecmwf_ifs025&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=15&past_days=7&timezone=GMT');
check('the seasonal address: daily and monthly in one request, 215 days', /^https:\/\/seasonal-api\.open-meteo\.com\/v1\/seasonal\?latitude=43\.1&longitude=-80\.7&daily=temperature_2m_mean,precipitation_sum&monthly=temperature_2m_mean,temperature_2m_anomaly,precipitation_mean,precipitation_anomaly&forecast_days=215&timezone=GMT$/.test(seasonalUrl(43.1312, -80.7499)));
same('the climate address: one model, 2001 to 2050', climateUrl(43.13, -80.75, 'EC_Earth3P_HR'), 'https://climate-api.open-meteo.com/v1/climate?latitude=43.1&longitude=-80.7&start_date=2001-01-01&end_date=2050-12-31&models=EC_Earth3P_HR&daily=temperature_2m_max,temperature_2m_min,precipitation_sum');
check('no address carries more than the pin rounded to 0.1 degree: no name, no outline, no id', [ensembleUrl(43.1312, -80.7499, 'gfs_seamless'), seasonalUrl(43.1312, -80.7499), climateUrl(43.1312, -80.7499, 'NICAM16_8S')].every(u => !/43\.13|80\.74|80\.75/.test(u)));
check('seven climate models and three ensemble models, as the note names them', CLIMATE_MODELS.length === 7 && ENSEMBLE_MODELS.join() === 'ecmwf_ifs025,gfs_seamless,gem_global' && BUCKET === 'crophalo-ahead-v1' && MAX_KEPT === 40);

// ---- a stand-in service
const body = (n = 1) => JSON.stringify({ daily: { time: ['2026-11-14'] }, n });
function service(opts = {}) { const log = [], run = { log, active: 0, maxActive: 0 };
  run.fetch = async url => { log.push(url); run.active++; run.maxActive = Math.max(run.maxActive, run.active); await wait(opts.delay ?? 5); run.active--;
    if (opts.status && opts.status(url) !== 200) return { ok: false, status: opts.status(url), text: async () => '' }; return { ok: true, status: 200, text: async () => body(log.length) }; }; return run; }
const clock = { t: Date.UTC(2026, 10, 14, 12) }, now = () => clock.t;

{
  const svc = service(), L = createAheadLoader({ fetch: svc.fetch, store: createStore(), now, visible: () => true });
  const r = await L.ensemble(43.13, -80.75); check('an answer comes back with its data, not from the store, and is new', r.ok && r.cached === false && r.old === false && r.data.n === 1);
  const again = await L.ensemble(43.13, -80.75); check('the same question again is the kept answer: no second request', again.ok && again.cached === true && svc.log.length === 1);
  clock.t += KEEP.ens + 1000; const stale = await L.ensemble(43.13, -80.75); check('after its 3 hours the answer is asked for again', stale.ok && stale.cached === false && svc.log.length === 2);
  const [a, b, c] = await Promise.all([L.seasonal(43.13, -80.75), L.seasonal(43.13, -80.75), L.seasonal(43.13, -80.75)]); check('three asks for one address at once make one request', svc.log.filter(u => /seasonal/.test(u)).length === 1 && a.ok && b.ok && c.ok);
  clock.t += 10 * 864e5; const s2 = await L.seasonal(43.13, -80.75); check('a seasonal answer is kept 24 hours', s2.cached === false && svc.log.filter(u => /seasonal/.test(u)).length === 2);
  const cl = await L.climate(43.13, -80.75, 'EC_Earth3P_HR'); clock.t += 100 * 864e5; const cl2 = await L.climate(43.13, -80.75, 'EC_Earth3P_HR'); check('a climate answer is kept 180 days', cl.cached === false && cl2.cached === true && svc.log.filter(u => /climate/.test(u)).length === 1);
}
{
  const svc = service({ delay: 15 }), L = createAheadLoader({ fetch: svc.fetch, store: createStore(), now, visible: () => true });
  await Promise.all([L.climate(43.13, -80.75, 'EC_Earth3P_HR'), L.climate(43.13, -80.75, 'MRI_AGCM3_2_S'), L.climate(43.13, -80.75, 'NICAM16_8S'), L.ensemble(43.13, -80.75), L.seasonal(43.13, -80.75)]);
  check('requests go one at a time, however many are asked for together', svc.maxActive === 1 && svc.log.length === 5, `${svc.maxActive} at once`);
  check('and in the order they were asked for', /climate.*EC_Earth3P_HR/.test(svc.log[0]) && /ensemble/.test(svc.log[3]) && /seasonal/.test(svc.log[4]));
}
// ---- a 429, a failure, no retry
{
  const svc = service({ status: () => 429 }), L = createAheadLoader({ fetch: svc.fetch, store: createStore(), now, visible: () => true });
  const r = await L.ensemble(43.13, -80.75); await wait(60);
  same('a 429 is one plain sentence, marked busy', [r.ok, r.kind, r.reason], [false, 'busy', WORDS.busy]);
  check('and nothing is asked again on its own (one request, a moment later still one)', svc.log.length === 1, String(svc.log.length));
  const down = createAheadLoader({ fetch: async () => { throw new Error('offline'); }, store: createStore(), now, visible: () => true }), d = await down.ensemble(43.13, -80.75);
  same('a failed request is one plain sentence, marked down', [d.ok, d.kind, d.reason], [false, 'down', WORDS.down]);
  const bad = createAheadLoader({ fetch: async () => ({ ok: true, status: 200, text: async () => '<html>' }), store: createStore(), now, visible: () => true }); check('an answer that is not JSON is a failure, not a figure', (await bad.seasonal(43.13, -80.75)).ok === false);
  const apiErr = createAheadLoader({ fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ error: true, reason: 'x' }) }), store: createStore(), now, visible: () => true }); check('an answer that says it is an error is a failure', (await apiErr.seasonal(43.13, -80.75)).ok === false);
  check('the sentences say nothing about chances and no technical words', [WORDS.busy, WORDS.down, WORDS.hidden].every(w => !/429|HTTP|status|error|exception/i.test(w)));
}
// ---- a kept answer past its limit is shown as old when the service fails, up to a week past
{
  const store = createStore(), ok = service(), L1 = createAheadLoader({ fetch: ok.fetch, store, now, visible: () => true }); await L1.ensemble(43.13, -80.75);
  clock.t += KEEP.ens + 2 * 864e5; const fail = createAheadLoader({ fetch: async () => { throw new Error('x'); }, store, now, visible: () => true }), r = await fail.ensemble(43.13, -80.75);
  check('two days past its limit and the service is down: the kept answer, marked old', r.ok && r.old === true && r.cached === true, brief(r));
  clock.t += 8 * 864e5; const r2 = await fail.ensemble(43.13, -80.75); check('more than a week past its limit: not shown at all', r2.ok === false && r2.kind === 'down');
}
// ---- nothing is fetched while the tab is hidden
{
  const svc = service(); let shown = false; const L = createAheadLoader({ fetch: svc.fetch, store: createStore(), now, visible: () => shown });
  const r = await L.ensemble(43.13, -80.75); same('hidden: no request, and a sentence that says it waits', [svc.log.length, r.ok, r.kind, r.reason], [0, false, 'hidden', WORDS.hidden]);
  shown = true; const r2 = await L.ensemble(43.13, -80.75); check('in view: it asks', r2.ok && svc.log.length === 1);
  shown = false; const r3 = await L.ensemble(43.13, -80.75); check('hidden again, with a kept answer still fresh: the kept answer, no request', r3.ok && r3.cached && svc.log.length === 1);
}
// ---- bad input
{
  const svc = service(), L = createAheadLoader({ fetch: svc.fetch, store: createStore(), now, visible: () => true });
  same('no place, no request', [(await L.ensemble(NaN, 1)).kind, (await L.seasonal(null, null)).kind, (await L.climate(95, 0, 'EC_Earth3P_HR')).kind, svc.log.length], ['place', 'place', 'place', 0]);
  same('a model name that is not on the list is never put in an address', [(await L.ensemble(43.13, -80.75, 'x&evil=1')).ok, (await L.climate(43.13, -80.75, 'x&evil=1')).ok, svc.log.length], [false, false, 0]);
}
// ---- the 40-answer limit: spent first, then 2-week, then seasonal, climate last
{
  const T = Date.UTC(2026, 10, 14), key = (kind, i, age) => ({ url: `https://${kind === 'ens' ? 'ensemble' : kind === 'seas' ? 'seasonal' : 'climate'}-api.open-meteo.com/${i}`, at: T - age });
  const keys = [key('clim', 1, 0), key('seas', 2, 0), key('ens', 3, 0), key('ens', 4, KEEP.ens + WEEK_MS + 1000), key('clim', 5, 10 * 864e5), key('seas', 6, 3 * 864e5)];
  same('eviction order: the spent one first, then the 2-week answer, then seasonal (the older first), climate last', evictionOrder(keys, T).map(k => k.url.split('/').pop()), ['4', '3', '6', '2', '5', '1']);
  const store = createStore(), svc = service(), L = createAheadLoader({ fetch: svc.fetch, store, now: () => T, visible: () => true });
  for (let i = 0; i < 41; i++) await store.put(`https://seasonal-api.open-meteo.com/old${i}`, body(), T - (i + 1) * 1000);
  await L.climate(43.13, -80.75, 'EC_Earth3P_HR'); const kept = await store.keys();
  check('more than 40 answers: the oldest seasonal ones go, the new climate answer stays, 40 are left', kept.length === 40 && kept.some(k => /climate-api/.test(k.url)), String(kept.length));
}
console.log(`ahead_load: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
