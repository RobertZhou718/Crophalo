// Crophalo's reminder-screens suite: the jobs a plan suggests a reminder for (no day invented), the buttons that carry them, the timing taken from the plan and the climate record, the api My farm takes for a field's reminders, and the plain-text rule.
// RULE: never loosen a check to make it pass. No network, no page. Run: node scripts/test_remindwire.mjs
import { timingOf, jobsHTML, jobsFor, reminderApi, setCropNamer, nowLocal, WORDS } from '../js/remind-wire.js';
import { readReminders, writeReminders, remindListHTML } from '../js/remind.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
class Store { constructor() { this.m = new Map(); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }

setCropNamer(id => ({ corn: 'Corn', soy: 'Soybeans' })[id] ?? id);
const RESULT = { current: { seasons: [{ crop: 'corn', sow: '2027-05-01', harvest: '2027-10-05' }] } };
same('the timing is the plan\'s first season (as days of the year) and the usual frost days of the record', timingOf(RESULT, { frostLast: 121, frostFirst: 280 }), { crop: 'Corn', sowDoy: 121, harvestDoy: 278, lastSpringFrostDoy: 121, firstAutumnFrostDoy: 280 });
same('a missing or odd frost day is left out, never made up', timingOf(RESULT, { frostLast: NaN, frostFirst: 900 }), { crop: 'Corn', sowDoy: 121, harvestDoy: 278, lastSpringFrostDoy: null, firstAutumnFrostDoy: null });
const jobs = jobsFor({ result: RESULT, climate: { frostLast: 121, frostFirst: 280 }, forecastDays: [], today: '2026-11-15', now: '2026-11-15T09:00' });
check('the jobs: sow, harvest, soil test and the two frost checks, each with a title and a day from the plan', ['Sow corn', 'Harvest corn', 'Get a soil test', 'Check the frost forecast'].every(t => jobs.some(j => j.title === t)) && jobs.filter(j => j.title === 'Check the frost forecast').length === 2 && jobs.every(j => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(j.when)), brief(jobs.map(j => [j.title, j.when])));
check('no day is before tomorrow', jobs.every(j => j.when.slice(0, 10) > '2026-11-15'));
const bare = jobsFor({ result: { current: { seasons: [] } }, climate: null, forecastDays: [], today: '2026-11-15' });
check('with no timing the soil test is still offered but has no day: the farmer picks one', bare.length === 1 && bare[0].title === 'Get a soil test' && bare[0].when === '');
check('a frost forecast gives an evening-before job; one already passed gives none', jobsFor({ result: RESULT, climate: null, forecastDays: [{ date: '2026-11-18', tmin: -3, tmax: 4, rain: 0, wind: 5, code: 1 }], today: '2026-11-15', now: '2026-11-15T09:00' }).some(j => /Frost forecast/.test(j.title) && j.when === '2026-11-17T18:00') && !jobsFor({ result: RESULT, climate: null, forecastDays: [{ date: '2026-11-15', tmin: -3 }], today: '2026-11-15', now: '2026-11-15T20:00' }).some(j => /Frost forecast/.test(j.title)));
const html = jobsHTML(jobs);
check('each job has a named Remind me button carrying its suggestion, and says "pick a day" when it has none', (html.match(/data-act="remind"/g) ?? []).length === jobs.length && /aria-label="Remind me: Sow corn"/.test(html) && /pick a day/.test(jobsHTML(bare)));
check('with no job at all it says so in words', jobsHTML([]).includes(WORDS.noJobs));
check('words that come from outside are plain text in the buttons', !/<img|<script/.test(jobsHTML([{ title: '<img src=x onerror=1>', when: '', kind: 'other', source: 'plan', note: '<script>', hint: '' }])));
// the api My farm takes
{ const s = new Store(), api = reminderApi(s), future = '2099-05-01T08:00';
  same('a field with no reminders has an empty list', api.forField('f1', 'x1'), []);
  const r = api.add({ title: 'Sow corn', when: future, kind: 'sow', farmId: 'f1', fieldId: 'x1' });
  check('add sets a reminder on this device and forField lists it for that field only', r.ok === true && api.forField('f1', 'x1').length === 1 && api.forField('f1', 'x1')[0].title === 'Sow corn' && api.forField('f1', 'x2').length === 0 && readReminders(s).length === 1);
  check('the same reminder twice is one', api.add({ title: 'Sow corn', when: future, kind: 'sow', farmId: 'f1', fieldId: 'x1' }).duplicate === true && readReminders(s).length === 1);
  check('an empty title or a day that has passed is refused with the reason', api.add({ title: '', when: future }).refused === 'Write what the reminder is for.' && /already passed/.test(api.add({ title: 'Old', when: '2001-01-01T08:00' }).refused));
  check('the list the screen draws holds that reminder, due or not, with its buttons', /Sow corn/.test(remindListHTML(readReminders(s), nowLocal())) && /data-act="delete"/.test(remindListHTML(readReminders(s), nowLocal()))); }
check('the local time stamp is year, month, day, hour and minute', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(nowLocal()) && nowLocal(new Date(2026, 10, 5, 7, 4)) === '2026-11-05T07:04');
{ const mem = new Map(), store = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  const api = reminderApi(store), made = api.add({ title: 'Sow wheat', when: '2099-10-01T08:00', farmId: 'f1', fieldId: 'x1' }), id = api.forField('f1', 'x1')[0]?.id;
  check('the api: add then forField gives the reminder', made.ok && !!id);
  check('the api: done marks it done and forField says so', api.done(id).ok && api.forField('f1', 'x1')[0].done === true);
  check('the api: remove deletes it, and a second remove says it is not there', api.remove(id).ok && api.forField('f1', 'x1').length === 0 && api.remove(id).ok === false && /not there/.test(api.remove(id).refused));
  check('the api: done on an unknown id says so and writes nothing', api.done('nope').ok === false && typeof api.openDialog === 'function'); }
console.log(`remindwire: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
