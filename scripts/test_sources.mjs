// Crophalo's offline suite for the source notes, the "i" button's card and the Data page: every note is complete and plain, NASA is said once and only for NASA, the markup is safe, the card sits
// inside the screen, and the Data page puts every note on three tabs with a filter, each with its "Visit" link and a "Show more".
// RULE: never loosen a check here without a written farming reason beside it. A source named wrongly would be shown to a farmer, and to a judge, as the origin of a figure. Run: node scripts/test_sources.mjs
import path from 'node:path';
import fsx from 'node:fs';
import { flagged } from './wordguard.mjs';
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
for (const key of ['power', 'gpm', 'merra2', 'smap', 'gibs', 'forecast', 'era5', 'era5land', 'soilgrids', 'fao', 'mapspam', 'osm'])   // no 'esri' any more: the home and My farm now show NASA's own pictures, so no part of the app asks Esri (the farm paper: the Esri photo service is no longer named in My farm)
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
same('the sources of the walkthrough: NASA ones are solid, the rest are outlined', ['power', 'gpm', 'merra2', 'smap', 'gibs'].map(k => S.SOURCES[k].nasa).concat(['forecast', 'era5', 'soilgrids', 'fao', 'mapspam', 'osm'].map(k => S.SOURCES[k].nasa)), [true, true, true, true, true, false, false, false, false, false, false]);   // no Esri note: nothing asks Esri now
check('SMAP is described as one value for a cell of a 9 km grid, not a picture inside the field, and not as a square', /9 km grid/.test(S.SOURCES.smap.what) && /not what is inside your field/.test(S.SOURCES.smap.talk) && /narrower and taller than a square/.test(S.SOURCES.smap.talk));
check('the SMAP note says the figure arrives days after the day it describes and can be replaced after reprocessing', /a few days after the day it describes/.test(S.SOURCES.smap.talk) && /reprocesses/.test(S.SOURCES.smap.talk));
check('SoilGrids is called a rough guide, never a soil test', /rough guide, not a soil test/.test(S.SOURCES.soilgrids.talk));

// ---- the button
const b = I.srcButton('power', 'Newest day: 14 November 2026');
check('a NASA figure gets the solid "i"', /class="srci nasa"/.test(b), b);
check('an outside figure gets the outlined "i", with its own name in the label', /class="srci"/.test(I.srcButton('forecast')) && /Open-Meteo forecast/.test(I.srcButton('forecast')));
check('the button says what it opens and is reachable', /aria-haspopup="dialog"/.test(b) && /aria-expanded="false"/.test(b) && /^<button type="button"/.test(b) && /aria-label="Where this comes from: NASA POWER"/.test(b));
same('a key without a note gets no button at all', [I.srcButton('nope'), I.srcButton([]), I.srcButton(undefined), I.srcButton('toString')], ['', '', '', '']);
check('one NASA source among several makes the "i" solid', /srci nasa/.test(I.srcButton(['forecast', 'smap'])));
check('the same key twice is one source', (I.srcButton(['power', 'power']).match(/data-src="power"/g) || []).length === 1);
{ const hostile = I.srcButton('power', '"><img src=x onerror=alert(1)>'); check('words with marks in them cannot break the markup: no raw tag, no raw quote, the marks are escaped', !/<img|<script/i.test(hostile) && /data-note="&quot;&gt;&lt;img/.test(hostile), hostile); }

// ---- the card
const card = I.cardHtml(['forecast', 'power'], 'Newest day: 14 November 2026');
check('the NASA tag comes first, then the other organisation', card.indexOf('src nasa">NASA') > -1 && card.indexOf('NASA') < card.indexOf('Open-Meteo'));
check('"For this figure" comes before the sources', card.indexOf('For this figure') > -1 && card.indexOf('For this figure') < card.indexOf('NASA POWER'));
// Changed on purpose: the source card's names are h3 now (the one-page report's headings: its parts are h2 and h3, js/srci.js and css/sources.css), so the order is read on h3
check('the NASA source is described before the other', card.indexOf('<h3>NASA POWER') > -1 && card.indexOf('<h3>NASA POWER') < card.indexOf('<h3>Open-Meteo forecast'));
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
// ---- the Data page's line and the citation page
{
  const fs = await import('node:fs');
  check('the Data page line says NASA data is used and NASA does not stand behind Crophalo', /NASA POWER/.test(S.NASA_LINE) && /SMAP/.test(S.NASA_LINE) && /not made, reviewed or endorsed by NASA/.test(S.NASA_LINE));
  const doc = fs.readFileSync(path.join(ROOT, S.NASA_CREDIT_PAGE), 'utf8');
  check('the citation page exists and names both NASA datasets with their citation text', /NASA POWER/.test(doc) && /SPL4SMGP/.test(doc) && /10\.5067\/T5RUATAQREF8/.test(doc) && /The data was obtained from the POWER Project's Daily \d+\.\d+\.\d+ version on \d{4}\/\d{2}\/\d{2}/.test(doc));
  // Esri World Imagery left this list with its row: no part of the app asks Esri now (the home and My farm show NASA's pictures).
  check('it lists the other sources and tools, each by name', ['Open-Meteo', 'SoilGrids', 'FAOSTAT', 'MapSPAM', 'OpenStreetMap', 'Leaflet', 'MapLibre', 'three.js', 'axe-core'].every(n => doc.includes(n)));
  check('it keeps the honest limits: counts not chances, a regional value is one value for a square, a missing figure is not filled in', /counts, not chances/.test(doc) && /one value for a whole cell of land/.test(doc) && /not read yet/.test(doc));
  { check('it names no author tool, and not the old English country name', !flagged(doc).length && !doc.includes(['Tur', 'key'].join(''))); }
  { const bad = new RegExp([['mile', 'stone'], ['\\bno', 'te \\d'], ['re', 'build']].map(p => p.join('')).join('|'), 'i'); check('it points at nothing outside itself (no plan words)', !bad.test(doc)); }
  check('every NASA source note has a place in the page by name', S.SOURCES.power && doc.includes('NASA POWER') && doc.includes('SMAP'));
}

// ---- the Data page: three tabs, a filter, and every note with its meaning for the field, its Visit link and a "Show more"
{
  const { dataPageHTML, DATA_TABS, FIT_STEPS } = await load('pages.js'), { ALL_SOURCES } = await load('sources.more.js'), { SOURCE_FIELDS } = S;
  const keys = Object.keys(ALL_SOURCES);
  check('there are at least 30 notes', keys.length >= 30, String(keys.length));
  // a note of Crophalo's own may link to one of its own pages by a relative address (./#limits, ./#data): the site's name is never written in the code (the change to js/sources.more.js says so)
  check('every note has every field, in plain words, and a link that starts with https (or, for Crophalo\'s own notes, one of its own pages)', Object.entries(ALL_SOURCES).every(([k, n]) => SOURCE_FIELDS.every(f => f === 'nasa' ? typeof n.nasa === 'boolean' : typeof n[f] === 'string' && n[f].trim().length > 2) && (/^https:\/\/[a-z0-9.-]+/.test(n.url) || (!n.nasa && /^\.\/#[a-z]+$/.test(n.url)))), keys.filter(k => !SOURCE_FIELDS.every(f => f === 'nasa' ? typeof ALL_SOURCES[k].nasa === 'boolean' : typeof ALL_SOURCES[k][f] === 'string' && ALL_SOURCES[k][f].trim().length > 2)).join());
  check('the used sources are all there: the soil survey, the crop maps, MODIS greenness, the Drought Monitor, the exchange rates and the street map', ['ssurgo', 'aci', 'cdl', 'modis', 'usdm', 'ecb', 'openfreemap', 'power', 'smap', 'gpm', 'grace', 'ecostress', 'hls', 'gibs', 'forecast', 'era5', 'era5land', 'fao', 'worldbank', 'soilgrids'].every(k => keys.includes(k)));
  check('only NASA sources are marked NASA, and MODIS is one of them', ALL_SOURCES.modis.nasa === true && ALL_SOURCES.ssurgo.nasa === false && ALL_SOURCES.era5.nasa === false && ALL_SOURCES.gibs.nasa === true);
  check('no note claims a source the app does not use (GEDI, OPERA and the like are not named)', !keys.some(k => /gedi|opera/i.test(k + ALL_SOURCES[k].name)));
  check('no chance, money or order-giving word in any note', !keys.some(k => /\b(guarantee|chance of|profit|income|earn|revenue|promise)\b/i.test(`${ALL_SOURCES[k].what} ${ALL_SOURCES[k].talk}`)));
  const html = dataPageHTML();
  same('three tabs in order', [...html.matchAll(/role="tab" class="tab" id="srctab-(\w+)"/g)].map(m => m[1]), DATA_TABS.map(t => t.id));
  check('one tab is selected and tabbable, the others are not; each tab controls its panel', (html.match(/aria-selected="true"/g) ?? []).length === 1 && (html.match(/tabindex="0">NASA data/g) ?? []).length === 1 && DATA_TABS.every(t => html.includes(`aria-controls="srcpanel-${t.id}"`) && html.includes(`id="srcpanel-${t.id}"`)));
  check('the NASA tab holds only NASA sources and the other tab none of them', (() => { const nasa = html.slice(html.indexOf('id="srcpanel-nasa"'), html.indexOf('id="srcpanel-other"')), other = html.slice(html.indexOf('id="srcpanel-other"'), html.indexOf('id="srcpanel-fit"')); return !/class="src">/.test(nasa) && /class="src nasa"/.test(nasa) && !/class="src nasa"/.test(other) && /class="src">/.test(other); })());
  check('one row for each note: what it is, what it means for the field (two sentences), one Visit link that opens in a new tab safely, and a closed "Show more" with who runs it; no "i" on the row', (html.match(/<li class="row">/g) ?? []).length === keys.length && (html.match(/rel="noopener noreferrer">Visit /g) ?? []).length === keys.length && (html.match(/<details class="data-fold"><summary>Show more<\/summary><p class="cap">Run by /g) ?? []).length === keys.length && !/class="srci/.test(html) && !/<details[^>]*open/.test(html));
  check('no source shows more than four sentences before "Show more"', (() => { const plain = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return [...html.matchAll(/<li class="row">[\s\S]*?<\/li>/g)].map(m => m[0]).every(r => (plain(r.replace(/<details[\s\S]*?<\/details>/, '').replace(/<span class="sr">[^<]*<\/span>/g, '')).match(/[.!?](\s|$)/g) ?? []).length <= 4); })());
  check('a filter box with a label, and a polite line that says how many match', /<label class="field"><span>Find a source<\/span><input type="search" id="srcFilter"/.test(html) && /id="srcCount" role="status" aria-live="polite"/.test(html));
  check('"How it fits together" says the steps in order and that you decide, naming the advice to ask locally', FIT_STEPS.length === 5 && html.indexOf(FIT_STEPS[0][0]) < html.indexOf(FIT_STEPS[4][0]) && /Ask a farm adviser or farmers near you before you change your rotation\./.test(html) && /counts, never a chance/.test(html));
  check('the NASA line, its fold and the NASA list are all inside the NASA tab, before the Other sources tab, and the filter sits above the panels', html.indexOf('id="srcpanel-nasa"') < html.indexOf('id="nasaLine"') && html.indexOf('id="nasaUse"') < html.indexOf('id="srcpanel-other"') && html.indexOf('id="srcFilter"') < html.indexOf('id="srcpanel-nasa"') && !html.includes('Where the numbers come from'));
  check('the 3D view\'s OpenStreetMap map features have their own card on the Data page, with the licence and one link to OpenStreetMap\'s copyright page', ALL_SOURCES.osmfeatures?.nasa === false && /ODbL/.test(ALL_SOURCES.osmfeatures.talk) && /OpenStreetMap map features in the 3D view/.test(html) && (html.match(/openstreetmap\.org\/copyright/g) ?? []).length === 1);
  check('words from a note are plain text', !/<img src=x/.test(dataPageHTML({ x: { org: 'A', name: '<img src=x>', nasa: false, who: 'w', what: '<b>', talk: '<script>', url: 'https://x.invalid/' } })) && !/<script>/.test(dataPageHTML({ x: { org: 'A', name: 'n', nasa: false, who: 'w', what: 'w', talk: '<script>', url: 'https://x.invalid/' } })));
  check('a note with a link that is not https gets no Visit link', !/Visit/.test(dataPageHTML({ x: { org: 'A', name: 'n', nasa: false, who: 'w', what: 'w', talk: 't', url: 'javascript:alert(1)' } })));
  check('every key the code names in a source button exists in the table', (() => { const code = fsx.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => fsx.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n'); const used = new Set([...code.matchAll(/(?:infoButton|srcButton)\(\[([^\]]+)\]/g)].flatMap(m => [...m[1].matchAll(/'([a-z0-9]+)'/g)].map(x => x[1]))); return [...used].every(k => keys.includes(k)); })());
}
// the "why and how" card of step 2
{ const { WHY, whyButton, whyHtml } = await import('../js/srci.js'), w = WHY.rotations, btn = whyButton('rotations'), card = whyHtml('rotations'), text = card.replace(/<details[\s\S]*<\/details>/, '').replace(/<[^>]+>/g, ' ');
  check('the why button is the house "i" (class srci, a name for a screen reader, opens a dialog) and says why and how', /class="srci"/.test(btn) && /aria-haspopup="dialog"/.test(btn) && /Why and how we suggest these rotations/.test(btn) && !/<span/.test(btn), btn);
  check('the card has at most three plain sentences in sight, the rest under "Show more", and says only what the code does (the crop map, about 10 km, the country list, nothing chosen until a tap)', w.lines.length <= 3 && /Show more/.test(card) && /within about 10 km/.test(w.more.join(' ')) && /Statistics Canada/.test(w.more.join(' ')) && /Nothing is chosen for you until you tap/.test(w.more.join(' ')) && !/\b(guarantee|best yield|profit)/i.test(card), text.trim().slice(0, 200));
  check('an unknown card says nothing', whyButton('nope') === '' && whyHtml('nope') === ''); }
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
