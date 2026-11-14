// Crophalo's report suite: the markup of the Overview and Options from the engine's answer, the "i" with its sources, the honest "not read yet" state when
// there is no engine, and the joins that never invent a plan. The fixture below is made for these checks only: no screen ever shows it.
// RULE: never loosen a check to make it pass; fix the project. No page and no internet are needed. Run: node scripts/test_report.mjs
import { overviewHTML, optionsHTML, laterHTML, loadingHTML, infoButton, sourcePopHTML, sourceNotes, assumptions, estimatedArea, coverLines, windowLines, barsHTML, scoresFoldHTML, optionDetailHTML, sureHTML, planName, allPlans, TABS, WILL_HOLD, NOT_READ, dayWords } from '../js/report-view.js';
import { getOptions, addToFarm } from '../js/joins.js';
import { MORE, ALL_SOURCES } from '../js/sources.more.js';
import { newState } from '../js/state.js';
import { SOURCES } from '../js/sources.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

// a fixture shaped like the contract's answer, for these checks only
const now = { id: 'now', name: 'Now', kind: 'current', seasons: [{ year: 1, crop: 'corn', sow: '2027-05-01', harvest: '2027-10-05', after: 'residue', residueUntil: '2027-12-01', window: null }, { year: 2, crop: 'soy', sow: '2028-05-20', harvest: '2028-10-01', after: 'residue', residueUntil: '2028-12-01', window: null }, { year: 3, crop: 'corn', sow: '2029-05-01', harvest: '2029-10-05', after: 'residue', residueUntil: null, window: null }], score: 62, scores: { water: 60, soil: 55, erosion: 40, income: 80, weather: 70 } };
const wheat = { id: 'wheat', name: 'With winter wheat', kind: 'proposed', seasons: [now.seasons[0], now.seasons[1], { year: 3, crop: 'wheat', sow: '2028-10-05', harvest: '2029-07-25', after: 'cover', residueUntil: null, window: { earliest: '2028-09-25', latest: '2028-10-15' } }], score: 71, scores: { water: 65, soil: 75, erosion: 78, income: 70, weather: 68 } };
const other = { id: 'other', name: 'Barley', kind: 'proposed', seasons: [{ year: 1, crop: 'barley', sow: '2027-04-20', harvest: '2027-08-01', after: 'bare', residueUntil: null, window: null }] };
const RESULT = { ok: true, current: now, recommended: wheat, others: [other], reason: 'Winter wheat keeps living roots on the field after soybeans, when rain would otherwise move bare soil.', evidence: [{ text: 'No stress thresholds crossed in 26 tested years.', sources: ['power', 'gpm'] }, { text: 'Sowing dates follow the crop guide and your field’s frost record.', sources: ['fao56', 'power'] }], gaps: ['Soil is assumed, not measured.', 'Confirm your own sowing dates.'], risks: ['A late soybean harvest squeezes the wheat sowing window.'], sureness: 'Somewhat sure' };
const STATE = { ...newState(), loc: { lat: 44.4, lon: -79.78, label: 'Barrie, Ontario', cc: 'CA' }, name: 'Barrie & Simcoe County', soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...newState().farm, irrigation: 'none' } };

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
check('there is an "i" beside the suggestion that opens its sources', /class="srci nasa"[^>]*data-src="power gpm fao56"/.test(ov));
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

// ---- the "i"
same('NASA is listed first', sourceNotes(['fao56', 'power', 'rules']).map(n => n.key), ['power', 'fao56', 'rules']);
same('an unknown key is left out and a key counts once', sourceNotes(['power', 'power', 'nope', '__proto__']).map(n => n.key), ['power']);
const i = infoButton(['power'], 'Frost dates');
check('the button is a real button with a name, the NASA shape and its sources', /^<button type="button" class="srci nasa" data-src="power"/.test(i) && /aria-label="Where this comes from \(from NASA\): NASA POWER"/.test(i) && /aria-haspopup="dialog"/.test(i) && /aria-expanded="false"/.test(i));
check('a non-NASA source gets the outlined shape', !/srci nasa/.test(infoButton(['fao56'])) && /srci/.test(infoButton(['fao56'])));
same('no sources, no button', infoButton([]), '');
const pop = sourcePopHTML(['fao56', 'power'], 'Newest day: 6 November 2026');
check('the card has the NASA tag first, "For this figure", each source with who runs it, and a link that opens in a new tab', pop.indexOf('NASA</span>') < pop.indexOf('FAO') && pop.includes('For this figure') && pop.includes('Run by NASA Langley Research Center') && /<a href="https:\/\/power\.larc\.nasa\.gov\/"[^>]*target="_blank" rel="noopener noreferrer"/.test(pop) && pop.includes('opens in a new tab'));
check('every source note has every field, and https links', Object.entries(ALL_SOURCES).every(([k, n]) => ['org', 'name', 'who', 'what', 'talk', 'url'].every(f => typeof n[f] === 'string' && n[f]) && typeof n.nasa === 'boolean' && n.url.startsWith('https://')));
check('the new notes do not overwrite the weather ones', Object.keys(MORE).every(k => !(k in SOURCES)));
check('NASA notes are marked NASA', MORE.smap.nasa === true && MORE.rules.nasa === false);

// ---- the other tabs and the loading screen
same('seven tabs, in order', TABS.map(t => t.id), ['overview', 'options', 'weather', 'calendar', 'field', 'satellites', 'notes']);
check('each of the five later tabs says plainly it is not built and what it will hold', ['weather', 'calendar', 'field', 'satellites', 'notes'].every(id => laterHTML(id).includes('Not built yet.') && laterHTML(id).includes(WILL_HOLD[id])));
const rows = [{ key: 'power', label: 'Weather · NASA POWER', state: 'ok', reason: '' }, { key: 'forecast', label: 'Forecast', state: 'fail', reason: 'The service took too long to answer.' }, { key: 'x', label: 'Hidden', state: 'skip' }];
const ld = loadingHTML(rows);
check('the loading screen says what is happening and counts the answers', ld.includes('Building your full report') && ld.includes('1 of 2 sources answered') && !ld.includes('Hidden'));
check('a source that failed says why, and each row has its "i"', ld.includes('The service took too long to answer.') && (ld.match(/class="srci/g) ?? []).length >= 1);
check('the loading screen is marked busy until all answered', /aria-busy="true"/.test(ld) && /aria-busy="false"/.test(loadingHTML([{ key: 'power', label: 'a', state: 'ok' }])));

// ---- assumptions and the estimated outline
const sq = estimatedArea({ lat: 44.4, lon: -79.78 });
check('an estimated outline is a 10 ha square round the pin, marked estimated', sq.estimated === true && sq.ha === 10 && sq.pts.length === 4 && sq.pts.every(p => p.every(Number.isFinite)));
check('the pin is inside it, and its side is about 316 m', (() => { const [a, b, c] = sq.pts; const dLat = (c[0] - a[0]) * 111320, dLon = (b[1] - a[1]) * 111320 * Math.cos(44.4 * Math.PI / 180); return a[0] < 44.4 && c[0] > 44.4 && a[1] < -79.78 && b[1] > -79.78 && Math.abs(dLat - 316) < 12 && Math.abs(dLon - 316) < 12; })());
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
const seen = []; const added = await addToFarm({ place: { lat: 1 }, current: now, proposed: wheat }, async () => ({ addFromReport: p => { seen.push(p); return { farmId: 'f1', fieldId: '44.4000,-79.7800' }; } }));
check('My Farm is handed the payload and answers with the field', added.ok && added.fieldId === '44.4000,-79.7800' && seen[0].proposed.id === 'wheat');
check('My Farm answering nothing is a plain failure', (await addToFarm({}, async () => ({ addFromReport: () => null }))).ok === false);
same('dates in words', [dayWords('2028-10-05'), dayWords('x')], ['5 Oct 2028', '']);

console.log(`report: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
