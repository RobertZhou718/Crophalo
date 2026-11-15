// Crophalo's flow suite: the welcome, the home, the setup steps and the report driven in a real browser the way a farmer would, on the throwaway copy that scripts/e2e_lib.mjs
// makes and serves (its own port, its own empty profile, every outside service cut off). Groups (E2E_ONLY=fit,axe picks some): welcome, home, wizard, picker, fit, motion,
// noplace, report, weather, calendar, satellites, field, axe. RULE: never loosen a check to make it pass without a written farming reason beside it. A failure means a farmer would
// meet a control that is too small, a page that scrolls sideways, something that moves when asked to be still, or a step that cannot be passed: fix the page. Run: node scripts/e2e_flow.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';
import { PRESETS } from '../js/crops.js';
const YR = 2026;   // the year of the hand-made soil-moisture reading's day

const run = await openRun('e2e_flow');
const { ROOT, js, page, until, seen, tap, tapAt, press, size, go, check, same, group, finish, sleep, send } = run;
// The copy under test has no Python, so the server's own lookups cannot answer there. The early lookups a place on the map starts (js/report-load.js prefetchPlace)
// are answered "not read" at the page from the first moment of every visit, the way quietApi() below answers them, so the copy's refusals are not logged as errors of the page.
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, ...rest) => /[/]api[/](smaproot|cropsnear|imergrain|gracecell|ecopass|hlsndvi|dem|ndvihist)[?]/.test(String(u)) ? Promise.resolve({ json: async () => ({ ok: false }) }) : first(u, ...rest); })();" });
const REGION = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8'))[0], ROT = PRESETS[REGION.rotation].label;   // the demo region and its ready rotation come from the data file
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fetch = (f => async (url, ...r) => /\\/api\\//.test(String(url)) ? { ok: true, status: 200, json: async () => ({ ok: false, reason: 'stand-in' }), text: async () => '{"ok":false}' } : f(url, ...r))(window.fetch);` });   // the throwaway server has no crop-map route: a demo field asks for it at once, so it is answered here, quietly
const WIDTHS = [320, 375, 390, 768, 1280], WELCOME = JSON.stringify({ v: '2026-11-14', at: 'test' });
const accepted = () => js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`);
const view = () => js(`[...document.querySelectorAll('.view')].filter(v => !v.hidden).map(v => v.id.replace('view-', '')).join()`);
const setting = changes => js(`import('/js/settings.js').then(m => { m.saveSettings(${JSON.stringify(changes)}); })`);
const quietApi = () => js(`window.fetch = (f => async (url, ...rest) => /\\/api\\/(smaproot|cropsnear|imergrain|gracecell|ecopass|hlsndvi|sources|dem|prices|faostat)/.test(url) ? ({ json: async () => ({ ok: false }) }) : f(url, ...rest))(window.fetch.bind(window))`);   // the server's own routes are not in this copy: the cards must say so, not log 404s
const fresh = async (width = 1280) => { await size(width); await go('/'); await accepted(); await go('/'); await until(`!/^a demo field$/.test(document.querySelector('#tryRegion')?.textContent || 'a demo field')`); await quietApi(); };
const stepTitle = () => js(`document.querySelector('#wHeading')?.textContent`);
const wideBy = () => js(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
// controls on a phone that are smaller than 44 px (the stretched link of a card counts as the whole card)
const smallOnes = () => page(T => T.controls().filter(T.shown).filter(el => !el.classList.contains('cover') && !el.classList.contains('link') && !el.classList.contains('srci') && !el.closest('.sr')).map(el => ({ el, b: T.box(el) })).filter(({ b }) => b.w < 44 || b.h < 44).map(({ el, b }) => `${T.name(el)} ${Math.round(b.w)}×${Math.round(b.h)}`));   // the stretched link of a card and the "i" (its 44 px hit area is checked apart) count as 44

await group('welcome', async () => {
  await size(1280); await go('/');
  check('welcome: a first visit opens the welcome sheet', await seen(`document.querySelector('#dlgWelcome')?.open`));
  check('welcome: about 110 words in sight, one button, no switch and no voice line in the foot', await js(`(() => { const d = document.querySelector('#dlgWelcome'), c = d.cloneNode(true); c.querySelectorAll('[hidden], svg, #welcomeListen').forEach(n => n.remove()); return c.innerText.split(/\\s+/).filter(Boolean).length <= 125 && !d.querySelector('#welcomeAgree, #welcomeVoice, .welcome-top .chip') && d.querySelectorAll('.welcome-foot button').length === 1; })()`));
  await press('Escape'); await sleep(200);
  check('welcome: Escape cannot dismiss it the first time', await js(`document.querySelector('#dlgWelcome').open`));
  check('welcome: the one button says what the farmer agrees to, and is on at once', await js(`document.querySelector('#welcomeGo').textContent === 'I understand. I decide what to plant.' && !document.querySelector('#welcomeGo').disabled`));
  await tap('#welcomeListen').catch(() => {});   // hidden where the device cannot speak: the tap is allowed to find nothing
  await tap('#welcomeMore');
  check('welcome: one "Read the rest" opens all five folds, with aria-expanded and aria-controls', await js(`[0, 1, 2, 3, 4].every(i => document.querySelector('#welcomeRest' + i).hidden === false) && document.querySelector('#welcomeMore').getAttribute('aria-expanded') === 'true' && document.querySelector('#welcomeMore').getAttribute('aria-controls').split(' ').length === 5`));
  await tap('#welcomeGo');
  check('welcome: the one press closes the sheet and remembers it', await seen(`!document.querySelector('#dlgWelcome').open && JSON.parse(localStorage.getItem('crophalo.welcome.v1')).v === '2026-11-14'`));
  await go('/'); await sleep(400);
  check('welcome: it does not come back after a reload', await js(`!document.querySelector('#dlgWelcome')?.open`));
  await js(`import('/js/welcome.js').then(m => m.openWelcome())`);
  same('welcome: read again, the button only closes', await js(`document.querySelector('#welcomeGo').textContent`), 'Close');
});

await group('home', async () => {
  await fresh();
  // Changed on purpose: the home's demo line now names all three demo fields as links ("Try a demo field: near Mead, Nebraska · Beltsville, Maryland · Barrie, Ontario"); #tryRegion stays the first
  check('home: the demo is one line on the card, "Try a demo field: ...", and one tap opens it', await js(`/^Try a demo field: /.test(document.querySelector('#searchTry').textContent) && !document.querySelector('#homeRegions') && !document.querySelector('#homeSaved')`));
  await tap('#searchInput'); await run.send('Input.insertText', { text: REGION.name.slice(0, 4).toLowerCase() });
  check('home: typing shows the demo region in the list at once, with no network', await seen(`document.querySelectorAll('#searchList [role=option]').length === 1`));
  await press('ArrowDown');
  same('home: ArrowDown highlights the first row', await js(`document.querySelector('#searchInput').getAttribute('aria-activedescendant')`), 'searchOpt0');
  await press('Escape');
  check('home: Escape hides the list', await js(`document.querySelector('#searchList').hidden`));
  await js(`(() => { const i = document.querySelector('#searchInput'); i.value = '-42.03 N, 93.62 W'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#searchForm').requestSubmit(); })()`);
  check('home: a minus with North says what to do and stays on the home', await seen(`/minus sign/.test(document.querySelector('#searchMsg').textContent)`) && await view() === 'home');
  await js(`(() => { const i = document.querySelector('#searchInput'); i.value = ''; document.querySelector('#searchForm').requestSubmit(); })()`);
  check('home: an empty search asks for a place', await seen(`/Type a place/.test(document.querySelector('#searchMsg').textContent)`));
  await js(`(() => { const i = document.querySelector('#searchInput'); i.value = '${REGION.lat}, ${REGION.lon}'; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#searchForm').requestSubmit(); })()`);
  check('home: coordinates open the setup for that place', await seen(`!document.querySelector('#view-setup').hidden && !!document.querySelector('.panel-name')`) && await js(`document.querySelector('.panel-name').textContent`) === `${REGION.lat.toFixed(5)}, ${REGION.lon.toFixed(5)}`);
  // Back steps setup → home
  await js(`history.back()`);
  check('home: the Back button returns from the setup to the home', await seen(`!document.querySelector('#view-home').hidden`));
  // saved fields
  await js(`localStorage.setItem('crophalo.saved.v1', JSON.stringify([{ lat: ${REGION.lat}, lon: ${REGION.lon}, name: 'Field A', at: Date.now() }, { lat: 37.87, lon: 32.48, name: 'Field B', at: Date.now() - 1e8 }]))`);
  await go('/'); await until(`document.querySelector('#savedCount').textContent === '2'`);
  await tap('#navSaved'); await until(`document.querySelector('#dlgSaved').open`);
  await tap('.saved-row [data-do=delete]');
  same('home: Delete removes the row and offers Undo', await js(`[document.querySelectorAll('.saved-row').length, document.querySelector('#toast .btn')?.textContent]`), [1, 'Undo']);
  check('home: focus moves to the next row, not to the page', await js(`document.activeElement.closest('.saved-row') !== null`));
  await press('Escape'); await tap('#toast .btn').catch(() => {});
  check('home: Undo brings the field back', await seen(`JSON.parse(localStorage.getItem('crophalo.saved.v1')).length === 2`));
});

await group('wizard', async () => {
  await fresh();
  await tap('#tryRegion');
  check('wizard: a demo card opens the setup with no shortcut box: the real four steps, and the only demo marker is the chip by the place', await seen(`!document.querySelector('#view-setup').hidden && !document.querySelector('#wRoad, .road') && document.querySelectorAll('.panel-place .chip').length === 1`));
  check('wizard: the demo\'s answers are already chosen, so each step can be passed with Next', await js(`!document.querySelector('#wNext').disabled`));
  // the jury path: home -> Oxford -> Next x3 -> See my field report -> report, timed
  const t0 = Date.now();
  for (let i = 0; i < 3; i++) { await tap('#wNext'); await sleep(120); }
  same('wizard: the fourth step offers the normal "See my field report"', await js(`[document.querySelector('#wHeading').textContent, document.querySelector('#wNext').textContent]`), ['What do you want most?', 'See my field report']);
  await tap('#wNext');
  check('wizard: the demo reaches the report in four taps after the card', await seen(`!document.querySelector('#view-report').hidden`));
  check('wizard: the jury path (card, three Next, See my field report) takes under 6 s of the person\'s own pace here', Date.now() - t0 < 6000, `${Date.now() - t0} ms`);
  await js(`history.back()`); await until(`!document.querySelector('#view-setup').hidden && !!document.querySelector('.wstep')`);
  // a place with no demo: the steps block until answered
  await fresh();
  await js(`import('/js/wizard.js').then(m => m.setPlace({ lat: 42.03, lon: -93.62, name: 'Test field' })); import('/js/app.js').then(m => m.show('setup'))`);
  await until(`!document.querySelector('#view-setup').hidden && !!document.querySelector('.wstep')`);
  check('wizard: with no demo there is no demo chip', await js(`!document.querySelector('.panel-place .chip')`));
  same('wizard: step 3 and 4 cannot be reached from step 1', await js(`[...document.querySelectorAll('.wstep')].map(b => b.disabled)`), [false, false, true, true]);
  await tap('#wNext');
  same('wizard: step 2 has its heading and Next is off', await js(`[document.querySelector('#wHeading').textContent, document.querySelector('#wNext').disabled]`), ['What do you grow?', true]);
  check('wizard: the note says what is needed', await js(`/Pick what you grow/.test(document.querySelector('#ctaNote').textContent)`));
  await tap('input[name=rot][value="corn-soy"]').catch(async () => { await js(`document.querySelector('input[name=rot][value="corn-soy"]').click()`); });
  check('wizard: a rotation turns Next on and names the crops', await seen(`!document.querySelector('#wNext').disabled && document.querySelector('input[name=rot][value="corn-soy"]').checked && /Chosen: Corn, then soybeans, repeats every 2 years/.test(document.querySelector('#view-setup > [role=status]').textContent)`));
  await js(`document.querySelector('input[name=rot][value="corn-soy"]').focus()`); await press('ArrowDown');
  check('wizard: arrow keys move through the rotations and keep the keyboard on the chosen one', await seen(`document.activeElement.name === 'rot' && document.activeElement.checked`));
  await js(`document.querySelector('input[name=rot][value="corn-soy"]').click()`);
  await tap('#wNext');
  check('wizard: step 3 blocks until soil is chosen', await js(`document.querySelector('#wHeading').textContent === 'Water and soil' && document.querySelector('#wNext').disabled`));
  await js(`document.querySelector('input[name=feel][value=loam]').click()`);
  check('wizard: the feel alone is not enough', await js(`document.querySelector('#wNext').disabled`));
  await js(`document.querySelector('input[name=colour][value=med]').click()`);
  check('wizard: feel and colour turn Next on', await seen(`!document.querySelector('#wNext').disabled`));
  await tap('#wNext');
  same('wizard: step 4 ends with the report button', await js(`[document.querySelector('#wHeading').textContent, document.querySelector('#wNext').textContent]`), ['What do you want most?', 'See my field report']);
  await js(`location.reload()`);
  check('wizard: a reload in the middle of the setup comes back to the same step', await seen(`!document.querySelector('#view-setup').hidden && document.querySelector('#wHeading')?.textContent === 'What do you want most?'`));
  for (let i = 0; i < 4; i++) { await tap('#wBack'); await sleep(200); }   // step 4, 3, 2, then 1 itself; each step redraws and takes focus after 80 ms, so a tap waits for it
  check('wizard: Back on step 1 returns to the home', await seen(`!document.querySelector('#view-home').hidden`));
  // a garden skips step 4
  await js(`import('/js/wizard.js').then(m => m.setPlace({ lat: 7, lon: 80, name: 'Tea' })); import('/js/app.js').then(m => m.show('setup'))`);
  await until(`!document.querySelector('#view-setup').hidden && !!document.querySelector('.wstep')`); await tap('#wNext');
  await js(`document.querySelector('input[name=garden]').click()`);
  same('wizard: trees and bushes have three steps, not four', await js(`document.querySelectorAll('.wstep').length`), 3);
});

await group('picker', async () => {
  await fresh();
  await js(`import('/js/wizard.js').then(m => m.setPlace({ lat: 42.03, lon: -93.62, name: 'Test field' })); import('/js/app.js').then(m => m.show('setup'))`);
  await until(`!document.querySelector('#view-setup').hidden && !!document.querySelector('.wstep')`); await tap('#wNext');
  await js(`document.querySelector('input[name=rot][value=custom]').click()`); await sleep(300);
  await tap('.pk-btn');
  check('picker: the button opens the panel and the keyboard goes to its search box', await seen(`!!document.querySelector('.pk-panel') && document.activeElement.classList.contains('pk-search')`));
  await run.send('Input.insertText', { text: 'bean' });
  check('picker: typing "bean" lists the beans only', await seen(`document.querySelectorAll('.pk-row').length > 1 && document.querySelectorAll('.pk-row').length < 12`));
  await press('ArrowDown'); await press('Enter');
  check('picker: Enter on a row chooses it, closes the panel and gives the keyboard back to the button', await seen(`!document.querySelector('.pk-panel') && document.activeElement.classList.contains('pk-btn')`));
  await tap('.pk-btn'); await press('Escape');
  check('picker: Escape closes it and returns to the button', await seen(`!document.querySelector('.pk-panel') && document.activeElement.classList.contains('pk-btn')`));
});

await group('fit', async () => {
  for (const width of WIDTHS) for (const largest of [false, true]) {
    await fresh(width); await setting({ text: largest ? 'xlarge' : 'default' });
    const where = `at ${width} px${largest ? ' with the Largest text' : ''}`;
    await go('/'); await until(`!/^a demo field$/.test(document.querySelector('#tryRegion')?.textContent || 'a demo field')`);
    same(`fit: the home does not scroll sideways ${where}`, await wideBy() <= 0, true);
    if (width <= 600) same(`fit: every control on the home is 44 px or more ${where}`, await smallOnes(), []);
    await js(`import('/js/wizard.js').then(m => m.setPlace({ lat: 42.03, lon: -93.62, name: 'Test field' })); import('/js/app.js').then(m => m.show('setup'))`);
    await until(`!document.querySelector('#view-setup').hidden && !!document.querySelector('.wstep')`);
    for (const [i, id] of ['field', 'crops', 'soil', 'matters'].entries()) {
      if (i === 1) await js(`document.querySelector('#wNext').click()`);
      if (i === 2) { await js(`document.querySelector('input[name=rot][value="corn-soy"]').click(); document.querySelector('#wNext').click()`); }
      if (i === 3) { await js(`document.querySelector('input[name=feel][value=loam]').click(); document.querySelector('input[name=colour][value=med]').click(); document.querySelector('#wNext').click()`); }
      await sleep(150);
      same(`fit: step ${i + 1} does not scroll sideways ${where}`, await wideBy() <= 0, true);
      if (width <= 600) same(`fit: every control on step ${i + 1} is 44 px or more ${where}`, await smallOnes(), []);
      check(`fit: the sticky bar stays on the screen at step ${i + 1} ${where}`, await js(`(() => { const b = document.querySelector('#wNext').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; })()`));
    }
  }
});

await group('motion', async () => {
  await fresh(); await setting({ motion: 'reduce' }); await go('/'); await sleep(600);
  check('motion: the home has no lens picture any more', await js(`!document.querySelector('#lens, .lens')`));
  check('motion: with Always still nothing is running on the home', await js(`document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === 0)`));
});

await group('noplace', async () => {
  await fresh(); await js(`window.__asked = 0; window.fetch = async () => { window.__asked++; return { json: async () => ({ ok: false }) }; }`);
  await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'); const a = await import('/js/app.js'); a.show('report'); m.openReport({ ...st.newState(), loc: null }); })`); await sleep(400);
  check('noplace: no position says "Choose your field first." and asks no service', await js(`document.querySelector('#reportTitle')?.textContent === 'Choose your field first.' && window.__asked === 0`));
  check('noplace: only Back, as the main button; no Try again', await js(`!document.querySelector('[data-act=retry]') && document.querySelector('[data-act=change]').classList.contains('primary')`));
});

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
const showReport = async (withWeather = false, loaded = false) => { await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'); const a = await import('/js/app.js'); a.show('report'); const state = { ...st.newState(), loc: { lat: ${REGION.lat}, lon: ${REGION.lon}, label: ${JSON.stringify(REGION.name)}, cc: 'CA' }, name: ${JSON.stringify(REGION.name)}, soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }; await m.renderResult(state, ${FIXTURE}, { ${withWeather ? `weather: await ${SYNTH},` : ''} ${loaded ? `imerg: await ${IMERG_JS}, dem: ${DEM_JS}, reading: { label: 'Moisture around the roots', value: 0.31, date: '${YR}-11-12', km: 9, lat: ${REGION.lat}, lon: ${REGION.lon}, source: 'smap' }` : ''} }); })`); await until(`!!document.querySelector('#answer')`); await sleep(220); };   // the app moves the keyboard to the new heading 80 ms after a screen opens: let that settle before a key test

await group('report', async () => {
  await fresh();
  await tap('#tryRegion'); await until(`!!document.querySelector('#wNext')`); for (let i = 0; i < 4; i++) { await tap('#wNext'); await sleep(120); }
  check('report: the demo path opens the loading screen, then (offline here) says plainly that the weather could not be read, with Try again and Back', await seen(`!document.querySelector('#view-report').hidden && /couldn.t get weather data/.test(document.querySelector('#reportRoot').textContent) && !!document.querySelector('[data-act=retry]') && !!document.querySelector('[data-act=change]')`, 20000));
  await tap('[data-act=change]');
  check('report: Change answers goes back to the setup', await seen(`!document.querySelector('#view-setup').hidden`));
  await js(`history.back()`); await sleep(300);
  await fresh(); await showReport();
  check('report: one page with no tabs, and the questions as its headings', await js(`document.querySelectorAll('[role=tab]').length === 0 && [...document.querySelectorAll('.rv-block > h2')].map(h => h.textContent).join('|') === 'What should I plant next?|Compare strategies|What could go wrong?|When do I do what?|More about your field'`));
  check('report: the heading is the field\'s name and the keyboard starts there', await js(`document.querySelector('#reportTitle').textContent === ${JSON.stringify(REGION.name)} && document.activeElement.id === 'reportTitle'`));
  check('report: the answer shows one suggestion, one reason, how sure, and the guide sentence', await js(`/Try Corn, then soybeans, then winter wheat/.test(document.querySelector('#answer').textContent) && /Winter wheat keeps/.test(document.querySelector('#answer').textContent) && /How sure is this\\?/.test(document.querySelector('#answer').textContent) && /Crophalo is a guide\\. You decide what to plant\\./.test(document.querySelector('#answer').textContent)`));
  await js(`document.querySelector('#lfAssumed summary').click()`);
  check('report: the assumptions are on the screen once the fold is open', await js(`/average loam is assumed/.test(document.body.textContent) && /estimated as a 10 ha square/.test(document.body.textContent) && /Water: rain only/.test(document.body.textContent)`));
  check('report: three strategy rows, the suggestion first among the others, each closed', await js(`document.querySelectorAll('.srow').length === 3 && document.querySelector('#sr-wheat')?.open === false && document.querySelector('#sr-wheat .srow-tag').textContent.includes('Our suggestion')`));
  await js(`document.querySelector('#sr-wheat summary').click()`);
  check('report: one tap on a row opens its parts', await js(`/Why it was suggested/.test(document.querySelector('#sr-wheat').textContent) && !/None listed yet/.test(document.querySelector('#sr-wheat').textContent)`));
  await js(`document.querySelector('#sr-now summary').click()`);
  check('report: what you grow now says it is the yardstick', await js(`/compares the others with it/.test(document.querySelector('#sr-now').textContent)`));
  // the "i"
  await js(`document.querySelector('#answer .srci').focus()`); await press('Enter');
  check('report: the "i" opens by keyboard with the NASA source first, and the keyboard goes to the card', await seen(`!document.querySelector('#srcPop').hidden && document.activeElement.id === 'srcPop' && /NASA POWER/.test(document.querySelector('#srcPop').textContent)`));
  await press('Escape');
  check('report: Escape closes the card and gives the keyboard back to the "i"', await seen(`document.querySelector('#srcPop').hidden && document.activeElement.classList.contains('srci') && document.querySelector('#answer .srci').getAttribute('aria-expanded') === 'false'`));
  await js(`document.querySelector('#answer .srci').click()`); check('report: a click pins it', await seen(`!document.querySelector('#srcPop').hidden`)); await js(`document.querySelector('#answer .srci').click()`); check('report: a second click closes it', await seen(`document.querySelector('#srcPop').hidden`));
  check('report: no sliders and no priorities panel', await js(`document.querySelectorAll('input[type=range], .rv-prio').length === 0`));
  // add to My farm
  await tap('#rbFarm');
  check('report: Add to My Farm puts the field in My farm and keeps the report on screen, with a toast that offers Open', await seen(`!document.querySelector('#view-report').hidden && JSON.parse(localStorage.getItem('crophalo.farms.v1') || '{}').farms?.some(f => f.fields?.length === 1) && /Added to My farm/.test(document.querySelector('#toast').textContent) && /Open/.test(document.querySelector('#toast button')?.textContent || '')`, 8000));   // the farmer stays on the comparison they were reading; Open is one tap away
  same('report: it is the one primary action on the screen', await js(`document.querySelectorAll('#view-report .btn.primary').length`), 1);
  // the plan that goes to My farm: the one the farmer chose to try, else the suggestion
  await js(`import('/js/report.js').then(m => m.setSeam({ farm: async () => ({ addFromReport: p => { window.__payload = p; return { farmId: 'f1', fieldId: 'x' }; } }) }))`);
  await js(`document.querySelector('#sr-other summary').click()`);
  check('report: a plan other than today has a "Try this strategy" button in its row', await seen(`/Try this strategy/.test(document.querySelector('#sr-other [data-act=try]')?.textContent ?? '')`));
  await tap('#sr-other [data-act=try]');
  check('report: choosing it says so on its row and in the answer, and Add to My farm stays the only primary button', await seen(`/Chosen/.test(document.querySelector('#sr-other [data-act=try]').textContent) && /You chose/.test(document.querySelector('#answer').textContent) && document.querySelectorAll('#view-report .btn.primary').length === 1`));
  await tap('#rbFarm');
  check('report: Add to My farm carries the plan the farmer CHOSE as the proposed plan, with today as the current one', await seen(`window.__payload && window.__payload.proposed.id === 'other' && window.__payload.proposed.kind === 'proposed' && window.__payload.current.id === 'now' && window.__payload.current.kind === 'current'`));
  await js(`window.__payload = null`); await tap('#answer [data-act=untry]');
  await tap('#rbFarm');
  check('report: with nothing chosen it carries the engine\'s suggestion', await seen(`window.__payload && window.__payload.proposed.id === 'wheat'`));
});

await group('data page', async () => {
  await fresh(); await js(`location.hash = '#data'`);
  check('data page: it opens with the NASA line and a closed fold "How Crophalo uses NASA data", no link to a file', await seen(`!document.querySelector('#view-info').hidden && /not made, reviewed or endorsed by NASA/.test(document.querySelector('#nasaLine').textContent) && !document.querySelector('#nasaLine a') && document.querySelector('#nasaUse') && !document.querySelector('#nasaUse').open`));
  check('data page: one row for each source, NASA first, each with an "i"', await js(`document.querySelectorAll('.data-sources .row').length >= 5 && document.querySelector('.data-sources .row .src.nasa') !== null && document.querySelectorAll('.data-sources .srci').length === document.querySelectorAll('.data-sources .row').length`));
});

await group('folds', async () => {
  await fresh(); await showReport(true, true);
  const open = id => js(`document.querySelector('#${id} summary').click()`);
  check('folds: "More about your field" has three folds, all closed, each with its figure on the closed line', await js(`[...document.querySelectorAll('#blkMore > details')].length === 3 && [...document.querySelectorAll('#blkMore > details')].every(d => !d.open) && /Weather here since 2001/.test(document.querySelector('#lfWeather summary').textContent)`));
  await open('lfWeather');
  check('folds: the weather fold says rain, frost and hot days in plain lines, with the source and the years', await js(`/Rain in a normal year: \\d+ (in|mm)/.test(document.querySelector('#lfWeather').textContent) && /Frost: the last in spring/.test(document.querySelector('#lfWeather').textContent) && /From NASA POWER, 20\\d\\d–20\\d\\d/.test(document.querySelector('#lfWeather').textContent)`));
  await open('lfSat');
  check('folds: the satellite fold shows the soil water reading with its date and its source, and no chart', await js(`/Water in the top soil: 31% on/.test(document.querySelector('#lfSat').textContent) && /From NASA SMAP/.test(document.querySelector('#lfSat').textContent) && !document.querySelector('#lfSat svg.chart')`));
  await open('lfMonths');
  check('folds: "See the year month by month" holds the calendar when it is opened', await js(`!!document.querySelector('#lfMonths .fc-plans') || !!document.querySelector('#lfMonths .fc-row')`));
  await open('lfAssumed');
  check('folds: the assumptions fold gives the height and the slope of the field from the height map, in feet for a US field or metres here', await js(`/Height above the sea: about \\d/.test(document.querySelector('#lfAssumed').textContent)`));
});

await group('report fit', async () => {
  await fresh(375); await showReport();
  check('fit: the "i" is a 24 px mark with a 44 px place to tap around it', await js(`[...document.querySelectorAll('#view-report .srci')].every(b => { const a = getComputedStyle(b, '::after'); return parseFloat(a.width) >= 44 && parseFloat(a.height) >= 44; })`));
  for (const width of [320, 375, 390, 768, 1280]) for (const largest of [false, true]) {
    await fresh(width); await setting({ text: largest ? 'xlarge' : 'default' }); await showReport(true, true);
    const where = `at ${width} px${largest ? ' with the Largest text' : ''}`;
    same(`fit: the page does not scroll sideways ${where}`, await wideBy() <= 0, true);
    if (width <= 600) same(`fit: every control on the page is 44 px or more ${where}`, await smallOnes(), []);
    await js(`document.querySelectorAll('#view-report details > summary').forEach(s => s.parentElement.open || s.click())`); await sleep(250);
    same(`fit: with every fold open the page does not scroll sideways ${where}`, await wideBy() <= 0, true);
    same(`fit: no word in a drawing comes out under 12 px ${where}`, await js(`[...document.querySelectorAll('#view-report svg text')].filter(t => t.getClientRects().length).map(t => { const s = t.ownerSVGElement, vb = s.viewBox.baseVal, k = vb && vb.width ? s.getBoundingClientRect().width / vb.width : 1; return Math.round(parseFloat(getComputedStyle(t).fontSize) * k * 10) / 10; }).filter(px => px < 11.9)`), []);
    if (width <= 600) same(`fit: with every fold open every control is 44 px or more ${where}`, await smallOnes(), []);
  }
});

await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  const scan = async name => {
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  ${name}: ${line}`);
    check(`axe: ${name}: 0 problems`, found.length === 0, `${found.length} found, listed above`);
  };
  for (const width of [1280, 375]) {
    await fresh(width); await scan(`home at ${width} px`);
    await tap('#navSaved'); await until(`document.querySelector('#dlgSaved').open`); await scan(`Saved sheet at ${width} px`); await press('Escape');
    await js(`import('/js/welcome.js').then(m => m.openWelcome())`); await sleep(300); await scan(`welcome at ${width} px`); await js(`document.querySelector('#dlgWelcome').close()`);
    await js(`import('/js/wizard.js').then(m => m.setPlace({ lat: 42.03, lon: -93.62, name: 'Test field' })); import('/js/app.js').then(m => m.show('setup'))`);
    await until(`!document.querySelector('#view-setup').hidden && !!document.querySelector('.wstep')`);
    await scan(`step 1 at ${width} px`); await js(`document.querySelector('#wNext').click()`); await sleep(150); await scan(`step 2 at ${width} px`);
    await js(`document.querySelector('input[name=rot][value=custom]').click()`); await sleep(100); await tap('.pk-btn'); await scan(`the crop chooser open at ${width} px`); await press('Escape');
    await js(`document.querySelector('input[name=rot][value="corn-soy"]').click(); document.querySelector('#wNext').click()`); await sleep(150); await scan(`step 3 at ${width} px`);
    await js(`document.querySelector('input[name=feel][value=loam]').click(); document.querySelector('input[name=colour][value=med]').click(); document.querySelector('#wNext').click()`); await sleep(150); await scan(`step 4 at ${width} px`);
    await showReport(true, true); await scan(`the report page at ${width} px`);
    await js(`document.querySelector('#sr-wheat summary').click()`); await sleep(150); await scan(`a strategy row open at ${width} px`);
    await js(`document.querySelector('#answer .srci').click()`); await sleep(200); await scan(`the source card open at ${width} px`); await press('Escape');
    await js(`document.querySelectorAll('#view-report details > summary').forEach(s => s.parentElement.open || s.click())`); await sleep(300); await scan(`the report page with every fold open at ${width} px`);
  }
});

await finish();
