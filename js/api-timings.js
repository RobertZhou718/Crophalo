// Timings of the app's own calls to the data server, measured in THIS browser during normal use: the time each /api/<service> call took and whether it answered.
// Kept on this device only (the last 200 calls, in storage 'crophalo.apilog.v1'); the API connections page reads them for the average, the slowest 5 %, the share that answered, the line of recent times and the list of recent requests.
// A call is a service name, a time, a duration, an HTTP status and answered yes or no: never an address with a place in it, never a key, a header or a body. installTimings() wraps fetch once; the rest is pure.
// Checked by scripts/test_pages.mjs (the statistics, the safe export, what is and is not recorded) and scripts/e2e_pages.mjs.
import { API_BASE } from './api.js';

export const LOG_KEY = 'crophalo.apilog.v1', LOG_MAX = 200;

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// One entry from what a call did: { t, id, ms, status, ok }. id is the service name in the path (letters, digits and dashes only).
export function entryOf({ path, t = Date.now(), ms, status = 0, ok = false }) {
  const m = /^\/api\/([a-z0-9][a-z0-9-]{0,30})(?:\/|$)/i.exec(String(path ?? '')); if (!m) return null;
  const id = m[1].toLowerCase(); if (['push', 'health', 'ready', 'sources', 'keys'].includes(id)) return null;   // not data services
  return { t: Math.round(num(t) ?? Date.now()), id, ms: Math.max(0, Math.round(num(ms) ?? 0)), status: Math.max(0, Math.round(num(status) ?? 0)), ok: !!ok };
}
export function readLog(storage = globalThis.localStorage) {
  try { const list = JSON.parse(storage.getItem(LOG_KEY)); return Array.isArray(list) ? list.filter(e => e && typeof e.id === 'string' && num(e.ms) !== null && num(e.t) !== null).slice(-LOG_MAX).map(e => ({ t: e.t, id: String(e.id).slice(0, 31), ms: e.ms, status: num(e.status) ?? 0, ok: !!e.ok })) : []; } catch { return []; }
}
export function record(entry, storage = globalThis.localStorage) {
  if (!entry) return false;
  try { const list = readLog(storage); list.push(entry); storage.setItem(LOG_KEY, JSON.stringify(list.slice(-LOG_MAX))); return true; } catch { return false; }
}
export const clearLog = (storage = globalThis.localStorage) => { try { storage.removeItem(LOG_KEY); } catch { /* none */ } };
const percentile = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] : null;
// What the calls of one service say: how many, how many answered, the average, the slowest 5 % (95th percentile), the last twelve times. null for each figure there is no call for: never a made-up zero.
export function statsOf(entries) {
  const list = (entries ?? []).filter(e => e && num(e.ms) !== null), ms = list.map(e => e.ms).sort((a, b) => a - b), ok = list.filter(e => e.ok).length;
  return { calls: list.length, ok, success: list.length ? ok / list.length : null, avg: list.length ? Math.round(ms.reduce((s, v) => s + v, 0) / list.length) : null, p95: percentile(ms, 0.95), recent: list.slice(-12).map(e => e.ms) };
}
export const byService = log => { const out = {}; for (const e of log ?? []) (out[e.id] ||= []).push(e); return out; };
export const median = list => { const s = list.filter(v => num(v) !== null).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)) : null; };
// The log for export: the same safe fields only.
export const exportOf = (log, rows, now = Date.now()) => JSON.stringify({ made: new Date(now).toISOString(), note: 'Timings measured in this browser. A call is a service name, a time, a duration, a status and whether it answered. No key, no address and no answer is in this file.',
  services: (rows ?? []).map(r => ({ id: r.id, name: r.name, state: r.state, last_ms: r.ms, key: r.needsKey ? (r.keySet ? 'set' : 'not set') : undefined })), calls: (log ?? []).map(e => ({ at: new Date(e.t).toISOString(), service: e.id, ms: e.ms, status: e.status, answered: e.ok })) }, null, 1);

// The path of a call to the app's own data server ('/api/…'), or '' for any other address: the server is on the pages' own address, or on the address js/site-config.js names
// (the website on a static host, the server on a name of its own). Pure.
export function apiPathOf(url, pageHref, apiBase = API_BASE) {
  try { const u = new URL(String(url), pageHref), page = new URL(String(pageHref)).origin; return u.origin === page || (apiBase && u.origin === apiBase) ? u.pathname : ''; } catch { return ''; }
}

let installed = false;
// Wrap the page's fetch once: a call to /api/<service> on this site is timed and noted.
export function installTimings(win = globalThis.window) {
  if (installed || !win?.fetch) return false; installed = true;
  const real = win.fetch.bind(win);
  win.fetch = async (input, init) => {
    const url = String(input && input.url || input), started = performance.now();
    const path = apiPathOf(url, win.location?.href);   // a call to the data server, on this site or on its own name
    try { const res = await real(input, init); if (path) record(entryOf({ path, ms: performance.now() - started, status: res.status, ok: res.ok })); return res; }
    catch (e) { if (path) record(entryOf({ path, ms: performance.now() - started, status: 0, ok: false })); throw e; }
  };
  return true;
}

installTimings();   // armed when the module is imported: the page's own calls from then on
