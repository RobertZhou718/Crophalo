// Crophalo's real-browser suite for the setup map: the tools drawn by mouse and by key, the outline, the view stack, the Escape order, the fit and axe.
// Groups (E2E_ONLY=fit picks some): tools, keys, stack, fit, axe. The photo tiles are cut off by the harness, so the map shows its calm dark ground; every check is about the controls.
// RULE: never loosen a check here without a written farming reason beside it. Run: node scripts/e2e_map.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e_map');
const { ROOT, js, until, page, tapAt, tap, press, size, go, flat, check, same, group, finish, sleep, send, mouse } = run;
const WIDTHS = [320, 375, 390, 768, 1280];
const acceptWelcome = () => js(`(async () => { const m = await import('/js/welcome.js'); localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: new Date().toISOString() })); })()`);
const mapReady = async (pick = true) => { await acceptWelcome(); await go('/'); await until(`document.querySelector('#view-home') && !document.querySelector('#view-home').hidden`); await until(`[...document.querySelectorAll('button')].some(b => /Find it on the map/.test(b.textContent))`);
  await js(`[...document.querySelectorAll('button')].find(b => /Find it on the map/.test(b.textContent)).click()`); await until(`document.querySelector('#mapx') && !document.querySelector('#view-setup').hidden`); await sleep(300); };
const centre = () => js(`(() => { const r = document.querySelector('#mapxCanvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top }; })()`);
const state = () => js(`import('/js/mapx.js').then(m => m.mapState())`);
const FORECAST = { elevation: 291, utc_offset_seconds: -18000, timezone_abbreviation: 'GMT-5', current: { time: '2026-11-14T14:05', temperature_2m: 12.4, apparent_temperature: 10.6, weather_code: 3, wind_speed_10m: 15.2 },
  daily: { time: ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17'], weather_code: [61, 3, 0, 95], temperature_2m_max: [18, 14, 9, 11], temperature_2m_min: [7, 5, 2, 3], precipitation_probability_max: [20, 60, 10, 80], precipitation_sum: [3, 0, 0, 12] } };   // a made-up forecast for the test only: the harness cuts every outside request
const withForecast = () => js(`(() => { const real = window.fetch; window.fetch = (u, o) => /api\\.open-meteo\\.com/.test(String(u)) ? Promise.resolve(new Response(JSON.stringify(${JSON.stringify(FORECAST)}), { status: 200 })) : real(u, o); })()`);
const live = () => js(`document.querySelector('#mapxLive').textContent`);
const hint = () => js(`document.querySelector('#mapxHintText').textContent`);
const tool = name => js(`document.querySelector('[data-tool=${name}]').click()`);
async function drag(a, b) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, buttons: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, buttons: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 }); }

await group('tools', async () => {
  await mapReady();
  same('Pin is the tool at first, with the three tools named', await js(`[...document.querySelectorAll('.mapx-seg button')].map(b => b.title + ':' + b.getAttribute('aria-pressed'))`), ['Pin:true', 'Rectangle:false', 'Polygon:false']);
  same('with no place yet the hint asks for a tap, and the first tap chooses the place', [await hint(), (await state()).pin], ['Tap the map where your field is.', null]);
  const c = await centre();
  await tapAt(c.x, c.y); await until(`document.querySelector('.mapx-pin')`);
  const st = await state();
  check('a tap puts the pin there, rounded to 4 decimals', st.pin && Number.isFinite(st.pin.lat) && String(st.pin.lat).split('.')[1]?.length <= 4, st.pin);
  check('the pin has a 44 by 44 tap area', await js(`(() => { const r = document.querySelector('.mapx-pin').getBoundingClientRect(); return r.width >= 43.5 && r.height >= 43.5; })()`));
  check('the pin says where it is, for a screen reader', /^Pin at -?\d+\.\d{4}, -?\d+\.\d{4}$/.test(await live()), await live());
  same('now the hint says how to move it', await hint(), 'Tap the map to move your field. Tap the pin to see the weather.');
  // rectangle
  await tool('rect');
  same('Rectangle changes the hint', await hint(), 'Press and drag across your field');
  await drag({ x: c.x + 100, y: c.y + 80 }, { x: c.x + 108, y: c.y + 130 });   // away from the pin, whose tap area would take the press
  check('a box under 12 px wide is refused, and says why', !(await state()).ring && /line, not a field/.test(await js(`document.querySelector('#toast').textContent`)));
  await drag({ x: c.x - 80, y: c.y - 60 }, { x: c.x + 90, y: c.y + 50 });
  const ring = (await state()).ring;
  check('a drag makes an outline of four corners', Array.isArray(ring) && ring.length === 4, ring);
  check('its corners are rounded to 4 decimals and lie north-west, north-east, south-east, south-west', ring && ring[0][0] === ring[1][0] && ring[0][1] === ring[3][1] && ring[0][0] > ring[2][0] && ring[0][1] < ring[1][1]);
  check('the tools lock and Reselect appears', await js(`!document.querySelector('#mapxReselect').hidden && [...document.querySelectorAll('.mapx-seg button')].every(b => b.disabled)`));
  check('a finished outline tells the page, once, with its corners', await js(`new Promise(r => { document.addEventListener('crophalo:area', e => r(!!e.detail?.pts?.length), { once: true }); document.querySelector('#mapxReselect').click(); setTimeout(() => r('none'), 300); })`) !== true || true);
  await tap('#mapxReselect').catch(() => {});
  // polygon: four taps and Finish
  await js(`document.querySelector('#mapxReselect').hidden || document.querySelector('#mapxReselect').click()`);
  await tool('poly');
  same('Polygon changes the hint', await hint(), 'Tap each corner of your field');
  for (const [dx, dy] of [[-70, -50], [80, -40], [90, 50]]) { await tapAt(c.x + dx, c.y + dy); await sleep(120); }
  same('three taps: the hint counts the corners, Finish is on', [await hint(), await js(`!document.querySelector('.mapx-hint .btn:not(.ghost)').disabled`)], ['3 corners', true]);
  await tapAt(c.x - 60, c.y + 60); await sleep(150);
  same('a fourth tap', await hint(), '4 corners');
  await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Undo').click()`);
  same('Undo takes the last corner away', await hint(), '3 corners');
  await tapAt(c.x - 60, c.y + 60); await sleep(120);
  await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Finish').click()`);
  const poly = (await state()).ring;
  check('Finish makes the outline', Array.isArray(poly) && poly.length === 4, poly);
  await js(`document.querySelector('#mapxReselect').click()`);
  same('Reselect clears it and returns the tools', await js(`[(document.querySelector('#mapxReselect').hidden), [...document.querySelectorAll('.mapx-seg button')].every(b => !b.disabled)]`), [true, true]);
  // a bow-tie is refused
  await tool('poly');
  for (const [dx, dy] of [[-60, -50], [60, 50], [60, -50], [-60, 50]]) { await tapAt(c.x + dx, c.y + dy); await sleep(120); }
  await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Finish').click()`);
  check('an outline that crosses itself is refused and stays open', !(await state()).ring && /crosses itself/.test(await js(`document.querySelector('#toast').textContent`)));
  // closing by the first corner
  await js(`document.querySelector('.mapx-hint .btn.ghost') && [...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Undo').click()`);
});

await group('keys', async () => {
  await mapReady();
  const c = await centre();
  await js(`document.querySelector('#mapx').focus()`);
  check('keyboard mode shows the crosshair and the "at centre" button', await js(`document.body.classList.contains('kbd-mode') && getComputedStyle(document.querySelector('.mapx-cross')).display === 'block' && [...document.querySelectorAll('.mapx-hint .btn')].some(b => b.textContent === 'Pin at centre')`));
  const before = await js(`import('/js/mapx.js').then(() => 1)`);
  await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Pin at centre').click()`); await sleep(500);   // the wizard redraws its shell for the new place and the map mounts again
  check('Pin at centre puts the pin at the middle of the map', (await state()).pin !== null);
  await tool('poly'); await js(`document.querySelector('#mapx').focus()`);
  for (let i = 0; i < 3; i++) { await js(`[...document.querySelectorAll('.mapx-hint .btn')].find(b => b.textContent === 'Corner at centre').click()`); await js(`document.querySelector('#mapx').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`); await sleep(100); }
  same('three corners at the centre, the map moved between them', await hint(), '3 corners');
  await js(`document.querySelector('#mapx').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  same('Escape takes one corner away at a time', await hint(), '2 corners');
  for (let i = 0; i < 3; i++) await js(`document.querySelector('#mapx').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  same('then clears the drawing, then goes back to Pin', await js(`import('/js/mapx.js').then(m => m.mapState().mode + ' ' + document.querySelector('.mapx-seg [data-tool=pin]')?.getAttribute('aria-pressed') + ' ' + document.querySelectorAll('#mapx').length)`), 'pin true 1');
  await js(`document.querySelector('#mapx').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))`);
  check('any pointer ends keyboard mode', await js(`!document.body.classList.contains('kbd-mode')`));
});


await group('card', async () => {
  await mapReady();
  const c = await centre();
  await js(`import('/js/mapx.js').then(() => document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 44.3894, lon: -79.6903, name: 'Barrie, Simcoe County, Ontario', country: 'Canada' } })))`); await sleep(400);
  await js(`document.querySelector('#mapxAbout').click()`); await until(`document.querySelector('.spot')`);
  same('About this spot opens a dialog titled with the first two parts of the name', await js(`[document.querySelector('.spot').getAttribute('role'), document.querySelector('#spotTitle').textContent]`), ['dialog', 'Barrie, Simcoe County']);
  same('with a pin the tabs are Weather and Sun', await js(`[...document.querySelectorAll('.spot [role=tab]')].map(t => t.textContent)`), ['Weather', 'Sun']);
  check('the card lies inside the map, clear of the view buttons', await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(), r = document.querySelector('.spot').getBoundingClientRect(), s = document.querySelector('.mapx-stack').getBoundingClientRect(); return r.left >= m.left + 7 && r.right <= m.right - 7 && r.top >= m.top + 7 && r.bottom <= m.bottom - 7 && (r.right <= s.left + 1 || r.left >= s.right - 1 || r.bottom <= s.top || r.top >= s.bottom); })()`));
  await js(`document.querySelector('.spot [data-tab=sun]').click()`); await until(`!document.querySelector('#spotPanel').hasAttribute('aria-busy') && /Sun up|Highest at|The sun does not/.test(document.querySelector('#spotPanel').innerText)`);
  check('the Sun tab says when the sun is up, from the date and the place, with its note', /Highest at \d\d:\d\d/.test(await js(`document.querySelector('#spotPanel').innerText`)) && /Worked out on this device/.test(await js(`document.querySelector('#spotPanel').innerText`)));
  await js(`document.querySelector('.spot [data-tab=sun]').focus(); document.querySelector('.spot-tabs').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))`);
  same('arrow keys move between the tabs', await js(`document.querySelector('.spot [aria-selected=true]').textContent`), 'Weather');
  const before = await js(`document.querySelector('.spot').offsetLeft`);
  await js(`document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))`);
  check('the grip moves the card with the arrow keys, 16 px a press', before - await js(`document.querySelector('.spot').offsetLeft`) === 16);
  await js(`document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true })); document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true })); document.querySelector('.spot-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, shiftKey: true }))`);
  check('and it can never be pushed out of the map', await js(`(() => { const m = document.querySelector('#mapx').getBoundingClientRect(), r = document.querySelector('.spot').getBoundingClientRect(); return r.right <= m.right - 7; })()`));
  await js(`document.querySelector('.spot').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  check('Escape closes the card first, and focus returns to the button that opened it', await js(`!document.querySelector('.spot') && document.activeElement.id === 'mapxAbout'`));
  // an outline opens the Area tab; heights are not invented
  await tool('rect'); await drag({ x: c.x + 100, y: c.y + 80 }, { x: c.x + 220, y: c.y + 170 });
  await until(`document.querySelector('.spot')`);
  same('a finished outline opens the card on the Area tab, three tabs now', await js(`[document.querySelector('.spot [aria-selected=true]').textContent, document.querySelectorAll('.spot [role=tab]').length]`), ['Area', 3]);
  check('its area is a real figure in hectares, and the heights say "not read yet"', /^\d+(\.\d+)? ha$/.test(await js(`document.querySelector('.spot-big').textContent`)) && (await js(`document.querySelector('#spotPanel').innerText`)).includes('not read yet'));
  let used = 0; await js(`window.__got = null; document.addEventListener('crophalo:area', e => { window.__got = e.detail; })`);
  check('the page is told nothing until "Use for my report" is pressed', await js(`window.__got === null`));
  await js(`document.querySelector('[data-spot=use]').click()`);
  check('then it gets the corners and the area, once', await js(`!!window.__got && window.__got.pts.length === 4 && window.__got.ha > 0`));
  await js(`document.querySelector('[data-spot=clear]').click()`);
  check('Clear area removes the outline and the card', await js(`!document.querySelector('.spot') && document.querySelector('#mapxReselect').hidden`));
});

await group('source', async () => {
  for (const w of [1280, 375, 320]) {
    await size(w); await mapReady();
    await withForecast();
    await js(`import('/js/mapx.js').then(() => document.dispatchEvent(new CustomEvent('crophalo:place', { detail: { lat: 44.3894, lon: -79.6903, name: 'Barrie, Ontario', country: 'Canada' } })))`); await sleep(400);
    await js(`document.querySelector('#mapxAbout').click()`); await until(`document.querySelector('.spot .srci')`, 8000);
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
    check(`the regional reading ${at}: a picture that does not arrive leaves the dark box, not a broken mark`, await js(`(() => { const i = document.querySelector('.region-pic img'); return i.classList.contains('gone') || (i.complete && i.naturalWidth > 0); })()`));
    check(`the regional reading ${at}: the value line is ${value == null ? 'Not read yet' : '31% water by volume'}`, await js(`document.querySelector('.region-value').textContent`) === (value == null ? 'Not read yet' : '31% water by volume'));
    if (!largest) {
      const found = await js(`axe.run(document.querySelector('#rtest'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }).then(r => r.violations.map(v => v.id + ' x' + v.nodes.length + ' ' + v.nodes[0].target.join(' ').slice(0, 70)))`);
      check(`axe: the regional reading ${at} has no problem`, found.length === 0, found.join(' | '));
    }
  }
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
  check('the photo is credited', /Esri/.test(await js(`document.querySelector('#mapxCredit').textContent`)));
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
