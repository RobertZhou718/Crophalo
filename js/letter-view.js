// Crophalo's one-page report: no tabs, the farmer's own questions from top to bottom. "What should I plant next?" (the answer), "Compare strategies" (three rows, each with its five parts under one "Show more"),
// "What could go wrong?", "When do I do what?", "More about your field", then Share or print and where the numbers come from. Every block shows at most four short sentences; the rest is folded.
// Pure: markup from the engine's answer and the answers given. Checked by scripts/test_letter.mjs and, in a page, scripts/e2e_reportux.mjs.
import { esc } from './words.js';
import { cropName } from './crops.js';
import { localiseText } from './unitstext.js';
import { plainReason } from './satellites2-data.js';
import { SOIL_MAP_WORDS } from './steps.js';
import { hardYearHTML } from './hardyear-view.js';
import { marketListsFor, marketLineHTML } from './market-view.js';
import { GOALS } from './words.inputs.js';
import { cleanGoals } from './inputs.js';
import { allPlans, strategies, planName, optionLabel, optionLabels, changeLine, fitNote, hasScore, scoreWord, cropsRow, proposedPlan, strategyDetail, compareHTML, windowLines, assumptions,
  infoButton, unionSources, ROLE_TAG, isKeepAnswer, moneyLine, ASK_ADVISER, NOT_READ, SURE_WORDS, repeatNote, NO_FIT_WORDS } from './report-view.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
export const GUIDE = 'Crophalo is a guide. You decide what to plant.';
export const H = Object.freeze({ answer: 'What should I plant next?', compare: 'Compare strategies', wrong: 'What could go wrong?', when: 'When do I do what?', more: 'More about your field' });
export const SOURCE_LINE = 'Scores worked out by Crophalo from NASA POWER weather and the US soil survey.';
const first = text => { const t = String(text ?? '').trim(), m = /^.*?[.!?](?=\s|$)/.exec(t); return m ? m[0] : t; };   // the first sentence only
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
// What is grown now does not suit here (the engine gives it no score) and nothing else leads clearly: the page says so, never "keep it".
const noFitNow = (result, keep) => keep && result?.current?.flag === 'fails' && !hasScore(result.current);
// The score as a chip: "71 · Good fit", the same on this page and in My farm.
export const scoreChip = plan => hasScore(plan)
  ? `<span class="chip score" role="img" aria-label="${esc(`Score ${Math.round(plan.score)} out of 100: ${scoreWord(plan)}`)}"><b class="rv-num">${Math.round(plan.score)}</b><span aria-hidden="true"> · ${esc(scoreWord(plan))}</span></span>`
  : plan?.flag === 'fails' ? '<span class="chip warn">Does not suit here</span>' : '';

// ---- block 1
export function answerHTML(result, ctx = {}) {
  const head = `<section class="rv-block" id="blkAnswer" aria-labelledby="bkAnswer"><h2 id="bkAnswer">${H.answer}</h2>`;
  if (!result || result.ok === false || !result.recommended) return `${head}<div class="rv-notread" role="status"><p>${esc(result?.reason || NOT_READ)}</p></div></section>`;
  const cur = result.current, keep = isKeepAnswer(result), alt = proposedPlan(result, ctx.chosen), chosen = alt.why === 'chosen' && !ctx.preselected;
  const other = chosen ? alt.plan : keep ? (alt.plan && alt.plan !== cur ? alt.plan : null) : result.recommended;   // the plan set against what you grow now: the one you chose, or our suggestion, or (on a keep answer) the best other option
  const pickNow = ctx.pick === 'now' || !other;
  const shown = pickNow ? cur : other;
  const noFit = !chosen && pickNow && noFitNow(result, keep);   // what is grown now does not suit here: the page says so with the engine's reason, never "Keep ..."
  const eyebrow = pickNow ? 'What you grow now' : chosen ? 'You chose' : 'Our suggestion';
  const headline = noFit ? NO_FIT_WORDS : pickNow ? `Keep ${planName(cur)}` : `Try ${optionLabel(shown, result)}`;
  const reason = noFit ? first(result.reason) : pickNow ? (keep ? 'What you grow now suits this field well.' : 'This is what you grow now. Crophalo compares the others with it.') : first(chosen ? (shown.why || result.reason) : keep ? (shown.why || result.reason) : result.reason);
  const card = (value, role, plan) => `<label class="rv-pickcard${(value === 'now') === pickNow ? ' is-on' : ''}"><input type="radio" class="sr" name="rvpick" value="${value}" id="pick-${value}"${(value === 'now') === pickNow ? ' checked' : ''}><span class="rv-pick-tag">${(value === 'now') === pickNow ? '<svg class="ic" aria-hidden="true"><use href="#i-tick"/></svg> ' : ''}${esc(role)}</span>${cropsRow(plan)}</label>`;
  const pick = other ? `<div class="rv-pick" role="radiogroup" aria-label="Show what you grow now or ${esc(chosen ? 'the strategy you chose' : keep ? 'the best other option' : 'our suggestion')}">${card('now', 'What you grow now', cur)}${card('alt', chosen ? 'You chose' : keep ? 'An option worth a look' : 'Our suggestion', other)}</div>` : '';
  const level = Object.hasOwn(SURE_WORDS, result.sureness ?? '') ? result.sureness : '';
  const done = ctx.farm && ctx.farmFor === (ctx.chosen ?? '');
  return `${head}<article class="card rv-answer" id="answer"><p class="eyebrow">${eyebrow} ${infoButton(unionSources(Array.isArray(result.evidence) ? result.evidence : []), 'the suggestion')}</p>
    <h3 class="rv-headline">${esc(headline)}</h3>${pick}<p class="rv-chiprow">${scoreChip(shown)}</p>
    ${reason ? `<p class="rv-reason">${esc(reason)}</p>` : ''}${level ? `<p class="rv-sure-line"><b>How sure is this?</b> ${esc(level)}.</p>` : ''}
    <p class="rv-guide">${esc(GUIDE)}</p>
    <p class="rv-actions"><button type="button" class="btn primary" data-act="farm" id="rbFarm"${ctx.ready === false ? ' disabled' : ''}>${done ? '<svg class="ic" aria-hidden="true"><use href="#i-tick"/></svg> Added' : ctx.inFarm ? 'Open in My farm' : 'Add to My farm'}</button>${chosen ? ' <button type="button" class="btn ghost" data-act="untry" data-plan="' + esc(ctx.chosen) + '">Use our suggestion instead</button>' : ''}</p>
    <p class="cap" id="farmNote" role="status">${esc(ctx.farmNote ?? '')}</p></article></section>`;
}

// ---- block 2: three rows
// "Ranked for what matters most to you: feed for your animals and less fertiliser to buy." from what the farmer ticked in the setup's
// last step (state.goals; the engine ranks with them, js/compare.js). Nothing ticked: no line at all.
export function goalsLine(goals) {
  const words = cleanGoals(goals).map(k => GOALS.find(g => g.key === k)?.rank).filter(Boolean);
  if (!words.length) return '';
  return `Ranked for what matters most to you: ${words.length < 2 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`}.`;
}
// the number of strategies in words ("Two strategies"), so no line names three when the page shows two
const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five'];
export const countWords = n => `${NUM[Math.min(5, n)] ?? n} ${n === 1 ? 'strategy' : 'strategies'}`;
// a strategy of one crop whose name is that crop: its crop row would say the same word twice
const oneCrop = (plan, name) => { const ids = [...new Set((plan.seasons ?? []).map(s => s?.crop).filter(Boolean))]; return ids.length === 1 && String(name).toLowerCase() === (() => { try { return String(cropName(ids[0], true)).toLowerCase(); } catch { return ''; } })(); };
const NOW_LINE = 'No change. This is your field today.';
function parts(plan, result) {
  const d = strategyDetail(plan, result), isNow = d.isNow;
  const why = isNow ? ['This is what you grow now. Crophalo compares the others with it.'] : d.why;
  const benefits = d.benefits.map(b => b.text).filter(t => !why.includes(t));
  return { why, evidence: d.evidence, benefits, gaps: d.gaps, risks: d.risks, isNow };
}
export function strategyRowHTML(plan, result, chosenId, label, market = null, units = null) {
  const role = strategies(result).roles.get(plan), keep = isKeepAnswer(result), isNow = role === 'now';
  const fits = !noFitNow(result, keep), tag = isNow && keep && fits ? 'What you grow now · Our suggestion' : ROLE_TAG[role] ?? 'Option', star = role === 'suggest' || (isNow && keep && fits);
  const lc = t => (units ? localiseText(t, units) : t), p = parts(plan, result), chosen = chosenId === plan.id;   // the report hands the answer already in the farmer's units; this only catches a line added after (the cash bids)
  const list = (items, empty) => items.length ? `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : `<p class="cap">${esc(empty)}</p>`;
  const cut = (items, n = 2) => ({ shown: items.slice(0, n), rest: items.slice(n) });
  const mk = market?.data ? marketListsFor(market.data, plan, result, market.near) : { evidence: [], gaps: [], risks: [] };   // USDA's cash bids: the figure with its date and unit, what is missing and the risks
  const ev = [...p.evidence, ...mk.evidence].map(e => `${esc(lc(e.text))} ${infoButton(e.sources, e.text)}`), bn = p.benefits.map(t => esc(lc(t))), ga = [...p.gaps, ...mk.gaps].map(t => esc(lc(t))), rk = [...p.risks, ...mk.risks].map(t => esc(lc(t))), wy = p.why.map(t => esc(lc(t)));
  const cell = market?.data ? marketLineHTML(market.data, plan, 'cell:market', result, market.near) : '';
  // a part with nothing in it is not drawn at all: no part says it has nothing yet (the owner's rule on empty promises)
  const sec = (title, items) => { if (!items.length) return { html: '', rest: '' }; const c = cut(items); return { html: `<section class="sd-sec"><h3>${title}</h3>${list(c.shown, '')}</section>`, rest: c.rest.length ? `<section class="sd-sec"><h3>${title}</h3>${list(c.rest, '')}</section>` : '' }; };
  const S = [sec('Why it was suggested', wy), sec('What evidence supports it', ev), sec('What benefits it may offer', bn), sec('Where information is missing', ga), sec('Risks to check locally', rk)];
  const rest = S.map(s => s.rest).join('');
  return `<details class="srow${star ? ' is-rec' : ''}${isNow ? ' is-now' : ''}" id="sr-${esc(plan.id)}" data-plan-row="${esc(plan.id)}"><summary><span class="srow-top"><span class="srow-tag">${star ? '<svg class="ic" aria-hidden="true"><use href="#i-star"/></svg>' : ''}${esc(chosen ? `${tag} · Chosen` : tag)}</span>${scoreChip(plan)}</span>
    <span class="srow-name">${esc(label ?? optionLabel(plan, result))}</span>${oneCrop(plan, label ?? optionLabel(plan, result)) ? '' : cropsRow(plan)}<span class="srow-change">${esc(isNow ? NOW_LINE : cap(changeLine(plan, result).replace(/^What changes: /, '')) + '.')}</span>${fitNote(plan) ? `<span class="cap rv-fit ${plan.flag}">${esc(fitNote(plan))}</span>` : ''}
    <span class="srow-more"><span class="when-shut">Show more</span><span class="when-open">Show less</span></span></summary>
    <div class="srow-body">${S.map(s => s.html).join('')}${rest ? `<details class="fold-card srow-rest" id="sx-${esc(plan.id)}"><summary><span class="t">Show more</span></summary><div class="fold-b">${rest}</div></details>` : ''}
    ${moneyLine(plan, 'detail')}${cell}${isNow ? '' : `<p><button type="button" class="btn${chosen ? ' chosen' : ''}" data-act="try" data-plan="${esc(plan.id)}" aria-pressed="${chosen}">${chosen ? 'Chosen' : 'Try this strategy'}</button></p>`}</div></details>`;
}
export function compareBlockHTML(result, ctx = {}) {
  const head = `<section class="rv-block" id="blkCompare" aria-labelledby="bkCompare"><h2 id="bkCompare">${H.compare}</h2>`;
  if (!result || result.ok === false || !result.recommended) return `${head}<div class="rv-notread" role="status"><p>${esc(result?.reason || NOT_READ)}</p></div></section>`;
  const { first: rows, fewWhy } = strategies(result), labels = optionLabels(result);
  const lead = goalsLine(ctx.state?.goals);
  return `${head}${lead ? `<p class="lead">${esc(lead)}</p>` : ''}<div class="srows">${rows.map(p => strategyRowHTML(p, result, ctx.chosen, labels.get(p), ctx.market, ctx.units)).join('')}</div>${fewWhy ? `<p class="cap rv-few" role="note">${esc(fewWhy)}</p>` : ''}
    ${ctx.hard ? hardYearHTML(ctx.hard) : ''}<p class="cap rv-srcline">${esc(SOURCE_LINE)} ${infoButton(['power', 'rules'], 'the scores')}</p>
    ${rows.length > 1 ? `<details class="fold-card" id="lfTable"><summary><span class="t">See ${rows.length === 2 ? 'the two' : rows.length === 3 ? 'the three' : 'them'} side by side</span></summary><div class="fold-b">${compareHTML(result, labels)}</div></details>` : ''}</section>`;
}

// ---- block 3: what could go wrong
export function wrongHTML(result, ctx = {}) {
  const head = `<section class="rv-block" id="blkWrong" aria-labelledby="bkWrong"><h2 id="bkWrong">${H.wrong}</h2>`;
  if (!result || result.ok === false || !result.recommended) return `${head}<div class="rv-notread" role="status"><p>${esc(result?.reason || NOT_READ)}</p></div></section>`;
  const plan = (ctx.shown ?? result.recommended), w = windowLines(plan)[0];
  const squeeze = w ? `A late harvest can leave too little time to sow ${w.crop.toLowerCase()}. It should go in between ${w.earliest} and ${w.latest}.` : '';
  const list = assumptions(ctx.state).map(x => `<li>${esc(ctx.units ? localiseText(x, ctx.units) : x)}</li>`).join('');
  return `${head}${squeeze ? `<p>${esc(squeeze)}</p>` : ''}<p class="rv-adviser">${esc(ASK_ADVISER)}</p>
    <details class="fold-card" id="lfAssumed"><summary><span class="t">What Crophalo assumed about your field</span></summary><div class="fold-b"><ul class="lf-assumed">${list}</ul>${ctx.extra ?? ''}</div></details></section>`;
}
// ---- block 4 and 5: the folds that hold today's tab bodies until each is rewritten
export const blockHTML = (id, title, inner) => `<section class="rv-block" id="blk${id}" aria-labelledby="bk${id}"><h2 id="bk${id}">${esc(title)}</h2>${inner}</section>`;
export const foldHTML = (id, title, inner) => `<details class="fold-card" id="${id}"><summary><span class="t">${esc(title)}</span></summary><div class="fold-b">${inner}</div></details>`;
// ---- block 6: Share or print, where the numbers come from, My notes and reminders
export function shareBlockHTML(rows, ctx = {}) {
  const sources = (rows ?? []).filter(r => r.state !== 'skip').map(r => `<li><b>${esc(String(r.label).split(' · ')[0])}</b> · ${esc(String(r.label).split(' · ').slice(1).join(' · '))}: ${r.state === 'ok' ? 'answered' : r.state === 'fail' ? esc(plainReason(r.reason, 'did not answer this time')) : 'waiting'}</li>`).join('');
  return `<section class="rv-block" id="blkShare" aria-label="Share, sources and notes"><p><button type="button" class="btn" data-act="share" id="rbShare"${ctx.ready === false ? ' disabled' : ''} aria-haspopup="dialog"><svg class="ic" aria-hidden="true"><use href="#i-share"/></svg><span>Share or print</span></button></p>
    ${foldHTML('lfSources', 'Where the numbers come from', `<ul class="rv-sources-list">${sources}</ul>`)}${foldHTML('lfNotes', 'My notes and reminders', '<div id="rmRoot"></div><div id="ntRoot"></div>')}</section>`;
}
