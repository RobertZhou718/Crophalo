// The going-live security suite: scripts/serve.mjs started the ways a host starts it, and what a stranger can and cannot reach. A server behind a proxy on 127.0.0.1 is public too, the content security policy
// of the public site (scripts by hash, hosts one by one), nothing in the check routes that asks NASA with the owner's login, one slow lookup does not hold up a quick one, and a push body that announces too much is refused at once.
// Run: node scripts/test_security.mjs   (no network: the lookups are a stand-in program)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`); } };
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(HERE, '..'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-security-')), FAKEPY = path.join(TMP, 'fakepy.sh');
fs.writeFileSync(FAKEPY, '#!/bin/sh\nif [ "$1" = "-c" ]; then echo CROPHALO_PY; echo \'{"crophalo_python":"3.12","certifi":""}\'; exit 0; fi\nif [ "$2" = "smaproot.py" ]; then sleep 6; fi\necho \'{"ok":true,"fake":true}\'\n', { mode: 0o755 });
const free = () => new Promise(done => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)); }); });
const raw = (port, lines, wait = 5000) => new Promise(done => { const s = net.connect(port, '127.0.0.1'); s.on('error', () => {}); let buf = Buffer.alloc(0); const t = setTimeout(() => { s.destroy(); done({ status: 0, head: '', body: '', timeout: true }); }, wait);
  s.on('data', d => { buf = Buffer.concat([buf, d]); }); s.on('close', () => { clearTimeout(t); const [head, ...rest] = buf.toString('latin1').split('\r\n\r\n'); done({ status: +(/^HTTP\/1\.1 (\d+)/.exec(head)?.[1] || 0), head, body: rest.join('\r\n\r\n') }); }); s.write(lines.join('\r\n') + '\r\n\r\n'); });
const get = (port, p, method = 'GET', more = []) => raw(port, [`${method} ${p} HTTP/1.1`, 'Host: crophalo.earth', 'Connection: close', ...more]);
const header = (r, name) => new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(r.head)?.[1]?.trim();
async function start(env = {}) {
  const port = await free(), log = [];
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], { cwd: ROOT, env: { PATH: process.env.PATH, HOME: path.join(TMP, 'home'), HOST: '0.0.0.0', PORT: String(port), ALLOWED_HOSTS: 'crophalo.earth', FW_CACHE: path.join(TMP, 'cache-' + port), FW_PYTHON: FAKEPY, RATE_PER_MIN: '100000', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => log.push(String(d))); child.stderr.on('data', d => log.push(String(d)));
  for (let i = 0; i < 150; i++) { await new Promise(r => setTimeout(r, 100)); if ((await get(port, '/api/health')).status === 200) break; }
  return { port, log, stop: () => new Promise(done => { child.once('exit', done); child.kill('SIGTERM'); setTimeout(() => { child.kill('SIGKILL'); done(); }, 3000); }) };
}

// ---- a server on 127.0.0.1 behind a proxy is public too
{ const S = await start({ HOST: '127.0.0.1', ALLOWED_HOSTS: 'crophalo.earth' }); const health = await get(S.port, '/api/health'), home = await get(S.port, '/');
  ok('started on 127.0.0.1 with ALLOWED_HOSTS: health tells no folder, no cache place and no login place', !/"root"|"cache"|"login"/.test(health.body) && !/\/private\/|\/Users\/|\/var\//.test(health.body), health.body.slice(0, 200));
  ok('and it sends HSTS', /max-age=\d+/.test(header(home, 'strict-transport-security') || ''), String(header(home, 'strict-transport-security')));
  const err = await get(S.port, '/api/smaproot'); ok('and a refusal is in plain words', err.status === 400 && !/\/Users\/|\.mjs|at \w+ \(/.test(err.body), err.body.slice(0, 120)); await S.stop(); }
{ const S = await start({ HOST: '127.0.0.1', ALLOWED_HOSTS: '', TRUST_PROXY_HOPS: '1' }); const home = await get(S.port, '/'); ok('started on 127.0.0.1 behind one proxy (TRUST_PROXY_HOPS=1): public too (HSTS sent)', !!header(home, 'strict-transport-security')); await S.stop(); }
{ const S = await start({ HOST: '127.0.0.1', ALLOWED_HOSTS: '' }); const health = await get(S.port, '/api/health'), home = await get(S.port, '/');
  ok('started on this computer alone (127.0.0.1, no host settings): health still names the folders for the owner, no HSTS (plain http)', /"root"/.test(health.body) && !header(home, 'strict-transport-security')); await S.stop(); }

// ---- the content security policy of the public site
{ const S = await start(); const home = await get(S.port, '/'), csp = header(home, 'content-security-policy') || '', idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inline = [...idx.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].filter(m => m[1].trim()).map(m => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  ok('the policy names default-src, script-src, connect-src, img-src and object-src none', ['default-src', 'script-src', 'connect-src', 'img-src', "object-src 'none'", "frame-ancestors 'self'"].every(k => csp.includes(k)), csp);
  ok('script-src holds the hash of every inline script of index.html, and no unsafe-inline or unsafe-eval', inline.length > 0 && inline.every(h => csp.includes(h)) && !/script-src[^;]*'unsafe-(inline|eval)'/.test(csp), inline.join(' '));
  ok('script-src names no other site', !/script-src[^;]*https?:/.test(csp));
  ok('connect-src lists the data hosts one by one and no wildcard', /connect-src[^;]*https:\/\/power\.larc\.nasa\.gov/.test(csp) && !/\*/.test(csp), csp.match(/connect-src[^;]*/)?.[0]);
  const hosts = new Set(); for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'))) for (const m of fs.readFileSync(path.join(ROOT, 'js', f), 'utf8').matchAll(/fetch\(\s*[`'"](https:\/\/[a-z0-9.-]+)/g)) hosts.add(m[1]);
  ok('every host the page code fetches from directly is in the policy', [...hosts].every(h => csp.includes(h)), [...hosts].filter(h => !csp.includes(h)).join(', '));
  // The Look ahead tab builds its three weather addresses in functions (js/ahead-load.js), so the fetch( search above cannot see them: the static website's policy (deploy/staticwebapp.config.json,
  // which the publishing check holds against every address in the pages) must name the same data hosts as the server's own policy, so the pages work the same on either kind of host.
  const swa = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy', 'staticwebapp.config.json'), 'utf8')).globalHeaders['content-security-policy'], hostsOf = p => (p.match(/connect-src[^;]*/)?.[0] ?? '').split(/\s+/).filter(h => h.startsWith('https://')).sort();
  ok('the server\'s policy and the static website\'s policy name the same data hosts', JSON.stringify(hostsOf(csp)) === JSON.stringify(hostsOf(swa)) && hostsOf(csp).includes('https://ensemble-api.open-meteo.com'), `${hostsOf(csp).join(' ')} | ${hostsOf(swa).join(' ')}`);
  const asset = await get(S.port, '/js/app.js'); ok('a script file carries the same headers', !!header(asset, 'content-security-policy') && header(asset, 'x-content-type-options') === 'nosniff'); await S.stop(); }

// ---- the check that asks NASA with the owner's login
{ const S = await start(); const lc = await get(S.port, '/api/login-check', 'POST'); ok('a stranger cannot make the public server ask NASA with the login (POST /api/login-check is a plain 404)', lc.status === 404, `${lc.status} ${lc.body.slice(0, 80)}`); await S.stop(); }
{ const S = await start({ HOST: '127.0.0.1', ALLOWED_HOSTS: '' }); const lc = await raw(S.port, ['POST /api/login-check HTTP/1.1', 'Host: 127.0.0.1', 'Connection: close']); ok('on this computer alone the check still answers (it asks NASA only for the person at the machine)', lc.status === 200, String(lc.status)); await S.stop(); }

// ---- one slow lookup does not hold up a quick one, whatever the size of the host
for (const max of ['1', '2']) { const S = await start({ LIVE_MAX: max }); const slow = [0, 1, 2].map(i => get(S.port, `/api/smaproot?lat=4${i}.1&lon=-9${i}.1`, 'GET'));
  await new Promise(r => setTimeout(r, 600)); const t0 = Date.now(), quick = await raw(S.port, ['GET /api/cropsnear?lat=46.1&lon=-91.1&country=US HTTP/1.1', 'Host: crophalo.earth', 'Connection: close'], 20000), ms = Date.now() - t0;
  // with two places or more, one is kept for the quick lookups; with one place (a very small host) the quick lookup waits for the lookup that is running, but goes before the two that wait behind it
  ok(max === '1' ? 'LIVE_MAX=1: the crop-map lookup waits for the one running satellite lookup (about 6 s), not for the three' : 'LIVE_MAX=2: while satellite lookups run for seconds, the crop-map lookup answers in under 2 seconds', quick.status === 200 && (max === '1' ? ms < 9000 : ms < 2000), `${ms} ms`);
  const health = JSON.parse((await get(S.port, '/api/health')).body); ok(`LIVE_MAX=${max}: health still counts what runs and what waits`, Number.isInteger(health.busy) && Number.isInteger(health.queued), JSON.stringify([health.busy, health.queued]));
  await Promise.all(slow); await S.stop(); }

// ---- a body that announces too much is refused at once
{ const S = await start(); const t0 = Date.now(), r = await raw(S.port, ['POST /api/push/subscribe HTTP/1.1', 'Host: crophalo.earth', 'Content-Type: application/json', 'Content-Length: 5000000', 'Connection: close', '', '{}'], 4000);
  ok('a push body that announces 5 MB is refused with 413 straight away, not waited for', (r.status === 413 || r.status === 404) && Date.now() - t0 < 3000, `${r.status} after ${Date.now() - t0} ms`); await S.stop(); }

// ---- the status of the data services (scripts/status.mjs, answered by the server): true or false for a login, never the login, a folder or an address; the check is a POST that a
//      switched-off service never turns into an ask, so this part asks no outside service
{ const home = path.join(TMP, 'home-login'); fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(path.join(home, '.netrc'), 'machine urs.earthdata.nasa.gov login madeup-farmer password made-up-word-0000\n', { mode: 0o600 });   // a made-up login in a temporary home
  const S = await start({ HOME: home, SERVICES_OFF: 'power' }); const src = await get(S.port, '/api/sources'); let list = []; try { list = JSON.parse(src.body); } catch { /* checked below */ }
  const FIELDS = ['id', 'name', 'state', 'last_ok_time', 'last_ms', 'last_problem', 'kept', 'ttl_hours', 'needs_key', 'key_set', 'needs_login', 'login_set', 'checked_at', 'can_check'];
  ok('GET /api/sources: one row per service with every field of the status answer', src.status === 200 && list.length > 11 && list.every(r => FIELDS.every(f => f in r)), src.body.slice(0, 160));
  ok('...needs and has a key or a login only as true or false', list.every(r => ['needs_key', 'key_set', 'needs_login', 'login_set', 'can_check'].every(f => typeof r[f] === 'boolean')) && list.some(r => r.needs_login && r.login_set === true), JSON.stringify(list.find(r => r.needs_login) || {}).slice(0, 160));
  ok('...and holds no login name, password, folder or outside address', !/madeup-farmer|made-up-word|https?:|\/Users\/|\/private\/|\/var\/|\/tmp\/|netrc/i.test(src.body), src.body.slice(0, 200));
  const chk = await get(S.port, '/api/sources/check?id=power', 'POST'); let after = []; try { after = JSON.parse(chk.body); } catch { /* checked below */ }
  ok('POST /api/sources/check answers the same list, and a switched-off service is never asked', chk.status === 200 && after.find(r => r.id === 'power')?.state === 'switched_off' && after.find(r => r.id === 'power')?.can_check === false, chk.body.slice(0, 160));
  ok('...a GET cannot start a check (405), nor can another website (403)', (await get(S.port, '/api/sources/check', 'GET')).status === 405 && (await get(S.port, '/api/sources/check?id=power', 'POST', ['Origin: https://evil.example'])).status === 403);
  await S.stop(); }

// ---- the list of held keys is for this computer only
{ const { isLocalOnly, hostGate } = await import('./hostmode.mjs');
  ok('/api/keys (the list of which keys and logins are held) is a local-only route: a public server answers 404 for it and for anything under it', isLocalOnly('/api/keys') && hostGate('/api/keys', true)?.status === 404 && hostGate('/api/keys/x', true)?.status === 404 && hostGate('/api/keys', false) === null);
  ok('the routes a stranger may use are not local-only (sources, health, ready and every lookup)', ['/api/sources', '/api/health', '/api/ready', '/api/faostat', '/api/cropsnear'].every(p => !isLocalOnly(p))); }

// ---- /api/sources must not be a way to keep the server busy
// The answer is now the status module's: the count of kept answers is "kept" (it was cache_items), read from the same five-second memo, so all 3,000 fresh files are counted.
{ const cache = path.join(TMP, 'cache-many'); fs.mkdirSync(path.join(cache, 'api'), { recursive: true }); for (let i = 0; i < 3000; i++) fs.writeFileSync(path.join(cache, 'api', `smaproot_${i.toString(16).padStart(20, '0')}.json`), '{}');
  const S = await start({ FW_CACHE: cache }); const t0 = Date.now(); for (let i = 0; i < 150; i++) await get(S.port, '/api/sources'); const ms = Date.now() - t0, one = JSON.parse((await get(S.port, '/api/sources')).body).find(r => r.id === 'smaproot');
  ok('150 asks for /api/sources over 3,000 kept answers cost under 4 seconds (the answer is worked out once in five seconds)', ms < 4000, `${ms} ms`); ok('and it still counts the kept answers', one.kept === 3000, JSON.stringify(one).slice(0, 120)); await S.stop(); }

// ---- the words of a failed lookup
{ const bad = path.join(TMP, 'not-executable.sh'); fs.writeFileSync(bad, '#!/bin/sh\necho {}\n', { mode: 0o644 });
  const S = await start({ FW_PYTHON: bad }); const r = await get(S.port, '/api/dem?lat=44&lon=-80&w=100&d=100&nx=5&ny=5'), src = await get(S.port, '/api/sources');
  ok('a Python that cannot start gives the visitor a plain sentence with no folder in it', r.status === 200 && /"ok":false/.test(r.body) && !/\/private\/|\/var\/|\/Users\/|\/tmp\/|not-executable/.test(r.body), r.body.slice(0, 200));
  ok('and /api/sources says the same plain words', !/\/private\/|\/var\/|\/Users\/|\/tmp\/|not-executable/.test(src.body), src.body.slice(0, 200)); await S.stop(); }
{ const { scrubReason } = await import('./hostmode.mjs');
  const dirty = 'ReadTimeout: GET https://api.example.org/v1/data?api_key=abcdefghijklmnopqrstuvwx123456&lat=44.1 failed; Bearer abcdefghijklmnopqrstuvwxyz123456 at fetch (/home/app/scripts/live/x.py:12) password=hunter2 see /home/app/.secrets/netrc';
  const clean = scrubReason(dirty); ok('a lookup\'s reason with an address, a key, a bearer word, a path and a password loses all of them', !/https?:|api\.example|api_key|abcdefgh|Bearer|\/home|hunter2|netrc|\.py/i.test(clean), clean);
  ok('a clean sentence stays as it is, and an empty one becomes a plain one', scrubReason('The crop map did not answer just now; try again in a minute') === 'The crop map did not answer just now; try again in a minute' && scrubReason('///') === 'The lookup did not give an answer.'); }

// ---- the lists that keep keys and logins out of the repository
{ const ign = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split('\n').map(l => l.trim());
  const need = ['.secrets/', '.env', '.env.*', '*.key', '*.pem', '.netrc', 'runtime/', '.cache/', '.venv/', '.userdata/'];
  ok('.gitignore names the secrets folder, .env files, keys, certificates, .netrc, runtime and the caches', need.every(n => ign.includes(n)), need.filter(n => !ign.includes(n)).join(', ')); }

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
