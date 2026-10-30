# Align MCP server

Align runs an MCP server so a coding agent or an AI app can read what people decided before it acts: the goals a
person can read in a v2 workspace, change requests with their evidence and decision records, and the directives sent
to that person's own sessions. No tool can create, change, propose or approve anything. The one write,
`align_add_change_request_evidence`, attaches an evidence link (labelled agent-reported) to a change request the
person may act on. The contract is
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
   their workspaces where they are an owner or member, and allow access (reading, plus agent-reported evidence links).
3. The app exchanges the code at `/oauth/token` (PKCE S256) for an `alm.` access token (1 hour) and an
   `alr.<ws>.<grant>.<secret>` refresh token (rotated on each use, ending 7 days after approval).

Claude Code: `claude mcp add --transport http --scope user align https://<host>/api/mcp; claude mcp login align`.
Codex: `codex mcp add align --url https://<host>/api/mcp`. Claude Desktop or any stdio-only client:
`packages/align-connect/align-connect.mjs <align url>` (see its README).

Grants live in the v2 database (`v2_oauth_grants`), one per app, person and workspace (at most 20 per person per
workspace; approving the same app again replaces its grant). A grant ends when the person or a workspace owner
disconnects it on the Apps tab (`DELETE /api/v2/workspaces/{ws}/apps/{grant}`), when the person leaves or is removed
(`DELETE /api/v2/workspaces/{ws}/members/{user}`) or the workspace is deleted (`lib/v2/lifecycle.ts` revokes it; the
grant's foreign key to `v2_members` cascades too), when its refresh token or code is replayed, after 7 days, or when
`ALIGN_SECRET` is rotated.

## Tools

The five read tools are annotated `readOnlyHint: true`, `idempotentHint: true`, `openWorldHint: false`; the evidence
tool `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: false`, `openWorldHint: false`. All return
`structuredContent` (with an `outputSchema`) and a one-item text summary.

| Tool | Input | Returns |
| --- | --- | --- |
| `align_list_goals` | none | The goals the person can read, at their current version: owner, team, level, visibility, parents, `depends_on`, `bindable` |
| `align_get_goal` | `goal_id`, `version?` | One goal version with its measures, and every version (title, status, content hash) |
| `align_list_change_requests` | `state?` | Change requests on goals the person can read, with every evidence link and the Align snapshot of the current revision |
| `align_get_decision_record` | `change_request_id` | A decided change request: who asked and decided, the reason, the diff, the resulting version, its evidence, `approved_without_evidence` |
| `align_add_change_request_evidence` | `change_request_id`, `kind`, `url`, `label`, `revision?` | Adds an agent-reported link to the current revision of an open request the person asked for or can approve (`lib/v2/changes.ts` `addEvidence`) |
| `align_get_directives` | none | The newest 50 directives sent to the person's own sessions in the workspace |

Change requests are read through `lib/v2/changes-read.ts`, which reshapes the views of `lib/v2/changes.ts` (only requests
on goals the person can read; the MCP layer checks that again).

**People's text is data.** Every string a person wrote (names, titles, measures, reasons, notes, evidence URLs and
labels, and model names in snapshots) comes back as
`{"untrusted_text": "…"}` in `structuredContent`, and between `<untrusted-text>` tags, with `<` and `>` escaped, in the
text summary. The server instructions say so too.

Tests: `scripts/test-oauth.mjs <port>` (the whole flow, both token kinds, Mode L and hosted) and the MCP checks in
`scripts/test-v2.mjs`.
