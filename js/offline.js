// Crophalo's offline and install handling for the page: the service worker is registered, the yellow bar says when the device is offline, and one Install button appears only when the browser offers it.
// Pure: canRegister(), installCardHtml(), OFFLINE_WORDS, BACK_ONLINE. The rest reads the page and the browser.
// Checked by scripts/test_offline.mjs (the pure parts) and scripts/e2e_map.mjs (a real browser: the worker keeps a copy, the network goes off, the page opens from it, the bar shows).
import { toast } from './toast.js';

export const OFFLINE_WORDS = 'You are offline. Saved fields open, but a new report needs an internet connection.';   // never "works offline" without its second half
export const BACK_ONLINE = 'You are back online.';
const LOCAL = ['localhost', '127.0.0.1', '[::1]'];

// A worker may be registered only on a secure address (https, or this computer itself) and only where the browser has workers.
export function canRegister(loc, nav) {
  return !!nav && 'serviceWorker' in nav && (loc.protocol === 'https:' || LOCAL.includes(loc.hostname));
}

// The install card for the Settings page. The button stays hidden until the browser has offered to install, so a farmer is never shown one that does nothing.
export const installCardHtml = () => `<div class="card pad installcard"><h3>Install on this device</h3>
  <p class="small">Install Crophalo so it opens like an app, even with no signal. New reports still need an internet connection.</p>
  <div class="btnrow"><button type="button" class="btn primary installbtn" hidden>Install on this device</button></div></div>`;

// ---- the bar
let shown = false;
function syncBar() {
  const bar = document.getElementById('offlineBar'); if (!bar) return;
  const offline = navigator.onLine === false;
  if (offline) { bar.textContent = OFFLINE_WORDS; bar.hidden = false; shown = true; return; }
  if (bar.textContent === OFFLINE_WORDS) { bar.hidden = true; bar.textContent = ''; }   // another message in the bar (a file that did not load) is not ours to clear
  if (shown) { shown = false; toast(BACK_ONLINE); }
}

// ---- the worker
async function register() {
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const tell = () => { const w = navigator.serviceWorker.controller || reg.active; if (w && navigator.onLine !== false) w.postMessage('loaded'); };   // after an online visit the worker may look for a new release
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(tell, { timeout: 60e3 }) : setTimeout(tell, 5e3));
    if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
  } catch { /* a browser that refuses workers simply runs online */ }
}

// ---- the install button
let offered = null;
function installButtons(show) { for (const b of document.querySelectorAll('.installbtn')) b.hidden = !show; }
function initInstall() {
  addEventListener('beforeinstallprompt', event => { event.preventDefault(); offered = event; installButtons(true); });
  addEventListener('appinstalled', () => { offered = null; installButtons(false); });
  document.addEventListener('click', async event => {
    const b = event.target.closest?.('.installbtn'); if (!b || !offered) return;
    const asked = offered; offered = null;
    try { await asked.prompt(); const choice = await asked.userChoice; if (choice?.outcome === 'accepted') { const had = document.activeElement === b; installButtons(false); if (had) document.getElementById('navSaved')?.focus(); return; } } catch { /* the browser said no */ }
    offered = asked;   // not accepted: the offer stays for another try
  });
  new MutationObserver(() => { if (offered) installButtons(true); }).observe(document.body, { childList: true, subtree: true });   // a card drawn later (the Settings page) shows its button at once
}

export function initOffline() {
  syncBar();
  addEventListener('offline', syncBar); addEventListener('online', syncBar);
  initInstall();
  if (canRegister(location, navigator)) register();
}
