// Crophalo's website, made ready for Azure Static Web Apps: the one step between the repository and the static host. Node's own parts only.
//   node deploy/stage-site.mjs <repository folder> <new output folder>      (the deploy: .github/workflows/site.yml runs it)
//   node deploy/stage-site.mjs <repository folder> --check [--strict]      (the same checks, nothing written: run it before a push)
// What it does:
//   1. copies only the files the app's own server hands out (the SERVED rule of scripts/serve.mjs, read from that file, so the two never disagree) and the offline
//      worker sw.js: never the server's code, the Python lookups, the tests, the starters, a dot-file or the history;
//   2. writes js/site-config.js with the data server's address from the setting CROPHALO_API (a repository variable the owner types on GitHub; empty: same address),
//      so no address is written in the code;
//   3. writes staticwebapp.config.json from deploy/staticwebapp.config.json: the security headers, with the data server's address added to the content security policy
//      and the exact fingerprint (sha256) of every inline script of the pages, so no other inline script can ever run;
//   4. checks the limits of the free plan (250 MB, 15,000 files, a configuration file under 20 KB) and lists every outside address in the app's code that the policy
//      does not allow and that is not a plain link (a warning on a deploy, a failure with --strict).
// Exit: 0 when ready, 1 when something is wrong (said in one plain line each), 2 for a wrong command. Checked by deploy/test_stage_site.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LIMITS = Object.freeze({ bytes: 250 * 1024 * 1024, files: 15000, configBytes: 20 * 1024 });   // the Free plan's own limits (Microsoft's quotas page)

// Outside addresses the pages only link to (a farmer may open them; the page itself never fetches from them), so the policy does not need them.
// A new address in the code that is neither here nor in the policy is listed by the check: add it to the policy if the page fetches from it, else here.
export const LINK_ONLY = Object.freeze([
  'agriculture.canada.ca', 'bhunaksha.nic.in', 'climate.weather.gc.ca', 'dataspace.copernicus.eu', 'digital.atlas.gov.au', 'doi.org', 'earthdata.nasa.gov', 'ecostress.jpl.nasa.gov',
  'fieldcropnews.com', 'firms.modaps.eosdis.nasa.gov', 'gaez.fao.org','gmao.gsfc.nasa.gov', 'gpm.nasa.gov', 'gracefo.jpl.nasa.gov', 'hls.gsfc.nasa.gov', 'leafletjs.com', 'nassgeodata.gmu.edu',
  'natural-resources.canada.ca', 'nominatim.org', 'nsidc.org', 'open-meteo.com', 'open.canada.ca', 'parselsorgu.tkgm.gov.tr', 'websoilsurvey.nrcs.usda.gov',
  'www.agrarportal.de', 'www.arcgis.com', 'www.earthdata.nasa.gov', 'www.extension.purdue.edu', 'www.fao.org', 'www.gbif.org', 'www.geoportail.gouv.fr', 'www.gov.uk',
  'www.isric.org', 'www.mapspam.info', 'www.nass.usda.gov', 'www.ontario.ca', 'www.usgs.gov', 'www.worldbank.org',
  'mymarketnews.ams.usda.gov',   // the source link of the report's USDA cash bids (js/market-view.js); the bids themselves come through the app's own server
  'openfreemap.org', 'openmaptiles.org', 'www.openstreetmap.org',   // the Light map's credit links (js/mapbase.js); its tiles come from tiles.openfreemap.org, which the policy allows
  'cloudless.eox.at', 'creativecommons.org',   // the clean satellite base's credit links (js/mapbase.js); its tiles come from tiles.maps.eox.at, which the policy allows
  'api.opentopodata.org',   // named only as the source of a recorded answer (design/engine/height_oxford.json); no page asks it
  'www.croptrust.org', 'agris.fao.org', 'agricultureandfoodsecurity.biomedcentral.com', 'avrdc.org',   // the published pages the national crop list cites in its comments (js/nearby.js); no page asks them
  'droughtmonitor.unl.edu',   // the Drought Monitor's credit line (js/statement.js); the drought figures come through the Crophalo server
  'science.nasa.gov', 'www.esa.int',   // each satellite's own page, linked from its card on the home (js/home-sats-data.js, index.html); NASA's vegetation page in "How to read Crophalo"
  'www.sare.org',   // the cover crop handbook "How to read Crophalo" links to (js/words.explain.js)
  'grace.jpl.nasa.gov', 'registry.opendata.aws', 'celestrak.org', 'lpdaac.usgs.gov', 'sdmdataaccess.sc.egov.usda.gov', 'modis.ornl.gov', 'frankfurter.dev',   // the Visit links of source cards (js/sources.js, js/sources.more.js); the data itself comes through the Crophalo server or from hosts the policy allows
  'crophalo.local',   // never asked: only the made-up name under which the 3D view keeps its land details in the browser's own store (js/land3d-load.js)
]);

// ---- pure parts
// The data server's address as scheme://name[:port] in lower case, nothing after it; '' when empty or not usable. https only (plain http only for this computer),
// the usual port left out, as a browser writes it in its Origin header. The same rule as js/api.js, so the page and its policy always agree.
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
export function cleanOrigin(value) {
  const m = /^(https?):\/\/([a-z0-9.-]+|\[::1\])(?::(\d{1,5}))?\/?$/.exec(String(value ?? '').trim().toLowerCase());
  if (!m || !(NAME.test(m[2]) || m[2] === '[::1]')) return '';
  const port = m[3] === undefined ? null : Number(m[3]);
  if (port !== null && (port < 1 || port > 65535)) return '';
  if (m[1] === 'http' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(m[2])) return '';
  const usual = port === null || (m[1] === 'https' && port === 443) || (m[1] === 'http' && port === 80);
  return `${m[1]}://${m[2]}${usual ? '' : ':' + port}`;
}
// The SERVED rule of scripts/serve.mjs (const SERVED = /…/;) as a RegExp, or null when the file does not have one.
export function servedRule(serverSource) {
  const m = /^const SERVED = \/(.+)\/([a-z]*);/m.exec(String(serverSource));
  try { return m ? new RegExp(m[1], m[2]) : null; } catch { return null; }
}
// Whether one file (a path from the repository's top, with /) goes to the static host: the server's rule, and the offline worker sw.js, which must sit at the top to
// look after the whole site; never a dot-file, never the packed runtimes.
export const shipped = (rel, rule) => (rule.test(rel) || rel === 'sw.js') && !/(^|\/)\./.test(rel) && !/^runtime(\/|$)/i.test(rel);
// 'sha256-…' of every inline script of a page (a <script> without src; data blocks of JSON are not scripts), in the order they appear, without repeats.
export function inlineScriptHashes(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[1];
    if (/\ssrc\s*=/i.test(' ' + attrs) || /\stype\s*=\s*["']?application\/(ld\+)?json/i.test(' ' + attrs)) continue;
    const hash = `'sha256-${crypto.createHash('sha256').update(m[2], 'utf8').digest('base64')}'`;
    if (!out.includes(hash)) out.push(hash);
  }
  return out;
}
// The deployed configuration: the template with the data server's address and the script fingerprints in its policy. Returns the object.
export function fillConfig(template, { api = '', hashes = [] } = {}) {
  const config = JSON.parse(JSON.stringify(template));
  const headers = config.globalHeaders || {}, key = Object.keys(headers).find(k => k.toLowerCase() === 'content-security-policy');
  if (!key) throw new Error('the template has no content-security-policy');
  const csp = headers[key];
  if (!csp.includes('{{API_ORIGIN}}') || !csp.includes('{{SCRIPT_HASHES}}')) throw new Error('the template\'s policy has lost its {{API_ORIGIN}} or {{SCRIPT_HASHES}} mark');
  headers[key] = csp.replace('{{API_ORIGIN}}', api).replace('{{SCRIPT_HASHES}}', hashes.join(' ')).replace(/ {2,}/g, ' ').replace(/ ;/g, ';');
  return config;
}
// Every https:// host a policy names (any directive).
export const policyHosts = csp => [...new Set([...String(csp).matchAll(/https:\/\/([a-z0-9.-]+)(?::\d+)?/gi)].map(m => m[1].toLowerCase()))];
// The outside https:// hosts written in one file's text, each with its first line number.
export function hostsIn(text) {
  const found = new Map();
  String(text).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/https:\/\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)/gi)) { const h = m[1].toLowerCase(); if (!found.has(h)) found.set(h, i + 1); }
  });
  return found;
}
export const siteConfigSource = api => `// Where Crophalo's own data server answers. Written when the website was put on its host, from the repository setting CROPHALO_API. Read by js/api.js only.\nexport const API_ORIGIN = ${JSON.stringify(api)};\n`;

// ---- the folder
function walk(root, rel = '', out = []) {
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.name.startsWith('.') || r === 'runtime' || r === 'node_modules') continue;   // dot-folders (.git, .venv, .secrets, …) are never opened
    if (entry.isDirectory()) walk(root, r, out); else if (entry.isFile()) out.push(r);
  }
  return out;
}
const SCANNED = /\.(js|css|html|json|webmanifest)$/i;   // the app's own text; vendor/ (the libraries) and docs/ (the citation pages, plain links) are not scanned

export function stage(repo, out, { env = process.env, log = () => {}, check = false } = {}) {
  const problems = [], warnings = [];
  const serverFile = path.join(repo, 'scripts', 'serve.mjs');
  const rule = fs.existsSync(serverFile) ? servedRule(fs.readFileSync(serverFile, 'utf8')) : null;
  if (!rule) return { problems: [`scripts/serve.mjs has no "const SERVED = /…/;" line, so which files are the website cannot be read`], warnings, files: [] };
  const files = walk(repo).filter(rel => shipped(rel, rule)).sort();
  if (!files.includes('index.html')) problems.push('index.html is not among the files to put online');

  const raw = String(env.CROPHALO_API ?? '').trim(), api = cleanOrigin(raw);
  if (raw && !api) problems.push(`CROPHALO_API is "${raw}": it must be the data server's address alone, such as https://api.example.org (https, a name, nothing after it)`);
  if (!raw) warnings.push('CROPHALO_API is not set: the pages will ask their own address for the satellite data, which a static host does not have, so those cards will say they could not be read');
  if (!files.includes('js/site-config.js')) warnings.push('the app has no js/site-config.js yet, so it does not read the data server\'s address: the file is written anyway');

  const hashes = [];
  for (const rel of files.filter(f => /\.html$/i.test(f))) for (const h of inlineScriptHashes(fs.readFileSync(path.join(repo, rel), 'utf8'))) if (!hashes.includes(h)) hashes.push(h);
  let config = null, configText = '';
  try {
    config = fillConfig(JSON.parse(fs.readFileSync(path.join(HERE, 'staticwebapp.config.json'), 'utf8')), { api, hashes });
    configText = JSON.stringify(config, null, 2) + '\n';
    if (Buffer.byteLength(configText) > LIMITS.configBytes) problems.push(`staticwebapp.config.json would be ${Buffer.byteLength(configText)} bytes; the host takes at most ${LIMITS.configBytes}`);
  } catch (e) { problems.push(`deploy/staticwebapp.config.json: ${e.message}`); }

  let bytes = 0;
  for (const rel of files) bytes += fs.statSync(path.join(repo, rel)).size;
  if (files.length + 2 > LIMITS.files) problems.push(`${files.length} files: the free plan takes at most ${LIMITS.files}`);
  if (bytes > LIMITS.bytes) problems.push(`${(bytes / 1048576).toFixed(1)} MB: the free plan takes at most 250 MB`);

  if (config) {   // outside addresses the policy does not allow
    const allowed = new Set([...policyHosts(Object.values(config.globalHeaders).join(' ')), ...LINK_ONLY]), unknown = new Map();
    for (const rel of files.filter(f => SCANNED.test(f) && !f.startsWith('vendor/'))) {
      for (const [host, line] of hostsIn(fs.readFileSync(path.join(repo, rel), 'utf8'))) if (!allowed.has(host) && !unknown.has(host)) unknown.set(host, `${rel}:${line}`);
    }
    for (const [host, where] of unknown) warnings.push(`${where} names https://${host}, which the content security policy does not allow: if the page fetches or shows something from it, add it to deploy/staticwebapp.config.json; if it is only a link, add it to LINK_ONLY in deploy/stage-site.mjs`);
    if (!check || unknown.size) log(`outside addresses checked: ${unknown.size ? `${unknown.size} not allowed` : 'all allowed or plain links'}`);
  }

  if (!check && !problems.length) {
    if (fs.existsSync(out) && fs.readdirSync(out).length) return { problems: [`${out} is not empty: give a new folder`], warnings, files };
    for (const rel of files) { fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true }); fs.copyFileSync(path.join(repo, rel), path.join(out, rel)); }
    fs.mkdirSync(path.join(out, 'js'), { recursive: true });
    fs.writeFileSync(path.join(out, 'js', 'site-config.js'), siteConfigSource(api));
    fs.writeFileSync(path.join(out, 'staticwebapp.config.json'), configText);
  }
  log(`${files.length} files, ${(bytes / 1048576).toFixed(1)} MB; data server: ${api || 'same address (not set)'}; inline scripts fingerprinted: ${hashes.length}`);
  return { problems, warnings, files, api, hashes, config, bytes };
}

// ---- the command line
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2), check = args.includes('--check'), strict = args.includes('--strict'), [repo, out] = args.filter(a => !a.startsWith('--'));
  if (!repo || (!check && !out)) { console.error('Use: node deploy/stage-site.mjs <repository folder> <new output folder>   or   node deploy/stage-site.mjs <repository folder> --check [--strict]'); process.exit(2); }
  const ci = process.env.GITHUB_ACTIONS === 'true';
  const r = stage(path.resolve(repo), out && path.resolve(out), { check, log: line => console.log(line) });
  for (const w of r.warnings) console.log(ci ? `::warning::${w}` : `warning: ${w}`);
  for (const p of r.problems) console.error(ci ? `::error::${p}` : `problem: ${p}`);
  const failed = r.problems.length > 0 || (strict && r.warnings.some(w => w.includes('content security policy does not allow')));
  console.log(failed ? 'Not ready.' : check ? 'Ready (checked only, nothing written).' : `Ready in ${out}.`);
  process.exit(failed ? 1 : 0);
}
