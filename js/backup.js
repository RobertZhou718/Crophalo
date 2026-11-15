// Crophalo's backup: everything this browser keeps for the farmer in one file, and the way back. A backup file is checked for its shape before anything is replaced, refused over 25 MB,
// and restored all-or-nothing: if the browser has no room, what was there before is put back.
// Pure: makeBackup(), checkBackup(), describeBackup(), backupName(), restoreBackup() (it takes the storage as an argument). Nothing here touches the page.
// Checked by scripts/test_pages.mjs (the shape rules, a hostile file, the all-or-nothing restore against a store that fills up).
export const PREFIX = 'crophalo.', MAX_BYTES = 25 * 1024 * 1024, MAX_VALUE = 8 * 1024 * 1024;
export const NOT_KEPT = Object.freeze(['crophalo.fx.v1', 'crophalo.perf.v1', 'crophalo.backup.id', 'crophalo.admin']);   // rates and logs are made again; the admin and backup id never travel
const KEY_OK = /^crophalo\.[a-z0-9][a-z0-9._-]{0,99}$/;
export const isKept = key => typeof key === 'string' && KEY_OK.test(key) && !NOT_KEPT.includes(key);
const LISTS = ['crophalo.saved.v1', 'crophalo.notes.v1', 'crophalo.todo.v1', 'crophalo.remind.v1', 'crophalo.farms.v1'], OBJECTS = ['crophalo.settings.v1', 'crophalo.units.v1', 'crophalo.answers.v1', 'crophalo.costs.v1', 'crophalo.welcome.v1'];
export const WORDS = Object.freeze({ notBackup: 'That file is not a Crophalo backup, so nothing was changed.', noRoom: 'This browser has no room for that backup, so nothing was changed.', tooBig: 'That file is too big to be a Crophalo backup, so nothing was changed.' });

const keysOf = storage => { const out = []; try { for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (isKept(k)) out.push(k); } } catch { /* an unreadable store has nothing to give */ } return out.sort(); };
// { app, v, saved, from, keys } of what this browser keeps; every value a string, as stored.
export function makeBackup(storage = globalThis.localStorage, now = Date.now(), from = 'this browser') {
  const keys = {};
  for (const k of keysOf(storage)) { try { const v = storage.getItem(k); if (typeof v === 'string') keys[k] = v; } catch { /* skipped */ } }
  return { app: 'crophalo', v: 1, saved: new Date(now).toISOString(), from, keys };
}
export const backupName = (now = Date.now()) => `crophalo-backup-${new Date(now).toISOString().slice(0, 10)}.json`;
const count = (b, key) => { try { const v = JSON.parse(b.keys[key]); return Array.isArray(v) ? v.length : 0; } catch { return 0; } };
export const describeBackup = b => ({ saved: count(b, 'crophalo.saved.v1'), notes: count(b, 'crophalo.notes.v1'), reminders: count(b, 'crophalo.remind.v1'), farms: count(b, 'crophalo.farms.v1'), keys: Object.keys(b.keys).length });
export const describeWords = d => `${d.saved} saved ${d.saved === 1 ? 'field' : 'fields'}, ${d.notes} ${d.notes === 1 ? 'note' : 'notes'} and ${d.reminders} ${d.reminders === 1 ? 'reminder' : 'reminders'}`;

// A file's text -> { ok: true, backup } (rebuilt from known parts) or { ok: false, reason }. Nothing is changed by looking.
export function checkBackup(text) {
  if (typeof text !== 'string') return { ok: false, reason: WORDS.notBackup };
  if (text.length > MAX_BYTES) return { ok: false, reason: WORDS.tooBig };
  let raw; try { raw = JSON.parse(text); } catch { return { ok: false, reason: WORDS.notBackup }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.app !== 'crophalo' || raw.v !== 1 || !raw.keys || typeof raw.keys !== 'object' || Array.isArray(raw.keys)) return { ok: false, reason: WORDS.notBackup };
  const keys = {};
  for (const [k, v] of Object.entries(raw.keys)) {
    if (!isKept(k)) continue;   // a key that is not ours, or must not travel, is left behind
    if (typeof v !== 'string' || v.length > MAX_VALUE) return { ok: false, reason: WORDS.notBackup };
    let parsed; try { parsed = JSON.parse(v); } catch { return { ok: false, reason: WORDS.notBackup }; }
    if (LISTS.includes(k) && !Array.isArray(parsed)) return { ok: false, reason: WORDS.notBackup };
    if (OBJECTS.includes(k) && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) return { ok: false, reason: WORDS.notBackup };
    keys[k] = v;
  }
  const saved = typeof raw.saved === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw.saved) ? raw.saved : '', from = typeof raw.from === 'string' ? raw.from.slice(0, 60) : '';
  return { ok: true, backup: { app: 'crophalo', v: 1, saved, from, keys } };
}
// Replace what is kept here with the backup. All or nothing: a store that fills up gets its old contents back.
export function restoreBackup(backup, storage = globalThis.localStorage) {
  const before = {};
  try {
    for (const k of keysOf(storage)) before[k] = storage.getItem(k);
    for (const k of Object.keys(before)) storage.removeItem(k);
    for (const [k, v] of Object.entries(backup.keys)) storage.setItem(k, v);
    return { ok: true };
  } catch {
    try { for (const k of keysOf(storage)) storage.removeItem(k); for (const [k, v] of Object.entries(before)) storage.setItem(k, v); } catch { /* the old contents could not all be put back: nothing more can be done here */ }
    return { ok: false, reason: WORDS.noRoom };
  }
}
