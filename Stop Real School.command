#!/bin/bash
# Double-click to stop Real School servers (Node) on ports 3000 and 3001.
# You do not need to use Terminal yourself — this file does it for you.

cd "$(dirname "$0")"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

echo ""
echo "=========================================="
echo "  Real School — stopping servers"
echo "=========================================="
echo ""

stop_node_on_port() {
  local port="$1"
  local pids
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  for pid in $pids; do
    [ -z "$pid" ] && continue
    local comm
    comm=$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' ')
    if [[ "$comm" == "node" ]]; then
      echo "Stopping Node on port $port (process $pid)..."
      kill "$pid" 2>/dev/null || true
    fi
  done
}

for port in 3000 3001; do
  stop_node_on_port "$port"
done

sleep 1

for port in 3000 3001; do
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  for pid in $pids; do
    [ -z "$pid" ] && continue
    comm=$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' ')
    if [[ "$comm" == "node" ]]; then
      echo "Force-stopping Node on port $port (process $pid)..."
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
done

echo ""
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 || lsof -nP -iTCP:3001 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Something is still using port 3000 or 3001 (may not be Node / Real School)."
  echo "If the site still opens, ignore this. Otherwise contact whoever set up your Mac."
else
  echo "Ports 3000 and 3001 are free. You can start the app with \"Start Real School.command\"."
fi
echo ""
read -r -p "Press Enter to close..."
