// Crophalo's real-browser suite for the setup map: the tools drawn by mouse and by key, the outline, the view stack, the Escape order, the fit and axe.
// Groups (E2E_ONLY=fit picks some): tools, keys, card, places, layers, grace, panelgroups, alive, stack, fit, axe and more. The photo tiles are cut off by the harness, so the map shows its calm dark ground; every check is about the controls.
// RULE: never loosen a check here without a written farming reason beside it. Run: node scripts/e2e_map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';
import { D, J, domains } from './gibs_fixtures.mjs';

const run = await openRun('e2e_map');
const { ROOT, js, until, seen, page, tapAt, tap, press, size, go, flat, check, same, group, finish, sleep, send, mouse } = run;
// The copy under test has no Python, so the server's own lookups cannot answer there. The early lookups a chosen place starts (js/report-load.js prefetchPlace)
// are answered "not read" at the page, as scripts/e2e_flow.mjs does, so the copy's refusals are not logged as errors of the page. /api/health still goes to the server.
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, ...rest) => /[/]api[/](smaproot|cropsnear|imergrain|gracecell|ecopass|hlsndvi|dem|ndvihist)[?]/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify({ ok: false, reason: 'not in this copy' }), { headers: { 'content-type': 'application/json' } })) : first(u, ...rest); })();" });
const WIDTHS = [320, 375, 390, 768, 1280];
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
const mapReady = async (pick = true) => { await acceptWelcome(); await js(`try { sessionStorage.clear(); } catch {}`); await go('/'); await until(`document.querySelector('#view-home') && !document.querySelector('#view-home').hidden`); await until(`[...document.querySelectorAll('button')].some(b => /Find it on the map/.test(b.textContent))`);
  await js(`[...document.querySelectorAll('button')].find(b => /Find it on the map/.test(b.textContent)).click()`); await until(`document.querySelector('#mapx') && !document.querySelector('#view-setup').hidden`); await sleep(300); };
const centre = () => js(`(() => { const r = document.querySelector('#mapxCanvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; })()`);
const state = () => js(`import('/js/mapx.js').then(m => m.mapState())`);
const fieldDay = n => new Date(Date.now() - 18000e3 + n * 864e5).toISOString().slice(0, 10);   // today at a field five hours behind UTC, and the days after it
const FORECAST = { elevation: 291, utc_offset_seconds: -18000, timezone_abbreviation: 'GMT-5', current: { time: `${fieldDay(0)}T14:05`, temperature_2m: 12.4, apparent_temperature: 10.6, weather_code: 3, wind_speed_10m: 15.2 },
  daily: { time: [0, 1, 2, 3].map(fieldDay), weather_code: [61, 3, 0, 95], temperature_2m_max: [18, 14, 9, 11], temperature_2m_min: [7, 5, 2, 3], precipitation_probability_max: [20, 60, 10, 80], precipitation_sum: [3, 0, 0, 12] } };   // a made-up forecast for the test only: the harness cuts every outside request
const withForecast = () => js(`(() => { const real = window.fetch; window.fetch = (u, o) => /api\\.open-meteo\\.com/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify(${JSON.stringify(FORECAST)}), { status: 200 })) : real(u, o); })()`);
const live = () => js(`document.querySelector('#mapxLive').textContent`);
const hint = () => js(`document.querySelector('#mapxHintText').textContent`);
const tool = name => js(`document.querySelector('.mapx-seg [data-tool=${name}]').click()`);   // the tool's button (the map itself now says its tool in data-tool too)
const zoomTo = z => js(`import('/js/mapbase.js').then(m => { m.baseNow().leaflet().setZoom(${z}, { animate: false }); return 1; })`);
const firstUnit = () => js(`import('/js/geo.js').then(g => g.unitsOrder('auto', navigator.languages[0]) === 'acres' ? 'acres' : 'ha')`);   // the unit a farmer of this browser's region reads first
async function drag(a, b) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, buttons: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, buttons: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 }); }

await group('tools', async () => {
  await mapReady();
  same('Pin is the tool at first, with the three tools named', await js(`[...document.querySelectorAll('.mapx-seg button')].map(b => b.title + ':' + b.getAttribute('aria-pressed'))`), ['Pin:true', 'Rectangle:false', 'Corners:false']);
  // changed: the words fit the hand in use (a mouse clicks), and the first taps from the world view zoom in: a pin dropped at zoom 2 lands kilometres from the field
  same('with no place yet, far out, the hint asks to zoom in to the field', [await hint(), (await state()).pin], ['Zoom in to your field: click near it, or search with Places.', null]);
  const c = await centre();
  for (let i = 0; i < 4; i++) { if (await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().getZoom())`) >= 10) break; await tapAt(c.x, c.y); await sleep(450); }   // the map opens on the United States (zoom 3 to 5): two or three clicks bring it to 10
  check('clicks from the opening view zoom in three levels each until the field is near enough (zoom 10), and drop no pin', (await state()).pin === null && await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().getZoom())`) >= 10);
  same('then the hint asks for a click on the field', await hint(), 'Click your field to drop the pin.');
  await tapAt(c.x, c.y); await until(`document.querySelector('.mapx-pin')`); await sleep(700);
  const st = await state();
  check('a tap puts the pin there, rounded to 4 decimals', st.pin && Number.isFinite(st.pin.lat) && String(st.pin.lat).split('.')[1]?.length <= 4, st.pin);
  check('the pin has a 44 by 44 tap area', await js(`(() => { const r = document.querySelector('.mapx-pin').getBoundingClientRect(); return r.width >= 43.5 && r.height >= 43.5; })()`));
  check('the pin says where it is, for a screen reader', /^Pin at -?\d+\.\d{4}, -?\d+\.\d{4}$/.test(await live()), await live());
  same('now the hint says how to move it, in a mouse\'s words', await hint(), 'Click the map to move your field, or drag the pin. Click the pin for the weather.');   // changed: the words fit the hand in use
  // rectangle
  await tool('rect');
  same('Rectangle changes the hint', await hint(), 'Click 2 corners along one side of your field, or drag a box.');   // changed: two clicks along a side (a field turned off north), or the quick box
  await drag({ x: c.x + 100, y: c.y + 80 }, { x: c.x + 108, y: c.y + 130 });   // away from the pin
  check('a box under 12 px wide is refused, and says why in the bar, where the farmer is looking', !(await state()).ring && /line, not a field/.test(await hint()), await hint());
  await js(`window.__outline = []; document.addEventListener('crophalo:outline', e => window.__outline.push(e.detail))`);
  await drag({ x: c.x - 80, y: c.y - 60 }, { x: c.x + 90, y: c.y + 50 });
  const ring = (await state()).ring;
  check('a drag makes an outline of four corners', Array.isArray(ring) && ring.length === 4, ring);
  // changed: corners are kept to 5 decimals, about 1 m, so a corner dragged at a close zoom lands where it was dropped
  check('its corners are rounded to 5 decimals and lie north-west, north-east, south-east, south-west', ring && ring.flat().every(v => (String(v).split('.')[1] || '').length <= 5) && ring[0][0] === ring[1][0] && ring[0][1] === ring[3][1] && ring[0][0] > ring[2][0] && ring[0][1] < ring[1][1]);
  // changed: the tools never lock. The tool returns to Pin, the outline is selected with its handles, and Start again is in the card: the farmer can redraw without losing the old outline
  check('the tool returns to Pin, the outline is selected with handles, and Start again is in the card', await js(`document.querySelector('.mapx-seg [data-tool=pin]').getAttribute('aria-pressed') === 'true' && [...document.querySelectorAll('.mapx-seg button')].every(b => !b.disabled) && document.querySelectorAll('.mapx-handle').length === 4 && !!document.querySelector('.spot [data-spot=again]')`));
  check('the page is told of the outline, once, and that it is used for the report at once', await js(`window.__outline.length === 1 && window.__outline[0].ring.length === 4 && window.__outline[0].used === true`), await js('window.__outline'));
  // polygon: four clicks and Finish, after Start again
  await js(`document.querySelector('.spot [data-spot=again]').click()`); await sleep(200);
  check('Start again removes the outline with an Undo', !(await state()).ring && /Outline removed\./.test(await js(`document.querySelector('#toast').textContent`)));
  await tool('poly');
  same('Polygon changes the hint', await hint(), 'Click each corner of your field.');   // changed: the words fit the hand in use
  for (const [dx, dy] of [[-70, -50], [80, -40], [90, 50]]) { await tapAt(c.x + dx, c.y + dy); await sleep(120); }
  // changed: the line says what to do next; the count and the area are said (and shown in the chip)
  same('three clicks: the hint offers the close, Finish is on', [await hint(), await js(`!document.querySelector('[data-act=finish]').hidden && !document.querySelector('[data-act=finish]').hasAttribute('aria-disabled')`)], ['Click the next corner, or click the first corner to finish.', true]);
  await tapAt(c.x - 60, c.y + 60); await sleep(150);
  check('a fourth click, said with the area so far', (await state()).draft?.length === 4 && /^Corner 4 added, about /.test(await live()), await live());
  await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Undo').click()`);
  same('Undo takes the last corner away', (await state()).draft?.length, 3);
  await tapAt(c.x - 60, c.y + 60); await sleep(120);
  await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Finish').click()`);
  const poly = (await state()).ring;
  check('Finish makes the outline', Array.isArray(poly) && poly.length === 4, poly);
  await js(`document.querySelector('.spot [data-spot=again]').click()`); await sleep(200);
  same('Start again clears it and the tools stay free', await js(`[!!document.querySelector('.mapx-handle'), [...document.querySelectorAll('.mapx-seg button')].every(b => !b.disabled)]`), [false, true]);
  // changed: a line that would cross is refused as the corner is placed, so a bow-tie is never drawn at all
  if (await js(`document.querySelector('.mapx-seg [data-tool=poly]').getAttribute('aria-pressed') !== 'true'`)) await tool('poly');
  for (const [dx, dy] of [[-60, -50], [60, 50], [60, -50], [-60, 50]]) { await tapAt(c.x + dx, c.y + dy); await sleep(120); }
  check('a corner whose line would cross is refused in words, and the drawing stays open', !(await state()).ring && (await state()).draft?.length === 3 && /Lines can't cross/.test(await hint()), await hint());
});

await group('keys', async () => {
  await mapReady();
  const c = await centre();
  await js(`document.querySelector('#mapx').focus()`);
  check('keyboard mode shows the crosshair and the "at the cross" button', await js(`document.body.classList.contains('kbd-mode') && getComputedStyle(document.querySelector('.mapx-cross')).display === 'block' && [...document.querySelectorAll('.mapx-hint .btn')].some(b => b.textContent === 'Put pin here')`));
  // changed: far out, the button zooms in at the cross first (three levels each press): a pin dropped from the world view would land kilometres off
  for (let i = 0; i < 5 && (await state()).pin === null; i++) { await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Put pin here').click()`); await sleep(450); }
  check('Put pin here puts the pin at the cross once the map is close enough', (await state()).pin !== null);
  await until(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().getZoom() >= 13 && !m.baseNow().leaflet()._animatingZoom)`, 4000).catch(() => {});
  check('the pin moved nothing else: one map, still', await js(`document.querySelectorAll('#mapx').length === 1`));
  await tool('poly'); await js(`document.querySelector('#mapx').focus()`);
  for (let i = 0; i < 3; i++) { await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Add corner').click()`); await js(`document.querySelector('#mapx').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`); await sleep(100); }
  same('three corners at the cross, the map moved between them', (await state()).draft?.length, 3);
  await js(`document.querySelector('#mapx').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  // changed: Escape goes back one layer at a time; on a drawing that layer is the whole drawing, with an Undo, because one Escape must not silently eat corners one by one
  same('Escape cancels the drawing, with an Undo', [(await state()).draft, /Corners drawing removed\./.test(await js(`document.querySelector('#toast').textContent`))], [null, true]);
  for (let i = 0; i < 3; i++) await js(`document.querySelector('#mapx').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  same('and the tool is back to Pin, on the same map', await js(`import('/js/mapx.js').then(m => m.mapState().mode + ' ' + document.querySelector('.mapx-seg [data-tool=pin]')?.getAttribute('aria-pressed') + ' ' + document.querySelectorAll('#mapx').length)`), 'pin true 1');
  await js(`document.querySelector('#mapx').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))`);
  check('any pointer ends keyboard mode', await js(`!document.body.classList.contains('kbd-mode')`));
});


await group('card', async () => {
  await mapReady();
  const c = await centre();
  await js(`import('/js/mapx.js').then(() => document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 44.3894, lon: -79.6903, name: 'Barrie, Simcoe County, Ontario', country: 'Canada' } })))`); await sleep(400);
  await js(`import('/js/mapx.js').then(m => m.openAbout())`); await until(`document.querySelector('.spot') && document.querySelector('.spot').style.opacity === ''`);
  same('the spot card (opened from the pin) is a dialog titled with the first two parts of the name', await js(`[document.querySelector('.spot').getAttribute('role'), document.querySelector('#spotTitle').textContent]`), ['dialog', 'Barrie, Simcoe County']);
  same('with a pin the tabs are Weather and Sun', await js(`[...document.querySelectorAll('.spot [role=tab]')].map(t => t.textContent)`), ['Weather', 'Sun']);
  check('the card lies inside the map, clear of the view buttons', await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(), r = document.querySelector('.spot').getBoundingClientRect(), s = document.querySelector('.mapx-stack').getBoundingClientRect(); return r.left >= m.left + 7 && r.right <= m.right - 7 && r.top >= m.top + 7 && r.bottom <= m.bottom - 7 && (r.right <= s.left + 1 || r.left >= s.right - 1 || r.bottom <= s.top || r.top >= s.bottom); })()`));
  await js(`document.querySelector('.spot [data-tab=sun]').click()`); await until(`!document.querySelector('#spotPanel').hasAttribute('aria-busy') && /Sun up|Highest at|The sun does not/.test(document.querySelector('#spotPanel').innerText)`);
  check('the Sun tab says when the sun is up, from the date and the place, with its note', /Highest at \d\d:\d\d/.test(await js(`document.querySelector('#spotPanel').innerText`)) && /orked out on this device/.test(await js(`document.querySelector('#spotPanel').innerText`)));
  await js(`document.querySelector('.spot [data-tab=sun]').focus(); document.querySelector('.spot-tabs').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))`);
  same('arrow keys move between the tabs', await js(`document.querySelector('.spot [aria-selected=true]').textContent`), 'Weather');
  const before = await js(`document.querySelector('.spot').offsetLeft`);
  await js(`document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))`);
  check('the grip moves the card with the arrow keys, 16 px a press', before - await js(`document.querySelector('.spot').offsetLeft`) === 16);
  await js(`document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true })); document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true })); document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true }))`);
  check('and it can never be pushed out of the map', await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(), r = document.querySelector('.spot').getBoundingClientRect(); return r.right <= m.right - 7; })()`));
  await js(`document.querySelector('.spot').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  check('Escape closes the card first, and focus returns to the button that opened it', await js(`!document.querySelector('.spot') && document.activeElement.classList.contains('leaflet-marker-icon')`));
  // an outline opens the Area tab; heights are not invented
  await tool('rect'); await drag({ x: c.x + 100, y: c.y + 80 }, { x: c.x + 220, y: c.y + 170 });
  await until(`document.querySelector('.spot') && document.querySelector('.spot').style.opacity === ''`);
  same('a finished outline opens the card on the Area tab, three tabs now', await js(`[document.querySelector('.spot [aria-selected=true]').textContent, document.querySelectorAll('.spot [role=tab]').length]`), ['Area', 3]);
  const unit = await firstUnit();   // both units show, the one of the farmer's region first (acres in the US and Canada, hectares elsewhere)
  check('its area is a real figure in the first unit, the second under it, and the card has no "not read yet" row and no half-built height or slope line', new RegExp(`^[\\d,]+(\\.\\d+)? ${unit === 'acres' ? 'acres?' : 'ha'}$`).test(await js(`document.querySelector('.spot-big .sr').textContent`)) && /(ha|acres?) · \d+ corners/.test(await js(`document.querySelector('#spotFigureLine').textContent`)) && !/not read yet|Elevation|Slope of the field/.test(await js(`document.querySelector('#spotPanel').innerText`)), await js(`document.querySelector('.spot-big .sr').textContent`));
  await js(`window.__got = null; document.addEventListener('crophalo:area', e => { window.__got = e.detail; })`);
  check('the card has no second "Use for my report": the outline was used when it closed', await js(`!document.querySelector('[data-spot=use]') && /Used in report/.test(document.querySelector('#spotPanel').innerText)`));
  // changed: "Reselect" and "Clear area" became one "Start again", with an Undo
  await js(`document.querySelector('[data-spot=again]').click()`);
  check('Start again removes the outline and the card, with an Undo', await js(`!document.querySelector('.spot') && /Outline removed/.test(document.querySelector('#toast').textContent)`) && !(await state()).ring);
});

await group('source', async () => {
  for (const w of [1280, 375, 320]) {
    await size(w); await mapReady();
    await withForecast();
    await js(`import('/js/mapx.js').then(() => document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 44.3894, lon: -79.6903, name: 'Barrie, Ontario', country: 'Canada' } })))`); await sleep(400);
    await js(`import('/js/mapx.js').then(m => m.openAbout())`); await until(`document.querySelector('.spot .srci')`, 8000);
    const at = `at ${w} px`; await sleep(450);   // the card has finished opening (it grows from 96% in 0.26 s), so its size is its real size
    check(`the weather figure has an "i", outlined (Open-Meteo is not NASA), reachable by keyboard ${at}`, await js(`(() => { const b = document.querySelector('.spot .srci'); return b && !b.classList.contains('nasa') && b.tabIndex >= 0 && /Open-Meteo/.test(b.getAttribute('aria-label')); })()`));
    check(`its tap area is at least 44 by 44 ${at}`, await js(`(() => { const b = document.querySelector('.spot .srci'), a = getComputedStyle(b, '::after'), r = b.getBoundingClientRect(), g = Math.max(0, -parseFloat(a.top) || 0) * 2; return r.width + g >= 43.5 && r.height + g >= 43.5; })()`));
    await js(`document.querySelector('.spot .srci').click()`); await until(`!document.querySelector('#srcPop').hidden`);
    same(`a press opens the card, named, and the button says it is open ${at}`, await js(`[document.querySelector('#srcPop').getAttribute('role'), document.querySelector('#srcPop').getAttribute('aria-label'), document.querySelector('.spot .srci').getAttribute('aria-expanded')]`), ['dialog', 'Where this information comes from', 'true']);
    check(`the card says who it is from and offers the link ${at}`, await js(`(() => { const t = document.querySelector('#srcPop').innerText; return /Open-Meteo/.test(t) && /For this figure/.test(t) && /Run by/.test(t) && /Visit the source/.test(t); })()`));
    check(`the card lies inside the screen ${at}`, await js(`(() => { const r = document.querySelector('#srcPop').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5; })()`));
    await flat(`the setup map with the source card open ${at}`);
    await js(`document.querySelector('#srcPop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    check(`Escape closes the card and returns to the button ${at}`, await js(`document.querySelector('#srcPop').hidden && document.activeElement === document.querySelector('.spot .srci') && document.querySelector('.spot .srci').getAttribute('aria-expanded') === 'false'`));
    await js(`document.querySelector('.spot .srci').click(); document.querySelector('.spot .srci').click()`);
    check(`a second press on the same button closes it ${at}`, await js(`document.querySelector('#srcPop').hidden`));
    await js(`document.querySelector('.spot .srci').click()`); await js(`document.querySelector('#srcPop .srcp-x').click()`);
    check(`the close button works and returns focus ${at}`, await js(`document.querySelector('#srcPop').hidden && document.activeElement === document.querySelector('.spot .srci')`));
  }
});

await group('region', async () => {
  const axe = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8');
  for (const [value, name] of [[0.31, 'with a value'], [null, 'with no value']]) for (const w of WIDTHS) for (const largest of [false, true]) {
    await size(w); await mapReady(); await js(axe);
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: '${largest ? 'xlarge' : 'default'}' }))`);
    await js(`(async () => { const r = await import('/js/region.js'); const box = document.createElement('div'); box.id = 'rtest'; box.className = 'wrap'; box.style.cssText = 'position:relative;z-index:5;background:var(--bg)'; document.querySelector('#view-setup').hidden = true; document.querySelector('main').append(box); box.innerHTML = r.regionHtml({ label: 'Moisture around the roots', value: ${value}, date: '2026-11-14', km: 9, lat: 44.4, lon: -79.78, source: 'smap', cell: { lat: 44.3537, lon: -79.777, width_km: 7.4, height_km: 10.9, edges: { n: 44.40273, s: 44.30463, e: -79.73029, w: -79.82366 } } }); r.wireRegion(box); })()`);
    await sleep(350);
    const at = `${name} at ${w} px${largest ? ' with the largest text' : ''}`;
    await flat(`the regional reading ${at}`);
    check(`the regional reading ${at}: the dashed square and the dot sit inside the picture`, await js(`(() => { const p = document.querySelector('.region-pic').getBoundingClientRect(), b = document.querySelector('.region-box').getBoundingClientRect(), d = document.querySelector('.region-dot').getBoundingClientRect(); return b.left >= p.left && b.right <= p.right && b.top >= p.top && b.bottom <= p.bottom && d.left > b.left && d.right < b.right; })()`));
    await until(`(() => { const i = document.querySelector('.region-pic img'); return i.classList.contains('gone') || (i.complete && i.naturalWidth > 0); })()`, 10000).catch(() => {});   // NASA is asked first for its newest clear day, then the picture
    check(`the regional reading ${at}: a picture that does not arrive leaves the dark box, not a broken mark`, await js(`(() => { const i = document.querySelector('.region-pic img'); return i.classList.contains('gone') || (i.complete && i.naturalWidth > 0); })()`));
    check(`the regional reading ${at}: the value line is ${value == null ? 'No value for this area' : '31% water by volume'}`, await js(`document.querySelector('.region-value').textContent`) === (value == null ? 'No value for this area' : '31% water by volume'));
    if (!largest) {
      const found = await js(`axe.run(document.querySelector('#rtest'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }).then(r => r.violations.map(v => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target.join(' ').slice(0, 70)))`);
      check(`axe: the regional reading ${at} has no problem`, found.length === 0, found.join(' | '));
    }
  }
});

await group('offline', async () => {
  await size(1280); await acceptWelcome(); await go('/');
  await until(`navigator.serviceWorker && navigator.serviceWorker.controller`, 20000).catch(() => {});
  const ready = await seen(`caches.keys().then(async names => { for (const n of names.filter(x => x.startsWith('crophalo-app-'))) { const m = await (await caches.open(n)).match('/sw-complete'); if (m && await m.text() === n) return true; } return false; })`, 20000);
  check('after one online visit the worker has kept ONE complete copy of the app', ready && (await js(`caches.keys().then(n => n.filter(x => x.startsWith('crophalo-app-')).length)`)) === 1);
  check('the copy holds the page, the app and the map library', await js(`caches.keys().then(async names => { const c = await caches.open(names.find(x => x.startsWith('crophalo-app-'))); const urls = (await c.keys()).map(r => new URL(r.url).pathname); return ['/index.html', '/js/app.js', '/css/app.css', '/vendor/leaflet/leaflet.js', '/manifest.json'].every(p => urls.includes(p)); })`));
  check('and nothing under /api', await js(`caches.keys().then(async names => { for (const n of names) { const urls = (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname); if (urls.some(p => p.startsWith('/api/'))) return false; } return true; })`));
  check('online, the offline bar is hidden', await js(`document.querySelector('#offlineBar').hidden`));
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await go('/');
  same('with the network off the page opens from the kept copy: its title, its home, its script ran', await js(`[document.title, !document.querySelector('#view-home').hidden, !!document.querySelector('#homeListen, .hero-h1, .eyebrow')]`), ['Start · Crophalo', true, true]);
  check('the yellow bar says what works and what does not', await js(`!document.querySelector('#offlineBar').hidden && document.querySelector('#offlineBar').textContent === 'You are offline. Saved fields open, but a new report needs an internet connection.'`));
  await size(320);
  await flat('the home with the offline bar at 320 px');
  await size(1280);
  check('a live answer is never served from the kept copy: /api fails when the network is off', await js(`fetch('/api/health').then(() => false, () => true)`));
  check('the map screen opens offline from the kept copy', await js(`import('/js/mapx.js').then(() => true, () => false)`));
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await until(`document.querySelector('#offlineBar').hidden`, 8000).catch(() => {});
  check('back online the bar goes away and the toast says so', await js(`document.querySelector('#offlineBar').hidden && /back online/.test(document.querySelector('#toast').textContent)`));
  // the install button
  await go('/');
  await js(`document.body.insertAdjacentHTML('beforeend', '<div id="icard">' + (window.__card = '') + '</div>'); import('/js/offline.js').then(m => { document.querySelector('#icard').innerHTML = m.installCardHtml(); })`); await sleep(300);
  check('a hidden install button really takes no room (the button style does not undo the hidden mark)', await js(`(() => { const d = document.createElement('div'); d.innerHTML = '<button type="button" class="btn primary installbtn" hidden>x</button>'; document.body.append(d); const shown = getComputedStyle(d.firstChild).display; d.remove(); return shown === 'none'; })()`));
  check('the card\'s own button starts hidden in its markup', await js(`import('/js/offline.js').then(m => /<button[^>]*installbtn[^>]*hidden/.test(m.installCardHtml()))`));
  await js(`window.__prompted = 0; const ev = new Event('beforeinstallprompt'); ev.prompt = async () => { window.__prompted++; }; ev.userChoice = Promise.resolve({ outcome: 'accepted' }); dispatchEvent(ev)`); await sleep(200);
  check('once the browser offers, the button shows', await js(`!document.querySelector('.installbtn').hidden`));
  await js(`document.querySelector('.installbtn').click()`); await sleep(300);
  check('pressing it asks the browser once, and the button goes when the install is accepted', await js(`window.__prompted === 1 && document.querySelector('.installbtn').hidden`));
});

const baseState = () => js(`import('/js/mapbase.js').then(m => m.baseNow().state())`);
const baseNote = () => js(`document.querySelector('#mapxBaseNote').textContent`);
await group('base', async () => {
  await mapReady();
  same('the base switch names Map and Satellite, Satellite pressed', await js(`[...document.querySelectorAll('.mapx-base button')].map(b => b.textContent + ':' + b.getAttribute('aria-pressed'))`), ['Map:false', 'Satellite:true']);
  await until(`import('/js/mapbase.js').then(m => !!m.baseNow()?.glMap())`, 15000);
  const first = await baseState();
  check('the first ground (NASA\'s picture) was drawn before the vector-map library had arrived, and the library\'s two scripts came together', await js(`(() => { const g = performance.getEntriesByName('crophalo-ground-shown')[0], l = performance.getEntriesByName('crophalo-gl-ready')[0]; return !!g && !!l && g.startTime <= l.startTime; })()`) && await js(`[...document.scripts].filter(x => /maplibre-gl\\.js|leaflet-maplibre-gl\\.js/.test(x.src)).every(x => x.async === false) && [...document.scripts].filter(x => /maplibre-gl\\.js|leaflet-maplibre-gl\\.js/.test(x.src)).length === 2`));
  check('MapLibre is loaded with the map, from the app\'s own vendor folder', first.gl === true && (await js(`[...document.scripts].some(x => x.src.includes('/vendor/maplibre/'))`)), first);
  await until(`import('/js/mapbase.js').then(m => m.baseNow().state().failed === 'stalled')`, 20000);
  check('the harness cuts the name tiles off, so the photo keeps itself and says the names did not load (the names themselves are checked live: scripts/live_check_basemap.mjs)', (await baseState()).ground === 'photo' && /did not load/.test(await baseNote()), await baseNote());
  check('the clean base asked NASA Blue Marble for the far map and EOX for the near,', run.cutOff.some(c => /BlueMarble_ShadedRelief_Bathymetry\/default\/GoogleMapsCompatible_Level8\//.test(c.where)));
  check('with the clean tiles cut off, the daily MODIS picture stands in and says so', /clean satellite picture did not load/.test(await baseNote()) || /did not load/.test(await baseNote()), await baseNote());
  check('the picture\'s credit is NASA\'s, with the day of the coarse picture', /^Imagery: NASA GIBS \/ Worldview · MODIS Terra 250 m, \d{1,2} \w+ \d{4}$/.test(await js(`document.querySelector('#mapxCredit').textContent`)), await js(`document.querySelector('#mapxCredit').textContent`));
  check('the date of the picture is on the map, with the satellite named', await js(`!document.querySelector('#mapxPic').hidden && /^NASA MODIS picture [(]250 m[)], [0-9]{1,2} [A-Za-z]+ [0-9]{4}$/.test(document.querySelector('#mapxPicText').textContent)`), await js(`document.querySelector('#mapxPicText').textContent`));
  await js(`document.querySelector('[data-base=light]').click()`); await until(`import('/js/mapbase.js').then(m => m.baseNow().state().choice === 'light')`);
  same('Map is pressed and Satellite is not', await js(`[...document.querySelectorAll('.mapx-base button')].map(b => b.getAttribute('aria-pressed'))`), ['true', 'false']);
  check('on the Light map the date of the picture is not shown (there is no picture under it)', await js(`import('/js/mapbase.js').then(m => m.baseNow().state().ground !== 'photo' ? document.querySelector('#mapxPic').hidden : true)`));
  await until(`import('/js/mapbase.js').then(m => m.baseNow().state().failed === 'stalled')`, 20000);
  same('with the detailed tiles cut off the Map is the satellite picture with the sentence that says why', [(await baseState()).ground, /^The detailed map did not load.* satellite picture shows without place names/.test(await baseNote())], ['photo', true]);
  // no WebGL: the names are missing and the ground is NASA's picture, and one sentence says so
  await js(`(() => { window.__ctx = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return /webgl/.test(kind) ? null : window.__ctx.call(this, kind, ...rest); }; })()`);
  await js(`import('/js/mapbase.js').then(m => m.baseNow().retry())`);
  await until(`!document.querySelector('#mapxBaseNote').hidden`);
  check('without WebGL the Map is the satellite picture and the sentence says why', (await baseState()).ground === 'photo' && /WebGL is switched off/.test(await baseNote()) && /satellite picture/.test(await baseNote()));
  await js(`document.querySelector('[data-base=sat]').click()`); await sleep(600);
  check('on the Satellite base the missing names are said too, and the picture itself stays', (await baseState()).ground === 'photo' && /place names/.test(await baseNote()));
  await js(`HTMLCanvasElement.prototype.getContext = window.__ctx; Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })`);
  await js(`import('/js/mapbase.js').then(m => m.baseNow().retry())`); await until(`/offline/.test(document.querySelector('#mapxBaseNote').textContent)`);
  check('offline says so, and the map is never blank', /come back by themselves/.test(await js(`document.querySelector('#mapxBaseNote').textContent`)) && await js(`!!document.querySelector('.leaflet-tile-pane')`));
  await js(`delete navigator.onLine`);
  await js(`import('/js/mapbase.js').then(m => { m.baseNow().retry(); })`); await sleep(500);
  check('no map tile was asked of Esri or ArcGIS by the map base (the home cards\' still pictures are another file) (the harness lists every outside request it cut off)', !run.cutOff.some(c => /arcgis|esri/i.test(c.where) && /\/tile\//.test(c.where)), run.cutOff.filter(c => /arcgis|esri/i.test(c.where) && /\/tile\//.test(c.where)));
  check('the style holds no water label at all: only the place layer and the road names draw words, nothing is named for a sea, lake, river, bay or gulf', await js(`import('/js/lightstyle.js').then(S => [S.lightStyle(), S.labelsStyle(), S.labelsStyle(false)].every(st => { const r = S.reading(st); return r.waterLayers.length === 0 && r.sourceLayers.every(x => x === 'place' || x === 'transportation_name'); }))`));
});

await group('rectNoPin', async () => {
  await mapReady();
  await withForecast();
  await js(`window.__pre = []; document.addEventListener('crophalo:prefetch', e => window.__pre.push(e.detail));`);
  await js(`window.__forecast = 0; { const real = window.fetch; window.fetch = (u, o) => { if (/open-meteo/.test(String(u))) window.__forecast++; return real(u, o); }; }`);
  check('there is no pin and no place yet', (await state()).pin === null && (await js(`import('/js/wizard.js').then(m => m.currentState().loc)`)) === null);
  const c = await centre();
  await js(`import('/js/mapbase.js').then(m => { m.baseNow().leaflet().setView([43.1, -80.8], 15, { animate: false }); return 1; })`); await sleep(200);   // drawing needs zoom 13 or closer: a field drawn from the world view would be kilometres wide
  await tool('rect'); await drag({ x: c.x - 60, y: c.y - 40 }, { x: c.x + 60, y: c.y + 40 });
  await until(`document.querySelector('.spot')`);
  const got = await js(`import('/js/wizard.js').then(m => { const loc = m.currentState().loc; return loc ? { lat: loc.lat, lon: loc.lon } : null; })`);
  check('a rectangle with no pin gives the setup a position: finite latitude and longitude', !!got && Number.isFinite(got.lat) && Number.isFinite(got.lon), got);
  const ring = (await state()).ring, lats = ring.map(p => p[0]), lons = ring.map(p => p[1]);
  check('and that position is inside the rectangle', got.lat >= Math.min(...lats) && got.lat <= Math.max(...lats) && got.lon >= Math.min(...lons) && got.lon <= Math.max(...lons), [got, ring]);
  const pin = (await state()).pin;
  same('the pin is at the same place, so the map and the setup agree', [Math.abs(pin.lat - got.lat) < 1e-4, Math.abs(pin.lon - got.lon) < 1e-4], [true, true]);
  await sleep(600);
  const asked = await js(`window.__forecast`);
  await sleep(800);
  check('and the card is still there after the setup redraws for the new place: the Area tab, open', await js(`!!document.querySelector('.spot') && document.querySelector('.spot [aria-selected=true]').textContent === 'Area'`));
  check('the page is told the place and the outline the moment the rectangle is finished, for the report to fetch ahead', await js(`window.__pre.length >= 1 && window.__pre.at(-1).outline.length === 4 && JSON.stringify(window.__pre.at(-1).outline) === JSON.stringify(window.__pre.at(-1).ring) && window.__pre.at(-1).outline.every(p => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) && Number.isFinite(window.__pre.at(-1).lat) && Number.isFinite(window.__pre.at(-1).lon)`));
  check('the weather request for the spot starts the moment the outline is finished (the Weather tab then finds it in memory)', asked >= 1, asked);
});

const NOMINATIM = [{ lat: '43.1306', lon: '-80.7469', name: 'Woodstock', display_name: 'Woodstock, Oxford County, Ontario, Canada', address: { country: 'Canada', country_code: 'ca' } }, { lat: '41.9', lon: '-88.4', name: 'Woodstock', display_name: 'Woodstock, McHenry County, Illinois, United States', address: { country: 'United States', country_code: 'us' } }];
const withPlaces = mode => js(`(() => { const real = window.fetch; window.fetch = (u, o) => /nominatim\\.openstreetmap\\.org/.test(String(u)) ? (${JSON.stringify(mode)} === 'down' ? Promise.resolve(new Response('no', { status: 503 })) : Promise.resolve(new Response(JSON.stringify(${JSON.stringify(NOMINATIM)}.filter(() => ${JSON.stringify(mode)} === 'found')), { status: 200 }))) : real(u, o); })()`);
const panelOpen = () => js(`!!document.querySelector('.mapx-panel')`);
await group('places', async () => {
  await mapReady();
  same('the top right holds the Places and Layers buttons, closed', await js(`[...document.querySelectorAll('.mapx-pbtn')].map(b => b.textContent.trim() + ':' + b.getAttribute('aria-expanded'))`), ['Places:false', 'Layers:false']);
  await js(`localStorage.removeItem('crophalo.places.v1')`);
  await withPlaces('found');
  await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`);
  check('the panel is a dialog named Places, with a 44 px close and the search box focused', await js(`(() => { const p = document.querySelector('.mapx-panel'), c = p.querySelector('.mapx-pclose').getBoundingClientRect(); return p.getAttribute('role') === 'dialog' && p.getAttribute('aria-label') === 'Places' && c.width >= 44 && c.height >= 44 && document.activeElement.id === 'mapxPlaceQ'; })()`));
  same('it has the search label, the placeholder and no section headings (the pin and outline rows and the demo row are gone)', await js(`[document.querySelector('label[for=mapxPlaceQ]').textContent, document.querySelector('#mapxPlaceQ').placeholder, [...document.querySelectorAll('.mapx-sub')].map(h => h.textContent)]`), ['Search for a place or coordinates', 'Search a place', []]);
  check('the panel does not offer to show the pin or the outline (Zoom to your field does that), nor to move the field to a demo', await js(`!document.querySelector('#mapxPlaceShow, #mapxPlaceDemo') && !/Show on the map|Move your field to/.test(document.querySelector('.mapx-panel').textContent)`));
  check('nothing is asked of the place service while typing', await js(`(async () => { window.__asked = 0; const f = window.fetch; window.fetch = (u, o) => { if (/nominatim/.test(String(u))) window.__asked++; return f(u, o); }; const q = document.querySelector('#mapxPlaceQ'); q.value = 'Woodst'; q.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 400)); return window.__asked === 0; })()`));
  await js(`document.querySelector('#mapxPlaceQ').value = 'Woodstock'; document.querySelector('#mapxPlaceForm').requestSubmit()`);
  await until(`document.querySelectorAll('#mapxPlaceRes .mapx-row').length === 2`);
  same('Search gives the places as rows, under the sentence that says what to do', await js(`[document.querySelector('#mapxPlaceRes .cap').textContent, document.querySelector('#mapxPlaceRes .mapx-row b').textContent, document.querySelector('#mapxPlaceRes .mapx-row span').textContent]`), ['Pick your place', 'Woodstock', 'Oxford County, Ontario, Canada']);
  check('the results carry OpenStreetMap\'s credit as a link to its copyright page', await js(`(() => { const a = document.querySelector('#mapxPlaceRes .mapx-osm a'); return !!a && a.href === 'https://www.openstreetmap.org/copyright' && /OpenStreetMap contributors/.test(a.textContent); })()`));
  await js(`document.querySelector('#mapxPlaceRes .mapx-row').click()`);
  await until(`!document.querySelector('.mapx-panel')`); await sleep(800);
  const pin = (await state()).pin;
  check('choosing a place moves the field there and closes the panel', !!pin && Math.abs(pin.lat - 43.1306) < 1e-4 && Math.abs(pin.lon + 80.7469) < 1e-4, pin);
  same('at zoom 13, and it stays 13 when the setup redraws the map', await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().getZoom())`), 13);  same('the name chosen is the name the setup keeps', await js(`import('/js/wizard.js').then(m => m.currentState().name || m.currentState().loc?.label || '')`).then(n => /Woodstock/.test(n)), true);
  // coordinates are read here, with no service asked
  await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`);
  await js(`document.querySelector('#mapxPlaceQ').value = '42.03, -93.62'; document.querySelector('#mapxPlaceForm').requestSubmit()`);
  await until(`document.querySelector('#mapxPlaceRes .mapx-row')`);
  same('coordinates become one row to choose', await js(`[document.querySelector('#mapxPlaceRes .cap').textContent, document.querySelector('#mapxPlaceRes .mapx-row b').textContent]`), ['Pick to move your field here', '42.03000, -93.62000']);
  await js(`document.querySelector('#mapxPlaceQ').value = '-42.03N, -93.62'; document.querySelector('#mapxPlaceForm').requestSubmit()`);
  await sleep(200);
  check('a coordinate with a mistake is explained, in words', /minus sign/i.test(await js(`document.querySelector('#mapxPlaceRes').textContent`)) || /sign|disagree/i.test(await js(`document.querySelector('#mapxPlaceRes').textContent`)), await js(`document.querySelector('#mapxPlaceRes').textContent`));
  // no match and a service that is down
  await withPlaces('none');
  await js(`localStorage.removeItem('crophalo.places.v1'); document.querySelector('#mapxPlaceQ').value = 'Qxzvbn'; document.querySelector('#mapxPlaceForm').requestSubmit()`);
  await until(`/No match/.test(document.querySelector('#mapxPlaceRes').textContent)`);
  check('no match says so, with the way round it', /No match for “Qxzvbn”\. Try a nearby town, or paste coordinates\./.test(await js(`document.querySelector('#mapxPlaceRes').textContent`)));
  await withPlaces('down');
  await js(`localStorage.removeItem('crophalo.places.v1'); document.querySelector('#mapxPlaceQ').value = 'Anything'; document.querySelector('#mapxPlaceForm').requestSubmit()`);
  await until(`/not answering/.test(document.querySelector('#mapxPlaceRes').textContent)`);
  check('a service that is down is said so', /The place search is not answering right now\. You can paste coordinates instead\./.test(await js(`document.querySelector('#mapxPlaceRes').textContent`)));
  // the pin and the outline can be shown now
  await js(`document.querySelector('.mapx-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  check('Escape closes the panel and focus goes back to its button', await js(`!document.querySelector('.mapx-panel') && document.activeElement.dataset.panel === 'places'`));
  await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`);
  // an outline makes the second row available and says its area
  const c = await centre(); await tool('rect'); await drag({ x: c.x - 80, y: c.y - 50 }, { x: c.x + 80, y: c.y + 50 });
  await until(`document.querySelector('.spot')`);
  await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`);
  check('opening Places closes the spot card: one panel at a time', await js(`!document.querySelector('.spot')`));
  // a press outside closes the panel, and the tap that follows does not move the pin
  const before = (await state()).pin;
  await tapAt(c.x - 200, c.y + 120); await sleep(500);   // left of the panel, which now holds three demo rows and reaches further down
  check('a click outside closes the panel and does not also move the pin', !(await panelOpen()) && JSON.stringify((await state()).pin) === JSON.stringify(before), [before, (await state()).pin]);
  await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`);
  await js(`import('/js/mapx.js').then(m => m.openAbout())`); await sleep(300);
  check('and the card closes the panel the other way round', !(await panelOpen()) && await js(`!!document.querySelector('.spot')`));
});

const GIBS_DOMAINS = Object.fromEntries(['MODIS_Terra_NDVI_8Day', 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture', 'IMERG_Precipitation_Rate', 'MODIS_Terra_Land_Surface_Temp_Day'].map(id => [id, domains(id)]));
const layerRows = () => js(`[...document.querySelectorAll('#mapxLayerRows .mapx-lrow')].map(r => [r.querySelector('b').textContent, r.querySelector('input').disabled, r.querySelector('input').checked, r.querySelector('.cap').textContent])`);   // the rows of the "NASA data" group; the Terrain analysis group has its own suite (e2e_terrain.mjs)
await group('nasapic', async () => {
  await mapReady();
  const DOM = { S30: domains('HLS_S30_Nadir_BRDF_Adjusted_Reflectance'), L30: domains('HLS_L30_Nadir_BRDF_Adjusted_Reflectance') };
  const stub = (clearDays, mode = 'days') => js(`import('/js/nasabase.js').then(n => { const DOM = ${JSON.stringify(DOM)}, CLEAR = ${JSON.stringify(clearDays)}; n.net.today = () => '${D('20261115')}';
    n.net.text = url => Promise.resolve(url.includes('HLS_S30') ? DOM.S30 : url.includes('HLS_L30') ? DOM.L30 : '<Domain></Domain>');
    n.net.look = async url => { const day = /default\\/(\\d{4}-\\d{2}-\\d{2})\\//.exec(url)[1]; return '${mode}' === 'cloud' ? { n: 100, empty: 0, bright: 60 } : CLEAR.includes(day) ? { n: 100, empty: 0, bright: 2 } : { n: 1, empty: 1, bright: 0 }; };
    n.resetPicks(); return 1; })`);
  const goClose = () => js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([43.13, -80.75], 13, { animate: false }) && 1)`);
  const picText = () => js(`document.querySelector('#mapxPicText').textContent`);
  await js(`document.querySelector('[data-base=sat]').click()`);
  check('the newest picture is off at first and its date bar is hidden', await js(`import('/js/mapbase.js').then(m => m.baseNow().newest() === false && document.querySelector('#mapxPic').hidden !== undefined)`));
  await js(`import('/js/mapbase.js').then(m => m.baseNow().setNewest(true) && 1)`);
  await stub([D('20261105'), D('20261101')]);
  await goClose();
  await until(`/HLS picture/.test(document.querySelector('#mapxPicText').textContent)`, 15000);
  check('zoomed in, the newest clear day is chosen at run time and said on the map with its satellite and size', /^NASA HLS picture, 5 Nov\w+ 2026 [(]newest clear day[)], 30 m: edges are approximate$/.test(await picText()), await picText());
  check('the 30 m picture is drawn over the coarse one, from NASA GIBS, for that day', await js(`[...document.querySelectorAll('.leaflet-tile-pane img')].some(i => /HLS_(S30|L30)_Nadir.*${D('20261105')}.*GoogleMapsCompatible_Level12/.test(i.src))`));
  check('the credit names the picture and its day', /HLS (Sentinel-2|Landsat 8 and 9) 30 m, 5 Nov\w+ 2026/.test(await js(`document.querySelector('#mapxCredit').textContent`)));
  await js(`document.querySelector('[data-pic=earlier]').click()`);
  await until(`/1 Nov[a-z]+ 2026/.test(document.querySelector('#mapxPicText').textContent)`, 15000);
  check('Earlier goes to the next clear day before it and says it is an earlier day', /1 Nov\w+ 2026 [(]an earlier clear day[)]/.test(await picText()), await picText());
  await js(`document.querySelector('[data-pic=earlier]').click()`);
  await until(`!document.querySelector('[data-pic=earlier]').disabled`, 15000);
  check('with none earlier it says so and keeps the picture', /1 Nov\w+ 2026/.test(await picText()), await picText());
  await js(`document.querySelector('[data-pic=newest]').click()`);
  await until(`/5 Nov[a-z]+ 2026/.test(document.querySelector('#mapxPicText').textContent)`, 15000);
  check('Newest comes back to the newest clear day', /5 Nov\w+ 2026/.test(await picText()), await picText());
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([43.13, -80.75], 6, { animate: false }) && 1)`);
  await until(`/MODIS picture/.test(document.querySelector('#mapxPicText').textContent)`, 8000);
  check('zoomed out the coarse MODIS picture is named, with no Earlier and Newest', /^NASA MODIS picture \(250 m\)/.test(await picText()) && await js(`document.querySelector('.mapx-pic-b').hidden`));
  // a cloudy spell: the least cloudy day, said to be cloudy
  await stub([], 'cloud');
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([44.5, -79.9], 13, { animate: false }) && 1)`);
  await until(`/partly cloudy/.test(document.querySelector('#mapxPicText').textContent)`, 15000);
  check('only cloudy days: the least cloudy one is shown and called partly cloudy, with a sentence under the bar', /partly cloudy/.test(await picText()) && /cloudy/.test(await baseNote()), await baseNote());
  // no picture at all of this place: the coarse picture stays and the sentence says it
  await stub([]);
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([45.5, -78.9], 13, { animate: false }) && 1)`);
  await until(`/no clear 30 m picture/.test(document.querySelector('#mapxBaseNote').textContent)`, 15000);
  check('no clear HLS picture in six days: MODIS stays, said in words', /^NASA MODIS picture/.test(await picText()) && /MODIS picture shows/.test(await baseNote()), await baseNote());
  await js(`import('/js/mapbase.js').then(m => m.baseNow().setNewest(false) && 1)`);
  check('switched off again, Earlier and Newest go and the credit no longer says "Newest picture" (the harness cuts the clean tiles, so the daily picture\'s own date stays as the stand-in)', await js(`document.querySelector('.mapx-pic-b').hidden && !/Newest picture/.test(document.querySelector('#mapxCredit').textContent)`));
  check('still no map tile request to Esri', !run.cutOff.some(c => /arcgis|esri/i.test(c.where) && /\/tile\//.test(c.where)));
});

await group('anim', async () => {
  await mapReady();
  const CM = Object.fromEntries(['MODIS_NDVI'].map(n => [n, fs.readFileSync(path.join(ROOT, 'scripts/fixtures/gibs', `colormap_${n}.xml`), 'utf8')]));
  const setup = (pixel = [154, 110, 89, 255]) => js(`import('/js/maplayers.js').then(m => { const D = ${JSON.stringify(GIBS_DOMAINS)}, CM = ${JSON.stringify(CM)}; m.net.text = url => Promise.resolve(D[/LAYER=([A-Za-z0-9_]+)/.exec(url)[1]]); m.net.tile = () => Promise.resolve(); m.net.today = () => '${D('20261115')}';
    m.net.colormap = url => Promise.resolve(CM[/colormaps[/]v1.3[/]([A-Za-z0-9_]+)[.]xml/.exec(url)[1]]); m.net.pixel = () => Promise.resolve(${JSON.stringify(pixel)}); m.resetLayers(); return import('/js/layeranim.js').then(a => { a.PLAY.holdMs = 120; a.PLAY.holdMaxMs = 120; a.PLAY.budgetMs = 0; a.PLAY.holdLessMs = 60; a.PLAY.fadeMs = 60; a.PLAY.loadWaitMs = 200; return m.layersCtl().probe(true); }); })`);
  await setup();
  await js(`document.documentElement.dataset.motion = ''`);
  await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('.mapx-panel') && [...document.querySelectorAll('.mapx-lrow input')].slice(0, 4).every(i => !i.disabled)`, 8000);
  await js(`document.querySelector('[data-layer=ndvi]').click()`); await until(`document.querySelector('[data-legend=ndvi]')`);
  await until(`document.querySelector('[data-here=ndvi]') && !/reading/.test(document.querySelector('[data-here=ndvi]').textContent)`, 6000);
  const here = () => js(`document.querySelector('[data-here=ndvi]').textContent`);
  check('without a pin there is no value, said plainly with what to do', /^No value for your pin: drop a pin first\.$/.test(await here()), await here());
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 43.13, lon: -80.75, name: 'Oxford', country: 'CA' } }))`); await sleep(700);
  await js(`document.dispatchEvent(new CustomEvent('crophalo:prefetch', { detail: { lat: 43.13, lon: -80.75 } }))`);
  await until(`/0\\.28/.test(document.querySelector('[data-here=ndvi]').textContent)`, 6000);
  check('with a pin the value at the field is read from NASA\'s colormap and said with its day', /^Greenness here: 0\.28 · \d{1,2} [A-Z][a-z]{2}$/.test(await here()), await here());
  check('the marker stands on the bar where that colour is', await js(`(() => { const m = document.querySelector('[data-mark=ndvi]'); return !m.hidden && /%$/.test(m.style.left) && parseFloat(m.style.left) > 0 && parseFloat(m.style.left) < 100; })()`));
  // a colour that is not in the colormap is never guessed
  await setup([1, 2, 3, 255]); await js(`import('/js/maplayers.js').then(m => m.layersCtl().readHere('ndvi'))`);
  await until(`/No value for your pin/.test(document.querySelector('[data-here=ndvi]').textContent)`, 6000);
  check('a colour NASA does not list has no value, and the marker goes', /No value for your pin: no image at the pin on this day\./.test(await here()) && await js(`document.querySelector('[data-mark=ndvi]').hidden`), await here());
  await setup();
  // the time-lapse
  const label = () => js(`document.querySelector('[data-play=ndvi]').textContent`);
  const day = () => js(`document.querySelector('[data-date=ndvi]').value`);
  const first = await day();
  check('the Play button says what it plays', /^Play the last (30 days|\d images)$/.test(await label()), await label());
  await js(`document.querySelector('[data-play=ndvi]').click()`);
  await until(`document.querySelector('[data-play=ndvi]').textContent === 'Pause'`, 3000);
  const seen = new Set([await day()]);
  const end = Date.now() + 15000; while (Date.now() < end && await js(`import('/js/maplayers.js').then(m => m.layersCtl().playing('ndvi'))`)) { seen.add(await day()); await sleep(40); }
  check('the lapse steps through several of NASA\'s real days and stops by itself after one pass', seen.size >= 3 && !(await js(`import('/js/maplayers.js').then(m => m.layersCtl().playing('ndvi'))`)) && /^Play/.test(await label()), [...seen]);
  check('it ends on the newest image, and the date in the legend shows it', (await day()) === await js(`import('/js/gibs.js').then(g => { const m = document.querySelector('[data-date=ndvi]'); return m.max; })`), await day());
  // Pause
  await setup(); await js(`document.querySelector('[data-legend=ndvi] [data-newest]').click()`); await sleep(100);
  await js(`document.querySelector('[data-play=ndvi]').click()`); await sleep(200);
  await js(`document.querySelector('[data-play=ndvi]').click()`); await sleep(100);
  check('Pause stops it where it is and the button offers Play again', !(await js(`import('/js/maplayers.js').then(m => m.layersCtl().playing('ndvi'))`)) && /^Play/.test(await label()));
  // Less: no fade layers; Still: nothing by itself
  await js(`document.documentElement.dataset.motion = 'less'`);
  await js(`document.querySelector('[data-play=ndvi]').click()`); await sleep(150);
  check('under Less it steps without a fade (no cross-fade layer is ever made)', await js(`!document.querySelector('.mapx-xfade')`));
  await js(`import('/js/maplayers.js').then(m => m.layersCtl().stopPlay('ndvi'))`);
  await js(`document.documentElement.dataset.motion = 'reduce'`); await js(`import('/js/maplayers.js').then(m => m.layersCtl().stopPlay('ndvi'))`);
  await js(`document.querySelector('[data-legend=ndvi] [data-newest]').click()`); await sleep(200);
  check('under Still it plays nothing by itself: the button is off and says why, Earlier and Later still step', await js(`(() => { const b = document.querySelector('[data-play=ndvi]'); return b.disabled && /Still/.test(b.title); })()`));
  const before = await day(); await js(`document.querySelector('[data-legend=ndvi] [data-step="-1"]').click()`); await sleep(200);
  check('Earlier steps one image under Still', (await day()) < before, [before, await day()]);
  await js(`document.documentElement.dataset.motion = ''`);
  await js(`document.querySelector('[data-legend=ndvi] [data-off]').click()`);
  // fires: in order, a halo on the newest few, the count in view
  const pts = Array.from({ length: 8 }, (_, i) => ({ lat: 43.1 + i * 0.01, lon: -80.75 + i * 0.01, time: `2026-11-15T0${i}:00:00Z`, frp: 5 + i, confidence: i % 3 ? 'nominal' : 'high', satellite: 'NOAA-20', night: false }));
  await js(`import('/js/maplayers.js').then(m => { m.net.fires = () => Promise.resolve(${JSON.stringify({ ok: true, count: 8, shown: 8, newest: '2026-11-15T07:00:00Z', points: pts })}); })`);
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([43.13, -80.7], 11, { animate: false }) && 1)`);
  await js(`document.querySelector('[data-layer=fires]').click()`); await until(`document.querySelector('[data-legend=fires]')`);
  const fireCount = () => js(`document.querySelector('[data-fcount]').textContent`);
  await until(`/spots? in view/.test(document.querySelector('[data-fcount]').textContent)`, 6000);
  check('the legend counts the hot spots in view for the last 24 h', /^8 hot spots in view in the last 24 h$/.test(await fireCount()), await fireCount());
  const early = await js(`[...document.querySelectorAll('path.mapx-fire')].filter(p => parseFloat(getComputedStyle(p).fillOpacity) > 0.3).length`);
  await sleep(3400);
  const late = await js(`[...document.querySelectorAll('path.mapx-fire')].filter(p => parseFloat(getComputedStyle(p).fillOpacity) > 0.3).length`);
  check('in Full the spots fade in one after another, in the order they were seen (not all at once)', early < 8 && late === 8, [early, late]);
  check('the newest five get a halo that rings, three times only', await js(`document.querySelectorAll('path.mapx-firehalo.ring').length === 5 && getComputedStyle(document.querySelector('path.mapx-firehalo.ring')).animationIterationCount === '3'`));
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([60, 10], 9, { animate: false }) && 1)`); await sleep(500);
  check('the count follows the view: none in view says so', /^No hot spot was detected in view in the last 24 h$/.test(await fireCount()), await fireCount());
  await js(`document.querySelector('[data-legend=fires] [data-off]').click()`);
  await js(`document.documentElement.dataset.motion = 'less'`);
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([43.13, -80.7], 11, { animate: false }) && 1)`);
  await js(`document.querySelector('[data-layer=fires]').click()`); await until(`document.querySelector('[data-legend=fires]') && document.querySelectorAll('path.mapx-fire').length === 8`, 6000);
  check('under Less every spot is there at once, the halos are still (no ring)', await js(`document.querySelectorAll('path.mapx-fire').length === 8 && document.querySelectorAll('path.mapx-firehalo').length === 5 && !document.querySelector('path.mapx-firehalo.ring')`));
  await js(`document.querySelector('[data-legend=fires] [data-off]').click(); document.documentElement.dataset.motion = ''`);
});

await group('demofield', async () => {
  await mapReady();
  const ALL = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/regions.json'), 'utf8')), R = ALL.find(r => r.outline);
  await js(`window.__areas = []; document.addEventListener('crophalo:area', e => window.__areas.push(e.detail))`);
  if (!R) {   // the regions file holds no field outline yet: a region opens as it always has, a pin and no outline
    const P = ALL[0];
    await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: ${P.lat}, lon: ${P.lon}, name: ${JSON.stringify(P.name)}, country: ${JSON.stringify(P.country ?? '')}, demo: true } }))`); await sleep(1500);
    check('a region without an outline opens with its pin and no outline drawn', await js(`import('/js/mapx.js').then(m => { const s = m.mapState(); return !!s.pin && Math.abs(s.pin.lat - ${P.lat}) < 1e-6 && !s.ring && !window.__areas.some(a => a && a.pts); })`));
    return;
  }
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: ${R.lat}, lon: ${R.lon}, name: ${JSON.stringify(R.name)}, country: ${JSON.stringify(R.country ?? '')}, demo: true } }))`);
  await until(`window.__areas.some(a => a && a.pts && a.pts.length > 3)`, 8000);
  const a = await js(`window.__areas.find(a => a && a.pts)`);
  check('opening the demo field draws its outline and puts it in use, with its real hectares (not an estimate)', Math.abs(a.ha - R.area_ha) < 0.2 && a.pts.length === R.outline.length - 1, a.ha);
  check('the pin is at the field\'s centre and the outline is on the map', await js(`import('/js/mapx.js').then(m => { const s = m.mapState(); return Math.abs(s.pin.lat - ${R.lat}) < 1e-6 && Math.abs(s.pin.lon - ${R.lon}) < 1e-6 && !!s.ring && !!document.querySelector('path.mapx-core'); })`));
  check('the drawing tools stay on offer while an outline is in use, and Change field is there', await js(`[...document.querySelectorAll('.mapx-seg button')].every(b => !b.disabled) && !!document.querySelector('#mapxChange')`));
  await js(`import('/js/mapx.js').then(m => m.openAbout())`); await until(`document.querySelector('.spot')`, 6000);
  await js(`[...document.querySelectorAll('.spot [role=tab], .spot button')].find(b => /^Area/i.test(b.textContent.trim()))?.click()`); await sleep(400);
  const spotText = await js(`document.querySelector('.spot').innerText`);
  check('the Area card has the real area of the outline (hectares or acres)', /\b(ha|acres?|ac)\b|hectare/i.test(spotText) && [Math.floor(R.area_ha), Math.floor(R.area_ha * 2.47105)].some(n => new RegExp(`\\b${n}(\\.\\d)?\\b`).test(spotText)), spotText.slice(0, 300));
});

await group('demofield4', async () => {
  // the way the home opens a demo field: the wizard keeps the pin to 4 decimals (the data holds 6) and tells the map: the outline is still found, drawn and in use, and the wizard's area is the outline's own.
  // With the region's id in the event the coordinates need not match at all (the id is added to the event by the setup).
  const ALL = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/regions.json'), 'utf8')), R = ALL.find(r => r.outline && String(r.lat).split('.')[1]?.length > 4);
  if (!R) return;
  await mapReady();
  await js(`window.__areas = []; window.__outlines = []; document.addEventListener('crophalo:area', e => window.__areas.push(e.detail)); document.addEventListener('crophalo:outline', e => window.__outlines.push(e.detail))`);
  await js(`import('/js/wizard.js').then(m => m.setPlace({ lat: ${R.lat}, lon: ${R.lon}, name: ${JSON.stringify(R.name)}, country: ${JSON.stringify(R.country ?? '')}, demo: true }))`);
  await until(`window.__areas.some(a => a && a.pts && a.pts.length > 3)`, 8000).catch(() => {});
  const a = await js(`window.__areas.find(a => a && a.pts) ?? null`);
  check('the setup opens a demo field (its pin rounded to 4 decimals, no id): the outline is found, drawn and put in use, with its own hectares', !!a && Math.abs(a.ha - R.area_ha) < 0.2, a && a.ha);
  check('the setup hears crophalo:outline with used true', await js(`window.__outlines.some(o => o && o.used === true && o.ring?.length > 3)`));
  check('the area under the setup is the outline\'s own, not an estimate', await js(`import('/js/wizard.js').then(m => { const ar = m.currentState().area; return !!ar && Math.abs(ar.ha - ${R.area_ha}) < 0.2; })`));
  await mapReady();
  await js(`window.__areas = []; window.__outlines = []; document.addEventListener('crophalo:area', e => window.__areas.push(e.detail)); document.addEventListener('crophalo:outline', e => window.__outlines.push(e.detail))`);
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: ${R.lat + 0.003}, lon: ${R.lon + 0.003}, region: ${JSON.stringify(R.id)}, name: ${JSON.stringify(R.name)}, country: ${JSON.stringify(R.country ?? '')}, demo: true } }))`);
  await until(`window.__areas.some(a => a && a.pts && a.pts.length > 3)`, 8000).catch(() => {});
  const b = await js(`window.__areas.find(a => a && a.pts) ?? null`);
  check('with its id and coordinates a few hundred metres off the outline is found, drawn and put in use', !!b && Math.abs(b.ha - R.area_ha) < 0.2 && await js(`window.__outlines.some(o => o && o.used === true)`), b && b.ha);
});

await group('usstart', async () => {
  for (const w of [1280, 390]) {
    await size(w); await mapReady();
    const c = await js(`import('/js/mapbase.js').then(m => { const map = m.baseNow().leaflet(), c = map.getCenter(), b = map.getBounds(); return { lat: c.lat, lon: c.lng, z: map.getZoom(), all48: b.contains([24.5, -125]) && b.contains([49.4, -66.9]) && b.contains([24.5, -66.9]) && b.contains([49.4, -125]) }; })`);
    check(`with no place chosen the map opens on the United States at ${w} px: the centre is within 2 degrees of 39.8 N, 98.6 W`, Math.abs(c.lat - 39.8) <= 2 && Math.abs(c.lon + 98.6) <= 2, c);
    check(`and the whole lower 48 is in view at ${w} px (the zoom is ${c.z})`, c.all48 === true, c);
  }
  await size(390); await mapReady();
  check('the credit is words in the foot of the map, at 12 px or more, and every link in it opens in a new tab', await js(`(() => { const c = document.querySelector('#mapxCredit'); return c.textContent.length > 10 && parseFloat(getComputedStyle(c).fontSize) >= 12 && [...c.querySelectorAll('a')].every(a => a.target === '_blank' && /noopener/.test(a.rel)); })()`));
  await size(1280);
});

await group('busy', async () => {
  await mapReady();
  const DOMS = { ndvi: domains('MODIS_Terra_NDVI_8Day'), rain: domains('IMERG_Precipitation_Rate') };
  const stub = () => js(`import('/js/maplayers.js').then(m => { const D = ${JSON.stringify(DOMS)}; m.net.text = url => Promise.resolve(D[/LAYER=([A-Za-z0-9_]+)/.exec(url)[1] === 'MODIS_Terra_NDVI_8Day' ? 'ndvi' : 'rain']); m.net.tile = () => Promise.resolve(); m.net.today = () => '${D('20261115')}'; m.resetLayers(); return m.layersCtl().probe(true); })`);
  const slow = ms => js(`(() => { if (!window.__createTile) window.__createTile = L.TileLayer.prototype.createTile; L.TileLayer.prototype.createTile = function (coords, done) { const t = document.createElement('div'); setTimeout(() => done(null, t), ${ms}); return t; }; })()`);
  await js(`window.__log = []; const el = document.querySelector('#mapxBusy'); new MutationObserver(() => window.__log.push([Math.round(performance.now()), el.hidden ? 'hid' : 'shown'])).observe(el, { attributes: true, attributeFilter: ['hidden'] });`);
  const shown = () => js(`!document.querySelector('#mapxBusy').hidden`);
  await stub(); await slow(1800);
  await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('.mapx-panel') && [...document.querySelectorAll('.mapx-lrow input')].slice(0, 4).every(i => !i.disabled)`, 8000);
  const t0 = await js(`performance.now()`); await js(`document.querySelector('[data-layer=ndvi]').click()`); await sleep(220);
  check('with the tiles slowed, turning a layer on shows the loading sign within a fifth of a second', await shown());
  check('the sign is the house one (the turning ring) with words, and a screen reader is told', await js(`!!document.querySelector('#mapxBusy .dot.busy') && /Loading the map/.test(document.querySelector('#mapxBusy').textContent) && document.querySelector('#mapxBusy').getAttribute('role') === 'status'`));
  await until(`document.querySelector('#mapxBusy').hidden`, 25000);
  check('and it goes when the tiles are drawn', !(await shown()));
  // Earlier / Newest picture
  await js(`document.querySelector('[data-legend=ndvi] [data-step="-1"]').click()`); await sleep(220);
  check('an earlier picture shows the sign too', await shown());
  await until(`document.querySelector('#mapxBusy').hidden`, 25000);
  // Satellite to Light
  await js(`document.querySelector('[data-base=light]').click()`); await sleep(220);
  // the harness refuses the detailed tiles at once (a request that FAILS): the sign must go within a second and a half of the press and the two-sentence note says why; only a request that hangs may keep it (the unit suite checks the 8 s words and the limit)
  await js(`window.__lightAt = performance.now()`); await until(`document.querySelector('#mapxBusy').hidden && /did not load/.test(document.querySelector('#mapxBaseNote').textContent)`, 17000).catch(() => {});   // the harness's refused requests raise no error event in MapLibre, so the page's own 15 s stall limit (STALL_MS) is what says so: the sign must be gone, with the note, once that limit has passed
  check('refused: the sign is gone once the 15 second limit has passed, and the note says why', (await shown()) === false && /did not load/.test(await baseNote()), await baseNote());
  // quick work never flashes: tiles that come at once, a layer turned on and off
  await js(`document.querySelector('[data-base=sat]').click()`); await js(`document.querySelector('[data-legend=ndvi] [data-off]')?.click()`);
  await until(`document.querySelector('#mapxBusy').hidden`, 25000);
  await slow(0); await js(`window.__log.length = 0`);
  await js(`document.querySelector('[data-layer=rain]').click()`); await sleep(1500);
  const quick = await js(`window.__log.filter(l => l[1] === 'shown').length`);
  check('tiles that come at once never flash the sign', quick === 0, await js(`window.__log`));
  await js(`L.TileLayer.prototype.createTile = window.__createTile`);
});

await group('smapsouth', async () => {
  await mapReady();
  const DOMS = { smap: domains('SMAP_L4_Analyzed_Root_Zone_Soil_Moisture') };
  await js(`import('/js/maplayers.js').then(m => { const D = ${JSON.stringify(DOMS)}; m.net.text = () => Promise.resolve(D.smap); m.net.tile = () => Promise.resolve(); m.net.today = () => '${D('20261115')}'; m.resetLayers(); return m.layersCtl().probe(true); })`);
  await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('.mapx-panel') && [...document.querySelectorAll('.mapx-lrow input')].slice(0, 4).every(i => !i.disabled)`, 8000);
  await js(`document.querySelector('[data-layer=smap]').click()`); await until(`document.querySelector('[data-legend=smap]')`);
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([-75, 20], 5, { animate: false }) && 1)`); await sleep(600);
  check('south of 55.7 S the soil moisture legend says NASA has no picture there', /NASA has no soil moisture picture south of 55\.7° S\./.test(await js(`document.querySelector('[data-lnote=smap]').textContent`)), await js(`document.querySelector('[data-lnote=smap]').textContent`));
  check('and the layer asks for no tile there', await js(`[...document.querySelectorAll('.leaflet-tile-pane img')].filter(i => /SMAP_L4/.test(i.src)).length === 0`));
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([44, -80], 6, { animate: false }) && 1)`); await sleep(600);
  check('back north the warning goes', !/no soil moisture picture south/.test(await js(`document.querySelector('[data-lnote=smap]').textContent`)));
});

await group('noprobe', async () => {
  const cut0 = run.cutOff.length;   // only what this group's own page asked
  await mapReady();
  await sleep(4000);   // longer than the old first probe (1.5 s) and the 9 s limit is not needed: the requests are made at once or not at all
  const asked = run.cutOff.slice(cut0).filter(c => /MODIS_Terra_NDVI_8Day|SMAP_L4_Analyzed|IMERG_Precipitation_Rate|MODIS_Terra_Land_Surface_Temp/.test(c.where));
  check('the NASA layers are not probed while the Layers panel is closed: no date list and no world tile of any of the four', asked.length === 0, asked.map(a => a.where));
  await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('.mapx-panel')`); await sleep(2500);
  check('opening the Layers panel probes them (their own date lists are asked then)', run.cutOff.some(c => /MODIS_Terra_NDVI_8Day/.test(c.where)));
});

await group('keepmap', async () => {
  await acceptWelcome(); await go('/');
  await until(`!/^a demo field$/.test(document.querySelector('#tryRegion')?.textContent || 'a demo field')`, 15000);
  await js(`document.querySelector('#tryRegion').click()`); await until(`document.querySelector('#mapx')`, 15000);
  await js(`import('/js/mapbase.js').then(m => { window.__m1 = m.baseNow().leaflet(); window.__box = document.querySelector('#mapx'); })`);
  await sleep(500);
  for (let i = 0; i < 3; i++) { await js(`(() => { const b = document.querySelector('#wNext'); if (b && !b.disabled) b.click(); })()`); await sleep(900); }
  check('through the demo\'s steps the same map is kept: one map was built, the same Leaflet map and the same box are in the new step', await js(`import('/js/mapx.js').then(x => import('/js/mapbase.js').then(m => x.mounts === 1 && m.baseNow().leaflet() === window.__m1 && document.querySelector('#mapx') === window.__box && !!document.querySelector('#setupMap #mapx')))`));
  check('and the kept map still has its size and its credit', await js(`(() => { const r = document.querySelector('#mapx').getBoundingClientRect(); return r.width > 100 && r.height > 60 && !!document.querySelector('#mapxCredit').textContent; })()`));
});

const openLayers = async () => { await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('.mapx-panel')`); };
await group('layers', async () => {
  await mapReady();
  same('the top right holds Places and Layers, both closed', await js(`[...document.querySelectorAll('.mapx-pbtn')].map(b => b.textContent.trim() + ':' + b.getAttribute('aria-expanded'))`), ['Places:false', 'Layers:false']);
  // with every outside service cut off, every layer fails its check and is greyed, with the reason in words
  await sleep(2200);
  await openLayers();
  await until(`[...document.querySelectorAll('.mapx-lrow input')].slice(0, 4).every(i => i.disabled)`, 15000);
  same('with NASA\'s image server out of reach the four picture rows are disabled and say so', (await layerRows()).slice(0, 4).map(r => [r[1], r[3]]), Array(4).fill([true, 'Not available right now: NASA\'s image server did not answer']));
  check('the panel names its four picture layers, the water storage and the fires, in the owner\'s order, under "NASA data"', (await layerRows()).map(r => r[0]).join() === 'Plant greenness,Soil moisture,Rain rate,Land temperature,Regional water storage,Fires and hot spots' && /NASA data/.test(await js(`document.querySelector('.mapx-lset legend').textContent`)));
  check('the water storage and the fires are not greyed by the picture check (they come from our own server)', (await layerRows()).slice(4).every(r => r[1] === false));
  check('"Turn all overlays off" is off while nothing is on, and the button still says Layers', await js(`document.querySelector('[data-alloff]').disabled && document.querySelector('[data-panel=layers] .mapx-w').textContent === 'Layers'`));
  // NASA answers (made-up transport, real answers recorded for the test): the rows come on
  await js(`import('/js/maplayers.js').then(m => { const D = ${JSON.stringify(GIBS_DOMAINS)}; m.net.text = url => Promise.resolve(D[/LAYER=([A-Za-z0-9_]+)/.exec(url)[1]]); m.net.tile = () => Promise.resolve(); m.net.today = () => '2026-11-15'; m.resetLayers(); return m.layersCtl().probe(true); })`);
  await js(`document.querySelector('.mapx-pclose').click()`); await openLayers();
  await until(`[...document.querySelectorAll('.mapx-lrow input')].every(i => !i.disabled)`, 8000);
  same('then all six are on offer, each with what the farmer sees on the second line (the instrument and the size sit under Show more)', (await layerRows()).map(r => [r[1], r[3]]), [[false, 'How green the plants are.'], [false, 'How wet the soil is.'], [false, 'How much rain or snow fell.'], [false, 'How hot the ground was.'], [false, 'Water stored across a wide region.'], [false, 'Very hot spots seen by satellites.']]);
  await js(`document.querySelector('[data-layer=smap]').click()`); await until(`document.querySelector('[data-legend=smap]')`);
  const legend = await js(`document.querySelector('[data-legend=smap]').innerText.replace(/\\n+/g, ' | ')`);
  check('Soil moisture is on: its legend names the NASA product, the colour ends and the day of the image', /Soil moisture/.test(legend) && /0 · dry/.test(legend) && /0\.7\+ · saturated/.test(legend) && new RegExp('Image of ' + J('10', 'November', '2026')).test(legend), legend);
  await js(`document.querySelector('[data-layer=smap]').focus(); 1`); await press(' ');   // by the keyboard: Space on the row's box
  check('Space on a row turns its layer on, and the focus stays on that row while the rows are drawn again', await js(`document.activeElement?.dataset.layer === 'smap' && document.activeElement.checked`), await js(`document.activeElement?.outerHTML.slice(0, 80)`));
  check('the legend has a source "i" for NASA GIBS, and the colour bar is a real gradient', await js(`!!document.querySelector('[data-legend=smap] .srci.nasa') && /linear-gradient/.test(document.querySelector('[data-legend=smap] .mapx-bar').style.background)`));
  check('the tiles are asked of NASA\'s server for that layer and that day', await js(`[...document.querySelectorAll('.leaflet-tile-pane img')].some(i => /SMAP_L4_Analyzed_Root_Zone_Soil_Moisture\\/default\\/${D('20261110')}\\/GoogleMapsCompatible_Level6/.test(i.src))`));
  same('the button says what is on, in the accent', await js(`[document.querySelector('[data-panel=layers] .mapx-w').textContent, document.querySelector('[data-panel=layers]').classList.contains('has-on')]`), ['Soil moisture', true]);
  // the date row
  await js(`document.querySelector('[data-legend=smap] [data-step="-1"]').click()`);
  same('Earlier image goes to the day before', await js(`document.querySelector('[data-legend=smap] [data-date]').value`), D('20261109'));
  await js(`document.querySelector('[data-legend=smap] [data-newest]').click()`);
  same('Newest comes back to the newest day NASA has, which is not after yesterday', await js(`document.querySelector('[data-legend=smap] [data-date]').value`), D('20261110'));
  check('there is no later image than the newest, said in words', await js(`(() => { document.querySelector('[data-legend=smap] [data-step="1"]').click(); return document.querySelector('[data-legend=smap] [data-date]').value === '${D('20261110')}'; })()`));
  await js(`{ const i = document.querySelector('[data-legend=smap] [data-date]'); i.value = '${D('20251101')}'; i.dispatchEvent(new Event('input', { bubbles: true })); }`);
  check('a typed date is applied a moment after the last digit, not at once', await js(`document.querySelector('[data-legend=smap] [data-day]').textContent === 'Image of ${J('10', 'November', '2026')}'`));
  await until(`document.querySelector('[data-legend=smap] [data-day]').textContent === 'Image of ${J('9', 'October', '2025')}'`, 4000);
  same('a day with no image snaps to the nearest day NASA has, and says so', await js(`document.querySelector('[data-legend=smap] [data-snap]').textContent`), `NASA has no image for ${J('1', 'November', '2025')}. Showing ${J('9', 'October', '2025')}, the nearest day it has.`);
  // opacity: each layer keeps its own; the layer turned on last is on top
  await js(`{ const r = document.querySelector('[data-legend=smap] [data-op]'); r.value = '40'; r.dispatchEvent(new Event('input', { bubbles: true })); }`);
  check('the opacity slider changes the tiles', await js(`[...document.querySelectorAll('.leaflet-tile-pane .leaflet-layer')].some(l => l.style.opacity === '0.4')`));
  await js(`document.querySelector('[data-layer=rain]').click()`); await until(`document.querySelector('[data-legend=rain]')`);
  same('the next layer starts at its own 75, and moving the first layer\'s slider did not move it', await js(`[document.querySelector('[data-legend=rain] [data-op]').value, document.querySelector('[data-legend=smap] [data-op]').value]`), ['75', '40']);
  await js(`{ const r = document.querySelector('[data-legend=rain] [data-op]'); r.value = '90'; r.dispatchEvent(new Event('input', { bubbles: true })); }`);
  check('moving the second layer\'s slider changes only the second: the first keeps 40, the second is 90 on the map', await js(`document.querySelector('[data-legend=smap] [data-op]').value === '40' && document.querySelector('[data-legend=rain] [data-op]').nextElementSibling.textContent === '90%' && [...document.querySelectorAll('.leaflet-tile-pane .leaflet-layer')].some(l => l.style.opacity === '0.9') && [...document.querySelectorAll('.leaflet-tile-pane .leaflet-layer')].some(l => l.style.opacity === '0.4')`));
  same('two layers: the button says so, and the one turned on last is drawn on top', await js(`(() => { const z = id => +[...document.querySelectorAll('.leaflet-tile-pane .leaflet-layer')].find(l => l.querySelector('img')?.src.includes(id))?.style.zIndex; return [document.querySelector('[data-panel=layers] .mapx-w').textContent, z('IMERG') > z('SMAP_L4')]; })()`), ['2 layers', true]);
  // no picture came for the view: the legend says why in words, never a blank, and never "NASA has no image" for no answer at all (a farmer would think NASA has no data for the field when only the connection failed)
  const rainNote = () => js(`document.querySelector('[data-legend=rain] [data-lnote]').textContent`);
  await until(`/did not answer/.test(document.querySelector('[data-legend=rain] [data-lnote]').textContent)`, 8000).catch(() => {});
  same('the harness cuts the tiles off (no answer at all), so the legend says NASA\'s image server did not answer, not that NASA has no image', await rainNote(), 'Not available right now: NASA\'s image server did not answer. Try again later.');
  await js(`(() => { window.__realFetch ??= window.fetch; window.fetch = (u, o) => /gibs\\.earthdata\\.nasa\\.gov\\/wmts/.test(String(u)) ? Promise.resolve(new Response('', { status: 404 })) : window.__realFetch(u, o); return 1; })()`);   // NASA's own answer for a day it has no picture of
  await js(`document.querySelector('[data-legend=rain] [data-step="-1"]').click()`);
  await until(`/no image for this part/.test(document.querySelector('[data-legend=rain] [data-lnote]').textContent)`, 8000).catch(() => {});
  same('when NASA answers that it has no picture there (404), the legend says NASA has no image for this part of the map on this date', await rainNote(), 'NASA has no image for this part of the map on this date. Try another date or move the map.');
  await js(`window.fetch = window.__realFetch; 1`);
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await js(`document.querySelector('[data-legend=rain] [data-step="-1"]').click()`);
  await until(`/offline/.test(document.querySelector('[data-legend=rain] [data-lnote]').textContent)`, 8000).catch(() => {});
  same('offline, the legend says so and that the pictures come back online', await rainNote(), 'You are offline, so NASA’s pictures cannot load. They come back when you are online.');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(300);
  check('the legend stack is inside the map, 288 px at most, and does not cover the view buttons', await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(), l = document.querySelector('.mapx-legends').getBoundingClientRect(), s = document.querySelector('.mapx-stack').getBoundingClientRect(); return l.left >= m.left && l.right <= m.right && l.width <= 289 && (l.right <= s.left || l.bottom <= s.top || l.top >= s.bottom); })()`));
  await js(`document.querySelector('.mapx-panel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelector('[data-legend=smap] [data-off]').focus(); 1`); await press('Enter');   // by the keyboard: the focus is on the ×
  check('the × turns the layer off: its legend and its tiles go', await js(`!document.querySelector('[data-legend=smap]') && ![...document.querySelectorAll('.leaflet-tile-pane img')].some(i => /SMAP_L4/.test(i.src))`));
  check('and the focus moves to the Layers button, never lost on the page with the card that held it', await js(`document.activeElement?.dataset.panel === 'layers'`), await js(`document.activeElement?.outerHTML.slice(0, 80)`));
  same('and the button names the one left', await js(`document.querySelector('[data-panel=layers] .mapx-w').textContent`), 'Rain rate');
  if (!(await panelOpen())) await openLayers();
  await js(`document.querySelector('[data-alloff]').focus(); 1`); await press('Enter');   // by the keyboard
  check('"Turn all overlays off" clears every legend and the button goes back to Layers', await js(`!document.querySelector('.mapx-legend') && document.querySelector('[data-panel=layers] .mapx-w').textContent === 'Layers' && document.querySelector('.mapx-legends').hidden`));
  check('the button is off now that nothing is on, and the focus moves to the first row instead of being lost', await js(`document.querySelector('[data-alloff]').disabled && !!document.activeElement?.closest('.mapx-lrow')`), await js(`document.activeElement?.outerHTML.slice(0, 80)`));
  // a layer that fails its check while it is on is taken off, with a sentence
  await js(`document.querySelector('[data-layer=temp]').click()`); await until(`document.querySelector('[data-legend=temp]')`);
  await js(`import('/js/maplayers.js').then(m => { m.net.tile = () => Promise.reject(new Error('tile')); return m.layersCtl().probe(true); })`);
  await until(`!document.querySelector('[data-legend=temp]')`, 6000);
  check('a layer that stops answering is taken off the map and greyed in the panel, in words', await js(`!document.querySelector('[data-legend=temp]')`) && (await layerRows())[3][1] === true && /did not answer/.test((await layerRows())[3][3]));
  // fires and hot spots: points from our own server, a stubbed answer in the real shape
  const FA = { ok: true, count: 2, shown: 2, newest: '2026-11-15T01:30:00Z', incomplete: undefined, points: [{ lat: 44.4, lon: -79.7, time: '2026-11-15T01:30:00Z', frp: 12.5, confidence: 'high', satellite: 'NOAA-20', night: true }, { lat: 44.6, lon: -79.5, time: '2026-11-15T01:30:00Z', frp: null, confidence: 'low', satellite: 'NOAA-21', night: true }] };
  await js(`import('/js/maplayers.js').then(m => { m.net.fires = () => Promise.resolve(${JSON.stringify(FA)}); })`);
  check('the fires row is a normal row, not greyed by the picture check', (await layerRows())[5][1] === false);
  await js(`document.querySelector('[data-layer=fires]').click()`); await until(`document.querySelector('[data-legend=fires]') && document.querySelectorAll('path.leaflet-interactive').length === 2`, 6000);
  check('turning fires on draws one dot for each spot and the legend says plainly what was and was not seen', await js(`document.querySelectorAll('path.leaflet-interactive').length === 2 && /2 spots seen within about 250 km/.test(document.querySelector('[data-lnote=fires]').textContent) && /miss a fire under cloud or between passes/.test(document.querySelector('[data-lnote=fires]').textContent) && /15 Nov[a-z]+ 2026, 01:30 UTC/.test(document.querySelector('[data-lnote=fires]').textContent)`));
  check('the legend has three colour words, no date row and no opacity slider', await js(`document.querySelectorAll('[data-legend=fires] .mapx-dots li').length === 3 && !document.querySelector('[data-legend=fires] [data-date]') && !document.querySelector('[data-legend=fires] [data-op]')`));
  same('the button names it', await js(`document.querySelector('[data-panel=layers] .mapx-w').textContent`), 'Fires and hot spots');
  await js(`import('/js/maplayers.js').then(m => { m.net.fires = () => Promise.resolve({ ok: true, count: 0, shown: 0, points: [], newest: '2026-11-15T01:30:00Z' }); })`);
  await js(`document.querySelector('[data-look=fires]').click()`); await until(`document.querySelectorAll('path.leaflet-interactive').length === 0 && /did not detect a hot spot/.test(document.querySelector('[data-lnote=fires]').textContent)`, 6000);
  check('looking again with none seen says so and keeps the warning that none seen is not none burning', await js(`/not proof that there is no fire/.test(document.querySelector('[data-lnote=fires]').textContent)`));
  await js(`import('/js/maplayers.js').then(m => { m.net.fires = () => Promise.resolve({ ok: false, reason: 'NASA FIRMS took too long to answer; try again in a few minutes' }); })`);
  await js(`document.querySelector('[data-look=fires]').click()`); await until(`/took too long/.test(document.querySelector('[data-lnote=fires]').textContent)`, 6000);
  check('a failed answer shows the server\'s plain reason and no dots', await js(`document.querySelectorAll('path.leaflet-interactive').length === 0`));
  await js(`import('/js/maplayers.js').then(m => { m.net.fires = () => Promise.reject(new TypeError('Failed to fetch')); })`);
  await js(`document.querySelector('[data-look=fires]').click()`); await until(`/did not answer for NASA FIRMS/.test(document.querySelector('[data-lnote=fires]').textContent)`, 6000).catch(() => {});
  same('no answer at all from our own server says so: Crophalo\'s server and NASA FIRMS, not NASA\'s image server', await js(`document.querySelector('[data-lnote=fires]').textContent`), 'Not available right now: Crophalo’s server did not answer for NASA FIRMS. Try again later.');
  await js(`document.querySelector('[data-off=fires]').click()`);
  check('turned off, the legend and the dots are gone', await js(`!document.querySelector('[data-legend=fires]') && document.querySelectorAll('path.leaflet-interactive').length === 0`));
  // one panel at a time, and Escape closes
  await js(`document.querySelector('.mapx-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  check('Escape closes the Layers panel and focus returns to its button', await js(`!document.querySelector('.mapx-panel') && document.activeElement.dataset.panel === 'layers'`));
});

await group('layersFit', async () => {
  await mapReady(); await sleep(2200);
  await js(`import('/js/maplayers.js').then(m => { const D = ${JSON.stringify(GIBS_DOMAINS)}; m.net.text = url => Promise.resolve(D[/LAYER=([A-Za-z0-9_]+)/.exec(url)[1]]); m.net.tile = () => Promise.resolve(); m.net.today = () => '${D('20261115')}'; m.resetLayers(); return m.layersCtl().probe(true); })`);
  await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('.mapx-panel') && [...document.querySelectorAll('.mapx-lrow input')].every(i => !i.disabled)`, 8000);
  await js(`document.querySelector('[data-layer=ndvi]').click()`); await until(`document.querySelector('[data-legend=ndvi]')`);
  await js(`document.querySelector('[data-layer=rain]').click()`); await until(`document.querySelector('[data-legend=rain]')`);
  for (const w of WIDTHS) { await size(w); await sleep(500); await flat(`the map with the Layers panel open and two legends at ${w} px`); }
  check('at the narrowest width the panel and the legends stay inside the map', await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(); return [...document.querySelectorAll('.mapx-panel, .mapx-legends')].every(e => { const r = e.getBoundingClientRect(); return r.left >= m.left - 1 && r.right <= m.right + 1; }); })()`));
  await size(1280);
});

// ---- Regional water storage: one region from our own server (/api/gracecell), drawn as a soft disc about 300 km across, with its value, its month and the words "very coarse"
const BARRIE_PIN = { lat: 44.4438, lon: -79.6618 };   // the Barrie demo field's pin
const gMonth = (y, m) => `${y}${'-'}${String(m).padStart(2, '0')}`;   // a month as the lookup writes it, built from its parts
const GRACE_MONTHS = (() => {   // a stand-in in the lookup's own shape, for the test only (the harness has no NASA login): the mission gap left empty, one empty month inside the last eight, and the newest month's value with its real-sized uncertainty
  const out = [];
  for (let y = 2002; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
    if ((y === 2002 && m < 4) || (y === 2026 && m > 9)) continue;
    const gap = (y === 2017 && m >= 7) || (y === 2018 && m <= 5) || (y === 2026 && m === 7);
    out.push([gMonth(y, m), gap ? null : Math.round((Math.sin((m / 12) * 2 * Math.PI) * 9 - 3) * 100) / 100, gap ? null : 2.5]);
  }
  out[out.length - 1] = [gMonth(2026, 9), -12.4, 2.1];
  return out;
})();
const GRACE_ANSWER = { ok: true, source: 'NASA GRACE and GRACE-FO, JPL mascon solution RL06.3Mv04 (Coastal Resolution Improvement filter), from NASA\'s Physical Oceanography DAAC', cell: { lat: 44.25, lon: -79.75, width_km: 39.8, height_km: 55.6, edges: { n: 44.5, s: 44, e: -79.5, w: -80 } },
  area_km: 300, months: GRACE_MONTHS, newest_month: gMonth(2026, 9), value_cm: -12.4, uncertainty_cm: 2.1, trend_cm_per_year: 0.17, trend_from: gMonth(2002, 4), trend_to: gMonth(2026, 9), spot: { lat: 44.25, lon: -79.75 }, cached: false, fetched: new Date().toISOString() };
const graceStub = (...replies) => js(`import('/js/gracelayer.js').then(m => { m.resetGrace(); window.__graceAsks = 0; const replies = ${JSON.stringify(replies)};
  m.graceNet.ask = async () => { const r = replies[Math.min(window.__graceAsks, replies.length - 1)]; window.__graceAsks++; if (r.wait) await new Promise(done => setTimeout(done, r.wait)); return r; }; return 1; })`);
const fastPlay = () => js(`import('/js/layeranim.js').then(a => { Object.assign(a.PLAY, { holdMs: 120, holdMaxMs: 120, budgetMs: 0, holdLessMs: 80, fadeMs: 120, loadWaitMs: 200 }); return 1; })`);
const watchClasses = () => js(`(() => { window.__cls = { xfade: 0, reveal: 0 }; window.__clsObs?.disconnect();   // every time a layer starts a cross-fade or a soft reveal, counted as it happens (nothing is missed between two looks)
  window.__clsObs = new MutationObserver(list => { for (const m of list) { const c = m.target.classList, was = m.oldValue || ''; if (!c) continue; if (c.contains('mapx-xfade') && !was.includes('mapx-xfade')) window.__cls.xfade++; if (c.contains('mapx-reveal') && !was.includes('mapx-reveal')) window.__cls.reveal++; } });
  window.__clsObs.observe(document.querySelector('#mapx'), { attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true }); return 1; })()`);
const classCount = () => js(`({ ...window.__cls })`);
const gLine = sel => js(`document.querySelector('[data-legend=grace] ${sel}')?.textContent ?? ''`);
const gState = () => js(`import('/js/gracelayer.js').then(m => m.graceCtl()?.state() ?? null)`);
const gPixel = () => js(`(() => { const c = [...document.querySelectorAll('.gr-layer canvas')].find(t => { const r = t.getBoundingClientRect(), m = document.querySelector('#mapxCanvas').getBoundingClientRect(), x = m.left + m.width / 2, y = m.top + m.height / 2; return x >= r.left && x < r.right && y >= r.top && y < r.bottom; }); if (!c) return null; return [...c.getContext('2d').getImageData(128, 128, 1, 1).data]; })()`);
const dropPin = (p = BARRIE_PIN) => js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: ${p.lat}, lon: ${p.lon}, name: 'Demo field', country: 'CA' } })); 1`);
const turnLayer = async id => { if (!(await panelOpen())) await openLayers(); await js(`document.querySelector('[data-layer=${id}]').click()`); await until(`document.querySelector('[data-legend=${id}]')`); };
await group('grace', async () => {
  await mapReady(); await fastPlay();
  await graceStub({ status: 200, answer: GRACE_ANSWER });
  await openLayers();
  same('the row says what the farmer gets, and that it is for a region', (await layerRows())[4], ['Regional water storage', false, false, 'Water stored across a wide region.']);
  // no pin yet: nothing is asked, nothing is drawn, and the legend says what to do
  await turnLayer('grace');
  check('with no pin nothing is asked of the server and nothing is drawn', await js(`window.__graceAsks === 0 && !document.querySelector('.gr-layer')`));
  same('the legend says to drop a pin, and the value is not read', [await gLine('[data-gnote]'), await gLine('[data-here]')], ['Drop a pin on your field to see the stored water of its region.', 'No value for your pin: drop a pin first.']);
  check('the legend says plainly that it is very coarse, before any value', /^Very coarse: one value for a whole region, not your field\.$/.test(await gLine('.gr-coarse')));
  check('until the region\'s answer comes there is nothing to step through or play: no month row, no Play, no "Show the whole region", no opacity', await js(`[...document.querySelectorAll('[data-legend=grace] .gr-months, [data-legend=grace] .mapx-playrow, [data-legend=grace] [data-gwhole], [data-legend=grace] .mapx-op')].every(e => e.hidden && e.offsetParent === null)`));
  // the pin: the region's answer is drawn
  await dropPin(); await until(`document.querySelector('.gr-layer canvas')`, 6000); await sleep(300);
  const here = await gLine('[data-here]');
  check('the value of the region is said in whole centimetres against the 2004 to 2009 average, with its uncertainty and its month', new RegExp(`^Stored water in this region: 12 cm less than the 2004–2009 average \\(± 2 cm\\) · ${['Sep', '2026'].join(' ')}$`).test(here), here);
  check('the month line says it is NASA\'s newest month and that it comes late', /the newest month NASA has \(it comes about two months after the month ends\)$/.test(await gLine('[data-gmonth]')), await gLine('[data-gmonth]'));
  check('one ask for the half-degree square, and the same square is not asked again for a pin moved inside it', await js(`window.__graceAsks === 1`) && (await dropPin({ lat: 44.40, lon: -79.70 }), await sleep(300), await js(`window.__graceAsks === 1`)));
  const px = await gPixel();
  check('the disc is drawn at the field in the colour of its class (10 to 20 cm below: light brown), solid at field zoom', px && px[3] === 255 && px.slice(0, 3).join() === '191,124,72', px);
  same('at field zoom the legend says the whole view is one region', await gLine('[data-gview]'), 'Your whole view lies inside one GRACE region.');
  check('with the answer the month row, Play, "Show the whole region" and the opacity are there', await js(`[...document.querySelectorAll('[data-legend=grace] .gr-months, [data-legend=grace] .mapx-playrow, [data-legend=grace] [data-gwhole], [data-legend=grace] .mapx-op')].every(e => !e.hidden && e.offsetParent !== null)`));
  check('the marker stands on the bar where the value is, and the uncertainty band around it', await js(`(() => { const m = document.querySelector('[data-legend=grace] [data-mark]'), b = document.querySelector('[data-legend=grace] [data-gband]'); return !m.hidden && Math.abs(parseFloat(m.style.left) - 25.1) < 0.2 && !b.hidden && parseFloat(b.style.left) < parseFloat(m.style.left) && parseFloat(b.style.left) + parseFloat(b.style.width) > parseFloat(m.style.left); })()`));
  check('the legend has the NASA "i", the credit with the DOI, and its trend', await js(`!!document.querySelector('[data-legend=grace] .srci.nasa[data-src=grace]')`) && /DOI 10\.5067\/TEMSC-3JC634/.test(await gLine('.mapx-credit-line')) && /^Trend from .* \+0\.2 cm a year, a straight line through every month NASA measured\.$/.test(await gLine('[data-gtrend]')));
  check('the "i" card says what was read and where', await js(`(() => { const n = document.querySelector('[data-legend=grace] .srci').dataset.note; return /half-degree square centred at 44\\.25, -79\\.75/.test(n) && /one value for a region about 300 km wide/.test(n) && /Read from NASA by Crophalo’s server on/.test(n); })()`));
  same('the button says what is on', await js(`document.querySelector('[data-panel=layers] .mapx-w').textContent`), 'Regional water storage');
  // the months: Earlier, the month with no measurement, Newest
  await js(`document.querySelector('[data-legend=grace] [data-gstep="-1"]').click()`); await sleep(150);
  check('Earlier month goes one month back and the value follows', new RegExp(`· ${['Aug', '2026'].join(' ')}$`).test(await gLine('[data-here]')), await gLine('[data-here]'));
  await js(`document.querySelector('[data-legend=grace] [data-gstep="-1"]').click()`); await sleep(150);
  const gap = await gLine('[data-here]'), gpx = await gPixel();
  check('a month the satellites did not measure says so, hides the marker and greys the disc, never a number', gap === `Stored water in this region: no measurement for ${['July', '2026'].join(' ')} (the satellites did not measure it; it is left empty, never filled in)` && await js(`document.querySelector('[data-legend=grace] [data-mark]').hidden`) && gpx && gpx[0] === gpx[1] && gpx[1] === gpx[2], [gap, gpx]);
  await js(`document.querySelector('[data-legend=grace] [data-gnewest]').click()`); await sleep(150);
  check('Newest comes back to the newest month, and Later and Newest are then off', /12 cm less/.test(await gLine('[data-here]')) && await js(`document.querySelector('[data-legend=grace] [data-gstep="1"]').disabled && document.querySelector('[data-legend=grace] [data-gnewest]').disabled`));
  // the time-lapse of the last eight months
  same('the Play button says what it plays', await gLine('[data-gplay]'), 'Play the last 8 months');
  await watchClasses();
  await js(`document.documentElement.dataset.motion = ''; document.querySelector('[data-legend=grace] [data-gplay]').click()`);
  let steps = new Set(), progress = new Set(); const end = Date.now() + 30000;
  while (Date.now() < end && (await js(`import('/js/gracelayer.js').then(m => m.graceCtl().playing())`))) { steps.add((await gState()).month); progress.add(await gLine('[data-gprogress]')); await sleep(30); }
  const fades = (await classCount()).xfade;
  check('under Full the eight months cross-fade one into the next, and the lapse stops by itself on the newest', fades === 8 && steps.size >= 4 && (await gState()).month === gMonth(2026, 9) && (await gLine('[data-gplay]')) === 'Play the last 8 months', [fades, [...steps]]);
  check('while it plays the legend says how far it has come', [...progress].some(t => /^\d of 8 · [A-Z][a-z]{2} \d{4}$/.test(t)) && (await gLine('[data-gprogress]')) === '', [...progress]);
  await js(`document.querySelector('[data-legend=grace] [data-gplay]').click()`); await sleep(200);
  await js(`document.querySelector('[data-legend=grace] [data-gplay]').click()`); await sleep(100);
  check('Pause stops it where it is', !(await js(`import('/js/gracelayer.js').then(m => m.graceCtl().playing())`)) && (await gLine('[data-gplay]')) === 'Play the last 8 months');
  await js(`document.documentElement.dataset.motion = 'less'; document.querySelector('[data-legend=grace] [data-gnewest]').click()`); await sleep(100);
  await watchClasses(); await js(`document.querySelector('[data-legend=grace] [data-gplay]').click()`);
  const end2 = Date.now() + 30000;
  while (Date.now() < end2 && (await js(`import('/js/gracelayer.js').then(m => m.graceCtl().playing())`))) await sleep(40);
  check('under Less the months step without a fade, and it still ends on the newest', (await classCount()).xfade === 0 && (await gState()).month === gMonth(2026, 9));
  await js(`document.documentElement.dataset.motion = 'reduce'`); await js(`document.querySelector('[data-legend=grace] [data-gstep="-1"]').click()`); await sleep(100);
  check('under Still nothing plays by itself: Play is off and says why, Earlier still steps', await js(`(() => { const b = document.querySelector('[data-legend=grace] [data-gplay]'); return b.disabled && /Still/.test(b.title); })()`) && /Aug/.test(await gLine('[data-here]')));
  check('and the marker jumps (no slide) under Still and Less, slides under Full', await js(`(() => { const m = document.querySelector('[data-legend=grace] [data-mark]'), t = () => parseFloat(getComputedStyle(m).transitionDuration) || 0; const left = () => /left/.test(getComputedStyle(m).transitionProperty) ? t() : 0; const still = left(); document.documentElement.dataset.motion = 'less'; const less = left(); document.documentElement.dataset.motion = ''; const full = left(); return still < 0.01 && less === 0 && full >= 0.3; })()`));
  // "Show the whole region"
  await js(`document.documentElement.dataset.motion = 'less'; document.querySelector('[data-legend=grace] [data-gwhole]').click()`); await sleep(500);
  check('"Show the whole region" zooms out until the whole disc is in view, and the legend says what the disc is', (await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().getZoom())`)) <= 8 && /The soft disc shows the size of one region, about 300 km across/.test(await gLine('[data-gview]')));
  await js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().setView([${BARRIE_PIN.lat}, ${BARRIE_PIN.lon}], 14, { animate: false }) && 1)`); await sleep(300);
  // off and on again: the soft reveal under Full only
  await js(`document.querySelector('[data-legend=grace] [data-off]').click()`);
  check('the × turns it off: the legend and the disc go, and the button goes back to Layers', await js(`!document.querySelector('[data-legend=grace]') && !document.querySelector('.gr-layer') && document.querySelector('[data-panel=layers] .mapx-w').textContent === 'Layers'`));
  await js(`document.documentElement.dataset.motion = ''`); await watchClasses(); await turnLayer('grace'); await until(`document.querySelector('.gr-layer')`, 3000); await sleep(100);
  check('turned on under Full, the disc fades in softly (from the answer kept, nothing asked again)', (await classCount()).reveal === 1 && await js(`window.__graceAsks === 1`));
  await js(`document.querySelector('[data-legend=grace] [data-off]').click(); document.documentElement.dataset.motion = 'less'`); await watchClasses(); await turnLayer('grace'); await until(`document.querySelector('.gr-layer')`, 3000); await sleep(100);
  check('turned on under Less, it is there at once, with no fade', (await classCount()).reveal === 0);
  await js(`document.querySelector('[data-legend=grace] [data-off]').click(); document.documentElement.dataset.motion = ''`);
  // what the server says when there is nothing to draw
  await graceStub({ status: 200, answer: { ok: false, reason: 'NASA did not let this computer’s Earthdata login read the GRACE-FO file: the login may still need to be approved for NASA PO.DAAC' } }, { status: 200, answer: GRACE_ANSWER });
  await turnLayer('grace'); await until(`/Earthdata login/.test(document.querySelector('[data-legend=grace] [data-gnote]')?.textContent ?? '')`, 4000);
  check('a lookup that failed says the server\'s own plain reason, draws nothing and offers Try again', await js(`!document.querySelector('.gr-layer') && !document.querySelector('[data-legend=grace] [data-gretry]').hidden`) && /No value for your pin/.test(await gLine('[data-here]')));
  await js(`document.querySelector('[data-legend=grace] [data-gretry]').click()`); await until(`document.querySelector('.gr-layer canvas')`, 4000);
  check('Try again asks again and draws the answer', await js(`window.__graceAsks === 2 && document.querySelector('[data-legend=grace] [data-gretry]').hidden`) && /12 cm less/.test(await gLine('[data-here]')));
  await js(`document.querySelector('[data-legend=grace] [data-off]').click()`);
  await graceStub({ status: 200, answer: { ok: false, reason: 'This place is open water for the GRACE-FO data, which measures stored water on land', final: true } });
  await turnLayer('grace'); await until(`/open water/.test(document.querySelector('[data-legend=grace] [data-gnote]')?.textContent ?? '')`, 4000);
  check('open water is said as NASA\'s final answer: nothing drawn, no Try again', await js(`!document.querySelector('.gr-layer') && document.querySelector('[data-legend=grace] [data-gretry]').hidden`));
  await js(`document.querySelector('[data-legend=grace] [data-off]').click()`);
  // a server with no such lookup (404), and one whose lookup broke (500, its reason is for the server's keeper, not the farmer)
  await graceStub({ status: 404, answer: { ok: false, reason: 'Unknown endpoint' } });
  await turnLayer('grace'); await until(`/no water-storage lookup/.test(document.querySelector('[data-legend=grace] [data-gnote]')?.textContent ?? '')`, 4000);
  check('a server with no water-storage lookup says so in plain words, draws nothing and offers no Try again', (await gLine('[data-gnote]')) === 'This copy of Crophalo’s server has no water-storage lookup, so nothing is drawn.' && await js(`!document.querySelector('.gr-layer') && document.querySelector('[data-legend=grace] [data-gretry]').hidden`));
  await js(`document.querySelector('[data-legend=grace] [data-off]').click()`);
  await graceStub({ status: 500, answer: { ok: false, reason: 'Python environment not found (.venv)' } });
  await turnLayer('grace'); await until(`/did not answer/.test(document.querySelector('[data-legend=grace] [data-gnote]')?.textContent ?? '')`, 4000);
  check('a server whose lookup broke says the farmer\'s words, not the server\'s, and offers Try again', (await gLine('[data-gnote]')) === 'Not available right now: Crophalo’s server did not answer for NASA’s GRACE-FO record. Try again later.' && await js(`!document.querySelector('[data-legend=grace] [data-gretry]').hidden`));
  await js(`document.querySelector('[data-legend=grace] [data-off]').click()`);
  // the card at the narrowest width with the largest text
  await graceStub({ status: 200, answer: GRACE_ANSWER });
  await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'xlarge' }))`); await size(320); await sleep(400);
  await js(`(() => { if (!document.querySelector('#mapx').classList.contains('full')) document.querySelector('[data-view=full]').click(); return 1; })()`); await sleep(300);
  await turnLayer('grace'); await until(`document.querySelector('.gr-layer canvas')`, 4000); await js(`document.querySelector('.mapx-panel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(300);
  await flat('the map with the Regional water storage legend at 320 px with the largest text');
  const gSmall = await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(); return [...document.querySelectorAll('[data-legend=grace] button:not(.srci), [data-legend=grace] input')].filter(e => e.offsetParent !== null).filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || r.left < m.left - 1 || r.right > m.right + 1; }).map(e => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().height)); })()`);
  check('at 320 px every control of the card is at least 44 px tall and inside the map (the "i" is 24 px with a 44 px place to tap around it)', gSmall.length === 0, gSmall);
  await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'default' }))`); await size(1280);
});

// ---- the Layers panel in the owner's two groups, tidy from 320 px with the largest text up to 1280 px
await group('panelgroups', async () => {
  await mapReady();
  await js(`import('/js/maplayers.js').then(m => { const D = ${JSON.stringify(GIBS_DOMAINS)}; m.net.text = url => Promise.resolve(D[/LAYER=([A-Za-z0-9_]+)/.exec(url)[1]]); m.net.tile = () => Promise.resolve(); m.net.today = () => '${D('20261115')}'; m.resetLayers(); return m.layersCtl().probe(true); })`);
  await openLayers(); await until(`document.querySelectorAll('#mapxTerrainRows .mapx-lrow').length === 5`);
  same('two groups, in order: NASA data, then Terrain analysis', await js(`[...document.querySelectorAll('.mapx-panel .mapx-lset legend')].map(l => l.textContent)`), ['NASA data', 'Terrain analysis']);
  same('NASA data holds the owner\'s six rows, in order', (await layerRows()).map(r => r[0]), ['Plant greenness', 'Soil moisture', 'Rain rate', 'Land temperature', 'Regional water storage', 'Fires and hot spots']);
  same('Terrain analysis holds the owner\'s five rows, in order', await js(`[...document.querySelectorAll('#mapxTerrainRows .mapx-lrow b')].map(b => b.textContent)`), ['Slope', 'Erosion exposure', 'Frost pockets', 'Sun and shade', 'Relief shading']);
  check('the panel has one short intro, no copy of the base note and no "each layer names its satellite" line; the land group says where its heights come from in one line', (await js(`[!!document.querySelector('.mapx-setnote'), !!document.querySelector('#mapxLayerBase')]`)).every(x => x === false) && /^From the land.s height/.test(await js(`document.querySelector('.tl-setnote').textContent`)));
  check('the two groups are set apart by a line', await js(`getComputedStyle(document.querySelectorAll('.mapx-lset')[1]).boxShadow !== 'none'`));
  for (const largest of [false, true]) for (const w of [320, 375, 1280]) {
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: '${largest ? 'xlarge' : 'default'}' }))`); await size(w); await sleep(400);
    await js(`(() => { const box = document.querySelector('#mapx'), full = box.classList.contains('full'); if (${w < 600} !== full) document.querySelector('[data-view=full]').click(); return 1; })()`); await sleep(300);   // a phone reads its layers on the full-screen map
    if (!(await panelOpen())) await openLayers();
    await flat(`the Layers panel at ${w} px${largest ? ' with the largest text' : ''}`);
    const m = await js(`(() => { const p = document.querySelector('.mapx-panel').getBoundingClientRect(), map = document.querySelector('#mapx').getBoundingClientRect(), rows = [...document.querySelectorAll('.mapx-panel .mapx-lrow')];
      return { inside: p.left >= map.left - 1 && p.right <= map.right + 1, rows: rows.length, small: rows.filter(r => { const b = r.getBoundingClientRect(); return b.width < 43.5 || b.height < 43.5; }).length, out: rows.filter(r => { const b = r.getBoundingClientRect(); return b.right > p.right + 1 || b.left < p.left - 1; }).length,
        squeezed: rows.filter(r => { const b = r.querySelector('input').getBoundingClientRect(); return b.width < 19.5 || b.height < 19.5; }).length,
        cut: rows.filter(r => r.scrollWidth > r.clientWidth + 1).length, scrolls: getComputedStyle(document.querySelector('.mapx-panel')).overflowY }; })()`);
    check(`at ${w} px${largest ? ' with the largest text' : ''} the panel stays inside the map, all eleven rows are 44 px or more, none sticks out or is cut, and the panel scrolls when it is taller than the map`, m.inside && m.rows === 11 && m.small === 0 && m.out === 0 && m.cut === 0 && m.scrolls === 'auto', m);
    check(`at ${w} px${largest ? ' with the largest text' : ''} no row's box is squeezed by a long sub-line (every box 20 px)`, m.squeezed === 0, m);
    if (w < 600) {   // a phone wraps the picture's date bar at the foot of the map onto several lines: the panel still ends above it
      await js(`(() => { const p = document.querySelector('#mapxPic'); p.hidden = false; p.querySelector('.mapx-pic-t').textContent = 'NASA HLS picture of a day with clouds, the least cloudy of the last days, 30 m: edges are approximate, and on a phone these words take several lines'; return 1; })()`); await sleep(500);
      const f = await js(`(() => { const a = document.querySelector('.mapx-panel').getBoundingClientRect(), p = document.querySelector('#mapxPic').getBoundingClientRect(); return { panel: Math.round(a.top), pic: Math.round(p.bottom), tall: Math.round(p.height) }; })()`);
      check(`at ${w} px${largest ? ' with the largest text' : ''} the panel starts below the picture's date bar (in the toolbar block), however tall a phone makes it`, f.panel >= f.pic - 1 && f.tall > 60, f);
    }
  }
  await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'default' }))`); await size(1280);
});

// ---- the layers come alive: "Play the last 30 days" and Pause, cross-fading under Full, stepping under Less, nothing by itself under Still; the soft reveal; the value at the pin read from NASA's tile with its marker
await group('alive', async () => {
  await mapReady(); await fastPlay();
  const CM = Object.fromEntries(['SMAP_Analyzed_Soil_Moisture', 'GPM_Precipitation_Rate'].map(n => [n, fs.readFileSync(path.join(ROOT, 'scripts/fixtures/gibs', `colormap_${n}.xml`), 'utf8')]));
  await js(`import('/js/maplayers.js').then(m => { const D = ${JSON.stringify(GIBS_DOMAINS)}, CM = ${JSON.stringify(CM)}; m.net.text = url => Promise.resolve(D[/LAYER=([A-Za-z0-9_]+)/.exec(url)[1]]); m.net.tile = () => Promise.resolve(); m.net.today = () => '${D('20261115')}';
    m.net.colormap = url => Promise.resolve(CM[/colormaps[/]v1.3[/]([A-Za-z0-9_]+)[.]xml/.exec(url)[1]]); window.__px = [255, 162, 0, 255]; m.net.pixel = () => Promise.resolve(window.__px); m.resetLayers(); return m.layersCtl().probe(true); })`);
  await dropPin(); await sleep(400);
  await js(`document.documentElement.dataset.motion = ''`);
  await openLayers(); await until(`[...document.querySelectorAll('#mapxLayerRows .mapx-lrow input')].slice(0, 4).every(i => !i.disabled)`, 8000);
  await watchClasses(); await js(`document.querySelector('[data-layer=smap]').click()`); await until(`document.querySelector('[data-legend=smap]')`); await sleep(100);
  check('turned on under Full, a picture layer fades in softly', (await classCount()).reveal === 1);
  await until(`document.querySelector('[data-legend=smap]') && !/reading/.test(document.querySelector('[data-here=smap]').textContent)`, 6000);
  check('the value at the field is read from the pixel under the pin and said with its day', /^Soil moisture here: 0\.00 m³\/m³ · \d{1,2} [A-Z][a-z]{2}$/.test(await js(`document.querySelector('[data-here=smap]').textContent`)), await js(`document.querySelector('[data-here=smap]').textContent`));
  check('each legend says what one image spans and gives NASA\'s credit', /12:00 UTC/.test(await js(`document.querySelector('[data-legend=smap] .mapx-span').textContent`)) && /^Credit: NASA Global Imagery Browse Services \(GIBS\)/.test(await js(`document.querySelector('[data-legend=smap] .mapx-credit-line').textContent`)));
  same('a daily layer offers the last 30 days', await js(`document.querySelector('[data-play=smap]').textContent`), 'Play the last 30 days');
  check('the word Opacity stays on one line', await js(`(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('[data-legend=smap] .mapx-op > span')); return r.getClientRects().length === 1; })()`));
  check('every control of the legend is at least 44 px tall (the "i" is 24 px with a 44 px place to tap around it)', await js(`[...document.querySelectorAll('[data-legend=smap] button:not(.srci), [data-legend=smap] input')].filter(e => e.offsetParent !== null).every(e => e.getBoundingClientRect().height >= 43.5)`));
  // Play under Full: cross-fades, says how far it has come, keeps focus on Pause, the value is not spoken on every frame
  const want = await js(`Promise.all([import('/js/layeranim.js'), import('/js/gibs.js')]).then(([a, g]) => a.frames(g.parseDomains(${JSON.stringify(GIBS_DOMAINS.SMAP_L4_Analyzed_Root_Zone_Soil_Moisture)}), g.layerOf('smap'), '${D('20261115')}').length)`);   // the days NASA's own list holds
  await watchClasses(); await js(`{ const b = document.querySelector('[data-play=smap]'); b.focus(); b.click(); }`);
  await until(`document.querySelector('[data-play=smap]').textContent === 'Pause'`, 3000);
  check('while it plays the button says Pause and carries no pressed state (a screen reader would say "Pause, pressed"); its look comes from the playing mark', await js(`(() => { const b = document.querySelector('[data-play=smap]'); return !b.hasAttribute('aria-pressed') && b.hasAttribute('data-playing') && getComputedStyle(b).backgroundColor !== getComputedStyle(document.querySelector('[data-legend=smap] [data-newest]')).backgroundColor; })()`));
  let days = new Set(), focus = true, quiet = true, prog = ''; const end = Date.now() + 60000;
  while (Date.now() < end && (await js(`import('/js/maplayers.js').then(m => m.layersCtl().playing('smap'))`))) {
    const r = await js(`({ d: document.querySelector('[data-date=smap]').value, f: document.activeElement === document.querySelector('[data-play=smap]'), live: document.querySelector('[data-here=smap]').getAttribute('aria-live'), p: document.querySelector('[data-progress=smap]').textContent })`);
    days.add(r.d); if (days.size > 2) { focus &&= r.f; quiet &&= r.live === 'off'; } if (r.p) prog = r.p; await sleep(40);
  }
  const fades = (await classCount()).xfade;
  check('under Full every day of the last 30 that NASA has cross-fades into the next (29 here: NASA has no picture for one of them)', want >= 25 && fades === want && days.size >= 10, [want, fades, days.size]);
  check('it stops by itself on the newest image, and the button offers the 30 days again', !(await js(`import('/js/maplayers.js').then(m => m.layersCtl().playing('smap'))`)) && (await js(`document.querySelector('[data-play=smap]').textContent`)) === 'Play the last 30 days' && (await js(`document.querySelector('[data-date=smap]').value`)) === D('20261110'));
  check('while it plays the legend says how far it has come ("12 of 29 · 2 Nov")', /^\d{1,2} of \d{2} · \d{1,2} [A-Z][a-z]{2}$/.test(prog) && (await js(`document.querySelector('[data-progress=smap]').textContent`)) === '', prog);
  check('focus stays on Pause through every frame, and the value is not read out on every frame (only at the end)', focus && quiet && (await js(`document.querySelector('[data-here=smap]').getAttribute('aria-live')`)) === 'polite', [focus, quiet]);
  // Pause where it is
  await js(`document.querySelector('[data-play=smap]').click()`); await sleep(500);
  await js(`document.querySelector('[data-play=smap]').click()`); const paused = await js(`document.querySelector('[data-date=smap]').value`); await sleep(600);
  check('Pause stops it on the day it shows, and it stays there', !(await js(`import('/js/maplayers.js').then(m => m.layersCtl().playing('smap'))`)) && (await js(`document.querySelector('[data-date=smap]').value`)) === paused && paused !== D('20261110'), paused);
  check('no unseen day is left loading after Pause', await js(`[...document.querySelectorAll('.leaflet-tile-pane .leaflet-layer')].filter(l => l.style.opacity === '0').length === 0`));
  // Less: steps without a fade; Still: nothing by itself
  await js(`document.documentElement.dataset.motion = 'less'; document.querySelector('[data-legend=smap] [data-newest]').click()`); await sleep(100);
  await watchClasses(); await js(`document.querySelector('[data-play=smap]').click()`);
  const end2 = Date.now() + 60000;
  while (Date.now() < end2 && (await js(`import('/js/maplayers.js').then(m => m.layersCtl().playing('smap'))`))) await sleep(60);
  check('under Less the days step without a fade, to the newest', (await classCount()).xfade === 0 && (await js(`document.querySelector('[data-date=smap]').value`)) === D('20261110'));
  await js(`document.documentElement.dataset.motion = 'reduce'`); await js(`document.querySelector('[data-legend=smap] [data-step="-1"]').click()`); await sleep(200);
  check('under Still Play is off and says why; Earlier still steps one day', await js(`(() => { const b = document.querySelector('[data-play=smap]'); return b.disabled && /Still/.test(b.title); })()`) && (await js(`document.querySelector('[data-date=smap]').value`)) === D('20261109'));
  // the marker: slides under Full, jumps under Less and Still
  check('the marker on the colour bar slides under Full (0.6 s) and jumps under Less and Still', await js(`(() => { const m = document.querySelector('[data-mark=smap]'), t = () => parseFloat(getComputedStyle(m).transitionDuration) || 0; const left = () => /left/.test(getComputedStyle(m).transitionProperty) ? t() : 0; const still = left(); document.documentElement.dataset.motion = 'less'; const less = left(); document.documentElement.dataset.motion = ''; const full = left(); return still < 0.01 && less === 0 && Math.abs(full - 0.6) < 0.01; })()`));
  // reveal: Full only
  await js(`document.querySelector('[data-legend=smap] [data-off]').click(); document.documentElement.dataset.motion = 'less'`);
  if (!(await panelOpen())) await openLayers();
  await watchClasses(); await js(`document.querySelector('[data-layer=smap]').click()`); await until(`document.querySelector('[data-legend=smap]')`); await sleep(100);
  check('turned on under Less there is no fade in', (await classCount()).reveal === 0);
  await js(`document.querySelector('[data-legend=smap] [data-off]').click(); document.documentElement.dataset.motion = 'reduce'`);
  if (!(await panelOpen())) await openLayers();
  await watchClasses(); await js(`document.querySelector('[data-layer=smap]').click()`); await until(`document.querySelector('[data-legend=smap]')`); await sleep(100);
  check('nor under Still', (await classCount()).reveal === 0);
  await js(`document.querySelector('[data-legend=smap] [data-off]').click(); document.documentElement.dataset.motion = ''`);
  // the rain on a dry day, and a picture the browser may not read
  if (!(await panelOpen())) await openLayers();
  await js(`window.__px = [191, 191, 191, 0]; document.querySelector('[data-layer=rain]').click()`); await until(`document.querySelector('[data-legend=rain]') && !/reading/.test(document.querySelector('[data-here=rain]').textContent)`, 6000);
  check('a dry day reads as dry from NASA\'s palette (not as missing), and the marker stands at the bottom of the scale', /^Rain here: under 0\.1 mm\/h on average that day \(dry, or nearly\) · \d{1,2} [A-Z][a-z]{2}$/.test(await js(`document.querySelector('[data-here=rain]').textContent`)) && await js(`(() => { const m = document.querySelector('[data-mark=rain]'); return !m.hidden && m.style.left === '0%'; })()`), await js(`document.querySelector('[data-here=rain]').textContent`));
  await js(`window.__px = [128, 128, 128, 0]; import('/js/maplayers.js').then(m => m.layersCtl().readHere('rain'))`); await sleep(300);
  same('NASA\'s own "no data" has no value, with the reason', await js(`document.querySelector('[data-here=rain]').textContent`), 'No value for your pin: no image at the pin on this day.');
  await js(`import('/js/maplayers.js').then(m => { m.net.pixel = () => Promise.reject(new DOMException('The canvas has been tainted by cross-origin data.', 'SecurityError')); return m.layersCtl().readHere('rain'); })`); await sleep(300);
  same('where the browser does not allow the picture to be read, it says so, never guessed', await js(`document.querySelector('[data-here=rain]').textContent`), 'No value for your pin: the browser did not allow reading the picture.');
  check('and the marker goes', await js(`document.querySelector('[data-mark=rain]').hidden`));
  // a phone: the legends end above the picture's date bar at the foot of the map, however many lines a phone wraps its words into
  await size(375); await sleep(300);
  await js(`(() => { if (!document.querySelector('#mapx').classList.contains('full')) document.querySelector('[data-view=full]').click(); const p = document.querySelector('#mapxPic'); p.hidden = false; p.querySelector('.mapx-pic-t').textContent = 'NASA HLS picture of a day with clouds, the least cloudy of the last days, 30 m: edges are approximate, and on a phone these words take several lines'; return 1; })()`); await sleep(600);
  const foot = await js(`(() => { const l = document.querySelector('.mapx-legends').getBoundingClientRect(), p = document.querySelector('#mapxPic').getBoundingClientRect(); return { legends: Math.round(l.top), pic: Math.round(p.bottom), tall: Math.round(p.height) }; })()`);
  check('on a phone the legends start below the picture\'s date bar, however tall its words make it', (foot.legends === 0 || foot.legends >= foot.pic - 1) && foot.tall > 60, foot);   // 0: no legend open at that point
  await size(1280); await sleep(300);
  await js(`document.querySelector('[data-legend=rain] [data-off]').click()`);
  // fires: a server with no fire lookup is said in plain words, never as the server's own "Unknown endpoint"
  await js(`(() => { const real = window.fetch; window.fetch = (u, o) => /\\/api\\/firms/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify({ ok: false, reason: 'Unknown endpoint' }), { status: 404, headers: { 'content-type': 'application/json' } })) : real(u, o); return 1; })()`);
  if (!(await panelOpen())) await openLayers();
  await js(`document.querySelector('[data-layer=fires]').click()`); await until(`/fire lookup/.test(document.querySelector('[data-lnote=fires]')?.textContent ?? '')`, 6000);
  same('a server with no fire lookup says so in plain words', await js(`document.querySelector('[data-lnote=fires]').textContent`), 'This copy of Crophalo’s server has no fire lookup, so no spots are drawn.');
  await js(`document.querySelector('[data-legend=fires] [data-off]').click()`);
});

// What the farmer's eye would catch: parts of the map's own controls that lie over each other, parts outside the map, buttons of one bar with different heights, and a bar button under 44 px. Measured, not looked at.
const MEASURE = `(() => {
  const R = e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const map = document.querySelector('#mapx').getBoundingClientRect(), shown = e => e && e.offsetParent !== null && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const parts = { tools: '[aria-label="Map tool"]', base: '.mapx-base', reselect: '#mapxReselect', right: '.mapx-right', panel: '.mapx-panel', stack: '.mapx-stack', hint: '.mapx-hint', note: '.mapx-basenote', legends: '.mapx-legends', spot: '.spot', credit: '.mapx-credit', scale: '.leaflet-control-scale' };
  const boxes = {}; for (const [k, sel] of Object.entries(parts)) { const e = document.querySelector(sel); if (shown(e)) boxes[k] = R(e); }
  const names = Object.keys(boxes), overlaps = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const a = boxes[names[i]], b = boxes[names[j]]; if (a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1) overlaps.push(names[i] + ' over ' + names[j]); }
  const outside = names.filter(k => boxes[k].x < map.left - 1 || boxes[k].r > map.right + 1 || boxes[k].y < map.top - 1 || boxes[k].b > map.bottom + 1);
  const bar = [...document.querySelectorAll('.mapx-seg, .mapx-base, .mapx-pbtn, .mapx-stack button')].filter(shown).map(e => Math.round(e.getBoundingClientRect().height));
  const small = [...document.querySelectorAll('.mapx-pbtn, .mapx-base button, .mapx-pclose, .mapx-lx, .mapx-row, .mapx-lrow')].filter(shown).filter(e => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map(e => (e.getAttribute('aria-label') || e.className).toString().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
  return { overlaps, outside, boxes: Object.fromEntries(names.map(k => [k, [boxes[k].x - map.left, boxes[k].y - map.top, boxes[k].w, boxes[k].h].map(Math.round)])), barHeights: [...new Set(bar)], small, map: [Math.round(map.width), Math.round(map.height)] };
})()`;
await group('layoutAudit', async () => {
  await mapReady(); await sleep(2200);
  await js(`import('/js/maplayers.js').then(m => { const D = ${JSON.stringify(GIBS_DOMAINS)}; m.net.text = url => Promise.resolve(D[/LAYER=([A-Za-z0-9_]+)/.exec(url)[1]]); m.net.tile = () => Promise.resolve(); m.net.today = () => '${D('20261115')}'; m.resetLayers(); return m.layersCtl().probe(true); })`);
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 43.13, lon: -80.75, name: 'Oxford', country: 'CA' } }))`); await sleep(500);
  for (const w of WIDTHS) {
    await size(w); await sleep(500);
    const states = { 'the bare map': async () => {}, 'Places open': async () => { await js(`document.querySelector('[data-panel=places]').click()`); await until(`document.querySelector('.mapx-panel')`); }, 'Layers open with two legends': async () => { await js(`document.querySelector('[data-panel=layers]').click()`); await until(`document.querySelector('.mapx-panel') && [...document.querySelectorAll('.mapx-lrow input')].every(i => !i.disabled)`, 8000); await js(`document.querySelector('[data-layer=ndvi]').click()`); await until(`document.querySelector('[data-legend=ndvi]')`); await js(`document.querySelector('[data-layer=rain]').click()`); await until(`document.querySelector('[data-legend=rain]')`); }, 'a legend and the About card': async () => { await js(`import('/js/mapx.js').then(m => m.openAbout())`); await until(`document.querySelector('.spot')`, 6000).catch(() => {}); } };
    for (const [name, open] of Object.entries(states)) {
      await js(`document.querySelector('.mapx-panel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelector('.spot')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); import('/js/maplayers.js').then(l => l.layersCtl().allOff())`); await sleep(200);
      await open(); await sleep(400);
      const m = await js(MEASURE);
      check(`${w} px, ${name}: no control lies over another`, m.overlaps.length === 0, [m.overlaps, m.boxes, m.map]);
      check(`${w} px, ${name}: every control is inside the map`, m.outside.length === 0, [m.outside, m.boxes, m.map]);
      check(`${w} px, ${name}: the buttons of the top bars are one height`, m.barHeights.length <= 1, m.barHeights);
      check(`${w} px, ${name}: every bar button, row and close is at least 44 px each way`, m.small.length === 0, m.small);
    }
  }
  await size(1280);
});

const animOf = sel => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const c = getComputedStyle(e); return [c.animationName, c.animationDuration, c.animationIterationCount]; })()`);
await group('motion', async () => {
  await mapReady(); await sleep(800);
  await js(`document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 43.13, lon: -80.75, name: 'Oxford', country: 'CA' } }))`); await sleep(700);
  const c = await centre(); await tool('rect'); await drag({ x: c.x - 70, y: c.y - 40 }, { x: c.x + 70, y: c.y + 40 }); await until(`document.querySelector('.spot')`); await sleep(500);
  const zoomNow = () => js(`import('/js/mapbase.js').then(m => m.baseNow().leaflet().getZoom())`);
  await sleep(900);   // the close has played
  for (const [mode, label] of [['', 'Full'], ['less', 'Less'], ['reduce', 'Still']]) {
    await js(`document.documentElement.dataset.motion = ${JSON.stringify(mode)}; document.querySelector('.spot')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(100);
    // changed: the close marches the dashes once and then rests solid (motion over 5 s must stop, WCAG 2.2.2), and nothing on the map loops at any level
    const core = await animOf('path.mapx-core.mapx-out');
    check(`${label}: the finished outline rests solid, with no animation running`, core && core[0] === 'none' && await js(`getComputedStyle(document.querySelector('path.mapx-core.mapx-out')).strokeDasharray === 'none'`), core);
    check(`${label}: nothing on the map loops`, await js(`document.getAnimations().filter(a => document.querySelector('#mapx').contains(a.effect?.target) && !a.effect.target.closest?.('.mapx-busy')).every(a => a.effect.getTiming().iterations !== Infinity)`));
    // the pin as it lands (the style of each level): Full slides and fades it in, Less only fades it (200 ms or less), Still moves nothing
    await js(`(() => { const e = document.querySelector('.mapx-pin'); e.classList.remove('landing'); void e.offsetWidth; e.classList.add('landing'); })()`);
    const body = await animOf('.mapx-pin .mapx-pinbody');
    if (mode === '') check('Full: the pin slides down and fades in as it lands', /mapx-slide/.test(body[0]) && /mapx-fade/.test(body[0]), body);
    if (mode === 'less') check('Less: the pin only fades in (200 ms or less) or simply appears', (body[0] === 'none' || (body[0] === 'mapx-fade' && parseFloat(body[1]) <= 0.2)) && body[2] === '1', body);
    if (mode === 'reduce') check('Still: the pin does not move', parseFloat(body[1]) <= 0.001, body);   // the still switch makes every animation end at once
    await js(`document.querySelector('.mapx-pin').classList.remove('landing')`);
    // no flying: the view buttons and "Zoom to your field" jump
    const z0 = await zoomNow(); await js(`document.querySelector('[data-view=in]').click()`);
    const gliding = await js(`import('/js/mapbase.js').then(m => !!m.baseNow().leaflet()._animatingZoom)`);
    if (mode !== '') check(`${label}: Zoom in jumps, it does not glide`, gliding === false && (await zoomNow()) === z0 + 1, [gliding, z0, await zoomNow()]);
    else await sleep(500);
    await js(`document.querySelector('[data-view=field]').click()`);
    const flying = await js(`import('/js/mapbase.js').then(m => { const map = m.baseNow().leaflet(); return !!(map._animatingZoom || map._panAnim?._inProgress); })`);
    if (mode !== '') check(`${label}: Zoom to your field jumps, it does not fly`, flying === false, flying);
    await sleep(700);
    // a pan stops where the hand stops
    await js(`import('/js/mapbase.js').then(m => { const map = m.baseNow().leaflet(); document.querySelector('.leaflet-container').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9 })); window.__inertia = map.options.inertia; })`);
    same(`${label}: the pan keeps gliding after the hand lifts only under Full`, await js(`window.__inertia`), mode === '');
  }
  // the card slides in under Full, fades under Less, and does not move under Still
  for (const [mode, want] of [['', 'spot-in'], ['less', 'mapx-fade'], ['reduce', 'none']]) {
    await js(`document.documentElement.dataset.motion = ${JSON.stringify(mode)}; document.querySelector('.spot')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(200);
    await js(`import('/js/mapx.js').then(m => m.openAbout())`); await until(`document.querySelector('.spot') && document.querySelector('.spot').style.opacity === ''`);
    const card = await animOf('.spot');
    check(`the card: ${mode === '' ? 'Full' : mode === 'less' ? 'Less' : 'Still'} gives its ${want === 'none' ? 'no animation' : want}`, mode === 'reduce' ? card[0] === 'none' : mode === 'less' ? (card[0] === 'none' || (card[0] === want && parseFloat(card[1]) <= 0.2)) : card[0] === want, card);   // under Less the page's own rule may leave the card no animation at all
  }
  await js(`document.documentElement.dataset.motion = ''`);
});

await group('basenote', async () => {
  // the map's status line (the longest one: the detailed names did not load) sits at the bottom edge, never over the middle third of the map's height, at the phone widths and with the largest text
  for (const largest of [false, true]) for (const w of [320, 375, 390]) {
    await size(w); await mapReady();
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: '${largest ? 'xlarge' : 'default'}' }))`); await sleep(400);
    await js(`(() => { const n = document.querySelector('#mapxBaseNote'); n.textContent = "The detailed map did not load, so NASA's satellite picture shows without place names. It tries again in ten minutes."; n.hidden = false; return 1; })()`); await sleep(500);
    const m = await js(`(() => { const map = document.querySelector('#mapx').getBoundingClientRect(), n = document.querySelector('#mapxBaseNote').getBoundingClientRect(); return { h: Math.round(map.height), top: Math.round(n.top - map.top), bottom: Math.round(n.bottom - map.top), pe: getComputedStyle(document.querySelector('#mapxBaseNote')).pointerEvents }; })()`);
    check(`at ${w} px${largest ? ' with the largest text' : ''} the status line is below the middle third of the map, inside it, and takes no tap`, m.top >= m.h * 2 / 3 - 1 && m.bottom <= m.h + 1 && m.pe === 'none', m);
  }
  await js(`import('/js/settings.js').then(m => m.saveSettings({ text: 'default' }))`); await size(1280);
});

await group('stack', async () => {
  await mapReady();
  same('five buttons, each named', await js(`[...document.querySelectorAll('.mapx-stack button')].map(b => b.getAttribute('aria-label'))`), ['Zoom in', 'Zoom out', 'Zoom to your field', 'Move the pin to where I am', 'Full-screen map']);
  check('every button is at least 44 by 44', await js(`[...document.querySelectorAll('.mapx-stack button')].every(b => { const r = b.getBoundingClientRect(); return r.width >= 43.5 && r.height >= 43.5; })`));
  const z0 = await js(`document.querySelector('.leaflet-container')._leaflet_map?.getZoom?.() ?? -1`);
  await js(`document.querySelector('[data-view=field]').click()`);
  check('Zoom to your field with no pin says to drop one', /Drop a pin first/.test(await js(`document.querySelector('#toast').textContent`)));
  await js(`document.querySelector('[data-view=full]').click()`); await sleep(100);
  same('full screen toggles, hides the top bar and renames its button', await js(`[document.querySelector('#mapx').classList.contains('full'), getComputedStyle(document.querySelector('.nav')).display, document.querySelector('[data-view=full]').getAttribute('aria-label')]`), [true, 'none', 'Exit full-screen map']);
  await js(`document.querySelector('#mapx').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(100);
  check('Escape leaves full screen', await js(`!document.querySelector('#mapx').classList.contains('full')`));
  await js(`Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (ok, bad) => bad({ code: 1 }) }, configurable: true })`);
  await js(`document.querySelector('[data-view=here]').click()`);
  same('a refused location is explained', await js(`document.querySelector('#toast').textContent`), 'Location is switched off for this site. Allow it in your browser settings, or search for a place or paste coordinates instead.');
  await js(`Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: ok => ok({ coords: { latitude: 44.3894, longitude: -79.6903 } }) }, configurable: true })`);
  await js(`document.querySelector('[data-view=here]').click()`); await until(`document.querySelector('.mapx-pin')`);
  same('a found position puts the pin there', await js(`import('/js/mapx.js').then(m => [m.mapState().pin.lat, m.mapState().pin.lon])`), [44.3894, -79.6903]);
  check('the picture is credited to NASA', /NASA GIBS/.test(await js(`document.querySelector('#mapxCredit').textContent`)));
  check('no sea, lake or border name is drawn by the page (only the photo)', await js(`!document.querySelector('.leaflet-tooltip, .leaflet-marker-icon[title*=" Sea"]')`));
});

await group('fit', async () => {
  for (const largest of [false, true]) for (const w of WIDTHS) {
    await size(w); await mapReady();
    await js(`import('/js/settings.js').then(m => m.saveSettings({ text: '${largest ? 'xlarge' : 'default'}' }))`); await sleep(250);
    await flat(`the setup map at ${w} px${largest ? ' with the largest text' : ''}`);
    check(`the map at ${w} px has a real height and width`, await js(`(() => { const r = document.querySelector('#mapx').getBoundingClientRect(); return r.width >= 200 && r.height >= 120; })()`));
    check(`the tools, the stack and the credit stay inside the map at ${w} px (the ones a short map hides are left out)`, await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(); return ['.mapx-top', '.mapx-stack', '.mapx-credit', '.leaflet-control-scale'].every(s => { const e = document.querySelector(s); if (getComputedStyle(e).display === 'none') return true; const r = e.getBoundingClientRect(); return r.left >= m.left - 1 && r.right <= m.right + 1 && r.top >= m.top - 1 && r.bottom <= m.bottom + 1; }); })()`));
  }
});

await group('axe', async () => {
  const axe = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8');
  for (const w of WIDTHS) {
    await size(w); await mapReady(); await js(axe);
    for (const [name, prep] of [['the map', ''], ['the map with a pin', `import('/js/mapx.js').then(m => 1); document.querySelector('#mapx').focus()`]]) {
      if (prep) await js(prep); await sleep(250);
      const found = await js(`axe.run(document.querySelector('#view-setup'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }).then(r => r.violations.map(v => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target.join(' ').slice(0, 70)))`);
      check(`axe: ${name} at ${w} px has no problem`, found.length === 0, found.join(' | '));
    }
  }
});

await finish();
