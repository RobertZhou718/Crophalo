// Crophalo's Share or print suite in a real browser: the button on the report, the sheet with its two actions (Print and Save as PDF) and the line about the print window, and the printed document itself:
// the page made ready for paper (title block, every fold open), read under the print style, printed to a PDF with the browser's own engine, and put back.
// RULE: never loosen a check to make it pass. Run: node scripts/e2e_share.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';
import { PRESETS } from '../js/crops.js';

const run = await openRun('e2e_share');
const { ROOT, js, page, until, seen, tap, press, size, go, check, same, group, finish, sleep, shot, send } = run;
const HERE = path.dirname(fileURLToPath(import.meta.url)), fx = n => fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8'), rec = n => { const t = fx(`open-meteo/${n}.rec`); return t.slice(t.indexOf('\n') + 1); };
const POWER = fx('power_barrie.json'), REC = JSON.parse(POWER);
const ENS = rec('ensemble-oxford'), SEAS = rec('seasonal-oxford'), CLIM = rec('climate-oxford'), POWERO = fx('power_oxford.json');
const JUDGE = (fs.readFileSync(path.join(HERE, 'e2e_ahead.mjs'), 'utf8').match(/^const JUDGE = (`.*`);$/m) ?? [])[1];
const WHEAT = { seasons: [{ crop: 'wheat', sow: '2026-10-05', harvest: '2027-07-20' }] };
const REGION = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8'))[0];
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const accepted = () => js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }))})`);
const quietApi = () => js(`window.fetch = (f => async (url, ...rest) => /\\/api\\/(smaproot|cropsnear|crophist|imergrain|gracecell|ecopass|hlsndvi|hlsbox|ndvihist|firms|osm|osmextra|sources|keys|dem|prices|faostat)/.test(url) ? ({ json: async () => ({ ok: false }) }) : f(url, ...rest))(window.fetch)`);
const fresh = async (width = 1280) => { await size(width); await go('/'); await accepted(); await go('/'); await until(`!/^a demo field$/.test(document.querySelector('#tryRegion')?.textContent || 'a demo field')`); await quietApi(); };
const FIXTURE = `(() => { const s = (year, crop, sow, harvest, after, window = null) => ({ year, crop, sow, harvest, after, residueUntil: null, window });
  const now = { id: 'now', name: 'Now', kind: 'current', seasons: [s(1, 'corn', '2027-05-01', '2027-10-05', 'residue'), s(2, 'soy', '2028-05-20', '2028-10-01', 'residue'), s(3, 'corn', '2029-05-01', '2029-10-05', 'residue')], score: 62, scores: { water: 60, soil: 55, erosion: 40, income: 80, weather: 70 } };
  const wheat = { id: 'wheat', name: 'With winter wheat', kind: 'proposed', seasons: [now.seasons[0], now.seasons[1], s(3, 'wheat', '2028-10-05', '2029-07-25', 'cover', { earliest: '2028-09-25', latest: '2028-10-15' })], score: 71, scores: { water: 65, soil: 75, erosion: 78, income: 70, weather: 68 } };
  const other = { id: 'other', name: 'Barley', kind: 'proposed', seasons: [s(1, 'barley', '2027-04-20', '2027-08-01', 'bare')] };
  return { ok: true, current: now, recommended: wheat, others: [other], reason: 'Winter wheat keeps living roots on the field after soybeans.', evidence: [{ text: 'No stress thresholds crossed in 26 tested years.', sources: ['power', 'gpm'] }], gaps: ['Soil is assumed, not measured.'], risks: ['A late harvest squeezes the wheat window.'], sureness: 'Somewhat sure' }; })()`;
const SYNTH = `(async () => { const d = await import('/js/data.js'), wd = await import('/js/weather-data.js'), cl = await import('/js/climate.js'); const loc = { lat: ${REGION.lat}, lon: ${REGION.lon} };
  const pad2 = n => String(n).padStart(2, '0'), key = (y, m, dd) => '' + y + pad2(m) + pad2(dd), P = { T2M_MAX: {}, T2M_MIN: {}, PRECTOTCORR: {}, IMERG_PRECTOT: {}, GWETROOT: {}, EVLAND: {} };
  for (let t = Date.UTC(2001, 0, 1), i = 0; t <= Date.UTC(2026, 10, 12); t += 864e5, i++) { const dt = new Date(t), y = dt.getUTCFullYear(), k = key(y, dt.getUTCMonth() + 1, dt.getUTCDate()), doy = Math.round((t - Date.UTC(y, 0, 1)) / 864e5) + 1, hi = 11 + 15 * Math.sin(2 * Math.PI * (doy - 110) / 365) + (y % 3); P.T2M_MAX[k] = hi; P.T2M_MIN[k] = hi - 9; const r = (i * 7 + y) % 9 === 0 ? 6 + (y % 4) : 0.3; P.PRECTOTCORR[k] = r; P.IMERG_PRECTOT[k] = r; P.GWETROOT[k] = 0.5; P.EVLAND[k] = 2; }
  const answer = { geometry: { coordinates: [loc.lon, loc.lat, 300] }, header: { fill_value: -999, time_standard: 'UTC' }, properties: { parameter: P } };
  const series = d.buildSeries(answer, loc), today = Date.now(), days = Array.from({ length: 46 }, (_, i) => new Date(today + (i - 30) * 864e5).toISOString().slice(0, 10));
  const fc = { utc_offset_seconds: 0, timezone: 'UTC', elevation: 300, daily: { time: days, temperature_2m_max: days.map((_, i) => 12 + (i % 5)), temperature_2m_min: days.map((_, i) => i % 7 === 3 ? -1 : 4), precipitation_sum: days.map((_, i) => i % 4 === 0 ? 6 : 0), precipitation_probability_max: days.map(() => 20), wind_speed_10m_max: days.map(() => 12), wind_direction_10m_dominant: days.map(() => 200), weather_code: days.map(() => 1), sunrise: days.map(d => d + 'T07:00'), sunset: days.map(d => d + 'T17:00'), et0_fao_evapotranspiration: days.map(() => 1) } };
  return wd.buildWeather({ series, climate: cl.computeClimate(series, loc.lat), forecast: fc, loc }); })()`;
const IMERG_JS = `(async () => { const sd = await import('/js/satellites-data.js'), t0 = Date.UTC(2026, 9, 15), pat = [0.17, 5.28, 0, 0, 1.2, 12.4, 0.3, 0, 0, 7.1]; const days = Array.from({ length: 30 }, (_, i) => [new Date(t0 + i * 864e5).toISOString().slice(0, 10), i === 5 ? null : pat[i % 10], i === 5 ? null : i >= 28 ? 'early' : 'late']); return sd.cleanRain({ ok: true, cell: { width_km: 8.1, height_km: 11.1 }, days }); })()`;
const DEM_JS = `({ ok: true, words: 'a stand-in height map, one every 2.0 m. Bare ground: trees and buildings are not in it.', name: 'a stand-in height map', srcKey: 'dem', height: 312, slope: 3.1, downhill: 200, cells: 400, tooSmall: false, band: '2 to 6%', resolution: 2 })`;
const showReport = async (withWeather = false, loaded = false, cc = 'CA') => { await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'); const a = await import('/js/app.js'); a.show('report'); const state = { ...st.newState(), loc: { lat: ${REGION.lat}, lon: ${REGION.lon}, label: ${JSON.stringify(REGION.name)}, cc: ${JSON.stringify(cc)} }, name: ${JSON.stringify(REGION.name)}, soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }; await m.renderResult(state, ${FIXTURE}, { ${withWeather ? `weather: await ${SYNTH},` : ''} ${loaded ? `imerg: await ${IMERG_JS}, dem: ${DEM_JS}, reading: { label: 'Moisture around the roots', value: 0.31, date: '2026-11-12', km: 9, lat: ${REGION.lat}, lon: ${REGION.lon}, source: 'smap' }` : ''} }); })`); await until(`!!document.querySelector('#answer')`); await sleep(220); };   // the app moves the keyboard to the new heading 80 ms after a screen opens: let that settle before a key test
const openHist = async (width, big = false) => {
  await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); localStorage.setItem('crophalo.settings.v1', ${JSON.stringify(JSON.stringify({ text: big ? 'xlarge' : 'default' }))})`); await go('/#data'); await until(`document.querySelector('#infoBody')`);
  await js(`(async () => { const d = await import('/js/data.js'), v = await import('/js/history-view.js'); const R = ${POWER}; window.__clip = ''; navigator.clipboard.writeText = async t => { window.__clip = t; }; window.__printed = 0; window.print = () => { window.__printed++; window.__paper = document.querySelector('#printRoot')?.innerText ?? ''; window.__bodyClass = document.body.className; dispatchEvent(new Event('afterprint')); };
    const series = d.buildSeries(R, { lat: ${REC.geometry.coordinates[1]}, lon: ${REC.geometry.coordinates[0]} }); document.querySelector('#infoBody').innerHTML = ''; window.__hist = v.openHistory(document.querySelector('#infoBody'), { farm: { name: 'North farm', place: 'Oxford County, Ontario' }, fields: [{ name: 'North field' }], series }); })()`);
  await until(`document.querySelector('.hist .hcard')`); await sleep(250);
};
const openAhead = async (width, opts = {}) => {
  await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME})`); await go('/#data'); await until(`document.querySelector('#infoBody')`);
  await js(`(async () => {
    for (const h of ['css/app.css', 'css/history.css', 'css/ahead.css']) if (!document.querySelector('link[href="' + h + '"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; document.head.append(l); }
    const d = await import('/js/data.js'), v = await import('/js/ahead-view.js'), L = await import('/js/ahead-load.js'), C = await import('/js/ahead-client.js');
    const bodies = { ensemble: ${JSON.stringify(ENS)}, seasonal: ${JSON.stringify(SEAS)}, climate: ${JSON.stringify(CLIM)} }; window.__req = []; window.__active = 0; window.__max = 0; window.__busy = ${JSON.stringify(opts.busy ?? '')};
    const stub = async url => { const kind = /ensemble-api/.test(url) ? 'ensemble' : /seasonal-api/.test(url) ? 'seasonal' : 'climate'; window.__req.push(kind + ':' + (new URL(url).searchParams.get('models') ?? '')); window.__active++; window.__max = Math.max(window.__max, window.__active); await new Promise(r => setTimeout(r, 25)); window.__active--;
      if (window.__busy && kind === window.__busy) return { ok: false, status: 429, text: async () => '' }; return { ok: true, status: 200, text: async () => bodies[kind] }; };
    const series = d.buildSeries(${POWERO}, { lat: 43.13, lon: -80.75 });
    const client = C.createAheadClient({ judgeUrl: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(JUDGE)}) });
    window.__client = client; window.__ahead = v.openAhead(document.querySelector('#infoBody'), { loader: L.createAheadLoader({ fetch: stub, store: L.createStore(), visible: () => true }), client, field: { name: 'North field', lat: 43.13, lon: -80.75, elev: 298 }, plan: ${JSON.stringify(WHEAT)}, series, today: '2026-11-14', planName: 'Winter wheat', year: 2027, youngCrop: 'young wheat' });
  })()`);
  await until(`document.querySelector('.ahead')`);
};


const open = async (width = 1280, cc = 'CA') => { await fresh(width); await showReport(true, true, cc); await sleep(600); await js(`window.__printed = 0; window.print = () => { window.__printed++; window.__ready = { title: document.querySelectorAll('#printTitle').length, root: document.documentElement.className }; setTimeout(() => dispatchEvent(new Event('afterprint')), 50); }; window.__saved = []; URL.createObjectURL = b => { window.__saved.push(b); return 'blob:x'; }; HTMLAnchorElement.prototype.click = function () { window.__name = this.download; };`); await js(`document.querySelector('#rbShare').click()`); await until(`document.querySelector('dialog.share-sheet[open]')`); await sleep(200); };
await group('sheet', async () => {
  await open();
  check('share: the report has a Print or save button, and it is not a primary', await js(`document.querySelector('#rbShare').textContent.trim() === 'Print or save' && !document.querySelector('#rbShare').classList.contains('primary')`));
  check('share: the sheet opens as a dialog with its title and the keyboard inside it', await js(`document.querySelector('#shareTitle').textContent === 'Print or save' && !!document.activeElement.closest('dialog.share-sheet')`));
  same('share: exactly two actions, Print and Save as PDF', await js(`[...document.querySelectorAll('dialog.share-sheet [data-share]')].filter(b => b.dataset.share !== 'close').map(b => b.textContent.trim())`), ['Print', 'Save as PDF']);
  check('share: one short line under them says to choose Save as PDF in the print window', await js(`document.querySelector('#shareSaveNote').textContent === 'In the print window choose Save as PDF.'`));
  check('share: no text box, no tick, no file button is left on the sheet', await js(`!document.querySelector('dialog.share-sheet textarea, dialog.share-sheet input, dialog.share-sheet select')`));
  check('share: every control on the sheet is 44 px high', await js(`[...document.querySelectorAll('.share-sheet .btn')].every(b => b.getBoundingClientRect().height >= 43.5)`));
  await shot('share-sheet-1280.png');
  await js(`document.querySelector('[data-share=close]').click()`); await sleep(200);
  check('share: Close closes the sheet and returns the keyboard to Print or save', await js(`!document.querySelector('dialog.share-sheet') && document.activeElement.id === 'rbShare'`));
  await js(`document.querySelector('#rbShare').click()`); await until(`document.querySelector('dialog.share-sheet[open]')`); await js(`document.querySelector('[data-share=pdf]').click()`); await sleep(500);
  check('share: Save as PDF closes the sheet and opens the print window once, with the page made ready (title block, class), then puts it back', await js(`window.__printed === 1 && window.__ready.title === 1 && /print-doc/.test(window.__ready.root) && !document.querySelector('dialog.share-sheet') && !document.querySelector('#printTitle') && !document.documentElement.classList.contains('print-doc')`), await js('window.__ready'));
});
const PARTS = ['What should I plant next?', 'Compare strategies', 'What could go wrong?', 'When do I do what?', 'More about your field'], FIVE = ['Why it was suggested', 'What evidence supports it', 'What benefits it may offer', 'Where information is missing', 'Risks to check locally'];
// The document as paper reads it: the page made ready by printdoc.js, the print style on (the emulated media), measured, printed to a PDF, and put back.
const paper = async (what) => {
  await js(`document.querySelector('dialog.share-sheet')?.close(); document.querySelector('dialog.share-sheet')?.remove()`);
  await js(`window.__prep = null; import('/js/printdoc.js').then(async m => { await m.printStyle(document); window.__before = [...document.querySelectorAll('#view-report details')].map(d => d.open); window.__prep = m.preparePrint(document, ${JSON.stringify(what)}); window.__mod = m; })`); await until(`!!window.__prep`, 8000);
  await send('Emulation.setEmulatedMedia', { media: 'print' }); await sleep(300);
  const seenNow = await js(`(() => { const v = document.querySelector('#view-report'), vis = e => e.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }) && e.getBoundingClientRect().height > 0;
    const heads = [...v.querySelectorAll('h2')].filter(vis).map(h => h.textContent.trim()), h3 = [...v.querySelectorAll('.srow')].map(r => [...r.querySelectorAll('h3')].filter(vis).map(h => h.textContent.trim())),
      controls = [...v.querySelectorAll('button, input, select, textarea, [data-act], a.btn, .srci')].filter(vis).map(e => e.tagName + ' ' + (e.textContent || e.id || '').trim().slice(0, 24)),
      shut = [...v.querySelectorAll('details')].filter(d => !d.open).length, title = document.querySelectorAll('#printTitle').length, titleText = document.querySelector('#printTitle')?.innerText ?? '', titleShown = !!document.querySelector('#printTitle') && vis(document.querySelector('#printTitle')),
      barShown = [...document.querySelectorAll('#reportBar, .reportbar, nav, .nav')].filter(vis).length, text = v.innerText, name = document.title;
    return { heads, h3, controls, shut, title, titleText, titleShown, barShown, text, docTitle: name }; })()`);
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
  const bin = Buffer.from(pdf.data, 'base64').toString('latin1'), pages = (bin.match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
  await send('Emulation.setEmulatedMedia', { media: '' });
  await js(`window.__prep.restore()`); await sleep(200);
  const back = await js(`({ title: document.querySelectorAll('#printTitle').length, cls: document.documentElement.classList.contains('print-doc'), same: JSON.stringify([...document.querySelectorAll('#view-report details')].map(d => d.open)) === JSON.stringify(window.__before), now: [...document.querySelectorAll('#view-report details')].map(d => d.open), before: window.__before, titleNow: document.title })`);
  return { ...seenNow, pages, bytes: pdf.data.length, back };
};
await group('document', async () => {
  await open(1280);
  const info = { name: 'North field', place: 'Near Barrie, Ontario · 44.44114, -79.65732', size: '10.0 ha', madeOn: '15 November 2026' };
  const p = await paper(info);
  check('document: one title block with the name, the place and size, the day made and the line about who decides', p.title === 1 && /North field/.test(p.titleText) && /Near Barrie, Ontario/.test(p.titleText) && /10\.0 ha/.test(p.titleText) && /Report made on 15 November 2026/.test(p.titleText) && /Crophalo: a guide, you decide what to plant\./.test(p.titleText), p.titleText);
  check('document: the title block shows on paper, the report bar does not', p.titleShown && p.barShown === 0, [p.titleShown, p.barShown]);
  check('document: every part of the page is there once with its heading, in order', PARTS.every(t => p.heads.filter(h => h === t).length === 1) && PARTS.map(t => p.heads.indexOf(t)).every((i, k, a) => i >= 0 && (k === 0 || i > a[k - 1])), p.heads);
  check('document: every strategy shows the parts it has (never an empty one), in the order why, evidence, benefits, missing, risks, and the first two show at least three', p.h3.length >= 2 && p.h3.every(list => list.every(t => FIVE.includes(t)) && list.map(t => FIVE.indexOf(t)).every((i, k, a) => k === 0 || i > a[k - 1])) && p.h3.slice(0, 2).every(list => list.length >= 3), p.h3);
  check('document: page one has the answer at a glance, three rows, before the full parts', /The three strategies at a glance/.test(p.text) && p.text.indexOf('at a glance') < p.text.indexOf('Compare strategies') && /No change\. This is your field today\./.test(p.text.slice(p.text.indexOf('at a glance'), p.text.indexOf('Compare strategies'))), p.text.slice(0, 600));
  check('document: an empty part and a money line with no figure are not printed (no "listed yet", no "No money figure")', !/are listed yet|None listed yet|No money figure/.test(p.text), p.text.match(/[^\n]*(listed yet|No money figure)[^\n]*/)?.[0]);
  check('document: no button, field or "i" is printed', p.controls.length === 0, p.controls);
  check('document: no fold is left closed', p.shut === 0, p.shut);
  check('document: the sources and the not-advice line are on it', /Where the numbers come from/.test(p.text) && /guide|decide/i.test(p.text), p.text.slice(-300));
  check(`document: more than one page (${p.pages} pages, ${Math.round(p.bytes * 0.75 / 1024)} KB)`, p.pages > 1, p.pages);
  check('document: the print window offers a file name with the field and the date', p.docTitle === 'Crophalo report – North field – 15 November 2026', p.docTitle);
  check('document: after printing the page is as it was (no title block, no class, every fold as it was)', p.back.title === 0 && !p.back.cls && p.back.same, p.back);
});
await group('document units', async () => {
  await open(1280, 'US');
  const p = await paper({ name: 'Home field', place: 'Near Mead, Nebraska', size: '25.0 acres', madeOn: '15 November 2026' });
  check('document: a United States field prints in its own units (inches, °F and acres, no mm or °C)', /°F/.test(p.text) && !/\d\s?°C/.test(p.text) && !/\d\s?mm\b/.test(p.text), p.text.match(/[^.\n]*(°C|\bmm\b)[^.\n]*/)?.[0]);
});
await group('pdf files', async () => {   // the real files, for the eye: E2E_PDF=<folder> writes report-a4.pdf and report-letter.pdf of the report made ready as the sheet makes it
  const dir = process.env.E2E_PDF; if (!dir) return;
  await open(1280, 'US');
  await js(`document.querySelector('dialog.share-sheet')?.close(); document.querySelector('dialog.share-sheet')?.remove()`);
  await js(`window.__prep = null; import('/js/printdoc.js').then(async m => { await m.printStyle(document); window.__prep = m.preparePrint(document, { name: 'Home field', place: 'Near Mead, Nebraska · 41.17947, -96.43976', size: '25.0 acres', madeOn: '15 November 2026' }); })`); await until(`!!window.__prep`, 8000);
  await send('Emulation.setEmulatedMedia', { media: 'print' }); await sleep(500);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, w, h] of [['a4', 8.27, 11.69], ['letter', 8.5, 11]]) {
    const pdf = await send('Page.printToPDF', { printBackground: true, paperWidth: w, paperHeight: h, preferCSSPageSize: true, displayHeaderFooter: false });
    fs.writeFileSync(path.join(dir, `report-${name}.pdf`), Buffer.from(pdf.data, 'base64'));
  }
  await send('Emulation.setEmulatedMedia', { media: '' }); await js(`window.__prep.restore()`);
});
await group('browser print', async () => {   // Ctrl+P and the menu's Print give the same document as the sheet
  await open(1280);
  await js(`document.querySelector('dialog.share-sheet')?.close(); document.querySelector('dialog.share-sheet')?.remove()`);
  await js(`import('/js/printdoc.js').then(m => { window.__armed = m.armPrint(); })`); await until(`window.__armed !== undefined`);
  const before = await js(`dispatchEvent(new Event('beforeprint')), ({ title: document.querySelectorAll('#printTitle').length, cls: document.documentElement.classList.contains('print-doc'), name: document.querySelector('#printTitle .pd-name')?.textContent, glance: !!document.querySelector('#printGlance'), open: [...document.querySelectorAll('#view-report details')].every(d => d.open) })`);
  check('browser print: asking to print makes the page ready (one title block with the field\'s name, every fold open, the glance, the print class)', before.title === 1 && before.cls && before.name && before.glance && before.open, before);
  const after = await js(`dispatchEvent(new Event('afterprint')), ({ title: document.querySelectorAll('#printTitle').length, cls: document.documentElement.classList.contains('print-doc'), glance: !!document.querySelector('#printGlance') })`);
  check('browser print: when it is done the page is given back', after.title === 0 && !after.cls && !after.glance, after);
});
await group('fit', async () => {
  for (const width of [320, 375, 768, 1280]) for (const big of [false, true]) {
    await fresh(width); if (big) { await js(`localStorage.setItem('crophalo.settings.v1', JSON.stringify({ text: 'xlarge' }))`); await go('/'); await sleep(300); await quietApi(); }
    await showReport(true, true); await sleep(500); await js(`document.querySelector('#rbShare').click()`); await until(`document.querySelector('dialog.share-sheet[open]')`); await sleep(300);
    check(`fit: the sheet does not scroll the page sideways at ${width} px${big ? ' with the largest text' : ''}`, await js(`document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0 && (() => { const d = document.querySelector('dialog.share-sheet').getBoundingClientRect(); return d.left >= -0.5 && d.right <= innerWidth + 0.5; })()`));
    await js(`localStorage.removeItem('crophalo.settings.v1')`);
  }
});
await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) for (const view of ['menu']) {
    await open(width); if (view === 'adviser') { await js(`document.querySelector('[data-share=adviser]').click()`); await sleep(250); }
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  share ${view} at ${width}: ${line}`);
    check(`axe: the ${view} view at ${width}: 0 problems`, found.length === 0, `${found.length} found`);
  }
});
await finish();
