// Records fresh answers of the US Naval Observatory's public data service for the sun and moon tests:
// sunrise, noon and sunset (the "oneday" service) and the sun's and moon's height and direction (the "celnav" service),
// at six places on four dates. Writes scripts/fixtures/usno.json with the moment of recording. A few polite calls with a pause between.
// Run: node scripts/record_usno.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'fixtures', 'usno.json');
const AGENT = { 'User-Agent': 'Crophalo' };
const BASE = 'https://aa.usno.navy.mil/api';

const PLACES = [
  { id: 'barrie', name: 'Barrie, Ontario', lat: 44.39, lon: -79.69, zone: 'America/Toronto' },
  { id: 'iowa', name: 'Ames, Iowa', lat: 42.03, lon: -93.62, zone: 'America/Chicago' },
  { id: 'konya', name: 'Konya, Türkiye', lat: 37.87, lon: 32.48, zone: 'Europe/Istanbul' },
  { id: 'punjab', name: 'Ludhiana, Punjab', lat: 30.9, lon: 75.85, zone: 'Asia/Kolkata' },
  { id: 'pampas', name: 'Pergamino, the Pampas', lat: -33.89, lon: -60.57, zone: 'America/Argentina/Buenos_Aires' },
  { id: 'tromso', name: 'Tromsø, Norway', lat: 69.65, lon: 18.96, zone: 'Europe/Oslo' },
];
const DATES = ['2026-11-14', '2026-12-21', '2027-03-20', '2027-06-21'];
const CELNAV_HOURS_UTC = ['03:00:00', '09:00:00', '15:00:00', '21:00:00'];

// The place's UTC offset in hours on a date at noon (summer time included), the figure the service wants as "tz".
function offsetHours(zone, date) {
  const at = new Date(`${date}T12:00:00Z`);
  const p = {}; for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(at)) p[x.type] = Number(x.value);
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at.getTime()) / 3600000;
}
const pause = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: AGENT, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
      console.log(`  ${r.status} for ${url.replace(BASE, '')}`);
    } catch (e) { console.log(`  ${e.message} for ${url.replace(BASE, '')}`); }
    await pause(2000 * attempt);
  }
  throw new Error(`no answer for ${url}`);
}

const cases = [];
for (const place of PLACES) {
  for (const date of DATES) {
    const tz = offsetHours(place.zone, date);
    const day = await get(`${BASE}/rstt/oneday?date=${date}&coords=${place.lat},${place.lon}&tz=${tz}`);
    await pause(400);
    const sun = Object.fromEntries((day.properties.data.sundata || []).map(r => [r.phen, r.time]));   // local clock "HH:MM", at the offset asked for
    const samples = [];
    for (const time of CELNAV_HOURS_UTC) {
      const c = await get(`${BASE}/celnav?date=${date}&time=${time}&coords=${place.lat},${place.lon}&tz=0`);
      await pause(400);
      const body = Object.fromEntries(c.properties.data.map(o => [o.object, o.almanac_data]));
      samples.push({ utc: `${date}T${time.slice(0, 5)}:00Z`, sun: body.Sun && { height: body.Sun.hc, azimuth: body.Sun.zn, declination: body.Sun.dec }, moon: body.Moon && { height: body.Moon.hc, azimuth: body.Moon.zn, declination: body.Moon.dec } });
    }
    cases.push({ place: place.id, name: place.name, lat: place.lat, lon: place.lon, date, tzHours: tz, rise: sun.Rise ?? null, noon: sun['Upper Transit'] ?? null, set: sun.Set ?? null, civilBegin: sun['Begin Civil Twilight'] ?? null, civilEnd: sun['End Civil Twilight'] ?? null, samples });
    console.log(`${place.id} ${date}: rise ${sun.Rise ?? '-'} noon ${sun['Upper Transit'] ?? '-'} set ${sun.Set ?? '-'}`);
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ source: 'US Naval Observatory, aa.usno.navy.mil/api (rstt/oneday and celnav)', recordedAt: new Date().toISOString(), cases }, null, 1) + '\n');
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${cases.length} cases`);
