// BY HAND ONLY, never part of the automatic run: records fresh test inputs for the crops-prices lookups (faostat, prices,
// cdl) from the LIVE services, and reads the two small tables the lookups ship with (written 2026-11-14).
// The recordings it writes are what scripts/test_live_crops.mjs and scripts/test_sales.mjs read with the network replaced.
/*
 *   node scripts/record_live_crops-prices.mjs prices     the World Bank page and its Excel file          (2 requests)
 *   node scripts/record_live_crops-prices.mjs cdl        an Iowa field (2 spots) and a spot in Ontario   (about 60 requests)
 *   node scripts/record_live_crops-prices.mjs faostat    FAO's two bulk files: asked for their date; downloaded only if the
 *                                                        kept copy is older; then a small REAL piece is cut from each
 *   node scripts/record_live_crops-prices.mjs tables     m49_iso2.json (UN Statistics Division) and cdl_codes.json (USDA)
 * Each case writes scripts/fixtures/live/<name>/ (two files per request, as scripts/live_testlib.mjs records them) and
 * recording.json: the command, the time, the seconds, the peak memory and the live answer. A case whose folder already
 * holds a recording is refused: remove the folder first. One run asks each address once. Do not loop it: the services are
 * free and shared. FAO's files (25 MB and 8 MB) are kept under FW_CACHE (default: .cache/crops-prices/fw) so they are
 * downloaded once, however often the tests are made again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runLookup, FIXTURES, ROOT, LIVE_DIR, answersIn, tempFolder } from './live_testlib.mjs';

const CASES = path.join(FIXTURES, 'crops_cases.py');
const CACHE = process.env.FW_CACHE || path.join(ROOT, '.cache', 'crops-prices', 'fw');
const EXCERPT_AREAS = ['124', '792', '231', '158', '159', '1', '21', '58'];   // Canada, Türkiye, Ethiopia, Taiwan, "China" (a total), World, Northern America, Belgium-Luxembourg (gone)
const what = process.argv[2];

function fresh(name) {
  const folder = path.join(FIXTURES, name);
  if (fs.existsSync(folder) && fs.readdirSync(folder).length) { console.error(`${folder} already holds a recording. Remove the folder first if it must be made again.`); process.exit(1); }
  return folder;
}
async function record(name, id, args, options = {}) {
  const folder = fresh(name);
  const r = await runLookup(id, args, { live: true, record: folder, limitS: 300, ...options });
  const requests = fs.existsSync(folder) ? fs.readdirSync(folder).filter(n => /^[0-9a-f]{24}\.json$/.test(n)).length : 0;
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'recording.json'), JSON.stringify({
    made_by: `node scripts/record_live_crops-prices.mjs ${what}`, recorded: new Date().toISOString(), lookup: id, args, requests,
    seconds: Math.round(r.seconds * 100) / 100, peak_mb: r.peakMB, asked: r.asked, exit_code: r.code, answer: r.answer,
  }, null, 1) + '\n');
  console.log(`${name}: exit ${r.code}, ${r.seconds.toFixed(2)} s, peak memory ${r.peakMB} MB, ${r.asked} requests sent, ${requests} recorded`);
  console.log((r.stdout || '(nothing on stdout)').slice(0, 600));
  if (r.code !== 0 || !r.answer) { console.log(r.stderrTail); process.exitCode = 1; }
  return { r, folder };
}

if (what === 'prices') {
  await record('prices-live', 'prices', []);
} else if (what === 'cdl') {
  await record('cdl-iowa', 'cdl', ['42.0500,-93.7500', '42.0510,-93.7490'], { limitS: 120 });   // farmland west of Ames, Iowa
  await record('cdl-ontario', 'cdl', ['44.4000,-79.7800'], { limitS: 120 });                     // inside the lookup's box, outside the map
} else if (what === 'faostat') {
  const { r, folder } = await record('faostat-live', 'faostat', [], { limitS: 420, cache: CACHE });
  if (r.answer?.ok) {
    // The whole answer (198 countries, 0.4 MB) is not kept as a test input: only what the tests compare.
    const file = path.join(folder, 'recording.json'), doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    doc.answer = { ...doc.answer, countries: Object.fromEntries(['CA', 'TR', 'ET', 'TW'].map(c => [c, doc.answer.countries[c]])), countries_in_all: Object.keys(doc.answer.countries).length };
    fs.writeFileSync(file, JSON.stringify(doc, null, 1) + '\n');
    // A small real piece of each file, for the offline suite: FAO's own rows for a few areas, cut out unchanged.
    const small = fresh('faostat-excerpt'), work = tempFolder('excerpt');
    fs.mkdirSync(small, { recursive: true });
    for (const a of answersIn(folder)) {
      const kind = a.url.includes('Prices_') ? 'prices' : 'production', out = path.join(work, kind + '.zip');
      const cut = await runLookup('crops_cases', ['excerpt', path.join(CACHE, 'faostat', kind + '.zip'), out, ...EXCERPT_AREAS], { script: CASES });
      if (!cut.answer?.ok) { console.log(cut.stdout, cut.stderrTail); process.exit(1); }
      const { key, file: _f, bodyFile: _b, ...meta } = a, bytes = fs.statSync(out).size;
      const note = `FAO's own rows for the areas with M49 codes ${EXCERPT_AREAS.join(', ')}, cut unchanged from the file FAO served on ${doc.recorded.slice(0, 10)} (${meta.replies[0].headers['content-length']} bytes); content-length below is the excerpt's`;
      meta.replies[0].headers['content-length'] = String(bytes);
      fs.writeFileSync(path.join(small, key + '.json'), JSON.stringify({ ...meta, excerpt: true, note }, null, 1) + '\n');   // the HEAD answer, as recorded
      const get = (await import('./live_testlib.mjs')).netKey('GET', a.url);
      fs.copyFileSync(out, path.join(small, get + '.body'));
      fs.writeFileSync(path.join(small, get + '.json'), JSON.stringify({ method: 'GET', url: a.url, recorded: meta.recorded, hand_made: false, excerpt: true, note, replies: [{ status: 200, headers: { 'content-length': String(bytes) } }] }, null, 1) + '\n');
      console.log(`faostat-excerpt: ${kind}: ${cut.answer.rows} rows, ${bytes} bytes`);
    }
    fs.writeFileSync(path.join(small, 'recording.json'), JSON.stringify({ made_by: 'node scripts/record_live_crops-prices.mjs faostat', recorded: doc.recorded, lookup: 'faostat', areas: EXCERPT_AREAS, live_answer_for_these: doc.answer }, null, 1) + '\n');
  }
} else if (what === 'tables') {
  const out = tempFolder('tables');
  const r = await runLookup('crops_cases', ['tables', out], { script: CASES, live: true, limitS: 300 });
  console.log(r.stdout);
  if (!r.answer?.ok) { console.log(r.stderrTail); process.exit(1); }
  for (const name of ['m49_iso2.json', 'cdl_codes.json']) fs.copyFileSync(path.join(out, name), path.join(LIVE_DIR, name));
  console.log(`written: ${path.join(LIVE_DIR, 'm49_iso2.json')} and cdl_codes.json`);
} else {
  console.error('Use: node scripts/record_live_crops-prices.mjs prices | cdl | faostat | tables');
  process.exit(1);
}
