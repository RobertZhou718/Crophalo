// Crophalo's suite for GET /api/keys (scripts/keys.mjs, served by scripts/serve.mjs): which optional data keys and logins this server holds, as true or false only.
// Pure checks of keysStatus() on made-up folders, then one real server started from a throwaway copy of the server files, asked for /api/keys. The keys in it are made up; none is ever real.
// The server listens on TEST_PORT (the checks choose one, for example 6027) or, without it, on a free port the system gives. It is stopped by its PID.
// RULE: never loosen a check here without a written farming or legal reason beside it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { keysStatus, KEY_SETTINGS, secretsDir } from './keys.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-keys-')));
const folder = name => { const d = path.join(TMP, name); fs.mkdirSync(d, { recursive: true }); return d; };
const MADE_UP = { nass: 'made-up-nass-key-0001', ams: 'made-up-ams-key-0002', openet: 'made-up-openet-key-0003', metno: 'field.example.org contact@field.example.org' };
const put = (dir, name, value) => fs.writeFileSync(path.join(dir, name), value + '\n', { mode: 0o600 });
const NO = { ok: true, nass: false, ams: false, openet: false, openetOn: false, metno: false, earthdata: false };

try {
  // ---- keysStatus(), pure apart from looking at files
  const emptyHome = folder('home'), root = folder('root');
  same('the five settings, each with the file name to use first', Object.fromEntries(Object.entries(KEY_SETTINGS).map(([k, v]) => [k, v[0][0]])), { nass: 'nass-quickstats.key', ams: 'ams-marketnews.key', openet: 'openet.key', openetOn: 'openet-on', metno: 'metno-identity' });
  same('the folder\'s own .secrets, unless CROPHALO_SECRETS_DIR says otherwise', [secretsDir(root, {}), secretsDir(root, { CROPHALO_SECRETS_DIR: '/x/y' })], [path.join(root, '.secrets'), path.resolve('/x/y')]);
  same('nothing set: every answer is no', keysStatus(root, {}, emptyHome), NO);
  const s1 = folder('s1'); put(s1, 'nass-quickstats.key', MADE_UP.nass); put(s1, 'openet.key', MADE_UP.openet); put(s1, 'metno-identity', MADE_UP.metno);
  same('NASS yes; OpenET no without its switch; the world forecast yes', keysStatus(root, { CROPHALO_SECRETS_DIR: s1 }, emptyHome), { ...NO, nass: true, metno: true });
  put(s1, 'openet-on', 'yes');
  same('OpenET yes with the key AND the switch', keysStatus(root, { CROPHALO_SECRETS_DIR: s1 }, emptyHome), { ...NO, nass: true, openet: true, openetOn: true, metno: true });
  put(s1, 'openet-on', 'maybe');
  same('a switch file that does not say yes is not a yes', keysStatus(root, { CROPHALO_SECRETS_DIR: s1 }, emptyHome).openet, false);
  const s2 = folder('s2'); put(s2, 'nass-key', MADE_UP.nass); put(s2, 'ams-key', MADE_UP.ams);
  same('a key saved under the older file names still counts', keysStatus(root, { CROPHALO_SECRETS_DIR: s2 }, emptyHome), { ...NO, nass: true, ams: true });
  const s3 = folder('s3'); fs.writeFileSync(path.join(s3, 'ams-marketnews.key'), '');
  same('an empty file is no key', keysStatus(root, { CROPHALO_SECRETS_DIR: s3 }, emptyHome).ams, false);
  same('the host\'s secret settings count as well as the files', keysStatus(root, { CROPHALO_SECRETS_DIR: s3, CROPHALO_AMS_KEY: MADE_UP.ams, CROPHALO_OPENET_KEY: MADE_UP.openet, CROPHALO_OPENET_ON: 'YES' }, emptyHome), { ...NO, ams: true, openet: true, openetOn: true });
  const r2 = folder('root2'); fs.mkdirSync(path.join(r2, '.secrets')); put(path.join(r2, '.secrets'), 'earthdata.netrc', 'machine urs.earthdata.nasa.gov login made-up-user password made-up-word');
  same('the NASA Earthdata login in the folder counts as yes', keysStatus(r2, {}, emptyHome).earthdata, true);
  same('and in the host\'s settings', keysStatus(root, { EARTHDATA_USERNAME: 'made-up-user', EARTHDATA_PASSWORD: 'made-up-word' }, emptyHome).earthdata, true);
  const every = JSON.stringify([keysStatus(root, { CROPHALO_SECRETS_DIR: s1 }, emptyHome), keysStatus(r2, {}, emptyHome)]);
  check('an answer never holds a key, a login or any part of one', !Object.values(MADE_UP).concat('made-up-user', 'made-up-word').some(v => every.includes(v)));

  // ---- the route on a real server, from a throwaway copy of the server's files
  const site = folder('site'); fs.mkdirSync(path.join(site, 'scripts'));
  for (const f of ['serve.mjs', 'earthdata.mjs', 'hostmode.mjs', 'status.mjs', 'keys.mjs', 'mnargs.mjs']) fs.copyFileSync(path.join(HERE, f), path.join(site, 'scripts', f));
  fs.writeFileSync(path.join(site, 'index.html'), '<!doctype html><title>t</title>');
  const sec = path.join(site, '.secrets'); fs.mkdirSync(sec, { mode: 0o700 }); put(sec, 'nass-quickstats.key', MADE_UP.nass); put(sec, 'openet.key', MADE_UP.openet);
  const env = { PATH: process.env.PATH, HOME: emptyHome, USERPROFILE: emptyHome, PORT: process.env.TEST_PORT || '0', HOST: '127.0.0.1', FW_CACHE: folder('cache'), FW_PYTHON: path.join(TMP, 'no-python') };
  const server = spawn(process.execPath, [path.join(site, 'scripts', 'serve.mjs')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  server.stdout.on('data', b => { out += b; }); server.stderr.on('data', b => { out += b; });
  const port = await new Promise((done, bad) => {
    const t = setTimeout(() => bad(new Error('the server did not start in 10 s: ' + out)), 10e3);
    const look = () => { const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out); if (m) { clearTimeout(t); done(+m[1]); } };
    server.stdout.on('data', look); server.on('exit', () => { clearTimeout(t); bad(new Error('the server stopped: ' + out)); });
  });
  const ask = (pathName, method = 'GET', headers = {}) => new Promise((done, bad) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathName, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, res => { let body = ''; res.on('data', b => { body += b; }); res.on('end', () => done({ status: res.statusCode, headers: res.headers, body })); });
    req.on('error', bad); req.end();
  });
  try {
    const r = await ask('/api/keys');
    same('/api/keys: 200 and JSON', [r.status, r.headers['content-type']], [200, 'application/json']);
    same('it says which keys are set, as true or false only', JSON.parse(r.body), { ...NO, nass: true });
    check('it never holds a key', !Object.values(MADE_UP).some(v => r.body.includes(v)));
    same('it is never stored, so a key typed a minute ago counts at once', r.headers['cache-control'], 'no-store');
    put(sec, 'ams-marketnews.key', MADE_UP.ams);
    same('a key added while the server runs counts at the next ask', JSON.parse((await ask('/api/keys')).body).ams, true);
    same('POST: 405, GET only', (await ask('/api/keys', 'POST')).status, 405);
    same('another website may not ask it', (await ask('/api/keys', 'GET', { origin: 'https://evil.example' })).status, 403);
    check('the server printed no key', !Object.values(MADE_UP).some(v => out.includes(v)), out);
  } finally {
    server.kill('SIGTERM');
    await new Promise(done => { if (server.exitCode != null || server.signalCode) done(); else server.once('exit', done); });
  }
} catch (e) {
  check('the suite ran to its end', false, String(e?.stack ?? e));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`keys route: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
