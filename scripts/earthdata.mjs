// Where the NASA Earthdata login lives: in the Crophalo folder, in the server settings, or in the home folder.
// netrcWords() and parseNetrc() are pure; findLogin() only reads. Nothing here prints, logs or writes.
// Checked by scripts/test_server.mjs (the netrc parser and the finding order).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const EARTHDATA_HOST = 'urs.earthdata.nasa.gov';
export const LOGIN_PLACES = {   // the only words the app ever says about the login: where it is kept, never what it is
  folder: 'inside the Crophalo folder (.secrets), so it moves with the folder',
  env: 'in the server settings (EARTHDATA_USERNAME and EARTHDATA_PASSWORD)',
  home: 'in your home folder (~/.netrc), so it stays on this computer',
  none: 'not set up',
};

// The words of a netrc file: split on whitespace; a "quoted" word keeps its spaces, with \" and \\ inside it; # lines are notes.
export function netrcWords(text) {
  const lines = String(text ?? '').split(/\r?\n/).filter(line => !line.trimStart().startsWith('#')).join('\n');
  const words = [], re = /"((?:[^"\\]|\\[\s\S])*)"|(\S+)/g;
  for (let m; (m = re.exec(lines));) words.push(m[1] != null ? m[1].replace(/\\(["\\])/g, '$1') : m[2]);
  return words;
}

// The login and password that follow "machine <host>", up to the next "machine" or "default". Null unless both are there.
export function parseNetrc(text, host = EARTHDATA_HOST) {
  const words = netrcWords(text);
  let mine = false, found = {};
  const whole = () => (mine && found.login && found.password ? { login: found.login, password: found.password } : null);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === 'machine' || w === 'default') {
      if (whole()) return whole();   // the first whole entry wins
      mine = w === 'machine' && words[++i] === host; found = {};
    } else if (w === 'login' || w === 'password' || w === 'account') {
      const value = words[++i];   // the word after a key is always its value, even when it reads "machine"
      if (mine && w !== 'account' && value != null) found[w] = value;
    }
  }
  return whole();
}

const readText = file => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };

// First found wins: the folder, then the server settings, then the home folder.
// The answer says only where. What a Python lookup needs sits in a hidden `env`, so printing or sending the answer shows no value.
export function findLogin(root, { env = process.env, home = os.homedir() } = {}) {
  const answer = (where, forPython = {}) => Object.defineProperty(
    { where, words: LOGIN_PLACES[where ?? 'none'] }, 'env', { value: forPython, enumerable: false });
  const file = path.join(root, '.secrets', 'earthdata.netrc'), inFolder = parseNetrc(readText(file));
  if (inFolder) return answer('folder', { NETRC: file, EARTHDATA_USERNAME: inFolder.login, EARTHDATA_PASSWORD: inFolder.password });   // the NASA library reads only ~/.netrc, so a folder login travels in the lookup's own environment
  if (env.EARTHDATA_USERNAME && env.EARTHDATA_PASSWORD) return answer('env');
  if (home && parseNetrc(readText(path.join(home, '.netrc')))) return answer('home');
  return answer(null);
}
