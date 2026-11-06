---
name: Goals, alignments and change requests
summary: Company and team goals with immutable versions, owners, teams, visibility, dependencies and target shares of agent time; approval sets; typed requests to a goal's agents and goal holds; alignments that make goals and sessions contribute to a goal with every affected goal's consent; change requests that let a member propose a new version of someone else's goal, with advisory evidence (typed links and an Align snapshot per revision), "Accept if…" conditions the requester acknowledges, and a launch step that releases an approved change to agents; reallocations that change the target shares of several goals at once, approved and launched the same way; and the Northstar sample workspace.
kind: area
---

# Goals, alignments and change requests

This part specifies Align's core domain inside a workspace (`ws_…`): goals and their immutable versions, the
goal tree (parents through approved alignments, dependencies through `depends_on`), the approval set that may
consent on a goal's behalf, alignment requests, change requests, and the Northstar sample workspace that any
signed-in person can create to see these flows.

Evidence on change requests is advisory. Each revision carries a snapshot that Align records itself, and the
requester and approvers can attach typed links, each labelled by who reported it. Approving without evidence is
allowed and recorded. Align never marks a link verified; checking CI results against their source (for example
GitHub check runs) is later work, not part of this contract.

Approving and launching are two decisions (founder ruling LIM-2454 33ad545d, owner answers 2026-10-31). Approving a
change request records the decision and keeps the resulting version approved but unlaunched, stored on the request;
the goal, its versions and what agents read stay at the last launched version. **Launch** publishes it, through the
same write path as an owner's new version, and only then do bound and governed sessions get it. **Not yet** records
that the change waits, and a later launch or not yet replaces it. A person who may both approve and launch can do both
in one step. An approved change that the goal outruns before launch (a newer version, or the goal achieved or
dropped) is superseded before launch: it never reaches agents, and the requester can propose again. Proposed is not
approved, approved is not launched, and launched (a version delivered to agents) is not an observed outcome: Align
records delivery receipts, never that an agent did anything.

A goal's **target share** is the share of the workspace's shared agent time it should get (main #29, "agent time
follows priorities"). It is versioned goal content like a goal's measures: its owner sets it in a version, and anyone
else proposes a change through a **reallocation**, which can move target shares between several goals at once. Each
goal in a reallocation is approved by its own approval set and the whole reallocation is launched like a change
request, so agents hear a new target only in a launched version. Where #29 had every affected owner approve and the new
targets apply at once, this part keeps the v2 rules: approval sets with the requester rule, and approve is not launch.
How actual agent time is counted against targets, and the steering switch, are in `workspaces`; the steering line an
agent shows is in `local-agent`.

A counter may carry an "Accept if…" condition (ruling LIM-2454 35376283). The requester acknowledges it as a step of
its own, separate from accepting the counter; the acknowledgement records who and when, never gates approval or
launch, and is never called verified.

Every route here is under `/api/v2/workspaces/{ws}` and follows the common rules of the `workspaces` part:
a browser session cookie (or, where stated, a device token), same-origin writes, JSON bodies, error bodies
`{error:<code>, message}`, 404 for anything the caller may not see, and 403 with a code for a visible action
the caller's role does not allow (a viewer always gets 403 `read_only` for a change). Workspaces, members,
roles, teams and invites are specified in `workspaces`; directives delivered to running agents in
`directives`; the MCP tools that read goals and decision records in `mcp`; the pages under `/app` in
`interface`. Storage keeps the name `pod` for teams (`pod_id`, visibility value `pod`); everything a person
or agent sees says "team".

## Vocabulary

| Term | Meaning in code |
| --- | --- |
| Goal | A row of `v2_goals` (`g_…`) with its current content; every version, including the first, is also a row of `v2_goal_versions` with a content hash |
| Level | `company` or `team` (default `team`); fixed at creation |
| Goal owner | The one accountable person, `owner_id` |
| Owning team | The optional team of a goal, `team_id` on the wire, `pod_id` in storage; fixed at creation |
| Visibility | `private`, `team` (stored `pod`) or `workspace`; fixed at creation |
| Status | `active`, `achieved` or `dropped`. There is no separate archived status |
| Parent | A goal this goal contributes to: the target of an approved alignment whose source is this goal (`contributes_to`) |
| Dependency | A goal whose output this goal consumes (`depends_on`, at most 5) |
| Limit | Goal content (`limits`, at most 5 per version): `{id: "lim_…", type: must\|must_not\|out_of_scope, text, source:{kind: meeting\|manual, title, date}\|null}`, what work toward the goal must do, must not do, or leaves out of scope. It names no person: who confirmed it is the author of the version that carries it |
| Limit suggestion | A rule-shaped sentence of pasted notes matched to a goal by `POST …/limits/suggest`; stored nowhere until it becomes part of a version |
| Approval set | The people any one of whom may approve on a goal's behalf: its owner, its owning team's leads, and for a company goal every workspace owner |
| Alignment | A request (`al_…`) to link a source goal or chosen sessions to a target goal, with revisions, approval requirements and effects |
| Approval requirement | `{for, set}` on an alignment revision: `for` is a goal id or `sessions:<user id>`, `set` the user ids any one of whom satisfies it |
| Change request | A proposed new version (`cr_…`) of a goal the requester does not own, decided by the goal's approval set |
| Decision record | A change request once it is `approved` or `rejected`, or `superseded` after its approval (superseded before launch) |
| Launch | The decision that publishes an approved change request's version to the goal and its agents; `launch` on a request is `pending` (approved, no launch decision yet), `not_yet`, `launched` or `superseded` (superseded before launch), and `null` before approval |
| Launch set | The people who may launch an approved change request: the goal's effective approval set for that request (owner, team leads and, on a company goal, workspace owners, after the requester rule) plus every workspace owner |
| Condition | An "Accept if…" text (1 to 2000 characters) an approver puts on a counter revision, separate from its note; the requester acknowledges it, which is never a verification |
| Evidence link | A typed link (`ev_…`: `pr`, `ci_run`, `incident`, `dashboard`, `doc` or `other`) on one change request revision, self-reported by a person or agent-reported by an agent; Align never marks one verified |
| Align snapshot | What the server recorded about the goal when a change request revision was written: its 30-day spend, bound sessions and last activity |
| Target share | `target_share` on a goal and on each version: a whole percent from 0 to 100, or `null` for no target. The share of the workspace's shared agent time the goal should get |
| Agent time | Fresh tokens of shared usage: input + output + cache writes (5-minute, 1-hour and unsplit), for every model, priced or not; cache reads are left out |
| Reallocation | A proposal (`rl_…`) to change the target shares of one or more goals at once, approved per goal by its approval set and then launched |
| Sample workspace | "Northstar (sample)", ordinary data created by `POST /api/v2/workspaces/sample` |

## Alignment state model

```mermaid
stateDiagram-v2
    [*] --> pending: POST alignments (requester)
    [*] --> approved: POST alignments, every requirement met by the requester
    pending --> approved: approve (last requirement met)
    pending --> countered: counter (approver)
    countered --> pending: accept_counter (requester)
    countered --> approved: accept_counter, every requirement met
    pending --> rejected: reject (approver)
    countered --> rejected: reject (approver)
    pending --> withdrawn: withdraw (requester)
    countered --> withdrawn: withdraw (requester)
    approved --> revoked: revoke (requester or approver)
```

## Change request state model

```mermaid
stateDiagram-v2
    [*] --> pending: POST change-requests (requester)
    pending --> countered: counter (approver)
    countered --> pending: accept_counter (requester)
    pending --> pending: rebase (requester)
    pending --> approved: approve or approve_and_launch (approver)
    approved --> superseded: newer goal version, or goal achieved or dropped, before launch
    pending --> rejected: reject (approver)
    countered --> rejected: reject (approver)
    pending --> withdrawn: withdraw (requester)
    countered --> withdrawn: withdraw (requester)
    pending --> superseded: goal achieved or dropped
    countered --> superseded: goal achieved or dropped
```

The launch of an approved request (`launch` on the request; `null` until it is approved):

```mermaid
stateDiagram-v2
    [*] --> pending: approve
    [*] --> launched: approve_and_launch
    pending --> not_yet: not_yet (launch set)
    pending --> launched: launch (launch set)
    not_yet --> launched: launch (launch set)
    pending --> superseded: newer goal version, or goal achieved or dropped
    not_yet --> superseded: newer goal version, or goal achieved or dropped
```

## Reallocation state model

```mermaid
stateDiagram-v2
    [*] --> pending: POST reallocations (requester)
    [*] --> approved: POST reallocations, every goal the requester's own
    pending --> approved: approve (the last goal approved)
    pending --> countered: counter (approver)
    countered --> pending: accept_counter (requester)
    countered --> approved: accept_counter, every goal approved
    pending --> rejected: reject (approver)
    countered --> rejected: reject (approver)
    pending --> withdrawn: withdraw (requester)
    countered --> withdrawn: withdraw (requester)
    pending --> superseded: a newer version of one of its goals
    countered --> superseded: a newer version of one of its goals
    approved --> superseded: a newer version of one of its goals, before launch
```

Its `launch` follows the change request's launch states (`pending`, `not_yet`, `launched`, `superseded`; `null` until
approved).

### Requirement: Creating a company or team goal

The server SHALL create a goal on `POST /api/v2/workspaces/{ws}/goals` (browser session; workspace owners and members, viewers 403 `read_only`) from `{title, level?, team_id?, visibility?, measures?, anchors?, depends_on?, limits?, target_share?}`, owned by the caller, at version 1 with status `active`, responding 201 with the goal. `level` SHALL default to `team`; only a workspace owner may create a `company` goal (403 `owner_only` otherwise), and a company goal SHALL have no team (400 when `team_id` is sent) and visibility `workspace` (400 when another `visibility` is sent). A team goal's `visibility` SHALL default to `workspace`; a goal with visibility `team` SHALL name a team (400 otherwise), an unknown `team_id` SHALL be 404, and naming a team the caller is not in SHALL be 403 `not_in_team`. A workspace already holding 1,000 goals SHALL answer 409 `too_many_goals`. Creating a goal SHALL write audit action `goal.created` with the caller as actor. Level, owning team and visibility never change after creation.

#### Scenario: Owner creates a company goal

- **WHEN** a workspace owner POSTs `{title:"Expand to regulated customers", level:"company"}`
- **THEN** the response is 201 with `level: "company"`, `team: null`, `visibility: "workspace"`, `version: 1`, `status: "active"` and `owner` naming the caller

#### Scenario: Member cannot create a company goal

- **WHEN** a member POSTs `{title:"…", level:"company"}`
- **THEN** the response is 403 `owner_only` and no goal is created

#### Scenario: Company goal with a team

- **WHEN** a workspace owner POSTs `{title:"…", level:"company", team_id:"<team>"}` or `{title:"…", level:"company", visibility:"private"}`
- **THEN** the response is 400 and no goal is created

#### Scenario: Team goal in a team the caller is not in

- **WHEN** a member POSTs `{title:"…", visibility:"team", team_id:"<a team they are not in>"}`
- **THEN** the response is 403 `not_in_team`; the same body without `team_id` is 400

### Requirement: Goal content validation

The server SHALL validate goal content the same way on creation, on a new version and in a change request: `title` 1 to 300 characters after trimming; `measures` a list of at most 10 objects with `text` (1 to 300 characters) and optional `target` (at most 100), each keeping a sent `id` only when the previous version had a measure with that id (otherwise a new `m_…` id); `anchors` an object of `repos`, `branch_patterns` and `issues` lists of at most 20 strings of at most 200 characters each, trimmed and de-duplicated; `depends_on` a list of at most 5 goal ids, none equal to the goal itself (on a new version or a change request, the previous version's dependencies the caller may not read are kept whatever the caller sends, and count toward the 5); `status` one of `active`, `achieved`, `dropped`; and `limits` a list of at most 5 objects with `type` one of `must`, `must_not`, `out_of_scope`, `text` (1 to 160 characters after control characters become spaces and runs of spaces one), and optional `source` (null, or `{kind: meeting|manual, title: at most 120 characters, date: YYYY-MM-DD}`), each keeping a sent `id` only when the previous version had a limit with that id, else reusing the id of a previous limit it repeats word for word (type, text and source), else a new `lim_<12 base32>` id. A `target_share` SHALL be a whole number from 0 to 100 or `null` (no target; on a new version, an absent `target_share` keeps the current one). Too many dependencies SHALL be 400 `too_many_dependencies` in words (see "Too many dependencies" below), and the goal forms SHALL not let a person tick more. Any other violation SHALL be 400 naming the field (`limits: at most 5`, `limits[i].text`, `limits[i].type`, `limits[i].source.date`, `target_share must be a whole percent from 0 to 100, or null`), and a `depends_on` id that does not exist or that the caller may not read SHALL be 404.

#### Scenario: Too many dependencies

- **WHEN** a goal is created, or a new version saved, with six ids in `depends_on`; and five goals the owner can see are sent while one they can't see is kept (`scripts/test-v2.mjs` "c13 W4 (E2E-WEB cycle 13): ..." and "B1: ...")
- **THEN** the response is 400 `too_many_dependencies` "A goal can depend on at most 5 other goals; choose fewer.", and for the second "A goal can depend on at most 5 other goals, and 1 goal you can't see stays on its list; choose fewer.", never the field's name

#### Scenario: The goal forms stop at five dependencies

- **WHEN** a goal's owner ticks five goals under Depends on in the New version form (the same holds for the propose and counter forms, counting the dependencies the person can't see) (`scripts/test-v2.mjs` "c13 W4 (E2E-WEB cycle 13): ...")
- **THEN** every other goal's box is disabled and the form says "A goal can depend on at most 5 other goals. Untick one to choose another." (with "(1 of them a goal you can't see, which stays)" when one is hidden), before anything is sent

#### Scenario: Dependency on a hidden goal

- **WHEN** `depends_on` names another person's `private` goal
- **THEN** the response is 404 and nothing is written

#### Scenario: Dependencies the editor can't see are kept

- **WHEN** a goal depends on a goal its owner can read and on another person's `private` goal its owner can't, and the owner saves a new version through the goal form, which sends only the dependency they can see (or none)
- **THEN** the new version still depends on the private goal; the owner's goal page lists "a goal you can't see" under Depends on, and the form says saving keeps it

#### Scenario: Limit ids

- **WHEN** the owner saves a version sending the previous version's limit with its id and a new limit with an id the goal never had
- **THEN** the first keeps its id and the second gets a new `lim_…` id; six limits, a 161-character text, an unknown type or a date like `2026-13-01` are 400

### Requirement: Invisible characters in people's text

The server SHALL clean every free-text field a person or device sends (a change request's `reason`, a decision's
`note`, `reason` and `condition`, goal titles, measures, limits and anchors, request notes, target-change notes and
reasons, alignment notes, evidence labels, ask texts and titles, value notes, access-request fields, session titles and
repository aliases, passkey names) as names are cleaned (`workspaces` "Device pairing flow"), with one rule
(`lib/v2/text-core.mts`): control characters (Unicode category Cc: C0, DEL and C1 U+0080 to U+009F, E2E-WEB cycle 14
C14-1), invisible format characters (Unicode category Cf, emoji sequences kept whole) and lone surrogates dropped, the
blank fillers (U+115F, U+1160, U+3164, U+FFA0, U+2800) made spaces and the ends trimmed, keeping tabs and line breaks
(a carriage return as a line feed) where the field allows them; a one-line field makes control characters spaces. A
required field with nothing left, or nothing but combining marks and spaces, SHALL be 400 `<field> is required`, and
an optional one SHALL be stored as absent (null), never as empty text a reader sees as a blank reason (E2E-WEB cycle 13
W3). The MCP tools SHALL drop control characters from the people's text they return, text stored before this rule
included. The web forms SHALL treat such text as empty too, as they treat spaces, with the same rule (`isBlankText`):
a measure or limit row of it is left out, and a required field of it (a title, a reason, the request-access name and
use case) stops the form before sending; a passkey name of it is no name (E2E-WEB cycle 14 C14-2).

#### Scenario: A decline reason of zero-width spaces

- **WHEN** an approver declines a change request with the reason U+200B U+200B (or U+2060, U+FE0F, U+3164, an accent and a joiner with spaces), counters with the condition U+200B or the note U+2060 U+200B, and an owner creates a goal titled U+200B U+FE0F, or with a measure U+3164 or a limit of two U+200B (`scripts/test-v2.mjs` "c13 W3 (E2E-WEB cycle 13): ...")
- **THEN** each is 400 `reason is required`, `condition is required`, `note is required`, `title is required`, `text is required` or `limits[0].text is required`, and the request stays `pending` at revision 1

#### Scenario: A decline reason of a DEL

- **WHEN** a goal title, a measure, a change request's reason or a decline reason is only control characters (U+007F, U+0001 U+0002, U+0007, U+0085, U+0080 U+009F, or U+0000 U+001B U+009B with spaces), and a goal title, measure, target, reason, session title, repository alias or request note has them inside (`scripts/test-v2.mjs` "c14 C14-1 (E2E-WEB cycle 14): ...")
- **THEN** the first are 400 `title is required`, `text is required` or `reason is required` and nothing is recorded; in the others the control characters are dropped ("Needs review" with its line break kept), and a session title or request note of only them is stored as none; MCP returns a goal title stored with them before this rule without them

#### Scenario: Forms treat invisible text as blank

- **WHEN** a person creates a goal with a measure of U+200B U+2060, saves a new version with such a measure and limit beside a real measure, or fills the request-access name or use case with it (`scripts/test-v2.mjs` "c14 C14-2 (ui, E2E-WEB cycle 14): ...")
- **THEN** the goal is created without the measure, the version is saved with only the real measure and no limit, and **Send request** stays disabled; no form shows "text is required"

### Requirement: Who reads a goal

The server SHALL let a goal's owner always read it, and otherwise decide by visibility: a `private` goal is read by its owner only (workspace owners do not read another person's private goals); a `team` goal by the members and leads of its owning team and by workspace owners; a `workspace` goal (every company goal) by every workspace member, viewers included. A goal the caller may not read SHALL be answered 404 `not_found` on every route, and SHALL be left out of, or unnamed in, every list and view that would otherwise mention it.

#### Scenario: Team goal of another team

- **WHEN** a member who is not in team Security requests a `team` goal owned by team Security
- **THEN** the server responds 404 `not_found`

#### Scenario: Company goal read by a viewer

- **WHEN** a viewer requests the goals feed
- **THEN** every company goal of the workspace is in it

### Requirement: Goals feed with ETag

The server SHALL serve the goals the caller may read on `GET /api/v2/workspaces/{ws}/goals` (device token with a grant for the workspace, or browser session) as `{version, goals, steering}`, oldest first, where `steering` is the workspace's steering switch (`off` or `on`, see `workspaces`) and `version` is the first 16 hex characters of the sha256 of the serialized goals and switch together, also sent as a quoted `ETag` with `cache-control: private, no-cache`, and SHALL answer 304 with no body when `If-None-Match` matches it (or is `*`). Each goal SHALL be `{id, version, title, measures, status, level, visibility, owner:{id,name}, team:{id,name}|null, anchors, depends_on, limits, target_share, bindable, contributes_to, allocation}`, where `limits` is the current version's limits (`[]` when it has none) and is read by whoever reads the goal, where `visibility` shows `team` for a stored `pod` and `depends_on` lists only goals the caller may read, and where `allocation` is, for an `active` goal, `{target_share, share_7d, gap_7d, held}`: the goal's share of the workspace's agent time over the trailing 7 days (counted as the `workspaces` part's allocation report counts it) as a whole percent, and its gap to the target to one decimal, the allocation report's `gap` for that window (share to one decimal minus target), never the rounded share minus the target, so steering acts at 10 points or more exactly where the Spend tab's pill turns amber (39.6% of a 30% target is `share_7d` 40, `gap_7d` 9.6: no steering line), `gap_7d` `null` without a target or without any shared usage in the window, and `held` true while the goal is on hold; `allocation` is `null` for a goal that is not active. Because shares are whole percents and gaps tenths, usage changes the feed's `version` only when a share moves a full point or a gap a tenth of one. A goal's current version is its last launched (or owner-saved) version: an approved but unlaunched change request SHALL change neither the feed's goals nor its `version`.

#### Scenario: Approval leaves the feed alone

- **WHEN** an approver approves a change request on a goal and nobody launches it
- **THEN** the feed returns the same goals and the same `ETag` as before, and an `If-None-Match` with the earlier `ETag` still answers 304; after the launch the goal has the new version and the `ETag` changes

#### Scenario: Conditional feed

- **WHEN** a client sends `If-None-Match` equal to the current feed `ETag`
- **THEN** the server responds 304 with no body

#### Scenario: Allocation in the feed

- **WHEN** a goal with target 20 had 6,000 of the workspace's 10,000 fresh tokens in the last 7 days, and one more token is uploaded
- **THEN** its `allocation` is `{target_share: 20, share_7d: 60, gap_7d: 40, held: false}`, a goal with no target has `gap_7d: null`, and the feed still answers 304 to the earlier `ETag`; turning steering on, or holding the goal, gives the feed a new `version`

#### Scenario: Team naming on the wire

- **WHEN** a member reads a goal created with `visibility: "team"` for team Product
- **THEN** the goal has `visibility: "team"` and `team: {id, name: "Product"}`, and has no `pod` key

### Requirement: Immutable goal versions

The server SHALL record each change to a goal as a new immutable version on `POST /api/v2/workspaces/{ws}/goals/{goal}/versions` (browser session) from `{version?, title?, measures?, anchors?, depends_on?, status?, limits?, target_share?}`, accepted only from the goal's owner (403 `not_goal_owner` for another reader, 403 `read_only` for a viewer, 404 for a goal the caller may not read). A sent `version` other than the current one, or a concurrent write, SHALL be 409 `stale_version`, and a body whose resulting content (title, measures, anchors, status, sorted `depends_on`, limits, target share) hashes the same as the current version SHALL be 409 `no_change`; `depends_on` and `limits` SHALL join the hash only when non-empty, and `target_share` only when it is not `null`, so a version without them hashes as it did before they existed. On success the server SHALL, in one transaction, raise the version by one, keep the previous versions unchanged, store the new version with its content hash and author, write audit action `goal.versioned`, record the goal as reviewed against its parents' current versions, and write one `goal_version` directive, carrying a snapshot of the goal with its `team`, `level`, `limits` and `target_share`, for every non-stopped session whose open epoch is bound to the goal or that the goal governs; the response is 201 with the goal.

#### Scenario: New version

- **WHEN** the owner POSTs `{version: 2, title: "Pass the security review by March"}` to a goal at version 2
- **THEN** the response is 201 with `version: 3`, version 2 is still listed unchanged on the goal's page, and every bound session gets a `goal_version` directive

#### Scenario: Stale or empty change

- **WHEN** the owner POSTs `{version: 1, …}` to a goal at version 3, or POSTs the current content again
- **THEN** the response is 409 `stale_version` or 409 `no_change` respectively, and no version or directive is written

#### Scenario: Adding a limit changes the hash

- **WHEN** a goal without limits gets a version that changes only its title, then one that adds a limit, then the same limits again without their ids
- **THEN** the first version's hash equals the hash of its title, measures, anchors and status alone, the second's differs, and the third is 409 `no_change`

#### Scenario: Someone else edits

- **WHEN** a member who can read the goal but does not own it POSTs a new version
- **THEN** the response is 403 `not_goal_owner`; they can propose a change request instead

### Requirement: Target shares add up to 100 or less

The server SHALL keep the target shares of a workspace's `active` goals, every visibility counted (private goals included), at 100 or less: creating a goal with a target, and writing any version (an owner's, or a launched change request or reallocation) that sets or raises an active goal's target or makes a goal with a target active again, SHALL be refused with 409 `targets_over_100` when the sum would pass 100, with a message that names only the resulting sum and what the other goals already take, never a goal. Lowering or clearing a target, and a goal that is achieved or dropped, SHALL free its share. Nothing is written on a refusal.

#### Scenario: A private goal's target counts

- **WHEN** a workspace's active goals hold targets 20, 30 and (a member's private goal) 20, and the workspace owner creates a company goal with target 40
- **THEN** the response is 409 `targets_over_100` saying the targets would add up to 110% with 70% already taken, naming no goal; the same goal with target 10 is created

### Requirement: Dependency cycles are refused

The server SHALL refuse with 409 `cycle` any write that would make a goal depend on itself through `depends_on` (directly or through other goals, whether or not the caller can read them): a new goal version, and the creation, counter, rebase or approval of a change request whose `depends_on` would close a cycle (a `rebase` that keeps the request's own changes excepted: see "A request that would now close a loop is not approved or launched"). The refusal message SHALL NOT name goals the caller may not read, and nothing SHALL be written.

#### Scenario: Two goals depending on each other

- **WHEN** goal A depends on goal B and B's owner saves a version of B with `depends_on: ["<A>"]`
- **THEN** the response is 409 `cycle` and B stays at its current version

### Requirement: A request that would now close a loop is not approved or launched

Two open change requests can each add the other's goal as a dependency: neither loops when it is made, but once one is launched the other would close a loop. The server SHALL decide the loop against the goal graph as it stands at decision time, and SHALL refuse with 409 `cycle` an `approve` or `approve_and_launch` of a pending request, on a goal still at its base version, whose `depends_on` would close a loop, and a `launch` of an approved, unlaunched request whose approved content would, with nothing written. The message SHALL name no goal: for a pending request "A goal this request adds as a dependency has since come to depend on this goal, so approving it would make a loop. Someone who decides on this goal can suggest a change without that dependency or decline it, and <requester> can withdraw it."; for an approved one "A goal this change adds as a dependency has since come to depend on this goal, so launching it would make a loop. It can launch once that loop is gone; a newer version of this goal supersedes it, and <requester> can propose the change again without that dependency.". The change-request read SHALL follow the same rule, decided by one shared check: `dependency_loop` SHALL hold that message for every reader (`null` when there is no loop), and `can.approve` and `can.approve_and_launch` (pending) or `can.launch` (approved) SHALL then be false for everyone (`counter`, `reject`, `withdraw` and `not_yet` are unaffected). Such a pending request SHALL stay open: it waits on its approval set to suggest a change without that dependency or decline it, so `waiting_on_me` is true for a decider who may counter it and the Home lists it with `next` `resolve_loop` (waiting on the approval set), and once a counter without the dependency is accepted it can be approved. Such an approved request waits on nobody: `waiting_on_me` is false and it is on no Home queue, its card says why instead of offering Launch, and it launches once the loop is gone or is superseded by the goal's next version.

A pending request whose goal has since moved past its base version (`behind`) SHALL be checked the same way, against the goal graph as it stands, so `dependency_loop` is set for it too, and it SHALL stay recoverable: it waits on its requester to update it first (Home `next` `rebase`, `waiting_on_me` false for its deciders until then), and a `rebase` that keeps the request's own changes (no `changes` sent) SHALL NOT be refused for the loop, since it adds nothing the request did not already ask; `can.rebase` stays true. The request then stands at the goal's version in the state above, waiting on its approval set to suggest a change without that dependency or decline it. A `rebase` that sends `changes` closing a loop is refused 409 `cycle` like a proposal. An "Accept if…" counter keeps the request's changes, so the app SHALL NOT offer it while `dependency_loop` is set (the server refuses it 409 `cycle`), and the **Suggest a change** form SHALL leave a dependency of the request that is in its `dependency_loops` unticked and unoffered, saying "The request's dependency on “<goal>” is left out: it already depends on this goal, so keeping it would make a loop."

#### Scenario: Two pending requests that each add the other goal

- **WHEN** a member proposes "Loop dashboard depends on Loop funnel" and "Loop funnel depends on Loop dashboard", and the goals' lead approves and launches the first (`scripts/test-v2.mjs` "C5-1: both requests are created ...")
- **THEN** both requests were created; the second reads `can.approve` and `can.approve_and_launch` false, `can.counter` true and `dependency_loop` set; its `approve` and `approve_and_launch` are 409 `cycle` and it stays `pending`; it is under the lead's "Waiting on you" (Home `next` `resolve_loop`); a counter without the dependency, once accepted, can be approved

#### Scenario: Two approved requests, one launched

- **WHEN** both requests were approved before either launched and the first is launched (`scripts/test-v2.mjs` "C5-1: two requests approved before either launched ...")
- **THEN** the second reads `can.launch` false, `can.not_yet` true, `waiting_on_me` false and `dependency_loop` set, its `launch` is 409 `cycle`, it is on nobody's Home queue, and its card shows "Nobody can launch this as it stands. …" with no Launch button

#### Scenario: A pending request that would loop, on a goal that moved on

- **WHEN** the second of two such pending requests would now loop and its goal's owner saves a new version of that goal, and its requester updates it (`scripts/test-v2.mjs` "C6-2: a pending request that would close a loop, on a goal that moved on ...")
- **THEN** before the update it reads `behind` true, `dependency_loop` set, the requester's `can.rebase` true and the deciders' `waiting_on_me` false, and the Home sends the requester to `rebase`; the `rebase {base_version}` keeping its changes succeeds (a higher revision at the new version), while one sending those changes is 409 `cycle`; afterwards it waits on its deciders (`resolve_loop`), and a counter without the dependency, once accepted, can be approved

### Requirement: The New version form offers no dependency loop

`GET /api/v2/workspaces/{ws}/goals/{goal}` SHALL include `version_loops`: for a reader who may save a version of the goal (`can_edit`), the ids of the goals they can read that already depend on it, directly or through other goals, so that saving one as a dependency would be refused 409 `cycle`; `null` for anyone else. The app's "New version" form SHALL leave them out of "Depends on" (a current dependency stays listed) and say, as the propose form does, "<n> goals aren't offered: they already depend on this goal, so adding them would make a loop." ("1 goal isn't offered: it already depends on this goal, so adding it would make a loop." for one). The server SHALL still refuse a loop.

#### Scenario: The owner's New version form

- **WHEN** "Ship arms" depends on "Grow trials", "Arms launch" depends on "Ship arms", and the owner of "Grow trials" opens its New version form (`scripts/test-v2.mjs` "X5: GET a goal gives its owner version_loops ...")
- **THEN** `version_loops` holds both, "Depends on" lists neither and says "2 goals aren't offered: they already depend on this goal, so adding them would make a loop."; a member who can't edit the goal reads `version_loops` `null`

### Requirement: Limits are confirmed only by a goal's approval set

The server SHALL make a limit part of a goal only through a saved goal version: one its owner saves (on creation or `POST …/versions`) or one written when a change request whose `changes` include `limits`, approved by a member of its approval set, is launched. A limit SHALL reach agents only inside that version's snapshot (the `directives` part), and nothing else (a suggestion, a pending or countered request, an approved request that is not launched) SHALL change a goal's limits. A request with `limits` is dismissed by rejecting or withdrawing it.

#### Scenario: Proposed by a member, approved by the team lead

- **WHEN** a member in no team proposes `changes:{limits:[…current, {type:"must", text:"Inference must stay inside the EU region"}]}` on a workspace goal of team Alpha and Alpha's lead approves it
- **THEN** the goal's next version carries the three limits, authored by the lead, and the bound sessions' `goal_version` directive snapshot has them in `limits`

#### Scenario: Confirmed limits wait for launch

- **WHEN** the lead approves that request and nobody launches it
- **THEN** the goal and its limits are unchanged and no directive is written; once someone in the launch set launches it, the new version carries the limits and the bound sessions get them

### Requirement: First limit event

The server SHALL record the product event `first_limit` (no props, actor the version's author) for a workspace in the transaction of the first goal version with at least one limit, whether created, saved by the owner or written by the launch of an approved change request; a limit seeded in the sample workspace SHALL record nothing.

#### Scenario: Several versions with limits

- **WHEN** a goal is created with a limit and later versions keep or add limits
- **THEN** the workspace has exactly one `first_limit` event

### Requirement: Suggesting limits from notes

The server SHALL accept `POST /api/v2/workspaces/{ws}/limits/suggest {notes, source:{title?, date}, prefer_goal_id?}` (browser session, same-origin, body at most 32 KB) from workspace owners and members (403 `read_only` for a viewer), with `notes` 1 to 20,000 characters, `source.title` at most 120 characters and `source.date` a real `YYYY-MM-DD` day (400 otherwise), and a `prefer_goal_id` the caller can read (404 otherwise). It SHALL split the notes into at most 200 sentences, keep only rule-shaped ones (4 to 45 words, not a question; "out of scope" phrasing is `out_of_scope`, "ensure", "make sure", "target" and "aim for" are `must`, then `must_not` and `must` wording; a plain "can't" does not count), and place each on the active goal the caller can read whose own words (title and measures, each word weighted by one over the number of goals using it) it uses most, with a score of at least 1; a tie goes to `prefer_goal_id` when it is one of the tied goals and is otherwise dropped, and when the notes are one sentence that matches no goal it goes to `prefer_goal_id` with source kind `manual`. It SHALL respond 200 `{suggestions:[{goal:{id,title,version}, can_edit, can_propose, limits:[{type, text, quote, source:{kind,title,date}, already}]}], dropped}`, where `text` is the sentence without a short heading ("Goal: …"), capitalised and at most 160 characters, `quote` the sentence at most 200, `already` the id of the goal's current limit sharing at least 0.6 of its key words (or null), `can_edit` true for the goal's owner and `can_propose` for anyone else, and `dropped` the rule-shaped sentences placed on no goal or repeating one already suggested. It SHALL store nothing, write no audit row and record no event, SHALL never name a goal the caller cannot read nor use its words, and SHALL allow 20 calls a minute per person and 120 an hour per workspace (429 `rate_limited`).

#### Scenario: Rule-shaped sentences only

- **WHEN** a member pastes "I can't find the GPU node logs.", "Ensure all three models don't fit on the GPU.", a question, a three-word and a 46-word sentence
- **THEN** only "Ensure all three models don't fit on the GPU." is suggested, as `must`, on the goal whose words include "GPU", with `already` naming that goal's limit "All three models must not fit on one GPU"

#### Scenario: Unreadable goal

- **WHEN** a sentence uses a word only another team's `team`-visible goal has
- **THEN** the sentence is dropped and the response names no part of that goal; nothing is stored

#### Scenario: Too many calls

- **WHEN** one person calls it 21 times within a minute
- **THEN** the 21st call is 429 `rate_limited`

### Requirement: One goal with its versions and contributions

The server SHALL serve one goal on `GET /api/v2/workspaces/{ws}/goals/{goal}` (browser session) as `{goal, versions, contributions, can_edit, can_propose, hidden_depends_on}`: `goal` as in the feed, `versions` every version newest first as `{version, title, status, content_hash, created_at}`, `contributions` the readable source goals of approved alignments targeting this goal as `{goal:{id, title}}`, `can_edit` true only for the goal's owner when not a viewer, `can_propose` true exactly when "Proposing a change request" would not refuse the reader for who they are or the goal's status: not the goal's owner, not a viewer, and the goal `active`, and `hidden_depends_on` the number of the goal's dependencies the reader may not read (never which; `goal.depends_on` lists only the readable ones). A goal the caller may not read SHALL be 404.

#### Scenario: Owner opens their goal

- **WHEN** the owner of a goal at version 3 opens it
- **THEN** the response has three `versions` (3, 2, 1), `can_edit: true` and `can_propose: false`; a member reading the same goal gets `can_edit: false` and `can_propose: true`, and a viewer gets both false

### Requirement: Parents come from approved alignments

The server SHALL derive a goal's parents only from approved alignments whose source is that goal, and SHALL report each readable parent in `contributes_to` as `{id, title, version, reviewed_version, stale}`, where `reviewed_version` is the parent version the child's owner last reviewed the child against (null if never) and `stale` is true while `reviewed_version` is null or below the parent's current version. Approving an alignment with a source goal SHALL record the source as reviewed against the target's version at approval; saving a new version of the child SHALL record it as reviewed against every parent's current version. A parent that is revoked stops being a parent.

#### Scenario: Parent changes

- **WHEN** a company goal gets a new version
- **THEN** each child's `contributes_to` entry for it shows `stale: true` with `reviewed_version` below `version`, until the child's owner reviews it or saves a new version of the child

### Requirement: Stale-parent review

The server SHALL let only a goal's owner confirm the goal still fits a parent's current version on `POST /api/v2/workspaces/{ws}/goals/{goal}/review {parent_id}` (browser session, body at most 4 KB), record the review against the parent's current version, write audit action `goal.parent_reviewed`, and respond with the goal. A goal the caller may not read, or a `parent_id` that is not a current parent, SHALL be 404; another reader SHALL get 403 `not_goal_owner` and a viewer 403 `read_only`.

#### Scenario: Owner confirms

- **WHEN** the owner of a child whose parent moved to version 4 POSTs `{parent_id}`
- **THEN** the response is the goal with that parent's `reviewed_version: 4` and `stale: false`

#### Scenario: Review refused

- **WHEN** a member who does not own the child POSTs `{parent_id}`, or the owner names a goal that is not its parent
- **THEN** the server responds 403 `not_goal_owner` or 404 respectively

### Requirement: Bindable goals

The server SHALL mark a goal `bindable` for the caller only when it is `active`, the caller is not a viewer, and the goal is the caller's own, belongs to a team the caller is in, or is the target of an approved `work_toward` alignment whose current revision lists one of the caller's sessions. Binding a session to a goal its owner may read but that is not their own, not their team's and not covered by such an alignment SHALL be refused with 403 `alignment_required`, and binding it to a goal that is not `active` with 409 `goal_not_active` (the epoch route is specified in `workspaces`).

#### Scenario: Teammate's goal

- **WHEN** a member of team Product reads an active goal owned by another member of team Product
- **THEN** the goal has `bindable: true`; a company goal owned by someone else has `bindable: false` until an approved `work_toward` alignment covers one of the caller's sessions

### Requirement: Approval set of a goal

The server SHALL compute a goal's approval set, at the time it is needed, as the goal's owner, every lead of the goal's owning team, and for a company goal every workspace owner, keeping only people who are current workspace members with role `owner` or `member`. Viewers and people who left or were removed SHALL never be in an approval set.

#### Scenario: Team goal

- **WHEN** the goal "Pass the security review" is owned by Sam and team Security has leads Sam and Lee
- **THEN** its approval set is Sam and Lee

#### Scenario: Owner who left

- **WHEN** the owner of a team goal has been removed from the workspace and the team has one lead
- **THEN** the approval set is that lead only; the goal keeps naming its former owner

### Requirement: Requester rule and workspace-owner fallback

Wherever a goal's consent is needed (an alignment requirement, a change request or a goal in a reallocation), the server SHALL treat one approval from the goal's approval set as that goal's consent, SHALL count the requester toward the set only when the requester is the goal's owner, and, when the requester is not the goal's owner and the set holds no one other than the requester, SHALL use the workspace owners other than the requester as the set. If even that set is empty, the request SHALL stay open until someone eligible exists or the requester withdraws it.

#### Scenario: Lead asks against their own team's goal

- **WHEN** Lee, a lead of team Security, requests an alignment targeting a goal owned by Sam in team Security
- **THEN** Lee's request does not satisfy that goal's requirement; Sam (or another lead) must approve

#### Scenario: Nobody else in the set

- **WHEN** the requester is the only remaining lead of a goal whose owner left
- **THEN** the requirement's set is the workspace owners other than the requester, and one of them must approve

### Requirement: Requesting an alignment

The server SHALL let a workspace owner or member (viewers 403 `read_only`) request an alignment on `POST /api/v2/workspaces/{ws}/alignments {target_goal_id, source_goal_id?, choice, session_keys?, note?}` (browser session, body at most 16 KB), with `choice` `contribution` (effect `contributes_to`) or `work_toward` (effects `contributes_to`, `governing_goal` and `allocation_transfer`), and respond 201 with the alignment view. It SHALL answer 404 for a target or source goal the caller may not read and for a session key that is unknown or not the caller's own; 409 `goal_not_active` for a target that is not `active`; 400 when the source is the target, `choice` is invalid, `note` exceeds 1000 characters, `session_keys` exceeds 50, a `work_toward` request lists no session, or a `contribution` request has neither a source nor a session; 403 `source_not_yours` when the source goal is neither the caller's own nor a goal of a team the caller is in (an approved `work_toward` alignment does not make another goal a valid source); 409 `goal_not_active` "Your goal is achieved or dropped, so it can't contribute to another goal." for a source that is not `active` (E2E acycle3 A3-cross-2); 409 `sharing_stopped` for a stopped session; and 409 `already_governed` when a `work_toward` session already follows a goal through an alignment, worded for what is true: `This session already follows this goal through an alignment, so there is nothing to change.` (one session, this very goal; `One of these sessions already follows this goal through an alignment; leave it out.` for several) or `One of these sessions already follows another goal through an alignment; revoke that one first.` (E2E acycle2 A2-cross-7; the same wording when an approval meets it). Creating writes audit action `alignment.requested`.

#### Scenario: Contribution of my team's goal to a company goal

- **WHEN** a member POSTs `{target_goal_id:"<company goal>", source_goal_id:"<their team goal>", choice:"contribution"}`
- **THEN** the response is 201 with `state: "pending"`, `revision: 1` and one `contributes_to` effect

#### Scenario: Invalid request

- **WHEN** a request lists another person's session, a stopped session, an inactive target, no session for `work_toward`, or a session already governed through another alignment
- **THEN** the server responds 404, 409 `sharing_stopped`, 409 `goal_not_active`, 400, or 409 `already_governed` respectively

#### Scenario: Already following this goal

- **WHEN** a session already follows G1 through an approved alignment and its person asks again to work toward G1 with it, and then toward another goal (`scripts/test-v2.mjs` "A2-cross-7: ...")
- **THEN** both get 409 `already_governed`, the first saying `This session already follows this goal through an alignment, so there is nothing to change.` and the second `One of these sessions already follows another goal through an alignment; revoke that one first.`

### Requirement: Alignment approval requirements

The server SHALL compute, for each alignment revision, a list of approval requirements `{for, set}`, one per distinct `for`: the target goal's approval set (`for` the target id); when there is a source goal, the source goal's approval set (`for` the source id); and for a revision with the `allocation_transfer` effect, for each listed session's owner a singleton set (`for` `sessions:<user id>`) and, for each listed session currently bound to a goal, that goal's approval set (`for` that goal id). Each goal set SHALL be the effective set after the requester rule and workspace-owner fallback. Each requirement needs one approval from its set.

#### Scenario: Work toward another team's goal

- **WHEN** Ana, whose session is bound to her own goal G1, requests `work_toward` the goal G2 owned by Sam in team Security
- **THEN** the revision has requirements for G2 (Sam and team Security's leads), `sessions:<Ana>` (Ana) and G1 (Ana, as G1's owner)

### Requirement: Approval requirement storage

The server SHALL store a revision's requirements in `approvers_json` as `[{for, set:[user ids]}]` and SHALL read an older row holding a plain array of user ids as one requirement per user id with that user as a singleton set and `for: null`. An approval by a user SHALL satisfy every requirement of that revision whose set contains them, and each requirement SHALL record the first person who satisfied it as `approved_by`.

#### Scenario: Legacy row

- **WHEN** an alignment created before this change has `approvers_json` `["u1","u2"]`
- **THEN** it reads as two requirements `{for:null, set:["u1"]}` and `{for:null, set:["u2"]}`, and approves once u1 and u2 have both approved

#### Scenario: One person satisfies two goals

- **WHEN** Lee leads both the target's and the source's owning teams and approves
- **THEN** both requirements record `approved_by` Lee

### Requirement: Alignment approval and its effects

The server SHALL approve an alignment, in the transaction of the action that completes it, when every requirement of its current revision is satisfied, and SHALL make creation instant only when the requester alone satisfies every requirement under the requester rule; the revision's author SHALL count as approving it for every requirement whose set contains them. On approval the server SHALL set `state: "approved"`, for `work_toward` set the target as the governing goal of each listed session whose sharing has not stopped and write one `binding_changed` directive per such session (stopped sessions are skipped; a listed session meanwhile governed through another alignment makes the action 409 `already_governed`), record the source goal (if any) as reviewed against the target's current version, and write audit action `alignment.approved` naming the person whose action completed it.

#### Scenario: Never instant against others

- **WHEN** a member requests a `contribution` of their own goal to a company goal owned by a workspace owner
- **THEN** the response is 201 with `state: "pending"`; it becomes `approved` only when someone in the company goal's approval set approves

#### Scenario: Instant when the requester owns both goals

- **WHEN** a workspace owner requests a `contribution` of their own team goal to their own company goal
- **THEN** the response is 201 with `state: "approved"` and the team goal's `contributes_to` lists the company goal with `stale: false`

#### Scenario: Approving work toward a goal

- **WHEN** the last required approver approves a `work_toward` request at its current `revision`
- **THEN** the alignment becomes `approved`, and each listed session whose sharing has not stopped gets the target as its governing goal and one `binding_changed` directive

### Requirement: Alignment actions

The server SHALL accept `POST /api/v2/workspaces/{ws}/alignments/{id}/{action}` (browser session, body at most 16 KB) for `approve`, `counter`, `accept_counter`, `reject`, `withdraw` and `revoke`, from people involved in the alignment (the requester and everyone in any requirement set of any revision; others 404, viewers 403 `read_only`, an unknown action 404). An approver is someone in a requirement set of the current revision. Every action SHALL carry the `revision` the caller read (400 without one, or with one that is not a whole number from 0, saying "This decision doesn't say which revision you read, so nothing was recorded. Read it again and decide again.", never a field name: `scripts/test-v2.mjs` "c11 W1 (E2E-WEB cycle 11): ...") and SHALL be refused with 409 `stale_revision` when it is an earlier revision than the current one, checked after the action's state, so a decision taken on an older view of the request is never recorded against a counter or revision the caller never saw (`scripts/test-v2.mjs` "c10 C10-2: ..."). `approve {revision}` SHALL need state `pending` (409 `wrong_state`), the current `revision` (409 `stale_revision`), an approver (403 `not_an_approver`) and active target and source goals (409 `goal_not_active`, as "An alignment needs active goals until it is decided" says; also for `counter` and `accept_counter`). `counter {revision, choice?, keep?|session_keys?, note?}` SHALL come from an approver who is not the requester (403 `not_an_approver`) on a `pending` request, may only keep or drop sessions of the current revision (400 otherwise), SHALL write a new revision with recomputed requirements, void every earlier approval and set `countered`. `accept_counter` SHALL come only from the requester (403 `not_requester`) on a `countered` request, count as the requester's approval for every requirement of the current revision whose set contains them, and return it to `pending`. `reject` SHALL come from an approver who is not the requester on a `pending` or `countered` request; `withdraw` only from the requester on a `pending` or `countered` request. `accept_counter`, `reject`, `withdraw` and `revoke` each carry `{revision}` too. A request that changed since the caller read it SHALL be 409 `stale_revision`. A `wrong_state` refusal SHALL say what happened in the app's words and, since everyone who may act is involved and sees the approvers, who did it: "This request was declined by <name>, so nothing changes." (never "rejected"), "This request was withdrawn by <requester>, so nothing changes.", "This alignment was revoked by <name>.", "This request is already approved.", "This request is waiting for approval." or "An approver suggested a change to this request; it waits on <requester> to accept it." (`scripts/test-v2.mjs` "Y5: ..."), never "reload": the app's card reloads itself on a refusal. To the person who did it the refusal says "you", never their own name: "You declined this request, so nothing changes.", "You withdrew this request, so nothing changes.", "You revoked this alignment.", "it waits on you to accept it" to the requester (`scripts/test-v2.mjs` "c9 W3: ..."), and to the approver who countered it "You countered this request; it waits on <requester> to accept it.", as a change request says it (`scripts/test-v2.mjs` "c10 W1: ..."). A request that changed since the caller read it says so in a sentence: "This request changed after you read it: it is now at revision <r>. Read it again and decide again.", with "<name> countered it, and it is now at revision <r>" ("you countered it" to its author) while a counter waits on the requester, as a change request's does. A `revision` higher than the current one was never read, and nothing changed since the caller read the request, so it SHALL be 400 `unknown_revision` "This request has no revision <n>: it is at revision <r>, so nothing was recorded. Read it again and decide again.", checked before anything else, the body included, never the stale refusal (`scripts/test-v2.mjs` "c11 W3 (E2E-WEB cycle 11): ..." and "c12 C12-2 (E2E-WEB cycle 12): ..."). `counter`, `reject`, `withdraw` and `revoke` SHALL each write an audit row (`alignment.countered`, `.rejected`, `.withdrawn`, `.revoked`) naming its actor; an `approve` or `accept_counter` SHALL write `alignment.approved` only when it completes the alignment, and otherwise no audit row. Every action SHALL respond with the alignment view.

#### Scenario: Stale or wrong approval

- **WHEN** an approver approves with an old `revision`, approves a request that is `countered`, or a person whose approval is not needed approves
- **THEN** the server responds 409 `stale_revision`, 409 `wrong_state` or 403 `not_an_approver` respectively

#### Scenario: A decline from an older view is refused

- **WHEN** the target's owner has revision 1 of a request open, another approver counters it (revision 2), and the owner then sends `reject {revision: 1}`, or the requester sends `withdraw {revision: 1}`
- **THEN** the server responds 409 `stale_revision` "This request changed after you read it: <the counter's author> countered it, and it is now at revision 2. Read it again and decide again." and the request stays `countered` at revision 2; any action sent without `revision` is 400 and changes nothing

#### Scenario: Counter and accept

- **WHEN** the target's owner counters a `work_toward` request keeping one of two sessions, and the requester then calls `accept_counter`
- **THEN** the alignment is at revision 2 with one session, back in `pending`, and approves once every requirement of revision 2 is satisfied (the counter's author already counts)

### Requirement: Alignment revocation

The server SHALL let the requester or an approver revoke an `approved` alignment (409 `wrong_state` otherwise), set it `revoked`, and, for `work_toward`, remove the governing goal from its sessions and, for each session whose open epoch was bound only through this alignment, end that epoch now, set the session `suspended` and write a `binding_suspended` directive, and, for each other session it governed (one that never opened an epoch under it), write a `binding_suspended` directive with `effective` `cancel_pending`, which cancels the pending binding change on its machine and leaves the session shared under its own binding (`directives` "binding_suspended on a revoked work_toward alignment"); past usage never moves. A revoked contribution SHALL stop making its source a child of its target.

#### Scenario: Revoking work toward

- **WHEN** the requester revokes an approved `work_toward` alignment
- **THEN** it becomes `revoked`, its sessions lose the governing goal, sessions whose open binding existed only through it become `suspended` and get a `binding_suspended` directive, and the other sessions it governed get a `binding_suspended` with `effective` `cancel_pending` and stay shared

### Requirement: An alignment needs active goals until it is decided

The server SHALL refuse, with 409 `goal_not_active` and before recording anything, an `approve`, a `counter` or an
`accept_counter` on an alignment whose target or source goal is no longer `active` (achieved or dropped after the
request was made), saying `"<goal>" was <achieved|dropped> after the request was made, so nothing can align with it.
Decline or withdraw this request instead.` for the target and `... so it can't contribute to another goal. Decline or
withdraw this request instead.` for the source (`A goal in this request` for a goal the caller may not read): the
request keeps its state, revision and approvals, no session gets a governing goal and no directive is written (E2E
acycle3 A3-cross-2, where an approval bound a live session to a dropped goal and the agent, `align status`, the web
alignment and the server's usage disagreed). Such a request SHALL still be declined (`reject`) or withdrawn, and its
view SHALL offer only those (`can.approve`, `can.counter` and `can.accept_counter` false, so it waits on no one).
Alignments have no approve-and-launch step, so these are the only ways to approve one.

The server SHALL, in the transaction that gives a goal status `achieved` or `dropped` (an owner's version or a
launched change request, after its `goal_version` directive), end every approved `work_toward` alignment's hold on
the sessions it governs toward that goal, the way a revocation does: their governing goal is cleared, each session
whose open epoch was bound only through that alignment has that epoch ended now, is set `suspended`, and gets one
`binding_suspended` directive whose `binding.cause` is `goal_closed:<alignment id>`; past usage never moves, and audit
action `alignment.goal_closed` names the person whose action closed the goal. The alignment stays `approved` on the
record, and its effects say `This session no longer follows "<goal>": that goal was <achieved|dropped>.` and `Future
usage from this session no longer counts under "<goal>": that goal was <achieved|dropped>. Past usage stays where it
is.` (`these <n> sessions ... follow` for several). So no agent keeps being told it counts toward a goal that is done.
A session bound to the goal directly (its own or its team's goal) keeps its binding and learns the new status from the
`goal_version` directive, as before; the spec was silent on bindings through an alignment, and they now end as a goal
close ends everything else waiting on the goal (change requests, requests to its agents, holds).

#### Scenario: Approving after the target was dropped

- **WHEN** Lena requests `work_toward` Milo's goal "Tune ledger indexes" with a session, and another such request is countered by Milo, then Milo drops the goal and approves the first, counters it, and Lena accepts the counter of the second (`scripts/test-v2.mjs` "A3-cross-2: approving, countering or accepting a counter ...")
- **THEN** each is 409 `goal_not_active` with `"Tune ledger indexes" was dropped after the request was made, so nothing can align with it. Decline or withdraw this request instead.`, the requests stay `pending` at revision 1 and `countered` at revision 2 with no new approval, the session follows no goal and gets no `binding_changed`, and the views offer only decline and withdraw, which still close them

#### Scenario: A source goal dropped after the request

- **WHEN** a contribution of Lena's goal to another is pending and Lena drops her goal, then the target's approver approves it, and Lena requests a new contribution from the dropped goal (`scripts/test-v2.mjs` "A3-cross-2: a contribution whose source goal was dropped ...")
- **THEN** the approval is 409 `goal_not_active` (`... so it can't contribute to another goal. ...`) and the request stays `pending`, and the new request is 409 `goal_not_active`

#### Scenario: The target dropped after approval

- **WHEN** a session follows Milo's goal through an approved `work_toward` alignment and has opened an epoch under it, and Milo then drops the goal (`scripts/test-v2.mjs` "A3-cross-2: an approved work_toward whose target is then dropped ...", "... the alignment stays approved ...")
- **THEN** in that transaction the session's governing goal is cleared, its epoch ends, it is `suspended`, and its device gets the `goal_version` directive and then a `binding_suspended` with `cause` `goal_closed:<alignment id>`; audit `alignment.goal_closed` names Milo; the alignment stays `approved` and its effects say the session no longer follows the dropped goal and its usage no longer counts there

### Requirement: Contribution cycles are refused

The server SHALL refuse with 409 `cycle` an alignment with a source goal whose approval would make the contribution tree cyclic, that is, when the source is already reachable from the target by following approved parents: at creation (nothing is written) and at the `approve` or `accept_counter` that would complete it (the alignment stays as it was). The message SHALL NOT name goals the caller may not read.

#### Scenario: Child cannot become its parent's parent

- **WHEN** goal A contributes to goal B through an approved alignment and someone requests that B contribute to A
- **THEN** the response is 409 `cycle` and no alignment is created

### Requirement: Alignment read views

The server SHALL list the alignments the caller is involved in on `GET /api/v2/workspaces/{ws}/alignments` (browser session) as `{waiting_on_me, mine, others}`, newest change first, and serve one on `GET .../alignments/{id}` (404 when the caller is not involved). Each view SHALL hold `id`, `state`, `revision`, `choice`, `requester`, `target_goal`, `source_goal` (a goal the caller may not read shows `id` and `title` null), `sessions` (by `ref`; another person's session has no `session_key`; each with `started_at` and `key_end`, the last 6 characters of its key, so two sessions of one person in one repository can be told apart), `effects` in plain words, `requirements` (each `{for, approvers:[{id,name}], approved_by}`, with `for` null for a goal the caller may not read), `approvers` (everyone in any current set, each with `approved`), `note`, `history` of revisions, `waiting_on_me`, `can` flags for exactly the actions the server would allow (all false for a viewer), `closed_by` (`{id, name}` of whoever declined, withdrew or revoked it: the declining approver from the audit, the requester, or `revoked_by`; null while it is open or approved) and `closed_at` (`decided_at`, or `revoked_at` for a revoked one; null otherwise), `created_at` and `updated_at`. The effects of an approved `work_toward` alignment SHALL describe its sessions as they are now: a session that no longer follows its target through it (it accepted a `switch_goal`, its person picked another goal, or it stopped sharing) is never said to follow the goal or to count its future usage there.

#### Scenario: Alignment list

- **WHEN** a member calls `GET /api/v2/workspaces/{ws}/alignments`
- **THEN** requests where they can approve or accept a counter are under `waiting_on_me`, their other requests under `mine`, and other requests they are part of under `others`

#### Scenario: Effects in words

- **WHEN** a person reads a contribution-only alignment and a work-toward alignment with one session
- **THEN** the first's `contributes_to` effect reads "Records that this session contributes to <goal>. No usage moves."; the second's reads "Records that this session contributes to <goal>." without "No usage moves", next to its "Future usage from this session counts under <goal>. Past usage stays where it is."; with several sessions the verb agrees, "Records that these 3 sessions contribute to <goal>." (`scripts/test-v2.mjs` "C5-5: ...")

#### Scenario: A session moved off the goal

- **WHEN** the one session of an approved work-toward alignment moves to another goal (`scripts/test-v2.mjs` "A1-cross (works but confusing): once its session moved ...")
- **THEN** the alignment stays `approved`, its `governing_goal` effect reads "This session no longer follows <goal>: it moved to another goal or stopped sharing." and its `allocation_transfer` effect "Future usage from this session no longer counts under <goal>. Past usage stays where it is."; with several sessions of which some moved, "<k> of these <n> sessions still follow <goal>: their agents get that goal and its changes. The other <m> moved to another goal or stopped sharing." and "Future usage from the <k> still following counts under <goal>. …"

#### Scenario: Who closed a request

- **WHEN** an approver declines a request, a requester withdraws another and an approver revokes a third (`scripts/test-v2.mjs` "A1-cross-8: ...")
- **THEN** each view's `closed_by` names that person, with `closed_at`, and an open or approved request has both null

### Requirement: Proposing a change request

The server SHALL let a workspace owner or member who can read a goal but does not own it propose a change on `POST /api/v2/workspaces/{ws}/goals/{goal}/change-requests {base_version, changes, reason}` (browser session, body at most 32 KB) and respond 201 with the change request (`id` `cr_…`, `state: "pending"`, `revision: 1`). It SHALL answer 404 for a goal the caller may not read, 403 `read_only` for a viewer, 403 `own_goal` for the goal's owner (who publishes a version instead), 409 `goal_not_active` for a goal that is `achieved` or `dropped`, 409 `stale_version` when `base_version` is not the goal's current version, and 400 when `reason` is missing or not 1 to 2000 characters after trimming.

#### Scenario: Member proposes

- **WHEN** a member of team Product POSTs `{base_version: 1, changes:{measures:[…]}, reason:"Onboarding needs a pen-test window in May"}` to the Security goal
- **THEN** the response is 201 with `state: "pending"`, `base_version: 1`, `requester` naming the caller, and audit action `change_request.created`

#### Scenario: Owner proposes to their own goal

- **WHEN** the goal's owner POSTs a change request to it
- **THEN** the response is 403 `own_goal`

### Requirement: Change request contents

The server SHALL accept in `changes` only the keys `title`, `measures`, `depends_on`, `status` and `limits` (400 for any other key, an empty object or a non-object; a target share changes only through its owner's version or a reallocation), validate each like a new goal version against the base version, answer 409 `no_change` when applying them to the base version changes nothing, and 409 `cycle` when the resulting `depends_on` would close a dependency cycle. The same rules SHALL apply to `changes` sent with `counter` and `rebase`, and a request's read view SHALL show `limits` in its `changes` and in `diff.before` / `diff.after` when it changes them.

#### Scenario: Anchors are not proposable

- **WHEN** a change request sends `changes: {anchors:{repos:["x"]}}`
- **THEN** the response is 400

### Requirement: Dependencies a decider can't see are refused

The server SHALL refuse with 409 `dependency_not_visible` a change request, or a `rebase`, whose `changes` add to `depends_on` (relative to the version they are made against) a goal that some member of the goal's effective approval set (after the requester rule) may not read, and a `counter` whose changes add a goal (one on neither the base version nor the request's current revision) that the requester, or some member of the effective approval set, may not read: a counter goes to the requester to accept and then back to that set to decide, so the same visibility rule as a proposal applies to it. This is so that nobody is asked to decide on, or accept, a dependency they can't see. The message SHALL name neither the goal nor the person, and nothing SHALL be written. A dependency already on the base version is not added. The messages SHALL be, for a proposal or the requester's own rebase, "Someone who decides on this goal can't see a goal you added as a dependency, so they couldn't see what they approve. Remove it, or ask that goal's owner to share it with them first."; for a counter the requester can't read, "The person who asked can't see a goal you added as a dependency, so they couldn't see what they accept. Remove it from your suggestion."; and for a counter someone in the approval set can't read, "Someone who decides on this goal can't see a goal you added as a dependency, so they couldn't see what they approve once it is accepted. Remove it from your suggestion, or ask that goal's owner to share it with them first.". Where a reader of a request still can't read a dependency in its diff (the approval set changed later, or the base version already had it), `diff.hidden_depends_on` `{before, after}` SHALL count the dependencies on each side that the reader may not read (`null` when `depends_on` doesn't change), and the app SHALL show each as "a goal you can't see", so a diff never reads "Nothing → Nothing".

#### Scenario: Proposing a dependency on a private goal

- **WHEN** a member proposes on a team goal a change that adds a dependency on their own `private` goal
- **THEN** the response is 409 `dependency_not_visible` with a message that names neither the goal nor the approvers, and no request is created

#### Scenario: Countering with a goal the requester can't read

- **WHEN** an approver counters a request with changes that add a dependency on a goal of a team the requester is not in
- **THEN** the response is 409 `dependency_not_visible`, and the request stays `pending` at its revision

#### Scenario: Countering with a goal a co-approver can't read

- **WHEN** a team goal's approval set is its owner and a lead who is not in the Hardware team, and the owner counters a request with changes that add a dependency on a Hardware-only goal that the owner and the requester can both read
- **THEN** the response is 409 `dependency_not_visible` ("…so they couldn't see what they approve once it is accepted…"), naming neither the goal nor the lead, and the request stays `pending` at its revision

#### Scenario: A dependency the reader can't see in a diff

- **WHEN** a request's diff changes `depends_on` and one dependency on its after side is a goal the reader may not read
- **THEN** `diff.after.depends_on` omits it, `diff.hidden_depends_on.after` is 1, and the app shows "a goal you can't see" on that side and in "What would change"

### Requirement: A rebase refusal names who added the dependency

When a `rebase` that keeps the request's own changes is refused with 409 `dependency_not_visible` (the approval set changed since the dependency was added, so a member of it can no longer read it), and the dependency was added by someone other than the requester (the author of the earliest revision in the latest unbroken run of revisions whose changes depend on it, normally an approver's counter the requester accepted), the server SHALL say so instead of "you added": "Someone who decides on this goal can't see a goal that <name>'s suggestion added as a dependency, so they couldn't see what they approve. Withdraw this request and propose the change again without it, or ask that goal's owner to share it with them first." The rebase itself SHALL still be refused, so that nobody decides on a dependency they can't see. A rebase that sends its own `changes`, or whose dependency the requester added, SHALL keep the proposal's message.

#### Scenario: Rebasing a counter's dependency

- **WHEN** an approver's counter added a Hardware-only dependency while every approver could read it, the requester accepted it, a lead outside Hardware then joined the approval set, the goal moved on, and the requester presses Update to version <n>
- **THEN** the response is 409 `dependency_not_visible` with "…can't see a goal that <approver>'s suggestion added as a dependency…", never "a goal you added", and the request stays `pending` and behind

### Requirement: Nobody approves or launches a dependency they can't see

The approval set of a goal, and what each of its members may read, can change after a request added a dependency (a lead outside the dependency's team joins, say). The server SHALL therefore refuse with 409 `dependency_not_visible` an `approve` or `approve_and_launch` from a decider who may not read a goal the request's changes add to `depends_on` (relative to its base version), and a `launch` from a launcher who may not read a goal the approved content adds to the base version's `depends_on`, so that nobody approves, or publishes to agents, a dependency they can't see. Nothing SHALL be written, and the message SHALL name no goal and nobody who can't read it. For an approval it SHALL be "This request adds a dependency on a goal you can't see, so you can't approve what it asks. Ask <requester> to withdraw it, or to rebase it without that dependency."; for a launch (an approved request can no longer be withdrawn or rebased) "This change adds a dependency on a goal you can't see, so you can't launch what it publishes. Ask someone who decides on this goal and can see it to launch it, or ask <requester> to propose the change again without that dependency.". A dependency already on the base version is not one the request adds, and a decider who can read every added dependency SHALL still approve and launch. The change-request read SHALL follow the same rule, decided by one shared check, so that `can` stays true exactly when the server would accept: for a decider it would refuse this way, `can.approve` and `can.approve_and_launch` (pending) or `can.launch` (approved, unlaunched) SHALL be false (`not_yet`, `counter` and `reject` are unaffected), `waiting_on_me` SHALL follow from those flags, so the request is not on that person's Home under "Waiting on you" nor under "Waiting on you" on the Requests tab, and `dependency_not_visible` SHALL hold the refusal they would get (`null` for everyone else). The workspace Home SHALL never list the reader among the people a request waits on.

#### Scenario: An approver who joined after the dependency was added

- **WHEN** a member's request on a Platform goal adds a Hardware-only dependency while the goal's only approver can read it, a lead outside Hardware then joins Platform, and that lead presses Approve or Approve and launch
- **THEN** the response is 409 `dependency_not_visible` ("…Ask <requester> to withdraw it, or to rebase it without that dependency."), naming no goal, and the request stays `pending` with the goal at its version

#### Scenario: The read doesn't offer what the server refuses

- **WHEN** that lead reads the request, the Requests tab or their Home, before and after the approver who can read the dependency approves it (`scripts/test-v2.mjs` "C4-1: a decider who can't read a dependency the request adds reads can.approve ...")
- **THEN** `can.approve` and `can.approve_and_launch`, then `can.launch`, are false while `can.counter`, then `can.not_yet`, stay true; `waiting_on_me` is false, `dependency_not_visible` holds the refusal, the request is in neither "Waiting on you" list and the Home names only the approver who can read it as the one it waits on; for that approver every flag is true and `dependency_not_visible` is `null`

#### Scenario: Launching an approved change with a hidden dependency

- **WHEN** that request was approved by the approver who can read the dependency, and the lead outside Hardware presses Launch
- **THEN** the response is 409 `dependency_not_visible` ("…Ask someone who decides on this goal and can see it to launch it…"), nothing launches, and the approver who can read it still launches it

#### Scenario: A dependency on the base version

- **WHEN** a goal's current version already depends on a goal an approver can't read, and that approver approves a request that changes only the title
- **THEN** the request is approved

### Requirement: A counter keeps the dependencies its author can't see

The server SHALL keep, on a `counter`, every dependency on the request's current revision (its changes applied to its base version) that the counterer may not read, as a new goal version keeps the dependencies its editor can't read: a `depends_on` sent lists only what the counterer can see, so it is never a request to drop the others, and a counter that doesn't send `depends_on` keeps them beside the base version's other dependencies. The counter form SHALL say "Also depends on a goal you can't see. Sending keeps it; only someone who can see it can remove it." (counted, never named), and its confirmation SHALL include the kept goal in "Depends on would be" and a "Kept" line saying so.

#### Scenario: Counter by an approver who can't see a dependency

- **WHEN** a request depends on a Hardware-only goal and a shared goal, and an approver outside Hardware counters with a new title and `depends_on` listing only the shared goal
- **THEN** the counter's revision depends on both goals, and the approver's read counts the hidden one (`diff.hidden_depends_on.after` 1)

#### Scenario: Counter that doesn't restate depends_on

- **WHEN** a request adds a dependency the counterer can't read, and the counterer sends a counter with only a new title
- **THEN** the counter's revision still depends on that goal

### Requirement: The propose form offers only dependencies the server accepts

`GET /api/v2/workspaces/{ws}/goals/{goal}` SHALL include `dependency_choices`: the ids of the goals a change request from the reader may add as a dependency, that is the goals the reader can read that every member of the goal's effective approval set (with the reader as requester) can also read and that do not already depend on the goal, directly or through other goals (readable or not), since adding one would close a loop; `null` when the reader may not propose (a viewer, the goal's owner, or a goal that is not active). It SHALL also include `dependency_loops`: the ids of the goals the reader can read that are left out because they already depend on the goal (`null` exactly when `dependency_choices` is). The app's **Propose a change** form SHALL offer as a new dependency only goals in `dependency_choices` (the goal's current dependencies stay listed), and SHALL say how many goals the person can see aren't offered and why: "<n> goals you can see aren't offered: someone who decides on this goal can't see them." for the goals someone deciding can't read, and "<n> goals aren't offered: they already depend on this goal, so adding them would make a loop." for those in `dependency_loops`. The server SHALL still check every request.

#### Scenario: A private goal and a team-only goal are not offered

- **WHEN** a member opens Propose a change on a Platform goal whose approval set can read neither the member's private goal nor a Hardware-only goal
- **THEN** `dependency_choices` holds neither, Depends on lists neither, and the form says "2 goals you can see aren't offered: someone who decides on this goal can't see them."

#### Scenario: Goals that would make a loop are not offered

- **WHEN** "Ship arms" depends on "Grow trials", "Arms launch" depends on "Ship arms", and the workspace owner opens Propose a change on "Grow trials" (`scripts/test-v2.mjs` "C3-3: GET a goal's dependency_choices leaves out the goals that already depend on it ...")
- **THEN** `dependency_choices` holds neither "Ship arms" nor "Arms launch", `dependency_loops` holds both, Depends on lists neither and the form says "2 goals aren't offered: they already depend on this goal, so adding them would make a loop." (never that someone can't see them); a proposal sent with "Ship arms" anyway is still refused 409 `cycle`

### Requirement: The counter form offers only dependencies a counter may add

`GET /api/v2/workspaces/{ws}/goals/{goal}?counter={request}` SHALL give as `dependency_choices` the ids of the goals a `counter` from the reader on that request may add as a dependency: the goals the reader can read that the requester and every member of the request's effective approval set can also read, leaving out goals that already depend on the goal (listed in `dependency_loops`, as for the propose form); `null` when the reader may not counter it (it is not `pending`, the reader is not in its approval set, or the reader is a viewer), and 404 for a request not on that goal. With `?counter`, `dependency_loops` SHALL follow the same audience (`null` exactly when `dependency_choices` is), the goal's owner who decides on the request included, so that the two never disagree about who the form is for. With `?counter`, the read SHALL also include `counter_base`: what that counter is compared with, the request's base version (`title`, `measures`, `depends_on` listing only the goals the reader can read, `status` and `limits`), `null` exactly when `dependency_choices` is, so the form compares a suggestion with what the server does, also on a request behind its goal (`scripts/test-v2.mjs` "C8-2: ..."). The app's **Suggest a change** form SHALL read it and offer as a new dependency only goals in it (the request's dependencies stay listed), saying "<n> goals you can see aren't offered: <requester> or someone who decides on this goal can't see them." for the goals the requester or someone deciding can't read and, as the propose form does, "<n> goals aren't offered: they already depend on this goal, so adding them would make a loop." for those in `dependency_loops`. The server SHALL still check every counter.

#### Scenario: Counter choices leave out what the requester or a co-approver can't see

- **WHEN** a Platform goal's owner, who leads Platform beside a lead outside Hardware, chooses Suggest a change on a member's request, and the owner can read a Hardware-only goal and a goal private to them
- **THEN** `dependency_choices` holds neither, Depends on lists neither, and the form says "2 goals you can see aren't offered: <requester> or someone who decides on this goal can't see them."

#### Scenario: The goal's owner counters next to a loop

- **WHEN** a goal the owner decides on has another goal depending on it, and the owner reads the goal with `?counter=<a member's pending request>` (`scripts/test-v2.mjs` "C4-2: GET a goal with ?counter= gives the goal's owner dependency_loops ...")
- **THEN** `dependency_loops` lists the goal that depends on it and `dependency_choices` leaves it out, and the form says it isn't offered because it would make a loop (never that someone can't see it); the requester's own `?counter=` read has both `null`

### Requirement: One open change request per goal and requester

The server SHALL refuse a second change request from the same person on the same goal while their earlier one is `pending` or `countered`, with 409 `already_open`.

#### Scenario: Second request

- **WHEN** a member with a pending request on a goal POSTs another one to that goal
- **THEN** the response is 409 `already_open`; once the first is withdrawn or decided, a new one is accepted; an approved request waiting for launch is decided, so the requester may propose again

### Requirement: Approving a change request

The server SHALL accept `POST .../change-requests/{id}/approve {revision, note?}` (`note` at most 2000 characters) only from a member of the goal's approval set under the requester rule (403 `not_an_approver`), only for a `pending` request (409 `wrong_state`) at its current `revision` (409 `stale_revision`), and only while the goal is still at `base_version` (409 `stale_version`; the requester must `rebase`), and 409 `no_change` when the changes no longer change the goal. On success it SHALL, in one transaction, set the request `approved` with `approved_by`, `note`, `decided_at`, `approved_without_evidence` (see "Approving without evidence") and `launch: "pending"`, store the resulting goal content on the request as its approved-unlaunched version, write audit action `change_request.approved`, record `first_approval`, and respond with the request. Approving SHALL write no goal version and no directive, and SHALL NOT change the goal: its version, content, versions list, feed and every agent read stay at the last launched version until a launch (see "Launching an approved change request"). `version` stays `null` until the launch.

#### Scenario: Team lead approves

- **WHEN** a lead of the goal's owning team approves a pending request at its current revision on a goal at version 2 still at its base version
- **THEN** the request is `approved` with `approved_by` the lead, `launch: "pending"` and `version: null`; the goal is still at version 2 and no session gets a directive

#### Scenario: Goal moved meanwhile

- **WHEN** the owner published a new version after the request was made and an approver approves it
- **THEN** the response is 409 `stale_version` and the request stays `pending`

### Requirement: Who may launch a change request

The server SHALL compute, at the time it is needed, the launch set of a change request as its effective approval set (the goal's approval set under the requester rule and the workspace-owner fallback) plus every workspace owner, keeping only current members with role `owner` or `member`; a viewer SHALL never be in it. Every approver of a request is in its launch set. The set SHALL be read on the request as `launchers` (`[{id, name}]`).

#### Scenario: A workspace owner outside the approval set

- **WHEN** a team goal's request was approved by the team's lead and a workspace owner who is neither the goal's owner nor a lead opens it
- **THEN** the owner is in `launchers` and may launch it; a plain member outside the approval set may not (403 `not_a_launcher`)

### Requirement: Launching an approved change request

The server SHALL accept `POST .../change-requests/{id}/launch {revision?}` only from a member of the request's launch set (403 `read_only` for a viewer, 403 `not_a_launcher` with "Only someone who can approve for this goal, or a workspace owner, can launch it." otherwise), only for an `approved` request whose `launch` is `pending` or `not_yet` (409 `wrong_state`: "This change is already launched as version <n>." when launched, "This change was superseded before launch. <requester> can propose it again." when superseded before launch ("You can propose it again." to the requester), and otherwise the words every `wrong_state` refusal of a change request gives, see "Rejecting and countering a change request"), and only while the goal is still at the request's `base_version` (409 `stale_version`), and, when `revision` is sent, only at the request's current revision (409 `stale_revision`, as for every other decision; the app always sends it). On success it SHALL, in one transaction, write the approved-unlaunched version as the goal's next version through the single write path every goal version takes (the same as an owner's new version: content hash, `created_by` the approver who confirmed it, audit `goal.versioned` by the launcher, parent review, one `goal_version` directive for every non-stopped session bound to or governed by the goal, and, when the version makes the goal achieved or dropped, the closing steps of "Change requests are superseded when the goal is achieved or dropped" and "Requests expire when their goal is achieved or dropped" and the hold release), set the request's `launch` to `launched` with `launch_decided_by` the launcher, `launch_decided_at` and `version` the new goal version, write audit action `change_request.launched`, record the content-free event `first_launch`, and respond with the request. A refused launch SHALL write nothing.

#### Scenario: Approve without launching, then launch

- **WHEN** a goal is at version 2 with a bound session, an approver approves a request on it, and a workspace owner then launches it
- **THEN** after the approval the goal is at version 2 and the session's directive cursor has nothing new; after the launch the goal is at version 3 with `created_by` the approver, the session gets exactly one `goal_version` directive carrying version 3, and the request reads `launch: "launched"`, `version: 3`, `launch_decided_by` the owner

#### Scenario: Launch with a stale revision

- **WHEN** a launcher posts `launch` or `not_yet` with a `revision` earlier than the approved request's, or one higher than it
- **THEN** the response is 409 `stale_revision` for the earlier one and 400 `unknown_revision` for the higher one, and nothing is recorded: `launch` stays `pending` and the goal keeps its version

#### Scenario: Launch twice

- **WHEN** someone launches a request that is already launched
- **THEN** the response is 409 `wrong_state` and no second version or directive is written

### Requirement: Not yet keeps agents on the launched version

The server SHALL accept `POST .../change-requests/{id}/not_yet {revision?}` from the launch set (403 `not_a_launcher` otherwise) on an `approved` request whose `launch` is `pending` (409 `wrong_state` otherwise) and, when `revision` is sent, at its current revision (409 `stale_revision`), and SHALL record the decision (`launch: "not_yet"`, `launch_decided_by`, `launch_decided_at`, audit `change_request.not_yet`) and publish nothing: no goal version, no directive. A later `launch` SHALL replace that decision. A `not_yet` on a request already `not_yet` (said in another tab, or by another launcher) would change nothing, so it SHALL be 409 `wrong_state` and not recorded again, saying who decided it: "<name> already decided not yet, so nothing changes: agents stay on version <n> until someone launches version <n+1>." ("You already decided not yet, …" to that person), and `can.not_yet` SHALL be false while `launch` is `not_yet` (`scripts/test-v2.mjs` "launch (D1): ..."; E2E-WEB cycle 11 W2).

#### Scenario: Not yet, then launch

- **WHEN** a lead says not yet on an approved request and later launches it
- **THEN** after not yet the goal and the bound sessions' directives are unchanged and the request reads `launch: "not_yet"` with the lead and the time; after the launch it reads `launch: "launched"` and the sessions get the new version once

### Requirement: Approve and launch in one step

The server SHALL accept `POST .../change-requests/{id}/approve_and_launch {revision, note?}` from a person who may both approve the request and launch it (every approver may), under the rules of both actions, and SHALL in one transaction approve it and launch it, auditing two decisions (`change_request.approved`, with `change_request.approved_without_evidence` when so, then `change_request.launched`) and recording `first_approval` and `first_launch`. A refusal of either SHALL write nothing.

#### Scenario: Owner approves and launches

- **WHEN** the goal's owner approves and launches a pending request in one step while a session is bound to the goal
- **THEN** the request is `approved` with `launch: "launched"`, the goal is at its next version, the session gets one `goal_version` directive, and the audit has both `change_request.approved` and `change_request.launched` by the owner

### Requirement: Approved changes are superseded before launch

The server SHALL, in the transaction that writes any new version of a goal (an owner's version, or the launch of another request), set every other `approved` request on that goal whose `launch` is `pending` or `not_yet` to state `superseded` with `launch: "superseded"`, keeping its approval (`approved_by`, `note`, `decided_at`), and write audit action `change_request.superseded` for each with the person whose action wrote the version as actor. Such a request SHALL never reach agents, SHALL accept no launch (409 `wrong_state`), and SHALL not stop its requester proposing again.

#### Scenario: Owner saves a version before launch

- **WHEN** a request on a goal at version 2 is approved and, before anyone launches it, the owner saves version 3
- **THEN** the request is `superseded` with `launch: "superseded"` and its approver kept, launching it answers 409 `wrong_state`, no directive carries its content, and its requester can open a new request against version 3

#### Scenario: Another request launches first

- **WHEN** two requests on the same goal are approved and one is launched
- **THEN** the other becomes `superseded` before launch; a third request that was still pending is `behind` and its requester can rebase it

### Requirement: Rejecting and countering a change request

The server SHALL accept `reject {reason}` (reason 1 to 2000 characters, 400 otherwise) from an approver on a `pending` or `countered` request, setting `rejected` with `rejected_by`, `reason` and `decided_at`; and `counter {changes, note, condition?, revision?}` (note 1 to 2000 characters; `condition`, when sent and not null, 1 to 2000 characters, 400 "condition is required" or "condition is too long (max 2000 characters)") from an approver on a `pending` request, replacing the proposed changes, raising `revision`, storing the condition on that new revision separately from its note, and setting `countered`. A counter that changes nothing on the version the request was made against SHALL be 409 `no_change` with "This suggestion changes nothing on the goal, so there is nothing to suggest. Change a field to suggest something else, or decline the request." (`scripts/test-v2.mjs` "C7-2: ..."), and on a request behind its goal, which compares with that version and not with the goal as it is now, "This suggestion changes nothing on version <base>, the version this request was made against (the goal is now at version <n>), so there is nothing to suggest. …", so removing something only the newer version has never reads as changing nothing on the goal (`scripts/test-v2.mjs` "C8-2: ..."). A counter whose changes are the request's own, with no `condition`, SHALL be 409 `no_change` with "That's what the request already asks for: approve it instead." ("… approve it once <requester> updates it to version <n>." when the request is behind its goal), and nothing is recorded; with a `condition` it is an Accept if… and is recorded (`scripts/test-v2.mjs` "W4: ..."). Only the requester SHALL `accept_counter` (403 `not_requester`) a `countered` request, which returns it to `pending` with the countered changes. A caller outside the approval set SHALL get 403 `not_an_approver`, a request in another state 409 `wrong_state`, and a sent `revision` earlier than the current one 409 `stale_revision`. A sent `revision` that is not a whole number from 0 SHALL be 400 "This decision doesn't say which revision you read, so nothing was recorded. Read it again and decide again.", and one higher than the current revision, which the request never reached, 400 `unknown_revision` "This request has no revision <n>: it is at revision <r>, so nothing was recorded. Read it again and decide again.", checked before anything else, the body included, for every decision on a change request (`launch` and `not_yet` included), never the stale refusal (`scripts/test-v2.mjs` "c11 W3 (E2E-WEB cycle 11): ..." and "c12 C12-2 (E2E-WEB cycle 12): ..."). A `wrong_state` refusal of any action on a change request SHALL say what happened in the app's words and who did it, as an alignment's does: "This request is waiting for approval." ("The suggested change was already accepted, so this request is waiting for approval." once a counter was accepted), "This request was countered by <the counter's author>; review the counter." (for example to a requester's **Update to version <n>** after an approver countered it meanwhile: `scripts/test-v2.mjs` "W6 (ui): ..."), "This request was already approved by <approver>.", "This request was declined by <name>, so nothing changes." (never "rejected"), "This request was withdrawn by <requester>, so nothing changes." or "This request was superseded: its goal was closed or got a newer version first, so nothing changes."; none says "reload", since the app's card reloads itself on a refusal (`scripts/test-v2.mjs` "c9 W6: ..."). The refusal SHALL say "you" to the person who did it, never their own name: "You countered this request; it waits on <requester> to accept it.", "You already approved this request.", "You declined this request, so nothing changes." and "You withdrew this request, so nothing changes." (`scripts/test-v2.mjs` "c9 W3: ..."). Adding or removing evidence on a request that is no longer open says the same (`scripts/test-v2.mjs` "C8-1: ..." and "c9 W1: ..."), and no refusal builds its own "This request is <state>"; launching keeps its own words for a launched or superseded change. A `stale_revision` refusal SHALL say in a sentence what changed and what to do, never "reload and try again": "This request changed after you read it: it is now at revision <r>. Read it again and decide again." (after a counter, "… <name> countered it, and it is now at revision <r>. …"); every refusal of a change request, its evidence and its condition is a full sentence ending in a full stop.

#### Scenario: Reject needs a reason

- **WHEN** an approver POSTs `reject {}`
- **THEN** the response is 400 and the request is unchanged

#### Scenario: Decline while a counter waits

- **WHEN** an approver counters a request and, while it waits on the requester to accept, POSTs `reject {revision, reason}`
- **THEN** the request is `rejected` with that approver as `rejected_by` and the reason, and the requester's `accept_counter` then gets 409 `wrong_state`

#### Scenario: A counter on a request behind its goal

- **WHEN** a request renames a goal against version 1, the owner saves version 2 with a new measure, and an approver counters with the old title and no measures
- **THEN** the response is 409 `no_change` with "This suggestion changes nothing on version 1, the version this request was made against (the goal is now at version 2), so there is nothing to suggest. Change a field to suggest something else, or decline the request.", and the request is unchanged

#### Scenario: A counter that is the request itself

- **WHEN** an approver counters a pending request with its own changes and no condition
- **THEN** the response is 409 `no_change` with "That's what the request already asks for: approve it instead." and the request stays pending at its revision; the same changes with a condition are countered

#### Scenario: Counter then accept

- **WHEN** an approver counters with changed measures and the requester calls `accept_counter`
- **THEN** the request is `pending` at revision 2 with the approver's changes, and an approver can then approve revision 2

### Requirement: Accept if conditions on a counter

The server SHALL show a request's condition as `condition` `{revision, text, acknowledged_by, acknowledged_at}` (the condition of its latest counter revision, or `null` when that counter carries none or there is no counter) and on each revision as `condition`, `acknowledged_by` and `acknowledged_at`. Only the requester SHALL acknowledge it, with `POST .../change-requests/{id}/acknowledge {revision?}` (403 `not_requester` for anyone else, 403 `read_only` for a viewer), as a step separate from `accept_counter`: on a `pending` or `approved` request (409 `wrong_state` while `countered` and in every closed state), with a condition (409 `no_condition`), naming its revision when `revision` is sent (409 `stale_revision`), and only once per revision (409 `already_acknowledged`). It SHALL store who acknowledged and when on that revision, write audit `change_request.condition_acknowledged`, and change nothing else. A condition SHALL never gate approval or launch, SHALL never reach a directive, and nothing SHALL call it verified: until acknowledged the record shows it as not confirmed yet, and once the request is declined, withdrawn or superseded without an acknowledgement, as never confirmed ("Never confirmed: the request was declined").

#### Scenario: Condition acknowledged by the requester

- **WHEN** an approver counters with `condition: "Accept if the pen-test vendor is booked by May"`, the requester accepts the counter, another member acknowledges, and then the requester acknowledges twice
- **THEN** after the accept the condition has `acknowledged_by: null`; the other member gets 403 `not_requester`; the requester's first acknowledge stores their id and the time; the second answers 409 `already_acknowledged`

#### Scenario: Not a gate

- **WHEN** an approver approves and launches a request whose condition nobody acknowledged
- **THEN** both succeed, and the record shows the condition as not confirmed yet next to the approval

### Requirement: Withdrawing and rebasing a change request

The server SHALL let only the requester (403 `not_requester`) `withdraw` a `pending` or `countered` request, setting `withdrawn`, and `rebase {base_version, changes?}` a `pending` request (409 `wrong_state` otherwise), where `base_version` must equal the goal's current version (409 `stale_version`); rebase SHALL move the request to that version, replace the changes when sent, re-validate them against it (409 `no_change` when they no longer change anything), and raise `revision`.

#### Scenario: Rebase after the goal moved

- **WHEN** the goal moved from version 2 to 3 and the requester POSTs `rebase {base_version: 3}`
- **THEN** the request has `base_version: 3` and a higher `revision`, and an approver can approve it; in the app, **Update to version 3** confirms "Recorded: you updated your request to version 3 (revision <n>). It waits for approval again."

### Requirement: Change requests are superseded when the goal is achieved or dropped

The server SHALL, in the transaction that gives a goal status `achieved` or `dropped` (an owner's version or a launched change request), set every other `pending` or `countered` change request on that goal to `superseded` and write audit action `change_request.superseded` for each, with the person whose action changed the goal's status as actor. A new version that leaves the goal `active` SHALL NOT change other open requests: they stay `pending` or `countered`, and approving one answers 409 `stale_version` until its requester rebases it.

#### Scenario: Owner drops the goal

- **WHEN** the owner saves a version with `status: "dropped"` while two requests on the goal are pending
- **THEN** both requests become `superseded` and accept no further action (409 `wrong_state`)

#### Scenario: Another request is launched

- **WHEN** two requests on an active goal are pending and an approver approves and launches one without changing the status
- **THEN** the other stays `pending`, and approving it answers 409 `stale_version` until its requester rebases it

### Requirement: Change request audit

The server SHALL write an audit row naming its actor for every change request action: `change_request.created`, `.approved`, `.approved_without_evidence`, `.launched`, `.not_yet`, `.rejected`, `.countered`, `.counter_accepted`, `.condition_acknowledged`, `.withdrawn`, `.rebased`, `.superseded`, `.evidence_added` and `.evidence_removed`, with the request id as object.

#### Scenario: Audited decision

- **WHEN** a lead rejects a request
- **THEN** the workspace audit has a `change_request.rejected` row whose actor is the lead and whose object is the request id

### Requirement: Reading change requests and decision records

The server SHALL list change requests on `GET /api/v2/workspaces/{ws}/goals/{goal}/change-requests?state=` as `{change_requests}` and across the workspace on `GET /api/v2/workspaces/{ws}/change-requests?state=` as `{waiting_on_me, mine, others}`, each list item being the same object as the single read below, with its `can` flags, including only requests on goals the caller may read (viewers included) and answering 400 for a `state` that is not one of the six states. `waiting_on_me` holds the requests whose `waiting_on_me` is true, `mine` the caller's other requests, and `others` the rest. `GET .../goals/{goal}/change-requests/{id}` SHALL return one request: `id`, `goal:{id, title, version}`, `state`, `revision`, `base_version`, `behind` (true while the request is open and the goal has moved past `base_version`), `requester`, `changes`, `reason` (the requester's), `revisions` (each `{revision, base_version, changes, note, author, created_at, evidence, snapshot}`, with `evidence` and `snapshot` as "Evidence links on change request revisions" and "Align snapshot on each change request revision" describe), a `diff` `{before, after}` of the changed fields (before from the base version, after with the changes applied; once launched, from the resulting version), `approvers` (the effective approval set after the requester rule), `launchers` (the launch set), `approved_by`, `rejected_by`, `decision_note` (the approval note or the rejection reason) also shown as `note` when approved and `rejection_reason` when rejected, `launch` (`pending`, `not_yet`, `launched`, `superseded` or `null`), `launch_decided_by` and `launch_decided_at` (the latest not yet or launch, or `null`), `version` (the goal version the launch created, `null` before it), `condition` (see "Accept if conditions on a counter"), `evidence_count` (the links on the current revision), `approved_without_evidence` (`true` or `false` once approved, else `null`), `can` flags `{approve, approve_and_launch, reject, counter, accept_counter, acknowledge, withdraw, rebase, add_evidence, launch, not_yet}` that are true exactly when the server would accept that action from the caller (`approve` false while `behind`; `approve`, `approve_and_launch` and `launch` false for a decider who can't see a dependency the request adds, see "Nobody approves or launches a dependency they can't see"; all false for a viewer; `approve`, `approve_and_launch` and `launch` false for everyone while the request would close a dependency loop, see "A request that would now close a loop is not approved or launched"), `dependency_not_visible` (that decider's refusal, else `null`), `dependency_loop` (the loop refusal, the same for every reader except that it calls the requester "you", else `null`), `state_note` (what happened to the request in the words a `wrong_state` refusal of an action it no longer allows gives, see "Rejecting and countering a change request": "This request was declined by <name>, so nothing changes.", never "rejected"), `waiting_on_me` (true when the caller's `approve`, `accept_counter` or `launch` flag is, or their `counter` flag on a pending request with `dependency_loop`: an approved request they may launch waits on them whether nobody decided the launch yet or someone said not yet, the same rule as the workspace Home), `created_at`, `updated_at` and `decided_at`. A decided request is its decision record. A request on a goal the caller may not read, or on a goal other than the one in the path, SHALL be 404, and `depends_on` in a diff SHALL list only goals the caller may read (`diff.hidden_depends_on` counts the others, see "Dependencies a decider can't see are refused").

#### Scenario: Viewer reads but cannot act

- **WHEN** a viewer opens a pending request on a workspace goal
- **THEN** the response is 200 with every `can` flag false, and a viewer's `approve` is 403 `read_only`

#### Scenario: Waiting on me

- **WHEN** a team lead calls `GET /api/v2/workspaces/{ws}/change-requests`
- **THEN** pending requests on their team's goals are under `waiting_on_me`, their own requests under `mine`, and the rest they can read under `others`

#### Scenario: Not yet still waits on the launchers

- **WHEN** an approver approves a request and says not yet, and a workspace owner (a launcher) opens the Requests tab and the Home
- **THEN** both list it as waiting on them: `waiting_on_me` is true and the Home has it under "Waiting on you" as "Approved, not launched"

### Requirement: Proposing a reallocation

The server SHALL let a workspace owner or member (viewers 403 `read_only`) propose new target shares on `POST /api/v2/workspaces/{ws}/reallocations {targets:[{goal_id, target_share}], note?}` (browser session, body at most 16 KB) and respond 201 with the reallocation (`id` `rl_…`, `revision: 1`). Each target SHALL name a goal the caller may read (404 otherwise) that is `active` (409 `goal_not_active`), at most once, with `target_share` a whole number from 0 to 100 or `null` (400); `targets` SHALL hold 1 to 50 entries and `note` at most 1000 characters (400). The reallocation SHALL keep only the goals whose target changes, each with the goal's version and target at that time (409 `no_change` when none changes), and SHALL be refused with 409 `targets_over_100` when the workspace's targets with these changes would pass 100. Each kept goal needs one approval from its effective approval set (the requester rule and workspace-owner fallback apply per goal); the requester's own goals are approved by asking. When every goal is then approved the reallocation is `approved` with `launch: "pending"`, else `pending`. Proposing SHALL write no goal version and no directive, and audit `reallocation.requested`.

#### Scenario: Two goals, two approval sets

- **WHEN** a member of team Core proposes GA (owned by Core's lead) from 25 to 15 and GB (owned by a member in no team) from 30 to 40, and a third goal at its current target
- **THEN** the response is 201 `pending` with two targets, GA's approvers the lead and GB's its owner, neither approved, and the third goal left out; a viewer gets 403 `read_only`, another person's private goal 404, GB at 80 409 `targets_over_100`

#### Scenario: Only my own goals

- **WHEN** a goal's owner proposes a new target for their own goal only
- **THEN** the reallocation is `approved` at once with `launch: "pending"`, and the goal keeps its target until it is launched

### Requirement: Approving a reallocation

The server SHALL accept `POST .../reallocations/{id}/approve {revision}` only from someone in the effective approval set of one of its goals (403 `not_an_approver`), only on a `pending` reallocation (409 `wrong_state`) at its current `revision` (409 `stale_revision`), recording the caller's approval for every goal of that revision they may approve for and nobody approved yet (409 `already_approved` when there is none), with audit `reallocation.approval`. When every goal of the current revision is approved the server SHALL set it `approved` with `launch: "pending"` and `decided_at`, audit `reallocation.approved`, and write no goal version and no directive: the goals, the feed and every agent read keep the launched targets until a launch.

#### Scenario: Approved, not launched

- **WHEN** GA's lead approves after GB's owner has
- **THEN** the reallocation is `approved` with `launch: "pending"`, both goals keep their versions and targets, no directive is written and the feed answers 304 to its earlier `ETag`

### Requirement: Launching a reallocation

The server SHALL let someone who is in the launch set of every goal of an approved reallocation (each goal's effective approval set plus every workspace owner) and who can read every goal launch it on `POST .../reallocations/{id}/launch {revision?}` (403 `not_a_launcher` otherwise, 403 `read_only` for a viewer), only while it is `approved` with `launch` `pending` or `not_yet` (409 `wrong_state`) and the workspace's targets with its changes fit in 100 (409 `targets_over_100`). In one transaction the server SHALL set `launch: "launched"` with `launch_decided_by` and `launch_decided_at`, then write each goal's next version with its new target through the single write path every goal version takes (content hash, audit `goal.versioned` by the launcher, `created_by` the person whose approval counted for that goal, one `goal_version` directive for every non-stopped session bound to or governed by it), lowering targets before raising them so the workspace never passes 100 on the way, and audit `reallocation.launched`. `POST .../not_yet` from the same people SHALL record that it waits (`launch: "not_yet"`, audit `reallocation.not_yet`) and publish nothing; a later `launch` replaces it. A `not_yet` on one already `not_yet` SHALL be 409 `wrong_state` and not recorded again, saying "<name> already decided not yet, so nothing changes: agents keep the old targets until someone launches the new ones." ("You already decided not yet, …" to that person; the app's "Recorded: you decided not yet." line uses the same words), and `can.not_yet` SHALL be false while `launch` is `not_yet` (`scripts/test-v2.mjs` "c11 W2 (E2E-WEB cycle 11): ..." and "c11 W2 (ui): ..."). `POST .../approve_and_launch {revision}` SHALL approve and launch in one transaction when the caller's approval completes the reallocation and they may launch it (403 `not_a_launcher`, or 409 `not_ready` when other goals still need an approval; a refusal writes nothing).

#### Scenario: Launch from a full workspace

- **WHEN** the workspace's targets add up to 100 and a launched reallocation lowers a company goal from 40 to 20 and raises GA from 15 to 30
- **THEN** both goals get new versions (the company goal first), the bound sessions get `goal_version` directives carrying the new targets, and each version names as its author the person who approved that goal

#### Scenario: Someone outside a launch set

- **WHEN** GB's owner, who is not in GA's approval set and not a workspace owner, tries to launch a reallocation that changes GA and GB
- **THEN** the response is 403 `not_a_launcher`; a workspace owner who can read both goals may launch it or say not yet

### Requirement: Countering, rejecting and withdrawing a reallocation

The server SHALL let an approver who is not the requester `counter {targets, note?, revision?}` a `pending` reallocation with new targets (validated as on proposing; 409 `targets_over_100`), writing a new revision with each goal's version and target at that time, approving every goal of it the counter's author may approve for, setting `countered` and auditing `reallocation.countered`; approvals of earlier revisions SHALL not count. A counter whose targets are the proposal's own (the same goals with the same targets) SHALL be 409 `no_change` "That's what the proposal already asks for: approve it instead.", as a change request's counter is, and nothing is recorded; the app's counter form SHALL say that sentence and not send such a counter (`scripts/test-v2.mjs` "c13 W5 (E2E-WEB cycle 13): ..."). Only the requester SHALL `accept_counter {revision?}` a `countered` one (403 `not_requester`), which returns it to `pending`, approves the requester's own goals in it and approves it when every goal is approved (audit `reallocation.counter_accepted`). An approver who is not the requester MAY `reject {reason?}` (at most 1000 characters) a `pending` or `countered` reallocation, which becomes `rejected` with `rejected_by`, `rejection_reason` and `decided_at` (audit `reallocation.rejected`); only the requester MAY `withdraw` one (audit `reallocation.withdrawn`). Someone outside every approval set SHALL get 403 `not_an_approver`, any other state 409 `wrong_state`, and a sent `revision` earlier than the current one 409 `stale_revision`; a sent `revision` that is not a whole number from 0 SHALL be 400 "This decision doesn't say which revision you read, so nothing was recorded. Read it again and decide again.", and one higher than the current revision 400 `unknown_revision` "This proposal has no revision <n>: it is at revision <r>, so nothing was recorded. Read it again and decide again.", checked before anything else for every decision on a reallocation (before its body too: a counter's `targets` and `note` and a reject's `reason` are read only after it), never the stale refusal (`scripts/test-v2.mjs` "c11 W3 (E2E-WEB cycle 11): ..." and "c12 C12-2 (E2E-WEB cycle 12): ..."). A `wrong_state` refusal of any action on a reallocation SHALL say what happened in the app's words and who did it, as a change request's does: "This proposal is waiting for approval.", "This proposal was countered by <the counter's author>; review the counter.", "This proposal is already approved.", "This proposal was declined by <name>, so nothing changes." (never "rejected"), "This proposal was withdrawn by <requester>, so nothing changes." or "This proposal was superseded: one of its goals got a newer version or was closed first, so nothing changes."; a launched one says "These targets were already launched by <name>." (`scripts/test-v2.mjs` "C8-1 (target changes): ..."). To the person who did it, it says "you": "You declined this proposal, so nothing changes.", "You withdrew this proposal, so nothing changes.", "You countered this proposal; it waits on <requester> to accept it." (`scripts/test-v2.mjs` "c9 W3: ..."); a stale revision reads "This proposal changed after you read it: it is now at revision <r>. Read it again and decide again.", with "<name> countered it, and it is now at revision <r>" ("you countered it" to its author) while a counter waits on the requester. The app SHALL send the revision on screen with every decision on a reallocation, **Decline**, **Withdraw**, **Launch** and **Not yet** included, so a decision taken on an older view is refused rather than recorded against a counter the person never saw (`scripts/test-v2.mjs` "c10 C10-2 (ui): ...").

#### Scenario: Counter, then accept

- **WHEN** GB's owner counters with GB at 35, and the requester accepts the counter
- **THEN** the reallocation is at revision 2, `pending`, with GB approved by its owner and GA (approved on revision 1) waiting for approval again

#### Scenario: A counter that is the proposal itself

- **WHEN** an approver counters a proposal of trials 30% → 31% with trials at 31%
- **THEN** the response is 409 `no_change` "That's what the proposal already asks for: approve it instead." and the proposal stays `pending` at revision 1

#### Scenario: A revision never reached, with a body that is wrong too

- **WHEN** an approver sends any decision on a reallocation at revision 1 with `revision` 9 and a body that is wrong as well (`targets` that are not a list, a `reason` or `note` over 1000 characters) (`scripts/test-v2.mjs` "c12 C12-2 (E2E-WEB cycle 12): ...")
- **THEN** every one is 400 `unknown_revision` "This proposal has no revision 9: it is at revision 1, …", never the body's refusal, and nothing is recorded; alignments and change requests answer the same for every decision

### Requirement: Reallocations are superseded by a newer goal version

The server SHALL, in the transaction that writes any new version of a goal (an owner's version, a launched change request, or the launch of another reallocation), set every `pending` or `countered` reallocation whose current revision names that goal, and every `approved` one whose `launch` is `pending` or `not_yet`, to `superseded` (with `launch: "superseded"` when it was approved), auditing `reallocation.superseded` with the person whose action wrote the version. A superseded reallocation SHALL never reach agents and SHALL accept no further action (409 `wrong_state`); the requester may propose again.

#### Scenario: The owner edits the goal first

- **WHEN** GA's owner saves a new version while one reallocation changing GA is approved but not launched and another is pending
- **THEN** both are `superseded` (the first with `launch: "superseded"`), launching the first is 409, and GA keeps the owner's target

### Requirement: Reading reallocations

The server SHALL list on `GET /api/v2/workspaces/{ws}/reallocations` (browser session) the reallocations the caller can read, newest change first and at most 200, as `{waiting_on_me, mine, others}`, and serve one on `GET .../reallocations/{id}`. A reallocation SHALL be readable by everyone who can read at least one of its goals (viewers included, with every `can` flag false) and 404 to anyone else. Each SHALL be `{id, state, revision, requester, targets, note, history, launch, launch_decided_by, launch_decided_at, rejected_by, rejection_reason, waiting_on_me, can, created_at, updated_at, decided_at}`, where each target is `{goal:{id, title}, from_share, current_share, target_share, base_version, approvers, approved_by, approved}` for a goal the caller can read, and `{goal: null, …}` with every number `null` and no approvers for one they cannot; `history` lists each revision's author, note and time; `can` holds `{approve, approve_and_launch, launch, not_yet, counter, accept_counter, reject, withdraw}`, true exactly when the server would accept that action; and `waiting_on_me` is true when the caller's `approve` or `accept_counter` flag is, or their `launch` flag while `launch` is `pending`.

#### Scenario: A viewer reads

- **WHEN** a viewer opens a pending reallocation on workspace goals
- **THEN** the response is 200 with the targets and approvers and every `can` flag false; a non-member gets 404

### Requirement: Align snapshot on each change request revision

The server SHALL, in the transaction that writes each change request revision (creation, `counter` and `rebase`), record a snapshot of the goal computed by the server alone and store it with that revision: `recorded_at` (the revision's time), `window` `{from, to, days: 30}` (the 30 days before it), `spend` `{total, by_model}` (the goal's usage in that window, summed exactly as the Spend tab sums a goal's row, `total` and one row per `model`, each with the same token, request and `est_list_usd_micros` sums and `by_basis`), `bound_sessions` (the number of sessions that a new goal version would reach: not stopped, and whose open epoch is bound to the goal or that the goal governs) and `last_activity_at` (the latest usage request, epoch start or work signal on the goal, or `null`). No field of a request body SHALL reach a snapshot, and a stored snapshot SHALL never change. Each revision SHALL be read with `snapshot` `{revision, recorded_by: "align", recorded_at, window, spend, spend_hidden, bound_sessions, last_activity_at}`, where `spend` is `null` and `spend_hidden` `true` for a reader whose role does not allow `spend.read`; a revision stored without a snapshot reads `snapshot: null`.

#### Scenario: Snapshot at proposal

- **WHEN** a session bound to a goal uploaded two requests in the last day (models A and B) and one 40 days ago, and a member proposes a change to that goal
- **THEN** revision 1's snapshot holds the two recent requests in `spend.total`, one `by_model` row each for A and B, `bound_sessions: 1` and the latest of the epoch start and the requests as `last_activity_at`

#### Scenario: A client cannot supply a snapshot

- **WHEN** a proposal body carries a `snapshot` field
- **THEN** the request is created with the snapshot the server computed

#### Scenario: Counter records its own snapshot

- **WHEN** an approver counters a request
- **THEN** revision 2 carries a new snapshot with `revision: 2`, and revision 1 keeps its own

### Requirement: Evidence links on change request revisions

The server SHALL accept `POST /api/v2/workspaces/{ws}/goals/{goal}/change-requests/{id}/evidence {kind, url, label, revision?}` (browser session or device token, body at most 8 KB) and add the link to the request's current revision, responding 201 `{evidence, change_request}`. `kind` SHALL be one of `pr`, `ci_run`, `incident`, `dashboard`, `doc` and `other`; `url` an `https:` URL with a host and no user name or password, at most 2048 characters, stored as parsed; `label` 1 to 120 characters on one line after trimming; anything else 400. Each link SHALL store `id` (`ev_…`), `revision`, `kind`, `url`, `label`, `added_by` (the caller), `added_at` and `source`: `person` when added with a browser session, `agent` when added with a device token or through the MCP tool `align_add_change_request_evidence` (offered only to an app the person allowed the scope `changes:evidence`; see `mcp`). Each revision SHALL hold at most 10 links (409 `too_much_evidence`), and the same `url` twice on one revision SHALL be 409 `duplicate_evidence`. Every reader of the request SHALL get each revision's links as `evidence`, oldest first, each `{id, revision, kind, url, label, source, reported_as, added_by:{id, name}, added_at, can_remove}`, where `reported_as` is `self-reported` for `person` and `agent-reported` for `agent`. The server SHALL never mark a link verified, and SHALL never block an action because of evidence. Adding writes audit action `change_request.evidence_added`.

#### Scenario: Requester adds a PR from the web

- **WHEN** the requester POSTs `{kind:"pr", url:"https://github.com/acme/platform/pull/42", label:"Pen-test scope PR", revision:1}` to a pending request at revision 1
- **THEN** the response is 201 with `evidence.source: "person"`, `reported_as: "self-reported"`, `added_by` the requester and `revision: 1`, and the audit has `change_request.evidence_added` by the requester

#### Scenario: Added with a device token

- **WHEN** the requester's paired device POSTs a link with its access token
- **THEN** the link has `source: "agent"` and `reported_as: "agent-reported"`, wherever it is shown

#### Scenario: Unsafe or oversized links

- **WHEN** a link's `url` is `http:`, `javascript:`, carries a password or exceeds 2048 characters, or its `label` exceeds 120 characters, or its `kind` is not listed
- **THEN** the response is 400 and nothing is stored

#### Scenario: Eleventh link

- **WHEN** a revision already holds 10 links and someone adds another
- **THEN** the response is 409 `too_much_evidence`

### Requirement: Who adds and removes evidence

The server SHALL let only the requester and the members of the request's effective approval set add evidence (403 `not_involved` for anyone else who can read the request, 403 `read_only` for a viewer, 404 for a request on a goal the caller may not read or on another goal than the path's), only while the request is `pending` or `countered` (409 `wrong_state`, checked after who the caller is, in the words every `wrong_state` refusal of a change request gives: "This request was declined by <name>, so nothing changes.", "This request was withdrawn by <requester>, so nothing changes.", "This request was already approved by <approver>." or the superseded sentence, never "This request is rejected"), and only to its current revision (a sent `revision` other than the current one is 409 `stale_revision` "This request changed after you read it: it is now at revision <r>. Add the link again if it supports that revision.", with "<name> countered it, and it is now at revision <r>" after a counter, never "reload and try again"; a link already on the revision is 409 `duplicate_evidence` "This link is already on revision <r>, so it isn't added twice.": `scripts/test-v2.mjs` "c9 W6: ..."). Each link is its adder's own: an approver's link names the approver. The server SHALL let only a link's author remove it, on `DELETE .../change-requests/{id}/evidence/{evidence}` (browser session or device token), responding with the request and writing audit action `change_request.evidence_removed`; another person gets 403 `not_evidence_author`, a viewer 403 `read_only`, and an unknown link 404. A link SHALL be frozen, neither changed nor removed (409 `evidence_frozen`), once its revision is no longer current ("This link is on revision <n>, and the request has moved on to revision <r>, so the link is kept as it was.") or the request is no longer open (in the words every `wrong_state` refusal of a change request gives, as adding one does: "This request was declined by <name>, so nothing changes.": `scripts/test-v2.mjs` "c9 W1: ..."); there is no way to edit a link. A link's `can_remove` SHALL be true exactly when its reader could remove it.

#### Scenario: Approver adds and removes their own

- **WHEN** a team lead who may approve a pending request adds a dashboard link and later removes it
- **THEN** both succeed; the lead's attempt to remove the requester's link is 403 `not_evidence_author`

#### Scenario: Frozen after a counter

- **WHEN** an approver counters a request whose revision 1 has links and the requester tries to remove one of them
- **THEN** the response is 409 `evidence_frozen`, revision 1 keeps its links with `can_remove: false`, and revision 2 starts with none

#### Scenario: Decided request

- **WHEN** a request is approved and anyone adds or removes a link
- **THEN** adding is 409 `wrong_state` "This request was already approved by <approver>." and removing is 409 `evidence_frozen` with the same sentence

#### Scenario: Evidence on a request declined meanwhile

- **WHEN** an approver declines a request and its requester then adds a link to it (`scripts/test-v2.mjs` "C8-1: ...")
- **THEN** the response is 409 `wrong_state` "This request was declined by <approver>, so nothing changes." and no link is added

#### Scenario: Removing a link from a request declined meanwhile

- **WHEN** an approver declines a request and its requester then removes their own link from it (`scripts/test-v2.mjs` "c9 W1: ...")
- **THEN** the response is 409 `evidence_frozen` "This request was declined by <approver>, so nothing changes.", the link stays, and the approver hears "You declined this request, so nothing changes." for the same action

### Requirement: Approving without evidence

The server SHALL approve a revision that has no evidence links like any other, and SHALL record it: the request's `approved_without_evidence` SHALL be `true` (and `false` when the approved revision had at least one link), and the approval SHALL write audit action `change_request.approved_without_evidence`, with the approver as actor and the request as object, in addition to `change_request.approved`. Links on earlier revisions do not count for the approved revision.

#### Scenario: No links on the approved revision

- **WHEN** an approver approves revision 2 of a request whose links are all on revision 1
- **THEN** the request is `approved` with `approved_without_evidence: true`, and the audit has both `change_request.approved` and `change_request.approved_without_evidence` by the approver

#### Scenario: Approved with a link

- **WHEN** an approver approves a revision that holds one link
- **THEN** `approved_without_evidence` is `false` and no `change_request.approved_without_evidence` row is written

### Requirement: Change request controls in the app

The goal page SHALL offer **Propose a change** on any `active` goal the person can read but does not own, unless they are a viewer, and a "Change requests" list whose approve, approve and launch, reject and counter controls appear only for people in the goal's approval set, whose launch and not yet controls appear only for the request's launch set, and whose acknowledge control appears only for the requester; the workspace SHALL have a "Requests" tab, read from `GET /api/v2/workspaces/{ws}/change-requests`, with the groups waiting on me, mine and others, each control appearing only when the server's `can` flag allows it. The "Requests" tab SHALL show change requests only; alignments keep their own "Alignments" tab.

#### Scenario: Non-owner proposes from the goal page

- **WHEN** a member opens a goal they do not own
- **THEN** the page shows **Propose a change**, which posts to `.../goals/<goal>/change-requests` with the current version as `base_version`

### Requirement: Creating the Northstar sample workspace

The server SHALL let any signed-in person (browser session, in Mode L and hosted) call `POST /api/v2/workspaces/sample` and SHALL create, in one transaction, a new workspace named "Northstar (sample)" owned by the caller, responding 201 `{id:"ws_…", name:"Northstar (sample)", role:"owner"}`. It SHALL count toward the same limits as any workspace creation (429 `rate_limited`) and, when hosted, pass the same creation gate and caps (`creation_code` in the body, as `workspaces` specifies), and the result SHALL be ordinary data that can be renamed or deleted like any workspace.

#### Scenario: Creating the sample twice

- **WHEN** a person calls `POST /api/v2/workspaces/sample` twice
- **THEN** two separate workspaces named "Northstar (sample)" exist, each owned by them

### Requirement: Northstar sample contents

The sample workspace SHALL contain teams Product and Security with the caller as lead of both; a company goal "Expand to regulated customers"; two team goals with visibility `workspace`, "Ship self-serve onboarding" (team Product) and "Pass the security review" (team Security, with one `must_not` limit "Push the pen-test window past May" from a meeting), each contributing to the company goal through an approved `contribution` alignment requested and approved by the caller; "Ship self-serve onboarding" `depends_on` "Pass the security review"; and one pending change request on "Pass the security review" from the caller whose reason explains why the sample shows it. Every goal is owned by the caller and every audit row names the caller. Because the caller owns the Security goal, the sample request is seeded directly rather than through the create route, and the caller can approve, counter, reject, withdraw or rebase it.

#### Scenario: Sample goal tree

- **WHEN** the caller reads the sample's goals feed
- **THEN** both team goals list the company goal in `contributes_to` with `stale: false`, and "Ship self-serve onboarding" lists "Pass the security review" in `depends_on`

#### Scenario: Acting on the sample request

- **WHEN** the caller approves the pending sample change request at its current revision
- **THEN** "Pass the security review" moves to version 2 and the request becomes `approved` with `approved_by` the caller

### Requirement: Sample offer for a person with no workspaces

The `/app` page SHALL offer **Create the Northstar sample** when the signed-in person has no workspaces, calling `POST /api/v2/workspaces/sample` and opening the new workspace.

#### Scenario: First visit

- **WHEN** a person with no workspaces opens `/app`
- **THEN** the page shows **Create the Northstar sample** alongside creating their own workspace

### Requirement: Who sends requests and holds to a goal's agents

The server SHALL let a person send requests to the agents on a goal, hold them and release them only when they can read the goal and are in its approval set (its owner, the leads of its owning team, and for a company goal the workspace owners, keeping only members with role owner or member) or are a workspace owner, answering 404 for a goal the caller cannot read, 403 `read_only` to a viewer and 403 `not_approver` to anyone else.

#### Scenario: Team member who is not the lead

- **WHEN** a member of a goal's team who neither owns the goal nor leads the team sends `POST /api/v2/workspaces/{ws}/goals/{goal}/requests` with `{type: "checkpoint"}`
- **THEN** the response is 403 `not_approver` and no request, directive or audit row is written

#### Scenario: Workspace owner outside the approval set

- **WHEN** a workspace owner who is not in a team goal's approval set sends a `replan` to it
- **THEN** the response is 201 and the request names the workspace owner as its sender

### Requirement: Sending a request to a goal's agents

The server SHALL accept `POST /api/v2/workspaces/{ws}/goals/{goal}/requests` with a JSON body of at most 4096 bytes `{type, note?, session_keys?, target_goal_id?}`, where `type` is `replan`, `checkpoint` or `switch_goal` and `note` is at most 280 characters, from a person who may send requests to that goal, and SHALL, in one transaction, write a `v2_requests` row (`rq_<24 base32>`, the goal and its version at sending, the type, the note, the sender and their role: `approver` when in the goal's approval set, else `owner`), one `v2_request_targets` row in state `sent` per target session, one `request` directive to those sessions and the audit row `request.sent`, and answer 201 `{request}` with the request as the goal's request list shows it. The targets SHALL be the sessions the goal reaches (not stopped, and bound to the goal by their open epoch or governed by it); `session_keys` (1 to 20) SHALL narrow them, and a key that is not one of them SHALL be 400. The server SHALL answer 409 `wrong_state` when the goal is achieved or dropped, 409 `no_sessions` when there is no target, 400 for `target_goal_id` on a type other than `switch_goal`, and 400 for a malformed field. Align writes the wording the developer and the agent see for each type; the server stores no instruction text other than the quoted note.

#### Scenario: Checkpoint to every session on the goal

- **WHEN** the goal's owner sends `{type: "checkpoint", note: "Before the demo"}` while two shared sessions are bound to the goal
- **THEN** the response is 201 with `request.state` `open`, `counts.pending` 2 and both sessions in state `sent`, and one `request` directive lists both session keys

#### Scenario: Goal nobody works on

- **WHEN** an approver sends a request to an active goal that no shared session is bound to or governed by
- **THEN** the response is 409 `no_sessions`

### Requirement: Switch goal requests name sessions and a bindable goal

The server SHALL require, for a `switch_goal` request, `session_keys` (1 to 20 sessions on the goal) and `target_goal_id`, a goal other than this one that the sender can read (else 404), and SHALL answer 409 `not_bindable`, naming no goal, session or person, unless the target goal is active and every chosen session's owner may bind that session to it now (their own goal, their team's goal, or an approved allocation transfer for that session).

#### Scenario: Target the session's owner cannot bind

- **WHEN** an approver asks a member's session to switch to a workspace-visible goal owned by someone in no shared team with that member
- **THEN** the response is 409 `not_bindable` and its message names neither the goal nor its owner

#### Scenario: Switch to a team goal

- **WHEN** a team lead asks one of a team member's sessions to switch to another active goal of that team
- **THEN** the response is 201, the request's `target_goal` is `{id, title, version}`, and the `request` directive targets only that session

### Requirement: One open request per goal and type, and an hourly limit

The server SHALL refuse a request with 409 `already_open` while another request of the same type on the same goal is not cancelled and at least one of its sessions is still `sent` or `received`, and with 429 `rate_limited` when its sender has already sent 20 requests in the last hour (in any workspace).

#### Scenario: Second checkpoint while the first waits

- **WHEN** an approver sends a second `checkpoint` to a goal while a session has not answered the first
- **THEN** the response is 409 `already_open`, while a `replan` to the same goal is accepted

### Requirement: Cancelling a request

The server SHALL let the request's sender or a workspace owner cancel it with `DELETE /api/v2/workspaces/{ws}/goals/{goal}/requests/{id}`, answering 403 `not_sender` to anyone else who may write (403 `read_only` to a viewer) and 404 for a request not on that goal, and SHALL, in one transaction, set `cancelled_at` and `cancelled_by`, write a `request` directive with `request.cancelled` true to the sessions still `sent` or `received`, set those sessions' state to `expired` (sessions that already answered keep their answer), and write the audit row `request.cancelled`, answering 200 `{request}`. Cancelling a cancelled request SHALL change nothing and answer 200.

#### Scenario: Owner withdraws a replan one developer declined

- **WHEN** a workspace owner cancels a replan that one session declined and another has not answered
- **THEN** only the unanswered session gets a cancelled `request` directive and becomes `expired`, the declined one stays `declined`, and `request.state` is `cancelled`

### Requirement: Requests expire when their goal is achieved or dropped

The server SHALL, in the transaction that gives a goal status `achieved` or `dropped` (the one that writes that version, an owner's version or a launched change request), after its `goal_version` directive and before any `release` directive, end every request on that goal, and every `switch_goal` request toward it, that is not cancelled and still has a session `sent` or `received`: write a `request` directive with `request.cancelled` true and `request.cancel_reason` `goal_closed` to those sessions, set their state to `expired` (sessions that already answered keep their answer, and the request is not marked cancelled), and write the audit row `request.expired` naming the person whose action changed the status, with the request id as object. A receipt for such a session SHALL leave it `expired`.

#### Scenario: Achieving a goal with a checkpoint still waiting

- **WHEN** the owner of a goal saves a version with `status: "achieved"` while one session has received a checkpoint and not answered it and another session already declined a replan
- **THEN** the same transaction writes the `goal_version` directive and then a `request` directive with `cancelled` true and `cancel_reason` `goal_closed` to the session that had not answered; that session reads `expired`, the request's `state` is `expired`, the declined replan is unchanged, the audit has `request.expired` by the owner, and a later `accepted` receipt leaves the session `expired`

#### Scenario: Dropping the target of a switch

- **WHEN** a goal that a pending `switch_goal` request names as its target is dropped
- **THEN** the request's sessions that had not answered get a cancelled `request` directive with `cancel_reason` `goal_closed` and become `expired`

### Requirement: Reading a goal's requests

The server SHALL answer `GET /api/v2/workspaces/{ws}/goals/{goal}/requests` for anyone who can read the goal with `{requests, can_send, sessions, hold}`: the newest 50 requests on the goal, each `{id, type, goal:{id, title, version}, target_goal, note, sender: {id, name, role}, created_at, cancelled_at, cancelled_by, state, expired_reason, counts, sessions, can_cancel}` with `state` `open` (a session still pending), `cancelled`, `expired` (not cancelled, and every session expired before any answered: because the goal closed, or because the session ended or its person stopped sharing it) or `answered`, `expired_reason` null unless `state` is `expired`, and then `sessions_ended` when every session it waited on ended (its device signed out, or its person was removed from the workspace, left it or deleted their account) or was stopped by its person (Stop sharing, which expires the requests still waiting on that session in its transaction; E2E-AGENT cycle 13) and `goal_closed` otherwise, `counts` `{pending, accepted, declined, expired, not_declined}` (`accepted`: the developer's own accepts only; `not_declined`: accepted with `auto_accepted`, delivered to the agent and not declined, never counted in `accepted` and never called done), and `sessions` rows `{session_key, owner, mine, repo_alias, harness, title, started_at, state, ended_reason, auto_accepted, updated_at}` (`started_at` when the session started, so two sessions of one person in one repository can be told apart) where `state` is `sent`, `received`, `accepted`, `declined` or `expired`, `ended_reason` is `device_signed_out` or `member_removed` on a row that expired because its session ended that way (it stays when the session is later shared again) and null otherwise, and `title` is shown only on the reader's own sessions. The sender, the goal's approval set and workspace owners SHALL get every session's row; anyone else only their own sessions' rows, with the counts. `target_goal` SHALL be `{id: null, title: null, version: null, private: true}` for a reader who cannot read that goal. `can_send` SHALL be true only for a person who may send requests while the goal is active, `sessions` SHALL list the sessions on the goal (`{session_key, owner, mine, repo_alias, harness, title, started_at}`, `title` only on the reader's own sessions) for such a person and be null otherwise, and `hold` SHALL be as `GET …/hold` answers.

#### Scenario: A request whose sessions ended

- **WHEN** a checkpoint waits on one session each on four goals, and then that session's person is removed from the workspace, its device signs out, its person signs out everywhere with "Also unpair all my devices", or its person deletes their account; and a fifth waits on a goal that is achieved (`scripts/test-v2.mjs` "C3-1: a request whose sessions ended reads expired with expired_reason sessions_ended ...")
- **THEN** the first four requests read `state` `expired` with `expired_reason` `sessions_ended`, their rows `expired` with `ended_reason` `member_removed` (removed, account deleted) or `device_signed_out` (signed out, signed out everywhere with devices); the fifth reads `expired_reason` `goal_closed` with no `ended_reason`; and the removed person's request still reads `sessions_ended` once they are a member again

#### Scenario: A member who reads the goal but has no session on it

- **WHEN** a member in no team reads the requests of a workspace-visible goal whose only sessions belong to someone else
- **THEN** each request has `counts` and an empty `sessions` list, and `can_send` is false

### Requirement: Holding a goal's agents

The server SHALL accept `PUT /api/v2/workspaces/{ws}/goals/{goal}/hold` with `{reason?}` (at most 280 characters) from a person who may send requests to the goal and whose sign-in is from the last 15 minutes (else 403 `reauth_required`, checked after 404 and the other 403s), and SHALL, in one transaction, write a `v2_goal_holds` row (who, why, when), a `hold` directive to every session the goal reaches, the audit row `goal.held` and the product event `first_hold`, answering 201 `{held: {held_by, reason, held_at}, can_hold}`. When the goal is already held it SHALL answer 200 with the current hold and write nothing; when the goal is achieved or dropped, 409 `wrong_state`. `GET …/hold` SHALL answer `{held, can_hold}` (`held` null when not held) to anyone who can read the goal, and `GET /api/v2/workspaces/{ws}/holds` SHALL list `{goal:{id, title}, held_by, reason, held_at}` for the held goals the caller can read.

#### Scenario: Hold with a stale sign-in

- **WHEN** a goal's lead who signed in 20 minutes ago holds the goal
- **THEN** the response is 403 `reauth_required` and nothing is written

#### Scenario: Holding twice

- **WHEN** an approver holds a goal that is already held
- **THEN** the response is 200 with the first hold's reason and time, and no new directive is written

### Requirement: Releasing a goal hold

The server SHALL accept `DELETE /api/v2/workspaces/{ws}/goals/{goal}/hold` from the people who may hold the goal, with a sign-in from the last 15 minutes, and SHALL, in one transaction, write a `release` directive to every session a hold directive of this hold reached (including one that has since left the goal) and every session the goal reaches, delete the `v2_goal_holds` row and write the audit row `goal.released`, answering 200 `{held: null, can_hold}`; releasing a goal that is not held SHALL change nothing. The transaction that gives a held goal status `achieved` or `dropped` SHALL release it the same way, with the person whose action changed the status as actor.

#### Scenario: Achieving a held goal

- **WHEN** the owner of a held goal saves a version with `status: "achieved"`
- **THEN** the same transaction writes a `goal_version` directive and then a `release` directive, the goal is no longer held, and a later hold or request on it answers 409 `wrong_state`

### Requirement: Request and hold audit and events

The server SHALL write audit rows naming the actor for `request.sent`, `request.cancelled` and `request.expired` (the request id as object), for the answers that change a session's request state (`request.accepted`, `request.not_declined`, `request.declined`, as the `directives` part specifies), and for `goal.held` and `goal.released` (the goal id as object), and record the product events `first_request` (props `{type}`) and `first_hold` (no props) once per workspace in the transaction of the first request and the first hold.

#### Scenario: First request in a workspace

- **WHEN** the first request in a workspace is a `checkpoint` and a `replan` follows
- **THEN** the workspace has exactly one `first_request` event, with props `{"type": "checkpoint"}`

## Open questions

- When the requester is the only person who could approve a goal's requirement and no other workspace owner exists, the request stays open indefinitely; should it instead be refused up front?
- A reallocation is superseded by any newer version of one of its goals, even one that leaves the target alone (a title edit), and the requester proposes again; a change request instead becomes `behind` and is rebased. Should reallocations get a rebase too, or is starting again right for a numbers-only proposal?
- A workspace owner who cannot read a private goal in a reallocation (only its owner can propose one, for their own goal) sees it unnamed and cannot launch it; the goal's owner can. Is that the right split, or should a reallocation refuse private goals?

## Sources

- `lib/v2/goals.ts`
- `lib/v2/reallocations.ts`
- `lib/v2/allocation.ts` (`feedAllocation` only)
- `lib/v2/steering.ts` (`workspaceSteering` only)
- `lib/v2/requests.ts`
- `lib/v2/approval.ts`
- `lib/v2/alignments.ts`
- `lib/v2/changes.ts`
- `lib/v2/changes-read.ts`
- `lib/v2/launch-words.ts`
- `lib/v2/evidence.ts`
- `lib/v2/spend.ts` (`goalSpend` only)
- `lib/v2/sample.ts`
- `lib/v2/goal-limits.ts`
- `lib/v2/limit-suggest.ts`
- `lib/v2/limits.ts` (`takeAll` only)
- `lib/v2/events.ts`
- `lib/v2/policy.ts`
- `lib/v2/lifecycle.ts`
- `lib/v2/validate.ts`
- `lib/v2/directives.ts` (`goalTargets`, `goalVersionDirective`, `writeDirective` only)
- `lib/v2/sessions.ts` (`sessionRow`, `openEpoch`, the epoch binding check only)
- `lib/v2/workspaces.ts` (`need`, `memberName`, `memberPrincipal`, `createWorkspace` only)
- `lib/v2/db.ts`
- `lib/v2/errors.ts`
- `lib/v2/http.ts`
- `docs/v2/WIRE.md`
- `app/api/v2/workspaces/sample/route.ts`
- `app/api/v2/workspaces/[ws]/goals/route.ts`
- `app/api/v2/workspaces/[ws]/goals/[goal]/route.ts`
- `app/api/v2/workspaces/[ws]/goals/[goal]/versions/route.ts`
- `app/api/v2/workspaces/[ws]/goals/[goal]/review/route.ts`
- `app/api/v2/workspaces/[ws]/goals/[goal]/requests/route.ts`
- `app/api/v2/workspaces/[ws]/goals/[goal]/requests/[id]/route.ts`
- `app/api/v2/workspaces/[ws]/goals/[goal]/hold/route.ts`
- `app/api/v2/workspaces/[ws]/holds/route.ts`
- `app/api/v2/workspaces/[ws]/goals/[goal]/change-requests/route.ts`
- `app/api/v2/workspaces/[ws]/goals/[goal]/change-requests/[id]/route.ts`
- `app/api/v2/workspaces/[ws]/goals/[goal]/change-requests/[id]/[action]/route.ts`
- `app/api/v2/workspaces/[ws]/goals/[goal]/change-requests/[id]/evidence/route.ts`
- `app/api/v2/workspaces/[ws]/goals/[goal]/change-requests/[id]/evidence/[evidence]/route.ts`
- `app/api/v2/workspaces/[ws]/change-requests/route.ts`
- `app/api/v2/workspaces/[ws]/limits/suggest/route.ts`
- `app/api/v2/workspaces/[ws]/alignments/route.ts`
- `app/api/v2/workspaces/[ws]/alignments/[id]/route.ts`
- `app/api/v2/workspaces/[ws]/alignments/[id]/[action]/route.ts`
- `app/api/v2/workspaces/[ws]/reallocations/route.ts`
- `app/api/v2/workspaces/[ws]/reallocations/[id]/route.ts`
- `app/api/v2/workspaces/[ws]/reallocations/[id]/[action]/route.ts`
- `app/app/view.tsx`
- `app/app/_ui/kit.tsx`
- `app/app/_ui/changes.tsx`
- `app/app/_ui/limits.tsx`
- `app/app/_ui/reallocations.tsx`
- `app/app/w/[ws]/goals/[goal]/view.tsx`
- `app/app/w/[ws]/requests/view.tsx`
- `app/app/w/[ws]/alignments/view.tsx`
- `scripts/test-v2.mjs`
