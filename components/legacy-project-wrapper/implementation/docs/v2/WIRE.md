# Goal sessions wire contract (local agent ⇄ hosted server)

Status: v2.2, 2026-10-22 (goal tree fields; in-flight activity). v2.1: directive SSE stream removed; cursor polling only. Source of truth for both halves. Plan: `~/.claude/plans/no-we-need-a-logical-lark.md` (rev 2).
Always on (no flag): every `/app*` and `/api/v2/*` path is served in Mode L and when hosted.

## Conventions
- JSON only (`content-type: application/json`), UTF-8. Errors: `{ "error": "<code>", "message": "<human text>" }`.
- Ids: `u_` user, `ws_` workspace, `pod_` team (teams were called pods; ids and storage keep the name), `g_` goal, `al_` alignment, `dv_` device, `dir_` directive, `ep_` epoch
  (client-generated, 22+ url-safe chars). Random parts are base32/base64url, never sequential.
- Times: ISO 8601 UTC strings. Money: integer micro-USD (`*_usd_micros`). Tokens: non-negative integers.
- Device API auth: `Authorization: Bearer alnd_<opaque>` (access token, 1 h). Device routes reject cookies and any
  request carrying an `Origin` header (browsers). Web routes use the Better Auth session cookie and reject Bearer.
- Not visible to the caller → 404 (never 403). Visible but not allowed → 403 with a code.

## Device pairing (RFC 8628 style, key-bound)
The agent generates an Ed25519 keypair locally (`~/.align/device_key`, 0600; public key sent as base64url raw 32 bytes).

`POST /api/v2/device/authorize` (no auth; 10/h per IP)
→ req `{ "device_name": "Sean's MacBook", "public_key": "<b64url 32B>" }`
→ 200 `{ "device_code": "<43+ chars>", "user_code": "BCDF-GHJK", "verification_uri": "<origin>/app/device", "expires_in": 600, "interval": 5 }`

The user signs in at `/app/device`, types the code, sees device name + request age, ticks workspaces, approves.

`POST /api/v2/device/token`
→ req `{ "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": "..." }`
→ 400 `{ "error": "authorization_pending" | "slow_down" | "expired_token" | "access_denied" }`
→ 200 (once) `{ "device_id": "dv_...", "access_token": "alnd_...", "expires_in": 3600, "refresh_token": "alnr_...", "user": { "id", "name", "email" } }`

`POST /api/v2/device/refresh` (proof of possession; rotating; reuse of an old refresh token revokes the device)
→ req `{ "device_id", "refresh_token", "ts": "<ISO>", "sig": "<b64url Ed25519 signature>" }`
   signed message (UTF-8): `align-refresh\n<device_id>\n<sha256hex(refresh_token)>\n<ts>`; ts within ±5 min.
→ 200 `{ "access_token", "expires_in": 3600, "refresh_token" }` · 401 `{ "error": "invalid_grant" }`

`DELETE /api/v2/devices/self` (Bearer) → 204. Revokes this device's tokens (logout).

## Identity and workspaces (device view)
`GET /api/v2/me` (Bearer or cookie)
→ `{ "user": { "id", "name", "email" }, "device": { "id", "name" } | null, "workspaces": [ { "id", "name", "role": "owner"|"member"|"viewer", "teams": [ { "id", "name", "role": "lead"|"member" } ] } ] }`
Only workspaces the device was granted (device) or the user belongs to (cookie).

## Goals feed
`GET /api/v2/workspaces/:ws/goals` (Bearer; `If-None-Match` supported → 304)
→ `{ "version": "<short hash>", "goals": [ Goal ] }` with header `ETag: "<version>"`.
`Goal = { "id", "version": <int>, "title", "measures": [ { "id", "text", "target": string|null } ], "status": "active"|"achieved"|"dropped", "level": "company"|"team", "visibility": "private"|"team"|"workspace", "owner": { "id", "name" }, "team": { "id", "name" } | null, "anchors": { "repos": [string], "branch_patterns": [string], "issues": [string] }, "bindable": boolean }`
The full set the caller may see (own private + team + workspace). `bindable` = the caller may bind a session to it now
(own goal, a goal of a team they belong to, or a goal they hold an approved allocation transfer to). Anchors are
matched locally by the agent only.

Goal tree (v2.2, additive): `Goal` also carries `"depends_on": [goal id]` (goals whose output it consumes, filtered to
those the caller can read; a versioned field set with the goal, at most 5) and `"contributes_to": [ { "id", "title",
"version", "reviewed_version": int|null, "stale": boolean } ]` (targets of its approved alignments, i.e. its parents).
A child is `stale` when a parent has a version newer than the one its owner last reviewed it against. Saving a new
version of the child reviews it against all parents; `POST /api/v2/workspaces/:ws/goals/:goal/review { "parent_id" }`
(cookie, the child's owner) confirms one. Because parents' versions are part of each child's entry, a parent edit
changes the feed version, so agents refetch and give every session under a child goal the parent's new version.

## Shared sessions
`session_key = base64url(HMAC-SHA256(device_secret, ws + "\0" + harness + "\0" + native_session_id))` (43 chars).
`repo_key = base64url(HMAC-SHA256(device_secret, ws + "\0repo\0" + realpath(git toplevel or cwd)))`.

`PUT /api/v2/workspaces/:ws/sessions/:session_key` (Bearer) — share or update
→ req `{ "harness": "claude-code"|"codex", "repo_key", "repo_alias": string|null, "started_at", "title": string|null }`
→ 200 `{ "session_key", "state": "shared"|"suspended", "current_epoch": Epoch|null }`
Key owned by another user/device → 404.

`POST /api/v2/workspaces/:ws/sessions/:session_key/epochs` (Bearer) — open a binding epoch
→ req `{ "epoch_id": "ep_...", "goal_id": "g_..."|null, "starts_at": "<ISO>", "root_turn": string|null, "cause": "manual"|"directive:<dir_id>" }`
→ 200 `Epoch = { "epoch_id", "goal_id", "goal_version_at_start", "starts_at", "ends_at": null }`
   (closes the previous open epoch at `starts_at`). 403 `{ "error": "alignment_required" }` if the goal isn't bindable.
   Epochs never overlap; a first share may open an epoch with `starts_at` = the session's start (counts from start).

`POST /api/v2/workspaces/:ws/sessions/:session_key/usage` (Bearer) — idempotent batch, ≤500 rows, ≤256 KB
→ req `{ "rows": [ UsageRow ] }`
`UsageRow = { "request_key" (b64url HMAC of provider request id), "ts", "epoch_id", "model", "query_source": "main"|"subagent"|"auxiliary"|"unknown", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h", "cache_write_unsplit", "basis": "api_usd"|"subscription_included"|"workspace_credits"|"estimated_list_usd"|"unknown", "est_list_usd_micros": int|null, "price_table_version", "source": "otel"|"transcript"|"rollout" }`
→ 200 `{ "accepted": n, "duplicates": n, "conflicts": n }`. Same key with different values = conflict, never overwritten.
Rows whose epoch is unknown or belongs to another session → rejected per row (counted as conflicts).

`POST /api/v2/workspaces/:ws/sessions/:session_key/stop-sharing` (Bearer or cookie by owner) → 200; no more uploads accepted.
`DELETE /api/v2/workspaces/:ws/sessions/:session_key` (Bearer or cookie by owner) → 204; hard-deletes session, epochs,
usage, deliveries; rollups change (the UI says so).

## Directives
Only structured content reaches agents: ratified goal fields and enumerated states. Never alignment notes or counters.
`Directive = { "id": "dir_...", "seq": <int>, "ws", "kind": "goal_version"|"binding_changed"|"binding_suspended"|"stop"|"resume", "session_keys": [string], "goal": Goal|null, "binding": { "goal_id", "effective": "next_root_turn", "cause": "alignment:<al_id>"|"manual" } | null, "created_at" }`
- `goal_version`: a goal bound/governing for these sessions got a new version or status.
- `binding_changed`: open a new epoch at the next root turn with `binding.goal_id` (approved allocation transfer).
- `binding_suspended`: the current binding lost its authority (revoked alignment): stop uploading usage for the session
  until the user picks a goal; the agent continues privately.
- `stop` / `resume`: set / clear the local stop latch.

`GET /api/v2/directives?cursor=<seq>` (Bearer) → `{ "directives": [Directive], "next_cursor": "<seq>" }` (≤100, this device's sessions only).
There is no push channel: the local agent has no daemon, and each hook-started sync pass fetches by cursor.
`POST /api/v2/directives/:id/receipts` (Bearer) → req `{ "session_key", "state": "received"|"applied"|"enforced", "at" }` → 200 `{ "fresh": bool }` (idempotent, ≤2 KB).

## Activity (v2.2)
In-flight work signals for agents toward related goals. Deterministic metadata from the user's own hooks, never model
output, prompts, tool output or file contents.
`POST /api/v2/workspaces/:ws/activity` (Bearer) `{ "items": [ { "session_key", "kind": "edit"|"commit"|"task"|"claim",
"at", "repo_id": hex, "path_hash": hex|null, "path": repo-relative string|null, "text": string|null } ] }` → `{ "accepted" }`.
At most 200 items and 128 KB. Items for sessions this device didn't share, sessions not in `shared`, or older than 24 h
are skipped. `path` and `text` are sent only when the user turned on work signals (`align share ... --signals`);
otherwise only `path_hash` goes up. `repo_id` = sha256(ws + "\0repo\0" + normalized git remote) so clones on different
machines match; `path_hash` = sha256(repo_id + "\0" + repo-relative path). Absolute and `..` paths are refused.
Kept 24 hours; a `claim` 1 hour. The session's open epoch's goal is recorded with each item.
`GET /api/v2/workspaces/:ws/activity?after=<seq>` (Bearer) → `{ "cursor", "items": [ { "seq", "session_key", "harness",
"user": { "id", "name" }, "mine", "goal_id", "repo_id", "kind", "path_hash", "path", "text", "at", "expires_at" } ] }`,
oldest first, at most 500, only items on goals the caller can read (an unbound session's items only to its own user).
The agent uploads and fetches inside the normal hook-started sync pass; hooks read the cached copy.

## Spend
`GET /api/v2/workspaces/:ws/spend?by=goal|team|session&from&to` (`by=pod` is accepted as `by=team`) (cookie) → rows with token sums by basis and
`est_list_usd_micros` sums (labelled estimates), plus `unallocated` and `unpriced_requests`. Invariant: total =
Σ goals + unallocated. Private-goal spend visible to its owner only; others see it inside an unnamed "private" bucket.
Sessions older than 13 months are rolled up (docs/RETENTION.md): their usage still counts by goal and team, by its UTC
day (a day counts when its start is in `[from, to)`), and `by=session` shows it as one `rolled_up` row,
"Older sessions (rolled up)".

## Alignment (web, cookie)
`POST /api/v2/workspaces/:ws/alignments` → req `{ "target_goal_id", "source_goal_id": string|null, "choice": "contribution"|"work_toward", "session_keys": [string], "note": string|null }`
Effects: `contribution` → `contributes_to` only. `work_toward` → `contributes_to` + `governing_goal` + `allocation_transfer` for the listed sessions.
Approval requirements computed from effects and snapshotted on the revision (see "Alignment (web)" below). States: `pending` → `approved` | `rejected` |
`withdrawn`; `countered` (new revision by an approver, e.g. fewer sessions) → requester `accept_counter` → `pending`.
Actions: `POST .../alignments/:id/{approve|counter|accept_counter|reject|withdraw|revoke}` (approve carries `revision`).
On approval with `allocation_transfer`: a `binding_changed` directive per session. Revoke is prospective; sessions whose
binding exists only because of it get `binding_suspended`.

## Connected AI apps and MCP
`GET /api/v2/workspaces/:ws/apps` (cookie, members) → `{ "url": "<origin>/api/mcp", "apps": [{ "id": "gr_…", "name",
"redirect_host", "user": { "id", "name" }, "approved_at", "last_used_at", "scopes": ["goals:read", "changes:evidence"?] }] }`: every live grant for a workspace owner,
the caller's own for anyone else. `DELETE /api/v2/workspaces/:ws/apps/:grant` (cookie write) → 204 for the grant's
person or a workspace owner, else `404 not_found`; audit `oauth.app_revoked`. Removing a member, leaving and deleting
the workspace revoke the person's (or every) grant there. `/api/mcp` accepts a device access token
(`alnd_`) as well as Align's OAuth tokens; a device names the workspace in each tool call (`workspace`) unless it can
read exactly one (docs/MCP.md, specs/align/mcp.md). A device token is `goals:read` only there; an app holds
`changes:evidence` too only when the person allowed it.

## Changes (server)
Implemented in `lib/v2/**` and `app/api/v2/**` (tests: `scripts/test-v2.mjs`). Everything above holds; these are the
smallest additions and clarifications the server needed. Nothing here changes a field the agent already reads.

Errors and credentials
- Device routes: an `Origin` header is `403 browser_not_allowed`, a `Cookie` header `403 cookies_not_allowed`, a
  missing/unknown/expired/revoked token `401 invalid_token`. Web routes: any `Authorization` header is
  `403 bearer_not_allowed`; no session is `401 unauthorized`; a foreign `Origin` on a cookie write is `403 cross_site`.
- `POST /device/token`: an unknown `device_code` is `400 invalid_grant`; a code that already returned 200 is
  `400 expired_token` (single use). `slow_down` adds 5 s to the interval. `authorize` counts only well-formed requests
  toward its 10/h limit.
- `GET /workspaces/:ws/goals` also accepts the cookie (the web app reads the same feed).

Sessions and epochs
- `PUT` on a session after stop-sharing is `409 sharing_stopped` (stopping is sticky; re-sharing needs delete first).
  So are epochs and usage. The same key with a different `harness` or `repo_key` is `409 session_conflict`.
- Epochs: same `epoch_id` with the same values returns it (idempotent); with other values `409 epoch_conflict`.
  `starts_at` before the open epoch's start or the last epoch's end is `409 epoch_overlap`; before the session's
  `started_at` or more than 5 min in the future is `400`. A goal the caller can't see is `404`; a goal that isn't
  `active` is `409 goal_not_active`. `cause: "directive:<id>"` must name a directive sent to this session (`400`).
- `bindable` also requires `status: "active"`.
- Binding a session to a goal other than its governing goal (manual) ends that governing goal.

Directives
- `binding_changed`: one directive per session; `goal` is the target Goal. `binding_suspended`: one directive listing
  the affected sessions, `goal: null`, `binding = { goal_id: <goal that lost authority>, effective: "next_root_turn",
  cause: "alignment:<al_id>" }`. On revoke the server ends that session's open epoch at the revocation time and sets
  the session `suspended` (PUT then returns `state: "suspended", current_epoch: null`); usage rows for the ended epoch
  are still accepted (in flight); opening an epoch on any bindable goal makes it `shared` again.
- A directive's `goal` is the version ratified when it was written, plus `bindable` computed for the receiving user;
  `goal` is `null` if that user can no longer see the goal.
- Stop/resume are issued with `POST /api/v2/workspaces/:ws/sessions/:session_key/stop` and `.../resume` (cookie; the
  session's owner or a workspace owner) → `{ directive_id, agent_stopped }`.

Alignment (web)
- Who may act: `approve` a required approver of the current revision, state `pending`, `revision` must equal the
  current one (`409 stale_revision`); `counter` an approver who isn't the requester, state `pending`; `accept_counter`
  the requester, state `countered`; `reject` an approver who isn't the requester (`pending` or `countered`);
  `withdraw` the requester (`pending` or `countered`); `revoke` the requester or a current approver (`approved`).
  Wrong state is `409 wrong_state`; wrong person `403`. Viewers can't act.
- `counter` body: `{ revision?, choice?, keep?: [ref], session_keys?: [string], note? }`. A counter can only keep or
  remove sessions; `ref` is `sessions[].ref` from the alignment view (approvers don't see other people's keys).
- Requirements: each revision stores `approvers_json` as `[ { "for": <goal id>|"sessions:<user id>", "set": [user id],
  "approved_by": user id|null } ]`: the target goal's approval set, the source goal's (if any), and for `work_toward`
  each session owner (singleton) and each session's currently bound goal's set. A goal's approval set
  (`lib/v2/approval.ts`) is its owner, its team's leads and, for a company goal, every workspace owner, current owners
  and members only; the requester counts only if they own the goal, and if nobody else is left the workspace owners
  (other than the requester) are the set. Older rows hold a plain user-id array: each id is a singleton requirement
  with `for: null`. One approval satisfies every requirement whose set holds the approver; the request is approved
  when every requirement is satisfied. The view adds `requirements: [ { for, approvers: [{id, name}], approved_by:
  {id, name}|null } ]` (`for` null for a goal the caller can't read) and keeps `approvers` (everyone in any set).
- The author of a revision is counted as approving it for every requirement whose set holds them (the requester on
  revision 1, the counterer on later ones); `accept_counter` records the requester's approval. A request the requester
  alone satisfies (they own every goal involved) is approved immediately; never otherwise.
- `409 cycle`: an alignment whose approval would make the contribution tree loop (the source is already reachable from
  the target through approved parents), at creation and at the approval that would complete it; a goal version whose
  `depends_on` would make a dependency loop.
- One governing goal per session: requesting or approving `work_toward` for a session already governed by another
  approved alignment is `409 already_governed` (revoke that one first).
- `source_goal_id` must be a goal the requester may bind (own or team), `403 source_not_yours` otherwise.
- A goal the viewer can't see is shown as `{ id: null, title: null, visible: false }` and named "a goal you can't see".

Spend
- Response: `{ by, from, to, note, total: Sums, unallocated: Sums, unpriced_requests, rows: [ { key, kind, label,
  goal?, team?, session_key?, ...Sums } ] }` with `Sums = { requests, input, output, cache_read, cache_write_5m,
  cache_write_1h, cache_write_unsplit, est_list_usd_micros, unpriced_requests, by_basis: { <basis>: same numbers } }`.
- `kind`: `goal` | `team` | `no_team` | `session` | `others` | `private`. Every goal the caller can't see (others'
  private goals, team goals of teams they're not in) is in the one unnamed `private` row, in `by=goal` and `by=team`.
  `by=session` names only the caller's own sessions; everyone else's are one `others` row. `total = Σ rows +
  unallocated` holds for every number in all three groupings. `from` inclusive, `to` exclusive, on request `ts`.

Visibility
- `team` goals (stored as `pod`): the team's members and workspace owners. Company goals: everyone (always `workspace`). `private`: the owner only (workspace owners included in "not").
- Invite acceptance needs the signed-in email to equal the invited one; when hosted, the provider must have verified it.

Web-only routes (cookie) added for the app: `GET/POST /api/v2/workspaces` (`GET` → `{ workspaces, deleted: [{ id, name,
deleted_at, restore_until }] }`, the deleted ones being those the caller owns that can still be restored),
`GET /api/v2/workspaces/:ws`, `PATCH`/`DELETE /api/v2/workspaces/:ws` (owners: rename; delete, which is a soft delete:
404 to everyone at once, restorable for 30 days, then purged), `POST /api/v2/workspaces/:ws/restore` (owners of the
deleted workspace, a sign-in from the last 15 minutes, `403 reauth_required`, `409 not_deleted`; → `{ id, name, role }`),
`DELETE /api/v2/me { email }` (delete my account: a sign-in from the last 15 minutes, the account's email typed to
confirm, `409 last_owner` while the only owner of a workspace with other members; → 204), `POST .../members/:user { role }` (owners),
`DELETE .../members/:user[?delete_sessions=1]` (owners remove; anyone leaves with their own id; `409 last_owner`;
`delete_sessions=1` also deletes the person's shared sessions there now), `GET .../audit` (owners,
newest 200 `{ at, actor: {id, name}|null, action, object_id }`), `GET/POST .../invites` (`{ email, role, team_id?,
team_role? }`), `DELETE .../invites/:id`, `GET /api/v2/invites/:token`, `POST .../accept`, `POST .../teams`,
`POST .../teams/:team/members`, `DELETE .../teams/:team/members/:user` (the `/pods` paths are aliases), `POST .../goals`
(`{ title, level?, visibility?, team_id?, measures?, anchors?, depends_on? }`), `GET .../goals/:goal`,
`POST .../goals/:goal/versions` (`{ version, title?, measures?, anchors?, status? }`, `409 stale_version` /
`no_change`), `GET .../sessions`, `GET .../alignments`, `GET .../alignments/:id`, `POST /api/v2/workspaces/sample`
(a new "Northstar (sample)" workspace owned by the caller, counted like any workspace creation), change requests
(`GET`/`POST .../goals/:goal/change-requests` with `{ base_version, changes, reason }`, `GET .../change-requests/:id`,
`POST .../change-requests/:id/{approve|reject|counter|accept_counter|withdraw|rebase}`, and the workspace-wide
`GET .../change-requests?state=` as `{ waiting_on_me, mine, others }`; see `lib/v2/changes.ts`), change request
evidence (`POST .../change-requests/:id/evidence` `{ kind: "pr"|"ci_run"|"incident"|"dashboard"|"doc"|"other", url
(https, ≤ 2048), label (≤ 120), revision? }` → 201 `{ evidence, change_request }`, cookie or device token, at most 10
per revision; `DELETE .../change-requests/:id/evidence/:evidence` by its author while the revision is current and the
request open, else `409 evidence_frozen`; each revision reads `evidence[]` with `source: "person"|"agent"` and
`reported_as`, and the server-recorded `snapshot`; an approval sets `approved_without_evidence`; see
`lib/v2/evidence.ts`), `GET /api/v2/device/requests/:code`,
`POST /api/v2/device/approve` (`{ user_code, workspace_ids }`; needs a sign-in from the last 15 minutes, else
`403 reauth_required`), `POST /api/v2/device/deny`, `GET /api/v2/devices`,
`DELETE /api/v2/devices/:id`. Better Auth is mounted at `/api/v2/auth/*` (cookie `align_v2.session_token`,
`__Secure-` prefixed when hosted).

Hosted creation gate (`specs/align/workspaces.md`; Mode L skips it): `POST /api/v2/workspaces` and `.../sample` take
`creation_code` (`alc_…`) when `ALIGN_CREATION=codes`, and the Turnstile token in `x-captcha-response` when Turnstile is
on. Refusals are 403 `creation_code_required`, `creation_code_invalid`, `creation_closed`, `workspace_cap`,
`owned_workspace_cap`, `disposable_email`; 400 `captcha_required`, 403 `captcha_failed`, 503 `captcha_unavailable`.
The workspace caps count live workspaces; `POST .../restore` past either is 409 `workspace_cap` or
`owned_workspace_cap`. Creating needs no recent sign-in.
Invites and acceptance can be 403 `member_cap`; a device's new session `PUT` can be 403 `session_cap`.
`POST /api/v2/access-requests` (no sign-in, same-site) `{ email, name, company?, team_size?: "1"|"2-10"|"11-50"|
"51-200"|"201+", use_case, interest: "try"|"evaluate" }` → 201 `{ received: true }`; 429 past 5 per client per hour or
3 per address per day.

Sign-in (Better Auth): Google and GitHub when configured; an email one-time code always in Mode L and, hosted, with
`ALIGN_EMAIL_API_URL`/`ALIGN_EMAIL_API_KEY`/`ALIGN_EMAIL_FROM`: `POST /api/v2/auth/email-otp/send-verification-otp`
`{ email, type: "sign-in" }` (always `{ success: true }`; 429 past 3 per email per 10 min or 10 per client per hour,
and hosted past 5 per email per hour or 3 per client per minute; with Turnstile on, both code routes need
`x-captcha-response`: 400 `MISSING_RESPONSE`, 403 `VERIFICATION_FAILED`),
then `POST /api/v2/auth/sign-in/email-otp` `{ email, otp }` (6 digits, 5 min, 3 attempts; Better Auth errors
`INVALID_OTP`, `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`; ours `cannot_sign_in`, `email_unverified`). Mode L prints the link and
writes `<data>/v2/sign-in.txt`; `npm run sign-in-link [email]` asks for a fresh one. Linking Google or GitHub is
explicit (`POST /api/v2/auth/link-social` from `/app/account`). `ALIGN_TEST_IDP=1` (never hosted) adds email + password.
Passkeys (`@better-auth/passkey`; relying party the public host, or `localhost` in Mode L): add with
`GET /api/v2/auth/passkey/generate-register-options` then `POST .../passkey/verify-registration`; sign in with
`GET .../passkey/generate-authenticate-options` then `POST .../passkey/verify-authentication`. Align's own:
`GET /api/v2/account/passkeys` (`{ passkeys: [{ id, name, created_at, last_used_at }], prompt }`),
`PATCH /api/v2/account/passkeys/:id` (`{ name }`), `DELETE /api/v2/account/passkeys/:id`,
`DELETE /api/v2/account/passkey-prompt` (dismiss the add-a-passkey prompt), and
`POST /api/v2/account/sign-out-everywhere` (`{ devices?, apps? }` → `{ sessions, devices, apps }`).

Sessions last 7 days from last use and never more than `ALIGN_SESSION_MAX_DAYS` (30) after sign-in. A sign-in from
the last 15 minutes is needed (else `403 reauth_required`) to approve a device or an MCP app, for an owner to change a
role, remove another member, invite an owner, delete a workspace or restore a deleted one, to delete one's account, to
add or delete a passkey, to link a provider and to sign out everywhere. Account deletion also deletes the person's
passkeys and their dismissal of the passkey prompt.
