// Crophalo's words for the setup map: every line, button, refusal, toast and spoken sentence of the map and its spot card, in one table, each hint in four forms (mouse, touch, key, cross).
// All of it is pure: no page, no storage, no network.
// Checked by scripts/e2e_maptools.mjs (the words for each hand, what is said, the refusals) and scripts/test_geo.mjs (the unit words).

export const SAY = {
  help: 'Arrow keys move the map. Plus and minus zoom. 1 and 2 choose Rectangle and Corners. Space puts a corner at the cross in the middle of the map. Enter finishes an outline. Backspace takes away the last corner. Escape stops drawing.',
  mapName: 'Field map', toolGroup: 'Map tool', baseGroup: 'Map base', viewGroup: 'Map view', barName: 'Drawing',
  tool: { pin: 'Field', rect: 'Rectangle', poly: 'Corners' },
  toolSaid: { pin: 'Field selected.', rect: 'Rectangle tool.', poly: 'Corners tool.' },
  pinFar:   { mouse: 'Zoom in to your field: click near it, or search with Places.', touch: 'Zoom in to your field: tap near it, or search with Places.', key: 'Zoom in with the plus key, or search with Places.' },
  pinFirst: { mouse: 'Drag on the map to draw your field.', touch: 'Tap the corners of your field to draw it.', key: 'Move the map until the cross is on your field, then press Space.' },
  pin:      { mouse: 'Draw your field here: drag a rectangle, or click its corners.', touch: 'Draw your field here: drag a rectangle, or tap its corners.', key: 'Press Space to put a corner of your field at the cross.' },
  pinRing:  { mouse: 'Click your outline to change it. Drag a corner to move it.', touch: 'Tap your outline to change it. Touch and hold a corner to move it.', key: 'Tab to the corners to change them.' },
  drawFar:  { mouse: 'Zoom in to your field to draw it. Click it to zoom in.', touch: 'Zoom in to your field to draw it. Tap it to zoom in.', key: 'Zoom in to your field with the plus key to draw it.', cross: 'Zoom in to your field to draw it: pinch, or tap the plus button.' },
  rect0:    { mouse: 'Drag on the map to draw your field, or click 2 corners along one side.', touch: 'Tap 2 corners along one side of your field. Pinch to zoom.', key: 'Put the cross on a corner of your field, then press Space.' },
  rectHere: { mouse: 'Draw your field here: drag a rectangle, or click its corners.', touch: 'Draw your field here: drag a rectangle, or tap its corners.', key: 'Press Space to put a corner of your field at the cross.' },
  rect1:    { mouse: 'Click the next corner along the same side.', touch: 'Tap the next corner along the same side.', key: 'Move the cross to the next corner along the same side, then press Space.' },
  rect2:    { mouse: 'Click the far side of your field.', touch: 'Tap the far side of your field.', key: 'Move the cross to the far side of your field, then press Space.' },
  rectBox:  'Let go to finish the box.',
  poly0:    { mouse: 'Click each corner of your field.', touch: 'Tap each corner of your field. Pinch to zoom.', key: 'Put the cross on a corner of your field, then press Space.' },
  poly1:    { mouse: 'Click the next corner.', touch: 'Tap the next corner.', key: 'Move the cross to the next corner, then press Space.' },
  poly3:    { mouse: 'Click the next corner, or click the first corner to finish.', touch: 'Tap the next corner, or tap the first corner to finish.', key: 'Press Space for the next corner, or Enter to finish.', cross: 'Tap Add corner for the next corner, or bring the cross to the first corner to finish.' },
  polyClose:{ mouse: 'Click to close the outline.', touch: 'Tap the first corner to close the outline.', key: 'Press Space or Enter to close the outline.', cross: 'Tap Close outline to finish.' },
  edit:     { mouse: 'Drag a corner to move it. Click + to add a corner.', touch: 'Touch and hold a corner to move it. Tap + to add a corner.', key: 'Tab to a corner and move it with the arrow keys. Delete takes it away.', cross: 'Tap a corner, move the map to put the cross where it belongs, then tap Move corner here.' },
  corner: (i, n) => `Corner ${i} of ${n}`,
  cornerHelp: 'Arrow keys move it. Delete takes it away. Insert adds a corner after it.',
  pinName: 'The place of your field', pinHelp: 'The place of your field is worked out from its outline.',
  btn: { undo: 'Undo', finish: 'Finish', cancel: 'Cancel', done: 'Done', precise: 'Precise', putPin: 'Put place here', movePin: 'Move place here',
    setCorner: 'Set corner', setFar: 'Set far side', addCorner: 'Add corner', closeOutline: 'Close outline', moveCorner: 'Move corner here',
    removeCorner: 'Remove corner', use: 'Use for my report', used: 'Used in your report', edit: 'Edit outline', again: 'Start again', changeField: 'Change field', exit: 'Exit full-screen map' },
  view: { in: 'Zoom in', out: 'Zoom out', field: 'Zoom to your field', here: 'Take me to where I am', full: 'Full-screen map', exit: 'Exit full-screen map' },
  about: '≈', linesCross: 'Lines cross', selected: 'Selected area', usedChip: 'Used in report', title: 'Your outlined area',
  figureLine: (second, n) => `${second} · ${n} corners`,
  aboutSpot: 'About this place', base: { sat: 'Satellite', light: 'Map' },

  // the refusals: the bar shows them for 4 s, and they are said once
  no: {
    rectNear: 'Tap the second corner further along the side.',
    farSide: 'Put the far side further from the first side.',
    thinBox: 'That is a line, not a field. Drag a wider box.',
    fewCorners: 'A field needs at least 3 corners.',
    cross: 'Lines can\'t cross. Put this corner where they don\'t.',
    closeCross: 'The closing line crosses another. Add a corner or undo one.',
    tooMany: 'Up to 100 corners.',
    tooBig: first => `That is larger than one field can be (over ${first}). Zoom in and outline one field.`,
    zoomCorners: 'Zoom in to change the corners.',
    finishNeeds: 'Finish needs at least 3 corners.',
  },
  // the toasts, each with Undo
  toast: { used: 'Your outline is used for the report.', drawing: 'Drawing removed.', poly: 'Corners drawing removed.', rect: 'Rectangle drawing removed.', outline: 'Outline removed.', moved: 'Field moved.', movedOut: 'Outline removed: your field moved.' },
  // what the screen reader hears, one message for each event
  said: {
    corner: n => `Corner ${n} added.`,
    cornerSoFar: (n, spoken) => `Corner ${n} added, about ${spoken} so far.`,
    firstSet: 'First corner set.',
    sideSet: len => `Side set, ${len}. Now the far side.`,
    atFirst: 'At the first corner. Space closes the outline.',
    outlined: (spoken, n) => `Field outlined: ${spoken}, ${n} corners.`,
    pinInside: 'The place of your field now sits inside it.',
    cornerGone: n => `Corner ${n} removed. ${n - 1} left.`,
    reopened: n => `Outline open again, ${n} corners.`,
    cornerBack: 'Corner moved back.',
    cornerMoved: (i, m, dir) => `Corner ${i} moved about ${m} m ${dir}.`,
    cornerAdded: n => `Corner added. ${n} corners.`,
    cornerRemoved: n => `Corner removed. ${n} left.`,
    fieldMoved: (m, dir) => `Field moved about ${m} m ${dir}.`,
    kept: spoken => `Outline kept: ${spoken}.`,
    usedNow: 'It is used for your report.',
    using: spoken => `Using your field outline, ${spoken}, for the report.`,
    usedChanged: spoken => `Your report now uses the changed outline: ${spoken}.`,
    preciseOn: 'Precise on. Move the map to put the cross on the spot.',
    preciseOff: 'Precise off.',
    zoomedIn: 'Zoomed in. Now tap your field.',
    draftBack: 'Your unfinished outline is back.',
    drawingBack: n => `Drawing back, ${n} ${n === 1 ? 'corner' : 'corners'}.`,
    outlineBack: spoken => `Outline back: ${spoken}.`,
    redone: 'Done again.',
    nothing: 'Nothing to undo.',
    viewOpen: 'Drawing view. Back or Exit returns to the setup.',
  },
  next: 'Your outline is not in the report yet. Press Use for my report to use its area.',
  units: { acres: 'acres', acre: 'acre', ha: 'ha', hectares: 'hectares', hectare: 'hectare', m: 'm', km: 'km', ft: 'ft', mi: 'mi', metres: 'metres', feet: 'feet' },
  dirs: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'],
  settings: { label: 'Area', auto: 'Automatic', acres: 'Acres', hectares: 'Hectares' },

  // the words kept from before, word for word
  dropFirst: 'Draw your field first: drag a rectangle on the map.',
  noLocate: 'This browser cannot share its location. Search for a place instead.',
  locateOff: 'Location is switched off for this site. Allow it in your browser settings, or search for a place or paste coordinates instead.',
  locateFailed: 'Your device could not find its position (weak signal or timed out). Move outdoors and try again, or search for a place.',
  satellite: 'Satellite map', light: 'Street map',
  card: { opened: (tab, title) => `${tab} card opened for ${title}`, tabs: { weather: 'Weather', area: 'Area', sun: 'Sun' }, done: 'Done', drawFirst: 'Draw an outline to see its area.', elevation: 'Elevation', slope: 'Slope of the field', corners: 'Corners', notRead: 'not read yet', heights: 'Heights for the outline come from the height map once that lookup is switched on. Crophalo does not guess them.' },
};

// The words of one hinted entry for the hand in use. A missing cross form is the key form with "then press Space" turned into "then tap" the bar's step button.
export function says(entry, hand, button = SAY.btn.setCorner) {
  if (typeof entry === 'string') return entry;
  if (hand === 'cross') return entry.cross ?? (entry.key ?? '').replace('then press Space', `then tap ${button}`);
  return entry[hand] ?? entry.mouse;
}
