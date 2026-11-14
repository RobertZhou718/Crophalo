// Crophalo's fixture recorder: asks the live weather services once for the answers the offline weather suite replays, and keeps each
// in scripts/fixtures/ as the service sent it, plus one "_recorded" field (the UTC day and the address asked). It never writes over
// a fixture unless run with --again, so the tests stay fixed. Pure: recordPlan(). Checked by scripts/test_weather.mjs (the plan, the fixtures).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanPlace, powerUrl, era5Url, era5LandUrl, forecastUrl, waitSeconds } from '../js/data.js';

// Four places with very different weather: a cold, wet one, a corn-belt one, a dry steppe and a hot irrigated valley.
export const FIXTURE_PLACES = {
  barrie: { name: 'Barrie, Ontario', lat: 44.4, lon: -79.78 }, iowa: { name: 'Ames, Iowa', lat: 42.03, lon: -93.62 },
  konya: { name: 'Konya, Türkiye', lat: 37.87, lon: 32.48 }, valley: { name: 'Fresno, California', lat: 36.75, lon: -119.77 },
};
export const FIXTURE_KINDS = { power: powerUrl, era5: era5Url, era5land: era5LandUrl, forecast: forecastUrl };   // the very addresses the app asks
export const fixtureName = (kind, place) => `${kind}_${place}.json`;
// What a run would ask for: every fixture that is not there yet, or all of them with --again. One place at a time.
export function recordPlan(have, again = false, now = Date.now()) {
  const plan = [];
  for (const [place, spot] of Object.entries(FIXTURE_PLACES)) for (const [kind, address] of Object.entries(FIXTURE_KINDS)) {
    const file = fixtureName(kind, place);
    if (again || !have.includes(file)) plan.push({ file, kind, place, url: address(cleanPlace(spot.lat, spot.lon), now) });
  }
  return plan;
}

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const AGENT = 'Crophalo/1 (crop rotation planner; records its test fixtures once)';   // a plain, honest name; nothing personal is sent
const PAUSE = 3000, sleep = ms => new Promise(done => setTimeout(done, ms));
async function ask(url) {   // one request at a time; a "too many requests" answer is waited out for as long as it says
  for (let tries = 0; tries < 3; tries++) {
    const res = await fetch(url, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(90e3) });
    if (res.status === 429) { const secs = waitSeconds(res.headers.get('retry-after')); console.log(`  asked to wait: ${secs} s`); await sleep(secs * 1000); continue; }
    if (!res.ok) throw new Error(`the service answered ${res.status}`);
    const head = name => (res.headers.get(name) === null ? NaN : Number(res.headers.get(name)));   // a header that was not sent is unknown, not 0
    return { json: await res.json(), left: head('x-ratelimit-remaining'), reset: head('x-ratelimit-reset') };
  }
  throw new Error('the service still asked to wait after three tries');
}
async function main() {
  const again = process.argv.includes('--again');
  fs.mkdirSync(DIR, { recursive: true });
  const plan = recordPlan(fs.readdirSync(DIR), again), kept = Object.keys(FIXTURE_PLACES).length * Object.keys(FIXTURE_KINDS).length - plan.length;
  if (kept) console.log(`${kept} fixture${kept === 1 ? '' : 's'} already recorded and left as ${kept === 1 ? 'it is' : 'they are'} (run with --again to record anew).`);
  for (const [i, step] of plan.entries()) {
    if (i) await sleep(PAUSE);
    const began = Date.now(), { json, left, reset } = await ask(step.url);
    const out = { _recorded: { date: new Date(began).toISOString().slice(0, 10), address: step.url }, ...json };
    fs.writeFileSync(path.join(DIR, step.file), JSON.stringify(out));
    console.log(`recorded ${step.file}  (${Math.round(fs.statSync(path.join(DIR, step.file)).size / 1024)} KB, ${Date.now() - began} ms)`);
    if (Number.isFinite(left) && left < 300 && Number.isFinite(reset)) {   // the free service counts a long record as many calls: let its minute run out
      const secs = Math.min(65, Math.max(1, Math.ceil(reset - Date.now() / 1000) + 1));
      console.log(`  ${Math.round(left)} calls left this minute: waiting ${secs} s`); await sleep(secs * 1000);
    }
  }
  console.log(plan.length ? `${plan.length} recorded.` : 'Nothing to record.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(`Could not record: ${e?.message || e}`); process.exit(1); });
