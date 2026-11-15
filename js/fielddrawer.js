// The field drawer: a field's name and size, the status line with its one next action, four tabs (Check, Facts, Weather, Remind), the sheets for Plant and Soil,
// and below them the field's own tools: its Land history and Edit this field (Move corners, Split, Rename, Delete).
// The words and the order of things are pure and tested; the page part takes the farm's parts (store, toast, reminders, forecast, today's weather) as one object, so nothing here fetches.
// Checked by scripts/test_sim.mjs (the drawer's words), scripts/e2e_farm.mjs and scripts/e2e_myfarm_simple.mjs (the drawer in a browser).
import { esc, FARM_WORDS as FW } from './words.js';
import { slopeWords } from './geo.js';
import { areaWords } from './farmunits.js';
import { srcButton } from './srci.js';
import * as S from './simulate.js';

export const TABS = Object.freeze([['check', 'Check'], ['facts', 'Facts'], ['weather', 'Weather'], ['remind', 'Remind']]);
const SOIL_WORDS = { sand: 'Light (sandy, gritty)', loam: 'Loam (mellow, mixed)', silt: 'Silty (smooth, floury)', clay: 'Heavy (clay, sticky)' }, OM_WORDS = { low: 'Pale: low organic matter', med: 'Medium brown: medium', high: 'Dark: high organic matter' };
export const ADDED_WORDS = 'Added to My farm.';
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
  if (fc === 'none' || !fc) return { text: 'The forecast could not be read just now.', action: null };
  return { text: 'No frost, heat or heavy rain forecast this week', action: { id: 'forecast', label: 'See the forecast' } };
}
// "To do": at most three items from the real data, most pressing first. { text, action? }
export function todoItems(tab, model) {
  const f = model.field, out = [], t = f.terrain;
  const add = (text, action) => out.push(action ? { text, action } : { text });
  if (tab === 'check') {
    if (f.kind === 'garden') add(`Open the report to see if ${model.cropName(f.tree)} suits this farm's weather.`);
    else if (!model.crop) add(`Choose what to plant on ${f.name}.`, { id: 'plant', label: 'Plant…' });
    else if (!f.soil) add('Give this field a soil.', { id: 'soil', label: 'Choose the soil' });
    if (f.kind === 'rot' && !t && !f.marks?.slope) add('The slope could not be read. It is read again when you are online.');
    if (model.sowing && model.reminders && !model.reminders.some(r => r.when.slice(0, 10) === model.sowing.date)) add(`No sowing reminder yet (about ${model.sowing.words}).`, { id: 'remind', label: 'Remind me' });
  } else if (tab === 'facts') {
    if (!f.soil) add('Soil: not known yet.', { id: 'soil', label: 'Choose this field\'s soil' });
    else if (f.soil.assumed) add('The soil is assumed until a real one answers.', { id: 'soil', label: 'Choose this field\'s soil' });
    if (!t && !f.marks?.slope) add('The slope could not be read. It is read again when you are online.', { id: 'land', label: 'Mark the land yourself' });
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
    return sc.state === 'needs-soil' ? 'Needs a soil before it can be checked' : 'The check needs the weather. It could not be read just now.';
  }
  if (tab === 'facts') {
    const slope = f.marks?.slope != null ? `slope ${f.marks.slope.toFixed(1)}% (yours)` : f.terrain ? `${slopeWords(f.terrain.slope)} (${f.terrain.slope.toFixed(1)}%)` : 'slope not known';
    const soil = f.soil ? `${f.soil.texture} soil${f.soil.assumed ? ' (assumed)' : ''}` : 'soil not known yet';
    return `${areaWords(f.area)} · ${slope} · ${soil}`;
  }
  if (tab === 'weather') return model.forecast === 'none' || !model.forecast ? 'The forecast could not be read just now.' : model.forecast.alerts?.length ? model.forecast.alerts.map(a => a.text).join(' · ') : 'No frost, heat or heavy rain this week';
  const n = (model.reminders || []).length;
  return model.reminders == null ? 'Reminders are not available here yet.' : n ? `${n} reminder${n === 1 ? '' : 's'} for this field` : 'No reminders for this field yet';
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
  m.weather = env.weather?.() ?? null;   // today's weather at the field: { lines, src, note } once the forecast is read
  m.sales = env.sales?.() ?? [];   // how a sales figure would be worked out, and what it assumes
  return m;
}
const btn = (id, label, cls = 'btn lg') => `<button type="button" class="${cls}" data-act="${esc(id)}">${esc(label)}</button>`;
function todoHTML(tab, m) {
  const items = todoItems(tab, m);
  if (!items.length) return `<h3>To do</h3><p class="fw-muted">Nothing to do on this field right now.</p>`;
  return `<h3>To do</h3><ul class="fw-todo">${items.map(i => `<li><span>${esc(i.text)}</span>${i.action ? btn(i.action.id, i.action.label, 'btn lg') : ''}</li>`).join('')}</ul>`;
}
// "This field": one page, no tabs. In the field now, today's weather, reminders, the land (folded), then Land history and Edit this field (folded).
function onePage(m, env) {
  const f = m.field, now = fieldNow(m), w = m.weather, list = m.reminders || [];
  const crop = m.crop ? `${cap(m.cropName(m.crop))}${m.sowing?.words && f.kind === 'rot' ? '' : ''}` : '';
  const here = f.kind === 'garden' ? `${cap(m.cropName(f.tree))}, trees and bushes` : crop ? `${crop}.` : 'Nothing is recorded for this season.';
  const alerts = todoItems('weather', m), jobs = todoItems('remind', m).slice(0, 3), moreJobs = todoItems('remind', m).slice(3);
  const li = i => `<li><span>${esc(i.text)}</span>${i.action ? btn(i.action.id, i.action.label, 'btn lg') : ''}</li>`;
  const weather = [w?.lines?.length ? w.lines.slice(0, 2).map(l => `<p>${esc(l)}</p>`).join('') : `<p class="fw-muted">${esc(now.action?.id === 'forecast' || m.forecast === 'none' || !m.forecast ? 'The forecast could not be read just now.' : 'No frost, heat or heavy rain this week.')}</p>`,
    alerts.length ? `<ul class="fw-todo">${alerts.map(li).join('')}</ul>` : '', w?.src?.length ? `<p class="fw-srcline">Where this comes from ${srcButton(w.src, w.note || '')}</p>` : ''].join('');
  const soil = f.soil ? `${cap(f.soil.texture)} soil${f.soil.assumed ? ', assumed. Nothing was measured here.' : f.soil.source ? `, ${esc(f.soil.source)}.` : '.'}` : 'Not known yet.';
  const land = f.terrain ? `About ${f.terrain.slope.toFixed(1)}%, ${slopeWords(f.terrain.slope)}.` : f.marks?.slope != null ? `${f.marks.slope.toFixed(1)}%, from you.` : 'The slope could not be read. It is read again when you are online.';
  return `<p class="fw-now"><b>In the field now</b><span>${esc(here)}</span>${f.kind === 'garden' ? '' : btn('plant', m.crop ? 'Change' : 'Add a crop', 'btn lg')}</p>
  <h3>Today</h3>${weather}
  <h3>Reminders</h3>${list.length ? `<ul class="fw-todo">${list.map(r => `<li><span>${esc(r.title)} · ${esc(r.when.slice(0, 10))}${r.done ? ' (done)' : ''}</span>${env.reminders?.done && !r.done ? btn(`rem-done:${r.id}`, 'Done') : ''}${env.reminders?.remove ? btn(`rem-del:${r.id}`, 'Delete') : ''}</li>`).join('')}</ul>${env.settings && !(env.reminders?.done && env.reminders?.remove) ? `<p><button type="button" class="btn lg" data-act="settings">Change or delete a reminder</button></p>` : ''}` : '<p class="fw-muted">No reminders yet.</p>'}${env.reminders?.openDialog ? `<p>${btn('rem-new', 'New reminder')}</p>` : ''}
  ${env.reminders && jobs.length ? `<p class="fw-small"><b>Jobs for this field</b></p><ul class="fw-todo">${jobs.map(li).join('')}</ul>${moreJobs.length ? `<details class="fw-fold"><summary>Show more</summary><ul class="fw-todo">${moreJobs.map(li).join('')}</ul></details>` : ''}` : ''}
  ${env.weakHTML ? `<details class="fw-fold fw-weak"${env.weakOpen?.(f) ? ' open' : ''}><summary>Weak spots in this field</summary>${env.weakHTML(f)}</details>` : ''}
  <details class="fw-fold fw-land"><summary>The land</summary><p>Size: ${areaWords(f.area)}${f.estimated ? ' (estimated)' : ''}.</p><p>Soil: ${esc(soil)}</p><p>Slope: ${esc(land)}</p><div class="fw-btnrow">${btn('soil', f.soil ? 'Change the soil' : 'Choose the soil')}</div></details>
  <div class="fw-btnrow">${env.history ? btn('history', FW.history) : ''}</div>
  ${env.edit ? `<details class="fw-fold fw-editfold"><summary>${esc(FW.editField)}</summary><div class="fw-btnrow fw-edittools" role="group" aria-label="${esc(FW.editField)}">${[['corners', FW.corners], ['rename', FW.rename], ['delete', FW.remove]].map(([id, label]) => `<button type="button" class="btn lg${id === 'delete' ? ' danger' : ''}" data-edit="${id}">${esc(label)}</button>`).join('')}</div></details>` : ''}`;
}
export function renderDrawer(env) {
  const node = env.node, { farm, field } = env.get();
  if (!field) { node.innerHTML = ''; return; }
  if (st.sheet === 'plant') return renderPlant(env);
  if (st.sheet === 'soil') return renderSoil(env);
  if (st.sheet === 'copy') return renderCopy(env);
  if (st.sheet === 'land') return renderLand(env);
  const m = model(env);
  node.innerHTML = `<div class="fw-panel-head"><div><h2 id="fwPanelTitle" tabindex="-1">${esc(field.name)}</h2><p class="fw-sub">${esc(`${field.estimated ? 'About ' : ''}${areaWords(field.area)}${field.estimated ? ' (estimated)' : ''}`)}</p></div><button type="button" class="btn lg" id="fwClose" aria-label="Close this field">Close</button></div>
  <div id="fwonepage">${onePage(m, env)}</div>`;
  wireDrawer(env, m);
}
function wireDrawer(env, m) {
  const node = env.node;
  node.querySelector('#fwClose').onclick = () => env.close();
  for (const b of node.querySelectorAll('[data-act]')) b.onclick = () => act(env, m, b.dataset.act);
  for (const b of node.querySelectorAll('[data-edit]')) b.onclick = () => env.edit(b.dataset.edit);   // the field's own tools: the board runs them and brings the keyboard back here
}
function act(env, m, id) {
  const { farm, field } = env.get();
  if (id === 'plant') { st.sheet = 'plant'; st.step = 0; st.draft = { crop: '', sowing: '', water: S.planOf(farm, field.id)?.water || farm.practice.irrigation, cover: '', tree: '' }; renderDrawer(env); node(env).focus(); }
  else if (id === 'soil') {   // an assumed soil is not the farmer's choice, so nothing starts ticked
    st.sheet = 'soil'; const own = field.soil && !field.soil.assumed ? field.soil : null; st.draft = { texture: own?.texture || '', om: own && typeof own.om === 'string' ? own.om : '' }; renderDrawer(env); node(env).focus(); }
  else if (id === 'copy') { st.sheet = 'copy'; st.copy = new Set(); renderDrawer(env); node(env).focus(); }
  else if (id === 'land') { st.sheet = 'land'; renderDrawer(env); node(env).focus(); }
  else if (id === 'forecast') { st.tab = 'weather'; renderDrawer(env); env.node.querySelector('#fwtab-weather')?.focus(); }
  else if (id === 'history') env.history();
  else if (id === 'settings') env.settings?.();
  else if (id === 'weak') env.findWeak?.();
  else if (id.startsWith('rem-done:')) { const { farm, field } = env.get(); env.reminders.done(id.slice(9)); renderDrawer(env); env.say('Done.'); }
  else if (id.startsWith('rem-del:')) {   // deleted with the house's Undo: the reminder is put back by adding it again
    const { farm, field } = env.get(), gone = (env.reminders.forField(farm.id, field.id) || []).find(r => r.id === id.slice(8)); if (!gone) return;
    env.reminders.remove(gone.id); renderDrawer(env);
    env.toast(`Reminder deleted: ${gone.title}`, () => { env.reminders.add({ title: gone.title, when: gone.when, kind: gone.kind || 'other', farmId: farm.id, fieldId: field.id }); renderDrawer(env); });
  }
  else if (id === 'rem-new') { const { farm, field } = env.get(); env.reminders.openDialog({ farmId: farm.id, fieldId: field.id, trigger: env.node.querySelector('[data-act=rem-new]'), onChange: () => renderDrawer(env) }); }
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
      ? `<p>Best for this farm first.</p><div role="radiogroup" aria-label="Crop for year 1" class="fw-packets">${names.map(c => `<label class="fw-packet" data-tone="${c.tone}"><input type="radio" name="crop" value="${esc(c.id)}" ${d.crop === c.id ? 'checked' : ''}><b>${esc(env.cropName(c.id))}</b><span class="fw-chip">${esc(c.word || '')}</span>${c.nearby ? '<small>Grown nearby</small>' : ''}${c.traits.map(t => `<small>${esc(t)}</small>`).join('')}</label>`).join('')}</div>`
      : `<p class="fw-muted">Pick a crop from the full list.</p>`;
    body += `<label for="fwCrop">${choices.ready ? 'More crops' : 'Crop for year 1'}</label><select id="fwCrop" class="fw-select"><option value="">Choose a crop</option>${C.pickerGroups().filter(g => g.group !== 'cover' && g.group !== 'fallow').map(g => `<optgroup label="${esc(cap(g.group))}">${g.ids.map(id => `<option value="${esc(id)}" ${d.crop === id ? 'selected' : ''}>${esc(env.cropName(id))}</option>`).join('')}</optgroup>`).join('')}</select>
      <details class="fw-fold"><summary>Stays for years: trees and bushes</summary><label for="fwTree">Tree or bush</label><select id="fwTree" class="fw-select"><option value="">Choose one</option>${C.gardenIds().map(id => `<option value="${esc(id)}">${esc(env.cropName(id))}</option>`).join('')}</select>${btn('tree', 'Make this a garden')}</details>`;
  } else if (st.step === 1) {
    const [mm, dd] = (d.sowing || '').split('-');
    body = `<p>Sowing date${d.crop ? ` for ${esc(env.cropName(d.crop).toLowerCase())}` : ''}</p><div class="fw-date2"><label for="fwDay">Day</label><input id="fwDay" class="fw-input" inputmode="numeric" maxlength="2" value="${dd ? +dd : ''}"><label for="fwMonth">Month</label><select id="fwMonth" class="fw-select"><option value="">Month</option>${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((n, i) => `<option value="${i + 1}" ${+mm === i + 1 ? 'selected' : ''}>${n}</option>`).join('')}</select></div><p class="fw-muted">Pick a sowing date that suits your farm. It repeats every year.</p>`;
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
// The Copy sheet, started from Farm tools: tick the fields that should get this field's plan.
export function startCopy(env) { st.sheet = 'copy'; st.copy = new Set(); renderDrawer(env); env.node.focus?.(); }
export function startPlant(env) { const { farm } = env.get(); st.sheet = 'plant'; st.step = 0; st.draft = { crop: '', sowing: '', water: farm.practice.irrigation, cover: '', tree: '' }; renderDrawer(env); node(env)?.focus(); }
export const resetDrawer = () => { st.sheet = ''; st.draft = null; st.step = 0; };
