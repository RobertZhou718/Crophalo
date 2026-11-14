// The helper every live-lookup suite imports (scripts/test_live_dem.mjs, scripts/test_live_smaproot.mjs, which exercise it at every run). Node built-ins only.
// It runs ONE Python lookup the way the server does (the folder's own Python, -u, working folder scripts/live, FW_CACHE in a
// temp folder, its own process group, a time limit) and hands back the parsed answer, the exit code, stderr, the seconds and
// the peak memory. The network is ALWAYS replaced unless a by-hand script says { live: true }:
/*
 * FW_NET_REPLAY=<folder>  common.py serves every request from the folder (two files per answer, named by netKey())
 * and refuses any address that is not in it, so a suite can never reach the internet.
 * RULE for every suite built on this: never loosen a test without a written farming reason in the test itself.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const LIVE_DIR = path.join(HERE, 'live');
export const FIXTURES = path.join(HERE, 'fixtures', 'live');
const WINDOWS = process.platform === 'win32';
// The folder's own Python, never the system one. FW_PYTHON (absolute, or from the folder's root) wins, as it does for the server.
export const PYTHON = path.resolve(ROOT, process.env.FW_PYTHON || (WINDOWS ? path.join('.venv', 'Scripts', 'python.exe') : path.join('.venv', 'bin', 'python')));
export const PRETEND_LOGIN = { EARTHDATA_USERNAME: 'user1', EARTHDATA_PASSWORD: 'pw1' };   // made-up words, never a real login
export const PRETEND_SECRETS = ['user1', 'pw1', Buffer.from('user1:pw1').toString('base64')];
export const URS_TOKEN = 'https://urs.earthdata.nasa.gov/api/users/find_or_create_token';
const KEY_HEADERS = ['cmr-search-after'];   // the same list as common.py: headers that make two requests to one address differ

// ---- the counting (one count for the whole suite; finish() prints the last line and sets the exit code)
let passed = 0, failed = 0;
const show = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
export function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${show(detail)})` : ''}`); } return !!ok; }
export const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${show(got)}, wanted ${show(want)}`);
export async function group(name, run) {   // a check that throws fails its group, never the whole run
  try { await run(); } catch (e) { check(`${name}: ran to its end`, false, e?.stack || String(e)); }
}
export function finish() {
  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

// ---- temp folders (under the system temp folder, removed when the suite ends)
const temps = [], running = new Set();
export function tempFolder(name = 'work') {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `crophalo-live-${name}-`)));
  temps.push(dir);
  return dir;
}
function stopTree(child, signal) {   // the lookup and whatever it started: its process group, or on Windows its process tree
  try {
    if (WINDOWS) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, signal);
  } catch { /* already gone */ }
}
process.on('exit', () => {
  for (const child of running) stopTree(child, 'SIGKILL');   // only what this suite started, by PID
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

// ---- recorded answers
// The name of one request, exactly as common.net_key() makes it: method, address, the body if any, the KEY_HEADERS.
export function netKey(method, url, body = null, headers = {}) {
  const sha = text => crypto.createHash('sha256').update(text).digest('hex');
  let text = Buffer.from(`${method.toUpperCase()}\n${url}`);
  if (body != null && Buffer.byteLength(body)) text = Buffer.concat([text, Buffer.from('\n' + sha(body))]);
  const low = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  for (const name of KEY_HEADERS) if (low[name]) text = Buffer.concat([text, Buffer.from(`\n${name}:${low[name]}`)]);
  return sha(text).slice(0, 24);
}
// A hand-made answer for one address. `body`: Buffer, string, or an object (sent as JSON); `file`: a file to use as the body.
// `replies`: a list served in turn, the last one repeating, each { status, headers, fail: 'hang' | '<why it broke>' }
// for the failures a real service shows (a test never needs the internet to see one).
export function addAnswer(folder, { method = 'GET', url, request = {}, status = 200, headers = {}, body, file, replies, note = 'hand-made test input' }) {
  const key = netKey(method, url, request.body, request.headers);
  const bytes = file ? fs.readFileSync(file) : Buffer.isBuffer(body) ? body : typeof body === 'string' ? Buffer.from(body) : body != null ? Buffer.from(JSON.stringify(body)) : null;
  fs.mkdirSync(folder, { recursive: true });
  if (bytes) fs.writeFileSync(path.join(folder, key + '.body'), bytes);
  const meta = { method, url, hand_made: true, note, replies: replies || [{ status, headers }] };
  fs.writeFileSync(path.join(folder, key + '.json'), JSON.stringify(meta, null, 1) + '\n');
  return key;
}
// Every recorded request of a folder: [{ key, method, url, replies, file, bodyFile }].
export function answersIn(folder) {
  return fs.readdirSync(folder).filter(n => /^[0-9a-f]{24}\.json$/.test(n)).sort().map(n => {
    const meta = JSON.parse(fs.readFileSync(path.join(folder, n), 'utf8'));
    return { key: n.slice(0, 24), ...meta, file: path.join(folder, n), bodyFile: path.join(folder, n.slice(0, 24) + '.body') };
  });
}
// A throwaway copy of a recorded folder (a name under scripts/fixtures/live, or a path), to break on purpose.
export function copyOf(fixture, name = 'answers') {
  const from = path.isAbsolute(fixture) ? fixture : path.join(FIXTURES, fixture), to = path.join(tempFolder(name), 'answers');
  fs.cpSync(from, to, { recursive: true });
  return to;
}
// Change what a copy says for the addresses that match: change(meta) edits the recorded { method, url, replies } in place.
export function alter(folder, matches, change) {
  let n = 0;
  for (const a of answersIn(folder)) {
    if (!matches(a)) continue;
    const { key, file, bodyFile, ...meta } = a;
    change(meta, bodyFile);
    fs.writeFileSync(file, JSON.stringify(meta, null, 1) + '\n');
    n++;
  }
  return n;
}

// ---- running a lookup
// runLookup('soilgrids', ['44.4', '-79.78'], { replay: 'soilgrids-barrie' }) → { answer, stdout, stderr, code, signal, seconds,
//   peakMB, asked, timedOut, misses }. Options:
//   replay   a folder of recorded answers (a name under scripts/fixtures/live, or a path). Left out: an EMPTY folder, so every
//            address is refused. The network is replaced either way.
//   live     true ONLY in a by-hand script: the real network. record: a folder to record the real answers into (with live).
//   login    true: the pretend login user1 / pw1 is in the lookup's environment (as the server would hand over a real one).
//   limitS   the server's time limit for this lookup (default 150): passed to the lookup as FW_LIMIT_S, and at limitS the
//            lookup's whole process group is stopped (SIGTERM, 3 s later SIGKILL), as the server does.
//   now      pins the lookup's clock (FW_NOW, e.g. '2026-11-14T12:00:00Z') so "the last 12 months" asks the recorded addresses.
//   script   a Python file to run instead of scripts/live/<id>.py (hand-made test lookups); env: extra variables.
const emptyReplay = () => (emptyReplay.dir ||= tempFolder('no-answers'));
export function runLookup(id, args = [], { replay, live = false, record, login = false, limitS = 150, now, script, env = {}, cache, home } = {}) {
  if (!fs.existsSync(PYTHON)) throw new Error(`The folder's Python was not found at ${PYTHON} (set FW_PYTHON)`);
  const folder = replay ? (path.isAbsolute(replay) ? replay : path.join(FIXTURES, replay)) : emptyReplay();
  if (replay && !fs.existsSync(folder)) throw new Error(`No recorded answers at ${folder}`);
  const work = tempFolder(id);
  const keep = name => (process.env[name] ? { [name]: process.env[name] } : {});
  const childEnv = {
    PATH: process.env.PATH, ...keep('SystemRoot'), ...keep('TEMP'), ...keep('TMP'), ...keep('TMPDIR'),   // a clean environment: nothing of the owner's reaches a lookup
    HOME: home || path.join(work, 'home'), USERPROFILE: home || path.join(work, 'home'),   // never the real home folder: no real login can be found
    FW_CACHE: cache || path.join(work, 'cache'), PYTHONWARNINGS: 'ignore', PYTHONDONTWRITEBYTECODE: '1',
    ...(WINDOWS ? { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } : {}),
    ...(script ? { PYTHONPATH: LIVE_DIR } : {}),
    ...(live ? (record ? { FW_NET_RECORD: record } : {}) : { FW_NET_REPLAY: folder }),
    ...(now && !live ? { FW_NOW: now } : {}),
    FW_LIMIT_S: String(limitS),
    ...(login ? PRETEND_LOGIN : {}),
    ...env,
  };
  fs.mkdirSync(childEnv.HOME, { recursive: true });
  return new Promise(done => {
    const started = process.hrtime.bigint();
    const child = spawn(PYTHON, ['-u', script || `${id}.py`, ...args.map(String)], { cwd: LIVE_DIR, env: childEnv, detached: !WINDOWS, stdio: ['ignore', 'pipe', 'pipe'] });
    running.add(child);
    const out = [], err = [];
    let timedOut = false, hard;
    child.stdout.on('data', d => out.push(d));
    child.stderr.on('data', d => err.push(d));
    const soft = setTimeout(() => { timedOut = true; stopTree(child, 'SIGTERM'); hard = setTimeout(() => stopTree(child, 'SIGKILL'), 3000); }, limitS * 1000);
    const end = (code, signal, startError) => {
      clearTimeout(soft); clearTimeout(hard); running.delete(child);
      const stdout = Buffer.concat(out).toString('utf8'), stderr = Buffer.concat(err).toString('utf8');
      let answer = null;
      try { answer = JSON.parse(stdout); } catch { /* the contract check says so */ }
      const peak = [...stderr.matchAll(/peak_mb=([\d.]+) child_peak_mb=([\d.]+) seconds=([\d.]+) asked=(\d+)/g)].pop();   // the lookup's last line: what the system counted
      done({
        id, args, answer, stdout, stderr, stderrTail: stderr.slice(-4000), code, signal, startError: startError || null, timedOut,
        seconds: Number(process.hrtime.bigint() - started) / 1e9,
        peakMB: peak ? Math.round((Number(peak[1]) + Number(peak[2])) * 10) / 10 : null,   // the lookup itself plus its largest finished worker process
        asked: peak ? Number(peak[4]) : null,   // how many requests the lookup sent out (every try counts)
        misses: [...stderr.matchAll(/^NET-REPLAY-MISS (.*)$/gm)].map(m => m[1]),
        replayed: !live, login,
      });
    };
    child.on('error', e => end(null, null, e.message));
    child.on('close', (code, signal) => end(code, signal));
  });
}

// ---- the contract every lookup must keep, as checks. Returns true when every one of them passed.
//   maxMB: the memory limit (300). secrets: more words that may never show (a pretend token). allowMiss: the test is about a refused address.
export function contract(name, r, { maxMB = 300, secrets = [], allowMiss = false } = {}) {
  const ok = [];
  ok.push(check(`${name}: the lookup started and ended by itself, within its time limit`, !r.startError && !r.timedOut && !r.signal, r.startError || `signal ${r.signal}, timed out ${r.timedOut}`));
  ok.push(same(`${name}: exit code 0`, r.code, 0));
  const a = r.answer, isObject = a !== null && typeof a === 'object' && !Array.isArray(a);
  ok.push(check(`${name}: stdout is exactly one JSON object and nothing else`, isObject && r.stdout.startsWith('{') && r.stdout.endsWith('}'), r.stdout.slice(0, 300) || `(nothing on stdout) ${r.stderrTail.slice(-300)}`));
  ok.push(check(`${name}: no traceback on stdout`, !/Traceback \(most recent|File ".*", line \d+/.test(r.stdout)));
  if (isObject) {
    ok.push(check(`${name}: "ok" is true or false`, a.ok === true || a.ok === false, a.ok));
    if (a.ok === false) {
      ok.push(check(`${name}: a failure holds a reason and nothing else (but "final")`, Object.keys(a).every(k => ['ok', 'reason', 'final'].includes(k)), Object.keys(a)));
      ok.push(check(`${name}: the reason is one plain sentence a farmer can read`, typeof a.reason === 'string' && a.reason.trim().length >= 10 && a.reason.length <= 300 && !/https?:\/\/|Traceback|Errno|\n|<|>/.test(a.reason), a.reason));
      ok.push(check(`${name}: "final" is true or absent`, !('final' in a) || a.final === true, a.final));
    }
    if (a.ok === true) {
      ok.push(check(`${name}: a good answer names its source`, typeof a.source === 'string' && a.source.length >= 4, a.source));
      ok.push(check(`${name}: a good answer says the date its data is from`, typeof a.data_date === 'string' && /\d{4}/.test(a.data_date), a.data_date));
      ok.push(check(`${name}: a good answer says its units`, (typeof a.units === 'string' && a.units.length > 0) || (a.units && typeof a.units === 'object'), a.units));
      ok.push(check(`${name}: a good answer says when the source was asked`, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(a.checked || ''), a.checked));
      ok.push(check(`${name}: an answer made from recorded test inputs says so`, !r.replayed || a.replayed === true, a.replayed));
    }
  }
  const words = [...(r.login ? PRETEND_SECRETS : []), ...secrets], seen = words.filter(w => r.stdout.includes(w) || r.stderr.includes(w));
  ok.push(check(`${name}: no word of the login in the answer or the log`, !seen.length, `${seen.length} secret word(s) shown`));
  if (!allowMiss) ok.push(check(`${name}: every address asked was a recorded one`, !r.misses.length, r.misses));
  ok.push(check(`${name}: peak memory was measured and is under ${maxMB} MB`, r.peakMB !== null && r.peakMB < maxMB, `${r.peakMB} MB`));
  return ok.every(Boolean);
}
