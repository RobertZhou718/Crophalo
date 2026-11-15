// Crophalo's printed-report suite: the parts that need no page: the title block, the file name, and the order and the words of the parts, held to the one-page report's own headings.
// Checked in a page by scripts/e2e_share.mjs. RULE: never loosen a check to make it pass. Run: node scripts/test_printdoc.mjs
import { titleBlockHTML, footCSS, END_LINE, glanceHTML, EMPTY_MONEY, docTitle, PARTS, GUIDE_LINE, SAVE_NOTE, SOURCES_FOLD } from '../js/printdoc.js';
import { H, blockHTML } from '../js/letter-view.js';
import { shareSheetHTML, WORDS } from '../js/sharemenu.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else { fail++; console.log(`FAIL  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };

const t = titleBlockHTML({ name: 'North <field>', place: 'Near Barrie, Ontario', size: '10.0 ha', madeOn: '15 November 2026' });
check('the title block carries the logo mark and the name small, the field\'s name large, ONE quiet line (place, size, the day made) and the guide line under it', /pd-mark/.test(t) && />Crophalo</.test(t) && /<h1 class="pd-name">North &lt;field&gt;<\/h1>/.test(t) && /Near Barrie, Ontario · 10\.0 ha · Report made on 15 November 2026/.test(t) && t.indexOf('pd-quiet') < t.indexOf('pd-guide') && t.includes(GUIDE_LINE));
check('the name is escaped, never markup', !/<field>/.test(t));
check('the guide line is the one the owner named', GUIDE_LINE === 'Crophalo: a guide, you decide what to plant.');
check('with no place, size or day the block still reads whole (a name and the guide line) and has no empty quiet line', /<h1 class="pd-name">My field<\/h1>/.test(titleBlockHTML({})) && !/pd-quiet/.test(titleBlockHTML({})));
check('the foot names the field and the page of the pages on the left and the day on the right, and a quote in a name cannot break out of the style', /page " counter\(page\) " of " counter\(pages\)/.test(footCSS({ name: 'North', madeOn: '15 November 2026' })) && /@bottom-right \{ content: "15 November 2026"/.test(footCSS({ name: 'North', madeOn: '15 November 2026' })) && !/"\}/.test(footCSS({ name: 'a"}b', madeOn: '' }).replace(/content: "[^"]*"/g, '')) && !footCSS({ name: 'a"b', madeOn: '' }).includes('a"b'));
check('the print window offers a file name with the field and the day', docTitle('North field', '15 November 2026') === 'Crophalo report – North field – 15 November 2026' && docTitle('', '') === 'Crophalo report – My field');
check('the parts are the one page\'s own headings, in its order: the answer, the strategies, what could go wrong, when, more about the field', PARTS.map(p => p[1]).join('|') === [H.answer, H.compare, H.wrong, H.when, H.more].join('|'));
check('each part is a block of the page with the id the page gives it (blk + name)', PARTS.every(([id, title]) => { const k = id.slice(3); const html = blockHTML(k, title, ''); return html.includes(`id="${id}"`); }) || PARTS.every(([id]) => /^blk[A-Z]/.test(id)));
check('the sources are a fold of the page, printed open', SOURCES_FOLD === 'lfSources');
const sheet = shareSheetHTML();
check('the sheet holds Print and Save as PDF and says to choose Save as PDF in the print window', (sheet.match(/data-share="(?!close)/g) ?? []).length === 2 && sheet.includes(SAVE_NOTE) && WORDS.print === 'Print' && WORDS.pdf === 'Save as PDF');
check('the last line of the document says Crophalo supports the farmer\'s judgment and does not replace local advice', /supports your judgment/.test(END_LINE) && /local advice/.test(END_LINE));
const gl = glanceHTML([{ rec: false, tag: 'What you grow now', name: 'Corn, then soybeans', score: '<span class="chip score">62</span>', change: 'No change. This is your field today.' }, { rec: true, tag: 'Our suggestion', name: 'Corn, then soybeans, then winter wheat', score: '<span class="chip score">71</span>', change: 'Adds winter wheat, with a cover crop after harvest.' }, { rec: false, tag: 'Another option', name: 'Spring <barley>', score: '', change: '' }]);
check('the answer at a glance: a title, one row for each strategy with its tag, name, score and the one line of what changes, the chosen one marked, names escaped, nothing made up', /The three strategies at a glance/.test(gl) && (gl.match(/<li class="pd-g/g) ?? []).length === 3 && /pd-g is-rec"><span class="pd-g-tag">Our suggestion/.test(gl) && /Adds winter wheat, with a cover crop after harvest\./.test(gl) && /Spring &lt;barley&gt;/.test(gl) && glanceHTML([]) === '' && !/pd-g-change[^<]*<\/span>.*pd-g-change"><\/span>/.test(gl));
check('a money line that says there is no figure is the one that is not printed', EMPTY_MONEY.test('No money figure: Corn: World prices did not answer.') && !EMPTY_MONEY.test('About US$420 an acre'));
console.log(`printdoc: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
