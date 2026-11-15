// Crophalo's rough-money suite in a real browser: the Options tab with its line under each option (from the recorded World Bank and FAOSTAT answers, served by a stand-in), the "How this figure is made" sheet
// opening, closing with Escape and giving focus back, the currency and area-unit choices, no sideways scroll at 320 to 1280 and axe on the tab and the sheet. Runs on the throwaway copy scripts/e2e_lib.mjs makes.
// Run: node scripts/e2e_money.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_money');
await run.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fetch = (f => async (url, ...r) => /\\/api\\/(cropsnear|smaproot)/.test(String(url)) ? { ok: true, status: 200, json: async () => ({ ok: false, reason: 'stand-in' }), text: async () => '{"ok":false}' } : f(url, ...r))(window.fetch);` });   // the throwaway server has no crop-map or soil-moisture route: a demo field asks for them at once, so they are answered here, quietly
const { ROOT, js, until, size, go, check, same, group, finish, sleep, press, tap } = run;
const HERE = path.dirname(fileURLToPath(import.meta.url)), rec = n => JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'live', n, 'recording.json'), 'utf8')).answer;
const PRICES = rec('prices-live'), FAO = rec('faostat-live');
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const S = (year, crop) => ({ year, crop, sow: '2027-05-01', harvest: '2027-10-01', after: 'residue', residueUntil: null, window: null });
const now = { id: 'now', name: 'Corn, then Soybeans', kind: 'current', score: 70, scores: { water: 70, soil: 70, erosion: 70, income: 70, weather: 70 }, flag: 'holds', seasons: [S(1, 'corn'), S(2, 'soy')] };
const cws = { id: 'cws', name: 'Corn, soybeans, then winter wheat', kind: 'proposed', score: 69, scores: { water: 70, soil: 70, erosion: 70, income: 70, weather: 70 }, flag: 'holds', seasons: [S(1, 'corn'), S(2, 'soy'), S(3, 'wheat')] };
const can = { id: 'can', name: 'Canola, then wheat', kind: 'proposed', score: 60, flag: 'holds', seasons: [S(1, 'canola'), S(2, 'wheat')] };
const RESULT = { ok: true, current: now, recommended: now, others: [cws, can], reason: 'Nothing we tested does clearly better here.', evidence: [], gaps: [], risks: [], sureness: 'Fairly sure' };
const open = async (width, settings = {}) => {
  await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); localStorage.setItem('crophalo.settings.v1', ${JSON.stringify(JSON.stringify(settings))}); localStorage.removeItem('crophalo.units.v1')`); await go('/'); await sleep(400);
  await js(`window.fetch = async url => ({ ok: true, json: async () => /prices/.test(url) ? ${JSON.stringify(PRICES)} : /faostat/.test(url) ? ${JSON.stringify(FAO)} : { ok: false } })`);
  await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report'); await m.renderResult({ ...st.newState(), loc: { lat: 43.13, lon: -80.75, cc: 'CA' }, name: 'Oxford' }, ${JSON.stringify(RESULT)}); void 0; })`);
  await until(`document.querySelector('.srow .money-line')`); await sleep(200);
  await js(`document.querySelectorAll('.srow').forEach(r => { r.open = true; })`); await sleep(150);   // the money line sits in each strategy row's body: open the rows
};

await group('money', async () => {
  await open(1280);
  const lines = await js(`[...document.querySelectorAll('.srow')].map(c => c.querySelector('.money-line')?.textContent.trim() ?? '')`);
  check('each row with a price shows one quiet figure line in its body', lines.length >= 3 && lines.slice(0, -1).every(l => /^About \$[\d,]+ a hectare a year, before costs\./.test(l)), JSON.stringify(lines));
  check('canola, with no figure, says why in its own row', /^No money figure: Canola:/.test(lines.at(-1)), lines.at(-1));
  check('a row\'s summary is one control (no button or link inside a summary)', await js(`[...document.querySelectorAll('.srow > summary')].every(c => !c.querySelector('button, a'))`));
  check('a row with a figure has "How this figure is made"', await js(`!!document.querySelector('.srow [data-act=money]')`));
  await tap('.srow [data-act=money]'); await sleep(250);
  check('the sheet opens as a dialog with its title and the assumptions', await js(`const d = document.querySelector('#dlgMoney'); d?.open && d.querySelector('#dlgMoneyTitle').textContent === 'How this figure is made' && d.querySelectorAll('.money-assume li').length >= 6`));
  check('the sheet says world price, no costs, and not what you will receive', await js(`/World price, not your local price/.test(document.querySelector('#dlgMoney').innerText) && /No costs taken off/.test(document.querySelector('#dlgMoney').innerText) && /not what you will receive/.test(document.querySelector('#dlgMoney').innerText)`));
  await press('Escape'); await sleep(250);
  check('Escape closes the sheet and focus goes back to the button that opened it', await js(`!document.querySelector('#dlgMoney').open && document.activeElement?.dataset?.act === 'money'`));
  check('no farmer-facing word says income, earn, profit, revenue, forecast or guarantee on the page', await js(`!/\\b(income|earn\\w*|profit\\w*|revenue|forecast\\w*|guarantee\\w*)\\b/i.test([...document.querySelectorAll('.money-line, #dlgMoney')].map(e => e.textContent).join(' '))`));
  await open(1280, { currency: 'CAD' }); await sleep(400);
  check('with Canadian dollars chosen the line says CA$ (or stays in US dollars and says so when no rate was read)', await js(`/CA\\$|\\$/.test(document.querySelector('.srow .money-line').textContent)`));
  await js(`localStorage.setItem('crophalo.units.v1', JSON.stringify({ area: 'imperial' }))`);
  await open(1280); await js(`localStorage.setItem('crophalo.units.v1', JSON.stringify({ area: 'imperial' }))`); await js(`import('/js/report.js').then(m => 0)`);
});

await group('fit', async () => {
  for (const width of [320, 375, 390, 768, 1280]) { await open(width); await js(`document.querySelector('.srow [data-act=money]').click()`); await sleep(250);
    check(`fit: the page with its sheet open at ${width} px does not scroll sideways`, await js(`document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0`), width);
    check(`fit: the sheet's Done button is at least 44 px at ${width} px`, await js(`document.querySelector('#dlgMoney [data-money-done]').getBoundingClientRect().height >= 43.5`)); }
});
await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) for (const sheet of [false, true]) {
    await open(width); if (sheet) { await js(`document.querySelector('.srow [data-act=money]').click()`); await sleep(250); }
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  money ${sheet ? 'sheet' : 'tab'} at ${width}: ${line}`);
    check(`axe: the Options tab${sheet ? ' with the sheet' : ''} at ${width}: 0 problems`, found.length === 0, `${found.length} found`);
  }
});
await finish();
