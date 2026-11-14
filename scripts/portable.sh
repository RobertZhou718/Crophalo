# Crophalo's own tools: the pinned versions and hashes, and the functions that fetch and check them.
# Sourced by run.sh and pack-runtimes.sh with ROOT set (the container start can source it for netrc_line);
# it runs nothing by itself. Pure text helpers: pinned, netrc_word, netrc_line. Checked by scripts/test_portable.mjs.

# ---- pinned versions and hashes
# Node 22 LTS is supported until the end of April 2027. After that: set NODE_VER to the newest LTS and
# replace the two hashes with the ones in https://nodejs.org/dist/v<version>/SHASUMS256.txt.
NODE_VER=22.23.5
NODE_SHA_arm64=e7131995759b61a0170b646010d2ad35a5d37b4cb0d471f3e8317eac6f742f3d    # node-v22.23.5-darwin-arm64.tar.gz
NODE_SHA_x86_64=c53383238206b9ae4db23c5d8a63645e2e753bec8ab51a49cc81939aa64e9422   # node-v22.23.5-darwin-x64.tar.gz
NODE_DIST=https://nodejs.org/dist
NODE_MIN=20   # the oldest Node the server runs on; the Mac's own node is used from here up

# uv installs Python and the libraries. A new version needs both hashes, from the release's .sha256 files.
UV_VER=0.13.7
UV_SHA_arm64=81b811b57e4624df7ed3aac148e0359100d9962f3d9dce00aec533dc2e086731    # uv-aarch64-apple-darwin.tar.gz
UV_SHA_x86_64=20c47e4c1f630b8abaff8c291fa9b9aa300fef92c4fbff95adf198b55287cda7   # uv-x86_64-apple-darwin.tar.gz
UV_DIST=https://github.com/astral-sh/uv/releases/download
# uv's archive holds no licence text, so the two licences it is offered under are fetched from its source at the same version.
UV_SOURCE=https://raw.githubusercontent.com/astral-sh/uv
UV_LICENSE_SHA_MIT=860e3d7a86b84e6a7012c7a635fc64df475cebc6cce34dfeb73a5982ec58176c      # LICENSE-MIT
UV_LICENSE_SHA_APACHE=c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4   # LICENSE-APACHE

PY_SERIES=3.12
PY_IMPORTS='earthaccess, h5py, netCDF4, numpy, rasterio, openpyxl'   # the six of requirements.txt; preflight.mjs reads this line too

MACOS_MIN=11                          # Crophalo itself (Node 22 needs it)
MACOS_MIN_PY_arm64=14                 # the oldest macOS the six libraries have ready-built files for
MACOS_MIN_PY_x86_64=12
WHEEL_TAG_arm64=macosx_14_0_arm64     # pip also takes files built for older systems than the tag
WHEEL_TAG_x86_64=macosx_12_0_x86_64

EARTHDATA_HOST=urs.earthdata.nasa.gov

RT="$ROOT/runtime"
LOG="$RT/setup.log"

# ---- small helpers
say() { printf '%s\n' "$*"; }
log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG" 2>/dev/null || :; }
pinned() { eval "printf '%s' \"\$${1}_$2\""; }   # pinned NODE_SHA x86_64: the value kept for that kind of Mac
mac_kind() { [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ] && printf arm64 || printf x86_64; }   # true to the chip, also under Rosetta
kind_name() { [ "$1" = arm64 ] && printf 'Apple chip' || printf 'Intel'; }
sha256_of() { shasum -a 256 "$1" 2>/dev/null | cut -d ' ' -f 1; }
folder_writable() {   # the folder itself and runtime/: .venv, .cache and the saved fields are made at the top, so a writable runtime/ alone is not enough
  mkdir -p "$RT" 2>/dev/null || return 1
  for _fw in "$ROOT" "$RT"; do { touch "$_fw/.write-test-$$" && rm -f "$_fw/.write-test-$$"; } 2>/dev/null || return 1; done
}

in_folder() {   # run uv or pip with every file it keeps inside the folder: nothing in the home folder, no outside settings
  mkdir -p "$RT/tmp" "$RT/python" "$RT/uv-cache" || return 1
  UV_PYTHON_INSTALL_DIR="$RT/python" UV_PYTHON_BIN_DIR="$RT/python/bin" UV_CACHE_DIR="$RT/uv-cache" \
    UV_NO_CONFIG=1 UV_MANAGED_PYTHON=1 UV_PYTHON_DOWNLOADS=manual UV_NO_PROGRESS=1 \
    PIP_CONFIG_FILE=/dev/null PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_INPUT=1 PYTHONNOUSERSITE=1 \
    TMPDIR="$RT/tmp" "$@"
}

# ---- the NASA login as one netrc line (the container start writes it with the same quoting)
netrc_word() (   # a value with anything but A-Za-z0-9 . _ @ + = , : / - goes in "quotes", with \ and " escaped
  LC_ALL=C; export LC_ALL   # byte by byte, so any letter of any alphabet is quoted the same way everywhere
  case $1 in
    '' | *[!A-Za-z0-9._@+=,:/-]*) printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')" ;;
    *) printf '%s' "$1" ;;
  esac
)
netrc_line() { printf 'machine %s login %s password %s\n' "$EARTHDATA_HOST" "$(netrc_word "$1")" "$(netrc_word "$2")"; }

# ---- downloads
quiet_curl() { curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 20 --speed-limit 2000 --speed-time 40 "$@" >> "$LOG" 2>&1; }   # gives up on a transfer that stalls for 40 s
fetch() {   # fetch URL FILE: into FILE.part first, so a half file never looks like a whole one
  log "download $1"
  mkdir -p "$(dirname "$2")" || return 1
  quiet_curl -C - -o "$2.part" "$1" && { mv -f "$2.part" "$2"; return; }
  case $? in 22 | 33 | 36)   # the server would not carry on from the half file: once more from the start
    rm -f "$2.part"; quiet_curl -o "$2.part" "$1" && { mv -f "$2.part" "$2"; return; } ;;
  esac
  log "download failed $1"; return 1   # a half file stays where it is: the next try carries on from it
}

verify() {   # verify FILE PINNED PUBLISHED: kept only when its SHA-256 equals both the hash pinned here and the publisher's
  _vgot=$(sha256_of "$1")
  if [ -n "$_vgot" ] && [ "$_vgot" = "$2" ] && [ "$_vgot" = "$3" ]; then log "checksum ok $(basename "$1")"; return 0; fi
  log "checksum MISMATCH $(basename "$1"): file ${_vgot:-unreadable}, pinned $2, publisher ${3:-not found}"
  rm -f "$1"; return 1
}

have_node() { [ -x "$RT/node-$1/bin/node" ]; }
have_uv() { [ -x "$RT/uv-$1/uv" ] && [ -s "$RT/uv-$1/LICENSE-MIT" ] && [ -s "$RT/uv-$1/LICENSE-APACHE" ]; }   # whole only with its licence texts

get_node() {   # get_node ARCH: only bin/node and LICENSE, into runtime/node-ARCH
  have_node "$1" && return 0; _nd="$RT/node-$1"
  case $1 in arm64) _nn="node-v$NODE_VER-darwin-arm64" ;; *) _nn="node-v$NODE_VER-darwin-x64" ;; esac
  _nt="$RT/downloads/$_nn.tar.gz"
  fetch "$NODE_DIST/v$NODE_VER/SHASUMS256.txt" "$RT/downloads/node-$NODE_VER-SHASUMS256.txt" || return 1
  _npub=$(awk -v f="$_nn.tar.gz" '$2 == f { print $1 }' "$RT/downloads/node-$NODE_VER-SHASUMS256.txt")
  fetch "$NODE_DIST/v$NODE_VER/$_nn.tar.gz" "$_nt" && verify "$_nt" "$(pinned NODE_SHA "$1")" "$_npub" || return 1
  rm -rf "$_nd.part"; mkdir -p "$_nd.part" &&
    tar -xmzf "$_nt" -C "$_nd.part" --strip-components 1 "$_nn/bin/node" "$_nn/LICENSE" >> "$LOG" 2>&1 &&
    rm -rf "$_nd" && mv "$_nd.part" "$_nd" && rm -f "$_nt" "$RT/downloads/node-$NODE_VER-SHASUMS256.txt"   # a half folder of that name is replaced, never nested into
}

uv_license() {   # uv_license FOLDER NAME: one licence text beside the uv binary, kept only when it equals the hash pinned here
  fetch "$UV_SOURCE/$UV_VER/LICENSE-$2" "$1/LICENSE-$2" || return 1
  [ "$(sha256_of "$1/LICENSE-$2")" = "$(pinned UV_LICENSE_SHA "$2")" ] && { log "checksum ok uv LICENSE-$2"; return 0; }
  log "checksum MISMATCH uv LICENSE-$2"; rm -f "$1/LICENSE-$2"; return 1
}

get_uv() {   # get_uv ARCH: uv, uvx and the two licence texts, into runtime/uv-ARCH
  have_uv "$1" && return 0; _ud="$RT/uv-$1"
  case $1 in arm64) _un=uv-aarch64-apple-darwin ;; *) _un=uv-x86_64-apple-darwin ;; esac
  _ut="$RT/downloads/$_un-$UV_VER.tar.gz"
  fetch "$UV_DIST/$UV_VER/$_un.tar.gz.sha256" "$_ut.sha256" || return 1
  _upub=$(awk 'NR == 1 { print $1 }' "$_ut.sha256")
  fetch "$UV_DIST/$UV_VER/$_un.tar.gz" "$_ut" && verify "$_ut" "$(pinned UV_SHA "$1")" "$_upub" || return 1
  rm -rf "$_ud.part"; mkdir -p "$_ud.part" &&
    tar -xmzf "$_ut" -C "$_ud.part" --strip-components 1 >> "$LOG" 2>&1 && [ -x "$_ud.part/uv" ] &&
    uv_license "$_ud.part" MIT && uv_license "$_ud.part" APACHE &&
    rm -rf "$_ud" && mv "$_ud.part" "$_ud" && rm -f "$_ut" "$_ut.sha256"
}

find_python() {   # find_python ARCH: the folder's own Python for that kind of Mac (the newest patch), or nothing
  case $1 in arm64) _pa=aarch64 ;; *) _pa=x86_64 ;; esac
  _pf=; _pbest=-1
  for _pd in "$RT/python/cpython-$PY_SERIES".*"-macos-$_pa-none"; do
    # Only real folders: uv also leaves a link "cpython-3.12-macos-…" that holds the full path of the folder it was made in,
    # so in a copied folder it leads back into the old one.
    [ ! -L "$_pd" ] && [ -x "$_pd/bin/python$PY_SERIES" ] || continue
    _pn=${_pd##*/cpython-$PY_SERIES.}; _pn=${_pn%%-*}
    case $_pn in '' | *[!0-9]*) continue ;; esac
    [ "$_pn" -gt "$_pbest" ] && { _pbest=$_pn; _pf="$_pd/bin/python$PY_SERIES"; }
  done
  printf '%s' "$_pf"
}

get_python() {   # get_python ARCH: through uv (it checks its own hash list), into runtime/python; UV must be a uv that runs here
  [ -n "$(find_python "$1")" ] && return 0
  case $1 in arm64) _ga=aarch64 ;; *) _ga=x86_64 ;; esac
  in_folder "$UV" python install --no-bin "cpython-$PY_SERIES-macos-$_ga-none" >> "$LOG" 2>&1 && [ -n "$(find_python "$1")" ]
}

wheels_ready() { [ -n "$(sha256_of "$ROOT/scripts/requirements.txt")" ] && [ "$(cat "$RT/wheels/$1/.complete" 2>/dev/null)" = "$(sha256_of "$ROOT/scripts/requirements.txt")" ]; }

get_wheels() {   # get_wheels ARCH: every library file for that kind of Mac into runtime/wheels/ARCH; RUN_ARCH's Python runs pip
  wheels_ready "$1" && return 0
  _wp=$(find_python "$RUN_ARCH"); [ -n "$_wp" ] || return 1
  mkdir -p "$RT/wheels/$1" &&
    in_folder "$_wp" -m pip download --only-binary=:all: --platform "$(pinned WHEEL_TAG "$1")" --python-version "$PY_SERIES" \
      --implementation cp --abi "cp$(printf '%s' "$PY_SERIES" | tr -d .)" -d "$RT/wheels/$1" -r "$ROOT/scripts/requirements.txt" >> "$LOG" 2>&1 &&
    sha256_of "$ROOT/scripts/requirements.txt" > "$RT/wheels/$1/.complete"   # written last: a half-filled folder never counts as packed
}
