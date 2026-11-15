// Crophalo's price-cards suite on the answers recorded from the World Bank and FAOSTAT lookups: each card names its source and year, a lookup that did not answer gives a plain "could not read" line and no figure, an unknown country is said, area follows the farmer's unit, and no "will appear here" is left.
// RULE: never loosen a check to make it pass. No network. Run: node scripts/test_prices_cards.mjs
import fs from 'node:fs';
import { priceCards, priceBody, paidBody, grownBody, PESTS_WORDS, DOWN } from '../js/prices-cards.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const rec = n => JSON.parse(fs.readFileSync(new URL(`./fixtures/live/${n}/recording.json`, import.meta.url), 'utf8')).answer;
const PRICES = rec('prices-live'), FAO = rec('faostat-live');
const text = h => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');

const price = text(priceBody(PRICES, ['corn', 'soy']));
check('the world price card gives each crop its newest month, the year-ago month and the change, in US dollars a tonne', /Corn: US\$227 per tonne in October 2026, up 14 in 100 from October 2025 \(US\$198\)/.test(price) && /Soybeans: US\$/.test(price), price);
check('it names its source and says these are world prices, not the buyer\'s', /World Bank Pink Sheet, newest month October 2026/.test(price) && /not your buyer's price: ask your buyer for your own/.test(price));
check('a crop with no series says so, never a made-up number', /Cassava: no world price series for this crop/.test(text(priceBody(PRICES, ['cassava']))));
const paid = text(paidBody(FAO, 'CA', ['corn', 'wheat', 'tea']));
check('the farm-gate card gives what farmers in Canada were paid with the year, and says it is national and not today\'s', /Corn: US\$167 a tonne in 2024/.test(paid) && /Winter wheat: US\$228 a tonne in 2024/.test(paid) && /Tea: no farm-gate price reported/.test(paid) && /FAOSTAT Producer Prices, Canada/.test(paid) && /Not your field's, and not today's/.test(paid), paid);
const grown = text(grownBody(FAO, 'CA', {}));
check('the "what farmers grow" card lists the five crops with the most land, in hectares, with the years of the average', /Winter wheat: 10\.5 million ha/.test(grown) && /Canola: 8\.8 million ha/.test(grown) && (grown.match(/million/g) ?? []).length === 5 && /2022, 2023, 2024/.test(grown) && /The whole country, not your area/.test(grown), grown);
check('a US-unit farmer sees acres', /Winter wheat: 25.9 million acres/.test(text(grownBody(FAO, 'CA', { area: 'imperial' }))));
const down = { ok: false, reason: 'The world price lookup did not answer, so no money figure is shown.' };
check('a lookup that did not answer gives a plain "could not read" line and no figure, on every card', [priceBody(down, ['corn']), paidBody(down, 'CA', ['corn']), grownBody(down, 'CA')].every(h => /Could not be read\./.test(h) && !/US\$\d|million/.test(h)) && /did not answer/.test(priceBody({ ok: false }, ['corn'])) && priceBody({ ok: false }, ['corn']).includes(DOWN.slice(0, 20)));
check('a lookup not asked yet says it is reading, as a polite status', /role="status"/.test(priceBody(undefined, ['corn'])) && /Reading this/.test(grownBody(undefined, 'CA')));
check('an unknown country, or none, says so and shows no figure', /not known/.test(text(paidBody(FAO, '', ['corn']))) && /no crop figures for the country with code ZZ/.test(text(paidBody(FAO, 'ZZ', ['corn']))) && /not known/.test(text(grownBody(FAO, '', {}))));
const cards = priceCards({ prices: PRICES, faostat: FAO, country: 'ca', crops: ['corn', 'soy', 'corn', 'wheat'], units: {} });
same('four cards in order, each with its source key', cards.map(c => [c.id, c.keys.join()]), [['prices', 'worldbank'], ['paid', 'fao'], ['grown', 'fao'], ['pests', 'gbif']]);
check('the titles name the country from the answer', cards[1].title === 'What farmers in Canada were paid' && cards[2].title === 'What farmers in Canada grow' && priceCards({}).every(c => c.title.length > 8) && priceCards({})[1].title === 'What farmers in your country were paid');
check('the pests card says pest records are not read yet and nothing else', text(cards[3].body).includes(PESTS_WORDS) && /Not read yet/.test(cards[3].body) && !/sighting|reported nearby:/.test(text(cards[3].body)));
check('no "will appear here" anywhere, and no banned money word', !cards.some(c => /will appear here/.test(c.body)) && !/\b(income|earn|profit|revenue|forecast|guarantee|promise|expected)\w*/i.test(cards.map(c => text(c.body)).join(' ')));
check('words from the answers are plain text', !/<img|<script/.test(priceBody({ ok: true, series: { corn: { name: 'x', unit_words: '<img src=x>', latest: { month: '2026-10', value: 100 } } } }, ['corn'])));
console.log(`prices_cards: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
