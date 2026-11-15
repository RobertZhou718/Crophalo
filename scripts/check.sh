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

OFFLINE="test.mjs test_server.mjs test_portable.mjs test_crops.mjs test_places.mjs test_state.mjs test_wizard.mjs test_weather.mjs test_climate.mjs test_season.mjs test_engine.mjs test_accuracy.mjs test_seasons_world.mjs test_cropsnear.mjs test_strategies.mjs test_crophist.mjs test_countrygate.mjs test_nonfarm.mjs test_grew.mjs test_weakspots.mjs test_report.mjs test_weather_tab.mjs test_calendar.mjs test_sources.mjs test_geo.mjs test_spot.mjs test_region.mjs test_live_smaproot.mjs test_smap_route.mjs test_sun.mjs test_shade.mjs test_farm3d.mjs test_engine_worker.mjs test_objects3d.mjs test_fx.mjs test_fx_halo.mjs test_live_dem.mjs test_server_dem.mjs test_security.mjs test_status.mjs test_sim.mjs test_soil.mjs test_remind.mjs test_sharetext.mjs test_sharefiles.mjs test_statement.mjs test_pages.mjs test_unitstext.mjs test_satellites.mjs test_satellites2.mjs test_satcard.mjs test_field_tab.mjs test_land3d.mjs test_live_imergrain.mjs test_live_gracecell.mjs test_live_ecopass.mjs test_live_hlsndvi.mjs test_live_hlsbox.mjs test_sales.mjs test_live_crops.mjs test_live_ndvihist.mjs test_live_firms.mjs test_mapbase.mjs test_mapplaces.mjs test_gibs.mjs test_offline.mjs test_hostmode.mjs test_cors.mjs ../deploy/test_stage_site.mjs test_money.mjs test_cropstep.mjs test_history.mjs test_greenness.mjs test_future.mjs test_ahead.mjs test_ahead_charts.mjs test_ahead_job.mjs test_ahead_load.mjs test_ahead_run.mjs test_ahead_view.mjs test_nasabase.mjs test_layeranim.mjs test_mapbusy.mjs test_grace.mjs test_terrain.mjs test_macro.mjs test_sharemodel.mjs test_notes.mjs test_remindwire.mjs test_soilload.mjs test_prices_cards.mjs test_report_load.mjs test_weather_week.mjs test_placename.mjs test_macro_record.mjs test_explain.mjs test_macro_turn.mjs test_live_orbits.mjs test_land3d_mesh.mjs test_live_osmextra.mjs test_macro_3d.mjs test_fieldyears.mjs test_hardyear.mjs test_trends.mjs test_areablock.mjs test_layers3d.mjs test_picture3d.mjs test_farmlayers.mjs test_skeleton.mjs test_apiurl.mjs test_video.mjs test_slope.mjs"   # seconds each, no internet needed
NETWORK="test_fallback.mjs"   # needs the internet once: it asks the back-up weather service for 16 far places and keeps the answers in scripts/_cache/ (NET=1 runs it)
HAND="e2e_cold.mjs e2e_measure.mjs"   # by hand: needs the internet and the Mead field in data/regions.json, so check.sh does not run it (see its header)
BROWSER="e2e.mjs e2e_flow.mjs e2e_pages.mjs e2e_sat2.mjs e2e_map.mjs e2e_spot_layout.mjs e2e_farm.mjs e2e_myfarm_simple.mjs e2e_farm3d.mjs e2e_land3d.mjs e2e_3d_open.mjs e2e_farm3d_link.mjs e2e_macro_farm.mjs e2e_engine_worker.mjs e2e_fx.mjs e2e_fx_halo.mjs e2e_motion_wire.mjs e2e_motion_levels.mjs e2e_cropstep.mjs e2e_money.mjs e2e_history.mjs e2e_ahead.mjs e2e_micro.mjs e2e_a11y.mjs e2e_qa.mjs e2e_spacing.mjs e2e_speed.mjs e2e_start_speed.mjs e2e_maptools.mjs e2e_terrain.mjs e2e_macro.mjs e2e_share.mjs e2e_notes.mjs e2e_remind.mjs e2e_soil.mjs e2e_data.mjs e2e_placename.mjs e2e_demo.mjs e2e_macro_report.mjs e2e_explain.mjs e2e_macro_turn.mjs e2e_home.mjs e2e_letter.mjs e2e_inputs.mjs e2e_trends.mjs e2e_split.mjs e2e_why.mjs"   # one at a time: together they share the processor and fail for no reason
# scripts/e2e_lib.mjs is not a suite: it is the harness every browser suite imports. scripts/test_fallback.mjs is the NETWORK suite above (NET=1 runs it).

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
