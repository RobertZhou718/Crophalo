// Crophalo's report on screen, as pure markup: the Overview (one recommendation for this field, one reason, how it compares with what is grown now,
// how sure, what is assumed) and Options (the plan cards with why, evidence, gaps and risks, the scores folded), plus the "i" button that opens a figure's source.
// Pure: every function takes plain data and returns text. Nothing is read from the page, nothing is drawn here. The page glue is js/report.js.
// Checked by scripts/test_report.mjs (every field of the plan shape, the honest "not read yet" state, plain-text escaping, the "i" with its sources, NASA first).
/*
 * The engine's answer this reads (optionsFor(state, climate, spot)):
 * { current: Plan, recommended: Plan, others: [Plan], reason, evidence: [{ text, sources: [key] }], gaps: [text], risks: [text], sureness: 'Very sure' | 'Fairly sure' | 'Somewhat sure' }
 * Plan = { id, name, kind: 'current' | 'proposed', seasons: [{ year, crop, sow, harvest, after: 'residue' | 'cover' | 'bare', residueUntil, window: { earliest, latest } | null }] }
 * plan.score (0 to 100), plan.scores { water, soil, erosion, income, weather } (0 to 100) and plan.why: without them no score or bar is drawn.
 */
import { esc } from './words.js';
import { cropName } from './crops.js';
import { cropPic } from './pics.js';
import { ALL_SOURCES } from './sources.more.js';

export const NOT_READ = 'This part has not been read yet. Crophalo shows nothing here until its answer is in, and never a made-up number.';
export const SURE_WORDS = Object.freeze({ 'Very sure': 'Most of what this rests on is measured at or near your field.', 'Fairly sure': 'It rests on good data, with a few things worth confirming.', 'Somewhat sure': 'Some of what it rests on is assumed. Confirm the points below before you act.' });
export const SCORE_NAMES = Object.freeze({ water: 'Water fit', soil: 'Soil health', erosion: 'Soil wash-off', income: 'Income', weather: 'Weather safety' });
export const AFTER_WORDS = Object.freeze({ residue: 'leftover crop residue: a thin cover', cover: 'a living cover that protects the soil', bare: 'bare soil' });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
export const dayWords = d => isDay(d) ? `${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '';
export const longDate = d => isDay(d) ? `${+d.slice(8)} ${MONTH[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '';
const fin = v => typeof v === 'number' && Number.isFinite(v);
const name = id => { try { return cropName(id, true) || String(id); } catch { return String(id); } };

// ---- the "i" button: the shared one (js/srci.js), beside every figure; its card lists the sources, NASA first. This file adds the report's own notes to the table.
import { srcButton } from './srci.js';
export function sourceNotes(keys) {
  return [...new Set(Array.isArray(keys) ? keys : [])].filter(k => Object.hasOwn(ALL_SOURCES, k)).map(key => ({ key, ...ALL_SOURCES[key] })).sort((a, b) => Number(b.nasa) - Number(a.nasa));
}
export const infoButton = (keys, figure = '') => srcButton(keys, figure);

// ---- the plans
const crops = plan => (plan?.seasons ?? []).map(s => s.crop);
const cropsRow = plan => `<span class="rv-crops">${(plan?.seasons ?? []).map((s, i) => `${i ? '<span class="rv-next" aria-hidden="true">›</span>' : ''}<span class="rv-crop">${(() => { try { return cropPic(s.crop); } catch { return ''; } })()}<span>${esc(name(s.crop))}</span></span>`).join('')}</span>`;
export const planName = plan => crops(plan).map(name).join(', then ') || plan?.name || '';
// What covers the ground after each harvest, in words, from the plan's own data. A season with no `after` says nothing.
export function coverLines(plan) {
  return (plan?.seasons ?? []).filter(s => Object.hasOwn(AFTER_WORDS, s.after)).map(s => ({ year: s.year, crop: name(s.crop), words: AFTER_WORDS[s.after], until: dayWords(s.residueUntil) }));
}
// The sowing windows a plan names (a late harvest squeezes them): only dates the plan carries.
export function windowLines(plan) {
  return (plan?.seasons ?? []).filter(s => s.window && isDay(s.window.earliest) && isDay(s.window.latest)).map(s => ({ crop: name(s.crop), sow: dayWords(s.sow), earliest: dayWords(s.window.earliest), latest: dayWords(s.window.latest) }));
}
const scoreRing = score => fin(score) ? `<span class="rv-ring" role="img" aria-label="${esc(`Score ${Math.round(score)} out of 100`)}"><b>${Math.round(score)}</b><small>${score >= 70 ? 'Good fit' : score >= 50 ? 'OK fit' : 'Poor fit'}</small></span>` : '';
// The Worse–Better bars: one per score, with the words at both ends so no one has to guess which way is good.
export function barsHTML(scores) {
  const rows = Object.entries(SCORE_NAMES).filter(([k]) => fin(scores?.[k]));
  if (!rows.length) return '';
  return `<ul class="rv-bars">${rows.map(([k, label]) => `<li><span class="rv-bar-name">${esc(label)}</span><span class="rv-bar" role="img" aria-label="${esc(`${label}: ${Math.round(scores[k])} out of 100`)}"><i style="width:${Math.max(0, Math.min(100, scores[k]))}%"></i></span><span class="rv-bar-ends"><small>Worse</small><small>Better</small></span></li>`).join('')}</ul>`;
}

// ---- what is assumed, from the answers themselves
export function estimatedArea(loc, hectares = 10) {   // a square of that area around the pin, for when no outline was drawn: always labelled "estimated"
  if (!loc || !fin(loc.lat) || !fin(loc.lon)) return null;
  const half = Math.sqrt(hectares * 1e4) / 2, dLat = half / 111320, dLon = half / (111320 * Math.max(0.01, Math.cos(loc.lat * Math.PI / 180)));
  const r = v => Math.round(v * 1e4) / 1e4;
  return { pts: [[r(loc.lat - dLat), r(loc.lon - dLon)], [r(loc.lat - dLat), r(loc.lon + dLon)], [r(loc.lat + dLat), r(loc.lon + dLon)], [r(loc.lat + dLat), r(loc.lon - dLon)]], ha: hectares, estimated: true };
}
export function assumptions(state) {
  const out = [];
  if (state?.soil?.mode === 'assumed') out.push('Soil: an average loam is assumed until the soil lookup answers. Nothing was measured here.');
  else if (state?.soil?.mode === 'manual') out.push('Soil: as you described it.');
  if (state?.farm?.irrigation === 'none') out.push('Water: rain only. The field is not irrigated.');
  else if (state?.farm?.irrigation) out.push(`Water: ${state.farm.irrigation === 'limited' ? 'limited irrigation' : 'irrigated as needed'}.`);
  out.push(state?.area ? `Outline: the one you drew${fin(state.area.ha) ? ` (${state.area.ha.toFixed(1)} ha)` : ''}.` : 'Outline: estimated as a 10 ha square around the pin, because none was drawn.');
  return out;
}

// ---- which plan goes to My Farm as the proposed one: the one the farmer chose to try; else the engine's suggestion when it is a change; else, when the suggestion is to keep what is grown now,
// the best-scoring other plan that holds up (the engine's plan.flag is 'holds'); else the suggestion itself.
const samePlan = (a, b) => !!a && !!b && (a.id === b.id || planName(a) === planName(b));
export const betterOptions = result => allPlans(result).filter(p => !samePlan(p, result.current)).filter(p => p.flag === 'holds').sort((a, b) => (fin(b.score) ? b.score : -1) - (fin(a.score) ? a.score : -1));
// A plan other than the one grown now, that holds up, whose seasons grow exactly these crops in this order (found by its crops, never by a made-up id).
export const cropsOf = p => (Array.isArray(p?.seasons) ? p.seasons : []).map(x => x?.crop);
export const planWithCrops = (result, crops) => Array.isArray(crops) && crops.length ? allPlans(result).find(p => !samePlan(p, result.current) && p.flag === 'holds' && JSON.stringify(cropsOf(p)) === JSON.stringify(crops)) ?? null : null;
export const PRESELECT_WORDS = 'An option worth a look, not our firm suggestion';
export function proposedPlan(result, chosenId = null) {
  if (!result?.recommended) return { plan: null, why: 'none' };
  const plans = allPlans(result), chosen = chosenId ? plans.find(p => p.id === chosenId && !samePlan(p, result.current)) : null;
  if (chosen) return { plan: chosen, why: 'chosen' };
  if (!samePlan(result.recommended, result.current)) return { plan: result.recommended, why: 'recommended' };
  const best = betterOptions(result)[0];
  return best ? { plan: best, why: 'best' } : { plan: result.recommended, why: 'recommended' };
}
// The two plans handed to My Farm: the engine's own objects, with the engine's own ids (My Farm matches its chips by them), only marked current or proposed.
export const farmPlans = (result, chosenId = null) => ({ current: { ...result.current, kind: 'current' }, proposed: { ...proposedPlan(result, chosenId).plan, kind: 'proposed' } });
export const PROPOSED_WORDS = Object.freeze({ chosen: 'The plan you chose to try', recommended: 'Our suggestion', best: 'The best option that holds up' });

// ---- Overview
// ctx: { state, today: 'YYYY-MM-DD' }. result: the engine's answer, or null / { ok: false } when it is not read yet.
export function overviewHTML(result, ctx = {}) {
  const head = `<section class="rv-sec" aria-labelledby="ovTitle"><h2 id="ovTitle">Overview</h2>`;
  if (!result || result.ok === false || !result.recommended) return `${head}<div class="rv-notread" role="status"><p>${esc(result?.reason || NOT_READ)}</p></div>${assumptionsHTML(ctx.state)}</section>`;
  const rec = result.recommended, cur = result.current, same = samePlan(rec, cur), alt = proposedPlan(result, ctx.chosen), worth = betterOptions(result).slice(0, 2);
  const headline = same ? `Keep ${planName(cur)}` : `Try ${planName(rec)}`;
  const evidence = Array.isArray(result.evidence) ? result.evidence : [];
  const cols = same ? (alt.plan && !samePlan(alt.plan, cur) ? [['Now (our suggestion: keep it)', cur], [alt.why === 'chosen' ? (ctx.preselected ? PRESELECT_WORDS : 'The plan you chose to try') : 'Worth trying', alt.plan]] : [['Now (our suggestion: keep it)', cur]]) : [['Now', cur], ['Suggested', rec]];
  const cover = cols.map(([label, p]) => ({ label, plan: p, lines: coverLines(p) }));
  return `${head}
    <article class="card rv-answer" id="answer">
      <div class="rv-answer-main">
        <p class="eyebrow">Our suggestion ${infoButton(unionSources(evidence), 'the suggestion')}</p>
        <h3 class="rv-headline">${esc(headline)}</h3>
        <p class="rv-reason"><b>Why it suits this field:</b> ${esc(result.reason ?? '')}</p>
        ${scoreRing(rec.score)}
      </div>
      <div class="rv-compare" aria-label="Your rotation now and the suggested one">
        ${cover.map(c => `<div class="rv-col${c.plan !== cur ? ' is-rec' : ''}"><h4>${esc(c.label)}${c.plan === cur && !same ? '' : ''}</h4>${cropsRow(c.plan)}${c.lines.length ? `<ul class="rv-cover">${c.lines.map(l => `<li><b>${esc(l.crop)}, ${l.year}:</b> after harvest, ${esc(l.words)}${l.until ? ` (until ${esc(l.until)})` : ''}</li>`).join('')}</ul>` : ''}</div>`).join('')}
      </div>
      ${caveatHTML(same && alt.plan ? alt.plan : rec)}
      ${sureHTML(result)}
    </article>
    ${same && worth.length ? worthHTML(worth, result, ctx.chosen) : ''}
    ${evidence.length ? `<details class="fold-card" id="ovEvidence"><summary><span class="t">What this is based on</span></summary><div class="fold-b"><ul class="rv-evidence">${evidence.map(e => `<li>${esc(e.text)} ${infoButton(e.sources, e.text)}</li>`).join('')}</ul></div></details>` : ''}
    ${assumptionsHTML(ctx.state)}</section>`;
}
export function worthHTML(list, result, chosenId) {
  return `<section class="rv-worth" aria-labelledby="ovWorth"><h3 id="ovWorth">Options worth trying</h3><p class="cap">Our suggestion is to keep what you grow now. These plans score higher or about the same, and hold up on your field’s weather record.</p>
    <ul class="rv-worth-list">${list.map(p => `<li class="card pad"><div><b>${esc(planName(p))}</b>${fin(p.score) ? ` <span class="chip">Score ${Math.round(p.score)}</span>` : ''}${fin(result.current?.score) ? ` <span class="cap">(what you grow now: ${Math.round(result.current.score)})</span>` : ''}</div>${cropsRow(p)}
      <button type="button" class="btn${chosenId === p.id ? ' chosen' : ''}" data-act="try" data-plan="${esc(p.id)}" aria-pressed="${chosenId === p.id}">${chosenId === p.id ? 'Chosen to try' : 'Try this plan'}</button></li>`).join('')}</ul></section>`;
}
const unionSources = ev => [...new Set(ev.flatMap(e => Array.isArray(e.sources) ? e.sources : []))];
export function caveatHTML(plan) {
  const w = windowLines(plan);
  return w.length ? `<div class="inset rv-caveat" role="note"><b>Where it may be hard:</b> ${w.map(x => `${esc(x.crop)} should go in between ${esc(x.earliest)} and ${esc(x.latest)}. A late harvest before it squeezes that window.`).join(' ')}</div>` : '';
}
export function sureHTML(result) {
  const level = result?.sureness, gaps = Array.isArray(result?.gaps) ? result.gaps : [], risks = Array.isArray(result?.risks) ? result.risks : [];
  if (!Object.hasOwn(SURE_WORDS, level ?? '')) return '';
  return `<div class="rv-sure"><p class="rv-sure-line"><b>How sure is this?</b> ${esc(level)}. ${esc(SURE_WORDS[level])}</p>
    <details class="fold-card" id="ovSure"><summary><span class="t">How sure is this? What to confirm</span></summary><div class="fold-b">
      ${gaps.length ? `<h4>Confirm these</h4><ul>${gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}${risks.length ? `<h4>What could go wrong</h4><ul>${risks.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}
      <p class="cap">The score is a guide. It is not a yield and not a chance of success.</p></div></details></div>`;
}
export function assumptionsHTML(state) {
  const list = assumptions(state);
  return `<section class="rv-assume" aria-labelledby="ovAssume"><h3 id="ovAssume">What is assumed</h3><ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`;
}

// ---- Options
// selectedId: the plan whose detail shows. Cards: what you grow now, then the suggestion, then the others.
export function allPlans(result) { return result && result.recommended ? [result.current, result.recommended, ...(Array.isArray(result.others) ? result.others : [])].filter(Boolean) : []; }
const tag = (plan, result) => plan === result.current ? 'Today' : plan === result.recommended ? 'Our suggestion' : 'Option';
export function optionCardHTML(plan, result, selected, chosenId = null) {
  const t = chosenId === plan.id ? 'Chosen to try' : tag(plan, result), lines = coverLines(plan);
  return `<button type="button" class="card act ocard${selected ? ' on' : ''}" data-plan="${esc(plan.id)}" aria-pressed="${selected}"><span class="ocard-tag chip">${esc(t)}</span>${scoreRing(plan.score)}
    <h3>${esc(planName(plan))}</h3>${cropsRow(plan)}${lines[0] ? `<span class="cap">After ${esc(lines[0].crop)}: ${esc(lines[0].words)}</span>` : ''}</button>`;
}
export function optionDetailHTML(plan, result, chosenId = null) {
  const isNow = plan === result.current, why = plan.why || (plan === result.recommended ? result.reason : '');
  const list = (title, items, id) => `<details class="fold-card" id="${id}"><summary><span class="t">${esc(title)} <span class="count soft">${items.length}</span></span></summary><div class="fold-b">${items.length ? `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : '<p class="cap">Nothing to add here.</p>'}</div></details>`;
  const evidence = plan === result.recommended || isNow ? (Array.isArray(result.evidence) ? result.evidence : []) : [];
  const gaps = plan === result.recommended ? (Array.isArray(result.gaps) ? result.gaps : []) : [], risks = plan === result.recommended ? (Array.isArray(result.risks) ? result.risks : []) : [];
  const years = (plan.seasons ?? []).map(s => `<li><b>Year ${s.year}:</b> ${esc(name(s.crop))}${isDay(s.sow) ? `, sown about ${esc(dayWords(s.sow))}` : ''}${isDay(s.harvest) ? `, harvested about ${esc(dayWords(s.harvest))}` : ''}</li>`);
  const cover = coverLines(plan).map(l => `<b>${esc(l.crop)}, ${l.year}:</b> ${esc(l.words)}${l.until ? ` (until ${esc(l.until)})` : ''}`);
  return `<section class="card pad sdetail" id="sdetail" aria-live="polite"><h3>${esc(planName(plan))}</h3>
    <p>${isNow ? 'What you grow now: the yardstick for every other option.' : why ? `<b>Why we suggest it:</b> ${esc(why)}` : 'Why it is here has not been read yet.'}</p>
    ${isNow ? '' : `<p><button type="button" class="btn${chosenId === plan.id ? ' chosen' : ''}" data-act="try" data-plan="${esc(plan.id)}" aria-pressed="${chosenId === plan.id}">${chosenId === plan.id ? 'Chosen to try: add it to My Farm' : 'Try this plan'}</button>${chosenId === plan.id ? ` <button type="button" class="btn ghost" data-act="untry" data-plan="${esc(plan.id)}">Use our suggestion instead</button>` : ''}</p>`}
    ${barsHTML(plan.scores)}${!plan.scores ? '<p class="cap">Scores are not read yet for this option.</p>' : ''}
    <div class="folds">${list('Your rotation, year by year', years, 'dYears')}${list('When is the soil covered?', cover, 'dCover')}${list('What the data suggests', evidence.map(e => `${esc(e.text)} ${infoButton(e.sources, e.text)}`), 'dEvidence')}${list('What we cannot see', gaps.map(esc), 'dGaps')}${list('Check before you switch', risks.map(esc), 'dRisks')}</div></section>`;
}
export function scoresFoldHTML(result) {
  const plans = allPlans(result).filter(p => p.scores);
  return `<details class="fold-card" id="howScores"><summary><span class="t">How the scores work</span></summary><div class="fold-b">
    <p>Each plan is scored from 0 to 100 on five things. How much each counts comes from what you said matters most.</p>
    <ul class="cap">${Object.values(SCORE_NAMES).map(n => `<li>${esc(n)}: how well the plan does on this, worse to better.</li>`).join('')}</ul>
    ${plans.length ? `<div class="tbl"><table><thead><tr><th scope="col">Plan</th>${Object.values(SCORE_NAMES).map(n => `<th scope="col">${esc(n)}</th>`).join('')}</tr></thead><tbody>${plans.map(p => `<tr><th scope="row">${esc(planName(p))}${p === result.recommended ? ' (suggested)' : ''}</th>${Object.keys(SCORE_NAMES).map(k => `<td>${fin(p.scores[k]) ? Math.round(p.scores[k]) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="cap">The scores are not read yet.</p>'}
    <p class="cap">A score is a guide to compare plans on this field. It is not a yield and not a chance of success.</p></div></details>`;
}
export function optionsHTML(result, selectedId, chosenId = null) {
  const head = '<section class="rv-sec" aria-labelledby="opTitle"><h2 id="opTitle">Your options</h2>';
  if (!result || result.ok === false || !result.recommended) return `${head}<div class="rv-notread" role="status"><p>${esc(result?.reason || NOT_READ)}</p></div></section>`;
  const plans = allPlans(result), chosen = plans.find(p => p.id === selectedId) ?? result.recommended;
  return `${head}<p class="lead">Tap an option to see why.</p><div class="grid opts" role="group" aria-label="Options">${plans.map(p => optionCardHTML(p, result, p === chosen, chosenId)).join('')}</div>${optionDetailHTML(chosen, result, chosenId)}${scoresFoldHTML(result)}</section>`;
}

// ---- the other five tabs: plainly, what they will hold
export const TABS = Object.freeze([
  { id: 'overview', label: 'Overview', icon: 'i-star' }, { id: 'options', label: 'Options', icon: 'i-leaf' }, { id: 'weather', label: 'Weather', icon: 'i-cloud' }, { id: 'calendar', label: 'Calendar', icon: 'i-cal' },
  { id: 'field', label: 'Field', icon: 'i-pin' }, { id: 'satellites', label: 'Satellites & prices', icon: 'i-globe' }, { id: 'notes', label: 'Notes & to‑do', icon: 'i-tick' },
]);
export const WILL_HOLD = Object.freeze({
  weather: 'Heat, cold and rain through the year at your field, this week’s forecast, and the days that cross a line that hurts crops.',
  calendar: 'When to sow and harvest each crop here, from your field’s own frost and heat record.',
  field: 'Your field’s outline, slope and soil, and what covers the ground through the year.',
  satellites: 'The live satellite and price lookups for this spot, each with its source and how fresh it is.',
  notes: 'Your reminders, your own notes on the field, and what you noticed this season.',
});
export const laterHTML = id => `<section class="rv-sec" aria-labelledby="lt-${id}"><h2 id="lt-${id}">${esc(TABS.find(t => t.id === id)?.label ?? '')}</h2><div class="rv-notread"><p><b>Not built yet.</b> This part will hold: ${esc(WILL_HOLD[id] ?? '')}</p></div></section>`;

// ---- the loading screen: the sources answering one by one
// rows: [{ key, label, state: 'wait' | 'ok' | 'fail' | 'skip', reason }]
export function loadingHTML(rows) {
  const done = rows.filter(r => r.state === 'ok').length, asked = rows.filter(r => r.state !== 'skip').length;
  return `<section class="rv-loading" aria-labelledby="ldTitle" aria-busy="${done < asked}"><h2 id="ldTitle">Building your full report</h2>
    <p class="lead">Crophalo is asking NASA and partner services about this exact spot. A new place can take a minute the first time; it is faster afterwards.</p>
    <p class="rv-meter"><span class="sr">Sources answered</span><progress max="${asked || 1}" value="${done}" aria-label="Sources answered">${done} of ${asked}</progress></p><p class="cap" role="status">${done} of ${asked} ${asked === 1 ? 'source' : 'sources'} answered</p>
    <ul class="rv-sources">${rows.filter(r => r.state !== 'skip').map(r => `<li class="rv-src is-${r.state}"><span class="dot ${r.state === 'ok' ? 'good' : r.state === 'fail' ? 'warn' : 'busy'}" aria-hidden="true"></span><span><b>${esc(r.label)}</b>${r.state === 'fail' ? `<br><small>${esc(r.reason ?? '')}</small>` : ''}${r.state === 'ok' ? '<br><small>Answered</small>' : r.state === 'wait' ? '<br><small>Waiting…</small>' : ''}</span>${infoButton([r.key], r.label)}</li>`).join('')}</ul></section>`;
}
