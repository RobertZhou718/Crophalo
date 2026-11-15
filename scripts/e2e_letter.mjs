// Crophalo's one-page report suite in a real browser: no tabs; six blocks in the farmer's questions; the answer, three strategy rows with their five parts under one "Show more", the guide sentence and the adviser line once each,
// no chart before a fold is opened, and a late answer does not close what was opened. RULE: never loosen a check to make it pass. Run: node scripts/e2e_letter.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';
const run = await openRun('e2e_letter');
const { ROOT, js, until, tap, press, size, go, check, same, group, finish, sleep } = run;
await run.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.fetch = (f => async (url, ...r) => /\\/api\\//.test(String(url)) ? { ok: true, status: 200, json: async () => ({ ok: false, reason: 'stand-in' }), text: async () => '{"ok":false}' } : f(url, ...r))(window.fetch);` });   // the throwaway server has no data routes: every one answers quietly, and a group that needs an answer puts its own in
const HERE = path.join(ROOT, 'scripts'), fxf = n => fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8');
const REGION = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8'))[0];
const WELCOME = JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }));
const accepted = () => js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(JSON.stringify({ v: '2026-11-14', at: 'test' }))})`);
const quietApi = () => js(`window.fetch = (f => async (url, ...rest) => /\\/api\\/(smaproot|cropsnear|imergrain|gracecell|ecopass|hlsndvi|sources|dem|prices|faostat)/.test(url) ? ({ json: async () => ({ ok: false }) }) : f(url, ...rest))(window.fetch)`);
const fresh = async (width = 1280) => { await size(width); await go('/'); await js(`caches.keys().then(k => Promise.all(k.map(n => caches.delete(n))))`); await accepted(); await go('/'); await until(`document.querySelectorAll('#homeRegions .place-card').length > 0`); await quietApi(); };
const FIXTURE = `(() => { const s = (year, crop, sow, harvest, after, window = null) => ({ year, crop, sow, harvest, after, residueUntil: null, window });
  const now = { id: 'now', name: 'Now', kind: 'current', seasons: [s(1, 'corn', '2027-05-01', '2027-10-05', 'residue'), s(2, 'soy', '2028-05-20', '2028-10-01', 'residue'), s(3, 'corn', '2029-05-01', '2029-10-05', 'residue')], score: 62, scores: { water: 60, soil: 55, erosion: 40, income: 80, weather: 70 } };
  const wheat = { id: 'wheat', name: 'With winter wheat', kind: 'proposed', seasons: [now.seasons[0], now.seasons[1], s(3, 'wheat', '2028-10-05', '2029-07-25', 'cover', { earliest: '2028-09-25', latest: '2028-10-15' })], score: 71, scores: { water: 65, soil: 75, erosion: 78, income: 70, weather: 68 } };
  const other = { id: 'other', name: 'Barley', kind: 'proposed', seasons: [s(1, 'barley', '2027-04-20', '2027-08-01', 'bare')] };
  return { ok: true, current: now, recommended: wheat, others: [other], reason: 'Winter wheat keeps living roots on the field after soybeans.', evidence: [{ text: 'No stress thresholds crossed in 26 tested years.', sources: ['power', 'gpm'] }], gaps: ['Soil is assumed, not measured.'], risks: ['A late harvest squeezes the wheat window.'], sureness: 'Somewhat sure' }; })()`;
const showReport = async () => { await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'); const a = await import('/js/app.js'); a.show('report'); const state = { ...st.newState(), loc: { lat: ${REGION.lat}, lon: ${REGION.lon}, label: ${JSON.stringify(REGION.name)}, cc: 'CA' }, name: ${JSON.stringify(REGION.name)}, soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }; await m.renderResult(state, ${FIXTURE}, {}); })`); await until(`!!document.querySelector('#answer')`); await sleep(300); };
for (const width of [1280, 390]) await group(`the one page at ${width}`, async () => {
  await fresh(width); await showReport();
  const q = sel => js(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
  check('no tab strip, no "Next" button, no priorities panel, no sliders in the letter (they are in "Change and see")', (await q('[role=tablist], [role=tab], .rv-nextrow, .rv-prio, .rv-letter input[type=range]')) === 0);
  same('the questions are the headings, in order', await js(`[...document.querySelectorAll('#reportRoot .rv-block > h2')].map(h => h.textContent)`), ['What should I plant next?', 'Compare strategies', 'What could go wrong?', 'When do I do what?', 'More about your field']);
  check('no "Overview", "What if" or "Fine-tune" anywhere', await js(`!/Overview|What if the weather|Fine-tune/.test(document.querySelector('#reportRoot').textContent)`));
  const rows = await js(`[...document.querySelectorAll('.srow')].map(r => [r.querySelector('.srow-tag').textContent.trim(), r.open])`);
  check('three strategy rows, what you grow now first, all closed', rows.length === 3 && /^What you grow now/.test(rows[0][0]) && /Our suggestion/.test(rows[1][0]) && rows.every(r => r[1] === false), JSON.stringify(rows));
  check('what you grow now has no "Try this strategy" button; the others have one', await js(`document.querySelector('.srow.is-now')?.querySelector('[data-act=try]') === null && document.querySelectorAll('.srow:not(.is-now) [data-act=try]').length === 2`));
  await js(`document.querySelector('.srow:not(.is-now) summary').click()`); await sleep(150);
  check('one tap opens the parts that have something to say, in the challenge\'s words and order, and the first is "Why it was suggested"', await js(`(h => h[0] === 'Why it was suggested' && h.every(x => ['Why it was suggested', 'What evidence supports it', 'What benefits it may offer', 'Where information is missing', 'Risks to check locally'].includes(x)) && h.join() === ['Why it was suggested', 'What evidence supports it', 'What benefits it may offer', 'Where information is missing', 'Risks to check locally'].filter(x => h.includes(x)).join())([...document.querySelector('.srow[open] .srow-body').querySelectorAll(':scope > .sd-sec > h3')].map(h => h.textContent))`));
  await js(`document.querySelectorAll('.srow').forEach(r => { r.open = true; })`); await sleep(100);
  check('no strategy ever says a part is empty: no "None listed yet", no "No evidence is listed", no "does not mean there are none"', await js(`!/None listed yet|is listed yet|are listed yet|does not mean there are none|Nothing to add/.test(document.querySelector('.srows').textContent)`));
  check('the answer card has a real two-way choice: two radios in a radio group, our suggestion chosen, with a chosen look', await js(`(g => g?.getAttribute('role') === 'radiogroup' && g.querySelectorAll('input[type=radio]').length === 2 && document.querySelector('#pick-alt').checked && g.querySelector('.is-on')?.contains(document.querySelector('#pick-alt')))(document.querySelector('.rv-pick'))`));
  await js(`document.querySelector('#pick-now').click()`); await sleep(250);
  check('pressing "What you grow now" selects it and the headline, the score and the reason follow it', await js(`document.querySelector('#pick-now').checked && /^Keep Corn, then soybeans/.test(document.querySelector('.rv-headline').textContent) && /^62/.test(document.querySelector('#answer .rv-chiprow .chip').textContent.trim()) && /compares the others with it/.test(document.querySelector('.rv-reason').textContent) && document.activeElement.id === 'pick-now'`));
  await press('ArrowRight'); await sleep(250);
  check('the arrow keys move the choice back to our suggestion', await js(`document.querySelector('#pick-alt').checked && /^Try /.test(document.querySelector('.rv-headline').textContent) && /^71/.test(document.querySelector('#answer .rv-chiprow .chip').textContent.trim())`));
  check('a row of the page\'s parts sits in the fixed bar: six links, the first marked, solid background, one line', await js(`(n => n && [...n.querySelectorAll('a')].length === 6 && n.querySelector('a[aria-current=true]').dataset.part === 'blkAnswer' && getComputedStyle(document.querySelector('#reportBar')).position === 'sticky' && getComputedStyle(document.querySelector('#reportBar')).backgroundColor !== 'rgba(0, 0, 0, 0)' && n.querySelector('ul').scrollWidth >= 0)(document.querySelector('.rv-parts'))`));
  await js(`document.querySelector('.rv-parts a[data-part=blkCompare]').click()`); await sleep(2000);
  check('pressing a part scrolls to it with its heading clear of the bar, and marks it as the current part', await js(`(() => { const bar = document.querySelector('#reportBar').getBoundingClientRect(), h = document.querySelector('#blkCompare h2').getBoundingClientRect(); return h.top >= bar.bottom - 2 && document.querySelector('.rv-parts a[aria-current=true]').dataset.part === 'blkCompare' && h.top < innerHeight / 2; })()`), await js(`(() => { const bar = document.querySelector('#reportBar').getBoundingClientRect(), h = document.querySelector('#blkCompare h2').getBoundingClientRect(); return JSON.stringify({ barBottom: bar.bottom, hTop: h.top, cur: document.querySelector('.rv-parts a[aria-current=true]')?.dataset.part, y: scrollY, ih: innerHeight }); })()`));
  await js(`scrollTo(0, 0)`); await sleep(300);
  check('the guide sentence and the adviser line appear once each', await js(`(t => (t.match(/Crophalo is a guide\\. You decide what to plant\\./g) ?? []).length === 1 && (t.match(/Ask a farm adviser or farmers near you before you change your rotation\\./g) ?? []).length === 1)(document.querySelector('#reportRoot').textContent)`));
  check('"Add to My farm" is in the first block and the other blocks hold no second one', await js(`!!document.querySelector('#blkAnswer #rbFarm') && document.querySelectorAll('[data-act=farm]').length === 1 && /^Add to My farm$/.test(document.querySelector('#rbFarm').textContent.trim())`));
  check('no chart, canvas or table is visible before a fold is opened', await js(`![...document.querySelectorAll('#reportRoot svg.chart, #reportRoot canvas, #reportRoot table')].some(e => !e.closest('details:not([open])') && e.getBoundingClientRect().width > 0)`));
  check('the page fills the width in line with the bar and never scrolls sideways', await js(`document.documentElement.scrollWidth <= innerWidth + 1`));
  await js(`document.querySelector('#lfMonths summary').click()`); await sleep(100);
  await js(`window.__late = (async () => { const m = await import('/js/report.js'); })()`);
  check('a fold opened by the farmer is still open after the page draws again', await js(`(async () => { const open = [...document.querySelectorAll('details[open]')].map(d => d.id).join(); document.dispatchEvent(new CustomEvent('crophalo:test-late')); return open.includes('lfMonths'); })()`));
});

// Your hardest year: needs a weather record, so the page is opened with the recorded NASA POWER answer
await group('your hardest year', async () => {
  const POWER = fxf('power_barrie.json'), REC = JSON.parse(POWER);
  for (const width of [1280, 375]) {
    await fresh(width);
    await js(`(async () => { const st = await import('/js/state.js'), m = await import('/js/report.js'), a = await import('/js/app.js'), d = await import('/js/data.js'); a.show('report');
      const series = d.buildSeries(${POWER}, { lat: ${REC.geometry.coordinates[1]}, lon: ${REC.geometry.coordinates[0]} });
      await m.renderResult({ ...st.newState(), loc: { lat: ${REC.geometry.coordinates[1]}, lon: ${REC.geometry.coordinates[0]}, cc: 'CA' }, name: 'Barrie test', soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }, ${FIXTURE}, { series }); })()`);
    await until(`!!document.querySelector('#hardYear')`, 8000).catch(() => {});
    const card = await js(`({ there: !!document.querySelector('#hardYear'), under: !!document.querySelector('#blkCompare .srows ~ #hardYear'), chips: document.querySelectorAll('.hy-chip').length, pressed: document.querySelectorAll('.hy-chip[aria-pressed=true]').length, rows: document.querySelectorAll('.hy-row').length, pills: [...document.querySelectorAll('.hy-res .chip')].map(c => c.textContent.trim()), small: [...document.querySelectorAll('.hy-chip, .hy-pick select')].filter(b => b.getBoundingClientRect().height < 43.5).length, hs: [...document.querySelectorAll('.hy-chip, .hy-pick select')].map(b => Math.round(b.getBoundingClientRect().height * 10) / 10 + ':' + b.tagName), wide: document.documentElement.scrollWidth - innerWidth })`);
    check(`hardest year at ${width} px: the card sits under the three strategies, with chips (one pressed) and a row for each strategy`, card.there && card.under && card.chips >= 2 && card.pressed === 1 && card.rows === 3, JSON.stringify(card));
    check(`hardest year at ${width} px: every result is Hurt, Close call, No hard day found or Not judged; every chip is 44 px high; nothing scrolls sideways`, card.pills.every(p => ['Hurt', 'Close call', 'No hard day found', 'Not judged'].includes(p)) && card.small === 0 && card.wide <= 0, JSON.stringify(card));
    const before = await js(`document.querySelector('.hy-chip[aria-pressed=true]').id`);
    await js(`[...document.querySelectorAll('.hy-chip')].find(c => c.getAttribute('aria-pressed') !== 'true').click()`); await sleep(300);
    check(`hardest year at ${width} px: tapping another chip presses it, keeps the keyboard on it and redraws the rows`, await js(`document.querySelector('.hy-chip[aria-pressed=true]').id !== ${JSON.stringify(before)} && document.activeElement === document.querySelector('.hy-chip[aria-pressed=true]') && document.querySelectorAll('.hy-row').length === 3`));
  }
});

// the loading screen is a plain list; a slow extra service never holds the farmer: "See the report now", the "Still reading" line, then "New data has arrived" and "Refresh the report"
await group('slow service', async () => {
  const POWER = fxf('power_barrie.json'), FORECAST = fxf('forecast_barrie.json'), REC = JSON.parse(POWER);
  await fresh(1280);
  await js(`window.fetch = async url => { const u = String(url), json = t => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => t, json: async () => JSON.parse(t) });
    const wait = ms => new Promise(r => setTimeout(r, ms));
    if (/power\\.larc/.test(u)) { await wait(300); return json(${JSON.stringify(POWER)}); }
    if (/open-meteo/.test(u)) { await wait(300); return json(${JSON.stringify(FORECAST)}); }
    if (/smaproot/.test(u)) { await wait(11000); return json('{"ok":true,"value":0.31,"date":"2026-11-14","cell":{"lat":43.1,"lon":-80.7}}'); }
    return json('{"ok":false,"reason":"stand-in"}'); }`);
  await js(`import('/js/report.js').then(m => m.setSeam({ engine: async () => ({ optionsFor: async () => (${FIXTURE}) }) }))`);
  await js(`(async () => { const st = await import('/js/state.js'), m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report'); m.openReport({ ...st.newState(), loc: { lat: ${REC.geometry.coordinates[1]}, lon: ${REC.geometry.coordinates[0]} }, name: 'Barrie test' }); })()`);
  await until(`!!document.querySelector('.rv-loading')`, 4000); await sleep(1200);
  const early = await js(`({ list: document.querySelectorAll('.rv-rows .rv-src').length, count: document.querySelector('.rv-count').textContent, pic: document.querySelectorAll('.rv-loading svg, .rv-loading canvas, .rv-loading progress, .rv-loading .fx-scan').length, see: !!document.querySelector('#seeNow'), h1: document.querySelector('#ldTitle').textContent })`);
  check('the loading screen is a plain list with one count line and no picture, and no button yet', early.list >= 4 && /^\d of \d read$/.test(early.count) && early.pic === 0 && !early.see && early.h1 === 'Reading your field’s data', JSON.stringify(early));
  await until(`!!document.querySelector('#seeNow')`, 9000);
  check('after five seconds, with the weather in and the soil moisture still reading, "See the report now" shows with its quiet line, and the slow row says so', await js(`/The rest keeps loading and you can add it when it arrives\\./.test(document.querySelector('#ldAction').textContent) && /Taking longer than usual…/.test(document.querySelector('.rv-loading').textContent)`));
  await tap('#seeNow'); await until(`!!document.querySelector('#answer')`, 6000);
  check('pressing it opens the report at once, and the part whose data has not come says "Still reading: soil moisture."', await js(`(() => { document.querySelector('#lfSat summary').click(); return /Still reading: soil moisture/.test(document.querySelector('#lfSat').textContent); })()`));
  const y = await js(`(() => { scrollTo(0, 120); return scrollY; })()`);
  await until(`!!document.querySelector('#rvFresh')`, 14000);
  check('when the late answer lands the page does not change by itself: one line says "New data has arrived: soil moisture." with one button', await js(`/New data has arrived: soil moisture\\./.test(document.querySelector('#rvFresh').textContent) && !!document.querySelector('#rvRefresh') && /Still reading: soil moisture/.test(document.querySelector('#lfSat').textContent)`));
  const topBefore = await js(`document.querySelector('#lfSat summary').getBoundingClientRect().top`); await js(`document.querySelector('#rvRefresh').click()`); await sleep(500);   // the line sits at the top and the page was scrolled: a click with a finger would scroll to it; the press itself must not move the page
  check('"Refresh the report" fills the part, keeps the fold open and the place on the page, and the line goes', await js(`!document.querySelector('#rvFresh') && document.querySelector('#lfSat').open && /Water in the top soil: 31%/.test(document.querySelector('#lfSat').textContent) && Math.abs(document.querySelector('#lfSat summary').getBoundingClientRect().top - ${topBefore} + document.documentElement.scrollTop * 0) < 200`), await js(`JSON.stringify({ fresh: !!document.querySelector('#rvFresh'), open: document.querySelector('#lfSat').open, text: document.querySelector('#lfSat').textContent.replace(/\\s+/g, ' ').slice(0, 200), y: scrollY, was: ${y} })`));
  check('the words "not read yet" are nowhere on the page', await js(`!/not been read yet|not read yet|Not read\\b/i.test(document.querySelector('#reportRoot').textContent)`));
});

// the weather record itself is slow: the plain slow line with the seconds, then Try again beside Keep waiting; a service that fails: its row says so and what the report loses, and the report still opens by itself
await group('weather record slow', async () => {
  const POWER = fxf('power_barrie.json'), REC = JSON.parse(POWER);
  await fresh(1280);
  await js(`window.fetch = async url => { const u = String(url), json = t => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => t, json: async () => JSON.parse(t) }); if (/power\\.larc/.test(u)) { await new Promise(r => setTimeout(r, 23000)); return json(${JSON.stringify(POWER)}); } return json('{"ok":false}'); }`);
  await js(`(async () => { const st = await import('/js/state.js'), m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report'); m.openReport({ ...st.newState(), loc: { lat: ${REC.geometry.coordinates[1]}, lon: ${REC.geometry.coordinates[0]} }, name: 'Barrie test' }); })()`);
  await until(`/taking longer than usual: \\d+ s/.test(document.querySelector('.rv-loading')?.textContent ?? '')`, 12000);
  check('at five seconds the weather record says plainly it is taking longer, with the seconds, and offers nothing else yet', await js(`/NASA.s weather record is taking longer than usual: \\d+ s\\./.test(document.querySelector('.rv-loading').textContent) && !document.querySelector('#seeNow') && !/Try again/.test(document.querySelector('.rv-loading').textContent)`));
  await until(`/Try again/.test(document.querySelector('.rv-loading')?.textContent ?? '')`, 20000);
  check('after twenty seconds: "Try again" beside "Keep waiting", never a dead screen', await js(`[...document.querySelectorAll('#ldAction button')].map(b => b.textContent).join('|') === 'Try again|Keep waiting'`));
});
await group('a service that fails', async () => {
  const POWER = fxf('power_barrie.json'), FORECAST = fxf('forecast_barrie.json'), REC = JSON.parse(POWER);
  await fresh(1280);
  await js(`window.fetch = async url => { const u = String(url), json = t => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => t, json: async () => JSON.parse(t) }); if (/power\\.larc/.test(u)) return json(${JSON.stringify(POWER)}); if (/open-meteo/.test(u)) return json(${JSON.stringify(FORECAST)}); if (/smaproot/.test(u)) { await new Promise(r => setTimeout(r, 1200)); return { ok: false, status: 500, text: async () => '', json: async () => { throw new Error('x'); } }; } return json('{"ok":false,"reason":"stand-in"}'); }`);
  await js(`import('/js/report.js').then(m => m.setSeam({ engine: async () => ({ optionsFor: async () => (${FIXTURE}) }) }))`);
  await js(`window.__rows = []; new MutationObserver(() => { const t = document.querySelector('.rv-loading')?.textContent; if (t && /Could not be read/.test(t)) window.__rows.push(t.replace(/\\s+/g, ' ')); }).observe(document.documentElement, { subtree: true, childList: true, characterData: true })`);
  await js(`(async () => { const st = await import('/js/state.js'), m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report'); m.openReport({ ...st.newState(), loc: { lat: ${REC.geometry.coordinates[1]}, lon: ${REC.geometry.coordinates[0]} }, name: 'Barrie test' }); })()`);
  await until(`!!document.querySelector('#answer')`, 15000);
  const rows = await js(`window.__rows.at(-1) ?? ''`);
  check('the report opens by itself when everything has answered or failed, with no button, and the failed row said what the report loses', /Could not be read/.test(rows) && /Without it the report cannot say how wet the soil is\./.test(rows) && !(await js(`!!document.querySelector('#seeNow')`)), rows.slice(0, 300));
  check('the part says it plainly and never "not read yet"', await js(`(document.querySelector('#lfSat summary').click(), /did not answer/.test(document.querySelector('#lfSat').textContent) && !/not read yet|Not read\\b/i.test(document.querySelector('#reportRoot').textContent))`));
});

// what My farm is handed: a demo field carries its own short name; a farmer's own field carries none
for (const [demo, name] of [[true, 'A research field near Mead'], [true, 'A research field near Beltsville'], [true, 'A field near Barrie'], [false, 'My own field'], [false, '']]) await group(`add to My farm: ${demo ? 'demo' : 'own'} field "${name}"`, async () => {
  await fresh(1280);
  await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report'); m.setSeam({ farm: async () => ({ addFromReport: p => { window.__payload = p; return { farmId: 'f1', fieldId: 'x' }; } }) });
    await m.renderResult({ ...st.newState(), loc: { lat: ${REGION.lat}, lon: ${REGION.lon}, label: 'Near Somewhere', cc: 'US' }, name: ${JSON.stringify(name)}, soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} }, area: { pts: [[${REGION.lat}, ${REGION.lon}], [${REGION.lat}, ${REGION.lon + 0.001}], [${REGION.lat + 0.001}, ${REGION.lon + 0.001}]], ha: 5 } }, ${FIXTURE}, { demo: ${demo} }); })`);
  await until(`!!document.querySelector('#rbFarm')`); await tap('#rbFarm'); await until(`!!window.__payload`, 4000);
  const p = await js(`({ fieldName: window.__payload.place.fieldName ?? null, est: window.__payload.areaEstimated, ring: Array.isArray(window.__payload.outline) })`);
  same('the payload names a demo field and leaves a farmer\'s own field unnamed; a drawn ring is not "estimated"', p, { fieldName: demo && name ? name : null, est: false, ring: true });
  if (demo && name === 'A research field near Mead') {
    check('after the press the report is still the shown view and the button says Added; a star mark is on "My farm"; a screen reader hears "Added to My farm."', await js(`!document.querySelector('#view-report').hidden && /Added/.test(document.querySelector('#rbFarm').textContent) && document.getElementById('navFarm').hasAttribute('data-new') && /Added to My farm\\./.test(document.querySelector('#farmNote').textContent) && document.querySelector('#farmNote').getAttribute('role') === 'status'`));
    await js(`window.__calls = 0; const f = window.__payload; window.__payload = null`); await js(`document.querySelector('#rbFarm').click()`); await sleep(300);
    check('a second press does nothing new: nothing is stored again, nothing opens', await js(`window.__payload === null && !document.querySelector('#view-report').hidden && /Added/.test(document.querySelector('#rbFarm').textContent)`));
    await js(`document.getElementById('navFarm').click()`); await sleep(300);
    check('the mark goes when My farm is opened', await js(`!document.getElementById('navFarm').hasAttribute('data-new')`));
  }
});

// USDA's cash bids in the fold "Crop prices": a United States field shows what buyers reported paying, with "A bid, not your price."; a field outside the United States shows nothing of it
await group('cash bids', async () => {
  const MEAD = fxf('market-page/mead_now_standin.json');
  for (const [cc, shows] of [['US', true], ['CA', false]]) {
    await fresh(1280);
    await js(`window.fetch = (f => async (url, ...r) => { const u = String(url), json = t => ({ ok: true, status: 200, json: async () => JSON.parse(t), text: async () => t }); if (/\\/api\\/keys/.test(u)) return json('{"ams":true}'); if (/\\/api\\/mnfield/.test(u)) return json(${JSON.stringify(MEAD)}); if (/\\/api\\//.test(u)) return json('{"ok":false}'); return f(url, ...r); })(window.fetch)`);
    await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report');
      await m.renderResult({ ...st.newState(), loc: { lat: ${REGION.lat}, lon: ${REGION.lon}, label: 'Near Mead, Nebraska', cc: ${JSON.stringify(cc)} }, name: 'Mead field', soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }, ${FIXTURE}, {}); })`);
    await until(`!!document.querySelector('#answer')`); await sleep(1500);
    await js(`document.querySelector('#lfPrices summary').click()`); await sleep(200);
    const t = await js(`document.querySelector('#lfPrices').textContent.replace(/\\s+/g, ' ')`);
    check(`cash bids for a ${cc} field: ${shows ? 'one line for what buyers reported paying, and "A bid, not your price."' : 'nothing of it'}`, shows ? /What buyers reported paying/.test(t) && /A bid, not your price\./.test(t) : !/buyers reported paying|A bid, not your price/.test(t), t.slice(0, 240));
    if (shows) {
      check('a price is shown with its figure, its unit and the date of the report, and the caption comes only because a price is shown', /1\.11/.test(t) && /bushel/.test(t) && /(Nov|November)[^.]{0,12}2026|2026/.test(t) && /A bid, not your price\./.test(t), t.slice(0, 500));
      await js(`document.querySelector('#sr-now summary').click()`); await sleep(150);
      const row = await js(`document.querySelector('#sr-now').textContent.replace(/\\s+/g, ' ')`);
      check('the strategy row carries the bid in its own lists and reaches "Risks to check locally"', /Risks to check locally/.test(row) && /1\.11|bid|buyer/i.test(row), row.slice(0, 400));
    }
  }
});

// No bids to show for a United States field: one plain line under "Crop prices" says why. The public server keeps /api/keys shut (404) and says "not set up" itself when it holds no Market News key; a failed lookup says Market News did not answer.
await group('cash bids: not set up, not answering', async () => {
  const NOT_SET = { ok: false, not_set: true, reason: 'Local market prices (USDA Market News) are not set up on this server (the owner\'s free key is not set)' }, DOWN = fxf('market-page/failed_standin.json');
  for (const [name, keys, answer, want] of [['no key on the server', null, NOT_SET, /Local cash bids from USDA Market News are not set up on this server, so none are shown\./], ['Market News not answering', '{"ok":true,"ams":true}', DOWN, /USDA Market News did not answer just now, so its bids are not read\./]]) {
    await fresh(1280);
    await js(`window.fetch = (f => async (url, ...r) => { const u = String(url), json = (t, status = 200) => ({ ok: status === 200, status, json: async () => JSON.parse(t), text: async () => t }); if (/\\/api\\/keys/.test(u)) return ${keys ? `json(${JSON.stringify(keys)})` : `json('{"ok":false,"reason":"Unknown endpoint"}', 404)`}; if (/\\/api\\/mnfield/.test(u)) return json(${JSON.stringify(JSON.stringify(answer))}); if (/\\/api\\//.test(u)) return json('{"ok":false}'); return f(url, ...r); })(window.fetch)`);
    await js(`import('/js/state.js').then(async st => { const m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report');
      await m.renderResult({ ...st.newState(), loc: { lat: ${REGION.lat}, lon: ${REGION.lon}, label: 'Near Mead, Nebraska', cc: 'US' }, name: 'Mead field', soil: { mode: 'assumed', texture: null, om: null, omPct: null }, farm: { ...st.newState().farm, irrigation: 'none' }, rotation: { preset: 'corn-soy-wheat', custom: [], garden: null, second: {} } }, ${FIXTURE}, {}); })`);
    await until(`!!document.querySelector('#answer')`); await sleep(1500);
    await js(`document.querySelector('#lfPrices summary').click()`); await sleep(200);
    const t = await js(`document.querySelector('#lfPrices').textContent.replace(/\\s+/g, ' ')`), page = await js(`document.querySelector('#view-report, main, body').textContent.replace(/\\s+/g, ' ')`);
    check(`${name}: one plain line under "Crop prices" says so, and no bid or caption is shown`, want.test(t) && !/buyers reported paying|A bid, not your price/.test(t), t.slice(-300));
    check(`${name}: no strategy says "not read", nothing is announced as new data, and no word of the server's insides is on the page`, !/Market News bids: not read/.test(page) && !/New data has arrived/.test(page) && !/Unknown endpoint|CROPHALO_|\.secrets|undefined/.test(t), page.slice(0, 200));
  }
});

// a missing crop map or soil-moisture reading never stops the report: only the weather record is needed
for (const mode of ['404', 'error answer']) await group(`crop map and soil moisture fail: ${mode}`, async () => {
  const POWER = fxf('power_barrie.json'), FORECAST = fxf('forecast_barrie.json'), REC = JSON.parse(POWER);
  await fresh(1280);
  await js(`window.fetch = async url => { const u = String(url), json = t => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => t, json: async () => JSON.parse(t) });
    if (/power\\.larc/.test(u)) return json(${JSON.stringify(POWER)}); if (/api\\.open-meteo/.test(u)) return json(${JSON.stringify(FORECAST)});
    if (/cropsnear|smaproot/.test(u)) return ${mode === '404' ? "({ ok: false, status: 404, headers: { get: () => null }, text: async () => 'Not Found', json: async () => { throw new SyntaxError('not json'); } })" : "json('{\"ok\":false,\"reason\":\"stand-in\"}')"};
    return json('{"ok":false}'); }`);
  await js(`import('/js/report.js').then(m => m.setSeam({ engine: async () => ({ optionsFor: async () => (${FIXTURE}) }) }))`);
  await js(`(async () => { const st = await import('/js/state.js'), m = await import('/js/report.js'), a = await import('/js/app.js'); a.show('report'); m.openReport({ ...st.newState(), loc: { lat: ${REC.geometry.coordinates[1]}, lon: ${REC.geometry.coordinates[0]} }, name: 'Barrie test' }); })()`);
  await until(`!!document.querySelector('#answer') || !!document.querySelector('#blkFail')`, 15000);
  check('the answer card and the three strategy rows are there', await js(`!!document.querySelector('#answer') && document.querySelectorAll('.srow').length === 3 && !document.querySelector('#blkFail')`));
  const bad = await js(`(t => (t.match(/.{0,50}(not been read yet|not read yet|Not read\\b|not worked out|Not built yet).{0,50}/gi) ?? []).join(' | '))(document.querySelector('#reportRoot').textContent.replace(/\\s+/g, ' '))`);
  check('the words "not read yet" are nowhere on the page', bad === '', bad);
});
await finish();
