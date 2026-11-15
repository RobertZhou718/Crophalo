// Crophalo's report loader: asks the sources one by one for one spot and reports each answer as it comes, so the loading screen can show them.
// Only what is really asked is listed: NASA POWER (with the satellite rain it carries) and, apart, the forecast. A source that does not answer says why.
// Not pure: it fetches. It takes fetch, the device cache and the clock as arguments, so a test can stand in for them.
// Checked by scripts/test_report.mjs (the rows, a POWER answer, the back-up record, a failure with its reason, the forecast failing without hurting the rest).
import { cleanPlace, powerUrl, era5Url, forecastUrl, cachedJSON, KEEP, LIMIT, powerProblem, backupProblem, buildSeries, buildBackupSeries, NO_WEATHER, backupNote, seriesProblem, waitSeconds } from './data.js';
import { computeClimate } from './climate.js';
import { once, spotKey } from './memo.js';
import { loadImerg } from './satellites-data.js';
import { loadGrace, loadEco, loadHls } from './satellites2-data.js';
import { loadNearby } from './near-load.js';
import { loadDem } from './field-data.js';

export const ROWS = Object.freeze([
  { key: 'power', label: 'Weather, rain & soil wetness · NASA POWER' },
  { key: 'forecast', label: 'This week’s forecast · Open-Meteo (not NASA)' },
]);
export const freshRows = () => ROWS.map(r => ({ ...r, state: 'wait', reason: '' }));
const reasonOf = e => e?.plain || e?.message ? String(e.plain ? e.message : /^status 429/.test(e.message) ? `The service is busy. Try again in ${waitSeconds(e.retryAfter)} seconds.` : e.name === 'AbortError' || e.name === 'TimeoutError' ? 'The service took too long to answer.' : 'The service did not answer.') : 'The service did not answer.';
// Ask for one spot. onRow(key, state, reason) is told of every answer. Returns { ok, climate, series, spot, note, forecastP, allCached } or { ok: false, reason } as soon as the weather record and the climate are in:
// the forecast is not waited for, it comes back as a promise (forecastP) that settles with the raw answer or null. env.climateFrom(json, place), when given, turns the POWER answer into { ok, series, climate } away from the page.
export async function loadSpot(loc, env = {}, onRow = () => {}) {
  const place = cleanPlace(loc?.lat, loc?.lon);
  if (place.reason) { onRow('power', 'fail', place.reason); return { ok: false, reason: place.reason }; }
  const now = env.now ? env.now() : Date.now();
  let allCached = true;
  const forecastP = cachedJSON(forecastUrl(place), { keep: KEEP.forecast, limit: LIMIT.forecast }, env).then(a => { if (!a.cached) allCached = false; onRow('forecast', 'ok', ''); return a.json; }, e => { onRow('forecast', 'fail', reasonOf(e)); return null; });
  let series = null, climate = null, note = '';
  try {
    const answer = await cachedJSON(powerUrl(place, now), { keep: KEEP.power, limit: LIMIT.power, check: a => powerProblem(a, place) }, env);
    if (!answer.cached) allCached = false;
    if (typeof env.climateFrom === 'function') {   // the record and the climate worked out on the worker: the page only receives them
      const made = await env.climateFrom(answer.json, place);
      if (!made?.ok) throw Object.assign(new Error(made?.reason || 'NASA POWER sent an answer Crophalo could not read'), { plain: true });
      series = made.series; climate = made.climate;
    } else {
      series = buildSeries(answer.json, place);
      const bad = series ? seriesProblem(series, 'NASA POWER') : 'NASA POWER sent an answer Crophalo could not read';
      if (bad) throw Object.assign(new Error(bad), { plain: true });
    }
    onRow('power', 'ok', '');
  } catch (e) {
    onRow('power', 'fail', reasonOf(e)); series = null; climate = null; allCached = false;
    try {   // the back-up record, said plainly when it is used
      const back = await cachedJSON(era5Url(place, now), { keep: KEEP.era5, limit: LIMIT.era5, check: a => backupProblem(a, place) }, env);
      series = buildBackupSeries(back.json, place);
      if (!series || seriesProblem(series, 'Open-Meteo')) series = null; else note = backupNote(series);
    } catch { series = null; }
  }
  if (!series) return { ok: false, reason: `${NO_WEATHER}`, forecastP };
  if (!climate) { try { climate = computeClimate(series, place.lat); } catch (e) { return { ok: false, reason: 'The weather could not be turned into figures for this spot.', forecastP }; } }
  return { ok: true, climate, series, forecast: null, forecastP, spot: place, note, allCached };
}

// ---- the same lookups, shared: whoever asks first starts them, everyone after gets the same promise (js/memo.js). prefetchPlace() asks when the place is chosen, so the report opens on answers already in.
// A report that is opened with its own rows to fill is told the rows that already settled, so the loading screen is never behind the data.
const spotRuns = new Map();
export function spotFor(loc, env = {}, onRow = () => {}) {
  const place = cleanPlace(loc?.lat, loc?.lon);
  if (place.reason) return loadSpot(loc, env, onRow);
  const key = spotKey('spot', place), hit = spotRuns.get(key);
  if (hit && Date.now() - hit.at < 10 * 60e3) { for (const e of hit.events) onRow(...e); hit.listeners.add(onRow); return hit.promise.then(r => ({ ...r, shared: true })); }
  const run = { at: Date.now(), events: [], listeners: new Set([onRow]) };
  run.promise = loadSpot(loc, env, (...e) => { run.events.push(e); for (const f of run.listeners) f(...e); });
  spotRuns.set(key, run);
  run.promise.then(r => { if (!r.ok && spotRuns.get(key) === run) spotRuns.delete(key); }, () => { if (spotRuns.get(key) === run) spotRuns.delete(key); });
  return run.promise;
}
export const forgetSpots = () => spotRuns.clear();
const get = () => globalThis.fetch?.bind(globalThis);
export const getSmap = loc => once(spotKey('smap', loc), () => loadSmap(loc, get()), { good: r => r?.value != null });
export const getImerg = loc => once(spotKey('imerg', loc), () => loadImerg(loc, get()));
export const getGrace = loc => once(spotKey('grace', loc), () => loadGrace(loc, get()));
export const getEco = loc => once(spotKey('eco', loc), () => loadEco(loc, get()));
export const getHls = loc => once(spotKey('hls', loc), () => loadHls(loc, get()));
export const getNearby = loc => once(spotKey('near', loc), () => loadNearby(loc, get()), { good: r => r?.read !== false || r?.absent !== undefined });
export const getDem = (loc, outline) => once(spotKey('dem', loc, outline?.pts ? `${outline.pts.length}:${outline.ha}` : 'none'), () => loadDem(loc, outline));
// Start everything the report and its tabs will ask for, for the place just chosen. Answers nothing to the screen. A drawn outline also starts the height map.
export function prefetchPlace(loc, env = {}, outline = null) {
  const place = cleanPlace(loc?.lat, loc?.lon);
  if (place.reason) return false;
  spotFor(loc, env).catch(() => {});
  for (const ask of [getSmap, getNearby, getImerg, getGrace, getEco, getHls]) ask(loc).catch(() => {});
  if (outline) getDem(loc, outline).catch(() => {});
  return true;
}

// ---- the regional reading: root-zone soil moisture from NASA SMAP, one value for a square about 9 km wide, through the server's own route.
// Returns the reading the regional card takes: { label, value, date, km, lat, lon, source: 'smap', why }. value is null when nothing was read, and `why` says why in plain words.
export const SMAP_LABEL = 'Moisture around the roots', SMAP_KM = 9;
const SMAP_DOWN = 'The soil moisture lookup did not answer. The rest of the report does not need it.';
export async function loadSmap(loc, get = globalThis.fetch?.bind(globalThis)) {
  const lat = Number(loc?.lat), lon = Number(loc?.lon), base = { label: SMAP_LABEL, value: null, date: '', km: SMAP_KM, lat, lon, source: 'smap', cell: null };
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof get !== 'function') return { ...base, why: SMAP_DOWN };
  try {
    const res = await get(`/api/smaproot?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}`);
    const a = await res.json();
    if (a?.ok && Number.isFinite(a.value) && a.value >= 0 && a.value <= 1) return { ...base, value: a.value, date: typeof a.date === 'string' ? a.date : '', cell: a.cell ?? null, why: '' };
    return { ...base, why: typeof a?.reason === 'string' && a.reason ? a.reason.slice(0, 200) : SMAP_DOWN };
  } catch { return { ...base, why: SMAP_DOWN }; }
}
