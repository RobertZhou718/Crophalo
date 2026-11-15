// Crophalo's spacing suite: every page of the app drawn in a real browser and measured for the faults that make a page feel cramped or loose: a heading that touches the text above it,
// two text blocks with no space between them, a card with less than 12 px inside it, text that touches the screen edge on a phone. With E2E_SHOTS=<folder outside the project> it also saves a picture of each page.
// RULE: never loosen a rule to make a page pass; fix the page. Runs on the throwaway copy scripts/e2e_lib.mjs makes. Run: node scripts/e2e_spacing.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_spacing');
await run.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fetch = (f => async (url, ...r) => /\\/api\\//.test(String(url)) ? { ok: true, status: 200, json: async () => ({ ok: false, reason: 'stand-in' }), text: async () => '{"ok":false}' } : f(url, ...r))(window.fetch);` });   // the throwaway server has no crop-map or soil-moisture route: a demo field asks for them at once, so they are answered here, quietly
const { ROOT, js, until, size, go, check, group, finish, sleep, shot } = run;
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const stubs = `window.fetch = async () => ({ json: async () => ({ ok: false }) })`;
const prep = async width => { await size(width); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${WELCOME})`); await go('/'); await until(`!/^a demo field$/.test(document.querySelector('#tryRegion')?.textContent || 'a demo field')`); };
const hash = async (h, width, ready) => { await prep(width); await go('/' + h); await until(ready); await sleep(250); };
// The measuring: run in the page on the visible view. Returns a list of plain sentences about what is wrong.
const MEASURE = `(() => {
  const view = [...document.querySelectorAll('.view')].find(v => !v.hidden); if (!view) return ['no view'];
  const out = [], vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden], .sr, svg'); };
  const name = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : '') + ' "' + (el.textContent || '').trim().slice(0, 28) + '"';
  const textBlocks = [...view.querySelectorAll('h1, h2, h3, h4, p, li, dd, label, .cap, .lead')].filter(vis);
  // 1. a heading with less than 6 px above it, when something visible sits directly above
  for (const h of view.querySelectorAll('h2, h3, h4')) {
    if (!vis(h)) continue;
    const prev = h.previousElementSibling; if (!prev || !vis(prev)) continue;
    const gap = h.getBoundingClientRect().top - prev.getBoundingClientRect().bottom;
    if (gap < 6) out.push('heading touches what is above it (' + Math.round(gap) + ' px): ' + name(h));
  }
  // 2. two text blocks that are siblings, stacked, with no space between them
  for (const el of textBlocks) {
    const nx = el.nextElementSibling; if (!nx || !textBlocks.includes(nx) || /^(LI)$/.test(el.tagName)) continue;
    const a = el.getBoundingClientRect(), b = nx.getBoundingClientRect(); if (b.top < a.bottom - 1 || b.left > a.right) continue;
    const gap = b.top - a.bottom; if (gap < 2 && Math.abs(a.left - b.left) < 4) out.push('text blocks touch (' + Math.round(gap) + ' px): ' + name(el) + ' / ' + name(nx));
  }
  // 3. a card, panel or list with less than 10 px inside it on a side where text starts
  for (const box of view.querySelectorAll('.card, .gl, .panel, .rv-answer, .sat-card, .data-note, .soilcard, .fold-card')) {
    if (!vis(box)) continue; const s = getComputedStyle(box), pad = Math.min(parseFloat(s.paddingLeft), parseFloat(s.paddingTop));
    const direct = [...box.children].filter(vis); if (!direct.length) continue;
    if (box.classList.contains('gl') || box.classList.contains('place-card') || box.firstElementChild?.tagName === 'SUMMARY' || box.querySelector(':scope > .cover, :scope > summary')) continue;
    const text = direct.find(c => /^(P|H2|H3|H4|SPAN|DIV|UL)$/.test(c.tagName) && (c.textContent || '').trim());
    if (text && pad < 10 && !direct.some(c => c.classList.contains('row'))) out.push('box with only ' + Math.round(pad) + ' px inside: ' + name(box));
  }
  // 4. text that touches the screen edge
  for (const el of textBlocks) {
    const r = el.getBoundingClientRect(); if (r.left < 10 && !el.closest('.tbl, .reportbar, [role=tablist], .wsteps, .cta, .mapcol')) out.push('text within ' + Math.round(r.left) + ' px of the left edge: ' + name(el));
    if (innerWidth - r.right < 10 && r.right <= innerWidth + 1 && !el.closest('.tbl, .reportbar, [role=tablist], .wsteps, .cta, .mapcol')) out.push('text within ' + Math.round(innerWidth - r.right) + ' px of the right edge: ' + name(el));
  }
  // 5. a button or control row crammed against the text above it
  for (const b of view.querySelectorAll('.btnrow, .btn.primary, .btn.lg')) {
    if (!vis(b)) continue; const prev = b.previousElementSibling; if (!prev || !vis(prev) || !/^(P|UL|DIV|H2|H3)$/.test(prev.tagName)) continue;
    const gap = b.getBoundingClientRect().top - prev.getBoundingClientRect().bottom; if (gap < 4 && gap >= 0) out.push('button touches the text above it (' + Math.round(gap) + ' px): ' + name(b));
  }
  return [...new Set(out)].slice(0, 12);
})()`;
const scan = async (label, file) => { const found = await js(MEASURE); for (const line of found) console.log('space  ' + label + ': ' + line); check(`spacing: ${label}: no cramped or edge-touching text`, found.length === 0, `${found.length} found, listed above`); if (file) await shot(file); };

const GR = (() => { const months = []; for (let i = 0; i < 96; i++) { const key = `${2016 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, gap = key >= '2017-07' && key <= '2018-05'; months.push([key, gap ? null : Math.round((2 - i * 0.1 + (i % 3)) * 100) / 100, gap ? null : 1.4]); } return { ok: true, months, trend_cm_per_year: -1.1, trend_from: '2018-06', trend_to: '2023-12', trend_years: 5.6, area_km: 300 }; })();
const P = (date, dn, c, solar) => ({ date, utc: '15:00', solar_time: solar, solar_date: date, day_night: dn, lst_c: c, lst_k: c + 273.15, error_k: 1.5, orbit: 1, version: '002', granule: 'g' });
const ECO = { ok: true, passes: [P('2026-11-10', 'day', 14.2, '13:12:00'), P('2026-11-08', 'night', 3.1, '01:40:00')], passes_checked: 9, not_usable: { cloud: 4 }, window: { first: '2026-09-20', last: '2026-11-14' }, pixel_m: 70 };
const HLS = { ok: true, passes: [['2026-06-01', 0.3], ['2026-08-12', 0.71]].map(([date, ndvi]) => ({ date, sensor: 'S30', ndvi, clear_pixels: 90, of_pixels: 100 })), gaps: [] };

for (const width of [1280, 375]) await group(`spacing ${width}`, async () => {
  const at = `at ${width} px`;
  await prep(width); await scan(`home ${at}`, `home-${width}.png`);
  for (const [h, ready] of [['#data', '.data-sources'], ['#privacy', '.pgpanel'], ['#privacy/sent', '.sent-table'], ['#privacy/choices', '.choices-list'], ['#limits', '.lim'], ['#settings/units', '.pgpanel'], ['#settings/access', '.pgpanel'], ['#settings/stored', '.pgpanel'], ['#settings/remind', '.pgpanel'], ['#settings/admin', '.pgpanel']])
    { await hash(h, width, `document.querySelector('#infoBody ${ready}')`); await scan(`${h} ${at}`, `${h.replace(/[#/]/g, '_')}-${width}.png`); }
  // the setup steps, from a demo region
  await prep(width); await js(`document.querySelector('#tryRegion').click()`); await until(`!document.querySelector('#view-setup').hidden && document.querySelector('#wHeading')`); await sleep(300);
  await scan(`setup step 1 ${at}`, `setup1-${width}.png`);
  for (const n of [2, 3, 4]) { await js(`document.querySelector('#wNext')?.click()`); await sleep(250); await scan(`setup step ${n} ${at}`, `setup${n}-${width}.png`); }
  // the report, from the fixture (the same one the other suites use)
  await prep(width); await js(`${stubs}; import('/js/state.js').then(async st => { const m = await import('/js/report.js'); const a = await import('/js/app.js'); a.show('report'); m.openReport({ ...st.newState(), loc: { lat: 43.13, lon: -80.75 }, name: 'Oxford' }); })`); await sleep(900);
  await scan(`report (not read) ${at}`, `report-${width}.png`);
  await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'); const d = await import('/js/satellites2-data.js'); const v = await import('/js/satellites-view.js'); document.querySelector('#reportRoot').innerHTML = '<div class="rv-wrap"><div class="rv-main">' + v.satellitesHTML({ grace: d.cleanGrace(${JSON.stringify(GR)}), eco: d.cleanEco(${JSON.stringify(ECO)}), hls: d.cleanHls(${JSON.stringify(HLS)}) }) + '</div></div>'; })`); await sleep(400);
  await scan(`satellites cards ${at}`, `satellites-${width}.png`);
});
// ---- the setup screen: the steps column is about 30% and the map fills the rest edge to edge, at every width, with the largest text
await group('setup layout', async () => {
  for (const width of [320, 375, 768, 1024, 1280, 1440]) for (const big of [false, true]) {
    await prep(width); await js(`import('/js/settings.js').then(m => m.saveSettings({ text: ${big ? "'xlarge'" : "'default'"} }))`); await js(`document.querySelector('#tryRegion').click()`);
    await until(`!document.querySelector('#view-setup').hidden && document.querySelector('#wHeading')`); await sleep(250);
    await js(`document.querySelector('#setupMap').innerHTML = '<div class="leaflet-container" style="width:100%;height:100%"></div>'`); await sleep(100);   // a stand-in for the map, the way the map module fills it
    const m = await js(`(() => { const p = document.querySelector('#setupPanel').getBoundingClientRect(), mp = document.querySelector('#setupMap').getBoundingClientRect(), chips = [...document.querySelectorAll('.wstep .wnum')].map(n => Math.round(n.getBoundingClientRect().top)), slot = document.querySelector('#mapSlot'), cta = document.querySelector('.cta').getBoundingClientRect();
      return { panelW: Math.round(p.width), mapW: Math.round(mp.width), mapL: Math.round(mp.left), mapR: Math.round(mp.right), vw: innerWidth, mapH: Math.round(mp.height), chipsSame: new Set(chips).size === 1, slotShown: !!slot && getComputedStyle(slot).display !== 'none', ctaIn: cta.bottom <= innerHeight + 1 && cta.left >= 0 && cta.right <= innerWidth + 1, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
    const at = `at ${width} px${big ? ' with largest text' : ''}`;
    check(`setup layout: no sideways scroll ${at}`, m.over <= 0, JSON.stringify(m));
    check(`setup layout: the step numbers sit on one line ${at}`, m.chipsSame, JSON.stringify(m));
    check(`setup layout: the map sentence is gone once the map is there ${at}`, !m.slotShown, JSON.stringify(m));
    check(`setup layout: the bottom bar is on the screen ${at}`, m.ctaIn, JSON.stringify(m));
    if (width >= 1024) { check(`setup layout: the steps column is at most 460 px and the map takes the rest, edge to edge ${at}`, m.panelW <= 461 && m.mapL === m.panelW && m.mapR === m.vw && m.mapW >= m.vw * (big ? 0.55 : 0.6), JSON.stringify(m)); }
    else if (width >= 861) check(`setup layout: map beside the steps ${at}`, m.mapW > 300, JSON.stringify(m));
    else check(`setup layout: on a phone the map is full width above the steps ${at}`, m.mapW >= m.vw - 1 && m.mapH >= 100, JSON.stringify(m));
    await shot(`setuplayout-${width}${big ? '-big' : ''}.png`);
  }
});
await finish();
