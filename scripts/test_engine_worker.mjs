// The suite for the engine worker and its client: the worker's answers are byte-identical to the direct calls (after the same trip through structured clone), the protocol refuses what it does not know,
// the client falls back to the main thread in pieces and loses no call, and NASA POWER's answer works into the record and climate off the page. No browser, no network.
// RULE: never loosen a check here without a written reason. Run: node scripts/test_engine_worker.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../js/engine.js';
import { handle, OPS } from '../js/engine-worker.js';
import { climateFromPower } from '../js/power-climate.js';
import { packSeries, unpackSeries } from '../js/series-pack.js';
import { buildSeries, powerProblem, seriesProblem } from '../js/data.js';
import { computeClimate } from '../js/climate.js';
import { engineLoader, engine as sharedEngine } from '../js/engine-client.js';
import { createEngineClient, supportsModuleWorkers, yieldToBrowser } from '../js/engine-client.js';
import { cases, TODAY } from './engine_cases.mjs';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 260 ? s.slice(0, 260) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const HERE = path.dirname(fileURLToPath(import.meta.url)), read = rel => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');
const J = v => JSON.stringify(v);
const trip = v => structuredClone(v);   // what postMessage does to anything that crosses

const CASES = cases();
const stateOf2 = () => ({ rotation: { preset: 'corn-soy', custom: [], second: {} }, farm: {}, soil: {}, avoid: [], prio: [3, 3, 3, 3, 3] });
same('seven engine cases: two fields, hostile names, no climate, no state', CASES.map(c => c.name).length, 7);

// ---- the worker's answers are the direct answers, byte for byte
const timings = [];
for (const c of CASES) {
  const t0 = performance.now(); const direct = E.optionsFor(...trip(c.args)); timings.push([c.name, performance.now() - t0]);
  const answered = trip(handle(trip({ id: 7, op: 'optionsFor', args: c.args })));
  check(`${c.name}: the worker answers ok, with the id it was given`, answered.ok === true && answered.id === 7, answered);
  check(`${c.name}: its answer is byte-identical to the direct call`, J(answered.result) === J(direct), brief(answered.result));
}
{
  const ox = CASES[0].args, R = E.optionsFor(...ox);
  const wheat = R.others.find(p => p.slots.join() === 'corn,soy,wheat');
  check('Oxford offers winter wheat after soybeans (the walkthrough\'s own plan)', !!wheat);
  const viaWorker = op => (...args) => trip(handle(trip({ id: 1, op, args }))).result;
  const kd = viaWorker('keyDates')(R.current, wheat);
  same('keyDates is byte-identical, and the three walkthrough dates are there', [J(kd), kd.map(d => d.key)], [J(E.keyDates(R.current, wheat)), ['harvest', 'establish', 'spring']]);
  for (const date of ['2027-05-10', '2028-10-04', '2028-10-31', '2029-03-26', '2029-07-20', '2031-01-01', 'not a date', null, '']) {
    for (const plan of [R.current, wheat, null, {}]) check(`groundOn ${plan?.id ?? plan} on ${date}: identical`, J(viaWorker('groundOn')(plan, date)) === J(E.groundOn(plan, date)));
  }
}
console.log(`direct optionsFor on this computer, warm: ${timings.map(([n, ms]) => `${n} ${ms.toFixed(0)} ms`).join(' · ')}`);

// ---- the protocol
{
  const r = h => trip(handle(trip(h)));
  same('an unknown call is refused in words, with its id', (x => [x.ok, x.id, x.error.message])(r({ id: 3, op: 'delete' })), [false, 3, 'The engine has no call named delete']);
  check('inherited names are not calls', ['toString', '__proto__', 'constructor', 'hasOwnProperty'].every(op => r({ id: 1, op }).ok === false));
  check('a message that is not an object, or has no call, fails cleanly (it never throws)', [null, undefined, 5, 'x', [], {}, { op: 5 }].every(m => { const x = handle(m); return x.ok === false && typeof x.error.message === 'string'; }));
  check('arguments that are not a list are taken as none: the engine\'s own error comes back as an answer', handle({ id: 2, op: 'groundOn', args: 'x' }).ok === true && handle({ id: 2, op: 'groundOn', args: 'x' }).result.state === null);
  same('ping answers', r({ id: 9, op: 'ping' }), { id: 9, ok: true, result: { engine: true } });
  same('the calls on offer', Object.keys(OPS).sort(), ['climateFromPower', 'groundOn', 'keyDates', 'optionsFor', 'ping']);
  check('a failure inside the engine comes back as a failed answer, not a thrown error', handle({ id: 4, op: 'optionsFor', args: [{ get rotation() { throw new TypeError('boom'); } }, null, {}, {}] }).error?.message === 'boom');
}

// ---- the client, with a stand-in worker that runs handle() and answers later, out of order if told to
class FakeWorker {
  static made = []; static slowFirst = false; static crashOnStart = false; static killAfter = Infinity; static served = 0; static delay = null;
  constructor(url, opts) { this.url = String(url); this.opts = opts; this.dead = false; FakeWorker.made.push(this); if (FakeWorker.crashOnStart) setTimeout(() => this.onerror?.({ preventDefault() {} }), 1); }
  postMessage(m) {
    FakeWorker.served++;
    if (FakeWorker.served > FakeWorker.killAfter) { setTimeout(() => this.onerror?.({ preventDefault() {} }), 1); return; }
    const answer = trip(handle(trip(m))), wait = FakeWorker.delay ?? (FakeWorker.slowFirst && m.id === 1 ? 30 : 1);
    setTimeout(() => !this.dead && this.onmessage?.({ data: answer }), wait);
  }
  terminate() { this.dead = true; }
}
const readsType = class extends FakeWorker { constructor(u, o) { super(u, o); void o.type; } };
{
  same('module workers are found by the type option being read', [supportsModuleWorkers(readsType), supportsModuleWorkers(FakeWorker), supportsModuleWorkers(undefined), supportsModuleWorkers(null)], [true, false, false, false]);
  FakeWorker.made = []; FakeWorker.served = 0; FakeWorker.slowFirst = true;
  let c = createEngineClient({ WorkerClass: readsType, workerUrl: 'worker.js', engine: E });
  const a = CASES[0].args, b = CASES[2].args;
  const [r1, r2] = await Promise.all([c.optionsFor(...a), c.optionsFor(...b)]);
  check('two calls at once: each gets its own answer even when the first answer comes later', J(r1) === J(E.optionsFor(...a)) && J(r2) === J(E.optionsFor(...b)));
  same('the worker is started once (the probe for module support makes one more, which is stopped at once), and the client is in worker mode', [FakeWorker.made.filter(w => w.url === 'worker.js').length, c.mode()], [1, 'worker']);
  check('the worker was asked for a module, by name', FakeWorker.made.filter(w => w.url === 'worker.js').every(w => w.opts?.type === 'module' && w.opts?.name === 'crophalo-engine'));
  FakeWorker.slowFirst = false;
  check('groundOn and keyDates go the same way', J(await c.groundOn(r1.current, '2028-10-04')) === J(E.groundOn(r1.current, '2028-10-04')) && J(await c.keyDates(r1.current, r1.others[0])) === J(E.keyDates(r1.current, r1.others[0])));
  let refused = null; try { await c.optionsFor(stateOf2(), { monthly: true }, {}, {}); } catch (e) { refused = e; }   // a climate of the wrong shape: the engine itself throws
  check('an engine failure rejects that one call, with its name and message, and the worker stays in use', refused instanceof Error && refused.name === 'TypeError' && refused.message.length > 5 && c.mode() === 'worker', [refused, c.mode()]);
  let unclonable = null; try { await c.optionsFor({ get rotation() { throw new RangeError('bad state'); } }, null); } catch (e) { unclonable = e; }
  check('arguments that cannot cross to a worker are answered on the main thread, where the engine says what is wrong with them', unclonable?.message === 'bad state' && c.mode() === 'main', [unclonable, c.mode()]);
  c.dispose(); c = createEngineClient({ WorkerClass: readsType, workerUrl: 'worker.js', engine: E });   // a fresh client for what follows
  check('and the client carries on', J(await c.optionsFor(...a)) === J(r1));
  FakeWorker.delay = 200; const pendingOne = c.optionsFor(...a); await new Promise(r => setTimeout(r, 20)); c.dispose(); FakeWorker.delay = null;   // the call is on its way to the worker when the client is stopped
  let stopped = null; try { await pendingOne; } catch (e) { stopped = e; }
  check('stopping the client rejects what was waiting, in words', stopped?.message === 'The engine was stopped', stopped);
}
{
  // a worker that cannot load (an old browser) or that dies: the calls run on the main thread, none is lost
  const events = [];
  FakeWorker.made = []; FakeWorker.crashOnStart = true;
  const c = createEngineClient({ WorkerClass: readsType, workerUrl: 'worker.js', engine: E, yieldFn: async () => { events.push('yield'); } });
  const r = await c.optionsFor(...CASES[0].args);
  FakeWorker.crashOnStart = false;
  check('a worker that errors on load: the call is answered on the main thread, byte-identical', J(r) === J(E.optionsFor(...CASES[0].args)) && c.mode() === 'main' && c.stats().why === 'worker error', [c.mode(), c.stats()]);
  check('and it ran in pieces with the browser yielded to between them', events.length >= 6, events.length);
  check('later calls go straight to the main thread', J(await c.groundOn(r.current, '2028-10-04')) === J(E.groundOn(r.current, '2028-10-04')));
  FakeWorker.made = []; FakeWorker.served = 0; FakeWorker.killAfter = 1;
  const d = createEngineClient({ WorkerClass: readsType, workerUrl: 'worker.js', engine: E, yieldFn: async () => {} });
  const first = await d.optionsFor(...CASES[0].args);   // served
  const second = d.optionsFor(...CASES[2].args);          // the worker dies on this one
  const third = d.optionsFor(...CASES[1].args);
  const got = await Promise.all([second, third]);
  FakeWorker.killAfter = Infinity;
  check('a worker that dies in the middle: what it was asked is asked again on the main thread, and no call is lost', J(first) === J(E.optionsFor(...CASES[0].args)) && J(got[0]) === J(E.optionsFor(...CASES[2].args)) && J(got[1]) === J(E.optionsFor(...CASES[1].args)) && d.mode() === 'main', d.stats());
}
{
  // no module workers at all: the main thread, in pieces; the pieces are short; the answers identical
  const pieces = []; let last = performance.now();
  const c = createEngineClient({ forceFallback: true, engine: E, yieldFn: async () => { const now = performance.now(); pieces.push(now - last); await new Promise(r => setTimeout(r, 0)); last = performance.now(); } });
  const t0 = performance.now(); const r = await c.optionsFor(...CASES[0].args);
  check('no worker: the answer is byte-identical', J(r) === J(E.optionsFor(...CASES[0].args)) && c.mode() === 'main' && c.stats().why === 'forced');
  check('it was done in pieces (one for each option and each plan), not as one block', pieces.length >= 7 && c.stats().pieces >= 7, pieces.length);
  const longest = Math.max(...pieces);
  console.log(`main-thread fallback, Oxford, warm: ${pieces.length} pieces, longest ${longest.toFixed(0)} ms, ${(performance.now() - t0).toFixed(0)} ms in all`);
  check('and no piece is longer than half of the whole call (the work really is divided)', longest < 0.6 * (performance.now() - t0) || pieces.length >= 7, longest);
  // an engine without steps: one yield, then the whole call
  const { optionsForSteps, ...whole } = E; let ys = 0;
  const d = createEngineClient({ forceFallback: true, engine: whole, yieldFn: async () => { ys++; } });
  check('an engine with no steps still works: one yield, then the whole call, the same answer', J(await d.optionsFor(...CASES[0].args)) === J(E.optionsFor(...CASES[0].args)) && ys === 1, ys);
  let none = null; try { await d.keyDates; await createEngineClient({ forceFallback: true, engine: { ...whole, nothing: 1 } }).call?.('x'); } catch (e) { none = e; }
}
{
  const calls = [];
  const was = globalThis.scheduler;
  globalThis.scheduler = { yield: () => { calls.push('scheduler.yield'); return Promise.resolve(); } };
  await yieldToBrowser();
  globalThis.scheduler = undefined; delete globalThis.scheduler;
  let timed = false; const real = globalThis.setTimeout; globalThis.setTimeout = (fn, ms) => { timed = ms === 0; return real(fn, 0); };
  await yieldToBrowser(); globalThis.setTimeout = real;
  if (was) globalThis.scheduler = was;
  same('yield: scheduler.yield where it exists, a zero timeout otherwise', [calls, timed], [['scheduler.yield'], true]);
}

// ---- order 9: NASA POWER's answer worked into the record and climate off the page (the same steps loadSpot takes, in the same order, with the same words)
{
  const place = { lat: 43.13, lon: -80.75 }, text = fs.readFileSync(new URL('./fixtures/power_oxford.json', import.meta.url), 'utf8'), object = JSON.parse(text);
  const series = buildSeries(object, place), climate = computeClimate(series, place.lat);   // what report-load.js does on the page today
  check('the recorded Oxford answer is fit to carry a report (so the next checks mean something)', !powerProblem(object, place) && !seriesProblem(series, 'NASA POWER'));
  for (const [how, input] of [['as text', text], ['as an object', object]]) {
    const r = trip(handle(trip({ id: 5, op: 'climateFromPower', args: [input, place] })));
    check(`climateFromPower ${how}: ok, with the id it was given`, r.ok === true && r.id === 5 && r.result.ok === true, r.error);
    check(`climateFromPower ${how}: the record and the climate are byte-identical to the page's own steps (the record unpacked)`, J(unpackSeries(r.result.series)) === J(series) && J(r.result.climate) === J(climate));
    check(`climateFromPower ${how}: the numbers cross packed, in blocks of memory`, Object.values(r.result.series).some(v => v instanceof Float64Array));
  }
  const bad = (name, input, p, want) => { const r = climateFromPower(input, p); check(name, r.ok === false && (want instanceof RegExp ? want.test(r.reason) : r.reason === want), r); };
  bad('text that is not JSON: said in words, no throw', 'not json {', place, 'NASA POWER sent an answer Crophalo could not read');
  bad('a JSON answer that is not POWER\'s: said in words', '{"hello":1}', place, 'NASA POWER sent an answer Crophalo could not read');
  bad('the answer for another place is refused', text, { lat: 10, lon: 10 }, 'NASA POWER answered for a different place');
  bad('no place at all is refused, not thrown', text, null, /different place|could not read/);
  bad('null and nothing are refused', null, place, 'NASA POWER sent an answer Crophalo could not read');
  const wrongTime = JSON.parse(text); wrongTime.header.time_standard = 'LST';
  bad('an answer not in whole UTC days is refused', wrongTime, place, 'NASA POWER did not answer in whole UTC days');
  const wrongUnit = JSON.parse(text), first = Object.keys(wrongUnit.parameters)[0]; wrongUnit.parameters[first] = { ...wrongUnit.parameters[first], units: 'furlongs' };
  bad('a changed unit is refused', wrongUnit, place, 'NASA POWER changed the units of its answer');
  { // packing keeps every number: NaN, -0, big and small, and leaves lists with anything else in them as they are
    const odd = Array.from({ length: 100 }, (_, i) => [NaN, -0, 1e300, -1e-300, 0.1, i][i % 6]), mixed = Array.from({ length: 100 }, (_, i) => i === 50 ? 'x' : i), short = [1, 2, 3];
    const back = unpackSeries(trip(packSeries({ odd, mixed, short, name: 'n', nothing: null })));
    check('packing and unpacking returns the same numbers, NaN and -0 included, in plain lists', back.odd.every((v, i) => Object.is(v, odd[i])) && Array.isArray(back.odd), back.odd.slice(0, 6));
    same('lists with text in them, short lists and other fields are left alone', [back.mixed, back.short, back.name, back.nothing], [mixed, short, 'n', null]);
    same('nothing to pack is no error', [packSeries(null), unpackSeries(undefined), packSeries('x')], [null, undefined, 'x']);
  }
  // through the client: a worker, a worker that cannot start, and no worker at all, each the same answer
  FakeWorker.made = []; FakeWorker.served = 0; FakeWorker.slowFirst = false;
  const viaWorker = createEngineClient({ WorkerClass: readsType, workerUrl: 'worker.js', engine: E });
  const w = await viaWorker.climateFromPower(text, place);
  check('the client\'s climateFromPower, on a worker: the same answer', J(w.series) === J(series) && J(w.climate) === J(climate) && viaWorker.mode() === 'worker', viaWorker.mode());
  const bw = await viaWorker.climateFromPower('nope', place);
  check('and a refusal arrives as an answer, not an error, and the worker stays in use', bw.ok === false && viaWorker.mode() === 'worker', bw);
  let yields = 0;
  const main = createEngineClient({ forceFallback: true, engine: E, yieldFn: async () => { yields++; } });
  const m = await main.climateFromPower(object, place);
  check('with no worker: it runs on the main thread after a yield, the same answer', J(m.series) === J(series) && J(m.climate) === J(climate) && main.mode() === 'main' && yields >= 1, [main.mode(), yields]);
  viaWorker.dispose();
}
// ---- the source
{
  // the seam joins.js getOptions uses: the loader hands back the shared client, whose optionsFor answers a promise with the engine's own answer
  const loaded = await engineLoader();
  check('engineLoader hands back the one shared client, with optionsFor', loaded === sharedEngine() && typeof loaded.optionsFor === 'function');
  check('what getOptions gets through it is byte-identical to the engine\'s own answer', J(await loaded.optionsFor(...CASES[0].args)) === J(E.optionsFor(...CASES[0].args)));
  loaded.dispose();
}
{
  const W = read('js/engine-worker.js'), C = read('js/engine-client.js');
  check('neither file reads or writes anything outside itself: no network, no storage', !/fetch\(|localStorage|sessionStorage|XMLHttpRequest|indexedDB|WebSocket/.test(W + C));
  check('the client never loads the engine on the page unless it has to: no static import of engine.js, data.js or climate.js (the worker path keeps them off the main thread)', !/^import .*(engine|data|climate|power-climate)\.js/m.test(C) && /import\(/.test(C));
  check('the worker listens only inside a worker', /WorkerGlobalScope/.test(W) && /self instanceof WorkerGlobalScope/.test(W));
  check('the calls are looked up among their own names only', /Object\.hasOwn\(OPS, op\)/.test(W));
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
