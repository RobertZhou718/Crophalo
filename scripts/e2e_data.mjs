// Crophalo's Data page suite in a real browser: three tabs that move with the arrow keys, Home and End, a filter that narrows the lists and says how many match, each source with its Visit link and "i", 320 to 1280 with the largest text, axe.
// RULE: never loosen a check to make it pass. Run: node scripts/e2e_data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';
import { PRESETS } from '../js/crops.js';

const run = await openRun('e2e_data');
const { ROOT, js, page, until, seen, tap, press, size, go, check, same, group, finish, sleep, shot } = run;
const HERE = path.dirname(fileURLToPath(import.meta.url)), fx = n => fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8'), rec = n => { const t = fx(`open-meteo/${n}.rec`); return t.slice(t.indexOf('\n') + 1); };
const POWER = fx('power_barrie.json'), REC = JSON.parse(POWER);
const ENS = rec('ensemble-oxford'), SEAS = rec('seasonal-oxford'), CLIM = rec('climate-oxford'), POWERO = fx('power_oxford.json');
const JUDGE = (fs.readFileSync(path.join(HERE, 'e2e_ahead.mjs'), 'utf8').match(/^const JUDGE = (`.*`);$/m) ?? [])[1];
const WHEAT = { seasons: [{ crop: 'wheat', sow: '2026-10-05', harvest: '2027-07-20' }] };
const REGION = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8'))[0];
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const accepted = () => js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }))})`);
const quietApi = () => js(`window.fetch = (f => async (url, ...rest) => /\\/api\\/(smaproot|cropsnear|imergrain|gracecell|ecopass|hlsndvi|sources|dem|prices|faostat)/.test(url) ? ({ json: async () => ({ ok: false }) }) : f(url, ...rest))(window.fetch)`);
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
const showReport = async (withWeather = false, loaded = false) => { await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'); const a = await import('/js/app.js'); a.show('report'); const state = { ...st.newState(), loc: { lat: ${REGION.lat}, lon: ${REGION.lon}, label: ${JSON.stringify(REGION.name)}, cc: 'CA' }, name: ${JSON.stringify(REGION.name)}, soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }; await m.renderResult(state, ${FIXTURE}, { ${withWeather ? `weather: await ${SYNTH},` : ''} ${loaded ? `imerg: await ${IMERG_JS}, dem: ${DEM_JS}, reading: { label: 'Moisture around the roots', value: 0.31, date: '2026-11-12', km: 9, lat: ${REGION.lat}, lon: ${REGION.lon}, source: 'smap' }` : ''} }); })`); await until(`!!document.querySelector('#answer')`); await sleep(220); };   // the app moves the keyboard to the new heading 80 ms after a screen opens: let that settle before a key test
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


const typeIn = async (sel, text) => { await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(text)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); };
const openData = async (width = 1280) => { await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME})`); await go('/#data'); await until(`document.querySelector('#srcFilter')`); await sleep(300); };
await group('tabs', async () => {
  await openData();
  check('data: three tabs, the first selected, its panel the only one shown', await js(`[...document.querySelectorAll('[role=tab]')].map(t => t.getAttribute('aria-selected')).join() === 'true,false,false' && !document.querySelector('#srcpanel-nasa').hidden && document.querySelector('#srcpanel-other').hidden && document.querySelector('#srcpanel-fit').hidden`));
  await js(`document.querySelector('#srctab-nasa').focus()`); await press('ArrowRight'); await sleep(150);
  check('data: ArrowRight moves to Other sources and shows its panel, the keyboard on the tab', await js(`document.activeElement.id === 'srctab-other' && document.querySelector('#srctab-other').getAttribute('aria-selected') === 'true' && !document.querySelector('#srcpanel-other').hidden && document.querySelector('#srcpanel-nasa').hidden`));
  await press('End'); await sleep(100); check('data: End goes to the last tab', await js(`document.activeElement.id === 'srctab-fit' && !document.querySelector('#srcpanel-fit').hidden`));
  await press('ArrowRight'); await sleep(100); check('data: ArrowRight at the end wraps to the first tab', await js(`document.activeElement.id === 'srctab-nasa'`));
  await press('Home'); await js(`document.querySelector('#srctab-nasa').focus()`);
  check('data: the NASA tab lists only NASA sources, each with its Visit link, its meaning for the field and its "i"', await js(`(() => { const rows = [...document.querySelectorAll('#srcpanel-nasa .row')]; return rows.length >= 8 && rows.every(r => !!r.querySelector('.src.nasa') && /What this means for your field/.test(r.textContent) && !!r.querySelector('a[href^="https://"][target=_blank][rel~=noopener]') && !!r.querySelector('.srci')); })()`));
  await typeIn('#srcFilter', 'soil'); await sleep(200);
  check('data: the filter narrows the rows, says how many match and shows a line for a tab with none', await js(`(() => { const shown = [...document.querySelectorAll('.data-sources .row')].filter(r => !r.hidden).length; return shown > 0 && shown < document.querySelectorAll('.data-sources .row').length && /sources? match/.test(document.querySelector('#srcCount').textContent); })()`));
  await typeIn('#srcFilter', 'zzzz'); await sleep(200);
  check('data: nothing matching says so on each tab', await js(`document.querySelector('#srcCount').textContent.startsWith('0 sources match') && !document.querySelector('#srcpanel-nasa .data-none').hidden`));
  await typeIn('#srcFilter', ''); await sleep(150);
  check('data: clearing the filter brings every row back', await js(`[...document.querySelectorAll('.data-sources .row')].every(r => !r.hidden) && document.querySelector('#srcCount').textContent === ''`));
  await shot('data-1280.png');
});
await group('fit', async () => {
  for (const width of [320, 375, 768, 1280]) for (const big of [false, true]) {
    await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); localStorage.setItem('crophalo.settings.v1', JSON.stringify({ text: ${big ? "'xlarge'" : "'default'"} }))`); await go('/#data'); await until(`document.querySelector('#srcFilter')`); await sleep(300);
    check(`data: no sideways scroll at ${width} px${big ? ' with the largest text' : ''}`, await js(`document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0`));
    if (width <= 600) check(`data: tabs, the filter and the links are 44 px or more at ${width} px${big ? ' (largest text)' : ''}`, await js(`[...document.querySelectorAll('[role=tab], #srcFilter, #srcpanel-nasa a.link')].filter(e => e.getBoundingClientRect().width > 0).every(e => e.getBoundingClientRect().height >= 43.5 || e.matches('a.link'))`));
  }
});
await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) for (const tab of ['nasa', 'other', 'fit']) {
    await openData(width); await js(`document.querySelector('#srctab-${tab}').click()`); await sleep(200);
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  data ${tab} at ${width}: ${line}`);
    check(`axe: the ${tab} tab at ${width}: 0 problems`, found.length === 0, `${found.length} found`);
  }
});
await finish();
