// Crophalo's Look ahead worker: runs a job (js/ahead-job.js) away from the page so the farm stays smooth, and says how far it has got. It imports only the pure Look ahead files, the crop table, and the one scoring path whose address
// the page hands over. If it cannot start, the page runs the same job in small steps between frames. Checked by scripts/e2e_ahead.mjs (a real worker in a real browser) and scripts/test_ahead_job.mjs (the job itself).
import { computeJob } from './ahead-job.js';
import { cropOf as tableOf } from './crops.js';

let judgeModule = null;
self.onmessage = async event => {
  const { id, type, job, judgeUrl } = event.data ?? {};
  try {
    judgeModule ??= judgeUrl ? await import(judgeUrl) : {};
    const cropOf = cid => tableOf(cid), judge = judgeModule.judgeSeason ?? (() => null);
    const out = await computeJob(type, job, { judge, cropOf, progress: (what, done, of) => self.postMessage({ id, progress: { what, done, of } }) });
    self.postMessage({ id, out });
  } catch (e) { self.postMessage({ id, out: { ok: false, type, reason: 'Look ahead could not work this out just now.' } }); }
};
