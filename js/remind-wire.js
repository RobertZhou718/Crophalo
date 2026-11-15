// Crophalo's reminder screens: the "Remind me" dialog, the list with its Done, Delete and calendar buttons, the jobs a plan suggests a reminder for (with no day invented: without timing the farmer picks), and the check that tells the farmer a reminder is due while Crophalo is open.
// reminderApi() is the small object My farm takes for a field's reminders (setReminders in js/farm.js). Reminders are kept on this device; only push sends anything out, and then only a reminder's name and time.
// jobsHTML() is pure markup; the rest changes the page. Checked by scripts/test_remindwire.mjs (the markup, the jobs from a plan, the saved reminder, the api for My farm) and scripts/e2e_remind.mjs (the dialog and the list in a real browser).
import { esc } from './words.js';
import { askNotifications, testNotification, NOTIFY_WORDS, readReminders, writeReminders, addReminder, remindDialogHTML, remindListHTML, remindButton, markDone, markSeen, toAnnounce, dueMessage, icsFile, icsName, pushSupport, notifyState, showDue, ERRORS, KEY } from './remind.js';
import { reportJobs, alertJobs, dayWords } from './remind-plan.js';
import { toast } from './toast.js';

export const nowLocal = (d = new Date()) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const WORDS = Object.freeze({ title: 'Reminders', lead: 'Pick a job to be reminded: phone calendar, notifications or push. Choose how in Settings.', jobs: 'Jobs you can set a reminder for', noJobs: 'No job has a day yet. Use New reminder and pick one yourself.', saved: 'Reminder saved on this device.', deleted: 'Reminder deleted', calendar: 'The calendar file was saved.' });
const dayRound = v => (Number.isFinite(v) && v >= 1 && v <= 365 ? Math.round(v) : null);
const doyOf = day => { if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) return null; const t = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8)) - Date.UTC(+day.slice(0, 4), 0, 0), d = Math.round(t / 864e5); return d >= 1 && d <= 366 ? Math.min(365, d) : null; };
// The timing the report gives the plan of reminders: the crop, its sowing and harvest day of the year (from the plan grown now), and the usual frost days of the climate record. Any of them may be missing: then that job has no suggested day.
export function timingOf(result, climate) {
  const s = (result?.current?.seasons ?? [])[0] ?? {};
  return { crop: s.crop ? crop(s.crop) : '', sowDoy: doyOf(s.sow), harvestDoy: doyOf(s.harvest), lastSpringFrostDoy: dayRound(climate?.frostLast), firstAutumnFrostDoy: dayRound(climate?.frostFirst) };
}
let crop = id => String(id);
export const setCropNamer = fn => { if (typeof fn === 'function') crop = fn; };
// The jobs list as markup, each with its Remind me button and its day in words ("about" when it came from the plan).
export function jobsHTML(jobs) {
  if (!jobs.length) return `<p class="cap">${WORDS.noJobs}</p>`;
  return `<ul class="rm-jobs">${jobs.map(j => `<li class="rm-job"><span><b>${esc(j.title)}</b>${j.when ? ` <span class="cap">${esc(dayWords(j.when.slice(0, 10)))}</span>` : ' <span class="cap">pick a day</span>'}</span>${remindButton(j)}</li>`).join('')}</ul>`;
}
export function jobsFor({ result, climate, forecastDays, today, now }) {
  return [...reportJobs(timingOf(result, climate), today), ...alertJobs(Array.isArray(forecastDays) ? forecastDays : [], now ?? `${today}T00:00`)];
}
const saveFile = (doc, text, name) => { const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' }), url = URL.createObjectURL(blob), a = doc.createElement('a'); a.href = url; a.download = name; doc.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); };

// The dialog. s: { title, when, kind, source, note, hint }; ctx: { fieldId, farmId, trigger, onChange }
export function openRemindDialog(s = {}, ctx = {}) {
  const doc = document, dlg = doc.createElement('dialog'); dlg.className = 'sheet remind-dialog'; dlg.setAttribute('aria-labelledby', 'remindTitle');
  const today = nowLocal().slice(0, 10); dlg.innerHTML = remindDialogHTML(s, { today, pushNote: '', pushOk: false }); doc.body.append(dlg);
  const form = dlg.querySelector('form'), err = dlg.querySelector('#remindErr'), close = () => { try { dlg.close(); } catch { /* closed */ } dlg.remove(); ctx.trigger?.focus?.(); };
  const p = pushSupport(); const note = dlg.querySelector('#remindPushNote'), box = dlg.querySelector('[name=push]'); if (note) note.textContent = p.ok ? 'Only the reminder’s name and time go to the push service.' : p.reason; if (p.ok && box) box.disabled = false;
  dlg.addEventListener('cancel', event => { event.preventDefault(); close(); });
  const save = withCalendar => {
    const f = new FormData(form), draft = { title: String(f.get('title') ?? ''), day: String(f.get('day') ?? ''), time: String(f.get('time') ?? ''), repeat: f.get('repeat') ? 'yearly' : 'once', notify: !!f.get('notify'), push: !!f.get('push'), kind: s.kind ?? 'other', source: ctx.source ?? s.source ?? 'farmer', note: s.note ?? '', fieldId: ctx.fieldId ?? '', farmId: ctx.farmId ?? '' };
    const r = addReminder(readReminders(), draft, { nowLocal: nowLocal() });
    if (!r.ok) { err.textContent = r.error; form.querySelector(`[name=${r.field ?? 'title'}]`)?.focus(); return; }
    if (!writeReminders(r.list)) { err.textContent = ERRORS.space; return; }
    if (withCalendar) saveFile(doc, icsFile([r.reminder]), icsName(1));
    close(); toast(r.duplicate ? 'That reminder was already set.' : WORDS.saved); ctx.onChange?.();
  };
  form.addEventListener('submit', event => { event.preventDefault(); save(false); });
  dlg.addEventListener('click', event => { const b = event.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'cancel') close(); if (b.dataset.act === 'save-calendar') { event.preventDefault(); save(true); } });
  dlg.showModal(); form.querySelector('[name=title]')?.focus();
  return { dialog: dlg, close };
}
const dataOf = b => ({ title: b.dataset.title ?? '', when: b.dataset.when ?? '', kind: b.dataset.kind ?? 'other', source: b.dataset.source ?? 'plan', note: b.dataset.note ?? '', hint: b.dataset.hint ?? '' });
// The Reminders section for one field: the list, then the jobs. ctx: { fieldId, farmId, today(), jobs(): [], afterChange() }
export function mountReminders(node, ctx) {
  const mine = list => list.filter(r => !ctx.fieldId || r.fieldId === ctx.fieldId || !r.fieldId);
  const draw = focus => { const now = nowLocal(), list = mine(readReminders());
    node.innerHTML = ctx.bare ? `${remindListHTML(list, now)}<p class="cap" id="rmStatus" role="status" aria-live="polite"></p>` : `<section class="nt-sec" aria-labelledby="rmTitle"><h3 id="rmTitle">${WORDS.title}</h3><p class="cap">${WORDS.lead}</p><div id="rmList">${remindListHTML(list, now)}</div><h4 class="rm-h">${WORDS.jobs}</h4>${jobsHTML(ctx.jobs ? ctx.jobs() : [])}<p class="cap" id="rmStatus" role="status" aria-live="polite"></p></section>`;
    if (focus) node.querySelector(focus)?.focus(); };
  node.addEventListener('click', event => {
    const b = event.target.closest('[data-act]'); if (!b || !node.contains(b)) return; const act = b.dataset.act, card = b.closest('.remind-card'), id = card?.dataset.id;
    if (act === 'remind') return void openRemindDialog(dataOf(b), { fieldId: ctx.fieldId, farmId: ctx.farmId, trigger: b, onChange: () => { draw(`[data-act=remind][data-title="${CSS.escape(b.dataset.title ?? '')}"]`); ctx.afterChange?.(); } });   // the list is drawn again, so the keyboard is put back on the same button
    if (act === 'new') return void openRemindDialog({}, { fieldId: ctx.fieldId, farmId: ctx.farmId, trigger: b, source: 'farmer', onChange: () => { draw('[data-act=new]'); ctx.afterChange?.(); } });
    if (act === 'delete' && id) { const list = readReminders(), at = list.findIndex(r => r.id === id), item = list[at]; if (!item) return; writeReminders(list.filter(r => r.id !== id)); draw('[data-act=new]'); ctx.afterChange?.(); toast(WORDS.deleted, { action: 'Undo', onAction: () => { const cur = readReminders(); cur.splice(Math.min(at, cur.length), 0, item); writeReminders(cur); draw(); ctx.afterChange?.(); } }); }
    if (act === 'calendar' && id) { const r = readReminders().find(x => x.id === id); if (r) { saveFile(document, icsFile([r]), icsName(1)); node.querySelector('#rmStatus').textContent = WORDS.calendar; } }
    if (act === 'calendar-all') { const list = mine(readReminders()).filter(r => !r.done); if (list.length) { saveFile(document, icsFile(list), icsName(list.length)); node.querySelector('#rmStatus').textContent = WORDS.calendar; } }
  });
  node.addEventListener('change', event => { const t = event.target; if (t.dataset?.act !== 'done') return; const id = t.closest('.remind-card')?.dataset.id; if (!id) return; writeReminders(markDone(readReminders(), id, nowLocal())); draw(`.remind-card[data-id="${CSS.escape(id)}"] [data-act=done]`); ctx.afterChange?.(); });
  draw();
  return { redraw: draw };
}
// What My farm takes (setReminders in js/farm.js): the reminders of a field, and a way to set one. add() returns { ok } or { ok: false, refused }.
export function reminderApi(storage = globalThis.localStorage) {
  return {
    forField(farmId, fieldId) { return readReminders(storage).filter(r => r.farmId === farmId && r.fieldId === fieldId).map(r => ({ id: r.id, title: r.title, when: r.when, done: !!r.done })); },
    add({ title, when, kind = 'other', farmId = '', fieldId = '' } = {}) {
      const day = String(when ?? '').slice(0, 10), time = String(when ?? '').slice(11, 16), r = addReminder(readReminders(storage), { title, day, time, kind, source: 'plan', farmId, fieldId, notify: true }, { nowLocal: nowLocal() });
      if (!r.ok) return { ok: false, refused: r.error };
      return writeReminders(r.list, storage) ? { ok: true, duplicate: !!r.duplicate } : { ok: false, refused: ERRORS.space };
    },
    // marks one reminder done (a yearly one is done for this year and stays); answers { ok } or { ok: false, refused }
    done(id) {
      const list = readReminders(storage); if (!list.some(r => r.id === id)) return { ok: false, refused: 'That reminder is not there any more.' };
      return writeReminders(markDone(list, id, nowLocal()), storage) ? { ok: true } : { ok: false, refused: ERRORS.space };
    },
    // removes one reminder for good
    remove(id) {
      const list = readReminders(storage); if (!list.some(r => r.id === id)) return { ok: false, refused: 'That reminder is not there any more.' };
      return writeReminders(list.filter(r => r.id !== id), storage) ? { ok: true } : { ok: false, refused: ERRORS.space };
    },
    // the "New reminder" dialog for one field: { farmId, fieldId, trigger, onChange }
    openDialog({ farmId = '', fieldId = '', trigger = null, onChange = () => {}, title = '' } = {}) { openRemindDialog({ title }, { farmId, fieldId, trigger, source: 'farmer', onChange }); },
  };
}
// Tell the farmer what is due while Crophalo is open: a check 1.5 s after the page loads, every minute and when the tab is shown again; each occurrence once.
let watching = false;
export function startReminderWatch(env = globalThis) {
  if (watching || !env.document) return; watching = true;
  const check = async () => {
    const now = nowLocal(), list = readReminders(), due = toAnnounce(list, now); if (!due.length) return;
    let next = list; for (const x of due) next = markSeen(next, x.r.id, x.occ); writeReminders(next);
    toast(dueMessage(due.map(x => x.r)), { ms: 9000 });
    if (notifyState(env) === 'granted') for (const x of due.slice(0, 3)) await showDue(x, env);
  };
  setTimeout(check, 1500); setInterval(check, 60e3); env.document.addEventListener('visibilitychange', () => { if (env.document.visibilityState === 'visible') check(); });
}
// The Settings > Reminders tab: the list works like the report's, and the three ways (calendar file, notifications while open) have their buttons. Push needs the server's keys and a service worker: its buttons are left to the host.
export function wireSettingsReminders(node, { afterChange = () => {} } = {}) {
  const list = node.querySelector('#remindList'), ways = node.querySelector('#remindWays'); if (list && !list.dataset.wired) { list.dataset.wired = '1'; mountReminders(list, { bare: true, afterChange }); }
  if (ways && !ways.dataset.wired) {
    ways.dataset.wired = '1';
    ways.addEventListener('click', async event => {
      const b = event.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act;
      if (act === 'calendar-all') { const l = readReminders().filter(r => !r.done); if (!l.length) return void toast('No reminders to add yet.'); saveFile(document, icsFile(l), icsName(l.length)); toast(WORDS.calendar); }
      if (act === 'allow') { const a = await askNotifications(); toast(NOTIFY_WORDS[a] ?? 'Done.'); b.closest('.row').querySelector('span').textContent = NOTIFY_WORDS[a] ?? ''; }
      if (act === 'test-notify') { const ok = await testNotification(); toast(ok ? 'A test notification was sent.' : 'The test could not be shown.'); }
    });
  }
}
