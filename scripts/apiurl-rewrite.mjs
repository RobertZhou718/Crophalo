// Crophalo's rewrite of the pages' calls to their own server: every '/api/…' address a page asks for goes through apiUrl() (js/api.js), so the same pages work on one address and with the server on a name of its own.
// Run it once on a folder when new page code has come in (node scripts/apiurl-rewrite.mjs <app folder>), and with --check in the checks, so a new call can never skip it. The list of every change and of every place left as it is comes with it.
// Pure: tokens(), findSites(), rewriteSource(). The rest reads and writes the folder.
// Checked by scripts/test_apiurl.mjs (hand-made sources, and this folder's own js/: nothing left to change).
/*
 *   node scripts/apiurl-rewrite.mjs <app folder>             rewrites js/**\/*.js in place, adds the import, lists every change and every place left as it is
 *   node scripts/apiurl-rewrite.mjs <app folder> --dry-run   the same list, nothing written
 *   node scripts/apiurl-rewrite.mjs <app folder> --check     nothing written; exits 1 while a call is still to be rewritten
 *   --json                                                   the list as JSON
 * What counts as a call: an '/api…' text (in quotes or backticks, or `${base}/api…`) that is the first argument of a function call, alone or as the start of a longer
 * expression ('/api/x?lat=' + lat), or that an arrow function or a return gives back whole (an address builder). It is wrapped whole: get('/api/x') becomes
 * get(apiUrl('/api/x')). Never touched: comments, regular expressions, a path test (startsWith, includes, test, …), an /api text that is not an argument (a name,
 * a comparison), and addresses on other hosts (https://power.larc.nasa.gov/api/…). Those that could be ours are listed as "left" with the reason, for a person.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// ---- a small reader of JavaScript: enough to tell code from comments, texts, templates and regular expressions
const ID_START = /[A-Za-z_$]/, ID_PART = /[\w$]/, SPACE = /\s/;   // \s holds every space a page can have, the no-break space and the line separators too
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const REGEX_AFTER_MARK = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '=>']);
const regexAllowed = last => !last || (last.t === 'p' ? REGEX_AFTER_MARK.has(last.v) : last.t === 'id' ? REGEX_AFTER_WORD.has(last.v) : false);
// Tokens in source order: { t: 'id' | 'num' | 'p' (a mark) | 'str' | 'tpl' | 're', s, e, v?, lvl, parts? }. lvl names the stretch of code a token is in: 'top', or
// '<template index>.<part>' inside a ${ … } of a template, so a look back or forward never crosses into another stretch. Comments and spaces are left out.
export function tokens(src) {
  const out = [], n = src.length;
  let i = 0;
  function code(lvl, inTemplate) {
    let last = null, braces = 0;
    const push = tok => { tok.lvl = lvl; out.push(tok); last = tok; return tok; };
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (SPACE.test(c)) { i++; continue; }
      if (c === '/' && d === '/') { const end = src.indexOf('\n', i); i = end < 0 ? n : end; continue; }
      if (c === '/' && d === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue; }
      if (c === '#' && d === '!' && i === 0) { const end = src.indexOf('\n'); i = end < 0 ? n : end; continue; }
      if (c === "'" || c === '"') {
        const s = i++;
        while (i < n && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
        i++; push({ t: 'str', s, e: Math.min(i, n), q: c }); continue;
      }
      if (c === '`') { const tok = push({ t: 'tpl', s: i, e: n, parts: [] }); template(tok, out.length - 1); last = tok; continue; }
      if (inTemplate && c === '}' && braces === 0) { i++; return; }
      if (c === '{') braces++;
      if (c === '}') braces--;
      if (ID_START.test(c) || (c > '\x7f' && /\p{L}/u.test(c))) { const s = i++; while (i < n && (ID_PART.test(src[i]) || (src[i] > '\x7f' && /[\p{L}\p{N}]/u.test(src[i])))) i++; push({ t: 'id', s, e: i, v: src.slice(s, i) }); continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(d ?? ''))) { const s = i++; while (i < n && /[\w.]/.test(src[i])) i++; push({ t: 'num', s, e: i }); continue; }
      if (c === '/' && regexAllowed(last)) {
        const s = i++; let set = false;
        while (i < n && src[i] !== '\n') { const ch = src[i]; if (ch === '\\') { i += 2; continue; } if (set) { if (ch === ']') set = false; } else if (ch === '[') set = true; else if (ch === '/') break; i++; }
        i++; while (i < n && /[a-z]/i.test(src[i])) i++;
        push({ t: 're', s, e: Math.min(i, n) }); continue;
      }
      if (c === '?' && d === '.' && !/[0-9]/.test(src[i + 2] ?? '')) { push({ t: 'p', s: i, e: i + 2, v: '?.' }); i += 2; continue; }
      if (c === '=' && d === '>') { push({ t: 'p', s: i, e: i + 2, v: '=>' }); i += 2; continue; }
      push({ t: 'p', s: i, e: i + 1, v: c }); i++;
    }
  }
  function template(tok, index) {
    i++;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { tok.e = ++i; return; }
      if (c === '$' && src[i + 1] === '{') { const s = i, first = out.length; i += 2; code(`${index}.${tok.parts.length}`, true); tok.parts.push({ s, e: i, first, end: out.length }); continue; }
      i++;
    }
    tok.e = n;
  }
  code('top', false);
  return out;
}

// ---- where the page asks its own server
const OURS = /^\/api(?:[/?#]|$)/;                      // the start of a text that is one of the server's own addresses
const IN_TEMPLATE = /^\/api(?:[/?#`$]|$)/;             // the same at the start of a template's words
const PATH_TESTS = new Set(['startsWith', 'endsWith', 'includes', 'indexOf', 'lastIndexOf', 'match', 'matchAll', 'replace', 'replaceAll', 'split', 'search', 'test', 'exec',
  'localeCompare', 'has', 'delete', 'concat', 'padStart', 'padEnd', 'at', 'charAt', 'slice', 'substring', 'trim', 'set', 'add']);   // a text handed to these is tested or kept, never asked for
const NOT_CALLS = new Set(['if', 'while', 'for', 'switch', 'return', 'typeof', 'catch', 'with', 'await', 'in', 'of', 'case', 'void', 'delete', 'throw', 'yield', 'else', 'do', 'function']);
const lineCol = (src, at) => { const before = src.slice(0, at), line = before.split('\n').length; return { line, col: at - before.lastIndexOf('\n') }; };
const short = text => { const one = text.replace(/\s+/g, ' ').trim(); return one.length > 140 ? one.slice(0, 137) + '…' : one; };

// Every place in one file: { edits: [{ s, e, text }], sites: [{ kind: 'changed' | 'left' | 'done', at, before, after?, why? }] }.
export function findSites(src, toks = tokens(src)) {
  const edits = [], sites = [];
  const back = k => { for (let j = k - 1; j >= 0; j--) if (toks[j].lvl === toks[k].lvl) return j; return -1; };
  const isMark = (j, ...v) => j >= 0 && toks[j].t === 'p' && v.includes(toks[j].v);
  const left = (k, why, s = toks[k].s, e = toks[k].e) => sites.push({ kind: 'left', at: s, before: short(src.slice(s, e)), why });
  // the end of the argument that starts at token k: the first ',' or ')' at its own depth, in its own stretch of code
  function argEnd(k) {
    let depth = 0;
    for (let j = k + 1; j < toks.length; j++) {
      const t = toks[j]; if (t.lvl !== toks[k].lvl || t.t !== 'p') continue;
      if ('([{'.includes(t.v)) depth++;
      else if (')]}'.includes(t.v)) { if (depth === 0) return { end: t.s, next: j }; depth--; }
      else if (t.v === ',' && depth === 0) return { end: t.s, next: j };
    }
    return null;
  }
  // the function a '(' at token j belongs to: { name, member } or null when the '(' is not a call's
  function callee(j) {
    let c = back(j);
    if (isMark(c, '?.')) c = back(c);
    if (c < 0) return null;
    const t = toks[c];
    if (t.t === 'id') { const b = back(c); return NOT_CALLS.has(t.v) && !isMark(b, '.', '?.') ? null : { name: t.v, member: isMark(b, '.', '?.') }; }
    if (t.t === 'p' && (t.v === ')' || t.v === ']')) return { name: '(an expression)', member: false };
    return null;
  }
  const simple = part => { if (part.end <= part.first) return false; for (let j = part.first; j < part.end; j++) if (!(toks[j].t === 'id' || isMark(j, '.', '?.'))) return false; return true; };   // ${base} or ${options.base}
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t !== 'str' && t.t !== 'tpl') continue;
    const words = t.t === 'str' ? src.slice(t.s + 1, t.e - 1) : src.slice(t.s + 1, t.e);
    const first = t.t === 'tpl' ? t.parts[0] : null;
    const based = !!first && first.s === t.s + 1 && IN_TEMPLATE.test(src.slice(first.e, t.e)) && simple(first);
    const plain = t.t === 'str' ? OURS.test(words) : IN_TEMPLATE.test(words);
    if (!plain && !based) {   // an /api address inside a longer text: ours only when nothing that looks like a host name stands before it
      const text = t.t === 'str' ? words : src.slice(t.s + 1, t.e - 1);
      for (const m of text.matchAll(/\/api(?=[/?])/g)) {
        const before = text[m.index - 1];
        if (before !== undefined && /[\w.:\-@]/.test(before)) continue;   // https://power.larc.nasa.gov/api/…, localhost:8080/api: another server's address
        const insideOther = t.t === 'tpl' && t.parts.some(p => p.s - t.s - 1 <= m.index && m.index < p.e - t.s - 1);
        if (!insideOther) left(k, 'an /api address inside a longer text (a link or a template): check it by hand');
        break;
      }
      continue;
    }
    const p = back(k);
    // the text as a whole is what an arrow function or a return gives back: an address builder (const FIRES_URL = (lat, lon) => `/api/firms?…`), which the page then asks for
    const giving = isMark(p, '=>') || (p >= 0 && toks[p].t === 'id' && toks[p].v === 'return' && !isMark(back(p), '.', '?.'));
    if (giving) {
      const address = based ? src.slice(first.e + 0, t.e) : words;
      if (!/^\/api\/[\w-]/.test(address)) { left(k, 'a bare /api prefix given back, not a whole address (a test may need it as it is): check it by hand'); continue; }
      const nx = (() => { for (let j = k + 1; j < toks.length; j++) if (toks[j].lvl === t.lvl) return toks[j]; return null; })();
      const lineOf = at => src.slice(0, at).split('\n').length;
      const whole = !nx || (nx.t === 'p' && [';', ',', ')', '}', ']'].includes(nx.v)) || (lineOf(nx.s) > lineOf(t.e) && !(nx.t === 'p' && '+-*/%?:.&|=<>[('.includes(nx.v[0])) && nx.t !== 'tpl');
      if (!whole) { left(k, 'an address that is only the start of a longer expression: check it by hand'); continue; }
      const text = based ? `apiUrl(\`${src.slice(first.e, t.e)}, ${src.slice(first.s + 2, first.e - 1).trim()})` : `apiUrl(${src.slice(t.s, t.e)})`;
      edits.push({ s: t.s, e: t.e, text });
      sites.push({ kind: 'changed', at: t.s, before: short(src.slice(t.s, t.e)), after: short(text), call: toks[p].v === '=>' ? '=>' : 'return' });
      continue;
    }
    if (!isMark(p, '(')) {
      if (isMark(p, ',')) {   // a later argument: name the call it belongs to
        let depth = 0, open = -1;
        for (let j = p - 1; j >= 0; j--) { const x = toks[j]; if (x.lvl !== t.lvl || x.t !== 'p') continue; if (')]}'.includes(x.v)) depth++; else if ('([{'.includes(x.v)) { if (depth === 0) { open = x.v === '(' ? j : -1; break; } depth--; } }
        const who = open >= 0 ? callee(open) : null;
        left(k, who ? `not the first argument of ${who.name}(): check it by hand` : 'inside a list, not an argument of a call: check it by hand');
      } else left(k, p >= 0 ? `not an argument of a call (after "${src.slice(toks[p].s, toks[p].e)}"): a name or a test, check it by hand` : 'not an argument of a call');
      continue;
    }
    const who = callee(p);
    if (!who) { left(k, 'inside brackets that are not a call: check it by hand'); continue; }
    if (who.name === 'apiUrl') { sites.push({ kind: 'done', at: t.s, before: short(src.slice(t.s, t.e)) }); continue; }
    if (who.name === 'import') { left(k, 'a module address, not a request'); continue; }
    if (PATH_TESTS.has(who.name)) { left(k, `a path test (${who.name}), not an address the page asks for`); continue; }
    const arg = argEnd(k);
    if (!arg) { left(k, 'the end of the argument was not found'); continue; }
    const expr = src.slice(t.s, arg.end).replace(/\s+$/, '');
    let text;
    if (based) {
      if (expr.length !== t.e - t.s) { left(k, 'a template that starts with a server name and goes on past itself: check it by hand'); continue; }
      const baseExpr = src.slice(first.s + 2, first.e - 1).trim();
      text = `apiUrl(\`${src.slice(first.e, t.e)}, ${baseExpr})`;
    } else text = `apiUrl(${expr})`;
    edits.push({ s: t.s, e: t.s + expr.length, text });
    sites.push({ kind: 'changed', at: t.s, before: short(expr), after: short(text), call: who.name });
  }
  return { edits, sites };
}

// The import line: added after the last import of the file (on its own line), or into an import from api.js that is already there. Returns an edit or null.
function importEdit(src, toks, importPath) {
  const top = toks.filter(t => t.lvl === 'top');
  let lastEnd = -1;
  for (let a = 0; a < top.length; a++) {
    const t = top[a];
    if (t.t !== 'id' || t.v !== 'import') continue;
    const next = top[a + 1];
    if (!next || (next.t === 'p' && (next.v === '(' || next.v === '.'))) continue;   // import() and import.meta are not import lines
    let b = a + 1, open = -1, close = -1;
    for (; b < top.length; b++) {
      const x = top[b];
      if (x.t === 'p' && x.v === '{' && open < 0) open = b;
      if (x.t === 'p' && x.v === '}' && close < 0) close = b;
      if (x.t === 'str' && (b === a + 1 || (top[b - 1].t === 'id' && top[b - 1].v === 'from'))) break;
    }
    if (b >= top.length) break;
    const from = top[b], spec = src.slice(from.s + 1, from.e - 1);
    const end = top[b + 1]?.t === 'p' && top[b + 1].v === ';' ? top[b + 1].e : from.e;
    if (/(^|\/)api\.js$/.test(spec) && open > a && close > open) {   // an import from api.js is there already: apiUrl joins it, unless it is in it
      const oe = top[open].e, inner = src.slice(oe, top[close].s);
      if (/\bapiUrl\b/.test(inner)) return { already: true };
      const body = inner.replace(/\s+$/, ''), pos = oe + body.length;
      return { s: pos, e: pos, text: !body.trim() ? ' apiUrl' : body.trim().endsWith(',') ? ' apiUrl' : ', apiUrl' };
    }
    lastEnd = Math.max(lastEnd, end); a = b;
  }
  const line = `import { apiUrl } from '${importPath}';`;
  if (lastEnd >= 0) { const nl = src.indexOf('\n', lastEnd); return nl < 0 ? { s: src.length, e: src.length, text: '\n' + line + '\n' } : { s: nl + 1, e: nl + 1, text: line + '\n' }; }
  const firstTok = toks[0]; if (!firstTok) return null;
  const lineStart = src.lastIndexOf('\n', firstTok.s - 1) + 1;
  return { s: lineStart, e: lineStart, text: line + '\n' };
}

// One file's text in, the rewritten text out: { out, changed, left, done, importAdded, conflict }. importPath: how this file reaches js/api.js ('./api.js', '../api.js').
export function rewriteSource(src, { importPath = './api.js' } = {}) {
  const toks = tokens(src), { edits, sites } = findSites(src, toks);
  const report = { out: src, changed: sites.filter(s => s.kind === 'changed'), left: sites.filter(s => s.kind === 'left'), done: sites.filter(s => s.kind === 'done').length, importAdded: false, conflict: '' };
  for (const s of [...report.changed, ...report.left]) Object.assign(s, lineCol(src, s.at));
  if (!edits.length) return report;
  // a name of its own called apiUrl, or apiUrl imported from somewhere else or under another name: the file is left whole, for a person
  const declared = toks.some((t, k) => t.t === 'id' && t.v === 'apiUrl' && k > 0 && toks[k - 1].t === 'id' && ['function', 'const', 'let', 'var', 'class'].includes(toks[k - 1].v));
  const importedElsewhere = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)].some(([, names, from]) => /\bapiUrl\b/.test(names) && (!/(^|\/)api\.js$/.test(from) || /\bas\s+apiUrl\b|\bapiUrl\s+as\b/.test(names)));
  if (declared || importedElsewhere) { report.conflict = 'this file has an apiUrl of its own: left whole, check it by hand'; report.left.push(...report.changed.map(c => ({ ...c, kind: 'left', why: report.conflict }))); report.changed = []; return report; }
  const imp = importEdit(src, toks, importPath), all = [...edits];
  if (imp && !imp.already) { all.push(imp); report.importAdded = true; }
  all.sort((a, b) => b.s - a.s);
  let out = src;
  for (const ed of all) out = out.slice(0, ed.s) + ed.text + out.slice(ed.e);
  report.out = out;
  return report;
}

// ---- the folder
const SKIP = new Set(['api.js', 'site-config.js']);   // the two files the rewrite points at
function jsFiles(dir, links = []) {   // the files of js/; a .js that is a link to a file elsewhere goes on `links`: read, never written through
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full, links)); else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full); else if (entry.isSymbolicLink() && entry.name.endsWith('.js')) links.push(full);
  }
  return out.sort();
}
// The pages outside js/ that could name an /api address (index.html, design.html, sw.js): listed, never changed.
function outsideJs(root) {
  const found = [];
  for (const name of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    if (!/\.(html|js)$/.test(name)) continue;
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    for (const m of text.matchAll(/["'`]\/api(?=[/?"'`])/g)) { const { line, col } = lineCol(text, m.index); found.push({ file: name, line, col, before: short(text.slice(m.index, m.index + 60)), why: 'outside js/: not rewritten, check it by hand' }); }
  }
  return found;
}
export function rewriteFolder(root, { write = false } = {}) {
  const jsDir = path.join(root, 'js'), result = { folder: root, files: 0, changed: [], left: [], imports: [], done: 0, conflicts: [], outside: outsideJs(root), wrote: [], links: [] };
  const links = [], files = jsFiles(jsDir, links);
  for (const link of links) {   // a link to a file elsewhere: its calls are listed for a person, and the file it points at is never written from here
    const rel = path.relative(root, link).split(path.sep).join('/');
    let text = null; try { text = fs.readFileSync(link, 'utf8'); } catch { /* points at nothing in this copy */ }
    result.links.push({ file: rel, to: fs.readlinkSync(link), read: text !== null });
    const calls = text === null ? [] : rewriteSource(text).changed;
    for (const c of calls) result.left.push({ file: rel, line: c.line, col: c.col, before: c.before, why: 'a link to a file elsewhere: not rewritten here, rewrite the file it points at' });
    if (calls.length) result.conflicts.push({ file: rel, why: `a link to a file elsewhere that still holds ${calls.length} call(s) to the server: rewrite the file it points at` });
  }
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (SKIP.has(path.basename(file)) && path.dirname(file) === jsDir) continue;
    result.files++;
    const importPath = (p => (p.startsWith('.') ? p : './' + p))(path.relative(path.dirname(file), path.join(jsDir, 'api.js')).split(path.sep).join('/'));
    const src = fs.readFileSync(file, 'utf8'), r = rewriteSource(src, { importPath });
    result.done += r.done;
    for (const c of r.changed) result.changed.push({ file: rel, line: c.line, col: c.col, call: c.call, before: c.before, after: c.after });
    for (const l of r.left) result.left.push({ file: rel, line: l.line, col: l.col, before: l.before, why: l.why });
    if (r.conflict) result.conflicts.push({ file: rel, why: r.conflict });
    if (r.importAdded) result.imports.push({ file: rel, line: `import { apiUrl } from '${importPath}';` });
    if (write && r.out !== src) {
      const again = rewriteSource(r.out, { importPath });   // the rewritten file, read once more: nothing more to change, or the rewrite is not trusted
      if (again.changed.length || again.importAdded) throw new Error(`${rel}: a second pass still finds something to change; nothing was written for this file`);
      fs.writeFileSync(file, r.out); result.wrote.push(rel);
    }
  }
  return result;
}

function say(result, mode) {
  const lines = [`apiurl-rewrite (${mode}): ${result.folder}`];
  for (const c of result.changed) lines.push(`  ${mode === 'write' ? 'changed' : 'to change'}  ${c.file}:${c.line}:${c.col}  ${c.before}  ->  ${c.after}`);
  for (const i of result.imports) lines.push(`  import   ${i.file}  + ${i.line}`);
  for (const l of [...result.left, ...result.outside]) lines.push(`  left     ${l.file}:${l.line}:${l.col}  ${l.before}  (${l.why})`);
  for (const c of result.conflicts) lines.push(`  conflict ${c.file}  (${c.why})`);
  for (const k of result.links) lines.push(`  link     ${k.file} -> ${k.to}  (${k.read ? 'read for calls, never written through' : 'points at nothing here: not read'})`);
  lines.push(`${result.changed.length} call(s) ${mode === 'write' ? 'changed' : 'to change'} in ${new Set(result.changed.map(c => c.file)).size} file(s) of ${result.files}; ${result.imports.length} import line(s); ${result.done} already through apiUrl; ${result.left.length + result.outside.length} left as they are (listed above); ${result.conflicts.length} file(s) with a conflict.`);
  return lines.join('\n');
}

async function main(argv) {
  const args = argv.slice(2), flags = new Set(args.filter(a => a.startsWith('--'))), folder = args.find(a => !a.startsWith('--'));
  const known = new Set(['--dry-run', '--check', '--json']);
  if (!folder || [...flags].some(f => !known.has(f))) { console.error('Use: node scripts/apiurl-rewrite.mjs <app folder> [--dry-run | --check] [--json]'); return 2; }
  const root = path.resolve(folder);
  if (!fs.existsSync(path.join(root, 'js'))) { console.error(`apiurl-rewrite: ${root} has no js folder`); return 2; }
  const write = !flags.has('--dry-run') && !flags.has('--check'), mode = flags.has('--check') ? 'check' : write ? 'write' : 'dry run';
  if (write && !['api.js', 'site-config.js'].every(f => fs.existsSync(path.join(root, 'js', f)))) { console.error(`apiurl-rewrite: put js/api.js and js/site-config.js into ${root} first (the rewritten files import js/api.js). Nothing was written.`); return 2; }
  let result;
  try { result = rewriteFolder(root, { write }); } catch (e) { console.error(`apiurl-rewrite: ${e.message}`); return 1; }
  console.log(flags.has('--json') ? JSON.stringify(result, null, 1) : say(result, mode));
  return flags.has('--check') && (result.changed.length || result.conflicts.length) ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await main(process.argv);
