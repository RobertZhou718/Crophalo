// Crophalo's grey skeletons for the map's panels: while something loads, grey lines in the shape of what is coming (never an empty area, never only a word), so nothing jumps when the answer arrives.
// Pure: it only builds html. The look is css/app.css (.sk) and css/map.css (.sk-block). A screen reader is told in words (role=status) and the grey shapes are hidden from it. Checked by scripts/test_skeleton.mjs.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SHAPES = Object.freeze({
  weather: '<i class="sk num"></i><i class="sk" style="width:55%"></i><i class="sk" style="width:80%"></i><i class="sk" style="width:70%"></i><i class="sk pill" style="width:100%"></i>',
  sun: '<i class="sk title"></i><i class="sk" style="width:85%"></i><i class="sk" style="width:60%"></i><i class="sk" style="width:75%"></i>',
  area: '<i class="sk num" style="width:140px"></i><i class="sk" style="width:60%"></i><i class="sk pill"></i><i class="sk" style="width:100%;height:150px;border-radius:12px"></i>',
  list: '<i class="sk title"></i><i class="sk" style="width:90%"></i><i class="sk title" style="width:50%"></i><i class="sk" style="width:80%"></i><i class="sk title" style="width:55%"></i><i class="sk" style="width:70%"></i>',
  rows: '<i class="sk" style="height:44px;border-radius:12px"></i><i class="sk" style="height:44px;border-radius:12px"></i><i class="sk" style="height:44px;border-radius:12px"></i>',
});
export const SHAPE_NAMES = Object.freeze(Object.keys(SHAPES));
// words: what a screen reader hears ("Getting the weather here…"); shape: one of SHAPE_NAMES.
export const skeleton = (shape, words) => `<div class="sk-block" role="status" aria-live="polite"><span class="sr">${esc(words)}</span><div class="sk-lines" aria-hidden="true">${SHAPES[shape] ?? SHAPES.list}</div></div>`;
