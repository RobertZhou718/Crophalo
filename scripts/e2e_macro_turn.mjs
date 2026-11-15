// Crophalo's page-turn suite in a real browser: THE CHAPTER TURN (a report tab), STEP TURN (between the setup's steps) and THE GENERIC TURN (between the calm screens), at Full, Less and Still.
// What it holds to: Full uses one view transition with the direction as its type and the panel or column as the only named part; Less is a plain cross-fade with no name; Still is today's swap (no transition at all);
// a press or key leaves the new screen complete; the screens' content is the same with and without the turns; and the report, setup and My farm are not turned between each other.
// RULE: never loosen a check to make it pass. Runs on the throwaway copy scripts/e2e_lib.mjs makes. Run: node scripts/e2e_macro_turn.mjs   (E2E_ONLY=tabs,steps,views,input picks groups)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_macro_turn');
const { js, until, tap, press, size, go, check, same, group, finish, sleep, send } = run;
await send('Network.enable', {});
const HERE = path.dirname(fileURLToPath(import.meta.url)), fx = n => fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8');
const POWER = fx('power_barrie.json'), FORECAST = fx('forecast_barrie.json'), REC = JSON.parse(POWER), LAT = REC.geometry.coordinates[1], LON = REC.geometry.coordinates[0];
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
// the stand-in services, as scripts/e2e_macro_report.mjs has them: POWER answers after 1.5 s, the others after 150 ms
const stubs = `(() => { window.__log = [];
  const body = { power: ${JSON.stringify(POWER)}, forecast: ${JSON.stringify(FORECAST)} }, delay = { power: 1500, forecast: 150, smap: 150, cropsnear: 150, other: 150 };
  window.fetch = async url => { const u = String(url), kind = /power\\.larc/.test(u) ? 'power' : /api\\.open-meteo/.test(u) ? 'forecast' : /smaproot/.test(u) ? 'smap' : /cropsnear/.test(u) ? 'cropsnear' : 'other';
    window.__log.push(kind); await new Promise(r => setTimeout(r, delay[kind]));
    const text = kind === 'power' || kind === 'forecast' ? body[kind] : kind === 'smap' ? JSON.stringify({ ok: true, value: 0.31, date: '2026-11-13', cell: { lat: 43.1, lon: -80.7 } }) : JSON.stringify({ ok: false, reason: 'stand-in' });
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) }; }; })()`;
// a spy on the browser's view transitions: how many, with which types, and which names were set on the page at that moment
const SPY = `(() => { window.__vt = []; const real = document.startViewTransition.bind(document);
  document.startViewTransition = arg => { const names = [...document.querySelectorAll('*')].filter(e => e.style.viewTransitionName).map(e => e.style.viewTransitionName); window.__vt.push({ types: arg && typeof arg === 'object' ? arg.types : null, names }); return real(arg); }; })()`;
const vts = () => js('window.__vt');
const fresh = async (motion = 'full') => {
  await size(1280); await go('/');
  await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); localStorage.setItem('crophalo.settings.v1', ${JSON.stringify(JSON.stringify({ motion }))})`);
  await go('/'); await until(`!!document.querySelector('link[href*="macro.css"]')`, 8000); await sleep(600);
  await js(stubs); await js(SPY);
};
const openReport = async () => { await js(`(async () => { const st = await import('/js/state.js'), m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report'); m.openReport({ ...st.newState(), loc: { lat: ${LAT}, lon: ${LON} }, name: 'Barrie test' }); })().catch(e => { window.__openErr = String(e && e.stack || e); })`); try { await until(`!!document.querySelector('#tab-weather') && !!document.querySelector('.rv-main')`, 20000); } catch (e) { console.log('e2e_macro_turn: the report did not open: ' + JSON.stringify(await js(`({ err: window.__openErr || null, view: [...document.querySelectorAll('.view')].filter(v => !v.hidden).map(v => v.id), text: (document.querySelector('#view-report')?.innerText || '').slice(0, 300), log: window.__log })`))); throw e; } await sleep(1500); };
const panel = () => js(`document.querySelector('.rv-main')?.innerText.length ?? 0`);

await group('tabs: the report\'s tabs turn like pages', async () => {
  await fresh('full'); await openReport(); await js('window.__vt = []');
  const before = await js(`document.querySelector('.rv-main').innerText`);
  await tap('#tab-weather'); await sleep(800);
  let v = await vts();
  check('tabs: a tab later in the list is ONE view transition with the type "forward" and only the panel named', v.length === 1 && JSON.stringify(v[0].types) === '["forward"]' && JSON.stringify(v[0].names) === '["panel"]', v);
  check('tabs: the new tab is complete: its own content, its tab selected, the focus on it', await js(`document.querySelector('#tab-weather').getAttribute('aria-selected') === 'true' && document.activeElement.id === 'tab-weather' && document.querySelector('.rv-main').innerText !== ${JSON.stringify(before)}`), await js(`({ selected: document.querySelector('#tab-weather').getAttribute('aria-selected'), focus: document.activeElement?.id || document.activeElement?.tagName, changed: document.querySelector('.rv-main').innerText.length })`));
  await js('window.__vt = []'); await tap('#tab-options'); await sleep(800); v = await vts();
  check('tabs: going back is the type "back"', v.length === 1 && JSON.stringify(v[0].types) === '["back"]', v);
  check('tabs: after the turn no name is left on the page and the panel is whole', await js(`![...document.querySelectorAll('*')].some(e => e.style.viewTransitionName) && !document.documentElement.dataset.macroVt`) && await panel() > 50);
  await js('window.__vt = []'); await tap('#tab-options'); await sleep(300);
  check('tabs: pressing the tab that is already open turns nothing', (await vts()).length === 0);
});

await group('input: a press or key leaves the new tab complete', async () => {
  await fresh('full'); await openReport(); await js('window.__vt = []');
  await tap('#tab-weather'); await sleep(60); await press('Shift'); await sleep(250);
  check('input: 60 ms into the turn a key leaves the weather tab complete, with no transition still running', await js(`document.querySelector('#tab-weather').getAttribute('aria-selected') === 'true' && document.querySelector('.rv-main').innerText.length > 50 && !document.documentElement.dataset.macroVt && !document.getAnimations().some(a => /view-transition/.test(a.effect?.pseudoElement || ''))`));
  await tap('#tab-satellites'); await tap('#tab-field'); await sleep(900);
  check('input: a second tab press goes on at once: the last tab is the one shown', await js(`document.querySelector('#tab-field').getAttribute('aria-selected') === 'true'`));
});

await group('less and still: a cross-fade, and today\'s swap', async () => {
  await fresh('less'); await openReport(); await js('window.__vt = []'); await tap('#tab-weather'); await sleep(500);
  let v = await vts();
  check('less: a tab press is a plain cross-fade: one transition, no type, no named part', v.length === 1 && !v[0].types && v[0].names.length === 0, v);
  await fresh('still'); await openReport(); await js('window.__vt = []'); await tap('#tab-weather'); await sleep(300);
  check('still: a tab press is today\'s swap: no view transition at all, and the tab is there at once', (await vts()).length === 0 && await js(`document.querySelector('#tab-weather').getAttribute('aria-selected') === 'true'`));
});

await group('views: the calm screens cross-fade; the report, setup and My farm are left alone', async () => {
  await fresh('full'); await js('window.__vt = []');
  await js(`location.hash = '#privacy'`); await until(`!document.querySelector('#view-info').hidden && /Privacy/.test(document.querySelector('#infoTitle').textContent)`, 4000); await sleep(600);
  let v = await vts();
  check('views: Home to Privacy is one plain cross-fade (no type, no name), the page is complete and focus is on its heading', v.length === 1 && !v[0].types && v[0].names.length === 0 && await js(`document.activeElement === document.querySelector('#infoTitle') || /Privacy/.test(document.activeElement.textContent)`), v);
  const privacy = await js(`document.querySelector('#infoBody').innerText`);
  await js('window.__vt = []'); await js(`location.hash = '#data'`); await sleep(600); await js(`location.hash = '#privacy'`); await sleep(600);
  check('views: the Privacy page is the same with the turn as it was (its words are unchanged)', await js(`document.querySelector('#infoBody').innerText`) === privacy);
  await fresh('still'); await js('window.__vt = []'); await js(`location.hash = '#settings'`); await sleep(500);
  check('views: at Still a change of screen is today\'s swap', (await vts()).length === 0 && await js(`!document.querySelector('#view-info').hidden`));
});

await group('steps: the setup\'s column turns, the map never moves', async () => {
  await fresh('full');
  await js(`(async () => { const w = await import('/js/wizard.js'), a = await import('/js/app.js'); w.setPlace({ lat: ${LAT}, lon: ${LON}, name: 'Barrie test', demo: true }); a.show('setup'); })()`);
  await until(`!!document.querySelector('#wNext')`, 8000); await sleep(1200); await js('window.__vt = []');
  const mapBefore = await js(`(() => { const r = document.querySelector('#setupMap').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })()`);
  await tap('#wNext'); await sleep(900);
  let v = await vts();
  const heading = await js(`document.activeElement?.id`);
  check('steps: Next is one view transition of type "forward" with only the column named', v.length === 1 && JSON.stringify(v[0].types) === '["forward"]' && JSON.stringify(v[0].names) === '["stepcol"]', v);
  check('steps: the new step is complete and focus is on its heading', heading === 'wHeading', heading);
  check('steps: the map did not move', JSON.stringify(await js(`(() => { const r = document.querySelector('#setupMap').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })()`)) === JSON.stringify(mapBefore));
  await js('window.__vt = []'); await tap('#wBack'); await sleep(900); v = await vts();
  check('steps: Back is the type "back"', v.length === 1 && JSON.stringify(v[0].types) === '["back"]', v);
  await js('window.__vt = []'); await tap('#wNext'); await sleep(60); await press('Shift'); await sleep(250);
  check('steps: a key in the middle lands on the new step complete', await js(`!!document.querySelector('#wHeading') && !document.documentElement.dataset.macroVt`));
  await fresh('still');
  await js(`(async () => { const w = await import('/js/wizard.js'), a = await import('/js/app.js'); w.setPlace({ lat: ${LAT}, lon: ${LON}, name: 'Barrie test', demo: true }); a.show('setup'); })()`);
  await until(`!!document.querySelector('#wNext')`, 8000); await sleep(800); await js('window.__vt = []'); await tap('#wNext'); await sleep(300);
  check('steps: at Still the step changes with no transition', (await vts()).length === 0);
});

await finish();
