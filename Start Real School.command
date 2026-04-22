#!/bin/bash
# Double-click this file in Finder to start the app (macOS).
# First time only: if macOS says it cannot be opened, right-click → Open → Open.
#
# Builds, then runs production server (stable — avoids dev cache errors).

cd "$(dirname "$0")"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

echo ""
echo "=========================================="
echo "  Real School (Student CRM) — starting"
echo "=========================================="
echo ""

if ! command -v npm >/dev/null 2>&1; then
  echo "Could not find \"npm\". Install Node.js from https://nodejs.org (LTS), then try again."
  echo ""
  read -r -p "Press Enter to close..."
  exit 1
fi

stop_node_on_port() {
  local port="$1"
  local pids
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  for pid in $pids; do
    [ -z "$pid" ] && continue
    local comm
    comm=$(ps -p "$pid" -o comm= 2>/dev/null | tr -d ' ')
    if [[ "$comm" == "node" ]]; then
      echo "Closing old server on port $port (leftover from a previous run)..."
      kill "$pid" 2>/dev/null || true
    fi
  done
}

echo "Cleaning up old Real School servers (so browsers all hit the same app)..."
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
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
done
echo ""

PORT=3000
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "Ports 3000 and 3001 are still in use (not by Node, or needs admin)."
    echo "Double-click \"Stop Real School.command\", or restart your Mac, then try again."
    read -r -p "Press Enter to close..."
    exit 1
  fi
  PORT=3001
  echo "Port 3000 is still busy — using 3001 instead."
  echo ""
fi

export PORT

echo "Cleaning old build output (avoids blank pages and 500 errors), then building..."
echo ""
npm run clean
npm run build
if [ $? -ne 0 ]; then
  echo "Build failed. Double-click \"Rebuild Real School.command\", then try Start again."
  read -r -p "Press Enter to close..."
  exit 1
fi

URL="http://127.0.0.1:${PORT}"
echo ""
echo "Starting the app at ${URL}"
echo "Leave this window open while you use the site."
echo "To stop: press Control+C or close this window."
echo ""
echo "In your browser: use a NEW private/incognito window for ${URL}"
echo "(avoids old cached pages that cause errors)."
echo ""

( sleep 2 && open "$URL" ) 2>/dev/null || true

exec npx next start -p "$PORT"
