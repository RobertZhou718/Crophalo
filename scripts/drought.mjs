// Crophalo's US Drought Monitor route: the county's drought weeks for one season, for one line of the season weather record. United States only.
// The farmer's position goes to this server, which asks the US FCC for the county; the answer holds the county, never the position, and the position is
// not kept on disk either: a cache file is named by a hash of the rounded point. Nothing here starts by itself: serve.mjs calls createDrought() and handle().
// Checked by scripts/test_statement.mjs (the route against a local stand-in for the two services: parameters, the county cache, the weeks cache, a failure, outside the US).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LIMITS = { maxDays: 400, countyMs: 30 * 864e5, weeksMs: 24 * 36e5, sweepMs: 60 * 864e5, timeoutMs: 30e3, perMinute: 30 };
const USDM_FIRST = [2000, 1, 4], FIRST_DAY = USDM_FIRST.map((n, i) => String(n).padStart(i ? 2 : 4, '0')).join('-');   // the Drought Monitor's first week (4 January of its first year)
const BAD_PLACE = 'lat and lon are required (decimal degrees)', BAD_DATES = 'from and to must be dates written YYYYMMDD';
const BEFORE = 'from must come before to, and to cannot be in the future (the Drought Monitor starts in 2000)', TOO_LONG = `At most ${LIMITS.maxDays} days can be read at once`;
const ONLY_US = 'The US Drought Monitor covers only the United States', COULD_NOT = 'The US Drought Monitor could not be read just now';
// These boxes are coarse and only spare the FCC a question for places that are plainly elsewhere; southern Canada lies inside the lower-48 box, and the FCC's answer (no county) decides it.
const US_BOXES = [[24.3, 49.6, -125.1, -66.8], [51, 71.6, -179.2, -129.9], [51, 52.9, 172, 180], [18.7, 22.4, -160.4, -154.7], [17.8, 18.7, -67.4, -65.1]];   // the lower 48, Alaska (and its western Aleutians), Hawaii, Puerto Rico
export const inUS = (lat, lon) => US_BOXES.some(([a, b, c, d]) => lat >= a && lat <= b && lon >= c && lon <= d);
const dayOf = text => /^\d{8}$/.test(text ?? '') ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}` : null;
const real = day => { if (!day) return false; const t = Date.parse(day + 'T00:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day; };
const us = day => `${day.slice(5, 7)}/${day.slice(8)}/${day.slice(0, 4)}`;   // the service wants MM/DD/YYYY

// The USDM answer is a table of text: MapDate,FIPS,County,State,None,D0,D1,D2,D3,D4,ValidStart,ValidEnd,StatisticFormatID
export function parseWeeks(csv) {
  const lines = String(csv ?? '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map(h => h.trim().toLowerCase()), col = k => head.indexOf(k);
  const [dt, no, d0, d1, d2, d3, d4] = ['mapdate', 'none', 'd0', 'd1', 'd2', 'd3', 'd4'].map(col);
  if (dt < 0 || d0 < 0 || d4 < 0) return [];
  const pct = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null; };
  return lines.slice(1).map(l => l.split(',')).map(c => ({ date: dayOf(c[dt]?.trim()), none: pct(c[no]), d0: pct(c[d0]), d1: pct(c[d1]), d2: pct(c[d2]), d3: pct(c[d3]), d4: pct(c[d4]) }))
    .filter(w => w.date && real(w.date) && [w.d0, w.d1, w.d2, w.d3, w.d4].every(v => v !== null)).sort((a, b) => a.date < b.date ? -1 : 1);
}

export function createDrought({ dir, env = process.env, now = () => Date.now(), fetchImpl = globalThis.fetch } = {}) {
  const folder = path.join(dir, 'drought'), fcc = env.FW_FCC_UPSTREAM || 'https://geo.fcc.gov', usdm = env.FW_DROUGHT_UPSTREAM || 'https://usdmdataservices.unl.edu';
  const running = new Map(), hits = new Map();
  const key = (...parts) => crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
  function read(file, ttl) { try { const kept = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8')); if (Number.isFinite(kept?.at) && now() - kept.at >= 0 && now() - kept.at < ttl) return kept.v; } catch { /* none or too old */ } return null; }   // the time it was kept is in the file, so the age does not depend on the file system's clock
  function write(file, value) {
    try {
      fs.mkdirSync(folder, { recursive: true, mode: 0o700 }); const f = path.join(folder, file), tmp = `${f}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ at: now(), v: value }), { mode: 0o600 }); fs.renameSync(tmp, f);
      if (Math.random() < 0.05) for (const name of fs.readdirSync(folder)) { try { if (now() - fs.statSync(path.join(folder, name)).mtimeMs > LIMITS.sweepMs) fs.rmSync(path.join(folder, name)); } catch { /* it was already gone */ } }
    } catch { /* a read-only folder costs only the saving */ }
  }
  const once = (id, make) => { if (running.has(id)) return running.get(id); const p = make().finally(() => running.delete(id)); running.set(id, p); return p; };
  const get = async (url, accept) => { const res = await fetchImpl(url, { headers: { accept }, signal: AbortSignal.timeout(LIMITS.timeoutMs), redirect: 'error' }); if (!res.ok) throw new Error(`status ${res.status}`); return res.text(); };

  // The county of a point, kept 30 days under a hash of the point rounded to 0.001°; null when the FCC finds none.
  async function countyOf(lat, lon) {
    const id = `county_${key(lat.toFixed(3), lon.toFixed(3))}.json`, kept = read(id, LIMITS.countyMs);
    if (kept) return kept.none ? null : kept;
    return once(id, async () => {
      const body = JSON.parse(await get(`${fcc}/api/census/area?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&censusYear=2020&format=json`, 'application/json')), hit = body?.results?.[0];
      const fips = String(hit?.county_fips ?? '');
      if (!/^\d{5}$/.test(fips)) { write(id, { none: true }); return null; }
      const county = { fips, county: String(hit.county_name ?? '').slice(0, 80), state: String(hit.state_code ?? '').slice(0, 4) };
      write(id, county); return county;
    });
  }
  async function weeksOf(fips, from, to) {
    const id = `weeks_${fips}_${from}_${to}.json`, kept = read(id, LIMITS.weeksMs);
    if (kept) return { weeks: kept, cached: true };
    return once(id, async () => {
      const csv = await get(`${usdm}/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi=${fips}&startdate=${us(dayOf(from))}&enddate=${us(dayOf(to))}&statisticsType=1`, 'text/csv');
      const weeks = parseWeeks(csv); write(id, weeks); return { weeks, cached: false };
    });
  }
  function limited(address) {
    const t = now(), net = key(String(address ?? '').replace(/^::ffff:/, '').split(':').slice(0, 4).join(':')), list = (hits.get(net) ?? []).filter(x => t - x < 60e3);
    list.push(t); hits.set(net, list);
    return list.length > LIMITS.perMinute;
  }
  const reply = (res, status, json) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(json)); };
  // True when the request was for /api/drought: the answer has been sent.
  async function handle(req, res, url) {
    if (url.pathname !== '/api/drought') return false;
    if (req.method !== 'GET') { reply(res, 405, { ok: false, reason: 'Use GET' }); return true; }
    if (limited(req.socket?.remoteAddress)) { reply(res, 429, { ok: false, reason: 'Too many requests. Wait a moment and try again.' }); return true; }
    const q = url.searchParams, lat = Number(q.get('lat')), lon = Number(q.get('lon'));
    if (!q.get('lat') || !q.get('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { reply(res, 400, { ok: false, reason: BAD_PLACE }); return true; }
    const from = q.get('from'), to = q.get('to'), a = dayOf(from), b = dayOf(to);
    if (!real(a) || !real(b)) { reply(res, 400, { ok: false, reason: BAD_DATES }); return true; }
    const today = new Date(now()).toISOString().slice(0, 10);
    if (a >= b || a < FIRST_DAY || b > today) { reply(res, 400, { ok: false, reason: BEFORE }); return true; }
    if ((Date.parse(b) - Date.parse(a)) / 864e5 > LIMITS.maxDays) { reply(res, 400, { ok: false, reason: TOO_LONG }); return true; }
    if (!inUS(lat, lon)) { reply(res, 200, { ok: false, final: true, reason: ONLY_US }); return true; }
    try {
      const county = await countyOf(lat, lon);
      if (!county) { reply(res, 200, { ok: false, final: true, reason: ONLY_US }); return true; }
      const { weeks, cached } = await weeksOf(county.fips, from, to);
      reply(res, 200, { ok: true, county: county.county, state: county.state, fips: county.fips, weeks, cached, fetched: new Date(now()).toISOString() });
    } catch { reply(res, 502, { ok: false, reason: COULD_NOT }); }
    return true;
  }
  return { handle, countyOf, weeksOf, folder };
}
