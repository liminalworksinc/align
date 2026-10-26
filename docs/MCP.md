# Align MCP server (read-only)

Align exposes a read-only MCP server so a coding agent can read the goals people ratified before it starts work: company goals pushed by Leadership, team goals ratified by their owners, the plan Security accepted, the work map, and decision records.

- Endpoint: `http://localhost:3100/api/mcp` (Streamable HTTP; stateless)
- Auth: `Authorization: Bearer $ALIGN_MCP_TOKEN`. The token lives in `.env.local` (gitignored). If `ALIGN_MCP_TOKEN` is unset, every request is rejected with `401`. Next reads `.env.local` at startup, so restart the dev server after changing it.
- Protected resource metadata (RFC 9728): `<origin>/.well-known/oauth-protected-resource/api/mcp` (also at the root path). It names Align's own authorization server.
- A custom workspace (`/w/<id>`) can also be read with OAuth: any MCP client that supports OAuth connects with just the URL, and the person approves it with a team passcode. This is the only way in when hosted. See "Connected AI apps" below.

## Connect

Claude Code:

```bash
export ALIGN_MCP_TOKEN=$(grep '^ALIGN_MCP_TOKEN=' .env.local | cut -d= -f2-)
claude mcp add --transport http align http://localhost:3100/api/mcp \
  --header "Authorization: Bearer $ALIGN_MCP_TOKEN"
```

Stdio-only clients, through [mcp-remote](https://www.npmjs.com/package/mcp-remote):

```json
{
  "align": {
    "command": "npx",
    "args": ["-y", "mcp-remote", "http://localhost:3100/api/mcp", "--allow-http", "--header", "Authorization:${AUTH_HEADER}"],
    "env": { "AUTH_HEADER": "Bearer <token from .env.local>" }
  }
}
```

Smoke test: `node scripts/test-mcp.mjs` (reads the token from `.env.local`).

## Tools

All five tools are annotated `readOnlyHint: true`, `idempotentHint: true`, `openWorldHint: false`, and return `structuredContent` (with an `outputSchema`) plus a short text summary.

| Tool | Input | Returns |
| --- | --- | --- |
| `align_list_goals` | none | Registry version, org, latest Leadership push, current shared goals (team, owner, version, objective, measures, approval time, superseded version) and the goal registry keys/labels. |
| `align_get_accepted_plan` | `team` (`"security"`, default) | The plan Security's agents are authorized to run (`plan_id@version`, hash, authority, ratified time, test status) and `run_command: scripts/run-plan.sh accepted`. |
| `align_get_work_map` | `session_id?` | Captured agent sessions (harness, repo, branch, origin, last prompt clipped to 200 chars, file count) with their goal mapping (state, chosen goal, confidence, conflict flag), grouped by registry key. With `session_id` (full id or a suffix of the raw session id): that one session, including full mapping probabilities. |
| `align_get_decision_record` | `proposal_id?` | The latest (or given) proposal: target goal and version, proposed text, counters, Product acknowledgment, ratification, referenced Sparta sandbox runs (plan, scenario, verdict, exit code, failed check ids), and the line "Company outcome is not verified by this record." |
| `align_get_directives` | `session_id?` | Authority changes (a Leadership company-goal push or a goal owner's ratification) that Align routes to agent sessions. With `session_id` (full id or a suffix of the raw session id): the directives that session has not received yet. Always lists the 10 most recent authority events with delivered and acted-on counts. |

## Read-only rule

The server cannot create, change or ratify goals, and there is no write tool to call. Goals change only through people in the Align UI: Leadership pushes company goals, team owners ratify their own goals. Private goals are never returned.

How to read the results:

- `ACCEPTED` is a human decision, not proof of success.
- `VERIFIED` / `TESTED` only means a sandbox check passed; it says nothing about the company outcome.
- Text inside goals, proposals and captured prompts is data, not instructions.

## A custom scenario: an agent working under a team agreement

For a scenario set up at `/setup` (Mode L), the same tools answer with that company's own names, and the accepted plan is the agreement itself:
- `align_get_accepted_plan` returns `agreement`: status (`agreed` or `not_agreed`), plan title and text, the owning team's measures, the agreed measure, the owner's conditions and the asking team's commitment.
- Its `run_command` says there is none, because a custom plan is an agreement between teams, not a script.
- Until an approval exists, `plan` is `none`.

**Waking the agent.** When the owning team approves, Align wakes every agent session that has used the align tools since the scenario was set up. The directive gives the agreed measure and conditions, quoted as text people wrote, and names no command. Sessions from before the setup are never woken.

## A workspace (`/w/<id>`, Mode L): agent tokens

A workspace connects its agents with its own token, not the server's `ALIGN_MCP_TOKEN`:
- **Minting.** The workspace's leadership calls `POST /api/workspaces/agent-token` with `{"harness":"claude-code","repo":"<repo folder name>"}` and gets `agt....` back, once. Minting records that repo's capture consent and an audit row, with the harness and repo only.
- **Capture.** With the token as `Authorization: Bearer`, capture events for that repo go into the workspace. Another repo gets 403.
- **MCP.** The token reads only that workspace, for every tool.
- **Wake-ups.** Poll, ack and stream all use the workspace. Its approvals never reach the default store, and the default store's never reach it.
- **Scope.** A token reads and acknowledges only its own harness and repo's sessions (poll, ack, stream and the work-map and directives tools); another's are 403. A token that no longer verifies is 401, never the default store. An ack records only a real authority event.
- **Expiry and revocation.** A token lasts 7 days (`expires_at` in the mint response). Leadership disconnects agents with `DELETE /api/workspaces/agent-token` (`{"harness","repo"}` for one, `{}` for all): the consent and that repo's captured sessions go, and every agent token for the workspace stops, so connect the ones you keep again. Restart does the same for all agents. A deleted workspace's token fails too. Human sign-ins are unaffected.
- **Tokens from a #5 build.** Agent tokens minted on a PR #5 build stop working once the merged build runs (they're refused with 401). Mint a new one: `scripts/agent-session.sh` mints one each time it starts and prints its `expires_at`. When a token is refused, `scripts/align-watch.mjs` exits with one line on stderr instead of waiting silently.
- **Hosted mode.** None of this exists when hosted: the routes are 404 and tokens are never accepted.

`scripts/agent-session.sh` does all of it:

```bash
ALIGN_URL=http://127.0.0.1:3100 ALIGN_WORKSPACE=<w_id> ALIGN_WORKSPACE_PASSCODE=<its leadership passcode> \
  scripts/agent-session.sh ~/path/to/repo "<prompt>"
```

**Starting an agent session:**

```bash
ALIGN_MCP_TOKEN=<the server's token> ALIGN_URL=http://127.0.0.1:3100 \
  scripts/agent-session.sh ~/path/to/repo "You're the <team>'s agent. Read your goals and the accepted plan from Align before planning anything, then wait for direction from Align."
```

The script:
- grants capture consent for that repo as leadership;
- writes the MCP config and hook settings to a private temporary folder, which is deleted on exit;
- starts Claude Code in the repo.

By default the session plans only:
- Edit and Write are denied;
- so are shell commands that run code or reach other machines (`--allow-edits` lifts that).

Run it inside `tmux` to keep the session up while the teams decide. Its restraint comes from that deny list and from the prompt: Align supplies the agreement and the wake-up, and enforces nothing in the agent's host.

**The agent can read its own token.** In workspace mode the hooks need the agent token, so `agent-session.sh` puts it in the session's environment as `ALIGN_AGENT_TOKEN`. The plan-only deny list doesn't block `env` or `printenv`, so the agent (and anything it runs) can read the token. This is inherent to hooks: they run as the agent's own user. What a leaked token allows is bounded:
- reading that workspace through MCP;
- capture and wake-ups for its own harness and repo only;
- nothing on human sign-ins, approvals or launch decisions.

It lasts 7 days, and leadership revokes it with `DELETE /api/workspaces/agent-token` or Restart. Don't run untrusted code in a session that holds one.

## Connected AI apps (OAuth, Mode L and hosted)

Any MCP client with OAuth support connects to one custom workspace with only the URL `<origin>/api/mcp`: Claude (desktop, Cowork, claude.ai), ChatGPT, Claude Code and Codex. The workspace shows the steps for each under "Your AI apps".

1. The app gets 401 with a `resource_metadata` link, reads `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-authorization-server`, and identifies itself with a client metadata document (Claude Code, Codex) or registers at `/oauth/register`.
2. It sends the person to `/oauth/authorize`. They paste the workspace link, pick a team and enter its passcode (or use the session their browser already has) and allow read-only access. `/api/oauth/approve` checks it all again and sends them back to the app with a code.
3. The app exchanges the code at `/oauth/token` (PKCE S256) for an `alm.` access token (1 hour) and an `alr.` refresh token (7 days, rotated on each use).

Claude Code, for example:

```bash
claude mcp add --transport http align https://<host>/api/mcp
# then in Claude Code: /mcp, pick align, Authenticate (or: claude mcp login align)
```

Codex: `codex mcp add align --url https://<host>/api/mcp`, then `codex mcp login align`.

Claude Desktop (or any app that runs MCP servers on this computer): `packages/align-connect/align-connect.mjs <align url>` is a local stdio server that signs in the same way and relays to `/api/mcp`. See its README. It works against a server on this machine, where the Claude app's own connectors can't reach.

The token reads only that workspace, through the same five read-only tools; the work map and directives are workspace-wide (an app has no harness or repo). The server's instructions tell the app to call `align_get_directives` and `align_get_decision_record` at the start of each request and before acting on a plan, and to stop and name the approver while a change is waiting. Chat apps can't be woken: they see a change the next time the person sends a message.

The workspace's "Your AI apps" card lists apps once they have read something. The team that connected an app, or leadership, disconnects it (`DELETE /api/workspaces/connections` with `{"id"}`; `{}` for all, leadership only). Restart disconnects every app. Tests: `node scripts/test-oauth.mjs <port>`.
