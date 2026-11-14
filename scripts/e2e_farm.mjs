// The My farm browser suite: a report's field opens at once on the map, one date, one finding, Compare plans, the Map and 3D switch, editing (E2E_ONLY picks groups).
// The ground-cover answers in "compare" come from a stand-in written in this file, so the screen's words can be checked before the engine answers; the app ships none.
// RULE: never loosen a check here to make it pass without a written farming reason beside it. Run: node scripts/e2e_farm.mjs
import { openRun } from './e2e_lib.mjs';
import { REPORT } from './fixtures/demo-plans.mjs';

const run = await openRun('e2e_farm');
const { js, page, until, seen, tap, tapAt, press, size, device, go, flat, shot, check, same, finish, sleep } = run;
// Each group is a second visit: the welcome sheet was read once and is out of the way (scripts/e2e_flow.mjs drives the welcome itself).
const welcomed = async () => { await js(`import('/js/welcome.js').then(m => localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: 'test' })))`); await go('/'); };
const group = (label, body) => run.group(label, async () => { await welcomed(); await body(); });
const REPORT_JS = JSON.stringify(REPORT);
const open = async () => { await js(`import('/js/farm.js').then(m => { window.__farm = m; window.__res = m.addFromReport(${REPORT_JS}); })`); await until(`document.querySelector('#fwFinding')?.textContent.length > 5 && !document.querySelector('#view-farm').hidden`); await sleep(300); };
const text = sel => js(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim().replace(/\\s+/g, ' ') ?? null`);
// the stand-in: states chosen by date from the plans' own harvest dates, only to see the words drawn
const STAND_IN = `window.__farm.setGround((plan, date) => { const w = plan.seasons.find(s => s.crop === 'wheat'); if (date <= '2028-10-05') return { state: 'residue', crop: null, stage: null, label: 'Planned', note: 'Soybean stalks lie on the ground after the harvest.' }; if (date < '2029-04-01') return w ? { state: 'cover', crop: 'wheat', stage: 1, label: 'Planned', note: 'Young winter wheat covers the rows.' } : { state: 'residue', crop: null, stage: null, label: 'Planned', note: 'Stalks and stubble.' }; return w ? { state: 'crop', crop: 'wheat', stage: 3, label: 'Planned', note: 'Winter wheat is growing.' } : { state: 'bare', crop: null, stage: null, label: 'Planned', note: 'Bare until corn is sown.' }; })`;


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
  same('report: its date is the one handed over', await text('#fwTime'), '5 Oct 2028');
  // the page start hands My farm the crop engine's groundOn(): the ground on the date comes from the plans' own dates, written as planned, never as observed
  same('report: the engine answers the ground for this date, and the label says Planned', await text('#fwLabel'), 'Planned');
  check('report: the finding is one sentence about this date from the plans, never an observed state', /^On 5 Oct 2028 /.test(await text('#fwFinding')) && !/observed/i.test(await text('#fwFinding')), await text('#fwFinding'));
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
  await open(); await js(STAND_IN); await sleep(100);
  same('compare: with an answer the chip says Planned', await text('#fwLabel'), 'Planned');
  check('compare: the finding names both plans in one sentence', /^On 5 Oct 2028 the current plan has .+ and the proposed plan has .+\.$|^On 5 Oct 2028 both plans have/.test(await text('#fwFinding')), await text('#fwFinding'));
  await tap('#fwCompare'); await until(`!document.querySelector('#fwPanel').hidden`);
  same('compare: the button says it is open', await js(`document.querySelector('#fwCompare').getAttribute('aria-expanded')`), 'true');
  same('compare: focus moves into the panel heading', await js(`document.activeElement?.id`), 'fwPanelTitle');
  same('compare: three dates', await js(`[...document.querySelectorAll('.fw-step span')].map(s => s.textContent)`), ['Soybean harvest', 'Fall establishment', 'Spring growth']);
  same('compare: their dates', await js(`[...document.querySelectorAll('.fw-step small')].map(s => s.textContent)`), ['5 Oct 2028', '11 Nov 2028', '15 May 2029']);
  same('compare: two plans on one date', await js(`[...document.querySelectorAll('.fw-card h3')].map(h => h.textContent)`), ['Current plan', 'Proposed plan']);
  same('compare: ONE visible date line', await js(`document.querySelectorAll('.fw-onedate time').length`), 1);
  check('compare: every state is written Planned', await js(`[...document.querySelectorAll('.fw-card .fw-label')].every(l => /^(Planned|Observed)$/.test(l.textContent)) && document.querySelectorAll('.fw-card .fw-label').length === 2`));
  const t = await text('.fw-cards');
  check('compare: residue on the current side on harvest day', /Crop residue/.test(t) && /Soybean stalks/.test(t), t);
  await tap('.fw-step[data-i="1"]'); await sleep(100);
  check('compare: fall establishment: wheat covers the proposed field, residue stays on the current one', /Young winter wheat/.test(await text('.fw-cards')), await text('.fw-cards'));
  same('compare: the date chip follows', await text('#fwTime'), '11 Nov 2028');
  await tap('#fwNext'); await sleep(100);
  same('compare: the stepper goes to spring', await text('#fwTime'), '15 May 2029');
  check('compare: spring: wheat is growing', /Winter wheat is growing/.test(await text('.fw-cards')));
  same('compare: Next is off on the last date', await js(`document.querySelector('#fwNext').disabled`), true);
  const cav = await text('.fw-caveat');
  check('compare: the planting window is written with its dates', /Planting window for Winter wheat: 20 Sep 2028 to 15 Oct 2028/.test(cav), cav);
  check('compare: the late-harvest caveat is there', /late soybean harvest squeezes it/i.test(cav) && /inside the window/.test(cav), cav);
  const open2 = await js(`document.querySelector('.fw-fold').open`);
  same('compare: the assumptions are written (in a fold)', open2, false);
  await js(`document.querySelector('.fw-fold').open = true`);
  const asm = await text('.fw-fold');
  check('compare: loam assumed, rain-fed, estimated outline', /loam, assumed/.test(asm) && /rain-fed/.test(asm) && /Outline: estimated, a square of 10\.0 ha/.test(asm), asm);
  await shot('farm-compare-1280.png');
  await press('Escape'); await sleep(100);
  same('compare: Escape closes the panel', await js(`document.querySelector('#fwPanel').hidden`), true);
  same('compare: and focus returns to the button', await js(`document.activeElement?.id`), 'fwCompare');
  same('compare: the date chosen stays', await text('#fwTime'), '15 May 2029');
  const small = await js(`(() => { document.querySelector('#fwCompare').click(); return [...document.querySelectorAll('#fwPanel button')].filter(b => { const r = b.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map(b => b.id || b.className); })()`);
  same('compare: every panel button is at least 44 px', small, []);
});

await group('switch', async () => {
  await open(); await js(STAND_IN);
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
  same('switch: 3D receives the field, the plan and the date chosen', [got.field, got.planKind, got.date], [await js('window.__res.fieldId'), 'proposed', '2028-11-11']);
  same('switch: and what covers the ground then', got.ground, 'cover');
  await js(`window.__farm._ui.date = '2029-05-15'; window.__farm.render()`); await sleep(100);
  same('switch: a change of date while in 3D reaches the 3D view by update()', JSON.parse(await js(`document.querySelector('#fw3d').dataset.got`)).date, '2029-05-15');
  await js(`window.__farm._ui.date = '2028-11-11'; window.__farm.render()`);
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
  same('edit: the board is empty again', await js(`!document.querySelector('#fwEmpty').hidden`), true);
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
  same('shape: the shape tools sit under Edit field', await js(`[...document.querySelectorAll('#fwEditMenu button')].map(b => b.textContent)`), ['Move corners', 'Split', 'Rename', 'Bring in a map file', 'Save fields as a map file', 'Save the Fields table', 'Recently deleted', 'Delete']);
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

await group('fit', async () => {
  for (const w of [320, 375, 1280]) {
    await size(w); await go('/'); await open(); await js(STAND_IN); await js(`document.documentElement.dataset.text = 'xlarge'`);
    await flat(`farm ${w}`);
    await js(`document.querySelector('#fwCompare').click()`); await sleep(150); await flat(`compare ${w}`);
    if (w === 375) await shot('farm-compare-375.png');
    await js(`document.querySelector('#fwClose')?.click()`);
    if (w === 375) await shot('farm-first-open-375.png');
  }
});

await finish();
