// Crophalo's last report tab, "Notes and to-do": the farmer's own to-do list for the field, what they noticed this season, and notes on the field. Everything is kept on this device (keys that start "crophalo."), goes in the backup file and goes with Privacy's delete.
// A note leaves the device only when the farmer ticks it in Share or print. notesInnerHTML() is pure markup; mountNotes() draws it into a node, listens and keeps the keyboard where it was.
// Checked by scripts/test_notes.mjs (the markup, every state) and scripts/e2e_notes.mjs (add, tick, delete and undo in a real browser, kept after a reload, 320 to 1280, axe).
import { esc } from './words.js';
import { cleanNotes, readNotes, writeNotes, newNoteId, PROMPT, TEXT_MAX, noticeDue, recordWords } from './notice.js';
import { readTodo, writeTodo, addItem, toggleItem, removeItem, restoreItem, counts, TEXT_MAX as TODO_MAX } from './todo.js';
import { toast } from './toast.js';

export const fieldKey = loc => (Number.isFinite(loc?.lat) && Number.isFinite(loc?.lon) ? `${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}` : '');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayText = d => (/^\d{4}-\d{2}-\d{2}$/.test(d ?? '') ? `${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '');
export const WORDS = Object.freeze({
  title: 'Notes and to-do', lead: 'Your own list, your own notes. They stay on this device. Nothing here leaves it unless you tick it in Share or print.',
  todo: 'To-do list', todoLabel: 'What needs doing?', todoAdd: 'Add to the list', todoNone: 'Nothing on the list yet. Add the first job.', todoCount: (o, d) => `${o} to do${d ? `, ${d} done` : ''}`,
  notice: PROMPT.title, noticeLead: PROMPT.lead, noticeSave: 'Save as my record', noticeNone: 'No record yet.', due: crop => `${crop ? `The ${crop} season has ended.` : 'The season has ended.'} What did you notice?`,
  notes: 'My notes on this field', notesLead: 'Write what you see. Notes stay on this device.', notesSave: 'Save note', notesNone: 'No notes yet.', del: 'Delete',
  hint: PROMPT.hint ?? 'e.g. The low corner stayed wet.', noteHint: 'e.g. Weeds coming back in the low corner. Ground still wet two days after rain.',
  needText: 'Write something first.', saved: 'Saved on this device.', deleted: 'Deleted', savedRecord: 'Saved on this device as your record.', full: 'This device is out of room, so this could not be saved.',
});
const noteLi = (n, kind) => `<li class="nt-item" data-note="${esc(n.id)}"><div><b>${esc(kind === 'notice' ? `Your record · ${MON[+n.date.slice(5, 7) - 1]} ${n.date.slice(0, 4)}${n.crop ? ` · ${n.crop}` : ''}` : dayText(n.date))}</b><p>${esc(n.text)}${n.photo && !n.text ? 'A photo' : ''}</p></div><button type="button" class="btn sm" data-nt="del-note" data-id="${esc(n.id)}" aria-label="${esc(`Delete the note from ${dayText(n.date)}`)}">${WORDS.del}</button></li>`;
// m: { fieldId, notes, todo, due, crop, today, extra (markup for a section placed first, such as reminders) }
export function notesInnerHTML(m) {
  const notes = cleanNotes(m.notes).filter(n => !m.fieldId || n.fieldId === m.fieldId || !n.fieldId), notices = notes.filter(n => n.kind === 'notice'), free = notes.filter(n => n.kind !== 'notice');
  const sorted = list => [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), c = counts(m.todo), items = m.todo.filter(i => !m.fieldId || i.fieldId === m.fieldId || !i.fieldId);
  return `<p class="lead">${esc(WORDS.lead)}</p><p class="cap nt-status" id="ntStatus" role="status" aria-live="polite"></p>${m.extra ?? ''}
  <section class="nt-sec" aria-labelledby="ntTodo"><h3 id="ntTodo">${WORDS.todo}</h3>
    <form class="nt-form" id="todoForm" autocomplete="off"><label class="field"><span>${WORDS.todoLabel}</span><input type="text" id="todoText" maxlength="${TODO_MAX}" enterkeyhint="done"></label><button type="submit" class="btn">${WORDS.todoAdd}</button></form>
    ${items.length ? `<p class="cap">${esc(WORDS.todoCount(items.filter(i => !i.done).length, items.filter(i => i.done).length))}</p><ul class="nt-list" id="todoList">${items.map(i => `<li class="nt-item${i.done ? ' is-done' : ''}"><label class="nt-check"><input type="checkbox" data-nt="tick" data-id="${esc(i.id)}"${i.done ? ' checked' : ''}><span>${esc(i.text)}</span></label><button type="button" class="btn sm" data-nt="del-todo" data-id="${esc(i.id)}" aria-label="${esc(`Delete: ${i.text}`)}">${WORDS.del}</button></li>`).join('')}</ul>` : `<p class="cap">${WORDS.todoNone}</p>`}</section>
  <section class="nt-sec" aria-labelledby="ntNotice"><h3 id="ntNotice">${WORDS.notice}</h3>${m.due ? `<p class="nt-due" role="note"><b>${esc(WORDS.due(m.crop))}</b></p>` : ''}<p class="cap">${esc(WORDS.noticeLead)}</p>
    <form class="nt-form" id="noticeForm"><label class="field"><span>${WORDS.notice}</span><textarea id="noticeText" rows="2" maxlength="${TEXT_MAX}" placeholder="${esc(WORDS.hint)}"></textarea></label><button type="submit" class="btn">${WORDS.noticeSave}</button></form>
    ${notices.length ? `<ul class="nt-list">${sorted(notices).map(n => noteLi(n, 'notice')).join('')}</ul>` : `<p class="cap">${WORDS.noticeNone}</p>`}</section>
  <section class="nt-sec" aria-labelledby="ntNotes"><h3 id="ntNotes">${WORDS.notes}</h3><p class="cap">${WORDS.notesLead}</p>
    <form class="nt-form" id="noteForm"><label class="field"><span>${WORDS.notes}</span><textarea id="noteText" rows="3" maxlength="${TEXT_MAX}" placeholder="${esc(WORDS.noteHint)}"></textarea></label><button type="submit" class="btn">${WORDS.notesSave}</button></form>
    ${free.length ? `<ul class="nt-list" id="noteList">${sorted(free).map(n => noteLi(n, 'free')).join('')}</ul>` : `<p class="cap">${WORDS.notesNone}</p>`}</section>`;
}
// ctx: { loc, today(), crop, seasonEnd, extra() => markup, afterDraw(node), storage }
export function mountNotes(node, ctx) {
  const store = () => ctx.storage ?? globalThis.localStorage, fid = () => fieldKey(ctx.loc), today = () => (typeof ctx.today === 'function' ? ctx.today() : ctx.today);
  const model = () => { const notes = readNotes(store()); return { fieldId: fid(), notes, todo: readTodo(store()), due: noticeDue({ seasonEnd: ctx.seasonEnd, today: today(), notes, fieldId: fid() }), crop: ctx.crop, today: today(), extra: ctx.extra ? ctx.extra() : '' }; };
  const say = text => { const s = node.querySelector('#ntStatus'); if (s) { s.textContent = ''; setTimeout(() => { s.textContent = text; }, 30); } };
  const draw = focus => { node.innerHTML = notesInnerHTML(model()); ctx.afterDraw?.(node); if (focus) node.querySelector(focus)?.focus(); };
  const keep = (ok, ...fail) => { if (!ok) toast(WORDS.full); return ok; };
  node.addEventListener('submit', event => {
    event.preventDefault(); const id = event.target.id;
    if (id === 'todoForm') { const r = addItem(readTodo(store()), { text: node.querySelector('#todoText').value, fieldId: fid() }, today()); if (!r.ok) { say(r.message); return void node.querySelector('#todoText').focus(); } if (!keep(writeTodo(r.list, store()))) return; draw('#todoText'); say(r.same ? 'That job is already on the list.' : 'Added to the list.'); }
    else if (id === 'noticeForm' || id === 'noteForm') {
      const box = node.querySelector(id === 'noticeForm' ? '#noticeText' : '#noteText'), text = box.value.trim(); if (!text) { say(WORDS.needText); return void box.focus(); }
      const now = readNotes(store()), note = { id: newNoteId(), date: today(), text, photo: false, kind: id === 'noticeForm' ? 'notice' : 'free', fieldId: fid(), crop: ctx.crop ?? '' };
      if (!keep(writeNotes([note, ...now], store()))) return; draw(id === 'noticeForm' ? '#noticeText' : '#noteText'); say(id === 'noticeForm' ? WORDS.savedRecord : WORDS.saved);
    }
  });
  node.addEventListener('change', event => { const t = event.target; if (t.dataset?.nt === 'tick') { keep(writeTodo(toggleItem(readTodo(store()), t.dataset.id, today()), store())); const id = t.dataset.id; draw(`[data-nt=tick][data-id="${CSS.escape(id)}"]`); } });
  node.addEventListener('click', event => {
    const b = event.target.closest('[data-nt]'); if (!b) return; const act = b.dataset.nt, id = b.dataset.id;
    if (act === 'del-todo') { const list = readTodo(store()), at = list.findIndex(i => i.id === id), item = list[at]; if (!item) return; writeTodo(removeItem(list, id), store()); draw('#todoText'); say(WORDS.deleted); toast(WORDS.deleted, { action: 'Undo', onAction: () => { writeTodo(restoreItem(readTodo(store()), item, at), store()); draw(`[data-nt=tick][data-id="${CSS.escape(id)}"]`); } }); }
    if (act === 'del-note') { const list = readNotes(store()), at = list.findIndex(n => n.id === id), item = list[at]; if (!item) return; writeNotes(list.filter(n => n.id !== id), store()); draw(item.kind === 'notice' ? '#noticeText' : '#noteText'); say(WORDS.deleted); toast(WORDS.deleted, { action: 'Undo', onAction: () => { const cur = readNotes(store()); cur.splice(Math.min(at, cur.length), 0, item); writeNotes(cur, store()); draw(item.kind === 'notice' ? '#noticeText' : '#noteText'); } }); }
  });
  draw();
  return { redraw: draw };
}
