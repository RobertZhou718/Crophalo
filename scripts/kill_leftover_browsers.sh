#!/bin/sh
# Stops the helper processes a finished test run left behind (the browser's own profile folder is gone, so nothing owns them): by PID, never by name alone.
# Used after any scripts/e2e_*.mjs or scripts/live_check_*.mjs run. Checked by hand: it prints how many it stopped.
n=0
for pid in $(pgrep -f "crophalo-e2e_"); do
  dir=$(ps -o command= -p "$pid" | grep -o "/private/var/folders[^ ]*crophalo-e2e_[A-Za-z0-9_-]*" | head -1)
  if [ -n "$dir" ] && [ ! -d "$dir" ]; then kill -9 "$pid" 2>/dev/null && n=$((n+1)); fi
done
echo "stopped $n leftover browser helper(s)"
