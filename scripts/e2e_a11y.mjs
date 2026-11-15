// Crophalo's keyboard and screen-reader suite for the screens: the setup steps, the report and its seven tabs, Look ahead, the land history, and the Data, Privacy, Limitations and Settings pages.
// One browser, one throwaway copy. Groups (E2E_ONLY=headings,names,focus,live,order,axe picks some): headings (exactly one h1 in the open view, levels never skip, none empty), names (every control has an accessible name, every table has header cells),
// order (no positive tabindex, the Tab key walks the screen top to bottom and never into something hidden), focus (where the keyboard lands after step changes, tab changes, sheets opening and closing, Back), live (one polite region says what is loading), axe (WCAG 2.2 AA at 375 and 1280).
// RULE: never loosen a check to make it pass; a failure is a screen a keyboard or screen-reader user would meet. Run: node scripts/e2e_a11y.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';
import { PRESETS } from '../js/crops.js';

const run = await openRun('e2e_a11y');
await run.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fetch = (f => async (url, ...r) => /\\/api\\/(cropsnear|smaproot)/.test(String(url)) ? { ok: true, status: 200, json: async () => ({ ok: false, reason: 'stand-in' }), text: async () => '{"ok":false}' } : f(url, ...r))(window.fetch);` });   // the throwaway server has no crop-map or soil-moisture route: a demo field asks for them at once, so they are answered here, quietly
const { ROOT, js, page, until, seen, tap, press, size, go, check, same, group, finish, sleep } = run;
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

const FOCUSABLE = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex], [role=tab], [role=radio], [role=switch]';
// everything one screen needs to be judged, read in one pass from the open view (and an open dialog)
const SCAN = `(() => { const FOC = ${JSON.stringify(FOCUSABLE)};
  const root = [...document.querySelectorAll('.view')].find(v => !v.hidden) || document.body, dlg = document.querySelector('dialog[open]');
  const shut = el => { for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) if (!d.open && !(el.closest('summary') && el.closest('summary').parentElement === d)) return true; return false; };   // what is inside a closed fold is not on the screen and not on the Tab walk
  const vis = el => { if (!el.isConnected || el.closest('[hidden], [inert]') || shut(el)) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
  const scopes = [root, document.querySelector('header'), dlg].filter(Boolean), all = sel => scopes.flatMap(s => [...s.querySelectorAll(sel)]).filter(vis);
  const heads = all('h1, h2, h3, h4, h5, h6, [role=heading]').map(h => ({ level: +(h.tagName[1] || h.getAttribute('aria-level')), text: h.textContent.trim().replace(/\\s+/g, ' ').slice(0, 50), sr: !!h.closest('.sr') || h.classList.contains('sr') }));
  const nameOf = el => { const lab = el.getAttribute('aria-labelledby'); if (lab) { const t = lab.split(/\\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim(); if (t) return t; } const al = el.getAttribute('aria-label'); if (al && al.trim()) return al.trim();
    if (el.labels?.length) { const t = [...el.labels].map(l => l.textContent).join(' ').trim(); if (t) return t; } if (el.closest('label')?.textContent.trim()) return el.closest('label').textContent.trim();
    const t = (el.textContent || '').trim() || el.getAttribute('title') || (['submit', 'button'].includes(el.type) ? el.value : '') || el.querySelector('img[alt]:not([alt=""])')?.alt || el.querySelector('svg[aria-label]')?.getAttribute('aria-label') || ''; return t.trim(); };
  const controls = all('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=tab], [role=radio], [role=switch], [role=button], [role=option]');
  const unnamed = controls.filter(el => !nameOf(el)).map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
  const tables = all('table').map(t => ({ ths: t.querySelectorAll('th').length, scoped: [...t.querySelectorAll('th')].every(th => th.hasAttribute('scope') || th.closest('thead')), named: !!(t.querySelector('caption')?.textContent.trim() || t.getAttribute('aria-label') || t.closest('[aria-label],[aria-labelledby]')) , rows: t.rows.length }));
  const tabbable = [...document.querySelectorAll('${FOCUSABLE}')].filter(el => el.tabIndex >= 0 && !el.disabled && vis(el) && (dlg ? dlg.contains(el) : true));
  const positive = [...document.querySelectorAll('[tabindex]')].filter(el => +el.getAttribute('tabindex') > 0).length;
  const fixed = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const order = []; let prev = null; for (const el of tabbable) { const b = (el.matches('input.sr') && el.closest('label') ? el.closest('label') : el).getBoundingClientRect(); const cur = { el, top: b.top + scrollY, left: b.left, fixed: fixed(el) }; if (prev && !cur.fixed && !prev.fixed && cur.top < prev.top - 60 && cur.left <= prev.left + 10) order.push((prev.el.id || prev.el.className || prev.el.tagName) + ' -> ' + (el.id || el.className || el.tagName)); if (!cur.fixed) prev = cur; }
  const hiddenTab = [...document.querySelectorAll(FOC.split(', ').map(x => '[aria-hidden=true] ' + x).join(', '))].filter(el => el.tabIndex >= 0 && !el.disabled && !el.closest('[hidden]')).map(el => el.tagName + (el.id ? '#' + el.id : ''));
  const live = [...document.querySelectorAll('[aria-live], [role=status], [role=alert]')].filter(vis).map(el => (el.getAttribute('aria-live') || (el.getAttribute('role') === 'alert' ? 'assertive' : 'polite')) + ':' + (el.id || el.className));
  return { h1: heads.filter(h => h.level === 1).length, heads, unnamed, tables, positive, order, hiddenTab, live, tabbable: tabbable.length };
})()`;
const jumps = heads => heads.filter((h, i) => i > 0 && h.level > heads[i - 1].level + 1).map(h => `${h.text} (h${h.level})`);

const SCREENS = [];
const add = (name, open) => SCREENS.push({ name, open });
add('home', async w => { await fresh(w); });
for (const n of [1, 2, 3, 4]) add(`setup step ${n}`, async w => { await fresh(w); await tap('#tryRegion'); await sleep(250); for (let i = 1; i < n; i++) { await tap('#wNext'); await sleep(200); } await sleep(200); });
// the report is one page now (no tabs): once closed, once with every fold and strategy row open
add('report page', async w => { await fresh(w); await showReport(true, true); await sleep(250); });
add('report page, every fold open', async w => { await fresh(w); await showReport(true, true); await js(`document.querySelectorAll('#view-report details > summary').forEach(s => s.parentElement.open || s.click())`); await sleep(350); });
const { SETTINGS_TAB_IDS, PRIVACY_TAB_IDS } = await import('../js/pages-view.js');
const info = async (w, hash) => { await fresh(w); await go('/' + hash); await until(`document.querySelector('#infoBody')?.children.length > 0`); await sleep(500); };
add('data', w => info(w, '#data'));
for (const t of PRIVACY_TAB_IDS) add(`privacy ${t}`, w => info(w, `#privacy/${t}`));
add('limitations', w => info(w, '#limits'));
for (const t of SETTINGS_TAB_IDS) add(`settings ${t}`, w => info(w, `#settings/${t}`));
add('land history', async w => { await openHist(w); await js(`document.querySelector('#infoTitle').hidden = true`); });
for (const h of ['weeks', 'season', 'outlook', 'years']) add(`look ahead ${h}`, async w => { await openAhead(w); await sleep(1200); await js(`document.querySelector('#infoTitle').hidden = true; document.querySelector('[data-horizon="${h}"]').click()`); await sleep(900); });

const seen1280 = {};
await group('headings', async () => {
  for (const s of SCREENS) { await s.open(1280); const a = await js(SCAN); seen1280[s.name] = a;
    check(`headings: ${s.name} has exactly one main heading`, a.h1 === 1, `${a.h1} h1: ${a.heads.filter(h => h.level === 1).map(h => h.text).join(' | ')}`);
    same(`headings: ${s.name} never skips a level`, jumps(a.heads), []);
    check(`headings: ${s.name} has no empty heading`, a.heads.every(h => h.text), JSON.stringify(a.heads.filter(h => !h.text))); }
});
await group('names', async () => {
  for (const s of SCREENS) { const a = seen1280[s.name]; if (!a) continue;
    same(`names: every control on ${s.name} has a name`, a.unnamed, []);
    check(`names: every table on ${s.name} has header cells and a name`, a.tables.every(t => t.ths > 0 && t.scoped && t.named), JSON.stringify(a.tables.filter(t => !(t.ths > 0 && t.scoped && t.named)))); }
});
await group('order', async () => {
  for (const s of SCREENS) { const a = seen1280[s.name]; if (!a) continue;
    check(`order: ${s.name} has no tabindex above 0`, a.positive === 0);
    same(`order: ${s.name} goes down the screen, never back up in the same column`, a.order, []);
    same(`order: ${s.name} has no focusable control inside aria-hidden`, a.hiddenTab, []);
    check(`live: ${s.name} has no assertive region that chatters`, !a.live.some(l => l.startsWith('assertive:')), a.live.join(', ')); }
});
await group('focus', async () => {
  const where = () => js(`(() => { const a = document.activeElement; return a === document.body ? 'body' : (a.id || a.dataset?.horizon || a.dataset?.act || a.className || a.tagName); })()`);
  const inView = () => js(`(() => { const a = document.activeElement, v = [...document.querySelectorAll('.view')].find(x => !x.hidden); return !!a && a !== document.body && (v?.contains(a) || !!a.closest('dialog[open]')); })()`);
  await fresh(); await tap('#tryRegion'); await sleep(300);
  check('focus: opening setup puts the keyboard in the setup', await inView(), await where());
  for (const n of [2, 3, 4]) { await tap('#wNext'); await sleep(250); check(`focus: step ${n} puts the keyboard on the step, not on the page top`, await inView() && await where() !== 'body', await where()); }
  await tap('#wBack'); await sleep(250); check('focus: Back keeps the keyboard inside the setup', await inView(), await where());
  await fresh(); await showReport(true, true);
  check('focus: the report starts at its heading', await js(`document.activeElement.id === 'reportTitle'`), await where());
  // retired: "a tab change keeps the keyboard on the tabs" (the report has no tabs any more; a strategy row opens in place and keeps the keyboard on its summary, checked in e2e_letter)
  const i = await js(`(() => { const b = document.querySelector('#view-report .srci'); if (!b) return false; b.focus(); b.click(); return true; })()`); await sleep(400);
  check('focus: opening a source card puts the keyboard inside it', !i || await js(`!!document.activeElement.closest('dialog[open], [role=dialog]')`), await where());
  await press('Escape'); await sleep(300);
  check('focus: closing it returns the keyboard to the "i" that opened it', !i || await js(`document.activeElement.classList.contains('srci')`), await where());
  await openAhead(1280); await sleep(1200);
  await js(`document.querySelector('[data-ahead="rules"]').focus(); document.querySelector('[data-ahead="rules"]').click()`); await sleep(400);
  check('focus: opening "How Look ahead works" puts the keyboard inside the sheet', await js(`!!document.activeElement.closest('dialog[open], [role=dialog], .sheet')`), await where());
  await js(`document.querySelector('[data-ahead="rules-done"]')?.click()`); await sleep(400);
  check('focus: Done returns the keyboard to the button that opened it', await js(`document.activeElement.dataset?.ahead === 'rules'`), await where());
  await info(1280, '#settings'); await js(`document.querySelector('#pgtab-units, [role=tab]:nth-child(2)').focus()`); await press('ArrowRight'); await sleep(300);
  check('focus: a Settings tab change keeps the keyboard on the tabs', await js(`document.activeElement.getAttribute('role') === 'tab'`), await where());
  await js(`location.hash = '#privacy'`); await sleep(500); await js(`history.back()`); await sleep(600); check('focus: the page before, after Back, has the keyboard somewhere sensible', await inView(), await where());
});
await group('live', async () => {
  await fresh(); await tap('#tryRegion'); for (let i = 0; i < 4; i++) { await tap('#wNext'); await sleep(150); }
  const early = await seen(`!document.querySelector('#view-report').hidden`);
  const regions = await js(`[...document.querySelectorAll('#view-report [aria-live], #view-report [role=status], #view-report [role=alert]')].filter(e => e.getClientRects().length > 0 && !e.closest('details:not([open])')).map(e => (e.getAttribute('aria-live') || e.getAttribute('role')) + ':' + (e.id || e.className) + ':' + e.textContent.trim().slice(0, 40))`);
  const failed = await js(`!!document.querySelector('#reportTitle[aria-describedby="failWhy"]') && !!document.querySelector('#failWhy')?.textContent.trim()`);
  check('live: the report says what is happening: a polite status line while it loads, or a focused heading that reads its reason when it cannot', early && (failed || regions.some(r => /^(polite|status):/.test(r) && r.split(':')[2])), JSON.stringify(regions));
  check('live: no more than two live regions in the report at once', regions.length <= 2, JSON.stringify(regions));
  await fresh(); await showReport(true, true); await js(`document.querySelector('#lfSat').open || document.querySelector('#lfSat summary').click()`); await sleep(500);
  const sat = await js(`[...document.querySelectorAll('#view-report [aria-live], #view-report [role=status]')].filter(e => e.getClientRects().length > 0 && !e.closest('details:not([open])')).map(e => (e.getAttribute('aria-live') || e.getAttribute('role')) + ':' + (e.id || e.className))`);
  check('live: the satellite fold has a polite region for the sources that fill in, and no more than three', sat.some(r => r.startsWith('polite') || r.startsWith('status')) && sat.length <= 3, JSON.stringify(sat));
});
await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) for (const s of SCREENS) {
    await s.open(width);
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  ${s.name} at ${width}: ${line}`);
    check(`axe: ${s.name} at ${width}: 0 problems`, found.length === 0, `${found.length} found`);
  }
});
await group('toast', async () => {
  for (const width of [320, 375]) { await fresh(width); await js(`localStorage.setItem('crophalo.settings.v1', JSON.stringify({ text: 'xlarge' }))`); await go('/'); await sleep(500);
    const w = await js(`(async () => { const t = document.querySelector('#toast'); t.textContent = 'The land history was copied as text and a long sentence follows so that it must wrap at the narrowest width of a phone'; t.classList.add('show'); await new Promise(r => setTimeout(r, 300)); return [document.documentElement.scrollWidth - document.documentElement.clientWidth, Math.round(t.getBoundingClientRect().right), innerWidth]; })()`);
    check(`toast: a long toast with the largest text does not widen the page at ${width} px`, w[0] <= 0 && w[1] <= w[2], JSON.stringify(w)); }
});
await finish();
