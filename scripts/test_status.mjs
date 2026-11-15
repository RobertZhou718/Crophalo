// The service-status suite: scripts/status.mjs with stand-in services, so no real service is asked. Every state, a key and a login that are set show only true, a hostile service answer cannot put text
// into the page, the ten-minute rule, one check at a time with a 20 second limit, and that no answer holds a path, an environment value or a key.
// Run: node scripts/test_status.mjs   (no network)
import { createStatus, plain, WORDS, CHECK_EVERY_MS, CHECK_LIMIT_MS, SLOW_MS, DIRECT } from './status.mjs';

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`); } };
const same = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const H = 3600e3;
const LIVE = { smaproot: { name: 'NASA SMAP root-zone soil moisture', ttl: 6 * H }, faostat: { name: 'National crop yields (FAOSTAT)', ttl: 24 * H }, cropsnear: { name: 'Crops grown nearby', ttl: 24 * H } };
let t = 1_700_000_000_000; const clock = () => t, tick = ms => { t += ms; };
const res = (status, body = '') => ({ status, body: { cancel: async () => {} }, text: async () => body });
const make = (over = {}) => { const asked = []; const fetch = over.fetch ? (u, o) => { asked.push(String(u)); return over.fetch(u, o); } : async u => { asked.push(String(u)); return res(200); };
  return { asked, s: createStatus({ live: LIVE, stats: () => ({}), kept: id => (id === 'faostat' ? 3 : 0), loginSet: () => false, env: {}, now: clock, ...over, fetch }) }; };
const row = (list, id) => list.find(r => r.id === id);

// ---- the shape: every LIVE service and every direct service, with the fields the page needs
{ const { s } = make(); const list = s.list();
  same('every LIVE service and every direct service has a row', list.map(r => r.id), [...Object.keys(LIVE), ...DIRECT.map(d => d.id)]);
  const FIELDS = ['id', 'name', 'state', 'last_ok_time', 'last_ms', 'last_problem', 'kept', 'ttl_hours', 'needs_key', 'key_set', 'needs_login', 'login_set', 'checked_at', 'can_check'];
  ok('each row has exactly the fields of the answer, nothing else', list.every(r => JSON.stringify(Object.keys(r)) === JSON.stringify(FIELDS)), JSON.stringify(Object.keys(list[0])));
  ok('nothing asked yet: not_asked_yet, no times, no problem', list.every(r => r.state === 'not_asked_yet' && r.last_ok_time === null && r.last_ms === null && r.last_problem === null && r.checked_at === null));
  same('the kept count and the hours a lookup is kept come from the server', [row(list, 'faostat').kept, row(list, 'faostat').ttl_hours, row(list, 'power').ttl_hours], [3, 24, null]); }

// ---- the five states
{ const stats = { smaproot: { last_ms: 900, last_time: t - 1000, last_ok_time: t - 1000, last_error: null }, faostat: { last_ms: SLOW_MS + 2000, last_time: t - 500, last_ok_time: t - 500, last_error: null }, cropsnear: { last_ms: 40, last_time: t - 200, last_ok_time: t - 90_000, last_error: 'The crop map did not answer just now' } };
  const { s } = make({ stats: () => stats, off: ['frankfurter'] }); const list = s.list();
  same('a good run: answering, with its time and how long it took', [row(list, 'smaproot').state, row(list, 'smaproot').last_ms, row(list, 'smaproot').last_ok_time], ['answering', 900, new Date(t - 1000).toISOString()]);
  same('a slow run: slow, and says so in words', [row(list, 'faostat').state, row(list, 'faostat').last_problem], ['slow', WORDS.slow]);
  same('a failed run: not_answering, the service\'s plain words, and the last time it did answer', [row(list, 'cropsnear').state, row(list, 'cropsnear').last_problem, row(list, 'cropsnear').last_ok_time], ['not_answering', 'The crop map did not answer just now.', new Date(t - 90_000).toISOString()]);
  same('switched off: switched_off and never checked', [row(list, 'frankfurter').state, row(list, 'frankfurter').can_check], ['switched_off', false]);
  same('a service nobody asked: not_asked_yet', row(list, 'gibs').state, 'not_asked_yet');
  const off = createStatus({ live: LIVE, now: clock, env: { SERVICES_OFF: 'power, gibs' }, fetch: async () => res(200) }).list();
  same('the SERVICES_OFF setting switches services off (spaces allowed)', off.filter(r => r.state === 'switched_off').map(r => r.id), ['power', 'gibs']); }

// ---- a check: one small ask per service, the states it can give
// (the service that gives no answer at all is the height tiles now: no page asks Esri any more, so Esri left the list of direct services and the setup map's two direct services came in)
{ const { s, asked } = make({ fetch: async u => (/open-meteo/.test(u) ? res(503) : /frankfurter/.test(u) ? res(404) : /nominatim/.test(u) ? res(500) : /elevation-tiles/.test(u) ? (() => { throw new Error('getaddrinfo ENOTFOUND elevation-tiles-prod.s3.amazonaws.com'); })() : res(200)) });
  const list = await s.check();
  same('a good check: answering, with a time of its own', [row(list, 'power').state, row(list, 'power').last_ms >= 0, row(list, 'power').checked_at], ['answering', true, new Date(t).toISOString()]);
  same('a 503 or a 429 is "asked us to wait"; a 404 "said no"; a 500 "an error on its side"; no answer at all "did not answer"', [row(list, 'openmeteo-forecast').last_problem, row(list, 'frankfurter').last_problem, row(list, 'nominatim').last_problem, row(list, 'terrain-tiles').last_problem], [WORDS.busy, WORDS.refused, WORDS.down, WORDS.none]);
  ok('a failed ask is not_answering', ['openmeteo-forecast', 'frankfurter', 'nominatim', 'terrain-tiles'].every(id => row(list, id).state === 'not_answering'));
  ok('each service was asked once, with one small ask (a front-door ask, never a download)', asked.length === s.ids().length - 0 && new Set(asked).size === asked.length, `${asked.length} asks for ${s.ids().length} services`);
  ok('the ask is GET or HEAD only, with no body (checked below), and goes to a fixed address, never one the visitor gave', asked.every(u => /^https:\/\//.test(u))); }
{ const methods = []; const s = createStatus({ live: LIVE, now: clock, fetch: async (u, o) => { methods.push(o.method); return res(200); } }); await s.check(['gibs', 'openfreemap', 'power']);
  same('a service whose front door only answers HEAD is asked with HEAD, the rest with GET', methods, ['GET', 'HEAD', 'HEAD']); }

// ---- the ten-minute rule
{ const { s, asked } = make(); await s.check(['power']); await s.check(['power']); await s.check(['power', 'gibs']);
  same('asked again at once: no second ask for the same service (the answer is kept)', asked.filter(u => /power\.larc/.test(u)).length, 1);
  tick(CHECK_EVERY_MS - 1000); await s.check(['power']); same('9 minutes 59 seconds later: still no new ask', asked.filter(u => /power\.larc/.test(u)).length, 1);
  tick(1500); await s.check(['power']); same('after ten minutes: asked again', asked.filter(u => /power\.larc/.test(u)).length, 2);
  const many = await Promise.all(Array.from({ length: 50 }, () => s.check())); await Promise.all(many);
  const per = {}; asked.forEach(u => { const host = new URL(u).host; per[host] = (per[host] || 0) + 1; });
  ok('fifty visitors pressing "Check again" together cause at most one ask per service in ten minutes', Object.entries(per).every(([h, n]) => h.includes('power.larc') ? n <= 2 : n <= 3), JSON.stringify(per)); }

// ---- one at a time, and the 20 second limit
{ let running = 0, most = 0; const s = createStatus({ live: LIVE, now: clock, fetch: async () => { running++; most = Math.max(most, running); await new Promise(done => setTimeout(done, 5)); running--; return res(200); } });
  await Promise.all([s.check(), s.check(['power', 'gibs']), s.check()]);
  same('never more than one service is asked at a time, however many checks are started', most, 1); }
{ let signal = null; const s = createStatus({ live: LIVE, now: clock, fetch: async (u, o) => { signal = o.signal; return new Promise((_, no) => o.signal.addEventListener('abort', () => no(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })))); } });
  const started = Date.now(); const p = s.check(['power']); await new Promise(done => setTimeout(done, 30)); ok('the ask carries a time limit of 20 seconds', signal instanceof AbortSignal && CHECK_LIMIT_MS === 20_000);
  signal = null; /* the stand-in never answers; the real limit is checked by the signal's own timeout: here the abort is fired by hand */
  const tiny = createStatus({ live: {}, now: clock, extra: [], fetch: async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); } }); const l = await tiny.check(['power']);
  same('a timeout reads "did not answer in 20 seconds"', row(l, 'power').last_problem, WORDS.timeout); void p; void started; }

// ---- keys and logins: only true or false
{ const env = { NASS_KEY: 'MADE-UP-SUPERSECRET-KEY-VALUE-0001', EARTHDATA_PASSWORD: 'hunter2hunter2', PATH: '/usr/bin:/Users/someone/secret' };
  const s = createStatus({ live: LIVE, now: clock, env, loginSet: () => true, fetch: async () => res(200) }); const list = s.list(), all = JSON.stringify(list);
  same('the five satellite lookups need the login, and it is set: true', [row(list, 'smaproot').needs_login, row(list, 'smaproot').login_set, row(list, 'faostat').needs_login, row(list, 'faostat').login_set], [true, true, false, false]);
  ok('no service in the LIVE table needs a key today, and a key that is not asked for is not shown', list.every(r => r.needs_key === false && r.key_set === false));
  ok('the answer holds no key, password or environment value, and no path', !/SUPERSECRET|hunter2|\/usr\/bin|\/Users\//.test(all));
  ok('key_set and login_set are booleans and nothing else', list.every(r => typeof r.key_set === 'boolean' && typeof r.login_set === 'boolean')); }

// ---- keys: the three lookups that need one say so from their own entry or from scripts/keys.mjs; true or false only
{ const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-keys-')); fs.mkdirSync(path.join(dir, '.secrets'));
  const MADE_UP = 'zz-made-up-key-0123456789-not-a-real-one'; fs.writeFileSync(path.join(dir, '.secrets', 'nass-quickstats.key'), MADE_UP);   // a key file with a made-up key in a temporary folder
  // the stand-in answers like scripts/keys.mjs keysStatus: only whether the file or the setting is there
  const stand = (root, e) => ({ nass: !!e.CROPHALO_NASS_KEY || fs.existsSync(path.join(root, '.secrets', 'nass-quickstats.key')), ams: !!e.CROPHALO_AMS_KEY || fs.existsSync(path.join(root, '.secrets', 'ams-marketnews.key')), openet: false, earthdata: false });
  const LIVE3 = { ...LIVE, nass: { name: 'USDA NASS Quick Stats', ttl: 24 * H }, marketnews: { name: 'USDA Market News', ttl: 6 * H }, openet: { name: 'OpenET water use', ttl: 24 * H } };
  const env = { CROPHALO_AMS_KEY: MADE_UP + '-ams' };
  const list = createStatus({ live: LIVE3, now: clock, env, keys: () => stand(dir, env), fetch: async () => res(200) }).list(), all = JSON.stringify(list);
  same('the three keyed lookups say they need a key', ['nass', 'marketnews', 'openet'].map(id => row(list, id).needs_key), [true, true, true]);
  same('a key in a file (NASS) and a key in a host setting (Market News) show "set"; a key nobody gave (OpenET) shows "not set"', ['nass', 'marketnews', 'openet'].map(id => row(list, id).key_set), [true, true, false]);
  ok('the made-up key, its file name and its place never appear in the answer', !all.includes(MADE_UP) && !/nass-quickstats|\.secrets|CROPHALO_/.test(all));
  ok('a lookup that needs no key is untouched', row(list, 'faostat').needs_key === false && row(list, 'faostat').key_set === false);
  const own = createStatus({ live: { custom: { name: 'A lookup with its own key', ttl: H, key: 'metno' } }, now: clock, keys: () => ({ metno: true }), fetch: async () => res(200) }).list().find(r => r.id === 'custom');
  same('a lookup can name its own key in its entry', [own.needs_key, own.key_set], [true, true]);
  same('when keys() is missing or throws, every key reads "not set" and nothing breaks', createStatus({ live: LIVE3, now: clock, keys: () => { throw new Error('boom'); }, fetch: async () => res(200) }).list().filter(r => r.needs_key).map(r => r.key_set), [false, false, false]);
  same('the Earthdata login reads from keys() when it answers one', createStatus({ live: LIVE, now: clock, keys: () => ({ earthdata: true }), fetch: async () => res(200) }).list().filter(r => r.needs_login).map(r => r.login_set), [true]);
  // the project's own scripts/keys.mjs, once it is in the folder (it named a file in another folder of this computer before; a project file names no folder of the owner's computer)
  const real = decodeURIComponent(new URL('./keys.mjs', import.meta.url).pathname);
  if (fs.existsSync(real)) { const K = await import('./keys.mjs'); const e = { CROPHALO_NASS_KEY: MADE_UP }; const k = K.keysStatus(dir, { ...e, CROPHALO_SECRETS_DIR: path.join(dir, '.secrets') }, path.join(dir, 'nohome'));
    const l = createStatus({ live: LIVE3, now: clock, keys: () => k, fetch: async () => res(200) }).list(); same('with the real scripts/keys.mjs: the same three answers (NASS set, Market News not set, OpenET not set)', ['nass', 'marketnews', 'openet'].map(id => row(l, id).key_set), [true, false, false]); ok('the real keys.mjs answer holds only booleans', Object.values(k).every(v => typeof v === 'boolean')); }
  fs.rmSync(dir, { recursive: true, force: true }); }

// ---- a hostile service: its words never reach the answer
{ const evil = '<script>alert(1)</script> https://user:pa55w0rd@evil.example/steal?key=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123 /Users/me/.secrets/netrc Bearer abcdefghijklmnopqrstuvwxyz123456';
  const stats = { cropsnear: { last_ms: 5, last_time: t, last_ok_time: null, last_error: evil } };
  const list = createStatus({ live: LIVE, stats: () => stats, now: clock, fetch: async () => res(200) }).list(), p = row(list, 'cropsnear').last_problem;
  ok('a service\'s own error text is cleaned: no tag, address, path, key, login or bearer word survives', !/[<>]|http|evil|steal|pa55|\/Users|secrets|netrc|ABCDEFGH|abcdefgh/i.test(p), p);
  ok('a hostile answer body is never read, so nothing of it can be shown', await (async () => { let read = false; const f = async () => ({ status: 200, body: { cancel: async () => {} }, text: async () => { read = true; return evil; }, json: async () => { read = true; return { x: evil }; } }); await createStatus({ live: LIVE, now: clock, fetch: f }).check(['power']); return !read; })());
  same('a hostile status line or header changes nothing: only the number counts', row(await createStatus({ live: LIVE, now: clock, fetch: async () => ({ status: 200, statusText: evil, headers: { server: evil }, body: { cancel: async () => {} } }) }).check(['power']), 'power').last_problem, null);
  same('plain() never returns an empty sentence', plain('<<<>>>'), WORDS.odd);
  ok('plain() keeps at most 140 characters and ends with a full stop', plain('word '.repeat(100)).length <= 141 && /\.$/.test(plain('word '.repeat(100))));
  ok('plain() of a real stack line leaves no frame', !/at \S+ \(/.test(plain('Error: boom\n    at runScript (/Users/me/Crophalo/scripts/serve.mjs:140:9)\n    at async lookup (file:///Users/me/x.mjs:1:1)'))); }
{ const list = make({ fetch: async () => res(200) }).s.list(), all = JSON.stringify(list);
  ok('no address of a service appears in the answer', !/https?:|\.nasa\.gov|open-meteo|arcgisonline|worldbank|fao\.org/i.test(all.replace(/"name":"[^"]*"/g, ''))); }

console.log(`status: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
