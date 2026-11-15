// Crophalo's "Change and see" suite in a real browser: on the report, a narrow column at the left on a wide screen (sticky under the bars, open), a fold at the top on a phone; changing an answer or a slider works the report out again at once
// with no new lookup; "Reset to my answers" brings the first report back; open folds stay open; the saved answers are never changed. RULE: never loosen a check. Run: node scripts/e2e_filter.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_filter');
const { ROOT, js, until, size, go, check, group, finish, sleep } = run;
const fx = n => fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', n), 'utf8');
const POWER = fx('power_barrie.json'), FORECAST = fx('forecast_barrie.json'), REC = JSON.parse(POWER), LAT = REC.geometry.coordinates[1], LON = REC.geometry.coordinates[0];
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const STUB = `window.__log = []; window.fetch = (f => async (url, ...r) => { const u = String(url), json = t => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => t, json: async () => JSON.parse(t) });
  const kind = /power\\.larc/.test(u) ? 'power' : /archive-api/.test(u) ? 'cold' : /api\\.open-meteo\\.com/.test(u) ? 'forecast' : /nominatim/.test(u) ? 'name' : /\\/api\\//.test(u) ? 'api' : '';
  if (!kind) return f(url, ...r);
  window.__log.push(kind);
  if (/crophist|\\/api\\/dem/.test(u)) return new Promise(() => {});
  if (kind === 'power') return json(${JSON.stringify(POWER)}); if (kind === 'forecast') return json(${JSON.stringify(FORECAST)});
  return json('{"ok":false,"reason":"stand-in"}'); })(window.fetch);`;
await run.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
const open = async width => {
  await js(`try { sessionStorage.clear() } catch {}`).catch(() => {}); await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); sessionStorage.clear(); caches.keys().then(k => Promise.all(k.map(n => caches.delete(n))))`); await go('/'); await sleep(600);
  await js(`import('/js/wizard.js').then(w => import('/js/app.js').then(a => { a.show('setup'); w.setPlace({ lat: ${LAT}, lon: ${LON}, name: 'Test field', place: 'Canada' }); }))`);
  await until(`!document.querySelector('#view-setup').hidden && !!document.querySelector('#placeRead')`, 8000); await sleep(800);
  await js(`import('/js/wizard.js').then(w => import('/js/state.js').then(st => import('/js/report.js').then(m => import('/js/app.js').then(a => { a.show('report'); const b = w.currentState(); m.openReport({ ...st.newState(), loc: { ...b.loc, cc: 'CA' }, name: 'Test field', soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }); }))))`);
  await until(`!!document.querySelector('#lfFilter')`, 30000).catch(async e => { console.log(await js(`document.querySelector('#reportRoot')?.innerText.slice(0, 300)`)); console.log(await js(`import('/js/engine-client.js').then(async m => { try { const e = await m.engineLoader(); return Object.keys(e).join() } catch (x) { return 'ERR ' + x } })`)); console.log(JSON.stringify(await run.consoleErrors?.() ?? '')); throw e; }); await sleep(500);
};
const head = () => js(`(document.querySelector('.rv-letter')?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 1400)`);

await group('wide screen: a narrow column at the left, open, sticky; a change redraws the report with no new lookup', async () => {
  await open(1280);
  check('the panel is open at the left of the letter, narrow, under the report bar', await js(`(f => { const l = document.querySelector('.rv-letter').getBoundingClientRect(), r = f.getBoundingClientRect(); return f.open && r.right <= l.left + 1 && r.width > 200 && r.width < 320 && getComputedStyle(f).position === 'sticky'; })(document.querySelector('#lfFilter'))`));
  check('it is named "Change and see" and carries the quiet line and a reset that is off', await js(`/Change and see/.test(document.querySelector('#lfFilter summary').textContent) && /Changed here only: your saved answers stay\\./.test(document.querySelector('#lfFilter').textContent) && document.querySelector('#ffReset').disabled`));
  const asked0 = await js(`window.__log.length`), before = await head(), saved = await js(`JSON.stringify(import('/js/wizard.js').then(w => w.currentState().farm))`).catch(() => ''), savedFarm = await js(`import('/js/wizard.js').then(w => JSON.stringify(w.currentState().farm))`);
  await js(`document.querySelector('#ff-water-full').click()`); await sleep(1200);
  check('picking "Irrigated as needed" works the report out again: the tile stays on, the reset turns on, no new lookup was asked', await js(`document.querySelector('#ff-water-full').checked && !document.querySelector('#ffReset').disabled`) && await js(`window.__log.length`) === asked0, `${asked0} -> ${await js('window.__log.length')}`);
  await js(`document.querySelector('#ff-matters-income').click()`); await sleep(1200);
  await js(`(i => { i.value = -30; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })(document.querySelector('#ff-rain'))`); await sleep(1400);
  check('the rain slider says its words and the report follows (the figures are not the first ones)', await js(`document.querySelector('#ff-rain-text').textContent === '-30% rain'`) && (await head()) !== before);
  await run.shot?.('filter-1280');
  check('the farmer\'s saved answers are not changed', await js(`import('/js/wizard.js').then(w => JSON.stringify(w.currentState().farm))`) === savedFarm);
  await js(`document.querySelector('#ffReset').click()`); await sleep(1400);
  check('"Reset to my answers" brings the first report back: the same words, the first answers on, the reset off again', (await head()) === before && await js(`!document.querySelector('#ff-water-full').checked && document.querySelector('#ffReset').disabled && document.querySelector('#ff-rain').value === '0'`));
  // a fold that was open stays open when a change redraws
  await js(`document.querySelectorAll('.rv-letter details[id]')[0]?.setAttribute('open', '')`);
  const id = await js(`document.querySelector('.rv-letter details[open][id]')?.id ?? ''`);
  await js(`document.querySelector('#ff-tillage-notill').click()`); await sleep(1300);
  check('the open fold is still open after the change', !!id && await js(`document.getElementById(${JSON.stringify(id)})?.open === true`), id);
});
await group('phone: a fold at the top named "Change and see", closed at first', async () => {
  await open(375);
  check('it sits above the letter, closed, and opens with a tap', await js(`(f => { const l = document.querySelector('.rv-letter').getBoundingClientRect(), r = f.getBoundingClientRect(); return !f.open && r.bottom <= l.top + 1 && /Change and see/.test(f.textContent); })(document.querySelector('#lfFilter'))`));
  await js(`document.querySelector('#lfFilter summary').click()`); await sleep(300);
  check('opened, its controls are inside the screen and the tap places are 44 px', await js(`(f => f.open && [...f.querySelectorAll('.choice, #ffReset')].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.height >= 43.5; }))(document.querySelector('#lfFilter'))`));
  await js(`document.querySelector('#ff-water-limited').click()`); await sleep(1300);
  check('a change on the phone keeps the fold open and redraws the report', await js(`document.querySelector('#lfFilter').open && document.querySelector('#ff-water-limited').checked`));
  await run.shot?.('filter-375');
});
await finish();
