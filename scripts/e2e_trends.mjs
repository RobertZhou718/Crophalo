// Crophalo's "Trends on this land" suite in a real browser: the card's rows (what the one page holds under its Show more) drawn from the recorded NASA POWER answer for Barrie in the report's own frame, the later rows filled in place (an opened table stays open),
// no sideways scroll at 320 and 1280 px with the default and the largest text, 44 px folds, the same static charts under every motion setting, and axe (light and dark) on the card. Runs on the throwaway copy of scripts/e2e_lib.mjs.
// Run: node scripts/e2e_trends.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = await openRun('e2e_trends');
const { ROOT, js, until, size, go, device, check, group, finish, sleep, flat, shot } = run;
const POWER = fs.readFileSync(path.join(HERE, 'fixtures', 'power_barrie.json'), 'utf8'), REC = JSON.parse(POWER), LAT = REC.geometry.coordinates[1], LON = REC.geometry.coordinates[0];
const GRACE = JSON.stringify(JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'live', 'gracecell-oxford', 'recording.json'), 'utf8')).answer);
const GREEN = JSON.stringify({ ok: true, seasons: Array.from({ length: 25 }, (_, i) => ({ year: 2001 + i, peak: i === 3 ? null : 0.78 + (i % 5) / 100, n: i === 3 ? 0 : 10, of: 12 })), years_without: [2004] });   // a greenness answer in the lookup's shape, by hand
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));

// The card with every row, in the report's own frame (the report has no Weather tab now); the stored water and the greenness are given, so nothing is asked of a lookup
async function open(width, { text = 'default', motion = 'device' } = {}) {
  await size(width); await go('/');
  await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME}); localStorage.setItem('crophalo.settings.v1', ${JSON.stringify(JSON.stringify({ text, motion }))})`);
  await go('/');
  await js(`(async () => {
    const d = await import('/js/data.js'), c = await import('/js/climate.js'), wd = await import('/js/weather-data.js'), tv = await import('/js/trends-view.js'), s2 = await import('/js/satellites2-data.js'), g = await import('/js/greenness.js');
    const loc = { lat: ${LAT}, lon: ${LON} }, series = d.buildSeries(${POWER}, loc), climate = c.computeClimate(series, loc.lat);
    window.__series = series;
    tv.setTrendsExtras(loc.lat, loc.lon, { grace: s2.cleanGrace(${GRACE}), green: g.cleanGreenness(${GREEN}) });
    const w = wd.buildWeather({ series, climate, loc, now: Date.UTC(2026, 10, 14, 12) });
    for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== 'view-report';
    document.querySelector('#reportRoot').innerHTML = '<div class="rv-wrap"><div class="rv-main">' + tv.trendsHTML(w) + '</div></div>';
  })()`);
  await until(`document.querySelector('[data-trends] .tr-row') && document.querySelector('link[href="css/trends.css"]')?.sheet`, 8000); await sleep(200);
}

await group('card', async () => {
  await open(1280);
  check('card: one "Trends on this land" section', await js(`document.querySelectorAll('[data-trends]').length === 1 && document.querySelector('#wkTrends').textContent.includes('Trends on this land')`));
  check('card: nine rows, in order', await js(`[...document.querySelectorAll('[data-trends] .tr-row')].map(f => f.dataset.trend).join() === 'heat,springFrost,autumnFrost,heavy,dry,balance,stored,green,soil'`));
  check('card: eight charts (soil moisture, stored water and greenness included), each with its spoken sentence', await js(`[...document.querySelectorAll('[data-trends] svg.tr-chart')].length === 9 && [...document.querySelectorAll('[data-trends] svg.tr-chart')].every(s => s.getAttribute('aria-label').length > 30)`));
  check('card: "Past weather, not a forecast." is on it', await js(`document.querySelector('[data-trends]').textContent.includes('Past weather, not a forecast.')`));
  check('card: every row has its source button', await js(`[...document.querySelectorAll('[data-trends] .tr-row')].every(f => f.querySelector('figcaption button, figcaption .src'))`));
  check('card: the heat row starts on the 32 °C line of “Weather here since 2001”', await js(`document.querySelector('[data-trend=heat]').textContent.includes('32 °C, the hot-day line of “Weather here since 2001”')`));
  // a table opened, then the farm's crops arrive: the heat row is redrawn in place and its table stays open
  await js(`document.querySelector('[data-trend=heat] details').open = true`);
  const n = await js(`import('/js/trends-view.js').then(tv => { tv.setTrendsExtras(${LAT}, ${LON}, { series: window.__series, state: { rotation: { custom: ['corn', 'soy', 'wheat'] } } }); return tv.refreshTrends(); })`);
  check('later: the heat row is redrawn with the crops’ own lines (30, 32 and 33 °C)', n >= 1 && await js(`/30 °C for Winter wheat, 32 °C for Corn and 33 °C for Soybeans/.test(document.querySelector('[data-trend=heat]').textContent)`));
  check('later: the table the farmer opened stays open', await js(`document.querySelector('[data-trend=heat] details').open === true`));
  check('later: a second refresh with nothing new redraws nothing', await js(`import('/js/trends-view.js').then(tv => tv.refreshTrends() === 0)`));
  check('folds: every "The numbers" fold is at least 44 px high', await js(`[...document.querySelectorAll('[data-trends] details > summary')].every(s => s.getBoundingClientRect().height >= 43.5)`));
  check('folds: each table has a heading row and is reachable by keyboard', await js(`[...document.querySelectorAll('[data-trends] .tbl')].every(t => t.tabIndex === 0 && t.querySelector('thead th'))`));
});

await group('fit', async () => {
  for (const width of [320, 1280]) for (const text of ['default', 'xlarge']) {
    await open(width, { text });
    await js(`document.querySelectorAll('[data-trends] details').forEach(d => d.open = true)`); await sleep(100);
    await flat(`the trends card at ${width} px with ${text === 'xlarge' ? 'the largest' : 'the default'} text, every table open`);
    await js(`document.querySelectorAll('[data-trends] details').forEach(d => d.open = false); document.querySelector('[data-trends]').scrollIntoView()`); await shot(`trends-${width}-${text}.png`);   // only when E2E_SHOTS names a folder
  }
});

await group('motion', async () => {
  const marks = async () => js(`[...document.querySelectorAll('[data-trends] svg')].map(s => s.outerHTML).join('')`);
  await open(1280, { motion: 'device' }); const full = await marks();
  await device({ 'prefers-reduced-motion': 'reduce' }); await open(1280, { motion: 'device' }); const less = await marks();
  await device(); await open(1280, { motion: 'reduce' }); const still = await marks();
  check('motion: the charts are the same under Full, Less and Still', full.length > 1000 && full === less && less === still);
  const moving = await js(`[...document.querySelectorAll('[data-trends] svg, [data-trends] svg *, [data-trends] .tr-row, [data-trends] .tr-row p')].filter(el => { const cs = getComputedStyle(el); const props = cs.transitionProperty.split(','), durs = cs.transitionDuration.split(','); return cs.animationName !== 'none' || props.some((p, i) => parseFloat(durs[i % durs.length]) > 0.01 && !/^\\s*(color|background-color|border-color|outline-color|box-shadow|filter|fill|stroke)\\s*$/.test(p)); }).map(el => el.tagName + '.' + (el.getAttribute('class') || '') + ' ' + getComputedStyle(el).transitionProperty + ' ' + getComputedStyle(el).transitionDuration).slice(0, 5)`);
  check('motion: no chart, row or sentence of the card moves (no animation; at most a change of colour, as everywhere in the app)', moving.length === 0, moving);
});

await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [320, 1280]) for (const scheme of ['light', 'dark']) {
    await device({ 'prefers-color-scheme': scheme }); await open(width);
    await js(`document.querySelectorAll('[data-trends] details').forEach(d => d.open = true)`);
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document.querySelector('[data-trends]'), { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  trends at ${width} ${scheme}: ${line}`);
    check(`axe: the trends card at ${width} px, ${scheme}: 0 problems`, found.length === 0, `${found.length} found`);
  }
  await device();
});

await finish();
