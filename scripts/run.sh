#!/bin/sh
# Crophalo's start on a Mac, thirteen steps in order: find the folder, set up its own Node and Python inside it,
# ask for the NASA login once, check everything, pick a free port, open the browser and become the server.
# Options: --no-open, --port N, --login, --no-login. Settings: CROPHALO_PORT, CROPHALO_ARCH, FW_CACHE. Nothing is written
# outside the folder, except the NASA login in ~/.netrc when the owner picks that. Checked by scripts/test_portable.mjs.
set -u

# ---- 1 · the folder, from this script's own place
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." 2>/dev/null && pwd -P) || { echo "Crophalo could not find its own folder."; exit 1; }
[ -f "$ROOT/scripts/serve.mjs" ] && [ -f "$ROOT/scripts/portable.sh" ] || {
  echo "This is not a whole Crophalo folder (scripts/serve.mjs or scripts/portable.sh is missing). Copy the whole folder again; the hidden parts must come along."; exit 1; }
. "$ROOT/scripts/portable.sh"
unset PYTHONPATH PYTHONHOME   # another program's Python settings must not reach Crophalo's own Python

usage() { say "Use: sh scripts/run.sh [--no-open] [--port N] [--login] [--no-login]"; }
is_port() { case $1 in '' | *[!0-9]* | ??????*) return 1 ;; esac; [ "$1" -ge 1024 ] && [ "$1" -le 65535 ]; }
OPEN=1; ASK=auto; PORT=; RUNNING=
while [ $# -gt 0 ]; do
  case $1 in
    --no-open) OPEN=0 ;;
    --port) [ $# -ge 2 ] || { usage; exit 2; }; shift; PORT=$1 ;;
    --port=*) PORT=${1#--port=} ;;
    --login) ASK=yes ;;
    --no-login) ASK=no ;;
    -h | --help) usage; exit 0 ;;
    *) say "Unknown option: $1"; usage; exit 2 ;;
  esac
  shift
done

# ---- 2 · remember the port: a browser keeps Crophalo's saved fields per address, so a new port would look like a new browser
[ -n "$PORT" ] || PORT=${CROPHALO_PORT:-}
if [ -n "$PORT" ]; then is_port "$PORT" || { say "The port must be a number from 1024 to 65535, not \"$PORT\"."; exit 2; }
else PORT=$(cat "$RT/last-port" 2>/dev/null); is_port "$PORT" || PORT=5480; fi

# ---- 3 · can the folder be written to?
folder_writable || {
  say "This folder cannot be written to. Copy the whole Crophalo folder onto this Mac (for example into Documents)."; exit 1; }
[ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 4000 ] && tail -n 2000 "$LOG" > "$LOG.part" && mv -f "$LOG.part" "$LOG"   # the log never grows without end
log "start in $ROOT (macOS $(sw_vers -productVersion 2>/dev/null), $(uname -m))"

# ---- 4 · take macOS's download flag off every file, so the tools inside the folder may run
FREED=$(find "$ROOT" ! -type l -xattrname com.apple.quarantine -print -exec xattr -d com.apple.quarantine {} + 2>> "$LOG" | wc -l | tr -d ' ')
if [ "${FREED:-0}" -gt 0 ]; then say "Took the macOS download flag off $FREED file$([ "$FREED" = 1 ] || printf s), so Crophalo's own tools can run."; log "quarantine removed from $FREED files"; fi

# ---- 5 · which Mac, which macOS
[ "$(uname -s)" = Darwin ] || { say "This starter is for a Mac."; exit 1; }
MAC=$(mac_kind); ARCH=${CROPHALO_ARCH:-$MAC}
case $ARCH in arm64 | x86_64) ;; *) say "CROPHALO_ARCH must be arm64 or x86_64, not \"$ARCH\"."; exit 2 ;; esac
[ "$ARCH" = arm64 ] && [ "$MAC" = x86_64 ] && { say "Tools for Apple chips cannot run on an Intel Mac. Start without CROPHALO_ARCH."; exit 2; }
OSVER=$(sw_vers -productVersion 2>/dev/null); OSMAJOR=${OSVER%%.*}
case $OSMAJOR in '' | *[!0-9]*) OSMAJOR=0 ;; esac
[ "$OSMAJOR" -ge "$MACOS_MIN" ] || { say "Crophalo needs macOS $MACOS_MIN or newer. This Mac has macOS ${OSVER:-(unknown)}."; log "stopped: macOS $OSVER"; exit 1; }
RUN_ARCH=$ARCH

# ---- 6 · already running from this folder? then only open the browser. The server names its own folder (root) in /api/health;
#      the cache is no sign of it, since two folders may share one FW_CACHE. With --login (the "Add NASA login" starter) the login
#      is asked first, in step 9; the Python set-up is left alone meanwhile, and the start ends there, with no second server
URL="http://localhost:$PORT/"
ROOT_JSON=$(printf '%s' "$ROOT" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')   # as the server writes it in /api/health
case $(curl -s -m 3 "http://127.0.0.1:$PORT/api/health" 2>/dev/null) in
  *"\"root\":\"$ROOT_JSON\""* | *"\"root\": \"$ROOT_JSON\""*)
    if [ "$ASK" != yes ]; then
      say "Crophalo is already running from this folder: $URL"; log "already running on $PORT"
      [ "$OPEN" = 1 ] && open "$URL"
      exit 0
    fi
    RUNNING=1 ;;
esac

# ---- 7 · Node: the folder's own, else the Mac's when new enough, else a checked download
node_ok() { [ -n "$1" ] && [ -x "$1" ] && _nv=$("$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null) && [ "${_nv:-0}" -ge "$NODE_MIN" ]; }
NODE="$RT/node-$ARCH/bin/node"
if ! node_ok "$NODE"; then
  NODE=$(command -v node 2>/dev/null || :)
  if [ "$ARCH" != "$MAC" ] || ! node_ok "$NODE"; then
    say "Getting Node $NODE_VER for Crophalo (about 50 MB, once)…"
    NODE="$RT/node-$ARCH/bin/node"
    { get_node "$ARCH" && node_ok "$NODE"; } || {
      say "Crophalo needs Node to run and could not get it. Check the internet connection, then start again. Details: runtime/setup.log"; exit 1; }
  fi
fi
log "node $NODE"

# ---- 8 · Python 3.12 and the six libraries in .venv, rebuilt only when its fingerprint no longer matches
VENV="$ROOT/.venv"; STAMP="$VENV/crophalo-venv.txt"; WHY=
py_version() { "$1" -c 'import platform; print(platform.python_version())' 2>/dev/null; }
venv_stamp() { printf 'crophalo-venv 1\narch=%s\npython=%s\nrequirements=%s\nfolder=%s\n' "$ARCH" "$1" "$(sha256_of "$ROOT/scripts/requirements.txt")" "$ROOT"; }
imports_ok() { "$VENV/bin/python" -c "import $PY_IMPORTS" >> "$LOG" 2>&1; }
venv_ok() {   # the folder path is part of the fingerprint: a moved copy keeps the old path inside its venv and would fail without a word
  [ ! -L "$VENV" ] && [ -f "$STAMP" ] && _vb=$(find_python "$ARCH") && [ -n "$_vb" ] &&
    [ "$(cat "$STAMP")" = "$(venv_stamp "$(py_version "$_vb")")" ] && imports_ok
}
build_venv() {   # sets WHY when it fails; Crophalo's own old venv comes back then
  UV="$RT/uv-$ARCH/uv"
  get_uv "$ARCH" || { WHY="the Python installer (uv) could not be downloaded"; return 1; }
  get_python "$ARCH" || { WHY="Python $PY_SERIES could not be downloaded"; return 1; }
  get_wheels "$ARCH" || { WHY="the NASA data libraries could not be downloaded"; return 1; }
  _py=$(find_python "$ARCH")
  if [ -L "$VENV" ] || { [ -e "$VENV" ] && [ ! -f "$STAMP" ]; }; then   # someone else's: moved aside, never deleted
    mkdir -p "$RT/old"; _to="$RT/old/venv-previous"; _i=1
    while [ -e "$_to" ] || [ -L "$_to" ]; do _i=$((_i + 1)); _to="$RT/old/venv-previous-$_i"; done
    mv "$VENV" "$_to" || { WHY="the .venv that was here could not be moved aside"; return 1; }
    log "a .venv that is not Crophalo's was moved to $_to"
  elif [ -e "$VENV" ]; then
    rm -rf "$RT/venv-before"; mv "$VENV" "$RT/venv-before" || { WHY="the old .venv could not be moved aside"; return 1; }
  fi
  if in_folder "$UV" venv --python "$_py" "$VENV" >> "$LOG" 2>&1 &&
    in_folder "$UV" pip install --python "$VENV/bin/python" --no-index --find-links "$RT/wheels/$ARCH" --no-cache -r "$ROOT/scripts/requirements.txt" >> "$LOG" 2>&1 &&
    imports_ok; then
    venv_stamp "$(py_version "$_py")" > "$STAMP"; rm -rf "$RT/venv-before"; log "venv built"; return 0
  fi
  rm -rf "$VENV"; [ -d "$RT/venv-before" ] && mv "$RT/venv-before" "$VENV"
  WHY="the NASA data libraries could not be installed"; return 1
}
PY_MIN=$(pinned MACOS_MIN_PY "$ARCH")
if [ -n "$RUNNING" ]; then :   # the running server uses this .venv: it is left as it is
elif [ "$OSMAJOR" -lt "$PY_MIN" ]; then WHY="this Mac has macOS $OSVER, and they need macOS $PY_MIN or newer"
elif venv_ok; then log "venv reused: its fingerprint matches and the six libraries load"
else
  say "Setting up Python and the NASA data tools inside this folder (a few minutes, once)…"
  build_venv && say "The NASA data tools are ready."
fi
[ -z "$WHY" ] || {
  say "The NASA data tools are not set up: $WHY. Crophalo still opens; the satellite and data-server parts stay empty until this is fixed."
  log "python not set up: $WHY"; }

# ---- 9 · the NASA Earthdata login: asked once, in a Terminal window only; nothing of it is ever shown or logged
# A login counts only as the server counts it (an active entry with both a login and a password, in the folder, the settings or ~/.netrc):
# scripts/earthdata.mjs answers "yes <where>" or "no", and never prints the login itself.
has_login() { case $("$NODE" "$ROOT/scripts/earthdata.mjs" 2>/dev/null) in 'yes '*) return 0 ;; esac; return 1; }
other_logins() {   # other_logins FILE: the file without its NASA entry, word by word (another service on the same line stays), by scripts/earthdata.mjs
  "$NODE" "$ROOT/scripts/earthdata.mjs" --others "$1"
}
real_file() {   # real_file FILE: where a link leads in the end (a ~/.netrc kept in another folder stays a link to it)
  _rf=$1; _rn=0
  while [ -L "$_rf" ] && [ "$_rn" -lt 16 ]; do
    _rt=$(readlink "$_rf") || break
    case $_rt in /*) _rf=$_rt ;; *) _rf=$(dirname "$_rf")/$_rt ;; esac
    _rn=$((_rn + 1))
  done
  printf '%s' "$_rf"
}
save_login() (   # save_login FILE: only the owner can read it; written whole beside the real file, then renamed over it
  umask 077
  _sf=$(real_file "$1"); [ -L "$_sf" ] && exit 1   # links that lead in a circle: nothing is written
  mkdir -p "$(dirname "$_sf")" || exit 1
  _sp="$_sf.part.$$"   # one name per start: two starts saving at once never write into the same half-made file
  if [ -f "$_sf" ]; then other_logins "$_sf" > "$_sp" || { rm -f "$_sp"; exit 1; }; else : > "$_sp"; fi   # the other services' entries could not be read: nothing is written
  netrc_line "$ED_USER" "$ED_PASS" >> "$_sp" && chmod 600 "$_sp" && mv -f "$_sp" "$_sf" || { rm -f "$_sp"; exit 1; }
)
ask_login() {
  say ""
  say "Crophalo reads five NASA satellite products for your field. They need a free NASA Earthdata login:"
  say "  soil moisture (SMAP), groundwater (GRACE-FO), land temperature (ECOSTRESS),"
  say "  crop greenness (HLS) and wood in the trees (GEDI)."
  say "No login yet? Make one, free: https://urs.earthdata.nasa.gov/users/new"
  say "To skip, press Return. Crophalo still opens; the satellite parts then say they could not be read."
  printf 'NASA Earthdata username: '; IFS= read -r ED_USER || ED_USER=
  if [ -z "$ED_USER" ]; then
    touch "$RT/earthdata-skipped"; log "earthdata login skipped"
    say "Skipped. To add the login later: sh \"$ROOT/scripts/run.sh\" --login"; return 0
  fi
  trap 'stty echo 2>/dev/null; echo; exit 130' INT TERM HUP   # never leave the Terminal window blind
  stty -echo 2>/dev/null   # off before the question, so letters typed early do not show either
  printf 'Password (it does not show while you type): '; IFS= read -r ED_PASS || ED_PASS=
  stty echo 2>/dev/null; trap - INT TERM HUP; echo
  if [ -z "$ED_PASS" ]; then ED_USER=; say "No password was typed, so nothing was saved. Crophalo asks again at the next start."; return 0; fi
  say "Where should Crophalo keep this login?"
  say "  1  Only on this Mac (~/.netrc)"
  say "  2  Inside the Crophalo folder (.secrets/, so it moves with the folder)"
  ED_WHERE=x; ED_SAVED=
  until [ -z "$ED_WHERE" ] || [ "$ED_WHERE" = 1 ] || [ "$ED_WHERE" = 2 ]; do
    printf 'Type 1 or 2, then Return (Return alone means 1): '; IFS= read -r ED_WHERE || ED_WHERE=
  done
  if [ "$ED_WHERE" = 2 ]; then
    if save_login "$ROOT/.secrets/earthdata.netrc" && chmod 700 "$ROOT/.secrets"; then
      say "Saved inside the Crophalo folder (.secrets), so it moves with the folder."; log "earthdata login saved (folder)"; rm -f "$RT/earthdata-skipped"; ED_SAVED=1
    else say "The login could not be saved in the Crophalo folder."; fi
  elif [ -n "${HOME:-}" ] && save_login "$HOME/.netrc"; then
    say "Saved in your home folder (~/.netrc), so it stays on this Mac."; log "earthdata login saved (home)"; rm -f "$RT/earthdata-skipped"; ED_SAVED=1
    rm -f "$ROOT/.secrets/earthdata.netrc"   # an older login in the folder would be found first and hide this one
  else say "The login could not be saved in your home folder."; fi
  [ -n "$RUNNING" ] && [ -n "$ED_SAVED" ] && say "The running Crophalo uses this login from its next lookup."
  ED_USER=; ED_PASS=   # blanked: nothing of the login stays in this shell
}
case $ASK in
  no) ;;
  yes) if [ -t 0 ] && [ -t 1 ]; then ask_login; else say "The NASA login can only be typed in a Terminal window: double-click Start Crophalo.command."; fi ;;
  *) if ! has_login && [ ! -e "$RT/earthdata-skipped" ] && [ -t 0 ] && [ -t 1 ]; then ask_login; fi ;;
esac
if [ -n "$RUNNING" ]; then   # step 6 found this folder's Crophalo running: the login was asked, and nothing more is started
  say "Crophalo is already running from this folder: $URL"; log "already running on $PORT (login asked)"
  [ "$OPEN" = 1 ] && open "$URL"
  exit 0
fi

# ---- 10 · the check-up: plain lines, never blocks the start
[ -f "$ROOT/scripts/preflight.mjs" ] && { FW_PYTHON="$VENV/bin/python" "$NODE" "$ROOT/scripts/preflight.mjs" --doctor || :; }

# ---- 11 · a free port: the remembered one or one of the 49 after it; free means nobody answers on 127.0.0.1 or ::1 and it can be taken
WANTED=$PORT
PORT=$("$NODE" -e '
const net = require("net"), first = +process.argv[1];
const answers = (host, port) => new Promise(done => { const s = net.connect({ host, port }); const end = v => { s.destroy(); done(v); };
  s.setTimeout(800, () => end(false)); s.on("connect", () => end(true)); s.on("error", () => end(false)); });
const binds = port => new Promise(done => { const s = net.createServer(); s.once("error", () => done(false)); s.listen(port, "127.0.0.1", () => s.close(() => done(true))); });
(async () => { for (let p = first; p < first + 50 && p < 65536; p++)
  if (!(await answers("127.0.0.1", p)) && !(await answers("::1", p)) && await binds(p)) return console.log(p);
  process.exit(1); })();' "$WANTED") || { say "No free port from $WANTED to $((WANTED + 49)). Close other programs, or start on another port: sh scripts/run.sh --port 8080"; exit 1; }
printf '%s\n' "$PORT" > "$RT/last-port"
[ "$PORT" = "$WANTED" ] || say "Port $WANTED is in use by another program, so Crophalo uses $PORT. Your saved fields come back from the Crophalo folder."
URL="http://localhost:$PORT/"; log "port $PORT"

# ---- 12 · when the server answers, say so and open the browser (this waits beside the server, for two minutes at most)
(
  _n=0
  while [ "$_n" -lt 240 ] && kill -0 $$ 2>/dev/null; do
    case $(curl -s -m 2 "http://127.0.0.1:$PORT/api/health" 2>/dev/null) in
      *'"ok":true'* | *'"ok": true'*) say "Crophalo is running: $URL"; if [ "$OPEN" = 1 ]; then open "$URL"; fi; exit 0 ;;
    esac
    sleep 0.5; _n=$((_n + 1))
  done
) &

# ---- 13 · the server takes this shell's place, so Control-C or closing the window stops it; it listens on this computer only
cd "$ROOT" || exit 1
export PORT HOST=127.0.0.1 FW_PYTHON="$VENV/bin/python"
exec "$NODE" "$ROOT/scripts/serve.mjs"
