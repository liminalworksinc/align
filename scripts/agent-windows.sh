#!/bin/zsh
# No-tmux replacement for `scripts/run-of-show.sh tmux`: opens the two agent terminals in Terminal.app.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROMPT="You're the Security triage operator. Use the align MCP tools to find the plan you're authorized to run, run it with the exact command Align gives (use only the align MCP tools and that command; don't open other files or tools first), report the Sparta result in two sentences, then stay on standby for direction from Align."
osascript <<OSA
tell application "Terminal"
  activate
  do script "cd $ROOT && clear && node scripts/align-listen.mjs"
  do script "cd $ROOT && clear && claude --permission-mode default \"$PROMPT\""
end tell
OSA
