// Crophalo's first real-browser suite: the page shell driven the way a farmer would, on the throwaway copy that scripts/e2e_lib.mjs makes and serves.
// Groups (E2E_ONLY=fit,axe picks some): shell, fit, motion, blue, keyboard, settings, axe, offline, errors; pictures only when E2E_SHOTS=<a folder outside the project>.
// RULE: never loosen a check here to make it pass without a written farming reason beside it. A failure means a farmer would meet a control that is
// too small, a page that scrolls sideways, something that moves when asked to be still, or an unnamed button: fix the page, not the test. Run: node scripts/e2e.mjs
import fs from 'node:fs';
import path from 'node:path';
import { openRun } from './e2e_lib.mjs';

const run = await openRun('e2e');
const { ROOT, js, page, until, seen, tap, tapAt, rest, press, size, device, go, flat, calmPress, shot, check, same, finish, sleep, send, cutOff, asked } = run;
// This suite drives the bar, the views and the settings as a farmer does on a second visit: the welcome sheet was read once and is out of the way.
// The welcome itself (it blocks until accepted, Escape cannot skip it) is driven by scripts/e2e_flow.mjs.
const welcomed = async () => { await js(`import('/js/welcome.js').then(m => localStorage.setItem(m.WELCOME_KEY, JSON.stringify({ v: m.WELCOME_VERSION, at: 'test' })))`); await go('/'); await rest(); };
const group = (label, body) => run.group(label, async () => { await welcomed(); await body(); });

// ---- the screens of the shell
const VIEWS = [
  { name: 'home', id: 'home', title: 'Start · Crophalo' }, { name: 'setup', id: 'setup', title: 'Farm setup · Crophalo' },
  { name: 'data', id: 'info', hash: '#data', title: 'Data · Crophalo', h1: 'Data' }, { name: 'privacy', id: 'info', hash: '#privacy', title: 'Privacy · Crophalo', h1: 'Privacy' },
  { name: 'limits', id: 'info', hash: '#limits', title: 'Limitations · Crophalo', h1: 'Limitations' }, { name: 'settings', id: 'info', hash: '#settings', title: 'Settings · Crophalo', h1: 'Settings' },
  { name: 'admin', id: 'admin', hash: '#admin', title: 'Admin · Crophalo' }, { name: 'report', id: 'report', title: 'Your report · Crophalo' }, { name: 'farm', id: 'farm', title: 'My farm · Crophalo' },
];
const WIDTHS = [320, 375, 390, 768, 1280];   // the two common phone widths, 375 and 390, are both walked
const settled = () => until(`document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity)`, 4000).catch(() => {});
const shows = v => `!document.querySelector('#view-${v.id}').hidden && document.title === ${JSON.stringify(v.title)}`;
async function open(v) {   // by its address where it has one, else by the app's own show()
  if (await js(shows(v))) return;
  await js(v.hash ? `location.hash = ${JSON.stringify(v.hash)}` : `import('/js/app.js').then(m => { m.show(${JSON.stringify(v.name)}); })`);
  await until(shows(v)); await settled();
  await seen(`document.activeElement === document.querySelector('#view-${v.id} h1')`, 600);   // the app moves the keyboard to the new heading a moment later; a test that acts before that would have its focus taken away
}
const setting = changes => js(`import('/js/settings.js').then(m => { m.saveSettings(${JSON.stringify(changes)}); })`);   // through the app's own settings store
const menuOpen = () => js(`document.querySelector('#navMenuBtn').getAttribute('aria-expanded') === 'true'`);
const openMenu = async () => { if (!await menuOpen()) await tap('#navMenuBtn'); await until(`getComputedStyle(document.querySelector('#navMenu')).display !== 'none'`); await settled(); };
const closeMenu = async () => { if (await menuOpen()) { await press('Escape'); await until(`document.querySelector('#navMenuBtn').getAttribute('aria-expanded') === 'false'`); } };
const openSaved = async () => { await tap('#navSaved'); await until(`document.querySelector('#dlgSaved').open`); await settled(); };
const closeSaved = async () => { await press('Escape'); await until(`!document.querySelector('#dlgSaved').open`); };
// Every screen there is at one width: each view, the Menu list where there is a Menu button, the Saved sheet, and the design page.
async function everyScreen(width, visit, { largest = false, still = false } = {}) {
  await size(width); await go('/');
  await setting({ text: largest ? 'xlarge' : 'default', motion: still ? 'reduce' : 'device' });
  for (const v of VIEWS) { await open(v); await visit(v.name); }
  await open(VIEWS[0]);
  if (width <= 1180) { await openMenu(); await visit('the Menu list'); await closeMenu(); }
  await openSaved(); await visit('the Saved sheet'); await closeSaved();
  await go('/design.html');   // the design page has its own switches for the same settings
  if (largest) await tap('[data-set=text] [data-val=xlarge]');
  if (still) await tap('[data-set=motion] [data-val=reduce]');
  await rest(); await settled(); await visit('design.html');
}

// ---- measures taken inside the page
const WIDGET = 'a[href], button, input, select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=link]';
const targets = () => page((T, WIDGET) => {   // what a finger must hit: 44 by 44 px on the glass, counting the invisible tap area a small button carries
  const small = [], touching = [], seen = [];
  // Behind an open sheet the page is out of reach (the browser makes it inert), so only the sheet's own controls are measured.
  const modal = document.querySelector('dialog:modal');
  // A bar that stays put while the page scrolls under it (the sticky Back and Next bar) is measured on its own: what slides beneath it is out of reach there, and is measured once scrolled into view.
  const layerOf = el => { for (let n = el; n && n !== document.body; n = n.parentElement) if (/^(sticky|fixed)$/.test(getComputedStyle(n).position)) return n; return null; };
  for (const el of T.controls().filter(el => el.matches(WIDGET) && (!modal || modal.contains(el)))) {
    const face = T.face(el), b = T.box(face), after = getComputedStyle(face, '::after'), zoom = face.offsetWidth ? b.w / face.offsetWidth : 1;
    const grow = side => after.content !== 'none' && after.position === 'absolute' ? Math.max(0, -parseFloat(after[side]) || 0) * zoom : 0;
    const w = b.w + grow('left') + grow('right'), h = b.h + grow('top') + grow('bottom');
    // A link in the middle of a sentence is as tall as its line; the rule for touch targets leaves such links out (WCAG 2.5.8, "inline").
    const inSentence = el.tagName === 'A' && !el.matches('.btn, .tbtn, .brand, .skip, .card, .bigbtn, .chip') && [...el.parentElement.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!inSentence && (w < 43.5 || h < 43.5)) small.push(`${T.name(el)} is ${Math.round(w)} × ${Math.round(h)} px`);
    if (!seen.some(s => s.face === face)) seen.push({ el, face, b, layer: layerOf(face) });
  }
  for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) {
    const a = seen[i], c = seen[j];
    if (a.face.contains(c.face) || c.face.contains(a.face)) continue;   // a field and the button inside it
    if (a.layer !== c.layer) continue;   // one rides on a bar the other scrolls under: they never sit side by side for a finger
    if (a.el.closest('.seg') && a.el.closest('.seg') === c.el.closest('.seg')) continue;   // the parts of one segmented control share one track: they are one control
    const dx = Math.max(0, Math.max(a.b.x, c.b.x) - Math.min(a.b.r, c.b.r)), dy = Math.max(0, Math.max(a.b.y, c.b.y) - Math.min(a.b.b, c.b.b)), gap = Math.hypot(dx, dy);
    if (gap < 2) touching.push(`${T.name(a.face)} and ${T.name(c.face)} are ${gap ? gap.toFixed(1) + ' px apart' : 'touching'}`);
  }
  return { small, touching, count: seen.length };
}, WIDGET);
const moving = () => page(T => {   // anything that would still move: a running animation, or a transition or wait longer than 50 ms
  const secs = v => Math.max(...v.split(',').map(s => s.trim().endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s) || 0)), slow = [];
  for (const el of document.querySelectorAll('*')) for (const pseudo of [null, '::before', '::after']) {
    const cs = getComputedStyle(el, pseudo); if (pseudo && cs.content === 'none') continue;
    const anim = cs.animationName !== 'none', loop = anim && /infinite/.test(cs.animationIterationCount);
    if (secs(cs.transitionDuration) > .05 || secs(cs.transitionDelay) > .05 || (anim && (secs(cs.animationDuration) > .05 || secs(cs.animationDelay) > .05 || loop)))
      slow.push(`${T.name(el)}${pseudo || ''}: transition ${cs.transitionDuration} after ${cs.transitionDelay}${anim ? `, animation ${cs.animationName} ${cs.animationDuration}${loop ? ' for ever' : ''}` : ''}`);
  }
  const left = a => { const t = a.effect?.getComputedTiming(); return t ? t.endTime - (a.currentTime ?? 0) : 0; };   // judged by the animation's own clock: a browser that is slow to draw its next frame is not motion
  const running = document.getAnimations().filter(a => a.playState === 'running' && left(a) > 50).map(a => `${a.animationName || a.transitionProperty || a.id || 'an animation'} on ${T.name(a.effect?.target)}`);
  return { slow: slow.slice(0, 3), slowCount: slow.length, running };
});
const curves = () => page(T => {   // every easing the page really uses, and every keyframe that is playing
  const bad = new Set(), over = v => [...v.matchAll(/cubic-bezier\(([^)]*)\)/g)].some(m => m[1].split(',').map(Number).some(n => n < 0 || n > 1)) || [...v.matchAll(/linear\(([^)]*)\)/g)].some(m => (m[1].match(/-?[\d.]+(?!\s*%)/g) || []).some(n => +n > 1 || +n < 0));
  for (const el of document.querySelectorAll('*')) for (const pseudo of [null, '::before', '::after']) { const cs = getComputedStyle(el, pseudo); for (const v of [cs.transitionTimingFunction, cs.animationTimingFunction]) if (over(v)) bad.add(`${T.name(el)}: ${v}`); }
  for (const a of document.getAnimations()) for (const k of a.effect?.getKeyframes?.() || []) {
    const m = k.transform && k.transform !== 'none' ? new DOMMatrixReadOnly(k.transform) : null;
    if (over(k.easing || '') || (m && (Math.hypot(m.a, m.b) > 1.001 || Math.hypot(m.c, m.d) > 1.001)) || parseFloat(k.scale) > 1.001) bad.add(`${a.animationName || 'an animation'} on ${T.name(a.effect.target)}: ${k.transform || k.scale || k.easing}`);
  }
  return [...bad].slice(0, 4);
});
const blues = () => page(T => {   // the colours a chosen control is painted with, and the ones a control that is not chosen is painted with
  const probe = name => { const i = document.createElement('i'); i.style.color = `var(${name})`; document.body.append(i); const c = T.rgba(getComputedStyle(i).color); i.remove(); return c; };
  const family = [probe('--accent'), probe('--accent-text')], inFamily = c => family.some(f => f[0] === c[0] && f[1] === c[1] && f[2] === c[2]);
  const paints = el => { const cs = getComputedStyle(el), list = [cs.backgroundColor, cs.backgroundImage, cs.color, cs.boxShadow];
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth)) list.push(cs.outlineColor);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(cs[`border${side}Width`])) list.push(cs[`border${side}Color`]);
    return list.flatMap(T.colours).filter(c => c[3] > .03); };
  const strong = c => T.sat(c) >= .2 && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) >= 30;   // a real colour, not a grey
  const CHOSEN = '[aria-pressed=true], [aria-checked=true], [aria-selected=true], [aria-current]:not([aria-current=false]), [aria-expanded=true], .on';
  const drawn = input => input.nextElementSibling?.matches('.sw, .cbx') ? input.nextElementSibling : input.closest('.choice, .lrow');
  const chosen = [...document.querySelectorAll(CHOSEN), ...[...document.querySelectorAll('input:checked')].map(drawn)].filter(el => el && T.shown(el) && !el.matches('.mic'));   // the microphone is red while it listens, as a recording light is
  const CAN_BE = '.tbtn, .tab, .seg button, button.chip, .choice, .lrow, .mapbtn, .sw, .cbx, .card.act';
  const plain = [...document.querySelectorAll(CAN_BE)].filter(el => T.shown(el) && !chosen.includes(el) && !el.matches(CHOSEN) && !el.matches(':focus, :has(:focus)'));
  return {
    chosen: chosen.length, plain: plain.length,
    // The chosen segment is marked by its raised white thumb and heavier dark words, as on the control a farmer knows from the phone: a second, blue mark on it would only add noise. It must still carry no other colour (the check below).
    notBlue: chosen.filter(el => !el.matches('.seg button') && !paints(el).some(inFamily)).map(el => `${T.name(el)} has no blue: ${paints(el).filter(strong).map(c => `rgb(${c.slice(0, 3)})`).join(' ') || 'only greys'}`),
    other: chosen.filter(el => paints(el).some(c => strong(c) && !inFamily(c))).map(el => `${T.name(el)} is also painted ${paints(el).filter(c => strong(c) && !inFamily(c)).map(c => `rgb(${c.slice(0, 3)})`).join(' ')}`),
    blueAtRest: plain.filter(el => paints(el).some(inFamily)).map(el => `${T.name(el)} is not chosen, yet it is blue`),
  };
});
const focusNow = () => page(T => {   // where the keyboard is, whether the eye can see it, and how strong its ring is against what lies beside it
  const el = document.activeElement; if (!el || el === document.body || el === document.documentElement) return null;
  const face = T.face(el), b = T.box(face), at = [...document.querySelectorAll('*')].indexOf(el);
  const rings = [];
  const layers = shadow => shadow === 'none' ? [] : shadow.split(/,(?![^(]*\))/).map(l => l.trim());
  for (const c of new Set([el, face, el.nextElementSibling, el.closest('.search')].filter(Boolean))) {
    const twin = c.cloneNode(false); twin.removeAttribute('id'); c.after(twin);   // the same thing without the keyboard on it: a ring only counts if it is not there at rest
    const cs = getComputedStyle(c), at = getComputedStyle(twin), restLayers = layers(at.boxShadow), restOutline = at.outlineStyle === 'none' ? '' : at.outlineColor + at.outlineWidth;
    twin.remove();
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 && cs.outlineColor + cs.outlineWidth !== restOutline) rings.push({ on: c, colour: T.rgba(cs.outlineColor), inside: parseFloat(cs.outlineOffset) < 0, reach: Math.abs(parseFloat(cs.outlineOffset)), width: parseFloat(cs.outlineWidth), restLayers });
    for (const layer of layers(cs.boxShadow)) { const px = (layer.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || []).map(parseFloat); if (px.length === 4 && !px[0] && !px[1] && !px[2] && px[3] >= 2 && !restLayers.includes(layer)) rings.push({ on: c, colour: T.rgba(layer), inside: /inset/.test(layer), width: px[3], shadow: true, restLayers }); }
  }
  const judged = rings.filter(r => r.colour).map(r => {
    const ground = r.inside ? T.ground(r.on) : T.ground(r.on.parentElement), ratio = T.ratio(T.over(r.colour, ground), ground);
    const hiddenBy = r.inside && !r.shadow && r.restLayers.some(l => /inset/.test(l) && String(T.rgba(l)) === String(r.colour) && parseFloat((l.replace(/rgba?\([^)]*\)/, '').match(/-?[\d.]+px/g) || [])[3]) >= r.reach);   // the ring at rest covers the band where the focus ring would be drawn
    return { ratio: hiddenBy ? 1 : ratio, why: hiddenBy ? 'its ring is drawn exactly where a ring of the same colour already is at rest' : `ring ${ratio.toFixed(2)}:1 against what lies beside it` };
  }).sort((p, q) => q.ratio - p.ratio)[0];
  return { name: T.name(el), at, visible: T.shown(face) && b.w >= 8 && b.h >= 8 && b.r > 0 && b.x < innerWidth, ratio: judged?.ratio ?? 0, why: judged?.why ?? 'no ring at all' };
});
const tabStops = () => page(T => {   // every control a key should reach, in the order of the page
  const all = [...document.querySelectorAll('*')];
  return T.controls().filter(el => el.tabIndex >= 0 && !(el.type === 'radio' && el.name && document.querySelector(`input[type=radio][name="${el.name}"]:checked`) && !el.checked)).map(el => ({ name: T.name(el), at: all.indexOf(el) }));
});
async function tabThrough(limit = 160) {   // press Tab until the focus leaves the page or comes round again
  const stops = [];
  for (let i = 0; i < limit; i++) { await press('Tab'); await settled(); const f = await focusNow(); if (!f || stops.some(s => s.at === f.at)) break; stops.push(f); }
  return stops;
}

// ---- shell: the home draws, the bar leads to its pages, the Menu opens and closes, focus and Back behave
await group('shell', async () => {
  same('shell: the home draws, alone', await js(`[...document.querySelectorAll('.view')].filter(v => !v.hidden).map(v => v.id)`), ['view-home']);
  same('shell: one main heading can be seen, and it is the home\'s', await page(T => [...document.querySelectorAll('h1')].filter(T.shown).map(h => h.textContent.trim().replace(/\s+/g, ' '))), ['Know your fieldbefore you plant.']);
  same('shell: the title of the start screen', await js('document.title'), 'Start · Crophalo');
  check('shell: the top bar stays at the top', await js(`getComputedStyle(document.querySelector('.nav')).position === 'sticky'`));

  await press('Tab');
  const skip = await page(T => ({ on: document.activeElement?.className, box: T.box(document.activeElement) }));
  check('shell: the first Tab lands on the skip link, and it comes into view', skip.on === 'skip' && skip.box.y >= 0 && skip.box.x >= 0, skip);
  await press('Enter');
  same('shell: the skip link moves the keyboard to the main part', await js('document.activeElement.id'), 'main');
  await press('Tab');
  check('shell: the main part does not stay focusable (it would catch every click on plain words)', await js(`!document.querySelector('#main').hasAttribute('tabindex')`));

  for (const v of VIEWS.filter(v => v.h1)) {
    await tap(`#navMenu a[href="${v.hash}"]`);
    check(`shell: ${v.h1} in the top bar leads to its page and sets its title`, await seen(shows(v)), await js('document.title'));
    same(`shell: ${v.h1}: the page heading, and the link looks chosen`, await js(`[document.querySelector('#infoTitle').textContent, document.querySelector('#navMenu a[href="${v.hash}"]').getAttribute('aria-current'), location.hash]`), [v.h1, 'page', v.hash]);
    check(`shell: ${v.h1}: the keyboard moves to the new heading`, await seen(`document.activeElement === document.querySelector('#view-info h1')`), await js('document.activeElement.tagName'));
  }
  await tap('#navFarm');
  check('shell: My farm leads to its page and sets its title', await seen(shows(VIEWS[8])), await js('document.title'));
  check('shell: My farm: the keyboard moves to the new heading', await seen(`document.activeElement === document.querySelector('#view-farm h1')`));
  same('shell: My farm looks chosen, the page links no longer do', await js(`[document.querySelector('#navFarm').getAttribute('aria-current'), document.querySelectorAll('#navMenu [aria-current]').length, location.hash]`), ['page', 0, '']);
  await tap('.brand');
  check('shell: the name in the bar leads home', await seen(shows(VIEWS[0])));
  for (const v of [VIEWS[1], VIEWS[6], VIEWS[7]]) { await open(v); check(`shell: the ${v.name} view shows alone, with its title and one heading`, await page((T, id) => [...document.querySelectorAll('.view')].filter(x => !x.hidden).length === 1 && [...document.querySelectorAll('h1')].filter(T.shown).length === 1 && T.shown(document.querySelector(`#view-${id} h1`)), v.id)); }
  await open(VIEWS[0]);

  await tap('#navSaved');
  check('shell: Saved opens its sheet, with the keyboard inside it', await seen(`document.querySelector('#dlgSaved').open && document.querySelector('#dlgSaved').contains(document.activeElement)`));
  await press('Escape');
  check('shell: Escape closes the sheet and the keyboard goes back to Saved', await seen(`!document.querySelector('#dlgSaved').open && document.activeElement.id === 'navSaved'`), await js(`'the sheet is ' + (document.querySelector('#dlgSaved').open ? 'open' : 'closed') + ', the keyboard is on ' + (document.activeElement.id || document.activeElement.tagName)`));
  await tap('#navSaved'); await until(`document.querySelector('#dlgSaved').open`); await settled(); await tap('#dlgSavedDone');
  check('shell: Done closes the sheet', await seen(`!document.querySelector('#dlgSaved').open`));
  await tap('#navSaved'); await until(`document.querySelector('#dlgSaved').open`); await settled(); await tapAt(12, 12);
  check('shell: a tap on the dimmed page closes the sheet', await seen(`!document.querySelector('#dlgSaved').open`));

  // the Back button steps back inside the app
  await tap('#navFarm'); await until(shows(VIEWS[8]));
  await tap('#navMenu a[href="#data"]'); await until(shows(VIEWS[2]));
  await js('history.back()');
  check('shell: Back from Data goes to My farm', await seen(shows(VIEWS[8])), await js('document.title'));
  await js('history.back()');
  check('shell: Back again goes home, still inside the app', await seen(shows(VIEWS[0]) + ` && location.pathname === '/'`), await js('document.title + " at " + location.href'));
  await js('history.forward()');
  check('shell: Forward goes to My farm again', await seen(shows(VIEWS[8])));
  // an address the app does not know: the farmer lands on the home, and Back always moves (it never stands still on the same screen)
  await js(`location.hash = '#nonsense'`);
  check('shell: an address the app does not know shows the home', await seen(shows(VIEWS[0])), await js('document.title'));
  await js('history.back()');
  check('shell: Back from there goes to My farm, where the farmer was', await seen(shows(VIEWS[8])), await js('document.title'));
  await go('/#nonsense');
  check('shell: a page opened at an address the app does not know shows the home', await seen(shows(VIEWS[0])));
  await tap('#navFarm'); await until(shows(VIEWS[8]));
  await js('history.back()');
  check('shell: My farm, then Back, goes home again', await seen(shows(VIEWS[0])), await js('document.title + " at " + location.href'));

  // the Menu, where the screen is too narrow for the four links
  same('shell: on a wide screen there is no Menu button and the four links sit in the bar', await page(T => [T.shown(document.querySelector('#navMenuBtn')), [...document.querySelectorAll('#navMenu a')].filter(T.shown).length]), [false, 4]);
  await size(375); await go('/');
  same('shell: on a phone the Menu is closed at first', await page(T => [document.querySelector('#navMenuBtn').getAttribute('aria-expanded'), [...document.querySelectorAll('#navMenu a')].filter(T.shown).length]), ['false', 0]);
  await tap('#navMenuBtn');
  check('shell: Menu opens its list, says so (aria-expanded) and moves the keyboard to the first link', await seen(`document.querySelector('#navMenuBtn').getAttribute('aria-expanded') === 'true' && document.activeElement === document.querySelector('#navMenu a')`));
  await settled();
  same('shell: the four pages are in the list', await page(T => [...document.querySelectorAll('#navMenu a')].filter(T.shown).map(a => a.textContent.trim())), ['Data', 'Privacy', 'Limitations', 'Settings']);
  await tap('#navMenuBtn');
  same('shell: the same button twice closes the list', await page(T => [document.querySelector('#navMenuBtn').getAttribute('aria-expanded'), [...document.querySelectorAll('#navMenu a')].filter(T.shown).length]), ['false', 0]);
  await tap('#navMenuBtn'); await until(`document.activeElement === document.querySelector('#navMenu a')`); await press('Escape');
  check('shell: Escape closes the list and the keyboard goes back to Menu', await seen(`document.querySelector('#navMenuBtn').getAttribute('aria-expanded') === 'false' && document.activeElement.id === 'navMenuBtn'`));
  await tap('#navMenuBtn'); await settled(); await tap('#navMenu a[href="#privacy"]');
  check('shell: choosing a page closes the list and opens the page', await seen(shows(VIEWS[3]) + ` && document.querySelector('#navMenuBtn').getAttribute('aria-expanded') === 'false'`));
  await tap('#navMenuBtn'); await settled(); await tapAt(60, 500);
  check('shell: a tap beside the list closes it', await seen(`document.querySelector('#navMenuBtn').getAttribute('aria-expanded') === 'false'`));
});

// ---- fit: nothing scrolls sideways, every control can be hit, no two controls touch
await group('fit', async () => {
  for (const width of WIDTHS) for (const largest of [false, true]) {
    await everyScreen(width, async screen => {
      const where = `${screen} at ${width} px${largest ? ' with the Largest text' : ''}`;
      await flat(where);
      const t = await targets();
      if (width <= 600) check(`fit: ${where}: every control is at least 44 × 44 px`, t.small.length === 0, t.small.join('; '));
      check(`fit: ${where}: no two controls touch (at least 2 px between them)`, t.touching.length === 0, t.touching.slice(0, 4).join('; '));
    }, { largest });
  }
  await size(320); await go('/');
  same('fit: the measure can see a page that is too wide', await page(T => { const wide = document.createElement('div'); wide.style.cssText = 'width:500px;height:4px'; document.querySelector('.hero').append(wide); const m = T.widest(320); wide.remove(); return [m.page > m.vw, m.count > 0]; }), [true, true]);
});

// ---- motion: still when asked, by the setting and by the device; and a press never changes a size
await group('motion', async () => {
  await size(375); await go('/');
  const free = await moving();
  check('motion: the measure sees motion while it is allowed', free.slowCount > 0, 'no transition over 50 ms was found on the home page, so the still checks would prove nothing');
  for (const [how, opts, on, off] of [['Always still', { still: true }, () => {}, () => {}], ['the device asks for less motion', {}, () => device({ 'prefers-reduced-motion': 'reduce' }), () => device()]]) {
    await on();
    for (const width of [375, 1280]) await everyScreen(width, async screen => {
      await sleep(120);
      const m = await moving();
      check(`motion: ${how}: nothing runs and nothing waits on ${screen} at ${width} px`, m.slowCount === 0 && m.running.length === 0, [...m.running.map(r => 'running: ' + r), ...m.slow].join('; '));
    }, opts);
    await go('/design.html'); if (opts.still) await tap('[data-set=motion] [data-val=reduce]');   // the samples that move on the design page: a toast, a sheet, the replays
    await settled();   // what was already under way when the switch was pressed may end; nothing new may start
    await tap('#demoToastBtn'); await tap('[data-replay-btn]'); await tap('#demoSheetBtn'); await sleep(120);
    const m = await moving();
    check(`motion: ${how}: an opened sheet, a toast and a replayed sample do not move either`, m.slowCount === 0 && m.running.length === 0, [...m.running.map(r => 'running: ' + r), ...m.slow].join('; '));
    await off();
  }
  await size(1280); await go('/'); await setting({ motion: 'device' });
  none('motion: no curve on the home page overshoots', await curves());
  for (const sel of ['.brand', '#navFarm', '#navSaved', '#navMenu a[href="#data"]', '#navMenu a[href="#settings"]']) none(`motion: ${sel} keeps its size and place while the mouse is held on it`, await calmPress(sel));
  await size(375); await go('/');
  for (const sel of ['#navFarm', '#navSaved', '#navMenuBtn']) none(`motion: on a phone ${sel} keeps its size and place while held`, await calmPress(sel));
  await go('/design.html');
  await tap('#demoToastBtn'); await tap('[data-replay-btn]'); await tap('#demoMenuBtn');
  none('motion: no curve and no playing keyframe on the design page overshoots or grows past full size', await curves());
  for (const sel of ['.btn.primary', '.bigbtn.primary', '.tab[aria-selected=true]', 'button.chip', 'label.choice', '.listen', '.iconbtn']) none(`motion: design page ${sel} keeps its size and place while held`, await calmPress(sel));
});
function none(label, list) { return check(label, list.length === 0, list.join('; ')); }

// ---- blue: a chosen control is the one blue; one that is not chosen is not blue
await group('blue', async () => {
  const judge = async where => { const b = await blues();
    none(`blue: ${where}: every chosen control is painted with the one blue`, b.notBlue); none(`blue: ${where}: no chosen control carries another colour`, b.other); none(`blue: ${where}: nothing is blue unless it is chosen`, b.blueAtRest); return b; };
  await open(VIEWS[2]); await rest();
  const data = await judge('the Data page');
  same('blue: the Data page: one thing is chosen (its link in the bar)', data.chosen, 1);
  await open(VIEWS[8]); await judge('My farm');
  await open(VIEWS[0]);
  same('blue: the home: nothing in the bar is chosen', (await judge('the home')).chosen, 0);
  await size(375); await go('/'); await openMenu(); await rest();
  same('blue: the open Menu button is the one chosen thing', (await judge('the Menu list')).chosen, 1);
  for (const width of [1280, 375]) { await size(width); await go('/design.html'); await rest(); await settled();
    const d = await judge(`design.html at ${width} px`);
    check(`blue: design.html at ${width} px: the samples of chosen and plain controls were all looked at`, d.chosen >= 15 && d.plain >= 15, `${d.chosen} chosen, ${d.plain} plain`); }
  same('blue: the one blue on the page is #0a63d8', await page(T => { const i = document.createElement('i'); i.style.color = 'var(--accent)'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; }), 'rgb(10, 99, 216)');
});

// ---- keyboard: Tab reaches every control, in the order of the page, and the eye can always see where it is
await group('keyboard', async () => {
  for (const [where, address, width] of [['the home', '/', 1280], ['the home on a phone', '/', 375], ['design.html', '/design.html', 1280], ['design.html on a phone', '/design.html', 375]]) {
    await size(width); await go(address); await settled();
    const want = await tabStops(), got = await tabThrough();
    none(`keyboard: ${where}: Tab reaches every control`, want.filter(w => !got.some(g => g.at === w.at)).map(w => w.name));
    check(`keyboard: ${where}: Tab follows the order of the page`, got.length > 1 && got.every((g, i) => !i || g.at > got[i - 1].at), got.map(g => g.name).join(' → '));
    none(`keyboard: ${where}: nothing takes the keyboard without being seen`, got.filter(g => !g.visible).map(g => g.name));
    none(`keyboard: ${where}: every stop shows a focus ring of 3:1 or better`, got.filter(g => g.ratio < 3).map(g => `${g.name} (${g.why})`));
    none(`keyboard: ${where}: no control asks for a place in the order of its own (tabindex above 0)`, await js(`[...document.querySelectorAll('[tabindex]')].filter(e => e.tabIndex > 0).map(e => e.outerHTML.slice(0, 60))`));
  }
  await size(1280); await go('/');
  for (let i = 0; i < 3; i++) await press('Tab');   // skip link, name, My farm
  same('keyboard: the third Tab is on My farm', await js('document.activeElement.id'), 'navFarm');
  await press('Enter');
  check('keyboard: Enter on My farm opens it', await seen(shows(VIEWS[8])));
  await go('/'); for (let i = 0; i < 4; i++) await press('Tab'); await press(' ');
  check('keyboard: Space on Saved opens its sheet', await seen(`document.querySelector('#dlgSaved').open`));
  const behind = [];
  for (let i = 0; i < 5; i++) { await press('Tab'); const out = await page(T => { const el = document.activeElement; return !el || el === document.body || document.querySelector('#dlgSaved').contains(el) ? '' : T.name(el); }); if (out) behind.push(out); }
  none('keyboard: Tab never reaches the page behind the open sheet', behind);
  await press('Escape');
  await size(375); await go('/');
  for (let i = 0; i < 5; i++) await press('Tab');   // skip link, name, My farm, Saved, Menu
  same('keyboard: on a phone the fifth Tab is on Menu', await js('document.activeElement.id'), 'navMenuBtn');
  await press('Enter'); await until(`document.activeElement === document.querySelector('#navMenu a')`);
  await settled(); const list = [await focusNow()]; for (let i = 0; i < 3; i++) { await press('Tab'); await settled(); list.push(await focusNow()); }
  same('keyboard: Enter opens the Menu and Tab walks its four links', list.map(f => f?.name.replace(/^.*"(.*)"$/, '$1')), ['Data', 'Privacy', 'Limitations', 'Settings']);
  none('keyboard: each link in the Menu shows a focus ring of 3:1 or better', list.filter(f => !f || f.ratio < 3).map(f => f ? `${f.name} (${f.why})` : 'the focus left the page'));
  await press('Tab', { shift: true }); await press('Tab', { shift: true }); await press('Tab', { shift: true }); await press('Tab', { shift: true });
  await settled(); const back = await focusNow();
  check('keyboard: Shift+Tab goes back to the Menu button, and its ring can be told from its open look', back?.name.includes('navMenuBtn') && back.ratio >= 3, back ? `${back.name} (${back.why})` : 'nothing has the focus');
  await press('Enter');
  check('keyboard: Enter on the open Menu button closes the list', await seen(`document.querySelector('#navMenuBtn').getAttribute('aria-expanded') === 'false'`));
  await press('Enter'); await until(`document.activeElement === document.querySelector('#navMenu a')`); await press('Tab'); await press('Enter');
  check('keyboard: Enter on a link of the Menu opens its page', await seen(shows(VIEWS[3])), await js('location.hash + " " + document.title'));
});

// ---- settings: the four looks, set through the app's own store, hold after a reload and are there before the first paint
await group('settings', async () => {
  same('settings: a new visit has no look set', await js(`Object.keys(document.documentElement.dataset)`), []);
  await setting({ text: 'large' });
  same('settings: Larger text grows the whole page by 15%', await js(`[document.documentElement.dataset.text, getComputedStyle(document.body).zoom]`), ['large', '1.15']);
  await setting({ text: 'xlarge', contrast: 'high', links: 'underline', motion: 'reduce' });
  same('settings: the four choices show on the page at once', await js(`(d => [d.text, d.contrast, d.links, d.motion])(document.documentElement.dataset)`), ['xlarge', 'high', 'underline', 'reduce']);
  same('settings: Largest text grows the whole page by 30%, High contrast makes the ink black', await js(`[getComputedStyle(document.body).zoom, getComputedStyle(document.body).color]`), ['1.3', 'rgb(0, 0, 0)']);
  same('settings: they are kept under the one key, as known choices only', await js(`JSON.parse(localStorage.getItem('crophalo.settings.v1'))`), { motion: 'still', listen: 'normal', text: 'xlarge', contrast: 'high', links: 'underline', area: 'auto', currency: 'USD' });   // Motion is now Full, Less or Still: the older stored 'reduce' is kept as the Still it meant, and the page still shows data-motion=reduce; area: the unit of area a farmer reads first, Automatic by default
  await go('/');
  same('settings: they are still there after the page is loaded again', await js(`(d => [d.text, d.contrast, d.links, d.motion])(document.documentElement.dataset)`), ['xlarge', 'high', 'underline', 'reduce']);

  // Before the first paint: a page that first shows at one size and then jumps to another moves every word under the farmer's eye.
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__look = {}; new MutationObserver(() => { if (document.documentElement?.dataset.text && !window.__look.set) window.__look.set = performance.now(); }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-text'] });
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__look[e.name] = e.startTime; }).observe({ type: 'paint', buffered: true });` });
  const jumps = async () => { await go('/'); await until(`window.__look && window.__look['first-paint'] > 0`, 8000); return js(`(l => l.set <= l['first-paint'] ? '' : 'first painted at ' + Math.round(l['first-paint']) + ' ms, the Largest text came at ' + Math.round(l.set) + ' ms')(window.__look)`); };
  const fast = [await jumps(), await jumps(), await jumps()].filter(Boolean);
  check('settings: the kept look is on the page before it is first painted (a fast connection)', fast.length === 0, fast.join('; '));
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 60e3, uploadThroughput: 30e3 });   // a slow phone connection, about half a megabit
  const slow = [await jumps(), await jumps()].filter(Boolean);
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send('Network.setCacheDisabled', { cacheDisabled: false });
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  check('settings: the kept look is on the page before it is first painted (a slow phone connection)', slow.length === 0, slow.join('; '));

  await js(`localStorage.setItem('crophalo.settings.v1', JSON.stringify({ text: 'huge', motion: '<b>', contrast: 7 }))`); await go('/');
  same('settings: a kept value the app does not know is not put on the page', await js(`Object.keys(document.documentElement.dataset)`), []);
  await js(`localStorage.setItem('crophalo.settings.v1', '{broken')`); await go('/');
  same('settings: a broken kept value leaves the defaults and the page still starts', await js(`[Object.keys(document.documentElement.dataset).length, document.title]`), [0, 'Start · Crophalo']);
});

// ---- axe: the accessibility checker kept for the tests, on every screen at two widths
await group('axe', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'vendor-test', 'axe.min.js'), 'utf8'), TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const width of [1280, 375]) await everyScreen(width, async screen => {
    if (!await js(`typeof window.axe === 'object'`)) await js(source + '\n;void 0');
    const found = await js(`axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => v.id + ' · ' + n.target.join(' ') + ' · ' + v.help)))`);
    for (const line of found) console.log(`axe  ${screen} at ${width} px: ${line}`);
    check(`axe: ${screen} at ${width} px: 0 problems`, found.length === 0, `${found.length} found, listed above`);
  });
  await go('/');
  await js(source + '\n;void 0');
  same('axe: the checker can see a problem (a button with no name, added for this one check)', await js(`(() => { const b = document.createElement('button'); b.id = 'nameless'; document.querySelector('.hero').append(b); return axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a'] }, resultTypes: ['violations'] }).then(r => { b.remove(); return r.violations.map(v => v.id); }); })()`), ['button-name']);
});

// ---- offline: with every outside service cut off the page still draws, and it asks the outside for no code
await group('offline', async () => {
  check('offline: the home draws with every outside request failing', await page(T => T.shown(document.querySelector('#view-home h1')) && document.querySelector('#offlineBar').hidden && document.title === 'Start · Crophalo'));
  const before = cutOff.length;
  same('offline: a request to an outside service really is cut off here', await js(`fetch('https://power.larc.nasa.gov/api/').then(() => 'answered', () => 'failed')`), 'failed');
  // the demo card on the home may still be asking for its satellite picture at this moment, so the NASA request is looked for among what was cut off, not only last
  check('offline: the cut-off request was seen and listed', cutOff.slice(before).filter(c => c.where.startsWith('power.larc.nasa.gov')).length === 1, cutOff.slice(before));
  none('offline: the app asks no outside address for a script, a style or a font', cutOff.filter(c => /Script|Stylesheet|Font/i.test(c.kind)).map(c => `${c.kind}: ${c.where}`));
  check('offline: the app\'s own files were asked for from the throwaway copy', asked.includes('/js/app.js') && asked.includes('/css/app.css') && asked.includes('/vendor/leaflet/leaflet.js'), asked.slice(0, 12));
  // the first screen alone, loaded afresh: the setup map asks for MapLibre when it opens (its Light map and the place names), as earlier groups do
  const firstFrom = asked.length; await go('/'); await until(`!document.querySelector('#view-home').hidden`); await sleep(1500);
  none('offline: the first screen does not ask for three.js or MapLibre', [...new Set(asked.slice(firstFrom).filter(a => /\/vendor\/(three|maplibre)\//.test(a)))]);
});

// ---- errors: every screen once more, at a wide and a narrow width; the group ends red on any page error or console error
await group('errors', async () => {
  let screens = 0;
  for (const width of [1280, 375]) await everyScreen(width, async () => { screens++; });
  await tap('#demoToastBtn'); await tap('#demoSheetBtn'); await press('Escape'); await tap('#demoMenuBtn'); await press('Escape'); await tap('.tab[aria-selected=false]'); await tap('.srci'); await tap('[data-replay-btn]');
  check('errors: every screen was opened, at 1280 and 375 px', screens === 2 * (VIEWS.length + 2) + 1, `${screens} screens`);
  check('errors: an unknown address shows the home, not a broken page', await go('/#nothing-here').then(() => seen(shows(VIEWS[0]))));
});

// ---- pictures, only when asked for
if (run.shots) await group('shots', async () => {
  for (const width of [320, 375, 1280]) {
    await size(width); await go('/'); await settled();
    for (const v of VIEWS) { await open(v); await rest(); await shot(`${v.name}-${width}.png`); }
    await go('/design.html'); await settled(); await shot(`design-${width}.png`);
  }
  await size(320); await go('/'); await setting({ text: 'xlarge' }); await settled(); await shot('home-320-largest-text.png');
  check(`shots: the pictures are in ${run.shots}`, fs.readdirSync(run.shots).filter(f => f.endsWith('.png')).length >= 31);
});

await finish();
