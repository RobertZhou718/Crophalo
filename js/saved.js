// Crophalo's saved fields: one record per spot, kept only in this browser. Nothing here leaves the device.
// Pure: cleanSaved(), savedDate(). The rest reads and writes the browser's storage.
// Checked by scripts/test_places.mjs (cleanSaved) and scripts/e2e_flow.mjs (the Saved sheet: open, delete, undo).
import { spotKey } from './places.js';

export const SAVED_KEY = 'crophalo.saved.v1', SAVED_MAX = 200;
const words = (value, most) => String(value ?? '').trim().slice(0, most);

// Any stored value rebuilt from known parts only: { key, name, place, lat, lon, at, summary, answers }, one per spot, newest first.
export function cleanSaved(raw) {
  const seen = new Set(), out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const lat = Number(item?.lat), lon = Number(item?.lon), at = Number(item?.at);
    if (!item || typeof item !== 'object' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const key = spotKey(lat, lon);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name: words(item.name, 120) || 'My field', place: words(item.place, 200), lat, lon, at: Number.isFinite(at) ? at : 0,
      summary: words(item.summary, 400), answers: item.answers && typeof item.answers === 'object' && !Array.isArray(item.answers) ? item.answers : {} });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, SAVED_MAX);
}

// "Nov 14, 2026", or '' for a record with no date.
export const savedDate = at => at > 0 ? new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

export function readSaved() { try { return cleanSaved(JSON.parse(localStorage.getItem(SAVED_KEY))); } catch { return []; } }   // blocked storage or a broken value: nothing saved
function write(list) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(cleanSaved(list))); return true; } catch { return false; } }

// Keep a field (a spot saved twice keeps the newer record). False when the browser refuses to store.
export function saveField(record) { return write([record, ...readSaved().filter(r => r.key !== spotKey(record.lat, record.lon))]); }
// Take one away; gives the record back so it can be restored, or null when it was not there.
export function removeSaved(key) {
  const list = readSaved(), gone = list.find(r => r.key === key) ?? null;
  if (gone) write(list.filter(r => r.key !== key));
  return gone;
}
export const restoreSaved = record => saveField(record);
