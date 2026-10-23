#!/usr/bin/env bash
# Northstar's rendered UI, text only: every nav view for every role at every stage of the demo flow, compared with
# 850971e's (test/snapshots/ui-northstar-850971e, captured on a production build of 850971e). Runs on a production
# build: next dev can reload open pages in a loop while it settles, which stalls a browser script.
# Usage: scripts/test-ui-northstar.sh <port>   (from a worktree; refuses 3100 and the main checkout)
set -u
PORT="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "usage: scripts/test-ui-northstar.sh <port>"; exit 2; }
[ "$PORT" = 3100 ] && { echo "refusing port 3100 (the demo server)"; exit 2; }
[ "$ROOT" = "$HOME/liminal/align" ] && { echo "refusing the main checkout; run from a worktree"; exit 2; }
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && { echo "port $PORT is already in use"; exit 2; }
cd "$ROOT"
unset AI_GATEWAY_API_KEY ALIGN_CAPTURE ALIGN_SECRET ALIGN_URL ALIGN_MCP_URL HOSTED ALIGN_DATA_DIR
OUT="$(mktemp -d "${TMPDIR:-/tmp}/align-ui-northstar.XXXXXX")"
npx next build >"$OUT/build.log" 2>&1 || { echo "FAIL  next build (see $OUT/build.log)"; exit 1; }
rm -f data/state.json data/.secret
npx next start -H 127.0.0.1 -p "$PORT" >"$OUT/server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; pkill -f "next start -H 127.0.0.1 -p $PORT" 2>/dev/null; sleep 1; rm -f data/state.json data/.secret' EXIT
for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$PORT/api/state" && break; sleep 1; done
node scripts/ui-snapshot.mjs "http://127.0.0.1:$PORT" "$OUT/run" --flow northstar >"$OUT/snapshot.log" 2>&1 || { echo "FAIL  ui-snapshot (see $OUT/snapshot.log)"; exit 1; }
n="$(ls "$OUT/run"/*.txt | wc -l | tr -d ' ')"
if diff -r -x '*.png' test/snapshots/ui-northstar-850971e "$OUT/run" >"$OUT/diff.txt"; then
  echo "PASS  Northstar UI text identical to 850971e ($n files)"
else
  echo "FAIL  Northstar UI text differs from 850971e: see $OUT/diff.txt"; exit 1
fi
