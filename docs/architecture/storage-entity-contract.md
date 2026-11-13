# Storage entities and historical upgrades

- **Design status:** schema-program subset qualified locally; remaining storage contracts open
- **Owning work:** [ADOPT-002](../roadmap/active-work.md#adopt-002)
- **Generation status:** preserved review input; qualified Component and Flavor authority are recorded in the native rewrite program

## Contract boundary

The schema-only transfer now qualifies as `local/storage-schema`; the
[native rewrite program](../roadmap/native-rewrite-program.md) records its
source-bound review, two clean qualifications, separate admitted build and
complete consumer acceptance. This document preserves the review rationale.
Its diagnostic target model remains outside generation. The qualified Component
and selected Flavor own generated schema behavior. The other storage/runtime
boundaries retain their source authority until separately qualified.

The store preserves the entities below and supports upgrades from every released
domain schema version through version 22. The logical contract owns record
identity, relationships, retained history and upgrade effects. Its SQLite mapping
owns physical names, affinity, defaults, null handling, indexes, triggers and
driver behavior. Better Auth owns its complete account, session, credential and
passkey schema. The domain store references its account and passkey identities.

The qualified schema capability returns the ordered, target-specific change
programs. Producing the programs has no database, clock, filesystem, environment,
authentication or network effects. The already qualified migration coordinator
executes them in numbered order with one transaction per change, checks references
and advances the stored version. Opening connections, ordinary transactions,
authentication migrations and filesystem permissions retain their existing
owners. A schema package must neither execute its own changes nor change those
other boundaries while returning programs.

The current target has 22 change programs. The schema version exported to the
application and operator tools must equal that count. Its final shape contains
48 domain tables, 420 columns, 71 foreign-key groups, 96 indexes and one update
guard. These counts describe this target, not a portable requirement to use a
particular number of physical tables or indexes on another database.

## Public domain dependencies

Use the existing public requirements for each entity's valid business operations:

- `specs/align/workspaces.md`: identity, membership,
  invitations, teams, pairing, sessions, usage, asks, deletion and retention.
- `specs/align/goals-and-proposals.md`: versioned goals,
  alignments, change requests, evidence, launch, reallocations, requests and holds.
- `specs/align/directives.md`: atomic delivery, shared sequence
  numbers, targets, receipts and removal of unreachable sessions.
- `specs/align/metrics.md`: content-free properties,
  once-only recording, append-only facts and privacy changes under retention.
- `specs/align/mcp.md`: membership-bound grants,
  connection versus content-read times and versions actually served.

The storage transfer adds no new business validation or authorization. In
particular, a current member relationship must not be imposed on historical actor
labels, and an application-level relationship must not silently become a new
foreign key. The target mapping identifies exactly which relationships the
current store enforces. Later corrections need their own intent and migration.

## Shared record rules

Entity and field names below identify logical records. The target mapping binds
them to the current physical names. A workspace-scoped record carries its
workspace identity even when another part of its key is globally unique.
References declared with a composite workspace key preserve that pairing;
they cannot be rewritten to refer to a row in another workspace. An optional
reference remains optional. Historical labels that survive the referenced
person's membership are retained as data.

Preserve all previously stored field values during an upgrade unless a numbered
rule below explicitly transforms them. This includes opaque identities, hashes,
timestamps, integer values, nulls, text and encoded snapshots. Do not normalize
text, reserialize stored payloads, infer missing timestamps or erase rows while
changing representation. Newly introduced optional values start absent. New
collection defaults and flags use the target mapping's specified empty or off
representation.

Current goal records and immutable goal versions remain distinct. Revisions and
their approvals name the revision they belong to. A decision that is approved but
unlaunched does not become the current goal. Stored directives and receipts remain
facts about delivery, with developer answers distinguishable from automatic
acceptance. A connected app's connection time, first content-read time and
individual served-version facts remain distinct.

Deletion semantics follow each declared relationship. Removing a current member
revokes membership-bound grants while preserving their historical goals,
alignments and sessions. Deleting a device clears the optional device reference
on retained sessions. Workspace soft deletion changes reachability and keeps
restorable data; purge and pseudonymization remain explicit operations in their
existing domain owners. Product events permit privacy changes to workspace and
actor attribution while protecting event identity, name, time and properties.

Audit, activity and directive sequence allocation never reuses a deleted high
value. Their counters are independent. Directive ordering is shared across
workspaces. Other generated identifiers, including product-event identifiers,
gain no new monotonicity guarantee through this transfer.

## Entity responsibilities

The key column states the current logical identity or conditional uniqueness.
It does not add validation beyond the public domain contracts and target mapping.

| Entity | Identity or uniqueness | Persisted responsibility |
| --- | --- | --- |
| Workspace | workspace ID | Name, creator, creation time, deletion mark and steering mode |
| Member | workspace and account | Current workspace role and join time |
| Invite | invite ID; token hash | Email-bound workspace role, expiry, acceptance and optional team role |
| Team | team ID in workspace | Team name and creation time; mapped to the retained pod representation |
| Team member | team and account | Current team role, workspace pairing and join time |
| Former member | workspace with an account, or workspace with a number, when present | Removal time, pseudonymization time and stable former-member number |
| Access request | request ID | Contact fields, intended use, interest, decision and optional issued-code label |
| Creation code | code ID; code hash | Email binding, request label, expiry, revocation, redemption and created-workspace label |
| Device pairing request | request ID; device-code hash; human code | Pairing material, expiry, polling state, approval, workspace choices and reserved device name |
| Device | device ID | Account, public key, name, activity, revocation and optional replaced-device label |
| Device workspace grant | device and workspace | Workspaces a paired device may reach |
| Device token | token hash | Device, access or refresh kind, creation, expiry and rotation |
| Passkey use | external passkey ID | Most recent passkey sign-in time |
| Passkey prompt dismissal | external account ID | Dismissal time for the account's prompt |
| Connected-app grant | grant ID | Account and workspace, client labels, refresh state, scopes, connection and read times |
| App goal send | grant, goal and version | First time the server served that goal version through the grant |
| Goal | goal ID in workspace | Owner label, team, visibility, level, current version, content, status and target share |
| Goal version | goal and version | Frozen content, content hash, author label and creation time |
| Parent acknowledgement | child goal and parent goal | Parent version last reviewed by that child and review time |
| Alignment | alignment ID in workspace | Requester label, target and optional source goal, state, revision and decision/revocation facts |
| Alignment revision | alignment and revision | Choice, effects, approval set, note, author label and time |
| Alignment approval | alignment, revision and account label | Approval of that exact revision and time |
| Alignment session | alignment, revision and session | Sessions selected for that revision |
| Change request | request ID in workspace; one open request per goal and requester | Proposed content, base version, reason, decision, evidence flag, approved content and launch state |
| Change-request revision | request and revision | Frozen proposed change, base version, note, captured snapshot, condition and acknowledgement |
| Change-request evidence | evidence ID | Revision, typed link, source attribution, adding-person label and time |
| Ask | ask ID in workspace | Team asked, optional goal, quoted request, source, state and decision labels |
| Ask mention | ask and mention number | Subsequent source date, text, source title, adding-person label and time |
| Value report | report ID; workspace, change request and person label | Decision-time estimate, optional note and edit times |
| Reallocation | reallocation ID in workspace | Requester, revision, decision and launch facts |
| Reallocation revision | reallocation and revision | Target-share changes, optional note, author label and time |
| Reallocation approval | reallocation, revision and goal label | Approving-person label and time for that goal |
| Agent request | request ID in workspace | Goal and version, request type, optional switch target, sender role, directive and cancellation |
| Agent request target | request and session | Delivery/answer state, automatic-acceptance flag, update time and ended-session reason |
| Goal hold | workspace and goal | Holding-person label, reason, time and optional original directive label |
| Shared session | workspace and session key | Person label, optional device, harness, repository labels, sharing/binding state, flags and ending reason |
| Binding epoch | workspace, session and epoch | Goal/version at start, interval, cause, authority and optional alignment |
| Usage request | workspace, session and request key | Epoch, model/basis, token counters, estimated price, source and receipt time |
| Spend rollup | workspace, goal or unbound marker, day, model and basis | Aggregated request/token/cost counts without a person or session |
| Activity | independent increasing sequence | Workspace/session, person and goal labels, signal kind, optional work signal and expiry |
| Deleted-session marker | workspace and keyed hash | Deletion time without the original person or session identifiers |
| Steering event | workspace, session and time | Goal labels, whole-percent share/target and receipt time without content |
| Directive | directive ID in workspace; independent increasing sequence | Kind, optional goal, frozen goal/binding/request/hold payloads and creation time |
| Directive target | directive and session | Workspace pairing for a recipient |
| Directive receipt | directive, session, receipt state and automatic-acceptance flag | Receipt time and server recording time |
| Audit fact | independent increasing sequence | Optional workspace, actor and object labels, action and time |
| Product event | event ID; conditional once-only keys | Event name, optional workspace/actor, time and content-free properties |
| Durable rate hit | no uniqueness requirement | Privacy-preserving key and recorded instant; repeated hits remain separate rows |

## Numbered upgrade effects

Every step preserves all pre-existing values, rows and relevant allocation state
unless its row below names a transformation. New record families start empty.
New fields use the mapping's declared default. A failure leaves the current step
uncommitted and preserves earlier committed steps under the coordinator contract.

| Version | Required logical change |
| --- | --- |
| 1 | Establish workspaces, current members, invites, teams and team members; goals and versions; audit; device pairing, devices, grants and tokens; alignments, revisions, approvals and selected sessions; shared sessions, binding epochs and usage; directives, targets and receipts. The historical representation still binds goal owners, alignment requesters and session people to current membership. |
| 2 | Add empty dependency collections to goals and their versions, parent acknowledgements and expiring activity signals. |
| 3 | Add goal level with `team` for existing goals, permit workspace-visible company goals without a team, and add optional team choices to invites. Remove the current-membership requirement from historical goal owners, alignment requesters and session people while preserving every record and value. Preserve all other references. Add the audit workspace lookup. |
| 4 | Add connected-app grants tied to one current member in one workspace. Removing that membership deletes the grants. |
| 5 | Add change requests and their revisions, including one pending/countered request per goal and requester. |
| 6 | Add workspace soft-deletion state, person-free spend rollups and former-member records. Make a retained session's device optional and clear it when the device is deleted; preserve all session data and indexes. |
| 7 | Add last-passkey-use and passkey-prompt-dismissal records referencing the external identity owner. |
| 8 | Add creation codes, access requests and durable rate hits. Historical request/workspace labels on codes remain labels rather than new cascading references. |
| 9 | Add optional revision snapshots, approval-without-evidence state, revision evidence links and connected-app scopes. Existing grants receive `goals:read`; optional new values remain absent. |
| 10 | Add content-free product events. Protect event ID, name, time and properties against updates, including updates to the same value. Enforce initial once-per-workspace and once-per-person event sets while leaving privacy attribution mutable. |
| 11 | Add empty goal-limit collections to current goals and immutable versions; add asks, mentions and value reports. Extend workspace-first events with first ask/limit and person-first events with value-card, value-report and follow-up events. |
| 12 | Extend directive kinds with request, hold and release and add their optional payloads. Preserve every directive's sequence, including the allocation high-water mark left by deleted rows. Extend receipts with accepted/declined and a default-zero automatic flag; preserve existing receipts as nonautomatic and extend their identity so a later developer answer remains distinct. Add agent requests, recipients and goal holds. Extend workspace-first events with first request and first hold. |
| 13 | Add approval/launch separation and optional counter conditions/acknowledgements. Every previously approved change request becomes launched, retaining its existing approving person as launcher and decision time as launch time. Leave all other request states without a launch value, and leave approved-content and condition/acknowledgement fields absent. Add first launch to workspace-first events. |
| 14 | Add the app grant's content-read time as absent. An earlier connection time does not establish a content read. |
| 15 | Add optional target shares to goals and versions and steering mode defaulting off to workspaces. Add content-free steering events and reallocation requests, revisions and per-goal approvals. |
| 16 | Add an optional shared-session ending reason supporting device sign-out. |
| 17 | Extend shared-session ending reasons to include member removal, preserving all previous fields, rows, references and indexes. |
| 18 | Add optional ending reasons to agent-request recipients, with no inference for existing rows. |
| 19 | Add privacy-preserving deleted-session markers without plaintext person/session identities. |
| 20 | Add optional names reserved when device pairing is approved, with no inference for earlier requests. |
| 21 | Add an optional replaced-device label, without assigning one to existing devices. |
| 22 | Add facts for goal versions served through connected-app grants. Keep the grant and goal lifetimes, version identity and first-send time distinct from reading or acting on content. |

## SQLite mapping and compatibility

The [proposed target model](storage-target-model-proposal.json) describes every
observed version as creates and shape changes, using structured predicates and
references. It contains no retained DDL programs or application implementation.
It is a review input, not an immutable-code asset or accepted generation input.
Shape changes alone do not describe populated rebuilds or the version-13 backfill;
the numbered rules above supply those obligations.

The selected target must preserve the retained physical table and column names
while existing callers issue queries directly. Preserve column order, declared
affinity, defaults, explicit null requirements, primary/unique keys, composite
references, delete/update actions, partial indexes, collations and sequence
allocation. Keep the store non-strict with rowid behavior as declared. Do not
add deferred constraints, conflict handlers, generated columns, implicit
normalization or new relationship enforcement.

SQL null semantics remain observable: a check's null result is not a rejection,
an optional composite reference is not strengthened, and non-integer primary keys
gain no new implicit non-null rule. Partial event indexes continue to ignore the
specified missing attribution. Text length in target constraints follows SQLite
code-point length, not a language binding's code-unit count. Event properties
remain valid JSON objects; other stored text is not subjected to new JSON checks.

The native package must generate target change programs from reviewed Component
and Flavor authority. Retained SQL remains source authority until qualification
and actual consumer parity pass; it must not be relabeled as a non-code asset.
The proposed model and its diagnostic reconstructor are not candidate source.

## Acceptance before transfer

Require all of the following before replacing the retained migration sequence:

1. Source-bound review of these entity/upgrade rules and a separate SQLite Flavor
   mapping, including target-only semantics and explicit auth dependencies.
2. Frozen independent acceptance before candidate generation. It must cover every
   one of the 23 schema shapes and 22 populated upgrade starting versions, all
   declared constraint groups/checks/indexes, directive counters, rollback and
   recovery, plus deliberately broken observer controls.
3. Two ordinary clean regenerative qualifications and a separately admitted build
   against the unchanged acceptance. The returned sequence has exactly 22
   programs and no execution side effects.
4. Actual consumer transfer with no leftover retained migration program, no
   changes to prior native children, and parity on macOS and the Linux image.
5. The complete application build/test/package workflow, hosted image and header
   checks, current receipts and project verification at that consumer revision.

The [contract observations](storage-contract-observation.json) record the current
checks and exact helper identities. Every described shape reconstructs in
isolated SQLite and matches all 23 frozen observations on both macOS Node 26.3.0 /
SQLite 3.53.2 and Linux Node 24.22.2 / SQLite 3.53.4. Sixteen model mutation/refusal
controls pass. Nineteen additional physical compatibility cases pass on both
targets. The capture helper reproduces the original inventory byte for byte and
passes four refusal controls. These results validate the proposed descriptions at
the stated scope. They do not qualify a native schema implementation or prove
populated-upgrade execution.
