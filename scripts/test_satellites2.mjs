// Crophalo's GRACE-FO and ECOSTRESS suite: the two answers as the server gives them and the cards built from them. A month or pass nobody could read is a gap or a reason, never a number;
// a trend is given with its years; day and night passes are never mixed; the region is said to be about 300 km and the pixel about 70 m. The server's routes are replaced by stubs.
// RULE: never loosen a check to make it pass; fix the project. No internet is needed. Run: node scripts/test_satellites2.mjs
import { cleanHls, hlsWords, loadHls, windowWords, HLS_DOWN, HLS_SCALE, cleanGrace, graceWords, cleanEco, ecoWords, loadGrace, loadEco, GRACE_DOWN, ECO_DOWN, GRACE_MEANS, ECO_MEANS, monthWords } from '../js/satellites2-data.js';
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
{ const html = graceCardHTML(g); check('GRACE card: NASA "i", the DOI, the region, the table, the means sentence', html.includes('srci') && html.includes('10.5067/TEMSC-3JC634') && html.includes('about 300 km') && html.includes('<table') && html.includes('not a well in your field'), html.slice(0, 200));
  const svg = graceChartSVG(g); check('the chart breaks its line at the gap: one path per unbroken run', (svg.match(/class="gr-line"/g) ?? []).length === 2, (svg.match(/class="gr-line"/g) ?? []).length);
  check('the chart marks the gap and draws the trend', svg.includes('class="gr-gap"') && svg.includes('class="gr-trend"'));
  check('the chart is a labelled image', /role="img" aria-label="Water stored/.test(svg));
  check('no month is drawn at zero for a gap', !svg.includes('NaN'));
  check('loading and refusal cards say so', graceCardHTML({ loading: true }).includes('Reading') && graceCardHTML({ ok: false, reason: 'No.' }).includes('Not read yet')); }

// an ECOSTRESS answer
const P = (date, dn, c, solar) => ({ date, utc: '15:00', solar_time: solar, solar_date: date, day_night: dn, lst_c: c, lst_k: c + 273.15, error_k: 1.5, orbit: 1, version: '002', granule: 'g' });
const EG = { ok: true, passes: [P(`${YR}-11-10`, 'day', 14.2, '13:12:00'), P(`${YR}-11-08`, 'night', 3.1, '01:40:00'), P(`${YR}-10-30`, 'day', 17.9, '12:55:00')], clear_passes: 3, passes_checked: 9, not_usable: { cloud: 4, quality: 1, water: 0, no_data: 1 }, read_errors: 0, newest_clear: `${YR}-11-10`, window: 'the last 60 days', pixel_m: 70 };
const e = cleanEco(EG);
check('a good ECOSTRESS answer is rebuilt, newest first', e.ok && e.passes.length === 3 && e.passes[0].date === `${YR}-11-10` && e.pixel === 70);
check('the words show "local solar time", never "local time"', ecoWords(e).lines.length && ecoCardHTML(e).includes('local solar time') && !/local time/.test(ecoCardHTML(e)));
{ const html = ecoCardHTML(e); check('day and night are in separate lists, never one', html.includes('Daytime passes') && html.includes('Night passes') && html.indexOf('Daytime passes') < html.indexOf('14.2') && html.indexOf('Night passes') > html.indexOf('17.9'));
  check('it says they are never compared', ecoWords(e).lines.some(l => /never compared/.test(l)));
  check('the ground-not-air sentence and the 70 m dot', html.includes('seen from space at about 70 m, not the air temperature') && html.includes('class="eco-dot"') && ECO_MEANS.includes('70 m'));
  check('NASA "i" and the product name', html.includes('srci') && html.includes('ECO_L2T_LSTE') && html.includes('LP DAAC'));
  check('the reasons passes were not used', ecoWords(e).lines.some(l => /4 for cloud/.test(l) && /1 for poor quality/.test(l))); }
{ const none = cleanEco({ ok: true, passes: [], clear_passes: 0, passes_checked: 5, not_usable: { cloud: 5 }, why_none: 'All 5 passes in the last 60 days were under cloud.', pixel_m: 70 }); const html = ecoCardHTML(none);
  check('no clear pass: the reason is shown, never a number', html.includes('All 5 passes in the last 60 days were under cloud.') && !/°C/.test(html) && html.includes('No clear pass')); }
{ const none = cleanEco({ ok: true, passes: [] }); check('no clear pass with no reason from the server still says so, with no number', /No clear pass/.test(ecoCardHTML(none)) && !/°C/.test(ecoCardHTML(none))); }
{ const h = cleanEco({ ...EG, passes: [P('bad', 'day', 10, '12:00'), P(`${YR}-11-01`, 'dusk', 10, '12:00'), P(`${YR}-11-02`, 'day', 999, '12:00'), P(`${YR}-11-03`, 'day', NaN, '12:00'), P(`${YR}-11-04`, 'night', 2, '<b>x</b>'), null, 5] }); same('hostile passes: only the usable one stays', h.passes.map(p => p.date), [`${YR}-11-04`]); check('a bad time becomes words, not markup', ecoCardHTML(h).includes('time not given') && !ecoCardHTML(h).includes('<b>x</b>')); }
check('a refusal keeps its reason', cleanEco({ ok: false, reason: 'Needs a login.' }).reason === 'Needs a login.');
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
check('the pass sentence reads the window object', ecoWords(cleanEco({ ...EG, window: { first: `${YR}-09-20`, last: '2026-11-14' } })).lines[0].includes('20 September to 14 November') && !/\[object/.test(JSON.stringify(ecoWords(cleanEco({ ...EG, window: { first: `${YR}-09-20`, last: '2026-11-14' } })))));
// ---- GRACE gaps: only long stretches in the sentence
{ const ms = []; for (let i = 0; i < 48; i++) { const k = `${G0 + 3 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`; ms.push([k, [3, 9, 15, 16, 17, 30, 31].includes(i) ? null : i * 0.1, 1]); }
  const gg = cleanGrace({ ok: true, months: ms, area_km: 300 }), line = graceWords(gg).lines.find(l => /no data/.test(l)); check('several short gaps are counted, only the long stretch is named', gg.gaps.length === 4 && line.includes(`Apr ${G0 + 4} to Jun ${G0 + 4}`) && /3 shorter gaps/.test(line) && line.length < 200, line); }
// ---- HLS greenness
const HP = (date, ndvi) => ({ date, sensor: 'S30', ndvi, clear_pixels: 90, of_pixels: 100 });
const HG = { ok: true, passes: [HP(`${YR}-08-12`, 0.71), HP(`${YR}-07-02`, 0.52), HP(`${YR}-09-30`, 0.28), HP(`${YR}-06-01`, 9), { date: 'bad', ndvi: 0.3 }, null], gaps: [{ from: 'a' }, { from: 'b' }], newest_date: `${YR}-09-30`, newest_ndvi: 0.28 };
const hh = cleanHls(HG);
same('HLS: usable photos only, oldest first', hh.passes.map(p => p.date), [`${YR}-07-02`, `${YR}-08-12`, `${YR}-09-30`]);
check('HLS: the newest clear photo and its greenness', hh.newest.date === `${YR}-09-30` && hh.newest.ndvi === 0.28 && hh.gaps === 2);
{ const html = hlsCardHTML(hh); check('HLS card: NASA "i", the scale, the credit, one dot for each photo, no line', html.includes('srci') && html.includes(HLS_SCALE) && html.includes('LP DAAC') && html.includes('NASA/USGS Harmonized Landsat Sentinel-2') && (html.match(/class="hl-dot"/g) ?? []).length === 3 && !html.includes('<path'));
  check('HLS words: empty days are left empty, never joined', hlsWords(hh).lines.some(l => /left empty, never joined/.test(l))); }
{ const none = cleanHls({ ok: true, passes: [], why_none: 'All 6 photos in the last 90 days were under cloud.' }), html = hlsCardHTML(none); check('HLS: no clear photo shows the reason and no number', html.includes('All 6 photos in the last 90 days were under cloud.') && !/class="hl-dot"/.test(html) && !/greenness \d/.test(html)); }
check('HLS: a refusal and hostile answers', cleanHls({ ok: false, reason: 'No.' }).reason === 'No.' && [null, 5, [], { ok: true }, { ok: true, passes: 'x' }].every(b => !cleanHls(b).ok));
check('HLS: loading and refusal cards', hlsCardHTML({ loading: true }).includes('Looking') && hlsCardHTML({ ok: false, reason: '<b>x</b>' }).includes('&lt;b&gt;'));
{ let asked = ''; const r = await loadHls({ lat: 43.1312, lon: -80.7499 }, async u => { asked = u; return { json: async () => HG }; }); check('HLS: asks its own route', asked === '/api/hlsndvi?lat=43.1312&lon=-80.7499' && r.ok); same('HLS: failure is a sentence', (await loadHls({ lat: 1, lon: 2 }, async () => { throw new Error('x'); })).reason, HLS_DOWN); }
check('the tab shows the HLS card, no placeholder left', satellitesHTML({ hls: hh }).includes('data-card="hls"') && !/Clear satellite photos of your field will show/.test(satellitesHTML({ hls: hh })));

console.log(`satellites2: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
