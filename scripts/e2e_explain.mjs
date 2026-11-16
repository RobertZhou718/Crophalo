// Crophalo's browser suite for the Data page's "How to read Crophalo" folds and the word cards: each fold opens, the square-size pictures have their text and fit at 320 and 1280 with the largest text,
// the word "i" appears on the real Weather and Satellites markup (drawn from the recorded Barrie answer) and its card opens, closes and leads to the Data page, and axe finds nothing. Runs on the throwaway copy of scripts/e2e_lib.mjs.
// Groups (E2E_ONLY=fit,axe picks some): folds, words, fit, axe. RULE: never loosen a check to make it pass without a written reason beside it. Run: node scripts/e2e_explain.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_explain');
const { ROOT, js, until, tap, click, press, size, go, flat, check, same, group, finish, sleep } = run;
const WELCOME = JSON.stringify({ v: '2026-11-14', at: 'test' });
const FOLDS = ['words', 'ground', 'grid', 'decide', 'crops'];
const openData = async (width = 1280) => { await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await go('/#data'); await until(`!!document.querySelector('#explain .ex-folds')`, 8000); await js(`document.querySelector('#srctab-fit')?.click(), true`); await sleep(400); };   // the folds live on the "How it fits together" tab
const openAll = () => js(`document.querySelectorAll('#explain details').forEach(d => { d.open = true; }), true`);
// the real Weather and Satellites markup, drawn by the screens' own modules from the recorded NASA POWER answer for Barrie (no network), shown in the open view
const POWER = fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'power_barrie.json'), 'utf8');
const screens = () => js(`(async () => {
    const [{ buildSeries }, { computeClimate }, { buildWeather }, { weatherHTML }, { satellitesHTML }] = await Promise.all(['data', 'climate', 'weather-data', 'weather-view', 'satellites-view'].map(m => import('/js/' + m + '.js')));
    const rec = ${POWER}, loc = { lat: rec.geometry.coordinates[1], lon: rec.geometry.coordinates[0] }, series = buildSeries(rec, loc);
    const w = buildWeather({ series, climate: computeClimate(series, loc.lat), forecast: null, loc, now: Date.UTC(2026, 10, 14, 12) });
    document.querySelector('#infoBody').insertAdjacentHTML('afterbegin', '<div id="exScreens">' + weatherHTML(w) + satellitesHTML({}) + '</div>');
  })()`);
const bigText = big => js(`import('/js/settings.js').then(m => m.saveSettings({ text: ${big ? "'xlarge'" : "'default'"} }))`);

await group('folds', async () => {
  await openData();
  same('five folds, all closed at first', await js(`[...document.querySelectorAll('#explain > .ex-folds > details')].map(d => d.id + ':' + d.open)`), FOLDS.map(f => `ex-${f}:false`));
  check('the folds are the first thing on the "How it fits together" tab, and the NASA line is not on that tab', await js(`document.querySelector('#srcpanel-fit').firstElementChild?.id === 'explain' && !document.querySelector('#srcpanel-fit').contains(document.querySelector('#nasaLine'))`));
  check('the reminder is visible without opening anything', await js(`(() => { const r = document.querySelector('#exRemind'); const b = r.getBoundingClientRect(); return b.height > 20 && getComputedStyle(r).visibility === 'visible'; })()`));
  for (const f of FOLDS) {
    await tap(`#ex-${f} > summary`); await sleep(100);
    check(`${f}: opens on a tap`, await js(`document.querySelector('#ex-${f}').open`));
    check(`${f}: it opens on its short lead and one link, with Show more closed`, await js(`!!document.querySelector('#ex-${f} .ex-lead') && document.querySelectorAll('#ex-${f} .ex-b > .ex-src a').length === 1 && !document.querySelector('#ex-${f}-more').open`)); 
    await tap(`#ex-${f} > summary`); await sleep(100);
    check(`${f}: closes again`, !(await js(`document.querySelector('#ex-${f}').open`)));
  }
  await js(`document.querySelector('#ex-words > summary').focus()`); await press('Enter'); await sleep(100);
  check('keys: Enter opens a fold', await js(`document.querySelector('#ex-words').open`));
  await openAll();
  same('the eight words each have a heading', await js(`[...document.querySelectorAll('#ex-words h3')].map(h => h.id)`), ['et', 'anomaly', 'ndvi', 'frost', 'balance', 'gdd', 'rootzone', 'lst'].map(id => `ex-term-${id}`));
  same('three pictures, each with its title and description', await js(`[...document.querySelectorAll('#ex-grid svg[role=img]')].map(s => [s.querySelector('title')?.textContent.length > 5, s.querySelector('desc')?.textContent.length > 20, s.getAttribute('aria-labelledby').split(' ').every(id => document.getElementById(id))])`), [[true, true, true], [true, true, true], [true, true, true]]);
  check('the pictures have the table as their text', await js(`document.querySelectorAll('#ex-grid table tbody tr').length >= 11 && !!document.querySelector('#ex-grid table caption')`));
  check('the four crop roles list crops', await js(`[...document.querySelectorAll('#ex-crops .ex-role')].length === 4 && [...document.querySelectorAll('#ex-crops .ex-role p.small')].every(p => p.textContent.split(',').length >= 3)`));
  check('drawing the page again draws the folds once', await js(`location.hash = '#privacy'; new Promise(r => setTimeout(r, 200)).then(() => { location.hash = '#data'; return new Promise(r => setTimeout(r, 300)); }).then(() => document.querySelectorAll('#explain').length === 1)`));
});

await group('words', async () => {
  await openData();
  await screens();
  await until(`document.querySelectorAll('#exScreens .wordi').length >= 9`, 3000).catch(() => {});
  same('the word "i" is beside each heading that uses a word', await js(`[...document.querySelectorAll('#exScreens .wordi')].map(b => b.closest('[data-fact],[data-tile],[data-card]').dataset.fact ?? b.closest('[data-fact],[data-tile],[data-card]').dataset.tile ?? b.closest('[data-card]').dataset.card).sort()`), ['dry', 'dryyears', 'ecostress', 'free', 'frost', 'hls', 'smap', 'soil', 'warm']);
  check('each "i" is named for its word', await js(`[...document.querySelectorAll('#exScreens .wordi')].every(b => /^What “.+” means$/.test(b.getAttribute('aria-label')))`));
  await tap('[data-tile="warm"] .wordi'); await sleep(150);
  check('the card opens as a named dialog', await js(`!document.querySelector('#wordPop').hidden && document.querySelector('#wordPop').getAttribute('role') === 'dialog' && document.getElementById(document.querySelector('#wordPop').getAttribute('aria-labelledby'))?.textContent === 'Growing degree days'`));
  check('the card says what the Data page says', await js(`(() => { const p = document.querySelector('#wordPop').textContent.replace(/\\s+/g, ' '), d = document.querySelector('#ex-term-gdd').parentElement.querySelector('p').textContent.replace(/\\s+/g, ' '); return p.includes(d); })()`));
  check('the button says the card is open, and focus is in the card', await js(`document.querySelector('[data-tile="warm"] .wordi').getAttribute('aria-expanded') === 'true' && document.querySelector('#wordPop').contains(document.activeElement)`));
  check('the card fits on the screen', await js(`(() => { const b = document.querySelector('#wordPop').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0; })()`));
  await press('Escape'); await sleep(100);
  check('Escape closes it and gives focus back', await js(`document.querySelector('#wordPop').hidden && document.activeElement === document.querySelector('[data-tile="warm"] .wordi') && document.activeElement.getAttribute('aria-expanded') === 'false'`));
  await js(`document.querySelector('[data-card="hls"] .sat-fold').open = true`);   // a satellite card is one closed line (js/satcard.js): opened before its word is pressed
  await tap('[data-card="hls"] .wordi'); await sleep(150);
  check('another word opens its own card', await js(`/NDVI/.test(document.querySelector('#wordPopTitle').textContent)`));
  await click('#wordPop [data-word-go]'); await until(`document.querySelector('#ex-words')?.open === true`, 4000);
  await sleep(350);   // the focus is set again 200 ms after the folds open (the page settles first)
  check('"All the words" opens the Data page at that word', await js(`location.hash === '#data' && document.activeElement?.id === 'ex-term-ndvi'`), await js(`JSON.stringify({ h: location.hash, a: document.activeElement?.id || document.activeElement?.tagName, termExists: !!document.getElementById('ex-term-ndvi'), n: document.querySelectorAll('#explain').length, fitHidden: document.querySelector('#srcpanel-fit')?.hidden })`));
  await size(320); await openData(320);
  await js(`document.querySelector('#infoBody').insertAdjacentHTML('afterbegin', '<article data-fact="frost"><h3>Frost</h3></article>')`); await until(`!!document.querySelector('[data-fact=frost] .wordi')`, 2000);
  await tap('[data-fact="frost"] .wordi'); await sleep(150);
  check('at 320 px the card stays inside the screen', await js(`(() => { const b = document.querySelector('#wordPop').getBoundingClientRect(); return !document.querySelector('#wordPop').hidden && b.left >= 0 && b.right <= innerWidth + 0.5; })()`));
});

await group('fit', async () => {
  for (const width of [320, 1280]) for (const big of [false, true]) {
    await openData(width); await bigText(big); await openAll(); await sleep(200);
    const label = `${width} px${big ? ', largest text' : ''}`;
    const by = await js(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
    check(`fit: ${label}: no sideways scroll with every fold open`, by <= 0, `${by} px too wide`);
    if (by > 0) await flat(`#data, ${label}`);   // names the widest parts when the page is too wide
    const out = await js(`[...document.querySelectorAll('#explain *')].filter(e => !e.closest('.tbl') && !e.closest('svg') && !e.closest('.sr')).map(e => [e, e.getBoundingClientRect()]).filter(([, b]) => b.width && (b.right > innerWidth + 0.5 || b.left < -0.5)).map(([e, b]) => e.tagName + '.' + e.className + ' ' + Math.round(b.left) + '–' + Math.round(b.right)).slice(0, 5)`);
    check(`fit: ${label}: nothing sticks out of the screen`, out.length === 0, out);
    check(`fit: ${label}: each picture fits its column`, await js(`[...document.querySelectorAll('#ex-grid .ex-panel svg')].every(s => { const b = s.getBoundingClientRect(), p = s.closest('.ex-panel').getBoundingClientRect(); return b.width > 200 && b.right <= p.right + 0.5 && b.right <= innerWidth; })`));
    check(`fit: ${label}: the wide table scrolls in its own box`, await js(`(() => { const t = document.querySelector('#ex-grid .tbl'); return t.getBoundingClientRect().right <= innerWidth + 0.5; })()`));
    const small = await js(`[...document.querySelectorAll('#explain summary, #explain .listen:not([hidden])')].map(e => [e, e.getBoundingClientRect()]).filter(([, b]) => b.height < 43.5).map(([e, b]) => e.tagName + ' ' + Math.round(b.height))`);
    check(`fit: ${label}: every fold and Show more is at least 44 px high`, small.length === 0, small);
    await js(`document.querySelector('#ex-grid').scrollIntoView({ block: 'start', behavior: 'instant' }), true`); await run.shot(`explain-grid-${width}${big ? '-largest' : ''}.png`);   // only when E2E_SHOTS names a folder outside the project
    await bigText(false);
  }
});

await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) for (const opened of [false, true]) {
    await openData(width); if (opened) await openAll();
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  #data at ${width}${opened ? ', folds open' : ''}: ${line}`);
    check(`axe: #data at ${width}${opened ? ' with every fold open' : ''}: 0 problems`, found.length === 0, `${found.length} found`);
  }
  await openData(1280);
  await screens(); await until(`!!document.querySelector('[data-tile=warm] .wordi')`, 2000);   // the real Weather and Satellites markup, so the headings are in their real order
  await tap('[data-tile="warm"] .wordi'); await sleep(150);
  if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
  const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
  for (const line of found) console.log(`axe  word card: ${line}`);
  check('axe: the open word card: 0 problems', found.length === 0, `${found.length} found`);
});

await finish();
