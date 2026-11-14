#!/bin/sh
# Double-click to start Crophalo. The first start takes a few minutes: it sets up its own tools inside this folder.
# Keep this window open: closing it, or Control-C, stops Crophalo.
cd "$(dirname "$0")" || exit 1
exec /bin/sh ./scripts/run.sh "$@"
