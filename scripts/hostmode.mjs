// Crophalo on a host: everything the server decides differently when it is public, in one place with no side effects, so it can be tested without a network. serve.mjs asks it for the answers.
// Public means the address the server listens on can be reached from outside this computer (or FW_FORCE_PUBLIC=1, which a test uses to try public mode on a local address; it never makes the server less careful).
// Pure: isPublic(), allowedHosts(), trustHops(), rateLimit(), memoryBudget(), memoryPlan(), securityHeaders(), isLocalOnly(), hostGate(), siteOrigins(), originAllowed(), corsHeaders(), preflight(). The two timers (startRenewal, startMemoryLog) take the clock and the timer as arguments.
// Checked by scripts/test_hostmode.mjs (every setting with a 512 MB, a 2 GB and a big host, the gate's answers, the renewal's timing, the pruning), scripts/test_cors.mjs (the website's pages on another name: who may read the answers, the browser's question before a POST) and by scripts/canary.mjs against a running copy.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MB = 1024 * 1024, H = 3600e3;
const LOOPBACK = ['127.0.0.1', 'localhost', '::1'];
// A server started on 127.0.0.1 with a proxy or a name in front of it (a host's own proxy, nginx) is reached from outside too: the host's settings say so (ALLOWED_HOSTS, the host's own name, a proxy count above 0, or PUBLIC_SITE=1).
export const behindProxy = (env = {}) => !!String(env.ALLOWED_HOSTS || env.RENDER_EXTERNAL_HOSTNAME || env.CONTAINER_APP_NAME || '').trim() || parseInt(env.TRUST_PROXY_HOPS, 10) > 0 || env.PUBLIC_SITE === '1';
export const isPublic = (host, env = {}) => env.FW_FORCE_PUBLIC === '1' || !LOOPBACK.includes(host) || behindProxy(env);
// The names the server answers on: the host's own name (Render gives RENDER_EXTERNAL_HOSTNAME; Azure Container Apps gives the app's name and its environment's DNS suffix), then ALLOWED_HOSTS.
const azureName = env => (env.CONTAINER_APP_NAME && env.CONTAINER_APP_ENV_DNS_SUFFIX ? `${env.CONTAINER_APP_NAME}.${env.CONTAINER_APP_ENV_DNS_SUFFIX}` : '');
export const allowedHosts = (env = {}) => [...new Set([env.RENDER_EXTERNAL_HOSTNAME, azureName(env), ...String(env.ALLOWED_HOSTS || '').split(',')].map(h => String(h || '').trim().toLowerCase()).filter(Boolean))];
// How many proxies stand in front: TRUST_PROXY_HOPS when given, else 1 on Render and on Azure Container Apps (each one's proxy appends the address it saw), else 0.
export const trustHops = (env = {}, publicMode = false) => (String(env.TRUST_PROXY_HOPS ?? '') !== '' ? Math.max(0, parseInt(env.TRUST_PROXY_HOPS, 10) || 0) : publicMode && (env.RENDER || env.CONTAINER_APP_NAME) ? 1 : 0);
export const rateLimit = (env = {}) => Number(env.RATE_PER_MIN) > 0 ? Math.floor(Number(env.RATE_PER_MIN)) : 180;

// ---- memory: the one real risk on a small host
// The memory this process may really use: a container's own limit when it has one (os.totalmem() in a container reports the whole machine, not the limit), else the machine's.
export function memoryBudget({ totalmem, constrained = 0, env = {} } = {}) {
  const asked = Number(env.FW_MEMORY_MB) > 0 ? Number(env.FW_MEMORY_MB) * MB : 0;   // a test, or an owner who knows better, can say it
  if (asked) return asked;
  const limit = Number.isFinite(constrained) && constrained > 0 && constrained < 2 ** 50 ? constrained : Infinity;
  return Math.min(Number(totalmem) || Infinity, limit);
}
// Each lookup's measured peak is 27 to 105 MB, the largest being the height map; Node itself takes about 80 MB with the app's files and compressed copies.
export const PEAK_MB = 110, NODE_MB = 80, SMALL_MB = 2048, BIG_MB = 7500;
export function memoryPlan(budgetBytes, env = {}) {
  const mb = budgetBytes / MB, small = mb < SMALL_MB, big = mb >= BIG_MB;
  const room = Math.max(0, mb * 0.8 - NODE_MB), byRoom = Math.max(1, Math.floor(room / PEAK_MB));
  const asked = Math.floor(Number(env.FW_LIVE_MAX ?? env.LIVE_MAX));
  return {
    mb: Math.round(mb), small, big,
    liveMax: Number.isFinite(asked) && asked >= 1 ? asked : big ? 4 : Math.min(byRoom, 4),   // 512 MB: 2 at once; 1 GB (the Azure size): 4; this Mac: 4
    liveWaitMax: 24,
    smapWorkers: Number(env.FW_SMAP_WORKERS) >= 1 ? Math.floor(Number(env.FW_SMAP_WORKERS)) : big ? 8 : 2,
    smapKeepDays: Number(env.FW_SMAP_KEEP) >= 1 ? Math.floor(Number(env.FW_SMAP_KEEP)) : big ? 96 : 16,
    nodeHeapMB: Math.max(96, Math.min(512, Math.round(mb * 0.3))),   // --max-old-space-size for Node: a leak ends in a restart, not in the host killing the whole container
    warmPoints: big,   // the warm points of SMAP run only on big machines
    answersMax: small ? 120 : 300, answersMB: small ? 24 : 64,   // the in-memory answers stay bounded
  };
}
// A lookup waits while the whole process tree is already above this share of the budget (the next one would tip it over).
export const waitAbove = budgetBytes => budgetBytes * 0.75;
export const mustWait = (rssBytes, budgetBytes, running) => running > 0 && rssBytes > waitAbove(budgetBytes);

// ---- the headers every answer carries (serve.mjs puts them on first, so none can miss them; deploy/staticwebapp.config.json gives a static host the same ones, and a full policy, for the website's own files)
// cors: the website's pages are on another name (ALLOWED_ORIGINS is set), so an answer also depends on the page that asks, and a cache must keep them apart.
// The CSP names no data address on purpose: the pages ask NASA, the weather and map services and Crophalo's own server, which may sit on another name.
// The content security policy of a public server that serves the pages itself: scripts only from the site and the inline scripts of its pages by hash (worked out from the files, so a changed page cannot leave a stale hash),
// styles from the site (the pages set a few in place), pictures and data from the hosts the app really asks, one by one, no wildcard. It is the policy deploy/staticwebapp.config.json carries and the golive check tried in a real browser.
// null when the folder has no page (a server that only answers /api): then the safe parts alone are sent, as before.
export const DATA_HOSTS = Object.freeze(['https://power.larc.nasa.gov', 'https://api.open-meteo.com', 'https://archive-api.open-meteo.com', 'https://ensemble-api.open-meteo.com', 'https://seasonal-api.open-meteo.com', 'https://climate-api.open-meteo.com', 'https://nominatim.openstreetmap.org', 'https://api.frankfurter.dev', 'https://gibs.earthdata.nasa.gov', 'https://tiles.openfreemap.org', 'https://elevation-tiles-prod.s3.amazonaws.com', 'https://rest.isric.org', 'https://tiles.maps.eox.at', 'https://basemap.nationalmap.gov']);   // the setup map's land layers (Terrain Tiles heights, SoilGrids at the pin), then the clean satellite base close up (Sentinel-2 cloudless 2016 by EOX, USGS aerial photos)
export function pagePolicy(root) {
  const hashes = []; let any = false;
  for (const page of ['index.html', 'design.html']) {
    let html = ''; try { html = fs.readFileSync(path.join(root, page), 'utf8'); any = true; } catch { continue; }
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) if (m[1].trim()) hashes.push(`'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  }
  if (!any) return null;
  return [`default-src 'self'`, `script-src 'self' ${[...new Set(hashes)].join(' ')}`.trim(), `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob: https://gibs.earthdata.nasa.gov https://tiles.maps.eox.at https://basemap.nationalmap.gov`, `font-src 'self'`,
    `connect-src 'self' ${DATA_HOSTS.join(' ')}`, `worker-src 'self' blob:`, `child-src 'self' blob:`, `manifest-src 'self'`, `media-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`, `upgrade-insecure-requests`].join('; ');
}
export function securityHeaders(publicMode, { cors = false, csp = null } = {}) {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'x-frame-options': 'SAMEORIGIN',
    'permissions-policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
    'content-security-policy': publicMode && csp ? csp : "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",   // a public server that serves the pages sends the full policy (pagePolicy); otherwise only the safe parts
    vary: cors ? 'accept-encoding, origin' : 'accept-encoding',
    ...(publicMode ? { 'strict-transport-security': 'max-age=31536000' } : {}),   // the public site is reached over https only
  };
}
export const REQUIRED_HEADERS = Object.freeze(['x-content-type-options', 'referrer-policy', 'x-frame-options', 'permissions-policy', 'content-security-policy']);
// What is missing from a set of response headers (lower-case names), for the canary and the tests.
export const missingHeaders = (headers, publicMode = true) => [...REQUIRED_HEADERS, ...(publicMode ? ['strict-transport-security'] : [])].filter(n => !headers[n]);

// ---- routes that exist only for the person at this computer: a public server answers 404 for them, as if they were not there
export const LOCAL_ONLY = Object.freeze(['/api/userdata', '/api/local', '/api/admin', '/api/selftest', '/api/login-check', '/api/keys']);   // login-check asks NASA with the owner's login: only the person at this computer may start that; keys lists which keys and logins this server holds (true or false only: still nothing for a stranger, the Admin page reads /api/sources)
export const isLocalOnly = pathname => LOCAL_ONLY.some(p => pathname === p || pathname.startsWith(p + '/'));
// One decision for a request path on a public server: { status, reason } to refuse, or null to go on.
export function hostGate(pathname, publicMode) {
  if (publicMode && isLocalOnly(pathname)) return { status: 404, reason: 'Unknown endpoint' };
  return null;
}

// ---- the website on one name, this server on another (a static host for the pages, this server for /api only)
// ALLOWED_ORIGINS lists the website's own addresses, comma or space separated: scheme and name, a port only when it is not the usual one, nothing after it
// (https:// always; plain http:// only for this computer itself, for a copy run by hand or a test). Only pages from those addresses may read this server's answers
// in a browser. A wildcard is never taken, on any server: an answer every website could read would let any page spend this server's time and its NASA login.
const LOOPBACK_NAME = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const HOST_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
export function cleanSiteOrigin(text) {   // one address as a browser writes it in its Origin header, or '' when it is not one that may be allowed
  const m = /^(https?):\/\/([a-z0-9.-]+|\[::1\])(?::(\d{1,5}))?\/?$/.exec(String(text ?? '').trim().toLowerCase());
  if (!m || !(HOST_NAME.test(m[2]) || m[2] === '[::1]')) return '';
  const scheme = m[1], host = m[2], port = m[3] === undefined ? null : Number(m[3]);
  if (port !== null && (port < 1 || port > 65535)) return '';
  if (scheme === 'http' && !LOOPBACK_NAME.test(host)) return '';
  const usual = port === null || (scheme === 'https' && port === 443) || (scheme === 'http' && port === 80);
  return `${scheme}://${host}${usual ? '' : ':' + port}`;
}
// { list: the clean addresses, refused: what was written but cannot be used (said in the log at the start) }
export function siteOrigins(env = {}) {
  const list = [], refused = [];
  for (const word of String(env.ALLOWED_ORIGINS || '').split(/[\s,]+/).filter(Boolean)) {
    const clean = word.includes('*') ? '' : cleanSiteOrigin(word);
    if (!clean) refused.push(word); else if (!list.includes(clean)) list.push(clean);
  }
  return { list, refused };
}
export const originAllowed = (origin, list = []) => typeof origin === 'string' && origin !== '' && list.includes(origin.trim().toLowerCase());
// The header that lets the asking page read the answer: the page's own address back, never '*', and nothing at all for a page that is not on the list.
export const corsHeaders = (origin, list = []) => (originAllowed(origin, list) ? { 'access-control-allow-origin': origin.trim().toLowerCase() } : {});
// The browser's question before a request that is not a plain GET (a POST of JSON for the reminder pushes): OPTIONS with the page's address, the method and the headers it wants.
// Returns { status: 204, headers } to say yes, or { status: 403, headers, reason } to say no. Methods: GET and POST for the push routes, GET and HEAD for the rest; one header, content-type.
export const PREFLIGHT_MAX_AGE_S = 600;
export function preflight(pathname, origin, method, wanted, list = []) {
  const vary = { vary: 'origin, access-control-request-method, access-control-request-headers' };
  if (!originAllowed(origin, list)) return { status: 403, headers: vary, reason: 'Requests from other websites are not allowed' };
  const methods = /^\/api\/push(\/|$)/.test(pathname) ? ['GET', 'POST'] : ['GET', 'HEAD'];
  const asked = String(method ?? '').trim().toUpperCase(), headers = String(wanted ?? '').toLowerCase().split(',').map(h => h.trim()).filter(Boolean);
  if (!methods.includes(asked) || headers.some(h => h !== 'content-type')) return { status: 403, headers: vary, reason: `Use ${methods.join(' or ')}, with no header but content-type` };
  return { status: 204, headers: { ...vary, 'access-control-allow-origin': origin.trim().toLowerCase(), 'access-control-allow-methods': methods.join(', '), 'access-control-allow-headers': 'content-type', 'access-control-max-age': String(PREFLIGHT_MAX_AGE_S) } };
}

// ---- shared data: renewed on a timer so no visitor ever waits for it and nothing needs a person
// rows: [{ id, ttl (ms), warm: async () => boolean, changed?: async () => boolean }]. Each is asked 4 s after start, then every `every` ms; it is rebuilt when its copy would run out within `lead`
// ms (6.5 hours before it expires) and, where changed() is given, only when the source says it changed. now(), setTimer() and clearTimer() can be stood in for.
export const RENEW = { first: 4000, every: 6 * H, lead: 6.5 * H };
export function dueRows(rows, last, now, lead = RENEW.lead) {
  return rows.filter(r => { const at = last.get(r.id); return at === undefined || now - at >= Math.max(H, r.ttl - lead); });
}
export function startRenewal(rows, { now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout, log = () => {}, first = RENEW.first, every = RENEW.every, lead = RENEW.lead } = {}) {
  const last = new Map(); let timer = null, stopped = false, running = false;
  async function tick() {
    if (running || stopped) return; running = true;
    try {
      for (const row of dueRows(rows, last, now(), lead)) {
        try {
          if (row.changed && last.has(row.id) && !(await row.changed())) { log(`${row.id}: source unchanged`); continue; }   // not marked as renewed: it is asked again at the next look, until the source changes
          const ok = await row.warm(); if (ok !== false) last.set(row.id, now()); log(`${row.id}: ${ok === false ? 'not renewed' : 'renewed'}`);
        } catch (e) { log(`${row.id}: renewal failed: ${e?.message || e}`); }
      }
    } finally { running = false; if (!stopped) timer = setTimer(tick, every); timer?.unref?.(); }
  }
  timer = setTimer(tick, first); timer?.unref?.();
  return { stop() { stopped = true; clearTimer(timer); }, last, tick };
}
// Answers older than twice their time limit are removed, so a busy site never fills the disk. Returns how many went. Names are <id>_<hash>.json or final-<id>_<hash>.json.
export function pruneCache(dir, ttlOf, { now = Date.now(), fsImpl = fs } = {}) {
  let gone = 0, names = [];
  try { names = fsImpl.readdirSync(dir); } catch { return 0; }
  for (const name of names) {
    const m = /^(?:final-)?([a-z0-9]+)_[0-9a-f]+\.json$/.exec(name); if (!m) continue;
    const ttl = ttlOf(m[1]); if (!ttl) continue;
    try { const file = path.join(dir, name); if (now - fsImpl.statSync(file).mtimeMs > 2 * ttl) { fsImpl.rmSync(file); gone++; } } catch { /* removed meanwhile */ }
  }
  return gone;
}
// A line for the log once a minute while busy: the server's own memory, so a host's graph and the log agree. No address, no field.
export function memoryLine(usage, budgetBytes, running, queued) {
  return `memory: rss ${Math.round(usage.rss / MB)} MB of ${Math.round(budgetBytes / MB)} MB, heap ${Math.round(usage.heapUsed / MB)} MB, lookups running ${running}, waiting ${queued}`;
}

// ---- what a failed lookup may tell a visitor: a sentence, never an address, a path, a key or a stack. A lookup's own reason (or the words of an error such as "spawn /home/app/.venv/bin/python EACCES")
// is cleaned here before it is kept, counted in /api/sources or sent: web addresses, anything with a slash, "key=value" and "Bearer x" parts, long tokens and stack frames go; at most 160 characters.
export function scrubReason(text, fallback = 'The lookup did not give an answer.') {
  let t = String(text ?? '').replace(/https?:\/\/\S+/gi, ' ').replace(/\bBearer\s+\S+/gi, ' ').replace(/\S*[\/\\]\S*/g, ' ').replace(/\b[\w.\-]*(?:key|token|secret|password|passwd|pwd|auth|login)[\w\-]*\s*[=:]\s*\S+/gi, ' ')
    .replace(/\b[A-Za-z0-9_\-]{24,}\b/g, ' ').replace(/\s+at\s+\S+\s*\([^)]*\)/g, ' ').replace(/\b(?:Traceback|Exception)\b[^.]*:/g, ' ').replace(/[^A-Za-z0-9 .,;:()'’\-–%+]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return fallback;
  if (t.length > 160) t = t.slice(0, 159).replace(/\s\S*$/, '') + '.';
  return t;
}
