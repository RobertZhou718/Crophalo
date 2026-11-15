// Does the website still work under its own security headers? Serves a folder made by deploy/stage-site.mjs the way Azure Static Web Apps would (its
// staticwebapp.config.json: the first route that fits, its status or headers, the global headers, the file kinds) on 127.0.0.1:5930, opens it in a headless
// Chrome or Edge (port 5938 for the browser's own control line), opens the map, and lists every request and script the content security policy blocked,
// in the pages and in their workers, plus every script error. The map tiles, the place names and the NASA layers really load from their services.
// One change to the policy, for this computer only: "upgrade-insecure-requests" is left out, since this check runs on plain http.
// The browser runs with --use-mock-keychain --password-store=basic and a throwaway profile, never a pretend home; both programs are stopped by their PID.
// Use: node deploy/check_csp_browser.mjs <staged folder>        Exit 0 when nothing was blocked, 1 when something was, 2 when it could not run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';

const SITE_PORT = 5930, DEBUG_PORT = 5938, WAIT_MS = 9000;
const folder = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(folder, 'staticwebapp.config.json'))) { console.error('Use: node deploy/check_csp_browser.mjs <a folder made by deploy/stage-site.mjs>'); process.exit(2); }
const config = JSON.parse(fs.readFileSync(path.join(folder, 'staticwebapp.config.json'), 'utf8'));
const sleep = ms => new Promise(done => setTimeout(done, ms));

// ---- the static host, as its configuration describes it
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', ...config.mimeTypes };
const pattern = route => new RegExp('^' + route.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\{([^}]*)\}/g, (_, list) => `(${list.split(',').join('|')})`).replace(/\*/g, '.*') + '$');
const rules = (config.routes || []).map(r => ({ ...r, re: pattern(r.route) }));
const global = { ...config.globalHeaders };
for (const k of Object.keys(global)) if (k.toLowerCase() === 'content-security-policy') global[k] = global[k].replace(/;\s*upgrade-insecure-requests/, '');
const site = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'), pathname = decodeURIComponent(url.pathname), rule = rules.find(r => r.re.test(pathname));
  const headers = { ...global, ...(rule?.headers || {}) };
  if (rule?.statusCode) { res.writeHead(rule.statusCode, { ...headers, 'content-type': 'text/plain' }); return res.end('blocked by a route rule'); }
  const file = path.join(folder, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
  if (!file.startsWith(folder) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, { ...headers, 'content-type': 'text/plain' }); return res.end('not found'); }
  res.writeHead(200, { ...headers, 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// ---- the browser
const BROWSERS = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge'];
const browserFile = BROWSERS.find(f => fs.existsSync(f));
if (!browserFile) { console.error('No Chrome or Edge found.'); process.exit(2); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-csp-profile-'));
let browser = null, closeBrowser = async () => {};
// The browser is stopped as the owner's rule says: asked to close, waited for until it has really gone (up to 15 s), only then SIGKILL; never SIGTERM.
// Its profile is removed only after it has gone, so it can never trip over a missing profile and crash (a crash puts a report dialog on the owner's screen).
const gone = ms => new Promise(done => { if (!browser?.pid || browser.exitCode != null || browser.signalCode) return done(true); const t = setTimeout(() => done(false), ms); browser.once('exit', () => { clearTimeout(t); done(true); }); });
async function stopAll() {
  await closeBrowser().catch(() => {});
  if (!(await gone(15e3))) { try { process.kill(browser.pid, 'SIGKILL'); } catch { /* it had just stopped */ } await gone(5e3); }
  try { site.close(); } catch { /* closed */ }
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* the system clears its temp folder */ }
}

const found = { blocked: [], errors: [], failed: new Map() };
async function main() {
  await new Promise((ok, no) => { site.once('error', no); site.listen(SITE_PORT, '127.0.0.1', ok); });
  browser = spawn(browserFile, ['--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-sync', '--disable-extensions', '--mute-audio', '--hide-scrollbars', '--use-mock-keychain', '--password-store=basic', '--window-size=1280,900', 'about:blank'],
    { stdio: 'ignore', env: { ...process.env, HOME: os.userInfo().homedir } });   // the browser gets the computer's real home even when this check runs with an empty one
  let version = null;
  for (let i = 0; i < 50 && !version; i++) { await sleep(200); version = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).then(r => r.json()).catch(() => null); }
  if (!version) throw new Error('the browser did not open its control line');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('no control line')); });
  let id = 0; const waiting = new Map(), listeners = [];
  ws.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.no(new Error(m.error.message)) : w.ok(m.result); }
    else for (const l of listeners) l(m);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const n = ++id; waiting.set(n, { ok, no }); ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) })); });
  closeBrowser = async () => { await Promise.race([send('Browser.close'), gone(5000)]).catch(() => {}); try { ws.close(); } catch { /* closed */ } };   // a closing browser may never answer: its exit is the answer
  const watch = async sessionId => {
    for (const domain of ['Runtime.enable', 'Log.enable', 'Network.enable']) await send(domain, {}, sessionId).catch(() => {});
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sessionId).catch(() => {});
  };
  const requests = new Map();   // request id -> address, to name what was blocked or did not arrive
  listeners.push(m => {
    const p = m.params || {};
    if (m.method === 'Target.attachedToTarget') watch(p.sessionId);   // a worker (the map's own, the offline worker, the shade worker): watched the same way
    if (m.method === 'Log.entryAdded' && /Content Security Policy/i.test(p.entry?.text || '')) found.blocked.push(p.entry.text.slice(0, 400));
    if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') { const t = (p.args || []).map(a => a.value ?? a.description ?? '').join(' '); if (/Content Security Policy/i.test(t)) found.blocked.push(t.slice(0, 400)); else found.errors.push(t.slice(0, 300)); }
    if (m.method === 'Runtime.exceptionThrown') found.errors.push((p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').split('\n')[0].slice(0, 300));
    if (m.method === 'Network.requestWillBeSent') requests.set(p.requestId, p.request?.url);
    if (m.method === 'Network.loadingFailed' && p.blockedReason === 'csp') found.blocked.push(`blocked: ${requests.get(p.requestId) || '?'}`);
    if (m.method === 'Network.loadingFailed' && !p.blockedReason) { const u = requests.get(p.requestId); if (u) { const h = new URL(u).host; found.failed.set(h, (found.failed.get(h) || 0) + 1); } }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await watch(sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "addEventListener('securitypolicyviolation', e => console.error('Content Security Policy blocked ' + e.violatedDirective + ': ' + (e.blockedURI || 'inline') + ' at ' + (e.sourceFile || '') + ':' + (e.lineNumber || '')), true);" }, sessionId);
  const run = async (expr, ms = 15000) => (await Promise.race([send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId), sleep(ms).then(() => ({ result: { value: 'timeout' } }))])).result?.value;

  for (const page of ['/design.html', '/']) {
    await send('Page.navigate', { url: `http://127.0.0.1:${SITE_PORT}${page}` }, sessionId);
    await sleep(WAIT_MS);
    console.log(`${page}: opened (${await run('document.title')})`);
  }
  const opened = await run("(() => { const b = document.querySelector('#homeMapPick'); if (!b) return 'no map button'; b.click(); return 'map opened'; })()");
  await sleep(WAIT_MS + 6000);
  const map = await run("JSON.stringify({ tiles: document.querySelectorAll('.leaflet-tile-loaded').length, canvas: document.querySelectorAll('.maplibregl-canvas, canvas').length })");
  console.log(`the map: ${opened}; ${map}`);
}

// One line per kind of thing blocked: the directive and the service (or "inline"), with how many times, and one example in full.
function grouped(lines) {
  const groups = new Map();
  for (const line of lines) {
    const directive = /\b((?:script|style|img|connect|worker|child|font|media|manifest|frame|object|default)-src(?:-attr|-elem)?)\b/.exec(line)?.[1] || (/inline event handler/i.test(line) ? 'script-src-attr' : 'policy');
    const where = /https?:\/\/([^/'"\s:]+)/.exec(line.replace(/http:\/\/127\.0\.0\.1:\d+/g, ''))?.[1] || (/inline|event handler/i.test(line) ? 'inline' : 'this site');
    const key = `${directive} ${where}`, g = groups.get(key) || { n: 0, example: line };
    g.n++; groups.set(key, g);
  }
  return [...groups].map(([key, g]) => `${key} (${g.n}x), for example: ${g.example.slice(0, 220)}`);
}

main().then(async () => {
  await stopAll();
  const blocked = grouped([...new Set(found.blocked)]), errors = [...new Set(found.errors)].filter(Boolean);
  for (const b of blocked) console.log(`  BLOCKED  ${b}`);
  for (const e of errors) console.log(`  error    ${e}`);
  if (found.failed.size) console.log(`  (requests that did not arrive, by service, not counted: ${[...found.failed].map(([h, n]) => `${h} ${n}`).join(', ')})`);
  console.log(blocked.length ? `${blocked.length} kind(s) of thing blocked by the policy: allow the service in deploy/staticwebapp.config.json, or move the inline code into a file` : 'Nothing was blocked by the content security policy.');
  process.exit(blocked.length ? 1 : 0);
}).catch(async e => { await stopAll(); console.error(`The check could not run: ${e.message}`); process.exit(2); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { try { if (browser?.pid && browser.exitCode == null && !browser.signalCode) process.kill(browser.pid, 'SIGKILL'); } catch { /* gone */ } process.exit(2); });   // an emergency stop: SIGKILL, never SIGTERM
