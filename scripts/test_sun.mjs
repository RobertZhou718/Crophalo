// Crophalo's sun suite: js/sun.js against the US Naval Observatory's own answers (recorded fresh by scripts/record_usno.mjs),
// then the cases the answers cannot show: polar day and night, the 180° line, refraction, the clock, the words, the 3D light direction.
// RULE: never loosen a check here without a written farming reason beside it. A farmer plans frost, sowing and shade by these minutes. No internet is needed.
// Run: node scripts/test_sun.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sun from '../js/sun.js';

let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const near = (name, got, want, tol) => check(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `got ${got}, wanted ${want} ± ${tol}`);
const MIN = 60000;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'usno.json'), 'utf8'));
const dateOf = s => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
// a recorded local "HH:MM" on its date, as UTC milliseconds
const at = (c, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const { y, m: mo, d } = dateOf(c.date); return Date.UTC(y, mo - 1, d) + (h * 60 + m - c.tzHours * 60) * MIN; };

// ---- the Naval Observatory: 6 places x 4 dates
const worst = { rise: 0, set: 0, noon: 0, dawn: 0, dusk: 0, height: 0, azimuth: 0, moonless: 0 };
let riseCases = 0, sunSamples = 0;
check('the recording is from the day this build began or later', new Date(fx.recordedAt) >= new Date('2026-11-14T00:00:00'), fx.recordedAt);
same('24 recorded cases', fx.cases.length, 24);
for (const c of fx.cases) {
  const tag = `${c.place} ${c.date}`;
  const ev = sun.sunEvents(dateOf(c.date), c.lat, c.lon);
  // the service gives whole minutes, so half a minute of the difference is its own rounding; the demand is within 1 minute
  for (const [key, want, mine, slot] of [['rise', c.rise, ev.rise, 'rise'], ['set', c.set, ev.set, 'set'], ['noon', c.noon, ev.noon, 'noon'], ['civil begin', c.civilBegin, ev.civilDawn, 'dawn'], ['civil end', c.civilEnd, ev.civilDusk, 'dusk']]) {
    if (want == null) { check(`${tag}: ${key} is absent where the service has none`, mine == null || key === 'noon', mine); continue; }
    if (mine == null) { check(`${tag}: ${key} is found`, false, 'null'); continue; }
    const diff = Math.abs(mine - at(c, want)) / MIN;
    worst[slot] = Math.max(worst[slot], diff);
    check(`${tag}: ${key} within 1 minute of the Observatory`, diff <= 1, `${diff.toFixed(2)} min`);
    if (key === 'rise') riseCases++;
  }
  for (const s of c.samples) {
    if (!s.sun) continue;   // the service lists a body only while it is above the horizon
    sunSamples++;
    const mine = sun.sunAt(Date.parse(s.utc), c.lat, c.lon);
    const dh = Math.abs(mine.height - s.sun.height), dz = Math.abs(((mine.azimuth - s.sun.azimuth + 540) % 360) - 180);
    worst.height = Math.max(worst.height, dh);
    check(`${tag} ${s.utc}: height within 0.02°`, dh <= 0.02, `${dh.toFixed(4)}°`);
    // a direction is only meaningful when the sun is not at the pole of the sky
    if (Math.abs(mine.height) < 89.5) { worst.azimuth = Math.max(worst.azimuth, dz); check(`${tag} ${s.utc}: direction within 0.05°`, dz <= 0.05, `${dz.toFixed(4)}°`); }
  }
}
check('at least 40 daytime height samples were compared', sunSamples >= 40, sunSamples);
check('the Observatory gave a sunrise for at least 20 of the 24 cases', riseCases >= 20, riseCases);
console.log(`measured against the Observatory: rise ${worst.rise.toFixed(2)} min, set ${worst.set.toFixed(2)}, noon ${worst.noon.toFixed(2)}, civil dawn ${worst.dawn.toFixed(2)}, dusk ${worst.dusk.toFixed(2)}, height ${worst.height.toFixed(4)}°, direction ${worst.azimuth.toFixed(4)}°`);

// ---- polar states (Tromsø): the Observatory has no rise or set on 21 December and none on 21 June
{
  const dec = sun.sunEvents({ y: 2026, m: 12, d: 21 }, 69.65, 18.96), jun = sun.sunEvents({ y: 2027, m: 6, d: 21 }, 69.65, 18.96);
  same('Tromsø 21 Dec is polar night', [dec.state, dec.rise, dec.set], ['night', null, null]);
  same('Tromsø 21 Jun is polar day', [jun.state, jun.rise, jun.set], ['day', null, null]);
  check('polar night has no path', sun.sunPath({ y: 2026, m: 12, d: 21 }, 69.65, 18.96).length === 0);
  const day = sun.sunPath({ y: 2027, m: 6, d: 21 }, 69.65, 18.96);
  check('polar day path runs the 24 hours round noon, every 10 minutes', day.length === 145 && day[0].height > 0 && day.at(-1).height > 0, day.length);
  check('polar day daylight is 24 h, polar night 0', jun.daylightMinutes === 1440 && dec.daylightMinutes === 0);
  // the last days before the polar night keep their short day: the sun is up, but only briefly
  const last = sun.sunEvents({ y: 2026, m: 11, d: 27 }, 69.65, 18.96);
  check('Tromsø 27 Nov still has a short day', last.state === 'normal' && last.rise != null && last.set != null && last.set > last.rise && (last.set - last.rise) / MIN < 120, last.daylightMinutes);
  const midnight = sun.sunAt(jun.noon + 12 * 60 * MIN, 69.65, 18.96);
  check('polar day: the sun is still up at midnight', midnight.apparent > 0, midnight.apparent);
}

// ---- the 180° line: a farm at 179.9° east and west still gets its own day, with sunrise before sunset
for (const lon of [179.9, -179.9, 179.99, -179.99]) {
  for (const date of [{ y: 2026, m: 11, d: 14 }, { y: 2027, m: 6, d: 21 }]) {
    const ev = sun.sunEvents(date, -17.7, lon);
    check(`lon ${lon} ${date.m}/${date.d}: rise < noon < set, about 11 to 13 h of day`, ev.rise < ev.noon && ev.noon < ev.set && ev.daylightMinutes > 600 && ev.daylightMinutes < 800, [ev.rise, ev.noon, ev.set]);
    near(`lon ${lon}: noon is within a day of the date's mean noon`, ev.noon, Date.UTC(date.y, date.m - 1, date.d, 12) - lon * 4 * MIN, 20 * MIN);
    { const az = sun.sunAt(ev.noon, -17.7, lon).azimuth; check(`lon ${lon}: at noon the sun is due north or due south`, Math.min(Math.abs(az), Math.abs(az - 180), Math.abs(az - 360)) < 1, az); }
  }
}

// ---- an evening west of Greenwich is never read as a morning (hour angle kept in −180..180)
{
  const ev = sun.sunEvents({ y: 2026, m: 11, d: 14 }, 44.39, -79.69);
  const evening = sun.sunAt(ev.set - 60 * MIN, 44.39, -79.69), morning = sun.sunAt(ev.rise + 60 * MIN, 44.39, -79.69);
  check('an hour before sunset the sun is in the west and its hour angle is positive', evening.azimuth > 180 && evening.hourAngle > 0, evening);
  check('an hour after sunrise the sun is in the east and its hour angle is negative', morning.azimuth < 180 && morning.hourAngle < 0, morning);
}

// ---- refraction
near('refraction at the horizon is 0.482°', sun.refraction(0), 0.482, 0.001);
same('no refraction above 85°', sun.refraction(86), 0);
check('refraction is smaller higher up', sun.refraction(5) > sun.refraction(20) && sun.refraction(20) > sun.refraction(60));
near('refraction at 45° is about 1 arc minute', sun.refraction(45), 58.1 / 3600, 0.002);
check('the apparent height is above the geometric one near the horizon', sun.sunAt(sun.sunEvents({ y: 2026, m: 11, d: 14 }, 44.39, -79.69).rise, 44.39, -79.69).apparent > sun.sunAt(sun.sunEvents({ y: 2026, m: 11, d: 14 }, 44.39, -79.69).rise, 44.39, -79.69).height);
near('at sunrise the geometric height is −0.833°', sun.sunAt(sun.sunEvents({ y: 2026, m: 11, d: 14 }, 44.39, -79.69).rise, 44.39, -79.69).height, -0.833, 0.02);

// ---- shadows and the light direction
near('a 45° sun gives a shadow as long as the object', sun.shadowRatio(45), 1, 1e-9);
same('no shadow ratio with the sun on the horizon', sun.shadowRatio(0), null);
near('a 10 m tree row casts about 5.8 m at 60° (a June noon)', sun.shadowLength(60, 10), 5.77, 0.02);
{
  const noon = sun.sunEvents({ y: 2026, m: 11, d: 14 }, 44.39, -79.69);
  const s = sun.sunAt(noon.noon, 44.39, -79.69), d = sun.lightDirection(s.apparent, s.azimuth);
  near('the direction is a unit vector', Math.hypot(d.x, d.y, d.z), 1, 1e-9);
  check('at noon in the north the sun is south: +z, and up', d.z > 0 && d.y > 0 && Math.abs(d.x) < 0.01, d);
  const east = sun.lightDirection(30, 90), west = sun.lightDirection(30, 270), north = sun.lightDirection(30, 0);
  check('morning sun in the east is +x, evening sun in the west is −x, north is −z', east.x > 0.8 && west.x < -0.8 && north.z < -0.8, [east, west, north]);
}

// ---- the path: every 10 minutes from sunrise to sunset
{
  const date = { y: 2026, m: 11, d: 14 }, ev = sun.sunEvents(date, 44.39, -79.69), path = sun.sunPath(date, 44.39, -79.69);
  near('the path starts at sunrise', path[0].ms, ev.rise, 1);
  check('the path steps 10 minutes and ends within 10 minutes of sunset', path.every((p, i) => i === 0 || Math.abs(p.ms - path[i - 1].ms - 10 * MIN) < 1) && ev.set - path.at(-1).ms < 10 * MIN + 1);
  check('the path climbs then falls', Math.max(...path.map(p => p.height)) > path[0].height + 10);
}
same('twelve 21sts', sun.twentyFirsts(2027).map(d => d.m + '/' + d.d).join(' '), '1/21 2/21 3/21 4/21 5/21 6/21 7/21 8/21 9/21 10/21 11/21 12/21');
// the sun's longest day at Barrie is longer than the shortest by hours, and swaps south of the equator
{
  const n = sun.twentyFirsts(2027).map(d => sun.sunEvents(d, 44.39, -79.69).daylightMinutes), s = sun.twentyFirsts(2027).map(d => sun.sunEvents(d, -33.89, -60.57).daylightMinutes);
  check('Barrie: longest day in June, shortest in December', n.indexOf(Math.max(...n)) === 5 && n.indexOf(Math.min(...n)) === 11);
  check('the Pampas: longest day in December, shortest in June', s.indexOf(Math.max(...s)) === 11 && s.indexOf(Math.min(...s)) === 5);
}

// ---- the clock
{
  const ev = sun.sunEvents({ y: 2027, m: 6, d: 21 }, 44.39, -79.69);
  same('Toronto summer time: sunrise reads on the zone clock', sun.clock(ev.rise, { zone: 'America/Toronto' }), '05:34');
  same('the same moment on a one-offset clock of −4 h', sun.clock(ev.rise, { offsetMin: -240 }), '05:34');
  same('half-hour zones come right (Punjab +5:30)', sun.clock(Date.UTC(2026, 10, 14, 0, 0), { zone: 'Asia/Kolkata' }), '05:30');
  check('with no zone it is sun time: noon is when the sun is highest', Math.abs(sun.clockParts(ev.noon, { lon: -79.69 }).hh * 60 + sun.clockParts(ev.noon, { lon: -79.69 }).mm - 720) <= 17, sun.clock(ev.noon, { lon: -79.69 }));
  same('the zone gives the farm its date', sun.farmDate(Date.UTC(2026, 10, 14, 3, 0), { zone: 'America/Toronto' }), { y: 2026, m: 11, d: 13 });
  same('a clock change: 13 March 2027 12:00 UTC is 07:00 in Toronto, 15 March is 08:00', [sun.clock(Date.UTC(2027, 2, 13, 12), { zone: 'America/Toronto' }), sun.clock(Date.UTC(2027, 2, 15, 12), { zone: 'America/Toronto' })], ['07:00', '08:00']);
  same('times are rounded to the nearest minute', sun.clock(Date.UTC(2026, 10, 14, 6, 29, 31), { offsetMin: 0 }), '06:30');
  same('an unknown zone falls back to sun time without failing', typeof sun.clock(Date.UTC(2026, 10, 14, 6), { zone: 'Not/AZone', lon: 0 }), 'string');
  check('the page says which clock it is', sun.timesAreWords({ zone: 'x' }) === 'Times are local time at the field.' && sun.timesAreWords({}).startsWith('Times are sun time'));
}

// ---- the words
{
  same('eight points', [0, 44, 90, 180, 225, 359].map(sun.compass8), ['north', 'north-east', 'east', 'south', 'south-west', 'north']);
  same('sixteen points', [22.5, 112.5, 247.5, 292.5].map(sun.compass16), ['north-north-east', 'east-south-east', 'west-south-west', 'west-north-west']);
  same('a sun under 1° reads "less than 1°", never 0°', [sun.heightWords(0.4), sun.heightWords(18.4)], ['less than 1°', '18°']);
  same('shadow words', [3.1, 1, 0.5, 40, null].map(sun.shadowWords), ['about 3 times as long as the plants', 'about as long as the plants', 'shorter than the plants', 'more than 20 times as long as the plants are tall', 'no sun shadows']);
  const o = { zone: 'America/Toronto' }, ev = sun.sunEvents({ y: 2026, m: 11, d: 14 }, 44.39, -79.69);
  check('a daytime moment names height, direction and shadow', /^\d\d:\d\d, sun \d+° up in the (south|south-east|south-west), shadows about /.test(sun.momentWords(ev.noon - 150 * MIN, 44.39, -79.69, o)), sun.momentWords(ev.noon - 150 * MIN, 44.39, -79.69, o));
  const dusk = sun.momentWords(ev.set + 10 * MIN, 44.39, -79.69, o);
  check('just after sunset it says twilight until the civil dusk', dusk.includes('the sun is down. Twilight until ') && dusk.endsWith(sun.clock(ev.civilDusk, o) + '.'), dusk);
  check('deep night says only that the sun is down', sun.momentWords(ev.set + 5 * 60 * MIN, 44.39, -79.69, o).endsWith('the sun is down.'));
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
