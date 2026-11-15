// Crophalo's report-load suite: the weather record as honest as the Limitations page says. The second coldest-night record is asked beside NASA's and the figure is the middle of the two; the field's height moves the temperatures and a sentence says by how much;
// a failed first answer is retried once after four seconds and the back-up record says so; the weather line says how new the record is; the loading list names every source. Stand-in answers made from the recorded NASA POWER answer for Barrie.
// RULE: never loosen a check to make it pass. No network. Run: node scripts/test_report_load.mjs
import fs from 'node:fs';
import { outlineKey, prefetchPlace, loadSpot, ROWS, freshRows, BACKUP_WAIT_MS, COLD_WAIT_MS, forgetSpots } from '../js/report-load.js';
import { forgetAll } from '../js/memo.js';
import { buildSeries, BACKUP_CARD } from '../js/data.js';

let passed = 0, failed = 0;
const brief = v => { const s = JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);

const PW = fs.readFileSync(new URL('./fixtures/power_barrie.json', import.meta.url), 'utf8'), FC = fs.readFileSync(new URL('./fixtures/forecast_barrie.json', import.meta.url), 'utf8');
const REC = JSON.parse(PW), where = { lat: REC.geometry.coordinates[1], lon: REC.geometry.coordinates[0] };
const S0 = buildSeries(JSON.parse(PW), where);
// An Open-Meteo archive answer in its own shape, made from the recorded record: every night moved by `shift` °C.
const dash = d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const archive = shift => JSON.stringify({ latitude: where.lat, longitude: where.lon, utc_offset_seconds: 0, elevation: S0.cellElev ?? 250, daily: { time: S0.days.map(dash), temperature_2m_max: S0.T2M_MAX.map(v => v + shift), temperature_2m_min: S0.T2M_MIN.map(v => v + shift), precipitation_sum: S0.days.map(() => 1) } });
const reply = text => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => text, json: async () => JSON.parse(text) });
const bad = status => ({ ok: false, status, headers: { get: () => null }, text: async () => '{}', json: async () => ({}) });
const clean = () => { forgetSpots(); forgetAll(); };

// 1. the second coldest-night record
clean();
let rows = [];
const near = await loadSpot(where, { fetch: async url => (/power\.larc/.test(url) ? reply(PW) : /archive-api/.test(url) ? reply(archive(0)) : reply(FC)) }, (k, st, why) => rows.push([k, st]));
check('the second record is asked beside NASA\'s and the climate holds both records', near.ok && near.climate.coldRecords === 2 && Number.isFinite(near.climate.coldSecond), brief([near.climate?.coldRecords, near.climate?.coldSecond]));
check('the loading list is told the second record answered', rows.some(r => r[0] === 'cold' && r[1] === 'ok'));
clean();
const apart = await loadSpot(where, { fetch: async url => (/power\.larc/.test(url) ? reply(PW) : /archive-api/.test(url) ? reply(archive(-6)) : reply(FC)) });
check('when the two records are 2 °C or more apart the figure is the middle of the two and the sentence says they disagree, keeping the colder in mind', apart.climate.coldDiffer === true && /disagree/.test(apart.climate.coldNote) && Math.abs(apart.climate.coldNight - (apart.climate.coldNasa + apart.climate.coldSecond) / 2) < 1e-9 && apart.climate.coldLow === Math.min(apart.climate.coldNasa, apart.climate.coldSecond), apart.climate?.coldNote);
clean();
rows = [];
const alone = await loadSpot(where, { fetch: async url => (/power\.larc/.test(url) ? reply(PW) : /archive-api/.test(url) ? bad(500) : reply(FC)) }, (k, st) => rows.push([k, st]));
check('a second record that fails leaves the figure resting on NASA alone, and says so in the list', alone.ok && alone.climate.coldRecords === 1 && rows.some(r => r[0] === 'cold' && r[1] === 'fail'));

// 1b. the second record never holds the report: after COLD_WAIT_MS the report goes on, resting on NASA alone, and says so
clean(); rows = [];
const t0 = Date.now();
const slowCold = await loadSpot(where, { coldWait: 150, fetch: async url => (/power\.larc/.test(url) ? reply(PW) : /archive-api/.test(url) ? new Promise(r => setTimeout(() => r(reply(archive(0))), 1500)) : reply(FC)) }, (k, st) => rows.push([k, st]));
check('a second record that is slow is not waited for: the report goes on within the wait, resting on NASA alone, and the list says it was slow', COLD_WAIT_MS === 3000 && slowCold.ok && slowCold.climate.coldRecords !== 2 && Date.now() - t0 < 1200 && rows.some(r => r[0] === 'cold' && r[1] === 'fail'), brief([Date.now() - t0, slowCold.climate?.coldRecords]));

// 2. the field's height
clean();
const high = await loadSpot({ ...where, elev: (S0.cellElev ?? 250) + 300 }, { fetch: async url => (/power\.larc/.test(url) ? reply(PW) : /archive-api/.test(url) ? bad(500) : reply(FC)) });
check('a field 300 m above NASA\'s grid is set cooler, and the sentence says by how much', high.ok && /Temperatures are set 2\.0 °C cooler for your field’s height: NASA’s grid averages 270 m, your field is 570 m\./.test(high.note) && high.climate.heightNote === high.note && Math.abs(high.series.dT + 1.95) < 0.01, brief([high.note, high.series.dT]));
clean();
const flat = await loadSpot({ ...where, elev: S0.cellElev ?? 250 }, { fetch: async url => (/power\.larc/.test(url) ? reply(PW) : /archive-api/.test(url) ? bad(500) : reply(FC)) });
check('a field at the grid\'s own height is not moved and says nothing about height', flat.ok && flat.climate.heightNote === '' && !/Temperatures are set/.test(flat.note));

// 3. the back-up record, retried once after four seconds
clean();
const waits = []; let calls = 0; rows = [];
const backup = await loadSpot(where, { wait: async ms => { waits.push(ms); }, fetch: async url => { if (/power\.larc/.test(url)) return bad(500); if (/archive-api/.test(url) && /models=era5(&|$)/.test(url)) { calls++; return calls === 1 ? bad(500) : reply(archive(0)); } return /archive-api/.test(url) ? bad(500) : reply(FC); } }, (k, st) => rows.push([k, st]));
check('a failed first back-up answer is asked again once after four seconds, and the back-up record is used', backup.ok && backup.backup === true && calls === 2 && waits.includes(BACKUP_WAIT_MS) && BACKUP_WAIT_MS === 4000, brief([backup.ok, backup.backup, calls, waits]));
check('the back-up is said plainly: the note, the card on the climate, no second cold record, the row says NASA did not answer', /back-up|Open-Meteo \(ERA5\)/.test(backup.note) && backup.climate.backupCard === BACKUP_CARD && backup.climate.coldRecords !== 2 && rows.some(r => r[0] === 'power' && r[1] === 'fail'));
clean();
const none = await loadSpot(where, { wait: async () => {}, fetch: async url => (/power\.larc/.test(url) ? bad(500) : /archive-api/.test(url) ? bad(500) : reply(FC)) });
check('when both fail after the second try there is a plain reason and no weather', none.ok === false && /No weather source answered/.test(none.reason));

// 4. how new the record is
clean();
const fresh = await loadSpot(where, { fetch: async url => (/power\.larc/.test(url) ? reply(PW) : /archive-api/.test(url) ? bad(500) : reply(FC)) });
check('the weather line says it is live and through which day', /^live · weather through [A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(fresh.climate.weatherLine) && fresh.line === fresh.climate.weatherLine, fresh.line);

// 5. the loading list names every source
same('the loading list has a row for every lookup the report waits on, each naming its source', ROWS.map(r => r.key), ['power', 'forecast', 'cold', 'smap', 'crops', 'soil']);
check('each row names who provides it, and says which are not NASA', ROWS.every(r => / · /.test(r.label)) && /NASA POWER/.test(ROWS[0].label) && /not NASA/.test(ROWS[1].label) && /not NASA/.test(ROWS[2].label) && /NASA SMAP/.test(ROWS[3].label) && /United States/.test(ROWS[5].label));
check('fresh rows all wait', freshRows().every(r => r.state === 'wait'));
// the terrain answer is kept under a key that holds the outline's corners: moving a corner changes the key even when the number of corners and the size stay the same
{ const a = { pts: [[43.1, -80.7], [43.1, -80.69], [43.11, -80.69], [43.11, -80.7]], ha: 9 }, b = { pts: [[43.1, -80.7], [43.1, -80.69], [43.11, -80.69], [43.1101, -80.7]], ha: 9 };
  check('the terrain key follows the outline\'s corners (the same count and size but one corner moved gives another key), and a pin has its own key', outlineKey(a) !== outlineKey(b) && outlineKey(a) === outlineKey(JSON.parse(JSON.stringify(a))) && outlineKey(null) === 'none', outlineKey(a).slice(0, 60)); }
{ const src = fs.readFileSync(new URL('../js/report-load.js', import.meta.url), 'utf8');
  check('the height map\'s code is fetched only when the height is asked: no import of js/field-data.js at the top, one when getDem runs', !/^import [^\n]*'\.\/field-data\.js'/m.test(src) && /getDem = [^\n]*await import\('\.\/field-data\.js'\)\)\.loadDem\(loc, outline\)/.test(src)); }
// the place chosen: the report's lookups are asked at once and the country is kept (the crop map and the crop map by year are warmed), nothing waits for the slow ones
{ clean(); const urls = [], get = async url => { urls.push(String(url)); return /power\.larc/.test(url) ? reply(PW) : /open-meteo/.test(url) ? reply(FC) : { ok: true, status: 200, headers: { get: () => null }, text: async () => '{"ok":false}', json: async () => ({ ok: false }) }; };
  const realFetch = globalThis.fetch; globalThis.fetch = get;   // the crop-map lookups use the page's own fetch
  const started = prefetchPlace({ lat: where.lat, lon: where.lon, cc: 'US' }, { fetch: get }, [[where.lat, where.lon], [where.lat, where.lon + 0.001], [where.lat + 0.001, where.lon + 0.001]]);
  await new Promise(r => setTimeout(r, 400));
  check('prefetchPlace asks the weather record and the forecast at once, the crop map with its country, and the crop map by year (near=0), and takes the corners the map hands over', started === true && urls.some(u => /power\.larc/.test(u)) && urls.some(u => /api\.open-meteo/.test(u)) && urls.some(u => /cropsnear/.test(u) && /country=US/i.test(u)) && urls.some(u => /crophist/.test(u) && /country=US/.test(u) && /near=0/.test(u)), urls.map(u => u.replace(/\?.*/, '')).join());
  clean(); urls.length = 0;
  prefetchPlace({ lat: where.lat, lon: where.lon }, { fetch: get });
  await new Promise(r => setTimeout(r, 300)); globalThis.fetch = realFetch;
  check('a bare position (no country) never asks the crop map by year, and a country outside Canada and the United States never does either', !urls.some(u => /crophist/.test(u))); }
console.log(`report_load: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
