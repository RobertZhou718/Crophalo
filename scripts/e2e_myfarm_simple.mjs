// The browser suite for the simpler My farm: a first view of one field, one date line, one finding and Compare plans in at most 13 controls; every tool that left it still
// reachable where it is used (Compare plans, the field's details, More); the report's own numbers; Map and 3D on the same field, plan and date; the "i" by tap and keyboard;
// no sideways scroll at 320, 375, 768 and 1280 px with the largest text; axe; Full, Less and Still motion. The plans are the crop engine's own on recorded weather.
// RULE: never loosen a check here to make it pass without a written reason beside it. Run: node scripts/e2e_myfarm_simple.mjs (E2E_ONLY picks groups)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';
import * as EN from '../js/engine.js';
import * as K from '../js/farmchips.js';
import * as S from '../js/simulate.js';
import * as CROPS from '../js/crops.js';
import { scoreWords } from '../js/words.js';
import { REPORT } from './fixtures/demo-plans.mjs';
import { PLACE, NOW } from './fixtures/engine-plans.mjs';

const FIX = f => fs.readFileSync(fileURLToPath(new URL('./fixtures/' + f, import.meta.url)), 'utf8');   // the weather services' answers, recorded 14 November 2026
const recorded = async url => {
  const f = /power[.]larc/.test(url) ? 'power_barrie.json' : /api[.]open-meteo[.]com\/v1\/forecast/.test(url) ? 'forecast_barrie.json' : /era5_land/.test(url) ? 'era5land_barrie.json' : /archive/.test(url) ? 'era5_barrie.json' : null;
  return f ? { ok: true, status: 200, headers: { get: () => null }, text: async () => FIX(f) } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
};
// The report as the live demo makes it: the farmer grows corn and soybeans in turn (two crops, which the engine lists over three seasons), and the plan to try sows
// winter wheat after the soybean harvest. Both plans are the engine's own answer for that rotation on the recorded weather, as the report screen gets them.
async function twoCropReport(place = PLACE, fetchFn = recorded) {
  K.setDataEnv({ fetch: fetchFn, now: () => NOW });
  const made = S.applyReport(S.emptyStore(), { ...REPORT, place }, { now: NOW });
  const own = S.setPlan(made.store, made.farmId, made.fieldId, { start: 2027, water: 'none', seasons: [{ crop: 'corn' }, { crop: 'soy' }] }, { now: NOW }).store;
  const farm = S.getFarm(own, made.farmId), field = S.getField(farm, made.fieldId);
  const r = await K.whenSettled(K.readingsFor(farm, field));
  K.setDataEnv({}); K.forgetReadings();
  const proposed = [r.options?.recommended, ...(r.options?.others || [])].find(p => p?.kind === 'proposed' && JSON.stringify(p.slots) === JSON.stringify(['corn', 'soy', 'wheat']));
  if (!r.options?.current || !proposed) throw new Error('the engine did not list the winter-wheat plan for corn and soybeans');
  return { place, area: 10, areaEstimated: true, current: { ...r.options.current, kind: 'current' }, proposed: { ...proposed, kind: 'proposed' }, date: '2026-11-15' };
}
// The demo region the report pre-selects corn, soybeans, winter wheat for (data/regions.json, "try"), on its own recorded NASA POWER weather: a roomy sowing window
const REGION = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../data/regions.json', import.meta.url)), 'utf8')).find(r => Array.isArray(r.try) && r.try.join() === 'corn,soy,wheat');
const recordedRegion = async url => /power[.]larc/.test(url) ? { ok: true, status: 200, headers: { get: () => null }, text: async () => FIX(`power_${REGION.id}.json`) } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' };
const RX = REGION && fs.existsSync(fileURLToPath(new URL(`./fixtures/power_${REGION.id}.json`, import.meta.url))) ? await twoCropReport({ lat: REGION.lat, lon: REGION.lon, label: REGION.name, name: REGION.name, cc: 'CA' }, recordedRegion) : null;
const R2 = await twoCropReport(), KD = EN.keyDates(R2.current, R2.proposed), REPORT_JS = JSON.stringify(R2);
const WHEAT = R2.proposed.seasons.at(-1), BEFORE = R2.proposed.seasons.at(-2), STRESS = K.stressOf(R2.current), STRESS_P = K.stressOf(R2.proposed);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], W = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}`; };
const LEFT = Math.round((Date.parse(WHEAT.window.latest) - Date.parse(WHEAT.sow)) / 864e5);   // the days the plan's own sowing day leaves before the window closes (6 on the recorded weather, as the report's risk line says)
const LIMIT = 12;   // the paper's 10 (token, zoom in and out, the map credit, the score's i, Compare plans, This field, Map, 3D, More), plus two the map draws;   // 13, plus the two closed folds the owner's "fewer words" rule adds (Show more under the finding, What the colours mean);   // the controls the first view may hold: the field picker, Compare plans, Map, 3D, More, then the map, the field's marker, zoom in, zoom out, the map credit, and the time bar's three

const run = await openRun('e2e_myfarm_simple');
const { js, page, until, tap, press, size, device, go, flat, shot, check, same, finish, sleep, send } = run;
// The copy under test has no picture or greenness lookup of its own: those lookups fail at once, as they do when they cannot be reached.
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, o) => /^[/]api[/](hlsndvi|ndvihist|gracecell|ecopass|crophist|hlsbox)/.test(String(u)) ? Promise.reject(new Error('down')) : first(u, o); })();" });
// A software renderer answers the board's "can this device draw 3D" probe with its own name, and the board then keeps to the map by design; for the 3D checks the probe
// (a canvas that is not on the page) is told a graphics chip's name, while the 3D view's own canvas on the page still tells the truth. As in scripts/e2e_farm3d_link.mjs.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const was = C.prototype.getParameter; C.prototype.getParameter = function (p) { return p === 37446 && this.canvas && !this.canvas.isConnected ? 'ANGLE (Test graphics chip)' : was.call(this, p); }; } })()` });
const WELCOME = JSON.stringify({ v: '2026-11-14', at: 'test' });   // the first-visit sheet is already accepted: it is not what these groups are about
const group = (label, body) => run.group(label, async () => { await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await go('/'); await body(); });
const text = sel => js(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim().replace(/\\s+/g, ' ') ?? null`);
const open = async () => {
  await js(`import('/js/farm.js').then(m => { window.__farm = m; m.setStartView?.('map'); window.__res = m.addFromReport(${REPORT_JS}); document.getElementById("navFarm").click(); })`);
  await until(`document.querySelector('#fwFinding')?.textContent.length > 5 && !document.querySelector('#view-farm').hidden`, 15000); await sleep(300);
  await js(`import('/js/engine.js').then(E => window.__farm.setGround(E.groundOn))`); await sleep(150);   // what the page start hands My farm
};
const DATA_JS = `window.__fix = ${JSON.stringify({ power: FIX('power_barrie.json'), forecast: FIX('forecast_barrie.json'), land: FIX('era5land_barrie.json') })};`;
const withData = async () => {   // the recorded weather, handed in the way a test does; the board asks the engine again
  await js(`${DATA_JS} window.__farm.setDataEnv({ now: () => ${NOW}, fetch: async url => { const f = /power[.]larc/.test(url) ? window.__fix.power : /api[.]open-meteo[.]com[/]v1[/]forecast/.test(url) ? window.__fix.forecast : /era5_land/.test(url) ? window.__fix.land : null; return f ? { ok: true, status: 200, headers: { get: () => null }, text: async () => f } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' }; } }); window.__farm.forgetReadings(); window.__farm.render()`);
  await until(`window.__farm._entry().state !== 'loading' && window.__farm._entry().forecastPending === false`, 90000); await sleep(400);
};
// the controls of the first view: everything that can be pressed, typed into or moved with the keyboard inside My farm, panels left out
const controls = () => page(T => T.controls(document.querySelector('#fw')).filter(el => !el.closest('#fwPanel, #fwHistory, #fwMoreMenu')).map(el => T.name(el)));
const moreOpen = async () => { if (await js(`document.querySelector('#fwMoreMenu')?.hidden !== false`)) await tap('#fwMoreBtn'); await until(`document.querySelector('#fwMoreMenu') && !document.querySelector('#fwMoreMenu').hidden`); };
const fromTools = async what => { await moreOpen(); await tap('#fwToolsBtn'); await until(`!!document.querySelector('[data-tool=${what}]')`); await tap(`[data-tool=${what}]`); await sleep(150); };   // Farm tools is one level in, under More
const openHist = async () => { await tap('#fwDetailsBtn'); await until(`!!document.querySelector('[data-act=history]')`); await tap('[data-act=history]'); };
const fromMore = async sel => { await moreOpen(); await tap(sel); await sleep(150); };
const details = async () => { if (!(await js(`!!document.querySelector('#fwPanel:not([hidden]) #fwonepage')`))) await tap('#fwDetailsBtn'); await until(`!document.querySelector('#fwPanel').hidden && document.querySelector('#fwonepage')`); };
const back = async () => { for (let i = 0; i < 5; i++) { if (await js(`document.querySelector('#fwPanel').hidden && document.querySelector('#fwEditBar').hidden && document.querySelector('#fwHistory').hidden && document.querySelector('#fwMoreMenu')?.hidden !== false`)) break; await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(150); } };
const stand3d = async () => {   // a 3D view that draws: the page's own function, so what the board gives it can be read
  await js(`window.__farm.setView3d((data, node) => { node.dataset.got = JSON.stringify({ field: data.field.id, planKind: data.planKind, date: data.date }); node.innerHTML = '<p class="f3d-plain">3D</p>'; return { ok: true, update(next) { node.dataset.got = JSON.stringify({ field: next.field.id, planKind: next.planKind, date: next.date }); }, dispose() {} }; })`);
};
const boardNow = () => js(`({ field: window.__farm._ui.fieldId, planKind: window.__farm._ui.planKind, date: window.__farm._ui.date, view: window.__farm._ui.view })`);

// Retired on 15 November 2026 at the owner's order: Compare plans is gone from My farm (panel, time bar, colour key, key days, two cards), so its groups do not run.
const retired = label => console.log(`retired: ${label}`);
// ---- 1. the first view
await group('first view', async () => {
  for (const w of [1280, 375]) {
    await size(w); await go('/'); await open();
    const res = await js('window.__res'), at = `${w} px`;
    check(`first view ${at}: the report's field is the one chosen`, !!res?.fieldId && await js(`document.querySelector('#fwField').value === window.__res.fieldId`), res);
    same(`first view ${at}: the plan shown is the plan to try, and the head names it with the report's own score`, [await js('window.__farm._ui.planKind'), /^Plan to try: .+ \d+ · (Good fit|OK fit|Poor fit)|Only just suits|Does not suit here/.test(await text('#fwPlan')), R2.proposed.flag === 'fails' ? /Does not suit here/.test(await text('#fwPlan')) : R2.proposed.flag === 'borderline' ? /Only just suits/.test(await text('#fwPlan')) : (await text('#fwPlan')).includes(`${Math.round(R2.proposed.score)} · `)], ['proposed', true, true]);   // M9: the chip's number is the report's own
    same(`first view ${at}: the head says the size and place and the next job in one sentence`, [/^About [\d.]+ ha \(estimated\)/.test(await text('#fwSub')), /^Next: (sow|harvest) .+\.$/.test(await text('#fwNextJob')) || /^No job planned\./.test(await text('#fwNextJob'))], [true, true]);
    same(`first view ${at}: the board opens on the first of the plan's days`, await js(`window.__farm._ui.date`), KD[0].date);
    same(`first view ${at}: no date line, no long sentence, no time bar and no colour key (they show inside Compare plans)`, await js(`[...document.querySelectorAll('#fwDate, #fwFinding, #fwStrip, #fwKey')].filter(n => n.getClientRects().length).length`), 0);   // M5
    check(`first view ${at}: the time bar writes no second date`, !/\b(19|20)\d\d\b|January|February|March|April|May|June|July|August|September|October|November|December|\b\d{4} season/.test(await text('#fwStrip') || ''), await text('#fwStrip'));   // its words for a screen reader say how to move a season, which is not a date
    const fd = await js(`document.querySelector('#fwFinding').dataset.full`);
    check(`first view ${at}: the finding is one sentence`, /^On \d+ [A-Z][a-z]{2} \d{4} .+\.$/.test(fd) && !/[.;:!?]\s+[A-Z]/.test(fd.slice(0, -1)), fd);
    check(`first view ${at}: it says what the plan to try does, the day the new crop goes in and the days that leaves before its sowing window closes`, fd.toLowerCase().includes(CROPS.cropName(WHEAT.crop, true).toLowerCase()) && fd.includes(`on ${W(WHEAT.sow)}, ${LEFT} day${LEFT === 1 ? '' : 's'} before its sowing window closes on ${W(WHEAT.window.latest)}`), fd);
    check(`first view ${at}: and what the current plan leaves on the ground meanwhile`, /while the current plan leaves (stubble until \d{1,2} [A-Z][a-z]{2} \d{4}|the soil bare)/.test(fd), fd);
    same(`first view ${at}: there is no Compare plans button and no main (blue) action in the first view`, await js(`[!!document.querySelector('#fwCompare'), [...document.querySelectorAll('#fw .btn.primary')].filter(b => b.getClientRects().length && !b.closest('#fwPanel')).length]`), [false, 0]);
    same(`first view ${at}: it starts on the Map`, await js(`[document.querySelector('#fwMapBtn').getAttribute('aria-pressed'), !document.querySelector('#fwMap').hidden, document.querySelector('#fw3d').hidden]`), ['true', true, true]);
    const list = await controls();
    check(`first view ${at}: no more than ${LIMIT} controls (was 27)`, list.length <= LIMIT, `${list.length}: ${list.join(' | ')}`);
    check(`first view ${at}: the field picker shows its dropdown arrow`, await js(`getComputedStyle(document.querySelector('#fwField')).backgroundImage.includes('svg')`), await js(`getComputedStyle(document.querySelector('#fwField')).backgroundImage.slice(0, 60)`));
    check(`first view ${at}: More carries the app's chevron`, await js(`!!document.querySelector('#fwMoreBtn > .chev')`));
    check(`first view ${at}: no "⌄" letter stands in for an icon`, !(await js(`document.querySelector('#fw').textContent.includes('⌄')`)));
    check(`first view ${at}: the bar's four actions are 44 px and the page does not scroll sideways`, await js(`[...document.querySelectorAll('#fwBar > .btn, #fwBar .fw-segb')].every(b => b.getBoundingClientRect().height >= 43.5) && document.documentElement.scrollWidth <= innerWidth`));
    same(`first view ${at}: the bar reads This field, Map, 3D, More`, await js(`[...document.querySelectorAll('#fwBar > .btn, #fwBar .fw-segb, #fwBar .fw-more')].map(b => b.textContent.trim())`), ['This field', 'Map', '3D', 'More']);
    check(`first view ${at}: no word of the builders' language, and no "simulator", "Look ahead" or "What if"`, !/not read yet|not worked out|not connected|simulat|look ahead|what if/i.test(await text('#fw')), '');   // M8, M11
  }
  // a returning farmer: another field chosen, then the report's field is added again: the same field opens, with the plan to try, and no second copy
  await size(1280);
  await js(`import('/js/simulate.js').then(S => { let st = S.cleanStore(JSON.parse(localStorage.getItem('crophalo.farms.v1'))); const fm = S.getFarm(st); st = S.addField(st, fm.id, { ring: S.squareAround(fm.pin.lat + 0.01, fm.pin.lon + 0.01, 2) }, { now: Date.now() + 1, random: () => 0.3 }).store; localStorage.setItem('crophalo.farms.v1', JSON.stringify(st)); })`);
  await go('/'); await js(`document.querySelector('#navFarm').click()`); await until(`document.querySelector('#fwField')?.options.length === 2`);
  await js(`(() => { const s = document.querySelector('#fwField'); s.value = [...s.options].find(o => o.value !== JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].fields[0].id).value; s.dispatchEvent(new Event('change')); })()`); await sleep(200);
  await open();
  same('returning: the report\'s field is chosen again, on the plan to try', [await js(`document.querySelector('#fwField').value === window.__res.fieldId`), await js('window.__farm._ui.planKind')], [true, 'proposed']);
  same('returning: a second add makes no second field', await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].fields.length`), 2);
});

// ---- 2. the report's numbers come through: My farm asks the engine about the report's own rotation (fault 1 of the review)
retired('numbers', async () => {
  await open(); await withData();
  const e = await js(`(() => { const e = window.__farm._entry(), o = e.options; return { state: e.state, reason: e.reason, current: o?.current?.score ?? null, slots: o?.current?.slots ?? null, proposed: [o?.recommended, ...(o?.others || [])].find(p => p && p.id === ${JSON.stringify(R2.proposed.id)})?.score ?? null }; })()`);
  same('numbers: the engine is asked about the report\'s rotation, corn and soybeans', e.slots, R2.current.slots);
  same('numbers: the current plan scores what the report says', e.current, R2.current.score);
  same('numbers: the plan to try is found and scores what the report says', e.proposed, R2.proposed.score);
  await tap('#fwCompare'); await until(`document.querySelectorAll('.fw-card .fw-scorechip').length === 2`, 30000);
  const chip = kind => text(`.fw-card[data-plan=${kind}] .fw-scorechip`);
  check('numbers: each plan card shows its score chip in the report\'s words, and the number is the report\'s own', (await chip('current')).startsWith(scoreWords(R2.current.score)) && (await chip('proposed')).startsWith(scoreWords(R2.proposed.score)), [await chip('current'), await chip('proposed')]);   // M9
  await js(`document.querySelector('.fw-moreplan').open = true`);
  check('numbers: under Show more, past years are counts of tested years, never a chance', new RegExp(`Past years: no crop stress in ${STRESS_P.ok} of ${STRESS_P.of} years with the plan to try\\.`).test(await text('.fw-moreplan')), await text('.fw-moreplan'));
  check('numbers: and bare soil is in months a year, for both plans', /Bare soil: about \d+(\.\d)? months a year now, \d+(\.\d)? with the plan to try\./.test(await text('.fw-moreplan')), await text('.fw-moreplan'));
  same('numbers: each chip has its "i"', await js(`[...document.querySelectorAll('.fw-card')].map(c => !!c.querySelector('.fw-scorechip + .srci, .fw-figline .srci'))`), [true, true]);
  check('numbers: the "i" of the score carries its method, years and area', /50 km/.test(await js(`document.querySelector('.fw-card .srci')?.dataset.note || ''`)) && /out of 100/.test(await js(`document.querySelector('.fw-card .srci')?.dataset.note || ''`)), await js(`document.querySelector('.fw-card .srci')?.dataset.note`));
});

// ---- 3. Compare plans on one timeline
retired('compare', async () => {
  await open();
  await tap('#fwCompare'); await until(`!document.querySelector('#fwPanel').hidden && document.querySelectorAll('.fw-step').length === 3`);
  const labels = await js(`[...document.querySelectorAll('.fw-step span')].map(s => s.textContent)`);
  same('compare: the three key days, in plain words', labels, [KD[0].label, `${CROPS.cropName(WHEAT.crop)} sown`, `${CROPS.cropName(WHEAT.crop)} in spring`]);
  same('compare: the time bar and the colour key show while it is open', await js(`[!document.querySelector('#fwStrip').hidden, !document.querySelector('#fwKey').hidden]`), [true, true]);   // M5
  const WORD = { crop: 'A growing crop', residue: 'Stubble', bare: 'Bare soil', cover: 'A cover crop' };
  for (let i = 0; i < 3; i++) {
    await tap(`.fw-step[data-i="${i}"]`); await sleep(150);
    same(`compare: day ${i + 1}: the one date follows`, await text('#fwTime'), W(KD[i].date));
    check(`compare: day ${i + 1}: both plans are labelled Planned or Observed`, await js(`[...document.querySelectorAll('.fw-card .fw-state .fw-label')].length === 2 && [...document.querySelectorAll('.fw-card .fw-state .fw-label')].every(l => /^(Planned|Observed)$/.test(l.textContent))`), await text('.fw-cards'));
    check(`compare: day ${i + 1}: each card says what is on the ground, in plain words`, (await text('.fw-cards')).includes(WORD[KD[i].current.state]) && (await text('.fw-cards')).includes(WORD[KD[i].proposed.state]), await text('.fw-cards'));
    const fd = await js(`document.querySelector('#fwFinding').dataset.full`);
    check(`compare: day ${i + 1}: the finding is one sentence and keeps the planting window`, /\.$/.test(fd) && !/[.;:!?]\s+[A-Z]/.test(fd.slice(0, -1)) && fd.includes(W(WHEAT.window.latest)) && fd.includes(`${LEFT} day${LEFT === 1 ? '' : 's'} before its sowing window closes`), fd);
    const tints = await js(`(() => { const rgb = c => { const n = document.createElement('i'); n.style.color = c; document.body.append(n); const v = getComputedStyle(n).color; n.remove(); return v; }, k = window.__farm._ui.planKind;
      return [rgb(document.querySelector('#fwMap path.fw-field.is-chosen')?.getAttribute('fill') || 'transparent'), getComputedStyle(document.querySelector('#fwKey li.is-on i') || document.body).backgroundColor, getComputedStyle(document.querySelector('.fw-card[data-plan=' + k + '] .fw-swatch') || document.body).backgroundColor]; })()`);
    same(`compare: day ${i + 1}: the map, its key and the plan's card draw the ground state in one colour`, [tints[0], tints[1]], [tints[2], tints[2]]);
  }
  const cav = await text('.fw-caveat');
  check('compare: the sowing window is one line with its dates and the late-harvest words', cav.includes(`Sowing window for ${CROPS.cropName(WHEAT.crop, true).toLowerCase()}: ${W(WHEAT.window.earliest)} to ${W(WHEAT.window.latest)}`) && /squeezes it|may be too late/.test(cav), cav);
  await js(`document.querySelector('.fw-moreplan').open = true`);
  check('compare: Show more holds the plan\'s own reason to try it', (await text('.fw-moreplan')).includes(`Why try it: ${R2.proposed.why}`), await text('.fw-moreplan'));
  same('compare: no Earlier or Later, and the report\'s names are used (M3)', await js(`!document.querySelector('#fwPrev, #fwNext') && ![...document.querySelectorAll('#fwPanel button, #fwPanel h3')].some(n => /^(Current plan|Proposed plan|Earlier|Later)/.test(n.textContent.trim()))`), true);
  same('compare: the guide sentence is said once (M7)', (await text('#fwPanel')).split('Crophalo is a guide. You decide what to plant.').length - 1, 1);
  same('compare: What you grow now and Plan to try are chosen here', await js(`[...document.querySelectorAll('#fwPanel [data-kind]')].map(b => b.textContent.trim() + ':' + b.getAttribute('aria-pressed'))`), ['What you grow now:false', 'Plan to try:true']);
  const before = await boardNow(), fill = () => js(`document.querySelector('#fwMap path.fw-field')?.getAttribute('fill')`), f0 = await fill();
  await tap('#fwPanel [data-kind=current]'); await sleep(200);
  const after = await boardNow();
  same('compare: What you grow now is shown, on the same day', [after.planKind, after.date, await text('#fwPlanName')], ['current', before.date, 'What you grow now']);
  check('compare: and the map shows that plan\'s ground', KD[2].current.state === KD[2].proposed.state || (await fill()) !== f0, [f0, await fill()]);
  await tap('#fwPanel [data-kind=proposed]'); await sleep(150);
  same('compare: and back', await text('#fwPlanName'), 'Plan to try');
  await press('Escape'); await sleep(150);
  same('compare: Escape closes it, the time bar and the key go, and the keyboard is back on Compare plans', [await js(`document.querySelector('#fwPanel').hidden`), await js(`document.querySelector('#fwStrip').hidden && document.querySelector('#fwKey').hidden`), await js('document.activeElement?.id')], [true, true, 'fwCompare']);
});

// ---- 3b. the demo region's roomy window: the finding says how late the soybean harvest may be, never a squeeze the plan does not have
await group('roomy window', async () => {
  if (!RX) { check('roomy window: the demo region and its recorded weather are there', false, REGION?.id || 'no region with corn, soybeans, winter wheat to try'); return; }
  const XW = RX.proposed.seasons.at(-1), XB = RX.proposed.seasons.at(-2), days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5), left = days(XW.sow, XW.window.latest);
  check('roomy window: on its recorded weather the demo region leaves 14 days or more from the soybean harvest to the last sowing day', days(XB.harvest, XW.window.latest) >= 14 && left > 1, [XB.harvest, XW.sow, XW.window.latest]);
  await js(`import('/js/farm.js').then(m => { window.__farm = m; m.setStartView?.('map'); window.__res = m.addFromReport(${JSON.stringify(RX)}); document.getElementById("navFarm").click(); })`);
  await until(`document.querySelector('#fwFinding')?.textContent.length > 5 && !document.querySelector('#view-farm').hidden`, 15000); await sleep(300);
  await js(`import('/js/engine.js').then(E => window.__farm.setGround(E.groundOn))`); await sleep(150);
  const first = await js(`document.querySelector('#fwFinding').dataset.full`);
  check('roomy window: the first view says the day the wheat goes in and the days left in its window', first.includes(`on ${W(XW.sow)}, ${left} days before its sowing window closes on ${W(XW.window.latest)}`), first);
  await js(`import('/js/engine.js').then(E => { window.__farm._ui.date = E.keyDates(${JSON.stringify(RX.current)}, ${JSON.stringify(RX.proposed)})[1].date; window.__farm.render(); })`); await sleep(200);
  const fall = await js(`document.querySelector('#fwFinding').dataset.full`);
  check('roomy window: after the harvest it says how late the harvest may be, and no squeeze', fall.endsWith(`so a soybean harvest up to ${left} days late still leaves time to sow it.`) && !/squeez/.test(fall), fall);
});

// ---- 4. Map and 3D: the same field, plan and date; the 3D view's own buttons are never under the time bar
await group('three', async () => {
  await open(); await stand3d();
  await js(`import('/js/engine.js').then(E => { window.__farm._ui.date = E.keyDates(${REPORT_JS}.current, ${REPORT_JS}.proposed)[1].date; window.__farm.setPlanKind('current'); })`); await sleep(200);
  const b = await boardNow();
  await tap('#fwThreeBtn'); await sleep(400);
  same('three: 3D opens in place of the map', await js(`!document.querySelector('#fw3d').hidden && document.querySelector('#fwMap').hidden && document.querySelector('#fwThreeBtn').getAttribute('aria-pressed') === 'true'`), true);
  same('three: 3D gets the same field, plan and date', JSON.parse(await js(`document.querySelector('#fw3d').dataset.got`)), { field: b.field, planKind: 'current', date: b.date });
  await tap('#fwMapBtn'); await sleep(250);
  const a = await boardNow();
  same('three: back on the Map, nothing lost', [a.field, a.planKind, a.date, a.view], [b.field, b.planKind, b.date, 'map']);
});
// the real 3D view at a laptop's size and a phone's: each of its buttons can be seen and pressed (fault 3 of the review: the time bar lay over them)
await group('3D buttons', async () => {
  for (const [w, h] of [[1280, 800], [375, 812]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await go('/'); await open();
    await tap('#fwThreeBtn');
    const drew = await until(`document.querySelector('#fw3d .f3d-tools button') && !document.querySelector('#fw3d').hidden`, 45000).then(() => true, () => false);
    check(`three: the 3D view opens at ${w} × ${h}`, drew, await text('#fwStatus'));
    if (!drew) continue;
    await sleep(600);
    const hidden = await js(`[...document.querySelectorAll('#fw3d .f3d-tools button')].map(b => { b.scrollIntoView({ block: 'nearest', behavior: 'instant' }); const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y); return hit && (hit === b || b.contains(hit)) && y < innerHeight ? '' : (b.getAttribute('aria-label') || b.textContent.trim()) + ' under ' + (hit ? (hit.id || hit.className) : 'nothing'); }).filter(Boolean)`);
    same(`three: at ${w} × ${h} no 3D button is under the time bar or off the screen`, hidden, []);
  }
});

// ---- 5. every tool that left the first view is still there, where it is used, within two taps
await group('moved', async () => {
  await open();
  await moreOpen();
  same('moved: More holds the field\'s, the map\'s and the farm\'s occasional tools', await js(`[...document.querySelectorAll('#fwMoreMenu [role^=menuitem]')].map(b => b.textContent.trim())`), ['Satellite', 'Map', 'All fields', 'Add a field', 'Farm tools']);   // M6: More has no Field details or Land history; the map style is Satellite | Light
  same('moved: More says it is open', await js(`document.querySelector('#fwMoreBtn').getAttribute('aria-expanded')`), 'true');
  await press('Escape'); await sleep(100);
  same('moved: Escape closes More and the keyboard is back on it', [await js(`document.querySelector('#fwMoreMenu').hidden`), await js('document.activeElement?.id')], [true, 'fwMoreBtn']);
  // by keyboard
  await js(`document.querySelector('#fwMoreBtn').focus()`); await press('Enter'); await sleep(150);
  same('moved: Enter opens More on its first item', await js('document.activeElement?.dataset.look'), 'photo');
  await press('ArrowDown'); same('moved: the arrow keys move inside More', await js('document.activeElement?.dataset.look'), 'board');
  await press('Escape'); await sleep(100);
  const opens = async (sel, ready, label) => { await back(); await fromMore(sel); check(`moved: More, then ${label}`, await until(ready, 8000).then(() => true, () => false), await text('#fwPanel')); };
  await back(); await tap('#fwDetailsBtn'); check('moved: This field opens the field\'s details from the bar', await until(`!document.querySelector('#fwPanel').hidden && !!document.querySelector('#fwonepage')`, 8000).then(() => true, () => false), await text('#fwPanel'));
  await opens('#fwFieldsBtn', `!!document.querySelector('#fwPanel .fw-table')`, 'All fields opens the Fields table');
  await back(); await fromTools('farms'); check('moved: More, Farm tools, then My farms opens the farm list', await until(`!!document.querySelector('#fwPanel .fw-farms')`, 8000).then(() => true, () => false), await text('#fwPanel'));
  await opens('[data-edit=add]', `!!document.querySelector('#fwPanel .fw-sizes')`, 'Add a field offers its sizes');
  await back(); await fromTools('newfarm'); check('moved: More, Farm tools, then Add another farm starts a farm', await until(`!!document.querySelector('#fwPlaceForm')`, 8000).then(() => true, () => false), await text('#fwPanel'));
  await back();
  await fromMore('[data-look=photo]');
  same('moved: More, then Photo: the map style is Photo', await js(`[document.querySelector('#view-farm').classList.contains('fw-photo'), document.querySelector('[data-look=photo]').getAttribute('aria-checked')]`), [true, 'true']);
  await fromMore('[data-look=board]');
  await js(`window.__picked = 0; const was = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { if (this.type === 'file') window.__picked++; else was.call(this); }; window.__dl = []; const real = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dl.push(this.download); else real.call(this); }; 0`);
  await fromTools('import'); same('moved: More, then Bring in a map file asks for the file', await js('window.__picked'), 1);
  await fromTools('savemap'); await fromTools('savetable'); await sleep(200);
  check('moved: More saves the fields as a map file and the table as a spreadsheet', await js(`window.__dl.length === 2 && /geojson$/.test(window.__dl[0]) && /csv$/.test(window.__dl[1])`), await js('window.__dl'));
  await openHist();
  check('moved: More, then Land history opens the history page', await until(`!document.querySelector('#fwHistory').hidden`, 8000).then(() => true, () => false));
  await tap('#fwHistoryBack'); await sleep(150);
  same('moved: and Back gives the keyboard to More', await js('document.activeElement?.id'), 'fwMoreBtn');
  // the field's own tools: tap the field, and they are there
  await back(); await tap('.fw-token'); await until(`!document.querySelector('#fwPanel').hidden && !!document.querySelector('#fwonepage')`);
  same('moved: one tap on the field opens its details, with Edit this field', await js(`[...document.querySelectorAll('#fwPanel [data-edit]')].map(b => b.textContent.trim())`), ['Move corners', 'Rename', 'Delete']);
  check('moved: Edit this field is headed and Delete is red', /Edit this field/.test(await text('#fwPanel')) && await js(`getComputedStyle(document.querySelector('#fwPanel [data-edit=delete]')).color !== getComputedStyle(document.querySelector('#fwPanel [data-edit=rename]')).color`));
  await js(`document.querySelector('.fw-editfold').open = true`); await tap('#fwPanel [data-edit=rename]'); await until(`!!document.querySelector('#fwRename')`);
  check('moved: Rename is the second tap', /^Rename /.test(await text('#fwPanelTitle')));
  await tap('#fwCancel'); await until(`!!document.querySelector('#fwonepage')`);
  same('moved: Cancel goes back to the field\'s details, on Rename', await js(`document.activeElement?.dataset?.edit`), 'rename');
  await js(`document.querySelector('.fw-editfold').open = true`); await tap('#fwPanel [data-edit=delete]'); await until(`!!document.querySelector('#fwDoDelete')`); await tap('#fwKeep'); await until(`!!document.querySelector('#fwonepage')`);
  same('moved: Keep it goes back to the field\'s details, on Delete', await js(`document.activeElement?.dataset?.edit`), 'delete');
  await js(`document.querySelector('.fw-editfold').open = true`); await tap('#fwPanel [data-edit=corners]'); await until(`!document.querySelector('#fwEditBar').hidden && document.querySelectorAll('.fw-handle').length >= 3`);
  check('moved: Move corners shows the corners on the map', true);
  await press('Escape'); await sleep(200);
  same('moved: Escape leaves the corners and the keyboard is on the field', [await js(`document.querySelector('#fwEditBar').hidden`), await js(`document.activeElement?.classList.contains('fw-token')`)], [true, true]);
  await fromTools('split'); await until(`!document.querySelector('#fwEditBar').hidden`);
  check('moved: Split asks for the line on the map', /^Splitting /.test(await text('.fw-editline')), await text('.fw-editline'));
  await js(`(() => { const c = document.querySelector('#fwEditBar [data-bar=cancel]'); if (c) c.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`); await sleep(200);
  await details();
  check('moved: the field\'s details link to its Land history', await js(`!!document.querySelector('#fwPanel [data-act=history]')`));
  await tap('#fwPanel [data-act=history]'); check('moved: and it opens', await until(`!document.querySelector('#fwHistory').hidden`, 8000).then(() => true, () => false)); await tap('#fwHistoryBack'); await sleep(150);
  // delete from the details, then Recently deleted under More brings it back
  await details(); await js(`document.querySelector('.fw-editfold').open = true`); await tap('#fwPanel [data-edit=delete]'); await until(`!!document.querySelector('#fwDoDelete')`); await tap('#fwDoDelete'); await sleep(300);
  await fromTools('recent'); await until(`!!document.querySelector('[data-restore]')`);
  await tap('[data-restore]'); await sleep(300);
  same('moved: Recently deleted under More brings the field back', await js(`document.querySelectorAll('#fwMap path.fw-field').length`), 1);
  // the weather and the sales went to the field's details; with the recorded weather they read
  await withData(); await details();
  await sleep(150);
  check('moved: This field gives today\'s weather with its "i", and no builders\' words', /Today/.test(await text('#fwonepage')) && /Open-Meteo/.test(await js(`document.querySelector('#fwonepage .srci')?.getAttribute('aria-label') || ''`)) && !/not read yet/.test(await text('#fwonepage')), await text('#fwonepage'));
  await sleep(150);
});

// ---- 6. the "i" buttons open by tap and by keyboard, and Escape gives the keyboard back
retired('info', async () => {
  await open(); await withData();
  await tap('#fwCompare'); await until(`!!document.querySelector('.fw-card .srci')`, 30000);
  const card = () => js(`!!document.querySelector('#srcPop') && !document.querySelector('#srcPop').hidden`);
  await tap('.fw-card[data-plan=proposed] .srci'); await run.rest(); await sleep(250);   // the pointer then leaves the "i": with a mouse resting on it, the card opens again by hover after Escape (the source card's own hover)
  check('info: a tap opens the source card, with what goes for this figure', await card() && /For this figure/.test(await text('#srcPop')) && /NASA POWER/.test(await text('#srcPop')), await text('#srcPop'));
  await press('Escape'); await sleep(150);
  same('info: Escape closes it and the keyboard is back on the "i"', [await card(), await js(`document.activeElement?.closest('.fw-card')?.dataset.plan`)], [false, 'proposed']);
  await js(`document.querySelector('.fw-card[data-plan=current] .srci').focus()`); await press('Enter'); await sleep(200);
  check('info: Enter opens it too', await card(), '');
  await press('Escape'); await sleep(150);
  same('info: and Escape gives the keyboard back', await js(`document.activeElement?.closest('.fw-card')?.dataset.plan`), 'current');
  same('info: the panel stays open under the card', await js(`document.querySelector('#fwPanel').hidden`), false);
});

// ---- 7. the time bar: one line of months, Page Up and Page Down for a season
retired('time', async () => {
  await open(); await tap('#fwCompare'); await until(`!document.querySelector('#fwStrip').hidden`);   // the time bar is part of Compare plans
  const lat = PLACE.lat, days = ['current', 'proposed'].flatMap(k => R2[k].seasons.flatMap(s => [s.sow, s.harvest])), from = Math.min(...days.map(d => S.seasonOfDate(lat, d))), to = Math.max(...days.map(d => S.seasonOfDate(lat, d)));
  same('time: the bar is ‹, the line of months and ›', await page(T => T.controls(document.querySelector('#fwStrip')).map(el => el.id)), ['fwMonthPrev', 'fwMonthSlider', 'fwMonthNext']);
  same('time: the line covers every season of both plans', await js(`[+document.querySelector('#fwMonthSlider').min, +document.querySelector('#fwMonthSlider').max]`), [0, (to - from + 1) * 12 - 1]);
  const idx = d => (S.seasonOfDate(lat, d) - from) * 12 + S.monthIndexOf(lat, d);
  same('time: it stands on the day shown, and says the month to a screen reader', [await js(`+document.querySelector('#fwMonthSlider').value`), await js(`document.querySelector('#fwMonthSlider').getAttribute('aria-valuetext')`)], [idx(KD[0].date), S.monthWord(KD[0].date)]);
  await js(`document.querySelector('#fwMonthSlider').focus()`); await js(`document.querySelector('#fwSay').textContent = ''`);
  await press('PageUp'); await sleep(250);
  same('time: Page Up goes a season on', await text('#fwTime'), W(S.shiftSeason(KD[0].date, 1)));
  check('time: and says the season', /^\d{4} season\. /.test(await text('#fwSay')), await text('#fwSay'));
  await press('PageDown'); await sleep(150);
  same('time: Page Down comes back', await text('#fwTime'), W(KD[0].date));
  await tap('#fwMonthNext'); await sleep(150);
  check('time: › goes a month on', (await text('#fwTime')).endsWith(`${MON[(+KD[0].date.slice(5, 7)) % 12]} ${+KD[0].date.slice(5, 7) === 12 ? +KD[0].date.slice(0, 4) + 1 : +KD[0].date.slice(0, 4)}`), await text('#fwTime'));
  await js(`(() => { const r = document.querySelector('#fwMonthSlider'); r.value = '0'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(150);
  same('time: the start of the line is the first season\'s first month', await text('#fwTime'), W(S.monthDate(lat, from, 0)));
  await tap('.fw-step[data-i="2"]'); await sleep(150);
  same('time: a Compare day moves the line too', await js(`+document.querySelector('#fwMonthSlider').value`), idx(KD[2].date));
});

// ---- 8. fit: nothing sideways at four widths with the largest text, 44 px targets on a phone, no two controls touching
const WIDGET = 'a[href], button, input, select, textarea, summary, [role=button], [role=tab], [role=checkbox], [role=radio], [role^=menuitem]';
const targets = () => page((T, WIDGET) => {
  const small = [], touching = [], seen = [];
  for (const el of T.controls().filter(el => el.matches(WIDGET) && !el.closest('.leaflet-control-container') && !el.closest('.leaflet-marker-pane') && !el.closest('[inert]') && (el.tagName === 'SUMMARY' || !el.closest('details:not([open])')))) {
    if (!T.shown(el)) continue;
    const face = el.matches('input[type=radio], input[type=checkbox]') && el.closest('label') ? el.closest('label') : T.face(el), b = T.box(face);
    if (T.tiny(b)) continue;
    const after = getComputedStyle(face, '::after'), grow = side => after.content !== 'none' && after.position === 'absolute' ? Math.max(0, -parseFloat(after[side]) || 0) : 0;
    const w = b.w + grow('left') + grow('right'), h = b.h + grow('top') + grow('bottom');
    if (el.closest('#fw') && (w < 43.5 || h < 43.5)) small.push(`${T.name(el)} is ${Math.round(w)} × ${Math.round(h)} px`);
    if (!seen.some(x => x.face === face)) seen.push({ el, face, b });
  }
  for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) {
    const a = seen[i], c = seen[j];
    if (a.face.contains(c.face) || c.face.contains(a.face) || !a.el.closest('#fw') || !c.el.closest('#fw')) continue;
    if (a.el.closest('.fw-seg') && a.el.closest('.fw-seg') === c.el.closest('.fw-seg')) continue;   // the two halves of one switch sit together on purpose
    const dx = Math.max(0, Math.max(a.b.x, c.b.x) - Math.min(a.b.r, c.b.r)), dy = Math.max(0, Math.max(a.b.y, c.b.y) - Math.min(a.b.b, c.b.b));
    if (Math.hypot(dx, dy) < 2) touching.push(`${T.name(a.face)} and ${T.name(c.face)}`);
  }
  return { small, touching };
}, WIDGET);
await group('fit', async () => {
  for (const w of [320, 375, 768, 1280]) {
    await size(w); await go('/'); await open(); await stand3d();
    await js(`document.documentElement.dataset.text = 'xlarge'`); await sleep(200);
    const where = n => `${n} at ${w} px with the largest text`;
    const measure = async n => { await sleep(250); await flat(where(n)); const t = await targets(); if (w <= 600) check(`fit: ${where(n)}: every control is at least 44 × 44 px`, t.small.length === 0, t.small.slice(0, 4).join('; ')); check(`fit: ${where(n)}: no two controls touch`, t.touching.length === 0, t.touching.slice(0, 3).join('; ')); };
    await measure('the first view');
    await moreOpen(); await measure('More, open'); await back();
    for (const tab of ['page']) { await js(`document.querySelector('#fwDetailsBtn').click()`); await sleep(150); await measure(`the field's details, ${tab}`); await back(); }
    await js(`document.querySelector('#fwThreeBtn').click()`); await sleep(300); await measure('3D'); await js(`document.querySelector('#fwMapBtn').click()`); await sleep(200);
  }
});

// ---- 9. axe on the first view, More, Compare plans and the field's details, at a laptop's width and a phone's
const AXE_SOURCE = fs.readFileSync(fileURLToPath(new URL('./vendor-test/axe.min.js', import.meta.url)), 'utf8'), AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
await group('axe', async () => {
  for (const w of [1280, 375]) {
    await size(w); await go('/'); await open(); await withData();
    const scan = async name => {
      await sleep(300);
      if (!await js(`typeof window.axe === 'object'`)) await js(AXE_SOURCE + '\n;void 0');
      const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(AXE_TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' ') + ' · ' + (n.any[0] || n.all[0] || n.none[0] || {}).message)))`);
      for (const line of found) console.log(`axe  ${name} at ${w} px: ${line}`);
      check(`axe: ${name} at ${w} px: 0 problems`, found.length === 0, `${found.length} found, listed above`);
    };
    await scan('the first view');
    await moreOpen(); await scan('More, open'); await back();
    await js(`document.querySelector('#fwDetailsBtn').click()`); await sleep(150); await scan('the field\'s details'); await scan('the field\'s weather'); await back();
  }
});

// ---- 10. motion: Full, Less and Still
retired('motion', async () => {
  for (const kind of ['', 'less', 'reduce']) {
    const name = kind === '' ? 'Full' : kind === 'less' ? 'Less' : 'Still';
    await go('/'); await js(kind ? `document.documentElement.dataset.motion = '${kind}'` : `delete document.documentElement.dataset.motion`); await open();
    await moreOpen(); await sleep(400);
    const moving = await js(`[...document.querySelectorAll('#fw, #fw *')].filter(el => { const c = getComputedStyle(el); return c.transitionDuration.split(',').some(d => parseFloat(d) > 0) || (c.animationName !== 'none' && parseFloat(c.animationDuration) > 0); }).map(el => el.id || el.className).slice(0, 5)`);
    if (kind) same(`motion: ${name}: nothing in My farm slides, fades or turns`, moving, []);
    same(`motion: ${name}: the chevron of an open menu points up`, await js(`new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#fwMoreBtn > .chev')).transform).a < 0`), true);
    same(`motion: ${name}: the map does not glide after a drag${kind ? '' : ' (it may on Full)'}`, await js(`window.__farm._map().options.inertia`), !kind);
    await back();
  }
  await js(`delete document.documentElement.dataset.motion`);
});

// ---- 11. pictures for a person to look at (only when E2E_SHOTS names a folder outside the project); E2E_SHOT_TAG names them before or after
await group('pictures', async () => {
  if (!run.shots) return;
  const tag = process.env.E2E_SHOT_TAG || 'look';
  for (const [w, h] of [[1280, 800], [375, 812]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await go('/'); await open(); await withData(); await sleep(500);
    await shot(`${tag}-first-view-${w}.png`);
    await shot(`${tag}-compare-${w}.png`);
    await back();
    if (await js(`!!document.querySelector('#fwMoreBtn')`)) { await moreOpen(); await sleep(200); await shot(`${tag}-more-${w}.png`); await back(); }
    else if (await js(`!!document.querySelector('#fwEditBtn')`)) { await tap('#fwEditBtn'); await sleep(200); await shot(`${tag}-more-${w}.png`); await press('Escape'); }
    await tap('#fwThreeBtn'); await until(`document.querySelector('#fw3d .f3d-tools button') && !document.querySelector('#fw3d').hidden`, 45000).catch(() => {}); await sleep(1500);
    await shot(`${tag}-3d-${w}.png`);
  }
  await size(320); await go('/'); await open(); await withData(); await js(`document.documentElement.dataset.text = 'xlarge'`); await sleep(500);
  await shot(`${tag}-first-view-320-largest-text.png`);
});

await finish();
