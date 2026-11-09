# Node-Server-Changes implementation Flavor

## ADDED Requirements

### Requirement: Node change-request binding part 1 [authored:node-server-changes-v10-part-1]

# Open-request arguments and direct post-commit projection

The open-request query helper takes primitive workspace, goal id and user id.
At both creation checks, evaluate principal.wsId, then the original visible
goal.id, then principal.userId, and pass those three primitives to the helper.
Putting an outer helper around principal and goal.id evaluates goal.id before
the principal workspace and changes the original read order. Preserve the
primitive helper boundary at both the outside and locked creation check.

Creation, action, evidence addition and evidence removal all construct their
post-commit view directly from a fresh row lookup. Evaluate principal.wsId and
the held request id for the row helper, then pass that row and the principal to
the existing private view formatter. This performs no second visibleGoal call.
Those operations already performed their required visibility checks before
mutation. Do not use the public getChangeRequest operation for their return
path: that public operation calls visibleRequest, which adds a new permission
lookup after commit and changes failure positions.

The public getChangeRequest(principal,requestId,optionalGoalId) retains its
visibleRequest check when an external caller invokes it. Listing retains its
own visibility filter. Preserve each operation's original boundary instead of
sharing their behavior through a newly introduced public read call.

Evidence addition first builds that one direct fresh view, then returns the
matching evidence plus the same whole change_request view as already specified.
Keep post-commit formatter failures observable without rolling back a completed
transaction. These are read-order and failure-contract requirements, with no
new public behavior or permission policy.

The fourth candidate is preserved unchanged. An in-memory diagnostic isolates
these two causes against all 5,524 frozen original records. It is not an admitted
implementation. Normal signed revision, fresh generation and the full acceptance
sequence remain required; original inputs and expected results stay unchanged.


# Primitive dependency lists and fresh consent reads

The hidden-count helper in the full view receives a dependency-id array, not a
content object. It reads that array's length, then calls readable with that same
array and subtracts the filtered length. Evaluate base.depends_on once as the
before helper's argument, and after.depends_on once as the after helper's
argument. Reading content.depends_on for both length and readable adds a
supplied-row getter. Keep the original primitive-list helper boundary.

The action preamble captures requester and approver booleans. It does not replace
later requester identity reads or later consent queries with cached values.
Preserve the following fresh operations at their original sites:

- An approval refused for a stale goal version calls memberName with a fresh
  row.requester_id read when the actor is not the requester.
- The superseded-before-launch sentence also reads row.requester_id afresh for
  memberName when the actor is not the requester.
- A same-as-request counter calls memberName with row.requester_id afresh.
- The counter's first new-dependency visibility assertion constructs its reader
  array from a fresh row.requester_id read. The second assertion evaluates
  principal workspace first, then the held base and proposed changes, then
  effectiveSet(goal,row.requester_id) as a fresh resource call. Reuse only the
  already-present dependency list, not the preamble's approver array.
- Rebase's hiddenAddedDependency arguments are principal workspace, the result
  of a fresh contentOf(goal).depends_on, the held proposed changes, and a fresh
  effectiveSet(goal,row.requester_id) result. This resource call remains required
  even when its values equal the preamble's approval set.

Keep the preamble booleans and the previously specified captured reader/time.
Only these later identities and consent sets remain fresh as listed. Do not
hoist their getters or port calls into the preamble.

The third candidate remains preserved and inadmissible. An in-memory diagnostic
isolates these causes against all 5,524 frozen original records; it is not an
admitted implementation. All source, private cases, expected results and harness
bytes remain unchanged. The next implementation still requires normal fresh
generation and every qualification, admission and caller/parent gate.


# Change-request service Node binding

Use Node 24 or later on macOS and Linux. Export synchronous arity-one
create_changes(resources) from server_changes/create_changes in a dependency-free
CommonJS package. The regular non-symlink package directory has exactly
create_changes.js and package.json. Its manifest names server_changes, uses type
commonjs and has exactly {"./create_changes":"./create_changes.js"} as its export
map. Root build and test adapters remain outside the runtime package.

Capture these 44 resources once, in order, without enumeration or service calls:
all, audit, get, run, tx, V2Error, badRequest, conflict, forbidden, notFound, event,
newId, nowIso, effectiveSet, launchSet, contentOf, dependencyCycle, goalObj,
goalRow, goalsDependingOn, nextContent, sameContent, unreadableGoals,
versionContentOf, visibleGoal, writeGoalVersion, canReadGoal, memberName,
memberPrincipal, nameTo, assertRevisionReached, nonNegInt, optStr, revisionRead,
str, EVIDENCE_PER_REVISION, evidenceCount, evidenceInput, evidenceRows,
evidenceView, recordSnapshot, snapshotView, counterNoChange, counterSameAsRequest.
V2Error is the exact supplied class for instanceof. EVIDENCE_PER_REVISION is a
supplied value, not a function or replacement literal. Call other supplied
functions with undefined receivers. Error factories return values: throw the
exact value at each refusal, preserving a factory's own thrown value. The
principal has wsId, userId and wsRole. No ambient Date lookup is needed.

Return exactly seventeen values in this order: CHANGE_REQUEST_STATES,
CHANGE_REQUEST_ACTIONS, LAUNCH_STATES, dependencyChoices, dependencyLoops,
counterBase, versionLoops, insertChangeRequest, createChangeRequest,
actOnChangeRequest, addEvidence, removeEvidence, listChangeRequests,
changeRequestGroups, getChangeRequest, assertChangeRequestAction,
requestCondition. The three constants are live per-instance ordinary arrays:
states pending,countered,approved,rejected,withdrawn,superseded; actions approve,
approve_and_launch,launch,not_yet,reject,counter,accept_counter,acknowledge,
withdraw,rebase; launch states pending,not_yet,launched,superseded.

Names and lengths are dependencyChoices3, dependencyLoops3, counterBase3,
versionLoops3, insertChangeRequest5, createChangeRequest3, actOnChangeRequest5,
addEvidence5, removeEvidence4, listChangeRequests1, changeRequestGroups2,
getChangeRequest3, assertChangeRequestAction1, requestCondition1. Only
createChangeRequest, actOnChangeRequest, addEvidence and removeEvidence are async.
The caller keeps ChangeRequestState, ChangeRequestAction, LaunchState, Changes
and ChangeRequestView with their original structural types. Preserve private row
types and an ambient requestView signature when required to express the public
type. The caller contains no replacement business implementation.

## Changed content, audiences and dependency privacy

CHANGE_KEYS order is title,measures,depends_on,status,limits. TEXT_MAX is 2000.
changesIn defaults keepDepsFrom to base.depends_on and loopOk to false. Require a
non-array object with at least one key and reject the first unknown key in
Object.keys order. Call nextContent with the original arguments. Build the result
in CHANGE_KEYS order, comparing title/status directly, measures/limits through
JSON.stringify and depends_on through sortedIds. sortedIds uses a copied array,
native sort and comma join. Retain null, undefined, getter and thrown-value
behaviour at each step. applied is a shallow base-plus-changes spread.

hiddenDependencyRefusal reads request changes for approval or approved_json for
launch, then base version, then unreadableGoals on dependencies absent from the
base. Return the exact requester-sensitive refusal without naming a hidden goal.
dependencyLoop reads pending changes, or approved unlaunched content only when
the goal still equals base_version. Preserve its empty-dependency short circuit
and returns the refusal string or null, rather than a boolean. Empty dependencies
return null without calling dependencyCycle.

hiddenAddedDependency checks only added dependencies. For each reader in order,
call memberPrincipal then unreadableGoals and return the first hidden id.
dependencyAddedBy walks revisions in order and remembers the author of the first
revision in the latest uninterrupted run containing that dependency.

dependencyReaders returns null for viewers and inactive goals. With counterOf,
read that workspace request and refuse missing or wrong-goal requests before
computing effectiveSet; require pending and approver membership, then return
requester followed by that set without de-duplication. Without counterOf, the
owner cannot propose; otherwise use effectiveSet with caller as requester.

dependencyChoices first reads visibleGoal, computes that audience and returns
null when absent. Build member principals before goalsDependingOn and the sorted
candidate query. For every row, preserve loops.has, caller canReadGoal and every
decider canReadGoal short circuits in that order; return ids. dependencyLoops
uses the same audience, then filters the supplied dependency Set in insertion
order through goalRow and canReadGoal. counterBase returns null before any lookup
if counterOf is falsy. Otherwise validate audience, read base version and filter
only unreadable dependencies, retaining references for the other fields.
versionLoops reads visibleGoal even when canEdit is false, then either computes
readable loops or returns null.

## Creation and transaction boundaries

visibleRequest reads by workspace/id, refuses missing or wrong path goal before
visibleGoal, then returns the row. insertChangeRequest is synchronous and owns no
transaction. Call newId(cr), insert pending revision1 using the supplied goal's
version and JSON.stringify(changes), writeRevision, audit created and return id.
writeRevision invokes recordSnapshot at the original argument-evaluation position
inside its INSERT argument list. Its condition default is null. Do not accept a
client snapshot or delay snapshot collection until after insertion.

createChangeRequest reads visibleGoal, then viewer, own-goal and active checks.
Read nonNegInt(base_version), compare to goal version, validate reason with
str(...,2000), check already-open, then changesIn and nowIso. Await tx with a
synchronous callback. Inside, reread goal, then version, active and already-open
guards. assertDependenciesVisible uses contentOf(current), effectiveSet and the
proposal wording. Insert, emit first_change_request and return id. Sample calls
to insertChangeRequest do not emit that event. Return a fresh request view after
the transaction. Do not move any inside-transaction reread outside the lock.

## Action order and separate publication

actOnChangeRequest performs visibleRequest and viewer check before
revisionRead(body,true), userId and nowIso. Await tx; reread request, call
assertRevisionReached before body-dependent guards, read current goal, requester
and effective approval flags, then parse changes. Each action's permission,
state, revision, validation and resource reads retain their original order.
expectRevision requires equality for approval, and otherwise only when body
revision is supplied. An optional revision remains a live body property read;
do not replace it with the parsed sent variable.

Approve checks approver, pending, required revision, optional note, current base
version, hidden dependency, loop, then applies changes to contentOf(goal). Read
contentOf(goal) again for sameContent. Refuse no-change before evidenceCount.
Record approved_json, approved_without_evidence and launch pending, then audit
approved, optionally approved_without_evidence, then emit first_approval. Return
the computed content without publishing a goal version.

Launchable first distinguishes already-launched and superseded-before-launch
sentences, then requires approved and current base version. Launch writes launch
launched before calling writeGoalVersion so reentrant superseding preserves this
request. Pass goal, approved content, current actor, time and original approver
to writeGoalVersion, then write returned version, audit launched and emit
first_launch. The consuming goal service owns directives and related superseding.

Approve-and-launch performs approve, then launcherOnly, then launch in one tx;
failure at any point rolls back both decisions and all related effects. Launch
performs launcherOnly, launchable, optional revision, approved_json parse,
hidden-dependency and loop checks, then publication with r.approved_by. Not-yet
performs launcherOnly, launchable and optional revision, refuses an existing
not_yet using the original actor wording, then updates and audits. It does not
check hidden dependencies or loops and never publishes.

Acknowledge requires requester and pending or approved, then the latest counter
revision whose note is non-null. Require a truthy condition, compare any supplied
revision to that counter revision, refuse a previous acknowledgement, update the
revision and request time and audit. It does not accept a counter or gate another
action. Reject requires approver, open state, optional revision and nonempty
reason; update decision fields and audit.

Counter requires approver, pending, optional revision, note, and optional condition
when neither undefined nor null. Read the request's base version and apply the
current changes. Determine hidden current dependencies. If a non-array changes
object omits depends_on and hidden current ids differ from hidden base ids, copy
the body changes with the visible base dependency list, then call changesIn using
current.depends_on as keepDepsFrom. Catch only an instance of the supplied
V2Error whose code is no_change; throw conflict with counterNoChange. Other
failures propagate unchanged. Without a condition, same-content counters use
counterSameAsRequest with memberName and base/current versions. Check new
dependencies against requester first and effective approvers second, excluding
ids already in base or current content. Write the next revision, then countered
request fields and audit. Do not merge the two visibility checks.

Accept-counter requires requester, countered and optional revision, then writes
pending and audits. Withdraw requires requester, open and optional revision, then
writes withdrawn and audits. Rebase requires requester, pending, optional revision,
nonNegInt(base_version) and current goal version. If changes is undefined, keep
the request's changes and permit an existing loop by passing loopOk true. New
changes retain normal cycle checks. Preserve repeated contentOf calls. Check
newly hidden dependencies against current effective approvers. Only the own-
changes path attributes a hidden dependency to the author of its uninterrupted
revision run. Write a new snapshot revision with note null, then update base,
revision, changes and time and audit. Conditions remain on their counter revision.

## Evidence and snapshots

addEvidence validates visibility, viewer, evidenceInput and time before tx.
Inside, reread request and goal and compute effective approvers. Refuse unrelated
readers before wrong state, optional stale revision, duplicate URL and the supplied
evidence bound. Generate id only after those checks. Insert original input fields
and supplied source, update request time and audit. After tx, construct the whole
fresh view and find the new evidence in its flattened revision list. Preserve a
failure in that post-commit view rather than silently undoing an already committed
transaction.

removeEvidence validates visibility, viewer and time, then tx rereads request and
the evidence constrained by request id. Refuse missing, then different author,
then frozen revision or state using the original sentence. Delete, update time
and audit, then return a fresh view after tx. No operation edits a frozen link.
mayAddEvidence and mayRemoveEvidence read wsRole, open state, current revision
and identity using the original short circuits. Snapshots and evidence views are
supplied services; do not reproduce their implementations or mark links verified.

## View and list identity

requestView reads goal, parses changes, selects changed fields in CHANGE_KEYS
order, reads base, then reads resulting version only for approved with truthy
version. after uses nullish fallback to applied(base,changes). Read effectiveSet,
launchSet and revision rows, then choose the last note-non-null counter by copying
and reversing the revision array. Construct an optional condition, including
acknowledger person lookup, before decision predicates.

Compute approvable and launchable with wsRole and exact version equality. Evaluate
hidden refusal only for those eligible paths, preferring approve. Compute loop
separately even for otherwise ineligible readers. Preserve each can flag,
including not_yet remaining available for a hidden dependency or loop. Clear all
flags for viewer. Fetch evidence before mapping revision views. Readable
dependency filters retain repeated goalRow/canReadGoal calls; no shared permission
cache is introduced within the view. Snapshot and evidence ownership projections
are invoked in their original map order. Preserve per-revision references,
nullability, return-field order, condition metadata, before/after hidden
dependency counts and advisory approved_without_evidence semantics.

waiting_on_me is approve or accept_counter or launch, plus a pending request at
current base version with a truthy loop and can.counter. It is not inferred from
not_yet. state_note uses the same refusal helper as mutations. Full request history
and current evidence_count remain distinct. No hidden dependency id leaks through
diffs or historical changes.

listChangeRequests defaults opts to a fresh empty object, validates state before
optional visibleGoal, and selects the exact goal-specific or workspace query.
Cache read permission by goal only within that listing. Filter state before goal
permission and map surviving views. Groups filter waiting, mine and others in
three passes. getChangeRequest uses visibleRequest. Action assertion uses live
CHANGE_REQUEST_ACTIONS.includes. requestCondition reads revision rows, selects
the latest note-non-null counter and returns null when its condition is falsy.

The 24 exact SQL programs, dispatch ports and placeholder counts are included
below and statically reconciled against the complete source AST. Binding value
order follows the operation descriptions. Private acceptance must still exercise
every call site, argument read and failure position before normal promotion. Private acceptance must
compare complete results, errors, reads, effects, aliases and rollback to the
original. Full store integration must use the actual goal, approval, evidence,
directive and event owners, including two individually safe dependency proposals
whose second publication would make a loop.

Conditions and their acknowledgement record are visible to permitted request
readers. Only the acknowledgement mutation belongs to the requester. Do not add
an owner-only projection restriction to either the current condition or revision
history.


# Change-request projection and wording supplement

Preserve these projection fields, wording and evaluation order.

## View shape and order

Return keys in this order: id, goal, state, revision, base_version, behind,
requester, changes, reason, revisions, diff, approvers, launchers, approved_by,
rejected_by, decision_note, note, rejection_reason, version, launch,
launch_decided_by, launch_decided_at, condition, evidence_count,
approved_without_evidence, can, state_note, dependency_not_visible,
dependency_loop, waiting_on_me, created_at, updated_at, decided_at.

goal is {id,title,version} from the current goal. A person is {id,name} for a
truthy id and null otherwise. requester is a required person. behind is true
only for an open request whose base_version differs from current goal version.
changes preserves its original object when depends_on is falsy, otherwise uses
a shallow copy with only readable dependency ids. reason is the original reason.

Each revision has keys revision, base_version, changes, note, condition,
acknowledged_by, acknowledged_at, author, created_at, evidence, snapshot.
author is a required person; acknowledged_by uses the nullable person helper.
Parse and privacy-filter revision changes separately. Evidence rows for that
revision are projected by supplied evidenceView with mayRemoveEvidence. Call
snapshotView with principal, stored snapshot_json and the revision number.

diff is {before,after,hidden_depends_on}. before and after include only fields
present in the request's changes, in CHANGE_KEYS order, with privacy-filtered
dependency ids. before comes from the base version; after comes from the actual
launched version when available, otherwise changes applied to base. When
depends_on is a changed field, hidden_depends_on is {before,after} with the
number removed from each full list; otherwise null. Do not expose their ids.

approvers and launchers map their ordered supplied sets to required people.
approved_by, rejected_by and launch_decided_by use nullable people.
decision_note is stored directly; note is that value only when approved,
otherwise null; rejection_reason is that value only when rejected, otherwise
null. version remains stored directly. launch uses null only when nullish;
launch_decided_at is the stored launch_at value.

The current condition comes from the last revision whose note is non-null. If
its condition is truthy, return {revision,text,acknowledged_by,acknowledged_at};
otherwise null. The condition and per-revision acknowledgement records are
visible to permitted request readers. Only the acknowledgement mutation is
requester-only. requestCondition returns the same condition fields for the
caller that already checked visibility, without building a full request view.

evidence_count counts only current-revision rows. approved_without_evidence is
stored-value equality with 1 only when state is approved and the stored value
is not null; otherwise null. In particular, retain the original behaviour for
older undefined values instead of changing the null test to a nullish test.

can has approve,approve_and_launch,reject,counter,accept_counter,acknowledge,
withdraw,rebase,add_evidence,launch,not_yet in that order. state_note is the exact
shared state refusal. dependency_not_visible is the current eligible decider's
refusal or null; dependency_loop is the current loop refusal or null. Keep
waiting_on_me's independent loop/counter branch from the main contract.

## Shared state and revision refusals

State wording is exact, including the actor's perspective:

| State | Text |
| --- | --- |
| pending, any note-non-null counter revision exists | The suggested change was already accepted, so this request is waiting for approval. |
| pending, no such revision | This request is waiting for approval. |
| countered, reader is current counter author | You countered this request; it waits on <requester as nameTo> to accept it. |
| countered, other reader | This request was countered<by>; review the counter. |
| approved, reader is approved_by | You already approved this request. |
| approved, other reader | This request was already approved<by>. |
| rejected, reader is rejected_by | You declined this request, so nothing changes. |
| rejected, other reader | This request was declined<by>, so nothing changes. |
| withdrawn, reader is requester | You withdrew this request, so nothing changes. |
| withdrawn, other reader | This request was withdrawn by <requester memberName>, so nothing changes. |
| superseded | This request was superseded: its goal was closed or got a newer version first, so nothing changes. |

In by substitutions, use ` by <memberName>` only for the relevant truthy actor id,
otherwise empty. The counter author lookup occurs only while state is countered.
For a revision refusal, what is `<author as nameTo> countered it, and it is now at
revision <revision>` when the current counter author is truthy; otherwise
`it is now at revision <revision>`. The sentence is `This request changed after
you read it: <what>. <then>`. Most actions use then
`Read it again and decide again.` Adding evidence uses then
`Add the link again if it supports that revision.`

## Dependency refusals

For a proposal or a requester-authored rebase dependency, use exactly:
`Someone who decides on this goal can't see a goal you added as a dependency, so
they couldn't see what they approve. Remove it, or ask that goal's owner to share
it with them first.`

For a counter dependency hidden from the requester, use:
`The person who asked can't see a goal you added as a dependency, so they couldn't
see what they accept. Remove it from your suggestion.`

For a counter dependency hidden from an approver, use:
`Someone who decides on this goal can't see a goal you added as a dependency, so
they couldn't see what they approve once it is accepted. Remove it from your
suggestion, or ask that goal's owner to share it with them first.`

For approval by the requester, use:
`This request adds a dependency on a goal you can't see, so you can't approve what
it asks. Withdraw it, or update it without that dependency.` For another reader:
`This request adds a dependency on a goal you can't see, so you can't approve what
it asks. Ask <requester memberName> to withdraw it, or to rebase it without that
dependency.`

For launch, use:
`This change adds a dependency on a goal you can't see, so you can't launch what
it publishes. Ask someone who decides on this goal and can see it to launch it,
or <ask> the change again without that dependency.` ask is `propose` for the
requester, otherwise `ask <requester memberName> to propose`.

For an own-changes rebase whose uninterrupted dependency run was authored by
someone else, use:
`Someone who decides on this goal can't see a goal that <author memberName>'s
suggestion added as a dependency, so they couldn't see what they approve.
Withdraw this request and propose the change again without it, or ask that goal's
owner to share it with them first.`

A pending loop uses:
`A goal this request adds as a dependency has since come to depend on this goal,
so approving it would make a loop. Someone who decides on this goal can suggest
a change without that dependency or decline it, and <requester as nameTo> can
withdraw it.` An approved loop uses:
`A goal this change adds as a dependency has since come to depend on this goal,
so launching it would make a loop. It can launch once that loop is gone; a newer
version of this goal supersedes it, and <requester as nameTo> can propose the
change again without that dependency.` Preserve supplied nameTo rather than
inventing a case-normalization rule.

## Dynamic action, evidence and validation wording

For an unknown change key, badRequest receives
`changes: <key> can't be proposed (only title, measures, depends_on, status and
limits)`. For unknown state, it receives
`state must be one of <live CHANGE_REQUEST_STATES joined with comma-space>`.

Creation's early and locked version mismatch use
`This goal changed while you were editing. Reload to start from version <version>.`
Use the version from the actual checked row. Approval mismatch uses
`The goal changed after this request was made. <who> to update it before it can
be approved.` who is `You need` for the requester and
`<requester memberName> needs` otherwise. Launch mismatch uses
`The goal changed after this change was approved: it is now at version <version>.`
Rebase mismatch uses `The goal changed after you read it: it is now at version
<version>. Update your request to that version.`

Already-launched wording is `This change is already launched as version
<version>.` Superseded-before-launch wording is
`This change was superseded before launch. <who> can propose it again.` who is
`You` for the requester, otherwise memberName. Repeated not-yet wording is
`<who> already decided not yet, so nothing changes: agents stay on version
<base_version> until someone launches version <base_version plus one>.` who is
`You` when the reader is launch_by, otherwise memberName for a truthy launch_by,
otherwise `Someone`.

Stale condition wording is `This request changed after you read it: its condition
is now on revision <counter revision>. Read the condition again before you
confirm it.` Duplicate evidence wording is `This link is already on revision
<revision>, so it isn't added twice.` Too-much-evidence wording is
`A revision holds at most <supplied EVIDENCE_PER_REVISION> evidence links; remove
one to add another.` Frozen old-revision wording is `This link is on revision
<evidence revision>, and the request has moved on to revision <request revision>,
so the link is kept as it was.` A closed request uses its shared state refusal.

Counter no-change wording is supplied through counterNoChange or
counterSameAsRequest, with the main contract's exact arguments and class check.
The goal content, evidence-input and revision-validation services retain their
own messages and bounds. Do not replace them with local validators.


## Exact SQL and direct refusal argument data

The following data is part of this draft binding. SQL bytes, dispatch port and
binding counts are exact, including the newline in the change-request insertion.
Binding value order follows the operation descriptions above. Direct refusal
arguments are literal strings passed to the named supplied factory and thrown.
Dynamic refusals use the preceding wording rules. No original business function
body is included here.

#### Scenario: Record proposed goal changes, separate approval and publication, preserve evidence and private-safe decisions

- **WHEN** the Node change-request target is selected
- **THEN** Capture44 resources once and preserve17 runtime values,5 public caller types and24 SQL programs. Retain six request states,ten actions,four launch states,proposal/base/revision races,one open request per goal/requester,five allowed change keys,exact effective approval and launch audiences,hidden dependency preservation and current read checks,decision-time cycles,own-changes rebase loop exception and counter author attribution,separate approval/not-yet/publication with reentrant goal version effects,advisory evidence and unacknowledged conditions,server-only revision snapshots,link ownership/duplicates/supplied bound/frozen revisions,full projections/groups/private diffs and exact class/throw/read/effect/transaction/audit/event order. Supply exact resource argument positions and stored fields,including approval author on launch. No ambient clock or IO.

### Requirement: Node change-request binding part 2 [authored:node-server-changes-v10-part-2]



```json
{
  "SQL": [
    {
      "id": "Q01",
      "port": "get",
      "bindings": 2,
      "sql": "SELECT author_id FROM v2_change_request_revisions WHERE change_request_id = ? AND revision = ?"
    },
    {
      "id": "Q02",
      "port": "all",
      "bindings": 2,
      "sql": "SELECT * FROM v2_goals WHERE ws_id = ? AND id != ? ORDER BY id"
    },
    {
      "id": "Q03",
      "port": "get",
      "bindings": 2,
      "sql": "SELECT * FROM v2_change_requests WHERE ws_id = ? AND id = ?"
    },
    {
      "id": "Q04",
      "port": "get",
      "bindings": 3,
      "sql": "SELECT id FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? AND requester_id = ? AND state IN ('pending','countered')"
    },
    {
      "id": "Q05",
      "port": "run",
      "bindings": 9,
      "sql": "INSERT INTO v2_change_requests (id, ws_id, goal_id, requester_id, state, revision, base_version, changes_json, reason, created_at, updated_at)\n     VALUES (?, ?, ?, ?, 'pending', 1, ?, ?, ?, ?, ?)"
    },
    {
      "id": "Q06",
      "port": "run",
      "bindings": 10,
      "sql": "INSERT INTO v2_change_request_revisions (ws_id, change_request_id, revision, base_version, changes_json, note, author_id, created_at, snapshot_json, condition) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    },
    {
      "id": "Q07",
      "port": "all",
      "bindings": 1,
      "sql": "SELECT * FROM v2_change_request_revisions WHERE change_request_id = ? ORDER BY revision"
    },
    {
      "id": "Q08",
      "port": "run",
      "bindings": 7,
      "sql": "UPDATE v2_change_requests SET state = 'approved', approved_by = ?, decision_note = ?, decided_at = ?, updated_at = ?, approved_without_evidence = ?, launch = 'pending', approved_json = ? WHERE id = ?"
    },
    {
      "id": "Q09",
      "port": "run",
      "bindings": 4,
      "sql": "UPDATE v2_change_requests SET launch = 'launched', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q10",
      "port": "run",
      "bindings": 2,
      "sql": "UPDATE v2_change_requests SET version = ? WHERE id = ?"
    },
    {
      "id": "Q11",
      "port": "run",
      "bindings": 4,
      "sql": "UPDATE v2_change_requests SET launch = 'not_yet', launch_by = ?, launch_at = ?, updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q12",
      "port": "run",
      "bindings": 4,
      "sql": "UPDATE v2_change_request_revisions SET acknowledged_by = ?, acknowledged_at = ? WHERE change_request_id = ? AND revision = ?"
    },
    {
      "id": "Q13",
      "port": "run",
      "bindings": 2,
      "sql": "UPDATE v2_change_requests SET updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q14",
      "port": "run",
      "bindings": 5,
      "sql": "UPDATE v2_change_requests SET state = 'rejected', rejected_by = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q15",
      "port": "run",
      "bindings": 4,
      "sql": "UPDATE v2_change_requests SET state = 'countered', revision = ?, changes_json = ?, updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q16",
      "port": "run",
      "bindings": 2,
      "sql": "UPDATE v2_change_requests SET state = 'pending', updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q17",
      "port": "run",
      "bindings": 2,
      "sql": "UPDATE v2_change_requests SET state = 'withdrawn', updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q18",
      "port": "run",
      "bindings": 5,
      "sql": "UPDATE v2_change_requests SET revision = ?, base_version = ?, changes_json = ?, updated_at = ? WHERE id = ?"
    },
    {
      "id": "Q19",
      "port": "get",
      "bindings": 3,
      "sql": "SELECT 1 AS x FROM v2_change_request_evidence WHERE change_request_id = ? AND revision = ? AND url = ?"
    },
    {
      "id": "Q20",
      "port": "run",
      "bindings": 10,
      "sql": "INSERT INTO v2_change_request_evidence (id, ws_id, change_request_id, revision, kind, url, label, source, added_by, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    },
    {
      "id": "Q21",
      "port": "get",
      "bindings": 2,
      "sql": "SELECT revision, added_by FROM v2_change_request_evidence WHERE id = ? AND change_request_id = ?"
    },
    {
      "id": "Q22",
      "port": "run",
      "bindings": 1,
      "sql": "DELETE FROM v2_change_request_evidence WHERE id = ?"
    },
    {
      "id": "Q23",
      "port": "all",
      "bindings": 2,
      "sql": "SELECT * FROM v2_change_requests WHERE ws_id = ? AND goal_id = ? ORDER BY updated_at DESC, id"
    },
    {
      "id": "Q24",
      "port": "all",
      "bindings": 1,
      "sql": "SELECT * FROM v2_change_requests WHERE ws_id = ? ORDER BY updated_at DESC, id"
    }
  ],
  "direct_literal_refusal_arguments": [
    {
      "factory": "badRequest",
      "arguments": [
        "changes must be an object with title, measures, depends_on, status or limits"
      ]
    },
    {
      "factory": "badRequest",
      "arguments": [
        "changes must name at least one of title, measures, depends_on, status or limits"
      ]
    },
    {
      "factory": "notFound",
      "arguments": []
    },
    {
      "factory": "forbidden",
      "arguments": [
        "read_only",
        "Viewers can look but not change anything."
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "own_goal",
        "You own this goal. Save a new version instead."
      ]
    },
    {
      "factory": "conflict",
      "arguments": [
        "goal_not_active",
        "This goal is achieved or dropped, so it takes no change requests."
      ]
    },
    {
      "factory": "conflict",
      "arguments": [
        "already_open",
        "You already have an open change request on this goal."
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "not_an_approver",
        "Only someone who can approve for this goal can do this."
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "not_a_launcher",
        "Only someone who can approve for this goal, or a workspace owner, can launch it."
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "not_requester",
        "Only the person who asked can do this."
      ]
    },
    {
      "factory": "conflict",
      "arguments": [
        "no_change",
        "This request no longer changes anything."
      ]
    },
    {
      "factory": "conflict",
      "arguments": [
        "no_condition",
        "This request has no condition to acknowledge."
      ]
    },
    {
      "factory": "conflict",
      "arguments": [
        "already_acknowledged",
        "You already confirmed this condition."
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "not_involved",
        "Only the person who asked or someone who can approve can add evidence."
      ]
    },
    {
      "factory": "forbidden",
      "arguments": [
        "not_evidence_author",
        "Only the person who added this link can remove it."
      ]
    }
  ]
}
```


# Exact supplied interfaces and stored records

These are the consuming-service interfaces. Pass exactly these arguments, in
order, with undefined receivers. Preserve each supplied return and failure.
Do not add a principal, workspace, time, options object or audit metadata argument
when it is absent from the table. This supplements the behaviour and projection
contract.

| Resource | Exact arguments and result |
| --- | --- |
| all | SQL string, then positional binds; returns row array |
| get | SQL string, then positional binds; returns row or undefined |
| run | SQL string, then positional binds |
| tx | one synchronous callback; caller awaits the resulting transaction |
| audit | workspace id, actor id, action string, object id, time; exactly five |
| V2Error | exact supplied class for instanceof, retained directly |
| badRequest | message, returning the value to throw |
| conflict | code, message, returning the value to throw |
| forbidden | code, message, returning the value to throw |
| notFound | no arguments, returning the value to throw |
| event | event name, object with ws,user,at; exactly two |
| newId | literal cr for a request or ev for a link |
| nowIso | no arguments |
| effectiveSet | current goal row, original requester id; returns person-id array |
| launchSet | current goal row, original requester id; returns person-id array |
| contentOf | goal row; returns goal content |
| dependencyCycle | workspace id, goal id, dependency-id array |
| goalObj | goal row; opaque result is supplied to canReadGoal |
| goalRow | workspace id, goal id |
| goalsDependingOn | workspace id, goal id; returns the original Set of ids |
| nextContent | principal, goal id, base content, submitted changes object, keep-dependencies array, loopOk boolean; exactly six |
| sameContent | content A, content B |
| unreadableGoals | principal, dependency-id array; returns hidden ids |
| versionContentOf | workspace id, goal id, version number |
| visibleGoal | principal, goal id |
| writeGoalVersion | current goal row, approved content, acting launcher id, time, approving person id; exactly five; returned row has version |
| canReadGoal | principal, result of goalObj(goal row) |
| memberName | person id; exactly one |
| memberPrincipal | workspace id, person id; returns that person's principal |
| nameTo | person id, reader id |
| assertRevisionReached | literal request, parsed sent revision or undefined, current revision |
| nonNegInt | original body object, literal base_version |
| optStr | original body object, literal note, number2000 |
| revisionRead | original body object, literal true |
| str | original body object, literal reason or note or condition, number2000 |
| EVIDENCE_PER_REVISION | captured numeric resource, never a call or replacement literal |
| evidenceCount | change-request id, revision number |
| evidenceInput | original body object; returns kind,url,label |
| evidenceRows | change-request id; returns original evidence-row array |
| evidenceView | evidence row, can-remove boolean |
| recordSnapshot | workspace id, goal id, time; returns serialized snapshot |
| snapshotView | principal, stored snapshot_json or null, revision number |
| counterNoChange | base version, current goal version |
| counterSameAsRequest | requester name already obtained from memberName, base version, current goal version |

No resource is called during factory construction. Only the four specified
public async operations await tx. insertChangeRequest remains synchronous and
owns no transaction; its caller owns the transaction and snapshot lifecycle.
All refusal sites throw the exact factory result, even a non-Error or falsy
value. A nextContent failure is remapped for a counter only when it is an
instance of the exact captured V2Error and its code is exactly no_change.

The principal uses wsId,userId,wsRole. Each audience principal returned by
memberPrincipal must be used as returned, not replaced by the acting principal.
Read permission uses goalObj then canReadGoal at the specified call sites.
goalsDependingOn returns a Set with its original native receiver and iteration
order; do not replace has with an array includes protocol.

GoalRow uses id,ws_id,owner_id,title,status,version and its other original fields.
GoalContent includes title,measures,depends_on,status,limits and the original
unchanged content fields such as anchors and target_share. Only the five
CHANGE_KEYS may be proposed. Applying changes is a shallow base-then-changes
spread, retaining all other content and aliases. Do not rebuild an abbreviated
content object or silently replace null, undefined, zero or empty values.

ChangeRequestRow fields are id,ws_id,goal_id,requester_id,state,revision,
base_version,changes_json,reason,approved_by,rejected_by,decision_note,version,
created_at,updated_at,decided_at,approved_without_evidence,launch,approved_json,
launch_by,launch_at. Stored field names are not public projection names. The
request's launch_decided_by and launch_decided_at projection come from launch_by
and launch_at. approved_json stores full approved GoalContent; changes_json
stores only the requested Changes. version is null until publication.

RevisionRow uses revision,base_version,changes_json,note,author_id,created_at,
snapshot_json,condition,acknowledged_by,acknowledged_at. The latest counter is the
last revision whose note is not null, including an undefined note if supplied by
an older record. It is selected by copied-array reverse then find. A rebase or
first revision with note null does not replace its counter's condition.

Evidence rows use id,revision,kind,url,label,source,added_by,added_at along with
their owning workspace and request fields. A revision and author comparison uses
those stored fields directly. Public added_by is supplied by evidenceView;
do not substitute acting-user ownership when reading or removing another link.

writeGoalVersion owns version writes, directives and superseding related
requests. Set the current request's launch to launched before calling it so
its reentrant superseding step leaves that request alone. Read the returned
version, update the request, audit and emit first_launch afterward. Passing the
launcher as the final approver argument loses the approval author and is refused.
Approval, counter, condition acknowledgement, not-yet and evidence operations
never call writeGoalVersion themselves.

Call recordSnapshot during writeRevision's INSERT argument evaluation, using
workspace, goal id and that revision's time. No body snapshot reaches this call.
Snapshot and link projection implementations remain supplied ports; do not
reimplement or relabel them verified. Keep every original class identity, array
and JSON protocol, optional-body check and native failure position from the main
contract.


# Exact public arguments and observable service protocol

Preserve the following details when implementing the earlier behavioral
requirements. Equal primitive values do not make different supplied-row reads
interchangeable. Getters, arrays, refusal factories and service calls can fail
at each access. Read order and native thrown values are part of this interface.
The original source, frozen expectations and failed first candidate stay intact.

## Public argument and return contracts

| Operation | Arguments in order | Result |
| --- | --- | --- |
| dependencyChoices | principal, goal id, optional counter request id | ids or null |
| dependencyLoops | principal, goal id, optional counter request id | ids or null |
| counterBase | principal, goal id, optional counter request id | five content fields or null |
| versionLoops | principal, goal id, canEdit | ids or null |
| insertChangeRequest | principal, goal row, changes, reason, time | new request id |
| createChangeRequest | principal, goal id, body | Promise of fresh request view |
| actOnChangeRequest | principal, goal id, request id, action, body | Promise of fresh request view |
| addEvidence | principal, optional path goal id, request id, body, source | Promise of {evidence,change_request} |
| removeEvidence | principal, optional path goal id, request id, evidence id | Promise of fresh request view |
| listChangeRequests | principal, opts defaulting to a fresh empty object | view array |
| changeRequestGroups | principal, optional state string or null | waiting_on_me, mine, others |
| getChangeRequest | principal, request id, optional path goal id | view |
| assertChangeRequestAction | candidate action string | validated string, or throws supplied notFound result |
| requestCondition | request id | condition or null |

Listing options have the camel-case property goalId and a state property.
Groups take a state, call listChangeRequests with {state}, then filter that
result. Mine and others both exclude waiting_on_me before reading requester.id
or principal.userId. They do not take a precomputed view array. A valid action
validator returns the input. The invalid action validator throws notFound,
without constructing a badRequest sentence. The action transaction's switch
has no default validation: an unknown action supplied directly performs its
normal preamble and commits without a decision, then builds the fresh view.

visibleRequest receives principal, request id, optional path goal id. Query by
principal workspace and request id. Only a truthy path goal id checks row.goal_id
for equality. After that check, visibleGoal receives a fresh row.goal_id read,
even if it equals the supplied path goal id. Missing rows fail before visibility.

State filtering receives the once-read opts.state value. Undefined, null and
empty string mean no state restriction. Otherwise use the live states array and
the existing badRequest sentence. For a truthy opts.goalId, read it again for
visibleGoal. Read opts.goalId separately for selecting the query and for its
binding. For each request, apply state filtering before goal readability. Pass
a once-read primitive goal id to the listing permission-cache helper. That
helper checks Map.has, reads the goal only once when absent, stores false for a
missing goal without invoking goalObj, then returns Map.get.

## Dependency and content helpers

changesIn preserves individual comparisons in this sequence: title, measures,
depends_on, status, limits. Each changed value is read again for assignment.
Unknown-key detection uses the first key found, and throws only if that key is
truthy. Preserve that distinction for an empty-string unknown key. Native JSON
and native sort failures propagate. The default keep list is evaluated from
base.depends_on on entry when omitted.

Use primitive query helpers for request row, open request, and revision rows.
The revision writer receives workspace, goal id, request id, revision, base
version, changes, note, author, time, and optional condition defaulting to null.
It uses those captured primitives inside its INSERT. Reading principal or goal
rows inside this writer adds accesses that the interface does not require.
The recordSnapshot call occurs while evaluating the INSERT arguments, after
the captured author and time and before the condition.

hiddenAddedDependency receives workspace, already-present ids, changes object,
readers. Its added list uses changes.depends_on with nullish fallback to [] and
filters against already. Return null immediately for an empty added list,
before calling memberPrincipal or unreadableGoals. The assertion wrapper receives
workspace, base content, changes, readers, wording kind, optional already list
defaulting to base.depends_on. A hidden result throws conflict with code
dependency_not_visible for all proposal, counter and counter-approver paths.

hiddenDependencyRefusal receives principal, request row, and kind approve or
launch. Approval parses changes_json and takes depends_on with nullish []
fallback. Launch first tests approved_json, parses it only if truthy, otherwise
uses []. Load base version with request-row ws_id, goal_id, base_version. After
unreadableGoals finds an added hidden dependency, read row.requester_id and
principal.userId as primitive arguments to the requester-sensitive wording
helper. Do not read principal workspace in place of row workspace.

dependencyLoop receives request row, goal row and captured reader id. Pending:
parse changes_json, test its depends_on, return null if falsy, otherwise read
that property again for the local list. Approved: require state approved,
then launch pending or launch not_yet, then truthy approved_json, then equal
goal.version and row.base_version, in that order. Parse approved content only
after those guards. A nonempty dependency list calls dependencyCycle using row
ws_id then row goal_id. Loop wording tests state approved again and uses the
primitive reader. The caller throws conflict with code cycle for this refusal.

dependencyAddedBy receives an already-loaded revision array and a dependency id.
Inspect each revision's parsed changes.depends_on with optional includes. Keep
the first author in the latest uninterrupted run containing that dependency,
resetting to null for any revision not containing it. Do not fetch base versions
or merge base content into those checks.

For form helpers, after visibleGoal, use goal.id at later goal identity sites.
dependencyChoices uses it for goalsDependingOn and the candidate query binding.
dependencyLoops and versionLoops pass it to readableLoops. readableLoops skips
a missing goal before goalObj. counterBase evaluates principal workspace, goal.id,
then a separately reread request row's base_version for versionContentOf. It
computes unreadableGoals once on base.depends_on, then returns exactly title,
measures, filtered depends_on, status, limits in that order. Other base fields
are not spread into that result.

## Creation and all action writes

Creation's open-request queries and changesIn call read the original visible
goal's id, rather than substituting the path's equal string. The locked reread
uses principal.wsId and that original goal.id. Compare current.version to a
fresh original goal.version read, rather than to the body base-version local.
Then test current.status, check open requests using the original goal.id again,
and assert dependency visibility with principal workspace, contentOf(current),
changes, effectiveSet(current, principal.userId), proposal wording. Do not add
an extra principal workspace read inside that assertion wrapper. Insertion's
revision call captures workspace, goal.id, new request id, revision 1, goal.version,
changes, null note, principal.userId and time before entering the writer.

The action preamble's visibleRequest must retain the separate row.goal_id read
described above. Inside tx, current goal lookup uses principal workspace and
current request row.goal_id. Capture requester by reading row.requester_id;
effectiveSet also receives a separate requester read. State-refusal helpers take
the captured reader string rather than the principal. Every wrong-state refusal
uses conflict code wrong_state. The counter-author helper reads row.state first,
and only countered reads id and revision for the author query, defaulting absent
author to null. A countered state-refusal branch uses this same helper and thus
reads state again. Approved and rejected refusal wording retains separate field
reads for equality, truthiness and memberName.

Revision validation first performs the parsed revisionRead/assertRevisionReached
preamble. Optional and required stale checks later reread body.revision:
required-or-body-present, then a separate body.revision comparison to row.revision.
They do not compare the parsed sent local here. The stale helper uses the same
state-gated counter-author lookup and the captured reader.

After the action preamble, all decision queries, writes, evidenceCount and audit
object arguments read row.id at the actual call site. Passing the path's equal
request id to a logging helper removes observable reads. Every audit reads fresh
principal workspace and row.id, while using the captured actor and time.

Approval's missing-evidence marker is the integer 1 or 0, computed after
evidenceCount(row.id,row.revision). Record the approval and its optional second
audit before first_approval. Dependency and loop refusals use conflict codes
dependency_not_visible and cycle, both status409.

Launchable checks state approved before reading launch for the already-launched
case; state superseded before launch superseded for the superseded case; then
state approved, then current base version. All three state cases use wrong_state.
The repeated not_yet refusal also uses wrong_state. Capture writeGoalVersion's
returned row, then evaluate written.version before row.id for the version update.

Counter preserves these body checks: optional condition uses separate undefined
and null reads; no-condition equality means condition === null. The optional
changes object tests its live depends_on value for undefined, not own-property
presence. Only after that test compute the hidden-base list for comparison.
If the hidden lists differ, call unreadableGoals on base.depends_on again and
use that second hidden-base list when constructing the copied input. Do not
compute it before the object/array/property short circuits. The base lookup
and changesIn use current goal.id. Dependency assertions remain separate, with
principal workspace evaluated before each. Compute the primitive next revision
once. The writer receives principal workspace, goal.id, row.id, next,
row.base_version, computed changes, note, captured actor/time, condition.

Acknowledgement compares live body.revision twice when present and records audit
action change_request.condition_acknowledged. Accept-counter records
change_request.counter_accepted. Rebase rereads body.changes when selecting
whether to attribute a hidden dependency; it compares the attributed author
against row.requester_id. Its revision writer and base-version update read
goal.version after computing next, rather than reusing the submitted version.
No acknowledgement is added as an approval or launch prerequisite.

## Evidence identity, failure codes and returns

Adding evidence reads goal with current request row.goal_id. The involvement
test reads row.requester_id before principal.userId. Stale checks directly read
body.revision and never add a revisionRead call within this operation. All URL,
count, insert, update and audit request-id bindings use fresh row.id reads.
After commit, build one fresh full view. Return a two-field object in order:
evidence is the new matching link in its flattened revisions; change_request is
that same complete view. Do not return just the link.

Removing evidence queries the link using evidence id and fresh row.id. After
missing and different-author checks, use the shared mayRemoveEvidence predicate,
including its role, open-state, revision and identity short circuits. A false
result throws conflict code evidence_frozen. Its message tests isOpen again,
then uses either revision wording or state-refusal wording with principal.userId.
Do not split it into a differently coded frozen-revision check and wrong-state
check. The final writes and audit retain fresh row.id reads.

## Full view evaluation and privacy

The complete view uses this evaluation sequence, before its first returned field:

1. goalRow(row.ws_id,row.goal_id); define local readable/shown/hidden-count/pick
   helpers without invoking them. Readable skips missing goals and uses row
   workspace for each candidate. Shown tests the live content.depends_on,
   spreads the content, then rereads that list for readable when truthy.
2. Parse changes; select fields by key-in-changes in CHANGE_KEYS order; read base
   with row workspace/goal/base_version; optionally read approved resulting
   version with row workspace/goal/version; select after with nullish fallback.
3. effectiveSet, launchSet, captured principal.userId, requester flag, approver
   flag, captured open-state flag, captured unlaunched flag. Unlaunched requires
   state approved then launch pending or launch not_yet, retaining repeated
   launch reads. These captured flags avoid extra later supplied-row accesses.
4. Read revision rows using primitive row.id; find latest note-non-null counter;
   build condition and its optional acknowledger person. Person receives one
   primitive id and returns null for falsy ids, otherwise id/memberName.
5. Approvable tests state pending, captured approver, row.base_version against
   goal.version, then principal role not viewer. Launchable tests captured
   unlaunched, launchers.includes(captured reader), base version equality, role.
   Hidden refusal is conditional on those flags. Loop is computed separately
   with a fresh principal.userId read as its primitive reader argument.
6. Build can in its original eleven-field order. approve_and_launch uses exactly
   the same eligibility predicate as approve. Reject/withdraw reuse captured
   open; counter/accept/rebase read state at their own tests. Acknowledge tests
   pending-or-approved, captured requester, truthy condition, then not
   condition.acknowledged_by. Add evidence uses the shared predicate. Not-yet
   depends on captured launchable and launch not not_yet, without hidden/loop.
   Clear flags for viewer in Object.keys order.
7. Fetch evidence using row.id. Fully map the previously loaded revision rows
   now, before reading the returned view's id. Each revision keeps field order
   revision, base_version, shown parsed changes, note, condition, acknowledger,
   acknowledged_at, author through the nullable person helper, created_at,
   filtered/mapped evidence, snapshot. Pass snapshot_json unchanged to
   snapshotView, followed by revision; do not default undefined to null.

The returned view keeps the earlier listed field order. It reuses captured
open for behind and the precomputed revisions array. Diff computes before pick,
then after pick, then hidden counts. Each pick first reads every selected content
field into Object.fromEntries, then applies shown once. Hidden counts each invoke
the readable filter again on the corresponding complete dependency list. Do not
cache those read/permission effects or infer the count from a previously filtered
pick. Approvers/launchers map through the same primitive person helper.
state_note takes the captured reader, not a fresh principal read. waiting_on_me
short-circuits approve, accept_counter, launch, then truthy loop, state pending,
row.base_version equal goal.version, and can.counter in that order.

All of these are original observable semantics. The same-agent clarification
does not certify an implementation. Normal qualification, fresh admission,
complete source review, both-host caller/store checks and parent gates remain
required before source authority can transfer.


# Keep exact predicates, reads and refusal identifiers

Do not add eligibility restrictions or replace refusal codes with synonyms.
The following details were still missing from the second refused candidate.
This section specifies original behavior and leaves the frozen acceptance
corpus unchanged. No failed implementation is patched for admission.

## Refusal identifiers

Every goal-version mismatch during creation, approval, launch or rebase uses
stale_version. Every request/condition/evidence stale-revision refusal uses
stale_revision. There are no version_conflict or revision_conflict identifiers.
Wrong action state uses wrong_state; dependency visibility uses
dependency_not_visible; a dependency loop uses cycle. Keep the original error
factories, status and sentences with these exact codes.

## Content and action evaluation

changesIn calls Object.keys on the supplied changes object once and retains the
result. Test that array's length and find its first unknown key in that same
array. A second Object.keys call adds another observable ownKeys operation.

Approval's goal/base version comparison reads goal.version first, then request
base_version. Launchable has the same goal-first version comparison. Maintain
that order even though numeric inequality is symmetric.

Launchable's superseded special sentence requires both state superseded AND
launch superseded. Check the state first and read launch only when that state
matches. A pending or countered request must reach normal state-refusal wording,
without an extra launch read. Do not use OR for this guard.

Every action's allowed-state guard reads request.state exactly once and checks
native includes against its allowed-state list. This includes acknowledge with
[pending,approved], reject and withdraw with [pending,countered]. The shared
isOpen helper retains its two short-circuit state reads where the original uses
it in evidence predicates and view setup. It does not replace these action
membership guards. View can predicates also retain their own specified reads.

For counter visibility checks, first construct the shared already-present list
by spreading base.depends_on and then current.depends_on once. Only afterward
evaluate the first assertion's principal workspace and requester arguments.
Reuse that same list in the second assertion. Computing an inline list after
the assertion's earlier arguments, or constructing it twice, changes the reads.

Rebase always makes one changesIn call with six explicit arguments, in order:
principal, goal.id, contentOf(goal), either retained changes or live body.changes
according to the captured own flag, a second contentOf(goal).depends_on, and
the own flag. This applies to the new-body-changes branch too. Omitting the
fifth/sixth arguments in that branch removes a required second contentOf call
and changes evaluation order through the default argument.

## No additional view eligibility

can.rebase is exactly state pending AND captured isRequester. It is available
even when base_version already equals current goal version. Do not add a
behind/current-version restriction. The distinct behind field retains its
original open-and-version-different rule.

All eleven can fields remain as already specified, with no extra predicates.
approve_and_launch has the same view predicate as approve. Conditions and
evidence remain advisory for approval and launch.

## Exact fallback and standalone condition projection

Approval dependency reads use parsed changes.depends_on with nullish [] fallback.
For launch, a truthy approved_json is parsed and its depends_on used directly,
without an extra nullish fallback on that parsed property. A falsy approved_json
alone selects []. Keep native malformed-data failures at their original site.

State-filter absence is only undefined, null or empty string. Other supplied
values, including false and zero, must reach live states-array validation and
the existing badRequest sentence. They are not an omitted filter.

The standalone requestCondition helper has an inline acknowledger projection:
read the selected counter's acknowledged_by for truthiness; if truthy, read it
again for the returned person's id, and again for memberName. Then read
acknowledged_at. Passing one already-read primitive to the view's person helper
would remove two supplied-row reads. The full request view does use that person
helper at its already specified sites; preserve that separate protocol.

An in-memory diagnostic is used only to isolate these differences. Its output
is not an admitted or qualified implementation. Fresh normal generation, two
clean qualification runs, separate admission and full acceptance remain required.

# Supplied content comparison argument positions

The supplied sameContent function is an ordered resource interface. Its arguments
are observable even when the current application implementation compares content
symmetrically. Preserve these two call sites exactly in meaning and evaluation:

- Approval first builds the proposed full content by applying request changes to
  a fresh contentOf(goal) result. Pass that proposed content as the first
  sameContent argument, and a second fresh contentOf(goal) result as the second
  argument. Do not reverse those arguments or reuse the first content lookup.
- Countering, when the condition is null, passes the full counterproposal formed
  by applying proposed changes to the revision base as the first sameContent
  argument. Pass the previously formed full current request content as the
  second argument. Preserve short-circuiting when the condition is non-null.

Retain both supplied comparison call positions, refusal behavior and all prior
query, projection and transaction ordering. The fifth generated candidate is
preserved unchanged. Its comparison argument reversal is diagnosed against the
complete frozen corpus. Any in-memory diagnostic remains private and does not
qualify or admit a patched candidate. Only authored intent changes; normal signed
promotion, clean generation and independent acceptance remain required.

# Pending-state wording keeps the original revision traversal

To select wording for a pending request, query the revision rows through the
existing ordered revision-query helper. Make a native spread copy of that
supplied array, reverse the copy, and find the first revision whose note is
not null. Use the truthiness of that found revision to choose between the
already-accepted-counter wording and the ordinary waiting-for-approval wording.

Do not mutate the supplied array. Do not replace this sequence with some,
every, a forward find, a manually indexed traversal, a precomputed flag, or a
second query. Native spread reads the supplied array's length and elements
before reverse/find touches the new plain array. Preserve those getter reads,
ordering and failures, including empty arrays and earlier revision rows.

The view's counter selection, condition acknowledgement and standalone
condition reading retain their already specified copy/reverse/find behavior.
All other state wording and the sameContent argument positions stay in force.

The sixth generated candidate remains preserved. It used some directly on the
supplied revision array for pending wording. A private in-memory diagnostic
changing this one traversal matches all 5,524 frozen original records. It is
not a qualified or admitted patch. A new signed intent, two clean generations,
separate fresh admission and the later integration gates remain required.

# Evidence eligibility uses the already loaded approval set

The private evidence-add eligibility helper takes three primitive arguments:
principal, request row, and the existing approval-set array. The view has
already called effectiveSet for its loaded goal and requester before building
its can object. Pass that same held approvers array as the helper's third
argument when computing can.add_evidence.

The helper tests principal.wsRole against viewer, then the existing isOpen
helper on the request row, then requester_id against a fresh principal.userId.
Only when that final comparison fails, invoke includes on the supplied
approvers array with another fresh principal.userId read. Keep that ordered
short-circuiting. Do not load a goal or call effectiveSet inside this helper.
Do not replace the held array, its identity or its observable includes reads.

This rule is local to evidence eligibility in the view. Countering and rebasing
still make the fresh effectiveSet calls at the distinct sites already specified.
Evidence addition itself retains its separate locked permission check.

The seventh intent's first clean run passed; its second output introduced
additional goalRow/effectiveSet calls inside this helper and was refused. Both
outputs and the failed qualification are preserved. The complete second
30,163-byte factory was read. A private in-memory diagnostic that restores this
helper boundary matches all 5,524 frozen records and is not an admitted patch.
Fresh normal promotion, two clean generations and separate admission remain
required. No original source or private expectation changes.

# Every launch decision calls the supplied launch set

The private launcher-only guard calls launchSet with the held loaded goal and a
fresh request-row requester_id read. It then invokes includes on the returned
array with the captured actor. When that test fails, throw the existing
forbidden("not_a_launcher",...) result with its original message. Preserve
returned and thrown refusal identity and each supplied-array read.

Call this guard at each existing action site: approve_and_launch after approval
has completed, launch before its launchability check, and not_yet before its
launchability check. Do not replace launchSet with isApprover, wsRole, a union
constructed locally, or a cached view's launchers. The supplied function is the
authorization authority and may reflect current policy or a changed audience.

In approve_and_launch, approval SQL, audit and first_approval event occur before
this fresh guard. A refusal or failure at this position rolls back the same
transaction and prevents the goal-version publication. Preserve that order.
The other actions retain their own original subsequent checks and effects.

The ninth generated candidate replaced the guard with isApprover and an owner
role test. Its complete 37,053-byte, 565-line source remains preserved and was
reviewed. A private one-site in-memory diagnostic restoring the supplied
launchSet call matches all 5,524 frozen records. That diagnostic is not an
admitted candidate. A new signed intent and the full clean-generation and
fresh-admission sequence remain required. No frozen cases or expectations change.


#### Scenario: Record proposed goal changes, separate approval and publication, preserve evidence and private-safe decisions

- **WHEN** the Node change-request target is selected
- **THEN** Capture44 resources once and preserve17 runtime values,5 public caller types and24 SQL programs. Retain six request states,ten actions,four launch states,proposal/base/revision races,one open request per goal/requester,five allowed change keys,exact effective approval and launch audiences,hidden dependency preservation and current read checks,decision-time cycles,own-changes rebase loop exception and counter author attribution,separate approval/not-yet/publication with reentrant goal version effects,advisory evidence and unacknowledged conditions,server-only revision snapshots,link ownership/duplicates/supplied bound/frozen revisions,full projections/groups/private diffs and exact class/throw/read/effect/transaction/audit/event order. Supply exact resource argument positions and stored fields,including approval author on launch. No ambient clock or IO.
