// The offline suite of the Layers panel of My farm's 3D view: the list the 3D handle gives is cleaned, each row says what the farmer sees, what is being read, or that it could not be read, and the panel uses the map's own Layers look.
// RULE: never loosen a check here without a written farming reason beside it. Run: node scripts/test_farmlayers.mjs
import { layersModel, layersHTML, stateWords, buttonWords, LINES } from '../js/farmlayers.js';
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.log(`FAIL  ${name}${detail === '' ? '' : `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})`}`); } };
const same = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);

const raw = [
  { id: 'picture', name: 'Satellite picture', on: true, state: 'ready', source: 'NASA HLS', date: '7 Nov' },
  { id: 'slope', name: 'Slope', on: false, state: 'idle' },
  { id: 'frost', name: 'Frost pockets', on: true, state: 'loading' },
  { id: 'erosion', name: 'Erosion exposure', on: true, state: 'failed' }, { id: 'greenness', name: 'Greenness', state: 'idle', needs: true, line: 'Needs the weak-spots answer.' }, { id: 'objects', name: 'Buildings', on: false, legend: [{ label: 'Roof', color: '#cc5533' }, { label: 'Road', color: 'red);x' }] },
  { id: '', name: 'No id' }, { id: 'x' }, null, 'text',
];
const m = layersModel(raw);
same('rows without an id or a name are dropped, nothing empty is promised', m.map(r => r.id), ['picture', 'slope', 'frost', 'erosion', 'greenness', 'objects']);
same('a missing list is no rows', [layersModel(undefined), layersModel(null), layersModel('x')], [[], [], []]);
check('every row has one line of what the farmer sees, from the 3D look or from ours', m.every(r => r.line.length > 10 && r.line.length < 100), m.map(r => r.line));
check('the first list is written', ['picture', 'slope', 'sunshade', 'erosion', 'frost', 'greenness', 'objects', 'plants'].every(id => LINES[id]));
same('loading says what is being read', stateWords(m[2]), 'Reading frost pockets…');
same('a failed layer says so in a plain sentence', stateWords(m[3]), 'Erosion exposure could not be read just now. Try again later.');
same('a layer that is fine says nothing extra', [stateWords(m[0]), stateWords(m[1])], ['', '']);
same('the button counts what is on', [buttonWords([]), buttonWords(m)], ['Layers', 'Layers · 3']);
same('picture and plants are switches, the others are one choice', [layersModel([{ id: 'picture', name: 'a' }, { id: 'plants', name: 'b' }, { id: 'slope', name: 'c' }]).map(r => r.group)], [['switch', 'switch', 'one']]);
const html = layersHTML(m);
check('the panel uses the map\'s own Layers look', /mapx-phead/.test(html) && /mapx-lset/.test(html) && /mapx-rows/.test(html) && (html.match(/mapx-lrow/g) || []).length === 7);
check('each row is a checkbox with its layer id, the ones on are checked', (html.match(/<input type="checkbox" data-layer="/g) || []).length === 1 && (html.match(/type="radio"/g) || []).length === 6 && /data-layer="picture" checked/.test(html) && !/data-layer="slope" checked/.test(html));
check('a loading row is announced as a status and a failed one is not a promise', /role="status"><span class="sr">Reading frost pockets/.test(html) && /class="sk"/.test(html) && /mapx-lrow on off/.test(html));
check('the source and date sit under Show more, only for a layer that has them', (html.match(/Show more/g) || []).length === 1 && /Source: NASA HLS\. Date: 7 Nov\./.test(html));
check('words that stay out of the panel', !/not read yet|not built|stub|hook|engine|lookup/i.test(html.replace(/<[^>]+>/g, ' ')));
check('markup in a name is written out, never run', !/<script/.test(layersHTML(layersModel([{ id: 'a', name: '<script>x</script>' }]))));
const ask = layersHTML(m, { ask: { greenness: 'Find weak spots' } }), noask = layersHTML(m);
check('a layer that waits for an answer My farm can ask for has that button; without one the row is off', /data-ask="greenness">Find weak spots/.test(ask) && !/data-ask/.test(noask) && /data-layer="greenness" disabled/.test(noask) && !/data-layer="greenness" disabled/.test(ask));
check('the legend of a layer that is on is shown, and a colour that is not a colour is dropped', /fw-lkey/.test(layersHTML(layersModel([{ id: 'objects', name: 'B', on: true, legend: [{ label: 'Roof', color: '#cc5533' }, { label: 'Road', color: 'red);x' }] }]))) && !/red\);x/.test(layersHTML(layersModel([{ id: 'objects', name: 'B', on: true, legend: [{ label: 'Road', color: 'red);x' }] }]))));
check('Nothing over the picture is the first choice of the one-at-a-time group and is chosen when none is on', /Nothing over the picture/.test(html) && /name="fwLayerOne" data-layer="" checked/.test(layersHTML(layersModel([{ id: 'slope', name: 'S' }]))));
console.log(`${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
