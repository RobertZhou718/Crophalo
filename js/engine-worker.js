// The report engine on a worker: a module worker that imports js/engine.js and answers its calls by message, so the long ones (optionsFor takes about 0.8 s on a slow phone)
// never freeze the page. Every message is {id, op, args}; every answer is {id, ok: true, result} or {id, ok: false, error: {name, message}}, with the same id.
// handle() is the whole of it and is also used by the tests and by anything that wants the same answers on the same thread. No network, no storage, no clock of its own.
// Checked by scripts/test_engine_worker.mjs (the answers are byte-identical to the direct calls) and scripts/e2e_engine_worker.mjs (a tap during a run still paints).
import * as E from './engine.js';
import { climateFromPower } from './power-climate.js';
import { packSeries } from './series-pack.js';

// The calls the page may make. Each takes the same arguments as the engine's own function and returns what it returns.
export const OPS = Object.freeze({
  optionsFor: args => E.optionsFor(...args),
  groundOn: args => E.groundOn(...args),
  keyDates: args => E.keyDates(...args),
  climateFromPower: args => { const r = climateFromPower(...args); return r.ok ? { ...r, series: packSeries(r.series) } : r; },   // NASA POWER's answer (text or object) and the place → { ok, series, climate }: the page never parses or works over the 25 years; the record crosses packed and the client unpacks it
  ping: () => ({ engine: true }),
});

export function handle(message) {
  const id = message?.id;
  try {
    const op = message?.op;
    if (typeof op !== 'string' || !Object.hasOwn(OPS, op)) throw new Error(`The engine has no call named ${String(op).slice(0, 40)}`);   // own keys only: "toString" is not a call
    const args = Array.isArray(message.args) ? message.args : [];
    return { id, ok: true, result: OPS[op](args) };
  } catch (e) {
    return { id, ok: false, error: { name: String(e?.name || 'Error'), message: String(e?.message || e) } };
  }
}

// Only inside a worker: listen. (On the page or in Node this file just exports, so it can be imported and tested.)
const inWorker = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;
if (inWorker) self.onmessage = event => { self.postMessage(handle(event.data)); };
