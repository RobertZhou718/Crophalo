// Crophalo's reminders: the small records a farmer keeps on this device, the calendar file (.ics) they can be written to, the messages and
// notifications shown while Crophalo is open, and the calls that turn push on and off for when it is closed. Only push sends anything out, and
// then only a reminder's name and time. The screens (the dialog, the list, the Settings panel) are functions that take a page node.
// Checked by scripts/test_remind.mjs (the cleaner, the limits, duplicates, due logic, the calendar file against hand-checked text and back, the push payload, the push calls).
/*
 * Pure: everything down to "the push calls". Those and the screens take the page's parts (storage, navigator, fetch) as arguments, so a test can stand in for them.
 */
import { esc } from './words.js';
import { isDay, addDays, dayWords, IMPORTANT_KINDS } from './remind-plan.js';
import { apiUrl } from './api.js';

export const KEY = 'crophalo.remind.v1', MAX_REMINDERS = 200, TITLE_MAX = 80, NOTE_MAX = 300;
export const KINDS = Object.freeze(['sow', 'harvest', 'soil', 'frost', 'heat', 'rain', 'wind', 'storm', 'scout', 'job', 'forecast', 'flower-check', 'cover-by', 'second-sow', 'other']);
export const SOURCES = Object.freeze(['plan', 'forecast', 'rewind', 'farmer']);
export const SOURCE_WORDS = Object.freeze({ plan: 'From your plan', forecast: 'From the forecast', rewind: 'From your season review', farmer: 'Set by you' });
const own = (o, k) => Object.hasOwn(o, k);
const text = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '';
const noteText = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n) : '';
const validZone = z => { try { return typeof z === 'string' && z.length <= 64 && !!new Intl.DateTimeFormat('en', { timeZone: z }); } catch { return false; } };

// ---- one reminder, and the whole store
export const newId = (now = Date.now(), random = Math.random) => 'r' + now.toString(36) + Array.from({ length: 6 }, () => Math.floor(random() * 36).toString(36)).join('');
const WHEN = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/;
const YEAR_FIRST = 2000, YEAR_LAST = 2100;   // the years a reminder may fall in, here and in the date field
export function cleanWhen(value) {   // 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' between 2000 and 2100, or ''
  const m = WHEN.exec(String(value ?? ''));
  if (!m || !isDay(m[1]) || +m[1].slice(0, 4) < YEAR_FIRST || +m[1].slice(0, 4) > YEAR_LAST) return '';
  if (m[2] === undefined) return m[1];
  return +m[2] <= 23 && +m[3] <= 59 ? `${m[1]}T${m[2]}:${m[3]}` : '';
}
export function cleanReminder(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.id !== 'string' || !/^r[a-z0-9]{6,30}$/.test(raw.id)) return null;
  const get = k => own(raw, k) ? raw[k] : undefined, when = cleanWhen(get('when')), title = text(get('title'), TITLE_MAX);
  if (!when || !title) return null;
  const field = typeof get('fieldId') === 'string' && /^(-?\d{1,2}\.\d{4},-?\d{1,3}\.\d{4}|[A-Za-z0-9_-]{1,40})$/.test(raw.fieldId) ? raw.fieldId : '';   // a field of the report (its place) or a field of My farm (its own id)
  const out = { id: raw.id, title, when, repeat: get('repeat') === 'yearly' ? 'yearly' : 'none', kind: KINDS.includes(get('kind')) ? raw.kind : 'other', source: SOURCES.includes(get('source')) ? raw.source : 'farmer',
    note: noteText(get('note'), NOTE_MAX), farmId: text(get('farmId'), 60), fieldId: field, done: get('done') === true, doneAt: /^\d{4}-\d{2}-\d{2}/.test(String(get('doneAt'))) ? String(raw.doneAt).slice(0, 30) : '',
    seen: typeof get('seen') === 'string' ? raw.seen.slice(0, 16) : '', notify: get('notify') !== false, push: get('push') === true, made: Number.isFinite(get('made')) ? raw.made : 0 };
  if (validZone(get('tz'))) out.tz = raw.tz;
  return out;
}
// A stored value rebuilt from known parts only: bad ids, days and empty titles are dropped, a repeated id keeps its first, 200 at most.
export function cleanStore(raw) {
  const seen = new Set(), out = [];
  for (const item of Array.isArray(raw) ? raw : []) { const r = cleanReminder(item); if (r && !seen.has(r.id)) { seen.add(r.id); out.push(r); } if (out.length >= MAX_REMINDERS) break; }
  return out;
}
export const dupKey = r => [r.title.toLowerCase(), r.when.slice(0, 10), r.fieldId, r.repeat, r.farmId].join('|');

export const ERRORS = Object.freeze({ title: 'Write what the reminder is for.', day: 'Pick a day.', badDay: 'That day does not look right. Pick it again.', past: 'That time has already passed. Pick a day from today on.',
  full: 'You have 200 reminders already. Delete some to add more.', space: 'This device is out of room, so the reminder could not be saved.' });
// A draft from the dialog, checked: { ok, error } or { ok, reminder }. nowLocal is the field's own wall-clock now, 'YYYY-MM-DDTHH:MM'.
export function checkDraft(draft, nowLocal, count = 0) {
  if (!text(draft?.title, TITLE_MAX)) return { ok: false, error: ERRORS.title, field: 'title' };
  if (!draft.day) return { ok: false, error: ERRORS.day, field: 'day' };
  const when = cleanWhen(draft.time ? `${draft.day}T${draft.time}` : draft.day);
  if (!when) return { ok: false, error: ERRORS.badDay, field: 'day' };
  if (when.length === 10 ? when < nowLocal.slice(0, 10) : when < nowLocal) return { ok: false, error: ERRORS.past, field: 'day' };
  if (count >= MAX_REMINDERS) return { ok: false, error: ERRORS.full };
  return { ok: true, when };
}
// Add a draft to a list: the same title, day, field, repeat and farm twice makes one. Returns { ok, list, reminder, duplicate } or { ok: false, error }.
export function addReminder(list, draft, { nowLocal, now = Date.now(), id = newId(now), tz } = {}) {
  const checked = checkDraft(draft, nowLocal, list.length);
  if (!checked.ok) return checked;
  const made = cleanReminder({ id, title: draft.title, when: checked.when, repeat: draft.repeat, kind: draft.kind, source: draft.source, note: draft.note, farmId: draft.farmId, fieldId: draft.fieldId,
    notify: draft.notify !== false, push: draft.push === true, made: now, tz });
  const twin = list.find(r => dupKey(r) === dupKey(made));
  if (twin) return { ok: true, list, reminder: twin, duplicate: true };
  return { ok: true, list: [...list, made], reminder: made, duplicate: false };
}

// ---- when a reminder falls
const pad = n => String(n).padStart(2, '0');
const leap = y => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const startOf = (when, time) => when.length === 10 ? `${when}T08:00` : when;   // a whole day starts at 08:00
// The occurrence of a reminder for a year: a yearly one on 29 February falls on the 28th in other years.
export function inYear(r, year) {
  const [, m, d] = r.when.slice(0, 10).split('-'), day = m === '02' && d === '29' && !leap(year) ? '28' : d;
  return `${year}-${m}-${day}${r.when.length > 10 ? r.when.slice(10) : 'T08:00'}`;
}
// The occurrence that counts now, 'YYYY-MM-DDTHH:MM': a one-off's own time; a yearly one's latest begun occurrence, else its next.
export function occurrence(r, nowLocal) {
  if (r.repeat !== 'yearly') return startOf(r.when);
  const y = +nowLocal.slice(0, 4), here = inYear(r, y);
  if (here <= nowLocal) return here;
  const before = inYear(r, y - 1);
  return before >= startOf(r.when) && !isDoneFor(r, before) ? before : here;
}
export const isDoneFor = (r, occ) => r.repeat === 'yearly' ? !!r.doneAt && r.doneAt.slice(0, 10) >= occ.slice(0, 10) : r.done;   // a yearly one is done for the occurrence it was ticked on or after
export const isDue = (r, nowLocal) => { const occ = occurrence(r, nowLocal); return occ <= nowLocal && !isDoneFor(r, occ); };
// The reminders to announce now, each once: begun, not done, not announced for this occurrence.
export function toAnnounce(list, nowLocal) { return list.map(r => ({ r, occ: occurrence(r, nowLocal) })).filter(({ r, occ }) => occ <= nowLocal && !isDoneFor(r, occ) && r.notify && r.seen !== occ); }
export const markSeen = (list, id, occ) => list.map(r => r.id === id ? { ...r, seen: occ } : r);
export function markDone(list, id, nowLocal) { return list.map(r => r.id !== id ? r : r.repeat === 'yearly' ? { ...r, doneAt: nowLocal } : { ...r, done: true, doneAt: nowLocal }); }
export function snooze(list, id, days) {   // a one-off moves 1 to 365 days, keeping its time; a yearly one cannot
  const n = Math.round(days);
  if (!(n >= 1 && n <= 365)) return list;
  return list.map(r => r.id !== id || r.repeat === 'yearly' ? r : { ...r, when: addDays(r.when.slice(0, 10), n) + r.when.slice(10), seen: '' });
}
export function groups(list, nowLocal) {
  const today = nowLocal.slice(0, 10), week = addDays(today, 7), month = today.slice(0, 7), out = { due: [], week: [], month: [], later: [], done: [] };
  for (const r of [...list].sort((a, b) => occurrence(a, nowLocal) < occurrence(b, nowLocal) ? -1 : 1)) {
    const occ = occurrence(r, nowLocal);
    if (isDoneFor(r, occ)) out.done.push(r); else if (occ <= nowLocal) out.due.push(r); else if (occ.slice(0, 10) <= week) out.week.push(r); else if (occ.slice(0, 7) === month) out.month.push(r); else out.later.push(r);
  }
  return out;
}
export const dueMessage = list => list.length === 0 ? '' : list.length === 1 ? `Reminder: ${list[0].title}` : `Reminders: ${list[0].title} and ${list.length - 1} more. They are in Notes & to-do.`;
export const whenWords = r => `${dayWords(r.when.slice(0, 10))}${r.when.length > 10 ? ` at ${r.when.slice(11)}` : ''}`;

// ---- the calendar file (RFC 5545)
const CRLF = '\r\n';
export const icsEscape = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
export function icsFold(line) {   // lines of at most 75 octets, a continuation starts with one space, and no character is cut in two
  const out = []; let cur = '', size = 0;
  for (const ch of line) { const n = new TextEncoder().encode(ch).length, limit = out.length ? 74 : 75; if (size + n > limit) { out.push(cur); cur = ''; size = 0; } cur += ch; size += n; }
  out.push(cur);
  return out.map((l, i) => i ? ' ' + l : l).join(CRLF);
}
const compact = day => day.replace(/-/g, ''), stamp = ms => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');
function plusMinutes(when, minutes) {   // floating local time plus minutes
  const t = Date.parse(when + ':00Z') + minutes * 60e3, d = new Date(t).toISOString();
  return `${d.slice(0, 4)}${d.slice(5, 7)}${d.slice(8, 10)}T${d.slice(11, 13)}${d.slice(14, 16)}00`;
}
function alarm(trigger, words) { return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(words)}`, `TRIGGER:${trigger}`, 'END:VALARM']; }
export function icsEvent(r, now = Date.now()) {
  const timed = r.when.length > 10, lines = ['BEGIN:VEVENT', `UID:${r.id}@crophalo`, `DTSTAMP:${stamp(now)}`];
  if (timed) { lines.push(`DTSTART:${compact(r.when.slice(0, 10))}T${r.when.slice(11, 13)}${r.when.slice(14, 16)}00`, `DTEND:${plusMinutes(r.when, 30)}`); }   // floating: it rings at the same wall-clock time wherever the phone is
  else lines.push(`DTSTART;VALUE=DATE:${compact(r.when)}`, `DTEND;VALUE=DATE:${compact(addDays(r.when, 1))}`);
  lines.push(`SUMMARY:${icsEscape(r.title)}`, `DESCRIPTION:${icsEscape(r.note ? `${r.note}\n` : '')}${icsEscape('A Crophalo reminder.')}`, 'TRANSP:TRANSPARENT');
  if (r.repeat === 'yearly') lines.push('RRULE:FREQ=YEARLY');
  lines.push(...alarm(timed ? 'PT0S' : 'PT8H', r.title));
  if (IMPORTANT_KINDS.includes(r.kind)) lines.push(...alarm(timed ? '-P1D' : '-PT16H', `Tomorrow: ${r.title}`));
  lines.push('END:VEVENT');
  return lines;
}
export function icsFile(list, now = Date.now()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Crophalo//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...list.flatMap(r => icsEvent(r, now)), 'END:VCALENDAR'];
  return lines.map(icsFold).join(CRLF) + CRLF;
}
export const icsName = count => count === 1 ? 'crophalo-reminder.ics' : 'crophalo-reminders.ics';

// ---- notifications while Crophalo is open
export const NOTIFY_WORDS = Object.freeze({ unsupported: 'This browser cannot show notifications.', denied: 'Notifications are blocked for Crophalo in this browser. Allow them in the browser’s site settings, then try again.', default: 'Notifications are not allowed yet.', granted: 'Notifications are on.' });
export const notifyState = (env = globalThis) => env.Notification ? (env.Notification.permission === 'granted' ? 'granted' : env.Notification.permission === 'denied' ? 'denied' : 'default') : 'unsupported';
export async function askNotifications(env = globalThis) { if (!env.Notification) return 'unsupported'; try { const answer = await env.Notification.requestPermission(); return answer === 'granted' ? 'granted' : answer === 'denied' ? 'denied' : 'default'; } catch { return notifyState(env); } }
export async function showDue(item, env = globalThis) {   // through the service worker when there is one, else a plain notification; { title, body }
  const title = item.r.title, body = whenWords(item.r), options = { body, tag: `${item.r.id}|${item.occ}`, icon: 'icons/crophalo-192.png', data: { url: '/' } };
  try { const reg = await env.navigator?.serviceWorker?.getRegistration?.(); if (reg?.showNotification) { await reg.showNotification(title, options); return true; } if (env.Notification) { new env.Notification(title, options); return true; } } catch { /* the toast already told the farmer */ }
  return false;
}
export async function testNotification(env = globalThis) {
  if (notifyState(env) !== 'granted') return { ok: false, message: NOTIFY_WORDS[notifyState(env)] };
  const shown = await showDue({ r: { id: 'rtest0000', title: 'Crophalo test', when: '2026-11-14' }, occ: 'test' }, env).catch(() => false);
  return shown ? { ok: true, message: 'Sent. Look for the notification.' } : { ok: false, message: 'The browser did not show it. Check that notifications are allowed for Crophalo.' };
}

// ---- push, for when Crophalo is closed
export const PUSH_WORDS = Object.freeze({
  browserOnly: 'This only works in a browser.', secure: 'Your browser only allows this on a secure page. It works when Crophalo is opened from this computer (localhost) or from an https address.',
  noPush: 'This browser cannot receive push messages. On an iPhone, add Crophalo to the Home Screen first.', noServer: 'The Crophalo server cannot be reached right now, so push is not available. The other two ways still work.',
  blocked: NOTIFY_WORDS.denied, refused: 'The Crophalo server did not take the subscription. Try again in a moment.', noService: 'Crophalo could not reach your browser’s push service, so reminders will not arrive when Crophalo is closed. The other two ways still work.',
  failed: 'Push could not be turned on here. The other two ways still work.', off: 'Push is off. The server no longer holds your reminders.', sent: 'Only the reminder’s name and time are sent, to the Crophalo server and your browser’s push service.',
  waiting: 'Waiting for your browser…', answerThere: 'Your browser may show its own question: answer it there. This continues by itself.', slow: 'Your browser did not answer. You can turn this on later in Settings > Reminders.',
});
export function pushSupport(env = globalThis) {   // { ok: true } or { ok: false, reason }
  if (!env.navigator || !env.window && !('document' in env)) return { ok: false, reason: PUSH_WORDS.browserOnly };
  if (env.isSecureContext === false) return { ok: false, reason: PUSH_WORDS.secure };
  if (!env.navigator.serviceWorker || !env.PushManager || !env.Notification) return { ok: false, reason: PUSH_WORDS.noPush };
  return { ok: true };
}
const LATE_MS = 6 * 3600e3, MAX_PUSH = 50;
// What is sent: for each reminder with push on and not done, id, title, body (the day in words), the next occurrence as a UTC time and the url "/"; at most 50, soonest first, nothing more than 6 hours late.
// zoneOffset(whenLocal, tz) gives the minutes the field's clock is ahead of UTC at that moment; without it the time is taken as UTC.
export function pushPayload(list, nowLocal, now = Date.now(), zoneOffset = () => 0) {
  const out = [], utc = (occ, tz) => Date.parse(occ + ':00Z') - zoneOffset(occ, tz) * 60e3;
  for (const r of list) {
    if (!r.push) continue;
    const year = +nowLocal.slice(0, 4);
    const tries = r.repeat === 'yearly' ? [inYear(r, year - 1), inYear(r, year), inYear(r, year + 1)].filter(o => o >= `${r.when.slice(0, 10)}T00:00`) : [occurrence(r, nowLocal)];
    const occ = tries.find(o => !isDoneFor(r, o) && utc(o, r.tz) >= now - LATE_MS);   // the first occurrence that is neither done nor more than 6 hours late
    if (!occ) continue;
    const at = utc(occ, r.tz);
    if (Number.isFinite(at)) out.push({ id: r.id, title: r.title, body: whenWords({ ...r, when: occ.slice(0, 10) + (r.when.length > 10 ? occ.slice(10) : '') }), at: new Date(at).toISOString().slice(0, 16) + ':00Z', url: '/' });
  }
  return out.sort((a, b) => a.at < b.at ? -1 : 1).slice(0, MAX_PUSH);
}
const bytes = b64 => { const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '=')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
const sameKey = (a, b) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i]);
const race = (promise, ms) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error('late')), ms))]);
// Turn push on. env: { navigator, fetch, Notification, isSecureContext, window }. Returns { ok, message }.
export async function turnPushOn(env, list, nowLocal, { onWait = () => {} } = {}) {
  const can = pushSupport(env); if (!can.ok) return { ok: false, message: can.reason };
  let permission = notifyState(env);
  if (permission === 'default') { onWait(PUSH_WORDS.waiting); permission = await askNotifications(env); }
  if (permission !== 'granted') return { ok: false, message: permission === 'denied' ? PUSH_WORDS.blocked : PUSH_WORDS.slow };
  let reg; try { reg = await race(env.navigator.serviceWorker.ready, 8000); } catch { return { ok: false, message: PUSH_WORDS.failed }; }
  let key; try { const res = await env.fetch(apiUrl('/api/push/key')); const body = await res.json(); if (!res.ok || !body?.key) throw new Error('no key'); key = bytes(body.key); } catch { return { ok: false, message: PUSH_WORDS.noServer }; }
  let sub;
  try {
    sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options?.applicationServerKey, key)) { await sub.unsubscribe(); sub = null; }   // an old subscription made with another key
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch { return { ok: false, message: PUSH_WORDS.noService }; }
  const sent = await sendList(env, sub, list, nowLocal);
  return sent ? { ok: true, message: PUSH_WORDS.sent } : { ok: false, message: PUSH_WORDS.refused };
}
export async function sendList(env, sub, list, nowLocal, now = Date.now()) {   // the subscription and the reminders; also used after any change
  try { const res = await env.fetch(apiUrl('/api/push/subscribe'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), reminders: pushPayload(list, nowLocal, now) }) }); return res.ok; } catch { return false; }
}
export async function turnPushOff(env) {
  try {
    const reg = await env.navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) { const endpoint = sub.endpoint; await env.fetch(apiUrl('/api/push/unsubscribe'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint }) }).catch(() => {}); await sub.unsubscribe(); }
    return { ok: true, message: PUSH_WORDS.off };
  } catch { return { ok: false, message: PUSH_WORDS.failed }; }
}

// ---- storage (every access in a try; a blocked store is served from memory for the session)
let memory = null;
export function readReminders(storage = globalThis.localStorage) { if (memory) return memory.map(r => ({ ...r })); try { return cleanStore(JSON.parse(storage.getItem(KEY))); } catch { return []; } }
export function writeReminders(list, storage = globalThis.localStorage) {
  const clean = cleanStore(list);
  try { storage.setItem(KEY, JSON.stringify(clean)); memory = null; return true; } catch { memory = clean; return false; }
}
export const forgetMemory = () => { memory = null; };

// ---- the screens: each takes a page node and what it needs, and draws into it; events are left to the caller's delegation on data-act
const bell = '<svg class="ic" aria-hidden="true"><use href="#i-bell"/></svg>';
// The small "Remind me" button, named for a screen reader; its data carries the suggestion.
export const remindButton = (s, { label = 'Remind me' } = {}) => `<button type="button" class="btn sm remind-btn" data-act="remind" aria-haspopup="dialog" aria-label="${esc(`Remind me: ${s.title}`)}" data-title="${esc(s.title)}" data-when="${esc(s.when ?? '')}" data-kind="${esc(s.kind ?? 'other')}" data-source="${esc(s.source ?? 'plan')}" data-note="${esc(s.note ?? '')}" data-hint="${esc(s.hint ?? '')}">${bell}${esc(label)}</button>`;
export function remindDialogHTML(s = {}, { pushNote = '', pushOk = false, today = '' } = {}) {
  const day = (s.when ?? '').slice(0, 10), time = (s.when ?? '').slice(11);
  return `<form method="dialog" class="remind-form" novalidate><div class="sheet-head"><h2 id="remindTitle">Remind me</h2><button type="button" class="btn" data-act="cancel">Cancel</button></div>
    <div class="sheet-body">${s.hint ? `<p class="cap remind-hint">${esc(s.hint)}</p>` : ''}
      <label class="field"><span>What for?</span><input type="text" name="title" maxlength="${TITLE_MAX}" required autocomplete="off" autocapitalize="sentences" enterkeyhint="next" value="${esc(s.title ?? '')}" aria-describedby="remindErr"></label>
      <div class="remind-when"><label class="field"><span>Day</span><input type="date" name="day" min="${YEAR_FIRST}-01-01" max="${YEAR_LAST}-12-31" ${today ? `data-today="${esc(today)}"` : ''} value="${esc(day)}"></label>
        <label class="field"><span>Time (optional)</span><input type="time" name="time" value="${esc(time)}"></label></div>
      <p class="cap">Day and time are the field’s own time. With no time, the reminder is for the whole day.</p>
      <label class="cbrow"><input type="checkbox" class="sr" name="repeat"><i class="cbx" aria-hidden="true"></i><span>Repeat every year</span></label>
      <label class="cbrow"><input type="checkbox" class="sr" name="notify" checked><i class="cbx" aria-hidden="true"></i><span>Tell me when it is due. Crophalo shows a message, and a notification if you allow it, while it is open on this device.</span></label>
      <label class="cbrow"><input type="checkbox" class="sr" name="push" ${pushOk ? '' : 'disabled'}><i class="cbx" aria-hidden="true"></i><span>Also send it to this device when Crophalo is closed (push).<small id="remindPushNote">${esc(pushNote || 'Checking…')}</small></span></label>
      <p class="remind-err" id="remindErr" role="alert"></p>
      <div class="btnrow"><button type="submit" class="btn primary lg" data-act="save">Save reminder</button><button type="button" class="btn lg" data-act="save-calendar">Save and add to my phone’s calendar</button></div></div></form>`;
}
export function remindCardHTML(r, nowLocal) {
  const occ = occurrence(r, nowLocal), done = isDoneFor(r, occ), due = !done && occ <= nowLocal;
  return `<li class="remind-card${done ? ' is-done' : ''}" data-id="${esc(r.id)}"><label class="cbrow"><input type="checkbox" class="sr" data-act="done" aria-label="${esc(`Done: ${r.title}`)}"${done ? ' checked' : ''}><i class="cbx" aria-hidden="true"></i></label>
    <div class="remind-body"><b>${esc(r.title)}</b>${due ? ' <span class="chip warn">Due now</span>' : ''}<p class="cap">${esc(whenWords(r))}${r.repeat === 'yearly' ? ' · every year' : ''} · ${esc(SOURCE_WORDS[r.source].toLowerCase())}</p>${r.note ? `<p class="cap">${esc(r.note)}</p>` : ''}</div>
    <div class="btnrow"><button type="button" class="btn sm" data-act="calendar">Add to calendar</button><button type="button" class="btn sm danger" data-act="delete">Delete</button></div></li>`;
}
export const GROUP_WORDS = Object.freeze({ due: 'Due now', week: 'This week', month: 'This month', later: 'Later', done: 'Done' });
// The Reminders list as the Remind tab and Notes show it: grouped, with the empty state.
export function remindListHTML(list, nowLocal) {
  if (!list.length) return `<div class="remind-empty"><svg class="ic big" aria-hidden="true"><use href="#i-bell"/></svg><p><b>No reminders yet</b></p><p class="cap">Pick one below or make your own.</p><button type="button" class="btn lg" data-act="new">New reminder</button></div>`;
  const g = groups(list, nowLocal);
  return Object.entries(GROUP_WORDS).filter(([k]) => g[k].length).map(([k, label]) => `<section class="remind-group" aria-labelledby="rg-${k}"><h3 id="rg-${k}">${label}${k === 'done' ? ` (${g.done.length})` : ''}</h3><ul class="remind-list">${g[k].map(r => remindCardHTML(r, nowLocal)).join('')}</ul></section>`).join('')
    + `<p class="btnrow"><button type="button" class="btn" data-act="new">New reminder</button><button type="button" class="btn" data-act="calendar-all">Add all to my phone’s calendar</button></p>`;
}
// Settings > Reminders: the three ways and the state of each. state: { notify, push: { ok, reason, on } }
export function settingsRemindersHTML({ notify = 'default', push = { ok: false, reason: '', on: false } } = {}) {
  return `<div class="grp"><p class="grp-cap">Phone calendar</p><ul class="gl"><li class="row"><span>The most reliable: your phone rings at the time, even with no signal.</span><button type="button" class="btn" data-act="calendar-all">Add all to my phone’s calendar</button></li></ul></div>
    <div class="grp"><p class="grp-cap">While Crophalo is open</p><ul class="gl"><li class="row"><span>${esc(NOTIFY_WORDS[notify])}</span>${notify === 'default' ? '<button type="button" class="btn" data-act="allow">Allow notifications</button>' : notify === 'granted' ? '<button type="button" class="btn" data-act="test-notify">Send a test</button>' : ''}</li></ul></div>
    <div class="grp"><p class="grp-cap">When Crophalo is closed (push)</p><ul class="gl"><li class="row"><span>${esc(push.ok ? (push.on ? 'Push is on for this device.' : PUSH_WORDS.sent) : push.reason)}</span>${push.ok ? `<button type="button" class="btn" data-act="${push.on ? 'push-off' : 'push-on'}" aria-pressed="${push.on}">${push.on ? 'Turn push off' : 'Turn push on'}</button>` : ''}</li></ul></div>`;
}
// Draw into a node. Each takes the node first, so Settings and My farm can host them.
export function renderRemindList(node, list, nowLocal) { node.innerHTML = remindListHTML(list, nowLocal); }
export function renderSettingsReminders(node, state) { node.innerHTML = settingsRemindersHTML(state); }
