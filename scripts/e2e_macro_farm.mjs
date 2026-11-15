// The browser suite of the two 3D scenes' wiring in My farm (the sketch that fills in as 3D builds, and "Play the day"): the page hands in its own scene loader, and the board calls the scenes at the right moments:
// the sketch as soon as the 3D node exists, Play the day once 3D is ready, both disposed when 3D closes; with the scenes off, or a scene file missing, 3D opens exactly as it did.
// RULE: never loosen a check here to make it pass without a written farming reason beside it. Run: node scripts/e2e_macro_farm.mjs
import { openRun } from './e2e_lib.mjs';
import { realReport } from './fixtures/engine-plans.mjs';

const run = await openRun('macro_farm');
const { js, until, tap, size, go, check, same, finish, sleep, send } = run;
const group = (label, body) => run.group(label, async () => { await js(`import('/js/welcome.js').then(m => localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: 'test' })))`); await go('/'); await body(); });
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, o) => /^[/]api[/]hlsndvi|ndvihist|gracecell|ecopass|crophist|hlsbox/.test(String(u)) ? Promise.reject(new Error('down')) : first(u, o); })();" });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const was = C.prototype.getParameter; C.prototype.getParameter = function (p) { return p === 37446 && this.canvas && !this.canvas.isConnected ? 'ANGLE (Test graphics chip)' : was.call(this, p); }; } })()` });
const { report: REAL } = await realReport();
const text = sel => js(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim().replace(/\\s+/g, ' ') ?? null`);
const open = async () => {
  await js(`import('/js/farm.js').then(m => { window.__farm = m; m.setStartView?.('map'); window.__res = m.addFromReport(${JSON.stringify(REAL)}); document.getElementById("navFarm").click(); })`);
  await until(`document.querySelector('#fwFinding')?.textContent.length > 5 && !document.querySelector('#view-farm').hidden`, 15000); await sleep(300);
};
// a 3D look that builds in a moment, as the page's own function would, and two scene stand-ins that write down what they were asked
const setUp = async (loaderCode) => {
  await js(`window.__log = []; window.__farm.setView3d((data, node) => new Promise(done => setTimeout(() => { window.__log.push('3d ready'); node.dataset.ready = '1'; done({ ok: true, update() {}, dispose() { window.__log.push('3d disposed'); } }); }, 400)))`);
  await js(loaderCode);
};
const LOADER = `window.__farm.setScenes(true, name => name === 'skeleton' ? { skeletonFades: node => { window.__log.push('sketch on ' + (node.id || node.className) + ' ready=' + (node.dataset.ready || '0')); return { dispose() { window.__log.push('sketch disposed'); } }; } } : { playDay: (handle, node) => { window.__log.push('play the day ' + (handle && handle.ok ? 'with the handle' : 'without')); return { dispose() { window.__log.push('play disposed'); } }; } })`;
await group('scenes', async () => {
  await size(1280); await open();
  await setUp(LOADER);
  await tap('#fwThreeBtn'); await until(`document.querySelector('#fw3d').dataset.ready === '1'`, 8000); await sleep(300);
  const log = await js('window.__log');
  check('the sketch is called as soon as the 3D node exists, before 3D is ready', /^sketch on /.test(log[0]) && /ready=0/.test(log[0]), log);
  check('Play the day is called once 3D is ready, with its handle', log.includes('play the day with the handle') && log.indexOf('3d ready') < log.indexOf('play the day with the handle'), log);
  await tap('#fwMapBtn'); await sleep(300);
  const after = await js('window.__log');
  check('both scenes are disposed when 3D closes', after.includes('sketch disposed') && after.includes('play disposed') && after.includes('3d disposed'), after);
});
await group('scenes off', async () => {
  await size(1280); await open();
  await setUp(`window.__farm.setScenes(false, name => { window.__log.push('asked ' + name); return null; })`);
  await tap('#fwThreeBtn'); await until(`document.querySelector('#fw3d').dataset.ready === '1'`, 8000); await sleep(200);
  same('with the scenes off nothing is asked for, and 3D opens as it did', [await js('window.__log'), await js(`document.querySelector('#fwThreeBtn').getAttribute('aria-pressed')`)], [['3d ready'], 'true']);
});
await group('a scene file missing', async () => {
  await size(1280); await open();
  await setUp(`window.__farm.setScenes(true, name => Promise.reject(new Error('no file')))`);
  await tap('#fwThreeBtn'); await until(`document.querySelector('#fw3d').dataset.ready === '1'`, 8000); await sleep(300);
  same('a missing scene changes nothing: 3D opens, nothing else is logged', await js('window.__log'), ['3d ready']);
  await tap('#fwMapBtn'); await sleep(200);
  same('and 3D closes cleanly', await js(`document.querySelector('#fwMapBtn').getAttribute('aria-pressed')`), 'true');
});
// the hooks of the screen changes: the 3D swap, the way into Land history (the past, from the left) and the way back; a motion module may hold the change, and the board waits for it
await group('hooks', async () => {
  await size(1280); await open();
  await js(`window.__log = []; window.__held = null; import('/js/hooks.js').then(m => m.setHook('farmView', (update, info) => { window.__log.push(info.to + (info.from ? ' from ' + info.from : '')); if (info.to === 'map') { window.__held = update; return true; } return false; }))`);
  await js(`window.__farm.setView3d((data, node) => ({ ok: true, update() {}, dispose() { window.__log.push('3d disposed'); } }))`);
  await tap('#fwThreeBtn'); await sleep(400);
  same('opening 3D goes through the hook, with its target', (await js('window.__log'))[0], '3d');
  await tap('#fwMapBtn'); await sleep(300);
  check('the way back to the Map goes through the hook, and while a module holds the change 3D is still on screen', (await js('window.__log')).includes('map') && await js(`!document.querySelector('#fw3d').hidden`) && await js(`!!window.__held`), await js('window.__log'));
  await js(`window.__held()`); await sleep(200);
  same('when the module lets the change go the Map is back and 3D is let go of', [await js(`!document.querySelector('#fwMap').hidden && document.querySelector('#fw3d').hidden`), (await js('window.__log')).includes('3d disposed')], [true, true]);
  await js(`window.__log = []; document.querySelector('#fwDetailsBtn').click()`); await sleep(300); await js(`document.querySelector('[data-act=history]').click()`); await sleep(400);
  same('Land history comes in through the hook as the past, from the board', (await js('window.__log'))[0], 'history from board');
  await js(`document.querySelector('#fwHistoryBack').click()`); await sleep(300);
  same('and goes back through it to the board', [(await js('window.__log')).at(-1), await js(`document.querySelector('#fwHistory').hidden`)], ['board from history', true]);
});
await finish();
