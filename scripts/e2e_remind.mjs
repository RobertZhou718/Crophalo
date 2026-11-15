// Crophalo's reminders suite in a real browser: the Reminders section of the tab Notes and to-do (Remind me buttons with their suggested day, the dialog, the list with Done, Delete and Undo, the calendar file), the Calendar tab's own buttons, the Settings tab's list, 320 to 1280 with the largest text, axe.
// RULE: never loosen a check to make it pass. Run: node scripts/e2e_remind.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';
import { PRESETS } from '../js/crops.js';

const run = await openRun('e2e_remind');
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
const openTab = async (width = 1280, tab = 'notes') => { await fresh(width); await showReport(true, true); await sleep(500); await js(`window.__saved = []; URL.createObjectURL = b => { window.__saved.push(b); return 'blob:x'; }; HTMLAnchorElement.prototype.click = function () { window.__name = this.download; };`); await js(`document.querySelector('#${tab === 'calendar' ? 'lfMonths' : 'lfNotes'}').open || document.querySelector('#${tab === 'calendar' ? 'lfMonths' : 'lfNotes'} summary').click()`); await sleep(500); };
await group('notes tab', async () => {
  await openTab();
  check('remind: the Reminders section is on the tab Notes and to-do, empty at first, with New reminder and a list of jobs', await js(`document.querySelector('#rmTitle').textContent === 'Reminders' && /No reminders yet/.test(document.querySelector('#rmList').textContent) && !!document.querySelector('#rmList [data-act=new]') && document.querySelectorAll('.rm-job [data-act=remind]').length >= 3`));
  check('remind: every Remind me button is named for its job and is 44 px high', await js(`[...document.querySelectorAll('.rm-job [data-act=remind]')].every(b => /^Remind me: /.test(b.getAttribute('aria-label')) && b.getBoundingClientRect().height >= 43.5)`));
  await js(`[...document.querySelectorAll('.rm-job [data-act=remind]')].find(b => /soil test/i.test(b.dataset.title)).click()`); await sleep(300);
  check('remind: the dialog opens with the job, a suggested day and the hint saying where it came from; the keyboard is in the title', await js(`(() => { const d = document.querySelector('dialog.remind-dialog[open]'); return !!d && d.querySelector('[name=title]').value === 'Get a soil test' && /^\\d{4}-\\d{2}-\\d{2}$/.test(d.querySelector('[name=day]').value) && /suggested this day/.test(d.textContent) && document.activeElement.name === 'title'; })()`));
  await shot('remind-dialog-1280.png');
  await js(`document.querySelector('[name=title]').value = ''; document.querySelector('[data-act=save]').click()`); await sleep(200);
  check('remind: an empty title is refused in words and the keyboard goes back to it', await js(`/Write what the reminder is for/.test(document.querySelector('#remindErr').textContent) && document.activeElement.name === 'title'`));
  await typeIn('[name=title]', 'Get a soil test'); await js(`document.querySelector('[data-act=save]').click()`); await sleep(300);
  check('remind: saving closes the dialog, says so, lists the reminder and returns the keyboard to the button', await js(`!document.querySelector('dialog.remind-dialog') && /Reminder saved/.test(document.querySelector('#toast').textContent) && /Get a soil test/.test(document.querySelector('#rmList').textContent) && document.activeElement.dataset.act === 'remind'`));
  check('remind: it is kept on this device under its own Crophalo key', await js(`JSON.parse(localStorage.getItem('crophalo.remind.v1')).length === 1`));
  await js(`document.querySelector('#rmList [data-act=new]').click()`); await sleep(250); await js(`document.querySelector('dialog.remind-dialog').dispatchEvent(new Event('cancel', { cancelable: true }))`); await sleep(200);
  check('remind: Escape closes the dialog and the keyboard returns to New reminder', await js(`!document.querySelector('dialog.remind-dialog') && document.activeElement.dataset.act === 'new'`));
  await js(`document.querySelector('.remind-card [data-act=done]').click()`); await sleep(250);
  check('remind: ticking Done moves it to the Done group', await js(`/Done \\(1\\)/.test(document.querySelector('#rmList').textContent) && document.querySelector('.remind-card').classList.contains('is-done')`));
  await js(`document.querySelector('.remind-card [data-act=calendar]').click()`); await sleep(200);
  check('remind: Add to calendar saves a .ics file and says so', await js(`/\\.ics$/.test(window.__name) && window.__saved.length === 1 && /calendar file was saved/.test(document.querySelector('#rmStatus').textContent)`));
  await js(`document.querySelector('.remind-card [data-act=delete]').click()`); await sleep(250);
  check('remind: Delete says so with Undo, and Undo brings it back', await js(`/No reminders yet/.test(document.querySelector('#rmList').textContent) && /Undo/.test(document.querySelector('#toast .btn')?.textContent ?? '')`));
  await js(`document.querySelector('#toast .btn').click()`); await sleep(250);
  check('remind: it is back after Undo', await js(`!!document.querySelector('.remind-card')`));
  await shot('remind-list-1280.png');
});
await group('calendar tab', async () => {
  await openTab(1280, 'calendar');
  check('remind: "When do I do what?" shows the next job with its own Remind me button', await js(`document.querySelectorAll('#blkWhen [data-act=remind]').length >= 1`));
  await js(`document.querySelector('#blkWhen [data-act=remind]').click()`); await sleep(300);
  check('remind: that button opens one dialog only', await js(`document.querySelectorAll('dialog.remind-dialog[open]').length === 1`));
});
await group('settings', async () => {
  await fresh(1280); await js(`localStorage.setItem('crophalo.remind.v1', JSON.stringify([{ id: 'rabc12345', title: 'Check the frost forecast', when: '2099-04-01T08:00', repeat: 'none', kind: 'frost', source: 'plan', note: '', farmId: '', fieldId: '', done: false, doneAt: '', seen: '', notify: true, push: false, made: 1 }]))`);
  await go('/#settings/remind'); await until(`document.querySelector('#remindList')`); await sleep(600);
  check('remind: the Settings list shows the reminder with its buttons and its count', await js(`/Check the frost forecast/.test(document.querySelector('#remindList').textContent) && /1 reminder set/.test(document.querySelector('#remindCount').textContent)`));
  await js(`document.querySelector('#remindList [data-act=delete]').click()`); await sleep(300);
  check('remind: deleting in Settings works and the count follows', await js(`/No reminders yet/.test(document.querySelector('#remindList').textContent) && /0 reminders set/.test(document.querySelector('#remindCount').textContent)`));
});
await group('fit', async () => {
  for (const width of [320, 375, 768, 1280]) for (const big of [false, true]) {
    await fresh(width); if (big) { await js(`localStorage.setItem('crophalo.settings.v1', JSON.stringify({ text: 'xlarge' }))`); await go('/'); await sleep(300); await quietApi(); }
    await showReport(true, true); await sleep(400); await js(`document.querySelector('#lfNotes').open || document.querySelector('#lfNotes summary').click()`); await sleep(500);
    await js(`[...document.querySelectorAll('.rm-job [data-act=remind]')][0].click()`); await sleep(300);
    check(`fit: the dialog does not widen the page at ${width} px${big ? ' with the largest text' : ''} and stays on the screen`, await js(`document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0 && (() => { const d = document.querySelector('dialog.remind-dialog').getBoundingClientRect(); return d.left >= -0.5 && d.right <= innerWidth + 0.5; })()`));
    if (width <= 600) check(`fit: the dialog's controls are 44 px or more at ${width} px${big ? ' (largest text)' : ''}`, await js(`[...document.querySelectorAll('dialog.remind-dialog .btn, dialog.remind-dialog input[type=text], dialog.remind-dialog input[type=date], dialog.remind-dialog input[type=time]')].every(e => e.getBoundingClientRect().height >= 43.5)`));
    await js(`document.querySelector('[data-act=cancel]').click()`); await sleep(200);
    check(`fit: the tab Notes and to-do with reminders does not scroll sideways at ${width} px${big ? ' with the largest text' : ''}`, await js(`document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0`));
    await js(`localStorage.clear()`);
  }
});
await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) for (const view of ['tab', 'dialog']) {
    await openTab(width); if (view === 'dialog') { await js(`document.querySelector('.rm-job [data-act=remind]').click()`); await sleep(300); }
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' '))))`);
    for (const line of found) console.log(`axe  remind ${view} at ${width}: ${line}`);
    check(`axe: reminders ${view} at ${width}: 0 problems`, found.length === 0, `${found.length} found`);
  }
});
await finish();
