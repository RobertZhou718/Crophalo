#!/bin/sh
# Crophalo's one check: every suite, in one fixed order, stopping at the first failure. Pass or fail is the exit code only;
# each suite prints its own "N passed, M failed". Run it after every change:  sh scripts/check.sh
#
#   NET=1            also run the suite that needs the internet once
#   E2E=0            skip the browser suites              E2E_ONLY=fit,axe   only the groups of a browser suite whose name holds one of the words
#   E2E_PORT=5600    the port of the throwaway copy       E2E_KEEP=1         keep the throwaway copy afterwards, to look at it
#   TEST_PORT=5601   the port of a server suite that takes one               CHROME=/path       the browser to drive
#
# THE THROWAWAY-COPY RULE. A browser suite only ever drives its own copy of the app, in the system temp folder, on a port of its own.
# It is never pointed at the real folder's running copy or at its port: a test browser there once wrote test data over the owner's saved fields.
# So this script works out the real port first and stops, before any suite runs, if a test is asked to go there.
set -e
cd "$(dirname "$0")/.."

OFFLINE="test.mjs test_server.mjs test_portable.mjs test_crops.mjs test_places.mjs test_state.mjs test_wizard.mjs test_weather.mjs test_climate.mjs test_season.mjs test_engine.mjs test_cropsnear.mjs test_report.mjs test_weather_tab.mjs test_calendar.mjs test_sources.mjs test_geo.mjs test_spot.mjs test_region.mjs test_live_smaproot.mjs test_smap_route.mjs test_sun.mjs test_shade.mjs test_farm3d.mjs test_live_dem.mjs test_server_dem.mjs test_sim.mjs test_soil.mjs test_remind.mjs test_sharetext.mjs test_sharefiles.mjs test_statement.mjs test_pages.mjs test_satellites.mjs test_satellites2.mjs test_field_tab.mjs test_land3d.mjs test_live_imergrain.mjs test_live_gracecell.mjs test_live_ecopass.mjs test_live_hlsndvi.mjs"   # seconds each, no internet needed
NETWORK="test_fallback.mjs"   # needs the internet once: it asks the back-up weather service for 16 far places and keeps the answers in scripts/_cache/ (NET=1 runs it)
BROWSER="e2e.mjs e2e_flow.mjs e2e_pages.mjs e2e_sat2.mjs e2e_map.mjs e2e_farm.mjs e2e_farm3d.mjs"   # one at a time: together they share the processor and fail for no reason

# ---- the real port: where this folder last ran (runtime/last-port), else the starter's own 5173
REAL_PORT=$(cat runtime/last-port 2>/dev/null | tr -cd '0-9')
[ -n "$REAL_PORT" ] || REAL_PORT=5173
refuse() { echo "check: refused. $1"; exit 1; }
goes_to_real() {   # true when $1 is the real port or the starter's port
  case "$1" in ''|*[!0-9]*) return 1 ;; esac
  [ "$1" -eq "$REAL_PORT" ] || [ "$1" -eq 5173 ]
}
is_port() { case "$1" in ''|*[!0-9]*) return 1 ;; esac; [ "$1" -le 65535 ]; }

if [ -n "${TEST_PORT:-}" ]; then
  is_port "$TEST_PORT" || refuse "TEST_PORT=$TEST_PORT is not a port number."
  if goes_to_real "$TEST_PORT"; then refuse "TEST_PORT=$TEST_PORT is where the real Crophalo runs (port $REAL_PORT, or the starter's 5173). Tests use a port of their own, from 5500 up."; fi
fi
if [ "${E2E:-1}" != "0" ]; then
  if [ -n "${E2E_URL:-}${E2E_TARGET:-}" ]; then refuse "A browser suite cannot be pointed at a running Crophalo (E2E_URL, E2E_TARGET). It only ever drives its own throwaway copy."; fi
  if [ -n "${E2E_PORT:-}" ]; then
    is_port "$E2E_PORT" || refuse "E2E_PORT=$E2E_PORT is not a port number."
    if goes_to_real "$E2E_PORT"; then refuse "E2E_PORT=$E2E_PORT is where the real Crophalo runs (port $REAL_PORT, or the starter's 5173). A browser suite only ever drives its own throwaway copy on another port."; fi
  fi
fi

# ---- Node: the folder's own when the start has put one there, else the computer's
NODE_BIN=${NODE:-}
[ -n "$NODE_BIN" ] || { [ -x "runtime/node-$(uname -m)/bin/node" ] && NODE_BIN="runtime/node-$(uname -m)/bin/node"; } || NODE_BIN=$(command -v node 2>/dev/null || :)
[ -n "$NODE_BIN" ] || { echo "check: Node was not found. Start Crophalo once (it brings its own), or install Node 22 or newer."; exit 1; }

# ---- the offline suites, in order
for suite in $OFFLINE; do
  if [ ! -f "scripts/$suite" ]; then
    [ "$suite" = "test_portable.mjs" ] || { echo "check: scripts/$suite is missing."; exit 1; }
    echo "check: scripts/$suite is not written yet, skipped"; continue
  fi
  "$NODE_BIN" "scripts/$suite"
done

# ---- the suite that needs the internet once, when asked for
if [ "${NET:-0}" = "1" ]; then
  for suite in $NETWORK; do "$NODE_BIN" "scripts/$suite"; done
else
  echo "net: $NETWORK not run (NET=1 runs it)"
fi

# ---- the browser suites, one at a time, each on its own throwaway copy
if [ "${E2E:-1}" = "0" ]; then
  echo "e2e: skipped (E2E=0)"
else
  for suite in $BROWSER; do "$NODE_BIN" "scripts/$suite"; done
fi
