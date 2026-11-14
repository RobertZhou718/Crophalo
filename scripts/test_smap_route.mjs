// Crophalo's offline suite for the lookup runner and the /api/smaproot route of the server (scripts/serve.mjs): the place snapped to 0.01 degrees, an answer kept for its row's time,
// one run for the same place however many ask, a time limit that really stops the lookup, stray output refused, the NASA login handed over to the lookup and never shown.
// A stand-in for the folder's Python prints what each test asks for: nothing here reaches NASA. RULE: never loosen a check here without a written farming reason beside it. Run: node scripts/test_smap_route.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
if (process.platform === 'win32') { console.log('0 passed, 0 failed (skipped: the stand-in Python is a shell script)'); process.exit(0); }

// ---- the row in the real file
const src = fs.readFileSync(path.join(ROOT, 'scripts', 'serve.mjs'), 'utf8');
check('the smaproot row: a point, snapped to 0.01 degrees, kept 6 hours, 150 seconds, its own script', /smaproot: \{[^}]*ttl: 6 \* H[^}]*point: true[^}]*snap: 0\.01[^}]*timeout: 150e3[^}]*script: 'smaproot\.py'/.test(src));
check('the LIVE table is still on one line (the server suite puts test rows into a copy of it)', src.split('\n').filter(l => /^const LIVE = \{/.test(l)).length === 1);

// ---- a throwaway copy of the server with a short time limit, and the stand-in Python
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-route-')));
const SITE = path.join(TMP, 'site'); fs.mkdirSync(path.join(SITE, 'scripts', 'live'), { recursive: true }); fs.mkdirSync(path.join(TMP, 'cache'));
fs.writeFileSync(path.join(SITE, 'scripts', 'serve.mjs'), src.replace('timeout: 150e3', 'timeout: 6000'));
fs.copyFileSync(path.join(ROOT, 'scripts', 'earthdata.mjs'), path.join(SITE, 'scripts', 'earthdata.mjs'));
fs.writeFileSync(path.join(SITE, 'index.html'), '<!doctype html><title>x</title>');
const FAKE = path.join(TMP, 'fakepy.sh'), RUNS = path.join(TMP, 'runs.log'), PIDS = path.join(TMP, 'pid');
fs.writeFileSync(FAKE, `#!/bin/sh
# args: -u smaproot.py LAT LON
lat="$3"; lon="$4"
echo "$lat $lon login=$(env | grep -c '^EARTHDATA_') leak=$(env | grep -c '^SERVER_ONLY_SECRET')" >> "${RUNS}"
case "$lat" in
  0.00) echo '{"ok":false,"reason":"SMAP has no soil-moisture value for the square that holds this place (open water or ice)","final":true}' ;;
  10.00) echo '{"ok":false,"reason":"NASA did not answer just now; try again in a minute"}' ;;
  20.00) echo $$ > "${PIDS}"; sleep 30 ;;
  30.00) echo 'this is not json' ;;
  40.00) echo 'oops' >&2; exit 3 ;;
  50.00) sleep 1; echo '{"ok":true,"value":0.2,"source":"x","data_date":"2026-11-14","units":"u","incomplete":"part of it is missing"}' ;;
  80.00|81.00) sleep 1; echo '{"ok":true,"value":0.4,"source":"x","data_date":"2026-11-14","units":"u"}' ;;
  60.00) sleep 1; echo '{"ok":true,"value":0.3,"source":"x","data_date":"2026-11-14","units":"u"}' ;;
  *) echo '{"ok":true,"value":0.1013,"source":"x","data_date":"2026-11-14","units":"u","cell":{"lat":44.3537,"lon":-79.777}}' ;;
esac
`, { mode: 0o755 });
const start = (env = {}) => new Promise((done, bad) => {
  const server = spawn(process.execPath, [path.join(SITE, 'scripts', 'serve.mjs')], { cwd: SITE, env: { ...process.env, PORT: '0', HOST: '127.0.0.1', FW_PYTHON: FAKE, FW_CACHE: path.join(TMP, 'cache'), EARTHDATA_USERNAME: 'pretend-user', EARTHDATA_PASSWORD: 'pretend-pass-word', SERVER_ONLY_SECRET: 'zzz-secret', HOME: path.join(TMP, 'home'), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; const t = setTimeout(() => bad(new Error('the server did not start')), 15e3);
  server.stdout.on('data', d => { out += d; const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out); if (m) { clearTimeout(t); done({ server, base: `http://127.0.0.1:${m[1]}` }); } });
  server.stderr.on('data', d => { out += d; });
});
const runsOf = () => (fs.existsSync(RUNS) ? fs.readFileSync(RUNS, 'utf8').trim().split('\n').filter(Boolean) : []);
const get = async (base, q, init) => { const r = await fetch(`${base}/api/smaproot${q}`, init); return { status: r.status, headers: r.headers, body: await r.json() }; };

let { server, base } = await start();
try {
  const a = await get(base, '?lat=44.4037&lon=-79.7791');
  same('a good answer: 200, ok, the value from the lookup', [a.status, a.body.ok, a.body.value], [200, true, 0.1013]);
  same('the place really read is the pin snapped to 0.01 degrees, and the answer says so', a.body.spot, { lat: 44.4, lon: -79.78 });
  same('the lookup got the snapped place, not the exact one', runsOf()[0].split(' ').slice(0, 2), ['44.40', '-79.78']);
  check('it says it was just fetched, and when', a.body.cached === false && /^\d{4}-\d\d-\d\dT/.test(a.body.fetched), a.body);
  check('the answer is never kept by the browser (a field\'s place is in it)', /no-store/.test(a.headers.get('cache-control')), a.headers.get('cache-control'));
  const b = await get(base, '?lat=44.4049&lon=-79.7761');
  same('another pin in the same square gets the kept answer and no new run', [b.body.cached, b.body.spot, runsOf().length], [true, { lat: 44.4, lon: -79.78 }, 1]);
  const c = await get(base, '?lat=44.4151&lon=-79.78');
  same('a pin in the next square runs again', [c.body.cached, runsOf().length], [false, 2]);
  check('the NASA login reached the lookup, and nothing else of the server\'s environment did', /login=2 leak=0/.test(runsOf()[0]), runsOf()[0]);
  check('no word of the login or the server\'s secrets is in any answer', ![a, b, c].some(r => /pretend-user|pretend-pass-word|zzz-secret/.test(JSON.stringify(r.body) + JSON.stringify([...r.headers])))); 

  // arguments are refused at the door
  for (const [q, why] of [['', /lat and lon are required/], ['?lat=abc&lon=1', /lat and lon are required/], ['?lat=&lon=5', /lat and lon are required/], ['?lat=91&lon=0', /lat and lon are required/]]) {
    const r = await get(base, q); check(`refused: ${q || '(nothing)'}`, r.status === 400 && why.test(r.body.reason) && runsOf().length === 2, [r.status, r.body]);
  }

  // failures
  const f1 = await get(base, '?lat=0&lon=-30'), f1b = await get(base, '?lat=0&lon=-30'), after1 = runsOf().length;
  same('a final failure (open water) is said, and kept: asking again does not run again', [f1.body.ok, f1.body.final, f1b.body.cached, after1], [false, true, true, 3]);
  const f2 = await get(base, '?lat=10&lon=5'), f2b = await get(base, '?lat=10&lon=5');
  same('a failure that may pass is not kept: it runs again', [f2.body.ok, f2.body.final ?? null, f2b.body.cached, runsOf().length], [false, null, false, 5]);
  const f3 = await get(base, '?lat=30&lon=5');
  same('a lookup that prints something that is not JSON gives the server\'s own sentence', f3.body.reason, 'The smaproot script gave no valid answer (exit 0)');
  const f4 = await get(base, '?lat=40&lon=5');
  same('and one that stops with an error and prints nothing', f4.body.reason, 'The smaproot script gave no valid answer (exit 3)');

  // the time limit really stops the lookup
  const t0 = Date.now(), f5 = await get(base, '?lat=20&lon=5'), took = Date.now() - t0;
  same('a lookup that hangs is stopped at its limit (made short in this test) and the farmer gets a sentence', f5.body.reason, 'Timed out after 6 s');
  check('and it took about the limit, not the lookup\'s 30 seconds (the machine may be slow)', took > 5900 && took < 20000, took);
  await new Promise(r => setTimeout(r, 400));
  const pid = Number(fs.readFileSync(PIDS, 'utf8')), alive = (() => { try { process.kill(pid, 0); return true; } catch { return false; } })();
  check('the stopped lookup\'s process is really gone', !alive, pid);

  // one run for the same place, however many ask; one lookup at a time
  const before = runsOf().length;
  const both = await Promise.all([get(base, '?lat=60&lon=5'), get(base, '?lat=60&lon=5'), get(base, '?lat=60&lon=5')]);
  same('three at once for the same new place share one run', [both.every(r => r.body.ok), runsOf().length - before, both.filter(r => r.body.cached === false).length], [true, 1, 3]);
  const t1 = Date.now(); const two = await Promise.all([get(base, '?lat=80&lon=5'), get(base, '?lat=81&lon=5')]), span = Date.now() - t1;
  check('two different places wait their turn (one lookup at a time on a small host): both answer, one after the other (each takes a second here)', two.every(r => r.body.ok) && span >= 1900, span);
  const part = await get(base, '?lat=50&lon=5'), partAgain = await get(base, '?lat=50&lon=5');
  same('a partial answer is kept, but for an hour only (the second is kept all the same here)', [part.body.incomplete, partAgain.body.cached], ['part of it is missing', true]);

  // the status routes know the lookup
  const src = await (await fetch(`${base}/api/sources`)).json(), row = src.find(x => x.id === 'smaproot');
  same('the sources list holds it with its time of keeping', [row?.name, row?.ttl_hours], ['NASA SMAP root-zone soil moisture', 6]);
  const health = await (await fetch(`${base}/api/health`)).json();
  same('health says how many lookups run now (none) and none wait', [health.busy, health.queued], [0, 0]);
  const wrongSite = await fetch(`${base}/api/smaproot?lat=44&lon=-79`, { headers: { origin: 'https://evil.example' } });
  same('another website cannot ask', wrongSite.status, 403);
  const post = await fetch(`${base}/api/smaproot?lat=44&lon=-79`, { method: 'POST' });
  same('only GET', post.status, 405);
} finally { server.kill(); }

// ---- no Python
({ server, base } = await start({ FW_PYTHON: path.join(TMP, 'no-python') }));
try { const r = await get(base, '?lat=44&lon=-79'); same('with no Python the route says so plainly', [r.status, r.body.reason], [500, 'Python environment not found (.venv)']); } finally { server.kill(); }

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
