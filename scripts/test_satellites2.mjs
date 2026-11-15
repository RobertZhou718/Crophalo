// Crophalo's GRACE-FO and ECOSTRESS suite: the two answers as the server gives them and the cards built from them. A month or pass nobody could read is a gap or a reason, never a number;
// a trend is given with its years; day and night passes are never mixed; the region is said to be about 300 km and the pixel about 70 m. The server's routes are replaced by stubs.
// RULE: never loosen a check to make it pass; fix the project. No internet is needed. Run: node scripts/test_satellites2.mjs
import { plainReason, NOT_HERE, NOT_NOW, TOO_LONG, NASA_OFF, NO_POSITION, NO_COUNTRY, ECO_NO_COVER, graceDirection, ecoSummary, GRACE_PUMPING, GRACE_NO_DECLINE, GRACE_RULE, ECO_CLOUD, ECO_WHY45, ECO_GAVE_UP, readSoFar, loadEcoUntilDone, cleanHls, hlsWords, loadHls, windowWords, HLS_DOWN, HLS_SCALE, cleanGrace, graceWords, cleanEco, ecoWords, loadGrace, loadEco, GRACE_DOWN, ECO_DOWN, GRACE_MEANS, ECO_MEANS, monthWords } from '../js/satellites2-data.js';
import { hlsCardHTML, hlsChartSVG, graceCardHTML, ecoCardHTML, graceChartSVG } from '../js/satellites2-view.js';
import { satellitesHTML } from '../js/satellites-view.js';
const YR = 2026, G0 = 2016;   // the year of the hand-made ECOSTRESS and HLS answers' days, and the first year of the hand-made GRACE-FO record (with the real gap between GRACE and GRACE-FO in its second and third years)

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

// a GRACE-FO answer with the gap of the second and third years in it (July to May, as between GRACE and GRACE-FO)
const GAP = [`${G0 + 1}-07`, `${G0 + 2}-05`], NEWEST = `${G0 + 7}-12`, TREND_FROM = `${G0 + 2}-06`;
const months = []; for (let i = 0; i < 12 * 8; i++) { const y = G0 + Math.floor(i / 12), m = String(i % 12 + 1).padStart(2, '0'), key = `${y}-${m}`; months.push([key, key >= GAP[0] && key <= GAP[1] ? null : Math.round((2 - i * 0.1 + (i % 3)) * 100) / 100, key >= GAP[0] && key <= GAP[1] ? null : 1.4]); }
const GOOD = { ok: true, months, months_read: months.filter(r => r[1] !== null).length, gaps: 11, newest_month: NEWEST, value_cm: -5.2, uncertainty_cm: 1.4, trend_cm_per_year: -1.1, trend_from: TREND_FROM, trend_to: NEWEST, trend_years: 5.6, trend_note: 'A trend over 5.6 years.', cell: { lat: 43.25, lon: -80.75 }, area_km: 300, data_date: `${NEWEST}-31` };
const g = cleanGrace(GOOD);
check('a good GRACE answer is rebuilt', g.ok && g.months.length === 96 && g.read === 85 && g.km === 300, brief(g.read));
same(`the gap is found in the series itself: one run, Jul ${G0 + 1} to May ${G0 + 2}`, g.gaps, [{ from: GAP[0], to: GAP[1] }]);
check('a gap month is null, never 0', g.months.filter(m => m.month >= GAP[0] && m.month <= GAP[1]).every(m => m.cm === null && m.unc === null));
same('the trend carries its years', g.trend, { perYear: -1.1, from: TREND_FROM, to: NEWEST, years: 5.6 });
const w = graceWords(g);
check('the words give the newest month, the trend with its years, and what the figure means', w.lines[0].includes(`Dec ${G0 + 7}`) && w.lines.some(l => l.includes(`Jun ${G0 + 2} to Dec ${G0 + 7}`) && l.includes('5.6 years') && l.includes('not one month')) && w.lines.at(-1) === GRACE_MEANS);
check('the words say "about 300 km" in the region sentence', GRACE_MEANS.includes('300 km') && GRACE_MEANS.includes('not a well in your field'));
check('the gap is named as left empty, never joined', w.lines.some(l => l.includes(`Jul ${G0 + 1} to May ${G0 + 2}`) && /never joined/.test(l)));
const noTrend = cleanGrace({ ...GOOD, trend_cm_per_year: null }); check('no trend: none is shown and the words say so', noTrend.trend === null && graceWords(noTrend).lines.some(l => /not enough record/.test(l)));
check('a trend with a bad year is dropped', cleanGrace({ ...GOOD, trend_from: 'x' }).trend === null);
check('a refusal keeps its reason', cleanGrace({ ok: false, reason: 'No GRACE data for this cell.' }).reason === 'No GRACE data for this cell.');
check('nothing read is a refusal, not a number', !cleanGrace({ ok: true, months: [['2020-01', null, null]] }).ok);
for (const bad of [null, 5, 'x', [], { ok: true }, { ok: true, months: 'x' }]) check(`a hostile GRACE answer ${brief(bad)} is refused`, !cleanGrace(bad).ok);
{ const h = cleanGrace({ ...GOOD, months: [['2020-13', 5, 1], ['2020-01', '5', 1], ['2020-02', 1e9, 1], ['2020-03', -3.456, -2], ['2020-03', 4, 1], [null], 7] }); same('hostile months: only the usable one stays, the later duplicate wins', h.months.map(m => [m.month, m.cm]), [['2020-01', null], ['2020-02', null], ['2020-03', 4]]); }
{ const html = graceCardHTML(g); check('GRACE card: one source link, the DOI, the region, the table, the means sentence', /class="sat-src"><a href="https:/.test(html) && html.includes('10.5067/TEMSC-3JC634') && html.includes('about 300 km') && html.includes('<table') && html.includes('not a well in your field'), html.slice(0, 200));
  const svg = graceChartSVG(g); check('the chart breaks its line at the gap: one path per unbroken run', (svg.match(/class="gr-line"/g) ?? []).length === 2, (svg.match(/class="gr-line"/g) ?? []).length);
  check('the chart marks the gap and draws the trend', svg.includes('class="gr-gap"') && svg.includes('class="gr-trend"'));
  check('the chart is a labelled image', /role="img" aria-label="Water stored/.test(svg));
  check('no month is drawn at zero for a gap', !svg.includes('NaN'));
  check('loading and refusal cards say so', graceCardHTML({ loading: true }).includes('Reading') && (graceCardHTML({ ok: false, reason: 'No.' }).includes('No.') && !/not read yet/i.test(graceCardHTML({ ok: false, reason: 'No.' })))); }

// an ECOSTRESS answer
const P = (date, dn, c, solar) => ({ date, utc: '15:00', solar_time: solar, solar_date: date, day_night: dn, lst_c: c, lst_k: c + 273.15, error_k: 1.5, orbit: 1, version: '002', granule: 'g' });
const EG = { ok: true, passes: [P(`${YR}-11-10`, 'day', 14.2, '13:12:00'), P(`${YR}-11-08`, 'night', 3.1, '01:40:00'), P(`${YR}-10-30`, 'day', 17.9, '12:55:00')], clear_passes: 3, passes_checked: 9, not_usable: { cloud: 4, quality: 1, water: 0, no_data: 1 }, read_errors: 0, newest_clear: `${YR}-11-10`, window: 'the last 60 days', pixel_m: 70 };
const e = cleanEco(EG);
check('a good ECOSTRESS answer is rebuilt, newest first', e.ok && e.passes.length === 3 && e.passes[0].date === `${YR}-11-10` && e.pixel === 70);
check('the words show "local solar time", never "local time"', ecoWords(e).lines.length && ecoCardHTML(e).includes('local solar time') && !/local time/.test(ecoCardHTML(e)));
{ const html = ecoCardHTML(e); check('day and night are in separate lists, never one', html.includes('Daytime passes') && html.includes('Night passes') && html.indexOf('Daytime passes') < html.indexOf('14.2') && html.indexOf('Night passes') > html.indexOf('17.9'));
  check('it says they are never compared', ecoWords(e).lines.some(l => /never compared/.test(l)));
  check('the ground-not-air sentence and the 70 m dot', html.includes('seen from space at about 70 m, not the air temperature') && html.includes('class="eco-dot"') && ECO_MEANS.includes('70 m'));
  check('one source link and the product name', html.includes('class="sat-src"') && html.includes('ECO_L2T_LSTE') && html.includes('LP DAAC'));
  check('the reasons passes were not used', ecoWords(e).lines.some(l => /4 for cloud/.test(l) && /1 for poor quality/.test(l))); }
{ const none = cleanEco({ ok: true, passes: [], clear_passes: 0, passes_checked: 5, not_usable: { cloud: 5 }, why_none: 'All 5 passes in the last 60 days were under cloud.', pixel_m: 70 }); const html = ecoCardHTML(none);
  check('no clear pass: the reason is shown, never a number', html.includes('All 5 passes in the last 60 days were under cloud.') && !/°C/.test(html) && html.includes('No clear pass')); }
{ const none = cleanEco({ ok: true, passes: [] }); check('no clear pass with no reason from the server still says so, with no number', /No clear pass/.test(ecoCardHTML(none)) && !/°C/.test(ecoCardHTML(none))); }
{ const h = cleanEco({ ...EG, passes: [P('bad', 'day', 10, '12:00'), P(`${YR}-11-01`, 'dusk', 10, '12:00'), P(`${YR}-11-02`, 'day', 999, '12:00'), P(`${YR}-11-03`, 'day', NaN, '12:00'), P(`${YR}-11-04`, 'night', 2, '<b>x</b>'), null, 5] }); same('hostile passes: only the usable one stays', h.passes.map(p => p.date), [`${YR}-11-04`]); check('a bad time becomes words, not markup', ecoCardHTML(h).includes('time not given') && !ecoCardHTML(h).includes('<b>x</b>')); }
same('a login problem is never told to a farmer: the card says the NASA reading is not available', cleanEco({ ok: false, reason: 'Needs a login.' }).reason, NASA_OFF);
for (const bad of [null, 5, 'x', [], { ok: true }, { ok: true, passes: {} }]) check(`a hostile ECOSTRESS answer ${brief(bad)} is refused`, !cleanEco(bad).ok);
check('markup in the reason is escaped', ecoCardHTML({ ok: false, reason: '<img src=x onerror=1>' }).includes('&lt;img'));
// the routes
{ const asked = []; const stub = body => async url => { asked.push(url); return { json: async () => body }; };
  const a = await loadGrace({ lat: 43.1312, lon: -80.7499 }, stub(GOOD)); const b = await loadEco({ lat: 43.1312, lon: -80.7499 }, stub(EG));
  check('both lookups ask their own route with the position to four decimals', asked[0] === '/api/gracecell?lat=43.1312&lon=-80.7499' && asked[1] === '/api/ecopass?lat=43.1312&lon=-80.7499', asked.join(' '));
  check('and give back clean answers', a.ok && b.ok);
  same('a failed fetch is a sentence, not a number', [(await loadGrace({ lat: 1, lon: 2 }, async () => { throw new Error('x'); })).reason, (await loadEco({ lat: 1, lon: 2 }, async () => { throw new Error('x'); })).reason], [GRACE_DOWN, ECO_DOWN]);
  same('no position asks nothing', [(await loadGrace({}, stub(GOOD))).ok, (await loadEco(null, stub(EG))).ok, asked.length], [false, false, 2]); }
{ const html = satellitesHTML({ grace: g, eco: e }); check('the tab shows both cards and no "still to come" for them', html.includes('data-card="grace"') && html.includes('data-card="ecostress"') && !/still to come|will show how hot/.test(html)); }
same('month words', [monthWords(NEWEST), monthWords('x')], [`Dec ${G0 + 7}`, '']);

// ---- the server's ecopass window is { first, last }, not text
same('the window object becomes two days in words', windowWords({ first: `${YR}-09-20`, last: '2026-11-14' }), '20 September to 14 November');
same('a bad window object is nothing, text stays text', [windowWords({ first: 'x' }), windowWords('the last 60 days'), windowWords(null)], ['', 'the last 60 days', '']);
check('the pass sentence reads the window object', ecoWords(cleanEco({ ...EG, window: { first: `${YR}-09-20`, last: '2026-11-14' } })).lines.some(l => l.includes('20 September to 14 November')) && !/\[object/.test(JSON.stringify(ecoWords(cleanEco({ ...EG, window: { first: `${YR}-09-20`, last: '2026-11-14' } })))));
// ---- GRACE gaps: only long stretches in the sentence
{ const ms = []; for (let i = 0; i < 48; i++) { const k = `${G0 + 3 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`; ms.push([k, [3, 9, 15, 16, 17, 30, 31].includes(i) ? null : i * 0.1, 1]); }
  const gg = cleanGrace({ ok: true, months: ms, area_km: 300 }), line = graceWords(gg).lines.find(l => /no data/.test(l)); check('several short gaps are counted, only the long stretch is named', gg.gaps.length === 4 && line.includes(`Apr ${G0 + 4} to Jun ${G0 + 4}`) && /3 shorter gaps/.test(line) && line.length < 200, line); }
// ---- HLS greenness
const HP = (date, ndvi) => ({ date, sensor: 'S30', ndvi, clear_pixels: 90, of_pixels: 100 });
const HG = { ok: true, passes: [HP(`${YR}-08-12`, 0.71), HP(`${YR}-07-02`, 0.52), HP(`${YR}-09-30`, 0.28), HP(`${YR}-06-01`, 9), { date: 'bad', ndvi: 0.3 }, null], gaps: [{ from: 'a' }, { from: 'b' }], newest_date: `${YR}-09-30`, newest_ndvi: 0.28 };
const hh = cleanHls(HG);
same('HLS: usable photos only, oldest first', hh.passes.map(p => p.date), [`${YR}-07-02`, `${YR}-08-12`, `${YR}-09-30`]);
check('HLS: the newest clear photo and its greenness', hh.newest.date === `${YR}-09-30` && hh.newest.ndvi === 0.28 && hh.gaps === 2);
{ const html = hlsCardHTML(hh); check('HLS card: one source link, the scale, the credit, one dot for each photo, no line', html.includes('class="sat-src"') && html.includes(HLS_SCALE) && html.includes('LP DAAC') && html.includes('NASA/USGS Harmonized Landsat Sentinel-2') && (html.match(/class="hl-dot"/g) ?? []).length === 3 && !html.includes('<path'));
  check('HLS words: empty days are left empty, never joined', hlsWords(hh).lines.some(l => /left empty, never joined/.test(l))); }
{ const none = cleanHls({ ok: true, passes: [], why_none: 'All 6 photos in the last 90 days were under cloud.' }), html = hlsCardHTML(none); check('HLS: no clear photo shows the reason and no number', html.includes('All 6 photos in the last 90 days were under cloud.') && !/class="hl-dot"/.test(html) && !/greenness \d/.test(html)); }
check('HLS: a refusal and hostile answers', cleanHls({ ok: false, reason: 'No.' }).reason === 'No.' && [null, 5, [], { ok: true }, { ok: true, passes: 'x' }].every(b => !cleanHls(b).ok));
check('HLS: loading and refusal cards', hlsCardHTML({ loading: true }).includes('Looking') && hlsCardHTML({ ok: false, reason: '<b>x</b>' }).includes('&lt;b&gt;'));
{ let asked = ''; const r = await loadHls({ lat: 43.1312, lon: -80.7499 }, async u => { asked = u; return { json: async () => HG }; }); check('HLS: asks its own route', asked === '/api/hlsndvi?lat=43.1312&lon=-80.7499' && r.ok); same('HLS: failure is a sentence', (await loadHls({ lat: 1, lon: 2 }, async () => { throw new Error('x'); })).reason, HLS_DOWN); }
check('the tab shows the HLS card, no placeholder left', satellitesHTML({ hls: hh }).includes('data-card="hls"') && !/Clear satellite photos of your field will show/.test(satellitesHTML({ hls: hh })));


// ---- a failed card says why in a farmer's words: every sentence the server can send is turned into a plain one
const SERVER_SAYS = [
  ['Python environment not found (.venv)', NOT_HERE], ['The Python environment for the live lookups is missing', NOT_HERE],
  ['Could not start Python: [Errno 2] No such file or directory: \'/Users/x/.venv/bin/python\'', NOT_NOW], ['Timed out after 150 s', TOO_LONG],
  ['NASA Earthdata did not accept this computer\'s login: check the username and password', NASA_OFF], ['NASA Earthdata login failed: no token came back', NASA_OFF],
  ['NASA did not let this computer\'s Earthdata login read the ECOSTRESS files: the login may still need to be approved for NASA LP DAAC', NASA_OFF],
  ['lat and lon are required (decimal degrees)', NO_POSITION], ['lat must be -84..84 and lon -180..180', NO_POSITION], ['first and last must both be given as YYYYMMDD', NO_POSITION],
  ['The country of the field is needed to read the crop map (country=CA or US)', NO_COUNTRY], ['Requests from other websites are not allowed', NOT_HERE], ['Unknown endpoint', NOT_HERE], ['Use GET', NOT_HERE],
  ['lat must be -52..52', ECO_NO_COVER],
];
for (const [said, want] of SERVER_SAYS) {
  same(`the server's "${said.slice(0, 44)}" becomes a farmer's sentence`, plainReason(said, 'FALLBACK'), want);
  const cards = [cleanGrace({ ok: false, reason: said }), cleanEco({ ok: false, reason: said }), cleanHls({ ok: false, reason: said })];
  check(`...on all three cards, and no card shows an internal word`, cards.every(c => c.reason === want) && [graceCardHTML(cards[0]), ecoCardHTML(cards[1]), hlsCardHTML(cards[2])].every(h => !/python|\.venv|errno|traceback|\/Users|earthdata|token|status \d/i.test(h)));
}
same('plain reasons from NASA pass through', plainReason('The data server is busy. Try again in a minute.', 'F'), 'The data server is busy. Try again in a minute.');
same('so does the catalogue sentence about the place', plainReason('NASA\'s catalogue lists no ECOSTRESS pass over this place in the last 365 days (ECOSTRESS flies between 52 N and 52 S and does not see every place every week)', 'F').slice(0, 30), 'NASA\'s catalogue lists no ECOS');
same('an unknown internal reason (a path, a status code, a program name) falls back to the card\'s own plain sentence', [plainReason('Traceback (most recent call last): File "/x/y.py"', 'F'), plainReason('HTTP 500 from lpdaac', 'F'), plainReason('', 'F'), plainReason(null, 'F'), plainReason('x'.repeat(400), 'F')], ['F', 'F', 'F', 'F', 'F']);

// ---- GRACE: Falling / Rising / Roughly stable from the record's own scatter, never a fixed number nobody can source
const series = (slopePerYear, wave = 6, years = 8) => { const out = []; for (let i = 0; i < 12 * years; i++) { const y = G0 + 8 + Math.floor(i / 12), m = String(i % 12 + 1).padStart(2, '0'); out.push([`${y}-${m}`, Math.round((slopePerYear * i / 12 + wave * Math.sin(i * 0.52) + 1.5 * Math.sin(i * 2.3)) * 100) / 100, 1]); } return out; };
const asGrace = (slope, extra = {}) => { const ms = series(slope), last = ms.at(-1)[0]; return cleanGrace({ ok: true, months: ms, months_read: ms.length, newest_month: last, trend_cm_per_year: slope, trend_from: ms[0][0], trend_to: last, trend_years: 8, area_km: 300, ...extra }); };
same('a clear fall is Falling', graceDirection(asGrace(-2.4)).word, 'Falling');
same('a clear rise is Rising', graceDirection(asGrace(+2.4)).word, 'Rising');
same('a flat record under the seasonal swing is Roughly stable', graceDirection(asGrace(0)).word, 'Roughly stable');
same('a faint slope the scatter cannot tell from nothing is Roughly stable, not Falling', graceDirection(asGrace(-0.05)).word, 'Roughly stable');
same('under two years of months in the trend window: no word', graceDirection(cleanGrace({ ok: true, months: series(-2, 6, 8).slice(0, 18), trend_cm_per_year: -2, trend_from: series(-2)[0][0], trend_to: series(-2)[17][0], trend_years: 1.5 })).word, null);
same('no trend: no word', graceDirection(cleanGrace({ ...GOOD, trend_cm_per_year: null })).word, null);
{ const fall = graceCardHTML(asGrace(-2.4)), flat = graceCardHTML(asGrace(0)), rise = graceCardHTML(asGrace(2.4)), unk = graceCardHTML(cleanGrace({ ...GOOD, trend_cm_per_year: null }));
  check('the card carries the tile with the word, what it covers and "Not a well level"', fall.includes('class="sat-tile"') && fall.includes('<b>Falling</b>') && /Change in total water above and below ground \(soil water, snow, lakes and groundwater together\) over a region about 300 km wide/.test(fall) && /Not a well level\./.test(fall));
  check('Falling says the pumping sentence, Rising and Roughly stable say there is no strong decline', fall.includes(GRACE_PUMPING) && !fall.includes(GRACE_NO_DECLINE) && flat.includes(GRACE_NO_DECLINE) && rise.includes(GRACE_NO_DECLINE) && !flat.includes(GRACE_PUMPING) && !rise.includes(GRACE_PUMPING));
  check('the rule for the word is on the card in plain words (twice its own uncertainty), with no fixed centimetre limit', fall.includes(GRACE_RULE) && /twice its own uncertainty/.test(GRACE_RULE) && !/0\.3 cm/.test(fall));
  check('with no word possible the tile says so and gives no direction', unk.includes('No direction given') && !/Falling|Rising|Roughly stable/.test(unk.replace(GRACE_RULE, '')));
  check('the newest month is said, and that NASA adds months late', /The newest month in this record is/.test(graceWords(asGrace(-2.4)).lines.join(' ')) && /never in this record/.test(graceWords(asGrace(-2.4)).lines.join(' ')));
  check('with today given, the age of the newest month is in days', /which ended \d+ days ago/.test(graceWords(asGrace(-2.4), { today: '2027-03-01' }).lines.join(' ')) && !/ended \d+ days ago/.test(graceWords(asGrace(-2.4)).lines.join(' '))); }

// ---- ECOSTRESS over a year: the days at 45 C or more, as "N of M clear days"
const YEAR = [P(`${YR}-07-20`, 'day', 46.2, '13:10'), P(`${YR}-07-20`, 'day', 49.0, '14:40'), P(`${YR}-06-03`, 'day', 45.0, '13:00'), P(`${YR}-05-11`, 'day', 44.9, '12:30'), P(`${YR}-04-02`, 'day', 21.3, '13:00'), P(`${YR}-07-21`, 'night', 51.0, '01:30')];
const ey = cleanEco({ ...EG, passes: YEAR, window: { first: `${YR - 1}-11-16`, last: '2026-11-14' } });
same('the clear days are counted by day, the hot ones by day, night never', ey.summary, { dayDays: 4, hotDays: 2, max: 49, maxDate: `${YR}-07-20`, night: 1 });
same('the line at 45.0 counts, 44.9 does not', [ecoSummary([{ dn: 'day', solarDate: 'a', c: 45 }]).hotDays, ecoSummary([{ dn: 'day', solarDate: 'a', c: 44.9 }]).hotDays], [1, 0]);
{ const w = ecoWords(ey), html = ecoCardHTML(ey);
  check('the card says "N of M clear days" in the note\'s words', w.lines[0] === `Ground hot enough to hurt seedlings (45 °C or more) on 2 of 4 clear days. The hottest was 49 °C on 20 Jul ${YR}.` && w.head === '2 of 4', w.lines[0]);
  check('the big number and its label are on the card', html.includes('sat-first') && /2 of 4 clear days at 45 °C or more/.test(html));
  check('the cloud caveat and the source of the 45 are on the card', html.includes(ECO_CLOUD) && html.includes(ECO_WHY45) && /Crop Science 1990/.test(html) && /sorghum/.test(html) && /Other crops differ/.test(html));
  check('the numbers of the whole year are in a table, the lists show only the newest few', html.includes('<summary>The numbers</summary>') && (html.match(/<tr><td>/g) ?? []).length === 6 && html.includes('(45 °C or more)'));
  check('a long year does not fill the card: only six day passes and three night passes are listed above the table', (ecoCardHTML(cleanEco({ ...EG, passes: Array.from({ length: 40 }, (_, i) => P(`${YR}-0${1 + i % 9}-${String(1 + i % 28).padStart(2, '0')}`, i % 2 ? 'night' : 'day', 20 + i / 10, '13:00')) })).match(/class="eco-pass"/g) ?? []).length === 9);
  check('no sentence is the old two-month text', !/last 60 days/.test(JSON.stringify(w))); }
{ const cool = cleanEco({ ...EG, passes: [P(`${YR}-07-20`, 'day', 31.5, '13:00'), P(`${YR}-04-02`, 'day', 21.3, '13:00')] }), w = ecoWords(cool);
  same('a year that never reached 45 says so with its hottest day', w.lines[0], `Ground never reached 45 °C on 2 clear days (hottest 31.5 °C, 20 Jul ${YR}).`);
  same('and the head is "0 of 2"', w.head, '0 of 2'); }
{ const nightOnly = cleanEco({ ...EG, passes: [P(`${YR}-07-21`, 'night', 12, '01:30')], why_none: '' }), w = ecoWords(nightOnly);
  check('only night passes: no heat is counted and it says so, never "0 of 0"', /No clear daytime pass/.test(w.lines[0]) && w.head === '' && !/0 of 0/.test(JSON.stringify(w))); }
{ const asked = []; const r = await loadEco({ lat: 40, lon: -100 }, async u => { asked.push(u); return { json: async () => ({ ok: false, reason: 'Python environment not found (.venv)' }) }; });
  same('through the route too: a server that cannot run the lookup gives the farmer sentence, not the .venv one', r.reason, NOT_HERE); }
check('no card ever prints NaN, undefined or an object', [graceCardHTML(asGrace(-2.4)), ecoCardHTML(ey), ecoCardHTML(cleanEco({ ok: true, passes: [] }))].every(h => !/NaN|undefined|\[object/.test(h)));


// ---- a year read in part never reads as the whole year: "so far", what was read, and the card asks again by itself (up to three asks)
const COOL7 = Array.from({ length: 7 }, (_, i) => P(`${YR}-0${3 + i}-1${i}`, 'day', 24 + i * 1.5, '13:00'));
const cutAnswer = (examined, complete = false) => ({ ...EG, passes: COOL7, window: { first: `${YR - 1}-11-16`, last: '2026-11-14' }, coverage: { found: 297, examined, back_to: `${YR}-09-01`, kept: 0, newly_read: examined, complete }, incomplete: `so far the newest ${examined} of 297 passes were read, back to ${YR}-09-01; the rest are read on the next ask` });
{ const e54 = cleanEco(cutAnswer(54)), w = ecoWords(e54), html = ecoCardHTML(e54);
  same('a part-read year: the big number says "so far"', w.head, '0 of 7 so far');
  check('the sentence says so far and names what was read: the newest 54 of 297 passes, back to the day', w.lines[0].startsWith('Ground never reached 45 °C on 7 clear days so far') && w.lines.includes(`Read so far: the newest 54 of 297 passes, back to 1 September; the rest are still being read.`), w.lines.slice(0, 3));
  check('the card never says "a year" for a part of a year: its pass line gives the days actually read', !/last year|a year|12 months/.test(w.lines.join(' ')) && /clear passes, 1 September to 14 November/.test(w.lines.join(' ')), w.lines.join(' | '));
  check('the card shows the big number, its "so far" label and what is still being read', /0 of 7 clear days so far at 45 °C or more/.test(html) && /never reached 45 °C on 7 clear days so far/.test(html) && /Read so far: the newest 54 of 297 passes/.test(html));
  check('the server\'s own sentence is kept', w.lines.includes(`so far the newest 54 of 297 passes were read, back to ${YR}-09-01; the rest are read on the next ask`));
  const hot = cleanEco({ ...cutAnswer(54), passes: [P(`${YR}-07-20`, 'day', 47, '13:00'), ...COOL7] }), wh = ecoWords(hot);
  check('a hot day in the part read is counted "so far" too', wh.head === '1 of 8 so far' && /on 1 of 8 clear days so far\. The hottest so far was 47 °C/.test(wh.lines[0]), wh.lines[0]);
  const done = cleanEco(cutAnswer(297, true)), wd = ecoWords(done);
  check('a complete year drops "so far" and the "read so far" line', wd.head === '0 of 7' && !/so far/.test(wd.lines.slice(0, 3).join(' ')) && !/Read so far/.test(ecoCardHTML(done)), wd.head);
  check('an older answer with no coverage is whole unless it says it was cut short', cleanEco(EG).coverage.complete === true && cleanEco({ ...EG, incomplete: 'only some' }).coverage.complete === false);
  check('a hostile coverage cannot make a sentence of its own', ecoWords(cleanEco({ ...cutAnswer(54), coverage: { found: '<b>', examined: -5, back_to: 'x', complete: 'yes' } })).lines.every(l => !/<b>|NaN|undefined/.test(l))); }
{ // the card's quiet re-asks
  const seq = [cutAnswer(54), cutAnswer(108), cutAnswer(162)], updates = []; let asks = 0;
  const get = async () => ({ json: async () => seq[asks++] });
  const last = await loadEcoUntilDone({ lat: 43.13, lon: -80.75 }, { get, onUpdate: e => updates.push(e), wait: async () => {} });
  check('three asks that leave the year unfinished: it asked three times, no more, and the last answer says it gave up', asks === 3 && last.gaveUp === true && last.coverage.examined === 162 && ecoWords(last).lines.includes(ECO_GAVE_UP), [asks, last.gaveUp]);
  check('between the asks the card is told another ask is under way (ask 2 of 3, ask 3 of 3)', updates.length === 3 && updates[0].again?.n === 2 && updates[1].again?.n === 3 && updates[2].again === undefined && ecoCardHTML(updates[0]).includes('Reading more passes (ask 2 of 3)'), updates.map(u => u.again));
  asks = 0; const seq2 = [cutAnswer(54), cutAnswer(297, true)]; const get2 = async () => ({ json: async () => seq2[asks++] });
  const done = await loadEcoUntilDone({ lat: 1, lon: 2 }, { get: get2, wait: async () => {} });
  check('it stops as soon as the year is complete (two asks)', asks === 2 && done.coverage.complete === true && !done.gaveUp, [asks]);
  asks = 0; const get3 = async () => ({ json: async () => ({ ok: false, reason: 'Python environment not found (.venv)' }) });
  const failed = await loadEcoUntilDone({ lat: 1, lon: 2 }, { get: async () => { asks++; return get3(); }, wait: async () => {} });
  check('a refusal is not asked again (nothing to go on from) and says the farmer sentence', asks === 1 && failed.ok === false && failed.reason === NOT_HERE, [asks, failed.reason]);
  same('the words for what was read', readSoFar({ examined: 54, found: 297, backTo: `${YR}-09-01` }), 'the newest 54 of 297 passes, back to 1 September; the rest are still being read'); }


// the owner's rules for a card: at most four sentences before Show more; one source link; no "not read yet"
{ const shown = h => h.split('Show more')[0].replace(/<[^>]+>/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/).filter(x => x.trim().length > 12).length;
  for (const [n, h] of [['GRACE', graceCardHTML(g)], ['ECOSTRESS', ecoCardHTML(e)], ['HLS', hlsCardHTML(hh)], ['ECOSTRESS, a year', ecoCardHTML(ey)]]) {
    check(`${n}: at most five lines of words before Show more (the big line and four sentences), one source link, no "not read yet"`, shown(h) <= 5 && (h.match(/class="sat-src"/g) ?? []).length === 1 && !/not read yet/i.test(h), shown(h)); } }
// ---- No server word on a farmer's card: every card that says why a lookup failed passes the reason through plainReason (this file), so a farmer never reads a folder name, a file name,
// a program word, a status code or an address. Each card is fed the reason the tester saw ("Python environment not found (.venv)") and one holding a folder path, through the code the page uses.
{
  const RAW = ['Python environment not found (.venv)', 'Could not open /Users/someone/Crophalo/.cache/cdl/2025.tif: [Errno 2] No such file or directory', 'spawn python3 ENOENT at 127.0.0.1:5173', 'HTTP Error 500: Internal Server Error from https://example.invalid/api'];
  const LEAK = /\.venv|python|\/Users|\.tif\b|\.cache|errno|ENOENT|127\.0\.0\.1|:5173|HTTP Error|\b500\b|https?:|example\.invalid/i;
  const plainText = h => String(h).replace(/<[^>]*>/g, ' ');   // the words on the card, not its markup (a source link's own address is allowed)
  const S2 = await import('../js/satellites2-data.js');
  const { priceCards } = await import('../js/prices-cards.js'), { roughValue } = await import('../js/sales.js');
  const { cleanRain } = await import('../js/satellites-data.js'), { rainCardHTML, moistureCardHTML } = await import('../js/satellites-view.js');
  const { loadSmap } = await import('../js/report-load.js'), { surveyToSoil } = await import('../js/soil-load.js'), { fetchCropMap } = await import('../js/near-load.js'), { gateFrom } = await import('../js/nearby.js');
  const { whyWords } = await import('../js/grace.js'), { cleanGreenness, greenItemHTML } = await import('../js/greenness.js'), { decodeHeights } = await import('../js/heights3d.js'), { decodeOsm } = await import('../js/land3d-load.js');
  const { observedFor } = await import('../js/farmobserved.js'), { loadingHTML } = await import('../js/report-view.js'), { shareBlockHTML } = await import('../js/letter-view.js');
  for (const reason of RAW) {
    const bad = { ok: false, reason }, row = [{ key: 'smap', label: 'Soil moisture round the roots · NASA SMAP', state: 'fail', reason }];
    const cards = {
      'the price cards': priceCards({ prices: bad, faostat: bad, country: 'US', crops: ['corn'] }).map(c => c.body).join(' '),
      'the money line': roughValue('corn', 'US', { prices: bad, faostat: bad }).reason,
      'the satellite rain card': rainCardHTML(cleanRain(bad)),
      'the GRACE-FO card': graceCardHTML(S2.cleanGrace(bad)), 'the ECOSTRESS card': ecoCardHTML(S2.cleanEco(bad)), 'the greenness card': hlsCardHTML(S2.cleanHls(bad)),
      'the soil moisture card': moistureCardHTML(await loadSmap({ lat: 41.18, lon: -96.44 }, async () => ({ json: async () => bad }))),
      'the US soil survey line': surveyToSoil(bad).reason,
      'the crop map line': gateFrom(await fetchCropMap({ lat: 41.18, lon: -96.44, cc: 'US' }, async () => ({ json: async () => bad }))).nearby.gap,
      'the GRACE-FO layer legend': whyWords(bad), 'the greenness history card': greenItemHTML({ status: 'error', reason: cleanGreenness(bad).reason }),
      'the 3D heights line': decodeHeights(bad, { lat: 41.18, lon: -96.44, w: 400, d: 400 }).failed, 'the 3D land details line': decodeOsm('osm', bad, { lat: 41.18, lon: -96.44, w: 400, d: 400 }).failed,
      'My farm\'s NASA picture card': observedFor(bad, '2026-11-15').detail,
      'the loading list': loadingHTML(row), 'the report\'s sources': shareBlockHTML(row),
    };
    for (const [name, card] of Object.entries(cards)) check(`no server word: ${name}, fed "${reason.slice(0, 40)}"`, typeof card === 'string' && !LEAK.test(plainText(card)), plainText(card).match(LEAK)?.[0]);
  }
  const fs = await import('node:fs'), src = f => fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8');
  check('no server word: the setup map\'s weather card and the fires legend pass the reason through plainReason', /esc\(plainReason\(got\.reason, ''\)\)/.test(src('spotcard.js')) && /const said = plainReason\(a\?\.reason, ''\)/.test(src('maplayers.js')));
}
console.log(`satellites2: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
