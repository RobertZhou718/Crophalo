// Crophalo's regional reading: a value that a satellite or model gives for a whole square of land (soil moisture about 9 km wide, for example), shown as one value
// with its footprint drawn on a small picture round the field and its date. Never a pattern painted inside the field: the square is the unit of the reading.
// Pure: footprintView(), pictureBox(), valueWords(), dateWords(), cleanReading(), regionHtml(). wireRegion() asks NASA for the picture (js/nasabase.js stillFor), names its day and credit, and leaves a calm box when none comes.
// Checked by scripts/test_region.mjs (the footprint maths, the words, a missing value stays "not read yet", hostile input) and scripts/e2e_map.mjs (fit and axe at five widths).
import { srcButton } from './srci.js';
import { stillFor } from './nasabase.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const KM_PER_DEG = 111.195, MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PICTURE = 360, SHOWS = 2.2;   // the picture shows a square 2.2 times as wide as the footprint, so the footprint sits well inside it with land round it

// The picture's frame and the footprint inside it, for a field at lat, lon and a reading about km wide. Fractions of the picture: 0 to 1, from its top left.
// With the cell the source itself gave (its four edges in degrees) the footprint is that box, wherever the field lies in it; without one it is a square of km round the field.
export function footprintView(lat, lon, km, cell = null) {
  const edges = cell && cleanEdges(cell.edges);
  const clat = edges ? (edges.n + edges.s) / 2 : lat, clon = edges ? (edges.e + edges.w) / 2 : lon;
  const cosC = Math.max(0.05, Math.cos(clat * Math.PI / 180));
  const sideKm = edges ? Math.max((edges.n - edges.s) * KM_PER_DEG, (edges.e - edges.w) * KM_PER_DEG * cosC) : km;   // the longer side of the cell, on the ground
  const half = sideKm * SHOWS / 2, dLat = half / KM_PER_DEG, dLon = half / (KM_PER_DEG * cosC);
  const n = Math.min(85, clat + dLat), s = Math.max(-85, clat - dLat), w = clon - dLon, e = clon + dLon;
  const fx = v => (v - w) / (e - w), fy = v => (n - v) / (n - s);   // the frame is square on the ground, and near enough linear over a few tens of km
  const box = edges ? { x: fx(edges.w), y: fy(edges.n), w: (edges.e - edges.w) / (e - w), h: (edges.n - edges.s) / (n - s) } : { x: (1 - 1 / SHOWS) / 2, y: (1 - 1 / SHOWS) / 2, w: 1 / SHOWS, h: 1 / SHOWS };
  return { bbox: { n, s, e, w }, footprint: box, dot: edges ? { x: fx(lon), y: fy(lat) } : { x: 0.5, y: 0.5 } };
}
// Four edges that make a real box: numbers, north above south, east beyond west, no wider than 5 degrees. Else null.
export function cleanEdges(raw) {
  const e = raw && typeof raw === 'object' ? raw : {}, n = e.n, s = e.s, w = e.w, ea = e.e;
  return [n, s, w, ea].every(v => typeof v === 'number' && Number.isFinite(v)) && Math.abs(n) <= 90 && Math.abs(s) <= 90 && n > s && ea > w && n - s <= 5 && ea - w <= 5 ? { n, s, w, e: ea } : null;
}

// The frame's box as NASA's picture service wants it: { w, s, e, n } in degrees. The picture itself is NASA's (HLS 30 m on the newest clear day, else MODIS 250 m): see wireRegion.
export const pictureBox = view => ({ w: +view.bbox.w.toFixed(5), s: +view.bbox.s.toFixed(5), e: +view.bbox.e.toFixed(5), n: +view.bbox.n.toFixed(5) });
export const PICTURE_SIZE = PICTURE;

// A water share (0 to 1 of the soil's volume) as a farmer reads it: "31% water by volume".
export function valueWords(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? `${Math.round(value * 100)}% water by volume` : '';
}
// "2026-11-14" as "14 November 2026"; '' when it is not a real date.
export function dateWords(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '')); if (!m) return '';
  const y = +m[1], mo = +m[2], d = +m[3], real = new Date(Date.UTC(y, mo - 1, d));
  return real.getUTCFullYear() === y && real.getUTCMonth() === mo - 1 && real.getUTCDate() === d ? `${d} ${MONTHS[mo - 1]} ${y}` : '';
}

const finiteIn = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
// A reading rebuilt from known parts only: the label, a value between 0 and 1 or null, a real date or '', a square between 1 and 500 km, a place on Earth, a source key.
export function cleanReading(raw) {
  const given = raw && typeof raw === 'object' ? raw : {}, lat = Number(given.lat), lon = Number(given.lon), km = Number(given.km);
  if (given.lat == null || given.lon == null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (!Number.isFinite(km) || km < 1 || km > 500) return null;
  const value = typeof given.value === 'number' && Number.isFinite(given.value) && given.value >= 0 && given.value <= 1 ? given.value : null;
  const text = (v, most) => (typeof v === 'string' ? v.trim().slice(0, most) : '');
  const edges = cleanEdges(given.cell?.edges), cell = edges ? { edges, width_km: finiteIn(given.cell.width_km, 0.1, 500), height_km: finiteIn(given.cell.height_km, 0.1, 500) } : null;
  return { label: text(given.label, 60) || 'Regional reading', value, date: dateWords(given.date) ? given.date : '', km, lat, lon, source: /^[a-z0-9]{2,20}$/.test(String(given.source)) ? given.source : '', why: text(given.why, 200), cell };
}

// The whole card. With no value it says so plainly and shows the square all the same, so the farmer sees what will be read.
export function regionHtml(raw) {
  const r = cleanReading(raw); if (!r) return '';
  const v = footprintView(r.lat, r.lon, r.km, r.cell), words = valueWords(r.value), when = dateWords(r.date);
  const rect = v.footprint, pct = n => `${(n * 100).toFixed(2)}%`, km = r.km === Math.round(r.km) ? r.km : r.km.toFixed(1);
  const shape = r.cell && r.cell.width_km && r.cell.height_km ? `a box about ${r.cell.width_km.toFixed(1)} km wide and ${r.cell.height_km.toFixed(1)} km tall` : `a square about ${km} km wide`;
  const alt = `A picture of the land round your field. A dashed outline, ${shape}, shows the area this reading covers, and a dot marks your field.`;
  const forFigure = r.value == null ? '' : `${r.label} for ${shape} that holds the field${when ? `, ${when}` : ''}. One value for the whole area.`;
  return `<figure class="region" data-region>
    <div class="region-pic" role="img" aria-label="${esc(alt)}"><img alt="" width="${PICTURE}" height="${PICTURE}" loading="lazy" decoding="async" data-box="${esc(JSON.stringify(pictureBox(v)))}" data-lat="${r.lat}" data-lon="${r.lon}">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect x="${pct(rect.x).slice(0, -1)}" y="${pct(rect.y).slice(0, -1)}" width="${pct(rect.w).slice(0, -1)}" height="${pct(rect.h).slice(0, -1)}" class="region-box"/><circle cx="${(v.dot.x * 100).toFixed(2)}" cy="${(v.dot.y * 100).toFixed(2)}" r="2.2" class="region-dot"/></svg></div>
    <figcaption class="region-text"><span class="region-label">${esc(r.label)} ${r.source ? srcButton(r.source, forFigure) : ''}</span>
      <span class="region-value">${words ? esc(words) : 'No value for this area'}</span>
      <span class="cap">${words ? `${when ? `${esc(when)}. ` : ''}A regional value: one figure for the whole area, ${shape}. It is not a reading inside your field.` : `Crophalo has no reading for the area that holds your field, so it shows none. It will not guess one.`}</span>
      ${r.why ? `<span class="small">${esc(r.why)}</span>` : ''}
      <span class="cap">The dashed outline is the area this reading covers. The dot is your field.</span>
      <span class="cap region-pictext" role="status"></span></figcaption></figure>`;
}

// Put the picture in once the card is on the page: NASA's, with the day and the satellite said under it. A picture that does not arrive leaves the calm dark box, never a broken-picture mark. ask: stands in for the network in checks.
export function wireRegion(root = document, ask = stillFor) {
  for (const img of root.querySelectorAll('.region-pic img[data-box]')) {
    let box, lat = +img.dataset.lat, lon = +img.dataset.lon;
    try { box = JSON.parse(img.dataset.box); } catch { continue; }
    img.removeAttribute('data-box');
    const words = img.closest('.region')?.querySelector('.region-pictext');
    img.addEventListener('error', () => { img.removeAttribute('src'); img.classList.add('gone'); if (words) words.textContent = 'The NASA picture of this area did not arrive. The reading above does not depend on it.'; }, { once: true });
    Promise.resolve(ask({ lat, lon, box, width: PICTURE, height: PICTURE })).then(still => {
      if (words) words.textContent = `${still.words}. ${still.credit}.`;
      img.src = still.url;
    }, () => img.dispatchEvent(new Event('error')));
  }
}
