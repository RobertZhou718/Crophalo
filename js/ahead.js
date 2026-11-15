// Crophalo's Look ahead controller: what is asked for, and when. On opening ONE ensemble request (the European model); the other two forecast models only when the farmer asks; the seasonal forecast only when that horizon (or the 24-month
// outlook) is chosen; the seven climate models only behind "Load the climate models", one at a time. A failure or a 429 is said once, in a sentence, and is asked again only when the farmer presses Try again. Nothing is asked while the tab is hidden.
// Pure but for what it is handed (a loader, a client, a render callback): createAhead(). The page (js/ahead-view.js, openAhead) draws state and calls these. Checked by scripts/test_ahead.mjs (every request made, in order, and none that should not be).
import { CLIMATE_MODELS, ENSEMBLE_MODELS } from './ahead-load.js';

export const HORIZON_IDS = ['weeks', 'season', 'outlook', 'years'];
export const WEEKS_DAYS = 14;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const blank = () => ({ status: 'idle', result: null, reason: '', progress: null });
// deps: { loader, client, field: { name, lat, lon, elev }, plan, series, today, render(state), ctx, hardLine, seasonEnd }
export function createAhead({ loader, client, field, plan, series, today, render = () => {}, ctx = {}, hardLine = -2, seasonEnd = null }) {
  const state = { horizon: 'weeks', weeks: blank(), season: blank(), outlook: blank(), years: blank(), answers: { ens: {}, seas: null, clim: {} }, moreModels: false, climateLoaded: 0 };
  const endWeeks = addDays(today, WEEKS_DAYS), endSeason = seasonEnd ?? addDays(today, 200), endYears = seasonEnd ?? addDays(today, 200);
  const set = (key, patch) => { Object.assign(state[key], patch); render(state); };
  const failed = (key, r) => set(key, { status: r.kind === 'hidden' ? 'hidden' : 'error', reason: r.reason, progress: null });

  async function weeks() {
    set('weeks', { status: 'loading', reason: '' });
    const models = state.moreModels ? ENSEMBLE_MODELS : [ENSEMBLE_MODELS[0]];
    for (const m of models) {
      if (state.answers.ens[m]) continue;
      const r = await loader.ensemble(field.lat, field.lon, m);
      if (!r.ok) { if (m === ENSEMBLE_MODELS[0] || !state.answers.ens[ENSEMBLE_MODELS[0]]) return failed('weeks', r); break; }
      state.answers.ens[m] = r.data;
    }
    const have = ENSEMBLE_MODELS.filter(m => state.answers.ens[m]).map(m => ({ model: m, answer: state.answers.ens[m] }));
    const out = await client.run('weeks', { models: have, series, plan, today, endDate: endWeeks, fieldElev: field.elev ?? null, ctx, hardLine }, p => set('weeks', { progress: p }));
    set('weeks', out.ok ? { status: 'ok', result: out.result, progress: null } : { status: 'error', reason: out.reason, progress: null });
  }
  async function seasonal() {
    if (state.answers.seas) return { ok: true };
    const r = await loader.seasonal(field.lat, field.lon);
    if (r.ok) state.answers.seas = r.data; return r;
  }
  async function season() {
    set('season', { status: 'loading', reason: '' });
    const r = await seasonal(); if (!r.ok) return failed('season', r);
    const out = await client.run('season', { seasonal: state.answers.seas, series, plan, today, endDate: endSeason, ctx }, p => set('season', { progress: p }));
    set('season', out.ok ? { status: 'ok', result: out.result, progress: null } : { status: 'error', reason: out.reason, progress: null });
  }
  async function outlook() {
    set('outlook', { status: 'loading', reason: '' });
    const r = await seasonal(); if (!r.ok && r.kind === 'hidden') return failed('outlook', r);
    const climate = CLIMATE_MODELS.filter(m => state.answers.clim[m]).map(m => ({ model: m, answer: state.answers.clim[m] }));
    const out = await client.run('outlook', { seasonal: state.answers.seas, climate, series, today }, p => set('outlook', { progress: p }));   // with no seasonal answer the outlook is the usual month (and the trend, if the climate models are loaded)
    set('outlook', out.ok ? { status: 'ok', result: { ...out.result, seasonalFailed: !r.ok ? r.reason : '' }, progress: null } : { status: 'error', reason: out.reason, progress: null });
  }
  async function years() {   // only on the farmer's press: the models one at a time
    set('years', { status: 'loading', reason: '', progress: { what: '', done: 0, of: CLIMATE_MODELS.length } });
    let reason = '';
    for (const [i, m] of CLIMATE_MODELS.entries()) {
      if (state.answers.clim[m]) continue;
      set('years', { progress: { what: m, done: i, of: CLIMATE_MODELS.length } });
      const r = await loader.climate(field.lat, field.lon, m);
      if (!r.ok) { reason = r.reason; if (r.kind === 'busy' || r.kind === 'hidden') break; continue; }   // a busy service stops the loading: no more requests are made on its own
      state.answers.clim[m] = r.data; state.climateLoaded++;
    }
    const climate = CLIMATE_MODELS.filter(m => state.answers.clim[m]).map(m => ({ model: m, answer: state.answers.clim[m] }));
    if (!climate.length) return set('years', { status: 'error', reason: reason || 'No climate model could be read.', progress: null });
    const out = await client.run('years', { climate, series, plan, today, endDate: endYears, ctx }, p => set('years', { progress: { ...p, done: p.done, of: p.of } }));
    set('years', out.ok ? { status: 'ok', result: { ...out.result, partial: climate.length < CLIMATE_MODELS.length ? reason : '', loaded: climate.length }, progress: null } : { status: 'error', reason: out.reason, progress: null });
  }
  const run = { weeks, season, outlook, years };
  return {
    state,
    open() { render(state); return weeks(); },
    choose(h) { if (!HORIZON_IDS.includes(h)) return Promise.resolve(); state.horizon = h; render(state); const s = state[h]; return h === 'years' || s.status !== 'idle' ? Promise.resolve() : run[h](); },
    moreModels() { state.moreModels = true; return weeks(); },
    loadClimate() { return state.years.status === 'loading' ? Promise.resolve() : years(); },
    retry(h) { return HORIZON_IDS.includes(h) && state[h].status !== 'loading' ? run[h]() : Promise.resolve(); },
    visible() { for (const h of ['weeks', 'season', 'outlook']) if (state[h].status === 'hidden') run[h](); },   // the tab came into view: what waited is asked now
  };
}
