// Crophalo's info-pages suite: units and their sample lines, currency notes, backup and restore, the privacy table and deletes, the Limitations page, the Settings and Privacy markup, the read-only Admin panel.
// RULE: never loosen a check here to make it pass. A failure means a farmer sees a wrong unit, loses saved data, or is told something untrue about what leaves the device: fix the project, not the test.
// No internet is needed. Run: node scripts/test_pages.mjs
import { fmtRain, fmtTemp, fmtTempChange, fmtArea, fmtLength, fmtSpeed, fmtYield, cleanUnits, unitsFor, defaultUnits, sampleLines, METRIC, IMPERIAL } from '../js/units.js';
import { cleanRates, fxNote, money, loadRates, readRates, CURRENCIES } from '../js/currency.js';
import { makeBackup, checkBackup, restoreBackup, describeBackup, backupName, NOT_KEPT, MAX_BYTES } from '../js/backup.js';
import { SENT, GROUPS, makeArmer, eraseGroup, eraseEverything, storageCounts, ARM_MS, keptLines } from '../js/privacy.js';
import { privacyHTML, limitsHTML, settingsHTML, SETTINGS_TABS, tabsHTML } from '../js/pages-view.js';
import { cleanSources, adminHTML, loadSources, whenWords, msWords, ADMIN_DOWN } from '../js/admin-view.js';
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
for (const name of ['NASA POWER', 'Crophalo data server', 'Open-Meteo', 'Esri', 'OpenStreetMap', 'Frankfurter', 'push service', 'speech']) check(`the table names ${name}`, services.includes(name));
check('every row says what it gets and why', SENT.every(r => r.gets.length > 10 && r.why.length > 10));
check('the Frankfurter row says it gets nothing about the farmer', SENT.find(r => r.service.includes('Frankfurter')).gets.startsWith('Nothing'));
{ let t = 0; const a = makeArmer(() => t);
  same('first press arms', a.press('saved'), 'armed'); t = 4000; same('a second press within 5 s deletes', a.press('saved'), 'delete'); same('and disarms', a.armed(), null);
  t = 10000; a.press('saved'); t = 10000 + ARM_MS + 1; same('after 5 s it disarms by itself', [a.expire(), a.armed()], ['saved', null]);
  t = 20000; a.press('saved'); t = 20000 + ARM_MS + 1; same('a late second press only arms again', a.press('saved'), 'armed');
  t = 30000; a.press('saved'); same('a different button only arms', a.press('farms'), 'armed'); }
{ const st = new Store({ 'crophalo.saved.v1': SAVED, 'crophalo.notes.v1': NOTES, 'crophalo.record.v1': '[1]', 'crophalo.farms.v1': '[1]', 'crophalo.remind.v1': '[1]', 'crophalo.settings.v1': '{}' });
  let timers = 0, push = 0; const env = { local: st, stopTimers: () => timers++, pushOff: async () => { push++; } };
  await eraseGroup('saved', env); same('saved fields deleted, the rest kept', [st.getItem('crophalo.saved.v1'), st.getItem('crophalo.notes.v1') !== null], [null, true]);
  await eraseGroup('notes', env); same('notes and crop history both', [st.getItem('crophalo.notes.v1'), st.getItem('crophalo.record.v1')], [null, null]);
  await eraseGroup('reminders', env); same('reminders also stop timers and push', [st.getItem('crophalo.remind.v1'), timers, push], [null, 1, 1]);
  check('settings survive a group delete', st.getItem('crophalo.settings.v1') === '{}'); }
{ const local = new Store({ 'crophalo.saved.v1': SAVED, 'crophalo.settings.v1': '{}', 'crophalo.fx.v1': '{}', 'other.app': 'keep' }), session = new Store({ 'crophalo.report': 'x', 'other': 'y' });
  const cacheNames = ['crophalo-v3', 'other-cache']; const caches = { keys: async () => [...cacheNames], delete: async n => { cacheNames.splice(cacheNames.indexOf(n), 1); return true; } };
  let timers = 0, push = 0; const done = await eraseEverything({ local, session, caches, stopTimers: () => timers++, pushOff: async () => { push++; } });
  same('delete everything clears local keys of ours', [...local.m.keys()], ['other.app']); same('and this tab’s session', [...session.m.keys()], ['other']); same('and the saved copy of the app', cacheNames, ['other-cache']);
  same('and stops timers and push together', [timers, push, done.includes('timers'), done.includes('push')], [1, 1, true, true]); }
{ const c = storageCounts(new Store({ 'crophalo.saved.v1': SAVED, 'crophalo.notes.v1': 'broken', 'crophalo.answers.v1': '{"a":1,"b":2}' })); same('counts', [c.saved, c.notes, c.answers, c.farms], [2, 0, 2, 0]); }
same('plural words', keptLines({ saved: 1, farms: 0, notes: 1, record: 2, reminders: 1, answers: 0 }).slice(0, 4), ['1 saved field', '0 farms', '1 note and 2 crop-history entries', '1 reminder']);
check('every group has a label', GROUPS.every(g => g.label && g.id)); check('Everything is one of the choices', GROUPS.some(g => g.id === 'everything'));

// ---- the pages
{ const html = privacyHTML('device', { saved: 2, farms: 1, notes: 0, record: 0, reminders: 0, answers: 0 }); check('Privacy device tab: no account, counts, an empty sign-in slot', html.includes('No account') && html.includes('2 saved fields') && html.includes('data-slot="signin"')); }
{ const html = privacyHTML('sent'); check('Privacy sent tab lists every recipient', SENT.every(r => html.includes(r.service.replace(/&/g, '&amp;').replace(/’/g, '’'))) || SENT.every(r => html.includes(r.service.split(' ')[0]))); check('the table has headers', html.includes('<th scope="col">Service</th>')); }
{ const html = privacyHTML('choices'); check('every delete button is named and labelled for the two-tap', GROUPS.filter(g => !g.again).every(g => html.includes(`data-erase="${g.id}"`))); check('the welcome page is read again, not deleted', html.includes('data-open-welcome')); }
{ const html = limitsHTML(); for (const w of ['Very sure', 'Fairly sure', 'Somewhat sure']) check(`Limitations explains ${w}`, html.includes(w));
  check('Limitations never repeats the old coverage claim', !/14,000|every cell of Canada/i.test(html));
  check('Limitations is one flat page: no tabs', !html.includes('role="tablist"'));
  check('it says weather is a 50 km square', html.includes('50 km')); check('it says you decide', /You decide/.test(html)); }
for (const t of SETTINGS_TABS) { const html = settingsHTML(t.id, { settings: { text: 'default', contrast: 'standard', links: 'standard', motion: 'device', listen: 'normal', currency: 'USD' }, units: METRIC, reminders: [], nowLocal: '2026-11-14T10:00', remindState: { notify: 'default', push: { ok: false, reason: 'No push here.', on: false } } });
  check(`Settings tab ${t.id} has the tab strip with ${SETTINGS_TABS.length} tabs`, (html.match(/role="tab"/g) ?? []).length === SETTINGS_TABS.length);
  check(`Settings tab ${t.id}: one selected tab, the others out of the tab order`, (html.match(/aria-selected="true"/g) ?? []).length === 1 && (html.match(/tabindex="0"/g) ?? []).length >= 1); }
{ const html = settingsHTML('units', { settings: { currency: 'USD' }, units: METRIC }); for (const n of ['u:rain', 'u:temp', 'u:area', 'u:yield']) check(`Units has a picker for ${n}`, html.includes(`data-set="${n}"`)); check('Units has a currency select with 8 options', (html.match(/<option/g) ?? []).length === 8); check('Units has sample lines', html.includes('Yield of corn')); check('Units has a one-tap metric/imperial shortcut', html.includes('data-quick="imperial"')); }
{ const html = settingsHTML('access', { settings: { text: 'large', contrast: 'standard', links: 'standard', motion: 'reduce', listen: 'slow' } }); check('Accessibility: five choices and a sample', ['text', 'contrast', 'links', 'motion', 'listen'].every(n => html.includes(`data-set="${n}"`)) && html.includes('data-sample')); check('Always still is offered', html.includes('Always still')); check('the chosen one is checked', /aria-checked="true"[^>]*data-set="text" data-val="large"/.test(html)); }
{ const html = settingsHTML('stored', {}); check('Saved: backup, restore, install, reset', ['data-backup', 'data-restore', 'installcard', 'data-reset-settings'].every(x => html.includes(x))); check('restore file input is hidden from everyone', html.includes('aria-hidden="true"')); }
{ const html = settingsHTML('remind', { reminders: [], nowLocal: '2026-11-14T10:00', remindState: { notify: 'default', push: { ok: false, reason: 'No push here.', on: false } } }); check('Reminders: calendar, delete all', html.includes('calendar-all') && html.includes('data-erase="reminders"')); }
{ const html = settingsHTML('admin', { sources: undefined }); check('Admin opens directly: no password field, no form, no button that changes anything', !html.includes('type="password"') && !html.includes('<form') && !/data-erase|data-reset|data-restore/.test(html.split('role="tabpanel"')[1] ?? '') && html.includes('Reading the list')); }
{ const html = tabsHTML([{ id: 'a', label: '<b>A</b>' }, { id: 'b', label: 'B' }], 'a', 'x"y'); check('tab labels are escaped', !html.includes('<b>A</b>') && html.includes('x&quot;y')); }

// ---- the Admin panel: read-only, open to everyone
{ const raw = [{ id: 'smaproot', name: 'NASA SMAP soil moisture', last_ok_time: '2026-11-14T10:05:00Z', last_ms: 2300, last_error: null, cache_items: 4, ttl_hours: 6 }, { id: 'imergrain', name: '<b>x</b>', last_ok_time: 'never', last_ms: -5, last_error: 'timeout\u0000 here', cache_items: 'x', ttl_hours: 0 }, null, { name: 'no id' }, 7];
  const rows = cleanSources(raw); same('the server list is rebuilt from known parts: only rows with an id', rows.map(r => r.id), ['smaproot', 'imergrain']);
  same('a good row', [rows[0].lastOk, rows[0].ms, rows[0].kept, rows[0].ttlHours, rows[0].error], ['2026-11-14T10:05:00Z', 2300, 4, 6, '']);
  same('a bad row has no date, no time, no count, no error control characters', [rows[1].lastOk, rows[1].ms, rows[1].kept, rows[1].ttlHours, rows[1].error], ['', null, 0, null, 'timeout  here']);
  const html = adminHTML(rows); check('the table names each service, escapes markup and says "Not yet" for no answer', html.includes('NASA SMAP soil moisture') && !html.includes('<b>x</b>') && html.includes('Not yet') && html.includes('14 Nov 2026, 10:05 UTC'));
  check('it says it is read-only, open, and private-free', /read-only/.test(html) && /nothing private/.test(html));
  check('loading, failed and empty states', adminHTML(undefined).includes('Reading') && adminHTML(null).includes(ADMIN_DOWN) && adminHTML([]).includes('no live services'));
  same('a refusal is null', [cleanSources({}), cleanSources(null), cleanSources('x')], [null, null, null]);
  same('times in words', [msWords(450), msWords(2300), msWords(null), whenWords('')], ['450 ms', '2.3 s', 'Not yet', 'Not yet']);
  same('the route is asked and a failure is null', [(await loadSources(async () => ({ json: async () => raw }))).length, await loadSources(async () => { throw new Error('x'); })], [2, null]); }

console.log(`pages: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
