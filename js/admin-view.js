// Crophalo's Admin panel: read-only and open to everyone, because it shows nothing private. It lists the live data services the server asks for the farmer, when each last answered, how long it took,
// and the last problem it had. No password, no buttons that change anything. Pure: cleanSources(), adminHTML(). loadSources() asks the server's own route once.
// Checked by scripts/test_pages.mjs (the answer rebuilt from known parts, a hostile answer, escaping, the empty and failed states).
import { esc } from './words.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const text = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
const when = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && Number.isFinite(Date.parse(v)) ? v : '';
export const ADMIN_DOWN = 'The server did not answer, so the list of services could not be read.';

// The server's /api/sources answer rebuilt from known parts: [{ id, name, lastOk, ms, error, kept, ttlHours }] or null.
export function cleanSources(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 60).filter(r => r && typeof r === 'object' && text(r.id, 40)).map(r => ({ id: text(r.id, 40), name: text(r.name, 80) || text(r.id, 40), lastOk: when(r.last_ok_time), ms: fin(r.last_ms) && r.last_ms >= 0 && r.last_ms < 1e7 ? Math.round(r.last_ms) : null,
    error: text(r.last_error, 160), kept: fin(r.cache_items) && r.cache_items >= 0 ? Math.round(r.cache_items) : 0, ttlHours: fin(r.ttl_hours) && r.ttl_hours > 0 ? Math.round(r.ttl_hours * 10) / 10 : null }));
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const whenWords = iso => iso ? `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}, ${iso.slice(11, 16)} UTC` : 'Not yet';
export const msWords = ms => ms === null ? 'Not yet' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(/\.0$/, '')} s`;
export function adminHTML(rows) {
  const head = `<h2>Admin</h2><p class="lead">A read-only view of the data services behind Crophalo. It is open to everyone and shows nothing private: no field, no answer, no name.</p>`;
  if (rows === undefined) return `${head}<p class="cap" role="status" aria-live="polite">Reading the list of services…</p>`;
  if (!rows) return `${head}<p class="rv-notread"><b>Not read yet.</b> ${esc(ADMIN_DOWN)}</p>`;
  if (!rows.length) return `${head}<p class="cap">The server lists no live services.</p>`;
  return `${head}<div class="tbl" role="region" tabindex="0" aria-label="Data services"><table class="sent-table"><thead><tr><th scope="col">Service</th><th scope="col">Last answered</th><th scope="col">Last took</th><th scope="col">Answers kept</th><th scope="col">Last problem</th></tr></thead><tbody>${rows.map(r =>
    `<tr><th scope="row">${esc(r.name)}</th><td data-label="Last answered">${esc(whenWords(r.lastOk))}</td><td data-label="Last took">${esc(msWords(r.ms))}</td><td data-label="Answers kept">${r.kept}${r.ttlHours ? ` (for ${r.ttlHours} h)` : ''}</td><td data-label="Last problem">${esc(r.error || 'None')}</td></tr>`).join('')}</tbody></table></div>`;
}
export async function loadSources(get = globalThis.fetch?.bind(globalThis)) {
  if (typeof get !== 'function') return null;
  try { return cleanSources(await (await get('/api/sources')).json()); } catch { return null; }
}
