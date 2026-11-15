// Which data services answer: the richer answer of /api/sources, and the light check behind the Admin page's "Check again". No packages, no clock of its own, no network of its own: the server hands in
// its LIVE table, its run counters and a fetch, so scripts/test_status.mjs can drive every state with stand-in services. Pure but for the one fetch a check makes.
// Checked by scripts/test_status.mjs. scripts/serve.mjs creates it once and answers GET /api/sources and POST /api/sources/check with it.
// RULE: nothing leaves this file that is a path, an address, a key, a login or text a service sent: every problem is one of the plain sentences below, and a server's own error words go through plain() first.

const MIN = 60e3, H = 3600e3;
export const CHECK_EVERY_MS = 10 * MIN;   // a service is asked at most this often, whoever presses "Check again"
export const CHECK_LIMIT_MS = 20e3;       // one small ask may take at most this long
export const SLOW_MS = 8e3;               // an answer that took longer than this is "slow"

const dayAgo = (n, compact = false) => { const d = new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); return compact ? d.replace(/-/g, '') : d; };   // a recent day, so the small ask never names an old one
// The services the browser asks directly (they are not in the server's LIVE table), and the front-door ask used to check each. The ask is small: one small page or one tiny record, never a data download.
export const DIRECT = Object.freeze([
  { id: 'power', name: 'NASA POWER daily weather', ask: () => `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=AG&latitude=41.18&longitude=-96.44&start=${dayAgo(8, true)}&end=${dayAgo(7, true)}&format=JSON`, needs: 'weather record' },
  { id: 'openmeteo-forecast', name: 'Open-Meteo forecast', ask: 'https://api.open-meteo.com/v1/forecast?latitude=41.18&longitude=-96.44&daily=temperature_2m_max&forecast_days=1' },
  { id: 'openmeteo-archive', name: 'Open-Meteo weather archive (ERA5)', ask: () => `https://archive-api.open-meteo.com/v1/archive?latitude=41.18&longitude=-96.44&start_date=${dayAgo(9)}&end_date=${dayAgo(9)}&daily=temperature_2m_max` },
  { id: 'frankfurter', name: 'Currency rates (Frankfurter)', ask: 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=CAD' },
  { id: 'gibs', name: 'NASA GIBS satellite pictures', ask: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml', head: true },
  { id: 'nominatim', name: 'Place search (OpenStreetMap Nominatim)', ask: 'https://nominatim.openstreetmap.org/status.php?format=json' },
  { id: 'openfreemap', name: 'Map names and outlines (OpenFreeMap)', ask: 'https://tiles.openfreemap.org/planet', head: true },
  { id: 'terrain-tiles', name: 'Land heights as map tiles (Terrain Tiles, on Amazon\u2019s open data)', ask: 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/0/0/0.png', head: true },   // the setup map's land layers
  { id: 'soilgrids', name: 'Sand, silt and clay at the pin (ISRIC SoilGrids)', ask: 'https://rest.isric.org/soilgrids/v2.0/properties/query?lon=-96.44&lat=41.18&property=sand&depth=0-5cm&value=mean' },   // one value at one point, as the erosion layer asks
]);
// The front-door ask of each server lookup (LIVE table id). A lookup also records its own real runs, which count as much as a check.
const LIVE_ASKS = Object.freeze({
  smaproot: 'https://opendap.earthdata.nasa.gov/', imergrain: 'https://opendap.earthdata.nasa.gov/', gracecell: 'https://archive.podaac.earthdata.nasa.gov/',
  ecopass: 'https://cmr.earthdata.nasa.gov/search/collections.json?page_size=1', hlsndvi: 'https://cmr.earthdata.nasa.gov/search/collections.json?page_size=1', hlsbox: 'https://cmr.earthdata.nasa.gov/search/collections.json?page_size=1',
  ndvihist: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml', firms: 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/',
  cropsnear: 'https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer?f=json', crophist: 'https://pdi.scinet.usda.gov/image/rest/services/CDL_WM/ImageServer?f=json', dem: 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer?f=json',
  orbits: 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=JSON',   // one satellite's elements (the Space Station), the same kind of ask the home makes
  prices: 'https://www.worldbank.org/en/research/commodity-markets', faostat: 'https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data.zip',
});
const LOGIN = new Set(['smaproot', 'imergrain', 'gracecell', 'ecopass', 'hlsndvi', 'hlsbox']);   // the satellite parts that need the free NASA Earthdata login: the first five read more with it (the app answers without it), the weak spots (hlsbox) read nothing without it
// A service that needs a key says so itself: its LIVE entry may carry `key: '<name>'`, a name of the object scripts/keys.mjs answers with (nass, ams, openet, metno), or the table below names it.
// The server hands in `keys`: a function that answers { name: true | false } (scripts/keys.mjs keysStatus(ROOT, ENV) once that file exists); a value is never asked for, only whether it is there.
const KEY_OF = Object.freeze({ nass: 'nass', marketnews: 'ams', ams: 'ams', openet: 'openet' });   // lookup id -> key name, for the lookups that need a key (USDA NASS, USDA Market News, OpenET); a lookup the LIVE table does not have never gets a row

// ---- plain words: a problem is one of these, or a server's own sentence cleaned by plain()
export const WORDS = Object.freeze({
  none: 'It did not answer.', slow: 'It answered, but slowly.', timeout: 'It did not answer in 20 seconds.', refused: 'It said no to our question.', busy: 'It asked us to wait.', down: 'It had an error on its side.', odd: 'Its answer was not what we expected.',
});
export function plain(text) {   // a sentence for a farmer: no address, no path, no long token, no key=value, no angle brackets, no stack line, at most 140 characters
  let t = String(text ?? '').replace(/https?:\/\/\S+/gi, ' ').replace(/\bBearer\s+\S+/gi, ' ').replace(/\S*[\/\\]\S*/g, ' ').replace(/\b[\w.\-]*(?:key|token|secret|password|passwd|pwd|auth|bearer|login)[\w\-]*\s*[=:]\s*\S+/gi, ' ')
    .replace(/\b[A-Za-z0-9_\-]{24,}\b/g, ' ').replace(/\s+at\s+\S+\s*\([^)]*\)/g, ' ').replace(/\b(?:Traceback|Error|Exception)\b[^.]*:/g, ' ').replace(/[^A-Za-z0-9 .,;:()'’\-–%+]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return WORDS.odd;
  if (t.length > 140) t = t.slice(0, 139).replace(/\s\S*$/, '') + '.';
  return /[.!?]$/.test(t) ? t : t + '.';
}
const byStatus = status => (status === 429 || status === 503 ? WORDS.busy : status >= 500 ? WORDS.down : status >= 400 ? WORDS.refused : WORDS.odd);

// ---- the module
export function createStatus({ live = {}, stats = () => ({}), kept = () => 0, loginSet = () => false, keys = () => ({}), env = {}, fetch: doFetch = globalThis.fetch, now = Date.now, off = [], extra = [] } = {}) {
  const switchedOff = new Set([...off, ...String(env.SERVICES_OFF || '').split(',').map(s => s.trim()).filter(Boolean)]);
  const checks = new Map();   // id -> { at, ok, ms, problem }: what the last check found (a check's own record; the server's real runs are read from stats())
  let queue = Promise.resolve();
  const rows = () => [...Object.entries(live).map(([id, row]) => ({ id, name: String(row.name), ttl: row.ttl, ask: LIVE_ASKS[id] || null, head: false, key: typeof row.key === 'string' ? row.key : KEY_OF[id] || null })), ...DIRECT.map(d => ({ id: d.id, name: d.name, ttl: null, ask: d.ask, head: !!d.head })), ...extra.map(e => ({ id: e.id, name: e.name, ttl: e.ttl ?? null, ask: e.ask || null, head: !!e.head }))];
  const iso = ms => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);

  function entry(r) {
    const run = stats()[r.id] || {}, chk = checks.get(r.id), at = now();
    // the newest event decides: the server's own last real run, or the last check
    const runAt = run.last_time || 0, chkAt = chk?.at || 0, lastEvent = runAt >= chkAt ? (runAt ? { ok: run.last_error == null, ms: run.last_ms, problem: run.last_error } : null) : chk;
    const lastOk = Math.max(run.last_ok_time || 0, chk?.ok ? chk.at : 0, chk?.lastOkAt || 0);
    const lastMs = runAt >= chkAt ? (run.last_ms ?? chk?.ms ?? null) : chk.ms;
    let state = 'not_asked_yet', problem = null;
    if (switchedOff.has(r.id)) state = 'switched_off';
    else if (lastEvent) { if (lastEvent.ok) state = Number(lastEvent.ms) > SLOW_MS ? 'slow' : 'answering'; else { state = 'not_answering'; problem = lastEvent.known ? lastEvent.problem : plain(lastEvent.problem); } }
    if (state === 'slow') problem = WORDS.slow;
    let held = {}; try { held = keys() || {}; } catch { held = {}; }
    const keyName = r.key || null, needsLogin = LOGIN.has(r.id);
    return {
      id: r.id, name: r.name, state, last_ok_time: iso(lastOk), last_ms: Number.isFinite(lastMs) ? Math.round(lastMs) : null, last_problem: problem,
      kept: Math.max(0, Number(kept(r.id)) || 0), ttl_hours: r.ttl ? r.ttl / H : null,
      needs_key: !!keyName, key_set: keyName ? held[keyName] === true : false, needs_login: needsLogin, login_set: needsLogin ? (held.earthdata === true || !!loginSet()) : false,
      checked_at: iso(chk?.at || run.last_time || null), can_check: !!r.ask && !switchedOff.has(r.id),
    };
  }
  const list = () => rows().map(entry);

  // one small real ask, 20 s at most, never two at the same time (one queue for all), never more often than every ten minutes for one service
  async function probe(r) {
    const started = now(); let result;
    try {
      const res = await doFetch(typeof r.ask === 'function' ? r.ask() : r.ask, { method: r.head ? 'HEAD' : 'GET', redirect: 'follow', signal: AbortSignal.timeout(CHECK_LIMIT_MS), headers: { 'user-agent': 'Crophalo-status-check', accept: '*/*' } });
      try { await res.body?.cancel?.(); } catch { /* the body is never read: only the status counts */ }
      result = res.status >= 200 && res.status < 400 ? { ok: true } : { ok: false, problem: byStatus(res.status), known: true };
    } catch (e) { result = { ok: false, problem: /timeout|abort/i.test(`${e?.name} ${e?.message}`) ? WORDS.timeout : WORDS.none, known: true }; }
    const ms = now() - started, before = checks.get(r.id);
    checks.set(r.id, { at: started, ok: result.ok, ms, problem: result.problem, known: true, lastOkAt: result.ok ? started : before?.lastOkAt || 0 });
  }
  function check(ids) {   // resolves with the list after the asks that were due; a service asked in the last ten minutes keeps its answer
    const want = new Set(Array.isArray(ids) && ids.length ? ids.map(String) : rows().map(r => r.id));
    const work = queue.then(async () => {
      for (const r of rows()) { if (!want.has(r.id) || !r.ask || switchedOff.has(r.id)) continue; const last = checks.get(r.id); if (last && now() - last.at < CHECK_EVERY_MS) continue; await probe(r); }
      return list();
    });
    queue = work.catch(() => {}); return work;
  }
  return { list, check, ids: () => rows().map(r => r.id) };
}
