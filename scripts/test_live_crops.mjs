// The money lookups' offline suite: scripts/live/prices.py (the World Bank's monthly Pink Sheet) and scripts/live/faostat.py (FAOSTAT's national yields and farm-gate prices), with
// the network replaced by answers recorded from the live services on 14 November 2026 (scripts/fixtures/live/prices-live, faostat-excerpt: FAO's own rows for Canada, Türkiye, Ethiopia
// and Taiwan, cut unchanged) and by small hand-made Excel files for the cases the real file does not show. It needs no internet and writes nothing outside a temp folder.
// RULE: never loosen a check here without a written farming reason beside it. Run: node scripts/test_live_crops.mjs
/*
 * A failure means a farmer would be shown a price or a yield that is not the source's, an old price that
 * looks current, or "no price" when the truth is "could not be read".
 */
import fs from 'node:fs';
import path from 'node:path';
import { check, same, group, finish, runLookup, contract, copyOf, alter, addAnswer, tempFolder, FIXTURES } from './live_testlib.mjs';

const watchdog = setTimeout(() => { console.log('FAIL  the suite did not finish in 400 s'); finish(); process.exit(1); }, 400000);
const CASES = path.join(FIXTURES, 'crops_cases.py');
const recording = name => JSON.parse(fs.readFileSync(path.join(FIXTURES, name, 'recording.json'), 'utf8'));
const PAGE = 'https://www.worldbank.org/en/research/commodity-markets';
const FILE = 'https://thedocs.worldbank.org/en/doc/abc123/related/CMO-Historical-Data-Monthly.xlsx';
const pageWith = link => `<html><body><a href="${link}">Pink Sheet monthly</a></body></html>`;

// ---- prices.py on the file recorded from the World Bank
await group('prices: the recorded Pink Sheet', async () => {
  const r = await runLookup('prices', [], { replay: 'prices-live' });
  contract('prices', r, { maxMB: 300 });
  const a = r.answer, live = recording('prices-live').answer;
  check('it answers from the recorded page and file', a?.ok === true && r.misses.length === 0, a);
  same('the answer is the live answer of that day, figure for figure (apart from when it was asked)', (({ checked, replayed, ...x }) => x)(a), (({ checked, replayed, ...x }) => x)(live));
  check('the source is named: the World Bank Pink Sheet, in US dollars of the month', /World Bank Commodity Price Data \(The Pink Sheet\)/.test(a.source) && /not corrected for inflation/.test(a.units), [a.source, a.units]);
  const corn = a.series.corn;
  check('corn is the Pink Sheet\'s "Maize", in US dollars a tonne, with its own newest month', corn.name === 'Maize' && corn.unit === '$/mt' && corn.unit_words === 'US$ per tonne' && /^\d{4}-\d\d$/.test(corn.latest.month) && corn.latest.value > 50 && corn.latest.value < 1000, corn);
  check('wheat is hard red winter wheat and soybeans are soybeans', a.series.wheat.name === 'Wheat, US HRW' && a.series.soy.name === 'Soybeans');
  check('each series carries 24 months, newest last, a month with no price is null and never 0', Object.values(a.series).every(s => s.last24.length === 24 && s.last24.at(-1).month === s.latest.month && s.last24.every(m => m.value === null || m.value > 0)));
  check('rapeseed oil stands in for canola and says so: it is a proxy, never shown as the seed\'s price', a.series.canola?.proxy === true && /rapeseed oil/.test(a.series.canola.proxy_note));
  check('crops the sheet has no price for are named and never estimated', ['chickpea', 'lentil', 'pea', 'alfalfa', 'bean', 'potato', 'hazelnut'].every(c => a.no_series.includes(c) && !(c in a.series)));
  check('the year-ago change is worked out from the two prices it names', Object.values(a.series).every(s => s.year_ago === null || Math.abs(s.change_pct - Math.round((s.latest.value / s.year_ago.value - 1) * 1000) / 10) < 0.11));
  console.log(`prices (replayed): ${r.seconds.toFixed(1)} s, peak ${r.peakMB} MB`);
});

// ---- prices.py on small hand-made workbooks, for what the real file does not show
await group('prices: hand-made workbooks', async () => {
  const work = tempFolder('books');
  const made = await runLookup('crops_cases', ['workbook', work], { script: CASES });
  check('the helper wrote its five workbooks', made.answer?.ok === true && made.answer.files.length === 5, made.answer);
  const run = async (file, { page = pageWith(FILE), link = FILE, fileBody, status = 200 } = {}) => {
    const folder = tempFolder('pb') + '/answers';
    addAnswer(folder, { url: PAGE, body: page, headers: { 'content-type': 'text/html' } });
    if (file) addAnswer(folder, { url: link, file: path.join(work, file), headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    else if (fileBody !== undefined) addAnswer(folder, { url: link, body: fileBody, status });
    return runLookup('prices', [], { replay: folder });
  };
  const g = await run('good.xlsx'), a = g.answer;
  contract('prices good', g, { maxMB: 300 });
  check('a good workbook is read: the sheet\'s "Updated on" date, the newest month, 34 months', a?.ok === true && a.published === '2026-11-03' && a.data_date === '2026-10', a);
  same('corn: 133 now, 121 a year ago, +9.9%', [a.series.corn.latest, a.series.corn.year_ago, a.series.corn.change_pct], [{ month: '2026-10', value: 133 }, { month: '2025-10', value: 121 }, 9.9]);
  same('wheat: the month with no figure ("…") a year ago is not 0: no year-ago price and no change', [a.series.wheat.latest.value, a.series.wheat.year_ago, a.series.wheat.change_pct], [266, null, null]);
  check('wheat keeps that month as null in its 24 months', a.series.wheat.last24.find(m => m.month === '2025-10').value === null);
  check('barley ended in August 2025: it is marked stale, with the month it stopped, so an old price does not look current', a.series.barley.latest.month === '2025-08' && a.series.barley.stale === true && /after 2025-08/.test(a.series.barley.stale_note), a.series.barley);
  same('cocoa\'s newest month is not a number: the newest month with a price is shown, in $/kg', [a.series.cocoa.latest, a.series.cocoa.unit], [{ month: '2026-09', value: 2.5 }, '$/kg']);
  check('rapeseed oil is canola\'s proxy and sugar is the proxy of cane and beet', a.series.canola.proxy && a.series.sugarcane.proxy && a.series.sugarbeet.proxy && a.series.canola.latest.value === 1033.13, a.series.canola);
  same('a price column with no unit, or in bushels, is not shown, and is said', a.unit_not_read, ['sorghum', 'soy']);
  check('tobacco, which is never a number in that file, has no series', !('tobacco' in a.series) && a.no_series.includes('tobacco'));
  const fails = [['other-sheet.xlsx', /no 'Monthly Prices' sheet any more/], ['no-header.xlsx', /layout changed \(no row of titles with 'Maize'\)/], ['no-months.xlsx', /no monthly rows/], ['no-crops.xlsx', /layout changed \(no row of titles with 'Maize'\)/]];   // no-crops has no maize column: not the sheet this was checked against
  for (const [file, reason] of fails) {
    const r = await run(file);
    contract(`prices ${file}`, r, { maxMB: 300 });
    check(`${file}: ok false, in words, and no figure`, r.answer?.ok === false && reason.test(r.answer.reason) && !('series' in r.answer), r.answer);
  }
  const nolink = await run(null, { page: '<html><body>no link here</body></html>' });
  check('a page with no link to the file: said, not guessed', nolink.answer?.ok === false && /was not found on the World Bank's commodity-markets page/.test(nolink.answer.reason), nolink.answer);
  const elsewhere = await run(null, { page: pageWith('https://example.org/CMO-Historical-Data-Monthly.xlsx') });
  check('a link to somebody else\'s file is never followed', elsewhere.answer?.ok === false && /was not found/.test(elsewhere.answer.reason) && !elsewhere.misses.some(m => /example\.org/.test(m)), [elsewhere.answer, elsewhere.misses]);
  const notExcel = await run(null, { fileBody: 'this is not a workbook' });
  check('a file that is not an Excel file: said, and no figure', notExcel.answer?.ok === false && /did not arrive as an Excel file/.test(notExcel.answer.reason), notExcel.answer);
  const down = await run(null, { fileBody: '', status: 503 });
  check('a file that does not download: a plain sentence, not final (asking again can help)', down.answer?.ok === false && !down.answer.final && !/https?:|503/.test(down.answer.reason), down.answer);
  const busy = await (async () => { const folder = tempFolder('pb') + '/answers'; addAnswer(folder, { url: PAGE, status: 429, body: 'slow down' }); return runLookup('prices', [], { replay: folder }); })();
  check('a service asking to slow down: said so, with no address', busy.answer?.ok === false && /asked us to slow down/.test(busy.answer.reason), busy.answer);
});

// ---- faostat.py on FAO's own rows for four areas
const FAO = recording('faostat-excerpt').live_answer_for_these;
await group('faostat: FAO\'s own rows, the first run', async () => {
  const cache = tempFolder('fao') + '/cache';
  const r = await runLookup('faostat', [], { replay: 'faostat-excerpt', cache });
  contract('faostat first run', r, { maxMB: 300 });
  const a = r.answer;
  check('it asks for both files\' dates, downloads both (they are new here) and says it rebuilt', a?.ok === true && a.rebuilt === true && r.asked === 4 && r.misses.length === 0, [a?.ok, a?.rebuilt, r.asked]);
  same('Canada, Türkiye, Ethiopia and Taiwan are in; "China" (a total) and the regions are not', Object.keys(a.countries).sort(), ['CA', 'ET', 'TR', 'TW']);
  check('the country is written Türkiye, never the old spelling', a.countries.TR.name === 'Türkiye' && !new RegExp('Tur' + 'key').test(JSON.stringify(a)), a.countries.TR.name);
  same('Canada\'s yields are the live answer\'s, to the figure, with the years they come from', [a.countries.CA.yield.corn, a.countries.CA.yield.wheat, a.countries.CA.yield.soy], [FAO.countries.CA.yield.corn, FAO.countries.CA.yield.wheat, FAO.countries.CA.yield.soy]);
  check('a yield is production over area harvested, in tonnes a hectare, over three whole years', Object.values(a.countries.CA.yield).every(([t, years]) => t > 0 && t < 200 && /^\d{4}-\d{4}$/.test(years)), a.countries.CA.yield.corn);
  check('Canada corn about 10 t/ha, wheat about 3 t/ha: plausible national yields', a.countries.CA.yield.corn[0] > 7 && a.countries.CA.yield.corn[0] < 13 && a.countries.CA.yield.wheat[0] > 2 && a.countries.CA.yield.wheat[0] < 5, a.countries.CA.yield);
  check('prices are FAO\'s farm-gate prices in US$ a tonne with their year', Object.values(a.countries.CA.price || {}).every(([usd, year]) => usd > 0 && year >= 2018), a.countries.CA.price);
  check('the answer says what it is: the years, the units, and that every figure is FAO\'s own', a.data_date === '2022/2024' && /tonnes per hectare/.test(a.units.yield) && /FAO's own/.test(a.flags_note), [a.data_date, a.units]);
  check('the file dates are said (FAO published them), never today\'s date', /FAO published the production file on 2025-12-31 and the price file on 2026-10-09/.test(a.data_date_note), a.data_date_note);
  console.log(`faostat (replayed, first run): ${r.seconds.toFixed(1)} s, peak ${r.peakMB} MB (live: ${recording('faostat-live').seconds} s, ${recording('faostat-live').peak_mb} MB)`);
  const again = await runLookup('faostat', [], { replay: 'faostat-excerpt', cache });
  contract('faostat second run', again, { maxMB: 300 });
  check('asked again with the same dates: only the two HEAD questions go out, nothing is downloaded, and the figures are the same', again.answer?.ok === true && again.answer.rebuilt === false && again.asked === 2 && JSON.stringify(again.answer.countries) === JSON.stringify(a.countries), [again.answer?.rebuilt, again.asked]);
  const changed = copyOf('faostat-excerpt');
  alter(changed, x => x.method === 'HEAD' && /Production_/.test(x.url), meta => { meta.replies[0].headers['last-modified'] = 'Sat, 14 Nov 2026 10:00:00 GMT'; });
  const third = await runLookup('faostat', [], { replay: changed, cache });
  check('FAO changed one file: only that one is downloaded again, and the answer says it was rebuilt', third.answer?.ok === true && third.answer.rebuilt === true && third.asked === 3, [third.answer?.rebuilt, third.asked]);
  const down = copyOf('faostat-excerpt');
  alter(down, x => x.method === 'HEAD', meta => { meta.replies = [{ status: 503, headers: {} }]; });
  const stale = await runLookup('faostat', [], { replay: down, cache });
  contract('faostat HEAD down', stale, { maxMB: 300 });
  check('FAO cannot be asked, but kept files exist: the kept figures are given and marked stale, with a sentence', stale.answer?.ok === true && stale.answer.stale === true && /could not be asked whether anything is newer just now/.test(stale.answer.note), stale.answer?.note);
});
await group('faostat: nothing kept and nothing answering, or a broken file', async () => {
  const down = copyOf('faostat-excerpt');
  alter(down, x => x.method === 'HEAD', meta => { meta.replies = [{ status: 503, headers: {} }]; });
  const r = await runLookup('faostat', [], { replay: down, cache: tempFolder('fao2') + '/cache' });
  contract('faostat down', r, { maxMB: 300 });
  check('no kept files and FAO does not answer: a plain sentence, not final, and no figure', r.answer?.ok === false && r.answer.reason === 'FAOSTAT did not answer; try again in a minute' && !r.answer.final && !('countries' in r.answer), r.answer);
  const broken = copyOf('faostat-excerpt');
  const cut = (await import('./live_testlib.mjs')).answersIn(broken).find(x => x.method === 'GET' && /Production_/.test(x.url));
  fs.writeFileSync(cut.bodyFile, Buffer.from('PK\u0003\u0004 this is not a whole zip file'));
  alter(broken, x => x.method === 'HEAD' && /Production_/.test(x.url), () => {});
  const b = await runLookup('faostat', [], { replay: broken, cache: tempFolder('fao3') + '/cache' });
  contract('faostat broken file', b, { maxMB: 300 });
  check('a file that arrives broken: said in words, nothing kept, no figure', b.answer?.ok === false && b.answer.reason.length > 10 && !('countries' in b.answer), b.answer);
});

clearTimeout(watchdog);
finish();
