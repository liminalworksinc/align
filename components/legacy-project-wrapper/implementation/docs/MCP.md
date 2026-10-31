# Align MCP server (read-only by default)

Align runs a read-only MCP server so a coding agent or an AI app can read what people decided before it acts: the
goals a person can read in a v2 workspace (with their limits), change requests with their evidence and decision
records, the directives sent to that person's own sessions, the asks between teams, agent activity toward goals, and a
short brief of all of it. No tool can create, change, propose or approve anything. An app that
asks for the opt-in scope `changes:evidence`, and that the person allows, also gets
`align_add_change_request_evidence`, which attaches an evidence link (labelled agent-reported) to a change request
the person may act on. The contract is
`specs/align/mcp.md`; this page is the how-to.

- Endpoint: `<origin>/api/mcp` (Streamable HTTP, `mcp-handler`), server `align` 0.2.0.
- Protected resource metadata (RFC 9728): `<origin>/.well-known/oauth-protected-resource/api/mcp` (also at the root
  path). It names Align's own authorization server (`/.well-known/oauth-authorization-server`).
- Any request with an `Origin` header (a browser) is refused with 403, in every mode.

## Who can call it

Every request carries `Authorization: Bearer <token>`, one of:

| Token | From | Acts as | Reads |
| --- | --- | --- | --- |
| `alm.…` | Align's OAuth server, after the person approves the app at `/oauth/authorize` | That person | The one workspace chosen at consent |
| `alnd_…` | `align login` (v2 device pairing) | The device's person | The device's granted workspaces where the person is still a member |

Tools act as that person, with their workspace role, team memberships and goal visibility (`lib/v2/policy.ts`). The
static `ALIGN_MCP_TOKEN` and v1 workspace agent tokens (`agt.`) are no longer accepted (401).

Every tool takes an optional `workspace` (a `ws_` id). An app reads its grant's workspace; a device names one when it
can read several (`Name a workspace: this device can read several`).

## Connect an AI app

Any MCP client with OAuth support connects with only the URL `<origin>/api/mcp` (the workspace's Apps tab shows it):

1. The app gets 401 with a `resource_metadata` link, reads both metadata documents and identifies itself with a client
   metadata document (CIMD) or dynamic client registration.
2. It sends the person to `/oauth/authorize`. They sign in to Align (a sign-in from the last 15 minutes), pick one of
   their workspaces where they are an owner or member, and allow read-only access. An app whose request carries
   `scope=goals:read changes:evidence` is shown one more line ("It may also attach links to change requests you can
   act on, as evidence. Align labels them agent-reported.") and an **Allow access** button instead.
3. The app exchanges the code at `/oauth/token` (PKCE S256) for an `alm.` access token (1 hour) and an
   `alr.<ws>.<grant>.<secret>` refresh token (rotated on each use, ending 7 days after approval).

Claude Code: `claude mcp add --transport http --scope user align 'https://<host>/api/mcp'; claude mcp login align`.
Codex: `codex mcp add align --url 'https://<host>/api/mcp'`. The Apps tab shows both lines, built from the URL alone by
`lib/paste-lines.ts`: every value single-quoted, no workspace or company name, and no line at all for a URL Align
couldn't have made. They only add the server: no hooks and no AGENTS.md rule (goal context inside sessions comes from
the `align` CLI, `align install`). The URL's origin comes from the request's `Host`; a Host that is more than a DNS name
or bracketed IPv6 address and a numeric port gives `http(s)://invalid.invalid` (`lib/oauth/server.ts`
`originFromHost`), in Mode L too, where the edge checks only the name. Claude Desktop or any stdio-only client:
`packages/align-connect/align-connect.mjs <align url>` (see its README).

Grants live in the v2 database (`v2_oauth_grants`), one per app, person and workspace (at most 20 per person per
workspace; approving the same app again replaces its grant). A grant ends when the person or a workspace owner
disconnects it on the Apps tab (`DELETE /api/v2/workspaces/{ws}/apps/{grant}`), when the person leaves or is removed
(`DELETE /api/v2/workspaces/{ws}/members/{user}`) or the workspace is deleted (`lib/v2/lifecycle.ts` revokes it; the
grant's foreign key to `v2_members` cascades too), when its refresh token or code is replayed, after 7 days, or when
`ALIGN_SECRET` is rotated.

**Connected is not read.** A grant keeps two times, each written off the request path at most every 5 minutes and null
until the first (`lib/oauth/grants.ts`). `last_used_at`, shown as **Last connected**, is set by any `/api/mcp` request
whose access token verifies, `initialize` and `tools/list` included, so it says only that the app connected.
`last_read_at`, shown as **Last read the goals**, is set only when `align_list_goals`, `align_get_goal`,
`align_get_brief` or `align_get_limits` returns at least one goal (`lib/mcp/register.ts` `readGoals`): those four answer
with the goals themselves at their launched version. A decision record (one request's before and after), directives
(their delivery has its own receipts), change requests, asks and activity don't set it. On the Home an app with a
`last_read_at` is a delivery receipt ("Read the goals <time>"); one that only connected is not observed ("Connected
<time>, no goal read seen yet"). Neither says which goal version the app has or what it did. Device tokens have no
grant, so neither time is kept for them.

**Scopes.** `goals:read` is always granted and is the default. `changes:evidence` is granted only when the authorization
request names it (unknown scope names are ignored); dynamic registration accepts and echoes it. The grant stores its
scopes (`v2_oauth_grants.scope`, shown on the Apps tab), the token response's `scope` says which, and a refresh keeps
them: asking for more is `invalid_scope` (the refresh token still works), asking for fewer narrows only that access
token. Device tokens hold `goals:read` only here (a device can still add an agent-reported link through
`POST /api/v2/workspaces/{ws}/goals/{goal}/change-requests/{id}/evidence`).

## Tools

All nine read tools are annotated `readOnlyHint: true`, `idempotentHint: true`, `openWorldHint: false`. The evidence
tool, listed only for a token holding `changes:evidence`, is `readOnlyHint: false`, `destructiveHint: false`,
`idempotentHint: false`, `openWorldHint: false`; calling it with any other token gets `403` with
`WWW-Authenticate: Bearer error="insufficient_scope", scope="goals:read changes:evidence"`. Every tool returns
`structuredContent` (with an `outputSchema`) and a one-item text summary.

| Tool | Input | Returns |
| --- | --- | --- |
| `align_list_goals` | none | The goals the person can read, at their current version: owner, team, level, visibility, parents, `depends_on`, `bindable` |
| `align_get_goal` | `goal_id`, `version?` | One goal version with its measures, and every version (title, status, content hash) |
| `align_list_change_requests` | `state?` | Change requests on goals the person can read, with every evidence link and the Align snapshot of the current revision |
| `align_get_decision_record` | `change_request_id` | A decided change request: who asked and decided, the reason, the diff, `launch` (pending, not_yet, launched or superseded) and the version the launch created, its "Accept if" `condition` and acknowledgement, its evidence, `approved_without_evidence` |
| `align_add_change_request_evidence` (only with `changes:evidence`) | `change_request_id`, `kind`, `url`, `label`, `revision?` | Adds an agent-reported link to the current revision of an open request the person asked for or can approve (`lib/v2/changes.ts` `addEvidence`) |
| `align_get_directives` | none | The newest 50 directives sent to the person's own sessions in the workspace |
| `align_get_limits` | `goal_id?` | The limits (must, must not, out of scope) of goals whose limits are shared with the caller, with their source and who saved the version; own and own teams' goals first |
| `align_get_asks` | `state?`, `team_id?` | Asks between teams the person can read (their teams', the ones they recorded; all for a workspace owner), their teams' first, open → accepted → closed, newest; at most 100 |
| `align_get_goal_activity` | `goal_id?` | For each readable goal, the last 14 days: sessions, active now, by harness, last activity and its `evidence_class` (`agent_reported` or `not_observed`); for the goal's owner, team and workspace owners also the top file paths and the person's own sessions; `unbound` (their shared sessions with no goal) |
| `align_get_brief` | none | The person's goals (own and their teams'; company goals too for a workspace owner) with measures and limits, the change requests and alignments on them still waiting on someone (who, never the reason), and up to 5 open or accepted asks of their teams; summary at most 1,800 characters |

**Read scoping of the four newer tools.** A token reads what its person reads in the web app, with one narrowing for
limits (the founder's 2026-10-29 ruling, restated for v2): through MCP a workspace owner reads every readable goal's
limits; anyone else reads the limits of goals owned by a team they are in (and of goals they own); a person in no team
reads company goals' limits (and their own). Every other output that carries limits (`align_list_goals`,
`align_get_goal`, a directive's goal) shows `limits: null` for a goal outside that rule. Asks follow the asked team
(`lib/v2/asks.ts`) and activity detail the goal's owner, its team and workspace owners (`lib/v2/goal-activity.ts`);
`lib/mcp/register.ts` checks both again. Activity is counts, times and repo-relative paths only: never prompts, replies,
task labels, commit subjects or usage. Summaries are capped at 2,400 characters (1,800 for the brief).

Change requests are read through `lib/v2/changes-read.ts`, which reshapes the views of `lib/v2/changes.ts` (only requests
on goals the person can read; the MCP layer checks that again).

**People's text is data.** Every string a person wrote (names, titles, measures, reasons, notes, evidence URLs and
labels, and model names in snapshots) comes back as
`{"untrusted_text": "…"}` in `structuredContent`, and between `<untrusted-text>` tags, with `<` and `>` escaped, in the
text summary. The server instructions say so too.

Tests: `scripts/test-oauth.mjs <port>` (the whole flow, both token kinds, Mode L and hosted) and the MCP checks in
`scripts/test-v2.mjs`.
