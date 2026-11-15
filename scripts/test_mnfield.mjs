// Crophalo's offline suite for the Market News lookup /api/mnfield (scripts/live/mnfield.py, mnlib.py) and its argument check (scripts/mnargs.mjs). The network is always replaced; every Market News answer is a hand-made stand-in (scripts/fixtures/market) whose first line says it is not real, with made-up prices, and the key is a made-up word.
// RULE: never loosen a check here without a written farming reason beside it. A stopped report read as today, an organic or forward price mixed in, a region average invented, a millet matched to the wrong millet, or a key that leaks would mislead a farmer or harm the owner.
// Run: node scripts/test_mnfield.mjs   (the Python part uses the folder's .venv, or FW_PYTHON)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check, same, group, finish, tempFolder, addAnswer, runLookup, contract, PYTHON, LIVE_DIR } from './live_testlib.mjs';
import { mnArgs, mnYearArgs } from './mnargs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), FX = path.join(HERE, 'fixtures', 'market');
const LINE = '# STAND-IN, NOT REAL DATA. Hand-made in the shape of a USDA Market News MARS API v1.2 answer, for the checks only.';
const standin = name => { const [first, ...rest] = fs.readFileSync(path.join(FX, name), 'utf8').split('\n'); check(`${name}: its first line says it is a stand-in, not real data`, first === LINE, first); return rest.join('\n').trim(); };
const nwsMead = fs.readFileSync(path.join(HERE, 'fixtures', 'extra', 'nws_points_mead.txt'), 'utf8').split('\n').slice(1).join('\n').trim();   // a recorded public NWS answer (no key)

const NOW = '2026-11-15T12:00:00Z', NOW_MS = Date.parse(NOW);
const SECRET = 'pretend-mn-key-2468', B64 = Buffer.from(SECRET + ':').toString('base64'), SECRETS = [SECRET, B64];
const API = 'https://marsapi.ams.usda.gov/services/v1.2';
const mdy = n => { const d = new Date(NOW_MS - n * 864e5); return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`; };
const isoDaysAgo = n => new Date(NOW_MS - n * 864e5).toISOString().slice(0, 10);
const iso = text => text.replace(/^(\d\d)\/(\d\d)\/(\d{4})$/, '$3-$1-$2');   // a stand-in's MM/DD/YYYY date as the answer writes it
const DETAIL = (id, extra = '', days = 14) => `${API}/reports/${id}/Report%20Detail?q=report_begin_date=${mdy(days)}:${mdy(0)}${extra}`;
const POINTS = (lat, lon) => `https://api.weather.gov/points/${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
const nwsStandin = (state, zone) => JSON.stringify({ properties: { gridId: 'XXX', gridX: 1, gridY: 1, forecast: 'https://api.weather.gov/gridpoints/XXX/1,1/forecast', county: `https://api.weather.gov/zones/county/${zone}`, timeZone: 'America/New_York', relativeLocation: { properties: { state } } } });

function secrets(withKey = true) { const dir = tempFolder('secrets'); if (withKey) fs.writeFileSync(path.join(dir, 'ams-marketnews.key'), SECRET + '\n', { mode: 0o600 }); return dir; }
const run = (args, folder, extra = {}) => runLookup('mnfield', args, { replay: folder, now: NOW, env: { CROPHALO_SECRETS_DIR: secrets(extra.noKey !== true) }, limitS: 100, ...extra });
const argsOf = q => mnArgs(new URLSearchParams(q));
const MEAD = argsOf('lat=41.18&lon=-96.44&mode=now&crops=wheat,soy,corn,canola,pmillet,fmillet');
const BELTS = argsOf('lat=39.03&lon=-76.84&mode=now&crops=canola,corn,pigeonpea,ryecover,sorghum,soy,wheat');
const by = (a, crop) => a?.crops?.find(c => c.crop === crop);
const regionsOf = e => (e?.regions || []).map(r => [r.region, r.low, r.high]);

function folderWith(answers) {   // answers: [url, body | { status } | { replies }]
  const folder = path.join(tempFolder('mn'), 'answers');
  for (const [url, a] of answers) {
    if (a && typeof a === 'object' && !Buffer.isBuffer(a) && (a.status || a.replies)) addAnswer(folder, { url, ...a, note: 'NOT REAL DATA: hand-made stand-in' });
    else addAnswer(folder, { url, body: a, note: 'NOT REAL DATA: hand-made stand-in' });
  }
  return folder;
}
const LIST = standin('list_standin.txt'), NE = standin('ne_detail_standin.txt'), PA = standin('pa_detail_standin.txt'), VA = standin('va_detail_standin.txt');
const CANOLA = standin('national_canola_standin.txt'), EMPTY = standin('empty_standin.txt'), HEADER = standin('header_only_standin.txt');
const listWith = change => { const l = JSON.parse(LIST); change(l); return JSON.stringify(l); };
const meadFolder = (over = {}) => folderWith([[POINTS(MEAD[0], MEAD[1]), nwsMead], [`${API}/reports`, over.list ?? LIST], [DETAIL(3225), over.ne ?? NE], [DETAIL(2887, ';commodity=Canola'), over.canola ?? CANOLA]]);
const MD_POINTS = [POINTS(BELTS[0], BELTS[1]), nwsStandin('MD', 'MDC033')];
const beltsFolder = (over = {}) => folderWith([MD_POINTS, [`${API}/reports`, over.list ?? LIST], [DETAIL(3091), over.pa ?? PA], [DETAIL(3167), over.va ?? VA], [DETAIL(2887, ';commodity=Canola'), over.canola ?? CANOLA]]);

// ---- the arguments, before anything runs
await group('mnArgs and mnYearArgs (scripts/mnargs.mjs)', async () => {
  same('Mead: snapped to 0.05 degrees, crops sorted and de-duplicated', argsOf('lat=41.18&lon=-96.44&mode=now&crops=soy,corn,corn'), ['41.20', '-96.45', 'now', 'corn,soy']);
  same('Beltsville: snapped to 0.05 degrees', BELTS.slice(0, 2), ['39.05', '-76.85']);
  same('empty crops are allowed (the state report only, for the Layers card)', argsOf('lat=41.18&lon=-96.44&mode=now&crops='), ['41.20', '-96.45', 'now', '']);
  same('no crops at all is the same as empty', argsOf('lat=41.18&lon=-96.44&mode=now'), ['41.20', '-96.45', 'now', '']);
  same('hay and cost are accepted modes', [argsOf('lat=41.18&lon=-96.44&mode=hay')[2], argsOf('lat=41.18&lon=-96.44&mode=cost')[2]], ['hay', 'cost']);
  same('a plain object works as well as URLSearchParams', mnArgs({ lat: '41.18', lon: '-96.44', mode: 'now', crops: 'corn' }), ['41.20', '-96.45', 'now', 'corn']);
  const LL = { reason: 'lat and lon are required (decimal degrees)' }, MODE = { reason: 'mode must be now, hay or cost' }, CROPS = { reason: 'crops must be Crophalo crop ids' };
  for (const [q, want] of [['lon=-96.44&mode=now', LL], ['lat=abc&lon=-96.44&mode=now', LL], ['lat=1e3&lon=-96.44&mode=now', LL], ['lat=91&lon=-96.44&mode=now', LL], ['lat=41&lon=181&mode=now', LL], ['lat=0x10&lon=1&mode=now', LL],
    ['lat=41.18&lon=-96.44', MODE], ['lat=41.18&lon=-96.44&mode=year', MODE], ['lat=41.18&lon=-96.44&mode=NOW', MODE],
    ['lat=41.18&lon=-96.44&mode=now&crops=Corn', CROPS], ['lat=41.18&lon=-96.44&mode=now&crops=c', CROPS], ['lat=41.18&lon=-96.44&mode=now&crops=corn;soy', CROPS],
    ['lat=41.18&lon=-96.44&mode=now&crops=averyverylongid', CROPS], ['lat=41.18&lon=-96.44&mode=now&crops=c0rn', CROPS],
    [`lat=41.18&lon=-96.44&mode=now&crops=${'abcdefghijklmnopq'.split('').map(c => c + c).join(',')}`, CROPS]]) same(`refused: ${q.slice(0, 60)}`, argsOf(q), want);
  same('sixteen crops are allowed', argsOf(`lat=1&lon=1&mode=now&crops=${'abcdefghijklmnop'.split('').map(c => c + c).join(',')}`).length, 4);
  same('a year: lat, lon, the word year, the crop and the region', mnYearArgs(new URLSearchParams('lat=41.18&lon=-96.44&crop=corn&region=East')), ['41.20', '-96.45', 'year', 'corn', 'East']);
  same('a year: a bad crop is refused', mnYearArgs(new URLSearchParams('lat=41.18&lon=-96.44&crop=Corn&region=East')), CROPS);
  same('a year: a region that cannot be a report region is refused', mnYearArgs(new URLSearchParams('lat=41.18&lon=-96.44&crop=corn&region=%3Cscript%3E')), { reason: 'This region is not in the report' });
  same('a year: no lat is refused', mnYearArgs(new URLSearchParams('lon=-96.44&crop=corn&region=East')), LL);
});

// ---- the pure rules (scripts/live/mnlib.py)
await group('mnlib.py', async () => {
  const code = `import sys, json, datetime; sys.path.insert(0, ${JSON.stringify(LIVE_DIR)}); import mnlib as m
t = datetime.date(2026, 11, 15)
print(json.dumps({
 "live30": m.live(t - datetime.timedelta(days=30), t), "live31": m.live(t - datetime.timedelta(days=31), t), "future": m.live(t + datetime.timedelta(days=1), t), "none": m.live(None, t),
 "mmdd": m.mmddyyyy(t), "day": str(m.day("11/13/2026 13:01:47")), "badday": m.day("2026-11-13"),
 "names": sorted({v[1] for v in m.CROP_NAMES.values()}), "millets": [m.name_of(c) for c in ("pmillet", "fmillet", "millet")],
 "crops": m.parse_crops("soy,corn,corn"), "bad": m.parse_crops("Corn"), "states": len(m.STATES), "grain": len(m.GRAIN),
 "md": m.GRAIN["MD"], "ne": m.GRAIN["NE"], "co": m.CO_PUBLISHER, "wheat": [m.name_of(c)[1] for c in ("wheat", "swheat", "durum")], "chick": m.name_of("chickpea"), "bean": m.name_of("bean"),
 "rule": [m.drop_reason(r, t, n) for r, n in [
   ({"report_date": "11/13/2026", "current": "Yes", "conventional": "Conventional", "price_unit": "$ Per Bushel", "price Min": 1.0, "price Max": 2.0, "delivery_point": "Country Elevators"}, False),
   ({"report_date": "10/31/2026", "current": "Yes", "conventional": "Conventional", "price_unit": "$ Per Bushel", "price Min": 1.0, "price Max": 2.0, "delivery_point": "Country Elevators"}, False),
   ({"report_date": "11/01/2026", "current": "Yes", "conventional": "Conventional", "price_unit": "$ Per Bushel", "price Min": 1.0, "price Max": 2.0, "delivery_point": "Country Elevators"}, False),
   ({"report_date": "11/16/2026", "current": "Yes", "conventional": "Conventional", "price_unit": "$ Per Bushel", "price Min": 1.0, "price Max": 2.0, "delivery_point": "Country Elevators"}, False),
   ({"report_date": "11/13/2026", "current": "Yes", "conventional": "Conventional", "price_unit": "$ Per Bushel", "price Min": "1.0", "price Max": 2.0, "delivery_point": "Country Elevators"}, False),
   ({"report_date": "11/13/2026", "current": "Yes", "conventional": "Conventional", "price_unit": "$ Per CWT", "price Min": 1.0, "price Max": 2.0, "delivery_point": "Country Elevators"}, False),
   ({"report_date": "11/13/2026", "current": "Yes", "conventional": "Conventional", "price_unit": "$ Per CWT", "price Min": 1.0, "price Max": 2.0, "delivery_point": "Terminals/Mills/Processors"}, True),
   ({"report_date": "11/13/2026", "current": "Yes", "conventional": "Conventional", "price_unit": "$ Per Bushel", "price Min": True, "price Max": 2.0, "delivery_point": "Country Elevators"}, False)]]}))`;
  const r = spawnSync(PYTHON, ['-I', '-B', '-c', code], { encoding: 'utf8' });   // -B: no bytecode file is left in the folder
  let o = {};
  try { o = JSON.parse(r.stdout); } catch { check('mnlib.py answers as JSON', false, r.stderr.slice(-600)); return; }
  same('live: published 30 days ago is live, 31 days is not, a future date is not trusted, no date is not live', [o.live30, o.live31, o.future, o.none], [true, false, false, false]);
  same('dates go to Market News as MM/DD/YYYY and come back with the time dropped', [o.mmdd, o.day, o.badday], ['11/15/2026', '2026-11-13', null]);
  same('the crop-name table names only commodities seen in real answers (Millet: 115 rows of report 2887, class White, Colorado)', o.names, ['Barley', 'Beans', 'Canola', 'Corn', 'Lentils', 'Millet', 'Peas', 'Sorghum', 'Soybeans', 'Sunflower Seeds', 'Wheat']);
  same('no millet of any kind is matched to the report\'s Millet (proso)', o.millets, [null, null, null]);
  same('wheat, spring wheat and durum are all asked as Wheat (the class is returned)', o.wheat, ['Wheat', 'Wheat', 'Wheat']);
  same('chickpeas are Beans of class Garbanzo; dry beans never take the Garbanzo rows', [o.chick, o.bean], [[2914, 'Beans', 'Garbanzo', null], [2914, 'Beans', null, 'Garbanzo']]);
  same('crops: sorted and de-duplicated; a bad id refused', [o.crops, o.bad], [['corn', 'soy'], null]);
  same('the state table has every one of the fifty states', [o.states, o.grain], [50, 50]);
  same('Maryland: its own 2714 (stopped, so its date is said), then Pennsylvania 3091, then Virginia 3167', o.md, [[2714], [3091, 3167]]);
  same('Nebraska: its own 3225, no neighbour', o.ne, [[3225], []]);
  same('the co-publishers the public report texts print', o.co, { 3225: 'NE Dept. of Ag Market News', 2935: 'NE Dept. of Ag Market News', 2714: 'MD Dept. of Ag Market News' });
  same('the row rule: kept; 15 days old; 14 days old kept; a future day; a price as text; a hundredweight in a state report; a national report\'s own buyer kept; true is not a number',
    o.rule, [null, 'old', null, 'old', 'no_price', 'other_unit', null, 'no_price']);
});

// ---- no key, no request; outside the United States, refused for good; bad inputs in plain words
await group('refusals', async () => {
  const none = await run(MEAD, null, { noKey: true });
  contract('mnfield (no key)', none, { secrets: SECRETS });
  same('no key: the plain sentence, nobody asked', [none.answer, none.asked], [{ ok: false, reason: "Local market prices (USDA Market News) are not set up on this server (the owner's free key is not set)" }, 0]);
  const env = await runLookup('mnfield', MEAD, { replay: null, now: NOW, env: { CROPHALO_SECRETS_DIR: secrets(false), CROPHALO_AMS_KEY: SECRET } });
  check('the host setting CROPHALO_AMS_KEY is read as the key (the lookup goes on to ask for the place)', env.answer?.reason !== none.answer?.reason && /Test run: no recorded answer/.test(env.answer?.reason || ''), env.answer);
  check('the host setting\'s key is not in the answer or the log', !SECRETS.some(s => env.stdout.includes(s) || env.stderr.includes(s)));

  const konya = folderWith([[POINTS(37.85, 32.5), { status: 404, body: '{"title":"stand-in"}' }]]);
  const k = await run(['37.85', '32.50', 'now', 'corn'], konya);
  contract('mnfield (outside the US)', k, { secrets: SECRETS });
  same('outside the United States: refused, final; only the weather service was asked', [k.answer, k.asked], [{ ok: false, reason: 'USDA Market News covers only the United States', final: true }, 1]);

  for (const [args, reason, final] of [[['abc', '-96.45', 'now', 'corn'], 'lat and lon are required (decimal degrees)', true], [['41.20', '', 'now', ''], 'lat and lon are required (decimal degrees)', true],
    [['41.20', '-96.45', 'later', 'corn'], 'mode must be now, hay or cost', true], [['41.20', '-96.45', 'now', 'Corn'], 'crops must be Crophalo crop ids', true],
    [['41.20', '-96.45', 'hay', ''], 'This Market News reading is not on this server yet', false]]) {
    const r = await run(args, null);
    contract(`mnfield (${args.join(' ')})`, r, { secrets: SECRETS });
    same(`bad input ${JSON.stringify(args)}: said plainly, nobody asked`, [r.answer, r.asked], [final ? { ok: false, reason, final: true } : { ok: false, reason }, 0]);
  }

  const refused = await run(MEAD, folderWith([[POINTS(MEAD[0], MEAD[1]), nwsMead], [`${API}/reports`, { status: 401, body: 'unauthorized' }]]));
  contract('mnfield (key refused)', refused, { secrets: SECRETS });
  same('a refused key (401): said plainly, not final', refused.answer, { ok: false, reason: 'USDA Market News did not accept the key set on this server' });
  const forbidden = await run(MEAD, meadFolder({ ne: { status: 403, body: 'forbidden' } }));
  same('a refused key on a report (403): the whole answer refused, no price shown', forbidden.answer, { ok: false, reason: 'USDA Market News did not accept the key set on this server' });
  const down = await run(MEAD, folderWith([[POINTS(MEAD[0], MEAD[1]), nwsMead], [`${API}/reports`, { replies: [{ fail: 'connection reset' }] }]]));
  contract('mnfield (service down)', down, { secrets: SECRETS });
  same('the service down: not read, said plainly; no old price', down.answer, { ok: false, reason: 'USDA Market News did not answer just now; try again in a minute' });
  const slow = await run(MEAD, folderWith([[POINTS(MEAD[0], MEAD[1]), nwsMead], [`${API}/reports`, { replies: [{ fail: 'hang' }] }]]), { limitS: 4 });
  contract('mnfield (too slow)', slow, { secrets: SECRETS });
  same('the service too slow: the lookup answers by itself before the server\'s limit', slow.answer, { ok: false, reason: 'USDA Market News took too long to answer; try again in a minute' });

  const DEAD = 'http://127.0.0.1:9';   // every proxy setting points at a closed local port: even a mistake could not reach the internet
  const recordTo = path.join(tempFolder('record'), 'rec');
  const rec = await runLookup('mnfield', MEAD, { live: true, record: recordTo, env: { CROPHALO_SECRETS_DIR: secrets(), http_proxy: DEAD, https_proxy: DEAD, all_proxy: DEAD, HTTP_PROXY: DEAD, HTTPS_PROXY: DEAD, ALL_PROXY: DEAD, no_proxy: '', NO_PROXY: '' } });
  same('recording asked: refused in plain words before any request, nothing recorded', [rec.answer, rec.asked, fs.existsSync(recordTo)], [{ ok: false, reason: 'A keyed source is never recorded; run this lookup without FW_NET_RECORD' }, 0, false]);

  const src = fs.readFileSync(path.join(LIVE_DIR, 'mnfield.py'), 'utf8'), body = src.slice(src.indexOf('def main('));
  check('the key is asked for before the place or any report (no key, no request)', body.indexOf('groundlib.keyed(') > 0 && body.indexOf('groundlib.keyed(') < body.indexOf('nws_point(') && body.indexOf('groundlib.keyed(') < body.indexOf('ask("/reports"'));
  check('a keyed lookup refuses to run while answers are recorded by hand (groundlib.keyed)', /if common\.RECORD:\s+raise Fail\("A keyed source is never recorded; run this lookup without FW_NET_RECORD"\)/.test(fs.readFileSync(path.join(LIVE_DIR, 'groundlib.py'), 'utf8')));
  check('the key goes only in the Authorization header, as HTTP Basic with an empty password', /headers=\{"Authorization": auth\}/.test(src) && /"Basic " \+ base64\.b64encode\(\(key \+ ":"\)/.test(src) && !/[?&]key=|api_key|\+ key\b(?! \+ ":")/.test(src.replace(/\(key \+ ":"\)/g, '')));
  check('mnfield.py never writes a file and never keeps an answer (no keep, no open for writing)', !/groundlib\.keep\(|\.write_text|\.write_bytes|open\([^)]*["']w|atomic_write/.test(src + fs.readFileSync(path.join(LIVE_DIR, 'mnlib.py'), 'utf8')));
  check('the time limits: 20 s a request, 90 s the lookup', /ASK_S = 20\b/.test(src) && /LIMIT_S = 90\b/.test(src) && /common\.run\(main, LIMIT_S, slow=SLOW\)/.test(src));
});

// ---- Mead, Nebraska: the state's own live report
await group('Mead, Nebraska (own report live)', async () => {
  const cache = path.join(tempFolder('cache'), 'c');
  const r = await run(MEAD, meadFolder(), { cache });
  contract('mnfield (Mead)', r, { secrets: SECRETS });
  const a = r.answer;
  same('the place: Nebraska, from the weather service\'s county zone', a?.place, { state: 'NE', state_name: 'Nebraska', county_zone: 'NEC155' });
  same('the dates used: today and the 14-day window', [a?.today, a?.window], ['2026-11-15', { from: isoDaysAgo(14), to: '2026-11-15' }]);
  same('own report: 3225, live, its title and date from the list', a?.own, { id: 3225, title: 'Stand-in Nebraska Elevator Grain Bids', published: '2026-11-13', live: true });
  same('the reports in the order tried: own, then the national report for canola', a?.reports?.map(x => [x.id, x.role, x.state, x.live, x.read, x.rows_kept, x.co_publisher]),
    [[3225, 'own', 'NE', true, true, 9, 'NE Dept. of Ag Market News'], [2887, 'national', null, true, true, 3, null]]);
  same('asked: the weather service, the list, 3225 and 2887 once each', r.asked, 4);
  const corn = by(a, 'corn');
  same('corn: own, 3225, the newest day (2 days old)', [corn?.status, corn?.report, corn?.report_date, corn?.age_days, corn?.name, corn?.class], ['own', 3225, '2026-11-13', 2, 'Corn', 'Yellow']);
  same('corn: each region its own low and high, as printed, never averaged', regionsOf(corn), [['East', 1.11, 2.22], ['Central', 1.115, 2.135]]);
  same('corn: the state\'s lowest low and highest high, and the year-ago figures low and high', [corn?.low, corn?.high, corn?.year_ago_low, corn?.year_ago_high], [1.11, 2.22, 1.05, 1.06]);
  check('corn: no region average is invented (no average field anywhere)', !/"avg|"average|"mean/.test(JSON.stringify(a)));
  check('corn: the older day\'s bids are not used (newest day per crop only)', !JSON.stringify(corn).includes('9.91'));
  same('corn: the unit, the buyer, by truck, no places (not far)', [corn?.unit, corn?.buyer, corn?.delivered_by_truck, corn?.places], ['$ per bushel', 'Country Elevators', true, []]);
  check('the dropped rows never show: terminal, organic, forward and old prices are not in the answer', !['7.77', '8.88', '8.11', '9.95'].some(v => JSON.stringify(a).includes(v)));
  same('dropped, by reason: one old, one forward here and one in 2887, one organic, one without a price, one not an elevator', a?.dropped, { organic: 1, forward: 2, no_price: 1, other_unit: 0, old: 1, other_buyer: 1 });
  const soy = by(a, 'soy'), wheat = by(a, 'wheat'), sorghum = by(a, 'sorghum');
  same('soybeans: own; two regions; the year-ago figure where one is a number', [soy?.status, regionsOf(soy), soy?.year_ago_low, soy?.year_ago_high], ['own', [['East', 3.33, 4.44], ['Central', 3.3, 4.4]], 3.01, 3.01]);
  same('wheat: own, class Hard Red Winter; a region without a year-ago figure says null', [wheat?.status, wheat?.class, wheat?.regions?.map(x => [x.region, x.year_ago_low]), wheat?.year_ago_low], ['own', 'Hard Red Winter', [['East', null], ['Northwest', 5.01]], 5.01]);
  same('sorghum (not asked, in the state report): own; every year-ago null', [sorghum?.status, sorghum?.report, sorghum?.year_ago_low, sorghum?.year_ago_high], ['own', 3225, null, null]);
  const canola = by(a, 'canola');
  same('canola: far, from 2887, its own buyer and the states, a hundred pounds', [canola?.status, canola?.report, canola?.buyer, canola?.places, canola?.unit, canola?.low, canola?.high],
    ['far', 2887, 'Terminals/Mills/Processors', ['MN', 'ND'], '$ per hundred pounds', 11.1, 11.3]);
  check('canola: the forward bid of 2887 is not used', !JSON.stringify(canola).includes('12.2'));
  same('pearl millet and finger millet: none found, no name, no price', ['pmillet', 'fmillet'].map(c => [by(a, c)?.status, by(a, c)?.name, by(a, c)?.low, by(a, c)?.regions]), [['none_found', null, null, []], ['none_found', null, null, []]]);
  check('no crop line is the report\'s Millet, and Millet was never asked for', !a?.crops?.some(c => c.name === 'Millet') && !JSON.stringify(a?.crops).includes('White'));
  same('the crops, in order, each once', a?.crops?.map(c => c.crop), ['canola', 'corn', 'fmillet', 'pmillet', 'sorghum', 'soy', 'wheat']);
  same('complete, and nothing forward in Tier 1', [a?.incomplete, a?.forward], [false, []]);
  check('the answer is under 50 kB', Buffer.byteLength(r.stdout) < 50e3, Buffer.byteLength(r.stdout));
  const files = []; (function walk(d) { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } })(cache);
  same('the cache folder holds only the weather service\'s keyless point answer', files.map(f => path.relative(cache, f)), [path.join('nws', 'point_41.2000_-96.4500.json')]);
  check('no Market News figure or word was written to the cache folder', files.every(f => !/Stand-in|Market|1\.11|marsapi/.test(fs.readFileSync(f, 'utf8'))));
  check('the key is nowhere in the answer or the log', !SECRETS.some(s => r.stdout.includes(s) || r.stderr.includes(s)));
  check('the log names no Market News address with its query (a query can hold the place)', !/report_begin_date|commodity=/.test(r.stderr));

  const layers = await run(argsOf('lat=41.18&lon=-96.44&mode=now&crops='), meadFolder());
  contract('mnfield (Mead, the Layers card)', layers, { secrets: SECRETS });
  same('no crops asked (the Layers card): the state report\'s own crops, all own, and 2887 not asked', [layers.answer?.crops?.map(c => [c.crop, c.status]), layers.answer?.reports?.map(x => x.id), layers.asked],
    [[['corn', 'own'], ['sorghum', 'own'], ['soy', 'own'], ['wheat', 'own']], [3225], 3]);

  const cover = await run(argsOf('lat=41.18&lon=-96.44&mode=now&crops=alfalfa,corn,ryecover'), meadFolder());
  same('a cover crop and a forage crop are never checked: no line, listed as not checked', [cover.answer?.crops?.map(c => c.crop), cover.answer?.not_checked], [['corn', 'sorghum', 'soy', 'wheat'], ['alfalfa', 'ryecover']]);
});

await group('Nebraska: not read', async () => {
  const empty = await run(MEAD, meadFolder({ ne: EMPTY, canola: EMPTY }));
  contract('mnfield (Nebraska, no fresh rows)', empty, { secrets: SECRETS });
  const a = empty.answer;
  same('the own report has no rows in 14 days: its crops not read, with the report named', ['corn', 'soy', 'wheat'].map(c => [by(a, c)?.status, by(a, c)?.report, by(a, c)?.low]), [['not_read', 3225, null], ['not_read', 3225, null], ['not_read', 3225, null]]);
  same('2887 has no rows: canola not read, named 2887; a millet still none found', [by(a, 'canola')?.status, by(a, 'canola')?.report, by(a, 'pmillet')?.status], ['not_read', 2887, 'none_found']);
  same('never an old or typical price instead', a?.crops?.filter(c => c.low !== null).length, 0);

  const header = await run(MEAD, meadFolder({ ne: HEADER }));
  same('a Report Header answer (no prices) is never read as bids: not read, both rows counted as without a price', [by(header.answer, 'corn')?.status, header.answer?.dropped?.no_price], ['not_read', 2]);

  const stale = await run(MEAD, meadFolder({ list: listWith(l => { l.find(x => x.slug_id === '3225').published_date = `${mdy(31)} 07:00:00`; }) }));
  contract('mnfield (Nebraska, own report stopped)', stale, { secrets: SECRETS });
  same('3225 published 31 days ago: not live, never asked; its date is returned', [stale.answer?.own?.live, stale.answer?.own?.published, stale.answer?.reports?.find(x => x.id === 3225)?.read], [false, isoDaysAgo(31), false]);
  same('…and with no neighbour report its crops are not read; canola still far from 2887', [by(stale.answer, 'corn')?.status, by(stale.answer, 'corn')?.report, by(stale.answer, 'canola')?.status, stale.asked], ['not_read', 3225, 'far', 3]);
  check('every address asked was a recorded one (3225 was not asked)', stale.misses.length === 0, stale.misses);

  const failing = await run(MEAD, meadFolder({ canola: { replies: [{ status: 500 }] } }));
  contract('mnfield (2887 failing)', failing, { secrets: SECRETS });
  same('one report failing: its crop not read, the others kept, the answer marked incomplete', [by(failing.answer, 'canola')?.status, by(failing.answer, 'corn')?.status, failing.answer?.incomplete], ['not_read', 'own', true]);
});

// ---- Beltsville, Maryland: its own report stopped, the neighbours in order
await group('Beltsville, Maryland (own report stopped)', async () => {
  const r = await run(BELTS, beltsFolder());
  contract('mnfield (Beltsville)', r, { secrets: SECRETS });
  const a = r.answer;
  same('the place: Maryland', [a?.place?.state, a?.place?.state_name, a?.place?.county_zone], ['MD', 'Maryland', 'MDC033']);
  same('own report 2714: not live, its last date said', a?.own, { id: 2714, title: 'Stand-in Maryland Grain Bids', published: iso('06/20/2026'), live: false });
  same('reports in the order tried: 2714 (never asked), Pennsylvania 3091, Virginia 3167, then 2887', a?.reports?.map(x => [x.id, x.role, x.state, x.live, x.read, x.co_publisher]),
    [[2714, 'own', 'MD', false, false, 'MD Dept. of Ag Market News'], [3091, 'neighbour', 'PA', true, true, null], [3167, 'neighbour', 'VA', true, true, null], [2887, 'national', null, true, true, null]]);
  same('asked: the weather service, the list, 3091, 3167, 2887 (2714 never)', [r.asked, r.misses], [5, []]);
  same('corn, soybeans, wheat: neighbour, from 3091 first (not 3167)', ['corn', 'soy', 'wheat'].map(c => [by(a, c)?.status, by(a, c)?.report]), [['neighbour', 3091], ['neighbour', 3091], ['neighbour', 3091]]);
  same('corn from 3091: its two regions; organic and forward rows not in it', regionsOf(by(a, 'corn')), [['East', 1.21, 1.31], ['Central', 1.22, 1.32]]);
  same('wheat: Soft Red Winter, the newest day', [by(a, 'wheat')?.class, by(a, 'wheat')?.report_date], ['Soft Red Winter', iso('11/12/2026')]);
  same('sorghum: neighbour, from 3167, one area', [by(a, 'sorghum')?.status, by(a, 'sorghum')?.report, regionsOf(by(a, 'sorghum'))], ['neighbour', 3167, [['South Area', 1.41, 1.41]]]);
  same('canola: far, terminals, mills or processors in Minnesota and North Dakota', [by(a, 'canola')?.status, by(a, 'canola')?.buyer, by(a, 'canola')?.places], ['far', 'Terminals/Mills/Processors', ['MN', 'ND']]);
  same('pigeon peas: none found, no name', [by(a, 'pigeonpea')?.status, by(a, 'pigeonpea')?.name], ['none_found', null]);
  same('the cover crop is never checked', [by(a, 'ryecover'), a?.not_checked], [undefined, ['ryecover']]);
  same('dropped: organic, cent-a-bushel without a price, forward and past-forward, old, and a terminal elevator', a?.dropped, { organic: 1, forward: 4, no_price: 0, other_unit: 1, old: 1, other_buyer: 1 });
  check('no Pennsylvania organic, forward or old price shows', !['7.21', '7.31', '7.51', '9.21', '1.7,'].some(v => JSON.stringify(a?.crops).includes(v)));
  check('the answer is under 50 kB', Buffer.byteLength(r.stdout) < 50e3);

  const noPa = await run(BELTS, beltsFolder({ list: listWith(l => { l.find(x => x.slug_id === '3091').published_date = `${mdy(40)} 07:00:00`; }) }));
  contract('mnfield (Beltsville, 3091 not live)', noPa, { secrets: SECRETS });
  same('3091 not live: never asked; corn then comes from 3167', [noPa.answer?.reports?.find(x => x.id === 3091)?.read, by(noPa.answer, 'corn')?.status, by(noPa.answer, 'corn')?.report], [false, 'neighbour', 3167]);
  same('two kept rows of one area on one day are both returned as they are', regionsOf(by(noPa.answer, 'corn')), [['North Area', 1.51, 1.51], ['North Area', 1.52, 1.62], ['South Area', 1.55, 1.65]]);
  same('…its low and high across the areas, never an average', [by(noPa.answer, 'corn')?.low, by(noPa.answer, 'corn')?.high], [1.51, 1.65]);
  same('wheat: 3167 has fresh rows but no wheat: none found', [by(noPa.answer, 'wheat')?.status, by(noPa.answer, 'wheat')?.report], ['none_found', null]);

  const empty = await run(BELTS, beltsFolder({ pa: EMPTY, va: EMPTY }));
  contract('mnfield (Beltsville, no fresh rows)', empty, { secrets: SECRETS });
  same('both neighbours without rows in 14 days: their crops not read, the first named', ['corn', 'soy', 'wheat', 'sorghum'].map(c => [by(empty.answer, c)?.status, by(empty.answer, c)?.report]), [['not_read', 3091], ['not_read', 3091], ['not_read', 3091], ['not_read', 3091]]);
  same('…canola still far; pigeon peas still none found', [by(empty.answer, 'canola')?.status, by(empty.answer, 'pigeonpea')?.status], ['far', 'none_found']);

  const failing = await run(BELTS, beltsFolder({ va: { replies: [{ status: 500 }] } }));
  contract('mnfield (Beltsville, 3167 failing)', failing, { secrets: SECRETS });
  same('3167 failing: sorghum not read (3167), the Pennsylvania crops kept, incomplete', [by(failing.answer, 'sorghum')?.status, by(failing.answer, 'sorghum')?.report, by(failing.answer, 'corn')?.status, failing.answer?.incomplete], ['not_read', 3167, 'neighbour', true]);

  const missing = await run(BELTS, folderWith([MD_POINTS, [`${API}/reports`, LIST]]));
  check('an address with no recorded answer is named in the log without the key', missing.misses.length > 0 && missing.misses.every(m => !SECRETS.some(s => m.includes(s))), missing.misses);
  check('…and every address holds no key: the recorded ones were matched exactly', !SECRETS.some(s => missing.stderr.includes(s) || missing.stdout.includes(s)));
});

await group('a state with no grain report (Alaska)', async () => {
  const r = await run(['61.20', '-149.90', 'now', 'barley,canola,corn'], folderWith([[POINTS(61.2, -149.9), nwsStandin('AK', 'AKC020')]]));
  contract('mnfield (Alaska)', r, { secrets: SECRETS });
  same('answered, own null, every crop not read, no Market News request', [r.answer?.ok, r.answer?.own, r.answer?.crops?.map(c => [c.crop, c.status]), r.answer?.reports, r.asked],
    [true, null, [['barley', 'not_read'], ['canola', 'not_read'], ['corn', 'not_read']], [], 1]);
});

await group('the answer stays small', async () => {
  const rows = [];
  for (let d = 0; d < 14; d++) for (let g = 0; g < 40; g++) for (const c of ['Corn', 'Soybeans', 'Wheat', 'Sorghum', 'Barley']) rows.push({ report_date: mdy(d), commodity: c, trade_loc: `Region ${g}`, class: null, delivery_point: 'Country Elevators', conventional: 'Conventional', current: 'Yes', price_unit: '$ Per Bushel', 'price Min': 1 + g / 100, 'price Max': 2 + g / 100, avg_price_year_ago: 1.5, freight: 'Delivered', trans_mode: 'Truck', location_State: null });
  const big = JSON.stringify({ reportSection: 'Report Detail', results: rows });
  const r = await run(argsOf('lat=41.18&lon=-96.44&mode=now&crops=barley,bean,canola,chickpea,corn,durum,lentil,pea,sorghum,soy,sunflower,swheat,wheat'), folderWith([[POINTS(41.2, -96.45), nwsMead], [`${API}/reports`, LIST], [DETAIL(3225), big],
    [DETAIL(2887, ';commodity=Canola'), CANOLA], [DETAIL(2887, ';commodity=Sunflower%20Seeds'), EMPTY], [DETAIL(2914, ';commodity=Beans', 21), EMPTY], [DETAIL(2914, ';commodity=Lentils', 21), EMPTY], [DETAIL(2914, ';commodity=Peas', 21), EMPTY]]));
  contract('mnfield (a large report)', r, { secrets: SECRETS });
  check(`${rows.length} stand-in rows, 40 regions: the answer is under 50 kB`, r.answer?.ok === true && Buffer.byteLength(r.stdout) < 50e3, Buffer.byteLength(r.stdout));
  same('one line per region of the newest day only', by(r.answer, 'corn')?.regions?.length, 40);
  same('2914 is asked over 21 days, once for Beans (dry beans and chickpeas share it); sunflower by its name with a space', [r.misses, by(r.answer, 'chickpea')?.status, by(r.answer, 'bean')?.report, by(r.answer, 'sunflower')?.report], [[], 'not_read', 2914, 2887]);
});

// ---- package D: proso millet is the report's "Millet"; pearl and finger millet never are; flax is never matched
await group('a Colorado field: the proso pair (report 2887, hand-made millet rows)', async () => {
  const MILLET = standin('national_millet_standin.txt'), CO = argsOf('lat=40.62&lon=-103.2&mode=now&crops=flax,fmillet,pmillet,proso,rice');
  const folder = folderWith([[POINTS(CO[0], CO[1]), nwsStandin('CO', 'COC125')], [`${API}/reports`, LIST], [DETAIL(2887, ';commodity=Millet'), MILLET]]);
  const r = await run(CO, folder), a = r.answer;
  const by2 = c => a?.crops?.find(x => x.crop === c);
  same('proso: a far bid from the national report 2887, named Millet, in a hundred pounds', [by2('proso')?.status, by2('proso')?.report, by2('proso')?.name, by2('proso')?.unit, by2('proso')?.buyer], ['far', 2887, 'Millet', '$ per hundred pounds', 'Country Elevators']);
  same('proso: the states of the rows, Colorado among them', by2('proso')?.places, ['CO', 'NE']);
  same('pearl and finger millet: never a bid, whatever the report holds', [by2('pmillet')?.status, by2('pmillet')?.report, by2('fmillet')?.status, by2('fmillet')?.report], ['none_found', null, 'none_found', null]);
  same('rice: never matched (report 1655 prices milled rice, not what a farmer is paid for paddy rice): none found, no report', [by2('rice')?.status, by2('rice')?.report], ['none_found', null]);
  same('flax: never matched until a real answer shows a flaxseed row', [by2('flax')?.status, by2('flax')?.report], ['none_found', null]);
  same('the reports asked: Colorado\'s own (not live here) and the national one for the millet', a?.reports?.map(x => [x.id, x.role, x.read]), [[2912, 'own', false], [2887, 'national', true]]);
});

finish();
