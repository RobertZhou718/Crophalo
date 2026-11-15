// Crophalo's share-model and share-sheet suite: the report as plain data names three strategies in every output (the long message, the card, the adviser page, the spreadsheet, the file), warnings come from the forecast, notes and the soil test travel only when handed in and ticked,
// the sheet's markup, the season record's offer, and a garden. RULE: never loosen a check to make it pass. No network. Run: node scripts/test_sharemodel.mjs
import { buildShareReport, statementSeries, csvReport, warningsFrom, yearsOf } from '../js/sharemodel.js';
import { shareSheetHTML, adviserSheetHTML, recordOffer, recordWindow, WORDS } from '../js/sharemenu.js';
import { longMessage, shortText } from '../js/sharetext.js';
import { fieldCardHTML } from '../js/fieldcard.js';
import { discussModel, discussText } from '../js/discuss.js';
import { csvOf, jsonOf } from '../js/exports.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

const S = (year, crop, sow, harvest, after = 'residue') => ({ year, crop, sow, harvest, after });
const now = { id: 'now', kind: 'current', seasons: [S(1, 'corn', '2026-05-01', '2026-10-05'), S(2, 'soy', '2027-05-20', '2027-10-01')], score: 62, scores: { water: 60, soil: 55, erosion: 40, income: 80, weather: 70 } };
const wheat = { id: 'wheat', kind: 'proposed', seasons: [S(1, 'corn', '2026-05-01', '2026-10-05'), S(2, 'soy', '2027-05-20', '2027-10-01'), S(3, 'wheat', '2027-10-05', '2028-07-25', 'cover')], score: 71, scores: { water: 65, soil: 75, erosion: 78, income: 70, weather: 68 }, why: 'Winter wheat keeps living roots on the field after soybeans.', risks: ['A late soybean harvest squeezes the wheat sowing window.'], gaps: ['Soil is assumed, not measured.'] };
const barley = { id: 'barley', kind: 'proposed', seasons: [S(1, 'barley', '2026-04-20', '2026-08-01', 'bare')], score: 58, scores: { water: 60, soil: 50, erosion: 45, income: 55, weather: 60 } };
const RESULT = { ok: true, current: now, recommended: wheat, others: [barley], reason: 'Winter wheat keeps living roots on the field after soybeans.', evidence: [{ text: 'No stress thresholds crossed in 26 tested years.', sources: ['power'] }], gaps: ['Soil is assumed, not measured.'], risks: ['A late soybean harvest squeezes the wheat sowing window.'] };
const STATE = { name: 'North field', loc: { lat: 43.13, lon: -80.75, label: 'Oxford County', cc: 'CA' }, area: { pts: [[43.13, -80.75], [43.13, -80.74], [43.14, -80.74], [43.14, -80.75]], ha: 12.5 }, rotation: { preset: 'corn-soy', custom: [], garden: null }, soilTest: { ph: 6.4, om: 3.1 } };
const WEATHER = { days: [{ name: 'Mon', hi: 8, lo: -3 }, { name: 'Tue', hi: 9, lo: -1 }, { name: 'Wed', hi: 36, lo: 10, rain: 30 }, { name: 'Thu', hi: 12, lo: 4, rain: 1 }] };
const NOTES = [{ date: '2026-09-01', text: 'The north corner stays wet.', photo: false, kind: 'free' }, { date: '2026-09-02', text: 'What did I notice: weeds.', photo: false, kind: 'notice' }];

const R = buildShareReport({ state: STATE, result: RESULT, weather: WEATHER, notes: NOTES, madeOn: '2026-11-15' });
same('three strategies, in order: what you grow now, our suggestion, another option', R.strategies.map(s => [s.role, s.roleWords]), [['now', 'What you grow now'], ['suggest', 'Our suggestion'], ['another', 'Another option']]);
check('each strategy has its score, its years, its crops and why', R.strategies.every(s => s.headline && s.years.length && s.crops) && R.strategies[1].score === 71 && R.strategies[0].score === 62 && /living roots/.test(R.strategies[1].why));
same('the suggestion is "Try ..." with its years', [/^Try Corn, then soybeans, then winter wheat/.test(R.suggestion.headline), R.suggestion.years.length], [true, 3]);
same('warnings come from the forecast: frost on the cold nights, heat, heavy rain, each naming its days', warningsFrom(WEATHER.days), [{ kind: 'frost', days: ['Mon', 'Tue'], value: '-3C' }, { kind: 'heat', days: ['Wed'], value: '36C' }, { kind: 'rain', days: ['Wed'], value: '30mm' }]);
same('no forecast, no warnings (never a made-up one)', warningsFrom(null), []);
check('the check-first list ends with the advice to ask locally', /Ask a farm adviser or farmers near you before you change your rotation\.$/.test(R.checkFirst.at(-1)) && R.checkFirst.length <= 5);
check('the soil test lines come from the farmer\'s own test', R.soilTestLines.some(l => /^pH 6\.4/.test(l)));
check('the sowing line names the next sowing', /^Sow corn from 1 May/.test(R.sowLine), R.sowLine);

const long = longMessage(R, { notes: false, soilTest: false });
check('the long message names three strategies with their scores', /Three strategies compared:/.test(long) && /- What you grow now: Corn, then soybeans \(score 62\)/.test(long) && /- Our suggestion: Corn, then soybeans, then winter wheat/.test(long) && /- Another option: Spring barley \(score 58\)/.test(long), long);
check('notes and the soil test are out of the long message unless ticked, and a "What did you notice" note never goes', !/north corner/.test(long) && !/pH 6\.4/.test(long) && /north corner/.test(longMessage(R, { notes: true })) && !/weeds/.test(longMessage(R, { notes: true })) && /My soil test: pH 6\.4/.test(longMessage(R, { soilTest: true })));
check('the short text keeps its warnings first and counts', shortText(R).text.startsWith('FROST') && shortText(R).parts >= 1);
const card = fieldCardHTML({ ...R, notes: NOTES, soilTestLines: ['pH 6.4'] });
check('the field card names the strategies and never holds notes or the soil test', /Three strategies compared/.test(card) && /Another option:<\/b> Spring barley/.test(card) && !/north corner/.test(card) && !/pH 6\.4/.test(card));
const dm = discussModel(R), dt = discussText(dm);
check('the adviser page names the three strategies in its plan', /Three strategies compared: What you grow now: Corn, then soybeans \(62\); Our suggestion:/.test(dt) && /Another option: Spring barley \(58\)/.test(dt), dt.slice(0, 400));
const csv = csvOf(csvReport(R, RESULT));
check('the spreadsheet lists the strategies, the three first, typed in words', csv.ok && /"What you grow now"/.test(csv.text) && /"Our suggestion"/.test(csv.text) && /"Another option"/.test(csv.text) && csv.text.split('\r\n').filter(l => /^"Corn|^"Spring/.test(l)).length === 3, csv.text.slice(0, 300));
const json = jsonOf({ name: R.name, strategies: R.strategies, notes: [], live: {} }, 0);
check('the file holds the three strategies', json.ok && JSON.parse(json.text).strategies.length === 3);

// a garden, a missing answer
const G = buildShareReport({ state: { ...STATE, rotation: { garden: 'tea' } }, result: RESULT, madeOn: '2026-11-15' });
check('a garden has no strategies and says so in every output', G.garden && G.strategies.length === 0 && !/Three strategies/.test(longMessage(G)) && !csvReport(G, RESULT).options && /tree or bush crop/.test(longMessage(G)));
const none = buildShareReport({ state: STATE, result: null, madeOn: '2026-11-15' });
check('no answer yet: a plain report with no strategies and no made-up figure', none.strategies.length === 0 && none.suggestion === null && none.nowScore === null);
check('the keep answer says "Keep ..." and still lists three strategies when there are three', (() => { const K = buildShareReport({ state: STATE, result: { ...RESULT, recommended: now, others: [wheat, barley] }, madeOn: '2026-11-15' }); return /^Keep Corn, then soybeans/.test(K.suggestion.headline) && K.strategies.map(s => s.role).join() === 'now,worth,another'; })());

// the sheet
const html = shareSheetHTML({ strategiesCount: 3, hasNotes: true, hasSoil: true, garden: false, record: { ok: false, why: 'The weather record of this field is not read yet, so no season is ranked.' }, us: false, ticks: {} });
check('the sheet says three strategies, offers every output and starts with every tick off', /three strategies/.test(html) && ['copy-short', 'copy-long', 'print-card', 'csv', 'json', 'adviser'].every(a => html.includes(`data-share="${a}"`)) && !/ checked/.test(html) && /id="tkNotes"/.test(html) && /id="tkSoil"/.test(html));
check('the season record says why when it cannot be offered, and has no print button then', /not read yet, so no season is ranked/.test(html) && !/print-record/.test(html));
check('the drought tick shows only for a US field with its sentence about the position', !/tkDrought/.test(html) && /tkDrought/.test(shareSheetHTML({ strategiesCount: 3, record: { ok: true }, us: true, ticks: {} })) && /asks the US FCC for your county/.test(shareSheetHTML({ strategiesCount: 3, record: { ok: true }, us: true, ticks: {} })));
check('a garden\'s sheet does not claim strategies', !/three strategies/.test(shareSheetHTML({ strategiesCount: 3, garden: true, record: null, ticks: {} })));
const adv = adviserSheetHTML({ ...R, farmerPick: null }, { change: 'suggestion', showWhere: false, notes: false, soilTest: false, edits: {} });
check('the adviser view has the change to discuss, the four boxes and says what is left out', /id="dsChange"/.test(adv) && (adv.match(/data-ds=/g) ?? []).length === 4 && /Left out: where the field is, your notes and your soil test\./.test(adv) && /Crophalo sends nothing/.test(adv));
check('every text box in the sheet has a name', (html.match(/<textarea[^>]*aria-labelledby/g) ?? []).length === 2 && (adv.match(/<label class="field"><span>/g) ?? []).length >= 5);
// the season record
const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2001, 0, 1) + i * 864e5).toISOString().slice(0, 10));
check('no weather record: no season is ranked, and it says why; no sown season yet says so', !recordOffer({ series: null, result: RESULT, today: '2026-11-15' }).ok && /no season of the plan|nothing to rank/i.test(recordOffer({ series: { start: '2001-01-01', rain: [] }, result: { current: { seasons: [] } }, today: '2026-11-15' }).why));
same('the season to rank is the one sown most recently on or before today', recordWindow(RESULT, '2026-11-15').crop, 'corn');
import fs from 'node:fs';
import { buildSeries } from '../js/data.js';
import { buildRecord, recordHTML } from '../js/statement.js';
{
  const POW = buildSeries(JSON.parse(fs.readFileSync(new URL('./fixtures/power_oxford.json', import.meta.url), 'utf8')), { lat: 43.13, lon: -80.75 });
  const SS = statementSeries(POW); check('the weather record is turned into the season record\'s shape: a start, aligned arrays, a missing day is null', SS && SS.start === '2001-01-01' && SS.rain.length === POW.days.length && SS.rain.every(v => v === null || v > -900), brief(Object.keys(SS ?? {})));
  const off = recordOffer({ series: SS, result: RESULT, today: '2026-11-14' });
  check('with the real weather record of the demo place the season record is offered, for the crop sown this season', off.ok === true && off.win.start === '2026-05-01', brief(off));
  const rec = buildRecord({ name: 'North field', place: 'Oxford County', crop: 'Corn', series: SS, win: off.win, units: { rain: 'mm', temp: 'C' }, madeOn: '2026-11-14', sources: [], notes: [] }), html = recordHTML(rec);
  const plain = html.replace(/Public weather data[^<]*not an official record\./g, '').replace(/Ranks only: this record says nothing about yields or money\./g, '');
  check('the record is ranks only and never a loss, a yield or a money word', rec.ok && /Ranks only/.test(html) && !/\b(loss|yield|income|profit|insur)\w*/i.test(plain), plain.slice(0, 200));
}
console.log(`sharemodel: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
