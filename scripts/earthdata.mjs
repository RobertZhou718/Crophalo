// Where the NASA Earthdata login lives: in the Crophalo folder, in the server settings, or in the home folder.
// netrcWords() and parseNetrc() are pure; findLogin() only reads. Nothing here logs or writes. Run as a program, it prints one line for
// the starters, "yes <where>" or "no" and never a value, so they count a login as the server does: an active entry with a login and a password.
// Checked by scripts/test_server.mjs (the netrc parser, the finding order and the one line).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EARTHDATA_HOST = 'urs.earthdata.nasa.gov';
export const LOGIN_PLACES = {   // the only words the app ever says about the login: where it is kept, never what it is
  folder: 'inside the Crophalo folder (.secrets), so it moves with the folder',
  env: 'in the server settings (EARTHDATA_USERNAME and EARTHDATA_PASSWORD)',
  home: 'in your home folder (~/.netrc), so it stays on this computer',
  none: 'not set up',
};

// The words of a netrc file: split on whitespace; a "quoted" word keeps its spaces, with \" and \\ inside it.
// A word that starts with # begins a comment that runs to the end of its line, as Python's own netrc reader has it; a # inside
// a word or inside quotes is part of the word. So a login commented out is never read.
export function netrcWords(text) {
  const words = [], re = /\s+|#[^\n]*|"((?:[^"\\]|\\[\s\S])*)"|(\S+)/g;
  for (let m; (m = re.exec(String(text ?? '')));) {
    if (m[1] != null) words.push(m[1].replace(/\\(["\\])/g, '$1'));
    else if (m[2] != null) words.push(m[2]);
  }
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

// node scripts/earthdata.mjs: the starters' one question, answered for the Crophalo folder above scripts/.
const HERE = fileURLToPath(import.meta.url), real = file => { try { return fs.realpathSync(file); } catch { return path.resolve(file); } };
if (process.argv[1] && real(process.argv[1]) === real(HERE)) {
  const { where } = findLogin(path.resolve(path.dirname(HERE), '..'));
  process.stdout.write(where ? `yes ${where}\n` : 'no\n');
}
