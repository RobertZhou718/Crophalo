// Crophalo's terrain worker: a module worker that fetches and keeps the Terrain Tiles heights and works out every terrain tile and the readings at the pin away from the page, so the map never stalls. The work itself is js/terrain-jobs.js.
// Not pure: it answers the page's messages (hello, a job, cancel, retry, counts). Checked by scripts/e2e_terrain.mjs (the layers drawn by this worker in a real browser, with no long task on the page).
import { createEngine } from './terrain-jobs.js';

const engine = createEngine({ budgetMs: 40 });
self.addEventListener('message', async event => {
  const job = event.data ?? {};
  if (job.type === 'hello') return self.postMessage({ type: 'ready' });
  if (job.type === 'cancel') return engine.cancel(job.id);
  if (job.type === 'retry') return engine.retry();
  if (job.type === 'counts') return self.postMessage({ type: 'counts', id: job.id, counts: engine.counts() });
  const answer = await engine.run(job).catch(e => ({ id: job.id, ok: false, why: 'error', detail: String(e?.message ?? e).slice(0, 160) }));
  self.postMessage({ type: 'answer', ...answer }, answer.rgba ? [answer.rgba] : []);
});
