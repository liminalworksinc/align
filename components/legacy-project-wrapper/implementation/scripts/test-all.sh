#!/usr/bin/env bash
# Gate runner. Usage: scripts/test-all.sh <port>   (run from a worktree; test-v2 also uses <port>+1)
# Runs in fixed order: lint, typecheck, syntax (node --check on every script), paste-lines (no server), test-v2,
# test-oauth and test-agent-live (each starts its own production servers on <port>; the last two reuse the build test-v2
# made), then the align-agent package tests.
# One summary line per step; exits non-zero if any step fails.
set -u

PORT="${1:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

die() { echo "test-all: $*" >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]+$ ]] || die "usage: scripts/test-all.sh <port>"
[ "$PORT" = 3100 ] && die "refusing port 3100 (the local server)"
[ "$ROOT" = "$HOME/liminal/align" ] && die "refusing the main checkout $ROOT; run from a worktree"
lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && die "port $PORT is already in use"
cd "$ROOT"

LOGDIR="$(mktemp -d "${TMPDIR:-/tmp}/align-test-all.XXXXXX")"
FAILS=0

summary() { printf '%-5s %-14s %s\n' "$1" "$2" "$3" | tee -a "$LOGDIR/summary"; [ "$1" = PASS ] || FAILS=$((FAILS + 1)); }
step() { # step <name> <command...>: run, keep output in the log dir, one summary line
  local name="$1"; shift
  if "$@" >"$LOGDIR/$name.log" 2>&1; then summary PASS "$name" "$(tail -n 1 "$LOGDIR/$name.log")"
  else summary FAIL "$name" "see $LOGDIR/$name.log"; fi
}

# ---- static checks ----
step lint npm run lint
step typecheck bash -c 'npx next typegen && npx tsc --noEmit && echo "tsc clean"'
step syntax bash -c 'for f in scripts/*.mjs packages/align-connect/*.mjs; do node --check "$f" || exit 1; done; bash -n scripts/test-all.sh scripts/test-image.sh || exit 1; echo "node --check and bash -n clean"'

# The Apps tab's terminal lines in sh, bash and zsh (no server).
step paste-lines node scripts/test-paste-lines.mjs

# ---- servers: each test starts its own production servers on <port> ----
# The v2 server (docs/v2/WIRE.md): Mode L sign-in and local owner, the edge, Mode L with the test identity provider, hosted.
step test-v2 node scripts/test-v2.mjs "$PORT"
# Connected AI apps: the OAuth server and the MCP endpoint, Mode L and hosted (reuses the build test-v2 made).
step test-oauth node scripts/test-oauth.mjs "$PORT" --no-build
# The real align CLI and hooks (packages/align-agent) against a real Mode L server: limits, accepted asks, the asks feed,
# the drift notice and share --past (reuses the build test-v2 made; builds the agent's dist/).
step test-agent-live node scripts/test-agent-live.mjs "$PORT" --no-build

# ---- the local agent package ----
step align-agent bash -c 'cd packages/align-agent && { [ -d node_modules ] || npm ci; } && npm test' # a fresh copy has no node_modules

# ---- one node:test-style total (so `npm test` reports an exact count to tools that read it, e.g. litai) ----
# Each static step counts as one test; paste-lines, test-v2, test-oauth, test-agent-live and align-agent contribute their
# own counts from their logs.
TOTAL_PASS=0; TOTAL_FAIL=0
for s in lint typecheck syntax; do
  if grep -q "^PASS  $s " "$LOGDIR/summary"; then TOTAL_PASS=$((TOTAL_PASS + 1)); else TOTAL_FAIL=$((TOTAL_FAIL + 1)); fi
done
count() { # count <log> <regex with two groups: passed, failed>
  local line; line="$(grep -Eo "$2" "$1" 2>/dev/null | tail -n 1)"
  if [ -z "$line" ]; then TOTAL_FAIL=$((TOTAL_FAIL + 1)); return; fi
  TOTAL_PASS=$((TOTAL_PASS + $(sed -E "s/$2/\1/" <<<"$line"))); TOTAL_FAIL=$((TOTAL_FAIL + $(sed -E "s/$2/\2/" <<<"$line")))
}
count "$LOGDIR/test-v2.log" '^([0-9]+) passed, ([0-9]+) failed$'
count "$LOGDIR/test-oauth.log" '^test-oauth: ([0-9]+) passed, ([0-9]+) failed$'
count "$LOGDIR/paste-lines.log" '^test-paste-lines: ([0-9]+) passed, ([0-9]+) failed$'
count "$LOGDIR/test-agent-live.log" '^([0-9]+) passed, ([0-9]+) failed$'
AGENT_PASS="$(grep -Eo '^(#|ℹ) pass [0-9]+' "$LOGDIR/align-agent.log" 2>/dev/null | awk '{s+=$3} END {print s+0}')"
AGENT_FAIL="$(grep -Eo '^(#|ℹ) fail [0-9]+' "$LOGDIR/align-agent.log" 2>/dev/null | awk '{s+=$3} END {print s+0}')"
if [ "$AGENT_PASS" -eq 0 ]; then TOTAL_FAIL=$((TOTAL_FAIL + 1)); fi
TOTAL_PASS=$((TOTAL_PASS + AGENT_PASS)); TOTAL_FAIL=$((TOTAL_FAIL + AGENT_FAIL))
echo
echo "ℹ tests $((TOTAL_PASS + TOTAL_FAIL))"
echo "ℹ pass $TOTAL_PASS"
echo "ℹ fail $TOTAL_FAIL"

echo
if [ "$FAILS" -eq 0 ]; then echo "test-all: all steps passed (logs in $LOGDIR)"; else echo "test-all: $FAILS step(s) failed (logs in $LOGDIR)"; fi
[ "$FAILS" -eq 0 ]
