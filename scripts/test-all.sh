#!/usr/bin/env bash
# Build A gate runner. Usage: scripts/test-all.sh <port>   (run from a lane or integration worktree)
# Checks frozen files, lint and types, starts a fresh dev server on <port>, then runs in fixed order:
# snapshot, test-flow, test-scenario (default fixture, then each scripts/fixtures/*.json), test-ui-loop, test-mcp (Northstar, then custom),
# test-capture, test-mapper. Capture and mapper add sessions
# that survive reset, so they run last. Then test-tenancy and ui-northstar, which start their own production
# servers on <port>.
# One summary line per step; exits non-zero if any step fails.
set -u

PORT="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASELINE=850971e13a74eab20f8d8789cb78331517ef28da
FROZEN=(data/fixture.json agent sparta scripts/verify-run.mjs scripts/run-plan.sh docs/LIVE_REPLAN.md docs/DEMO_SCRIPT.md)

die() { echo "test-all: $*" >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]+$ ]] || die "usage: scripts/test-all.sh <port>"
[ "$PORT" = 3100 ] && die "refusing port 3100 (the demo server)"
[ "$ROOT" = "$HOME/liminal/align" ] && die "refusing the main checkout $ROOT; run from a worktree"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && die "port $PORT is already in use"
cd "$ROOT"
unset AI_GATEWAY_API_KEY ALIGN_CAPTURE ALIGN_SECRET ALIGN_URL ALIGN_MCP_URL

BASE="http://127.0.0.1:$PORT"
TOKEN="$(openssl rand -hex 16)"
LOGDIR="$(mktemp -d "${TMPDIR:-/tmp}/align-test-all.XXXXXX")"
FAILS=0
SERVER=""

summary() { printf '%-5s %-14s %s\n' "$1" "$2" "$3"; [ "$1" = PASS ] || FAILS=$((FAILS + 1)); }
step() { # step <name> <command...>: run, keep output in the log dir, one summary line
  local name="$1"; shift
  if "$@" >"$LOGDIR/$name.log" 2>&1; then summary PASS "$name" "$(tail -n 1 "$LOGDIR/$name.log")"
  else summary FAIL "$name" "see $LOGDIR/$name.log"; fi
}
stop_server() {
  [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null
  pkill -f "next dev -H 127.0.0.1 -p $PORT" 2>/dev/null
  sleep 2
  rm -f data/state.json data/.secret # a shutdown can rewrite state.json
}
trap stop_server EXIT

# ---- static checks ----
if git diff --quiet "$BASELINE" -- "${FROZEN[@]}" && [ -z "$(git status --porcelain -- "${FROZEN[@]}")" ]; then
  summary PASS frozen "no changes to frozen files since ${BASELINE:0:7}"
else
  summary FAIL frozen "$(git diff --name-only "$BASELINE" -- "${FROZEN[@]}" | tr '\n' ' ')"
fi
step lint npm run lint
step typecheck bash -c 'npx next typegen && npx tsc --noEmit'
step syntax bash -c 'for f in scripts/*.mjs scripts/lib/*.mjs; do node --check "$f" || exit 1; done; echo "node --check clean"'

# ---- fresh server ----
rm -f data/state.json data/.secret
ALIGN_MCP_TOKEN="$TOKEN" npx next dev -H 127.0.0.1 -p "$PORT" >"$LOGDIR/server.log" 2>&1 &
SERVER=$!
for _ in $(seq 1 90); do curl -s -o /dev/null "$BASE/login" && break; sleep 1; done
curl -s -o /dev/null "$BASE/login" || { summary FAIL server "did not start, see $LOGDIR/server.log"; exit 1; }

# ---- runtime gates, fixed order ----
step snapshot env ALIGN_MCP_TOKEN="$TOKEN" node scripts/snapshot-northstar.mjs "$BASE"
# test-flow keeps its known baseline failure; the gate is its stdout matching the baseline's.
step test-flow bash -c "node scripts/test-flow.mjs '$BASE' | tail -n +2 | diff -u test/snapshots/northstar-850971e/test-flow.out - && echo 'stdout identical to the baseline'"
# test-scenario runs once per custom fixture: the default example, then every scripts/fixtures/*.json.
step test-scenario env ALIGN_MCP_TOKEN="$TOKEN" node scripts/test-scenario.mjs "$BASE"
for f in scripts/fixtures/*.json; do step "scenario:$(basename "$f" .json)" env ALIGN_MCP_TOKEN="$TOKEN" node scripts/test-scenario.mjs "$BASE" "$f"; done
# The same custom loop in a browser: two team profiles by visible labels, plus a synthetic agent's wake-up. Needs Chrome.
step test-ui-loop node scripts/test-ui-loop.mjs "$BASE"
step test-mcp env ALIGN_MCP_TOKEN="$TOKEN" node scripts/test-mcp.mjs "$BASE/api/mcp"
# The same validating client on a custom scenario (its `agreement` output), then back to Northstar.
step test-mcp:custom env ALIGN_MCP_TOKEN="$TOKEN" node scripts/test-mcp-custom.mjs "$BASE"
step test-capture node scripts/test-capture.mjs "$BASE"
step test-mapper env ALIGN_URL="$BASE" node scripts/test-mapper.mjs
# Multi-workspace tests need their own server configs (creation closed, signup code, open create).
stop_server
SERVER=""
step test-tenancy node scripts/test-tenancy.mjs "$PORT"
# Northstar's rendered UI text against 850971e's, on its own production server (needs Chrome).
step ui-northstar scripts/test-ui-northstar.sh "$PORT"

echo
if [ "$FAILS" -eq 0 ]; then echo "test-all: all steps passed (logs in $LOGDIR)"; else echo "test-all: $FAILS step(s) failed (logs in $LOGDIR)"; fi
[ "$FAILS" -eq 0 ]
