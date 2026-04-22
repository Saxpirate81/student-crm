#!/bin/bash
# Run this if the app shows errors after you updated files, or if "Start" fails.
# Double-click in Finder (first time: right-click → Open).

cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

stop_node_on_port() {
  local port="$1"
  local pids
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  for pid in $pids; do
    [ -z "$pid" ] && continue
    local comm
    comm=$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' ')
    if [[ "$comm" == "node" ]]; then
      echo "Stopping old server on port $port..."
      kill "$pid" 2>/dev/null || true
    fi
  done
}

echo "Rebuilding (1–2 minutes)..."
for port in 3000 3001; do
  stop_node_on_port "$port"
done
sleep 1
npm run clean
npm run build
echo ""
echo "Done. Now double-click \"Start Real School.command\"."
read -r -p "Press Enter to close..."
