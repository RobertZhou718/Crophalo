// Crophalo's Satellites & prices tab, the figures: the last 30 days of NASA GPM IMERG satellite rain for the one square that holds the field, rebuilt from the server's answer from known
// parts only. A day nobody read is a gap, never 0 mm; the newest days are first estimates and are named as such; the square is said to be a square, not a gauge. Pure: cleanRain(), rainWords(),
// squareWords(); loadImerg() asks the server's own route once. Checked by scripts/test_satellites.mjs (the lookup's own answer, gaps, first estimates, a refusal, hostile input, every sentence).
/* The answer read (GET /api/imergrain?lat=&lon=): { ok, source, data_date, cell: { lat, lon, width_km, height_km, edges }, days: [[YYYY-MM-DD, mm | null, 'late' | 'early' | null] x30],
   days_read, total_mm, late, early, not_published, read_errors, first_estimate: [day], newest_day, incomplete?, note } or { ok: false, reason }. */
import { plainReason } from './satellites2-data.js';
const fin = v => typeof v === 'number' && Number.isFinite(v);
const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d + 'T00:00:00Z'));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dayWords = d => isDay(d) ? `${+d.slice(8)} ${MON[+d.slice(5, 7) - 1]}` : '';
export const longDay = d => isDay(d) ? `${+d.slice(8)} ${FULL[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '';
export const RAIN_DOWN = 'The satellite rain lookup did not answer. The rest of the report does not need it.';
const num = (v, d = 1) => v.toFixed(d).replace(/\.0$/, '');

// The answer rebuilt from known parts: { ok: true, days: [{ day, mm, run }], read, total, newest, early: [day], cell: { w, h }, missing, note } or { ok: false, reason }.
export function cleanRain(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== true || !Array.isArray(raw.days)) return { ok: false, reason: plainReason(raw?.reason, RAIN_DOWN) };   // the reason in a farmer's words: never a program path, a program name or a status code
  const days = [];
  for (const row of raw.days.slice(0, 40)) {
    if (!Array.isArray(row) || !isDay(row[0])) continue;
    const mm = fin(row[1]) && row[1] >= 0 && row[1] < 2000 ? Math.round(row[1] * 100) / 100 : null, run = mm !== null && (row[2] === 'late' || row[2] === 'early') ? row[2] : null;
    days.push({ day: row[0], mm, run });
  }
  days.sort((a, b) => a.day < b.day ? -1 : 1);
  if (!days.length) return { ok: false, reason: RAIN_DOWN };
  const read = days.filter(d => d.mm !== null).length, total = Math.round(days.reduce((s, d) => s + (d.mm ?? 0), 0) * 10) / 10;   // a total of the days that were read, and only those
  const w = fin(raw.cell?.width_km) && raw.cell.width_km > 0 && raw.cell.width_km < 200 ? raw.cell.width_km : null, h = fin(raw.cell?.height_km) && raw.cell.height_km > 0 && raw.cell.height_km < 200 ? raw.cell.height_km : null;
  return { ok: true, days, read, total, newest: [...days].reverse().find(d => d.mm !== null)?.day ?? null, early: days.filter(d => d.run === 'early').map(d => d.day), cell: { w, h }, missing: days.length - read,
    note: typeof raw.incomplete === 'string' ? raw.incomplete.slice(0, 240) : '' };
}
export const squareWords = cell => `One value for a square about ${cell?.w ? Math.round(cell.w) : 8} by ${cell?.h ? Math.round(cell.h) : 11} km, not a gauge in your field.`;
// The sentences of the card, each from its own figure.
export function rainWords(r) {
  if (!r?.ok) return { head: '', lines: [r?.reason ?? RAIN_DOWN] };
  const n = r.days.length, lines = [];
  lines.push(r.read ? `${num(r.total)} mm of rain over the ${r.read} ${r.read === 1 ? 'day' : 'days'} read, of the last ${n}.` : 'No day of the last ' + n + ' could be read.');
  if (r.newest) lines.push(`Newest day read: ${longDay(r.newest)}.`);
  if (r.early.length) lines.push(`The newest ${r.early.length === 1 ? 'day is a first estimate' : `${r.early.length} days are first estimates`} (NASA’s Early Run) and may change when the final run arrives.`);
  if (r.missing) lines.push(`${r.missing} ${r.missing === 1 ? 'day' : 'days'} could not be read. They are shown as gaps, never as dry days, so the total may be low.`);
  lines.push(squareWords(r.cell));
  return { head: `${num(r.total)} mm`, lines };
}

// ---- asking the server's own route; a refusal or a failure is a plain sentence, never a number
export async function loadImerg(loc, get = globalThis.fetch?.bind(globalThis)) {
  const lat = Number(loc?.lat), lon = Number(loc?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof get !== 'function') return { ok: false, reason: RAIN_DOWN };
  try { return cleanRain(await (await get(`/api/imergrain?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}`)).json()); }
  catch { return { ok: false, reason: RAIN_DOWN }; }
}
