// The suite for the Mac start: scripts/run.sh, portable.sh, pack-runtimes.sh, preflight.mjs and "Start Crophalo.command".
// Every check runs in throwaway copies under the system temp folder, in a path with a space and a "Ü", with an empty temp home and
// stand-ins (curl, uv, Python, open) wherever a real tool would download. No internet; this folder's runtime/, .venv and the real home are never touched.
// RULE: never loosen a check here to make it pass without a written farming reason beside the check itself. Fix the scripts, not the test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseNetrc } from './earthdata.mjs';
import { missingFiles, packedTools, savedCopy, importList, line } from './preflight.mjs';

// ---- the counting
let passed = 0, failed = 0;
const show = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${show(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${show(got)}, wanted ${show(want)}`);
async function group(name, run) {   // a check that throws fails its group, never the whole run: the servers must still be stopped
  try { await run(); } catch (e) { check(`${name}: ran to its end`, false, e?.stack || String(e)); }
}

// ---- small tools
const HERE = path.dirname(fileURLToPath(import.meta.url)), PROJECT = path.dirname(HERE);
const MAC = process.platform === 'darwin';   // the start is a Mac shell script; on another system only the parts written for Node are checked
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-test-portable-')));
const SYSTEM_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
const USER = 'user1', WORD = 'pw1 "q\\ü#\'$x';   // made-up test words, never a real login; the password holds the letters a netrc file must quote
const wait = ms => new Promise(done => setTimeout(done, ms));
const within = (promise, ms) => Promise.race([promise, wait(ms).then(() => undefined)]);
const text = file => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };
const rows = file => text(file).split('\n').filter(Boolean);
const exists = file => fs.existsSync(file);
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const sq = s => `'${String(s).replace(/'/g, `'\\''`)}'`;   // one word for sh, whatever letters it holds
const mode = file => fs.statSync(file).mode & 0o777;
function put(file, content = '', bits) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); if (bits) fs.chmodSync(file, bits); return file; }
const PORTABLE = text(path.join(HERE, 'portable.sh'));
const pin = name => PORTABLE.match(new RegExp(`^${name}=(\\S+)`, 'm'))?.[1] ?? '';
const NODE_VER = pin('NODE_VER'), UV_VER = pin('UV_VER');
const ARCH = MAC && spawnSync('/usr/sbin/sysctl', ['-n', 'hw.optional.arm64'], { encoding: 'utf8' }).stdout.trim() === '1' ? 'arm64' : 'x86_64';
const OTHER = ARCH === 'arm64' ? 'x86_64' : 'arm64', UVA = { arm64: 'aarch64', x86_64: 'x86_64' };
const PYVER = '3.12.99';   // what the stand-in Python says it is: a number no real Python has, so a check can tell a reading from a constant

// ---- stand-ins for the five services the doctor asks (a status per service), and free ports from 5500 up
const listen = (server, port, host) => new Promise((done, fail) => { server.once('error', fail); server.listen(port, host, () => done(server.address().port)); });
async function services() {
  const status = [200, 200, 200, 200, 200], server = http.createServer((req, res) => { res.writeHead(status[+req.url.slice(1)] ?? 200); res.end(); });
  return { status, server, url: `http://127.0.0.1:${await listen(server, 0, '127.0.0.1')}` };
}
const canBind = (port, host) => new Promise(done => { const s = net.createServer(); s.once('error', () => done(false)); s.listen(port, host, () => s.close(() => done(true))); });
let nextPort = 5500, portQueue = Promise.resolve();
function freePorts(n = 1) {   // n neighbours, free on both loopback addresses; one caller at a time, so two lanes never get the same port
  const mine = portQueue.then(async () => {
    for (; nextPort < 65000; nextPort++) {
      let ok = true;
      for (let i = 0; i < n && ok; i++) ok = await canBind(nextPort + i, '127.0.0.1') && await canBind(nextPort + i, '::1');
      if (ok) { const port = nextPort; nextPort += n + 2; return port; }
    }
    throw new Error('no free port from 5500 up');
  });
  portQueue = mine.catch(() => {});
  return mine;
}
const health = port => fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) }).then(r => r.json()).catch(() => null);
async function healthOnce(port, done, ms = 15000) {   // the server checks its Python once, just after it starts: its health, once that check is done (or the time is up)
  let h = null;
  for (const end = Date.now() + ms; Date.now() < end; await wait(100)) { h = await health(port); if (done(h)) break; }
  return h;
}

// ---- a throwaway Crophalo folder with its own home, stand-ins and notes of what they were asked
const COPIED = ['Start Crophalo.command', '.gitignore', 'index.html', 'css/app.css', 'scripts/run.sh', 'scripts/portable.sh', 'scripts/pack-runtimes.sh',
  'scripts/preflight.mjs', 'scripts/earthdata.mjs', 'scripts/hostmode.mjs', 'scripts/status.mjs', 'scripts/serve.mjs', 'scripts/vendor.mjs', 'scripts/requirements.txt'];
let UP = null, made = 0;
function standIns(state, web) {
  const python = ['#!/bin/sh', '# Stand-in for Python in the portable suite: it answers the few questions the start and the doctor ask.', `S=${sq(state)}`,
    'case "$1" in', '  -c) case "$2" in',
    '      *crophalo_python*) echo CROPHALO_PY; [ -e "$S/libs-missing" ] && exit 1; printf \'{"crophalo_python": "%s", "certifi": "%s"}\\n\' "$(cat "$S/pyver")" "$S/certs.pem" ;;',
    '      *earthaccess.login*) printf %s "${SSL_CERT_FILE:-}" > "$S/login-ssl"; echo "LOGIN $(cat "$S/login" 2>/dev/null || echo no)" ;;',
    '      *PYTHON*) [ -e "$S/libs-missing" ] && exit 1; echo "PYTHON $(cat "$S/pyver")"; echo "CERTS $S/certs.pem" ;;',
    '      *python_version*) cat "$S/pyver" ;;',
    '      *) [ -e "$S/libs-missing" ] && exit 1; exit 0 ;;',
    '    esac ;;',
    '  -m) [ -e "$S/pip-fails" ] && exit 1; echo "pip $3" >> "$S/pip.log"',
    '    while [ $# -gt 1 ]; do [ "$1" = -d ] && mkdir -p "$2" && : > "$2/stand-in.whl"; shift; done ;;', 'esac', ''].join('\n');
  const uv = ['#!/bin/sh', '# Stand-in for uv in the portable suite: it makes the folders the real one makes and notes how it was called.', `S=${sq(state)}`,
    'printf \'%s %s %s|cache=%s|python=%s|tmp=%s|noconfig=%s\\n\' "$1" "$2" "${3:-}" "${UV_CACHE_DIR:-}" "${UV_PYTHON_INSTALL_DIR:-}" "${TMPDIR:-}" "${UV_NO_CONFIG:-}" >> "$S/uv.log"',
    'case "$1 $2" in', '  "python install") for last; do :; done',
    '    kind=${last#cpython-*-macos-}; kind=${kind%-none}; dir="$UV_PYTHON_INSTALL_DIR/cpython-$(cat "$S/pyver")-macos-$kind-none"',
    '    mkdir -p "$dir/bin" && cp "$S/python" "$dir/bin/python3.12" && chmod 755 "$dir/bin/python3.12" &&',
    '      ln -sfn "$dir" "$UV_PYTHON_INSTALL_DIR/cpython-3.12-macos-$kind-none" ;;   # like the real uv: a link that holds the full path',
    '  "venv --python") [ -e "$S/venv-fails" ] && exit 1',
    '    mkdir -p "$4/bin" && cp "$S/python" "$4/bin/python" && chmod 755 "$4/bin/python" ;;',
    '  "pip install") [ -e "$S/install-fails" ] && exit 1; exit 0 ;;', '  *) exit 2 ;;', 'esac', ''].join('\n');
  const curl = ['#!/bin/sh', '# Stand-in for curl: a question to this computer goes to the real curl; a download is answered from the suite\'s own folder, never the internet.',
    `W=${sq(web)}`, 'for url; do :; done',
    'case $url in http://127.0.0.1:* | http://localhost:*) exec /usr/bin/curl "$@" ;; esac',
    'out=; prev=', 'for a; do [ "$prev" = -o ] && out=$a; prev=$a; done',
    'printf \'%s\\n\' "$url" >> "$W/asked.log"',
    '[ -n "$out" ] && [ -f "$W/files/${url##*/}" ] && cp "$W/files/${url##*/}" "$out" && exit 0', 'exit 22', ''].join('\n');
  const open = `#!/bin/sh\n# Stand-in for open: it only notes what the browser would have been given.\nprintf '%s\\n' "$*" >> ${sq(state)}/opened.log\n`;
  const swVers = `#!/bin/sh\n# Stand-in for sw_vers: another macOS version when the suite sets one, else the real answer.\n[ "$1" = -productVersion ] && [ -f ${sq(state)}/macos ] && { cat ${sq(state)}/macos; exit 0; }\nexec /usr/bin/sw_vers "$@"\n`;
  return { python, uv, curl, open, swVers };
}
function makeFolder({ tools = true, vendor = false } = {}) {
  const base = path.join(TMP, `Crop Ü folder ${++made}`), root = path.join(base, 'Crophalo');
  const c = { base, root, state: path.join(base, 'state'), web: path.join(base, 'web'), home: path.join(base, 'home'), bin: path.join(base, 'bin'), bare: path.join(base, 'bin-bare') };
  for (const rel of COPIED) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.copyFileSync(path.join(PROJECT, rel), path.join(root, rel)); }
  if (vendor) fs.cpSync(path.join(PROJECT, 'vendor'), path.join(root, 'vendor'), { recursive: true });
  for (const dir of [c.home, c.state, path.join(c.web, 'files')]) fs.mkdirSync(dir, { recursive: true });
  c.scripts = standIns(c.state, c.web);
  put(path.join(c.state, 'python'), c.scripts.python, 0o755); put(path.join(c.state, 'pyver'), PYVER + '\n'); put(path.join(c.state, 'certs.pem'), 'stand-in trust roots\n');
  fs.cpSync(path.join(PROJECT, 'js'), path.join(root, 'js'), { recursive: true });   // the modules the page needs to start: the doctor checks them
  for (const dir of [c.bin, c.bare]) { put(path.join(dir, 'curl'), c.scripts.curl, 0o755); put(path.join(dir, 'open'), c.scripts.open, 0o755); put(path.join(dir, 'sw_vers'), c.scripts.swVers, 0o755); }
  fs.symlinkSync(process.execPath, path.join(c.bin, 'node'));   // "the Mac's own Node"; bin-bare is a Mac without one
  c.env = { PATH: `${c.bin}:${SYSTEM_PATH}`, HOME: c.home, FW_CHECK_UPSTREAM: UP?.url ?? 'http://127.0.0.1:9', ...(process.env.TZ ? { TZ: process.env.TZ } : {}) };   // a clean environment: nothing of the owner's reaches a test start
  c.rt = path.join(root, 'runtime'); c.log = path.join(c.rt, 'setup.log'); c.stamp = path.join(root, '.venv', 'crophalo-venv.txt');
  if (tools && MAC) {   // as after pack-runtimes.sh: uv with its licences, a Python, the library files
    for (const [name, content] of [['uv', c.scripts.uv], ['uvx', '#!/bin/sh\n'], ['LICENSE-MIT', 'stand-in licence text\n'], ['LICENSE-APACHE', 'stand-in licence text\n']]) put(path.join(c.rt, `uv-${ARCH}`, name), content, 0o755);
    put(path.join(c.rt, 'python', `cpython-${PYVER}-macos-${UVA[ARCH]}-none`, 'bin', 'python3.12'), c.scripts.python, 0o755);
    put(path.join(c.rt, 'wheels', ARCH, '.complete'), sha(fs.readFileSync(path.join(root, 'scripts', 'requirements.txt'))) + '\n');
  }
  if (MAC) spawnSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', base]);   // a copy made by a program that marks its files would not be "nothing to free"
  return c;
}
const uvCalls = (c, what) => rows(path.join(c.state, 'uv.log')).filter(l => l.startsWith(what));
const flag = (c, name, on = true) => (on ? put(path.join(c.state, name), typeof on === 'string' ? on : '') : fs.rmSync(path.join(c.state, name), { force: true }));
const goodStamp = c => ['crophalo-venv 1', `arch=${ARCH}`, `python=${PYVER}`, `requirements=${sha(fs.readFileSync(path.join(c.root, 'scripts', 'requirements.txt')))}`, `folder=${c.root}`, ''].join('\n');

// ---- running the start: without a terminal, to its end, or inside a real terminal
const kids = new Set(), ports = new Set(), QUIET = ['--no-open', '--no-login'];
const RUNNING = /Crophalo is running: http:\/\/localhost:(\d+)\//;
function launch(cmd, args, c, { env = {}, cwd = TMP, input = false } = {}) {
  const child = spawn(cmd, args, { cwd, env: { ...c.env, ...env }, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  const s = { child, out: '', gone: false, code: null };
  kids.add(child);
  child.stdout.on('data', d => { s.out += d; }); child.stderr.on('data', d => { s.out += d; });
  child.stdin?.on('error', () => {});
  s.exit = new Promise(done => { const end = code => { s.gone = true; s.code = code; kids.delete(child); done(); }; child.on('exit', end); child.on('error', () => end(-1)); });
  s.closed = new Promise(done => child.on('close', done));
  return s;
}
async function until(s, re, from = 0, ms = 40000) {   // the first match after `from`, or null when the run ended or the time is up
  for (const end = Date.now() + ms; ;) {
    const m = re.exec(s.out.slice(from));
    if (m || s.gone || Date.now() > end) return m ?? re.exec(s.out.slice(from));
    await wait(40);
  }
}
const runSh = c => path.join(c.root, 'scripts', 'run.sh');
async function start(c, args = QUIET, opts, cmd = runSh(c)) {   // sh scripts/run.sh …, until it says it is running (port 0 when it never did)
  const s = launch('/bin/sh', [cmd, ...args.map(String)], c, opts), m = await until(s, RUNNING);
  s.port = m ? +m[1] : 0; if (s.port) ports.add(s.port);
  return s;
}
async function stop(s) { if (!s.gone) s.child.kill('SIGTERM'); await within(s.exit, 10000); await within(s.closed, 2000); }   // by its own process number, nothing else; then its last words are read
async function once(c, args, opts, cmd = runSh(c)) { const s = launch('/bin/sh', [cmd, ...args.map(String)], c, opts); await within(s.closed, 40000); if (!s.gone) await stop(s); return s; }
async function terminal(c, args, typed = [], during, last = RUNNING) {   // the same start inside a real terminal (script gives it one); typed = [[what to wait for, what to type], …]
  // cat stands between this suite and script: script wants a plain pipe or a terminal to read the typing from, and Node hands a child a socket
  const s = launch('/bin/sh', ['-c', 'cat | /usr/bin/script -q /dev/null /bin/sh "$@"', 'terminal', runSh(c), '--no-open', ...args.map(String)], c, { input: true });
  let from = 0;
  for (const [question, keys] of typed) {
    const m = await until(s, question, from);
    if (!m) { s.stuck = String(question); break; }
    from += m.index + m[0].length; s.child.stdin.write(keys);
  }
  const m = s.stuck ? null : await until(s, last, from);
  s.port = m && last === RUNNING ? +m[1] : 0; if (s.port) ports.add(s.port);
  s.ended = !!m;
  if (s.port && during) await during(s);
  s.child.stdin.end('\x03');   // Control-C, the way a farmer stops Crophalo
  if (!s.gone) await within(s.exit, 8000);
  await stop(s);
  return s;
}

// ---- 1 · what can be read without running anything
const SHELL = ['scripts/run.sh', 'scripts/portable.sh', 'scripts/pack-runtimes.sh', 'Start Crophalo.command'];
function reading() {
  for (const f of SHELL) if (MAC) { const r = spawnSync('/bin/sh', ['-n', path.join(PROJECT, f)], { encoding: 'utf8' }); check(`sh -n: ${f} has no syntax error`, r.status === 0, r.stderr); }
  const starter = text(path.join(PROJECT, 'Start Crophalo.command'));
  check('the starter is five lines: into its own folder, then the start script with every option passed on',
    starter.trim().split('\n').length === 5 && starter.includes('\ncd "$(dirname "$0")" || exit 1\n') && starter.includes('\nexec /bin/sh ./scripts/run.sh "$@"\n'), starter);
  if (MAC) check('the starter can be double-clicked (it may be run)', (mode(path.join(PROJECT, 'Start Crophalo.command')) & 0o100) !== 0);
  const ignored = text(path.join(PROJECT, '.gitignore')).split('\n').map(l => l.trim());
  same('.gitignore holds the five hidden folders', ['.cache/', 'runtime/', '.venv/', '.secrets/', '.userdata/'].filter(d => !ignored.includes(d)), []);

  const hashes = ['NODE_SHA_arm64', 'NODE_SHA_x86_64', 'UV_SHA_arm64', 'UV_SHA_x86_64', 'UV_LICENSE_SHA_MIT', 'UV_LICENSE_SHA_APACHE'].map(pin);
  check('pins: each of the six hashes is 64 small hex letters', hashes.every(h => /^[0-9a-f]{64}$/.test(h)), hashes);
  check('pins: no hash stands twice (none was pasted into the wrong line)', new Set(hashes).size === hashes.length, hashes);
  check('pins: Node and uv carry whole version numbers, and Node is not older than the server needs', /^\d+\.\d+\.\d+$/.test(NODE_VER) && /^\d+\.\d+\.\d+$/.test(UV_VER) && +NODE_VER.split('.')[0] >= +pin('NODE_MIN'), [NODE_VER, UV_VER]);
  check('pins: every download place is an https address', ['NODE_DIST', 'UV_DIST', 'UV_SOURCE'].every(n => pin(n).startsWith('https://')));

  const wanted = text(path.join(HERE, 'requirements.txt')).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const PINNED = /^([A-Za-z0-9][A-Za-z0-9._-]*)==([0-9][A-Za-z0-9.]*)( ; sys_platform == "win32")?$/;
  const names = wanted.map(l => (l.match(PINNED)?.[1] ?? l).toLowerCase().replace(/[-_.]+/g, '-'));
  check('requirements: every library is pinned to one exact version, so every computer gets the same set', wanted.length >= 6 && wanted.every(l => PINNED.test(l)), wanted.filter(l => !PINNED.test(l)));
  check('requirements: no library is listed twice', new Set(names).size === names.length);
  same('requirements: the first six are the six the start tries to load (PY_IMPORTS in portable.sh)', names.slice(0, 6), (importList(PROJECT) ?? '').split(', ').map(n => n.toLowerCase()));

  const mine = [...SHELL, 'scripts/preflight.mjs', 'MOVING.md'].map(f => text(path.join(PROJECT, f)));
  const oldPort = String(5100 + 73);   // the older Crophalo on this Mac keeps that address; a browser holds saved fields per address, so the two must never meet
  check('the port: none of these files names the older Crophalo\'s port, and with nothing remembered the start takes 5480', mine.every(t => !t.includes(oldPort)) && text(path.join(HERE, 'run.sh')).includes('is_port "$PORT" || PORT=5480'));
  const code = SHELL.map(f => text(path.join(PROJECT, f)).split('\n').filter(l => !l.trim().startsWith('#')).join('\n')).join('\n');
  check('the shell scripts use nothing a Mac lacks and stop no other program (timeout, pkill, killall, sed -i -e)', !/(^|[\s;(|&])(timeout|pkill|killall)\s|sed -i -e/m.test(code));

  // HTTPS: certificates are always checked. No file of the app, its server, its lookups or its starters may switch that off (this suite itself is left out: it names the words).
  const OFF = new RegExp(['verify' + '\\s*=\\s*False', 'CERT_' + 'NONE', '_create_' + 'unverified_context', 'check_' + 'hostname\\s*=\\s*False', 'reject' + 'Unauthorized\\s*:\\s*false',
    'NODE_TLS_' + 'REJECT_UNAUTHORIZED', 'Skip' + 'CertificateCheck', 'ServerCertificate' + 'ValidationCallback', '--' + 'insecure', 'curl\\b[^\\n|]*\\s-k\\b'].join('|'));
  const ours = [], walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (!['vendor', '_cache', 'fixtures', 'node_modules'].includes(e.name) && !e.name.startsWith('.') && e.name !== 'runtime') walk(p); } else if (/\.(py|mjs|js|sh|ps1|bat|command|html)$/.test(e.name) && p !== fileURLToPath(import.meta.url)) ours.push(p); } };
  walk(PROJECT);
  const off = ours.filter(f => OFF.test(text(f))).map(f => path.relative(PROJECT, f));
  check(`HTTPS: no file switches certificate checks off (${ours.length} files read)`, ours.length > 50 && !off.length, off);
}

// ---- 1b · the browser checks: asked for by default, so a missing browser or WebSocket is a failure with a plain line, never a silent pass
async function browserChecks() {
  const lib = await import('./e2e_lib.mjs').catch(e => ({ failedToLoad: e }));
  check('e2e_lib.mjs says why the browser checks cannot run (whyNoBrowser)', typeof lib.whyNoBrowser === 'function', lib.failedToLoad?.message || Object.keys(lib));
  if (typeof lib.whyNoBrowser === 'function') {
    const noWs = lib.whyNoBrowser('e2e', { webSocket: false, browser: '/a/browser' }), noBrowser = lib.whyNoBrowser('e2e', { webSocket: true, browser: undefined });
    check('no WebSocket: one plain line that names the way out (E2E=0)', /^e2e: /.test(noWs) && noWs.includes('E2E=0') && !noWs.includes('\n'), noWs);
    check('no browser: one plain line that names CHROME= and the way out (E2E=0)', /^e2e: /.test(noBrowser) && noBrowser.includes('CHROME=') && noBrowser.includes('E2E=0') && !noBrowser.includes('\n'), noBrowser);
    same('a browser and WebSocket: nothing stands in the way', lib.whyNoBrowser('e2e', { webSocket: true, browser: '/a/browser' }), '');
  }
  const run = (args, env = {}) => spawnSync(process.execPath, args, { cwd: TMP, encoding: 'utf8', env: { PATH: SYSTEM_PATH, HOME: path.join(TMP, 'no-home'), ...env }, timeout: 60000 });
  const noWs = run(['--no-experimental-websocket', path.join(HERE, 'e2e.mjs')]);
  check('e2e.mjs on a Node without WebSocket: it fails (exit 1) with its plain line, it does not pass as skipped', noWs.status === 1 && /^e2e: .*E2E=0/m.test(noWs.stdout) && !/skipped/.test(noWs.stdout), [noWs.status, noWs.stdout, noWs.stderr]);
  const missing = run([path.join(HERE, 'e2e.mjs')], { CHROME: path.join(TMP, 'no such browser') });
  check('e2e.mjs with CHROME at a missing path: it fails (exit 1) and says so', missing.status === 1 && missing.stdout.includes('there is no browser there'), [missing.status, missing.stdout]);
  if (!MAC) return;
  // check.sh in a copy, with a stand-in Node: the offline suites pass at once, the browser suites run on a Node without WebSocket
  const dir = path.join(TMP, 'check copy'), standIn = path.join(TMP, 'check bin', 'node');
  for (const f of ['check.sh', 'e2e.mjs', 'e2e_flow.mjs', 'e2e_lib.mjs']) put(path.join(dir, 'scripts', f), text(path.join(HERE, f)));
  for (const f of (text(path.join(HERE, 'check.sh')).match(/^OFFLINE="([^"]*)"/m)?.[1] ?? '').split(' ').filter(Boolean)) put(path.join(dir, 'scripts', f), '// stand-in suite\n');
  put(standIn, `#!/bin/sh\n# Stand-in Node for check.sh: offline suites pass at once; a browser suite runs on the real Node without WebSocket.\ncase $1 in scripts/e2e*) exec ${sq(process.execPath)} --no-experimental-websocket "$@" ;; esac\necho "stand-in $1: 1 passed, 0 failed"\n`, 0o755);
  const sh = env => spawnSync('/bin/sh', [path.join(dir, 'scripts', 'check.sh')], { cwd: TMP, encoding: 'utf8', env: { PATH: SYSTEM_PATH, HOME: path.join(TMP, 'no-home'), NODE: standIn, ...env }, timeout: 60000 });
  const asked = sh({});
  check('check.sh: by default the browser suites are asked for, so without WebSocket the check FAILS and shows the plain line', asked.status !== 0 && /^e2e: .*E2E=0/m.test(asked.stdout) && !asked.stdout.includes('skipped'), [asked.status, asked.stdout]);
  const off = sh({ E2E: '0' });
  check('check.sh: E2E=0 is the one way to leave the browser suites out, and it says so', off.status === 0 && off.stdout.trim().endsWith('e2e: skipped (E2E=0)'), [off.status, off.stdout]);
}

// ---- 1c · the Windows start, read (no suite can run it on a Mac): it asks the same one question about the NASA login as the Mac start
function windowsLogin() {
  const ps = text(path.join(HERE, 'start-windows.ps1')), body = ps.match(/^function Test-Login \{\r\n([\s\S]*?)^\}/m)?.[1] ?? '';
  check('start-windows.ps1: Test-Login asks scripts\\earthdata.mjs through the folder\'s Node and takes only a "yes" answer as a login',
    /Get-ToolText \$Node @\("\$Root\\scripts\\earthdata\.mjs"\)/.test(body) && /-like 'yes \*'/.test(body), body);
  check('start-windows.ps1: no file is searched for the NASA host name to decide whether a login exists', !/Contains\(\$EarthdataHost\)/.test(ps) && !/Test-HasHost/.test(ps));
  const nodeSet = ps.search(/^\$Node = "\$RT\\node-\$Arch\\node\.exe"/m), firstAsk = ps.search(/-not \(Test-Login\)/);
  check('start-windows.ps1: Node is found (step 7) before the login is asked about (step 9)', nodeSet > 0 && firstAsk > nodeSet, [nodeSet, firstAsk]);
  const run = text(path.join(HERE, 'run.sh'));
  check('run.sh: has_login asks scripts/earthdata.mjs and searches no file for the NASA host name', /^has_login\(\) \{[^\n]*earthdata\.mjs/m.test(run) && !/grep -qF "\$EARTHDATA_HOST"/.test(run));
  // the server's health names its own folder; the Windows start compares that folder, not the shared cache
  const six = ps.match(/# ---- 6 - already running[\s\S]*?\r\n\r\n/)?.[0] ?? '';
  check('start-windows.ps1: "already running" compares the folder the server names (root), not only its cache', /\$health\.root\) -ieq/.test(six) && !/\$health\.cache\) -ieq/.test(six), six);
  check('start-windows.ps1: plain ASCII with Windows line ends only', /^[\x00-\x7f]*$/.test(ps) && !/[^\r]\n/.test(ps) && ps.includes('\r\n'));

  // --login while this folder's Crophalo runs: the login is asked first, then the start ends without a second server (as run.sh, which a suite runs on a Mac)
  const at = re => ps.search(re), step = n => at(new RegExp(`^# ---- ${n} - `, 'm'));
  check('start-windows.ps1: "already running" ends the start at once only when no login was asked for; with --login it is remembered',
    /if \(\$Ask -ne 'yes'\) \{[^\n]*exit 0/.test(six) && /\$Running = \$true/.test(six), six);
  check('start-windows.ps1: while it runs, the Python set-up (step 8) is left alone', /^if \(\$Running\) \{[^\n]*\} elseif \(Test-Venv\)/m.test(ps));
  const ends = at(/^if \(\$Running\) \{[^\n]*exit 0 \}/m), asked = at(/^if \(\$Ask -eq 'yes'\) \{/m);
  check('start-windows.ps1: with --login the login is asked (step 9), then the start ends before the check-up and before any server starts', asked > step(9) && ends > asked && ends < step(10) && step(10) < at(/Diagnostics\.Process\]::Start/), [step(9), asked, ends, step(10)]);
  // a new login keeps every other service's entry: the same code as the Mac start, in scripts\earthdata.mjs, byte for byte through base64
  const others = ps.match(/^function Get-OtherLogins[\s\S]*?\r\n\}\r\n/m)?.[0] ?? '';
  check('start-windows.ps1: Get-OtherLogins asks scripts\\earthdata.mjs --others --base64 and reads no lines itself', /earthdata\.mjs/.test(others) && /'--others'/.test(others) && /'--base64'/.test(others) && /FromBase64String/.test(others) && !/-split/.test(others), others);
  // the old file stays until the new one is in its place: one replace, never a delete first; a first file is only moved
  const over = ps.match(/^function Move-Over[^\r\n]*(?:\r\n {2}[^\r\n]*)*/m)?.[0] ?? '';   // its first line and the lines indented under it
  check('start-windows.ps1: Move-Over replaces an existing file in one step, never deletes it first, and puts it back when a swap stops halfway',
    /\[IO\.File\]::Replace\(\$from, \$to, \$before\)/.test(over) && !/Delete|Remove-File \$to\b/.test(over) && /if \(-not \[IO\.File\]::Exists\(\$to\)\) \{ \[IO\.File\]::Move\(\$from, \$to\); return \}/.test(over) &&
    /catch \{ if \(-not \[IO\.File\]::Exists\(\$to\) -and \[IO\.File\]::Exists\(\$before\)\) \{ \[IO\.File\]::Move\(\$before, \$to\) \}; throw \}/.test(over), over);
  const save = ps.match(/^function Save-Login[\s\S]*?\r\n\}\r\n/m)?.[0] ?? '';
  check('start-windows.ps1: Save-Login closes the old file to others before the new one replaces it (a replace keeps the old file\'s rights)', save.indexOf('Protect-File $real') > 0 && save.indexOf('Protect-File $real') < save.indexOf('Move-Over'), save);
}

// ---- 2 · the pure parts of the doctor
function doctorParts() {
  same('doctor line: ok, FIX and note start in one column, the fix under an arrow', [line('ok', 'A'), line('fix', 'B', 'do C'), line('note', 'D')], ['  ok    A', '  FIX   B\n        -> do C', '  note  D']);
  same('must-have files: all of them are in this folder', missingFiles(PROJECT), []);
  const bare = path.join(TMP, 'bare'); put(path.join(bare, 'index.html'));
  same('must-have files: a missing one is named, a present one is not', missingFiles(bare, ['index.html', 'css/app.css']), ['css/app.css']);
  same('the six library names are read from portable.sh', importList(PROJECT), 'earthaccess, h5py, netCDF4, numpy, rasterio, openpyxl');

  // The modules the page needs to start come from the page itself: index.html's module scripts and every static import they reach.
  const page = path.join(TMP, 'page'), js = f => path.join(page, f), app = text(path.join(PROJECT, 'js', 'app.js'));
  put(js('index.html'), text(path.join(PROJECT, 'index.html'))); fs.cpSync(path.join(PROJECT, 'js'), js('js'), { recursive: true });
  for (const f of ['scripts/serve.mjs', 'scripts/earthdata.mjs', 'scripts/hostmode.mjs', 'scripts/status.mjs', 'scripts/vendor.mjs', 'scripts/run.sh', 'scripts/portable.sh', 'scripts/requirements.txt', 'css/app.css', 'Start Crophalo.command']) put(js(f), text(path.join(PROJECT, f)));
  same('page modules: with every module there, nothing is missing', missingFiles(page), []);
  for (const f of ['js/app.js', 'js/settings.js', 'js/words.js']) {
    fs.renameSync(js(f), js(f + '.away'));
    check(`page modules: without ${f} the check names it`, missingFiles(page).includes(f), missingFiles(page));
    fs.renameSync(js(f + '.away'), js(f));
  }
  put(js('js/app.js'), `${app}\nimport './added-test.js';\n// import './commented-test.js';\nconst later = () => import('./later-test.js');\n`);
  same('page modules: a static import added to the page is followed (read from the page, not from a list); a commented one and a later import() are not needed to start', missingFiles(page), ['js/added-test.js']);
  put(js('js/added-test.js'), "import { nothing } from './deeper-test.js';\nexport const added = nothing;\n");
  same('page modules: imports are followed to any depth', missingFiles(page), ['js/deeper-test.js']);
  put(js('index.html'), text(path.join(PROJECT, 'index.html')).replace('src="js/app.js"', 'src="js/boot-test.js"'));
  same('page modules: the module script index.html names is the start of it all', missingFiles(page), ['js/boot-test.js']);

  const packed = path.join(TMP, 'packed'), tool = (...p) => put(path.join(packed, 'runtime', ...p));
  same('packed tools: an empty folder has none', packedTools(packed), { whole: [], any: false });
  for (const a of ['arm64', 'x86_64']) { tool(`node-${a}`, 'bin', 'node'); tool(`uv-${a}`, 'uv'); tool('wheels', a, '.complete'); tool('python', `cpython-${PYVER}-macos-${UVA[a]}-none`, 'bin', 'python3.12'); }
  for (const n of ['LICENSE-MIT', 'LICENSE-APACHE']) tool('uv-arm64', n);
  same('packed tools: uv without its two licence texts does not count as packed', packedTools(packed), { whole: ['arm64'], any: true });
  tool('uv-x86_64', 'LICENSE-MIT'); tool('uv-x86_64', 'LICENSE-APACHE');
  same('packed tools: with everything there, both kinds of Mac are whole', packedTools(packed).whole, ['arm64', 'x86_64']);
  if (MAC) {   // making a link needs a special right on Windows, and the link is a Mac matter anyway
    fs.rmSync(path.join(packed, 'runtime', 'python', `cpython-${PYVER}-macos-aarch64-none`), { recursive: true });
    fs.symlinkSync(path.join(TMP, 'another-folder'), path.join(packed, 'runtime', 'python', 'cpython-3.12-macos-aarch64-none'));
    same('packed tools: uv\'s link to a Python in another folder is not a Python in this one', packedTools(packed).whole, ['x86_64']);
  }

  const kept = path.join(TMP, 'kept'), when = new Date(Math.floor(Date.now() / 1000) * 1000 - 3600e3);
  same('saved fields: no copy means none found and none damaged', savedCopy(kept), { found: false, damaged: false });
  put(path.join(kept, 'backup.json'), '{ not json'); put(path.join(kept, 'backup-1.json'), JSON.stringify({ app: 'crophalo', v: 1, saved: when.toISOString(), from: 'test', keys: {} }));
  same('saved fields: a damaged newest copy falls back to the one before it, with that copy\'s own time', [savedCopy(kept).found, savedCopy(kept).when?.getTime()], [true, when.getTime()]);
  fs.rmSync(path.join(kept, 'backup-1.json'));
  same('saved fields: only damaged copies are called damaged, never found', savedCopy(kept), { found: false, damaged: true });
}

// ---- 3 · the helpers of portable.sh, called one by one
function shellHelpers() {
  const c = makeFolder({ tools: false }); fs.mkdirSync(c.rt, { recursive: true });
  const call = (script, env = {}) => spawnSync('/bin/sh', ['-c', `ROOT="$R"; . "$R/scripts/portable.sh"; ${script}`], { env: { PATH: SYSTEM_PATH, HOME: c.home, R: c.root, ...env }, encoding: 'utf8' }).stdout;
  const HOST = 'machine urs.earthdata.nasa.gov login ';
  const WORDS = [   // [username, password, the line as it must be written]
    ['user1', 'pw1', `${HOST}user1 password pw1`],
    ['user.name+x@farm.example', 'a=b,c:d/e-f_1', `${HOST}user.name+x@farm.example password a=b,c:d/e-f_1`],
    ['user1', 'pw 1', `${HOST}user1 password "pw 1"`],
    ['user1', 'p"w\\1', `${HOST}user1 password "p\\"w\\\\1"`],
    ['user1', 'pw#1\'$HOME`id`', `${HOST}user1 password "pw#1'$HOME\`id\`"`],
    ['user 1', 'pwü1', `${HOST}"user 1" password "pwü1"`],
    ['user1', WORD, `${HOST}user1 password "pw1 \\"q\\\\ü#'$x"`],
  ];
  const written = WORDS.map(([u, p]) => call('netrc_line "$U" "$P"', { U: u, P: p }));
  WORDS.forEach(([u, p, want], i) => same(`netrc line: username ${show(u)} with password ${show(p)} is written with the right quotes`, written[i], want + '\n'));
  same('netrc line: every line reads back as the very words that were typed', written.map(l => parseNetrc(l)), WORDS.map(([login, password]) => ({ login, password })));
  same('netrc line: an empty word is written as "", never as nothing', call('netrc_word ""'), '""');

  const file = path.join(c.base, 'archive.tar.gz'), sum = sha('stand-in archive'), wrong = sha('another archive');
  const verify = (pinned, published) => { put(file, 'stand-in archive'); return [call('verify "$F" "$A" "$B"; printf "rc=%s" $?', { F: file, A: pinned, B: published }), exists(file)]; };
  same('verify: a file that equals the pinned hash AND the publisher\'s hash is kept', verify(sum, sum), ['rc=0', true]);
  same('verify: a wrong pinned hash is refused and the file removed', verify(wrong, sum), ['rc=1', false]);
  same('verify: a wrong publisher hash is refused and the file removed', verify(sum, wrong), ['rc=1', false]);
  same('verify: a publisher hash that was not found is refused too', verify(sum, ''), ['rc=1', false]);
  check('verify: the log names each refusal', (text(c.log).match(/checksum MISMATCH archive\.tar\.gz/g) || []).length === 3 && /checksum ok archive\.tar\.gz/.test(text(c.log)), text(c.log));

  const py = (root, dir) => put(path.join(root, 'runtime', 'python', dir, 'bin', 'python3.12'), '#!/bin/sh\n', 0o755), kind = UVA[ARCH];
  py(c.root, `cpython-3.12.9-macos-${kind}-none`); const newest = py(c.root, `cpython-3.12.16-macos-${kind}-none`);
  const elsewhere = path.join(c.base, 'old place'); py(elsewhere, `cpython-3.12.40-macos-${kind}-none`);
  for (const name of [`cpython-3.12-macos-${kind}-none`, `cpython-3.12.40-macos-${kind}-none`]) fs.symlinkSync(path.join(elsewhere, 'runtime', 'python', `cpython-3.12.40-macos-${kind}-none`), path.join(c.rt, 'python', name));
  same('find_python: the newest patch by number (16 comes after 9), and never a link into another folder', call('find_python "$A"', { A: ARCH }), newest);
  for (const n of [9, 16]) fs.rmSync(path.join(c.rt, 'python', `cpython-3.12.${n}-macos-${kind}-none`), { recursive: true });
  same('find_python: with only links left, this folder has no Python of its own', call('find_python "$A"', { A: ARCH }), '');

  same('writable: a normal folder passes and no test file stays behind', [call('folder_writable; printf "rc=%s" $?'), fs.readdirSync(c.root).filter(n => n.includes('write-test')), fs.readdirSync(c.rt).filter(n => n.includes('write-test'))], ['rc=0', [], []]);
  if (process.getuid() !== 0) {   // the administrator may write anywhere, so the check means nothing for that user
    fs.chmodSync(c.root, 0o555);
    same('writable: a read-only folder fails even when it already holds a writable runtime/', call('folder_writable; printf "rc=%s" $?'), 'rc=1');
    fs.chmodSync(c.root, 0o755);
  }
}

// ---- 4 · the doctor, state by state (its own stand-in services, so their answers can be changed)
async function theDoctor() {
  const svc = await services(), c = makeFolder({ tools: false, vendor: true }); c.env.FW_CHECK_UPSTREAM = svc.url;
  const ask = async (mode = '--doctor', env = {}) => { const s = launch(process.execPath, [path.join(c.root, 'scripts', 'preflight.mjs'), ...(mode ? [mode] : [])], c, { env: { NO_COLOR: '1', ...env } }); await s.closed; return s; };
  const fixes = s => (s.out.match(/^ {2}FIX /gm) || []).length;
  try {
    let d = await ask(), plain = await ask('');
    check('doctor: with no .venv it says Python is not set up, and how to set it up', d.out.includes('  FIX   Python and the NASA data tools are not set up in this folder yet\n        -> double-click Start Crophalo.command, or run: sh "' + runSh(c) + '"'), d.out);
    check('doctor: with no login it names the five satellite parts and the command that adds it', d.out.includes('  FIX   No NASA Earthdata login yet: the five satellite parts (SMAP, GRACE-FO, ECOSTRESS, HLS, GEDI) stay empty\n        -> add it: sh "' + runSh(c) + '" --login'), d.out);
    same('doctor: it counts its FIX lines, exits 0 and says Crophalo still opens; the plain mode exits 1', [fixes(d), d.out.includes('  2 things to fix: see the FIX lines above. Crophalo still opens.'), d.code, plain.code, plain.out.includes('  2 things to fix before going live.')], [2, true, 0, 1, true]);
    check('doctor: the folder path with a space and a "Ü" is printed whole, in quotes', d.out.includes(`sh "${runSh(c)}"`) && c.root.includes(' ') && c.root.includes('Ü'));

    put(path.join(c.root, '.venv', 'bin', 'python'), c.scripts.python, 0o755); flag(c, 'libs-missing');
    d = await ask();
    check('doctor: a Python whose libraries do not load is told apart from no Python', d.out.includes('  FIX   Python is here, but the NASA data tools do not load') && !d.out.includes('are not set up in this folder yet'), d.out);
    flag(c, 'libs-missing', false); put(path.join(c.rt, 'earthdata-skipped'));
    d = await ask();
    same('doctor: a login the owner chose to skip is a note, not a FIX, and then everything is in place', [d.out.includes('  note  No NASA Earthdata login (you chose to skip it)'), fixes(d), d.out.includes('  Everything needed is in place.'), d.code], [true, 0, true, 0]);
    check('doctor: the Python version it prints is the one Python itself gave', d.out.includes(`  ok    Python ${PYVER} and the NASA data tools load`), d.out);
    flag(c, 'pyver', '3.12.98\n'); d = await ask(); flag(c, 'pyver', PYVER + '\n');
    check('doctor: another Python gives another number (it is read, not written in)', d.out.includes('  ok    Python 3.12.98 and the NASA data tools load'), d.out);

    put(path.join(c.root, '.secrets', 'earthdata.netrc'), `machine urs.earthdata.nasa.gov login ${USER} password "${WORD.replace(/[\\"]/g, '\\$&')}"\n`, 0o600); flag(c, 'login', 'yes\n');
    d = await ask(); plain = await ask('');
    same('doctor: all there: only ok and note lines, the login works and is kept in the folder; the plain mode exits 0',
      [fixes(d), d.out.includes('  ok    NASA Earthdata login works (kept inside the Crophalo folder (.secrets), so it moves with the folder)'), d.out.includes('  Everything needed is in place.'), d.code, plain.code, plain.out.includes('  Ready to go live.')], [0, true, true, 0, 0, true]);
    check('doctor: it never prints the username or the password', ![d.out, plain.out].some(o => o.includes(USER) || o.includes(WORD) || o.includes('pw1')));
    flag(c, 'login', 'no\n'); d = await ask(); plain = await ask('');
    same('doctor: a login NASA refuses is a FIX with the command to type it again; the plain mode exits 1', [d.out.includes('  FIX   NASA Earthdata did not accept the login kept inside the Crophalo folder'), d.out.includes(`-> type it again: sh "${runSh(c)}" --login`), d.code, plain.code], [true, true, 0, 1]);
    flag(c, 'login', 'unasked\n'); d = await ask();
    same('doctor: when NASA could not be asked, the login is not called wrong', [d.out.includes('  note  The NASA login (kept inside the Crophalo folder (.secrets), so it moves with the folder) could not be tried just now'), fixes(d)], [true, 0]);
    flag(c, 'login', 'no\n'); svc.status[3] = 503; d = await ask(); svc.status[3] = 200;
    same('doctor: a "no" while NASA\'s login service is down blames the service, not the login', [d.out.includes('did not accept'), d.out.includes('  FIX   NASA Earthdata login service not reachable: it answered with an error (503)\n        -> the trouble is on their side: try again later'), fixes(d)], [false, true, 1]);
    flag(c, 'login', 'yes\n'); d = await ask();
    same('doctor: the login check is handed the certifi bundle of the folder\'s Python as SSL_CERT_FILE', text(path.join(c.state, 'login-ssl')), path.join(c.state, 'certs.pem'));
    d = await ask('--doctor', { SSL_CERT_FILE: path.join(c.base, 'owner roots.pem') });
    same('doctor: an SSL_CERT_FILE the owner set wins', text(path.join(c.state, 'login-ssl')), path.join(c.base, 'owner roots.pem'));
    d = await ask('--doctor', { FW_CHECK_UPSTREAM: 'http://127.0.0.1:9' });
    same('doctor: with no internet each of the five services is named, and it still exits 0', [(d.out.match(/not reachable: no connection\n {8}-> check the internet connection/g) || []).length, d.out.includes('  5 things to fix'), d.code], [5, true, 0]);

    d = await ask();
    check('doctor: the Node version is the running Node\'s own', d.out.includes(`  ok    Node ${process.versions.node}, `), d.out.split('\n')[0]);
    const disk = fs.statfsSync(c.root), free = disk.bavail * disk.bsize / 1e9, said = Number(d.out.match(/ {2}ok {4}([\d.]+) GB free on this disk/)?.[1]);
    check('doctor: the free space is this disk\'s (within half a GB: other programs write between the two readings)', Math.abs(said - free) < 0.5, [said, free]);
    check('doctor: with no saved-fields copy it prints no date at all', d.out.includes('  note  No copy of saved fields in this folder yet') && !/last saved/.test(d.out));
    const when = new Date(Math.floor(Date.now() / 1000) * 1000 - 5400e3), backup = path.join(c.root, '.userdata', 'backup.json');
    put(backup, JSON.stringify({ app: 'crophalo', v: 1, saved: when.toISOString(), from: 'test', keys: {} })); d = await ask();
    check('doctor: the saved-fields time is the one written in the copy', d.out.includes(`last saved ${when.toLocaleString('en-US')}`), d.out.match(/.*last saved.*/)?.[0]);
    const older = new Date(when.getTime() - 3600e3);
    put(backup, JSON.stringify({ app: 'crophalo', v: 1, saved: 'no time', keys: {} })); fs.utimesSync(backup, older, older); d = await ask();
    check('doctor: a copy with no readable time shows the file\'s own time, never a made-up one', d.out.includes(`last saved ${older.toLocaleString('en-US')}`), d.out.match(/.*last saved.*/)?.[0]);
    same('doctor: its writable test leaves no file behind', fs.readdirSync(c.root).filter(n => n.includes('write-test')), []);
  } finally { svc.server.close(); }
}

// ---- 5 · the first start, a second one, and two folders on one port
async function firstStarts() {
  const c = makeFolder(), P = await freePorts(2);
  const a = await start(c, [...QUIET, '--port', P]);
  check('first start: in a folder with a space and a "Ü" it sets itself up and says where it runs', a.port === P && c.root.includes(' ') && c.root.includes('Ü') && a.out.includes('The NASA data tools are ready.'), a.out);
  const h = await healthOnce(P, x => x?.python === true);
  same('first start: the server answers from this very folder and has found its Python', [h?.ok, h?.python, h?.cache], [true, true, path.join(c.root, '.cache', 'api')]);
  same('fingerprint: five lines: its version, the kind of Mac, the Python, the list of libraries, the folder', text(c.stamp), goodStamp(c));
  same('port memory: the port is written into runtime/last-port', text(path.join(c.rt, 'last-port')), `${P}\n`);
  check('no terminal: nothing was asked and no browser was opened (--no-login, --no-open)', !/username|Password/.test(a.out) && !exists(path.join(c.state, 'opened.log')), a.out);
  const uv = rows(path.join(c.state, 'uv.log'));
  check('inside the folder: uv keeps its cache, its Python and its temp files under runtime/ and reads no outside settings', uv.length >= 2 && uv.every(l => l.endsWith(`|cache=${c.rt}/uv-cache|python=${c.rt}/python|tmp=${c.rt}/tmp|noconfig=1`)), uv);
  check('quarantine: with nothing to free, the step says nothing', !a.out.includes('download flag') && !text(c.log).includes('quarantine'), a.out);
  check('the log: it opens with the folder and holds no line from before today', text(c.log).startsWith(`${new Date().getFullYear()}-`) && text(c.log).includes(`start in ${c.root} (macOS `), text(c.log).slice(0, 200));

  const again = await once(c, ['--no-login', '--port', P]);
  same('already running: a second start from the same folder only opens the browser there', [again.code, again.out.trim(), text(path.join(c.state, 'opened.log'))], [0, `Crophalo is already running from this folder: http://localhost:${P}/`, `http://localhost:${P}/\n`]);
  const quiet = await once(c, [...QUIET, '--port', P]);
  same('already running: with --no-open the browser stays shut', [quiet.code, rows(path.join(c.state, 'opened.log')).length], [0, 1]);
  const other = makeFolder(), b = await start(other, [...QUIET, '--port', P]);
  check('busy port: a Crophalo from ANOTHER folder on that port is not "already running": this one takes the next port and says so',
    b.port === P + 1 && b.out.includes(`Port ${P} is in use by another program, so Crophalo uses ${P + 1}.`) && text(path.join(other.rt, 'last-port')) === `${P + 1}\n`, b.out);
  await stop(b); await stop(a);
  check('stopping: after SIGTERM to its own process number the server is gone', a.gone && (await health(P)) === null && a.out.includes('SIGTERM: shutting down'));

  const before = uv.length, second = await start(c, QUIET);   // no --port: the folder remembers
  check('port memory: the next start comes back on the remembered port', second.port === P, second.out);
  check('fingerprint: a .venv whose five lines all match is reused: nothing is set up again, and the log says so',
    !second.out.includes('Setting up Python') && rows(path.join(c.state, 'uv.log')).length === before && text(c.log).includes('venv reused'), second.out);
  await stop(second);
  same('nothing outside: the home folder is still empty', fs.readdirSync(c.home), []);
  return c;
}

// ---- 5b · two folders that share one cache folder (FW_CACHE) on one port: each start knows its own server by its folder, not by the cache
async function sharedCache() {
  const one = makeFolder(), two = makeFolder(), P = await freePorts(2), shared = path.join(TMP, `shared cache ${P}`), env = { FW_CACHE: shared };
  const a = await start(one, [...QUIET, '--port', P], { env });
  const b = await start(two, [...QUIET, '--port', P], { env });
  const [ha, hb] = [await health(P), await health(P + 1)];
  check('shared cache: the second folder is not taken for the first; it starts its own server on the next port and says so',
    a.port === P && b.port === P + 1 && !b.out.includes('already running') && b.out.includes(`Port ${P} is in use by another program, so Crophalo uses ${P + 1}.`), b.out);
  same('shared cache: each server names its own folder and both name the one cache', [ha?.root, hb?.root, ha?.cache, hb?.cache], [one.root, two.root, path.join(shared, 'api'), path.join(shared, 'api')]);
  const again = await once(one, ['--no-login', '--port', P], { env });
  same('shared cache: the first folder, started again, still finds its own server and only opens the browser', [again.code, again.out.trim()], [0, `Crophalo is already running from this folder: http://localhost:${P}/`]);
  await stop(b); await stop(a);
}

// ---- 6 · the fingerprint rules, on the folder the first start set up
async function fingerprint(c) {
  const builds = () => uvCalls(c, 'venv --python').length;
  async function rebuilt(spoil) {   // spoil one thing, start, and see a fresh .venv with the right five lines and nothing left behind
    spoil(); const n = builds(), s = await start(c, QUIET);
    const ok = s.port > 0 && builds() === n + 1 && text(c.stamp) === goodStamp(c) && !exists(path.join(c.rt, 'venv-before'));
    await stop(s);
    return ok;
  }
  const lines = goodStamp(c).split('\n');
  const WRONG = [[0, 'its version line', 'crophalo-venv 0'], [1, 'the kind of Mac', `arch=${OTHER}`], [2, 'the Python version', 'python=3.12.98'], [3, 'the list of libraries', 'requirements=' + '0'.repeat(64)], [4, 'the folder', 'folder=/another/place/Crophalo']];
  for (const [i, name, wrong] of WRONG) check(`fingerprint: a .venv that differs only in ${name} is built again`, await rebuilt(() => put(c.stamp, lines.with(i, wrong).join('\n'))));

  const list = path.join(c.root, 'scripts', 'requirements.txt'), changed = await rebuilt(() => fs.appendFileSync(list, '# a line added by the suite\n'));
  same('fingerprint: a changed list of libraries builds the .venv again and fetches the library files again (once)',
    [changed, rows(path.join(c.state, 'pip.log')), text(path.join(c.rt, 'wheels', ARCH, '.complete'))], [true, ['pip download'], sha(fs.readFileSync(list)) + '\n']);
  const moved = path.join(c.base, 'Moved Ü place', 'Crophalo'), oldRoot = c.root;
  check('moved folder: the same folder in a new place builds its .venv again, and the fingerprint names the new place', await rebuilt(() => {
    fs.mkdirSync(path.dirname(moved)); fs.renameSync(oldRoot, moved);
    Object.assign(c, { root: moved, rt: path.join(moved, 'runtime'), log: path.join(moved, 'runtime', 'setup.log'), stamp: path.join(moved, '.venv', 'crophalo-venv.txt') });
  }) && text(c.stamp).includes(`folder=${moved}\n`) && uvCalls(c, 'venv --python').at(-1).startsWith(`venv --python ${moved}/runtime/python/`), text(c.stamp));

  flag(c, 'libs-missing'); let n = builds(), s = await start(c, QUIET); flag(c, 'libs-missing', false);
  same('a failed new .venv: Crophalo\'s own old .venv comes back, the reason is said in plain words, and Crophalo still opens',
    [s.port > 0, builds(), text(c.stamp), exists(path.join(c.rt, 'venv-before')), s.out.includes('The NASA data tools are not set up: the NASA data libraries could not be installed. Crophalo still opens; the satellite and data-server parts stay empty until this is fixed.')],
    [true, n + 1, goodStamp(c), false, true]);
  await stop(s);

  const keep = path.join(c.base, 'someone else\'s venv'); fs.renameSync(path.join(c.root, '.venv'), keep); fs.symlinkSync(keep, path.join(c.root, '.venv'));
  n = builds(); s = await start(c, QUIET); await stop(s);
  const aside = path.join(c.rt, 'old', 'venv-previous');
  same('someone else\'s .venv (a link): moved aside as it is, never deleted, and Crophalo builds its own',
    [fs.lstatSync(aside).isSymbolicLink(), fs.readlinkSync(aside), exists(path.join(keep, 'crophalo-venv.txt')), fs.lstatSync(path.join(c.root, '.venv')).isDirectory(), text(c.stamp), builds()], [true, keep, true, true, goodStamp(c), n + 1]);
  fs.rmSync(c.stamp); put(path.join(c.root, '.venv', 'a file of someone else'), 'kept');
  s = await start(c, QUIET); await stop(s);
  same('someone else\'s .venv (no fingerprint): moved aside under a new name with every file, never deleted',
    [text(path.join(c.rt, 'old', 'venv-previous-2', 'a file of someone else')), fs.lstatSync(aside).isSymbolicLink(), text(c.stamp)], ['kept', true, goodStamp(c)]);
}

// ---- 7 · ports: a busy one is skipped, the order of the three ways to name one, and what is refused
async function thePorts() {
  const c = makeFolder(), P = await freePorts(3), A = await freePorts(), B = await freePorts();
  const marked = path.join(c.root, 'index.html');
  const flagged = spawnSync('/usr/bin/xattr', ['-w', 'com.apple.quarantine', '0081;00000000;Crophalo suite;', marked]).status === 0;
  const four = net.createServer(); await listen(four, P, '127.0.0.1');
  let s = await start(c, [...QUIET, '--port', P]);
  check('busy port: a port another program holds on 127.0.0.1 is skipped, and the start says which one it took', s.port === P + 1 && s.out.includes(`Port ${P} is in use by another program, so Crophalo uses ${P + 1}.`) && text(path.join(c.rt, 'last-port')) === `${P + 1}\n`, s.out);
  check('quarantine: a file with the macOS download flag is freed, and the start says how many', flagged && s.out.includes('Took the macOS download flag off 1 file, so Crophalo\'s own tools can run.') && spawnSync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', marked]).status !== 0, s.out);
  await stop(s); four.close();
  const six = net.createServer(); await listen(six, P, '::1');
  s = await start(c, [...QUIET, '--port', P]);
  check('busy port: a port held only on ::1 is skipped too (a browser may reach "localhost" that way)', s.port === P + 1, s.out);
  await stop(s); six.close();
  s = await start(c, QUIET, { env: { CROPHALO_PORT: String(A) } });
  check('port order: CROPHALO_PORT comes before the remembered port', s.port === A, s.out); await stop(s);
  s = await start(c, [...QUIET, '--port', B], { env: { CROPHALO_PORT: String(A) } });
  check('port order: --port comes before CROPHALO_PORT', s.port === B, s.out); await stop(s);
  s = await start(c, [...QUIET, `--port=${B}`], { cwd: os.tmpdir() }, path.join(c.root, 'Start Crophalo.command'));
  check('the starter: started from another folder it finds its own and passes the options on', s.port === B, s.out); await stop(s);

  const fresh = makeFolder({ tools: false });
  const refused = [];
  for (const args of [['--port', 'abc'], ['--port', '80'], ['--port', '99999'], ['--port'], ['--wrong']]) { const r = await once(fresh, args); refused.push([r.code, r.out.trim().split('\n')[0]]); }
  same('refused: a port that is no port, a port with no number and an unknown option each stop with exit 2 and a plain line', refused, [
    [2, 'The port must be a number from 1024 to 65535, not "abc".'], [2, 'The port must be a number from 1024 to 65535, not "80".'], [2, 'The port must be a number from 1024 to 65535, not "99999".'],
    [2, 'Use: sh scripts/run.sh [--no-open] [--port N] [--login] [--no-login]'], [2, 'Unknown option: --wrong']]);
  check('refused: a refused start writes nothing into the folder', !exists(fresh.rt));
}

// ---- 8 · what stops a start, and what only dims it
async function refusals() {
  const c = makeFolder(), P = await freePorts(), message = 'This folder cannot be written to. Copy the whole Crophalo folder onto this Mac (for example into Documents).';
  if (process.getuid() !== 0) {
    fs.mkdirSync(c.rt, { recursive: true }); fs.chmodSync(c.root, 0o555);
    const r = await once(c, [...QUIET, '--port', P]); fs.chmodSync(c.root, 0o755);
    same('unwritable folder: a read-only folder with a writable runtime/ inside stops with the plain message and writes nothing', [r.code, r.out.trim(), fs.readdirSync(c.rt).filter(n => !['uv-' + ARCH, 'python', 'wheels'].includes(n))], [1, message, []]);
  }
  flag(c, 'macos', '10.15\n');
  let r = await once(c, [...QUIET, '--port', P]);
  same('old macOS: below macOS 11 the start stops and says what it needs and what this Mac has', [r.code, r.out.trim()], [1, `Crophalo needs macOS ${pin('MACOS_MIN')} or newer. This Mac has macOS 10.15.`]);
  flag(c, 'macos', '11.7\n');
  const s = await start(c, [...QUIET, '--port', P]); flag(c, 'macos', false);
  const need = pin(`MACOS_MIN_PY_${ARCH}`);
  check('old macOS: where only the NASA libraries are too new, Crophalo still opens and says why the satellite parts stay empty',
    s.port === P && s.out.includes(`The NASA data tools are not set up: this Mac has macOS 11.7, and they need macOS ${need} or newer. Crophalo still opens;`) && !exists(path.join(c.root, '.venv')), s.out);
  await stop(s);
  fs.rmSync(path.join(c.root, 'scripts', 'serve.mjs'));
  r = await once(c, [...QUIET, '--port', P]);
  check('half a folder: without the server file the start stops and asks for the whole folder', r.code === 1 && r.out.startsWith('This is not a whole Crophalo folder'), r.out);
}

// ---- 9 · downloads, answered by the stand-in curl from hand-made archives that carry the real names
function webFiles(c, arches = [ARCH]) {   // returns the hashes of what was made, by the name of the pin each belongs to
  const files = path.join(c.web, 'files'), sums = {}, list = [];
  const tar = (name, top, entries) => {
    const build = path.join(c.web, 'build', name);
    for (const [rel, content, bits] of entries) put(path.join(build, top, rel), content, bits);
    spawnSync('/usr/bin/tar', ['-czf', path.join(files, name), '-C', build, top], { env: { PATH: SYSTEM_PATH, COPYFILE_DISABLE: '1' } });
    return sha(fs.readFileSync(path.join(files, name)));
  };
  for (const a of arches) {
    const nn = `node-v${NODE_VER}-darwin-${a === 'arm64' ? 'arm64' : 'x64'}`, un = `uv-${UVA[a]}-apple-darwin`;
    sums[`NODE_SHA_${a}`] = tar(`${nn}.tar.gz`, nn, [['bin/node', `#!/bin/sh\n# Stand-in for a downloaded Node: it hands over to the Node that runs this suite.\nexec ${sq(process.execPath)} "$@"\n`, 0o755], ['LICENSE', 'stand-in licence text\n'], ['README.md', 'a file the start must leave inside the archive\n']]);
    list.push(`${sums[`NODE_SHA_${a}`]}  ${nn}.tar.gz`);
    sums[`UV_SHA_${a}`] = tar(`${un}.tar.gz`, un, [['uv', c.scripts.uv, 0o755], ['uvx', '#!/bin/sh\n', 0o755]]);
    put(path.join(files, `${un}.tar.gz.sha256`), `${sums[`UV_SHA_${a}`]}  ${un}.tar.gz\n`);
  }
  put(path.join(files, 'SHASUMS256.txt'), list.join('\n') + '\n');
  for (const n of ['MIT', 'APACHE']) { put(path.join(files, `LICENSE-${n}`), `stand-in licence text ${n}\n`); sums[`UV_LICENSE_SHA_${n}`] = sha(`stand-in licence text ${n}\n`); }
  return sums;
}
function repin(c, sums) {   // the copy's pins become the stand-ins' hashes; the project's own portable.sh is never changed
  const file = path.join(c.root, 'scripts', 'portable.sh');
  put(file, Object.entries(sums).reduce((t, [name, sum]) => t.replace(new RegExp(`^${name}=\\S+`, 'm'), `${name}=${sum}`), text(file)));
}
async function downloads() {
  const c = makeFolder({ tools: false }), P = await freePorts(), noNode = { env: { PATH: `${c.bare}:${SYSTEM_PATH}` } };
  const sums = webFiles(c), nodeDir = path.join(c.rt, `node-${ARCH}`), uvDir = path.join(c.rt, `uv-${ARCH}`), nodeName = `node-v${NODE_VER}-darwin-${ARCH === 'arm64' ? 'arm64' : 'x64'}.tar.gz`;
  const cannot = 'Crophalo needs Node to run and could not get it. Check the internet connection, then start again. Details: runtime/setup.log';
  let r = await once(c, [...QUIET, '--port', P], noNode);
  same('wrong hash: an archive that is not the pinned one is refused: no Node is unpacked, the file is removed, the start stops with a plain line',
    [r.code, r.out.includes(cannot), exists(nodeDir), exists(path.join(c.rt, 'downloads', nodeName)), text(c.log).includes(`checksum MISMATCH ${nodeName}`)], [1, true, false, false, true]);
  repin(c, sums); const list = path.join(c.web, 'files', 'SHASUMS256.txt'), honest = text(list);
  put(list, honest.replace(/^[0-9a-f]{8}/, '00000000'));
  r = await once(c, [...QUIET, '--port', P], noNode);
  same('wrong hash: the pinned hash alone is not enough: when the publisher\'s list names another hash the archive is refused too', [r.code, r.out.includes(cannot), exists(nodeDir)], [1, true, false]);
  put(list, honest); fs.rmSync(path.join(c.web, 'asked.log'), { force: true });

  let s = await start(c, [...QUIET, '--port', P], noNode);
  same('a Mac without Node: the checked archive gives the folder its own Node, only the program and its licence, and Crophalo runs on it',
    [s.port, fs.readdirSync(nodeDir).sort(), fs.readdirSync(path.join(nodeDir, 'bin')), text(c.log).includes(`node ${nodeDir}/bin/node`)], [P, ['LICENSE', 'bin'], ['node'], true]);
  same('uv: unpacked with both licence texts beside it, each checked against its pin', [fs.readdirSync(uvDir).sort(), (text(c.log).match(/checksum ok uv LICENSE-(MIT|APACHE)/g) || []).length], [['LICENSE-APACHE', 'LICENSE-MIT', 'uv', 'uvx'], 2]);
  same('the first set-up: Python through uv, the library files, then a .venv with the right fingerprint', [s.out.includes('The NASA data tools are ready.'), text(c.stamp), exists(path.join(c.rt, 'wheels', ARCH, '.complete'))], [true, goodStamp(c), true]);
  const un = `uv-${UVA[ARCH]}-apple-darwin.tar.gz`;
  same('downloads: exactly six files were asked for, each from its pinned https place', rows(path.join(c.web, 'asked.log')), [
    `${pin('NODE_DIST')}/v${NODE_VER}/SHASUMS256.txt`, `${pin('NODE_DIST')}/v${NODE_VER}/${nodeName}`, `${pin('UV_DIST')}/${UV_VER}/${un}.sha256`, `${pin('UV_DIST')}/${UV_VER}/${un}`,
    `${pin('UV_SOURCE')}/${UV_VER}/LICENSE-MIT`, `${pin('UV_SOURCE')}/${UV_VER}/LICENSE-APACHE`]);
  same('downloads: the archives are removed once unpacked', fs.readdirSync(path.join(c.rt, 'downloads')), []);
  await stop(s);
  const moved = path.join(c.base, 'Copied Ü place', 'Crophalo'); fs.cpSync(c.root, moved, { recursive: true, verbatimSymlinks: true });
  const copy = { ...c, root: moved, rt: path.join(moved, 'runtime'), stamp: path.join(moved, '.venv', 'crophalo-venv.txt') }, Q = await freePorts();
  s = await start(copy, [...QUIET, '--port', Q], noNode); await stop(s);
  check('copied folder: uv\'s link still names the old folder, yet the copy builds its .venv on the Python inside itself', s.port === Q && fs.readlinkSync(path.join(copy.rt, 'python', `cpython-3.12-macos-${UVA[ARCH]}-none`)).startsWith(c.rt)
    && uvCalls(c, 'venv --python').at(-1).startsWith(`venv --python ${copy.rt}/python/cpython-${PYVER}-`) && text(copy.stamp) === goodStamp(copy), uvCalls(c, 'venv --python').at(-1));

  const bad = makeFolder({ tools: false }); repin(bad, webFiles(bad)); put(path.join(bad.web, 'files', 'LICENSE-MIT'), 'another text\n');
  s = await start(bad, [...QUIET, '--port', await freePorts()]); await stop(s);
  same('uv: without its licence text (here: a text that is not the pinned one) uv is not kept, and Crophalo still opens and says why',
    [s.port > 0, exists(path.join(bad.rt, `uv-${ARCH}`)), text(bad.log).includes('checksum MISMATCH uv LICENSE-MIT'), s.out.includes('The NASA data tools are not set up: the Python installer (uv) could not be downloaded. Crophalo still opens;')], [true, false, true, true]);
  const offline = makeFolder({ tools: false });
  s = await start(offline, [...QUIET, '--port', await freePorts()]); await stop(s);
  same('no internet: every download fails, Crophalo still opens, the log names what failed, and nothing half-made counts as a tool',
    [s.port > 0, s.out.includes('the Python installer (uv) could not be downloaded'), text(offline.log).includes('download failed https://'), exists(path.join(offline.root, '.venv')), packedTools(offline.root).whole], [true, true, true, false, []]);
}

// ---- 10 · packing the tools for both kinds of Mac
async function packing() {
  const c = makeFolder({ tools: false }), pack = path.join(c.root, 'scripts', 'pack-runtimes.sh');
  repin(c, webFiles(c, [ARCH, OTHER]));
  const otherNode = path.join(c.web, 'files', `node-v${NODE_VER}-darwin-${OTHER === 'arm64' ? 'arm64' : 'x64'}.tar.gz`), held = otherNode + '.held';
  fs.renameSync(otherNode, held);
  let r = await once(c, [], {}, pack);
  same('packing: a dropped download stops with the place it stopped at, and this Mac\'s own kind is already whole', [r.code, /Stopped at: Node for (Apple chip|Intel) Macs\./.test(r.out), packedTools(c.root).whole], [1, true, [ARCH]]);
  fs.renameSync(held, otherNode);
  r = await once(c, [], {}, pack);
  same('packing: run again it carries on, asks only for what is missing, and ends with both kinds of Mac whole', [r.code, r.out.includes(`Node ${NODE_VER} for ${ARCH === 'arm64' ? 'Apple chip' : 'Intel'} Macs`), /\nPacked: \S+ in runtime\/\./.test('\n' + r.out), packedTools(c.root).whole, exists(path.join(c.rt, 'downloads'))], [0, false, true, ['arm64', 'x86_64'], false]);
  r = await once(c, [], {}, pack);
  same('packing: a third run finds everything there and fetches nothing', [r.code, r.out.trim().split('\n').length], [0, 1]);
}

// ---- 11 · the NASA login: asked only in a terminal, written with the right quotes, never shown, never logged
async function logins() {
  const c = makeFolder(), P = await freePorts(), ASK = /NASA Earthdata username: /, PASS = /Password \(it does not show while you type\): /, WHERE = /Type 1 or 2, then Return \(Return alone means 1\): /;
  const folderLogin = path.join(c.root, '.secrets', 'earthdata.netrc'), homeLogin = path.join(c.home, '.netrc'), skipped = path.join(c.rt, 'earthdata-skipped'), screens = [];
  const typed = async (args, keys, during, last) => { const s = await terminal(c, [...args, '--port', P], keys, during, last); screens.push(s.out); return s; };

  let s = await start(c, ['--no-open', '--port', P]); await stop(s);
  check('no terminal: with no login and no terminal the start does not ask, does not wait and does not count it as skipped', s.port === P && !ASK.test(s.out) && !exists(skipped), s.out);
  s = await start(c, ['--no-open', '--login', '--port', P]); await stop(s);
  check('no terminal: --login says the login can only be typed in a Terminal window, and Crophalo still starts', s.port === P && !ASK.test(s.out) && s.out.includes('The NASA login can only be typed in a Terminal window: double-click Start Crophalo.command.'), s.out);
  s = await typed(['--no-login'], []);
  check('in a terminal: --no-login never asks', s.port === P && !ASK.test(s.out), s.out);
  // Only a whole login counts: a comment that names NASA, or an entry with no password, would leave the five satellite parts empty without a word.
  put(homeLogin, '# Set up urs.earthdata.nasa.gov later\n', 0o600); put(folderLogin, 'machine urs.earthdata.nasa.gov login user1\n', 0o600);
  s = await typed([], [[ASK, USER + '\n'], [PASS, '\n']]);
  check('in a terminal: a comment naming NASA at home and a folder entry with no password are no login, so the start still asks',
    s.port === P && !s.stuck && s.out.includes('No password was typed, so nothing was saved.') && !exists(skipped), s.stuck || s.out);
  fs.rmSync(homeLogin); fs.rmSync(path.dirname(folderLogin), { recursive: true });
  s = await typed([], [[ASK, '\n']]);
  check('in a terminal: with no login the start asks once, names the five products and the free sign-up page; Return skips',
    s.port === P && ['SMAP', 'GRACE-FO', 'ECOSTRESS', 'HLS', 'GEDI', 'https://urs.earthdata.nasa.gov/users/new'].every(w => s.out.includes(w)) && s.out.includes('Skipped. To add the login later: sh "') && exists(skipped), s.stuck || s.out);
  s = await typed([], []);
  check('in a terminal: after a skip the next start does not ask again', s.port === P && !ASK.test(s.out), s.out);
  s = await typed(['--login'], [[ASK, USER + '\n'], [PASS, '\n']]);
  check('in a terminal: a username with no password saves nothing', s.port === P && s.out.includes('No password was typed, so nothing was saved.') && !exists(folderLogin) && !exists(homeLogin), s.stuck || s.out);

  let seen = null;
  s = await typed(['--login'], [[ASK, USER + '\n'], [PASS, WORD + '\n'], [WHERE, '2\n']], async run => { seen = await health(run.port); });
  same('login in the folder: the line reads back as the typed words, in a file only the owner can read, in a folder only the owner can open',
    [s.stuck, parseNetrc(text(folderLogin)), mode(folderLogin), mode(path.dirname(folderLogin)), fs.readdirSync(path.dirname(folderLogin))], [undefined, { login: USER, password: WORD }, 0o600, 0o700, ['earthdata.netrc']]);
  same('login in the folder: the start says where it is kept, the server finds it there, and the skip mark is gone',
    [s.out.includes('Saved inside the Crophalo folder (.secrets), so it moves with the folder.'), seen?.netrc, seen?.login, exists(skipped), exists(homeLogin)], [true, true, 'folder', false, false]);

  put(homeLogin, 'machine other.example login someone password something\n', 0o600);
  s = await typed(['--login'], [[ASK, USER + '\n'], [PASS, WORD + '\n'], [WHERE, '\n']], async run => { seen = await health(run.port); });
  same('login in the home folder: Return alone means ~/.netrc; another service\'s line stays, the older login in the folder is removed so it cannot hide this one',
    [s.stuck, rows(homeLogin)[0], parseNetrc(text(homeLogin)), mode(homeLogin), exists(folderLogin), seen?.login, s.out.includes('Saved in your home folder (~/.netrc), so it stays on this Mac.')],
    [undefined, 'machine other.example login someone password something', { login: USER, password: WORD }, 0o600, false, 'home', true]);

  // another service on the SAME line as the old NASA entry, quoted words and the owner's comments: all of it stays; only the NASA words go
  const mixed = 'machine urs.earthdata.nasa.gov login user1 password pw1-old machine other.example login "user 1" password "pw1 other" # kept\n# the owner\'s own words\n';
  put(homeLogin, mixed, 0o600);
  s = await typed(['--login'], [[ASK, USER + '\n'], [PASS, WORD + '\n'], [WHERE, '\n']]);
  same('a new NASA login in a ~/.netrc whose NASA entry shares its line with another service: that service, its quotes and the comments stay as written',
    [s.stuck, rows(homeLogin).slice(0, 2), parseNetrc(text(homeLogin), 'other.example'), parseNetrc(text(homeLogin)), rows(homeLogin).length, text(homeLogin).includes('pw1-old')],
    [undefined, ['machine other.example login "user 1" password "pw1 other" # kept', '# the owner\'s own words'], { login: 'user 1', password: 'pw1 other' }, { login: USER, password: WORD }, 3, false]);

  const real = path.join(c.base, 'kept elsewhere', 'netrc'); put(real, 'machine other.example login someone password something\n', 0o600);
  fs.rmSync(homeLogin); fs.symlinkSync(path.join('..', 'kept elsewhere', 'netrc'), homeLogin);
  s = await typed(['--login'], [[ASK, USER + '\n'], [PASS, WORD + '\n'], [WHERE, '1\n']]);
  same('a ~/.netrc that is a link: it stays a link, and the login is written into the file it leads to',
    [s.stuck, fs.lstatSync(homeLogin).isSymbolicLink(), rows(real).length, parseNetrc(text(real)), mode(real), fs.readdirSync(c.home)], [undefined, true, 2, { login: USER, password: WORD }, 0o600, ['.netrc']]);

  // --login (the "Add NASA login" starter) while this folder's Crophalo runs: the login is asked and saved, and no second server starts
  const first = await start(c, ['--no-open', '--no-login', '--port', P]), ALREADY = /Crophalo is already running from this folder: http:\/\/localhost:\d+\//;
  s = await typed(['--login'], [[ASK, USER + '\n'], [PASS, WORD + '\n'], [WHERE, '1\n']], undefined, ALREADY);
  const still = await health(P), ofThisFolder = (await Promise.all(Array.from({ length: 50 }, (_, i) => health(P + i)))).filter(h => h?.root === c.root).length;   // the start's whole port range; other programs' servers do not count
  same('--login while Crophalo runs from this folder: it asks, saves the login, says Crophalo is already running and starts no second server',
    [first.port, s.stuck, s.ended, s.out.includes('Saved in your home folder (~/.netrc), so it stays on this Mac.'), parseNetrc(text(real)), still?.root, ofThisFolder, first.gone, RUNNING.test(s.out), text(path.join(c.rt, 'last-port'))],
    [P, undefined, true, true, { login: USER, password: WORD }, c.root, 1, false, false, `${P}\n`]);
  check('--login while Crophalo runs: the start says the running Crophalo uses the new login from its next lookup', s.out.includes('The running Crophalo uses this login from its next lookup.'), s.out);
  s = await once(c, ['--no-open', '--login', '--port', P]);
  same('--login with no terminal while Crophalo runs: it says where the login can be typed, then that Crophalo already runs, and ends',
    [s.code, s.out.trim().split('\n')], [0, ['The NASA login can only be typed in a Terminal window: double-click Start Crophalo.command.', `Crophalo is already running from this folder: http://localhost:${P}/`]]);
  await stop(first);

  const shown = screens.join('\n');
  check('the screen: the questions were shown (so the screen was really read), and the password never was', ASK.test(shown) && PASS.test(shown) && !shown.includes(WORD) && !shown.includes('pw1'), shown.match(/.*pw1.*/)?.[0]);
  const holds = [];
  (function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.isFile() && [WORD, 'pw1 \\"q'].some(w => fs.readFileSync(p).includes(w))) holds.push(p); } })(c.root);   // as typed, and as a netrc file writes it
  same('the folder: after all of this no file in it holds the password (it now lives only where the owner chose last)', holds, []);
  check('the log: it says only that a login was saved and where, never the username or the password', /earthdata login saved \(folder\)/.test(text(c.log)) && /earthdata login saved \(home\)/.test(text(c.log)) && /earthdata login skipped/.test(text(c.log)) && !text(c.log).includes(USER) && !text(c.log).includes('pw1'));
}

// ---- the run
const marks = () => {   // names, sizes and times only, of what this suite must never touch; .cache and the rest of the project may change under a running Crophalo or another editor
  const out = [], stat = p => { try { const s = fs.lstatSync(p); return `${p} ${s.size} ${s.mtimeMs}`; } catch { return `${p} absent`; } };
  const walk = dir => { let names = []; try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; } for (const e of names) { const p = path.join(dir, e.name); out.push(stat(p)); if (e.isDirectory()) walk(p); } };
  walk(path.join(PROJECT, 'runtime'));
  for (const p of ['.venv', '.venv/crophalo-venv.txt', '.venv/pyvenv.cfg', '.secrets', '.secrets/earthdata.netrc']) out.push(stat(path.join(PROJECT, p)));
  for (const p of ['.netrc', '.netrc.part', '.cache/uv', '.local/share/uv']) out.push(stat(path.join(os.homedir(), p)));
  return out.join('\n');
};
const STARTS_MAKE = /^(\.venv|runtime|\.cache|\.secrets|\.userdata|\.write-test.*|.*\.part)$/;   // what a start makes at the top of a folder; other files may be added by other work while the suite runs
const top = () => fs.readdirSync(PROJECT).filter(n => STARTS_MAKE.test(n)).sort();
const untouched = marks(), topBefore = top();
const watchdog = setTimeout(() => { console.log('FAIL  the suite did not finish in 8 minutes'); for (const k of kids) k.kill('SIGKILL'); process.exit(1); }, 480e3);
try {
  await group('what can be read', async () => reading());
  await group('the pure parts of the doctor', async () => doctorParts());
  await group('the browser checks are never passed over in silence', browserChecks);
  await group('the Windows start, read', async () => windowsLogin());
  if (MAC) {
    UP = await services();
    await Promise.all([   // four lanes, each in its own folders and on its own ports
      group('the helpers of portable.sh', async () => shellHelpers()).then(() => group('the doctor', theDoctor)).then(() => group('packing', packing)),
      (async () => { let c; await group('the first start', async () => { c = await firstStarts(); }); if (c) await group('the fingerprint', () => fingerprint(c)); })(),
      group('the ports', thePorts).then(() => group('what stops a start', refusals)).then(() => group('downloads', downloads)),
      group('the NASA login', logins).then(() => group('two folders, one cache', sharedCache)),
    ]);
  } else console.log('note  the Mac start (shell) is checked on a Mac only; here only the parts written for Node ran');
} finally {
  clearTimeout(watchdog);
  for (const k of kids) k.kill('SIGTERM');   // only what this suite started, each by its own process number
  UP?.server.close();
  const left = [];
  for (const port of ports) {   // a server that outlived its start is stopped here by its process number; it is this suite's own only when it serves this suite's temp folder
    const h = await health(port); if (!h?.cache?.startsWith(TMP)) continue;
    left.push(port);
    for (const pid of spawnSync('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)) process.kill(+pid, 'SIGTERM');
  }
  same('no server of this suite is left running', left, []);
  same('this folder: its runtime/, .venv and login, and the real home\'s login and uv folders, are as they were', marks() === untouched, true);
  same('this folder: nothing a start makes was added at its top', top(), topBefore);
  for (const dir of fs.readdirSync(TMP)) if (exists(path.join(TMP, dir, 'Crophalo'))) fs.chmodSync(path.join(TMP, dir, 'Crophalo'), 0o755);   // a folder a check made read-only must go too
  fs.rmSync(TMP, { recursive: true, force: true });   // this suite's own temp folder, nothing else
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
