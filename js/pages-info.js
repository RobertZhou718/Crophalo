// Crophalo's info pages on the page: draws Privacy, Limitations and Settings into the info view and listens to them (tabs with roving arrows, segmented choices, two-tap deletes, backup and restore, the read-only Admin panel, open with no password).
// The markup is in js/pages-view.js; the rules are in privacy.js, backup.js, units.js, currency.js. Every storage access is in a try.
// Checked by scripts/e2e_pages.mjs in a real browser.
import { esc, own } from './words.js';
import { privacyHTML, limitsHTML, settingsHTML, PAGE_LEADS, PRIVACY_TAB_IDS } from './pages-view.js';
import { storageCounts, makeArmer, eraseGroup, eraseEverything, ARM_MS } from './privacy.js';
import { readSettings, saveSettings, SETTINGS_KEY } from './settings.js';
import { readUnits, saveUnits, unitsFor, METRIC, IMPERIAL, DIMS, KEY as UNITS_KEY } from './units.js';
import { loadRates, readRates, money } from './currency.js';
import { makeBackup, checkBackup, describeBackup, describeWords, restoreBackup, backupName, MAX_BYTES } from './backup.js';
import { readReminders, writeReminders, remindListHTML, settingsRemindersHTML, notifyState, pushSupport } from './remind.js';
import { toast } from './toast.js';
import { pageStyle } from './page-style.js';

const armer = makeArmer();
let armTimer = 0, page = '', tab = '';
const root = () => document.getElementById('infoBody');
const tabFromAddress = ids => { const [, , t = ''] = /^#([a-z]+)(?:\/([a-z]+))?$/.exec(location.hash) ?? []; const m = /^#[a-z]+\/([a-z]+)$/.exec(location.hash); return ids.includes(m?.[1]) ? m[1] : ids[0]; };
const nowLocal = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

function ctx() {
  const deviceStill = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })(), settings = readSettings(), units = unitsFor(readUnits()), rates = readRates();
  return { deviceStill, settings, units, rates, moneySample: money(100, settings.currency, rates), reminders: readReminders(), nowLocal: nowLocal(), remindState: { notify: notifyState(), push: { ok: false, reason: 'Checking this browser…', on: false } } };
}
export const renders = { count: 0 };   // how many times a page was drawn: a test counts them, so a draw that starts another draw forever is caught
export function renderInfoPage(which, node = root()) {
  if (!node) return false;
  renders.count++;
  page = which; pageStyle('css/pages.css', node);
  if (which === 'limits') { node.innerHTML = `<p class="lead">${esc(PAGE_LEADS.limits)}</p>${limitsHTML()}`; return true; }
  if (which === 'privacy') { tab = tabFromAddress(PRIVACY_TAB_IDS); node.innerHTML = `<p class="lead">${esc(PAGE_LEADS.privacy)}</p>${privacyHTML(tab, storageCounts())}`; return true; }
  if (which === 'settings') { tab = ''; node.innerHTML = `<p class="lead">${esc(PAGE_LEADS.settings)}</p>${settingsHTML(ctx())}`; afterSettings(node); return true; }
  return false;
}
const redraw = () => { const n = root(), y = scrollY, open = [...n.querySelectorAll('details[open]')].map(d => d.id); renderInfoPage(page, n); for (const id of open) { const d = n.querySelector(`#${CSS.escape(id)}`); if (d) d.open = true; } scrollTo(0, y); };
const goTab = (id, focus = true) => { history.replaceState(history.state, '', `#${page}/${id}`); redraw(); if (focus) document.getElementById('pgtab-' + id)?.focus(); };

async function afterSettings(node) {
  import('./remind-wire.js').then(m => m.wireSettingsReminders(node, { afterChange: () => { const c = node.querySelector('#remindCount'); if (c) { const n = readReminders().length; c.textContent = n ? `${n} ${n === 1 ? 'reminder' : 'reminders'} set. They stay on this device.` : 'They stay on this device.'; } } }));
  const state = { notify: notifyState(), push: await pushSupport() }, ways = node.querySelector('#remindWays');
  if (ways && page === 'settings') ways.innerHTML = settingsRemindersHTML({ notify: state.notify, push: { ...state.push, on: false } });
  const drawn = JSON.stringify(readRates() ?? null), rates = await loadRates();   // redraw ONCE when new rates arrive; rates already in hand change nothing, and redrawing for them would start this again forever
  if (rates && page === 'settings' && JSON.stringify(readRates() ?? null) !== drawn && node.querySelector('#fxNote')) redraw();
}

// ---- two-tap delete
function disarm() { clearTimeout(armTimer); for (const b of document.querySelectorAll('[data-erase][data-armed]')) { b.textContent = b.dataset.label; b.removeAttribute('data-armed'); } }
async function erase(button) {
  const id = button.dataset.erase;
  if (armer.press(id) === 'armed') {
    disarm(); button.dataset.armed = '1'; button.textContent = 'Tap again to delete';
    const live = document.getElementById('eraseLive'); if (live) live.textContent = 'Tap again within five seconds to delete.';
    armTimer = setTimeout(() => { armer.expire(); disarm(); }, ARM_MS + 50); return;
  }
  disarm();
  const env = { local: localStorage, session: sessionStorage, caches: globalThis.caches, stopTimers: () => document.dispatchEvent(new CustomEvent('crophalo:stop-timers')), pushOff: async () => { const { turnPushOff } = await import('./remind.js'); return turnPushOff({ fetch: fetch.bind(globalThis), navigator }); } };
  if (id === 'everything') await eraseEverything(env); else await eraseGroup(id, env);
  toast(id === 'everything' ? 'Everything was deleted from this device.' : 'Deleted.');
  redraw();
}

// ---- events
function bind() {
  const node = root(); if (!node || node.dataset.bound) return; node.dataset.bound = '1';
  node.addEventListener('click', async event => {
    const t = event.target.closest('button'); if (!t) return;
    if (t.dataset.pgtab) return goTab(t.dataset.pgtab);
    if (t.dataset.erase) return erase(t);
    if (t.dataset.openWelcome !== undefined) return document.dispatchEvent(new CustomEvent('crophalo:welcome'));
    if (t.dataset.set) {
      const [name, dim] = t.dataset.set.split(':');
      if (name === 'u') { saveUnits({ ...readUnits(), [dim]: t.dataset.val }); } else saveSettings({ [t.dataset.set]: t.dataset.val });
      redraw(); node.querySelector(`[data-set="${CSS.escape(t.dataset.set)}"][aria-checked="true"]`)?.focus(); return;
    }
    if (t.dataset.quick) { saveUnits(t.dataset.quick === 'imperial' ? IMPERIAL : METRIC); redraw(); return; }
    if (t.dataset.sample !== undefined) { if ('speechSynthesis' in window) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance('This is how Crophalo reads your report aloud.'); u.rate = { normal: 1, slow: 0.8, fast: 1.25 }[readSettings().listen] ?? 1; speechSynthesis.speak(u); } else toast('This device cannot read aloud.'); return; }
    if (t.dataset.backup !== undefined) {
      const text = JSON.stringify(makeBackup()), url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = Object.assign(document.createElement('a'), { href: url, download: backupName() });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Backup file saved.'); return;
    }
    if (t.dataset.restore !== undefined) { node.querySelector('#restoreFile')?.click(); return; }
    if (t.dataset.restoreGo !== undefined) {
      const b = pending; pending = null; const r = b && restoreBackup(b);
      if (r?.ok) { saveSettings({}); toast('Backup restored.'); redraw(); } else node.querySelector('#restoreAsk').textContent = r?.reason ?? 'Nothing to restore.'; return;
    }
    if (t.dataset.restoreNo !== undefined) { pending = null; node.querySelector('#restoreAsk').textContent = ''; return; }
    if (t.dataset.resetSettings !== undefined) { try { localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(UNITS_KEY); } catch { /* none */ } saveSettings({}); toast('Settings reset.'); redraw(); return; }
  });
  node.addEventListener('keydown', event => {
    const tabBtn = event.target.closest('[role=tab]'), radio = event.target.closest('[role=radio]'), keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (tabBtn && keys[event.key]) { const all = [...node.querySelectorAll('[role=tab]')], i = all.indexOf(tabBtn), next = all[(i + keys[event.key] + all.length) % all.length]; event.preventDefault(); goTab(next.dataset.pgtab); }
    else if (tabBtn && (event.key === 'Home' || event.key === 'End')) { const all = [...node.querySelectorAll('[role=tab]')]; event.preventDefault(); goTab(all[event.key === 'Home' ? 0 : all.length - 1].dataset.pgtab); }
    else if (radio && keys[event.key]) { const all = [...radio.parentElement.querySelectorAll('[role=radio]')], next = all[(all.indexOf(radio) + keys[event.key] + all.length) % all.length]; event.preventDefault(); next.click(); }
  });
  node.addEventListener('change', async event => {
    if (event.target.id === 'curSel') { saveSettings({ currency: event.target.value }); await loadRates(); redraw(); document.getElementById('curSel')?.focus(); }
    if (event.target.id === 'restoreFile') {
      const file = event.target.files?.[0], out = node.querySelector('#restoreAsk'); event.target.value = ''; if (!file) return;
      if (file.size > MAX_BYTES) { out.textContent = 'That file is too big to be a Crophalo backup, so nothing was changed.'; return; }
      const r = checkBackup(await file.text());
      if (!r.ok) { out.textContent = r.reason; return; }
      pending = r.backup;
      out.innerHTML = `<p>This backup has ${esc(describeWords(describeBackup(r.backup)))}. Restoring replaces what is on this device now.</p><div class="btnrow"><button type="button" class="btn danger" data-restore-go>Replace with this backup</button><button type="button" class="btn" data-restore-no>Cancel</button></div>`;
    }
  });
}
let pending = null;
export function renderInfoAll(which) { const ok = renderInfoPage(which); if (ok) bind(); return ok; }
