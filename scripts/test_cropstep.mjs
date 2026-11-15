// Crophalo's crop-step suite: what is suggested from the crop map's answer (its shape as documented in js/nearby.js, with made-up shares that only exercise the rules), the four cards, each phase (demo, loading, suggestion, cannot read), the Ontario list switch,
// the folded groups, and the sentences. RULE: never loosen a check to make it pass. No network. Run: node scripts/test_cropstep.mjs
import { GARDENS } from '../js/crops.js';
import { rankPresets, stepPlan, moreGroups, thenWords, repeatWords, rotationLine, previewWords, listedRotation, listedFilter, inOntario, sourceLine, FIXED_SET, ONTARIO_LISTED, OFFER_ONLY_LISTED, WORDS } from '../js/cropstep.js';
import { PRESETS } from '../js/crops.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

const crop = (id, share, farm = 100000) => ({ crop: id, share, ha: Math.round(share * farm) });
const ANSWER = { ok: true, source: 'aci', year: 2025, country: 'CA', box: { north: 43.18, south: 43.08, west: -80.82, east: -80.68 }, cropland_ha: 100000, crops: [crop('corn', 0.33), crop('soy', 0.31), crop('wheat', 0.1), crop('oats', 0.02), crop('barley', 0.04), crop('canola', 0.005)], wider: [], classes: [] };
const r = rankPresets(ANSWER);
check('a crop map that shows corn, soybeans and wheat reads', r.read && r.year === '2025' && r.source === 'Agriculture and Agri-Food Canada crop map' && r.farmHa === 100000);
same('corn then soybeans leads: the middle of its crops\' shares beats a longer rotation that adds a smaller crop', r.ranked.slice(0, 3).map(x => x.id), ['corn-soy', 'corn-soy-wheat', 'wheat-barley']);
check('a rotation needs every crop at 3 in 100 or more: oats, canola and fallow rotations are not ranked', !r.ranked.some(x => PRESETS[x.id].slots.includes('canola') || PRESETS[x.id].slots.includes('fallow')));
check('a one-crop rotation is never suggested', !r.ranked.some(x => PRESETS[x.id].slots.length < 2));
check('the radius is from the box, rounded to 5 km', r.km === 5 || r.km === 10, String(r.km));
same('a failed answer, no answer, a country with no map, too little farmland: each says why', [rankPresets(null).reason, rankPresets({ ok: false }).reason, rankPresets({ ...ANSWER, country: 'FR' }).reason, rankPresets({ ...ANSWER, cropland_ha: 500 }).reason], ['noMap', 'noMap', 'noCountry', 'tooLittle']);
same('a map with no crop that makes a rotation says so', rankPresets({ ...ANSWER, crops: [crop('rye', 0.4), crop('flax', 0.3)] }).reason, 'noneFit');
check('the US map is named for the US', rankPresets({ ...ANSWER, country: 'US' }).source === 'USDA Cropland Data Layer');

// the phases
const read = stepPlan({ crop: { status: 'read', answer: ANSWER } });
check('suggestion: the best rotation is suggested, titled, with its line and its source in plain words', read.phase === 'suggest' && read.suggested.id === 'corn-soy' && read.suggested.title === 'Suggested for your field' && read.suggested.line === 'Corn, then soybeans, repeats every 2 years' && /^Most farmland within \d+ km: corn and soybeans \(Agriculture and Agri-Food Canada crop map, 2025\)\.$/.test(read.suggested.source), brief(read.suggested));
check('suggestion: it says the map shows crops, not their order', /not the order they follow/.test(read.suggested.note));
same('suggestion: the cards are the next most grown rotations the map has checked, never the suggestion, never a crop the map does not see (canola is under 1 in 100 here)', read.cards, ['corn-soy-wheat', 'wheat-barley']);
same('loading: a calm placeholder, no suggestion, the fixed set meanwhile', [stepPlan({ crop: { status: 'loading' } }).phase, stepPlan({ crop: { status: 'loading' } }).suggested, stepPlan({ crop: { status: 'idle' } }).cards], ['loading', null, [...FIXED_SET]]);
check('loading: the words are not "have not been read"', stepPlan({ crop: { status: 'loading' } }).message === 'Looking for what grows near you…' && !/not been read/.test(JSON.stringify(WORDS)));
const failedPlan = stepPlan({ crop: { status: 'failed' } });
same('cannot read: the line, no suggested card', [failedPlan.phase, failedPlan.message, failedPlan.suggested], ['nomap', 'We couldn’t check what farmers grow here. Pick what you grow below.', null]);
const ont = stepPlan({ crop: { status: 'failed' }, ontario: true });
check('cannot read in Ontario: only Statistics Canada\'s Ontario crops are offered, with the source named', ont.restrict?.source === 'Statistics Canada, field crops grown in Ontario' && /^Only crops from Statistics Canada, field crops grown in Ontario are shown\.$/.test(ont.restrict.note) && ont.cards.every(id => listedRotation(id)), brief(ont.restrict));
check('cannot read outside Ontario: nothing is restricted and nothing is suggested', stepPlan({ crop: { status: 'failed' }, ontario: false }).restrict === null);
check('a map that read keeps every crop offered (the map has checked)', stepPlan({ crop: { status: 'read', answer: ANSWER }, ontario: true }).restrict === null);
const demo = stepPlan({ crop: { status: 'idle' }, demo: 'corn-soy' });
check('demo: its rotation is the suggested card, labelled as the demo\'s, no crop-map claim', demo.phase === 'demo' && demo.suggested.id === 'corn-soy' && demo.suggested.title === 'The demo field’s rotation' && demo.suggested.source === 'Set for the demo; your field gets its own.' && !demo.cards.includes('corn-soy'));

// the Ontario list
check('the list is the crops the owner named', ['corn', 'soy', 'wheat', 'swheat', 'oats', 'barley', 'canola', 'bean', 'pea', 'alfalfa', 'potato'].every(id => ONTARIO_LISTED.includes(id)) && OFFER_ONLY_LISTED.on === true);
check('a rotation is listed only when every crop in it is; a fallow year does not matter', listedRotation('corn-soy') && listedRotation('wheat-fallow') && !listedRotation('cotton-wheat') && !listedRotation('rice-rice') && !listedRotation('custom'));
same('listedFilter keeps listed rotations only, and does nothing without a restriction', [listedFilter(['corn-soy', 'cotton-wheat'], { crops: ONTARIO_LISTED }), listedFilter(['corn-soy', 'cotton-wheat'], null)], [['corn-soy'], ['corn-soy', 'cotton-wheat']]);
check('Ontario is a box round the province', inOntario(43.13, -80.75) && inOntario(44.4, -79.7) && !inOntario(51.05, -114.07) && !inOntario(40.7, -74.0) && !inOntario(NaN, 1));

// a list that comes from data (the United States: the USDA crop map's crops for the state) wins, and its source is named
const usList = { crops: ['corn', 'soy', 'wheat', 'alfalfa'], source: 'the USDA Cropland Data Layer, crops shown for Nebraska' };
const us = stepPlan({ crop: { status: 'failed' }, ontario: false, listed: usList });
check('a list from data restricts the offer and names its source on screen', us.restrict?.source === usList.source && /^Only crops from the USDA Cropland Data Layer, crops shown for Nebraska are shown\.$/.test(us.restrict.note) && us.cards.every(id => listedRotation(id, usList.crops)), brief(us.restrict));
check('without a list from data the United States is not restricted (nothing is made up)', stepPlan({ crop: { status: 'failed' }, ontario: false, listed: null }).restrict === null);
// folded groups
const more = moreGroups(['corn-soy', 'corn-soy-wheat']);
check('more rotations: grains and beans without the cards shown, trees and bushes, and a pointer for vegetables', more[0].title === 'Grains and beans' && !more[0].presets.includes('corn-soy') && more[0].presets.includes('wheat-wheat') && more[1].title === 'Trees, vines and bushes' && more[1].gardens.length > 10 && more[2].id === 'veg' && /Build my own/.test(more[2].note));
check('more rotations in the Ontario list: no trees, only listed rotations', (() => { const g = moreGroups([], { crops: ONTARIO_LISTED }); return g.length === 1 && g[0].presets.every(id => listedRotation(id)) && !g[0].presets.includes('rice-rice'); })());
check('every ready rotation is reachable: on a card, or in the folded grains (nothing is lost)', (() => { const all = new Set([read.suggested.id, ...read.cards, ...moreGroups([read.suggested.id, ...read.cards])[0].presets]); return Object.keys(PRESETS).every(id => id === 'custom' || all.has(id)); })());

// words
same('words: then and repeats', [thenWords(['corn', 'soy', 'wheat']), repeatWords(1), repeatWords(3), rotationLine(['corn']), rotationLine(['corn', 'soy'])], ['Corn, then soybeans, then winter wheat', 'the same crop every year', 'repeats every 3 years', 'Corn, the same crop every year', 'Corn, then soybeans, repeats every 2 years']);
same('the live preview of Build my own', [previewWords(['corn', 'soy', 'wheat']), previewWords(['corn']), previewWords([]), previewWords(['corn', '', 'soy'])], ['Corn, then soybeans, then winter wheat, repeats every 3 years', 'Corn, the same crop every year', 'Choose a crop for year 1 to see your rotation.', 'Corn, then soybeans, repeats every 2 years']);
const BANNED = /\b(chance|probab|likely|guarantee|profit|income|earn|revenue|forecast|promise|expected|best|should|must)\b/i;
check('no chance, money or order-giving word in what the farmer reads', !BANNED.test(JSON.stringify(WORDS) + read.suggested.source + read.suggested.note + sourceLine(r)), '');
// an orchard, a vineyard or another crop that stays at the pin: one plain sentence and no rotation (the crop map's pin.kind === 'garden')
{ const answer = { ok: true, year: 2025, country: 'US', cropland_ha: 90000, crops: [{ crop: 'corn', share: 0.3, ha: 27000 }], pin: { kind: 'garden', code: 75, name: 'Almonds', ids: ['almond'] } };
  const g = stepPlan({ crop: { status: 'read', answer } }), grape = stepPlan({ crop: { status: 'read', answer: { ...answer, pin: { kind: 'garden', code: 69, name: 'Grapes', ids: ['grape'] } } } }), field = stepPlan({ crop: { status: 'read', answer: { ...answer, pin: { kind: 'cropland' } } } });
  check('a pin on an almond orchard: the phase is garden, with no suggested rotation and no rotation card', g.phase === 'garden' && g.suggested === null && g.cards.length === 0 && g.garden[0] === 'almond', JSON.stringify(g));
  check('its sentence is the plain one, and the class and the year are under Show more', /^The USDA crop map shows an orchard, vineyard or other crop that stays for years at your field\. Crophalo does not plan rotations for these\. It will show your weather, frost, rain, slope and soil\.$/.test(g.message) && g.more === 'Crop map class 75, Almonds, USDA Cropland Data Layer 2025.', g.more);
  check('a vineyard names the grape; a field pin is not a garden', grape.garden[0] === 'grape' && field.phase !== 'garden');
  // the lookup's own answer names the standing crops pin.crops (scripts/live/cropsnear.py, the usa-crops step), so the standing crop is chosen from it
  check('the lookup\'s own pin (crops: [...]) gives the standing crop to choose', stepPlan({ crop: { status: 'read', answer: { ...answer, pin: { kind: 'garden', code: 75, name: 'Almonds', crops: ['almond'] } } } }).garden[0] === 'almond');
  check('the crops of the standing-crop list exist in the app (almond and grape)', ['almond', 'grape'].every(id => GARDENS[id])); }
console.log(`cropstep: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
