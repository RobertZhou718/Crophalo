// Crophalo's browser suite for the website on one address and the data server on another, as on the public site: a real headless browser walks the jury's path (home, the Ontario demo, the four steps, the report) on a throwaway copy.
// It proves that a satellite card and the crop-map check fill across the two addresses, for the pages' own address only, and that with the server asleep, down or failing every card says so in words and the rest of the report still works.
// Run: node scripts/e2e_split.mjs   (E2E_SPLIT_PORTS=static,server,door,browser picks the ports; E2E_PYTHON the Python for the crop map; E2E_SHOTS=<folder outside the project> keeps pictures).
// The browser always carries --use-mock-keychain --password-store=basic and the real home folder; the server gets an empty home and no NASA login.
/*
 * The pages come from one port, built by the website's deploy step (deploy/stage-site.mjs: the site's files, js/site-config.js naming the server, the static host's
 * headers and its content security policy), served the way a static host serves them: no /api of its own. The data server is a copy of scripts/serve.mjs on another
 * port, public, with ALLOWED_ORIGINS naming the pages' address. The crop map is the real lookup run on the answers recorded from AAFC (scripts/fixtures/live/cropsnear-oxford);
 * the soil moisture is a stand-in answer made for this check (the real lookup needs the NASA login, which a test never has); every other lookup answers that it is not
 * part of this check. Between the two stands a front door that can be awake, asleep (it holds every request until the server has started, as a host does after a quiet
 * spell), down, or answering with a host's own error page. NASA POWER's weather comes from the record kept in scripts/fixtures; every other outside service is cut off.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(HERE, '..'));
const env = process.env, say = line => console.log(line), sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 500 ? s.slice(0, 500) + '…' : s; };
const check = (label, ok, detail = '') => { if (ok) passed++; else { failed++; say(`FAIL  ${label}${detail ? `  (${brief(detail)})` : ''}`); } return !!ok; };
const same = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const lib = await import(pathToFileURL(path.join(HERE, 'e2e_lib.mjs')).href).catch(() => null);   // the shared harness's pure helpers: where a browser lives, which ports are the real ones
const isFile = f => { try { return fs.statSync(f).isFile(); } catch { return false; } };

// ---- ports, browser, Python: refused plainly before anything starts
const asked = String(env.E2E_SPLIT_PORTS || '').split(',').map(s => s.trim()).filter(Boolean).map(Number);
const [STATIC_PORT, API_PORT, DOOR_PORT, CDP_PORT] = asked.length === 4 && asked.every(p => Number.isInteger(p) && p > 0 && p < 65536) ? asked : [0, 0, 0, 0];
const real = lib?.realPorts ? lib.realPorts([ROOT]) : new Set([5173]);
for (const p of asked) if (real.has(p)) { say(`Refused: port ${p} is where the real Crophalo runs. This check only drives its own throwaway copy.`); process.exit(1); }
const BROWSER = env.CHROME || (lib?.browserPlaces ? lib.browserPlaces().find(isFile) : null);
if (!BROWSER) { say('e2e_split: no Chrome, Chromium or Edge was found (set CHROME=/path/to/the/browser).'); process.exit(1); }
const PYTHON = env.E2E_PYTHON || path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
const SHOTS = env.E2E_SHOTS ? path.resolve(env.E2E_SHOTS) : '';
if (SHOTS && !path.relative(ROOT, SHOTS).startsWith('..')) { say(`Refused: E2E_SHOTS=${env.E2E_SHOTS} is inside the Crophalo folder. Pictures from tests go somewhere else.`); process.exit(1); }

// ---- the throwaway folders
const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-e2e-split-')));
const STATIC = path.join(TMP, 'static'), API = path.join(TMP, 'server'), CACHE = path.join(TMP, 'cache'), HOME_EMPTY = path.join(TMP, 'home-empty'), PROFILE = path.join(TMP, 'profile');
for (const d of [API, CACHE, HOME_EMPTY, PROFILE, path.join(TMP, 'py')]) fs.mkdirSync(d, { recursive: true });
const children = [], servers = [];
let over = false, chrome = null;
function stopAll() {   // by process number only, and only what this run started. A browser still running here is stopped with SIGKILL, which runs nothing more inside it,
  if (over) return; over = true;   // so it can never trip over its removed profile and crash (a crash puts a report dialog on the owner's screen)
  for (const s of servers) { try { s.closeAllConnections?.(); s.close(); } catch { /* closed */ } }
  for (const c of children) if (c.pid && c.exitCode === null && !c.signalCode) { try { process.kill(c.pid, c === chrome ? 'SIGKILL' : 'SIGTERM'); } catch { /* already stopped */ } }
  if (env.E2E_KEEP === '1') say(`e2e_split: the throwaway copy is kept in ${TMP}`); else try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the system clears its temp folder */ }
}
const watchdog = setTimeout(() => { say('FAIL  e2e_split: the run took more than 8 minutes and was stopped'); stopAll(); process.exit(1); }, 8 * 60e3);
process.on('exit', stopAll);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stopAll(); process.exit(1); });
const listen = (server, port) => new Promise((done, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', () => { servers.push(server); done(server.address().port); }); });

// ---- the front door between the pages and the server: awake, asleep, down or failing
const door = { mode: 'awake', wakeAt: 0, sleepMs: 0, seen: [] };
const doorServer = http.createServer((req, res) => {
  const row = { path: req.url, method: req.method, origin: req.headers.origin ?? null, at: Date.now(), status: 0, acao: null }; door.seen.push(row);
  if (door.mode === 'down') return req.socket.destroy();   // nothing answers: the page's fetch fails
  if (door.mode === 'failing') { row.status = 503; res.writeHead(503, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>Service unavailable</title><h1>Service unavailable</h1>'); }   // a host's own error page, not JSON
  const go = () => {
    const up = http.request({ host: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers }, answer => {
      row.status = answer.statusCode; row.acao = answer.headers['access-control-allow-origin'] ?? null;
      res.writeHead(answer.statusCode, answer.headers); answer.pipe(res);
    });
    up.on('error', () => { try { res.writeHead(502); res.end(); } catch { req.socket.destroy(); } });
    req.pipe(up);
  };
  if (door.mode === 'asleep') {   // the first request starts the server; every request waits until it is up
    if (!door.wakeAt) door.wakeAt = Date.now() + door.sleepMs;
    const wait = door.wakeAt - Date.now();
    return wait > 0 ? setTimeout(go, wait) : go();
  }
  go();
});

// ---- the static host: the built folder, its own headers, no /api
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
let swa = { globalHeaders: {}, routes: [], mimeTypes: {} };
const routeMatches = (route, p) => {   // the static host's route rules: an exact path (index.html also answers for its folder), a folder/*, or *.ext / *.{a,b}
  const ext = /^(.*)\*\.(\{[^}]+\}|[a-z0-9]+)$/i.exec(route);
  if (ext) { const exts = ext[2].startsWith('{') ? ext[2].slice(1, -1).split(',') : [ext[2]]; return p.startsWith(ext[1]) && exts.some(e => p.toLowerCase().endsWith('.' + e.toLowerCase())); }
  if (route.endsWith('*')) return p.startsWith(route.slice(0, -1));
  return p === route || (route.endsWith('/index.html') && p === route.slice(0, -'index.html'.length));
};
const staticHits = [];
const staticServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); let p; try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  staticHits.push(p);
  const rule = (swa.routes || []).find(r => routeMatches(r.route, p));
  const headers = { ...swa.globalHeaders, ...(rule?.headers || {}) };
  for (const k of Object.keys(headers)) if (k.toLowerCase() === 'content-security-policy') headers[k] = headers[k].replace(/;?\s*upgrade-insecure-requests\s*/i, '').trim();   // means something only on https; this check is plain http on this computer
  if (rule?.statusCode && rule.statusCode >= 400) { res.writeHead(rule.statusCode, headers); return res.end(); }
  if (p.startsWith('/api/') || p === '/api') { res.writeHead(404, { ...headers, 'content-type': 'text/plain' }); return res.end('not found'); }   // a static host has no /api of its own
  const file = path.join(STATIC, p.endsWith('/') ? p + 'index.html' : p);
  if (path.relative(STATIC, file).startsWith('..') || !isFile(file)) { res.writeHead(404, { ...headers, 'content-type': 'text/plain' }); return res.end('not found'); }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { ...headers, 'content-type': swa.mimeTypes?.[ext] || TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let apiPort = 0, cdp = null, sessionId = '';
const pageErrors = [], logErrors = [], csp = [];
try {
  // the two addresses
  const staticPort = await listen(staticServer, STATIC_PORT), doorPort = await listen(doorServer, DOOR_PORT);
  const PAGES = `http://127.0.0.1:${staticPort}`, DOOR = `http://127.0.0.1:${doorPort}`;

  // the website, built the way the deploy builds it
  const stagePath = env.E2E_STAGE ? path.resolve(env.E2E_STAGE) : path.join(ROOT, 'deploy', 'stage-site.mjs');
  if (isFile(stagePath)) {
    const { stage } = await import(pathToFileURL(stagePath).href);
    const built = stage(ROOT, STATIC, { env: { CROPHALO_API: DOOR } });
    check('the website builds with the server\'s address set', built.problems.length === 0, built.problems);
    for (const w of built.warnings) say(`note  the website's build: ${w}`);
    swa = JSON.parse(fs.readFileSync(path.join(STATIC, 'staticwebapp.config.json'), 'utf8'));
  } else {
    say(`note  ${path.relative(ROOT, stagePath)} is not in this folder: the pages are copied by hand, without the static host's headers`);
    fs.cpSync(ROOT, STATIC, { recursive: true, filter: src => { const rel = path.relative(ROOT, src).split(path.sep).join('/'); return !rel || !/(^|\/)\.|^(scripts|runtime|node_modules|deploy)(\/|$)/.test(rel); } });
    fs.writeFileSync(path.join(STATIC, 'js', 'site-config.js'), `export const API_ORIGIN = ${JSON.stringify(DOOR)};\n`);
  }
  same('the pages name the server\'s address, and nothing else of it', fs.readFileSync(path.join(STATIC, 'js', 'site-config.js'), 'utf8').match(/API_ORIGIN = (.*);/)?.[1], JSON.stringify(DOOR));
  check('the pages carry js/api.js', isFile(path.join(STATIC, 'js', 'api.js')));

  // the data server: its scripts and lookups only, as the image has them, public, the pages' address allowed
  fs.mkdirSync(path.join(API, 'scripts'), { recursive: true });
  for (const name of ['serve.mjs', 'earthdata.mjs', 'hostmode.mjs', 'status.mjs', 'push.mjs', 'drought.mjs']) if (isFile(path.join(ROOT, 'scripts', name))) fs.copyFileSync(path.join(ROOT, 'scripts', name), path.join(API, 'scripts', name));
  fs.cpSync(path.join(ROOT, 'scripts', 'live'), path.join(API, 'scripts', 'live'), { recursive: true, filter: src => !/__pycache__/.test(src) });
  fs.cpSync(path.join(ROOT, 'scripts', 'fixtures', 'live', 'cropsnear-oxford'), path.join(TMP, 'replay'), { recursive: true });
  const DAY_BEFORE = new Date(Date.now() - 864e5).toISOString().slice(0, 10);   // the stand-in reading's day, worked out at run time
  const SMAP_ANSWER = { ok: true, source: 'Stand-in answer for the split-address check (not NASA data)', data_date: DAY_BEFORE, units: 'm3/m3 (volume of water in a volume of soil)', value: 0.31, date: DAY_BEFORE, cell: { lat: 43.13, lon: -80.75, width_km: 9, height_km: 9 } };
  fs.writeFileSync(path.join(TMP, 'py', 'smaproot.json'), JSON.stringify(SMAP_ANSWER));
  const q = s => `'${String(s).replace(/'/g, `'\\''`)}'`, standIn = path.join(TMP, 'py', 'python');
  fs.writeFileSync(standIn, `#!/bin/sh
# The Python of this check only. The crop map: the real lookup, on the answers recorded from AAFC. The soil moisture: the stand-in answer made for this check,
# after SMAP_WAIT seconds (a file beside this one). Every other lookup: not part of this check, said in words.
case "$2" in
  cropsnear.py) FW_NET_REPLAY=${q(path.join(TMP, 'replay'))} exec ${q(PYTHON)} "$@" ;;
  smaproot.py) sleep "$(cat ${q(path.join(TMP, 'py', 'smap-wait'))} 2>/dev/null || echo 0)"; cat ${q(path.join(TMP, 'py', 'smaproot.json'))} ;;
  *) printf '%s' '{"ok":false,"reason":"This lookup is not part of the split-address check."}' ;;
esac
`, { mode: 0o755 });
  check('a Python for the crop-map lookup is there (E2E_PYTHON, else .venv)', isFile(PYTHON), PYTHON);
  const server = spawn(process.execPath, [path.join(API, 'scripts', 'serve.mjs')], {
    env: { PATH: env.PATH, HOME: HOME_EMPTY, FW_CACHE: CACHE, FW_PYTHON: standIn, HOST: '127.0.0.1', PORT: String(API_PORT), FW_FORCE_PUBLIC: '1', ALLOWED_ORIGINS: PAGES, FW_LIVE_MAX: '2' },   // no login, an empty home
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(server);
  let serverOut = '';
  apiPort = await new Promise((done, fail) => {
    const t = setTimeout(() => fail(new Error('the data server did not start in 15 s')), 15e3);
    server.stdout.on('data', d => { serverOut += d; const m = /Crophalo on http:\/\/127\.0\.0\.1:(\d+)/.exec(serverOut); if (m) { clearTimeout(t); done(+m[1]); } });
    server.stderr.on('data', d => { serverOut += d; });
    server.on('exit', code => { clearTimeout(t); fail(new Error(`the data server stopped (${code}): ${serverOut.slice(-300)}`)); });
  });
  for (const p of [staticPort, doorPort, apiPort]) if (real.has(p)) throw new Error(`port ${p} is where the real Crophalo runs`);
  for (let i = 0; i < 30 && !serverOut.includes('answers readable by'); i++) await sleep(100);   // the start's later lines come a moment after the first
  check('the data server says which website may read its answers', serverOut.includes(`answers readable by the website at ${PAGES}`), serverOut);

  // the browser: its own empty profile, never the computer's keychain, the real home folder
  chrome = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-extensions',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--mute-audio', '--hide-scrollbars', '--use-mock-keychain', '--password-store=basic', `--user-data-dir=${PROFILE}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  children.push(chrome);
  let ws = '', said = '';
  chrome.stderr.on('data', d => { if (!ws) { said = (said + d).slice(-4000); const m = /DevTools listening on (ws:\/\/\S+)/.exec(said); if (m) ws = m[1]; } });   // with a port of its own the browser says its address here; the rest of its talk is dropped
  for (let i = 0; i < 300 && !ws; i++) { try { const [p, rest] = fs.readFileSync(path.join(PROFILE, 'DevToolsActivePort'), 'utf8').split('\n'); if (+p && rest) ws = `ws://127.0.0.1:${+p}${rest.trim()}`; } catch { /* not yet */ } if (!ws) await sleep(100); }
  if (!ws) throw new Error('the browser did not open its remote control in 30 s');
  cdp = await new Promise((ready, bad) => {
    const sock = new WebSocket(ws), waiting = new Map(), hear = []; let n = 0;
    const send = (method, params = {}, sid) => new Promise((done, no) => { const id = ++n, t = setTimeout(() => { waiting.delete(id); no(new Error(`the browser did not answer ${method}`)); }, 30e3); waiting.set(id, { done, no, t, method }); sock.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); });
    sock.addEventListener('open', () => ready({ send, on: f => hear.push(f), close: () => { try { sock.close(); } catch { /* gone */ } } }));
    sock.addEventListener('error', () => bad(new Error('could not reach the browser')));
    sock.addEventListener('message', ev => { const m = JSON.parse(ev.data), w = m.id && waiting.get(m.id); if (!w) { if (m.method) for (const f of hear) f(m.method, m.params || {}); return; } clearTimeout(w.t); waiting.delete(m.id); m.error ? w.no(new Error(`${w.method}: ${m.error.message}`)) : w.done(m.result); });
  });
  const { targetInfos } = await cdp.send('Target.getTargets');
  const targetId = targetInfos.find(t => t.type === 'page')?.targetId ?? (await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId;
  ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
  const send = (m, p) => cdp.send(m, p, sessionId);
  const POWER = fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'power_oxford.json'));   // NASA POWER's own answer for the demo field, recorded on 14 November 2026
  const cut = new Set();
  cdp.on((method, p) => {
    if (method === 'Runtime.exceptionThrown') pageErrors.push((p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').split('\n')[0]);
    else if (method === 'Log.entryAdded' && p.entry?.level === 'error') { const t = `${p.entry.text} ${p.entry.url || ''}`.trim(); (/Content Security Policy/i.test(t) ? csp : logErrors).push(t.slice(0, 300)); }
    else if (method === 'Runtime.consoleAPICalled' && p.type === 'error') { const t = (p.args || []).map(a => a.value ?? a.description ?? '').join(' '); (/Content Security Policy/i.test(t) ? csp : logErrors).push(t.slice(0, 300)); }
    else if (method === 'Fetch.requestPaused') {
      const u = p.request.url, host = (() => { try { return new URL(u).host; } catch { return ''; } })();
      if (u.startsWith(PAGES + '/') || u === PAGES || u.startsWith(DOOR + '/')) return void send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
      if (host === 'power.larc.nasa.gov') return void send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: POWER.toString('base64') }).catch(() => {});
      cut.add(host); send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'InternetDisconnected' }).catch(() => {});
    }
  });
  for (const d of ['Page', 'Runtime', 'Log', 'Network']) await send(`${d}.enable`);
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http://*' }, { urlPattern: 'https://*' }] });

  // ---- helpers in the page
  const js = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error('in the page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]); return r.result.value; };
  const until = async (expression, ms = 10e3) => { for (const end = Date.now() + ms; ;) { if (await js(expression).catch(() => false)) return true; if (Date.now() > end) return false; await sleep(150); } };
  async function tap(sel) {   // a real mouse press, so the page sees a pointerdown as from a farmer
    const at = await js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'center', behavior: 'instant' }); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!at) throw new Error(`tap: nothing matches ${sel}`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: type === 'mouseMoved' ? 0 : 1 });
  }
  async function shot(name) { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, `split-${name}.png`), Buffer.from(data, 'base64')); }
  const text = sel => js(`document.querySelector(${JSON.stringify(sel)})?.textContent?.replace(/\\s+/g, ' ').trim() ?? ''`);
  const go = async where => { await send('Page.navigate', { url: 'about:blank' }); await send('Page.navigate', { url: PAGES + where }); return until(`document.readyState === 'complete'`, 15e3); };
  const WELCOME = JSON.stringify({ v: '2026-11-14', at: 'test' });
  // the jury's path to a report: home, the demo region's card, three Next, "See my field report"
  async function toReport() {
    await go('/'); await js(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await go('/');
    if (!await until(`document.querySelectorAll('#homeRegions .place-card').length > 0`, 15e3)) throw new Error('the home page did not show the demo region');
    await tap('#homeRegions .cover');
    if (!await until(`!document.querySelector('#view-setup').hidden && !document.querySelector('#wNext').disabled`, 10e3)) throw new Error('the setup steps did not open');
    for (let i = 0; i < 3; i++) { await tap('#wNext'); await sleep(150); }
    await tap('#wNext');
    return until(`!document.querySelector('#view-report').hidden`, 10e3);
  }
  const reportShown = ms => until(`!!document.querySelector('#reportBar') && !!document.querySelector('#tab-overview')`, ms);
  const tab = async id => { await tap(`#tab-${id}`); await until(`!!document.querySelector('#panel-${id}')`, 5e3); };
  const card = id => text(`#panel-satellites [data-card=${id}]`);
  const DOWN = { smap: 'The soil moisture lookup did not answer. The rest of the report does not need it.', imerg: 'The satellite rain lookup did not answer. The rest of the report does not need it.',
    grace: 'The GRACE-FO water-storage lookup did not answer. The rest of the report does not need it.', hls: 'The greenness lookup did not answer. The rest of the report does not need it.', ecostress: 'The ECOSTRESS ground-temperature lookup did not answer. The rest of the report does not need it.' };
  const NOT_PART = 'This lookup is not part of the split-address check.';
  const clearServerCache = () => fs.rmSync(path.join(CACHE, 'api'), { recursive: true, force: true });   // the next request runs each lookup again
  const smapWait = s => fs.writeFileSync(path.join(TMP, 'py', 'smap-wait'), String(s));

  // ---- 1. awake: the cards fill across the two addresses
  door.mode = 'awake'; door.seen = []; smapWait(0); clearServerCache();
  const errorsFrom = pageErrors.length;
  check('awake: the jury\'s path reaches the report', await toReport());
  check('awake: the report is drawn (the weather from NASA POWER, the crop map from the server)', await reportShown(60e3));
  const overview = await text('#reportRoot');
  const cropRows = () => door.seen.filter(r => r.path.startsWith('/api/cropsnear')).map(r => `${r.path} -> ${r.status}`);
  check('awake: the crop-map check filled from the server on the other address (AAFC 2025, read by the real lookup)', /AAFC Annual Crop Inventory 2025/.test(overview) && /Farmland in a box about/.test(overview), { asked: cropRows(), report: overview.slice(overview.indexOf('What this is based on'), overview.indexOf('What this is based on') + 400) });
  await tab('satellites');
  check('awake: the satellite soil-moisture card filled from the server on the other address', await until(`(() => { const c = document.querySelector('#panel-satellites [data-card=smap]'); return !!c && !!c.querySelector('.region-value') && c.querySelector('.region-value').textContent.trim() !== 'Not read yet'; })()`, 20e3), await card('smap'));
  for (const id of ['imerg', 'grace', 'hls', 'ecostress']) check(`awake: the ${id} card says in words why it has no figure`, await until(`(document.querySelector('#panel-satellites [data-card=${id}]')?.textContent ?? '').includes(${JSON.stringify(NOT_PART)})`, 20e3), await card(id));
  await shot('awake-satellites');
  const apiRows = door.seen.filter(r => r.path.startsWith('/api/'));
  check('awake: the pages asked the server only on its own address, never their own /api', apiRows.length >= 4 && !staticHits.some(p => p.startsWith('/api')), { asked: apiRows.map(r => r.path.split('?')[0]), own: staticHits.filter(p => p.startsWith('/api')) });
  check('awake: every question carried the pages\' address, and every answer was readable by them only', apiRows.every(r => r.origin === PAGES && r.acao === PAGES), apiRows.filter(r => r.origin !== PAGES || r.acao !== PAGES));
  check('awake: the first touch woke the server (one small question to its health)', apiRows.filter(r => r.path === '/api/health').length === 1, apiRows.map(r => r.path.split('?')[0]));
  check('awake: no page error', pageErrors.length === errorsFrom, pageErrors.slice(errorsFrom));
  check('awake: the content security policy let the pages ask the server', !csp.some(t => t.includes(DOOR)), csp);

  // ---- 2. down, and 3. a host's error page: every card says so in words, the rest works
  for (const mode of ['down', 'failing']) {
    door.mode = mode; door.seen = []; clearServerCache();
    const from = pageErrors.length;
    check(`${mode}: the jury's path reaches the report`, await toReport());
    check(`${mode}: the report is drawn all the same`, await reportShown(60e3));
    const words = await text('#reportRoot');
    check(`${mode}: the crop-map check says it could not be read`, /What farmers grow around here could not be read/.test(words), words.slice(0, 600));
    await tab('satellites');
    for (const [id, line] of Object.entries(DOWN)) check(`${mode}: the ${id} card says in words that its lookup did not answer`, await until(`(document.querySelector('#panel-satellites [data-card=${id}]')?.textContent ?? '').includes(${JSON.stringify(line)})`, 20e3), await card(id));
    await shot(`${mode}-satellites`);
    await tab('weather');
    check(`${mode}: the weather tab still has NASA POWER's record`, await until(`/Weather through/.test(document.querySelector('#panel-weather')?.textContent ?? '')`, 10e3), (await text('#panel-weather')).slice(0, 300));
    check(`${mode}: no page error`, pageErrors.length === from, pageErrors.slice(from));
  }

  // ---- 4. asleep for 10 s (a host starting the server): the report waits with its words, then everything fills; a card still reading says so
  door.mode = 'asleep'; door.sleepMs = 10e3; door.wakeAt = 0; door.seen = []; smapWait(6); clearServerCache();
  {
    const from = pageErrors.length;
    check('asleep: the jury\'s path reaches the report', await toReport());
    await sleep(2500);
    const waiting = await text('#reportRoot');
    check('asleep: while the server starts, the report says in words that it is asking', /Crophalo is asking NASA and partner services about this exact spot/.test(waiting), waiting.slice(0, 300));
    check('asleep: the report is drawn once the server is up', await reportShown(45e3));
    check('asleep: the crop map filled after the wait', /AAFC Annual Crop Inventory 2025/.test(await text('#reportRoot')), cropRows());
    await tab('satellites');
    const reading = await card('smap');
    check('asleep: a satellite card still waiting says so in words', /Reading the NASA SMAP soil moisture for your area/.test(reading) || /\d/.test(reading), reading);
    if (/Reading the NASA SMAP/.test(reading)) say('note  asleep: the soil-moisture card was seen still reading, then filling');
    check('asleep: the soil-moisture card filled when its answer came', await until(`(() => { const v = document.querySelector('#panel-satellites [data-card=smap] .region-value'); return !!v && v.textContent.trim() !== 'Not read yet'; })()`, 30e3), await card('smap'));
    await shot('asleep-satellites');
    check('asleep: no page error', pageErrors.length === from, pageErrors.slice(from));
  }

  // ---- 5. asleep for longer than the crop map waits (45 s): the report does not wait for ever, says what was not read, and the cards fill later
  door.mode = 'asleep'; door.sleepMs = 45e3; door.wakeAt = 0; door.seen = []; smapWait(0); clearServerCache();
  {
    const from = pageErrors.length;
    check('long sleep: the jury\'s path reaches the report', await toReport());
    const t0 = Date.now();   // the report has opened: from here it waits for the weather and the crop map, never for the server's start
    check('long sleep: the report is drawn without waiting for the server', await reportShown(42e3));
    const shownAfter = Date.now() - t0;
    check('long sleep: …after about the crop map\'s own limit (25 s), well before the server\'s start (45 s)', shownAfter < 38e3, `${Math.round(shownAfter / 1000)} s`);
    check('long sleep: the report says the crop map could not be read', /What farmers grow around here could not be read/.test(await text('#reportRoot')));
    await tab('satellites');
    check('long sleep: the soil-moisture card fills once the server is up', await until(`(() => { const v = document.querySelector('#panel-satellites [data-card=smap] .region-value'); return !!v && v.textContent.trim() !== 'Not read yet'; })()`, 45e3), await card('smap'));
    await shot('long-sleep-satellites');
    check('long sleep: no page error', pageErrors.length === from, pageErrors.slice(from));
  }

  if (csp.length) say(`note  the content security policy refused ${csp.length} thing(s) (for the deploy's policy, not this check):\n${[...new Set(csp)].slice(0, 12).map(t => '      ' + t).join('\n')}`);
  if (cut.size) say(`note  outside services cut off, as meant: ${[...cut].sort().join(', ')}`);
} catch (e) { check('e2e_split ran to its end', false, e?.stack?.split('\n').slice(0, 3).join(' ') || String(e)); }
finally {
  try { await cdp?.send('Browser.close'); } catch { /* closed */ }
  cdp?.close(); clearTimeout(watchdog);
  // wait until the browser has really stopped (a busy computer can take seconds), up to 15 s, then SIGKILL; only then is its profile removed by stopAll()
  const gone = ms => new Promise(done => { if (!chrome?.pid || chrome.exitCode != null || chrome.signalCode) return done(true); const t = setTimeout(() => done(false), ms); chrome.once('exit', () => { clearTimeout(t); done(true); }); });
  const byItself = await gone(15e3);
  if (!byItself) { try { process.kill(chrome.pid, 'SIGKILL'); } catch { /* it had just stopped */ } await gone(5e3); }
  if (chrome && !byItself) say('note  the browser was still running 15 s after it was asked to close (a busy computer), so it was stopped with SIGKILL before its profile was removed');
  stopAll();
}
say(`e2e_split: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
