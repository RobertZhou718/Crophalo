// Which optional data keys and logins this server holds, as yes or no only (GET /api/keys, served by scripts/serve.mjs); a value is never read into an answer, only whether each setting is there.
// The same file and setting names as scripts/live/groundlib.py. Checked by scripts/test_keys_route.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { findLogin } from './earthdata.mjs';

// name -> [the files in .secrets/ (the first is the one to use; the others are read too, so a key saved before keeps working), the host's setting, what it is in words]
export const KEY_SETTINGS = Object.freeze({
  nass: [['nass-quickstats.key', 'nass-key'], 'CROPHALO_NASS_KEY', 'USDA NASS Quick Stats key'],
  ams: [['ams-marketnews.key', 'ams-key'], 'CROPHALO_AMS_KEY', 'USDA AMS Market News key'],
  openet: [['openet.key', 'openet-key'], 'CROPHALO_OPENET_KEY', 'OpenET key'],
  openetOn: [['openet-on'], 'CROPHALO_OPENET_ON', 'OpenET switched on by the site owner (the word yes)'],
  metno: [['metno-identity'], 'CROPHALO_METNO_IDENTITY', 'the site address and contact for MET Norway, after its terms were read and accepted'],
});

export const secretsDir = (root, env = process.env) => path.resolve(env.CROPHALO_SECRETS_DIR || path.join(root, '.secrets'));

function filled(file) {   // a regular file with something in it; its content is not read
  try { const st = fs.statSync(file); return st.isFile() && st.size > 0 && st.size < 4096; } catch { return false; }
}
function saysYes(file) {   // only the switch file is read, and only to see whether it holds the word yes
  try { return fs.readFileSync(file, 'utf8').trim().toLowerCase() === 'yes'; } catch { return false; }
}

// { ok, nass, ams, openet, openetOn, metno, earthdata }: true or false each. openet is true only with the key AND the owner's own switch.
export function keysStatus(root, env = process.env, home) {   // home: where findLogin looks for a home-folder login (the checks give it an empty folder)
  const dir = secretsDir(root, env), there = name => { const [files, setting] = KEY_SETTINGS[name]; return !!String(env[setting] ?? '').trim() || files.some(f => filled(path.join(dir, f))); };
  const on = String(env[KEY_SETTINGS.openetOn[1]] ?? '').trim().toLowerCase() === 'yes' || saysYes(path.join(dir, KEY_SETTINGS.openetOn[0][0]));
  let earthdata = false;
  try { earthdata = !!findLogin(root, home === undefined ? { env } : { env, home }).where; } catch { earthdata = false; }
  return { ok: true, nass: there('nass'), ams: there('ams'), openet: there('openet') && on, openetOn: on, metno: there('metno'), earthdata };
}
