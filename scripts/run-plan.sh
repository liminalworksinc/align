#!/usr/bin/env bash
# Run the Align goal-triage agent under one team plan in a fresh Sparta world and save evidence.
# Usage: scripts/run-plan.sh <plan_id@version> [normal|interruption] [runs]
set -euo pipefail
PLAN="${1:?plan, e.g. p-beta@1, or 'accepted' to run whatever Align has authorized}"
if [ "$PLAN" = "accepted" ]; then
  ALIGN_URL="${ALIGN_URL:-http://localhost:3100}"
  POLICY="$(curl -fsS --max-time 3 "$ALIGN_URL/api/policy/security" 2>/dev/null)" || {
    echo "Align is not reachable at $ALIGN_URL; refusing to guess which plan is authorized." >&2
    exit 2
  }
  PLAN="$(node -e 'const p=JSON.parse(process.argv[1]);process.stdout.write(p.plan)' "$POLICY")"
  node -e 'const p=JSON.parse(process.argv[1]);const t=p.ratified_at?new Date(p.ratified_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}):"";console.log(`Align: Security goal ${p.goal_version} (${p.authority}${t?" at "+t:""}) authorizes ${p.plan}`)' "$POLICY"
fi
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
  --mission obs-beta-triage --timeout 180 ${EXTRA[@]+"${EXTRA[@]}"} --evidence "$EVIDENCE" \
  -- node --env-file-if-exists=.env "$ROOT/agent/goal-triage-agent.mjs" --plan "$PLAN"
CODE=$?
set -e
echo "evidence: $EVIDENCE"
echo "trace:    $ROOT/agent/traces/${LABEL}.trace.json"
# The verdict is read back from Sparta's evidence, not inferred from the command finishing.
if [ -f "$EVIDENCE" ]; then
  node "$ROOT/scripts/verify-run.mjs" "$EVIDENCE" | head -2 || true
else
  echo "Verified by Sparta: no evidence written (run did not complete)"
fi
exit "$CODE"
