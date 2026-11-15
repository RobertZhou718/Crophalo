// Crophalo's suite for the slow lookups' kept answers (scripts/serve.mjs): an answer past its keep time is still served at once and made new behind it, and the two demo fields' recorded answers (scripts/recorded/)
// are served at once, said as "Recorded on <date>", before anything is kept. A stand-in Python answers after one second; a copy of the server runs in a temporary folder. Nothing outside it is touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };
const wait = ms => new Promise(done => setTimeout(done, ms));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-cache-')), SITE = path.join(TMP, 'site'), CACHE = path.join(TMP, 'cache');
fs.mkdirSync(path.join(SITE, 'scripts', 'live'), { recursive: true }); fs.mkdirSync(path.join(SITE, 'scripts', 'recorded'), { recursive: true }); fs.mkdirSync(CACHE, { recursive: true });
for (const f of fs.readdirSync(HERE)) if (/\.(mjs|sh)$/.test(f) && !/^(test_|e2e_|live_check)/.test(f)) fs.copyFileSync(path.join(HERE, f), path.join(SITE, 'scripts', f));
fs.writeFileSync(path.join(SITE, 'index.html'), '<!doctype html><title>test</title>'); fs.writeFileSync(path.join(SITE, 'scripts', 'live', 'dem.py'), '# stand-in\n');
const PY = path.join(TMP, 'python');
fs.writeFileSync(PY, ['#!/bin/sh', 'case "$2" in', '  *crophalo_python*) echo CROPHALO_PY; echo \'{"crophalo_python": "3.12.99", "certifi": ""}\' ;;', '  *earthaccess.login*) echo "LOGIN yes" ;;', '  *) sleep 1; echo \'{"ok":true,"source":"stand-in","data_date":"FRESH"}\' ;;', 'esac', ''].join('\n')); fs.chmodSync(PY, 0o755);

const child = spawn(process.execPath, [path.join(SITE, 'scripts', 'serve.mjs')], { env: { PATH: process.env.PATH, HOME: TMP, FW_CACHE: CACHE, FW_PYTHON: PY, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((done, fail) => { let out = ''; child.stdout.on('data', d => { out += d; const m = /Crophalo on http:\/\/\S+:(\d+)/.exec(out); if (m) done(+m[1]); }); setTimeout(() => fail(new Error('the test server did not start')), 15000).unref(); });
const get = p => new Promise((done, fail) => http.get({ host: '127.0.0.1', port, path: p }, res => { let b = ''; res.on('data', d => { b += d; }); res.on('end', () => { try { done(JSON.parse(b)); } catch { done(null); } }); }).on('error', fail));
const URL_ = '/api/dem?lat=41.1795&lon=-96.4398&w=1120&d=1087&nx=129&ny=129';
const keptFiles = () => fs.readdirSync(path.join(CACHE, 'api')).filter(f => /^dem_/.test(f));
try {
  await wait(1500);
  const t0 = Date.now(), first = await get(URL_);
  check('nothing kept and nothing recorded: the first ask waits for the live lookup and gets its answer', first?.ok === true && first.data_date === 'FRESH' && first.cached === false && Date.now() - t0 >= 900, first);
  const [name] = keptFiles(); check('and the answer is kept on disk', !!name, keptFiles());
  const file = path.join(CACHE, 'api', name), kept = JSON.parse(fs.readFileSync(file, 'utf8'));
  // past its keep time: served at once, made new behind
  kept.answer.data_date = 'OLD'; kept.stored = Date.now() - 40 * 864e5; kept.until = Date.now() - 10 * 864e5; fs.writeFileSync(file, JSON.stringify(kept));
  const t1 = Date.now(), stale = await get(URL_);
  check('an answer past its keep time is served at once (under half a second), with its own date', stale?.ok === true && stale.data_date === 'OLD' && stale.cached === true && Date.now() - t1 < 500, [stale, Date.now() - t1]);
  check('and it says since when it was kept', typeof stale?.kept_since === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(stale.kept_since));
  await wait(2500);
  const renewed = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('behind it the answer was made new: the kept file now holds the fresh answer', renewed.answer.data_date === 'FRESH' && renewed.until > Date.now(), renewed.answer);
  check('the next ask gets the fresh answer, at once', (await get(URL_))?.data_date === 'FRESH');
  // a recorded answer, before anything is kept, only for the very same lookup and arguments
  fs.rmSync(file);
  const rec = { recorded_on: '2026-11-15', answer: { ok: true, source: 'recorded real answer', licence: 'a licence', data_date: 'RECORDED' } };
  fs.writeFileSync(path.join(SITE, 'scripts', 'recorded', name), JSON.stringify(rec));
  const t2 = Date.now(), r = await get(URL_);
  check('a recorded answer is served at once and says "Recorded on 2026-11-15"', r?.ok === true && r.recorded === true && r.recorded_on === '2026-11-15' && /^Recorded on 2026-11-15/.test(r.note) && r.data_date === 'RECORDED' && Date.now() - t2 < 500, [r, Date.now() - t2]);
  check('it keeps the source and licence of the recording', r?.source === 'recorded real answer' && r.licence === 'a licence');
  await wait(2500);
  check('behind it the live lookup ran and its answer is kept for the next ask', (await get(URL_))?.data_date === 'FRESH');
  fs.rmSync(file, { force: true });
  const other = await get(URL_.replace('lat=41.1795', 'lat=39.0310'));
  check('another place never gets the recording: it waits for its own live answer', other?.data_date === 'FRESH' && !other.recorded, other);
  // the pre-warm: one request at a time, each lookup of each demo, a table at the end; it stops at the first busy answer
  const { spawnSync } = await import('node:child_process');
  const bare = spawnSync(process.execPath, [path.join(HERE, 'prewarm.mjs')], { encoding: 'utf8' });
  check('the pre-warm asks for the data server\'s address and does nothing without it', bare.status === 2 && /use: node scripts\/prewarm\.mjs/.test(bare.stdout), bare.stdout);
  const calls = []; const stub = http.createServer((req, res) => { calls.push(req.url); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(calls.length === 3 ? { ok: false, reason: 'The data server is busy. Try again in a minute.' } : { ok: true, data_date: 'D', cached: true })); });
  await new Promise(done => stub.listen(0, '127.0.0.1', done));
  const run = await new Promise(done => { const c = spawn(process.execPath, [path.join(HERE, 'prewarm.mjs'), `http://127.0.0.1:${stub.address().port}`], { env: { ...process.env, PREWARM_PAUSE_MS: '10' } }); let out = ''; c.stdout.on('data', d => { out += d; }); c.on('close', () => done({ stdout: out })); });
  stub.close();
  check('the pre-warm asked one lookup at a time, stopped at the first busy answer (the third), and printed a table', calls.length === 3 && /busy/.test(run.stdout) && /lookup\s+answer/.test(run.stdout), [calls.length, run.stdout]);
  check('and it only asks the demo fields\' own addresses', calls.every(u => /^\/api\/(crophist|dem|ecopass|hlsndvi|hlsbox|ndvihist)\?lat=(41\.1795|39\.03\d+)/.test(u)), calls);
} finally { child.kill('SIGKILL'); fs.rmSync(TMP, { recursive: true, force: true }); }
console.log(`cache: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
