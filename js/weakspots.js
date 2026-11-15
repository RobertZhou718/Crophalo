// "Weak spots in this field": places in the field that stayed less green than the rest in most clear satellite pictures (NASA HLS, 30 m squares), found from the lookup's own answer.
// Pure: greenSpots() applies the rules to the answer, pins() groups touching squares into at most three numbered spots, classify() turns a failed answer into its plain state.
// Rules: R1 only squares wholly inside count, under 30 is too small. R2 a pass counts at 60 % clear and a median greenness of 0.35 or more. R3 in a pass the least green fifth is weak. R4 a spot is weak in 2 of 3 counted passes and 5 or more (under 5 passes: too few).
// R6 touching spot squares make a group of 3 or more; at most 3 pins, the biggest first. It never says why. Checked by scripts/test_weakspots.mjs on the recorded answers.
export const MIN_INSIDE = 30, CLEAR_SHARE = 0.6, MEDIAN_MIN = 0.35, WEAK_SHARE = 0.2, MIN_PASSES = 5, MIN_GROUP = 3, MAX_PINS = 3, HA_PER_SQUARE = 0.09;
const median = list => { const v = [...list].sort((a, b) => a - b), n = v.length; return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : NaN; };

// The plain state of an answer that is not ok, from the lookup's own reason.
export function classify(answer) {
  const why = String(answer?.reason || '');
  if (/login|earthdata|credential|authori[sz]|sign in/i.test(why)) return 'nologin';
  if (/too big|over 2 km|2 km across/i.test(why)) return 'toobig';
  if (/too small/i.test(why)) return 'toosmall';
  return 'down';
}
// answer: { cells[{ id, corners, lat, lon, inside }], passes[{ date, sensor, ndvi[] }] } -> { ok, state, cells (the spot squares), passes (counted), inside, reason? }
export function greenSpots(answer) {
  if (!answer?.ok) return { ok: false, state: classify(answer), cells: [], passes: [] };
  const cells = Array.isArray(answer.cells) ? answer.cells : [], passes = Array.isArray(answer.passes) ? answer.passes : [], inside = cells.filter(c => c.inside);
  if (inside.length < MIN_INSIDE) return { ok: false, state: 'toosmall', cells: [], passes: [], inside: inside.length };
  const index = new Map(cells.map((c, k) => [c.id, k])), counted = [];
  for (const p of passes) {
    if (!Array.isArray(p.ndvi) || p.ndvi.length !== cells.length) continue;
    const clear = inside.filter(c => Number.isFinite(p.ndvi[index.get(c.id)]));
    if (clear.length / inside.length >= CLEAR_SHARE && median(clear.map(c => p.ndvi[index.get(c.id)])) >= MEDIAN_MIN) counted.push({ pass: p, clear });
  }
  if (counted.length < MIN_PASSES) return { ok: false, state: 'nopass', cells: [], passes: counted.map(c => c.pass), inside: inside.length, count: counted.length };
  const weak = new Map(inside.map(c => [c.id, 0])), of = new Map(inside.map(c => [c.id, 0]));
  for (const { pass, clear } of counted) {
    const order = [...clear].sort((a, b) => pass.ndvi[index.get(a.id)] - pass.ndvi[index.get(b.id)] || a.id - b.id), take = Math.ceil(WEAK_SHARE * clear.length);
    for (const c of clear) of.set(c.id, of.get(c.id) + 1);
    for (const c of order.slice(0, take)) weak.set(c.id, weak.get(c.id) + 1);
  }
  const spots = inside.filter(c => weak.get(c.id) >= MIN_PASSES && weak.get(c.id) * 3 >= 2 * of.get(c.id)).map(c => ({ ...c, weak: weak.get(c.id), of: of.get(c.id) }));
  return { ok: true, state: spots.length ? 'found' : 'none', cells: spots, passes: counted.map(c => c.pass), inside: inside.length };
}
// Touching squares (sharing a side: two corners) of the spot squares make groups; the pins are the biggest groups, at most three.
const keyOf = ([la, lo]) => `${la.toFixed(6)},${lo.toFixed(6)}`;
export function pins(green) {
  const cells = green?.cells || []; if (!cells.length) return [];
  const byCorner = new Map(); cells.forEach((c, k) => c.corners.forEach(p => { const key = keyOf(p); (byCorner.get(key) || byCorner.set(key, []).get(key)).push(k); }));
  const near = cells.map(() => new Set());
  for (const list of byCorner.values()) for (const a of list) for (const b of list) if (a !== b) near[a].add(b);
  const shared = (a, b) => { const ka = new Set(cells[a].corners.map(keyOf)); return cells[b].corners.filter(p => ka.has(keyOf(p))).length >= 2; };
  const seen = new Set(), groups = [];
  for (let k = 0; k < cells.length; k++) {
    if (seen.has(k)) continue;
    const group = [], stack = [k]; seen.add(k);
    while (stack.length) { const a = stack.pop(); group.push(a); for (const b of near[a]) if (!seen.has(b) && shared(a, b)) { seen.add(b); stack.push(b); } }
    groups.push(group);
  }
  return groups.filter(g => g.length >= MIN_GROUP).sort((a, b) => b.length - a.length || a[0] - b[0]).slice(0, MAX_PINS).map((g, i) => {
    const mid = [g.reduce((s, k) => s + cells[k].lat, 0) / g.length, g.reduce((s, k) => s + cells[k].lon, 0) / g.length];
    const at = g.map(k => cells[k]).sort((a, b) => Math.hypot(a.lat - mid[0], a.lon - mid[1]) - Math.hypot(b.lat - mid[0], b.lon - mid[1]))[0];
    return { n: i + 1, lat: at.lat, lon: at.lon, squares: g.length, ha: Math.round(g.length * HA_PER_SQUARE * 10) / 10, weak: at.weak, of: at.of, cells: g.map(k => cells[k]) };
  });
}
