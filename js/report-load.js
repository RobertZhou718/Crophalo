// Crophalo's report loader: asks the sources one by one for one spot and reports each answer as it comes, so the loading screen can show them.
// Only what is really asked is listed: NASA POWER (with the satellite rain it carries) and, apart, the forecast. A source that does not answer says why.
// Not pure: it fetches. It takes fetch, the device cache and the clock as arguments, so a test can stand in for them.
// Checked by scripts/test_report.mjs (the rows, a POWER answer, the back-up record, a failure with its reason, the forecast failing without hurting the rest).
import { cleanPlace, powerUrl, era5Url, forecastUrl, cachedJSON, KEEP, LIMIT, powerProblem, backupProblem, buildSeries, buildBackupSeries, NO_WEATHER, backupNote, seriesProblem, waitSeconds } from './data.js';
import { computeClimate } from './climate.js';

export const ROWS = Object.freeze([
  { key: 'power', label: 'Weather, rain & soil wetness · NASA POWER' },
  { key: 'forecast', label: 'This week’s forecast · Open-Meteo (not NASA)' },
]);
export const freshRows = () => ROWS.map(r => ({ ...r, state: 'wait', reason: '' }));
const reasonOf = e => e?.plain || e?.message ? String(e.plain ? e.message : /^status 429/.test(e.message) ? `The service is busy. Try again in ${waitSeconds(e.retryAfter)} seconds.` : e.name === 'AbortError' || e.name === 'TimeoutError' ? 'The service took too long to answer.' : 'The service did not answer.') : 'The service did not answer.';
// Ask for one spot. onRow(key, state, reason) is told of every answer. Returns { ok, climate, series, spot, note } or { ok: false, reason }.
export async function loadSpot(loc, env = {}, onRow = () => {}) {
  const place = cleanPlace(loc?.lat, loc?.lon);
  if (place.reason) { onRow('power', 'fail', place.reason); return { ok: false, reason: place.reason }; }
  const now = env.now ? env.now() : Date.now();
  const forecast = cachedJSON(forecastUrl(place), { keep: KEEP.forecast, limit: LIMIT.forecast }, env).then(a => { onRow('forecast', 'ok', ''); return a.json; }, e => { onRow('forecast', 'fail', reasonOf(e)); return null; });
  let series = null, note = '';
  try {
    const answer = await cachedJSON(powerUrl(place, now), { keep: KEEP.power, limit: LIMIT.power, check: a => powerProblem(a, place) }, env);
    series = buildSeries(answer.json, place);
    const bad = series ? seriesProblem(series, 'NASA POWER') : 'NASA POWER sent an answer Crophalo could not read';
    if (bad) throw Object.assign(new Error(bad), { plain: true });
    onRow('power', 'ok', '');
  } catch (e) {
    onRow('power', 'fail', reasonOf(e));
    try {   // the back-up record, said plainly when it is used
      const back = await cachedJSON(era5Url(place, now), { keep: KEEP.era5, limit: LIMIT.era5, check: a => backupProblem(a, place) }, env);
      series = buildBackupSeries(back.json, place);
      if (!series || seriesProblem(series, 'Open-Meteo')) series = null; else note = backupNote(series);
    } catch { series = null; }
  }
  const fc = await forecast;
  if (!series) return { ok: false, reason: `${NO_WEATHER}` };
  let climate = null;
  try { climate = computeClimate(series, place.lat); } catch (e) { return { ok: false, reason: 'The weather could not be turned into figures for this spot.' }; }
  return { ok: true, climate, series, forecast: fc, spot: place, note };
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
