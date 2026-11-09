# Node-Server-Workspaces implementation Flavor

## ADDED Requirements

### Requirement: Node workspace service calling and storage binding [authored:node-server-workspaces-v3]

# Workspace target contract

Status: reviewed target authoring under the delegated Align scope. Native qualification, separate admission, consumer acceptance and source transfer remain pending.

The preserved original remains the private reference. Issue #76 proves its invite-cap race. A one-line corrected baseline, SHA-256 `276240e8d43bdfff5369d9854d557da15c969766bd89953e2db7e023a7029111`, is accepted and published in commit `9ca0ce303ec5db02488331944d06d453f7cdc4c6`. All 1,846 application checks, 36 image/header/startup checks, current and CI readers and exact-head forge checks pass. Use the frozen `boundaries/server-workspaces/corrected-source-v1` reference for native qualification and preserve the original as the negative defect control.

Frozen original `lib/v2/workspaces.ts`: SHA-256 `476c8a46cda8cc91cf4cd1aae0ed624a209fef755815acd9795c8400b81a4838`, 25137 bytes, 449 lines. The source remains private acceptance input. Accepted B14 also contains `lib/v2/sample.ts`; the sample receives a separate capability and declared data asset before aggregate transfer.

## Module surface

Provide package `server_workspaces`, module `server_workspaces/create_workspaces`, with a named synchronous arity-one export `create_workspaces(resources)`. Return the complete 26-operation service named in the Component contract. Capture resources once in the declared order without reading their current state or calling them. The production host will construct one service instance per original module instance.

Public synchronous operations: `principalIn`, `memberPrincipal`, `need`, `enter`, `workspacesFor`, `otherWorkspacesFor`, `workspaceDetail`, `deletedWorkspacesFor`, `deletedWorkspaceOwnedBy`, `auditTrail`, `listInvites`, `previewInvite`, `memberName`, `nameTo`.

Public asynchronous operations: `createWorkspace`, `updateWorkspace`, `deleteWorkspace`, `restoreWorkspace`, `setMemberRole`, `removeMember`, `createInvite`, `deleteInvite`, `acceptInvite`, `createTeam`, `setTeamMember`, `removeTeamMember`.

Keep original arities and default-argument cutoffs. Production forwarding functions must remain function declarations where the original exports are hoisted. Preserve the current namespace and inferred return types through bidirectional type checks rather than broad `unknown` results at callers.

## Captured ports

Capture the 36 existing imported runtime resources in original import order:

`all`, `audit`, `get`, `LIVE_WS`, `run`, `sql`, `tx`,
`softDeleteWorkspace`, `admitCreation`, `checkMemberCap`, `checkRestoreCaps`,
`precheckCreation`, `V2Error`, `badRequest`, `conflict`, `forbidden`, `notFound`,
`newId`, `nowIso`, `secretToken`, `sha256hex`, `authorize`, `config`, `event`,
`take`, `addWorkspaceToDevices`, `liveDevicesOf`, `deleteMemberSessions`,
`onMemberRemoved`, `cancelDeparture`, `noteDeparture`, `personName`, `RESTORE_DAYS`,
`workspaceSteering`, `writeSteering`, `oneLine`.

Add explicit `readDate`, a zero-argument reader returning the current host Date constructor. Access it only at points corresponding to original Date constructor, `Date.now` and `Date.parse` reads. This preserves an injectable clock without reading the real host environment in private acceptance. Built-in maps retain normal insertion order and public Map compatibility.

Configuration is a fresh `config()` call at the original hosted check. `RESTORE_DAYS` is the supplied numeric constant. `sql` is the supplied store handle passed unchanged to `softDeleteWorkspace`. Do not replace these with generated storage, authorization, retention or identity implementations.

## Storage mapping

The current mapping uses `v2_workspaces`, `v2_members`, `v2_pods`, `v2_pod_members`, `v2_invites`, `v2_audit` and `ba_user`. Preserve the reviewed physical column names, selected projection names, argument order, statement predicates, ordering, conflict clauses and affected-row semantics. The separate [physical storage target draft](server-workspaces.storage-target-contract-draft-v1.md) specifies 42 distinct statements, 48 call sites and every ordered binding tuple. It is reviewed source-bound authoring input, not admitted or executable evidence. The complete target and acceptance still require review before promotion.

Preserve these target details during that authoring:

- Live workspace predicates use the supplied `LIVE_WS` expression at their original construction points.
- Workspace and ungranted-workspace listings order by name then identity. Team listings preserve their original name ordering. Deleted listings order newest deletion first. Audit entries order by sequence descending and stop at 200. Invite listings order creation time descending.
- Owner counting and role lookups use current membership rows. Role changes and departures perform their second lookup inside the transaction.
- Restore repeats both the owner/deletion-window lookup and cap check inside the transaction.
- Invite creation preserves pending-member cap accounting before secret and identity allocation. Under the explicit issue #76 correction, it repeats that check after the transaction acquires its write lock and immediately before insertion. The insertion uses seven-day expiry calculated at its original transaction point. Other checks remain at their original transaction points.
- Acceptance checks repeat acceptance before the ordinary unused-token lookup. Only the matching prior accepter who is still a live member receives the detailed 409 with `workspace_id`. Other used-token cases keep ordinary missing behavior.
- Invite acceptance checks existing membership and member caps inside the transaction. A vanished team is skipped by changing the selected invite record's `team_id` to null. Device grants use the same transaction and preserve the supplied returned array.
- Team upsert changes only its role on the existing `(pod_id, user_id)` conflict. Team deletion checks affected rows before returning or creating the missing error.

## Exact public values and failure behavior

Retain the original message bytes and codes. The last-owner text is `A workspace needs at least one owner. Make someone else an owner first.` Restore of a live workspace uses `not_deleted`. Viewer/lead conflicts use `viewer_lead`; restricted lead changes use `owner_only`. Invite distinctions include `already_member`, `email_mismatch` and `email_unverified` with their original constructors, statuses and detail fields.

`need` supplies `{ kind: "workspace" }` only for an omitted or undefined object. Invite team defaults are `{ id: null, role: null }`; an extant team with an omitted role defaults to `member`. `removeMember` defaults session deletion only through its original destructuring behavior. `acceptInvite` defaults its device list to a new empty array and recent-sign-in callback to a no-op per invocation. Preserve explicit null failures, getter order and malformed-value behavior observed from the original.

Dates preserve original parsing and strict cutoff comparisons. `deletedWorkspacesFor` computes its cutoff once and maps `restore_until`. `deletedWorkspaceOwnedBy` treats a restore-until time equal to the current time as expired. Return the pre-transaction workspace identity from restore even though validation is repeated later. Preserve invalid-date exceptions instead of accepting newly normalized inputs.

## Private acceptance plan

Start from the complete read-only preflight case groups. Add direct resource capture probes for all 37 fields, no construction effects, live configuration and clock reads, resource function receivers, supplied failures and type/metadata parity. Record a complete successful trace for each mutation, then inject each recorded effect failure and require exact original result or rejection and effect prefix. Distinguish missing, undefined, null, invalid numbers, thrown identity and returned references.

Run populated SQLite checks with the already qualified storage and schema packages, real transaction provider and owned synthetic accounts. Cover creation/seed rollback, last-owner changes, concurrent cap-sensitive operations, deleted-window boundaries, membership races, invitation acceptance with device-grant failure, missing-team handling and cross-workspace team lookup. Keep original source and fixtures private. The finalized target contract, independent oracle, capture inventory and type/caller checks are still required before any generation.


# Workspace calling and observation precision

This is reviewed target authoring input, not an implementation or a qualification result. The accepted corrected source is the behavioral reference. Keep JavaScript property reads, native receivers, short-circuiting, transaction callbacks and failures observable to caller-owned values.

## Common calling rules

Capture all 37 declared fields exactly once, in their declared order. Resource enumeration, deferred property capture and repeated capture are outside this target. Call captured functions as bare functions with an undefined receiver. Construct errors through the captured `V2Error`. Preserve a supplied thrown value by identity. A factory must not call any supplied function, read current configuration, resolve a Date constructor or access ambient host facilities.

Keep the 26 named functions, their original parameter counts and synchronous versus asynchronous function kinds. Default-parameter cutoffs are part of those counts. An omitted or undefined argument gets its original default. Null and malformed values retain native failure behavior. Do not coerce inputs preemptively. JavaScript Maps, array methods, spreads, property enumeration and string methods keep their native ordering and receiver behavior. Public objects retain their existing field names. Storage rows and caller inputs can have observable getters or be mutated by a supplied callback.

## Reads and projections

`principalIn` reads the kind before choosing a grant check. Only a literal `web` kind skips `grants.has`. Read the user's identity after that decision. A refused grant returns an empty new Map and null workspace role without a store query. `memberPrincipal` gets membership, creates a Map, and only for a truthy membership fetches and iterates team membership rows. Resolve the membership role after that iteration, using null for a nullish role. Preserve Map insertion and duplicate-key behavior.

`need` invokes authorization with the original principal, action and object. Only omitted or undefined object gets a new `{kind: "workspace"}`. Read `ok` first; a refusal then reads status, code and message in constructor-argument order. `enter` resolves the principal, checks `workspace.read` and returns that same principal object.

Workspace lists use the specified query and native filtering before native mapping. The filter rereads caller kind and grants for each row. Team lookup rereads caller user and the selected row's identity at its original mapping point. The resulting workspace projection spreads the row before attaching its team array. A non-device `otherWorkspacesFor` returns a fresh empty array without a query. Device filtering negates the current grant check for each row.

Workspace detail reads the workspace first and refuses a falsy result before member or team queries. Preserve the workspace row reference in `workspace`, current `role` and `me`, and direct member-array reference. Each team projection spreads its row, derives `my_role` through the supplied principal Map with a nullish fallback, then queries that team's members. Preserve name/identity ordering from the physical SQL contract.

For update, permission precedes body reads. The initial empty-body test reads name first and reads steering only when name is undefined. Independently reread name to decide whether to call `oneLine(body, "name", 100)`. That supplied parser receives the original body and can reread or mutate it. Obtain the timestamp next. Inside the transaction, rename and audit only when the parser result is not undefined. Independently read steering to choose between reading stored steering and writing it; the write receives a fresh steering property read. After awaiting the transaction, reread the stored name. Preserve the transaction's steering return, including its reference identity. Do not collapse changing getters into one body snapshot.

## Dates

Every original Date identifier evaluation maps to one bare `readDate()` call. Do not cache across an expression, helper or operation. Resolve an outer constructor before evaluating its argument expression. A separately selected constructor supplies its own `parse` or `now` receiver.

- A deleted-list cutoff selects a constructor, separately resolves `now`, subtracts the restore duration and constructs the cutoff. Each mapped restore-until value selects a constructor before separately resolving `parse`.
- The owned-deleted check first selects the Date receiver for its outer parse. Its restore-until helper then selects a constructor and another parse receiver. After converting and parsing the restore-until string, resolve the current Date receiver for `now`. Equality is expired. Preserve all native invalid-date failures.
- Invitation expiry selects a constructor before resolving `now` and adding seven days, inside the insert's argument evaluation after the stored hash and earlier bound values.
- Token lookup parses the selected row's expiry only after the row exists and is not accepted. Resolve its separate current-time receiver afterward. A nullish row or truthy accepted timestamp skips both reads. A nonnumeric parsed value retains the original comparison behavior.

## Mutations and callback order

Workspace creation reads caller identity, takes `ws-create:<identity>` at ten per hour, then builds the creator from identity, current email and verification. Await the admission precheck before allocating `ws` identity and timestamp. The synchronous transaction callback admits creation, inserts workspace then owner, audits `workspace.created`, optionally records `code_redeemed`, records `workspace_created` with kind derived from seed truthiness, and finally calls a non-nullish seed with workspace and timestamp. Seed truthiness determines event kind; optional invocation retains native failure for a non-callable non-nullish seed. Return the allocated identity, input name and owner role only after transaction completion.

Delete obtains permission and timestamp, awaits one transaction invoking `softDeleteWorkspace` with the same SQL handle, workspace, actor and timestamp, then returns undefined. Restoration performs the owned/deletion-window lookup, cap check and timestamp before the transaction. It repeats lookup and caps under the transaction lock before updating and auditing. Its return uses the first lookup's projected identity and name, even if the second lookup differs.

Role changes get current membership before timestamp allocation and again inside the transaction. Falsy membership refuses. Equal requested and current roles skip all writes but preserve the ordinary public return. Only a current owner triggers the owner-count lookup; a missing or nullish count becomes zero. A count at or below one refuses with `last_owner` and the unchanged last-owner message. Otherwise update and audit, then return `user_id` and the requested role.

Removal destructures the options default at argument binding time. Compute self-departure from the current principal identity; only removing someone else requires workspace management. Recheck membership and last-owner protection inside the transaction. Invoke membership cleanup, delete membership, record departure and audit in that order. Optional session deletion happens afterward. A truthy deletion count adds the session-deletion audit. Preserve the undefined return.

Audit mapping preserves current actor-id truthiness, repeated actor-id reads for a present actor, supplied former-member naming, null absent actor, current object identity and the native anchored replacement from `pod.` to `team.`. Keep the exact latest-200 query.

## Invitation precision

Creation first checks management permission. Read team role before deciding whether to read team identity for the role-without-team refusal. Then independently test team identity for team visibility and reread it for that query argument. Independently capture team identity afterward. A truthy captured identity selects a fresh team-role read with nullish `member` fallback; a falsy identity selects null. Check the viewer/lead restriction before throttling. Take `invite-create:<workspace>` at fifty per hour. Use the original email's trim result and its lowercase method, then the original email regex. Check existing membership before the first cap check. Cap checking precedes `secretToken(32)`, `newId("inv")` and timestamp allocation.

After acquiring the transaction lock, repeat `checkMemberCap(workspace, true)` immediately before preparing insertion arguments. Keep the exact ten SQL bindings, including the supplied hash result, captured team values, current principal reads and Date expiry conversion. Audit and record the invite event afterward. Return the original captured token, its unescaped `/app/invite/` path and the exact existing public keys. Preserve normalized email and requested role. This deliberately preserves the accepted issue #76 correction.

Listing removes `team_name` by destructuring, spreads the remaining row, then constructs `team` from copied team identity and a nullish-to-empty-string name. Withdrawal uses the transaction's actual affected-row return. Only a truthy delete count allocates its audit timestamp and audits. A falsy result after awaiting the transaction invokes the missing error.

Token validation uses the native regex test with its current input-coercion behavior. Hash the original token value only after it passes. Token lookup gets the selected invite, rejects a falsy row, truthy accepted timestamp or expired comparison, then checks live-workspace visibility. Preview lowercases the supplied user's email before workspace/team projection. Preserve missing workspace name as empty, absent team as null, absent team role as null, and device lookup only for a matching email. Device last-seen time falls back nullishly to creation time.

Acceptance first checks prior acceptance for this user. A prior matching accepted invite plus a current live membership creates the supplied 409 `already_member`, the unchanged another-tab/window message and `{workspace_id: priorWorkspace}` detail. Other used-token situations proceed to ordinary token lookup and its missing behavior. After lookup, compare email, then read hosted configuration and verification, then check device-list length for recent-sign-in enforcement. Allocate the timestamp only after these checks.

Inside the transaction, check existing membership before the member cap with invite counting false, insert membership, cancel departure, then conditionally join the invite's still-extant team. If no team is joined, assign null to the selected invite row's team identity. Consume the invite, audit, call device granting even for an empty device list, and preserve the returned device-array reference. Record the invite event, count current members, and emit the second-member event when the nullish-to-zero count is at least two. Event deduplication remains the supplied event service's responsibility. Return current invite workspace/role/team values and the supplied device-array reference after awaiting the transaction.

Keep these exact constructed messages: `This invite is for a different email address`; `Your sign-in provider has not verified this email address`; `You already joined this workspace with this invite, in another tab or window.`; `You are already a member.`; `That person is already a member.`; `Enter an email address`; `team_role needs a team_id`; `A viewer can't lead a team. Invite them as a member of it, or with another workspace role.`

## Teams and names

Team creation checks management, allocates `pod` identity then timestamp, inserts and audits within one transaction, and returns input name and allocated identity. Setting or removing team membership first checks that the team belongs to the current workspace, then authorizes `pod.manage_members` with the explicit pod object. Setting reads the current team membership before the workspace membership. Requested lead or current lead needs workspace-owner status before the workspace-member lookup. Missing workspace membership refuses; a viewer cannot become lead. Preserve the exact upsert, timestamp, audit and public keys.

Removing another person's lead role requires workspace ownership; self-removal keeps its exception after ordinary pod authorization. Use the transaction's actual delete count, allocate the audit timestamp only for a truthy deletion and reject a falsy result afterward. Keep `Only a workspace owner can make someone a team lead.`, `Only a workspace owner can remove a team lead.` and `A viewer can't lead a team. Change their workspace role first, or add them as a member.`

Member naming invokes the supplied former-member name service with the original user identity and the queried optional name. Reader-relative naming returns the exact string `you` on strict identity equality and performs no query or name-service call on that branch.


# Workspace physical storage contract

Status: authored target draft. No generation, source retirement or qualification is authorized by this file.

This draft defines the existing SQLite tables, projections, statement text and ordered bound values used by the workspace and sample services. Component intent owns permission decisions, membership and invitation behavior. Supplied services own identity, caps, storage, transactions, retention, steering and device grants. This contract adds no schema or identity implementation.

The correction for Align issue #76 adds a fresh member-cap check under the invitation transaction lock. It changes no statement or binding below. The corrected retained baseline has complete application, image, receipt and published exact-head acceptance. Preserve the original failed controls separately.

## SQL representation

Each Q identifier names one exact SQL string. Preserve its whitespace, selected field names, aliases, predicates, ordering and conflict clause. Question marks are bound values, never string substitution. Pass the statement to its declared supplied driver. A returned change count remains the supplied driver result, with the existing truthiness checks.

Two named placeholders represent supplied live-workspace predicates. For `{LIVE_MEMBER_WORKSPACE}`, evaluate `LIVE_WS("ws_id")` at the corresponding membership statement construction point. For `{LIVE_INVITATION_WORKSPACE}`, evaluate `LIVE_WS("?")` at the corresponding invitation visibility statement construction point. Interpolate the returned text once at that point, preserving ordinary template conversion. Do not cache these predicate reads during factory construction or add extra bound values.

## Closed statement set

### Q01

```sql
SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ? AND {LIVE_MEMBER_WORKSPACE}
```

### Q02

```sql
SELECT pod_id, role FROM v2_pod_members WHERE ws_id = ? AND user_id = ?
```

### Q03

```sql
SELECT w.id, w.name, m.role FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? WHERE w.deleted_at IS NULL ORDER BY w.name, w.id
```

### Q04

```sql
SELECT p.id, p.name, pm.role FROM v2_pods p JOIN v2_pod_members pm ON pm.pod_id = p.id AND pm.user_id = ? WHERE p.ws_id = ? ORDER BY p.name
```

### Q05

```sql
SELECT w.id, w.name FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? WHERE w.deleted_at IS NULL ORDER BY w.name, w.id
```

### Q06

```sql
INSERT INTO v2_workspaces (id, name, created_by, created_at) VALUES (?, ?, ?, ?)
```

### Q07

```sql
INSERT INTO v2_members (ws_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)
```

### Q08

```sql
SELECT id, name, created_at, steering FROM v2_workspaces WHERE id = ?
```

### Q09

```sql
SELECT u.id, u.name, u.email, m.role FROM v2_members m JOIN ba_user u ON u.id = m.user_id WHERE m.ws_id = ? ORDER BY u.name, u.id
```

### Q10

```sql
SELECT id, name FROM v2_pods WHERE ws_id = ? ORDER BY name, id
```

### Q11

```sql
SELECT u.id, u.name, pm.role FROM v2_pod_members pm JOIN ba_user u ON u.id = pm.user_id WHERE pm.pod_id = ? ORDER BY u.name
```

### Q12

```sql
UPDATE v2_workspaces SET name = ? WHERE id = ?
```

### Q13

```sql
SELECT name FROM v2_workspaces WHERE id = ?
```

### Q14

```sql
SELECT w.id, w.name, w.deleted_at FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? AND m.role = 'owner' WHERE w.deleted_at IS NOT NULL AND w.deleted_at > ? ORDER BY w.deleted_at DESC
```

### Q15

```sql
SELECT w.id, w.name, w.deleted_at FROM v2_workspaces w JOIN v2_members m ON m.ws_id = w.id AND m.user_id = ? AND m.role = 'owner' WHERE w.id = ?
```

### Q16

```sql
UPDATE v2_workspaces SET deleted_at = NULL WHERE id = ?
```

### Q17

```sql
SELECT COUNT(*) AS n FROM v2_members WHERE ws_id = ? AND role = 'owner'
```

### Q18

```sql
SELECT role FROM v2_members WHERE ws_id = ? AND user_id = ?
```

### Q19

```sql
UPDATE v2_members SET role = ? WHERE ws_id = ? AND user_id = ?
```

### Q20

```sql
DELETE FROM v2_members WHERE ws_id = ? AND user_id = ?
```

### Q21

```sql
SELECT a.at, a.actor_id, u.name AS actor_name, a.action, a.object_id FROM v2_audit a LEFT JOIN ba_user u ON u.id = a.actor_id
     WHERE a.ws_id = ? ORDER BY a.seq DESC LIMIT 200
```

### Q22

```sql
SELECT 1 AS x FROM v2_pods WHERE ws_id = ? AND id = ?
```

### Q23

```sql
SELECT 1 AS x FROM v2_members m JOIN ba_user u ON u.id = m.user_id WHERE m.ws_id = ? AND lower(u.email) = ?
```

### Q24

```sql
INSERT INTO v2_invites (id, ws_id, token_hash, email, role, team_id, team_role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

### Q25

```sql
SELECT i.id, i.email, i.role, i.team_id, p.name AS team_name, i.team_role, i.created_at, i.expires_at, i.accepted_at
     FROM v2_invites i LEFT JOIN v2_pods p ON p.ws_id = i.ws_id AND p.id = i.team_id WHERE i.ws_id = ? ORDER BY i.created_at DESC
```

### Q26

```sql
DELETE FROM v2_invites WHERE ws_id = ? AND id = ? AND accepted_at IS NULL
```

### Q27

```sql
SELECT id, ws_id, email, role, team_id, team_role, expires_at, accepted_at FROM v2_invites WHERE token_hash = ?
```

### Q28

```sql
SELECT 1 AS x WHERE {LIVE_INVITATION_WORKSPACE}
```

### Q29

```sql
SELECT id, name FROM v2_pods WHERE ws_id = ? AND id = ?
```

### Q30

```sql
SELECT ws_id FROM v2_invites WHERE token_hash = ? AND accepted_at IS NOT NULL AND accepted_by = ?
```

### Q31

```sql
SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ? AND {LIVE_MEMBER_WORKSPACE}
```

### Q32

```sql
SELECT 1 AS x FROM v2_members WHERE ws_id = ? AND user_id = ?
```

### Q33

```sql
INSERT INTO v2_members (ws_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
```

### Q34

```sql
INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)
```

### Q35

```sql
UPDATE v2_invites SET accepted_at = ?, accepted_by = ? WHERE id = ?
```

### Q36

```sql
SELECT COUNT(*) AS n FROM v2_members WHERE ws_id = ?
```

### Q37

```sql
INSERT INTO v2_pods (id, ws_id, name, created_at) VALUES (?, ?, ?, ?)
```

### Q38

```sql
SELECT role FROM v2_pod_members WHERE pod_id = ? AND user_id = ?
```

### Q39

```sql
INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (pod_id, user_id) DO UPDATE SET role = excluded.role
```

### Q40

```sql
DELETE FROM v2_pod_members WHERE ws_id = ? AND pod_id = ? AND user_id = ?
```

### Q41

```sql
SELECT name FROM ba_user WHERE id = ?
```

### Q42

```sql
INSERT INTO v2_pod_members (ws_id, pod_id, user_id, role, created_at) VALUES (?, ?, ?, 'lead', ?)
```

## Call and binding map

C identifiers distinguish semantic call sites that reuse a physical statement. They are target documentation identifiers. They introduce no new public operations. Binding tuples list evaluated argument values in order. Preserve normal caller property accesses and timing, including repeated reads required by the Component and target calling contract.

| Call | Operation | Driver | SQL | Ordered bound values |
| --- | --- | --- | --- | --- |
| C01 | memberPrincipal | `get` | Q01 | workspace identity; person identity |
| C02 | memberPrincipal | `all` | Q02 | workspace identity; person identity |
| C03 | workspacesFor | `all` | Q03 | person identity |
| C04 | workspacesFor | `all` | Q04 | person identity; selected workspace identity |
| C05 | otherWorkspacesFor | `all` | Q05 | person identity |
| C06 | createWorkspace | `run` | Q06 | new workspace identity; supplied name; creator identity; creation timestamp |
| C07 | createWorkspace | `run` | Q07 | new workspace identity; creator identity; creation timestamp |
| C08 | workspaceDetail | `get` | Q08 | principal workspace identity |
| C09 | workspaceDetail | `all` | Q09 | principal workspace identity |
| C10 | workspaceDetail | `all` | Q10 | principal workspace identity |
| C11 | workspaceDetail | `all` | Q11 | selected team identity |
| C12 | updateWorkspace | `run` | Q12 | validated name; principal workspace identity |
| C13 | updateWorkspace | `get` | Q13 | principal workspace identity |
| C14 | deletedWorkspacesFor | `all` | Q14 | person identity; computed restore cutoff |
| C15 | deletedWorkspaceOwnedBy | `get` | Q15 | person identity; workspace identity |
| C16 | restoreWorkspace | `run` | Q16 | workspace identity |
| C17 | owner count or member-role lookup | `get` | Q17 | workspace identity |
| C18 | owner count or member-role lookup | `get` | Q18 | workspace identity; person identity |
| C19 | setMemberRole | `run` | Q19 | new workspace role; principal workspace identity; subject person identity |
| C20 | removeMember | `run` | Q20 | principal workspace identity; subject person identity |
| C21 | auditTrail | `all` | Q21 | principal workspace identity |
| C22 | createInvite | `get` | Q22 | principal workspace identity; supplied team identity |
| C23 | createInvite | `get` | Q23 | principal workspace identity; normalized invitation email |
| C24 | createInvite | `run` | Q24 | new invitation identity; principal workspace identity; supplied token hash; normalized invitation email; supplied workspace role; resolved team identity; resolved team role; principal person identity; creation timestamp; computed invitation expiry |
| C25 | listInvites | `all` | Q25 | principal workspace identity |
| C26 | deleteInvite | `run` | Q26 | principal workspace identity; supplied invitation identity |
| C27 | inviteByToken | `get` | Q27 | supplied token hash |
| C28 | inviteByToken | `get` | Q28 | selected invitation workspace identity |
| C29 | previewInvite | `get` | Q13 | selected invitation workspace identity |
| C30 | previewInvite | `get` | Q29 | selected invitation workspace identity; selected invitation team identity |
| C31 | alreadyJoinedWith | `get` | Q30 | supplied token hash; person identity |
| C32 | alreadyJoinedWith | `get` | Q31 | used invitation workspace identity; person identity |
| C33 | acceptInvite | `get` | Q32 | selected invitation workspace identity; joining person identity |
| C34 | acceptInvite | `run` | Q33 | selected invitation workspace identity; joining person identity; selected invitation workspace role; acceptance timestamp |
| C35 | acceptInvite | `get` | Q22 | selected invitation workspace identity; selected invitation team identity |
| C36 | acceptInvite | `run` | Q34 | selected invitation workspace identity; selected invitation team identity; joining person identity; selected invitation team role with nullish member default; acceptance timestamp |
| C37 | acceptInvite | `run` | Q35 | acceptance timestamp; joining person identity; selected invitation identity |
| C38 | acceptInvite | `get` | Q36 | selected invitation workspace identity |
| C39 | createTeam | `run` | Q37 | new team identity; principal workspace identity; supplied name; creation timestamp |
| C40 | teamInWs | `get` | Q22 | workspace identity; team identity |
| C41 | setTeamMember | `get` | Q38 | team identity; subject person identity |
| C42 | setTeamMember | `get` | Q18 | principal workspace identity; subject person identity |
| C43 | setTeamMember | `run` | Q39 | principal workspace identity; team identity; subject person identity; supplied team role; change timestamp |
| C44 | removeTeamMember | `get` | Q38 | team identity; subject person identity |
| C45 | removeTeamMember | `run` | Q40 | principal workspace identity; team identity; subject person identity |
| C46 | memberName | `get` | Q41 | person identity |
| C47 | createSampleWorkspace | `run` | Q37 | new team identity; new sample workspace identity; team name from declared sample asset; creation timestamp |
| C48 | createSampleWorkspace | `run` | Q42 | new sample workspace identity; new team identity; sample owner identity; creation timestamp |

## Transaction and result constraints

Workspace creation, rename and steering changes, deletion, restore, membership mutation, invitation creation and acceptance, and team mutation keep the supplied transaction service and its synchronous callback contract. Callback failures propagate and the store owns rollback. No generated BEGIN, COMMIT, connection, retry loop or alternate database is permitted.

Invitation creation preserves its early capacity refusal before token and identity allocation and repeats capacity accounting after acquiring the transaction lock, immediately before insertion. Token hashing and expiry argument evaluation remain at the insertion call. The expiry is seven days after the Date.now read at that point. That additional locked check is the explicit issue #76 correction, not an unrecorded change to the original behavior.

Membership mutation and restoration repeat the current role, ownership, restore eligibility or cap checks at their original transaction points. Invitation acceptance checks current membership and member capacity under the transaction; team lookup and conditional membership insertion use the selected workspace and team identities. Existing affected-row checks control withdrawal and team removal.

Keep all returned projections and row references required by the public contract. The invite row may have its selected team identity changed to null when that team has vanished. Preserve that observable selected-row mutation and the returned device grant array. This storage mapping alone does not establish transaction isolation, race safety, malformed-value behavior or actual typed consumer compatibility.

## Acceptance still required

Review every query and tuple against the frozen source and corrected baseline. Exercise both supplied live predicates, all read/write paths, ordering and alias projections, affected-row handling, populated rollback and competing connections. Keep source observations and private expected results outside generation input. This draft does not replace the independent oracle, final asset binding contract, two clean qualifications, separate admission, typed consumers or parent gates.


## Package and acceptance boundary

Provide only the `server_workspaces/create_workspaces` library module for this Component. The package manifest has name `server_workspaces`, type `commonjs` and export `./create_workspaces` mapped to `./create_workspaces.js`. A `main.js` adapter supplies the framework's generated tests. Keep all generated JavaScript syntax-valid and all package files ordinary, without symlinks, installed dependencies or undeclared host imports. Do not add npm dependencies. Use the supplied providers for every effect and `readDate` for every Date lookup. Deterministic ordinary language operations remain available. Private verifier guards check conformance and are not an OS security sandbox.

The physical storage contract contains the shared B14 statement inventory. This factory implements the 46 workspace call sites. The two sample call sites and sample asset belong to the separate sample Component. Keep all 26 public methods and their source-observed public fields and message bytes.


## Complete returned-service calling surface

The following declared parameter lists specify public argument positions, defaults, function kind and observable JavaScript length. Type names refer to the existing host-owned public types. Generated JavaScript preserves these calls without generating identity, authorization or database implementations.

| Operation and parameters | Kind | Length |
| --- | --- | --- |
| `principalIn(p: Principal, wsId: string)` | sync | 2 |
| `memberPrincipal(wsId: string, userId: string)` | sync | 2 |
| `need(p: PolicyPrincipal, action: Action, obj: PolicyObject = { kind: "workspace" })` | sync | 2 |
| `enter(p: Principal, wsId: string)` | sync | 2 |
| `workspacesFor(p: Principal)` | sync | 1 |
| `otherWorkspacesFor(p: Principal)` | sync | 1 |
| `createWorkspace(req: Request, p: WebPrincipal, name: string, code: string \| null, seed?: (wsId: string, at: string) => void)` | async | 5 |
| `workspaceDetail(pp: PolicyPrincipal)` | sync | 1 |
| `updateWorkspace(pp: PolicyPrincipal, b: Body)` | async | 2 |
| `deleteWorkspace(pp: PolicyPrincipal)` | async | 1 |
| `deletedWorkspacesFor(userId: string)` | sync | 1 |
| `deletedWorkspaceOwnedBy(userId: string, wsId: string)` | sync | 2 |
| `restoreWorkspace(userId: string, wsId: string)` | async | 2 |
| `setMemberRole(pp: PolicyPrincipal, userId: string, role: WsRole)` | async | 3 |
| `removeMember(pp: PolicyPrincipal, userId: string, { deleteSessions = false }: { deleteSessions?: boolean } = {})` | async | 2 |
| `auditTrail(pp: PolicyPrincipal)` | sync | 1 |
| `createInvite(pp: PolicyPrincipal, email: string, role: WsRole, team: { id: string \| null; role: PodRole \| null } = { id: null, role: null })` | async | 3 |
| `listInvites(pp: PolicyPrincipal)` | sync | 1 |
| `deleteInvite(pp: PolicyPrincipal, inviteId: string)` | async | 2 |
| `previewInvite(token: string, user: { id: string; email: string })` | sync | 2 |
| `acceptInvite(token: string, user: { id: string; email: string }, emailVerified: boolean, deviceIds: string[] = [], requireRecent: () => void = () => undefined)` | async | 3 |
| `createTeam(pp: PolicyPrincipal, name: string)` | async | 2 |
| `setTeamMember(pp: PolicyPrincipal, podId: string, userId: string, role: PodRole)` | async | 4 |
| `removeTeamMember(pp: PolicyPrincipal, podId: string, userId: string)` | async | 3 |
| `memberName(userId: string)` | sync | 1 |
| `nameTo(userId: string, reader: string)` | sync | 2 |


## Remaining exact constructed refusals

An update without either field throws the supplied bad request with `Send name or steering`. Restoring a live workspace throws the supplied conflict with code `not_deleted` and message `This workspace is not deleted, so there is nothing to restore.` All other fixed constructor strings appear above. Missing errors come from the supplied zero-argument `notFound`, whose returned value is thrown unchanged.


# Exact workspace records, service arguments and effects

These are public behavioral and physical binding contracts. They contain no reference implementation or private expected observations. Preserve the given keys and supplied-service argument positions literally. Use caller-owned values directly, including property getters, without renaming fields or inserting a normalization layer.

## Caller and decision records

The web caller has `kind`, `user` and top-level `emailVerified`. Its `user` has `id` and `email`. Verification is read from `p.emailVerified`. A device caller additionally has a `grants` Set. Policy principals have exactly `userId`, `wsId`, `wsRole` and `pods`, with `pods` a Map from team identity to team role. The Map property is named `pods`. Every team-role lookup uses `pp.pods`, and new principals return that same property name. Workspace roles are owner/member/viewer and team roles lead/member; supplied values keep their native behavior without extra validation.

The default workspace policy object is `{kind: "workspace"}`. Explicit team authorization objects are `{kind: "pod", podId}`. The key is `podId`. Call `authorize(principal, action, object)` with three arguments and use the returned decision's `ok`, then its `status`, `code` and `message` only on refusal. Use `new V2Error(status, code, message)` for that refusal.

`createWorkspace` caches `userId = p.user.id` once before throttling. Build a single creator record `{id: userId, email: p.user.email, emailVerified: p.emailVerified}` after throttling. Call `precheckCreation(req, creator, code)` with exactly three arguments and await it. Later call `admitCreation(creator, code, newWorkspaceId)` with exactly three arguments inside the transaction. Capture that call's returned value as the redemption decision. A truthy returned value emits `code_redeemed`; code-argument truthiness does not decide redemption. Workspace insertion, membership insertion, audit and creation events use the cached user identity.

## Complete external service calls

| Service | Exact arguments and result use |
| --- | --- |
| `all`, `get`, `run` | The SQL string and ordered bindings from the physical storage table. No extra trailing arguments. |
| `LIVE_WS` | One column expression, exactly `ws_id` or `?` at the specified call site. Interpolate its result at operation time. |
| `audit` | Workspace identity, actor identity, action, object identity, timestamp. Exactly five arguments. |
| `tx` | One synchronous zero-argument callback; await the outer result. Callback bodies return undefined except update returns its steering-service result, invite withdrawal returns its affected-row count and team-member removal returns its affected-row count. Soft deletion uses an expression callback whose return is the exact delegated soft-delete result; its outer asynchronous public operation still completes with undefined. Invite acceptance stores granted devices outside the callback; it does not return them from the callback or derive them from the transaction's return. |
| `softDeleteWorkspace` | Same captured SQL handle, current workspace, current actor, timestamp. |
| `precheckCreation` | Original request, same creator object, original code. Await completion. |
| `admitCreation` | Same creator object, original code, allocated workspace. Use its return for redemption-event truthiness. |
| `checkMemberCap` | Current workspace and true for invitation creation, including its locked recheck; selected invite workspace and false for acceptance. |
| `checkRestoreCaps` | Restoring person's identity only, before and inside the transaction. |
| `newId` | Exactly one prefix: `ws`, `inv` or `pod` for the corresponding allocation. |
| `nowIso` | No arguments, at the specified operation point. |
| `secretToken` | Exactly the number 32. Preserve its returned token value. |
| `sha256hex` | Original token only. Do not pre-coerce or change it. |
| `authorize` | Original policy principal, exact action string, exact policy object. |
| `config` | No arguments. Read its current `hosted` field only at the acceptance check. |
| `event` | Exact event name and one record from the table below. |
| `take` | Literal composed key, numeric maximum, numeric window. Creation uses ten per 3,600,000 milliseconds and invitations fifty per 3,600,000 milliseconds. |
| `addWorkspaceToDevices` | User identity, selected invite workspace, original device-id array, timestamp. Call even for an empty array and preserve its returned array reference. |
| `liveDevicesOf` | User identity only, and only on matching invite email. |
| `deleteMemberSessions` | Current workspace and removed user. Its truthy return decides the extra audit. |
| `onMemberRemoved` | Current workspace and removed user. |
| `cancelDeparture` | Selected invite workspace and joining user. |
| `noteDeparture` | Current workspace, removed user, timestamp. |
| `personName` | User identity and queried optional name, in that order. |
| `workspaceSteering` | Current workspace only. |
| `writeSteering` | Original policy principal object, fresh body steering value, timestamp. Exactly three arguments. |
| `oneLine` | Original body, literal `name`, numeric 100. |
| `readDate` | No arguments, once for every separately specified Date identifier evaluation. |

## Event records

Each listed record contains only its listed fields. Preserve field evaluation in the given order.

| Site | Event name | Record |
| --- | --- | --- |
| Truthy creation admission result | `code_redeemed` | `{ws: allocatedWorkspaceId, user: cachedUserId, at}` |
| Workspace creation | `workspace_created` | `{ws: allocatedWorkspaceId, user: cachedUserId, props: {kind: seed ? "sample" : "blank"}, at}` |
| Invitation creation | `invite_sent` | `{ws: pp.wsId, user: pp.userId, props: {role}, at}` |
| Invitation acceptance | `invite_accepted` | `{ws: invite.ws_id, user: user.id, props: {role: invite.role}, at}` |
| Accepted member count at least two | `second_member_joined` | `{ws: invite.ws_id, user: user.id, at}` |

The workspace and user fields are `ws` and `user`. Every event above includes `at`. Each operation calls the event service at its existing transaction point; the supplied event service owns deduplication.

## Audit records

Every audit uses the workspace identity, current actor and its operation timestamp. The following action and object fields are exact.

| Operation | Action | Object identity |
| --- | --- | --- |
| Create workspace | `workspace.created` | Allocated workspace |
| Rename workspace | `workspace.renamed` | Current workspace |
| Restore workspace | `workspace.restored` | Restored workspace |
| Set workspace member role | `member.role_changed` | Target user |
| Self-departure | `member.left` | Departing user |
| Remove someone else | `member.removed` | Removed user |
| Truthy session deletion | `member.sessions_deleted` | Removed user |
| Create invitation | `invite.created` | Allocated invite |
| Withdraw invitation | `invite.withdrawn` | Requested invite |
| Accept invitation | `invite.accepted` | Selected invite |
| Create team | `team.created` | Allocated team |
| Set team member | `team.member_set` | Team identity, not the user identity |
| Remove team member | `team.member_removed` | Team identity, not the user identity |

Stored historical `pod.` actions are renamed only when projecting the audit trail. New team mutations write the listed `team.` actions. Delete delegates to the supplied soft-delete service and adds no separate audit in this factory.

## Token, invitation and projection details

Both unused-token lookup and prior-acceptance lookup use `/^[A-Za-z0-9_-]{43}$/`. Native regex testing preserves its coercion behavior. Hash only after that check. Invitation email validation uses `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` on the original trim-then-lowercase result.

Invitation creation returns exactly `{id, email: normalizedEmail, role, team_id: capturedTeamId, team_role: capturedTeamRole, path: "/app/invite/" + token, token}`. The public link field is `path`. It has no `link` field. Native interpolation preserves the current unescaped token behavior.

Preview returns exactly `workspace`, `role`, `team`, `team_role`, `email_matches`, `invited_email` and `devices`. The invited address key is `invited_email`. `team_role` is the selected invite role only when an actual team row was found, otherwise null. `team` is the actual selected team row reference or null. Compare `invite.email` to `user.email.toLowerCase()` with the invite email read first. Fetch workspace, then optional team, then build the return fields and optional device projection. Keep repeated caller and row property reads at their existing construction points.

`deletedWorkspaceOwnedBy` returns a fresh two-field `{id, name}` projection after eligibility checks. It does not return the original row or include its deletion timestamp. `updateWorkspace` directly reads `.name` on the final stored-name row; a missing row retains the native property-access failure. Do not add an optional fallback.

The membership helper reads the queried optional role. It refuses when that role is falsy, even if the query returned a truthy row object. Preserve the second role read in the transaction and the existing unchanged-role branch. For team membership, the separate workspace-member row is tested for truthiness before its role is inspected.

Invitation creation's viewer/lead refusal calls `forbidden("viewer_lead", message)`. Setting a viewer as team lead also calls `forbidden("viewer_lead", message)`. The two owner-only team refusals call `forbidden("owner_only", message)`. Email mismatch and hosted unverified-email refusals construct `new V2Error(403, code, message)` directly, without calling the supplied forbidden factory. Preserve the same error identity and effect trace. Prior acceptance constructs the direct 409 `V2Error` with workspace detail. Existing-member refusals use the supplied conflict factory.


## Closed public result shapes

The following types describe the exact returned data fields. `PolicyPrincipal` uses the four keys and `pods` Map defined above. `Steering` is the current host-owned off/on type. These are interface descriptions; preserve the native operations and getter order specified above without adding validation or coercion.

- `principalIn` returns `PolicyPrincipal`.
- `memberPrincipal` returns `PolicyPrincipal`.
- `need` returns `void`.
- `enter` returns `PolicyPrincipal`.
- `workspacesFor` returns `{ teams: { id: string; name: string; role: PodRole; }[]; id: string; name: string; role: WsRole; }[]`.
- `otherWorkspacesFor` returns `{ id: string; name: string; }[]`.
- `createWorkspace` returns `Promise<{ id: string; name: string; role: "owner"; }>`.
- `workspaceDetail` returns `{ workspace: { id: string; name: string; created_at: string; steering: "off" | "on"; }; role: WsRole | null; me: string; members: { id: string; name: string; email: string; role: WsRole; }[]; teams: { my_role: PodRole | null; members: { id: string; name: string; role: PodRole; }[]; id: string; name: string; }[]; }`.
- `updateWorkspace` returns `Promise<{ id: string; name: string; steering: Steering; }>`.
- `deleteWorkspace` returns `Promise<void>`.
- `deletedWorkspacesFor` returns `{ restore_until: string; id: string; name: string; deleted_at: string; }[]`.
- `deletedWorkspaceOwnedBy` returns `{ id: string; name: string; }`.
- `restoreWorkspace` returns `Promise<{ id: string; name: string; role: "owner"; }>`.
- `setMemberRole` returns `Promise<{ user_id: string; role: WsRole; }>`.
- `removeMember` returns `Promise<void>`.
- `auditTrail` returns `{ at: string; actor: { id: string; name: string; } | null; action: string; object_id: string | null; }[]`.
- `createInvite` returns `Promise<{ id: string; email: string; role: WsRole; team_id: string | null; team_role: PodRole | null; path: string; token: string; }>`.
- `listInvites` returns `{ team: { id: string; name: string; } | null; id: string; email: string; role: WsRole; team_id: string | null; team_role: PodRole | null; created_at: string; expires_at: string; accepted_at: string | null; }[]`.
- `deleteInvite` returns `Promise<void>`.
- `previewInvite` returns `{ workspace: { id: string; name: string; }; role: WsRole; team: { id: string; name: string; } | null; team_role: PodRole | null; email_matches: boolean; invited_email: string; devices: { id: string; name: string; last_seen_at: string; }[]; }`.
- `acceptInvite` returns `Promise<{ workspace_id: string; role: WsRole; team_id: string | null; device_ids: string[]; }>`.
- `createTeam` returns `Promise<{ id: string; name: string; }>`.
- `setTeamMember` returns `Promise<{ team_id: string; user_id: string; role: PodRole; }>`.
- `removeTeamMember` returns `Promise<void>`.
- `memberName` returns `string`.
- `nameTo` returns `string`.


## Conditional field-read order

Each workspace membership lookup extracts its optional role once. Use that scalar for the presence check, unchanged-role check and last-owner decision. Do not return the membership row to those decisions and reread its role separately for each condition. The second lookup inside the transaction obtains a new scalar. A missing or falsy queried role invokes the supplied missing error at that point.

For setting a team member, query the current team membership first. Check whether the requested role is lead before reading the current optional role. A requested lead skips that optional-role read. If either condition selects lead protection, read workspace role to decide ownership. Only after that protection passes, query workspace membership and apply the separate viewer/lead refusal.

For removing a team member, read the current optional team role first. Only a lead reads the caller workspace role for protection. Only a non-owner then reads caller identity for comparison with the target user. Refuse only when that final comparison selects another person. Preserve this short-circuit order even for a self-removal.

The prior-acceptance refusal depends on the accepted-invite row and a truthy live-membership query result. Its workspace identity is used in the query and then reread for error detail. A falsy workspace-identity value does not introduce an extra exemption from that refusal.


## Guard argument evaluation before calling helpers

In both workspace role change and member removal, first compare the captured current-role scalar to owner. Only an owner condition reads `pp.wsId` for the owner-count helper's argument. A non-owner skips that workspace-field read entirely at this protection step. Evaluate the guard before a helper call's arguments. An unconditional call such as passing the workspace field into a helper that later skips its lookup would still add an observable field read and is outside this contract. The next update or cleanup call performs its own fresh workspace-field read.

After a successful workspace-member lookup in `setTeamMember`, evaluate the requested role against lead first. Only a requested lead reads the workspace-member row's role for the viewer comparison. A non-lead skips that row field, even if the field has a throwing getter. This is separate from the earlier current-team-role ownership condition.

`deleteWorkspace` supplies a synchronous expression callback to the transaction. That callback returns the supplied soft-delete service's exact return value and reference. The operation awaits the outer transaction and then completes with undefined. A block callback that discards the delegated return changes the transaction callback contract.

Invite acceptance starts with its own new empty granted-device array before entering the transaction. The device-grant call within that callback replaces the local array with its exact returned reference. The transaction callback itself returns undefined; the outer transaction's resolved value does not replace the granted-device array.


#### Scenario: Complete corrected workspace membership invitation and team surface

- **WHEN** the Node workspace target is selected
- **THEN** Capture all 37 ordered resources once, expose all 26 declared operations, preserve all specified SQL bindings and caller-observable reads, failures and transactions, and enforce the accepted locked invitation-cap recheck.
