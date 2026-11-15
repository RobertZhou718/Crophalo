// Crophalo's demo-fields suite in a real browser: each demo field on the home (Mead, Beltsville, Barrie) opens the setup with its answers chosen, every step can be passed with Next at 1440 and 390 px,
// step 3 says where the soil comes from and what is not known about water, and "See my field report" opens the report. RULE: never loosen a check. Run: node scripts/e2e_demo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_demo');
const { ROOT, js, until, tap, size, go, check, same, group, finish, sleep, send } = run;
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fetch = (f => async (url, ...r) => /\\/api\\/|nominatim|power\\.larc|open-meteo/.test(String(url)) ? new Promise(() => {}) : f(url, ...r))(window.fetch);` });   // outside services never answer here: only the setup is walked
const REGIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8'));
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const SOIL = { sand: 'sandy soil', loam: 'loam', silt: 'silt loam', clay: 'clay' };

for (const width of [1440, 390]) for (const [i, r] of REGIONS.entries()) await group(`${r.id} at ${width}`, async () => {
  await js(`try { sessionStorage.clear() } catch {}`).catch(() => {});
  await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); sessionStorage.clear()`); await go('/');
  await until(`document.querySelectorAll('#homeRegions .cover').length >= ${REGIONS.length}`);
  await js(`document.querySelectorAll('#homeRegions .cover')[${i}].click()`);
  await until(`!document.querySelector('#view-setup').hidden && document.querySelector('#wNext')`); await sleep(250);
  check('"Your field" is not an empty panel: the demo field\'s area is there (acres for a field in the United States), its corners and "Used in report"', await js(`(h => !!h && /\\d/.test(h.querySelector('#abFigure')?.textContent ?? '') && /corners/.test(h.textContent) && /Used in report/.test(h.textContent) && !!h.querySelector('svg.outline') && ${JSON.stringify(/canada/i.test(REGIONS[0].country) ? 'hectares' : 'acres')} !== '')(document.querySelector('#areaHost'))`));
  check('the setup has exactly one h1 and the place name is not said twice', await js(`document.querySelectorAll('#view-setup h1').length === 1 && !(document.querySelector('.panel-place').textContent.toLowerCase().includes(document.querySelector('.panel-name').textContent.toLowerCase()))`));
  same('the setup opens on the field, named, with the coordinates as the small line', await js(`[document.querySelector('.panel-name').textContent, /\\d\\.\\d{5}, -?\\d+\\.\\d{5}/.test(document.querySelector('.panel-place').textContent), /\\d\\.\\d/.test(document.querySelector('.panel-name').textContent)]`), [r.name, true, false]);
  const passed = [];
  for (let n = 0; n < 3; n++) {
    passed.push(await js(`!document.querySelector('#wNext').disabled && document.querySelector('#wNext').getAttribute('aria-disabled') !== 'true'`));
    if (n === 2) {
      const s3 = await js(`({ h: document.querySelector('#wHeading').textContent, soil: document.querySelector('#soilFromMap')?.textContent ?? '', water: document.querySelector('#waterUnknown')?.textContent ?? '', chosen: document.querySelector('input[name=feel]:checked')?.value ?? null, mark: !!document.querySelector('.soilcard .chip.warn') })`);
      check('step 3 says the soil comes from the soil map, in words, shows it chosen, and asks for no tap', s3.h === 'Water and soil' && s3.soil.startsWith(`Soil from the soil map: ${SOIL[r.defaults.soil_texture]}.`) && s3.chosen === r.defaults.soil_texture && !s3.mark, JSON.stringify(s3));
      check('water not known is said plainly and does not block; a known answer shows no such line', r.defaults.irrigation ? s3.water === '' : /^Not known: assumed rain-fed\./.test(s3.water), s3.water);
    }
    await tap('#wNext'); await sleep(200);
  }
  same('every step could be passed with Next', passed, [true, true, true]);
  same('the fourth step offers "See my field report", ready to press', await js(`[document.querySelector('#wNext').textContent, document.querySelector('#wNext').disabled]`), ['See my field report', false]);
  await tap('#wNext');
  check('the report opens', await until(`!document.querySelector('#view-report').hidden && document.querySelector('.rv-loading, #reportBar')`, 5000).then(() => true, () => false));
});

// the new home hands a demo field to the setup as { lat, lon, outline, name, place, region, demo, rotation, defaults, from }: the country code and the region id must come through
await group('the home\'s spot shape', async () => {
  await js(`try { sessionStorage.clear() } catch {}`).catch(() => {});
  await size(1280); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); sessionStorage.clear()`); await go('/'); await sleep(400);
  for (const r of REGIONS) {
    const out = await js(`(async () => { const w = await import('/js/wizard.js'), a = await import('/js/app.js'); let heard = null; document.addEventListener('crophalo:place', e => { heard = e.detail; }, { once: true });
      a.show('setup'); w.setPlace({ lat: ${r.lat}, lon: ${r.lon}, outline: ${JSON.stringify(r.outline ?? null)}, name: ${JSON.stringify(r.name)}, place: ${JSON.stringify(r.country)}, region: ${JSON.stringify(r.id)}, demo: true, rotation: ${JSON.stringify(r.rotation)}, defaults: ${JSON.stringify(r.defaults)}, from: 'region' });
      return { cc: w.currentState().loc.cc, region: heard?.region ?? null }; })()`);
    same(`${r.id}: the country code and the region id come through`, out, { cc: /canada/i.test(r.country) ? 'CA' : 'US', region: r.id });
  }
});
await finish();
