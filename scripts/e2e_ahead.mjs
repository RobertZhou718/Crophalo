// Crophalo's Look ahead suite in a real browser: the page on a real worker with the recorded Oxford answers served by a stand-in for Open-Meteo. It counts every request the page makes (one ensemble answer on opening; the seasonal forecast only when
// that horizon is chosen; the seven climate models only on the button, one at a time), a 429 said once with no retry, the arrow keys, focus, the rules sheet, 44 px buttons, no sideways scroll at 320 to 1280, and axe. Runs on the throwaway copy scripts/e2e_lib.mjs makes.
// One browser at a time, please. Run: node scripts/e2e_ahead.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_ahead');
const { ROOT, js, until, size, go, check, same, group, finish, sleep, press, tap } = run;
const HERE = path.dirname(fileURLToPath(import.meta.url)), fx = n => fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8'), rec = n => { const t = fx(`open-meteo/${n}.rec`); return t.slice(t.indexOf('\n') + 1); };
const ENS = rec('ensemble-oxford'), SEAS = rec('seasonal-oxford'), CLIM = rec('climate-oxford'), POWER = fx('power_oxford.json');
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
// a stand-in for the scoring path, handed to the worker as a data address
const JUDGE = `export const judgeSeason = (season, series) => { const causes = []; let seen = 0; for (let i = 0; i < series.days.length; i++) { const d = series.days[i].slice(0, 4) + '-' + series.days[i].slice(4, 6) + '-' + series.days[i].slice(6, 8); if (d < season.sow || d > season.harvest) continue; seen++; const lo = series.T2M_MIN[i]; if (!Number.isFinite(lo)) continue; if (lo <= -2) causes.push({ severity: 'hit', kind: 'frost-young', date: d }); else if (lo < 0) causes.push({ severity: 'close', kind: 'frost-young', date: d }); } return seen ? { verdict: causes.some(c => c.severity === 'hit') ? 'hurt' : causes.length ? 'close' : 'fine', causes, notes: [] } : { verdict: 'growing', causes: [], notes: [] }; };`;
const WHEAT = { seasons: [{ crop: 'wheat', sow: '2026-10-05', harvest: '2027-07-20' }] };
const open = async (width, opts = {}) => {
  await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME})`); await go('/#data'); await until(`document.querySelector('#infoBody')`);
  await js(`(async () => {
    for (const h of ['css/app.css', 'css/history.css', 'css/ahead.css']) if (!document.querySelector('link[href="' + h + '"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; document.head.append(l); }
    const d = await import('/js/data.js'), v = await import('/js/ahead-view.js'), L = await import('/js/ahead-load.js'), C = await import('/js/ahead-client.js');
    const bodies = { ensemble: ${JSON.stringify(ENS)}, seasonal: ${JSON.stringify(SEAS)}, climate: ${JSON.stringify(CLIM)} }; window.__req = []; window.__active = 0; window.__max = 0; window.__busy = ${JSON.stringify(opts.busy ?? '')};
    const stub = async url => { const kind = /ensemble-api/.test(url) ? 'ensemble' : /seasonal-api/.test(url) ? 'seasonal' : 'climate'; window.__req.push(kind + ':' + (new URL(url).searchParams.get('models') ?? '')); window.__active++; window.__max = Math.max(window.__max, window.__active); await new Promise(r => setTimeout(r, 25)); window.__active--;
      if (window.__busy && kind === window.__busy) return { ok: false, status: 429, text: async () => '' }; return { ok: true, status: 200, text: async () => bodies[kind] }; };
    const series = d.buildSeries(${POWER}, { lat: 43.13, lon: -80.75 });
    const client = C.createAheadClient({ judgeUrl: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(JUDGE)}) });
    window.__client = client; window.__ahead = v.openAhead(document.querySelector('#infoBody'), { loader: L.createAheadLoader({ fetch: stub, store: L.createStore(), visible: () => true }), client, field: { name: 'North field', lat: 43.13, lon: -80.75, elev: 298 }, plan: ${JSON.stringify(WHEAT)}, series, today: '2026-11-14', planName: 'Winter wheat', year: 2027, youngCrop: 'young wheat' });
  })()`);
  await until(`document.querySelector('.ahead')`);
};
const reqs = () => js(`window.__req.slice()`);

await group('requests', async () => {
  await open(1280); await until(`/European runs|runs are fine|Nothing in your plan/.test(document.querySelector('.ahead-panel').innerText)`, 20000).catch(() => {}); await sleep(400);
  same('opening: ONE request, the European ensemble, and nothing else', await reqs(), ['ensemble:ecmwf_ifs025']);
  check('the answer is worked out on a real worker', await js(`window.__client.mode === 'worker'`));
  check('the weeks panel shows counts of runs with a denominator, hurt first, and offers the other two models', await js(`/of 51 European runs|All 51 runs are fine/.test(document.querySelector('.ahead-panel').innerText) && !!document.querySelector('[data-ahead="more-models"]')`), await js(`document.querySelector('.ahead-panel').innerText.slice(0, 200)`));
  await js(`document.querySelector('[data-horizon="weeks"]').focus()`); await press('ArrowRight'); await until(`/possible seasons|Nothing in your plan|Not read yet/.test(document.querySelector('.ahead-panel').innerText)`, 40000).catch(() => {}); await sleep(200);
  same('the arrow key chooses This season and asks for the seasonal forecast once', [await js(`document.activeElement.dataset.horizon`), (await reqs()).filter(r => r.startsWith('seasonal')).length], ['season', 1]);
  check('the season panel shows counts of possible seasons', await js(`/possible seasons|Nothing in your plan/.test(document.querySelector('.ahead-panel').innerText)`), await js(`document.querySelector('.ahead-panel').innerText.slice(0, 200)`));
  await press('ArrowRight'); await until(`document.querySelectorAll('.ahead table tbody tr').length === 24`, 40000).catch(() => {}); await sleep(200); same('Next 2 years asks for nothing more (the seasonal answer is kept)', (await reqs()).length, 2);
  check('the 24-month table is drawn, with the trend offered', await js(`document.querySelectorAll('.ahead table tbody tr').length === 48 && !!document.querySelector('[data-ahead="load-climate"]')`));
  await press('ArrowRight'); await sleep(300);
  same('Years ahead asks for NOTHING until the button', [(await reqs()).filter(r => r.startsWith('climate')).length, await js(`/Load the climate models/.test(document.querySelector('.ahead-panel').innerText)`)], [0, true]);
  await tap('[data-ahead="load-climate"]'); await until(`/hurt|Only \\d of 7/.test(document.querySelector('.ahead-panel').innerText)`, 60000).catch(() => {}); await sleep(300);
  const climate = (await reqs()).filter(r => r.startsWith('climate')).map(r => r.slice(8));
  same('the button asks for the seven climate models in order', climate, ['CMCC_CM2_VHR4', 'FGOALS_f3_H', 'HiRAM_SIT_HR', 'MRI_AGCM3_2_S', 'EC_Earth3P_HR', 'MPI_ESM1_2_XR', 'NICAM16_8S']);
  check('one at a time, never together', await js(`window.__max === 1`));
  check('Years ahead shows counts across the models beside the years as they really were', await js(`/across 7 models/.test(document.querySelector('.ahead-panel').innerText) && /As they really were: hurt in \\d+ of \\d+/.test(document.querySelector('.ahead-panel').innerText)`), await js(`document.querySelector('.ahead-panel').innerText.slice(0, 300)`));
});
await group('429', async () => {
  await open(1280, { busy: 'seasonal' }); await sleep(900); await js(`document.querySelector('[data-horizon="season"]').click()`); await sleep(1200);
  check('a busy seasonal service: one sentence on that horizon, and Try again', await js(`/The weather service is busy\\./.test(document.querySelector('.ahead-panel').innerText) && !!document.querySelector('[data-ahead="retry:season"]')`));
  const n = (await reqs()).filter(r => r.startsWith('seasonal')).length; await sleep(1500);
  same('nothing is asked again on its own', [n, (await reqs()).filter(r => r.startsWith('seasonal')).length], [1, 1]);
  check('the weeks that were read stay as they were', await js(`(document.querySelector('[data-horizon="weeks"]').click(), true)`) && await sleep(300) === undefined && await js(`/runs|Nothing in your plan/.test(document.querySelector('.ahead-panel').innerText)`));
});
await group('page', async () => {
  await open(1280); await sleep(1500);
  await tap('[data-ahead="rules"]'); await sleep(250);
  check('the rules sheet opens as a dialog with its sections, and Escape closes it and gives focus back', await js(`document.querySelector('#dlgAhead')?.open && /never used raw/.test(document.querySelector('#dlgAhead').innerText)`));
  await press('Escape'); await sleep(250); check('focus is back on the button that opened it', await js(`!document.querySelector('#dlgAhead').open && document.activeElement?.dataset?.ahead === 'rules'`));
  check('every button on the page is at least 44 px high', await js(`[...document.querySelectorAll('.ahead button')].filter(b => b.offsetParent).every(b => b.getBoundingClientRect().height >= 43.5 || b.classList.contains('srci'))`), await js(`[...document.querySelectorAll('.ahead button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 43.5 && !b.classList.contains('srci')).map(b => b.textContent.slice(0, 20) + b.getBoundingClientRect().height)`));
  check('only one radio is in the tab order', await js(`document.querySelectorAll('[role=radio][tabindex="0"]').length === 1`));
});
await group('fit', async () => {
  for (const width of [320, 375, 768, 1280]) for (const h of ['weeks', 'season', 'outlook']) { await open(width); await sleep(1200); await js(`document.querySelector('[data-horizon="${h}"]').click()`); await sleep(900);
    check(`fit: ${h} at ${width} px does not scroll the page sideways`, await js(`document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0`)); }
});
await group('charts', async () => {
  await open(375); await sleep(1200);
  check('weeks: two band charts (nights and days) each with a sentence under it and a folded table', await js(`document.querySelectorAll('.ahead-panel svg.ab-chart').length === 2 && document.querySelectorAll('.ahead-fig figcaption').length === 2 && document.querySelectorAll('.ahead-fold:not([open])').length === 2`));
  check('weeks: the chart label is its sentence', await js(`[...document.querySelectorAll('.ahead-fig')].every(f => f.querySelector('svg').getAttribute('aria-label') === f.querySelector('figcaption').textContent)`));
  await js(`document.querySelector('.ahead-fold summary').click()`); await sleep(200);
  check('weeks: the folded table opens and lists every day, on the page, as text', await js(`document.querySelectorAll('.ahead-fold[open] tbody tr').length >= 10 && document.querySelector('.ahead-fold[open] .tbl').scrollWidth > 0`));
  check('weeks: the fold button is 44 px high', await js(`document.querySelector('.ahead-fold summary').getBoundingClientRect().height >= 44`));
  const still = {};
  for (const m of ['', 'less', 'reduce']) { await js(`document.documentElement.dataset.motion = ${JSON.stringify(m)}`); await sleep(300); still[m] = await js(`({ n: document.getAnimations().length, svg: document.querySelector('svg.ab-chart').outerHTML.length })`); }
  check('weeks: Full, Less and Still draw the same chart and nothing on it moves', still[''].n === 0 && still.less.n === 0 && still.reduce.n === 0 && still[''].svg === still.less.svg && still.less.svg === still.reduce.svg, JSON.stringify(still));
  await js(`document.documentElement.dataset.motion = ''`);
  await js(`document.querySelector('[data-horizon="outlook"]').click()`); await sleep(900);
  check('outlook: a temperature chart and a rain chart with a sentence each, and the numbers folded', await js(`document.querySelectorAll('.ahead-panel svg.ab-chart').length === 2 && document.querySelectorAll('.ahead-fig figcaption').length === 2 && document.querySelectorAll('.ahead-panel > details.ahead-fold, .ahead-panel details.ahead-fold').length >= 1`));
  await js(`[...document.querySelectorAll('.ahead-fold summary')].at(-1).click()`); await sleep(200);
  check('outlook: the numbers behind both charts list 24 months', await js(`[...document.querySelectorAll('.ahead-fold[open] tbody tr')].length === 24`));
  check('charts: the sentences name no chance and no money', await js(`!/chance|probab|income|profit|guarantee/i.test([...document.querySelectorAll('.ahead-fig figcaption')].map(f => f.textContent).join(' '))`));
});
await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) for (const h of ['weeks', 'outlook', 'years']) {
    await open(width); await sleep(1200); await js(`document.querySelector('[data-horizon="${h}"]').click()`); await sleep(800);
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  ahead ${h} at ${width}: ${line}`);
    check(`axe: Look ahead ${h} at ${width}: 0 problems`, found.length === 0, `${found.length} found`);
  }
});
await finish();
