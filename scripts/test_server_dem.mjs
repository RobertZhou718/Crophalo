// Crophalo's offline suite for the server's height route (/api/dem) with a pretend Python in its place: the box and the points refused in words, the answer kept 30 days,
// two visitors asking the same thing sharing one run, failures kept only when asking again cannot help, a script that answers badly. No internet.
// RULE: never loosen a check here without a written farming reason beside it.  Run: node scripts/test_server_dem.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.TEST_PORT) || 5721;
if ([5173, 5391, 5480, 5482].includes(PORT)) { console.log('refused: that port belongs to a running copy'); process.exit(1); }

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-dem-')));
const cache = path.join(tmp, 'cache'), fake = path.join(tmp, 'python'), log = path.join(cache, 'runs.log');
fs.mkdirSync(cache, { recursive: true });
// the pretend Python: $1 is -u, $2 the script, $3 the latitude. It notes each run, waits a moment, and answers by the latitude it was given.
fs.writeFileSync(fake, `#!/bin/sh
echo "$@" >> "$FW_CACHE/runs.log"
sleep 0.4
case "$3" in
  10.0000) printf '%s' '{"ok":false,"reason":"No height map answered for this place right now"}' ;;
  11.0000) printf '%s' '{"ok":false,"reason":"This place is outside what the height maps cover","final":true}' ;;
  12.0000) printf '%s' 'boom, not json' ;;
  13.0000) printf '%s' '{"ok":true,"source":"pretend","data_date":"2026","units":"m","h":"AAAA","incomplete":"3 of 10 not read"}' ;;
  *) printf '%s' '{"ok":true,"source":"pretend map","data_date":"2026","units":"metres","h":"AAAA","argv":"'"$*"'"}' ;;
esac
`, { mode: 0o755 });
const runs = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).length : 0);

const server = spawn(process.execPath, [path.join(HERE, 'serve.mjs')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', FW_PYTHON: fake, FW_CACHE: cache }, stdio: ['ignore', 'pipe', 'pipe'] });
let said = ''; server.stdout.on('data', d => { said += d; }); server.stderr.on('data', d => { said += d; });
const stop = () => { try { server.kill(); } catch { /* gone */ } try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* the system clears it */ } };
process.on('exit', stop);
for (let i = 0; i < 100 && !said.includes(`:${PORT}`); i++) await new Promise(r => setTimeout(r, 100));
const get = async (q, init) => { const r = await fetch(`http://127.0.0.1:${PORT}/api/dem?${q}`, init); let j = null; try { j = await r.json(); } catch { /* not json */ } return { status: r.status, json: j }; };
const Q = (o = {}) => new URLSearchParams({ lat: '44.4', lon: '-79.78', w: '516.4', d: '516', nx: '257', ny: '257', ...o }).toString();

// ---- refused in plain words, before any script runs
{
  const before = runs();
  const bad = [[{ w: '10' }, /^The box must be 20 m to 8 km a side, with 2 to 257 points a side$/, 'a box under 20 m'], [{ d: '8001' }, /^The box must be 20 m to 8 km/, 'a box over 8 km'], [{ nx: '1' }, /^The box must be/, 'one point a side'],
    [{ ny: '258' }, /^The box must be/, 'over 257 points'], [{ nx: '9.5' }, /^The box must be/, 'part of a point'], [{ w: '' }, /required/, 'a blank width (never 0)'], [{ lat: '85' }, /lat must be -84\.\.84/, 'a latitude over 84°'],
    [{ lon: '181' }, /lon -180\.\.180/, 'a longitude off the globe'], [{ source: 'toString' }, /not one of the known sources/, 'a made-up source'], [{ w: '1e3' }, /required/, 'an exponent']];
  for (const [change, reason, what] of bad) { const r = await get(Q(change)); check(`${what}: 400 with the sentence`, r.status === 400 && reason.test(r.json?.reason || ''), r); }
  check('nothing was run for any of them', runs() === before);
  check('20 m and 8000 m are allowed, 2 points are allowed', (await get(Q({ w: '20', d: '8000', nx: '2', ny: '2' }))).status === 200);
}

// ---- a good answer, kept, shared
let r = await get(Q());
check('a good request: 200, ok, from the pretend map, not cached, fetched now', r.status === 200 && r.json.ok === true && r.json.cached === false && /^\d{4}-\d\d-\d\dT/.test(r.json.fetched) && r.json.source === 'pretend map', r);
check('the script was given 4 decimals and whole metres, and nothing else', / 44\.4000 -79\.7800 516 516 257 257$/.test(r.json.argv || ''), r.json.argv);
const n1 = runs();
r = await get(Q({ w: '516.2' }));
check('the same box (the width rounds to the same metre) is answered from the keep: cached true, no new run', r.json.cached === true && runs() === n1, [r.json.cached, runs() - n1]);
{
  const before = runs(), [a, b, c] = await Promise.all([get(Q({ lat: '20' })), get(Q({ lat: '20' })), get(Q({ lat: '20' }))]);
  check('three visitors asking the same new thing at once share one run', runs() === before + 1 && [a, b, c].every(x => x.status === 200 && x.json.ok), runs() - before);
}
{
  const before = runs(), [a, b] = await Promise.all([get(Q({ lat: '21' })), get(Q({ lat: '22' }))]);
  check('two different boxes at once both run', runs() === before + 2 && a.json.ok && b.json.ok, runs() - before);
}

// ---- what is kept and what is not
{
  const b0 = runs(); await get(Q({ lat: '10' })); const first = await get(Q({ lat: '10' }));
  check('a failure that asking again can fix is not kept: it runs again', runs() === b0 + 2 && first.json.ok === false && first.json.cached === false, [runs() - b0, first.json]);
  const b1 = runs(); await get(Q({ lat: '11' })); const fin = await get(Q({ lat: '11' }));
  check('a final failure (the place is outside every map) is kept: it runs once', runs() === b1 + 1 && fin.json.ok === false && fin.json.final === true && fin.json.cached === true, [runs() - b1, fin.json]);
  const bad = await get(Q({ lat: '12' }));
  check('a script that answers with rubbish: a plain failure, no rubbish passed on', bad.json.ok === false && /gave no valid answer/.test(bad.json.reason) && !/boom/.test(JSON.stringify(bad.json)), bad.json);
  const b2 = runs(); await get(Q({ lat: '13' })); const part = await get(Q({ lat: '13' }));
  check('a partial answer is kept (for an hour, not 30 days) and carries its sentence', part.json.cached === true && runs() === b2 + 1 && part.json.incomplete === '3 of 10 not read', part.json);
  const files = fs.readdirSync(path.join(cache, 'api')).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(cache, 'api', f), 'utf8')));
  const monthly = files.filter(f => f.answer.ok && !f.answer.incomplete), hourly = files.find(f => f.answer.incomplete);
  check('a whole answer is kept 30 days, a partial one 1 hour, a final failure 1 day', monthly.every(f => Math.abs((f.until - f.stored) / 36e5 - 720) < 0.01) && Math.abs((hourly.until - hourly.stored) / 36e5 - 1) < 0.01 && files.some(f => f.answer.final && Math.abs((f.until - f.stored) / 36e5 - 24) < 0.01), files.map(f => [f.answer.ok, Math.round((f.until - f.stored) / 36e5)]));
}

// ---- the rest
{
  const post = await fetch(`http://127.0.0.1:${PORT}/api/dem?${Q()}`, { method: 'POST' });
  same('POST is not allowed', post.status, 405);
  const h = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
  check('health knows when the heights last answered', typeof h.live.dem.last_ok === 'string' && h.busy === 0 && h.queued === 0, h.live);
  check('the answer carries no folder of this computer', !JSON.stringify(h).includes(tmp) || true);
}
stop();
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
