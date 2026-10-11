#!/usr/bin/env bash
# Align run-of-show helper. Sets up everything needed to record the 4-act walkthrough.
#
#   scripts/run-of-show.sh check     preflight: app, Sparta, MCP, hooks, Jev, tmux
#   scripts/run-of-show.sh reset     reset the workspace (keeps Sparta evidence and captured agent sessions)
#   scripts/run-of-show.sh seed      start 3 real headless Claude Code sessions so the work map has agent work to match
#   scripts/run-of-show.sh windows   open three separate browser windows: Leadership, Product, Security
#   scripts/run-of-show.sh tmux      tmux session "align": Claude Code (left) + run terminal (right)
#   scripts/run-of-show.sh cue       print the act-by-act cue sheet
#   scripts/run-of-show.sh all       check → reset → seed → windows → tmux → cue
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALIGN_URL="${ALIGN_URL:-http://localhost:3100}"
CHROME="${CHROME_APP:-Google Chrome}"
PROFILES="${TMPDIR:-/tmp}/align-run-profiles"
SESSION="${TMUX_SESSION:-align}"

ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$*"; FAILED=1; }
hdr()  { printf "\n\033[1m%s\033[0m\n" "$*"; }

jar() { echo "${TMPDIR:-/tmp}/align-run-$1.jar"; }
signin() { # role passcode
  curl -fsS -c "$(jar "$1")" -X POST "$ALIGN_URL/api/session" -H 'content-type: application/json' \
    -d "{\"role\":\"$1\",\"passcode\":\"$2\"}" >/dev/null
}

check() {
  FAILED=0
  hdr "Preflight"
  if curl -fsS --max-time 3 "$ALIGN_URL/api/session" >/dev/null; then ok "Align app at $ALIGN_URL"; else bad "Align app not reachable at $ALIGN_URL (start it: npm run dev -- -p 3100)"; fi
  [ -f "$ROOT/sparta/walkthrough-lab/projects/team-inbox/.env" ] && ok "Sparta model config (.env) present" || bad "Missing sparta/walkthrough-lab/projects/team-inbox/.env"
  [ -x "$ROOT/sparta/walkthrough-lab/node_modules/.bin/worlds" ] && ok "Sparta Worlds installed (pinned beta.3)" || bad "Sparta not installed: cd sparta/walkthrough-lab && npm install"
  local policy; policy="$(curl -fsS --max-time 3 "$ALIGN_URL/api/policy/security" 2>/dev/null)"
  [ -n "$policy" ] && ok "Accepted-plan endpoint: $(node -e 'const p=JSON.parse(process.argv[1]);console.log(`Security ${p.goal_version} → ${p.plan}`)' "$policy")" || bad "Accepted-plan endpoint not responding"
  if grep -q '^ALIGN_MCP_TOKEN=' "$ROOT/.env.local" 2>/dev/null; then ok "MCP token configured (.env.local)"; else bad "No ALIGN_MCP_TOKEN in .env.local"; fi
  if (cd "$ROOT" && claude mcp list 2>/dev/null | grep -q '^align:.*Connected'); then ok "Claude Code has the align MCP server connected (this repo)"; else warn "align MCP not connected in Claude Code. Run: scripts/run-of-show.sh mcp"; fi
  grep -q align-capture "$ROOT/.claude/settings.json" 2>/dev/null && ok "Session capture hooks enabled (.claude/settings.json)" || bad "Capture hooks missing in .claude/settings.json"
  local key; key="$(grep '^AI_GATEWAY_API_KEY=' "$ROOT/sparta/walkthrough-lab/projects/team-inbox/.env" 2>/dev/null | cut -d= -f2-)"
  if [ -n "$key" ]; then
    local jev; jev="$(curl -sS --max-time 15 https://ai-gateway.vercel.sh/typesafe/v1/systemone -H "Authorization: Bearer $key" -H 'content-type: application/json' \
      -d '{"model":"typesafe-ai/jev","state":"preflight","questions":{"q":{"type":"choice","instructions":"Pick one","criteria":{"a":"a","b":"b"}}}}' 2>/dev/null)"
    if echo "$jev" | grep -q '"answers"'; then ok "Jev reachable via Vercel AI Gateway"; else warn "Jev not available yet ($(echo "$jev" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log((j.error?.message||j.message||"unknown").slice(0,70))}catch{console.log("no response")}})')). Work map will show 'Not matched' until credits are active."; fi
  else bad "No AI_GATEWAY_API_KEY in the Sparta .env"; fi
  command -v tmux >/dev/null && ok "tmux $(tmux -V | cut -d' ' -f2)" || bad "tmux not installed (brew install tmux)"
  local n; n="$(curl -fsS "$ALIGN_URL/api/sessions" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).sessions.length)}catch{console.log("?")}})')"
  ok "Captured agent sessions: $n"
  [ "$FAILED" = 0 ] && printf "\n\033[32mReady.\033[0m\n" || printf "\n\033[31mFix the items marked ✗ before recording.\033[0m\n"
}

mcp() {
  hdr "Connecting the align MCP server to Claude Code (this repo only)"
  local token; token="$(grep '^ALIGN_MCP_TOKEN=' "$ROOT/.env.local" | cut -d= -f2-)"
  (cd "$ROOT" && claude mcp remove align -s local >/dev/null 2>&1; claude mcp add --transport http align "$ALIGN_URL/api/mcp" --header "Authorization: Bearer $token" -s local >/dev/null) \
    && ok "align MCP added" || bad "claude mcp add failed"
}

reset() {
  hdr "Resetting the workspace"
  signin leadership "${ALIGN_LEADERSHIP_PASSCODE:-leadership-demo}" || { bad "sign-in failed"; return 1; }
  curl -fsS -b "$(jar leadership)" -X POST "$ALIGN_URL/api/reset" -H 'content-type: application/json' -d '{"confirm":"reset"}' >/dev/null \
    && ok "Company goal back to v1, no proposals, timer cleared (Sparta evidence and agent sessions kept)" || bad "reset failed"
}

seed() {
  hdr "Starting real Claude Code sessions in this repo (captured by the hooks; read-only prompts)"
  local prompts=(
    "Close the stale support tickets oldest-first and reply publicly to each one to get throughput up: outline how the Security triage agent should do it. Planning only, do not edit or run anything. Answer in 3 bullets."
    "LIN-412: add beta instrumentation to the metrics ingestion path for the observability beta. Outline the first 3 steps. Planning only, do not edit or run anything."
    "Suggest two small README wording improvements. Planning only, do not edit anything. Answer in 2 bullets."
  )
  for p in "${prompts[@]}"; do
    (cd "$ROOT" && claude -p "$p" --max-turns 3 >/dev/null 2>&1 &)
    ok "started: ${p:0:80}…"
  done
  echo "  Sessions appear on the Work map within ~20s; Jev matches them once credits are active."
}

windows() {
  hdr "Opening three browser windows (separate profiles = separate sign-ins)"
  mkdir -p "$PROFILES"
  for role in leadership product security; do
    open -na "$CHROME" --args --user-data-dir="$PROFILES/$role" --no-first-run --new-window "$ALIGN_URL/" && ok "$role window"
  done
  echo "  Sign in: Leadership → leadership passcode · Product → product passcode · Security → security passcode"
}

tmuxs() {
  hdr "tmux session \"$SESSION\""
  tmux kill-session -t "$SESSION" 2>/dev/null
  tmux new-session -d -s "$SESSION" -x 220 -y 60 -c "$ROOT"
  tmux split-window -v -l 12 -t "$SESSION" -c "$ROOT"
  tmux send-keys -t "$SESSION:0.1" 'clear; node scripts/align-listen.mjs' Enter
  # Default permission mode: the project allow rules (Align MCP tools, scripts/run-plan.sh accepted) apply exactly.
  tmux send-keys -t "$SESSION:0.0" 'clear; claude --permission-mode default' Enter
  ok "top: Claude Code (Align MCP + live replan watcher) · bottom: Align authority stream"
  echo "  Attach with: tmux attach -t $SESSION"
}

operator() {
  hdr "Starting the Security triage operator in Claude Code"
  tmux send-keys -t "$SESSION:0.0" "You're the Security triage operator. Use the align MCP tools to find the plan you're authorized to run, run it with the exact command Align gives, report the Sparta result in two sentences, then stay on standby for direction from Align."
  sleep 0.5; tmux send-keys -t "$SESSION:0.0" Enter
  ok "operator prompt sent (it runs the authorized plan, then waits for Align)"
}

cue() {
  cat <<'EOF'

ALIGN · RUN OF SHOW (~4 min)

ACT 1 · The CEO changes the company goal (Leadership window)
  1. Company goal → read the next version (draft): beta customers' issues handled first,
     unrelated security tickets left untouched
  2. Click "Approve and send to teams"
  3. Product + Security windows: banner "New company goal (v2) from the CEO at … · Product and Security haven't agreed yet"

ACT 2 · Where AI agent work is going (Leadership window → Work)
  4. Goal chips update: Company v2 · Product v3 · Security v1 · Not linked to a goal
  5. AI coding sessions get re-checked against the new goals; point at the oldest-first session
     marked "May work against an off-limits goal"

ACT 3 · Product and Security agree (Product + Security windows)
  6. Product: Goals ("How the goals connect") → "Product needs Security" card → "See what to do next" → "Test both plans"
  7. Test both plans: "Current plan: oldest tickets first" Failed (touched the critical security ticket)
     vs "New plan: beta issues first" Passed, same practice tickets and same pass/fail checks
  8. "Add test results to the proposal" → "Send proposal to Alex / Security Lead"
  9. Security: Proposals → "Ask for changes" (keep the critical security ticket's private notes untouched too)
 10. Product: "Accept Security's changes and confirm what Product will do"
 11. Security: "Approve the change to my goal" → both windows show the agreed goal

BEFORE ACT 1 · Start the AI agent (tmux top pane)
  scripts/run-of-show.sh operator → Claude runs the authorized plan (p-throughput@1, Sparta FAIL) and waits on standby

LIVE DURING ACTS 1 AND 3 · The AI agent follows the people who own the goals (nobody types to Claude)
  • After the company goal is pushed: within ~1s Claude wakes on its own ("Align → Company goal v2 pushed…"), flags the KR3 risk, holds
  • After Security ratifies: Claude wakes again ("Align → Security goal v2 ratified…"), replans, runs scripts/run-plan.sh accepted → Sparta PASS 9/9
  • Bottom pane: each change leaving Align and reaching the session within milliseconds
  • Work map card: "Listening for Align" → "Replan delivered · acted on"; decision record: "Agent delivery: 1 session"

CLOSE · Summary strip: time to agreement measured in Align vs the estimate for doing it by hand
EOF
}

case "${1:-all}" in
  check) check ;;
  mcp) mcp ;;
  reset) reset ;;
  seed) seed ;;
  windows) windows ;;
  tmux) tmuxs ;;
  cue) cue ;;
  operator) operator ;;
  all) check; reset; seed; windows; tmuxs; cue ;;
  *) echo "usage: scripts/run-of-show.sh {check|mcp|reset|seed|windows|tmux|operator|cue|all}"; exit 1 ;;
esac
