// Crophalo's placement of the spot card on the map: kept inside the map, beside the pin, off the outline, along the bottom of a narrow map.
// All of it is pure: numbers in, a position out.
// Checked by scripts/test_spot.mjs (clamping from every corner, the side with room, keeping off the pin and an outline, the narrow map).

export const MARGIN = 8, TOP = 56, WIDE = 340, NARROW_BELOW = 520;

// A position kept inside the map: 8 px from every edge and below the tools. size and box are { w, h }; the map's own corner is 0, 0.
export const STACK_ROOM = 52;   // the view buttons down the right edge: a card beside the pin keeps clear of them
export function clampCard(pos, size, box, margin = MARGIN, top = TOP, right = 0) {
  const maxL = Math.max(margin, box.w - size.w - margin - right), maxT = Math.max(top, box.h - size.h - margin);
  return { left: Math.min(Math.max(pos.left, margin), maxL), top: Math.min(Math.max(pos.top, top), maxT) };
}
const hit = (a, b) => a.left < b.left + b.w && a.left + a.w > b.left && a.top < b.top + b.h && a.top + a.h > b.top;

// Where a new card goes: beside the pin on the side with most room, covering neither the pin nor anything in "avoid" ({ left, top, w, h } boxes).
// On a map under 520 px wide the card lies along the bottom instead. Returns { left, top, bottom: boolean }.
export function placeCard({ anchor, size, box, avoid = [], top = TOP }) {
  if (box.w < NARROW_BELOW) return { left: MARGIN, top: Math.max(top, box.h - size.h - MARGIN), bottom: true };
  const ax = anchor?.x ?? box.w / 2, ay = anchor?.y ?? box.h / 2, pin = { left: ax - 22, top: ay - 44, w: 44, h: 52 };
  const tries = [
    { left: ax + 30, top: ay - size.h / 2 }, { left: ax - 30 - size.w, top: ay - size.h / 2 },   // right of the pin, then left
    { left: ax - size.w / 2, top: ay + 16 }, { left: ax - size.w / 2, top: ay - 60 - size.h },    // below, then above
  ].map(p => clampCard(p, size, box, MARGIN, top, STACK_ROOM)).map(p => ({ ...p, w: size.w, h: size.h }));
  const clear = tries.find(t => !hit(t, pin) && !avoid.some(a => hit(t, a)));
  const best = clear || tries.find(t => !hit(t, pin)) || tries[0];
  return { left: best.left, top: best.top, bottom: false };
}

