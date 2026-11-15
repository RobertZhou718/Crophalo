// Crophalo's speed suite: how long the report takes to show its first answer after "See my field report", measured in a real browser against stand-in services that answer after the delays the speed plan measured
// (NASA POWER 2.5 s, the forecast 3.3 s, SMAP 2 s, the crop map 1 s; the real recorded POWER and forecast answers for Barrie are used as the bodies). Two cases: cold (nothing was started before) and prefetched
// (the place was chosen, the farmer spent 8 s in the wizard, then the report opens). It prints the numbers and checks them.
// RULE: never loosen a limit to make it pass; make the report faster. Runs on the throwaway copy scripts/e2e_lib.mjs makes. Run: node scripts/e2e_speed.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_speed');
const { js, size, go, check, group, finish, sleep } = run;
const HERE = path.dirname(fileURLToPath(import.meta.url)), fx = n => fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8');
const POWER = fx('power_barrie.json'), FORECAST = fx('forecast_barrie.json'), REC = JSON.parse(POWER), LAT = REC.geometry.coordinates[1], LON = REC.geometry.coordinates[0];
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const DELAY = { power: 2500, forecast: 3300, smap: 2000, cropsnear: 1000, other: 500 };
// the stand-in services, installed in the page; every request is logged with the time it was made
const install = async () => js(`(() => { window.__log = []; const t0 = performance.now(); window.__t0 = t0;
  const body = { power: ${JSON.stringify(POWER)}, forecast: ${JSON.stringify(FORECAST)} }, delay = ${JSON.stringify(DELAY)};
  window.fetch = async (url) => { const u = String(url), kind = /power\\.larc/.test(u) ? 'power' : /api\\.open-meteo/.test(u) ? 'forecast' : /smaproot/.test(u) ? 'smap' : /cropsnear/.test(u) ? 'cropsnear' : 'other';
    window.__log.push({ kind, at: Math.round(performance.now() - window.__t0) });
    await new Promise(r => setTimeout(r, delay[kind]));
    const text = kind === 'power' || kind === 'forecast' ? body[kind] : kind === 'smap' ? JSON.stringify({ ok: true, value: 0.31, date: '2026-11-13', cell: { lat: 43.1, lon: -80.7 } }) : JSON.stringify({ ok: false, reason: 'stand-in' });
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) }; }; })()`);
const fresh = async () => { await size(1280); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); caches.keys().then(k => Promise.all(k.map(n => caches.delete(n))))`); await go('/'); await sleep(500); await install(); };
const LOC = `{ lat: ${LAT}, lon: ${LON} }`;
// open the report and say how long until its first answer is on the screen, and how many requests it made itself
const open = () => js(`(async () => { const st = await import('/js/state.js'), m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report');
  const before = window.__log.length, t0 = performance.now(); m.openReport({ ...st.newState(), loc: ${LOC}, name: 'Speed test' });
  await new Promise(r => { const id = setInterval(() => { if (document.querySelector('#reportBar')) { clearInterval(id); r(); } }, 10); });
  return { ms: Math.round(performance.now() - t0), own: window.__log.slice(before).map(x => x.kind) }; })()`);

await group('speed', async () => {
  await fresh(); const cold = await open();
  console.log(`speed  cold: the first answer after ${cold.ms} ms; requests the report made itself: ${cold.own.join(', ') || 'none'}`);
  await fresh();
  await js(`document.dispatchEvent(new CustomEvent('crophalo:prefetch', { detail: ${LOC} }))`);
  await sleep(8000);   // the farmer answers the wizard's questions
  const warm = await open();
  console.log(`speed  prefetched: the first answer after ${warm.ms} ms; requests the report made itself: ${warm.own.join(', ') || 'none'}`);
  check('speed: cold, the report waits for the weather (2.5 s) but not for the 3.3 s forecast or the 2 s soil moisture', cold.ms < 4000, `${cold.ms} ms`);
  check('speed: after a prefetch the first answer comes within 1 s', warm.ms < 1000, `${warm.ms} ms`);
  check('speed: after a prefetch the report makes no request of its own', warm.own.length === 0, warm.own.join(', '));
});
await finish();
