// Crophalo's "What this field grew" suite on the crop-map answers recorded from the live services on 15 November 2026 (Mead, Nebraska and Oxford County, Ontario): the turn in one plain sentence, the button that fills the step with the same crops
// in the same cycle, at most four sentences, the map's name and square size under "Show more" with one source link, nothing for a demo field or a country with no crop map by year, no "not read yet", and the ask (once, for US and CA only). No network.
// RULE: never loosen a check to make it pass. Run: node scripts/test_fieldyears.mjs
import fs from 'node:fs';
import { sameRotation, fieldYearsModel, fieldYearsHTML, rotationFor, slotsOf, roleWords, loadFieldYears, forgetFieldYears, countryOk, WORDS } from '../js/fieldyears.js';
import { turnOf } from '../js/grew.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const rec = n => { const d = JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8')); return d.answer ?? d; };
const MEAD = rec('crophist-mead.json'), OXFORD = rec('crophist-oxford.json');
const text = h => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const sentences = t => (t.replace(/\b(\d+)\.(\d+)/g, '$1$2').match(/[.!?](\s|$)/g) ?? []).length;

const m = fieldYearsModel({ state: 'ok', answer: MEAD, country: 'US' }), html = fieldYearsHTML(m), t = text(html);
check('Mead: the turn is corn and soybeans, found by the rule My farm uses', turnOf(MEAD).L === 2 && turnOf(MEAD).since === 2008, brief(turnOf(MEAD)));
check('the first sentence says what the map shows, in plain words, with the year it goes back to', /^This field on the crop map The crop map shows corn and soybeans in turn on this field since 2008\./.test(t), t.slice(0, 160));
check('at most four sentences are in sight, and the second is "It can be wrong for one field."', sentences(t.split('Show more')[0]) <= 4 && /It can be wrong for one field\./.test(t));
check('the button is "Use this rotation", and the years, the map and the square size are under "Show more", closed, with one source link', />Use this rotation</.test(html) && /<details class="fold-card" id="foldFieldYears">/.test(html) && !/id="foldFieldYears" open/.test(html) && /2008 to 2025/.test(t) && /USDA crop map, 30 m squares/.test(t) && (html.match(/<a /g) ?? []).length === 1 && /nass\.usda\.gov/.test(html));
same('"Use this rotation" gives the ready rotation with the same crops (corn, then soybeans)', rotationFor(turnOf(MEAD)), { preset: 'corn-soy', custom: [] });
const used = fieldYearsModel({ state: 'ok', answer: MEAD, country: 'US', used: true }), usedHtml = fieldYearsHTML(used);
check('after the tap it says what was set and the button is gone', /^This field on the crop map Your crops are set to corn then soybeans\. Change them below if you like\./.test(text(usedHtml)) && !/useFieldYears/.test(usedHtml), text(usedHtml).slice(0, 160));
const o = fieldYearsModel({ state: 'ok', answer: OXFORD, country: 'CA' });
check('Oxford (Canada): the crop map is the Canadian one, with its own link', /Agriculture and Agri-Food Canada crop map, 30 m squares, 2011 to 2025/.test(text(fieldYearsHTML(o))) && /open\.canada\.ca/.test(fieldYearsHTML(o)));
// a turn with no ready rotation: the crops go in as a custom rotation, in the order they will be sown
const three = rotationFor({ crops: ['wheat', 'corn', 'soy'], L: 3 });
check('three crops with no ready rotation of that cycle become a custom rotation of those crops (the next crop first), never more than four years', three.preset === 'custom' || slotsOf(three).length === 3, brief(three));
check('a custom rotation is said "corn then soybeans" for the polite line', roleWords({ preset: 'corn-soy', custom: [] }) === 'corn then soybeans', roleWords({ preset: 'corn-soy', custom: [] }));
// no clear turn
const messy = { ...MEAD, field: MEAD.field.map((f, i) => (i % 3 === 0 ? { ...f, crop: 'wheat' } : i % 3 === 1 ? { ...f, crop: 'oats' } : { ...f, crop: null })) };
const none = fieldYearsModel({ state: 'ok', answer: messy, country: 'US' });
check('no clear turn: the last three years in words, "Choose your crops below.", and no button', /^The crop map shows: 2025 \w+/.test(none.lines[0]) && /Choose your crops below\.$/.test(none.lines[0]) && !/useFieldYears/.test(fieldYearsHTML(none)), none.lines[0]);
// the other states
check('reading: one loading line, as a polite status', /Reading this field’s crop map, year by year…/.test(fieldYearsHTML(fieldYearsModel({ state: 'reading', country: 'US' }))) && /role="status"/.test(fieldYearsHTML(fieldYearsModel({ state: 'reading', country: 'US' }))));
check('no answer: one plain sentence, never "not read yet"', fieldYearsModel({ state: 'down', answer: { ok: false }, country: 'US' }).lines[0] === WORDS.down && /did not answer/.test(WORDS.down));
check('too small a field says so', /too small/.test(fieldYearsModel({ state: 'down', answer: { ok: false, reason: 'The field is too small to read by year' }, country: 'CA' }).lines[0]));
const filled = fieldYearsModel({ state: 'ok', answer: MEAD, country: 'US', filled: { preset: 'corn-soy', custom: [] } }), differs = fieldYearsModel({ state: 'ok', answer: MEAD, country: 'US', filled: { preset: 'corn-soy-wheat', custom: [] } });
check('a demo whose filled-in rotation equals the map says "It matches the rotation filled in." and shows no button; a different one keeps the button', filled.lines.includes('It matches the rotation filled in.') && filled.rotation === null && !/useFieldYears/.test(fieldYearsHTML(filled)) && !!differs.rotation && /useFieldYears/.test(fieldYearsHTML(differs)) && /on this field since 2008/.test(filled.lines[0]), brief(filled.lines));
check('a custom rotation with the same crops counts as the same', sameRotation({ preset: 'custom', custom: ['soy', 'corn'] }, { preset: 'corn-soy', custom: [] }) && !sameRotation({ preset: 'corn-soy', custom: [] }, { preset: 'corn-soy-wheat', custom: [] }));
check('nothing is shown for a country with no crop map by year', fieldYearsModel({ state: 'ok', answer: MEAD, country: 'TR' }) === null && fieldYearsHTML(null) === '' && !countryOk('') && countryOk('us') && countryOk('CA'));
check('no card says "not read yet" or "fields" or "farms" about a count of map points', ![html, usedHtml, fieldYearsHTML(none)].some(h => /not read yet|\bfarms?\b/i.test(text(h))));
// the ask
forgetFieldYears(); let calls = 0, url = '';
const fetchFn = async u => { calls++; url = u; return { json: async () => MEAD }; };
const a1 = await loadFieldYears({ lat: 41.1795, lon: -96.4398, country: 'US', fetchFn }), a2 = await loadFieldYears({ lat: 41.1795, lon: -96.4398, country: 'US', fetchFn });
check('the ask is made once for one place, with near=0 and the country, to the server\'s own route', calls === 1 && a1.ok && a2.ok && /^\/api\/crophist\?/.test(url) && /near=0/.test(url) && /country=US/.test(url) && /lat=41\.1795/.test(url), url);
check('a drawn outline goes as lon,lat corners with four decimals', await (async () => { forgetFieldYears(); await loadFieldYears({ lat: 1, lon: 2, country: 'CA', ring: [[41.1, -96.4], [41.2, -96.4], [41.2, -96.3]], fetchFn }); return /ring=-96\.4000%2C41\.1000%3B/.test(url); })(), url);
check('a country outside Canada and the United States is never asked', await (async () => { const before = calls; const r = await loadFieldYears({ lat: 1, lon: 2, country: 'TR', fetchFn }); return r.ok === false && calls === before; })());
check('a failed ask is not kept: the next ask tries again', await (async () => { forgetFieldYears(); let n = 0; const bad = async () => { n++; throw new Error('x'); }; await loadFieldYears({ lat: 5, lon: 5, country: 'US', fetchFn: bad }); await loadFieldYears({ lat: 5, lon: 5, country: 'US', fetchFn: bad }); return n === 2; })());
console.log(`fieldyears: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
