// Crophalo's share-model and share-sheet suite: the report as plain data names three strategies in every output (the long message, the card, the adviser page, the spreadsheet, the file), warnings come from the forecast, notes and the soil test travel only when handed in and ticked,
// the sheet's markup, the season record's offer, and a garden. RULE: never loosen a check to make it pass. No network. Run: node scripts/test_sharemodel.mjs
import { buildShareReport, statementSeries, csvReport, warningsFrom, yearsOf } from '../js/sharemodel.js';
import { shareSheetHTML, WORDS } from '../js/sharemenu.js';
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
const html = shareSheetHTML();
check('the sheet is titled Print or save, offers exactly two actions, Print and Save as PDF, and the one line about the print window', (html.match(/data-share="(?!close)/g) ?? []).length === 2 && html.includes('data-share="print"') && html.includes('data-share="pdf"') && />Print</.test(html) && />Save as PDF</.test(html) && /In the print window choose Save as PDF\./.test(html));
check('none of the older outputs is on the sheet (texts, copy boxes, the field card, the season record, the files, the adviser)', !/copy-short|copy-long|print-card|print-record|data-share="csv"|data-share="json"|data-share="adviser"|<textarea|tkPos|tkDrought/.test(html));
// the season record
const days = n => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2001, 0, 1) + i * 864e5).toISOString().slice(0, 10));
import fs from 'node:fs';
import { buildSeries } from '../js/data.js';
import { buildRecord, recordHTML } from '../js/statement.js';
{
  const POW = buildSeries(JSON.parse(fs.readFileSync(new URL('./fixtures/power_oxford.json', import.meta.url), 'utf8')), { lat: 43.13, lon: -80.75 });
  const SS = statementSeries(POW); check('the weather record is turned into the season record\'s shape: a start, aligned arrays, a missing day is null', SS && SS.start === '2001-01-01' && SS.rain.length === POW.days.length && SS.rain.every(v => v === null || v > -900), brief(Object.keys(SS ?? {})));
}
{ const mk = note => buildShareReport({ state: STATE, result: RESULT, madeOn: '2026-11-15', baseNote: note });
  check('the weather source is carried into the table of strategies: NASA POWER normally, the back-up record named when it was used', csvReport(mk(''), RESULT).weatherSource === 'NASA POWER' && /Open-Meteo/.test(csvReport(mk('The weather is from the back-up record.'), RESULT).weatherSource), [csvReport(mk(''), RESULT).weatherSource, csvReport(mk('x'), RESULT).weatherSource]); }
console.log(`sharemodel: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
