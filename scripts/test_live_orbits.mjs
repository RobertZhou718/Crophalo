// Crophalo's offline suite for the satellites on the home: the orbits lookup (scripts/live/orbits.py) run on the 13 answers recorded from
// CelesTrak, with its failures made by hand from them, and the pure sums and words of js/home-sats-data.js checked against the orbit library.
// RULE: never loosen a check here without a written farming reason beside it: a satellite drawn in the wrong place, or said to do what it does not, misleads. Run: node scripts/test_live_orbits.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { check, same, group, finish, tempFolder, copyOf, alter, answersIn, runLookup, contract, ROOT, FIXTURES } from './live_testlib.mjs';

const mod = rel => import(pathToFileURL(path.join(ROOT, rel)).href);
const DATA = await mod('js/home-sats-data.js');
const { json2satrec } = await mod('vendor/satellite/io.js');
const { propagate } = await mod('vendor/satellite/propagation/propagate.js');
const { gstime } = await mod('vendor/satellite/propagation/gstime.js');
const { eciToGeodetic, eciToEcf } = await mod('vendor/satellite/transforms.js');
const NOW = '2026-11-15T03:30:00Z';
const run = (folder, extra = {}) => runLookup('orbits', [], { replay: folder, now: NOW, limitS: 90, ...extra });
const recorded = answersIn(path.join(FIXTURES, 'orbits'));
const omms = recorded.map(a => JSON.parse(fs.readFileSync(a.bodyFile, 'utf8'))[0]);
const numberOf = a => +new URL(a.url).searchParams.get('CATNR');

await group('the list', async () => {
  const py = fs.readFileSync(path.join(ROOT, 'scripts', 'live', 'orbits.py'), 'utf8'), listed = [...py.matchAll(/\((\d{5}), "[^"]+"\)/g)].map(m => +m[1]);
  same('the lookup asks for the same thirteen satellites, in the same order, as the home draws', listed, DATA.SATS.map(s => s.norad));
  same('the recorded answers are the thirteen, one each, as CelesTrak sent them', recorded.map(numberOf).sort(), DATA.SATS.map(s => s.norad).sort());
  check('each recorded answer is one public SGP4 element set for its own number', omms.every((o, i) => o.NORAD_CAT_ID === numberOf(recorded[i]) && o.EPHEMERIS_TYPE === 0 && o.CLASSIFICATION_TYPE === 'U'));
  check('every satellite has its words: who runs it, what it does, what Crophalo reads it for, where it leads, its own page', DATA.SATS.every(s => s.name && s.by && /\.$/.test(s.does) && /\.$/.test(s.uses) && DATA.GO_WORDS[s.go] && /^https:\/\/(science\.nasa\.gov|www\.earthdata\.nasa\.gov|gpm\.nasa\.gov|www\.esa\.int)\//.test(s.page) && s.pageWords));
  same('the Sentinel-2 satellites are said to be ESA\'s, the rest name NASA or the agency that runs them with NASA', DATA.SATS.filter(s => /^ESA/.test(s.by)).map(s => s.name), ['Sentinel-2A', 'Sentinel-2B', 'Sentinel-2C']);
  // the owner's rule of 15 November 2026: at most four short sentences in plain words, the farmer's gain first; the instrument and its numbers wait under Show more
  const sentences = t => (t.match(/[.!?](\s|$)/g) || []).length, words = t => t.split(/\s+/).length;
  check('every card says, in at most four sentences of 15 words or fewer, what the farmer gets: it starts with "Shows"', DATA.SATS.every(s => Array.isArray(s.plain) && s.plain.length >= 2 && s.plain.length <= 4 && /^Shows /.test(s.plain[0]) && s.plain.every(t => /\.$/.test(t) && sentences(t) === 1 && words(t) <= 15)), DATA.SATS.filter(s => !s.plain?.every(t => words(t) <= 15)).map(s => s.name));
  check('the plain sentences hold no instrument name, product code, dot size or orbit number', !DATA.SATS.some(s => /MODIS|VIIRS|OLI|MSI|GMI|ECOSTRESS|HLS|IMERG|NDVI|radiometer|\d+ ?(m|km) to a dot|UTC|\bbands?\b/.test(s.plain.join(' '))), DATA.SATS.filter(s => /MODIS|VIIRS|OLI|MSI|GMI|ECOSTRESS|HLS|IMERG|NDVI|radiometer|UTC|bands?/.test(s.plain.join(' '))).map(s => s.name));
  check('each has its mark, its instrument and one more sentence for the fold; twins carry a tag', DATA.SATS.every(s => DATA.MARKS[s.look] && s.gathers && /\.$/.test(s.more)) && ['20', '21', '1', '2', '8', '9', 'A', 'B', 'C'].every(t => DATA.SATS.some(s => s.tag === t)) && new Set(DATA.SATS.map(s => s.look)).size === 8);
  // Changed on purpose: the home's credit now shows "Not made, reviewed or endorsed by NASA, ESA or NOAA." in sight, in its short line in index.html (#orbitCreditShort), so the spacecraft pictures' credit no longer repeats it
  const short = /<span id="orbitCreditShort">([\s\S]*?)<\/span> <button/.exec(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'))?.[1] ?? '';
  check('no word says NASA, ESA or NOAA made or backs Crophalo; the credit says the opposite', !DATA.SATS.some(s => /endors|approved by|partner of|official/i.test(`${s.plain.join(' ')} ${s.more}`)) && /not made, reviewed or endorsed by NASA, ESA or NOAA/i.test(short) && !/endorsed by/i.test(DATA.WORDS.craft));
  check('no new word names a satellite the app does not read', !DATA.SATS.some(s => /Aqua|Suomi|GEDI/.test(`${s.plain.join(' ')} ${s.more} ${s.gathers}`)));
  { const g = DATA.glideFrom({ x: 100, y: 200 }, { x: 300, y: 100, w: 320, h: 180 }, 112);
    same('the glide starts at the satellite\'s own point and a fifth of the size, and never larger than the end', [g.gx, g.gy, Math.round(g.gs * 1000), DATA.glideFrom({ x: 0, y: 0 }, { x: 0, y: 0, w: 10, h: 10 }, 12).gs], [100 - 460, 200 - (100 + 180 * .46), 214, 1]); }
  { const C = await import('../js/home-craft.js'), fsx = await import('node:fs');
    check('eight of the thirteen have a real picture, each with its file on disk, its credit and its description; NOAA and Sentinel-2 have none', DATA.SATS.filter(s => C.pictureOf(s)).length === 8 && DATA.SATS.every(s => { const p = C.pictureOf(s); return ['jpss', 's2'].includes(s.look) ? !p : p && fsx.existsSync(new URL('../' + p.src, import.meta.url)) && p.alt.length > 20 && /NASA/.test(p.credit) && !/NASA\/(?!JPL-Caltech)/.test(p.credit); }));
    same('Landsat 9 shows Landsat 8 and says so', [C.pictureOf(DATA.SATS.find(s => s.norad === 49260)).credit, /shown for Landsat 9/.test(C.pictureOf(DATA.SATS.find(s => s.norad === 49260)).alt)], ['Picture: Landsat 8, NASA (NASA 3D Resources model). Landsat 9 is built on the same design.', true]);
    check('every craft on the globe has a satellite-shaped mark: NOAA-20/21 and Sentinel-2 a body with two wings and a small antenna (several shapes), never a single square or rectangle', ['jpss', 's2'].every(k => (DATA.MARKS[k].d.match(/M/g) ?? []).length >= 4) && !/^M-3\.2 -3\.2h6\.4v6\.4h-6\.4z$/.test(DATA.MARKS.jpss.d) && !/^M-4\.25 -2\.25h8\.5v4\.5h-8\.5z$/.test(DATA.MARKS.s2.d));
    check('NOAA and Sentinel-2 are drawn as spacecraft (a solar wing, a body, instruments, a dish), said to be drawings and not the agencies\' pictures; no box is left', ['jpss', 's2'].every(k => /^<svg /.test(C.DRAWN[k].svg) && /^Drawing: Crophalo/.test(C.DRAWN[k].credit) && /not the agency/.test(C.DRAWN[k].credit) && /solar wing/.test(C.DRAWN[k].alt) && C.DRAWN[k].alt.length > 60 && /pattern id="cells"/.test(C.DRAWN[k].svg) && !/Wing not drawn/.test(C.DRAWN[k].svg)));
    check('the six files weigh under 70,000 bytes together', Object.values(C.PICS).reduce((n, p) => n + fsx.statSync(new URL('../' + p.src, import.meta.url)).size, 0) < 70000); }
  { const T = await import('../js/home-time.js'), G = await import('../vendor/satellite/propagation/gstime.js'), ms = Date.UTC(2026, 10, 15, 7, 42);
    check('the Earth\'s turn is the sidereal angle the orbit library uses (within 0.001 degree), and one sidereal day is one turn', Math.abs(T.gmstDeg(ms) - (G.gstime(T.julian(ms)) * 180 / Math.PI) % 360) < 0.001 && Math.abs(((T.gmstDeg(ms + 86164.0905e3) - T.gmstDeg(ms)) + 540) % 360 - 180) < 0.01);
    check('at 120 times the Earth turns once in about 12 minutes and a 100-minute orbit takes under a minute', Math.abs(86164 / T.PACE / 60 - 11.97) < 0.1 && 100 * 60 / T.PACE < 60);
    check('the Sun on 15 November is south of the equator by about 18.5 degrees, and the camera stands 32 degrees west of it in space', Math.abs(T.sunEq(ms).dec + 18.5) < 0.3 && Math.abs(((T.sunEq(ms).ra - T.cameraRa(ms)) + 360) % 360 - 32) < 1e-9);
    const cam = { lat: 22, lon: T.lonUnder(T.cameraRa(ms), ms) }, sv = T.sunView(cam, ms), len = Math.hypot(...sv);
    check('the Sun\'s direction in the picture is a unit vector, toward the eye and to the east side (the day side mostly faces the camera)', Math.abs(len - 1) < 1e-9 && sv[2] > 0.5 && sv[0] > 0.2, sv);
    check('the longitude under the camera falls as time goes on: every feature moves east across the disk', T.lonUnder(T.cameraRa(ms), ms + 6e4) < T.lonUnder(T.cameraRa(ms), ms) || T.lonUnder(T.cameraRa(ms), ms) < -179);
    check('the words: the moment and the pace; real pace says so; with motion off the present moment', T.clockWords(ms) === 'Showing 15 Nov, 07:42 UTC · real orbits, sped up 120 times' && /real orbits at real pace$/.test(T.clockWords(ms, { pace: 1 })) && /motion is off$/.test(T.clockWords(ms, { level: 'still' })) && T.nowButtonWords(120) === 'Now' && T.nowButtonWords(1) === 'Speed up');
    check('the hint says only how to read one (the clock line says the pace, once)', T.hintWords('full', 120, false) === 'Point at a satellite to see what it does.' && T.hintWords('full', 120, true) === 'Tap a satellite to see what it does.'); }
  { const M = await import('../js/descent-plan.js');
    const h = M.handoff(41.18, 1e9);
    check('the hand-off: at Mead a whole zoom 4 and a globe radius of about 865 px, where the Earth picture stays sharp it is zoom 3 and 432', h.z_h === 4 && Math.abs(h.r_h - 865) < 2 && M.handoff(41.18).z_h === 3 && Math.abs(M.handoff(41.18).r_h - 432) < 2, [h, M.handoff(41.18)]);
    check('the globe and the map are the same size where they hand over: 6,371,000 / r metres a pixel is 156,543.03 cos(lat) / 2^z', Math.abs(6371000 / h.r_h - 156543.03 * Math.cos(41.18 * Math.PI / 180) / 2 ** h.z_h) < 5);
    const lap = M.flightPlan(), ph = M.flightPlan({ phone: true }), slow = M.flightPlan({ quality: 0.7 });
    check('a flight is never over 3,200 ms (2,100 on a phone), the stretches are in order and a slow computer is shorter', lap.total <= 3200 && ph.total <= 2100 && lap.turn[1] <= lap.fall[1] && lap.fall[1] <= lap.over[0] && lap.over[1] < lap.total && slow.total < lap.total && ph.over[1] < ph.total, [lap, ph]);
    const W = await import('../js/descent-plan.js'), mead = [41.18, -96.44], at = (lat, lon, h = 705) => W.placeEcf(lat, lon).map(v => v * (1 + h / 6371.0088));
    const sky = [{ norad: 39084, name: 'Landsat 8', ecf: at(45, -96) }, { norad: 49260, name: 'Landsat 9', ecf: at(41.5, -96.3) }, { norad: 25994, name: 'Terra', ecf: at(41.18, -96.44, 300) }, { norad: 40697, name: 'Sentinel-2A', ecf: null }, { norad: 60989, name: 'Sentinel-2C', ecf: at(-30, 80) }];
    const w = W.nearestImager(sky, ...mead);
    check('the Witness is the nearest of the five picture-taking satellites (never Terra, never one with no place)', w.norad === 49260 && w.km > 700 && w.km < 760 && W.nearestImager([], ...mead) === null && W.nearestImager([{ norad: 25994, ecf: at(41, -96) }], ...mead) === null, w);
    check('the slant distance straight overhead is the height', Math.abs(W.slantKm(at(41.18, -96.44, 705), ...mead) - 705) < 0.01);
    check('the Witness words: the satellite, the distance with its thousands, the time; nothing when there is none', W.witnessWords({ name: 'Landsat 9', km: 1240.4 }, Date.UTC(2026, 10, 15, 15, 42)) === 'Nearest picture-taking satellite now: Landsat 9, 1,240 km from this field (15:42 UTC)' && W.witnessWords(null, 0) === '');
    check('the Earth turns the short way round to the place', M.shortWay(170, -170) === 190 && M.shortWay(-170, 170) === -190 && M.shortWay(10, 40) === 40 && M.shortWay(40, 10) === 10); }
  { const fsx = await import('node:fs'), pathx = await import('node:path'), root = (await import('node:url')).fileURLToPath(new URL('..', import.meta.url)), seen = new Set();
    const walk = f => { if (seen.has(f)) return; seen.add(f); const src = fsx.readFileSync(pathx.join(root, f), 'utf8'); for (const m of src.matchAll(/(?:import|export)[^'"\n;]*?from\s*['"](\.[^'"]+)['"]/g)) walk(pathx.normalize(pathx.join(pathx.dirname(f), m[1]))); };
    walk('js/home-sats.js'); const { PRELOAD: list } = await import('../js/home-orbits-ask.js');
    const vendor = [...seen].filter(f => f.startsWith('vendor/')).sort(), listed = (list ?? []).filter(f => f.startsWith('vendor/')).sort();
    check('the preload list names exactly the orbit library files the satellites import, and every file is there', (JSON.stringify(vendor) === JSON.stringify(listed) && list.every(f => fsx.existsSync(pathx.join(root, f)))), [vendor.filter(f => !listed.includes(f)), listed.filter(f => !vendor.includes(f))]); }
  check('no card names a satellite the app does not read (Aqua, Suomi NPP, GEDI)', !DATA.SATS.some(s => /Aqua|Suomi|GEDI/.test(`${s.name} ${s.does} ${s.uses}`)));
});

await group('a good answer', async () => {
  const r = await run('orbits'), a = r.answer;
  contract('good', r);
  check('all thirteen element sets are handed out, nothing missing', a.ok && a.satellites.length === 13 && a.missing.length === 0 && !('incomplete' in a), a);
  same('thirteen requests, one per satellite', [a.requests, r.asked], [13, 13]);
  check('the source and the credit name the U.S. Space Force and CelesTrak', /U\.S\. Space Force/.test(a.source) && a.credit === 'Orbits: U.S. Space Force (Space-Track.org), via CelesTrak.', [a.source, a.credit]);
  same('the data date is the newest epoch\'s day', a.data_date, '2026-11-14');
  const ter = a.satellites.find(s => s.norad === 25994);
  same('a satellite comes with its name, its epoch cut to the millisecond, when CelesTrak was asked, and its element set', [ter.name, ter.epoch, ter.asked, ter.omm.EPOCH, ter.omm.MEAN_MOTION], ['TERRA', '2026-11-14T19:41:26.217Z', '2026-11-15T03:30:00Z', '2026-11-14T19:41:26.217312', 14.6119781]);
  check('only the seventeen OMM fields are handed on', a.satellites.every(s => Object.keys(s.omm).length === 17));
  check('peak memory stays small', r.peakMB < 60, r.peakMB);
});

await group('kept sets and good manners', async () => {
  const cache = path.join(tempFolder('orbits-cache'), 'cache');
  const first = await run('orbits', { cache });
  same('the first run asks CelesTrak thirteen times', first.answer.requests, 13);
  const again = await run('orbits', { cache });
  check('a run within two hours asks CelesTrak nothing: it has nothing newer yet', again.answer.ok && again.answer.requests === 0 && again.asked === 0 && again.answer.satellites.length === 13, again.answer.requests);
  const later = await run('orbits', { cache, now: '2026-11-15T05:31:00Z' });
  same('two hours later it asks again', later.answer.requests, 13);
  // a 403 at the fifth: no more requests, the kept sets are used, and CelesTrak is not asked again for two hours
  const down = copyOf('orbits', 'down'); alter(down, a => numberOf(a) === 39574, meta => { meta.replies = [{ status: 403 }]; });
  const cut = await run(down, { cache, now: '2026-11-15T08:00:00Z' }), c = cut.answer;
  contract('a 403', cut);
  check('an answer that is not 200 stops every further request at once', c.ok && c.requests === 5 && cut.asked === 5, [c.requests, cut.asked]);
  check('the satellites not asked keep their last good sets, each with its own epoch, and the answer says they are older', c.satellites.length === 13 && c.stale === true && /could not be asked for 9 of them just now/.test(c.note), c.note);
  same('it will not ask before two hours have passed', c.next_ask, '2026-11-15T10:00:00Z');
  const quiet = await run('orbits', { cache, now: '2026-11-15T08:30:00Z' });
  check('within those two hours nothing is asked, even with CelesTrak back', quiet.answer.requests === 0 && quiet.asked === 0 && quiet.answer.stale === true, quiet.answer);
  const back = await run('orbits', { cache, now: '2026-11-15T10:01:00Z' });
  check('after them it asks again', back.answer.requests === 13 && !back.answer.stale, back.answer.requests);
});

await group('failures, in plain words', async () => {
  const none = copyOf('orbits', 'none'); alter(none, a => numberOf(a) === 25994, meta => { meta.replies = [{ status: 503 }]; });
  const first = await run(none), f = first.answer;
  contract('down at once', first, { allowMiss: true });
  check('CelesTrak down at the first request, nothing kept: a failure in plain words, not final', f.ok === false && /could not be read just now/.test(f.reason) && !f.final && first.asked === 1, f);
  const odd = copyOf('orbits', 'odd');
  alter(odd, a => numberOf(a) === 43476, (meta, body) => fs.writeFileSync(body, 'No GP data found'));
  alter(odd, a => numberOf(a) === 39084, (meta, body) => fs.writeFileSync(body, JSON.stringify([{ ...omms.find(o => o.NORAD_CAT_ID === 39084), MEAN_MOTION: 'fast' }])));
  alter(odd, a => numberOf(a) === 49260, (meta, body) => fs.writeFileSync(body, JSON.stringify([{ ...omms.find(o => o.NORAD_CAT_ID === 49260), NORAD_CAT_ID: 99999 }])));
  const r = await run(odd), a = r.answer;
  contract('odd answers', r);
  check('a set that cannot be used is left out and named with its reason; the others are all handed out', a.ok && a.satellites.length === 10 && a.missing.map(m => m.norad).join() === '43476,39084,49260' && /could not be used/.test(a.missing[1].reason) && /^3 of 13 /.test(a.incomplete), a.missing);
  check('a readable answer that holds no set does not stop the round (it was a 200)', a.requests === 13, a.requests);
  const old = copyOf('orbits', 'old');
  alter(old, a => numberOf(a) === 60989, (meta, body) => fs.writeFileSync(body, JSON.stringify([{ ...omms.find(o => o.NORAD_CAT_ID === 60989), EPOCH: new Date(Date.parse(NOW) - 16 * 864e5).toISOString().replace('Z', '') }])));
  const o = (await run(old)).answer;
  check('a set more than 14 days old is not handed out, and the answer says why', o.ok && !o.satellites.some(s => s.norad === 60989) && /more than 14 days old/.test(o.missing.find(m => m.norad === 60989)?.reason), o.missing);
  const extra = await runLookup('orbits', ['44.4', '-79.6'], { replay: 'orbits', now: NOW });
  check('the lookup takes no arguments', extra.answer.ok === false && /no arguments/.test(extra.answer.reason));
});

await group('the sums of the drawing', async () => {
  // the drawing's view is the globe shader's: a point straight below the middle of the disk is at its centre, one on the limb at its edge
  const cam = { lat: 22, lon: -58, x: 300, y: 300, r: 250 }, unit = (lat, lon, k = 1) => { const p = lat * Math.PI / 180, l = lon * Math.PI / 180; return { x: k * Math.cos(p) * Math.cos(l), y: k * Math.cos(p) * Math.sin(l), z: k * Math.sin(p) }; };
  const mid = DATA.project(cam, unit(22, -58));
  check('the point under the middle of the view is at the centre, in front', Math.abs(mid.x - 300) < 1e-9 && Math.abs(mid.y - 300) < 1e-9 && Math.abs(mid.depth - 1) < 1e-9);
  const east = DATA.project(cam, unit(0, 32));   // 90° east of the middle, on the equator: the right-hand edge, level with the middle
  check('a point 90° east sits on the right-hand edge of the disk', Math.abs(east.x - 550) < 1e-9 && Math.abs(east.depth) < 1e-9, east);
  const north = DATA.project(cam, unit(90, 0));
  check('the North Pole is above the middle, tipped towards the eye', north.y < 300 && north.depth > 0 && Math.abs(north.x - 300) < 1e-9, north);
  const behind = DATA.project(cam, unit(-22, 122, 1.1)), beside = DATA.project(cam, unit(0, 32 + 10, 1.1));
  check('a satellite on the far side inside the disk is hidden; one just past the edge is seen', DATA.hidden(cam, behind) && !DATA.hidden(cam, beside), [behind, beside]);
  const box = { w: 1280, h: 800 }, card = { w: 330, h: 300 };
  const r = DATA.cardPlace(900, 400, card, box), l = DATA.cardPlace(1200, 400, card, box), p = DATA.cardPlace(180, 120, card, { w: 375, h: 1400 });
  check('a card goes beside its satellite on the side with room, inside the screen', r.x === 922 && l.x === 1200 - 22 - 330 && r.y === 250 && l.x >= 12, [r, l]);
  check('on a phone it goes under the satellite, in the middle of the width', p.y === 142 && p.x === (375 - 330) / 2, p);
});

await group('the words', async () => {
  same('times are written in UTC, as the elements are', [DATA.clockWords(Date.parse('2026-11-14T08:49:22.988Z')), DATA.dayWords(Date.parse('2026-11-14T23:59:00Z')), DATA.stampWords(Date.parse('2026-11-15T00:01:00Z'))], ['08:49 UTC', '14 Nov 2026', '15 Nov 2026, 00:01 UTC']);
  same('the span of the epochs, on one day and over two', [DATA.spanWords(Date.parse('2026-11-14T08:49:00Z'), Date.parse('2026-11-14T20:15:00Z')), DATA.spanWords(Date.parse('2026-11-14T22:00:00Z'), Date.parse('2026-11-15T01:00:00Z'))], ['14 Nov 2026, 08:49 to 20:15 UTC', '14 Nov 2026, 22:00 UTC to 15 Nov 2026, 01:00 UTC']);
  same('ages', [DATA.ageWords(40 * 60e3), DATA.ageWords(60e3), DATA.ageWords(8 * 3600e3), DATA.ageWords(5.2 * 864e5)], ['40 minutes', '1 minute', '8 hours', '5 days']);
  same('CelesTrak\'s six digits after the second are cut to three, as a browser reads them; a day that does not exist is refused', [DATA.isoMs(DATA.epochMs('2026-11-14T08:49:22.988352')), Number.isNaN(DATA.epochMs('2026-11-31T00:00:00')), Number.isNaN(DATA.epochMs('soon'))], ['2026-11-14T08:49:22.988Z', true, true]);
  same('how old elements may be: up to 3 days fine, then a warning, after 14 days not drawn', [DATA.ageState(2 * 864e5), DATA.ageState(4 * 864e5), DATA.ageState(15 * 864e5)], ['ok', 'old', 'gone']);
  same('places and speeds', [DATA.latWords(44.44), DATA.latWords(-3.06), DATA.lonWords(-79.66), DATA.kmWords(1702.4), DATA.speedWords(7.4612)], ['44.4° N', '3.1° S', '79.7° W', '1,702 km', '7.5 km/s']);
  same('the satellites that could not be placed are counted among those still at work', [DATA.WORDS.some(1), DATA.WORDS.some(2, 12)], ['1 of 13 satellites could not be placed right now, so they are not drawn.', '2 of 12 satellites could not be placed right now, so they are not drawn.']);
});

await group('Sentinel-2A after its campaign', async () => {
  const { readAll } = await mod('js/home-sats.js');
  const answer = { ok: true, satellites: omms.map(o => ({ norad: o.NORAD_CAT_ID, omm: o })) };
  const now = await readAll(answer, Date.parse(NOW)), after = await readAll(answer, Date.parse('2027-01-02T00:00:00Z'));
  same('on the recorded day all thirteen are still at work and all are placed', [now.total, now.list.length, now.left.length], [13, 13, 0]);
  check('after 31 December 2026 Sentinel-2A is neither drawn nor counted as one that could not be placed', after.total === 12 && !after.list.some(i => i.sat.norad === 40697) && !after.left.some(l => l.sat.norad === 40697), [after.total, after.left.map(l => l.sat.name)]);
});

await group('the positions, against the orbit library', async () => {
  const t = new Date(NOW), g = gstime(t), heights = [];
  for (const o of omms) {
    const rec = json2satrec({ ...o, EPOCH: DATA.isoMs(DATA.epochMs(o.EPOCH)) }), pv = propagate(rec, t), gd = eciToGeodetic(pv.position, g), e = eciToEcf(pv.position, g);
    heights.push([o.OBJECT_NAME, gd.height, Math.abs(gd.latitude * 180 / Math.PI), o.INCLINATION, Math.hypot(e.x, e.y, e.z)]);
  }
  check('every recorded set gives a place 400 to 850 km up, as the satellites fly', heights.every(([, h]) => h > 400 && h < 850), heights.map(h => `${h[0]} ${h[1].toFixed(0)}`));
  check('no satellite goes further north or south than its orbit\'s tilt allows', heights.every(([, , lat, inc]) => lat <= Math.min(inc, 180 - inc) + 0.5), heights.map(h => `${h[0]} ${h[2].toFixed(1)}/${h[3]}`));
});

finish();
