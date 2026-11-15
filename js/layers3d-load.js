// The layers of the 3D view, from the lookups to the scene: it asks the satellite picture once for each piece of land, keeps which layers are on (the picture, and one drape at a time over it),
// works the drape out from the height grid, and says in the same plain terms for each layer whether it is ready, still loading, failed (with its one sentence) or needs something. It never makes the view wait:
// a scene is drawn at once with what has arrived, and drawn again when a layer's answer comes. It runs in the 3D worker, or on the page where there is none. Fetch and the canvas are handed in, so a test needs no server.
// Checked by scripts/test_layers3d.mjs and scripts/e2e_farm3d.mjs.
import { loadPicture } from './picture3d.js';
import { LAYER_LIST, DRAPES, drapeOf, drapeWords, legendOf, greenSquares, erosionFactorOf, NEEDS_HEIGHTS, NEEDS_EROSION, NEEDS_GREENNESS } from './layers3d.js';

const blockKey = slab => `${Math.round(slab.lat * 1e4) / 1e4}:${Math.round(slab.lon * 1e4) / 1e4}:${Math.round(slab.width)}:${Math.round(slab.depth)}`;

// env: { fetchImpl, makeCanvas(w, h), bitmap(blob), say(id) } (say is told when a layer's state changes, so the view draws again)
export function createLayers({ fetchImpl, makeCanvas, bitmap, say = () => {} } = {}) {
  let pendingGreen = null, closed = false, block = '', picture = { on: true, state: 'loading', result: null }, drape = null, drapeCache = null, erosionIn = null, greenAnswer = null, green = null, plants = true;
  const pictureNote = () => picture.state === 'ready' ? (picture.result.complete ? '' : 'Part of the picture could not be read, so some of the ground is plain.') : picture.state === 'failed' ? picture.result.reason : '';
  function wantPicture(slab) {
    const k = blockKey(slab);
    if (k !== block) { block = k; picture = { ...picture, state: picture.on ? 'loading' : 'off', result: null, asked: false }; drapeCache = null; }
    if (!picture.on || picture.asked) return;
    picture.asked = true; const mine = picture;
    loadPicture(slab, { fetchImpl, makeCanvas, bitmap }).then(r => { if (closed || mine !== picture) return; picture.result = r; picture.state = r.ok ? 'ready' : 'failed'; say('picture'); },
      () => { if (closed || mine !== picture) return; picture.result = { ok: false, reason: 'The satellite picture could not be read right now.' }; picture.state = 'failed'; say('picture'); });
  }
  const model = sc => (sc.heights?.model && !sc.heights.model.flat ? sc.heights.model : null);
  // the drape of the layer that is on, worked out once for a grid of heights (and for the same inputs)
  const drapeFor = sc => {
    if (!drape) return null;
    const m = model(sc); if (drape !== 'greenness' && !m) return null;
    const stamp = drape === 'greenness' ? green : drape === 'erosion' ? erosionIn : null;
    if (drapeCache?.id === drape && drapeCache.h === (m?.h ?? null) && drapeCache.stamp === stamp) return drapeCache.d;
    const d = drapeOf(drape, m, { green, erosion: erosionIn }); drapeCache = { id: drape, h: m?.h ?? null, stamp, d }; return d;
  };
  function stateOf(id, sc) {
    if (id === 'picture') return picture.on ? picture.state : 'off';
    if (id === 'greenness') return green?.squares?.length ? 'ready' : greenAnswer ? 'failed' : 'needs';
    const m = model(sc), failedHeights = sc.heights?.status === 'failed';
    if (id === 'erosion' && erosionFactorOf(erosionIn) === null) return m || failedHeights ? 'needs' : 'loading';
    if (m) return 'ready';
    return failedHeights || sc.heights?.status === 'flat' ? 'failed' : 'loading';
  }
  // The list the page shows: every layer with whether it is on, its state, its one line, the credit and date it needs, and the legend of a drape.
  function layers(sc) {
    return LAYER_LIST.map(l => {
      const on = l.id === 'picture' ? picture.on : drape === l.id, state = stateOf(l.id, sc), isPic = l.id === 'picture';
      const note = isPic ? pictureNote() : l.id === 'greenness' ? (state === 'needs' ? NEEDS_GREENNESS : state === 'failed' ? String(greenAnswer?.reason || 'The weak-spots look had no clear square to draw.') : '') : l.id === 'erosion' && state === 'needs' ? NEEDS_EROSION : state === 'failed' ? (sc.heights?.status === 'failed' ? String(sc.heights.words || NEEDS_HEIGHTS) : NEEDS_HEIGHTS) : '';
      const d = !isPic && on && state === 'ready' ? drapeFor(sc) : null;
      return { id: l.id, name: l.name, line: [l.line, on && d ? drapeWords(l.id, d) : '', note].filter(Boolean).join(' '), on, state, credit: isPic && picture.state === 'ready' ? picture.result.credit : '', date: isPic && picture.state === 'ready' ? picture.result.date : '', legend: on && !isPic ? legendOf(l.id) : [] };
    });
  }
  return {
    want: sc => wantPicture(sc.slab),
    layers,
    setLayer(id, on) {
      if (id === 'plants') { plants = !!on; say(id); return true; }
      const l = LAYER_LIST.find(x => x.id === id); if (!l) return false;
      if (id === 'picture') { picture.on = !!on; picture.state = !on ? 'off' : picture.result ? (picture.result.ok ? 'ready' : 'failed') : 'loading'; if (on && !picture.result) picture.asked = false; }
      else drape = on ? id : (drape === id ? null : drape);
      say(id); return true;
    },
    // what the scene is given to paint: the picture (a canvas with its credit) and the drape (a small raster), and a key that changes only when the paint must
    attach(sc) {
      this.want(sc);
      if (pendingGreen && sc.slab) { green = greenSquares(pendingGreen, sc.slab); pendingGreen = null; drapeCache = null; }
      sc.hidePlants = !plants;
      const d = drapeFor(sc), pic = picture.on && picture.state === 'ready' ? picture.result : null;
      sc.picture = pic ? { canvas: pic.canvas, z: pic.z, credit: pic.credit } : null;
      sc.drape = d ? { id: d.id, w: d.w, h: d.h, rgba: d.rgba, polys: d.polys } : null;
      sc.paintKey = `${plants ? '' : 'np|'}${pic ? `p${pic.z}:${pic.credit.length}:${pic.complete ? 1 : 0}` : 'p0'}|${d ? `${d.id}:${d.drawn}` : 'd0'}|${model(sc) ? 'h1' : 'h0'}`;
      return sc;
    },
    // My farm hands over what two layers need: the soil and the rain for the erosion index ({ factor } or { soil: { sand, silt, clay, carbon }, mfi }), and the weak-spots answer for the greenness squares
    setErosion(input) { erosionIn = input && erosionFactorOf(input) !== null ? input : null; drapeCache = null; say('erosion'); },
    setGreenness(answer, slab) { greenAnswer = answer ?? null; green = answer && slab ? greenSquares(answer, slab) : null; if (answer && !slab) pendingGreen = answer; drapeCache = null; say('greenness'); },
    setPlants(on) { plants = !!on; say('plants'); },
    plants: () => plants,
    state: () => ({ picture: picture.state, drape, plants }),
    dispose() { closed = true; },
  };
}
export const DRAPE_IDS = DRAPES;
