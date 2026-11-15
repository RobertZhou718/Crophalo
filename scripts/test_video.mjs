// The suite for the video of how Crophalo works (js/video.js): the player's markup, its words, the files it plays, and the few lines that wire it into
// the page, the welcome sheet, the offline worker and the going-live files. No browser and no internet: it reads the folder.
// RULE: never loosen a check here to make it pass. A failure means a farmer would meet a video that starts by itself, cannot be read as text, or is missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO, WORDS, playerHTML } from '../js/video.js';
import { esc } from '../js/words.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const show = v => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? String(v) : s.length > 200 ? s.slice(0, 200) + '…' : s; };
function check(name, ok, detail = '') { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? `  (${show(detail)})` : ''}`); } }
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${show(got)}, wanted ${show(want)}`);
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const count = (text, re) => (text.match(re) || []).length;

// ---- the player's markup
const html = playerHTML('vidTest');
same('one video, one Play button, one caption, one fold of text', [count(html, /<video\b/g), count(html, /<button\b/g), count(html, /<figcaption\b/g), count(html, /<details\b/g)], [1, 1, 1, 1]);
check('it never starts by itself and never loops: no autoplay, no loop, no muted start', !/\b(autoplay|loop|muted)\b/i.test(html), html);
check('nothing of the video is fetched before the press: preload="none"', /<video[^>]*\bpreload="none"/.test(html));
check('it plays in the page on a phone, not full screen by force: playsinline', /<video[^>]*\bplaysinline\b/.test(html));
check('the controls are not shown before the press, so the first picture carries ONE Play button', !/<video[^>]*\bcontrols\b/.test(html));
check('the first picture is the poster', html.includes(`poster="${VIDEO.poster}"`));
check('the file is offered as video/mp4', html.includes(`<source src="${VIDEO.file}" type="video/mp4">`));
check('the timed words are offered as a captions track in English, not switched on (the words are already in the picture)', new RegExp(`<track kind="captions" srclang="en" label="English" src="${VIDEO.words.replace(/[.]/g, '\\.')}">`).test(html) && !/<track[^>]*\bdefault\b/.test(html));
check('the video has a name, and so has the Play button', html.includes(`aria-label="${WORDS.title}"`) && html.includes(`aria-label="${WORDS.play}"`));
check('the Play button\'s drawing is hidden from a screen reader', /<button[^>]*class="vid-play"[^>]*><svg[^>]*aria-hidden="true"/.test(html));
same('the caption under the player, word for word', WORDS.caption, '30 seconds: how Crophalo works. Narration: synthetic voice.');
check('the caption is in the markup', html.includes(`>${WORDS.caption}</figcaption>`));
check('the fold is named "Read it as text" and holds the whole narration', html.includes('<summary>Read it as text</summary>') && html.includes(`<p>${esc(WORDS.text)}</p>`), html.slice(-500));
check('the id asked for is the video\'s id', html.includes('id="vidTest"') && playerHTML().includes('id="vid"'));
check('an id with markup in it cannot break the page', !playerHTML('"><b>').includes('<b>'));

// ---- the words
same('the top bar\'s words', [WORDS.open, WORDS.title, WORDS.close], ['How it works', 'How Crophalo works', 'Close']);
check('the narration never promises three rotations (a place may have two) and never calls the past weather a forecast', !/\bthree\b/i.test(WORDS.text) && !/forecast|predict|guarantee/i.test(WORDS.text));
check('the narration says Crophalo is a guide and the farmer decides', WORDS.text.includes('It\'s a guide. You decide what to plant.'));
check('it starts with the name and ends with the motto', WORDS.text.startsWith('Hi, this is Crophalo.') && WORDS.text.endsWith('Know your field before you plant.'));

// ---- the files it plays
for (const rel of [VIDEO.file, VIDEO.poster, VIDEO.words, 'media/crophalo-30s-transcript.txt']) check(`${rel} is in the folder`, fs.existsSync(path.join(ROOT, rel)));
same('every file of the video sits in media/ under a plain lower-case name', [VIDEO.file, VIDEO.poster, VIDEO.words].map(f => /^media\/[a-z0-9-]+\.(mp4|jpg|webp|vtt)$/.test(f)), [true, true, true]);
{ const bytes = fs.readFileSync(path.join(ROOT, VIDEO.file));
  check('the video is an MP4 file', bytes.subarray(4, 8).toString('latin1') === 'ftyp');
  check('the video is under 10 MB, so a slow line can still play it', bytes.length < 10 * 1024 * 1024, `${bytes.length} bytes`);
  const moov = bytes.indexOf('moov', 0, 'latin1'), mdat = bytes.indexOf('mdat', 0, 'latin1');
  check('the video can start before it has all arrived (its index comes first)', moov > 0 && mdat > 0 && moov < mdat, `moov at ${moov}, mdat at ${mdat}`); }
{ const jpg = fs.readFileSync(path.join(ROOT, VIDEO.poster));
  check('the first picture is a JPEG under 100 KB', jpg[0] === 0xff && jpg[1] === 0xd8 && jpg.length < 100 * 1024, `${jpg.length} bytes`); }
{ const vtt = read(VIDEO.words), cues = vtt.split(/\n\n+/).slice(1).map(c => c.trim()).filter(Boolean);
  check('the timed words are a WebVTT file', vtt.startsWith('WEBVTT'));
  const said = cues.map(c => c.split('\n').slice(1).join(' ')).join(' ');
  same('the timed words, read in order, are the narration', said, WORDS.text);
  const times = cues.map(c => /^(\d\d):(\d\d):(\d\d\.\d{3}) --> (\d\d):(\d\d):(\d\d\.\d{3})$/.exec(c.split('\n')[0])).map(m => m && [(+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]), (+m[4]) * 3600 + (+m[5]) * 60 + (+m[6])]);
  check('every line has its times, each ends after it starts, none starts before the one before ends, all inside 30 seconds', times.every(Boolean) && times.every((t, i) => t[0] < t[1] && t[1] <= 30 && (i === 0 || t[0] >= times[i - 1][1])), times); }
same('the text file holds the narration, word for word', read('media/crophalo-30s-transcript.txt').trim(), WORDS.text);

// ---- wired into the page: one button, one dialog, each under its own comment line
{ const page = read('index.html');
  same('one "Watch the video" button and one dialog', [count(page, /id="navVideo"/g), count(page, /id="dlgVideo"/g)], [1, 1]);
  check('the button sits in the top bar\'s links, says it opens a dialog, and carries its words (they are its name on a phone)', /<nav class="nav-links"[\s\S]*?<button type="button" class="tbtn" id="navVideo" aria-haspopup="dialog">[\s\S]*?<span class="t">How it works<\/span><\/button>[\s\S]*?<\/nav>/.test(page));
  check('the button\'s drawing is hidden from a screen reader', /id="navVideo"[^>]*><svg class="ic"[^>]*aria-hidden="true"/.test(page));
  check('the dialog has its title, its Close button and the place for the player', /<dialog class="sheet vid-dlg" id="dlgVideo" aria-labelledby="vidTitle">.*<h2 id="vidTitle">How Crophalo works<\/h2>.*<button type="button" class="btn" id="vidClose">Close<\/button>.*id="vidHere".*<\/dialog>/.test(page));
  same('each of the two has a comment line naming the video just above it', count(page, /<!-- The video of how Crophalo works: [^\n]*-->\n\s*<(button type="button" class="tbtn" id="navVideo"|dialog class="sheet vid-dlg" id="dlgVideo")/g), 2);
  check('the page itself starts no video', !/<video\b/.test(page) && !/autoplay/i.test(page)); }
{ const app = read('js/app.js');
  same('js/app.js: one import and one listener', [count(app, /^import \{ openVideo \} from '\.\/video\.js';/gm), count(app, /\$\('#navVideo'\)\.addEventListener\('click', openVideo\);/g)], [1, 1]); }
{ const welcome = read('js/welcome.js'), code = read('js/video.js');
  check('the welcome sheet carries the player in its own column, before the words and the points', /<div class="welcome-body">\s*<div class="welcome-video">\$\{playerHTML\('vidWelcome'\)\}<\/div>\s*<div class="welcome-read">[\s\S]*id="welcomeTitle"[\s\S]*<div class="welcome-cards">/.test(welcome));
  check('closing the welcome sheet stops the video', /sheet\.addEventListener\('close', \(\) => \{[^}]*video\.stop\(\);/.test(welcome));
  check('the video and "Listen to this page" never talk at once', /video\.video\.addEventListener\('play', stopSpeaking\)/.test(welcome));
  check('the welcome sheet still blocks until accepted', /sheet\.addEventListener\('cancel', event => \{ if \(!welcomeAccepted\(\)\) event\.preventDefault\(\); \}\)/.test(welcome));
  check('it plays on the Play button\'s press, on the top bar\'s press and by itself when the welcome sheet opens (the owner\'s order of 15 November); never by itself under Still, and without sound where the browser refuses sound', /play\.addEventListener\('click', start\)/.test(code) && /if \(!still\(\)\) player\.start\(\);/.test(code) && count(code, /player\.start\(\)/g) === 1 && /const auto = \(\) => \{\s*if \(still\(\)\) return;/.test(code) && /video\.muted = true;/.test(code) && /Turn sound on/.test(code) && /crophalo-shown', \(\) => video\.auto\(\)/.test(welcome), [count(code, /\.play\(\)/g)]);
  check('Still, and the device\'s less-movement choice, are both read', /dataset\.motion === 'reduce'/.test(code) && /prefers-reduced-motion: reduce/.test(code));
  check('closing the dialog stops the video and gives the focus back', /dialog\.addEventListener\('close', \(\) => \{ player\.stop\(\); opener\?\.focus\(\); \}\)/.test(code));
  check('no word in the code asks a browser to start it by itself', !/autoplay/i.test(code) && !/autoplay/i.test(welcome)); }
{ const styles = read('css/video.css');
  check('the styles use the app\'s tokens for colour (black behind the picture is the one plain colour)', !/#(?!000\b)[0-9a-f]{3,8}\b/i.test(styles) && !/\brgba?\(/.test(styles));
  check('the welcome sheet is wide on a desktop (up to 1360 px, never more than 96% of the window) with the video the larger part', /dialog\.welcome \{ width: min\(1360px, calc\(96vw \/ var\(--tz\)\)\);/.test(styles) && /\.welcome-body \{ display: grid; grid-template-columns: minmax\(0, 1\.75fr\) minmax\(0, 1fr\);/.test(styles));
  check('in a narrow window it is one column again, at the width it had, the video first', /@media \(max-width: 899px\) \{\s*dialog\.welcome \{ width: min\(600px, calc\(100vw \/ var\(--tz\) - 24px\)\);[^}]*\}\s*\.welcome-body \{ display: block; \}/.test(styles));
  check('the Play button is at least 44 px (84 px, 64 px on a phone) and shows where the focus is', /\.vid-play \{[^}]*width: 84px; height: 84px/.test(styles) && /@media \(max-width: 560px\) \{ \.vid-play \{ width: 64px; height: 64px; \}/.test(styles) && /\.vid-play:focus-visible \{/.test(styles));
  check('a point\'s title keeps its 16 px on a phone', /\.welcome \.welcome-card h2 \{ font-size: 16px; \}/.test(styles)); }

// ---- the offline copy and the server
{ const worker = read('sw.js'), byName = worker.match(/const BY_NAME = (\[[^\]]*\])/)[1];
  check('the worker keeps the player\'s styles for offline use', byName.includes('\'css/video.css\''));
  check('the worker never puts the video in the offline copy', !/media\//.test(worker)); }
{ const server = read('scripts/serve.mjs'), rule = new RegExp(/^const SERVED = \/(.+)\/([a-z]*);/m.exec(server)[1]);
  same('the server hands out the video\'s four files and nothing else under media/', ['media/crophalo-30s.mp4', 'media/crophalo-30s-poster.jpg', 'media/crophalo-30s.vtt', 'media/crophalo-30s-transcript.txt', 'media/notes.md', 'media/sub/a.mp4', 'media/A.mp4'].map(f => rule.test(f)), [true, true, true, true, false, false, false]);
  check('the server knows the two kinds', server.includes('\'.mp4\': \'video/mp4\'') && server.includes('\'.vtt\': \'text/vtt; charset=utf-8\'')); }
{ const live = JSON.parse(read('deploy/staticwebapp.config.json'));
  same('the going-live file names the two kinds', [live.mimeTypes['.mp4'], live.mimeTypes['.vtt']], ['video/mp4', 'text/vtt; charset=utf-8']); }

console.log(`video: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
