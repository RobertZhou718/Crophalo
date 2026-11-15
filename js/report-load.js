// Crophalo's report loader: asks the sources one by one for one spot and reports each answer as it comes, so the loading screen can show them.
// Only what is really asked is listed: NASA POWER (with the satellite rain it carries) and, apart, the forecast. A source that does not answer says why.
// Not pure: it fetches. It takes fetch, the device cache and the clock as arguments, so a test can stand in for them.
// Checked by scripts/test_report.mjs (the rows, a POWER answer, the back-up record, a failure with its reason, the forecast failing without hurting the rest).
import { fitHeight, heightNote, fetchEra5Cold, weatherLine, BACKUP_CARD, cleanPlace, powerUrl, era5Url, forecastUrl, cachedJSON, KEEP, LIMIT, powerProblem, backupProblem, buildSeries, buildBackupSeries, NO_WEATHER, backupNote, seriesProblem, waitSeconds, landProblem, answerNoLand } from './data.js';
import { computeClimate, notFarmlandWords } from './climate.js';
import { once, spotKey, isKept } from './memo.js';
import { loadImerg } from './satellites-data.js';
import { loadGrace, loadEcoUntilDone, loadHls, plainReason } from './satellites2-data.js';
import { fetchCropMap, nearbyFrom } from './near-load.js';
import { loadSoilSurvey } from './soil-load.js';
import { apiUrl } from './api.js';

export const ROWS = Object.freeze([
  { key: 'power', label: 'Weather, rain & soil wetness · NASA POWER' },
  { key: 'forecast', label: 'This week’s forecast · Open-Meteo (not NASA)' },
  { key: 'cold', label: 'Coldest nights, a second record · Open-Meteo ERA5-Land (not NASA)' },
  { key: 'smap', label: 'Soil moisture round the roots · NASA SMAP' },
  { key: 'crops', label: 'What farmers grow nearby · national crop map' },
  { key: 'soil', label: 'Soil · US soil survey (only for a field in the United States)' },
]);
// The record arrives: NASA POWER's daily highs of 2001 to 2025, handed to whoever draws the band (js/macro-record.js). Nothing listens when no motion module is loaded; the figures are the record's own, before any height correction.
export const RECORD_FROM = 2001, RECORD_TO = 2025;
export function recordDetail(series) {
  if (!series || !Array.isArray(series.days) || !series.T2M_MAX) return null;
  const idx = []; series.days.forEach((d, i) => { const y = Number(String(d).slice(0, 4)); if (y >= RECORD_FROM && y <= RECORD_TO) idx.push(i); });
  if (!idx.length) return null;
  const dates = new Int32Array(idx.length), tmax = new Float32Array(idx.length), seen = new Set();
  idx.forEach((i, k) => { dates[k] = Number(series.days[i]); const v = series.T2M_MAX[i]; tmax[k] = typeof v === 'number' && Number.isFinite(v) ? v : NaN; seen.add(Math.floor(dates[k] / 10000)); });
  return { years: Int16Array.from([...seen].sort((a, b) => a - b)), dates, tmax };
}
function announceRecord(series) {
  try { const detail = recordDetail(series); if (detail && typeof document !== 'undefined' && document.dispatchEvent) document.dispatchEvent(new CustomEvent('crophalo:record', { detail })); } catch { /* the band is a picture; the report never waits on it */ }
}
export const COLD_WAIT_MS = 3000;   // the second coldest-night record is waited for this long after NASA's has come; then the report goes on and says the figure rests on NASA alone
export const BACKUP_WAIT_MS = 4000;   // the back-up record is asked once more after this long when its first answer fails
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
  // the second record of the coldest night is asked once NASA's answer is in (it never holds the report back: a failure leaves the figure resting on NASA alone and says so)
  // It is not asked for a square NASA sees as sea or ice: that gets words, never figures of water from a back-up record.
  let coldP = null;
  const askCold = () => coldP ||= fetchEra5Cold(place.lat, place.lon, env).then(c => { onRow('cold', c.ok ? 'ok' : 'fail', c.ok ? '' : String(c.reason ?? 'The second record did not answer, so the coldest night rests on NASA alone.')); return c.ok ? c : null; }, () => { onRow('cold', 'fail', 'The second record did not answer, so the coldest night rests on NASA alone.'); return null; });
  const elev = Number.isFinite(loc?.elev) ? loc.elev : null;   // the field's own height, when known: temperatures are moved to it and the sentence says by how much
  let series = null, climate = null, note = '', backup = false, fetched = '', cached = false, cold = null, raw = null;
  try {
    const answer = await cachedJSON(powerUrl(place, now), { keep: KEEP.power, limit: LIMIT.power, check: a => powerProblem(a, place) }, env);
    if (!answer.cached) allCached = false;
    fetched = answer.fetched ?? ''; cached = !!answer.cached;
    if (answerNoLand(answer.json)) { onRow('power', 'ok', ''); return { ok: false, reason: landProblem({ noLand: true }), notFarmland: true, forecastP }; }
    let slow = null;
    cold = await Promise.race([askCold(), new Promise(r => { slow = setTimeout(() => { onRow('cold', 'fail', 'The second record was slow, so the coldest night rests on NASA alone.'); r(null); }, env.coldWait ?? COLD_WAIT_MS); })]);
    clearTimeout(slow);
    if (typeof env.climateFrom === 'function' && elev === null) {   // the record and the climate worked out on the worker: the page only receives them
      const made = await env.climateFrom(answer.json, { ...place, cold });
      if (!made?.ok) throw Object.assign(new Error(made?.reason || 'NASA POWER sent an answer Crophalo could not read'), { plain: true });
      series = made.series; climate = made.climate; raw = series;
    } else {
      series = buildSeries(answer.json, place);
      const bad = series ? seriesProblem(series, 'NASA POWER') : 'NASA POWER sent an answer Crophalo could not read';
      if (bad) throw Object.assign(new Error(bad), { plain: true });
      raw = series;
      if (elev !== null) series = fitHeight(series, elev);
    }
    onRow('power', 'ok', '');
    if (landProblem(series)) return { ok: false, reason: landProblem(series), notFarmland: true, forecastP };   // sea or ice: a true answer, so no back-up record is asked for figures of water
  } catch (e) {
    onRow('power', 'fail', reasonOf(e)); series = null; climate = null; allCached = false; cold = null;
    askCold();   // asked as before, so its row on the loading screen settles; the back-up record below has its own coldest nights
    // the back-up record, said plainly when it is used; asked once more after four seconds when the first answer fails
    for (let tries = 0; tries < 2 && !series; tries++) {
      try {
        if (tries) await (env.wait ? env.wait(BACKUP_WAIT_MS) : new Promise(done => setTimeout(done, BACKUP_WAIT_MS)));
        const back = await cachedJSON(era5Url(place, now), { keep: KEEP.era5, limit: LIMIT.era5, check: a => backupProblem(a, place) }, env);
        const s = buildBackupSeries(back.json, place);
        if (s && !seriesProblem(s, 'Open-Meteo')) { series = elev !== null ? fitHeight(s, elev) : s; note = backupNote(series); backup = true; fetched = back.fetched ?? ''; cached = !!back.cached; }
      } catch { series = null; }
    }
  }
  if (!series) return { ok: false, reason: `${NO_WEATHER}`, forecastP };
  if (raw && !backup) announceRecord(raw);
  if (!climate) { try { climate = computeClimate(series, place.lat, cold ? { cold } : {}); } catch (e) { return { ok: false, reason: 'The weather could not be turned into figures for this spot.', forecastP }; } }
  if (notFarmlandWords(climate)) return { ok: false, reason: notFarmlandWords(climate), notFarmland: true, forecastP };   // sea or ice, or no growing season at all: words, not figures
  // the sentences travel on the climate object, like the coldest-night sentence: the height correction, where the record comes from and how new it is
  const hn = heightNote(series), line = weatherLine({ cached, fetched, through: series.through }, now);
  climate = { ...climate, heightNote: hn, weatherLine: line, backup, ...(backup ? { backupCard: BACKUP_CARD } : {}) };
  if (hn) note = note ? `${note} ${hn}` : hn;
  return { ok: true, climate, series, forecast: null, forecastP, spot: place, note, allCached, backup, through: series.through, line };
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
// ECOSTRESS reads a year over several asks: the lookup asks again by itself (up to three times) and every answer goes to whoever is watching, so the card is drawn again after each ask.
// onUpdate(answer) is told the newest answer at once if there is one, then each later one; the promise ends with the last answer.
const ecoWatch = new Map();
export function getEco(loc, onUpdate) {
  const key = spotKey('eco', loc);
  let w = ecoWatch.get(key);
  if (!w) ecoWatch.set(key, w = { last: null, fns: new Set() });
  if (typeof onUpdate === 'function') { w.fns.add(onUpdate); if (w.last && isKept(key)) onUpdate(w.last); }
  const p = once(key, () => { w.last = null; return loadEcoUntilDone(loc, { get: get(), onUpdate: e => { w.last = e; for (const f of [...w.fns]) { try { f(e); } catch {} } } }); }, { good: a => a != null && a.ok !== false && !a.gaveUp });   // a year left unfinished after three asks is not kept: its card says to open the report again later, so that next open asks again
  if (typeof onUpdate === 'function') p.then(() => w.fns.delete(onUpdate), () => w.fns.delete(onUpdate));
  return p;
}
export const getHls = loc => once(spotKey('hls', loc), () => loadHls(loc, get()));
// One request serves the setup's crop step and the report: the raw crop-map answer is kept, and the engine's fields are made from it.
export const getCropMap = loc => once(spotKey('cropmap', loc), () => fetchCropMap(loc, get()), { good: r => r?.ok === true });
// the kept crop-map answer and the country's own national lists (FAOSTAT areas) together: where the map says nothing, or only a wide class, the country's list decides (js/near-load.js nearbyFrom)
export const getNearby = loc => once(spotKey('near', loc), () => nearbyFrom(getCropMap(loc), loc, get()), { good: r => r?.read !== false || r?.absent !== undefined });
// The US soil survey for a field in the United States (asked once, kept like the others); a field elsewhere is not asked.
export const getSoilSurvey = loc => once(spotKey('soilsurvey', loc), () => loadSoilSurvey(loc, get()), { good: r => r?.ok === true });
// The key holds the outline's own corners (rounded to about a metre), so an outline edited to the same size and number of corners never gets the old slope answer.
export const outlineKey = outline => (Array.isArray(outline?.pts) ? `${outline.pts.length}:${outline.ha}:${outline.pts.map(p => `${(+p[0]).toFixed(5)},${(+p[1]).toFixed(5)}`).join(';')}` : 'none');
// the height map's code (js/field-data.js, with its 3D data) is fetched only when the height is asked, so My farm, which reads this file for the weather, does not load it at start
export const getDem = (loc, outline) => once(spotKey('dem', loc, outlineKey(outline)), async () => (await import('./field-data.js')).loadDem(loc, outline));
// Start everything the report and its tabs will ask for, for the place just chosen. Answers nothing to the screen. A drawn outline also starts the height map.
export function prefetchPlace(loc, env = {}, outline = null) {
  const place = cleanPlace(loc?.lat, loc?.lon);
  if (place.reason) return false;
  spotFor(loc, env).catch(() => {});
  // the crop-map lookup needs the field's country, which a bare map position does not carry: asked without it, the refusal would be kept and the report would lose what is grown nearby
  const near = loc?.cc || String(loc?.label ?? '').includes(',') ? [getNearby] : [];
  for (const ask of [getSmap, ...near, getImerg, getGrace, getEco, getHls]) ask(loc).catch(() => {});
  if (String(loc?.cc ?? '').toUpperCase() === 'US') getSoilSurvey(loc).catch(() => {});
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
    const res = await get(apiUrl(`/api/smaproot?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}`));
    const a = await res.json();
    if (a?.ok && Number.isFinite(a.value) && a.value >= 0 && a.value <= 1) return { ...base, value: a.value, date: typeof a.date === 'string' ? a.date : '', cell: a.cell ?? null, why: '' };
    return { ...base, why: plainReason(a?.reason, SMAP_DOWN) };   // the reason in a farmer's words: never a program path, a program name or a status code
  } catch { return { ...base, why: SMAP_DOWN }; }
}
