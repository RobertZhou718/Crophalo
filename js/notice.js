// Crophalo's "What did you notice?": what went well and what did not, written by the farmer after a season, kept on this device, and shown beside next
// season's plan as "Your record". Photos stay on the device and never leave (a note says only that it has one).
// Pure: cleanNote(), noticeDue(), pickRecord(), recordWords(). The storage calls take the browser's store as an argument.
// Checked by scripts/test_sharetext.mjs (the cleaner, when the prompt is due, which note is the record).
export const KEY = 'crophalo.notes.v1', MAX_NOTES = 200, TEXT_MAX = 500, KINDS = Object.freeze(['notice', 'free']);
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const newNoteId = (now = Date.now(), random = Math.random) => 'n' + now.toString(36) + Array.from({ length: 5 }, () => Math.floor(random() * 36).toString(36)).join('');
export const PROMPT = Object.freeze({ title: 'What did you notice this season?', lead: 'What went well, and what did not? Next season it shows beside your plan as “Your record”. It stays on this device.', hint: 'e.g. The low corner stayed wet. Corn there came up late.', empty: 'Write something or add a photo first', saved: 'Saved on this device as your record' });
const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z'));
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// A note as kept: { id, date, text, photo, kind, fieldId, crop }; null when it has neither words nor a photo. The picture itself is never in the record.
export function cleanNote(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const text = typeof raw.text === 'string' ? raw.text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, TEXT_MAX) : '', photo = raw.photo === true;
  if ((!text && !photo) || !isDay(raw.date) || typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{4,40}$/.test(raw.id)) return null;
  return { id: raw.id, date: raw.date, text, photo, kind: KINDS.includes(raw.kind) ? raw.kind : 'free', fieldId: /^-?\d{1,2}\.\d{4},-?\d{1,3}\.\d{4}$/.test(String(raw.fieldId ?? '')) ? raw.fieldId : '', crop: typeof raw.crop === 'string' ? raw.crop.slice(0, 40) : '' };
}
export const cleanNotes = raw => { const seen = new Set(), out = []; for (const x of Array.isArray(raw) ? raw : []) { const n = cleanNote(x); if (n && !seen.has(n.id)) { seen.add(n.id); out.push(n); } if (out.length >= MAX_NOTES) break; } return out; };
// The prompt "The corn season has ended. What did you notice?": after the crop's season ended and no record was written in its last month.
export function noticeDue({ seasonEnd, today, notes, fieldId }) {
  if (!isDay(seasonEnd) || !isDay(today) || today <= seasonEnd) return false;
  const from = addDays(seasonEnd, -30);
  return !cleanNotes(notes).some(n => n.kind === 'notice' && (!fieldId || n.fieldId === fieldId) && n.date >= from);
}
// "Your record": a note at least 30 days old for this field, preferring one about a crop in the plan, newest first.
export function pickRecord({ notes, fieldId, crops = [], today }) {
  const old = cleanNotes(notes).filter(n => n.kind === 'notice' && (!fieldId || n.fieldId === fieldId) && n.date <= addDays(today, -30) && (n.text || n.photo));
  const inPlan = old.filter(n => n.crop && crops.map(c => c.toLowerCase()).includes(n.crop.toLowerCase()));
  return (inPlan.length ? inPlan : old).sort((a, b) => a.date < b.date ? 1 : -1)[0] ?? null;
}
export const recordWords = n => n ? `Your record, ${MON[+n.date.slice(5, 7) - 1]} ${n.date.slice(0, 4)}: ${n.text || 'a photo'}` : '';
export function readNotes(storage = globalThis.localStorage) { try { return cleanNotes(JSON.parse(storage.getItem(KEY))); } catch { return []; } }
export function writeNotes(list, storage = globalThis.localStorage) { try { storage.setItem(KEY, JSON.stringify(cleanNotes(list))); return true; } catch { return false; } }
