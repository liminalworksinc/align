# Public interface: storage-schema.change-programs

## ADDED Requirements

### Requirement: storage-schema.change-programs

# Historical store evolution

Capability `storage-schema.change-programs` describes the ordered changes needed
to preserve the domain store across its historical versions. Return one ordered
collection containing 22 concrete programs selected by the target Flavor, in
one-based version order. Producing the collection has no store, authentication,
clock, environment, filesystem or network effects and does not execute changes.
The migration coordinator executes each program inside its own transaction,
checks references and advances the stored version; those operations are outside
this capability.

A target binding defines the public module, symbol and concrete program format.
The program collection describes every released transition from version 0 to 22.
Its contents remain stable across calls. Host representations and query syntax
belong to the selected Flavor. The package must not read retained source,
verifier data or a machine's application configuration at runtime.

## Logical preservation

Preserve existing record values and lifetimes unless the numbered transition
explicitly changes them. Retain opaque identities, actor labels, timestamps,
nulls, integer values, text and encoded content without normalization or inferred
history. New record families start empty. Optional new fields remain absent;
collection and flag defaults follow the selected target representation.
Historical goal owners, alignment requesters and session people survive current
membership removal. References declared with a workspace pair keep that pair;
a target may not add undeclared references or new business validation.

Current goals, immutable versions, request revisions, approvals and launches
remain separate facts. Approval alone does not publish a new goal version.
Connected-app connection, content-read and served-version facts remain distinct.
Product event identity, name, time and properties remain protected, while privacy
attribution can change under existing retention rules. Audit, activity and
directive allocation preserve independent, non-reusing high-water marks,
including gaps left by deleted rows. Other identifiers gain no new allocation
promise. Authentication schema creation remains with its external identity owner.

## Record responsibilities


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

## Required transitions


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


## Acceptance scope

Qualification compares all historical shapes, populated upgrades, data and
allocation preservation, constraints and recoverability through the selected
target. It is independent of a generated implementation's own test suite.
This capability does not replace connection handling, ordinary transaction
helpers, authentication, readiness, data-directory admission or permissions.

#### Scenario: Preserve the reviewed public contract

- **WHEN** a consumer uses this capability
- **THEN** the implementation satisfies the reviewed contract

Evidence: `evidence:4bbf6f62c33565dc830d`
