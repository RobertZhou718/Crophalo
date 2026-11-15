#!/bin/sh
# Crophalo's start on a host (the container's command). Only when both EARTHDATA_USERNAME and EARTHDATA_PASSWORD are set and no ~/.netrc exists, it writes the one-line ~/.netrc for
# urs.earthdata.nasa.gov, readable by this user only, quoting a word only when it holds more than plain letters, digits and . _ @ + = , : / -. The lookups read the two settings
# themselves (the server hands them on); the file is the fallback for anything that looks only in ~/.netrc, so a home folder that cannot be written skips it and never stops the start.
# The login is never in the image, the code or the logs: this script never prints it. Then it becomes the server. Checked by scripts/test_hostmode.mjs (the file it writes, the quoting, nothing printed).
set -eu
cd "$(dirname "$0")/.."

q() {   # one netrc word
  case $1 in
    *[!A-Za-z0-9._@+=,:/-]*) printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')" ;;
    *) printf '%s' "$1" ;;
  esac
}

umask 077   # everything this server writes (the login file, the kept answers, the push keys) is readable by this user only
HOME=${HOME:-$(pwd)}; export HOME
if [ -n "${EARTHDATA_USERNAME:-}" ] && [ -n "${EARTHDATA_PASSWORD:-}" ] && [ ! -f "$HOME/.netrc" ]; then
  { printf 'machine urs.earthdata.nasa.gov login %s password %s\n' "$(q "$EARTHDATA_USERNAME")" "$(q "$EARTHDATA_PASSWORD")" > "$HOME/.netrc"; } 2>/dev/null \
    || { rm -f "$HOME/.netrc" 2>/dev/null || :; echo 'start: ~/.netrc could not be written; the lookups still read the two settings' >&2; }
fi

# The port the server listens on: the host's own setting when it gives one (PORT; on Azure Container Apps the target port typed on the app's Ingress page
# arrives as CONTAINER_APP_PORT), else 8080, the target port the owner's guide names.
PORT=${PORT:-${CONTAINER_APP_PORT:-8080}}; export PORT

# Node's own heap is kept well under the host's limit: a leak ends in a restart of this server, not in the host stopping the whole container.
exec node --max-old-space-size="${FW_NODE_HEAP_MB:-160}" scripts/serve.mjs
