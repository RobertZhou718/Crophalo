// The top-row chips of My farm: today's weather, the plan score with its fit word, bare-soil months, past years with no stress, and sales behind a tap.
// Every number is the report engine's own answer for this field's NASA weather, or the plain words "not read yet"; the words and the choice of plan are pure and tested.
// The page part asks for the weather and the engine once per field and keeps the answer until the field's plan, soil or water changes. Checked by scripts/test_sim.mjs and scripts/e2e_farm.mjs.
import { esc } from './words.js';
import { loadSpot } from './report-load.js';
import { buildForecast } from './data.js';
import { conditionWords } from './weather.js';
import { newState } from './state.js';
import { srcButton } from './srci.js';
import * as S from './simulate.js';

export const NOT_READ = 'not read yet';
let engineClient = null;
const KIND_NAMES = { current: 'Current plan', proposed: 'Proposed plan' };
const fin = v => Number.isFinite(v);
const num1 = v => (Math.round(v * 10) / 10).toString();

// ---- the engine's inputs from the farm's record (pure)
// The crops of the plan being read: the farmer's own rotation when there is one, else the report's current plan.
// The report's plan names its own crop cycle (slots: corn, soybeans); its seasons repeat that cycle over three years or more, and read as a rotation of their own
// they would be another plan (corn, soybeans, corn) whose options the report never offered. A plan kept before the cycle was kept falls back to its seasons.
export function cropsOfField(farm, field) {
  const cur = field.report?.current, own = S.planOf(farm, field.id)?.seasons.map(x => x.crop), rep = cur?.seasons.map(x => x.crop), cycle = Array.isArray(cur?.slots) && cur.slots.length ? cur.slots : null;
  const asReport = own && rep && own.length === rep.length && own.every((c, i) => c === rep[i]);   // the plan My farm made from the report, not changed since
  return ((own?.length && !asReport ? own : cycle || rep) || []).slice(0, 12);
}
export function stateFor(farm, field) {
  const s = newState(), pr = farm.practice, soil = field.soil || farm.soil;
  s.rotation.custom = cropsOfField(farm, field);
  s.farm = { irrigation: S.planOf(farm, field.id)?.water || pr.irrigation, tillage: pr.tillage, livestock: pr.livestock, coverOK: pr.coverOK, labor: false };
  s.soil = soil ? { mode: soil.assumed ? 'assumed' : 'manual', texture: soil.texture, om: typeof soil.om === 'string' ? soil.om : null, omPct: typeof soil.om === 'number' ? soil.om : null } : { mode: 'assumed', texture: null, om: null, omPct: null };
  return s;
}
export function spotFor(farm, field) {
  const [lat, lon] = S.interiorPoint(field.ring), slope = field.marks?.slope ?? field.terrain?.slope ?? null, soil = field.soil || farm.soil;
  return { lat, lon, elev: NaN, slope: fin(slope) ? slope : null, soil: soil ? { texture: soil.texture, source: soil.assumed ? 'assumed' : 'own' } : { texture: 'loam', source: 'assumed' }, country: farm.pin.cc || '', fieldDrawn: field.estimated !== true && !!field.terrain };
}
// What the readings depend on: a change in any of these asks the engine again; nothing else does.
export const signature = (farm, field) => JSON.stringify([cropsOfField(farm, field), field.soil || farm.soil, farm.practice, S.planOf(farm, field.id)?.water, field.terrain?.slope, field.marks?.slope, S.interiorPoint(field.ring).map(v => v.toFixed(2))]);

// ---- the plan a chip speaks of: the report's current plan is the engine's "current"; the proposed one is found by its own id among the engine's options
export function pickPlan(options, field, kind) {
  if (!options?.current) return null;
  if (kind === 'current') return options.current;
  const want = field.report?.proposed?.id, all = [options.recommended, ...(options.others || [])].filter(p => p && p.kind === 'proposed');
  return all.find(p => p.id === want) ?? null;
}
// "No stress thresholds crossed in 24 of 25 tested years (2001 to 2025); the others are 2012." -> { ok: 24, of: 25, text, rules }
export function stressOf(plan) {
  const ev = (plan?.evidence || []).find(e => /^No stress thresholds crossed in /.test(e.text || ''));
  if (!ev) return null;
  const m = /crossed in (\d+)(?: of (\d+))? tested years/.exec(ev.text);
  if (!m) return null;
  const of = +(m[2] ?? m[1]), ok = +m[1];
  return { ok, of, text: ev.text, rules: Array.isArray(ev.rules) ? ev.rules : [], sources: ev.sources || ['power'] };
}
export const weatherOf = f => {   // today's word and temperatures from the forecast reading, or null
  const day = f?.days?.find(d => d.date === f.today) ?? f?.days?.[0], now = f?.current;
  if (!f || !day || !fin(day.tmax) || !fin(day.tmin)) return null;
  const code = fin(now?.code) ? now.code : day.code, word = conditionWords(code) || (day.rain >= 1 ? 'Rain' : 'Dry');
  return { word, temp: fin(now?.temp) ? Math.round(now.temp) : null, hi: Math.round(day.tmax), lo: Math.round(day.tmin), icon: day.tmin <= 0 ? 'frost' : day.rain >= 1 ? 'rain' : day.tmax >= 32 ? 'sun' : 'leaf', date: f.today };
};

// ---- the chips: { id, label, value, sub, state: 'ok' | 'wait' | 'unread', sheet }
// r: { state: 'loading' | 'ok' | 'failed', reason, forecast (buildForecast answer or null), forecastReason, options (optionsFor answer or null), note }
export function chipsFrom(r, field, kind) {
  const wait = r.state === 'loading', fcWait = wait || r.forecastPending === true, plan = r.state === 'ok' ? pickPlan(r.options, field, kind) : null, cur = r.state === 'ok' ? r.options?.current : null;
  const name = KIND_NAMES[kind], chips = [];
  const w = weatherOf(r.forecast);
  chips.push({ id: 'weather', label: 'Weather', state: w ? 'ok' : fcWait ? 'wait' : 'unread', value: w ? `${w.word} ${w.temp ?? w.hi}°` : fcWait ? '…' : NOT_READ, sub: w ? `High ${w.hi}°, low ${w.lo}°` : fcWait ? '' : (r.forecastReason || ''), icon: w?.icon || '' });
  const scored = plan && fin(plan.score);
  chips.push({ id: 'score', label: 'Plan score', state: scored ? 'ok' : wait ? 'wait' : 'unread', value: scored ? `${plan.score} · ${plan.fit}` : wait ? '…' : NOT_READ, sub: scored ? name : (r.state === 'ok' && !plan ? `${name}: ${NOT_READ}` : r.reason || '') });
  const bare = plan && fin(plan.bareMonths);
  chips.push({ id: 'bare', label: 'Bare soil', state: bare ? 'ok' : wait ? 'wait' : 'unread', value: bare ? `${num1(plan.bareMonths)} mo` : wait ? '…' : NOT_READ, sub: bare ? (kind === 'proposed' && cur && fin(cur.bareMonths) ? `Current plan ${num1(cur.bareMonths)} mo` : name) : '' });
  const st = plan ? stressOf(plan) : null;
  chips.push({ id: 'past', label: 'Past years', state: st ? 'ok' : wait ? 'wait' : 'unread', value: st ? `${st.ok} of ${st.of}` : wait ? '…' : NOT_READ, sub: st ? 'with no stress' : '' });
  chips.push({ id: 'sales', label: 'Sales', state: 'unread', value: 'Not worked out', sub: 'Tap for how' });
  return chips;
}
// The sheet a chip opens: a title, its sentences, and the source keys for the "i".
export function sheetFor(id, r, field, kind) {
  const plan = r.state === 'ok' ? pickPlan(r.options, field, kind) : null, cur = r.state === 'ok' ? r.options?.current : null, name = KIND_NAMES[kind];
  if (id === 'weather') {
    const w = weatherOf(r.forecast);
    return { title: 'Weather at the field', lines: w ? [`${w.word}, ${w.temp ?? w.hi}° now. Today's high ${w.hi}°, low ${w.lo}°.`, 'Forecast only. For sprays, read the product label or ask a local adviser.'] : [`The forecast is ${NOT_READ}.${r.forecastReason ? ' ' + r.forecastReason : ''}`], src: ['forecast'] };
  }
  if (id === 'score') return { title: 'Plan score', lines: plan && fin(plan.score) ? [`${name}: ${plan.score} out of 100, ${plan.fit.toLowerCase()}.`, plan.why || '', 'The score is the report\'s own rule set on this field\'s NASA weather: water fit, soil health, soil wash-off, income and weather safety. A higher score never overrides a failed check.', `Parts: ${Object.entries(plan.scores || {}).map(([k, v]) => `${k} ${fin(v) ? v : NOT_READ}`).join(', ')}.`].filter(Boolean) : [`The plan score is ${NOT_READ}.${r.reason ? ' ' + r.reason : ''}`], src: ['power', 'crophalo'] };
  if (id === 'bare') return { title: 'Bare soil', lines: plan && fin(plan.bareMonths) ? [`${name}: the soil is bare about ${num1(plan.bareMonths)} months a year${kind === 'proposed' && cur && fin(cur.bareMonths) ? `, against ${num1(cur.bareMonths)} for the current plan` : ''}. Lower is better.`, 'Bare months come from the usual crop calendar on your normal weather, not from what grows on your field this year.'] : [`Bare soil months are ${NOT_READ}.`], src: ['power', 'crophalo'] };
  if (id === 'past') {
    const st = plan ? stressOf(plan) : null;
    return { title: 'Past years', lines: st ? [st.text, ...st.rules.map(x => `Rule: ${x}.`), 'These are counts of real years, never a chance and never a forecast.'] : [`Past years are ${NOT_READ}.`], src: st?.sources || ['power'] };
  }
  return { title: 'Estimated sales', lines: ['Estimated sales are yield times the farm-gate price, before costs, from typical figures and not a promise.', `Not worked out for this field: ${NOT_READ} (a yield or a price is missing), so no figure is shown.`, 'Assumptions behind any figure: the soil is loam unless you chose one, the field is rain-fed unless you said otherwise, and the outline is estimated unless you drew it.'], src: [] };
}

// ---- the page part
let dataEnv = {};
export const dataFetch = () => (dataEnv.fetch || globalThis.fetch)?.bind(globalThis);   // the page's own fetch, or the one a test handed in
export const setDataEnv = env => { dataEnv = env && typeof env === 'object' ? env : {}; };   // fetch, caches, now (and load, a stand-in for loadSpot): handed in by a test; the page uses its own
// The engine's worker client (engine-client.js), handed in by the page start: the engine then runs off the page, which keeps painting. Without it the engine runs on the page.
export const setEngineClient = client => { engineClient = client && typeof client.optionsFor === 'function' ? client : null; };
async function optionsOff(state, climate, spot, opts) {
  if (engineClient) return engineClient.optionsFor(state, climate, spot, opts);
  return (await import('./engine.js')).optionsFor(state, climate, spot, opts);
}
const kept = new Map();
export function readingsFor(farm, field, onChange) {
  const key = `${field.id}|${signature(farm, field)}`;
  if (!kept.has(key)) {
    const entry = { state: 'loading', reason: '', forecast: null, forecastPending: true, forecastReason: '', options: null, note: '', key, changed: onChange, done: false, waiting: [], series: null, climate: null, seriesReady: false, seriesWaiting: [] };
    kept.set(key, entry);
    run(farm, field, entry).catch(() => { entry.state = 'failed'; entry.reason = 'The check could not be worked out just now.'; }).finally(() => { entry.engineDone = true; tell(entry); });
  } else if (onChange && !kept.get(key).changed) kept.get(key).changed = onChange;
  return kept.get(key);
}
// Told every time something arrives: the forecast (it does not hold the score back) and the engine's answer.
function tell(entry) {
  try { entry.changed?.(entry); } catch { /* a screen that is gone */ }
  if (entry.engineDone && !entry.forecastPending) { entry.done = true; for (const f of entry.waiting.splice(0)) f(entry); }
}
// The daily weather record of the field (for the land history): ready as soon as the weather is in, before the engine has answered.
export const whenSeries = entry => new Promise(done => { if (entry.seriesReady) done(entry); else entry.seriesWaiting.push(done); });
function seriesIn(entry, got) { entry.series = got?.ok ? got.series : null; entry.climate = got?.ok ? got.climate : null; entry.seriesReady = true; for (const f of entry.seriesWaiting.splice(0)) f(entry); }
export const whenSettled = entry => new Promise(done => { if (entry.done) done(entry); else entry.waiting.push(done); });   // for tests: everything has arrived
export const forgetReadings = () => kept.clear();
async function run(farm, field, entry) {
  const spot = spotFor(farm, field), loc = { lat: spot.lat, lon: spot.lon }, now = () => dataEnv.now ? dataEnv.now() : Date.now();
  const got = await (dataEnv.load || loadSpot)(loc, dataEnv);   // the weather and the climate; the forecast comes back as a promise (forecastP) and is waited for apart
  seriesIn(entry, got);
  const fc = got.ok ? (got.forecastP ?? Promise.resolve(got.forecast ?? null)) : Promise.resolve(null);
  fc.then(raw => { try { entry.forecast = raw ? buildForecast(raw, now()) : null; } catch { entry.forecast = null; } if (!entry.forecast) entry.forecastReason = 'The forecast did not answer.'; }, () => { entry.forecast = null; entry.forecastReason = 'The forecast did not answer.'; })
    .finally(() => { entry.forecastPending = false; tell(entry); });
  if (!got.ok) { entry.state = 'failed'; entry.reason = got.reason; entry.forecastReason = got.reason; return; }
  entry.note = got.note || '';
  const crops = cropsOfField(farm, field);
  if (!crops.length) { entry.state = 'failed'; entry.reason = 'No crops are planned on this field yet.'; return; }
  const today = new Date(now()).toISOString().slice(0, 10);
  const asked = optionsOff(stateFor(farm, field), got.climate, spot, { today });   // with the worker this returns at once: the page is free until the answer comes
  entry.engineFrom = performance.now();   // from here to the answer is the time the engine works; a check looks at the page's busy moments inside it
  const options = await asked;
  entry.engineTo = performance.now();
  if (!options?.current) { entry.state = 'failed'; entry.reason = options?.reason || 'The engine gave no plan for these crops.'; return; }
  entry.options = options; entry.state = 'ok';
}

const ICON = { frost: '❄', rain: '☂', sun: '☀', leaf: '❦' };
export function chipRowHTML(chips) {
  return chips.map(c => `<button type="button" class="fw-valchip" data-chip="${c.id}" data-state="${c.state}" aria-haspopup="dialog" aria-label="${esc(`${c.label}: ${c.value}${c.sub ? ', ' + c.sub : ''}. How it is worked out`)}"><small>${esc(c.label)}</small><b>${c.icon ? `<span aria-hidden="true">${ICON[c.icon] || ''}</span> ` : ''}${esc(c.value)}</b>${c.sub ? `<small class="fw-chipsub">${esc(c.sub)}</small>` : ''}</button>`).join('');
}
export function renderChipSheet(env, id) {
  const { farm, field, kind, readings } = env.get(), sh = sheetFor(id, readings, field, kind), p = env.node;
  p.innerHTML = `<div class="fw-panel-head"><div><h2 id="fwPanelTitle" tabindex="-1">${esc(sh.title)}</h2><p class="fw-sub">${esc(field.name)}</p></div><button type="button" class="btn lg" id="fwClose">Close</button></div>
  ${sh.lines.map(l => `<p>${esc(l)}</p>`).join('')}${sh.src.length ? `<p class="fw-srcline">Where this comes from ${srcButton(sh.src)}</p>` : ''}`;
  p.querySelector('#fwClose').onclick = () => env.close();
  p.querySelector('#fwPanelTitle').focus();
}
