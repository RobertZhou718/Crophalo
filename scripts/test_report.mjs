// Crophalo's report suite: the markup of the Overview and Options from the engine's answer, the "i" with its sources, the honest "not read yet" state when
// there is no engine, and the joins that never invent a plan. The fixture below is made for these checks only: no screen ever shows it.
// RULE: never loosen a check to make it pass; fix the project. No page and no internet are needed. Run: node scripts/test_report.mjs
import { fitNote, hasScore, FIT_WORDS, cycleCrops, repeatNote, optionLabel, optionLabels, labelParts, changeLine, compareHTML, coverSummary, strategies, DIMENSIONS, dimensionOf,  allPlans as everyPlan, planWithCrops, PRESELECT_WORDS, farmPlans, proposedPlan, betterOptions, overviewHTML, optionsHTML, laterHTML, loadingHTML, infoButton, sourceNotes, assumptions, estimatedArea, coverLines, windowLines, barsHTML, scoresFoldHTML, optionDetailHTML, sureHTML, planName, allPlans, TABS, WILL_HOLD, NOT_READ, dayWords } from '../js/report-view.js';
import { getOptions, addToFarm } from '../js/joins.js';
import { engineSpot, loadNearby } from '../js/near-load.js';
import { climateFor } from '../js/joins.js';
import { once, spotKey, forgetAll } from '../js/memo.js';
import { loadSpot, spotFor, forgetSpots, prefetchPlace, getSmap, loadSmap, getEco } from '../js/report-load.js';
import { NOT_HERE, NASA_OFF } from '../js/satellites2-data.js';
import { buildSeries } from '../js/data.js';
import { computeClimate } from '../js/climate.js';
import { MORE, ALL_SOURCES } from '../js/sources.more.js';
import { cardHtml } from '../js/srci.js';
import fs from 'node:fs';
import { newState } from '../js/state.js';
import { dataPageHTML } from '../js/pages.js';
import { NASA_LINE, NASA_USE } from '../js/sources.js';
import { SOURCES } from '../js/sources.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const esc0 = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
check('what covers the ground after harvest is said for each, in words from the plan', /After [^<]*:<\/b> leftover crop residue: a thin cover/.test(ov) && /After [^<]*:<\/b> a living cover that protects the soil/.test(ov) && !/Corn, 1:/.test(ov));
check('the late-harvest caveat names the window from the plan, not an invented date', ov.includes('Where it may be hard:') && ov.includes('25 Sep 2028') && ov.includes('15 Oct 2028') && ov.includes('squeezes that window'));
check('how sure, with its fold of what to confirm', ov.includes('How sure this is:') && ov.includes('Somewhat sure') && ov.includes('id="ovSure"') && ov.includes('What local knowledge would change it') && ov.includes('Soil is assumed, not measured.') && ov.includes('The score is a guide. It is not a yield and not a chance of success.'));
check('the assumptions are written on the screen: assumed soil, rain only, an estimated outline', ov.includes('an average loam is assumed') && ov.includes('Water: rain only') && ov.includes('estimated as a 10 ha square around the pin'));
check('the score ring is there for the suggestion', ov.includes('Score 71 out of 100'));
check('there is an "i" beside the suggestion that opens its sources', /class="srci nasa"[^>]*data-src="[^"]*power[^"]*"/.test(ov));
check('"Add to My Farm" is not in the Overview: it is one action, in the bar', !/Add to My Farm/.test(ov));
check('no loss, yield or chance claimed', !/\b(chance of success)\b.*\b(percent|%)\b/.test(ov) && !/\bforecast\b/i.test(ov.replace('is a guide', '')));
check('words from the engine are plain text', !/<img/.test(overviewHTML({ ...RESULT, reason: '<img src=x onerror=1>', gaps: ['<b>x</b>'] }, { state: STATE })));
check('with no answer it says so and shows nothing made up', (() => { const h = overviewHTML(null, { state: STATE }); return h.includes(NOT_READ.slice(0, 30)) && !/rv-headline|Score/.test(h) && h.includes('What is assumed'); })());
check('an engine answer with ok false says its reason', overviewHTML({ ok: false, reason: 'No weather.' }, { state: STATE }).includes('No weather.'));
same('keeping what you grow now says Keep', /Keep Corn, then soybeans/.test(overviewHTML({ ...RESULT, recommended: now }, { state: STATE })), true);
check('the sureness levels each have words', ['Very sure', 'Fairly sure', 'Somewhat sure'].every(l => sureHTML({ sureness: l, gaps: [], risks: [] }).includes(l)) && sureHTML({ sureness: 'x' }) === '');

// ---- Options
const op = optionsHTML(RESULT, 'wheat');
same('three strategies: what you grow now, our suggestion, another option', [(op.match(/class="card act ocard/g) ?? []).length, /What you grow now/.test(op), /Our suggestion/.test(op), /Another option/.test(op)], [3, true, true, true]);
check('the chosen card is pressed', /data-plan="wheat" aria-pressed="true"/.test(op) && /data-plan="now" aria-pressed="false"/.test(op));
check('the detail has the why, the folds closed by default, each with its count', ['Why it was suggested', 'What evidence supports it', 'What benefits it may offer', 'Where information is missing', 'Risks to check locally'].every(t => op.includes(`<h4>${t}</h4>`)) && !/<details[^>]* open/.test(op) && op.includes('Your rotation, year by year') && op.includes('When is the soil covered?') && op.includes('Ask a farm adviser or farmers near you before you change your rotation.'));
check('every bar says Worse and Better at its ends', (barsHTML(wheat.scores).match(/<small>Worse<\/small>/g) ?? []).length === 5 && (barsHTML(wheat.scores).match(/<small>Better<\/small>/g) ?? []).length === 5);
check('a bar has its words and its number for a screen reader', /aria-label="Soil health: 75 out of 100"/.test(barsHTML(wheat.scores)));
check('today\'s card says it is the yardstick', optionsHTML(RESULT, 'now').includes('What you grow now: the yardstick for every other strategy.'));
check('an option with no scores says they are not read yet and draws no bar', (() => { const h = optionsHTML(RESULT, 'other'); return h.includes('Scores are not read yet for this strategy.') && !h.includes('rv-bars'); })());
check('the evidence lines each carry an "i"', (optionDetailHTML(wheat, RESULT).match(/class="srci/g) ?? []).length === 2);
check('the gaps and the risks are in their own sections, and the risks end with the advice to ask locally', (() => { const h = optionDetailHTML(wheat, RESULT), gaps = h.slice(h.indexOf('<h4>Where information is missing</h4>'), h.indexOf('<h4>Risks to check locally</h4>')), risks = h.slice(h.indexOf('<h4>Risks to check locally</h4>')); return (gaps.match(/<li>/g) ?? []).length === 2 && (risks.match(/<li>/g) ?? []).length >= 1 && /Ask a farm adviser or farmers near you before you change your rotation\.<\/b><\/p>/.test(risks); })());
check('"How the scores work" is folded and says it is not a yield; the table of every option is its own section', (() => { const h = scoresFoldHTML(RESULT), c = compareHTML(RESULT); return /<details class="fold-card" id="howScores">/.test(h) && !/id="howScores" open/.test(h) && !h.includes('<table') && h.includes('not a yield and not a chance of success') && c.includes('<table') && c.includes('Our suggestion') && /<th scope="row">Crops<\/th>/.test(c) && /<th scope="row">Overall score<\/th>/.test(c) && ['Water use', 'Soil organic matter', 'Erosion', 'Income and market', 'Weather safety', 'Months of bare soil'].every(l => c.includes(l)) && !c.includes('Forage') && !c.includes('Nitrogen from legumes'); })());
check('with no answer Options says so', optionsHTML(null, null).includes(NOT_READ.slice(0, 30)) && !/ocard/.test(optionsHTML(null, null)));
same('every plan is listed once, today first', allPlans(RESULT).map(p => p.id), ['now', 'wheat', 'other']);
same('plan names from the crops', [planName(now), planName(other)], ['Corn, then soybeans', 'Spring barley']);
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
check('keep: the headline says Keep and the compare shows what is grown now beside the best option worth trying', /Keep Corn, then soybeans/.test(kept) && kept.includes('Now (our suggestion: keep it)') && kept.includes('Worth trying'));
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
check('every source note has every field, and https links', Object.entries(ALL_SOURCES).every(([k, n]) => ['org', 'name', 'who', 'what', 'talk', 'url'].every(f => typeof n[f] === 'string' && n[f]) && typeof n.nasa === 'boolean' && (n.url.startsWith('https://') || (!n.nasa && /^\.\/#[a-z]+$/.test(n.url)))));   // a note of Crophalo's own may link to one of its own pages (./#limits): the site's name is never written in the code
check('the report\'s own notes are in the shared table', Object.keys(MORE).every(k => ALL_SOURCES[k] === MORE[k]) && ALL_SOURCES.power.nasa === true);
check('NASA notes are marked NASA', ALL_SOURCES.smap.nasa === true && MORE.rules.nasa === false);

// ---- the other tabs and the loading screen
same('seven tabs, in order', TABS.map(t => t.id), ['overview', 'options', 'weather', 'calendar', 'field', 'satellites', 'notes']);
check('each of the three later tabs says plainly it is not built and what it will hold', ['field', 'satellites', 'notes'].every(id => laterHTML(id).includes('Not built yet.') && laterHTML(id).includes(WILL_HOLD[id])));
const rows = [{ key: 'power', label: 'Weather · NASA POWER', state: 'ok', reason: '' }, { key: 'forecast', label: 'Forecast', state: 'fail', reason: 'The service took too long to answer.' }, { key: 'x', label: 'Hidden', state: 'skip' }];
const ld = loadingHTML(rows);
check('the loading screen is a plain list: one heading, one count line, one row for each thing read, no picture', ld.includes('Reading your field’s data') && /\d of \d read/.test(ld) && !ld.includes('Hidden') && !/<svg|<canvas|<progress|<img/.test(ld), ld.slice(0, 200));
check('a source that failed says it could not be read and what the report loses, in one plain sentence, and never the service\'s own words', ld.includes('Could not be read') && /Without it/.test(ld) && !ld.includes('The service took too long to answer.') && !/Unknown endpoint/.test(loadingHTML([{ key: 'crops', label: 'Crops · map', state: 'fail', reason: 'What farmers grow (Unknown endpoint)' }])), ld);
{ const rows = [{ key: 'power', label: 'Weather record · NASA POWER', state: 'wait' }, { key: 'smap', label: 'Soil moisture · NASA SMAP', state: 'wait' }];
  const quick = loadingHTML(rows, { elapsed: 2000 }), slow = loadingHTML(rows, { elapsed: 12000 }), late = loadingHTML(rows, { elapsed: 21000 }), see = loadingHTML([{ ...rows[0], state: 'ok' }, rows[1]], { elapsed: 6000, canSee: true });
  check('a row says Reading… and, after five seconds, Taking longer than usual…; the weather record names its seconds in words', /Reading…/.test(quick) && !/Taking longer/.test(quick) && /Taking longer than usual…/.test(slow) && /NASA’s weather record is taking longer than usual: 12 s\./.test(slow) && !/Try again/.test(slow), slow);
  check('after 20 seconds on the weather record: Try again beside Keep waiting; "Keep waiting" hides them again', /Try again/.test(late) && /Keep waiting/.test(late) && !/Try again/.test(loadingHTML(rows, { elapsed: 21000, hideRetry: true })));
  check('the button "See the report now" and its quiet line show only when offered', />See the report now</.test(see) && /The rest keeps loading and you can add it when it arrives\./.test(see) && !/See the report now/.test(quick));
  check('no row ever says "not read yet"', ![quick, slow, late, see, ld].some(h => /not read yet|Not read/i.test(h))); }
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
same('no My Farm: the field is not added and it says so', await addToFarm({}, async () => { throw new Error('missing'); }), { ok: false, reason: 'My farm is not connected yet, so the field could not be added.' });
const seen = []; const added = await addToFarm({ place: { lat: 1 }, current: now, proposed: wheat }, async () => ({ addFromReport: p => { seen.push(p); return { farmId: 'f1', fieldId: `${REGION.lat.toFixed(4)},${REGION.lon.toFixed(4)}` }; } }));
check('My Farm is handed the payload and answers with the field', added.ok && added.fieldId === `${REGION.lat.toFixed(4)},${REGION.lon.toFixed(4)}` && seen[0].proposed.id === 'wheat');
check('My Farm answering nothing is a plain failure', (await addToFarm({}, async () => ({ addFromReport: () => null }))).ok === false);
same('dates in words', [dayWords('2028-10-05'), dayWords('x')], ['5 Oct 2028', '']);

// ---- the Data page
const dp = dataPageHTML();
check('the Data page opens with the NASA line and a closed fold that says how NASA data is used; no link to a file', dp.includes(NASA_LINE) && dp.includes('How Crophalo uses NASA data') && NASA_USE.every(([n]) => dp.includes(n)) && !/href="docs\//.test(dp) && !/<details[^>]*id="nasaUse"[^>]*open/.test(dp) && dp.indexOf(NASA_LINE) < dp.indexOf('Where the numbers come from'));
check('one entry for every source in the table, built from the table', (dp.match(/<li class="row">/g) ?? []).length === Object.keys(ALL_SOURCES).length);
check('NASA sources come first, each with a "Show more"', dp.indexOf('NASA</span>') < dp.indexOf('class="src">') && (dp.match(/<summary>Show more<\/summary>/g) ?? []).length === Object.keys(ALL_SOURCES).length);
check('the NASA line says NASA does not endorse it', /not made, reviewed or endorsed by NASA/.test(dp));
check('a note from outside is plain text on the Data page', !/<img src=x/.test(dataPageHTML({ x: { org: 'A', name: '<img src=x>', nasa: false, who: 'w', what: '<b>', talk: 't', url: 'https://x.invalid/' } })));

// ---- the place the engine is asked about (crops grown nearby, country, today)
{ const st = { name: 'Oxford', loc: { lat: 43.13, lon: -80.75, label: 'Oxford', cc: 'CA' }, area: { slope: 2.1 } };
  const ANS = { ok: true, country: 'CA', year: 2025, box: { north: 43.27, south: 42.99, east: -80.58, west: -80.92 }, cropland_ha: 90000, crops: [{ crop: 'corn', share: 0.3, ha: 27000 }, { crop: 'soy', share: 0.3, ha: 27000 }, { crop: 'canola', share: 0.0001, ha: 9 }], wider: [], classes: [] };
  let asked = ''; const near = await loadNearby(st.loc, async url => { asked = url; return { json: async () => ANS }; });
  same('the route asked, with the country the crop maps need', asked, '/api/cropsnear?lat=43.1300&lon=-80.7500&country=CA');
  { let byName = '', none = ''; await loadNearby({ lat: 43.13, lon: -80.75, label: 'Woodstock, Ontario, Canada', cc: '' }, async url => { byName = url; return { json: async () => ANS }; }); await loadNearby({ lat: 43.13, lon: -80.75 }, async url => { if (!/cropsnear/.test(url)) return { json: async () => ({ ok: false }) }; none = url; return { json: async () => ({ ok: false, reason: 'x' }) }; });
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
  const mk = (delays, log = []) => async url => { const kind = /power\.larc/.test(url) ? 'power' : /archive-api/.test(url) ? 'cold' : /open-meteo/.test(url) ? 'forecast' : 'other'; log.push(kind); await new Promise(r => setTimeout(r, delays[kind] ?? 0)); const text = kind === 'power' ? PW : kind === 'forecast' ? FC : '{}'; return { ok: true, status: 200, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) }; };
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
  const late = []; const third = await spotFor(where, env, (...e) => late.push(e)); check('a report opened after the lookups finished is told every row at once and asks nothing', late.length >= 1 && late.some(e => e[0] === 'power' && e[1] === 'ok') && log.length === 3, `${late.length} rows, ${log.join()}`);
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

// ---- a rotation is named by its repeating cycle; one card for each plan; each option named by what it changes
{
  const S = (year, crop, extra = {}) => ({ year, crop, sow: '2027-05-01', harvest: '2027-10-01', after: 'residue', ...extra });
  const two = { id: 'now', name: 'Today', kind: 'current', seasons: [S(1, 'corn'), S(2, 'soy'), S(3, 'corn')] };
  same('a two-year rotation laid out over three years is named by its cycle, with how often it repeats', [planName(two), repeatNote(two), cycleCrops(two)], ['Corn, then soybeans', 'repeats every 2 years', ['corn', 'soy']]);
  const three = { id: 't', seasons: [S(1, 'corn'), S(2, 'soy'), S(3, 'wheat')] };
  same('a three-year rotation that does not repeat keeps all three, and says nothing about repeating', [planName(three), repeatNote(three)], ['Corn, then soybeans, then winter wheat', '']);
  same('one crop every year is said so; one season alone is just its name', [planName({ seasons: [S(1, 'corn'), S(2, 'corn'), S(3, 'corn')] }), planName({ seasons: [S(1, 'barley')] })], ['Corn, every year', 'Spring barley']);
  same('a four-year repeat of a two-year cycle', [planName({ seasons: [S(1, 'corn'), S(2, 'soy'), S(3, 'corn'), S(4, 'soy')] }), repeatNote({ seasons: [S(1, 'corn'), S(2, 'soy'), S(3, 'corn'), S(4, 'soy')] })], ['Corn, then soybeans', 'repeats every 2 years']);
  const cover = { id: 'c1', name: 'With a cover crop', kind: 'proposed', score: 73, seasons: [S(1, 'corn', { cover: 'rye' }), S(2, 'soy', { cover: 'rye' }), S(3, 'corn', { cover: 'rye' })] };
  const cover2 = { id: 'c2', name: 'With a cover crop', kind: 'proposed', score: 71, seasons: [S(1, 'corn', { after: 'cover', cover: true }), S(2, 'soy', { after: 'cover', cover: true }), S(3, 'corn', { after: 'cover', cover: true })] };
  const earlier = { id: 'e1', name: 'Sow earlier', kind: 'proposed', score: 69, seasons: [S(1, 'corn', { variety: 'shorter' }), S(2, 'soy'), S(3, 'corn', { variety: 'shorter' })] };
  const KEEPALL = { ok: true, current: two, recommended: two, others: [cover, cover2, earlier], reason: 'Nothing we tested does clearly better here.', evidence: [], gaps: [], risks: [] };
  const labels = optionLabels(KEEPALL);
  same('options are named by what they change', [labels.get(two), labels.get(cover), labels.get(cover2), labels.get(earlier)], ['Corn, then soybeans', 'Corn, then soybeans, with rye as a cover crop after harvest', 'Corn, then soybeans, with a cover crop after harvest', 'Corn, then soybeans, with a shorter variety']);
  check('no two options share a label', new Set([...labels.values()]).size === labels.size);
  const twin = optionLabels({ ...KEEPALL, others: [cover2, { ...cover2, id: 'c3' }] }); check('two plans that cannot be told apart get a number, never the same name', [...twin.values()].some(l => /option 2\)$/.test(l)) && new Set([...twin.values()]).size === twin.size);
  same('every plan once: keep means the suggestion and today are one plan', everyPlan(KEEPALL).map(p => p.id), ['now', 'c1', 'c2', 'e1']);
  const html = optionsHTML(KEEPALL, 'now');
  check('the strategies tab has one card for each plan, the first three being now, a worth-a-look option and another, no two cards alike', (html.match(/class="card act ocard/g) ?? []).length === 4 && /What you grow now, our suggestion/.test(html) && /An option worth a look/.test(html) && /Another option/.test(html) && (() => { const grid = html.slice(html.indexOf('class="grid opts"'), html.indexOf('id="sdetail"')), names = [...grid.matchAll(/<h3>([^<]*)<\/h3>[^]*?<span class="oc-change">([^<]*)<\/span>/g)].map(m => `${m[1]} | ${m[2]}`); return names.length === 4 && new Set(names).size === names.length; })(), brief((html.match(/<h3>[^<]*<\/h3>/g) ?? []).join('|')));
  check('the card says how often the rotation repeats', /repeats every 2 years/.test(html));
  const ov = overviewHTML(KEEPALL, { state: STATE }); check('the Overview says Keep with the cycle, and how often it repeats', /Keep Corn, then soybeans/.test(ov) && !/then Corn/.test(ov) && /Repeats every 2 years/.test(ov));
  const fp = farmPlans(KEEPALL, 'c2'); same('My farm gets the same names, and the engine\'s own ids', [fp.current.name, fp.proposed.name, fp.current.id, fp.proposed.id], ['Corn, then soybeans', 'Corn, then soybeans, with a cover crop after harvest', 'now', 'c2']);
  check('a different cycle is named by its crops (the cover crop is added when today has none)', optionLabel({ id: 'w', seasons: [S(1, 'corn', { cover: 'rye' }), S(2, 'soy', { cover: 'rye' }), S(3, 'wheat', { cover: 'rye' })] }, KEEPALL) === 'Corn, then soybeans, then winter wheat, with rye as a cover crop after harvest' || /^Corn, then soybeans, then /.test(optionLabel({ id: 'w', seasons: [S(1, 'corn'), S(2, 'soy'), S(3, 'wheat')] }, KEEPALL)));
}

// ---- fit: no number on a plan that does not suit the place; a borderline plan keeps its number and says to ask farmers; the engine's refusal is shown alone
{
  const S = (year, crop) => ({ year, crop, sow: '2027-05-01', harvest: '2027-10-01', after: 'residue' });
  const cur = { id: 'now', name: 'Today', kind: 'current', score: 70, flag: 'holds', scores: { water: 70, soil: 70, erosion: 70, income: 70, weather: 70 }, seasons: [S(1, 'corn'), S(2, 'soy')] };
  const rice = { id: 'rice', name: 'Rice', kind: 'proposed', score: 88, flag: 'fails', scores: { water: 10, soil: 80, erosion: 80, income: 90, weather: 50 }, fit: { why: 'It needs more water than this place has.' }, seasons: [S(1, 'rice')] };
  const oats = { id: 'oats', name: 'Oats', kind: 'proposed', score: 61, flag: 'borderline', scores: { water: 60, soil: 60, erosion: 60, income: 60, weather: 60 }, seasons: [S(1, 'oat')] };
  const R = { ok: true, current: cur, recommended: cur, others: [rice, oats], reason: 'Nothing we tested does clearly better here.', evidence: [], gaps: [], risks: [] };
  const html = optionsHTML(R, 'now'), card = id => { const a = html.indexOf(`data-plan="${id}"`); return html.slice(a, html.indexOf('</button>', a)); };
  check('a plan that does not suit has NO score number or ring, and says why in words', !/rv-ring/.test(card('rice')) && !/>88</.test(card('rice')) && /Does not suit this place\. It needs more water than this place has\./.test(card('rice')), card('rice').slice(0, 300));
  check('a plan with no reason from the engine still says it does not suit, in Crophalo\'s words', /Does not suit this place\. Crophalo’s own crop check says it cannot be grown here with this water\./.test(fitNote({ flag: 'fails' })));
  check('a borderline plan keeps its number and says "Only just suits: ask farmers near you."', /rv-ring/.test(card('oats')) && />61</.test(card('oats')) && /Only just suits: ask farmers near you\./.test(card('oats')));
  check('a plan that holds up says nothing extra and keeps its number', fitNote(cur) === '' && hasScore(cur) && !hasScore(rice) && hasScore(oats));
  const detail = optionsHTML(R, 'rice'); check('the detail of a plan that does not suit shows no score bars and no number, and the reason', !/rv-bars|Worse|Better/.test(detail.slice(detail.indexOf('id="sdetail"'), detail.indexOf('<div class="folds">'))) && /Does not suit this place/.test(detail.slice(detail.indexOf('id="sdetail"'))));
  const fold = html.slice(html.indexOf('id="howScores"')), row = fold.slice(fold.indexOf('Rice'), fold.indexOf('</tr>', fold.indexOf('Rice'))); check('the scores table leaves a failing plan\'s cells empty', !/\d/.test(row.replace(/<[^>]*>/g, '').replace('Rice', '')), row.replace(/<[^>]*>/g, ' '));
  check('a plan that does not suit is never offered as an option worth trying or sent to My Farm by default', proposedPlan({ ...R, others: [rice] }).plan.id !== 'rice' && !betterOptions(R).some(p => p.id === 'rice'));
  // the engine refuses the place: one plain sentence, no plan, no score
  const refused = await getOptions({}, {}, {}, async () => ({ optionsFor: () => ({ refused: true, reason: 'Crophalo cannot judge field crops here: the growing season is too short.', current: null, recommended: null }) }));
  same('a refusal becomes the engine\'s own sentence, marked refused, and nothing else', refused, { ok: false, refused: true, reason: 'Crophalo cannot judge field crops here: the growing season is too short.' });
  const alt = await getOptions({}, {}, {}, async () => ({ optionsFor: () => ({ refusal: 'There is not enough water here for field crops.' }) })); same('a plain refusal field works too', alt.reason, 'There is not enough water here for field crops.');
  const shown = optionsHTML(refused, null), ov2 = overviewHTML(refused, { state: STATE });
  check('the Options and Overview show only that sentence: no plan, no score, no cards, no suggestion', shown.includes('too short') && !/ocard|rv-ring|Our suggestion|class="grid opts"/.test(shown) && ov2.includes('too short') && !/rv-ring|Keep |Try |Our suggestion/.test(ov2), ov2.slice(0, 200));
}


// ---- Compare strategies, the challenge's spec: three first, five sections, the dimensions, stand-in engine fields and their fallbacks
{
  const st = strategies(RESULT);
  same('suggestion differs from today: the three are now, the suggestion, another; the rest follow', [st.first.map(p => p.id), st.roles.get(st.first[1]), st.roles.get(st.first[2]), st.more.length], [['now', 'wheat', 'other'], 'suggest', 'another', 0]);
  same('keeping what you grow now: the second card is the best other option, tagged as worth a look', [strategies({ ...RESULT, recommended: now, others: [wheat, other] }).roles.get(wheat), strategies({ ...RESULT, recommended: now, others: [wheat, other] }).first[1].id], ['worth', 'wheat']);
  const bad = { ...other, id: 'rice', flag: 'fails' }, two = strategies({ ...RESULT, others: [bad] });
  check('a plan that does not suit never takes one of the three places, and the few says why in one sentence', two.first.length === 2 && two.more.length === 1 && /Only 2 strategies are shown: 1 other rotation does not suit this place \(listed below\)\./.test(two.fewWhy), two.fewWhy);
  check('the engine\'s own fewWhy is used when it gives one', strategies({ ...RESULT, others: [], fewWhy: 'Only two crops pass the Ontario list here.' }).fewWhy === 'Only two crops pass the Ontario list here.');
  check('the page says Compare strategies, with the support line once at the top and again in the detail', /<h2 id="opTitle">Compare strategies<\/h2>/.test(op) && (op.match(/Crophalo supports your judgment\. It does not replace it, or local advice\./g) ?? []).length === 2 && /Crophalo supports your judgment/.test(overviewHTML(RESULT, { state: STATE })));
  // stand-in engine fields
  const rich = { ...wheat, whyLines: ['Winter wheat keeps living roots on the field after soybeans.', 'It breaks the corn and soybean pest cycle.'], benefits: [{ kind: 'soil', text: 'Living roots through winter hold the soil.' }, { kind: 'pest', text: 'A different crop family breaks pest cycles.' }], review: ['Check the sowing window with your adviser.'], facets: { nitrogen: { score: 55, text: 'Soybeans leave some nitrogen.' }, organic: { score: 72, text: '' }, pest: { score: 80, text: 'Three crop families in three years.' }, forage: { score: null, text: '' }, market: { score: null, text: 'Local prices not read yet.' }, waterUse: { score: 66, text: '' }, infiltration: { score: null, text: '' } }, bareMonths: [11, 12, 1, 2], pest: 80 };
  const R2 = { ...RESULT, recommended: rich, others: [other], current: { ...now, bareMonths: 5, facets: { pest: { score: 40, text: '' } } } };
  const d = optionDetailHTML(rich, R2);
  check('benefits and review from the engine are used, with their kind, and replace the fallbacks', /<span class="chip">Soil<\/span> Living roots/.test(d) && /<span class="chip">Pests<\/span>/.test(d) && d.includes('Check the sowing window with your adviser.') && !d.includes('A late soybean harvest squeezes the wheat sowing window.'));
  check('with no benefits field the why lines are the benefits; with no review field the risks are used', (() => { const lines = optionDetailHTML({ ...wheat, whyLines: ['One reason.'] }, RESULT), nob = optionDetailHTML(wheat, RESULT); return /What benefits it may offer<\/h4><ul><li>One reason\./.test(lines) && nob.includes('A late soybean harvest squeezes the wheat sowing window.') && /Benefits have not been worked out/.test(nob); })());
  check('each evidence line names its dataset beside its "i"', (() => { const h = optionDetailHTML(wheat, RESULT); return (h.match(/Dataset: [^<]*NASA POWER/g) ?? []).length >= 1; })());
  const cmp = compareHTML(R2);
  check('the compare table uses facets where given, words as well as numbers, and a dash where one plan has nothing; a row with nothing for any plan is left out', /Breaking pest cycles<\/th><td[^>]*><b>40<\/b> <span class="cap">Weak/.test(cmp) && />80<\/b> \(\+40\) <span class="cap">Strong/.test(cmp) && !/not worked out/i.test(cmp), cmp.slice(cmp.indexOf('Breaking'), cmp.indexOf('Breaking') + 200));
  check('months of bare soil: fewer is the better direction, shown as a count with the months named', /Months of bare soil<\/th><td><b>5<\/b> months<\/td><td class="diff up"><b>4<\/b> months \(−1\)<br><span class="cap">Nov, Dec, Jan, Feb<\/span>/.test(cmp), cmp.slice(cmp.indexOf('Months of bare')));
  check('a plan that does not suit is "not scored", never a number', DIMENSIONS.every(dm => dimensionOf({ ...other, flag: 'fails', score: 88, scores: { water: 90, soil: 90, erosion: 90, income: 90, weather: 90 } }, dm).n === null && /not scored/.test(dimensionOf({ ...other, flag: 'fails' }, dm).words)));
  const ovr = overviewHTML({ ...R2, exposure: [{ month: 7, hazard: 'heat at flowering', crop: 'corn', stage: 'flowering', count: 6, source: 'power' }], sureWhy: 'The weather record is long, the soil is assumed.' }, { state: STATE });
  check('Overview: months of bare soil for each plan, and when the current crops are most exposed, from the engine\'s rows', /Months your soil is bare/.test(ovr) && /What you grow now:<\/b> 5 months/.test(ovr) && /Suggested:<\/b> 4 months, November, December, January, February/.test(ovr) && /When your current crops are most exposed/.test(ovr) && /Corn, flowering: heat at flowering in July, in 6 of the tested years/.test(ovr) && /The weather record is long, the soil is assumed\./.test(ovr), ovr.slice(ovr.indexOf('ovBare')));
  const none = overviewHTML(RESULT, { state: STATE });
  check('Overview with no bare-months or exposure data says so plainly and points to where the counts are', /Not worked out as a count here yet\. The Calendar tab/.test(none) && /Not worked out here yet\. The land history counts/.test(none));
  check('words from the engine in the new fields are plain text', !/<img|<script/.test(optionDetailHTML({ ...wheat, benefits: [{ kind: 'soil', text: '<img src=x>' }], review: ['<script>x</script>'], whyLines: ['<b>x</b>'] }, RESULT)) && !/<script/.test(overviewHTML({ ...RESULT, exposure: [{ month: 7, hazard: '<script>x</script>', crop: 'corn', count: 1 }] }, { state: STATE })));
}
{ // the soil moisture card's reason in a farmer's words, and the ground-heat card drawn again after each of its asks
  const said = async reason => (await loadSmap({ lat: 43.13, lon: -80.75 }, async () => ({ json: async () => ({ ok: false, reason }) }))).why;
  same('soil moisture: a refusal never shows a program path, a program name or a status code', await Promise.all(['Python environment not found: /srv/crophalo/.venv/bin/python', 'Earthdata login failed', 'status 502 from the upstream', 'Traceback (most recent call last)'].map(said)), [NOT_HERE, NASA_OFF, 'The soil moisture lookup did not answer. The rest of the report does not need it.', 'The soil moisture lookup did not answer. The rest of the report does not need it.']);
  same('soil moisture: a short plain reason still comes through', await said('No SMAP value for this square yet.'), 'No SMAP value for this square yet.');
  const EY = 2026;   // the year of the hand-made ground-heat passes below: the dates are written from it
  const pass = (date, c) => ({ date, solar_date: date, solar_time: '13:00', day_night: 'day', lst_c: c });
  const part = { ok: true, passes: [pass(`${EY}-11-01`, 30)], coverage: { found: 2, examined: 1, back_to: `${EY}-11-01`, kept: 0, newly_read: 1, complete: false } };
  const whole = { ok: true, passes: [pass(`${EY}-11-01`, 30), pass(`${EY}-10-01`, 46)], coverage: { found: 2, examined: 2, back_to: `${EY}-10-01`, kept: 1, newly_read: 1, complete: true } };
  const was = globalThis.fetch, seq = [part, whole]; let asks = 0; globalThis.fetch = async () => ({ json: async () => seq[Math.min(asks++, 1)] });
  try {
    forgetAll(); const where = { lat: 12.3456, lon: 45.6789 }, seen = [];
    const last = await getEco(where, e => seen.push(e));
    check('ground heat: the lookup asks again by itself and the card is told each answer, the last one complete', asks === 2 && seen.length === 2 && seen[0].again?.n === 2 && seen[1].coverage.complete === true && last === seen[1], JSON.stringify([asks, seen.length]));
    const later = []; const again = await getEco(where, e => later.push(e));
    check('ground heat: a card opened later gets the newest answer at once, with no new ask', asks === 2 && later.length === 1 && later[0].coverage.complete === true && again.coverage.complete === true, JSON.stringify([asks, later.length]));
    forgetAll(); asks = 0; globalThis.fetch = async () => { asks++; return { json: async () => part }; };
    const stuck = { lat: 23.4567, lon: 56.789 }, gave = await getEco(stuck), before = asks, reopened = await getEco(stuck);
    check('ground heat: a year left unfinished after three asks is not kept, so opening the report again asks again', gave.gaveUp === true && before === 3 && asks === 6 && reopened.gaveUp === true, JSON.stringify([before, asks]));
    forgetAll(); asks = 0; globalThis.fetch = async () => { asks++; return { json: async () => ({ ok: false, reason: 'Python environment not found (.venv)' }) }; };
    const no = await getEco({ lat: 1.5, lon: 2.5 });
    check('ground heat: a refusal is asked once and said in a farmer\'s words', asks === 1 && no.ok === false && no.reason === NOT_HERE, JSON.stringify([asks, no.reason]));
  } finally { globalThis.fetch = was; forgetAll(); }
}
// The one page (js/letter-view.js) keeps the rule of the tabbed report: when what is grown now does not suit here (no score) and the answer keeps it, the page says so and never "Keep ...".
{
  const { answerHTML, strategyRowHTML } = await import('../js/letter-view.js');
  const { NO_FIT_WORDS } = await import('../js/report-view.js');
  const bad = { ...now, flag: 'fails', score: null, fit: 'Doesn’t suit here' }, noFit = { ...RESULT, current: bad, recommended: bad, others: [wheat, other], reason: 'It needs more water than this place has. Ask farmers near you.' };
  const page = answerHTML(noFit, {}), row = strategyRowHTML(bad, noFit, null);
  check('one page: what you grow now does not suit here: the answer says so, never "Keep"', page.includes(esc0(NO_FIT_WORDS)) && !/>Keep /.test(page) && !/suits this field well/.test(page) && /It needs more water than this place has\./.test(page));
  check('one page: that plan shows no number, only "Does not suit here"', /Does not suit here/.test(page) && !/rv-num/.test(page));
  check('one page: its row is not tagged as our suggestion', !/Our suggestion/.test(row) && /What you grow now/.test(row));
  const fine = answerHTML({ ...RESULT, recommended: now }, {});
  check('one page: a plan that suits and is kept still reads "Keep"', /Keep /.test(fine) && !fine.includes(esc0(NO_FIT_WORDS)));
}
// The one page reads the ground temperature from the cleaned ECOSTRESS answer (js/satellites2-data.js cleanEco names it c), so the line under Show more shows in the farmer's units.
{
  const SY = 2026;   // the year of the hand-made satellite answers' days below (stand-in days, written from it)
  const { satelliteFacts } = await import('../js/letter-facts.js');
  const { cleanEco } = await import('../js/satellites2-data.js');
  const eco = cleanEco({ ok: true, passes: [{ date: `${SY}-11-10`, utc: '15:00', solar_time: '13:12:00', solar_date: `${SY}-11-10`, day_night: 'day', lst_c: 21, lst_k: 294.15, error_k: 1.5, orbit: 1, version: '002', granule: 'g' }], passes_checked: 9, not_usable: { cloud: 4 }, newest_clear: `${SY}-11-10`, window: { first: `${SY}-09-20`, last: `${SY}-11-14` }, pixel_m: 70 });
  check('one page: the ground temperature of a cleaned ECOSTRESS answer shows under Show more, in the farmer\'s units', /id="lfSatMore"[^]*Ground temperature from space: 70 °F, 10 Nov/.test(satelliteFacts({ eco }, { temp: 'F' }).body) && /21 °C/.test(satelliteFacts({ eco }, { temp: 'C' }).body));
}
// The one page's fold "What NASA satellites see": the satellite cards (js/satcard.js) sit inside it after the plain lines and before its Show more, each its own closed line, never a card folded twice.
{
  const SY = 2026;   // as above
  const { satelliteFacts } = await import('../js/letter-facts.js');
  const { rainCardHTML, moistureCardHTML } = await import('../js/satellites-view.js');
  const { graceCardHTML, hlsCardHTML, ecoCardHTML } = await import('../js/satellites2-view.js');
  const reading = { value: 0.31, date: `${SY}-11-12`, label: 'Moisture around the roots', km: 9, lat: 43.1, lon: -80.7, source: 'smap' };
  const { cleanEco } = await import('../js/satellites2-data.js');
  const eco = cleanEco({ ok: true, passes: [{ date: `${SY}-11-10`, utc: '15:00', solar_time: '13:12:00', solar_date: `${SY}-11-10`, day_night: 'day', lst_c: 21, lst_k: 294.15, error_k: 1.5, orbit: 1, version: '002', granule: 'g' }], passes_checked: 9, not_usable: { cloud: 4 }, newest_clear: `${SY}-11-10`, window: { first: `${SY}-09-20`, last: `${SY}-11-14` }, pixel_m: 70 });
  const cards = `${rainCardHTML({ ok: false, reason: 'NASA did not let this login read the rain files.' })}${moistureCardHTML(reading)}${graceCardHTML({ loading: true })}${hlsCardHTML({ loading: true })}${ecoCardHTML(eco)}`;
  const sf = satelliteFacts({ reading, imerg: { ok: false }, hls: { loading: true }, grace: { loading: true }, eco }, { temp: 'C', rain: 'mm' }, { cards }), b = sf.body;
  check('one page: the satellite fold holds the five cards, each one closed line with its own summary', (b.match(/<details class="fold sat-fold"/g) ?? []).length === 5 && (b.match(/<summary><h3 class="sat-name">/g) ?? []).length === 5);
  check('one page: the cards come after the plain lines and before the fold\'s Show more', b.indexOf('Water in the top soil') < b.indexOf('lf-satcards') && b.indexOf('lf-satcards') < b.indexOf('id="lfSatMore"'));
  check('one page: no card is folded inside another card, and a card that could not be read is said once, by the card', !/sat-fold"[^]*?<details class="fold sat-fold"[^]*?<\/details><\/article>[^]*?<\/details><\/article>/.test(cards.slice(0, cards.indexOf('</article>'))) && !b.includes('The satellite rain did not answer.') && !/not read yet/i.test(b));
  const plain = satelliteFacts({ reading, imerg: { ok: false } }, {});
  check('one page: without cards the fold keeps its plain lines and says what is missing', plain.body.includes('The satellite rain did not answer.') && !plain.body.includes('lf-satcards'));
  const src = fs.readFileSync(new URL('../js/report.js', import.meta.url), 'utf8');
  check('one page: the report draws the five cards into that fold', /satelliteFacts\([^)]*\}, u, \{ cards(: localiseText\(cards, u\))? \}\)/.test(src) && ['rainCardHTML(cur.imerg)', 'graceCardHTML(cur.grace)', 'hlsCardHTML(cur.hls)', 'ecoCardHTML(cur.eco)', 'moistureCardHTML('].every(x => src.includes(x)));
}
// The report's crop-map loader reads the country's national lists beside the kept crop-map answer (js/near-load.js nearbyFrom), so a crop the country hardly grows is not offered.
{
  const { getNearby } = await import('../js/report-load.js');
  const was = globalThis.fetch, asked = [];
  globalThis.fetch = async url => { asked.push(String(url)); return { json: async () => (/faostat/.test(url) ? { ok: true, countries: {} } : { ok: false, reason: 'stand-in' }) }; };
  try { forgetAll(); await getNearby({ lat: 41.1795, lon: -96.4398, cc: 'US' }); check('the report\'s crop-map loader asks the national lists and the crop map once each', asked.filter(u => u.startsWith('/api/faostat')).length === 1 && asked.filter(u => u.startsWith('/api/cropsnear')).length === 1, asked.join(' '));
  } finally { globalThis.fetch = was; forgetAll(); }
}
// Compare strategies says what the ranking used: the goals the farmer ticked in the setup's last step (state.goals), and nothing when none was ticked.
{
  const { compareBlockHTML, goalsLine } = await import('../js/letter-view.js');
  same('one page: no goal ticked, no "Ranked for" line', [goalsLine([]), goalsLine(undefined), goalsLine(['zzz'])], ['', '', '']);
  same('one page: one goal is named in the farmer\'s words', goalsLine(['nitrogen']), 'Ranked for what matters most to you: less fertiliser to buy.');
  same('one page: the goals are named in the setup\'s order', goalsLine(['market', 'forage', 'nitrogen']), 'Ranked for what matters most to you: feed for your animals, less fertiliser to buy and selling what you already sell.');
  const withGoal = compareBlockHTML(RESULT, { state: { goals: ['forage'] } }), none = compareBlockHTML(RESULT, { state: { goals: [], prio: [5, 1, 1, 1, 1] } });
  check('one page: the line stands under the heading Compare strategies', /<h2 id="bkCompare">Compare strategies<\/h2><p class="lead">Ranked for what matters most to you: feed for your animals\.<\/p>/.test(withGoal));
  check('one page: with no goal the block has no ranking line, whatever the weights', !/Ranked for/.test(none) && !/class="lead"/.test(none));
}
// Every strategy of the demo fields, opened: each of the five parts holds real lines, and no part says it has nothing yet ("listed yet").
// The engine runs on the recorded NASA POWER answers of Mead and Beltsville (no crop map in this check); a part with nothing in it is not drawn at all.
{
  const fsr = await import('node:fs'), { buildSeries } = await import('../js/data.js'), { computeClimate } = await import('../js/climate.js'), { optionsFor } = await import('../js/engine.js');
  const { newState } = await import('../js/state.js'), { readyAnswers } = await import('../js/steps.js'), { strategyRowHTML } = await import('../js/letter-view.js'), { strategies: firstOf } = await import('../js/report-view.js');
  const regions = JSON.parse(fsr.readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8'));
  const PARTS = ['Why it was suggested', 'What evidence supports it', 'What benefits it may offer', 'Where information is missing', 'Risks to check locally'];
  for (const [id, file] of [['mead-field', 'power_mead.json'], ['beltsville-field', 'power_beltsville.json']]) {
    const r = regions.find(x => x.id === id), ans = JSON.parse(fsr.readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'));
    const S = buildSeries(ans, { lat: r.lat, lon: r.lon }), C = computeClimate(S, S.lat, { today: '2026-11-14' });
    const base = { ...newState(), loc: { lat: r.lat, lon: r.lon, label: r.country, cc: 'US' } }, st = { ...base, ...readyAnswers(base, r) };
    const res = optionsFor(st, C, { lat: r.lat, lon: r.lon, country: 'US' }, { today: '2026-11-14' }), rows = firstOf(res).first;
    same(`one page, ${id}: three strategies to compare`, rows.length, 3);
    const html = rows.map(p => strategyRowHTML(p, res, null));
    check(`one page, ${id}: no opened strategy says a part is "listed yet"`, html.every(h => !/listed yet|gave no reason/i.test(h)));
    { const all = html.join(' ').replace(/<[^>]+>/g, ' ') + ' ' + JSON.stringify([res.evidence, res.risks, res.gaps, res.reason]);   // a field in the United States: no sentence names Ontario as if it were local (a guide cited by its own title, such as OMAFRA Publication 811, is a named reference)
      check(`one page, ${id}: no sentence of a United States field names Ontario`, !/Ontario/.test(all), (all.match(/[^.(]*Ontario[^.)]*/g) ?? []).slice(0, 3).join(' | '));
      check(`one page, ${id}: the frost date is said as NASA's own, not checked near the field`, /NASA’s own and was not checked against weather stations near your field/.test(all));
      check(`one page, ${id}: wash-off is cited to the United States soil service`, !/may take less of it/.test(all) || /may take less of it \(USDA NRCS, soil health principles\)/.test(all)); }
    check(`one page, ${id}: every strategy holds all five parts, each with a real line`, html.every(h => PARTS.every(t => new RegExp(`<h3>${t}</h3><ul><li>[^<]{8,}`).test(h))), html.map(h => PARTS.filter(t => !h.includes(`<h3>${t}</h3><ul>`))));
  }
  { const { erosionCite } = await import('../js/words.compare.js'), { autumnWords } = await import('../js/climate.js');
    same('wash-off source by country: Canada keeps Ontario\'s guide, elsewhere it is said as a general guide', [erosionCite('CA'), erosionCite('TR')], ['Government of Ontario, Soil erosion: causes and effects', 'a general guide to soil erosion, Government of Ontario']);
    check('the frost check keeps naming Ontario for a field in Canada', /in Ontario, it came about \d+ days late/.test(autumnWords(0, 'power', 'CA')) && /in Ontario/.test(autumnWords(0, 'power')) && !/Ontario/.test(autumnWords(0, 'power', 'TR'))); }
  const bare = { ...RESULT.others[0], evidence: [], benefits: [], gaps: [], review: [], whyLines: [], why: 'A short reason for this plan.' };
  const row = strategyRowHTML(bare, { ...RESULT, others: [bare, ...RESULT.others.slice(1)] }, null);
  check('one page: a part with nothing in it is not drawn, and no row says it has nothing', !/What evidence supports it|Where information is missing|Risks to check locally|listed yet/.test(row) && /Why it was suggested/.test(row), row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300));
}
console.log(`report: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
