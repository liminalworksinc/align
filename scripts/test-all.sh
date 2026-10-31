#!/usr/bin/env bash
# Build A gate runner. Usage: scripts/test-all.sh <port>   (run from a lane or integration worktree)
# Checks frozen files, lint and types, starts a fresh dev server on <port>, then runs in fixed order:
# snapshot, test-flow, test-scenario (default fixture, then each scripts/fixtures/*.json), test-ui-loop, test-mcp (Northstar, then custom),
# test-capture, test-mapper. Capture and mapper add sessions
# that survive reset, so they run last. Then test-tenancy and test-v2 (goal sessions, ALIGN_GOAL_SESSIONS=1), which start their own
# production servers on <port>; snapshot-v2on, the Northstar snapshot again on a dev server with ALIGN_GOAL_SESSIONS=1 (turning
# v2 on changes no Northstar bytes); and ui-northstar, on its own production server.
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
# The Connect dialog's paste lines run in sh, bash and zsh with hostile company names and URLs (no server needed).
step test-paste-lines node scripts/test-paste-lines.mjs
# The session importer takes only its folder's sessions, never a sibling folder with the same prefix (fake HOME).
step test-import-sessions node scripts/test-import-sessions.mjs

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
# Connected AI apps: the OAuth server and the OAuth-only MCP endpoint, Mode L and hosted (reuses the build test-tenancy made).
step test-oauth node scripts/test-oauth.mjs "$PORT" --no-build
step test-interview node scripts/test-interview.mjs "$PORT" --no-build
# The decision value card, its waitlist and LOI links and its funnel events (issue #30), Mode L and hosted. Needs Chrome.
step test-funnel node scripts/test-funnel.mjs "$PORT" --no-build
# The first-run card of a custom workspace (components/FirstRun.tsx): both paths, Align-observed status, Mode L and hosted. Needs Chrome.
step test-first-run node scripts/test-first-run.mjs "$PORT" --no-build
# The goal sessions hosted server (docs/v2/WIRE.md): flag off, Mode L with the test identity provider, hosted refusals.
step test-v2 node scripts/test-v2.mjs "$PORT"
# The same Northstar snapshot against the same baseline with ALIGN_GOAL_SESSIONS=1 (its database in a temp ALIGN_DATA_DIR, so
# ./data holds only Northstar's state). /api/v2/me answering 401 proves v2 is on.
V2ON_DIR="$(mktemp -d "${TMPDIR:-/tmp}/align-v2on.XXXXXX")"
rm -f data/state.json data/.secret
ALIGN_GOAL_SESSIONS=1 ALIGN_DATA_DIR="$V2ON_DIR" ALIGN_MCP_TOKEN="$TOKEN" npx next dev -H 127.0.0.1 -p "$PORT" >"$LOGDIR/server-v2on.log" 2>&1 &
SERVER=$!
for _ in $(seq 1 90); do curl -s -o /dev/null "$BASE/login" && break; sleep 1; done
if curl -s -o /dev/null "$BASE/login" && [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v2/me")" = 401 ]; then
  step snapshot-v2on env ALIGN_MCP_TOKEN="$TOKEN" node scripts/snapshot-northstar.mjs "$BASE"
else
  summary FAIL snapshot-v2on "the ALIGN_GOAL_SESSIONS=1 dev server did not start, see $LOGDIR/server-v2on.log"
fi
stop_server
SERVER=""
rm -rf "$V2ON_DIR"
# Northstar's rendered UI text against 850971e's, on its own production server (needs Chrome).
step ui-northstar scripts/test-ui-northstar.sh "$PORT"

echo
if [ "$FAILS" -eq 0 ]; then echo "test-all: all steps passed (logs in $LOGDIR)"; else echo "test-all: $FAILS step(s) failed (logs in $LOGDIR)"; fi
[ "$FAILS" -eq 0 ]
