# Harness facts the agent relies on

Verified 2026-10-22 against primary sources. Quotes are short and exact. Local observations come from reading the
shape (field names, counts) of real files on the development machine; no real content was copied into fixtures.

## Claude Code hooks

Source: https://code.claude.com/docs/en/hooks (markdown at https://code.claude.com/docs/en/hooks.md)

- Common input: `session_id`, `prompt_id` ("UUID for the user prompt being processed. Absent until the first user
  input"), `transcript_path` ("written asynchronously and may lag the current turn"), `cwd`, `permission_mode`,
  `hook_event_name`, and `agent_id`/`agent_type` inside subagents.
- `SessionStart` input `source`: `startup`, `resume`, `clear`, `compact`, `fork`. Output
  `hookSpecificOutput.additionalContext`.
- `UserPromptSubmit`: input `prompt`. `decision: "block"` "stops the prompt before it reaches Claude"; `reason` is
  "Shown to the user when decision is block. Not added to context." Plain stdout on exit 0 becomes context, so the hook
  only ever prints JSON or nothing. The block message ends with `Original prompt:` and the text is still written to the
  local transcript (it never reaches the model).
- `PreToolUse`: `hookSpecificOutput.permissionDecision` in `allow | deny | ask | defer`; for deny,
  `permissionDecisionReason` is "shown to Claude".
- Exit codes: 0 applies JSON; 2 blocks; any other code is a non-blocking error and the action proceeds. A crashed hook
  therefore fails open, so the latch path must print the deny JSON itself (it does, including on its own deadline).
- `timeout` is in seconds (600 default; 30 on UserPromptSubmit). Align sets 5 and enforces 300 ms internally.
- `additionalContext` and `systemMessage` are each capped at 10,000 characters (overflow goes to a file plus a
  2,000-character preview). `systemMessage` is "a warning shown to the user". `suppressOutput` "has no effect".
- Subagents: "When a subagent calls a tool, tool events such as `PreToolUse` and `PostToolUse` fire the same
  configured hooks as in the main conversation", with `agent_id`/`agent_type` set. Context lands "at the point where the
  hook fired". Checked with Claude Code 2.1.309 on 10-22: a marker returned from the subagent's PreToolUse appeared only
  in `subagents/agent-<id>.jsonl`, never in the main transcript. So the mid-turn delta skips calls with `agent_id`
  (the stop latch still applies there).
- "When an event fires, Claude Code runs the matching hooks in parallel", and parallel tool calls each fire
  PreToolUse. The mid-turn delta takes a lock directory so only one of them delivers it.
- `Stop` hooks "don't fire on user interrupts. API errors fire StopFailure instead." StopFailure's output and exit
  code are ignored; Align uses it only to start the end-of-turn sync. Codex has no StopFailure.
- A `Stop` hook that returns `additionalContext` or `decision: "block"` keeps the turn going, so Align's Stop prints
  nothing.
- Codex 0.163 "code mode" (observed in the 10-22 recorded demo): the model calls one `exec` tool whose input is
  JavaScript calling `tools.apply_patch(...)` and `tools.exec_command(...)`. A nested `apply_patch` still fires
  PreToolUse with `tool_name: "apply_patch"` and the patch in `tool_input.command` (its edits were recorded and its
  hook context reached the model as a developer message), but a file written by a script inside `exec_command`
  (`python3 - <<PY ... write_bytes`) is invisible to every hook. Claude Sonnet 5.5 and Haiku 5.5 also wrote files with
  `printf >>` and `cat >> <<EOF` in that demo. Hence shell-write parsing in PreToolUse and git-based detection in the
  sync pass.
- Plugins: a folder in `~/.claude/skills/` "that contains a `.claude-plugin/plugin.json` is a skills-directory plugin"
  that Claude Code "loads ... when a session starts, with no flag and no install step"; its `hooks/hooks.json` uses
  the settings `hooks` shape. `claude plugin disable <name>@skills-dir` turns it off. Checked with 2.1.309:
  `claude plugin list` shows `align@skills-dir` loaded and its hooks fire. A hook in both settings.json and a plugin
  "runs twice", hence install removes older Align handlers from settings.json.

## Claude Code telemetry

Source: https://code.claude.com/docs/en/monitoring-usage and the CHANGELOG at
https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md

- Env: `CLAUDE_CODE_ENABLE_TELEMETRY=1`; `OTEL_LOGS_EXPORTER` (`otlp|console|none`); `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL`
  (`grpc|http/json|http/protobuf`; "Claude Code has no default protocol"); `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` (example
  `http://localhost:4318/v1/logs`); `OTEL_METRICS_EXPORTER=none` is valid; `OTEL_LOGS_EXPORT_INTERVAL` in ms, default
  5000; `OTEL_LOG_USER_PROMPTS` "default: disabled"; `OTEL_LOG_TOOL_DETAILS` default disabled.
- "Claude Code ignores the OpenTelemetry exporter variables in a repository's `.claude/settings.json`"; set them in
  managed settings or `~/.claude/settings.json` `env`. (Align no longer uses telemetry, so install does not edit it.)
- `claude_code.api_request` attributes: `event.name` (`"api_request"`), `event.timestamp`, `model`, `cost_usd`,
  `cost_usd_micros`, `duration_ms`, `input_tokens` ("excluding tokens read from or written to the prompt cache"),
  `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `request_id`, `client_request_id`, `speed`,
  `query_source`, `effort`, `agent.name` and other attribution names. Events also carry `prompt.id`; `session.id` is a
  standard attribute ("which `/clear` replaces").
- CHANGELOG 2.1.300: "Added `cache_creation_5m_tokens` and `cache_creation_1h_tokens` to the OpenTelemetry
  `api_request` event". The monitoring page's attribute list does not show them yet.
- "Claude Code counts each streaming response toward the cost and token metrics exactly once"; retries are not logged
  as separate events (`api_error` is terminal). "Cost metrics are approximations."
- `request_id` is "persisted as `requestId` on the transcript's assistant entries" (documented as version-specific),
  which is the cross-source dedupe key.
- Standard attributes include `user.email` when signed in. The receiver drops it with everything else not allowlisted.

## Codex hooks

Source: https://learn.chatgpt.com/docs/hooks (markdown at https://learn.chatgpt.com/docs/hooks.md)

- Locations include `~/.codex/hooks.json` and inline `[hooks]` in `~/.codex/config.toml`; both in one layer are merged
  "and warns at startup". Install uses `hooks.json`.
- Trust: "Codex records trust against the hook's current hash, so new or changed hooks are marked for review and
  skipped until trusted." Review happens in `/hooks`. Align never writes trust entries.
- Common input: `session_id` ("Subagent hooks use the parent session id"), `transcript_path`, `cwd`,
  `hook_event_name`, `model`; turn-scoped events add `turn_id`.
- `SessionStart` `source`: `startup|resume|clear|compact|fork`; `hookSpecificOutput.additionalContext` is developer
  context. `UserPromptSubmit`: `turn_id`, `prompt`; block with `{ "decision": "block", "reason": ... }`.
- `PreToolUse`: deny with `hookSpecificOutput.permissionDecision: "deny"` (legacy `decision: "block"` and exit 2 also
  work). Returning `continue`, `stopReason` or `suppressOutput` there "marks that hook run as failed ... and continues
  the tool call", so the hook never returns them. Hosted tools such as WebSearch do not pass through PreToolUse; the docs
  say to "Treat tool hooks as a useful guardrail, not a complete enforcement boundary."
- Model-visible hook output defaults to "roughly 2,500 tokens" (`additionalContextLimit`). `timeout` is seconds,
  default 600. `matcher` `"*"` matches everything; UserPromptSubmit ignores matchers.
- Background hooks: "Finishing a background hook doesn't start a new turn." Align uses no background hooks.

## Codex telemetry

Sources: https://learn.chatgpt.com/docs/config-file/config-reference.md, https://learn.chatgpt.com/docs/config-file/config-advanced.md
(Observability and telemetry), and the emitter source at openai/codex `codex-rs/otel/src/events/session_telemetry.rs`
(main branch, read through the GitHub API).

- `[otel]`: `exporter = none | otlp-http | otlp-grpc`, `exporter.<id>.endpoint`, `exporter.<id>.protocol`
  (`binary | json`), `log_user_prompt` ("Opt in to exporting raw user prompts"). `metrics_exporter` defaults to
  `statsig`; Align does not touch it.
- `codex.sse_event` carries "token counts on `response.completed`". In source the fields are `input_token_count`,
  `output_token_count`, `cached_token_count`, `cache_write_token_count`, `reasoning_token_count`, `tool_token_count`,
  plus common `conversation.id`, `model`, `auth_mode`, `user.email`. There is no response id and no turn id.

## Local file shapes (read-only observation)

- Codex rollouts (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`): `token_usage_record.payload` has `thread_id`,
  `turn_id`, `session_id`, `root_turn_id`, `response_id`, `usage{input_tokens, cached_input_tokens,
  cache_write_input_tokens, output_tokens, reasoning_output_tokens, total_tokens}` and no model (the model comes from
  `turn_context.payload.model`). `event_msg/token_count` repeats: one file had 824 token_count lines for 765 responses.
  `session_meta.payload` has `id`, `session_id`, `parent_thread_id`, `source`, `thread_source`
  (`user | subagent | guardian_review`); guardian threads run `codex-auto-review`. Across 78,161 records,
  `cache_write_input_tokens` was always 0 and `total_tokens = input_tokens + output_tokens`.
- Claude transcripts: user lines carry `promptId`; assistant lines carry `requestId` and repeat usage per content block.
  950 of 1,255 requests had several finalized rows, never with differing usage. Subagent transcripts often never set
  `stop_reason` (154 of 565 requests in 20 files), so unfinalized rows are billed from their last copy after 10 idle
  minutes, as liminal-desktop does.
- `~/.claude.json` has `oauthAccount` when signed in with a Claude account; `~/.codex/auth.json` has
  `auth_mode: "chatgpt" | "apikey"`.

## Where this contradicts or refines the plan or WIRE.md

0. Metering is transcripts and rollouts only (decided 10-22): no OTel receiver, no telemetry settings written by
   `align install`, no daemon. The OTel facts above are kept for reference. Hooks start a one-pass `align sync`
   instead of feeding a long-running process.
1. Codex OTel could not have been the primary meter anyway: `response.completed` has no response id, so it cannot be
   deduplicated against rollouts. Codex is metered from rollout `token_usage_record` (keyed by `response_id`).
2. `/clear` gives Claude a new `session.id`, so a per-session share does not carry across `/clear`. A folder rule
   (`align share --dir`) covers it: the new session starts in the same folder and is shared from its start. Without a
   rule the new session starts private and the hook shows a user-only hint.
3. The stop latch covers every tool that passes through PreToolUse (Claude matcher `*`; Codex shell, apply_patch, MCP
   and local function tools). Codex hosted tools are outside it, per the Codex docs. A stop issued from the web lands
   at the first tool call after the next sync pass (at most about 30 s during an autonomous run).
4. When a hook blocks a prompt (an `::align` command), Claude Code puts the original text back in the input box; the
   user clears it with Ctrl+U before typing the next prompt.
5. Transcript cache writes without the 5m/1h split stay `cache_write_unsplit` and unpriced instead of assuming a tier.
