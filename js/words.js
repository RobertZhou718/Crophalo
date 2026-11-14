// Crophalo's shared words: the small text helpers every screen uses, kept in one place so no copy can drift.
// All of it is pure: no page, no storage, no network.
// Checked by scripts/test.mjs (the words section).

const HTML_MARKS = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const OLD_TR_NAME = /\bT[uü]rk(?:ey|iye)\b/gi;   // the English spelling some sources still send, and the right one in any letter case

// Text made safe to put inside HTML, between tags or inside a quoted attribute.
export const esc = text => String(text ?? '').replace(/[&<>"']/g, mark => HTML_MARKS[mark]);

// True only for a table's own entry, so "toString" or "__proto__" can never pass as an id.
export const own = (table, key) => typeof key === 'string' && Object.hasOwn(table, key);

// The country as Crophalo writes it. The code TR is always "Türkiye", whatever name the source gave.
export function countryName(name, code) {
  if (String(code ?? '').trim().toUpperCase() === 'TR') return 'Türkiye';
  return String(name ?? '').trim().replace(OLD_TR_NAME, 'Türkiye');
}
