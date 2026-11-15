// Crophalo's report suite: the markup of the Overview and Options from the engine's answer, the "i" with its sources, the honest "not read yet" state when
// there is no engine, and the joins that never invent a plan. The fixture below is made for these checks only: no screen ever shows it.
// RULE: never loosen a check to make it pass; fix the project. No page and no internet are needed. Run: node scripts/test_report.mjs
import { planWithCrops, PRESELECT_WORDS, farmPlans, proposedPlan, betterOptions, overviewHTML, optionsHTML, laterHTML, loadingHTML, infoButton, sourceNotes, assumptions, estimatedArea, coverLines, windowLines, barsHTML, scoresFoldHTML, optionDetailHTML, sureHTML, planName, allPlans, TABS, WILL_HOLD, NOT_READ, dayWords } from '../js/report-view.js';
import { getOptions, addToFarm } from '../js/joins.js';
import { engineSpot, loadNearby } from '../js/near-load.js';
import { climateFor } from '../js/joins.js';
import { once, spotKey, forgetAll } from '../js/memo.js';
import { loadSpot, spotFor, forgetSpots, prefetchPlace, getSmap } from '../js/report-load.js';
import { buildSeries } from '../js/data.js';
import { computeClimate } from '../js/climate.js';
import { MORE, ALL_SOURCES } from '../js/sources.more.js';
import { cardHtml } from '../js/srci.js';
import fs from 'node:fs';
import { newState } from '../js/state.js';
import { dataPageHTML } from '../js/pages.js';
import { NASA_LINE, NASA_CREDIT_PAGE } from '../js/sources.js';
import { SOURCES } from '../js/sources.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

// a fixture shaped like the contract's answer, for these checks only
const now = { id: 'now', name: 'Now', kind: 'current', seasons: [{ year: 1, crop: 'corn', sow: '2027-05-01', harvest: '2027-10-05', after: 'residue', residueUntil: '2027-12-01', window: null }, { year: 2, crop: 'soy', sow: '2028-05-20', harvest: '2028-10-01', after: 'residue', residueUntil: '2028-12-01', window: null }, { year: 3, crop: 'corn', sow: '2029-05-01', harvest: '2029-10-05', after: 'residue', residueUntil: null, window: null }], score: 62, scores: { water: 60, soil: 55, erosion: 40, income: 80, weather: 70 } };
const wheat = { id: 'wheat', name: 'With winter wheat', kind: 'proposed', seasons: [now.seasons[0], now.seasons[1], { year: 3, crop: 'wheat', sow: '2028-10-05', harvest: '2029-07-25', after: 'cover', residueUntil: null, window: { earliest: '2028-09-25', latest: '2028-10-15' } }], score: 71, scores: { water: 65, soil: 75, erosion: 78, income: 70, weather: 68 } };
const other = { id: 'other', name: 'Barley', kind: 'proposed', seasons: [{ year: 1, crop: 'barley', sow: '2027-04-20', harvest: '2027-08-01', after: 'bare', residueUntil: null, window: null }] };
const RESULT = { ok: true, current: now, recommended: wheat, others: [other], reason: 'Winter wheat keeps living roots on the field after soybeans, when rain would otherwise move bare soil.', evidence: [{ text: 'No stress thresholds crossed in 26 tested years.', sources: ['power', 'gpm'] }, { text: 'Sowing dates follow the crop guide and your field’s frost record.', sources: ['fao', 'power'] }], gaps: ['Soil is assumed, not measured.', 'Confirm your own sowing dates.'], risks: ['A late soybean harvest squeezes the wheat sowing window.'], sureness: 'Somewhat sure' };
const REGION = JSON.parse(fs.readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8'))[0];   // the demo region, from its data file
const STATE = { ...newState(), loc: { lat: REGION.lat, lon: REGION.lon, label: REGION.name, cc: 'CA' }, name: REGION.name, soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...newState().farm, irrigation: 'none' } };

// ---- Overview
const ov = overviewHTML(RESULT, { state: STATE });
check('one recommendation, in a headline', /Try Corn, then Soybeans, then Winter wheat/.test(ov) || /Try [A-Za-z ,]+/.test(ov), ov.match(/rv-headline">([^<]*)/)?.[1]);
check('one reason it suits this field', ov.includes('Why it suits this field:') && ov.includes('Winter wheat keeps living roots'));
check('both rotations are shown side by side, the suggested one marked', (ov.match(/class="rv-col/g) ?? []).length === 2 && /rv-col is-rec/.test(ov));
check('what covers the ground after harvest is said for each, in words from the plan', ov.includes('after harvest, leftover crop residue: a thin cover') && ov.includes('a living cover that protects the soil'));
check('the late-harvest caveat names the window from the plan, not an invented date', ov.includes('Where it may be hard:') && ov.includes('25 Sep 2028') && ov.includes('15 Oct 2028') && ov.includes('squeezes that window'));
check('how sure, with its fold of what to confirm', ov.includes('How sure is this?') && ov.includes('Somewhat sure') && ov.includes('id="ovSure"') && ov.includes('Soil is assumed, not measured.') && ov.includes('The score is a guide. It is not a yield and not a chance of success.'));
check('the assumptions are written on the screen: assumed soil, rain only, an estimated outline', ov.includes('an average loam is assumed') && ov.includes('Water: rain only') && ov.includes('estimated as a 10 ha square around the pin'));
check('the score ring is there for the suggestion', ov.includes('Score 71 out of 100'));
check('there is an "i" beside the suggestion that opens its sources', /class="srci nasa"[^>]*data-src="[^"]*power[^"]*"/.test(ov));
check('"Add to My Farm" is not in the Overview: it is one action, in the bar', !/Add to My Farm/.test(ov));
check('no loss, yield or chance claimed', !/\b(chance of success)\b.*\b(percent|%)\b/.test(ov) && !/\bforecast\b/i.test(ov.replace('is a guide', '')));
check('words from the engine are plain text', !/<img/.test(overviewHTML({ ...RESULT, reason: '<img src=x onerror=1>', gaps: ['<b>x</b>'] }, { state: STATE })));
check('with no answer it says so and shows nothing made up', (() => { const h = overviewHTML(null, { state: STATE }); return h.includes(NOT_READ.slice(0, 30)) && !/rv-headline|Score/.test(h) && h.includes('What is assumed'); })());
check('an engine answer with ok false says its reason', overviewHTML({ ok: false, reason: 'No weather.' }, { state: STATE }).includes('No weather.'));
same('keeping what you grow now says Keep', /Keep Corn, then Soybeans, then Corn/.test(overviewHTML({ ...RESULT, recommended: now }, { state: STATE })), true);
check('the sureness levels each have words', ['Very sure', 'Fairly sure', 'Somewhat sure'].every(l => sureHTML({ sureness: l, gaps: [], risks: [] }).includes(l)) && sureHTML({ sureness: 'x' }) === '');

// ---- Options
const op = optionsHTML(RESULT, 'wheat');
same('three cards: Today, Our suggestion, an Option', [(op.match(/class="card act ocard/g) ?? []).length, /Today/.test(op), /Our suggestion/.test(op), /Option/.test(op)], [3, true, true, true]);
check('the chosen card is pressed', /data-plan="wheat" aria-pressed="true"/.test(op) && /data-plan="now" aria-pressed="false"/.test(op));
check('the detail has the why, the folds closed by default, each with its count', op.includes('Why we suggest it:') && !/<details[^>]* open/.test(op) && op.includes('Your rotation, year by year') && op.includes('When is the soil covered?') && op.includes('What the data suggests') && op.includes('What we cannot see') && op.includes('Check before you switch'));
check('every bar says Worse and Better at its ends', (barsHTML(wheat.scores).match(/<small>Worse<\/small>/g) ?? []).length === 5 && (barsHTML(wheat.scores).match(/<small>Better<\/small>/g) ?? []).length === 5);
check('a bar has its words and its number for a screen reader', /aria-label="Soil health: 75 out of 100"/.test(barsHTML(wheat.scores)));
check('today\'s card says it is the yardstick', optionsHTML(RESULT, 'now').includes('What you grow now: the yardstick for every other option.'));
check('an option with no scores says they are not read yet and draws no bar', (() => { const h = optionsHTML(RESULT, 'other'); return h.includes('Scores are not read yet for this option.') && !h.includes('rv-bars'); })());
check('the evidence lines each carry an "i"', (optionDetailHTML(wheat, RESULT).match(/class="srci/g) ?? []).length === 2);
check('the gaps and the risks are in their folds with counts', /What we cannot see <span class="count soft">2<\/span>/.test(optionDetailHTML(wheat, RESULT)) && /Check before you switch <span class="count soft">1<\/span>/.test(optionDetailHTML(wheat, RESULT)));
check('"How the scores work" is folded, with a table and the not-a-yield line', (() => { const h = scoresFoldHTML(RESULT); return /<details class="fold-card" id="howScores">/.test(h) && !/id="howScores" open/.test(h) && h.includes('<table') && h.includes('(suggested)') && h.includes('not a yield and not a chance of success'); })());
check('with no answer Options says so', optionsHTML(null, null).includes(NOT_READ.slice(0, 30)) && !/ocard/.test(optionsHTML(null, null)));
same('every plan is listed once, today first', allPlans(RESULT).map(p => p.id), ['now', 'wheat', 'other']);
same('plan names from the crops', [planName(now), planName(other)], ['Corn, then Soybeans, then Corn', 'Spring barley']);
same('cover lines come only from what the plan says', [coverLines(now).length, coverLines({ seasons: [{ year: 1, crop: 'corn' }] }).length], [3, 0]);
same('windows come only from dates the plan carries', [windowLines(wheat).length, windowLines(now).length, windowLines({ seasons: [{ crop: 'wheat', window: { earliest: 'x', latest: '2028-10-15' } }] }).length], [1, 0, 0]);

// ---- keep, the options worth trying, and the plan that goes to My Farm
const cover73 = { id: 'cover', name: 'With a cover crop', kind: 'proposed', seasons: wheat.seasons, score: 73, flag: 'holds' };
const wsoy = { id: 'wsoy', name: 'Winter wheat, then soybeans', kind: 'proposed', seasons: [now.seasons[1], wheat.seasons[2]], score: 73, flag: 'holds' };
const cws = { id: 'cws', name: 'Corn, soybeans, winter wheat', kind: 'proposed', seasons: wheat.seasons, score: 69, flag: 'holds' };
const weak = { id: 'weak', name: 'Barley', kind: 'proposed', seasons: other.seasons, score: 90, flag: 'fails' };
const KEEP = { ...RESULT, recommended: now, others: [cws, weak, wsoy, cover73], reason: 'Keeping it scores 70; nothing gains the 8 points it takes to call a change.' };
same('the best option that holds up is the default plan for My Farm when nothing was chosen (a plan that does not hold up never is)', [proposedPlan(KEEP).plan.id, proposedPlan(KEEP).why], ['wsoy', 'best']);
same('a plan the farmer chose wins', [proposedPlan(KEEP, 'cws').plan.id, proposedPlan(KEEP, 'cws').why], ['cws', 'chosen']);
same('My Farm gets the engine\'s own plan ids, never a made-up one', [farmPlans(KEEP, 'cws').current.id, farmPlans(KEEP, 'cws').proposed.id, farmPlans(KEEP, 'cws').current.kind, farmPlans(KEEP, 'cws').proposed.kind], [KEEP.current.id, 'cws', 'current', 'proposed']);
same('even a plan that does not hold up, when the farmer chose it', proposedPlan(KEEP, 'weak').plan.id, 'weak');
same('choosing what is grown now means nothing chosen', proposedPlan(KEEP, 'now').why, 'best');
same('a suggested change is the proposed plan when nothing was chosen', [proposedPlan(RESULT).plan.id, proposedPlan(RESULT).why], ['wheat', 'recommended']);
// the engine marks a plan with flag 'holds' | 'borderline' | 'fails' | 'risky' (never a "holds" field)
const borderline = { id: 'bl', name: 'Oats', kind: 'proposed', seasons: other.seasons, score: 88, flag: 'borderline' }, noFlag = { id: 'nf', name: 'Rye', kind: 'proposed', seasons: other.seasons, score: 95 };
same('a plan that only just suits, or has no flag, is never "the best option that holds up"', betterOptions({ ...KEEP, others: [borderline, noFlag, cws] }).map(p => p.id), ['cws']);
same('only a plan flagged "holds" can go to My Farm by default', proposedPlan({ ...KEEP, others: [borderline, noFlag] }).why, 'recommended');
same('the demo plan is found by its crops, not by a made-up id', [planWithCrops({ ...KEEP, others: [cws, wsoy] }, ['corn', 'soy', 'wheat'])?.id, planWithCrops({ ...KEEP, others: [wsoy] }, ['corn', 'soy', 'wheat'])], ['cws', null]);
same('a demo plan that does not hold up is not pre-selected', planWithCrops({ ...KEEP, others: [{ ...cws, flag: 'borderline' }] }, ['corn', 'soy', 'wheat']), null);
check('a pre-selected plan is labelled an option, not our firm suggestion', overviewHTML(KEEP, { chosen: 'cws', preselected: true }).includes(PRESELECT_WORDS) && !overviewHTML(KEEP, { chosen: 'cws' }).includes(PRESELECT_WORDS) && /not our firm suggestion/.test(PRESELECT_WORDS));
same('keep with nothing that holds up: the suggestion itself', proposedPlan({ ...KEEP, others: [weak] }).why, 'recommended');
same('no answer, no plan', proposedPlan(null), { plan: null, why: 'none' });
same('the better options are those that hold up, best first', betterOptions(KEEP).map(p => p.id), ['wsoy', 'cover', 'cws']);
const kept = overviewHTML(KEEP, { state: STATE });
check('keep: the headline says Keep and the compare shows what is grown now beside the best option worth trying', /Keep Corn, then Soybeans, then Corn/.test(kept) && kept.includes('Now (our suggestion: keep it)') && kept.includes('Worth trying'));
check('keep: "Options worth trying" lists the best two that hold up, each with its score and a "Try this plan" button', (() => { const w = kept.split('Options worth trying')[1] ?? ''; return (w.match(/data-act="try"/g) ?? []).length === 2 && /Winter wheat, then Soybeans|Winter wheat/.test(w) && /Score 73/.test(w) && /what you grow now: 62/.test(w) && !/Barley/.test(w); })());
check('keep: a plan chosen to try is shown as chosen, and sits in the compare', (() => { const h = overviewHTML(KEEP, { state: STATE, chosen: 'wsoy' }); return /aria-pressed="true">Chosen to try</.test(h) && h.includes('The plan you chose to try'); })());
check('a suggested change has no "worth trying" list', !/Options worth trying/.test(overviewHTML(RESULT, { state: STATE })));
check('Options: every plan but the one grown now has a "Try this plan" button in its detail', /data-act="try" data-plan="wheat"/.test(optionsHTML(KEEP, 'cws')) === false && /data-act="try" data-plan="cws"/.test(optionsHTML(KEEP, 'cws')) && !/data-act="try"/.test(optionsHTML(KEEP, 'now')));
check('Options: the chosen plan says so on its card and its button, and offers to go back to the suggestion', (() => { const h = optionsHTML(KEEP, 'wsoy', 'wsoy'); return /Chosen to try: add it to My Farm/.test(h) && /<span class="ocard-tag chip">Chosen to try/.test(h) && /data-act="untry"/.test(h) && !/data-act="untry"/.test(optionsHTML(KEEP, 'wsoy')); })());
check('the chosen button is not the primary one: Add to My Farm stays the one blue action', !/btn primary/.test(optionsHTML(KEEP, 'wsoy', 'wsoy') + overviewHTML(KEEP, { state: STATE, chosen: 'wsoy' })));

// ---- the "i"
same('NASA is listed first', sourceNotes(['fao', 'power', 'rules']).map(n => n.key), ['power', 'fao', 'rules']);
same('an unknown key is left out and a key counts once', sourceNotes(['power', 'power', 'nope', '__proto__']).map(n => n.key), ['power']);
const i = infoButton(['power'], 'Frost dates');
check('the button is a real button with a name, the NASA shape, its sources and its note', /^<button type="button" class="srci nasa"/.test(i) && /aria-label="Where this comes from: NASA POWER"/.test(i) && /aria-haspopup="dialog"/.test(i) && /aria-expanded="false"/.test(i) && /data-src="power"/.test(i) && /Frost dates/.test(i), i);
check('a non-NASA source gets the outlined shape', !/srci nasa/.test(infoButton(['fao'])) && /srci/.test(infoButton(['fao'])));
same('no sources, no button', [infoButton([]), infoButton(['nope'])], ['', '']);
const pop = cardHtml(['fao', 'power'], 'Newest day: 16 November 2026');
check('the card has the NASA tag first, "For this figure", each source with who runs it, and a link that opens in a new tab', pop.indexOf('NASA</span>') < pop.indexOf('FAO') && pop.includes('For this figure') && /Run by NASA Langley/.test(pop) && /href="https:\/\/power\.larc\.nasa\.gov\/"[^>]*target="_blank" rel="noopener noreferrer"/.test(pop) && pop.includes('opens in a new tab'), pop.slice(0, 300));
check('every source note has every field, and https links', Object.entries(ALL_SOURCES).every(([k, n]) => ['org', 'name', 'who', 'what', 'talk', 'url'].every(f => typeof n[f] === 'string' && n[f]) && typeof n.nasa === 'boolean' && n.url.startsWith('https://')));
check('the report\'s own notes are in the shared table', Object.keys(MORE).every(k => ALL_SOURCES[k] === MORE[k]) && ALL_SOURCES.power.nasa === true);
check('NASA notes are marked NASA', ALL_SOURCES.smap.nasa === true && MORE.rules.nasa === false);

// ---- the other tabs and the loading screen
same('seven tabs, in order', TABS.map(t => t.id), ['overview', 'options', 'weather', 'calendar', 'field', 'satellites', 'notes']);
check('each of the three later tabs says plainly it is not built and what it will hold', ['field', 'satellites', 'notes'].every(id => laterHTML(id).includes('Not built yet.') && laterHTML(id).includes(WILL_HOLD[id])));
const rows = [{ key: 'power', label: 'Weather · NASA POWER', state: 'ok', reason: '' }, { key: 'forecast', label: 'Forecast', state: 'fail', reason: 'The service took too long to answer.' }, { key: 'x', label: 'Hidden', state: 'skip' }];
const ld = loadingHTML(rows);
check('the loading screen says what is happening and counts the answers', ld.includes('Building your full report') && ld.includes('1 of 2 sources answered') && !ld.includes('Hidden'));
check('a source that failed says why, and each row has its "i"', ld.includes('The service took too long to answer.') && (ld.match(/class="srci/g) ?? []).length >= 1);
check('the loading screen is marked busy until all answered', /aria-busy="true"/.test(ld) && /aria-busy="false"/.test(loadingHTML([{ key: 'power', label: 'a', state: 'ok' }])));

// ---- assumptions and the estimated outline
const sq = estimatedArea({ lat: REGION.lat, lon: REGION.lon });
check('an estimated outline is a 10 ha square round the pin, marked estimated', sq.estimated === true && sq.ha === 10 && sq.pts.length === 4 && sq.pts.every(p => p.every(Number.isFinite)));
check('the pin is inside it, and its side is about 316 m', (() => { const [a, b, c] = sq.pts; const dLat = (c[0] - a[0]) * 111320, dLon = (b[1] - a[1]) * 111320 * Math.cos(REGION.lat * Math.PI / 180); return a[0] < REGION.lat && c[0] > REGION.lat && a[1] < REGION.lon && b[1] > REGION.lon && Math.abs(dLat - 316) < 12 && Math.abs(dLon - 316) < 12; })());
same('no place, no outline', estimatedArea(null), null);
check('a drawn outline is described as drawn', assumptions({ ...STATE, area: { ha: 12.4, pts: [] } }).some(x => x.includes('the one you drew (12.4 ha)')));
check('a soil the farmer described is not called assumed', !assumptions({ ...STATE, soil: { mode: 'manual' } }).some(x => /assumed/.test(x)));

// ---- the joins never invent a plan
same('no engine file: not read yet, no plan', await getOptions(STATE, null, {}, async () => { throw new Error('missing'); }), { ok: false, reason: NOT_READ });
same('nothing handed in: the same, and nothing is loaded', await getOptions(STATE, null, {}), { ok: false, reason: NOT_READ });
same('nothing handed in for My Farm: not connected', (await addToFarm({})).ok, false);
same('an engine with no function: the same', await getOptions(STATE, null, {}, async () => ({})), { ok: false, reason: NOT_READ });
same('an answer with no recommendation is not used', (await getOptions(STATE, null, {}, async () => ({ optionsFor: () => ({ current: now }) }))).ok, false);
const good = await getOptions(STATE, { c: 1 }, { s: 1 }, async () => ({ optionsFor: (st, c, s) => ({ ...RESULT, _args: [!!st, c.c, s.s] }) }));
check('a real engine\'s answer is passed through, with the three arguments', good.ok === true && good.recommended.id === 'wheat' && JSON.stringify(good._args) === '[true,1,1]');
check('an engine that throws gives a plain sentence, not a stack', (await getOptions(STATE, null, {}, async () => ({ optionsFor: () => { throw new Error('boom'); } }))).reason.startsWith('The options could not be worked out'));
same('no My Farm: the field is not added and it says so', await addToFarm({}, async () => { throw new Error('missing'); }), { ok: false, reason: 'My Farm is not connected yet, so the field could not be added.' });
const seen = []; const added = await addToFarm({ place: { lat: 1 }, current: now, proposed: wheat }, async () => ({ addFromReport: p => { seen.push(p); return { farmId: 'f1', fieldId: `${REGION.lat.toFixed(4)},${REGION.lon.toFixed(4)}` }; } }));
check('My Farm is handed the payload and answers with the field', added.ok && added.fieldId === `${REGION.lat.toFixed(4)},${REGION.lon.toFixed(4)}` && seen[0].proposed.id === 'wheat');
check('My Farm answering nothing is a plain failure', (await addToFarm({}, async () => ({ addFromReport: () => null }))).ok === false);
same('dates in words', [dayWords('2028-10-05'), dayWords('x')], ['5 Oct 2028', '']);

// ---- the Data page
const dp = dataPageHTML();
check('the Data page opens with the NASA line and a link to the full credit', dp.includes(NASA_LINE) && dp.includes(`href="${NASA_CREDIT_PAGE}"`) && dp.indexOf(NASA_LINE) < dp.indexOf('Where the numbers come from'));
check('one entry for every source in the table, built from the table', (dp.match(/<li class="row">/g) ?? []).length === Object.keys(ALL_SOURCES).length);
check('NASA sources come first, each with its "i"', dp.indexOf('NASA</span>') < dp.indexOf('class="src">') && (dp.match(/class="srci/g) ?? []).length === Object.keys(ALL_SOURCES).length);
check('the NASA line says NASA does not endorse it', /not made, reviewed or endorsed by NASA/.test(dp));
check('a note from outside is plain text on the Data page', !/<img src=x/.test(dataPageHTML({ x: { org: 'A', name: '<img src=x>', nasa: false, who: 'w', what: '<b>', talk: 't', url: 'https://x.invalid/' } })));

// ---- the place the engine is asked about (crops grown nearby, country, today)
{ const st = { name: 'Oxford', loc: { lat: 43.13, lon: -80.75, label: 'Oxford', cc: 'CA' }, area: { slope: 2.1 } };
  const ANS = { ok: true, country: 'CA', year: 2025, box: { north: 43.27, south: 42.99, east: -80.58, west: -80.92 }, cropland_ha: 90000, crops: [{ crop: 'corn', share: 0.3, ha: 27000 }, { crop: 'soy', share: 0.3, ha: 27000 }, { crop: 'canola', share: 0.0001, ha: 9 }], wider: [], classes: [] };
  let asked = ''; const near = await loadNearby(st.loc, async url => { asked = url; return { json: async () => ANS }; });
  same('the route asked, with the country the crop maps need', asked, '/api/cropsnear?lat=43.1300&lon=-80.7500&country=CA');
  { let byName = '', none = ''; await loadNearby({ lat: 43.13, lon: -80.75, label: 'Woodstock, Ontario, Canada', cc: '' }, async url => { byName = url; return { json: async () => ANS }; }); await loadNearby({ lat: 43.13, lon: -80.75 }, async url => { none = url; return { json: async () => ({ ok: false, reason: 'x' }) }; });
    same('with no code, the country is the last part of the place line; with no place line, none is sent', [byName, none], ['/api/cropsnear?lat=43.1300&lon=-80.7500&country=Canada', '/api/cropsnear?lat=43.1300&lon=-80.7500']); }
  check('the crop-map route is asked with the field\'s position', typeof near === 'object' && Array.isArray(near.absent) && near.absent.includes('canola'), JSON.stringify(Object.keys(near)));
  const spot = engineSpot(st, near);
  check('the engine gets the country (not only cc), the slope, what is absent nearby, and the nearby line', spot.country === 'CA' && spot.slope === 2.1 && spot.absent.includes('canola') && /Farmland in a box/.test(spot.nearby.line) && spot.cc === 'CA', JSON.stringify(Object.keys(spot)));
  const failed = await loadNearby(st.loc, async () => { throw new Error('x'); }); check('a failed lookup leaves the gate open and says so', failed.absent === undefined && /could not be read/.test(failed.nearby.gap), JSON.stringify(failed).slice(0, 160));
  const slow = await loadNearby(st.loc, () => new Promise(() => {}), 30); check('a lookup that never answers is given up on', slow.absent === undefined && /could not be read/.test(slow.nearby.gap));
  same('no position asks nothing', (await loadNearby({}, async () => { throw new Error('asked'); })).absent, undefined);
  const seen = []; await getOptions({}, {}, spot, async () => ({ optionsFor: (a, b, c, d) => { seen.push(d); return { recommended: now, current: now }; } }), { today: '2026-11-15' });
  same('optionsFor is given today', seen[0], { today: '2026-11-15' }); }

// ---- the what-if sliders move the climate the options are worked out on
{ const REC = JSON.parse(fs.readFileSync(new URL('./fixtures/power_barrie.json', import.meta.url), 'utf8')), lat = REC.geometry.coordinates[1], series = buildSeries(REC, { lat, lon: REC.geometry.coordinates[0] }), real = computeClimate(series, lat);
  same('sliders at zero leave the real climate as it is', climateFor(series, real, { rainPct: 0, tempC: 0 }, lat) === real, true);
  const wet = climateFor(series, real, { rainPct: 30, tempC: 0 }, lat), hot = climateFor(series, real, { rainPct: 0, tempC: 3 }, lat);
  check('more rain gives a different, wetter climate (the yearly rain rises)', wet !== real && JSON.stringify(wet.yearly) !== JSON.stringify(real.yearly) && JSON.stringify(wet.monthly) !== JSON.stringify(real.monthly));
  check('warmer weather gives a different climate (the cold nights move)', hot !== real && JSON.stringify(hot.coldNight) !== JSON.stringify(real.coldNight) && JSON.stringify(hot.yearly) !== JSON.stringify(real.yearly));
  same('no record leaves the climate alone', climateFor(null, real, { rainPct: 30 }, lat) === real, true); }

// ---- speed: the report does not wait for the forecast, shares lookups started earlier, and needs no pause for kept answers
{ const PW = fs.readFileSync(new URL('./fixtures/power_barrie.json', import.meta.url), 'utf8'), FC = fs.readFileSync(new URL('./fixtures/forecast_barrie.json', import.meta.url), 'utf8'), P = JSON.parse(PW), where = { lat: P.geometry.coordinates[1], lon: P.geometry.coordinates[0] };
  const mk = (delays, log = []) => async url => { const kind = /power\.larc/.test(url) ? 'power' : /open-meteo/.test(url) ? 'forecast' : 'other'; log.push(kind); await new Promise(r => setTimeout(r, delays[kind] ?? 0)); const text = kind === 'power' ? PW : kind === 'forecast' ? FC : '{}'; return { ok: true, status: 200, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) }; };
  const t0 = Date.now(), r = await loadSpot(where, { fetch: mk({ power: 50, forecast: 4000 }) }), took = Date.now() - t0; let settled = false; r.forecastP.then(() => { settled = true; });
  await new Promise(res => setTimeout(res, 0));
  check('loadSpot answers once the weather and the climate are in, while the forecast (4 s) is still on its way', r.ok && settled === false && took < 3900 && r.forecast === null && typeof r.forecastP?.then === 'function', `${took} ms, settled ${settled}`);
  const fc = await r.forecastP; check('the forecast comes back later as a promise with the raw answer', fc && typeof fc === 'object');
  same('answers that had to be fetched are not "kept"', r.allCached, false);
  let usedHook = 0; const hooked = await loadSpot(where, { fetch: mk({}), climateFrom: async (json, place) => { usedHook++; return { ok: true, series: { stand: 'in' }, climate: { stand: 'in' } }; } });
  check('the climate can be made away from the page (climateFrom): the page gets what it returns', hooked.ok && usedHook === 1 && hooked.climate.stand === 'in' && hooked.series.stand === 'in');
  const bad = await loadSpot(where, { fetch: mk({}), climateFrom: async () => ({ ok: false, reason: 'No.' }) }); check('a refusal from the worker falls back to the back-up record, in words', bad.ok === false || bad.note !== undefined);
  // sharing
  forgetSpots(); forgetAll(); const log = [], env = { fetch: mk({ power: 30, forecast: 30 }, log) }, rows = [];
  const first = spotFor(where, env), second = spotFor(where, env, (...e) => rows.push(e)); const [a, b] = await Promise.all([first, second]);
  check('two asks for one place start the lookups once', log.filter(k => k === 'power').length === 1 && log.filter(k => k === 'forecast').length === 1 && a.ok && b.ok, log.join());
  const late = []; const third = await spotFor(where, env, (...e) => late.push(e)); check('a report opened after the lookups finished is told every row at once and asks nothing', late.length >= 1 && late.some(e => e[0] === 'power' && e[1] === 'ok') && log.length === 2, `${late.length} rows, ${log.join()}`);
  const own = log.length; await prefetchPlace(where, env); check('a prefetch for a place already asked asks nothing more for the weather', log.length === own, `${log.length} vs ${own}`);
  { // the early lookups never ask the crop map without the field's country: the refusal would be kept, and the report would lose what is grown nearby
    const asked = [], was = globalThis.fetch; globalThis.fetch = async url => { asked.push(String(url)); return { ok: true, json: async () => ({ ok: false, reason: 'not in this test' }) }; };
    forgetAll(); prefetchPlace({ lat: 45.5, lon: -75.5 }, { fetch: mk({}) }); await new Promise(r => setTimeout(r, 30));
    check('a bare map position starts the regional lookups early, but not the crop map, which needs the country', asked.some(u => u.startsWith('/api/smaproot')) && !asked.some(u => u.startsWith('/api/cropsnear')), asked.join(' '));
    forgetAll(); asked.length = 0; prefetchPlace({ lat: 45.5, lon: -75.5, cc: 'CA' }, { fetch: mk({}) }); await new Promise(r => setTimeout(r, 30));
    check('with the country known the crop map is asked early too, with the country', asked.some(u => /^\/api\/cropsnear\?.*country=CA/.test(u)), asked.join(' '));
    globalThis.fetch = was; forgetAll(); forgetSpots();
  }
  forgetSpots(); const bog = [], failEnv = { fetch: async () => { bog.push(1); throw new Error('down'); } }; await spotFor(where, failEnv).catch(() => {}); await spotFor(where, failEnv).catch(() => {});
  check('a failed lookup is not remembered: the next ask tries again', bog.length >= 2, String(bog.length));
  // the memory itself
  forgetAll(); let starts = 0; const run = async () => { starts++; return { ok: true }; };
  await Promise.all([once('k', run), once('k', run)]); await once('k', run); same('once: one start however many ask', starts, 1);
  starts = 0; forgetAll(); let n = 0; await once('f', async () => (n++ ? { ok: true } : { ok: false })); await once('f', async () => (n++ ? { ok: true } : { ok: false })); same('once: a { ok: false } answer is forgotten at once', n, 2);
  let clock = 0; forgetAll(); starts = 0; await once('old', run, { now: () => clock }); clock = 11 * 60e3; await once('old', run, { now: () => clock }); same('once: an answer older than ten minutes is asked again', starts, 2);
  same('once: two places are two keys', spotKey('smap', { lat: 43.13, lon: -80.75 }) === spotKey('smap', { lat: 43.1300, lon: -80.7500 }) && spotKey('smap', { lat: 43.13, lon: -80.75 }) !== spotKey('smap', { lat: 43.14, lon: -80.75 }), true);
  forgetAll(); forgetSpots(); }

console.log(`report: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
