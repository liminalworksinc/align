---
name: Workspaces and sessions
summary: Creating isolated workspaces with single-use access codes, signing in by role passcode, the AI intake interview, agent tokens, connected apps, and consent-gated capture and goal mapping of coding-agent sessions.
kind: area
---

# Workspaces and sessions

Align serves one organization's conflict per **workspace**. Besides the built-in Northstar demo (the default store
under `data/`), a person can create a **custom workspace**: an isolated directory addressed by an id of the form
`w_` plus 12 lowercase base32 characters (the `/w/<id>` slug). Each workspace has three **roles** (`leadership`,
`product`, `security`), each with its own generated **passcode**. Creating a workspace is gated by an **access code**
(a single-use invite from `ALIGN_SIGNUP_CODES`, Mode L's shared `ALIGN_SIGNUP_CODE`, or open create in Mode L). An
optional **intake interview** lets Claude draft the setup form before the person presses Create.

The server runs in one of two modes. **Mode L** (default) answers only to loopback hosts. **Hosted** (`HOSTED=1`)
serves custom workspaces only behind an HTTPS edge, refuses to start with an unsafe environment, and closes after
`ALIGN_DELETE_BY`. A separate **goal sessions** surface (`/api/v2/*`, behind `ALIGN_GOAL_SESSIONS=1`) has its own
user accounts (Better Auth), workspaces with owner/member/viewer roles, paired devices and shared sessions.

**Workspace lifecycle.** Create (`POST /api/workspaces`, passcodes shown once) → sign in per role
(`POST /api/session`) → work (proposals, goals, connected apps, agents) → optional Restart by leadership (rebuilds
from the saved setup, revokes every agent token and connected app) → delete by the operator (`ws-admin`), after which
every request for it is 404.

**Captured session lifecycle.** Leadership grants capture consent for one harness + repo basename (Northstar:
`POST /api/sessions/consent`; custom workspace: minting an agent token) → local hooks post events to
`POST /api/sessions/events` → the session is upserted (redacted, capped) → in Northstar only, and only when the
external model is enabled, Jev classifies it against the goal registry → the goal's owner confirms or rejects the
mapping → revoking consent purges the sessions and their mappings.

### Requirement: Workspace creation

The server SHALL create a custom workspace from a JSON setup body on `POST /api/workspaces`, return its id, name,
path and the three role passcodes exactly once, and store only scrypt hashes of the passcodes.

#### Scenario: Successful create

- **WHEN** a client POSTs `application/json` to `/api/workspaces` with a valid setup body (the `/setup` schema without `confirm`) and an accepted `signup_code`
- **THEN** the server responds 201 with `{workspace:{id,name,path:"/w/<id>"}, passcodes:{leadership,product,security}, shown_once:true}` and header `cache-control: no-store`, where `id` matches `^w_[a-z2-7]{12}$`, `name` is the setup's `company`, and each passcode is 16 base32 characters shown as `xxxx-xxxx-xxxx-xxxx`

#### Scenario: Invalid setup body

- **WHEN** the body contains `confirm`, a non-string `signup_code`, or fails the setup schema
- **THEN** the server responds 400 with `{error, issues:[{path,message}]}` and creates nothing

### Requirement: Creation request guards

The server SHALL accept workspace-creation requests only as JSON from an allowed host and same origin, with a body of
at most 64 KB.

#### Scenario: Wrong content type or origin

- **WHEN** `POST /api/workspaces` is sent without `content-type: application/json`, or (Mode L) with a non-loopback `Host`, or with an `Origin` whose host differs from `Host` (hosted: an `Origin` not exactly `https://<Host>`, or none)
- **THEN** the server responds 415 `Send this as application/json` for the content type, and 403 for the host or origin

#### Scenario: Oversized setup

- **WHEN** the body exceeds 64 KB (declared or streamed)
- **THEN** the server responds 413 `This setup is too large. Keep it under 64 KB.`

### Requirement: Access codes for creation

The server SHALL admit a creation (and an interview turn) only with an accepted code: no code when open create is on
(Mode L `ALIGN_ALLOW_OPEN_CREATE=1`), otherwise an unspent invite from `ALIGN_SIGNUP_CODES` (case-sensitive,
timing-safe compare) or, in Mode L only, the shared `ALIGN_SIGNUP_CODE`.

#### Scenario: Wrong or spent invite

- **WHEN** invites are configured and the given `signup_code` is unknown or already spent
- **THEN** the server responds 403 `That invite code isn’t valid or was already used`, the same message for both cases

#### Scenario: No code mechanism configured

- **WHEN** open create is off and neither invites nor a shared code are configured
- **THEN** the server responds 403 `Workspace creation is closed`; a wrong shared code instead gets 403 `That signup code isn’t right`

### Requirement: Single-use invites

The server SHALL spend an invite only when the workspace is actually created, record spent invites as SHA-256 hashes
in `<workspacesRoot>/_used_invites.json`, and give the invite back if creation fails after claiming it.

#### Scenario: Reusing an invite

- **WHEN** a second `POST /api/workspaces` presents an invite that already created a workspace
- **THEN** the server responds 403 with the invite refusal and no workspace is created

#### Scenario: Interview does not spend

- **WHEN** a client completes interview turns with an unspent invite
- **THEN** the invite remains unspent and can still create one workspace

### Requirement: Creation limits

The server SHALL refuse creation beyond the workspace cap, beyond the global creation rate, and after repeated wrong
codes from one client.

#### Scenario: Cap reached

- **WHEN** the number of live workspace directories is at or above `ALIGN_MAX_WORKSPACES` (default 25; zero, negative or non-numeric values fall back to 25)
- **THEN** `POST /api/workspaces` responds 409 `The workspace limit for this server has been reached`, and `GET /api/workspaces/config` reports `max_reached: true`

#### Scenario: Rate limits

- **WHEN** 5 workspaces were created in the last rolling hour (fixed at 5 when hosted; `ALIGN_CREATE_PER_HOUR` in Mode L), or a client sent 10 wrong codes in 10 minutes
- **THEN** the server responds 429 `Too many workspaces created recently, try again later`, or 429 `Too many wrong codes, try again in a few minutes` respectively

### Requirement: Workspace storage on disk

The server SHALL build a new workspace in `<ALIGN_DATA_DIR>/workspaces/.tmp-<id>/` and rename it into place, with
directories mode 0700 and files mode 0600 (`state.json`, `scenario.json`, `auth.json`, `workspace.json`), so a
workspace is visible only once complete, append a `created` row holding only the id to `_events.jsonl`, and run only
one server per data directory (pid file `data/.pid` in Mode L, `<ALIGN_DATA_DIR>/.pid` when hosted).

#### Scenario: Startup sweep

- **WHEN** the server starts and finds `.tmp-<id>` or `.deleting-<id>` directories or `*.json.<hex>.tmp` files left by a crash
- **THEN** it removes them before serving

#### Scenario: Second server

- **WHEN** a second process starts on the same data directory while the pid file names a live process
- **THEN** it throws `Another Align server (pid <n>) is using <dir>. Stop it first.` and does not serve

### Requirement: Public workspace endpoints

The server SHALL describe creation availability on `GET /api/workspaces/config`, and expose for a workspace's sign-in
screen only its company name, optional company note and team names on `GET /api/workspaces/{id}/login-info`, both
without a session.

#### Scenario: Reading the config

- **WHEN** a client calls `GET /api/workspaces/config`
- **THEN** the response is `{signup_code_required, max_reached, interview}`, plus `test_server:{delete_by}` when hosted

#### Scenario: Sign-in labels

- **WHEN** a client requests `GET /api/workspaces/w_xxxxxxxxxxxx/login-info`
- **THEN** for an existing workspace the response is `{name, company_note?, roles:[{id:"leadership"|"product"|"security", team, blurb}]}` with no person names or constraints, and for a malformed id, `northstar` or a missing workspace it is 404 `This workspace no longer exists`

### Requirement: Role sign-in to a workspace

The server SHALL sign a person in to a custom workspace on `POST /api/session` with `{workspace, role, passcode}`,
verifying the passcode with scrypt after normalizing it (trimmed, lowercased, spaces and hyphens removed), and answer
every failure with the same 401.

#### Scenario: Correct passcode

- **WHEN** a same-origin JSON `POST /api/session` carries a valid workspace id, role and its passcode
- **THEN** the response is `{actor, name, sid, workspace}` (where `name` is that role's team lead from setup) and a `Set-Cookie` session cookie

#### Scenario: Any failure

- **WHEN** the workspace id is invalid or unknown, the role is not one of the three, or the passcode is wrong
- **THEN** the server responds 401 `Wrong passcode for this role`

### Requirement: Sign-in throttling

The server SHALL throttle custom-workspace sign-ins per workspace, role and client, and bound concurrent passcode
hashing globally.

#### Scenario: Repeated wrong passcodes

- **WHEN** a client has 5 or more failed sign-ins for one workspace and role within 5 minutes and retries before the backoff delay (1 s doubling per further failure, at most 10 s) has passed since the last failure
- **THEN** the server responds 429 `Too many attempts, try again shortly`; other clients and roles are unaffected, and a success clears the count

#### Scenario: Hashing pool full

- **WHEN** 2 passcode checks are running and 8 are waiting, or (hosted) one client already has 2 sign-ins in flight
- **THEN** further sign-ins get 429 (`Too many sign-ins right now, try again in a moment` or `Too many sign-ins at once, try again in a moment`) before any hashing

### Requirement: Session cookie

The server SHALL issue a signed (HMAC-SHA256 with `ALIGN_SECRET`) session cookie named `align_session` in Mode L and
`__Host-align_session` when hosted, with `Path=/; HttpOnly; SameSite=Strict; Max-Age=43200` (plus `Secure` when
hosted), whose custom-workspace token carries the workspace, the workspace epoch and a 12-hour expiry.

#### Scenario: Expired or revoked token

- **WHEN** a request presents a correctly signed custom-workspace token that is expired, whose workspace epoch changed, or whose workspace was deleted
- **THEN** workspace-aware routes respond 401 `Your session ended. Sign in again.`

#### Scenario: Sign out

- **WHEN** a same-origin client calls `DELETE /api/session`
- **THEN** the server responds `{ok:true}` with a cookie of the same name and `Max-Age=0`

### Requirement: Northstar demo sign-in

The server SHALL sign in to the Northstar demo on `POST /api/session` with `{role, passcode}` (no `workspace` key)
against the configured role passcodes, and refuse it when hosted.

#### Scenario: Demo sign-in

- **WHEN** Mode L receives `{role:"leadership", passcode:<ALIGN_LEADERSHIP_PASSCODE or its default>}`
- **THEN** the response is `{actor, name, sid}` with a session cookie; an unknown role gets 400 `Unknown role` and a wrong passcode 401 `Wrong passcode for this role`

#### Scenario: Hosted refuses the demo

- **WHEN** a hosted server receives a Northstar sign-in, or a request carrying a Northstar token
- **THEN** the sign-in is 404 and the token is treated as anonymous

### Requirement: Leadership-only workspace actions

The server SHALL reserve Restart, agent connect/disconnect, disconnecting all AI apps, capture-consent grant/revoke,
captured-session deletion and remapping (`POST /api/mappings {action:"remap"}`) for the `leadership` role, and rate-limit state-replacing workspace actions.

#### Scenario: Non-leadership restart

- **WHEN** a `product` or `security` session of a custom workspace POSTs `{"confirm":"reset"}` to `/api/reset`
- **THEN** the server responds 403 naming leadership's team (`Only <team> can restart this scenario`)

#### Scenario: Action loop

- **WHEN** a workspace performs an 11th `restart`, `connect_agent`, `disconnect_agent` or `disconnect_apps` action of the same kind within one minute
- **THEN** the server responds 429 `Too many of these in a row, try again in a minute`

### Requirement: Workspace restart

The server SHALL, on a leadership Restart of a custom workspace, first revoke every agent token and connected app (by
bumping the agent epoch in `auth.json`), then rebuild the state from the saved `scenario.json`, keeping the audit log
and appending a `reset` row, while human sign-ins stay valid.

#### Scenario: Restart drops capture

- **WHEN** leadership restarts a workspace that had capture consents, captured sessions and an agent token
- **THEN** the rebuilt state has no consents or captured sessions, and the old agent token is refused with 401

### Requirement: Intake interview availability

The server SHALL serve the intake interview on `POST /api/workspaces/interview` only when `ALIGN_INTERVIEW_API_KEY`
is set (or, in Mode L only, `ALIGN_INTERVIEW=1`), and otherwise answer 404 after the same-site check.

#### Scenario: Interview off

- **WHEN** a same-site JSON request reaches the route with the interview disabled
- **THEN** the server responds 404 `Not found`, and `GET /api/workspaces/config` reports `interview: false`

#### Scenario: Cross-site request

- **WHEN** a request arrives with a foreign `Origin` or a non-JSON content type
- **THEN** the server responds 403 or 415 regardless of whether the interview is enabled

### Requirement: Intake interview input rules

The server SHALL accept an interview turn only as `{signup_code?, messages:[{role:"user"|"assistant", text}]}` (no
other keys) with 1 to 30 messages, starting and ending with the user and alternating roles, user messages at most
2,000 characters, assistant messages at most 1,500, 30,000 characters in all, and a body of at most 48 KB; the code is
checked read-only with the creation rule before the conversation.

#### Scenario: Malformed conversation

- **WHEN** the body has an unknown key, zero or more than 30 messages, or roles that do not alternate or do not start and end with `user`
- **THEN** the server responds 400 (`Send the conversation as {messages: [{role, text}]}`, `The conversation must start and end with your message`, or `The conversation must alternate`)

#### Scenario: Too long

- **WHEN** a message or the total exceeds its character cap, or the body exceeds 48 KB
- **THEN** the server responds 413 before any model call

### Requirement: Intake interview limits

The server SHALL refuse an interview turn with 429 before any model call when 4 turns are in flight, a client has
taken 40 turns in 30 minutes, the code's SHA-256 has taken 60 turns in 24 hours, or the server has taken 300 turns in
the last hour or 1,500 in the last 24 hours; a call refused for being busy does not count as a turn.

#### Scenario: Per-code ceiling

- **WHEN** one invite code has been used for 60 turns in the past day, from any number of client addresses
- **THEN** the next turn responds 429 `That's the interviewer's limit for today. Finish the form below by hand.`

### Requirement: Intake interview model use

The server SHALL make each interview turn as one call to `claude-opus-5-5` at `https://api.anthropic.com` (SDK logging
off, 45 s timeout, 1 retry, `max_tokens` 4000, effort `low`, structured output, server-side refusal fallback beta),
never send the access code to the model, store nothing, and return only cleaned text.

#### Scenario: Successful turn

- **WHEN** a valid turn is answered
- **THEN** the response (with `cache-control: no-store`) is `{reply, draft, done}`, where `draft` has the 14 keys `company, company_goal, requirement, asking_team, asking_lead, asking_goal, owning_team, owning_lead, owning_goal, owning_measure, dependency, asking_work, owning_work, plan`, each stripped of control and bidi/zero-width characters, trimmed and capped (300 characters, `plan` 4,000)

#### Scenario: Model refuses or fails

- **WHEN** the model's stop reason is `refusal`, its output does not parse, or the call errors
- **THEN** the server responds 502 (or 429 when the provider rate-limits) and logs only the error's name

### Requirement: Agent tokens

The server SHALL let leadership of a custom workspace in Mode L connect a coding agent with
`POST /api/workspaces/agent-token {harness, repo}`, recording capture consent for that harness and repo and returning
a token shown once that is valid for 7 days and only while the workspace's agent epoch is unchanged.

#### Scenario: Minting a token

- **WHEN** leadership sends `{harness:"claude-code"|"codex", repo:<folder name matching ^[\w.-]{1,120}$, not . or ..>}`
- **THEN** the response is `{token:"agt.…", expires_at, workspace, harness, repo, shown_once:true}` with `cache-control: no-store`, and the audit records `agent_connected` with only `harness/repo`

#### Scenario: Refused callers

- **WHEN** the server is hosted, the caller is a Northstar session, or the caller is not leadership
- **THEN** the server responds 404, 404, or 403 `Only leadership can connect or disconnect agents in this workspace` respectively; a bad harness or repo gets 400

### Requirement: Disconnecting agents

The server SHALL, on `DELETE /api/workspaces/agent-token`, revoke every agent token of the workspace (agent epoch
bump) before removing consent and captured sessions, for one harness and repo when both are given or for all when
the body is `{}`.

#### Scenario: Disconnect one repo

- **WHEN** leadership sends `{harness, repo}`
- **THEN** the response is `{revoked:true, removed_consents, purged_sessions, agent_epoch}`, that repo's consent, sessions and mappings are gone, and every previously minted token returns 401 `This agent token is no longer valid`

#### Scenario: Partial body

- **WHEN** only one of `harness` or `repo` is sent, or either is invalid
- **THEN** the server responds 400 `Send harness and repo to disconnect one agent, or {} for all`

### Requirement: Connected AI apps

The server SHALL list a custom workspace's connected AI apps to any of its signed-in roles on
`GET /api/workspaces/connections` and let the approving team or leadership disconnect one, and leadership alone
disconnect all, on `DELETE`.

#### Scenario: Listing apps

- **WHEN** a workspace session calls `GET /api/workspaces/connections`
- **THEN** the response is `{url:"<origin>/api/mcp", plan:{changed_at}, apps:[{id,name,redirect_host,role,approved_at,last_used_at,on_current_plan}]}` listing only grants valid under the current agent epoch; a Northstar session gets 404

#### Scenario: Disconnecting

- **WHEN** a session sends `{id}` for an app approved by another team and is not leadership, or sends `{}` without being leadership
- **THEN** the server responds 403; an unknown id gets 404 `That app isn’t connected`; leadership's `{}` bumps the agent epoch, clears all grants and returns `{disconnected:n}`

### Requirement: Capture consent records

The server SHALL keep one capture-consent record per harness (`claude-code` or `codex`) and repo folder basename in the
Northstar store, listable by any signed-in Northstar role on `GET /api/sessions/consent` and granted or revoked only by
leadership with a same-origin JSON request.

#### Scenario: Grant

- **WHEN** leadership POSTs `{harness, repo}` to `/api/sessions/consent`
- **THEN** the response is `{ok:true, consent:{harness, repo, granted_by, granted_at}}` and an audit row `grant_capture_consent` holds only `harness/repo`

#### Scenario: Refusals

- **WHEN** the caller is signed out, is another role, sends a foreign `Origin`, or sends a repo that is not a plain folder name
- **THEN** the server responds 401, 403, 403 or 400 respectively and writes nothing

### Requirement: Consent revocation purges

The server SHALL, on `DELETE /api/sessions/consent {harness, repo}`, delete the record and every captured session for
that harness and repo together with their mappings, and audit `revoke_capture_consent` only when something changed.

#### Scenario: Revoke

- **WHEN** leadership revokes a granted consent with captured sessions
- **THEN** the response is `{ok:true, revoked:true, purged_sessions:<n>}`, and later events for that harness and repo get 403

### Requirement: Event ingestion origin and size

The server SHALL accept capture events on `POST /api/sessions/events` only from scripts (no `Origin`) or this very
server's own loopback origin (same host and port as `Host`), with a body of at most 16 KB.

#### Scenario: Browser on another origin

- **WHEN** an event arrives with an `Origin` that is not a loopback name with this server's exact host and port
- **THEN** the server responds 403 `Capture events are accepted from this machine only`

#### Scenario: Oversized or invalid body

- **WHEN** the body exceeds 16 KB, is not JSON, or lacks a valid `harness` or `session_id` (`^[\w.:-]{1,128}$`)
- **THEN** the server responds 413 `Event too large`, 400 `Body must be JSON`, or 400 naming the field

### Requirement: Event ingestion consent

The server SHALL write a captured event only when a consent record exists for its harness and repo (the basename of
`repo`, else of `cwd`), checking again under the write lock, and otherwise answer 403 and write nothing.

#### Scenario: No consent

- **WHEN** an event arrives for a harness and repo without a consent record
- **THEN** the server responds 403 `No capture consent for this harness and repo` and neither stores nor maps the session

#### Scenario: Consented event

- **WHEN** an event arrives for a consented harness and repo
- **THEN** the server responds `{ok:true, id:"<harness>:<session_id>"}` and upserts that session

### Requirement: Event ingestion with an agent token

The server SHALL route an event carrying `Authorization: Bearer agt.…` to that token's workspace, and refuse it unless
the token verifies, matches the event's harness and repo, the workspace still holds consent, and an existing session
with that id belongs to the same repo.

#### Scenario: Revoked or mismatched token

- **WHEN** the token no longer verifies, or names another harness or repo than the event
- **THEN** the server responds 401 `This agent token is no longer valid`, or 403 `This agent token is for <harness> in <repo>`, and never falls back to the Northstar store

### Requirement: Event redaction and caps

The server SHALL redact likely secrets from `prompt`, `command`, `last_message` and `file_path` (Bearer values, `sk-`,
`vck_`, `gh[pousr]_`, `github_pat_`, `AKIA`, `xox?-` tokens, 32+ hex runs, and mixed-case alphanumeric runs of 32+
characters containing digits) and cap what a session keeps.

#### Scenario: Secret in a prompt

- **WHEN** an event's `prompt` contains `Bearer abcdefgh12345678`
- **THEN** the stored prompt reads `Bearer [redacted]`, and any text longer than 1,000 characters is cut with `…`

#### Scenario: Stored session shape

- **WHEN** events accumulate for a session
- **THEN** it keeps at most 200 prompts (consecutive duplicates skipped, oldest dropped), at most 50 distinct repo-relative file paths of up to 300 characters (never an absolute home path), distinct tool names, `repo` and `cwd_name` as basenames, `ended_at` set on `Stop`/`SessionEnd` and cleared on `UserPromptSubmit`/`SessionStart`, and an `origin` of `align-push`, `linear`, `github`, `slack` or `ad-hoc` detected from prompts, commands and branch

### Requirement: Captured session reading and deletion

The server SHALL show captured Northstar sessions only to signed-in Northstar sessions and only from loopback
origins, and let leadership delete one with its mappings.

#### Scenario: Listing

- **WHEN** a signed-in Northstar session calls `GET /api/sessions` with no `Origin` or a loopback one
- **THEN** the response is `{sessions (newest last_at first), mappings, registry_version, listening, mapper}`; signed out is 401, a custom-workspace session 403, a foreign origin 403

#### Scenario: Leadership delete

- **WHEN** leadership calls `DELETE /api/sessions/<harness>:<id>`
- **THEN** the session and its mappings are removed, the audit records `delete_session` with only the id, and the response is `{ok:true, id}`; another role gets 403, a malformed id 400, an unknown id 404

### Requirement: Session-to-goal mapping

The server SHALL classify consented Northstar sessions against the live goal registry (every current shared goal plus
`none`; private goals never included) with Jev (`typesafe-ai/jev` via the AI Gateway) only when
`ALIGN_MAPPER_EXTERNAL=1` and `AI_GATEWAY_API_KEY` are set and the server is not hosted, never for custom workspaces,
and never substitute another model.

#### Scenario: Mapper off

- **WHEN** the external model is not enabled or has no key
- **THEN** no session text leaves the machine, no mapping row is written, `GET /api/mappings` reports `mapper:{status:"off"|"no-key", message}`, and leadership's `POST /api/mappings {action:"remap"}` returns `{ok:true, attempted:false, reason, mapper}` (another role gets 403, another action 400 `Unknown action`)

#### Scenario: Mapper result

- **WHEN** Jev returns a goal with confidence of at least 0.6
- **THEN** the mapping is `PROPOSED` (below 0.6 or `none`: `UNASSIGNED`), its conflict is flagged at a probability of at least 0.6, and a Jev failure after up to 3 attempts yields `MAPPER_UNAVAILABLE` with the reason

### Requirement: Mapping decisions

The server SHALL let only the owner of the goal a mapping chose confirm or reject it on
`POST /api/mappings/{session_id}/confirm` or `/reject`, and only while the registry is unchanged.

#### Scenario: Owner confirms

- **WHEN** the role owning the chosen goal (`ceo`→leadership, `product`→product, `security`→security) confirms a mapping at the current `registry_version`
- **THEN** the mapping becomes `CONFIRMED` with `confirmed_by` and `confirmed_at`, the audit records `confirm_mapping`, and the decision survives remaps while the registry and Jev's choice are unchanged

#### Scenario: Refused decisions

- **WHEN** no mapping exists, it has no goal or `none`, the goal is gone, the caller is not the owner, or the registry changed
- **THEN** the server responds 404, 409, 409, 403 `Only the owner of this goal can decide this mapping`, or 409 respectively

### Requirement: Local-only guards

The server SHALL, in Mode L, answer only requests whose `Host` is a loopback name and refuse cross-origin browser
writes, including writes from another localhost port.

#### Scenario: DNS-rebound host

- **WHEN** a Mode L request arrives with `Host: evil.example`
- **THEN** the server responds 421 `Misdirected request: this server answers to localhost only`

#### Scenario: Another local port

- **WHEN** a cookie-authenticated write arrives with `Origin: http://localhost:5555` while `Host` is `localhost:3100`
- **THEN** the server responds 403 `This request came from another site`

### Requirement: Hosted mode gate

The server SHALL, when `HOSTED=1`, refuse to start with any problem from its environment check, and at the request
edge answer 503 when misconfigured, 410 after `ALIGN_DELETE_BY` has ended (08:00 UTC the next day), 421 for a host not
in `ALIGN_HOSTS`, 403 without `X-Forwarded-Proto: https` or `Fly-Client-IP`, 307 to `/new` for `/` and `/setup`, and 404
for every path outside its tester allowlist (capture and agent tokens included).

#### Scenario: Capture when hosted

- **WHEN** a hosted server receives `POST /api/sessions/events`
- **THEN** it responds 404

#### Scenario: Unsafe environment

- **WHEN** a hosted server starts with, for example, `AI_GATEWAY_API_KEY`, any `ANTHROPIC_*` variable, `ALIGN_CAPTURE` other than `0`, a default role passcode, `ALIGN_SECRET` shorter than 32 characters, or an invite code shorter than 12 characters
- **THEN** it refuses to start and names each problem

### Requirement: Workspace data isolation

The server SHALL bind every state read and write to the workspace named in the caller's own session, never to a
client-supplied id, and keep Northstar and each custom workspace in separate stores.

#### Scenario: Tab for another workspace

- **WHEN** a request carries `x-align-workspace` naming a workspace other than the session's
- **THEN** the server responds 409 with `code:"workspace_mismatch"` and changes nothing

#### Scenario: Custom session on a Northstar-only route

- **WHEN** a custom-workspace session calls a Northstar-only route such as `GET /api/sessions` or `POST /api/mappings/{id}/confirm`
- **THEN** the server responds 403 `This isn’t available in a custom workspace`

### Requirement: Workspace storage bounds

The server SHALL cap custom-workspace write bodies at 64 KB with strings of at most 300 characters (4,000 for `text`
and `plan_text`), reject `__proto__`, `constructor` and `prototype` keys, refuse a state larger than 1 MB, and keep at
most 1,000 audit rows in state with older rows in at most two archive files of 1 MB.

#### Scenario: Full workspace

- **WHEN** a write would make the workspace state (excluding audit) exceed 1 MB
- **THEN** the server responds 413 `This workspace is full` and nothing changes on disk

#### Scenario: Deleted workspace

- **WHEN** any request targets a workspace whose directory has been renamed aside or removed
- **THEN** the server responds 404 `This workspace no longer exists` and never recreates the directory

### Requirement: Goal sessions credentials

The server SHALL, when `ALIGN_GOAL_SESSIONS=1`, mount Better Auth at `/api/v2/auth/*` with the cookie
`align_v2.session_token` (`__Secure-` prefixed when hosted), accept only that cookie on web routes and only
`Bearer alnd_…` device tokens on device routes; with the flag unset every `/app*` and `/api/v2/*` path is 404.

#### Scenario: Wrong credential kind

- **WHEN** a web route (including `/api/v2/auth/*`) receives an `Authorization` header, or a device route receives an `Origin` or `Cookie` header
- **THEN** the server responds 403 `bearer_not_allowed`, `browser_not_allowed` or `cookies_not_allowed` respectively

#### Scenario: Auth rate limits

- **WHEN** a client exceeds 10 requests per minute to `/sign-in/email` or `/sign-up/email`, 20 to `/sign-in/social`, or 100 per minute elsewhere under `/api/v2/auth`
- **THEN** Better Auth refuses the request; email and password sign-up exists only with `ALIGN_GOAL_SESSIONS_TEST_IDP=1` and never when hosted, and accounts are never linked by email

### Requirement: Goal sessions workspaces and membership

The server SHALL let a signed-in user create a goal-sessions workspace on `POST /api/v2/workspaces {name}` (at most
100 characters) as its owner, invite members by single-use link, and hide every workspace from non-members with 404.

#### Scenario: Create and limits

- **WHEN** a user creates a workspace
- **THEN** the response is 201 `{id:"ws_…", name, role:"owner"}`; an 11th create within an hour is 429 `rate_limited`, and owning 50 already is 409 `too_many_workspaces`

#### Scenario: Accepting an invite

- **WHEN** a signed-in user POSTs `/api/v2/invites/{token}/accept` for an unexpired (7-day) invite
- **THEN** they join with the invited role if their email equals the invited one (else 403 `email_mismatch`; hosted also requires a provider-verified email, else 403 `email_unverified`; already a member is 409 `already_member`)

### Requirement: Device pairing and shared sessions

The server SHALL pair a device by a key-bound device-code flow and accept shared sessions and usage only from the
device that shared them, within the workspaces granted to it.

#### Scenario: Pairing limits

- **WHEN** a client calls `POST /api/v2/device/authorize` more than 10 times in an hour, or polls `POST /api/v2/device/token` faster than the interval
- **THEN** the server responds 429 `rate_limited`, or 400 `slow_down` with 5 s added to the interval; an approved code returns tokens (`alnd_` 1 h, `alnr_` 30 days) exactly once and then 400 `expired_token`

#### Scenario: Another device's session

- **WHEN** a device sends `PUT /api/v2/workspaces/{ws}/sessions/{key}` for a key shared by another user or device, or for a workspace it was not granted
- **THEN** the server responds 404; usage batches over 500 rows get 413 `too_many_rows`, and bodies over 256 KB get 413 `too_large`

## Open questions

- The interview's per-code bucket hashes the code as given; with open create (Mode L) every client shares the bucket for the empty code, and with Mode L's shared `ALIGN_SIGNUP_CODE` all holders share one 60-per-day ceiling. Is that intended?
- Custom workspaces have no route to list their captured sessions or consents, or to delete one session. `GET /api/sessions`, `GET /api/sessions/consent` and `DELETE /api/sessions/{id}` are Northstar-only, so only `DELETE /api/workspaces/agent-token` and Restart remove captured data. Is per-session deletion meant to exist for workspaces?
- Capture consent is keyed by the repo folder basename, so any folder with that name shares one consent (documented in CAPTURE_CONSENT.md). Also, `POST /api/sessions/consent` trims `repo` but `POST /api/workspaces/agent-token` does not. Should both be normalized the same way?
- `GET /api/sessions` accepts any loopback origin on any port (regex check), while `POST /api/sessions/events` requires this server's exact host and port. The server never reads `ALIGN_CAPTURE` in Mode L; only the hook script does. Are these differences intended?
- The hosted close time is a fixed `ALIGN_DELETE_BY` + 32 h UTC: midnight Pacific in standard time but 1 AM during daylight time. The v2 client key does not collapse IPv6 to /64, unlike `clientOf` in `lib/ratelimit.ts`. Should either be aligned?

## Sources

- README.md
- docs/CAPTURE_CONSENT.md
- docs/HOSTING.md
- docs/v2/WIRE.md
- proxy.ts
- lib/workspace.ts
- lib/workspace-setup.ts
- lib/interview.ts
- lib/create-access.ts
- lib/codes.ts
- lib/config.ts
- lib/registry.ts
- lib/startup.ts
- lib/mapper.ts
- lib/mapping-decision.ts
- lib/local-guard.ts
- lib/ratelimit.ts
- lib/auth.ts
- lib/agent-token.ts
- lib/http.ts
- lib/store.ts
- lib/scenario.ts (setup schema limits only)
- lib/oauth/grants.ts (liveGrants only)
- lib/oauth/server.ts (MCP_PATH only)
- lib/v2/config.ts
- lib/v2/auth.ts
- lib/v2/http.ts
- lib/v2/limits.ts
- lib/v2/errors.ts
- lib/v2/ids.ts
- lib/v2/init.ts
- lib/v2/db.ts
- lib/v2/policy.ts
- lib/v2/validate.ts
- lib/v2/workspaces.ts
- lib/v2/sessions.ts
- lib/v2/devices.ts
- lib/v2/activity.ts
- app/api/workspaces/route.ts
- app/api/workspaces/[id]/login-info/route.ts
- app/api/workspaces/agent-token/route.ts
- app/api/workspaces/config/route.ts
- app/api/workspaces/connections/route.ts
- app/api/workspaces/interview/route.ts
- app/api/session/route.ts
- app/api/sessions/route.ts
- app/api/sessions/[id]/route.ts
- app/api/sessions/consent/route.ts
- app/api/sessions/events/route.ts
- app/api/mappings/route.ts
- app/api/mappings/[session_id]/confirm/route.ts
- app/api/mappings/[session_id]/reject/route.ts
- app/api/reset/route.ts
- app/api/v2/auth/[...all]/route.ts
- app/api/v2/workspaces/route.ts
- app/api/v2/workspaces/[ws]/sessions/[key]/route.ts
- app/api/v2/workspaces/[ws]/sessions/[key]/usage/route.ts
- app/api/v2/invites/[token]/accept/route.ts
- app/api/v2/device/authorize/route.ts
- app/api/v2/device/token/route.ts
- app/new/page.tsx
- app/new/NewWorkspace.tsx
- app/setup/page.tsx
- app/w/[slug]/page.tsx
