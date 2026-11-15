// By hand, never in the automatic run: a real browser opens the setup map with NASA's image server (GIBS) allowed through, opens the demo field (the region in data/regions.json that carries an outline), and checks that its outline is drawn and in use (the Area card has the real
// hectares), that the pin is at its centre, and saves pictures of the NASA 30 m image with the outline on it (E2E_SHOTS names the folder). Needs the internet. Checked by scripts/test_mapplaces.mjs (the data). Run: E2E_SHOTS=folder node scripts/live_check_demofield.mjs
import { openRun } from './e2e_lib.mjs';
import fs from 'node:fs';
process.env.E2E_LIVE_HOSTS = 'gibs.earthdata.nasa.gov';
const R = JSON.parse(fs.readFileSync(new URL('../data/regions.json', import.meta.url), 'utf8')).find(r => r.outline);
if (!R) { console.log('No region in data/regions.json carries an outline yet, so there is no demo field to check.'); process.exit(0); }
const run = await openRun('live_check_demofield');
const { js, until, go, check, group, finish, sleep, shot } = run;
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
await group('demofield', async () => {
  await acceptWelcome(); await go('/'); await until(`[...document.querySelectorAll('button')].some(b => /Find it on the map/.test(b.textContent))`);
  await js(`[...document.querySelectorAll('button')].find(b => /Find it on the map/.test(b.textContent)).click()`); await until(`document.querySelector('#mapx')`);
  await js(`document.addEventListener('crophalo:area', e => { window.__area = e.detail; })`);
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: ${R.lat}, lon: ${R.lon}, name: ${JSON.stringify(R.name)}, country: ${JSON.stringify(R.country ?? '')}, demo: true } }))`);
  await until(`window.__area && window.__area.pts && window.__area.pts.length > 3`, 15000);
  const area = await js(`window.__area`);
  check('the demo field is drawn and put in use, with its real hectares', Math.abs(area.ha - R.area_ha) < 0.6 && area.pts.length === R.outline.length - 1, area.ha);
  check('the outline is on the map and the pin is at its centre', await js(`!!document.querySelector('path.mapx-ants') && import('/js/mapx.js').then(m => { const s = m.mapState(); return Math.abs(s.pin.lat - ${R.lat}) < 1e-6 && Math.abs(s.pin.lon - ${R.lon}) < 1e-6 && s.ring.length === ${R.outline.length - 1}; })`));
  await until(`/HLS picture/.test(document.querySelector('#mapxPicText').textContent)`, 60000).catch(() => {});
  await sleep(6000);
  console.log(JSON.stringify(await js(`import('/js/nasabase.js').then(n => n.pick({ lat: ${R.lat}, lon: ${R.lon} }))`)));
  console.log(await js(`document.querySelector('#mapxPicText').textContent`));
  await shot('demo-field-map');
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setZoom(16, { animate: false }) && 1)`); await sleep(5000);
  await shot('demo-field-map-close');
});
await finish();
