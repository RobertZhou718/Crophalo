// The cold-start suite, by hand and never in the automatic run: a real browser with an empty profile goes from the home screen to a finished report on the Mead field, with the real
// weather services let through (E2E_LIVE_HOSTS), and times it against one minute. Needs the internet and the Mead field in data/regions.json; says "not yet run" when it is not there.
// The throwaway copy has no Python, so the satellite lookups that need it answer "not read": this times the weather, the climate and the engine, which is the path every visit takes.
// Checked by itself (it is the check); the rules it serves are listed in docs/RULES-CHECKS.md. Run: node scripts/e2e_cold.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './e2e_lib.mjs';

const MINUTE = 60e3, WAIT = 150e3;   // the farmer's limit, and how long this run waits before it gives up and says so
const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8')), MEAD = regions.find(r => /\bmead\b/i.test(`${r.name} ${r.id} ${(r.aliases || []).join(' ')}`));
if (!MEAD) { console.log('e2e_cold: not yet run: the Mead field is not in data/regions.json'); process.exit(0); }

process.env.E2E_LIVE_HOSTS = 'power.larc.nasa.gov,api.open-meteo.com';   // the weather and the forecast; nothing else leaves the throwaway copy
const { openRun } = await import('./e2e_lib.mjs');
const run = await openRun('e2e_cold');
const { js, until, seen, tap, size, go, check, group, finish, sleep, send } = run;
// The copy has no Python, so the server's own lookups cannot answer there: from the first moment of every visit they are answered "not read" at the page, the way scripts/e2e_flow.mjs does it, so their refusals are not counted as errors of the page.
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, ...rest) => /[/]api[/](smaproot|cropsnear|imergrain|gracecell|ecopass|hlsndvi|dem|ndvihist)[?]/.test(String(u)) ? Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: false, reason: 'not read in this copy' }) }) : first(u, ...rest); })()" });
const WELCOME = JSON.stringify({ v: '2026-11-14', at: 'test' });
const stamp = (t0, label, marks) => { marks.push([label, Date.now() - t0]); };

await group('cold', async () => {
  const marks = [];
  await size(390); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`);   // a farmer who has already said yes to the welcome; nothing else is kept: no saved field, no cached weather
  const t0 = Date.now();
  await go('/'); await until(`document.querySelectorAll('#homeRegions .place-card').length > 0`, 30e3); stamp(t0, 'the home shows its cards', marks);
  const index = await js(`[...document.querySelectorAll('#homeRegions .place-card')].findIndex(c => /mead/i.test(c.textContent))`);
  check('cold: the home has a card for the Mead field', index >= 0, `cards: ${await js(`[...document.querySelectorAll('#homeRegions .place-card')].map(c => c.textContent.trim().slice(0, 30)).join(' | ')`)}`);
  if (index < 0) return;
  await js(`document.querySelectorAll('#homeRegions .place-card')[${index}].querySelector('.cover').click()`);
  for (let i = 0; i < 4 && await seen(`!!document.querySelector('#wNext')`, 5000); i++) { await tap('#wNext'); await sleep(120); }   // the four setup steps with the answers the card brings
  stamp(t0, 'the setup is passed and the report starts', marks);
  const done = await seen(`!!document.querySelector('#answer') && !document.querySelector('.rv-loading') && document.querySelector('#answer').textContent.trim().length > 40`, WAIT);
  stamp(t0, done ? 'the report is finished' : 'gave up waiting', marks);
  const ms = Date.now() - t0;
  console.log(`cold: ${marks.map(([l, t]) => `${l} at ${(t / 1e3).toFixed(1)} s`).join('; ')}`);
  check(`cold: the report on the Mead field finished within ${WAIT / 1e3} s`, done, `after ${ms} ms`);
  check('cold: from the home to a finished report in under one minute', done && ms < MINUTE, `${(ms / 1e3).toFixed(1)} s`);
  check('cold: the report names the field and gives a plan', await js(`new RegExp(${JSON.stringify(MEAD.name.split(',')[0])}, 'i').test(document.querySelector('#reportTitle')?.textContent || '') && /Try|Keep|Nothing we tested/.test(document.querySelector('#answer')?.textContent || '')`));
});
await finish();
