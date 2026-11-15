// The orbital elements the home needs, asked at once (before the satellites' code has even loaded) and kept on this device for two hours, so a new tab or a second visit asks nothing.
// They are public orbital elements, not a farmer's data; each card prints their date and age. Blocked storage: the answer is only asked again. Not pure: it asks the server and uses the browser's storage.
// Checked by scripts/e2e_home.mjs (a new page with the same storage makes no /api/orbits request) and scripts/test_live_orbits.mjs.
import { apiUrl } from './api.js';
export const KEY = 'crophalo.orbits.v1', KEEP_MS = 2 * 3600e3, ASK_MS = 100e3;   // the server's first ask of the day can take a while
export async function askOrbits() {
  try { const kept = JSON.parse(localStorage.getItem(KEY)); if (kept?.answer?.ok && Date.now() - kept.at < KEEP_MS) return kept.answer; } catch { /* blocked or broken storage: ask */ }
  const answer = await fetch(apiUrl('/api/orbits'), { signal: AbortSignal.timeout?.(ASK_MS) }).then(r => r.json());
  if (answer?.ok) try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), answer })); } catch { /* asked again next time */ }
  return answer;
}

// the satellites' code and the orbit library's files, fetched in one wave (a hand list: scripts/test_live_orbits.mjs checks it against the real imports)
export const PRELOAD = Object.freeze(['js/home-sats.js', 'js/home-sats-data.js', 'js/home-time.js', 'vendor/satellite/io.js', 'vendor/satellite/constants.js', 'vendor/satellite/ext.js', 'vendor/satellite/transforms.js', 'vendor/satellite/propagation/sgp4.js', 'vendor/satellite/propagation/sgp4init.js', 'vendor/satellite/propagation/initl.js', 'vendor/satellite/propagation/dpper.js', 'vendor/satellite/propagation/dscom.js', 'vendor/satellite/propagation/dsinit.js', 'vendor/satellite/propagation/dspace.js', 'vendor/satellite/propagation/gstime.js', 'vendor/satellite/propagation/SatRec.js']);
