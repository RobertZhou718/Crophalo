// Crophalo · brings the vendored libraries into the folder once: Leaflet, MapLibre GL JS with its Leaflet plugin, three.js,
// and the accessibility checker that only the tests use. Every download is checked against its published SHA-512 first.
// Pure: LIBS, sri(), respec(), specs(), tarballUrl(), metaUrl(). Not pure: inspect(), vendorRun() (files, the system tar, the registry).
// Checked by: `node scripts/vendor.mjs --check`; a suite can call vendorRun() with its own `libs` and `net` and no internet.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REGISTRY = 'https://registry.npmjs.org/';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_TGZ = 64 * 1024 * 1024;   // no package here comes near this; a download that never ends stops here

// ---- what to fetch
// integrity: the SHA-512 the npm registry publishes for the tarball (dist.integrity), read on 2026-11-14.
// tgz: bytes to download. The npm registry does not publish that number; these are from the same versions' entries on
//      registry.npmmirror.com (same integrity). They are shown by --list and never used as a check.
// files: [path inside the package, path under dir, bytes, SHA-256 of the published file]. Sizes and hashes are the ones
//      both data.jsdelivr.com and unpkg.com list for these versions, so each file is checked a second time after unpacking.
// bare: three.js's add-ons import the bare name 'three', which a browser cannot resolve without an import map and Node
//      cannot resolve without a package folder. That one name is pointed at the module file beside them; nothing else changes.
export const LIBS = [
  { id: 'leaflet', label: 'Leaflet 1.9.4', dir: 'vendor/leaflet', parts: [
    { name: 'leaflet', version: '1.9.4', licence: 'BSD-2-Clause', tgz: 869361,
      integrity: 'sha512-nxS1ynzJOmOlHp+iL3FyWqK89GtNL8U8rvlMOsQdTTssxZwCXh8N2NB3GDQOL+YR3XnWyZAxwQixURb+FA74PA==',
      files: [
        ['dist/leaflet.js', 'leaflet.js', 147552, '20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='],
        ['dist/leaflet.css', 'leaflet.css', 14806, 'p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='],
        ['dist/images/layers.png', 'images/layers.png', 696, 'Hbvp0CjikvNvy6j4s6KNXokydU/CIVuaxp5M3s9RB8Y='],   // the stylesheet names all five pictures,
        ['dist/images/layers-2x.png', 'images/layers-2x.png', 1259, 'Bm2sqFDY/77wB68AsG6sABVyje4nnFHzy2xxbffELt8='],   // so none of its addresses may answer "not found"
        ['dist/images/marker-icon.png', 'images/marker-icon.png', 1466, 'V0w6XMqF9BFAhbaEFZbWLwDXyJLHsD8oy/owHesdxDc='],
        ['dist/images/marker-icon-2x.png', 'images/marker-icon-2x.png', 2464, 'ABecTB7oMNOhCEEq4NKU9Vd2z+sIXGASmjmqb8SuJSg='],
        ['dist/images/marker-shadow.png', 'images/marker-shadow.png', 618, 'Jk9cZAM58ELdcpBiz8BMF/jqDymIK1OOOEjtjxDttNo='],
        ['LICENSE', 'LICENSE', 1395, 'U+jcJYYgFOQyR0HKGPvjYR4R1C72n1n4bqjFOJZH1Ms='],
      ] }] },
  { id: 'maplibre', label: 'MapLibre GL JS 4.7.1 with its Leaflet plugin 0.0.22', dir: 'vendor/maplibre', parts: [
    { name: 'maplibre-gl', version: '4.7.1', licence: 'BSD-3-Clause', tgz: 7989733,
      integrity: 'sha512-lgL7XpIwsgICiL82ITplfS7IGwrB1OJIw/pCvprDp2dhmSSEBgmPzYRvwYYYvJGJD7fxUv1Tvpih4nZ6VrLuaA==',
      files: [
        ['dist/maplibre-gl.js', 'maplibre-gl.js', 803086, 'vpYzxNhw4m+zfxz+XFp3GBZnEUAD6hYgeseFDY2ordE='],   // the plain build: its worker is inside, no second file
        ['dist/maplibre-gl.css', 'maplibre-gl.css', 65534, 'V2sIX92Uh6ZaGSFTKMHghsB85b9toJtmazgG09AI2uk='],
        ['LICENSE.txt', 'LICENSE.txt', 5984, '7l/AWgZ36vaWAdLH2w2ezWzCfDq8HQczvJ7TRwfPjvI='],
      ] },
    { name: '@maplibre/maplibre-gl-leaflet', version: '0.0.22', licence: 'ISC', tgz: 9251,   // asks for leaflet ^1.9.3 and maplibre-gl ^4.3.2: both hold
      integrity: 'sha512-9p4DSPLUE5t0StXH/IcZw37/UL7Ekea4jcVdkSsb2jWI+sM3K7mYHLOnti/2wn+HqxG4jMVUHah7Xun3bs00AQ==',
      files: [
        ['leaflet-maplibre-gl.js', 'leaflet-maplibre-gl.js', 10451, 'WezY0rMnedJPG9Jrh8iJDyfkpueFjZk70X5Nh45tJnc='],
        ['LICENSE', 'LICENSE-leaflet-plugin.txt', 767, '6qchuhWMvv9HrVOxA138Jv90TfZmYsk/9xXJiFGX6/M='],
      ] }] },
  { id: 'three', label: 'three.js r160 (0.160.0)', dir: 'vendor/three', bare: { three: 'three.module.js' }, parts: [
    { name: 'three', version: '0.160.0', licence: 'MIT', tgz: 9405899,
      integrity: 'sha512-DLU8lc0zNIPkM7rH5/e1Ks1Z8tWCGRq6g8mPowdDJpw1CFBJMU7UoJjC6PefXW7z//SSl0b2+GCw14LB+uDhng==',
      files: [
        ['build/three.module.js', 'three.module.js', 1272972, 'dt6oFRvJNSrvNSi0Ji4kmyYE9iVDgoMo25eNBg1hpJU='],
        ['examples/jsm/controls/OrbitControls.js', 'addons/controls/OrbitControls.js', 29868, 'WkSp6GoqD7EZM+7Wm8LNM8dqSWhUwa7W7Xdu+ofXsGQ='],
        ['examples/jsm/loaders/GLTFLoader.js', 'addons/loaders/GLTFLoader.js', 108522, '0HO0OOagfhNZdB3V1sdslTQgzA1P2E6xvd6UMVVA5qM='],
        ['examples/jsm/utils/BufferGeometryUtils.js', 'addons/utils/BufferGeometryUtils.js', 31906, 'm+BB6WMId10A4mlcxgdkW5qbZP18DnWd2PfACo2Svss='],   // the loader imports it as ../utils/…, so the folders stay
        ['LICENSE', 'LICENSE', 1081, 'hS4OhpkWm/n2/ca9o+aC0HjcvHOLXTPnTfWUchv/Jx0='],
      ] }] },
  { id: 'axe', label: 'axe-core 4.14.0 (tests only, never loaded by the app)', dir: 'scripts/vendor-test', parts: [
    { name: 'axe-core', version: '4.14.0', licence: 'MPL-2.0', tgz: 706680,
      integrity: 'sha512-9WTZxEjsZ7b13TH8JPmbV2z8CHbl80/2hm3XPEG4JgNdQLK81IBRXmSxHfMAOkSqQeRxT/0dwNDz2GOm3zzpcQ==',
      files: [
        ['axe.min.js', 'axe.min.js', 652140, 'IMCf4Veoo0ow4kGqofza3mV3NPCKs3ns++t9RcxG6Hg='],
        ['LICENSE', 'LICENSE-axe-core.txt', 15921, 'rxdbnZbuk8IaA2FS4bkFsLlTBNSujCySHHYJEAuo334='],
        ['LICENSE-3RD-PARTY.txt', 'LICENSE-3RD-PARTY-axe-core.txt', 3766, 'T4Vjhw0Pyji7w+ALb2cMt/qfOAup8mp/fRGEprGLFlM='],
      ] }] },
];

const USAGE = `node scripts/vendor.mjs [--check | --list] [--offline] [${LIBS.map(l => l.id).join(' | ')}]
  no flag    fetch every library that is not in place and intact, checked against its published checksum
  --check    download nothing: compare the pinned checksums with the registry's and verify the files in place
  --list     download nothing: print what would be fetched, from where, and how large
  --offline  with --check or --list: do not ask the registry at all`;

// ---- small pure helpers
export const sri = buf => 'sha512-' + crypto.createHash('sha512').update(buf).digest('base64');   // the form the registry publishes
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('base64');
const safe = name => name.replace(/[^\w.-]+/g, '_');
const size = n => n >= 1e5 ? (n / 1e6).toFixed(2) + ' MB' : (n / 1e3).toFixed(1) + ' kB';
export const tarballUrl = p => `${REGISTRY}${p.name}/-/${p.name.split('/').pop()}-${p.version}.tgz`;
export const metaUrl = p => `${REGISTRY}${p.name.replace('/', '%2f')}/${p.version}`;

const SPEC = /^((?:import|export)\b[\w$ \t{},*]*?\bfrom\s*|import\s*|\}\s*from\s*)(['"])([^'"\n]+)\2/gm;   // import statements at the start of a line only, so a word in a comment never counts
export const specs = text => [...text.matchAll(SPEC)].map(m => m[3]);
export const respec = (text, map) => text.replace(SPEC, (all, head, q, spec) => Object.hasOwn(map, spec) ? head + q + map[spec] + q : all);
const rel = (to, target) => { const r = path.posix.relative(path.posix.dirname(to), target); return r.startsWith('.') ? r : './' + r; };
const bareMap = (lib, to, back) => Object.fromEntries(Object.entries(lib.bare || {}).map(([bare, target]) => back ? [rel(to, target), bare] : [bare, rel(to, target)]));
const turn = (lib, to, buf, back) => lib.bare && to.endsWith('.js')   // latin1 keeps every byte as it is; the names are plain ASCII
  ? Buffer.from(respec(buf.toString('latin1'), bareMap(lib, to, back)), 'latin1') : buf;

// ---- files in place
const isFile = f => { try { return fs.lstatSync(f).isFile(); } catch { return false; } };   // lstat: a link is not a file this script unpacked

export function inspect(lib, root = ROOT) {
  const dir = path.join(root, lib.dir), no = (why, absent = false) => ({ ok: false, absent, why });
  let v, n = 0;
  try { v = JSON.parse(fs.readFileSync(path.join(dir, 'VERSION.json'), 'utf8')); }
  catch (e) { return e.code === 'ENOENT' ? no(`${lib.dir}/VERSION.json is missing`, true) : no(`${lib.dir}/VERSION.json cannot be read`); }
  for (const p of lib.parts) {
    const rec = Array.isArray(v && v.packages) && v.packages.find(r => r && r.name === p.name);
    if (!rec || rec.version !== p.version || rec.integrity !== p.integrity) return no(`${p.name} ${p.version} is wanted, VERSION.json holds ${rec && rec.version || 'no entry for it'}`);
    for (const [, to, bytes, hash] of p.files) {
      const f = path.join(dir, to), row = Array.isArray(rec.files) && rec.files.find(x => x && x.path === to);
      if (!isFile(f)) return no(`${lib.dir}/${to} is missing`);
      const buf = fs.readFileSync(f), pub = turn(lib, to, buf, true);   // undo the one renamed import to get the published bytes back
      if (!row || row.sha512 !== sri(buf)) return no(`${lib.dir}/${to} is not the file VERSION.json describes`);
      if (pub.length !== bytes || sha256(pub) !== hash) return no(`${lib.dir}/${to} is not the published file`);
      n++;
    }
  }
  return { ok: true, files: n };
}

// ---- the registry
async function ask(url, ms) {
  const host = new URL(url).host;
  let r; try { r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(ms) }); }   // a redirect would be another host: refused
  catch (e) { throw new Error(`${host} could not be reached (${e.cause && e.cause.code || e.name})`); }
  if (!r.ok) throw new Error(`${host} answered ${r.status}`);
  return r;
}
const NET = {
  meta: async p => (await ask(metaUrl(p), 30000)).json(),
  tarball: async (url, file) => {
    const r = await ask(url, 300000), fd = fs.openSync(file, 'wx'); let n = 0;
    try { for await (const chunk of r.body) { if ((n += chunk.length) > MAX_TGZ) throw new Error('the download is larger than any package listed here'); fs.writeSync(fd, chunk); } }
    finally { fs.closeSync(fd); }
  },
};
async function published(p, net) {   // the registry's own word for this exact version, compared before anything is downloaded
  const m = await net.meta(p), d = m && m.dist || {};
  if (d.integrity !== p.integrity) throw new Error(`the registry's checksum for ${p.name} ${p.version} is not the one pinned in this script`);
  if (d.tarball !== tarballUrl(p)) throw new Error(`the registry points ${p.name} ${p.version} at an address this script does not expect`);
  return d;
}

// ---- fetch, check, unpack
function tar(args) {   // the system tar, so no unpacking code of our own has to be trusted
  try { return execFileSync('tar', args, { encoding: 'utf8', maxBuffer: 32e6, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { throw new Error(e.code === 'ENOENT' ? 'this computer has no "tar" command' : 'the system tar could not read the download'); }
}

function move(src, dst) {   // a rename is one step on one disk; across disks copy beside the target first, then rename
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try { fs.renameSync(src, dst); }
  catch (e) { if (e.code !== 'EXDEV') throw e; fs.copyFileSync(src, dst + '.part'); fs.renameSync(dst + '.part', dst); }
}

async function stagePart(lib, p, dist, tmp, stage, net) {
  const tgz = path.join(tmp, `${safe(p.name)}-${p.version}.tgz`), raw = path.join(tmp, 'raw-' + safe(p.name));
  await net.tarball(dist.tarball, tgz);
  const sum = sri(fs.readFileSync(tgz));
  if (sum !== p.integrity || sum !== dist.integrity) throw new Error(`the download of ${p.name} ${p.version} does not match its published checksum, so nothing was unpacked`);
  const names = new Set(tar(['-tzf', tgz]).split('\n').filter(Boolean)), top = String([...names][0]).split('/')[0];   // npm tarballs keep everything under one folder
  const members = p.files.map(f => `${top}/${f[0]}`), lost = members.find(m => !names.has(m));
  if (!/^[\w@.-]+$/.test(top) || /^\.+$/.test(top) || lost) throw new Error(`${p.name} ${p.version} does not hold ${lost || 'one plain top folder'}`);
  fs.mkdirSync(raw, { recursive: true });
  tar(['-xzf', tgz, '-C', raw, ...members]);   // only the listed files leave the tarball
  const files = p.files.map(([from, to, bytes, hash]) => {
    const src = path.join(raw, top, from), buf = isFile(src) ? fs.readFileSync(src) : null;
    if (!buf || buf.length !== bytes || sha256(buf) !== hash) throw new Error(`${from} in ${p.name} ${p.version} is not the published file`);
    const out = turn(lib, to, buf), dst = path.join(stage, to);
    fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, out);
    const changed = out.equals(buf) ? null : Object.entries(bareMap(lib, to)).map(([a, b]) => `import '${a}' now reads '${b}'`).join('; ');
    return { path: to, from, bytes: out.length, sha512: sri(out), ...(changed ? { changed } : {}) };
  });
  return { name: p.name, version: p.version, licence: p.licence, source: dist.tarball, integrity: p.integrity, files };
}

function checkImports(lib, stage) {   // a module importing a file that was not brought along would only fail later, in the browser
  const have = new Set(lib.parts.flatMap(p => p.files.map(f => f[1])));
  for (const to of have) if (to.endsWith('.js')) for (const s of specs(fs.readFileSync(path.join(stage, to), 'latin1'))) {
    const hit = s.startsWith('.') && path.posix.join(path.posix.dirname(to), s);
    if (!hit || !have.has(hit)) throw new Error(`${to} imports '${s}', which is not among the files kept`);
  }
}

async function fetchLib(lib, root, net) {
  const hold = path.join(root, 'runtime', 'vendor-tmp'), tmp = path.join(hold, `${process.pid}-${lib.id}`), stage = path.join(tmp, 'stage'), dir = path.join(root, lib.dir);
  const dists = [], packages = [];
  for (const p of lib.parts) dists.push(await published(p, net));   // refused here, nothing was downloaded and no folder was made
  fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(stage, { recursive: true });
  try {
    for (const [i, p] of lib.parts.entries()) packages.push(await stagePart(lib, p, dists[i], tmp, stage, net));   // every part is checked before one file is put in place
    if (lib.bare) checkImports(lib, stage);
    fs.writeFileSync(path.join(stage, 'VERSION.json'), JSON.stringify({ library: lib.id, version: lib.parts[0].version, packages }, null, 1) + '\n');   // no date inside: the folder is the same bytes on every computer
    fs.mkdirSync(dir, { recursive: true }); fs.rmSync(path.join(dir, 'VERSION.json'), { force: true });   // without VERSION.json the folder never counts as complete
    for (const f of packages.flatMap(p => p.files)) move(path.join(stage, f.path), path.join(dir, f.path));
    move(path.join(stage, 'VERSION.json'), path.join(dir, 'VERSION.json'));   // last, in one step
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmdirSync(hold); } catch { /* another run still has its own folder in there */ }
  }
  const now = inspect(lib, root);
  if (!now.ok) throw new Error(now.why);
  return now.files;
}

// ---- the three commands
export async function vendorRun({ args = [], root = ROOT, libs = LIBS, net = NET, say = console.log } = {}) {
  const flags = args.filter(a => a.startsWith('-')), names = args.filter(a => !a.startsWith('-'));
  const check = flags.includes('--check'), list = flags.includes('--list'), offline = flags.includes('--offline');
  const odd = flags.some(f => !['--check', '--list', '--offline'].includes(f)) || names.some(n => !libs.some(l => l.id === n));
  if (odd || (check && list) || (offline && !check && !list)) { say(USAGE); return flags.includes('--help') ? 0 : 2; }
  const picked = libs.filter(l => !names.length || names.includes(l.id));
  const registry = async lib => {   // one plain sentence about the registry for a whole library
    if (offline) return { ok: true, text: 'Registry not asked.' };
    try { for (const p of lib.parts) await published(p, net); return { ok: true, text: 'The registry publishes the pinned checksum.' }; }
    catch (e) { return { ok: false, text: `STOP: ${e.message}.` }; }
  };
  let good = 0, wrong = 0;

  if (list) {
    let bytes = 0, kept = 0, count = 0;
    for (const lib of picked) {
      const here = inspect(lib, root);
      say(`${lib.label} -> ${lib.dir}/  (${here.ok ? 'in place, would not be fetched again' : here.absent ? 'not fetched yet' : 'would be fetched again: ' + here.why})`);
      for (const p of lib.parts) {
        const keep = p.files.reduce((s, f) => s + f[2], 0);
        let reg = 'registry not asked';
        if (!offline) try { const d = await published(p, net); reg = `the registry says ${size(d.unpackedSize)} unpacked in ${d.fileCount} files`; } catch (e) { reg = `STOP: ${e.message}`; wrong++; }
        say(`  ${p.name} ${p.version} (${p.licence})  ${tarballUrl(p)}`);
        say(`  download ${size(p.tgz)}; ${reg}; keeps ${p.files.length} files, ${size(keep)}`);
        for (const [from, to, n] of p.files) say(`    ${from} -> ${lib.dir}/${to}  (${n} bytes)`);
        bytes += here.ok ? 0 : p.tgz; kept += keep; count += p.files.length;
      }
    }
    say(`In all: ${size(bytes)} still to download; ${count} files, ${size(kept)}, are kept. To fetch: node scripts/vendor.mjs`);
    return wrong ? 1 : 0;
  }

  for (const lib of picked) {
    const here = inspect(lib, root);
    if (check) {
      const reg = await registry(lib);
      say(`${lib.label}: ${here.ok ? `in place, ${here.files} files match` : here.absent ? 'not fetched yet' : 'WRONG, ' + here.why}. ${reg.text}`);
      here.ok && reg.ok ? good++ : wrong++;
    } else if (here.ok) { say(`${lib.label}: already in place, ${here.files} files match.`); good++; }
    else try { const n = await fetchLib(lib, root, net); say(`${lib.label}: fetched and checked, ${n} files in ${lib.dir}/.`); good++; }
    catch (e) { say(`${lib.label}: NOT fetched: ${e.message.replace(/\.$/, '')}.`); wrong++; }
  }
  say(check ? `${good} of ${picked.length} in place and right.${wrong ? ' To fetch what is missing: node scripts/vendor.mjs' : ''}` : `${good} of ${picked.length} libraries in place.`);
  return wrong ? 1 : 0;
}

let direct = false;
try { direct = fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { /* imported, not run */ }
if (direct) process.exitCode = await vendorRun({ args: process.argv.slice(2) });
