// Crophalo's polite Open-Meteo loader for Look ahead: the browser asks the weather service itself, one request at a time, never while the tab is hidden, never again on its own after a failure, and keeps every answer on the device.
// Pure but for what it is handed (fetch, a store, the clock, a visibility test): ensembleUrl(), seasonalUrl(), climateUrl(), createStore(), createAheadLoader(). Only the pin rounded to 0.1 degree is ever sent.
// Checked by scripts/test_ahead_load.mjs (the fixed addresses, the one-at-a-time queue, the keeping times and the 40-answer limit, a 429 and a failure in one plain sentence with no retry, nothing fetched while hidden).
export const BUCKET = 'crophalo-ahead-v1', MAX_KEPT = 40, WEEK_MS = 7 * 864e5;
export const KEEP = Object.freeze({ ens: 3 * 36e5, seas: 24 * 36e5, clim: 180 * 864e5 });
export const CLIMATE_MODELS = Object.freeze(['CMCC_CM2_VHR4', 'FGOALS_f3_H', 'HiRAM_SIT_HR', 'MRI_AGCM3_2_S', 'EC_Earth3P_HR', 'MPI_ESM1_2_XR', 'NICAM16_8S']);
export const ENSEMBLE_MODELS = Object.freeze(['ecmwf_ifs025', 'gfs_seamless', 'gem_global']);
export const WORDS = Object.freeze({
  busy: 'The weather service is busy. Look ahead can try again in a minute.',
  down: 'The weather service did not answer. Look ahead can try again later.',
  hidden: 'Look ahead waits until this tab is in view before it asks the weather service.',
  noPlace: 'Look ahead needs the field’s position.',
});
const round1 = v => (Math.round(Number(v) * 10) / 10).toFixed(1);
const num = v => (v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' ? Number(v) : NaN), ok = (lat, lon) => Number.isFinite(num(lat)) && Number.isFinite(num(lon)) && Math.abs(num(lat)) <= 90 && Math.abs(num(lon)) <= 180;
export const ensembleUrl = (lat, lon, model) => `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${round1(lat)}&longitude=${round1(lon)}&models=${model}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=15&past_days=7&timezone=GMT`;
export const seasonalUrl = (lat, lon) => `https://seasonal-api.open-meteo.com/v1/seasonal?latitude=${round1(lat)}&longitude=${round1(lon)}&daily=temperature_2m_mean,precipitation_sum&monthly=temperature_2m_mean,temperature_2m_anomaly,precipitation_mean,precipitation_anomaly&forecast_days=215&timezone=GMT`;
export const climateUrl = (lat, lon, model, endYear = 2050) => `https://climate-api.open-meteo.com/v1/climate?latitude=${round1(lat)}&longitude=${round1(lon)}&start_date=2001-01-01&end_date=${endYear}-12-31&models=${model}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum`;

// A store of kept answers: get(url) -> { at, text } | null, put(url, text, at), keys() -> [{ url, at }], remove(url). Memory here; the Cache API one is cacheApiStore().
export function createStore() {
  const map = new Map();
  return { async get(url) { return map.get(url) ?? null; }, async put(url, text, at) { map.set(url, { at, text }); }, async keys() { return [...map].map(([url, v]) => ({ url, at: v.at })); }, async remove(url) { map.delete(url); } };
}
export function cacheApiStore(caches = globalThis.caches, name = BUCKET) {
  const open = () => caches.open(name);
  return {
    async get(url) { try { const hit = await (await open()).match(url); return hit ? { at: Number(hit.headers.get('x-saved')) || 0, text: await hit.text() } : null; } catch { return null; } },
    async put(url, text, at) { try { await (await open()).put(url, new Response(text, { headers: { 'content-type': 'application/json', 'x-saved': String(at) } })); } catch { /* a full cache costs only the keeping */ } },
    async keys() { try { const c = await open(); return Promise.all((await c.keys()).map(async r => ({ url: r.url, at: Number((await c.match(r))?.headers.get('x-saved')) || 0 }))); } catch { return []; } },
    async remove(url) { try { await (await open()).delete(url); } catch { /* gone */ } },
  };
}
const kindOf = url => (/ensemble-api/.test(url) ? 'ens' : /seasonal-api/.test(url) ? 'seas' : 'clim');
// Which answers go first when there are more than 40: spent ones (older than their time plus a week), then the 2-week ones, then the seasonal ones; climate answers last (they cost the most to get again).
export function evictionOrder(keys, now) {
  const rank = k => { const kind = kindOf(k.url); return now - k.at > KEEP[kind] + WEEK_MS ? 0 : kind === 'ens' ? 1 : kind === 'seas' ? 2 : 3; };
  return [...keys].sort((a, b) => rank(a) - rank(b) || a.at - b.at);
}

// options: fetch, store, now(), visible() (false while the tab is hidden). Every call answers { ok, data, cached, at, old } or { ok: false, kind: 'busy' | 'down' | 'hidden' | 'place', reason }. Calls go one at a time.
export function createAheadLoader({ fetch: get = globalThis.fetch?.bind(globalThis), store = createStore(), now = () => Date.now(), visible = () => !globalThis.document?.hidden } = {}) {
  let chain = Promise.resolve(); const inFlight = new Map();
  async function ask(url) {
    const kind = kindOf(url), kept = await store.get(url), t = now();
    if (kept && t - kept.at < KEEP[kind]) { try { return { ok: true, data: JSON.parse(kept.text), cached: true, at: kept.at, old: false }; } catch { /* a broken copy is asked again */ } }
    if (!visible()) return kept && t - kept.at < KEEP[kind] + WEEK_MS ? okOld(kept) : { ok: false, kind: 'hidden', reason: WORDS.hidden };
    try {
      const res = await get(url);
      if (res.status === 429) return fallback(kept, t, url, { ok: false, kind: 'busy', reason: WORDS.busy });
      if (!res.ok) return fallback(kept, t, url, { ok: false, kind: 'down', reason: WORDS.down });
      const text = await res.text(), data = JSON.parse(text);
      if (data?.error) return fallback(kept, t, url, { ok: false, kind: 'down', reason: WORDS.down });
      await store.put(url, text, t); await trim();
      return { ok: true, data, cached: false, at: t, old: false };
    } catch { return fallback(kept, t, url, { ok: false, kind: 'down', reason: WORDS.down }); }
  }
  const okOld = kept => { try { return { ok: true, data: JSON.parse(kept.text), cached: true, at: kept.at, old: true }; } catch { return { ok: false, kind: 'down', reason: WORDS.down }; } };
  // an answer up to a week past its limit is shown as old, never as new
  const fallback = (kept, t, url, failure) => (kept && t - kept.at < KEEP[kindOf(url)] + WEEK_MS ? okOld(kept) : failure);
  async function trim() { const keys = await store.keys(); if (keys.length <= MAX_KEPT) return; for (const k of evictionOrder(keys, now()).slice(0, keys.length - MAX_KEPT)) await store.remove(k.url); }
  function queued(url) {   // one at a time, and one request for one address however many ask
    if (inFlight.has(url)) return inFlight.get(url);
    const p = chain.then(() => ask(url)); chain = p.catch(() => {}); inFlight.set(url, p); p.finally(() => inFlight.delete(url)); return p;
  }
  const place = (lat, lon, make) => (ok(lat, lon) ? queued(make()) : Promise.resolve({ ok: false, kind: 'place', reason: WORDS.noPlace }));
  return { ensemble: (lat, lon, model = 'ecmwf_ifs025') => (ENSEMBLE_MODELS.includes(model) ? place(lat, lon, () => ensembleUrl(lat, lon, model)) : Promise.resolve({ ok: false, kind: 'down', reason: WORDS.down })),
    seasonal: (lat, lon) => place(lat, lon, () => seasonalUrl(lat, lon)), climate: (lat, lon, model) => (CLIMATE_MODELS.includes(model) ? place(lat, lon, () => climateUrl(lat, lon, model)) : Promise.resolve({ ok: false, kind: 'down', reason: WORDS.down })) };
}
