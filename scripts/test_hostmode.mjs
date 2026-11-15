// Crophalo's host-mode suite: every setting of scripts/hostmode.mjs for a 512 MB, a 1 GB, a 2 GB and a big host, the public-mode rules, the security headers, the gate for local-only routes, the renewal timer (with a fake clock),
// the pruning of old answers, and scripts/start.sh (the ~/.netrc it writes, its quoting and its mode, that it never prints the login, and that a home it cannot write never stops the start). No network. Run: node scripts/test_hostmode.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as M from './hostmode.mjs';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const HERE = path.dirname(fileURLToPath(import.meta.url)), MB = M.MB;

// ---- public or not, who may ask, behind how many proxies, how fast
same('only a loopback address is local', ['127.0.0.1', 'localhost', '::1', '0.0.0.0', '10.0.0.5', '::', ''].map(h => M.isPublic(h)), [false, false, false, true, true, true, true]);
same('FW_FORCE_PUBLIC=1 makes a local address public (for tests), and never the other way', [M.isPublic('127.0.0.1', { FW_FORCE_PUBLIC: '1' }), M.isPublic('0.0.0.0', { FW_FORCE_PUBLIC: '0' })], [true, true]);
same('allowed hosts: Render\'s name and the listed ones, lower-case, trimmed, no blanks', M.allowedHosts({ RENDER_EXTERNAL_HOSTNAME: 'Crophalo-ab12.onrender.com', ALLOWED_HOSTS: ' One.example , two.example,, ' }), ['crophalo-ab12.onrender.com', 'one.example', 'two.example']);
same('no hosts listed: none', M.allowedHosts({}), []);
same('proxy hops: 1 on Render when public, 0 elsewhere, the setting when given, never negative or text', [M.trustHops({ RENDER: 'true' }, true), M.trustHops({}, true), M.trustHops({ RENDER: 'true' }, false), M.trustHops({ TRUST_PROXY_HOPS: '2' }, true), M.trustHops({ TRUST_PROXY_HOPS: '-3' }, true), M.trustHops({ TRUST_PROXY_HOPS: 'x' }, true)], [1, 0, 0, 2, 0, 0]);
same('the rate limit: 180 unless a positive number is given', [M.rateLimit({}), M.rateLimit({ RATE_PER_MIN: '60' }), M.rateLimit({ RATE_PER_MIN: '0' }), M.rateLimit({ RATE_PER_MIN: 'x' }), M.rateLimit({ RATE_PER_MIN: '-5' })], [180, 60, 180, 180, 180]);

// ---- memory: a container's own limit beats the machine's, and the plan follows the budget
same('the budget is the container\'s limit when it has one (os.totalmem() reports the machine)', [M.memoryBudget({ totalmem: 32768 * MB, constrained: 512 * MB }) / MB, M.memoryBudget({ totalmem: 32768 * MB, constrained: 0 }) / MB, M.memoryBudget({ totalmem: 8 * 1024 * MB, constrained: 2 ** 60 }) / MB], [512, 32768, 8192]);
same('FW_MEMORY_MB overrides both', M.memoryBudget({ totalmem: 32768 * MB, constrained: 512 * MB, env: { FW_MEMORY_MB: '1024' } }) / MB, 1024);
const plan = mb => M.memoryPlan(mb * MB);
same('512 MB (the free plan): 2 lookups at once, 2 SMAP workers, 16 kept days, no warm points, small answer memory', [plan(512).liveMax, plan(512).smapWorkers, plan(512).smapKeepDays, plan(512).warmPoints, plan(512).answersMax, plan(512).small], [2, 2, 16, false, 120, true]);
same('640 MB: 3 at once; 1 GB: 4 (the most)', [plan(640).liveMax, plan(1024).liveMax], [3, 4]);
same('2 GB: 4 at once, still the small SMAP settings', [plan(2048).liveMax, plan(2048).smapWorkers], [4, 2]);
same('a big machine (8 GB or more): 4 at once, 8 SMAP workers, 96 kept days, warm points', [plan(8192).liveMax, plan(8192).smapWorkers, plan(8192).smapKeepDays, plan(8192).warmPoints], [4, 8, 96, true]);
same('a tiny budget still allows one lookup', plan(128).liveMax, 1);
same('FW_LIVE_MAX, FW_SMAP_WORKERS and FW_SMAP_KEEP win over the plan', [M.memoryPlan(512 * MB, { FW_LIVE_MAX: '1' }).liveMax, M.memoryPlan(512 * MB, { FW_SMAP_WORKERS: '3' }).smapWorkers, M.memoryPlan(512 * MB, { FW_SMAP_KEEP: '30' }).smapKeepDays], [1, 3, 30]);
check('Node\'s heap limit sits under the budget: 512 MB gives 154', plan(512).nodeHeapMB === 154 && plan(64).nodeHeapMB === 96 && plan(32768).nodeHeapMB === 512);
check('the whole plan fits: Node + the lookups at their measured peak stay under 80% of a 512 MB budget', M.NODE_MB + plan(512).liveMax * M.PEAK_MB <= 512 * 0.8, `${M.NODE_MB + plan(512).liveMax * M.PEAK_MB} MB`);
check('a lookup waits when the tree is above 75% of the budget and another is running, never when none runs', M.mustWait(400 * MB, 512 * MB, 1) && !M.mustWait(300 * MB, 512 * MB, 1) && !M.mustWait(500 * MB, 512 * MB, 0));
check('the memory line has the numbers and no address', /^memory: rss \d+ MB of 512 MB, heap \d+ MB, lookups running 1, waiting 0$/.test(M.memoryLine({ rss: 200 * MB, heapUsed: 50 * MB }, 512 * MB, 1, 0)));

// ---- headers and the gate
{
  const pub = M.securityHeaders(true), loc = M.securityHeaders(false);
  check('every answer carries the five security headers', M.REQUIRED_HEADERS.every(n => pub[n] && loc[n]));
  check('the CSP keeps frames, objects and base to this site', /frame-ancestors 'self'/.test(pub['content-security-policy']) && /object-src 'none'/.test(pub['content-security-policy']) && /base-uri 'self'/.test(pub['content-security-policy']));
  check('geolocation only for this site; camera, microphone and payment off', pub['permissions-policy'] === 'geolocation=(self), camera=(), microphone=(), payment=()');
  check('HSTS only on a public server', !!pub['strict-transport-security'] && !loc['strict-transport-security']);
  same('missingHeaders names what is missing', M.missingHeaders({ 'x-content-type-options': 'nosniff' }, false), ['referrer-policy', 'x-frame-options', 'permissions-policy', 'content-security-policy']);
  same('nothing missing from the real set', M.missingHeaders(pub, true), []);
  same('local-only routes are 404 on a public server and open on a local one', [M.hostGate('/api/userdata', true), M.hostGate('/api/userdata/x', true), M.hostGate('/api/admin', true), M.hostGate('/api/userdata', false), M.hostGate('/api/smaproot', true)], [{ status: 404, reason: 'Unknown endpoint' }, { status: 404, reason: 'Unknown endpoint' }, { status: 404, reason: 'Unknown endpoint' }, null, null]);
  check('a path that only starts like a local route is not one', !M.isLocalOnly('/api/userdatabase') && !M.isLocalOnly('/api/administrator'));
}

// ---- renewal: a shared dataset is rebuilt 6.5 hours before it runs out, FAOSTAT only when FAO changed, nothing twice at once
{
  const H = M.H, rows = [{ id: 'prices', ttl: 12 * H }, { id: 'faostat', ttl: 24 * H }, { id: 'gracegrid', ttl: 24 * H }], last = new Map();
  same('at the start every row is due', M.dueRows(rows, last, 0).map(r => r.id), ['prices', 'faostat', 'gracegrid']);
  last.set('prices', 0); last.set('faostat', 0); last.set('gracegrid', 0);
  same('after 5 hours: none (prices run out at 12 h, rebuilt from 5.5 h)', M.dueRows(rows, last, 5 * H).map(r => r.id), []);
  same('at 5.5 hours prices are due, the 24 h ones are not (due from 17.5 h)', [M.dueRows(rows, last, 5.5 * H).map(r => r.id), M.dueRows(rows, last, 17 * H).map(r => r.id), M.dueRows(rows, last, 17.5 * H).map(r => r.id)], [['prices'], ['prices'], ['prices', 'faostat', 'gracegrid']]);
  const log = []; let clock = 0, timers = [], warmed = [], changedAnswer = true; const setTimer = (fn, ms) => { const t = { fn, ms, off: false, unref() {} }; timers.push(t); return t; };
  const r = M.startRenewal([{ id: 'prices', ttl: 12 * H, warm: async () => { warmed.push('prices'); return true; } }, { id: 'faostat', ttl: 24 * H, warm: async () => { warmed.push('faostat'); return true; }, changed: async () => changedAnswer }, { id: 'broken', ttl: 12 * H, warm: async () => { throw new Error('down'); } }],
    { now: () => clock, setTimer, clearTimer: t => { t.off = true; }, log: l => log.push(l) });
  check('the first look is 4 seconds after the start', timers.length === 1 && timers[0].ms === 4000, brief(timers.map(t => t.ms)));
  await r.tick(); same('the first tick renews every row once, and a failing row only logs', [warmed, log.some(l => /broken: renewal failed: down/.test(l))], [['prices', 'faostat'], true]);
  check('the next look is 6 hours later', timers.at(-1).ms === 6 * H);
  clock = 6 * H; await r.tick(); same('after 6 hours only the 12 h dataset is near its end, and only then it is rebuilt', warmed, ['prices', 'faostat', 'prices']);
  clock = 18 * H; changedAnswer = false; await r.tick(); check('FAOSTAT near its end is not rebuilt when FAO\'s files did not change', warmed.filter(x => x === 'faostat').length === 1 && log.some(l => /faostat: source unchanged/.test(l)), brief(warmed));
  clock = 24 * H; changedAnswer = true; await r.tick(); check('and is rebuilt when they did', warmed.filter(x => x === 'faostat').length === 2, brief(warmed));
  r.stop(); check('stop clears the timer', timers.at(-1).off === true);
  let busy = 0, maxBusy = 0; const slow = M.startRenewal([{ id: 'a', ttl: H, warm: async () => { busy++; maxBusy = Math.max(maxBusy, busy); await new Promise(res => setTimeout(res, 20)); busy--; return true; } }], { setTimer: () => ({ unref() {} }), clearTimer() {}, now: () => 0 });
  await Promise.all([slow.tick(), slow.tick(), slow.tick()]); check('two ticks never run one dataset twice at once', maxBusy === 1, String(maxBusy));
}
// ---- pruning
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-prune-')), now = Date.now(), H = M.H;
  const put = (name, age) => { const f = path.join(dir, name); fs.writeFileSync(f, '{}'); fs.utimesSync(f, new Date(now - age), new Date(now - age)); };
  put('smaproot_aaaa1111.json', 13 * H); put('smaproot_bbbb2222.json', 11 * H); put('final-smaproot_cccc3333.json', 40 * H); put('dem_dddd4444.json', 100 * H); put('other.txt', 1000 * H); put('unknown_eeee5555.json', 1000 * H);
  const gone = M.pruneCache(dir, id => ({ smaproot: 6 * H, dem: 720 * H })[id], { now });
  same('answers older than twice their time limit go, young ones and strangers stay', [gone, fs.readdirSync(dir).sort()], [2, ['dem_dddd4444.json', 'other.txt', 'smaproot_bbbb2222.json', 'unknown_eeee5555.json']]);
  same('a missing folder prunes nothing', M.pruneCache(path.join(dir, 'nope'), () => 1), 0);
  fs.rmSync(dir, { recursive: true, force: true });
}
// ---- scripts/start.sh: the login file
{
  const run = (env, preset) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-home-')), bin = fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-bin-'));
    fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\necho "NODE-STARTED $*"\n'); fs.chmodSync(path.join(bin, 'node'), 0o755);   // a stand-in for the real server: the script only has to hand over to it
    if (preset) fs.writeFileSync(path.join(home, '.netrc'), preset);
    const r = spawnSync('sh', [path.join(HERE, 'start.sh')], { env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, ...env }, encoding: 'utf8' });
    const file = path.join(home, '.netrc'), text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null, mode = text === null ? null : (fs.statSync(file).mode & 0o777).toString(8);
    fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(bin, { recursive: true, force: true });
    return { out: r.stdout + r.stderr, text, mode, code: r.status };
  };
  const a = run({ EARTHDATA_USERNAME: 'user1', EARTHDATA_PASSWORD: 'plainword' });
  same('both settings: the one-line netrc for the NASA login host, mode 600', [a.text, a.mode], ['machine urs.earthdata.nasa.gov login user1 password plainword\n', '600']);
  check('it hands over to node with a heap limit, and prints nothing of the login', /NODE-STARTED --max-old-space-size=160 scripts\/serve\.mjs/.test(a.out) && !/user1|plainword/.test(a.out) && a.code === 0, a.out);
  const q = run({ EARTHDATA_USERNAME: 'me@x.org', EARTHDATA_PASSWORD: 'pa ss"w\\d#1' });
  same('a word with a space, a quote, a backslash or a # is quoted; an e-mail address is not', q.text, 'machine urs.earthdata.nasa.gov login me@x.org password "pa ss\\"w\\\\d#1"\n');
  check('only one setting: no file', run({ EARTHDATA_USERNAME: 'user1' }).text === null && run({ EARTHDATA_PASSWORD: 'x' }).text === null && run({}).text === null);
  same('an existing ~/.netrc is never overwritten', run({ EARTHDATA_USERNAME: 'a', EARTHDATA_PASSWORD: 'b' }, 'machine other login me password mine\n').text, 'machine other login me password mine\n');
  check('FW_NODE_HEAP_MB changes the limit', /--max-old-space-size=100 /.test(run({ FW_NODE_HEAP_MB: '100' }).out));
  const gone = path.join(os.tmpdir(), `crophalo-missing-${process.pid}`, 'home'), m = run({ EARTHDATA_USERNAME: 'user1', EARTHDATA_PASSWORD: 'plainword', HOME: gone });   // a folder that does not exist: no one can write there, not even root
  check('a home folder that cannot be written: no file, one plain line, nothing of the login, and the server still starts', m.code === 0 && /NODE-STARTED --max-old-space-size=160 scripts\/serve\.mjs/.test(m.out) && /could not be written/.test(m.out) && !/user1|plainword/.test(m.out) && !fs.existsSync(gone), m.out);
}
console.log(`hostmode: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
