// Crophalo's real-browser harness: one headless browser drives a throwaway copy of the app, served on its own port, with every outside service cut off.
// Pure: browserPlaces(), portRefusal(), wanted(), copyList(), whyNoBrowser(). The rest starts a server and a browser in the system temp folder and stops both by PID.
// Checked by scripts/e2e.mjs, which is built on it; every later e2e_*.mjs imports this file and copies nothing out of it.
// RULE: it never drives the real folder's running copy or its port: a test browser there once wrote test data over the owner's saved fields.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(HERE, '..'));   // CROPHALO_ROOT is for tests only: it points a suite at a copy with a deliberate mistake in it
const CALL_MS = 30e3, RUN_MS = 600e3;   // a stuck browser can never hang the checks: 30 s for one call, 10 minutes for a run
const STARTER_PORT = 5173;   // the server's own fallback port (scripts/serve.mjs); the start script uses 5480 (scripts/run.sh)
const FLAGS = ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--disable-background-networking', '--disable-sync', '--disable-extensions',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--mute-audio', '--hide-scrollbars',
  '--use-mock-keychain', '--password-store=basic'];   // a test browser must never ask the computer's keychain for anything: no system dialog, nothing stored
const KEYS = { Backspace: 8, Tab: 9, Enter: 13, Escape: 27, ' ': 32, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46, '+': 187, '=': 187, '-': 189, '_': 189 };
const sleep = ms => new Promise(done => setTimeout(done, ms));
const isFile = file => { try { return fs.statSync(file).isFile(); } catch { return false; } };

// ---- pure parts
// Where a browser may live, best first: Chrome, then Chromium, then Edge (the same engine, and every Windows PC has it).
export function browserPlaces(env = process.env, platform = process.platform) {
  const P = platform === 'win32' ? path.win32 : path.posix, home = env.HOME || env.USERPROFILE || '';
  const winRoots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
  const macApps = ['/Applications', home && P.join(home, 'Applications')].filter(Boolean);
  const onPath = names => (env.PATH || env.Path || '').split(P.delimiter).filter(Boolean).flatMap(dir => names.map(name => P.join(dir, platform === 'win32' ? name + '.exe' : name)));
  const chrome = platform === 'darwin' ? macApps.flatMap(a => [P.join(a, 'Google Chrome.app/Contents/MacOS/Google Chrome'), P.join(a, 'Chromium.app/Contents/MacOS/Chromium')])
    : platform === 'win32' ? winRoots.map(r => P.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  const edge = platform === 'darwin' ? macApps.map(a => P.join(a, 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'))
    : platform === 'win32' ? winRoots.map(r => P.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe')) : ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'];
  return [...chrome, ...onPath(platform === 'win32' ? ['chrome'] : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']), ...edge, ...onPath(platform === 'win32' ? ['msedge'] : ['microsoft-edge'])];
}

// The ports a test must never use: the starter's own, and the one each folder last ran on.
export function realPorts(roots = [ROOT, path.join(HERE, '..')]) {
  const ports = new Set([STARTER_PORT]);
  for (const root of roots) { try { const n = +fs.readFileSync(path.join(root, 'runtime', 'last-port'), 'utf8').trim(); if (Number.isInteger(n) && n > 0) ports.add(n); } catch { /* never started here */ } }
  return ports;
}
// A plain sentence when a port must be refused, else ''.
export function portRefusal(port, real = realPorts()) {
  if (port == null || port === '') return '';
  if (!/^\d{1,5}$/.test(String(port)) || +port > 65535) return `E2E_PORT=${port} is not a port number.`;
  return real.has(+port) ? `Refused: port ${+port} is where the real Crophalo runs. Browser tests only ever drive their own throwaway copy on another port.` : '';
}
// E2E_ONLY=fit,motion runs only the groups whose name holds one of the words.
// The browser checks are asked for unless E2E=0 says otherwise, so a run that cannot drive a browser fails with one plain line, never passes as skipped.
export function whyNoBrowser(name, { webSocket = typeof WebSocket === 'function', browser } = {}) {
  if (!webSocket) return `${name}: this Node has no WebSocket, so the browser tests cannot run (Node 22 or newer has it). To leave the browser tests out on purpose: E2E=0 sh scripts/check.sh`;
  if (!browser) return `${name}: no Chrome, Chromium or Edge was found, so the browser tests cannot run. Set CHROME=/path/to/the/browser, or leave them out on purpose: E2E=0 sh scripts/check.sh`;
  return '';
}
export const wanted = (name, only = process.env.E2E_ONLY || '') => { const words = only.split(',').map(w => w.trim().toLowerCase()).filter(Boolean); return !words.length || words.some(w => name.toLowerCase().includes(w)); };
// What the throwaway copy holds: the page, what it loads, and the server with the scripts it imports (found by reading it, so a new import never needs a change here).
export function copyList(root = ROOT) {
  const list = ['index.html', 'design.html', 'manifest.json', 'sw.js', 'robots.txt', 'js', 'css', 'vendor', 'icons', 'img', 'design', 'media', 'data/regions.json'], seen = new Set();
  const follow = rel => {
    if (seen.has(rel) || !isFile(path.join(root, rel))) return;
    seen.add(rel);
    for (const m of fs.readFileSync(path.join(root, rel), 'utf8').matchAll(/^\s*(?:import|export)\b[^'"\n]*?['"](\.{1,2}\/[^'"\n]+)['"]/gm)) follow(path.posix.join(path.posix.dirname(rel), m[1]));
  };
  follow('scripts/serve.mjs');
  return [...list.filter(rel => fs.existsSync(path.join(root, rel))), ...seen];
}

// ---- what runs inside the page: one small kit of measuring helpers, sent along with every page() call
function pageKit() {
  const T = {};
  T.name = el => !el ? 'nothing' : el.nodeType !== 1 ? String(el.nodeName) : (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '')
    + (el.getAttribute('aria-label') || el.textContent.trim() ? ` "${(el.getAttribute('aria-label') || el.textContent).trim().replace(/\s+/g, ' ').slice(0, 28)}"` : ''));
  T.rgba = text => { const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/.exec(text || ''); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]] : null; };
  T.colours = text => (String(text || '').match(/rgba?\([^)]*\)/g) || []).map(T.rgba).filter(Boolean);
  T.over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  T.lum = c => { const [r, g, b] = c.slice(0, 3).map(v => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
  T.ratio = (a, b) => { const [hi, lo] = [T.lum(a), T.lum(b)].sort((p, q) => q - p); return (hi + .05) / (lo + .05); };
  T.sat = c => { const hi = Math.max(c[0], c[1], c[2]), lo = Math.min(c[0], c[1], c[2]); return hi ? (hi - lo) / hi : 0; };
  T.box = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
  T.shown = el => {   // on the page for the eye: laid out, not hidden, and not inside a closed sheet
    if (!el.isConnected || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el); if (cs.visibility !== 'visible') return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { if (n.inert || +getComputedStyle(n).opacity === 0) return false; if (n.tagName === 'DIALOG' && !n.open) return false; }
    return true;
  };
  T.face = el => {   // what is drawn for a control: a hidden native input stands behind its row or its drawn switch
    if (el.tagName !== 'INPUT' || !el.classList.contains('sr')) return el;
    return el.closest('.choice, .lrow, .swrow, .cbrow, label') || el.nextElementSibling || el;
  };
  T.controls = (root = document) => [...root.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=link], [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && T.shown(T.face(el)));
  T.ground = el => {   // the solid colour the eye sees behind a thing: every layer from the page up, laid over white
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const cs = getComputedStyle(n), img = T.colours(cs.backgroundImage)[0], bg = T.rgba(cs.backgroundColor); if (img) layers.push(img); if (bg && bg[3] > 0) layers.push(bg); }
    return layers.reduceRight((under, layer) => T.over(layer, under), [255, 255, 255, 1]);
  };
  T.tiny = b => b.w <= 2 && b.h <= 2;   // the 1 px box of words kept for screen readers only, at any text size
  T.widest = vw => {   // what sticks out of the screen: nothing may, except inside a box that scrolls on its own. vw is the width of the device: on a phone the window itself grows with a page that is too wide
    const out = [], scrolls = el => { for (let n = el.parentElement; n; n = n.parentElement) { if (n === document.documentElement || n === document.body) continue; const o = getComputedStyle(n).overflowX; if (/auto|scroll/.test(o)) return true; if (/hidden|clip/.test(o)) { const r = n.getBoundingClientRect(); if (r.left >= -.5 && r.right <= vw + .5) return true; } } return false; };   // a box that clips what overflows it, and is itself on the screen, hides it as well as one that scrolls (the map's canvas is drawn a little wider than the map)
    for (const el of document.body.querySelectorAll('*')) {
      if (!T.shown(el)) continue;
      const b = T.box(el); if (T.tiny(b)) continue;
      if ((b.r > vw + .5 || b.x < -.5) && !scrolls(el)) out.push({ what: T.name(el), from: Math.round(b.x), to: Math.round(b.r), w: Math.round(b.w) });
    }
    return { vw, page: document.documentElement.scrollWidth, body: Math.round(document.body.getBoundingClientRect().width), out: out.sort((a, b) => b.to - a.to).slice(0, 3), count: out.length };
  };
  T.cut = () => {   // words cut off inside their own box, which no page scroll would ever show
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!T.shown(el)) continue;
      const cs = getComputedStyle(el), b = T.box(el);
      if (!/hidden|clip/.test(cs.overflowX) || cs.textOverflow === 'ellipsis' || T.tiny(b) || !el.textContent.trim() || el.classList.contains('leaflet-container') || el.classList.contains('sr')) continue;   // a map's panes are drawn, not read; a screen-reader-only line is 1 px by design
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${T.name(el)} holds ${el.scrollWidth} px in ${el.clientWidth} px`);
    }
    return out.slice(0, 3);
  };
  return T;
}

// ---- the browser's remote control (Node's own WebSocket, no package)
function connect(address) {
  return new Promise((ready, fail) => {
    const ws = new WebSocket(address), waiting = new Map(), hear = [];
    let n = 0;
    const send = (method, params = {}, sessionId) => new Promise((done, bad) => {
      const id = ++n, timer = setTimeout(() => { waiting.delete(id); bad(new Error(`the browser did not answer ${method} in ${CALL_MS / 1e3} s`)); }, CALL_MS);
      waiting.set(id, { done, bad, timer, method });
      try { ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params })); } catch (e) { clearTimeout(timer); waiting.delete(id); bad(e); }
    });
    ws.addEventListener('open', () => ready({ send, on: fn => hear.push(fn), close: () => { try { ws.close(); } catch { /* already gone */ } } }));
    ws.addEventListener('error', () => fail(new Error('could not reach the browser')));
    ws.addEventListener('close', () => { for (const w of waiting.values()) { clearTimeout(w.timer); w.bad(new Error(`the browser closed before it answered ${w.method}`)); } waiting.clear(); });
    ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data), w = msg.id && waiting.get(msg.id);
      if (!w) { if (msg.method) for (const fn of hear) fn(msg.method, msg.params || {}, msg.sessionId); return; }
      clearTimeout(w.timer); waiting.delete(msg.id);
      msg.error ? w.bad(new Error(`${w.method}: ${msg.error.message}`)) : w.done(msg.result);
    });
  });
}

// ---- one run: openRun(name) gives the helpers, or stops here with one plain line
export async function openRun(name) {
  const env = process.env, liveHost = url => { try { return (env.E2E_LIVE_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean).includes(new URL(url).host); } catch { return false; } }, say = line => console.log(line);
  const refuse = line => { say(line); process.exit(1); };
  if (env.E2E_URL || env.E2E_TARGET) refuse('Refused: browser tests cannot be pointed at a running Crophalo (E2E_URL, E2E_TARGET). They only ever drive their own throwaway copy.');
  if (portRefusal(env.E2E_PORT)) refuse(portRefusal(env.E2E_PORT));
  if (whyNoBrowser(name, { browser: true })) refuse(whyNoBrowser(name, { browser: true }));
  if (env.CHROME && !isFile(env.CHROME)) refuse(`${name}: CHROME points at ${env.CHROME}, and there is no browser there.`);
  const browser = env.CHROME || browserPlaces().find(isFile);
  if (whyNoBrowser(name, { browser })) refuse(whyNoBrowser(name, { browser }));
  const shots = env.E2E_SHOTS ? path.resolve(env.E2E_SHOTS) : '';
  if (shots && !path.relative(ROOT, shots).startsWith('..') && !path.isAbsolute(path.relative(ROOT, shots))) refuse(`Refused: E2E_SHOTS=${env.E2E_SHOTS} is inside the Crophalo folder. Pictures from tests go somewhere else.`);

  // the counting
  let passed = 0, failed = 0, over = false;
  const errors = [], cutOff = [], asked = [];
  const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 700 ? s.slice(0, 700) + '…' : s; };
  const check = (label, ok, detail = '') => { if (ok) passed++; else { failed++; say(`FAIL  ${label}${detail ? `  (${brief(detail)})` : ''}`); } return !!ok; };
  const same = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

  // the throwaway copy and everything that must be stopped again
  const TMP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `crophalo-${name}-`))), SITE = path.join(TMP, 'site');
  let server, chrome, cdp;
  const stopAll = () => {   // by PID only, and only what this run started
    if (over) return; over = true;
    clearTimeout(watchdog);
    cdp?.close();
    // a browser still running here is stopped at once: SIGKILL runs nothing more inside it, so it can never trip over its removed profile and crash (a crash puts a report dialog on the owner's screen)
    for (const child of [chrome, server]) if (child?.pid && child.exitCode == null && !child.signalCode) { try { process.kill(child.pid, child === chrome ? 'SIGKILL' : 'SIGTERM'); } catch { /* it had already stopped */ } }
    if (env.E2E_KEEP === '1') say(`${name}: the throwaway copy is kept in ${TMP}`);
    else try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* the browser still held a file: the system clears its temp folder */ }
  };
  const watchdog = setTimeout(() => { say(`FAIL  ${name}: the run took more than ${RUN_MS / 60e3} minutes and was stopped`); stopAll(); process.exit(1); }, RUN_MS);
  process.on('exit', stopAll);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stopAll(); process.exit(1); });
  for (const kind of ['uncaughtException', 'unhandledRejection']) process.on(kind, e => { say(`FAIL  ${name}: stopped by an error  (${e?.message || e})`); stopAll(); process.exit(1); });

  for (const rel of copyList()) fs.cpSync(path.join(ROOT, rel), path.join(SITE, rel), { recursive: true });
  for (const dir of ['cache', 'home', 'profile']) fs.mkdirSync(path.join(TMP, dir));

  // the copied server, on a free port, with no Python, no login and an empty home, so no lookup and no saved field of the owner's can be reached
  const serverEnv = { ...env, PORT: env.E2E_PORT || '0', HOST: '127.0.0.1', FW_CACHE: path.join(TMP, 'cache'), FW_PYTHON: path.join(TMP, 'no-python'), HOME: path.join(TMP, 'home'), USERPROFILE: path.join(TMP, 'home') };
  for (const key of ['EARTHDATA_USERNAME', 'EARTHDATA_PASSWORD', 'NETRC', 'RENDER', 'ALLOWED_HOSTS', 'RENDER_EXTERNAL_HOSTNAME']) delete serverEnv[key];
  server = spawn(process.execPath, [path.join(SITE, 'scripts', 'serve.mjs')], { cwd: SITE, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((done, bad) => {
    let out = '';
    const timer = setTimeout(() => bad(new Error('the copied server did not start in 15 s')), 15e3);
    server.stdout.on('data', d => { out += d; const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out); if (m) { clearTimeout(timer); done(+m[1]); } });
    server.stderr.on('data', d => { out += d; });
    server.on('exit', code => { clearTimeout(timer); bad(new Error(`the copied server stopped at once (${code}): ${out.trim().slice(0, 200)}`)); });
  });
  if (realPorts().has(port)) refuse(portRefusal(port));   // a free port handed out by the system could still be the real one
  const BASE = `http://127.0.0.1:${port}`;

  // the browser, with a new empty profile; its own port is read from the file it writes there
  const profile = path.join(TMP, 'profile');
  chrome = spawn(browser, [...FLAGS, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let gone = false; chrome.on('exit', () => { gone = true; });
  let wsPath = '';
  for (let i = 0; i < 300 && !wsPath && !gone; i++) {
    try { const [p, rest] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n'); if (+p && rest) wsPath = `ws://127.0.0.1:${+p}${rest.trim()}`; } catch { /* not written yet */ }
    if (!wsPath) await sleep(100);
  }
  if (!wsPath) throw new Error(gone ? 'the browser stopped at once' : 'the browser did not open its remote control in 30 s');
  cdp = await connect(wsPath);
  const { targetInfos } = await cdp.send('Target.getTargets');   // the window the browser opened itself: a second tab would sit in the background, where nothing is drawn and no animation ever ends
  const targetId = targetInfos.find(t => t.type === 'page')?.targetId ?? (await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId;
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = !env.E2E_TRACE ? (method, params) => cdp.send(method, params, sessionId)   // E2E_TRACE=1 names every call that took over half a second, to find what makes a suite slow
    : async (method, params) => { const t = Date.now(), r = await cdp.send(method, params, sessionId); if (Date.now() - t > 500) say(`slow  ${Date.now() - t} ms  ${method} ${JSON.stringify(params || {}).slice(0, 140)}`); return r; };

  // what the page says and asks for: every error counts; a cut-off outside request is only listed
  const noise = text => /ERR_INTERNET_DISCONNECTED/.test(text);
  cdp.on((method, p) => {
    if (method === 'Runtime.exceptionThrown') errors.push('page error: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'unknown').split('\n')[0]);
    else if (method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) errors.push('console.error: ' + (p.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
    else if (method === 'Log.entryAdded' && p.entry?.level === 'error' && !noise(p.entry.text || '')) errors.push(`browser error: ${p.entry.text} ${p.entry.url || ''}`.trim().slice(0, 240));
    else if (method === 'Network.requestWillBeSent' && p.request?.url?.startsWith(BASE)) asked.push(p.request.url.slice(BASE.length));
    else if (method === 'Fetch.requestPaused') {
      const url = p.request.url, own = url.startsWith(BASE + '/') || url === BASE || liveHost(url);   // liveHost: only the hosts a by-hand check names in E2E_LIVE_HOSTS; none in the automatic suites
      if (own) return void send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
      let where = url; try { const u = new URL(url); where = u.host + u.pathname; } catch { /* listed as it came */ }   // never the query: it can hold a field's position
      cutOff.push({ where, kind: p.resourceType });
      send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'InternetDisconnected' }).catch(() => {});
    }
  });
  for (const domain of ['Page', 'Runtime', 'Log', 'Network']) await send(`${domain}.enable`);
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });   // the page behaves as the window in front, as it is for a farmer: focus lands where it should
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http://*' }, { urlPattern: 'https://*' }] });

  // ---- the helpers
  async function js(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('in the page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0]);
    return r.result.value;
  }
  const page = (fn, ...args) => js(`(() => { const T = (${pageKit})(); return (${fn})(T, ...${JSON.stringify(args)}); })()`);   // a real function, run in the page with the kit first
  async function until(expression, ms = 5000) {
    for (const end = Date.now() + ms; ;) { const v = await js(expression); if (v) return v; if (Date.now() > end) throw new Error(`waited ${ms} ms for: ${expression.slice(0, 120)}`); await sleep(100); }
  }
  const seen = (expression, ms = 3000) => until(expression, ms).then(() => true, () => false);
  const click = sel => page((T, sel) => { const el = document.querySelector(sel); if (!el) throw new Error('click: nothing matches ' + sel); el.click(); }, sel);
  const mouse = (type, at, held = 0) => send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: held || type !== 'mouseMoved' ? 'left' : 'none', buttons: type === 'mouseReleased' ? 0 : held, clickCount: type === 'mouseMoved' ? 0 : 1 });
  async function point(at, held = 0) {   // the browser answers a pointer move only with its next drawn frame, and an idle page may not draw one for seconds: ask for a frame, and never wait long
    const sent = mouse('mouseMoved', at, held).catch(() => {});
    await Promise.race([sent, js('new Promise(done => requestAnimationFrame(() => done(1)))').then(() => Promise.race([sent, sleep(300)]))]);
  }
  const aim = sel => page((T, sel) => {   // where a finger would land, and what is really there
    const el = document.querySelector(sel); if (!el) return { gone: true };
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const b = T.box(el), x = b.x + b.w / 2, y = b.y + b.h / 2, hit = document.elementFromPoint(x, y);
    const glass = visualViewport;   // a phone shrinks a page that is too wide to fit its glass: the mouse works on the glass, the page measures itself before the shrinking
    return { x: (x - glass.offsetLeft) * glass.scale, y: (y - glass.offsetTop) * glass.scale, ok: !!hit && (hit === el || el.contains(hit)), root: !hit || hit === document.documentElement || hit === document.body, by: T.name(hit) };
  }, sel);
  async function tap(sel) {   // a real mouse click, only after the page agrees that this is what the click will hit
    for (let i = 0; ; i++) {
      const at = await aim(sel);
      if (at.gone) throw new Error(`tap: nothing matches ${sel}`);
      if (at.ok) { await point(at); await mouse('mousePressed', at, 1); await mouse('mouseReleased', at); return; }
      if (!at.root || i >= 20) throw new Error(`tap: ${sel} is covered by ${at.by} at ${Math.round(at.x)}, ${Math.round(at.y)}`);
      await sleep(100);   // a change of view sends hits to the root for a moment
    }
  }
  const tapAt = async (x, y) => { await point({ x, y }); await mouse('mousePressed', { x, y }, 1); await mouse('mouseReleased', { x, y }); };   // a real click on a bare spot of the screen
  const rest = () => point({ x: 1, y: 1 });   // the pointer out of the way, so nothing is lit by hover
  async function press(key, { shift = false, ctrl = false, meta = false } = {}) {   // ctrl and meta for the undo keys: then the key types nothing
    const code = KEYS[key] ?? key.toUpperCase().charCodeAt(0), text = key === 'Enter' ? '\r' : key.length === 1 && !ctrl && !meta ? key : undefined;
    const name = key === ' ' ? 'Space' : /^\d$/.test(key) ? 'Digit' + key : key === '+' || key === '=' ? 'Equal' : key === '-' || key === '_' ? 'Minus' : key.length === 1 ? 'Key' + key.toUpperCase() : key;
    const base = { key, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0) };
    await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text, unmodifiedText: text } : {}) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
  // ---- more of the mouse: a drag in small steps, a double click, the wheel (shift held where a check asks for it)
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  async function dragMouse(a, b, { steps = 8, ms = 16, shift = false, hold = 0 } = {}) {
    const mods = shift ? 8 : 0;
    await point(a); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1, modifiers: mods });
    if (hold) await sleep(hold);
    for (let i = 1; i <= steps; i++) { const p = lerp(a, b, i / steps); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1, modifiers: mods }); await sleep(ms); }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1, modifiers: mods });
  }
  async function dblclickAt(x, y) {
    await point({ x, y });
    for (const clickCount of [1, 2]) { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount }); }
  }
  const wheel = (x, y, deltaY) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  // ---- touch, written new on the lines of the hand-driven walk: one finger, a swipe, two fingers. touchOn() before a load makes the page a touch screen.
  const touchOn = (on = true) => send('Emulation.setTouchEmulationEnabled', { enabled: on, maxTouchPoints: on ? 5 : 1 });
  const finger = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 12, radiusY: 12, force: 1 })) });
  async function touchTap(x, y, { hold = 60, wiggle = 0 } = {}) {   // wiggle: a brush of that many px while the finger is down
    await finger('touchStart', [{ x, y }]); await sleep(wiggle ? 30 : hold);
    if (wiggle) { await finger('touchMove', [{ x: x + wiggle, y: y + wiggle / 2 }]); await sleep(Math.max(0, hold - 30)); }
    await finger('touchEnd', []);
  }
  async function swipe(from, to, { steps = 12, ms = 16, hold = 30 } = {}) {   // hold: how long the finger rests before it moves
    await finger('touchStart', [from]); await sleep(hold);
    for (let i = 1; i <= steps; i++) { await finger('touchMove', [lerp(from, to, i / steps)]); await sleep(ms); }
    await finger('touchEnd', []);
  }
  async function pinch(center, from, to, { steps = 12, ms = 20, angle = 0 } = {}) {   // two fingers from "from" px apart to "to" px apart
    const pts = d => [{ x: center.x - Math.cos(angle) * d / 2, y: center.y - Math.sin(angle) * d / 2, id: 0 }, { x: center.x + Math.cos(angle) * d / 2, y: center.y + Math.sin(angle) * d / 2, id: 1 }];
    await finger('touchStart', pts(from)); await sleep(30);
    for (let i = 1; i <= steps; i++) { await finger('touchMove', pts(from + (to - from) * i / steps)); await sleep(ms); }
    await finger('touchEnd', []);
  }
  // The farmer has chosen the board before any page loads, so a strong test device does not open 3D by itself (the first-open rule, js/farm3d-rule.js). A suite that tests that rule switches it off:
  // E2E_FIRST_OPEN=1 for a whole run, or `await run.firstOpen(true)` for the pages loaded after it (and `false` to put it back).
  let seedId = null;
  const firstOpen = async on => {
    if (seedId) { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seedId }); seedId = null; }
    if (!on) seedId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { if (localStorage.getItem('crophalo.farm3d.v1') === null) localStorage.setItem('crophalo.farm3d.v1', 'board'); } catch (e) { /* a page that keeps nothing */ }" })).identifier;
  };
  await firstOpen(env.E2E_FIRST_OPEN === '1');
  let wide = 1280;
  const size = (w, h = w < 600 ? 780 : 900) => send((wide = w, 'Emulation.setDeviceMetricsOverride'), { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });   // a phone under 600 px
  const device = features => send('Emulation.setEmulatedMedia', { features: Object.entries(features || {}).map(([name, value]) => ({ name, value })) });   // device({ 'prefers-reduced-motion': 'reduce' }); device() puts it back
  async function go(where = '/') {   // a whole new load every time, so nothing is left over from the screen before
    await send('Page.navigate', { url: 'about:blank' });
    await send('Page.navigate', { url: BASE + where });
    await until(`document.readyState === 'complete' && (!document.querySelector('script[src="js/app.js"]') || / · Crophalo$/.test(document.title))`, 15e3);
  }
  async function flat(where) {   // no sideways scroll, and nothing wider than the screen; the three widest are named
    const m = await page((T, wide) => ({ ...T.widest(wide), cut: T.cut() }), wide);
    check(`fit: ${where}: the page does not scroll sideways`, m.page <= m.vw, `the page is ${m.page} px wide on a ${m.vw} px screen`);
    check(`fit: ${where}: nothing is wider than the screen`, m.count === 0, `${m.count} part(s) stick out; the widest: ${m.out.map(o => `${o.what} from ${o.from} to ${o.to} px`).join('; ')}`);
    check(`fit: ${where}: no words are cut off inside their box`, m.cut.length === 0, m.cut.join('; '));
  }
  async function calmPress(sel) {   // read while the mouse is HELD: a press may change the shade, never the size or the place
    const read = () => page((T, sel) => [document.querySelector(sel), ...document.querySelectorAll(sel + ' *')].filter(Boolean).map(el => { const b = T.box(el), m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return [T.name(el), b.x, b.y, b.w, b.h, Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)]; }), sel);
    const at = await aim(sel);
    if (at.gone || !at.ok) throw new Error(`calmPress: ${sel} ${at.gone ? 'is not on the page' : 'is covered by ' + at.by}`);
    await point(at); await sleep(250);   // hover has settled
    const before = await read(), moved = [];
    await js(`window.__held = event => { event.preventDefault(); event.stopImmediatePropagation(); }; addEventListener('click', window.__held, true)`);   // this one press must not choose anything
    await mouse('mousePressed', at, 1);
    for (const wait of [30, 90, 200]) {
      await sleep(wait);
      const now = await read();
      now.forEach((row, i) => { const was = before[i]; if (was && row.slice(1).some((v, k) => Math.abs(v - was[k + 1]) > (k < 4 ? .5 : .001))) moved.push(`${row[0]} went from ${was.slice(1).map(v => +v.toFixed(2))} to ${row.slice(1).map(v => +v.toFixed(2))}`); });
    }
    await mouse('mouseReleased', at);
    await js(`removeEventListener('click', window.__held, true); delete window.__held`);
    await rest();
    return [...new Set(moved)];
  }
  async function shot(file) {   // only when E2E_SHOTS names a folder outside the project
    if (!shots) return;
    fs.mkdirSync(shots, { recursive: true });
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(shots, file), Buffer.from(data, 'base64'));
  }
  async function group(label, body) {   // one group never stops the others, and every group starts from a clean page with nothing saved
    if (!wanted(label)) return;
    const from = errors.length, began = Date.now();
    try {
      await device(); await size(1280); await go('/'); await js('localStorage.clear(), sessionStorage.clear()'); await go('/'); await rest();
      await body();
    } catch (e) { check(`${label}: ran to its end`, false, e?.message || String(e)); }
    check(`${label}: no page error and no console error`, errors.length === from, errors.slice(from).join(' | '));
    if (env.E2E_TRACE) say(`${label}: ${Math.round((Date.now() - began) / 1e3)} s`);
  }
  async function finish() {
    const hosts = [...new Set(cutOff.map(c => `${c.where.split('/')[0]} (${c.kind})`))];
    if (hosts.length) say(`${name}: ${cutOff.length} outside request(s) were cut off, as meant: ${hosts.join(', ')}`);
    await cdp.send('Browser.close').catch(() => {});
    // wait until the browser has really stopped before its profile is removed (a busy computer can take seconds); only then is anything deleted
    const stopped = ms => new Promise(done => { if (!chrome?.pid || chrome.exitCode != null || chrome.signalCode) return done(true); const t = setTimeout(() => done(false), ms); chrome.once('exit', () => { clearTimeout(t); done(true); }); });
    if (!(await stopped(15e3))) { try { process.kill(chrome.pid, 'SIGKILL'); } catch { /* it had just stopped */ } await stopped(5e3); }
    stopAll();
    say(`${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }
  return { ROOT, SITE, BASE, browser, shots, send, js, page, until, seen, click, tap, tapAt, rest, press, size, device, go, flat, calmPress, firstOpen, shot, check, same, group, finish, sleep, errors, cutOff, asked,
    mouse, point, dragMouse, dblclickAt, wheel, touchOn, finger, touchTap, swipe, pinch };
}
