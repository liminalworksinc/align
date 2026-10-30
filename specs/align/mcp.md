---
name: MCP server
summary: Read-only MCP endpoint at /api/mcp that serves ratified goals, the accepted plan, the work map, decision records and directives, protected by static, agent and OAuth 2.1 bearer tokens.
kind: area
---

# MCP server

Align runs a read-only Model Context Protocol server so that coding agents and AI apps
can read what people have ratified before they act: current shared goals, the plan a
team's agents may run, captured agent sessions and their goal mapping, proposal decision
records, and authority changes routed to agent sessions. No tool can create, change or
ratify anything. Goals change only through people in the Align UI.

**Transport.** One endpoint, `/api/mcp`, handles `GET`, `POST` and `DELETE` with MCP
Streamable HTTP through `mcp-handler`, which decides session handling (see Open questions). The server identifies itself as
`align` version `0.2.0` and sends instructions telling the client to call
`align_get_directives` and `align_get_decision_record` at the start of each request and
before acting on a plan.

**Tools, resources and prompts.**

| Name | Kind | Input | Returns |
| --- | --- | --- | --- |
| `align_list_goals` | tool | none | Registry version, org, latest Leadership push, current shared goals, visible registry entries |
| `align_get_accepted_plan` | tool | `team` (`"security"`, default) for static and agent tokens; none for `alm.` tokens | The plan the owning team's agents are authorized to run, plus `agreement` in a custom scenario |
| `align_get_work_map` | tool | `session_id?` (max 200 chars) | Captured agent sessions grouped by mapped registry key |
| `align_get_decision_record` | tool | `proposal_id?` (max 100 chars) | The latest or given proposal's decision record and the outcome note |
| `align_get_directives` | tool | `session_id?` (max 200 chars) | Pending directives for a session and the 10 most recent authority events |
| (none) | resource | — | No MCP resources are registered |
| (none) | prompt | — | No MCP prompts are registered |

**Auth model.** Every request needs `Authorization: Bearer <token>`. There are three
token kinds, and each maps to one store:

- `alm.` access tokens from Align's own OAuth 2.1 authorization server: one custom
  workspace, in local mode (Mode L) and when hosted.
- `agt.` agent tokens minted by a workspace's leadership: one custom workspace and one
  harness/repo pair, Mode L only.
- The static `ALIGN_MCP_TOKEN`: the default store (the Northstar demo or a `/setup`
  scenario), Mode L only.

The authorization server supports the authorization code grant with PKCE S256 only. It
accepts public clients only, identified by a Client ID Metadata Document (CIMD) or by
Dynamic Client Registration (DCR). It rotates refresh tokens, binds tokens to a resource
(RFC 8707), returns `iss` on redirects (RFC 9207) and publishes RFC 8414 and RFC 9728
metadata. A person approves an app with a workspace role passcode or with the workspace
session their browser already holds. The only scope is `goals:read`.

### Requirement: Streamable HTTP endpoint

The MCP server SHALL serve MCP over Streamable HTTP at `/api/mcp` for the `GET`, `POST` and `DELETE` methods, identify itself as `align` version `0.2.0`, and send instructions that tell clients to read directives and the decision record before acting.

#### Scenario: Initialize with a valid token

- **WHEN** a client sends `POST /api/mcp` with a JSON-RPC `initialize` request, `Accept: application/json, text/event-stream` and a valid bearer token
- **THEN** the server answers with `serverInfo` `{name: "align", version: "0.2.0"}` and an `instructions` string that names `align_get_directives`, `align_get_decision_record` and `align_get_accepted_plan` and states that the client cannot create, change or ratify goals

### Requirement: Exactly five read-only tools

The MCP server SHALL list exactly five tools (`align_get_accepted_plan`, `align_get_decision_record`, `align_get_directives`, `align_get_work_map`, `align_list_goals`). Each tool SHALL carry the annotations `readOnlyHint: true`, `idempotentHint: true` and `openWorldHint: false`, declare an `outputSchema`, and return both `structuredContent` and one `text` content item that summarizes it. The server SHALL register no MCP resources and no MCP prompts.

#### Scenario: List tools

- **WHEN** an authenticated client calls `tools/list`
- **THEN** the result contains exactly those five tool names, each with the three annotations above and an `outputSchema`

#### Scenario: Call a tool

- **WHEN** an authenticated client calls any of the five tools with valid arguments
- **THEN** the result has no `isError`, includes `structuredContent` that matches the tool's `outputSchema`, and has a `content` array with one `text` item

### Requirement: No write capability

The MCP server SHALL expose no tool that creates, changes, ratifies or acknowledges goals, proposals or plans. Every tool handler SHALL only read workspace state.

#### Scenario: A mutating tool is called

- **WHEN** an authenticated client calls `tools/call` with `name: "align_ratify"` and `arguments: {proposal_id: "x"}`
- **THEN** the call fails, either as a JSON-RPC error or as a result with `isError: true`, and no state changes

### Requirement: Per-tool scope check

The MCP server SHALL check, inside every tool handler, that the caller's auth info includes the scope `goals:read`. It SHALL fail the tool call with the message `Not authorized to read Align goals` if the scope is missing. This check runs in addition to the HTTP-level authentication.

#### Scenario: Authenticated caller

- **WHEN** a caller authenticated by any accepted token kind calls a tool
- **THEN** the scope check passes, because every accepted token kind is granted exactly `["goals:read"]`

### Requirement: Store selection by token

The MCP server SHALL answer every tool from exactly one store, chosen by the bearer token. An `alm.` or `agt.` token reads the custom workspace named in the token (`extra.ws`). The static `ALIGN_MCP_TOKEN` reads the default store (the Northstar demo or a `/setup` scenario).

#### Scenario: OAuth token isolation

- **WHEN** an app holding an `alm.` token issued for workspace A calls `align_list_goals`
- **THEN** `structuredContent.org` is workspace A's company name and nothing from any other workspace appears in the result

#### Scenario: Static token

- **WHEN** a client authenticated with `ALIGN_MCP_TOKEN` calls `align_list_goals` against the Northstar store
- **THEN** `structuredContent.org` is `"Northstar Security"`

### Requirement: align_list_goals output

The MCP server SHALL return from `align_list_goals` (input: none) these fields: `registry_version`; `org`; `latest_push` as `{version, pushed_at, pushed_by}` or `null`; `goals`; and `registry`. `goals` SHALL hold only the current versions of goals whose visibility is `shared`, ordered company, then product, then security. Each goal SHALL carry `goal_id`, `team`, `owner`, `version`, `objective`, `measures[{id,text}]`, `approved_at` and, when present, `supersedes`. `registry` SHALL hold only active registry entries that point at no goal or at a visible goal, each as `{key,label,team,version}`. `pushed_by` SHALL be `"CEO / Leadership"` for Northstar and the leadership lead's name in a custom scenario.

#### Scenario: Private goals are withheld

- **WHEN** the store holds a current goal with visibility other than `shared`
- **THEN** that goal is absent from `goals`, and any registry entry whose `goal_id` names it is absent from `registry`

#### Scenario: No push yet

- **WHEN** the store has no Leadership pushes
- **THEN** `latest_push` is `null` and the text summary says `no Leadership push yet`

### Requirement: align_get_accepted_plan for the Northstar store

The MCP server SHALL return from `align_get_accepted_plan` in a non-custom store the fields `team` (`"security"`), `goal_id`, `goal_version`, `plan` (`<plan_id>@<version>`), `plan_hash`, `authority`, `ratified_at`, `test_status` and `run_command: "scripts/run-plan.sh accepted"`. The plan SHALL come from the latest acceptance when that acceptance created the current Security goal. Otherwise the plan SHALL be `p-throughput@1` with authority `current approved goal (no change ratified)` and `test_status: null`. For static and agent tokens the input schema SHALL be `{team: enum["security"], default "security"}`.

#### Scenario: Ratified change

- **WHEN** Security has ratified a proposal whose acceptance created the current Security goal, and a client calls `align_get_accepted_plan` with `{}`
- **THEN** `plan` is that acceptance's `plan_id@plan_version`, `authority` is `ratified by <owner name>`, and `run_command` is `scripts/run-plan.sh accepted`

#### Scenario: Invalid team

- **WHEN** a static-token client calls `align_get_accepted_plan` with `{team: "product"}`
- **THEN** the call fails input validation, because the only allowed value is `"security"`

### Requirement: align_get_accepted_plan for a custom scenario

In a custom scenario or workspace, the MCP server SHALL return from `align_get_accepted_plan` the same core fields plus an `agreement` object. The object SHALL hold `company`, `asking_team`, `owning_team`, `status` (`agreed` | `not_agreed`), `launch` (`approved` | `pending` | `not_applicable`), `plan_title`, `plan_text`, `owning_measures`, `agreed_measure`, `conditions` and `asking_commitment`. `run_command` SHALL say there is no script to run. When the change is agreed but leadership has not approved the launch, `run_command` SHALL also say that launch approval is still pending. When nothing is agreed, `plan` SHALL be `"none"` and `plan_hash` SHALL be `""`.

#### Scenario: Agreed, launch pending

- **WHEN** the owning team has approved the proposal but leadership has not approved the launch
- **THEN** `agreement.status` is `agreed`, `agreement.launch` is `pending`, and `run_command` starts with `none: this plan is an agreement between teams, not a script.` and ends with `Launch approval is still pending: plan within the agreement only, and don't act as if the launch is approved.`

#### Scenario: Nothing agreed yet

- **WHEN** no acceptance has created the current owning-team goal
- **THEN** `plan` is `none`, `agreement.status` is `not_agreed`, `agreement.launch` is `not_applicable`, and the text summary says the plan is proposed or is a setup candidate and must not be acted on

### Requirement: App variant of the tool schemas

For requests whose `Authorization` header matches `^bearer\s+alm\.` (case-insensitive), the MCP server SHALL use a separate tool registration in which `align_get_accepted_plan` takes an empty input object (no `team` argument). All other tools SHALL be unchanged.

#### Scenario: Connected app lists tools

- **WHEN** an app with an `alm.` token calls `tools/list`
- **THEN** the `align_get_accepted_plan` input schema has no `team` property

### Requirement: align_get_work_map output

The MCP server SHALL return from `align_get_work_map` the fields `registry_version`, `query` (the trimmed `session_id` or `null`), `total_sessions` and `groups[{key,label,team,sessions}]`. Sessions SHALL be grouped by their latest mapping's `choice`, or under `unmapped` ("Not mapped to a goal yet", team "Unassigned"), and sorted newest `last_at` first. Without `session_id`, every visible registry entry has a group, even an empty one. A mapping whose `choice` is not in the visible registry is grouped under that key with label `(not in the current registry)` and team `Unknown`. Each session SHALL carry `id`, `harness`, `repo`, `branch`, `origin`, `last_prompt` (whitespace-collapsed, clipped to 200 characters with an ellipsis), `files_count`, `last_at`, `ended` and `mapping`. `mapping` SHALL be `{state, choice, choice_label, confidence, conflict_flagged, registry_version, stale, mapped_at}` or `null`. `session_id` is optional, at most 200 characters, and matches a session's `id` or raw `session_id` exactly, or else by suffix of the raw `session_id`. With `session_id`, the result SHALL contain at most one session, include `mapping.probabilities`, and drop empty groups.

#### Scenario: Single session lookup

- **WHEN** a client calls `align_get_work_map` with `{session_id: "<suffix of a raw session id>"}`
- **THEN** `total_sessions` is `1`, only the group holding that session is returned, and its `mapping` (if any) includes `probabilities`

#### Scenario: No match

- **WHEN** `session_id` matches no visible session
- **THEN** `total_sessions` is `0`, `groups` is empty, and the text says `No captured session matches "<session_id>".`

### Requirement: align_get_decision_record output

The MCP server SHALL return from `align_get_decision_record` the fields `found`, `record` and `note`, where `note` is always `"Company outcome is not verified by this record."`. With no `proposal_id` (optional, at most 100 characters), `record` SHALL describe the latest proposal. It SHALL include `proposal_id`, `state`, `proposed_by`, `recipient`, `target_goal_id`, `target_goal_version`, `proposed_text`, `rationale`, `reciprocal_commitment`, `created_at`, `plan_ref{plan,plan_hash}`, `test_status`, `counters[]`, `product_ack_at`, `ratification` (or `null`), and `sparta_runs[{id,plan,scenario,verdict,exit_code,failed_checks}]` drawn from the proposal's simulation refs and the acceptance's evidence.

#### Scenario: Unknown proposal

- **WHEN** a client calls `align_get_decision_record` with `{proposal_id: "nope"}` and no such proposal exists
- **THEN** `found` is `false`, `record` is `null`, `note` is the outcome note, and the text is `No proposal nope. Company outcome is not verified by this record.`

#### Scenario: Custom scenario summary

- **WHEN** the store is a custom scenario
- **THEN** the text summary uses the workspace's state label and says `no sandbox test exists for this plan` instead of listing Sparta runs

### Requirement: align_get_directives output

The MCP server SHALL return from `align_get_directives` the fields `session_id`, `session_found`, `directives[{event_id,kind,at,authority,title,text}]` and `recent`. `recent` SHALL list the 10 most recent authority events (`kind` `push` or `ratify`), newest first, each with `delivered` and `acted` counts across sessions. With `session_id` (optional, at most 200 characters, matched by exact id or raw-id suffix), `directives` SHALL be the relevant events that session has not received yet. Without `session_id`, `session_id` and `session_found` SHALL be `null` and `directives` SHALL be empty.

#### Scenario: No session given

- **WHEN** a client calls `align_get_directives` with `{}`
- **THEN** `directives` is `[]`, `session_found` is `null`, and the text starts `No session_id given; pending directives not computed.`

#### Scenario: Unknown session

- **WHEN** `session_id` matches no visible session
- **THEN** `session_found` is `false`, `directives` is `[]`, and the text says `No captured session matches "<session_id>".`

### Requirement: Agent token session scoping

When the caller holds an `agt.` agent token, the MCP server SHALL compute `align_get_work_map` and `align_get_directives` over a copy of the workspace state. That copy holds only the sessions, and their mappings, whose `harness` and `repo` equal the token's. The goals, accepted plan and decision record tools SHALL read the whole workspace. For `alm.` and static tokens, the session-level tools SHALL be workspace-wide.

#### Scenario: Another repo's session

- **WHEN** an agent token for `claude-code`/`repo-a` calls `align_get_work_map` with the id of a session captured for `repo-b`
- **THEN** that session is not visible, and the result reports no matching session

### Requirement: Bearer authentication required

The MCP server SHALL reject with HTTP `401` every request whose bearer token is missing or does not verify as an `alm.`, `agt.` or static token. Align wraps the handler in `mcp-handler`'s `withMcpAuth` with `required: true`, `requiredScopes: ["goals:read"]`, `resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp"` and `resourceUrl: <origin>`, where `<origin>` comes from the request's `Host` header. The `WWW-Authenticate` challenge SHALL point at `<origin>/.well-known/oauth-protected-resource/api/mcp` (Align supplies the two parts; `mcp-handler` joins them into the header). The exact error body, the header's form and the other challenge parameters are produced by `mcp-handler`, not Align code.

#### Scenario: No token

- **WHEN** a client sends `POST /api/mcp` with no `Authorization` header
- **THEN** the response is `401` and its `WWW-Authenticate` header contains `<origin>/.well-known/oauth-protected-resource/api/mcp` (the header is built by `mcp-handler` from `resourceUrl` and `resourceMetadataPath`; its parameter name and exact form are `mcp-handler`'s)

#### Scenario: Forged or wrong token

- **WHEN** a client sends `Authorization: Bearer not-the-token`, or an `alm.` token with a tampered signature
- **THEN** the response is `401`

### Requirement: Static token

In Mode L, the MCP server SHALL accept the `ALIGN_MCP_TOKEN` environment value as a bearer token, compared in constant time, and SHALL give it client id `align-local` and scope `goals:read`. When `ALIGN_MCP_TOKEN` is unset, no static token SHALL be accepted.

#### Scenario: Unset static token

- **WHEN** `ALIGN_MCP_TOKEN` is unset and a client presents any non-`alm.`, non-`agt.` bearer token
- **THEN** the response is `401`

### Requirement: Agent token verification

In Mode L, the MCP server SHALL accept an `agt.<payload>.<HMAC>` token only when all of the following hold:

- The HMAC verifies.
- The payload has `kind: "agent"`, a valid custom workspace id, harness `claude-code` or `codex`, and a repo name matching `^[\w.-]{1,120}$`.
- `exp` is in the future. Tokens last 7 days from minting.
- The workspace exists and its current agent epoch equals the token's `ep`.

The MCP server SHALL give the caller client id `agent:<ws>` and scope `goals:read`.

#### Scenario: Revoked agent token

- **WHEN** leadership calls `DELETE /api/workspaces/agent-token` or restarts the workspace (which bumps the agent epoch), and an older agent token then calls `/api/mcp`
- **THEN** the response is `401`; it never falls back to the default store

### Requirement: Hosted mode restrictions

When hosted (`HOSTED=1`), the MCP server SHALL accept only `alm.` OAuth access tokens, never `agt.` or static tokens. It SHALL refuse any `/api/mcp` request that carries an `Origin` header with `403` and body `{"error":"Browsers can't call this endpoint"}`, before authentication. Only the MCP, metadata, OAuth and connections routes, plus the other listed tester routes, and, when `ALIGN_GOAL_SESSIONS=1`, `/app*` and `/api/v2/*`, SHALL be reachable. `/` and `/setup` SHALL redirect (`307`) to `/new`. Every other path SHALL get `404 {"error":"Not found"}`. These path rules apply after the hosted host, `https` (`X-Forwarded-Proto`) and `Fly-Client-IP` checks in `proxy.ts`.

#### Scenario: Browser call when hosted

- **WHEN** a request to `/api/mcp` on a hosted server carries any `Origin` header
- **THEN** the response is `403` with `{"error":"Browsers can't call this endpoint"}`

#### Scenario: Agent token when hosted

- **WHEN** a hosted server receives `Authorization: Bearer agt.…`
- **THEN** the response is `401`

### Requirement: Local-only host check

In Mode L, Align SHALL refuse any request, including `/api/mcp`, whose `Host` hostname is not a loopback name. The refusal SHALL be `421` with the text `Misdirected request: this server answers to localhost only`.

#### Scenario: DNS-rebound request

- **WHEN** a request reaches a Mode L server with `Host: evil.example`
- **THEN** the response is `421`

### Requirement: OAuth access token validation

The MCP server SHALL accept an `alm.<payload>.<HMAC>` access token only when all of the following hold:

- The HMAC, domain-separated with the `alm.` prefix, verifies.
- `kind` is `mcp` and `ws` is a custom workspace id.
- `aud` equals `<origin>/api/mcp`, with `<origin>` taken from the request's `Host`.
- `exp` is in the future. Access tokens last 3600 seconds.
- The workspace exists and its agent epoch equals the token's `ep`.
- The grant `gid` is still live for the same client id `cid`.

The token SHALL be checked against the stored grant on every call, so revoking a grant stops its access tokens immediately.

#### Scenario: Token presented at another origin

- **WHEN** an `alm.` token issued for `http://127.0.0.1:<port>/api/mcp` is presented with `Host: localhost:<port>`
- **THEN** the response is `401`

#### Scenario: Disconnected app

- **WHEN** a team removes an app's grant and the app then calls `/api/mcp` with an unexpired access token
- **THEN** the response is `401`

### Requirement: Protected resource metadata

Align SHALL serve RFC 9728 metadata at both `GET /.well-known/oauth-protected-resource/api/mcp` and `GET /.well-known/oauth-protected-resource`, with identical bodies: `{resource: "<origin>/api/mcp", authorization_servers: ["<origin>"], scopes_supported: ["goals:read"], bearer_methods_supported: ["header"], resource_name: "Align"}`. Responses SHALL carry `access-control-allow-origin: *`. Both routes, and the authorization server metadata route, export `OPTIONS` from `mcp-handler`'s `metadataCorsOptionsRequestHandler()`, so the CORS preflight response is produced by `mcp-handler`, not Align code.

#### Scenario: Discovery after 401

- **WHEN** a client follows the `resource_metadata` URL from a 401 challenge
- **THEN** it receives `200` with `resource` equal to `<origin>/api/mcp` and `authorization_servers[0]` equal to `<origin>`

### Requirement: Authorization server metadata

Align SHALL serve RFC 8414 metadata at `GET /.well-known/oauth-authorization-server` with `access-control-allow-origin: *`. The body SHALL contain:

- `issuer: <origin>`
- `authorization_endpoint: <origin>/oauth/authorize`
- `token_endpoint: <origin>/oauth/token`
- `registration_endpoint: <origin>/oauth/register`
- `response_types_supported: ["code"]`
- `grant_types_supported: ["authorization_code","refresh_token"]`
- `code_challenge_methods_supported: ["S256"]`
- `token_endpoint_auth_methods_supported: ["none"]`
- `scopes_supported: ["goals:read"]`
- `client_id_metadata_document_supported: true`
- `authorization_response_iss_parameter_supported: true`

When hosted, the origin SHALL use `https`. Otherwise it SHALL use `http`.

#### Scenario: Fetch metadata

- **WHEN** a client sends `GET /.well-known/oauth-authorization-server`
- **THEN** the response is `200`, `issuer` equals the request's origin, and `code_challenge_methods_supported` is exactly `["S256"]`

### Requirement: Dynamic client registration

The authorization server SHALL accept RFC 7591 registration at `POST /oauth/register` for public clients only. The JSON body is capped at 8 KB. `redirect_uris` must list 1 to 10 valid redirect URIs. `token_endpoint_auth_method` must be absent or `none`. On success it SHALL return `201` with `cache-control: no-store` and the body `{client_id: "dcr_<22 chars>", client_name, redirect_uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code","refresh_token"], response_types: ["code"], client_id_issued_at}`. `client_name` SHALL be cleaned: control, line and paragraph separators become a space; format and blank characters are removed; the result is cut to 80 characters and defaults to `An unnamed app`. At most 500 DCR clients SHALL be kept, and the oldest SHALL be dropped first. Registration alone SHALL grant no access.

#### Scenario: Invalid redirect URIs

- **WHEN** a client registers with `redirect_uris: ["http://example.com/cb"]`, or with a confidential `token_endpoint_auth_method`
- **THEN** the response is `400` with `error: "invalid_redirect_uri"` and an `error_description`

#### Scenario: Malformed or oversized body

- **WHEN** the registration body is invalid JSON or larger than 8 KB
- **THEN** the response is `400` with `error: "invalid_client_metadata"`

### Requirement: Client ID metadata documents

The authorization server SHALL accept as `client_id` an https URL that has a non-root path, no fragment, no userinfo, no explicit port, no IP-literal host, and at most 500 characters. It SHALL resolve the client by fetching the JSON document at that URL with these limits:

- Addresses that resolve to private, loopback, link-local, CGNAT, multicast, documentation, reserved or IPv4-embedding IPv6 ranges are refused.
- The whole fetch has a 3 s deadline and a 5 KB size limit.
- Any failure other than a refused address or a non-5xx HTTP status (a dropped connection, a 5xx answer, a body over 5 KB or a body that is not JSON) gets one retry, none after the 3 s deadline. If the retry fails too, the document is treated as unreachable.
- At most 8 fetches run at once per pool. Anthropic/OpenAI hosts form one pool and all other hosts form the other. While a pool is full, an app whose last good document is under a day old gets that document; any other app is told Align couldn't reach its host.

The document is usable only if its `client_id` equals the URL and it lists 1 to 10 valid `redirect_uris`. Good documents SHALL be cached for 10 minutes. Unusable ones SHALL be cached for 1 minute: a document that fails these checks, a non-200 answer below 500, or a refused address. Unreachable ones SHALL not be cached: a network error, the timeout, a 5xx, an oversized body or a body that is not JSON.

#### Scenario: Unreachable document

- **WHEN** the client document times out or answers 5xx during `/oauth/authorize`
- **THEN** the page shows `Align couldn’t reach <host> to check this app. Reload this page in a minute.` and does not redirect

#### Scenario: Unknown client

- **WHEN** `client_id` is neither a stored `dcr_` id nor a usable CIMD URL
- **THEN** the page shows `Align doesn’t recognize this app. Remove it and add Align again.` and does not redirect

### Requirement: Redirect URI rules

The authorization server SHALL accept a redirect URI only if all of the following hold:

- It uses https, or http on `localhost`, `127.0.0.1` or `[::1]`.
- It has at most 500 characters, no fragment and no userinfo.
- It exactly matches one of the client's registered URIs. The exception is a loopback http URI, which may use any port if host, path and query match a registered loopback URI (RFC 8252 §7.3).

#### Scenario: Unregistered redirect

- **WHEN** `/oauth/authorize` receives a `redirect_uri` that the client did not register
- **THEN** the page shows `This app asked Align to send you somewhere it didn’t register. Nothing was shared.` and never redirects to it

### Requirement: Authorization request validation

The authorization server SHALL validate requests at `/oauth/authorize` and again at `POST /api/oauth/approve`. Once the client and redirect URI are trusted, it SHALL build an error redirect to `redirect_uri` with `error`, `error_description`, `state` and `iss`. `GET /oauth/authorize` SHALL NOT redirect automatically: it renders a `Can’t connect this app` page saying `The app sent a request Align can’t accept. Go back to the app and try again.` with a `Return to the app` link to that error redirect. `POST /api/oauth/approve` SHALL return it as `200 {"redirect": <error redirect>}`. The cases are:

- `response_type` other than `code` returns `unsupported_response_type`.
- A missing or malformed `code_challenge` (must match `^[A-Za-z0-9._~-]{43,128}$`), or a `code_challenge_method` other than `S256`, returns `invalid_request` with `PKCE with S256 is required`.
- A `resource`, when present, other than `<origin>/api/mcp` (a trailing slash is allowed) returns `invalid_target`. A missing `resource` is accepted and bound to `<origin>/api/mcp`.

`state` SHALL be echoed only if it has at most 500 characters.

#### Scenario: Plain PKCE

- **WHEN** an app sends `code_challenge_method=plain`
- **THEN** no code is issued, and the page's `Return to the app` link (or the approve endpoint's `redirect`) carries `error=invalid_request` and `iss=<origin>`

#### Scenario: Wrong resource

- **WHEN** an app sends `resource=https://other.example/api/mcp`
- **THEN** the error redirect carries `error=invalid_target`

### Requirement: Consent page

The authorization server SHALL render a consent page at `GET /oauth/authorize` with the following content:

- The app's self-asserted name, with a `This app named itself.` notice unless the client is a CIMD document hosted by a known AI provider (`claude.ai`, `*.claude.ai`, `*.anthropic.com`, `chatgpt.com`, `*.chatgpt.com`, `*.openai.com`). A DCR client always gets the notice.
- The redirect host.
- Who receives the data.
- A statement that the app cannot propose, approve or change anything.

The person SHALL choose either the custom workspace this browser is signed in to, detected server-side or through same-site `GET /api/session`, or a workspace link, a role and that role's passcode. Northstar sessions SHALL never be offered.

#### Scenario: Signed-in browser

- **WHEN** a person arriving from an AI app has a valid custom-workspace session cookie in this browser
- **THEN** the page offers that workspace and team as a one-click option, with `Allow read-only access` and `Cancel` buttons

### Requirement: Approval endpoint

The authorization server SHALL accept consent answers at `POST /api/oauth/approve`. The request must be `application/json` (otherwise `415`). In Mode L it must have a loopback Host and, if it sends an `Origin`, one whose host equals the Host header. When hosted it must have an allowed Host and an `Origin` that is exactly `https://<host>`; a missing `Origin` is refused. Either failure returns `403`. The body must be at most 16 KB (otherwise `413`). The endpoint SHALL re-run the authorization request checks on `params`. The outcomes are:

- A fatal check failure returns `400 {"error": <message>}`.
- A non-fatal check failure returns `200 {"redirect": <error redirect>}`.
- `decision: "deny"` returns `200 {"redirect": "<redirect_uri>?error=access_denied&error_description=The person declined&state=…&iss=…"}`.
- Any decision other than `approve` or `deny` returns `400 "Choose Allow or Cancel"`.
- `decision: "approve"` requires `use_session: true` with a live custom-workspace session (otherwise `401 "Your session ended. Sign in with a passcode."`), or `workspace` (a link or id containing `w_[a-z2-7]{12}`), `role` and `passcode` (otherwise `401 "Wrong passcode for this role"`).

On approval the endpoint SHALL write an `ai_app_approved` audit entry naming the app and redirect host, and return `200 {"redirect": "<redirect_uri>?code=…&state=…&iss=<origin>"}`.

#### Scenario: Cross-site approval attempt

- **WHEN** `POST /api/oauth/approve` arrives with `Origin: https://evil.example`
- **THEN** the response is `403` and no code is issued

#### Scenario: Wrong passcode

- **WHEN** the passcode is wrong, or belongs to another workspace
- **THEN** the response is `401` and no code is issued

### Requirement: Authorization codes

The authorization server SHALL issue each authorization code as 32 random bytes in base64url, held in memory for 60 seconds. Each code SHALL be single-use and bound to the client id, redirect URI, PKCE challenge, resource, workspace and approving role. At most 1000 codes SHALL be held. Expired codes SHALL be kept a further 60 seconds so that reuse can be detected. A restart SHALL drop all codes.

#### Scenario: Code replay

- **WHEN** a code that was already exchanged is presented again at `POST /oauth/token`
- **THEN** the response is `400 {"error":"invalid_grant","error_description":"This code was already used"}`, and the grant created by the first exchange is removed, so its access token gets `401`

### Requirement: Token endpoint

The authorization server SHALL accept `POST /oauth/token` with `application/x-www-form-urlencoded` or `application/json` bodies of at most 8 KB, and SHALL send `cache-control: no-store` and `pragma: no-cache`. For `grant_type=authorization_code`, the endpoint SHALL require all of the following:

- A known, unexpired, unused `code`.
- The same `client_id`.
- The same `redirect_uri`.
- A `code_verifier` matching `^[A-Za-z0-9._~-]{43,128}$` whose base64url SHA-256 equals the challenge.
- A matching resource.

It SHALL then create a grant and return `200 {access_token: "alm.…", token_type: "Bearer", expires_in: 3600, refresh_token: "alr.…", scope: "goals:read"}`. All errors SHALL be `400` with `{error, error_description}`:

- `invalid_grant` for an unknown or expired code, another client, a mismatched `redirect_uri`, failed PKCE, or a deleted workspace.
- `invalid_target` for a wrong resource.
- `unsupported_grant_type` for any other grant type.
- `invalid_request` for a wrong content type, a body over 8 KB or invalid JSON.

#### Scenario: Wrong verifier

- **WHEN** an app exchanges a valid code with the wrong `code_verifier`
- **THEN** the response is `400 {"error":"invalid_grant","error_description":"PKCE verification failed"}`

#### Scenario: Unsupported grant

- **WHEN** an app sends `grant_type=client_credentials`
- **THEN** the response is `400 {"error":"unsupported_grant_type","error_description":"Use authorization_code or refresh_token"}`

### Requirement: Refresh token rotation

The authorization server SHALL issue refresh tokens of the form `alr.<ws>.<grant id>.<secret>` and store only an HMAC of the secret, keyed with `ALIGN_SECRET` (or, when it is unset, the generated `data/.secret`). For `grant_type=refresh_token`, it SHALL rotate the token: it returns a new `alm.` access token and a new refresh token, and keeps the previous hash so that reuse can be detected. A token presented by another `client_id`, under a stale agent epoch, past its expiry or under a rotated `ALIGN_SECRET` SHALL fail. Presenting the previous refresh token again SHALL delete the grant. Every refresh failure SHALL return `400 {"error":"invalid_grant","error_description":"This sign-in has ended. Connect Align again."}`, except a wrong `resource`, which gets `invalid_target`. A grant's refresh expiry SHALL be set once, when the grant is created, to 7 days later or to the end of the configured deletion date if that is sooner.

#### Scenario: Refresh token reuse

- **WHEN** an app refreshes once, then presents the original refresh token again
- **THEN** the second call gets `invalid_grant`, the grant is removed, and both the newest refresh token and its access token stop working

#### Scenario: Refresh by another client

- **WHEN** a valid refresh token is presented with a different `client_id`
- **THEN** the response is `400` with `error: "invalid_grant"`

### Requirement: Grant lifecycle and revocation

The authorization server SHALL keep at most 20 grants per workspace, in `<workspace>/oauth.json`. A grant is created when a code is exchanged at `/oauth/token`, not at approval. A new grant for the same `client_id` and role SHALL replace the earlier grant. Grants SHALL stop working, together with their access and refresh tokens, in each of these cases:

- `DELETE /api/workspaces/connections` with `{"id"}`, by the approving team or leadership. Another team gets `403`.
- `DELETE /api/workspaces/connections` with `{}`, by leadership only (otherwise `403`). This also bumps the agent epoch, so it also revokes every agent token.
- `DELETE /api/workspaces/agent-token` (Mode L, leadership), which bumps the agent epoch: disconnecting agents also disconnects every AI app.
- A workspace Restart (agent epoch bump).
- The grant's refresh expiry passing.
- A rotation of `ALIGN_SECRET`.
- Deletion of the workspace.

A grant's `last_used_at` SHALL be set (asynchronously) by the first `/api/mcp` request whose access token verifies, then at most every 5 minutes, or at once when the plan fingerprint has changed. `GET /api/workspaces/connections` SHALL list live grants as `{id,name,redirect_host,role,approved_at,last_used_at,on_current_plan}`, together with the `url` to connect.

#### Scenario: Same app connected twice

- **WHEN** the same app is approved again by the same team
- **THEN** the workspace lists one connection, the earlier access token gets `401`, and the new one works

#### Scenario: Disconnect all

- **WHEN** leadership sends `DELETE /api/workspaces/connections` with `{}`
- **THEN** the response is `{"disconnected": <n>}` and every previously issued access token gets `401`

### Requirement: OAuth endpoint rate limits

The authorization server SHALL rate-limit its unauthenticated endpoints in memory, per client. The client key is the Fly-Client-IP network when hosted and the single key `local` in Mode L. The limits are:

- `POST /oauth/register`: 20 per hour. Over the limit, it returns `429 {"error":"slow_down","error_description":"Too many registrations"}`.
- `POST /oauth/token`: 120 per minute. Over the limit, it returns `429 {"error":"slow_down","error_description":"Too many requests"}`.
- `GET /oauth/authorize`: 30 per minute. Over the limit, it renders a `Too many requests from this network` page.
- `POST /api/oauth/approve`: 30 per minute. Over the limit, it returns `429 {"error":"Too many requests, try again later"}`.

Approvals SHALL also go through the sign-in backoff (`429 "Too many attempts, try again shortly"`), the hosted limit on concurrent sign-ins, and a limit of 10 `connect_app` actions per workspace per minute.

#### Scenario: Registration flood

- **WHEN** a client makes a 21st registration within one hour
- **THEN** the response is `429` with `error: "slow_down"`

### Requirement: Local stdio connector

Align SHALL ship `packages/align-connect/align-connect.mjs`, a dependency-free Node script that runs as a local stdio MCP server and relays each JSON-RPC line from stdin to `POST <align url>/api/mcp`. Its rules are:

- The URL comes from the first argument or `ALIGN_URL`; a trailing `/api/mcp` is stripped. Without an `http(s)://` URL it prints a usage line to stderr and exits with code `2`.
- To sign in it reads the protected resource metadata and the authorization server metadata, starts a one-shot server on `127.0.0.1` with a random port, and registers a client named `Align connector (this computer)` through DCR with that `/callback` redirect. It then opens the browser on `/oauth/authorize` with PKCE S256, a random `state` and the `resource`, or, with `ALIGN_CONNECT_NO_BROWSER=1`, writes the URL to stderr. It accepts the callback only when `state` and `iss` match, and gives up after 5 minutes.
- Tokens are kept in `<ALIGN_HOME or ~/.align>/connect/<host>.json` with mode `0600`, where `<host>` is the URL's host with every character other than letters, digits, `.` and `-` replaced by `_` (so `127.0.0.1:3100` becomes `127.0.0.1_3100`). An access token within 30 seconds of expiry is refreshed. A failed refresh clears the file and starts a new sign-in. A `401` from `/api/mcp` forces one refresh or sign-in, then one retry.
- stdout carries only JSON-RPC responses (from a JSON body or the first SSE `data:` event). Diagnostics go to stderr. A request that can't reach Align gets a JSON-RPC error `-32603` `Align is not reachable: <reason>`. A reply that is not JSON gets `-32603` `Align answered <status>`. Notifications (no `id`) and `202` answers write nothing.

#### Scenario: First start

- **WHEN** a stdio MCP client starts `align-connect.mjs https://<host>` with no stored tokens and sends `initialize`
- **THEN** the script opens the browser on Align's consent page, and after the person allows access it saves the tokens in `~/.align/connect/<host>.json` and writes Align's `initialize` response to stdout

#### Scenario: Missing URL

- **WHEN** the script starts with no argument and no `ALIGN_URL`
- **THEN** it writes `usage: align-connect <align url>, for example https://align.example.com` to stderr and exits with code `2`

## Open questions

- **No rate limit on `/api/mcp`.** The MCP endpoint has no request rate limit of its own. Only the OAuth endpoints are limited. Is that intended?
- **Agent-token scoping in tools differs from the docs.** `docs/MCP.md` says another harness or repo's sessions are `403` for the work-map and directives tools. In the code, `scopeToGrant` silently filters those sessions out, so the tools report "No captured session matches". Only the poll, ack and stream routes use `assertSessionInGrant` (403). Which behavior is the contract?
- **Refresh lifetime is absolute.** Rotation keeps the grant's original `refresh_exp`, so a connected app must be re-approved 7 days after the first approval, however often it refreshes. The docs say "7 days, rotated on each use". Is the non-sliding lifetime intended?
- **The static token never expires.** `ALIGN_MCP_TOKEN` has no expiry and no revocation other than changing the environment value and restarting. Is that acceptable for Mode L? Agent tokens in a custom workspace also see the Northstar-only `team` argument on `align_get_accepted_plan`, because only `alm.` tokens get the app schema. Should agent tokens get the app schema too?
- **Some SDK-level behavior is unverified.** The exact error form for an unknown tool or invalid arguments (JSON-RPC error vs `isError` result), how `GET`/`DELETE` on `/api/mcp` behave (session handling), and the exact 401 body and `WWW-Authenticate` parameters, are decided by `mcp-handler` 2.3.0 and `@modelcontextprotocol/server` 2.3.1, not Align code. The test only asserts that `align_ratify` is "rejected".
- **Bearer parsing edge cases.** The app-variant selector uses `/^bearer\s+alm\./i`, but the token itself is extracted by `mcp-handler`'s `withMcpAuth`, whose parsing is not in Align code (and could not be checked here). If the two disagree, for example on extra whitespace, a header could pick the app schema but fail token extraction (`401`).
- **Several instances.** Codes, rate-limit counters and the CIMD cache live in process memory, so a code issued by one instance can't be exchanged at another and limits apply per instance. Is running more than one instance supported?

## Sources

- `README.md`
- `docs/MCP.md`
- `app/api/mcp/route.ts`
- `app/.well-known/oauth-authorization-server/route.ts`
- `app/.well-known/oauth-protected-resource/route.ts`
- `app/.well-known/oauth-protected-resource/api/mcp/route.ts`
- `app/oauth/authorize/page.tsx`
- `app/oauth/authorize/AuthorizeForm.tsx`
- `app/oauth/register/route.ts`
- `app/oauth/token/route.ts`
- `app/api/oauth/approve/route.ts`
- `app/api/workspaces/connections/route.ts`
- `app/api/workspaces/agent-token/route.ts`
- `lib/mcp/register.ts`
- `lib/oauth/server.ts`
- `lib/oauth/clients.ts`
- `lib/oauth/grants.ts`
- `lib/oauth/limits.ts`
- `lib/auth.ts`
- `lib/agent-token.ts`
- `lib/policy.ts`
- `lib/directives.ts`
- `lib/http.ts`
- `lib/ratelimit.ts`
- `lib/errors.ts`
- `proxy.ts`
- `package.json`, `package-lock.json` (mcp-handler 2.3.0, @modelcontextprotocol/server 2.3.1)
- `scripts/test-mcp.mjs`
- `scripts/test-oauth.mjs`
- `packages/align-connect/align-connect.mjs`, `packages/align-connect/README.md`
