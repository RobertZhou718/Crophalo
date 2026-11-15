// Crophalo's check-up. `--doctor` (run at every start) prints ok / FIX / note lines in plain words and always exits 0;
// the plain mode (before going live) runs the go-live checks and exits 1 when something needs fixing.
// Pure: NEEDED, pageModules(), missingFiles(), packedTools(), savedCopy(), importList(), line(). The rest reads the folder and the network.
// Checked by scripts/test_portable.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The ONE list of files Crophalo cannot run without; both modes read only this. Add a line when a must-have file
// arrives (the offline worker, the going-live files) and take it out when the file goes. The page's own modules are not listed:
// pageModules() reads them from index.html and its imports. The map and 3D libraries are not listed here either: scripts/vendor.mjs knows its own files and is asked.
export const NEEDED = ['index.html', 'css/app.css', 'scripts/serve.mjs', 'scripts/earthdata.mjs', 'scripts/hostmode.mjs', 'scripts/status.mjs', 'scripts/vendor.mjs',
  'scripts/run.sh', 'scripts/portable.sh', 'scripts/requirements.txt', 'Start Crophalo.command'];

const LOGIN_SERVICE = 'NASA Earthdata login service';
const SERVICES = [   // one small request each; the point is a public sample place (Konya), never a farmer's field
  ['NASA POWER', 'https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M&community=AG&latitude=37.87&longitude=32.48&start=20240101&end=20240101&format=JSON'],
  ['FAOSTAT files', 'https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data.zip', 'HEAD'],
  ['Open-Meteo', 'https://api.open-meteo.com/v1/forecast?latitude=37.87&longitude=32.48&daily=temperature_2m_max&forecast_days=1'],
  [LOGIN_SERVICE, 'https://urs.earthdata.nasa.gov/'],
  ['NASA satellite catalogue (CMR)', 'https://cmr.earthdata.nasa.gov/search/collections.json?page_size=1'],
];
const ARCHES = ['arm64', 'x86_64'], UV_NAME = { arm64: 'aarch64', x86_64: 'x86_64' };
const SIGN_UP = 'https://urs.earthdata.nasa.gov/users/new';
const VENV_PYTHON = process.platform === 'win32' ? ['.venv', 'Scripts', 'python.exe'] : ['.venv', 'bin', 'python'];   // where Python puts itself on each system
// Asks NASA once whether the login works. It prints one word and nothing else: yes, no, or unasked (NASA could not be asked).
const LOGIN_CHECK = `import sys, earthaccess
try:
    a = earthaccess.login(strategy=sys.argv[1])
    print("LOGIN", "yes" if getattr(a, "authenticated", False) else "no")
except Exception:
    print("LOGIN", "unasked")`;

// ---- pure parts
// The modules the page needs to start, read from the page itself: the module scripts of index.html and every static import they reach,
// to any depth (a later import() is not needed to start). A missing module is named too; what it would import cannot be known.
const STATIC_IMPORT = /(?:^|[;}\n])[ \t]*(?:import|export)[ \t]*(?:[\w$*{}\s,]*?[ \t\n]from[ \t]*)?['"]([^'"\n]+)['"]/g;
const withoutComments = code => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
export function pageModules(root) {
  let page = '';
  try { page = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); } catch { return []; }
  const queue = [], seen = new Set();
  const add = (spec, from) => {
    if (!/^\.{0,2}\//.test(spec) && !/^[\w-]+\//.test(spec)) return;   // a library by its bare name or another site's address: not a file of this folder
    if (/^[a-z]+:/i.test(spec)) return;
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec.split(/[?#]/)[0])).replace(/^\.\//, '');
    if (!rel.startsWith('..') && !seen.has(rel)) { seen.add(rel); queue.push(rel); }
  };
  for (const m of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\btype\s*=\s*["']?module\b/i.test(m[1])) continue;
    const src = m[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (src) add(src, 'index.html');
    else for (const i of withoutComments(m[2]).matchAll(STATIC_IMPORT)) add(i[1], 'index.html');
  }
  for (let n = 0; n < queue.length; n++) {
    let code;
    try { code = fs.readFileSync(path.join(root, queue[n]), 'utf8'); } catch { continue; }   // missing: named by missingFiles
    for (const i of withoutComments(code).matchAll(STATIC_IMPORT)) add(i[1], queue[n]);
  }
  return queue;
}
export const missingFiles = (root, list = [...NEEDED, ...pageModules(root)]) => list.filter(f => !fs.existsSync(path.join(root, f)));

export function packedTools(root) {   // which kinds of Mac have every tool inside the folder
  const rt = path.join(root, 'runtime'), has = (...p) => fs.existsSync(path.join(rt, ...p));
  let pythons = []; try { pythons = fs.readdirSync(path.join(rt, 'python')); } catch { /* none yet */ }
  const whole = a => has(`node-${a}`, 'bin', 'node') && ['uv', 'LICENSE-MIT', 'LICENSE-APACHE'].every(f => has(`uv-${a}`, f)) && has('wheels', a, '.complete') &&
    pythons.some(d => new RegExp(`^cpython-3\\.12\\.\\d+-macos-${UV_NAME[a]}-none$`).test(d) && has('python', d, 'bin', 'python3.12'));   // the real folder, not uv's link to it
  const some = a => has(`node-${a}`) || has(`uv-${a}`) || has('wheels', a);
  return { whole: ARCHES.filter(whole), any: ARCHES.some(some) || pythons.length > 0 };
}

export function savedCopy(dir) {   // the newest readable copy of the saved fields, as the server would pick it
  let seen = false;
  for (const name of ['backup.json', 'backup-1.json', 'backup-2.json']) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    seen = true;
    try { const saved = Date.parse(JSON.parse(fs.readFileSync(file, 'utf8')).saved); return { found: true, when: Number.isFinite(saved) ? new Date(saved) : fs.statSync(file).mtime }; }
    catch { /* a damaged copy: try the one before it */ }
  }
  return { found: false, damaged: seen };
}

export function importList(root) {   // the six library names live in portable.sh; they are read, never copied
  try { const m = fs.readFileSync(path.join(root, 'scripts', 'portable.sh'), 'utf8').match(/^PY_IMPORTS='([A-Za-z0-9_, ]+)'/m); return m ? m[1] : null; }
  catch { return null; }
}

export function line(kind, text, fix, colour = false) {   // kind: ok | fix | note
  const label = { ok: 'ok', fix: 'FIX', note: 'note' }[kind], tint = { ok: 32, fix: 31, note: 33 }[kind];
  return `  ${colour ? `\x1b[${tint}m${label}\x1b[0m` : label}${' '.repeat(6 - label.length)}${text}${fix ? `\n        -> ${fix}` : ''}`;
}

// ---- parts that look outside
const run = (cmd, args, { env = process.env, ms = 60e3 } = {}) => new Promise(done =>
  execFile(cmd, args, { env, timeout: ms, killSignal: 'SIGKILL', maxBuffer: 1e6 }, (err, out) => done({ ok: !err, timedOut: !!(err && err.killed), out: String(out ?? '') })));

async function reach([name, url, method = 'GET'], ms) {
  try {
    const res = await fetch(url, { method, signal: AbortSignal.timeout(ms) });
    res.body?.cancel().catch(() => {});
    return res.status < 500 ? { name } : { name, theirs: true, why: `it answered with an error (${res.status})` };   // any answer below 500 means the service is there
  } catch (e) { return { name, why: e.name === 'TimeoutError' ? `no answer in ${Math.round(ms / 1000)} s` : 'no connection' }; }
}

const load = async file => { try { return await import(new URL(file, import.meta.url).href); } catch { return null; } };
const gb = bytes => (bytes / 1e9).toFixed(1);
const q = p => `"${p}"`;   // the folder's path may hold spaces

// ---- the check-up itself
export async function checkUp({ doctor = false, root = ROOT, env = process.env, out = console.log } = {}) {
  const colour = !!process.stdout.isTTY && !env.NO_COLOR, here = process.platform === 'darwin' ? 'this Mac' : 'this computer';
  const startCmd = `sh ${q(path.join(root, 'scripts', 'run.sh'))}`, netMs = doctor ? 10e3 : 60e3;
  let fixes = 0;
  const say = (kind, text, fix) => { if (kind === 'fix') fixes++; out(line(kind, text, fix, colour)); };
  const standIn = env.FW_CHECK_UPSTREAM;   // the test suite points the five questions at its own stand-in, so it needs no internet
  const reached = Promise.all(SERVICES.map(([name, url, method], i) => reach([name, standIn ? `${standIn}/${i}` : url, method], netMs)));   // asked now, printed in their place

  const major = +process.versions.node.split('.')[0], inFolder = process.execPath.startsWith(path.join(root, 'runtime') + path.sep);
  const where = inFolder ? `inside this folder (${path.relative(root, path.dirname(path.dirname(process.execPath)))})` : `installed on ${here} (${process.execPath})`;
  if (major >= 20) say('ok', `Node ${process.versions.node}, ${where}`);
  else say('fix', `Node ${process.versions.node} is too old: Crophalo needs Node 20 or newer`, 'double-click Start Crophalo.command: it brings its own Node');

  const missing = missingFiles(root);
  if (missing.length) say('fix', `Missing from this folder: ${missing.join(', ')}`, 'copy the whole Crophalo folder again; the hidden parts must come along');

  const vendor = await load('./vendor.mjs');
  if (vendor?.LIBS && vendor.inspect) {
    const absent = vendor.LIBS.filter(l => l.dir.startsWith('vendor/') && !vendor.inspect(l, root).ok).map(l => l.label);
    if (absent.length) say('fix', `The map and 3D libraries are not whole in this folder yet: ${absent.join(', ')}`, `run once with the internet on: ${inFolder ? q(process.execPath) : 'node'} ${q(path.join(root, 'scripts', 'vendor.mjs'))}`);
  }

  if (doctor) {
    try { const probe = path.join(root, `.write-test-${process.pid}`); fs.writeFileSync(probe, ''); fs.unlinkSync(probe); say('ok', 'This folder can be written to'); }
    catch { say('fix', 'This folder cannot be written to', `copy the whole Crophalo folder onto ${here} (for example into Documents)`); }

    try {
      const s = fs.statfsSync(root), free = s.bavail * s.bsize;
      if (free > 2e9) say('ok', `${gb(free)} GB free on this disk`);
      else say('fix', `Only ${gb(free)} GB free on this disk`, 'make room: Crophalo needs about 2 GB free');
    } catch { say('note', 'The free space on this disk could not be read'); }

    const cache = path.resolve(env.FW_CACHE || path.join(root, '.cache'));
    if (cache === path.join(root, '.cache')) say('ok', 'Saved NASA data: inside this folder (.cache), so it moves with it');
    else say('note', `Saved NASA data: kept in ${cache} (FW_CACHE), so it does not move with this folder`);

    const copy = savedCopy(env.FW_USERDATA_DIR || path.join(root, '.userdata'));
    if (copy.found) say('ok', `A copy of your saved fields is kept in this folder (.userdata), last saved ${copy.when.toLocaleString('en-US')}`);
    else if (copy.damaged) say('fix', 'The copy of your saved fields in this folder (.userdata) cannot be read', 'open Crophalo in the browser that has your fields: it writes a fresh copy');
    else say('note', 'No copy of saved fields in this folder yet: Crophalo makes one when you save a field');

    const packed = packedTools(root), pack = `to carry them for both kinds of Mac, run once with the internet on: sh ${q(path.join(root, 'scripts', 'pack-runtimes.sh'))}`;
    if (packed.whole.length === 2) say('ok', 'Tools inside this folder: packed for both kinds of Mac, so a new Mac needs no internet');
    else say('note', `Tools inside this folder: ${packed.whole.length ? `only for ${packed.whole[0] === 'arm64' ? 'Apple-chip' : 'Intel'} Macs` : packed.any ? 'some, not all' : 'none yet'}`, pack);
  }

  const py = env.FW_PYTHON || path.join(root, ...VENV_PYTHON), libs = importList(root);
  let pythonOk = false, certifi = '';
  if (!libs) say('fix', 'The list of NASA data tools could not be read (scripts/portable.sh)', 'copy the whole Crophalo folder again');
  else if (!fs.existsSync(py)) say('fix', 'Python and the NASA data tools are not set up in this folder yet', `double-click Start Crophalo.command, or run: ${startCmd} (it sets them up, about 160 MB of downloads once)`);
  else {
    const r = await run(py, ['-c', `import ${libs}; import platform, certifi; print("PYTHON", platform.python_version()); print("CERTS", certifi.where())`]);
    const version = r.out.match(/PYTHON (\S+)/)?.[1];
    pythonOk = r.ok && !!version;
    certifi = r.out.match(/^CERTS (.+?)\s*$/m)?.[1] ?? '';
    if (certifi && !fs.existsSync(certifi)) certifi = '';
    if (pythonOk) say('ok', `Python ${version} and the NASA data tools load`);
    else say('fix', 'Python is here, but the NASA data tools do not load', `start Crophalo again: ${startCmd} (it rebuilds them; details in runtime/setup.log)`);
  }

  const earthdata = await load('./earthdata.mjs'), login = earthdata?.findLogin ? earthdata.findLogin(root) : null;
  const loginCmd = doctor ? `add it: ${startCmd} --login (free sign-up: ${SIGN_UP})`
    : `on this computer: ${startCmd} --login; on the host: check EARTHDATA_USERNAME and EARTHDATA_PASSWORD in the server settings`;
  if (!login) say('fix', 'The NASA login could not be looked for (scripts/earthdata.mjs is missing)', 'copy the whole Crophalo folder again');
  else if (!login.where && doctor && fs.existsSync(path.join(root, 'runtime', 'earthdata-skipped'))) say('note', 'No NASA Earthdata login (you chose to skip it): the five satellite parts stay empty', loginCmd);
  else if (!login.where) say('fix', 'No NASA Earthdata login yet: the five satellite parts (SMAP, GRACE-FO, ECOSTRESS, HLS, GEDI) stay empty', loginCmd);
  else if (!pythonOk) say('note', `A NASA Earthdata login is kept ${login.words}; it is tried once the NASA data tools are set up`);
  else {   // the login reaches this one Python process only, and nothing that process prints is shown
    // HTTPS trust roots: the owner's SSL_CERT_FILE when set, else the certifi bundle installed with the libraries; the check itself is never switched off
    const roots = env.SSL_CERT_FILE || certifi;
    const r = await run(py, ['-c', LOGIN_CHECK, login.where === 'home' ? 'netrc' : 'environment'], { env: { ...env, ...login.env, ...(roots ? { SSL_CERT_FILE: roots } : {}), PYTHONWARNINGS: 'ignore' } });
    const serviceUp = !(await reached).find(s => s.name === LOGIN_SERVICE)?.why;   // "no" counts only when NASA's login service itself answered
    if (/LOGIN yes/.test(r.out)) say('ok', `NASA Earthdata login works (kept ${login.words})`);
    else if (/LOGIN no/.test(r.out) && serviceUp) say('fix', `NASA Earthdata did not accept the login kept ${login.words}`, doctor ? `type it again: ${startCmd} --login` : loginCmd);
    else say('note', `The NASA login (kept ${login.words}) could not be tried just now: ${r.timedOut ? 'NASA did not answer within a minute' : 'NASA\'s login service could not be asked'}`);
  }

  for (const r of await reached) {
    if (!r.why) say('ok', `${r.name} reachable`);
    else say('fix', `${r.name} not reachable: ${r.why}`, `${r.theirs ? 'the trouble is on their side: try again later' : 'check the internet connection'}; until then Crophalo says which parts it could not read`);
  }

  const things = `${fixes} thing${fixes === 1 ? '' : 's'} to fix`;
  if (doctor) out(fixes ? `  ${things}: see the FIX lines above. Crophalo still opens.` : '  Everything needed is in place.');
  else out(fixes ? `  ${things} before going live.` : '  Ready to go live. See DEPLOY.md.');
  return fixes;
}

let direct = false;
try { direct = fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { /* imported by a test */ }
if (direct) {
  const doctor = process.argv.includes('--doctor');
  try { process.exitCode = (await checkUp({ doctor })) && !doctor ? 1 : 0; }
  catch (e) { console.log(line('note', `The check-up stopped early (${e.message})`)); process.exitCode = doctor ? 0 : 1; }   // the doctor never blocks the start
}
