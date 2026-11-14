#!/bin/sh
# Double-click to type the NASA Earthdata login again (a new password, or a wrong username the first time), then start Crophalo.
# Keep this window open: closing it, or Control-C, stops Crophalo.
cd "$(dirname "$0")" || exit 1
exec /bin/sh ./scripts/run.sh --login "$@"
