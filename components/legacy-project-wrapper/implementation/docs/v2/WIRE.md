# Goal sessions wire contract (local agent ⇄ hosted server)

Status: v2.3, 2026-10-31 (allocation: target shares, steering, reallocations; main #29 on v2). v2.2, 2026-10-22 (goal tree fields; in-flight activity). v2.1: directive SSE stream removed; cursor polling only. Source of truth for both halves. Plan: `~/.claude/plans/no-we-need-a-logical-lark.md` (rev 2).
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
→ 429 `{ "error": "rate_limited", "message": "... Try again in <n> minutes ...", "retry_after": <s> }` with `Retry-After: <s>`
  (in Mode L every pairing on the computer counts as one client, and a restart clears the in-memory count)
  The name is kept on one line: control characters and whitespace runs become one space, invisible direction marks
  are dropped and the ends trimmed; a name with nothing left is 400.

The user signs in at `/app/device`, types the code, sees device name + request age, ticks workspaces, approves.

`POST /api/v2/device/token`
→ req `{ "grant_type": "urn:ietf:params:oauth:grant-type:device_code", "device_code": "..." }`
→ 400 `{ "error": "authorization_pending" | "slow_down" | "expired_token" | "access_denied" }`
→ 200 (once) `{ "device_id": "dv_...", "access_token": "alnd_...", "expires_in": 3600, "refresh_token": "alnr_...", "user": { "id", "name", "email" } }`

`POST /api/v2/device/refresh` (proof of possession; rotating; reuse of an old refresh token revokes the device, except
one retry of the latest rotation within 30 s, signed with a later `ts` than the rotating request, while neither token
of its new pair has been used, which replaces that pair)
→ req `{ "device_id", "refresh_token", "ts": "<ISO>", "sig": "<b64url Ed25519 signature>" }`
   signed message (UTF-8): `align-refresh\n<device_id>\n<sha256hex(refresh_token)>\n<ts>`; ts within ±5 min.
→ 200 `{ "access_token", "expires_in": 3600, "refresh_token" }` · 401 `{ "error": "invalid_grant", "reason"? }` (`reason`:
  `unknown_device` for a device the server does not know, which only account deletion causes; for a correctly signed
  refresh of a revoked device, why it was revoked: `revoked_on_web`, `signed_out_everywhere`, `logout`, `refresh_reuse`) · 400
  `{ "error": "clock_skew", "message", "server_time": "<ISO>" }` when the signature is valid but `ts` is more than 5 min
  off the server's clock: nothing is rotated and the device stays paired; sign again with the server's time.

`DELETE /api/v2/devices/self[?replaced_by=<dv_id>]` (Bearer) → 204. Revokes this device's tokens (logout). With
`replaced_by` (the device that replaced it on this machine, `align login`), that device of the same person takes this
one's name when it is named `<this name> (<n>)` and no other live device has the plain name. Any revocation also ends the
device's sessions: `stopped` with `ended_reason: "device_signed_out"`. Removing a member from a workspace (or their
leaving it) ends their sessions there the same way, with `ended_reason: "member_removed"`; requests still waiting on
an ended session expire.

Clock: every device response carries the HTTP `Date` header. The agent measures its offset from it, keeps it in
`credentials.json` as `clock_offset_ms` while it is a minute or more, and sends every time (`started_at`, `starts_at`,
usage `ts`, receipt `at`, activity and steering `at`) on the server's clock.

## Identity and workspaces (device view)
`GET /api/v2/me` (Bearer or cookie)
→ `{ "user": { "id", "name", "email" }, "device": { "id", "name" } | null, "workspaces": [ { "id", "name", "role": "owner"|"member"|"viewer", "teams": [ { "id", "name", "role": "lead"|"member" } ] } ] }`
Only workspaces the device was granted (device) or the user belongs to (cookie). A device gains a workspace when its
person accepts an invite with it ticked (`POST /api/v2/invites/:token/accept { device_ids }`); the directives answer's
`workspaces` tells it at its next pass. A device also gets `"other_workspaces": [ { "id", "name" } ]`: its person's
workspaces it was not given (the Devices page gives one; the CLI points there).

`GET /api/v2/devices` (cookie, or Bearer) → `{ "devices": [ { "id", "name", "created_at", "last_seen_at", "revoked_at",
"revoked_reason", "workspaces": [ { "id", "name" } ], "current"?: bool } ] }`: the person's devices; with a device token
`current` marks that device (`align login` names the other paired ones). A new device gets a name none of the person's
live devices has (`<name> (2)`, ... when one has it already); a token poll may send `"replaces": "<device id>"`, the
device the pairing replaces on the same machine, which (when it is the person's own) does not count, so a re-login
keeps its name.

`POST /api/v2/devices/:id/workspaces` (cookie; a sign-in from the last 15 minutes, else `403 reauth_required`)
`{ "workspace_id" }` → `{ "device_id", "workspace_id" }`: gives one of my live devices a workspace I am a member of,
as accepting an invite with it ticked does (audited `device.workspace_added`); the device's next pass picks it up. 404
for a device or workspace that is not mine, 409 `already_granted`.

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

Limits (PORT-002, additive): `Goal` also carries `"limits": [ Limit ]` (the current version's, `[]` when none, at most 5),
`Limit = { "id": "lim_<12 base32>", "type": "must"|"must_not"|"out_of_scope", "text": string (≤160), "source": { "kind":
"meeting"|"manual", "title": string (≤120, "" when typed), "date": "YYYY-MM-DD" } | null }`. Limits are goal content:
versioned and hashed with the goal (in the hash only when non-empty), set by the owner's new version or by an approved
change request (`changes.limits`), and read by whoever reads the goal. A limit's `id` stays while the limit is kept, so
an agent can tell an added or removed limit from an unchanged one. A limit names no person: who confirmed it is the
version's author.

## Shared sessions
`session_key = base64url(HMAC-SHA256(device_secret, ws + "\0" + harness + "\0" + native_session_id))` (43 chars).
`repo_key = base64url(HMAC-SHA256(device_secret, ws + "\0repo\0" + realpath(git toplevel or cwd)))`.

`PUT /api/v2/workspaces/:ws/sessions/:session_key` (Bearer) — share or update
→ req `{ "harness": "claude-code"|"codex", "repo_key", "repo_alias": string|null, "started_at", "title": string|null }`
→ 200 `{ "session_key", "state": "shared"|"suspended", "current_epoch": Epoch|null }`
Key owned by another user/device → 404. `started_at` more than 5 min ahead of the server's clock → 400
`{ "error": "clock_skew", "message", "server_time" }` (as a refresh gets).

`POST /api/v2/workspaces/:ws/sessions/:session_key/epochs` (Bearer) — open a binding epoch
→ req `{ "epoch_id": "ep_...", "goal_id": "g_..."|null, "starts_at": "<ISO>", "root_turn": string|null, "cause": "manual"|"directive:<dir_id>", "origin"?: Origin|null }`
→ 200 `Epoch = { "epoch_id", "goal_id", "goal_version_at_start", "starts_at", "ends_at", "origin" }`
   (closes the previous open epoch at `starts_at`). 403 `{ "error": "alignment_required" }` if the goal isn't bindable.
   Epochs never overlap; a first share may open an epoch with `starts_at` = the session's start (counts from start).

`Origin = "hand" | "folder_rule" | "anchor_hint" | "alignment" | "switch_request" | "past_import" | "suggested_agent" | "suggested_model" | "suggested_rule"`.
The server records `alignment` for the session's `binding_changed` directive for the goal, and `switch_request` for a
`switch_goal` directive to the session and goal with an accepted developer receipt. It records other known origins
with a `manual` cause. If a known origin cannot be confirmed, an otherwise valid epoch returns 200 with `origin: null`
and can receive usage. An unknown origin is 400. Every cause must be `manual` or name a directive sent to this session.
Omitted origin and legacy rows have null origin. The three suggestion origins use a manual cause after the developer confirms. Candidate lists, model inputs, scores and feedback are outside this API.
`GET /api/v2/workspaces/:ws/sessions` (cookie) includes origin in each `mine[].current_epoch`. When there is no current
epoch, `mine[].last_epoch` gives `{origin}` from the most recent closed epoch if one exists, or null otherwise.
For workspace owners, `all[]` includes `origin` of the current or most recent closed epoch and `origin_scope` ("current",
"last", or null when no epoch exists), without the binding's goal or directive.

`POST /api/v2/workspaces/:ws/sessions/:session_key/usage` (Bearer) — idempotent batch, ≤500 rows, ≤256 KB
→ req `{ "rows": [ UsageRow ] }`
`UsageRow = { "request_key" (b64url HMAC of provider request id), "ts", "epoch_id", "model", "query_source": "main"|"subagent"|"auxiliary"|"unknown", "input", "output", "cache_read", "cache_write_5m", "cache_write_1h", "cache_write_unsplit", "basis": "api_usd"|"subscription_included"|"workspace_credits"|"estimated_list_usd"|"unknown", "est_list_usd_micros": int|null, "price_table_version", "source": "otel"|"transcript"|"rollout" }`
→ 200 `{ "accepted": n, "duplicates": n, "conflicts": n, "refused": [request_key] }`. Same key with different values = conflict, never overwritten.
`refused` names the conflicts that were not stored (below), so the device counts them as not shared.
Rows whose epoch is unknown or belongs to another session → rejected per row (counted as conflicts).
So are rows whose `ts` is at or after their epoch's end at a time no epoch of the session covers (made while the
session was not shared, before it was shared again), and rows whose `ts` is before their epoch's `starts_at`.
A stopped session's usage (and epochs) → `409 { "error": "sharing_stopped", "ended_reason": "member_removed"|"device_signed_out"|null }`:
`null` when its person stopped sharing it; `member_removed` when it ended because they left the workspace or were
removed (once they are back, their device shares it again with a `PUT`).

`POST /api/v2/workspaces/:ws/sessions/:session_key/stop-sharing` (Bearer or cookie by owner) → 200; no more uploads accepted.
`DELETE /api/v2/workspaces/:ws/sessions/:session_key` (cookie by owner, or Bearer from any live device of the person who
shared it, not only the device that shared it) → 204; hard-deletes session, epochs, usage, deliveries; rollups change
(the UI says so). Audited `session.history_deleted` with the acting device as the object. Another person → 404.
Deleted already (on the web, say) → `410 history_deleted` to the person who shared it (a marker with a hash of them
and the key is kept 13 months), 404 to anyone else.

## Directives
Only structured content reaches agents: ratified goal fields, enumerated states and Align's typed requests (REQ-001).
Never alignment notes or counters; the only person-written text is a request's quoted `note` and a hold's `reason`.
`Directive = { "id": "dir_...", "seq": <int>, "ws", "kind": "goal_version"|"binding_changed"|"binding_suspended"|"stop"|"resume"|"request"|"hold"|"release", "session_keys": [string], "goal": Goal|null, "binding": { "goal_id", "effective": "next_root_turn"|"cancel_pending", "cause": "alignment:<al_id>"|"goal_closed:<al_id>"|"manual" } | null, "created_at" }`,
plus `request` on kind `request` and `hold` on kinds `hold` and `release` (absent on the other kinds).
- `goal_version`: a goal bound/governing for these sessions got a new version or status. Its `goal` snapshot carries
  that version's `limits` (a snapshot stored before limits existed reads `[]`); limit text reaches agents only this way.
- `binding_changed`: open a new epoch at the next root turn with `binding.goal_id` (approved allocation transfer).
- `binding_suspended`: the current binding lost its authority (revoked alignment, or, with `cause`
  `goal_closed:<al_id>`, the alignment's target goal was achieved or dropped): stop uploading usage for the session
  until the user picks a goal; the agent continues privately. With `effective` `cancel_pending` (a session that received
  the ended alignment's `binding_changed` and has no epoch under it): drop the pending `binding_changed` to `goal_id` and keep the
  current binding, unless the session is already bound to `goal_id`, which suspends as above.
- `stop` / `resume`: set / clear the local stop latch.
- `request` (`goal` and `binding` null): `"request": { "id": "rq_...", "type": "replan"|"checkpoint"|"switch_goal",
  "cancelled": bool, "cancel_reason": "withdrawn"|"goal_closed"|null, "goal": { "id", "title"|null, "version" }, "target_goal": { "id", "title"|null, "version" }|null,
  "sender": { "id", "name", "role": "approver"|"owner" }, "note": string|null, "created_at" }` (null if the request no
  longer exists; `role` is how the sender could send it: in the goal's approval set, or a workspace owner outside it). `goal.version`
  is the goal's version when it was sent; `target_goal` only on `switch_goal`; a title is null for a goal the person
  can no longer read. A cancellation is a second `request` directive with the same `request.id` and `cancelled: true`,
  sent to the sessions that had not answered: `cancel_reason` is `withdrawn` when its sender (or a workspace owner)
  cancelled it and `goal_closed` when its goal, or a switch_goal's target goal, was achieved or dropped (null while not
  cancelled). checkpoint and drafting a replan are safe (when the developer has not declined by the end of the turn
  they reached, the machine accepts them itself, `auto_accepted`: delivered to the agent and not declined, never a
  report that the agent did it); a switch_goal takes effect only on the developer's accept, through the usual epoch path
  (`cause: "directive:<this directive id>"`).
- `hold` (`goal` and `binding` null): `"hold": { "goal": { "id", "title"|null }, "held_by": { "id", "name" }, "reason":
  string|null, "at" }`: block every tool of sessions on that goal until a `release`. Acknowledge with `received`, then
  `enforced`. A session that binds to a held goal later gets its own `hold` directive.
- `release`: `"hold": { "goal": { "id", "title"|null }, "released_by": { "id", "name" }, "at" }`: lift that goal's hold.

`GET /api/v2/directives?cursor=<seq>` (Bearer) → `{ "directives": [Directive], "next_cursor": "<seq>", "workspaces": [ "<ws id>" ], "ended_sessions": [ { "ws", "session_key", "ended_reason": null | "member_removed", "stopped_at" } ] }` (≤100, this device's sessions only; `workspaces`: the ids, sorted, of the workspaces this device reaches now, so it re-reads `/me` when they changed; `ended_sessions`: this device's sessions in those workspaces whose share ended in the last 30 days, newest first, at most 200, so a share stopped on the web ends on the device at its next pass, not at the session's next usage upload).
The directive response also carries additive `budget_stamps: [{ws, team, month, stamp}]` for this UTC month's
budget history in granted workspaces, only for teams whose budgets the person may read. Stamps contain no names,
amounts, people, goals or sessions. The opaque stamp changes on a set, change, removal, grant, grant expiry or first observed crossing,
even when writes have the same time. Stored revisions and indexed expiry lookups avoid reading history on directive fetch. Old agents ignore it; old servers may omit it. The same stamp is returned as
`budget_stamp` on team and session attribution reads. Sync compares it with the cached team read and refreshes a
changed team in the same pass. Unchanged cached passes add zero budget requests; five-minute reuse, 120 reads,
100 sessions and two seconds remain the bounds. A 404 or an unknown additive field never stops a pass.
The device moves its cursor to `next_cursor` after each page, also past directives it had already stored.
There is no push channel: the local agent has no daemon, and each hook-started sync pass fetches by cursor.
`POST /api/v2/directives/:id/receipts` (Bearer) → req `{ "session_key", "state": "received"|"applied"|"enforced"|"accepted"|"declined", "at", "auto_accepted"?: bool }` → 200 `{ "fresh": bool }`, plus `"request_state": "sent"|"received"|"accepted"|"declined"|"expired"` on a `request` directive (idempotent, ≤2 KB).
`accepted`/`declined` only on a `request` directive (else 400); `auto_accepted: true` only with `accepted` and never on a
`switch_goal` (400, nothing recorded). A later `declined` overrides an accept the agent made itself; an answer to a
cancelled (`expired`) request changes nothing. Receipts are unique per (directive, session, state, auto_accepted): the
developer's `accepted` after the agent's own is a receipt of its own (`fresh: true`, audited `request.accepted`).
A `release` reaches every session its hold reached, including one that has since left the goal (ack `received`, `applied`).
Requests and holds are sent from the web (cookie): `GET`/`POST /api/v2/workspaces/:ws/goals/:goal/requests`
(`{ type, note?, session_keys?, target_goal_id? }`), `DELETE .../requests/:id`, `GET`/`PUT`/`DELETE
.../goals/:goal/hold` (`{ reason? }`, recent sign-in) and `GET /api/v2/workspaces/:ws/holds`; see `lib/v2/requests.ts`.

## Activity (v2.2)
In-flight work signals for agents toward related goals. Deterministic metadata from the user's own hooks, never model
output, prompts, tool output or file contents.
`POST /api/v2/workspaces/:ws/activity` (Bearer) `{ "work_signals_version"?: 1, "items": [ { "session_key", "kind": "edit"|"commit"|"task"|"claim",
"at", "repo_id": hex, "path_hash": hex|null, "path": repo-relative string|null, "text": string|null } ] }` →
`{ "accepted", "refused": [ { "index", "reason": "clock_skew"|"too_old"|"not_shared"|"work_signals_off" } ], "server_time" }`.
At most 200 items and 128 KB. Items for sessions this device didn't share, sessions not in `shared`, more than 5 minutes
ahead or older than 24 h are skipped and listed in `refused`. `path` and `text` are sent only when the user turned on work signals (`align share ... --signals`);
otherwise only `path_hash` goes up. The server also requires consent recorded by the sharing device and permission from
the workspace. Current clients include the protocol version with named fields. A device paired before the schema 32 migration can send its opted-in names using the earlier request
shape (without `work_signals_version`) until an explicit session choice is recorded. The workspace ban still applies.
Other legacy requests with names receive an update message in the refusal reason. `repo_id` = sha256(ws + "\0repo\0" + normalized git remote) so clones on different
machines match; `path_hash` = sha256(repo_id + "\0" + repo-relative path). Absolute and `..` paths are refused.
Kept 24 hours; a `claim` 1 hour. The session's open epoch's goal is recorded with each item.
`GET /api/v2/workspaces/:ws/activity?after=<seq>` (Bearer) → `{ "cursor", "items": [ { "seq", "session_key", "harness",
"user": { "id", "name" }, "mine", "goal_id", "repo_id", "kind", "path_hash", "path", "text", "at", "expires_at" } ] }`,
oldest first, at most 500, only items on goals the caller can read (an unbound session's items only to its own user).
The agent uploads and fetches inside the normal hook-started sync pass; hooks read the cached copy.

## Session sharing choices

The authority for tier contents is [Nothing private leaves the machine](../../../../../specs/align/local-agent.md#requirement-nothing-private-leaves-the-machine).
`GET /api/v2/workspaces/:ws/data-sharing` returns `{blocked: [tier], model_check_blocked, decision_service: {url, revision} | null}`
for a workspace the caller can access. A dispatch read uses `?for=model-suggestion` and requires permission
to share sessions and a current grant for device calls. Device dispatch reads also return `{enabled, send_for_ms?}`.
A goal suggestion has at most 750 ms to start and a 2,200 ms request timeout within its 2,950 ms window.
A workspace owner can `PATCH` with `{tier, blocked}` for tiers 1 through 4, `{model_check_blocked}` for
the independent model check block, or `{decision_service_url: string | null}` to set or clear the shared service.
Each address change expires consent to its earlier revision. The audit action records a service change without the address. Migration 33 adds the decision service setting.
Migration 34 adds independent model check blocks, send windows and excerpt sharing.
The sharing device records tier 1 with `PUT /api/v2/workspaces/:ws/sessions/:key/work-signals` and
`{enabled: true|false}`. The returned `enabled` is false if the workspace prohibits a new opt-in.

In Mode L, `PUT /api/v2/devices/self/data-sharing` with `{enabled: true|false}` sets proposed tier 2 consent for the
calling device. Hosted Align refuses opt-ins and uploads with 403 `results_unavailable`.
`GET /api/v2/workspaces/:ws/sessions/:key/analysis?status=1` returns `{available, enabled, enabled_since}`.
`available` is false in hosted mode. `enabled` also checks the device grant, current workspace role, session state,
device consent and workspace ban. `enabled_since` is the start of the current consent period when enabled, or null.
Without the query the response includes the device's own findings.

`POST` accepts exactly `id`, `epoch_id`, `goal_version`, `limit_id`, `evidence`, `digest` and `turn_started_at`.
The id and keyed digest are 32 lowercase hex characters. Evidence is one of `wording`, `example`, `tool`, `file`,
`git` or `model`. The reported turn start is an ISO timestamp with milliseconds in UTC, later than the server's current
consent time. A matching retry is acknowledged while the finding is available. Findings expire 30 days from
the turn start. Deleted and expired findings return 410 `finding_gone` on replay.
`DELETE` removes the sharing device's findings and returns 204. It also returns 204 when the sharer's authorized
request reaches a marker for deleted session history. Other requests outside the device's scope receive 404.
This API accepts only the finding fields above.

`POST /api/v2/workspaces/:ws/sessions/:key/model-check` grants the sharing device a short send window
(`{enabled: true, send_for_ms: 1500, decision_service: {url, revision}}`) or returns `{enabled: false}`.
Both decisions go directly from the device to its selected recipient. The device measures each window from
before its permission request and bounds the send by the deadline. Each workspace block immediately prevents
new windows for that capability and waits out earlier windows before the save returns. An address change
expires consent to the earlier revision and waits out existing windows for both capabilities.

`PUT /api/v2/devices/self/data-sharing` with `{tier: 4, enabled: true|false, revision}` sets proposed
excerpt consent on the device. The device increments its revision before each command. The server applies only
a greater revision and returns its current `{enabled, revision}`. At `/api/v2/workspaces/:ws/sessions/:key/excerpts` the sharing device gets `{enabled, readers}`
and can POST exactly `{id, text, purpose, readers, hours}`. Reader ids name current members. The id is
`ex_` followed by 32 lowercase hex characters. Repeating the same share id and details returns its original expiry.
Expired or revoked shares cannot be reopened with the same id, even after their audit history expires.

Browser sessions use `GET /api/v2/workspaces/:ws/excerpts` for active excerpts shared by or with that person.
`GET /api/v2/workspaces/:ws/excerpts/:id` also returns the text. The sharer can DELETE it at the same address.
Other callers receive 404. Excerpt responses disable caching and the share event carries no content.

## Asks (PORT-003)
What a team was asked to do by someone else, recorded by a person from a meeting or by hand. An ask belongs to the
team asked; it is read by the person who recorded it, the members and leads of that team, and workspace owners.
`AskView = { "id": "ask_…", "state": "open"|"accepted"|"done"|"declined"|"withdrawn", "team": { "id", "name" },
"goal": { "id", "title" } | null, "text", "from_label": string|null, "requester": { "id", "name" }, "source": { "kind":
"meeting"|"manual", "title": string|null, "date": "YYYY-MM-DD" }, "mentions": [ { "n", "date", "text", "source_title",
"added_by": { "id", "name" } } ], "decided_by": { "id", "name" } | null, "decided_at", "created_at", "updated_at",
"waiting_on_me": boolean, "can": { "accept", "decline", "done", "reopen", "withdraw", "mention" }, "via_alignment"?:
{ "goal_id" } }`. `goal` is null
when the reader can't read it. `text`, `from_label`, `source.title` and mention text are people's words: data, not
instructions.
`GET /api/v2/workspaces/:ws/asks?state=&team_id=&limit=` (Bearer or cookie; `If-None-Match` supported → 304)
→ `{ "version": "<short hash>", "asks": [ AskView ] }` with header `ETag: "<version>"`. `state` is one state or a
comma-separated list (`open,accepted`); `team_id` keeps one team's asks; `limit` 1..500 (default 500). The agent asks
for `?state=accepted&team_id=<team>` (or `open,accepted`) and keeps the result in `feeds/asks-<ws>.json`. Order: the
caller's own (their teams' and those they recorded) first, then open, accepted, closed, then newest `source.date`.
A device token also gets the **accepted** asks of each team owning a goal that one of that device's live shared
sessions follows through an approved `work_toward` alignment (only while it is approved and the session is shared and
on that goal), read-only (`can` all false, `waiting_on_me` false) and marked `"via_alignment": { "goal_id" }` (the
goal followed); an ask the person reads anyway stays unmarked. The browser listing and `GET .../asks/:id` don't widen.
`POST /api/v2/workspaces/:ws/asks` (cookie; owners and members) `{ "team_id", "text" (1..400), "from_label"?
(≤80), "goal_id"? (a readable goal of that team), "source": { "kind", "title" (≤120; required for meeting), "date" } }`
→ 201 AskView. 409 `too_many_asks` past 500 open or accepted asks in a workspace; 429 past 60 recorded in an hour.
`POST /api/v2/workspaces/:ws/asks/import` (cookie; workspace owners) `{ "asks": [ ask + "state"? + "mentions"? ] }`
(≤60, all valid or none stored) → 201 `{ "created", "merged", "unchanged" }`: appends; same team, text and date →
unchanged; same team and text on an open or accepted ask with another date → a mention.
`GET /api/v2/workspaces/:ws/asks/:id` (cookie) → AskView. `POST .../asks/:id/{accept|decline|done|reopen|withdraw|mention}`
(cookie) → AskView; `mention` carries `{ "date", "text" (≤300), "source_title" (≤120) }`. 403 `not_team_lead` /
`not_in_team` / `not_requester` / `read_only`, 409 `wrong_state` / `too_many_mentions` (10), 429 past 30 a minute.

## Goal activity (PORT-003)
`GET /api/v2/workspaces/:ws/goals/:goal/activity` (cookie; readers of the goal) → `{ "window_days": 14, "sessions",
"active_now", "by_harness": { "claude-code", "codex" }, "last_activity_at": string|null, "evidence_class":
"agent_reported"|"not_observed", "detail": { "files":
[repo-relative path] (top 4), "files_hidden", "mine": [ { "session_key", "harness", "state", "last_activity_at" } ] } |
null }`. Counts come from bindings (epochs bound to or governed by the goal overlapping the last 14 days), usage times
and work signals; never prompts, replies, task labels, commit subjects, tokens or cost. `detail` only for the goal's
owner, its team and workspace owners. `evidence_class` (LIM-2455 §E2) is `agent_reported` when there is any session or
activity in the window (the align CLI reported all of it) and `not_observed` otherwise.

## Allocation (v2.3, main #29)
Additive fields; older agents ignore them. Spec: `goals-and-proposals`, `workspaces`, `directives`, `local-agent`.
- `Goal.target_share`: int 0..100 or null. The share of the workspace's agent time the goal should get. Versioned goal
  content: the owner sets it on create (`POST .../goals { target_share }`) or in a version (`POST .../goals/:goal/versions
  { version, target_share }`); anyone else proposes it through a reallocation. It reaches agents only in a saved or
  launched version (the `goal_version` snapshot carries `target_share`; older snapshots read as null). Active targets in a
  workspace, private goals included, sum to 100 or less, else `409 targets_over_100` (the message names only sums).
- Goals feed: `{ version, goals, steering: "off"|"on" }`; each goal also carries `"allocation": { "target_share",
  "share_7d", "gap_7d", "held" } | null` (active goals only, over the trailing 7 days; `share_7d` a whole percent,
  `gap_7d` the allocation report's gap to one decimal, so steering's 10 points match the Spend tab; `gap_7d` null without
  a target or without usage; `held` while the goal is on hold). `version` hashes goals and switch, so usage moves it
  only when a share moves a full point or a gap a tenth of one.
- Agent time = fresh tokens: `input + output + cache_write_5m + cache_write_1h + cache_write_unsplit`, every model, priced
  or not; cache reads left out. Shares are of all shared usage in the workspace in the window.
- `GET /api/v2/workspaces/:ws/allocation?from&to&weeks` (Bearer or cookie; every member) → `{ "window": { "from", "to",
  "total_fresh_tokens", "total_est_list_usd_micros", "unpriced_requests", "rows": [ { "kind": "goal"|"private"|
  "unallocated", "goal": { "id", "title" } | null, "fresh_tokens", "share", "target_share", "gap",
  "est_list_usd_micros", "unpriced_requests", "sessions" } ], "note" }, "weekly": [ { "week_start", "total_fresh_tokens",
  "rows": [ { "kind", "goal", "share", "target_share" } ] } ], "steering": { "steering", "total", "days": [ { "day", "n" } ] } }`.
  Default window: last 7 days; weeks 6 (1..26, Monday 00:00 UTC). Σ rows.fresh_tokens = total. No per-person view.
- `PATCH /api/v2/workspaces/:ws { "name"?, "steering"?: "on"|"off" }` (cookie, workspace owner) → `{ id, name, steering }`.
  `GET /api/v2/workspaces/:ws` includes `workspace.steering`.
- `POST /api/v2/workspaces/:ws/steering` (Bearer) `{ "events": [ { "session_key", "goal_id", "suggested_goal_id",
  "share", "target", "at" } ] }`, at most 100 → `{ "accepted", "refused": [ { "index", "reason" } ], "server_time" }`.
  Only this device's own shared sessions count; others (`not_shared`), and times more than 5 minutes ahead
  (`clock_skew`) or 14 days back (`too_old`), are skipped and listed in `refused`; a repeat is stored once and counted in `accepted`, so `accepted + refused.length` is the batch's length.
- Steering rule (agent, `packages/align-agent/src/shared/steering.ts`): with steering on, a shared session at
  `SessionStart` (`startup` or `clear`), not stopped or held, bound to a goal at least 10 points over its target and not
  held, while another active goal it can read is not held, has a target above 0 and is at least 10 points under, gets one
  line naming both goals and shares, once per session. Never at resume or compact; never names people. No directive.
- Reallocations (cookie): `POST /api/v2/workspaces/:ws/reallocations { "targets": [ { "goal_id", "target_share" } ],
  "note"? }` → 201; `GET .../reallocations` → `{ waiting_on_me, mine, others }`; `GET .../reallocations/:id`;
  `POST .../reallocations/:id/{approve|approve_and_launch|launch|not_yet|counter|accept_counter|reject|withdraw}`
  (approve and approve_and_launch need `revision`; the others check it when sent, and the app sends it with every
  decision; counter `targets` and `note`; reject `reason`). Each goal needs one
  approval from its effective approval set; then someone in every goal's launch set who can read every goal launches it,
  which writes each goal's next version with its new target (decreases first), authored by its approver. A newer version
  of any of its goals supersedes it. Readable by everyone who can read one of its goals.

## Spend
`GET /api/v2/workspaces/:ws/spend?by=goal|team|session&from&to` (`by=pod` is accepted as `by=team`) (cookie) → rows with token sums by basis and
`est_list_usd_micros` sums (labelled estimates), plus `unallocated` and `unpriced_requests`. Invariant: total =
Σ goals + unallocated. Private-goal spend visible to its owner only; others see it inside an unnamed "private" bucket.
Sessions older than 13 months are rolled up (docs/RETENTION.md): their usage still counts by goal and team, by its UTC
day (a day counts when its start is in `[from, to)`), and `by=session` shows it as one `rolled_up` row,
"Older sessions (rolled up)".
Readable goal rows in `by=goal` include `by_origin: [{origin, rolled_up, requests, est_list_usd_micros, unpriced_requests}]`.
Live usage uses the origin of its uploaded epoch. Rolled-up usage is a separate group with `origin: null` and
`rolled_up: true`. The private bucket has no `by_origin` field.

## Alignment (web, cookie)
`POST /api/v2/workspaces/:ws/alignments` → req `{ "target_goal_id", "source_goal_id": string|null, "choice": "contribution"|"work_toward", "session_keys": [string], "note": string|null }`
Effects: `contribution` → `contributes_to` only. `work_toward` → `contributes_to` + `governing_goal` + `allocation_transfer` for the listed sessions.
Approval requirements computed from effects and snapshotted on the revision (see "Alignment (web)" below). States: `pending` → `approved` | `rejected` |
`withdrawn`; `countered` (new revision by an approver, e.g. fewer sessions) → requester `accept_counter` → `pending`.
Actions: `POST .../alignments/:id/{approve|counter|accept_counter|reject|withdraw|revoke}`, each carrying the `revision`
the person read (400 without one; 409 `stale_revision` when the request has moved on).
On approval with `allocation_transfer`: a `binding_changed` directive per session. Revoke is prospective; sessions whose
binding exists only because of it get `binding_suspended`; the other sessions that received its `binding_changed` and have no
epoch under it get `binding_suspended` with `effective` `cancel_pending` and stay shared; a session with an open epoch on that
goal, or that another alignment now governs toward it, gets none.

## Connected AI apps and MCP
`GET /api/v2/workspaces/:ws/apps` (cookie, members) → `{ "url": "<origin>/api/mcp", "apps": [{ "id": "gr_…", "name",
"redirect_host", "user": { "id", "name" }, "approved_at", "last_used_at", "last_read_at", "scopes": ["goals:read", "changes:evidence"?] }] }`: every live grant for a workspace owner,
the caller's own for anyone else. `last_used_at` is the last `/api/mcp` request whose token verified (shown as "Last
connected"; `initialize` and `tools/list` count); `last_read_at` the last call to `align_list_goals`, `align_get_goal`,
`align_get_brief` or `align_get_limits` that returned a goal (shown as "Last read the goals"); each is written at most
every 5 minutes and null until the first. `DELETE /api/v2/workspaces/:ws/apps/:grant` (cookie write) → 204 for the grant's
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
- `PUT` on a session after stop-sharing is `409 sharing_stopped` (stopping is sticky; re-sharing needs delete first),
  from the device that shared it and from the same person's other devices alike.
  The exception is a session that ended because its device was revoked (`ended_reason: "device_signed_out"`): a `PUT`
  from another device of the same person (same harness and `repo_key`) shares it again on that device; and one that
  ended because its person left the workspace (`ended_reason: "member_removed"`), shared again by a device of theirs
  once they are a member again.
  So are epochs and usage. The same key with a different `harness` or `repo_key` is `409 session_conflict`.
- For a valid epoch retry, a change to the normalized `goal_id`, `starts_at`, `root_turn` or `cause` returns
  `409 epoch_conflict`. With those fields unchanged, the server returns the stored epoch if the sent origin matches
  the stored origin, the stored origin is null, or the server would store null for the retry. The server would store
  null for an omitted or explicit null origin or a known origin it cannot confirm. A different known origin that the
  server can confirm conflicts with a stored non-null origin and returns `409 epoch_conflict`. An unknown origin is `400`.
  Retries preserve the stored origin, authority, alignment, goal version and end time.
  - If the developer's switch request acceptance is recorded after the epoch opens, the same request still returns
    `200` with the stored null origin.
  - If the server could confirm acceptance when the epoch opened and can no longer confirm it on retry, the same
    request still returns `200` with the stored `switch_request` origin as long as the cause is still valid.
  `starts_at` before the open epoch's start or the last epoch's end is `409 epoch_overlap`; before the session's
  `started_at` is `400` (unless that start lies in the future on the server's clock: it came from a clock that ran
  ahead, and the epoch moves the session's start back to its own `starts_at`); more than 5 min in the future is
  `400 clock_skew` with `server_time`. A goal the caller can't see is `404`; a goal that isn't
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
  session's owner or a workspace owner) → `{ directive_id, agent_stopped }`; `409 sharing_stopped` for a stopped
  session, `409 device_signed_out` for one whose device was revoked and `409 member_removed` for one whose person
  left the workspace (nothing could deliver it).

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
team_role? }`), `DELETE .../invites/:id`, `GET /api/v2/invites/:token` (→ `{ workspace, role, team, team_role, email_matches,
invited_email, devices: [ { id, name, last_seen_at } ] }`, the devices only for the invitee: their paired devices that
are not revoked), `POST .../accept` (`{ device_ids? }`: those of the invitee's devices also get the workspace, audited
`device.workspace_added`; needs a sign-in from the last 15 minutes when not empty, `403 reauth_required`; another
person's, a revoked or an unknown device `404`; → `{ workspace_id, role, team_id, device_ids }`), `POST .../teams`,
`POST .../teams/:team/members`, `DELETE .../teams/:team/members/:user` (the `/pods` paths are aliases), `POST .../goals`
(`{ title, level?, visibility?, team_id?, measures?, anchors?, depends_on?, limits? }`), `GET .../goals/:goal` (with
`dependency_choices`: the goal ids a change request from the reader may add as a dependency, `null` when they can't propose;
and `dependency_loops`: the readable goals left out because they already depend on this one),
`POST .../goals/:goal/versions` (`{ version, title?, measures?, anchors?, status?, limits? }`, `409 stale_version` /
`no_change`), `POST .../limits/suggest` (`{ notes (≤20,000), source: { title?, date }, prefer_goal_id? }`, owners and
members, 20 a minute per person and 120 an hour per workspace → `{ suggestions: [ { goal: { id, title, version },
can_edit, can_propose, limits: [ { type, text, quote, source, already: lim id|null } ] } ], dropped }`; stores nothing;
see `lib/v2/limit-suggest.ts`), `GET .../sessions`, `GET .../alignments`, `GET .../alignments/:id`, `POST /api/v2/workspaces/sample`
(a new "Northstar (sample)" workspace owned by the caller, counted like any workspace creation), change requests
(`GET`/`POST .../goals/:goal/change-requests` with `{ base_version, changes, reason }`, `changes` any of `title`,
`measures`, `depends_on`, `status`, `limits`, `GET .../change-requests/:id`,
`POST .../change-requests/:id/{approve|approve_and_launch|launch|not_yet|reject|counter|accept_counter|acknowledge|withdraw|rebase}`
(approve records the decision and keeps the version unlaunched, `launch: "pending"`; `launch` publishes it as the goal's
next version with its `goal_version` directives, from the approval set or a workspace owner, 403 `not_a_launcher`;
`not_yet` publishes nothing; both take `{ revision }`, 409 `stale_revision` when it isn't current; a newer goal version or a closed goal first makes it `superseded` with `launch:
"superseded"`; `counter` takes an optional `condition` (1 to 2000) that only the requester `acknowledge`s, 403
`not_requester`, 409 `already_acknowledged`, never a gate), each request reading `launch`, `launch_decided_by`,
`launch_decided_at`, `launchers`, `condition` and `can.{approve_and_launch, launch, not_yet, acknowledge}`, and the
workspace-wide `GET .../change-requests?state=` as `{ waiting_on_me, mine, others }`; see `lib/v2/changes.ts`), change request
evidence (`POST .../change-requests/:id/evidence` `{ kind: "pr"|"ci_run"|"incident"|"dashboard"|"doc"|"other", url
(https, ≤ 2048), label (≤ 120), revision? }` → 201 `{ evidence, change_request }`, cookie or device token, at most 10
per revision; `DELETE .../change-requests/:id/evidence/:evidence` by its author while the revision is current and the
request open, else `409 evidence_frozen`; each revision reads `evidence[]` with `source: "person"|"agent"` and
`reported_as`, and the server-recorded `snapshot`; an approval sets `approved_without_evidence`; see
`lib/v2/evidence.ts`), the decision value card of an approved request (`GET .../change-requests/:id/value` →
`{ change_request_id, goal (version null until launched, base_version), launch, launched_at, diff, approved_by,
decided_at, created_at, approved_without_evidence, affected: { parents, dependents }, delivery: { sessions, received,
applied } | null (the launch's directive), apps: { everyone, items: [ { id, name, connected_by, sent_at } ] } | null (the
connected apps the reader can see that an MCP goal read sent the launched version; null before the launch), measured: { proposal_to_decision, decision_to_launch,
decision_to_first_applied }, my_report, reports, sees_all_reports, follow_up_url }`; `POST .../value` same-site `{ action:
"viewed"|"follow_up"|"reported", estimate?, note? (≤ 500) }` → `{ recorded, report }`; 409 `not_approved` before
approval, 409 `edit_closed` 7 days after a report was saved, 429 past 30 a minute per person; see `lib/v2/value.ts`),
the workspace Home (`GET .../home`, cookie only, members and viewers → `{ me, change_requests: { waiting_on_me,
waiting_on_others, declined (the reader's latest request per active goal when declined: { id, goal, reason, rejected_by,
rejection_reason, decided_at }) } | null, asks: { waiting_on_me } | null, alignments: { waiting_on_me, waiting_on_others } | null, goals
| null, apps: { everyone, items: [ { id, name, connected_by, approved_at, last_used_at, last_read_at, evidence_class:
"delivery_receipt"|"agent_reported"|"not_observed" } ] } | null }` (an app is a delivery receipt only with a
`last_read_at`; one that only connected is not observed); each queue item has `next` and `waiting_on`; a section
the server couldn't read is `null`; see `lib/v2/home.ts`),
the workspace's live stream (`GET .../stream`, cookie only, members and viewers, Server-Sent Events: `hello` on connect
`{ presence, views, resync }`, then `change` `{ views, presence }` when one of the reader's own views moves after a write
(`views` from `home`, `changes`, `goals`, `sessions`, `alignments`, `presence`; never content: the page reads them again),
`gone` `{ status }` when the reader is signed out or no longer a member (the stream ends); every `hello` and `change` has
an id, an opaque random token of this reader's stream (never a counter), and a reconnect with `Last-Event-ID` (or
`?last_event_id=`) gets in `hello` the views that moved since, or `resync: true` when that id is unknown; a keep-alive
comment every 15 s and a re-check every 30 s; `presence` is, for members and owners, per readable active goal
`[ { goal_id, working, paused, mine: [ { id, state: "working"|"paused", directive: { kind, at, delivery:
"sent"|"received"|"applied"|"enforced" } | null } ] } ]`: everyone's shared sessions bound to the goal by their current
epoch and heard from in the last 15 minutes as counts, and only the reader's own in `mine` (`id` is a stand-in, never a
session key); for a viewer always `[]`; a non-member `404`, an `Authorization` header `403 bearer_not_allowed`; `429
too_many_streams` for a person's fifth stream on one workspace, past the workspace's cap
(`ALIGN_LIVE_STREAMS_PER_WORKSPACE`, default 50) or past the server's (`ALIGN_LIVE_STREAMS_TOTAL`, default 200, whose message says Align is busy); see
`lib/v2/live.ts`),
`GET /api/v2/device/requests/:code`,
`POST /api/v2/device/approve` (`{ user_code, workspace_ids }` → `{ state: "approved", device_name, asked_as }`, the
device's name decided at approval, "<name> (2)" when a live device of the person has the name; needs a sign-in from the
last 15 minutes, else `403 reauth_required`), `POST /api/v2/device/deny`, `GET /api/v2/devices`,
`DELETE /api/v2/devices/:id`, `POST /api/v2/devices/:id/workspaces`. Better Auth is mounted at `/api/v2/auth/*` (cookie `align_v2.session_token`,
`__Secure-` prefixed when hosted).

Hosted creation gate (`specs/align/workspaces.md`; Mode L skips it): `POST /api/v2/workspaces` and `.../sample` take
`creation_code` (`alc_…`) when `ALIGN_CREATION=codes`, and the Turnstile token in `x-captcha-response` when Turnstile is
on. Refusals are 403 `creation_code_required`, `creation_code_invalid`, `creation_closed`, `workspace_cap`,
`owned_workspace_cap`, `disposable_email`; 400 `captcha_required`, 403 `captcha_failed`, 503 `captcha_unavailable`.
The workspace caps count live workspaces; `POST .../restore` past either is 409 `workspace_cap` or
`owned_workspace_cap`. Creating needs no recent sign-in.
Invites and acceptance can be 403 `member_cap`; a device's new session `PUT` can be 403 `session_cap`.
`POST /api/v2/access-requests` (no sign-in, same-site) `{ email, name, company?, team_size?: "1"|"2-10"|"11-50"|
"51-200"|"201+", use_case, interest: "try"|"evaluate", via?: "form"|"value_card" }` → 201 `{ received: true }`; 429 past 5 per client per hour or
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

## Send a CI measure reading

The goal owner selects **CI result** on the measure and enters the repository, branch and check name.
A workspace owner opens **Apps**, creates a CI reading credential and saves the secret in that job's
secret store as `ALIGN_CI_READING_TOKEN`. The credential only submits readings in that workspace.
Revoke it from Apps when the job stops using it or to rotate it. Align describes these values as reported
with a CI credential.

Run this step after the check has written one plain decimal to `measure-value.txt`. Set the workspace,
goal and measure IDs in the job's environment. The workspace and goal IDs are in the goal page URL.
The goal read, `GET /api/v2/workspaces/{ws}/goals/{goal}`, lists the measure IDs under `goal.measures`.
Use a branch and job that can safely access repository
secrets. This example uses a push job on a trusted branch.

```yaml
- name: Send the release check reading to Align
  if: github.event_name == 'push' && github.ref_type == 'branch'
  env:
    ALIGN_CI_READING_TOKEN: ${{ secrets.ALIGN_CI_READING_TOKEN }}
    ALIGN_URL: ${{ vars.ALIGN_URL }}
    ALIGN_WORKSPACE_ID: ${{ vars.ALIGN_WORKSPACE_ID }}
    ALIGN_GOAL_ID: ${{ vars.ALIGN_GOAL_ID }}
    ALIGN_MEASURE_ID: ${{ vars.ALIGN_MEASURE_ID }}
  shell: bash
  run: |
    set -euo pipefail
    value=$(<measure-value.txt)
    if [[ ! "$value" =~ ^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$ ]] || [[ ${#value} -gt 80 ]]; then
      value=
    fi
    jq -n --arg repository "$GITHUB_REPOSITORY" --arg branch "$GITHUB_REF_NAME" \
      --arg check 'Release checks' --arg run "${GITHUB_RUN_ID}.${GITHUB_RUN_ATTEMPT}" \
      --arg commit "$GITHUB_SHA" --arg value "$value" \
      '{repository:$repository,branch:$branch,check:$check,run:$run,commit:$commit,value:(if $value == "" then null else $value end)}' |
      curl --fail --silent --show-error --request POST \
        --header "Authorization: Bearer $ALIGN_CI_READING_TOKEN" \
        --header 'Content-Type: application/json' --data-binary @- \
        "$ALIGN_URL/api/v2/workspaces/$ALIGN_WORKSPACE_ID/goals/$ALIGN_GOAL_ID/measures/$ALIGN_MEASURE_ID/ci-reading"
```

The body accepts only these six fields. A JSON null reading represents an unknown value. The server
records the time it accepts the result. Retrying the same run and commit with the same value returns its
reading ID. Reusing that run and commit with a different value returns 409. This path uses the job's
credential and requires no installed repository app.

## Send a reading from one machine

The person using the paired machine runs `align measure device` and gives the goal owner its ID.
The goal owner selects **Command on a machine**, enters that ID, and sets an absolute executable path and
its arguments. The machine must be paired with access to the workspace, and its operator must be able to
read the goal and have a role that can submit command readings. Use a command that prints one plain decimal
on success. Pick a command and arguments that
are safe to store in the goal version. Keep secrets in the job or on the machine.

On the chosen macOS or Linux machine, from the working directory for the command, the person runs:

```sh
align measure allow <workspace-id> <goal-id> <measure-id> -- /absolute/executable arg1 arg2
align measure run <workspace-id> <goal-id> <measure-id>
```

The CLI fetches the current command on an authenticated device route, checks the exact local permission and
runs it under the current unprivileged account. The lookup and submission stay at the paired server
origin and refuse redirects. The submission contains only `goal_version`, `run_id` (one UUID per run),
`value` (the exact plain decimal as a JSON string, or null) and `exit_status` (an integer or null).
If the server's confirmation is lost, the CLI retries the same result and run ID without running the
command again. The server returns the original reading ID on an exact retry for the current version.
Align gives the process ten seconds and reads up to 4 KiB of standard output.
Standard error stays local and Align discards it. `align measure revoke <workspace-id> <goal-id> <measure-id>`
removes permission. If the command or its arguments change, each machine must explicitly allow the new command.

## Team budgets and requests

`GET /api/v2/workspaces/{ws}/teams/{team}/budget?month=YYYY-MM` accepts browser sessions and granted device tokens.
The month defaults to the current UTC month. Only team members and workspace owners can read the budget,
burn, forecast, no-goal subtotal and history; other readers get 404. The response is `{team, team_member_count, month, from, to, as_of, note, budget, effective_budget_usd_micros,
estimated_spend_usd_micros, remaining_usd_micros, forecast_usd_micros, runs_out_at, unpriced_requests,
known_unpriced_requests, priced_spend_usd_micros, spend_bound, remaining_bound, forecast_bound, pricing_note,
budget_stamp, reached_thresholds, allowance_granted_usd_micros, allowance_remaining_usd_micros, no_goal, history, can}`.
`team` is `{id, name}`. `budget` is null or `{amount_usd_micros, allowance_usd_micros,
allowance_ceiling_usd_micros, updated_by, updated_at}`. People are `{id, name}`. `can` is `{manage, request}`.
History is ordered oldest first and has `{id, action, amount_usd_micros, allowance_usd_micros,
allowance_ceiling_usd_micros, actor, at}`. `no_goal` has `{priced_spend_usd_micros, estimated_spend_usd_micros,
spend_bound, unpriced_requests, known_unpriced_requests, share_percent, attribution_unknown, few_contributors}`.
`few_contributors` is true when one or two distinct people have recorded no-goal usage in the month's read window under this team's captured home-team attribution, or when fewer than three are known and retained usage, which keeps no identities, is part of the figure. No count is returned. The panel warns when it is true; the CSV carries neither.
Bounds are `exact`, `lower`, `upper`, `unknown` or null for absent amounts. Amounts are integer USD microdollars representing list-price estimates.
Unpriced work and earlier live no-goal usage without a home team give spend and forecast lower bounds and a remaining upper bound. With no positive known subtotal, earlier unattributed usage gives unknown amounts. Missing attribution in retained aggregates also gives a lower bound for a known positive subtotal and unknown amounts otherwise, with an attribution-incomplete flag, without workspace-wide unattributed counts. No budget is `budget: null`. Reads do not create audit records or decisions.

Browser-only `PUT {amount_usd, allowance_usd?, allowance_ceiling_usd?}` and `DELETE` require a team lead or
workspace owner. Amounts are whole cents, 0 through 1,000,000 dollars. An omitted or null ceiling defaults to
the allowance. Past-month writes are 409 `month_closed`. Schema version 24 adds budgets and home teams; version 25 adds the terminal device reference and recorded name.
Periods opened before version 24 get no home team and their no-goal spend stays unallocated.

`POST .../teams/{team}/budget-requests {amount_usd, reason, goal_id?, session_keys?}` accepts browsers and devices
and returns 201 with the request. Only non-viewer team members file requests. A device request records
`filed_from: "terminal"`, stores `source_device_id` and `source_device_name` from the authenticated device, and always waits for a person. Cookie requests record `filed_from: "browser"` and may
be recorded under the allowance within its per-request and monthly ceilings. Input cannot override that source.
Creation is limited to 60 budget requests per requester per workspace per hour, with a separate workspace ceiling of 600, including withdrawn requests and allowance grants, across restarts (429 `rate_limited`). Five waiting requests per person/team/month is the maximum; a sixth is 409 `too_many_waiting_requests`.

`GET .../teams/{team}/budget-requests` and `GET .../budget-requests` accept `month`, `limit` (1 to 100, default 50)
and `cursor` (the last request id). Creation order is stable when decisions change between pages. They default to this UTC month and return
`{waiting_on_me, mine, others, next_cursor}`. `GET .../budget-requests/{id}` reads one record. Requesters,
team members and workspace owners can read it. Unreadable goals are null and only the requester sees attached
session keys. The record is `{id, team, month, revision, state, state_note, requester, filed_from, filing_note,
amount_usd_micros, reason, goal, goal_hidden, session_count, session_keys, approved_usd_micros, authority,
authority_label, expires_at, second_look, decisions, approvers, waiting_on_me, decision_unavailable_reason,
second_look_unavailable_reason, can, created_at, updated_at}`. `goal` is null or `{id, title}`.
Decisions have `{round, decision, actor, amount_usd_micros, expires_at, note, at}`; actions are
`{approve, decline, withdraw, second_look}`. `filing_note` names the recorded terminal device and states that
Align cannot tell whether the person or an agent ran the command, or names the person who filed in the browser.
The stored device id is never returned. Older terminal records say their device name was not recorded.

Browser-only `POST .../budget-requests/{id}/{approve|decline|withdraw|second-look}` requires `{revision}`.
Approve also takes `{amount_usd, expires_at, note?}`; decline takes `{reason}`. A requester never decides their
own request. Requesters who later become viewers may still withdraw their own waiting request. A second look needs a different eligible owner. Stale input is 409 `stale_revision`; future input
is 400 `unknown_revision`; an ineligible state is 409 `wrong_state`. Grants expire by next UTC month's start.

`GET .../spend/teams` returns `{teams: [{id, name}]}` to browser sessions and granted device tokens, listing only teams whose budgets the reader may read.

`GET .../spend/home-team` returns the caller's `{team, teams, can_choose}` to browsers and granted devices.
Browser `PUT {team_id}` changes only that person's preference, including for viewers. A team they do not belong
to is 404. The default is the earliest joined current team; leaving the chosen team clears the preference.

Home returns `budget_requests: {waiting_on_me, mine, next_cursor}` or null for an unread source. It selects
current/previous-month own requests and this month's requests waiting on the reader before hydration, up to 100.
The browser places those records in the single Needs list. Decisions, people, approvers, sessions, goals and
teams are read in batches.

`GET .../sessions/{key}/budget` is readable only by the session's owner and, for a device, its sharing device.
It returns `{epoch_id}` plus the budget-read fields for the open shared period, or null with no open shared
period, readable team or readable goal. `?attribution=1` returns only `{epoch_id, team, month, budget_stamp}`. A different
person's session is 404. Session listings add nullable `team_budget_label` only to own rows and only while the
team has a budget this month. Other people's rows omit the field.

`GET /api/v2/workspaces/{ws}/spend/export?month=YYYY-MM` is browser-only and requires exactly one valid month.
It returns `align-spend-YYYY-MM.csv` with private, no-store headers. Columns are `month`, `team`, `requests`,
`estimated_list_cost_usd`, `unpriced_requests`, `input`, `output`, `cache_read`, `cache_write_5m`, `cache_write_1h`,
`cache_write_unsplit`. List-price amounts retain six decimals. Goal-bound team rows match the on-screen team report exactly for that reader. Hidden goals remain in its single unnamed `Private goals` row. Only team members and workspace owners receive team no-goal rows; other teams' no-goal amounts stay unallocated. The no-team
row, unallocated remainder and total preserve all numeric sums. Cells are quoted and formula-like prefixes are
neutralized. The export uses the same UTC month validator as budgets.

Budget reads add `budget_stamp` and `reached_thresholds: [80 | 100]`. Thresholds use a positive effective budget and
known priced totals, including lower bounds; absent budgets and unknown totals return an empty list. First observed
crossings are stored once per workspace, team, UTC month and threshold with `observed_at` and the figure's `as_of`.
They create no decision, audit or product event. Home returns at most 100 `budget_crossings` records as
`{team: {id, name}, month, threshold, observed_at, as_of}`, only to current team leads and workspace owners, or null
on a failed source. They appear in Since you last looked, outside Needs, and are hidden while the budget is absent.
Home reads these records without computing new team burn. Spend states current thresholds and computation time.
No polling is added. Migration 25 records the terminal filing source. Migration 26 adds crossing records and indexed change stamps, preserving existing budgets and attribution.

A successful `align budget` read updates the team cache and matching locally confirmed session snapshots through the
sync figure validation path. During a turn only synchronous Claude Code PreToolUse emits a budget `systemMessage`,
with no budget `additionalContext`. Codex tool-call user-only messages are not verified and retain next-prompt notes.
Message and context markers persist independently per session, UTC month and threshold; prompt-first delivery
consumes both opportunities. Hooks skip subagents and never wait on the existing delivery lock.

Closed-month effective budgets include every granted request in force at some time in that month, even after expiry.
Align offers no per-person spend view. Team totals can reveal one person's spend when a team has fewer than three members.
Such teams can still have budgets; the panel states that privacy limit.

The one-pass agent does budget work last, with at most 100 sessions, 120 reads and two seconds per pass.
Attribution and team reads are reused for five minutes. A running session can act on a figure up to five minutes old.
A successful `align budget` read refreshes this device's team cache and matching snapshots. A newer accepted removal
or effective-amount change prevents notes from an older figure. Refusals other than 404 preserve pending observations
and are remembered for thirty seconds. Local budget files allowlist fields and include the non-secret server clock
offset. Server figure times use it with a one-minute tolerance; local read times keep strict device-clock checks.
Hooks read no credentials and import no network client. Model context has no command; the separate person message
may name `align budget request`. Both use readable months and UTC read times. Sign-out removes caches and delivery
markers; stop-sharing keeps delivery markers so re-sharing that month does not repeat a threshold.
