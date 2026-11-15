// Crophalo's to-do list: small jobs for a field that the farmer writes, ticks off and deletes. Kept on this device only, under one key, with the other things the farmer keeps (so it rides in the backup file and goes with Privacy's delete).
// Pure: cleanItem(), cleanTodo(), addItem(), toggleItem(), removeItem(), counts(). readTodo() and writeTodo() take the browser's store as an argument and keep every access in a try.
// Checked by scripts/test_notes.mjs (the cleaner, the limits, ticking, deleting and bringing back, a hostile stored value).
export const KEY = 'crophalo.todo.v1', MAX_ITEMS = 100, TEXT_MAX = 120;
const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z'));
export const newId = (now = Date.now(), random = Math.random) => 't' + now.toString(36) + Array.from({ length: 5 }, () => Math.floor(random() * 36).toString(36)).join('');
// An item as kept: { id, text, done, date, doneOn, fieldId }; null when it has no words or a bad id or day.
export function cleanItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const text = typeof raw.text === 'string' ? raw.text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX) : '';
  if (!text || typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{4,40}$/.test(raw.id) || !isDay(raw.date)) return null;
  return { id: raw.id, text, done: raw.done === true, date: raw.date, doneOn: raw.done === true && isDay(raw.doneOn) ? raw.doneOn : '', fieldId: /^-?\d{1,2}\.\d{4},-?\d{1,3}\.\d{4}$/.test(String(raw.fieldId ?? '')) ? raw.fieldId : '' };
}
export const cleanTodo = raw => { const seen = new Set(), out = []; for (const x of Array.isArray(raw) ? raw : []) { const n = cleanItem(x); if (n && !seen.has(n.id)) { seen.add(n.id); out.push(n); } if (out.length >= MAX_ITEMS) break; } return out; };
export const ERRORS = Object.freeze({ empty: 'Write the job first.', full: `The list holds ${MAX_ITEMS} jobs. Delete one to add another.` });
// { ok, list, item } or { ok: false, message }. A job already on the list for the same field is not added twice.
export function addItem(list, { text, fieldId = '' }, today, id = newId()) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, message: ERRORS.empty };
  const cur = cleanTodo(list);
  if (cur.length >= MAX_ITEMS) return { ok: false, message: ERRORS.full };
  const dup = cur.find(i => i.text.toLowerCase() === t.toLowerCase().slice(0, TEXT_MAX) && i.fieldId === fieldId && !i.done);
  if (dup) return { ok: true, list: cur, item: dup, same: true };
  const item = cleanItem({ id, text: t, done: false, date: today, fieldId });
  return item ? { ok: true, list: [item, ...cur], item } : { ok: false, message: ERRORS.empty };
}
export const toggleItem = (list, id, today) => cleanTodo(list).map(i => i.id !== id ? i : i.done ? { ...i, done: false, doneOn: '' } : { ...i, done: true, doneOn: today });
export const removeItem = (list, id) => cleanTodo(list).filter(i => i.id !== id);
// Bring a deleted item back where it was (Undo).
export function restoreItem(list, item, index) { const cur = cleanTodo(list).filter(i => i.id !== item.id), n = cleanItem(item); if (!n) return cur; cur.splice(Math.max(0, Math.min(index, cur.length)), 0, n); return cur.slice(0, MAX_ITEMS); }
export const counts = list => { const l = cleanTodo(list); return { all: l.length, open: l.filter(i => !i.done).length, done: l.filter(i => i.done).length }; };
export function readTodo(storage = globalThis.localStorage) { try { return cleanTodo(JSON.parse(storage.getItem(KEY))); } catch { return []; } }
export function writeTodo(list, storage = globalThis.localStorage) { try { storage.setItem(KEY, JSON.stringify(cleanTodo(list))); return true; } catch { return false; } }
