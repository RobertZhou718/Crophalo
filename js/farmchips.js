// My farm's readings of a field: today's weather, each plan's score in the report's own words, its bare-soil months, its past years with no stress, and how sales would be worked out.
// They are shown where they are used: the plan figures on each plan's card in Compare plans, the weather in the field's Weather tab, sales in its Check tab.
// Every number is the report engine's own answer for this field's NASA weather, or the plain words "not read yet"; the words and the choice of plan are pure and tested.
// The page part asks for the weather and the engine once per field and keeps the answer until the field's plan, soil or water changes. Checked by scripts/test_sim.mjs, scripts/e2e_farm.mjs and scripts/e2e_myfarm_simple.mjs.
import { scoreWords, bandWord } from './words.js';
import { loadSpot } from './report-load.js';
import { buildForecast } from './data.js';
import { conditionWords } from './weather.js';
import { newState } from './state.js';
import * as S from './simulate.js';
import { tempWords } from './farmunits.js';
import { fmtRain } from './units.js';
import { feasible, cropFit, fitBand } from './fit.js';
import { cropIds, cropName } from './crops.js';

export const NOT_READ = 'not read yet';
let engineClient = null;
const KIND_NAMES = { current: 'Current plan', proposed: 'Proposed plan' };
const fin = v => Number.isFinite(v);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayOf = at => { if (!(at > 0)) return ''; const d = new Date(at); return ` on ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
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

// ---- the plan a chip speaks of. The engine is asked again here; when its answer holds the very plan the report made (the same id, and for the current plan the
// same name), its numbers are shown. When it does not (the report asked with its own rotation, soil, nearby crops and priorities), the report's own answer,
// saved with the field when it was added, is shown: the same numbers the report gave, never "not read yet" for a plan the report scored, never another plan's number.
// Once the farmer has changed the field's rotation here, the current plan is the engine's answer for the rotation as it is now.
const samePlan = (a, b) => !!a && !!b && a.id === b.id && (!a.name || !b.name || a.name === b.name);
const savedAnswer = plan => plan && fin(plan.score) ? { ...plan, fromReport: true } : null;
export function pickPlan(options, field, kind, r = null) {
  if (!options?.current) return null;
  const saved = field.report?.[kind] ?? null, told = savedAnswer(saved);
  if (kind === 'current') {
    const changed = Array.isArray(r?.ownCrops) && saved ? r.ownCrops.join() !== saved.seasons.map(x => x.crop).join() : false;
    return changed || !told || samePlan(options.current, saved) ? options.current : told;
  }
  const want = saved?.id, all = [options.recommended, ...(options.others || [])].filter(p => p && p.kind === 'proposed');
  return all.find(p => p.id === want) ?? told;
}
// The engine gives a plan that does not suit here no score, and says why in fitWhy (js/engine.js toPlan).
const doesNotSuit = plan => !!plan && plan.flag === 'fails' && !fin(plan.score) && typeof plan.fit === 'string' && plan.fit !== '';
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
  const wait = r.state === 'loading', fcWait = wait || r.forecastPending === true, plan = r.state === 'ok' ? pickPlan(r.options, field, kind, r) : null, cur = r.state === 'ok' ? pickPlan(r.options, field, 'current', r) : null;
  const name = KIND_NAMES[kind], chips = [];
  const w = weatherOf(r.forecast);
  chips.push({ id: 'weather', label: 'Weather', state: w ? 'ok' : fcWait ? 'wait' : 'unread', value: w ? `${w.word} ${tempWords(w.temp ?? w.hi)}` : fcWait ? '…' : NOT_READ, sub: w ? `High ${w.hi}°, low ${w.lo}°` : fcWait ? '' : (r.forecastReason || ''), icon: w?.icon || '' });
  const scored = plan && fin(plan.score), unsuited = !scored && doesNotSuit(plan);   // a plan that does not suit was read: it is named for what it is, with no number
  chips.push({ id: 'score', label: 'Plan score', state: scored || unsuited ? 'ok' : wait ? 'wait' : 'unread', value: scored ? `${plan.score} · ${plan.fit}` : unsuited ? plan.fit : wait ? '…' : NOT_READ, sub: scored || unsuited ? name : (r.state === 'ok' && !plan ? `${name}: ${NOT_READ}` : r.reason || '') });
  const bare = plan && fin(plan.bareMonths);
  chips.push({ id: 'bare', label: 'Bare soil', state: bare ? 'ok' : wait ? 'wait' : 'unread', value: bare ? `${num1(plan.bareMonths)} mo` : wait ? '…' : NOT_READ, sub: bare ? (kind === 'proposed' && cur && fin(cur.bareMonths) ? `Current plan ${num1(cur.bareMonths)} mo` : name) : '' });
  const st = plan ? stressOf(plan) : null;
  chips.push({ id: 'past', label: 'Past years', state: st ? 'ok' : wait ? 'wait' : 'unread', value: st ? `${st.ok} of ${st.of}` : wait ? '…' : NOT_READ, sub: st ? 'with no stress' : '' });
  chips.push({ id: 'sales', label: 'Sales', state: 'unread', value: '', sub: '' });
  return chips;
}
// The sheet a chip opens: a title, its sentences, and the source keys for the "i".
export function sheetFor(id, r, field, kind) {
  const plan = r.state === 'ok' ? pickPlan(r.options, field, kind, r) : null, cur = r.state === 'ok' ? pickPlan(r.options, field, 'current', r) : null, name = KIND_NAMES[kind];
  const fromReport = plan?.fromReport ? `${name} as the field report worked it out${dayOf(field.report?.at)}: the same numbers the report gave.` : '';
  if (id === 'weather') {
    const w = weatherOf(r.forecast);
    return { title: 'Weather at the field', lines: w ? [`${w.word}, ${tempWords(w.temp ?? w.hi)} now. Today's high ${tempWords(w.hi)}, low ${tempWords(w.lo)}.`, 'Forecast only. For sprays, read the product label or ask a local adviser.'] : [`The forecast is ${NOT_READ}.${r.forecastReason ? ' ' + r.forecastReason : ''}`], src: ['forecast'] };
  }
  if (id === 'score') return { title: 'Plan score', lines: plan && fin(plan.score) ? [`${name}: ${plan.score} out of 100, ${String(plan.fit || '').toLowerCase()}.`, plan.why || '', 'The score is the report\'s own rule set on this field\'s NASA weather: water fit, soil health, soil wash-off, income and weather safety. A higher score never overrides a failed check.', `Parts: ${Object.entries(plan.scores || {}).map(([k, v]) => `${k} ${fin(v) ? v : NOT_READ}`).join(', ')}.`, fromReport].filter(Boolean)
    : doesNotSuit(plan) ? [`${name}: ${plan.fit.toLowerCase()}.`, plan.fitWhy || '', 'A plan that does not pass the weather and water checks gets no number: a score beside "Doesn\'t suit here" would read as a good idea.', fromReport].filter(Boolean)
    : [`The plan score is ${NOT_READ}.${r.reason ? ' ' + r.reason : ''}`], src: ['power', 'crophalo'] };
  if (id === 'bare') return { title: 'Bare soil', lines: plan && fin(plan.bareMonths) ? [`${name}: the soil is bare about ${num1(plan.bareMonths)} months a year${kind === 'proposed' && cur && fin(cur.bareMonths) ? `, against ${num1(cur.bareMonths)} for the current plan` : ''}. Lower is better.`, 'Bare months come from the usual crop calendar on your normal weather, not from what grows on your field this year.', fromReport].filter(Boolean) : [`Bare soil months are ${NOT_READ}.`], src: ['power', 'crophalo'] };
  if (id === 'past') {
    const st = plan ? stressOf(plan) : null;
    return { title: 'Past years', lines: st ? [st.text, ...st.rules.map(x => `Rule: ${x}.`), 'These are counts of real years, never a chance and never a forecast.', fromReport].filter(Boolean) : [`Past years are ${NOT_READ}.`], src: st?.sources || ['power'] };
  }
  return { title: 'Estimated sales', lines: ['Estimated sales are yield times the farm-gate price, before costs, from typical figures and not a promise.', 'There is no sales figure for this field: a yield or a price is missing.', 'Assumptions behind any figure: the soil is loam unless you chose one, the field is rain-fed unless you said otherwise, and the outline is estimated unless you drew it.'], src: [] };
}

// ---- the figures on a plan's card in Compare plans: { id, label, state: 'ok' | 'wait' | 'unread', value, src, note }. The value reads as the report reads it ("71 · Good fit");
// the note goes behind the figure's "i": how it is worked out, the years it is tested on and the size of the weather square, so the card itself stays short.
const PART_WORDS = { water: 'water fit', soil: 'soil health', erosion: 'soil wash-off', income: 'income', weather: 'weather safety' };
const SQUARE = 'NASA POWER gives one figure a day for a weather square about 50 km wide around the field, so your own field can differ.';
const yearsOf = st => { const m = /\((\d{4}) to (\d{4})\)/.exec(st?.text || ''); return m ? `Tested on NASA POWER daily weather from ${m[1]} to ${m[2]}.` : ''; };
export function planFigures(r, field, kind) {
  const ok = r.state === 'ok', plan = ok ? pickPlan(r.options, field, kind) : null, name = KIND_NAMES[kind], st = plan ? stressOf(plan) : null, years = yearsOf(st ?? (ok ? stressOf(r.options?.current) : null));
  const chip = Object.fromEntries(chipsFrom(r, field, kind).map(c => [c.id, c]));   // the same states as the readings always had: ready, on its way, or not read
  const fig = (id, label, value, src, lines) => value && chip[id].state === 'ok' ? { id, label, state: 'ok', value, src, note: [...lines, years, SQUARE].filter(Boolean).join(' ') }
    : { id, label, state: chip[id].state === 'wait' ? 'wait' : 'unread', value: chip[id].state === 'wait' ? 'reading…' : NOT_READ, src: [], note: '' };
  const scored = plan && fin(plan.score), bare = plan && fin(plan.bareMonths), months = bare ? num1(plan.bareMonths) : '';
  return [
    fig('score', 'Plan score', scored ? scoreWords(plan.score) : '', ['power'], scored ? [`${name}: ${Math.round(plan.score)} out of 100, ${bandWord(plan.score).toLowerCase()}.`, plan.fit ? `The report's own check says it ${plan.fit.toLowerCase()}.` : '',
      'The score is the report\'s own rule set on this field\'s weather: water fit, soil health, soil wash-off, income and weather safety. A higher score never overrides a failed check.',
      plan.scores ? `Parts: ${Object.entries(plan.scores).map(([k, v]) => `${PART_WORDS[k] || k} ${fin(v) ? Math.round(v) : NOT_READ}`).join(', ')}.` : ''] : []),
    fig('bare', 'Bare soil', bare ? `${months === '0' ? '' : 'about '}${months} month${months === '1' ? '' : 's'} a year` : '', ['power'], bare ? sheetFor('bare', r, field, kind).lines : []),
    fig('past', 'Past years', st ? `${st.ok} of ${st.of} tested years with no stress threshold crossed` : '', st?.sources?.length ? st.sources : ['power'], st ? sheetFor('past', r, field, kind).lines : []),
  ];
}
// ---- today's weather for the field's Weather tab: { lines, src, note }, or null while the forecast has not been read
export function weatherNow(r, field) {
  const w = weatherOf(r.forecast); if (!w) return null;
  const [y, m, d] = String(r.forecast.today).split('-').map(Number), MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return { lines: sheetFor('weather', r, field, 'current').lines, src: ['forecast'], note: `The forecast for ${d} ${MON[m - 1]} ${y} at the field's own spot, read ${r.forecastAt ? `at ${new Date(r.forecastAt).toISOString().slice(11, 16)} UTC` : 'on this visit'}.` };
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
    const entry = { state: 'loading', reason: '', forecast: null, forecastPending: true, forecastReason: '', options: null, note: '', key, changed: onChange, done: false, waiting: [], series: null, climate: null, seriesReady: false, seriesWaiting: [], ownCrops: cropsOfField(farm, field) };
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
  fc.then(raw => { try { entry.forecast = raw ? buildForecast(raw, now()) : null; } catch { entry.forecast = null; } if (entry.forecast) entry.forecastAt = now(); else entry.forecastReason = 'The forecast did not answer.'; }, () => { entry.forecast = null; entry.forecastReason = 'The forecast did not answer.'; })
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
  if (!options?.current) { entry.state = 'failed'; entry.reason = options?.reason || 'No plan could be made for these crops.'; return; }
  entry.options = options; entry.state = 'ok';
}

// ---- "The next 7 days" on This field: the forecast's days as a closed part; the temperature's unit is named once, in the heading (never a bare "11°"), and a field in the United States reads in Fahrenheit and inches.
const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function weekModel(forecast, units = {}) {
  const days = (Array.isArray(forecast?.days) ? forecast.days : []).filter(d => fin(d?.tmax) && fin(d?.tmin) && /^\d{4}-\d{2}-\d{2}$/.test(d.date || '')).slice(0, 7); if (!days.length) return null;
  const f = units.temp === 'F', deg = v => Math.round(f ? v * 9 / 5 + 32 : v), unit = f ? '°F' : '°C';
  const rows = days.map((d, i) => { const name = i === 0 && d.date === forecast.today ? 'Today' : DAYNAMES[new Date(`${d.date}T00:00:00Z`).getUTCDay()], rain = !fin(d.rain) ? '' : d.rain < 0.5 ? 'dry' : fmtRain(d.rain, units); return { name, hi: deg(d.tmax), lo: deg(d.tmin), rain, line: `${name}: high ${deg(d.tmax)}, low ${deg(d.tmin)}${rain ? `, ${rain}` : ''}` }; });
  return { unit, title: `The next ${rows.length === 7 ? '7' : rows.length} days, ${unit}`, first: rows[0].line, rows };
}
// ---- the engine seam of simulate.js (setEngine): what the field's Check, the Plant sheet's crop packets and the Fields table ask for, answered from the readings this module already holds.
// Nothing is worked out here that the chips do not already show: the score is the plan's own (pickPlan), the packets are fit.js's own gates for each crop on this field's weather.
// While the weather is on its way the answer is "waiting"; when it did not come, nothing is invented. onChange is told when an answer arrives, so the screen draws again.
const FIT_WORDS = { 3: 'Suits here', 2: 'Should do well', 1: 'A stretch here' };
export function engineAdapter(onChange) {
  return {
    score({ farm, field, scenario }) {
      if (scenario && scenario !== 'base') return null;   // only the field's own plan was asked of the engine: no figure for any other
      const r = readingsFor(farm, field, onChange);
      if (r.state === 'loading') return { state: 'waiting' };
      if (r.state !== 'ok') return null;
      const p = pickPlan(r.options, field, 'current', r);
      if (!p || !fin(p.score)) return null;
      return { score: p.score, parts: p.scores || null, bareMonths: fin(p.bareMonths) ? p.bareMonths : null, sales: null, years: null };   // the sales and the tested years have their own words elsewhere
    },
    crops({ farm, field }) {
      const r = readingsFor(farm, field, onChange);
      if (!r.climate) throw new Error('the weather of this field could not be read');
      const soil = field.soil || farm.soil, elev = Number.isFinite(field.terrain?.hMin) && Number.isFinite(field.terrain?.hMax) ? (field.terrain.hMin + field.terrain.hMax) / 2 : NaN;
      const ctx = { texture: soil?.texture, irrigation: S.planOf(farm, field.id)?.water || farm.practice.irrigation, elev };
      return cropIds(c => c.type === 'cash' || c.type === 'forage').map(id => {
        const f = feasible(id, r.climate, ctx);
        if (!f.ok) return { id, fit: -9, word: 'Ruled out here', tone: 'bad', traits: [f.words || ''].filter(Boolean) };
        const fit = cropFit(id, r.climate, ctx), band = fitBand(fit);
        return { id, fit, word: FIT_WORDS[band] || FIT_WORDS[1], tone: band >= 2 ? 'good' : 'warn', traits: [] };
      }).sort((a, b) => b.fit - a.fit).map(({ fit, ...rest }) => ({ ...rest, nearby: false }));
    },
  };
}
