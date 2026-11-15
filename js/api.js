// Crophalo's one way to write the address of its own data server: apiUrl('/api/…') stays '/api/…' when the pages and the server share one address (this computer, or one host for both), and becomes https://that-name/api/… when js/site-config.js names the server (the website on a static host, the server on a name of its own).
// A setting that is not a safe address is never used: the address then stays on the pages' own, where every card says plainly that its lookup did not answer, and the rest of the report works as before.
// Pure: cleanOrigin(), apiUrl(), API_BASE. wakeApi() and the first-touch wake read the page; they run only when the server is on another name.
// Checked by scripts/test_apiurl.mjs (the addresses, the settings that are refused, the wake) and scripts/e2e_split.mjs (the pages and the server on two addresses).
import { API_ORIGIN } from './site-config.js';

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

// The server's address as scheme://name[:port] in lower case, with no path, query, login or trailing slash; '' when it is empty or not one that may be used.
// https only, but plain http for this computer itself (a copy run by hand, or a test); the usual port (443, 80) is left out, as a browser writes it.
export function cleanOrigin(value) {
  const m = /^(https?):\/\/([a-z0-9.-]+|\[::1\])(?::(\d{1,5}))?\/?$/.exec(String(value ?? '').trim().toLowerCase());
  if (!m || !(NAME.test(m[2]) || m[2] === '[::1]')) return '';
  const scheme = m[1], host = m[2], port = m[3] === undefined ? null : Number(m[3]);
  if (port !== null && (port < 1 || port > 65535)) return '';
  if (scheme === 'http' && !LOOPBACK.test(host)) return '';
  const usual = port === null || (scheme === 'https' && port === 443) || (scheme === 'http' && port === 80);
  return `${scheme}://${host}${usual ? '' : ':' + port}`;
}
export const API_BASE = cleanOrigin(API_ORIGIN);

// path: one of the server's own addresses, written as its routes are ('/api/smaproot?lat=…'). base: another server for this one call (a test), else the one set up;
// a base that is not a safe address counts as none. Anything that is not an /api address comes back as it was given.
export function apiUrl(path, base) {
  const p = String(path ?? '');
  if (!/^\/api(?:[/?#]|$)/.test(p)) return p;
  return (cleanOrigin(base) || API_BASE) + p;
}

// ---- waking a server that sleeps: a host that stops the server when nobody uses it starts it again on the first request, which then waits.
// So on the first touch of the page (a tap, a click or a key, never a page load alone, so a search robot wakes nothing) one small question goes to the server, and it is
// starting while the farmer is still choosing a field. Only when the server is on another name: on one address there is nothing to wake. Once per page; any failure is silent.
let woken = false;
export function wakeApi(fetchImpl = globalThis.fetch, base = API_BASE) {
  if (woken || !base || typeof fetchImpl !== 'function') return false;
  woken = true;
  try { Promise.resolve(fetchImpl.call(globalThis, base + '/api/health', { cache: 'no-store', credentials: 'omit' })).catch(() => {}); } catch { /* the page carries on without it */ }
  return true;
}
export function wakeOnFirstTouch(target = globalThis, fetchImpl = globalThis.fetch, base = API_BASE) {
  if (!base || typeof target?.addEventListener !== 'function') return false;
  const once = () => { for (const kind of ['pointerdown', 'keydown']) target.removeEventListener(kind, once, true); wakeApi(fetchImpl, base); };
  for (const kind of ['pointerdown', 'keydown']) target.addEventListener(kind, once, { capture: true, passive: true });
  return true;
}
if (typeof document !== 'undefined' && API_BASE) wakeOnFirstTouch();   // pages only (never Node, never a worker), and only when the server is on another name
