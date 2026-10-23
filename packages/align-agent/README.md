# @liminal/align-agent

The local half of Align v2: the `align` CLI, Claude Code and Codex hooks, and local metering from transcripts.
There is no daemon and no telemetry setup. Hooks answer from local files and, at most every 10 to 30 seconds, start a
short `align sync` in the background that makes one pass and exits.

Provider traffic never passes through Align. Sessions are private until you share one, and only shared sessions ever
reach the server. Wire contract: `docs/v2/WIRE.md`. Harness facts and sources: `HARNESS_FACTS.md`.

Zero runtime dependencies (Node 24+: `node:sqlite`, `node:crypto`, `fetch`).

## Commands

```
align login [--server <url>] [--name <device name>]   device flow; key-bound tokens
align logout                                          revokes this device, wipes tokens and the device key
align status                                          identity, last sync, hooks + hash, outbox, unpriced
align sessions [--all] [--json]                       local sessions, tokens, basis, list-price estimate (offline)
align goals [--workspace <name|id>] [--refresh]       cached goal feed
align share --dir [folder] --workspace W --goal G [--signals]   share every new session started in a folder (rule stays local)
align share <session|--latest> [--cwd [dir]] --workspace W --goal <ref|none> [--alias <name>] [--from start|now] [--yes]
align unshare --dir [folder] · align rules            remove a folder rule · list them
align pod [--cwd <dir>]                               work in flight toward this folder's goal and related goals (offline)
align stop-sharing <session>                          future usage stays local
align delete-history <session> [--yes]                server hard delete; totals change
align bind <session> --goal <ref|none>                takes effect at the next prompt (root turn)
align latch status                                    stop latches (stop/resume come from the web)
align install [--claude] [--codex] [--dry-run]
align uninstall [--purge]
align sync                                            one pass: spool, transcripts, outbox, directives, upload
align doctor                                          checks plus hook latency
```

In a session: `::align status`, `::align goals`, `::align share [--dir] [--signals] [goal]` (then `... confirm`),
`::align bind <goal>`, `::align unshare [--dir]`, `::align task <label>`, `::align claim <file> [what for]`,
`::align pod`. These are answered locally and never reach the model.

## How updates reach a session

1. A hook fires (SessionStart always; UserPromptSubmit at most every 10 s; PreToolUse at most every 30 s) and starts
   `align sync --hook` detached, then returns. The hook itself never touches the network.
2. The sync pass reads new transcript lines, uploads usage for shared sessions, fetches new directives by cursor and
   writes them to local files (`hot/`, `latch/`), then exits. A lock file keeps passes from overlapping.
3. The next hook reads those files: a goal change goes into context at the next prompt as a short delta; a stop makes
   the next tool call fail closed.

So a goal change or stop issued from the web lands within one sync interval, at the next prompt or tool call.

## Goal tree and pod awareness

- A session's starting context also names the goal its goal contributes to (with its measures) and the goals it depends
  on. A new version of either reaches every session under the child goal as one short note at its next prompt or tool
  call, flagged when the child's owner has not reviewed the child against it yet.
- Each shared session's PreToolUse hook records the files it edits and reads, its commit subjects, and its
  `::align task` and `::align claim` lines in `ALIGN_HOME/activity/<lid>.jsonl`. The sync pass uploads them (paths and
  text only with `--signals`, otherwise keyed hashes) and caches other machines' activity in `feeds/activity-<ws>.json`.
- At a prompt, a session gets one card (<= 300 chars) about work in flight toward its goal and related goals (parents,
  dependencies, children, and goals under the same parent): this machine's sessions and other people's, grouped per
  person, overlap with its own files first. At most one card per 10 minutes unless work overlaps; 0 bytes when nothing
  is new. `align pod` gives the agent more when it asks.
- Edits are seen three ways: edit tools (Claude Edit/Write/MultiEdit, Codex apply_patch), plain shell writes (`>`,
  `>>`, `tee`, `sed -i`, `cp`/`mv` targets, `git add` paths), and, in the sync pass, the repo's working tree and new
  commits since the previous pass (for files a script wrote), credited to the session most recently active there.
- On this machine, an edit to a file another same-goal session changed in the last 20 minutes (and this session has not
  read since) is held once with the reason. Only hook-seen edits can hold an edit. Across people nothing is held; the next edit of an overlapping or claimed
  file gets one short note.

## What `align install` changes

Copies the built `dist/` to `ALIGN_HOME/bin/<version>/` (adds a `package.json` with `"type": "module"`) and points the
symlink `ALIGN_HOME/bin/current` at it, so hooks never run from a git checkout. `ALIGN_HOME/install.json` records
what was added.

- `--claude` (default when no flag is given): writes the Claude Code plugin folder
  `$CLAUDE_CONFIG_DIR/skills/align/` (default `~/.claude/skills/align/`): `.claude-plugin/plugin.json` and
  `hooks/hooks.json` with one handler each for `SessionStart`, `UserPromptSubmit`, `PreToolUse` (matcher `"*"`),
  `Stop` and `StopFailure`: `'<node>' '<ALIGN_HOME>/bin/current/hook.js' claude <Event>`, timeout 5. Claude Code
  loads it in every new session with no install step (`claude plugin list` shows `align@skills-dir`);
  `claude plugin disable align@skills-dir` turns it off. `settings.json` is not edited, except that handlers an
  earlier Align merged there are removed (with a `settings.json.align-backup-<timestamp>` copy first). Install
  refuses to replace a `skills/align` folder that is not Align's.
- `--codex` (default when no flag is given): `$CODEX_HOME/hooks.json` (default `~/.codex/hooks.json`) gets
  `SessionStart`, `UserPromptSubmit`, `PreToolUse` and `Stop` with `codex`, after a
  `hooks.json.align-backup-<timestamp>` copy. Codex lists new hooks for review; trust them in Codex `/hooks`.
  `config.toml` is not edited.
- `--dry-run` prints the plan and writes nothing. `align uninstall` deletes the plugin folder, removes only Align's
  Codex handlers and keeps `ALIGN_HOME` unless `--purge`.

## State (`ALIGN_HOME`, default `~/.align`, 0700, must be owned by you)

`config.json`, `credentials.json` (0600), `device_key` (Ed25519 PKCS#8, 0600), `device_secret` (32 random bytes,
0600, never sent), `align.db` (SQLite WAL: sessions, root turns, epochs, request ledger, file offsets, outbox,
directives, shares, aliases), `rules.json` folder share rules, `hot/` and `injected/` per-session JSON for hooks,
`latch/` stop latches, `spool/` hook records for the next sync, `feeds/` cached goals, `me.json`, `last-sync.json`,
`logs/`.

Set `"default_workspace": "<ws id>"` in `config.json` if you belong to several workspaces and want `::align share`
without `--dir`.

## Privacy rules in code

- Hooks read only local state, never the network, credentials or transcripts, and exit within 300 ms. The only
  thing they start is the detached sync. A stop latch denies tools fail-closed, even if the sync never ran.
- Uploads: session key and repo key are per-workspace HMACs; folder rules are never sent; titles are sent as null.
  Branch names and repo-relative paths go up only as work signals with `--signals`; without it, keyed hashes only.
  What reaches the model: ratified goal fields inside a fixed envelope (<= 1,200 chars) or delta (<= 300 chars), and the
  pod card and notes (<= 300 chars, file paths, commit subjects and task labels from the user's own pod), all passed
  through the same sanitizer, and nothing at all when unchanged.

## Development

```
npm install
npm run build     # tsc -> dist/
npm test          # build, then node --test test/*.test.ts (temp dirs and a localhost fake server only)
```

Every location is overridable for tests and dry runs: `HOME`, `ALIGN_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`,
`ALIGN_SERVER`. `ALIGN_NO_AUTOSTART=1` stops hooks from starting syncs.
