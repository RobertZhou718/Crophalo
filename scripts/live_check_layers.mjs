// By hand, never in the automatic run: a real browser opens the setup map with NASA's image server (GIBS) allowed through (E2E_LIVE_HOSTS), turns each of the four layers on over Ontario and checks that its tiles really arrive,
// that its legend names the NASA product and a day that is not after yesterday, and that a step earlier changes the day and still draws. Needs the internet. Checked by scripts/test_gibs.mjs (the same rules, offline). Run: node scripts/live_check_layers.mjs
import { openRun } from './e2e_lib.mjs';
process.env.E2E_LIVE_HOSTS = 'gibs.earthdata.nasa.gov';
const run = await openRun('live_check_layers');
const { js, until, go, check, same, group, finish, sleep } = run;
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
const drawn = id => js(`(() => { const imgs = [...document.querySelectorAll('.leaflet-tile-pane img')].filter(i => i.src.includes('/${id}/')); return [imgs.length, imgs.filter(i => i.complete && i.naturalWidth > 0).length]; })()`);
await group('layers', async () => {
  await acceptWelcome(); await go('/'); await until(`[...document.querySelectorAll('button')].some(b => /Find it on the map/.test(b.textContent))`);
  await js(`[...document.querySelectorAll('button')].find(b => /Find it on the map/.test(b.textContent)).click()`); await until(`document.querySelector('#mapx')`);
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 43.13, lon: -80.75, name: 'Oxford', country: 'CA' } }))`); await sleep(800);
  await js(`import('/js/mapbase.js').then(m => { m.baseNow().leaflet().setView([43.13, -80.75], 6, { animate: false }); return 1; })`);
  await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('.mapx-panel')`);
  await until(`[...document.querySelectorAll('.mapx-lrow input')].every(i => !i.disabled)`, 20000);
  check('NASA answers for all four layers: none is greyed', await js(`[...document.querySelectorAll('.mapx-lrow input')].every(i => !i.disabled)`));
  for (const [id, gibs] of [['ndvi', 'MODIS_Terra_NDVI_8Day'], ['smap', 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture'], ['rain', 'IMERG_Precipitation_Rate'], ['temp', 'MODIS_Terra_Land_Surface_Temp_Day']]) {
    await js(`document.querySelector('[data-layer=${id}]').click()`); await until(`document.querySelector('[data-legend=${id}]')`, 15000);
    await sleep(4500);
    const [asked, got] = await drawn(gibs), day = await js(`document.querySelector('[data-legend=${id}] [data-date]').value`), text = await js(`document.querySelector('[data-legend=${id}]').innerText`);
    console.log(`${id}: ${got} of ${asked} tiles drawn, image of ${day}`);
    check(`${id}: its tiles really arrive`, got >= 1, [asked, got]);
    check(`${id}: the legend names NASA and the day, and the day is not after yesterday`, /NASA /.test(text) && /Image of /.test(text) && day <= new Date(Date.now() - 864e5).toISOString().slice(0, 10), [day, text.slice(0, 120)]);
    await js(`document.querySelector('[data-legend=${id}] [data-step="-1"]').click()`); await sleep(3500);
    const earlier = await js(`document.querySelector('[data-legend=${id}] [data-date]').value`), [, got2] = await drawn(gibs);
    check(`${id}: a step earlier gives an earlier day that still draws`, earlier < day && got2 >= 1, [day, earlier, got2]);
    await js(`document.querySelector('[data-legend=${id}] [data-off]').click()`);
  }
});
await finish();
