// Crophalo's land-history suite: the record counted by hand on a made-up weather series (every line, every gap), then on the recorded NASA POWER answer for Barrie (25 years), plus the sentences, the strips,
// the page's cards, print and copy, and the words: counts as "N of M years" and never a chance, and no money word anywhere on the page. RULE: never loosen a check to make it pass; fix the project.
// No internet is needed. Run: node scripts/test_history.mjs
import fs from 'node:fs';
import { rowNotes, yearLabel, REJECTED_WORDS, cropsLines, causesOf, buildHistory, inShort, spokenLine, moreLine, trendOf, asText, ORDER, LINES, NOT_READ, CHECKLIST, MIN_YEARS } from '../js/history.js';
import { historyHTML, stripSVG, printHTML, asHeading } from '../js/history-view.js';
import { buildSeries } from '../js/data.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

// ---- a made-up record whose counts are known: 2001 to 2012, one year with too few days read
function made(overrides = {}) {
  const days = [], hi = [], lo = [], rain = [];
  for (let y = 2001; y <= 2012; y++) {
    const doyMax = (y % 4 === 0) ? 366 : 365;
    for (let doy = 1; doy <= doyMax; doy++) {
      const d = new Date(Date.UTC(y, 0, doy)), m = d.getUTCMonth() + 1;
      const lastFrost = overrides.lastFrost?.[y] ?? 100, firstFrost = overrides.firstFrost?.[y] ?? 300;
      let h = 20, l = doy <= lastFrost ? -5 : doy >= firstFrost ? -3 : 5, r = 2;
      if (y === 2004 && doy >= 182 && doy < 194) h = 36;              // twelve hot days in July
      if (y === 2006 && doy >= 190 && doy < 225) r = 0;               // thirty-five dry days
      if (y === 2007 && m >= 4 && m <= 9) r = 1.2;                    // a dry season, but not a month without rain
      if (y === 2009 && doy === 200) r = 60;                          // a downpour
      if (y === 2010 && doy > 100 && doy <= 200) { h = NaN; l = NaN; r = NaN; }   // a year with too many days not read
      days.push(`${y}${String(m).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`); hi.push(h); lo.push(l); rain.push(r);
    }
  }
  return { days, T2M_MAX: hi, T2M_MIN: lo, PRECTOTCORR: rain, rain, through: '2012-12-31' };
}
const SERIES = made({ lastFrost: { 2003: 130, 2008: 130 }, firstFrost: { 2005: 280 } });
const H = buildHistory(SERIES, { today: '2013-03-01' });
check('the made-up record is read: 12 years in, 11 counted, the short one left out and named', H.ok && H.counted === 11 && H.first === 2001 && H.last === 2012 && H.skipped.join() === '2010', brief([H.counted, H.skipped]));
same('dry years: 2007 only (a quarter less rain than usual in April to September)', H.counts.dry.years, [2007]);
same('late spring frost: 2003 and 2008 (10 days or more after the usual last frost)', H.counts.lateFrost.years, [2003, 2008]);
same('early autumn frost: 2005', H.counts.earlyFrost.years, [2005]);
same('hot summers: 2004 (12 days at 35 °C or more)', H.counts.hot.years, [2004]);
same('a month without rain: 2006 (35 days)', H.counts.dryspell.years, [2006]);
same('downpours: 2009', H.counts.downpour.years, [2009]);
same('every line counts out of the 11 years counted', ORDER.map(id => H.counts[id].of), Array(6).fill(11));
same('the usual dates are the medians (last frost day 100, first frost day 300)', [H.usual.lastFrost, H.usual.firstFrost], [100, 300]);
check('the year that is not over is named and not counted (today is 2013)', H.notOver === null || H.notOver === 2013);
check('the strips have one cell for each counted year, marked or clear', ORDER.every(id => H.strips[id].length === 11 && H.strips[id].every(c => ['marked', 'clear', 'none'].includes(c.state))) && H.strips.hot.filter(c => c.state === 'marked').length === 1);
check('no trend in a record with none (the fit is flat)', inShort(H).trend === '');

// ---- the sentences: counts of years, never a chance
{
  const s = inShort(H);
  check('"Since 2001: …" lists the lines with their counts out of the years counted, biggest first', /^Since 2001: a late spring frost in 2 of 11 years, /.test(s.lines[0]) && /a dry season in 1 of 11 years/.test(s.lines[0]), s.lines[0]);
  check('zero counts are not in that sentence', !/a month without rain in 0/.test(s.lines[0]));
  const calm = buildHistory(made(), {}); const c = inShort(calm);
  check('"Not seen in N years: …" names what never happened', /^Not seen in 11 years: /.test(c.notSeen) || c.lines.length > 0, c.notSeen);
  check('at most five items in the sentence', (s.lines[0].match(/ in \d+ of 11 years/g) ?? []).length <= 5);
  const all = [...s.lines, s.notSeen, s.trend, s.short, ...ORDER.map(id => spokenLine(H, id)), ...ORDER.flatMap(id => moreLine(H, id))].join(' ');
  check('no chance words: no "%", "chance", "likely", "probably", "expected", "odds"', !/%|\bchance|likely|probabl|expected|\bodds\b/i.test(all), (all.match(/%|chance\w*|likely|probabl\w*|expected|odds/i) ?? [''])[0]);
  check('the spoken line gives the count and the years', spokenLine(H, 'lateFrost') === 'Late spring frost: 2 of 11 years. Years: 2003, 2008.');
  check('More gives the rule, the usual date and the years', moreLine(H, 'lateFrost').some(l => /usual last frost of spring is about 10 April/.test(l)) && moreLine(H, 'dry').some(l => /usual rain in April to September is \d+ mm/.test(l)));
}
// ---- a trend only when it is clearly more than the swing, and with 10 years
{
  const warm = made(); const years = [...new Set(warm.days.map(d => +d.slice(0, 4)))];
  warm.T2M_MAX = warm.T2M_MAX.map((v, i) => v + (+warm.days[i].slice(0, 4) - 2001) * 0.15); warm.T2M_MIN = warm.T2M_MIN.map((v, i) => v + (+warm.days[i].slice(0, 4) - 2001) * 0.15);
  const t = inShort(buildHistory(warm, {}));
  check('a steady warming is said: "Warmer by about 1.5 °C every 10 years"', /^Warmer by about 1\.5 °C every 10 years/.test(t.trend), t.trend);
  same('trendOf: a clear line has a large t, a flat one has none, too few points have no trend', [Math.abs(trendOf([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 9], [10, 10.1]]).t) > 2, trendOf([[1, 1], [2, 1]]), trendOf(Array.from({ length: 10 }, (_, i) => [i, 5])).slope], [true, null, 0]);
}
// ---- a short record and gaps
{
  const few = { days: SERIES.days.filter(d => +d.slice(0, 4) <= 2007), T2M_MAX: [], T2M_MIN: [], PRECTOTCORR: [] }; const n = few.days.length;
  few.T2M_MAX = SERIES.T2M_MAX.slice(0, n); few.T2M_MIN = SERIES.T2M_MIN.slice(0, n); few.PRECTOTCORR = SERIES.PRECTOTCORR.slice(0, n);
  const h = buildHistory(few, {}); check('7 years: "Only 7 years of weather here: too few to call a pattern."', h.ok && h.short && inShort(h).short === 'Only 7 years of weather here: too few to call a pattern.' && inShort(h).trend === '', brief(inShort(h)));
  same('nothing usable is a refusal in words, not a count', [buildHistory(null).ok, buildHistory({ days: [] }).ok, buildHistory({ days: ['20010101'], T2M_MAX: [NaN], T2M_MIN: [NaN], PRECTOTCORR: [NaN] }).ok], [false, false, false]);
  check('a refusal has a reason a farmer can read', /not read yet|complete enough/.test(buildHistory(null).reason + buildHistory({ days: ['20010101'], T2M_MAX: [NaN], T2M_MIN: [NaN], PRECTOTCORR: [NaN] }).reason));
  check('frost lines are left out where fewer than half the years have a frost date', (h2 => h2.counts.lateFrost === null && /not worked out/.test(spokenLine(h2, 'lateFrost')))(buildHistory({ ...made({ lastFrost: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [2001 + i, -1])) }) }, {})));
  check('MIN_YEARS is 10', MIN_YEARS === 10);
}
// ---- the recorded NASA POWER answer for Barrie
{
  const R = JSON.parse(fs.readFileSync(new URL('./fixtures/power_barrie.json', import.meta.url), 'utf8')), S = buildSeries(R, { lat: R.geometry.coordinates[1], lon: R.geometry.coordinates[0] }), h = buildHistory(S, { today: '2026-11-14' });
  check('Barrie: 25 years, 2001 to 2025, 2026 not counted because the year is not over', h.ok && h.counted === 25 && h.first === 2001 && h.last === 2025 && h.notOver === 2026, brief([h.counted, h.first, h.last, h.notOver]));
  check('every count is out of 25 (or out of the years the line applies to)', ORDER.every(id => !h.counts[id] || h.counts[id].of <= 25 && h.counts[id].n <= h.counts[id].of));
  const s = inShort(h); check('the sentence is built from real counts and ends with a full stop', /^Since 2001: /.test(s.lines[0]) && s.lines[0].endsWith('.'), s.lines[0]);
}
// ---- the page
{
  const model = { h: H, farm: 'North farm', place: 'Oxford County, Ontario', fields: [{ name: 'North field', slope: { words: 'Gentle overall (1.4%), falling south.' }, marks: ['You marked a wet low spot.'] }], extras: {}, date: '2026-11-14' };
  const html = historyHTML(model, new Set(['lateFrost']));
  // The simple My farm design (ui-rules/SIMPLE-MYFARM.md, F6) drops the Pests card while it has no data and renames the checklist "Risks to check locally".
  for (const t of ['In short', 'Weather on this land', 'Your crops, year by year', 'The land itself', 'What satellites saw', 'Risks to check locally', 'How this was worked out']) check(`the page has the card "${t}"`, html.includes(t));
  check('the page has no Pests card', !html.includes('Pests reported nearby'));
  check('the sub line names the farm, the place, the years and NASA', html.includes('North farm · Oxford County, Ontario · 11 years, 2001–2012 · weather from NASA'));
  check('each weather line has a strip with its spoken sentence, and a More that is a 44 px button type', (html.match(/class="h-strip"/g) ?? []).length === 6 && (html.match(/class="btn more"/g) ?? []).length === 6 && html.includes('role="img" aria-label="Late spring frost: 2 of 11 years.'));
  check('More stays open for the lines that were open: aria-expanded and the box', /data-more="lateFrost" aria-expanded="true"/.test(html) && /id="more-lateFrost">/.test(html) && /data-more="dry" aria-expanded="false"/.test(html) && /id="more-dry" hidden/.test(html));
  check('a card whose lookup is not there says "not read yet" and why, and shows no figure', html.includes(NOT_READ.crops) && html.includes(NOT_READ.modis)   /* no pests line: its card is gone (SIMPLE-MYFARM.md, F6) */ && /Not read yet\./.test(html));
  check('the land card gives the field\'s slope words, or says it is not read', html.includes('Gentle overall') && historyHTML({ ...model, fields: [{ name: 'South' }] }).includes(NOT_READ.slope) && historyHTML({ ...model, fields: [] }).includes(NOT_READ.slope));
  check('Print and Copy are in a labelled group', html.includes('aria-label="Ways to look at the record"') && html.includes('data-hist="print"') && html.includes('data-hist="copy"'));
  check('the checklist has every check, with the closing line', CHECKLIST.every(([a]) => html.includes(a.replace(/’/g, '’'))) && /not an inspection or a recommendation/.test(html));
  check('a record that cannot be read gives the reason and no cards', (x => /Not read yet/.test(x) && !/class="hcard"/.test(x))(historyHTML({ h: { ok: false, reason: 'No weather.' }, farm: 'F' })));
  check('markup in a name is escaped', !historyHTML({ ...model, farm: '<img src=x onerror=1>' }).includes('<img src=x'));
  const strip = stripSVG(H.strips.hot, 'solid', 'Hot summers'); check('a strip: one rect for each year, a pattern per kind, a labelled image', (strip.match(/class="h-cell /g) ?? []).length === 11 && strip.includes('role="img"') && strip.includes('<pattern'));
  const paper = printHTML(model); check('the paper: a title, a table of the lines, the checks with a box to tick, the sources and the closing line, no controls', /North farm: land history/.test(paper) && paper.includes('<table') && /☐/.test(paper) && /Sources/.test(paper) && !/<button/.test(paper));
  const text = asText(H, { farm: 'North farm', place: 'Oxford County', date: '2026-11-14' }); check('the copied text has the sections, the counts and the ticks', /IN SHORT/.test(text) && /Late spring frost: 2 of 11 years/.test(text) && /☐ A lab soil test/.test(text) && /^North farm: land history/.test(text));
  // ---- the words: no money, no verdict on the land, on any screen of the page
  const everything = [html, paper, text, historyHTML({ ...model, fields: [] })].join(' ').replace(/<[^>]*>/g, ' ');
  const BANNED = [/\bbuy\b/i, /don['’]t buy/i, /\bsell\b/i, /\bworth\b/i, /\bbargain\b/i, /\binvest\w*/i, /\bprice\w*/i, /value of the land/i, /\bgood land\b/i, /\brisky land\b/i, /[$€£₺¥]/, /\bincome\b/i, /\bprofit\w*/i, /\bearn\w*/i, /\brevenue\b/i, /\bgrade\b/i];
  for (const re of BANNED) check(`the page never says ${re}`, !re.test(everything), (everything.match(re) ?? [''])[0]);
  check('and every sentence of the page is a count, a fact or a gap (no "%" in the figures)', !/\d\s?%(?!\))/.test(inShort(H).lines.join(' ')));
}
// ---- the crops card, from the farm's replay (js/farmhistory.js shape): fine, close call and hurt stay three different things
{
  const yrs = [['fine', []], ['fine', []], ['close', [{ text: 'Frost on young plants (-1.2 °C, 2 nights)', date: '2007-05-12' }]], ['hurt', [{ text: 'Heat at flowering (5 days of 34 °C or more)', date: '2012-07-08' }, { text: 'A dry season (58% of the water the crop needs)', date: '2012-09-28' }]], ['nodata', []], ['growing', []]].map(([verdict, why], i) => ({ year: 2007 + i - 2, verdict, why }));
  const CROPS = { ok: true, basis: 'Each crop is played on the NASA weather of every year in the record. These are counts of real years, never a chance and never a forecast.', rows: [{ field: 'North field', crop: 'Corn', counts: { fine: 2, close: 1, hurt: 1, nodata: 1, growing: 1, judged: 4, years: 6 }, years: yrs }] };
  const model = { h: H, farm: 'North farm', place: 'Oxford', fields: [], extras: {}, crops: CROPS, date: '2026-11-14' };
  const html = historyHTML(model, new Set(['crop0'])), card = html.slice(html.indexOf('id="h-crops"'), html.indexOf('id="h-land"'));
  check('the crops card gives the counts out of the years judged', /Fine in 2 of 4<\/span> years, a close call in 1, hurt in 1\./.test(card), card.slice(0, 300));
  check('a close call is its own cell: dotted, never drawn as fine or as hurt', (card.match(/class="h-cell close"/g) ?? []).length === 1 && /fill="url\(#p-dots\)"/.test(card) && /id="p-dots"/.test(card) && (card.match(/class="h-cell marked"/g) ?? []).length === 1 && (card.match(/class="h-cell clear"/g) ?? []).length === 2, card.slice(card.indexOf('<svg'), card.indexOf('<svg') + 200));
  check('years not judged (no weather, still growing) are dashed cells and named as not counted', (card.match(/class="h-cell none"/g) ?? []).length === 2 && /Not counted: 2 years \(no weather, or the season was not over\)/.test(card));
  {
    const W = { ...CROPS, rows: [{ field: 'Oxford field', crop: 'Winter wheat', scope: 'Spring weather only: winter survival is not judged.', counts: { fine: 25, close: 0, hurt: 0, nodata: 0, growing: 0, judged: 25, years: 25 }, years: Array.from({ length: 25 }, (_, k) => ({ year: 2001 + k, verdict: 'fine', why: [] })) }] };
    const wc = historyHTML({ ...model, crops: W }, new Set()), wcard = wc.slice(wc.indexOf('id="h-crops"'), wc.indexOf('id="h-land"'));
    check('winter crop: the count line itself carries the qualifier, not only a note', /Fine in 25 of 25<\/span> years, for the spring weather Crophalo can judge\. A close call in 0, hurt in 0\. Winter survival is not judged\./.test(wcard), wcard.slice(0, 400));
    check('winter crop: the spoken sentence and the copied text carry it too', /aria-label="Oxford field, Winter wheat: Fine in 25 of 25 years, for the spring weather Crophalo can judge\./.test(wcard) && cropsLines(W)[0] === 'Oxford field: Winter wheat. Fine in 25 of 25 years, for the spring weather Crophalo can judge. A close call in 0, hurt in 0. Winter survival is not judged.');
    check('a spring crop keeps the plain count line', !/for the spring weather/.test(card));
    const withBtn = historyHTML({ ...model, onAhead: () => {} }, new Set());
    const withYear = historyHTML({ ...model, onYear: () => {} }, new Set());
    check('the two year buttons (See one year on the map, Play the years) are there only when the host hands in onYear', />See one year on the map<\/button><button type="button" class="btn" data-hist="play">Play the years</.test(withYear) && !/data-hist="(year|play)"/.test(historyHTML(model, new Set())) && !/data-hist="(year|play)"/.test(withBtn));
    check('the Look ahead button is there only when the host hands in onAhead', /data-hist="ahead">Look ahead<\/button>/.test(withBtn) && !/data-hist="ahead"/.test(historyHTML(model, new Set())));
  }
  // Each year now also carries a shape (tick, exclamation mark, cross, dash), and the legend names both (the farm paper, package 12).
  check('the legend says what each shape and pattern means', /Fine\. .*A close call\. .*Hurt\. .*Not judged\. Hatched is hurt, dotted a close call, outline fine, dashed not judged\./.test(card));
  check('More shows every cause with its day, for close calls and hurt years only', /2007: Close call\. Frost on young plants \(-1\.2 °C, 2 nights\), 12 May 2007\./.test(card) && /2008: Hurt\. Heat at flowering \(5 days of 34 °C or more\), 8 Jul 2012; A dry season \(58% of the water the crop needs\), 28 Sep 2012\./.test(card));
  check('More is open for the key that was open (crop0)', /data-more="crop0" aria-expanded="true"/.test(card) && /id="more-crop0">/.test(card));
  check('the spoken sentence of the strip names the field, the crop and the three counts', /aria-label="North field, Corn: fine in 2 of 4 years, a close call in 1, hurt in 1\./.test(card));
  same('the paper and the copy carry the same lines', [cropsLines(CROPS)[0], cropsLines(CROPS).at(-1) === CROPS.basis], ['North field: Corn. Fine in 2 of 4 years, a close call in 1, hurt in 1.', true]);
  check('the paper and the copied text have the crops lines, with causes and days', /Hurt: 2008 \(Heat at flowering/.test(printHTML(model).replace(/<[^>]*>/g, '')) && /Close call: 2007 \(Frost on young plants/.test(asText(H, { crops: CROPS })) && /Not counted: 2 years/.test(asText(H, { crops: CROPS })));
  same('causes can be plain text or text with a day, and anything else is dropped', causesOf({ why: ['A dry season', { text: 'Frost', date: '2007-05-12' }, { text: 'No day', date: 'x' }, 7, null] }), ['A dry season', 'Frost, 12 May 2007', 'No day']);
  check('a replay that could not be made says why, with no figure', /Not read yet\.<\/b> The weather record of this field is not read yet/.test(historyHTML({ ...model, crops: { ok: false, reason: 'The weather record of this field is not read yet, so no year is judged here.' } })) && cropsLines({ ok: false, reason: 'No plan.' })[0] === 'No plan.' && cropsLines(null)[0] === NOT_READ.crops);
  const everything = [html, printHTML(model), asText(H, { crops: CROPS })].join(' ').replace(/<[^>]*>/g, ' ');
  for (const re of [/\bbuy\b/i, /\bsell\b/i, /\bworth\b/i, /\bprice\w*/i, /\binvest\w*/i, /[$€£₺¥]/, /\bincome\b/i, /\bprofit\w*/i, /\bearn\w*/i, /\brevenue\b/i, /\bchance of\b/i, /\blikely\b/i, /\bprobabl\w*/i, /\bexpected\b/i]) check(`with the crops card in, the page still never says ${re}`, !re.test(everything), (everything.match(re) ?? [''])[0]);
  check('markup in a field, crop or cause is escaped', !historyHTML({ ...model, crops: { ...CROPS, rows: [{ ...CROPS.rows[0], field: '<img src=x onerror=1>', crop: '<b>c</b>', years: [{ year: 2007, verdict: 'hurt', why: ['<script>x</script>'] }] }] } }).match(/<img src=x|<script>x|<b>c<\/b>/));
}
// ---- row remarks: the harvest-year label, the rejected-crop sentence, what happens in most years, the remarks with no verdict
{
  const row = { field: 'North field', crop: 'Winter wheat', counts: { fine: 1, close: 1, hurt: 1, nodata: 0, growing: 0, judged: 3, years: 3 }, rejected: true, chronic: ['This happens in most years here. It is the normal climate of the place, not bad luck in one year.', { text: 'Heat at flowering touches wheat almost every year.' }, 7, ''], notes: ['Rain for the newest days is a first estimate.', 'Bare ground after harvest: no cover.', 'Rain for the newest days is a first estimate.'],
    years: [{ year: 2025, label: '2024-25', verdict: 'fine', why: [] }, { year: 2026, label: '2025-26', verdict: 'close', why: [{ text: 'Frost before ripe (-0.4 °C)', date: '2026-05-12' }] }, { year: 2027, verdict: 'hurt', why: [{ text: 'A dry season (58% of the water the crop needs)', date: '2027-07-20' }] }] };
  same('the row\'s sentences in order: the rejected crop first, then most years here, then the remarks, each once, only text', rowNotes(row), [REJECTED_WORDS, 'This happens in most years here. It is the normal climate of the place, not bad luck in one year.', 'Heat at flowering touches wheat almost every year.', 'Rain for the newest days is a first estimate.', 'Bare ground after harvest: no cover.']);
  same('a rejected crop can carry its own sentence; nothing to say is nothing', [rowNotes({ rejected: 'Not for this water.' }), rowNotes({}), rowNotes(null)], [['Not for this water.'], [], []]);
  same('a season is named by its label ("2024-25"), else by its harvest year', [yearLabel(row.years[0]), yearLabel(row.years[2]), yearLabel({})], ['2024-25', '2027', '']);
  const model = { h: H, farm: 'F', place: 'P', fields: [], extras: {}, crops: { ok: true, basis: 'Each crop is played on the NASA weather of every year in the record.', rows: [row] }, date: '2026-11-14' };
  const html = historyHTML(model, new Set(['crop0'])), card = html.slice(html.indexOf('id="h-crops"'), html.indexOf('id="h-land"'));
  check('the card prints each sentence of the row under its counts', card.includes(REJECTED_WORDS) && card.includes('This happens in most years here.') && card.includes('Heat at flowering touches wheat almost every year.') && card.includes('Bare ground after harvest: no cover.') && (card.match(/Rain for the newest days is a first estimate\./g) ?? []).length === 1 && (card.match(/class="cap h-note"/g) ?? []).length === 5, card.slice(card.indexOf('h-note'), card.indexOf('h-note') + 200));
  check('More names the seasons by their label, and by the harvest year where there is none', /2025-26: Close call\. Frost before ripe \(-0\.4 °C\), 12 May 2026\./.test(card) && /2027: Hurt\. A dry season/.test(card));
  check('the paper and the copied text carry the labels and the sentences too', /Close call: 2025-26 \(Frost before ripe/.test(asText(H, { crops: model.crops })) && asText(H, { crops: model.crops }).includes(REJECTED_WORDS) && printHTML(model).replace(/<[^>]*>/g, '').includes('Bare ground after harvest: no cover.'));
  check('a row with no notes prints none', !historyHTML({ ...model, crops: { ...model.crops, rows: [{ ...row, rejected: false, chronic: [], notes: [] }] } }).includes('h-note'));
  check('markup in a note is escaped', !historyHTML({ ...model, crops: { ...model.crops, rows: [{ ...row, notes: ['<img src=x onerror=1>'] }] } }).includes('<img src=x'));
}
same('a host with its own main heading gets the title as h2; otherwise it stays the one h1', [asHeading('<div><h1>Land history</h1><h2>x</h2></div>', 'h2'), asHeading('<h1>Land history</h1>', 'h1')], ['<div><h2>Land history</h2><h2>x</h2></div>', '<h1>Land history</h1>']);
console.log(`history: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
