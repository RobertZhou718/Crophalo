// Finds words that must never appear in the project: the names of writing helpers, their makers, and words that sign a file as theirs.
// The words themselves are not written here, only salted SHA-256 fingerprints, so this file names nothing. Pure: no page, no network.
// Used by scripts/test.mjs, test_sources.mjs, test_engine.mjs and test_cropsnear.mjs.
import { createHash } from 'node:crypto';

const print = word => createHash('sha256').update('crophalo:' + word).digest('hex').slice(0, 16);
const WORDS = new Set(['5ce79f1cd61144e6', 'b6fd787ad8db94c8', '6b8b412bbcb198f0', '6314f04a01ba8148', '14d913d347b76221', 'dfec1609760946c3', '4e8e8250a3486111',
  '813a8406d3bf8e39', 'd1f038b27c3c8f65', 'a1d1c901d44f7ce8', '2b63c7ab9dfa288d', '53c48a0d73a16535', '9f46bbd277f807a3', '1754750a7de7c724', '996072e7c7963d09',
  '5f9d8842bf55e862', '50ba296c2748883f']);
const PAIRS = new Set(['8c361679abb2bb02', '89cc00cd9dc61605', '60f6f64d66352449', 'dd424275cfe1a90d', '86082a8cbdcdecbe', '8e020211ff1833eb', '73c9741b2d7012d5']);
const CAPITALS = new Set(['ee00335b74b6fde4']);   // a two-letter short form, written in capitals
const FILES = new Set(['89c13a24c38e81a3', 'cb7266d1df4e90af', 'a0fbcd9616b166d4', 'adbe70132c407ece', '42ed2c6c51577d43']);

// The flagged words in a text, as fingerprints with their line numbers (never the words themselves).
export function flagged(text) {
  const hits = [];
  String(text).split('\n').forEach((line, i) => {
    const words = line.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    words.forEach((w, k) => {
      if (WORDS.has(print(w))) hits.push({ line: i + 1, print: print(w) });
      if (k && PAIRS.has(print(`${words[k - 1]} ${w}`))) hits.push({ line: i + 1, print: print(`${words[k - 1]} ${w}`) });
    });
    for (const m of line.matchAll(/\b[A-Z](?:\.?[A-Z])\b\.?/g)) { const w = m[0].replace(/\./g, ''); if (CAPITALS.has(print(w))) hits.push({ line: i + 1, print: print(w) }); }
  });
  return hits;
}
// True when a file or folder path has a part named after one of them.
export const badPath = rel => String(rel).toLowerCase().split('/').some(part => FILES.has(print(part)) || part.split(/[^a-z]+/).filter(Boolean).some(w => WORDS.has(print(w))));
