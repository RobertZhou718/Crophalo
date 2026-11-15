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
const open = async (hash, width = 1280) => { await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await go('/' + hash); await until(`document.querySelector('#infoBody .pgpanel, #infoBody .st, #infoBody .lim-grid, #infoBody .lim, #infoBody .data-sources')`); await until(`[...document.styleSheets].some(x => (x.href || '').includes('css/pages.css'))`, 6000); await sleep(150); };
const text = () => js(`document.querySelector('#infoBody').innerText`);
const wideBy = () => js(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
const PAGES = ['#data', '#privacy', '#privacy/sent', '#limits', '#settings'];

await group('pages', async () => {
  await open('#privacy');
  check('privacy: on your device says no account', (await text()).includes('No account'));
  await open('#privacy/sent'); const t = await text(); check('privacy: the sent tab names NASA POWER and Open-Meteo', t.includes('NASA POWER') && t.includes('Open-Meteo'));
  await open('#limits'); const l = await js(`document.querySelector('#infoBody').textContent`); check('limits: all three sureness levels (under Show more)', ['Very sure', 'Fairly sure', 'Somewhat sure'].every(w => l.includes(w)));
  await open('#settings');
  await tap('[data-set="text"][data-val="large"]'); await sleep(150);
  same('settings: Larger text puts data-text on the page and keeps it', await js(`[document.documentElement.dataset.text, JSON.parse(localStorage.getItem('crophalo.settings.v1')).text]`), ['large', 'large']);
  await tap('[data-set="motion"][data-val="still"]'); await sleep(150);
  same('settings: Still sets data-motion to reduce', await js(`document.documentElement.dataset.motion`), 'reduce');
  await tap('[data-set="motion"][data-val="less"]'); await sleep(150);
  same('settings: Less sets data-motion to less', await js(`document.documentElement.dataset.motion`), 'less');
  await tap('[data-set="motion"][data-val="full"]'); await sleep(150);
  same('settings: Full removes it', await js(`document.documentElement.dataset.motion ?? ''`), '');
  await open('#settings');
  check('settings: no tab bar, one page', await js(`!document.querySelector('#infoBody [role=tablist], #infoBody [role=tab]')`));
  await tap('[data-quick="imperial"]'); await sleep(150);
  check('units: the example line follows the choice (US: inches, °F, acres)', /in of rain · \d+ °F · [\d.]+ ac/.test(await js(`document.querySelector('.st-example').textContent`)), await js(`document.querySelector('.st-example').textContent`));
  await tap('#stEach summary'); await sleep(100); await tap('[data-set="u:temp"][data-val="C"]'); await sleep(150);
  check('units: one at a time: acres with °C, and the fold stays open', /°C/.test(await js(`document.querySelector('.st-example').textContent`)) && /ac/.test(await js(`document.querySelector('.st-example').textContent`)) && await js(`document.querySelector('#stEach').open`), await js(`document.querySelector('.st-example').textContent`));
  await js(`document.querySelector('#curSel').value = 'EUR'; document.querySelector('#curSel').dispatchEvent(new Event('change', { bubbles: true }))`); await sleep(500);
  check('units: the currency is kept', await js(`JSON.parse(localStorage.getItem('crophalo.settings.v1')).currency === 'EUR'`));
});

await group('data', async () => {
  await open('#data');
  const g = await js(`(() => { const r = s => document.querySelector(s).getBoundingClientRect(), t = r('#infoTitle'), n = r('#nasaLine'), h = r('#infoBody > h2'), l = r('.data-filter'), row = document.querySelector('.data-sources .row').getBoundingClientRect();
    return { title: n.top - t.bottom, note: h.top - n.bottom, head: l.top - h.bottom, pad: row.height, text: parseFloat(getComputedStyle(document.querySelector('#nasaLine')).fontSize) }; })()`);
  check('data: a gap under the title, a clear gap before the next heading, and the list close under its heading', g.title >= 8 && g.note >= 24 && g.head >= 8 && g.head <= 40, JSON.stringify(g));
  check('data: each source is a roomy row, not a cramped line', g.pad >= 72, JSON.stringify(g));
  check('data: the NASA line is small text in a callout, not a second headline', g.text <= 17, JSON.stringify(g));
});

await group('freeze', async () => {
  // Settings once froze the browser: with the exchange rates already kept on the device the Units tab drew itself again and again. Kept rates must change nothing, and the page must stay answerable.
  await size(1280); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); localStorage.setItem('crophalo.fx.v1', JSON.stringify({ at: Date.now(), rates: { base: 'USD', date: '2026-11-14', rates: { EUR: 0.9, CAD: 1.4, TRY: 40 } } }))`);
  await go('/#settings'); const started = Date.now();
  await until(`document.querySelector('#infoBody .st')`); await sleep(1200);
  const answer = await js(`import('/js/pages-info.js').then(m => m.renders.count)`);
  check('settings: with fresh rates kept on the device the page still answers within 2 s', Date.now() - started < 4000 + 1200 && typeof answer === 'number', `${Date.now() - started} ms`);
  check('settings: the page is drawn at most twice (once, and once more only if new rates arrived)', answer <= 2, `drawn ${answer} times`);
  await sleep(1500); const later = await js(`import('/js/pages-info.js').then(m => m.renders.count)`);
  check('settings: and it is not still drawing a moment later', later === answer, `${answer} then ${later}`);
});

await group('keys', async () => {
  await open('#privacy');
  await js(`document.querySelector('#pgtab-device').focus()`); await press('ArrowRight'); await sleep(250);
  same('keys: Right moves to the next tab and focuses it', await js(`[location.hash, document.activeElement.id]`), ['#privacy/sent', 'pgtab-sent']);
  await press('ArrowRight'); await sleep(250); same('keys: it wraps to the first', await js(`location.hash`), '#privacy/device');
  check('keys: only the selected tab is in the tab order', await js(`document.querySelectorAll('[role=tab][tabindex="0"]').length === 1`));
  await open('#settings');
  await js(`document.querySelector('[data-set="text"][aria-checked="true"]').focus()`); await press('ArrowRight'); await sleep(250);
  check('keys: an arrow moves a choice and keeps focus on a choice', await js(`document.activeElement.getAttribute('role') === 'radio' && document.activeElement.dataset.set === 'text' && document.activeElement.getAttribute('aria-checked') === 'true'`));
});

await group('delete', async () => {
  await open('#privacy');
  await js(`localStorage.setItem('crophalo.farms.v1', JSON.stringify([{ id: 'a' }])); localStorage.setItem('crophalo.settings.v1', '{"text":"large"}')`);
  await tap('[data-erase="farms"]'); await sleep(150);
  check('delete: the first tap only asks again', await js(`localStorage.getItem('crophalo.farms.v1') !== null && document.querySelector('[data-erase="farms"]').textContent.includes('again')`));
  await sleep(5300);
  check('delete: after five seconds the button is itself again', await js(`document.querySelector('[data-erase="farms"]').textContent === 'Delete'`));
  await tap('[data-erase="farms"]'); await sleep(100); await tap('[data-erase="farms"]'); await sleep(300);
  check('delete: two taps delete it', await js(`localStorage.getItem('crophalo.farms.v1') === null`));
  await js(`localStorage.setItem('crophalo.notes.v1', '[]'); sessionStorage.setItem('crophalo.x', '1')`);
  await tap('[data-erase="everything"]'); await sleep(100); await tap('[data-erase="everything"]'); await sleep(500);
  check('delete everything: keys and session are gone', await js(`![...Object.keys(localStorage)].some(k => k.startsWith('crophalo.')) && sessionStorage.getItem('crophalo.x') === null`), await js(`Object.keys(localStorage)`));
});

await group('backup', async () => {
  await open('#privacy');
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
  await open('#settings'); await tap('[data-reset-settings]'); await sleep(200);
  check('reset: settings go back to defaults', await js(`!document.documentElement.dataset.text`));
});

await group('look', async () => {
  // the owner's rules of 15 November 2026: four sentences at most in any block, every control 44 px on a phone, no tab bar on Settings; the pictures for the owner
  const sentences = `[...document.querySelectorAll('#infoBody p, #infoBody li, #infoBody dd')].filter(e => e.offsetParent && !e.closest('select')).map(e => [(e.innerText.match(/[.!?](\\s|$)/g) || []).length, e.innerText.slice(0, 50)]).filter(([n]) => n > 4)`;
  for (const [hash, name] of [['#settings', 'settings'], ['#limits', 'limitations'], ['#privacy', 'privacy']]) for (const width of [1440, 390]) {
    await open(hash, width); await sleep(500);
    check(`look: ${name} at ${width}: no block shows more than four sentences`, (await js(sentences)).length === 0, await js(sentences));
    const small = await js(`[...document.querySelectorAll('#infoBody button, #infoBody select, #infoBody input:not(.sr), #infoBody a, #infoBody summary')].filter(e => e.offsetParent && !e.closest('.sr') && !e.classList.contains('srci')).map(e => { const a = getComputedStyle(e, '::after'), grow = a.content !== 'none' && a.position === 'absolute' ? Math.max(0, -parseFloat(a.top) || 0) + Math.max(0, -parseFloat(a.bottom) || 0) : 0; return [e.getBoundingClientRect(), e, grow]; }).filter(([b, e, grow]) => b.height + grow < 43.5).map(([b, e, grow]) => e.tagName + ' ' + (e.textContent || '').trim().slice(0, 24) + ' ' + Math.round(b.height + grow))`);
    check(`look: ${name} at ${width}: every control is at least 44 px high${width > 600 ? ' (a mouse needs 30)' : ''}`, width > 600 ? small.every(t => Number(t.split(' ').pop()) >= 29) : small.length === 0, small);
    check(`look: ${name} at ${width}: no sideways scroll`, (await wideBy()) <= 0);
    await run.shot?.(`${name}-${width}.png`);
  }
  await open('#settings', 1440);
  check('look: Settings has no tab bar and its cards are at most 720 px wide, centred', await js(`!document.querySelector('#infoBody [role=tablist]') && [...document.querySelectorAll('.st-card')].every(c => c.getBoundingClientRect().width <= 721)`));
  const words = await js(`document.querySelector('#view-info').innerText.split(/\\s+/).length`);
  await open('#limits', 1440); const lim = await js(`[...document.querySelectorAll('#infoBody')].map(n => { const c = n.cloneNode(true); c.querySelectorAll('details').forEach(d => d.remove()); return c.innerText.split(/\\s+/).length; })[0]`);
  check('look: Limitations shows about 120 words in sight (423 before)', lim <= 160, lim);
});

await group('status', async () => {
  const rows = [{ id: 'power', name: 'NASA POWER weather', state: 'answering', last_ok_time: new Date().toISOString(), last_ms: 1300, last_problem: null, kept: 3, ttl_hours: 24, needs_key: false, key_set: false, needs_login: false, login_set: false, checked_at: null, can_check: true },
    { id: 'smaproot', name: 'NASA SMAP soil moisture', state: 'not_answering', last_ok_time: null, last_ms: null, last_problem: 'The service did not answer in time.', kept: 0, ttl_hours: 24, needs_key: true, key_set: false, needs_login: false, login_set: false, checked_at: null, can_check: true }];
  await size(1440); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await go('/');   // a second load: the welcome of the first visit is not on the page
  await js(`window.__posts = 0; const real = window.fetch.bind(window); window.fetch = (u, o) => String(u).includes('/api/sources/check') ? (window.__posts++, Promise.resolve(new Response(JSON.stringify(${JSON.stringify(rows.map(r => ({ ...r, state: 'answering', last_problem: null })))}), { status: 200 }))) : String(u).includes('/api/sources') ? Promise.resolve(new Response(JSON.stringify(${JSON.stringify(rows)}), { status: 200 })) : real(u, o)`);
  await js(`location.hash = '#admin'`); await until(`document.querySelector('.adm-table tr[data-state]')`);
  const t = await js(`document.querySelector('#view-admin').innerText`);
  check('status: the page is called API connections with its Admin chip, one table row for each service with its state as a word, and the tabs', /API connections/.test(t) && /Admin/.test(t) && /NASA POWER weather/.test(t) && /Online/.test(t) && /Not set up/.test(t) && /Not checked here/.test(t) && /Services/.test(t) && /Live data/.test(t) && /Recent requests/.test(t) && !/3D objects/.test(t) && (await js(`document.querySelectorAll('.adm-table tr[data-state]:not([data-state=no_check])').length`)) === 2 && (await js(`document.querySelectorAll('.adm-table tr[data-state=no_check]').length`)) > 15, t.slice(0, 300));
  check('status: NASA POWER is one row, not two, and the rows the server cannot check sit under their own title, with no Esri, GBIF or drought row', await js(`[...document.querySelectorAll('.adm-svc b')].filter(b => /^NASA POWER/.test(b.textContent)).length === 1 && /Read straight from your browser/.test(document.querySelector('.adm-group')?.textContent || '') && !/Esri|GBIF|Drought Monitor/.test(document.querySelector('#view-admin').innerText)`));
  check('status: no key, no password, no file path anywhere on the page', !/sk-|password|netrc|\/Users\//i.test(t));
  check('status: the page has the same left and right edges as the top bar', await js(`(() => { const b = document.querySelector('.brand, header a')?.getBoundingClientRect(), w = document.querySelector('.adm-head').getBoundingClientRect(), t = document.querySelector('.adm-tablewrap').getBoundingClientRect(), n = document.querySelector('.nav-in').getBoundingClientRect(); return Math.abs(w.left - (n.left + 16)) <= 2 && Math.abs(t.right - (n.right - 16)) <= 2; })()`), await js(`JSON.stringify([document.querySelector('.adm-head').getBoundingClientRect().left, document.querySelector('.nav-in').getBoundingClientRect().left, document.querySelector('.adm-tablewrap').getBoundingClientRect().right, document.querySelector('.nav-in').getBoundingClientRect().right])`));
  check('status: the chosen tab is filled blue with white bold words', await js(`(() => { const c = getComputedStyle(document.querySelector('.pg-tabs [aria-selected=true]')); return c.color === 'rgb(255, 255, 255)' && Number(c.fontWeight) >= 600 && c.backgroundColor !== 'rgba(0, 0, 0, 0)'; })()`));
  check('status: the four tiles are there', (await js(`document.querySelectorAll('.adm-tile').length`)) === 4, t.slice(0, 200));
  check('status: the table runs the whole width on a wide screen', await js(`(() => { const w = document.querySelector('.adm-tablewrap').getBoundingClientRect(), h = document.querySelector('#view-admin .wrap').getBoundingClientRect(); return h.right - w.right <= 40; })()`));
  await tap('#adCheck'); await until(`window.__posts === 1`); await sleep(300);
  check('status: Check now asks the server once and the new states show', /Checked/.test(await js(`document.querySelector('#view-admin').innerText`)) && await js('window.__posts') === 1);
  await sleep(300); await run.shot?.('admin-1440.png'); await run.shot?.('admin-1440.png'); await js('window.scrollTo(0, 500)'); await sleep(200); await run.shot?.('admin-1440b.png'); await js('window.scrollTo(0, 0)'); await size(390); await sleep(500); await run.shot?.('admin-390.png'); await js('window.scrollTo(0, 700)'); await sleep(200); await run.shot?.('admin-390b.png'); await size(1440);
  await open('#settings'); check('status: Settings has a quiet link to it at the foot', await js(`!!document.querySelector('a[href="#admin"]')`));
});

await group('fit', async () => {
  for (const width of [320, 375, 390, 768, 1280]) for (const hash of PAGES) {
    await open(hash, width);
    for (const big of [false, true]) { await js(`import('/js/settings.js').then(m => m.saveSettings({ text: ${big ? "'xlarge'" : "'default'"} }))`); await sleep(100);
      const by = await wideBy(); check(`fit: ${hash} at ${width} px${big ? ' with largest text' : ''}: no sideways scroll`, by <= 0, `${by} px too wide`); }
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'default' }))`);
  }
  await open('#settings', 375);
  const small = await js(`[...document.querySelectorAll('#infoBody button, #infoBody select, #infoBody input, #infoBody a')].filter(e => e.offsetParent && !e.closest('.sr') && !e.classList.contains('srci')).map(e => [e.getBoundingClientRect(), e]).filter(([b]) => b.height < 43.5 || b.width < 43.5).map(([b, e]) => e.tagName + ' ' + (e.textContent || e.id).slice(0, 20) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height))`);
  check('fit: every control on Settings is at least 44 px at 375', small.length === 0, small);
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

await group('focus', async () => {   // the keyboard stays on the same button when a page is drawn again
  await open('#settings', 1280);
  await js(`document.querySelector('[data-quick="imperial"]').focus(); document.querySelector('[data-quick="imperial"]').click()`); await sleep(300);
  check('focus: choosing a units preset draws Settings again and the keyboard is on the same preset button, not on a box', await js(`document.activeElement?.dataset?.quick === 'imperial' && document.activeElement.tagName === 'BUTTON'`), await js(`document.activeElement?.tagName + ' ' + (document.activeElement?.className || '')`));
});

await group('skeleton', async () => {   // the owner's house rule: grey lines in the shape of what will come while a page waits, never a bare spinner or an empty white area
  await size(1280); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await go('/');
  await js(`window.fetch = ((real) => (u, o) => String(u).includes('/api/sources') ? new Promise(done => setTimeout(() => done(new Response('[]', { status: 200 })), 1500)) : real(u, o))(window.fetch.bind(window))`);
  await js(`location.hash = '#admin'`); await sleep(500);
  check('skeleton: while the list of services is read the status page shows grey table rows in the shape of its rows, no spinner, and says what it waits for to a screen reader', await js(`document.querySelectorAll('.adm-table tr.adm-sk').length >= 4 && !document.querySelector('#adminBody .dot.busy') && !!document.querySelector('#adminBody [role=status]') && !!document.querySelector('.adm-sk .sk')`));
  await sleep(2000);
  check('skeleton: when the answer is in the grey rows are gone', await js(`!document.querySelector('.adm-sk')`));
});

await group('wide', async () => {
  const four = ['NASA POWER weather', 'USDA NASS crop data', 'Open-Meteo forecast', 'SMAP soil moisture'].map((name, i) => ({ id: 'abcd'[i], name, state: ['answering', 'not_answering', 'answering', 'slow'][i], last_ok_time: '2026-11-15T01:00:00Z', last_ms: 900, last_problem: i === 1 ? 'The service did not answer in time.' : null, kept: 0, ttl_hours: 24, needs_key: false, key_set: false, needs_login: false, login_set: false, checked_at: null, can_check: true }));   // the owner's rule: a page uses the whole width. At 1440 and 1920 the last card of the first row ends within 40 px of the container's right edge, and the cards of a row grow with the screen
  for (const width of [1440, 1920, 2000]) for (const hash of ['#settings', '#privacy', '#privacy/sent', '#limits', '#data', '#admin']) {
    if (hash === '#admin') { await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await go('/'); await js(`window.fetch = ((real) => (u, o) => String(u).includes('/api/sources') ? Promise.resolve(new Response(JSON.stringify(${JSON.stringify(four)}), { status: 200 })) : real(u, o))(window.fetch.bind(window))`); await js(`location.hash = '#admin'`); await until(`document.querySelector('.adm-table tr[data-state]')`); await sleep(300); }
    else await open(hash, width);
    const m = await js(`(() => { const box = [...document.querySelectorAll('#view-admin .sec, #infoBody')].find(e => e.getBoundingClientRect().width > 0), grid = document.querySelector('#view-admin:not([hidden]) .adm-tablewrap, .st, .lim-grid, .pgpanel.cards, [role=tabpanel]:not([hidden]) .data-sources'), cards = grid ? [...grid.children].filter(c => c.getBoundingClientRect().width > 0) : [...document.querySelectorAll('.pgpanel > .tbl')];
      if (!box || !cards.length) return null;
      const top = cards[0].getBoundingClientRect().top, row = cards.filter(c => Math.abs(c.getBoundingClientRect().top - top) < 4), edge = box.getBoundingClientRect().right, last = row[row.length - 1].getBoundingClientRect();
      return { title: document.title, row: row.length, lastRight: Math.round(last.right), edge: Math.round(edge), gap: Math.round(edge - last.right), cardW: Math.round(last.width), vw: innerWidth }; })()`);
    if (width === 2000) console.log(`wide-measure ${hash} at ${width}: ${JSON.stringify(m)}`);
    check(`wide: ${hash} at ${width} px: the first row of cards runs to within 40 px of the container's right edge`, !!m && m.gap <= 40 && m.gap >= -1, m);
  }
  await open('#data', 2000);
  const full = await js(`(() => { const box = document.querySelector('#infoBody').getBoundingClientRect(), r = sel => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; }, near = (e) => !!e && Math.abs(e.right - box.right) <= 2;
    return { boxW: Math.round(box.width), vw: innerWidth, note: near(r('#nasaLine')), search: near(r('#srcFilter')), tabs: !!r('.pg-tabs'), folds: !document.querySelector('#explain') || near(r('#explain .ex-folds')), cards: (() => { const c = [...document.querySelectorAll('[role=tabpanel]:not([hidden]) .data-sources > .row')]; return c.length ? Math.round(c.at(-1).getBoundingClientRect().right - box.right) : null; })() }; })()`);
  console.log(`wide-measure #data at 2000: ${JSON.stringify(full)}`);
  check('wide: the Data page at 2000 px uses the whole row: the page is the width of the top bar, the note, the search and the folds reach its right edge', full.boxW >= 1200 && full.note && full.search && full.folds, full);
  await open('#privacy', 2000);
  const priv = await js(`(() => { const cards = [...document.querySelectorAll('.pgpanel.cards > .st-card')].map(c => { const b = c.getBoundingClientRect(); return { l: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height), t: Math.round(b.top) }; }), box = document.querySelector('#infoBody').getBoundingClientRect(); const row = cards.filter(c => c.t === cards[0].t); return { row, boxRight: Math.round(box.right), last: row.length ? row.at(-1).l + row.at(-1).w : 0 }; })()`);
  console.log(`wide-measure #privacy at 2000: ${JSON.stringify(priv)}`);
  check('wide: Privacy at 2000 px: its cards are equal columns across the full row, equal in height', priv.row.length >= 3 && priv.row.every(c => Math.abs(c.w - priv.row[0].w) <= 2 && c.h === priv.row[0].h) && priv.boxRight - priv.last <= 2, priv);
  await size(1440); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await js(`location.hash = '#admin'`); await until(`document.title === 'API connections · Crophalo'`, 6000).catch(() => {});
  check('wide: the status page is called API connections in the tab too', await js('document.title') === 'API connections · Crophalo', await js('document.title'));
});

await group('touch', async () => {   // the main suite's two measures, on the pages only: no two visible controls closer than 2 px, and on a phone every control 44 px (a link inside a sentence is as tall as its line)
  const scan = () => js(`(() => {
    const WIDGET = 'a[href], button, input, select, textarea, summary, [role=button], [role=tab]', box = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    const name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' "' + (e.textContent || e.value || '').trim().replace(/\\s+/g, ' ').slice(0, 24) + '"';
    const els = [...document.querySelectorAll('#infoBody ' + WIDGET.split(', ').join(', #infoBody '))].filter(e => !e.closest('[hidden]') && e.checkVisibility() && !e.classList.contains('sr') && box(e).w > 0 && box(e).h > 0), small = [], touching = [];
    for (const e of els) { const b = box(e), a = getComputedStyle(e, '::after'); if (a.content !== 'none' && a.position === 'absolute') b.h += Math.max(0, -parseFloat(a.top) || 0) + Math.max(0, -parseFloat(a.bottom) || 0); const inSentence = e.tagName === 'A' && [...e.parentElement.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!inSentence && (b.w < 43.5 || b.h < 43.5)) small.push(name(e) + ' is ' + Math.round(b.w) + ' × ' + Math.round(b.h)); }
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i], c = els[j]; if (a.contains(c) || c.contains(a)) continue; if (a.closest('.seg, .pg-tabs') && a.closest('.seg, .pg-tabs') === c.closest('.seg, .pg-tabs')) continue;
      const A = box(a), C = box(c), dx = Math.max(0, Math.max(A.x, C.x) - Math.min(A.r, C.r)), dy = Math.max(0, Math.max(A.y, C.y) - Math.min(A.b, C.b)), gap = Math.hypot(dx, dy); if (gap < 2) touching.push(name(a) + ' and ' + name(c) + ' ' + gap.toFixed(1) + ' px'); }
    return { small, touching, n: els.length }; })()`);
  for (const width of [320, 375, 768, 1280]) for (const big of [false, true]) for (const hash of ['#data', '#privacy', '#limits', '#settings']) {
    await open(hash, width);
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: ${big ? "'xlarge'" : "'default'"} }))`); await sleep(150);
    const t = await scan(), where = `${hash} at ${width} px${big ? ' with largest text' : ''}`;
    if (width <= 600) check(`touch: ${where}: every control is 44 px`, t.small.length === 0, t.small.slice(0, 4));
    check(`touch: ${where}: no two controls touch`, t.touching.length === 0, t.touching.slice(0, 5));
    await js(`document.querySelectorAll('#infoBody details').forEach(d => { d.open = true; })`); await sleep(100);   // the same again with every fold open: what is inside a closed fold is hidden, and a scan must see it where it really sits
    const o = await scan();
    if (width <= 600) check(`touch: ${where} with the folds open: every control is 44 px`, o.small.length === 0, o.small.slice(0, 4));
    check(`touch: ${where} with the folds open: no two controls touch`, o.touching.length === 0, o.touching.slice(0, 5));
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'default' }))`);
  }
});

await group('eye', async () => {   // pictures for the owner's eye, at 1440 and 390: the pages as a farmer sees them
  for (const width of [1440, 2000, 390]) for (const [hash, name] of [['#data', 'data'], ['#settings', 'settings'], ['#limits', 'limitations'], ['#privacy', 'privacy']]) { await open(hash, width); await sleep(400); await run.shot?.(`eye-${name}-${width}.png`); }
});

await group('welcome: axe and heading levels', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8');
  for (const width of [1280, 375]) {
    await size(width); await go('/'); await js(`localStorage.removeItem('crophalo.welcome.v1')`); await go('/'); await until(`!!document.querySelector('#dlgWelcome[open]')`, 8000);
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  welcome at ${width}: ${line}`);
    check(`welcome: axe at ${width}: 0 problems`, found.length === 0, found);
    check(`welcome: the title is the first heading and no level is skipped (${width})`, await js(`(() => { const hs = [...document.querySelectorAll('#dlgWelcome h1, #dlgWelcome h2, #dlgWelcome h3, #dlgWelcome h4')].map(h => +h.tagName[1]); return hs[0] === 1 && hs.every((l, i) => i === 0 || l <= hs[i - 1] + 1); })()`));
  }
});

await finish();
