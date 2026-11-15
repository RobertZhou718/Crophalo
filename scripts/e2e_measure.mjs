// The screen-measuring suite, by hand and never in the automatic run (not yet run on this copy): a real browser walks every screen it can reach at 1440 by 900 and 390 by 844
// (and 320 wide for sideways scrolling) and lists what a rulebook can measure: small touch targets, small text, overflow, low contrast, heading order, unnamed controls, uneven button
// heights, and the words to read before the first thing to press. It is a measuring tool: a finding never fails the run. Needs the internet (the weather is let through to reach a report).
// Run: MEASURE_OUT=/some/folder/outside/the/project node scripts/e2e_measure.mjs   (the report is written there as screens-measured.md; with no MEASURE_OUT, into the system temp folder)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './e2e_lib.mjs';

const OUT_DIR = path.resolve(process.env.MEASURE_OUT || path.join(os.tmpdir(), 'crophalo-measure'));
if (!path.relative(ROOT, OUT_DIR).startsWith('..') && !path.isAbsolute(path.relative(ROOT, OUT_DIR))) { console.log('Refused: MEASURE_OUT is inside the Crophalo folder. Reports from tests go somewhere else.'); process.exit(1); }
process.env.E2E_LIVE_HOSTS = process.env.MEASURE_HOSTS || 'power.larc.nasa.gov,archive-api.open-meteo.com,api.open-meteo.com';   // the weather (NASA and the archive the report asks for), so a real report can be reached; nothing else leaves the throwaway copy
const { openRun } = await import('./e2e_lib.mjs');
const run = await openRun('e2e_measure');
const { js, until, seen, tap, press, size, go, check, finish, sleep, send } = run;
// The copy has no Python, so the server's own lookups cannot answer there: they are answered "not read" at the page, the way scripts/e2e_flow.mjs does it.
await send('Page.addScriptToEvaluateOnNewDocument', { source: "(() => { const first = window.fetch.bind(window); window.fetch = (u, ...rest) => /[/]api[/](smaproot|cropsnear|imergrain|gracecell|ecopass|hlsndvi|dem|ndvihist|faostat)[?]?/.test(String(u)) ? Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: false, reason: 'not read in this copy' }) }) : first(u, ...rest); })()" });

const SIZES = [[1440, 900], [390, 844]], NARROW = [320, 700], MOST = 40;   // at most 40 rows of one kind per screen and size; the rest are counted
const WELCOME = JSON.stringify({ v: '2026-11-14', at: 'test' });

// ---- the measuring, run inside the page. mode 'full' measures everything; 'narrow' only what sticks out sideways.
const MEASURE = String(function measure(mode) {
  const vw = document.documentElement.clientWidth;
  const dialogs = [...document.querySelectorAll('dialog[open], [role=dialog]:not([hidden])')].filter(d => d.getClientRects().length);
  const root = dialogs.at(-1) || [...document.querySelectorAll('.view')].find(v => !v.hidden) || document.body, inDialog = !!dialogs.length;
  const scope = inDialog ? root : document.body;
  const shown = el => { if (!el.getClientRects().length || el.closest('.sr')) return false; const s = getComputedStyle(el); if (s.visibility !== 'visible' || +s.opacity === 0) return false; const b = el.getBoundingClientRect(); if (b.width < 1 || b.height < 1) return false;
    if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return false; for (let p = el; p; p = p.parentElement) if (p.hidden || p.getAttribute('aria-hidden') === 'true' && p !== el) return false; return true; };
  const words = el => (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const find = el => { const parts = []; for (let p = el, n = 0; p && p.nodeType === 1 && n < 4; p = p.parentElement, n++) { if (p.id) { parts.unshift('#' + CSS.escape(p.id)); break; }
      const cls = [...p.classList].slice(0, 2).map(c => '.' + CSS.escape(c)).join(''), same = p.parentElement ? [...p.parentElement.children].filter(c => c.tagName === p.tagName) : [];
      parts.unshift(p.tagName.toLowerCase() + cls + (same.length > 1 ? `:nth-of-type(${same.indexOf(p) + 1})` : '')); } return parts.join(' > '); };
  const box = el => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top + scrollY), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, r: Math.round(b.right) }; };
  const all = [...scope.querySelectorAll('*')].filter(shown);
  // sideways: the page itself, and every part that sticks out of the screen
  const pageWide = document.documentElement.scrollWidth, out = { vw, pageWide, sideways: pageWide > vw, sticking: [] };
  for (const el of all) { const b = el.getBoundingClientRect(); if ((b.right > vw + 1 || b.left < -1) && getComputedStyle(el).position !== 'fixed' || (b.right > vw + 1 && b.width <= vw * 3)) {
      let clipped = false; for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) { const pb = p.getBoundingClientRect(); if (pb.right <= vw + 1 && pb.left >= -1) { clipped = true; break; } } }
      if (!clipped && b.right > vw + 1) out.sticking.push({ find: find(el), words: words(el), from: Math.round(b.left), to: Math.round(b.right) }); } }
  out.sticking = out.sticking.filter((s, i, a) => !a.some((o, k) => k < i && s.find.startsWith(o.find)));
  if (mode === 'narrow') return out;

  // controls a finger must hit
  const CONTROL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=link], [role=menuitem], [tabindex]:not([tabindex="-1"])';
  const controls = all.filter(el => el.matches(CONTROL) && !el.disabled);
  const hit = el => { const lab = /^(checkbox|radio)$/.test(el.type || '') || /^(switch|checkbox|radio)$/.test(el.getAttribute('role') || '') ? el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) : null; return lab && shown(lab) ? lab : el; };
  out.small = controls.map(el => ({ el, b: box(hit(el)) })).filter(({ b }) => b.w < 44 || b.h < 44).map(({ el, b }) => ({ find: find(el), words: words(el), size: `${b.w} by ${b.h}` }));
  // names for screen readers
  const nameOf = el => { const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
    const lab = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '', wrap = el.closest('label')?.textContent, img = el.querySelector?.('img[alt], svg title, [aria-label]');
    return (el.getAttribute('aria-label') || ids || lab || wrap || (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) ? '' : el.textContent) || el.getAttribute('title') || img?.getAttribute?.('alt') || img?.getAttribute?.('aria-label') || img?.textContent || (el.type === 'submit' || el.type === 'button' ? el.value : '') || '').replace(/\s+/g, ' ').trim(); };
  out.unnamed = controls.filter(el => !nameOf(el)).map(el => ({ find: find(el), words: el.getAttribute('placeholder') ? `(placeholder only: ${el.getAttribute('placeholder').slice(0, 40)})` : `(${el.tagName.toLowerCase()}${el.type ? ' ' + el.type : ''})` }));
  // text: size and contrast
  const rgba = text => { const m = /^rgba?\(([^)]+)\)/.exec(text); if (!m) return null; const p = m[1].split(/[ ,/]+/).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const behind = el => { const layers = []; for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.backgroundImage !== 'none') return { picture: true }; const c = rgba(s.backgroundColor); if (!c) return { unknown: true }; if (c.a > 0) layers.push(c); if (c.a >= 1) break; }
    let base = { r: 255, g: 255, b: 255, a: 1 }; for (const c of layers.reverse()) base = over(c, base); return { c: base }; };
  const tiny = new Map(), faint = new Map(), unmeasured = new Map();
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const el = n.parentElement; if (!n.nodeValue.trim() || !el || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(el.tagName) || !shown(el)) continue;
    const s = getComputedStyle(el), px = parseFloat(s.fontSize), text = n.nodeValue.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (px < 12 && !tiny.has(el)) tiny.set(el, { find: find(el), words: text, size: `${Math.round(px * 10) / 10} px` });
    if (faint.has(el) || unmeasured.has(el)) continue;
    const fg = rgba(s.color), bg = behind(el);
    if (!fg || bg.unknown) { unmeasured.set(el, { find: find(el), words: text, why: 'a colour the measure could not read' }); continue; }
    if (bg.picture) { unmeasured.set(el, { find: find(el), words: text, why: 'over a picture or a gradient' }); continue; }
    const c = over(fg, bg.c), a = lum(c), b = lum(bg.c), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), large = px >= 24 || (px >= 18.66 && +s.fontWeight >= 700), need = large ? 3 : 4.5;
    if (ratio < need) faint.set(el, { find: find(el), words: text, ratio: `${ratio.toFixed(2)} to 1 (needs ${need})`, colours: `${s.color} on rgb(${Math.round(bg.c.r)}, ${Math.round(bg.c.g)}, ${Math.round(bg.c.b)})`, size: `${Math.round(px)} px${large ? ', large' : ''}` }); }
  out.tiny = [...tiny.values()]; out.faint = [...faint.values()]; out.unmeasured = [...unmeasured.values()];
  // pieces of information (cards, notes, tips, help and source texts, empty states): the sentences shown before any fold; each one over four is listed
  const INFO = 'article, [class*="card"], [class*="note"], [class*="tip"], [class*="hint"], [class*="help"], [class*="blurb"], [class*="empty"], [class*="info"], [class*="src"], [role=note], [role=tooltip], [role=status], figcaption, details, dialog, [popover]';
  const sentencesOf = el => { const blocks = new Map(), tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) { const pe = n.parentElement; if (!n.nodeValue.trim() || !pe || !shown(pe) || pe.closest('button, a[href], select, option, h1, h2, h3, h4, h5, h6, [role=tab], [role=heading], label, summary, th, script, style')) continue;
      const blk = pe.closest('p, li, dd, dt, td, figcaption, blockquote, div, section, article') || el; blocks.set(blk, (blocks.get(blk) || '') + ' ' + n.nodeValue); }
    let count = 0, first = ''; for (const text of blocks.values()) for (const part of text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9"“(‘'])/)) if (part.split(/\s+/).filter(w => /[A-Za-z]/.test(w)).length >= 3) { count++; if (!first) first = part.slice(0, 70); }
    return { count, first }; };
  const infos = all.filter(el => el.matches(INFO) && el !== root && !el.matches('.view, body, main, header, nav'));
  out.long = infos.filter(el => !infos.some(o => o !== el && el.contains(o) && sentencesOf(o).count > 4)).map(el => ({ el, ...sentencesOf(el) })).filter(x => x.count > 4).map(x => ({ find: find(x.el), words: x.first, size: `${x.count} sentences (at most 4)` }));
  out.long = out.long.filter((x, i, arr) => arr.findIndex(o => o.find === x.find) === i);
  // headings
  const heads = all.filter(el => /^H[1-6]$/.test(el.tagName) || el.getAttribute('role') === 'heading').map(el => ({ level: +(el.getAttribute('aria-level') || el.tagName[1]), words: words(el), find: find(el) }));
  out.headings = heads.map(h => `h${h.level} ${h.words}`); out.h1 = heads.filter(h => h.level === 1).length; out.skipped = [];
  heads.forEach((h, i) => { const before = i ? heads[i - 1].level : 0; if (h.level > before + 1 && !(i === 0 && h.level === 1)) out.skipped.push({ find: h.find, words: h.words, jump: i ? `h${before} to h${h.level}` : `the first heading is h${h.level}` }); });
  // two controls side by side with heights 1 to 6 px apart
  out.uneven = []; const boxes = controls.map(el => ({ el, b: el.getBoundingClientRect() })).filter(x => x.b.height >= 16);
  for (let i = 0; i < boxes.length; i++) for (let k = i + 1; k < boxes.length; k++) { const a = boxes[i], b = boxes[k]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const overlap = Math.min(a.b.bottom, b.b.bottom) - Math.max(a.b.top, b.b.top), gap = Math.max(a.b.left, b.b.left) - Math.min(a.b.right, b.b.right), diff = Math.abs(a.b.height - b.b.height);
    if (overlap > Math.min(a.b.height, b.b.height) * 0.5 && gap >= 0 && gap <= 24 && diff >= 1 && diff <= 6) out.uneven.push({ find: `${find(a.el)}  and  ${find(b.el)}`, words: `${words(a.el)} / ${words(b.el)}`, size: `${Math.round(a.b.height * 10) / 10} and ${Math.round(b.b.height * 10) / 10} px high` }); }
  // the words before the first thing to press, inside the screen's own part (not the top bar)
  let count = 0, first = null; const w2 = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = w2.nextNode(); n; n = w2.nextNode()) { if (n.nodeType === 1) { if (n.matches(CONTROL) && shown(n) && !n.disabled && !n.classList.contains('skip')) { first = n; break; } continue; }
    const el = n.parentElement; if (!n.nodeValue.trim() || !el || /^(SCRIPT|STYLE)$/.test(el.tagName) || !shown(el)) continue; count += n.nodeValue.trim().split(/\s+/).length; }
  out.wordsBefore = count; out.firstPress = first ? { find: find(first), words: words(first) } : null; out.wordsOnScreen = (root.innerText || '').trim().split(/\s+/).filter(Boolean).length; out.controls = controls.length; out.part = inDialog ? 'a sheet or dialog' : root.id || 'the page';
  return out;
});

// ---- the walk
const found = [], missed = [];
const measureHere = async name => {
  const entry = { name, sizes: {} };
  for (const [w, h] of SIZES) { await size(w, h); await sleep(350); entry.sizes[`${w} by ${h}`] = await js(`(${MEASURE})('full')`); }
  await size(...NARROW); await sleep(350); entry.narrow = await js(`(${MEASURE})('narrow')`);
  await size(...SIZES[0]); await sleep(250);
  found.push(entry); console.log(`measured: ${name}`);
};
const screen = async (name, reach) => { try { const ok = await reach(); if (ok === false) { missed.push(`${name}: its way in was not found on this copy`); return false; } await measureHere(name); return true; } catch (e) { missed.push(`${name}: ${String(e?.message || e).slice(0, 160)}`); await size(...SIZES[0]).catch(() => {}); return false; } };
// press the first shown control whose words match; true when one was pressed
const pressWords = (re, within = 'document') => js(`(() => { const re = new RegExp(${JSON.stringify(re.source)}, 'i'), root = ${within === 'document' ? 'document' : `document.querySelector(${JSON.stringify(within)}) || document`};
  const el = [...root.querySelectorAll('button, a[href], [role=button], [role=tab], summary')].find(e => e.getClientRects().length && !e.disabled && re.test((e.getAttribute('aria-label') || '') + ' ' + (e.innerText || ''))); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`);
const closeSheets = async () => { for (let i = 0; i < 3 && await js(`!!document.querySelector('dialog[open]')`); i++) { await press('Escape'); await sleep(200); if (await js(`!!document.querySelector('dialog[open]')`)) await js(`document.querySelector('dialog[open]').close()`); } };
const accepted = () => js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`);
const reportShown = () => js(`!document.querySelector('#view-report')?.hidden && !!document.querySelector('#answer')`);

const WALK = process.env.MEASURE_WALK || 'all';   // all | farm | map | home: which screens to walk (the others are another copy's)
const srcCards = async name => {   // up to two source ("i") cards of the screen that is showing, opened and measured
  const n = await js(`document.querySelectorAll('.srci').length`).catch(() => 0);
  for (let i = 0; i < Math.min(2, n); i++) { await screen(`${name}: source card ${i + 1}`, async () => { const ok = await js(`(() => { const b = [...document.querySelectorAll('.srci')].filter(e => e.getClientRects().length)[${i}]; if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; })()`); if (!ok) return false; await sleep(500); return js(`!!document.querySelector('dialog[open], [popover]:popover-open, [role=dialog]:not([hidden])')`); }); await closeSheets(); await press('Escape').catch(() => {}); }
};
const toReport = async () => {   // from the first card of the home through the setup to a finished report
  await go('/'); await until(`document.querySelectorAll('#homeRegions .place-card').length > 0`, 30e3); await js(`document.querySelector('#homeRegions .place-card .cover').click()`);
  for (let i = 0; i < 6 && await seen(`!!document.querySelector('#wNext') && !document.querySelector('#view-setup').hidden`, 4000); i++) { await tap('#wNext').catch(() => js(`document.querySelector('#wNext').click()`)); await sleep(150); if (await js(`!document.querySelector('#view-report')?.hidden`)) break; }
  return seen(`!document.querySelector('#view-report')?.hidden && !document.querySelector('.rv-loading') && (!!document.querySelector('#answer') || document.querySelectorAll('#view-report [role=tab]').length >= 3)`, 100e3);
};
await size(...SIZES[0]);
if (WALK === 'all') {
await screen('Welcome (first visit)', async () => { await go('/'); return seen(`document.querySelector('#dlgWelcome')?.open`, 5000); });
await accepted();
await screen('Home', async () => { await go('/'); await until(`document.querySelectorAll('#homeRegions .place-card').length > 0`, 20e3); });
await screen('My farm, empty', async () => { if (!(await js(`!!document.querySelector('#navFarm')`))) return false; await js(`document.querySelector('#navFarm').click()`); return seen(`!document.querySelector('#view-farm').hidden`, 8000); });
await screen('Saved (nothing saved)', async () => { await go('/'); if (!(await js(`!!document.querySelector('#navSaved')`))) return false; await js(`document.querySelector('#navSaved').click()`); await sleep(500); });
await closeSheets();
for (const [name, hash] of [['Data', '#data'], ['Privacy', '#privacy'], ['Limitations', '#limits'], ['Settings', '#settings']]) {
  const ok = await screen(name, async () => { await go('/' + hash); return seen(`!document.querySelector('#view-info')?.hidden && document.querySelector('#infoBody')?.textContent.trim().length > 20`, 8000); });
  if (ok) { const tabs = await js(`[...document.querySelectorAll('#view-info [role=tab]')].map(t => t.textContent.trim())`);
    for (const t of tabs.slice(1)) await screen(`${name}: ${t}`, async () => { await js(`[...document.querySelectorAll('#view-info [role=tab]')].find(t => t.textContent.trim() === ${JSON.stringify(t)}).click()`); await sleep(300); }); }
}
// the setup steps, the loading screen and the report, from the first card of the home (the demo field)
await go('/'); await until(`document.querySelectorAll('#homeRegions .place-card').length > 0`, 20e3);
await js(`document.querySelector('#homeRegions .place-card .cover').click()`);
let steps = 0;
for (; steps < 6 && await seen(`!!document.querySelector('#wNext') && !document.querySelector('#view-setup').hidden`, 4000); steps++) {
  const title = await js(`document.querySelector('#wHeading')?.textContent.trim() || ''`);
  await screen(`Setup step ${steps + 1}${title ? `: ${title}` : ''}`, async () => {});
  await tap('#wNext').catch(() => js(`document.querySelector('#wNext').click()`)); await sleep(150);
  if (await js(`!document.querySelector('#view-report')?.hidden`)) { steps++; break; }
}
if (!steps) missed.push('Setup steps: the first card of the home did not open the setup');
if (await js(`!!document.querySelector('.rv-loading')`)) await screen('Loading screen', async () => {}); else missed.push('Loading screen: it was gone before it could be measured (or the report came at once)');
let gotReport = await seen(`!document.querySelector('#view-report')?.hidden && !document.querySelector('.rv-loading') && (!!document.querySelector('#answer') || document.querySelectorAll('#view-report [role=tab]').length >= 3)`, 150e3);
if (!gotReport) {
  missed.push(`Report: no finished report in 100 s from the live weather and engine, so the page as it stands is measured, and then the same page filled with the recorded answer the copy's own flow suite uses. On screen then: ${(await js(`(document.querySelector('#view-report')?.hidden ? 'the report view is hidden; the visible view is ' + [...document.querySelectorAll('.view')].filter(v => !v.hidden).map(v => v.id).join() + ': ' : '') + (document.querySelector('#view-report')?.innerText || document.body.innerText).replace(/\\s+/g, ' ').slice(0, 200)`).catch(() => '?'))}`);
  if (await js(`!document.querySelector('#view-report')?.hidden`).catch(() => false)) await screen('Report: the page while its answer is not in yet', async () => {});
  try {   // the copy's own flow suite holds a recorded engine answer and a synthetic weather record: its lines are read from the copy and run here
    const fs2 = await import('node:fs'), src = fs2.readFileSync(path.join(ROOT, 'scripts', 'e2e_flow.mjs'), 'utf8'), from = src.indexOf('const FIXTURE = '), to = src.indexOf("\nawait group('report'");
    if (from < 0 || to < 0) throw new Error('the flow suite of this copy has no recorded report answer');
    const REGION = JSON.parse(fs2.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8'))[0], YR = 2026;
    const make = new Function('REGION', 'YR', 'js', 'until', 'sleep', src.slice(from, to) + '\nreturn showReport;'); await go('/'); await js(`localStorage.setItem('crophalo.welcome.v1', ${JSON.stringify(WELCOME)})`); await go('/');
    await make(REGION, YR, js, until, sleep)(true, true); gotReport = await seen(`!document.querySelector('#view-report')?.hidden && (!!document.querySelector('#answer') || document.querySelectorAll('#view-report [role=tab]').length >= 3)`, 30e3);
  } catch (e) { missed.push(`Report from the recorded answer: ${String(e?.message || e).slice(0, 160)}`); }
}
if (gotReport) {
  const tabs = await js(`[...document.querySelectorAll('#view-report [role=tab]')].map(t => ({ id: t.id, name: t.textContent.trim() }))`);
  if (!tabs.length) await screen('Report', async () => {});
  for (const t of tabs) { await screen(`Report tab: ${t.name}`, async () => { await js(`document.getElementById(${JSON.stringify(t.id)}).click()`); await sleep(400); }); await srcCards(`Report tab: ${t.name}`); }
  if (tabs.length) await js(`document.getElementById(${JSON.stringify(tabs[0].id)}).click()`);
  for (const [name, re] of [['Share or print', /share|print/], ['Land history', /land history|history/], ['Look ahead', /look ahead|ahead/]]) {
    await screen(name, async () => { if (!(await pressWords(re, '#view-report'))) return false; await sleep(700); });
    await closeSheets(); if (!(await reportShown())) { await js(`history.back()`); await sleep(500); }
  }
  // Add to my farm: the panel, then the farm with the field in it
  const panel = await screen('Add my farm panel', async () => { if (!(await pressWords(/add.{0,12}(my )?farm/, '#view-report'))) return false; await sleep(700); });
  if (panel) { if (await js(`!!document.querySelector('dialog[open]')`)) { await pressWords(/^\s*(add|save|yes|confirm|done)/, 'dialog[open]'); await sleep(900); }
    await screen('My farm, with a field', async () => { if (await js(`document.querySelector('#view-farm').hidden`)) await js(`document.querySelector('#navFarm')?.click()`); return seen(`!document.querySelector('#view-farm').hidden`, 8000); }); }
}

}
if (WALK === 'home') {
  await screen('Welcome (first visit)', async () => { await go('/'); return seen(`document.querySelector('#dlgWelcome')?.open`, 8000); });
  await accepted();
  await screen('Home', async () => { await go('/'); await until(`document.querySelectorAll('#homeRegions .place-card').length > 0 || document.querySelectorAll('#view-home button, #view-home a[href]').length > 2`, 40e3); await sleep(2500); });
  await srcCards('Home');
  await screen('Home, scrolled to the end', async () => { await js(`scrollTo(0, document.documentElement.scrollHeight)`); await sleep(1200); });
  for (const re of [/satellite/, /show more|read more|more about/]) { await screen(`Home: after pressing "${re.source}"`, async () => { if (!(await pressWords(re, '#view-home'))) return false; await sleep(900); }); await closeSheets(); }
}
if (WALK === 'map') {
  await go('/'); await accepted(); await go('/');
  await screen('Setup map with its toolbar', async () => { await until(`[...document.querySelectorAll('button')].some(b => /Find it on the map/.test(b.textContent))`, 40e3); await js(`[...document.querySelectorAll('button')].find(b => /Find it on the map/.test(b.textContent)).click()`); await until(`document.querySelector('#mapx') && document.querySelector('#mapxCanvas') && document.querySelector('[data-tool=rect]')`, 60e3); await sleep(1500); });
  for (const panel of ['layers', 'places']) { await screen(`Map: the ${panel === 'layers' ? 'Layers' : 'Places'} panel`, async () => { if (!(await js(`!!document.querySelector('[data-panel=${panel}]')`))) return false; await js(`document.querySelector('[data-panel=${panel}]').click()`); return seen(`!!document.querySelector('.mapx-panel')`, 5000); });
    if (panel === 'layers') {  }
    await js(`document.querySelector('[data-panel=${panel}]')?.click()`).catch(() => {}); await sleep(300); }
  const spot = await screen('Map: the spot card (a pin put with the keyboard, then with a drag)', async () => {
    await js(`document.querySelector('[data-tool=pin]')?.click(); document.querySelector('#mapxCanvas')?.focus()`); await press(' '); await sleep(800);
    if (!(await js(`!!document.querySelector('.leaflet-marker-icon')`))) { const c0 = await js(`(() => { const r = document.querySelector('#mapxCanvas').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: c0.x, y: c0.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); await sleep(1500); }   // the pin, with a real click on the map
    const pinAt = await js(`(() => { const e = document.querySelector('.leaflet-marker-icon'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height * 0.4) }; })()`);
    if (pinAt) for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: pinAt.x, y: pinAt.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });   // then the pin itself, as a finger would
    await sleep(900); if (!(await js(`!!document.querySelector('#spotTitle, .spot-head, .spot-tabs')`))) await js(`import('/js/mapx.js').then(m => m.openAbout && m.openAbout())`).catch(() => {});   // the steps of the map's owner: put a pin, press the pin itself, or call openAbout()
    let got = await seen(`!!document.querySelector('#spotTitle, .spot-head, .spot-tabs')`, 15e3);
    if (!got) { const c = await js(`(() => { const r = document.querySelector('#mapxCanvas').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
      await js(`document.querySelector('[data-tool=rect]')?.click()`); const A = { x: c.x - 80, y: c.y - 60 }, B = { x: c.x + 90, y: c.y + 50 };
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: A.x, y: A.y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: A.x, y: A.y, button: 'left', buttons: 1, clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, buttons: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: B.x, y: B.y, buttons: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: B.x, y: B.y, button: 'left', buttons: 0, clickCount: 1 }); got = await seen(`!!document.querySelector('#spotTitle, .spot-head, .spot-tabs')`, 20e3); }
    if (!got) missed.push(`Map spot card: neither a pin by the keyboard nor a rectangle opened it; on screen: ${(await js(`[...new Set([...document.querySelectorAll('[id*=spot],[class*=spot]')].map(e => e.id || e.className).slice(0, 8))].join(' | ') + ' // ' + (document.querySelector('#mapx')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 160)`).catch(() => '?'))}`);
    await sleep(2500); return got; });
  if (spot) { const tabs = await js(`[...document.querySelectorAll('.spot-tabs [role=tab], [role=tablist][aria-label*=spot i] [role=tab]')].map(t => ({ id: t.id, name: t.textContent.trim() }))`);
    for (const t of tabs.slice(1)) await screen(`Map: the spot card, ${t.name}`, async () => { await js(`document.getElementById(${JSON.stringify(t.id)}).click()`); await sleep(1500); });
    await srcCards('Map: the spot card'); }
  for (const tool of ['rect', 'poly']) await screen(`Map: the ${tool === 'rect' ? 'Rectangle' : 'Polygon'} tool chosen`, async () => { if (!(await js(`!!document.querySelector('[data-tool=${tool}]')`))) return false; await js(`document.querySelector('[data-tool=${tool}]').click()`); await sleep(500); });
}
if (WALK === 'farm') {
  await go('/'); await accepted(); await go('/');
  await screen('My farm, empty', async () => { await js(`document.querySelector('#navFarm').click()`); return seen(`!document.querySelector('#view-farm').hidden`, 10e3); });
  await screen('Add my farm panel (from the empty board)', async () => { if (!(await js(`!!document.querySelector('#fwEmptyAdd')`))) return false; await js(`document.querySelector('#fwEmptyAdd').click()`); await sleep(800); });
  for (let i = 0; i < 3; i++) { const more = await screen(`Add my farm panel, step ${i + 2}`, async () => { if (!(await js(`!!document.querySelector('#fwNext, [data-act=next]') && !document.querySelector('#fwNext, [data-act=next]').disabled`))) return false; await js(`document.querySelector('#fwNext, [data-act=next]').click()`); await sleep(700); }); if (!more) break; }
  await closeSheets();
  if (!(await toReport())) missed.push('My farm with a field: no finished report in 150 s to add a field from');
  else {
    await screen('Add my farm panel (from a report)', async () => { if (!(await pressWords(/add.{0,12}(my )?farm/, '#view-report'))) return false; await sleep(800); });
    if (await js(`!!document.querySelector('dialog[open]')`)) { await pressWords(/^\s*(add|save|yes|confirm|done)/, 'dialog[open]'); await sleep(900); }
    const board = await screen('My farm board, with a field', async () => { if (await js(`document.querySelector('#view-farm').hidden`)) await js(`document.querySelector('#navFarm')?.click()`); return seen(`!document.querySelector('#view-farm').hidden && !!document.querySelector('#fwField, #fwHud')`, 15e3).then(async ok => { await sleep(1500); return ok; }); });
    if (board) {
      await srcCards('My farm board');
      await screen('My farm: the More menu', async () => { if (!(await js(`!!document.querySelector('#fwMoreBtn')`))) return false; await js(`document.querySelector('#fwMoreBtn').click()`); await sleep(400); });
      await screen('My farm: the Fields table', async () => { if (!(await js(`!!document.querySelector('#fwFieldsBtn')`))) return false; await js(`document.querySelector('#fwFieldsBtn').click()`); return seen(`!!document.querySelector('.fw-table')`, 8000); });
      await js(`document.querySelector('#fwClose')?.click()`); await sleep(300); await closeSheets();
      const drawer = await screen('My farm: the field drawer', async () => { if (!(await js(`!!document.querySelector('#fwDetailsBtn')`))) return false; await js(`document.querySelector('#fwMoreBtn')?.click()`); await sleep(200); await js(`document.querySelector('#fwDetailsBtn').click()`); return seen(`!document.querySelector('#fwPanel').hidden && !!document.querySelector('#fwPanel [role=tablist]')`, 8000).then(async ok => { await sleep(1200); return ok; }); });
      if (drawer) { const tabs = await js(`[...document.querySelectorAll('#fwPanel [role=tab]')].map(t => ({ id: t.id, name: t.textContent.trim() }))`);
        for (const t of tabs.slice(1)) await screen(`My farm: the field drawer, ${t.name}`, async () => { await js(`document.getElementById(${JSON.stringify(t.id)}).click()`); await sleep(1200); });
        await srcCards('My farm: the field drawer'); }
      await screen('My farm: Compare plans', async () => { await js(`document.querySelector('#fwClose')?.click()`); if (!(await js(`!!document.querySelector('#fwCompare')`))) return false; await js(`document.querySelector('#fwCompare').click()`); await sleep(800); });
    }
  }
}

// ---- the report file: one table per screen
const cut = (rows, cols) => rows.slice(0, MOST).map(r => `| ${cols.map(c => String(r[c] ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`).join('\n') + (rows.length > MOST ? `\n| … and ${rows.length - MOST} more | | |` : '');
const table = (title, rows, cols, heads) => rows?.length ? `\n**${title}: ${rows.length}**\n\n| ${heads.join(' | ')} |\n|${heads.map(() => '---').join('|')}|\n${cut(rows, cols)}\n` : '';
let md = `# Screens measured\n\nWritten by scripts/e2e_measure.mjs on ${new Date().toISOString().slice(0, 10)}. Each screen at ${SIZES.map(s => s.join(' by ')).join(' and ')} px, and at ${NARROW[0]} px wide for sideways scrolling. A measuring tool: the lists are findings to judge, not failures.\n\nHow each thing is measured: a touch target is the control's own box (for a tick box or a switch, its label's box); contrast is the text colour against the background colours of the element and what it sits in, down to the first solid one (text over a picture or gradient is listed apart, not measured); "words before the first thing to press" counts the shown words in the screen's own part (not the top bar) that come before its first control.\n\n## Summary\n\n| Screen | Size | Words before the first press | Words on the screen | Controls | Targets under 44 | Text under 12 px | Low contrast | Unnamed | Uneven heights | Over 4 sentences | Heading faults | Sideways at ${NARROW[0]} |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const e of found) for (const [sz, m] of Object.entries(e.sizes)) md += `| ${e.name} | ${sz} | ${m.wordsBefore} | ${m.wordsOnScreen} | ${m.controls} | ${m.small.length} | ${m.tiny.length} | ${m.faint.length} | ${m.unnamed.length} | ${m.uneven.length} | ${m.long.length} | ${m.skipped.length + (m.h1 > 1 ? 1 : 0)} | ${e.narrow.sideways ? `yes (${e.narrow.pageWide} px)` : e.narrow.sticking.length ? `${e.narrow.sticking.length} part(s)` : 'no'} |\n`;
if (missed.length) md += `\n## Not reached\n\n${missed.map(m => `- ${m}`).join('\n')}\n`;
for (const e of found) {
  md += `\n## ${e.name}\n`;
  for (const [sz, m] of Object.entries(e.sizes)) {
    md += `\n### ${sz} px (${m.part})\n\nWords before the first thing to press: **${m.wordsBefore}**${m.firstPress ? ` (the first is "${m.firstPress.words}", \`${m.firstPress.find}\`)` : ' (nothing to press)'}; ${m.wordsOnScreen} words on the screen; ${m.controls} controls. Headings: ${m.headings.join(' › ') || 'none'}.${m.h1 > 1 ? ` **${m.h1} h1 on one screen.**` : ''}\n`;
    md += table('Touch targets under 44 by 44 px', m.small, ['words', 'size', 'find'], ['Words', 'Size (px)', 'Where']);
    md += table('Text under 12 px', m.tiny, ['words', 'size', 'find'], ['Words', 'Size', 'Where']);
    md += table('Contrast too low', m.faint, ['words', 'ratio', 'colours', 'size', 'find'], ['Words', 'Contrast', 'Colours', 'Text size', 'Where']);
    md += table('Contrast not measured', m.unmeasured, ['words', 'why', 'find'], ['Words', 'Why', 'Where']);
    md += table('A heading level skipped', m.skipped, ['words', 'jump', 'find'], ['Heading', 'Jump', 'Where']);
    md += table('No name for screen readers', m.unnamed, ['words', 'find'], ['What', 'Where']);
    md += table('Two controls side by side, heights 1 to 6 px apart', m.uneven, ['words', 'size', 'find'], ['Words', 'Heights', 'Where']);
    md += table('Information with more than four sentences showing', m.long, ['words', 'size', 'find'], ['It begins', 'Sentences', 'Where']);
  }
  md += `\n### ${NARROW[0]} px wide\n\n${e.narrow.sideways ? `**The page scrolls sideways:** it is ${e.narrow.pageWide} px wide on a ${e.narrow.vw} px screen.` : 'The page does not scroll sideways.'}\n` + table('Parts wider than the screen', e.narrow.sticking, ['words', 'from', 'to', 'find'], ['Words', 'From (px)', 'To (px)', 'Where']);
}
fs.mkdirSync(OUT_DIR, { recursive: true }); const file = path.join(OUT_DIR, `screens-measured${WALK === 'all' ? '' : '-' + WALK}.md`); fs.writeFileSync(file.replace(/\.md$/, '.json'), JSON.stringify({ found, missed })); fs.writeFileSync(file, md);
console.log(`e2e_measure: ${found.length} screens measured, ${missed.length} not reached; the report is ${file}`);
check('measure: the walk ran to its end and wrote its report (findings never fail it)', true);
await finish();
