// Crophalo's notes-and-to-do suite: the to-do list (cleaner, limits, ticking, deleting and bringing back, a hostile stored value), the tab's markup in every state, the record shown beside the plan after 30 days, and that the new key rides in the backup file and goes with Privacy's delete.
// RULE: never loosen a check to make it pass. No network, no page. Run: node scripts/test_notes.mjs
import { cleanItem, cleanTodo, addItem, toggleItem, removeItem, restoreItem, counts, readTodo, writeTodo, KEY, MAX_ITEMS, TEXT_MAX, ERRORS } from '../js/todo.js';
import { notesInnerHTML, fieldKey, WORDS } from '../js/notes-view.js';
import { cleanNote, pickRecord, recordWords, noticeDue, newNoteId } from '../js/notice.js';
import { makeBackup, restoreBackup, checkBackup, isKept } from '../js/backup.js';
import { GROUPS, eraseGroup, storageCounts } from '../js/privacy.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
class Store { constructor(o = {}) { this.m = new Map(Object.entries(o)); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }

const T = '2026-11-15', FID = '43.1300,-80.7500';
// the to-do list
same('the key is a Crophalo key that is kept', [KEY, isKept(KEY)], ['crophalo.todo.v1', true]);
check('a job needs words, an id and a real day; control characters become spaces; it is cut to its limit', cleanItem({ id: 'abcd', text: '  Buy\tseed  ', date: T }).text === 'Buy seed' && cleanItem({ id: 'abcd', text: '', date: T }) === null && cleanItem({ id: 'a', text: 'x', date: T }) === null && cleanItem({ id: 'abcd', text: 'x', date: '2026-13-40' }) === null && cleanItem({ id: 'abcd', text: 'x'.repeat(500), date: T }).text.length === TEXT_MAX);
check('a hostile stored value gives an empty list, and a list is capped', cleanTodo('<script>').length === 0 && cleanTodo({ a: 1 }).length === 0 && cleanTodo(Array.from({ length: 300 }, (_, i) => ({ id: `id${i}xx`, text: 'x', date: T }))).length === MAX_ITEMS);
const a = addItem([], { text: 'Get a soil test', fieldId: FID }, T, 'tAAAA1');
check('adding puts the job first, open, with the field and the day', a.ok && a.list[0].text === 'Get a soil test' && a.list[0].fieldId === FID && a.list[0].done === false && a.list[0].date === T);
same('an empty job is refused in words', addItem([], { text: '   ' }, T), { ok: false, message: ERRORS.empty });
check('the same open job for the same field is not added twice', (() => { const b = addItem(a.list, { text: 'get a soil test', fieldId: FID }, T, 'tBBBB2'); return b.ok && b.same && b.list.length === 1; })());
check('a full list says so', addItem(Array.from({ length: MAX_ITEMS }, (_, i) => ({ id: `id${i}xx`, text: `job ${i}`, date: T })), { text: 'one more' }, T).message === ERRORS.full);
const t1 = toggleItem(a.list, 'tAAAA1', '2026-11-16');
check('ticking sets done and the day; ticking again clears both', t1[0].done && t1[0].doneOn === '2026-11-16' && !toggleItem(t1, 'tAAAA1', T)[0].done && toggleItem(t1, 'tAAAA1', T)[0].doneOn === '');
check('deleting removes it and Undo puts it back where it was', (() => { const two = addItem(a.list, { text: 'Second', fieldId: FID }, T, 'tCCCC3').list, item = two[0], gone = removeItem(two, item.id); return gone.length === 1 && restoreItem(gone, item, 0)[0].id === item.id && restoreItem(gone, item, 5).at(-1).id === item.id; })());
same('counts', counts([...t1, ...addItem(t1, { text: 'Next' }, T, 'tDDDD4').list.slice(0, 1)]), { all: 2, open: 1, done: 1 });
check('reading and writing use the store with its key, and a broken store gives an empty list', (() => { const s = new Store(); writeTodo(a.list, s); return readTodo(s).length === 1 && JSON.parse(s.getItem(KEY))[0].text === 'Get a soil test' && readTodo({ getItem() { throw new Error('no'); } }).length === 0 && writeTodo(a.list, { setItem() { throw new Error('full'); } }) === false; })());

// the tab
const note = (id, text, kind, date = '2026-08-01', fieldId = FID) => cleanNote({ id, date, text, kind, fieldId, crop: 'Corn' });
const html = notesInnerHTML({ fieldId: FID, notes: [note('nnnn1', 'The low corner stayed wet.', 'notice'), note('nnnn2', 'Weeds in the north corner.', 'free', '2026-10-01'), note('nnnn3', 'Another field', 'free', '2026-10-02', '44.0000,-79.0000')], todo: a.list, due: true, crop: 'Corn', today: T });
check('the tab has its three sections with headings in order and says it stays on this device', ['To-do list', 'What did you notice this season?', 'My notes on this field'].map(t => html.indexOf(`>${t}<`)).every((v, i, l) => v > 0 && (i === 0 || v > l[i - 1])) && /stay on this device/.test(html));
check('a job shows with its box named, a delete button named for it, and the count', /<input type="checkbox" data-nt="tick"/.test(html) && /aria-label="Delete: Get a soil test"/.test(html) && /1 to do/.test(html));
check('only this field\'s notes show; the record reads "Your record · Aug 2026 · Corn"', /Weeds in the north corner/.test(html) && !/Another field/.test(html) && /Your record · Aug 2026 · Corn/.test(html));
check('when the season has ended the tab asks "What did you notice?"', /The Corn season has ended\. What did you notice\?/.test(html) && !/season has ended/.test(notesInnerHTML({ fieldId: FID, notes: [], todo: [], due: false, today: T })));
const empty = notesInnerHTML({ fieldId: FID, notes: [], todo: [], due: false, today: T });
check('every empty state says what to do, in words', /Nothing on the list yet\. Add the first job\./.test(empty) && /No record yet\./.test(empty) && /No notes yet\./.test(empty));
check('words typed by the farmer are plain text', !/<img|<script/.test(notesInnerHTML({ fieldId: FID, notes: [note('nnnn9', '<img src=x onerror=1>', 'free')], todo: [{ id: 'tXXXX1', text: '<script>x</script>', done: false, date: T, fieldId: FID }], due: false, today: T })));
check('every field has a visible label and the buttons are named', (html.match(/<label class="field"><span>/g) ?? []).length === 3 && (html.match(/<form /g) ?? []).length === 3);
same('the field key is lat and lon to four decimals', [fieldKey({ lat: 43.13, lon: -80.75 }), fieldKey({})], [FID, '']);
check('a note id made here is accepted by the cleaner', cleanNote({ id: newNoteId(), date: T, text: 'x', kind: 'free' }) !== null);
// the record beside the plan, after 30 days
const rec = pickRecord({ notes: [note('nnnn1', 'The low corner stayed wet.', 'notice')], fieldId: FID, crops: ['Corn'], today: T });
check('"Your record" is the note about an earlier season, shown once it is 30 days old', recordWords(rec) === 'Your record, August 2026: The low corner stayed wet.' && pickRecord({ notes: [note('nnnn1', 'x', 'notice', '2026-11-01')], fieldId: FID, today: T }) === null);
check('the prompt is due after the season has ended and no record was written in its last month', noticeDue({ seasonEnd: '2026-10-05', today: T, notes: [], fieldId: FID }) === true && noticeDue({ seasonEnd: '2026-10-05', today: T, notes: [note('nnnn4', 'x', 'notice', '2026-10-01')], fieldId: FID }) === false);
// backup and delete
{ const s = new Store(); writeTodo(a.list, s); s.setItem('crophalo.notes.v1', JSON.stringify([note('nnnn1', 'x', 'free')]));
  const b = makeBackup(s, Date.UTC(2026, 10, 15), 'a test');
  check('the backup file holds the to-do list and the field notes, and passes its own check', Object.keys(b.keys).includes('crophalo.todo.v1') && Object.keys(b.keys).includes('crophalo.notes.v1') && checkBackup(JSON.stringify(b)).ok === true);
  const s2 = new Store(); restoreBackup(b, s2); check('restoring brings the list back', readTodo(s2).length === 1);
  check('the privacy count includes the list, and the group of notes deletes it', storageCounts(s).todo === 1 && GROUPS.find(g => g.id === 'notes').keys.includes('crophalo.todo.v1'));
  await eraseGroup('notes', { local: s, stopTimers() {}, pushOff: async () => {} }); same('deleting notes also deletes the to-do list', [s.getItem('crophalo.todo.v1'), s.getItem('crophalo.notes.v1')], [null, null]); }
console.log(`notes: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
