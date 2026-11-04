---
name: Product events and metrics
summary: The content-free product events Align records from an access request to a workspace's first MCP read and the decision value card, the operator-recorded LOI events, and the operator's report of the funnel, time to first value, weekly active workspaces, cohort retention, goal binding, decision value and LOIs.
kind: area
---

# Product events and metrics

Align measures activation and retention without reading anyone's work. At fixed code points the server appends a
**product event** to its own database: what happened, in which workspace, when, and a keyed hash that stands for the
person, with a few allowlisted kinds or counts. An event never holds an email address, a name, a title, goal text, a
URL, a repository, a code or a token. Nothing is sent to a third party, there is no analytics service and no screen:
the operator reads the numbers with `node scripts/align-admin.mjs report`. Mode L records the same events on the
person's own machine, where they stay.

The convention follows the project's metrics issue: nothing is fabricated or self-asserted. Completions, organisations,
customer counts and revenue are never invented, and a letter of intent counts as signed only when the operator records
it with the countersigned original in hand.

Vocabulary:

| Term | Meaning |
| --- | --- |
| Product event | A row of `v2_events`: `id`, `name`, `ws_id` (or none), `actor` (or none), `at` and `props` (a JSON object) |
| Actor | HMAC-SHA256 of the person's user id under the server secret (`ALIGN_SECRET`, or Mode L's generated one), base64url, prefix `ale.`; none for operator events and access requests |
| First-time event | An event recorded at most once per workspace (`first_…`, `workspace_created`, `code_redeemed`, `second_member_joined`, `loi_sent`, `loi_signed`) |
| Once-per-person event | An event recorded at most once per person in a workspace (`member_first_session_captured`, `value_card_viewed`, `value_reported`, `follow_up_clicked`); a row whose actor was cleared no longer counts |
| Value card | The "What this decision gave you" card on an approved change request (the `interface` part); its value reports are stored in `v2_value_reports`, never in an event |
| Sample workspace | A workspace whose `workspace_created` event has `kind` `sample`; it is left out of every workspace count in the report |
| Week | Monday 00:00 UTC to the next Monday 00:00 UTC |
| Active workspace | A workspace that, in a given week, had a session shared to it, a binding epoch opened or usage uploaded (`v2_sessions.created_at`, `v2_epochs.created_at`, `v2_usage.received_at`), or an action by a person in its audit log (a `v2_audit` row of the workspace with an actor); operator actions, which have no actor, don't count |
| Creation cohort | The non-sample workspaces whose `workspace_created` falls in one week |
| LOI | A non-binding letter of intent from a workspace's organisation, recorded only by the operator |

The events, where they are recorded and what they may carry:

| Event | Recorded when | Workspace, actor | props |
| --- | --- | --- | --- |
| `access_requested` | a new access request is stored (sending again for a pending one records nothing) | none, none | `interest`: `try` or `evaluate`; `via`: `form` or `value_card` |
| `access_approved` | the operator approves a request | none, none | none |
| `access_declined` | the operator declines a request | none, none | none |
| `code_created` | a creation code is made | none, none | `source`: `request` or `operator` |
| `code_redeemed` | a creation code is spent creating a workspace | the workspace, its creator | none |
| `workspace_created` | a workspace is created | the workspace, its creator | `kind`: `blank` or `sample` |
| `invite_sent` | an invite is created | the workspace, the inviter | `role` |
| `invite_accepted` | an invite is accepted | the workspace, the new member | `role` |
| `device_paired` | a device's pairing completes, once per workspace it was granted | each workspace, the person | `workspaces`: how many it was granted |
| `first_session_captured` | the workspace's first shared session | the workspace, the person | `harness` |
| `member_first_session_captured` | a person's first shared session in the workspace | the workspace, the person | `harness` |
| `first_session_bound` | the first binding epoch in the workspace that names a goal (first value) | the workspace, the person | `harness`, `authority`: `own`, `pod` or `alignment` |
| `second_member_joined` | an accepted invite brings the workspace to two members | the workspace, the new member | none |
| `first_change_request` | the workspace's first change request made through the API or web app | the workspace, the requester | none |
| `first_approval` | the workspace's first approved change request (launched or not; unchanged by the launch step) | the workspace, the approver | none |
| `first_launch` | the workspace's first launch of an approved change request (alone or in an approve and launch) | the workspace, the launcher | none |
| `first_directive` | the workspace's first directive that reached a session | the workspace, none | `kind` |
| `first_mcp_read` | the workspace's first MCP tool call | the workspace, the person | `client`: `app` or `device` |
| `loi_sent` | the operator records it | the workspace, none | `note_ref` |
| `loi_signed` | the operator records it with `--verified-original` | the workspace, none | `note_ref`, `verified_original`: `yes` |
| `first_ask` | the workspace's first ask, recorded or imported (the `workspaces` part) | the workspace, the person | none |
| `first_limit` | the workspace's first goal version saved with at least one limit (the `goals-and-proposals` part) | the workspace, the person | none |
| `value_card_viewed` | a person's value card was at least half on screen, the first time in the workspace | the workspace, the person | none |
| `value_reported` | a person's first value report in the workspace | the workspace, the person | `estimate`: `same_day`, `two_to_three_days`, `about_a_week`, `longer` or `would_not_be_decided` |
| `follow_up_clicked` | a person's first click on the value card's follow-up link in the workspace | the workspace, the person | none |
| `first_request` | the workspace's first request to a goal's agents (the `goals-and-proposals` part) | the workspace, the sender | `type`: `replan`, `checkpoint` or `switch_goal` |
| `first_hold` | the workspace's first goal hold | the workspace, the person who held it | none |

## Requirements

### Requirement: Product events

The server SHALL append a product event to `v2_events` at each code point in the events table above, inside the
transaction of the action it records (so an action that fails records nothing), except the first MCP read, which a
read-only tool call records in its own short transaction without ever failing the read; it SHALL record a first-time
event at most once per workspace and a once-per-person event at most once per person in a workspace, enforced by unique
partial indexes that ignore a row with no actor; it SHALL keep the table append-only (a trigger refuses changing an event's id, name, time or
props); and it SHALL do the same in Mode L, where the events stay on the person's machine and nothing is sent anywhere.

#### Scenario: First-time events once

- **WHEN** a workspace's members share three sessions, bind two of them to goals, make two change requests, approve one, launch it, stop an agent and read through MCP twice
- **THEN** `first_session_captured`, `first_session_bound`, `first_change_request`, `first_approval`, `first_launch`, `first_directive` and `first_mcp_read` each appear once for the workspace, `member_first_session_captured` once per person who shared, and a second first-time row for the workspace is refused by the database

#### Scenario: Approval and launch are separate events

- **WHEN** an approver approves a workspace's first change request and nobody launches it
- **THEN** the workspace has `first_approval` and no `first_launch` (and the approval wrote no directive, so no `first_directive` from it); the launch then records `first_launch`, with no props, once

#### Scenario: Sample workspace

- **WHEN** a person creates the sample workspace, which seeds goals, alignments and a change request
- **THEN** it records `workspace_created` with `kind` `sample` and no `first_change_request`

#### Scenario: Value events once per person

- **WHEN** one person's value card is viewed twice, on two approved change requests, they report an estimate on both and click the follow-up link twice, and a second person views the card
- **THEN** the workspace holds one `value_card_viewed`, one `value_reported` (with the first estimate) and one `follow_up_clicked` for the first person, and one `value_card_viewed` for the second; a second call answers `recorded: false`

#### Scenario: Pairing for several workspaces

- **WHEN** a device's pairing completes with grants for two workspaces
- **THEN** each workspace gets one `device_paired` event with `workspaces` 2

#### Scenario: Failed approval email

- **WHEN** the operator approves an access request and the email carrying its code fails
- **THEN** the code is revoked, the request is pending again, and its `access_approved` and `code_created` events are removed

### Requirement: Value events need an approved request

`POST /api/v2/workspaces/{ws}/goals/{goal}/change-requests/{id}/value` (the `interface` part's value card) SHALL record
nothing, and answer `409 not_approved`, for a change request that is not approved; `404` for one the person can't read;
and SHALL record `value_card_viewed`, `follow_up_clicked` and `value_reported` only with the props in the events table,
never the change request, the goal or a value report's note.

#### Scenario: Pending request

- **WHEN** a reader posts `{action: "viewed"}` for a pending change request
- **THEN** the answer is `409 not_approved` and no event is added

#### Scenario: The estimate only

- **WHEN** a person reports `about_a_week` with a note on an approved change request
- **THEN** the `value_reported` event holds only `estimate: about_a_week`; the note is stored in `v2_value_reports`

### Requirement: Event content allowlist

Each product event SHALL carry only the props its name allows in the events table above, each a fixed choice, a whole
number or (for an LOI's `note_ref`) the operator's own reference of 1 to 64 letters, digits and `. _ : -` starting with
a letter or digit; an event SHALL never hold an email address, name, title, goal or change request text, repository or
alias, URL, creation code or token, and SHALL name a person only by their actor hash.

#### Scenario: No content in any row

- **WHEN** a test scans every row of `v2_events` after people with known names and emails created workspaces, goals, sessions with repo aliases and titles, change requests with reasons and notes, devices with names, access requests with companies and uses, and LOIs
- **THEN** none of those strings, no user id, no `@`, no `http`, no creation code and no token appears, and every props key is on its event's allowlist

#### Scenario: A prop off the list

- **WHEN** code tries to record an event with a prop its name doesn't allow, or a value outside the prop's choices
- **THEN** recording throws, and the action's transaction rolls back

### Requirement: Operator-recorded LOIs

`scripts/align-admin.mjs events record loi_sent|loi_signed --workspace <id> [--note-ref <ref>]` SHALL be the only way a
`loi_sent` or `loi_signed` event is recorded; `loi_signed` SHALL require `--verified-original`, meaning the operator
holds the countersigned original, and SHALL never be inferred from a form, an email or a claim; each SHALL be recorded
at most once per workspace, with no actor.

#### Scenario: Signed without the original

- **WHEN** the operator runs `events record loi_signed --workspace ws_…` without `--verified-original`
- **THEN** the script exits 2, says that a form or claim is not a signature, and records nothing

#### Scenario: Refusals

- **WHEN** the note ref is a URL or an email address, `--verified-original` is given for `loi_sent`, the event name is anything but `loi_sent` or `loi_signed`, the workspace does not exist, or the event is already recorded for the workspace
- **THEN** the script exits 2 for the first three and 1 for the last two, and records nothing

#### Scenario: Recorded

- **WHEN** the operator records `loi_sent` with `--note-ref LOI-7`, then `loi_signed --verified-original`
- **THEN** each is one event for the workspace, `loi_signed` with `verified_original` `yes`, and the report counts one sent and one signed

### Requirement: Operator report

`node scripts/align-admin.mjs report [--since YYYY-MM-DD] [--json]` SHALL print, as plain text tables or with `--json`
as one JSON object, from the product events and the existing session and usage tables, without any name, email or
content:

- access: requests (by interest), approvals, declines, codes created (from requests) and codes redeemed, in the period;
- the workspace funnel: of the non-sample workspaces created in the period, how many ever reached each step (workspace created, device paired, first session captured, first session bound to a goal, second member joined, first change request, first approval or directive, first MCP read), with the conversion from the previous step and from created;
- time to first value: the nearest-rank median and 75th percentile, over those workspaces, of the time from `workspace_created`, and from `code_redeemed`, to `first_session_bound`;
- weekly active workspaces for the last 8 weeks (the current week marked as so far), with week-on-week growth;
- week-1 and week-4 retention of each creation cohort in the period (the last 12 weeks without `--since`): the share active in the week after, and the fourth week after, their creation week, shown only once that week has ended;
- the share of sessions shared in the period that were ever bound to a goal, and of requests and estimated spend (live usage and spend roll-ups) on goals;
- LOIs sent and signed, with the workspace and dates;
- decision value (JSON key `value`, text table "Decision value"), over non-sample workspaces in the period: the workspaces with at least one approved change request, `value_card_viewed` (person-workspace pairs and workspaces), `value_reported` by estimate, `follow_up_clicked`, access requests with `via` `value_card` by interest, and the workspaces with `first_ask` and `first_limit`;

and SHALL exit 2 for a `--since` that is not a date.

#### Scenario: Counts match the actions

- **WHEN** two access requests (one try, one evaluate) are made, one approved and one declined, two more codes are made, and two workspaces and a sample are created, one of which pairs devices, shares, binds, gains a member, takes a change request, an approval, a directive and an MCP read
- **THEN** `report --json` shows 2 requests (1 try, 1 evaluate), 1 approved, 1 declined, 3 codes (1 from requests), 0 redeemed, a funnel of 2 created and 1 at every later step (50% of created), 1 sample, and the current week with 2 active workspaces

#### Scenario: Goal binding from the existing tables

- **WHEN** of three shared sessions two are bound to a goal, and two of three usage requests (and their estimated cost) are in a goal-bound epoch
- **THEN** the report shows 2 of 3 sessions, 2 of 3 requests and two thirds of the estimated spend on goals

#### Scenario: Decision value counts

- **WHEN** in a workspace a change request is approved, two people view its value card, one reports `same_day` and clicks the follow-up link, and one access request is made from the card with interest `evaluate`
- **THEN** `report --json` `value` shows at least that workspace with an approved request, 2 viewed, `same_day` 1, 1 follow-up click and 1 `evaluate` from the card, matching the rows of `v2_events`

#### Scenario: Since

- **WHEN** the operator runs `report --since` with a future date, or with something that is not a date
- **THEN** the first counts nothing; the second exits 2

### Requirement: Product events under deletion and retention

The retention job SHALL delete product events more than 13 months old; account deletion SHALL clear the person's actor
hash from every event in the same transaction (the events stay, without a person); making someone "Former member #n"
in a workspace (30 days after they left or were removed) SHALL clear their actor hash from that workspace's events in
the same step; and purging a workspace SHALL replace its id in its events with a fresh random `wsx_…` id, so no row
names the workspace while the report still counts it.

#### Scenario: Account deleted

- **WHEN** a person who has events deletes their account
- **THEN** no event carries their actor hash, the number of events is unchanged, and no row holds their id or email

#### Scenario: Former member

- **WHEN** the retention job makes a person who left a workspace "Former member #n" there
- **THEN** that workspace's events no longer carry their actor hash, while their events in workspaces they are still in, and the number of events, are unchanged

#### Scenario: Workspace purged

- **WHEN** the operator purges a workspace, or the retention job does after its restore window
- **THEN** no event names its id, its events carry one `wsx_` id instead, and the report still counts it as created

#### Scenario: Thirteen months

- **WHEN** the retention job runs
- **THEN** events older than 13 months are deleted (counted as `events_deleted`) and younger ones are kept

## Open questions

- Rotating `ALIGN_SECRET` changes every person's actor hash, so distinct-person counts restart at the rotation.
- Design-partner conversion to paid is not recorded: it waits for billing, and must come from a verified source rather
  than a self-asserted form.

## Sources

- lib/v2/core.mts
- lib/v2/events.ts
- lib/v2/metrics-core.mts
- lib/v2/db.ts
- lib/v2/access.ts
- lib/v2/value.ts
- lib/v2/requests.ts
- lib/v2/creation.ts
- lib/v2/workspaces.ts
- lib/v2/devices.ts
- lib/v2/sessions.ts
- lib/v2/changes.ts
- lib/v2/directives.ts
- lib/v2/account.ts
- lib/v2/retention-core.mts
- lib/mcp/register.ts
- scripts/align-admin.mjs
- docs/RETENTION.md
- Dockerfile
