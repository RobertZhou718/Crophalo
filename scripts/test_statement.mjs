// Crophalo's season-record suite: ranks only, never a loss or a money verdict, and a day with no reading is never 0 mm. This record may be shown to a bank
// or a landlord, so each rule is tested, and the words are scanned for what it must never say. The drought route is checked against a local stand-in for
// the two services it asks. RULE: never loosen a check to make it pass; fix the project. No internet is needed. Run: node scripts/test_statement.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { rankWords, median, seasonWindow, pastWindows, longestDry, buildRows, buildRecord, droughtWords, recordHTML, canOffer, daysWithData, FIXED_LINE, FOOTER, shortDay, longDay } from '../js/statement.js';
import { createDrought, parseWeeks, inUS, LIMITS } from './drought.mjs';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

// ---- ranks in words
const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], twentyFive = Array.from({ length: 25 }, (_, i) => i + 1);
same('the lowest of 25', rankWords(1, twentyFive), 'lowest of 25 years');
same('the highest of 25', rankWords(25, twentyFive), 'highest of 25 years');
same('the third lowest', rankWords(3, twentyFive), '3rd lowest of 25 years');
same('the nearer end wins: 23 is the 3rd highest', rankWords(23, twentyFive), '3rd highest of 25 years');
same('ordinals: 11th, 12th, 13th, 21st, 22nd, 23rd', [11, 12, 13, 21, 22, 23].map(v => rankWords(v, Array.from({ length: 60 }, (_, i) => i + 1)).split(' ')[0]), ['11th', '12th', '13th', '21st', '22nd', '23rd']);
same('a tie is joint', rankWords(2, [1, 2, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]), 'joint 2nd lowest of 21 years');
same('a tie at the top', rankWords(30, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 30, 30]), 'joint highest of 22 years');
same('under 20 years it says how few', rankWords(3, ten), '3rd lowest (only 10 years with data)');
same('all the same is joint lowest', rankWords(5, Array(20).fill(5)), 'joint lowest of 20 years');
same('no value or a single year gives no rank', [rankWords(NaN, ten), rankWords(1, [1]), rankWords(null, ten)], ['', '', '']);
same('the middle season is the median', [median([3, 1, 2]), median([4, 1, 2, 3]), median([])], [2, 2.5, null]);

// ---- the season
const WIN = seasonWindow({ today: '2026-11-14', sowDoy: 285, harvestDoy: 340 });
same('the newest season sown on or before today, still running', WIN, { start: '2026-10-12', end: '2026-11-14', soFar: true, label: '2026' });
same('a season finished', seasonWindow({ today: '2026-12-30', sowDoy: 285, harvestDoy: 312 }), { start: '2026-10-12', end: '2026-11-08', soFar: false, label: '2026' });
same('a sowing day still to come belongs to last year\'s season', seasonWindow({ today: '2026-03-01', sowDoy: 285, harvestDoy: 312 }).start, '2025-10-12');
same('a season across New Year is one', seasonWindow({ today: '2026-02-01', sowDoy: 285, harvestDoy: 60 }), { start: '2025-10-12', end: '2026-02-01', soFar: true, label: '2025–26' });
same('the farmer\'s own dates win', seasonWindow({ today: '2026-11-14', sowDay: '2026-10-20', harvestDay: '2026-11-10', sowDoy: 100, harvestDoy: 200 }), { start: '2026-10-20', end: '2026-11-10', soFar: false, label: '2026' });
same('no sowing day, no season', [seasonWindow({ today: '2026-11-14' }), seasonWindow({ today: '2026-11-14', sowDay: '2027-01-01' }), seasonWindow({ today: '2026-11-14', sowDoy: 400 })], [null, null, null]);
const past = pastWindows(WIN);
same('the same calendar days back to 2001: 26 seasons, newest first', [past.length, past[0].year, past.at(-1).year, past[1].start, past[1].end], [26, 2026, 2001, '2025-10-12', '2025-11-14']);
same('29 February falls on the 28th in other years', pastWindows({ start: '2024-02-29', end: '2024-03-10', soFar: false })[1].start, '2023-02-28');

// ---- a series to test with: 2001-01-01 to 2026-11-14, rain from a simple pattern
const START = '2001-01-01', DAYS = Math.round((Date.parse('2026-11-14') - Date.parse(START)) / 864e5) + 1;
const dayAt = i => new Date(Date.parse(START) + i * 864e5).toISOString().slice(0, 10);
function series(shape = {}) {
  const s = { start: START, rain: [], rainModel: [], tmax: [], tmin: [] };
  for (let i = 0; i < DAYS; i++) {
    const day = dayAt(i), y = +day.slice(0, 4), md = day.slice(5), inSeason = md >= '10-12' && md <= '11-14';
    const wet = (y * 31 + i * 17) % 4 === 0, rain = wet ? 4 + (y % 5) : 0.2;
    const pick = (f, ...a) => f ? f(...a) : undefined;   // a function may answer null (a missing day): only "no function" falls back to the pattern
    const r = shape.rain ? shape.rain(day, y, inSeason, rain) : rain;
    s.rain.push(r); s.rainModel.push(shape.rainModel ? shape.rainModel(day, y, inSeason, rain) : rain);
    s.tmax.push(shape.tmax ? shape.tmax(day, y, inSeason) : 14 + (y % 4)); s.tmin.push(shape.tmin ? shape.tmin(day, y, inSeason) : 3 + (y % 3));
  }
  return s;
}
const rowOf = (built, start) => built.rows.find(r => r.label.startsWith(start));
const units = { rain: 'mm', temp: 'C' };
// this season is the driest of all
const dry = series({ rain: (d, y, ins, r) => ins && y === 2026 ? 0 : r, rainModel: (d, y, ins, r) => ins && y === 2026 ? 0 : r });
const b1 = buildRows({ series: dry, win: WIN, units });
check('rows are built and the rain total is the lowest of 26 years', b1.ok && /^lowest of 26 years$/.test(rowOf(b1, 'Rain,').rank), brief(rowOf(b1, 'Rain,')));
same('its label has the dates', rowOf(b1, 'Rain,').label, 'Rain, 12 Oct to 14 Nov');
check('the middle season is shown in millimetres', /^\d+ mm$/.test(rowOf(b1, 'Rain,').middle) && rowOf(b1, 'Rain,').value === '0 mm');
check('a longest dry spell row with days', /days?$/.test(rowOf(b1, 'Longest dry spell').value) && rowOf(b1, 'Longest dry spell').rank.includes('highest'));
check('whole calendar months inside the season get their own row (Oct is partial, Nov is partial: none here)', b1.rows.filter(r => /^(Oct|Nov) rain$/.test(r.label)).length === 0);
const longSeason = seasonWindow({ today: '2026-11-14', sowDoy: 274, harvestDoy: 330 });   // 1 Oct to 14 Nov: October is whole
check('a whole month in the season gets a row', buildRows({ series: dry, win: longSeason, units }).rows.some(r => r.label === 'Oct rain'));
// a missing day is never 0 mm
const gappy = series({ rain: (d, y, ins, r) => y === 2026 && ins && d >= '2026-10-20' && d <= '2026-10-22' ? null : r });
const b2 = buildRows({ series: gappy, win: WIN, units }), full = buildRows({ series: series(), win: WIN, units });
check('missing days leave the total out, they are not zero', parseFloat(rowOf(b2, 'Rain,').value) >= parseFloat(rowOf(full, 'Rain,').value) - 3 * 8 && b2.notes.some(n => /3 days of this season had no rain reading/.test(n)));
same('the note says they are not counted as dry', b2.notes.find(n => /no rain reading/.test(n)).includes('not counted as dry days'), true);
same('a missing day ends a dry spell, it does not extend it', [longestDry([0, 0, null, 0, 0, 0]), longestDry([0, 0, 0, 0]), longestDry([5, 0, 0, 5, 0]), longestDry([1, 1])], [3, 4, 2, 0]);
check('a day of exactly 1 mm is not a dry day', longestDry([1, 0.9, 1]) === 1);
const noRain = (d, y, ins, r) => y === 2026 && ins ? (d > '2026-10-20' ? null : r) : r;
const bad = series({ rain: noRain, rainModel: noRain });
same('a season with more than a tenth of its days missing cannot be ranked', buildRows({ series: bad, win: WIN, units }).ok, false);
const old = series({ rain: (d, y, ins, r) => y === 2010 && ins ? null : r });
check('an old season with too many missing days is left out, and the count of years drops', buildRows({ series: old, win: WIN, units }).years === 25, buildRows({ series: old, win: WIN, units }).years);
// satellite or model rain
const noSat = series({ rain: () => null });
const b3 = buildRows({ series: noSat, win: WIN, units });
check('with no satellite rain the model rain is used for every year, and it says so', b3.ok && b3.notes.some(n => /NASA’s weather model for every year/.test(n)));
check('with satellite rain there is no such note', !full.notes.some(n => /weather model/.test(n)));
// heat and frost
const hot = series({ tmax: (d, y, ins) => y === 2026 && ins && d === '2026-10-25' ? 36.4 : 14 });
const b4 = buildRows({ series: hot, win: WIN, units });
check('the hottest day is ranked in whole degrees', rowOf(b4, 'Hottest day').value === '36 °C' && /highest/.test(rowOf(b4, 'Hottest day').rank), brief(rowOf(b4, 'Hottest day')));
check('very hot days appear when they happened this season', !!rowOf(b4, 'Very hot days') && rowOf(b4, 'Very hot days').value === '1 day');
check('and not when they did not happen this season or in three past ones', !rowOf(full, 'Very hot days'));
check('very hot days appear when only one of the last three seasons had them', !!rowOf(buildRows({ series: series({ tmax: (d, y, ins) => y === 2024 && ins && d === '2024-10-25' ? 37 : 14 }), win: WIN, units }), 'Very hot days'));
const bF = buildRows({ series: hot, win: WIN, units: { rain: 'mm', temp: 'F' } });
check('in °F it ranks whole Fahrenheit degrees and says so', rowOf(bF, 'Hottest day').value === '98 °F' && bF.notes.some(n => /whole degrees Fahrenheit/.test(n)));
const frosty = series({ tmin: (d, y, ins) => y === 2026 && ins && d >= '2026-11-01' && d <= '2026-11-03' ? -2 : 3 });
check('frost nights since sowing are counted', rowOf(buildRows({ series: frosty, win: WIN, units }), 'Frost nights').value === '3 nights');
check('inches are shown when asked', /^\d+\.\d in$/.test(rowOf(buildRows({ series: series(), win: WIN, units: { rain: 'in', temp: 'C' } }), 'Rain,').value));
check('a first-estimate note when the newest rain is not final', buildRows({ series: series(), win: WIN, units, firstEstimate: 5 }).notes.some(n => /first estimate/.test(n)));
check('the back-up weather note is carried', buildRows({ series: series(), win: WIN, units, backupNote: 'Weather is from the back-up record.' }).notes.includes('Weather is from the back-up record.'));
check('the record is offered from 30 days of weather', daysWithData(series(), WIN) === 34 && canOffer(series(), WIN) && !canOffer(series(), seasonWindow({ today: '2026-11-14', sowDay: '2026-11-01' })) && !canOffer(series(), null));

// ---- never a loss or a money verdict
const rec = buildRecord({ name: 'North field', place: 'Barrie, Ontario', crop: 'Corn', series: dry, win: WIN, units, drought: null, madeOn: '2026-11-14', sources: ['NASA POWER'], notes: [] });
const BANNED = /\b(loss|losses|lost|yield|yields|claim|claims|insurance|insured|money|profit|income|damage|damaged|compensation|payout|worth|cost|costs|crop failure|disaster|once in \d+|1-in-\d+|\$|US\$|€)\b|\$|€|£/i;
const spoken = [rec.seasonLine, ...rec.rows.flatMap(r => [r.label, r.value, r.rank, r.middle]), ...rec.notes, rec.drought].join('\n');
check('the rows, ranks and notes never say a loss, a yield, a claim or money', !BANNED.test(spoken), spoken.match(BANNED)?.[0]);
check('the fixed first line says what it is not', FIXED_LINE.startsWith('Public weather data for an area about 50 km wide around this field.') && /not a loss assessment/.test(FIXED_LINE) && /nothing about yields or money/.test(FOOTER));
same('the season line says the crop, the sowing day and the season so far', rec.seasonLine, 'Corn, you sow about 12 Oct. Season: 12 Oct 2026 to 14 Nov 2026 (the season so far).');
const html = recordHTML(rec);
check('the page has the title, the fixed line, the table with its four columns and the footer', /Crophalo season weather record/.test(html) && html.includes(FIXED_LINE) && (html.match(/<th scope="col">/g) ?? []).length === 4 && html.includes('Ranks only: this record says nothing about yields or money.'));
check('every figure carries its column name for the narrow layout', /data-label="This season"/.test(html) && /data-label="Rank"/.test(html) && /data-label="Middle season"/.test(html));
check('words from outside are shown as plain text', !/<img/.test(recordHTML({ ...rec, name: '<img src=x onerror=1>', myNotes: ['<b>x</b>'], notes: ['<i>'] })));
same('my notes are in only when given', [/My notes/.test(html), /My notes \(written by me\)/.test(recordHTML({ ...rec, myNotes: ['The low corner stayed wet.'] }))], [false, true]);
check('a record that cannot be ranked has no table but still has its fixed line', (() => { const h = recordHTML(buildRecord({ name: 'x', series: bad, win: WIN, units, madeOn: '2026-11-14' })); return !/<table/.test(h) && h.includes(FIXED_LINE) && /too many days with no rain reading/.test(h); })());

// ---- the drought words
const week = (date, d0, d1, d2 = 0, d3 = 0, d4 = 0) => ({ date, d0, d1, d2, d3, d4 });
const weeks = [week('2026-10-13', 90, 60, 20), week('2026-10-14', 90, 70, 55), week('2026-10-20', 90, 70, 10), week('2026-10-27', 80, 55, 0), week('2026-11-03', 70, 10, 0), week('2026-11-10', 60, 0, 0), week('2026-10-12', 100, 100, 100)];
check('a county in drought for part of the season, worst week named', droughtWords({ weeks, county: 'Story County', state: 'IA', from: '2026-10-12', to: '2026-11-14' }) === "Half or more of Story County, Iowa was in drought (D1, moderate, or worse) for 5 of the season's 7 weeks. At its worst, severe drought (D2), in the week of 12 Oct 2026.", droughtWords({ weeks, county: 'Story County', state: 'IA', from: '2026-10-12', to: '2026-11-14' }));
const calm = [week('2026-10-13', 60, 5), week('2026-10-20', 55, 0), week('2026-10-27', 20, 0), week('2026-11-03', 5, 0)];
same('a county with no drought, and the weeks that were abnormally dry', droughtWords({ weeks: calm, county: 'Story County', state: 'IA', from: '2026-10-12', to: '2026-11-14' }), "Half or more of Story County, Iowa was not in drought (D1, moderate, or worse) in any of the season's 4 weeks. It was abnormally dry (D0) for 2 of them.");
check('a moderate worst week has no "at its worst" clause', !/At its worst/.test(droughtWords({ weeks: [week('2026-10-13', 90, 60)], county: 'A County', state: 'IA', from: '2026-10-12', to: '2026-11-14' })));
same('no weeks in the season, or no county, is no line', [droughtWords({ weeks: [], county: 'A', state: 'IA', from: 'x', to: 'y' }), droughtWords({ weeks, county: '', state: 'IA', from: '2026-10-12', to: '2026-11-14' }), droughtWords({ weeks: null })], ['', '', '']);
check('the drought line says nothing about losses or money', !BANNED.test(droughtWords({ weeks, county: 'Story County', state: 'IA', from: '2026-10-12', to: '2026-11-14' })));
same('a state code we do not know is left out, not guessed', droughtWords({ weeks: [week('2026-10-13', 90, 60)], county: 'A County', state: 'ZZ', from: '2026-10-12', to: '2026-11-14' }).slice(0, 40), 'Half or more of A County was in drought ');

// ---- the drought route, against a local stand-in for the FCC and the Drought Monitor
const CSV = 'MapDate,FIPS,County,State,None,D0,D1,D2,D3,D4,ValidStart,ValidEnd,StatisticFormatID\r\n20261013,19169,Story County,IA,10.00,90.00,60.00,20.00,0.00,0.00,2026-10-13,2026-10-19,1\r\n20261020,19169,Story County,IA,10.00,90.00,70.00,55.00,0.00,0.00,2026-10-20,2026-10-26,1\r\n20261027,19169,Story County,IA,100.00,0.00,0.00,0.00,0.00,0.00,2026-10-27,2026-11-02,1\r\n';
let fccHits = 0, usdmHits = 0, fccAnswer = { results: [{ county_fips: '19169', county_name: 'Story County', state_code: 'IA' }] }, usdmStatus = 200;
const seen = [];
const stand = http.createServer((req, res) => {
  seen.push(req.url);
  if (req.url.startsWith('/api/census/area')) { fccHits++; res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(fccAnswer)); }
  if (req.url.startsWith('/api/CountyStatistics/')) { usdmHits++; res.writeHead(usdmStatus, { 'content-type': 'text/csv' }); return res.end(usdmStatus === 200 ? CSV : 'no'); }
  res.writeHead(404); res.end();
});
await new Promise(r => stand.listen(0, '127.0.0.1', r));
const standBase = `http://127.0.0.1:${stand.address().port}`, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-drought-'));
let clock = Date.parse('2026-11-14T12:00:00Z');
const drought = createDrought({ dir: tmp, env: { FW_FCC_UPSTREAM: standBase, FW_DROUGHT_UPSTREAM: standBase }, now: () => clock });
const server = http.createServer(async (req, res) => { if (!await drought.handle(req, res, new URL(req.url, 'http://x'))) { res.writeHead(404); res.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const call = async q => { const res = await fetch(`http://127.0.0.1:${server.address().port}/api/drought?${q}`); return { status: res.status, json: await res.json() }; };
const Q = 'lat=42.03&lon=-93.62&from=20261012&to=20261114';
same('weeks are parsed from the service\'s table', parseWeeks(CSV).map(w => [w.date, w.d1, w.d2]), [['2026-10-13', 60, 20], ['2026-10-20', 70, 55], ['2026-10-27', 0, 0]]);
same('a broken table gives nothing', [parseWeeks(''), parseWeeks('a,b\r\n1,2'), parseWeeks('MapDate,D0,D4\r\n20261013,x,1')], [[], [], []]);
const ok = await call(Q);
same('a good answer: the county, its weeks, the state and the fips', [ok.status, ok.json.ok, ok.json.county, ok.json.state, ok.json.fips, ok.json.weeks.length, ok.json.cached], [200, true, 'Story County', 'IA', '19169', 3, false]);
check('the answer holds the county and never the position', !/42\.03|-93\.62|93\.6/.test(JSON.stringify(ok.json)));
same('the stand-in was asked the FCC with the point rounded to 0.001, and the Drought Monitor with US dates', [seen.find(u => u.startsWith('/api/census/area')), seen.find(u => u.startsWith('/api/CountyStatistics/')).includes('startdate=10/12/2026&enddate=11/14/2026')], ['/api/census/area?lat=42.030&lon=-93.620&censusYear=2020&format=json', true]);
const again = await call(Q);
same('asked again: from the cache, nobody asked twice', [again.json.cached, fccHits, usdmHits], [true, 1, 1]);
same('another point in the same county rounds apart but the weeks are shared', (await call('lat=42.5&lon=-93.4&from=20261012&to=20261114')).json.county, 'Story County');
check('nothing on disk holds the position: no file name and no content', fs.readdirSync(path.join(tmp, 'drought')).every(f => !/42|93/.test(f.replace(/[0-9a-f]{24}/g, '').replace(/19169|2026\d+/g, ''))) && fs.readdirSync(path.join(tmp, 'drought')).every(f => !/-93\.6|42\.03/.test(fs.readFileSync(path.join(tmp, 'drought', f), 'utf8'))), fs.readdirSync(path.join(tmp, 'drought')).join(' '));
check('the cache files are private', fs.readdirSync(path.join(tmp, 'drought')).every(f => (fs.statSync(path.join(tmp, 'drought', f)).mode & 0o077) === 0));
clock += 25 * 36e5; await call(Q);
same('after 24 hours the weeks are asked again, the county (30 days) is not', [usdmHits, fccHits], [2, 2]);
const outside = await call('lat=37.87&lon=32.48&from=20261012&to=20261114');
same('outside the United States: final, with the plain reason, and nobody was asked', [outside.status, outside.json, fccHits], [200, { ok: false, final: true, reason: 'The US Drought Monitor covers only the United States' }, 2]);
fccAnswer = { results: [] };
same('Canada lies inside the coarse box, so the FCC is asked, finds no county, and the answer is final', [(await call('lat=44.4&lon=-79.78&from=20261012&to=20261114')).json.final, fccHits], [true, 3]);
same('a point the FCC knows no county for is also final', (await call('lat=26.0&lon=-96.5&from=20261012&to=20261114')).json.final, true);
fccAnswer = { results: [{ county_fips: '19169', county_name: 'Story County', state_code: 'IA' }] };
usdmStatus = 500;
const down = await call('lat=41.0&lon=-93.0&from=20261012&to=20261113');
same('a service that fails is told plainly, with a 502', [down.status, down.json], [502, { ok: false, reason: 'The US Drought Monitor could not be read just now' }]);
usdmStatus = 200;
same('the parameters: no place', [(await call('from=20261012&to=20261114')).json.reason, (await call('lat=91&lon=0&from=20261012&to=20261114')).status, (await call('lat=x&lon=1&from=20261012&to=20261114')).status], ['lat and lon are required (decimal degrees)', 400, 400]);
same('the parameters: dates', [(await call('lat=42&lon=-93&from=2026-10-12&to=20261114')).json.reason, (await call('lat=42&lon=-93&from=20261340&to=20261114')).json.reason], ['from and to must be dates written YYYYMMDD', 'from and to must be dates written YYYYMMDD']);
same('the parameters: order, the future and the first day', [(await call('lat=42&lon=-93&from=20261114&to=20261012')).json.reason, (await call('lat=42&lon=-93&from=20261012&to=20261120')).json.reason, (await call('lat=42&lon=-93&from=19991201&to=20000301')).json.reason],
  Array(3).fill('from must come before to, and to cannot be in the future (the Drought Monitor starts in 2000)'));
same('at most 400 days at once', [(await call('lat=42&lon=-93&from=20250101&to=20261114')).json.reason, (await call('lat=42&lon=-93&from=20250411&to=20260515')).status], ['At most 400 days can be read at once', 200]);
same('the lines of the United States', [inUS(42.03, -93.62), inUS(61.2, -149.9), inUS(21.3, -157.8), inUS(18.2, -66.5), inUS(44.4, -79.78), inUS(37.87, 32.48), inUS(51.5, -0.1)], [true, true, true, true, true, false, false]);
const post = await fetch(`http://127.0.0.1:${server.address().port}/api/drought?${Q}`, { method: 'POST' });
same('only GET', post.status, 405);
same('other routes are not this one\'s', (await fetch(`http://127.0.0.1:${server.address().port}/api/other`)).status, 404);
let limited = null; for (let i = 0; i < LIMITS.perMinute + 5 && !limited; i++) { const r = await call(Q); if (r.status === 429) limited = r; }
check('too many asks in a minute from one visitor are turned away', limited?.json?.reason === 'Too many requests. Wait a moment and try again.');
server.close(); stand.close(); fs.rmSync(tmp, { recursive: true, force: true });
same('dates in words', [shortDay('2026-10-12'), longDay('2026-10-12')], ['12 Oct', '12 Oct 2026']);

console.log(`statement: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
