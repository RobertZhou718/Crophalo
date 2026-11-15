// The checks of deploy/stage-site.mjs and deploy/staticwebapp.config.json: the address rule, the files that go online (and the ones that never do), the inline-script
// fingerprints, the filled policy, the outside-address check, the free plan's limits, and the command line's answers. A made-up repository in a temp folder; no network.
// Run: node deploy/test_stage_site.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as S from './stage-site.mjs';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const HERE = path.dirname(fileURLToPath(import.meta.url)), SCRIPT = path.join(HERE, 'stage-site.mjs');
const sha = text => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;

// ---- the data server's address
same('an address is lower case, with no slash at the end and no usual port', ['https://API.Example.org/', 'https://x.org:443', 'http://localhost:80', 'https://x.org:8443'].map(S.cleanOrigin), ['https://api.example.org', 'https://x.org', 'http://localhost', 'https://x.org:8443']);
same('anything else is refused: plain http to another computer, a path, a star, a script, a login, a port too big', ['http://example.org', 'https://x.org/api', 'https://*.x.org', 'javascript:alert(1)', 'https://me@x.org', 'https://x.org:70000', '', '  '].map(S.cleanOrigin), ['', '', '', '', '', '', '', '']);
same('this computer by its loopback names (a test, a copy run by hand)', ['http://127.0.0.1:5931', 'http://[::1]:5931'].map(S.cleanOrigin), ['http://127.0.0.1:5931', 'http://[::1]:5931']);

// ---- which files go online
const SERVER = "const x = 1;\nconst SERVED = /^(index\\.html|manifest\\.json|docs\\/[a-z0-9-]+\\.md|(js|css|vendor)\\/.+)$/;\nconst y = 2;\n";
const rule = S.servedRule(SERVER);
check('the SERVED rule is read from the server\'s own source', rule instanceof RegExp && rule.test('js/app.js') && !rule.test('scripts/serve.mjs'));
same('no SERVED line: no rule', S.servedRule('const OTHER = /x/;'), null);
same('the server\'s rule decides, and a dot-file or the runtimes never go, even inside an allowed folder', ['index.html', 'js/app.js', 'js/.DS_Store', 'docs/data.md', 'scripts/serve.mjs', 'README.md', 'runtime/x', 'js/.hidden/a.js'].map(f => S.shipped(f, rule)), [true, true, false, true, false, false, false, false]);
same('the offline worker at the top goes too (the server\'s rule alone would leave it out); one in scripts/ never', ['sw.js', 'scripts/sw.js'].map(f => S.shipped(f, rule)), [true, false]);

// ---- inline scripts
{
  const a = "\ntry { var kept = 1; } catch (e) {}\n", b = 'addEventListener("error", function () {}, true);';
  const html = `<head><script>${a}</script><script src="vendor/x.js"></script></head><body><script type="application/ld+json">{"a":1}</script><script type="module">${b}</script ><script>${a}</script></body>`;
  same('every inline script, by its exact text, once; never one with src, never a data block', S.inlineScriptHashes(html), [sha(a), sha(b)]);
  same('a page without inline scripts: none', S.inlineScriptHashes('<script src="js/app.js"></script>'), []);
}

// ---- the template and the filled policy
const template = JSON.parse(fs.readFileSync(path.join(HERE, 'staticwebapp.config.json'), 'utf8'));
{
  const csp = template.globalHeaders['content-security-policy'];
  check('the template keeps both marks', csp.includes('{{API_ORIGIN}}') && csp.includes('{{SCRIPT_HASHES}}'));
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'", "form-action 'self'", 'worker-src \'self\' blob:', 'upgrade-insecure-requests'])
    check(`the policy has ${d}`, csp.includes(d));
  check('no inline script and no eval is allowed by a keyword', !/script-src[^;]*'unsafe-(inline|eval)'/.test(csp));
  same('the security headers of the app\'s own server, and HTTPS only', ['x-content-type-options', 'referrer-policy', 'x-frame-options', 'permissions-policy', 'content-security-policy', 'strict-transport-security'].filter(h => !template.globalHeaders[h]), []);
  check('the microphone stays usable for the voice buttons, on this site only', /microphone=\(self\)/.test(template.globalHeaders['permissions-policy']));
  const routes = template.routes.map(r => r.route), firstCache = template.routes.findIndex(r => r.headers);
  check('every refusal comes before the first cache rule (the host stops at the first rule that fits)', template.routes.slice(firstCache).every(r => !r.statusCode), brief(routes));
  check('the server\'s code, the Python lookups and the sign-in routes are refused', ['/scripts/*', '/.auth/login/github', '/.auth/login/aad'].every(r => routes.includes(r)) && template.routes.some(r => /py,mjs/.test(r.route) && r.statusCode === 404));
  const filled = S.fillConfig(template, { api: 'https://api.example.org', hashes: ["'sha256-AAA='", "'sha256-BBB='"] }), fcsp = filled.globalHeaders['content-security-policy'];
  check('the address is in connect-src, the fingerprints in script-src', /connect-src 'self' https:\/\/api\.example\.org https:/.test(fcsp) && /script-src 'self' 'sha256-AAA=' 'sha256-BBB=';/.test(fcsp), fcsp);
  check('the template itself is left as it was', template.globalHeaders['content-security-policy'] === csp);
  const empty = S.fillConfig(template, {}).globalHeaders['content-security-policy'];
  check('no address and no inline script: no gap left behind', /script-src 'self';/.test(empty) && /connect-src 'self' https:\/\/power/.test(empty) && !/ {2}/.test(empty), empty);
  let threw = ''; try { S.fillConfig({ globalHeaders: { 'content-security-policy': "default-src 'self'" } }); } catch (e) { threw = e.message; }
  check('a template that lost its marks is refused', /lost/.test(threw), threw);
  check('the filled file stays well under the host\'s 20 KB', Buffer.byteLength(JSON.stringify(filled, null, 2)) < S.LIMITS.configBytes / 2);
  same('the policy\'s outside hosts', S.policyHosts("img-src https://a.org https://b.org:8443; connect-src https://a.org"), ['a.org', 'b.org']);
  // Esri is no longer asked by any page (the clean satellite base is NASA Blue Marble, EOX and USGS), so the policy names those hosts instead, as the map that went to the public repository first does
  check('the policy lets the pages reach NASA POWER, the forecasts, the map tiles and the place search', ['power.larc.nasa.gov', 'api.open-meteo.com', 'archive-api.open-meteo.com', 'tiles.openfreemap.org', 'gibs.earthdata.nasa.gov', 'tiles.maps.eox.at', 'basemap.nationalmap.gov', 'nominatim.openstreetmap.org'].every(h => S.policyHosts(fcsp).includes(h)));
}
same('outside hosts in a text, each with its first line', [...S.hostsIn("a\nfetch('https://Power.larc.nasa.gov/api')\n'https://x.org' 'https://power.larc.nasa.gov' `https://${sub}.y.org`")], [['power.larc.nasa.gov', 2], ['x.org', 3]]);
check('the list of plain links has no host the policy already allows', !S.LINK_ONLY.some(h => S.policyHosts(template.globalHeaders['content-security-policy']).includes(h)));

// ---- a whole made-up repository
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'crophalo-stage-')), repo = path.join(TMP, 'repo');
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), text); };
const INLINE = 'document.documentElement.dataset.ok = "1";';
put('index.html', `<!doctype html><title>x</title><script>${INLINE}</script><script type="module" src="js/app.js"></script>`);
put('manifest.json', '{"name":"x"}'); put('docs/nasa-data.md', '# a [link](https://www.earthdata.nasa.gov/)'); put('sw.js', "self.addEventListener('fetch', () => {});");
put('js/app.js', "fetch('https://power.larc.nasa.gov/api/temporal'); const LINK = 'https://www.fao.org/faostat/';");
put('js/site-config.js', "export const API_ORIGIN = '';\n"); put('css/app.css', 'body{}'); put('vendor/lib.js', "const MAPBOX = 'https://api.mapbox.com/';");
put('scripts/serve.mjs', SERVER); put('scripts/live/smaproot.py', 'print(1)'); put('.secrets/earthdata.netrc', 'machine x login y password z');
put('Dockerfile', 'FROM x'); put('README.md', '# readme'); put('runtime/last-port', '5400'); put('js/.DS_Store', 'x');
const run = (args, env = {}) => { const r = spawnSync(process.execPath, [SCRIPT, ...args], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };
{
  const out = path.join(TMP, 'site'), r = run([repo, out], { CROPHALO_API: 'https://API.example.org/' });
  check('a good repository is staged', r.code === 0 && /Ready in /.test(r.out), r.out);
  const list = [];
  (function walk(d, rel = '') { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = rel ? `${rel}/${e.name}` : e.name; e.isDirectory() ? walk(path.join(d, e.name), p) : list.push(p); } })(out);
  same('exactly the served files and the offline worker, plus the host\'s configuration', list.sort(), ['css/app.css', 'docs/nasa-data.md', 'index.html', 'js/app.js', 'js/site-config.js', 'manifest.json', 'staticwebapp.config.json', 'sw.js', 'vendor/lib.js']);
  same('js/site-config.js names the data server, cleaned', /API_ORIGIN = "([^"]*)"/.exec(fs.readFileSync(path.join(out, 'js', 'site-config.js'), 'utf8'))?.[1], 'https://api.example.org');
  const csp = JSON.parse(fs.readFileSync(path.join(out, 'staticwebapp.config.json'), 'utf8')).globalHeaders['content-security-policy'];
  check('the deployed policy allows the page\'s one inline script by its fingerprint, and the data server', csp.includes(`script-src 'self' ${sha(INLINE)};`) && csp.includes('https://api.example.org'), csp);
  check('the libraries\' own addresses and the citation pages\' links are not counted', !/mapbox|earthdata\.nasa\.gov names/.test(r.out), r.out);
  check('a second run into the same folder is refused', run([repo, out], { CROPHALO_API: 'https://api.example.org' }).code === 1);
}
{
  const r = run([repo, path.join(TMP, 'site2')], { CROPHALO_API: 'http://api.example.org' });
  check('plain http to another computer: refused, nothing written, the reason said', r.code === 1 && /CROPHALO_API is "http:\/\/api\.example\.org"/.test(r.out) && !fs.existsSync(path.join(TMP, 'site2')), r.out);
  const e = run([repo, path.join(TMP, 'site3')]);
  check('no address set: staged with a warning, and the policy names no data server', e.code === 0 && /CROPHALO_API is not set/.test(e.out) && !/api\.example/.test(fs.readFileSync(path.join(TMP, 'site3', 'staticwebapp.config.json'), 'utf8')), e.out);
}
{
  put('js/new.js', "fetch('https://new-service.example.net/data');");
  const w = run([repo, '--check'], { CROPHALO_API: 'https://api.example.org' }), s = run([repo, '--check', '--strict'], { CROPHALO_API: 'https://api.example.org' });
  check('an outside address the policy does not allow: a warning naming the file and line', w.code === 0 && /js\/new\.js:1 names https:\/\/new-service\.example\.net/.test(w.out), w.out);
  check('...and a failure with --strict', s.code === 1 && /Not ready/.test(s.out), s.out);
  check('--check writes nothing', !fs.readdirSync(TMP).some(n => n.startsWith('site') && !['site', 'site3'].includes(n)));
  fs.rmSync(path.join(repo, 'js', 'new.js'));
  fs.writeFileSync(path.join(repo, 'scripts', 'serve.mjs'), 'const nothing = 1;');
  check('a server without its SERVED line: refused, said plainly', /no "const SERVED/.test(run([repo, '--check']).out) && run([repo, '--check']).code === 1);
  fs.writeFileSync(path.join(repo, 'scripts', 'serve.mjs'), SERVER);
  same('a wrong command: 2', run([]).code, 2);
}
fs.rmSync(TMP, { recursive: true, force: true });

// ---- the real repository this folder sits in: what the push check (--check --strict) would say, so a new outside address fails here first, never at the push
{
  const REPO = path.resolve(HERE, '..');
  if (fs.existsSync(path.join(REPO, 'scripts', 'serve.mjs'))) {
    const r = S.stage(REPO, null, { check: true, env: { CROPHALO_API: 'https://api.example.org' } });
    same('this repository: nothing stops the website from being staged', r.problems, []);
    same('this repository: every outside address in the pages is allowed by the policy or listed as a plain link (deploy/stage-site.mjs, LINK_ONLY)', r.warnings.filter(w => w.includes('content security policy does not allow')), []);
  } else console.log('note  this folder is not inside the Crophalo repository yet: the check of its own pages runs once it is');
}
console.log(`stage-site: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
