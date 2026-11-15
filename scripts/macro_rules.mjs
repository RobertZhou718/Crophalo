// Big moves at Full were asked for by the owner on 15 November 2026; they live only in macro files, which are held to these rules instead.
// scanMacro(files) checks js/macro.js, js/macro-*.js, js/sun-now.js, js/hooks.js and css/macro*.css against the twelve written rules, and a thirteenth added after review
// (every motion goes through the conductor, so none of it can skip Less, Still or the input rule), and answers every break it finds. Pure: it reads only the texts it is
// given (macroFiles() lists the real ones); scripts/test.mjs "calm motion" and scripts/fx_rules.mjs stay as strict for every other file. Used by scripts/test_macro.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
const { SCENES, T } = await import(pathToFileURL(path.join(ROOT, 'js', 'macro-core.js')).href);

// The files the rules reach, as { rel, text }.
export function macroFiles(root = ROOT) {
  const pick = (dir, re) => { try { return fs.readdirSync(path.join(root, dir)).filter(n => re.test(n)).sort().map(n => `${dir}/${n}`); } catch { return []; } };
  const rels = [...pick('js', /^(macro(-[\w-]+)?|sun-now|hooks)\.js$/), ...pick('css', /^macro(-[\w-]+)?\.css$/)];
  return rels.map(rel => ({ rel, text: fs.readFileSync(path.join(root, rel), 'utf8') }));
}

// Comments become blanks of the same shape, so every line keeps its number; strings and code stay.
const blank = m => m.replace(/[^\n]/g, ' ');
export const stripCode = t => String(t).replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a) => a + blank(m.slice(a.length)));
const stripStyle = t => String(t).replace(/\/\*[\s\S]*?\*\//g, blank);
const lineOf = (text, at) => text.slice(0, at).split('\n').length;
const MONEY = /\b(income|earn\w*|profit\w*|revenue|forecast\w*|guarantee\w*)\b/i;   // the farmer-facing money words the money tab never says (scripts/e2e_money.mjs)
const BANNED = /(?<!de)bounce|elastic|overshoot|wiggle|shake|squash|(?<![-\w.])pop(?![-\w])(?!\s*\()/i;   // inside a longer name too (easeOutBounce); a debounce is not a bounce. pop as a name of its own: --z-pop and an array's .pop() are not it
const CAMEL_POP = /(?<=[a-z0-9_$])Pop(?![a-z])|(?<![-\w.$])pop(?=[A-Z])/;   // pop as a part of a longer name (easePop, popIn); popover and popstate are other words
const NAMED_COLOUR = /(?<![-\w])(red|green|blue|yellow|orange|purple|pink|black|white|gray|grey|brown|cyan|magenta|lime|navy|teal|gold|silver|maroon|olive)(?![-\w])/i;
const COLOUR_FN = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\(/i;
const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])/;

// The argument text of a call that starts at `open` (the index of its "("), up to its matching ")".
function argsAt(text, open) {
  let depth = 0, quote = '';
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') { depth--; if (!depth) return text.slice(open + 1, i); }
  }
  return text.slice(open + 1);
}
const strings = code => [...code.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)].map(m => ({ at: m.index, s: m[0].slice(1, -1) }));

// The rules of the declared table: lengths, films and the chain of each screen change.
export function tableProblems(table = SCENES, times = T) {
  const out = [], add = (rule, found) => out.push({ rule, rel: 'js/macro-core.js', line: 0, found });
  const ends = new Map();
  for (const [name, s] of Object.entries(table)) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) add(1, `a scene name that is not lower-case words: ${name}`);
    if (s.auto && s.ms > times.AUTO_MAX) add(2, `${name}: an auto scene of ${s.ms} ms, over ${times.AUTO_MAX}`);
    if (s.ms > times.PRESS_MAX && (s.auto || !s.controls)) add(2, `${name}: ${s.ms} ms without a press and a play bar`);
    if (s.phone > s.ms) add(2, `${name}: longer on a phone than on a laptop`);
    if (s.auto && s.screen !== null && typeof s.at === 'number') ends.set(s.screen, Math.max(ends.get(s.screen) ?? 0, s.at + s.ms));
  }
  for (const [screen, end] of ends) if (end > times.AUTO_MAX) add(3, `the auto scenes of "${screen}" end at ${end} ms, over ${times.AUTO_MAX}`);
  return out;
}

// The rules of one file's text.
export function fileProblems({ rel, text }) {
  const out = [], add = (rule, at, found, src = text) => out.push({ rule, rel, line: typeof at === 'number' ? lineOf(src, at) : 0, found: String(found).slice(0, 120) });
  const isCss = rel.endsWith('.css'), code = isCss ? stripStyle(text) : stripCode(text);
  const core = rel === 'js/macro-core.js', view = rel === 'js/macro-view.js', mainCss = rel === 'css/macro.css';
  const every = (re, fn) => { for (const m of code.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))) fn(m); };

  // 1. every scene is made with scene( and is listed in SCENES (the conductor's own and become()'s take a name from the table at run time)
  if (!isCss && !core && !view) {
    every(/\bscene\s*\(/, m => {
      const args = argsAt(code, m.index + m[0].length - 1), name = /\bname\s*:\s*['"]([\w-]+)['"]/.exec(args)?.[1];
      if (!name) add(1, m.index, 'a scene without a written name');
      else if (!Object.hasOwn(SCENES, name)) add(1, m.index, `a scene that is not in SCENES: ${name}`);
      else {
        if (SCENES[name].controls && !/\bcontrols\s*:/.test(args)) add(2, m.index, `${name} runs over 5 s and has no controls`);
        if (SCENES[name].auto && /\bauto\s*:\s*false\b/.test(args)) add(2, m.index, `${name} is auto in SCENES and may not make itself not auto`);
      }
    });
    every(/\bbecome\s*\(/, m => {   // a screen change counts as the scene its caller names; with none written it would count as the generic turn and start the wrong chain
      const args = argsAt(code, m.index + m[0].length - 1), name = /\bscene\s*:\s*['"]([\w-]+)['"]/.exec(args)?.[1];
      if (!name) add(1, m.index, 'become() without its scene: written');
      else if (!Object.hasOwn(SCENES, name)) add(1, m.index, `become() counted as a scene that is not in SCENES: ${name}`);
    });
  }
  // 4. nothing loops for ever, or nearly for ever: one iteration only, and no timer that starts itself again
  const probe = rel === 'js/macro-probe.js';   // the measuring tape of the browser suites: it records iterations and runs its own frame loop while it measures
  every(/\binfinite\b|\bInfinity\b|\bsetInterval\b/, m => add(4, m.index, m[0]));
  if (!isCss && !probe) {
    every(/\biterations\s*:\s*([^,}\n]+)/, m => { if (m[1].trim() !== '1') add(4, m.index, m[0]); });
    every(/\b(?:function\s+(\w+)\s*\([^)]*\)\s*|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b[^{]*|\([^)]*\)\s*=>\s*|\w+\s*=>\s*))/, m => {
      const fname = m[1] || m[2], after = m.index + m[0].length, body = code[after] === '{' ? argsAt(code, after) : code.slice(after, code.indexOf('\n', after) >>> 0);
      if (new RegExp(`\\bsetTimeout\\s*\\(\\s*(?:${fname}\\b|(?:\\([^)]*\\)|\\w+)\\s*=>\\s*\\{?\\s*${fname}\\s*\\()`).test(body)) add(4, m.index, `${fname} starts itself again with setTimeout`);
    });
  }
  if (isCss) {
    every(/animation-iteration-count\s*:\s*([^;}]+)/, m => { if (m[1].trim() !== '1') add(4, m.index, m[0]); });
    every(/(?<![-\w])animation\s*:\s*([^;}]+)/, m => { const v = m[1].replace(/[\w-]*\([^)]*\)/g, ' '); if ((v.match(/(?<![\w.%-])\d*\.?\d+(?![\w.%-])/g) || []).some(n => +n !== 1)) add(4, m.index, `a repeat count in ${m[0].trim()}`); });
  }
  // 5. curves inside 0..1, no linear() past 1, none of the banned names
  every(/cubic-bezier\(([^)]*)\)/, m => { const p = m[1].split(',').map(Number); if (p.length !== 4 || p.some(v => !(v >= 0 && v <= 1))) add(5, m.index, m[0]); });
  every(/(?<![-\w])linear\(([^)]*)\)/, m => { if ((m[1].match(/-?[\d.]+(?!\s*%)/g) || []).some(v => +v > 1 || +v < 0)) add(5, m.index, m[0]); });
  every(BANNED, m => add(5, m.index, m[0]));
  if (!isCss) for (const m of code.matchAll(new RegExp(CAMEL_POP.source, 'g'))) add(5, m.index, m[0]);
  // 6. nothing is scaled past full size, and text is never scaled
  //    A CSS scale() must be written as plain numbers of 1 or less: one built at run time (joined or ${…}) cannot be checked, so a growing part is drawn on a canvas
  //    or moved by a view transition instead. A method call (a canvas's ctx.scale, a matrix) draws pixels and keeps the older rule: no written number over 1.
  every(/(?<![.\w$])scale(?:X|Y|Z|3d)?\(([^)]*)\)/, m => { const parts = m[1].split(',').map(p => p.trim()); if (!parts.every(p => /^-?(?:\d+\.?\d*|\.\d+)$/.test(p) && Math.abs(+p) <= 1)) add(6, m.index, m[0]); });
  every(/\.scale\(([^)]*)\)|(?<![-\w])scale\s*:\s*([^;}\n'"`,]+)/, m => { const v = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ''); if ((v.match(/-?[\d.]+/g) || []).some(n => Math.abs(+n) > 1)) add(6, m.index, m[0]); });
  if (!isCss) every(/\bfontSize\b/, m => add(6, m.index, 'a font size set from a script (text is never scaled)'));
  // 7. rotateX and perspective in js/macro-lift.js only
  if (rel !== 'js/macro-lift.js') every(/\brotateX\b|\bperspective\b/, m => add(7, m.index, m[0]));
  // 8. no number for a duration or a curve outside the named values (T., EASE., var(--m-…))
  if (!isCss) {
    const tables = core ? [...code.matchAll(/^export const (T|EASE|SCENES) = [\s\S]*?^\}\);/gm)].map(m => [m.index, m.index + m[0].length]) : [];
    const inTable = at => tables.some(([a, b]) => at >= a && at < b);
    every(/\b(duration|delay|endDelay|ms)\s*:\s*(-?\d[\d.]*)(?![\d.])(?!\s*\*\s*T\.)/, m => { if (+m[2] !== 0 && !inTable(m.index)) add(8, m.index, m[0]); });
    every(/\bsetTimeout\s*\(/, m => { const args = argsAt(code, m.index + m[0].length - 1), last = args.slice(args.lastIndexOf(',') + 1).trim(); if (args.includes(',') && /^-?\d/.test(last) && +last !== 0) add(8, m.index, `setTimeout(…, ${last})`); });
    every(/\.animate\s*\(/, m => { const args = argsAt(code, m.index + m[0].length - 1), last = args.slice(args.lastIndexOf(',') + 1).trim(); if (/^\d/.test(last) && +last !== 0) add(8, m.index, `animate(…, ${last})`); });
    every(/\beasing\s*:\s*['"`]/, m => add(8, m.index, m[0] + '…'));
    if (!core) every(/cubic-bezier\(/, m => add(8, m.index, 'a curve written out instead of EASE'));
  } else {
    for (const m of code.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)) {
      const prop = m[1], value = m[2];
      const token = mainCss && /^--m-(t|ease)-/.test(prop);
      if (!mainCss && /^--m-(t|ease|rec|ring)-/.test(prop)) add(8, m.index, `${prop} is defined outside css/macro.css`);
      if (!token && /(?<![\w.-])\d*\.?\d+m?s\b/.test(value.replace(/var\([^)]*\)/g, ''))) add(8, m.index, `${prop}: ${value.trim()}`);
      if (!token && /cubic-bezier\(|steps\(/.test(value)) add(8, m.index, `${prop}: ${value.trim()}`);
    }
  }
  // 9. no network, no storage, no outside address, and no reading pixels back inside a frame function
  every(/\bfetch\s*\(|\bXMLHttpRequest\b|\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\.cookie|\bcaches\.|\bsendBeacon\b|\bWebSocket\b|\bEventSource\b/, m => add(9, m.index, m[0]));
  every(/(?:https?:)?\/\/[\w.-]+\.[a-z]{2,}[^\s'"`)]*/i, m => { if (!/^(?:https?:)?\/\/www\.w3\.org\//i.test(m[0])) add(9, m.index, m[0]); });
  if (!isCss) every(/\bpaint\s*(?:\([^)]*\)|:\s*(?:function\s*)?\([^)]*\)\s*=>|:\s*\w+\s*=>)\s*\{/, m => { const body = argsAt(code, m.index + m[0].length - 1); if (/\b(getImageData|readPixels)\b/.test(body)) add(9, m.index, 'pixels read back inside a frame function'); });
  // 10. colours only as the tokens, the record scale and the rings palette of css/macro.css
  if (!isCss) { every(HEX, m => add(10, m.index, m[0])); every(COLOUR_FN, m => add(10, m.index, m[0])); }
  else {
    for (const m of code.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)) {
      const prop = m[1], value = m[2].replace(/var\([^)]*\)/g, ''), palette = mainCss && /^--m-(rec|ring)-/.test(prop);
      if (!palette && (HEX.test(value) || COLOUR_FN.test(value) || (/(color|background|fill|stroke|border|outline|shadow)/.test(prop) && NAMED_COLOUR.test(value)))) add(10, m.index, `${prop}: ${m[2].trim()}`);
    }
  }
  // 11. no money word in any string
  if (!isCss) for (const s of strings(code)) if (MONEY.test(s.s)) add(11, s.at, s.s);
  // 12. scroll is never an interrupt
  if (!isCss) every(/addEventListener\s*\(\s*['"`]scroll['"`]|\bonscroll\b/, m => add(12, m.index, m[0]));
  // 13. every motion goes through the conductor, so it has its Less and Still forms and ends on any input
  if (!isCss && !probe) {
    const own = { animate: core || view, raf: core, vt: view };
    if (!own.animate) every(/\.animate\s*\(/, m => add(13, m.index, '.animate() outside macro-core.js and macro-view.js: a scene moves things in its paint(k)'));
    if (!own.raf) every(/\brequestAnimationFrame\b/, m => add(13, m.index, 'requestAnimationFrame outside macro-core.js: every frame comes from the conductor'));
    if (!own.vt) every(/\bstartViewTransition\b/, m => add(13, m.index, 'startViewTransition outside macro-view.js: a screen change goes through become()'));
    if (!core) {   // the long named times and products of times belong to a scene's spec, where the conductor reads them
      const specs = []; every(/\bscene\s*\(/, m => { const open = m.index + m[0].length - 1; specs.push([open, open + argsAt(code, open).length + 2]); });
      const inSpec = at => specs.some(([a, b]) => at > a && at < b);
      every(/\bT\.(?:DAY|MONTH_FILM|PRESS_MAX)\b|\b\d[\d.]*\s*\*\s*T\.\w+|\bT\.\w+\s*\*\s*\d/, m => { if (!inSpec(m.index)) add(13, m.index, `${m[0]} outside a scene() spec`); });
    }
  }
  if (isCss) cssMotion(code, (at, found, rule = 13) => add(rule, at, found));
  return out;
}

// The motion of a stylesheet: every animation or transition sits under the Full switch (prefers-reduced-motion: no-preference and html:not([data-motion])) or under
// html[data-motion=less] with T.QUICK (or T.LESS_MAX) and opacity only; "none" may stand anywhere. Keyframes never scale and never change a font size (rule 6).
function cssMotion(code, add) {
  const frames = new Map(), decls = [], stack = [];
  let buf = '', start = 0;
  const take = end => { const text = buf, i = text.indexOf(':'); if (i > 0 && stack.length) decls.push({ prop: text.slice(0, i).trim(), value: text.slice(i + 1).trim(), at: start + text.search(/\S/), stack: [...stack] }); buf = ''; start = end + 1; };
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '{') { stack.push(buf.trim()); buf = ''; start = i + 1; }
    else if (c === ';') take(i);
    else if (c === '}') { if (buf.trim()) take(i); stack.pop(); buf = ''; start = i + 1; }
    else buf += c;
  }
  const keyframesOf = st => { const k = st.find(p => /^@(?:-webkit-)?keyframes\b/.test(p)); return k ? k.replace(/^@(?:-webkit-)?keyframes\s+/, '').trim() : null; };
  for (const d of decls) { const k = keyframesOf(d.stack); if (k !== null) { if (!frames.has(k)) frames.set(k, new Set()); frames.get(k).add(d.prop); } }
  const parts = sel => sel.split(',').map(p => p.trim()).filter(Boolean);
  for (const d of decls) {
    const k = keyframesOf(d.stack);
    if (k !== null) { if (/^font-size$/.test(d.prop) || /(?<![-\w])scale\b/.test(d.prop) || /\bscale(?:X|Y|Z|3d)?\(/.test(d.value)) add(d.at, `${d.prop}: ${d.value} in @keyframes ${k} (nothing grows and text is never scaled)`, 6); continue; }
    if (!/^(animation|transition)(-[\w-]+)?$/.test(d.prop)) continue;
    if (/^none(\s*!important)?$/.test(d.value)) continue;
    const sel = d.stack.at(-1) || '', media = d.stack.slice(0, -1);
    const full = media.some(p => /^@media\b[^{]*prefers-reduced-motion:\s*no-preference/.test(p)) && parts(sel).every(p => p.startsWith('html:not([data-motion])'));
    const less = parts(sel).length > 0 && parts(sel).every(p => /^html\[data-motion=["']?less["']?\]/.test(p));
    if (!full && !less) { add(d.at, `${d.prop}: ${d.value} outside the Full and Less switches: it would play at Less, or at Still`); continue; }
    const long = [...d.value.matchAll(/var\(--m-t-([\w-]+)\)/g)].map(m => m[1]).filter(t => (T[t.toUpperCase().replace(/-/g, '_')] ?? 0) > T.TURN);
    if (long.length) add(d.at, `${d.prop}: ${d.value}: a stylesheet's motion lasts T.TURN at most; anything longer is a scene, where the chain budget and the play bar are`);
    if (!less) continue;
    const times = [...d.value.matchAll(/var\(--m-t-([\w-]+)\)/g)].map(m => m[1]);
    if (times.some(t => t !== 'quick' && t !== 'less-max')) add(d.at, `${d.prop}: ${d.value} lasts over 200 ms at Less`);
    if (/^transition(-property)?$/.test(d.prop)) { const moved = d.value.split(',').map(p => p.trim().split(/\s+/)[0]).filter(w => w && !/^var\(/.test(w)); if (moved.some(w => w !== 'opacity')) add(d.at, `${d.prop}: ${d.value} moves more than opacity at Less`); }
    if (/^animation(-name)?$/.test(d.prop)) {
      const names = d.value.replace(/[\w-]*\([^)]*\)/g, ' ').split(/[\s,]+/).filter(w => /^[a-z_-][\w-]*$/i.test(w) && !/^(none|linear|ease(-in|-out|-in-out)?|forwards|backwards|both|normal|reverse|alternate(-reverse)?|running|paused|infinite|step-start|step-end)$/.test(w));
      for (const n of names) if (!frames.has(n) || [...frames.get(n)].some(p => p !== 'opacity')) add(d.at, `${d.prop}: ${d.value}: at Less an animation's keyframes must be in this file and move opacity only`);
    }
  }
}

// Every break of the twelve rules in these files (default: the real ones), each { rule, rel, line, found }.
export function scanMacro(files = macroFiles()) {
  const list = (files || []).map(f => (typeof f === 'string' ? { rel: f, text: fs.readFileSync(path.join(ROOT, f), 'utf8') } : f));
  return [...tableProblems(), ...list.flatMap(fileProblems)];
}
