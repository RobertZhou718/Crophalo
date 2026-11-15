// Crophalo's "What do you grow?" step, the rules and the words, with no page: which rotation to suggest from what the crop map shows around the field, the four cards under "Or choose", what stays folded
// under "More rotations", and the sentence that says a rotation in plain words. The map shows which crops cover the land, never the order they follow, so the suggestion is the ready rotation made only of crops that cover the most land.
// Pure: rankPresets(), stepPlan(), thenWords(), repeatWords(), rotationLine(), moreGroups(), previewWords(), listedFilter(). Checked by scripts/test_cropstep.mjs (the ranking on recorded-shape answers, each phase, the words, the groups).
import { PRESETS, GARDENS, presetIds, gardenIds, cropName } from './crops.js';
import { FLOOR_HA, LITTLE_HA, COMMON } from './nearby.js';

const fin = Number.isFinite;
export const FIXED_SET = Object.freeze(['corn-soy', 'corn-soy-wheat', 'canola-wheat', 'wheat-barley']);   // shown when the crop map says nothing: the ready rotations that fit most temperate farms
export const MAPS = Object.freeze({ CA: 'Agriculture and Agri-Food Canada crop map', US: 'USDA Cropland Data Layer' });
// The owner's rule (14 November): when the crop map cannot check what is grown around a field in Ontario, nothing unchecked is suggested and only the crops Statistics Canada lists for Ontario are offered.
// One switch (on) and one list. The ready rotations, the folded groups and the "Build my own" crop chooser all read it; a rotation is offered only when every crop in it is on the list (a fallow or cover year is always fine).
export const ONTARIO_LISTED = Object.freeze(['corn', 'soy', 'wheat', 'swheat', 'oats', 'barley', 'canola', 'scanola', 'bean', 'pea', 'alfalfa', 'ley', 'potato']);
export const OFFER_ONLY_LISTED = Object.freeze({ on: true, crops: ONTARIO_LISTED, source: 'Statistics Canada, field crops grown in Ontario' });
const REST = new Set(['fallow', 'cover']);
export const inOntario = (lat, lon) => fin(lat) && fin(lon) && lat >= 41.6 && lat <= 56.9 && lon >= -95.2 && lon <= -74.3;   // a rough box round the province: only used to decide whether the Ontario list applies
export const listedRotation = (id, list = ONTARIO_LISTED) => !!PRESETS[id] && id !== 'custom' && PRESETS[id].slots.every(x => list.includes(x) || REST.has(x));
export const listedFilter = (ids, restrict = null) => (restrict ? ids.filter(id => listedRotation(id, restrict.crops)) : ids);

export const WORDS = Object.freeze({
  heading: 'What do you grow?', helper: '',
  suggestTitle: 'Suggested for your field', demoTitle: 'The demo field’s rotation', demoSource: 'Set for the demo; your field gets its own.',
  loading: 'Looking for what grows near you…', loadingSub: '',
  noMap: 'We couldn’t check what farmers grow here. Pick what you grow below.', tooLittle: 'The crop map shows too little farmland around here to suggest anything. Pick what you grow below.',
  noCountry: 'The crop map covers Canada and the United States only. Pick what you grow below.', noneFit: 'No ready rotation is made only of crops that cover much of the land around here. Pick what you grow below.',
  order: 'The map shows which crops cover the land, not the order they follow. The order here is the usual one.',
  chooseHead: 'Or choose', chooseHeadNone: 'Choose', more: 'More rotations', buildOwn: 'Build my own', buildSub: 'Choose each year yourself',
  grains: 'Grains and beans', trees: 'Trees, vines and bushes', veg: 'Vegetables, roots and other crops', vegNote: 'There is no ready rotation for these. Use “Build my own” and pick each year.',
  addYear: '+ Add a year', needs: 'Pick what you grow to go on.', picked: name => `${name} chosen.`, suggestedPicked: name => `Suggested rotation chosen: ${name}.`,
  rotationPicked: line => `Chosen: ${line}`, treePicked: name => `Chosen: ${name}, a crop that stays for several years.`,
  restricted: source => `Only crops from ${source} are shown.`,
  garden: 'The USDA crop map shows an orchard, vineyard or other crop that stays for years at your field. Crophalo does not plan rotations for these. It will show your weather, frost, rain, slope and soil.', gardenMore: (code, name, year) => `Crop map class ${code}${name ? `, ${name}` : ''}, USDA Cropland Data Layer${year ? ` ${year}` : ''}.`,
  previewEmpty: 'Choose a crop for year 1 to see your rotation.',
});
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const low = id => cropName(id, true).toLowerCase();
export const thenWords = slots => { const s = (Array.isArray(slots) ? slots : []).filter(id => cropName(id, true)); return s.length ? cap(s.map(low).join(', then ')) : ''; };
export const repeatWords = n => (n <= 1 ? 'the same crop every year' : `repeats every ${n} years`);
export const rotationLine = slots => { const t = thenWords(slots); return t ? `${t}, ${repeatWords(slots.length)}` : ''; };
export const previewWords = custom => { const s = (Array.isArray(custom) ? custom : []).filter(Boolean); if (!s.length) return WORDS.previewEmpty; return `${thenWords(s)}, ${repeatWords(s.length)}`; };

// The ready rotations ranked by what the crop map shows around the field: a rotation counts only when every crop in it covers at least 3 in 100 of the farmland (and 250 ha); its score is the middle of its crops' shares.
// A one-crop rotation and a rotation with a fallow year are never suggested. Returns { read, reason?, ranked: [{ id, score, shares }], year, km, source, farmHa }.
export function rankPresets(answer) {
  if (!answer || typeof answer !== 'object') return { read: false, reason: 'noMap' };
  if (answer.ok !== true) return { read: false, reason: 'noMap' };
  const source = MAPS[answer.country];
  if (!source) return { read: false, reason: 'noCountry' };
  if (!fin(answer.cropland_ha) || !Array.isArray(answer.crops)) return { read: false, reason: 'noMap' };
  if (answer.cropland_ha < FLOOR_HA) return { read: false, reason: 'tooLittle' };
  const own = new Map(answer.crops.filter(c => c && typeof c.crop === 'string' && fin(c.share) && fin(c.ha)).map(c => [c.crop, c]));
  const box = answer.box, ns = box ? (box.north - box.south) * 111.2 : NaN, ew = box ? (box.east - box.west) * 111.32 * Math.cos((box.north + box.south) / 2 * Math.PI / 180) : NaN;
  const km = fin(ns) && fin(ew) ? Math.max(5, Math.round(Math.min(ns, ew) / 2 / 5) * 5) : null;
  const ranked = [];
  for (const id of presetIds()) {
    const slots = PRESETS[id].slots;
    if (id === 'custom' || slots.length < 2 || slots.includes('fallow')) continue;
    const shares = {}; let ok = true;
    for (const s of slots) { const c = own.get(s); if (!c || c.ha < LITTLE_HA || c.share < COMMON) { ok = false; break; } shares[s] = c.share; }
    if (ok) ranked.push({ id, score: slots.reduce((t, s) => t + shares[s], 0) / slots.length, shares });
  }
  ranked.sort((a, b) => b.score - a.score || presetIds().indexOf(a.id) - presetIds().indexOf(b.id));
  return ranked.length ? { read: true, ranked, year: String(answer.year ?? answer.data_date ?? ''), km, source, farmHa: answer.cropland_ha } : { read: false, reason: 'noneFit' };
}
const list = items => items.length < 2 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
export const sourceLine = r => { const top = Object.keys(r.ranked[0].shares).map(low); return `Most farmland within ${r.km ?? 10} km: ${list(top).toLowerCase()} (${r.source}${r.year ? `, ${r.year}` : ''}).`; };

// What the step shows: { phase: 'demo'|'loading'|'suggest'|'nomap', suggested: { id, title, line, source, note }|null, cards: [id × up to 4], message }.
// crop: { status: 'idle'|'loading'|'read'|'failed', answer } for this place; demo: the ready rotation id of the demo region, or null.
// listed: { crops: [ids], source: 'name' } for a region whose list comes from data (for the United States, the crops the USDA crop map shows for the state); it wins over the Ontario list. Without either, nothing is restricted.
export function stepPlan({ crop = { status: 'idle' }, demo = null, ontario = false, flag = OFFER_ONLY_LISTED, listed = null } = {}) {
  const fixed = id => FIXED_SET.filter(f => f !== id);
  if (demo && PRESETS[demo]) return { phase: 'demo', suggested: { id: demo, title: WORDS.demoTitle, line: rotationLine(PRESETS[demo].slots), source: WORDS.demoSource, note: '' }, cards: fixed(demo).slice(0, 4), message: '', restrict: null };
  if (crop.status === 'idle' || crop.status === 'loading') return { phase: 'loading', suggested: null, cards: [...FIXED_SET].slice(0, 4), message: WORDS.loading, restrict: null };
  const pin = crop.status === 'read' ? crop.answer?.pin : null;
  if (pin && pin.kind === 'garden') return { phase: 'garden', suggested: null, cards: [], message: WORDS.garden, more: WORDS.gardenMore(pin.code ?? '', pin.name ?? '', crop.answer?.year ?? ''), garden: Array.isArray(pin.ids) ? pin.ids.filter(x => typeof x === 'string') : [], restrict: null };   // an orchard, a vineyard or another crop that stays: one plain sentence, no rotation
  const r = crop.status === 'read' ? rankPresets(crop.answer) : { read: false, reason: 'noMap' };
  if (!r.read) { const use = listed?.crops?.length && listed.source ? listed : flag.on && ontario ? flag : null, restrict = use ? { crops: use.crops, source: use.source, note: WORDS.restricted(use.source) } : null; return { phase: 'nomap', suggested: null, cards: listedFilter([...FIXED_SET], restrict).slice(0, 4), message: WORDS[r.reason] ?? WORDS.noMap, restrict }; }
  const top = r.ranked[0], rest = r.ranked.slice(1).map(x => x.id);
  const cards = rest.slice(0, 4);   // only rotations the map has checked: a crop it does not see around the field is never padded in
  return { phase: 'suggest', suggested: { id: top.id, title: WORDS.suggestTitle, line: rotationLine(PRESETS[top.id].slots), source: sourceLine(r), note: WORDS.order }, cards, message: '', restrict: null };
}
// The rotations not on the big cards, folded and grouped. Vegetables have no ready rotation: their group is a pointer to "Build my own".
export function moreGroups(shown = [], restrict = null) {
  const grains = listedFilter(presetIds().filter(id => id !== 'custom' && !shown.includes(id)), restrict);
  return restrict ? [{ id: 'grains', title: WORDS.grains, presets: grains }] : [{ id: 'grains', title: WORDS.grains, presets: grains }, { id: 'trees', title: WORDS.trees, gardens: gardenIds() }, { id: 'veg', title: WORDS.veg, note: WORDS.vegNote }];
}
export const gardenName = id => GARDENS[id]?.name ?? '';
