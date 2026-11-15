// Puts the small motions (js/fx.js, js/fx-halo.js) into the finished app without the screens knowing: it watches the views and listens for the report's "crophalo:report-drawn".
// Not pure: it reads the page and adds classes, attributes and one picture. Each motion asks its own level (Full, Less, Still: html[data-motion] '', 'less', 'reduce') inside js/fx.js.
// Checked by scripts/e2e_motion_wire.mjs (every wired motion at each level, on the real app).
import * as fx from './fx.js';
import { rotationHalo, answerAssembly } from './fx-halo.js';

// the stylesheets come with the motions, not with the Start page; each address is written out whole so the offline copy (sw.js) finds and keeps it
for (const href of [new URL('../css/fx.css', import.meta.url).href, new URL('../css/fx-halo.css', import.meta.url).href]) {
  if (!document.querySelector(`link[rel=stylesheet][href="${href}"]`)) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link); }
}

// ---- a view that opens fades in; the reading rail runs along the top of the report only
const rail = fx.readingRail({ on: false });
const reportShowing = () => { const v = document.getElementById('view-report'); return !!v && !v.hidden; };
new MutationObserver(records => {
  for (const r of records) { const n = r.target; if (n.classList?.contains('view') && !n.hidden && r.oldValue !== null) fx.arrive(n); }
  rail.set(reportShowing());
}).observe(document.querySelector('main') || document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
rail.set(reportShowing());

// ---- the report: each time it is drawn
const shown = new WeakMap();                  // a report's result -> the tabs already shown for it, so an entrance plays once, not at every redraw
let last = { idx: null, glass: null, label: '' };
let names = id => id, pictures = () => null;
Promise.all([import('./crops.js'), import('./pics.js')]).then(([crops, pics]) => { names = id => { try { return crops.cropName(id, true) || id; } catch { return id; } }; pictures = id => { try { return pics.cropPic(id) || null; } catch { return null; } }; }).catch(() => { /* plain words and plain discs */ });

const seasonsOf = plan => ({ ...plan, seasons: (plan?.seasons ?? []).map(s => ({ year: s.year, crop: s.crop, after: s.cover || s.after === 'cover' ? 'cover' : (s.after || 'residue'), second: s.second || null })) });

document.addEventListener('crophalo:report-drawn', event => { try { onReport(event.detail || {}); } catch { /* a motion that fails never stops the report */ } });

function onReport(d) {
  const root = d.root; if (!root?.isConnected) return;
  rail.set(true);
  if (d.loading) return loading(root);
  const list = root.querySelector('[role=tablist]');
  let dir = 'none';
  if (list) {
    const tabs = [...list.querySelectorAll('[role=tab]')], idx = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'), label = list.getAttribute('aria-label') || '';
    if (last.idx != null && last.label === label && idx !== last.idx) dir = idx > last.idx ? 'forward' : 'back';
    last = { idx, glass: fx.glassMount(list, last.label === label ? last.glass : null), label };
  }
  const panel = root.querySelector('.rv-main');
  if (panel && dir !== 'none') fx.pageTurn(panel, dir);
  const key = d.result || root, tabs = shown.get(key) || shown.set(key, new Set()).get(key), fresh = !tabs.has(d.tab); tabs.add(d.tab);
  if (fresh) {
    root.querySelectorAll('.rv-ring b').forEach(b => { b.dataset.roll = ''; });   // the scores count up once
    root.querySelectorAll('.rv-main .rv-sec').forEach((s, i) => { if (i) s.dataset.reveal = ''; });   // the sections below the first ease in as they come into view
    fx.rollNumbers(root); fx.reveal(root);
  }
  const card = root.querySelector('.rv-answer');
  if (card) { halo(card, d, fresh); if (fresh) assemble(card); }
}

// the answer card's steps open one after another, once for each report
function assemble(card) {
  const cols = [...card.querySelectorAll('.rv-compare .rv-col')];
  [[cols[0], 'now'], [cols[1], 'try'], [card.querySelector('.rv-reason'), 'reason'], [card.querySelector('.rv-sure'), 'sureness']].forEach(([node, step]) => { if (node) node.dataset.step = step; });
  const ctl = answerAssembly(card);
  for (const step of ['now', 'try', 'reason', 'sureness']) ctl.arrive(step);
}

// the rotation halo in the answer card: the plan on offer, drawn arc by arc the first time
function halo(card, d, fresh) {
  const r = d.result, main = card.querySelector('.rv-answer-main'); if (!main || !r?.current || !r?.recommended) return;
  const host = document.createElement('div'); host.className = 'fx-halo-host'; (main.querySelector('.rv-headline') || main).after(host);
  const same = r.current === r.recommended || (r.current.id && r.current.id === r.recommended.id);
  const ctl = rotationHalo(host, { plans: { current: seasonsOf(r.current), proposed: seasonsOf(r.recommended) }, show: same ? 'current' : 'proposed', names, pictures, size: 112 });
  if (!fresh) host.getAnimations({ subtree: true }).forEach(a => a.finish());   // a redraw shows it finished
  return ctl;
}

// the loading screen: twelve fields turn green as the sources answer, a satellite crosses; the report's own words and progress stay for screen readers
function loading(root) {
  const sec = root.querySelector('.rv-loading'); if (!sec || sec.querySelector('.fx-scan')) return;
  const rows = [...sec.querySelectorAll('.rv-src')], done = rows.filter(r => r.classList.contains('is-ok')).length, asked = rows.length || 1;
  const host = document.createElement('div'); host.className = 'fx-scan-host'; (sec.querySelector('.lead') || sec.firstElementChild).after(host);
  const ctl = fx.scanLoader(host, { total: asked, label: 'Building your report' });
  host.querySelector('.fx-scan-words')?.remove(); host.querySelector('.fx-progress')?.setAttribute('aria-hidden', 'true'); host.querySelector('.fx-progress')?.removeAttribute('role');
  sec.querySelector('.rv-meter progress')?.classList.add('fx-sr');   // the real progress bar stays for screen readers, out of sight
  ctl.update(done, asked);
}

// ---- the small states: an owner's screen says what just happened with one event, and the button shows it (a tick that draws itself under Full, a still tick under Less and Still)
//   document.dispatchEvent(new CustomEvent('crophalo:did', { detail: { what: 'added' | 'copied' | 'saved' | 'unsaved', button, label? } }))
document.addEventListener('crophalo:did', event => {
  const { what, button, label } = event.detail || {};
  if (!button?.isConnected) return;
  try {
    if (what === 'added') fx.added(button, { label: label || 'Added to My Farm' });
    else if (what === 'copied') fx.copied(button, '', { writer: null, label: label || 'Copied' });
    else if (what === 'saved' || what === 'unsaved') fx.markSaved(button, what === 'saved');
  } catch { /* a small state failing never stops the screen */ }
});
