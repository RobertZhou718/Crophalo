// Crophalo's "API connections" page (the service status): the live checks of every data service the app uses, plus timings measured in this browser. A head with the Admin chip, the title and its three controls
// (Auto-check every minute, Export log, Check now), three tabs (Services, Live data, Recent requests), four tiles and the table of services: status as a dot AND a word, last check, average, 95th percentile, share that answered, the last times and the newest data date.
// It reads the server's /api/sources and asks /api/sources/check; the timings come from this browser (js/api-timings.js). It shows NO key, NO password, NO token, NO path and NO server word, ever: a key is only "set" or "not set"; it is read-only (its only action is checking). Every word from the server is put on the page as plain text, and only the fields named here are shown. Pure: cleanSources(), adminHTML(), the words and the figures. loadSources(), checkSources() and liveChecks() ask; renderAdminPage() draws and listens.
// Checked by scripts/test_pages.mjs (the answer rebuilt from known parts, a hostile answer, escaping, the states, the tiles, the figures) and scripts/e2e_pages.mjs.
import { esc } from './words.js';
import { SOURCES } from './sources.js';
import './sources.more.js';
import { pageStyle } from './page-style.js';
import { readLog, record, entryOf, byService, statsOf, median, exportOf } from './api-timings.js';
import { apiUrl } from './api.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const text = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
const when = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && Number.isFinite(Date.parse(v)) ? v : '';
export const ADMIN_DOWN = 'The server did not answer, so the list of services could not be read.';
export const STATES = Object.freeze({ answering: 'Answering', slow: 'Slow', not_answering: 'Not answering', not_asked_yet: 'Not asked yet', switched_off: 'Switched off' });
const flag = v => (v === true ? true : v === false ? false : null);
// Nothing private on the page, whatever the server sends: a folder path, the query of an address and anything long enough to be a key are taken out of a problem line.
const scrub = t => t.replace(/(?:[A-Za-z]:\\|~\/|\/(?:Users|home|private|var|tmp|opt|etc|root)\/)[^\s'"]*/g, 'a file on the server').replace(/(https?:\/\/[^\s?#'"]+)[?#][^\s'"]*/g, '$1').replace(/\b(?=[A-Za-z0-9_\-]*\d)[A-Za-z0-9_\-]{24,}\b/g, '…').replace(/\b(key|token|password|secret|apikey|api_key)\s*[=:]\s*\S+/gi, '$1 hidden');
// The older, shorter answer gives the server's own error text (last_error). It is said in plain words; one that is not known is said in one general line, never as program words.
const PLAIN = [[/time(d)?\s*out|ETIMEDOUT|took too long|did not answer in time/i, 'It took too long to answer.'], [/\b(401|403)\b|unauthori[sz]ed|forbidden|denied/i, 'It refused the request. Its key or login may be missing.'],
  [/\b429\b|too many/i, 'It asked us to wait before asking again.'], [/\b404\b|not found/i, 'It had no data for this request.'], [/\b5\d\d\b|server error|unavailable/i, 'It had a problem on its own side.'],
  [/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network|offline|could not (be )?reach|fetch failed/i, 'It could not be reached.']];
const plainProblem = t => !t ? '' : (PLAIN.find(([re]) => re.test(t))?.[1] ?? 'It gave an error the last time it was asked.');
export const OLDER_SHAPE = 'This server sends a shorter list, so it does not say which services need a key.';

// The server's answer rebuilt from known parts: [{ id, name, state, lastOk, ms, problem, kept, ttlHours, needsKey, keySet, needsLogin, loginSet, checkedAt }] or null.
// The older, shorter answer (id, name, last_ok_time, last_ms, last_error, cache_items, ttl_hours) still gives a card: its state is worked out from what it says, and the page says the list is shorter.
export function cleanSources(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 80).filter(r => r && typeof r === 'object' && text(r.id, 40)).map(r => {
    const older = !('state' in r), lastOk = when(r.last_ok_time), problem = scrub(older ? plainProblem(text(r.last_error, 400)) : text(r.last_problem ?? r.last_error, 200)), kept = fin(r.kept) ? r.kept : fin(r.cache_items) ? r.cache_items : 0;
    const given = Object.hasOwn(STATES, r.state) ? r.state : lastOk ? (problem ? 'slow' : 'answering') : problem ? 'not_answering' : 'not_asked_yet';
    return { id: text(r.id, 40), name: text(r.name, 80) || text(r.id, 40), state: given, lastOk, ms: fin(r.last_ms) && r.last_ms >= 0 && r.last_ms < 1e7 ? Math.round(r.last_ms) : null, problem,
      kept: Math.max(0, Math.round(kept)), ttlHours: fin(r.ttl_hours) && r.ttl_hours > 0 ? Math.round(r.ttl_hours * 10) / 10 : null,
      needsKey: r.needs_key === true, keySet: flag(r.key_set), needsLogin: r.needs_login === true, loginSet: flag(r.login_set), checkedAt: when(r.checked_at), lastTime: when(r.last_time), dataDate: /^\d{4}-\d{2}-\d{2}/.test(String(r.data_date ?? '')) ? String(r.data_date).slice(0, 10) : '', canCheck: r.can_check !== false, older };
  });
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], two = n => String(n).padStart(2, '0');
// "14:02" today, "14 Nov, 14:02" another day, in the visitor's own time
export function whenWords(iso, now = Date.now()) {
  if (!iso) return 'Not yet';
  const d = new Date(iso), t = new Date(now), time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  return d.toDateString() === t.toDateString() ? time : `${d.getDate()} ${MON[d.getMonth()]}, ${time}`;
}
export const msWords = ms => ms === null || ms === undefined ? 'Not yet' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(/\.0$/, '')} s`;
const DOT = { answering: 'ok', slow: 'warn', not_answering: 'bad', not_asked_yet: 'idle', switched_off: 'idle', no_check: 'idle' };
export const lastLine = (r, now) => r.lastOk ? `Last answered ${whenWords(r.lastOk, now)}${r.ms !== null ? `, in ${msWords(r.ms)}` : ''}` : r.state === 'switched_off' ? 'Switched off on this server' : r.state === 'not_asked_yet' ? 'Not asked yet' : 'Has not answered yet';
export const keyLine = r => (r.needsKey ? `Needs a key: ${r.keySet ? 'set' : 'not set'}` : '') || (r.needsLogin ? `Needs a login: ${r.loginSet ? 'set' : 'not set'}` : '');

// ---- the words of the table: a state is a dot AND a word, never colour alone
export const STATUS_WORDS = Object.freeze({ answering: 'Online', slow: 'Slow', not_answering: 'Down', not_asked_yet: 'Checking', switched_off: 'Not set up', no_check: 'Not checked here' });
// A service whose key or login is needed and not set is "Not set up", whatever else it says.
export const statusOf = r => (r.needsKey && r.keySet === false) || (r.needsLogin && r.loginSet === false) ? 'switched_off' : r.state;
// What each service is for, in one line, and the host it is asked at (small, mono). A service the table does not know shows its name and no line: nothing is made up.
const INFO = { power: ['Daily weather since 2001', 'power.larc.nasa.gov'], smaproot: ['Soil moisture round the roots', 'nsidc.org'], smap: ['Soil moisture round the roots', 'nsidc.org'], imergrain: ['Satellite rain, day by day', 'gpm.nasa.gov'], gracecell: ['Water stored under the ground', 'grace.jpl.nasa.gov'],
  ecopass: ['Ground temperature seen from space', 'lpdaac.usgs.gov'], hlsndvi: ['How green the land looked', 'lpdaac.usgs.gov'], hlsbox: ['Weak spots inside the field', 'lpdaac.usgs.gov'], ndvihist: ['How green each season was, since 2001', 'gibs.earthdata.nasa.gov'], cropsnear: ['What farms around you grow', 'nass.usda.gov'], crophist: ['What the field grew in past years', 'nass.usda.gov'],
  soilfield: ['The soil of the field', 'sdmdataaccess.sc.egov.usda.gov'], dem: ['The height of the land', 'elevation-tiles-prod.s3.amazonaws.com'], heights: ['The height of the land', 'elevation-tiles-prod.s3.amazonaws.com'], osm: ['Roads, water and buildings', 'overpass.private.coffee'], osmextra: ['Fences, power lines and silos', 'overpass.private.coffee'],
  prices: ['World crop prices, month by month', 'api.worldbank.org'], faostat: ['World crop prices', 'fenixservices.fao.org'], drought: ['The US drought map', 'droughtmonitor.unl.edu'], firms: ['Fires and hot spots', 'firms.modaps.eosdis.nasa.gov'], forecast: ['The forecast for the next days', 'api.open-meteo.com'], 'openmeteo-forecast': ['The forecast for the next days', 'api.open-meteo.com'], 'openmeteo-archive': ['Weather record of past years', 'archive-api.open-meteo.com'], frankfurter: ['Exchange rates between currencies', 'api.frankfurter.dev'], nominatim: ['Names of towns and places', 'nominatim.openstreetmap.org'], openfreemap: ['Map names and outlines', 'tiles.openfreemap.org'],
  'terrain-tiles': ['The height of the land, for the 3D field', 'elevation-tiles-prod.s3.amazonaws.com'], orbits: ['Where the satellites are now', 'celestrak.org'], soilgrids: ['The soil anywhere in the world', 'rest.isric.org'], gibs: ['Satellite pictures of the Earth', 'gibs.earthdata.nasa.gov'], mnfield: ['Crop prices at the market', 'marsapi.ams.usda.gov'] };
// Services the app uses that its sources table does not list, and which source note a live check stands for. The list of rows is the server's checks plus every other outside source of the app's own sources table, so it cannot fall behind.
// OpenET, USDA NASS Quick Stats, USDA Market News and the US soil survey need a key or a login on the server: a row for them is the server's own (with its "set" / "not set"), never a hand-made one.
const EXTRA = [['cmr', 'NASA Earthdata catalogue', 'Finds the newest satellite files', 'cmr.earthdata.nasa.gov'], ['eoxtiles', 'Sentinel-2 cloudless map tiles', 'The satellite picture under the 3D field', 'tiles.maps.eox.at'], ['usgsphoto', 'USGS aerial photographs', 'Sharp photos of the land in the United States', 'basemap.nationalmap.gov'],
  ['orbits', 'CelesTrak orbits', 'Where the satellites are now', 'celestrak.org'], ['gibs', 'NASA GIBS satellite images', 'The Earth picture on the home page and the layers', 'gibs.earthdata.nasa.gov']];
// source note key -> the server's service id(s) that stand for it (the ids of /api/sources); a note with one of them present gets no second row
const ALIAS = { power: ['power'], gpm: ['imergrain'], smap: ['smaproot'], grace: ['gracecell'], ecostress: ['ecopass'], hls: ['hlsndvi', 'hlsbox'], modis: ['ndvihist'], cdl: ['cropsnear'], aci: ['cropsnear'], mapspam: ['cropsnear'], ssurgo: ['soilfield'], ams: ['mnfield'], fao: ['faostat'], worldbank: ['prices'], forecast: ['openmeteo-forecast'], era5: ['openmeteo-archive'], era5land: ['openmeteo-archive'],
  osm: ['nominatim', 'osm', 'osmextra'], gibs: ['gibs'], soilgrids: ['soilgrids'], ecb: ['frankfurter'], openfreemap: ['openfreemap'], usgs3dep: ['terrain-tiles', 'dem'], glo30: ['terrain-tiles', 'dem'], nasadem: ['terrain-tiles', 'dem'], hrdem: ['terrain-tiles', 'dem'] };
const NOT_SERVICES = new Set(['rules', 'omafra', 'erosion', 'dem', 'ssurgo', 'ams', 'esri', 'gbif', 'usdm', 'merra2']);   // ssurgo and ams (the US soil survey, the USDA cash bids): their row is the server's own, with its key "set" / "not set", never a hand-made one   // not services the app asks: its own rules, written guides, and notes of sources it does not call itself (Esri, GBIF, the drought map; MERRA-2 is read through NASA POWER). A row for a service nothing calls would be a false claim.   // Crophalo's own rules and written guides are not data services
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const firstLine = t => { const one = String(t ?? '').split(/[:.,(]/)[0].trim(); return one.length > 90 ? `${one.slice(0, 87).trim()}…` : one; };
const refRow = (id, name, use, hostName) => ({ id, name, state: 'no_check', lastOk: '', ms: null, problem: '', kept: 0, ttlHours: null, needsKey: false, keySet: null, needsLogin: false, loginSet: null, checkedAt: '', lastTime: '', dataDate: '', canCheck: false, ref: { use, host: hostName } });
export function withEverySource(rows) {
  if (!Array.isArray(rows)) return rows;
  const have = new Set(rows.map(r => r.id)), covered = new Set(Object.values(ALIAS).flat().filter(id => have.has(id))), out = [...rows];
  for (const [key, n] of Object.entries(SOURCES)) { if (NOT_SERVICES.has(key) || ALIAS[key]?.some(id => have.has(id)) || n.org === 'Crophalo') continue; out.push(refRow(`src-${key}`, n.name, firstLine(n.what), host(n.url))); }
  for (const [id, name, use, h] of EXTRA) if (!have.has(id) && !covered.has(id) && !out.some(r => r.ref?.host === h)) out.push(refRow(id, name, use, h));
  return out;
}
export const infoOf = (id, r) => r?.ref ? { use: r.ref.use, host: r.ref.host } : { use: INFO[id]?.[0] ?? '', host: INFO[id]?.[1] ?? '' };
const MONTHS3 = MON;
// "Nov 14, 2026" from a date or a stamp: never from anything that is not a date
export const dateWords = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '')); return m && +m[2] >= 1 && +m[2] <= 12 ? `${MONTHS3[+m[2] - 1]} ${+m[3]}, ${m[1]}` : ''; };

// The four tiles' figures, from the rows and what is known of each service's data date.
export function tilesOf(rows, live = {}, now = Date.now()) {
  const list = (rows ?? []).filter(r => r.state !== 'no_check'), states = list.map(statusOf), online = states.filter(s => s === 'answering' || s === 'slow').length, down = states.filter(s => s === 'not_answering').length, checking = states.filter(s => s === 'not_asked_yet').length;
  const ms = list.filter(r => r.ms !== null).map(r => r.ms), slowest = list.filter(r => r.ms !== null).sort((a, b) => b.ms - a.ms)[0] ?? null;
  const dated = Object.entries(live).filter(([, v]) => v?.date && Number.isFinite(Date.parse(String(v.date).slice(0, 10)))), age = d => Math.floor((now - Date.parse(String(d).slice(0, 10) + 'T00:00:00Z')) / 864e5);
  const old = dated.filter(([, v]) => age(v.date) > 14).length;
  return { online, total: list.length, checking, down, notSet: states.filter(s => s === 'switched_off').length, median: median(ms), slowest, datasets: dated.length, old };
}

// ---- the page
const tile = (label, big, sub) => `<div class="adm-tile"><p class="adm-tl">${esc(label)}</p><p class="adm-tb">${big}</p><p class="adm-ts">${esc(sub)}</p></div>`;
export function tilesHTML(t) {
  return `<div class="adm-tiles">${tile('Services online', `${t.online}<span class="adm-of"> / ${t.total}</span>`, `${t.checking} still checking · ${t.down} down${t.notSet ? ` · ${t.notSet} not set up` : ''}`)}
    ${tile('Median response', t.median === null ? '—' : esc(msWords(t.median)), t.median === null ? 'Not measured yet' : 'Of the last check of each service')}
    ${tile('Slowest service', t.slowest ? esc(msWords(t.slowest.ms)) : '—', t.slowest ? t.slowest.name : 'Not measured yet')}
    ${tile('Data freshness', t.datasets ? `${t.old} getting old` : '—', t.datasets ? `${t.datasets} datasets compared with today` : 'Open Live data to compare')}</div>`;
}
const recentLine = list => {
  if (!list?.length) return '<span class="adm-none">—</span>';
  const lo = Math.min(...list), hi = Math.max(...list), span = Math.max(1, hi - lo), W = 84, H = 26, x = k => list.length === 1 ? W / 2 : 3 + k * (W - 6) / (list.length - 1), y = v => H - 3 - (v - lo) / span * (H - 6);
  const label = `The last ${list.length} time${list.length === 1 ? '' : 's'}, from ${msWords(lo)} to ${msWords(hi)}`;
  return `<svg class="adm-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${list.length === 1 ? `<circle cx="${x(0)}" cy="${H / 2}" r="3"/>` : `<polyline points="${list.map((v, k) => `${x(k).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`}</svg>`;
};
export const BROWSER_READ = 'Read by your browser, not by the Crophalo server';
export const BROWSER_GROUP = 'Read straight from your browser';
const DATA_WORD = { power: 'Weather data', smaproot: 'Soil moisture data', imergrain: 'Rain data', forecast: 'Forecast', prices: 'Price data', ndvihist: 'Greenness data', hlsndvi: 'Greenness data' };
const pct = v => (v === null ? '—' : `${Math.round(v * 100)}%`);
// A row of the table: what the service is, then its figures. Each cell carries its column name for the phone, where the table becomes cards.
function serviceRow(r, st, live, now) {
  const info = infoOf(r.id, r), stt = statusOf(r), lv = live?.[r.id], when_ = r.dataDate || lv?.date || '', detail = when_ ? `${DATA_WORD[r.id] ?? 'Data'} through ${dateWords(when_)}` : '';
  const answered = st.calls ? `${pct(st.success)} <small>(${st.ok} of ${st.calls})</small>` : '<span class="adm-none">—</span>';
  return `<tr data-state="${stt}"><th scope="row" class="adm-svc" data-label="Service"><b>${esc(r.name)}</b>${info.use ? `<small>${esc(info.use)}</small>` : ''}${info.host ? `<code>${esc(info.host)}</code>` : ''}</th>
    <td data-label="Status"><span class="adm-st is-${DOT[stt]}"><i class="ad-dot ${DOT[stt]}" aria-hidden="true"></i>${esc(STATUS_WORDS[stt])}</span>${r.ref ? `<small class="adm-help">${esc(BROWSER_READ)}</small>` : ''}</td>
    <td data-label="Last check">${r.ref ? '<span class="adm-none">—</span>' : esc(whenWords(r.checkedAt || r.lastTime || r.lastOk, now))}</td><td data-label="Average">${st.avg === null ? '<span class="adm-none">—</span>' : esc(msWords(st.avg))}</td><td data-label="95th pct">${st.p95 === null ? '<span class="adm-none">—</span>' : esc(msWords(st.p95))}</td>
    <td data-label="Success">${answered}</td><td data-label="Recent">${recentLine(st.recent)}</td><td data-label="Detail">${detail ? esc(detail) : '<span class="adm-none">—</span>'}</td></tr>`;
}
export const skeletonRows = n => Array.from({ length: n }, () => `<tr class="adm-sk" aria-hidden="true">${'<td><i class="sk"></i></td>'.repeat(8)}</tr>`).join('');
const TABS = [['services', 'Services'], ['live', 'Live data'], ['recent', 'Recent requests']];
const tabsHTML = tab => `<div class="pg-tabs" role="tablist" aria-label="Parts of the page">${TABS.map(([id, t]) => `<button type="button" role="tab" class="tab" id="adtab-${id}" aria-selected="${id === tab}" aria-controls="adpanel" tabindex="${id === tab ? 0 : -1}" data-adtab="${id}">${esc(t)}</button>`).join('')}</div>`;
const TABLE_HEAD = '<thead><tr><th scope="col">Service</th><th scope="col">Status</th><th scope="col">Last check</th><th scope="col">Average</th><th scope="col">95th pct</th><th scope="col">Success</th><th scope="col">Recent</th><th scope="col">Detail</th></tr></thead>';
// the whole page: rows undefined = being read, null = the server did not answer; busy = the check is running
// opts: { busy, now, tab, log (the calls measured here), live ({ id: { ok, date, ms } } or undefined), liveBusy }
export function adminHTML(rows, { busy = false, now = Date.now(), tab = 'services', log = [], live, liveBusy = false } = {}) {
  const lead = `<p class="lead adm-lead">Live checks against every service Crophalo uses, plus timings measured during normal use in this browser.</p>`;
  const say = '<p class="cap" id="adSay" role="status" aria-live="polite"></p>';
  const wait = '<p class="sr" role="status" aria-live="polite">Reading the list of services…</p>';
  const table = body => `<div class="adm-tablewrap"><table class="adm-table" aria-label="Services">${TABLE_HEAD}<tbody>${body}</tbody></table></div>`;
  const tabsAndBody = body => `${tabsHTML(tab)}<div id="adpanel" role="tabpanel" aria-labelledby="adtab-${tab}" tabindex="0">${body}</div>`;
  if (rows === undefined) return `${lead}${wait}${tilesHTML({ online: 0, total: 0, checking: 0, down: 0, median: null, slowest: null, datasets: 0, old: 0 }).replace(/<p class="adm-tb">[^<]*(<span[^<]*<\/span>)?<\/p>/g, '<p class="adm-tb"><i class="sk num"></i></p>')}${tabsAndBody(table(skeletonRows(6)))}`;
  if (!rows) return `${lead}<p class="rv-notread"><b>${esc(ADMIN_DOWN)}</b> Try again in a moment.</p>`;
  if (!rows.length) return `${lead}<p class="cap">The server lists no services.</p>`;
  rows = withEverySource(rows);
  const per = byService(log), t = tilesOf(rows, live ?? {}, now);
  let panel;
  if (tab === 'live') {
    panel = liveBusy && !live ? `<div class="adm-tablewrap"><table class="adm-table adm-live" aria-label="Live data"><tbody>${skeletonRows(5)}</tbody></table></div>` : live ? `<div class="adm-tablewrap"><table class="adm-table adm-live" aria-label="Live data"><thead><tr><th scope="col">Service</th><th scope="col">Answer for a test place</th><th scope="col">Took</th><th scope="col">Newest data</th></tr></thead><tbody>${rows.map(r => { const v = live[r.id]; return `<tr><th scope="row" class="adm-svc" data-label="Service"><b>${esc(r.name)}</b></th><td data-label="Answer">${v ? (v.ok ? '<span class="adm-st is-ok"><i class="ad-dot ok" aria-hidden="true"></i>Answered</span>' : '<span class="adm-st is-bad"><i class="ad-dot bad" aria-hidden="true"></i>Did not answer</span>') : `<span class="adm-none">${r.ref ? 'No live check' : 'Not asked'}</span>`}</td><td data-label="Took">${v ? esc(msWords(v.ms)) : '—'}</td><td data-label="Newest data">${v?.date ? esc(dateWords(v.date)) : '<span class="adm-none">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="cap">Press Check now to ask every service for a test place and see how fresh its newest data is.</p>';
  } else if (tab === 'recent') {
    const last = log.slice(-40).reverse();
    panel = last.length ? `<div class="adm-tablewrap"><table class="adm-table adm-recent" aria-label="Recent requests"><thead><tr><th scope="col">Time</th><th scope="col">Service</th><th scope="col">Took</th><th scope="col">Result</th></tr></thead><tbody>${last.map(e => { const name = rows.find(r => r.id === e.id)?.name ?? e.id; return `<tr><td data-label="Time">${esc(whenWords(new Date(e.t).toISOString(), now))}</td><th scope="row" class="adm-svc" data-label="Service"><b>${esc(name)}</b></th><td data-label="Took">${esc(msWords(e.ms))}</td><td data-label="Result"><span class="adm-st is-${e.ok ? 'ok' : 'bad'}"><i class="ad-dot ${e.ok ? 'ok' : 'bad'}" aria-hidden="true"></i>${e.ok ? 'Answered' : 'Failed'}</span></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="cap">No requests have been measured in this browser yet. Open a report and they appear here.</p>';
  } else panel = table(busy ? skeletonRows(Math.min(8, rows.length)) : (() => { const one = r => serviceRow(r, statsOf(per[r.id]), live, now), checked = rows.filter(r => !r.ref), direct = rows.filter(r => r.ref); return checked.map(one).join('') + (direct.length ? `<tr class="adm-group"><th scope="rowgroup" colspan="8">${esc(BROWSER_GROUP)}</th></tr>${direct.map(one).join('')}` : ''); })());
  const older = rows.filter(r => !r.ref).every(r => r.older) ? `<p class="cap" id="adOlder">${esc(OLDER_SHAPE)}</p>` : '';   // a server that sends the older, shorter list: one plain line says so
  return `${lead}${older}${tilesHTML(t)}${tabsAndBody(panel)}${say}`;
}
export async function loadSources(get = globalThis.fetch?.bind(globalThis)) {
  if (typeof get !== 'function') return null;
  try { return cleanSources(await (await get(apiUrl('/api/sources'))).json()); } catch { return null; }
}
export async function checkSources(post = globalThis.fetch?.bind(globalThis)) {
  if (typeof post !== 'function') return null;
  try { return cleanSources(await (await post(apiUrl('/api/sources/check'), { method: 'POST' })).json()); } catch { return null; }
}
// Ask every service for a test place and note only: did it answer, how long, and the newest data date in the answer. The answer's words are never kept or shown.
const LIVE_IDS = new Set(['smaproot', 'cropsnear', 'crophist', 'imergrain', 'gracecell', 'prices', 'faostat', 'firms', 'orbits']);   // the lookups the Live data tab asks itself: the quick ones only
export const TEST_PLACE = Object.freeze({ lat: 41.1795, lon: -96.4398 });   // the Mead demo field
export async function liveChecks(rows, get = globalThis.fetch?.bind(globalThis)) {
  const out = {};
  if (typeof get !== 'function') return out;
  for (const r of rows ?? []) {   // one at a time: a burst of every lookup at once would fill the data server's few lanes and slow every farmer's report
    const started = performance.now();
    try {
      const res = await get(apiUrl(`/api/${encodeURIComponent(r.id)}?lat=${TEST_PLACE.lat}&lon=${TEST_PLACE.lon}&country=US`)), json = await res.json().catch(() => null), date = [json?.data_date, json?.newest_date, json?.last_date].find(v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) ?? '';
      out[r.id] = { ok: res.ok && json?.ok !== false, ms: Math.round(performance.now() - started), date: date.slice(0, 10) };
    } catch { out[r.id] = { ok: false, ms: Math.round(performance.now() - started), date: '' }; }
  }
  return out;
}

// Draw the page into a node and listen to its controls.
const AUTO_KEY = 'crophalo.admin.auto';
export async function renderAdminPage(root) {
  if (!root) return;
  pageStyle('css/pages.css', root);
  const h1 = root.querySelector('h1, .adm-title');   // the page's own title, or the title of the Settings tab it sits in
  if (h1) h1.textContent = 'API connections';
  let bar = root.querySelector('.adm-head');
  if (!bar) {
    bar = document.createElement('div'); bar.className = 'adm-head';
    bar.innerHTML = `<div class="adm-id"><span class="chip adm-chip">Admin</span></div><div class="adm-act"><label class="adm-auto"><span id="adAutoLab">Auto-check every minute</span><button type="button" role="switch" aria-checked="false" aria-labelledby="adAutoLab" id="adAuto" class="adm-sw"><i aria-hidden="true"></i></button></label><button type="button" class="btn" id="adExport">Export log</button><button type="button" class="btn primary" id="adCheck">Check now</button></div>`;
    if (h1) { bar.querySelector('.adm-id').append(h1); } root.prepend(bar);
  }
  const body = root.querySelector('#adminBody') || root.appendChild(Object.assign(document.createElement('div'), { id: 'adminBody' }));
  let rows, tab = 'services', live, busy = false, liveBusy = false, timer = 0;
  const checkBtn = bar.querySelector('#adCheck'), auto = bar.querySelector('#adAuto');
  const draw = () => { body.innerHTML = adminHTML(rows, { busy, tab, log: readLog(), live, liveBusy }); checkBtn.textContent = busy ? 'Checking…' : 'Check now'; checkBtn.disabled = busy; checkBtn.setAttribute('aria-busy', String(busy)); };
  const noteChecks = list => { for (const r of list ?? []) if (r.ms !== null) record(entryOf({ path: `/api/${r.id}`, ms: r.ms, status: statusOf(r) === 'not_answering' ? 0 : 200, ok: statusOf(r) !== 'not_answering' })); };
  async function check() {
    if (busy) return; busy = true; draw();
    const next = await checkSources(); if (next) { rows = next; noteChecks(next); } busy = false; draw();
    liveBusy = false;
    const say = body.querySelector('#adSay'); if (say) say.textContent = next ? 'Checked just now.' : 'The check could not be made right now.';
  }
  const setAuto = on => { auto.setAttribute('aria-checked', String(on)); try { localStorage.setItem(AUTO_KEY, on ? '1' : '0'); } catch { /* none */ } clearInterval(timer); if (on) timer = setInterval(() => { if (!document.hidden && !document.getElementById('view-admin')?.hidden) check(); }, 60000); };
  draw(); rows = await loadSources(); draw();
  if (bar.dataset.bound) return; bar.dataset.bound = '1';
  checkBtn.addEventListener('click', check);
  auto.addEventListener('click', () => setAuto(auto.getAttribute('aria-checked') !== 'true'));
  try { if (localStorage.getItem(AUTO_KEY) === '1') setAuto(true); } catch { /* none */ }
  bar.querySelector('#adExport').addEventListener('click', () => {
    const blob = new Blob([exportOf(readLog(), rows)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = Object.assign(document.createElement('a'), { href: url, download: `crophalo-api-log-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  body.addEventListener('click', event => { const t = event.target.closest('[data-adtab]'); if (!t) return; tab = t.dataset.adtab; draw(); body.querySelector(`#adtab-${tab}`)?.focus();
    if (tab === 'live' && !live && !liveBusy && rows?.length) { liveBusy = true; draw(); liveChecks(rows.filter(r => r.can_check !== false && LIVE_IDS.has(r.id))).then(got => { live = got; liveBusy = false; draw(); }); } });
  body.addEventListener('keydown', event => { const t = event.target.closest('[role=tab]'); if (!t || !['ArrowRight', 'ArrowLeft'].includes(event.key)) return; const ids = TABS.map(x => x[0]), i = ids.indexOf(tab), next = ids[(i + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length]; event.preventDefault(); tab = next; draw(); body.querySelector(`#adtab-${tab}`)?.focus(); });
}
