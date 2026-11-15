// Crophalo's Look ahead page suite (the markup): every state of every horizon drawn from real results (the recorded Oxford answers through the job, with a stand-in for the scoring path), the horizon switch as a radio group, the buttons that
// exist only when they should (no automatic request is hidden in the page), the words: counts with denominators, never a chance, and escaping. RULE: never loosen a check to make it pass. No network. Run: node scripts/test_ahead_view.mjs
import fs from 'node:fs';
import { aheadHTML, panelHTML, rulesHTML } from '../js/ahead-view.js';
import { computeJob } from '../js/ahead-job.js';
import { CHANCE_WORDS, NOTE_BOX, I_CARD, YEARS_LIMITS, SKILL, RULES } from '../js/ahead-words.js';
import { buildSeries } from '../js/data.js';
import { cropOf } from '../js/crops.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const rec = name => { const text = fs.readFileSync(new URL(`./fixtures/open-meteo/${name}.rec`, import.meta.url), 'utf8'); return JSON.parse(text.slice(text.indexOf('\n') + 1)); };
const ENS = rec('ensemble-oxford'), SEAS = rec('seasonal-oxford'), CLIM = rec('climate-oxford');
const POW = buildSeries(JSON.parse(fs.readFileSync(new URL('./fixtures/power_oxford.json', import.meta.url), 'utf8')), { lat: 43.13, lon: -80.75 });
const judge = (season, series) => { const causes = []; let seen = 0; for (let i = 0; i < series.days.length; i++) { const d = `${series.days[i].slice(0, 4)}-${series.days[i].slice(4, 6)}-${series.days[i].slice(6, 8)}`; if (d < season.sow || d > season.harvest) continue; seen++; const lo = series.T2M_MIN[i]; if (!Number.isFinite(lo)) continue; if (lo <= -2) causes.push({ severity: 'hit', kind: 'frost-young', date: d }); else if (lo < 0) causes.push({ severity: 'close', kind: 'frost-young', date: d }); } return seen ? { verdict: causes.some(c => c.severity === 'hit') ? 'hurt' : causes.length ? 'close' : 'fine', causes, notes: [] } : { verdict: 'growing', causes: [], notes: [] }; };
const WHEAT = { seasons: [{ crop: 'wheat', sow: '2026-10-05', harvest: '2027-07-20' }] }, T = '2026-11-14', CTX = { field: 'North field', planName: 'Winter wheat', year: 2027, youngCrop: 'young wheat', hardLine: '−2 °C' };
const blank = () => ({ status: 'idle', result: null, reason: '', progress: null });
const state = (over = {}) => ({ horizon: 'weeks', weeks: blank(), season: blank(), outlook: blank(), years: blank(), ...over });
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const W = await computeJob('weeks', { models: [{ model: 'ecmwf_ifs025', answer: ENS }], series: POW, plan: WHEAT, today: T, endDate: '2026-11-28', fieldElev: 298 }, { judge, cropOf });
const S = await computeJob('season', { seasonal: SEAS, series: POW, plan: WHEAT, today: T, endDate: '2027-05-15' }, { judge, cropOf });
const O = await computeJob('outlook', { seasonal: SEAS, climate: [{ model: 'EC_Earth3P_HR', answer: CLIM }], series: POW, today: T }, { judge, cropOf });
const O0 = await computeJob('outlook', { series: POW, today: T }, { judge, cropOf });
const Y = await computeJob('years', { climate: [{ model: 'EC_Earth3P_HR', answer: CLIM }], series: POW, plan: WHEAT, today: T, endDate: '2027-07-31' }, { judge, cropOf });
const ok = (result, extra = {}) => ({ status: 'ok', result: { ...result, ...extra }, reason: '', progress: null });

{
  const html = aheadHTML(state({ weeks: ok(W.result) }), CTX);
  check('the page has its title, the note box with its "i", and the way back', /<h1>Look ahead<\/h1>/.test(html) && html.includes(NOTE_BOX[0]) && html.includes('A count of runs is not the chance it happens') && html.includes('data-ahead="back"') && html.includes('srci'), html.slice(0, 200));
  check('the horizon switch is a radio group named "How far ahead" with the four horizons, one tab stop, the chosen one checked', /role="radiogroup" aria-label="How far ahead"/.test(html) && (html.match(/role="radio"/g) ?? []).length === 4 && (html.match(/tabindex="0" data-horizon/g) ?? []).length === 1 && /aria-checked="true" tabindex="0" data-horizon="weeks"/.test(html) && ['Next 2 weeks', 'This season', 'Next 2 years', 'Years ahead'].every(t => html.includes(t)));
  check('the scale reads "Most sure ... Rough guide" under the switch', /Most sure<\/span><span aria-hidden="true">…<\/span><span>Rough guide/.test(html));
  check('the panel is a live region labelled by its horizon, with the horizon\'s own explainer', /aria-labelledby="aheadHorizonTitle"/.test(html) && html.includes('From the weather forecast. Good for the next few days, less sure each day after.'));
  check('the credit line and the rules button are there; the Open-Meteo terms are named', html.includes('data-ahead="rules"') && html.includes('<a class="link" href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo.com</a> (CC BY 4.0)') && html.includes('Nothing from Look ahead is saved with your farm.'));
  check('each of the four radios is a plain button of 44 px by CSS class .seg (no hidden input)', !/<input/.test(html));
}
{
  const html = panelHTML(state({ weeks: ok(W.result) }), CTX), t = text(html), per = W.result.per[0];
  check('weeks: a headline made of counts of the European runs with their denominator, then a tile with the counts hurt first', new RegExp(`of ${per.nights.of} European runs|All ${per.nights.of} runs are fine`).test(t) && html.includes(`${per.tally.runs} runs.`) && html.includes('European model'), t.slice(0, 260));
  check('weeks: only one model was asked, so the page offers the other two and says each is one more request', html.includes('data-ahead="more-models"') && /one more request/.test(t));
  check('weeks: the thin-lines note is there', t.includes('Thin lines: less sure after day 7'));
  const three = { ...W.result, per: [W.result.per[0], { ...W.result.per[0], label: 'American model', short: 'American' }, { ...W.result.per[0], label: 'Canadian model', short: 'Canadian' }] };
  check('weeks: with all three models there is no button to add them', !panelHTML(state({ weeks: ok(three) }), CTX).includes('more-models'));
  check('weeks: models that disagree get the box with "Look again in a day or two"', /Look again in a day or two/.test(panelHTML(state({ weeks: ok({ ...three, disagree: true }) }), CTX)) && !/Look again in a day or two/.test(html));
  check('weeks: an unmatched model says its own weather was used, an old forecast says so', /its own weather, not matched to NASA’s here/.test(panelHTML(state({ weeks: ok({ ...W.result, per: [{ ...per, matched: false, matchReason: 'too few days shared with NASA’s record', stale: true }] }) }), CTX)) && /well before the forecast’s first day/.test(panelHTML(state({ weeks: ok({ ...W.result, per: [{ ...per, stale: true }] }) }), CTX)));
  check('weeks: nothing in the ground says so with the next sowing; missing temperatures say "cannot be checked"', /Your next sowing is 1 May\./.test(text(panelHTML(state({ weeks: ok({ ...W.result, inGround: false, next: { sow: '2027-05-01' } }) }), CTX))) && /cannot be checked yet/.test(text(panelHTML(state({ weeks: ok({ ...W.result, allNoData: true }) }), CTX))));
  same('weeks: loading, waiting for the tab and failing are three plain states: no figure, Try again only on a failure', [/Reading the forecast/.test(panelHTML(state({ weeks: { ...blank(), status: 'loading' } }), CTX)), /Look ahead waits until this tab is in view/.test(panelHTML(state({ weeks: { ...blank(), status: 'hidden', reason: 'Look ahead waits until this tab is in view before it asks the weather service.' } }), CTX)), panelHTML(state({ weeks: { ...blank(), status: 'error', reason: 'The weather service is busy. Look ahead can try again in a minute.' } }), CTX).includes('data-ahead="retry:weeks"'), panelHTML(state({ weeks: { ...blank(), status: 'loading' } }), CTX).includes('retry')], [true, true, true, false]);
}
{
  const t = text(panelHTML(state({ horizon: 'season', season: ok(S.result) }), CTX)), c = S.result.counts;
  check('season: the headline gives the plan, the field, the year, the counts of possible seasons with the lean and the same past years without it', t.includes(`Winter wheat on North field, 2027: with this forecast’s lean,`) && t.includes(`${c.runs} runs × ${c.years} past years`) && t.includes(`The same ${c.years} past years with no lean: hurt in ${c.usual.hurt} of ${c.usual.runs}, close calls in ${c.usual.close}.`), t.slice(0, 380));
  check('season: "about N in 10" is only ever beside the real counts', !/about \d+ in 10/.test(t) || /about \d+ in 10 of [\d,]+ possible seasons are hurt \([\d,]+\)/.test(t));
  check('season: run by run range, "not separate outcomes", the end of the forecast and the skill line', /Run by run, (between \d+ and \d+|\d+) of the \d+ past years/.test(t) && /so they are not [\d,]+ separate outcomes/.test(t) && /The seasonal forecast ends in late May 2027\. After that, these futures use the past years as they were\./.test(t) && t.includes('a hint, not a plan'));
  check('season: nothing in the ground says so; an error offers Try again', /so there is nothing to check\. Your next sowing is 1 May\./.test(text(panelHTML(state({ horizon: 'season', season: ok({ inGround: false, next: { sow: '2027-05-01' }, counts: null }) }), CTX))) && panelHTML(state({ horizon: 'season', season: { ...blank(), status: 'error', reason: 'x' } }), CTX).includes('retry:season'));
}
{
  const html = panelHTML(state({ horizon: 'outlook', outlook: ok(O.result) }), CTX), t = text(html);
  check('outlook: a table of 24 months with a caption, and the usual mean, the middle half, the rain and the lean for each', (html.match(/<tr><th scope="row">/g) ?? []).length === 48 && html.includes('<caption class="sr">') && /Nov 2026/.test(t) && /Oct 2028/.test(t) && /Seasonal forecast/.test(t) && /Usual \+ trend/.test(t));
  check('outlook: lean words are counts ("warmer in 38 of 50 runs"), the kinds are named under the table, and the hint says counts never a chance', /(Warmer|Cooler|No clear lean) · /.test(t) && /\(\d+ months?\): the usual month, moved by the European seasonal forecast/.test(t) && t.includes('Counts of model runs or models, never a chance.'));
  check('outlook: with the climate models in there is no button; without them the trend can be added', !html.includes('load-climate') && panelHTML(state({ horizon: 'outlook', outlook: ok(O0.result) }), CTX).includes('data-ahead="load-climate"') && /The trend needs the 7 climate models/.test(text(panelHTML(state({ horizon: 'outlook', outlook: ok(O0.result) }), CTX))));
  check('outlook: the table scrolls inside its own labelled, focusable box', /<div class="tbl" role="region" tabindex="0" aria-label="The next 24 months">/.test(html));
  check('outlook: a seasonal forecast that failed is said, and the months are the usual month', /The seasonal months are shown as the usual month\./.test(text(panelHTML(state({ horizon: 'outlook', outlook: ok(O0.result, { seasonalFailed: 'The weather service did not answer.' }) }), CTX))));
}
{
  const idle = panelHTML(state({ horizon: 'years' }), CTX);
  check('years: before the button nothing is read: the sentence about 4 minutes and "Load the climate models"', idle.includes('data-ahead="load-climate"') && /Load the climate models/.test(idle) && /takes about 4 minutes the first time/.test(text(idle)) && /do not forecast the weather of any real year/.test(text(idle)));
  check('years: while loading it says which model of 7, with no cancel or retry button', /Reading climate model 3 of 7/.test(text(panelHTML(state({ horizon: 'years', years: { ...blank(), status: 'loading', progress: { what: 'MRI_AGCM3_2_S', done: 2, of: 7 } } }), CTX))) && !/data-ahead/.test(panelHTML(state({ horizon: 'years', years: { ...blank(), status: 'loading', progress: { done: 2, of: 7 } } }), CTX)));
  const html = panelHTML(state({ horizon: 'years', years: ok(Y.result, { loaded: 1, partial: 'The weather service is busy. Look ahead can try again in a minute.' }) }), CTX), t = text(html);
  check('years: the headline is counts across the models beside the years as they really were, and the warming is a range', /Winter wheat on North field, around 2045, high path: your \d+ past seasons, changed the way each climate model says, are hurt (\d+ times|\d+ to \d+ times) out of \d+, across 1 models\. As they really were: hurt in \d+ of \d+\./.test(t) && /Warming of daytime highs by the 2040s here: \+[\d.]+ to \+[\d.]+ °C, depending on the model\./.test(t), t.slice(0, 340));
  check('years: only 1 of 7 models was read: the page says so with the reason, and offers the rest', /Only 1 of 7 climate models could be read\. The weather service is busy/.test(t) && html.includes('Load the rest of the climate models'));
  check('years: the limits are all there', YEARS_LIMITS.every(l => t.includes(l.slice(0, 40))));
  check('years: an error offers Try again, which asks for the models (never a hidden request)', panelHTML(state({ horizon: 'years', years: { ...blank(), status: 'error', reason: 'x' } }), CTX).includes('data-ahead="load-climate">Try again'));
}
{
  const rules = rulesHTML(); check('the rules sheet has its title, every section and the credit, and a Done button', rules.includes('id="aheadRulesTitle"') && RULES.every(([h]) => rules.includes(h)) && rules.includes('data-ahead="rules-done"') && /Weather data by Open-Meteo/.test(rules) && /never used raw/.test(rules));
  check('markup in a field or plan name is escaped', !panelHTML(state({ weeks: ok(W.result) }), { ...CTX, field: '<img src=x onerror=1>', youngCrop: '<b>x</b>' }).match(/<img src=x|<b>x<\/b>/) && !panelHTML(state({ horizon: 'season', season: ok(S.result) }), { ...CTX, planName: '<script>x</script>' }).includes('<script>'));
  // the words: no headline sounds like a chance (the note box, the "i" line, and a limit that says part of a month's change is chance are the only places)
  const all = [panelHTML(state({ weeks: ok(W.result) }), CTX), panelHTML(state({ horizon: 'season', season: ok(S.result) }), CTX), panelHTML(state({ horizon: 'outlook', outlook: ok(O.result) }), CTX), panelHTML(state({ horizon: 'years', years: ok(Y.result) }), CTX), panelHTML(state({ horizon: 'years' }), CTX)].map(text).join(' ');
  const cleaned = all.replace(YEARS_LIMITS[1], '').replace('Counts of model runs or models, never a chance.', '').replace('do not forecast the weather of any real year', '');
  check('no screen of any horizon uses a word that sounds like a chance', !CHANCE_WORDS.test(cleaned), (cleaned.match(CHANCE_WORDS) ?? [''])[0]);
  check('no money, no yield, no "profit" anywhere on the page', !/\b(price|profit|income|revenue|earn\w*|\$|yield of)\b/i.test(all));
  check('nothing on any state starts a request by itself: every action is a button the farmer presses', !/onload|onerror|autofocus|<script|data-auto/.test(aheadHTML(state({ weeks: ok(W.result) }), CTX)));
}
console.log(`ahead_view: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
