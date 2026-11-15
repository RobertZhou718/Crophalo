// Crophalo's browser suite for the GRACE-FO, ECOSTRESS and HLS cards: the three cards drawn from answers in the lookups' own format, with no sideways scroll at 320 to 1280
// (with and without the largest text), 44 px controls on a phone, and axe on them. Runs on the throwaway copy that scripts/e2e_lib.mjs makes. Run: node scripts/e2e_sat2.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';
const YR = 2026, G0 = 2016;   // the year of the hand-made ECOSTRESS and HLS answers' days, and the first year of the hand-made GRACE-FO record

const run = await openRun('e2e_sat2');
const { ROOT, js, until, size, go, check, group, finish, sleep } = run;
const months = []; for (let i = 0; i < 96; i++) { const key = `${G0 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, gap = key >= `${G0 + 1}-07` && key <= `${G0 + 2}-05`; months.push([key, gap ? null : Math.round((2 - i * 0.1 + (i % 3)) * 100) / 100, gap ? null : 1.4]); }
const GRACE = { ok: true, months, trend_cm_per_year: -1.1, trend_from: `${G0 + 2}-06`, trend_to: `${G0 + 7}-12`, trend_years: 5.6, trend_note: 'A trend over 5.6 years.', area_km: 300, data_date: `${G0 + 7}-12-31` };
const P = (date, dn, c, solar) => ({ date, utc: '15:00', solar_time: solar, solar_date: date, day_night: dn, lst_c: c, lst_k: c + 273.15, error_k: 1.5, orbit: 1, version: '002', granule: 'g' });
const ECO = { ok: true, passes: [P(`${YR}-11-10`, 'day', 14.2, '13:12:00'), P(`${YR}-11-08`, 'night', 3.1, '01:40:00'), P(`${YR}-10-30`, 'day', 17.9, '12:55:00')], passes_checked: 9, not_usable: { cloud: 4, quality: 1, water: 0, no_data: 1 }, newest_clear: `${YR}-11-10`, window: { first: `${YR}-09-20`, last: '2026-11-14' }, pixel_m: 70 };
const NONE = { ok: true, passes: [], passes_checked: 5, not_usable: { cloud: 5 }, why_none: 'All 5 passes in the last 60 days were under cloud.', pixel_m: 70 };
const HLS = { ok: true, passes: [[`${YR}-06-01`, 0.3], [`${YR}-07-02`, 0.52], [`${YR}-08-12`, 0.71], [`${YR}-09-30`, 0.28]].map(([date, ndvi]) => ({ date, sensor: 'S30', ndvi, clear_pixels: 90, of_pixels: 100 })), gaps: [], newest_date: `${YR}-09-30`, newest_ndvi: 0.28 };
const draw = async (eco, width = 1280) => {
  await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }))})`); await go('/#data'); await until(`document.querySelector('#infoBody')`);
  await js(`(async () => { const [d, v, w, s] = await Promise.all([import('/js/satellites2-data.js'), import('/js/satellites-view.js'), import('/js/sources.more.js'), import('/js/srci.js')]);
    for (const h of ['css/app.css', 'css/satellites.css']) if (!document.querySelector('link[href="' + h + '"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; document.head.append(l); }
    document.querySelector('#infoBody').innerHTML = v.satellitesHTML({ grace: d.cleanGrace(${JSON.stringify(GRACE)}), eco: d.cleanEco(${JSON.stringify(eco)}), hls: d.cleanHls(${JSON.stringify(HLS)}) }); s.initSources?.(); })()`);
  await until(`document.querySelector('[data-card=grace] svg') && document.querySelector('[data-card=ecostress]') && document.querySelector('[data-card=hls] svg')`); await sleep(200);
};
const wideBy = () => js(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);

await group('fit', async () => {
  for (const width of [320, 375, 390, 768, 1280]) for (const eco of [ECO, NONE]) { await draw(eco, width);
    for (const big of [false, true]) { await js(`import('/js/settings.js').then(m => m.saveSettings({ text: ${big ? "'xlarge'" : "'default'"} }))`); await sleep(100); const by = await wideBy(); check(`fit: GRACE and ECOSTRESS at ${width} px${big ? ' with largest text' : ''}${eco === NONE ? ' (no clear pass)' : ''}: no sideways scroll`, by <= 0, `${by} px too wide`); }
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'default' }))`); }
  await draw(ECO, 375);
  const small = await js(`[...document.querySelectorAll('[data-card=grace] button, [data-card=ecostress] button, [data-card=hls] button, [data-card=grace] summary, [data-card=ecostress] summary, [data-card=hls] summary')].filter(e => e.offsetParent && !e.classList.contains('srci')).map(e => [e.getBoundingClientRect(), e]).filter(([b]) => b.height < 43.5).map(([b, e]) => e.tagName + ' ' + Math.round(b.width) + 'x' + Math.round(b.height))`);
  check('fit: the controls in the two cards are at least 44 px high at 375', small.length === 0, small);
});
await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) for (const [name, eco] of [['with passes', ECO], ['no clear pass', NONE]]) {
    await draw(eco, width); if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document.querySelector('[data-card=grace]').parentElement, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  ${name} at ${width}: ${line}`);
    check(`axe: the two cards ${name} at ${width}: 0 problems`, found.length === 0, `${found.length} found`);
  }
});
await finish();
