// Crophalo's suite for the NASA satellite picture of the map (js/nasabase.js): real DescribeDomains answers, the tile of a place, the clear / cloudy / empty verdict, the walk back through the days,
// the least cloudy fallback, a tile that does not come, and every sentence. RULE: never loosen a check here without a written farming reason beside it (a cloudy picture drawn on must never pass for clear).
import { D, J, domains } from './gibs_fixtures.mjs';
import { parseDomains } from '../js/gibs.js';
import { tileOf, verdict, choose, hlsTileUrl, hlsTemplate, trueTemplate, hlsWords, trueWords, creditWords, hlsDomainsUrl, trueDomainsUrl, stillUrl, blueTemplate, eoxTemplate, aerialTemplate, AERIAL_MIN_ZOOM, AERIAL_NATIVE, AERIAL_HOST, clearCredit, EOX_HOST, CLEAR_FAR_MAX, CLEAR_NEAR_MIN, CLEAR_NEAR_NATIVE, HLS, SAYS, CREDIT, TRIES, MAX_DAYS } from '../js/nasabase.js';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
const ranges = { S30: parseDomains(domains(HLS.S30.gibs)), L30: parseDomains(domains(HLS.L30.gibs)) };
const TODAY = D('20261115'), OXFORD = { lat: 43.13, lon: -80.75 };

same('Oxford County is tile 1503 down, 1129 across at the deepest HLS zoom (12)', tileOf(OXFORD.lat, OXFORD.lon), { z: 12, x: 1129, y: 1503 });
same('the poles and the date line stay inside the grid', [tileOf(90, 180), tileOf(-90, -180)], [{ z: 12, x: 4095, y: 0 }, { z: 12, x: 0, y: 4095 }]);
check('the real answers carry the recorded days and the list ends before today', ranges.S30.length > 5 && ranges.L30.length > 5 && ranges.S30.at(-1).to < TODAY);
check('the tile address names the layer, the day, the grid and z/y/x of the tile', hlsTileUrl(HLS.S30, D('20261030'), tileOf(OXFORD.lat, OXFORD.lon)) === `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/${D('20261030')}/GoogleMapsCompatible_Level12/12/1503/1129.png`);
check('the templates carry the day and the tile', hlsTemplate(HLS.L30).includes('{time}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png') && /MODIS_Terra_CorrectedReflectance_TrueColor\/default\/\{time\}\/GoogleMapsCompatible_Level9\/\{z\}\/\{y\}\/\{x\}\.jpg$/.test(trueTemplate));
check('the dates are asked of the HLS grid and of the MODIS grid', hlsDomainsUrl(HLS.S30).includes('TILEMATRIXSET=GoogleMapsCompatible_Level12') && trueDomainsUrl().includes('LAYER=MODIS_Terra_CorrectedReflectance_TrueColor'));

// the verdict: a farmer must never be shown cloud as ground
same('all picture, little white: clear', verdict({ n: 100, empty: 0, bright: 5 }).state, 'clear');
same('a quarter of the picture white: cloudy', verdict({ n: 100, empty: 0, bright: 30 }).state, 'cloudy');
same('a fifth missing: cloudy (not clear)', verdict({ n: 100, empty: 25, bright: 0 }).state, 'cloudy');
same('half or more missing: empty', verdict({ n: 100, empty: 60, bright: 0 }).state, 'empty');
same('the nothing tile is empty', verdict({ n: 1, empty: 1, bright: 0 }).state, 'empty');
same('no stats is empty, never clear', verdict(null).state, 'empty');

// the walk: a stand-in for the network, one answer for each day and satellite
const CLEAR = { n: 100, empty: 0, bright: 2 }, CLOUD = { n: 100, empty: 0, bright: 60 }, NONE = { n: 1, empty: 1, bright: 0 };
const stub = answers => { const calls = []; return { calls, look: async url => { const day = /default\/(\d{4}-\d{2}-\d{2})\//.exec(url)[1], fam = url.includes('HLS_S30') ? 'S30' : 'L30'; calls.push(`${day} ${fam}`); const a = answers[`${day} ${fam}`] ?? answers[day] ?? NONE; if (a === 'throw') throw new Error('status 500'); return a; } }; };
const run = async (answers, extra = {}) => { const net = stub(answers); return { got: await choose({ ranges, ...OXFORD, today: TODAY, net, ...extra }), net }; };
const NEWEST = ranges.S30.at(-1).to;
{
  const r = await run({ [NEWEST]: CLEAR });
  same('the newest listed day is clear: it is the pick, after one day looked at', [r.got.ok, r.got.day, r.got.state, r.got.tried], [true, NEWEST, 'clear', 1]);
}
{
  const r = await run({ [`${D('20261106')} S30`]: CLOUD, [`${D('20261106')} L30`]: CLEAR });
  check('Sentinel-2 cloudy and Landsat clear the same day: Landsat is the pick (the day after, only Sentinel-2 has a picture listed and it is empty)', r.got.ok && r.got.day === D('20261106') && r.got.layer === 'L30' && r.got.state === 'clear', r.got);
}
{
  const r = await run({ [D('20261102')]: CLEAR });
  check('days with no picture over the field are stepped over until a clear one (they cost no look)', r.got.ok && r.got.day === D('20261102') && r.got.tried <= TRIES, r.got);
  const r2 = await run({ [D('20261020')]: CLEAR });
  check('a clear day two to three weeks back is still found when every day since had no picture there', r2.got.ok && r2.got.day === D('20261020'), r2.got);
}
{
  const r = await run({});
  same('three weeks of nothing: no picture, with a reason', [r.got.ok, typeof r.got.why], [false, 'string']);
  check('and it stopped after three weeks (no more than two tiles a day)', r.net.calls.length <= MAX_DAYS * 2, r.net.calls);
}
{
  const r = await run({ [D('20261105')]: { n: 100, empty: 0, bright: 50 }, [D('20261103')]: { n: 100, empty: 0, bright: 30 }, [D('20261104')]: CLOUD });
  check('only cloudy days: the least cloudy one is the pick, said to be cloudy', r.got.ok && r.got.state === 'cloudy' && r.got.day === D('20261103'), r.got);
}
{
  const r = await run({ [`${NEWEST} S30`]: 'throw', [D('20261106')]: CLEAR });
  check('a tile that does not come is skipped, not taken for a picture', r.got.ok && r.got.day === D('20261106'), r.got);
}
{
  const r = await run({ [D('20261101')]: CLEAR }, { from: D('20261104') });
  check('"Earlier" starts at a given day and goes back from there', r.got.ok && r.got.day === D('20261101'), r.got);
}
{
  const r = await run({ [D('20261101')]: CLEAR }, { from: null, ranges: { S30: [], L30: [] } });
  same('no days listed at all: no picture', [r.got.ok], [false]);
}

// the words
same('the sentence is the owner\'s: the day, newest clear day, the size, edges approximate', hlsWords({ ok: true, layer: 'S30', day: D('20261105'), state: 'clear' }), `NASA HLS picture, ${J(5, 'November', 2026)} (newest clear day), 30 m: edges are approximate`);
same('an earlier pick says it is an earlier day', hlsWords({ ok: true, layer: 'S30', day: D('20261101'), state: 'clear', earlier: true }), `NASA HLS picture, ${J(1, 'November', 2026)} (an earlier clear day), 30 m: edges are approximate`);
check('a cloudy pick says so', /partly cloudy/.test(hlsWords({ ok: true, layer: 'L30', day: D('20261105'), state: 'cloudy' })));
same('the coarse picture is named with its day', trueWords(D('20261114')), 'NASA MODIS picture (250 m), 14 November 2026');
same('the credit names both, with their days', creditWords({ ok: true, layer: 'S30', day: D('20261105') }, D('20261114')), `HLS Sentinel-2 30 m, ${J(5, 'November', 2026)}; MODIS Terra 250 m, 14 November 2026`);
same('the credit starts with NASA GIBS / Worldview', CREDIT, 'Imagery: NASA GIBS / Worldview');
check('every sentence is plain and has no Esri', Object.values(SAYS).every(t => typeof t === 'string' && t.length > 10 && !/Esri|arcgis|\bAPI\b|\bundefined\b/i.test(t)));
const still = stillUrl({ layer: HLS.S30.gibs, day: D('20261105'), box: { w: -80.8, s: 43.1, e: -80.7, n: 43.16 }, width: 640, height: 360, format: 'image/png' });
check('a still picture is a WMS GetMap with latitude first, the layer, the day and the size', /^https:\/\/gibs\.earthdata\.nasa\.gov\/wms\/epsg4326\/best\/wms\.cgi\?/.test(still) && still.includes('BBOX=43.10000%2C-80.80000%2C43.16000%2C-80.70000') && still.includes(`TIME=${D('20261105')}`) && still.includes('WIDTH=640') && still.includes('HEIGHT=360') && !/esri|arcgis|token|key/i.test(still), still);

// ---- the clean base: Blue Marble far, Sentinel-2 cloudless 2016 by EOX close; no date in either address
check('far (zoom 0 to 8) the base is NASA Blue Marble from GIBS, no date in the address', blueTemplate === 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg' && CLEAR_FAR_MAX === 8, blueTemplate);
check('close (zoom 9 and nearer) it is the 2016 cloudless layer only, and never a later year (those are non-commercial)', eoxTemplate === 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg' && !/s2cloudless-20|2017|2018|2019|202\d/.test(eoxTemplate) && EOX_HOST === 'tiles.maps.eox.at' && CLEAR_NEAR_MIN === 9 && CLEAR_NEAR_NATIVE === 14, eoxTemplate);
check('the two layers meet with no gap and no overlap in zoom', CLEAR_FAR_MAX + 1 === CLEAR_NEAR_MIN);
check('the credit follows the zoom', clearCredit(8) === 'Imagery: NASA Blue Marble (NASA GIBS)' && /^Imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH \(contains modified Copernicus Sentinel data 2016\), CC BY 4\.0$/.test(clearCredit(9)));
check('the clean base names no Esri address', !/esri|arcgis/i.test(blueTemplate + eoxTemplate + clearCredit(3) + clearCredit(12)));
check('zoom 13 and nearer the USGS aerial photographs (The National Map, USGS Imagery Only) lie over the Sentinel-2 tiles, z/y/x, real photographs to zoom 16', aerialTemplate === 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}' && AERIAL_MIN_ZOOM === 13 && AERIAL_NATIVE === 16 && AERIAL_HOST === 'basemap.nationalmap.gov', aerialTemplate);
check('the corner names what really shows close up: USGS alone, both, or Sentinel-2 alone', clearCredit(15, 'usgs') === 'Imagery: USDA, USGS The National Map: Orthoimagery' && /^Imagery: USDA, USGS The National Map: Orthoimagery; Sentinel-2 cloudless 2016 by EOX IT Services GmbH .*CC BY 4\.0$/.test(clearCredit(15, 'both')) && clearCredit(15, 'none') === clearCredit(12) && clearCredit(12, 'usgs') === clearCredit(12) && clearCredit(5, 'usgs') === clearCredit(5));
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
