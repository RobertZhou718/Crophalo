// Crophalo's pictures that carry meaning: one flat 32 × 32 picture per crop in the crop's own colour, the three
// "how the field gets water" pictures, the three soil colours, the marks for each state and the crop row.
// Pure: every function returns SVG or HTML text; no page, no storage, no network. Checked by scripts/test_crops.mjs.
import { esc, own } from './words.js';
import { cropColor, cropName, entryOf } from './crops.js';

// ---- the pens: every picture is built from these six colours and the crop's own
const LEAF = '#5f9a45', STEM = '#4c7f3a', BARK = '#8a6a48', SOIL = '#a9856a', SEED = '#3a2f28', BLUE = '#3b82c4';
const mix = (hex, to, share) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - share) + to * share).toString(16).padStart(2, '0')).join('');
const dark = (hex, share = 0.25) => mix(hex, 0, share), light = (hex, share = 0.4) => mix(hex, 255, share);
const pale = hex => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0) > 600;   // a near-white crop (cotton, garlic) needs an outline to show on a white card
const ink = hex => `fill="${hex}"${pale(hex) ? ` stroke="${dark(hex, 0.35)}" stroke-width="1"` : ''}`;
const dot = (x, y, r, hex) => `<circle cx="${x}" cy="${y}" r="${r}" ${ink(hex)}/>`;
const oval = (x, y, rx, ry, hex, turn = 0) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${ink(hex)}${turn ? ` transform="rotate(${turn} ${x} ${y})"` : ''}/>`;
const shape = (d, hex) => `<path d="${d}" ${ink(hex)}/>`;
const line = (d, hex, width = 2) => `<path d="${d}" fill="none" stroke="${hex}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const dots = (list, r, hex) => list.map(([x, y]) => dot(x, y, r, hex)).join('');
const ring = (x, y, n, away, draw) => Array.from({ length: n }, (_, i) => draw(x, y - away, (360 / n) * i, x, y)).join('');   // n copies turned around a middle
const petal = (rx, ry, hex) => (x, y, turn, mx, my) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${ink(hex)} transform="rotate(${turn} ${mx} ${my})"/>`;

// ---- parts shared by many plants
const stalk = (top = 12, hex = STEM) => line(`M16 30V${top}`, hex);
const leaves = (y, hex = LEAF) => shape(`M16 ${y}c-6 0-9-3-9-7c5 0 9 2 9 7z`, hex) + shape(`M16 ${y}c6 0 9-3 9-7c-5 0-9 2-9 7z`, hex);
const ground = () => line('M4 29h24', SOIL, 2.5);
const leafAt = (x, y, turn, hex = LEAF, size = 1) => `<path d="M0 0c-4-2-5-7 0-11c5 4 4 9 0 11z" ${ink(hex)} transform="translate(${x} ${y}) rotate(${turn}) scale(${size})"/>`;
const fruitTop = (x = 16, y = 8) => line(`M${x} ${y + 2}v-4`, BARK, 1.6) + leafAt(x, y, 60, LEAF, 0.7);

// ---- the ten shapes the long list shares, each in the crop's own colour
const ear = (c, awns) => stalk(12, dark(c)) + [9, 13, 17, 21].map(y => oval(13, y, 2.3, 3.3, c, -24) + oval(19, y, 2.3, 3.3, c, 24)).join('') + oval(16, 5.5, 2.3, 3.6, c)
  + (awns ? line('M12.5 6.5L9 1M19.5 6.5L23 1M16 2.5V0M11.5 11L6.5 6M20.5 11l5-5', dark(c), 1) : '');
const panicle = c => line('M11 30C11 18 13 9 21 5', dark(c)) + [[21, 8], [24.5, 11], [19.5, 12.5], [23.5, 16], [18.5, 17.5], [22.5, 21], [15, 14]].map(([x, y]) => oval(x, y, 1.9, 3, c, 18)).join('') + leafAt(11, 26, -55, LEAF, 0.8);
const cluster = c => stalk(16) + leaves(27) + dots([[16, 4.5], [13, 8.5], [19, 8.5], [16, 10.5], [11, 13], [21, 13], [16, 15.5], [13.5, 17.5], [18.5, 17.5]], 2.7, c);
const candle = c => stalk(18) + leaves(28) + `<rect x="12.5" y="2" width="7" height="18" rx="3.5" ${ink(c)}/>` + dots([[16, 6], [16, 10.5], [16, 15]], 0.9, dark(c));
const fingers = c => stalk(15) + leaves(28) + ['M16 15C11 13 8 9 8 4', 'M16 15C14 11 13 7 13 2', 'M16 15C18 11 19 7 19 2', 'M16 15C21 13 24 9 24 4'].map(d => line(d, c, 3)).join('');
const pod = (c, { slim = false, eye = false } = {}) => oval(16, 16, 13, slim ? 3.6 : 5.6, c, -30) + line('M26.5 9.5l2.5-2.5', STEM, 1.6)
  + [[10, 19.5], [16, 16], [22, 12.5]].map(([x, y]) => dot(x, y, slim ? 1.9 : 2.9, light(c, 0.5)) + (eye ? dot(x, y, 1, SEED) : '')).join('');
const tuber = (c, { long = false, big = false } = {}) => long
  ? shape('M3 25C8 15 18 7 29 5C27 15 17 24 5 28z', c) + line('M9 21l3 3M14 16l3 3M19 12l3 3', dark(c), 1)
  : shape(big ? 'M4 17C3 9 10 5 17 6C25 6 30 11 28 19C26 27 16 29 9 26C6 24 4 21 4 17z' : 'M3 17C7 9 19 8 29 14C24 24 10 26 3 17z', c) + dots([[11, 15], [18, 19], [21, 13]], 0.9, dark(c, 0.4));
const flower = (c, kind) => kind === 'star' ? stalk(14) + leaves(27) + ring(16, 10, 5, 4.6, petal(2.4, 4.2, c)) + dot(16, 10, 1.8, '#f2d24a')
  : kind === 'bell' ? stalk(6) + leaves(28) + [[11, 9], [21, 14], [11, 19]].map(([x, y]) => shape(`M${x - 3} ${y + 5}c0-5 1-8 3-8s3 3 3 8z`, c)).join('')
  : kind === 'tuft' ? stalk(16) + leaves(27) + oval(16, 15, 5, 5.5, LEAF) + line('M12 11L10 4M14.5 10l-1-7M17.5 10l1-7M20 11l2-7', c, 2)
  : kind === 'pea' ? stalk(8) + leaves(27) + [[12, 8], [20, 12], [12, 17]].map(([x, y]) => oval(x, y, 3.4, 2.6, c, -20) + oval(x + 1.5, y + 1.5, 2, 1.6, dark(c, 0.15))).join('')
  : line('M16 30V15M16 21L9.5 14M16 19l6.5-6', STEM, 1.8) + [[16, 9], [8.5, 11], [23.5, 10]].map(([x, y]) => ring(x, y, 4, 2.6, petal(2.1, 2.1, c)) + dot(x, y, 1, dark(c, 0.3))).join('');   // dots: four small petals a flower
const coffee = c => line('M4 26L28 6', BARK, 2) + leafAt(9, 21, -110) + leafAt(17, 15, 20) + leafAt(24, 9, -110) + dots([[13, 22], [17, 21.5], [21, 15], [25, 14.5]], 2.6, c);
const palm = (c, nuts = 2.2) => line('M17 30C16 22 16 16 16 11', BARK, 3) + ['M16 11C12 5 7 5 3 8', 'M16 11C13 3 9 2 6 2', 'M16 11C18 4 21 2 25 2', 'M16 11C20 5 25 5 29 8', 'M16 11C13 11 9 12 6 16', 'M16 11C19 11 23 12 26 16'].map(d => line(d, LEAF, 2.4)).join('')
  + dots([[14, 13.5], [18, 13.5], [16, 16]], nuts, c);

// ---- single drawings
const corn = (c, kernels) => oval(16, 13, 5.6, 10.5, c) + line('M13.5 6v14M16 4v18M18.5 6v14M11 10h10M11 14h10M11 18h10', kernels, 0.8)
  + shape('M16 31C8 29 5 21 7 13c5 3 8 9 9 18z', LEAF) + shape('M16 31c8-2 11-10 9-18c-5 3-8 9-9 18z', dark(LEAF, 0.12));
const sorghum = c => stalk(16) + leaves(27) + oval(16, 9.5, 6.5, 8.5, c) + dots([[14, 6], [18, 6], [16, 9.5], [13, 12], [19, 12], [16, 15]], 1.2, light(c));
const sunflower = c => stalk(14) + leafAt(16, 26, -70) + leafAt(16, 23, 70) + ring(16, 11, 12, 6.5, petal(2.1, 4, c)) + dot(16, 11, 4.6, '#6b4423');
const chickpea = c => dot(11, 19, 6.5, c) + shape('M10 12.5l1.5-3 1.5 3z', c) + dot(21.5, 12, 5.5, light(c, 0.25)) + shape('M20.5 6.8l1.2-2.6 1.2 2.6z', light(c, 0.25));
const lentil = c => oval(11, 20.5, 6.5, 3.6, c) + oval(21.5, 19, 6.5, 3.6, dark(c, 0.18)) + oval(16, 11.5, 6.5, 3.6, light(c, 0.2));
const bean = c => shape('M8 11C12 5 24 6 26 14C28 22 19 28 13 25C10 23 13 20 13 17C13 14 7 14 8 11z', c) + oval(19, 12, 3, 1.4, light(c, 0.5), 20);
const peanut = c => oval(12, 20, 7, 6.5, c, -35) + oval(20.5, 11.5, 6, 5.6, c, -35) + line('M9 18l5 4M12 15l5 5M18 9l5 4M17 13l4 3', dark(c, 0.2), 0.9);
const bambara = c => dot(11, 19, 6.5, c) + dot(21.5, 12, 5.5, light(c, 0.2)) + dot(11, 19, 1.6, SEED) + dot(21.5, 12, 1.4, SEED);
const spike = (c, leafHex = LEAF) => stalk(18) + leaves(28, leafHex) + [[16, 4, 1.8], [14.3, 7.5, 2.1], [17.7, 7.5, 2.1], [14, 11.5, 2.4], [18, 11.5, 2.4], [13.7, 15.8, 2.6], [18.3, 15.8, 2.6], [16, 19, 2.6]].map(([x, y, r]) => dot(x, y, r, c)).join('');
const alfalfa = c => stalk(10, c) + [[16, 26, 0], [16, 19, 1]].map(([x, y, flip]) => oval(x + (flip ? 6 : -6), y - 2, 3.4, 2, c, flip ? -25 : 25) + oval(x + (flip ? 9 : -9), y - 5.5, 3.2, 2, c, flip ? -60 : 60)).join('') + dots([[16, 5], [13.5, 8], [18.5, 8], [16, 10.5]], 2.4, '#8a5fc0');
const cotton = c => line('M16 30V17M16 22l-7-6M16 20l7-6', BARK, 1.8) + [[16, 10], [8, 13], [24, 11]].map(([x, y]) => dots([[x - 2.6, y + 1], [x + 2.6, y + 1], [x, y - 2]], 3.3, c) + shape(`M${x - 2} ${y + 5}l2-3 2 3z`, BARK)).join('');
const potato = c => oval(16, 17, 11.5, 8.5, c, -14) + dots([[11, 16], [17, 13.5], [20, 19], [14, 21]], 0.9, dark(c, 0.4));
const root = (c, { plump = false } = {}) => leafAt(16, 10, -35, LEAF, 0.9) + leafAt(16, 10, 0, LEAF, 1) + leafAt(16, 10, 35, LEAF, 0.9)
  + shape(plump ? 'M8 13C8 9 24 9 24 13C24 20 19 26 16 30C13 26 8 20 8 13z' : 'M10.5 11C10.5 8.5 21.5 8.5 21.5 11C21.5 16 18 24 16 30C14 24 10.5 16 10.5 11z', c) + line('M12.5 15h3M16.5 19h3', dark(c, 0.25), 0.9);
const bulb = (c, cloves) => shape('M16 5c1 5 10 8 10 15a10 8.5 0 0 1-20 0c0-7 9-10 10-15z', c) + line(cloves ? 'M16 8v20M11.5 13c-2 5-1 11 1 14M20.5 13c2 5 1 11-1 14' : 'M16 9c-3 5-4 12-2 18M16 9c3 5 4 12 2 18', dark(c, 0.3), 0.9) + line('M14 29h4', BARK, 1.4);
const ball = (c, kind) => kind === 'stripe' ? dot(16, 17, 11.5, c) + line('M10 8c-3 5-3 13 0 18M16 5.5v23M22 8c3 5 3 13 0 18', dark(c, 0.35), 1.6)
  : kind === 'net' ? oval(16, 17, 11.5, 10.5, c) + line('M9 10c5 4 9 4 14 0M5 17c7 4 15 4 22 0M9 24c5-4 9-4 14 0M16 6.5v21', light(c, 0.55), 0.9)
  : kind === 'ribs' ? oval(9.5, 18, 6, 9, dark(c, 0.1)) + oval(22.5, 18, 6, 9, dark(c, 0.1)) + oval(16, 18, 6.5, 9.5, c) + line('M16 9c0-3 1-4 3-5', STEM, 2.2)
  : kind === 'head' ? dot(16, 17, 11.5, c) + line('M16 28V10M16 22c-4-1-7-4-8-8M16 20c4-1 7-4 8-8', dark(c, 0.2), 1.1)
  : dot(16, 18, 10.5, c) + ring(16, 9, 5, 2.6, petal(1.1, 2.8, STEM));   // plain: a tomato with its green star
const lettuce = c => dots([[9, 17], [23, 17], [16, 11], [11, 23], [21, 23]], 6, c) + dot(16, 18, 5.5, light(c, 0.35)) + line('M16 14v8M13 17l3 2 3-2', dark(c, 0.2), 0.9);
const curd = c => shape('M4 18c0 7 5 12 12 12s12-5 12-12c-4 3-8 4-12 4S8 21 4 18z', LEAF) + dots([[10, 14], [22, 14], [16, 10.5], [13, 17], [19, 17], [16, 15]], 4.2, c);
const eggplant = c => shape('M21 9C28 15 27 27 17 29C8 30 5 21 11 15C14 12 18 12 21 9z', c) + shape('M19 6l5 3-1 4-6-1-2-4z', STEM) + line('M22 7l3-4', STEM, 1.8);
const pepper = c => shape('M11 9C7 11 6 18 8 24c1 4 5 5 7 2c2 3 6 3 8-1c3-6 2-14-2-16c-3-1-7-1-10 0z', c) + line('M16 9c0-3 1-5 3-6', STEM, 2.2) + oval(12, 15, 1.2, 3, light(c, 0.45), 10);
const cucumber = c => oval(16, 16, 13, 4.8, c, -35) + dots([[10, 20.5], [14, 17.5], [18, 14.5], [22, 11.5]], 0.9, light(c, 0.5));
const okra = c => shape('M6 27C8 15 15 7 27 4C25 16 17 24 6 27z', c) + line('M9 24C13 17 19 11 25 6.5', dark(c, 0.25), 1) + line('M5 28l2-2', STEM, 2.2);
const fan = (c, n, size) => stalk(22) + Array.from({ length: n }, (_, i) => leafAt(16, 22, (i - (n - 1) / 2) * (150 / (n - 1)), c, size)).join('');   // leaves spread from one point
const tobacco = c => stalk(8) + leafAt(16, 28, -75, c, 1.5) + leafAt(16, 24, 75, c, 1.5) + leafAt(16, 18, -60, c, 1.2) + leafAt(16, 15, 60, c, 1.2) + leafAt(16, 10, 0, light(c, 0.2), 0.9);
const jute = c => line('M9 30V6M16 30V3M23 30V7', c, 2) + [[9, 12, -60], [9, 19, 60], [16, 9, 60], [16, 17, -60], [23, 13, 60], [23, 21, -60]].map(([x, y, turn]) => leafAt(x, y, turn, LEAF, 0.55)).join('');
const taro = c => line('M16 20V12', STEM, 2) + shape('M16 3c6 1 9 5 8 10c-3 0-6 0-8 2c-2-2-5-2-8-2C7 8 10 4 16 3z', LEAF) + oval(16, 24, 7, 5.5, c) + line('M10 23h12M11 26h10', dark(c, 0.25), 0.9);
const grass = (c, hasClover) => ground() + line('M7 28C7 20 6 14 4 10M11 28c0-9 1-15 3-20M15 28c0-6 1-10 3-13M24 28c0-7 1-12 4-16', c, 2) + (hasClover ? dots([[19.5, 21], [23.5, 21], [21.5, 17.8]], 2.3, dark(c, 0.3)) + line('M21.5 28v-6', dark(c, 0.3), 1.4) : '');
const sprout = c => ground() + line('M16 28V15', c, 2) + leafAt(16, 16, -50, c, 1.1) + leafAt(16, 16, 50, c, 1.1) + line('M7 28l-2-6M25 28l2-6', c, 1.6);
const vetch = c => ground() + line('M9 28V12M22 28C22 20 20 15 16 12', c, 2) + leafAt(9, 14, -45, c, 0.8) + leafAt(9, 14, 45, c, 0.8) + dots([[16, 11], [19.5, 14.5], [22, 19]], 2.3, '#8a5fc0');
const coverRoot = c => ground() + leafAt(16, 11, -35, c, 0.9) + leafAt(16, 11, 0, c, 1) + leafAt(16, 11, 35, c, 0.9) + shape('M11 12C11 10 21 10 21 12C21 18 18 24 16 28C14 24 11 18 11 12z', '#f4efe6') + shape('M11 12C11 10 21 10 21 12c0 2-.4 4-1 6H12c-.6-2-1-4-1-6z', '#b58ad0');
const cloverHead = c => ground() + line('M16 28V16', STEM, 2) + leafAt(16, 24, -70, LEAF, 0.8) + leafAt(16, 24, 70, LEAF, 0.8) + oval(16, 10, 5, 7, c) + dots([[14, 7], [18, 7], [16, 11], [14, 13.5], [18, 13.5]], 1, light(c, 0.45));
const fallow = c => shape('M2 29C6 22 11 22 16 24C21 26 26 22 30 23V30H2z', c) + line('M6 27h5M15 28h6M23 26h4', dark(c, 0.25), 1) + dot(23, 8, 4, '#f2b84a');
const tea = c => line('M16 30V13', dark(c, 0.2), 2) + leafAt(16, 22, -55, c, 1.3) + leafAt(16, 18, 55, c, 1.3) + leafAt(16, 13, 0, light(c, 0.25), 0.95);
const capNut = (c, cap) => dot(16, 18, 9.5, c) + shape('M6 16C6 9 11 5 16 5s10 4 10 11c-2-1.5-3.5-1.5-5 0c-1.6-1.5-3.4-1.5-5 0c-1.6-1.5-3.4-1.5-5 0C9.5 14.5 8 14.5 6 16z', cap) + oval(13, 21, 1.6, 2.6, light(c, 0.45), 20);
const cocoa = c => oval(16, 16, 7.5, 12.5, c, 18) + line('M14 5c-3 7-3 15 1 22M19.5 5.5c2 7 1 15-2 21', dark(c, 0.3), 1) + line('M19.5 4l1-3', BARK, 2);
const tree = (c, crown = LEAF) => line('M16 30V17M16 22l-4-3M16 21l4-3', BARK, 2.4) + dots([[11, 12], [21, 12], [16, 8], [16, 15]], 6.2, crown) + dots([[11, 11], [20, 9], [17, 15.5]], 1.8, c);
const rubber = c => line('M16 30V15', c, 4) + dots([[11, 11], [21, 11], [16, 6.5]], 6, LEAF) + line('M13.5 19l5 3', '#f4efe6', 1.6) + shape('M17.5 23h5l-1 4h-3z', dark(c, 0.3));
const banana = c => shape('M5 7c1 11 8 18 19 19c2 0 3-1 3-2C18 23 11 17 9 6C8 4 5 5 5 7z', c) + shape('M11 5c2 9 7 14 15 16c1 0 2-1 1-2C21 16 17 11 15 4c-1-2-4-1-4 1z', dark(c, 0.12)) + line('M6 6l-1-2M12 4.5l-1-2', BARK, 2);
const orange = c => dot(16, 18, 10.5, c) + dot(16, 9, 1, dark(c, 0.3)) + leafAt(17, 8.5, 65, LEAF, 0.9) + dots([[12, 16], [14, 21], [10, 20]], 0.5, dark(c, 0.2));
const olive = c => line('M4 25C12 22 20 15 28 6', BARK, 1.8) + leafAt(10, 23, -150, c, 0.8) + leafAt(15, 19.5, -20, c, 0.8) + leafAt(21, 14, -150, c, 0.8) + leafAt(25, 9.5, -20, c, 0.8) + oval(13, 25, 3, 4, dark(c, 0.35), 20) + oval(20, 20, 3, 4, dark(c, 0.15), 20);
const bunch = c => line('M16 3v5', BARK, 2) + leafAt(16, 6, 70, LEAF, 0.9) + dots([[11, 11], [16, 11], [21, 11], [13.5, 15.5], [18.5, 15.5], [16, 20], [11.5, 19.5], [20.5, 19.5], [16, 24.5]], 3.1, c) + dots([[10, 10], [15, 10], [20, 10]], 0.8, light(c, 0.5));
const apple = c => shape('M16 10c3-3 11-2 11 6c0 7-4 13-8 13c-1.5 0-2-1-3-1s-1.5 1-3 1c-4 0-8-6-8-13c0-8 8-9 11-6z', c) + fruitTop(16, 7) + oval(11, 15, 1.4, 3, light(c, 0.45), 20);
const peach = c => dot(16, 18, 10.5, c) + line('M17 8c-4 5-4 13 0 20', dark(c, 0.2), 1.2) + fruitTop(16, 7);
const drop = (c, { cut = '', top = true } = {}) => shape('M16 4c2 5 9 9 9 16a9 9 0 0 1-18 0c0-7 7-11 9-16z', c) + (top ? line('M16 5V2', BARK, 2) : '') + cut;
const sideFruit = (c, inner) => oval(16, 17, 12, 8.5, c, -25) + inner + line('M26 9l2-3', BARK, 2);
const almond = c => shape('M16 3C23 9 25 20 16 29C7 20 9 9 16 3z', c) + line('M16 7c-2 6-2 12 0 18', dark(c, 0.3), 1) + dots([[12.5, 14], [19.5, 17]], 0.6, dark(c, 0.3));
const walnut = c => dot(16, 17, 11, c) + line('M16 6v22M11 10c2 2 2 5 0 7s-2 5 0 7M21 10c-2 2-2 5 0 7s2 5 0 7', dark(c, 0.3), 1.1);
const pistachio = c => shape('M16 4C24 8 26 20 16 28C6 20 8 8 16 4z', '#d9c7a0') + shape('M16 8c4 4 5 12 0 17c-5-5-4-13 0-17z', c);
const pecan = c => oval(16, 16, 7, 12, c, 20) + line('M13 6c-2 6-2 14 1 20M19 6c2 6 2 14-1 20', dark(c, 0.3), 1.1);
const macadamia = c => dot(12, 17, 9, dark(c, 0.45)) + dot(21, 15, 7, c) + dot(21, 15, 3.6, light(c, 0.6));
const chestnut = c => shape('M16 4c1 3 11 5 11 14c0 6-5 10-11 10S5 24 5 18C5 9 15 7 16 4z', c) + shape('M7 22c2 4 5 6 9 6s7-2 9-6c-3-2-6-3-9-3s-6 1-9 3z', '#e8d3b0');
const cashew = c => shape('M9 4h14l-2 11c-1 3-9 3-10 0z', c) + shape('M9 19c4-4 12-3 14 2c1 4-3 8-7 6c3-2 2-4 0-5c-3-1-6 0-7-3z', '#b89a78');
const cane = c => [[9, 5], [16, 2], [23, 6]].map(([x, y]) => line(`M${x} 30V${y}`, c, 3.4) + line(`M${x - 1.7} ${y + 8}h3.4M${x - 1.7} ${y + 15}h3.4M${x - 1.7} ${y + 22}h3.4`, dark(c, 0.35), 1) + leafAt(x, y + 1, x < 16 ? -40 : 40, LEAF, 0.6)).join('');
const pineapple = c => oval(16, 20, 8, 9.5, c) + line('M9 17l12 10M11 13l12 10M23 17L11 27M21 13L9 23', dark(c, 0.3), 0.9) + leafAt(16, 12, -30, LEAF, 0.85) + leafAt(16, 12, 30, LEAF, 0.85) + leafAt(16, 12, 0, dark(LEAF, 0.15), 1.05);
const strawberry = c => shape('M16 29C9 25 5 18 7 12c2-3 6-3 9-1c3-2 7-2 9 1c2 6-2 13-9 17z', c) + dots([[12, 15], [20, 15], [16, 19], [12.5, 22], [19.5, 22], [16, 25]], 0.8, '#f6e3a1') + ring(16, 9, 5, 2.4, petal(1.2, 3, STEM));
const berries = c => dot(11, 19, 7, c) + dot(21.5, 13.5, 6.5, dark(c, 0.15)) + dot(19, 23.5, 4.5, light(c, 0.15)) + dots([[11, 16.5], [21.5, 11]], 1.4, dark(c, 0.5)) + leafAt(13, 9, -40, LEAF, 0.7);
const brambles = c => dots([[13, 10], [19, 10], [10.5, 15], [16, 14.5], [21.5, 15], [13, 19.5], [19, 19.5], [16, 24]], 3.3, c) + dots([[12, 9], [18, 9], [15, 13.5]], 0.8, light(c, 0.55)) + ring(16, 6, 4, 1.8, petal(1.1, 2.6, STEM));
const kiwi = c => oval(12, 17, 9, 10.5, c, -10) + dot(21, 18, 7.5, '#9cc45a') + dot(21, 18, 2.4, '#f1f1d0') + ring(21, 18, 8, 4.4, petal(0.5, 0.9, SEED));
const crown = c => dot(16, 19, 10, c) + shape('M12 10l1.2-5 2.8 3 2.8-3 1.2 5z', dark(c, 0.2));
const vineSpike = c => line('M4 6h24', STEM, 2) + leafAt(9, 6, 180, LEAF, 0.8) + leafAt(24, 6, 180, LEAF, 0.8) + dots([[16, 9], [14, 12.5], [18, 12.5], [16, 16], [14, 19.5], [18, 19.5], [16, 23], [16, 27]], 2.3, c);
const pods = (c, long) => long ? line('M8 4h16', STEM, 2) + ['M11 5C9 14 10 22 12 29', 'M16 5v24', 'M21 5c2 9 1 17-1 24'].map(d => line(d, c, 2.6)).join('')
  : [[9, 18, -25], [16, 15, 0], [23, 18, 25]].map(([x, y, turn]) => `<path d="M0-10c4 4 4 15 0 20c-4-5-4-16 0-20z" ${ink(c)} transform="translate(${x} ${y}) rotate(${turn})"/>`).join('') + line('M16 5V2', STEM, 2);
const quills = c => [[9, -18], [16, -18], [23, -18]].map(([x, turn], i) => `<rect x="${x - 2.5}" y="4" width="5" height="24" rx="2.5" ${ink(i === 1 ? c : dark(c, 0.15))} transform="rotate(${turn} ${x} 16)"/>`).join('') + line('M7 12l5 1M21 20l5 1', light(c, 0.4), 0.9);
const hops = c => line('M16 2v4', STEM, 2) + leafAt(16, 5, 75, LEAF, 0.8) + [[16, 8, 3.2], [12.8, 11.5, 3.4], [19.2, 11.5, 3.4], [16, 14, 3.6], [12.5, 17.5, 3.6], [19.5, 17.5, 3.6], [16, 20.5, 3.6], [14, 24, 3.2], [18, 24, 3.2], [16, 27, 2.6]].map(([x, y, r], i) => dot(x, y, r, i % 2 ? c : dark(c, 0.14))).join('');
const sisal = c => ground() + [-62, -42, -21, 0, 21, 42, 62].map(turn => `<path d="M-2 0L0-16L2 0z" ${ink(turn % 2 ? dark(c, 0.15) : c)} transform="translate(16 28) rotate(${turn})"/>`).join('');
const spears = c => ground() + [[9, 12], [16, 5], [23, 10]].map(([x, y]) => line(`M${x} 28V${y + 4}`, c, 3) + shape(`M${x - 2.2} ${y + 5}C${x - 2.2} ${y + 1} ${x} ${y - 1} ${x} ${y - 2}C${x} ${y - 1} ${x + 2.2} ${y + 1} ${x + 2.2} ${y + 5}z`, dark(c, 0.2))).join('');

// ---- which drawing each crop gets (the crop's colour comes from the crop table, so picture and halo always match)
const DRAW = {
  corn: c => corn(c, dark(c, 0.2)), sweetcorn: c => corn(c, light(c, 0.6)),   // sweet corn is corn with paler kernels
  wheat: c => ear(c), swheat: c => ear(c), durum: c => ear(c), barley: c => ear(c, true), rye: c => ear(c, true), triticale: c => ear(c, true),
  oats: panicle, rice: panicle, teff: panicle, quinoa: cluster, buckwheat: cluster, pmillet: candle, fmillet: fingers, sorghum,
  soy: c => pod(c), pea: c => pod(c), faba: c => pod(c), cowpea: c => pod(c, { eye: true }), pigeonpea: c => pod(c), mung: c => pod(c, { slim: true }), greenbean: c => pod(c, { slim: true }),
  chickpea, lentil, bean, groundnut: peanut, bambara, lupin: c => spike(c), alfalfa,
  sunflower, canola: c => flower(c), scanola: c => flower(c), mustardseed: c => flower(c), mustard: c => ground() + flower(c),   // spring canola is canola
  sesame: c => flower(c, 'bell'), safflower: c => flower(c, 'tuft'), flax: c => flower(c, 'star'), sunnhemp: c => ground() + flower(c, 'pea'),
  cotton, hemp: c => fan(c, 7, 1.15), jute, tobacco,
  potato, sweetpotato: c => tuber(c), cassava: c => tuber(c, { long: true }), yam: c => tuber(c, { big: true }), taro,
  sugarbeet: c => root(c, { plump: true }), carrot: c => root(c), onion: c => bulb(c), garlic: c => bulb(c, true),
  tomato: c => ball(c), watermelon: c => ball(c, 'stripe'), melon: c => ball(c, 'net'), pumpkin: c => ball(c, 'ribs'), cabbage: c => ball(c, 'head'),
  lettuce, cauliflower: curd, eggplant, pepper, cucumber, okra, spinach: c => fan(c, 3, 1.5),
  ley: c => grass(c, true), ryecover: sprout, vetchmix: vetch, radish: coverRoot, clover: cloverHead, fallow,
  tea, hazelnut: c => capNut(c, LEAF), coffee, robusta: coffee, cocoa, oilpalm: c => palm(c), datepalm: c => palm(c), coconut: c => palm(c, 3),
  rubber, banana, citrus: orange, olive, grape: bunch, apple, stonefruit: peach, almond, walnut, pistachio, pecan, macadamia, chestnut, cashew,
  mango: c => sideFruit(c, oval(13, 16, 2, 4, light(c, 0.4), -25)), avocado: c => drop(c, { cut: shape('M16 8c1.5 4 6 7 6 12a6 6 0 0 1-12 0c0-5 4.5-8 6-12z', '#cfe08a') + dot(16, 20.5, 3.4, '#8a5a36') }),
  fig: c => drop(c), pomegranate: crown, guava: c => dot(13, 17, 9.5, c) + dot(21.5, 19, 7, '#f4a6a0') + dots([[20, 18], [23, 18], [21.5, 21]], 0.7, '#f6e3a1') + fruitTop(13, 6),
  lychee: c => dot(13, 18, 9, c) + dots([[10, 15], [14, 14], [12, 19], [16, 20], [9.5, 21]], 0.8, dark(c, 0.3)) + dot(22.5, 20, 6, '#f6efe2') + fruitTop(13, 7.5),
  passionfruit: c => dot(13, 17, 9.5, c) + dot(22, 19, 6.5, '#f2c14e') + dots([[20.5, 18], [23.5, 18.5], [22, 21]], 0.9, SEED) + fruitTop(13, 6),
  papaya: c => sideFruit(c, oval(16, 17, 6.5, 3.2, light(c, 0.45), -25) + dots([[13, 18.5], [16, 17], [19, 15.5]], 0.9, SEED)),
  sugarcane: cane, pineapple, strawberry, blueberry: berries, raspberry: brambles, kiwi,
  blackpepper: vineSpike, cardamom: c => pods(c), vanilla: c => pods(c, true), cinnamon: quills, hops, sisal, asparagus: spears, trees: c => tree('#e0563a', c),
};

// ---- the frame: a picture is decorative (the word beside it is what a screen reader reads) unless a label is given
const side = (size, usual) => +size > 0 ? +size : usual;   // a size that is not a number above 0 falls back to the picture's usual one
const frame = (body, label, size, usual = 32) => `<svg class="pic" viewBox="0 0 32 32" width="${side(size, usual)}" height="${side(size, usual)}" focusable="false" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${body}</svg>`;

// The picture of a field crop, a cover crop, fallow or a garden crop; '' for anything that is not in the crop table.
export const hasPic = id => own(DRAW, id) && !!entryOf(id);
export const cropPic = (id, { label = '', size = 32 } = {}) => hasPic(id) ? frame(DRAW[id](cropColor(id)), label, size) : '';

// ---- how the field gets water: rain only, some watering, full irrigation
const WATER = {
  none: shape('M9 17a5 5 0 0 1 1-10a7 7 0 0 1 13 1a4.5 4.5 0 0 1 0 9z', '#b9c3cf') + line('M11 21l-2 5M17 21l-2 5M23 21l-2 5', BLUE, 2),
  limited: shape('M6 13h14v14H6z', BLUE) + line('M20 16l7-5M26 9l3 3M9 13V8h8v5', BLUE, 2.2) + line('M28 15l1 3M25 16v3', light(BLUE, 0.3), 1.6),
  full: line('M16 30V14M10 30h12', '#6b7480', 2.2) + line('M16 14C12 8 8 7 4 9M16 14c4-6 8-7 12-5M16 14V5', BLUE, 2) + dots([[4, 13], [28, 13], [10, 5], [22, 5]], 1.1, BLUE),
};
export const WATER_KINDS = Object.freeze(Object.keys(WATER));
export const waterPic = (kind, { label = '', size = 32 } = {}) => own(WATER, kind) ? frame(WATER[kind], label, size) : '';

// ---- the three soil colours a farmer picks from: darker soil usually holds more plant matter
export const SOIL_COLORS = Object.freeze({ low: '#d9c3a0', med: '#a0714a', high: '#4a3226' });
export const soilPic = (om, { label = '', size = 32 } = {}) => own(SOIL_COLORS, om) ? frame(dot(16, 16, 13, SOIL_COLORS[om]) + line('M8 11h7M18 14h6M10 18h5M17 21h7', mix(SOIL_COLORS[om], 255, 0.25), 1.6), label, size) : '';   // a round swatch with a few flat crumbs: straight marks only, so it never reads as a face

// ---- the marks for each state: every one has its own shape, so a state never rests on colour alone; they take the text colour
const NOW = 'fill="currentColor"', PEN = 'fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"';
const MARKS = {
  good: `<circle cx="16" cy="16" r="9" ${NOW}/>`,                                               // tile status: a dot
  watch: `<circle cx="16" cy="16" r="9" ${PEN}/>`,                                              // a ring
  risk: `<path d="M16 5L28 26H4z" ${NOW}/>`,                                                    // a triangle
  unclear: `<path d="M11 12a5 5 0 1 1 7.5 4.3c-1.6 1-2.5 2-2.5 4.2" ${PEN}/><circle cx="16" cy="26" r="2" ${NOW}/>`,   // a question mark
  fails: `<circle cx="16" cy="16" r="11" ${PEN}/><path d="M11.5 11.5l9 9M20.5 11.5l-9 9" ${PEN}/>`,   // flag "Doesn't suit here": a crossed circle
  borderline: `<circle cx="16" cy="16" r="11" ${PEN}/><path d="M16 5a11 11 0 0 0 0 22z" ${NOW}/>`,    // flag "Only just suits": a half-full circle
  risky: `<path d="M19 3L7 18h8l-2 11l12-15h-8z" ${NOW}/>`,                                       // flag "Often hurt in past years": a bolt
  holds: `<circle cx="16" cy="16" r="11" ${PEN}/><path d="M10.5 16.5l4 4l7-8" ${PEN}/>`,          // flag "Holds up": a ticked circle
  ok: `<path d="M6 17l7 7L26 9" ${PEN}/>`,                                                       // a past year that was fine: a tick
  close: `<path d="M4 18c4-6 8-6 12 0s8 6 12 0" ${PEN}/>`,                                        // a close call: a wave
  hurt: `<path d="M8 8l16 16M24 8L8 24" ${PEN}/>`,                                                // a year the crop was hurt: a cross
  nodata: `<path d="M7 16h18" ${PEN}/>`,                                                          // no data: a dash
  growing: `<path d="M16 28V14" ${PEN}/><path d="M16 15c-7 0-9-4-9-8c6 0 9 3 9 8zM16 15c7 0 9-4 9-8c-6 0-9 3-9 8z" ${NOW}/>`,   // still growing: a sprout
};
export const MARK_KINDS = Object.freeze(Object.keys(MARKS));
export const markPic = (kind, { label = '', size = 16 } = {}) => own(MARKS, kind) ? frame(MARKS[kind], label, size, 16).replace('class="pic"', 'class="pic mark"') : '';

// ---- the crop row: "corn › soybeans › wheat", a cover crop small after the crop it follows. slots are crop ids, one per year;
// covers, when given, holds the cover crop id (or nothing) for the same year; only a cover crop is drawn there, never a cash crop or a tree.
// Names are read in order; the arrows are decoration.
export function cropRow(slots, covers = []) {
  const item = (id, i) => {
    const cover = hasPic(covers[i]) && entryOf(covers[i]).type === 'cover' ? `<span class="croprow-cover">${cropPic(covers[i])}<span>${esc(cropName(covers[i], true))}</span></span>` : '';
    return `<span class="croprow-crop" role="listitem">${cropPic(id)}<span>${esc(cropName(id, true))}</span>${cover}</span>`;
  };
  const known = (Array.isArray(slots) ? slots : []).map((id, i) => hasPic(id) ? item(id, i) : '').filter(Boolean);
  return known.length ? `<span class="croprow" role="list">${known.join('<span class="croprow-next" aria-hidden="true">›</span>')}</span>` : '';
}
