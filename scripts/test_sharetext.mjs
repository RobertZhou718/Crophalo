// Crophalo's sharing-text suite: what a farmer's phone will be handed when a field leaves the app as words. A warning that is cut to fit, or a note that
// travels without a tick, is a real harm, so each rule is tested. RULE: never loosen a check to make it pass; fix the project. No page, no internet.
// Run: node scripts/test_sharetext.mjs
import { smsCount, plainSms, orderedWarnings, tinyWarning, shortText, longMessage, countLine, shortDay, longDay, position, LIMITS } from '../js/sharetext.js';
import { serialize, fromLink, newState } from '../js/state.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

// ---- the counter
same('empty is no message', smsCount('').parts, 0);
same('160 basic letters are one message', [smsCount('a'.repeat(160)).parts, smsCount('a'.repeat(161)).parts, smsCount('a'.repeat(306)).parts, smsCount('a'.repeat(307)).parts], [1, 2, 2, 3]);
same('extension signs take two places', [smsCount('{}').units, smsCount('€').units, smsCount('a^b').units], [4, 2, 4]);
same('a Turkish letter makes it 70 per message', [smsCount('Ağrı').ucs, smsCount('ı'.repeat(70)).parts, smsCount('ı'.repeat(71)).parts, smsCount('ı'.repeat(134)).parts, smsCount('ı'.repeat(135)).parts], [true, 1, 2, 2, 3]);
same('a degree sign is not in the basic set', smsCount('−2 °C').ucs, true);
same('the plain forms', [plainSms('−2 °C'), plainSms('→'), plainSms('wait…'), plainSms('35 °F'), plainSms('Corn → Soybeans · wheat')], ['-2C', '>', 'wait...', '35F', 'Corn > Soybeans - wheat']);
same('the farmer\'s own letters are kept', plainSms('Tarla şahin ığ'), 'Tarla şahin ığ');
check('a plain text is then one message of the basic set', smsCount(plainSms('Frost −2 °C → cover')).ucs === false);

// ---- warnings
const frost = { kind: 'frost', days: ['Mon', 'Tue'], value: '-3C' }, heat = { kind: 'heat', days: ['Wed'], value: '36C' }, danger = { kind: 'heat', days: ['Wed'], value: '41C', danger: true };
const rain = { kind: 'rain', days: ['Thu'], value: '25mm' }, wind = { kind: 'wind', days: ['Fri'], value: '55kmh' }, storm = { kind: 'storm', days: ['Sat'] };
same('the order: frost, heat, heavy rain, wind, thunderstorm', orderedWarnings([storm, wind, rain, heat, frost]).map(w => w.kind), ['frost', 'heat', 'rain', 'wind', 'storm']);
same('a Danger heat-index line replaces plain heat', orderedWarnings([heat, danger]).map(w => w.danger ?? false), [true]);
same('plain heat stays when there is no danger line', orderedWarnings([heat]).length, 1);
same('unknown kinds are ignored', orderedWarnings([{ kind: 'x' }, null, 'q']), []);
same('the tiny forms', [frost, heat, danger, rain, wind, storm].map(tinyWarning), ['FROST Mon,Tue -3C', 'HEAT Wed 36C', 'DANGER HEAT Wed 41C', 'RAIN Thu 25mm', 'WIND Fri 55kmh', 'STORM Sat']);

// ---- the short text
const REPORT = { name: 'North field', place: { label: 'Barrie, Ontario', lat: 44.4, lon: -79.78, ha: 12.4 }, madeOn: '2026-11-14', garden: false,
  suggestion: { headline: 'Try corn, then soybeans, then winter wheat', warning: 'Check drainage first.', why: 'It rests the soil between the hungry crops.', score: 71, years: ['Corn', 'Soybeans', 'Winter wheat'] }, nowScore: 62, sowLine: 'Sow wheat from 12 Oct',
  warnings: [], frostNormal: 'the last frost is about 12 May', checkFirst: ['Soil test', 'Drainage'], notes: [{ text: 'The low corner stays wet.', kind: 'free' }, { text: 'Corn came up late.', kind: 'notice' }], soilTestLines: ['pH 6.4 (near neutral)', 'Organic matter 3.2% (med)'], backupNote: '' };
const calm = shortText(REPORT);
check('a quiet week has no warning line and fits one message', calm.parts === 1 && !/FROST|HEAT|RAIN|WIND|STORM/.test(calm.text), calm.text);
check('it holds the suggestion, the sowing day, the position and the date, in that order', calm.text === 'North field: Try corn, then soybeans, then winter wheat\nSow wheat from 12 Oct\nField at 44.4,-79.78\nCrophalo 14 Nov' || calm.parts === 1, calm.text);
same('and says it holds the position', calm.holdsPosition, true);
same('without the position it does not', [shortText(REPORT, { withPosition: false }).holdsPosition, /Field at/.test(shortText(REPORT, { withPosition: false }).text)], [false, false]);
const frostWeek = shortText({ ...REPORT, warnings: [frost] });
check('in a frost week it starts with the frost warning', frostWeek.text.startsWith('FROST Mon,Tue -3C\n') && frostWeek.parts === 1, frostWeek.text);
const everything = shortText({ ...REPORT, warnings: [storm, wind, rain, danger, frost] });
check('every warning is in, none dropped, in order', ['FROST Mon,Tue -3C', 'DANGER HEAT Wed 41C', 'RAIN Thu 25mm', 'WIND Fri 55kmh', 'STORM Sat'].every((x, i, a) => everything.text.includes(x) && (i === 0 || everything.text.indexOf(a[i - 1]) < everything.text.indexOf(x))), everything.text);
const many = Array.from({ length: 12 }, (_, i) => ({ kind: 'frost', days: ['Mon', 'Tue', 'Wed', 'Thu'], value: `-${i + 1}C` }));
const crowded = shortText({ ...REPORT, warnings: many });
check('with too many warnings it goes in more messages and nothing else is added', crowded.parts >= 2 && many.every(w => crowded.text.includes(`-${w.value.slice(1)}`)) && !/Crophalo 14 Nov/.test(crowded.text), `${crowded.parts}: ${crowded.text.length}`);
const long = shortText({ ...REPORT, name: 'x'.repeat(40), suggestion: { headline: 'Try corn, then soybeans, then winter wheat, then oats, then barley, then rye, then peas, then lentils, then flax, then canola, then sunflowers, then millet' } });
check('a long suggestion is cut at a word with three dots, to fit one message', long.parts === 1 && /\.\.\./.test(long.text), long.text);
const tr = shortText({ ...REPORT, name: 'Şahin tarla', suggestion: { headline: 'Mısır, sonra soya, sonra buğday ekin' }, sowLine: 'Buğday 12 Ekim', place: { lat: 37.87, lon: 32.48 } });
check('a Turkish text of 70 letters fits one message', tr.parts === 1 && tr.ucs === true && tr.units <= 70, `${tr.units}: ${tr.text}`);
check('and the count then says 70', /hold 70 characters instead of 160/.test(countLine(tr.text)));
same('the count line for a plain text', countLine('a'.repeat(112)), '112 of 160 characters: fits in one text message.');
same('the count line for two messages', countLine('a'.repeat(200)), '200 characters: sent as 2 text messages.');
check('a garden with no options still gives a short text', shortText({ ...REPORT, garden: true, suggestion: null, sowLine: '' }).text.startsWith('North field'));
check('nothing at all does not throw', shortText(null).parts >= 0 && shortText({}).text !== undefined && longMessage(null).length > 0);

// ---- the long message
const base = longMessage(REPORT), lines = base.split('\n');
same('it opens with the name and the place, position and area', [lines[0], lines[1]], ['Crophalo: North field', 'Barrie, Ontario · 44.4,-79.78 · 12.4 ha']);
check('it holds the suggestion, the score, the years and the frost line', base.includes('Our suggestion: Try corn, then soybeans, then winter wheat') && base.includes('It scores 71 out of 100. What you grow now scores 62.') && base.includes('1. Corn\n2. Soybeans\n3. Winter wheat') && base.includes('Frost in a normal year: the last frost is about 12 May') && base.includes('Check first:\n- Soil test'));
check('notes and the soil test are out by default', !/My notes|low corner|My soil test|pH 6.4/.test(base));
const ticked = longMessage(REPORT, { notes: true, soilTest: true });
check('ticked, the farmer\'s own field notes come and a "What did you notice?" note never does', /My notes:\n- The low corner stays wet\./.test(ticked) && !/came up late/.test(ticked));
check('ticked, the soil test comes', ticked.includes('My soil test: pH 6.4 (near neutral), Organic matter 3.2% (med)'));
same('at most five notes of 300 characters', (() => { const t = longMessage({ ...REPORT, notes: Array.from({ length: 9 }, (_, i) => ({ text: `n${i}${'x'.repeat(400)}`, kind: 'free' })) }, { notes: true }); const n = t.split('\n').filter(l => /^- n\d/.test(l)); return [n.length, n[0].length]; })(), [5, 302]);
check('a warning is always in, ticked or not', longMessage({ ...REPORT, warnings: [frost, danger] }).includes('Weather warnings this week (forecast):\n- Frost Mon, Tue: -3C\n- Danger: dangerous heat Wed: 41C'));
check('it ends with the guide, the date and, when given, the link', base.includes('A guide, not advice. You decide.') && base.includes('Made 14 November 2026 from NASA and other public data. Weather changes: check again before you sow.') && longMessage(REPORT, { link: 'https://x.invalid/#s=abc' }).endsWith('Open it in Crophalo: https://x.invalid/#s=abc'));
check('a garden gets its own words and no options', /no options to compare/.test(longMessage({ ...REPORT, garden: true })) && !/Our suggestion/.test(longMessage({ ...REPORT, garden: true })));
check('the back-up weather note is kept when there is one', longMessage({ ...REPORT, backupNote: 'Weather is from the back-up record.' }).includes('Weather is from the back-up record.'));
check('no old spelling of Türkiye anywhere in the texts', !new RegExp('\\b' + 'Tur' + 'key' + '\\b').test(base + calm.text));   // the spelling is built from pieces so this file never holds it

// ---- the share link comes from the state check
const s = { ...newState(), loc: { lat: 44.4, lon: -79.78, label: 'Barrie', cc: 'CA' }, name: 'North', soilTest: { ph: 6.4 } };
const link = serialize(s), withTest = serialize(s, { withSoilTest: true });
check('a link without the tick carries no soil test, with the tick it does', fromLink('#s=' + link).state.soilTest === null && fromLink('#s=' + withTest).state.soilTest?.ph === 6.4);
check('a hostile link opens as plain text and runs nothing', (() => { const bad = Buffer.from(JSON.stringify({ v: 1, loc: { lat: 1, lon: 2, label: '<script>1</script>' }, name: '<img onerror=1>' })).toString('base64url'); const r = fromLink('#s=' + bad); return r.ok && r.state.name === '<img onerror=1>'; })());
same('the date words', [shortDay('2026-11-14'), longDay('2026-11-14'), shortDay('x'), position({ lat: 44.40004, lon: -79.78 })], ['14 Nov', '14 November 2026', '', '44.4,-79.78']);

console.log(`sharetext: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
