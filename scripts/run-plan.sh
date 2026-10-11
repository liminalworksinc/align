#!/usr/bin/env bash
# Run the Align goal-triage agent under one team plan in a fresh Sparta world and save evidence.
# Usage: scripts/run-plan.sh <plan_id@version> [normal|interruption] [runs]
set -euo pipefail
PLAN="${1:?plan, e.g. p-beta@1}"
SCENARIO="${2:-normal}"
RUNS="${3:-1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAB="$ROOT/sparta/walkthrough-lab"
STAMP="$(date +%H%M%S)"
LABEL="${PLAN}-${SCENARIO}-${STAMP}"
EVIDENCE="$LAB/evidence/${LABEL}.json"
EXTRA=()
[ "$SCENARIO" = "interruption" ] && EXTRA+=(--scenario interruption)
[ "$RUNS" != "1" ] && EXTRA+=(--runs "$RUNS")
cd "$LAB"
set +e
ALIGN_RUN_LABEL="$LABEL" npx --no-install worlds starters run --project ./projects/team-inbox \
  --mission obs-beta-triage --timeout 180 "${EXTRA[@]}" --evidence "$EVIDENCE" \
  -- node --env-file-if-exists=.env "$ROOT/agent/goal-triage-agent.mjs" --plan "$PLAN"
CODE=$?
set -e
echo "evidence: $EVIDENCE"
echo "trace:    $ROOT/agent/traces/${LABEL}.trace.json"
echo "exit:     $CODE"
exit 0
