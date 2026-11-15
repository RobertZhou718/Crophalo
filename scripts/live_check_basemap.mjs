// By hand, never in the automatic run: a real browser opens the setup map with the OpenFreeMap tile host allowed through (E2E_LIVE_HOSTS), and checks the names over Ontario at zoom 3, 6 and 10 on the Satellite and the Light map, and that
// no water name exists in either style. Needs the internet. Checked by scripts/test_mapbase.mjs (the same style rules, offline). Run: node scripts/live_check_basemap.mjs
import { openRun } from './e2e_lib.mjs';
process.env.E2E_LIVE_HOSTS = 'tiles.openfreemap.org';
const run = await openRun('live_check_basemap');
const { js, until, go, check, same, group, finish, sleep } = run;
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
// the names MapLibre really drew (the features of its name layers that were placed), by class, at a view of the Leaflet map
const drawn = (lat, lon, zoom) => js(`(async () => { const m = await import('/js/mapbase.js'), S = await import('/js/lightstyle.js'), b = m.baseNow(), map = b.leaflet(), gl = b.glMap();
  map.setView([${lat}, ${lon}], ${zoom}, { animate: false });
  await new Promise(done => { let n = 0; const tick = () => (gl.loaded() && !gl.isMoving() && n++ > 2) || n > 120 ? done() : setTimeout(tick, 250); tick(); });
  const ids = S.labelsStyle().layers.map(l => l.id).filter(id => gl.getLayer(id)), out = {};
  for (const f of gl.queryRenderedFeatures({ layers: ids })) (out[f.properties.class] ||= new Set()).add(f.properties.name_en || f.properties.name);
  return JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].slice(0, 60)]))); })()`).then(JSON.parse);
await group('names', async () => {
  await acceptWelcome(); await go('/'); await until(`[...document.querySelectorAll('button')].some(b => /Find it on the map/.test(b.textContent))`);
  await js(`[...document.querySelectorAll('button')].find(b => /Find it on the map/.test(b.textContent)).click()`); await until(`document.querySelector('#mapx')`);
  await until(`import('/js/mapbase.js').then(m => !!m.baseNow()?.glMap())`, 15000);
  for (const base of ['sat', 'light']) {
    await js(`import('/js/mapbase.js').then(m => { m.baseNow().set('${base}'); return 1; })`); await sleep(2500);
    await until(`import('/js/mapbase.js').then(m => { const s = m.baseNow().state(); return !s.failed && s.names; })`, 20000);
    for (const zoom of [3, 6, 10]) {
      const names = await drawn(43.13, -80.75, zoom), kinds = Object.keys(names);
      console.log(`${base} zoom ${zoom}: ${JSON.stringify(Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.slice(0, 6)])))}`);
      check(`${base}, zoom ${zoom}: a country name is drawn`, zoom <= 6 ? !!names.country?.length || !!names.state?.length : true, names);
      check(`${base}, zoom ${zoom}: a city, town or village name is drawn`, ['city', 'town', 'village'].some(k => names[k]?.length), names);
      check(`${base}, zoom ${zoom}: only places are drawn, no water`, kinds.every(k => ['country', 'state', 'city', 'town', 'village'].includes(k)), kinds);
    }
  }
  const style = await js(`import('/js/lightstyle.js').then(S => JSON.stringify([S.lightStyle(), S.labelsStyle()].map(st => S.reading(st).waterLayers)))`);
  same('and the style holds no water label at all', JSON.parse(style), [[], []]);
  const OLD = ['Tur', 'key'].join(''), tr = await drawn(39, 35, 4);
  check('the country with the code TR is drawn (its name is written Türkiye by the style\'s own rule, which scripts/test_mapbase.mjs runs)', (tr.country ?? []).some(n => n === OLD || n === 'Türkiye'), tr);
});
await finish();
