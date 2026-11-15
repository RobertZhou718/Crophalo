// Crophalo's service status page: one card for each data service, with a dot and one word for its state, when it last answered and how long it took, the plain problem when there is one, and one "Check again" button for the page.
// It reads the server's /api/sources and asks /api/sources/check. It shows no key, no password, no file path and no private figure, ever: a key is only "set" or "not set". Every word from the server is put on the page as plain text.
// Pure: cleanSources(), adminHTML(), the words. loadSources() and checkSources() ask the server; renderAdminPage() draws and listens.
// Checked by scripts/test_pages.mjs (the answer rebuilt from known parts, the old shorter answer, a hostile answer, escaping, the states) and scripts/e2e_pages.mjs.
import { esc } from './words.js';
import { pageStyle } from './page-style.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const text = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
const when = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && Number.isFinite(Date.parse(v)) ? v : '';
export const ADMIN_DOWN = 'The server did not answer, so the list of services could not be read.';
export const STATES = Object.freeze({ answering: 'Answering', slow: 'Slow', not_answering: 'Not answering', not_asked_yet: 'Not asked yet', switched_off: 'Switched off' });
const flag = v => (v === true ? true : v === false ? false : null);
// Nothing private on the page, whatever the server sends: a folder path, the query of an address and anything long enough to be a key are taken out of a problem line.
const scrub = t => t.replace(/(?:[A-Za-z]:\\|~\/|\/(?:Users|home|private|var|tmp|opt|etc|root)\/)[^\s'"]*/g, 'a file on the server').replace(/(https?:\/\/[^\s?#'"]+)[?#][^\s'"]*/g, '$1').replace(/\b(?=[A-Za-z0-9_\-]*\d)[A-Za-z0-9_\-]{24,}\b/g, '…').replace(/\b(key|token|password|secret|apikey|api_key)\s*[=:]\s*\S+/gi, '$1 hidden');
// The older, shorter answer gives the server's own error text (last_error). It is said in plain words; one that is not known is said in one general line, never as program words.
const PLAIN = [[/time(d)?\s*out|ETIMEDOUT|took too long|did not answer in time/i, 'It took too long to answer.'], [/\b(401|403)\b|unauthori[sz]ed|forbidden|denied/i, 'It refused the request. Its key or login may be missing.'],
  [/\b429\b|too many/i, 'It asked us to wait before asking again.'], [/\b404\b|not found/i, 'It had no data for this request.'], [/\b5\d\d\b|server error|unavailable/i, 'It had a problem on its own side.'],
  [/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network|offline|could not (be )?reach|fetch failed/i, 'It could not be reached.']];
const plainProblem = t => !t ? '' : (PLAIN.find(([re]) => re.test(t))?.[1] ?? 'It gave an error the last time it was asked.');
export const OLDER_SHAPE = 'This server sends a shorter list, so it does not say which services need a key.';

// The server's answer rebuilt from known parts: [{ id, name, state, lastOk, ms, problem, kept, ttlHours, needsKey, keySet, needsLogin, loginSet, checkedAt }] or null.
// The older, shorter answer (id, name, last_ok_time, last_ms, last_error, cache_items, ttl_hours) still gives a card: its state is worked out from what it says, and the page says the list is shorter.
export function cleanSources(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 80).filter(r => r && typeof r === 'object' && text(r.id, 40)).map(r => {
    const older = !('state' in r), lastOk = when(r.last_ok_time), problem = scrub(older ? plainProblem(text(r.last_error, 400)) : text(r.last_problem ?? r.last_error, 200)), kept = fin(r.kept) ? r.kept : fin(r.cache_items) ? r.cache_items : 0;
    const given = Object.hasOwn(STATES, r.state) ? r.state : lastOk ? (problem ? 'slow' : 'answering') : problem ? 'not_answering' : 'not_asked_yet';
    return { id: text(r.id, 40), name: text(r.name, 80) || text(r.id, 40), state: given, lastOk, ms: fin(r.last_ms) && r.last_ms >= 0 && r.last_ms < 1e7 ? Math.round(r.last_ms) : null, problem,
      kept: Math.max(0, Math.round(kept)), ttlHours: fin(r.ttl_hours) && r.ttl_hours > 0 ? Math.round(r.ttl_hours * 10) / 10 : null,
      needsKey: r.needs_key === true, keySet: flag(r.key_set), needsLogin: r.needs_login === true, loginSet: flag(r.login_set), checkedAt: when(r.checked_at), canCheck: r.can_check !== false, older };
  });
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], two = n => String(n).padStart(2, '0');
// "14:02" today, "14 Nov, 14:02" another day, in the visitor's own time
export function whenWords(iso, now = Date.now()) {
  if (!iso) return 'Not yet';
  const d = new Date(iso), t = new Date(now), time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  return d.toDateString() === t.toDateString() ? time : `${d.getDate()} ${MON[d.getMonth()]}, ${time}`;
}
export const msWords = ms => ms === null ? 'Not yet' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(/\.0$/, '')} s`;
const DOT = { answering: 'ok', slow: 'warn', not_answering: 'bad', not_asked_yet: 'idle', switched_off: 'idle' };
export const lastLine = (r, now) => r.lastOk ? `Last answered ${whenWords(r.lastOk, now)}${r.ms !== null ? `, in ${msWords(r.ms)}` : ''}` : r.state === 'switched_off' ? 'Switched off on this server' : r.state === 'not_asked_yet' ? 'Not asked yet' : 'Has not answered yet';
export const keyLine = r => (r.needsKey ? `Needs a key: ${r.keySet ? 'set' : 'not set'}` : '') || (r.needsLogin ? `Needs a login: ${r.loginSet ? 'set' : 'not set'}` : '');
const card = (r, now) => `<li class="ad-card" data-state="${r.state}"><div class="ad-head"><span class="ad-dot ${DOT[r.state]}" aria-hidden="true"></span><h2>${esc(r.name)}</h2><span class="ad-state">${esc(STATES[r.state])}</span></div>
  <p>${esc(lastLine(r, now))}</p>${r.problem ? `<p class="ad-problem">${esc(r.problem)}</p>` : ''}${keyLine(r) ? `<p class="cap">${esc(keyLine(r))}</p>` : ''}
  <p class="cap">${r.kept ? `${r.kept} ${r.kept === 1 ? 'answer' : 'answers'} kept${r.ttlHours ? ` for ${r.ttlHours} h` : ''}` : r.ttlHours === null ? 'Asked by your browser, nothing kept here' : 'No answers kept'}</p></li>`;
// the whole page: rows undefined = being read, null = the server did not answer; busy = the check is running
export function adminHTML(rows, { busy = false, now = Date.now() } = {}) {
  const head = `<p class="lead">Which data services answer, and how fast. Nothing private is shown.</p>`;
  const bar = `<div class="ad-bar"><button type="button" class="btn" id="adCheck" ${busy ? 'aria-busy="true" disabled' : ''}>${busy ? '<span class="dot busy" aria-hidden="true"></span> Checking…' : 'Check again'}</button><p class="cap" id="adSay" role="status" aria-live="polite"></p></div>`;
  if (rows === undefined) return `${head}<p class="cap" role="status" aria-live="polite"><span class="dot busy" aria-hidden="true"></span> Reading the list of services…</p>`;
  if (!rows) return `${head}<p class="rv-notread"><b>${esc(ADMIN_DOWN)}</b> Try again in a moment.</p><div class="ad-bar"><button type="button" class="btn" id="adCheck">Try again</button></div>`;
  if (!rows.length) return `${head}<p class="cap">The server lists no services.</p>${bar}`;
  const bad = rows.filter(r => r.state === 'not_answering').length, slow = rows.filter(r => r.state === 'slow').length;
  const sum = `${rows.filter(r => r.state === 'answering').length} of ${rows.length} answering${slow ? `, ${slow} slow` : ''}${bad ? `, ${bad} not answering` : ''}.`;
  const older = rows.every(r => r.older) ? `<p class="cap" id="adOlder">${esc(OLDER_SHAPE)}</p>` : '';
  return `${head}${bar}<p class="ad-sum" id="adSum">${esc(sum)}</p>${older}<ul class="ad-grid">${rows.map(r => card(r, now)).join('')}</ul>`;
}
export async function loadSources(get = globalThis.fetch?.bind(globalThis)) {
  if (typeof get !== 'function') return null;
  try { return cleanSources(await (await get('/api/sources')).json()); } catch { return null; }
}
export async function checkSources(post = globalThis.fetch?.bind(globalThis)) {
  if (typeof post !== 'function') return null;
  try { return cleanSources(await (await post('/api/sources/check', { method: 'POST' })).json()); } catch { return null; }
}
// Draw the page into a node and listen to its button.
export async function renderAdminPage(root) {
  if (!root) return;
  pageStyle('css/pages.css', root);
  const body = root.querySelector('#adminBody') || root.appendChild(Object.assign(document.createElement('div'), { id: 'adminBody' })), h1 = root.querySelector('h1');
  if (h1) h1.textContent = 'Service status';
  let rows;
  const draw = (busy = false) => { body.innerHTML = adminHTML(rows, { busy }); };
  draw(); rows = await loadSources(); draw();
  if (body.dataset.bound) return; body.dataset.bound = '1';
  body.addEventListener('click', async event => {
    if (!event.target.closest('#adCheck')) return;
    const was = rows; draw(true);
    const next = await checkSources(), again = next ? null : await loadSources();   // a server without the check route: the list is read again instead
    rows = next ?? again ?? was ?? null; draw();
    const say = body.querySelector('#adSay'); if (say) say.textContent = next ? 'Checked just now.' : again ? 'The list was read again just now.' : 'The check could not be made right now.';
  });
}
