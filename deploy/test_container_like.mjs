// The data server the way Azure Container Apps will run it, on a computer without Docker: a copy of the repository with exactly what .dockerignore leaves out of
// the image left out, started by scripts/start.sh with the image's settings and the ones Container Apps adds (its app name, its DNS suffix, the target port),
// then asked what a browser on the website's own name would ask. Checks: start.sh takes the target port; health and ready answer; the pages are not there and the push
// addresses are (min and max replicas 1 with the Azure Files share keep them); the website's own address may read the answers and ask before a POST, another website may not; the server answers on the names it
// is given and refuses others; the security headers are on. Never the NASA login: an empty home and no EARTHDATA_ setting. Port 5932 only; stopped by its PID.
// Use: node deploy/test_container_like.mjs <repository folder>       (the repository with the website-on-its-own-name changes in it)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const repo = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(repo, 'scripts', 'serve.mjs')) || !fs.existsSync(path.join(repo, '.dockerignore'))) { console.error('Use: node deploy/test_container_like.mjs <repository folder with scripts/serve.mjs and .dockerignore>'); process.exit(2); }
let passed = 0, failed = 0;
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }

// ---- .dockerignore, the simple forms it uses: a name or path from the top, **/ for any folder, * within one name
export function ignoreRule(lines) {
  const res = lines.map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(p => {
    const body = p.replace(/\/+$/, '').split('/').map(part => part === '**' ? '\u0000' : part.replace(/[.+^$()|[\]\\{}]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')).join('/').replace(/\u0000\//g, '(?:.*/)?');
    return new RegExp(`^${body}(?:/.*)?$`);
  });
  return rel => res.some(re => re.test(rel));
}
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-container-')), app = path.join(TMP, 'app'), home = path.join(TMP, 'home'), cache = path.join(TMP, 'cache');
fs.mkdirSync(home); fs.mkdirSync(cache);
const ignored = ignoreRule(fs.readFileSync(path.join(repo, '.dockerignore'), 'utf8').split('\n'));
(function copy(rel = '') {
  for (const e of fs.readdirSync(path.join(repo, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (ignored(r)) continue;
    if (e.isDirectory()) { fs.mkdirSync(path.join(app, r), { recursive: true }); copy(r); } else if (e.isFile()) { fs.mkdirSync(path.dirname(path.join(app, r)), { recursive: true }); fs.copyFileSync(path.join(repo, r), path.join(app, r)); }
  }
})();
check('the image keeps the server and its lookups', ['scripts/serve.mjs', 'scripts/start.sh', 'scripts/requirements.txt', 'scripts/live'].every(f => fs.existsSync(path.join(app, f))));
check('the image leaves out the history, the secrets and this computer\'s runtimes', ['.git', '.secrets', '.venv', 'runtime', '.cache'].every(f => !fs.existsSync(path.join(app, f))));
// The Python of the image is at .venv/bin/python; here a stand-in answers the server's one start check as a Python with its libraries would (no lookup is asked in this check).
// The server now runs that check once at start instead of only looking for the file, so a stand-in that does not answer it would rightly make ready say 503.
fs.mkdirSync(path.join(app, '.venv', 'bin'), { recursive: true }); fs.writeFileSync(path.join(app, '.venv', 'bin', 'python'), '#!/bin/sh\necho CROPHALO_PY\necho \'{"crophalo_python": "3.12.0", "certifi": ""}\'\n'); fs.chmodSync(path.join(app, '.venv', 'bin', 'python'), 0o755);

const SITE = 'https://site.example.org', API = 'api.example.org', AZURE = 'crophalo-api.calm-sky-1234.canadacentral.azurecontainerapps.io', PORT = 5932;
const env = {   // the Dockerfile's settings, then the ones Container Apps adds, then the owner's two (the login is never given here)
  PATH: process.env.PATH, HOME: home, HOST: '127.0.0.1', FW_FORCE_PUBLIC: '1', FW_CACHE: cache, TRUST_PROXY_HOPS: '1', PYTHONDONTWRITEBYTECODE: '1', PYTHONUNBUFFERED: '1',
  CONTAINER_APP_NAME: 'crophalo-api', CONTAINER_APP_ENV_DNS_SUFFIX: AZURE.slice('crophalo-api.'.length), CONTAINER_APP_PORT: String(PORT), CONTAINER_APP_REVISION: 'crophalo-api--r1',
  ALLOWED_ORIGINS: `${SITE} https://www.site.example.org`, ALLOWED_HOSTS: API,
};
const server = spawn('sh', [path.join(app, 'scripts', 'start.sh')], { cwd: app, env, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
let log = ''; server.stdout.on('data', d => { log += d; }); server.stderr.on('data', d => { log += d; });
const ask = (pathname, { method = 'GET', headers = {} } = {}) => new Promise(done => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method, headers: { connection: 'close', ...headers } }, res => { let body = ''; res.on('data', c => { body += c; }); res.on('end', () => done({ status: res.statusCode, headers: res.headers, body })); });
  req.on('error', e => done({ status: 0, headers: {}, body: e.message })); req.end();
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 50 && !/Crophalo on http/.test(log); i++) await sleep(100);
  check('start.sh starts the server on the target port Container Apps gives (no PORT set)', new RegExp(`Crophalo on http://127\\.0\\.0\\.1:${PORT} \\(public\\)`).test(log), log.trim());
  for (let i = 0; i < 100 && (await ask('/api/ready')).status !== 200; i++) await sleep(100);   // the start check of Python takes a moment
  const health = await ask('/api/health'), h = (() => { try { return JSON.parse(health.body); } catch { return {}; } })();
  check('health answers, with the Python tools, and never says where its folders or a login are', health.status === 200 && h.ok === true && h.python === true && !('root' in h) && !('login' in h) && !health.body.includes(TMP), health.body);
  check('ready answers 200', (await ask('/api/ready')).status === 200);
  check('the pages are not handed out by the data server', (await ask('/index.html')).status === 404 && (await ask('/js/app.js')).status === 404);
  const key = await ask('/api/push/key', { headers: { origin: SITE, host: API } });
  check('the push key is handed out (push is in the image)', key.status === 200 && /"key"/.test(key.body), `${key.status}`);
  const mine = await ask('/api/sources', { headers: { origin: SITE, host: API } });
  check('the website\'s own pages may read the answers', mine.status === 200 && mine.headers['access-control-allow-origin'] === SITE, `${mine.status} ${mine.headers['access-control-allow-origin']}`);
  check('answers that depend on the page say so to caches (vary: origin)', /origin/.test(mine.headers.vary || ''), mine.headers.vary);
  const other = await ask('/api/sources', { headers: { origin: 'https://evil.example', host: API } });
  check('another website\'s pages are refused and get no permission to read', other.status === 403 && !other.headers['access-control-allow-origin'], `${other.status}`);
  const pre = await ask('/api/sources', { method: 'OPTIONS', headers: { origin: SITE, host: API, 'access-control-request-method': 'GET' } });
  check('the browser\'s question first (OPTIONS) from the website: yes', pre.status === 204 && pre.headers['access-control-allow-origin'] === SITE, `${pre.status}`);
  const preNo = await ask('/api/sources', { method: 'OPTIONS', headers: { origin: 'https://evil.example', host: API, 'access-control-request-method': 'GET' } });
  check('...from another website: no', preNo.status === 403 && !preNo.headers['access-control-allow-origin'], `${preNo.status}`);
  check('the server answers on its own name (ALLOWED_HOSTS) and on the name Container Apps gives it', (await ask('/api/sources', { headers: { host: API } })).status === 200 && (await ask('/api/sources', { headers: { host: AZURE } })).status === 200);
  check('...and refuses a name it was not given', (await ask('/api/sources', { headers: { host: 'not-this.example' } })).status === 403);
  const hdr = health.headers;
  check('the security headers are on, HTTPS-only included', ['x-content-type-options', 'referrer-policy', 'x-frame-options', 'permissions-policy', 'content-security-policy', 'strict-transport-security'].every(n => hdr[n]));
  check('nothing about the home folder or a login in the log', !log.includes(home) && !/password|netrc/i.test(log), log.trim());
} finally {
  try { process.kill(server.pid, 'SIGTERM'); } catch { /* gone */ }
  await sleep(500);
  fs.rmSync(TMP, { recursive: true, force: true });
}
console.log(`container-like: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
