// Crophalo's land-history suite in a real browser, built from the recorded NASA POWER answer for Barrie: the cards, More buttons that open, stay open across redraws and are 44 px, Copy as text, Print (the paper is made
// for the print and removed after), no sideways scroll at 320 to 1280 with and without largest text, and axe at 1280 and 375. Runs on the throwaway copy scripts/e2e_lib.mjs makes. Run: node scripts/e2e_history.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_history');
await run.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fetch = (f => async (url, ...r) => /\\/api\\//.test(String(url)) ? { ok: true, status: 200, json: async () => ({ ok: false, reason: 'stand-in' }), text: async () => '{"ok":false}' } : f(url, ...r))(window.fetch);` });   // the throwaway server has no crop-map or soil-moisture route: a demo field asks for them at once, so they are answered here, quietly
const { ROOT, js, until, size, go, check, group, finish, sleep, tap } = run;
const POWER = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'power_barrie.json'), 'utf8'), REC = JSON.parse(POWER);
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const open = async (width, big = false) => {
  await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); localStorage.setItem('crophalo.settings.v1', ${JSON.stringify(JSON.stringify({ text: big ? 'xlarge' : 'default' }))})`); await go('/#data'); await until(`document.querySelector('#infoBody')`);
  await js(`(async () => { const d = await import('/js/data.js'), v = await import('/js/history-view.js'); const R = ${POWER}; window.__clip = ''; navigator.clipboard.writeText = async t => { window.__clip = t; }; window.__printed = 0; window.print = () => { window.__printed++; window.__paper = document.querySelector('#printRoot')?.innerText ?? ''; window.__bodyClass = document.body.className; dispatchEvent(new Event('afterprint')); };
    const series = d.buildSeries(R, { lat: ${REC.geometry.coordinates[1]}, lon: ${REC.geometry.coordinates[0]} }); document.querySelector('#infoBody').innerHTML = ''; window.__hist = v.openHistory(document.querySelector('#infoBody'), { farm: { name: 'North farm', place: 'Oxford County, Ontario' }, fields: [{ name: 'North field' }], series }); })()`);
  await until(`document.querySelector('.hist .hcard')`); await sleep(250);
};

await group('history', async () => {
  await open(1280);
  check('the page has its eight cards', await js(`document.querySelectorAll('.hist .hcard').length === 8`));
  check('the sub line says 25 years, 2001–2025, weather from NASA', await js(`/25 years, 2001–2025 · weather from NASA/.test(document.querySelector('#histSub').textContent)`));
  check('each More button is at least 44 px high', await js(`[...document.querySelectorAll('.btn.more')].every(b => b.getBoundingClientRect().height >= 43.5)`));
  await tap('[data-more=dry]'); await sleep(150);
  check('More opens its rule and stays open when another More is opened (the page redraws)', await js(`(() => { return !document.querySelector('#more-dry').hidden && document.querySelector('[data-more=dry]').getAttribute('aria-expanded') === 'true'; })()`));
  await tap('[data-more=hot]'); await sleep(150);
  check('both are open, and focus is on the button that was pressed', await js(`!document.querySelector('#more-dry').hidden && !document.querySelector('#more-hot').hidden && document.activeElement.dataset.more === 'hot'`));
  await tap('[data-more=dry]'); await sleep(150); check('pressing it again closes it', await js(`document.querySelector('#more-dry').hidden`));
  await tap('[data-hist=copy]'); await sleep(200);
  check('Copy puts the record on the clipboard as text, and says so', await js(`/land history/.test(window.__clip) && /IN SHORT/.test(window.__clip) && /of 25 years/.test(window.__clip) && /copied as text/.test(document.querySelector('#toast').textContent)`));
  await tap('[data-hist=print]'); await sleep(250);
  check('Print makes the paper (the title, the table, the checks) and removes it afterwards', await js(`window.__printed === 1 && /North farm: land history/.test(window.__paper) && /☐/.test(window.__paper) && /printing-history/.test(window.__bodyClass) && !document.querySelector('#printRoot') && !document.body.classList.contains('printing-history')`));
  check('no money word, no chance word on the whole page', await js(`!/\\b(buy|sell|worth|bargain|invest\\w*|price\\w*|income|profit\\w*|earn\\w*|chance\\w*|likely|probabl\\w*)\\b|[$€£₺]/i.test(document.querySelector('.hist').innerText)`), await js(`(document.querySelector('.hist').innerText.match(/\\b(buy|sell|worth|bargain|invest\\w*|price\\w*|income|profit\\w*|earn\\w*|chance\\w*|likely|probabl\\w*)\\b|[$€£₺]/i) ?? [''])[0]`));
});
await group('fit', async () => {
  for (const width of [320, 375, 390, 768, 1280]) for (const big of [false, true]) {
    await open(width, big); for (const id of ['dry', 'lateFrost']) await js(`document.querySelector('[data-more=${id}]').click()`); await sleep(150);
    const by = await js(`document.documentElement.scrollWidth - document.documentElement.clientWidth`); check(`fit: the land history at ${width} px${big ? ' with largest text' : ''} does not scroll sideways`, by <= 0, `${by} px too wide`);
  }
});
await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) { await open(width); await js(`document.querySelector('[data-more=dry]').click()`); await sleep(150);
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  history at ${width}: ${line}`);
    check(`axe: the land history at ${width}: 0 problems`, found.length === 0, `${found.length} found`); }
});
await finish();
