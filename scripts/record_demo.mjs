// Records the two weather answers of the Ontario demo field into scripts/fixtures/, so the suites run with no network:
//   power_<name>.json     NASA POWER daily record (the address js/data.js builds, powerUrl), with "_recorded": { date, address }
//   era5land_<name>.json  the ERA5-Land coldest-night record from Open-Meteo (the address js/data.js builds, era5LandUrl)
// What it records is played back by scripts/test_engine.mjs (the Ontario walkthrough). Run by hand, live: node scripts/record_demo.mjs [name lat lon]
/*
 * height_<name>.json    the field's own height, NASA SRTM 30 m through OpenTopoData, for js/data.js's height rule
 * Each answer is checked with js/data.js's own checks before it is written; a faulty answer is never kept.
 * Three requests in all, one to each service, with the honest User-Agent below. A service that fails is asked once, not again;
 * an answer already recorded today for the same address is used again.
 */
import fs from 'node:fs';
import { cleanPlace, powerUrl, era5LandUrl, powerProblem, backupProblem, buildSeries, seriesProblem, coldFromDaily, heightShift, HEIGHT_FROM } from '../js/data.js';

const [name = 'oxford', latText = '43.13', lonText = '-80.75'] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(name)) { console.error('The name must be lower-case letters, digits or dashes.'); process.exit(1); }
const place = cleanPlace(Number(latText), Number(lonText));
if (place.reason) { console.error(place.reason); process.exit(1); }
const UA = 'Crophalo/1.0 (crop-rotation comparison for farmers; live data lookup)';
const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
const out = file => new URL(`./fixtures/${file}`, import.meta.url);

async function ask(url, limitMs) {
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), limitMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: stop.signal });
    if (!res.ok) throw new Error(`status ${res.status}${res.headers.get('retry-after') ? `, asked to wait ${res.headers.get('retry-after')} s` : ''}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

// An answer already recorded today for the same address is used again, not asked for a second time.
const kept = (file, url) => { try { const j = JSON.parse(fs.readFileSync(out(file), 'utf8')); return j._recorded?.date === day && j._recorded?.address === url ? j : null; } catch { return null; } };
const keep = (file, url, json) => fs.writeFileSync(out(file), JSON.stringify({ _recorded: { date: day, address: url }, ...json }));
const power = powerUrl(place, now), era5land = era5LandUrl(place, now);
let P = kept(`power_${name}.json`, power);
if (!P) {
  P = await ask(power, 90e3);
  const fault = powerProblem(P, place) || seriesProblem(buildSeries(P, place), 'NASA POWER');
  if (fault) { console.error(`NASA POWER: ${fault}. Nothing written.`); process.exit(1); }
  keep(`power_${name}.json`, power, P);
}
let E = kept(`era5land_${name}.json`, era5land), eWhy = '';
if (!E) {
  try {
    E = await ask(era5land, 90e3);
    const fault = backupProblem(E, place, 'ERA5-Land') || (coldFromDaily(E) ? '' : 'ERA5-Land has too few years for this place');
    if (fault) { eWhy = fault; E = null; } else keep(`era5land_${name}.json`, era5land, E);
  } catch (e) { eWhy = `ERA5-Land (Open-Meteo) did not answer: ${e.message}`; E = null; }   // asked once; never again in a loop
}
// The field's own height: NASA SRTM (30 m), read through the open OpenTopoData service, one point.
const heightUrl = `https://api.opentopodata.org/v1/srtm30m?locations=${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
let H = kept(`height_${name}.json`, heightUrl), hWhy = '';
if (!H) {
  try {
    H = await ask(heightUrl, 30e3);
    const r = H?.results?.[0];
    if (H?.status !== 'OK' || !Number.isFinite(r?.elevation) || Math.abs(r.location.lat - place.lat) > 1e-3 || Math.abs(r.location.lng - place.lon) > 1e-3) { hWhy = 'the height service sent an answer that is not the height of this spot'; H = null; }
    else keep(`height_${name}.json`, heightUrl, H);
  } catch (e) { hWhy = `the height service did not answer: ${e.message}`; H = null; }
}

const S = buildSeries(P, place);
console.log(`power_${name}.json: ${S.days.length} days, ${S.days[0]} to ${S.through}, rain record ${S.rainSource}, NASA square height ${S.cellElev} m`);
if (E) { const cold = coldFromDaily(E); console.log(`era5land_${name}.json: coldest night of a normal winter ${cold.night.toFixed(1)} °C over ${cold.years} years, through ${cold.through}`); }
else console.log(`era5land_${name}.json: NOT recorded (${eWhy}). The coldest night then rests on NASA alone, and says so.`);
if (H) {
  const field = H.results[0].elevation, dz = heightShift(field, S.cellElev);
  console.log(`height_${name}.json: field height ${field} m (NASA SRTM 30 m); NASA square ${S.cellElev} m; difference ${(field - S.cellElev).toFixed(1)} m: ${dz ? `temperatures moved for ${dz.toFixed(0)} m` : `under ${HEIGHT_FROM} m, so no height correction (js/data.js heightShift)`}`);
} else console.log(`height_${name}.json: NOT recorded (${hWhy}). Without the field's height no correction is made (js/data.js heightShift gives 0).`);
