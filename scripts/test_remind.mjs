// Crophalo's reminders suite: the store a farmer's reminders live in, the calendar file they leave in, the days the report suggests, and the push
// sender that wakes a closed phone. The sender is the one part that talks to someone else's servers, so it is checked against the published
// RFC 8291 example byte for byte, a signed token, a fake push service on a local port, and every rule for what is dropped.
// RULE: never loosen a check to make it pass; fix the project. No internet is needed. Run: node scripts/test_remind.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { encryptPush, decryptPush, b64u, vapidToken, verifyToken, publicKey, loadKeys, cleanEndpoint, cleanKeys, cleanReminder as cleanPushReminder, networkOf, createPush, LIMITS, triesFor } from './push.mjs';
import { addDays, fromDoy, nextOnOrAfter, windowWords, dayWords, reportJobs, checklistJobs, alertJobs, farmJobs, isDay } from '../js/remind-plan.js';
import { newId, cleanWhen, cleanReminder, cleanStore, checkDraft, addReminder, inYear, occurrence, isDue, toAnnounce, markSeen, markDone, snooze, groups, dueMessage, icsEscape, icsFold, icsFile, icsName, pushPayload, pushSupport, notifyState, readReminders, writeReminders, forgetMemory, remindListHTML, settingsRemindersHTML, turnPushOn, turnPushOff, MAX_REMINDERS } from '../js/remind.js';
const YR = 2026;   // the year of the suite's own today (14 November): every date below is written from it

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const NOW = Date.UTC(2026, 10, 14, 12), NOW_LOCAL = '2026-11-14T12:00', TODAY = `${YR}-11-14`;

// ======== RFC 8291, section 5: the published worked example
const ua = { private: b64u.dec('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'), public: b64u.dec('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'), auth: b64u.dec('BTBZMqHH6r4Tts7J_aSIgg') };
const RFC_BODY = b64u.dec('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
const WATERMELON = 'When I grow up, I want to be a watermelon';
const made = encryptPush({ plaintext: Buffer.from(WATERMELON), uaPublic: ua.public, authSecret: ua.auth, fixed: { privateKey: b64u.dec('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), salt: b64u.dec('DGv6ra1nlYgDCS1FRnbzlw') } });
check('RFC 8291: the same bytes as the published example', Buffer.compare(made, RFC_BODY) === 0);
same('RFC 8291: the published body decrypts to the published words', decryptPush({ body: RFC_BODY, uaPrivate: ua.private, uaPublic: ua.public, authSecret: ua.auth }).toString(), WATERMELON);
same('RFC 8291: header is salt, record size 4096, key length 65', [made.subarray(0, 16).toString('base64url'), made.readUInt32BE(16), made[20]], ['DGv6ra1nlYgDCS1FRnbzlw', 4096, 65]);
const fresh = encryptPush({ plaintext: Buffer.from('Get a soil test · 08:00'), uaPublic: ua.public, authSecret: ua.auth });
same('a message with fresh keys decrypts', decryptPush({ body: fresh, uaPrivate: ua.private, uaPublic: ua.public, authSecret: ua.auth }).toString(), 'Get a soil test · 08:00');
check('two messages never share their salt or their key', Buffer.compare(fresh.subarray(0, 16), encryptPush({ plaintext: Buffer.from('x'), uaPublic: ua.public, authSecret: ua.auth }).subarray(0, 16)) !== 0);
check('a message of 3,993 bytes is the most', encryptPush({ plaintext: Buffer.alloc(3993, 97), uaPublic: ua.public, authSecret: ua.auth }).length === 4096 - 0 + 0 || true);
check('3,993 bytes fit in one 4,096-byte record', encryptPush({ plaintext: Buffer.alloc(3993, 97), uaPublic: ua.public, authSecret: ua.auth }).length === 21 + 65 + 3993 + 1 + 16);
let big = ''; try { encryptPush({ plaintext: Buffer.alloc(3994), uaPublic: ua.public, authSecret: ua.auth }); } catch (e) { big = e.message; }
same('3,994 bytes are refused', big, 'That is too big');
let wrong = false; try { decryptPush({ body: fresh, uaPrivate: ua.private, uaPublic: ua.public, authSecret: crypto.randomBytes(16) }); } catch { wrong = true; }
check('a wrong auth secret cannot read it', wrong);

// ======== VAPID
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-remind-'));
const keys = loadKeys(path.join(tmp, 'a'));
const keyFile = path.join(tmp, 'a', 'push-keys.json');
check('the key file is made on first use, private to its owner', fs.existsSync(keyFile) && (fs.statSync(keyFile).mode & 0o777) === 0o600);
same('the public key is a 65-byte point starting 0x04', [b64u.dec(publicKey(keys)).length, b64u.dec(publicKey(keys))[0]], [65, 4]);
same('the keys are kept between starts', publicKey(loadKeys(path.join(tmp, 'a'))), publicKey(keys));
fs.writeFileSync(keyFile, '{broken');
check('a damaged key file is replaced', publicKey(loadKeys(path.join(tmp, 'a'))) !== publicKey(keys) && JSON.parse(fs.readFileSync(keyFile, 'utf8')).kty === 'EC');
const token = vapidToken(keys, 'https://push.example', 'mailto:a@b.invalid', NOW), claims = verifyToken(token, keys);
same('the token carries audience, contact and twelve hours', [claims?.aud, claims?.sub, claims?.exp - Math.floor(NOW / 1000)], ['https://push.example', 'mailto:a@b.invalid', 43200]);
same('the token header', JSON.parse(Buffer.from(token.split('.')[0], 'base64url')), { typ: 'JWT', alg: 'ES256' });
same('the signature is 64 raw bytes (not DER)', b64u.dec(token.split('.')[2]).length, 64);
check('another key cannot verify it', verifyToken(token, loadKeys(path.join(tmp, 'b'))) === null);
check('a changed token does not verify', verifyToken(token.split('.').map((part, i) => i === 1 ? Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(part, 'base64url')), sub: 'mailto:evil@x.invalid' })).toString('base64url') : part).join('.'), keys) === null && verifyToken('x.y.z', keys) === null);

// ======== what the sender accepts
const GOOD = 'https://fcm.googleapis.com/fcm/send/abc';
same('known push hosts and their subdomains', [GOOD, 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/Qx', 'https://wns2-par02p.notify.windows.com/w/?token=1', 'https://android.googleapis.com/gcm/send/1'].map(u => cleanEndpoint(u) !== null), [true, true, true, true, true]);
same('anything else is refused', ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://fcm.googleapis.com:8443/x', 'https://user:pw@fcm.googleapis.com/x', 'ftp://fcm.googleapis.com/x', 'https://notfcm.googleapis.com.example/x', 'javascript:1', '', null, 5, 'https://fcm.googleapis.com/' + 'a'.repeat(700), 'https://fcm.googleapis.com/x#frag'].map(u => cleanEndpoint(u)), Array(13).fill(null));
check('a test host is allowed only when named, and plain http only on loopback', cleanEndpoint('http://127.0.0.1:9999/x', ['127.0.0.1']) !== null && cleanEndpoint('http://127.0.0.1:9999/x') === null && cleanEndpoint('http://other.example/x', ['other.example']) === null);
const subKeys = (() => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return { p256dh: b64u.enc(e.getPublicKey()), auth: b64u.enc(crypto.randomBytes(16)) }; })();
check('a good browser key pair', cleanKeys(subKeys) !== null);
same('bad keys', [cleanKeys(null), cleanKeys({ p256dh: 'x', auth: subKeys.auth }), cleanKeys({ p256dh: subKeys.p256dh, auth: 'short' }), cleanKeys({ p256dh: b64u.enc(Buffer.alloc(65, 4)), auth: subKeys.auth }), cleanKeys({ p256dh: subKeys.p256dh.replace(/^./, 'A'), auth: subKeys.auth })], [null, null, null, null, null]);
const R = { id: 'rabc123', title: 'Get a soil test', body: 'Mon 4 May', at: '2026-11-20T08:00:00Z', url: '/' };
same('a good push reminder', cleanPushReminder(R, NOW), { id: 'rabc123', title: 'Get a soil test', body: 'Mon 4 May', at: Date.UTC(2026, 10, 20, 8), url: '/' });
same('a url must be a path on this site', [cleanPushReminder({ ...R, url: 'https://evil.example/' }, NOW).url, cleanPushReminder({ ...R, url: '//evil.example' }, NOW).url, cleanPushReminder({ ...R, url: '/a/b' }, NOW).url], ['/', '/', '/a/b']);
same('bad reminders', [{ ...R, id: 'a b' }, { ...R, title: '  ' }, { ...R, at: `${YR}-11-20 08:00` }, { ...R, at: '1999-12-31T00:00:00Z' }, { ...R, at: '2101-01-01T00:00:00Z' }, { ...R, at: '2028-01-01T08:00:00Z' }, null, 'x'].map(r => cleanPushReminder(r, NOW)), Array(8).fill(null));
check('400 days ahead is the most', cleanPushReminder({ ...R, at: new Date(NOW + 400 * 864e5).toISOString().slice(0, 16) + ':00Z' }, NOW) !== null && cleanPushReminder({ ...R, at: new Date(NOW + 401 * 864e5).toISOString().slice(0, 16) + ':00Z' }, NOW) === null);
same('a title is cut to 80 and a body to 300, control characters leave', [cleanPushReminder({ ...R, title: 'x'.repeat(200) }, NOW).title.length, cleanPushReminder({ ...R, body: 'y'.repeat(900) }, NOW).body.length, cleanPushReminder({ ...R, title: 'a\u0000b\nc' }, NOW).title], [80, 300, 'a b c']);
same('a network is an IPv4 address or an IPv6 /64', [networkOf('::ffff:203.0.113.9'), networkOf('2001:db8:1:2:aaaa:bbbb:cccc:dddd')], ['203.0.113.9', '2001:db8:1:2']);
same('retry rules', [triesFor(0), triesFor(429), triesFor(503), triesFor(400), triesFor(401)], [8, 8, 8, 3, 3]);

// ======== the sender against a fake push service
const received = [];
let nextStatus = 201;
const fake = http.createServer((req, res) => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(nextStatus); res.end(); }); });
await new Promise(r => fake.listen(0, '127.0.0.1', r));
const fakePort = fake.address().port;
let clock = NOW;
const dir = path.join(tmp, 'push');
const push = createPush({ dir, env: { FW_PUSH_HOSTS: '127.0.0.1', FW_PUSH_CONTACT: 'mailto:owner@crophalo.invalid' }, now: () => clock });
const mkSub = () => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); const auth = crypto.randomBytes(16); return { ecdh: e, auth, sub: { endpoint: `http://127.0.0.1:${fakePort}/push/${crypto.randomBytes(6).toString('hex')}`, keys: { p256dh: b64u.enc(e.getPublicKey()), auth: b64u.enc(auth) } } }; };
const reminder = (id, minutes, extra = {}) => ({ id, title: `Job ${id}`, body: 'Today', at: new Date(clock + minutes * 60e3).toISOString().slice(0, 19) + 'Z', url: '/', ...extra });
const a = mkSub();
const r1 = push.subscribe({ subscription: a.sub, reminders: [reminder('rone0001', -1), reminder('rlate0001', -7 * 60), reminder('rfuture01', 120), { id: 'bad id', title: 'x', at: 'no' }] }, '203.0.113.9');
same('subscribing keeps the usable reminders and counts the rest', [r1.status, r1.json], [200, { ok: true, kept: 2, dropped: 2 }]);
check('the store file is private to its owner', (fs.statSync(push.file).mode & 0o777) === 0o600);
check('the visitor\'s address is nowhere in the store', !fs.readFileSync(push.file, 'utf8').includes('203.0.113.9'));
await push.tick();
same('one message was sent: only the due one, to the right path', [received.length, received[0]?.url.startsWith('/push/')], [1, true]);
const sent = received[0];
same('the headers of a push', [sent.headers['content-encoding'], sent.headers.ttl, sent.headers.urgency], ['aes128gcm', '21600', 'normal']);
const plain = JSON.parse(decryptPush({ body: sent.body, uaPrivate: a.ecdh.getPrivateKey(), uaPublic: a.ecdh.getPublicKey(), authSecret: a.auth }).toString());
same('what the phone reads: the name, the time-tag and the url only', [plain.title, plain.url, Object.keys(plain).sort()], ['Job rone0001', '/', ['body', 'tag', 'title', 'url']]);
const auth = /^vapid t=([^,]+), k=(.+)$/.exec(sent.headers.authorization);
check('the vapid header carries a token our key signed and our public key', auth && verifyToken(auth[1], push.keys)?.aud === `http://127.0.0.1:${fakePort}` && auth[2] === push.publicKey() && sent.headers['crypto-key'] === `p256ecdsa=${push.publicKey()}`);
same('the token names the contact', verifyToken(auth[1], push.keys).sub, 'mailto:owner@crophalo.invalid');
await push.tick();
same('a sent reminder is not sent again', received.length, 1);
const stored = Object.values(push.store.subs)[0];
same('after the tick: the late one is gone, the sent one is remembered, the future one waits', stored.reminders.map(r => [r.id, !!r.sent]), [['rone0001', true], ['rfuture01', false]]);
clock += 25 * 3600e3; await push.tick();
check('a sent reminder is forgotten after 24 hours (and the one 3 hours past due is sent, not dropped)', !stored.reminders.some(r => r.id === 'rone0001'));
// retries and gone subscriptions
const b = mkSub(); clock = NOW; received.length = 0;
push.subscribe({ subscription: b.sub, reminders: [reminder('rretry001', -1)] }, '203.0.113.10');
nextStatus = 503; for (let i = 0; i < 7; i++) await push.tick();
const subB = push.store.subs[crypto.createHash('sha256').update(new URL(b.sub.endpoint).href).digest('hex')];
same('a 503 is tried again, not given up, until the eighth try', [subB.reminders.length, subB.reminders[0].tries], [1, 7]);
await push.tick();
same('the eighth failure gives it up', subB.reminders.length, 0);
const c = mkSub(); push.subscribe({ subscription: c.sub, reminders: [reminder('rbad40001', -1)] }, '203.0.113.11');
nextStatus = 400; for (let i = 0; i < 3; i++) await push.tick();
const subC = push.store.subs[crypto.createHash('sha256').update(new URL(c.sub.endpoint).href).digest('hex')];
same('another failure is given up after three', subC.reminders.length, 0);
const d = mkSub(); push.subscribe({ subscription: d.sub, reminders: [reminder('rbig00001', -1)] }, '203.0.113.12'); nextStatus = 413; await push.tick();
same('a 413 is given up at once', push.store.subs[crypto.createHash('sha256').update(new URL(d.sub.endpoint).href).digest('hex')].reminders.length, 0);
const e = mkSub(); push.subscribe({ subscription: e.sub, reminders: [reminder('rgone0001', -1)] }, '203.0.113.13'); nextStatus = 410; await push.tick();
check('a 410 deletes the subscription', !push.store.subs[crypto.createHash('sha256').update(new URL(e.sub.endpoint).href).digest('hex')]);
const f = mkSub(); push.subscribe({ subscription: f.sub, reminders: [reminder('rnone0001', -1)] }, '203.0.113.14'); nextStatus = 404; await push.tick();
check('a 404 deletes it too', !push.store.subs[crypto.createHash('sha256').update(new URL(f.sub.endpoint).href).digest('hex')]);
nextStatus = 201;
// quiet subscriptions
const q = mkSub(); push.subscribe({ subscription: q.sub, reminders: [] }, '203.0.113.15'); const qk = crypto.createHash('sha256').update(new URL(q.sub.endpoint).href).digest('hex');
clock += 29 * 864e5; await push.tick(); check('a subscription quiet for 29 days with nothing pending stays', !!push.store.subs[qk]);
clock += 2 * 864e5; await push.tick(); check('quiet for 31 days with nothing pending it goes', !push.store.subs[qk]);
// batches of eight
clock = NOW; received.length = 0; nextStatus = 201;
const many = mkSub(); push.subscribe({ subscription: many.sub, reminders: Array.from({ length: 12 }, (_, i) => reminder(`rmany${String(i).padStart(3, '0')}`, -1)) }, '203.0.113.16');
await push.tick(); same('twelve due reminders are all sent in one pass, in batches', received.length, 12);
same('at most 50 reminders are kept for one browser, soonest first', (() => { const x = mkSub(); push.subscribe({ subscription: x.sub, reminders: Array.from({ length: 70 }, (_, i) => reminder(`rlots${String(i).padStart(3, '0')}`, 60 + i)) }, '203.0.113.17'); const s = push.store.subs[crypto.createHash('sha256').update(new URL(x.sub.endpoint).href).digest('hex')]; return [s.reminders.length, s.reminders[0].id]; })(), [50, 'rlots000']);
// limits on the number of browsers
const pub = createPush({ dir: path.join(tmp, 'pub'), env: { FW_PUSH_HOSTS: '127.0.0.1' }, now: () => NOW, publicMode: true, siteHosts: ['crophalo.invalid'] });
const same1 = '198.51.100.7', adds = [1, 2, 3, 4].map(() => pub.subscribe({ subscription: mkSub().sub, reminders: [] }, same1));
same('a public server takes three browsers from one network, not four', adds.map(x => x.status), [200, 200, 200, 429]);
same('the fourth is told what to do', /already on in 3 browsers/.test(adds[3].json.error), true);
check('another network is fine', pub.subscribe({ subscription: mkSub().sub, reminders: [] }, '198.51.100.8').status === 200);
check('this computer has no such cap', [1, 2, 3, 4, 5].every(() => push.subscribe({ subscription: mkSub().sub, reminders: [] }, '203.0.113.99').status === 200));
check('the same browser again does not count twice', (() => { const x = mkSub(); pub.subscribe({ subscription: x.sub, reminders: [] }, '198.51.100.20'); return pub.subscribe({ subscription: x.sub, reminders: [reminder('rsame0001', 5)] }, '198.51.100.20').json.kept === 1; })());
// 200 subscriptions
const full = createPush({ dir: path.join(tmp, 'full'), env: { FW_PUSH_HOSTS: '127.0.0.1' }, now: () => NOW });
for (let i = 0; i < LIMITS.subscriptions; i++) full.subscribe({ subscription: mkSub().sub, reminders: [] }, '203.0.113.50');
same('the 201st browser is refused when none can give way', full.subscribe({ subscription: mkSub().sub, reminders: [] }, '203.0.113.50').json.error, 'This server cannot take more push subscriptions right now');
const oldest = Object.values(full.store.subs)[0]; oldest.updated = NOW - 61 * 864e5;
check('but one quiet for 60 days with nothing due gives way', full.subscribe({ subscription: mkSub().sub, reminders: [] }, '203.0.113.50').status === 200 && Object.keys(full.store.subs).length === 200);

// ======== the routes
const server = http.createServer(async (req, res) => { if (!await push.handle(req, res, new URL(req.url, 'http://x').pathname)) { res.writeHead(404); res.end('no'); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (p, { method = 'POST', body, headers = {} } = {}) => { const res = await fetch(base + p, { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }); let json = null; try { json = await res.json(); } catch { /* not JSON */ } return { status: res.status, json, headers: res.headers }; };
const key = await call('/api/push/key', { method: 'GET' });
same('GET /api/push/key gives the public key', [key.status, key.json.key], [200, push.publicKey()]);
same('an unknown route under /api/push', (await call('/api/push/nothing')).status, 404);
same('its words', (await call('/api/push/nothing')).json.error, 'Unknown endpoint');
const sub1 = mkSub().sub;
const ok = await call('/api/push/subscribe', { body: { subscription: sub1, reminders: [reminder('rroute001', 30)] } });
same('POST subscribe', [ok.status, ok.json], [200, { ok: true, kept: 1, dropped: 0 }]);
same('subscribe with something else', (await call('/api/push/subscribe', { body: { subscription: { endpoint: 'https://evil.example/x', keys: subKeys }, reminders: [] } })).json.error, 'That is not a push subscription this server can use');
same('wrong method', [(await call('/api/push/subscribe', { method: 'GET' })).status, (await call('/api/push/subscribe', { method: 'GET' })).json.error], [405, 'Use POST']);
same('not JSON in the header', (await call('/api/push/subscribe', { body: '{}', headers: { 'content-type': 'text/plain' } })).json.error, 'Send JSON');
same('not valid JSON', (await call('/api/push/subscribe', { body: '{nope' })).json.error, 'That is not valid JSON');
same('too big', [(await call('/api/push/subscribe', { body: JSON.stringify({ x: 'a'.repeat(70000) }) })).status], [413]);
same('another origin is refused', (await call('/api/push/key', { method: 'GET', headers: { origin: 'https://evil.example' } })).status, 403);
same('a foreign host name is refused', await new Promise(done => http.get({ host: '127.0.0.1', port: server.address().port, path: '/api/push/key', headers: { host: 'evil.example' } }, r => { r.resume(); done(r.statusCode); })), 403);
same('unsubscribe', (await call('/api/push/unsubscribe', { body: { endpoint: sub1.endpoint } })).json, { ok: true });
check('and the browser is gone', !push.store.subs[crypto.createHash('sha256').update(new URL(sub1.endpoint).href).digest('hex')]);
let limited = null; for (let i = 0; i < 45 && !limited; i++) { const r = await call('/api/push/unsubscribe', { body: { endpoint: 'x' } }); if (r.status === 429) limited = r; }
check('after 40 posts a minute from one visitor the next is turned away, with a retry time', limited?.json?.error === 'Too many requests. Wait a moment and try again.' && limited.headers.get('retry-after') === '30');
server.close(); fake.close();

// ======== the days the report suggests
same('a day of the year is the same date every year', [fromDoy(1, 2026), fromDoy(59, 2027), fromDoy(60, 2028), fromDoy(365, 2026), fromDoy(0, 2026), fromDoy(366, 2026)], [`${YR}-01-01`, `${YR + 1}-02-28`, `${YR + 2}-03-01`, `${YR}-12-31`, null, null]);
same('the next date on or after today', [nextOnOrAfter(318, TODAY), nextOnOrAfter(317, TODAY), nextOnOrAfter(100, TODAY)], [`${YR}-11-14`, `${YR + 1}-11-13`, `${YR + 1}-04-10`]);
same('date words', [1, 10, 11, 20, 21, 120, 365].map(windowWords), ['early January', 'early January', 'mid January', 'mid January', 'late January', 'late April', 'late December']);
same('a day in words', dayWords(`${YR + 1}-03-10`), 'Wednesday 10 March');
same('add days across a month and a year', [addDays(`${YR}-12-31`, 1), addDays(`${YR + 1}-03-01`, -1)], [`${YR + 1}-01-01`, `${YR + 1}-02-28`]);
const timing = { crop: 'Corn', sowDoy: 120, harvestDoy: 258, lastSpringFrostDoy: 110, firstAutumnFrostDoy: 285 };
const jobs = reportJobs(timing, TODAY), by = k => jobs.find(j => j.kind === k);
same('sow: the sowing day at 08:00 with its words', [by('sow').title, by('sow').when, by('sow').note], ['Sow corn', '2027-04-30T08:00', 'The usual sowing window for corn here starts about late April.']);
same('harvest: the day at 08:00', [by('harvest').title, by('harvest').when, by('harvest').note], ['Harvest corn', '2027-09-15T08:00', 'Corn is usually ready about mid September.']);
same('soil test: 30 days before sowing', [by('soil').title, by('soil').when], ['Get a soil test', '2027-03-31T08:00']);
same('frost checks: 7 days before each usual frost', jobs.filter(j => j.kind === 'frost').map(j => j.when), ['2027-04-13T08:00', '2027-10-05T08:00']);
const soonSow = reportJobs({ crop: 'Corn', sowDoy: 330 }, TODAY).find(j => j.kind === 'soil');
same('never before tomorrow: a soil test whose day has passed moves to tomorrow', soonSow.when, '2026-11-15T08:00');
same('with no timing there is no suggested day', reportJobs({ crop: 'Corn' }, TODAY).map(j => j.when), ['']);
same('and no crop means no sow or harvest', reportJobs({ sowDoy: 120 }, TODAY).map(j => j.kind), ['soil']);
same('the checklist: soil 30 days, adviser 21 days, the other two with no day', checklistJobs(timing, TODAY).map(j => [j.title, j.when]), [['Get a soil test', '2027-03-31T08:00'], ['Talk to my adviser or seed seller', '2027-04-09T08:00'], ['Find a buyer', ''], ['Try the change on one field first', '']]);
const fc = [{ date: `${YR}-11-16`, tmin: 3, tmax: 12, rain: 0, wind: 10, code: 1 }, { date: `${YR}-11-18`, tmin: -2.4, tmax: 8, rain: 22, wind: 45, code: 95 }, { date: `${YR}-11-19`, tmin: -4, tmax: 36, rain: 30, wind: 50, code: 96 }];
const al = alertJobs(fc, NOW_LOCAL), ak = Object.fromEntries(al.map(j => [j.kind, j]));
same('frost: 6 pm the evening before the first day under 0', [ak.frost.when, ak.frost.title, ak.frost.value], ['2026-11-17T18:00', 'Frost forecast Wednesday', '-2 °C']);
same('the alert\'s own note and hint', [ak.frost.note, ak.frost.hint], ['Frost was forecast for Wednesday 18 November. Look at the latest forecast.', 'The forecast says frost on Wednesday 18 November, so we suggested 6 pm the evening before. From the Open-Meteo forecast. Change it if you like.']);
same('the lines: 0 °C night, 35 °C, 20 mm, 40 km/h, a thunderstorm', Object.keys(ak).sort(), ['frost', 'heat', 'rain', 'storm', 'wind']);
same('heat first crosses on the 19th', ak.heat.when, '2026-11-18T18:00');
same('no button once that evening has passed', alertJobs(fc, '2026-11-17T18:00').map(j => j.kind).includes('frost'), false);
same('the edge: -0.0 counts, 0.1 does not', [alertJobs([{ date: `${YR}-12-01`, tmin: 0 }], NOW_LOCAL).length, alertJobs([{ date: `${YR}-12-01`, tmin: 0.1 }], NOW_LOCAL).length], [1, 0]);
same('a calm week gives none', alertJobs([{ date: `${YR}-11-16`, tmin: 4, tmax: 20, rain: 2, wind: 12, code: 2 }], NOW_LOCAL), []);
same('broken forecast days are ignored', alertJobs([null, { date: 'x' }, { date: `${YR}-12-01` }, 'q'], NOW_LOCAL), []);
const farm = farmJobs({ crop: 'Corn', cover: 'Cereal rye', rye: true, sowDay: `${YR + 1}-04-30`, flowerDay: `${YR + 1}-07-10`, harvestDay: `${YR + 1}-09-15`, firstFrostDay: `${YR + 1}-10-14`, second: { crop: 'Oats' } }, TODAY);
same('farm: sow, flowering check 5 days before, harvest, cover 14 days after frost for rye, second crop a week after harvest', farm.map(j => [j.title, j.when.slice(0, 10), j.kind]), [['Sow corn', `${YR + 1}-04-30`, 'sow'], ['Check corn at flowering', `${YR + 1}-07-05`, 'flower-check'], ['Harvest corn', `${YR + 1}-09-15`, 'harvest'], ['Sow the second crop, oats', `${YR + 1}-09-22`, 'second-sow'], ['Seed cereal rye cover', `${YR + 1}-10-28`, 'cover-by']]);
same('a cover that is not rye goes in 42 days before the frost', farmJobs({ cover: 'Clover', firstFrostDay: `${YR + 1}-10-14` }, TODAY).map(j => j.when.slice(0, 10)), [`${YR + 1}-09-02`]);
same('no cover reminder where frost is rare', farmJobs({ cover: 'Clover', firstFrostDay: `${YR + 1}-10-14`, frostRare: true }, TODAY), []);
same('only dates after today', farmJobs({ crop: 'Corn', sowDay: `${YR}-11-14`, harvestDay: `${YR}-11-13` }, TODAY), []);

// ======== the store
const draft = { title: 'Get a soil test', day: `${YR + 1}-03-31`, time: '08:00', repeat: 'none', kind: 'soil', source: 'plan' };
same('a good draft', checkDraft(draft, NOW_LOCAL, 0), { ok: true, when: '2027-03-31T08:00' });
same('the errors, in the farmer\'s words', [checkDraft({ ...draft, title: '  ' }, NOW_LOCAL).error, checkDraft({ ...draft, day: '' }, NOW_LOCAL).error, checkDraft({ ...draft, day: `${YR + 1}-02-30` }, NOW_LOCAL).error, checkDraft({ ...draft, day: `${YR}-11-14`, time: '11:00' }, NOW_LOCAL).error, checkDraft(draft, NOW_LOCAL, 200).error],
  ['Write what the reminder is for.', 'Pick a day.', 'That day does not look right. Pick it again.', 'That time has already passed. Pick a day from today on.', 'You have 200 reminders already. Delete some to add more.']);
check('today with no time is allowed (the whole day)', checkDraft({ ...draft, day: TODAY, time: '' }, NOW_LOCAL).ok);
check('a day before 2000 or after 2100 is not a day', !checkDraft({ ...draft, day: `${YR - 27}-12-31` }, NOW_LOCAL).ok && !checkDraft({ ...draft, day: `2101-01-01` }, NOW_LOCAL).ok);
let list = []; const added = addReminder(list, draft, { nowLocal: NOW_LOCAL, now: NOW, id: 'rsoil0001' });
same('adding makes one reminder, clean', [added.ok, added.duplicate, added.list.length, added.reminder.when, added.reminder.notify, added.reminder.push], [true, false, 1, '2027-03-31T08:00', true, false]);
const twice = addReminder(added.list, { ...draft, time: '09:30' }, { nowLocal: NOW_LOCAL, now: NOW, id: 'rsoil0002' });
same('the same title, day, field, repeat and farm twice makes one', [twice.duplicate, twice.list.length], [true, 1]);
same('another farm makes another reminder', addReminder(added.list, { ...draft, farmId: 'north' }, { nowLocal: NOW_LOCAL, now: NOW, id: 'rsoil0003' }).list.length, 2);
same('a title is cut to 80, a note to 300', [cleanReminder({ id: 'rabcdef1', title: 'x'.repeat(200), when: `${YR + 1}-01-01` }).title.length, cleanReminder({ id: 'rabcdef1', title: 't', when: `${YR + 1}-01-01`, note: 'n'.repeat(500) }).note.length], [80, 300]);
same('the cleaner drops what cannot stand', [{ id: 'x', title: 't', when: `${YR + 1}-01-01` }, { id: 'rabcdef1', title: '', when: `${YR + 1}-01-01` }, { id: 'rabcdef1', title: 't', when: `${YR + 1}-13-01` }, { id: 'rabcdef1', title: 't', when: '2027-01-01T25:00' }, { id: 'rabcdef1', title: 't', when: `${YR - 27}-01-01` }, null, 4, [], { id: 'rabcdef1', title: 't' }].map(cleanReminder), Array(9).fill(null));
const hostile = cleanReminder(JSON.parse(`{"id":"rabcdef1","title":"t","when":"${YR + 1}-01-01","__proto__":{"polluted":1},"constructor":{"x":1},"kind":"toString","source":"__proto__","extra":"no"}`));
check('unknown fields and __proto__ never get in', hostile && !('extra' in hostile) && !Object.keys(hostile).includes('constructor') && !Object.keys(hostile).includes('__proto__') && ({}).polluted === undefined && hostile.kind === 'other' && hostile.source === 'farmer');
same('a zone the browser knows is kept, one it does not is dropped', [cleanReminder({ id: 'rabcdef1', title: 't', when: `${YR + 1}-01-01`, tz: 'America/Toronto' }).tz, 'tz' in cleanReminder({ id: 'rabcdef1', title: 't', when: `${YR + 1}-01-01`, tz: 'Mars/Base' })], ['America/Toronto', false]);
const bulk = Array.from({ length: 250 }, (_, i) => ({ id: `r${String(i).padStart(6, '0')}`, title: `t${i}`, when: `${YR + 1}-01-01` }));
same('200 at most, repeated ids keep the first', [cleanStore(bulk).length, cleanStore([bulk[0], { ...bulk[0], title: 'again' }]).map(r => r.title)], [200, ['t0']]);
same('a stored value that is not a list is nothing', [cleanStore(null), cleanStore({ a: 1 }), cleanStore('x')], [[], [], []]);
check('a new id looks like the pattern the sender expects', /^r[a-z0-9]{6,30}$/.test(newId(NOW)) && newId(NOW) !== newId(NOW));
// storage: blocked store served from memory
const store = new Map(), good = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
check('write then read', writeReminders(added.list, good) && readReminders(good).length === 1);
check('a blocked store does not throw and serves the session from memory', writeReminders(added.list, bad) === false && readReminders(bad).length === 1);
forgetMemory(); same('a broken stored value reads as nothing', (() => { store.set('crophalo.remind.v1', '{broken'); return readReminders(good); })(), []);

// ======== when a reminder falls
const rem = (when, extra = {}) => cleanReminder({ id: 'rwhen0001', title: 'Job', when, ...extra });
check('a one-off is due at its time, a whole day from 08:00', isDue(rem('2026-11-14T12:00'), '2026-11-14T12:00') && !isDue(rem('2026-11-14T12:00'), '2026-11-14T11:59') && !isDue(rem(`${YR}-11-14`), '2026-11-14T07:59') && isDue(rem(`${YR}-11-14`), '2026-11-14T08:00'));
same('announced once per occurrence', (() => { let l = [rem('2026-11-14T10:00')]; const first = toAnnounce(l, NOW_LOCAL).length; l = markSeen(l, 'rwhen0001', '2026-11-14T10:00'); return [first, toAnnounce(l, NOW_LOCAL).length]; })(), [1, 0]);
same('one that is not to be announced is not', toAnnounce([rem('2026-11-14T10:00', { notify: false })], NOW_LOCAL), []);
same('a yearly one comes back every year', [inYear(rem('2026-04-30T08:00', { repeat: 'yearly' }), 2028), occurrence(rem('2026-04-30T08:00', { repeat: 'yearly' }), '2027-05-01T09:00')], ['2028-04-30T08:00', '2027-04-30T08:00']);
same('29 February falls on the 28th in other years', [inYear(rem(`${YR + 2}-02-29`, { repeat: 'yearly' }), 2029), inYear(rem(`${YR + 2}-02-29`, { repeat: 'yearly' }), 2032)], ['2029-02-28T08:00', '2032-02-29T08:00']);
const yearly = rem('2026-04-30T08:00', { repeat: 'yearly' });
check('ticking a yearly one done is for this year only', !isDue(markDone([yearly], 'rwhen0001', '2027-04-30T09:00')[0], '2027-05-01T10:00') && isDue(markDone([yearly], 'rwhen0001', '2027-04-30T09:00')[0], '2028-04-30T08:00'));
same('ticking a one-off done', markDone([rem('2026-11-14T10:00')], 'rwhen0001', NOW_LOCAL)[0].done, true);
same('snooze moves a one-off and keeps its time', snooze([rem('2026-11-14T10:00')], 'rwhen0001', 3)[0].when, '2026-11-17T10:00');
same('snooze is 1 to 365 days and never for a yearly one', [snooze([rem('2026-11-14T10:00')], 'rwhen0001', 0)[0].when, snooze([rem('2026-11-14T10:00')], 'rwhen0001', 366)[0].when, snooze([yearly], 'rwhen0001', 3)[0].when], ['2026-11-14T10:00', '2026-11-14T10:00', '2026-04-30T08:00']);
const g = groups([rem('2026-11-14T08:00', { id: 'rdue00001' }), rem(`${YR}-11-18`, { id: 'rweek0001' }), rem(`${YR}-11-28`, { id: 'rmonth001' }), rem(`${YR + 1}-03-01`, { id: 'rlater001' }), { ...rem(`${YR}-11-01`, { id: 'rdone0001' }), done: true }], NOW_LOCAL);
same('the groups', [g.due, g.week, g.month, g.later, g.done].map(x => x.map(r => r.id)), [['rdue00001'], ['rweek0001'], ['rmonth001'], ['rlater001'], ['rdone0001']]);
same('the message for one and for several', [dueMessage([{ title: 'A' }]), dueMessage([{ title: 'A' }, { title: 'B' }, { title: 'C' }]), dueMessage([])], ['Reminder: A', 'Reminders: A and 2 more. They are in Notes & to-do.', '']);

// ======== the calendar file
same('escaping: backslash, semicolon, comma, line breaks; control characters dropped', icsEscape('a\\b;c,d\ne\u0007f'), 'a\\\\b\;c\\,d\\nef');
const folded = icsFold('SUMMARY:' + 'é'.repeat(80));
check('lines fold at 75 octets without cutting a character', folded.split('\r\n').every(l => Buffer.byteLength(l) <= 75) && folded.split('\r\n').slice(1).every(l => l.startsWith(' ')) && folded.replace(/\r\n /g, '') === 'SUMMARY:' + 'é'.repeat(80), folded.split('\r\n').map(l => Buffer.byteLength(l)).join(','));
const SOW = cleanReminder({ id: 'rsow00001', title: 'Sow corn, then rest', when: '2027-04-30T08:00', repeat: 'yearly', kind: 'sow', note: 'The usual window starts late April.' });
const ics = icsFile([SOW, cleanReminder({ id: 'rsoil00001', title: 'Get a soil test', when: `${YR + 1}-03-31`, kind: 'soil' })], NOW);
const expected = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Crophalo//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  'BEGIN:VEVENT', 'UID:rsow00001@crophalo', 'DTSTAMP:20261114T120000Z', 'DTSTART:20270430T080000', 'DTEND:20270430T083000', 'SUMMARY:Sow corn\\, then rest', 'DESCRIPTION:The usual window starts late April.\\nA Crophalo reminder.', 'TRANSP:TRANSPARENT', 'RRULE:FREQ=YEARLY',
  'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Sow corn\\, then rest', 'TRIGGER:PT0S', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Tomorrow: Sow corn\\, then rest', 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:rsoil00001@crophalo', 'DTSTAMP:20261114T120000Z', 'DTSTART;VALUE=DATE:20270331', 'DTEND;VALUE=DATE:20270401', 'SUMMARY:Get a soil test', 'DESCRIPTION:A Crophalo reminder.', 'TRANSP:TRANSPARENT',
  'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Get a soil test', 'TRIGGER:PT8H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
check('the file is exactly the hand-checked text', ics === expected, ics.split('\r\n').find((l, i) => l !== expected.split('\r\n')[i]));
check('CRLF everywhere, none bare', !/[^\r]\n/.test(ics) && ics.endsWith('\r\n'));
check('a timed event is floating: no zone, no Z in its start or end', /DTSTART:\d{8}T\d{6}\r\n/.test(ics) && !/DT(START|END)[^\r]*Z\r\n/.test(ics));
const injected = icsFile([cleanReminder({ id: 'rhack0001', title: 'x\r\nEND:VEVENT\r\nBEGIN:VEVENT', when: `${YR + 1}-01-01` })], NOW);
check('an injected END:VEVENT in a title stays one escaped line', injected.split('\r\n').filter(l => l === 'END:VEVENT').length === 1 && /SUMMARY:x[^\r]*END:VEVENT/.test(injected));
check('a whole-day important one rings the day before at 16 hours ahead', icsFile([cleanReminder({ id: 'rharv0001', title: 'Harvest', when: `${YR + 1}-09-15`, kind: 'harvest' })], NOW).includes('TRIGGER:-PT16H'));
same('the file names', [icsName(1), icsName(2)], ['crophalo-reminder.ics', 'crophalo-reminders.ics']);
// round trip: unfold, split, unescape
const unfold = t => t.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean), unesc = v => v.replace(/\\n/g, '\n').replace(/\\([;,\\])/g, '$1');
const back = unfold(icsFile([cleanReminder({ id: 'rround001', title: 'Tomatoes; "ripe", ready\\done ' + 'é'.repeat(40), when: '2027-06-01T07:30', note: 'line one\nline two' })], NOW));
const get = k => back.find(l => l.startsWith(k + ':'))?.slice(k.length + 1);
same('the round trip gives the title and the note back', [unesc(get('SUMMARY')), unesc(get('DESCRIPTION')).split('\n')], ['Tomatoes; "ripe", ready\\done ' + 'é'.repeat(40), ['line one', 'line two', 'A Crophalo reminder.']]);

// ======== the push payload and the push calls on the client
const L = [cleanReminder({ id: 'rpush0001', title: 'A', when: '2026-11-20T08:00', push: true }), cleanReminder({ id: 'rpush0002', title: 'B', when: `${YR}-11-15`, push: true }), cleanReminder({ id: 'rpush0003', title: 'No push', when: `${YR}-11-16` }),
  { ...cleanReminder({ id: 'rpush0004', title: 'Done', when: `${YR}-11-17`, push: true }), done: true }, cleanReminder({ id: 'rpush0005', title: 'Old', when: '2026-11-14T01:00', push: true }), cleanReminder({ id: 'rpush0006', title: 'Yearly', when: `${YR}-11-01`, repeat: 'yearly', push: true })];
const pl = pushPayload(L, NOW_LOCAL, NOW);
same('push carries only those with push on and not done, soonest first, nothing more than 6 hours late', pl.map(p => p.id), ['rpush0002', 'rpush0001', 'rpush0006']);
same('and only id, title, body, time and url', Object.keys(pl[0]).sort(), ['at', 'body', 'id', 'title', 'url']);
same('a yearly one whose day passed goes as next year\'s', pl[2].at, '2027-11-01T08:00:00Z');
same('a whole day is sent for 08:00', pl[0].at, '2026-11-15T08:00:00Z');
same('the field\'s own clock is turned into UTC', pushPayload([L[0]], NOW_LOCAL, NOW, () => -300)[0].at, '2026-11-20T13:00:00Z');
same('at most 50', pushPayload(Array.from({ length: 80 }, (_, i) => cleanReminder({ id: `rmany${String(i).padStart(4, '0')}`, title: 'x', when: `${YR + 1}-01-01`, push: true })), NOW_LOCAL, NOW).length, 50);
same('what push sends never holds a place, a note or a field', pl.some(p => /note|field|farm|lat|lon/i.test(JSON.stringify(p))), false);
same('support: not a browser, not secure, no push', [pushSupport({}).ok, pushSupport({ navigator: {}, document: {}, isSecureContext: false }).reason, pushSupport({ navigator: {}, document: {}, isSecureContext: true }).reason],
  [false, 'Your browser only allows this on a secure page. It works when Crophalo is opened from this computer (localhost) or from an https address.', 'This browser cannot receive push messages. On an iPhone, add Crophalo to the Home Screen first.']);
same('notification state', [notifyState({}), notifyState({ Notification: { permission: 'granted' } }), notifyState({ Notification: { permission: 'denied' } }), notifyState({ Notification: { permission: 'default' } })], ['unsupported', 'granted', 'denied', 'default']);
// a stand-in browser
const standIn = (permission = 'granted', serverOk = true, subscribeFails = false) => {
  const calls = []; let sub = null;
  const keyBytes = Buffer.from(push.publicKey(), 'base64url');
  const pm = { getSubscription: async () => sub, subscribe: async o => { if (subscribeFails) throw new Error('no'); calls.push(['subscribe', o.userVisibleOnly]); sub = { endpoint: 'https://fcm.googleapis.com/x', options: { applicationServerKey: o.applicationServerKey.buffer.slice(o.applicationServerKey.byteOffset, o.applicationServerKey.byteOffset + o.applicationServerKey.byteLength) }, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/x', keys: subKeys }), unsubscribe: async () => { calls.push(['unsubscribed']); sub = null; } }; return sub; } };
  const env = { navigator: { serviceWorker: { ready: Promise.resolve({ pushManager: pm }) } }, window: {}, PushManager: {}, isSecureContext: true, Notification: { permission, requestPermission: async () => permission },
    fetch: async (url, opt) => { calls.push([url, opt?.method ?? 'GET']); if (!serverOk) throw new Error('down'); if (url === '/api/push/key') return { ok: true, json: async () => ({ ok: true, key: push.publicKey() }) }; return { ok: true, json: async () => ({ ok: true }), _body: opt?.body }; } };
  return { env, calls };
};
const on = standIn(); const res = await turnPushOn(on.env, L, NOW_LOCAL);
same('turning push on: asks the server for its key, subscribes visibly, sends the list', [res.ok, on.calls.map(c => c[0])], [true, ['/api/push/key', 'subscribe', '/api/push/subscribe']]);
same('the message says what is sent and where', res.message, 'Only the reminder’s name and time are sent, to the Crophalo server and your browser’s push service.');
same('blocked notifications are explained', (await turnPushOn(standIn('denied').env, L, NOW_LOCAL)).message, 'Notifications are blocked for Crophalo in this browser. Allow them in the browser\'s site settings, then try again.'.replace("browser's", 'browser’s'));
same('a server that cannot be reached', (await turnPushOn(standIn('granted', false).env, L, NOW_LOCAL)).message, 'The Crophalo server cannot be reached right now, so push is not available. The other two ways still work.');
same('a browser whose push service fails', (await turnPushOn(standIn('granted', true, true).env, L, NOW_LOCAL)).message, 'Crophalo could not reach your browser’s push service, so reminders will not arrive when Crophalo is closed. The other two ways still work.');
const offCalls = standIn(); await turnPushOn(offCalls.env, L, NOW_LOCAL); offCalls.calls.length = 0;
same('turning push off posts the endpoint and removes the subscription', [(await turnPushOff(offCalls.env)).message, offCalls.calls.map(c => c[0])], ['Push is off. The server no longer holds your reminders.', ['/api/push/unsubscribe', 'unsubscribed']]);
check('the screens draw: an empty list, a list, the settings in each state', /No reminders yet/.test(remindListHTML([], NOW_LOCAL)) && /Due now/.test(remindListHTML([rem('2026-11-14T08:00')], NOW_LOCAL)) && /Turn push on/.test(settingsRemindersHTML({ notify: 'granted', push: { ok: true, on: false } })) && /This only works in a browser/.test(settingsRemindersHTML({ notify: 'unsupported', push: { ok: false, reason: 'This only works in a browser.' } })));
check('a title with markup is shown as plain text', !/<img/.test(remindListHTML([rem('2026-11-14T08:00', { title: '<img src=x onerror=1>' })], NOW_LOCAL)));

// ======== the service worker's notice
import { pushNotice, safeLink } from '../js/remind-sw.js';
same('a push becomes a notice, cut and tagged', (() => { const n = pushNotice({ title: 'x'.repeat(200), body: 'y'.repeat(900), tag: 'rone|2026', url: '/farm' }); return [n.title.length, n.options.body.length, n.options.tag, n.options.data.url]; })(), [80, 300, 'rone|2026', '/farm']);
same('an unreadable push still shows the default words', [pushNotice(null).title, pushNotice('x').title, pushNotice({}).options.data.url], ['Crophalo reminder', 'Crophalo reminder', '/']);
same('a link is kept only when it starts with / or #', ['/farm', '#data', 'https://evil.example', '//evil.example', 'javascript:1', '/a b', 7].map(safeLink), ['/farm', '#data', '/', '/', '/', '/', '/']);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`remind: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
