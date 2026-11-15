// Crophalo's info-pages suite in a real browser: Privacy, Limitations and Settings opened by their address, tabs with arrow keys, segmented choices that change the page, two-tap deletes,
// backup and restore, Admin opening with no password, no sideways scroll at 320 to 1280, and axe on every tab. Runs on the throwaway copy that scripts/e2e_lib.mjs makes.
// Groups (E2E_ONLY=fit,axe picks some): pages, keys, delete, backup, fit, axe.
// RULE: never loosen a check to make it pass without a written farming reason beside it. Run: node scripts/e2e_pages.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_pages');
const { ROOT, js, page, until, seen, tap, press, size, go, check, same, group, finish, sleep } = run;
const WELCOME = JSON.stringify({ v: '2026-11-14', at: 'test' });
const open = async (hash, width = 1280) => { await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await go('/' + hash); await until(`document.querySelector('#infoBody .pgpanel, #infoBody .lim, #infoBody .data-sources')`); await sleep(150); };
const text = () => js(`document.querySelector('#infoBody').innerText`);
const wideBy = () => js(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const PAGES = ['#data', '#privacy', '#privacy/sent', '#privacy/choices', '#limits', '#settings/units', '#settings/access', '#settings/stored', '#settings/remind', '#settings/admin'];

await group('pages', async () => {
  await open('#privacy');
  check('privacy: on your device says no account', (await text()).includes('No account'));
  await open('#privacy/sent'); const t = await text(); check('privacy: the sent tab names NASA POWER and Open-Meteo', t.includes('NASA POWER') && t.includes('Open-Meteo'));
  await open('#limits'); const l = await text(); check('limits: all three sureness levels', ['Very sure', 'Fairly sure', 'Somewhat sure'].every(w => l.includes(w)));
  await open('#settings/access');
  await tap('[data-set="text"][data-val="large"]'); await sleep(150);
  same('settings: Larger text puts data-text on the page and keeps it', await js(`[document.documentElement.dataset.text, JSON.parse(localStorage.getItem('crophalo.settings.v1')).text]`), ['large', 'large']);
  await tap('[data-set="motion"][data-val="reduce"]'); await sleep(150);
  same('settings: Always still sets data-motion', await js(`document.documentElement.dataset.motion`), 'reduce');
  await open('#settings/units');
  await tap('[data-quick="imperial"]'); await sleep(150);
  check('units: the sample follows the choice', (await text()).includes('acres') && (await text()).includes('°F'));
  await tap('[data-set="u:temp"][data-val="C"]'); await sleep(150);
  const s = await text(); check('units: one at a time: acres with °C', s.includes('acres') && s.includes('20 °C'), s.slice(-300));
  await js(`document.querySelector('#curSel').value = 'EUR'; document.querySelector('#curSel').dispatchEvent(new Event('change', { bubbles: true }))`); await sleep(500);
  check('units: the currency is kept', await js(`JSON.parse(localStorage.getItem('crophalo.settings.v1')).currency === 'EUR'`));
  await open('#settings/admin'); await sleep(400);
  check('admin: opens directly with no password asked', await js(`!document.querySelector('#adminPw') && /Admin/.test(document.querySelector('#pgpanel h2').textContent)`));
});

await group('data', async () => {
  await open('#data');
  const g = await js(`(() => { const r = s => document.querySelector(s).getBoundingClientRect(), t = r('#infoTitle'), n = r('#nasaLine'), h = r('#infoBody > h2'), l = r('.data-sources'), row = document.querySelector('.data-sources .row').getBoundingClientRect();
    return { title: n.top - t.bottom, note: h.top - n.bottom, head: l.top - h.bottom, pad: row.height, text: parseFloat(getComputedStyle(document.querySelector('#nasaLine')).fontSize) }; })()`);
  check('data: a gap under the title, a clear gap before the next heading, and the list close under its heading', g.title >= 8 && g.note >= 24 && g.head >= 8 && g.head <= 40, JSON.stringify(g));
  check('data: each source is a roomy row, not a cramped line', g.pad >= 72, JSON.stringify(g));
  check('data: the NASA line is small text in a callout, not a second headline', g.text <= 17, JSON.stringify(g));
});

await group('keys', async () => {
  await open('#settings/units');
  await js(`document.querySelector('#pgtab-units').focus()`); await press('ArrowRight'); await sleep(250);
  same('keys: Right moves to the next tab and focuses it', await js(`[location.hash, document.activeElement.id]`), ['#settings/access', 'pgtab-access']);
  await press('End'); await sleep(250); same('keys: End goes to the last tab', await js(`location.hash`), '#settings/admin');
  await press('ArrowRight'); await sleep(250); same('keys: it wraps to the first', await js(`location.hash`), '#settings/units');
  check('keys: only the selected tab is in the tab order', await js(`document.querySelectorAll('[role=tab][tabindex="0"]').length === 1`));
  await js(`document.querySelector('[data-set="u:rain"][aria-checked="true"]').focus()`); await press('ArrowRight'); await sleep(250);
  check('keys: an arrow moves a choice and keeps focus on a choice', await js(`document.activeElement.getAttribute('role') === 'radio' && document.activeElement.dataset.set === 'u:rain' && document.activeElement.getAttribute('aria-checked') === 'true'`));
});

await group('delete', async () => {
  await open('#privacy/choices');
  await js(`localStorage.setItem('crophalo.saved.v1', JSON.stringify([{ id: 'a' }])); localStorage.setItem('crophalo.settings.v1', '{"text":"large"}')`);
  await tap('[data-erase="saved"]'); await sleep(150);
  check('delete: the first tap only asks again', await js(`localStorage.getItem('crophalo.saved.v1') !== null && document.querySelector('[data-erase="saved"]').textContent.includes('again')`));
  await sleep(5300);
  check('delete: after five seconds the button is itself again', await js(`document.querySelector('[data-erase="saved"]').textContent === 'Delete'`));
  await tap('[data-erase="saved"]'); await sleep(100); await tap('[data-erase="saved"]'); await sleep(300);
  check('delete: two taps delete it', await js(`localStorage.getItem('crophalo.saved.v1') === null`));
  await js(`localStorage.setItem('crophalo.notes.v1', '[]'); sessionStorage.setItem('crophalo.x', '1')`);
  await tap('[data-erase="everything"]'); await sleep(100); await tap('[data-erase="everything"]'); await sleep(500);
  check('delete everything: keys and session are gone', await js(`![...Object.keys(localStorage)].some(k => k.startsWith('crophalo.')) && sessionStorage.getItem('crophalo.x') === null`), await js(`Object.keys(localStorage)`));
});

await group('backup', async () => {
  await open('#settings/stored');
  await js(`localStorage.setItem('crophalo.saved.v1', JSON.stringify([{ id: 'a' }, { id: 'b' }]))`);
  const file = await js(`import('/js/backup.js').then(m => JSON.stringify(m.makeBackup()))`);
  await js(`localStorage.removeItem('crophalo.saved.v1')`);
  await js(`(() => { const input = document.querySelector('#restoreFile'), dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(file)}], 'b.json', { type: 'application/json' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await until(`document.querySelector('[data-restore-go]')`);
  check('backup: the file is described before anything changes', (await js(`document.querySelector('#restoreAsk').innerText`)).includes('2 saved fields') && await js(`localStorage.getItem('crophalo.saved.v1') === null`));
  await tap('[data-restore-go]'); await sleep(300);
  check('backup: restore puts the fields back', await js(`JSON.parse(localStorage.getItem('crophalo.saved.v1')).length === 2`));
  await js(`(() => { const input = document.querySelector('#restoreFile'), dt = new DataTransfer(); dt.items.add(new File(['not a backup'], 'x.json')); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(300);
  check('backup: a wrong file is refused in words, nothing changed', (await js(`document.querySelector('#restoreAsk').innerText`)).includes('not a Crophalo backup') && await js(`JSON.parse(localStorage.getItem('crophalo.saved.v1')).length === 2`));
  await tap('[data-reset-settings]'); await sleep(200);
  check('reset: settings go back to defaults', await js(`!document.documentElement.dataset.text`));
});

await group('fit', async () => {
  for (const width of [320, 375, 390, 768, 1280]) for (const hash of PAGES) {
    await open(hash, width);
    for (const big of [false, true]) { await js(`import('/js/settings.js').then(m => m.saveSettings({ text: ${big ? "'xlarge'" : "'default'"} }))`); await sleep(100);
      const by = await wideBy(); check(`fit: ${hash} at ${width} px${big ? ' with largest text' : ''}: no sideways scroll`, by <= 0, `${by} px too wide`); }
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'default' }))`);
  }
  await open('#settings/units', 375);
  const small = await js(`[...document.querySelectorAll('#infoBody button, #infoBody select, #infoBody input, #infoBody a')].filter(e => e.offsetParent && !e.closest('.sr') && !e.classList.contains('srci')).map(e => [e.getBoundingClientRect(), e]).filter(([b]) => b.height < 43.5 || b.width < 43.5).map(([b, e]) => e.tagName + ' ' + (e.textContent || e.id).slice(0, 20) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height))`);
  check('fit: every control on Units is at least 44 px at 375', small.length === 0, small);
});

await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) for (const hash of PAGES) {
    await open(hash, width);
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  ${hash} at ${width}: ${line}`);
    check(`axe: ${hash} at ${width}: 0 problems`, found.length === 0, `${found.length} found`);
  }
});

await finish();
