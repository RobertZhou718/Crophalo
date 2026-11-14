// Crophalo's push sender: reminders that reach a phone while Crophalo is closed. It holds a browser's push subscription and the few reminders
// the farmer chose to send (a name and a time), encrypts each one for that browser, and posts it to the browser maker's push service when it is due.
// It uses node:crypto only. The visitor's address is never kept: only a salted hash of its network, to cap how many browsers one visitor can add.
// Checked by scripts/test_remind.mjs (the published RFC 8291 example byte for byte, the signed token, accepted input, the store's limits, the retry rules, the routes
/*
 * Nothing here starts by itself: serve.mjs (or a test) calls createPush(), then handle() for /api/push/* and start() for the minute timer.
 * against a fake push service on a local port).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';

// ---- the limits, each named once
export const LIMITS = { subscriptions: 200, reminders: 50, perVisitor: 3, body: 64 * 1024, payload: 3993, title: 80, text: 300, endpoint: 700, ttl: 21600,
  lateMs: 6 * 3600e3, sentKeepMs: 24 * 3600e3, quietMs: 30 * 24 * 3600e3, spareMs: 60 * 24 * 3600e3, aheadMs: 400 * 24 * 3600e3, batch: 8, perMinute: 40, timeoutMs: 10e3, jwtMs: 12 * 3600e3 };
export const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];   // and any subdomain of each
const ID = /^[A-Za-z0-9_-]{4,40}$/;
const b64u = {
  enc: bytes => Buffer.from(bytes).toString('base64url'),
  dec: text => typeof text === 'string' && /^[A-Za-z0-9_-]*$/.test(text) ? Buffer.from(text, 'base64url') : null,
};
export { b64u };

// ---- RFC 8291 (aes128gcm): encrypt one message for one browser
const hkdf = (ikm, salt, info, length) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));
const isLoopback = host => /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(host);
// plaintext: Buffer. uaPublic: the browser's 65-byte key. authSecret: its 16-byte secret. fixed: { privateKey, salt } only for the published example.
export function encryptPush({ plaintext, uaPublic, authSecret, fixed = null, recordSize = 4096 }) {
  if (!Buffer.isBuffer(plaintext) || plaintext.length > LIMITS.payload) throw Object.assign(new Error('That is too big'), { code: 'too-big' });
  const ecdh = crypto.createECDH('prime256v1');
  if (fixed?.privateKey) ecdh.setPrivateKey(fixed.privateKey); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(), salt = fixed?.salt ?? crypto.randomBytes(16);
  const secret = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(secret, authSecret, keyInfo, 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const sealed = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);   // 0x02 marks the last record
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(recordSize, 16); header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, sealed]);
}
// The browser's side, used by the tests to read what was sent: the plaintext back from a body.
export function decryptPush({ body, uaPrivate, uaPublic, authSecret }) {
  const salt = body.subarray(0, 16), idLen = body[20], asPublic = body.subarray(21, 21 + idLen), sealed = body.subarray(21 + idLen);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(uaPrivate);
  const ikm = hkdf(ecdh.computeSecret(asPublic), authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const plain = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  return plain.subarray(0, plain.lastIndexOf(2));
}

// ---- the server's own key pair (VAPID, RFC 8292) and its signed token
const point = jwk => Buffer.concat([Buffer.from([4]), b64u.dec(jwk.x), b64u.dec(jwk.y)]);
export function newKeys() { const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }); return privateKey.export({ format: 'jwk' }); }
const goodKeys = jwk => { try { return jwk?.kty === 'EC' && jwk.crv === 'P-256' && point(jwk).length === 65 && !!b64u.dec(jwk.d) && crypto.createPrivateKey({ key: jwk, format: 'jwk' }).asymmetricKeyType === 'ec'; } catch { return false; } };
// The keys kept in dir/push-keys.json (mode 600, written to a temporary file and renamed); a damaged file is replaced by a new pair.
export function loadKeys(dir) {
  const file = path.join(dir, 'push-keys.json');
  try { const kept = JSON.parse(fs.readFileSync(file, 'utf8')); if (goodKeys(kept)) return kept; } catch { /* missing or damaged: make new ones */ }
  const jwk = newKeys();
  try { fs.mkdirSync(dir, { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(jwk), { mode: 0o600 }); fs.renameSync(tmp, file); } catch { /* an unwritable folder: the keys last until restart */ }
  return jwk;
}
export const publicKey = jwk => b64u.enc(point(jwk));
export function vapidToken(jwk, audience, contact, now = Date.now()) {
  const part = value => b64u.enc(JSON.stringify(value)), data = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({ aud: audience, exp: Math.floor((now + LIMITS.jwtMs) / 1000), sub: contact })}`;
  const signature = crypto.sign('sha256', Buffer.from(data), { key: crypto.createPrivateKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64u.enc(signature)}`;
}
export function verifyToken(token, jwk) {
  const [h, c, s] = String(token).split('.');
  try { return crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, b64u.dec(s)) ? JSON.parse(Buffer.from(c, 'base64url')) : null; } catch { return null; }
}

// ---- what is accepted
// The push address of a browser, or null: https on 443 to a browser maker's host (extra test hosts from `extra`; plain http only on loopback), no credentials, under 700 characters.
export function cleanEndpoint(text, extra = []) {
  if (typeof text !== 'string' || text.length > LIMITS.endpoint) return null;
  let url; try { url = new URL(text); } catch { return null; }
  if (url.username || url.password || url.hash) return null;
  const host = url.hostname;
  const known = [...PUSH_HOSTS, ...extra.filter(x => !isLoopback(x))].some(h => host === h || host.endsWith('.' + h));
  const loopback = extra.some(x => isLoopback(x)) && isLoopback(host) && (url.protocol === 'http:' || url.protocol === 'https:');
  if (loopback) return url.href;
  return known && url.protocol === 'https:' && (url.port === '' || url.port === '443') ? url.href : null;
}
export function cleanKeys(raw) {
  const p256dh = b64u.dec(raw?.p256dh), auth = b64u.dec(raw?.auth);
  if (!p256dh || !auth || p256dh.length !== 65 || p256dh[0] !== 4 || auth.length !== 16) return null;
  try { const probe = crypto.createECDH('prime256v1'); probe.generateKeys(); probe.computeSecret(p256dh); } catch { return null; }   // a point that is not on the curve is refused
  return { p256dh: b64u.enc(p256dh), auth: b64u.enc(auth) };
}
// One reminder as the sender keeps it, or null: an id of the client's pattern, a UTC time between 2000 and 2101 and at most 400 days ahead, words cut, a url on this site.
export function cleanReminder(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !ID.test(raw.id)) return null;
  const at = typeof raw.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/.test(raw.at) ? Date.parse(raw.at) : NaN;
  if (!Number.isFinite(at) || at < Date.UTC(2000, 0, 1) || at >= Date.UTC(2101, 0, 1) || at > now + LIMITS.aheadMs) return null;
  const text = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
  const title = text(raw.title, LIMITS.title);
  if (!title) return null;
  const url = typeof raw.url === 'string' && /^\/(?!\/)[^\s\\]{0,200}$|^\/$/.test(raw.url) ? raw.url : '/';
  return { id: raw.id, title, body: text(raw.body, LIMITS.text), at, url };
}

// ---- the store
const hexOf = text => crypto.createHash('sha256').update(text).digest('hex');
export function networkOf(address) {   // the visitor's network, not the visitor: IPv4 as it is, IPv6 as its /64
  const a = String(address ?? '').replace(/^::ffff:/i, '');
  if (a.includes(':')) return a.split(':').slice(0, 4).join(':').toLowerCase();
  return a;
}
function loadStore(file) {
  try { const s = JSON.parse(fs.readFileSync(file, 'utf8')); if (s && typeof s.salt === 'string' && s.subs && typeof s.subs === 'object' && !Array.isArray(s.subs)) return s; } catch { /* missing or damaged: start empty */ }
  return { salt: crypto.randomBytes(16).toString('hex'), subs: {} };
}
function saveStore(file, store) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 }); fs.renameSync(tmp, file); } catch { /* the sender still works from memory */ }
}

// ---- the sender
function postOnce(url, headers, body, timeoutMs) {   // no redirects, a short time limit
  return new Promise(resolve => {
    const u = new URL(url), client = u.protocol === 'http:' ? http : https;
    const req = client.request(u, { method: 'POST', headers: { ...headers, 'content-length': body.length }, timeout: timeoutMs }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode })); res.on('error', () => resolve({ status: 0 })); });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0 }); }); req.on('error', () => resolve({ status: 0 }));
    req.end(body);
  });
}
export const triesFor = status => status === 0 || status === 429 || status >= 500 ? 8 : 3;   // a network error, a busy service or a failing one is tried longer

export function createPush({ dir, env = process.env, now = () => Date.now(), post = postOnce, publicMode = false, siteHosts = [] } = {}) {
  const extra = String(env.FW_PUSH_HOSTS ?? '').split(',').map(s => s.trim()).filter(Boolean), file = path.join(dir, 'push-store.json');
  const keys = loadKeys(dir), store = loadStore(file), seen = new Map();
  let timer = null, busy = false;
  const contact = env.FW_PUSH_CONTACT || (siteHosts[0] ? `https://${siteHosts[0]}` : 'mailto:push@localhost.invalid');
  const keyOf = endpoint => hexOf(endpoint), netHash = address => crypto.createHmac('sha256', store.salt).update(networkOf(address)).digest('hex');
  const save = () => saveStore(file, store);

  // make room for one more browser: the one quiet longest, not updated for 60 days and with nothing due within 30 days, gives way
  function room() {
    if (Object.keys(store.subs).length < LIMITS.subscriptions) return true;
    const t = now(), spare = Object.entries(store.subs).filter(([, s]) => t - s.updated > LIMITS.spareMs && !s.reminders.some(r => r.at <= t + 30 * 864e5 && !r.sent)).sort((a, b) => a[1].updated - b[1].updated)[0];
    if (!spare) return false;
    delete store.subs[spare[0]]; return true;
  }
  function subscribe(body, address) {
    const endpoint = cleanEndpoint(body?.subscription?.endpoint, extra), k = cleanKeys(body?.subscription?.keys);
    if (!endpoint || !k) return { status: 400, json: { ok: false, error: 'That is not a push subscription this server can use' } };
    const id = keyOf(endpoint), net = netHash(address), t = now(), had = store.subs[id];
    if (publicMode && !had && Object.values(store.subs).filter(s => s.net === net).length >= LIMITS.perVisitor) return { status: 429, json: { ok: false, error: 'Push reminders are already on in 3 browsers from this internet connection. Turn push off in one of them first.' } };
    if (!had && !room()) return { status: 503, json: { ok: false, error: 'This server cannot take more push subscriptions right now' } };
    const given = Array.isArray(body.reminders) ? body.reminders : [], clean = given.map(r => cleanReminder(r, t)).filter(Boolean).filter(r => r.at > t - LIMITS.lateMs).sort((a, b) => a.at - b.at).slice(0, LIMITS.reminders);
    const before = new Map((had?.reminders ?? []).map(r => [r.id + '|' + r.at, r]));
    const reminders = clean.map(r => { const old = before.get(r.id + '|' + r.at); return { ...r, sent: old?.sent ?? 0, tries: old?.tries ?? 0 }; });
    store.subs[id] = { endpoint, ...k, updated: t, net, reminders };
    save();
    return { status: 200, json: { ok: true, kept: reminders.length, dropped: given.length - reminders.length } };
  }
  function unsubscribe(body) {
    const endpoint = cleanEndpoint(body?.endpoint, extra);
    if (endpoint) { delete store.subs[keyOf(endpoint)]; save(); }
    return { status: 200, json: { ok: true } };
  }

  // ---- one pass of the minute timer
  async function tick() {
    if (busy) return; busy = true;
    try {
      const t = now(); let changed = false;
      const due = [];
      for (const [id, s] of Object.entries(store.subs)) {
        const keep = s.reminders.filter(r => r.sent ? t - r.sent < LIMITS.sentKeepMs : t - r.at <= LIMITS.lateMs);
        if (keep.length !== s.reminders.length) { s.reminders = keep; changed = true; }
        if (!s.reminders.length && t - s.updated > LIMITS.quietMs) { delete store.subs[id]; changed = true; continue; }
        for (const r of s.reminders) if (!r.sent && r.at <= t) due.push([id, s, r]);
      }
      for (let i = 0; i < due.length; i += LIMITS.batch) {
        await Promise.all(due.slice(i, i + LIMITS.batch).map(async ([id, s, r]) => {
          const result = await send(s, r, t);
          if (result.status >= 200 && result.status < 300) r.sent = t;
          else if (result.status === 404 || result.status === 410) delete store.subs[id];
          else if (result.status === 413) s.reminders = s.reminders.filter(x => x !== r);
          else { r.tries = (r.tries ?? 0) + 1; if (r.tries >= triesFor(result.status)) s.reminders = s.reminders.filter(x => x !== r); }
          changed = true;
        }));
      }
      if (changed) save();
    } finally { busy = false; }
  }
  async function send(s, r, t) {
    let body;
    try { body = encryptPush({ plaintext: Buffer.from(JSON.stringify({ title: r.title, body: r.body, tag: `${r.id}|${new Date(r.at).toISOString()}`, url: r.url })), uaPublic: b64u.dec(s.p256dh), authSecret: b64u.dec(s.auth) }); }
    catch (e) { return { status: e.code === 'too-big' ? 413 : 400 }; }
    const audience = new URL(s.endpoint).origin;
    return post(s.endpoint, { 'content-type': 'application/octet-stream', 'content-encoding': 'aes128gcm', ttl: String(LIMITS.ttl), urgency: 'normal',
      authorization: `vapid t=${vapidToken(keys, audience, contact, t)}, k=${publicKey(keys)}`, 'crypto-key': `p256ecdsa=${publicKey(keys)}` }, body, LIMITS.timeoutMs);
  }

  // ---- the routes under /api/push/
  function limited(address) {
    const t = now(), net = netHash(address), hits = (seen.get(net) ?? []).filter(x => t - x < 60e3);
    hits.push(t); seen.set(net, hits);
    if (seen.size > 5000) for (const [k, v] of seen) if (!v.some(x => t - x < 60e3)) seen.delete(k);
    return hits.length > LIMITS.perMinute;
  }
  const reply = (res, status, json, extraHeaders = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders }); res.end(JSON.stringify(json)); };
  // True when the request was for /api/push/…: the answer has been sent.
  async function handle(req, res, pathname) {
    if (!/^\/api\/push(\/|$)/.test(pathname)) return false;
    const host = String(req.headers.host ?? '').toLowerCase(), hostName = host.replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '[$1]');
    const mine = isLoopback(hostName) || siteHosts.some(h => host === h.toLowerCase() || hostName === h.toLowerCase());
    const origin = req.headers.origin;
    if (!mine || (origin && (() => { try { return new URL(origin).host.toLowerCase() !== host; } catch { return true; } })())) { reply(res, 403, { ok: false, error: 'Not allowed from here' }); return true; }
    const address = req.socket?.remoteAddress;
    if (pathname === '/api/push/key') { if (req.method !== 'GET') reply(res, 405, { ok: false, error: 'Use GET' }); else reply(res, 200, { ok: true, key: publicKey(keys) }); return true; }
    if (pathname !== '/api/push/subscribe' && pathname !== '/api/push/unsubscribe') { reply(res, 404, { ok: false, error: 'Unknown endpoint' }); return true; }
    if (req.method !== 'POST') { reply(res, 405, { ok: false, error: 'Use POST' }, { allow: 'POST' }); return true; }
    if (limited(address)) { reply(res, 429, { ok: false, error: 'Too many requests. Wait a moment and try again.' }, { 'retry-after': '30' }); return true; }
    if (!/^application\/json\b/i.test(String(req.headers['content-type'] ?? ''))) { reply(res, 415, { ok: false, error: 'Send JSON' }); return true; }
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > LIMITS.body) { reply(res, 413, { ok: false, error: 'That is too big' }); req.destroy?.(); return true; } chunks.push(chunk); }
    let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { reply(res, 400, { ok: false, error: 'That is not valid JSON' }); return true; }
    const answer = pathname === '/api/push/subscribe' ? subscribe(body, address) : unsubscribe(body);
    reply(res, answer.status, answer.json, answer.status === 429 ? { 'retry-after': '30' } : {});
    return true;
  }
  const start = () => { stop(); timer = setInterval(() => { tick().catch(() => {}); }, 60e3); timer.unref?.(); };
  const stop = () => { if (timer) clearInterval(timer); timer = null; };
  return { handle, tick, start, stop, subscribe, unsubscribe, store, keys, publicKey: () => publicKey(keys), file };
}
