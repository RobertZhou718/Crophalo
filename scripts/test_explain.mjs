// Crophalo's suite for the Data page's "How to read Crophalo" folds: every word and fold, no banned or promising word, a source on every statement, the station figures against the accuracy run's own files, the square-size pictures to scale, the crop lists from the crop table, plain-text escaping.
// RULE: never loosen a check here to make it pass. A failure means a farmer reads a figure that is not ours, a promise, or a claim with no source: fix the words, not the test.
// No internet is needed. Run: node scripts/test_explain.mjs   (CROPHALO_QA=<folder> names where QA-ONTARIO-1000.md and the frost fixes file are, when they are not beside the project)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as W from '../js/words.explain.js';
import { explainHTML, panelSVG, footprintTable, metresOf, againstField, roleCrops, wordButton, wordCardHTML, refOf, sourcesLine, DEMO_LAT } from '../js/explain.js';
import { CROPS, cropName } from '../js/crops.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const text = html => html.replace(/<(title|desc)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
const strings = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (typeof v === 'function') out.push(String(v(W.FROST_CHECK))); else if (v && typeof v === 'object') Object.values(v).forEach(x => strings(x, out)); return out; };

const FIXED = explainHTML({ frostFixed: true }), NOT_YET = explainHTML({ frostFixed: false }), ALL = text(FIXED) + ' ' + text(NOT_YET);

// ---- the folds and the reminder
for (const id of ['words', 'ground', 'grid', 'decide', 'crops']) {
  check(`fold ${id}: a closed fold with a summary`, new RegExp(`<details class="fold ex-fold" id="ex-${id}"><summary>`).test(FIXED));
  { const open = FIXED.slice(FIXED.indexOf(`id="ex-${id}"`)), lead = /<p class="ex-lead">([^<]*)<\/p>/.exec(open)?.[1] ?? '', sight = open.split('<details class="ex-more"')[0];
    check(`fold ${id}: opens on its short lead (at most four sentences, none longer than 45 words) and ONE source link; the rest is under a closed "Show more"; no Listen button`, !!lead && (lead.match(/[.!?](\s|$)/g) ?? []).length <= 4 && lead.split(/(?<=[.!?])\s+/).every(t => t.split(/\s+/).length <= 45) && (sight.match(/<a class="link"/g) ?? []).length === 1 && /<details class="ex-more" id="ex-[a-z]+-more"><summary>Show more<\/summary>/.test(open) && !/<details class="ex-more"[^>]*open/.test(open) && !/data-ex-say|class="listen"/.test(open), lead); }
}
check('the reminder is shown, not folded, and says where judgement matters', /<p class="ex-remind" id="exRemind">/.test(FIXED) && ['drains', 'buyers', 'machines', 'pests', 'adviser'].every(w => W.EX.remind.text.includes(w)));
check('one heading for the block, and fold headings below it', (FIXED.match(/<h2\b/g) || []).length === 1 && !/<h1\b/.test(FIXED));

// ---- (1) the words
same('the eight words', W.TERMS.map(t => t.id), ['et', 'anomaly', 'ndvi', 'frost', 'balance', 'gdd', 'rootzone', 'lst']);
for (const t of W.TERMS) {
  check(`${t.id}: two plain sentences`, t.say.length === 2 && t.say.every(s => /^[A-Z].*[.]$/.test(s)), t.say);
  check(`${t.id}: says where Crophalo uses it`, t.where.length > 40 && /Crophalo|tab|score|table/.test(t.where));
  check(`${t.id}: every source is known`, t.src.length > 0 && t.src.every(k => refOf(k)), t.src);
  check(`${t.id}: on the Data page with its own heading`, FIXED.includes(`id="ex-term-${t.id}"`));
  check(`${t.id}: its "i" names the word and opens a card`, wordButton(t.id).includes(`data-word="${t.id}"`) && wordButton(t.id).includes('aria-haspopup="dialog"') && wordCardHTML(t.id).includes('id="wordPopTitle"'));
  check(`${t.id}: the card says the same as the Data page`, t.say.every(s => text(wordCardHTML(t.id)).includes(s)));
}
for (const s of W.WORD_SPOTS) check(`word spot ${s.sel}: a known word`, !!W.TERMS.find(t => t.id === s.id));
// the spots are headings the screens really write: the ids are read from the screens' own data and markup
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const wd = read('js/weather-data.js'), wv = read('js/weather-view.js'), s1 = read('js/satellites-view.js'), s2 = read('js/satellites2-view.js');
check('weather facts write data-fact on an article with its h3 first', /data-fact="\$\{esc\(f\.id\)\}"><h3>/.test(wv) && /data-tile="\$\{esc\(t\.id\)\}"><h3>/.test(wv));
for (const id of ['frost', 'free', 'dry', 'dryyears']) check(`weather fact "${id}" exists`, wd.includes(`add('${id}'`));
for (const id of ['warm', 'soil']) check(`weather tile "${id}" exists`, wd.includes(`id: '${id}'`));
check('Satellites: smap card with its h3', s1.includes('data-card="smap"><h3>'));
check('Satellites: hls and ecostress cards with their h3', s2.includes("card('hls'") && s2.includes("card('ecostress'") && /data-card="\$\{esc\(id\)\}"><h3>/.test(s2));
same('an unknown word gets no button and no card', [wordButton('nope'), wordCardHTML('toString')], ['', '']);

// ---- banned words, promises, and sources on the agronomy lines
const WORDS = strings(W.EX).concat(strings(W.TERMS), strings(W.ROLES), strings(W.FOOTPRINTS), strings(W.PANELS));
const BANNED = [/\bA\.?I\.?\b/, new RegExp(['artif', 'icial in', 'telligence'].join(''), 'i'), /machine learning/i, /\bneural\b/i, /yapay/i, /\bSI\b/, /\bguarantee/i, /\bensures?\b/i, /\bwill (improve|increase|raise|boost|fix|stop)\b/i, /\bproven\b/i, /\balways (improve|work)/i,
  /\bnotes?\b/i, /\bmilestones?\b/i, /\bhand-?over\b/i];
for (const re of BANNED) check(`no ${re} in the words`, !WORDS.some(s => re.test(s)), WORDS.find(s => re.test(s)));
check('"trained model" is only ever said as what Crophalo does not use', [...ALL.matchAll(/trained (on many fields|model)/g)].every(m => /(not use a|models) $/.test(ALL.slice(Math.max(0, m.index - 12), m.index))), ALL.match(/.{30}trained model/g));
for (const r of W.ROLES) {
  check(`${r.id}: its line says "can" or "may" (never a promise)`, /\b(can|may)\b/.test(r.line) || /shows how much/.test(r.line), r.line);
  check(`${r.id}: a source for its line`, r.src.length && r.src.every(k => refOf(k)), r.src);
}
for (const t of W.TERMS) check(`${t.id}: sources are linked under it`, FIXED.includes(sourcesLine(t.src)));
for (const [k, r] of Object.entries(W.REFS)) check(`reference ${k}: an https address and a name`, /^https:\/\/[a-z0-9.-]+\//.test(r.url) && r.name.length > 5);
check('every outside link opens in a new tab and says so', [...FIXED.matchAll(/<a [^>]*target="_blank"[^>]*>[\s\S]*?<\/a>/g)].every(m => /rel="noopener noreferrer"/.test(m[0]) && m[0].includes('opens in a new tab')));
// no date of the project before the build began is written in these words (data ranges such as "2001 to 2025" are years, not dates)
const MONTH = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
check('no written date with a year', !new RegExp(`\\b${MONTH}\\s+(\\d{1,2},?\\s+)?\\d{4}\\b|\\d{4}-\\d{2}-\\d{2}`).test(ALL), ALL.match(new RegExp(`.{20}\\b${MONTH}\\s+(\\d{1,2},?\\s+)?\\d{4}\\b`))?.[0]);

// ---- (2) satellite and ground: the figures as written, and against the accuracy run's own files
const F = W.FROST_CHECK;
check('the measured late frost is said', text(FIXED).includes(`a middle ${F.firstBefore} days later`) && text(FIXED).includes(`${F.offBefore} of the ${F.stations} stations were more than 10 days off`));
check('with the correction: the margin, the reach, the new middle and Barrie', text(FIXED).includes(`under ${F.margin} °C`) && text(FIXED).includes(`within ${F.reachKm} km`) && text(FIXED).includes(`${F.within5After} of them (${F.within5Before} before)`) && text(FIXED).includes(`from about ${F.barrieBefore} to about ${F.barrieAfter}`) && /two weeks earlier/.test(text(FIXED)));
check('without it: the date is read as late, never as corrected', !text(NOT_YET).includes(`under ${F.margin} °C`) && text(NOT_YET).includes(`about ${F.firstBefore} days earlier`));
check('the soil test and the rain gauge are both explained', /I have a soil test/.test(FIXED) && text(FIXED).includes(`more than ${F.rainTolerance} %`));
const qaDirs = [process.env.CROPHALO_QA, path.join(ROOT, '..', '..', '..'), path.join(ROOT, '..', 'crophalo-work-backup')].filter(Boolean);
const qaDir = qaDirs.find(d => fs.existsSync(path.join(d, 'QA-ONTARIO-1000.md')));
if (!qaDir) console.log('explain: the accuracy run\'s files were not found (CROPHALO_QA names their folder); the figures were checked against the words only');
else {
  const qa = fs.readFileSync(path.join(qaDir, 'QA-ONTARIO-1000.md'), 'utf8'), fixFile = path.join(qaDir, 'staging', 'qa-engine-fixes', 'FIXES.md'), fx = fs.existsSync(fixFile) ? fs.readFileSync(fixFile, 'utf8') : '';
  check('QA: 35 stations, 2001 to 2025', qa.includes(`Tested against ${F.stations} ECCC stations with a daily record for 2001 to 2025`));
  check('QA: first autumn frost median +11 days, 19 of 35 off by more than 10', qa.includes(`First autumn frost: median +${F.firstBefore} days`) && qa.includes(`${F.offBefore} of ${F.stations} stations are off by more than 10 days`));
  check('QA: spring frost, temperature and rain agree as written', qa.includes(`The last spring frost agrees (median ${F.lastSpring} days), temperature agrees (median +${F.temp} °C), rain agrees (median +${F.rain} %)`));
  check('QA: the rain tolerance', qa.includes(`yearly rain ±${F.rainTolerance} %`));
  check('fixes: the file is there', fx.length > 0, fixFile);
  check('fixes: middle difference before and after', fx.includes(`| First autumn frost, NASA minus station, middle of ${F.stations} | +${F.firstBefore} days | −${Math.abs(F.firstAfter)} day |`));
  check('fixes: stations more than 10 days off, and within 5 days', fx.includes(`| Stations more than 10 days off | ${F.offBefore} | ${F.offAfter} |`) && fx.includes(`| Stations within 5 days | ${F.within5Before} | ${F.within5After} |`));
  check('fixes: Barrie before and after', fx.includes(`| Barrie: first autumn frost; frost-free season | ${F.barrieBefore};`) && fx.includes(`| ${F.barrieAfter};`));
  check('fixes: the 2.5 °C night and the 300 km reach', fx.includes(`within ${F.reachKm} km of one of the ${F.stations} stations`) && fx.includes(`a night under ${F.margin} °C counts for the first autumn frost`));
}

// ---- (3) the square sizes, to scale
const power = metresOf(W.FOOTPRINTS.find(f => f.id === 'power'), DEMO_LAT);
check('NASA POWER at Barrie: about 50 km by 55 km', Math.abs(power.w / 1e3 - 49.7) < 0.3 && Math.abs(power.h / 1e3 - 55.3) < 0.3, power);
check('NASA POWER on the equator is wider', metresOf(W.FOOTPRINTS.find(f => f.id === 'power'), 0).w > 69e3);
for (const p of W.PANELS) {
  const svg = panelSVG(p), k = 200 / p.across;
  check(`${p.id}: a picture with a title and a description`, /role="img" aria-labelledby="[^"]+-t [^"]+-d"/.test(svg) && svg.includes(`<title id="${p.id}-t">`) && svg.includes(`<desc id="${p.id}-d">`));
  const rects = [...svg.matchAll(/<rect x="[^"]+" y="[^"]+" width="([\d.]+)" height="([\d.]+)" class="ex-(cell|field|next)"\/>/g)].map(m => [+m[1], +m[2]]);
  const want = p.show.map(id => id === 'field' ? [Math.sqrt(W.EXAMPLE_FIELD_HA * 1e4), Math.sqrt(W.EXAMPLE_FIELD_HA * 1e4)] : [metresOf(W.FOOTPRINTS.find(f => f.id === id)).w, metresOf(W.FOOTPRINTS.find(f => f.id === id)).h]);
  const nextP = W.PANELS[W.PANELS.indexOf(p) + 1]; if (nextP) want.push([nextP.across, nextP.across]);
  check(`${p.id}: every square is drawn to scale (within 0.1 px)`, want.every(([w, h]) => rects.some(([rw, rh]) => Math.abs(rw - Math.max(1, w * k)) < 0.1 && Math.abs(rh - Math.max(1, h * k)) < 0.1)) && rects.length === want.length, { rects, want: want.map(([w, h]) => [w * k, h * k]) });
  check(`${p.id}: nothing is drawn outside its frame`, rects.every(([w, h]) => w <= 200.1 && h <= 200.1));
  check(`${p.id}: the description names each square`, p.show.every(id => id === 'field' || svg.includes(W.FOOTPRINTS.find(f => f.id === id).short)));
}
const table = footprintTable();
check('the table has a row for each square and the field', (table.match(/<tr><th scope="row">/g) || []).length === W.FOOTPRINTS.length + 1 && W.FOOTPRINTS.every(f => table.includes(f.name.replace(/&/g, '&amp;'))));
check('the table says how each one is brought to the field', W.FOOTPRINTS.every(f => f.how.length > 20 && table.includes(f.how.replace(/’/g, '’'))));
same('a 40 ha field against SMAP and HLS', [againstField(W.FOOTPRINTS.find(f => f.id === 'smap')), againstField(W.FOOTPRINTS.find(f => f.id === 'dot30'))], ['One square holds about 200 fields of this size', 'About 21 of its squares across the field']);
check('the sizes asked for are all there', ['300 km', '50 km', '10 km', '9 km', '250 m', '1 km', '70 m', '30 m'].every(s => W.FOOTPRINTS.some(f => f.size.includes(s))));
check('a regional value is never a pattern inside the field', /never drawn as a pattern inside your field/.test(text(FIXED)));

// ---- (4) how Crophalo decides
check('the five parts with what moves each', ['water', 'soil', 'erosion', 'income', 'weather'].every(id => W.EX.decide.parts[id].startsWith('Moves with')) && (FIXED.match(/<dt>/g) || []).length === 5);
check('the three sureness levels', ['Very sure', 'Fairly sure', 'Somewhat sure'].every(l => text(FIXED).includes(l)));
check('says it uses rules and counts, not a trained model', text(FIXED).includes('does not use a trained model') && /medians and counts/.test(text(FIXED)));
check('the places where local knowledge decides', ['drains', 'buyers', 'planter', 'Pests'].every(w => W.EX.decide.local.join(' ').includes(w)));

// ---- (5) crops and the soil: lists from the crop table
const by = (keep) => Object.keys(CROPS).filter(k => CROPS[k].type !== 'fallow' && keep(CROPS[k])).map(k => cropName(k, true)).sort((a, b) => a.localeCompare(b));
same('nitrogen-fixing crops are the table\'s', roleCrops('nfix'), by(c => c.nfix > 0));
same('cover crops are the table\'s', roleCrops('cover'), by(c => c.type === 'cover'));
same('deep-rooting crops are the table\'s', roleCrops('deep'), by(c => c.root >= 1.5));
same('drought-tolerant crops are the table\'s', roleCrops('drought'), by(c => c.drought >= 0.65));
check('each list is on the page and not empty', ['nfix', 'cover', 'deep', 'drought'].every(id => roleCrops(id).length >= 3 && text(FIXED).includes(roleCrops(id).join(', '))));
check('alfalfa fixes nitrogen and roots deep; rye cover is a cover crop', roleCrops('nfix').includes('Alfalfa hay') && roleCrops('deep').includes('Alfalfa hay') && roleCrops('cover').includes('Cereal rye cover'));

// ---- escaping
const odd = { a: { name: '<b>x</b>', type: 'cover', nfix: 1, root: 2, drought: 1 } };
same('names from a table are plain text where they are listed', roleCrops('cover', odd), ['<b>x</b>']);
check('nothing in the block can run', !/<script|on[a-z]+=/i.test(FIXED));
check('a word card escapes its text', !/<b>x/.test(wordCardHTML('ndvi')));

console.log(`explain: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
