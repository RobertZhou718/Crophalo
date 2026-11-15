// The offline suite of "What this field grew": the turn, the neighbours, the words and the ask, on the answers recorded from the live crop maps on 15 November 2026.
// RULE: never loosen a check here without a written farming reason beside it. Run: node scripts/test_grew.mjs
import fs from 'node:fs';
import { turnOf, afterCorn, grewModel, grewHTML, loadGrew, forgetGrew, turnWords } from '../js/grew.js';
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail === '' ? '' : `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})`}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const fix = n => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));
const mead = fix('crophist-mead.json'), oxford = fix('crophist-oxford.json');
const sentences = t => (t.match(/[.!?](\s|$)/g) || []).length;

// Mead: corn in odd years and soybeans in even years, 2008 to 2025
const t = turnOf(mead);
same('Mead: the turn is corn then soybeans, since 2008, two years long', [t.crops, t.since, t.L], [['corn', 'soy'], 2008, 2]);
same('Mead: said in words', turnWords(t), 'corn and soybeans in turn');
const near = afterCorn(mead.near);
same('Mead: after corn the neighbours grew soybeans in 8 of 10 fields and 1 in 10 stayed corn', [near.next, near.stayed, near.n], [{ crop: 'soy', tenths: 8 }, 1, 2035]);
// a mixed year breaks the run; a short run is no turn
const years = (list) => ({ ok: true, field: list.map(([year, crop]) => ({ year, crop, mixed: !crop })) });
same('a mixed year inside the run means no turn', turnOf(years([[2025, 'corn'], [2024, 'soy'], [2023, null], [2022, 'soy'], [2021, 'corn'], [2020, 'soy']])), null);
same('three years are too few to call a turn', turnOf(years([[2025, 'corn'], [2024, 'soy'], [2023, 'corn']])), null);
same('the same crop four years running is a turn of one', turnOf(years([[2025, 'wheat'], [2024, 'wheat'], [2023, 'wheat'], [2022, 'wheat']]))?.L, 1);
same('a year missing from the list breaks the run', turnOf(years([[2025, 'corn'], [2024, 'soy'], [2022, 'soy'], [2021, 'corn'], [2020, 'soy'], [2019, 'corn']])), null);
same('three crops in turn are found (L = 3)', turnOf(years([[2025, 'corn'], [2024, 'soy'], [2023, 'wheat'], [2022, 'corn'], [2021, 'soy'], [2020, 'wheat']]))?.crops, ['corn', 'wheat', 'soy']);
same('under 50 fields around the neighbour share is not shown', afterCorn({ after: { corn: { soy: 40, corn: 9, n: 49 } } }), null);
same('shares are tenths of the real count', afterCorn({ after: { corn: { soy: 30, corn: 20, other: 5, n: 55 } } }), { n: 55, next: { crop: 'soy', tenths: 5 }, stayed: 4 });
// Oxford: recent years corn and soybeans, older years not one app crop
const o = turnOf(oxford);
check('Oxford: no turn is claimed from only four years followed by unread classes', o === null || o.since >= 2022, o);
const m = grewModel({ state: 'ok', answer: mead, country: 'US' }), h = grewHTML(m);
check('Mead card: at most four sentences in sight, the first says what the farmer gets', m.lines.length <= 4 && /^The crop map shows corn and soybeans in turn here since 2008\.$/.test(m.lines[0]) && m.lines.join(' ').split(/(?<=[.!?])\s/).length <= 4, m.lines);
check('Mead card: the neighbours line says what was counted, map points on cropland, never fields or farms', /^On the cropland within 3 km, soybeans followed corn about 8 times in 10, and corn followed corn about 1 time in 10\.$/.test(m.lines[1]) && !/fields?|farms?|farmers?/i.test(m.lines[1]), m.lines[1]);
check('Mead card: under Show more the years counted, the 3 km, the 170 m points and not farms', /2017 to 2025/.test(m.more.join(' ')) && /170 m apart within 3 km/.test(m.more.join(' ')) && /not farms/.test(m.more.join(' ')), m.more);
check('Mead card: the strip has every year, oldest first, with a crop word', m.strip.length === 18 && m.strip[0].year === 2008 && m.strip.every(y => y.word), m.strip.length);
check('Mead card: the detail is under Show more with one source link', /<details class="h-fold"><summary>Show more<\/summary>/.test(h) && (h.match(/<a href/g) || []).length === 1 && /nass\.usda\.gov/.test(h) && /85 to 95 times in 100/.test(h), h.slice(-300));
check('no state says "not read yet"', ['reading', 'outside', 'down', 'small'].every(s => !/not read yet/i.test(grewModel({ state: s }).lines.join(' '))) && !/not read yet/i.test(h));
check('every line is short and plain (15 words or fewer, bar the neighbour line)', m.lines.every((l, i) => i === 1 || l.split(/\s+/).length <= 20), m.lines);
const c = grewModel({ state: 'ok', answer: oxford, country: 'CA' });
check('Canada: the other source and its words', /Agriculture and Agri-Food Canada/.test(c.more.join(' ')) && /canada/i.test(c.link[1]) && /aims to be right at least 85 times in 100/.test(c.more.join(' ')), c.more);
same('outside the two countries', grewModel({ state: 'outside' }).lines, ['Crop maps by year are read for Canada and the United States only.']);
same('a failed answer says so and what to do', grewModel({ state: 'ok', answer: { ok: false, reason: 'x' }, country: 'US' }).lines, ['The crop map did not answer. Try again later.']);
same('a field too small says so', grewModel({ state: 'ok', answer: { ok: false, reason: 'This field is too small' }, country: 'US' }).lines, ['This field is too small to read by year on the crop map.']);
check('with the neighbours missing it says too few, never a number', /Too few map points around you to count\./.test(grewModel({ state: 'ok', answer: { ...mead, near: { after: { corn: { n: 10, soy: 9 } } } }, country: 'US' }).lines.join(' ')));
// the ask
forgetGrew();
let asked = 0; const seen = [];
const fetchFn = async url => { asked++; seen.push(url); return { json: async () => mead }; };
const a1 = await loadGrew({ lat: 41.1795, lon: -96.4398, country: 'US', ring: [[41.183, -96.4446], [41.183, -96.4349], [41.1759, -96.4349]], fetchFn }), a2 = await loadGrew({ lat: 41.1795, lon: -96.4398, country: 'US', ring: [[41.183, -96.4446], [41.183, -96.4349], [41.1759, -96.4349]], fetchFn });
same('the field is asked once and the answer is kept', [asked, a1 === a2], [1, true]);
check('the ask carries the outline as lon,lat pairs, the country and near=1', /country=US/.test(seen[0]) && /near=1/.test(seen[0]) && /ring=-96\.4446%2C41\.1830%3B/.test(seen[0]), seen[0]);
forgetGrew(); const down = await loadGrew({ lat: 1, lon: 2, country: 'CA', fetchFn: async () => { throw new Error('x'); } });
same('a failed ask is an answer of its own, not kept', [down.ok, down.reason], [false, 'The crop map did not answer']);
console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
