// Step 4 of the setup, "What do you want most?": one tap on a picture, a few optional goals, and one folded group "What limits you".
// Every choice says in one line what it changes in the comparison. It draws HTML for js/wizard.js and reads the step's events back.
// The goals replace the old "I keep animals" switch and the drill switch replaces "I can seed cover crops", so nothing is asked twice; the water answer stays on step 3.
// Checked by scripts/test_wizard.mjs (the HTML and the answers, without a page) and scripts/e2e_inputs.mjs (keys, 320 px, axe, motion).
import { esc, MATTERS, TILLAGE, HABITS, STEPS, WORDS as M3 } from './words.js';
import { GOALS, SELL, TILL_DOES, PART_NAMES, INPUT_WORDS as W } from './words.inputs.js';
import { PRIORITY_SETS, MAX_AVOID } from './state.js';
import { cleanGoals, cleanLimits, weightsFor, nudge, proposable } from './inputs.js';
import { cropName } from './crops.js';

const LABOR = HABITS.find(h => h.key === 'labor');
const list = items => items.length < 2 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

// "In the comparison: water fit counts most, then soil health and weather safety." from the weights themselves
export function doesLine(prio) {
  const w = Array.isArray(prio) && prio.length === 5 ? prio : [3, 3, 3, 3, 3], top = Math.max(...w);
  if (w.every(v => v === top)) return W.doesAll;
  const most = PART_NAMES.filter((_, k) => w[k] === top), rest = w.filter(v => v < top), next = rest.length ? Math.max(...rest) : null;
  const then = rest.length && !rest.every(v => v === next) ? list(PART_NAMES.filter((_, k) => w[k] === next)) : '';   // nothing to add when all the others are equal
  return W.doesTop(list(most), then, most.length > 1);
}
export function takenAs(state) {
  const limits = cleanLimits(state.limits), parts = [W.sumTill[state.farm.tillage] ?? W.sumTill.reduced];
  if (limits.noDrill || state.farm.coverOK === false) parts.push(W.sumDrill);
  if (state.farm.labor) parts.push(W.sumLabor);
  if (limits.sell.length) parts.push(W.sumSell(list(limits.sell.map(k => SELL.find(x => x.key === k).title.toLowerCase()))));
  if (state.avoid.length) parts.push(W.sumAvoid(state.avoid.length));
  if (parts.length === 1) parts.push(W.sumNone);
  return W.takenAs(parts.join(', '));
}

const cb = (name, value, on, title, does, id) => `<label class="cbrow in-row"><input type="checkbox" class="sr" name="${name}" value="${esc(value)}"${on ? ' checked' : ''} aria-describedby="${id}"><i class="cbx" aria-hidden="true"></i><span><b>${esc(title)}</b><small id="${id}">${esc(does)}</small></span></label>`;
const sw = (name, value, on, title, does, id, extra = '') => `<label class="swrow in-row"><span><b>${esc(title)}</b><small id="${id}">${esc(does)}</small></span><input type="checkbox" role="switch" class="sr" name="${name}" value="${esc(value)}"${extra}${on ? ' checked' : ''} aria-describedby="${id}"><i class="sw" aria-hidden="true"></i></label>`;

// The step's body. The fold stays open across a redraw when it was open.
export function mattersHTML(state) {
  const goals = cleanGoals(state.goals), limits = cleanLimits(state.limits), open = !!globalThis.document?.querySelector?.('#foldMore')?.open;
  const avoid = state.avoid ?? [];
  const left = proposable().filter(id => !avoid.includes(id)).sort((a, b) => cropName(a).localeCompare(cropName(b)));
  const tiles = MATTERS.map(m => `<label class="choice tile"><input type="radio" class="sr" name="matters" value="${esc(m.value)}"${state.prioPreset === m.value ? ' checked' : ''} aria-describedby="mattersDoes"><svg class="ic" aria-hidden="true"><use href="#${m.icon}"/></svg><b>${esc(m.title)}</b></label>`).join('');
  return `<div class="tiles3 big" role="radiogroup" aria-label="${esc(STEPS[3].heading)}">${tiles}</div>
    <p class="cap in-does" id="mattersDoes">${esc(doesLine(state.prio))}</p>
    <h2 class="sub" id="alsoQ">${esc(W.alsoHead)} <span class="cap">${esc(W.optional)}</span></h2>
    <div class="in-group" role="group" aria-labelledby="alsoQ">${GOALS.map(g => cb('goal', g.key, goals.includes(g.key), g.title, g.does, `goal-${g.key}`)).join('')}</div>
    <details class="fold-card" id="foldMore"${open ? ' open' : ''}><summary><span class="t">${esc(W.limitsHead)} <span class="cap">${esc(W.optional)}</span></span></summary><div class="fold-b in-limits">
      <p class="cap" id="takenAs">${esc(takenAs(state))}</p>
      <h3 class="q">${esc(W.machinesHead)}</h3>
      ${sw('limit', 'noDrill', limits.noDrill || state.farm.coverOK === false, W.noDrill, W.noDrillDoes, 'lim-noDrill')}
      ${sw('habit', 'labor', !!state.farm.labor, LABOR.title, LABOR.sub, 'lim-labor', ' data-habit="labor"')}
      <h3 class="q" id="sellQ">${esc(W.sellHead)}</h3>
      <div class="in-group" role="group" aria-labelledby="sellQ sellLead"><p class="cap" id="sellLead">${esc(W.sellQ)}</p>${SELL.map(x => cb('sell', x.key, limits.sell.includes(x.key), x.title, x.sub, `sell-${x.key}`)).join('')}</div>
      <p class="cap">${esc(W.sellDoes)}</p>
      <h3 class="q">${esc(W.avoidHead)}</h3>
      <label class="field in-avoid-pick"><span>${esc(W.avoidPick)}</span><select id="avoidAdd" name="avoidAdd" aria-describedby="avoidDoes"${avoid.length >= MAX_AVOID ? ' disabled' : ''}><option value="">${esc(W.avoidChoose)}</option>${left.map(id => `<option value="${esc(id)}">${esc(cropName(id))}</option>`).join('')}</select></label>
      ${avoid.length ? `<ul class="in-avoid" aria-label="${esc(W.avoidHead)}">${avoid.map(id => `<li><button type="button" class="chip in-chip" data-unavoid="${esc(id)}" aria-label="${esc(W.avoidRemove(cropName(id)))}">${esc(cropName(id))}<span aria-hidden="true"> ×</span></button></li>`).join('')}</ul>` : `<p class="cap">${esc(W.avoidNone)}</p>`}
      <p class="cap" id="avoidDoes">${esc(W.avoidDoes)}</p>
      <h3 class="q" id="tillQ">${esc(M3.tillage)}</h3>
      <div class="seg" role="radiogroup" aria-labelledby="tillQ" aria-describedby="tillDoes">${TILLAGE.map(t => `<button type="button" role="radio" aria-checked="${state.farm.tillage === t.value}" data-till="${t.value}">${esc(t.title)}</button>`).join('')}</div>
      <p class="cap" id="tillDoes">${esc(TILL_DOES)}</p>
      <details class="disc"><summary>${esc(W.aboutHead)}</summary><ul class="in-about">${W.about.map(line => `<li class="cap">${esc(line)}</li>`).join('')}</ul></details>
    </div></details>`;
}

// ---- the answers. Each returns what the wizard does next ({ focus, say }), or null when the event is not this step's.
export function inputsChange(t, state) {
  const { name, value, checked } = t;
  if (name === 'matters' && t.type === 'radio' && Object.hasOwn(PRIORITY_SETS, value)) { state.prioPreset = value; state.prio = weightsFor(PRIORITY_SETS[value], cleanGoals(state.goals)); return {}; }
  if (name === 'goal') {
    const had = cleanGoals(state.goals), goals = cleanGoals(checked ? [...had, value] : had.filter(k => k !== value));
    if (goals.length === had.length) return {};
    state.goals = goals;
    if (value === 'forage') state.farm.livestock = checked;
    if (value === 'nitrogen') state.prio = state.prioPreset && Object.hasOwn(PRIORITY_SETS, state.prioPreset) ? weightsFor(PRIORITY_SETS[state.prioPreset], goals) : nudge(state.prio, 'nitrogen', checked);
    state.touched.farm = true; return {};
  }
  if (name === 'limit' && value === 'noDrill') { state.limits = { ...cleanLimits(state.limits), noDrill: checked }; state.farm.coverOK = !checked; state.touched.farm = true; return {}; }
  if (name === 'sell') { const l = cleanLimits(state.limits); state.limits = cleanLimits({ ...l, sell: checked ? [...l.sell, value] : l.sell.filter(k => k !== value) }); return {}; }
  if (t.id === 'avoidAdd' && value && proposable().includes(value)) {
    if (!state.avoid.includes(value) && state.avoid.length < MAX_AVOID) state.avoid = [...state.avoid, value];
    return { focus: '#avoidAdd', say: W.avoidAdded(cropName(value)) };
  }
  return null;
}
export function inputsClick(t, state) {
  if (t.dataset?.unavoid !== undefined) { const id = t.dataset.unavoid; state.avoid = state.avoid.filter(x => x !== id); return { focus: '#avoidAdd', say: W.avoidGone(cropName(id)) }; }
  return null;
}
