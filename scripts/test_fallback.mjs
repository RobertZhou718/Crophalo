// The back-up weather suite: 16 awkward places of the world through the back-up record alone (Open-Meteo ERA5), from the service's answer to the climate and its words.
// The first run asks the service once for each place, one at a time, and keeps each answer in scripts/_cache/fallback/; later runs need no internet and write nothing.
// A place with no kept answer is "not checked": never a pass, and never a failure of the app. Run: node scripts/test_fallback.mjs   (--again asks for every place anew)
// RULE: never loosen a check here to make it pass without a written farming reason beside the check itself. A failure means a farmer far from the well-read places would see a made-up figure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from '../js/data.js';
import * as K from '../js/climate.js';
import { BACKUP_UNKNOWNS, strays, BAD_TEXT, FUTURE_WORD, whole, recordTexts, recordCounts, countsFit } from './weather_checks.mjs';

// ---- the counting
let passed = 0, failed = 0;
const ser = v => JSON.stringify(v, (_, x) => (typeof x === 'number' && !Number.isFinite(x) ? `<${x}>` : x === undefined ? '<undefined>' : x));   // NaN must not pass for null
const brief = v => { const s = typeof v === 'string' ? v : ser(v) ?? String(v); return s.length > 260 ? s.slice(0, 260) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, ser(got) === ser(want), `got ${brief(got)}, wanted ${brief(want)}`);
const none = (name, list) => check(name, list.length === 0, `${list.length}: ${list.slice(0, 5).join(' · ')}`);
async function group(name, run) { try { await run(); } catch (e) { check(`${name}: ran to its end`, false, e?.stack?.split('\n').slice(0, 2).join(' ') || String(e)); } }

// ---- the 16 places, each with plain facts about it that are not in doubt. The facts and their limits were written before any answer was looked at.
// r is { S, C, F, Y, G }: the daily record, the climate, the frost dates, this year so far and the season's warmth.
const noFrost = r => r.F.frostYears === 0 && r.C.monthly.frostByMonth.every(v => v === 0), frostAllYear = r => r.F.allYear === true && r.F.everyMonth === r.F.years;
const PLACES = [
  { id: 'greenland', name: 'the Greenland ice cap (Summit)', lat: 72.58, lon: -38.46, facts: [['frost in every month of every year', frostAllYear], ['the coldest night of a normal year is −45 °C or colder', r => r.C.coldNight <= -45], ['no day reaches 32 °C', r => r.C.med.heat32 === 0]] },
  { id: 'vostok', name: 'Vostok, Antarctica', lat: -78.46, lon: 106.84, facts: [['frost in every month of every year', frostAllYear], ['the coldest night of a normal year is −65 °C or colder', r => r.C.coldNight <= -65], ['it lies in the south', r => r.C.south === true && r.F.south === true]] },
  { id: 'sahara', name: 'the Sahara (Tanezrouft)', lat: 24, lon: 0.5, facts: [['under 100 mm of rain in a normal year', r => r.C.med.P < 100], ['a dry place', r => r.C.dry === true], ['30 or more days of 32 °C a year', r => r.C.med.heat32 >= 30]] },
  { id: 'atlantic', name: 'the open Atlantic', lat: 30, lon: -40, facts: [['no frost in any year', noFrost], ['no day reaches 35 °C', r => r.C.med.heat35 === 0]] },
  { id: 'deadsea', name: 'the Dead Sea shore', lat: 31.5, lon: 35.5, facts: [['90 or more days of 32 °C a year', r => r.C.med.heat32 >= 90], ['a dry place', r => r.C.dry === true]] },
  { id: 'oymyakon', name: 'Oymyakon, Siberia', lat: 63.46, lon: 142.79, facts: [['the coldest night of a normal year is −50 °C or colder', r => r.C.coldNight <= -50], ['a cold winter', r => r.C.coldWinter === true], ['frost in every year', r => r.F.frostYears === r.F.years]] },
  { id: 'tuvalu', name: 'Tuvalu (Funafuti)', lat: -8.52, lon: 179.2, facts: [['no frost in any year', noFrost], ['in the tropics, south of the equator', r => r.C.tropic === true && r.C.south === true], ['not a dry place', r => r.C.dry === false]] },
  { id: 'tibet', name: 'the Tibetan plateau (Changtang)', lat: 33, lon: 86, facts: [['a cold winter', r => r.C.coldWinter === true], ['no day reaches 32 °C', r => r.C.med.heat32 === 0], ['frost in every year', r => r.F.frostYears === r.F.years]] },
  { id: 'atacama', name: 'the Atacama desert', lat: -21.65, lon: -69.53, facts: [['under 50 mm of rain in a normal year', r => r.C.med.P < 50], ['a dry place', r => r.C.dry === true]] },
  { id: 'amazon', name: 'the Amazon (near Manaus)', lat: -3.1, lon: -60, facts: [['no frost in any year', noFrost], ['over 1,500 mm of rain in a normal year', r => r.C.med.P > 1500], ['in the tropics, with a wet season named', r => r.C.tropic === true && r.C.season !== null]] },
  { id: 'cherrapunji', name: 'Cherrapunji, India', lat: 25.3, lon: 91.7, facts: [['over 2,000 mm of rain in a normal year', r => r.C.med.P > 2000], ['the wettest month is one of June to August', r => [5, 6, 7].includes(r.C.monthly.P.indexOf(Math.max(...r.C.monthly.P)))]] },
  { id: 'deathvalley', name: 'Death Valley, California', lat: 36.46, lon: -116.87, facts: [['90 or more days of 35 °C a year', r => r.C.med.heat35 >= 90], ['under 200 mm of rain in a normal year', r => r.C.med.P < 200]] },
  { id: 'northpole', name: 'the North Pole', lat: 90, lon: 0, facts: [['frost in every year', r => r.F.frostYears === r.F.years], ['the coldest night of a normal year is −30 °C or colder', r => r.C.coldNight <= -30], ['no day reaches 28 °C', r => r.C.monthly.heatByMonth[0].every(v => v === 0)]] },
  { id: 'dateline', name: 'the date line (Taveuni, Fiji)', lat: -16.85, lon: 180, facts: [['the 180 line is written −180', r => r.S.lon === -180], ['no frost in any year', noFrost], ['in the tropics, south of the equator', r => r.C.tropic === true && r.C.south === true]] },
  { id: 'zero', name: 'latitude 0, longitude 0 (the Gulf of Guinea)', lat: 0, lon: 0, facts: [['no frost in any year', noFrost], ['in the tropics, counted with the north', r => r.C.tropic === true && r.C.south === false]] },
  { id: 'ushuaia', name: 'Ushuaia, Tierra del Fuego', lat: -54.8, lon: -68.3, facts: [['it lies in the south, outside the tropics', r => r.C.south === true && r.C.tropic === false], ['no day reaches 32 °C', r => r.C.med.heat32 === 0], ['frost in every year', r => r.F.frostYears === r.F.years]] },
];

// ---- the kept answers, and a polite way to ask for the ones not kept yet
const HERE = path.dirname(fileURLToPath(import.meta.url)), KEPT = path.join(HERE, '_cache', 'fallback'), AGAIN = process.argv.includes('--again');
const AGENT = 'Crophalo/1 (crop rotation planner; back-up weather test, 16 places, asked once)';   // a plain, honest name; nothing personal is sent
const PAUSE = 5000, sleep = ms => new Promise(done => setTimeout(done, ms)), clockOf = date => Date.parse(`${date}T12:00:00Z`);
let stopped = '', asked = 0;   // once the service says stop, or cannot be reached, it is not asked again in this run
const WAIT = path.join(KEPT, '_wait.json'), clockText = ms => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
try { const wait = JSON.parse(fs.readFileSync(WAIT, 'utf8')); if (Date.now() < wait.until) stopped = `the service asked us to wait until ${clockText(wait.until)}; it is not asked before then`; } catch { /* nobody asked us to wait */ }   // a wait the service asked for is kept from one run to the next
function readKept(place) {
  try { const kept = JSON.parse(fs.readFileSync(path.join(KEPT, `${place.id}.json`), 'utf8')); return kept?._recorded?.date && kept._recorded.address ? kept : null; } catch { return null; }
}
async function askOnce(place) {   // the very address the app asks; one request, never a second try
  const began = Date.now(), url = D.era5Url(D.cleanPlace(place.lat, place.lon), began);
  if (asked++) await sleep(PAUSE);
  let res;
  try { res = await fetch(url, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(60e3) }); }
  catch (e) { stopped = `the service could not be reached (${e?.cause?.code || e?.name || 'no connection'})`; return null; }
  if (res.status === 429) {   // too many requests: no second try, and the wait it names is written down so that the next run does not ask early either
    const secs = D.waitSeconds(res.headers.get('retry-after')), until = Date.now() + secs * 1000;
    fs.mkdirSync(KEPT, { recursive: true }); fs.writeFileSync(WAIT, JSON.stringify({ until, seconds: secs }));
    stopped = `the service asked us to wait ${secs} s, until ${clockText(until)}; it was not asked again`; return null;
  }
  if (!res.ok) { stopped = `the service answered ${res.status}`; return null; }
  const kept = { _recorded: { date: new Date(began).toISOString().slice(0, 10), address: url }, ...await res.json() };
  fs.mkdirSync(KEPT, { recursive: true }); fs.writeFileSync(path.join(KEPT, `${place.id}.json`), JSON.stringify(kept)); fs.rmSync(WAIT, { force: true });
  const head = name => (res.headers.get(name) === null ? NaN : Number(res.headers.get(name))), left = head('x-ratelimit-remaining'), cost = head('x-ratelimit-cost'), reset = head('x-ratelimit-reset');
  console.log(`asked Open-Meteo for ${place.name}: kept (${Date.now() - began} ms${Number.isFinite(cost) ? `, counted as ${Math.round(cost)} calls, ${Math.round(left)} left this minute` : ''})`);
  if (left < cost + 50 && Number.isFinite(reset)) { const secs = Math.min(65, Math.max(1, Math.ceil(reset - Date.now() / 1000) + 1)); console.log(`  letting the service's minute run out: ${secs} s`); await sleep(secs * 1000); }   // a long record counts as some 200 calls of the 600 a minute: never ask for one the minute cannot hold
  return kept;
}

// ---- one place, the whole way: NASA is down, the back-up answers, the climate and every sentence are worked out
const real = Number.isFinite, DAYS_IN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
async function checkPlace(place, kept) {
  const now = clockOf(kept._recorded.date), calls = [], spot = D.cleanPlace(place.lat, place.lon), today = new Date(now).toISOString().slice(0, 10), lastFull = D.lastFullYear(now);
  const env = { now: () => now, wait: async () => {}, caches: undefined, fetch: async url => { calls.push(url); return url.startsWith('https://power.larc.nasa.gov/') ? new Response('', { status: 503 }) : url === kept._recorded.address ? new Response(JSON.stringify(kept)) : new Response('', { status: 404 }); } };
  const got = await D.fetchWeather(place.lat, place.lon, env), raw = kept.daily, n = place.name;
  // what the service really sent, counted here without the module
  const sent = { both: 0, rain: 0, temp: Array(12).fill(0), wet: Array(12).fill(0) }, num = v => typeof v === 'number';
  raw.time.forEach((t, i) => { const m = +t.slice(5, 7) - 1, full = +t.slice(0, 4) <= lastFull, both = num(raw.temperature_2m_max[i]) && num(raw.temperature_2m_min[i]); const wet = both && num(raw.precipitation_sum[i]);   // a day without its temperatures is still being filled: its rain figure is part of a day
    sent.both += both; sent.rain += wet; if (full && both) sent.temp[m]++; if (full && wet) sent.wet[m]++; });
  if (sent.both / raw.time.length < 0.9) {   // the service has no weather here: the app must say so in plain words, never guess
    same(`${n}: the service sent temperatures on ${sent.both} of ${raw.time.length} days only, so the app gives its plain reason and no figure`, [got.ok, got.reason, BAD_TEXT.test(ser(got.tried))], [false, D.NO_WEATHER, false]);
    return;
  }
  same(`${n}: NASA is down, so the back-up record is asked, once, and carries the report with its note`, [got.ok, got.backup, got.source, got.cold, got.sources, got.card, calls.length, calls[1] === kept._recorded.address], [true, true, 'era5', null, ['era5'], D.BACKUP_CARD, 2, true]);
  const S = D.fitHeight(got.S, kept.elevation), opts = { today, cold: got.cold }, r = { S, C: K.computeClimate(S, S.lat, opts), F: K.computeFrost(S, S.lat, opts), Y: K.computeYTD(S, opts), G: K.computeGDD(S, S.lat, opts) }, { C, F, Y, G } = r;
  same(`${n}: the record says whose it is, and that it has no satellite rain, soil wetness, water-loss figure or square height`,
    [S.source, S.rainSource, S.altWeather, S.lat, S.lon, S.dT, Number.isNaN(S.cellElev), S.IMERG_PRECTOT.every(Number.isNaN), S.GWETROOT.every(Number.isNaN), S.EVLAND.every(Number.isNaN)], ['era5', 'era5', 'Open-Meteo (ERA5)', spot.lat, spot.lon, 0, true, true, true, true]);
  same(`${n}: every whole day the service sent is in the record, and not one reading more`, [S.days.filter((_, i) => real(S.T2M_MAX[i]) && real(S.T2M_MIN[i])).length, S.PRECTOTCORR.filter(real).length, S.days.length], [sent.both, sent.rain, raw.time.length]);
  // every figure is a real number, or unknown on purpose
  const south = C.years.length - 1, crossing = C.season !== null && C.season.start > 6;   // a growing season that runs past New Year: the last whole year's season is not over in the record
  const allowed = [...BACKUP_UNKNOWNS, ...(F.lastYears === 0 ? [/^med\.frostLast$/] : []), ...(F.firstYears === 0 ? [/^med\.frostFirst$/] : []),   // a place where no year had that frost has no usual date for it
    ...(crossing ? [new RegExp(`^yearly\\.(gsRain|dryRun)\\.${south}$`)] : [])];
  none(`${n}: every figure of the climate is a real number, or unknown for a reason that is written down`, strays(C, allowed));
  check(`${n}: what the back-up record does not have is unknown everywhere, never drawn as zero`, [...C.monthly.ET, ...C.monthly.gw, ...C.yearly.stress, ...C.gwCal.flat(), C.coldSecond].every(Number.isNaN));
  none(`${n}: the frost dates are real days, or unknown only where fewer than half the years had that frost`, [['last', F.lastYears], ['first', F.firstYears]].filter(([side, count]) => real(F[side]) !== (count * 2 >= F.years)).map(([side, count]) => `${side}: ${F[side]} with ${count} of ${F.years} years`));
  same(`${n}: every whole year since 2001 counts`, C.years, Array.from({ length: lastFull - 2000 }, (_, i) => 2001 + i));
  // no month is missing where the service has data
  const need = m => 0.5 * (lastFull - 2000) * DAYS_IN[m], lost = [];
  for (let m = 0; m < 12; m++) { if (sent.temp[m] >= need(m) && !real(C.monthly.tmean[m])) lost.push(`temperature, month ${m + 1}`); if (sent.wet[m] >= need(m) && !real(C.monthly.P[m])) lost.push(`rain, month ${m + 1}`); }
  none(`${n}: no month is missing where the service sent readings`, [...lost, ...C.gaps.temp.map(m => `gap: temperature, month ${m + 1}`), ...C.gaps.rain.map(m => `gap: rain, month ${m + 1}`)]);
  // this year so far and the season's warmth: no satellite, so nothing is compared with it; what is there is a number or a named unknown
  same(`${n}: "so far" rests on the record's own rain: no satellite figure, nothing said to agree, soil wetness not read`, [Y.gpm, Y.modelSame, Y.agree, real(Y.soil.mean), Y.source], [null, null, null, false, 'era5']);
  none(`${n}: "so far" and the season's warmth are real numbers, or unknown only as a share of a normal that is zero`, [...strays({ model: Y.model, temp: Y.temp, hot: Y.hot }, [/^model\.pct$/]), ...strays(G, [/^pct$/])]
    .concat(Number.isNaN(Y.model.pct) && Y.model.normal !== 0 ? [`rain so far has no percentage though the normal is ${Y.model.normal}`] : [], Number.isNaN(G.pct) && G.normal !== 0 ? [`warmth has no percentage though the normal is ${G.normal}`] : []));
  // counts, with their denominators
  none(`${n}: every count is a whole number`, Object.entries(recordCounts(C, F, Y, G)).filter(([, v]) => !whole(v)).map(([k, v]) => `${k} = ${v}`));
  check(`${n}: no count is larger than what it is counted out of`, countsFit(C, F, Y, G), ser([C.dryYears.length, C.dryOf, F]));
  // every text
  const texts = recordTexts(S, C, F, Y, G, got, now);
  none(`${n}: every text is a plain text: no "NaN", no "undefined", and the past is never called by the word for the days ahead`, texts.filter(t => typeof t !== 'string' || BAD_TEXT.test(t) || FUTURE_WORD.test(t)));
  check(`${n}: the header and the note name the newest day read and the back-up record`, D.weatherLine(got, now) === `live · weather through ${D.dayText(S.through)}` && got.note.includes('Open-Meteo (ERA5)') && got.note.includes(D.dayText(S.through)) && S.through >= `${lastFull + 1}-01-01`, ser([got.note, S.through]));
  // the plain facts about the place
  for (const [fact, holds] of place.facts) check(`${n}: ${fact}`, holds(r) === true, ser({ rain: Math.round(C.med.P), coldNight: C.coldNight, heat32: C.med.heat32, heat35: C.med.heat35, frostYears: F.frostYears, years: F.years, dry: C.dry, coldWinter: C.coldWinter, season: C.season?.start }));
}

// ---- the run
const unchecked = [];
for (const place of PLACES) await group(place.name, async () => {
  let kept = AGAIN ? null : readKept(place);
  if (kept && kept._recorded.address !== D.era5Url(D.cleanPlace(place.lat, place.lon), clockOf(kept._recorded.date))) { unchecked.push(`${place.name}: the kept answer is for another address than the app asks now (run with --again)`); return; }
  if (!kept && !stopped) kept = await askOnce(place);
  if (!kept) { unchecked.push(`${place.name}: no kept answer${stopped ? `, and ${stopped}` : ''}`); return; }
  await checkPlace(place, kept);
});
same('16 places, each named once', [PLACES.length, new Set(PLACES.map(p => p.id)).size], [16, 16]);
for (const line of unchecked) console.log(`NOT CHECKED  ${line}`);
if (unchecked.length) console.log(`${unchecked.length} of ${PLACES.length} places were not checked. Not checked is not passed: run this suite again ${/asked us to wait/.test(stopped) ? 'after that time' : 'with the internet'}.`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed || unchecked.length ? 1 : 0);
