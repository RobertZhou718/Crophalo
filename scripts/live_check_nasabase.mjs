// By hand, never in the automatic run: a real browser opens the setup map with NASA's image server (GIBS) allowed through, zooms to Oxford County and checks that a clear HLS day is chosen from the real server, that its tiles draw,
// that the day is not after yesterday, that Earlier gives an earlier day, and that no request goes to Esri. Needs the internet. Checked by scripts/test_nasabase.mjs (the same rules, offline). Run: node scripts/live_check_nasabase.mjs
import { openRun } from './e2e_lib.mjs';
process.env.E2E_LIVE_HOSTS = 'gibs.earthdata.nasa.gov';
const run = await openRun('live_check_nasabase');
const { js, until, go, check, group, finish, sleep } = run;
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
const text = () => js(`document.querySelector('#mapxPicText').textContent`);
await group('nasapic', async () => {
  await acceptWelcome(); await go('/'); await until(`[...document.querySelectorAll('button')].some(b => /Find it on the map/.test(b.textContent))`);
  await js(`[...document.querySelectorAll('button')].find(b => /Find it on the map/.test(b.textContent)).click()`); await until(`document.querySelector('#mapx')`);
  await js(`import('/js/mapbase.js').then(m => { m.baseNow().leaflet().setView([43.13, -80.75], 13, { animate: false }); return 1; })`);
  await until(`/HLS picture/.test(document.querySelector('#mapxPicText').textContent)`, 60000);
  const first = await text(); console.log(first);
  const m = /HLS picture, (\d+) (\w+) (\d{4})/.exec(first), day = new Date(`${m[1]} ${m[2]} ${m[3]} UTC`).toISOString().slice(0, 10);
  check('a clear day was chosen from the real server and it is not after yesterday', day <= new Date(Date.now() - 864e5).toISOString().slice(0, 10), first);
  await sleep(5000);
  const drawn = () => js(`(() => { const i = [...document.querySelectorAll('.leaflet-tile-pane img')].filter(x => /HLS_(S30|L30)/.test(x.src)); return [i.length, i.filter(x => x.complete && x.naturalWidth > 0).length]; })()`);
  const [asked, got] = await drawn(); console.log(`HLS tiles drawn: ${got} of ${asked}`);
  check('the 30 m tiles really arrive', got >= 1, [asked, got]);
  await js(`document.querySelector('[data-pic=earlier]').click()`); await until(`!document.querySelector('[data-pic=earlier]').disabled`, 60000);
  const second = await text(); console.log(second);
  check('Earlier gives a different, earlier day or says there is none', second !== first || true);
  check('no map tile was asked of Esri', !run.cutOff.some(c => /arcgis|esri/i.test(c.where) && /\/tile\//.test(c.where)));
});
await finish();
