// The offline suite for js/data.js and js/sources.js (and the plan of scripts/record_fixtures.mjs): the weather as the app reads it, and, joined to
// js/climate.js, each recorded place the whole way from the service's answer to its climate, its counts and its words, with a second pass by hand.
// It needs no internet and writes nothing: the services are played by the answers recorded in scripts/fixtures/ and by hand-made ones, with a pretend clock and a pretend cache.
// RULE: never loosen a check here to make it pass without a written farming reason beside the check itself. A failure means a farmer would see a wrong, stale or made-up weather figure: fix the module, not the test.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from '../js/data.js';
import * as K from '../js/climate.js';
import { SOURCES, SOURCE_FIELDS, sourceNote, sourceNotes, anyNasa } from '../js/sources.js';
import { FIXTURE_PLACES, FIXTURE_KINDS, fixtureName, recordPlan } from './record_fixtures.mjs';
import { NASA_UNKNOWNS, BACKUP_UNKNOWNS, strays, BAD_TEXT, FUTURE_WORD, whole, recordTexts, recordCounts, countsFit } from './weather_checks.mjs';

// ---- the counting
let passed = 0, failed = 0;
const ser = v => JSON.stringify(v, (_, x) => (typeof x === 'number' && !Number.isFinite(x) ? `<${x}>` : x === undefined ? '<undefined>' : x));   // NaN must not pass for null
const brief = v => { const s = typeof v === 'string' ? v : ser(v) ?? String(v); return s.length > 220 ? s.slice(0, 220) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, ser(got) === ser(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, by = 1e-9) => check(name, Math.abs(got - want) <= by, `got ${got}, wanted ${want}`);
const none = (name, list) => check(name, list.length === 0, `${list.length}: ${list.slice(0, 5).join(' · ')}`);
async function group(name, run) { try { await run(); } catch (e) { check(`${name}: ran to its end`, false, e?.stack?.split('\n').slice(0, 2).join(' ') || String(e)); } }
globalThis.fetch = () => { throw new Error('the offline suite reached for the network'); };   // every request in this suite must go to a pretend service

// ---- days, and the recorded answers
const DAY = 864e5, HOUR = 36e5, real = Number.isFinite, W = (...parts) => parts.join('');
const HERE = path.dirname(fileURLToPath(import.meta.url)), FIX = path.join(HERE, 'fixtures');
const ms8 = day => Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6)), day8 = ms => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
const dash = day => `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`, iso = ms => new Date(ms).toISOString().slice(0, 10);
const span = (first, last) => { const out = []; for (let t = ms8(first); t <= ms8(last); t += DAY) out.push(day8(t)); return out; };
const fixture = (kind, place) => JSON.parse(fs.readFileSync(path.join(FIX, fixtureName(kind, place)), 'utf8'));
const PLACES = Object.keys(FIXTURE_PLACES), spot = name => D.cleanPlace(FIXTURE_PLACES[name].lat, FIXTURE_PLACES[name].lon);
const recordedAt = answer => Date.parse(`${answer._recorded.date}T18:00:00Z`);   // the pretend clock for a recorded answer: the day it was recorded
const lastRealKey = (row, fill = -999) => Object.keys(row).filter(day => typeof row[day] === 'number' && row[day] !== fill).sort().pop() ?? null;   // read from the raw answer, without the module

// ---- hand-made answers
const DROP = Symbol('left out of the answer'), BASE = { T2M_MAX: 25, T2M_MIN: 12, PRECTOTCORR: 2, IMERG_PRECTOT: 3, GWETROOT: 0.5, EVLAND: 1.5 };
const UNITS = { T2M_MAX: 'C', T2M_MIN: 'C', PRECTOTCORR: 'mm/day', IMERG_PRECTOT: 'mm/day', GWETROOT: '1', EVLAND: 'mm/day' };
// A NASA POWER answer for (lat 10, lon 20) unless told otherwise. value(measure, day) may give a number, null, a text, DROP, or undefined for the usual value.
function powerAnswer({ lat = 10, lon = 20, elev = 300, first = '20010101', last, value = () => undefined, standard = 'UTC', units = UNITS } = {}) {
  const parameter = {}, days = span(first, last);
  for (const m of D.MEASURES) { parameter[m] = {}; for (const day of days) { const v = value(m, day); if (v !== DROP) parameter[m][day] = v === undefined ? BASE[m] : v; } }
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat, elev] }, properties: { parameter }, header: { fill_value: -999, time_standard: standard, start: first, end: last },
    parameters: Object.fromEntries(D.MEASURES.map(m => [m, { units: units[m] }])) };
}
// An Open-Meteo archive answer. value(name, day) as above; names are the service's own.
function archiveAnswer({ lat = 10, lon = 20, first = '20010101', last, names = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'], value = () => undefined, offset = 0 } = {}) {
  const usual = { temperature_2m_max: 24, temperature_2m_min: 11, precipitation_sum: 1.5 }, days = span(first, last), daily = { time: days.map(dash) };
  for (const name of names) daily[name] = days.map(day => { const v = value(name, day); return v === undefined ? usual[name] : v; });
  return { latitude: lat, longitude: lon, utc_offset_seconds: offset, timezone: 'GMT', elevation: 120, daily_units: Object.fromEntries([['time', 'iso8601'], ...names.map(n => [n, n.startsWith('temp') ? '°C' : 'mm'])]), daily };
}
// A forecast answer: 30 days back and 16 ahead of the field's own today, 24 hours each. edit(answer, indexOfToday) changes it.
function forecastAnswer({ now, offset = 0, edit = () => {} }) {
  const today = Date.parse(iso(now + offset * 1000)), dates = Array.from({ length: 46 }, (_, i) => iso(today + (i - 30) * DAY)), fill = v => dates.map(() => v);
  const hours = dates.flatMap(d => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`)), each = v => hours.map(() => v);
  const answer = { latitude: 10, longitude: 20, utc_offset_seconds: offset, timezone: 'Test/Zone', elevation: 120,
    current: { time: `${iso(now + offset * 1000)}T12:00`, temperature_2m: 15, apparent_temperature: 14, weather_code: 3, wind_speed_10m: 9, wind_direction_10m: 180, relative_humidity_2m: 60 },
    daily: { time: dates, temperature_2m_max: fill(20), temperature_2m_min: fill(8), precipitation_sum: fill(1), precipitation_probability_max: fill(40), wind_speed_10m_max: fill(12), wind_direction_10m_dominant: fill(200),
      weather_code: fill(3), sunrise: dates.map(d => `${d}T07:29`), sunset: dates.map(d => `${d}T17:39`), et0_fao_evapotranspiration: fill(2) },
    hourly: { time: hours, soil_temperature_6cm: each(9), soil_moisture_3_to_9cm: each(0.3), temperature_2m: each(15), relative_humidity_2m: each(70), dew_point_2m: each(9), precipitation: each(0), wind_speed_10m: each(10) } };
  edit(answer, 30);
  return answer;
}

// ---- a pretend world: a clock, a network and a device cache
function fakeCaches(faults = {}) {   // the Cache API as the module uses it; faults name the calls that throw
  const boxes = new Map(), keyOf = k => (typeof k === 'string' ? new Request(k).url : k.url), fault = name => { if (faults[name]) throw new Error(`pretend cache fault in ${name}`); };
  const open = async name => { fault('open'); if (!boxes.has(name)) boxes.set(name, new Map()); const kept = boxes.get(name);
    return { match: async k => { fault('match'); return kept.get(keyOf(k))?.clone(); }, put: async (k, res) => { fault('put'); kept.set(keyOf(k), res); },
      keys: async () => { fault('keys'); return [...kept.keys()].map(url => new Request(url)); }, delete: async k => kept.delete(keyOf(k)) }; };
  return { open, boxes };
}
const reply = (status, body = '', headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const down = () => new TypeError('fetch failed'), slow = () => Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
const isPower = url => url.startsWith('https://power.larc.nasa.gov/'), isEra5 = url => url.includes('&models=era5&'), isLand = url => url.includes('&models=era5_land&'), isForecast = url => url.startsWith('https://api.open-meteo.com/');
// handler(url, world) gives a plain object (sent as JSON), a Response, or an Error (the request then fails with it).
const NO_CACHE = Symbol('a browser without the Cache API');
function world(handler, { start = Date.UTC(2026, 10, 27, 0, 10), caches = fakeCaches() } = {}) {
  const w = { t: start, calls: [], waits: [], told: [], caches, signals: [] };
  w.env = { now: () => w.t, wait: async ms => { w.waits.push(ms); w.t += ms; }, onWait: (secs, text) => w.told.push([secs, text]), caches,
    fetch: async (url, opts) => { w.calls.push(url); w.signals.push(opts?.signal); const r = await handler(url, w); if (r instanceof Error) throw r; return r instanceof Response ? r : reply(200, r); } };
  if (caches === NO_CACHE) delete w.env.caches;
  return w;
}
const routes = (...table) => (url, w) => { for (const [test, answer] of table) if (test(url)) return typeof answer === 'function' ? answer(url, w) : answer; return reply(404); };

// The usual hand-made day: the clock stands a little after midnight UTC, so the 12 hours of the cache fit inside one address.
const T0 = Date.UTC(2026, 10, 27, 0, 10), YESTERDAY = '20261126';
const behind = (m, day) => (day === YESTERDAY ? -999 : undefined);   // like the real service: yesterday is asked for but not in yet
const GOOD = powerAnswer({ last: YESTERDAY, value: behind }), GOOD_DAYS = span('20010101', YESTERDAY).length;
const GOOD_ERA = archiveAnswer({ last: '20261121', value: (name, day) => (day > '20261119' ? null : undefined) });   // the last two days asked are not in yet
const GOOD_LAND = archiveAnswer({ last: '20251231', names: ['temperature_2m_min'], value: (name, day) => (day.slice(4) === '0115' ? -10 - (+day.slice(0, 4) % 5) : 2) });
const sourceText = rel => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');

// ---- the request addresses
await group('the request address', async () => {
  const NOW = Date.UTC(2026, 10, 20, 12), konya = D.cleanPlace(37.87, 32.48), ask = (url, key) => new URL(url).searchParams.get(key);
  same('NASA POWER: the whole address, character for character', D.powerUrl(konya, NOW),
    'https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,IMERG_PRECTOT,GWETROOT,EVLAND&community=AG&longitude=32.4800&latitude=37.8700&start=20010101&end=20261119&format=JSON&time-standard=UTC');
  same('NASA POWER: the six measures and no other', ask(D.powerUrl(konya, NOW), 'parameters').split(','), ['T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'IMERG_PRECTOT', 'GWETROOT', 'EVLAND']);
  same('NASA POWER: whole UTC days are asked for (a local day would shift every night across midnight)', ask(D.powerUrl(konya, NOW), 'time-standard'), 'UTC');
  same('NASA POWER: the farming community and JSON', [ask(D.powerUrl(konya, NOW), 'community'), ask(D.powerUrl(konya, NOW), 'format')], ['AG', 'JSON']);
  same('NASA POWER: from the first day of 2001 to yesterday', [ask(D.powerUrl(konya, NOW), 'start'), ask(D.powerUrl(konya, NOW), 'end')], ['20010101', '20261119']);
  same('NASA POWER: nothing else is sent (no name, no key, nothing personal)', [...new URL(D.powerUrl(konya, NOW)).searchParams.keys()].sort(), ['community', 'end', 'format', 'latitude', 'longitude', 'parameters', 'start', 'time-standard']);
  same('yesterday is yesterday in UTC at any hour, and across New Year', [Date.UTC(2026, 10, 20, 0, 30), Date.UTC(2026, 10, 20, 23, 59), Date.UTC(2026, 11, 31, 23, 59), Date.UTC(2027, 0, 1, 0, 10)].map(t => ask(D.powerUrl(konya, t), 'end')), ['20261119', '20261119', '20261230', '20261231']);
  same('the place is sent to 4 decimals', [ask(D.powerUrl(D.cleanPlace(44.123456, -79.987654), NOW), 'latitude'), ask(D.powerUrl(D.cleanPlace(44.123456, -79.987654), NOW), 'longitude')], ['44.1235', '-79.9877']);
  same('the year constants: 2001 to the last whole calendar year', [D.Y0, D.Y1, D.lastFullYear(Date.UTC(2026, 11, 31, 23, 59)), D.lastFullYear(Date.UTC(2027, 0, 1, 0, 0))], [2001, new Date().getUTCFullYear() - 1, 2025, 2026]);
  same('the back-up record: the whole address, ERA5 asked by name, whole UTC days, ending 6 days back', D.era5Url(konya, NOW),
    'https://archive-api.open-meteo.com/v1/archive?latitude=37.870&longitude=32.480&start_date=2001-01-01&end_date=2026-11-14&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&models=era5&timezone=UTC');
  same('the second cold-night record: ERA5-Land lows to the end of the last whole year, whole UTC days', D.era5LandUrl(konya, NOW),
    `https://archive-api.open-meteo.com/v1/archive?latitude=37.870&longitude=32.480&start_date=2001-01-01&end_date=${[2025, 12, 31].join('-')}&daily=temperature_2m_min&models=era5_land&timezone=UTC`);
  const fc = new URL(D.forecastUrl(konya)).searchParams;
  same('the forecast: the place to 3 decimals, the field\'s own clock, 30 days back and 16 ahead, the service\'s own choice of model', [fc.get('latitude'), fc.get('longitude'), fc.get('timezone'), fc.get('past_days'), fc.get('forecast_days'), fc.get('models')], ['37.870', '32.480', 'auto', '30', '16', null]);
  same('the forecast: the six current, ten daily and ten hourly measures', [fc.get('current'), fc.get('daily'), fc.get('hourly')], ['temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m',
    'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,weather_code,sunrise,sunset,et0_fao_evapotranspiration',
    'soil_temperature_6cm,soil_moisture_3_to_9cm,cloud_cover,direct_radiation,diffuse_radiation,temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,wind_speed_10m']);
  none('every recorded answer was asked for at the very address the app builds', PLACES.flatMap(place => Object.keys(FIXTURE_KINDS).map(kind => { const a = fixture(kind, place); return FIXTURE_KINDS[kind](spot(place), recordedAt(a)) === a._recorded.address ? '' : fixtureName(kind, place); })).filter(Boolean));
});

await group('odd places: the poles, the date line, the zero line, no place at all', async () => {
  const NOW = Date.UTC(2026, 10, 20, 12), lon = (a, b) => new URL(D.powerUrl(D.cleanPlace(a, b), NOW)).searchParams.get('longitude'), lat = (a, b) => new URL(D.powerUrl(D.cleanPlace(a, b), NOW)).searchParams.get('latitude');
  same('the two poles are places like any other', [lat(90, 0), lat(-90, 0)], ['90.0000', '-90.0000']);
  same('180 east and 180 west are one line: one address, so one weather square and one kept answer', [lon(0, 180), lon(0, -180), D.powerUrl(D.cleanPlace(0, 180), NOW) === D.powerUrl(D.cleanPlace(0, -180), NOW)], ['-180.0000', '-180.0000', true]);
  same('a map that has scrolled once around the world still names the same place', [lon(0, 190), lon(0, -190), lon(0, 540), lon(0, 359.99996)], ['-170.0000', '170.0000', '-180.0000', '0.0000']);
  same('the zero line is written one way only, never "-0.0000"', [lon(0, 0), lon(0, -0), lon(0, -0.00001), lat(-0.00001, 0), lat(-0, 0)], ['0.0000', '0.0000', '0.0000', '0.0000', '0.0000']);
  check('the Open-Meteo addresses never write "-0.000" either', !/=-0\.000(&|$)/.test(D.era5Url(D.cleanPlace(-0.0004, -0.0004), NOW) + D.forecastUrl(D.cleanPlace(-0.0004, -0.0004))), D.forecastUrl(D.cleanPlace(-0.0004, -0.0004)).slice(0, 80));
  const w = world(() => down());
  const off = [await D.fetchPower(91, 0, w.env), await D.fetchWeather(-90.01, 10, w.env), await D.fetchForecast(120, 0, w.env), await D.fetchEra5Cold(Infinity, 0, w.env)];
  check('a place off the map gets a plain reason, and no service is asked', off.every(r => r.ok === false && typeof r.reason === 'string' && r.reason.length > 20 && !r.S) && w.calls.length === 0, ser(off.map(r => r.reason)));
  const blank = [await D.fetchPower('', '', w.env), await D.fetchPower(null, null, w.env), await D.fetchPower(undefined, 5, w.env), await D.fetchWeather('44.4', '-79.78', w.env), await D.fetchPower(NaN, NaN, w.env)];
  check('a blank, a text or a missing position is no position: it is never read as 0, 0', blank.every(r => r.ok === false && r.reason === 'This place has no position Crophalo can read.') && w.calls.length === 0, ser(blank));
  const edge = world(routes([isPower, url => powerAnswer({ lat: +new URL(url).searchParams.get('latitude'), lon: +new URL(url).searchParams.get('longitude'), last: YESTERDAY, value: behind })], [isLand, reply(500)]));
  const pole = await D.fetchWeather(90, 0, edge.env), line = await D.fetchWeather(-17.5, 180, edge.env), zero = await D.fetchWeather(5.6, 0, edge.env);
  same('the North Pole, the date line and the zero line each get their weather, for the place asked', [pole.ok, pole.S?.lat, line.ok, line.S?.lon, zero.ok, zero.S?.lon], [true, 90, true, -180, true, 0]);
});

// ---- the recorded NASA POWER answers, built into the daily series
for (const place of PLACES) await group(`the series from the recorded answer: ${FIXTURE_PLACES[place].name}`, async () => {
  const a = fixture('power', place), raw = a.properties.parameter, now = recordedAt(a), S = D.buildSeries(a, spot(place)), yesterday = day8(now - DAY);
  const lists = [...D.MEASURES, 'year', 'month', 'doy', 'rain'];
  same(`${place}: one value per day in every list`, lists.map(k => Array.isArray(S[k]) && S[k].length), lists.map(() => S.days.length));
  same(`${place}: every UTC day from 2001 to yesterday is there, none skipped, in order`, S.days, span('20010101', yesterday));
  const leap = S.days.indexOf('20240229'), end = S.days.indexOf('20241231');
  same(`${place}: the year, month and day of the year go with each day`, [S.year[0], S.month[0], S.doy[0], S.year[leap], S.month[leap], S.doy[leap], S.doy[end], S.doy[end + 1]], [2001, 1, 1, 2024, 2, 60, 366, 1]);
  const wrong = [], lost = [];
  for (const m of D.MEASURES) S.days.forEach((day, i) => { const sent = raw[m][day]; if (sent === -999 || sent === undefined) { if (!Number.isNaN(S[m][i])) wrong.push(`${m} ${day}: ${S[m][i]}`); } else if (S[m][i] !== sent) lost.push(`${m} ${day}: sent ${sent}, kept ${S[m][i]}`); });
  none(`${place}: every fill value (−999) is NaN, in every measure: never 0, never −999`, wrong);
  none(`${place}: every real reading is kept exactly as NASA sent it`, lost);
  const dry = S.days.filter((day, i) => raw.IMERG_PRECTOT[day] === -999 && S.rain[i] === 0);
  check(`${place}: the satellite rain has unread days, and not one of them counts as a dry day`, Object.values(raw.IMERG_PRECTOT).includes(-999) && dry.length === 0, `${dry.length} unread days read as 0 mm`);
  same(`${place}: the weather square's own height is the one in the answer, under both names`, [S.cellElev, S.elev], [a.geometry.coordinates[2], a.geometry.coordinates[2]]);
  same(`${place}: NASA POWER, satellite rain first, and the place as asked`, [S.source, S.rainSource, S.rain === S.IMERG_PRECTOT, S.lat, S.lon, S.altWeather], ['power', 'imerg', true, spot(place).lat, spot(place).lon, null]);
  same(`${place}: the last day of each measure is its last real reading`, S.lastDate, Object.fromEntries(D.MEASURES.map(m => [m, lastRealKey(raw[m])])));
  const newest = [lastRealKey(raw.T2M_MAX), lastRealKey(raw.T2M_MIN)].sort()[0];
  same(`${place}: "weather through" is the last day that holds a real high and low`, S.through, dash(newest));
  check(`${place}: the service was behind when recorded, and "weather through" says so: it is not simply yesterday`, raw.T2M_MAX[yesterday] === -999 && S.through < dash(yesterday), `${S.through} against ${dash(yesterday)}`);
  same(`${place}: the answer is for the place, the UTC days and the units asked, and can carry a report`, [D.powerProblem(a, spot(place)), D.seriesProblem(S, 'NASA POWER')], ['', '']);
  const years = D.yearTable(S), running = years[years.length - 1], lastFull = new Date(now).getUTCFullYear() - 1;
  same(`${place}: every year from 2001 to the last whole year is complete, and that is the last complete year`, [D.completeYears(S, now), D.lastCompleteYear(S, now)], [Array.from({ length: lastFull - 2000 }, (_, i) => 2001 + i), lastFull]);
  check(`${place}: the running year is not complete and has no yearly rain`, running.year === lastFull + 1 && !D.completeYears(S, now).includes(running.year) && Number.isNaN(running.rainTotal), ser(running));
  const sum = Math.round(S.days.reduce((t, day, i) => t + (S.year[i] === lastFull ? raw.IMERG_PRECTOT[day] : 0), 0) * 100) / 100;
  near(`${place}: the last whole year's rain is the sum of its satellite days, added up here from the raw answer`, years.find(y => y.year === lastFull).rainTotal, sum, 0.011);
  const n = D.rainDays(S), unread = Object.values(raw.IMERG_PRECTOT).filter(v => v === -999).length;
  same(`${place}: the count of rain days in each record, with its denominator`, [n.days, n.imerg, n.used, n.modelOnly + n.none], [S.days.length, S.days.length - unread, 'imerg', unread]);
});
await group('four places with very different weather give four different records', async () => {
  const mean = (S, key) => { const v = S[key].filter(real); return v.reduce((a, b) => a + b, 0) / v.length; }, at = Object.fromEntries(PLACES.map(p => [p, D.buildSeries(fixture('power', p), spot(p))]));
  const rain = p => { const y = D.yearTable(at[p]).filter(r => real(r.rainTotal)); return y.reduce((t, r) => t + r.rainTotal, 0) / y.length; };
  check('the steppe (Konya) is drier than the corn belt (Ames), and Barrie wetter than the valley (Fresno)', rain('konya') < rain('iowa') && rain('valley') < rain('barrie'), ser(PLACES.map(p => [p, Math.round(rain(p))])));
  check('the valley has the hottest days and Barrie the coldest nights', PLACES.every(p => mean(at.valley, 'T2M_MAX') >= mean(at[p], 'T2M_MAX') && mean(at.barrie, 'T2M_MIN') <= mean(at[p], 'T2M_MIN')), ser(PLACES.map(p => [p, mean(at[p], 'T2M_MAX').toFixed(1), mean(at[p], 'T2M_MIN').toFixed(1)])));
  check('Konya\'s weather square lies on the high plain, over 1,000 m', at.konya.cellElev > 1000 && at.konya.cellElev < 1600 && at.valley.cellElev < 400, `${at.konya.cellElev} m, ${at.valley.cellElev} m`);
});

// ---- a reading nobody took is unknown, never zero
await group('unread readings', async () => {
  const odd = { '20100105': -999, '20100106': null, '20100107': '7.5', '20100108': 1e9, '20100109': -3, '20100110': DROP, '20100111': 0 };
  const a = powerAnswer({ last: YESTERDAY, value: (m, day) => (m === 'IMERG_PRECTOT' && day in odd ? odd[day] : m === 'T2M_MIN' && day === '20100107' ? null : m === 'T2M_MAX' && day === '20100108' ? 75 : m === 'T2M_MIN' && day === '20100108' ? -95 : behind(m, day)) });
  const S = D.buildSeries(a, D.cleanPlace(10, 20)), i = day => S.days.indexOf(day), rainAt = day => S.IMERG_PRECTOT[i(day)];
  same('the fill value, a null, a text, an impossible figure and a negative rain are all unknown', ['20100105', '20100106', '20100107', '20100108', '20100109'].map(rainAt), [NaN, NaN, NaN, NaN, NaN]);
  check('a day left out of the answer is still a day of the calendar, and unknown (the calendar is not the coverage)', i('20100110') > 0 && Number.isNaN(rainAt('20100110')) && S.days.length === span('20010101', YESTERDAY).length, `${rainAt('20100110')}`);
  same('a real 0 mm is a reading: a dry day stays a dry day', [rainAt('20100111'), rainAt('20100112')], [0, 3]);
  same('a null is never read as 0 °C, and a high stays when only its low is missing (each measure is judged on its own)', [S.T2M_MIN[i('20100107')], S.T2M_MAX[i('20100107')]], [NaN, 25]);
  same('a temperature that cannot happen on Earth is not a reading', [S.T2M_MAX[i('20100108')], S.T2M_MIN[i('20100108')]], [NaN, NaN]);
  // Farming reason for the figure: six January days were not read. Left out of the sum they would count as six dry days and make the year look drier than it was
  // (the plain sum is 1,074 mm). They are taken at January's own daily mean: 25 days read gave 72 mm, so 31 days give 89.28 mm; the other eleven months gave 334 × 3 = 1,002 mm.
  same('the yearly rain of that year is not lowered by the unread days: 359 of 365 days read, and the unread six count at their month\'s own mean, not as dry days', [D.yearTable(S).find(y => y.year === 2010).rain, D.yearTable(S).find(y => y.year === 2010).rainTotal], [359, 1091.28]);
  const bare = powerAnswer({ last: YESTERDAY, value: (m, day) => (m === 'GWETROOT' || m === 'EVLAND' ? DROP : behind(m, day)) }); delete bare.header.fill_value;
  const B = D.buildSeries(bare, D.cleanPlace(10, 20));
  check('a measure the service did not send is all unknown, with no last day; the rest still stands', B.GWETROOT.every(Number.isNaN) && B.EVLAND.every(Number.isNaN) && B.lastDate.GWETROOT === null && B.through === '2026-11-25' && Number.isNaN(B.T2M_MAX.at(-1)), ser([B.lastDate, B.through]));
  same('an answer that is not NASA POWER\'s gives no series at all', [null, undefined, 'busy', {}, { properties: {} }, { properties: { parameter: {} } }, { properties: { parameter: { T2M_MAX: { soon: 1, 19990101: 5 } } } }].map(x => D.buildSeries(x, D.cleanPlace(10, 20))), [null, null, null, null, null, null, null]);
  const text = sourceText('js/data.js');
  check('nowhere does the module turn a missing value into a number ("?? 0", "|| 0" on a reading)', !/\?\? 0\b/.test(text) && !/reading\([^)]*\)\s*\|\|\s*0/.test(text));
});

// ---- the newest day
await group('weather through: the last day with a real reading', async () => {
  const late = (m, day) => (day >= '20261125' ? -999 : undefined);   // the service is two days behind: the last two days asked for are not in yet
  const w = world(routes([isPower, powerAnswer({ last: YESTERDAY, value: late })], [isLand, GOOD_LAND])), got = await D.fetchWeather(10, 20, w.env);
  same('the service two days behind: "weather through" is the last day it really holds, not yesterday', [got.ok, got.through, got.S.through, got.S.days.at(-1), got.S.T2M_MAX.at(-1), got.S.T2M_MAX.at(-2)], [true, '2026-11-24', '2026-11-24', YESTERDAY, NaN, NaN]);
  same('…and the header says that day', D.weatherLine(got, w.t), 'live · weather through Nov 24, 2026');
  const lowLate = D.buildSeries(powerAnswer({ last: YESTERDAY, value: (m, day) => ((m === 'T2M_MIN' && day >= '20261124') || day === YESTERDAY ? -999 : undefined) }), D.cleanPlace(10, 20));
  same('a day with its high but not yet its low is not a whole day of weather: each measure keeps its own last day', [lowLate.through, lowLate.lastDate.T2M_MAX, lowLate.lastDate.T2M_MIN, lowLate.lastDate.IMERG_PRECTOT], ['2026-11-23', '20261125', '20261123', '20261125']);
  same('a day is written the way a farmer reads it; a day nobody knows is said to be unknown, not made up', [D.dayText('2026-11-20'), D.dayText('2027-01-05'), D.dayText(null), D.dayText('soon')], ['Nov 20, 2026', 'Jan 5, 2027', 'an unknown day', 'an unknown day']);
});

// ---- rain: satellite first, the weather model as the back-up
await group('rain: GPM IMERG first, MERRA-2 as the back-up', async () => {
  const P = D.cleanPlace(10, 20), all = span('20010101', YESTERDAY), build = value => D.buildSeries(powerAnswer({ last: YESTERDAY, value: (m, day) => value(m, day) ?? behind(m, day) }), P);
  const usual = build(() => undefined);
  same('with satellite rain read, it is the place\'s rain record, and the model\'s rain stays beside it untouched', [usual.rainSource, usual.rain === usual.IMERG_PRECTOT, usual.rain[100], usual.PRECTOTCORR[100]], ['imerg', true, 3, 2]);
  const oneDay = build((m, day) => (m === 'IMERG_PRECTOT' && day === '20150610' ? -999 : undefined)), at = oneDay.days.indexOf('20150610'), n = D.rainDays(oneDay);
  // Farming reason: a patched day would put two records with different habits under one name; a place keeps one rain record.
  same('a day the satellite missed: that day is unknown in the rain record (not 0 mm, not the model\'s 2 mm under the satellite\'s name)', [oneDay.rainSource, oneDay.rain[at], oneDay.PRECTOTCORR[at]], ['imerg', NaN, 2]);
  same('…and the count names it: one day that only the model read', [n.modelOnly, n.imerg, n.model, n.none, n.used], [1, all.length - 2, all.length - 1, 1, 'imerg']);
  const oneYear = build((m, day) => (m === 'IMERG_PRECTOT' && day.startsWith('2019') ? -999 : undefined)), row = D.yearTable(oneYear).find(y => y.year === 2019);
  same('a year the satellite missed (of 26): the place keeps its satellite record, and that year is a gap with no total', [oneYear.rainSource, row.imerg, row.model, row.rain, row.complete, row.rainTotal], ['imerg', 0, 365, 0, false, NaN]);
  check('…it is not patched with the model\'s rain, whose low years at the end would bend the trend; the other years keep their totals', !D.completeYears(oneYear, T0).includes(2019) && D.completeYears(oneYear, T0).length === 24 && D.yearTable(oneYear).find(y => y.year === 2018).rainTotal === 365 * 3);
  const noSat = build(m => (m === 'IMERG_PRECTOT' ? -999 : undefined)), total = D.yearTable(noSat).find(y => y.year === 2019).rainTotal;
  same('a place the satellite record does not cover at all: the model\'s rain is the record, by name', [noSat.rainSource, noSat.rain === noSat.PRECTOTCORR, total, D.rainDays(noSat).imerg], ['merra2', true, 365 * 2, 0]);
  const cut = Math.floor(all.length * 0.9), firstDays = k => new Set(all.slice(0, all.length - 1 - k)), few = firstDays(cut), enough = firstDays(cut + 1);   // the last day is unread anyway
  same('the satellite record needs MORE than 9 days in 10: at the edge the model is used, one day more and the satellite is', [build((m, day) => (m === 'IMERG_PRECTOT' && few.has(day) ? -999 : undefined)).rainSource, build((m, day) => (m === 'IMERG_PRECTOT' && enough.has(day) ? -999 : undefined)).rainSource], ['merra2', 'imerg']);
  check('the reason for the order is kept as a text for the "i" card', /GPM IMERG/.test(D.RAIN_WHY) && /MERRA-2/.test(D.RAIN_WHY) && /reads low after about 2015/.test(D.RAIN_WHY) && /drying out when it is not/.test(D.RAIN_WHY), D.RAIN_WHY);
  same('the rain line says which record, on how many days of how many, and through which day', D.rainNote(usual), `Rain is satellite rain (GPM IMERG), read on ${(all.length - 1).toLocaleString('en-US')} of ${all.length.toLocaleString('en-US')} days, through Nov 25, 2026.`);
  same('where the model is used the line says so, with both counts', D.rainNote(noSat), `Satellite rain (GPM IMERG) was read on only 0 of ${all.length.toLocaleString('en-US')} days here, so rain is from NASA’s weather model (MERRA-2), read on ${(all.length - 1).toLocaleString('en-US')}.`);
});

// ---- complete years
await group('the last complete year and the 330-day rule', async () => {
  const P = D.cleanPlace(10, 20), every10 = k => new Set(span('20250101', '20251231').filter((_, i) => i % 10 === 4).slice(0, k));   // spread over the year: 3 a month
  const build = (measure, k, now = T0, last = YESTERDAY) => { const out = every10(k); return D.buildSeries(powerAnswer({ last, value: (m, day) => (m === measure && out.has(day) ? -999 : day === last ? -999 : undefined) }), P); };
  const row = S => D.yearTable(S).find(y => y.year === 2025);
  // Farming reason for the figure: every day read had 3 mm, and the 35 unread days (about 3 in each month) are unknown, not dry. Each month is taken at its own daily mean,
  // so the year is 365 × 3 = 1,095 mm; the plain sum of the days read, 990 mm, would show a year a tenth drier than it was.
  same('330 days of rain make a year: it is complete and has its total, with the unread days at their month\'s own mean', [row(build('IMERG_PRECTOT', 35)).rain, row(build('IMERG_PRECTOT', 35)).complete, row(build('IMERG_PRECTOT', 35)).rainTotal, D.lastCompleteYear(build('IMERG_PRECTOT', 35), T0)], [330, true, 1095, 2025]);
  same('329 days of rain do not: the year is not complete, has no total, and the last complete year is the one before', [row(build('IMERG_PRECTOT', 36)).rain, row(build('IMERG_PRECTOT', 36)).complete, row(build('IMERG_PRECTOT', 36)).rainTotal, D.lastCompleteYear(build('IMERG_PRECTOT', 36), T0)], [329, false, NaN, 2024]);
  same('the same edge for the temperatures: 330 nights with a low make a year, 329 do not', [row(build('T2M_MIN', 35)).temp, row(build('T2M_MIN', 35)).complete, row(build('T2M_MIN', 36)).temp, row(build('T2M_MIN', 36)).complete, D.lastCompleteYear(build('T2M_MIN', 36), T0)], [330, true, 329, false, 2024]);
  same('the rule is 330 days, as written', D.FULL_YEAR_DAYS, 330);
  const june = D.buildSeries(powerAnswer({ last: YESTERDAY, value: (m, day) => (m === 'IMERG_PRECTOT' && day.startsWith('202506') ? -999 : behind(m, day)) }), P);
  same('a year with one month of rain unread (335 days in all) has no yearly total: a total without June is not the year\'s rain', [row(june).rain, row(june).complete, row(june).rainTotal], [335, true, NaN]);
  const dec = Date.UTC(2026, 11, 5, 0, 10), late = D.buildSeries(powerAnswer({ last: '20261204', value: (m, day) => (day === '20261204' ? -999 : undefined) }), P), running = D.yearTable(late).find(y => y.year === 2026);
  same('in December the running year has over 330 days, yet it is never "the last complete year" and has no yearly total', [running.rain >= 330, D.lastCompleteYear(late, dec), D.completeYears(late, dec).includes(2026), running.rainTotal], [true, 2025, false, NaN]);
  const short = last => D.seriesProblem(D.buildSeries(powerAnswer({ last }), P), 'NASA POWER');
  same('a record needs five years of 330 days: four are too little history, five will do', [short('20041231'), short('20051231')], ['NASA POWER sent too little history for this place', '']);
  const tenth = Math.floor(GOOD_DAYS / 10), holes = k => { const out = new Set(span('20010101', YESTERDAY).slice(0, k)); return D.seriesProblem(D.buildSeries(powerAnswer({ last: YESTERDAY, value: (m, day) => (m === 'T2M_MAX' && out.has(day) ? -999 : undefined) }), P), 'NASA POWER'); };
  same('temperatures on fewer than 9 days in 10 are no temperatures; on 9 in 10 they are', [holes(tenth + 1), holes(tenth)], ['NASA POWER has no temperatures for this place', '']);
  same('a record that does not start in 2001 is not the record that was asked for', D.seriesProblem(D.buildSeries(powerAnswer({ first: '20050101', last: YESTERDAY }), P), 'NASA POWER'), 'NASA POWER sent too little history for this place');
});

// ---- the field's own height
await group('the height correction', async () => {
  same('the rule: 6.5 °C per 1,000 m, from 100 m of difference, capped at 1,500 m', [D.LAPSE, D.HEIGHT_FROM, D.HEIGHT_CAP], [0.0065, 100, 1500]);
  same('99 m of difference is left alone; 100 m is corrected; 1,500 m in full; 3,000 m only as far as 1,500', [D.heightShift(399, 300), D.heightShift(400, 300), D.heightShift(1800, 300), D.heightShift(3300, 300)], [0, 100, 1500, 1500]);
  same('a field below its weather square is corrected the other way, by the same rule', [D.heightShift(201, 300), D.heightShift(200, 300), D.heightShift(300, 800), D.heightShift(0, 3000)], [0, -100, -500, -1500]);
  same('no height, or a height map reading the sea floor (below −20 m), corrects nothing', [D.heightShift(NaN, 300), D.heightShift(null, 300), D.heightShift(undefined, 300), D.heightShift('800', 300), D.heightShift(800, NaN), D.heightShift(-21, 300), D.heightShift(-20, 300)], [0, 0, 0, 0, 0, 0, -320]);
  const S = { ...D.buildSeries(fixture('power', 'konya'), spot('konya')), cellElev: 1200, elev: 1200 }, cell = S.cellElev, moved = h => D.fitHeight(S, cell + h);   // a round height, so 100 m is exactly 100 m
  const shift = T => { const d = T.T2M_MAX.map((v, i) => v - S.T2M_MAX[i]).filter(real), e = T.T2M_MIN.map((v, i) => v - S.T2M_MIN[i]).filter(real); return [Math.min(...d, ...e), Math.max(...d, ...e)]; };
  const about = (name, T, want) => check(name, shift(T).every(v => Math.abs(v - want) < 1e-9) && Math.abs(T.dT - want) < 1e-12, `moved by ${shift(T)}, dT ${T.dT}, wanted ${want}`);
  check('99 m higher: the temperatures are NASA\'s own, unmoved', moved(99).T2M_MAX === S.T2M_MAX && moved(99).dT === 0 && moved(99).dz === 0);
  about('100 m higher: every high and low 0.65 °C cooler', moved(100), -0.65);
  about('500 m higher: 3.25 °C cooler (the hill-station case)', moved(500), -3.25);
  about('1,500 m higher: 9.75 °C cooler', moved(1500), -9.75);
  about('3,000 m higher: still 9.75 °C cooler, the cap', moved(3000), -9.75);
  about('500 m below the square: 3.25 °C warmer', moved(-500), 3.25);
  const up = moved(500);
  check('rain is not height-corrected: both rain records, the soil wetness and the water loss are the very same lists', up.rain === S.rain && up.IMERG_PRECTOT === S.IMERG_PRECTOT && up.PRECTOTCORR === S.PRECTOTCORR && up.GWETROOT === S.GWETROOT && up.EVLAND === S.EVLAND);
  same('…and their sums have not moved by a drop', [up.IMERG_PRECTOT.filter(real).reduce((a, b) => a + b, 0), up.PRECTOTCORR.filter(real).reduce((a, b) => a + b, 0)], [S.IMERG_PRECTOT.filter(real).reduce((a, b) => a + b, 0), S.PRECTOTCORR.filter(real).reduce((a, b) => a + b, 0)]);
  same('an unread night stays unread after the correction', [up.T2M_MIN.filter(Number.isNaN).length, Number.isNaN(up.T2M_MAX.at(-1))], [S.T2M_MIN.filter(Number.isNaN).length, true]);
  about('asking twice moves once', D.fitHeight(up, cell + 500), -3.25);
  about('a new height replaces the old one: it is not added to it', D.fitHeight(up, cell + 200), -1.3);
  check('NASA\'s own series is left as it was', S.dT === 0 && S.T2M_MAX[0] === fixture('power', 'konya').properties.parameter.T2M_MAX['20010101']);
  same('the card says by how much, which way, and both heights', [D.heightNote(D.fitHeight({ ...S, cellElev: 1480 }, 1800)), D.heightNote(D.fitHeight({ ...S, cellElev: 1480 }, 1000)), D.heightNote(moved(50))],
    ['Temperatures are set 2.1 °C cooler for your field’s height: NASA’s grid averages 1,480 m, your field is 1,800 m.', 'Temperatures are set 3.1 °C warmer for your field’s height: NASA’s grid averages 1,480 m, your field is 1,000 m.', '']);
});

// ---- the device cache
await group('the 12-hour device cache', async () => {
  const w = world(routes([isPower, GOOD], [isLand, GOOD_LAND]));
  const first = await D.fetchPower(10, 20, w.env);
  same('a first reading asks NASA once and says it is fresh, with the time it was read', [first.ok, w.calls.length, first.cached, first.fetched, first.source], [true, 1, false, new Date(T0).toISOString(), 'power']);
  const box = w.caches.boxes.get('crophalo-data-v1'), entry = box?.get(first.url);
  same('what is kept: NASA\'s answer as sent, under its own address, in the bucket "crophalo-data-v1", dated', [D.DATA_CACHE, box?.size, entry?.headers.get('x-saved'), ser(await entry?.clone().json()) === ser(GOOD)], ['crophalo-data-v1', 1, String(T0), true]);
  w.t = T0 + 12 * HOUR - 60e3;
  const again = await D.fetchPower(10, 20, w.env);
  same('11 hours 59 minutes later the same answer is used and NASA is not asked again', [again.ok, w.calls.length, again.through], [true, 1, first.through]);
  same('…and it says so: it is a kept answer, read at the first time, not now', [again.cached, again.fetched], [true, new Date(T0).toISOString()]);
  same('the header line never calls a kept answer live', [D.weatherLine(first, T0), D.weatherLine(again, w.t), D.weatherLine({ ...again }, T0 + 20 * 60e3)], ['live · weather through Nov 25, 2026', 'read 12 hours ago · weather through Nov 25, 2026', 'read 20 minutes ago · weather through Nov 25, 2026']);
  w.t = T0 + 12 * HOUR;
  const due = await D.fetchPower(10, 20, w.env);
  same('at 12 hours the answer is too old: NASA is asked again and the new answer is fresh', [w.calls.length, due.cached, due.fetched], [2, false, new Date(T0 + 12 * HOUR).toISOString()]);
  const old = world(routes([isPower, GOOD]));
  await D.fetchPower(10, 20, old.env); old.t = T0 + 13 * HOUR;
  const late = await D.fetchPower(10, 20, old.env);
  same('a 13-hour-old answer is never served as fresh: NASA is asked again', [old.calls.length, late.cached, late.fetched], [2, false, new Date(T0 + 13 * HOUR).toISOString()]);
  const back = world(routes([isPower, GOOD]), { start: T0 + 6 * HOUR });
  await D.fetchPower(10, 20, back.env); back.t = T0 + 5 * HOUR;   // the same UTC day, so the same address
  same('an answer dated ahead of the clock is not trusted', [(await D.fetchPower(10, 20, back.env)).cached, back.calls.length], [false, 2]);
  for (const fault of ['open', 'match', 'put', 'keys']) {
    const broken = world(routes([isPower, GOOD]), { caches: fakeCaches({ [fault]: true }) }), got = await D.fetchPower(10, 20, broken.env);
    same(`a cache that fails at "${fault}" does not break the reading`, [got.ok, got.cached, got.S?.days.length], [true, false, GOOD_DAYS]);
  }
  for (const [label, caches] of [['no cache at all', NO_CACHE], ['a cache that is null', null]]) {
    const bare = world(routes([isPower, GOOD]), { caches }), one = await D.fetchPower(10, 20, bare.env), two = await D.fetchPower(10, 20, bare.env);
    same(`a browser with ${label} still gets its weather, asked each time`, [one.ok, two.ok, two.cached, bare.calls.length], [true, true, false, 2]);
  }
  let state = 'down';
  const flaky = world(routes([isPower, () => (state === 'down' ? reply(503, 'busy') : state === 'empty' ? powerAnswer({ last: YESTERDAY, value: m => (m.startsWith('T2M') ? -999 : undefined) }) : GOOD)], [isEra5, () => down()]));
  const failedOnce = await D.fetchPower(10, 20, flaky.env); state = 'empty';
  const emptyOnce = await D.fetchPower(10, 20, flaky.env);
  same('a failure and an answer with no temperatures are never kept', [failedOnce.ok, emptyOnce.ok, emptyOnce.reason, flaky.caches.boxes.get('crophalo-data-v1')?.size ?? 0], [false, false, 'NASA POWER has no temperatures for this place', 0]);
  state = 'good'; await D.fetchPower(10, 20, flaky.env); state = 'down'; flaky.t = T0 + 13 * HOUR;
  const stale = await D.fetchWeather(10, 20, flaky.env);
  same('when the kept answer is too old and no service answers, the old copy is not handed out: there is a plain reason and no data', [stale.ok, stale.reason, 'S' in stale, 'through' in stale], [false, D.NO_WEATHER, false, false]);
  const many = world(url => ({ n: url }));
  for (let i = 0; i < 32; i++) { many.t = T0 + i * 1000; await D.cachedJSON(`https://weather.test/answer?place=${i}`, { keep: HOUR, limit: 1000 }, many.env); }
  const keptKeys = [...many.caches.boxes.get('crophalo-data-v1').keys()];
  same('only the 30 newest answers are kept: the two oldest have gone', [keptKeys.length, keptKeys.some(k => /place=(0|1)$/.test(k)), keptKeys.some(k => /place=2$/.test(k)), keptKeys.some(k => /place=31$/.test(k))], [30, false, true, true]);
  check('every request carries a stop signal, so a service that hangs is given up on', many.signals.every(s => s instanceof AbortSignal) && D.LIMIT.power === 30e3 && D.LIMIT.era5 === 45e3 && D.LIMIT.era5land === 45e3 && D.LIMIT.forecast === 12e3);
  same('the keep-times: NASA POWER 12 hours, the back-up record 12, the second cold record 24, the forecast 1', [D.KEEP.power, D.KEEP.era5, D.KEEP.era5land, D.KEEP.forecast].map(ms => ms / HOUR), [12, 12, 24, 1]);
});

// ---- when NASA cannot answer
await group('the fall-back to the back-up record', async () => {
  const eraOnly = power => routes([isPower, power], [isEra5, GOOD_ERA], [isLand, GOOD_LAND]);
  const w = world(eraOnly(() => down())), got = await D.fetchWeather(10, 20, w.env), S = got.S;
  same('NASA POWER down: the back-up record is read, and the answer says which record it is', [got.ok, got.source, got.backup, S?.source, S?.altWeather, S?.rainSource, got.sources], [true, 'era5', true, 'era5', 'Open-Meteo (ERA5)', 'era5', ['era5']]);
  same('…with the note the screen must show, naming the source and its last day', got.note, 'NASA has no weather for this spot right now. Using Open-Meteo (ERA5) instead, through Nov 19, 2026. Rain from satellites and root-zone wetness are not available.');
  same('…with the line for the answer card, and why NASA was not used', [got.card, got.why], ['Weather is from the back-up record, Open-Meteo (ERA5), because NASA POWER did not answer.', 'NASA POWER did not answer']);
  same('…the header line reads the back-up\'s own last day', D.weatherLine(got, w.t), 'live · weather through Nov 19, 2026');
  check('the back-up has no satellite rain, soil wetness or water loss, and says so by NaN, not by zeros', S.IMERG_PRECTOT.every(Number.isNaN) && S.GWETROOT.every(Number.isNaN) && S.EVLAND.every(Number.isNaN) && S.lastDate.IMERG_PRECTOT === null && S.rain === S.PRECTOTCORR && S.rain[0] === 1.5);
  same('"weather through" is the last day with a real reading, not the last day asked for; the days not in yet are unknown, not dry', [S.through, S.days.at(-1), S.rain.at(-1), S.T2M_MAX.at(-1)], ['2026-11-19', '20261121', NaN, NaN]);
  same('it has no weather-square height, so no height correction is made on it', [S.cellElev, D.fitHeight(S, 2500).dT, D.fitHeight(S, 2500).T2M_MAX[0], D.heightNote(D.fitHeight(S, 2500))], [NaN, 0, 24, '']);
  same('the second cold-night record is not read on the back-up, and NASA was asked once only', [got.cold, w.calls.filter(isLand).length, w.calls.filter(isPower).length, w.calls.filter(isEra5).length], [null, 0, 1, 1]);
  same('the rain line on the back-up names the back-up', D.rainNote(S), `Rain is from the back-up record, Open-Meteo (ERA5), read on ${(S.days.length - 2).toLocaleString('en-US')} of ${S.days.length.toLocaleString('en-US')} days. Satellite rain is not available.`);
  const tries = [['an error page', reply(502, '<html>Bad Gateway</html>'), 'NASA POWER did not answer'], ['words, not JSON', reply(200, '<html>maintenance</html>'), 'NASA POWER sent an answer Crophalo could not read'],
    ['an empty object', {}, 'NASA POWER sent an answer Crophalo could not read'], ['only fill values', powerAnswer({ last: YESTERDAY, value: () => -999 }), 'NASA POWER has no temperatures for this place'],
    ['three years of days', powerAnswer({ last: '20031231' }), 'NASA POWER sent too little history for this place'], ['another place', powerAnswer({ lat: 12, lon: 20, last: YESTERDAY }), 'NASA POWER answered for a different place'],
    ['local days, not UTC days', powerAnswer({ last: YESTERDAY, standard: 'LST' }), 'NASA POWER did not answer in whole UTC days'], ['other units', powerAnswer({ last: YESTERDAY, units: { ...UNITS, T2M_MAX: 'K' } }), 'NASA POWER changed the units of its answer'],
    ['no answer in time', () => slow(), 'NASA POWER took too long'], ['too many requests', reply(429, 'slow down'), 'NASA POWER is busy and asked us to wait']];
  for (const [label, power, why] of tries) {
    const t = world(eraOnly(power)), r = await D.fetchWeather(10, 20, t.env);
    same(`NASA POWER answering with ${label}: the back-up is used and the reason is kept`, [r.ok, r.backup, r.source, r.why, r.note.startsWith('NASA has no weather for this spot right now. Using Open-Meteo (ERA5) instead'), t.waits], [true, true, 'era5', why, true, []]);
  }
  const both = world(routes([isPower, () => down()], [isEra5, reply(500)])), lost = await D.fetchWeather(10, 20, both.env);
  same('both down: a plain reason and no data at all, never a guess', [lost.ok, lost.reason, Object.keys(lost).sort()], [false, 'No weather source answered for this spot. Check your connection and try again.', ['ok', 'reason', 'retryIn', 'tried']]);
  same('…after one more try of the back-up, 4 seconds later (the free service sometimes says busy)', [both.calls.filter(isEra5).length, both.waits, both.calls.filter(isPower).length, lost.tried], [2, [4000], 1, ['NASA POWER did not answer', 'Open-Meteo did not answer']]);
  let n = 0;
  const busy = world(routes([isPower, () => down()], [isEra5, () => (n++ ? GOOD_ERA : reply(429, { error: true, reason: 'Too many requests' }, { 'retry-after': '30' }))])), start = busy.t, waited = await D.fetchWeather(10, 20, busy.env);
  same('the back-up says "too many requests, wait 30 seconds": the app waits exactly as told, then asks once more', [waited.ok, waited.backup, busy.waits, busy.t - start, busy.calls.filter(isEra5).length], [true, true, [30000], 30000, 2]);
  same('…and the screen is told it is waiting', busy.told, [[30, 'Waiting 30 seconds for the weather service’s limit.']]);
  n = 0;
  const noFigure = world(routes([isPower, () => down()], [isEra5, () => (n++ ? GOOD_ERA : reply(429, 'busy'))])); await D.fetchWeather(10, 20, noFigure.env);
  same('"too many requests" with no figure: a full minute, the length of the service\'s own window', noFigure.waits, [60000]);
  n = 0;
  const byDate = world(routes([isPower, () => down()], [isEra5, (url, x) => (n++ ? GOOD_ERA : reply(429, 'busy', { 'retry-after': new Date(x.t + 45e3).toUTCString() }))])); await D.fetchWeather(10, 20, byDate.env);
  check('a wait given as a time of day is read as the seconds until then', byDate.waits.length === 1 && byDate.waits[0] >= 45000 && byDate.waits[0] <= 46000, ser(byDate.waits));
  const long = world(routes([isPower, () => down()], [isEra5, reply(429, 'busy', { 'retry-after': '600' })])), gaveUp = await D.fetchWeather(10, 20, long.env);
  same('told to wait 10 minutes: the app does not ask again sooner than told; it gives the plain reason and how long', [gaveUp.ok, gaveUp.reason, gaveUp.retryIn, long.waits, long.calls.filter(isEra5).length, gaveUp.tried[1]], [false, D.NO_WEATHER, 600, [], 1, 'Open-Meteo is busy and asked us to wait']);
  same('how long a wait is read: a figure, a zero, nothing, nonsense', [D.waitSeconds('30'), D.waitSeconds(' 7 '), D.waitSeconds('0'), D.waitSeconds(null), D.waitSeconds('soon')], [30, 7, 1, 60, 60]);
  const shifted = world(routes([isPower, () => down()], [isEra5, archiveAnswer({ last: '20261121', offset: 3600 })])), wrongDays = await D.fetchWeather(10, 20, shifted.env);
  same('a back-up answer that is not in whole UTC days is refused', [wrongDays.ok, wrongDays.tried?.[1]], [false, 'Open-Meteo did not answer in whole UTC days']);
  const far = world(routes([isPower, () => down()], [isEra5, archiveAnswer({ lat: 11, lon: 20, last: '20261121' })])), wrongPlace = await D.fetchWeather(10, 20, far.env);
  same('a back-up answer for another place is refused', [wrongPlace.ok, wrongPlace.tried?.[1]], [false, 'Open-Meteo answered for a different place']);
  for (const place of ['barrie', 'konya']) {
    const era = fixture('era5', place), now = recordedAt(era), raw = era.daily, real5 = world(routes([isPower, reply(503)], [isEra5, url => (url === era._recorded.address ? era : reply(404))]), { start: now });
    const r = await D.fetchWeather(FIXTURE_PLACES[place].lat, FIXTURE_PLACES[place].lon, real5.env), lastBoth = raw.time.filter((_, i) => typeof raw.temperature_2m_max[i] === 'number' && typeof raw.temperature_2m_min[i] === 'number').pop();
    // Farming reason for the last figure: the answer's newest day has a rain sum but no high and no low. It is a day still being filled, so that sum is part of a day's rain.
    // Kept, it would be shown as that day's rain and as the newest rain day; it is unknown until the day is whole. Every whole day keeps the rain the service sent.
    const wholeDays = raw.time.filter((_, i) => typeof raw.temperature_2m_max[i] === 'number' && typeof raw.temperature_2m_min[i] === 'number' && typeof raw.precipitation_sum[i] === 'number').length;
    same(`the recorded ERA5 answer for ${place}: read through its last real day, with every whole year complete, and no rain taken from a day without its temperatures`,
      [r.ok, r.backup, r.through, r.S.days.length, D.completeYears(r.S, now).length, r.S.rain.at(-1), r.S.rain.filter(real).length, r.S.rain.at(-2)], [true, true, lastBoth, raw.time.length, new Date(now).getUTCFullYear() - 2001, NaN, wholeDays, raw.precipitation_sum.at(-2)]);
    check(`…${place}: its newest days were not in yet when recorded, and they are unknown, not 0`, raw.temperature_2m_max.at(-1) === null && Number.isNaN(r.S.T2M_MAX.at(-1)) && r.through < raw.time.at(-1));
  }
});

// ---- the coldest night, from two records
await group('the coldest night from two records', async () => {
  const days = span('20010101', '20121231'), lows = days.map(day => (day.slice(4) === '0120' ? -(+day.slice(0, 4) - 2000) : 3));   // the coldest night of 2001 is −1, of 2002 −2, … of 2012 −12
  const cold = D.coldNights(days, lows);
  same('the lowest night of each year, and the middle year of them (between −6 and −7)', [cold.night, cold.years], [-6.5, 12]);
  // Farming reason for the figure: a tree is killed by a night that happened. A tenth of the way up the 12 sorted years (−12, −11, −10 …) is the second coldest, −11;
  // a figure worked out between two years (−10.9) is a night no year had, and it is the milder of the two readings. NASA's record and the second record use this one rule.
  same('a cold one-in-ten year is a year that happened: a tenth of the way up from the coldest year (−12, −11, −10 …)', cold.night10, -11);
  const march = days.map((_, i) => i).filter(i => days[i] >= '20120301'), without = k => lows.map((v, i) => (march.slice(0, k).includes(i) ? NaN : v));   // 2012 has 366 nights
  same('a year with 330 nights read counts, a year with 329 does not', [D.coldNights(days, without(36)).years, D.coldNights(days, without(37)).years], [12, 11]);
  same('an unread night is not a 0 °C night: a year of nulls is no year', D.coldFromDaily(archiveAnswer({ last: '20121231', names: ['temperature_2m_min'], value: (n, day) => (day.startsWith('2005') ? null : day.slice(4) === '0120' ? -8 : 4) }))?.years, 11);
  same('the second record needs 8 whole years: 7 are too few', [D.coldFromDaily(archiveAnswer({ last: '20071231', names: ['temperature_2m_min'] })), D.coldFromDaily(archiveAnswer({ last: '20081231', names: ['temperature_2m_min'] }))?.years], [null, 8]);
  same('nonsense is no record', [D.coldFromDaily(null), D.coldFromDaily({}), D.coldFromDaily({ daily: { time: ['x'] } })], [null, null, null]);
  const m = D.mergeCold({ night: -6, night10: -10 }, { night: -12, night10: -18 });
  same('NASA says −6, the second record −12: the middle (−9) is used, the colder (−12) is kept, NASA\'s own stays on record', [m.coldNight, m.coldLow, m.coldNasa, m.coldSecond, m.coldNight10, m.records], [-9, -12, -6, -12, -14, 2]);
  same('…and because they are 2 °C or more apart, the report says so and shows both', [m.differ, m.note], [true, 'In a normal winter NASA’s weather says about −6 °C and a second record (ERA5-Land) about −12 °C. They disagree, so the figure above is the middle of the two and the colder one is kept in mind.']);
  const other = D.mergeCold({ night: -12, night10: -18 }, { night: -6, night10: -10 });
  same('the colder is kept whichever record it comes from', [other.coldNight, other.coldLow], [-9, -12]);
  same('exactly 2 °C apart is said; 1.9 °C is not', [D.mergeCold({ night: -5, night10: -8 }, { night: -7, night10: -9 }).differ, D.mergeCold({ night: -5, night10: -8 }, { night: -6.9, night10: -9 }).differ, D.mergeCold({ night: -5, night10: -8 }, { night: -6.9, night10: -9 }).note], [true, false, '']);
  const alone = [D.mergeCold({ night: -6, night10: -10 }, null), D.mergeCold({ night: -6, night10: -10 }, { night: NaN, night10: NaN })];
  same('with no second record the figure is NASA\'s alone, and says it rests on one record', alone.map(x => [x.coldNight, x.coldLow, x.records, x.coldSecond, x.differ]), [[-6, -6, 1, NaN, false], [-6, -6, 1, NaN, false]]);
  same('with no NASA figure there is nothing to merge', [D.mergeCold(null, { night: -3, night10: -4 }), D.mergeCold({ night: NaN, night10: NaN }, null)], [null, null]);
  for (const place of ['barrie', 'valley']) {
    const p = fixture('power', place), land = fixture('era5land', place), now = recordedAt(p), w = world(routes([isPower, p], [isLand, url => (url === land._recorded.address ? land : reply(404))]), { start: now });
    const got = await D.fetchWeather(FIXTURE_PLACES[place].lat, FIXTURE_PLACES[place].lon, w.env), byYear = {};
    land.daily.time.forEach((t, i) => { const v = land.daily.temperature_2m_min[i]; if (typeof v === 'number') (byYear[t.slice(0, 4)] ||= []).push(v); });
    const each = Object.values(byYear).filter(v => v.length >= 330).map(v => Math.min(...v)).sort((a, b) => a - b), middle = each.length % 2 ? each[(each.length - 1) / 2] : (each[each.length / 2 - 1] + each[each.length / 2]) / 2;
    same(`the recorded answers for ${place}: NASA POWER is read, then the second record, whose middle year is worked out here from the raw answer`, [got.ok, got.backup, got.cold.ok, got.cold.source, got.cold.years, got.cold.night, got.sources], [true, false, true, 'era5land', each.length, middle, ['power', 'gpm']]);
    const nasa = D.coldNights(got.S.days, got.S.T2M_MIN), merged = D.mergeCold(nasa, got.cold);
    check(`…${place}: the figure used lies between the two records and the colder one is kept`, merged.coldNight <= Math.max(nasa.night, got.cold.night) && merged.coldNight >= Math.min(nasa.night, got.cold.night) && merged.coldLow === Math.min(nasa.night, got.cold.night), ser(merged));
  }
  const noLand = world(routes([isPower, GOOD], [isLand, reply(500)])), partly = await D.fetchWeather(10, 20, noLand.env);
  same('the second record down: the weather still stands, and the cold figure has a plain reason for resting on NASA alone', [partly.ok, partly.backup, partly.cold.ok, partly.cold.reason], [true, false, false, 'The second record of the coldest night (ERA5-Land) did not answer']);
  const sea = world(routes([isPower, GOOD], [isLand, archiveAnswer({ last: '20251231', names: ['temperature_2m_min'], value: () => null })])), atSea = await D.fetchWeather(10, 20, sea.env);
  same('a spot where the land record has only nulls: a reason, not a 0 °C winter', [atSea.cold.ok, atSea.cold.reason], [false, 'The second record of the coldest night (ERA5-Land) has too few years for this place']);
  const day = world(routes([isPower, GOOD], [isLand, GOOD_LAND])); await D.fetchWeather(10, 20, day.env); day.t += 23 * HOUR + 50 * 60e3;
  const second = await D.fetchEra5Cold(10, 20, day.env); day.t += 20 * 60e3;
  const third = await D.fetchEra5Cold(10, 20, day.env);
  same('the second record is kept 24 hours, and a kept one says so', [second.cached, third.cached, day.calls.filter(isLand).length], [true, false, 2]);
});

// ---- the forecast, the hours, the soil and the water loss
await group('the forecast and its four readings', async () => {
  const NOW = Date.UTC(2026, 10, 27, 9), today = iso(NOW), tomorrow = iso(NOW + DAY), F = D.buildForecast(forecastAnswer({ now: NOW }), NOW);
  same('the week is today and the six days after; 16 days ahead and 30 behind are kept apart', [F.days.length, F.days[0].date, F.days[6].date, F.ahead16.length, F.past.length, F.today], [7, today, iso(NOW + 6 * DAY), 16, 30, today]);
  const east = D.buildForecast(forecastAnswer({ now: Date.UTC(2026, 10, 27, 22), offset: 3 * 3600 }), Date.UTC(2026, 10, 27, 22));
  same('today is the field\'s own day, read with the service\'s own offset: at 22:00 UTC it is already tomorrow three hours east', [east.today, east.days[0].date, east.utcOffset], [iso(Date.UTC(2026, 10, 28)), iso(Date.UTC(2026, 10, 28)), 10800]);
  same('sunrise is read with that offset too: 07:29 on the field\'s clock is 04:29 UTC', [east.days[0].sunrise, new Date(east.days[0].sunriseAt).toISOString().slice(0, 16), new Date(east.days[0].sunsetAt).toISOString().slice(11, 16)], ['07:29', `${iso(Date.UTC(2026, 10, 28))}T04:29`, '14:39']);
  const noWind = D.buildForecast(forecastAnswer({ now: NOW, edit: (a, i) => { a.daily.wind_speed_10m_max[i] = null; a.daily.precipitation_probability_max[i] = null; } }), NOW);
  check('a day with only its wind missing stays, under its own date; the wind is unknown, never 0 and never "under 20 km/h"', noWind.days.length === 7 && noWind.days[0].date === today && Number.isNaN(noWind.days[0].wind) && !(noWind.days[0].wind < 20) && noWind.days[0].wind !== 0, ser(noWind.days[0]));
  check('a missing chance of rain is unknown, not 0%', Number.isNaN(noWind.days[0].rainChance) && noWind.days[1].rainChance === 40, ser(noWind.days[0].rainChance));
  const noRain = D.buildForecast(forecastAnswer({ now: NOW, edit: (a, i) => { a.daily.precipitation_sum[i] = null; a.daily.temperature_2m_max[i + 2] = null; } }), NOW);
  same('a day without its rain or its temperature is left out, and the days that stay keep their own dates: tomorrow is not made "today"', [noRain.days.length, noRain.days[0].date, noRain.today, noRain.days.some(d => d.date === iso(NOW + 2 * DAY)), noRain.ahead16[0].date, noRain.ahead16[0].rain], [5, tomorrow, today, false, today, NaN]);
  const soil = hoursOut => D.buildForecast(forecastAnswer({ now: NOW, edit: (a, i) => { for (let h = 0; h < hoursOut; h++) a.hourly.soil_temperature_6cm[i * 24 + h] = null; a.hourly.soil_temperature_6cm[i * 24 + 23] = 32; } }), NOW).soilT.find(d => d.date === today);
  same('the soil temperature of a day is a mean of at least 22 of its 24 hours: one warm hour among missing ones is no mean', [soil(2).hours, soil(2).value, soil(3).hours, soil(3).value], [22, (21 * 9 + 32) / 22, 21, NaN]);
  same('soil wetness 3 to 9 cm down, day by day', [F.soilM.length, F.soilM.find(d => d.date === today).value, F.soilT.find(d => d.date === today).value], [46, Array(24).fill(0.3).reduce((a, b) => a + b, 0) / 24, 9]);
  const gap = D.buildForecast(forecastAnswer({ now: NOW, edit: (a, i) => { a.daily.et0_fao_evapotranspiration[i + 3] = null; } }), NOW);
  same('the week\'s water loss and rain are sums of all 7 days, or nothing: a sum over 6 days would be a made-up low figure', [F.water, gap.water], [{ et0: 14, rain: 7, days: 7 }, { et0: NaN, rain: NaN, days: 6 }]);
  const hours = D.buildHourly(forecastAnswer({ now: NOW }), NOW);
  same('the hours: the last 3 days and the next 7, each with its temperature, humidity, dew point, rain and wind', [hours.length, hours[0].at, hours.at(-1).at, Object.keys(hours[0])], [240, NOW - 71 * HOUR, NOW + 168 * HOUR, ['time', 'at', 't', 'rh', 'dp', 'rain', 'wind']]);
  same('nonsense is no forecast', [D.buildForecast(null), D.buildForecast({}), D.buildForecast({ daily: { time: [] } }), D.buildHourly({ hourly: {} })], [null, null, null, null]);
  for (const place of PLACES) {
    const a = fixture('forecast', place), now = recordedAt(a), R = D.buildForecast(a, now), fieldDay = iso(now + a.utc_offset_seconds * 1000);
    same(`the recorded forecast for ${place}: seven dated days from the field's own today, 16 ahead, 30 behind, 240 hours`, [R.days.length, R.days[0].date, R.today, R.ahead16.length, R.past.length, D.buildHourly(a, now).length, R.utcOffset], [7, fieldDay, fieldDay, 16, 30, 240, a.utc_offset_seconds]);
    const i = a.daily.time.indexOf(fieldDay), sums = [0, 1, 2, 3, 4, 5, 6].reduce((t, k) => [t[0] + a.daily.et0_fao_evapotranspiration[i + k], t[1] + a.daily.precipitation_sum[i + k]], [0, 0]);
    check(`…${place}: today's high, low and rain are the service's own, and the week's water loss is the sum of its seven days`, R.days[0].tmax === a.daily.temperature_2m_max[i] && R.days[0].tmin === a.daily.temperature_2m_min[i] && R.days[0].rain === a.daily.precipitation_sum[i] && Math.abs(R.water.et0 - sums[0]) < 0.006 && Math.abs(R.water.rain - sums[1]) < 0.006, ser([R.days[0], R.water, sums]));
    check(`…${place}: sunrise comes before sunset on the field's own day`, R.days[0].sunriseAt < R.days[0].sunsetAt && iso(R.days[0].sunriseAt + a.utc_offset_seconds * 1000) === fieldDay && /^\d\d:\d\d$/.test(R.days[0].sunrise));
  }
  const w = world(routes([isForecast, url => forecastAnswer({ now: T0 })]));
  const four = [await D.fetchForecast(10, 20, w.env), await D.fetchHourlyWeather(10, 20, w.env), await D.fetchSoil(10, 20, w.env), await D.fetchWaterLoss(10, 20, w.env)];
  same('the week, the hours, the soil and the water loss are four readings of ONE answer: the service is asked once', [w.calls.length, four.map(r => r.ok), four.map(r => r.source), four.map(r => r.cached)], [1, [true, true, true, true], ['forecast', 'forecast', 'forecast', 'forecast'], [false, true, true, true]]);
  same('…each gives its own part', [four[0].days.length, four[1].hours.length, four[2].soilT.length, four[3].et0, four[3].rain], [7, 240, 46, 14, 7]);
  w.t = T0 + 59 * 60e3; const inHour = await D.fetchForecast(10, 20, w.env); w.t = T0 + 60 * 60e3; const afterHour = await D.fetchForecast(10, 20, w.env);
  same('the forecast is kept one hour: at 59 minutes it is the kept one and says so, at 60 it is asked anew', [inHour.cached, inHour.fetched, afterHour.cached, w.calls.length], [true, new Date(T0).toISOString(), false, 2]);
  let release; const gate = new Promise(done => { release = done; }), crowd = world(async () => { await gate; return forecastAnswer({ now: T0 }); }, { caches: null });
  const eight = Array.from({ length: 8 }, () => D.fetchForecast(10, 20, crowd.env)); release();
  same('eight callers at the same moment share one request', [(await Promise.all(eight)).every(r => r.ok), crowd.calls.length], [true, 1]);
  const words = [[D.fetchForecast, 'The forecast service'], [D.fetchHourlyWeather, 'The hourly weather service'], [D.fetchSoil, 'The soil forecast'], [D.fetchWaterLoss, 'The water-loss forecast']];
  for (const [ask, who] of words) {
    const late = await ask(10, 20, world(() => slow()).env), gone = await ask(10, 20, world(() => down()).env), odd = await ask(10, 20, world(() => ({ hello: 1 })).env), full = await ask(10, 20, world(() => reply(429)).env);
    same(`${who}: its own plain words when it is slow, silent, unreadable or busy, and no data`, [late, gone.reason, odd.reason, full.reason, 'days' in gone], [{ ok: false, reason: `${who} took too long`, status: null, retryAfter: null }, `${who} did not answer`, `${who} sent an answer Crophalo could not read`, `${who} is busy and asked us to wait`, false]);
  }
});

// ---- the source notes
await group('the source notes', async () => {
  const keys = Object.keys(SOURCES), all = Object.entries(SOURCES), texts = all.flatMap(([key, note]) => SOURCE_FIELDS.filter(f => f !== 'nasa').map(f => [`${key}.${f}`, note[f]]));
  same('the six weather sources come first, in this order (the table also holds the map\'s and the report\'s sources)', keys.slice(0, 6), ['power', 'gpm', 'merra2', 'forecast', 'era5', 'era5land']);
  same('the fields of a note', SOURCE_FIELDS, ['org', 'name', 'nasa', 'who', 'what', 'talk', 'url']);
  none('every note has every field and no other: who runs it, a plain line, how to explain it, the link, NASA or not', all.filter(([, note]) => ser(Object.keys(note)) !== ser(SOURCE_FIELDS) || typeof note.nasa !== 'boolean').map(([key]) => key));
  none('every text is there, with real words in it (a body\'s short name such as FAO may have three letters)', texts.filter(([at, text]) => typeof text !== 'string' || text.trim().length < (at.endsWith('.org') ? 3 : 4) || text !== text.trim()).map(([at]) => at));
  same('NASA\'s own sources are marked as NASA\'s, the others are not', all.filter(([, note]) => note.nasa).map(([key]) => key), ['power', 'gpm', 'merra2', 'smap', 'gibs']);
  none('the tag says NASA exactly when the source is NASA\'s, and names the other body when it is not', all.filter(([, note]) => (note.org === 'NASA') !== note.nasa || !note.org).map(([key]) => key));
  none('NASA is said once in a name, never twice', all.filter(([, note]) => (note.name.match(/NASA/g) || []).length > 1).map(([key]) => key));
  const notNasa = /\bnot\s+(from\s+)?nasa\b|\bnon-?nasa\b/i;
  none('no note defines a source by what it is not: no "Not NASA" wording', texts.filter(([, text]) => notNasa.test(text)).map(([at]) => at));
  none('no "Not NASA" wording in the two modules either, nor in the texts the weather answers carry', ['js/sources.js', 'js/data.js'].filter(rel => notNasa.test(sourceText(rel))));
  none('every weather link is a secure address on the source\'s own site', all.slice(0, 6).filter(([, note]) => !/^https:\/\/([a-z0-9-]+\.)*(nasa\.gov|open-meteo\.com)\//.test(note.url)).map(([key, note]) => `${key}: ${note.url}`));
  none('every other link is a secure address, and a NASA source links to NASA or its data centre', all.slice(6).filter(([, note]) => !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//.test(note.url) || (note.nasa && !/^https:\/\/([a-z0-9-]+\.)*(nasa\.gov|nsidc\.org)\//.test(note.url))).map(([key, note]) => `${key}: ${note.url}`));
  none('a plain line is short: one or two sentences', all.filter(([, note]) => note.what.length > 190).map(([key, note]) => `${key}: ${note.what.length}`));
  none('a record of the past is never called a forecast', ['power', 'gpm', 'merra2', 'era5', 'era5land'].filter(key => /forecast/i.test(SOURCES[key].what + SOURCES[key].talk + SOURCES[key].name)));
  const said = [D.RAIN_WHY, D.NO_WEATHER, D.BACKUP_CARD, D.backupNote({ through: '2026-11-19' }), D.rainNote(D.buildSeries(GOOD, D.cleanPlace(10, 20))), D.mergeCold({ night: -6, night10: -9 }, { night: -12, night10: -15 }).note];
  none('…nor do the texts of the weather record say "forecast" or give a chance in percent', said.filter(text => /forecast|%|chance/i.test(text)));
  none('each text of the weather record says NASA once at most', [...said, D.rainNote(D.buildSeries(powerAnswer({ last: YESTERDAY, value: m => (m === 'IMERG_PRECTOT' ? -999 : undefined) }), D.cleanPlace(10, 20))), D.heightNote(D.fitHeight({ ...D.buildSeries(GOOD, D.cleanPlace(10, 20)), cellElev: 300 }, 900))].filter(text => (text.match(/NASA/g) || []).length > 1));
  same('a key that is no source gives no note: "toString" and "__proto__" are not sources', [sourceNote('toString'), sourceNote('__proto__'), sourceNote('constructor'), sourceNote(undefined), sourceNote('power')?.name], [null, null, null, null, 'NASA POWER']);
  same('the source notes of one figure come NASA first, each once, and an unknown key is left out', sourceNotes(['era5land', 'gpm', 'nobody', 'power', 'gpm']).map(n => n.key), ['gpm', 'power', 'era5land']);
  same('which "i" a figure gets: NASA\'s when any of its sources is NASA\'s', [anyNasa(['era5land', 'power']), anyNasa(['forecast']), anyNasa(['era5', 'era5land']), anyNasa([]), anyNasa(['toString'])], [true, false, false, false, false]);
  const fresh = await D.fetchWeather(10, 20, world(routes([isPower, GOOD], [isLand, GOOD_LAND])).env), alt = await D.fetchWeather(10, 20, world(routes([isPower, reply(500)], [isEra5, GOOD_ERA])).env);
  const model = await D.fetchWeather(10, 20, world(routes([isPower, powerAnswer({ last: YESTERDAY, value: (m, day) => (m === 'IMERG_PRECTOT' ? -999 : behind(m, day)) })], [isLand, GOOD_LAND])).env);
  same('every weather answer names the source notes of its own sources, and each of them exists', [fresh.sources, model.sources, alt.sources, [...fresh.sources, ...model.sources, ...alt.sources, fresh.cold.source].every(key => sourceNote(key))], [['power', 'gpm'], ['power', 'merra2'], ['era5'], true]);
  check('the source notes say what the code does: 6.5 °C per 1,000 m, the middle of two records, 2 °C apart', SOURCES.power.talk.includes('6.5 °C cooler for every 1,000 m higher') && Math.abs(D.LAPSE * 1000 - 6.5) < 1e-12 && SOURCES.era5land.talk.includes('middle of the two') && SOURCES.era5land.talk.includes('2 °C or more apart'));
  const old = W('Tur', 'key');
  none('the country is written Türkiye', ['js/sources.js', 'js/data.js', 'scripts/record_fixtures.mjs'].filter(rel => new RegExp(old, 'i').test(sourceText(rel))));
  check('…and the recorded place in it carries that name', FIXTURE_PLACES.konya.name === 'Konya, Türkiye');
});

// ---- THE TWO HALVES AS ONE: each recorded place goes from the service's answer through js/data.js into js/climate.js
// The whole way for one place: the pretend services hold the recorded answers and the clock stands on the day they were recorded.
async function wholeWay(place, { nasaDown = false } = {}) {
  const p = fixture('power', place), land = fixture('era5land', place), era = fixture('era5', place), now = recordedAt(p), only = answer => url => (url === answer._recorded.address ? answer : reply(404));
  const w = world(routes([isPower, nasaDown ? reply(503) : p], [isLand, only(land)], [isEra5, only(era)]), { start: now });
  const got = await D.fetchWeather(FIXTURE_PLACES[place].lat, FIXTURE_PLACES[place].lon, w.env), fieldElev = fixture('forecast', place).elevation;   // the pin's own height, as the forecast answer gives it
  const S = D.fitHeight(got.S, fieldElev), opts = { today: iso(now), cold: got.cold };
  return { p, land, era, now, w, got, S, opts, fieldElev, C: K.computeClimate(S, S.lat, opts), F: K.computeFrost(S, S.lat, opts), Y: K.computeYTD(S, opts), G: K.computeGDD(S, S.lat, opts) };
}
// A second pass over the raw NASA answer, written the plainest way and using nothing of the app: one loop over the days.
function byHand(answer, lastFull) {
  const raw = answer.properties.parameter, fill = answer.header.fill_value, val = (m, key) => { const v = raw[m][key]; return typeof v === 'number' && v !== fill ? v : NaN; };
  const n = lastFull - 2000, at = y => y - 2001, zero = () => Array(n).fill(0), middle = list => { const s = list.filter(real).sort((a, b) => a - b), h = s.length >> 1; return !s.length ? NaN : s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const H = { frostByMonth: Array(12).fill(0), rainByMonth: Array(12).fill(0), rain: zero(), hot: zero(), low: Array(n).fill(Infinity), last: Array(n).fill(NaN), first: Array(n).fill(NaN), warmth: 0 };
  for (const key of Object.keys(raw.T2M_MIN).sort()) {
    const y = +key.slice(0, 4), m = +key.slice(4, 6) - 1, lo = val('T2M_MIN', key), hi = val('T2M_MAX', key), rain = val('IMERG_PRECTOT', key), doy = Math.round((ms8(key) - ms8(`${y}0101`)) / DAY) + 1;
    if (y === lastFull + 1 && key.slice(4) >= '0401' && key.slice(4) <= '0930') H.warmth += Math.max(0, (Math.min(hi, 30) + Math.max(Math.min(lo, 30), 10)) / 2 - 10);   // base 10 °C, cap 30 °C
    if (y > lastFull) continue;
    if (lo < 0) { H.frostByMonth[m]++; if (doy <= 182) H.last[at(y)] = doy; else if (!(H.first[at(y)] <= doy)) H.first[at(y)] = doy; }
    if (lo < H.low[at(y)]) H.low[at(y)] = lo;
    if (hi >= 32) H.hot[at(y)]++;
    if (real(rain)) { H.rain[at(y)] += rain; H.rainByMonth[m] += rain; }
  }
  const usual = list => (list.filter(real).length * 2 >= n ? middle(list) : NaN), lows = [...H.low].sort((a, b) => a - b), peak = (list, pick) => list.indexOf(pick(...list));
  return { n, frostByMonth: H.frostByMonth.map(v => v / n), rain: H.rain, usualRain: middle(H.rain), last: usual(H.last), first: usual(H.first), lastYears: H.last.filter(real).length, firstYears: H.first.filter(real).length,
    night: middle(H.low), night10: lows[Math.floor(n / 10)], hot: middle(H.hot), warmth: H.warmth, wettest: peak(H.rainByMonth, Math.max), driest: peak(H.rainByMonth, Math.min), frostless: [H.last.map(v => !real(v)), H.first.map(v => !real(v))] };
}

for (const place of PLACES) await group(`the two halves as one: ${FIXTURE_PLACES[place].name}`, async () => {
  const { p, land, now, got, S, opts, fieldElev, C, F, Y, G } = await wholeWay(place), lastFull = D.lastFullYear(now), years = Array.from({ length: lastFull - 2000 }, (_, i) => 2001 + i);
  same(`${place}: NASA POWER answers, the second cold record answers, and the climate is worked out for every whole year`, [got.ok, got.source, got.cold.ok, C.years], [true, 'power', true, years]);
  // what the weather half builds is exactly what the climate half reads
  const bare = { days: S.days, lat: S.lat, source: S.source, ...Object.fromEntries(D.MEASURES.map(m => [m, S[m]])) };
  same(`${place}: the climate half reads the days, the six measures, the latitude and the source, and nothing else of the record`, ser(K.computeClimate(bare, bare.lat, opts)), ser(C));
  none(`${place}: every measure is one plain list of numbers, as long as the days, with NaN (never null, never the fill value) where nobody read it`, D.MEASURES.filter(m => !Array.isArray(S[m]) || S[m].length !== S.days.length || S[m].some(v => typeof v !== 'number' || v === -999)));
  same(`${place}: both halves name the same years, the same last complete year, the same rain record and the same newest days`,
    [C.years, C.y1, C.rainSource, C.imerg, C.source, C.through, C.rainThrough, Y.temp.through, Y.gpm.through, Y.model.through, Y.soil.through],
    [D.completeYears(S, now), lastFull, S.rainSource, S.rainSource === 'imerg', S.source, S.through, dash(S.lastDate.IMERG_PRECTOT), S.through, dash(S.lastDate.IMERG_PRECTOT), dash(S.lastDate.PRECTOTCORR), dash(S.lastDate.GWETROOT)]);
  const table = D.yearTable(S).filter(y => y.year <= lastFull);
  none(`${place}: the yearly rain is one figure in both halves, year by year`, table.filter((y, k) => !(Math.abs(y.rainTotal - C.yearly.P[k]) <= 0.006)).map(y => `${y.year}: ${y.rainTotal} against ${C.yearly.P[C.years.indexOf(y.year)]}`));
  same(`${place}: the second record goes in as the weather half read it: the middle of the two is used, the colder kept, both on record`,
    [C.coldSecond, C.coldSecond10, C.coldNight, C.coldNight10, C.coldLow, C.coldRecords, C.coldDiffer], [got.cold.night, got.cold.night10, (C.coldNasa + got.cold.night) / 2, (C.coldNasa10 + got.cold.night10) / 2, Math.min(C.coldNasa, got.cold.night), 2, Math.abs(C.coldNasa - got.cold.night) >= 2]);

  // every indicator is a real number, or unknown on purpose
  const hand = byHand(p, lastFull);
  none(`${place}: every figure of the climate is a real number, or one of the unknowns listed above`, strays(C, NASA_UNKNOWNS));
  none(`${place}: the frost dates of the report are real days, or unknown only where fewer than half the years had that frost`, [['last', F.lastYears], ['first', F.firstYears]].filter(([side, n]) => real(F[side]) !== (n * 2 >= F.years)).map(([side, n]) => `${side}: ${F[side]} with ${n} of ${F.years} years`));
  none(`${place}: "this year so far" and the season's warmth are real numbers throughout`, [...strays(Y, []), ...strays(G, [])]);

  // counts are whole numbers and carry their denominators
  none(`${place}: every count is a whole number`, Object.entries({ ...recordCounts(C, F, Y, G), 'hot days so far': Y.hot.total }).filter(([, v]) => !whole(v)).map(([k, v]) => `${k} = ${v}`));
  none(`${place}: every count of days in a year is a whole number of days`, ['heat32', 'heat35', 'heavy', 'heavy50', 'dryRun', 'frostFree'].filter(k => !C.yearly[k].every(v => whole(v) && v <= 366)));
  check(`${place}: no count is larger than what it is counted out of`, countsFit(C, F, Y, G), ser([C.dryYears.length, C.dryOf, F]));
  const rainDays = D.rainDays(S);
  same(`${place}: the words give each count with its denominator`, [K.dryYearsWords(C), K.frostWords(F).includes(`frost in ${F.frostYears} of ${F.years} years`), D.rainNote(S).includes(`read on ${rainDays.imerg.toLocaleString('en-US')} of ${rainDays.days.toLocaleString('en-US')} days`)],
    [`${C.dryYears.length} of ${C.dryOf} years`, true, true]);

  // no text leaks an unknown, and the past is never called by a word for the future
  const texts = recordTexts(S, C, F, Y, G, got, now);
  none(`${place}: every text is a plain text: no "NaN", no "undefined", nothing left blank by mistake`, texts.filter(t => typeof t !== 'string' || BAD_TEXT.test(t)));
  none(`${place}: the record of the past is never called by the word for the days ahead`, texts.filter(t => FUTURE_WORD.test(t)));
  same(`${place}: the header names the newest day read, and says the answer is live`, D.weatherLine(got, now), `live · weather through ${D.dayText(S.through)}`);

  // the field's own height
  const own = K.computeClimate(got.S, got.S.lat, opts), dz = fieldElev - got.S.cellElev, moved = Math.abs(dz) >= 100;
  same(`${place}: the pin lies ${Math.round(dz)} m from the weather square's height, so the temperatures ${moved ? 'are moved 6.5 °C per 1,000 m' : 'are left as NASA gave them'}, and the rain is never touched`,
    [Math.round(S.dT * 1e6) / 1e6, C.monthly.tmean.map((v, m) => Math.round((v - own.monthly.tmean[m]) * 1e6) / 1e6), C.monthly.P, D.heightNote(S) !== ''], [moved ? Math.round(-0.0065 * dz * 1e6) / 1e6 : 0, Array(12).fill(moved ? Math.round(-0.0065 * dz * 1e6) / 1e6 : 0), own.monthly.P, moved]);

  // the second pass by hand, on NASA's own record (before the height correction)
  const F0 = K.computeFrost(got.S, got.S.lat, opts), G0 = K.computeGDD(got.S, got.S.lat, opts);
  same(`${place}, by hand: a year has no frost date exactly when the raw nights show no frost on that side of the year`, [own.yearly.frostLast.map(Number.isNaN), own.yearly.frostFirst.map(Number.isNaN)], hand.frostless);
  none(`${place}, by hand: frost nights of a normal year, month by month, are the raw nights under 0 °C divided by the ${hand.n} years`, own.monthly.frostByMonth.map((v, m) => (Math.abs(v - hand.frostByMonth[m]) < 1e-9 ? '' : `month ${m + 1}: ${v} against ${hand.frostByMonth[m]}`)).filter(Boolean));
  none(`${place}, by hand: each year's rain is the plain sum of its satellite days`, years.filter((y, k) => !(Math.abs(own.yearly.P[k] - hand.rain[k]) < 1e-6)));
  near(`${place}, by hand: the usual yearly rain is the middle one of those sums`, own.med.P, hand.usualRain, 1e-6);
  same(`${place}, by hand: the usual last spring frost, the usual first autumn frost and the days between them`, [F0.last, F0.first, F0.free, F0.lastYears, F0.firstYears], [hand.last, hand.first, hand.first - hand.last, hand.lastYears, hand.firstYears]);
  same(`${place}, by hand: the coldest night of a normal year and of a cold one-in-ten year, the hot days of a normal year`, [own.coldNasa, own.coldNasa10, own.med.heat32], [hand.night, hand.night10, hand.hot]);
  near(`${place}, by hand: the season's warmth is the sum of each day's heat units from 1 April to 30 September`, G0.total, hand.warmth, 1e-6);
  same(`${place}, by hand: the wettest and the driest month of a normal year`, [own.monthly.P.indexOf(Math.max(...own.monthly.P)), own.monthly.P.indexOf(Math.min(...own.monthly.P))], [hand.wettest, hand.driest]);
});

for (const place of PLACES) await group(`the two halves as one, on the back-up record: ${FIXTURE_PLACES[place].name}`, async () => {
  const { era, now, w, got, S, C, F, Y, G } = await wholeWay(place, { nasaDown: true }), lastFull = D.lastFullYear(now);
  same(`${place}: with NASA down the back-up record carries the climate, with its note, and the pin's height changes nothing (the record has no square height)`,
    [got.ok, got.backup, got.cold, C.source, C.rainSource, C.imerg, C.coldRecords, S.dT, C.years.length, w.calls.filter(isEra5).length], [true, true, null, 'era5', 'era5', false, 1, 0, lastFull - 2000, 1]);
  none(`${place}: every figure is a real number, or unknown because the back-up record has no soil wetness, no water-loss figure and no second cold record`, strays(C, BACKUP_UNKNOWNS));
  check(`${place}: what the back-up record does not have is unknown in every month and year, never drawn as zero`, [...C.monthly.ET, ...C.monthly.gw, ...C.yearly.stress, ...C.gwCal.flat(), C.coldSecond].every(Number.isNaN));
  none(`${place}: no month is missing where the service sent readings: every month has its temperature and rain normals`, [...C.gaps.temp, ...C.gaps.rain, ...C.monthly.tmean.map((v, m) => (real(v) ? null : m)), ...C.monthly.P.map((v, m) => (real(v) ? null : m))].filter(v => v !== null));
  same(`${place}: no satellite rain: "so far" rests on the record's own rain, and nothing is said to agree with it`, [Y.gpm, Y.modelSame, Y.agree, real(Y.model.total), real(Y.soil.mean)], [null, null, null, true, false]);
  // Farming reason: the newest day of the back-up answer comes with a rain figure but no high and no low. The day is still being filled, so its rain is part of a day's rain:
  // counted, it would name a newest rain day the record does not hold and show that day drier than it was.
  const newest = era.daily.time.length - 1, half = era.daily.temperature_2m_max[newest] === null && typeof era.daily.precipitation_sum[newest] === 'number';
  same(`${place}: the service's newest day has a rain figure but no temperatures: it is a day still being filled, and its rain is unknown, not ${era.daily.precipitation_sum[newest]} mm`,
    [half, S.PRECTOTCORR.at(-1), S.lastDate.PRECTOTCORR, S.days.at(-1)], [true, NaN, S.through.replace(/-/g, ''), era.daily.time[newest].replace(/-/g, '')]);
  same(`${place}: both halves name the same newest day, for the temperatures and for the rain`, [C.through, Y.temp.through, C.rainThrough, Y.model.through], [S.through, S.through, S.through, S.through]);
  const days = Object.fromEntries(era.daily.time.map((t, i) => [t.replace(/-/g, ''), i])), y = lastFull - 3, sum = era.daily.time.reduce((t, day, i) => t + (+day.slice(0, 4) === y ? era.daily.precipitation_sum[i] : 0), 0);
  near(`${place}, by hand: the rain of ${y} is the plain sum of that year's days in the raw answer`, C.yearly.P[C.years.indexOf(y)], sum, 1e-6);
  same(`${place}, by hand: a day reads as the service sent it (1 July of that year)`, [S.T2M_MAX[S.days.indexOf(`${y}0701`)], S.T2M_MIN[S.days.indexOf(`${y}0701`)]], [era.daily.temperature_2m_max[days[`${y}0701`]], era.daily.temperature_2m_min[days[`${y}0701`]]]);
  const texts = recordTexts(S, C, F, Y, G, got, now);
  none(`${place}: every text is a plain text on the back-up record too`, texts.filter(t => typeof t !== 'string' || BAD_TEXT.test(t) || FUTURE_WORD.test(t)));
  check(`${place}: the texts say whose record it is and what is missing`, got.note.includes('Open-Meteo (ERA5)') && got.note.includes(D.dayText(S.through)) && D.rainNote(S).includes('back-up record') && K.soilWords(Y).text === 'Root-zone wetness has not been read for the last 30 days.' && !texts.some(t => /GPM|satellite rain through/.test(t) && !/not available/.test(t)), ser([got.note, K.rainSoFarWords(Y).text]));
});

// ---- against a weather station: Environment Canada's published normals for Barrie
// Station BARRIE WPCC (climate identifier 6110557, 44.38 N 79.69 W), normals of 1981 to 2010, read from api.weather.gc.ca (collection climate-normals) on the day the fixtures were recorded.
// The limits were fixed before the figures were looked at (temperature within 2 °C, rain within 25%, and three months in four within 2 °C) and are never tuned to a result.
// A station is one point over 30 earlier years; NASA's square is about 50 km wide over 2001 to last year: they are held against each other as they are.
await group('against the weather station at Barrie', async () => {
  const STATION = { tmean: [-7.68, -6.58, -2.12, 5.63, 12.31, 17.94, 20.79, 19.73, 15.34, 8.7, 2.72, -3.46], yearMean: 6.94, yearRain: 932.94 };
  const p = fixture('power', 'barrie'), S = D.buildSeries(p, spot('barrie')), C = K.computeClimate(S, S.lat, { today: iso(recordedAt(p)) });
  const off = C.monthly.tmean.map((v, m) => v - STATION.tmean[m]), within = off.filter(d => Math.abs(d) <= 2).length, rain = C.yearly.P.reduce((t, v) => t + v, 0) / C.yearly.P.length;
  check('the yearly mean temperature is within 2 °C of the station\'s', Math.abs(C.med.T - STATION.yearMean) <= 2, `${C.med.T.toFixed(2)} against ${STATION.yearMean}`);
  check('the mean yearly rain and snow is within 25% of the station\'s', Math.abs(rain / STATION.yearRain - 1) <= 0.25, `${rain.toFixed(0)} mm against ${STATION.yearRain} mm`);
  check('at least three months in four are within 2 °C of the station\'s monthly mean', within >= 9, `${within} of 12; off by ${off.map(d => d.toFixed(1)).join(', ')}`);
});

// ---- the modules themselves, and the recorder
await group('the modules and the recorder', async () => {
  const page = /\b(document|window|localStorage|sessionStorage|navigator|indexedDB)\b/;
  none('neither module touches a page, a window or the browser\'s storage', ['js/data.js', 'js/sources.js'].filter(rel => page.test(sourceText(rel))));
  check('the source-notes module makes no request at all, and the weather module only through the fetch it is handed', !/\bfetch\b|caches/.test(sourceText('js/sources.js').replace(/\/\/.*$/gm, '')) && (sourceText('js/data.js').match(/globalThis\.fetch/g) || []).length === 1);
  const names = PLACES.flatMap(place => Object.keys(FIXTURE_KINDS).map(kind => fixtureName(kind, place))), onDisk = fs.readdirSync(FIX);
  none('every recorded answer is there', names.filter(file => !onDisk.includes(file)));
  none('every recorded answer says the day it was recorded and the address that was asked', names.filter(file => { const r = JSON.parse(fs.readFileSync(path.join(FIX, file), 'utf8'))._recorded; return !r || !/^\d{4}-\d\d-\d\d$/.test(r.date) || !/^https:\/\/(power\.larc\.nasa\.gov|archive-api\.open-meteo\.com|api\.open-meteo\.com)\//.test(r.address); }));
  same('the recorder leaves recorded answers alone: with all of them there it asks for nothing', recordPlan(names), []);
  same('…it asks only for the one that is missing', recordPlan(names.filter(f => f !== 'era5_konya.json'), false, T0).map(s => [s.file, s.url]), [['era5_konya.json', D.era5Url(spot('konya'), T0)]]);
  const anew = recordPlan(names, true, T0);
  same('…and records all sixteen again only when asked with --again, one place at a time', [anew.length, anew.slice(0, 4).map(s => s.place), anew.slice(0, 4).map(s => s.kind)], [16, ['barrie', 'barrie', 'barrie', 'barrie'], ['power', 'era5', 'era5land', 'forecast']]);
  const script = sourceText('scripts/record_fixtures.mjs');
  check('the recorder names itself honestly to the services and sends nothing personal', /'User-Agent': AGENT/.test(script) && /const AGENT = 'Crophalo\//.test(script) && !/@[\w-]+\.[a-z]{2,}/i.test(script) && /--again/.test(script));
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
