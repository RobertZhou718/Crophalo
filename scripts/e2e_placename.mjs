// Crophalo's place-name suite in a real browser: after a place is chosen the setup's top line says "Finding the place name", then "Near Barrie, Ontario"; the coordinates are the small line, never the same thing twice;
// the service is asked once and only after the position has rested; a failure says "Your field"; the report bar follows. RULE: never loosen a check. Run: node scripts/e2e_placename.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_placename');
const { js, until, size, go, check, same, group, finish, sleep, send } = run;
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fetch = (f => async (url, ...r) => /\\/api\\//.test(String(url)) ? { ok: true, status: 200, json: async () => ({ ok: false, reason: 'stand-in' }), text: async () => '{"ok":false}' } : f(url, ...r))(window.fetch);` });
const HERE = path.dirname(fileURLToPath(import.meta.url)), fx = n => fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8');
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const BARRIE = JSON.stringify({ address: { city: 'Barrie', state: 'Ontario', country: 'Canada', country_code: 'ca' } });
const fresh = async (answer) => {
  await js(`try { sessionStorage.clear() } catch {}`).catch(() => {}); await size(1280); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); sessionStorage.clear()`); await go('/'); await sleep(500);
  await js(`window.__asked = []; window.fetch = (f => async (url, ...r) => { const u = String(url); if (/nominatim\\.openstreetmap\\.org\\/reverse/.test(u)) { window.__asked.push(u); ${answer} } if (/\\/api\\//.test(u)) return { ok: true, status: 200, json: async () => ({ ok: false, reason: 'stand-in' }), text: async () => '{"ok":false}' }; return f(url, ...r); })(window.fetch)`);
};
const head = () => js(`({ top: document.querySelector('#setupRoot .panel-name')?.textContent, small: document.querySelector('#setupRoot .panel-place span:not(.chip)')?.textContent })`);
const choose = (lat, lon) => js(`import('/js/wizard.js').then(w => { document.querySelector('#view-setup') && (import('/js/app.js').then(a => a.show('setup'))); w.setPlace({ lat: ${lat}, lon: ${lon}, name: '', place: '' }); })`);

await group('the name of a chosen place', async () => {
  await fresh(`return { ok: true, status: 200, json: async () => (${BARRIE}) };`);
  await choose(44.4031, -79.6454); await sleep(300);
  let h = await head();
  same('right after the tap: the top line says the name is being found and the small line holds the coordinates, once', [h.top, h.small], ['Finding the place name', '44.40310, -79.64540']);
  check('nothing is asked while the position may still move', (await js(`window.__asked.length`)) === 0);
  await choose(44.4031, -79.6454); await sleep(400); await choose(44.4031, -79.6454);
  await until(`document.querySelector('#setupRoot .panel-name')?.textContent === 'Near Barrie, Ontario'`, 6000);
  h = await head();
  same('the name comes: "Near Barrie, Ontario" on top, the coordinates under it', [h.top, h.small], ['Near Barrie, Ontario', '44.40310, -79.64540']);
  check('the service was asked once, with the position to four decimals, after the pin rested', (await js(`window.__asked.length`)) === 1 && /lat=44\.4031&lon=-79\.6454/.test(await js(`window.__asked[0]`)));
  check('the top line never holds a coordinate', !/\d\.\d/.test(h.top));
});
await group('no name found', async () => {
  await fresh(`return { ok: false, status: 503, json: async () => ({}) };`);
  await choose(10.5, 20.5); await until(`document.querySelector('#setupRoot .panel-name')?.textContent === 'Your field'`, 6000);
  const h = await head();
  same('the top line says "Your field" and the coordinates are the small line, once', [h.top, h.small], ['Your field', '10.50000, 20.50000']);
});
await group('a demo region and a named field are not asked', async () => {
  await fresh(`return { ok: true, status: 200, json: async () => (${BARRIE}) };`);
  await js(`import('/js/wizard.js').then(w => import('/js/app.js').then(a => { a.show('setup'); w.setPlace({ lat: 43.1, lon: -80.7, name: 'Oxford County', place: 'Ontario, Canada', demo: true }); }))`); await sleep(2200);
  const h = await head();
  check('a place that already has a name keeps it, and nothing is sent', h.top === 'Oxford County' && /Ontario, Canada · 43\.10000, -80\.70000/.test(h.small) && (await js(`window.__asked.length`)) === 0, JSON.stringify(h));
});
await finish();
