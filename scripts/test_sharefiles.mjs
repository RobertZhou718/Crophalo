// Crophalo's suite for the pieces of Share and print that leave the app as pages and files: the field card, Discuss this field, "What did you notice?" and the
// CSV and JSON downloads. What is on paper or in a file is out of the farmer's hands, so each rule that keeps something off it is tested: notes, the soil test,
// the photo and the position travel only when ticked. RULE: never loosen a check to make it pass; fix the project. No page and no internet. Run: node scripts/test_sharefiles.mjs
import { fieldCardHTML, outlineSVG } from '../js/fieldcard.js';
import { discussModel, discussText, discussHTML, liveLine, changeChoices, GARDEN_WORDS, BOXES, TOO_LONG, copyText, COPY_WORDS } from '../js/discuss.js';
import { cleanNote, cleanNotes, noticeDue, pickRecord, recordWords, readNotes, writeNotes } from '../js/notice.js';
import { csvOf, jsonOf, cell, fileName, NO_OPTIONS, NO_REPORT, CSV_HEADER } from '../js/exports.js';
const YR = 2026;   // the year of the suite's own today (14 November): every date below is written from it

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

const SQUARE = [[44.39, -79.79], [44.39, -79.77], [44.41, -79.77], [44.41, -79.79]];
const REPORT = { name: 'North field', place: { label: 'Barrie, Ontario', lat: 44.4, lon: -79.78, ha: 12.4 }, madeOn: `${YR}-11-14`, garden: false, area: { pts: SQUARE },
  suggestion: { headline: 'Try corn, then soybeans', years: ['Corn', 'Soybeans'], score: 71, why: 'It rests the soil.', catch: 'Needs drainage.', gaps: ['Soil test', 'Seed supply', 'A third gap'], warning: 'Check drainage first.', refs: [1, 2] },
  nowScore: 62, nowYears: ['Soybeans', 'Soybeans'], warnings: [{ kind: 'frost', days: ['Mon', 'Tue'], value: '-3C' }], frostNormal: 'the last frost is about 12 May', checkFirst: ['Soil test', 'Drainage'],
  notes: [{ text: 'The low corner stays wet.', kind: 'free' }, { text: 'Corn came up late.', kind: 'notice' }], soilTestLines: ['pH 6.4 (near neutral)', 'Organic matter 3.2% (med)'],
  options: [{ headline: 'Wheat, then barley', years: ['Wheat', 'Barley'], score: 60, why: 'Cheap.', catch: 'Low income.', gaps: ['Buyer'] }, { headline: 'Peas, then wheat', years: ['Peas', 'Wheat'], score: 66 }], farmerPick: 1,
  sources: [{ name: 'NASA POWER', who: 'NASA', url: 'https://power.larc.nasa.gov' }, { name: 'Open-Meteo', who: 'Open-Meteo', url: 'https://open-meteo.com' }] };

// ======== the field card
const card = fieldCardHTML(REPORT);
check('the card has its head, the answer, the warnings, the years, the frost line and the boxes to tick', ['CROPHALO FIELD CARD', 'North field', 'Barrie, Ontario · 44.4,-79.78 · 12.4 ha', `Made 14 November ${YR}`, 'Our suggestion', 'Weather warnings this week', 'Frost Mon, Tue: -3C', 'Year by year', '<li>Corn</li>', 'Frost in a normal year', 'Check first', 'fc-boxmark'].every(x => card.includes(x)));
check('the score line says it is not a chance of success', card.includes('Score 71 out of 100 (what you grow now: 62). A guide, not a chance of success.'));
check('the sources are numbered notes with their address', /<ol class="fc-sources"><li>NASA POWER\. NASA\. https:\/\/power\.larc\.nasa\.gov<\/li>/.test(card) && card.includes('<sup>1,2</sup>'));
check('notes and the soil test are NEVER on the card', !/low corner|came up late|pH 6\.4|My notes|soil test/i.test(card.replace('Soil test', '').replace('<li><span class="fc-boxmark" aria-hidden="true"></span>Soil test</li>', '')));
check('the footer has the guide line and the date', card.includes('A guide, not advice. You decide.') && card.includes(`Made 14 November ${YR} from NASA and other public data.`));
check('a card with no outline says where the pin is', fieldCardHTML({ ...REPORT, area: null }).includes('No outline drawn. The answer is for the pin at 44.4,-79.78.'));
check('a garden gets a card of its own words and no plan or years', (() => { const g = fieldCardHTML({ ...REPORT, garden: true }); return g.includes('A tree or bush crop') && !g.includes('Year by year') && !g.includes('Our suggestion'); })());
check('words from outside are plain text on the card', !/<img src=x/.test(fieldCardHTML({ ...REPORT, name: '<img src=x onerror=1>', checkFirst: ['<b>x</b>'] })) && !/<b>x<\/b>/.test(fieldCardHTML({ ...REPORT, checkFirst: ['<b>x</b>'] })));
const svg = outlineSVG({ pts: SQUARE });
check('the outline is a closed path with a north arrow, and nothing for fewer than three corners', /<path d="M[^"]+Z"/.test(svg) && svg.includes('>N<') && outlineSVG({ pts: [[1, 2], [3, 4]] }) === '' && outlineSVG(null) === '');
check('longitude is squeezed so a square field looks square (at 60 degrees it is half as wide)', (() => { const ratio = a => { const m = /M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/.exec(outlineSVG(a)); return m ? Math.abs(+m[3] - +m[1]) / (Math.abs(+m[6] - +m[4]) || 1) : 0; }; const eq = ratio({ pts: [[0, 0], [0, 1], [-1, 1], [-1, 0]] }), north = ratio({ pts: [[60, 0], [60, 1], [59, 1], [59, 0]] }); return Math.abs(eq - 1) < 0.01 && Math.abs(north - 0.5) < 0.02; })());

// ======== Discuss this field
const dm = discussModel(REPORT);
check('the plan starts with now, then the change, then the score and the guide', dm.boxes.plan.startsWith('Now, year by year:\n1. Soybeans\n2. Soybeans') && dm.boxes.plan.includes('The change to discuss (Crophalo’s suggestion), year by year:\n1. Corn\n2. Soybeans') && dm.boxes.plan.includes('Crophalo’s score: 71 out of 100 (what I grow now: 62). A guide, not a chance of success.'));
same('why and the catch, and at most two gaps', [dm.boxes.why, dm.boxes.unknown], ['Why: It rests the soil.\nThe catch: Needs drainage.', '- Soil test\n- Seed supply']);
same('the question starts empty', dm.boxes.question, '');
same('the change choices: the suggestion, the farmer\'s own pick first among options, then No change', changeChoices(REPORT).map(c => c.value), ['suggestion', 'option:1', 'option:0', 'none']);
check('choosing the farmer\'s own option says so', discussModel(REPORT, { change: 'option:1' }).boxes.plan.includes('(my own pick)') && /Peas/.test(discussModel(REPORT, { change: 'option:1' }).boxes.plan));
check('"No change" says so', discussModel(REPORT, { change: 'none' }).boxes.plan.includes('No change: I keep what I grow.'));
check('the edits win and are cut at their limits', (() => { const m = discussModel(REPORT, { edits: { plan: 'x'.repeat(3000), question: 'q'.repeat(900), why: 'w'.repeat(900), unknown: 'u'.repeat(900) } }); return [m.boxes.plan.length, m.boxes.question.length, m.boxes.why.length, m.boxes.unknown.length].join() === '2400,400,700,800'; })());
check('a box edited to nothing stays empty', discussModel(REPORT, { edits: { why: '' } }).boxes.why === '');
same('where the field is: only the area by default, the place and position when ticked', [dm.where, discussModel(REPORT, { showWhere: true }).where], ['About 12.4 ha', 'Barrie, Ontario · 44.4,-79.78 · 12.4 ha']);
check('the outline is on the page only when the place is ticked', !discussHTML(dm).includes('fc-outline') && discussHTML(discussModel(REPORT, { showWhere: true })).includes('fc-outline'));
check('notes and the soil test are out unless ticked, and a notice note never goes', (() => { const off = discussText(dm), on = discussText(discussModel(REPORT, { notes: true, soilTest: true })); return !/low corner|pH 6\.4/.test(off) && /low corner/.test(on) && /pH 6\.4/.test(on) && !/came up late/.test(on); })());
check('the page says what is in and what is left out', liveLine().includes('Left out: where the field is, your notes and your soil test.') && liveLine({ showWhere: true, notes: false, soilTest: true }).includes('In it: where the field is and your soil test.') && liveLine().includes('no link and no photos'));
check('the copied text follows the page order and ends with the sources', (() => { const t = discussText(discussModel(REPORT, { edits: { question: 'Is it worth a trial?' } })); return t.startsWith('Field brief: North field\nAbout 12.4 ha') && t.indexOf('The plan:') < t.indexOf('Why, and the catch:') && t.indexOf('Why, and the catch:') < t.indexOf('Not known yet:') && t.indexOf('Not known yet:') < t.indexOf('My question:\nIs it worth a trial?') && t.endsWith('2. Open-Meteo. Open-Meteo. https://open-meteo.com'); })());
check('no triple blank lines in the copied text', !/\n\n\n/.test(discussText(dm)));
check('a long page is told to shorten, a longer one prints tighter', !dm.tooLong && discussModel(REPORT, { edits: { plan: Array.from({ length: 80 }, (_, i) => `line ${i}`).join('\n') } }).tooLong && discussModel(REPORT, { edits: { plan: Array.from({ length: 56 }, (_, i) => `line ${i}`).join('\n') } }).tight && /longer than one page/.test(TOO_LONG));
check('the printed brief has its sections, the question boxed, the sources', (() => { const h = discussHTML(discussModel(REPORT, { edits: { question: 'Is it worth a trial?' } })); return h.includes('Crophalo field brief') && h.includes('ds-boxed') && h.includes('<ol class="ds-sources">') && h.includes('A guide, not advice. You decide.'); })());
same('a garden has no options to discuss', [discussModel({ ...REPORT, garden: true }).text, discussText(discussModel({ ...REPORT, garden: true }))], [GARDEN_WORDS, GARDEN_WORDS]);
check('words from outside are plain text in the brief', !/<img src=x/.test(discussHTML(discussModel({ ...REPORT, name: '<img src=x onerror=1>' }, { edits: { plan: '<b>x</b>' } }))) && !/<b>x<\/b>/.test(discussHTML(discussModel(REPORT, { edits: { plan: '<b>x</b>' } }))));
same('copy: the clipboard first, then a selection, then failure', [await copyText('x', { navigator: { clipboard: { writeText: async () => {} } } }), await copyText('x', { navigator: {}, document: { execCommand: () => true } }, { select() {}, focus() {} }), await copyText('x', { navigator: { clipboard: { writeText: async () => { throw new Error('no'); } } } }, null)], ['copied', 'copied', 'failed']);
check('the copy words', COPY_WORDS.copied === 'Copied. Paste it into your message or email.');
check('the boxes and their limits are the ones the page promises', BOXES.plan.max === 2400 && BOXES.why.max === 700 && BOXES.unknown.max === 800 && BOXES.question.max === 400);

// ======== What did you notice?
const NOTE = { id: 'n0000001', date: `${YR}-05-10`, text: 'The low corner stayed wet. Corn there came up late.', photo: true, kind: 'notice', fieldId: '44.4000,-79.7800', crop: 'Corn' };
same('a note is kept without the picture', cleanNote({ ...NOTE, picture: 'data:image/png;base64,AAAA' }), NOTE);
same('a note with neither words nor a photo is nothing, nor one with a bad day or id', [cleanNote({ ...NOTE, text: '', photo: false }), cleanNote({ ...NOTE, date: `${YR}-13-40` }), cleanNote({ ...NOTE, id: 'a b' }), cleanNote(null)], [null, null, null, null]);
check('500 characters at most, an unknown kind is a free note', cleanNote({ ...NOTE, text: 'x'.repeat(900) }).text.length === 500 && cleanNote({ ...NOTE, kind: 'zz' }).kind === 'free');
same('the list is cleaned, repeated ids keep the first', cleanNotes([NOTE, { ...NOTE, text: 'again' }, 'x']).length, 1);
same('the prompt is due after the season, with no record in its last month', [noticeDue({ seasonEnd: `${YR}-11-08`, today: `${YR}-11-14`, notes: [] }), noticeDue({ seasonEnd: `${YR}-11-08`, today: `${YR}-11-08`, notes: [] })], [true, false]);
same('and not when a notice was written in the last month', noticeDue({ seasonEnd: `${YR}-11-08`, today: `${YR}-11-14`, notes: [{ ...NOTE, date: `${YR}-10-20` }], fieldId: '44.4000,-79.7800' }), false);
same('a free note does not count as a record', noticeDue({ seasonEnd: `${YR}-11-08`, today: `${YR}-11-14`, notes: [{ ...NOTE, date: `${YR}-10-20`, kind: 'free' }] }), true);
const older = { ...NOTE, id: 'n0000002', date: `${YR}-03-01`, crop: 'Wheat', text: 'Wheat was fine.' };
same('the record is a note at least 30 days old, the plan\'s crop first, newest first', [pickRecord({ notes: [NOTE, older], crops: ['Wheat'], today: `${YR}-11-14` }).id, pickRecord({ notes: [NOTE, older], crops: [], today: `${YR}-11-14` }).id, pickRecord({ notes: [{ ...NOTE, date: `${YR}-11-01` }], today: `${YR}-11-14` })], ['n0000002', 'n0000001', null]);
same('the record in words', [recordWords(NOTE), recordWords({ ...NOTE, text: '' }), recordWords(null)], [`Your record, May ${YR}: The low corner stayed wet. Corn there came up late.`, `Your record, May ${YR}: a photo`, '']);
const store = new Map(), good = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
check('notes are kept on the device and a blocked store does not throw', writeNotes([NOTE], good) && readNotes(good).length === 1 && writeNotes([NOTE], { setItem() { throw new Error('x'); } }) === false && readNotes({ getItem() { throw new Error('x'); } }).length === 0);
check('the storage key is the new one', store.has('crophalo.notes.v1'));

// ======== the CSV and the JSON
const RR = { name: 'North Field, Ünal', options: [{ name: 'Corn, then soybeans', type: 'rotation', score: 71, scores: { water: 70, soil: 80, erosion: 60, income: 75, weather: 65 }, pestBreak: 'good', bareMonths: 4, waterNeedMm: 620, erosionExposure: 'medium' }, { name: '=HYPERLINK("x")', type: 'rotation', score: 50, scores: {} }], weatherSource: 'NASA POWER', advice: 'A guide, not advice. You decide.' };
const csv = csvOf(RR);
check('the header row, in the note\'s order', csv.text.split('\r\n')[0] === CSV_HEADER.map(h => `"${h}"`).join(','));
check('one row per option, every cell quoted, numbers as numbers', csv.text.split('\r\n')[1] === '"Corn, then soybeans","rotation","71","70","80","60","75","65","good","4","620","medium"', csv.text.split('\r\n')[1]);
check('a text that a spreadsheet would run as a formula is made plain', csv.text.includes('"\'=HYPERLINK(""x"")"'));
check('then the weather source and the advice line, CRLF throughout', csv.text.includes('\r\n"Weather source","NASA POWER"\r\n"Advice","A guide, not advice. You decide."\r\n') && !/[^\r]\n/.test(csv.text));
same('the file name', [csv.name, fileName('Tarla Şahin / 1', 'csv'), fileName('', 'csv'), fileName('!!!', 'csv')], ['crophalo-north-field-unal.csv', 'crophalo-tarla-sahin-1.csv', 'crophalo-field.csv', 'crophalo-field.csv']);
same('a garden has no table, and no report says to open it first', [csvOf({ ...RR, garden: true }).message, csvOf({ ...RR, options: [] }).message, csvOf(null).message], [NO_OPTIONS, NO_OPTIONS, NO_REPORT]);
same('a quote inside a cell is doubled', cell('say "hi"'), '"say ""hi"""');
const js = jsonOf({ name: 'North', inputs: { v: 1 }, notes: [{ date: `${YR}-05-10`, text: 'wet corner', photo: true, kind: 'notice', picture: 'data:...', history: ['corn'] }], strategies: [{ name: 'A' }], live: { soilSurvey: { ok: true } }, cropHistory: ['corn'] }, Date.UTC(2026, 10, 14, 12));
const parsed = JSON.parse(js.text);
same('the JSON holds the generated time, the tool and the disclaimer', [parsed.generated, parsed.tool, parsed.disclaimer], ['2026-11-14T12:00:00.000Z', 'Crophalo', 'A guide, not advice. You decide.']);
same('notes are words and a flag only, never the picture, and the crop history is not in it', [parsed.notes, 'cropHistory' in parsed, js.text.includes('data:')], [[{ date: `${YR}-05-10`, text: 'wet corner', photo: true, kind: 'notice' }], false, false]);
same('no report says to open it first', jsonOf(null).message, 'Open the report first, then export it.');

console.log(`share files: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
