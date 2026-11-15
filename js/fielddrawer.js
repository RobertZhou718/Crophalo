// The field drawer: a field's name and size, the status line with its one next action, four tabs (Check, Facts, Weather, Remind), and the sheets for Plant and Soil.
// The words and the order of things are pure and tested; the page part takes the farm's parts (store, toast, reminders, forecast) as one object, so nothing here fetches.
// Checked by scripts/test_sim.mjs (the drawer's words) and scripts/e2e_farm.mjs (the drawer in a browser).
import { esc } from './words.js';
import { areaWords, slopeWords } from './geo.js';
import * as S from './simulate.js';

export const TABS = Object.freeze([['check', 'Check'], ['facts', 'Facts'], ['weather', 'Weather'], ['remind', 'Remind']]);
const SOIL_WORDS = { sand: 'Light (sandy, gritty)', loam: 'Loam (mellow, mixed)', silt: 'Silty (smooth, floury)', clay: 'Heavy (clay, sticky)' }, OM_WORDS = { low: 'Pale: low organic matter', med: 'Medium brown: medium', high: 'Dark: high organic matter' };
export const ADDED_WORDS = 'Added to your farm. Open "My farm" in the top bar to see it.';
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---- the words (pure): everything is read from the farm's record; a part whose data has not arrived says "not read yet"
// model: { field, farm, score (S.readScore), cropName(id), forecast ('none' | { alerts[{ id, text, action }], checkedAt }), reminders [] | null, today 'YYYY-MM-DD', sowing { crop, date } | null }
export function summaryLine(model) {
  const f = model.field, size = `${areaWords(f.area)}${f.estimated ? ' (estimated)' : ''}`;
  if (f.kind === 'garden') return `${size} · ${model.cropName(f.tree)}, trees and bushes`;
  return model.crop ? `${size} · ${cap(model.cropName(model.crop))} this season` : `${size} · Ready to plant`;
}
// "Now on <field>": the one next action, in the order the farmer needs it.
export function fieldNow(model) {
  const f = model.field, fc = model.forecast;
  if (fc && fc !== 'none' && fc.alerts?.length) return { text: fc.alerts[0].text, action: { id: 'forecast', label: 'See the forecast' } };
  if (f.kind === 'rot' && !model.crop) return { text: 'Nothing planted yet: choose a crop', action: { id: 'plant', label: 'Plant…' } };
  if (f.kind === 'rot' && model.score.state === 'needs-soil') return { text: 'This field needs a soil before it can be checked', action: { id: 'soil', label: 'Choose the soil' } };
  if (model.sowing && model.reminders && !model.reminders.some(r => !r.done && r.when.slice(0, 10) === model.sowing.date)) return { text: `Sowing ${model.cropName(model.sowing.crop).toLowerCase()} from ${model.sowing.words}: set a reminder`, action: { id: 'remind', label: 'Remind me' } };
  if (fc === 'none' || !fc) return { text: 'Forecast: not read yet', action: null };
  return { text: 'No frost, heat or heavy rain forecast this week', action: { id: 'forecast', label: 'See the forecast' } };
}
// "To do": at most three items from the real data, most pressing first. { text, action? }
export function todoItems(tab, model) {
  const f = model.field, out = [], t = f.terrain;
  const add = (text, action) => out.push(action ? { text, action } : { text });
  if (tab === 'check') {
    if (f.kind === 'garden') add(`Fits this farm's weather: ${model.cropName(f.tree)} is not read yet. Open the report to see it.`);
    else if (!model.crop) add(`Choose what to plant on ${f.name}.`, { id: 'plant', label: 'Plant…' });
    else if (!f.soil) add('Give this field a soil.', { id: 'soil', label: 'Choose the soil' });
    if (f.kind === 'rot' && !t && !f.marks?.slope) add('Slope: not read yet. It is read by itself when you are online.');
    if (model.sowing && model.reminders && !model.reminders.some(r => r.when.slice(0, 10) === model.sowing.date)) add(`No sowing reminder yet (about ${model.sowing.words}).`, { id: 'remind', label: 'Remind me' });
  } else if (tab === 'facts') {
    if (!f.soil) add('Soil: not known yet.', { id: 'soil', label: 'Choose this field\'s soil' });
    else if (f.soil.assumed) add('The soil is assumed until a real one answers.', { id: 'soil', label: 'Choose this field\'s soil' });
    if (!t && !f.marks?.slope) add('Slope: not read yet. It is read by itself when you are online.', { id: 'land', label: 'Mark the land yourself' });
    if (f.estimated) add('The outline is estimated: a square around the pin. Draw the real outline to make it exact.');
  } else if (tab === 'weather') {
    for (const a of (model.forecast !== 'none' && model.forecast?.alerts) || []) add(a.text, a.remind ? { id: 'remind-alert:' + a.id, label: 'Remind me the evening before' } : null);
  } else if (tab === 'remind') {
    for (const s of model.suggestions || []) add(s.title + ' (from your plan)', { id: 'suggest:' + s.key, label: 'Add' });
  }
  return out.slice(0, 3);
}
export function answerLine(tab, model) {
  const f = model.field, sc = model.score;
  if (tab === 'check') {
    if (f.kind === 'garden') return 'Trees and bushes are not scored here';
    if (!model.crop) return 'Nothing planted yet';
    if (sc.state === 'scored') return `${sc.words}${sc.years ? ` · hurt in ${sc.years.hurt} of ${sc.years.total} past years` : ''}`;
    return sc.state === 'needs-soil' ? 'Needs a soil before it can be checked' : 'The check: not read yet';
  }
  if (tab === 'facts') {
    const slope = f.marks?.slope != null ? `slope ${f.marks.slope.toFixed(1)}% (yours)` : f.terrain ? `${slopeWords(f.terrain.slope)} (${f.terrain.slope.toFixed(1)}%)` : 'slope: not read yet';
    const soil = f.soil ? `${f.soil.texture} soil${f.soil.assumed ? ' (assumed)' : ''}` : 'soil not known yet';
    return `${areaWords(f.area)} · ${slope} · ${soil}`;
  }
  if (tab === 'weather') return model.forecast === 'none' || !model.forecast ? 'Forecast: not read yet' : model.forecast.alerts?.length ? model.forecast.alerts.map(a => a.text).join(' · ') : 'No frost, heat or heavy rain this week';
  const n = (model.reminders || []).length;
  return model.reminders == null ? 'Reminders: not read yet' : n ? `${n} reminder${n === 1 ? '' : 's'} for this field` : 'No reminders for this field yet';
}
// The sowing date to suggest a reminder for: the first season of the field's report plan that has not started, else null.
export function nextSowing(field, today, cropName) {
  const plan = field.report?.proposed || field.report?.current;
  const s = plan?.seasons.find(x => x.sow >= today);
  if (!s) return null;
  const [y, m, d] = s.sow.split('-').map(Number);
  return { crop: s.crop, date: s.sow, words: `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}` };
}
// The farmer's own plan wins: its first season's sowing day (MM-DD) this year, or next year when this year's has passed.
export function ownSowing(plan, today, words) {
  const s = plan?.seasons?.[0];
  if (!s?.sowing) return null;
  const y = +today.slice(0, 4), date = `${y}-${s.sowing}` >= today ? `${y}-${s.sowing}` : `${y + 1}-${s.sowing}`;
  return { crop: s.crop, date, words: words(date) };
}
const sameCrops = (plan, rp) => !!rp && JSON.stringify(plan.seasons.map(x => x.crop)) === JSON.stringify(rp.seasons.map(x => x.crop));
const DAYWORDS = iso => { const [y, m, d] = iso.split('-').map(Number); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`; };
// Reminders the plan suggests (sow and harvest dates still ahead), up to three, each with a stable key.
export function suggestions(field, today, cropName, have = []) {
  const plan = field.report?.proposed || field.report?.current, out = [];
  for (const s of plan?.seasons || []) for (const [kind, date, verb] of [['sow', s.sow, 'Sow'], ['harvest', s.harvest, 'Harvest']]) {
    if (date >= today && !have.some(r => r.when.slice(0, 10) === date && r.kind === kind)) out.push({ key: `${kind}:${date}`, kind, date, title: `${verb} ${cropName(s.crop).toLowerCase()}` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
}
// A plan from the Plant sheet's draft, or the reason it cannot be saved.
export function planFromDraft(draft, year) {
  if (!draft.crop) return { refused: 'Choose a crop first.' };
  const season = { crop: draft.crop, cover: draft.cover || null, sowing: /^\d{2}-\d{2}$/.test(draft.sowing || '') ? draft.sowing : null };
  return { plan: { start: year, water: draft.water || null, seasons: [season] } };
}
export const dayMonthToMD = (day, month) => Number.isInteger(+day) && +day >= 1 && +day <= 31 && +month >= 1 && +month <= 12 ? `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';

// ---- the page part: one drawer, rendered into the node given
const st = { tab: 'check', sheet: '', draft: null, step: 0, copy: new Set() };   // the last tab is kept for the visit, not across a reload
export const drawerState = st;
function model(env) {
  const { farm, field } = env.get(), today = env.today(), plan = S.planOf(farm, field.id), crop = S.thisSeasonCrop(farm, field, { year: plan?.start || undefined });
  const reminders = env.reminders?.forField ? env.reminders.forField(farm.id, field.id) : null, have = reminders || [];
  const m = { field, farm, score: S.readScore(farm, field), cropName: env.cropName, forecast: env.forecast?.(field) ?? 'none', reminders, today, crop: crop || field.report?.current?.seasons?.[0]?.crop || null };
  m.sowing = ownSowing(plan, today, DAYWORDS) || (!plan || sameCrops(plan, field.report?.current) ? nextSowing(field, today, env.cropName) : null);   // your own plan wins; the report's dates only while the plan is still the report's
  m.suggestions = env.reminders ? suggestions(field, today, env.cropName, have) : [];
  return m;
}
const btn = (id, label, cls = 'btn lg') => `<button type="button" class="${cls}" data-act="${esc(id)}">${esc(label)}</button>`;
function todoHTML(tab, m) {
  const items = todoItems(tab, m);
  if (!items.length) return `<h3>To do</h3><p class="fw-muted">Nothing to do on this field right now.</p>`;
  return `<h3>To do</h3><ul class="fw-todo">${items.map(i => `<li><span>${esc(i.text)}</span>${i.action ? btn(i.action.id, i.action.label, 'btn lg') : ''}</li>`).join('')}</ul>`;
}
function tabBody(tab, m, env) {
  const f = m.field, ans = `<p class="fw-answer" id="fwAnswer">${esc(answerLine(tab, m))}</p>`;
  if (tab === 'check') {
    const sc = m.score;
    const parts = sc.parts ? `<ul class="fw-bars">${Object.entries({ water: 'Water fit', soil: 'Soil health', income: 'Income', safety: 'Weather safety' }).map(([k, l]) => `<li>${l}: ${Number.isFinite(sc.parts[k]) ? `${Math.round(sc.parts[k])} out of 100` : 'not read yet'}</li>`).join('')}</ul>` : '<p class="fw-muted">How the score is made: not read yet.</p>';
    return ans + todoHTML(tab, m) + `<div class="fw-btnrow">${btn('plant', m.crop || f.kind === 'garden' ? 'Change crop…' : 'Plant…')}${S.planOf(m.farm, f.id) && m.farm.fields.some(o => o.id !== f.id && o.kind === 'rot') ? btn('copy', 'Copy this plan to other fields') : ''}</div><details class="fw-fold"><summary>How the score is made</summary>${parts}</details>
      <details class="fw-fold"><summary>Bare soil</summary><p>${sc.bareMonths != null ? `Bare about ${sc.bareMonths} months a year (lower is better).` : 'Not read yet.'}</p></details>
      <details class="fw-fold"><summary>Crop sales</summary><p>${sc.sales && Number.isFinite(sc.sales.perYear) ? `About ${Math.round(sc.sales.perYear).toLocaleString('en-CA')} a year before costs. An estimate from typical figures, not a promise.` : 'Not worked out: a yield or a price is missing.'}</p></details>`;
  }
  if (tab === 'facts') {
    const soil = f.soil ? `${cap(f.soil.texture)} soil, ${f.soil.om} organic matter${f.soil.assumed ? '. Assumed until a real soil answers.' : f.soil.source ? `. Source: ${esc(f.soil.source)}.` : ''}` : 'Not known yet.';
    const land = f.terrain ? `About ${f.terrain.slope.toFixed(1)}%, ${slopeWords(f.terrain.slope)}.${f.terrain.hMin != null ? ` Height ${Math.round(f.terrain.hMin)} to ${Math.round(f.terrain.hMax)} m.` : ''}` : f.marks?.slope != null ? `${f.marks.slope.toFixed(1)}%, from you.` : 'Not read yet. It is read by itself when you are online.';
    return ans + todoHTML(tab, m) + `<h3>The land</h3><dl class="fw-dl"><dt>Size</dt><dd>${areaWords(f.area)}${f.estimated ? ' (estimated outline)' : ''}</dd><dt>Slope</dt><dd>${esc(land)}</dd></dl>
      <h3>Soil</h3><p>${esc(soil)}</p><div class="fw-btnrow">${btn('soil', f.soil ? 'Change the soil' : 'Choose the soil')}${btn('land', 'Slope you measured')}</div>
      <details class="fw-fold"><summary>Sun and shade</summary><p>Not read yet.</p></details>
      <details class="fw-fold"><summary>Same for the whole farm</summary><p>Soil moisture, groundwater and the crops grown nearby: not read yet.</p></details>`;
  }
  if (tab === 'weather') {
    const fc = m.forecast;
    return ans + todoHTML(tab, m) + (fc === 'none' || !fc ? '<p class="fw-muted">The forecast has not arrived, so Crophalo shows no guess.</p>' : `<p class="fw-muted">Forecast checked ${esc(fc.checkedAt || '')}. Forecast only. For sprays, read the product label or ask a local adviser.</p>`);
  }
  const list = m.reminders || [];
  return ans + `${list.length ? `<h3>Set</h3><ul class="fw-todo">${list.map(r => `<li><span>${esc(r.title)} · ${esc(r.when.slice(0, 10))}${r.done ? ' (done)' : ''}</span></li>`).join('')}</ul>` : ''}` + (env.reminders ? `<h3>Suggested for this field</h3>${todoHTML('remind', m).replace('<h3>To do</h3>', '').replace('Nothing to do on this field right now.', 'Nothing more to suggest from your plan.')}` : '<p class="fw-muted">Reminders are not connected yet.</p>');
}
export function renderDrawer(env) {
  const node = env.node, { farm, field } = env.get();
  if (!field) { node.innerHTML = ''; return; }
  if (st.sheet === 'plant') return renderPlant(env);
  if (st.sheet === 'soil') return renderSoil(env);
  if (st.sheet === 'copy') return renderCopy(env);
  if (st.sheet === 'land') return renderLand(env);
  const m = model(env), now = fieldNow(m);
  node.innerHTML = `<div class="fw-panel-head"><div><h2 id="fwPanelTitle" tabindex="-1">${esc(field.name)}</h2><p class="fw-sub">${esc(summaryLine(m))}</p></div><button type="button" class="btn lg" id="fwClose" aria-label="Close field details">Close</button></div>
  <p class="fw-now"><b>Now on ${esc(field.name)}</b><span>${esc(now.text)}</span>${now.action ? btn(now.action.id, now.action.label, 'btn lg primary') : ''}</p>
  <div class="fw-tabs" role="tablist" aria-label="About this field">${TABS.map(([id, label]) => `<button type="button" role="tab" id="fwtab-${id}" aria-selected="${id === st.tab}" aria-controls="fwtabpanel" tabindex="${id === st.tab ? 0 : -1}" data-tab="${id}">${label}${id === 'remind' && m.reminders?.length ? `<span class="sr">, ${m.reminders.length} set</span> <small aria-hidden="true">${m.reminders.length}</small>` : ''}</button>`).join('')}</div>
  <div role="tabpanel" id="fwtabpanel" aria-labelledby="fwtab-${st.tab}" tabindex="0">${tabBody(st.tab, m, env)}</div>
  <p class="fw-note">A guide, not advice. You decide.</p>`;
  wireDrawer(env, m);
}
function wireDrawer(env, m) {
  const node = env.node;
  const tabs = [...node.querySelectorAll('[role=tab]')];
  tabs.forEach((t, i) => {
    t.onclick = () => { st.tab = t.dataset.tab; renderDrawer(env); node.querySelector(`#fwtab-${st.tab}`)?.focus(); };
    t.onkeydown = e => {
      const to = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
      if (to >= 0) { e.preventDefault(); st.tab = tabs[to].dataset.tab; renderDrawer(env); node.querySelector(`#fwtab-${st.tab}`)?.focus(); }
    };
  });
  node.querySelector('#fwClose').onclick = () => env.close();
  for (const b of node.querySelectorAll('[data-act]')) b.onclick = () => act(env, m, b.dataset.act);
}
function act(env, m, id) {
  const { farm, field } = env.get();
  if (id === 'plant') { st.sheet = 'plant'; st.step = 0; st.draft = { crop: '', sowing: '', water: S.planOf(farm, field.id)?.water || farm.practice.irrigation, cover: '', tree: '' }; renderDrawer(env); node(env).focus(); }
  else if (id === 'soil') {   // an assumed soil is not the farmer's choice, so nothing starts ticked
    st.sheet = 'soil'; const own = field.soil && !field.soil.assumed ? field.soil : null; st.draft = { texture: own?.texture || '', om: own && typeof own.om === 'string' ? own.om : '' }; renderDrawer(env); node(env).focus(); }
  else if (id === 'copy') { st.sheet = 'copy'; st.copy = new Set(); renderDrawer(env); node(env).focus(); }
  else if (id === 'land') { st.sheet = 'land'; renderDrawer(env); node(env).focus(); }
  else if (id === 'forecast') { st.tab = 'weather'; renderDrawer(env); env.node.querySelector('#fwtab-weather')?.focus(); }
  else if (id === 'remind') { const s = nextSowing(field, m.today, env.cropName); if (s && env.reminders?.add) addReminder(env, { title: `Sow ${env.cropName(s.crop).toLowerCase()}`, when: s.date, kind: 'sow' }); else { st.tab = 'remind'; renderDrawer(env); } }
  else if (id.startsWith('suggest:')) { const s = m.suggestions.find(x => `suggest:${x.key}` === id); if (s) addReminder(env, { title: s.title, when: s.date, kind: s.kind }); }
  else if (id.startsWith('remind-alert:')) { const a = (m.forecast?.alerts || []).find(x => `remind-alert:${x.id}` === id); if (a?.remind) addReminder(env, a.remind); }
}
const node = env => env.node.querySelector('#fwPanelTitle');
function addReminder(env, draft) {
  const { farm, field } = env.get(), res = env.reminders.add({ ...draft, farmId: farm.id, fieldId: field.id });
  if (!res?.ok) { env.toast(res?.refused || 'That reminder could not be set.'); return; }
  env.toast(`Reminder set: ${draft.title}`); renderDrawer(env);
}
const leave = (env, focusId) => { st.sheet = ''; st.draft = null; renderDrawer(env); env.node.querySelector(focusId || '#fwPanelTitle')?.focus(); };

// ---- Plant: Crop, When, Water, After harvest; nothing is kept until "Save the plan"
const STEPS = ['Crop', 'When', 'Water', 'After harvest'];
function renderPlant(env) {
  const { farm, field } = env.get(), d = st.draft, choices = S.cropChoices(farm, field), C = env.crops;
  const stepBtns = STEPS.map((s, i) => `<button type="button" class="fw-stepb" data-step="${i}" aria-pressed="${i === st.step}">${s}</button>`).join('');
  let body = '';
  if (st.step === 0) {
    const names = choices.list.slice(0, 6);
    body = choices.ready
      ? `<p>Best for this farm first.</p><div role="radiogroup" aria-label="Crop for year 1" class="fw-packets">${names.map(c => `<label class="fw-packet" data-tone="${c.tone}"><input type="radio" name="crop" value="${esc(c.id)}" ${d.crop === c.id ? 'checked' : ''}><b>${esc(env.cropName(c.id))}</b><span class="fw-chip">${esc(c.word || 'not read yet')}</span>${c.nearby ? '<small>Grown nearby</small>' : ''}${c.traits.map(t => `<small>${esc(t)}</small>`).join('')}</label>`).join('')}</div>`
      : `<p class="fw-muted">The best crops for this farm: not read yet. You can pick from the full list.</p>`;
    body += `<label for="fwCrop">${choices.ready ? 'More crops' : 'Crop for year 1'}</label><select id="fwCrop" class="fw-select"><option value="">Choose a crop</option>${C.pickerGroups().filter(g => g.group !== 'cover' && g.group !== 'fallow').map(g => `<optgroup label="${esc(cap(g.group))}">${g.ids.map(id => `<option value="${esc(id)}" ${d.crop === id ? 'selected' : ''}>${esc(env.cropName(id))}</option>`).join('')}</optgroup>`).join('')}</select>
      <details class="fw-fold"><summary>Stays for years: trees and bushes</summary><label for="fwTree">Tree or bush</label><select id="fwTree" class="fw-select"><option value="">Choose one</option>${C.gardenIds().map(id => `<option value="${esc(id)}">${esc(env.cropName(id))}</option>`).join('')}</select>${btn('tree', 'Make this a garden')}</details>`;
  } else if (st.step === 1) {
    const [mm, dd] = (d.sowing || '').split('-');
    body = `<p>Sowing date${d.crop ? ` for ${esc(env.cropName(d.crop).toLowerCase())}` : ''}</p><div class="fw-date2"><label for="fwDay">Day</label><input id="fwDay" class="fw-input" inputmode="numeric" maxlength="2" value="${dd ? +dd : ''}"><label for="fwMonth">Month</label><select id="fwMonth" class="fw-select"><option value="">Month</option>${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((n, i) => `<option value="${i + 1}" ${+mm === i + 1 ? 'selected' : ''}>${n}</option>`).join('')}</select></div><p class="fw-muted">The usual sowing date here: not read yet. Pick a date only if it suits your farm. The same day every year.</p>`;
  } else if (st.step === 2) {
    body = `<div role="radiogroup" aria-label="Water" class="fw-radios">${Object.entries(S.WATER_WORDS).map(([k, w]) => `<label><input type="radio" name="water" value="${k}" ${d.water === k ? 'checked' : ''}> ${w}</label>`).join('')}</div><p class="fw-muted">Water is for the whole rotation of this field. It changes the water check.</p>`;
  } else {
    body = farm.practice.coverOK ? `<label for="fwCover">Cover crop after harvest</label><select id="fwCover" class="fw-select"><option value="">No cover crop</option>${C.cropsOfType('cover').map(id => `<option value="${esc(id)}" ${d.cover === id ? 'selected' : ''}>${esc(env.cropName(id))}</option>`).join('')}</select>` : '<p>You said cover crops are not possible on this farm.</p>';
  }
  const ok = !!d.crop;
  env.node.innerHTML = `<div class="fw-panel-head"><div><h2 id="fwPanelTitle" tabindex="-1">Plant · ${esc(field.name)}</h2><p class="fw-sub">Step ${st.step + 1} of 4: ${STEPS[st.step]} · ${areaWords(field.area)}</p></div></div>
  <div class="fw-stepbar" role="group" aria-label="Steps">${stepBtns}</div><div class="fw-sheetbody">${body}</div><p class="fw-err" id="fwPlantErr" role="alert"></p>
  <div class="fw-actions"><button type="button" class="btn lg" data-act="back">Back</button>${st.step < 3 ? btn('next', 'Next') : ''}${btn('save', ok ? 'Save the plan' : 'Choose a crop first', ok ? 'btn lg primary' : 'btn lg')}</div>`;
  const q = s => env.node.querySelector(s);
  for (const r of env.node.querySelectorAll('input[name=crop]')) r.onchange = () => { d.crop = r.value; renderPlant(env); env.node.querySelector(`input[name=crop][value="${CSS.escape(d.crop)}"]`)?.focus(); };
  q('#fwCrop')?.addEventListener('change', e => { d.crop = e.target.value; renderPlant(env); q('#fwCrop')?.focus(); });
  q('#fwCover')?.addEventListener('change', e => { d.cover = e.target.value; });
  for (const r of env.node.querySelectorAll('input[name=water]')) r.onchange = () => { d.water = r.value; };
  const readDate = () => { if (q('#fwDay')) d.sowing = dayMonthToMD(q('#fwDay').value, q('#fwMonth').value); };
  for (const b of env.node.querySelectorAll('[data-step]')) b.onclick = () => { readDate(); st.step = +b.dataset.step; renderPlant(env); env.node.querySelector(`[data-step="${st.step}"]`)?.focus(); };
  env.node.querySelector('[data-act=next]')?.addEventListener('click', () => { readDate(); st.step++; renderPlant(env); q('#fwPanelTitle').focus(); });
  env.node.querySelector('[data-act=back]').onclick = () => leave(env, '[data-act=plant]');
  env.node.querySelector('[data-act=tree]')?.addEventListener('click', () => {
    const id = q('#fwTree').value; if (!id) { q('#fwPlantErr').textContent = 'Choose a tree or bush first.'; return; }
    const res = S.setTree(env.get().store, farm.id, field.id, id); if (res.refused) { q('#fwPlantErr').textContent = res.refused; return; }
    env.commit(res.store, `${field.name} is now a garden of ${env.cropName(id).toLowerCase()}`); st.sheet = ''; renderDrawer(env); env.node.querySelector('#fwPanelTitle')?.focus();
  });
  env.node.querySelector('[data-act=save]').onclick = () => {
    readDate();
    const made = planFromDraft(d, env.year());
    if (made.refused) { q('#fwPlantErr').textContent = made.refused; return; }
    const res = S.setPlan(env.get().store, farm.id, field.id, made.plan, { cropOk: id => env.crops.isCrop(id) });
    if (res.refused) { q('#fwPlantErr').textContent = res.refused; return; }
    env.commit(res.store, `${cap(env.cropName(d.crop))} planted on ${field.name}`); st.sheet = ''; st.draft = null; renderDrawer(env); env.node.querySelector('#fwPanelTitle')?.focus();
  };
}

// ---- Soil for this field
function renderSoil(env) {
  const { farm, field } = env.get(), d = st.draft, ok = d.texture && d.om;
  env.node.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">Soil for ${esc(field.name)}</h2></div>
  <fieldset class="fw-radios"><legend>Soil texture</legend>${Object.entries(SOIL_WORDS).map(([k, w]) => `<label><input type="radio" name="tex" value="${k}" ${d.texture === k ? 'checked' : ''}> ${w}</label>`).join('')}</fieldset>
  <fieldset class="fw-radios"><legend>Colour of the soil (organic matter)</legend>${Object.entries(OM_WORDS).map(([k, w]) => `<label><input type="radio" name="om" value="${k}" ${d.om === k ? 'checked' : ''}> ${w}</label>`).join('')}</fieldset>
  <div class="fw-actions">${btn('use', 'Use this soil', ok ? 'btn lg primary' : 'btn lg')}${btn('average', 'Not sure: use an average soil')}<button type="button" class="btn lg" data-act="back">Back</button></div><p class="fw-err" id="fwSoilErr" role="alert"></p>`;
  for (const r of env.node.querySelectorAll('input[name=tex]')) r.onchange = () => { d.texture = r.value; };
  for (const r of env.node.querySelectorAll('input[name=om]')) r.onchange = () => { d.om = r.value; };
  const set = (soil, words) => { const res = S.setFieldSoil(env.get().store, farm.id, field.id, soil); env.commit(res.store, words); st.sheet = ''; renderDrawer(env); env.node.querySelector('#fwPanelTitle')?.focus(); };
  env.node.querySelector('[data-act=use]').onclick = () => { if (!d.texture || !d.om) { env.node.querySelector('#fwSoilErr').textContent = 'Choose both the texture and the colour.'; return; } set({ texture: d.texture, om: d.om, source: 'your choice' }, `Soil set: ${d.texture} soil, ${d.om === 'med' ? 'medium' : d.om} organic matter.`); };
  env.node.querySelector('[data-act=average]').onclick = () => set({ texture: 'loam', om: 'med', source: 'average soil', assumed: true }, 'An average soil is used for this field. It is marked as assumed.');
  env.node.querySelector('[data-act=back]').onclick = () => leave(env, '[data-act=soil]');
}
// ---- Land marks (the slope the farmer measured; the map marks come with the map tools)
function renderLand(env) {
  const { farm, field } = env.get(), cur = field.marks?.slope;
  env.node.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">Land marks for ${esc(field.name)}</h2></div>
  <p>${cur != null ? `Slope you measured: ${cur.toFixed(1)}%.` : 'Your marks: none yet.'} Know your land better than the map? Mark it here.</p>
  <form id="fwSlope" class="fw-form"><label for="fwSlopeIn">Slope in %</label><input id="fwSlopeIn" class="fw-input" inputmode="decimal" value="${cur ?? ''}"><p class="fw-muted">A 1 m drop over 100 m is 1%.</p><p class="fw-err" id="fwSlopeErr" role="alert"></p>
  <div class="fw-actions"><button type="submit" class="btn lg primary">Save slope</button>${cur != null ? btn('clear', 'Clear my marks', 'btn lg danger') : ''}<button type="button" class="btn lg" data-act="back">Back</button></div></form>`;
  env.node.querySelector('#fwSlope').onsubmit = e => {
    e.preventDefault();
    const v = +String(env.node.querySelector('#fwSlopeIn').value).replace(',', '.');
    if (!Number.isFinite(v) || v < 0 || v > 60 || env.node.querySelector('#fwSlopeIn').value.trim() === '') { env.node.querySelector('#fwSlopeErr').textContent = 'Type a slope from 0 to 60%.'; return; }
    const res = S.setMarks(env.get().store, farm.id, field.id, { ...(field.marks || {}), slope: v }); env.commit(res.store, `Slope set to ${v.toFixed(1)}%`); leave(env, '[data-act=land]');
  };
  env.node.querySelector('[data-act=clear]')?.addEventListener('click', () => { const res = S.setMarks(env.get().store, farm.id, field.id, null); env.commit(res.store, 'Your land marks were cleared. The height map is used again.'); leave(env, '[data-act=land]'); });
  env.node.querySelector('[data-act=back]').onclick = () => leave(env, '[data-act=land]');
}
// ---- Copy this rotation to the fields ticked (their plans are replaced; one Undo)
function renderCopy(env) {
  const { farm, field } = env.get(), plan = S.planOf(farm, field.id), others = S.naturalSort(farm.fields.filter(o => o.id !== field.id && o.kind === 'rot')), none = others.filter(o => !S.planOf(farm, o.id));
  const crops = (plan?.seasons || []).map(x => env.cropName(x.crop).toLowerCase()).join(' → ');
  env.node.innerHTML = `<div class="fw-panel-head"><h2 id="fwPanelTitle" tabindex="-1">Copy to other fields</h2></div>
  <p>Copy this rotation (${esc(crops)}) to the fields you tick. Their plans are replaced. You can undo it.</p>
  <div class="fw-chips" role="group" aria-label="Pick fields"><button type="button" class="fw-chipb" data-pick="all">All fields</button><button type="button" class="fw-chipb" data-pick="bare">Fields without a plan (${none.length})</button><button type="button" class="fw-chipb" data-pick="none">None</button></div>
  <p class="fw-answer" id="fwCopyLine" role="status"></p>
  <ul class="fw-list">${others.map(o => `<li><label class="fw-tick"><input type="checkbox" data-copy="${esc(o.id)}" ${st.copy.has(o.id) ? 'checked' : ''}><span><b>${esc(o.name)}</b><br><small>${areaWords(o.area)}${S.planOf(farm, o.id) ? '' : ' · no plan yet'}</small></span></label></li>`).join('')}</ul>
  <p class="fw-err" id="fwCopyErr" role="alert"></p><div class="fw-actions"><button type="button" class="btn lg primary" data-act="docopy">Copy</button><button type="button" class="btn lg" data-act="back">Back</button></div>`;
  const line = () => { const n = st.copy.size; env.node.querySelector('#fwCopyLine').textContent = n ? `${n} field${n === 1 ? '' : 's'} ticked` : 'No field ticked'; };
  const sync = () => { for (const c of env.node.querySelectorAll('[data-copy]')) c.checked = st.copy.has(c.dataset.copy); line(); };
  for (const c of env.node.querySelectorAll('[data-copy]')) c.onchange = () => { c.checked ? st.copy.add(c.dataset.copy) : st.copy.delete(c.dataset.copy); line(); };
  env.node.querySelector('[data-pick=all]').onclick = () => { st.copy = new Set(others.map(o => o.id)); sync(); };
  env.node.querySelector('[data-pick=bare]').onclick = () => { st.copy = new Set(none.map(o => o.id)); sync(); };
  env.node.querySelector('[data-pick=none]').onclick = () => { st.copy = new Set(); sync(); };
  env.node.querySelector('[data-act=back]').onclick = () => leave(env, '[data-act=copy]');
  env.node.querySelector('[data-act=docopy]').onclick = () => {
    const res = S.copyPlan(env.get().store, farm.id, field.id, [...st.copy]);
    if (res.refused) { env.node.querySelector('#fwCopyErr').textContent = res.refused; return; }
    env.commit(res.store, `Copied to ${res.count} field${res.count === 1 ? '' : 's'}`); leave(env, '[data-act=copy]');
  };
  line();
}
// A new field arrives with its Plant sheet open.
export function startPlant(env) { const { farm } = env.get(); st.sheet = 'plant'; st.step = 0; st.draft = { crop: '', sowing: '', water: farm.practice.irrigation, cover: '', tree: '' }; renderDrawer(env); node(env)?.focus(); }
export const resetDrawer = () => { st.sheet = ''; st.draft = null; st.step = 0; };
