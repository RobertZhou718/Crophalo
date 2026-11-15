// Crophalo's pre-warm: after a deploy, asks the data server for the two United States demo fields' slow lookups, ONE AT A TIME with a pause, so the answers are kept before anyone opens a demo.
// Run by hand: node scripts/prewarm.mjs https://<the data server> . Checked by scripts/test_cache.mjs (its asking, its stop at the first busy answer and its table). It never has more than one request in flight, stops at the first "busy" or 429 answer, and prints a small table. It asks only the demo fields' places.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = String(process.argv[2] ?? '').replace(/\/+$/, ''), PAUSE_MS = Number(process.env.PREWARM_PAUSE_MS ?? 5000), LIMIT_MS = 200e3;
if (!/^https?:\/\/[^/\s]+$/.test(BASE)) { console.log('use: node scripts/prewarm.mjs https://<the data server>'); process.exit(2); }

// the requests the page makes for each demo, taken from the recorded answers' own names (scripts/recorded/index.json holds the address of each)
const index = JSON.parse(fs.readFileSync(path.join(HERE, 'recorded', 'index.json'), 'utf8'));
const rows = [];
for (const [demo, list] of Object.entries(index)) for (const e of list) rows.push({ demo, lookup: e.lookup, path: e.path });
const wait = ms => new Promise(done => setTimeout(done, ms));
const table = [];
for (const r of rows) {
  const t0 = Date.now();
  let status = 'error', note = '';
  try {
    const res = await fetch(BASE + r.path, { signal: AbortSignal.timeout(LIMIT_MS) });
    const body = await res.json().catch(() => null);
    if (res.status === 429 || /busy/i.test(body?.reason ?? '')) { table.push([r.demo, r.lookup, 'busy', '', Math.round((Date.now() - t0) / 1e3)]); console.log('the server says it is busy: stopping here.'); break; }
    status = body?.ok === true ? (body.recorded ? 'recorded' : body.cached ? 'kept' : 'fresh') : 'no answer'; note = body?.ok === true ? (body.data_date ?? '') : String(body?.reason ?? '').slice(0, 60);
  } catch (e) { note = e.name === 'TimeoutError' ? 'no answer in 200 s' : 'could not ask'; }
  table.push([r.demo, r.lookup, status, note, Math.round((Date.now() - t0) / 1e3)]);
  await wait(PAUSE_MS);
}
const w = [14, 10, 10, 30, 6];
console.log(['demo', 'lookup', 'answer', 'data date / why', 'secs'].map((h, i) => h.padEnd(w[i])).join(' '));
for (const row of table) console.log(row.map((c, i) => String(c).padEnd(w[i])).join(' '));
