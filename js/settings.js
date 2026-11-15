// Crophalo's settings: seven small choices kept on this device, four of them shown on the <html> element for the stylesheet. A change is told to the page (crophalo:settings).
// Pure: cleanSettings(). The rest reads and writes the browser's storage and the page.
// Checked by scripts/test.mjs (cleanSettings) and scripts/e2e.mjs (the page follows each choice).
import { own } from './words.js';

export const SETTINGS_KEY = 'crophalo.settings.v1';
export const SETTING_CHOICES = {   // the first of each list is the default
  motion: ['full', 'less', 'still'], listen: ['normal', 'slow', 'fast'], text: ['default', 'large', 'xlarge'],
  contrast: ['standard', 'high'], links: ['standard', 'underline'],
  area: ['auto', 'acres', 'hectares'],   // which unit of area comes first; auto: acres in the US and Canada, hectares elsewhere
};
const ON_PAGE = ['text', 'contrast', 'links', 'motion'];   // these four change the look; the others are read where they are used
const OLD_MOTION = Object.freeze({ device: 'full', reduce: 'still' });   // the first two choices of an earlier release, kept as they were meant
export const MOTION_ATTR = Object.freeze({ full: '', less: 'less', still: 'reduce' });   // what html[data-motion] holds: nothing for full, 'less', and 'reduce' (the value the stylesheet and the tests know) for still
const CURRENCY = /^[A-Z]{3}$/, DEFAULT_CURRENCY = 'USD';   // crop prices are published in US dollars
let visitOnly = null;   // set only when the browser refuses to store: the choice then holds for this visit

// Any stored or given value rebuilt from known choices only: an unknown value falls back to the default.
export function cleanSettings(raw) {
  const given = raw && typeof raw === 'object' ? raw : {}, out = {};
  for (const key of Object.keys(SETTING_CHOICES)) {
    const v = key === 'motion' && own(given, key) && own(OLD_MOTION, given[key]) ? OLD_MOTION[given[key]] : given[key];
    out[key] = own(given, key) && SETTING_CHOICES[key].includes(v) ? v : SETTING_CHOICES[key][0];
  }
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
  document.dispatchEvent(new CustomEvent('crophalo:settings', { detail: { ...next } }));   // what reads a setting where it is used (the map's units) follows at once
  return { ...next };
}

// Put the look on the page: a default leaves no attribute, any other choice is written as data-<name>.
export function applySettings(settings = readSettings()) {
  const shown = document.documentElement.dataset;
  for (const key of ON_PAGE) {
    const value = key === 'motion' ? MOTION_ATTR[settings.motion] : settings[key];
    if (value === '' || (key !== 'motion' && settings[key] === SETTING_CHOICES[key][0])) delete shown[key]; else shown[key] = value;
  }
}
