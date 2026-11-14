// Crophalo's offline suite for the source notes and the "i" button's card: every note is complete and plain, NASA is said once and only for NASA, the markup is safe and the card sits inside the screen.
// RULE: never loosen a check here without a written farming reason beside it. A source named wrongly would be shown to a farmer, and to a judge, as the origin of a figure. Run: node scripts/test_sources.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
let passed = 0, failed = 0;
const brief = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 300 ? s.slice(0, 300) + '…' : s; };
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${brief(detail)})` : ''}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${brief(got)}, wanted ${brief(want)}`);
const ROOT = path.resolve(process.env.CROPHALO_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const load = f => import(pathToFileURL(path.join(ROOT, 'js', f)).href);
const S = await load('sources.js'), I = await load('srci.js');

// ---- every note is complete and plain
const KEYS = Object.keys(S.SOURCES);
for (const key of ['power', 'gpm', 'merra2', 'smap', 'gibs', 'forecast', 'era5', 'era5land', 'soilgrids', 'fao', 'mapspam', 'esri', 'osm'])
  check(`there is a note for ${key}`, KEYS.includes(key));
for (const key of KEYS) {
  const n = S.SOURCES[key];
  same(`${key}: exactly the fields of a note`, Object.keys(n).sort(), [...S.SOURCE_FIELDS].sort());
  check(`${key}: every field says something`, S.SOURCE_FIELDS.every(f => f === 'nasa' ? typeof n.nasa === 'boolean' : typeof n[f] === 'string' && n[f].trim().length > (f === 'org' ? 1 : 8)), n);
  check(`${key}: the link is a plain https address`, /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(n.url), n.url);
  check(`${key}: the heading names the source, not what it is not`, !/\bnot nasa\b|\bnon-nasa\b|\bno nasa\b/i.test(JSON.stringify(n)), n.name);
  check(`${key}: NASA is the solid "i" only when NASA runs it`, n.nasa === /^NASA\b/.test(n.name) && (n.org === 'NASA') === n.nasa, [n.org, n.name, n.nasa]);
  check(`${key}: the "run by" line holds no full stop (the card adds it)`, !/\.$/.test(n.who), n.who);
  check(`${key}: short sentences in plain words (no sentence over 60 words)`, [n.what, n.talk].every(t => t.split(/(?<=[.!?])\s+/).every(s => s.split(/\s+/).length <= 60)), n.key);
  const old = ['Tur', 'key'].join('');
  check(`${key}: the country is never written the English way`, !JSON.stringify(n).includes(old));
}
same('the sources of the walkthrough: NASA ones are solid, the rest are outlined', ['power', 'gpm', 'merra2', 'smap', 'gibs'].map(k => S.SOURCES[k].nasa).concat(['forecast', 'era5', 'soilgrids', 'fao', 'mapspam', 'esri', 'osm'].map(k => S.SOURCES[k].nasa)), [true, true, true, true, true, false, false, false, false, false, false, false]);
check('SMAP is described as one value for a square of about 9 km, not a picture inside the field', /9 km/.test(S.SOURCES.smap.what) && /not what is inside your field/.test(S.SOURCES.smap.talk));
check('the SMAP note says the figure arrives days after the day it describes', /two to three days/.test(S.SOURCES.smap.talk));
check('SoilGrids is called a rough guide, never a soil test', /rough guide, not a soil test/.test(S.SOURCES.soilgrids.talk));

// ---- the button
const b = I.srcButton('power', 'Newest day: 12 November 2026');
check('a NASA figure gets the solid "i"', /class="srci nasa"/.test(b), b);
check('an outside figure gets the outlined "i", with its own name in the label', /class="srci"/.test(I.srcButton('forecast')) && /Open-Meteo forecast/.test(I.srcButton('forecast')));
check('the button says what it opens and is reachable', /aria-haspopup="dialog"/.test(b) && /aria-expanded="false"/.test(b) && /^<button type="button"/.test(b) && /aria-label="Where this comes from: NASA POWER"/.test(b));
same('a key without a note gets no button at all', [I.srcButton('nope'), I.srcButton([]), I.srcButton(undefined), I.srcButton('toString')], ['', '', '', '']);
check('one NASA source among several makes the "i" solid', /srci nasa/.test(I.srcButton(['forecast', 'smap'])));
check('the same key twice is one source', (I.srcButton(['power', 'power']).match(/data-src="power"/g) || []).length === 1);
{ const hostile = I.srcButton('power', '"><img src=x onerror=alert(1)>'); check('words with marks in them cannot break the markup: no raw tag, no raw quote, the marks are escaped', !/<img|<script/i.test(hostile) && /data-note="&quot;&gt;&lt;img/.test(hostile), hostile); }

// ---- the card
const card = I.cardHtml(['forecast', 'power'], 'Newest day: 12 November 2026');
check('the NASA tag comes first, then the other organisation', card.indexOf('src nasa">NASA') > -1 && card.indexOf('NASA') < card.indexOf('Open-Meteo'));
check('"For this figure" comes before the sources', card.indexOf('For this figure') > -1 && card.indexOf('For this figure') < card.indexOf('NASA POWER'));
check('the NASA source is described before the other', card.indexOf('<h4>NASA POWER') < card.indexOf('<h4>Open-Meteo forecast'));
check('each source has its plain line, who runs it, "More about it" with how to explain it, and a link that opens in a new tab safely', ['Run by', 'More about it', 'How to explain it', 'Visit the source (opens in a new tab)', 'rel="noopener noreferrer"', 'target="_blank"'].every(t => card.includes(t)));
check('with no note there is no "For this figure" line', !I.cardHtml('power').includes('For this figure'));
check('a figure from a non-NASA source never carries the NASA tag', !/src nasa/.test(I.cardHtml('forecast')));
check('there is a close button with a name', /<button type="button" class="srcp-x" aria-label="Close">/.test(card));

// ---- where the card goes
const near = (name, a, w) => same(name, [a.left, a.top, a.width], w);
near('below the button when it fits', I.cardPlace({ left: 300, top: 100, w: 24, h: 24 }, { w: 1280, h: 800 }, { w: 320, h: 400 }), [152, 132, 320]);
near('above the button when below does not fit', I.cardPlace({ left: 300, top: 700, w: 24, h: 24 }, { w: 1280, h: 800 }, { w: 320, h: 400 }), [152, 292, 320]);
near('kept inside the screen at the left edge, and as wide as a 320 px phone allows', I.cardPlace({ left: 5, top: 100, w: 24, h: 24 }, { w: 320, h: 700 }, { w: 296, h: 300 }), [12, 132, 296]);
near('and at the right edge', I.cardPlace({ left: 1270, top: 100, w: 24, h: 24 }, { w: 1280, h: 800 }, { w: 320, h: 300 }), [948, 132, 320]);
check('a card taller than the screen still starts inside it', I.cardPlace({ left: 600, top: 400, w: 24, h: 24 }, { w: 1280, h: 500 }, { w: 320, h: 900 }).top >= 12);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
