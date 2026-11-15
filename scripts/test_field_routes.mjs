// Crophalo's offline suite for the two lookups a United States field asks of the server (scripts/serve.mjs): GET /api/soilfield (the US soil survey) and GET /api/mnfield (USDA Market News cash bids), and their rows in GET /api/sources. Checked: both run in the quick lane, the place is snapped as the row says, the Market News key reaches its own lookup only (from the host's settings or the folder's key file) and no answer holds it, a missing key is a plain "not set up on this server" answer with nothing started, and a public server keeps /api/keys shut.
// A stand-in for the folder's Python prints what each test asks for: nothing here reaches USDA, and the keys are made-up words. Run: node scripts/test_field_routes.mjs
// RULE: never loosen a check here without a written farming or legal reason beside it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 400 ? s.slice(0, 400) + '…' : s; };
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
if (process.platform === 'win32') { console.log('0 passed, 0 failed (skipped: the stand-in Python is a shell script)'); process.exit(0); }

// ---- the rows in the real file
const src = fs.readFileSync(path.join(ROOT, 'scripts', 'serve.mjs'), 'utf8');
check('the soilfield row: a point, snapped to 0.001 degrees, kept 30 days, 60 seconds, its own script, no key', /soilfield: \{[^}]*ttl: 30 \* 24 \* H[^}]*point: true[^}]*snap: 0\.001[^}]*timeout: 60e3[^}]*script: 'soilfield\.py' \}/.test(src) && !/soilfield: \{[^}]*key:/.test(src));
check('the mnfield row: kept 6 hours, 100 seconds, its own argument check, the Market News key, its own script', /mnfield: \{[^}]*ttl: 6 \* H[^}]*timeout: 100e3[^}]*args: mnArgs[^}]*key: 'ams'[^}]*script: 'mnfield\.py' \}/.test(src));
check('both are quick lookups: a place of their own, never behind the slow satellite lookups', /const QUICK = new Set\(\[[^\]]*'soilfield'[^\]]*'mnfield'[^\]]*\]\)/.test(src));
check('the LIVE table is still on one line (the server suite puts test rows into a copy of it)', src.split('\n').filter(l => /^const LIVE = \{/.test(l)).length === 1);
check('the key is handed to a lookup by name, and only to the lookup whose row asks for it', /const KEY_ENV = Object\.freeze\(\{ ams: \['CROPHALO_AMS_KEY', 'CROPHALO_SECRETS_DIR'\] \}\);/.test(src) && /\(KEY_ENV\[row\.key\] \|\| \[\]\)\.map\(keep\)/.test(src));
for (const f of ['keys.mjs', 'mnargs.mjs', 'live/soilfield.py', 'live/mnfield.py', 'live/mnlib.py', 'live/groundlib.py']) check(`scripts/${f} is in the folder`, fs.existsSync(path.join(ROOT, 'scripts', f)));
const ignore = fs.existsSync(path.join(ROOT, '.dockerignore')) ? fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')) : [];
check('none of them is left out of the data server\'s image', !ignore.some(l => ['scripts', 'scripts/live', 'scripts/keys.mjs', 'scripts/mnargs.mjs', 'scripts/*.mjs', 'scripts/live/*.py', '**/*.py'].includes(l)), ignore);

// ---- a throwaway copy of the server, and the stand-in Python
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-fieldroutes-')));
const KEY = 'made-up-market-key-97531', OTHER = 'zzz-server-only-word';
const SOIL = { ok: true, source: 'x', data_date: '2026-11-14', units: 'u', survey: 'SSURGO', mapunit: { name: 'Tomek silt loam, 0 to 2 percent slopes' }, soils: [{ name: 'Tomek', percent: 85, top: { organic_matter_pct: 3.5, sand_pct: 6, silt_pct: 68, clay_pct: 26 } }] };
const BIDS = { ok: true, source: 'x', mode: 'now', today: '2026-11-15', place: { state: 'NE', state_name: 'Nebraska' }, crops: [], reports: [] };
function site(name) {
  const dir = path.join(TMP, name); fs.mkdirSync(path.join(dir, 'scripts', 'live'), { recursive: true }); fs.mkdirSync(path.join(dir, 'cache'));
  for (const f of ['serve.mjs', 'earthdata.mjs', 'hostmode.mjs', 'status.mjs', 'keys.mjs', 'mnargs.mjs']) fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(dir, 'scripts', f));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>x</title>');
  return dir;
}
const FAKE = path.join(TMP, 'fakepy.sh'), RUNS = path.join(TMP, 'runs.log');
// args: -u SCRIPT ARGS… ; it writes what it was started with and how many key settings it could see, never a value
fs.writeFileSync(FAKE, `#!/bin/sh
script="$2"; shift 2
echo "$script|$*|ams=$(env | grep -c '^CROPHALO_AMS_KEY=')|dir=$(env | grep -c '^CROPHALO_SECRETS_DIR=')|other=$(env | grep -c -E '^(SERVER_ONLY_SECRET|CROPHALO_NASS_KEY|CROPHALO_OPENET_KEY)=')" >> "${RUNS}"
case "$script" in
  soilfield.py) echo '${JSON.stringify(SOIL)}' ;;
  mnfield.py) case "$1" in 10.00) echo '{"ok":false,"reason":"USDA Market News did not answer just now; try again in a minute"}' ;; *) echo '${JSON.stringify(BIDS)}' ;; esac ;;
  smaproot.py) sleep 6; echo '{"ok":true,"value":0.2,"source":"x","data_date":"2026-11-14","units":"u"}' ;;
  *) echo '{"ok":false,"reason":"not a lookup of this test"}' ;;
esac
`, { mode: 0o755 });
const start = (dir, env = {}) => new Promise((done, bad) => {
  const server = spawn(process.execPath, [path.join(dir, 'scripts', 'serve.mjs')], { cwd: dir, env: { PATH: process.env.PATH, PORT: '0', HOST: '127.0.0.1', FW_PYTHON: FAKE, FW_CACHE: path.join(dir, 'cache'), HOME: path.join(TMP, 'home'), SERVER_ONLY_SECRET: OTHER, CROPHALO_NASS_KEY: OTHER, CROPHALO_OPENET_KEY: OTHER, LIVE_MAX: '2', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const s = { server, out: '' }; const t = setTimeout(() => bad(new Error('the server did not start: ' + s.out)), 15e3);
  server.stdout.on('data', d => { s.out += d; const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(s.out); if (m && !s.base) { clearTimeout(t); s.base = `http://127.0.0.1:${m[1]}`; done(s); } });
  server.stderr.on('data', d => { s.out += d; });
});
const stop = s => new Promise(done => { if (s.server.exitCode != null || s.server.signalCode) return done(); s.server.once('exit', done); s.server.kill('SIGTERM'); });   // by its own PID
const runsOf = () => (fs.existsSync(RUNS) ? fs.readFileSync(RUNS, 'utf8').trim().split('\n').filter(Boolean) : []);
const get = async (base, p, init) => { const r = await fetch(base + p, init); let body = null; const text = await r.text(); try { body = JSON.parse(text); } catch { /* said by the checks */ } return { status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control'), body, text }; };
const rowOf = (list, id) => (Array.isArray(list) ? list.find(r => r.id === id) : null);
const everything = [];   // every answer of every server, searched for a key at the end
const NOT_SET = { ok: false, not_set: true, reason: 'Local market prices (USDA Market News) are not set up on this server (the owner\'s free key is not set)' };

try {
  // ---- no key on the server
  const a = site('nokey'); let s = await start(a);
  try {
    const none = await get(s.base, '/api/mnfield?lat=41.18&lon=-96.44&mode=now&crops=corn,soy'); everything.push(none.text);
    same('the cash bids without the key: 200, JSON, the plain "not set up on this server" sentence', [none.status, none.type, none.body], [200, 'application/json', NOT_SET]);
    same('…and nothing was started: nobody outside is asked', runsOf().length, 0);
    check('…the sentence holds no address, path, file name or setting name', !/https?:|[\\/]|\.py\b|\.mjs\b|CROPHALO|\.secrets|_KEY/.test(none.body.reason), none.body.reason);
    same('…asked again: the same, still nothing started, never kept', [(await get(s.base, '/api/mnfield?lat=41.18&lon=-96.44&mode=now')).body, runsOf().length, fs.readdirSync(path.join(a, 'cache')).length], [NOT_SET, 0, 0]);
    for (const [q, why] of [['', /lat and lon are required/], ['?lat=41.18&lon=-96.44', /mode must be now, hay or cost/], ['?lat=41.18&lon=-96.44&mode=now&crops=Corn', /crops must be Crophalo crop ids/]]) {
      const r = await get(s.base, '/api/mnfield' + q); check(`the cash bids refuse at the door: ${q || '(nothing)'}`, r.status === 400 && why.test(r.body?.reason) && runsOf().length === 0, [r.status, r.body]);
    }
    const keys = await get(s.base, '/api/keys'); everything.push(keys.text);
    same('/api/keys on this computer: true or false only, never stored', [keys.status, keys.body, keys.cache], [200, { ok: true, nass: true, ams: false, openet: false, openetOn: false, metno: false, earthdata: false }, 'no-store']);
    const list = (await get(s.base, '/api/sources')).body; everything.push(JSON.stringify(list));
    same('the list of data services has the cash bids: a key is needed and not set', (r => [r?.name, r?.needs_key, r?.key_set, r?.ttl_hours])(rowOf(list, 'mnfield')), ['Local cash bids (USDA AMS Market News)', true, false, 6]);
    same('…and the US soil survey: no key, no login, it can be checked', (r => [r?.name, r?.needs_key, r?.needs_login, r?.can_check, r?.ttl_hours])(rowOf(list, 'soilfield')), ['USDA NRCS soil at the field (SSURGO, STATSGO2)', false, false, true, 720]);
    check('…a row of that list is words, times and true or false: no address and no key setting', !/https?:|CROPHALO_|\.secrets/.test(JSON.stringify([rowOf(list, 'mnfield'), rowOf(list, 'soilfield')])));

    // the soil survey needs no key
    const soil = await get(s.base, '/api/soilfield?lat=41.1804&lon=-96.4398'); everything.push(soil.text);
    same('the soil survey: 200, the lookup\'s answer, the place really read (snapped to 0.001 degrees), just fetched', [soil.status, soil.body.ok, soil.body.survey, soil.body.soils[0].name, soil.body.spot, soil.body.cached], [200, true, 'SSURGO', 'Tomek', { lat: 41.18, lon: -96.44 }, false]);
    same('the lookup got the snapped place and no key setting of the server', runsOf().at(-1), 'soilfield.py|41.180 -96.440|ams=0|dir=0|other=0');
    check('the answer is never kept by the browser (a field\'s place is in it)', /no-store/.test(soil.cache), soil.cache);
    const again = await get(s.base, '/api/soilfield?lat=41.1801&lon=-96.4402');
    same('another pin in the same square gets the kept answer and no new run', [again.body.cached, again.body.spot, runsOf().length], [true, { lat: 41.18, lon: -96.44 }, 1]);
    for (const q of ['', '?lat=abc&lon=1', '?lat=91&lon=0']) { const r = await get(s.base, '/api/soilfield' + q); check(`the soil survey refuses at the door: ${q || '(nothing)'}`, r.status === 400 && /lat and lon are required/.test(r.body?.reason) && runsOf().length === 1, [r.status, r.body]); }
    same('another website may not ask either lookup', [(await get(s.base, '/api/soilfield?lat=41.18&lon=-96.44', { headers: { origin: 'https://evil.example' } })).status, (await get(s.base, '/api/mnfield?lat=41.18&lon=-96.44&mode=now', { headers: { origin: 'https://evil.example' } })).status], [403, 403]);
    same('POST: 405, GET only', [(await get(s.base, '/api/soilfield?lat=41.18&lon=-96.44', { method: 'POST' })).status, (await get(s.base, '/api/mnfield?lat=41.18&lon=-96.44&mode=now', { method: 'POST' })).status], [405, 405]);

    // a key file put in the folder while the server runs counts at the next ask
    fs.mkdirSync(path.join(a, '.secrets'), { mode: 0o700 }); fs.writeFileSync(path.join(a, '.secrets', 'ams-marketnews.key'), KEY + '\n', { mode: 0o600 });
    const before = runsOf().length, withFile = await get(s.base, '/api/mnfield?lat=41.18&lon=-96.44&mode=now&crops=soy,corn,corn'); everything.push(withFile.text);
    same('with the key file in the folder: the lookup runs and its answer comes back', [withFile.status, withFile.body.ok, withFile.body.mode, withFile.body.cached, runsOf().length - before], [200, true, 'now', false, 1]);
    same('…it got the place snapped to 0.05 degrees and the crops sorted, each once; the key file is its own to read (no setting is handed over)', runsOf().at(-1), 'mnfield.py|41.20 -96.45 now corn,soy|ams=0|dir=0|other=0');
    same('…the list of data services now says the key is set', rowOf((await get(s.base, '/api/sources')).body, 'mnfield')?.key_set, true);
    check('…an answer that came back is kept for its row\'s time: the same field asked again starts nothing', (await get(s.base, '/api/mnfield?lat=41.19&lon=-96.46&mode=now&crops=corn,soy')).body.cached === true && runsOf().length - before === 1);
    const down = await get(s.base, '/api/mnfield?lat=10&lon=-96.44&mode=now'); everything.push(down.text);
    same('Market News not answering: 200 and the lookup\'s plain sentence, never an error page', [down.status, down.type, down.body.ok, down.body.reason], [200, 'application/json', false, 'USDA Market News did not answer just now; try again in a minute']);
    check('…a failure is not kept: asked again, the lookup runs again', (await get(s.base, '/api/mnfield?lat=10&lon=-96.44&mode=now')).body.cached === false && runsOf().filter(l => l.startsWith('mnfield.py|10.00')).length === 2);

    // the quick lane: a slow satellite lookup is running, the two field lookups still answer at once
    const slow = get(s.base, '/api/smaproot?lat=44.40&lon=-79.78'), t0 = Date.now();
    await new Promise(r => setTimeout(r, 400));
    const q1 = await get(s.base, '/api/soilfield?lat=40.5&lon=-95.5'), q2 = await get(s.base, '/api/mnfield?lat=40.5&lon=-95.5&mode=now'), took = Date.now() - t0;
    check('while a slow satellite lookup runs, the soil survey and the cash bids answer without waiting for it', q1.body?.ok === true && q2.body?.ok === true && took < 4000, { took, q1: q1.body, q2: q2.body });
    check('…and the slow lookup was really still running', (await slow).body?.ok === true && Date.now() - t0 >= 5000);
    check('the server printed no key', !s.out.includes(KEY), s.out);
  } finally { await stop(s); }

  // ---- the key in the host's settings (the way a hosted server holds it), on a public server
  const b = site('hosted'); fs.rmSync(RUNS, { force: true });
  s = await start(b, { HOST: '127.0.0.1', PUBLIC_SITE: '1', CROPHALO_AMS_KEY: KEY });
  try {
    const bids = await get(s.base, '/api/mnfield?lat=41.18&lon=-96.44&mode=now&crops=corn'); everything.push(bids.text);
    same('the key in the host\'s settings: the lookup runs', [bids.status, bids.body?.ok, bids.body?.mode], [200, true, 'now']);
    same('…the Market News key was handed to it by name, and no other key or word of the server', runsOf().at(-1), 'mnfield.py|41.20 -96.45 now corn|ams=1|dir=0|other=0');
    const soil = await get(s.base, '/api/soilfield?lat=41.18&lon=-96.44'); everything.push(soil.text);
    same('…the soil survey still gets no key at all', [soil.body?.ok, runsOf().at(-1)], [true, 'soilfield.py|41.180 -96.440|ams=0|dir=0|other=0']);
    const keys = await get(s.base, '/api/keys'); everything.push(keys.text);
    same('a public server keeps /api/keys shut: 404 in JSON, as for any address it does not have', [keys.status, keys.type, keys.body], [404, 'application/json', { ok: false, reason: 'Unknown endpoint' }]);
    const list = (await get(s.base, '/api/sources')).body; everything.push(JSON.stringify(list));
    same('…its pages read "set" or "not set" from the list of data services instead', [rowOf(list, 'mnfield')?.needs_key, rowOf(list, 'mnfield')?.key_set], [true, true]);
    check('the server printed no key', !s.out.includes(KEY), s.out);
  } finally { await stop(s); }

  // ---- a public server without the key: plain words, never an error page, even with no Python at all
  const c = site('public'); fs.rmSync(RUNS, { force: true });
  s = await start(c, { PUBLIC_SITE: '1', FW_PYTHON: path.join(TMP, 'no-python') });
  try {
    const none = await get(s.base, '/api/mnfield?lat=41.18&lon=-96.44&mode=now&crops=corn'); everything.push(none.text);
    same('a public server without the key: the same plain answer, 200', [none.status, none.type, none.body], [200, 'application/json', NOT_SET]);
    same('…the list of data services says the key is not set', rowOf((await get(s.base, '/api/sources')).body, 'mnfield')?.key_set, false);
    same('nothing was started', runsOf().length, 0);
  } finally { await stop(s); }

  // ---- a copy of the server without the two small helper files still starts: it has no cash bids and no /api/keys, and everything else answers
  const d = site('bare'); fs.rmSync(path.join(d, 'scripts', 'keys.mjs')); fs.rmSync(path.join(d, 'scripts', 'mnargs.mjs')); fs.rmSync(RUNS, { force: true });
  s = await start(d, { CROPHALO_AMS_KEY: KEY });
  try {
    same('a copy without scripts/keys.mjs and scripts/mnargs.mjs: it starts, health answers, the soil survey answers', [(await get(s.base, '/api/health')).body?.ok, (await get(s.base, '/api/soilfield?lat=41.18&lon=-96.44')).body?.ok], [true, true]);
    same('…it has no cash bids and no /api/keys (404 in JSON), and the cash bids lookup is never started unchecked', [(await get(s.base, '/api/mnfield?lat=41.18&lon=-96.44&mode=now')).status, (await get(s.base, '/api/keys')).status, runsOf().filter(l => l.startsWith('mnfield')).length], [404, 404, 0]);
    same('…its list of data services has no cash bids row', rowOf((await get(s.base, '/api/sources')).body, 'mnfield') ?? null, null);
  } finally { await stop(s); }

  check('no answer of any of these servers holds the key, or any other word of the server\'s settings', !everything.some(t => t.includes(KEY) || t.includes(OTHER) || t.includes(Buffer.from(KEY + ':').toString('base64'))));
} catch (e) {
  check('the suite ran to its end', false, String(e?.stack ?? e));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`field routes: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
