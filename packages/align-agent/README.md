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
align share --dir [folder] --workspace W --goal G     share every new session started in a folder (rule stays local)
align share <session|--latest> [--cwd [dir]] --workspace W --goal <ref|none> [--alias <name>] [--from start|now] [--yes]
align unshare --dir [folder] · align rules            remove a folder rule · list them
align stop-sharing <session>                          future usage stays local
align delete-history <session> [--yes]                server hard delete; totals change
align bind <session> --goal <ref|none>                takes effect at the next prompt (root turn)
align latch status                                    stop latches (stop/resume come from the web)
align install [--claude] [--codex] [--dry-run]
align uninstall [--purge]
align sync                                            one pass: spool, transcripts, outbox, directives, upload
align doctor                                          checks plus hook latency
```

In a session: `::align status`, `::align goals`, `::align share [--dir] [goal]` (then `... confirm`),
`::align bind <goal>`, `::align unshare [--dir]`. These are answered locally and never reach the model.

## How updates reach a session

1. A hook fires (SessionStart always; UserPromptSubmit at most every 10 s; PreToolUse at most every 30 s) and starts
   `align sync --hook` detached, then returns. The hook itself never touches the network.
2. The sync pass reads new transcript lines, uploads usage for shared sessions, fetches new directives by cursor and
   writes them to local files (`hot/`, `latch/`), then exits. A lock file keeps passes from overlapping.
3. The next hook reads those files: a goal change goes into context at the next prompt as a short delta; a stop makes
   the next tool call fail closed.

So a goal change or stop issued from the web lands within one sync interval, at the next prompt or tool call.

## What `align install` changes

Copies the built `dist/` to `ALIGN_HOME/bin/<version>/` (adds a `package.json` with `"type": "module"`) and points the
symlink `ALIGN_HOME/bin/current` at it, so hooks never run from a git checkout. Every edited file gets a
`<file>.align-backup-<timestamp>` copy first, and `ALIGN_HOME/install.json` records what was added.

- `--claude` (default when no flag is given): `$CLAUDE_CONFIG_DIR/settings.json` (default `~/.claude/settings.json`)
  gets one handler each for `SessionStart`, `UserPromptSubmit` and `PreToolUse` (matcher `"*"`):
  `'<node>' '<ALIGN_HOME>/bin/current/hook.js' claude <Event>`, timeout 5. Every other key and hook is kept;
  re-running replaces Align's own handlers.
- `--codex` (default when no flag is given): `$CODEX_HOME/hooks.json` (default `~/.codex/hooks.json`) gets the same
  three events with `codex`. Codex lists new hooks for review; trust them in Codex `/hooks`. `config.toml` is not
  edited.
- `--dry-run` prints the plan and writes nothing. `align uninstall` removes only Align's handlers and keeps
  `ALIGN_HOME` unless `--purge`.

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
- Uploads: session key and repo key are per-workspace HMACs; branch, paths and folder rules are never sent; titles
  are sent as null. Only ratified goal fields reach the model, inside a fixed envelope (<= 1,200 chars) or delta
  (<= 300 chars), and nothing at all when unchanged.

## Development

```
npm install
npm run build     # tsc -> dist/
npm test          # build, then node --test test/*.test.ts (temp dirs and a localhost fake server only)
```

Every location is overridable for tests and dry runs: `HOME`, `ALIGN_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`,
`ALIGN_SERVER`. `ALIGN_NO_AUTOSTART=1` stops hooks from starting syncs.
