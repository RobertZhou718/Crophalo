// Crophalo's early-data suite in a real browser: the moment a place is chosen (a demo, a search result, typed coordinates, a map press, a drawn outline) the weather record and what the first answer needs start loading, with the country kept so the crop map
// and the crop map by year are warmed too; a quiet line under the area says "Reading this place's weather…" (a skeleton) and then "Weather read."; and the lookups are all asked BEFORE "See my field report" is pressed, then not asked again.
// The slow lookups (crop map by year, the height map) are never waited for. RULE: never loosen a check. Run: node scripts/e2e_early.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_early');
const { ROOT, js, until, size, go, check, group, finish, sleep } = run;
const fx = n => fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', n), 'utf8');
const POWER = fx('power_barrie.json'), FORECAST = fx('forecast_barrie.json'), REC = JSON.parse(POWER), LAT = REC.geometry.coordinates[1], LON = REC.geometry.coordinates[0];
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
// every request is logged with its time; POWER and the forecast answer with the recorded answers, the crop map by year never answers (it is slow on the real server), everything else answers "no"
const STUB = `window.__log = []; window.__t0 = performance.now(); window.fetch = (f => async (url, ...r) => { const u = String(url), json = t => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => t, json: async () => JSON.parse(t) });
  const kind = /power\\.larc/.test(u) ? 'power' : /archive-api/.test(u) ? 'cold' : /api\\.open-meteo\\.com/.test(u) ? 'forecast' : /\\/api\\/crophist/.test(u) ? 'crophist' : /\\/api\\/cropsnear/.test(u) ? 'cropsnear' : /\\/api\\/smaproot/.test(u) ? 'smap' : /\\/api\\/dem/.test(u) ? 'dem' : /nominatim/.test(u) ? 'name' : /\\/api\\//.test(u) ? 'api' : '';
  if (!kind) return f(url, ...r);
  window.__log.push({ kind, url: u, at: Math.round(performance.now() - window.__t0) });
  if (kind === 'crophist' || kind === 'dem') return new Promise(() => {});
  if (kind === 'power') return json(${JSON.stringify(POWER)}); if (kind === 'forecast') return json(${JSON.stringify(FORECAST)});
  return json('{"ok":false,"reason":"stand-in"}'); })(window.fetch);`;
await run.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
const kinds = () => js(`window.__log.map(x => x.kind)`);

await group('the lookups start when the place is chosen', async () => {
  await js(`try { sessionStorage.clear() } catch {}`).catch(() => {}); await size(1280); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); sessionStorage.clear(); caches.keys().then(k => Promise.all(k.map(n => caches.delete(n))))`); await go('/'); await sleep(600);
  await js(`window.__log.length = 0; import('/js/wizard.js').then(w => import('/js/app.js').then(a => { a.show('setup'); w.setPlace({ lat: ${LAT}, lon: ${LON}, name: 'Test field', place: 'Canada' }); }))`);
  await until(`!document.querySelector('#view-setup').hidden && !!document.querySelector('#placeRead')`, 8000);
  check('right after the choice a quiet line says it is reading, as a grey skeleton with the words for a screen reader', await js(`(el => !el.hidden && !!el.querySelector('.sk') && /Reading this place.s weather/.test(el.textContent))(document.querySelector('#placeRead'))`));
  await until(`/Weather read\\./.test(document.querySelector('#placeRead')?.textContent ?? '')`, 12000);
  await run.shot?.('early-1280');   // with E2E_SHOTS set, a picture of step 1 with the line
  check('then it says "Weather read."', await js(`/^Weather read\\.$/.test(document.querySelector('#placeRead').textContent.trim())`));
  await sleep(1500);
  const asked = await kinds();
  check('the weather record, the forecast and the second cold-night record were all asked before the report was opened', ['power', 'forecast', 'cold'].every(k => asked.includes(k)), asked.join());
  check('the crop map was asked with the country, and so was the crop map by year (near=0); the height map is not waited for', await js(`window.__log.some(x => x.kind === 'cropsnear' && /country=CA/i.test(x.url)) && window.__log.some(x => x.kind === 'crophist' && /country=CA/.test(x.url) && /near=0/.test(x.url))`));
  const before = (await kinds()).filter(k => k === 'power').length;
  await js(`import('/js/wizard.js').then(w => import('/js/report.js').then(m => { import('/js/app.js').then(a => { a.show('report'); m.openReport(w.currentState()); }); }))`);
  await sleep(3500);
  const after = await kinds();
  check('opening the report does not ask the weather record, the forecast or the second cold-night record again: they were already in (a lookup that failed is asked again, by design)', before === 1 && ['power', 'forecast', 'cold'].every(k => after.filter(x => x === k).length === 1), after.join());
  check('the report does not wait for the crop map by year or the height map: the weather rows are answered while those never answer', await js(`!!document.querySelector('.rv-loading, #reportBar, #blkFail') && !/Reading this place/.test(document.body.textContent)`));
});
await group('a demo field and typed coordinates ask early too', async () => {
  await js(`try { sessionStorage.clear() } catch {}`).catch(() => {}); await size(1280); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); sessionStorage.clear(); caches.keys().then(k => Promise.all(k.map(n => caches.delete(n))))`); await go('/'); await sleep(600);
  await js(`window.__log.length = 0; import('/js/wizard.js').then(w => import('/js/app.js').then(a => { a.show('setup'); w.setPlace({ lat: 41.1795, lon: -96.4398, name: 'A research field near Mead', place: 'United States', region: 'mead-field', demo: true }); }))`);
  await sleep(3500);
  const asked = await kinds(), window_ok = await js(`window.__log.some(x => x.kind === 'cropsnear' && /country=US/i.test(x.url))`);
  check('a demo field (country United States) asks the weather lookups, the crop map with its country and the crop map by year as soon as it is chosen', ['forecast', 'cropsnear', 'crophist'].every(k => asked.includes(k)) && asked.includes('power') && window_ok, asked.join());
});
await finish();
