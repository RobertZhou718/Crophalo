// Crophalo's report scenes, the first four of the report's big animations: THE IRIS (the loading screen opens from the button that was pressed), THE RECORD ARRIVES (the weather band draws itself while the report is worked out),
// THE FOLD (the loading screen gives way to the answer) and THE CURL (the band bends into the rings of the score while the score rolls up to its real value).
// Every scene is a description given to the conductor in js/macro-core.js: any press or key ends it and leaves the screen complete, Still moves nothing, Less only fades, the real figure is in the page's text from the first moment, and nothing waits for a picture.
// With this file absent the report is what it was. It does its work when it is imported (js/macro.js fetches it when the report opens). Checked by scripts/e2e_macro_report.mjs and, for the figures, scripts/test_macro_record.mjs.
import { setHook } from './hooks.js';
import { become } from './macro-view.js';
import { scene, may, say, roll, stopAll, quality, ease, T, SCENES, chain } from './macro-core.js';
import { recordBand, revealRow, rowProgress, bandEnd, curl, drawCurl, CAPTION, CURL_CAPTION } from './macro-record.js';

const doc = () => globalThis.document;
const now = () => globalThis.performance?.now?.() ?? Date.now();
const visible = el => { if (!el?.isConnected) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const centre = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

// ---- what was pressed last: the iris opens from it (setup's Next button, or the demo link, a saved report or a card)
let pressed = null;
function watchPress() {
  const d = doc(); if (!d?.addEventListener) return;
  const note = e => { const el = e.target?.closest?.('button, a, [role=button], [data-act]'); if (el) pressed = { el, at: now() }; };
  d.addEventListener('pointerdown', note, true); d.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') note(e); }, true);
}
// The point the loading screen opens from: the centre of #wNext when the report is opened from setup, else the pressed element when it was pressed a moment ago, else none (a plain cross-fade; never an iris from nowhere).
export function irisOrigin() {
  const d = doc(), next = d?.getElementById?.('wNext');
  if (visible(next)) return centre(next);
  if (pressed && now() - pressed.at < 1500 && visible(pressed.el)) return centre(pressed.el);
  return null;
}

// ---- the loading screen and its band
let since = 0, wait = null;   // when the loading screen was painted; the timer that starts the band after the first T.SKIP_UNDER
let record = null, shown = null;   // the record that arrived for this loading screen; the band drawn from it: { built, canvas, scene }
const spot = () => doc()?.querySelector?.('.rv-loading .rv-macro') ?? null;

function startBand() {
  const host = spot(), detail = record;
  if (!host || !detail || shown) return;
  const canvas = doc().createElement('canvas'), caption = doc().createElement('p');
  canvas.className = 'rv-band'; canvas.setAttribute('aria-hidden', 'true');
  caption.className = 'cap rv-band-cap'; caption.textContent = CAPTION;
  const built = recordBand(canvas, detail);
  if (!built) return;
  host.replaceChildren(canvas, caption);
  const fully = () => { built.ctx.putImageData(built.image, 0, 0); };
  const sc = scene({
    name: 'record-band', host: canvas, ms: bandEnd(built.rows),
    paint(k) { const ms = k * bandEnd(built.rows); for (let r = 0; r < built.rows; r++) { const p = rowProgress(ms, r); if (p > 0) revealRow(built, r, p); } },   // a row a year, 70 ms apart, each 400 ms, an even pace: a year is a year
    end: fully,
    stop: fully,
  });
  shown = { built, canvas, scene: sc };
  built.ctx.clearRect(0, 0, built.columns, built.rows);
  chain('loading').start();   // the band is its own beat: the time the farmer already waited for the record does not use up its budget
  sc.play();
}
function onRecord(e) {
  const d = e.detail; if (!d?.dates?.length) return;
  record = d;
  if (!since || !spot()) return;   // no loading screen to draw on (yet): it is tried again when the screen is painted
  const late = Math.max(0, T.SKIP_UNDER - (now() - since));
  clearTimeout(wait);
  if (late > 0) wait = setTimeout(() => { if (spot()) startBand(); }, late);   // a wait under 600 ms shows no band at all
  else startBand();
}

// ---- the screen changes of the report
function opening(update) {
  record = null; since = 0; shown = null; clearTimeout(wait);
  const origin = irisOrigin();
  since = now();
  become(update, { iris: origin, scene: 'iris' }).then(() => { if (spot() && record && !shown) onRecord({ detail: record }); });
  return true;
}

function ready(update) {
  clearTimeout(wait);
  const long = since && now() - since >= T.SKIP_UNDER, drawn = long ? shown : null;
  if (!long) { stopAll(); finish(); return false; }   // a wait under 600 ms: no loading scene was worth showing; the report simply opens
  drawn?.scene.skip();   // the data landed first: the band is finished at once
  const from = drawn?.canvas?.isConnected ? drawn.canvas.getBoundingClientRect() : null, built = drawn?.built ?? null;
  const box = from && from.width > 0 ? { x: from.left, y: from.top, w: from.width, h: from.height } : null;
  become(update, { scene: 'fold' }).then(() => { announce(); if (box && built) startCurl(box, built); else { const ring = doc().querySelector('#answer .chip.score'); if (ring && may('score-roll').level === 'full') rollScore(ring); } });   // no band on the loading screen any more (owner's rule 17): the fold, then the score rolls to its real value
  return true;
}
function finish() { record = null; since = 0; shown = null; }
function announce() {
  const title = doc()?.getElementById?.('reportTitle')?.textContent?.trim();
  say(title ? `Report ready for ${title}` : 'Report ready');
  finish();
}

// ---- THE CURL: the 25 rows of the band become the 25 rings of the score; the score rolls up to its real value; the answer card rises
function startCurl(fromBox, built) {
  const d = doc(), ring = d.querySelector('#answer .chip.score'), answer = d.getElementById('answer');
  if (!ring || !visible(ring) || may('curl').level !== 'full') { if (ring && may('score-roll').level === 'full') rollScore(ring); return; }
  const r = ring.getBoundingClientRect(), q = quality();
  const shape = curl(fromBox, { x: r.left, y: r.top, w: r.width, h: r.height }, built, { slices: q.slices });
  const overlay = d.createElement('canvas'); overlay.className = 'm-curl'; overlay.setAttribute('aria-hidden', 'true');
  const w = globalThis.innerWidth, h = globalThis.innerHeight;
  overlay.width = Math.round(w * q.dpr); overlay.height = Math.round(h * q.dpr);
  const ctx = overlay.getContext('2d'); ctx.scale(q.dpr, q.dpr);
  d.body.append(overlay);
  const timers = [];
  const clearAll = () => { for (const t of timers) clearTimeout(t); timers.length = 0; };
  const at = (ms, fn) => timers.push(setTimeout(() => { try { fn(); } catch (e) { globalThis.reportError?.(e); } }, ms));
  const gone = () => { clearAll(); overlay.remove(); for (const a of answer?.getAnimations?.() ?? []) { try { if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) { a.finish(); a.cancel(); } } catch { /* it had ended */ } } };   // an input leaves the answer card where it belongs
  const sc = scene({
    name: 'curl', host: overlay, ms: T.TURN + 40,
    paint(k) { ctx.clearRect(0, 0, w, h); drawCurl(ctx, shape, ease.arrive(k)); },
    end() { gone(); },   // at its end the curl lies on the ring itself, so the overlay goes and the ring stays (every motion is a scene's paint, never an animation of its own)
    stop: gone,
  });
  if (!answer || !visible(answer)) { sc.play(); return; }
  sc.play().then(() => {}, () => {});
  if (sc.form !== 'full') { gone(); return; }
  at(300, () => rise(answer));        // the answer card rises 12 px
  at(500, () => rollScore(ring));     // the painted score rolls 0 to its real value; the real number is in the text from the start
}
function rise(answer) {   // the card rises 12 px on ARRIVE; at Less and Still end() runs at once and the card stands where it belongs
  const put = k => { answer.style.transform = k < 1 ? `translateY(${(12 * (1 - ease.arrive(k))).toFixed(2)}px)` : ''; };
  scene({ name: 'answer-rise', host: answer, ms: SCENES['answer-rise'].ms, paint: put, end() { put(1); }, stop() { put(1); } }).play();
}
function rollScore(ring) {
  const b = ring.querySelector('.rv-num'), to = Number(b?.textContent);
  if (!b || !Number.isFinite(to)) return;
  roll(b, to, { decimals: 0, ms: SCENES['score-roll'].ms });
}

// YOUR HARDEST YEAR: when a year chip is tapped, the twelve months of each strategy fill from left to right over 1.2 s, one strategy after the other, and the results appear when they are full.
// Less only fades the card in (T.QUICK); Still shows it at once. The first drawing of the card plays nothing: it plays after a tap.
let hyYear = null;
function hardYear() {
  const card = doc()?.getElementById?.('hardYear');
  if (!card) { hyYear = null; return; }
  const year = card.dataset.year;
  if (year === hyYear) return;
  const first = hyYear === null; hyYear = year;
  if (first || !visible(card)) return;
  const rows = [...card.querySelectorAll('.hy-row')].map(r => ({ cells: [...r.querySelectorAll('.hy-c')], res: r.querySelector('.hy-res') })), MS = 1200, share = MS / Math.max(1, rows.length);
  const clear = () => { for (const r of rows) { for (const c of r.cells) c.style.opacity = ''; if (r.res) r.res.style.opacity = ''; } };
  const sc = scene({ name: 'three-futures', host: card, ms: MS,
    paint(k) { const ms = k * MS; rows.forEach((r, i) => { const rk = Math.max(0, Math.min(1, (ms - i * share) / share)); r.cells.forEach((c, j) => { c.style.opacity = j / r.cells.length < rk ? '' : '0.15'; }); if (r.res) r.res.style.opacity = rk >= 1 ? '' : '0'; }); },
    end: clear, stop: clear });
  sc.play();
}
// A caption under the score that says where the number comes from, as real text (not animated, always there).
function captionScore() {
  const d = doc(), card = d?.querySelector?.('#answer'), at = card?.querySelector?.('.rv-chiprow');
  if (!at || card.querySelector('.rv-curl-cap')) return;
  const p = d.createElement('p'); p.className = 'cap rv-curl-cap'; p.textContent = CURL_CAPTION;
  at.after(p);
}

// ---- go
let begun = false;
function style() {   // the stylesheet comes with the first scene of this file, so without the file the report has no new rule at all
  const d = doc();
  try {
    for (const file of ['macro.css', 'macro-report.css']) {
      const href = new URL(`../css/${file}`, import.meta.url).href;
      if (!d.querySelector(`link[rel=stylesheet][href="${href}"]`)) { const link = d.createElement('link'); link.rel = 'stylesheet'; link.href = href; d.head.append(link); }
    }
  } catch { /* the scenes still play */ }
}
export function start() {
  const d = doc(); if (begun || !d?.addEventListener) return;
  begun = true; style();
  watchPress();
  d.addEventListener('crophalo:record', onRecord);
  d.addEventListener('crophalo:report-drawn', e => {
    const x = e.detail ?? {};
    if (x.loading) { if (since && record && !shown && spot()) onRecord({ detail: record }); }   // the loading screen is painted: a record that came first is drawn now
    else if (!x.failed && x.result?.ok) { captionScore(); hardYear(); }
  });
  setHook('report', (update, info = {}) => {
    if (info.to === 'loading') return opening(update);
    if (info.to === 'ready' && info.from === 'loading') return ready(update);
    stopAll(); finish();
    return false;
  });
}
start();
