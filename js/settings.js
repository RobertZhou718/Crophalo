// Crophalo's settings: six small choices kept on this device, four of them shown on the <html> element for the stylesheet.
// Pure: cleanSettings(). The rest reads and writes the browser's storage and the page.
// Checked by scripts/test.mjs (cleanSettings) and scripts/e2e.mjs (the page follows each choice).
import { own } from './words.js';

export const SETTINGS_KEY = 'crophalo.settings.v1';
export const SETTING_CHOICES = {   // the first of each list is the default
  motion: ['device', 'reduce'], listen: ['normal', 'slow', 'fast'], text: ['default', 'large', 'xlarge'],
  contrast: ['standard', 'high'], links: ['standard', 'underline'],
};
const ON_PAGE = ['text', 'contrast', 'links', 'motion'];   // these four change the look; the other two are read where they are used
const CURRENCY = /^[A-Z]{3}$/, DEFAULT_CURRENCY = 'USD';   // crop prices are published in US dollars
let visitOnly = null;   // set only when the browser refuses to store: the choice then holds for this visit

// Any stored or given value rebuilt from known choices only: an unknown value falls back to the default.
export function cleanSettings(raw) {
  const given = raw && typeof raw === 'object' ? raw : {}, out = {};
  for (const key of Object.keys(SETTING_CHOICES)) out[key] = own(given, key) && SETTING_CHOICES[key].includes(given[key]) ? given[key] : SETTING_CHOICES[key][0];
  out.currency = own(given, 'currency') && CURRENCY.test(given.currency) ? given.currency : DEFAULT_CURRENCY;
  return out;
}

export function readSettings() {
  if (visitOnly) return { ...visitOnly };
  try { return cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY))); } catch { return cleanSettings(null); }   // blocked storage or a broken value: the defaults
}

// Change one or more settings, keep them and show them at once. Returns the settings as they now are.
export function saveSettings(changes) {
  const next = cleanSettings({ ...readSettings(), ...changes });
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); visitOnly = null; } catch { visitOnly = next; }
  applySettings(next);
  return { ...next };
}

// Put the look on the page: a default leaves no attribute, any other choice is written as data-<name>.
export function applySettings(settings = readSettings()) {
  const shown = document.documentElement.dataset;
  for (const key of ON_PAGE) if (settings[key] === SETTING_CHOICES[key][0]) delete shown[key]; else shown[key] = settings[key];
}
