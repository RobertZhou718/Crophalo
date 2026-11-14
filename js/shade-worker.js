// The shade's background worker: takes a job, answers it, never touches the page. Every message {id, op, ...} gets one answer {id, ok, result | error}.
import { runJob } from './shade.js';

self.onmessage = event => {
  const msg = event.data || {};
  try { self.postMessage({ id: msg.id, ok: true, result: runJob(msg, !!msg.phone) }); }
  catch (e) { self.postMessage({ id: msg.id, ok: false, error: String(e && e.message || e) }); }
};
