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
import { SOIL_MAP_WORDS } from './steps.js';
import { cropName } from './crops.js';
import { cropPic } from './pics.js';
import { ALL_SOURCES } from './sources.more.js';

export const NOT_READ = 'This could not be worked out. Try again in a moment.';
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
// A rotation is named by the cycle that repeats, never by the years the engine happened to lay out: corn, soybeans, corn is "Corn, then soybeans" (it repeats every 2 years).
const lowerFirst = t => (t ? t[0].toLowerCase() + t.slice(1) : t);
export function cycleCrops(plan) {
  const c = crops(plan);
  for (let p = 1; p <= c.length; p++) if (c.every((x, i) => x === c[i % p])) return c.slice(0, p);
  return c;
}
export function planName(plan) {
  const c = cycleCrops(plan); if (!c.length) return plan?.name || '';
  const words = c.map((id, i) => (i ? lowerFirst(name(id)) : name(id)));
  return c.length === 1 && crops(plan).length > 1 ? `${words[0]}, every year` : words.join(', then ');
}
export const repeatNote = plan => { const n = cycleCrops(plan).length, total = crops(plan).length; return n > 1 && total > n ? `repeats every ${n} years` : ''; };
// What an option changes from what is grown now, in words: the cycle if it is another one, and a cover crop, a second crop or a variety where the plan has them and today's does not.
const coverOf = plan => { for (const s of plan?.seasons ?? []) if (s?.cover || s?.after === 'cover') return typeof s.cover === 'string' ? s.cover : true; return null; };
const secondOf = plan => (plan?.seasons ?? []).find(s => s?.second && s.second.ok !== false && typeof s.second.crop === 'string')?.second.crop ?? null;
const varietyOf = plan => (plan?.seasons ?? []).find(s => typeof s?.variety === 'string' && s.variety)?.variety ?? null;
// A plan's name in two parts: the crops it grows (base) and what it changes from today (a cover crop, a second crop, a variety, or the engine's own words). optionLabel() joins them; the cards show them on two lines.
export function labelParts(plan, result) {
  const base = planName(plan), cur = result?.current;
  if (!plan || !cur || plan === cur || plan.id === cur.id) return { base, change: '', how: '' };
  const changes = [], cv = coverOf(plan), sc = secondOf(plan), va = varietyOf(plan);
  if (cv && !coverOf(cur)) changes.push(cv === true ? 'a cover crop after harvest' : `${lowerFirst(name(cv))} as a cover crop after harvest`);
  if (sc && !secondOf(cur)) changes.push(`a second crop of ${lowerFirst(name(sc))} after harvest`);
  if (va && va !== varietyOf(cur)) changes.push(`a ${va} variety`);
  if (changes.length) return { base, change: changes.join(' and '), how: 'with' };
  return cycleCrops(plan).join() === cycleCrops(cur).join() && typeof plan.name === 'string' && plan.name && plan.name !== base ? { base, change: lowerFirst(plan.name), how: 'paren' } : { base, change: '', how: '' };
}
export function optionLabel(plan, result) {
  const { base, change, how } = labelParts(plan, result);
  return how === 'with' ? `${base}, with ${change}` : how === 'paren' ? `${base} (${change})` : base;
}
const listWords = items => items.length < 2 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
// One line for a card: what this plan changes from what is grown now. Today's own card says what it is.
export function changeLine(plan, result) {
  const cur = result?.current;
  if (!plan || plan === cur || plan.id === cur?.id) return 'Your rotation today';
  const now = cycleCrops(cur), mine = cycleCrops(plan), added = [...new Set(mine.filter(c => !now.includes(c)))].map(c => lowerFirst(name(c))), dropped = [...new Set(now.filter(c => !mine.includes(c)))].map(c => lowerFirst(name(c)));
  const { change, how } = labelParts(plan, result), bits = [added.length ? `adds ${listWords(added)}` : '', dropped.length ? `drops ${listWords(dropped)}` : '', change ? (how === 'with' ? `with ${change}` : change) : ''].filter(Boolean);
  return bits.length ? `What changes: ${bits.join(', ')}` : 'The same crops as today';
}
// One label for each plan of an answer, and never the same twice: a plan that still shares its label gets a number.
export function optionLabels(result) {
  const list = allPlans(result), out = new Map(), seen = new Map();
  for (const p of list) { const l = optionLabel(p, result), n = (seen.get(l) ?? 0) + 1; seen.set(l, n); out.set(p, n > 1 ? `${l} (option ${n})` : l); }
  return out;
}
// What covers the ground after each harvest, in words, from the plan's own data. A season with no `after` says nothing.
// The same lines said once for each kind of cover: "After corn and soybeans: leftover crop residue: a thin cover", never one line for each year.
export function coverSummary(plan) {
  const groups = new Map();
  for (const l of coverLines(plan)) { const g = groups.get(l.words) ?? { words: l.words, crops: [], until: l.until }; if (!g.crops.includes(l.crop)) g.crops.push(l.crop); groups.set(l.words, g); }
  return [...groups.values()].map(g => ({ crops: g.crops, words: g.words, until: g.until }));
}
export function coverLines(plan) {
  return (plan?.seasons ?? []).filter(s => Object.hasOwn(AFTER_WORDS, s.after)).map(s => ({ year: s.year, crop: name(s.crop), words: AFTER_WORDS[s.after], until: dayWords(s.residueUntil) }));
}
// The sowing windows a plan names (a late harvest squeezes them): only dates the plan carries.
export function windowLines(plan) {
  return (plan?.seasons ?? []).filter(s => s.window && isDay(s.window.earliest) && isDay(s.window.latest)).map(s => ({ crop: name(s.crop), sow: dayWords(s.sow), earliest: dayWords(s.window.earliest), latest: dayWords(s.window.latest) }));
}
// A plan the engine says does not suit this place has NO score number (a number would read as a recommendation); it says why in words. A plan that only just suits keeps its number and says to ask farmers near you.
export const FIT_WORDS = Object.freeze({ fails: 'Does not suit this place', borderline: 'Only just suits: ask farmers near you' });
export function fitNote(plan) {
  if (plan?.flag === 'fails') { const why = [plan.fit?.why, plan.fit?.reason, plan.fitWhy].find(t => typeof t === 'string' && t.trim()); return `${FIT_WORDS.fails}.${why ? ` ${why.trim()}` : ' Crophalo’s own crop check says it cannot be grown here with this water.'}`; }
  return plan?.flag === 'borderline' ? `${FIT_WORDS.borderline}.` : '';
}
export const hasScore = plan => plan?.flag !== 'fails' && fin(plan?.score);
const scoreWord = plan => (plan?.flag === 'borderline' ? 'Only just suits' : plan.score >= 70 ? 'Good fit' : plan.score >= 50 ? 'OK fit' : 'Poor fit');
// The score: a ring that holds only the number, and its word beside or under it, so the word can never spill out of the circle at any width or text size.
const scoreRing = (score, word) => fin(score) ? `<span class="rv-score"><span class="rv-ring" role="img" aria-label="${esc(`Score ${Math.round(score)} out of 100: ${word}`)}"><b>${Math.round(score)}</b></span><span class="rv-word">${esc(word)}</span></span>` : '';
const planRing = plan => (hasScore(plan) ? scoreRing(plan.score, scoreWord(plan)) : '');
// A plan that does not suit here carries no score (js/engine.js): it is named for what it is, with the engine's reason (fitWhy), never kept as a suggestion.
const unsuited = plan => plan?.flag === 'fails' && !fin(plan?.score);
export const NO_FIT_WORDS = 'What you grow now doesn’t suit here';
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
  if (state?.soilTest) out.push('Soil: from your own soil test. It replaces the map’s guess for what you typed.');
  else if (state?.soilSurveyLine) out.push(state.soilSurveyLine);
  else if (state?.soil?.mode === 'assumed') out.push('Soil: an average loam is assumed until the soil lookup answers. Nothing was measured here.');
  else if (state?.soil?.mode === 'manual') out.push('Soil: as you described it.');
  else if (state?.soil?.mode === 'map') out.push(`Soil: ${SOIL_MAP_WORDS[state.soil.texture] ?? 'not named'}, from the soil map. Nothing was measured on this field.`);
  if (state?.farm?.irrigation === 'none') out.push('Water: rain only. The field is not irrigated.');
  else if (state?.farm?.irrigation) out.push(`Water: ${state.farm.irrigation === 'limited' ? 'limited irrigation' : 'irrigated as needed'}.`);
  else out.push('Water: not known, so rain only is assumed.');
  out.push(state?.area ? `Outline: the one you drew${fin(state.area.ha) ? ` (${state.area.ha.toFixed(1)} ha)` : ''}.` : 'Outline: estimated as a 10 ha square around the pin, because none was drawn.');
  return out;
}

// ---- which plan goes to My Farm as the proposed one: the one the farmer chose to try; else the engine's suggestion when it is a change; else, when the suggestion is to keep what is grown now,
// the best-scoring other plan that holds up (the engine's plan.flag is 'holds'); else the suggestion itself.
// The same plan is the same id, or the same crops with the same cover crop, second crop and variety: a cover-crop version of today's rotation is a different plan, and can be tried.
const signature = plan => [crops(plan).join('>'), coverOf(plan), secondOf(plan), varietyOf(plan)].join('|');
const samePlan = (a, b) => !!a && !!b && (a.id === b.id || signature(a) === signature(b));
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
export const farmPlans = (result, chosenId = null) => { const pp = proposedPlan(result, chosenId).plan; return { current: { ...result.current, kind: 'current', name: planName(result.current) }, proposed: { ...pp, kind: 'proposed', name: optionLabel(pp, result) } }; };   // My farm names each plan the same way the report does; the engine's id stays
export const PROPOSED_WORDS = Object.freeze({ chosen: 'The plan you chose to try', recommended: 'Our suggestion', best: 'The best option that holds up' });

// ---- Overview
// ctx: { state, today: 'YYYY-MM-DD' }. result: the engine's answer, or null / { ok: false } when it is not read yet.
export function overviewHTML(result, ctx = {}) {
  const head = `<section class="rv-sec" aria-labelledby="ovTitle"><h2 id="ovTitle">Overview</h2>`;
  if (!result || result.ok === false || !result.recommended) return `${head}<div class="rv-notread" role="status"><p>${esc(result?.reason || NOT_READ)}</p></div>${assumptionsHTML(ctx.state)}</section>`;
  const rec = result.recommended, cur = result.current, same = samePlan(rec, cur), alt = proposedPlan(result, ctx.chosen), worth = betterOptions(result).slice(0, 2);
  const noFit = same && unsuited(cur), nowLabel = noFit ? 'Now' : 'Now (our suggestion: keep it)';   // what is grown now does not suit, and nothing else leads clearly: said, never "keep it"
  const headline = noFit ? NO_FIT_WORDS : same ? `Keep ${planName(cur)}` : `Try ${optionLabel(rec, result)}`;
  const evidence = Array.isArray(result.evidence) ? result.evidence : [];
  const cols = same ? (alt.plan && !samePlan(alt.plan, cur) ? [[nowLabel, cur], [alt.why === 'chosen' ? (ctx.preselected ? PRESELECT_WORDS : 'The plan you chose to try') : 'Worth trying', alt.plan]] : [[nowLabel, cur]]) : [['Now', cur], ['Suggested', rec]];
  const cover = cols.map(([label, p]) => ({ label, plan: p, lines: coverLines(p) }));
  return `${head}${supportHTML()}
    <article class="card rv-answer" id="answer">
      <div class="rv-answer-main">
        <p class="eyebrow">Our suggestion ${infoButton(unionSources(evidence), 'the suggestion')}</p>
        <div class="rv-headrow"><h3 class="rv-headline">${esc(headline)}</h3>${planRing(rec)}</div>${same && repeatNote(cur) ? `<p class="cap">${esc(repeatNote(cur))[0].toUpperCase() + esc(repeatNote(cur)).slice(1)}.</p>` : ''}
        <p class="rv-reason"><b>${noFit ? 'Why:' : 'Why it suits this field:'}</b> ${esc(result.reason ?? '')}</p>
      </div>
      <div class="rv-compare" aria-label="Your rotation now and the suggested one">
        ${cover.map(c => `<div class="rv-col${c.plan !== cur ? ' is-rec' : ''}"><h4>${esc(c.label)}${c.plan === cur && !same ? '' : ''}</h4>${cropsRow(c.plan)}${bareLine(c.plan)}${c.lines.length ? `<ul class="rv-cover">${coverSummary(c.plan).map(l => `<li><b>After ${esc(listWords(l.crops.map(lowerFirst)))}:</b> ${esc(l.words)}${l.until ? ` (until ${esc(l.until)})` : ''}</li>`).join('')}</ul>` : ''}</div>`).join('')}
      </div>
      ${caveatHTML(same && alt.plan ? alt.plan : rec)}
      ${sureHTML(result)}
    </article>
    ${bareHTML(result, cols.map(c => c[1]))}${exposureHTML(result)}
    ${same && worth.length ? worthHTML(worth, result, ctx.chosen) : ''}
    ${evidence.length ? `<details class="fold-card" id="ovEvidence"><summary><span class="t">What this is based on</span></summary><div class="fold-b"><ul class="rv-evidence">${evidence.map(e => `<li>${esc(e.text)} ${infoButton(e.sources, e.text)}</li>`).join('')}</ul></div></details>` : ''}
    ${assumptionsHTML(ctx.state)}</section>`;
}
const bareLine = plan => { const b = bareInfo(plan); return b ? `<p class="rv-bareline"><b>Bare soil:</b> ${b.n} ${b.n === 1 ? 'month' : 'months'}${b.names.length ? ` (${esc(b.names.map(n => n.slice(0, 3)).join(', '))})` : ''}</p>` : ''; };
// "Months your soil is bare": for each plan shown, from the engine's bareMonths; without them, the Calendar is where the ground is drawn month by month.
export function bareHTML(result, plans) {
  const rows = plans.filter(Boolean).map((p, i) => ({ p, b: bareInfo(p), who: p === result.current || p.id === result.current?.id ? 'What you grow now' : 'Suggested' }));
  return `<section class="rv-bare card pad" aria-labelledby="ovBare"><h3 id="ovBare">Months your soil is bare</h3>${rows.some(r => r.b) ? `<ul>${rows.map(r => `<li><b>${esc(r.who)}:</b> ${r.b ? `${r.b.n} ${r.b.n === 1 ? 'month' : 'months'}${r.b.names.length ? `, ${esc(r.b.names.join(', '))}` : ''}` : 'not worked out'}</li>`).join('')}</ul>` : '<p class="cap">Not worked out as a count here yet. The Calendar tab draws, month by month, when the ground holds a crop, residue, a living cover or nothing.</p>'}</section>`;
}
// "When your current crops are most exposed": the engine's exposure rows (a month, a hazard, a crop and its stage, a count of tested years, a source); without them, where the counts are.
export function exposureHTML(result) {
  const rows = (Array.isArray(result?.exposure) ? result.exposure : []).filter(r => r && typeof r.hazard === 'string');
  const line = r => `${r.crop ? `${esc(name(r.crop))}${r.stage ? `, ${esc(r.stage)}` : ''}: ` : ''}${esc(r.hazard)}${fin(r.month) && r.month >= 1 && r.month <= 12 ? ` in ${MONTHS[r.month - 1]}` : ''}${fin(r.count) ? `, in ${Math.round(r.count)} of the tested years` : ''} ${r.source ? infoButton([r.source], r.hazard) : ''}`;
  return `<section class="rv-exposure card pad" aria-labelledby="ovExpo"><h3 id="ovExpo">When your current crops are most exposed</h3>${rows.length ? `<ul>${rows.map(r => `<li>${line(r)}</li>`).join('')}</ul>` : '<p class="cap">Not worked out here yet. The land history counts, year by year, the seasons that were hurt and the close calls.</p>'}</section>`;
}
export function worthHTML(list, result, chosenId) {
  return `<section class="rv-worth" aria-labelledby="ovWorth"><h3 id="ovWorth">Options worth trying</h3><p class="cap">${unsuited(result?.current) ? `${NO_FIT_WORDS}. These plans hold up on your field’s weather record. Ask farmers near you before you change.` : 'Our suggestion is to keep what you grow now. These plans score higher or about the same, and hold up on your field’s weather record.'}</p>
    <ul class="rv-worth-list">${list.map(p => `<li class="card pad"><div><b>${esc(optionLabel(p, result))}</b>${fin(p.score) ? ` <span class="chip">Score ${Math.round(p.score)}</span>` : ''}${fin(result.current?.score) ? ` <span class="cap">(what you grow now: ${Math.round(result.current.score)})</span>` : ''}</div>${cropsRow(p)}
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
  return `<div class="rv-sure"><p class="rv-sure-line"><b>How sure this is:</b> ${esc(level)}. ${esc(typeof result.sureWhy === 'string' && result.sureWhy.trim() ? result.sureWhy.trim() : SURE_WORDS[level])}</p>
    <details class="fold-card" id="ovSure"><summary><span class="t">How sure this is: what local knowledge would change it</span></summary><div class="fold-b">
      ${gaps.length ? `<h4>What local knowledge would change it</h4><ul>${gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}${risks.length ? `<h4>Risks to check locally</h4><ul>${risks.map(g => `<li>${esc(g)}</li>`).join('')}</ul>` : ''}<p class="rv-adviser"><b>${esc(ASK_ADVISER)}</b></p>
      <p class="cap">The score is a guide. It is not a yield and not a chance of success.</p></div></details></div>`;
}
export function assumptionsHTML(state) {
  const list = assumptions(state);
  return `<section class="rv-assume" aria-labelledby="ovAssume"><h3 id="ovAssume">What is assumed</h3><ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`;
}

// ---- Options
// selectedId: the plan whose detail shows. Cards: what you grow now, then the suggestion, then the others.
// Every plan once: when the suggestion is to keep what is grown now, the suggestion and today's plan are one card, not two.
export function allPlans(result) {
  if (!result || !result.recommended) return [];
  const out = [];
  for (const p of [result.current, result.recommended, ...(Array.isArray(result.others) ? result.others : [])]) if (p && !out.some(q => q === p || (p.id !== undefined && q.id === p.id))) out.push(p);
  return out;
}
// The rough money line under an option is drawn by js/money-view.js; it is handed in here so this file only has to call it.
let moneyHook = () => '';
export const setMoneyHook = fn => { moneyHook = typeof fn === 'function' ? fn : () => ''; };

// ---- Compare strategies (the challenge: at least three rotations, the one grown now among them, each with why, evidence, benefits, gaps and risks to check locally)
export const SUPPORT_LINE = 'Crophalo supports your judgment. It does not replace it, or local advice.';
export const ASK_ADVISER = 'Ask a farm adviser or farmers near you before you change your rotation.';
export const supportHTML = () => `<p class="rv-support cap">${esc(SUPPORT_LINE)}</p>`;
export const isKeepAnswer = result => result?.recommended === result?.current || (!!result?.recommended && result.recommended.id === result.current?.id);
const isKeep = result => result?.recommended === result?.current || (!!result?.recommended && result.recommended.id === result.current?.id);
// The three strategies always shown first: what you grow now, our suggestion (or the best other option when the honest answer is to keep), and another option; the rest follow. A plan that does not suit never takes one of the three places.
export function strategies(result) {
  const all = allPlans(result), cur = result.current, keep = isKeep(result), others = all.filter(p => p !== cur && p.id !== cur.id);
  const suits = p => p.flag !== 'fails', byScore = (a, b) => (hasScore(b) ? b.score : -1) - (hasScore(a) ? a.score : -1);
  const ranked = others.filter(suits).sort(byScore);
  const second = keep ? ranked[0] ?? null : result.recommended, third = (keep ? ranked.slice(1) : ranked.filter(p => p !== second && p.id !== second?.id))[0] ?? null;
  const roles = new Map([[cur, 'now']]); if (second) roles.set(second, keep ? 'worth' : 'suggest'); if (third) roles.set(third, 'another');
  const first = [...roles.keys()], more = others.filter(p => !roles.has(p));
  const failing = others.filter(p => !suits(p)).length;
  const fewWhy = first.length >= 3 ? '' : (typeof result.fewWhy === 'string' && result.fewWhy.trim() ? result.fewWhy.trim() : `Only ${first.length === 1 ? 'one strategy is' : `${first.length} strategies are`} shown: ${failing ? `${failing} other ${failing === 1 ? 'rotation does' : 'rotations do'} not suit this place (listed below)` : 'Crophalo found no other rotation that suits this place'}.`);
  return { first, more, roles, fewWhy };
}
const ROLE_TAG = { now: 'What you grow now', suggest: 'Our suggestion', worth: 'An option worth a look', another: 'Another option' };
const tag = (plan, result) => { const role = strategies(result).roles.get(plan); return role === 'now' && isKeep(result) ? 'What you grow now, our suggestion' : (ROLE_TAG[role] ?? 'Option'); };
// The numbers of the five dimensions, from whatever the engine gives: a facet, a score, or nothing (then the row says it was not worked out).
const SCORE_WORD = n => (n >= 70 ? 'Strong' : n >= 50 ? 'Fair' : 'Weak');
const num = x => (fin(x) ? Math.round(x) : fin(x?.score) ? Math.round(x.score) : null);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function bareInfo(plan) {
  const b = plan?.bareMonths; if (b == null) return null;
  const list = Array.isArray(b) ? b.filter(m => fin(m) && m >= 1 && m <= 12) : null, n = list ? list.length : fin(b) ? Math.round(b) : null;
  return n === null ? null : { n, names: list ? list.map(m => MONTHS[m - 1]) : [] };
}
export const DIMENSIONS = Object.freeze([
  { key: 'water', label: 'Water use', get: p => p.facets?.waterUse ?? p.scores?.water },
  { key: 'organic', label: 'Soil organic matter', get: p => p.facets?.organic ?? p.scores?.soil },
  { key: 'erosion', label: 'Erosion (wash-off)', get: p => p.scores?.erosion },
  { key: 'pest', label: 'Breaking pest cycles', get: p => p.facets?.pest ?? p.pest },
  { key: 'nitrogen', label: 'Nitrogen from legumes', get: p => p.facets?.nitrogen },
  { key: 'forage', label: 'Forage', get: p => p.facets?.forage },
  { key: 'market', label: 'Income and market', get: p => p.facets?.market ?? p.scores?.income },
  { key: 'weather', label: 'Weather safety', get: p => p.scores?.weather },
]);
export function dimensionOf(plan, d) {
  if (plan?.flag === 'fails') return { n: null, words: 'not scored: does not suit this place', text: '' };
  const raw = d.get(plan), n = num(raw), text = typeof raw?.text === 'string' ? raw.text : typeof raw === 'string' ? raw : '';
  return n === null && !text ? { n: null, words: '–', text: '' } : { n, words: n === null ? text : SCORE_WORD(n), text: n === null ? '' : text };
}
// Every strategy side by side, in the challenge's own dimensions, in words as well as numbers; a cell that differs from what you grow now is marked with the difference.
export function compareHTML(result, labels = optionLabels(result)) {
  const { first, roles } = strategies(result), cur = result?.current;
  if (first.length < 2) return '';
  const bare = p => bareInfo(p), delta = (a, b, lowerBetter) => (a === null || b === null || a === b ? '' : ` (${a > b ? '+' : '−'}${Math.abs(a - b)})`), better = (a, b, lowerBetter) => (lowerBetter ? a < b : a > b);
  const cellFor = (p, d) => { const v = dimensionOf(p, d), c = dimensionOf(cur, d), diff = p !== cur && v.n !== null && c.n !== null && v.n !== c.n;
    return `<td${diff ? ` class="diff ${better(v.n, c.n, false) ? 'up' : 'down'}"` : ''}>${v.n !== null ? `<b>${v.n}</b>${diff ? ` (${v.n > c.n ? '+' : '−'}${Math.abs(v.n - c.n)})` : ''} <span class="cap">${esc(v.words)}</span>` : `<span class="cap">${esc(v.words)}</span>`}${v.text ? `<br><span class="cap">${esc(v.text)}</span>` : ''}</td>`; };
  const bareCell = p => { const b = bare(p), c = bare(cur); if (!b) return '<td><span class="cap">–</span></td>'; const diff = p !== cur && c && b.n !== c.n;
    return `<td${diff ? ` class="diff ${b.n < c.n ? 'up' : 'down'}"` : ''}><b>${b.n}</b> ${b.n === 1 ? 'month' : 'months'}${diff ? ` (${b.n > c.n ? '+' : '−'}${Math.abs(b.n - c.n)})` : ''}${b.names.length ? `<br><span class="cap">${esc(b.names.map(n => n.slice(0, 3)).join(', '))}</span>` : ''}</td>`; };
  const overall = p => (hasScore(p) ? `<td${p !== cur && fin(cur.score) && Math.round(p.score) !== Math.round(cur.score) ? ` class="diff ${p.score > cur.score ? 'up' : 'down'}"` : ''}><b>${Math.round(p.score)}</b>${p !== cur && fin(cur.score) && Math.round(p.score) !== Math.round(cur.score) ? ` (${p.score > cur.score ? '+' : '−'}${Math.abs(Math.round(p.score) - Math.round(cur.score))})` : ''} <span class="cap">${esc(scoreWord(p))}</span></td>` : '<td><span class="cap">no score</span></td>');
  return `<section class="rv-compare-sec" aria-labelledby="cmpTitle"><h3 id="cmpTitle">Side by side</h3><p class="cap">Each number is 0 to 100, higher is better. A difference from what you grow now is marked, for example (+5).  A dash means Crophalo has no figure for it, never zero.</p>
    <div class="tbl" tabindex="0" role="region" aria-label="The comparison table"><table class="rv-cmp"><caption class="sr">The strategies side by side, with the difference from what you grow now</caption><thead><tr><th scope="col">What</th>${first.map(p => `<th scope="col"><span class="cmp-kind">${esc(ROLE_TAG[roles.get(p)])}</span>${esc(labels.get(p) ?? optionLabel(p, result))}</th>`).join('')}</tr></thead>
    <tbody><tr><th scope="row">Crops</th>${first.map(p => `<td>${esc(planName(p))}${repeatNote(p) ? `<br><span class="cap">${esc(repeatNote(p))}</span>` : ''}</td>`).join('')}</tr><tr><th scope="row">What changes</th>${first.map(p => `<td>${esc(changeLine(p, result).replace(/^What changes: /, ''))}</td>`).join('')}</tr>
    <tr><th scope="row">Overall score</th>${first.map(overall).join('')}</tr>${DIMENSIONS.filter(d => first.some(p => dimensionOf(p, d).n !== null || dimensionOf(p, d).text)).map(d => `<tr><th scope="row">${esc(d.label)}</th>${first.map(p => cellFor(p, d)).join('')}</tr>`).join('')}<tr><th scope="row">Months of bare soil</th>${first.map(bareCell).join('')}</tr></tbody></table></div></section>`;
}
export function optionCardHTML(plan, result, selected, chosenId = null, label = null) {
  const t = chosenId === plan.id ? 'Chosen to try' : tag(plan, result), parts = labelParts(plan, result), role = strategies(result).roles.get(plan), rec = role === 'suggest' || (role === 'now' && isKeep(result));
  const score = hasScore(plan) ? `<span class="oc-score">${planRing(plan)}</span>` : (plan.flag === 'fails' ? `<span class="oc-score"><span class="chip warn">No score${typeof plan.fit === 'string' && plan.fit.trim() ? ` · ${esc(plan.fit.trim())}` : ''}</span></span>` : '<span class="oc-score"><span class="chip">Score not read yet</span></span>');
  const title = label && label !== optionLabel(plan, result) ? label : parts.base;   // a plan that still shares its name gets its number (option 2), kept as given
  return `<button type="button" class="card act ocard${selected ? ' on' : ''}${rec ? ' is-rec' : ''}" data-plan="${esc(plan.id)}" aria-pressed="${selected}"><span class="oc-top"><span class="ocard-tag chip${rec ? ' rec' : ''}">${rec ? '<svg class="ic" aria-hidden="true"><use href="#i-star"/></svg>' : ''}${esc(t)}</span>${score}</span>
    <h3>${esc(title)}</h3>${repeatNote(plan) ? `<span class="oc-rep">${esc(repeatNote(plan)[0].toUpperCase() + repeatNote(plan).slice(1))}</span>` : ''}${cropsRow(plan)}<span class="oc-change">${esc(changeLine(plan, result))}</span>${fitNote(plan) ? `<span class="cap rv-fit ${plan.flag}">${esc(fitNote(plan))}</span>` : ''}${moneyHook(plan, 'card')}</button>`;
}
const datasets = sources => { const names = sourceNotes(sources).map(n => n.name); return names.length ? `<span class="cap rv-dataset">Dataset: ${esc(names.join('; '))}</span>` : ''; };
// The five sections of a strategy, titled in the challenge's words. The engine's own fields when it gives them; else what it already gives (why, evidence, gaps, risks).
export function strategyDetail(plan, result) {
  const isNow = plan === result.current || plan.id === result.current?.id, rec = plan === result.recommended || plan.id === result.recommended?.id, withResult = isNow || rec;
  const whyLines = Array.isArray(plan.whyLines) ? plan.whyLines.filter(t => typeof t === 'string' && t.trim()) : [];
  const why = isNow ? ['What you grow now: the yardstick for every other strategy.'] : whyLines.length ? whyLines : [plan.why || (rec ? result.reason : '')].filter(Boolean);
  const evidence = (Array.isArray(plan.evidence) ? plan.evidence : withResult && Array.isArray(result.evidence) ? result.evidence : []).filter(e => e && typeof e.text === 'string');
  const benefits = Array.isArray(plan.benefits) && plan.benefits.length ? plan.benefits.filter(b => b && typeof b.text === 'string') : whyLines.map(text => ({ kind: '', text }));
  const gaps = (Array.isArray(plan.gaps) ? plan.gaps : withResult && Array.isArray(result.gaps) ? result.gaps : []).filter(t => typeof t === 'string');
  const risks = (Array.isArray(plan.review) ? plan.review : Array.isArray(plan.risks) ? plan.risks : rec && Array.isArray(result.risks) ? result.risks : []).filter(t => typeof t === 'string');
  return { why, evidence, benefits, gaps, risks, isNow };
}
export function optionDetailHTML(plan, result, chosenId = null, label = null) {
  const d = strategyDetail(plan, result), isNow = d.isNow;
  const sec = (title, inner) => `<section class="sd-sec"><h4>${esc(title)}</h4>${inner}</section>`;
  const ul = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  const none = text => `<p class="cap">${esc(text)}</p>`;
  const KIND = { soil: 'Soil', water: 'Water', erosion: 'Erosion', pest: 'Pests', nitrogen: 'Nitrogen', organic: 'Organic matter', forage: 'Forage', income: 'Income', weather: 'Weather' };
  const years = (plan.seasons ?? []).map(s => `<li><b>Year ${s.year}:</b> ${esc(name(s.crop))}${isDay(s.sow) ? `, sown about ${esc(dayWords(s.sow))}` : ''}${isDay(s.harvest) ? `, harvested about ${esc(dayWords(s.harvest))}` : ''}</li>`);
  const cover = coverSummary(plan).map(l => `<b>After ${esc(listWords(l.crops.map(lowerFirst)))}:</b> ${esc(l.words)}${l.until ? ` (until ${esc(l.until)})` : ''}`);
  const fold = (title, items, id) => `<details class="fold-card" id="${id}"><summary><span class="t">${esc(title)} <span class="count soft">${items.length}</span></span></summary><div class="fold-b">${items.length ? ul(items) : '<p class="cap">Nothing to add here.</p>'}</div></details>`;
  return `<section class="card pad sdetail" id="sdetail" aria-live="polite"><h3>${esc(label ?? optionLabel(plan, result))}</h3>${supportHTML()}
    ${isNow ? '' : `<p><button type="button" class="btn${chosenId === plan.id ? ' chosen' : ''}" data-act="try" data-plan="${esc(plan.id)}" aria-pressed="${chosenId === plan.id}">${chosenId === plan.id ? 'Chosen to try: add it to My Farm' : 'Try this plan'}</button>${chosenId === plan.id ? ` <button type="button" class="btn ghost" data-act="untry" data-plan="${esc(plan.id)}">Use our suggestion instead</button>` : ''}</p>`}
    ${fitNote(plan) ? `<p class="rv-fit ${plan.flag}"><b>${esc(fitNote(plan))}</b></p>` : ''}${moneyHook(plan, 'detail')}
    ${sec('Why it was suggested', d.why.length ? (d.why.length > 1 ? ul(d.why.map(esc)) : `<p>${esc(d.why[0])}</p>`) : none('Why it is here has not been read yet.'))}
    ${sec('What evidence supports it', d.evidence.length ? ul(d.evidence.map(e => `${esc(e.text)} ${infoButton(e.sources, e.text)}${datasets(e.sources)}`)) : none('No evidence lines were given for this strategy yet.'))}
    ${sec('What benefits it may offer', d.benefits.length ? ul(d.benefits.map(b => `${b.kind && KIND[b.kind] ? `<span class="chip">${esc(KIND[b.kind])}</span> ` : ''}${esc(b.text)}`)) : none('Benefits have not been worked out for this strategy yet.'))}
    ${plan.flag === 'fails' ? '' : `${barsHTML(plan.scores)}${!plan.scores ? '<p class="cap">Scores are not read yet for this strategy.</p>' : ''}`}
    ${sec('Where information is missing', d.gaps.length ? ul(d.gaps.map(esc)) : none('No gaps were listed for this strategy yet. That does not mean there are none.'))}
    ${sec('Risks to check locally', `${d.risks.length ? ul(d.risks.map(esc)) : none('No risks were listed for this strategy yet.')}<p class="rv-adviser"><b>${esc(ASK_ADVISER)}</b></p>`)}
    <div class="folds">${fold('Your rotation, year by year', years, 'dYears')}${fold('When is the soil covered?', cover, 'dCover')}</div></section>`;
}
export function scoresFoldHTML(result) {
  return `<details class="fold-card" id="howScores"><summary><span class="t">How the scores work</span></summary><div class="fold-b">
    <p>Each plan is scored from 0 to 100 on the things in the table. How much each counts comes from what you said matters most.</p>
    <ul class="cap">${Object.values(SCORE_NAMES).map(n => `<li>${esc(n)}: how well the plan does on this, worse to better.</li>`).join('')}</ul>
    <p class="cap">A score is a guide to compare plans on this field. It is not a yield and not a chance of success. A plan that does not suit this place has no score.</p></div></details>`;
}
export function optionsHTML(result, selectedId, chosenId = null) {
  const head = '<section class="rv-sec" aria-labelledby="opTitle"><h2 id="opTitle">Compare strategies</h2>';
  if (!result || result.ok === false || !result.recommended) return `${head}<div class="rv-notread" role="status"><p>${esc(result?.reason || NOT_READ)}</p></div></section>`;
  const { first, more, fewWhy } = strategies(result), plans = allPlans(result), chosen = plans.find(p => p.id === selectedId) ?? result.recommended, labels = optionLabels(result);
  const card = p => optionCardHTML(p, result, p === chosen, chosenId, labels.get(p));
  return `${head}${supportHTML()}<p class="lead">Three strategies, the one you grow now first. Tap one to see why, the evidence, the benefits, what is missing and what to check locally.</p>
    <div class="grid opts" role="group" aria-label="Strategies">${first.map(card).join('')}</div>${fewWhy ? `<p class="cap rv-few" role="note">${esc(fewWhy)}</p>` : ''}
    ${more.length ? `<h3 class="sub">More options</h3><div class="grid opts" role="group" aria-label="More options">${more.map(card).join('')}</div>` : ''}
    ${compareHTML(result, labels)}${optionDetailHTML(chosen, result, chosenId, labels.get(chosen))}${scoresFoldHTML(result)}</section>`;
}

// ---- the other five tabs: plainly, what they will hold
export const TABS = Object.freeze([
  { id: 'overview', label: 'Overview', icon: 'i-star' }, { id: 'options', label: 'Compare strategies', icon: 'i-leaf' }, { id: 'weather', label: 'Weather', icon: 'i-cloud' }, { id: 'calendar', label: 'Calendar', icon: 'i-cal' },
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
  return `<section class="rv-loading" aria-labelledby="ldTitle" aria-busy="${done < asked}"><h1 id="ldTitle">Building your full report</h1>
    <div class="rv-macro"></div>
    <p class="lead">Crophalo is asking NASA and partner services about this exact spot. A new place can take a minute the first time; it is faster afterwards.</p>
    <p class="rv-meter"><span class="sr">Sources answered</span><progress max="${asked || 1}" value="${done}" aria-label="Sources answered">${done} of ${asked}</progress></p><p class="cap" role="status">${done} of ${asked} ${asked === 1 ? 'source' : 'sources'} answered</p>
    <ul class="rv-sources">${rows.filter(r => r.state !== 'skip').map(r => `<li class="rv-src is-${r.state}"><span class="dot ${r.state === 'ok' ? 'good' : r.state === 'fail' ? 'warn' : 'busy'}" aria-hidden="true"></span><span><b>${esc(r.label)}</b>${r.state === 'fail' ? `<br><small>${esc(r.reason ?? '')}</small>` : ''}${r.state === 'ok' ? '<br><small>Answered</small>' : r.state === 'wait' ? '<br><small>Waiting…</small>' : ''}</span>${infoButton([r.key], r.label)}</li>`).join('')}</ul></section>`;
}

// ---- what the one-page report (js/letter-view.js) reads from here
export const moneyLine = (plan, where) => moneyHook(plan, where);
export { cropsRow, scoreWord, unionSources, ROLE_TAG };
