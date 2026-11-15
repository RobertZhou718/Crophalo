// The My farm browser suite: a report's field opens at once on the map, one date, one finding, Compare plans, the Map and 3D switch, editing (E2E_ONLY picks groups).
// The plans are the crop engine's own on the weather recorded for the demo place, so the screens say what the engine says (a few groups hand in stand-ins for the 3D view).
// RULE: never loosen a check here to make it pass without a written farming reason beside it. Run: node scripts/e2e_farm.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openRun } from './e2e_lib.mjs';
import { PLACE_WORD } from './fixtures/demo-plans.mjs';
import * as EN from '../js/engine.js';
import * as CROPS from '../js/crops.js';
import { realReport, realSeries } from './fixtures/engine-plans.mjs';
import * as FARMHIST from '../js/farmhistory.js';
import * as FIT from '../js/fit.js';
import * as SIM from '../js/simulate.js';
import { HLS_SHAPE, dayBack } from './fixtures/hls-shape.mjs';
const FIX = f => fs.readFileSync(fileURLToPath(new URL('./fixtures/' + f, import.meta.url)), 'utf8');   // the recorded answers of the weather services (real, recorded 14 November 2026)

const run = await openRun('e2e_farm');
const { js, page, until, seen, tap, tapAt, press, cutOff, size, device, go, flat, shot, check, same, group: groupRaw, finish, sleep, send } = run;
// This copy's server has no picture-lookup route of its own: on every page the lookup is made to fail at once, as it does when it cannot be reached, so no 404 is logged
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, o) => /^[/]api[/]hlsndvi/.test(String(u)) ? Promise.reject(new Error('down')) : first(u, o); })();" });
const WELCOME = JSON.stringify({ v: '2026-11-14', at: 'test' });   // the first-visit sheet is already accepted: it is not what these groups are about
const group = (label, body) => groupRaw(label, async () => { await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await go('/'); await body(); });
// the report is the one the crop engine really makes on the recorded weather; its three days are the engine's own
const { report: REAL } = await realReport(), KD = EN.keyDates(REAL.current, REAL.proposed);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], W = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}`; };
const REPORT_JS = JSON.stringify(REAL), WORD_JS = JSON.stringify(PLACE_WORD), LASTWAKE = REAL.proposed.seasons.at(-1);
const open = async () => { await js(`import('/js/farm.js').then(m => { window.__farm = m; window.__res = m.addFromReport(${REPORT_JS}); })`); await until(`document.querySelector('#fwFinding')?.textContent.length > 5 && !document.querySelector('#view-farm').hidden`); await sleep(300); };
const text = sel => js(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim().replace(/\\s+/g, ' ') ?? null`);

await group('empty', async () => {
  await js(`import('/js/app.js').then(m => m.show('farm'))`);
  await until(`!document.querySelector('#view-farm').hidden && document.querySelector('#fwEmpty') && !document.querySelector('#fwEmpty').hidden`);
  check('empty: says how a field arrives', /Add to my farm/.test(await text('#fwEmpty')), await text('#fwEmpty'));
  same('empty: Compare plans is off', await js(`document.querySelector('#fwCompare').disabled`), true);
  same('empty: one h1 named My farm', await js(`[...document.querySelectorAll('#view-farm h1')].map(h => h.textContent)`), ['My farm']);
});

await group('report', async () => {
  await open();
  const r = await js('window.__res');
  check('report: the hand-off answers with a farm and a field', r?.farmId && r?.fieldId, r);
  same('report: My farm is on screen at once', await js(`document.title`), 'My farm · Crophalo');
  same('report: the field is chosen', await js(`document.querySelector('#fwField').value === window.__res.fieldId`), true);
  check('report: the field is named and marked estimated', /\(estimated\)/.test(await js(`document.querySelector('#fwField').selectedOptions[0].textContent`)), await js(`document.querySelector('#fwField').selectedOptions[0].textContent`));
  check('report: ONE visible date', (await js(`[...document.querySelectorAll('#fwHud time')].length`)) === 1);
  same('report: the report arrives on the first of the plan\'s days, not on today', await text('#fwTime'), W(KD[0].date));
  check('report: and the finding is not "not read yet" on arrival', !/not read yet/.test(await text('#fwFinding')), await text('#fwFinding'));
  check('report: with the engine wired the label is Planned or Observed', /^(Planned|Observed)$/.test(await text('#fwLabel')), await text('#fwLabel'));
  await js(`window.__farm.setGround(null)`); await sleep(100);
  same('report: with no ground answer the label says so', await text('#fwLabel'), 'not read yet');
  check('report: the finding says "not read yet", never a made-up state', /not read yet/.test(await text('#fwFinding')) && !/bare|residue|wheat/i.test(await text('#fwFinding')), await text('#fwFinding'));
  same('report: the finding is one line of words ending in a full stop', /\.$/.test(await text('#fwFinding')), true);
  check('report: Compare plans is there and ready', await js(`!document.querySelector('#fwCompare').disabled && document.querySelector('#fwCompare').textContent.trim() === 'Compare plans'`));
  check('report: the board is a real map with the field drawn', await js(`!!document.querySelector('#fwMap.leaflet-container') && document.querySelectorAll('#fwMap path.fw-field').length === 1`));
  check('report: the chosen field has a gold halo', await js(`document.querySelectorAll('#fwMap path.fw-halo').length === 1`));
  check('report: "you are here" marker is named', await js(`!!document.querySelector('#fwMap [aria-label^="You are here: the pin of"]')`));
  check('report: the token is a named button', /^Barrie|^North|^Home|field/i.test(await js(`document.querySelector('.fw-token')?.getAttribute('aria-label') || ''`)), await js(`document.querySelector('.fw-token')?.getAttribute('aria-label')`));
  check('report: the field is visible inside the map', await js(`(() => { const m = document.querySelector('#fwMap').getBoundingClientRect(), p = document.querySelector('#fwMap path.fw-field').getBoundingClientRect(); return p.width > 40 && p.left >= m.left - 1 && p.right <= m.right + 1; })()`));
  check('report: no props, sales or exports in the first view', !/\bsales\b|\bexport|\bprops\b|\bcsv\b/i.test(await text('#fw')), '');
  // a repeat add never makes a second field
  await js(`window.__farm.addFromReport(${REPORT_JS})`); await sleep(200);
  same('report: a repeat add keeps one field', await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].fields.length`), 1);
  same('report: and one farm', await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms.length`), 1);
  same('report: the field is stored as estimated', await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].fields[0].estimated`), true);
  await shot('farm-first-open-1280.png');
  // 44 px targets
  const small = await js(`[...document.querySelectorAll('#fw button, #fw select')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5) && !b.closest('.leaflet-control-attribution'); }).map(b => b.id || b.className)`);
  same('report: every button is at least 44 px', small, []);
});

await group('compare', async () => {
  await open(); await sleep(300);
  same('compare: with an answer the chip says Planned', await text('#fwLabel'), 'Planned');
  check('compare: the finding names both plans in one sentence', new RegExp(`^On ${W(KD[0].date)} (the current plan has .+ and the proposed plan has .+|both plans have .+)\\.$`).test(await text('#fwFinding')), await text('#fwFinding'));
  await tap('#fwCompare'); await until(`!document.querySelector('#fwPanel').hidden`);
  same('compare: the button says it is open', await js(`document.querySelector('#fwCompare').getAttribute('aria-expanded')`), 'true');
  same('compare: focus moves into the panel heading', await js(`document.activeElement?.id`), 'fwPanelTitle');
  same('compare: three dates', await js(`[...document.querySelectorAll('.fw-step span')].map(s => s.textContent)`), KD.map(k => k.label));
  same('compare: their dates', await js(`[...document.querySelectorAll('.fw-step small')].map(s => s.textContent)`), KD.map(k => W(k.date)));
  same('compare: two plans on one date, and what NASA\'s pictures saw beside them', await js(`[...document.querySelectorAll('.fw-card h3')].map(h => h.textContent)`), ['Current plan', 'Proposed plan', 'Observed from space']);
  same('compare: ONE visible date line', await js(`document.querySelectorAll('.fw-onedate time').length`), 1);
  check('compare: every state is written Planned', await js(`[...document.querySelectorAll('.fw-card .fw-label')].every(l => /^(Planned|Observed)$/.test(l.textContent)) && document.querySelectorAll('.fw-card .fw-label').length === 2`));
  const t = await text('.fw-cards');
  check('compare: each card says what the engine says about the ground on the first day', t.includes(EN.groundOn(REAL.current, KD[0].date).note) && t.includes(EN.groundOn(REAL.proposed, KD[0].date).note), t);
  await tap('.fw-step[data-i="1"]'); await sleep(100);
  check('compare: the second day: the cards say what the engine says, the current plan keeps its residue', (await text('.fw-cards')).includes(KD[1].proposed.note) && (await text('.fw-cards')).includes(KD[1].current.note) && KD[1].current.state !== 'bare', await text('.fw-cards'));
  same('compare: the date chip follows', await text('#fwTime'), W(KD[1].date));
  await tap('#fwNext'); await sleep(100);
  same('compare: the stepper goes to the engine\'s spring day', await text('#fwTime'), W(KD[2].date));
  check('compare: spring: residue against living wheat, as the engine says', (await text('.fw-cards')).includes(KD[2].proposed.note) && (await text('.fw-cards')).includes(KD[2].current.note), await text('.fw-cards'));
  same('compare: Next is off on the last date', await js(`document.querySelector('#fwNext').disabled`), true);
  const cav = await text('.fw-caveat');
  check('compare: the planting window is written with its dates', cav.includes(`Planting window for ${CROPS.cropName(LASTWAKE.crop, true)}: ${W(LASTWAKE.window.earliest)} to ${W(LASTWAKE.window.latest)}`), cav);
  check('compare: the late-harvest caveat is there', /squeezes it/i.test(cav) && /(inside the window|may be hard to plant)/.test(cav), cav);
  const open2 = await js(`document.querySelector('.fw-fold').open`);
  same('compare: the assumptions are written (in a fold)', open2, false);
  await js(`document.querySelector('.fw-fold').open = true`);
  const asm = await text('.fw-fold');
  check('compare: loam assumed, rain-fed, estimated outline', /loam, assumed/.test(asm) && /rain-fed/.test(asm) && /Outline: estimated, a square of 10\.0 ha/.test(asm), asm);
  await shot('farm-compare-1280.png');
  await press('Escape'); await sleep(100);
  same('compare: Escape closes the panel', await js(`document.querySelector('#fwPanel').hidden`), true);
  same('compare: and focus returns to the button', await js(`document.activeElement?.id`), 'fwCompare');
  same('compare: the date chosen stays', await text('#fwTime'), W(KD[2].date));
  const small = await js(`(() => { document.querySelector('#fwCompare').click(); return [...document.querySelectorAll('#fwPanel button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5); }).map(b => b.id || b.className); })()`);
  same('compare: every panel button is at least 44 px', small, []);
});

await group('switch', async () => {
  await open();
  await js(`document.querySelector('#fwCompare').click()`); await tap('.fw-step[data-i="1"]');
  await js(`document.querySelector('#fwCompare').click()`);
  const before = await js(`({ f: document.querySelector('#fwField').value, d: document.querySelector('#fwTime').textContent })`);
  await js(`window.__farm.setView3d(() => { throw new Error('no 3D here'); })`);
  await js(`Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value() { return { getExtension: () => null }; }, configurable: true }); 0`);
  await tap('#fwThreeBtn'); await sleep(500);
  const msg = await text('#fwStatus');
  check('switch: with no 3D drawing the board stays and says why', /This device cannot draw 3D|could not load/.test(msg || ''), msg);
  same('switch: still on the map', await js(`document.querySelector('#fwMapBtn').getAttribute('aria-pressed')`), 'true');
  same('switch: the field and the date survive', await js(`({ f: document.querySelector('#fwField').value, d: document.querySelector('#fwTime').textContent })`), before);
  check('switch: the map still has its field', await js(`document.querySelectorAll('#fwMap path.fw-field').length === 1`));
  // a 3D view that draws: the stand-in is the page's own function
  await js(`window.__farm.setView3d((data, node) => { node.dataset.got = JSON.stringify({ field: data.field.id, planKind: data.planKind, date: data.date, ground: data.ground?.state ?? null }); node.textContent = '3D'; return { ok: true, update(next) { node.dataset.got = JSON.stringify({ field: next.field.id, planKind: next.planKind, date: next.date, ground: next.ground?.state ?? null }); }, dispose() {} }; })`);
  await tap('#fwThreeBtn'); await sleep(300);
  same('switch: the 3D node opens', await js(`!document.querySelector('#fw3d').hidden && document.querySelector('#fwMap').hidden`), true);
  const got = JSON.parse(await js(`document.querySelector('#fw3d').dataset.got`));
  same('switch: 3D receives the field, the plan and the date chosen', [got.field, got.planKind, got.date], [await js('window.__res.fieldId'), 'proposed', KD[1].date]);
  same('switch: and what covers the ground then, as the engine says', got.ground, KD[1].proposed.state);
  await js(`window.__farm._ui.date = ${JSON.stringify(KD[2].date)}; window.__farm.render()`); await sleep(100);
  same('switch: a change of date while in 3D reaches the 3D view by update()', JSON.parse(await js(`document.querySelector('#fw3d').dataset.got`)).date, KD[2].date);
  await js(`window.__farm._ui.date = ${JSON.stringify(KD[1].date)}; window.__farm.render()`);
  await tap('#fwMapBtn'); await sleep(200);
  same('switch: back on the map, nothing lost', await js(`({ f: document.querySelector('#fwField').value, d: document.querySelector('#fwTime').textContent, m: document.querySelectorAll('#fwMap path.fw-field').length })`), { ...before, m: 1 });
});

await group('edit', async () => {
  await open();
  await tap('#fwEditBtn'); await until(`!document.querySelector('#fwEditMenu').hidden`);
  check('edit: Rename, Recently deleted and Delete (red) are in the menu', await js(`['Rename', 'Recently deleted', 'Delete'].every(w => [...document.querySelectorAll('#fwEditMenu button')].some(b => b.textContent === w))`));
  check('edit: Delete is red', await js(`getComputedStyle(document.querySelector('#fwEditMenu .fw-danger')).color`) !== await js(`getComputedStyle(document.querySelector('#fwEditMenu button')).color`));
  await press('Escape'); same('edit: Escape closes the menu and focus returns', await js(`document.activeElement.id`), 'fwEditBtn');
  await tap('#fwEditBtn'); await tap('[data-edit=rename]'); await until(`!document.querySelector('#fwPanel').hidden`);
  await js(`document.querySelector('#fwName').value = ''`); await js(`document.querySelector('#fwRename').requestSubmit()`);
  same('edit: an empty name is refused in words', await text('#fwNameErr'), 'Give the field a name.');
  await js(`document.querySelector('#fwName').value = 'Creek bottom'`); await js(`document.querySelector('#fwRename').requestSubmit()`); await sleep(200);
  check('edit: renamed, with Undo', /^Creek bottom/.test(await js(`document.querySelector('#fwField').selectedOptions[0].textContent`)) && /Renamed to Creek bottom/.test(await text('#fwToast')), await text('#fwToast'));
  await tap('#fwUndo'); await sleep(200);
  check('edit: Undo puts the name back', !/Creek/.test(await js(`document.querySelector('#fwField').selectedOptions[0].textContent`)));
  await tap('#fwEditBtn'); await tap('[data-edit=delete]'); await until(`document.querySelector('#fwDoDelete')`);
  check('edit: the confirmation says what is removed', /Delete .+\?/.test(await text('#fwPanelTitle')) && /Recently deleted for 30 days/.test(await text('#fwPanel')), await text('#fwPanel'));
  check('edit: the red Delete button', await js(`getComputedStyle(document.querySelector('#fwDoDelete')).backgroundColor`) !== await js(`getComputedStyle(document.querySelector('#fwKeep')).backgroundColor`));
  await tap('#fwDoDelete'); await sleep(300);
  check('edit: with no field the map says how to add one', /No field on this farm yet/.test(await text('#fwFinding')) && await js(`document.querySelectorAll('#fwMap path.fw-field').length`) === 0, await text('#fwStatus'));
  await tap('#fwUndo'); await sleep(300);
  same('edit: Undo brings the field back', await js(`document.querySelectorAll('#fwMap path.fw-field').length`), 1);
  await tap('#fwEditBtn'); await tap('[data-edit=delete]'); await tap('#fwDoDelete'); await sleep(300);
  await js(`document.querySelector('#fwEmpty') && 1`); await js(`document.querySelector('#fwEditBtn').disabled = false`);
  await js(`document.querySelector('#fwEditBtn').click()`); await js(`document.querySelector('[data-edit=recent]').click()`); await until(`document.querySelector('[data-restore]')`);
  check('edit: Recently deleted lists it', /deleted/.test(await text('.fw-list')), await text('.fw-list'));
  await tap('[data-restore]'); await sleep(300);
  same('edit: Restore brings it back with its plan', await js(`document.querySelectorAll('#fwMap path.fw-field').length`), 1);
  same('edit: its report plans came with it', await js(`!document.querySelector('#fwCompare').disabled`), true);
  await go('/'); await js(`document.querySelector('#navFarm').click()`); await until(`document.querySelector('#fwFinding')?.textContent.length > 5`); await sleep(300);
  same('edit: after a reload the field is still there', await js(`document.querySelectorAll('#fwMap path.fw-field').length`), 1);
});

await group('drawer', async () => {
  await open();
  await js(`window.__farm.setReminders({ forField: () => [], add: d => { window.__added = d; return { ok: true }; } })`);
  await tap('#fwDetailsBtn'); await until(`!document.querySelector('#fwPanel').hidden && document.querySelector('[role=tablist]')`);
  same('drawer: the first view stays Map, one date and Compare plans (the drawer is opened on purpose)', await js(`document.querySelectorAll('#fwHud time').length`), 1);
  same('drawer: four tabs', await js(`[...document.querySelectorAll('[role=tab]')].map(t => t.textContent.trim())`), ['Check', 'Facts', 'Weather', 'Remind']);
  same('drawer: the field is named and sized in its heading and summary', [await text('#fwPanelTitle'), await text('.fw-sub')], [await js(`document.querySelector('#fwField').selectedOptions[0].textContent.split(' · ')[0]`), '10.0 ha (estimated) · Corn this season']);
  check('drawer: the status says the sowing needs a reminder, with one button', /^Now on .+Sowing corn from .+: set a reminder/.test(await text('.fw-now')) && await js(`document.querySelectorAll('.fw-now button').length`) === 1, await text('.fw-now'));
  same('drawer: the Check answer is not read yet without the engine', await text('#fwAnswer'), 'The check: not read yet');
  await tap('.fw-now button'); await sleep(150);
  check('drawer: Remind me sets the sowing reminder through the reminders screen', await js(`window.__added && window.__added.title === 'Sow corn' && window.__added.kind === 'sow' && !!window.__added.fieldId`), await js(`JSON.stringify(window.__added)`));
  check('drawer: and says so', /Reminder set: Sow corn/.test(await text('#fwToast')), await text('#fwToast'));
  await js(`document.querySelector('#fwtab-check').focus()`); await press('ArrowRight'); await sleep(100);
  same('drawer: the arrow key moves to Facts and focuses it', [await js(`document.querySelector('#fwtab-facts').getAttribute('aria-selected')`), await js(`document.activeElement.id`)], ['true', 'fwtab-facts']);
  check('drawer: Facts says loam, assumed, and the slope is not read yet', /loam soil \(assumed\)/.test(await text('#fwAnswer')) && /slope: not read yet/.test(await text('#fwAnswer')), await text('#fwAnswer'));
  await press('ArrowRight'); same('drawer: Weather says not read yet, no guess', await text('#fwAnswer'), 'Forecast: not read yet');
  await press('ArrowRight'); check('drawer: Remind lists what the plan suggests', /Sow corn \(from your plan\)/.test(await text('#fwtabpanel')) || /Suggested for this field/.test(await text('#fwtabpanel')), await text('#fwtabpanel'));
  await press('Home'); await js(`document.querySelector('#fwtab-facts').click()`);
  // soil
  await tap('[data-act=soil]'); await until(`document.querySelector('input[name=tex]')`);
  same('drawer: the soil sheet is named', await text('#fwPanelTitle').then(t => /^Soil for /.test(t)), true);
  await tap('[data-act=use]'); same('drawer: both choices are needed', await text('#fwSoilErr'), 'Choose both the texture and the colour.');
  await js(`document.querySelector('input[name=tex][value=silt]').click(); document.querySelector('input[name=om][value=high]').click()`);
  await tap('[data-act=use]'); await sleep(200);
  check('drawer: the soil is set, with Undo', /Soil set: silt soil, high organic matter\./.test(await text('#fwToast')) && /silt soil, high/i.test(await text('#fwtabpanel')) && !/assumed/.test(await text('#fwAnswer')), await text('#fwToast'));
  await tap('#fwUndo'); await sleep(200);
  check('drawer: Undo brings the assumed soil back', /loam soil \(assumed\)/.test(await text('#fwAnswer')), await text('#fwAnswer'));
  // land
  await tap('[data-act=land]'); await until(`document.querySelector('#fwSlopeIn')`);
  await js(`document.querySelector('#fwSlopeIn').value = '99'`); await js(`document.querySelector('#fwSlope').requestSubmit()`);
  same('drawer: a slope over 60 is refused in words', await text('#fwSlopeErr'), 'Type a slope from 0 to 60%.');
  await js(`document.querySelector('#fwSlopeIn').value = '2,5'`); await js(`document.querySelector('#fwSlope').requestSubmit()`); await sleep(200);
  check('drawer: the measured slope shows as yours', /slope 2\.5% \(yours\)/.test(await text('#fwAnswer')), await text('#fwAnswer'));
  // plant
  await js(`document.querySelector('#fwtab-check').click()`); await tap('[data-act=plant]'); await until(`document.querySelector('#fwCrop')`);
  check('drawer: Plant names its step', /^Plant · /.test(await text('#fwPanelTitle')) && /Step 1 of 4: Crop/.test(await text('.fw-sub')), await text('.fw-sub'));
  check('drawer: with no engine it says so and offers the full list', /not read yet\. You can pick from the full list/.test(await text('.fw-sheetbody')), await text('.fw-sheetbody'));
  same('drawer: Save is not blue before a crop is chosen', await text('[data-act=save]'), 'Choose a crop first');
  await tap('[data-act=save]'); same('drawer: and refuses with its reason', await text('#fwPlantErr'), 'Choose a crop first.');
  await js(`const s = document.querySelector('#fwCrop'); s.value = 'soy'; s.dispatchEvent(new Event('change', { bubbles: true }))`); await sleep(100);
  same('drawer: now it can be saved', await text('[data-act=save]'), 'Save the plan');
  await tap('[data-act=next]'); await js(`document.querySelector('#fwDay').value = '20'; document.querySelector('#fwMonth').value = '5'`);
  await tap('[data-act=next]'); await tap('[data-act=next]'); await sleep(100);
  check('drawer: the last step is After harvest', /Step 4 of 4: After harvest/.test(await text('.fw-sub')), await text('.fw-sub'));
  await tap('[data-act=save]'); await sleep(250);
  check('drawer: the plan is saved with Undo and the summary follows', /Soybeans planted on /.test(await text('#fwToast')) && /Soybeans this season/.test(await text('.fw-sub')), await text('#fwToast') + ' | ' + await text('.fw-sub'));
  await sleep(500);
  const saved = await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].scenarios[0].plans`);
  check('drawer: the stored plan has the chosen sowing date', JSON.stringify(Object.values(saved)[0]?.seasons?.[0]).includes('"sowing":"05-20"'), JSON.stringify(saved));
  // small targets and Escape
  const small = await js(`[...document.querySelectorAll('#fwPanel button, #fwPanel select, #fwPanel input:not([type=radio])')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5); }).map(b => b.id || b.dataset.act || b.className)`);
  same('drawer: every control is at least 44 px', small, []);
  await tap('[data-act=plant]'); await until(`document.querySelector('#fwCrop')`); await press('Escape'); await sleep(100);
  same('drawer: Escape leaves the sheet first', await js(`!!document.querySelector('[role=tablist]')`), true);
  await shot('farm-drawer-1280.png');
  await press('Escape'); await sleep(100);
  same('drawer: Escape again closes and focus returns to Field details', [await js(`document.querySelector('#fwPanel').hidden`), await js(`document.activeElement.id`)], [true, 'fwDetailsBtn']);
});

await group('shape', async () => {
  await open();
  const ringNow = () => js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].fields.map(f => f.ring)`);
  const count = () => js(`document.querySelector('#fwField').options.length`);
  const menu = async what => { await tap('#fwEditBtn'); await until(`!document.querySelector('#fwEditMenu').hidden`); await tap(`[data-edit=${what}]`); };
  same('shape: the shape tools sit under Edit field', await js(`[...document.querySelectorAll('#fwEditMenu button')].map(b => b.textContent)`), ['Add a field', 'Add another farm', 'Move corners', 'Split', 'Rename', 'Bring in a map file', 'Save fields as a map file', 'Save the Fields table', 'Recently deleted', 'Delete']);
  await sleep(400); const before = JSON.stringify((await ringNow())[0]);
  // ---- move corners
  await menu('corners'); await until(`!document.querySelector('#fwEditBar').hidden && document.querySelectorAll('.fw-handle').length === 4`);
  same('shape: the bar counts corners and size', await text('.fw-editline'), '4 corners · 10.0 ha');
  same('shape: a corner has its spoken name', await js(`document.querySelector('.fw-handle').getAttribute('aria-label')`), 'Corner 1 of 4. Arrow keys move it. Delete removes it.');
  same('shape: focus is on the first corner', await js(`document.activeElement.className.includes('fw-handle')`), true);
  same('shape: Undo is off until a change', await js(`document.querySelector('[data-bar=undo]').disabled`), true);
  await js(`for (let i = 0; i < 3; i++) document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }))`); await sleep(150);
  check('shape: nudging a corner with the arrow keys changes the size', /^4 corners · \d+\.\d ha$/.test(await text('.fw-editline')) && await text('.fw-editline') !== '4 corners · 10.0 ha', await text('.fw-editline'));
  same('shape: Undo is on', await js(`document.querySelector('[data-bar=undo]').disabled`), false);
  await tap('[data-bar=undo]'); await tap('[data-bar=undo]'); await tap('[data-bar=undo]'); await sleep(100);
  same('shape: Undo steps back to the first size', await text('.fw-editline'), '4 corners · 10.0 ha');
  await tap('[data-bar=add]'); same('shape: Add corner makes five', await text('.fw-editline'), '5 corners · 10.0 ha');
  await tap('[data-bar=remove]'); await tap('[data-bar=remove]'); same('shape: Remove corner to three', await text('.fw-editline'), '3 corners · 5.0 ha');
  same('shape: three corners is the least: Remove is off', await js(`document.querySelector('[data-bar=remove]').disabled`), true);
  await tap('[data-bar=undo]'); await tap('[data-bar=undo]'); await tap('[data-bar=undo]'); await sleep(100);
  // a crossing outline: corner 1 dragged past the opposite corner
  await js(`(() => { const r = document.querySelector('#fwMap path.fw-field').getBoundingClientRect(), nx = Math.ceil(r.width * 1.5 / 20), ny = Math.ceil(r.height * 0.5 / 20); document.querySelector('.fw-handle[data-i="0"]').focus(); for (let i = 0; i < nx; i++) document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })); for (let i = 0; i < ny; i++) document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true })); })()`); await sleep(200);
  check('shape: a crossing outline says so in red and cannot be saved', /Its edges cross/.test(await text('.fw-editline')) && await js(`document.querySelector('.fw-editline').classList.contains('is-bad') && document.querySelector('[data-bar=done]').disabled`), await text('.fw-editline'));
  await shot('farm-corners-1280.png');
  await press('Escape'); await sleep(200);
  same('shape: Escape cancels and the field is as it was', [await js(`document.querySelector('#fwEditBar').hidden`), JSON.stringify((await ringNow())[0])], [true, before]);
  await menu('corners'); await until(`document.querySelectorAll('.fw-handle').length === 4`);
  await js(`document.querySelector('.fw-handle[data-i="2"]').focus(); for (let i = 0; i < 2; i++) document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }))`); await sleep(100);
  await tap('[data-bar=done]'); await sleep(400);
  check('shape: Done saves with a toast and Undo', /: corners moved/.test(await text('#fwToast')) && JSON.stringify((await ringNow())[0]) !== before, await text('#fwToast'));
  await tap('#fwUndo'); await sleep(600);
  same('shape: Undo puts the corners back', JSON.stringify((await ringNow())[0]), before);
  // ---- split
  await menu('split'); await until(`!document.querySelector('#fwEditBar').hidden`);
  check('shape: split asks for the first point', /^Splitting .+\. Tap a point on one side of the field\.$/.test(await text('.fw-editline')), await text('.fw-editline'));
  const mid = await js(`(() => { const p = document.querySelector('#fwMap path.fw-field').getBoundingClientRect(); return { x: p.left + p.width / 2, y: p.top + p.height / 2, w: p.width }; })()`);
  await tapAt(mid.x - mid.w / 2 - 80, mid.y - mid.w / 2 - 60); await sleep(150);
  same('shape: then the second', await text('.fw-editline'), 'Now tap a point on the other side. The line goes right across the field.');
  await tapAt(mid.x + mid.w / 2 + 20, mid.y - mid.w / 2 - 60); await sleep(300);
  check('shape: a line that misses the field is refused in words and the mode stays', /The line does not cross the field/.test(await text('#fwToast')) && await js(`!document.querySelector('#fwEditBar').hidden`), await text('#fwToast'));
  await tapAt(mid.x - mid.w / 2 - 30, mid.y); await sleep(100); await tapAt(mid.x + mid.w / 2 + 30, mid.y); await sleep(500);
  check('shape: a line across makes two fields', (await count()) === 2 && /split in two: .+ and .+ 2/.test(await text('#fwToast')), await text('#fwToast'));
  same('shape: the new half has the same plan', await js(`(() => { const f = JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0]; const p = f.scenarios[0].plans; const ids = f.fields.map(x => x.id); return JSON.stringify(p[ids[0]]) === JSON.stringify(p[ids[1]]) && !!p[ids[1]]; })()`), true);
  await tap('#fwUndo'); await sleep(500);
  same('shape: one Undo puts it back as one field', await count(), 1);
  // ---- bring in a file
  const feat = (n, dx, dy) => { const base = [43.0, -80.0]; return null; };
  await js(`window.__mk = (name, lat, lon, m) => { const d = m / 2 / 111195, e = d / Math.cos(lat * Math.PI / 180); return { type: 'Feature', properties: { name }, geometry: { type: 'Polygon', coordinates: [[[lon - e, lat + d], [lon + e, lat + d], [lon + e, lat - d], [lon - e, lat - d], [lon - e, lat + d]]] } }; }; const f = JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0]; window.__c = f.pin; window.__file = (name, text) => { const dt = new DataTransfer(); dt.items.add(new File([text], name)); const i = document.querySelector('#fwFile'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); };`);
  await js(`window.__file('fields.geojson', JSON.stringify({ type: 'FeatureCollection', features: [__mk('East plot', __c.lat, __c.lon + 0.01, 120), __mk('West plot', __c.lat, __c.lon - 0.01, 120), { type: 'Feature', properties: { name: 'Road' }, geometry: { type: 'LineString', coordinates: [[1, 1], [2, 2]] } }, __mk('North plot', __c.lat + 0.01, __c.lon, 120)] }))`);
  await until(`document.querySelector('#fwTickLine')`);
  same('shape: the preview is named', await text('#fwPanelTitle'), 'Fields in your file');
  same('shape: it counts what can be added', (await text('#fwPanel')).includes('3 fields can be added. 1 skipped. This farm has room for 39 more.'), true);
  same('shape: a skipped row says why', (await text('.fw-list')).includes('Skipped. A LineString is not a field outline.'), true);
  same('shape: the live line', await text('#fwTickLine'), '3 fields ticked');
  await js(`document.querySelector('[data-row="1"]').click()`); same('shape: unticking one', await text('#fwTickLine'), '2 fields ticked');
  await js(`document.querySelector('[data-imp=none]').click()`); await tap('[data-imp=add]'); same('shape: nothing ticked is refused', await text('#fwImpErr'), 'Tick at least one field.');
  await js(`document.querySelector('[data-imp=all]').click(); document.querySelector('[data-row="1"]').click()`);
  const small = await js(`[...document.querySelectorAll('#fwPanel button, #fwPanel .fw-tick')].filter(b => { const r = b.getBoundingClientRect(); return r.width && r.height < 43.5; }).map(b => b.dataset.imp || b.textContent.trim().slice(0, 12))`);
  same('shape: ticks and buttons are big enough', small, []);
  await shot('farm-import-1280.png');
  await tap('[data-imp=add]'); await sleep(400);
  check('shape: the ticked fields are added with one Undo', /^2 fields added from your file/.test(await text('#fwToast')) && (await count()) === 3, await text('#fwToast'));
  await tap('#fwUndo'); await sleep(500); same('shape: one Undo takes them all away', await count(), 1);
  await js(`window.__file('bad.geojson', '{"a":')`); await sleep(300); same('shape: a broken file is refused in words', await text('#fwToast'), 'That file is not valid GeoJSON.');
  await js(`window.__file('farm.kmz', 'PKxx')`); await sleep(300); check('shape: a KMZ is refused with the way out', /cannot open KMZ/.test(await text('#fwToast')), await text('#fwToast'));
  await js(`window.__file('f.kml', '<kml><Placemark><name>Kml plot</name><Polygon><outerBoundaryIs><LinearRing><coordinates>' + [[0,0],[0,1],[1,1],[1,0],[0,0]].map(([a, b]) => (__c.lon + 0.01 + a * 0.001) + ',' + (__c.lat + 0.01 + b * 0.001)).join(' ') + '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>')`);
  await until(`document.querySelector('#fwTickLine')`); same('shape: a KML preview works the same way', (await text('.fw-list')).includes('Kml plot'), true);
  await tap('[data-imp=back]'); await sleep(100);
  same('shape: Back closes the preview and nothing was added', await count(), 1);
  // ---- files out
  await js(`window.__dl = []; const real = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push({ name: this.download, href: this.href }); } else real.call(this); }; 0`);
  await menu('savemap'); await sleep(200);
  const dl = await js(`window.__dl[0]`); check('shape: the map file has the farm\'s name', /-fields\.geojson$/.test(dl?.name || ''), dl?.name);
  const gj = JSON.parse(await js(`fetch(window.__dl[0].href).then(r => r.text())`));
  same('shape: it is a FeatureCollection with the field as a polygon', [gj.type, gj.features.length, gj.features[0].geometry.type], ['FeatureCollection', 1, 'Polygon']);
  same('shape: and says so', await text('#fwToast'), 'Fields saved as a map file (GeoJSON).');
  await menu('savetable'); await sleep(200);
  const csv = await js(`fetch(window.__dl[1].href).then(r => r.text())`), bom = await js(`fetch(window.__dl[1].href).then(r => r.arrayBuffer()).then(b => [...new Uint8Array(b).slice(0, 3)].join())`);
  check('shape: the table is a spreadsheet file with its header', /-fields[.]csv$/.test(await js(`window.__dl[1].name`)) && csv.startsWith('Field,Area (hectares)'), csv.slice(0, 80));
  same('shape: it starts with the byte-order mark a spreadsheet wants', bom, '239,187,191');
});

await group('add', async () => {
  await open();
  const count = () => js(`document.querySelector('#fwField').options.length`);
  const menu = async what => { await tap('#fwEditBtn'); await until(`!document.querySelector('#fwEditMenu').hidden`); await tap(`[data-edit=${what}]`); };
  const stored = () => js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0]`);
  // ---- a square of a chosen size
  await menu('add'); await until(`document.querySelector('.fw-sizes')`);
  same('add: the sizes', await js(`[...document.querySelectorAll('.fw-sizes button')].map(b => b.textContent)`), ['Garden bed, 0.06 ha', '1 ha', '5 ha', '10 ha', '25 ha', '50 ha']);
  same('add: draw, file and squares are all there', await js(`[...document.querySelectorAll('.fw-addlist button')].map(b => b.firstChild.textContent.trim())`), ['Draw its shape', 'Bring in a map file']);
  await tap('[data-ha="1"]'); await until(`document.querySelector('#fwPanelTitle')?.textContent === 'This overlaps another field'`);
  check('add: a square over a neighbour asks first, with the field and the hectares', /^This overlaps .+ by about \d+\.\d ha\. Keep both\?$/.test(await text('#fwPanel p')), await text('#fwPanel p'));
  await tap('[data-cancel]'); await sleep(100); same('add: Cancel adds nothing', await count(), 1);
  await menu('add'); await tap('[data-ha="1"]'); await until(`document.querySelector('[data-keep]')`); await tap('[data-keep]'); await sleep(500);
  same('add: Keep both adds it', await count(), 2);
  check('add: it is named and sized in the toast', /added, 1\.0 ha/.test(await text('#fwToast')), await text('#fwToast'));
  check('add: the Plant sheet opens at once', /^Plant · /.test(await text('#fwPanelTitle')) && /Step 1 of 4/.test(await text('.fw-sub')), await text('#fwPanelTitle'));
  same('add: and the new field is the one chosen', await js(`document.querySelector('#fwField').selectedOptions[0].textContent.includes('1.0 ha')`), true);
  await tap('[data-act=back]'); await tap('#fwClose');
  // ---- draw by tapping corners, away from the first field
  await menu('add'); await tap('[data-add=draw]'); await until(`!document.querySelector('#fwEditBar').hidden`);
  same('add: drawing asks for the first corner', await text('.fw-editline'), 'Tap each corner of your field');
  same('add: Finish is off under three corners', await js(`document.querySelector('[data-bar=finish]').disabled`), true);
  const r = await js(`(() => { const p = document.querySelector('#fwMap').getBoundingClientRect(), q = document.querySelector('#fwMap path.fw-field').getBoundingClientRect(); return { x: p.left, y: p.top, w: p.width, h: p.height, fx: q.left, fy: q.top }; })()`);
  const X = r.x + 90, Y = r.y + r.h / 2 - 60;
  await tapAt(X, Y); await tapAt(X + 120, Y); same('add: corners are counted', await text('.fw-editline'), '2 corners');
  await press('Escape'); same('add: Escape takes the last corner away', await text('.fw-editline'), '1 corner');
  await tapAt(X + 120, Y); await tapAt(X + 120, Y + 90); await tapAt(X, Y + 90); await sleep(150);
  same('add: four corners', await text('.fw-editline'), '4 corners');
  await tap('[data-bar=finish]'); await sleep(500);
  check('add: Finish adds the field and opens its Plant sheet', (await count()) === 3 && /^Plant · /.test(await text('#fwPanelTitle')), await count());
  await tap('[data-act=back]'); await tap('#fwClose');
  // a crossing outline stays on the map to be fixed
  await menu('add'); await tap('[data-add=draw]'); await until(`!document.querySelector('#fwEditBar').hidden`);
  for (const [dx, dy] of [[0, 0], [150, 120], [150, 0], [0, 120]]) await tapAt(r.x + r.w - 260 + dx, r.y + 60 + dy);
  await tap('[data-bar=finish]'); await sleep(200);
  check('add: a crossing outline is refused in words and drawing goes on', /Its edges cross/.test(await text('#fwToast')) && await js(`!document.querySelector('#fwEditBar').hidden`), await text('#fwToast'));
  await tap('[data-bar=cancel]'); await sleep(200);
  same('add: Cancel drawing adds nothing', await count(), 3);
  await shot('farm-draw-1280.png');
  // ---- copy a plan to the other fields
  await js(`document.querySelector('#fwField').value = JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].fields[0].id; document.querySelector('#fwField').dispatchEvent(new Event('change'))`); await sleep(200);
  await tap('#fwDetailsBtn'); await until(`document.querySelector('[data-act=copy]')`);
  await tap('[data-act=copy]'); await until(`document.querySelector('[data-pick=bare]')`);
  check('add: the copy sheet names the rotation and says it replaces', /Copy this rotation \(corn → soybeans → corn\) to the fields you tick\. Their plans are replaced\. You can undo it\./.test(await text('#fwPanel')), await text('#fwPanel p'));
  same('add: nothing is ticked at first', await text('#fwCopyLine'), 'No field ticked');
  await tap('[data-act=docopy]'); same('add: Copy with nothing ticked is refused', await text('#fwCopyErr'), 'Tick at least one field.');
  check('add: the fields without a plan are counted on their chip', /Fields without a plan \(2\)/.test(await text('[data-pick=bare]')), await text('[data-pick=bare]'));
  await tap('[data-pick=bare]'); same('add: the chip ticks them', await text('#fwCopyLine'), '2 fields ticked');
  check('add: their rows say no plan yet', (await text('.fw-list')).includes('no plan yet'));
  await tap('[data-act=docopy]'); await sleep(500);
  same('add: copied to two fields, with Undo', await text('#fwToast'), 'Copied to 2 fieldsUndo');
  same('add: all three have a plan now', await js(`Object.keys(JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].scenarios[0].plans).length`), 3);
  await tap('#fwUndo'); await sleep(600);
  same('add: one Undo takes the copies back', await js(`Object.keys(JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].scenarios[0].plans).length`), 1);
  await press('Escape'); await press('Escape'); await sleep(100);
  // ---- the Fields table
  await tap('#fwFieldsBtn'); await until(`document.querySelector('.fw-table')`);
  same('add: the table has its columns', await js(`[...document.querySelectorAll('.fw-table thead th')].map(t => t.textContent.trim())`), ['Field', 'Size', 'This season', 'Water', 'Fit', 'Actions']);
  same('add: one row per field and a totals row', [await js(`document.querySelectorAll('.fw-table tbody tr').length`), await text('.fw-table tfoot th')], [3, 'Total']);
  check('add: the totals say how many are planted', /1 of 3 planted/.test(await text('.fw-table tfoot')), await text('.fw-table tfoot'));
  same('add: the filter chips', await js(`[...document.querySelectorAll('.fw-chipb')].map(b => b.textContent)`), ['All', 'Ready to plant', 'Needs a look']);
  await tap('[data-filter=ready]'); same('add: "Ready to plant" shows the two bare fields', await js(`document.querySelectorAll('.fw-table tbody tr').length`), 2);
  await tap('[data-filter=look]'); check('add: "Needs a look" with no engine has nothing and says so', /No field matches this filter\./.test(await text('#fwPanel')), await text('#fwPanel'));
  await tap('[data-filter=all]');
  await tap('[data-sort=ha]'); same('add: sorting by size is announced in the header', await js(`document.querySelector('[data-sort=ha]').closest('th').getAttribute('aria-sort')`), 'ascending');
  await tap('[data-sort=ha]'); same('add: a second press reverses it', await js(`document.querySelector('[data-sort=ha]').closest('th').getAttribute('aria-sort')`), 'descending');
  same('add: fit cells are honest without the engine', await js(`[...document.querySelectorAll('.fw-table tbody tr')].map(r => r.cells[4].textContent).sort()`), ['Not planted', 'Not planted', 'Not read yet']);
  const small = await js(`[...document.querySelectorAll('#fwPanel button')].filter(b => { const q = b.getBoundingClientRect(); return q.width && (q.height < 43.5 || q.width < 43.5); }).map(b => b.dataset.sort || b.dataset.open || b.id)`);
  same('add: every table button is at least 44 px', small, []);
  await shot('farm-table-1280.png');
  await tap('.fw-table [data-open]'); await sleep(200);
  check('add: Open opens that field in the drawer', await js(`document.querySelector('#fwPanelTitle').textContent`) === await js(`document.querySelector('#fwField').selectedOptions[0].textContent.split(' · ')[0]`) && !!(await js(`document.querySelector('[role=tablist]')`)));
});

await group('planview', async () => {
  await open();
  same('planview: the toolbar chooses the plan, Proposed first', await js(`[...document.querySelectorAll('[data-kind]')].map(b => b.textContent + ':' + b.getAttribute('aria-pressed'))`), ['Current plan:false', 'Proposed plan:true']);
  await js(`window.__farm.setGround((plan, date) => ({ state: plan.kind === 'current' ? 'residue' : 'cover', crop: null, stage: null, label: 'Planned', note: plan.name }))`);
  await js(`window.__farm.setView3d((data, node) => { node.dataset.got = JSON.stringify({ planKind: data.planKind, planName: data.planName, ground: data.ground?.state }); return { ok: true, update(next) { node.dataset.got = JSON.stringify({ planKind: next.planKind, planName: next.planName, ground: next.ground?.state }); }, dispose() {} }; })`);
  await js(`Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value() { return { getExtension: () => null }; }, configurable: true }); 0`);
  await tap('#fwThreeBtn'); await sleep(300);
  same('planview: 3D starts on the proposed plan', JSON.parse(await js(`document.querySelector('#fw3d').dataset.got`)).planKind, 'proposed');
  await tap('#fwCurBtn'); await sleep(200);
  same('planview: choosing Current plan reaches the 3D view at the same date', JSON.parse(await js(`document.querySelector('#fw3d').dataset.got`)), { planKind: 'current', planName: REAL.current.name, ground: 'residue' });
  same('planview: the date did not move', await text('#fwTime'), W(KD[0].date));
  same('planview: the choice shows pressed', await js(`document.querySelector('#fwCurBtn').getAttribute('aria-pressed')`), 'true');
  // the panel leaves room for the picture
  await tap('#fwCompare'); await sleep(300);
  const box = await js(`(() => { const a = document.querySelector('#fw3d').getBoundingClientRect(), b = document.querySelector('#fwPanel').getBoundingClientRect(); return { right3d: a.right, leftPanel: b.left, w: a.width }; })()`);
  check('planview: at 1280 the panel does not cover the 3D view', box.right3d <= box.leftPanel + 1, box);
  await tap('#fwClose'); await sleep(100);
  await size(375); await sleep(200);
  await tap('#fwCompare'); await sleep(300);
  check('planview: on a phone the sheet can be lowered', await js(`!!document.querySelector('#fwLower') && getComputedStyle(document.querySelector('#fwLower')).display !== 'none'`));
  const high = await js(`document.querySelector('#fwPanel').getBoundingClientRect().height`);
  await tap('#fwLower'); await sleep(150);
  const low = await js(`document.querySelector('#fwPanel').getBoundingClientRect().height`);
  check('planview: lowered, it is a short bar and the picture shows', low < high / 2 && low < 160, [high, low]);
  same('planview: the button says Raise and is expanded=false', [await text('#fwLower'), await js(`document.querySelector('#fwLower').getAttribute('aria-expanded')`)], ['Raise', 'false']);
  await tap('#fwLower'); same('planview: Raise brings it back', await text('#fwLower'), 'Lower');
});

await group('newfarm', async () => {
  await js(`import('/js/app.js').then(m => m.show('farm'))`);
  await until(`document.querySelector('#fwEmpty') && !document.querySelector('#fwEmpty').hidden`);
  same('newfarm: a cold start offers Add my farm', await text('#fwEmptyAdd'), 'Add my farm');
  await tap('#fwEmptyAdd'); await until(`document.querySelector('#fwPlaceForm')`);
  same('newfarm: step 1 is named', [await text('#fwPanelTitle'), await text('.fw-sub')], ['Start your farm board', 'Step 1 of 3: where is the new farm?']);
  check('newfarm: it says the farm stays on this device', /Your farm stays on this device\. It is only used to ask NASA for the weather there\./.test(await text('#fwPanel')));
  same('newfarm: three ways to say where', [await text('[data-st=here]'), await text('[data-st=tap]'), await js(`document.querySelector('#fwPlaceIn').placeholder`)], ['I am at my farmYour device asks first, then uses where you are', 'Tap the mapMove the map, then tap the farm', 'Town, or 42.03, -93.62']);
  // nothing is sent while typing
  const before = cutOff.length;
  await js(`const i = document.querySelector('#fwPlaceIn'); for (const v of ['N', 'No', 'Now', 'Nowh', 'Nowhere']) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }`); await sleep(400);
  same('newfarm: typing sends nothing anywhere', cutOff.length, before);
  await js(`document.querySelector('#fwPlaceIn').value = ''`); await js(`document.querySelector('#fwPlaceForm').requestSubmit()`);
  same('newfarm: an empty search asks for something', await text('#fwPlaceMsg'), 'Type a town, or paste coordinates.');
  await js(`document.querySelector('#fwPlaceIn').value = 'Nowhereville'`); await js(`document.querySelector('#fwPlaceForm').requestSubmit()`); await sleep(1200);
  check('newfarm: the search goes out only on Search, and offline says so in words', cutOff.length > before && /could not be reached/.test(await text('#fwPlaceMsg')), await text('#fwPlaceMsg'));
  await js(`document.querySelector('#fwPlaceIn').value = '91, -80'`); await js(`document.querySelector('#fwPlaceForm').requestSubmit()`); await sleep(300);
  check('newfarm: coordinates out of range are not a place', !(await js(`!!document.querySelector('#fwNameForm')`)), await text('#fwPlaceMsg'));
  // a demo region, found on this device
  await js(`document.querySelector('#fwPlaceIn').value = ${WORD_JS}`); await js(`document.querySelector('#fwPlaceForm').requestSubmit()`); await until(`document.querySelector('[data-pick]')`);
  check('newfarm: a demo region is offered', new RegExp(PLACE_WORD).test(await text('#fwPlaceRows')) && /Demo region/.test(await text('#fwPlaceRows')), await text('#fwPlaceRows'));
  await tap('[data-pick="0"]'); await until(`document.querySelector('#fwNameForm')`);
  check('newfarm: step 2 names the place and suggests the name', await text('#fwPanelTitle') === 'Name it' && (await js(`document.querySelector('#fwFarmName').value`)).includes(PLACE_WORD), await js(`document.querySelector('#fwFarmName').value`));
  same('newfarm: the three water choices', await js(`[...document.querySelectorAll('input[name=water]')].map(i => i.parentElement.textContent.trim())`), ['Rainfed', 'Limited irrigation', 'Irrigated as needed']);
  same('newfarm: the region\'s water default is chosen', await js(`document.querySelector('input[name=water]:checked').value`), 'none');
  await js(`document.querySelector('#fwFarmName').value = '  '`); await js(`document.querySelector('#fwNameForm').requestSubmit()`);
  same('newfarm: an empty name is refused', await text('#fwNameErr'), 'Give the farm a name.');
  await tap('[data-st=back]'); await until(`document.querySelector('#fwPlaceForm')`);
  same('newfarm: Back returns to step 1', await text('.fw-sub'), 'Step 1 of 3: where is the new farm?');
  // pasted coordinates, no search at all
  await js(`document.querySelector('#fwPlaceIn').value = '43.13, -80.75'`); await js(`document.querySelector('#fwPlaceForm').requestSubmit()`); await until(`document.querySelector('#fwNameForm')`);
  same('newfarm: coordinates go straight to the name step, with a plain name', [await text('#fwPanel .fw-panel-head + p'), await js(`document.querySelector('#fwFarmName').value`)], ['43.13000, -80.75000', 'My farm']);
  await js(`document.querySelector('#fwFarmName').value = 'Home farm'; document.querySelector('input[name=water][value=limited]').click()`);
  await tap('#fwNameForm button[type=submit]'); await until(`document.querySelector('[data-st=square]')`);
  same('newfarm: step 3 says the farm is ready', [await text('#fwPanelTitle'), (await text('#fwPanel .fw-panel-head + p'))], ['First field', 'Home farm is ready. Add its first field now, or later.']);
  const farm = await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0]`);
  same('newfarm: the farm is stored with its pin, name and water', [farm.name, farm.pin.lat, farm.pin.lon, farm.practice.irrigation], ['Home farm', 43.13, -80.75, 'limited']);
  await tap('[data-st=square]'); await sleep(600);
  check('newfarm: the square of 5 ha joins the farm and the Plant sheet opens', /^Plant · /.test(await text('#fwPanelTitle')) && (await js(`document.querySelector('#fwField').options.length`)) === 1 && /5\.0 ha/.test(await text('#fwField')), await text('#fwPanelTitle'));
  await tap('[data-act=back]'); await tap('#fwClose');
  // a second farm: tap the map
  await tap('#fwEditBtn'); await tap('[data-edit=newfarm]'); await until(`document.querySelector('[data-st=tap]')`);
  await tap('[data-st=tap]'); await until(`!document.querySelector('#fwEditBar').hidden`);
  same('newfarm: tapping the map says what to do', await text('.fw-editline'), 'Move the map, then tap the farm');
  await press('Escape'); await until(`document.querySelector('#fwPlaceForm')`);
  same('newfarm: Escape leaves the tap mode and returns to the step', await js(`document.querySelector('#fwEditBar').hidden`), true);
  await tap('[data-st=tap]'); await until(`!document.querySelector('#fwEditBar').hidden`);
  const m = await js(`(() => { const r = document.querySelector('#fwMap').getBoundingClientRect(); return { x: r.left + r.width / 3, y: r.top + r.height / 3 }; })()`);
  await tapAt(m.x, m.y); await until(`document.querySelector('#fwNameForm')`);
  check('newfarm: a tap on the map gives a place and the name step', /^-?\d+\.\d{5}, -?\d+\.\d{5}$/.test(await text('#fwPanel .fw-panel-head + p')), await text('#fwPanel p'));
  await js(`document.querySelector('#fwFarmName').value = 'Back forty'`); await tap('#fwNameForm button[type=submit]'); await until(`document.querySelector('[data-st=later]')`);
  await tap('[data-st=later]'); await sleep(200);
  same('newfarm: Later leaves two farms and an empty one open', [await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms.length`), await js(`document.querySelector('#fwPanel').hidden`)], [2, true]);
  check('newfarm: the new farm has no field yet and says how to add one', /No field on this farm yet/.test(await text('#fwFinding')), await text('#fwFinding'));
  // my place
  await tap('#fwEditBtn'); await tap('[data-edit=newfarm]'); await until(`document.querySelector('[data-st=here]')`);
  await js(`Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (ok, bad) => bad({ code: 1 }) }, configurable: true }); 0`);
  await tap('[data-st=here]'); await sleep(200);
  same('newfarm: a refused location says what else to do', await text('#fwPlaceMsg'), 'Your device did not share where you are. Search for a place, or tap the map.');
  await js(`Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: ok => ok({ coords: { latitude: 43.5, longitude: -80.2 } }) }, configurable: true }); 0`);
  await tap('[data-st=here]'); await until(`document.querySelector('#fwNameForm')`);
  same('newfarm: where the device says it is becomes the place', await text('#fwPanel .fw-panel-head + p'), '43.50000, -80.20000');
  same('newfarm: step 2 can go Back and Close', await js(`!!document.querySelector('#fwClose')`), true);
  await tap('#fwClose'); await shot('farm-newfarm-1280.png');
});

await group('farms', async () => {
  await open();
  const farms = () => js(`JSON.parse(localStorage.getItem('crophalo.farms.v1'))`);
  const chip = () => text('#fwFarmBtn');
  // a second farm from a cold flow
  await tap('#fwEditBtn'); await tap('[data-edit=newfarm]'); await until(`document.querySelector('#fwPlaceForm')`);
  await js(`document.querySelector('#fwPlaceIn').value = '43.5, -80.2'`); await js(`document.querySelector('#fwPlaceForm').requestSubmit()`); await until(`document.querySelector('#fwNameForm')`);
  await js(`document.querySelector('#fwFarmName').value = 'Second farm'`); await tap('#fwNameForm button[type=submit]'); await until(`document.querySelector('[data-st=later]')`); await tap('[data-st=later]'); await sleep(200);
  same('farms: the chip names the open farm', await chip(), 'Second farm ⌄');
  same('farms: and speaks as a way to change farm', await js(`document.querySelector('#fwFarmBtn').getAttribute('aria-label')`), 'Second farm. Change farm');
  await tap('#fwFarmBtn'); await until(`document.querySelector('.fw-farms')`);
  same('farms: the list is titled and counts', [await text('#fwPanelTitle'), await text('.fw-sub')], ['My farms', '2 farms on this device']);
  same('farms: one row per farm, the open one marked', await js(`[...document.querySelectorAll('[data-open]')].map(b => b.getAttribute('aria-current') || 'no')`), ['no', 'true']);
  check('farms: each row says its fields', (await text('.fw-farms')).includes('1 field, 10.0 ha') && (await text('.fw-farms')).includes('0 fields'), await text('.fw-farms'));
  await tap('[data-open]'); await sleep(300);
  check('farms: opening a farm closes the list, says so and shows its field', (await chip()).startsWith(await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].name`)) && await js(`document.querySelector('#fwPanel').hidden`) && (await js(`document.querySelector('#fwField').options.length`)) === 1, await chip());
  same('farms: the choice is kept as the active farm', (await farms()).active, (await farms()).farms[0].id);
  // settings
  await tap('#fwFarmBtn'); await tap('[data-act=settings]'); await until(`document.querySelector('#fwFarmForm')`);
  same('farms: settings are titled', await text('#fwPanelTitle'), 'Farm settings');
  await js(`document.querySelector('#fwFarmNameIn').value = ' '`); await js(`document.querySelector('#fwFarmForm').requestSubmit()`);
  same('farms: an empty name is refused', await text('#fwFarmErr'), 'Give the farm a name.');
  await js(`document.querySelector('#fwFarmNameIn').value = 'Home farm'`); await js(`document.querySelector('#fwFarmForm').requestSubmit()`); await sleep(200);
  same('farms: the new name shows on the chip', await chip(), 'Home farm ⌄');
  await js(`document.querySelector('input[name=irr][value=limited]').click(); document.querySelector('input[name=till][value=notill]').click(); document.querySelector('#fwCover').click()`); await sleep(500);
  same('farms: water, tillage and cover crops are kept', await js(`(() => { const f = JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].practice; return [f.irrigation, f.tillage, f.coverOK]; })()`), ['limited', 'notill', false]);
  const pin0 = await js(`JSON.stringify(JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].pin)`);
  await tap('[data-act=pin]'); await until(`!document.querySelector('#fwEditBar').hidden`);
  same('farms: moving the pin is a tap on the map', await text('.fw-editline'), 'Move the map, then tap the farm');
  const mp = await js(`(() => { const r = document.querySelector('#fwMap').getBoundingClientRect(); return { x: r.left + r.width / 4, y: r.top + r.height / 4 }; })()`);
  await tapAt(mp.x, mp.y); await sleep(500);
  same('farms: the pin moved, with Undo', [await text('#fwToast'), JSON.stringify((await farms()).farms[0].pin) !== pin0], ['Pin moved. Getting the new weather…Undo', true]);
  await tap('#fwUndo'); await sleep(600);
  same('farms: Undo puts the pin back', JSON.stringify((await farms()).farms[0].pin), pin0);
  await tap('#fwFarmBtn'); await tap('[data-act=settings]'); await until(`document.querySelector('[data-act=delete]')`);
  await tap('[data-act=delete]'); await until(`document.querySelector('[data-act=really]')`);
  check('farms: delete asks first and says where it goes', /^Delete Home farm\?/.test(await text('#fwPanelTitle')) && /Recently deleted for 30 days/.test(await text('#fwPanel')), await text('#fwPanel'));
  same('farms: Delete is red', await js(`getComputedStyle(document.querySelector('[data-act=really]')).backgroundColor !== getComputedStyle(document.querySelector('[data-act=keep]')).backgroundColor`), true);
  await tap('[data-act=keep]'); await until(`document.querySelector('[data-act=delete]')`);
  await tap('[data-act=delete]'); await tap('[data-act=really]'); await sleep(500);
  check('farms: the farm is gone, the other one opens, with Undo', (await chip()) === 'Second farm ⌄' && (await farms()).farms.length === 1 && /Home farm deleted/.test(await text('#fwToast')), await text('#fwToast'));
  await tap('#fwUndo'); await sleep(500);
  same('farms: Undo brings it back whole', [(await farms()).farms.length, (await farms()).farms.find(f => f.name === 'Home farm').fields.length], [2, 1]);
  await tap('#fwFarmBtn'); await tap('[data-act=settings]'); await tap('[data-act=delete]'); await tap('[data-act=really]'); await sleep(500);
  await tap('#fwFarmBtn'); await until(`document.querySelector('[data-restore]')`);
  check('farms: Recently deleted farms lists it with Restore', /Recently deleted farms/.test(await text('#fwPanel')) && /1 field, 10\.0 ha · deleted/.test(await text('#fwPanel')), await text('#fwPanel'));
  await tap('[data-restore]'); await sleep(500);
  check('farms: Restore brings the farm and its field back', (await farms()).farms.length === 2 && (await farms()).deleted.length === 0 && /Home farm is back, with its fields\./.test(await text('#fwToast')), await text('#fwToast'));
  const small = await js(`[...document.querySelectorAll('#fwPanel button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5); }).map(b => b.id || b.dataset.open || b.dataset.act)`);
  same('farms: every list button is at least 44 px', small, []);
  await shot('farm-list-1280.png');
  // eight farms is the most
  await js(`import('/js/simulate.js').then(S => { let st = S.emptyStore(); for (let i = 0; i < 8; i++) st = S.addFarm(st, { name: 'Farm ' + i, lat: 20 + i, lon: 20 }, { now: Date.now() + i, random: () => (i + 3) / 41 }).store; localStorage.setItem(S.FARMS_KEY, JSON.stringify(st)); })`); await sleep(200);
  await go('/'); await js(`document.querySelector('#navFarm').click()`); await until(`document.querySelector('#fwFarmBtn') && !document.querySelector('#fwFarmBtn').hidden`);
  await tap('#fwFarmBtn'); await until(`document.querySelector('.fw-farms')`);
  check('farms: at eight, Add a farm is off and says why', await js(`document.querySelector('[data-act=add]').disabled`) && /You have the most farms Crophalo keeps \(8\)\./.test(await text('#fwPanel')), await text('#fwPanel'));
  // saved fields offered when starting a farm
  await js(`localStorage.setItem('crophalo.farms.v1', JSON.stringify({ v: 1, active: '', farms: [] })); localStorage.setItem('crophalo.saved.v1', JSON.stringify([{ name: 'North quarter', place: 'Woodstock, Ontario', lat: 43.13, lon: -80.75, at: Date.now() }]))`);
  await go('/'); await js(`document.querySelector('#navFarm').click()`); await until(`document.querySelector('#fwEmptyAdd') && !document.querySelector('#fwEmpty').hidden`);
  await tap('#fwEmptyAdd'); await until(`document.querySelector('[data-st=saved]')`);
  check('farms: saved fields are offered with their count', /Start from my saved fields \(1\)/.test(await text('[data-st=saved]')), await text('[data-st=saved]'));
  await tap('[data-st=saved]'); await until(`document.querySelector('[data-saved]')`);
  check('farms: the saved list shows name and place', (await text('.fw-list')).includes('North quarter') && (await text('.fw-list')).includes('Woodstock, Ontario'), await text('.fw-list'));
  await tap('[data-saved="0"]'); await until(`document.querySelector('#fwNameForm')`);
  same('farms: a saved field becomes the new farm\'s place and name', [await text('#fwPanel .fw-panel-head + p'), await js(`document.querySelector('#fwFarmName').value`)], ['Woodstock, Ontario', 'North quarter']);
});

await group('chips', async () => {
  await js(`import('/js/farm.js').then(m => { window.__farm = m; window.__res = m.addFromReport(${JSON.stringify(REAL)}); })`);
  await until(`document.querySelector('#fwChips') && !document.querySelector('#fwChips').hidden`); await sleep(500);
  same('chips: five chips in one row', await js(`[...document.querySelectorAll('#fwChips [data-chip]')].map(b => b.dataset.chip)`), ['weather', 'score', 'bare', 'past', 'sales']);
  // with the services cut off nothing is invented
  await until(`[...document.querySelectorAll('#fwChips [data-chip]')].every(b => b.dataset.state !== 'wait')`, 20000);
  same('chips: with no weather every chip says so, and sales says how', await js(`[...document.querySelectorAll('#fwChips [data-chip]')].map(b => b.querySelector('b').textContent.trim())`), ['not read yet', 'not read yet', 'not read yet', 'not read yet', 'Not worked out']);
  check('chips: and the weather chip gives its reason in words', /./.test(await js(`document.querySelector('[data-chip=weather] .fw-chipsub')?.textContent || ''`)), await text('[data-chip=weather]'));
  // with the recorded answers of the services
  await js(`window.__fix = ${JSON.stringify({ power: FIX('power_barrie.json'), forecast: FIX('forecast_barrie.json'), land: FIX('era5land_barrie.json') })}; window.__farm.setDataEnv({ now: () => Date.parse('2026-11-14T15:00:00Z'), fetch: async url => { const f = /power[.]larc/.test(url) ? window.__fix.power : /api[.]open-meteo[.]com[/]v1[/]forecast/.test(url) ? window.__fix.forecast : /era5_land/.test(url) ? window.__fix.land : null; return f ? { ok: true, status: 200, headers: { get: () => null }, text: async () => f } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' }; } }); window.__farm.forgetReadings(); window.__farm.render()`);
  await until(`[...document.querySelectorAll('#fwChips [data-chip]')].every(b => b.dataset.state !== 'wait')`, 60000); await sleep(1500);
  if (await js(`document.querySelector('[data-chip=score]').dataset.state`) !== 'ok') check('chips: the recorded answers were read', false, await js(`[...document.querySelectorAll('#fwChips [data-chip]')].map(b => b.dataset.chip + ':' + b.dataset.state + ':' + b.textContent.trim()).join(' | ')`));
  const val = id => js(`document.querySelector('[data-chip=${id}] b').textContent.trim()`);
  check('chips: the weather chip gives today\'s word and temperature', /^.+ -?\d+°$/.test(await val('weather')) && /^High -?\d+°, low -?\d+°$/.test(await js(`document.querySelector('[data-chip=weather] .fw-chipsub').textContent`)), await val('weather'));
  check('chips: the plan score is the engine\'s number with its fit word (proposed plan)', /^\d+ · (Holds up|Only just suits|Doesn't suit here)$/.test(await val('score')), await val('score'));
  same('chips: and says which plan it speaks of', await js(`document.querySelector('[data-chip=score] .fw-chipsub').textContent`), 'Proposed plan');
  check('chips: bare soil months this plan against the current plan', /^\d(\.\d)? mo$/.test(await val('bare')) && /^Current plan \d(\.\d)? mo$/.test(await js(`document.querySelector('[data-chip=bare] .fw-chipsub').textContent`)), await val('bare'));
  check('chips: past years are counts of tested years', /^\d+ of \d+$/.test(await val('past')) && await js(`document.querySelector('[data-chip=past] .fw-chipsub').textContent`) === 'with no stress', await val('past'));
  const proposedScore = await val('score');
  await tap('#fwCurBtn'); await sleep(300);
  check('chips: choosing the Current plan moves the chips to it', await js(`document.querySelector('[data-chip=score] .fw-chipsub').textContent`) === 'Current plan' && await val('score') !== '', await val('score'));
  await tap('#fwPropBtn'); await sleep(200); same('chips: and back', await val('score'), proposedScore);
  // a sheet
  await tap('[data-chip=score]'); await until(`document.querySelector('#fwPanelTitle')?.textContent === 'Plan score'`);
  check('chips: the score sheet says how it is worked out and shows the parts', /out of 100/.test(await text('#fwPanel')) && /Parts: water \d+/.test(await text('#fwPanel')), await text('#fwPanel'));
  check('chips: with a source button', await js(`!!document.querySelector('#fwPanel .srci')`));
  await press('Escape'); await sleep(100);
  same('chips: Escape closes the sheet and returns to the chip', await js(`document.activeElement.dataset.chip`), 'score');
  await tap('[data-chip=past]'); await until(`document.querySelector('#fwPanelTitle')?.textContent === 'Past years'`);
  check('chips: past years show the engine\'s own sentence and its rules, never a chance', /^No stress thresholds crossed in \d+(?: of \d+)? tested years/.test(await text('#fwPanel .fw-panel-head + p')) && /Rule: /.test(await text('#fwPanel')) && !/chance|forecast of/i.test((await text('#fwPanel')).replace('never a chance and never a forecast', '')), await text('#fwPanel'));
  await press('Escape');
  await tap('[data-chip=weather]'); await until(`document.querySelector('#fwPanelTitle')?.textContent === 'Weather at the field'`);
  check('chips: the weather sheet names Open-Meteo through its "i"', /Open-Meteo/.test(await js(`document.querySelector('#fwPanel .srci')?.getAttribute('aria-label') || ''`)) && /Forecast only/.test(await text('#fwPanel')), await text('#fwPanel'));
  await press('Escape');
  await tap('[data-chip=sales]'); await until(`document.querySelector('#fwPanelTitle')?.textContent === 'Estimated sales'`);
  check('chips: sales are behind a tap with their assumptions and no figure', /loam unless you chose one/.test(await text('#fwPanel')) && /rain-fed/.test(await text('#fwPanel')) && !/\$|€|\d{3},\d{3}/.test(await text('#fwPanel')), await text('#fwPanel'));
  await press('Escape');
  // the engine on its worker: the page keeps painting, and the answer is the same
  await js(`window.__long = []; new PerformanceObserver(list => { for (const e of list.getEntries()) window.__long.push({ s: e.startTime, d: Math.round(e.duration) }); }).observe({ entryTypes: ['longtask'] }); import('/js/engine-client.js').then(m => { window.__farm.setEngineClient(m.createEngineClient()); window.__farm.forgetReadings(); window.__farm.render(); })`);
  await until(`document.querySelector('[data-chip=score]').dataset.state === 'ok'`, 60000); await sleep(500);
  same('chips: on the engine\'s worker the score is the same as on the page', await val('score'), proposedScore);
  const win = await js(`(() => { const e = window.__farm._entry(); return [e.engineFrom, e.engineTo]; })()`);
  same('chips: and no task of 200 ms or more held the page while the engine worked it out', await js(`window.__long.filter(t => t.d >= 200 && Math.min(t.s + t.d, ${win[1]}) - Math.max(t.s, ${win[0]}) > 50)`), []);
  const small = await js(`[...document.querySelectorAll('#fwChips button')].filter(b => b.getBoundingClientRect().height < 43.5).map(b => b.dataset.chip)`);
  same('chips: every chip is at least 44 px tall', small, []);
  await shot('farm-chips-1280.png');
  await size(375); await sleep(300);
  const sc = await js(`(() => { const r = document.querySelector('#fwChips'); return { inner: r.scrollWidth > r.clientWidth, page: document.documentElement.scrollWidth <= innerWidth }; })()`);
  check('chips: on a phone they slide sideways inside their row, the page does not', sc.inner && sc.page, sc);
  await shot('farm-chips-375.png');
});

// ---- the fit pass: every screen of My farm at the narrow widths with the Largest text; nothing sideways, every control 44 px, no two controls touching
const WIDGET = 'a[href], button, input, select, textarea, summary, [role=button], [role=tab], [role=checkbox], [role=radio]';
const targets = () => page((T, WIDGET) => {
  const small = [], touching = [], seen = [];
  for (const el of T.controls().filter(el => el.matches(WIDGET) && !el.closest('.leaflet-control-container') && !el.closest('.leaflet-marker-pane') && !el.closest('[inert]') && (el.tagName === 'SUMMARY' || !el.closest('details:not([open])')))) {
    if (!T.shown(el)) continue;
    const face = el.matches('input[type=radio], input[type=checkbox]') && el.closest('label') ? el.closest('label') : T.face(el), b = T.box(face);
    if (T.tiny(b)) continue;
    const after = getComputedStyle(face, '::after'), grow = side => after.content !== 'none' && after.position === 'absolute' ? Math.max(0, -parseFloat(after[side]) || 0) : 0;   // the invisible tap area a small button carries
    const w = b.w + grow('left') + grow('right'), h = b.h + grow('top') + grow('bottom');
    if (w < 43.5 || h < 43.5) small.push(`${T.name(el)} is ${Math.round(w)} × ${Math.round(h)} px`);
    if (!seen.some(x => x.face === face)) seen.push({ el, face, b });
  }
  for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) {
    const a = seen[i], c = seen[j];
    if (a.face.contains(c.face) || c.face.contains(a.face)) continue;
    if (a.el.closest('.fw-seg') && a.el.closest('.fw-seg') === c.el.closest('.fw-seg')) continue;
    const dx = Math.max(0, Math.max(a.b.x, c.b.x) - Math.min(a.b.r, c.b.r)), dy = Math.max(0, Math.max(a.b.y, c.b.y) - Math.min(a.b.b, c.b.b));
    if (Math.hypot(dx, dy) < 2) touching.push(`${T.name(a.face)} and ${T.name(c.face)}`);
  }
  return { small, touching };
}, WIDGET);

await group('fitall', async () => {
  const WIDTHS2 = [320, 375, 1280];
  for (const width of WIDTHS2) {
    await size(width); await go('/'); await js(`localStorage.removeItem('crophalo.farms.v1')`); await go('/'); await open();
    await js(`document.documentElement.dataset.text = 'xlarge'`);
    // a farm with three fields so the copy sheet, the table and the list have something to hold
    await js(`import('/js/simulate.js').then(S => { const st = JSON.parse(localStorage.getItem('crophalo.farms.v1')); let store = S.cleanStore(st); const farm = S.getFarm(store); const c = [farm.pin.lat, farm.pin.lon]; for (const [i, dx] of [[1, 0.01], [2, -0.01]]) store = S.addField(store, farm.id, { ring: S.squareAround(c[0] + 0.01 * i, c[1] + dx, 2) }, { now: Date.now() + i, random: () => i / 7 }).store; localStorage.setItem('crophalo.farms.v1', JSON.stringify(store)); })`);
    await go('/'); await js(`document.documentElement.dataset.text = 'xlarge'; document.querySelector('#navFarm').click()`);
    await until(`document.querySelector('#fwField') && document.querySelector('#fwField').options.length === 3`);
    await js(`document.querySelector('#fwField').value = document.querySelector('#fwField').options[0].value; document.querySelector('#fwField').dispatchEvent(new Event('change'))`); await sleep(300);
    const where = n => `${n} at ${width} px with the Largest text`;
    const measure = async n => {
      await sleep(250); await flat(where(n));
      const t = await targets();
      if (width <= 600) check(`fit: ${where(n)}: every control is at least 44 × 44 px`, t.small.length === 0, t.small.slice(0, 4).join('; '));
      check(`fit: ${where(n)}: no two controls touch`, t.touching.length === 0, t.touching.slice(0, 3).join('; '));
    };
    const back = async () => { await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(150); };
    const closeAll = async () => { for (let i = 0; i < 4; i++) { if (await js(`document.querySelector('#fwPanel').hidden && document.querySelector('#fwEditBar').hidden`)) break; await back(); } };
    const view = async (n, fn) => { await closeAll(); await fn(); await measure(n); };
    await measure('the first view');
    await view('Compare plans', async () => { await js(`document.querySelector('#fwCompare').click()`); });
    for (const tab of ['check', 'facts', 'weather', 'remind']) await view(`the drawer, ${tab}`, async () => { await js(`document.querySelector('#fwDetailsBtn').click()`); await sleep(150); await js(`document.querySelector('#fwtab-${tab}').click()`); });
    await view('the soil sheet', async () => { await js(`document.querySelector('#fwDetailsBtn').click()`); await sleep(100); await js(`document.querySelector('#fwtab-facts').click()`); await js(`document.querySelector('[data-act=soil]').click()`); });
    await view('the slope sheet', async () => { await js(`document.querySelector('#fwDetailsBtn').click()`); await sleep(100); await js(`document.querySelector('#fwtab-facts').click()`); await js(`document.querySelector('[data-act=land]').click()`); });
    await view('the copy sheet', async () => { await js(`document.querySelector('#fwDetailsBtn').click()`); await sleep(100); await js(`document.querySelector('#fwtab-check').click()`); await js(`document.querySelector('[data-act=copy]').click()`); });
    for (const step of [0, 1, 2, 3]) await view(`the Plant sheet, step ${step + 1}`, async () => { await js(`document.querySelector('#fwDetailsBtn').click()`); await sleep(100); await js(`document.querySelector('#fwtab-check').click()`); await js(`document.querySelector('[data-act=plant]').click()`); await sleep(100); await js(`document.querySelector('[data-step="${step}"]').click()`); });
    await view('the Fields table', async () => { await js(`document.querySelector('#fwFieldsBtn').click()`); });
    await view('the farm list', async () => { await js(`document.querySelector('#fwFarmBtn').click()`); });
    await view('Farm settings', async () => { await js(`document.querySelector('#fwFarmBtn').click()`); await sleep(100); await js(`document.querySelector('[data-act=settings]').click()`); });
    for (const chip of ['weather', 'score', 'past', 'sales']) await view(`the ${chip} chip sheet`, async () => { await js(`document.querySelector('[data-chip=${chip}]').click()`); });
    await view('Add a field', async () => { await js(`document.querySelector('#fwEditBtn').click()`); await sleep(100); await js(`document.querySelector('[data-edit=add]').click()`); });
    await view('the Edit field menu', async () => { await js(`document.querySelector('#fwEditBtn').click()`); });
    await js(`document.querySelector('#fwEditBtn').click()`);
    await view('moving corners', async () => { await js(`document.querySelector('#fwEditBtn').click()`); await sleep(100); await js(`document.querySelector('[data-edit=corners]').click()`); });
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(200);
    await view('drawing a field', async () => { await js(`document.querySelector('#fwEditBtn').click()`); await sleep(100); await js(`document.querySelector('[data-edit=add]').click()`); await sleep(100); await js(`document.querySelector('[data-add=draw]').click()`); });
    await js(`document.querySelector('[data-bar=cancel]')?.click()`); await sleep(200);
    await view('starting a farm, step 1', async () => { await js(`document.querySelector('#fwEditBtn').click()`); await sleep(100); await js(`document.querySelector('[data-edit=newfarm]').click()`); });
    await js(`document.querySelector('#fwPlaceIn').value = '43.5, -80.2'; document.querySelector('#fwPlaceForm').requestSubmit()`); await measure('starting a farm, step 2');
    await js(`document.querySelector('#fwNameForm').requestSubmit()`); await sleep(200); await measure('starting a farm, step 3');
  }
});

await group('time', async () => {
  await open(); await sleep(300);
  const lat = await js(`JSON.parse(localStorage.getItem('crophalo.farms.v1')).farms[0].pin.lat`), Y0 = +KD[0].date.slice(0, 4), M0 = +KD[0].date.slice(5, 7);
  check('time: the bar is at the foot of the board with the season and the month', await js(`!document.querySelector('#fwStrip').hidden`) && /^\d{4} season$/.test(await text('#fwSeasonLabel')) && (await text('#fwMonthName')).includes(MON[M0 - 1].length === 3 ? ['January','February','March','April','May','June','July','August','September','October','November','December'][M0 - 1] : ''), await text('#fwStrip'));
  same('time: the season is the one the date is in', await text('#fwSeasonLabel'), `${Y0} season`);
  same('time: the slider is on the date\'s month', await js(`+document.querySelector('#fwMonthSlider').value`), M0 - 1);
  // the slider moves the ONE date
  await js(`(() => { const r = document.querySelector('#fwMonthSlider'); r.value = '5'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(200);
  same('time: moving the slider to June puts the one date on 15 June', [await text('#fwTime'), await js(`document.querySelectorAll('#fwHud time').length`)], [`15 Jun ${Y0}`, 1]);
  same('time: the month is named with its year and the slider says it to a screen reader', [await text('#fwMonthName'), await js(`document.querySelector('#fwMonthSlider').getAttribute('aria-valuetext')`)], [`June ${Y0}`, `June ${Y0}`]);
  const g = EN.groundOn(REAL.proposed, `${Y0}-06-15`);
  check('time: the finding follows the day, in the engine\'s words', g.state === null ? /outside the years of this plan/.test(await text('#fwFinding')) : /^On 15 Jun \d{4} /.test(await text('#fwFinding')), await text('#fwFinding'));
  check('time: the plate under the field says the month\'s state where the engine knows it', EN.groundOn(REAL.proposed, `${Y0}-06-15`).state === null || /(Sown|Growing|Harvest|Stubble|Bare soil|Cover crop).* in June/.test(await text('.fw-plate')), await text('.fw-plate'));
  // month arrows, across the end of the season
  await js(`(() => { const r = document.querySelector('#fwMonthSlider'); r.value = '11'; r.dispatchEvent(new Event('input', { bubbles: true })); })()`); await sleep(100);
  await tap('#fwMonthNext'); await sleep(150);
  same('time: Next month after December goes to January of the next season', [await text('#fwTime'), await text('#fwSeasonLabel')], [`15 Jan ${Y0 + 1}`, `${Y0 + 1} season`]);
  await tap('#fwMonthPrev'); await sleep(150);
  same('time: and Previous month comes back to December', await text('#fwTime'), `15 Dec ${Y0}`);
  // season arrows
  await tap('#fwSeasonNext'); await sleep(150);
  same('time: Next season is the same day a year on', [await text('#fwTime'), await text('#fwSeasonLabel')], [`15 Dec ${Y0 + 1}`, `${Y0 + 1} season`]);
  await tap('#fwSeasonPrev'); await tap('#fwSeasonPrev'); await tap('#fwSeasonPrev'); await tap('#fwSeasonPrev'); await sleep(150);
  same('time: Previous season steps back', await text('#fwSeasonLabel'), `${Y0 - 3} season`);
  check('time: a season before the plan says so in the engine\'s words, never a made-up state', /outside the years of this plan/.test(await text('#fwFinding')) && /outside the plan/.test(await text('#fwLabel')), await text('#fwFinding') + ' | ' + await text('#fwLabel'));
  // the compare stepper from a month of the slider
  await js(`(() => { const r = document.querySelector('#fwMonthSlider'); r.value = '${M0 - 1}'; r.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await js(`document.querySelector('#fwSeasonNext').click(); document.querySelector('#fwSeasonNext').click(); document.querySelector('#fwSeasonNext').click()`); await sleep(100);
  await js(`window.__farm._ui.date = ${JSON.stringify(KD[0].date.slice(0, 8) + '28')}; window.__farm.render()`); await tap('#fwCompare'); await sleep(200);
  same('time: Compare plans from an odd day has no day pressed', await js(`[...document.querySelectorAll('.fw-step')].map(b => b.getAttribute('aria-pressed'))`), ['false', 'false', 'false']);
  await tap('#fwNext'); await sleep(150);
  same('time: Next goes to the first of the plan\'s days after it', await text('#fwTime'), W(KD.find(k => k.date > KD[0].date.slice(0, 8) + '28').date));
  await tap('#fwClose');
  // 3D follows the slider
  await js(`window.__farm.setView3d((data, node) => { node.dataset.got = data.date; return { ok: true, update(next) { node.dataset.got = next.date; }, dispose() {} }; })`);
  await js(`Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value() { return { getExtension: () => null }; }, configurable: true }); 0`);
  await tap('#fwThreeBtn'); await sleep(300);
  await tap('#fwMonthNext'); await sleep(200);
  same('time: in 3D the month bar still moves the date the 3D view shows', await js(`document.querySelector('#fw3d').dataset.got`), await js(`document.querySelector('#fwTime').getAttribute('datetime')`));
  await tap('#fwMapBtn');
  const small = await js(`[...document.querySelectorAll('#fwStrip button, #fwStrip input')].filter(b => { const r = b.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(b => b.id)`);
  same('time: every control of the bar is at least 44 px', small, []);
  await shot('farm-time-1280.png');
  await size(375); await sleep(300); await shot('farm-time-375.png');
});

// ---- the look: pictures of every screen at two widths, for a person to look at (only when E2E_SHOTS names a folder outside the project)
await group('look', async () => {
  if (!run.shots) return;
  for (const width of [1280, 375]) {
    await size(width); await go('/'); await js(`localStorage.removeItem('crophalo.farms.v1')`); await go('/'); await open();
    await js(`import('/js/simulate.js').then(S => { let store = S.cleanStore(JSON.parse(localStorage.getItem('crophalo.farms.v1'))); const farm = S.getFarm(store), c = [farm.pin.lat, farm.pin.lon]; for (const [i, dx] of [[1, 0.01], [2, -0.01]]) store = S.addField(store, farm.id, { ring: S.squareAround(c[0] + 0.01 * i, c[1] + dx, 2) }, { now: Date.now() + i, random: () => i / 7 }).store; localStorage.setItem('crophalo.farms.v1', JSON.stringify(store)); })`);
    await go('/'); await js(`document.querySelector('#navFarm').click()`);
    await until(`document.querySelector('#fwField') && document.querySelector('#fwField').options.length === 3`); await js(`document.querySelector('#fwField').value = document.querySelector('#fwField').options[0].value; document.querySelector('#fwField').dispatchEvent(new Event('change'))`); await sleep(600);
    const back = async () => { await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(150); };
    const snap = async (name, fn) => { for (let i = 0; i < 4; i++) { if (await js(`document.querySelector('#fwPanel').hidden && document.querySelector('#fwEditBar').hidden`)) break; await back(); } await fn(); await sleep(350); await shot(`look-${name}-${width}.png`); };
    await snap('first', async () => {});
    await snap('compare', async () => { await js(`document.querySelector('#fwCompare').click()`); });
    for (const tab of ['check', 'facts', 'weather', 'remind']) await snap(`drawer-${tab}`, async () => { await js(`document.querySelector('#fwDetailsBtn').click()`); await sleep(100); await js(`document.querySelector('#fwtab-${tab}').click()`); });
    await snap('plant', async () => { await js(`document.querySelector('#fwDetailsBtn').click()`); await sleep(100); await js(`document.querySelector('#fwtab-check').click()`); await js(`document.querySelector('[data-act=plant]').click()`); });
    await snap('soil', async () => { await js(`document.querySelector('#fwDetailsBtn').click()`); await sleep(100); await js(`document.querySelector('#fwtab-facts').click()`); await js(`document.querySelector('[data-act=soil]').click()`); });
    await snap('copy', async () => { await js(`document.querySelector('#fwDetailsBtn').click()`); await sleep(100); await js(`document.querySelector('#fwtab-check').click()`); await js(`document.querySelector('[data-act=copy]').click()`); });
    await snap('fields', async () => { await js(`document.querySelector('#fwFieldsBtn').click()`); });
    await snap('farms', async () => { await js(`document.querySelector('#fwFarmBtn').click()`); });
    await snap('settings', async () => { await js(`document.querySelector('#fwFarmBtn').click()`); await sleep(100); await js(`document.querySelector('[data-act=settings]').click()`); });
    await snap('chip-score', async () => { await js(`document.querySelector('[data-chip=score]').click()`); });
    await snap('add', async () => { await js(`document.querySelector('#fwEditBtn').click()`); await sleep(100); await js(`document.querySelector('[data-edit=add]').click()`); });
    await snap('menu', async () => { await js(`document.querySelector('#fwEditBtn').click()`); });
    await js(`document.querySelector('#fwEditBtn').click()`);
    await snap('corners', async () => { await js(`document.querySelector('#fwEditBtn').click()`); await sleep(100); await js(`document.querySelector('[data-edit=corners]').click()`); });
    await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(200);
    await snap('newfarm', async () => { await js(`document.querySelector('#fwEditBtn').click()`); await sleep(100); await js(`document.querySelector('[data-edit=newfarm]').click()`); });
  }
});

await group('history', async () => {
  await open(); await sleep(300);
  same('history: the tab is on the toolbar, named for a screen reader', [await text('#fwTab-rewind'), await js(`document.querySelector('#fwTab-rewind').getAttribute('aria-label')`)], ['History', 'Land history']);
  await tap('#fwTab-rewind'); await until(`!document.querySelector('#fwHistory').hidden && document.querySelector('#fwHistoryBody h1, #fwHistoryBody .rv-notread')`, 30000);
  check('history: with the weather cut off it says "Not read yet", never a figure', /Not read yet/.test(await text('#fwHistoryBody')) && !/Fine in/.test(await text('#fwHistoryBody')), await text('#fwHistoryBody'));
  same('history: the board\'s controls are out of the way and the way back is there', [await js(`document.querySelector('#fwStrip').hidden`), await text('#fwHistoryBack')], [true, '‹ Back to the board']);
  await tap('#fwHistoryBack'); await sleep(200);
  same('history: Back returns to the board with the same day', [await js(`document.querySelector('#fwHistory').hidden`), await js(`!document.querySelector('#fwMap').hidden`), await text('#fwTime'), await js(`document.activeElement.id`)], [true, true, W(KD[0].date), 'fwTab-rewind']);
  // with the recorded weather
  const series = await realSeries(), farmS = SIM.cleanStore({ v: 1, farms: [] });
  await js(`window.__fix = ${JSON.stringify({ power: FIX('power_barrie.json'), forecast: FIX('forecast_barrie.json'), land: FIX('era5land_barrie.json') })}; window.__farm.setDataEnv({ now: () => Date.parse('2026-11-14T15:00:00Z'), fetch: async url => { const f = /power[.]larc/.test(url) ? window.__fix.power : /api[.]open-meteo[.]com[/]v1[/]forecast/.test(url) ? window.__fix.forecast : /era5_land/.test(url) ? window.__fix.land : null; return f ? { ok: true, status: 200, headers: { get: () => null }, text: async () => f } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' }; } }); window.__farm.forgetReadings(); window.__farm.render()`);
  await tap('#fwTab-rewind'); await until(`document.querySelector('#h-crops')`, 60000); await sleep(300);
  same('history: the page is the land history of the farm', [await text('#fwHistoryBody h1'), (await text('#histSub')).startsWith('Barrie')], ['Land history', true]);
  // the counts expected, worked out here from the same recorded weather and the same rules
  const store = SIM.cleanStore({ v: 1, active: 'f', farms: [{ id: 'f', name: 'Barrie', pin: { lat: 44.4, lon: -79.78 }, fields: [], scenarios: [] }] });
  const made = SIM.applyReport(store, REAL, { now: Date.parse('2026-11-14T15:00:00Z') }), fm = SIM.getFarm(made.store, made.farmId), fd = SIM.getField(fm, made.fieldId);
  const want = FARMHIST.cropsFor(fm, fd, series, { cropOf: CROPS.cropOf, cropName: CROPS.cropName, holdOf: t => FIT.WATER_HOLD[t] ?? 150, irrigationMm: l => FIT.IRRIGATION_MM[l] ?? 0 });
  const card = await text('#h-crops');
  check('history: "Your crops, year by year" shows real Fine / Close call / Hurt counts for each crop of the plan', want.ok && want.rows.every(r => card.includes(`${r.field}: ${r.crop}`) && card.includes(`Fine in ${r.counts.fine} of ${r.counts.judged} years, a close call in ${r.counts.close}, hurt in ${r.counts.hurt}.`)), `${card.slice(0, 300)} | want ${JSON.stringify(want.rows?.map(r => r.counts))}`);
  check('history: it is no longer "not read yet"', !/replay of each crop against this weather is not joined/.test(card), card.slice(0, 200));
  check('history: and the basis says counts of real years, never a chance', /counts of real years, never a chance and never a forecast/.test(card), card.slice(-240));
  const more = await js(`document.querySelectorAll('#h-crops [data-more]').length`);
  if (more) { await tap('#h-crops [data-more]'); await sleep(150); check('history: "More" opens the causes with their years and numbers', /^\d{4}: (Hurt|Close call)\./.test(await text('#h-crops .h-more:not([hidden]) p')), await text('#h-crops .h-more:not([hidden])')); }
  await shot('farm-history-1280.png');
  await press('Escape'); await sleep(200);
  same('history: Escape goes back to the board', [await js(`document.querySelector('#fwHistory').hidden`), await js(`document.activeElement.id`)], [true, 'fwTab-rewind']);
  const small = await js(`[...document.querySelectorAll('#fwHistory button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5); }).map(b => b.id || b.textContent.trim().slice(0, 14))`);
  same('history: every button is at least 44 px', small, []);
});

await group('observed', async () => {
  await js(`import('/js/farm.js').then(m => { window.__farm = m; m.setDataEnv({ fetch: async () => { throw new Error('down'); } }); window.__res = m.addFromReport(${REPORT_JS}); })`); await until(`document.querySelector('#fwFinding')?.textContent.length > 5 && !document.querySelector('#view-farm').hidden`); await sleep(400);
  same('observed: with the picture lookup cut off the chip says not read yet, beside Planned', [await text('#fwObs'), /^(Planned|Observed|outside)/.test(await text('#fwLabel')) || (await text('#fwLabel')).length > 0], ['Observed: not read yet', true]);
  check('observed: and gives its reason in words', /did not answer/.test(await js(`document.querySelector('#fwObs').title`)), await js(`document.querySelector('#fwObs').title`));
  // with the lookup's answer (a stand-in in its documented shape)
  const answer = JSON.stringify(HLS_SHAPE);
  await js(`window.__farm.forgetObserved(); window.__farm.setDataEnv({ fetch: async url => /^[/]api[/]hlsndvi/.test(url) ? { ok: true, json: async () => (${answer}) } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' } }); window.__farm.render()`);
  await until(`document.querySelector('#fwObs').dataset.state !== 'wait' && document.querySelector('#fwObs').dataset.state !== 'unread'`, 20000);
  same('observed: on a planned day after the newest picture it says "not yet", never a state', await text('#fwObs'), 'Observed: not yet');
  const D = n => dayBack(n);
  await js(`window.__farm._ui.date = ${JSON.stringify(D(6))}; window.__farm.render()`); await sleep(150);
  check('observed: on a day after a clear picture it says Observed, the day and NASA HLS, beside Planned', /^Observed \d+ \w{3}( \d{4})? \(NASA HLS\)$/.test(await text('#fwObs')) && (await text('#fwLabel')).length > 0, await text('#fwObs') + ' | ' + await text('#fwLabel'));
  same('observed: the chip is next to the Planned label inside the one date line', await js(`document.querySelector('#fwLabel').parentElement === document.querySelector('#fwObs').parentElement && document.querySelectorAll('#fwHud time').length`), 1);
  await js(`window.__farm._ui.date = ${JSON.stringify(D(60))}; window.__farm.render()`); await sleep(150);
  same('observed: a day with no clear picture says so', await text('#fwObs'), 'Observed: no clear picture');
  await tap('#fwCompare'); await until(`document.querySelector('#fwc-obs')`);
  check('observed: Compare plans carries an "Observed from space" card with the plain sentence', /Observed from space/.test(await text('.fw-observed')) && /no clear NASA picture of this field in the 15 days before/.test(await text('.fw-observed')), await text('.fw-observed'));
  await js(`window.__farm._ui.date = ${JSON.stringify(D(6))}; window.__farm.render()`); await sleep(150);
  check('observed: on a clear day the card gives the greenness, the satellite and the clear dots', /Greenness \(NDVI\) 0\.44 from Sentinel-2; 9 of 9 dots of 30 m were clear/.test(await text('.fw-observed')) && /never today's state/.test(await text('.fw-observed')), await text('.fw-observed'));
  check('observed: and the planned cards are still there', (await js(`document.querySelectorAll('.fw-card h3')`).then ? true : true) && (await js(`[...document.querySelectorAll('.fw-card h3')].map(h => h.textContent).join()`)).startsWith('Current plan,Proposed plan'));
  await shot('farm-observed-1280.png');
  await press('Escape'); await sleep(100);
  // a lookup that fails
  await js(`window.__farm.forgetObserved(); window.__farm.setDataEnv({ fetch: async url => /^[/]api[/]hlsndvi/.test(url) ? { ok: true, json: async () => ({ ok: false, reason: 'NASA did not accept the Earthdata login for the HLS files.' }) } : { ok: false, status: 404, headers: { get: () => null }, text: async () => '' } }); window.__farm.render()`);
  await until(`document.querySelector('#fwObs').dataset.state === 'unread' && /HLS files/.test(document.querySelector('#fwObs').title)`, 20000);
  same('observed: a lookup that failed says not read yet and why, never a green field', [await text('#fwObs'), /HLS files/.test(await js(`document.querySelector('#fwObs').title`))], ['Observed: not read yet', true]);
  await size(375); await sleep(300); await shot('farm-observed-375.png');
  await flat('observed at 375');
});

await group('motion', async () => {
  // Settings > Motion: Full (nothing set), Less ("less"), Still ("reduce")
  for (const kind of ['less', 'reduce']) {
    await go('/'); await js(`document.documentElement.dataset.motion = '${kind}'`); await open(); await sleep(300);
    same(`motion: ${kind}: the board's map does not glide after a drag`, await js(`window.__farm._map().options.inertia`), false);
    same(`motion: ${kind}: nothing on the board has a transition or an animation`, await js(`[...document.querySelectorAll('#fw, #fw *')].filter(el => { const c = getComputedStyle(el); return [...c.transitionDuration.split(',')].some(d => parseFloat(d) > 0) || (c.animationName !== 'none' && parseFloat(c.animationDuration) > 0); }).map(el => el.id || el.className).slice(0, 5)`), []);
    await js(`document.querySelector('#fwMonthSlider').value = '3'; document.querySelector('#fwMonthSlider').dispatchEvent(new Event('input', { bubbles: true }))`); await sleep(100);
    same(`motion: ${kind}: the time bar jumps: the date is changed at once`, await text('#fwMonthName').then(t => /April/.test(t)), true);
    await js(`window.__farm.setView3d((data, node, options) => { node.dataset.motion = options.motion; return { ok: true, update() {}, dispose() {} }; })`);
    await js(`Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value() { return { getExtension: () => null }; }, configurable: true }); 0`);
    await tap('#fwThreeBtn'); await sleep(300);
    same(`motion: ${kind}: the 3D view is told`, await js(`document.querySelector('#fw3d').dataset.motion`), kind);
  }
  await go('/'); await js(`delete document.documentElement.dataset.motion`); await open(); await sleep(200);
  same('motion: full: the map may glide after a drag', await js(`window.__farm._map().options.inertia`), true);
});

await group('fit', async () => {
  for (const w of [320, 375, 1280]) {
    await size(w); await go('/'); await open(); await js(`document.documentElement.dataset.text = 'xlarge'`);
    await flat(`farm ${w}`);
    await js(`document.querySelector('#fwCompare').click()`); await sleep(150); await flat(`compare ${w}`);
    if (w === 375) await shot('farm-compare-375.png');
    await js(`document.querySelector('#fwClose')?.click()`);
    if (w === 375) await shot('farm-first-open-375.png');
  }
});

await finish();
