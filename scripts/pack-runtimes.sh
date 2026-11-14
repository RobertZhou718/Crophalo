#!/bin/sh
# Packs Crophalo's own tools for BOTH kinds of Mac (Apple chip and Intel) into runtime/, about 540 MB: Node, uv,
# Python 3.12 and every library file. After that a new Mac sets itself up with no internet. Needs the internet once.
# Run: sh scripts/pack-runtimes.sh. After a dropped connection run it again: it carries on where it stopped.
# Uses the functions of portable.sh; checked by scripts/test_portable.mjs.
set -u

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." 2>/dev/null && pwd -P) || { echo "Crophalo could not find its own folder."; exit 1; }
[ -f "$ROOT/scripts/portable.sh" ] || { echo "scripts/portable.sh is missing. Copy the whole Crophalo folder again."; exit 1; }
. "$ROOT/scripts/portable.sh"

[ "$(uname -s)" = Darwin ] || { say "The tools are packed on a Mac."; exit 1; }
folder_writable || {
  say "This folder cannot be written to. Copy the whole Crophalo folder onto this Mac (for example into Documents)."; exit 1; }

RUN_ARCH=$(mac_kind)   # the tools of this Mac's own kind do the work for both kinds
[ "$RUN_ARCH" = arm64 ] && OTHER=x86_64 || OTHER=arm64
UV="$RT/uv-$RUN_ARCH/uv"
log "pack start in $ROOT ($RUN_ARCH)"

stop() {
  say "Stopped at: $1."
  say "Check the internet connection and run this again; it carries on where it stopped. Details: runtime/setup.log"
  log "pack stopped at: $1"; exit 1
}

for A in "$RUN_ARCH" "$OTHER"; do   # this Mac's own kind first: its uv and Python fetch the rest
  K=$(kind_name "$A")
  have_node "$A" || say "Node $NODE_VER for $K Macs (about 50 MB)…"                  # a line only for what is still missing
  get_node "$A" || stop "Node for $K Macs"
  have_uv "$A" || say "The Python installer (uv $UV_VER) for $K Macs (about 15 MB)…"
  get_uv "$A" || stop "the Python installer for $K Macs"
  [ -n "$(find_python "$A")" ] || say "Python $PY_SERIES for $K Macs (about 25 MB)…"
  get_python "$A" || stop "Python for $K Macs"
  wheels_ready "$A" || say "The NASA data libraries for $K Macs (about 50 to 70 MB)…"
  get_wheels "$A" || stop "the NASA data libraries for $K Macs"
done

rm -rf "$RT/downloads" "$RT/tmp"   # only what a new Mac needs stays
log "pack complete"
say "Packed: $(du -sh "$RT" 2>/dev/null | cut -f 1 | tr -d " ") in runtime/. Copy the whole Crophalo folder; a new Mac needs no internet to set itself up."
