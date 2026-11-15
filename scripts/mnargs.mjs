// The arguments of the Market News lookups /api/mnfield and /api/mnyear (scripts/live/mnfield.py): checked here, lat and lon snapped to 0.05 degrees here (the rows have no snap), crops sorted.
// Pure: mnArgs(q) and mnYearArgs(q) take the request's URLSearchParams and return the argument list, or { reason } in plain words. Checked by scripts/test_mnfield.mjs.
const STEP = 0.05;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const CROP = /^[a-z]{2,12}$/;
const MODES = ['now', 'hay', 'cost'];
const REGION = /^[A-Za-z][A-Za-z .'-]{0,59}$/;

const get = (q, name) => String((q && typeof q.get === 'function' ? q.get(name) : q?.[name]) ?? '').trim();
const snap = v => {
  const s = (Math.round(v / STEP) * STEP).toFixed(2);
  return s === '-0.00' ? '0.00' : s;
};

function place(q) {
  const lat = get(q, 'lat'), lon = get(q, 'lon');
  if (!NUMBER.test(lat) || !NUMBER.test(lon) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return { reason: 'lat and lon are required (decimal degrees)' };
  return [snap(Number(lat)), snap(Number(lon))];
}

// /api/mnfield?lat=&lon=&mode=now|hay|cost&crops=a,b  ->  [lat, lon, mode, 'a,b'] (crops may be empty: the state report only)
export function mnArgs(q) {
  const at = place(q);
  if (!Array.isArray(at)) return at;
  const mode = get(q, 'mode');
  if (!MODES.includes(mode)) return { reason: 'mode must be now, hay or cost' };
  const crops = get(q, 'crops').split(',').map(s => s.trim()).filter(Boolean);
  if (crops.length > 16 || !crops.every(c => CROP.test(c))) return { reason: 'crops must be Crophalo crop ids' };
  return [...at, mode, [...new Set(crops)].sort().join(',')];
}

// /api/mnyear?lat=&lon=&crop=&region=  ->  [lat, lon, 'year', crop, region] (whether the region is one of the report's own is checked by the lookup)
export function mnYearArgs(q) {
  const at = place(q);
  if (!Array.isArray(at)) return at;
  const crop = get(q, 'crop'), region = get(q, 'region');
  if (!CROP.test(crop)) return { reason: 'crops must be Crophalo crop ids' };
  if (!REGION.test(region)) return { reason: 'This region is not in the report' };
  return [...at, 'year', crop, region];
}
