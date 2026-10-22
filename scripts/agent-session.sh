#!/usr/bin/env bash
# Start a Claude Code agent session in <repo-dir>, wired to a local Align (Mode L) running a /setup scenario:
# the read-only align MCP tools, the capture hook, and the watcher that wakes the session when a team approves a
# change. Grants capture consent for that repo as leadership first (consent is per harness and repo).
#
# Usage: ALIGN_MCP_TOKEN=<the server's token> scripts/agent-session.sh <repo-dir> "<prompt>" [--allow-edits]
#   ALIGN_URL                  default http://127.0.0.1:3100 (loopback only: capture and directives are local routes)
#   ALIGN_LEADERSHIP_PASSCODE  default leadership-demo (used only to grant capture consent)
#   ALIGN_AGENT_MODEL          default sonnet
#   ALIGN_WATCH_WINDOW_MS      default 900000 (15 minutes of waiting for an approval after each turn)
# By default the session plans only: Edit/Write and shell commands that run code or reach other machines are denied.
# --allow-edits drops that deny list (the session then asks before each edit, as usual).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${1:?usage: scripts/agent-session.sh <repo-dir> \"<prompt>\" [--allow-edits]}"
PROMPT="${2:?usage: scripts/agent-session.sh <repo-dir> \"<prompt>\" [--allow-edits]}"
EDITS="${3:-}"
ALIGN_URL="${ALIGN_URL:-http://127.0.0.1:3100}"
die() { echo "agent-session: $*" >&2; exit 2; }

[ -d "$REPO" ] || die "no such directory: $REPO"
[ -n "${ALIGN_MCP_TOKEN:-}" ] || die "set ALIGN_MCP_TOKEN to the token the Align server was started with"
[[ "$ALIGN_URL" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?$ ]] || die "ALIGN_URL must be a loopback address, got $ALIGN_URL"
command -v claude >/dev/null || die "claude is not on PATH"

# The capture hook names a session's repo by its git top level, else the folder: consent must use the same name.
TOP="$(git -C "$REPO" rev-parse --show-toplevel 2>/dev/null || (cd "$REPO" && pwd))"
REPO_NAME="$(basename "$TOP")"

JAR="$(mktemp -d "${TMPDIR:-/tmp}/align-agent.XXXXXX")"
chmod 700 "$JAR"
trap 'rm -rf "$JAR"' EXIT

curl -sf -o /dev/null "$ALIGN_URL/api/workspaces/config" || die "Align is not answering at $ALIGN_URL"
curl -sf -o /dev/null -c "$JAR/cookies" -H 'content-type: application/json' \
  -d "{\"role\":\"leadership\",\"passcode\":\"${ALIGN_LEADERSHIP_PASSCODE:-leadership-demo}\"}" "$ALIGN_URL/api/session" \
  || die "leadership sign-in failed (set ALIGN_LEADERSHIP_PASSCODE)"
curl -sf -o /dev/null -b "$JAR/cookies" -H 'content-type: application/json' \
  -d "{\"harness\":\"claude-code\",\"repo\":\"$REPO_NAME\"}" "$ALIGN_URL/api/sessions/consent" \
  || die "could not grant capture consent for $REPO_NAME"
rm -f "$JAR/cookies"
echo "agent-session: capture consent granted for claude-code + $REPO_NAME" >&2

umask 077
node -e '
  const [url, token] = process.argv.slice(1);
  console.log(JSON.stringify({ mcpServers: { align: { type: "http", url: `${url}/api/mcp`, headers: { Authorization: `Bearer ${token}` } } } }));
' "$ALIGN_URL" "$ALIGN_MCP_TOKEN" > "$JAR/mcp.json"
node -e '
  const [root, edits] = process.argv.slice(1);
  const cap = `node "${root}/scripts/align-capture.mjs"`;
  const watch = `node "${root}/scripts/align-watch.mjs"`;
  const deny = edits === "--allow-edits" ? [] : ["Edit", "Write", "NotebookEdit",
    ...["python", "python3", "node", "bash", "sh", "zsh", "ssh", "scp", "rsync", "curl", "wget", "gcloud", "aws", "runpodctl", "docker", "nvidia-smi", "rm", "git push", "git commit"].map((c) => `Bash(${c}:*)`)];
  console.log(JSON.stringify({
    permissions: { allow: ["mcp__align", "Bash(ls:*)", "Bash(cat:*)", "Bash(head:*)", "Bash(grep:*)", "Bash(git status:*)", "Bash(git log:*)"], deny },
    hooks: {
      SessionStart: [{ hooks: [{ type: "command", command: cap, timeout: 5 }, { type: "command", command: watch, asyncRewake: true, timeout: 3600 }] }],
      UserPromptSubmit: [{ hooks: [{ type: "command", command: cap, timeout: 5 }] }],
      PostToolUse: [{ matcher: "Edit|Write|Bash|mcp__align__.*", hooks: [{ type: "command", command: cap, timeout: 5 }] }],
      Stop: [{ hooks: [{ type: "command", command: cap, timeout: 5 }, { type: "command", command: watch, asyncRewake: true, timeout: 3600 }] }],
    },
  }));
' "$ROOT" "$EDITS" > "$JAR/settings.json"

cd "$TOP"
# User-level plugins and hooks are skipped (project and local settings still load) to keep the session small.
ALIGN_URL="$ALIGN_URL" ALIGN_CAPTURE=1 ALIGN_WATCH_WINDOW_MS="${ALIGN_WATCH_WINDOW_MS:-900000}" \
  claude --model "${ALIGN_AGENT_MODEL:-sonnet}" --setting-sources project,local \
  --settings "$JAR/settings.json" --mcp-config "$JAR/mcp.json" --strict-mcp-config --permission-mode default "$PROMPT"
