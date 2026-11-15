// Crophalo's suite for the website on one name and the data server on another (ALLOWED_ORIGINS): which pages may read the answers, the browser's question before a POST, the refusals, nothing changed when unset.
// The pure rules of scripts/hostmode.mjs, then real requests to server copies it starts from a throwaway folder: an empty home, no NASA login, no Python. Ports: TEST_PORT and the next three, else free ones; each stopped by its process number.
// RULE: never loosen a check here without a written reason beside it. A page of another website that could read these answers could use the satellite server,
// and its NASA login, as its own. Run: node scripts/test_cors.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as M from './hostmode.mjs';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } return !!ok; }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
async function group(name, run) { try { await run(); } catch (e) { check(`${name}: ran to its end`, false, e?.message || String(e)); } }

const SITE_A = 'https://site.example.test', LOCAL_PAGE = 'http://127.0.0.1:5931', EVIL = 'https://evil.example';   // made-up names: nothing is ever asked of them

// ---- the pure rules
same('an address as a browser writes it: lower case, no slash at the end, the usual port left out', ['HTTPS://Site.Example.TEST/', 'https://site.example.test:443', 'https://site.example.test:8443', 'http://127.0.0.1:5931', 'http://localhost', 'http://[::1]:5931'].map(M.cleanSiteOrigin),
  [SITE_A, SITE_A, 'https://site.example.test:8443', LOCAL_PAGE, 'http://localhost', 'http://[::1]:5931']);
same('never an address: plain http to another computer, a path, a login, a star, a query, a bad name or port, "null"', ['http://site.example.test', 'https://site.example.test/app', 'https://u@site.example.test', 'https://*.example.test', 'https://site.example.test?x', 'https://-x.test', 'https://site.example.test:0', 'null', ''].map(M.cleanSiteOrigin), Array(9).fill(''));
{
  const o = M.siteOrigins({ ALLOWED_ORIGINS: ` ${SITE_A}, https://www.site.example.test  ${LOCAL_PAGE}/ ,${SITE_A}` });
  same('ALLOWED_ORIGINS: comma or space between, each once, clean', o, { list: [SITE_A, 'https://www.site.example.test', LOCAL_PAGE], refused: [] });
  same('a star is never taken, nor an address that is not one: they are left out and named', M.siteOrigins({ ALLOWED_ORIGINS: `*, ${SITE_A}, http://evil.example, https://ok.example.test/path, https://*.example.test` }), { list: [SITE_A], refused: ['*', 'http://evil.example', 'https://ok.example.test/path', 'https://*.example.test'] });
  same('no setting: no address', M.siteOrigins({}), { list: [], refused: [] });
  const list = o.list;
  same('allowed: exactly the listed pages', [SITE_A, 'HTTPS://SITE.EXAMPLE.TEST', `${SITE_A}.evil.example`, `${SITE_A}:8443`, EVIL, 'null', '', undefined].map(x => M.originAllowed(x, list)), [true, true, false, false, false, false, false, false]);
  same('the header: the page\'s own address back, never a star, nothing for another page', [M.corsHeaders(SITE_A, list), M.corsHeaders(EVIL, list), M.corsHeaders(undefined, list), M.corsHeaders(SITE_A, [])], [{ 'access-control-allow-origin': SITE_A }, {}, {}, {}]);
  const yes = M.preflight('/api/push/subscribe', SITE_A, 'POST', 'Content-Type', list);
  same('the question before a POST of JSON, from the site: yes, for an hour at most a tenth', [yes.status, yes.headers['access-control-allow-origin'], yes.headers['access-control-allow-methods'], yes.headers['access-control-allow-headers'], yes.headers['access-control-max-age']], [204, SITE_A, 'GET, POST', 'content-type', '600']);
  same('the same question from another site, for another method, or with another header: no', [M.preflight('/api/push/subscribe', EVIL, 'POST', 'content-type', list).status, M.preflight('/api/push/subscribe', SITE_A, 'DELETE', '', list).status, M.preflight('/api/push/subscribe', SITE_A, 'POST', 'content-type, x-token', list).status, M.preflight('/api/smaproot', SITE_A, 'POST', '', list).status, M.preflight('/api/smaproot', SITE_A, 'GET', '', list).status], [403, 403, 403, 403, 204]);
  check('a "no" never lets the page read anything', !('access-control-allow-origin' in M.preflight('/api/x', EVIL, 'GET', '', list).headers));
  same('the vary header names the asking page only when pages from another name are allowed', [M.securityHeaders(true, { cors: true }).vary, M.securityHeaders(true).vary, M.securityHeaders(false).vary], ['accept-encoding, origin', 'accept-encoding', 'accept-encoding']);
}
same('the names the server answers on: Render\'s, Azure Container Apps\' (app name + its environment\'s DNS suffix), then the listed ones, each once', [M.allowedHosts({ CONTAINER_APP_NAME: 'crophalo-api', CONTAINER_APP_ENV_DNS_SUFFIX: 'happy-1234.canadacentral.azurecontainerapps.io', ALLOWED_HOSTS: 'api.site.example.test, crophalo-api.happy-1234.canadacentral.azurecontainerapps.io' }), M.allowedHosts({ CONTAINER_APP_NAME: 'x' })],
  [['crophalo-api.happy-1234.canadacentral.azurecontainerapps.io', 'api.site.example.test'], []]);
same('proxy hops: 1 behind Azure\'s ingress when public, the setting when given', [M.trustHops({ CONTAINER_APP_NAME: 'crophalo-api' }, true), M.trustHops({ CONTAINER_APP_NAME: 'crophalo-api' }, false), M.trustHops({ CONTAINER_APP_NAME: 'crophalo-api', TRUST_PROXY_HOPS: '2' }, true)], [1, 0, 2]);

// ---- real servers: a throwaway copy of the server and the scripts it imports
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-test-cors-'))), SITE = path.join(TMP, 'site'), HOME_EMPTY = path.join(TMP, 'home-empty');
fs.mkdirSync(path.join(SITE, 'scripts'), { recursive: true }); fs.mkdirSync(HOME_EMPTY);
for (const name of ['serve.mjs', 'earthdata.mjs', 'hostmode.mjs', 'status.mjs', 'push.mjs', 'drought.mjs']) if (fs.existsSync(path.join(HERE, name))) fs.copyFileSync(path.join(HERE, name), path.join(SITE, 'scripts', name));
fs.writeFileSync(path.join(SITE, 'index.html'), '<!doctype html>\n<meta charset="utf-8">\n<title>Test page</title>\n');
const HAS_PUSH = fs.existsSync(path.join(SITE, 'scripts', 'push.mjs'));
const BASE_PORT = /^\d{1,5}$/.test(process.env.TEST_PORT ?? '') ? Number(process.env.TEST_PORT) : 0;
const children = [];
function start(name, env, n) {
  const child = spawn(process.execPath, [path.join(SITE, 'scripts', 'serve.mjs')], {
    env: { PATH: process.env.PATH, HOME: HOME_EMPTY, FW_CACHE: path.join(TMP, `cache-${name}`), FW_PYTHON: path.join(TMP, 'no-python'), HOST: '127.0.0.1', PORT: String(BASE_PORT ? BASE_PORT + n : 0), ...env },   // a clean environment: no login, no Python
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  const s = { child, out: '', err: '', port: 0 };
  child.stderr.on('data', d => { s.err += d; });
  s.up = new Promise((done, fail) => {
    child.stdout.on('data', d => { s.out += d; const m = /Crophalo on http:\/\/\S+:(\d+)/.exec(s.out); if (m && !s.port) { s.port = +m[1]; setTimeout(() => done(s), 150); } });
    child.on('exit', code => fail(new Error(`the ${name} server stopped before it started (${code}): ${s.err.trim().slice(0, 300)}`)));
    setTimeout(() => fail(new Error(`the ${name} server did not start in 10 s`)), 10e3).unref();
  });
  return s;
}
function ask(port, pathname, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((done, fail) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method, headers: { connection: 'close', ...headers } }, res => {
      const parts = []; res.on('data', d => parts.push(d));
      res.on('end', () => { const text = Buffer.concat(parts).toString('utf8'); let json; try { json = JSON.parse(text); } catch { /* not JSON */ } done({ status: res.statusCode, headers: res.headers, text, json }); });
    });
    req.on('error', fail); req.setTimeout(10e3, () => req.destroy(new Error(`no answer in 10 s for ${method} ${pathname}`)));
    req.end(body);
  });
}
const acao = r => r.headers['access-control-allow-origin'];
const OTHER_SITE = { ok: false, reason: 'Requests from other websites are not allowed' };

try {
  const A = start('public', { FW_FORCE_PUBLIC: '1', ALLOWED_ORIGINS: `${SITE_A}, ${LOCAL_PAGE}` }, 0);
  const B = start('mistyped', { FW_FORCE_PUBLIC: '1', ALLOWED_ORIGINS: `*, http://evil.example, https://ok.example.test/path, ${SITE_A}` }, 1);
  const C = start('local', {}, 2);
  const D = start('azure', { FW_FORCE_PUBLIC: '1', CONTAINER_APP_NAME: 'crophalo-api', CONTAINER_APP_ENV_DNS_SUFFIX: 'happy-1234.canadacentral.azurecontainerapps.io', ALLOWED_ORIGINS: SITE_A }, 3);
  await Promise.all([A.up, B.up, C.up, D.up]);

  await group('the site\'s pages on another name', async () => {
    const p = A.port, from = { origin: SITE_A };
    check('the start says which website may read the answers', /answers readable by the website at https:\/\/site\.example\.test, http:\/\/127\.0\.0\.1:5931/.test(A.out), A.out);
    const h = await ask(p, '/api/health', { headers: from });
    same('health from the site: answered, readable by that page only', [h.status, acao(h)], [200, SITE_A]);
    check('…with every security header, and the vary header naming the page', M.missingHeaders(h.headers, true).length === 0 && /\borigin\b/.test(h.headers.vary) && /accept-encoding/.test(h.headers.vary), h.headers);
    const s = await ask(p, '/api/sources', { headers: from });
    same('a route behind the checks, from the site: answered, readable', [s.status, acao(s), Array.isArray(s.json)], [200, SITE_A, true]);
    const l = await ask(p, '/api/smaproot?lat=43.13&lon=-80.75', { headers: from });
    same('a lookup from the site: the server\'s own answer (no Python here), readable by the page, so the card can say it in words', [l.status, acao(l), typeof l.json?.reason], [500, SITE_A, 'string']);
    const loc = await ask(p, '/api/health', { headers: { origin: LOCAL_PAGE } });
    same('a page on this computer, when it is listed: readable', acao(loc), LOCAL_PAGE);
  });
  await group('other websites', async () => {
    const p = A.port;
    for (const origin of [EVIL, `${SITE_A}.evil.example`, `${SITE_A}:8443`, 'null', 'http://site.example.test']) {
      const s = await ask(p, '/api/sources', { headers: { origin } });
      same(`${origin}: refused, and the refusal cannot be read by its page`, [s.status, s.json, acao(s)], [403, OTHER_SITE, undefined]);
    }
    const h = await ask(p, '/api/health', { headers: { origin: EVIL } });
    same('health stays open to a health checker, but another site\'s page still cannot read it', [h.status, acao(h)], [200, undefined]);
    const none = await ask(p, '/api/sources');
    same('no Origin (the same address, or a tool): answered, no header needed', [none.status, acao(none)], [200, undefined]);
    const file = await ask(p, '/index.html', { headers: { origin: SITE_A } });
    same('a file of the app is never shared with another name\'s pages', [file.status, acao(file)], [200, undefined]);
  });
  await group('the browser\'s question before a POST', async () => {
    const p = A.port, q = (pathname, origin, method, wanted) => ask(p, pathname, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': method, ...(wanted ? { 'access-control-request-headers': wanted } : {}) } });
    const yes = await q('/api/push/subscribe', SITE_A, 'POST', 'content-type');
    same('from the site, a POST of JSON: yes, with the page, the methods, the one header and how long to remember', [yes.status, acao(yes), yes.headers['access-control-allow-methods'], yes.headers['access-control-allow-headers'], yes.headers['access-control-max-age'], yes.text], [204, SITE_A, 'GET, POST', 'content-type', '600', '']);
    check('…and the yes carries the security headers too', M.missingHeaders(yes.headers, true).length === 0, yes.headers);
    for (const [label, args] of [['from another site', ['/api/push/subscribe', EVIL, 'POST', 'content-type']], ['another method', ['/api/push/subscribe', SITE_A, 'DELETE', '']], ['another header', ['/api/push/subscribe', SITE_A, 'POST', 'content-type, x-token']], ['a POST to a lookup', ['/api/smaproot', SITE_A, 'POST', 'content-type']]]) {
      const no = await q(...args);
      same(`${label}: no, and nothing the page may read`, [no.status, acao(no)], [403, undefined]);
    }
    const get = await q('/api/smaproot', SITE_A, 'GET', '');
    same('a GET to a lookup, if a browser ever asks first: yes, GET and HEAD only', [get.status, get.headers['access-control-allow-methods']], [204, 'GET, HEAD']);
    const plain = await ask(p, '/api/smaproot', { method: 'OPTIONS' });
    same('OPTIONS with no Origin is not a browser\'s question: answered as before', [plain.status, acao(plain)], [405, undefined]);
  });
  await group('the reminder pushes from the site', async () => {
    if (!HAS_PUSH) { console.log('note  scripts/push.mjs is not in this folder: the push checks are not run'); return; }
    const p = A.port, json = { 'content-type': 'application/json' };
    const key = await ask(p, '/api/push/key', { headers: { origin: SITE_A } });
    same('the server\'s push key, from the site: given, readable', [key.status, key.json?.ok, typeof key.json?.key, acao(key)], [200, true, 'string', SITE_A]);
    const sub = await ask(p, '/api/push/subscribe', { method: 'POST', headers: { origin: SITE_A, ...json }, body: '{}' });
    same('a subscription from the site reaches the push sender (this one is empty, so it is turned down in words), readable', [sub.status, sub.json?.error, acao(sub)], [400, 'That is not a push subscription this server can use', SITE_A]);
    const evil = await ask(p, '/api/push/subscribe', { method: 'POST', headers: { origin: EVIL, ...json }, body: '{}' });
    same('the same from another site: refused, unreadable', [evil.status, evil.json?.error, acao(evil)], [403, 'Not allowed from here', undefined]);
  });
  await group('a mistyped setting', async () => {
    check('the start names what was left out, and why', /ALLOWED_ORIGINS: left out "\*", "http:\/\/evil\.example", "https:\/\/ok\.example\.test\/path"/.test(B.err), B.err);
    const ok = await ask(B.port, '/api/sources', { headers: { origin: SITE_A } }), star = await ask(B.port, '/api/sources', { headers: { origin: 'https://ok.example.test' } });
    same('only the clean address is used; a star never lets every site in', [ok.status, acao(ok), star.status, acao(star)], [200, SITE_A, 403, undefined]);
  });
  await group('no setting (one address for both, as on this computer): nothing changes', async () => {
    const h = await ask(C.port, '/api/health', { headers: { origin: SITE_A } });
    same('no page of another name can read anything; the vary header is as before', [acao(h), h.headers.vary], [undefined, 'accept-encoding']);
    const pre = await ask(C.port, '/api/push/subscribe', { method: 'OPTIONS', headers: { origin: SITE_A, 'access-control-request-method': 'POST' } });
    check('a browser\'s question from another name: never a yes', pre.status >= 400 && acao(pre) === undefined, [pre.status, pre.headers]);
    const same0 = await ask(C.port, '/api/sources', { headers: { origin: `http://127.0.0.1:${C.port}` } });
    same('the pages on the same address work as before', [same0.status, acao(same0)], [200, undefined]);
  });
  await group('Azure Container Apps\' own name', async () => {
    const own = 'crophalo-api.happy-1234.canadacentral.azurecontainerapps.io';
    const a = await ask(D.port, '/api/sources', { headers: { host: own, origin: SITE_A } });
    same('the app\'s own name (from Azure\'s settings) is one of this server\'s names: answered, readable by the site', [a.status, acao(a)], [200, SITE_A]);
    const b = await ask(D.port, '/api/sources', { headers: { host: 'rebind.example', origin: SITE_A } });
    same('a name that is not this server\'s is turned away (DNS rebinding), even from the site', [b.status, acao(b) === SITE_A], [403, true]);
    const h = await ask(D.port, '/api/health', { headers: { host: 'any.example' } });
    same('health answers whatever name a health checker uses', h.status, 200);
  });
} catch (e) { check('the suite ran to its end', false, e?.message || String(e)); }
finally {
  for (const child of children) if (child.pid && child.exitCode === null) { try { process.kill(child.pid); } catch { /* already stopped */ } }
  await new Promise(r => setTimeout(r, 200));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* the system clears its temp folder */ }
}
console.log(`test_cors: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
