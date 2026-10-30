#!/usr/bin/env bash
# Gate runner. Usage: scripts/test-all.sh <port>   (run from a worktree; test-v2 also uses <port>+1)
# Runs in fixed order: lint, typecheck, syntax (node --check on every script), test-v2 and test-oauth (each starts its
# own production servers on <port>; test-oauth reuses the build test-v2 made), then the align-agent package tests.
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

summary() { printf '%-5s %-14s %s\n' "$1" "$2" "$3"; [ "$1" = PASS ] || FAILS=$((FAILS + 1)); }
step() { # step <name> <command...>: run, keep output in the log dir, one summary line
  local name="$1"; shift
  if "$@" >"$LOGDIR/$name.log" 2>&1; then summary PASS "$name" "$(tail -n 1 "$LOGDIR/$name.log")"
  else summary FAIL "$name" "see $LOGDIR/$name.log"; fi
}

# ---- static checks ----
step lint npm run lint
step typecheck bash -c 'npx next typegen && npx tsc --noEmit && echo "tsc clean"'
step syntax bash -c 'for f in scripts/*.mjs packages/align-connect/*.mjs; do node --check "$f" || exit 1; done; bash -n scripts/test-all.sh scripts/test-image.sh || exit 1; echo "node --check and bash -n clean"'

# ---- servers: each test starts its own production servers on <port> ----
# The v2 server (docs/v2/WIRE.md): Mode L sign-in and local owner, the edge, Mode L with the test identity provider, hosted.
step test-v2 node scripts/test-v2.mjs "$PORT"
# Connected AI apps: the OAuth server and the MCP endpoint, Mode L and hosted (reuses the build test-v2 made).
step test-oauth node scripts/test-oauth.mjs "$PORT" --no-build

# ---- the local agent package ----
step align-agent bash -c 'cd packages/align-agent && npm test'

echo
if [ "$FAILS" -eq 0 ]; then echo "test-all: all steps passed (logs in $LOGDIR)"; else echo "test-all: $FAILS step(s) failed (logs in $LOGDIR)"; fi
[ "$FAILS" -eq 0 ]
