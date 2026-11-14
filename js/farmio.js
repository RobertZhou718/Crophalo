// Files in and out of My farm: split a field with a line, read .geojson and .kml outlines, write a map file and a spreadsheet.
// Pure: no page, no storage, no network (a file is read on the device and goes nowhere). Geometry comes from geo.js and simulate.js.
// Checked by scripts/test_sim.mjs (split, both readers with every refusal, and the GeoJSON and CSV round trips).
import { areaHa, selfCrosses, insideRing } from './geo.js';
import { LIMITS, frame, distanceM, interiorPoint, simplifyRing, round5, naturalSort, outlineIssue, WATER_WORDS, thisSeasonCrop, planOf } from './simulate.js';

export { naturalCompare, naturalSort } from './simulate.js';
const r = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k; };

// ---- split: the straight line through two points is extended across the field and must cut the outline exactly twice
// a, b are [lat, lon]. Returns { ok: true, rings: [ringA, ringB] } or { ok: false, reason } in the farmer's words.
export function splitRing(ring, a, b) {
  const f = frame([...ring, a, b]), xy = f.ring.slice(0, ring.length), [ax, ay] = f.ring[ring.length], [bx, by] = f.ring[ring.length + 1];
  if (Math.hypot(bx - ax, by - ay) < 5) return { ok: false, reason: 'The two points are too close. Tap them further apart.' };
  const dx = bx - ax, dy = by - ay, side = ([x, y]) => dx * (y - ay) - dy * (x - ax), s = xy.map(side), n = xy.length, walk = [];
  let crossings = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    walk.push({ p: xy[i], cut: false });
    if ((s[i] > 0) !== (s[j] > 0)) {   // a vertex exactly on the line counts as the far side, so a line that only touches a corner does not cut
      const t = s[i] / (s[i] - s[j]);
      walk.push({ p: [xy[i][0] + t * (xy[j][0] - xy[i][0]), xy[i][1] + t * (xy[j][1] - xy[i][1])], cut: true }); crossings++;
    }
  }
  if (crossings === 0) return { ok: false, reason: 'The line does not cross the field. Tap two points so the line goes right across it.' };
  if (crossings > 2) return { ok: false, reason: 'The line cuts this field in more than two places. Tap two points so it crosses the field edge only twice.' };
  const first = walk.findIndex(w => w.cut), rot = [...walk.slice(first), ...walk.slice(0, first)], second = rot.findIndex((w, i) => i > 0 && w.cut);
  const pa = rot.slice(0, second + 1).map(w => f.back(w.p)), pb = [...rot.slice(second), rot[0]].map(w => f.back(w.p));
  const dedupe = list => list.filter((p, i) => i === 0 || p[0] !== list[i - 1][0] || p[1] !== list[i - 1][1]);
  const A = dedupe(pa), B = dedupe(pb), small = LIMITS.areaHa[0];
  if (A.length < 3 || B.length < 3 || areaHa(A) < small || areaHa(B) < small) return { ok: false, reason: 'One half would be smaller than the smallest field Crophalo keeps.' };
  return { ok: true, rings: [A, B] };
}

// ---- reading a map file
const REASON = Object.freeze({
  noShape: 'It has no shape.', lineString: 'A LineString is not a field outline.', noOutline: 'It has no outline.', notDegrees: 'Its map is not in latitude and longitude (WGS84).',
  unreadable: 'Its outline could not be read.', pointOrLine: 'A point or a line is not a field outline.',
  corners: 'It needs at least 3 corners.', crosses: 'Its edges cross.', small: 'Smaller than the smallest field Crophalo keeps (0.05 ha).', large: 'Bigger than the largest field Crophalo keeps (5000 ha).', far: 'More than 50 km from this farm. It needs its own farm.',
});
const NAME_KEYS = ['name', 'field_name', 'fieldname', 'field', 'label', 'title', 'description', 'desc', 'id'];
const stripTags = s => String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim();
const nameFrom = props => { if (props && typeof props === 'object') for (const k of NAME_KEYS) { const hit = Object.keys(props).find(p => p.toLowerCase() === k); const v = hit && props[hit]; if (v != null && typeof v !== 'object') { const t = stripTags(v).slice(0, LIMITS.nameField); if (t) return t; } } return ''; };

// A GeoJSON position list [[lon, lat], ...] as [lat, lon] corners, the closing corner dropped; null when it is not degrees.
function toRing(coords) {
  if (!Array.isArray(coords) || coords.some(c => !Array.isArray(c) || !Number.isFinite(+c[0]) || !Number.isFinite(+c[1]))) return { bad: 'unreadable' };
  if (coords.some(c => Math.abs(+c[0]) > 180 || Math.abs(+c[1]) > 90)) return { bad: 'notDegrees' };
  const ring = coords.map(c => [round5(+c[1]), round5(+c[0])]);
  if (ring.length > 2 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring.pop();
  return { ring };
}
// Polygon coordinates [outer, ...holes] -> one row; a hole is filled in (the field is the whole outline) and said.
function polygonRow(coords, name, pin, notes = []) {
  if (!Array.isArray(coords) || !coords.length) return { name, skipped: REASON.noOutline };
  const t = toRing(coords[0]);
  if (t.bad) return { name, skipped: REASON[t.bad] };
  let ring = t.ring;
  const row = { name, ring, notes: [...notes] };
  if (coords.length > 1) row.notes.push('a hole was filled in');
  if (ring.length < 3) return { name, skipped: REASON.corners };
  if (ring.length > LIMITS.corners[1]) { ring = simplifyRing(ring, LIMITS.corners[1]).map(p => [round5(p[0]), round5(p[1])]); row.ring = ring; row.notes.push('simplified to 100 corners'); }
  if (selfCrosses(ring)) return { name, skipped: REASON.crosses };
  const ha = areaHa(ring);
  if (ha < LIMITS.areaHa[0]) return { name, skipped: REASON.small };
  if (ha > LIMITS.areaHa[1]) return { name, skipped: REASON.large };
  row.ha = r(ha, 2);
  if (pin && distanceM([pin.lat, pin.lon], interiorPoint(ring)) / 1000 > LIMITS.farKm) return { name, skipped: REASON.far };
  return row;
}
// Features -> rows, MultiPolygon parts "<name> 1", "<name> 2", duplicates "<name> 2".
function geometryRows(geom, name, pin, out) {
  if (!geom || typeof geom !== 'object') { out.push({ name, skipped: REASON.noShape }); return; }
  const t = geom.type;
  if (t === 'Polygon') out.push(polygonRow(geom.coordinates, name, pin));
  else if (t === 'MultiPolygon') (Array.isArray(geom.coordinates) ? geom.coordinates : []).forEach((c, i, all) => out.push(polygonRow(c, all.length > 1 ? `${name} ${i + 1}` : name, pin)));
  else if (t === 'GeometryCollection') { const parts = (Array.isArray(geom.geometries) ? geom.geometries : []); const before = out.length; parts.forEach(g => geometryRows(g, name, pin, out)); if (parts.length > 1) out.slice(before).forEach((row, i) => { row.name = `${name} ${i + 1}`; }); if (!parts.length) out.push({ name, skipped: REASON.noShape }); }
  else if (t === 'LineString' || t === 'MultiLineString') out.push({ name, skipped: REASON.lineString });
  else if (t === 'Point' || t === 'MultiPoint') out.push({ name, skipped: REASON.pointOrLine });
  else out.push({ name, skipped: REASON.noShape });
}
function finish(rows, { taken = [], room = LIMITS.fields } = {}) {
  const used = new Set(taken.map(t => String(t).toLowerCase())), out = [];
  rows.forEach((row, i) => {
    let name = row.name || `Field ${i + 1}`;
    if (used.has(name.toLowerCase())) { let n = 2; while (used.has(`${name} ${n}`.toLowerCase())) n++; name = `${name} ${n}`.slice(0, LIMITS.nameField + 3); }
    used.add(name.toLowerCase());
    out.push({ ...row, name: name.slice(0, LIMITS.nameField + 3) });
  });
  const usable = out.filter(x => !x.skipped).length;
  return { ok: true, rows: out, usable, skipped: out.length - usable, room, fits: Math.min(usable, room) };
}

// Read a .geojson text. Options: pin { lat, lon } for the 50 km rule, taken (names already on the farm), room (fields the farm can still take).
export function readGeoJSON(textIn, opts = {}) {
  let obj;
  try { obj = JSON.parse(textIn); } catch { return { ok: false, reason: 'That file is not valid GeoJSON.' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'That file is not valid GeoJSON.' };
  const crs = obj.crs?.properties?.name;
  if (typeof crs === 'string' && !/CRS84|4326|WGS ?84/i.test(crs)) return { ok: false, reason: 'This file uses a different map system. Save it as GeoJSON in latitude and longitude (WGS84) and try again.' };
  const rows = [];
  const feature = (f, i) => geometryRows(f?.geometry, nameFrom(f?.properties) || '', opts.pin, rows);
  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) obj.features.forEach(feature);
  else if (obj.type === 'Feature') feature(obj);
  else if (['Polygon', 'MultiPolygon', 'GeometryCollection'].includes(obj.type)) geometryRows(obj, '', opts.pin, rows);
  else return { ok: false, reason: 'That file has no fields in it. Crophalo reads a GeoJSON FeatureCollection of polygons.' };
  if (!rows.length) return { ok: false, reason: 'That file has no fields in it. Crophalo reads a GeoJSON FeatureCollection of polygons.' };
  return finish(rows, opts);
}

// Read a .kml text: Placemarks that hold Polygons (the outer boundary; a hole is filled in). A tolerant reader of the few tags it needs.
const tagAll = (s, tag) => [...s.matchAll(new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'gi'))].map(m => m[1]);
const cdata = s => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
function kmlCoords(s) { return cdata(s).trim().split(/\s+/).filter(Boolean).map(t => t.split(',').map(Number)).map(c => [c[0], c[1]]); }
export function readKML(textIn, opts = {}) {
  if (!/<kml\b/i.test(textIn) && !/<Placemark\b/i.test(textIn)) return { ok: false, reason: 'That file is not KML.' };
  const rows = [], marks = tagAll(textIn, 'Placemark');
  for (const pm of marks) {
    const nm = tagAll(pm, 'name')[0], name = nm ? stripTags(cdata(nm)).slice(0, LIMITS.nameField) : '', polys = tagAll(pm, 'Polygon');
    if (!polys.length) { rows.push({ name, skipped: /<(?:LineString|LinearRing)\b/i.test(pm) ? REASON.lineString : /<Point\b/i.test(pm) ? REASON.pointOrLine : REASON.noShape }); continue; }
    polys.forEach((poly, i) => {
      const outer = tagAll(poly, 'outerBoundaryIs')[0] ?? '', coords = tagAll(outer, 'coordinates')[0], holes = tagAll(poly, 'innerBoundaryIs').length;
      if (coords == null) { rows.push({ name: polys.length > 1 ? `${name} ${i + 1}` : name, skipped: REASON.noOutline }); return; }
      const list = kmlCoords(coords), bad = list.some(c => !Number.isFinite(c[0]) || !Number.isFinite(c[1]));
      const row = bad ? { name, skipped: REASON.unreadable } : polygonRow([list].concat(holes ? [[]] : []), polys.length > 1 ? `${name} ${i + 1}` : name, opts.pin);
      rows.push(bad ? { ...row, name: polys.length > 1 ? `${name} ${i + 1}` : name } : row);
    });
  }
  if (!marks.length || !rows.length) return { ok: false, reason: 'That file has no fields in it. Crophalo reads KML placemarks that hold polygons.' };
  return finish(rows, opts);
}

// One door for a chosen file: its name and text. KMZ and zipped files are refused with a sentence; the size and emptiness first.
export function readMapFile(fileName, textIn, opts = {}) {
  if ((opts.room ?? LIMITS.fields) <= 0) return { ok: false, reason: 'A farm holds up to 40 fields.' };
  if (typeof textIn !== 'string') return { ok: false, reason: 'That file could not be read.' };
  if (textIn.length > LIMITS.mapFileBytes) return { ok: false, reason: 'That file is too big. Crophalo reads files up to 5 MB.' };
  if (!textIn.trim()) return { ok: false, reason: 'That file is empty.' };
  if (/\.kmz$/i.test(fileName || '') || textIn.startsWith('PK')) return { ok: false, reason: 'Crophalo cannot open KMZ or zipped files yet. In your map program, save the fields as KML or GeoJSON.' };
  const body = textIn.replace(/^﻿/, '').trimStart();
  if (/\.kml$/i.test(fileName || '') || body.startsWith('<')) return readKML(body, opts);
  return readGeoJSON(body, opts);
}
// The live line under the preview: "3 fields ticked", "No field ticked", "5 fields ticked. Only 3 fit: untick 2."
export function tickLine(ticked, room) {
  if (!ticked) return 'No field ticked';
  const base = `${ticked} field${ticked === 1 ? '' : 's'} ticked`;
  return ticked > room ? `${base}. Only ${room} fit: untick ${ticked - room}.` : base;
}
export function previewLine(usable, skipped, room) {
  if (!usable) return 'No field in this file can be added.';
  return `${usable} field${usable === 1 ? '' : 's'} can be added.${skipped ? ` ${skipped} skipped.` : ''} This farm has room for ${room} more.`;
}

// ---- writing files
export const farmSlug = name => (String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '')) || 'farm';
export const fileNames = farm => ({ geojson: `${farmSlug(farm.name)}-fields.geojson`, csv: `${farmSlug(farm.name)}-fields.csv` });
// A FeatureCollection, one Polygon per field in natural order, closed rings in [lon, lat] at 6 decimals. crop: names the crop for an id (or null).
export function writeGeoJSON(farm, { cropName = id => id, scenario = 'base', year } = {}) {
  const features = naturalSort(farm.fields).map(f => {
    const ring = f.ring.map(([lat, lon]) => [r(lon, 6), r(lat, 6)]);
    ring.push(ring[0].slice());
    const crop = thisSeasonCrop(farm, f, { scenario, year }), water = f.kind === 'garden' ? null : WATER_WORDS[planOf(farm, f.id, scenario)?.water ?? farm.practice.irrigation] ?? null;
    return { type: 'Feature', properties: { name: f.name, hectares: r(f.area, 2), crop: crop ? cropName(crop) : null, water }, geometry: { type: 'Polygon', coordinates: [ring] } };
  });
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}
// A cell safe to open in a spreadsheet: a leading =, +, - or @ (or a tab, or the minus sign) gets a quote in front; quotes are doubled.
export function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r−]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const CSV_COLUMNS = Object.freeze(['Field', 'Area (hectares)', 'Area (acres)', 'This season', 'Water', 'Fit', 'Past years a crop was hurt', 'Reminders']);
// rows: [{ name, ha, crop, water, fit, hurt, reminders }]; a BOM, CRLF line ends, formula-safe cells.
export function writeCSV(rows) {
  const lines = [CSV_COLUMNS, ...rows.map(x => [x.name, r(x.ha, 2), r(x.ha * 2.471054, 2), x.crop ?? '', x.water ?? '', x.fit ?? '', x.hurt ?? '', x.reminders ?? 0])];
  return '﻿' + lines.map(l => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export { outlineIssue, insideRing };
