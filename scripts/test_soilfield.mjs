// Crophalo's offline suite for the soil-at-the-field lookup /api/soilfield (scripts/live/soilfield.py) and for the page's reader of its answer (js/soil-load.js): the map unit under the pin, its main soils, the top layer of each, and the report's soil line.
// The network is always replaced: it replays the answers USDA NRCS Soil Data Access gave on 2026-11-14 for the Mead, Nebraska demo field (scripts/fixtures/extra/, each file's first line naming its source and licence) and hand-made answers in the service's documented shape, labelled as such.
// RULE: never loosen a check here without a written farming or legal reason beside it. A blank figure read as 0, the coarse general map passed off as the field's own soil, or a failure read as a soil would mislead a farmer.
// Run: node scripts/test_soilfield.mjs   (the Python part uses the folder's .venv, or FW_PYTHON; the lookup needs only Python's own library)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '..');
if (!process.env.FW_PYTHON && !fs.existsSync(path.join(ROOT, '.venv', 'bin', 'python')) && !fs.existsSync(path.join(ROOT, '.venv', 'Scripts', 'python.exe'))) {
  const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['python3'], { encoding: 'utf8' }).stdout.split(/\r?\n/)[0].trim();
  if (found) process.env.FW_PYTHON = found;
}
const { check, same, group, finish, runLookup, tempFolder, PYTHON, LIVE_DIR } = await import('./live_testlib.mjs');
const { surveyToSoil, soilLine, loadSoilSurvey, forgetSoilRoute } = await import('../js/soil-load.js');
const fixture = name => { const [head, ...rest] = fs.readFileSync(path.join(HERE, 'fixtures', 'extra', name), 'utf8').split('\n'); return { head, text: rest.join('\n').trim(), body: JSON.parse(rest.join('\n')) }; };

// ---- the lookup, on the answers Soil Data Access gave on 2026-11-14 (and hand-made ones in its documented shape)
let mead = null, general = null;
await group('soilfield lookup', async () => {
  if (!fs.existsSync(PYTHON)) { check(`Python is there to run the lookup (${PYTHON})`, false); return; }
  const keysFile = path.join(tempFolder('keys'), 'keys.json');
  const made = spawnSync(PYTHON, ['-I', '-c', `import sys; sys.path.insert(0, ${JSON.stringify(LIVE_DIR)}); import json, common, soilfield as s
k = lambda sql: common.net_key("POST", s.SDA, s.body_for(sql), s.HEADERS)
open(sys.argv[1], "w").write(json.dumps({"ssurgo": k(s.sql_ssurgo(41.18, -96.44)), "statsgo2": k(s.sql_statsgo2(41.18, -96.44)), "url": s.SDA}))`, keysFile], { cwd: os.tmpdir(), encoding: 'utf8', env: { PATH: process.env.PATH } });
  check('the request names of the lookup can be worked out', made.status === 0, made.stderr);
  const keys = JSON.parse(fs.readFileSync(keysFile, 'utf8'));
  const ssurgo = fixture('sda_ssurgo_mead.txt'), statsgo2 = fixture('sda_statsgo2_mead.txt');
  check('the recorded answers name their source and licence on their first line', [ssurgo, statsgo2].every(f => /^# Source: USDA NRCS Soil Data Access .* recorded 2026-11-14 .*public domain/.test(f.head)));
  check('the recorded answers hold soil figures only: no key, no login, no person', [ssurgo, statsgo2].every(f => !/api_?key|token|password|authorization|@/i.test(f.text)));
  const folder = (answers, name) => {   // answers: { ssurgo: text | { fail }, statsgo2: ... }
    const dir = path.join(tempFolder(name), 'answers'); fs.mkdirSync(dir, { recursive: true });
    for (const [which, a] of Object.entries(answers)) {
      const meta = { method: 'POST', url: keys.url, hand_made: typeof a !== 'string' || a === '{}', note: a === '{}' ? 'hand-made: the documented empty answer of Soil Data Access' : 'recorded 2026-11-14', replies: [typeof a === 'string' ? { status: 200, headers: { 'content-type': 'application/json' } } : a] };
      fs.writeFileSync(path.join(dir, keys[which] + '.json'), JSON.stringify(meta));
      if (typeof a === 'string') fs.writeFileSync(path.join(dir, keys[which] + '.body'), a);
    }
    return dir;
  };
  const run = (answers, name, opts = {}) => runLookup('soilfield', ['41.1800', '-96.4400'], { replay: folder(answers, name), now: '2026-11-15T04:00:00Z', limitS: 60, ...opts });
  const a = (await run({ ssurgo: ssurgo.text }, 'ssurgo')).answer; mead = a;
  same('Mead: the detailed survey, map unit 7280 Tomek silt loam in Saunders County, prime farmland', [a.ok, a.survey, a.mapunit.symbol, a.mapunit.name, a.mapunit.area, a.mapunit.farmland], [true, 'SSURGO', '7280', 'Tomek silt loam, 0 to 2 percent slopes', 'NE155', 'All areas are prime farmland']);
  same('Mead: its main soil and the top layer as the survey gives it', [a.soils[0].name, a.soils[0].percent, a.soils[0].top], ['Tomek', 85, { from_cm: 0, to_cm: 15, organic_matter_pct: 3.5, ph: 5.7, sand_pct: 6, silt_pct: 68, clay_pct: 26, water_cm_per_cm: 0.22 }]);
  same('Mead: the survey\'s publication day, the citation with the accessed day, a replayed answer marked as such', [a.data_date, a.citation.endsWith('Accessed 11/15/2026.'), a.replayed, /Soil Survey Geographic \(SSURGO\) Database/.test(a.source)], ['2026-09-11', true, true, true]);
  const b = (await run({ ssurgo: '{}', statsgo2: statsgo2.text }, 'statsgo2')).answer; general = b;
  same('no detailed survey at the point (hand-made empty answer): the general soil map, its largest soils first', [b.ok, b.survey, b.mapunit.name, b.soils.map(s => [s.name, s.percent]).slice(0, 2), b.data_date], [true, 'STATSGO2', 'Sharpsburg-Fillmore (s4949)', [['Sharpsburg', 66], ['Fillmore', 15]], '2016-10-13']);
  check('…and says it is the coarse general map, a guide for the area, not the field', /general soil map: about 1:250,000, a guide for the area, not the field/.test(b.note) && /U\.S\. General Soil Map \(STATSGO2\)/.test(b.citation));
  check('…the same soil listed twice by the service is shown once', new Set(b.soils.map(s => `${s.name}|${s.percent}`)).size === b.soils.length);
  const c = (await run({ ssurgo: '{}', statsgo2: '{}' }, 'none')).answer;
  same('no US soil at all: a final answer in words (asking again cannot change it)', c, { ok: false, reason: 'The USDA soil survey covers only the United States: there is no SSURGO or STATSGO2 soil at this place', final: true });
  const d = (await run({ ssurgo: '<html>Service unavailable</html>' }, 'garbled')).answer;
  same('an answer that is not the survey\'s JSON: said, never guessed', [d.ok, d.reason], [false, 'The data source did not answer just now; try again in a minute']);
  const e = (await run({ ssurgo: '{"Table":[["x"],["1"]]}' }, 'odd')).answer;
  same('JSON in another shape: said, never read as a soil', [e.ok, e.reason], [false, 'The soil survey sent an answer Crophalo cannot read']);
  const f = (await run({ ssurgo: { fail: 'hang' } }, 'hang', { limitS: 8 })).answer;
  check('a service that hangs: the lookup still answers in plain words before the server stops it (its own time limit names the nightly closing; the request\'s time-out, which can end first, says to try again)', f.ok === false && (/took too long.*midnight to 2 am Mountain time/.test(f.reason) || f.reason === 'The data source did not answer just now; try again in a minute'), f);
  const g = (await run({ ssurgo: { status: 503 } }, 'down')).answer;
  same('the service down (503): said in plain words', [g.ok, g.reason], [false, 'The data source did not answer just now; try again in a minute']);
  const h = (await runLookup('soilfield', ['91', '-96.44'], { replay: folder({}, 'bad') })).answer;
  same('a place that is not a place is refused before anything is asked', [h.ok, /lat must be/.test(h.reason)], [false, true]);
  check('no failure sentence holds an address, a path or a file name', [c, d, e, f, g, h].every(x => !/https?:|[\\/]|\.py\b|\.json\b/.test(x.reason)), [c, d, e, f, g, h].map(x => x.reason));
});

// ---- the page's own reader on the lookup's real answers (js/soil-load.js): the report's soil line and the loading list's soil row
await group('the page reads the lookup\'s answer', async () => {
  if (!mead || !general) { check('the lookup answered, so the page side can be checked', false); return; }
  const s = surveyToSoil(mead);
  same('Mead: a silt, organic matter 3.5 percent, measured (not assumed), from the detailed survey, the Tomek soil at 85 percent', [s.ok, s.soil, s.survey, s.name, s.percent, s.complete], [true, { mode: 'manual', texture: 'silt', om: s.soil?.om, omPct: 3.5 }, 'SSURGO', 'Tomek', 85, true]);
  check('…its organic matter falls in a named band', typeof s.soil.om === 'string' && s.soil.om.length > 0, s.soil);
  same('the report\'s soil line names the survey, the soil and the layer', soilLine(s), 'Soil: from the detailed US soil survey (SSURGO), the main soil here (Tomek), top layer. Your own soil test would replace it.');
  const g = surveyToSoil(general);
  same('the general map: its largest soil, and the line says it is the general map', [g.ok, g.survey, g.name, soilLine(g)], [true, 'STATSGO2', 'Sharpsburg', 'Soil: from the general US soil map (STATSGO2), the main soil here (Sharpsburg), top layer. Your own soil test would replace it.']);
  // the loader, against the route's answer as the server sends it (the lookup's answer plus the place read, cached and fetched)
  forgetSoilRoute();
  const asked = [], served = { ...mead, spot: { lat: 41.18, lon: -96.44 }, cached: false, fetched: '2026-11-15T04:00:00.000Z' };
  const got = await loadSoilSurvey({ lat: 41.18, lon: -96.44, cc: 'US' }, async url => { asked.push(String(url)); return { status: 200, ok: true, json: async () => served }; });
  same('the loader asks our own server once, with the position only, and the soil row settles on the survey\'s soil', [asked, got.ok, got.name, got.soil.texture], [['/api/soilfield?lat=41.1800&lon=-96.4400'], true, 'Tomek', 'silt']);
  const none = await loadSoilSurvey({ lat: 41.18, lon: -96.44, cc: 'US' }, async () => ({ status: 200, ok: true, json: async () => ({ ok: false, reason: 'The USDA soil survey covers only the United States: there is no SSURGO or STATSGO2 soil at this place', final: true }) }));
  same('a place with no survey: the row settles with the lookup\'s plain reason', [none.ok, none.reason], [false, 'The USDA soil survey covers only the United States: there is no SSURGO or STATSGO2 soil at this place']);
  const away = await loadSoilSurvey({ lat: 44.4, lon: -79.7, cc: 'CA' }, async () => { throw new Error('must not be asked'); });
  same('a field outside the United States is never asked', away.ok, false);
});

// ---- the files of this lookup keep the house rules
await group('house rules', async () => {
  const files = ['scripts/live/soilfield.py', 'scripts/test_soilfield.mjs', 'js/soil-load.js'].map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  const { flagged } = await import('./wordguard.mjs');
  for (const [f, text] of files) {
    check(`${f}: names no writing tool`, flagged(text).length === 0);
    const early = (text.match(/\b20\d\d-\d\d-\d\d\b/g) ?? []).filter(d => d < '2026-11-14' && d !== '2016-10-13' && d !== '2026-09-11');   // the two survey publication days are data, read from the service
    same(`${f}: no day written before 14 November 2026, apart from data`, early, []);
    check(`${f}: the country is written Türkiye`, !text.includes(['Tur', 'key'].join('')));
    check(`${f}: no key, token or password in the file`, !/(api_?key|token|password)\s*[:=]\s*['"][^'"]{6,}/i.test(text));
  }
});

finish();
