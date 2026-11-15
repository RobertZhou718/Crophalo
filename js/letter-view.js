// Crophalo's one-page report: no tabs, the farmer's own questions from top to bottom. "What should I plant next?" (the answer), "Compare strategies" (three rows, each with its five parts under one "Show more"),
// "What could go wrong?", "When do I do what?", "More about your field", then Share or print and where the numbers come from. Every block shows at most four short sentences; the rest is folded.
// Pure: markup from the engine's answer and the answers given. Checked by scripts/test_letter.mjs and, in a page, scripts/e2e_reportux.mjs.
import { esc } from './words.js';
import { SOIL_MAP_WORDS } from './steps.js';
import { hardYearHTML } from './hardyear-view.js';
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
  const shown = chosen ? alt.plan : result.recommended;
  const eyebrow = chosen ? 'You chose' : 'Our suggestion';
  const noFit = !chosen && noFitNow(result, keep);
  const headline = noFit ? NO_FIT_WORDS : !chosen && keep ? `Keep ${planName(cur)}` : `Try ${optionLabel(shown, result)}`;
  const reason = noFit ? first(result.reason) : !chosen && keep ? 'What you grow now suits this field well.' : first(chosen ? (shown.why || result.reason) : result.reason);
  const level = Object.hasOwn(SURE_WORDS, result.sureness ?? '') ? result.sureness : '';
  const done = ctx.farm && ctx.farmFor === (ctx.chosen ?? '');
  return `${head}<article class="card rv-answer" id="answer"><p class="eyebrow">${eyebrow} ${infoButton(unionSources(Array.isArray(result.evidence) ? result.evidence : []), 'the suggestion')}</p>
    <h3 class="rv-headline">${esc(headline)}</h3><p class="rv-chiprow">${scoreChip(shown)}</p>
    ${reason ? `<p class="rv-reason">${esc(reason)}</p>` : ''}${level ? `<p class="rv-sure-line"><b>How sure is this?</b> ${esc(level)}.</p>` : ''}
    <p class="rv-guide">${esc(GUIDE)}</p>
    <p class="rv-actions"><button type="button" class="btn primary" data-act="farm" id="rbFarm"${ctx.ready === false ? ' disabled' : ''}>${done || ctx.inFarm ? 'Open in My farm' : 'Add to My farm'}</button>${chosen ? ' <button type="button" class="btn ghost" data-act="untry" data-plan="' + esc(ctx.chosen) + '">Use our suggestion instead</button>' : ''}</p>
    <p class="cap" id="farmNote" role="status">${esc(ctx.farmNote ?? '')}</p></article></section>`;
}

// ---- block 2: three rows
const PRIO_LABELS = ['water fit', 'soil health', 'soil wash-off', 'income', 'weather safety'];
// "Ranked for what matters most to you: soil health." from the setup's five weights; nothing stands out: the plain lead.
export function priorityLine(prio) {
  const w = Array.isArray(prio) ? prio.slice(0, 5).map(Number) : [];
  if (w.length < 5 || w.some(v => !Number.isFinite(v))) return 'Three strategies for this field.';
  const top = Math.max(...w), best = w.map((v, i) => (v === top ? PRIO_LABELS[i] : null)).filter(Boolean);
  return best.length === 5 || best.length > 2 ? 'Three strategies for this field.' : `Ranked for what matters most to you: ${best.join(' and ')}.`;
}
const NOW_LINE = 'No change. This is your field today.';
function parts(plan, result) {
  const d = strategyDetail(plan, result), isNow = d.isNow;
  const why = isNow ? ['This is what you grow now. Crophalo compares the others with it.'] : d.why;
  const benefits = d.benefits.map(b => b.text).filter(t => !why.includes(t));
  return { why, evidence: d.evidence, benefits, gaps: d.gaps, risks: d.risks, isNow };
}
export function strategyRowHTML(plan, result, chosenId, label) {
  const role = strategies(result).roles.get(plan), keep = isKeepAnswer(result), isNow = role === 'now';
  const fits = !noFitNow(result, keep), tag = isNow && keep && fits ? 'What you grow now · Our suggestion' : ROLE_TAG[role] ?? 'Option', star = role === 'suggest' || (isNow && keep && fits);
  const p = parts(plan, result), chosen = chosenId === plan.id;
  const list = (items, empty) => items.length ? `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>` : `<p class="cap">${esc(empty)}</p>`;
  const cut = (items, n = 2) => ({ shown: items.slice(0, n), rest: items.slice(n) });
  const ev = p.evidence.map(e => `${esc(e.text)} ${infoButton(e.sources, e.text)}`), bn = p.benefits.map(esc), ga = p.gaps.map(esc), rk = p.risks.map(esc), wy = p.why.map(esc);
  const sec = (title, items, empty) => { const c = cut(items); return { html: `<section class="sd-sec"><h3>${title}</h3>${list(c.shown, empty)}</section>`, rest: c.rest.length ? `<section class="sd-sec"><h3>${title}</h3>${list(c.rest, '')}</section>` : '' }; };
  const S = [sec('Why it was suggested', wy, 'Crophalo gave no reason.'), sec('What evidence supports it', ev, 'No evidence is listed yet.'), sec('What benefits it may offer', bn, 'No benefits are listed yet.'),
    sec('Where information is missing', ga, 'None listed yet. That does not mean there are none.'), sec('Risks to check locally', rk, 'None listed yet. Ask farmers near you.')];
  const rest = S.map(s => s.rest).join('');
  return `<details class="srow${star ? ' is-rec' : ''}${isNow ? ' is-now' : ''}" id="sr-${esc(plan.id)}" data-plan-row="${esc(plan.id)}"><summary><span class="srow-top"><span class="srow-tag">${star ? '<svg class="ic" aria-hidden="true"><use href="#i-star"/></svg>' : ''}${esc(chosen ? `${tag} · Chosen` : tag)}</span>${scoreChip(plan)}</span>
    <span class="srow-name">${esc(label ?? optionLabel(plan, result))}</span>${cropsRow(plan)}<span class="srow-change">${esc(isNow ? NOW_LINE : cap(changeLine(plan, result).replace(/^What changes: /, '')) + '.')}</span>${fitNote(plan) ? `<span class="cap rv-fit ${plan.flag}">${esc(fitNote(plan))}</span>` : ''}
    <span class="srow-more"><span class="when-shut">Show more</span><span class="when-open">Show less</span></span></summary>
    <div class="srow-body">${S.map(s => s.html).join('')}${rest ? `<details class="fold-card srow-rest" id="sx-${esc(plan.id)}"><summary><span class="t">Show more</span></summary><div class="fold-b">${rest}</div></details>` : ''}
    ${moneyLine(plan, 'detail')}${isNow ? '' : `<p><button type="button" class="btn${chosen ? ' chosen' : ''}" data-act="try" data-plan="${esc(plan.id)}" aria-pressed="${chosen}">${chosen ? 'Chosen' : 'Try this strategy'}</button></p>`}</div></details>`;
}
export function compareBlockHTML(result, ctx = {}) {
  const head = `<section class="rv-block" id="blkCompare" aria-labelledby="bkCompare"><h2 id="bkCompare">${H.compare}</h2>`;
  if (!result || result.ok === false || !result.recommended) return `${head}<div class="rv-notread" role="status"><p>${esc(result?.reason || NOT_READ)}</p></div></section>`;
  const { first: rows, fewWhy } = strategies(result), labels = optionLabels(result);
  return `${head}<p class="lead">${esc(priorityLine(ctx.state?.prio))}</p><div class="srows">${rows.map(p => strategyRowHTML(p, result, ctx.chosen, labels.get(p))).join('')}</div>${fewWhy ? `<p class="cap rv-few" role="note">${esc(fewWhy)}</p>` : ''}
    ${ctx.hard ? hardYearHTML(ctx.hard) : ''}<p class="cap rv-srcline">${esc(SOURCE_LINE)} ${infoButton(['power', 'rules'], 'the scores')}</p>
    ${rows.length > 1 ? `<details class="fold-card" id="lfTable"><summary><span class="t">See the three side by side</span></summary><div class="fold-b">${compareHTML(result, labels)}</div></details>` : ''}</section>`;
}

// ---- block 3: what could go wrong
export function wrongHTML(result, ctx = {}) {
  const head = `<section class="rv-block" id="blkWrong" aria-labelledby="bkWrong"><h2 id="bkWrong">${H.wrong}</h2>`;
  if (!result || result.ok === false || !result.recommended) return `${head}<div class="rv-notread" role="status"><p>${esc(result?.reason || NOT_READ)}</p></div></section>`;
  const plan = (ctx.shown ?? result.recommended), w = windowLines(plan)[0];
  const squeeze = w ? `A late harvest can leave too little time to sow ${w.crop.toLowerCase()}. It should go in between ${w.earliest} and ${w.latest}.` : '';
  const list = assumptions(ctx.state).map(x => `<li>${esc(x)}</li>`).join('');
  return `${head}${squeeze ? `<p>${esc(squeeze)}</p>` : ''}<p class="rv-adviser">${esc(ASK_ADVISER)}</p>
    <details class="fold-card" id="lfAssumed"><summary><span class="t">What Crophalo assumed about your field</span></summary><div class="fold-b"><ul class="lf-assumed">${list}</ul>${ctx.extra ?? ''}</div></details></section>`;
}
// ---- block 4 and 5: the folds that hold today's tab bodies until each is rewritten
export const blockHTML = (id, title, inner) => `<section class="rv-block" id="blk${id}" aria-labelledby="bk${id}"><h2 id="bk${id}">${esc(title)}</h2>${inner}</section>`;
export const foldHTML = (id, title, inner) => `<details class="fold-card" id="${id}"><summary><span class="t">${esc(title)}</span></summary><div class="fold-b">${inner}</div></details>`;
// ---- block 6: Share or print, where the numbers come from, My notes and reminders
export function shareBlockHTML(rows, ctx = {}) {
  const sources = (rows ?? []).filter(r => r.state !== 'skip').map(r => `<li><b>${esc(String(r.label).split(' · ')[0])}</b> · ${esc(String(r.label).split(' · ').slice(1).join(' · '))}: ${r.state === 'ok' ? 'answered' : r.state === 'fail' ? esc(r.reason || 'did not answer this time') : 'waiting'}</li>`).join('');
  return `<section class="rv-block" id="blkShare" aria-label="Share, sources and notes"><p><button type="button" class="btn" data-act="share" id="rbShare"${ctx.ready === false ? ' disabled' : ''} aria-haspopup="dialog"><svg class="ic" aria-hidden="true"><use href="#i-share"/></svg><span>Share or print</span></button></p>
    ${foldHTML('lfSources', 'Where the numbers come from', `<ul class="rv-sources-list">${sources}</ul>`)}${foldHTML('lfNotes', 'My notes and reminders', '<div id="rmRoot"></div><div id="ntRoot"></div>')}</section>`;
}
