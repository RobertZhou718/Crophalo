// Crophalo's info-pages suite: units and their sample lines, currency notes, backup and restore, the privacy table and deletes, the Limitations page, the Settings and Privacy markup, the read-only service status page.
// RULE: never loosen a check here to make it pass. A failure means a farmer sees a wrong unit, loses saved data, or is told something untrue about what leaves the device: fix the project, not the test.
// No internet is needed. Run: node scripts/test_pages.mjs
import { fmtRain, fmtTemp, fmtTempChange, fmtArea, fmtLength, fmtSpeed, fmtYield, cleanUnits, unitsFor, defaultUnits, sampleLines, METRIC, IMPERIAL } from '../js/units.js';
import fs from 'node:fs';
import { cleanRates, fxNote, money, loadRates, readRates, CURRENCIES } from '../js/currency.js';
import { makeBackup, checkBackup, restoreBackup, describeBackup, backupName, NOT_KEPT, MAX_BYTES } from '../js/backup.js';
import { SENT, GROUPS, makeArmer, eraseGroup, eraseEverything, storageCounts, ARM_MS, keptLines } from '../js/privacy.js';
import { privacyHTML, limitsHTML, settingsHTML, tabsHTML } from '../js/pages-view.js';
import { cleanSources, adminHTML, loadSources, checkSources, whenWords, msWords, lastLine, ADMIN_DOWN, OLDER_SHAPE } from '../js/admin-view.js';
const YR = 2026;   // the year of the hand-made currency answer's day: the dates below are written from it

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
class Store { constructor(o = {}, limit = Infinity) { this.m = new Map(Object.entries(o)); this.limit = limit; } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } removeItem(k) { this.m.delete(k); } setItem(k, v) { if (this.m.size >= this.limit && !this.m.has(k)) throw new Error('full'); this.m.set(k, String(v)); } }

// ---- units
same('metric rain', fmtRain(25, METRIC), '25 mm'); same('inch rain', fmtRain(25.4, IMPERIAL), '1 in'); same('inch rain, a decimal', fmtRain(63.5, IMPERIAL), '2.5 in');
same('metric temp', fmtTemp(20, METRIC), '20 °C'); same('F temp', fmtTemp(20, IMPERIAL), '68 °F');
check('never "−0 °C"', !fmtTemp(-0.2, METRIC).includes('−0') && fmtTemp(-0.2, METRIC) === '0 °C', fmtTemp(-0.2, METRIC));
same('a temperature change has no 32 added', fmtTempChange(2, IMPERIAL), '+3.6 °F'); same('a change in C', fmtTempChange(1.5, METRIC), '+1.5 °C');
same('hectares', fmtArea(10, METRIC), '10.0 ha'); same('acres', fmtArea(10, IMPERIAL), '24.7 acres');
same('metres', fmtLength(300, METRIC), '300 m'); same('feet', fmtLength(300, IMPERIAL), '984 ft');
same('km/h', fmtSpeed(40, METRIC), '40 km/h'); same('mph', fmtSpeed(40, IMPERIAL), '25 mph');
same('t/ha', fmtYield(10, METRIC, 'corn'), '10.0 t/ha');
same('corn in bushels, rounded to 5', fmtYield(10, IMPERIAL, 'corn'), '160 bushels/acre');
check('soy uses 60 lb bushels', fmtYield(3, IMPERIAL, 'soy') === '45 bushels/acre', fmtYield(3, IMPERIAL, 'soy'));
check('a crop with no bushel is in tons per acre', /tons\/acre$/.test(fmtYield(10, IMPERIAL, 'potato')), fmtYield(10, IMPERIAL, 'potato'));
same('a missing number is empty', [fmtRain(NaN, METRIC), fmtTemp(undefined, METRIC), fmtArea(null, METRIC), fmtYield('x', METRIC)], ['', '', '', '']);
same('the US defaults to imperial', defaultUnits('us'), IMPERIAL); same('Liberia and Myanmar too', [defaultUnits('LR').rain, defaultUnits('MM').rain], ['in', 'in']);
same('everyone else metric', [defaultUnits('CA'), defaultUnits('TR'), defaultUnits(undefined)], [METRIC, METRIC, METRIC]);
same('a United States field defaults to inches, °F, acres and bushels; a Canadian one and one in Türkiye to metric; the farmer\'s own choice always wins', [unitsFor({}, 'US'), unitsFor({}, 'CA'), unitsFor({}, 'TR'), unitsFor({ temp: 'C' }, 'US').temp, unitsFor({ area: 'imperial' }, 'TR').area], [IMPERIAL, METRIC, METRIC, 'C', 'imperial']);
same('a chosen unit beats the country', unitsFor({ rain: 'mm' }, 'US').rain, 'mm'); same('the others still follow the country', unitsFor({ rain: 'mm' }, 'US').temp, 'F');
same('a hostile stored value is rebuilt from known parts', cleanUnits({ rain: '<script>', temp: 'F', area: 5, yield: 'bu', extra: 1, __proto__: { rain: 'in' } }), { temp: 'F', yield: 'bu' });
same('an array is not units', cleanUnits(['mm']), {}); same('null is not units', cleanUnits(null), {});
{ const s = sampleLines(unitsFor({}, 'CA'), 'US$100'); same('six sample lines', s.map(l => l[0]), ['Rain', 'Temperature', 'Money', 'A field', 'Wind', 'Yield of corn']); same('the field line', s[3][1], '10.0 ha at 300 m'); }
{ const s = sampleLines({ rain: 'mm', temp: 'C', area: 'imperial', yield: 'bu' }); same('units chosen one at a time mix', [s[0][1], s[1][1], s[3][1]], ['25 mm', '20 °C', '24.7 acres at 984 ft']); }

// ---- currency
const FX = { base: 'USD', date: `${YR}-11-13`, rates: { EUR: 0.93, TRY: 34.2, CAD: 1.4, XXX: 3, GBP: -1, AUD: 'x' } };
{ const r = cleanRates(FX); same('known codes with real numbers only', Object.keys(r.rates).sort(), ['CAD', 'EUR', 'TRY', 'USD']); same('the date is kept', r.date, `${YR}-11-13`); }
same('a wrong base is refused', cleanRates({ ...FX, base: 'EUR' }), null); same('a bad date is refused', cleanRates({ ...FX, date: 'yesterday' }), null); same('nothing usable is refused', cleanRates({ base: 'USD', date: `${YR}-01-01`, rates: {} }), null);
same('null is refused', cleanRates(null), null);
same('US dollars note', fxNote('USD', null), 'Amounts are in US dollars.');
check('a currency note names the rate and the date', /1 US\$ = 0\.93 EUR/.test(fxNote('EUR', cleanRates(FX))) && new RegExp(`${YR}-11-13`).test(fxNote('EUR', cleanRates(FX))), fxNote('EUR', cleanRates(FX)));
check('a currency note names the European Central Bank, Frankfurter and the date', new RegExp(`Exchange rates from the European Central Bank, via Frankfurter, ${YR}-11-13\\.`).test(fxNote('EUR', cleanRates(FX))));
check('large rates have one decimal', /34\.2 TRY/.test(fxNote('TRY', cleanRates(FX))), fxNote('TRY', cleanRates(FX)));
check('no rates says amounts stay in dollars', /stay in US dollars/.test(fxNote('EUR', null)), fxNote('EUR', null));
check('money converts', money(100, 'EUR', cleanRates(FX)).includes('93'), money(100, 'EUR', cleanRates(FX)));
check('money falls back to dollars', money(100, 'EUR', null).includes('$'), money(100, 'EUR', null));
check('eight currencies', CURRENCIES.length === 8 && CURRENCIES.some(c => c[0] === 'TRY'));
{ const st = new Store(); let calls = 0; const get = async () => { calls++; return { json: async () => FX }; };
  const a = await loadRates(get, st, 1e12), b = await loadRates(get, st, 1e12 + 3600e3);
  check('rates are asked once and kept for 12 hours', calls === 1 && a && b && b.date === `${YR}-11-13`, `calls ${calls}`);
  await loadRates(get, st, 1e12 + 13 * 3600e3); check('after 12 hours they are asked again', calls === 2, `calls ${calls}`);
  const bad = await loadRates(async () => { throw new Error('offline'); }, new Store(), 5); same('a failed ask leaves nothing', bad, null);
  same('readRates of an empty store', readRates(new Store(), 1), null); }

// ---- backup
const SAVED = JSON.stringify([{ id: 'a' }, { id: 'b' }]), NOTES = JSON.stringify([{ id: 'n' }]);
function sampleStore() { return new Store({ 'crophalo.saved.v1': SAVED, 'crophalo.notes.v1': NOTES, 'crophalo.settings.v1': '{"text":"large"}', 'crophalo.fx.v1': '{}', 'crophalo.admin': 'secret', 'other.thing': 'x' }); }
{ const b = makeBackup(sampleStore(), Date.UTC(2026, 10, 14), 'a test'); same('a backup keeps ours and leaves rates, admin and strangers', Object.keys(b.keys), ['crophalo.notes.v1', 'crophalo.saved.v1', 'crophalo.settings.v1']);
  same('its header', [b.app, b.v, b.saved.slice(0, 10)], ['crophalo', 1, '2026-11-14']);
  const r = checkBackup(JSON.stringify(b)); check('a backup checks out', r.ok && Object.keys(r.backup.keys).length === 3, brief(r));
  same('described', [describeBackup(r.backup).saved, describeBackup(r.backup).notes], [2, 1]);
  const target = new Store({ 'crophalo.saved.v1': '[]', 'crophalo.farms.v1': '[1]', 'crophalo.admin': 'keep' });
  check('restore works', restoreBackup(r.backup, target).ok); same('restore replaced what was there', [target.getItem('crophalo.saved.v1'), target.getItem('crophalo.farms.v1')], [SAVED, null]);
  same('the admin key is left alone', target.getItem('crophalo.admin'), 'keep');
  const full = new Store({ 'crophalo.saved.v1': '[{"id":"old"}]' }, 2), res = restoreBackup(r.backup, full);
  check('all or nothing: a store that fills up gets its old contents back', !res.ok && full.getItem('crophalo.saved.v1') === '[{"id":"old"}]' && full.length === 1, `${brief(res)} ${full.length}`); }
same('the file name', backupName(Date.UTC(2026, 10, 14)), 'crophalo-backup-2026-11-14.json');
for (const [name, text] of [['not JSON', 'hello'], ['an array', '[]'], ['another app', JSON.stringify({ app: 'x', v: 1, keys: {} })], ['a wrong version', JSON.stringify({ app: 'crophalo', v: 2, keys: {} })], ['no keys', JSON.stringify({ app: 'crophalo', v: 1 })], ['keys as an array', JSON.stringify({ app: 'crophalo', v: 1, keys: [] })],
  ['a list that is not a list', JSON.stringify({ app: 'crophalo', v: 1, keys: { 'crophalo.saved.v1': '{"a":1}' } })], ['a value that is not JSON', JSON.stringify({ app: 'crophalo', v: 1, keys: { 'crophalo.notes.v1': 'nope' } })],
  ['a value that is not a string', JSON.stringify({ app: 'crophalo', v: 1, keys: { 'crophalo.saved.v1': [] } })], ['settings as an array', JSON.stringify({ app: 'crophalo', v: 1, keys: { 'crophalo.settings.v1': '[]' } })]])
  check(`refused: ${name}`, !checkBackup(text).ok);
check('refused: over 25 MB', !checkBackup('x'.repeat(MAX_BYTES + 1)).ok); check('refused: not text', !checkBackup(null).ok);
{ const r = checkBackup(JSON.stringify({ app: 'crophalo', v: 1, keys: { 'crophalo.admin': 'x', 'evil': '1', 'crophalo.fx.v1': '{}', '__proto__': '1', 'crophalo.saved.v1': SAVED } })); same('keys that are not ours or must not travel are left behind', Object.keys(r.backup.keys), ['crophalo.saved.v1']); }
check('the not-kept list names rates and admin', NOT_KEPT.includes('crophalo.fx.v1') && NOT_KEPT.includes('crophalo.admin'));

// ---- privacy
const services = SENT.map(r => r.service).join('|');
// No Overpass row: no file of the app asks the Overpass server any more (the check below, "the code loads from", keeps every host that is asked).
for (const name of ['NASA POWER', 'Crophalo data server', 'Open-Meteo', 'NASA map pictures', 'Street map tiles', 'OpenStreetMap', 'Frankfurter', 'push service', 'speech']) check(`the table names ${name}`, services.includes(name));
// The setup map and the region cards ask NASA GIBS for their pictures now, no longer Esri, so the table names NASA GIBS too.
check('the table names NASA GIBS for the setup map', SENT.some(r => r.service.includes('NASA GIBS') && /setup map/.test(r.why)));
check('no row names a service the app does not ask', !SENT.some(r => /Overpass/.test(r.service)) || /overpass/i.test(fs.readdirSync(new URL('../js/', import.meta.url)).map(f => fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8')).join('\n')));
check('every row says what it gets and why', SENT.every(r => r.gets.length > 10 && r.why.length > 10));
check('the Frankfurter row says it gets nothing about the farmer', SENT.find(r => r.service.includes('Frankfurter')).gets.startsWith('Nothing'));
{ let t = 0; const a = makeArmer(() => t);
  same('first press arms', a.press('saved'), 'armed'); t = 4000; same('a second press within 5 s deletes', a.press('saved'), 'delete'); same('and disarms', a.armed(), null);
  t = 10000; a.press('saved'); t = 10000 + ARM_MS + 1; same('after 5 s it disarms by itself', [a.expire(), a.armed()], ['saved', null]);
  t = 20000; a.press('saved'); t = 20000 + ARM_MS + 1; same('a late second press only arms again', a.press('saved'), 'armed');
  t = 30000; a.press('saved'); same('a different button only arms', a.press('farms'), 'armed'); }
{ const st = new Store({ 'crophalo.saved.v1': SAVED, 'crophalo.notes.v1': NOTES, 'crophalo.todo.v1': '[1]', 'crophalo.record.v1': '[1]', 'crophalo.farms.v1': '[1]', 'crophalo.remind.v1': '[1]', 'crophalo.settings.v1': '{}' });
  let timers = 0, push = 0; const env = { local: st, stopTimers: () => timers++, pushOff: async () => { push++; } };
  await eraseGroup('saved', env); same('saved fields deleted, the rest kept', [st.getItem('crophalo.saved.v1'), st.getItem('crophalo.notes.v1') !== null], [null, true]);
  await eraseGroup('notes', env); same('notes, to-do and crop history all', [st.getItem('crophalo.notes.v1'), st.getItem('crophalo.todo.v1'), st.getItem('crophalo.record.v1')], [null, null, null]);
  await eraseGroup('reminders', env); same('reminders also stop timers and push', [st.getItem('crophalo.remind.v1'), timers, push], [null, 1, 1]);
  check('settings survive a group delete', st.getItem('crophalo.settings.v1') === '{}'); }
{ const local = new Store({ 'crophalo.saved.v1': SAVED, 'crophalo.settings.v1': '{}', 'crophalo.fx.v1': '{}', 'other.app': 'keep' }), session = new Store({ 'crophalo.report': 'x', 'other': 'y' });
  const cacheNames = ['crophalo-v3', 'other-cache']; const caches = { keys: async () => [...cacheNames], delete: async n => { cacheNames.splice(cacheNames.indexOf(n), 1); return true; } };
  let timers = 0, push = 0; const done = await eraseEverything({ local, session, caches, stopTimers: () => timers++, pushOff: async () => { push++; } });
  same('delete everything clears local keys of ours', [...local.m.keys()], ['other.app']); same('and this tab’s session', [...session.m.keys()], ['other']); same('and the saved copy of the app', cacheNames, ['other-cache']);
  same('and stops timers and push together', [timers, push, done.includes('timers'), done.includes('push')], [1, 1, true, true]); }
{ const c = storageCounts(new Store({ 'crophalo.saved.v1': SAVED, 'crophalo.notes.v1': 'broken', 'crophalo.answers.v1': '{"a":1,"b":2}' })); same('counts', [c.saved, c.notes, c.answers, c.farms], [2, 0, 2, 0]); }
same('plural words', keptLines({ saved: 1, farms: 0, notes: 1, todo: 0, record: 2, reminders: 1, answers: 0 }).slice(0, 4), ['1 saved field', '0 farms', '1 note, 0 to-do jobs and 2 crop-history entries', '1 reminder']);
check('every group has a label', GROUPS.every(g => g.label && g.id)); check('Everything is one of the choices', GROUPS.some(g => g.id === 'everything'));

// ---- the pages
{ const html = privacyHTML('device', { saved: 2, farms: 1, notes: 0, record: 0, reminders: 0, answers: 0 }); check('Privacy has two tabs only: on your device, sent to other services', (html.match(/role="tab"/g) ?? []).length === 2 && !/Your choices/.test(html));
  check('Privacy device tab: no account, an empty sign-in slot, the kept lines each with their own Delete and Everything last', html.includes('No account') && html.includes('data-slot="signin"') && ['farms', 'notes', 'answers', 'everything'].every(id => html.includes(`data-erase="${id}"`)) && html.lastIndexOf('data-erase="everything"') > html.lastIndexOf('data-erase="answers"') && !/Saved fields|saved fields/.test(html));
  check('the backup is here: download, restore, the file input and the line that says deleted is gone for good', ['data-backup', 'data-restore', 'restoreFile', 'Deleted is gone for good'].every(x => html.includes(x)));
  check('the welcome page is no longer offered to read again here', !html.includes('data-open-welcome')); }
{ const html = privacyHTML('sent'); check('Privacy sent tab lists every recipient', SENT.every(r => html.includes(r.service.replace(/&/g, '&amp;').replace(/’/g, '’'))) || SENT.every(r => html.includes(r.service.split(' ')[0]))); check('the table has headers', html.includes('<th scope="col">Service</th>')); }
{ const html = limitsHTML(); for (const w of ['Very sure', 'Fairly sure', 'Somewhat sure']) check(`Limitations explains ${w}`, html.includes(w));
  check('Limitations never repeats the old coverage claim', !/14,000|every cell of Canada/i.test(html));
  check('Limitations is one page: no tabs', !html.includes('role="tablist"'));
  check('it says weather is a 50 km square and that you decide', html.includes('50 km') && /You decide/.test(html));
  const sight = html.replace(/<details[\s\S]*?<\/details>/g, ' '), plain = h => h.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  check('what shows without pressing Show more is about 120 words, not 423 (at most 150)', plain(sight).split(' ').length <= 150, plain(sight).split(' ').length);
  check('nothing true is lost: the longer words are under Show more, closed at first', (html.match(/<details class="lim-fold"/g) ?? []).length === 7 && !/<details[^>]*open/.test(html) && /valley floor/.test(html) && /rules of thumb/.test(html) && /Canada and the United States/.test(html));
  check('five cards each with an icon from the icon set, a short title and at most two sentences in sight, plus the sixth, the tinted card and the chips', (sight.match(/<section class="lim-card"/g) ?? []).length === 6 && (sight.match(/<use href="#i-/g) ?? []).length === 6 && /class="lim-decide"/.test(html) && /<ul class="lim-chips">/.test(html) && [...sight.matchAll(/<section class="lim-card"[\s\S]*?<\/section>/g)].every(m => (plain(m[0].replace(/<h2[\s\S]*?<\/h2>/, '')).match(/[.!?](\s|$)/g) ?? []).length <= 2));
  check('the old ten "not covered" items are chips (pests and diseases, seed and fertiliser, what a buyer pays, local rules, machines, greenhouses, two crops a year)', ['Pests and diseases this year', 'Seed and fertiliser supply', 'What a buyer pays', 'Local rules and contracts', 'Your machines', 'Greenhouses', 'More than two crops a year'].every(t => html.includes(t)));
  check('no block on the page says more than four sentences', [...html.matchAll(/<(p|li)[ >][\s\S]*?<\/\1>/g)].every(m => (plain(m[0]).match(/[.!?](\s|$)/g) ?? []).length <= 4)); }
const SET = { settings: { text: 'default', contrast: 'standard', links: 'standard', motion: 'full', listen: 'normal', currency: 'USD' }, units: METRIC, reminders: [], nowLocal: '2026-11-14T10:00', remindState: { notify: 'default', push: { ok: false, reason: 'No push here.', on: false } } };
{ const html = settingsHTML(SET);
  check('Settings is one page: no tab strip and no tabs at all', !html.includes('role="tablist"') && !html.includes('role="tab"') && !/pg-tabs/.test(html));
  check('Settings has its grouped cards: Units, Money, Reading and motion, Reminders', ['Units', 'Money', 'Reading and motion', 'Reminders'].every(t => new RegExp(`<h2 id="st-[a-z]+">${t}</h2>`).test(html)) && (html.match(/class="st-card"/g) ?? []).length === 4);
  check('Units: one row with Metric and US, a line saying it follows the country, and a closed fold with each unit', html.includes('data-quick="metric"') && html.includes('data-quick="imperial"') && html.includes('Follows your country until you change it.') && /<details class="st-fold" id="stEach">/.test(html) && !/<details[^>]*open/.test(html));
  for (const n of ['u:rain', 'u:temp', 'u:area', 'u:yield']) check(`the fold has a picker for ${n}`, html.includes(`data-set="${n}"`));
  check('"All units at once", "One at a time" and "What it looks like" are gone; one live example line is there', !/All units at once|One at a time|What it looks like/.test(html) && /<p class="st-example"[^>]*>25 mm of rain · 20 °C · 10(\.0)? ha<\/p>/.test(html), html.match(/st-example[^<]*<|st-example[^>]*>[^<]*/)?.[0]);
  check('Money: one currency select with 8 options and one line, "Prices are published in US dollars."', (html.match(/<option/g) ?? []).length === 8 && html.includes('Prices are published in US dollars.') && html.includes('id="curSel"'));
  // Motion is now three levels, Full, Less and Still, in place of "Follow my device" and "Always still": a farmer who finds the full motion tiring can keep the quick fades without losing every cue
  check('Reading and motion: five choices and a sample; Motion has Full, Less, Still with their captions', ['text', 'contrast', 'links', 'motion', 'listen'].every(n => html.includes(`data-set="${n}"`)) && html.includes('data-sample') && ['data-val="full"', 'data-val="less"', 'data-val="still"'].every(x => html.includes(x)) && /Full: all animations\. Less: quick fades only\. Still: nothing moves\./.test(html) && !html.includes('motionDevice'));
  check('every choice is the one segmented control (radios in a group); the chosen one is checked', !/<input type="radio"/.test(html) && /aria-checked="true"[^>]*data-set="text" data-val="default"/.test(html) && (html.match(/role="radiogroup"/g) ?? []).length >= 9);
  check('Reminders: calendar and delete all', html.includes('calendar-all') && html.includes('data-erase="reminders"'));
  check('at the foot: the install card and Reset settings as a quiet red text button with one line saying what it does', html.includes('installcard') && /class="btn ghost danger" data-reset-settings/.test(html) && /Puts units, currency, listening/.test(html) && !/btn danger solid/.test(html));
  check('Admin and "Saved on this device" are gone from Settings; backup and restore are not here', !/Admin|Saved on this device|data-backup|data-restore/.test(html)); }
{ const mixed = settingsHTML({ ...SET, units: { ...METRIC, rain: 'in' } }); check('with a mixed choice neither Metric nor US is checked and the page says so', !/aria-checked="true"[^>]*data-quick/.test(mixed) && /You chose some units yourself/.test(mixed)); }
{ check('a device that asks for less motion says so on the page', settingsHTML({ ...SET, deviceStill: true }).includes('Your device asks for less motion, so Crophalo keeps still.')); }
{ const html = settingsHTML({ ...SET, settings: { ...SET.settings, currency: 'EUR' } }); check('with another currency the rate note shows', html.includes('id="fxNote"')); }
{ const text = settingsHTML(SET).replace(/<select[\s\S]*?<\/select>/g, '').replace(/<[^>]+>/g, '\n').split('\n').map(t => t.trim()).filter(Boolean); const long = text.filter(t => (t.match(/[.!?](\s|$)/g) ?? []).length > 4);
  check('no block on the Settings page says more than four sentences', long.length === 0, long); }
{ const html = tabsHTML([{ id: 'a', label: '<b>A</b>' }, { id: 'b', label: 'B' }], 'a', 'x"y'); check('tab labels are escaped', !html.includes('<b>A</b>') && html.includes('x&quot;y')); }

// ---- the service status page: read-only, open to everyone, one card for each service
{ const raw = [{ id: 'smaproot', name: 'NASA SMAP soil moisture', state: 'answering', last_ok_time: '2026-11-14T10:05:00Z', last_ms: 2300, last_problem: null, kept: 4, ttl_hours: 6, needs_key: false, key_set: false, needs_login: true, login_set: true, checked_at: '2026-11-14T10:06:00Z', can_check: true },
    { id: 'nass', name: '<b>USDA NASS</b>', state: 'not_answering', last_ok_time: null, last_ms: -5, last_problem: 'timed out <img src=x onerror=alert(1)>', kept: 'x', ttl_hours: 0, needs_key: true, key_set: false },
    { id: 'meteo', name: 'Open-Meteo', state: 'slow', last_ok_time: '2026-11-14T09:00:00Z', last_ms: 9100, kept: 0, ttl_hours: null }, { id: 'ghost', name: 'Ghost', state: 'odd', needs_key: true, key_set: 'sk-secret-value' }, null, { name: 'no id' }, 7];
  const rows = cleanSources(raw); same('the list is rebuilt from known parts: only rows with an id', rows.map(r => r.id), ['smaproot', 'nass', 'meteo', 'ghost']);
  same('a good row', [rows[0].state, rows[0].lastOk, rows[0].ms, rows[0].kept, rows[0].ttlHours, rows[0].problem, rows[0].loginSet], ['answering', '2026-11-14T10:05:00Z', 2300, 4, 6, '', true]);
  same('a bad row has no time, no count; a state the server never sends is worked out; a key is only true, false or unknown, never a value', [rows[1].ms, rows[1].kept, rows[1].ttlHours, rows[3].state, rows[3].keySet], [null, 0, null, 'not_asked_yet', null]);
  const html = adminHTML(rows, { now: Date.parse('2026-11-14T12:00:00Z') });
  check('one card for each service, with its state in a word and a shape; "Needs a key: not set"; markup from the server is plain text', (html.match(/class="ad-card"/g) ?? []).length === 4 && /Answering/.test(html) && /Not answering/.test(html) && /Slow/.test(html) && html.includes('Needs a key: not set') && !html.includes('<b>USDA') && !html.includes('<img') && html.includes('class="ad-dot ok"') && html.includes('class="ad-dot idle"'));
  check('no key, password or file path can reach the page: nothing but "set" or "not set" is said of a key', !/sk-secret|password|\/Users\/|netrc/i.test(html) && /Needs a login: set/.test(html));
  check('the page says how many answer and has one Check again button for the whole page', /1 of 4 answering, 1 slow, 1 not answering\./.test(html) && (html.match(/id="adCheck"/g) ?? []).length === 1 && />Check again</.test(html));
  check('while the check runs the button shows the loading sign and is off; the failed state offers Try again', /aria-busy="true" disabled/.test(adminHTML(rows, { busy: true })) && /dot busy/.test(adminHTML(rows, { busy: true })) && adminHTML(null).includes(ADMIN_DOWN) && />Try again</.test(adminHTML(null)));
  check('loading and empty states', adminHTML(undefined).includes('Reading') && adminHTML([]).includes('no services'));
  const old = cleanSources([{ id: 'imergrain', name: 'GPM IMERG', last_ok_time: '2026-11-14T10:05:00Z', last_ms: 800, last_error: null, cache_items: 2, ttl_hours: 6 }, { id: 'x', name: 'X', last_error: 'down' }]);
  same('the older, shorter answer still gives cards: answering, and not answering', old.map(r => [r.state, r.kept]), [['answering', 2], ['not_answering', 0]]);
  // The copy's own server still sends this older answer (scripts/serve.mjs sources()): the page must say so in one line and still show no program word, no path and no key.
  { const served = cleanSources([{ id: 'power', name: 'NASA POWER daily weather', last_ok_time: '2026-11-14T10:05:00Z', last_ms: 900, last_error: null, cache_items: 3, last_time: '2026-11-14T10:05:00Z', ttl_hours: 24, in_flight: 0 },
      { id: 'smaproot', name: 'NASA SMAP soil moisture', last_ok_time: null, last_ms: null, last_error: 'Error: spawn /Users/someone/.venv/bin/python ENOENT', cache_items: 0, last_time: null, ttl_hours: 6, in_flight: 0 },
      { id: 'nass', name: 'USDA NASS', last_ok_time: null, last_ms: 120, last_error: 'HTTP 401 from https://quickstats.example/api?key=ABCD1234EFGH5678IJKL9012MNOP', cache_items: 0, ttl_hours: 24 },
      { id: 'meteo', name: 'Open-Meteo', last_ok_time: null, last_ms: null, last_error: 'TypeError: fetch failed (ETIMEDOUT)', cache_items: 0, ttl_hours: 1 }]);
    const page = adminHTML(served, { now: Date.parse('2026-11-14T12:00:00Z') }), seen = page.replace(/<[^>]+>/g, ' ');
    check('the older answer: one plain line says the list is shorter, once', (page.match(new RegExp(OLDER_SHAPE.replace(/[.]/g, '\\.'), 'g')) ?? []).length === 1);
    check('the older answer: a card for each, with its state; no "undefined", no "null", no NaN, no table', (page.match(/class="ad-card"/g) ?? []).length === 4 && !/undefined|null|NaN/.test(seen) && !/<table/.test(page) && /1 of 4 answering, 3 not answering\./.test(page));
    check('the older answer: each error is said in plain words, never as program words', ['It gave an error the last time it was asked.', 'It refused the request. Its key or login may be missing.', 'It took too long to answer.'].every(t => page.includes(t)) && !/ENOENT|ETIMEDOUT|TypeError|Error:|spawn|HTTP 401/.test(seen));
    check('the older answer: no folder path, no address query and no key value reach the page', !/\/Users\/|\.venv|key=|ABCD1234/.test(page));
    check('the newer answer says nothing about a shorter list', !adminHTML(rows).includes(OLDER_SHAPE));
    const leaky = cleanSources([{ id: 'x', name: 'X', state: 'not_answering', last_problem: 'Could not read /home/crophalo/.netrc for https://a.example/p?token=1234567890abcdefghijklmnop' }])[0].problem;
    check('a newer answer\'s problem line loses any folder path, address query or key-like text too', !/\/home\/|netrc|token=|1234567890abc/.test(leaky), leaky); }
  same('a refusal is null', [cleanSources({}), cleanSources(null), cleanSources('x')], [null, null, null]);
  same('times in words (a time of day when it was today, a date when not) and the line for a card', [msWords(450), msWords(2300), msWords(null), whenWords(''), whenWords('2026-11-14T10:05:00', Date.parse('2026-11-14T12:00:00')), whenWords('2026-11-12T10:05:00', Date.parse('2026-11-14T12:00:00')), lastLine({ ...rows[0], lastOk: '2026-11-14T10:05:00' }, Date.parse('2026-11-14T12:00:00'))], ['450 ms', '2.3 s', 'Not yet', 'Not yet', '10:05', '12 Nov, 10:05', 'Last answered 10:05, in 2.3 s']);
  same('the routes are asked, and a failure is null', [(await loadSources(async () => ({ json: async () => raw }))).length, await loadSources(async () => { throw new Error('x'); }), (await checkSources(async (u, o) => ({ json: async () => (u === '/api/sources/check' && o.method === 'POST' ? raw : []) }))).length, await checkSources(async () => { throw new Error('x'); })], [4, null, 4, null]); }

// every outside host the code loads data or pictures from has a Privacy row, and the old Esri row is gone (the one file that still names Esri is the home page's picture, which the home redesign replaces)
{
  const code = fs.readdirSync(new URL('../js/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => [f, fs.readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8')]);
  const loads = [['power.larc.nasa.gov', 'NASA POWER'], ['open-meteo.com', 'Open-Meteo'], ['gibs.earthdata.nasa.gov', 'NASA map pictures'], ['nominatim.openstreetmap.org', 'Nominatim'], ['frankfurter', 'Frankfurter'], ['elevation-tiles-prod.s3.amazonaws.com', 'Height tiles'], ['rest.isric.org', 'SoilGrids']];   // the last two: the setup map's land layers ask them from the browser
  for (const [host, row] of loads) if (code.some(([, t]) => t.includes(host))) check(`the code loads from ${host}, so Privacy has a row for ${row}`, SENT.some(r => r.service.includes(row)));
  // The Esri row stays exactly while a file still asks Esri: the home's pictures and the My farm map do until the home redesign and the My farm step replace them.
  const asksEsri = code.some(([, t]) => /arcgisonline/.test(t));
  check('Privacy has an Esri row exactly while the code still asks Esri for pictures', SENT.some(r => /Esri/i.test(r.service)) === asksEsri);
  check('Esri is asked in the code only by the home page picture and the My farm map (both still to be replaced)', code.filter(([f, t]) => /arcgisonline/.test(t)).every(([f]) => f === 'home.js' || f === 'farm.js'), code.filter(([, t]) => /arcgisonline/.test(t)).map(([f]) => f).join());
  // The newer map pieces give the region card its picture through js/nasabase.js (NASA's HLS 30 m on the newest clear day, else MODIS 250 m), with the credit under it.
  check('the region card\'s picture comes from NASA GIBS and says so', /import \{ stillFor \} from '\.\/nasabase\.js'/.test(code.find(([f]) => f === 'region.js')[1]) && /still\.credit/.test(code.find(([f]) => f === 'region.js')[1]) && /gibs\.earthdata\.nasa\.gov/.test(code.find(([f]) => f === 'nasabase.js')[1]) && /CREDIT = 'Imagery: NASA GIBS/.test(code.find(([f]) => f === 'nasabase.js')[1]));
  const moving = fs.readFileSync(new URL('../MOVING.md', import.meta.url), 'utf8');
  check('the moving guide does not promise that saved fields come back by themselves, and points to the backup file', !/(?<!not )come back by themselves|saved fields come along|writes a copy of your saved fields/i.test(moving) && /backup file/i.test(moving) && /Settings/.test(moving));
  check('the welcome sheet makes no claim about crops near you; the limit (Canada and the United States) is on the Limitations page', !/Crops that grow near you|checked against what farms near you/i.test(code.find(([f]) => f === 'welcome.js')[1]) && /Canada and the United States/.test(limitsHTML()));
  check('the Settings sample line does not say it reads the report aloud', !/reads your report aloud/.test(code.find(([f]) => f === 'pages-view.js')[1]));
}
console.log(`pages: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
