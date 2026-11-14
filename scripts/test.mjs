// Crophalo's core offline suite. For now it holds the project rules that keep every later step honest: one blue, calm motion, light mode only,
// the country's name, no outside address, nothing older than the day the build began, the tokens, the page shell and the shared words. No internet is needed.
// RULE: never loosen a check here to make it pass without a written farming reason beside the check itself. A failure means the app would show
// a farmer something wrong, or the folder would say something untrue about itself: fix the project, not the test. Run: node scripts/test.mjs
import fs from 'node:fs';
import { flagged, badPath } from './wordguard.mjs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---- the counting
let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 400 ? s.slice(0, 400) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const none = (name, list) => check(name, list.length === 0, `${list.length}: ${list.slice(0, 6).join(' · ')}`);   // passes on an empty list, and names what it found
async function group(name, run) { try { await run(); } catch (e) { check(`${name}: ran to its end`, false, e?.stack?.split('\n').slice(0, 2).join(' ') || String(e)); } }

// ---- the folder (CROPHALO_ROOT is for tests only: it points this suite at a copy with a deliberate mistake in it)
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(HERE, '..'));
const BEGAN = '2026-11-14', BEGAN_MS = new Date(2026, 10, 14).getTime();   // the day this build began: nothing in the folder may be older or say an older date
const MADE_HERE = ['.cache', 'runtime', '.venv', '.secrets', '.userdata'];   // made on each computer, never shipped
const SKIP_DIRS = new Set([...MADE_HERE, '.git', 'scripts/_cache']);
const OTHERS_BYTES = rel => /^(vendor|scripts\/vendor-test)\//.test(rel) && !/(^|\/)(README\.md|VERSION\.json)$/.test(rel);   // the published files of a library: checked byte for byte below, so their words and dates are the library's own
const W = (...parts) => parts.join('');   // words this suite looks for are put together from pieces, so the suite never finds itself

function walk(dir = '', out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(rel) && entry.name !== '__pycache__') walk(rel, out); }
    else if (entry.name !== '.DS_Store') out.push(rel);
  }
  return out;
}
const FILES = walk();
const has = rel => fs.existsSync(path.join(ROOT, rel));
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const TEXT = new Map();   // every file that is text, read once
for (const rel of FILES) { const buf = fs.readFileSync(path.join(ROOT, rel)); if (buf.length < 5e6 && !buf.subarray(0, 4096).includes(0)) TEXT.set(rel, buf.toString('utf8')); }
const plain = text => text.replace(/sha\d+-[A-Za-z0-9+/=]{20,}/g, ' ').replace(/[A-Za-z0-9+/]{60,}={0,2}/g, ' ');   // checksums and packed pictures are not words
const finds = (re, pick = () => true) => { const out = []; for (const [rel, text] of TEXT) if (pick(rel)) plain(text).split('\n').forEach((line, i) => { const m = re.exec(line); re.lastIndex = 0; if (m) out.push(`${rel}:${i + 1} "${m[0]}"`); }); return out; };
const ext = (rel, ...kinds) => kinds.some(k => rel.endsWith(k));
const OURS = rel => !OTHERS_BYTES(rel);

// ---- small readers for CSS, shared by the colour and the motion checks
const noComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
function split(text, sep) {   // at the top level only: never inside brackets or quotes
  const out = []; let depth = 0, quote = '', from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--;
    else if (c === sep && depth === 0) { out.push(text.slice(from, i)); from = i + 1; }
  }
  out.push(text.slice(from));
  return out.map(s => s.trim()).filter(Boolean);
}
const decls = body => split(body, ';').map(d => { const i = d.indexOf(':'); return i < 0 ? null : [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()]; }).filter(Boolean);
function parseCss(css, rules = [], frames = [], at = []) {   // rules: { sel, decls, at }; frames: { name, stops: [{ keys, decls }] }
  const src = noComments(css).replace(/@import[^;]+;/g, '');
  for (let i = 0; i < src.length;) {
    const open = src.indexOf('{', i); if (open < 0) break;
    let depth = 1, close = open + 1; for (; close < src.length && depth; close++) depth += src[close] === '{' ? 1 : src[close] === '}' ? -1 : 0;
    const head = src.slice(i, open).trim().replace(/\s+/g, ' '), body = src.slice(open + 1, close - 1);
    if (/^@(-webkit-)?keyframes\b/.test(head)) { const inner = []; parseCss(body, inner, [], []); frames.push({ name: head.split(' ').pop(), stops: inner.map(r => ({ keys: r.sel, decls: r.decls })) }); }
    else if (/^@(media|supports|layer|container)\b/.test(head)) parseCss(body, rules, frames, [...at, head]);
    else rules.push({ sel: head, decls: decls(body), at });
    i = close;
  }
  return { rules, frames };
}
const noNot = sel => { let out = '', depth = 0; for (let i = 0; i < sel.length; i++) { if (!depth && sel.startsWith(':not(', i)) { depth = 1; i += 4; continue; } if (depth) { depth += sel[i] === '(' ? 1 : sel[i] === ')' ? -1 : 0; continue; } out += sel[i]; } return out; };   // ":not(.on)" is the UNchosen thing
const hex2 = n => Math.round(n).toString(16).padStart(2, '0');
function colour(text) {   // a written colour as '#rrggbb' or '#rrggbbaa'; null when it is not a plain colour
  const t = text.trim().toLowerCase(); let m;
  if ((m = /^#([0-9a-f]{3,8})$/.exec(t))) { let h = m[1]; if (h.length < 5) h = [...h].map(c => c + c).join(''); return h.length === 6 || h.length === 8 ? '#' + (h.length === 8 && h.endsWith('ff') ? h.slice(0, 6) : h) : null; }
  if ((m = /^rgba?\(([^)]+)\)$/.exec(t))) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); if (p.length < 3 || p.some(Number.isNaN)) return null; return '#' + p.slice(0, 3).map(hex2).join('') + ((p[3] ?? 1) >= 1 ? '' : hex2(p[3] * 255)); }
  return null;
}
const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hue = ([r, g, b]) => { const hi = Math.max(r, g, b), d = hi - Math.min(r, g, b); return !d ? 0 : (60 * (hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4) + 360) % 360; };
const sat = ([r, g, b]) => { const hi = Math.max(r, g, b); return hi ? (hi - Math.min(r, g, b)) / hi : 0; };
const isBlue = hex => { const c = rgb(hex); return Math.max(...c) - Math.min(...c) >= 50 && hue(c) >= 190 && hue(c) <= 270; };   // a near-black or near-grey is not a blue, whatever its hue
const num = text => text.replace(/(?<![\w#.])-?(?:\d+\.?\d*|\.\d+)/g, n => String(parseFloat(n)));   // ".5px" and "0.5px" are one value
const canon = text => num(String(text).replace(COLOUR, c => colour(c) ?? c).replace(/["']/g, '')).replace(/\s*([,()])\s*/g, '$1').replace(/\s+/g, ' ').trim();
const shadowCanon = text => split(String(text), ',').map(layer => { const parts = split(layer, ' '), lens = parts.filter(p => /^-?[\d.]+(px)?$/.test(p)).map(parseFloat), rest = parts.filter(p => !/^-?[\d.]+(px)?$/.test(p)); return [...lens, 0, 0, 0, 0].slice(0, 4).join(' ') + ' ' + canon(rest.join(' ')); }).join(',');

const CSS_FILES = FILES.filter(rel => rel.startsWith('css/') && rel.endsWith('.css'));
const JS_FILES = FILES.filter(rel => rel.startsWith('js/') && rel.endsWith('.js'));
const PAGES = ['index.html', 'design.html'].filter(has);
const inlineCss = html => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n') + [...html.matchAll(/\sstyle="([^"]*)"/g)].map(m => `[inline] { ${m[1]} }`).join('\n');
const inlineJs = html => [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const STYLES = [...CSS_FILES.map(rel => [rel, read(rel)]), ...PAGES.map(rel => [rel + ' (its own styles)', inlineCss(read(rel))])];
const SCRIPTS = [...JS_FILES.map(rel => [rel, read(rel)]), ...PAGES.map(rel => [rel + ' (its own script)', inlineJs(read(rel))])];
const PARSED = STYLES.map(([rel, css]) => ({ rel, ...parseCss(css) }));
const RULES = PARSED.flatMap(p => p.rules.map(r => ({ ...r, rel: p.rel }))), FRAMES = PARSED.flatMap(p => p.frames.map(f => ({ ...f, rel: p.rel })));
const onScreen = r => !r.at.some(a => /forced-colors|\bprint\b/.test(a));   // the system picks the colours there, or it is paper

// ---- the folder says only true things about itself
await group('the folder', async () => {
  none('no package file, lock file, node_modules or bundler setting anywhere (no framework, no build step)',
    [...FILES.filter(rel => /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|npm-shrinkwrap\.json|tsconfig\.json|(vite|webpack|rollup|esbuild|babel)\.config\.\w+)$/.test(rel) && OURS(rel)),
      ...FILES.filter(rel => /(^|\/)node_modules\//.test(rel)).slice(0, 1)]);
  const ignored = has('.gitignore') ? read('.gitignore').split('\n').map(l => l.trim()) : [];
  none('.gitignore holds the five folders made on each computer', MADE_HERE.filter(dir => !ignored.includes(dir + '/')));
  none(`no file is older than ${BEGAN} (the build began that day)`, FILES.filter(rel => fs.lstatSync(path.join(ROOT, rel)).mtimeMs < BEGAN_MS).map(rel => `${rel} is from ${new Date(fs.lstatSync(path.join(ROOT, rel)).mtimeMs).toISOString().slice(0, 10)}`));

  // Dates written in the project. Outside data keeps its own honest dates; each entry below says which data and why.
  // A dotted number such as 2026.10.23 is not read as a date: it is how some libraries number their versions, and a version keeps its own date.
  const DATA_DATES = {
    '2001-01-01': 'the first day of the NASA POWER daily weather record the app reads: a date of the data, not of the project',
  };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MONTH = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?';
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, month = name => MONTHS.indexOf(name.slice(0, 3)) + 1;
  // Recorded outside answers keep the dates of their data: a weather record since 2001 is the data itself, not a date of the project. Only files under
  // scripts/fixtures/ (answers recorded from the outside services, played back by the suites) are passed over; nothing the project writes itself is.
  const RECORDED = rel => rel.startsWith('scripts/fixtures/');
  const early = [];
  for (const [rel, text] of TEXT) {
    if (!OURS(rel) || RECORDED(rel)) continue;
    plain(text).split('\n').forEach((line, i) => {
      const hit = (found, date) => { if (date < BEGAN && !Object.hasOwn(DATA_DATES, date)) early.push(`${rel}:${i + 1} "${found}"`); };
      for (const m of line.matchAll(/(?<![\w.])(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g)) if (+m[1] >= 1900 && +m[1] <= 2100 && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) hit(m[0], iso(m[1], m[2], m[3]));
      for (const m of line.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH},?\\s+(\\d{4})\\b`, 'g'))) hit(m[0], iso(m[3], month(m[2]), m[1]));
      for (const m of line.matchAll(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'g'))) hit(m[0], iso(m[3], month(m[1]), m[2]));
      for (const m of line.matchAll(new RegExp(`\\b${MONTH}\\s+(\\d{4})\\b`, 'g'))) hit(m[0], iso(m[2], month(m[1]), 31));   // a month alone counts as its last day
      for (const m of line.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) if (+m[3] >= 1900 && +m[3] < 2026) hit(m[0], iso(m[3], 1, 1));
      for (const m of line.matchAll(/(?:©|\(c\)|copyright)\s*(\d{4})\b/gi)) hit(m[0], iso(m[1], 12, 31));
    });
  }
  none(`no date before ${BEGAN} is written anywhere in the project (data ranges are listed with their reason)`, early);

  none(`the country is never written "${W('Tur', 'key')}", in any file`, finds(new RegExp(W('tur', 'key'), 'i')));
  check('"Türkiye" is how the project writes it', [...TEXT].some(([rel, text]) => rel.startsWith('js/') && text.includes('Türkiye')));

  // Names of helpers that write code or text for people, and of the firms behind them: checked by fingerprint, so no file names them, this one included.
  none('no helper program, model or coding tool is named in the project', [...TEXT].filter(([rel]) => OURS(rel)).flatMap(([rel, text]) => flagged(plain(text)).map(h => `${rel}:${h.line}`)));
  none('no file or folder is named after one', FILES.filter(badPath));
  none('no line signs a file as made by a tool', finds(new RegExp(`${W('gener', 'ated')} (by|with|using)\\b|${W('co-auth', 'ored')}|${W('auto', '-?generated')}|\\u{1F916}`, 'iu'), OURS));
  none('no merge left its marks in a file', finds(/^(<{7} |={7}$|>{7} )/, OURS));
  // The folder speaks for the product: no line points at working papers, plans or reviews that a farmer or a new reader cannot see.
  none('no line points at working papers, plans or reviews', finds(new RegExp(`\\(${W('no', 'te')} \\d|\\b${W('no', 'tes?')} \\d{2}\\b|\\bthe ${W('no', 'tes')}\\b|\\b${W('hand', '-?over')}\\b|\\b${W('mile', 'stones?')}\\b|\\b${W('au', 'dits?')}\\b|\\b${W('re', 'build')}\\b`, 'i'), OURS));

  // Every module opens by saying what it is, what is pure and which test checks it, so whoever opens it knows how to prove a change.
  const header = text => { const lines = text.split('\n'), top = []; for (const l of lines) { if (l.startsWith('//')) top.push(l); else break; } return top; };
  const names = rel => { const top = header(read(rel)), suite = /(^|\/)(test|e2e)\w*\.mjs$/.test(rel);
    return top.length < 2 || top.length > 4 ? `${rel}: its header is ${top.length} lines, not two to four`
      : !(suite ? /suite|harness/i : /\b(test|e2e)\w*\.mjs\b|vendor\.mjs --check|check\.sh/).test(top.join(' ')) ? `${rel}: its header does not ${suite ? 'say what it is the suite for' : 'name the test that checks it'}` : ''; };
  none('every module in js/ opens with a header that names its test', JS_FILES.map(names).filter(Boolean));
  none('every script in scripts/ opens with a header that names its test', FILES.filter(rel => /^scripts\/[^/]+\.mjs$/.test(rel)).map(names).filter(Boolean));
  none('every shell script is plain POSIX sh (a file that is only read in by another needs no first line)', FILES.filter(rel => ext(rel, '.sh', '.command') && OURS(rel)).filter(rel => /^#!/.test(read(rel)) ? !read(rel).startsWith('#!/bin/sh\n') : ext(rel, '.command')).map(rel => `${rel} does not start with #!/bin/sh`));

  const suites = FILES.filter(rel => /^scripts\/(test|e2e)\w*\.mjs$/.test(rel) && rel !== 'scripts/e2e_lib.mjs'), runner = has('scripts/check.sh') ? read('scripts/check.sh') : '';
  none('check.sh runs every suite there is (a suite nobody runs guards nothing)', suites.filter(rel => !runner.includes(path.basename(rel))));
  // A test browser must never ask the computer's keychain for anything: on a Mac that puts a system dialog in front of the owner.
  none('every browser a suite starts carries the two keychain flags', FILES.filter(rel => /^scripts\/[^/]+\.mjs$/.test(rel) && rel !== 'scripts/test.mjs' && /--remote-debugging-port|--headless/.test(read(rel))).filter(rel => !read(rel).includes("'--use-mock-keychain'") || !read(rel).includes("'--password-store=basic'")));
  none('every suite ends with its "N passed, M failed" line', suites.filter(rel => !/passed, \$\{\w+\} failed/.test(read(rel)) && !read(rel).includes('finish()')));
});

// ---- nothing is loaded from an outside address (the data services are asked for data, never for code, fonts or styles)
await group('outside addresses', async () => {
  const DATA_HOSTS = ['power.larc.nasa.gov', 'api.open-meteo.com', 'server.arcgisonline.com'];   // NASA weather, the forecast, the satellite photo tiles
  const outside = v => /^(https?:)?\/\//i.test(v.trim());
  const tags = [], hints = [];
  for (const rel of PAGES) for (const m of read(rel).matchAll(/<(script|link|img|iframe|source|video|audio|embed|object|use|image)\b[^>]*>/gi)) {
    const attr = name => (new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(m[0]) || [])[1] ?? '';
    const hint = m[1].toLowerCase() === 'link' && /\b(preconnect|dns-prefetch)\b/.test(attr('rel'));
    for (const v of [attr('src'), attr('href'), attr('data'), attr('poster'), ...attr('srcset').split(',')].filter(outside)) {
      let host = ''; try { host = new URL(v.trim().replace(/^\/\//, 'https://')).host; } catch { /* not an address at all */ }
      if (hint) { if (!DATA_HOSTS.includes(host)) hints.push(`${rel}: ${host || v}`); } else tags.push(`${rel}: <${m[1]}> ${v.trim().slice(0, 60)}`);
    }
  }
  none('no page loads a script, style, font or picture from an outside address', tags);
  none('the only early connections are to the data services', hints);
  none('no stylesheet imports or loads anything from outside', STYLES.flatMap(([rel, css]) => [...noComments(css).matchAll(/@import\s+[^;]+|url\(\s*["']?\s*((?:https?:)?\/\/[^)"']+)/gi)].filter(m => m[1] || outside(m[0].replace(/@import\s+(url\()?["']?/i, ''))).map(m => `${rel}: ${m[0].slice(0, 70)}`)));
  none('no script imports code from outside', SCRIPTS.flatMap(([rel, js]) => [...js.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|importScripts\(\s*|new (?:Shared)?Worker\(\s*)["']((?:https?:)?\/\/[^"']+)["']/g)].map(m => `${rel}: ${m[1].slice(0, 70)}`)));
  const CDNS = ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'esm.sh', 'cdn.skypack.dev', 'fonts.googleapis.com', 'fonts.gstatic.com', 'ajax.googleapis.com', 'use.typekit.net', 'kit.fontawesome.com'];
  none('no library or font host is named in the app at all', finds(new RegExp(CDNS.map(h => h.replace(/\./g, '\\.')).join('|'), 'i'), rel => /^(js|css)\//.test(rel) || PAGES.includes(rel)));
  const local = PAGES.flatMap(rel => [...read(rel).matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)="([^"#?:]+)"/g)].map(m => m[1]).filter(v => !outside(v) && v !== './').map(v => [rel, v]));
  none('every file a page asks for is in the folder', local.filter(([, v]) => !has(v)).map(([rel, v]) => `${rel} asks for ${v}`));
});

// ---- the one page of the app
await group('index.html', async () => {
  const html = read('index.html'), body = html.slice(html.indexOf('<body'));
  same('the page says it is in English', (/<html\b[^>]*\blang="([^"]*)"/.exec(html) || [])[1], 'en');
  same('the viewport fills a phone with a notch', (/<meta name="viewport" content="([^"]*)"/.exec(html) || [])[1], 'width=device-width, initial-scale=1, viewport-fit=cover');
  same('the title', (/<title>([^<]*)<\/title>/.exec(html) || [])[1], 'Crophalo · Rotation planning with NASA data');
  same('the page asks for the light look only', [...html.matchAll(/<meta name="color-scheme" content="([^"]*)"/g)].map(m => m[1]), ['light']);
  const views = [...body.matchAll(/<section\b([^>]*\bclass="view"[^>]*)>/g)].map(m => ({ id: (/\bid="([^"]*)"/.exec(m[1]) || [])[1], hidden: /\shidden\b/.test(m[1]) }));
  same('exactly the six views, in their order', views.map(v => v.id), ['view-home', 'view-setup', 'view-info', 'view-admin', 'view-report', 'view-farm']);
  same('only the home shows at first', views.filter(v => !v.hidden).map(v => v.id), ['view-home']);
  const parts = body.split(/<section\b[^>]*\bclass="view"[^>]*>/).slice(1).map(p => p.split('</section>')[0]);
  same('every view has one main heading', parts.map(p => (p.match(/<h1\b/g) || []).length), [1, 1, 1, 1, 1, 1]);
  same('one skip link, and it is the first link on the page', [(html.match(/class="skip"/g) || []).length, (/<a\b[^>]*>/.exec(body) || [''])[0]], [1, '<a class="skip" href="#main">']);
  check('the skip link leads to the one main part', (body.match(/<main\b/g) || []).length === 1 && /<main\b[^>]*\bid="main"/.test(body) && !/<main\b[^>]*\btabindex/.test(body), 'main must not be left focusable: it would catch every click on plain words');
  check('the offline bar and the toast are spoken when they change', /<div class="offline-bar" id="offlineBar" role="status" hidden>/.test(body) && /<div id="toast" class="toast" role="status">/.test(body));
  const order = ['<script src="vendor/leaflet/leaflet.js">', "addEventListener('error'", '<script type="module" src="js/app.js">', '<noscript>'].map(s => body.indexOf(s));
  check('scripts in their order: the map library, the honest load-error line, the app, the no-script line', order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `found at ${order}`);
  check('the load-error line is the plain one', body.includes('Crophalo could not load all of its files. Check the internet connection, then reload the page.'));
  none('the picture links of the page point at files that are there', ['manifest.json', 'icons/apple-touch-icon.png', 'icons/crophalo-512.png'].filter(f => !html.includes(`"${f}"`) || !has(f)));
  // Every button and link says what it is: its own words, or a name written on it for screen readers (the owner: "has all aria labels and alt texts").
  const nameless = [];
  for (const rel of PAGES) for (const m of read(rel).matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const words = m[3].replace(/<svg\b[\s\S]*?<\/svg>/g, '').replace(/<[^>]*aria-hidden="true"[^>]*>[^<]*<\/\w+>/g, '').replace(/<[^>]+>/g, '').trim();
    if (!words && !/\saria-label(ledby)?="[^"]+"/.test(m[2])) nameless.push(`${rel}: <${m[1]}${m[2].slice(0, 60)}>`);
  }
  none('every button and link in the pages has a name', nameless);
  none('every picture in the pages has its words, or is marked as decoration', PAGES.flatMap(rel => [...read(rel).matchAll(/<img\b(?![^>]*\salt=)[^>]*>|<svg\b(?![^>]*(aria-hidden="true"|aria-label="|role="img"))[^>]*>/g)].map(m => `${rel}: ${m[0].slice(0, 70)}`)));
  for (const rel of PAGES.filter(p => p !== 'index.html')) { const h = read(rel);
    check(`${rel}: English, the phone viewport, the light look, a title of its own`, /<html\b[^>]*\blang="en"/.test(h) && h.includes('content="width=device-width, initial-scale=1, viewport-fit=cover"') && /<meta name="color-scheme" content="light">/.test(h) && /<title>[^<]+ · Crophalo<\/title>/.test(h)); }
});

// ---- the one demo region, the install file, the robots file
await group('data and install files', async () => {
  const regions = JSON.parse(read('data/regions.json'));
  check('one demo region only: Ontario (the owner chose to keep just this one)', Array.isArray(regions) && regions.length === 1 && /Ontario/.test(regions[0].name), regions.map(r => r.name).join());
  const r = regions[0] || {};
  same('its country is Canada and it has a name', [typeof r.name === 'string' && r.name.length > 3, r.country], [true, 'Canada']);
  check('its place is a real pair of numbers inside Ontario', Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.lat > 41.6 && r.lat < 56.9 && r.lon > -95.2 && r.lon < -74.3, `lat ${r.lat}, lon ${r.lon}`);
  none('it carries only the fields the app knows', Object.keys(r).filter(k => !['id', 'name', 'country', 'lat', 'lon', 'rotation', 'defaults', 'aliases', 'blurb'].includes(k)));
  // Its ready answers: rain only, and a soil that is said to be assumed, never one that looks measured (the report then says it is less sure).
  same('its ready answers are rain-fed and an assumed soil', r.defaults, { irrigation: 'none', soil: 'assumed' });
  check('its other names are short words a farmer may search for', Array.isArray(r.aliases) && r.aliases.every(a => typeof a === 'string' && a.length >= 2 && a.length <= 40), r.aliases);
  check('its rotation is a short id, not a sentence', typeof r.rotation === 'string' && /^[a-z0-9-]+$/.test(r.rotation), r.rotation);

  const man = JSON.parse(read('manifest.json'));
  same('install file: the names', [man.name, man.short_name], ['Crophalo: crop rotation with NASA data', 'Crophalo']);
  same('install file: what it is, in one line, as a phone shows it when the app is added', man.description, 'Compare crop rotations for your field using NASA Earth observations, your soil and what matters to you.');
  same('install file: it starts and stays inside its own folder', [man.start_url, man.scope], ['./', './']);
  same('install file: it opens like an app, on the page colour', [man.display, man.background_color, man.theme_color], ['standalone', '#f2f2f4', '#f2f2f4']);
  same('install file: two icons, safe for any shape', (man.icons || []).map(i => [i.src, i.sizes, i.type, i.purpose]), [['icons/crophalo-192.png', '192x192', 'image/png', 'any maskable'], ['icons/crophalo-512.png', '512x512', 'image/png', 'any maskable']]);
  none('install file: no shortcuts, screenshots, orientation or id', Object.keys(man).filter(k => ['shortcuts', 'screenshots', 'orientation', 'id'].includes(k)));
  const png = rel => { try { const b = fs.readFileSync(path.join(ROOT, rel)); return b.subarray(1, 4).toString() === 'PNG' ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : 'not a PNG'; } catch { return 'missing'; } };
  same('the icons are pictures of the size they say', ['icons/crophalo-192.png', 'icons/crophalo-512.png', 'icons/apple-touch-icon.png'].map(png), ['192x192', '512x512', '180x180']);
  check('the logo drawing is there', has('icons/crophalo.svg') && read('icons/crophalo.svg').includes('<svg'));
  check('robots.txt keeps search engines out of /api/', /^User-agent: \*\nDisallow: \/api\/\s*$/.test(read('robots.txt')));
});

// ---- the tokens: design/crophalo.tokens.json equals the first :root block of css/app.css, value for value
const css = read('css/app.css');
const rootBody = (() => { const src = noComments(css), at = src.search(/(^|\})\s*:root\s*\{/), open = src.indexOf('{', at); return src.slice(open + 1, src.indexOf('}', open)); })();
const ROOT_VARS = Object.fromEntries(decls(rootBody).filter(([prop]) => prop.startsWith('--')));
const TOKENS = [], byPath = new Map();
(function gather(node, trail) { if (node && typeof node === 'object' && '$value' in node) { const t = { path: trail.join('.'), type: node.$type, value: node.$value, css: node.$extensions?.css }; TOKENS.push(t); byPath.set(t.path, t); } else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) if (!k.startsWith('$')) gather(v, [...trail, k]); })(JSON.parse(read('design/crophalo.tokens.json')), []);
const refTo = v => typeof v === 'string' && /^\{[^}]+\}$/.test(v) ? byPath.get(v.slice(1, -1)) : null;
const refCss = v => { const t = refTo(v); return t?.css ? `var(${t.css})` : typeof v === 'string' && v.startsWith('{') ? `(nothing called ${v})` : v; };
function asCss(t) {   // a token written the way the stylesheet would write it
  const v = t.value;
  if (t.type === 'shadow') return refTo(v) ? refCss(v) : [v].flat().map(l => `${l.inset ? 'inset ' : ''}${l.offsetX} ${l.offsetY} ${l.blur} ${l.spread} ${refCss(l.color)}`).join(', ');
  if (t.type === 'fontFamily') return [v].flat().join(', ');
  if (t.type === 'cubicBezier') return Array.isArray(v) ? `cubic-bezier(${v.join(',')})` : refCss(v);
  return refCss(String(v));
}
await group('the tokens', async () => {
  const named = TOKENS.filter(t => t.css);
  none('every token of the stylesheet is in the tokens file', Object.keys(ROOT_VARS).filter(n => !named.some(t => t.css === n)));
  none('every token of the tokens file is in the stylesheet', named.filter(t => !Object.hasOwn(ROOT_VARS, t.css)).map(t => t.css));
  same('no token is listed twice', named.length, new Set(named.map(t => t.css)).size);
  for (const kind of [...new Set(named.map(t => t.path.split('.')[0]))]) {
    none(`tokens file equals the stylesheet, value for value: ${kind}`, named.filter(t => t.path.startsWith(kind + '.') && Object.hasOwn(ROOT_VARS, t.css)).filter(t => t.type === 'shadow' ? shadowCanon(asCss(t)) !== shadowCanon(ROOT_VARS[t.css]) : canon(asCss(t)) !== canon(ROOT_VARS[t.css]))
      .map(t => `${t.css}: the file says ${asCss(t)}, the stylesheet ${ROOT_VARS[t.css]}`));
  }
  none('every type style is built from tokens that exist', TOKENS.filter(t => t.type === 'typography').flatMap(t => Object.values(t.value).filter(v => !refTo(v)).map(v => `${t.path}: ${v}`)));
  check('there are tokens to compare at all', named.length >= 150 && Object.keys(ROOT_VARS).length >= 150, `${named.length} in the file, ${Object.keys(ROOT_VARS).length} in the stylesheet`);
});

// ---- one blue
await group('one blue', async () => {
  const ACCENT = '#0a63d8', TEXT_BLUES = { '#0959c4': 'the same blue, darker, for words on white or on the tint (6.5:1, so a farmer reads it in sunlight)', '#063f96': 'the same blue, darker again, for words under High contrast' };
  const DATA_MARKS = /^--(c-[\w-]+|shade)$/;   // chart marks and the shade hatch are data, drawn in their own colours; they are never a chosen state
  const BLUE_TOKENS = ['--accent', '--accent-soft', '--accent-text', '--sel', '--focus-soft'];
  const QUIET = ['--accent-ink', '--card', '--card2', '--seg-thumb', '--sep', '--sep2', '--ink', '--ink2', '--bg', '--bar', '--fill', '--fill2', '--shadow', '--shadow-lg', '--shadow-ctl', '--shadow-map', '--shadow-primary', '--shadow-thumb'];
  same('--accent is the one blue', colour(ROOT_VARS['--accent'] || ''), ACCENT);
  same('the tokens file says the same blue', TOKENS.find(t => t.css === '--accent')?.value, ACCENT);
  same('the focus ring and the chosen option are that blue too, by name', canon(ROOT_VARS['--sel'] || ''), 'var(--accent)');
  same('the soft tints are the same blue, thinned', ['--accent-soft', '--focus-soft'].map(n => (colour(ROOT_VARS[n] || '') || '').slice(0, 7)), [ACCENT, ACCENT]);
  same('the blue for words is the darker shade of it, and links use the same', ['--accent-text', '--link'].map(n => colour(ROOT_VARS[n] || '')), ['#0959c4', '#0959c4']);
  check('the darker shades keep the hue of the one blue', Object.keys(TEXT_BLUES).every(h => Math.abs(hue(rgb(h)) - hue(rgb(ACCENT))) <= 3));

  const every = RULES.filter(onScreen).flatMap(r => r.decls.map(([prop, value]) => ({ r, prop, value })));
  none('a token may only be blue if it is the one blue (chart marks keep their own colours)', every.filter(d => d.prop.startsWith('--') && !DATA_MARKS.test(d.prop))
    .flatMap(d => (d.value.match(COLOUR) || []).map(colour).filter(Boolean).filter(c => isBlue(c) && c.slice(0, 7) !== ACCENT && !Object.hasOwn(TEXT_BLUES, c.slice(0, 7))).map(c => `${d.r.rel}: ${d.r.sel} { ${d.prop}: ${c} }`)));
  none('no rule paints with a blue of its own', every.filter(d => !d.prop.startsWith('--'))
    .flatMap(d => (d.value.replace(/url\([^)]*\)/g, '').match(COLOUR) || []).map(colour).filter(Boolean).filter(c => isBlue(c) && c.slice(0, 7) !== ACCENT).map(c => `${d.r.rel}: ${d.r.sel} { ${d.prop}: ${c} }`)));

  // A chosen thing: a pressed, checked, selected, current or open control. It may use the one blue and quiet neutrals, nothing else.
  const CHOSEN = /\.on(?![\w-])|\[aria-(pressed|checked|selected|expanded)="?true|\[aria-current(?!="?false)|:checked|\.(sel|selected|active|current|chosen|talking)(?![\w-])/;
  const PAINT = /^(background(-color|-image)?|color|box-shadow|border(-\w+)*|outline(-color)?|fill|stroke|text-decoration(-color)?|caret-color|accent-color)$/;
  const HEARING = /^\.mic\.hearing, \.mic\[aria-pressed=true\]$/;   // the microphone turns red while it listens, as a recording light does: the one chosen state that is not blue, by design
  const NAMED = /\b(blue|navy|royalblue|dodgerblue|steelblue|skyblue|deepskyblue|cornflowerblue|green|limegreen|seagreen|forestgreen|lime|teal|aqua|cyan|turquoise|red|crimson|orange|gold|yellow|purple|violet|indigo|magenta|pink)\b/i;
  const chosen = RULES.filter(r => onScreen(r) && split(r.sel, ',').some(s => CHOSEN.test(noNot(s))) && !HEARING.test(r.sel));
  const wrong = [], blue = new Set();
  for (const r of chosen) for (const [prop, value] of r.decls) {
    if (!PAINT.test(prop)) continue;
    const bare = value.replace(/url\([^)]*\)/g, '');
    for (const m of bare.matchAll(/var\(\s*(--[\w-]+)/g)) { if (BLUE_TOKENS.includes(m[1])) blue.add(r); else if (!QUIET.includes(m[1])) wrong.push(`${r.rel}: ${r.sel} { ${prop}: var(${m[1]}) }`); }
    for (const c of (bare.match(COLOUR) || []).map(colour).filter(Boolean)) { if (c.slice(0, 7) === ACCENT) blue.add(r); else if (sat(rgb(c)) >= .15) wrong.push(`${r.rel}: ${r.sel} { ${prop}: ${c} }`); }
    if (/\b(hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/.test(bare) || NAMED.test(bare.replace(/var\([^)]*\)/g, ''))) wrong.push(`${r.rel}: ${r.sel} { ${prop}: ${value.slice(0, 50)} }`);
  }
  none('every chosen state is painted with the one blue and quiet neutrals only (no second blue, no green tab)', wrong);
  check('the scan really finds the chosen states', chosen.length >= 12 && blue.size >= 10, `${chosen.length} rules for chosen states, ${blue.size} of them use the blue`);
  same('the browser bar and the installed app take the page colour', [colour(ROOT_VARS['--bg'] || ''), ...PAGES.map(rel => (/<meta name="theme-color" content="([^"]*)"/.exec(read(rel)) || [])[1])], ['#f2f2f4', ...PAGES.map(() => '#f2f2f4')]);
});

// ---- the look of the small parts: the corners, weights and sizes a farmer sees on every screen
await group('the look', async () => {
  const appRules = RULES.filter(r => r.rel === 'css/app.css' && !r.at.length);
  const ruleOf = sel => appRules.filter(r => r.sel === sel);
  const valueOf = (sel, prop) => { let found; for (const r of ruleOf(sel)) for (const [p, v] of r.decls) if (p === prop) found = v; return found; };
  const px = v => { const m = /^(-?[\d.]+)px$/.exec(String(ROOT_VARS[String(v).replace(/^var\((--[\w-]+)\)$/, '$1')] ?? v).trim()); return m ? +m[1] : String(v); };
  same('a chip is a pill on one line: radius 11 for a 22 px chip', px(valueOf('.chip', 'border-radius')), 11);
  same('a chip whose words can wrap keeps small corners: radius 6, so two lines never look like a broken pill', px(valueOf('.chip.wrap', 'border-radius')), 6);
  same('the status badge and the tick box keep their own small corner, apart from the chip', [px(valueOf('.st-badge', 'border-radius')), px(valueOf('.cbx', 'border-radius'))], [6, 6]);
  check('the status badge and the tick box do not borrow the chip corner', !/--r-chip\b/.test(valueOf('.st-badge', 'border-radius') + valueOf('.cbx', 'border-radius')));
  same('the big buttons on the home: radius 16', px(valueOf('.bigbtn', 'border-radius')), 16);
  same('the big buttons stand 12 px apart', px(valueOf('.bigbtns', 'gap')), 12);
  const pressed = '.seg button:is([aria-pressed=true], [aria-checked=true])';
  same('the pressed segment: ink words, weight 600, on the white thumb', [valueOf(pressed, 'color'), valueOf(pressed, 'font-weight'), valueOf(pressed, 'background')], ['var(--ink)', 'var(--fw-semi)', 'var(--seg-thumb)']);
  same('the white thumb has its soft lift', canon(valueOf(pressed, 'box-shadow')), 'var(--shadow-thumb)');
  same('the thumb shadow token', shadowCanon(ROOT_VARS['--shadow-thumb'] || ''), shadowCanon('0 .5px 1px rgba(0,0,0,.14), 0 1px 3px rgba(0,0,0,.1)'));
  same('the sliding thumb has the same lift', canon(valueOf('.seg.slide::before', 'box-shadow')), 'var(--shadow-thumb)');
  same('the top bar keeps 12 px between its parts', valueOf('.nav-in', 'gap'), '0 var(--space-12)');
  same('the count on Saved is weight 650', valueOf('.count', 'font-weight'), 'var(--fw-brand)');
  same('the Listen button: 6 px between picture and words, padding 6 12 6 10', [valueOf('.listen', 'gap'), valueOf('.listen', 'padding')], ['6px', '6px var(--space-12) 6px 10px']);
  same('words in a select or text field are 14 px (16 px on a phone, so it does not zoom in)', px('--fs-field'), 14);
  same('the toast words are 13.5 px', px(valueOf('.toast', 'font-size')), 13.5);
  const design = has('design.html') ? read('design.html') : '';
  none('the design page shows the card title, label and eyebrow type', ['Card title · 18 / 600', 'Label · 13.5 / 500', 'Eyebrow · 13 / 600'].filter(t => !design.includes(t)));
  none('a part of the design page that carries a name has a role that may carry it', [...design.matchAll(/<div\b(?![^>]*\brole=)[^>]*\baria-label="[^"]*"[^>]*>/g)].map(m => m[0].slice(0, 80)));
});

// ---- calm motion: nothing bounces (the owner: "No bouncing buttons! Fix for all.")
await group('calm motion', async () => {
  const everywhere = [...STYLES, ...SCRIPTS, ['design/crophalo.tokens.json', JSON.stringify(TOKENS.filter(t => t.type === 'cubicBezier' && Array.isArray(t.value)).map(t => `cubic-bezier(${t.value})`))]];
  none('no curve overshoots or pulls back (every cubic-bezier stays between 0 and 1)', everywhere.flatMap(([rel, text]) => [...text.matchAll(/cubic-bezier\(([^)]*)\)/g)].filter(m => { const p = m[1].split(',').map(Number); return p.length !== 4 || p.some(v => !(v >= 0 && v <= 1)); }).map(m => `${rel}: ${m[0]}`)));
  none('no stepped curve goes past its end (every linear() stays between 0 and 1)', everywhere.flatMap(([rel, text]) => [...text.matchAll(/(?<![-\w])linear\(([^)]*)\)/g)].filter(m => (m[1].match(/-?[\d.]+(?!\s*%)/g) || []).some(v => +v > 1 || +v < 0)).map(m => `${rel}: ${m[0].slice(0, 60)}`)));
  const tooBig = text => [...text.matchAll(/\bscale(?:X|Y|3d)?\(([^)]*)\)|(?<![-\w])scale\s*:\s*([^;}"']+)|\bmatrix\(([^)]*)\)/g)].filter(m => { const n = (m[1] ?? m[2] ?? '').match(/-?[\d.]+/g)?.map(Number) || []; const mx = m[3]?.split(',').map(Number); return n.some(v => Math.abs(v) > 1.001) || (mx && (Math.hypot(mx[0], mx[1]) > 1.001 || Math.hypot(mx[2], mx[3]) > 1.001)); }).map(m => m[0]);
  none('no style scales anything past its full size', STYLES.flatMap(([rel, text]) => tooBig(noComments(text)).map(found => `${rel}: ${found}`)));
  none('no script scales anything past its full size', SCRIPTS.flatMap(([rel, text]) => tooBig(text).map(found => `${rel}: ${found}`)));

  // A keyframe may grow up to its size, slide in or turn one way. It may not dip and come back, rise and fall, or pass 1.
  const offset = key => key === 'from' ? 0 : key === 'to' ? 100 : parseFloat(key);
  const pose = value => {   // scale, slide and turn of one stop
    const p = { sx: 1, sy: 1, tx: 0, ty: 0, rot: 0 }, n = (re) => (re.exec(value) || [])[1]?.split(',').map(parseFloat);
    let a;
    if ((a = n(/\bscale\(([^)]*)\)/))) { p.sx = a[0]; p.sy = a[1] ?? a[0]; } if ((a = n(/\bscaleX\(([^)]*)\)/))) p.sx = a[0]; if ((a = n(/\bscaleY\(([^)]*)\)/))) p.sy = a[0]; if ((a = n(/\bscale3d\(([^)]*)\)/))) { p.sx = a[0]; p.sy = a[1]; }
    if ((a = n(/\btranslate(?:3d)?\(([^)]*)\)/))) { p.tx = a[0]; p.ty = a[1] ?? 0; } if ((a = n(/\btranslateX\(([^)]*)\)/))) p.tx = a[0]; if ((a = n(/\btranslateY\(([^)]*)\)/))) p.ty = a[0];
    if ((a = n(/\brotate(?:Z)?\(([^)]*)\)/))) p.rot = a[0];
    return p;
  };
  const oneWay = list => { let dir = 0; for (let i = 1; i < list.length; i++) { const d = Math.sign(list[i] - list[i - 1]); if (d && dir && d !== dir) return false; dir = d || dir; } return true; };
  const restless = [];
  for (const f of FRAMES) {
    const stops = f.stops.flatMap(s => split(s.keys, ',').map(k => ({ at: offset(k), decls: s.decls }))).sort((a, b) => a.at - b.at);
    const moved = stops.map(s => { const t = s.decls.filter(([p]) => ['transform', 'scale', 'translate', 'rotate'].includes(p)); return t.length ? { at: s.at, ...pose(t.map(([p, v]) => p === 'transform' ? v : `${p}(${v.replace(/\s+/g, ',')})`).join(' ')) } : null; }).filter(Boolean);
    if (!moved.length) continue;
    if (moved[0].at > 0) moved.unshift({ at: 0, ...pose('') }); if (moved.at(-1).at < 100) moved.push({ at: 100, ...pose('') });   // an end that is not written is the thing at rest
    for (const part of ['sx', 'sy', 'tx', 'ty', 'rot']) if (!oneWay(moved.map(m => m[part]))) restless.push(`${f.rel}: @keyframes ${f.name} goes there and back (${part}: ${moved.map(m => m[part]).join(' → ')})`);
    if (moved.some(m => Math.abs(m.sx) > 1.001 || Math.abs(m.sy) > 1.001)) restless.push(`${f.rel}: @keyframes ${f.name} scales past full size (${moved.map(m => `${m.sx}×${m.sy}`).join(' → ')})`);
  }
  none('no keyframe scales past 1, squashes and returns, or rises and falls', restless);
  none('the old bounces, wiggles and the shake stay gone', [...FRAMES.map(f => `${f.rel}: @keyframes ${f.name}`), ...RULES.flatMap(r => (r.sel.match(/\.[\w-]+/g) || []).map(c => `${r.rel}: ${c}`))].filter(n => /bounc|wiggl|shak|wobbl|jiggl|elastic|rubber|squash|\bpop\b|puls(e|ing)-?scale/i.test(n.split(': ')[1])));
  const pressed = RULES.filter(r => split(r.sel, ',').some(s => /:active/.test(noNot(s)))), pointed = RULES.filter(r => split(r.sel, ',').some(s => /:hover/.test(noNot(s))));
  const MOVES = ['transform', 'scale', 'translate', 'rotate', 'zoom'];
  none('a press never moves or resizes anything (no transform on :active)', pressed.flatMap(r => r.decls.filter(([p, v]) => MOVES.includes(p) && v !== 'none').map(([p, v]) => `${r.rel}: ${r.sel} { ${p}: ${v} }`)));
  // Pointing at a thing may change its shade. The one move allowed is an arrow sliding sideways by a few px; nothing lifts, grows or turns.
  none('pointing at a thing never lifts, grows or turns it (no such transform on :hover)', pointed.flatMap(r => r.decls.filter(([p, v]) => MOVES.includes(p) && v !== 'none' && !(p === 'transform' && /^translateX\(\s*-?[0-4](\.\d+)?px\s*\)$/.test(v))).map(([p, v]) => `${r.rel}: ${r.sel} { ${p}: ${v} }`)));
  same('"spring" is only another name for the one smooth curve', canon(ROOT_VARS['--spring'] || ''), 'var(--ease)');

  // The still switch: the farmer's own choice and the device's. Each must stop animations and transitions and take away both delays.
  const norm = s => s.replace(/["']/g, '').replace(/\s+/g, ' ').trim();
  const ms = v => /ms\b/.test(v) ? parseFloat(v) : parseFloat(v) * 1000, forced = v => /!important$/.test(v);
  const switchFor = (label, pick, star) => {
    const mine = RULES.filter(pick), wide = mine.filter(r => { const list = split(norm(r.sel), ','); return [star, star + '::before', star + '::after'].every(s => list.includes(s)); });
    const value = prop => wide.flatMap(r => r.decls.filter(([p]) => p === prop).map(([, v]) => v)).pop() || '';
    for (const prop of ['animation-duration', 'transition-duration']) check(`still switch, ${label}: ${prop} is next to nothing, for everything and its ::before and ::after`, forced(value(prop)) && ms(value(prop)) <= .01, value(prop) || 'not set');
    for (const prop of ['animation-delay', 'transition-delay']) check(`still switch, ${label}: ${prop} is taken away, so staggered things appear at once`, forced(value(prop)) && ms(value(prop)) === 0, value(prop) || 'not set');
    check(`still switch, ${label}: things that would loop play once, and the page does not glide when it scrolls`, /^1 !important$/.test(value('animation-iteration-count')) && /^auto !important$/.test(value('scroll-behavior')), `${value('animation-iteration-count')} / ${value('scroll-behavior')}`);
    check(`still switch, ${label}: the dimmed layer behind a sheet is named too (the star cannot reach it)`, mine.some(r => /::backdrop/.test(r.sel) && r.decls.some(([p, v]) => p === 'animation' && /^none !important$/.test(v)) && r.decls.some(([p, v]) => p === 'transition' && /^none !important$/.test(v))));
  };
  switchFor('the setting', r => !r.at.length && /html\[data-motion=["']?reduce["']?\]/.test(r.sel), 'html[data-motion=reduce] *');
  switchFor('the device', r => r.at.some(a => /prefers-reduced-motion:\s*reduce/.test(a)), '*');

  // The same switch for scripts, run for real with a stand-in page and device.
  const device = { matches: false }, shown = {};
  globalThis.matchMedia = query => /prefers-reduced-motion:\s*reduce/.test(query) ? device : { matches: false };
  globalThis.document = { documentElement: { dataset: shown } };
  const { motionOff } = await import(pathToFileURL(path.join(ROOT, 'js', 'motion.js')).href);
  same('motionOff(): nothing asked, so things may move', motionOff(), false);
  shown.motion = 'reduce'; same('motionOff(): "Always still" stops scripts too', motionOff(), true);
  delete shown.motion; device.matches = true; same('motionOff(): the device\'s own setting stops scripts too', motionOff(), true);
  device.matches = false;
});

// ---- light mode only (the owner: "Make sure our tool is in light mode. Not dark.")
await group('light mode only', async () => {
  const all = [...STYLES, ...SCRIPTS, ...PAGES.map(rel => [rel, read(rel)])];
  same('the stylesheet asks for the light look', (/color-scheme\s*:\s*([^;]+);/.exec(rootBody) || [])[1]?.trim(), 'light');
  none('nothing asks for a dark look', all.flatMap(([rel, text]) => [...text.matchAll(/(?<!prefers-)color-scheme["']?\s*[:=]\s*["']?([^;"'}>]+)/g)].filter(m => m[1].trim() !== 'light').map(m => `${rel}: ${m[0].trim()}`)));
  none('no rule waits for the device\'s dark setting', all.flatMap(([rel, text]) => [...text.matchAll(/prefers-color-scheme[^)]*\)?/g)].map(m => `${rel}: ${m[0]}`)));
  none('there is no theme switch', all.flatMap(([rel, text]) => [...text.matchAll(/data-theme|theme-dark|dark-?mode|\.dark(?![\w-])/gi)].map(m => `${rel}: ${m[0]}`)));
});

// ---- the shared words and the settings store
await group('words and settings', async () => {
  const { esc, own, countryName } = await import(pathToFileURL(path.join(ROOT, 'js', 'words.js')).href);
  same('esc() makes the five marks safe', esc(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  same('esc() of nothing is an empty text, and a number is its digits', [esc(null), esc(undefined), esc(0), esc(12.5)], ['', '', '0', '12.5']);
  same('esc() leaves plain words and Türkiye alone', esc('Barrie & Simcoe, Türkiye'), 'Barrie &amp; Simcoe, Türkiye');
  const table = { wheat: 1 };
  same('own() says no to "toString"', own(table, 'toString'), false);
  same('own() says no to "__proto__" and "constructor"', [own(table, '__proto__'), own(table, 'constructor'), own(table, 'hasOwnProperty')], [false, false, false]);
  same('own() says yes only to a real entry, asked for by its text', [own(table, 'wheat'), own(table, 'corn'), own(table, 1), own(table, undefined), own(['a'], 0)], [true, false, false, false, false]);
  const old = W('Tur', 'key');
  same('the country code TR is always Türkiye, whatever name came with it', [countryName('', 'TR'), countryName(old, 'TR'), countryName('anything', 'tr'), countryName(undefined, ' TR ')], ['Türkiye', 'Türkiye', 'Türkiye', 'Türkiye']);
  same('a place search that answers with the English name comes out as Türkiye', [countryName(old), countryName(old.toUpperCase()), countryName(`Republic of ${old}`), countryName('Türkiye')], ['Türkiye', 'Türkiye', 'Republic of Türkiye', 'Türkiye']);
  same('other countries keep their names', [countryName('Canada', 'CA'), countryName(' Kenya '), countryName(undefined)], ['Canada', 'Kenya', '']);

  const { cleanSettings, SETTING_CHOICES, SETTINGS_KEY } = await import(pathToFileURL(path.join(ROOT, 'js', 'settings.js')).href);
  const DEFAULTS = { motion: 'device', listen: 'normal', text: 'default', contrast: 'standard', links: 'standard', currency: 'USD' };
  same('settings are kept under the one key', SETTINGS_KEY, 'crophalo.settings.v1');
  same('nothing stored gives the defaults', [cleanSettings(null), cleanSettings('x'), cleanSettings([])], [DEFAULTS, DEFAULTS, DEFAULTS]);
  same('a known choice is kept', cleanSettings({ motion: 'reduce', text: 'xlarge', contrast: 'high', links: 'underline', listen: 'slow', currency: 'TRY' }), { motion: 'reduce', listen: 'slow', text: 'xlarge', contrast: 'high', links: 'underline', currency: 'TRY' });
  same('an unknown or hostile value falls back to the default', cleanSettings({ motion: 'toString', text: '<script>', contrast: { a: 1 }, links: 7, currency: 'usd!', extra: 'x' }), DEFAULTS);
  same('the three text sizes and the two motion choices', [SETTING_CHOICES.text, SETTING_CHOICES.motion], [['default', 'large', 'xlarge'], ['device', 'reduce']]);
});

// ---- the libraries kept in the folder
await group('the libraries', async () => {
  const { LIBS, inspect, vendorRun } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'vendor.mjs')).href);
  for (const lib of LIBS) { const here = inspect(lib, ROOT); check(`${lib.label || lib.id}: every file is the published one, byte for byte`, here.ok, here.why); }
  const version = dir => { try { return JSON.parse(read(`${dir}/VERSION.json`)).packages.map(p => `${p.name} ${p.version}`); } catch { return 'no VERSION.json'; } };
  same('the versions are the ones the app is built on: Leaflet 1.9.4, MapLibre GL 4.7.1 with its Leaflet plugin, three.js r160', [version('vendor/leaflet'), version('vendor/maplibre').slice(0, 1), version('vendor/three').map(v => v.replace(/\.\d+$/, ''))], [['leaflet 1.9.4'], ['maplibre-gl 4.7.1'], ['three 0.160']]);
  none('each library keeps its licence beside it', ['vendor/leaflet', 'vendor/maplibre', 'vendor/three', 'scripts/vendor-test'].filter(dir => !FILES.some(rel => rel.startsWith(dir + '/') && /LICEN[CS]E/i.test(rel))));
  check('the accessibility checker is only for tests: no page and no module of the app names it', !PAGES.some(rel => /vendor-test|axe\.min/.test(read(rel))) && !JS_FILES.some(rel => /vendor-test|axe\.min/.test(read(rel))));
  const online = await fetch('https://registry.npmjs.org/', { method: 'HEAD', signal: AbortSignal.timeout(6000) }).then(r => r.status < 500, () => false);
  if (!online) console.log('SKIP  the registry was not asked for the published checksums (no internet); the files in place were still checked byte for byte');
  else { const said = []; check('the registry publishes the checksums the folder pins', await vendorRun({ args: ['--check'], root: ROOT, say: line => said.push(line) }) === 0, said.join(' | ')); }
});

// ---- what the first screen loads: three.js and MapLibre wait until they are asked for, so a phone on a slow line sees the start screen first
await group('the first screen', async () => {
  const STATIC = /(?:^|[;\n])\s*(?:import|export)\b[^'"()]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g;
  const LATER = /\bimport\(\s*['"]([^'"]+)['"]\s*\)|new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
  const html = read('index.html'), missing = [];
  const starts = ['manifest.json', 'data/regions.json', ...[...html.matchAll(/\s(?:src|href)="([^":]+\.(?:js|css|json))"/g)].map(m => m[1])];   // the folder's own files; an outside address is caught by its own check above
  const crawl = also => {   // as the offline copy will: read the page, then every module it names
    const reached = new Set(), todo = [...starts];
    while (todo.length) {
      const rel = todo.pop(); if (reached.has(rel)) continue; reached.add(rel);
      if (!has(rel)) { missing.push(rel); continue; }
      if (!rel.startsWith('js/')) continue;   // a library file is a leaf here
      const text = read(rel);
      for (const re of also ? [STATIC, LATER] : [STATIC]) for (const m of text.matchAll(re)) { const spec = m[1] ?? m[2]; if (/^\.{1,2}\//.test(spec)) todo.push(path.posix.join(path.posix.dirname(rel), spec)); }
    }
    return [...reached];
  };
  const first = crawl(false), whole = crawl(true);
  none('the first screen does not load three.js or MapLibre', first.filter(rel => /^vendor\/(three|maplibre)\//.test(rel)));
  none('the page has no tag for three.js or MapLibre', [...html.matchAll(/<(?:script|link)\b[^>]*(?:three|maplibre)[^>]*>/gi)].map(m => m[0].slice(0, 80)));
  none('every file the page and its modules name is in the folder', [...new Set(missing)]);
  check('the map library the first screen does load is the folder\'s own Leaflet', first.includes('vendor/leaflet/leaflet.js') && first.includes('vendor/leaflet/leaflet.css'));
  check('the crawl finds the app (page → app.js → its modules)', ['js/app.js', 'js/settings.js', 'js/words.js', 'css/app.css'].every(rel => whole.includes(rel)), whole.join(', '));
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
